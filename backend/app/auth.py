from __future__ import annotations

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Board, Membership, User

serializer = URLSafeSerializer(settings.session_secret, salt="spatial-session")

# bcrypt hashes at most 72 bytes and raises on anything longer.
_MAX_PASSWORD_BYTES = 72


def _encode(raw: str) -> bytes:
    return raw.encode("utf-8")[:_MAX_PASSWORD_BYTES]


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(_encode(raw), bcrypt.gensalt()).decode("ascii")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_encode(raw), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def issue_session(user_id: str) -> str:
    return serializer.dumps({"uid": user_id})


def read_session(token: str) -> str | None:
    try:
        data = serializer.loads(token)
    except BadSignature:
        return None
    return data.get("uid")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.session_cookie)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    user_id = read_session(token)
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session is invalid")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account no longer exists")
    return user


def board_for_user(db: Session, board_id: str, user: User) -> Board:
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    membership = (
        db.query(Membership)
        .filter(Membership.board_id == board_id, Membership.user_id == user.id)
        .one_or_none()
    )
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a member of this board")
    return board


def require_board_admin(db: Session, board_id: str, user: User) -> Board:
    board = board_for_user(db, board_id, user)
    membership = (
        db.query(Membership)
        .filter(Membership.board_id == board_id, Membership.user_id == user.id)
        .one()
    )
    if membership.board_role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only board admins can do that")
    return board


def require_mcp_token(request: Request) -> str:
    """MCP agents present a bearer token. Documents can never mint one."""
    header = request.headers.get("authorization", "")
    supplied = header.removeprefix("Bearer ").strip() if header.startswith("Bearer ") else ""
    if not supplied:
        supplied = request.headers.get("x-mcp-token", "").strip()
    if not supplied or supplied != settings.mcp_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid MCP token")
    return supplied
