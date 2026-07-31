"""Test the edge PATCH cycle guard at the service level.

The endpoint-level cycle check mirrors the existing POST check; these tests
verify the underlying creates_task_cycle logic that both endpoints share.
"""

from __future__ import annotations

from app.services.graph import connect, creates_task_cycle


def test_chain_with_no_cycle_is_allowed(db, board, make_node, link):
    a = make_node("task", "a")
    b = make_node("task", "b")
    c = make_node("task", "c")
    link(a, b, "implements")
    link(b, c, "implements")

    # a→c is not a cycle (c has no outgoing implements edges)
    assert creates_task_cycle(db, a.id, c.id) is False


def test_closing_the_loop_is_blocked(db, board, make_node, link):
    a = make_node("task", "a")
    b = make_node("task", "b")
    c = make_node("task", "c")
    link(a, b, "implements")
    link(b, c, "implements")

    # c→a would close: a→b→c→a
    assert creates_task_cycle(db, c.id, a.id) is True


def test_all_outgoing_edges_contribute_to_cycle_detection(db, board, make_node, link):
    """creates_task_cycle checks all outgoing edges, not just implements.
    The endpoint guard adds the relation filter (implements + task kinds)
    on top of this lower-level check."""
    a = make_node("task", "a")
    b = make_node("task", "b")
    link(a, b, "supports")  # a→b exists

    # Proposing b→a: trace from a along outgoing edges → reaches b via supports.
    assert creates_task_cycle(db, b.id, a.id) is True


def test_single_edge_is_not_a_cycle(db, board, make_node, link):
    a = make_node("task", "a")
    b = make_node("task", "b")

    # Proposing a→b: trace from b → b has no outgoing edges → no cycle.
    assert creates_task_cycle(db, a.id, b.id) is False


def test_finding_nodes_still_form_paths_in_the_low_level_check(db, board, make_node, link):
    """The low-level check doesn't filter by node kind — the endpoint does."""
    a = make_node("finding", "a")
    b = make_node("task", "b")
    link(a, b, "supports")  # a→b

    # Proposing b→a: trace from a → a→b exists → cycle detected at low level.
    assert creates_task_cycle(db, b.id, a.id) is True


def test_self_reference_is_handled_by_connect_not_cycle_check(db, board, make_node):
    a = make_node("task", "a")

    # connect() rejects self-links before cycle check runs
    assert connect(db, board_id=board.id, source_id=a.id, target_id=a.id, relation="implements") is None
