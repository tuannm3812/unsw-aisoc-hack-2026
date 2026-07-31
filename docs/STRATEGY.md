# UNSW AiSoc Hackathon 2026 — Strategy

Sources: `INFORMATION SESSION.pdf` (Info Session and Workshop deck, read 2026-07-31); DevPost rules; organizer Slack announcements; Atlassian's opening presentation (§1b, checked 2026-07-31).

## 1. Event Timeline

| When | What |
|---|---|
| Fri 31 Jul, 10:30–11:30am | Opening Address + Problem Statement Reveal |
| Fri 31 Jul, 11:30am–12:00pm | Settling Down & Firing Up |
| Fri 31 Jul 12:00pm → Sat 1 Aug 12:00pm | **The Great Hacking** (24 hrs) |
| Sat 1 Aug, 12:00pm | Submission Due |
| Sat 1 Aug, 12:00–2:00pm | Lunch Break + Judges Deciding |
| Sat 1 Aug, 2:00–2:30pm | Top Teams Pitch |
| Sat 1 Aug, 4:00pm | Winners Announced |

Theme context (background only, not the prompt itself):
> "As the volume of data and content in the world grows (in part due to the prolific adoption of generative AI to create information), information overload has become a defining challenge of modern work."

**Worked example challenge** (deck pages 8–9 — used only to teach the judging framework and as the prompt the "Orbit" case study was built against; NOT the real prompt):
> "As AI becomes more common, people spend more time with technology and less time connecting with each other. So the million dollar question is: Can you build something that encourages more human interaction?"

## 1a. THE REAL PROBLEM STATEMENT (official, from organizer announcement post-reveal)

> "How might AI help multi-disciplinary teams make sense of information, present ideas, align on decisions, and review work more effectively?"

Key words to hold onto: **multi-disciplinary teams** (not a single-role persona — mixed roles like PM/design/eng/research on one team), **make sense of information**, **present ideas**, **align on decisions**, **review work**. Persona choices should be a specific team archetype, not a lone individual.

**Eligibility — two sources, read together:** the organizer announcement states projects must be built on **Mistral's APIs only** — "Projects that [use other model providers] are ineligible for prizes no matter how well they score." Separately, workshop meeting notes record a **live clarification from the Mistral judge** that softens this: using other AI models is "not necessarily forbidden," Mistral Studio may support third-party endpoints, and workflows can orchestrate multiple models — but **only Mistral models receive funded access/free credits**, and teams using other providers must check those providers' own terms of use. The judge's own stated bottom line: *"the safest approach is to use Mistral as a central part of the project while adding other models only when there is a clear technical reason."*

**Practical read for this project**: keep every AI-reasoning step that judges score — summarization, structured extraction, task briefs, agent function-calling — on Mistral, with no exceptions. An external AI coding agent (e.g. Cursor, Claude Code) appearing in the live demo purely as an **MCP client** consuming our tools (not performing the scored reasoning itself) fits the "clear technical reason" bar — this is already how the shipped app uses Cursor (see `README.md` §Eligibility). Still worth a direct confirmation with organizers given the rule itself invites questions, but this is no longer a total black-box guess.

