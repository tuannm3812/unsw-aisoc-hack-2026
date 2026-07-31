"""Slack and Discord notifications.

Both are plain incoming-webhook POSTs. When no webhook URL is configured the event is
logged instead, so the demo never depends on network reachability. Discord gets
allowed_mentions cleared because node titles come from user and model text and must
not be able to trigger mass pings.
"""

from __future__ import annotations

import logging

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


async def notify(text: str, detail_lines: list[str] | None = None) -> dict[str, str]:
    lines = detail_lines or []
    body = text if not lines else text + "\n" + "\n".join(f"- {line}" for line in lines)
    outcome: dict[str, str] = {}

    if settings.slack_webhook_url:
        outcome["slack"] = await _post(settings.slack_webhook_url, {"text": body})
    if settings.discord_webhook_url:
        outcome["discord"] = await _post(
            settings.discord_webhook_url + "?wait=true",
            {"content": body[:1900], "allowed_mentions": {"parse": []}},
        )

    if not outcome:
        logger.info("[notify] %s", body.replace("\n", " | "))
        outcome["log"] = "logged"
    return outcome


async def _post(url: str, payload: dict) -> str:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
        if response.status_code >= 300:
            logger.warning("Notification rejected: %s %s", response.status_code, response.text[:200])
            return f"error {response.status_code}"
        return "sent"
    except httpx.RequestError as exc:
        logger.warning("Notification failed: %s", exc)
        return "unreachable"
