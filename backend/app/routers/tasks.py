from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import board_for_user, current_user
from ..db import get_db
from ..models import Membership, Node, NodeKind, SyncState, User
from ..schemas import NodeOut, TaskContextOut, UserOut
from ..services.context import lineage_titles, task_context
from ..services.graph import log_activity, task_description_paragraphs, touch
from ..services.jira_service import JiraAmbiguous, JiraError, jira_service
from ..services.lineage import assemble_lineage
from ..services.notify import notify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/boards", tags=["tasks"])


@router.get("/{board_id}/tasks/{task_id}/context", response_model=TaskContextOut)
async def get_task_context(
    board_id: str,
    task_id: str,
    refresh: bool = False,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskContextOut:
    board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)
    lineage, brief = await task_context(db, task, refresh=refresh)
    assignee = db.get(User, task.assignee_id) if task.assignee_id else None
    return TaskContextOut(
        task=NodeOut.model_validate(task),
        assignee=UserOut.model_validate(assignee) if assignee else None,
        jira_issue_key=task.jira_issue_key,
        jira_url=task.jira_url,
        lineage=lineage,
        brief=brief,
    )


@router.post("/{board_id}/tasks/{task_id}/assign", response_model=NodeOut)
async def assign_task(
    board_id: str,
    task_id: str,
    payload: dict,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Node:
    """Assignment is the one human approval gate before work leaves the canvas."""
    board = board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)

    assignee_id = str(payload.get("assignee_id") or "")
    create_issue = bool(payload.get("create_jira_issue", True))

    assignee = db.get(User, assignee_id)
    if assignee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person does not exist")
    is_member = (
        db.query(Membership)
        .filter(Membership.board_id == board_id, Membership.user_id == assignee_id)
        .one_or_none()
    )
    if is_member is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That person is not on this board")

    task.assignee_id = assignee_id
    if task.task_status == "open":
        task.task_status = "assigned"
    touch(task)
    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="task.assigned",
        subject_id=task.id,
        detail={"assignee": assignee.name},
    )
    db.commit()

    if create_issue and jira_service.enabled and not task.jira_issue_key:
        await _create_jira_issue(db, board_id=board_id, task=task, assignee=assignee)

    detail = [f"Assigned to {assignee.name}"]
    if task.jira_issue_key:
        detail.append(f"Jira {task.jira_issue_key}: {task.jira_url}")
    await notify(f"Task assigned on {board.name}: {task.title}", detail)

    db.refresh(task)
    return task


@router.post("/{board_id}/tasks/{task_id}/jira-retry", response_model=NodeOut)
async def retry_jira(
    board_id: str,
    task_id: str,
    force: bool = False,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Node:
    """Retry a failed Jira create.

    An ambiguous result means Jira may already hold the issue, so retrying it needs
    `force=true` and a human who has looked at the project.
    """
    board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)

    if not jira_service.enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Jira is not configured")
    if task.jira_issue_key:
        return task
    if not task.assignee_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assign the task first")
    if task.jira_sync_state == SyncState.ambiguous.value and not force:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The earlier attempt may have created an issue. Check Jira, then retry with force=true.",
        )

    assignee = db.get(User, task.assignee_id)
    if assignee is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The assignee no longer exists")

    task.jira_sync_state = SyncState.pending.value
    db.commit()
    await _create_jira_issue(db, board_id=board_id, task=task, assignee=assignee)
    db.refresh(task)
    return task


async def _create_jira_issue(
    db: Session,
    *,
    board_id: str,
    task: Node,
    assignee: User,
) -> None:
    """Guarded by the node's sync state, since Jira create has no idempotency key."""
    if task.jira_sync_state == SyncState.creating.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "A Jira issue is already being created")

    task.jira_sync_state = SyncState.creating.value
    db.commit()

    lineage = assemble_lineage(db, task)
    titles = lineage_titles(db, lineage)

    account_id = assignee.jira_account_id
    if not account_id:
        account_id = await jira_service.find_account_id(assignee.email, assignee.name)
        if account_id:
            assignee.jira_account_id = account_id
            db.commit()

    try:
        result = await jira_service.create_issue(
            summary=task.title,
            description_paragraphs=task_description_paragraphs(task, titles),
            account_id=account_id or None,
            board_id=board_id,
            task_id=task.id,
            revision=task.revision,
        )
    except JiraAmbiguous as exc:
        # Never retry automatically: Jira may already hold the issue.
        task.jira_sync_state = SyncState.ambiguous.value
        task.jira_sync_error = str(exc)[:500]
        db.commit()
        logger.error("Ambiguous Jira create for %s: %s", task.id, exc)
        return
    except JiraError as exc:
        task.jira_sync_state = SyncState.failed.value
        task.jira_sync_error = str(exc)[:500]
        db.commit()
        logger.warning("Jira create failed for %s: %s", task.id, exc)
        return

    task.jira_issue_id = result.issue_id
    task.jira_issue_key = result.issue_key
    task.jira_url = result.url
    task.jira_sync_state = SyncState.synced.value
    task.jira_sync_error = ""
    log_activity(
        db,
        board_id=board_id,
        actor="jira",
        action="task.synced",
        subject_id=task.id,
        detail={"issue_key": result.issue_key, "calls": [call.__dict__ for call in result.calls]},
    )
    db.commit()


def _task_or_404(db: Session, board_id: str, task_id: str) -> Node:
    task = (
        db.query(Node)
        .filter(Node.id == task_id, Node.board_id == board_id, Node.kind == NodeKind.task.value)
        .one_or_none()
    )
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task
