# Demo runbook

Different teams. Different information. Four HMW verbs on one canvas.

Aim for six minutes live. Read it once, run it twice, then record the fallback.

## Before you start

```powershell
.\start.ps1 -Reset
```

Reset matters: smoke tests leave `Smoke task` nodes that undercut the story.

Then run the go / no-go check:

```powershell
cd backend
.venv\Scripts\python.exe scripts\preflight.py
```

Optional but worth it with credit: provision the agent roster once, then authenticate connectors in Studio:

```powershell
cd backend
.venv\Scripts\python.exe -m scripts.provision_agents
```

Open [Mistral AI Studio](https://console.mistral.ai), authenticate the **Atlassian** and **GitHub** connectors for the Reviewer agent (OAuth is brokered by Mistral — org-scoped, one click each). Without that click, Review still works via our graph tools; connectors just enrich live Jira/GitHub reads.

Also prepare:

- [ ] Canvas at http://localhost:3100 and your Jira project board.
- [ ] Files ready: `demo/retrieval-grounding-study.pdf`, a whiteboard photo (png/jpg), a small CSV.
- [ ] Cursor open with `spatial-brain` MCP attached ([`docs/MCP.md`](MCP.md)).
- [ ] (Optional inbound) `gh webhook forward` and a Cloudflare tunnel for Jira Automation — see below.

## Pitch line (open on this)

> Different teams dump different artifacts onto one canvas. A Mistral agent roster senses, aligns, presents, and reviews — the team still decides what becomes true.

## The script (teams × information × verbs)

**1 · Science · PDF — make sense.** Sign in as Priya. Drop `demo/retrieval-grounding-study.pdf`.

> Mistral proposes findings and constraints. The canvas does not auto-fill. Promote three or four from the source node — including a constraint.

**2 · Design · whiteboard — make sense.** Drop a photo of a sketch or sticky wall.

> Same candidate review UI. Design's whiteboard lands as typed nodes beside Science's paper.

**3 · Ops · spreadsheet — make sense.** Drop a CSV of metrics or thresholds.

> The Data analyst path proposes quantitative findings and threshold constraints. Promote one.

**4 · Product · align on decisions.** Open the seeded task **Ship passwordless account recovery** (Science OTP finding vs Product magic-links-only constraint). Hit **Check alignment**.

> Arbiter flags the contradiction. Record `decided` / `deferred` / `rejected` with a rationale. Watch the activity strip: Coordinator → Arbiter.

**4b · Recommend tasks from knowledge.** Select a promoted finding or constraint → **Create recommended tasks**.

> Mistral proposes 1–3 engineering tasks grounded in that node (and its neighbours) and places them on the canvas already linked — no blank task typing.

**5 · All · present ideas.** On the same task, **Generate stakeholder present**.

> Present Mode walks claim → quote → implication → task across disciplines. A generated one-pager image attaches when image generation succeeds.

**6 · Engineering · review work.** Assign the citation (or recovery) task to Marco → Jira issue appears. Link a PR (MCP or webhook). Run **Constraint checklist**.

> Reviewer maps lineage constraints to the PR: pass / fail / unknown. Inbound GitHub/Jira webhooks keep the node from going stale.

**Land it.**

> Nothing here is a new place to work. It is the missing edge between the places people already work — and the agents that package, pressure-test, present, and review on that edge.

## Inbound review setup (Phase D)

**GitHub (local):**

```powershell
gh webhook forward --repo OWNER/REPO --events=pull_request `
  --url=http://127.0.0.1:8010/api/webhooks/github `
  --secret=$env:GITHUB_WEBHOOK_SECRET
```

**Jira Automation:** rule on issue transition → Send web request:

- URL: `https://<your-tunnel>/api/webhooks/jira`
- Header: `X-Spatial-Secret: spatial-jira-demo` (or your `JIRA_WEBHOOK_SECRET`)
- Body: `{"issue_key":"{{issue.key}}","status":"{{issue.fields.status.name}}","task_id":"{{issue.properties.spatial_task_id}}"}`

Tunnel only needed for inbound Jira. Agent→graph calls stay on the backend (no public MCP for Mistral).

## If something breaks

| Breaks | Do this |
| --- | --- |
| Parsing hangs | Say rate limited; seeded findings/constraint still carry align + present. |
| Nothing to review on source | Open the source node; re-read from inspector, or move on with seeded nodes. |
| Alignment finds nothing | Use the seeded recovery task (OTP vs magic links) — heuristic fallback still flags it. |
| Present image empty | Brief and beats still ship; say image generation soft-failed. |
| Connectors unauthenticated | Align/Present/Review graph tools still run; note Studio OAuth as the production path. |
| Jira create fails | Retry once from inspector; continue canvas-only if it fails again. |
| MCP missing in Cursor | Restart Cursor, or curl the same endpoint with `MCP_TOKEN`. |
| No network | Play `demo/fallback.mp4`. |

## Recording the fallback

Record the run end to end after two rehearsals. Keep it at `demo/fallback.mp4`.

- 1080p, whole screen, cursor visible.
- Real network for PDF upload, Jira, Present, and MCP.
- Do not cut parse waits or agent thinking.
- Narrate out loud while recording.

## Questions you will get

**How is this different from a Jira integration on a whiteboard?** Those sync a card. This sends the reasoning: an agent asks about a task and receives the research chain with quotes and pages.

**What about whiteboard photos and spreadsheets?** Same promote/dismiss path as PDFs. Different teams, different information, one candidate review.

**Who decides what is true?** Humans. Agents propose and pressure-test; promotion and decision trail are explicit.

**Does the model invent the lineage?** No. Traversal is a graph walk in `lineage.py`. Mistral writes summaries and alignment on top.

**Why Mistral Agents?** Coordinator handoffs to Sense / Data / Arbiter / Narrator / Reviewer map to the HMW verbs. Canvas buttons call Conversations when agent ids are provisioned, then always write through Spatial Brain graph tools.
