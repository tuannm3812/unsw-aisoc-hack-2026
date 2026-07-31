from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models import Base, Board, Node, new_id
from app.services.graph import connect, create_node


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def board(db: Session) -> Board:
    board = Board(id=new_id("brd"), name="Test board")
    db.add(board)
    db.commit()
    return board


@pytest.fixture
def make_node(db: Session, board: Board):
    def _make(kind: str, title: str, **kwargs) -> Node:
        node = create_node(db, board_id=board.id, kind=kind, title=title, **kwargs)
        db.commit()
        return node

    return _make


@pytest.fixture
def link(db: Session, board: Board):
    def _link(source: Node, target: Node, relation: str = "supports"):
        edge = connect(
            db,
            board_id=board.id,
            source_id=source.id,
            target_id=target.id,
            relation=relation,
        )
        db.commit()
        return edge

    return _link
