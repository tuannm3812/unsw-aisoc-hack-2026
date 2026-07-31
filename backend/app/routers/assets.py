from __future__ import annotations

import hashlib
import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from ..auth import board_for_user, current_user
from ..config import settings
from ..db import SessionLocal, get_db
from ..models import Asset, Node, NodeKind, ParseState, Relation, User, new_id
from ..schemas import AssetOut, ExtractionResult
from ..services.graph import connect, create_node, log_activity, place_extracted_nodes
from ..services.mistral_service import (
    MistralError,
    count_pdf_pages,
    mistral_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/boards", tags=["assets"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
TEXT_SUFFIXES = {".md", ".markdown", ".txt", ".rst"}
PDF_SUFFIXES = {".pdf"}


@router.post(
    "/{board_id}/assets",
    response_model=AssetOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_asset(
    board_id: str,
    background: BackgroundTasks,
    x: float = 0.0,
    y: float = 0.0,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Asset:
    board_for_user(db, board_id, user)

    filename = file.filename or "untitled"
    suffix = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if suffix not in TEXT_SUFFIXES | PDF_SUFFIXES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Drop a PDF, Markdown or plain text file",
        )

    payload = await file.read()
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Files are limited to {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )

    content_hash = hashlib.sha256(payload).hexdigest()
    asset_id = new_id("ast")
    stored_path = settings.storage_dir / f"{asset_id}{suffix}"
    stored_path.write_bytes(payload)

    asset = Asset(
        id=asset_id,
        board_id=board_id,
        filename=filename,
        media_type=file.content_type or "",
        byte_size=len(payload),
        content_hash=content_hash,
        stored_path=str(stored_path),
        page_count=count_pdf_pages(payload) if suffix in PDF_SUFFIXES else 0,
        parse_state=ParseState.parsing.value,
        uploaded_by=user.id,
    )
    db.add(asset)

    # The asset node appears immediately so the canvas can show progress on it.
    create_node(
        db,
        board_id=board_id,
        kind=NodeKind.asset.value,
        title=filename,
        body=f"{len(payload) // 1024} KB source document",
        x=x,
        y=y,
        created_by=user.id,
        evidence_class="observed",
        source_asset_id=asset_id,
    )
    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="asset.uploaded",
        subject_id=asset_id,
        detail={"filename": filename},
    )
    db.commit()

    background.add_task(_parse_asset, asset_id, suffix, user.id)
    return asset


@router.post("/{board_id}/assets/{asset_id}/reparse", response_model=AssetOut)
async def reparse_asset(
    board_id: str,
    asset_id: str,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Asset:
    board_for_user(db, board_id, user)
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.board_id == board_id).one_or_none()
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    asset.parse_state = ParseState.parsing.value
    asset.parse_error = ""
    db.commit()

    suffix = ("." + asset.filename.rsplit(".", 1)[-1].lower()) if "." in asset.filename else ""
    background.add_task(_parse_asset, asset_id, suffix, user.id)
    return asset


async def _parse_asset(asset_id: str, suffix: str, actor_id: str) -> None:
    """Run Mistral extraction and write the result as nodes. Owns its own session."""
    db = SessionLocal()
    try:
        asset = db.get(Asset, asset_id)
        if asset is None:
            return

        try:
            raw = open(asset.stored_path, "rb").read()
            if suffix in PDF_SUFFIXES:
                result = await mistral_service.extract_from_pdf(raw, asset.filename)
            else:
                text = raw.decode("utf-8", errors="replace")
                asset.markdown = text[:200_000]
                result = await mistral_service.extract_from_text(text)
        except MistralError as exc:
            asset.parse_state = ParseState.failed.value
            asset.parse_error = str(exc)[:1000]
            db.commit()
            logger.warning("Extraction failed for %s: %s", asset.filename, exc)
            return
        except OSError as exc:
            asset.parse_state = ParseState.failed.value
            asset.parse_error = f"Could not read the stored file: {exc}"
            db.commit()
            return

        _write_extraction(db, asset, result, actor_id)
    finally:
        db.close()


def _write_extraction(
    db: Session,
    asset: Asset,
    result: ExtractionResult,
    actor_id: str,
) -> None:
    """One transaction: nodes, edges, asset state. Positions are assigned once."""
    anchor = (
        db.query(Node)
        .filter(Node.source_asset_id == asset.id, Node.kind == NodeKind.asset.value)
        .one_or_none()
    )
    anchor_x = anchor.x if anchor else 0.0
    anchor_y = anchor.y if anchor else 0.0

    revision = asset.extraction_revision + 1
    finding_positions, constraint_positions = place_extracted_nodes(
        anchor_x, anchor_y, len(result.findings), len(result.constraints)
    )

    finding_nodes: list[Node] = []
    for item, (px, py) in zip(result.findings, finding_positions, strict=False):
        node = create_node(
            db,
            board_id=asset.board_id,
            kind=NodeKind.finding.value,
            title=item.title,
            body=item.detail,
            x=px,
            y=py,
            created_by=actor_id,
            evidence_class="extracted",
            source_asset_id=asset.id,
            source_page=item.page,
            source_quote=item.quote,
            confidence=item.confidence,
            extraction_revision=revision,
        )
        finding_nodes.append(node)

    constraint_nodes: list[Node] = []
    for item, (px, py) in zip(result.constraints, constraint_positions, strict=False):
        node = create_node(
            db,
            board_id=asset.board_id,
            kind=NodeKind.constraint.value,
            title=item.title,
            body=item.detail,
            x=px,
            y=py,
            created_by=actor_id,
            evidence_class="extracted",
            source_asset_id=asset.id,
            source_page=item.page,
            source_quote=item.quote,
            confidence=item.confidence,
            extraction_revision=revision,
        )
        constraint_nodes.append(node)

    db.flush()

    if anchor is not None:
        for node in finding_nodes + constraint_nodes:
            connect(
                db,
                board_id=asset.board_id,
                source_id=anchor.id,
                target_id=node.id,
                relation=Relation.derived_from.value,
                created_by=actor_id,
            )

    asset.parse_state = ParseState.parsed.value
    asset.extraction_revision = revision
    if result.summary:
        asset.markdown = asset.markdown or result.summary
    if anchor is not None and result.summary:
        anchor.body = result.summary[:1200]

    log_activity(
        db,
        board_id=asset.board_id,
        actor="mistral",
        action="asset.parsed",
        subject_id=asset.id,
        detail={
            "findings": len(finding_nodes),
            "constraints": len(constraint_nodes),
            "revision": revision,
        },
    )
    db.commit()
