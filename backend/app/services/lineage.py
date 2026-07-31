"""Walk a task's ancestry back to the graph roots.

The traversal is the product's core claim: given a task, return every piece of
knowledge that justifies it, with the relation path that got us there. It must be
deterministic and cycle-safe, because agents cite these results and a demo cannot
afford a hang on a graph someone drew a loop into.
"""

from __future__ import annotations

import hashlib
from collections import deque
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from ..config import settings
from ..models import CONTEXT_RELATIONS, Asset, Edge, Node, NodeKind
from ..schemas import LineageEdge, LineageNode, LineageOut

# Lower sorts first when the lineage exceeds budget. Constraints outrank everything
# because dropping a constraint can make an agent produce confidently wrong work.
_KIND_PRIORITY = {
    NodeKind.constraint.value: 0,
    NodeKind.finding.value: 2,
    NodeKind.asset.value: 3,
    NodeKind.task.value: 1,
}


@dataclass
class _Reached:
    node: Node
    depth: int
    relation_path: list[str] = field(default_factory=list)


def _budget_rank(item: _Reached) -> tuple[int, int, int, str]:
    """Priority when pruning. Direct parents and constraints survive first."""
    if item.depth == 0:
        return (0, 0, 0, item.node.id)
    kind_rank = _KIND_PRIORITY.get(item.node.kind, 4)
    depth_rank = 0 if item.depth == 1 else 1
    evidence_rank = 0 if item.node.source_quote else 1
    return (kind_rank, depth_rank, evidence_rank, item.node.id)


def _walk(db: Session, task: Node, max_depth: int) -> list[_Reached]:
    """Breadth-first over incoming context relations. First arrival wins, so each
    node carries its shortest relation path and revisits cannot loop."""
    reached: dict[str, _Reached] = {task.id: _Reached(node=task, depth=0)}
    queue: deque[str] = deque([task.id])

    while queue:
        current_id = queue.popleft()
        current = reached[current_id]
        if current.depth >= max_depth:
            continue

        incoming = (
            db.query(Edge)
            .filter(
                Edge.target_id == current_id,
                Edge.relation.in_(CONTEXT_RELATIONS),
            )
            .order_by(Edge.created_at, Edge.id)
            .all()
        )
        for edge in incoming:
            if edge.source_id in reached:
                continue
            parent = db.get(Node, edge.source_id)
            if parent is None:
                continue
            reached[parent.id] = _Reached(
                node=parent,
                depth=current.depth + 1,
                relation_path=[*current.relation_path, edge.relation],
            )
            queue.append(parent.id)

    return list(reached.values())


def compute_lineage_hash(task_id: str, items: list[tuple[str, int]]) -> str:
    """Stable across ordering so a pure move or re-read never busts the brief cache."""
    parts = [task_id, *(f"{node_id}:{revision}" for node_id, revision in sorted(items))]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:32]


def assemble_lineage(
    db: Session,
    task: Node,
    max_depth: int | None = None,
    max_nodes: int | None = None,
) -> LineageOut:
    max_depth = max_depth if max_depth is not None else settings.lineage_max_depth
    max_nodes = max_nodes if max_nodes is not None else settings.lineage_max_nodes

    reached = _walk(db, task, max_depth)

    dropped = 0
    if len(reached) > max_nodes:
        reached.sort(key=_budget_rank)
        dropped = len(reached) - max_nodes
        reached = reached[:max_nodes]

    # Present in reading order: the task, then closest context outwards.
    reached.sort(key=lambda item: (item.depth, _KIND_PRIORITY.get(item.node.kind, 4), item.node.id))
    kept_ids = {item.node.id for item in reached}

    asset_names: dict[str, str] = {}
    for item in reached:
        asset_id = item.node.source_asset_id
        if asset_id and asset_id not in asset_names:
            asset = db.get(Asset, asset_id)
            asset_names[asset_id] = asset.filename if asset else asset_id

    nodes = [
        LineageNode(
            id=item.node.id,
            kind=item.node.kind,
            title=item.node.title,
            body=item.node.body,
            depth=item.depth,
            relation_path=item.relation_path,
            evidence_class=item.node.evidence_class,
            source_asset=asset_names.get(item.node.source_asset_id or ""),
            source_page=item.node.source_page,
            source_quote=item.node.source_quote,
            confidence=item.node.confidence,
            revision=item.node.revision,
        )
        for item in reached
    ]

    edges = [
        LineageEdge(source_id=edge.source_id, target_id=edge.target_id, relation=edge.relation)
        for edge in (
            db.query(Edge)
            .filter(
                Edge.board_id == task.board_id,
                Edge.relation.in_(CONTEXT_RELATIONS),
                Edge.source_id.in_(kept_ids),
                Edge.target_id.in_(kept_ids),
            )
            .order_by(Edge.created_at, Edge.id)
            .all()
        )
    ]

    return LineageOut(
        task_id=task.id,
        task_title=task.title,
        nodes=nodes,
        edges=edges,
        truncated=dropped > 0,
        dropped_count=dropped,
        lineage_hash=compute_lineage_hash(
            task.id, [(item.node.id, item.node.revision) for item in reached]
        ),
    )
