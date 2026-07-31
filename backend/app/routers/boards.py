from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import board_for_user, current_user
from ..db import get_db
from ..models import (
    Asset,
    Board,
    Candidate,
    Edge,
    Membership,
    Node,
    NodeKind,
    Relation,
    User,
)
from ..schemas import (
    AssetOut,
    BoardOut,
    CandidateOut,
    EdgeCreate,
    EdgeOut,
    GraphOut,
    MemberOut,
    NodeCreate,
    NodeMove,
    NodeOut,
    NodeUpdate,
    TaskRecommendationResult,
)
from ..services.graph import connect, create_node, creates_task_cycle, log_activity, touch
from ..services.mistral_service import mistral_service

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.get("", response_model=list[BoardOut])
def list_boards(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[Board]:
    rows = (
        db.query(Board)
        .join(Membership, Membership.board_id == Board.id)
        .filter(Membership.user_id == user.id)
        .order_by(Board.created_at)
        .all()
    )
    return rows


@router.get("/{board_id}/graph", response_model=GraphOut)
def get_graph(
    board_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> GraphOut:
    board = board_for_user(db, board_id, user)

    members: list[MemberOut] = []
    for membership in db.query(Membership).filter(Membership.board_id == board_id).all():
        member = db.get(User, membership.user_id)
        if member is None:
            continue
        members.append(
            MemberOut(
                id=member.id,
                email=member.email,
                name=member.name,
                role=member.role,
                discipline=member.discipline,
                jira_account_id=member.jira_account_id,
                board_role=membership.board_role,
            )
        )

    nodes = db.query(Node).filter(Node.board_id == board_id).order_by(Node.created_at).all()
    edges = db.query(Edge).filter(Edge.board_id == board_id).order_by(Edge.created_at).all()
    assets = db.query(Asset).filter(Asset.board_id == board_id).order_by(Asset.created_at).all()
    # Only what still needs a decision. Promoted proposals are nodes now, and
    # dismissed ones were answered, so neither belongs in the review list.
    candidates = (
        db.query(Candidate)
        .filter(
            Candidate.board_id == board_id,
            Candidate.dismissed.is_(False),
            Candidate.promoted_node_id.is_(None),
        )
        .all()
    )
    candidates.sort(key=lambda c: (c.kind, -(c.confidence or 0.0), c.title))

    return GraphOut(
        board=BoardOut.model_validate(board),
        members=members,
        nodes=[NodeOut.model_validate(node) for node in nodes],
        edges=[EdgeOut.model_validate(edge) for edge in edges],
        assets=[AssetOut.model_validate(asset) for asset in assets],
        candidates=[CandidateOut.model_validate(c) for c in candidates],
    )


@router.post("/{board_id}/nodes", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
def add_node(
    board_id: str,
    payload: NodeCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Node:
    board_for_user(db, board_id, user)
    if payload.kind == NodeKind.asset:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Asset nodes are created by uploading a document",
        )

    node = create_node(
        db,
        board_id=board_id,
        kind=payload.kind.value,
        title=payload.title,
        body=payload.body,
        x=payload.x,
        y=payload.y,
        created_by=user.id,
        evidence_class="asserted",
    )
    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="node.created",
        subject_id=node.id,
        detail={"kind": node.kind, "title": node.title},
    )
    db.commit()
    return node


@router.patch("/{board_id}/nodes/{node_id}", response_model=NodeOut)
def update_node(
    board_id: str,
    node_id: str,
    payload: NodeUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Node:
    board_for_user(db, board_id, user)
    node = _node_or_404(db, board_id, node_id)

    if payload.title is not None:
        node.title = payload.title.strip()[:400]
    if payload.body is not None:
        node.body = payload.body
    if payload.task_status is not None:
        if node.kind != NodeKind.task.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only tasks have a status")
        node.task_status = payload.task_status
    if payload.decision_state is not None:
        if node.kind != NodeKind.task.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only tasks record decisions")
        node.decision_state = payload.decision_state
    if payload.decision_rationale is not None:
        if node.kind != NodeKind.task.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only tasks record decisions")
        node.decision_rationale = payload.decision_rationale
    touch(node)
    db.commit()
    return node


@router.put("/{board_id}/nodes/{node_id}/position", response_model=NodeOut)
def move_node(
    board_id: str,
    node_id: str,
    payload: NodeMove,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Node:
    board_for_user(db, board_id, user)
    node = _node_or_404(db, board_id, node_id)
    # Position is not semantic content, so it does not bump the revision and cannot
    # invalidate a cached brief.
    node.x = payload.x
    node.y = payload.y
    db.commit()
    return node


@router.delete("/{board_id}/nodes/{node_id}")
def delete_node(
    board_id: str,
    node_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    board_for_user(db, board_id, user)
    node = _node_or_404(db, board_id, node_id)
    db.query(Edge).filter((Edge.source_id == node_id) | (Edge.target_id == node_id)).delete()
    db.delete(node)
    log_activity(db, board_id=board_id, actor=user.name, action="node.deleted", subject_id=node_id)
    db.commit()
    return {"ok": True}


@router.post("/{board_id}/edges", response_model=EdgeOut, status_code=status.HTTP_201_CREATED)
def add_edge(
    board_id: str,
    payload: EdgeCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Edge:
    board_for_user(db, board_id, user)
    source = _node_or_404(db, board_id, payload.source_id)
    target = _node_or_404(db, board_id, payload.target_id)

    if source.id == target.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A node cannot connect to itself")

    # Knowledge relations may form cycles; task dependencies may not.
    if (
        payload.relation == Relation.implements
        and source.kind == NodeKind.task.value
        and target.kind == NodeKind.task.value
        and creates_task_cycle(db, source.id, target.id)
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That would create a task dependency cycle")

    edge = connect(
        db,
        board_id=board_id,
        source_id=source.id,
        target_id=target.id,
        relation=payload.relation.value,
        created_by=user.id,
    )
    if edge is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Edge could not be created")
    db.commit()
    return edge


@router.delete("/{board_id}/edges/{edge_id}")
def delete_edge(
    board_id: str,
    edge_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    board_for_user(db, board_id, user)
    edge = db.query(Edge).filter(Edge.id == edge_id, Edge.board_id == board_id).one_or_none()
    if edge is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Edge not found")
    db.delete(edge)
    db.commit()
    return {"ok": True}


@router.post(
    "/{board_id}/nodes/{node_id}/recommend-tasks",
    response_model=TaskRecommendationResult,
)
async def recommend_tasks_from_node(
    board_id: str,
    node_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskRecommendationResult:
    """Mistral proposes tasks from a finding/constraint and creates them on the canvas."""
    board_for_user(db, board_id, user)
    source = _node_or_404(db, board_id, node_id)
    if source.kind not in {NodeKind.finding.value, NodeKind.constraint.value}:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Task recommendations start from a finding or constraint",
        )

    neighbor_ids: set[str] = set()
    for edge in db.query(Edge).filter(
        Edge.board_id == board_id,
        (Edge.source_id == node_id) | (Edge.target_id == node_id),
    ):
        neighbor_ids.add(edge.source_id)
        neighbor_ids.add(edge.target_id)
    neighbor_ids.discard(node_id)
    neighbors = (
        db.query(Node).filter(Node.board_id == board_id, Node.id.in_(neighbor_ids)).all()
        if neighbor_ids
        else []
    )

    result = await mistral_service.recommend_tasks(
        source_id=source.id,
        source_kind=source.kind,
        source_title=source.title,
        source_body=source.body or source.source_quote or "",
        neighbors=[
            {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body or ""}
            for n in neighbors
        ],
    )

    created_nodes: list[Node] = []
    created_edges: list[Edge] = []
    relations: list[str] = []
    for index, proposal in enumerate(result.tasks):
        task = create_node(
            db,
            board_id=board_id,
            kind=NodeKind.task.value,
            title=proposal.title,
            body=(
                f"{proposal.body}\n\nWhy: {proposal.rationale}".strip()
                if proposal.rationale
                else proposal.body
            ),
            x=source.x + 330.0,
            y=source.y + index * 140.0,
            created_by=user.id,
            evidence_class="asserted",
        )
        relation = (
            Relation.constrains.value
            if proposal.relation == "constrains"
            else Relation.supports.value
        )
        created_nodes.append(task)
        relations.append(relation)

    # Same order as candidate promote: nodes must exist before edge FK inserts.
    db.flush()

    for task, relation in zip(created_nodes, relations, strict=True):
        edge = connect(
            db,
            board_id=board_id,
            source_id=source.id,
            target_id=task.id,
            relation=relation,
            created_by=user.id,
        )
        if edge is not None:
            created_edges.append(edge)

    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="node.recommend_tasks",
        subject_id=source.id,
        detail={"count": len(created_nodes), "by": result.generated_by},
    )
    db.commit()
    for node in created_nodes:
        db.refresh(node)

    result.created_nodes = [NodeOut.model_validate(n) for n in created_nodes]
    result.created_edges = [EdgeOut.model_validate(e) for e in created_edges]
    result.events = [
        *result.events,
        f"Created {len(created_nodes)} task(s) from {source.kind} '{source.title}'",
    ]
    return result


def _node_or_404(db: Session, board_id: str, node_id: str) -> Node:
    node = db.query(Node).filter(Node.id == node_id, Node.board_id == board_id).one_or_none()
    if node is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    return node
