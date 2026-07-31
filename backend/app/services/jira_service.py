"""Jira Cloud outbound sync.

Real Jira is the default path: basic auth with an email and API token against a free
Cloud site. Every call the demo makes is a real documented REST v3 call, and the
sequence is deliberately explicit so it can be read off the code.

Jira has no idempotency key on issue creation, so the caller owns duplicate
prevention through the node's sync state. A timeout after POST /issue is ambiguous
by definition and is never retried blindly.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class JiraError(RuntimeError):
    pass


class JiraAmbiguous(JiraError):
    """Raised when we cannot tell whether Jira created the issue."""


@dataclass
class JiraCall:
    """One recorded request. The demo surfaces these so judges see the real sequence."""

    method: str
    path: str
    status: int | None = None
    note: str = ""


@dataclass(frozen=True)
class IssueType:
    id: str
    name: str


# Fields the create payload already carries, plus the ones Jira fills in itself.
# A required field outside this set means the issue type is not usable by us.
SUPPLIED_FIELDS = frozenset(
    {"project", "issuetype", "summary", "description", "labels", "assignee", "reporter"}
)


@dataclass
class JiraResult:
    issue_id: str = ""
    issue_key: str = ""
    url: str = ""
    calls: list[JiraCall] = field(default_factory=list)


def describe_error(response: httpx.Response) -> str:
    """Jira returns errorMessages and a per-field errors map. Flatten both."""
    try:
        body = response.json()
    except ValueError:
        return f"{response.status_code}: {response.text[:200]}"

    parts: list[str] = []
    for message in body.get("errorMessages", []) or []:
        parts.append(str(message))
    for field, message in (body.get("errors", {}) or {}).items():
        parts.append(f"{field}: {message}")
    if not parts:
        parts.append(response.text[:200])
    return f"{response.status_code}: " + "; ".join(parts)


def adf_document(paragraphs: list[str]) -> dict[str, Any]:
    """Jira v3 needs Atlassian Document Format for description and comment bodies."""
    content: list[dict[str, Any]] = []
    for text in paragraphs:
        if not text:
            continue
        content.append(
            {"type": "paragraph", "content": [{"type": "text", "text": text[:3000]}]}
        )
    if not content:
        content = [{"type": "paragraph", "content": [{"type": "text", "text": " "}]}]
    return {"version": 1, "type": "doc", "content": content}


def build_issue_payload(
    *,
    project_key: str,
    issue_type_id: str,
    summary: str,
    description_paragraphs: list[str],
    account_id: str | None,
    board_id: str,
    task_id: str,
    revision: int,
) -> dict[str, Any]:
    """The create-issue body, including the correlation property we read back later.

    The issue type goes in by id, not name. Team-managed projects each own a type
    called "Task", so a name is ambiguous across a site and is a documented source
    of "the issue type selected is invalid". Project keys are unique, so a key is safe.
    """
    fields: dict[str, Any] = {
        # 255 is the hard limit Jira enforces; 250 leaves room and is not configurable.
        "project": {"key": project_key},
        "issuetype": {"id": issue_type_id},
        "summary": summary[:250],
        "description": adf_document(description_paragraphs),
        "labels": ["spatial-brain"],  # Jira rejects labels containing spaces.
    }
    # Omitted rather than null: merely including the key can trip the create-screen
    # check on a project where assignee is not on the screen.
    if account_id:
        fields["assignee"] = {"accountId": account_id}

    return {
        "fields": fields,
        "properties": [
            {
                "key": "spatial-brain",
                "value": {
                    "boardId": board_id,
                    "canvasTaskId": task_id,
                    "revision": revision,
                    "lastWriter": "canvas",
                },
            }
        ],
    }


class JiraService:
    def __init__(self) -> None:
        # Resolved once per process. A brand new free site may not have the issue
        # type named in config, so the real one is discovered rather than assumed.
        self._resolved_issue_type: IssueType | None = None

    @property
    def enabled(self) -> bool:
        return settings.jira_enabled

    @property
    def _auth_header(self) -> str:
        raw = f"{settings.jira_email}:{settings.jira_api_token}".encode()
        return "Basic " + base64.b64encode(raw).decode("ascii")

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=settings.jira_base_url.rstrip("/"),
            headers={
                "Authorization": self._auth_header,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def _request(
        self,
        client: httpx.AsyncClient,
        method: str,
        path: str,
        calls: list[JiraCall],
        **kwargs: Any,
    ) -> httpx.Response:
        try:
            response = await client.request(method, path, **kwargs)
        except httpx.RequestError as exc:
            calls.append(JiraCall(method=method, path=path, note=f"network error: {exc}"))
            raise
        calls.append(JiraCall(method=method, path=path, status=response.status_code))
        return response

    async def verify(self) -> dict[str, Any]:
        """Hour-zero spike in code form: prove auth, project and issue type before the demo."""
        if not self.enabled:
            raise JiraError("Jira is not configured")
        calls: list[JiraCall] = []
        async with self._client() as client:
            me = await self._request(client, "GET", "/rest/api/3/myself", calls)
            if me.status_code == 401:
                # Tokens issued after Dec 2024 expire within a year, so an auth failure
                # on credentials that used to work is usually expiry, not a typo.
                raise JiraError(
                    "Jira rejected the credentials. API tokens expire; generate a new "
                    "one at id.atlassian.com/manage-profile/security/api-tokens. "
                    f"{describe_error(me)}"
                )
            if me.status_code >= 300:
                raise JiraError(f"Auth failed. {describe_error(me)}")

            project_key = settings.jira_project_key
            projects = await self._request(
                client,
                "GET",
                "/rest/api/3/project/search",
                calls,
                params={"query": project_key},
            )
            found = False
            if projects.status_code < 300:
                found = any(
                    entry.get("key", "").upper() == project_key.upper()
                    for entry in projects.json().get("values", [])
                )

            usable = await self._issue_types(client, calls)
            issue_types = [entry.name for entry in usable]

        # Auth alone is not enough to create an issue: the project has to exist and
        # offer a creatable type. Report all three so a failure names itself.
        problems: list[str] = []
        if not found:
            problems.append(f"no project with key {project_key} is visible to this account")
        if not issue_types:
            problems.append("the project offers no creatable issue type")

        return {
            "ok": not problems,
            "account": me.json().get("displayName", ""),
            "account_id": me.json().get("accountId", ""),
            "project": project_key,
            "project_found": found,
            "issue_types": issue_types,
            "error": "; ".join(problems),
            "calls": [call.__dict__ for call in calls],
        }

    async def _issue_types(
        self, client: httpx.AsyncClient, calls: list[JiraCall]
    ) -> list[IssueType]:
        """Non-subtask issue types on the project's create screen, in preference order.

        createmeta is the only reliable source: a type that is not on the create screen
        is a validation error, and team-managed projects scope types per project so the
        site-wide issue type list does not answer this question.
        """
        response = await self._request(
            client,
            "GET",
            f"/rest/api/3/issue/createmeta/{settings.jira_project_key}/issuetypes",
            calls,
        )
        if response.status_code >= 300:
            return []

        entries = [
            IssueType(id=str(entry.get("id", "")), name=entry.get("name", ""))
            for entry in response.json().get("issueTypes", [])
            if entry.get("id") and entry.get("name") and not entry.get("subtask", False)
        ]

        configured = settings.jira_issue_type.lower()
        order = [configured, "task", "story", "bug"]

        def rank(entry: IssueType) -> int:
            lowered = entry.name.lower()
            # Epic last: it usually carries required fields we do not send.
            if lowered == "epic":
                return len(order) + 1
            return order.index(lowered) if lowered in order else len(order)

        return sorted(entries, key=rank)

    async def _unmet_required_fields(
        self, client: httpx.AsyncClient, calls: list[JiraCall], issue_type_id: str
    ) -> list[str]:
        """Required fields on this type that we neither send nor Jira can default.

        Epic on a company-managed project is the classic trap: it is a perfectly
        creatable non-subtask type that still fails with "Field 'x' is required".
        """
        response = await self._request(
            client,
            "GET",
            f"/rest/api/3/issue/createmeta/{settings.jira_project_key}"
            f"/issuetypes/{issue_type_id}",
            calls,
        )
        if response.status_code >= 300:
            # Cannot tell, so do not disqualify the type on a failed lookup.
            return []
        return [
            entry.get("fieldId", "")
            for entry in response.json().get("fields", [])
            if entry.get("required")
            and not entry.get("hasDefaultValue")
            and entry.get("fieldId") not in SUPPLIED_FIELDS
        ]

    async def _resolve_issue_type(
        self, client: httpx.AsyncClient, calls: list[JiraCall]
    ) -> IssueType:
        """The first type on the create screen whose required fields we can satisfy."""
        if self._resolved_issue_type:
            return self._resolved_issue_type

        configured = settings.jira_issue_type
        candidates = await self._issue_types(client, calls)
        if not candidates:
            # createmeta was unavailable. Fall back to the configured name and let the
            # create call produce the real error rather than inventing one here.
            logger.warning("Could not read issue types; falling back to %r by name", configured)
            return IssueType(id="", name=configured)

        for candidate in candidates:
            missing = await self._unmet_required_fields(client, calls, candidate.id)
            if missing:
                logger.info(
                    "Skipping issue type %r, it requires %s", candidate.name, ", ".join(missing)
                )
                continue
            if candidate.name.lower() != configured.lower():
                logger.info("Using issue type %r rather than %r", candidate.name, configured)
            self._resolved_issue_type = candidate
            return candidate

        # Every type wants something we do not send. Take the preferred one anyway so
        # the failure names the missing field instead of hiding behind our own guess.
        fallback = candidates[0]
        logger.warning("No issue type has only satisfiable required fields; trying %r", fallback.name)
        return fallback

    async def find_account_id(self, email: str, display_name: str) -> str:
        """Persist accountId, never email: Jira privacy settings can hide addresses."""
        if not self.enabled:
            return ""
        calls: list[JiraCall] = []
        async with self._client() as client:
            for query in (email, display_name):
                if not query:
                    continue
                response = await self._request(
                    client,
                    "GET",
                    "/rest/api/3/user/assignable/search",
                    calls,
                    params={"project": settings.jira_project_key, "query": query},
                )
                if response.status_code < 300:
                    for candidate in response.json():
                        account_id = candidate.get("accountId")
                        if account_id:
                            return account_id
        return ""

    async def create_issue(
        self,
        *,
        summary: str,
        description_paragraphs: list[str],
        account_id: str | None,
        board_id: str,
        task_id: str,
        revision: int,
    ) -> JiraResult:
        if not self.enabled:
            raise JiraError("Jira is not configured")

        result = JiraResult()

        async with self._client() as client:
            issue_type = await self._resolve_issue_type(client, result.calls)
            if not issue_type.id:
                raise JiraError(
                    f"Could not resolve issue type {issue_type.name!r} on project "
                    f"{settings.jira_project_key}. Check the project key and that the "
                    "account can create issues in it."
                )
            payload = build_issue_payload(
                project_key=settings.jira_project_key,
                issue_type_id=issue_type.id,
                summary=summary,
                description_paragraphs=description_paragraphs,
                account_id=account_id,
                board_id=board_id,
                task_id=task_id,
                revision=revision,
            )

            try:
                created = await self._request(
                    client, "POST", "/rest/api/3/issue", result.calls, json=payload
                )
            except httpx.RequestError as exc:
                # Jira may or may not have created the issue. Do not retry blindly.
                raise JiraAmbiguous(
                    f"Create issue timed out, state unknown: {exc}"
                ) from exc

            if created.status_code >= 300:
                raise JiraError(f"Create issue failed. {describe_error(created)}")

            body = created.json()
            result.issue_id = body.get("id", "")
            result.issue_key = body.get("key", "")
            result.url = f"{settings.jira_base_url.rstrip('/')}/browse/{result.issue_key}"

            # Read back so the canvas shows Jira's canonical values, not our guess.
            await self._request(
                client,
                "GET",
                f"/rest/api/3/issue/{result.issue_key}",
                result.calls,
                params={"fields": "summary,assignee,status,updated"},
            )

        return result

    async def add_comment(self, issue_key: str, paragraphs: list[str]) -> JiraResult:
        if not self.enabled:
            raise JiraError("Jira is not configured")
        result = JiraResult(issue_key=issue_key)
        async with self._client() as client:
            response = await self._request(
                client,
                "POST",
                f"/rest/api/3/issue/{issue_key}/comment",
                result.calls,
                json={"body": adf_document(paragraphs)},
            )
            if response.status_code >= 300:
                raise JiraError(f"Comment failed. {describe_error(response)}")
        return result


jira_service = JiraService()
