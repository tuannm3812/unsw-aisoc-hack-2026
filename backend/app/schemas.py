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
    decision_state: str = ""
    decision_rationale: str = ""
    decision_by: str = ""
    decision_at: datetime | None = None
    alignment_payload: dict | None = None
    present_payload: dict | None = None
    review_checklist: list | None = None
    rule_definition: dict | None = None
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


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    asset_id: str
    kind: str
    title: str
    body: str
    source_page: int | None = None
    source_quote: str
    confidence: float | None = None
    promoted_node_id: str | None = None
    dismissed: bool


class CandidateSelection(BaseModel):
    candidate_ids: list[str] = Field(min_length=1, max_length=60)


class PromotionResult(BaseModel):
    nodes: list[NodeOut]
    edges: list[EdgeOut]


class GraphOut(BaseModel):
    board: BoardOut
    members: list[MemberOut]
    nodes: list[NodeOut]
    edges: list[EdgeOut]
    assets: list[AssetOut]
    candidates: list[CandidateOut] = Field(default_factory=list)


class NodeCreate(BaseModel):
    kind: NodeKind
    title: str = Field(min_length=1, max_length=400)
    body: str = ""
    x: float = 0.0
    y: float = 0.0


class ConstraintRule(BaseModel):
    """A single machine-verifiable rule on a constraint node.

    Supported operators: >=, <=, ==, !=, exists, missing.
    The field is checked against the relevant node's attribute.
    """

    field: str = Field(min_length=1, max_length=60)
    operator: str = Field(pattern="^(>=|<=|==|!=|exists|missing)$")
    value: str | int | float | bool | None = None


class RuleDefinition(BaseModel):
    """Container for the rules a constraint node enforces."""

    applies_to: list[str] = Field(default_factory=lambda: ["task"])
    rules: list[ConstraintRule] = Field(default_factory=list, max_length=20)
    block_message: str = Field(default="", max_length=500)


class NodeUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=400)
    body: str | None = None
    task_status: str | None = None
    decision_state: str | None = None
    decision_rationale: str | None = None
    rule_definition: RuleDefinition | None = None


class NodeMove(BaseModel):
    x: float
    y: float


class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    relation: Relation = Relation.supports


class EdgeUpdate(BaseModel):
    relation: Relation


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


class AlignmentConflict(BaseModel):
    node_a_id: str
    node_b_id: str
    node_a_title: str = ""
    node_b_title: str = ""
    description: str


class AlignmentResult(BaseModel):
    task_id: str
    conflicts: list[AlignmentConflict] = Field(default_factory=list)
    summary: str = ""
    generated_by: str = ""


class DecisionRequest(BaseModel):
    state: str = Field(pattern="^(decided|deferred|rejected)$")
    rationale: str = Field(default="", max_length=2000)


class PresentBeat(BaseModel):
    kind: str = ""
    title: str = ""
    body: str = ""
    node_id: str | None = None
    quote: str = ""


class PresentResult(BaseModel):
    task_id: str
    headline: str = ""
    audience_summary: str = ""
    beats: list[PresentBeat] = Field(default_factory=list)
    open_risks: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    image_url: str = ""
    generated_by: str = ""
    # Engineering delivery snapshot (PR / Jira / checklist) woven into the present.
    work_summary: str = ""
    delivery_notes: str = ""
    checklist_summary: str = ""
    pr_url: str = ""
    pr_title: str = ""
    pr_state: str = ""
    jira_issue_key: str = ""
    jira_url: str = ""
    assignee_name: str = ""
    task_status: str = ""


class ReviewCheckItem(BaseModel):
    constraint_id: str
    title: str
    status: str  # pass | fail | unknown
    note: str = ""


class ReviewChecklistResult(BaseModel):
    task_id: str
    items: list[ReviewCheckItem] = Field(default_factory=list)
    summary: str = ""
    generated_by: str = ""


class AgentRunRequest(BaseModel):
    action: str = Field(pattern="^(align|present|review|brief|sense)$")
    message: str = ""


class AgentRunResult(BaseModel):
    action: str
    status: str
    events: list[str] = Field(default_factory=list)
    alignment: AlignmentResult | None = None
    present: PresentResult | None = None
    review: ReviewChecklistResult | None = None
    detail: str = ""


class RecommendedTask(BaseModel):
    title: str
    body: str = ""
    rationale: str = ""
    relation: str = "supports"  # supports | constrains
    priority: str = "medium"  # high | medium | low
    source_node_id: str = ""


class TaskRecommendationResult(BaseModel):
    source_node_id: str
    summary: str = ""
    tasks: list[RecommendedTask] = Field(default_factory=list)
    created_nodes: list[NodeOut] = Field(default_factory=list)
    created_edges: list[EdgeOut] = Field(default_factory=list)
    events: list[str] = Field(default_factory=list)
    generated_by: str = ""


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
