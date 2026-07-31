"""End-to-end smoke test against a running backend.

Walks the demo path with real HTTP calls: sign in, read the graph, add a finding,
create and connect a task, assign it, then read the agent context and report a pull
request. Run with the server up:

    .venv\\Scripts\\python.exe scripts\\smoke.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8010"
MCP_TOKEN = "dev-mcp-token"
PASSWORD = "spatial"

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


def main() -> int:
    client = httpx.Client(base_url=BASE, timeout=60.0, follow_redirects=True)

    print("health")
    health = client.get("/api/health")
    check("health responds", health.status_code == 200, health.text[:200])
    print(f"       mistral={health.json().get('mistral_configured')} jira={health.json().get('jira_configured')}")

    print("auth")
    accounts = client.get("/api/auth/demo-accounts")
    check("demo accounts listed", accounts.status_code == 200 and len(accounts.json()) == 3)

    bad = client.post("/api/auth/login", json={"email": "priya@spatialbrain.dev", "password": "wrong"})
    check("wrong password rejected", bad.status_code == 401)

    login = client.post(
        "/api/auth/login", json={"email": "priya@spatialbrain.dev", "password": PASSWORD}
    )
    check("pm signs in", login.status_code == 200, login.text[:200])
    if login.status_code != 200:
        return report()

    me = client.get("/api/auth/me")
    check("session works", me.status_code == 200)

    print("board")
    boards = client.get("/api/boards")
    check("board listed", boards.status_code == 200 and len(boards.json()) >= 1)
    board_id = boards.json()[0]["id"]

    graph = client.get(f"/api/boards/{board_id}/graph")
    check("graph loads", graph.status_code == 200, graph.text[:200])
    seeded_nodes = len(graph.json()["nodes"])
    check("seeded nodes present", seeded_nodes >= 3, f"got {seeded_nodes}")
    check("members present", len(graph.json()["members"]) == 3)

    print("document upload")
    pdf_path = Path(__file__).resolve().parent.parent.parent / "demo" / "retrieval-grounding-study.pdf"
    if not pdf_path.exists():
        print("  skip demo PDF missing, run scripts/make_demo_pdf.py")
    else:
        rejected_type = client.post(
            f"/api/boards/{board_id}/assets",
            files={"file": ("notes.docx", b"not really a docx", "application/msword")},
        )
        check("unsupported type rejected", rejected_type.status_code == 415)

        empty = client.post(
            f"/api/boards/{board_id}/assets",
            files={"file": ("empty.md", b"", "text/markdown")},
        )
        check("empty file rejected", empty.status_code == 400)

        upload = client.post(
            f"/api/boards/{board_id}/assets?x=-560&y=-120",
            files={"file": (pdf_path.name, pdf_path.read_bytes(), "application/pdf")},
        )
        check("pdf accepted", upload.status_code == 202, upload.text[:300])
        if upload.status_code == 202:
            asset = upload.json()
            check("page count read", asset["page_count"] == 2, f"got {asset['page_count']}")

            # Extraction runs in the background. Poll until it settles either way.
            state = asset["parse_state"]
            for _ in range(40):
                time.sleep(1.0)
                graph_now = client.get(f"/api/boards/{board_id}/graph").json()
                current = next(a for a in graph_now["assets"] if a["id"] == asset["id"])
                state = current["parse_state"]
                if state in {"parsed", "failed"}:
                    break

            check("parse settled", state in {"parsed", "failed"}, f"stuck at {state}")
            graph_now = client.get(f"/api/boards/{board_id}/graph").json()
            asset_nodes = [n for n in graph_now["nodes"] if n["source_asset_id"] == asset["id"]]
            check("asset node created", any(n["kind"] == "asset" for n in asset_nodes))

            if state == "parsed":
                # A parse proposes and stops. Nothing may reach the canvas on its own.
                auto = [n for n in asset_nodes if n["kind"] in {"finding", "constraint"}]
                check("parse created no nodes by itself", len(auto) == 0, f"{len(auto)} appeared")

                proposals = [c for c in graph_now["candidates"] if c["asset_id"] == asset["id"]]
                check("proposals waiting for review", len(proposals) > 0, "nothing came back")
                check(
                    "proposals quote the source",
                    any(c["source_quote"] for c in proposals),
                )
                pages = [c["source_page"] for c in proposals if c["source_page"] is not None]
                check(
                    "no proposal cites a page outside the file",
                    all(1 <= page <= asset["page_count"] for page in pages),
                    f"pages {sorted(set(pages))} against {asset['page_count']} pages",
                )
                titles = [c["title"].strip().lower() for c in proposals]
                check("no proposal is a duplicate", len(titles) == len(set(titles)))
                print(
                    f"       {sum(1 for c in proposals if c['kind'] == 'finding')} findings, "
                    f"{sum(1 for c in proposals if c['kind'] == 'constraint')} constraints proposed"
                )

                # Promoting is the only path onto the canvas.
                chosen = [proposals[0]["id"]]
                promoted = client.post(
                    f"/api/boards/{board_id}/assets/{asset['id']}/candidates/promote",
                    json={"candidate_ids": chosen},
                )
                check("promotion accepted", promoted.status_code == 200, promoted.text[:200])
                if promoted.status_code == 200:
                    made = promoted.json()["nodes"]
                    check("promotion created a node", len(made) == 1)
                    check(
                        "promoted node keeps its evidence",
                        bool(made[0]["source_quote"]) and made[0]["source_asset_id"] == asset["id"],
                    )

                    graph_now = client.get(f"/api/boards/{board_id}/graph").json()
                    anchor = next(n for n in asset_nodes if n["kind"] == "asset")
                    linked = [
                        e
                        for e in graph_now["edges"]
                        if e["source_id"] == anchor["id"]
                        and e["target_id"] == made[0]["id"]
                        and e["relation"] == "derived_from"
                    ]
                    check("promoted node links back to the source", len(linked) == 1)
                    check(
                        "review list shrank",
                        len([c for c in graph_now["candidates"] if c["asset_id"] == asset["id"]])
                        == len(proposals) - 1,
                    )

                repeat = client.post(
                    f"/api/boards/{board_id}/assets/{asset['id']}/candidates/promote",
                    json={"candidate_ids": chosen},
                )
                check(
                    "promoting the same proposal twice is refused",
                    repeat.status_code == 409,
                    f"got {repeat.status_code}",
                )
            else:
                current = next(
                    a
                    for a in client.get(f"/api/boards/{board_id}/graph").json()["assets"]
                    if a["id"] == asset["id"]
                )
                print(f"       parse failed as expected without a key: {current['parse_error'][:90]}")
                check("failure is explained", bool(current["parse_error"]))

    print("nodes and edges")
    finding = client.post(
        f"/api/boards/{board_id}/nodes",
        json={
            "kind": "finding",
            "title": "Chunk overlap of 15 percent recovered most lost context",
            "body": "Added by hand during the demo.",
            "x": -120.0,
            "y": 80.0,
        },
    )
    check("finding created", finding.status_code == 201, finding.text[:200])
    finding_id = finding.json()["id"]

    rejected = client.post(
        f"/api/boards/{board_id}/nodes",
        json={"kind": "asset", "title": "sneaky.pdf"},
    )
    check("asset node rejected", rejected.status_code == 400)

    task = client.post(
        f"/api/boards/{board_id}/nodes",
        json={
            "kind": "task",
            "title": "Add span-level citations to the answer renderer",
            "body": "Every generated claim needs a clickable source span.",
            "x": 620.0,
            "y": -40.0,
        },
    )
    check("task created", task.status_code == 201, task.text[:200])
    task_id = task.json()["id"]

    existing_nodes = graph.json()["nodes"]
    constraint_id = next(n["id"] for n in existing_nodes if n["kind"] == "constraint")
    # The seeded finding that feeds the constraint is the depth-2 ancestor we expect
    # to surface once the task hangs off that constraint.
    seed_finding_id = next(
        edge["source_id"]
        for edge in graph.json()["edges"]
        if edge["target_id"] == constraint_id
    )

    for source, relation in (
        (finding_id, "supports"),
        (constraint_id, "constrains"),
    ):
        edge = client.post(
            f"/api/boards/{board_id}/edges",
            json={"source_id": source, "target_id": task_id, "relation": relation},
        )
        check(f"edge {relation} created", edge.status_code == 201, edge.text[:200])

    self_edge = client.post(
        f"/api/boards/{board_id}/edges",
        json={"source_id": task_id, "target_id": task_id, "relation": "supports"},
    )
    check("self edge rejected", self_edge.status_code == 400)

    move = client.put(
        f"/api/boards/{board_id}/nodes/{task_id}/position", json={"x": 640.0, "y": -20.0}
    )
    check("position saved", move.status_code == 200)
    check("move does not bump revision", move.json()["revision"] == task.json()["revision"])

    print("lineage and brief")
    context = client.get(f"/api/boards/{board_id}/tasks/{task_id}/context")
    check("context loads", context.status_code == 200, context.text[:300])
    if context.status_code == 200:
        payload = context.json()
        node_ids = {n["id"] for n in payload["lineage"]["nodes"]}
        check("task in lineage", task_id in node_ids)
        check("direct finding in lineage", finding_id in node_ids)
        check("constraint in lineage", constraint_id in node_ids)
        check("transitive ancestor reached", seed_finding_id in node_ids, f"depth-2 node missing")
        check("brief produced", bool(payload["brief"]["objective"]))
        print(f"       brief by {payload['brief']['generated_by']}, {len(node_ids)} lineage nodes")

    print("assignment")
    members = graph.json()["members"]
    engineer = next(m for m in members if "engineer" in m["discipline"].lower())
    assign = client.post(
        f"/api/boards/{board_id}/tasks/{task_id}/assign",
        json={"assignee_id": engineer["id"], "create_jira_issue": True},
    )
    check("task assigned", assign.status_code == 200, assign.text[:300])
    if assign.status_code == 200:
        check("assignee recorded", assign.json()["assignee_id"] == engineer["id"])
        print(f"       jira state={assign.json()['jira_sync_state']} key={assign.json()['jira_issue_key'] or '-'}")

    print("agent surface")
    unauth = client.get("/api/agent/tasks")
    check("agent api needs a token", unauth.status_code == 401)

    agent = httpx.Client(
        base_url=BASE, timeout=60.0, headers={"Authorization": f"Bearer {MCP_TOKEN}"}
    )
    tasks = agent.get("/api/agent/tasks", params={"board_id": board_id})
    check("agent lists tasks", tasks.status_code == 200, tasks.text[:200])
    check("new task visible to agent", any(t["task_id"] == task_id for t in tasks.json()["tasks"]))

    agent_context = agent.get(f"/api/agent/tasks/{task_id}/context")
    check("agent reads context", agent_context.status_code == 200, agent_context.text[:300])
    if agent_context.status_code == 200:
        check(
            "agent context carries provenance",
            all("relation_path" in n for n in agent_context.json()["lineage"]["nodes"]),
        )

    pr = agent.post(
        f"/api/agent/tasks/{task_id}/pull-request",
        json={
            "url": "https://github.com/spatial-brain/answers/pull/42",
            "title": "Render span citations under every claim",
            "state": "open",
        },
    )
    check("pull request reported", pr.status_code == 200, pr.text[:300])
    if pr.status_code == 200:
        after = client.get(f"/api/boards/{board_id}/graph")
        node = next(n for n in after.json()["nodes"] if n["id"] == task_id)
        check("pr url on task node", node["pr_url"].endswith("/42"))
        check("pr reporter recorded", bool(node["pr_reported_by"]))
        check("pr state recorded", node["pr_state"] == "open", node["pr_state"])

    hostile = agent.post(
        f"/api/agent/tasks/{task_id}/pull-request",
        json={"url": "javascript:alert(1)", "title": "not a pull request"},
    )
    check("non-web pr url refused", hostile.status_code == 422, str(hostile.status_code))

    # An agent token must not be usable as a session, and a session must not be
    # usable as an agent token.
    unauthenticated = httpx.post(
        f"{BASE}/api/agent/tasks/{task_id}/pull-request",
        json={"url": "https://example.dev/pull/1"},
        timeout=30,
    )
    check(
        "agent write rejects a missing token",
        unauthenticated.status_code == 401,
        str(unauthenticated.status_code),
    )

    return report()


def report() -> int:
    print()
    if failed:
        print(f"{passed} passed, {len(failed)} failed:")
        for name in failed:
            print(f"  - {name}")
        return 1
    print(f"all {passed} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
