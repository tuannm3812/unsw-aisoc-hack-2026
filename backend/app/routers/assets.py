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
from ..models import (
    Asset,
    Candidate,
    Edge,
    Node,
    NodeKind,
    ParseState,
    Relation,
    User,
    new_id,
)
from ..schemas import (
    AssetOut,
    CandidateOut,
    CandidateSelection,
    ExtractionResult,
    PromotionResult,
)
from ..services.graph import connect, create_node, log_activity, place_promoted_nodes
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
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
TABULAR_SUFFIXES = {".csv", ".json"}
ALLOWED_SUFFIXES = TEXT_SUFFIXES | PDF_SUFFIXES | IMAGE_SUFFIXES | TABULAR_SUFFIXES

# A review list is only useful if it can be read in one sitting. Past this the
# extra proposals are noise, and the highest-confidence ones come first anyway.
MAX_CANDIDATES_PER_KIND = 15


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
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Drop a PDF, image, CSV/JSON, Markdown or plain text file",
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


def _asset_or_404(db: Session, board_id: str, asset_id: str) -> Asset:
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.board_id == board_id).one_or_none()
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    return asset


@router.get("/{board_id}/assets/{asset_id}/candidates", response_model=list[CandidateOut])
def list_candidates(
    board_id: str,
    asset_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[Candidate]:
    """What Mistral proposed from this document, best-supported first."""
    board_for_user(db, board_id, user)
    _asset_or_404(db, board_id, asset_id)
    rows = db.query(Candidate).filter(Candidate.asset_id == asset_id).all()
    return sorted(rows, key=lambda c: (c.kind, -(c.confidence or 0.0), c.title))


@router.post(
    "/{board_id}/assets/{asset_id}/candidates/promote",
    response_model=PromotionResult,
)
def promote_candidates(
    board_id: str,
    asset_id: str,
    selection: CandidateSelection,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PromotionResult:
    """Turn chosen proposals into real nodes, linked back to the document."""
    board_for_user(db, board_id, user)
    asset = _asset_or_404(db, board_id, asset_id)

    chosen = (
        db.query(Candidate)
        .filter(
            Candidate.asset_id == asset_id,
            Candidate.id.in_(selection.candidate_ids),
            Candidate.promoted_node_id.is_(None),
        )
        .all()
    )
    if not chosen:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Those proposals are already on the canvas or no longer exist",
        )
    chosen.sort(key=lambda c: (c.kind, -(c.confidence or 0.0)))

    anchor = (
        db.query(Node)
        .filter(Node.source_asset_id == asset.id, Node.kind == NodeKind.asset.value)
        .one_or_none()
    )
    anchor_x = anchor.x if anchor else 0.0
    anchor_y = anchor.y if anchor else 0.0

    # Rows already used by earlier promotions, so a second batch lands below the
    # first rather than on top of it.
    taken = {
        kind: db.query(Node)
        .filter(Node.source_asset_id == asset.id, Node.kind == kind)
        .count()
        for kind in (NodeKind.finding.value, NodeKind.constraint.value)
    }
    positions = place_promoted_nodes(anchor_x, anchor_y, [c.kind for c in chosen], taken)

    created: list[Node] = []
    for candidate, (px, py) in zip(chosen, positions, strict=True):
        node = create_node(
            db,
            board_id=board_id,
            kind=candidate.kind,
            title=candidate.title,
            body=candidate.body,
            x=px,
            y=py,
            created_by=user.id,
            evidence_class="extracted",
            source_asset_id=asset.id,
            source_page=candidate.source_page,
            source_quote=candidate.source_quote,
            confidence=candidate.confidence,
            extraction_revision=candidate.extraction_revision,
        )
        created.append(node)
        candidate.promoted_node_id = node.id
        candidate.dismissed = False

    db.flush()

    edges: list[Edge] = []
    if anchor is not None:
        for node in created:
            edges.append(
                connect(
                    db,
                    board_id=board_id,
                    source_id=anchor.id,
                    target_id=node.id,
                    relation=Relation.derived_from.value,
                    created_by=user.id,
                )
            )

    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="candidates.promoted",
        subject_id=asset.id,
        detail={"count": len(created), "titles": [n.title for n in created][:8]},
    )
    db.commit()
    for node in created:
        db.refresh(node)
    return PromotionResult(nodes=created, edges=[e for e in edges if e is not None])


