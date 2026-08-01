# Q&A Prep — Basic, Difficult, and Technical Deep-Dive

Per Mistral's guidance (`STRATEGY.md` §8a): no code is submitted, so judges'
main way to verify genuine technical depth is asking the team to explain the
build. Every teammate should be able to answer at least the questions below
in their own words, not just point at working output.

Use it like this: **Basic** and **Difficult** below are for rehearsing the
live pitch out loud — read a question, answer it yourself first, then check
the model answer. **Technical Deep-Dive** is the module-by-module backup for
when a judge wants to go further into a specific claim. Every answer here is
checked against the current codebase and docs (2026-08-01), nothing is
aspirational.

## Basic questions

**Q: What is Spatial Brain, in one sentence?**
A shared semantic canvas where connecting a piece of knowledge to a task
automatically assembles a Mistral-generated brief with full lineage —
verbatim quotes, page numbers, the whole reasoning chain — and pushes that
context into a real Jira issue, then closes the loop when a pull request
lands.

**Q: Who is it for, and what's the actual pain point?**
One team, three disciplines on one board: Priya (PM), Dr Aisha Khan (research
scientist), Marco (engineer) — a team archetype, not three isolated personas,
matching the official problem statement's own wording ("multi-disciplinary
teams"). The pain: cross-disciplinary handoffs lose their reasoning. A
scientist's finding gets retyped into a ticket, the ticket drops the
constraint that made it necessary, and the engineer implements something
subtly wrong — not hypothetical, it's what happens on every PRD → ticket → PR
chain that relies on someone remembering to carry context forward by hand.

**Q: Walk us through the demo.**
Six beats, each one HMW verb from the problem statement: (1) Science drops a
PDF — Mistral proposes findings/constraints, a human promotes a few; (2)
Design drops a whiteboard photo — same review UI, different input; (3) Ops
drops a spreadsheet — the data-analyst path proposes metric constraints; (4)
Product runs Check Alignment on a task — the Arbiter flags a real
contradiction (OTP vs magic-links-only); (5) the team runs Present Mode —
claim → quote → implication → task, with a generated one-pager image; (6)
Engineering assigns the task — a real Jira issue is created, a PR is linked,
and the constraint checklist runs against it.

**Q: What's the tech stack, briefly?**
Next.js + React Flow canvas frontend; FastAPI + SQLAlchemy + SQLite backend
(one command, local, no cloud infra to stand up); every AI step goes through
the official `mistralai` Python SDK (OCR, chat, Agents/Conversations, image
generation); an MCP server exposes the same tools to any MCP client (Cursor,
in the demo) with its own bearer-token trust boundary, separate from user
sessions; real Jira Cloud REST v3 calls; and a governance engine that
enforces constraint rules at the point of write.

**Q: Why Mistral — what's it actually doing in the product?**
Every scored reasoning step — summarization, structured extraction from
PDFs/whiteboard photos/CSVs, brief generation, agent function-calling, the
Present Mode one-pager image — runs on Mistral APIs exclusively, no
OpenAI/Anthropic inside the product. Cursor appears in the live demo only as
an **MCP client** consuming tools whose underlying reasoning is already
Mistral's — it never performs the scored reasoning itself.

**Q: Is this really live, or a rehearsed recording of a mock?**
Live: a real Jira Cloud issue created via actual REST calls (with explicit
ambiguous-timeout handling, not a naive retry loop), a graph walk — not a
model guess — for lineage, and real inbound GitHub/Jira webhooks. Nothing
claimed in the pitch is a screenshot standing in for a feature; if it's in
the deck, it's shown running.

**Q: What's the one thing you want us to remember?**
Nothing here is a new place to work — it's the missing edge between the
places people already work.

## Difficult questions

