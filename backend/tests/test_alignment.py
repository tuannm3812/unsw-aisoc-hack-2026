"""Unit tests for alignment heuristics and present fallback."""

from __future__ import annotations

from app.schemas import LineageNode, LineageOut
from app.services.mistral_service import _fallback_present, _heuristic_alignment


def _lineage(*nodes: tuple[str, str, str, str]) -> LineageOut:
    items = [
        LineageNode(
            id="task_1",
            kind="task",
            title="Ship recovery",
            body="",
            depth=0,
            relation_path=[],
            evidence_class="asserted",
            revision=1,
        )
    ]
    for index, (nid, kind, title, body) in enumerate(nodes, start=1):
        items.append(
            LineageNode(
                id=nid,
                kind=kind,
                title=title,
                body=body,
                depth=1,
                relation_path=["supports"],
                evidence_class="asserted",
                revision=1,
            )
        )
    return LineageOut(task_id="task_1", task_title="Ship recovery", nodes=items, edges=[], lineage_hash="x")


def test_heuristic_flags_otp_vs_magic_links():
    lineage = _lineage(
        ("a", "finding", "Email OTP is required", "must include otp"),
        ("b", "constraint", "Magic links only", "passwordless magic links, no otp"),
    )
    result = _heuristic_alignment(lineage)
    assert len(result.conflicts) >= 1
    assert result.generated_by == "heuristic-fallback"


def test_heuristic_quiet_when_aligned():
    lineage = _lineage(
        ("a", "finding", "Cite sources", "reviewers need quotes"),
        ("b", "constraint", "Every claim cites a span", "must cite"),
    )
    result = _heuristic_alignment(lineage)
    assert result.conflicts == []


def test_fallback_present_builds_beats():
    lineage = _lineage(("a", "finding", "Latency", "68 percent"))
    present = _fallback_present(lineage)
    assert present.headline == "Ship recovery"
    assert len(present.beats) == 1


def test_fallback_present_includes_delivery():
    lineage = _lineage(("a", "finding", "Latency", "68 percent"))
    present = _fallback_present(
        lineage,
        {
            "pr_url": "https://github.com/acme/repo/pull/1",
            "pr_title": "Add citations",
            "pr_state": "open",
            "assignee_name": "Marco",
            "task_status": "in_review",
            "jira_issue_key": "SB-1",
            "work_summary": "Assigned to Marco · Jira SB-1 · PR open",
            "checklist_items": [{"status": "pass", "title": "Cite sources", "note": ""}],
            "checklist_summary": "pass: Cite sources",
        },
    )
    kinds = {b.kind for b in present.beats}
    assert "delivery" in kinds
    assert "review" in kinds
    assert present.pr_url.endswith("/1")


def test_fallback_recommend_creates_actionable_task():
    from app.services.mistral_service import _fallback_recommend

    result = _fallback_recommend("n1", "constraint", "Cite every claim", "must cite")
    assert len(result.tasks) == 1
    assert result.tasks[0].relation == "constrains"
    assert "Cite every claim" in result.tasks[0].title
