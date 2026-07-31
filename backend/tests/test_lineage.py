"""Lineage traversal is the product claim, so its edge cases are pinned here.

A silent failure in this file means an agent gets a task with the wrong context and
nobody notices during a demo.
"""

from __future__ import annotations

from app.services.lineage import assemble_lineage, compute_lineage_hash


def ids(lineage) -> set[str]:
    return {node.id for node in lineage.nodes}


def depth_of(lineage, node_id: str) -> int:
    return next(node.depth for node in lineage.nodes if node.id == node_id)


def test_walks_a_chain_to_the_root(db, make_node, link):
    root = make_node("finding", "root finding")
    middle = make_node("constraint", "derived constraint")
    task = make_node("task", "do the thing")
    link(root, middle, "supports")
    link(middle, task, "constrains")

    lineage = assemble_lineage(db, task)

    assert ids(lineage) == {root.id, middle.id, task.id}
    assert depth_of(lineage, task.id) == 0
    assert depth_of(lineage, middle.id) == 1
    assert depth_of(lineage, root.id) == 2


def test_records_the_relation_path_that_justified_inclusion(db, make_node, link):
    root = make_node("finding", "root")
    middle = make_node("constraint", "middle")
    task = make_node("task", "task")
    link(root, middle, "supports")
    link(middle, task, "constrains")

    lineage = assemble_lineage(db, task)
    root_node = next(node for node in lineage.nodes if node.id == root.id)

    assert root_node.relation_path == ["constrains", "supports"]


def test_collects_both_branches(db, make_node, link):
    left = make_node("finding", "left")
    right = make_node("constraint", "right")
    task = make_node("task", "task")
    link(left, task, "supports")
    link(right, task, "constrains")

    assert ids(assemble_lineage(db, task)) == {left.id, right.id, task.id}


def test_shared_ancestor_appears_once(db, make_node, link):
    shared = make_node("finding", "shared root")
    left = make_node("finding", "left")
    right = make_node("constraint", "right")
    task = make_node("task", "task")
    link(shared, left, "supports")
    link(shared, right, "supports")
    link(left, task, "supports")
    link(right, task, "constrains")

    lineage = assemble_lineage(db, task)

    assert [node.id for node in lineage.nodes].count(shared.id) == 1
    # Reached through whichever branch arrived first, but always at depth two.
    assert depth_of(lineage, shared.id) == 2


def test_a_cycle_terminates(db, make_node, link):
    first = make_node("finding", "first")
    second = make_node("finding", "second")
    task = make_node("task", "task")
    link(first, second, "supports")
    link(second, first, "supports")
    link(second, task, "supports")

    lineage = assemble_lineage(db, task)

    assert ids(lineage) == {first.id, second.id, task.id}


def test_a_task_pointing_at_itself_terminates(db, make_node, link):
    task = make_node("task", "task")
    # connect() refuses self links, so write the degenerate edge directly.
    from app.models import Edge, new_id

    db.add(
        Edge(
            id=new_id("edg"),
            board_id=task.board_id,
            source_id=task.id,
            target_id=task.id,
            relation="supports",
        )
    )
    db.commit()

    assert ids(assemble_lineage(db, task)) == {task.id}


def test_assignment_edges_do_not_carry_context(db, make_node, link):
    """assigned_to says who owns work, not why the work exists."""
    person_node = make_node("finding", "not really context")
    task = make_node("task", "task")
    link(person_node, task, "assigned_to")

    assert ids(assemble_lineage(db, task)) == {task.id}


def test_depth_cap_stops_the_walk(db, make_node, link):
    chain = [make_node("finding", f"step {index}") for index in range(6)]
    task = make_node("task", "task")
    for earlier, later in zip(chain, chain[1:], strict=False):
        link(earlier, later, "supports")
    link(chain[-1], task, "supports")

    lineage = assemble_lineage(db, task, max_depth=2)

    assert max(node.depth for node in lineage.nodes) == 2
    assert len(lineage.nodes) == 3


def test_node_cap_keeps_constraints_over_findings(db, make_node, link):
    task = make_node("task", "task")
    findings = [make_node("finding", f"finding {index}") for index in range(8)]
    constraint = make_node("constraint", "the binding constraint")
    for finding in findings:
        link(finding, task, "supports")
    link(constraint, task, "constrains")

    lineage = assemble_lineage(db, task, max_nodes=4)

    # Ten nodes are reachable: the task, eight findings and the constraint.
    assert lineage.truncated
    assert lineage.dropped_count == 6
    assert len(lineage.nodes) == 4
    assert task.id in ids(lineage)
    assert constraint.id in ids(lineage), "a constraint must never be dropped first"


def test_capping_only_returns_edges_between_kept_nodes(db, make_node, link):
    task = make_node("task", "task")
    kept = make_node("constraint", "kept")
    dropped_parent = make_node("finding", "dropped parent")
    dropped_child = make_node("finding", "dropped child")
    link(kept, task, "constrains")
    link(dropped_parent, dropped_child, "supports")
    link(dropped_child, task, "supports")

    lineage = assemble_lineage(db, task, max_nodes=2)
    kept_ids = ids(lineage)

    for edge in lineage.edges:
        assert edge.source_id in kept_ids
        assert edge.target_id in kept_ids


def test_hash_ignores_ordering(db):
    first = compute_lineage_hash("task", [("a", 1), ("b", 2)])
    second = compute_lineage_hash("task", [("b", 2), ("a", 1)])

    assert first == second


def test_hash_changes_when_an_ancestor_is_revised(db):
    before = compute_lineage_hash("task", [("a", 1), ("b", 2)])
    after = compute_lineage_hash("task", [("a", 1), ("b", 3)])

    assert before != after


def test_hash_changes_when_an_ancestor_is_added(db):
    before = compute_lineage_hash("task", [("a", 1)])
    after = compute_lineage_hash("task", [("a", 1), ("b", 1)])

    assert before != after


def test_editing_an_upstream_node_invalidates_the_brief_cache(db, make_node, link):
    """The cache key must track upstream revisions, not just the task."""
    from app.services.graph import touch

    finding = make_node("finding", "original wording")
    task = make_node("task", "task")
    link(finding, task, "supports")

    before = assemble_lineage(db, task).lineage_hash

    finding.title = "corrected wording"
    touch(finding)
    db.commit()

    assert assemble_lineage(db, task).lineage_hash != before


def test_moving_a_node_does_not_invalidate_the_brief_cache(db, make_node, link):
    finding = make_node("finding", "unchanged")
    task = make_node("task", "task")
    link(finding, task, "supports")

    before = assemble_lineage(db, task).lineage_hash

    finding.x = 900.0
    finding.y = -400.0
    db.commit()

    assert assemble_lineage(db, task).lineage_hash == before
