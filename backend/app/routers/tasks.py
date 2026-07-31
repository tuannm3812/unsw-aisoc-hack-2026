from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import board_for_user, current_user
from ..db import get_db
from ..models import Membership, Node, NodeKind, SyncState, User, utcnow
from ..schemas import (
    AgentRunRequest,
    AgentRunResult,
    AlignmentResult,
    DecisionRequest,
    NodeOut,
    PresentResult,
    ReviewChecklistResult,
    TaskContextOut,
    UserOut,
)
from ..services.context import lineage_titles, task_context
from ..services.graph import log_activity, task_description_paragraphs, touch
from ..services.jira_service import JiraAmbiguous, JiraError, jira_service
from ..services.lineage import assemble_lineage
from ..services.mistral_service import MistralError, mistral_service
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


@router.post("/{board_id}/tasks/{task_id}/align", response_model=AlignmentResult)
async def check_alignment(
    board_id: str,
    task_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AlignmentResult:
    """Flag contradictions among the nodes that feed this task."""
    board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)
    lineage = assemble_lineage(db, task)
    result = await mistral_service.check_alignment(lineage)
    task.alignment_payload = result.model_dump()
    touch(task)
    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="task.aligned",
        subject_id=task.id,
        detail={"conflicts": len(result.conflicts), "by": result.generated_by},
    )
    db.commit()
    return result


@router.post("/{board_id}/tasks/{task_id}/decision", response_model=NodeOut)
def record_decision(
    board_id: str,
    task_id: str,
    payload: DecisionRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Node:
    board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)
    task.decision_state = payload.state
    task.decision_rationale = payload.rationale.strip()
    task.decision_by = user.name
    task.decision_at = utcnow()
    touch(task)
    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="task.decision",
        subject_id=task.id,
        detail={"state": payload.state},
    )
    db.commit()
    db.refresh(task)
    return task


@router.post("/{board_id}/tasks/{task_id}/present", response_model=PresentResult)
async def present_task(
    board_id: str,
    task_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PresentResult:
    """End-to-end stakeholder present: knowledge lineage + engineering delivery."""
    board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)
    lineage = assemble_lineage(db, task)
    work = await _build_work_context(db, task)
    try:
        result = await mistral_service.present_task(lineage, work)
    except MistralError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    task.present_payload = result.model_dump()
    touch(task)
    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="task.presented",
        subject_id=task.id,
        detail={
            "beats": len(result.beats),
            "has_image": bool(result.image_url),
            "has_pr": bool(task.pr_url),
        },
    )
    db.commit()
    return result


@router.post("/{board_id}/tasks/{task_id}/review-checklist", response_model=ReviewChecklistResult)
async def review_checklist(
    board_id: str,
    task_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ReviewChecklistResult:
    """Map the linked PR against lineage constraints."""
    board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)
    if not task.pr_url:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Link a pull request before running the constraint checklist",
        )
    lineage = assemble_lineage(db, task)
    result = await mistral_service.review_constraints(
        lineage, task.pr_title, task.pr_url, task.pr_state
    )
    task.review_checklist = [item.model_dump() for item in result.items]
    touch(task)
    log_activity(
        db,
        board_id=board_id,
        actor=user.name,
        action="task.review_checklist",
        subject_id=task.id,
        detail={"items": len(result.items)},
    )
    db.commit()
    return result


