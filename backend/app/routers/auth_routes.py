from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user, issue_session, verify_password
from ..config import settings
from ..db import get_db
from ..models import User
from ..schemas import LoginRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.email == payload.email.strip().lower()).one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")

    response.set_cookie(
        settings.session_cookie,
        issue_session(user.id),
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24,
        path="/",
    )
    return user


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(settings.session_cookie, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@router.get("/demo-accounts", response_model=list[UserOut])
def demo_accounts(db: Session = Depends(get_db)) -> list[User]:
    """The seeded team, so the login screen can offer one-click sign-in."""
    return db.query(User).order_by(User.created_at).all()


class TeamLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


@router.post("/team-login", response_model=UserOut)
def team_login(
    payload: TeamLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> User:
    """Sign in with the shared team password.

    Startup teams don't need individual accounts to get started. Anyone who
    knows the team password gets a session as the board admin (first user),
    so they can immediately see the board and invite others.
    """
    if not settings.team_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Team access is not enabled")

    if payload.password != settings.team_password:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong team password")

    user = db.query(User).order_by(User.created_at).first()
    if user is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No team members seeded yet")

    response.set_cookie(
        settings.session_cookie,
        issue_session(user.id),
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24,
        path="/",
    )
    return user
