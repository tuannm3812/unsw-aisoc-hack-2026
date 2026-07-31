# Context Canvas — Hackathon Design Spec

Date: 2026-07-31
Event: UNSW AiSoc x Atlassian x Mistral Hackathon (see `STRATEGY.md` for full event rules/timeline)

Revision note: stack (§4) updated from an initial FastAPI + separate React proposal to a Next.js monolith on Vercel, based on a teammate's Google Stitch UI proposal — adopted for lower cross-service risk in a 24hr build. Scope (§3) keeps MCP as co-equal to Task Spec Generation, per team decision, rather than dropping MCP. Conflict Detector (§3, §5, §6) added as the pitch's "wow moment," chosen specifically to cover "align on decisions" from the official problem statement, which the original scope didn't have a standout beat for. Jira push (§3, §5, §6) promoted from stretch to committed Phase 1 scope, since this hackathon is explicitly Atlassian x Mistral — the pitch benefits from literally showing both sponsors' tech working together, not just Mistral.

**This document is the original design intent, not what shipped.** The persona below (Jamie) was superseded during the actual build by Priya (PM) / Dr Aisha Khan (research scientist) / Marco (engineer) — see `README.md` for the current persona and "What shipped vs the design spec" for the full list of changes, and `docs/DEMO.md` for the actual pitch narrative to use. Priya/Aisha/Marco is the one to pitch with: it covers all four verbs in the official problem statement (make sense of information, present ideas, align on decisions, review work) more directly than the persona originally drafted here.

## 1. Problem & Fit

Official problem statement: "How might AI help multi-disciplinary teams make sense of information, present ideas, align on decisions, and review work more effectively?"

**Persona** *(superseded — see note above)*: Jamie, a PM on a 4-person startup team (PM + designer + 2 engineers) shipping a feature this sprint.

**Pain point**: The context behind a decision lives scattered across a Slack thread, a Figma comment, a design doc, and old PR descriptions. When a new task needs that context, someone manually hunts across all of it, or the reasoning behind a decision gets forgotten and re-litigated.

**Insight**: AI should do the packaging, not the team. Instead of someone writing a polished, structured issue/doc, team members dump raw material (notes, links, files) onto connected nodes, and Mistral synthesizes what a task-owner — human or agent — actually needs to know, on demand.

**Solution** (one sentence): A shared context canvas where connecting research/decision nodes to a task node auto-generates a ready briefing for that task, queryable by anyone — including AI agents — by task ID.

## 2. Eligibility Constraint (hard requirement)

Per organizer announcement: the project must be built entirely on **Mistral's APIs**. Projects using other model providers (OpenAI, Anthropic, etc.) are ineligible for prizes regardless of score. Every AI-reasoning step in this design — node summarization, task briefing synthesis, and the demo agent's action — runs on Mistral, with no exceptions. No external AI coding agent (e.g. Claude Code) appears in the submitted project or demo.

## 3. Scope for the 24-Hour Build

**In scope (the MVP / demo path):**
- Infinite canvas: create Context nodes and Task nodes, connect Context → Task (Bezier edges)
- Context node: title, description, optional file upload (via Vercel Blob), Mistral-generated summary
- Task node: title, description, assignee
- **Context Chain Summary**: selecting a node pulls all upstream connected nodes' content and Mistral generates one coherent context document — the person picking up the task understands the full background without digging through the canvas
- **Task Spec Generation**: creating/confirming a task node sends upstream context to Mistral, which auto-generates a structured spec (title, requirements, acceptance criteria, technical notes); one click to confirm
- MCP server exposing `get_task_context(task_id)` — returns the same Context Chain Summary output, machine-queryable
- A small Mistral-powered demo agent that calls the MCP tool and drafts a first-pass action (e.g., an implementation plan) via Mistral function-calling/tool-use, proving the agent-facing loop live
- **Conflict Detector**: a "Check Alignment" button on a Task node — Mistral analyzes all connected Context nodes for that task and flags contradictions between them, citing the specific nodes and describing the disagreement. Single-task scope only (not whole-canvas).
- **Jira push**: a "Push to Jira" button on a generated Task Spec — creates a real Jira issue via Jira Cloud's REST API (`POST /rest/api/3/issue`) using a pre-created API token, populated from the Mistral-generated spec (title, requirements, acceptance criteria → issue summary/description). Not via Atlassian's official remote MCP server — that requires an OAuth 2.1 flow, which is unnecessary live-demo risk for the same visible outcome.

**Explicitly out of scope (stretch only, add only if time permits):**
- Jira ticket *sync* (two-way updates, status changes reflected back) — push is one-way, one-time only
- Slack/Discord/email notifications
- Multi-user auth/permissions
- Multi-hop or complex graph queries beyond direct Context→Task connections
- Whole-canvas / cross-task conflict detection (Conflict Detector stays single-task scope for the hackathon)