@router.post(
    "/{board_id}/assets/{asset_id}/candidates/dismiss",
    response_model=list[CandidateOut],
)
def dismiss_candidates(
    board_id: str,
    asset_id: str,
    selection: CandidateSelection,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[Candidate]:
    """Hide proposals that are not worth keeping, without deleting the record."""
    board_for_user(db, board_id, user)
    _asset_or_404(db, board_id, asset_id)
    rows = (
        db.query(Candidate)
        .filter(
            Candidate.asset_id == asset_id,
            Candidate.id.in_(selection.candidate_ids),
            Candidate.promoted_node_id.is_(None),
        )
        .all()
    )
    for row in rows:
        row.dismissed = True
    db.commit()
    return rows


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
            elif suffix in IMAGE_SUFFIXES:
                result = await mistral_service.extract_from_image(raw, asset.filename)
            elif suffix in TABULAR_SUFFIXES:
                text = raw.decode("utf-8", errors="replace")
                asset.markdown = text[:200_000]
                result = await mistral_service.extract_from_tabular(text, asset.filename)
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


def _normalise(text: str) -> str:
    """Collapse a title to a comparison key, for spotting the same claim twice."""
    return " ".join("".join(c for c in text.lower() if c.isalnum() or c.isspace()).split())


def _valid_page(page: int | None, page_count: int) -> int | None:
    """Keep a page number only if it can actually be opened in the file.

    Models tend to report the page number printed on the page, which for a journal
    paper is often something like 601 in a nine-page PDF. A citation nobody can
    follow is worse than no citation, so an out-of-range value is dropped.
    """
    if page is None or page_count <= 0:
        return None
    return page if 1 <= page <= page_count else None


def _write_extraction(
    db: Session,
    asset: Asset,
    result: ExtractionResult,
    actor_id: str,
) -> None:
    """Store what Mistral proposed. Nothing reaches the canvas without a person.

    Everything is written as candidates against the asset, deduplicated and capped.
    Promotion happens later, from the review panel on the source node.
    """
    anchor = (
        db.query(Node)
        .filter(Node.source_asset_id == asset.id, Node.kind == NodeKind.asset.value)
        .one_or_none()
    )
    revision = asset.extraction_revision + 1

    # A re-parse replaces the proposals but leaves promoted nodes alone: those are
    # the user's now, and deleting them would undo a decision they already made.
    db.query(Candidate).filter(
        Candidate.asset_id == asset.id, Candidate.promoted_node_id.is_(None)
    ).delete(synchronize_session=False)

    seen: set[str] = set()
    counts = {NodeKind.finding.value: 0, NodeKind.constraint.value: 0}
    kept = 0

    promoted_keys = {
        _normalise(candidate.title)
        for candidate in db.query(Candidate).filter(
            Candidate.asset_id == asset.id, Candidate.promoted_node_id.isnot(None)
        )
    }
    seen |= promoted_keys

    for kind, items in (
        (NodeKind.finding.value, result.findings),
        (NodeKind.constraint.value, result.constraints),
    ):
        ranked = sorted(items, key=lambda i: i.confidence or 0.0, reverse=True)
        for item in ranked:
            if counts[kind] >= MAX_CANDIDATES_PER_KIND:
                break
            key = _normalise(item.title)
            if not key or key in seen:
                continue
            seen.add(key)
            db.add(
                Candidate(
                    id=new_id("cnd"),
                    board_id=asset.board_id,
                    asset_id=asset.id,
                    kind=kind,
                    title=item.title[:400],
                    body=item.detail,
                    source_page=_valid_page(item.page, asset.page_count),
                    source_quote=item.quote,
                    confidence=item.confidence,
                    extraction_revision=revision,
                )
            )
            counts[kind] += 1
            kept += 1

    asset.parse_state = ParseState.parsed.value
    asset.extraction_revision = revision
    if result.summary:
        asset.markdown = asset.markdown or result.summary
    if anchor is not None:
        summary = (result.summary or "").strip()
        headline = f"{kept} proposed: {counts['finding']} findings, {counts['constraint']} constraints"
        anchor.body = f"{headline}\n\n{summary}"[:1200] if summary else headline

    log_activity(
        db,
        board_id=asset.board_id,
        actor="mistral",
        action="asset.parsed",
        subject_id=asset.id,
        detail={
            "candidates": kept,
            "findings": counts["finding"],
            "constraints": counts["constraint"],
            "dropped_duplicates": len(result.findings) + len(result.constraints) - kept,
            "revision": revision,
        },
    )
    db.commit()