**Q: How do you know the "lineage" isn't the model hallucinating what context matters?**
It structurally can't, because selection and narration are two different
steps done by two different things. `lineage.py` is a plain breadth-first
search — cycle-safe (a `reached` set means a node is never revisited, so a
loop in the graph can't hang the walk), first-arrival-wins (every node gets
its shortest path back to the task), and priority-ranked when pruning
(constraints kept before findings, findings before raw assets, because
"dropping a constraint can make an agent produce confidently wrong work" —
the actual rationale in the code). Mistral only writes a natural-language
summary **on top of** a node set that code has already deterministically
selected. So "the AI decided this context mattered" is literally false — the
graph decided; the model narrates what the graph found.

**Q: What stops a malicious or manipulated document from hijacking the agent — prompt injection via an uploaded PDF?**
Node text, including anything OCR'd out of an uploaded document, only ever
comes back to an agent as **data inside a tool response** — never as
something that can trigger a further tool call. The MCP server's `guidance`
field explicitly instructs the agent to cite node IDs and quotes, not follow
instructions found inside content. That's a stated design decision in the
code's own guidance string, not a gap we're hoping nobody probes.

**Q: When a constraint would be violated, does the system actually stop the write, or just show a warning?**
It stops it. There's a dedicated governance engine
(`backend/app/services/governance.py`) that evaluates each constraint's
`rule_definition` (operators: `>=`, `<=`, `==`, `!=`, `exists`, `missing`)
against the task at the moment of write, wired directly into the write-path
router (`agent.py`) — not a background audit job. If the result is
`allowed=False`, the caller is required to reject the write. A rule like
"confidence must be ≥ 0.7" or "must have a source quote" is enforced at the
MCP + HTTP channel boundary itself, before the write lands — that's the
literal meaning of the module's own docstring: "Constraints are not advisory
labels."

**Q: How is this meaningfully different from Atlassian's own Jira MCP, or Rovo, or a Notion-plus-Jira integration?**
Those are all downstream: they expose or sync data that's **already
written** — read/write access to existing tickets. Spatial Brain is
upstream: it generates the ticket's actual reasoning in the first place from
raw, unstructured, multi-modal input (a PDF, a whiteboard photo, a
spreadsheet), with full provenance — verbatim quote, page number, confidence,
human-or-model origin — and only then writes that synthesis into Jira.
Complementary, not competing, but "where did this ticket's justification
actually come from" is a question none of them can answer, because they never
touch the source material at all.

**Q: What's your business model — how does this scale past a hackathon demo?**
Directly: this was scoped as a 24-hour MVP, on purpose narrower than the
original design spec — real-time multiplayer, embeddings-based semantic
search, and sync beyond Jira/GitHub were all cut deliberately so what's
demoed is fully real rather than partially real across more surface area
(see README "What shipped vs the design spec"). The realistic path beyond
that: SQLite → Postgres is a known, not a mystery, swap; the MCP trust
boundary already separates agent auth from user session auth, which is the
right shape for a multi-tenant product later; and cost scales roughly with
artifact volume (a Mistral call per upload or brief), which is cheap next to
the cost of a team re-deriving lost context by hand. No fully worked GTM —
that wasn't realistic to build in 24 hours, and overclaiming one would be
worse than being direct that it's the obvious next step, not done yet.

**Q: What's the weakest part of the system — where would it actually break?**
Three honest answers, not one deflection: the governance/constraint layer is
new and currently task-scoped rather than covering the whole graph; the
lineage BFS is capped (`max=60` ancestors) — right for a demo-sized board,
would need real pagination or caching at genuine multi-team scale instead of
re-walking the graph on every card render; and the inbound Jira webhook path
needs a tunnel locally, which is demo-environment friction, not a production
concern. Naming these before being asked is itself part of what's being
scored — Mistral's own guidance is explicit that a team that can't speak to
its own build's limits reads as not enough human oversight (§8a,
`STRATEGY.md`).

