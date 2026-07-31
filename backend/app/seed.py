"""Seed the demo team and a partly-built board.

The story starts mid-conversation: the scientist has already dropped a paper and the
team has annotated it, so the live demo only needs to add one node, create one task,
and assign it. Run with `python -m app.seed`.
"""

from __future__ import annotations

import asyncio

from sqlalchemy.orm import Session

from .auth import hash_password
from .config import settings
from .db import SessionLocal, init_db
from .services.jira_service import JiraError, jira_service
from .models import (
    ActivityLog,
    Asset,
    Board,
    BriefCache,
    Candidate,
    Edge,
    Membership,
    Node,
    NodeKind,
    Relation,
    User,
    new_id,
)
from .services.graph import connect, create_node

DEMO_PASSWORD = "spatial"

TEAM = [
    {
        "email": "priya@spatialbrain.dev",
        "name": "Priya Raman",
        "role": "admin",
        "discipline": "Product manager",
        "board_role": "admin",
    },
    {
        "email": "aisha@spatialbrain.dev",
        "name": "Dr Aisha Khan",
        "role": "member",
        "discipline": "Research scientist",
        "board_role": "member",
    },
    {
        "email": "marco@spatialbrain.dev",
        "name": "Marco Silva",
        "role": "member",
        "discipline": "Software engineer",
        "board_role": "member",
    },
]

# Pre-built knowledge so the canvas is not empty when the demo starts. These are
# asserted by people, not extracted, so they carry no fake page citations.
SEED_FINDINGS = [
    (
        "Retrieval latency dominates perceived response time",
        "Instrumentation across three pilot teams put retrieval at 68 percent of "
        "end-to-end latency, well ahead of generation.",
        -120.0,
        -210.0,
    ),
    (
        "Reviewers distrust answers without a source",
        "In shadowing sessions, reviewers rejected 7 of 9 unsourced summaries even "
        "when the content was correct.",
        -120.0,
        -70.0,
    ),
    (
        "Email OTP is required for account recovery",
        "Security review concluded that magic-link-only recovery fails compliance: "
        "every recovery path must include a one-time email code.",
        -120.0,
        80.0,
    ),
]

SEED_CONSTRAINTS = [
    (
        "Every generated claim must cite its source span",
        "A claim without a retrievable span is treated as unusable by the review team.",
        220.0,
        -140.0,
    ),
    (
        "Magic links only — no passwords or OTP codes",
        "Product decided the auth UX must stay passwordless with magic links alone; "
        "OTP codes and passwords are out of scope.",
        220.0,
        80.0,
    ),
]


def map_jira_accounts(db: Session) -> dict[str, str]:
    """Point the seeded users at the Jira account that owns the API token.

    The demo team are local accounts that do not exist on any Jira site, so the
    assignable-user search finds nothing and issues come out unassigned. A free dev
    site normally has exactly one real user, so every demo user maps to that account.
    Say so when presenting: on a real site these would be separate people.
    """
    if not jira_service.enabled:
        return {"status": "jira not configured"}

    try:
        account_id = (asyncio.run(jira_service.verify()))["account_id"]
    except JiraError as exc:
        return {"status": f"could not read the Jira account: {exc}"}
    if not account_id:
        return {"status": "Jira returned no accountId"}

    users = db.query(User).all()
    for user in users:
        user.jira_account_id = account_id
    db.commit()
    return {"status": f"mapped {len(users)} users to {account_id}"}


def seed(reset: bool = False) -> dict[str, str]:
    init_db()
    db: Session = SessionLocal()
    try:
        if reset:
            # Everything, so a rehearsal starts from the same board every time. The
            # brief cache in particular would otherwise answer for deleted nodes.
            for model in (
                Edge,
                Candidate,
                Node,
                Asset,
                BriefCache,
                ActivityLog,
                Membership,
                Board,
                User,
            ):
                db.query(model).delete()
            db.commit()

        existing = db.query(User).count()
        if existing and not reset:
            board = db.query(Board).first()
            return {
                "status": "already seeded",
                "board_id": board.id if board else "",
            }

        users: dict[str, User] = {}
        for entry in TEAM:
            user = User(
                id=new_id("usr"),
                email=entry["email"],
                name=entry["name"],
                role=entry["role"],
                discipline=entry["discipline"],
                password_hash=hash_password(DEMO_PASSWORD),
            )
            db.add(user)
            users[entry["email"]] = user

        board = Board(
            id=new_id("brd"),
            name="Grounded answers initiative",
            summary=(
                "Turning retrieval research into shipped product work without losing "
                "the reasoning in between."
            ),
            jira_project_key=settings.jira_project_key,
        )
        db.add(board)
        db.flush()

        for entry in TEAM:
            db.add(
                Membership(
                    id=new_id("mem"),
                    board_id=board.id,
                    user_id=users[entry["email"]].id,
                    board_role=entry["board_role"],
                )
            )

        scientist = users["aisha@spatialbrain.dev"]
        findings = [
            create_node(
                db,
                board_id=board.id,
                kind=NodeKind.finding.value,
                title=title,
                body=body,
                x=x,
                y=y,
                created_by=scientist.id,
                evidence_class="asserted",
            )
            for title, body, x, y in SEED_FINDINGS
        ]
        constraints = [
            create_node(
                db,
                board_id=board.id,
                kind=NodeKind.constraint.value,
                title=title,
                body=body,
                x=x,
                y=y,
                created_by=scientist.id,
                evidence_class="asserted",
            )
            for title, body, x, y in SEED_CONSTRAINTS
        ]
        db.flush()

        # The citation constraint follows from the trust finding.
        connect(
            db,
            board_id=board.id,
            source_id=findings[1].id,
            target_id=constraints[0].id,
            relation=Relation.supports.value,
            created_by=scientist.id,
        )

        # Cross-discipline contradiction for Check Alignment: Science OTP finding
        # vs Product magic-links-only constraint.
        pm = users["priya@spatialbrain.dev"]
        constraints[1].created_by = pm.id
        task = create_node(
            db,
            board_id=board.id,
            kind=NodeKind.task.value,
            title="Ship passwordless account recovery",
            body="Implement recovery so a locked-out user can get back in without a password.",
            x=520.0,
            y=-40.0,
            created_by=pm.id,
            evidence_class="asserted",
        )
        db.flush()
        connect(
            db,
            board_id=board.id,
            source_id=findings[2].id,
            target_id=task.id,
            relation=Relation.supports.value,
            created_by=scientist.id,
        )
        connect(
            db,
            board_id=board.id,
            source_id=constraints[1].id,
            target_id=task.id,
            relation=Relation.constrains.value,
            created_by=pm.id,
        )
        db.commit()

        jira = map_jira_accounts(db)
        return {"status": "seeded", "board_id": board.id, "jira": jira["status"]}
    finally:
        db.close()


if __name__ == "__main__":
    import sys

    # --map-jira alone re-points existing users without touching the board, for when
    # credentials arrive after the board is already built.
    if "--map-jira" in sys.argv and "--reset" not in sys.argv:
        init_db()
        session = SessionLocal()
        try:
            print(map_jira_accounts(session)["status"])
        finally:
            session.close()
        raise SystemExit(0)

    result = seed(reset="--reset" in sys.argv)
    print(f"{result['status']}: board {result['board_id']}")
    if result.get("jira"):
        print(f"Jira: {result['jira']}")
    print(f"Sign in with any of: {', '.join(entry['email'] for entry in TEAM)}")
    print(f"Password: {DEMO_PASSWORD}")
