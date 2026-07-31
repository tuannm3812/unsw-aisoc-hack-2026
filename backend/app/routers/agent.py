"""The surface MCP exposes to coding agents.

Kept as ordinary HTTP so it can be curled, tested, and demonstrated without an MCP
client attached. The MCP server in app/mcp is a thin wrapper over these endpoints.

Authentication is a static bearer token, deliberately separate from user sessions.
Document text reaches an agent only as data inside a response body, so an uploaded
PDF can never authorise a tool call.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import require_mcp_token
from ..db import get_db
from ..models import Board, Node, NodeKind, User
from ..schemas import PullRequestReport, TaskContextOut
from ..services.context import task_context
from ..services.graph import log_activity
from ..services.jira_service import JiraError, jira_service
from ..services.notify import notify

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/agent",
    tags=["agent"],
    dependencies=[Depends(require_mcp_token)],
)


@router.get("/tasks")
def list_tasks(
    board_id: str | None = None,
    assignee_email: str | None = None,
    include_done: bool = False,
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Node).filter(Node.kind == NodeKind.task.value)
    if board_id:
        query = query.filter(Node.board_id == board_id)
    if not include_done:
        query = query.filter(Node.task_status != "done")
    if assignee_email:
        assignee = db.query(User).filter(User.email == assignee_email.lower()).one_or_none()
        if assignee is None:
            return {"tasks": []}
        query = query.filter(Node.assignee_id == assignee.id)

    tasks = query.order_by(Node.updated_at.desc()).limit(50).all()
    boards = {board.id: board.name for board in db.query(Board).all()}

    return {
        "tasks": [
            {
                "task_id": task.id,
                "title": task.title,
                "board_id": task.board_id,
                "board_name": boards.get(task.board_id, ""),
                "status": task.task_status,
                "assignee": _assignee_name(db, task),
                "jira_issue_key": task.jira_issue_key,
                "jira_url": task.jira_url,
                "pull_request_url": task.pr_url,
                "updated_at": task.updated_at.isoformat(),
            }
            for task in tasks
        ]
    }


@router.get("/tasks/{task_id}/context", response_model=TaskContextOut)
async def get_context(
    task_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
) -> TaskContextOut:
    """Structured lineage plus the Mistral brief.

    The nodes, relation paths, revisions and quotes are the authoritative part. The
    brief is a summary of them and must not be treated as a substitute.
    """
    task = _task_or_404(db, task_id)
    lineage, brief = await task_context(db, task, refresh=refresh)

    from ..schemas import NodeOut, UserOut  # local import keeps the module import light

    assignee = db.get(User, task.assignee_id) if task.assignee_id else None
    log_activity(
        db,
        board_id=task.board_id,
        actor="mcp-agent",
        action="agent.context_read",
        subject_id=task.id,
        detail={"nodes": len(lineage.nodes), "truncated": lineage.truncated},
    )
    db.commit()

    return TaskContextOut(
        task=NodeOut.model_validate(task),
        assignee=UserOut.model_validate(assignee) if assignee else None,
        jira_issue_key=task.jira_issue_key,
        jira_url=task.jira_url,
        lineage=lineage,
        brief=brief,
    )


@router.post("/tasks/{task_id}/pull-request")
async def report_pull_request(
    task_id: str,
    payload: PullRequestReport,
    db: Session = Depends(get_db),
) -> dict:
    """Record the pull request an agent opened for a task.

    State is whatever the agent asserts; nothing here talks to GitHub. The canvas
    badge is the part the demo shows, so a failing Jira comment is reported back
    but does not undo the write.
    """
    task = _task_or_404(db, task_id)

    task.pr_url = payload.url
    task.pr_title = payload.title
    task.pr_state = payload.state
    task.pr_reported_by = payload.reported_by
    task.pr_reported_at = datetime.now(timezone.utc)
    task.revision += 1

    log_activity(
        db,
        board_id=task.board_id,
        actor=f"mcp-agent:{payload.reported_by}",
        action="agent.pull_request_reported",
        subject_id=task.id,
        detail={"url": payload.url, "state": payload.state},
    )
    db.commit()
    db.refresh(task)

    commented = False
    comment_error = ""
    if task.jira_issue_key and jira_service.enabled:
        try:
            await jira_service.add_comment(
                task.jira_issue_key,
                [
                    f"Pull request {payload.state}: {payload.title or payload.url}",
                    payload.url,
                    f"Reported through Spatial Brain MCP by {payload.reported_by}.",
                ],
            )
            commented = True
        except JiraError as exc:
            comment_error = str(exc)
            logger.warning("Jira comment failed for %s: %s", task.jira_issue_key, exc)

    await notify(
        f"Pull request {payload.state} for {task.title}",
        [payload.title or payload.url, payload.url],
    )

    return {
        "ok": True,
        "task_id": task.id,
        "pull_request": {
            "url": task.pr_url,
            "title": task.pr_title,
            "state": task.pr_state,
            "reported_by": task.pr_reported_by,
            "reported_at": task.pr_reported_at.isoformat() if task.pr_reported_at else None,
        },
        "jira_issue_key": task.jira_issue_key,
        "jira_commented": commented,
        "jira_comment_error": comment_error,
    }


def _assignee_name(db: Session, task: Node) -> str:
    if not task.assignee_id:
        return ""
    user = db.get(User, task.assignee_id)
    return user.name if user else ""


def _task_or_404(db: Session, task_id: str) -> Node:
    task = (
        db.query(Node)
        .filter(Node.id == task_id, Node.kind == NodeKind.task.value)
        .one_or_none()
    )
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task