## 4. Architecture

**Single Next.js 14 (App Router) monolith, deployed on Vercel** — one codebase, one deploy, no cross-service CORS/networking to debug during the hackathon.

- **Frontend**: `@xyflow/react` (React Flow) for the canvas, Tailwind CSS for styling
- **API routes**: `/api/nodes`, `/api/summarize`, `/api/generate-task`, `/api/mcp` — all TypeScript, same codebase as the frontend
- **Database**: Neon Postgres via Prisma ORM. Use `@neondatabase/serverless` + `@prisma/adapter-neon` instead of Prisma's default driver — the default opens a new TCP connection per serverless invocation and can exhaust Neon's connection limit under load, which risks flaking mid-demo even though it works fine locally
- **File storage**: Vercel Blob for uploaded files
- **AI**: Mistral AI SDK (`@mistralai/mistralai`), called directly from API routes — no separate AI service
- **MCP server**: hosted as a Next.js API route (`/api/mcp`) using `@modelcontextprotocol/sdk`'s Streamable HTTP transport — this keeps MCP inside the same single-deploy monolith rather than standing up a separate service

```
[Next.js App Router — single Vercel deploy]
  ├─ Frontend: @xyflow/react canvas + Tailwind
  ├─ /api/nodes, /api/summarize, /api/generate-task  --> Mistral API
  ├─ /api/mcp (Streamable HTTP)  --> get_task_context(task_id)
  ├─ Prisma (Neon serverless adapter) --> Neon Postgres
  └─ Vercel Blob (file uploads)
                    |
      [Mistral-powered demo agent: standalone script,
       calls /api/mcp, drafts an action via Mistral function-calling]
```

## 5. Components

- **Context Node**: `id, title, description, fileUrl (nullable, Vercel Blob), summary (nullable), createdAt`. On file upload, `/api/summarize` extracts text and calls Mistral to generate a short summary, stored on the node.
- **Task Node**: `id, title, description, assignee (nullable), spec (nullable — the generated title/requirements/acceptance-criteria/technical-notes), createdAt`.
- **Edge**: `sourceContextId, targetTaskId` — many-to-many between Context and Task nodes, stored as a join table via Prisma.
- **Context Chain Summary**: computed by walking upstream Context nodes connected to a given node and asking Mistral to synthesize one coherent document. Cached on the Task node, regenerated when its upstream graph changes.
- **Task Spec Generation**: `/api/generate-task` sends the Context Chain Summary + task description to Mistral, which returns a structured spec (title, requirements, acceptance criteria, technical notes); user confirms with one click before it's saved.
- **MCP server** (`/api/mcp`): exposes one tool, `get_task_context(task_id) -> Context Chain Summary`. No auth/multi-tenant complexity for the demo.
- **Demo agent**: a standalone Node/TypeScript script using Mistral's function-calling API. Calls the MCP tool for a given task ID, receives the context, and asks Mistral to draft a concrete first-pass action (e.g., an implementation plan or a review comment) grounded in that context.
- **Conflict Detector**: `/api/check-alignment` sends all Context nodes connected to a given Task to Mistral with a prompt asking it to identify contradictions between them. Returns a list of `{ nodeA, nodeB, description }` conflicts, rendered in the UI as flagged pairs rather than a vague warning.
- **Jira push**: `/api/push-jira` takes a confirmed Task Spec, maps it to Jira's issue-create payload (summary = spec title, description = requirements + acceptance criteria + technical notes), and calls the Jira Cloud REST API with a server-side API token (never exposed to the client). Stores the returned Jira issue key/URL on the Task node so the UI can link out to the real ticket.

## 6. Data Flow (the live demo script)

1. Jamie (PM) creates 2-3 Context nodes on the canvas, pasting/uploading meeting notes, a design decision, and a Figma link summary (files go to Vercel Blob via `/api/nodes`). Each is saved and summarized by Mistral individually via `/api/summarize`.
2. Jamie creates a Task node ("Build the checkout flow"), sets an assignee, and connects the relevant Context nodes to it.
3. Jamie clicks "Generate Spec" — `/api/generate-task` computes the Context Chain Summary from connected nodes, sends it to Mistral, and returns a structured spec (requirements, acceptance criteria, technical notes) for one-click confirmation. This is shown live as the first "wow" moment: raw scattered notes → a ready task spec.
4. Live on stage, second "wow" moment: the demo agent calls `get_task_context("task-1")` over `/api/mcp`, receives the same Context Chain Summary, and — using Mistral function-calling — drafts a first-pass implementation plan grounded in that context, proving the agent-facing loop end to end, entirely on Mistral.
5. Third "wow" moment: Jamie clicks "Check Alignment" on the task node. Two pre-planted context nodes (e.g. a meeting-notes node saying "use email OTP" and a design-decision node saying "use magic links, no passwords") produce a live-flagged conflict — proving the tool catches misalignment a human skimming the canvas would likely miss.
6. Fourth "wow" moment: Jamie clicks "Push to Jira" on the confirmed Task Spec. A real Jira issue appears in a live Jira Cloud project on screen, populated from the Mistral-generated spec — closing the loop from scattered raw notes to an actual trackable ticket, and making "Mistral + Atlassian working together" a literal, not just narrative, claim.

