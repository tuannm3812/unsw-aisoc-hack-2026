"""Go / no-go check before presenting.

Answers one question: which of the seven demo steps will work right now. Every check
says what to do about a failure, because this gets run five minutes before showing
someone, which is the worst possible moment to start reading code.

    .venv\\Scripts\\python.exe scripts\\preflight.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

BACKEND = "http://127.0.0.1:8010"
FRONTEND = "http://localhost:3100"
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEMO_PDF = BACKEND_DIR.parent / "demo" / "retrieval-grounding-study.pdf"

READY = "ready"
DEGRADED = "degraded"
BLOCKED = "blocked"

results: list[tuple[str, str, str]] = []


def record(state: str, label: str, detail: str = "") -> None:
    mark = {READY: "ok  ", DEGRADED: "warn", BLOCKED: "STOP"}[state]
    # ASCII only: this is read off a console with an unknown code page.
    print(f"  {mark} {label}" + (f" - {detail}" if detail else ""))
    results.append((state, label, detail))


async def check_servers(http: httpx.AsyncClient) -> dict | None:
    print("servers")
    try:
        health = (await http.get(f"{BACKEND}/api/health")).json()
        record(READY, "API is up")
    except Exception as exc:  # noqa: BLE001
        record(BLOCKED, "API is not up", f"start it: {exc.__class__.__name__}")
        return None

    try:
        response = await http.get(FRONTEND, timeout=15.0)
        if response.status_code < 400:
            record(READY, "canvas is up")
        else:
            record(BLOCKED, "canvas returned an error", str(response.status_code))
    except Exception:  # noqa: BLE001
        record(BLOCKED, "canvas is not up", "run npm run dev in frontend")

    return health


async def check_mistral(http: httpx.AsyncClient, health: dict) -> None:
    print("\nstep 2, document parsing")
    if not health.get("mistral_configured"):
        record(
            DEGRADED,
            "MISTRAL_API_KEY is not set",
            "the drop will store the file and extract nothing; skip step 2",
        )
        return

    try:
        verify = (await http.get(f"{BACKEND}/api/integrations/mistral/verify")).json()
    except Exception as exc:  # noqa: BLE001
        record(DEGRADED, "could not verify the Mistral models", str(exc)[:80])
        return

    if not verify.get("ok"):
        record(DEGRADED, "Mistral rejected the key", str(verify.get("error", ""))[:120])
        return

    for key, label in (("ocr_model", "OCR"), ("text_model", "text")):
        name = verify.get(key, "?")
        if verify.get(f"{key}_available"):
            record(READY, f"{label} model {name} is live")
        else:
            # Mistral retires dated snapshots, so a name that worked last week can 404.
            offered = ", ".join(verify.get("ocr_models_offered", [])[:3])
            record(
                DEGRADED,
                f"{label} model {name} is not available",
                f"update .env; offered: {offered}" if offered else "check /v1/models",
            )

    if DEMO_PDF.exists():
        record(READY, f"demo pdf present, {DEMO_PDF.stat().st_size // 1024} KB")
    else:
        record(DEGRADED, "demo pdf missing", f"expected at {DEMO_PDF}")


async def check_jira(http: httpx.AsyncClient, health: dict) -> None:
    print("\nstep 5, Jira issue creation")
    if not health.get("jira_configured"):
        record(
            DEGRADED,
            "Jira is not configured",
            "assignment stays on the canvas; say so rather than clicking twice",
        )
        return

    try:
        verify = (await http.get(f"{BACKEND}/api/integrations/jira/verify")).json()
    except Exception as exc:  # noqa: BLE001
        record(DEGRADED, "could not reach Jira", str(exc)[:80])
        return

    if verify.get("ok"):
        types = ", ".join(verify.get("issue_types", [])[:4]) or "none"
        record(
            READY,
            f"Jira ready as {verify.get('account', '?')}",
            f"project {verify.get('project', '?')}, types: {types}",
        )
    else:
        record(DEGRADED, "Jira will not accept an issue", str(verify.get("error", ""))[:120])


async def check_board(http: httpx.AsyncClient) -> None:
    print("\nsteps 1, 3 and 4, the board")
    login = await http.post(
        f"{BACKEND}/api/auth/login",
        json={"email": "priya@spatialbrain.dev", "password": "spatial"},
    )
    if login.status_code != 200:
        record(BLOCKED, "cannot sign in as the PM", "run python -m app.seed --reset")
        return

    boards = (await http.get(f"{BACKEND}/api/boards")).json()
    if not boards:
        record(BLOCKED, "no board seeded", "run python -m app.seed --reset")
        return

    graph = (await http.get(f"{BACKEND}/api/boards/{boards[0]['id']}/graph")).json()
    nodes = graph["nodes"]
    kinds = {kind: sum(1 for n in nodes if n["kind"] == kind) for kind in ("finding", "constraint", "task", "asset")}

    if kinds["finding"] >= 2 and kinds["constraint"] >= 1:
        record(READY, "board is pre-built", f"{kinds['finding']} findings, {kinds['constraint']} constraint")
    else:
        record(DEGRADED, "board looks thin", "run python -m app.seed --reset")

    record(READY, f"{len(graph['members'])} members assignable")

    # Step 2 of the demo is choosing from proposals. A parsed document with an empty
    # review list means there is nothing to click, which is worth knowing beforehand.
    parsed = [a for a in graph["assets"] if a["parse_state"] == "parsed"]
    waiting = len(graph.get("candidates", []))
    if not parsed:
        record(READY, "no document parsed yet", "step 2 uploads one live")
    elif waiting:
        record(READY, f"{waiting} proposals awaiting review")
    else:
        record(
            DEGRADED,
            "a parsed document has nothing left to review",
            "re-read it from the inspector, or upload a fresh document in step 2",
        )

    # Test runs write to the same board, and a canvas full of Smoke task nodes
    # undercuts the story more than any bug would.
    litter = [n for n in nodes if "smoke" in n["title"].lower() or "mcp-check" in (n.get("pr_reported_by") or "")]
    if litter:
        record(
            DEGRADED,
            f"{len(litter)} test nodes on the board",
            "run python -m app.seed --reset before presenting",
        )
    else:
        record(READY, "no test litter on the board")


async def check_mcp() -> None:
    print("\nsteps 6 and 7, MCP")
    try:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
    except ImportError:
        record(BLOCKED, "mcp package not installed", "pip install -r requirements.txt")
        return

    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "app.mcp.server"],
        cwd=str(BACKEND_DIR),
        env={
            **os.environ,
            "SPATIAL_API_URL": BACKEND,
            "SPATIAL_MCP_TOKEN": os.environ.get("MCP_TOKEN", "dev-mcp-token"),
            "PYTHONIOENCODING": "utf-8",
        },
    )
    try:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                names = {tool.name for tool in (await session.list_tools()).tools}
    except Exception as exc:  # noqa: BLE001
        record(BLOCKED, "MCP server would not start", str(exc)[:100])
        return

    expected = {"spatial_list_tasks", "spatial_get_task_context", "spatial_link_pull_request"}
    missing = expected - names
    if missing:
        record(BLOCKED, "MCP tools missing", ", ".join(sorted(missing)))
    else:
        record(READY, "three MCP tools advertised")

    config = BACKEND_DIR.parent / ".cursor" / "mcp.json"
    if config.exists():
        token = json.loads(config.read_text())["mcpServers"]["spatial-brain"]["env"]["SPATIAL_MCP_TOKEN"]
        if token == os.environ.get("MCP_TOKEN", "dev-mcp-token"):
            record(READY, "Cursor config token matches the backend")
        else:
            record(BLOCKED, "Cursor config token does not match MCP_TOKEN", "the tools will 401")
    else:
        record(DEGRADED, ".cursor/mcp.json missing", "Cursor will not see the server")


async def guard(label: str, coro) -> None:
    """A check that throws is itself a finding, not a traceback to read on stage."""
    try:
        await coro
    except Exception as exc:  # noqa: BLE001
        record(BLOCKED, f"{label} check could not complete", f"{exc.__class__.__name__}: {exc}"[:120])


async def main() -> int:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as http:
        health = await check_servers(http)
        if health is None:
            print("\nSTOP: start the backend first.")
            return 1
        await guard("Mistral", check_mistral(http, health))
        await guard("Jira", check_jira(http, health))
        await guard("board", check_board(http))
    await guard("MCP", check_mcp())

    blocked = [r for r in results if r[0] == BLOCKED]
    degraded = [r for r in results if r[0] == DEGRADED]

    print()
    if blocked:
        print(f"NO GO: {len(blocked)} blocking")
        for _, label, detail in blocked:
            print(f"  - {label}: {detail}")
        return 1
    if degraded:
        print(f"GO, degraded: {len(degraded)} step(s) will fall back")
        for _, label, detail in degraded:
            print(f"  - {label}: {detail}")
        print("\nSee docs/DEMO.md for what to say when a step falls back.")
        return 0
    print("GO: all seven steps are live.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
