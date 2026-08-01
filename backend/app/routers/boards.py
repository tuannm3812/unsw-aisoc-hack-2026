from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import board_for_user, current_user
from ..db import get_db
from ..models import (
    Asset,
    Board,
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
    EdgeCreate,
    EdgeOut,
    EdgeUpdate,
    GraphOut,
    MemberOut,
    NodeCreate,
    NodeMove,
    NodeOut,
    NodeUpdate,
)
from ..services.graph import connect, create_node, creates_task_cycle, log_activity, touch

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

    return GraphOut(
        board=BoardOut.model_validate(board),
        members=members,
        nodes=[NodeOut.model_validate(node) for node in nodes],
        edges=[EdgeOut.model_validate(edge) for edge in edges],
        assets=[AssetOut.model_validate(asset) for asset in assets],
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
    if payload.rule_definition is not None:
        if node.kind != NodeKind.constraint.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only constraints carry rules")
        node.rule_definition = payload.rule_definition.model_dump()
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


@router.patch("/{board_id}/edges/{edge_id}", response_model=EdgeOut)
def update_edge(
    board_id: str,
    edge_id: str,
    payload: EdgeUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Edge:
    board_for_user(db, board_id, user)
    edge = db.query(Edge).filter(Edge.id == edge_id, Edge.board_id == board_id).one_or_none()
    if edge is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Edge not found")

    new_relation = payload.relation.value

    # Patching to implements between two tasks must not create a dependency cycle.
    source_node = db.query(Node).filter(Node.id == edge.source_id).one_or_none()
    target_node = db.query(Node).filter(Node.id == edge.target_id).one_or_none()
    if (
        new_relation == Relation.implements.value
        and source_node
        and source_node.kind == NodeKind.task.value
        and target_node
        and target_node.kind == NodeKind.task.value
        and creates_task_cycle(db, edge.source_id, edge.target_id)
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That would create a task dependency cycle")

    edge.relation = new_relation
    db.commit()
    return edge


def _node_or_404(db: Session, board_id: str, node_id: str) -> Node:
    node = db.query(Node).filter(Node.id == node_id, Node.board_id == board_id).one_or_none()
    if node is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    return node
