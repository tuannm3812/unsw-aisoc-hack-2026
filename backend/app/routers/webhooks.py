"""Inbound webhooks so Jira and GitHub can update the canvas without a human telling it."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import Node, NodeKind, utcnow
from ..services.graph import log_activity, touch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
    x_github_delivery: str | None = Header(default=None),
) -> dict:
    raw = await request.body()
    secret = getattr(settings, "github_webhook_secret", "") or ""
    if secret:
        expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not x_hub_signature_256 or not hmac.compare_digest(expected, x_hub_signature_256):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad GitHub signature")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON") from exc

    if x_github_event != "pull_request":
        return {"ok": True, "ignored": x_github_event}

    pr = payload.get("pull_request") or {}
    url = pr.get("html_url") or ""
    if not url:
        return {"ok": True, "ignored": "no url"}

    action = payload.get("action")
    state = "merged" if pr.get("merged") else (pr.get("state") or "open")
    title = pr.get("title") or ""

    db: Session = SessionLocal()
    try:
        tasks = (
            db.query(Node)
            .filter(Node.kind == NodeKind.task.value, Node.pr_url == url)
            .all()
        )
        updated = 0
        for task in tasks:
            task.pr_title = title or task.pr_title
            task.pr_state = state
            touch(task)
            log_activity(
                db,
                board_id=task.board_id,
                actor="github",
                action="pr.webhook",
                subject_id=task.id,
                detail={"delivery": x_github_delivery, "event_action": action, "state": state},
            )
            updated += 1
        db.commit()
        return {"ok": True, "updated": updated, "delivery": x_github_delivery}
    finally:
        db.close()


@router.post("/jira")
async def jira_webhook(
    request: Request,
    x_spatial_secret: str | None = Header(default=None),
) -> dict:
    """Jira Automation 'Send web request' target.

    Expected JSON (smart values):
      {"issue_key": "{{issue.key}}", "status": "{{issue.fields.status.name}}",
       "task_id": "{{issue.properties.spatial_task_id}}"}
    Or match by jira_issue_key alone.
    """
    expected = getattr(settings, "jira_webhook_secret", "") or ""
    if expected and x_spatial_secret != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad webhook secret")

    payload = await request.json()
    issue_key = str(payload.get("issue_key") or payload.get("key") or "")
    status_name = str(payload.get("status") or "").strip().lower()
    task_id = str(payload.get("task_id") or "")

    status_map = {
        "to do": "assigned",
        "todo": "assigned",
        "in progress": "in_progress",
        "in review": "in_review",
        "done": "done",
        "closed": "done",
    }
    mapped = status_map.get(status_name)

    db: Session = SessionLocal()
    try:
        query = db.query(Node).filter(Node.kind == NodeKind.task.value)
        if task_id:
            query = query.filter(Node.id == task_id)
        elif issue_key:
            query = query.filter(Node.jira_issue_key == issue_key)
        else:
            return {"ok": True, "ignored": "no key"}

        tasks = query.all()
        updated = 0
        for task in tasks:
            if mapped and task.task_status != mapped:
                task.task_status = mapped
                touch(task)
                log_activity(
                    db,
                    board_id=task.board_id,
                    actor="jira",
                    action="task.status_webhook",
                    subject_id=task.id,
                    detail={"status": mapped, "issue_key": issue_key or task.jira_issue_key},
                )
                updated += 1
        db.commit()
        return {"ok": True, "updated": updated}
    finally:
        db.close()
