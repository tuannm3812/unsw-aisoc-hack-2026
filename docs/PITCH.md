# Pitch & Competitive Positioning

Selling points and competitive framing for the video narration and any live
Q&A. For the click-by-click demo script, see `DEMO.md`. For defensive
technical answers, see `QA_PREP.md`.

## One-liner

A shared semantic canvas where connecting knowledge to a task auto-assembles
a Mistral brief and exposes that same lineage to coding agents over MCP, then
writes the result into a real Jira issue — and back, when a pull request
lands.

## Competitive positioning

### vs. Heptabase (AI-assisted visual note-taking)

Heptabase is **human-curated** — you write the cards, AI helps summarize and
chat over them afterward. We're the opposite direction: **AI does the
extraction automatically**. Drop a PDF, Mistral OCR pulls out findings and
constraints as typed nodes, each carrying a verbatim quote and page number,
without a human transcribing anything. Heptabase also has no agent-facing
API — the knowledge stays inside their app. Ours is machine-queryable via MCP
from the start.

### vs. Agent-MCP (shared knowledge graph for AI coding agents)

Agent-MCP is built for **agents collaborating within one codebase** — a
developer tool. We're built for **multi-disciplinary humans** (a research
scientist, a PM, an engineer) with agent access as one interface among
several, not the only audience. That's a direct match to the official
problem statement's actual wording ("multi-disciplinary teams"), not just a
technical convenience.

### vs. Atlassian's own official Jira MCP server

Theirs exposes **existing** Jira data to agents — a read/write interface to
what's already written down. We're **upstream of Jira**: we generate the
context and the ticket content from raw, unstructured research in the first
place, then push that synthesis into a real Jira issue. Complementary, not
competing — but "where did this ticket's reasoning actually come from" is a
problem their server doesn't touch at all.

### vs. generic AI chatbots / whiteboard-plus-Jira-plugin tools

Those sync a card. We send the reasoning: an agent asking about a task
receives the research chain with quotes and pages, because the edges are
typed and traversable, not just a title and a link.

## Four defensible technical claims

Say these out loud — each is a real, inspectable design decision, not a
marketing line.

1. **Lineage is a graph walk, not an LLM guessing.** `lineage.py` is plain
   breadth-first search. Mistral only writes a summary on top of a node set
   that's already been deterministically, verifiably selected. Nothing here
   can hallucinate which context matters.
2. **Full provenance chain.** Every extracted fact carries a verbatim quote,
   page number, confidence score, and whether it came from a human or a
   model. Not "trust the summary" — "check the citation."
3. **The loop actually closes.** An agent doesn't just *read* context via
   MCP, it *writes back*: a reported pull request shows up as a badge on the
   canvas and a comment on the live Jira issue. The scientist who started the
   paper can watch it become shipped code.
4. **Real integrations, not mocks.** A real Jira Cloud issue, created via
   actual REST calls with production-grade idempotency handling (the
   ambiguous-timeout logic in `jira_service.py`), not a fake screenshot.

## Judging criteria tie-in

- **Value + Human Insight (30%)** — the persona (Priya/Aisha/Marco) and pain
  point (a scientist's finding losing fidelity through the ticket handoff)
  are specific and hit all four verbs in the official problem statement:
  make sense of information, present ideas, align on decisions, review work.
- **Technical Execution (30%)** — the lineage graph walk, the MCP
  read-and-write-back loop, and the real Jira integration are three separate,
  independently verifiable proof points, not one feature stretched thin.
- **Creativity + Design (20%)** — automated extraction-with-citation and the
  agent write-back loop are not features any of the three named competitors
  have.
- **Feasibility + Scalability (20%)** — deliberately scoped: real-time
  multiplayer, inbound Jira sync, and GitHub PR polling were cut on purpose
  (see `README.md` "What shipped vs the design spec"), so what's demoed is
  fully working rather than partially working across more surface area.
