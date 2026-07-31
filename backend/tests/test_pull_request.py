"""What an agent is allowed to assert about a pull request.

The reported URL is rendered as a clickable link on the canvas and copied into a
Jira comment, and it arrives from a model that may have been reading an uploaded
document. So the boundary is here, at the schema, not at either render site.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import PullRequestReport


def report(**overrides):
    defaults = {"url": "https://github.com/acme/demo/pull/42"}
    defaults.update(overrides)
    return PullRequestReport(**defaults)


def test_accepts_a_normal_pull_request_url():
    payload = report(title="Add span-level citations", state="open")

    assert payload.url == "https://github.com/acme/demo/pull/42"
    assert payload.state == "open"


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(document.cookie)",
        "data:text/html,<script>alert(1)</script>",
        "file:///c:/windows/system32",
        "/relative/path",
        "github.com/acme/demo/pull/42",
        "https://",
    ],
)
def test_rejects_anything_that_is_not_an_absolute_web_url(url: str):
    with pytest.raises(ValidationError):
        report(url=url)


def test_state_is_normalised_to_lower_case():
    assert report(state="MERGED").state == "merged"


def test_rejects_an_invented_state():
    """The canvas badge styles off this value, so an unknown state renders as nothing."""
    with pytest.raises(ValidationError):
        report(state="probably-merged")


def test_url_is_trimmed():
    assert report(url="  https://github.com/acme/demo/pull/7  ").url.endswith("/pull/7")


def test_title_length_is_capped():
    with pytest.raises(ValidationError):
        report(title="t" * 401)


def test_reported_by_defaults_so_provenance_is_never_blank():
    assert report().reported_by == "agent"