**Q: How much of this was actually written by AI versus the team?**
Be honest and specific rather than defensive: AI assistance was used
throughout, the same way most teams build in 2026 — the team's actual
contribution is in the decisions, not the typing. Why BFS with
shortest-path-wins instead of something cleverer. Why an ambiguous Jira
timeout is recorded as ambiguous rather than blindly retried (retrying risks
a duplicate issue). Why constraint checks are enforced at the channel
boundary instead of bolted on as validation afterward. Why Jira issue types
are resolved by ID via `createmeta` instead of matching on the name "Task,"
which is ambiguous across team-managed projects. Every teammate should be
able to explain at least one of these in their own words — that's the actual
bar Mistral's guidance sets, not "did a human type every character."

**Q: What happens if Jira or the network fails mid-demo?**
There's a documented fallback path (`DEMO.md`), not an improvised one: a
first Jira create failure gets one retry from the inspector; a second failure
means continuing canvas-only rather than pretending it worked; total network
loss falls back to a pre-recorded run. The ambiguous-timeout handling exists
specifically for this scenario — the system is designed to never claim
success it can't verify, live or otherwise.

**Q: Does a graph-walk approach to lineage actually scale, or does it fall over on a real team's history?**
The BFS is O(nodes + edges) with a visited set and a depth/count cap — sized
for a realistic team board (dozens to low hundreds of nodes across a sprint),
not an unbounded enterprise-wide graph. At real scale, the honest next step
is caching or indexing the walk instead of recomputing it on every card
render — exactly the "cost to build/maintain" tradeoff the Feasibility
criterion asks teams to reason about explicitly, not a gap we're hoping goes
unnoticed.

**Q: Why should we trust a video submission over inspecting the actual code?**
Because that's the explicitly designed judging mechanism this year, not a
workaround we're proposing: per direct organizer confirmation (quoted in
`DEMO.md`/`STRATEGY.md` §8), every team submits exactly one video, no code is
submitted at all, and only teams selected for the live Top Teams Pitch also
demo live. Given that, the mitigation is making sure the video shows the
*real* app, on a *real* network, doing *real* Jira and GitHub calls — not the
mocked fallback path — and that any teammate can explain a piece of the
system live if selected for the pitch.

## Technical deep-dive, by module

### Lineage (`backend/app/services/lineage.py`) — the core technical claim

**What it does**: given a task node, a breadth-first search walks *backwards*
through the graph along context-bearing relations (`derived_from`, `supports`,
`constrains`, `implements`) to find every node that justifies that task —
findings, constraints, source documents.

**Q: Does the AI make this up / hallucinate the context?**
No — the traversal is plain graph-walk code, not a model call. Mistral only
writes a natural-language summary on top of a node set that's already been
selected deterministically. That's the "AI packages context, doesn't replace
judgment" story made concrete.

**Q: What stops a cyclic graph from hanging the demo?**
It's BFS with a `reached` dict — once a node is visited it's never revisited,
so a loop in the graph can't cause an infinite walk. "First arrival wins" also
means every node gets its *shortest* path back to the task.

**Q: What happens if there's too much context for one task?**
Pruning is priority-ranked, not arbitrary: constraints are kept before
findings, findings before raw assets, because "dropping a constraint can make
an agent produce confidently wrong work" (the actual rationale in the code).

### Jira integration (`backend/app/services/jira_service.py`) — the "is this really live?" proof

**What it does**: creates a real Jira issue via Cloud REST v3 when a task is
assigned, using an API token — not the OAuth-based official Atlassian MCP
server.

**Q: Why not use Atlassian's own MCP server for this?**
OAuth 2.1 is real live-demo risk for the same visible outcome — a token-based
create is one HTTP call, not a browser auth flow to keep working on stage.

**Q: What happens if Jira times out mid-demo?**
A timeout after the create call is ambiguous by definition — Jira might have
created the issue or might not have. We never blindly retry (risk of a
duplicate); we record it as "ambiguous" and say so on screen rather than
showing a spinner.

