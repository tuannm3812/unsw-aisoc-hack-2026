"""Drive the MCP server over stdio the way a client does.

Verifies the handshake, that the tools are advertised with usable descriptions, and
that each tool returns real data from the running backend.

    .venv\\Scripts\\python.exe scripts\\mcp_check.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

BACKEND = "http://127.0.0.1:8010"
TOKEN = "dev-mcp-token"
BACKEND_DIR = Path(__file__).resolve().parent.parent

passed = 0
failed: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  ok   {label}")
    else:
        failed.append(label)
        print(f"  FAIL {label} {detail}")


def payload_of(result) -> dict:
    """FastMCP returns tool output as text content holding JSON."""
    for item in result.content:
        if getattr(item, "type", "") == "text":
            try:
                return json.loads(item.text)
            except json.JSONDecodeError:
                return {"_raw": item.text}
    return {}


async def main() -> int:
    # Find a task to ask about, using the same API the MCP server wraps.
    async with httpx.AsyncClient(base_url=BACKEND, timeout=30.0) as http:
        listing = await http.get(
            "/api/agent/tasks", headers={"Authorization": f"Bearer {TOKEN}"}
        )
        if listing.status_code != 200:
            print(f"backend not ready: {listing.status_code} {listing.text[:200]}")
            return 1
        tasks = listing.json()["tasks"]
        if not tasks:
            print("no tasks on any board, run scripts/smoke.py first")
            return 1
        task_id = tasks[0]["task_id"]
        print(f"asking about {task_id}: {tasks[0]['title'][:60]}")

    env = {
        **os.environ,
        "SPATIAL_API_URL": BACKEND,
        "SPATIAL_MCP_TOKEN": TOKEN,
        "PYTHONIOENCODING": "utf-8",
    }
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "app.mcp.server"],
        cwd=str(BACKEND_DIR),
        env=env,
    )

    print("handshake")
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            check("server initialises", init.serverInfo.name == "spatial-brain", str(init.serverInfo))

            listed = await session.list_tools()
            names = {tool.name for tool in listed.tools}
            check("read tools advertised", {"spatial_list_tasks", "spatial_get_task_context"} <= names, str(names))
            check("write tool advertised", "spatial_link_pull_request" in names, str(names))
            check(
                "tools carry descriptions an agent can act on",
                all((tool.description or "").strip() for tool in listed.tools),
            )

            print("spatial_list_tasks")
            listing = payload_of(await session.call_tool("spatial_list_tasks", {}))
            check("returns tasks", len(listing.get("tasks", [])) > 0, json.dumps(listing)[:200])

            print("spatial_get_task_context")
            context = payload_of(
                await session.call_tool("spatial_get_task_context", {"task_id": task_id})
            )
            check("returns the task", context.get("task", {}).get("id") == task_id, json.dumps(context)[:250])
            lineage = context.get("lineage", {})
            nodes = lineage.get("nodes", [])
            check("returns lineage nodes", len(nodes) > 0)
            check("nodes carry a relation path", all("relation_path" in node for node in nodes))
            check("nodes carry provenance fields", all("source_quote" in node for node in nodes))
            check("brief included", "brief" in context)
            check("guidance tells the agent to cite originals", "authoritative" in context.get("guidance", ""))
            ancestors = [node for node in nodes if node.get("depth", 0) > 0]
            print(f"       {len(ancestors)} upstream nodes, brief by {context.get('brief', {}).get('generated_by')}")

            print("spatial_link_pull_request")
            pr_url = "https://github.com/spatial-brain/demo/pull/7"
            linked = payload_of(
                await session.call_tool(
                    "spatial_link_pull_request",
                    {
                        "task_id": task_id,
                        "url": pr_url,
                        "title": "Wire the citation renderer",
                        "state": "open",
                        "reported_by": "mcp-check",
                    },
                )
            )
            check("write accepted", linked.get("ok") is True, json.dumps(linked)[:250])
            check(
                "pull request recorded on the task",
                linked.get("pull_request", {}).get("url") == pr_url,
                json.dumps(linked)[:250],
            )
            check(
                "records who reported it",
                linked.get("pull_request", {}).get("reported_by") == "mcp-check",
            )

            after = payload_of(await session.call_tool("spatial_list_tasks", {}))
            listed_task = next(
                (t for t in after.get("tasks", []) if t["task_id"] == task_id), {}
            )
            check(
                "pull request visible to the next read",
                listed_task.get("pull_request_url") == pr_url,
                json.dumps(listed_task)[:200],
            )

            rejected = payload_of(
                await session.call_tool(
                    "spatial_link_pull_request",
                    {"task_id": task_id, "url": "javascript:alert(1)"},
                )
            )
            check(
                "non-web url refused rather than rendered",
                "error" in rejected,
                json.dumps(rejected)[:200],
            )

            print("error handling")
            missing = payload_of(
                await session.call_tool("spatial_get_task_context", {"task_id": "nod_does_not_exist"})
            )
            check("unknown task explained, not crashed", "error" in missing, json.dumps(missing)[:200])

    print()
    if failed:
        print(f"{passed} passed, {len(failed)} failed:")
        for name in failed:
            print(f"  - {name}")
        return 1
    print(f"all {passed} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
