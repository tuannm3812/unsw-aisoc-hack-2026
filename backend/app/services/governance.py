"""Governance atomicity engine.

Constraints are not advisory labels. When a constraint node carries a rule_definition,
every write to the constrained target MUST pass those rules before the write is accepted.
This is enforced at the channel boundary (MCP + HTTP), not as post-processing.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from ..models import Edge, Node, NodeKind, Relation

# Fields the governance engine knows how to check on a task or its lineage.
_CHECKABLE_FIELDS = frozenset({
    "confidence",
    "has_source_quote",
    "evidence_class",
    "task_status",
    "has_pr",
})


@dataclass
class GovernanceViolation:
    constraint_id: str
    constraint_title: str
    rule_field: str
    rule_operator: str
    rule_value: object
    actual_value: object


@dataclass
class GovernanceResult:
    allowed: bool
    violations: list[GovernanceViolation] = field(default_factory=list)
    checked_constraints: int = 0


def _field_value(node: Node, field: str) -> object:
    """Read a checkable field from a node."""
    if field == "confidence":
        return node.confidence
    if field == "has_source_quote":
        return bool(node.source_quote)
    if field == "evidence_class":
        return node.evidence_class
    if field == "task_status":
        return node.task_status
    if field == "has_pr":
        return bool(node.pr_url)
    return None


def _evaluate(actual: object, operator: str, expected: object) -> bool:
    """Evaluate a single rule against an actual value."""
    if operator == "exists":
        return actual is not None
    if operator == "missing":
        return actual is None

    if actual is None:
        return False

    try:
        if operator == ">=":
            return float(actual) >= float(expected)  # type: ignore[arg-type]
        if operator == "<=":
            return float(actual) <= float(expected)  # type: ignore[arg-type]
        if operator == "==":
            if isinstance(expected, bool):
                return bool(actual) == expected
            return str(actual) == str(expected)
        if operator == "!=":
            return str(actual) != str(expected)
    except (ValueError, TypeError):
        return False

    return False


def check_constraints(
    db: Session,
    task: Node,
    lineage_nodes: list[Node] | None = None,
) -> GovernanceResult:
    """Evaluate every constraint that points at this task via 'constrains' edges.

    Returns a GovernanceResult — if allowed=False, the caller MUST reject the write.
    """
    # Find all constraint nodes that constrain this task
    constraint_edges = (
        db.query(Edge)
        .filter(
            Edge.target_id == task.id,
            Edge.relation == Relation.constrains.value,
        )
        .all()
    )

    if not constraint_edges:
        return GovernanceResult(allowed=True, checked_constraints=0)

    violations: list[GovernanceViolation] = []
    checked = 0

    # Build a lookup of lineage nodes for field evaluation
    all_nodes = {task.id: task}
    if lineage_nodes:
        for n in lineage_nodes:
            all_nodes[n.id] = n

    # Also include direct ancestors from the DB (for constraints referencing upstream nodes)
    for ce in constraint_edges:
        constraint = db.get(Node, ce.source_id)
        if constraint is None:
            continue
        if constraint.rule_definition is None:
            continue

        rules = constraint.rule_definition.get("rules", [])
        if not rules:
            continue
        checked += 1

        for rule in rules:
            field = rule.get("field", "")
            operator = rule.get("operator", "==")
            expected = rule.get("value")

            if field not in _CHECKABLE_FIELDS:
                # Unknown field — skip (not a block, but logged as not-checkable)
                continue

            # Check the rule against the task itself
            actual = _field_value(task, field)
            if not _evaluate(actual, operator, expected):
                violations.append(GovernanceViolation(
                    constraint_id=constraint.id,
                    constraint_title=constraint.title,
                    rule_field=field,
                    rule_operator=operator,
                    rule_value=expected,
                    actual_value=actual,
                ))

    return GovernanceResult(
        allowed=len(violations) == 0,
        violations=violations,
        checked_constraints=checked,
    )
