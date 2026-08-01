"""Governance atomicity — constraints must be enforced at the channel boundary."""

from __future__ import annotations

from app.services.governance import check_constraints, _evaluate


# ── Low-level rule evaluator ────────────────────────────────────

def test_evaluate_equals():
    assert _evaluate("extracted", "==", "extracted") is True
    assert _evaluate("asserted", "==", "extracted") is False


def test_evaluate_boolean():
    assert _evaluate(True, "==", True) is True
    assert _evaluate(False, "==", True) is False


def test_evaluate_gte():
    assert _evaluate(0.85, ">=", 0.7) is True
    assert _evaluate(0.5, ">=", 0.7) is False


def test_evaluate_lte():
    assert _evaluate(0.3, "<=", 0.5) is True
    assert _evaluate(0.9, "<=", 0.5) is False


def test_evaluate_exists():
    assert _evaluate("something", "exists", None) is True
    assert _evaluate(None, "exists", None) is False


def test_evaluate_missing():
    assert _evaluate(None, "missing", None) is True
    assert _evaluate("something", "missing", None) is False


def test_evaluate_not_equals():
    assert _evaluate("open", "!=", "done") is True
    assert _evaluate("done", "!=", "done") is False


def test_evaluate_none_actual_returns_false_for_comparison():
    assert _evaluate(None, ">=", 0.7) is False


# ── Governance integration tests ────────────────────────────────

def test_task_with_no_constraints_passes(db, make_node):
    task = make_node("task", "Do the thing")
    result = check_constraints(db, task)
    assert result.allowed is True
    assert result.checked_constraints == 0


def test_constraint_without_rules_passes(db, make_node, link):
    task = make_node("task", "Do the thing")
    c = make_node("constraint", "Must be reviewed")
    link(c, task, "constrains")

    result = check_constraints(db, task)
    assert result.allowed is True


def test_constraint_with_satisfied_rule_passes(db, make_node, link):
    task = make_node("task", "Do the thing", confidence=0.9)
    c = make_node("constraint", "High confidence only", rule_definition={
        "applies_to": ["task"],
        "rules": [{"field": "confidence", "operator": ">=", "value": 0.7}],
    })
    link(c, task, "constrains")

    result = check_constraints(db, task)
    assert result.allowed is True
    assert result.checked_constraints == 1


def test_constraint_with_violated_rule_blocks(db, make_node, link):
    task = make_node("task", "Do the thing", confidence=0.3)
    c = make_node("constraint", "High confidence only", rule_definition={
        "applies_to": ["task"],
        "rules": [{"field": "confidence", "operator": ">=", "value": 0.7}],
    })
    link(c, task, "constrains")

    result = check_constraints(db, task)
    assert result.allowed is False
    assert len(result.violations) == 1
    assert result.violations[0].constraint_id == c.id
    assert result.violations[0].rule_field == "confidence"


def test_has_pr_rule_blocks_when_no_pr(db, make_node, link):
    task = make_node("task", "Do the thing")
    c = make_node("constraint", "Must have PR", rule_definition={
        "applies_to": ["task"],
        "rules": [{"field": "has_pr", "operator": "==", "value": True}],
    })
    link(c, task, "constrains")

    result = check_constraints(db, task)
    assert result.allowed is False


def test_has_source_quote_rule(db, make_node, link):
    task = make_node("task", "Do the thing", source_quote="Chapter 3, para 2")
    c = make_node("constraint", "Must cite source", rule_definition={
        "applies_to": ["task"],
        "rules": [{"field": "has_source_quote", "operator": "==", "value": True}],
    })
    link(c, task, "constrains")

    result = check_constraints(db, task)
    assert result.allowed is True


def test_multiple_constraints_all_violations_reported(db, make_node, link):
    task = make_node("task", "Do the thing", confidence=0.3)
    c1 = make_node("constraint", "C1", rule_definition={
        "rules": [{"field": "confidence", "operator": ">=", "value": 0.7}],
    })
    c2 = make_node("constraint", "C2", rule_definition={
        "rules": [{"field": "has_pr", "operator": "==", "value": True}],
    })
    link(c1, task, "constrains")
    link(c2, task, "constrains")

    result = check_constraints(db, task)
    assert result.allowed is False
    assert len(result.violations) == 2
    assert {v.constraint_id for v in result.violations} == {c1.id, c2.id}


def test_implements_edge_does_not_trigger_governance(db, make_node, link):
    """Only 'constrains' edges carry governance rules."""
    task = make_node("task", "Do the thing")
    c = make_node("constraint", "Not governance", rule_definition={
        "rules": [{"field": "confidence", "operator": ">=", "value": 0.7}],
    })
    link(c, task, "supports")  # supports, not constrains

    result = check_constraints(db, task)
    assert result.allowed is True
    assert result.checked_constraints == 0
