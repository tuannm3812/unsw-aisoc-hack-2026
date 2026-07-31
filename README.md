# Spatial Brain

> How might AI help multi-disciplinary teams make sense of information, present ideas, align on decisions, and review work more effectively?

**Different teams. Different information.** Design whiteboards, Engineering PRs, Science PDFs, Ops spreadsheets — one shared canvas. A Mistral agent roster senses, aligns, presents, and reviews; humans still decide what becomes true.

Built for the [UNSW AiSoc × Atlassian × Mistral hackathon](https://aisoc-atlassian-mistral.devpost.com/). Event rules and pitch narrative: [`STRATEGY.md`](STRATEGY.md). Design ancestry: [`docs/superpowers/specs/2026-07-31-context-canvas-design.md`](docs/superpowers/specs/2026-07-31-context-canvas-design.md).

## The problem we solve

Cross-disciplinary work loses its reasoning in the handoff. A scientist's finding is retyped into a ticket, the ticket loses the constraint that made it necessary, and the engineer implements something subtly wrong.

**Persona:** Priya (PM), Dr Aisha Khan (research scientist), and Marco (engineer) on one board.

**Insight:** AI should package and pressure-test context, not replace judgment. Artifacts become typed nodes; connecting them to a task gives humans and agents the full upstream lineage — quotes and pages included.

**Solution (one sentence):** A shared semantic canvas where multi-modal ingest and a Mistral specialist roster cover make-sense / present / align / review — while Spatial Brain remains the system of record for the graph, Jira outbound, and MCP lineage.

## Eligibility

Every AI reasoning step runs on **Mistral APIs only** via the official **`mistralai` Python SDK** (OCR, chat, Agents/Conversations, image generation). No OpenAI / Anthropic inside the product. Cursor appears in the live demo only as an **MCP client**. See [`STRATEGY.md`](STRATEGY.md) §1a.

## Run it

```powershell
.\start.ps1
```

Open http://localhost:3100.

| Who | Email | Password |
| --- | --- | --- |
| Priya Raman, product manager | `priya@spatialbrain.dev` | `spatial` |
| Dr Aisha Khan, research scientist | `aisha@spatialbrain.dev` | `spatial` |
| Marco Silva, software engineer | `marco@spatialbrain.dev` | `spatial` |

`.\start.ps1 -Reset` reseeds (includes the OTP vs magic-links contradiction for Align). `.\start.ps1 -Check` installs, seeds, tests, exits.

Copy [`.env.example`](.env.example) → `.env`. Provision agents once:

```powershell
cd backend
.venv\Scripts\python.exe -m scripts.provision_agents
```

Then authenticate Atlassian + GitHub connectors in [Mistral Studio](https://console.mistral.ai). **Never commit `.env`.**

## Four pillars (HMW)

| Pillar | Product move |
| --- | --- |
| **Make sense** | PDF / whiteboard photo / CSV → candidates → human promote |
| **Present ideas** | Present Mode + stakeholder brief + `image_generation` one-pager |
| **Align on decisions** | Check alignment + decision trail (`decided` / `deferred` / `rejected`) |
| **Review work** | Jira assign + PR badge + constraint checklist + inbound webhooks |
| **Recommend work** | From a finding/constraint, Mistral auto-creates linked task nodes |

Full spoken runbook: [`docs/DEMO.md`](docs/DEMO.md).

## Demo beats (short)

1. **Science · PDF** — drop paper → promote candidates.
2. **Design · whiteboard** — drop photo → promote a constraint.
3. **Ops · CSV** — drop spreadsheet → promote a metric constraint.
4. **Product · align** — Check alignment on the seeded recovery task; record a decision.
5. **Present** — Present Mode + one-pager.
6. **Engineering · review** — assign → Jira; PR + constraint checklist; optional inbound status.

## How it works

```
Canvas (Next.js) ─── FastAPI ─── SQLite (system of record)
                        │
                        ├── Multimodal extract → candidates → human promote
                        ├── Align / Present / Review graph tools
                        ├── Mistral Agents (Coordinator + specialists) via Conversations
                        ├── Lineage assembler → MCP tools → coding agent
                        └── Jira outbound + GitHub/Jira inbound webhooks
```

**Agents:** Coordinator, Sense (Archivist), Data analyst, Arbiter, Narrator, Reviewer — provisioned by `backend/scripts/provision_agents.py`. Canvas actions call `POST .../agent-run`, which may kick Conversations when agent ids exist, then always writes structured results through Spatial Brain.

**Extraction proposes, people decide.** Candidates sit on the source until promoted, deduplicated and capped. Out-of-range page citations are dropped.

**Lineage is a graph walk**, not a prompt (`backend/app/services/lineage.py`).

## What shipped vs the design spec

| Spec idea | Status |
| --- | --- |
| Semantic canvas + Context → Task | Shipped |
| Multimodal sense (PDF, image, CSV) | Shipped |
| Conflict Detector / Align | Shipped (task-scoped) |
| Present Mode + image one-pager | Shipped |
| Mistral agent roster + activity strip | Shipped |
| MCP `get_task_context` + PR write-back | Shipped |
| Jira outbound on assign | Shipped |
| Inbound GitHub + Jira webhooks | Shipped (tunnel for Jira) |
| Constraint checklist vs PR | Shipped |
| Own Atlassian 3LO / GitHub App OAuth | Cut — use Mistral connector OAuth |
| Audio recordings / multiplayer | Cut |

## Verify it

```powershell
cd backend
.venv\Scripts\python.exe -m pytest
.venv\Scripts\python.exe scripts\smoke.py
.venv\Scripts\python.exe scripts\mcp_check.py
.venv\Scripts\python.exe scripts\preflight.py
```

## Layout

```
STRATEGY.md
docs/DEMO.md                        four-pillar spoken runbook
backend/scripts/provision_agents.py Mistral agent roster
backend/app/services/mistral_service.py
backend/app/routers/tasks.py        align / present / review / agent-run
backend/app/routers/webhooks.py     GitHub + Jira inbound
frontend/components/canvas/         canvas, Present Mode, agent activity
start.ps1
```

## Docs index

- [`docs/DEMO.md`](docs/DEMO.md) — live demo script
- [`docs/MCP.md`](docs/MCP.md) — attach coding agents
- [`STRATEGY.md`](STRATEGY.md) — hackathon framing
