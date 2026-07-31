"""Graph writes shared by the HTTP API, the ingestion pipeline and MCP tools."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import ActivityLog, Edge, Node, NodeKind, Relation, new_id, utcnow

# Layout constants for auto-placing extracted nodes around their source asset.
COLUMN_WIDTH = 330.0
ROW_HEIGHT = 132.0


def log_activity(
    db: Session,
    *,
    board_id: str,
    actor: str,
    action: str,
    subject_id: str = "",
    detail: dict | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        id=new_id("act"),
        board_id=board_id,
        actor=actor,
        action=action,
        subject_id=subject_id,
        detail=detail or {},
    )
    db.add(entry)
    return entry


def create_node(
    db: Session,
    *,
    board_id: str,
    kind: str,
    title: str,
    body: str = "",
    x: float = 0.0,
    y: float = 0.0,
    created_by: str = "",
    evidence_class: str = "asserted",
    source_asset_id: str | None = None,
    source_page: int | None = None,
    source_quote: str = "",
    confidence: float | None = None,
    extraction_revision: int = 0,
) -> Node:
    node = Node(
        id=new_id("nod"),
        board_id=board_id,
        kind=kind,
        title=title.strip()[:400],
        body=body,
        x=x,
        y=y,
        created_by=created_by,
        evidence_class=evidence_class,
        source_asset_id=source_asset_id,
        source_page=source_page,
        source_quote=source_quote,
        confidence=confidence,
        extraction_revision=extraction_revision,
    )
    db.add(node)
    return node


def connect(
    db: Session,
    *,
    board_id: str,
    source_id: str,
    target_id: str,
    relation: str = Relation.supports.value,
    created_by: str = "",
) -> Edge | None:
    """Idempotent on (source, target, relation). Self-links are rejected."""
    if source_id == target_id:
        return None
    existing = (
        db.query(Edge)
        .filter(
            Edge.source_id == source_id,
            Edge.target_id == target_id,
            Edge.relation == relation,
        )
        .one_or_none()
    )
    if existing is not None:
        return existing
    edge = Edge(
        id=new_id("edg"),
        board_id=board_id,
        source_id=source_id,
        target_id=target_id,
        relation=relation,
        created_by=created_by,
    )
    db.add(edge)
    return edge


def creates_task_cycle(db: Session, source_id: str, target_id: str) -> bool:
    """Task dependency edges must stay acyclic. Knowledge relations may cycle."""
    seen: set[str] = set()
    stack = [target_id]
    while stack:
        current = stack.pop()
        if current == source_id:
            return True
        if current in seen:
            continue
        seen.add(current)
        for edge in db.query(Edge).filter(Edge.source_id == current).all():
            stack.append(edge.target_id)
    return False


def touch(node: Node) -> None:
    node.revision += 1
    node.updated_at = utcnow()


def place_promoted_nodes(
    anchor_x: float,
    anchor_y: float,
    kinds: list[str],
    taken_rows: dict[str, int],
) -> list[tuple[float, float]]:
    """Position nodes a user just promoted: findings in one column, constraints in the next.

    Rows continue below whatever the asset already produced, so promoting in several
    passes stacks neatly instead of overlapping. Positions are assigned once here and
    then belong to the user, so a re-parse never moves anything they arranged.
    """
    columns = {NodeKind.finding.value: 1, NodeKind.constraint.value: 2}
    rows = dict(taken_rows)
    positions: list[tuple[float, float]] = []
    for kind in kinds:
        row = rows.get(kind, 0)
        rows[kind] = row + 1
        column = columns.get(kind, 1)
        positions.append((anchor_x + COLUMN_WIDTH * column, anchor_y + row * ROW_HEIGHT))
    return positions


def task_description_paragraphs(task: Node, lineage_titles: list[str]) -> list[str]:
    paragraphs = [task.body.strip() or "Created on the Spatial Brain canvas."]
    if lineage_titles:
        paragraphs.append("Context from the knowledge graph:")
        paragraphs.extend(f"- {title}" for title in lineage_titles[:12])
    paragraphs.append(f"Canvas task id: {task.id}")
    return paragraphs


KIND_VALUES = {kind.value for kind in NodeKind}
