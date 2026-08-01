from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class NodeKind(str, Enum):
    asset = "asset"
    finding = "finding"
    constraint = "constraint"
    task = "task"


class Relation(str, Enum):
    """Context-bearing relations point from source to the node that depends on it."""

    derived_from = "derived_from"
    supports = "supports"
    constrains = "constrains"
    implements = "implements"
    assigned_to = "assigned_to"


# Relations the lineage walk follows backwards from a task towards its roots.
CONTEXT_RELATIONS: tuple[str, ...] = (
    Relation.derived_from.value,
    Relation.supports.value,
    Relation.constrains.value,
    Relation.implements.value,
)


class Evidence(str, Enum):
    observed = "observed"
    extracted = "extracted"
    asserted = "asserted"


class SyncState(str, Enum):
    pending = "pending"
    creating = "creating"
    synced = "synced"
    ambiguous = "ambiguous"
    failed = "failed"


class ParseState(str, Enum):
    pending = "pending"
    parsing = "parsing"
    parsed = "parsed"
    failed = "failed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("usr"))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(40), default="member")
    discipline: Mapped[str] = mapped_column(String(60), default="")
    password_hash: Mapped[str] = mapped_column(String(200))
    jira_account_id: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    memberships: Mapped[list[Membership]] = relationship(back_populates="user")


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("brd"))
    name: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    jira_project_key: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    memberships: Mapped[list[Membership]] = relationship(back_populates="board")
    nodes: Mapped[list[Node]] = relationship(back_populates="board")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("board_id", "user_id", name="uq_membership"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("mem"))
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    board_role: Mapped[str] = mapped_column(String(40), default="member")

    board: Mapped[Board] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class Asset(Base):
    """An uploaded source document. Originals are kept so evidence stays checkable."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ast"))
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"), index=True)
    filename: Mapped[str] = mapped_column(String(400))
    media_type: Mapped[str] = mapped_column(String(120), default="")
    byte_size: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[str] = mapped_column(String(80), index=True, default="")
    stored_path: Mapped[str] = mapped_column(String(600), default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    parse_state: Mapped[str] = mapped_column(String(20), default=ParseState.pending.value)
    parse_error: Mapped[str] = mapped_column(Text, default="")
    extraction_revision: Mapped[int] = mapped_column(Integer, default=0)
    markdown: Mapped[str] = mapped_column(Text, default="")
    uploaded_by: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Candidate(Base):
    """Something Mistral proposes from a document, before a person accepts it.

    Extraction used to write nodes directly, which turned one paper into dozens of
    cards nobody had read. A candidate is the same content held on the source node
    until someone promotes it, so the canvas only ever shows what a human chose.
    """

    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("cnd"))
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(400))
    body: Mapped[str] = mapped_column(Text, default="")
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_quote: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    extraction_revision: Mapped[int] = mapped_column(Integer, default=1)

    # Set when someone accepts it, so the review list can show what is already on
    # the canvas rather than offering the same thing twice.
    promoted_node_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("nod"))
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(400))
    body: Mapped[str] = mapped_column(Text, default="")

    # Layout is stored apart from meaning so re-parsing never moves a user's nodes.
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)

    # Provenance
    evidence_class: Mapped[str] = mapped_column(String(20), default=Evidence.asserted.value)
    source_asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_quote: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    extraction_revision: Mapped[int] = mapped_column(Integer, default=0)

    # Governance — constraint nodes carry machine-verifiable rules
    rule_definition: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Task-only fields
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    task_status: Mapped[str] = mapped_column(String(40), default="open")
    jira_issue_key: Mapped[str] = mapped_column(String(60), default="", index=True)
    jira_issue_id: Mapped[str] = mapped_column(String(60), default="")
    jira_url: Mapped[str] = mapped_column(String(600), default="")
    jira_sync_state: Mapped[str] = mapped_column(String(20), default=SyncState.pending.value)
    jira_sync_error: Mapped[str] = mapped_column(Text, default="")

    pr_url: Mapped[str] = mapped_column(String(600), default="")
    pr_title: Mapped[str] = mapped_column(String(400), default="")
    pr_state: Mapped[str] = mapped_column(String(40), default="")
    pr_reported_by: Mapped[str] = mapped_column(String(120), default="")
    pr_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pr_comment_synced: Mapped[bool] = mapped_column(Boolean, default=False)

    # Alignment leaves an audit trail on the task, not a separate node kind.
    decision_state: Mapped[str] = mapped_column(String(40), default="")
    decision_rationale: Mapped[str] = mapped_column(Text, default="")
    decision_by: Mapped[str] = mapped_column(String(120), default="")
    decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Last Check Alignment / Present / Review outputs, so the UI can reopen them.
    alignment_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    present_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    review_checklist: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_by: Mapped[str] = mapped_column(String(40), default="")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    board: Mapped[Board] = relationship(back_populates="nodes")


class Edge(Base):
    __tablename__ = "edges"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", "relation", name="uq_edge"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("edg"))
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), index=True)
    target_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), index=True)
    relation: Mapped[str] = mapped_column(String(40))
    created_by: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BriefCache(Base):
    """Mistral task briefs keyed by a hash of the task plus its ancestor revisions."""

    __tablename__ = "brief_cache"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("brf"))
    task_id: Mapped[str] = mapped_column(String(40), index=True)
    lineage_hash: Mapped[str] = mapped_column(String(80), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    model: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ActivityLog(Base):
    """Audit trail. MCP tool calls land here too, since agents are writers."""

    __tablename__ = "activity_log"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("act"))
    board_id: Mapped[str] = mapped_column(String(40), index=True, default="")
    actor: Mapped[str] = mapped_column(String(160), default="")
    action: Mapped[str] = mapped_column(String(80), default="")
    subject_id: Mapped[str] = mapped_column(String(40), default="")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
