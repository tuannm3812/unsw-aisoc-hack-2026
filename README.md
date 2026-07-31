# Spatial Brain

> How might AI help multi-disciplinary teams make sense of information, present ideas, align on decisions, and review work more effectively?

A research paper becomes a Jira issue becomes a pull request — and every hop stays visible on one canvas.

Built for the [UNSW AiSoc × Atlassian × Mistral hackathon](https://aisoc-atlassian-mistral.devpost.com/). Event rules, judging criteria, and pitch narrative live in [`STRATEGY.md`](STRATEGY.md). The original product design spec (Context Canvas) lives in [`docs/DESIGN_SPEC.md`](docs/DESIGN_SPEC.md); this README describes **what shipped**.

## The problem we solve

Cross-disciplinary work loses its reasoning in the handoff. A scientist's finding is retyped into a ticket, the ticket loses the constraint that made it necessary, and the engineer implements something subtly wrong.

**Persona:** Priya (PM), Dr Aisha Khan (research scientist), and Marco (engineer) on one board — a multi-disciplinary team, not a single-role tool.

**Insight:** AI should package context, not replace judgment. Teammates dump research onto typed nodes; connecting those nodes to a task gives a human or an agent the full upstream lineage — quotes and page numbers included — on demand.

**Solution (one sentence):** A shared semantic canvas where connecting knowledge to a task auto-assembles a Mistral brief and exposes that same lineage to coding agents over MCP, then writes the result into a real Jira issue and back when a PR lands.

## Eligibility

Every AI reasoning step in this project runs on **Mistral APIs only** (OCR + structured extraction + task briefs). No OpenAI, no Anthropic inside the product. Cursor appears in the live demo only as an **MCP client** consuming our tools — the models that write briefs and parse PDFs are Mistral. See [`STRATEGY.md`](STRATEGY.md) §1a.

## Run it

```powershell
.\start.ps1
```

That installs dependencies, seeds the demo board, and starts both servers. Then open http://localhost:3100 and sign in.

| Who | Email | Password |
| --- | --- | --- |
| Priya Raman, product manager | `priya@spatialbrain.dev` | `spatial` |
| Dr Aisha Khan, research scientist | `aisha@spatialbrain.dev` | `spatial` |
| Marco Silva, software engineer | `marco@spatialbrain.dev` | `spatial` |

`.\start.ps1 -Reset` wipes and reseeds for a clean rehearsal. `.\start.ps1 -Check` installs, seeds, runs the tests, and exits.

Copy [`.env.example`](.env.example) to `.env` at the repo root for Mistral and Jira. Without keys the app still runs: documents are stored but not extracted, briefs fall back to a deterministic summary, and tasks stay canvas-only.

**Never commit `.env`.** It is gitignored.

## The demo, in seven steps

Full runbook (what to say, what to do when something breaks): [`docs/DEMO.md`](docs/DEMO.md).

1. **Sign in as Priya.** The board already has the scientist's findings and one constraint — the story starts mid-conversation.
2. **Drop `demo/retrieval-grounding-study.pdf`.** Mistral OCR + structured extraction lays out findings and constraints, each with a quoted span and page.
3. **Add a typed node and connect it** to an extracted finding (a teammate reacting to the paper).
4. **Create a task, connect it to knowledge nodes, assign to Marco.**
5. **Assignment creates a real Jira Cloud issue.** The key appears on the task node.
6. **An agent asks about that task over MCP.** It receives the full upstream lineage, summarized by Mistral, with citations. "Trace ancestry" lights the same set on the canvas.
7. **The agent reports its pull request through MCP.** Badge on the canvas node + comment on the Jira issue.

Step 6 is the point of the product. Step 7 closes the loop: the scientist can see their paper turn into shipped code.

MCP attach guide: [`docs/MCP.md`](docs/MCP.md).

## How it works

```
Canvas (Next.js) ─── FastAPI ─── SQLite
                        │
                        ├── Mistral OCR + structured extraction  → typed nodes with evidence
                        ├── Lineage assembler → Mistral brief     → MCP tools → coding agent
                        └── Jira outbound adapter                 → Jira Cloud
```

**Nodes are typed and provenanced.** Kinds: `asset`, `finding`, `constraint`, `task`. Relations: `derived_from`, `supports`, `constrains`, `implements`, `assigned_to`. Extracted nodes carry source asset, page, verbatim quote, and confidence.

**Lineage is a graph walk, not a prompt.** `backend/app/services/lineage.py` walks context-bearing relations back to the roots — cycle-safe, capped, with relation paths recorded. Mistral only writes the brief on top; the agent is told the nodes are authoritative.

**Document text is data, never instructions.** MCP tools use a bearer token separate from user sessions. Reported PR URLs are restricted to `http`/`https` at the schema.

**Jira is real outbound create.** Issue types resolved from `createmeta` and sent by **id** (team-managed projects make type names ambiguous). ADF descriptions, correlation property on the issue, local dedupe because Jira has no create idempotency. Timeouts are recorded as `ambiguous`, not retried blindly.

## What shipped vs the design spec

The design spec imagined a Next.js monolith on Vercel with Neon, Conflict Detector, and Task Spec Generation as separate wow moments. What we shipped for the demo path:

| Spec idea | Status in this repo |
| --- | --- |
| Semantic canvas + Context → Task | Shipped (typed nodes + React Flow) |
| Mistral packaging of context | Shipped (OCR extract + lineage brief) |
| MCP `get_task_context` | Shipped (`spatial_get_task_context` + list + PR write-back) |
| Jira push | Shipped (on assign; live Cloud REST v3) |
| Conflict Detector / Task Spec button | Not shipped — cut for reliability; lineage + Jira + PR close the story |
| Next monolith / Neon / Vercel Blob | Not used — FastAPI + SQLite + local uploads for a one-command local demo |
| Persona: Jamie, generic startup PM/designer/2 engineers | Replaced with Priya (PM) / Dr Aisha Khan (research scientist) / Marco (engineer) — a more specific research-to-engineering handoff story that covers all four verbs in the official problem statement (make sense of information, present ideas, align on decisions, review work), not just some of them |

Stretch cut on purpose: real-time multiplayer, inbound Jira sync, GitHub PR polling, embeddings. See design spec §3 and `STRATEGY.md` §6 (MVP first).

## Verify it

```powershell
cd backend
.venv\Scripts\python.exe -m pytest             # lineage, Jira payloads, issue-type selection, PR validation
.venv\Scripts\python.exe scripts\smoke.py      # end-to-end against a running server
.venv\Scripts\python.exe scripts\mcp_check.py  # MCP server over stdio
.venv\Scripts\python.exe scripts\preflight.py  # go / no-go on all seven demo steps
```

The last three need the API running. Run `python -m app.seed --reset` before presenting if smoke/MCP left test nodes on the board — preflight will say so.

## Layout

```
STRATEGY.md                         hackathon rules, judging, pitch framework
docs/                               demo runbook, MCP guide, design spec, coding standards
backend/app/services/lineage.py     the graph walk behind the whole idea
backend/app/services/mistral_service.py
backend/app/services/jira_service.py
backend/app/mcp/server.py           MCP tools (stdio)
frontend/components/canvas/         React Flow canvas, nodes, inspector
demo/                               PDF for the live upload step
start.ps1                           one-command local bring-up
```

## Docs index

See [`docs/README.md`](docs/README.md) for the full reading order for teammates and judges.
