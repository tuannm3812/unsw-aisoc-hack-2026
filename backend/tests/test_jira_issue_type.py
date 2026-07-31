"""Picking an issue type that Jira will actually accept.

Every failure mode here produces the same unhelpful 400 from Jira, so the choice is
made from createmeta rather than from the configured name. Jira is stubbed with a mock
transport: the point is our selection logic, not their server.
"""

from __future__ import annotations

import httpx
import pytest

from app.services.jira_service import JiraCall, JiraService

TYPES_PATH = "/issuetypes"


def jira_stub(issue_types: list[dict], fields_by_type: dict[str, list[dict]] | None = None):
    """Stand in for the two createmeta endpoints the resolver calls."""
    fields_by_type = fields_by_type or {}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith(TYPES_PATH):
            return httpx.Response(200, json={"issueTypes": issue_types})
        type_id = path.rsplit("/", 1)[-1]
        return httpx.Response(200, json={"fields": fields_by_type.get(type_id, [])})

    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://example.atlassian.net"
    )


def required(field_id: str, has_default: bool = False) -> dict:
    return {"fieldId": field_id, "required": True, "hasDefaultValue": has_default}


async def resolve(client: httpx.AsyncClient):
    return await JiraService()._resolve_issue_type(client, [])


@pytest.mark.asyncio
async def test_prefers_the_configured_type_and_returns_its_id():
    async with jira_stub(
        [
            {"id": "10002", "name": "Bug", "subtask": False},
            {"id": "10001", "name": "Task", "subtask": False},
        ]
    ) as client:
        chosen = await resolve(client)

    assert chosen.name == "Task"
    assert chosen.id == "10001"


@pytest.mark.asyncio
async def test_falls_back_when_the_project_has_no_task():
    """A team-managed project need not offer a type called Task."""
    async with jira_stub(
        [
            {"id": "10005", "name": "Bug", "subtask": False},
            {"id": "10004", "name": "Story", "subtask": False},
        ]
    ) as client:
        chosen = await resolve(client)

    assert chosen.name == "Story"


@pytest.mark.asyncio
async def test_never_picks_a_subtask_type():
    async with jira_stub(
        [
            {"id": "10010", "name": "Subtask", "subtask": True},
            {"id": "10011", "name": "Chore", "subtask": False},
        ]
    ) as client:
        chosen = await resolve(client)

    assert chosen.name == "Chore"


@pytest.mark.asyncio
async def test_skips_a_type_that_requires_a_field_we_do_not_send():
    """Epic on a company-managed project is creatable but needs Epic Name."""
    async with jira_stub(
        [
            {"id": "10100", "name": "Epic", "subtask": False},
            {"id": "10101", "name": "Bug", "subtask": False},
        ],
        {"10100": [required("customfield_10011")], "10101": []},
    ) as client:
        chosen = await resolve(client)

    assert chosen.name == "Bug"


@pytest.mark.asyncio
async def test_epic_is_ranked_last_even_without_field_metadata():
    async with jira_stub(
        [
            {"id": "10100", "name": "Epic", "subtask": False},
            {"id": "10101", "name": "Chore", "subtask": False},
        ]
    ) as client:
        chosen = await resolve(client)

    assert chosen.name == "Chore"


@pytest.mark.asyncio
async def test_required_fields_we_already_send_do_not_disqualify_a_type():
    async with jira_stub(
        [{"id": "10001", "name": "Task", "subtask": False}],
        {"10001": [required("summary"), required("project"), required("description")]},
    ) as client:
        chosen = await resolve(client)

    assert chosen.id == "10001"


@pytest.mark.asyncio
async def test_a_required_field_with_a_default_does_not_disqualify_a_type():
    async with jira_stub(
        [{"id": "10001", "name": "Task", "subtask": False}],
        {"10001": [required("priority", has_default=True)]},
    ) as client:
        chosen = await resolve(client)

    assert chosen.id == "10001"


@pytest.mark.asyncio
async def test_unresolvable_type_carries_no_id_so_the_caller_can_refuse():
    """createmeta unavailable. Better to say so than to POST a name and guess."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"errorMessages": ["No project could be found"]})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://example.atlassian.net"
    ) as client:
        chosen = await resolve(client)

    assert chosen.id == ""


@pytest.mark.asyncio
async def test_every_type_unusable_still_returns_the_preferred_one():
    """So the error Jira gives names the missing field instead of ours hiding it."""
    async with jira_stub(
        [{"id": "10001", "name": "Task", "subtask": False}],
        {"10001": [required("customfield_99999")]},
    ) as client:
        chosen = await resolve(client)

    assert chosen.name == "Task"


@pytest.mark.asyncio
async def test_the_lookup_is_recorded_for_the_demo_call_trace():
    calls: list[JiraCall] = []
    async with jira_stub([{"id": "10001", "name": "Task", "subtask": False}]) as client:
        await JiraService()._resolve_issue_type(client, calls)

    assert any("createmeta" in call.path for call in calls)
    assert all(call.status == 200 for call in calls)