@router.post("/{board_id}/tasks/{task_id}/agent-run", response_model=AgentRunResult)
async def agent_run(
    board_id: str,
    task_id: str,
    payload: AgentRunRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AgentRunResult:
    """Route a canvas action through named specialists, with activity events for the UI.

    Prefers a live Conversations API kick when agent ids are provisioned, then always
    runs our graph tools so Spatial Brain stays the system of record.
    """
    board_for_user(db, board_id, user)
    task = _task_or_404(db, board_id, task_id)
    events = [f"Coordinator received '{payload.action}' for {task.title}"]

    if payload.action == "align":
        lineage = assemble_lineage(db, task)
        events.extend(
            await mistral_service.start_specialist_conversation(
                "align",
                f"Find contradictions among findings/constraints for task "
                f"'{task.title}'. Context:\n{_lineage_prompt(lineage)}",
            )
        )
        if len(events) == 1:
            events.append("Handed off to Arbiter")
        result = await check_alignment(board_id, task_id, user, db)
        events.append(f"Arbiter returned {len(result.conflicts)} conflict(s)")
        return AgentRunResult(action="align", status="ok", events=events, alignment=result)

    if payload.action in {"present", "brief"}:
        review_result = None
        if task.pr_url and (payload.action == "brief" or not task.review_checklist):
            events.append("Handed off to Reviewer before Present")
            events.extend(
                await mistral_service.start_specialist_conversation(
                    "review",
                    f"Check PR '{task.pr_title}' ({task.pr_url}) against constraints "
                    f"for '{task.title}'.",
                )
            )
            try:
                review_result = await review_checklist(board_id, task_id, user, db)
                db.refresh(task)
                events.append(f"Reviewer checked {len(review_result.items)} constraint(s)")
            except HTTPException as exc:
                events.append(f"Review skipped: {exc.detail}")

        events.append("Handed off to Narrator")
        lineage = assemble_lineage(db, task)
        work = await _build_work_context(db, task)
        events.extend(
            await mistral_service.start_specialist_conversation(
                "present",
                f"Draft an end-to-end stakeholder present for '{task.title}' including "
                f"knowledge lineage and engineering delivery.\n"
                f"Delivery:\n{_format_work_for_agent(work)}",
            )
        )
        try:
            result = await mistral_service.present_task(lineage, work)
        except MistralError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
        task.present_payload = result.model_dump()
        touch(task)
        log_activity(
            db,
            board_id=board_id,
            actor=user.name,
            action="task.presented",
            subject_id=task.id,
            detail={"beats": len(result.beats), "end_to_end": True},
        )
        db.commit()
        events.append(f"Narrator produced {len(result.beats)} beats")
        return AgentRunResult(
            action=payload.action,
            status="ok",
            events=events,
            present=result,
            review=review_result,
        )

    if payload.action == "review":
        events.append("Handed off to Reviewer")
        if not task.pr_url:
            return AgentRunResult(
                action="review",
                status="needs_pr",
                events=events + ["No pull request on this task yet"],
                detail="Link a PR first",
            )
        lineage = assemble_lineage(db, task)
        events.extend(
            await mistral_service.start_specialist_conversation(
                "review",
                f"Check PR '{task.pr_title}' ({task.pr_url}) against constraints "
                f"for '{task.title}'. Context:\n{_lineage_prompt(lineage)}",
            )
        )
        result = await review_checklist(board_id, task_id, user, db)
        events.append(f"Reviewer checked {len(result.items)} constraint(s)")
        return AgentRunResult(action="review", status="ok", events=events, review=result)

    return AgentRunResult(
        action=payload.action,
        status="unsupported",
        events=events,
        detail="Sense runs automatically on upload; use Align, Present/Brief, or Review here.",
    )


async def _build_work_context(db: Session, task: Node) -> dict:
    """Assemble Jira/PR/checklist (+ optional live PR notes) for Present."""
    assignee = db.get(User, task.assignee_id) if task.assignee_id else None
    checklist_items = task.review_checklist or []
    if isinstance(checklist_items, dict):
        checklist_items = checklist_items.get("items") or []

    delivery_notes = ""
    if task.pr_url:
        delivery_notes = await mistral_service.fetch_delivery_notes(
            pr_url=task.pr_url,
            pr_title=task.pr_title,
            pr_state=task.pr_state,
        )

    parts = []
    if assignee:
        parts.append(f"Assigned to {assignee.name}")
    if task.jira_issue_key:
        parts.append(f"Jira {task.jira_issue_key}")
    if task.pr_url:
        parts.append(f"PR {task.pr_state or 'linked'}: {task.pr_title or task.pr_url}")
    else:
        parts.append("No pull request linked yet")
    if checklist_items:
        passes = sum(1 for i in checklist_items if i.get("status") == "pass")
        fails = sum(1 for i in checklist_items if i.get("status") == "fail")
        parts.append(f"Checklist {passes} pass / {fails} fail / {len(checklist_items)} total")

    checklist_summary = ""
    if checklist_items:
        checklist_summary = "; ".join(
            f"{i.get('status')}: {i.get('title')}" for i in checklist_items[:8]
        )

    return {
        "task_status": task.task_status,
        "assignee_name": assignee.name if assignee else "",
        "decision_state": task.decision_state or "",
        "decision_rationale": task.decision_rationale or "",
        "jira_issue_key": task.jira_issue_key or "",
        "jira_url": task.jira_url or "",
        "pr_url": task.pr_url or "",
        "pr_title": task.pr_title or "",
        "pr_state": task.pr_state or "",
        "pr_reported_by": task.pr_reported_by or "",
        "checklist_items": checklist_items,
        "checklist_summary": checklist_summary,
        "delivery_notes": delivery_notes,
        "work_summary": " · ".join(parts),
    }


def _format_work_for_agent(work: dict) -> str:
    return (
        f"{work.get('work_summary')}\n"
        f"Delivery notes: {(work.get('delivery_notes') or '')[:1200]}\n"
        f"Checklist: {work.get('checklist_summary') or 'none'}"
    )


def _lineage_prompt(lineage) -> str:
    lines = []
    for node in lineage.nodes[:40]:
        lines.append(f"- [{node.kind}] ({node.id}) {node.title}: {(node.body or '')[:240]}")
    return "\n".join(lines)


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
