"""Unit tests for graph service helpers that the HTTP layer and MCP tools share."""

from __future__ import annotations

import pytest

from app.models import NodeKind
from app.services.graph import (
    connect,
    create_node,
    creates_task_cycle,
    task_description_paragraphs,
    touch,
)


def test_create_node_sets_all_fields(db, board):
    node = create_node(
        db,
        board_id=board.id,
        kind="finding",
        title="  A finding  ",
        body="Detailed body",
        x=100.0,
        y=200.0,
        created_by="usr_1",
        evidence_class="asserted",
        source_page=3,
        source_quote="quoted text",
        confidence=0.85,
    )
    db.commit()

    assert node.id.startswith("nod_")
    assert node.board_id == board.id
    assert node.kind == "finding"
    assert node.title == "A finding"  # trimmed
    assert node.body == "Detailed body"
    assert node.x == 100.0
    assert node.y == 200.0
    assert node.evidence_class == "asserted"
    assert node.source_page == 3
    assert node.source_quote == "quoted text"
    assert node.confidence == 0.85


def test_create_node_title_capped(db, board):
    node = create_node(db, board_id=board.id, kind="task", title="x" * 500)
    db.commit()
    assert len(node.title) == 400


def test_connect_creates_edge(db, board, make_node):
    a = make_node("finding", "a")
    b = make_node("task", "b")

    edge = connect(db, board_id=board.id, source_id=a.id, target_id=b.id, relation="supports")
    assert edge is not None
    assert edge.id.startswith("edg_")
    assert edge.source_id == a.id
    assert edge.target_id == b.id
    assert edge.relation == "supports"


def test_connect_is_idempotent(db, board, make_node):
    a = make_node("finding", "a")
    b = make_node("task", "b")

    first = connect(db, board_id=board.id, source_id=a.id, target_id=b.id, relation="supports")
    second = connect(db, board_id=board.id, source_id=a.id, target_id=b.id, relation="supports")

    assert first is not None
    assert second is not None
    assert first.id == second.id


def test_connect_rejects_self_link(db, board, make_node):
    a = make_node("finding", "a")
    edge = connect(db, board_id=board.id, source_id=a.id, target_id=a.id, relation="supports")
    assert edge is None


def test_creates_task_cycle_detects_loop(db, board, make_node, link):
    a = make_node("task", "a")
    b = make_node("task", "b")
    c = make_node("task", "c")
    link(a, b, "implements")
    link(b, c, "implements")

    # c → a would close a cycle
    assert creates_task_cycle(db, c.id, a.id) is True


def test_creates_task_cycle_no_false_positive(db, board, make_node, link):
    a = make_node("task", "a")
    b = make_node("task", "b")
    # a → b is fine
    assert creates_task_cycle(db, a.id, b.id) is False


def test_touch_bumps_revision(db, make_node):
    node = make_node("finding", "original")
    original_revision = node.revision

    node.title = "changed"
    touch(node)

    assert node.revision == original_revision + 1


def test_task_description_paragraphs_includes_lineage_titles(db, make_node):
    task = make_node("task", "Fix the thing", body="Details here")
    titles = ["Root finding", "Constraint A"]

    paragraphs = task_description_paragraphs(task, titles)

    assert paragraphs[0] == "Details here"
    assert any("Root finding" in p for p in paragraphs)
    assert any("Constraint A" in p for p in paragraphs)
    assert task.id in paragraphs[-1]


def test_task_description_paragraphs_caps_lineage_at_12(db, make_node):
    task = make_node("task", "Task")
    titles = [f"Title {i}" for i in range(20)]

    paragraphs = task_description_paragraphs(task, titles)

    lineage_paragraphs = [p for p in paragraphs if p.startswith("- ")]
    assert len(lineage_paragraphs) <= 12


def test_task_description_paragraphs_fallback_body(db, make_node):
    task = make_node("task", "Task", body="")
    titles: list[str] = []

    paragraphs = task_description_paragraphs(task, titles)

    assert "Spatial Brain canvas" in paragraphs[0]
