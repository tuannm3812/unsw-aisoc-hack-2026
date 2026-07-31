"""Task context: lineage plus a cached Mistral brief.

Shared by the canvas UI and the MCP tools so an agent and a human always see the
same context for a task. The structured lineage is authoritative; the brief is a
convenience layer and is cached against the lineage hash so it cannot go stale
silently when an upstream node changes.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models import Asset, BriefCache, Node, new_id
from ..schemas import LineageOut, TaskBrief
from .lineage import assemble_lineage
from .mistral_service import MistralError, mistral_service

logger = logging.getLogger(__name__)


def _fallback_brief(lineage: LineageOut, reason: str) -> TaskBrief:
    """Deterministic brief so the demo still shows real context without Mistral."""
    findings = [
        f"{node.title} ({node.id})" for node in lineage.nodes if node.kind == "finding"
    ]
    constraints = [
        f"{node.title} ({node.id})" for node in lineage.nodes if node.kind == "constraint"
    ]
    citations = [
        f"{node.source_asset} p.{node.source_page}: {node.source_quote[:160]}"
        for node in lineage.nodes
        if node.source_quote and node.source_asset
    ]
    return TaskBrief(
        objective=lineage.task_title,
        relevant_findings=findings,
        constraints=constraints,
        acceptance_criteria=[],
        open_questions=[reason] if reason else [],
        citations=citations,
        generated_by="lineage-fallback",
    )


async def task_context(
    db: Session,
    task: Node,
    *,
    refresh: bool = False,
) -> tuple[LineageOut, TaskBrief]:
    lineage = assemble_lineage(db, task)

    cached = (
        db.query(BriefCache)
        .filter(BriefCache.task_id == task.id, BriefCache.lineage_hash == lineage.lineage_hash)
        .one_or_none()
    )
    if cached is not None and not refresh:
        return lineage, TaskBrief.model_validate(cached.payload)

    if not mistral_service.enabled:
        return lineage, _fallback_brief(lineage, "MISTRAL_API_KEY is not configured")

    try:
        brief = await mistral_service.build_brief(lineage)
    except MistralError as exc:
        logger.warning("Brief generation failed for %s: %s", task.id, exc)
        return lineage, _fallback_brief(lineage, f"Brief unavailable: {exc}")

    # Replace any stale entry for this task so the cache stays one row per task.
    db.query(BriefCache).filter(BriefCache.task_id == task.id).delete()
    db.add(
        BriefCache(
            id=new_id("brf"),
            task_id=task.id,
            lineage_hash=lineage.lineage_hash,
            payload=brief.model_dump(),
            model=brief.generated_by,
        )
    )
    db.commit()
    return lineage, brief


def lineage_titles(db: Session, lineage: LineageOut) -> list[str]:
    """Human-readable context lines used in the Jira description."""
    titles: list[str] = []
    for node in lineage.nodes:
        if node.depth == 0:
            continue
        label = node.kind.capitalize()
        entry = f"{label}: {node.title}"
        if node.source_asset:
            page = f", p.{node.source_page}" if node.source_page else ""
            entry += f" [{node.source_asset}{page}]"
        titles.append(entry)
    return titles


def asset_filename(db: Session, asset_id: str | None) -> str:
    if not asset_id:
        return ""
    asset = db.get(Asset, asset_id)
    return asset.filename if asset else ""
