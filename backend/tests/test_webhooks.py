"""Tests for inbound GitHub / Jira webhook handlers."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.db import SessionLocal, init_db
from app.main import app
from app.models import Board, Membership, Node, NodeKind, User, new_id


def _client() -> TestClient:
    init_db()
    return TestClient(app)


def _seed_task_with_pr(pr_url: str, jira_key: str = "SB-99") -> str:
    db = SessionLocal()
    try:
        user = User(
            id=new_id("usr"),
            email=f"{new_id('em')}@test.dev",
            name="Hook",
            password_hash="x",
        )
        board = Board(id=new_id("brd"), name="Hooks")
        membership = Membership(
            id=new_id("mem"),
            board_id=board.id,
            user_id=user.id,
            board_role="owner",
        )
        task = Node(
            id=new_id("nod"),
            board_id=board.id,
            kind=NodeKind.task.value,
            title="Webhook task",
            body="",
            x=0,
            y=0,
            created_by=user.id,
            revision=1,
            pr_url=pr_url,
            pr_title="Old title",
            pr_state="open",
            jira_issue_key=jira_key,
            task_status="assigned",
        )
        db.add_all([user, board, membership, task])
        db.commit()
        return task.id
    finally:
        db.close()


def test_github_webhook_updates_pr_state():
    client = _client()
    suffix = new_id("pr")
    pr_url = f"https://github.com/acme/repo/pull/{suffix}"
    task_id = _seed_task_with_pr(pr_url)
    response = client.post(
        "/api/webhooks/github",
        headers={"X-GitHub-Event": "pull_request", "X-GitHub-Delivery": "d1"},
        content=json.dumps(
            {
                "action": "closed",
                "pull_request": {
                    "html_url": pr_url,
                    "title": "Fix recovery OTP",
                    "state": "closed",
                    "merged": True,
                },
            }
        ),
    )
    assert response.status_code == 200
    assert response.json()["updated"] >= 1

    db = SessionLocal()
    try:
        task = db.get(Node, task_id)
        assert task is not None
        assert task.pr_state == "merged"
        assert task.pr_title == "Fix recovery OTP"
    finally:
        db.close()


def test_jira_webhook_maps_status():
    client = _client()
    suffix = new_id("pr")
    jira_key = f"SB-{suffix[-6:]}"
    task_id = _seed_task_with_pr(f"https://github.com/acme/repo/pull/{suffix}", jira_key=jira_key)
    response = client.post(
        "/api/webhooks/jira",
        headers={"X-Spatial-Secret": "spatial-jira-demo"},
        json={"issue_key": jira_key, "status": "In Progress", "task_id": task_id},
    )
    assert response.status_code == 200
    assert response.json()["updated"] == 1

    db = SessionLocal()
    try:
        task = db.get(Node, task_id)
        assert task is not None
        assert task.task_status == "in_progress"
    finally:
        db.close()