## 7. Error Handling

Demo-safe, not production-grade:
- If a Mistral API call fails or times out during summarization or spec generation, fall back to showing the raw concatenated node text with a visible "AI summary unavailable" note, rather than crashing the UI.
- If the Jira REST API call fails (auth, rate limit, network), show a clear inline error rather than a silent failure — and rehearse the Jira push step specifically, since it's the one demo moment depending on a third-party service outside our own deploy.
- Use the Neon serverless adapter (§4) specifically to avoid connection-pool exhaustion causing intermittent DB errors during judging.
- The demo agent script should retry once on transient Mistral API errors before failing visibly (with a clear error message) rather than hanging silently — so a live failure is at least legible to the audience.

## 8. Testing

Given the 24-hour budget, skip a full test suite:
- Unit test the "aggregate connected Context node summaries → Context Chain Summary" function specifically, since it's pure logic and the riskiest part to get subtly wrong under time pressure.
- Rehearse the exact live demo path (steps 1-4 in §6) end-to-end at least twice before presenting, including both Task Spec Generation and the MCP agent moment.
- Record a backup demo video before the submission deadline in case of live Wi-Fi/API issues (per the info session's own advice — see `STRATEGY.md` §5).

## 9. Judging Criteria Alignment

- **Value + Human Insight (30%)**: Hyper-specific persona (Jamie, 4-person startup team) and a concrete, relatable pain point tied directly to the real problem statement. Conflict Detector specifically targets "align on decisions" — the one verb in the official prompt the rest of the feature set doesn't directly address.
- **Technical Execution (30%)**: Four live technical proof points — Task Spec Generation (raw notes → structured spec), the MCP server + Mistral-native agent loop (context → agent action), Conflict Detector (context → flagged contradiction), and Jira push (spec → real external ticket via a live third-party API). All real, working, live-demoable integrations, not mockups.
- **Creativity + Design (20%)**: The "AI packages context, not the team" framing is the differentiator versus Heptabase (AI-assisted but human-curated) and Agent-MCP (dev-only, not multi-disciplinary team-oriented). Conflict Detector is the standout "wow" moment; Jira push makes "Mistral + Atlassian working together" — this hackathon's actual title — a literal, demoable claim rather than just a pitch line.
- **Feasibility + Scalability (20%)**: Scoped explicitly to avoid Jira *sync*/Slack/auth complexity that would make a 24hr build infeasible — Jira push is deliberately one-way and uses a simple REST call + API token rather than the heavier OAuth-based official MCP server; the Next.js/Vercel monolith is a proven, low-risk stack for shipping fast; future section names concrete next steps (multi-team rollout, notifications, permissions, whole-canvas conflict detection, two-way Jira sync) without pretending they're built now.

## 10. Competitive Differentiation (for the pitch)

- **vs. Heptabase**: Heptabase is human-curated notes-as-cards with AI assistance layered on top; this project's core loop is AI-automated packaging of raw material into task-ready specs and context, machine-queryable via MCP — Heptabase has no structured task-spec generation, agent-facing API, or conflict-detection story.
- **vs. Agent-MCP**: Agent-MCP targets AI coding agents collaborating within one codebase/project; this project targets multi-disciplinary human teams (PM/design/eng) with AI-agent consumption as one interface among several, not the sole audience.
- **vs. Atlassian's official Jira MCP server**: Atlassian's server exposes *existing* Jira data to agents; this project's differentiator is generating the context and the task spec in the first place (via connected nodes + Mistral synthesis), then pushing the *result* into Jira as a one-way create — the two are complementary, not competing (their server reads Jira, ours writes to it from AI-synthesized context). Two-way sync via their official server is named as a future direction, not a claimed feature.
- **Conflict Detector specifically**: none of the three named competitors surface contradictions between connected pieces of context — this is the single most defensible "we thought of something they didn't" claim in the pitch.
- **Jira push specifically**: makes this the only one of the four reference points (Heptabase, Agent-MCP, Atlassian's own MCP server, and generic AI note-taking tools) that visibly closes the loop from "AI-synthesized team context" to "a real ticket in the tool teams already use" — directly literalizing the hackathon's own sponsor pairing.
