from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import agent, assets, auth_routes, boards, tasks, webhooks
from .services.jira_service import JiraError, jira_service
from .services.mistral_service import MistralError, mistral_service

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Spatial Brain", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3100", "http://127.0.0.1:3100"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(boards.router)
app.include_router(assets.router)
app.include_router(tasks.router)
app.include_router(agent.router)
app.include_router(webhooks.router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "mistral_configured": settings.mistral_enabled,
        "jira_configured": settings.jira_enabled,
        "notifications": {
            "slack": bool(settings.slack_webhook_url),
            "discord": bool(settings.discord_webhook_url),
        },
    }


@app.get("/api/integrations/mistral/verify")
async def verify_mistral() -> dict:
    """Checks the key and that both pinned model names are still live."""
    if not mistral_service.enabled:
        return {"configured": False, "detail": "Set MISTRAL_API_KEY in .env"}
    try:
        return {"configured": True, "ok": True, **await mistral_service.verify()}
    except MistralError as exc:
        return {"configured": True, "ok": False, "error": str(exc)}


@app.get("/api/integrations/jira/verify")
async def verify_jira() -> dict:
    """Hour-zero spike, callable at any time: proves auth, project and issue types."""
    if not jira_service.enabled:
        return {"configured": False, "detail": "Set JIRA_* values in .env"}
    try:
        return {"configured": True, **await jira_service.verify()}
    except JiraError as exc:
        return {"configured": True, "ok": False, "error": str(exc)}
