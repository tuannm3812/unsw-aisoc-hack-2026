"""Jira v3 rejects a plain string where it wants Atlassian Document Format.

These cases pin the payload shape so a demo failure cannot come from a malformed body,
which is the mistake that is hardest to spot from a 400 response.
"""

from __future__ import annotations

from app.services.jira_service import adf_document, build_issue_payload


def test_adf_wraps_paragraphs():
    document = adf_document(["first line", "second line"])

    assert document["type"] == "doc"
    assert document["version"] == 1
    assert len(document["content"]) == 2
    assert document["content"][0]["content"][0]["text"] == "first line"


def test_adf_drops_empty_paragraphs():
    document = adf_document(["kept", "", "also kept"])

    assert len(document["content"]) == 2


def test_adf_never_returns_an_empty_document():
    """Jira rejects a doc with no content, so an all-empty input still needs a body."""
    document = adf_document(["", ""])

    assert len(document["content"]) == 1


def test_adf_truncates_very_long_text():
    document = adf_document(["x" * 5000])

    assert len(document["content"][0]["content"][0]["text"]) == 3000


def issue_payload(**overrides):
    defaults = dict(
        project_key="SB",
        issue_type_id="10001",
        summary="Add span-level citations",
        description_paragraphs=["Body text", "Context from the knowledge graph:"],
        account_id="557058:abc",
        board_id="brd_1",
        task_id="nod_1",
        revision=3,
    )
    defaults.update(overrides)
    return build_issue_payload(**defaults)


def test_issue_payload_shape():
    payload = issue_payload()
    fields = payload["fields"]

    assert fields["project"] == {"key": "SB"}
    assert fields["description"]["type"] == "doc"
    assert fields["assignee"] == {"accountId": "557058:abc"}


def test_issue_type_goes_in_by_id_not_name():
    """Team-managed projects each own a type called Task, so a name is ambiguous."""
    fields = issue_payload()["fields"]

    assert fields["issuetype"] == {"id": "10001"}
    assert "name" not in fields["issuetype"]


def test_labels_never_contain_spaces():
    """Jira rejects the whole request with "Labels may not contain spaces"."""
    labels = issue_payload()["fields"]["labels"]

    assert labels and all(" " not in label for label in labels)


def test_issue_payload_omits_assignee_when_unknown():
    """Sending assignee null makes Jira reject the whole request on some sites."""
    payload = issue_payload(account_id=None)

    assert "assignee" not in payload["fields"]


def test_issue_payload_carries_the_correlation_property():
    payload = issue_payload()
    prop = payload["properties"][0]

    assert prop["key"] == "spatial-brain"
    assert prop["value"]["canvasTaskId"] == "nod_1"
    assert prop["value"]["boardId"] == "brd_1"
    assert prop["value"]["revision"] == 3


def test_summary_is_capped_to_jira_limit():
    payload = issue_payload(summary="s" * 400)

    assert len(payload["fields"]["summary"]) == 250


def test_summary_is_never_an_adf_document():
    """summary is a plain string field, unlike description."""
    payload = issue_payload()

    assert isinstance(payload["fields"]["summary"], str)
