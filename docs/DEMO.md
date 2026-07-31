# Demo runbook

Four minutes if nothing goes wrong. Read it once, run it twice, then record it.

## Before you start

```powershell
.\start.ps1 -Reset
```

Reset matters: the smoke tests write to the same board, and a canvas littered with `Smoke task` nodes undercuts the story.

Then run the go / no-go check, which tells you which of the seven steps will work right now and what to say about the ones that will not:

```powershell
cd backend
.venv\Scripts\python.exe scripts\preflight.py
```

It covers the API and canvas being up, the Mistral key and both pinned model names, Jira auth plus a creatable issue type on the project, the board being pre-built and free of test nodes, and all three MCP tools starting over stdio with a matching token. Mistral retires dated model snapshots, so the model check in particular is worth running on the day rather than trusting `.env`.

The rest is on you:

- [ ] Two browser tabs: the canvas at http://localhost:3100, and your Jira project board.
- [ ] `demo/retrieval-grounding-study.pdf` findable in two clicks from the file picker.
- [ ] Cursor window already open on this repo, chat cleared, `spatial-brain` visible under Settings → MCP.
- [ ] Notifications and other windows closed. The canvas is dense; screen space is the scarce resource.

## The script

**Open on the problem, not the product.** Fifteen seconds, no slides.

> A scientist writes a paper. A PM turns it into a ticket. An engineer reads the ticket. By then the reason the work matters is gone, and nobody notices until review. Every tool in that chain is fine. The handoffs between them are where the reasoning dies.

**1 · Sign in as Priya.** The board is already partly built: two findings from Aisha, one constraint that follows from the second.

> This is a knowledge graph you can rearrange with your hands. Aisha's findings, and a constraint that follows from one of them.

**2 · Drop the PDF onto the canvas.** This is the one live upload. While it parses, say what is happening; it takes a few seconds.

> Mistral is reading the paper and pulling out findings and constraints. Not tags. Typed nodes, each one carrying the exact sentence it came from and the page it was on.

When the nodes land, click one and show the quote and page in the inspector.

> That quote is the whole point. Nothing downstream has to trust a summary.

**3 · Add a node and connect it.** Add a finding, type a sentence, drag from an extracted node to it.

> A teammate reacts to the paper. Now their reaction is part of the graph, not a comment nobody will find again.

**4 · Create a task node.** Connect it to the constraint and to one finding. Assign to Marco.

> A task is a node like any other, except it points at the knowledge that justifies it.

**5 · Jira.** The key appears on the node within a second or two. Switch tabs and show the issue exists, with an ADF description.

> Real issue, real Jira site. Not a screenshot.

**6 · The part that matters.** In the inspector, hit **Trace ancestry** so the upstream set lights up on the canvas. Leave it lit. Switch to Cursor and ask:

> List the tasks on the Spatial Brain canvas, then get the full context for the citation task. Tell me what research it came from, quoting the paper, and what constraint I have to respect.

While it answers, point at the lit canvas.

> The agent is walking exactly that path. Not searching, not embedding. Walking the relations the team drew, back to the original document, and it can quote the paper with page numbers because the quotes travelled with the nodes.

**7 · Close the loop.** Ask the agent to open a pull request and report it back. Do not touch the browser: the badge arrives on its own.

> And the scientist, looking at the canvas she started, can see her paper turned into shipped code. Every hop still visible.

Show the Jira comment carrying the same link.

**Land it in one sentence.**

> Nothing here is a new place to work. It is the missing edge between the places people already work.

## If something breaks

| Breaks | Do this |
| --- | --- |
| Parsing hangs or fails | Say the key is rate limited, keep going. The seeded findings and constraint carry steps 3 to 7 alone. |
| Jira create fails | The inspector shows the error with a **Retry**. Retry once. If it fails again, say Jira is a boundary you cross deliberately, and carry on: nothing downstream needs the issue. |
| Jira times out | State is recorded as ambiguous rather than retried, because the issue may exist. Say exactly that. It is a better answer than a spinner and judges notice. |
| MCP tool missing in Cursor | Restart Cursor. If it still fails, curl the same endpoint: `Invoke-RestMethod -Uri "http://127.0.0.1:8010/api/agent/tasks/<id>/context" -Headers @{Authorization="Bearer dev-mcp-token"}`. Less theatrical, identical payload. |
| Brief looks thin | It says `generated_by: lineage-fallback`. The key is missing or rate limited. The structured lineage is still real, and that is the part you are claiming. |
| No network at all | Play the recording. |

## Recording the submission video

**This recording is the primary judged artifact, not a wifi-failure backup.** Per organizer confirmation (Shreya, 2026-07-31 12:51pm; Nick @ Mistral, 2:12pm): every team submits exactly one video demo (MP4 upload or YouTube link) plus an optional prototype link — no code is submitted. Only teams selected for the Top Teams Pitch (Sat 2:00-2:30pm) also present live; everyone else is judged on this video alone. Treat it accordingly: script it, rehearse it, record it properly, don't leave it for the last hour.

Record the run above end to end, once you have rehearsed it twice and the timing is comfortable. Keep it, unedited, at `demo/submission.mp4`.

- 1080p, whole screen, cursor visible.
- Real network for steps 2, 5, 6 and 7. A recording of the mocked path proves nothing.
- Do not cut the parse wait or the agent thinking. That the wait is short is part of the claim.
- Say the words out loud while recording. If you have to narrate live over silent video you will talk over the beat that matters.
- Mistral's guidance is that they'll probe whether the team can explain the technical build, not just show it working — consider a brief "how it works" narration beat (lineage as a graph walk, not a prompt; Jira as a real outbound create) rather than only a feature walkthrough. See `STRATEGY.md` §8a.

If selected for the live Top Teams Pitch, the same rehearsed run works live — the video isn't wasted effort, it's the dress rehearsal for that too.

## Questions you will get

**How is this different from a Jira integration on a whiteboard tool?** Those sync a card. This sends the reasoning: an agent asks about a task and receives the research chain with quotes and pages, because the edges are typed and traversable.

**What if the graph is wrong?** Then the agent tells you it is wrong, with citations, which is better than a ticket that hides it. Every node carries who asserted it or which model extracted it, at what confidence, from which page.

**Does the model invent the lineage?** No. The traversal is a graph walk in `lineage.py` with no model involved. Mistral only writes the summary layered on top, and the agent is told the nodes are authoritative.

**Why is the PR state whatever the agent claims?** Deliberate. GitHub authentication and state polling were cut so there is nothing to fail on conference wifi. The reporter and timestamp are recorded, so the claim is attributable.

**Does this scale past a few dozen nodes?** Unknown, honestly. Traversal is capped at a depth and node count today, dropping findings before constraints. Past that it needs relevance ranking, which is the next thing we would build.
