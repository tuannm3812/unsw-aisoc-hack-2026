# Attaching your own agent

The point of this guide is that you do not have to take our word for what the agent receives. Point your own Cursor at the server, ask it about a task, and read the payload yourself.

## Connect

The repository already ships `.cursor/mcp.json`, so opening this folder in Cursor is enough. Confirm under **Settings → MCP** that `spatial-brain` is listed with three tools.

For any other MCP client, run the server over stdio:

```json
{
  "mcpServers": {
    "spatial-brain": {
      "command": "backend/.venv/Scripts/python.exe",
      "args": ["-m", "app.mcp.server"],
      "cwd": "backend",
      "env": {
        "SPATIAL_API_URL": "http://127.0.0.1:8010",
        "SPATIAL_MCP_TOKEN": "dev-mcp-token",
        "PYTHONIOENCODING": "utf-8"
      }
    }
  }
}
```

`SPATIAL_MCP_TOKEN` must match `MCP_TOKEN` in the backend `.env`, and the backend has to be running. To check the wiring without a client attached:

```powershell
cd backend
.venv\Scripts\python.exe scripts\mcp_check.py
```

That drives the real server over stdio and exercises all three tools, including a rejected malicious URL.

## The three tools

**`spatial_list_tasks`** — tasks on the canvas with status, assignee, Jira key and pull request URL. Use it to find a task ID.

**`spatial_get_task_context(task_id)`** — the interesting one. Returns the task, then every upstream node the task descends from, each carrying:

- `relation_path`, the chain of relations that justified including it
- `depth`, how far upstream it sits
- `source_quote` and `source_page`, verbatim text from the original document
- `evidence_class`, whether a person asserted it or a model extracted it
- `revision`, so you can tell whether a brief is stale

alongside a Mistral-written `brief` over that set, and a `guidance` string telling the agent that the nodes are authoritative and the brief is not. Pass `refresh: true` to rewrite the brief.

**`spatial_link_pull_request(task_id, url, title, state)`** — records the pull request you opened. The badge appears on the task node on the canvas within a few seconds, and the link is posted as a comment on the linked Jira issue. `state` is one of `open`, `draft`, `merged`, `closed` and is stored as your assertion; nothing verifies it against GitHub. `url` must be absolute `http` or `https`.

## Try it

Ask your agent, in its own words:

> List the tasks on the Spatial Brain canvas, then get the full context for the citation one. Tell me what research it came from, quoting the original document, and what constraint I have to respect.

A good answer names the specific findings and the constraint, and quotes the paper with page numbers rather than paraphrasing the brief. Then:

> Open a pull request for that task and report it back through Spatial Brain.

Watch the canvas. The badge lands on the task node without a refresh.

## Reading it raw

Every tool is a thin wrapper over ordinary HTTP, so you can curl it:

```powershell
$h = @{ Authorization = "Bearer dev-mcp-token" }
Invoke-RestMethod -Uri "http://127.0.0.1:8010/api/agent/tasks" -Headers $h
Invoke-RestMethod -Uri "http://127.0.0.1:8010/api/agent/tasks/<task_id>/context" -Headers $h |
    ConvertTo-Json -Depth 8
```

## Where the trust boundary sits

Node text originates from uploaded documents and from teammates, so all of it is untrusted input.

- The agent API authenticates with its own bearer token, unrelated to user session cookies. A session cannot call it and its token cannot drive the canvas UI.
- Document content only ever appears as data inside a response body. Nothing in a PDF can cause a tool to be called.
- The `guidance` field tells the agent to cite node IDs and quotes rather than restating the brief, because a summary is the easiest place for a detail to go missing.
- Reported pull request URLs are validated at the schema and restricted to `http` and `https`, since they are rendered as clickable links on the canvas and echoed into Jira.
- Every agent read and write is written to the activity log with the task it touched.