**Q: Why resolve issue types by ID instead of by name ("Task")?**
On team-managed Jira projects, the name "Task" is ambiguous — every project
has its own. IDs are resolved via Jira's `createmeta` endpoint instead.

### Governance (`backend/app/services/governance.py`) — constraint enforcement, not advisory labels

**What it does**: evaluates every constraint node's `rule_definition` against
the task it constrains, at the moment of write. Wired into the actual
write-path router (`agent.py`, both the task-status and PR-link endpoints),
not a separate audit pass.

**Q: Is this checked before or after the write happens?**
Before — `check_constraints()` is called and its `GovernanceResult` inspected
prior to committing the write; `allowed=False` means the caller rejects the
write outright rather than logging a violation after the fact.

**Q: What kinds of rules can a constraint actually enforce?**
Comparisons against checkable fields on a node — `confidence`,
`has_source_quote`, `evidence_class`, `task_status`, `has_pr` — using
operators `>=`, `<=`, `==`, `!=`, `exists`, `missing`. Deliberately small and
explicit rather than an open-ended rules DSL, so every enforced rule is
auditable by reading the constraint node itself.

### Frontend heuristics (`frontend/lib/lineage.ts`) — the "is this AI?" question about card badges

**What it does**: task cards on the canvas show Effort/Priority/Blocked/Due-date
badges and a "←N" grounded-in count, all computed live in the browser from the
node's own title/body text and the graph's edges.

**Q: Are the Effort/Priority/Blocked/Due-date badges generated by Mistral?**
No — plain regex heuristics over `title` + `body` (`detectEffort` /
`detectPriority` / `detectBlocked` / `detectDueDate`), no model call involved.
It's a deliberately cheap, deterministic layer on top of whatever text is
already on the node — consistent with the "AI packages context, doesn't
replace judgment" story, just applied to display logic instead of extraction.

**Q: Why not match bare single letters like "s"/"m"/"l" for effort size?**
An earlier pass did, and it false-positived on any of those letters appearing
in ordinary prose. It's now hardened to require full words ("small" /
"medium" / "large") or explicit abbreviations ("xs" / "xl") — with a comment
in the code noting the fix and the plan to switch to a real story-point field
if the schema grows one, rather than pretending the heuristic is exact.

**Q: What does the "←N" badge on a card mean — is that lineage from Mistral?**
No — same lineage concept as the backend BFS, but computed client-side
(`countAncestors`) by walking `derived_from` / `supports` / `constrains` /
`implements` edges backwards from that node. It's a fast preview count for
the card footer; the authoritative walk for an agent's actual context still
runs in `backend/app/services/lineage.py`.

### MCP trust boundary (`backend/app/mcp/server.py`) — the security question

**Q: What stops a malicious PDF from hijacking the agent?**
Node text — including anything extracted from an uploaded document — only
ever comes back as data inside a tool response, never as something that
triggers a tool call. The `guidance` field explicitly tells the agent to cite
node IDs and quotes, not follow instructions found in content. This is
prompt-injection defense, stated plainly in the code's own guidance string.

**Q: What stops a compromised canvas session from driving an agent, or vice versa?**
The MCP server authenticates with its own bearer token (`SPATIAL_MCP_TOKEN`),
completely separate from user login cookies. A browser session can't call the
agent API, and the agent's token can't drive the canvas UI.

### General framing, if asked "how much of this did AI write?"

Be honest and specific rather than defensive: AI assistance was used
throughout, the same way any team would use it in 2026 — the value the team
added is in the decisions (why BFS with shortest-path-wins, why ambiguous
timeouts over blind retries, why IDs over names for issue types, why a bearer
token separate from sessions, why constraints are enforced before the write
rather than audited after) rather than the typing. Being able to explain
*why* a given approach was chosen, not just that it works, is exactly what
Mistral's guidance says they're checking for.