Team sign-up required: [DevPost — aisoc-atlassian-mistral](https://aisoc-atlassian-mistral.devpost.com/)

## 1b. What The Problem Includes (from Atlassian's opening presentation, checked 2026-07-31)

Source: the Atlassian × Mistral × UNSW opening slide deck (a 24-slide recruiting/opening presentation; only its "Requirements and judging" and "What the problem includes" slides are hackathon-relevant, the rest is Atlassian careers content).

The "What the problem includes" slide explicitly scopes the problem statement:

- **Disciplines named**: Design, Engineering, Product, Operations, Business, Law, Science
- **Input types named**: Pull requests, whiteboard photos, recordings, documents, PDFs, spreadsheets, raw data
- Explicit note: *"The challenge covers quantitative and qualitative information."*

**Implication**: multi-modal ingestion (not just PDF text) is squarely in scope and explicitly named by the organizers — a solution that only handles one input type (e.g. PDF-only) is narrower than what's being invited, even though it isn't a hard requirement. Worth weighing against build-time cost.

## 2. Prizes

- 1st: $600 + Susquehanna playing cards, per team member
- 2nd: $400 + playing cards, per team member
- 3rd: $200 + playing cards, per team member
- Susquehanna track prize: keychron keyboards, playing cards, fidget spinners (per member)
- **Hidden Signals Award** (new, found in Atlassian's opening presentation, §1b source): *"Uncover a non-obvious pattern, contradiction, anomaly or connection."* A separate award from the main placings. Directly matches our Conflict Detector / "Align" decision-trail concept (surfacing contradictions between connected context nodes) — worth explicitly calling out in the pitch as targeting this award by name, not just describing the feature.

## 3. Judging Criteria — and how to win each

**Official weighted criteria (DevPost rules — this is the scored version):**

| # | Criterion | Weight | What judges look for | Strategy |
|---|---|---|---|---|
| 1 | **Value + Human Insight** | 30% | Understanding the target user, genuine relevance, directly addresses the problem | Pick one hyper-specific persona (a *team archetype*, per the real problem statement — see §1a). Address guardrails (legal, liability, "who's responsible if it goes wrong") explicitly in the pitch. |
| 2 | **Technical Execution** | 30% | Depth of implementation beyond basic AI-generated code | Scope complexity to what's realistic in ~24hrs. **Everything you claim must be shown live** — judges can only score what they see. |
| 3 | **Creativity + Design** | 20% | Novel ideas, strong UX | No dashboards unless they add real value. Design UX around the persona's actual pain points, avoid clutter. |
| 4 | **Feasibility + Scalability** | 20% | Real-world viability, potential to expand | Address: real-world relevance, cost to the *user*, cost to *build/maintain*. |

Note: the info session deck also called out **"Use of AI"** (supports the work, doesn't replace thinking) as a 5th criterion with no stated weight — DevPost's official list doesn't list it separately, so it's likely folded into Technical Execution. Still follow the deck's guidance (AI for early research + late-stage pressure-testing, not for inventing the core idea) since it's clearly something judges care about even if unweighted.

**A third framing, from Atlassian's opening presentation (§1b source)**: their "Requirements and judging" slide states **Requirements** — Use Mistral APIs ("build with the required platform"), Address the problem ("focus on information overload and teamwork"), Use the right tools ("specialised workflows beat one giant prompt") — and **Judging**: **Relevance** ("a clear response to the problem"), **Usefulness** ("value for real teams"), **Generality** ("works across domains and content types"). Footer note: *"No-code and deep technical systems are both welcome."*

Three different sources now describe judging with different words (DevPost's weighted 4, the deck's unweighted 5, Atlassian's Relevance/Usefulness/Generality). They're not contradictory in substance — Relevance ≈ Value+Human Insight, Usefulness ≈ Feasibility, Generality is closest to a new, distinct idea (does the solution generalize across domains/content types, not just the one demoed) worth explicitly addressing in the pitch since it's not clearly covered by the DevPost 4. Worth confirming with organizers which rubric is actually scored if asked, but treat "generality across domains and content types" as a real, additional bar to clear regardless.

## 4. Case Study Takeaways ("Orbit")

**What worked:**
- Hyper-specific target audience (uni students, not "everyone")
- One genuinely unique idea, not 50 stacked features
- Solved a relevant real-world problem (students needing help on campus)
- Gamification tailored to the audience
- Cozy/homemade UX feel, not cluttered
- Real technical depth: multi-user interactions, filters, map integration, priority by time/distance

**What to avoid (their gaps):**
- Real-world incentive gap — no reason for "helpers" to actually help
- Unclear guardrails — e.g. people posing as students, privacy of data/location

**Action for our team:** whatever concept we pick, explicitly answer "why would the other side of this interaction actually participate?" and "what stops bad actors/privacy issues?" before we present.

## 5. Narrative — 6-Step Pitch Structure

Use this as the literal outline for the final pitch deck/demo script.

1. **Target the Persona** — name a specific person, role, background. No "students" or "everyone."
2. **Acute Pain Point** — concrete, costly, currently-unsolved friction. Use numbers if possible (e.g. "3 hours every Sunday").
3. **Insight** — the "aha" moment: why existing tools fail, why our approach/timing is different.
4. **Product Solution** — one sentence, no implementation detail, 1–2 core capabilities only.
5. **Live Prototype Demo** — one full user path, raw input → result. **Note: per organizer confirmation (§8), the submitted video demo IS the primary judged artifact for most teams, not a backup** — only teams selected for the Top Teams Pitch (2:00-2:30pm Sat) also demo live. Treat the recording itself as the deliverable to polish, not an afterthought.
6. **Future** — vision beyond the weekend, 1–2 concrete next technical milestones.

Kickoff advice: keep the narrative tight, show don't just tell, focus on execution, hook early, never skip the live demo.

## 6. Architecture Approach

Order of operations when designing the build:

1. **Start with the problem** → User → Problem → Outcome (one line each)
2. **Break into components** — Frontend (UI/UX, client-side), Backend (business logic, auth, API layer), Database/APIs (storage, external + third-party APIs)
3. **Map user + data flow**
   - Start with the trigger: what's the very first thing the user does? (sign in, upload, enter text, click)
   - Trace backend work: storage/retrieval, API calls, computation, AI response generation
   - Use the map to spot risk early: missing steps, bottlenecks, and where each team member's part fits
   - Rule of thumb: fewer unnecessary steps = easier to build, test, and explain to judges
4. **Scope the MVP**
   - Ask: "if we only had time to build ONE feature, what would it be?"
   - Problem → One Core Feature → Working Demo → Stretch (everything else)
   - A strong MVP is: simple to build, easy to demo, focused on the core user problem, reliable under presentation pressure
   - Optional/stretch features must never risk the core feature not finishing
   - Simple and working beats complex and unfinished

**AI integration guidance:**
- Use specialized APIs — **deck explicitly says prefer Mistral APIs over OpenAI/Anthropic** (likely tied to the Mistral sponsor track — confirm eligibility rules live at the session)
- Leverage multimodal capabilities where relevant
- Pick the right model for size/latency/cost tradeoffs, not just the biggest model
- Build robust LLM agent workflows rather than a single fragile prompt

## 7. Team Action Checklist

- [ ] One team member registers the project on DevPost ASAP and invites the other 3-4 by email/link (§8) — don't leave this to the last hour
- [ ] Fri 10:30am: capture the real problem statement the moment it drops
- [ ] Pick ONE hyper-specific persona within the first hour
- [ ] Draft the 6-step narrative skeleton before writing code
- [ ] Decide the single MVP core feature; write stretch features on a separate list, do not touch them until MVP is demo-ready
- [ ] Map user + data flow on a whiteboard/doc; assign components to teammates
- [ ] Decide AI stack early — check whether we're going for the Mistral-API sponsor track
- [ ] Address ethics/guardrails/privacy explicitly, don't leave it implicit
- [ ] Assign each teammate a part of the build they can personally explain in Q&A (§8a) — not just whoever wrote that part
- [ ] Script and record the video demo well before the deadline, including a brief "how it works" narration beat (§8a) — this is the primary deliverable, not a backup
- [ ] Rehearse the pitch against the 4 official weighted judging criteria explicitly (§3) — one line of the pitch per criterion if possible
- [ ] Submission due Sat 12:00pm — build in buffer time before that, not up to the wire; the video takes real time to record/edit/upload, don't leave it for the final hour

## 8. Confirmed Rules (from DevPost + organizer announcement)

- **Team size: 4–5 members** (mandatory)
- **Submission deadline: Aug 1, 2026 @ 12:00pm AEST**
- **Mistral APIs only** — confirmed hard eligibility rule, not a soft preference (see §1a)
- All team members must sign up on [DevPost](https://aisoc-atlassian-mistral.devpost.com/)
- **Team registration**: only ONE person needs to create the team's project on DevPost, then invites the rest via email/link. Do this early (day one), not near the deadline — don't let it become a last-minute blocker.
- **Deliverables (confirmed by organizers, 2026-07-31 ~1-2pm)**: exactly **one video demo** (MP4 upload or YouTube link) + an **optional** prototype link. **No code submission is required.** This changes the priority of the video itself — it's not a backup for a live demo, it *is* the primary judged artifact for teams that don't make it to the live Top Teams Pitch.

## 8a. Technical Q&A Readiness (Mistral guidance, 2026-07-31 2:12pm)

Direct quote from Nick @ Mistral: *"No code submission required - focus should be on live demo. Expect to be asked questions about the technical solution though. If you can't speak to how it works and was built, then it's a sign that not enough human oversight contributed to the technical build."*

Implications:
- Since no code is submitted, judges' main way to verify technical depth is **asking the team to explain the build** — live, in Q&A, or on the video. A team that can't explain their own architecture reads as "AI did this without human oversight," which directly undercuts the "Use of AI" guidance (§3) and likely hurts Technical Execution scoring even though no code is inspected.
- **Every team member should be able to explain at least one part of the system in their own words** — not just the person who wrote it. Assign explainable ownership (e.g. "one teammate can explain why the lineage walk is cycle-safe and depth-capped, another can explain why Jira timeouts are recorded as ambiguous instead of retried") rather than letting the build stay a black box only one person understands. See `docs/QA_PREP.md` for the specific questions to prepare for.
- The video demo should probably include a brief "how it works" narration beat, not just a feature walkthrough — since it's the primary artifact for teams not selected for the live pitch, it needs to carry the technical-understanding signal on its own.

## 9. Open Questions to Confirm With Organizers

- Whether "Use of AI" is folded into Technical Execution or scored separately (DevPost page omits it; deck lists it) — the 2026-07-31 2:12pm Mistral message strongly suggests it's assessed via Q&A regardless of formal scoring category
- Whether an external AI agent (e.g. Claude Code, Cursor) appearing in a live demo purely as an MCP client counts as "the project" using a non-Mistral model — largely de-risked by the judge's live clarification (§1a: other models OK for "a clear technical reason," only Mistral gets funded access), but still worth a direct confirmation since it's exactly the scenario that rule was written to cover
- Which judging rubric is actually scored — DevPost's weighted 4, the deck's unweighted 5, or Atlassian's Relevance/Usefulness/Generality (§3) — three sources now phrase it differently; low risk since they overlap in substance, but worth a direct confirmation
- Whether the Hidden Signals Award (§2) is a separate prize pool/pitch or just a callout within the main judging — worth asking so we know whether to pitch for it explicitly as a second target
