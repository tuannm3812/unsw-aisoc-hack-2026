from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import NodeKind, Relation


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: str
    discipline: str
    jira_account_id: str = ""


class MemberOut(UserOut):
    board_role: str = "member"


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    summary: str
    jira_project_key: str


class NodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    board_id: str
    kind: str
    title: str
    body: str
    x: float
    y: float
    evidence_class: str
    source_asset_id: str | None = None
    source_page: int | None = None
    source_quote: str
    confidence: float | None = None
    assignee_id: str | None = None
    task_status: str
    jira_issue_key: str
    jira_url: str
    jira_sync_state: str
    jira_sync_error: str
    pr_url: str
    pr_title: str
    pr_state: str
    pr_reported_by: str
    pr_reported_at: datetime | None = None
    created_by: str
    revision: int
    updated_at: datetime


class EdgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    board_id: str
    source_id: str
    target_id: str
    relation: str


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    board_id: str
    filename: str
    media_type: str
    byte_size: int
    page_count: int
    parse_state: str
    parse_error: str
    created_at: datetime


class GraphOut(BaseModel):
    board: BoardOut
    members: list[MemberOut]
    nodes: list[NodeOut]
    edges: list[EdgeOut]
    assets: list[AssetOut]


class NodeCreate(BaseModel):
    kind: NodeKind
    title: str = Field(min_length=1, max_length=400)
    body: str = ""
    x: float = 0.0
    y: float = 0.0


class NodeUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=400)
    body: str | None = None
    task_status: str | None = None


class NodeMove(BaseModel):
    x: float
    y: float


class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    relation: Relation = Relation.supports


class AssignRequest(BaseModel):
    assignee_id: str
    create_jira_issue: bool = True


class LineageNode(BaseModel):
    id: str
    kind: str
    title: str
    body: str
    depth: int
    relation_path: list[str]
    evidence_class: str
    source_asset: str | None = None
    source_page: int | None = None
    source_quote: str = ""
    confidence: float | None = None
    revision: int


class LineageEdge(BaseModel):
    source_id: str
    target_id: str
    relation: str


class LineageOut(BaseModel):
    task_id: str
    task_title: str
    nodes: list[LineageNode]
    edges: list[LineageEdge]
    truncated: bool = False
    dropped_count: int = 0
    lineage_hash: str


class TaskBrief(BaseModel):
    objective: str = ""
    relevant_findings: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    generated_by: str = ""


class TaskContextOut(BaseModel):
    task: NodeOut
    assignee: UserOut | None = None
    jira_issue_key: str = ""
    jira_url: str = ""
    lineage: LineageOut
    brief: TaskBrief


PR_STATES = ("open", "draft", "merged", "closed")


class PullRequestReport(BaseModel):
    """What an agent may assert about a pull request.

    The URL is rendered as a clickable link on the canvas and echoed into a Jira
    comment, so the scheme is restricted here rather than at either render site.
    """

    url: str = Field(min_length=8, max_length=600)
    title: str = Field(default="", max_length=400)
    state: str = Field(default="open", max_length=40)
    reported_by: str = Field(default="agent", max_length=120)

    @field_validator("url")
    @classmethod
    def _http_only(cls, value: str) -> str:
        value = value.strip()
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("url must be an absolute http or https URL")
        return value

    @field_validator("state")
    @classmethod
    def _known_state(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in PR_STATES:
            raise ValueError(f"state must be one of {', '.join(PR_STATES)}")
        return lowered


# Structured extraction contract handed to Mistral. Anything outside this is rejected.
class ExtractedFinding(BaseModel):
    title: str = Field(max_length=200)
    detail: str = ""
    page: int | None = None
    quote: str = ""
    confidence: float | None = None


class ExtractedConstraint(BaseModel):
    title: str = Field(max_length=200)
    detail: str = ""
    page: int | None = None
    quote: str = ""
    confidence: float | None = None


class ExtractionResult(BaseModel):
    summary: str = ""
    findings: list[ExtractedFinding] = Field(default_factory=list)
    constraints: list[ExtractedConstraint] = Field(default_factory=list)
