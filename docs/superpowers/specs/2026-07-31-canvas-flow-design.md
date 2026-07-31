# [Project Name] — Design Spec

**Date:** 2026-07-31
**Duration:** 2-day hackathon
**Must use:** Mistral API (eligibility requirement)

---

## Problem

Founders/PMs have ideas scattered across notes, screenshots, and research — but developers need clear, structured context to execute. The gap is constant back-and-forth clarification. This tool bridges that gap by letting PMs organize thoughts on a visual canvas, then using Mistral AI to synthesize context and generate actionable task specs for developers.

**Target users:** Founder/PM (organizes ideas) → Developer (receives structured tasks)

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                    Vercel                         │
│  ┌────────────────────────────────────────────┐  │
│  │  Next.js (Frontend only)                    │  │
│  │  @xyflow/react + Tailwind CSS              │  │
│  │  Canvas UI, sidebar, context panel          │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │ REST API calls (fetch)           │
└─────────────────┼─────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│                    Render                         │
│  ┌────────────────────────────────────────────┐  │
│  │  FastAPI (Python)                           │  │
│  │  /api/nodes      CRUD                       │  │
│  │  /api/edges      CRUD                       │  │
│  │  /api/upload     File upload                │  │
│  │  /api/summarize  → Mistral context summary  │  │
│  │  /api/generate-task → Mistral task spec     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                  │
│       ┌─────────┼──────────┐                      │
│       │  Neon   │ Mistral  │                      │
│       │  PG     │ API      │                      │
│       └─────────┴──────────┘                      │
└──────────────────────────────────────────────────┘
```

| Layer | Tech | Deploy |
|-------|------|--------|
| Frontend | Next.js + TypeScript + @xyflow/react + Tailwind CSS | Vercel |
| Backend | FastAPI + Python + SQLAlchemy + mistralai SDK | Render |
| Database | Neon Postgres | — |
| File storage | Vercel Blob (frontend direct upload) | — |
| AI | Mistral (`mistral-small-latest`) | — |

---

## Database Schema

```sql
-- Node table
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('info', 'task')),
  title       TEXT NOT NULL,
  description TEXT,
  position_x  REAL NOT NULL,
  position_y  REAL NOT NULL,
  assignee    TEXT,
  status      TEXT CHECK (status IN ('todo', 'in_progress', 'done')),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Edge table (connections between nodes)
CREATE TABLE edges (
  id             TEXT PRIMARY KEY,
  source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(source_node_id, target_node_id)
);

-- Uploaded files attached to a node
CREATE TABLE attachments (
  id         TEXT PRIMARY KEY,
  node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,
  blob_url   TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Routes (FastAPI)

```
POST   /api/nodes              Create node
GET    /api/nodes              List all nodes (includes edges + attachments)
PATCH  /api/nodes/{id}         Update node (content, position, assignee, status)
DELETE /api/nodes/{id}         Delete node + cascade edges + attachments

POST   /api/edges              Create edge
DELETE /api/edges/{id}         Delete edge

POST   /api/upload             Upload file → store to Vercel Blob, create Attachment record

POST   /api/summarize          Mistral context chain summary
       Body: { "node_id": "..." }
       Flow:
         1. BFS upstream via edges, collect all connected info nodes
         2. Assemble prompt with all content
         3. Call mistral-small-latest (JSON mode)
         4. Return: { summary, key_points, context, missing_info }

POST   /api/generate-task      Mistral task spec generation
       Body: { "node_id": "...", "assignee": "..." }
       Flow:
         1. Collect upstream context (same BFS)
         2. Call mistral-small-latest (JSON mode)
         3. Return: { title, description, acceptance_criteria, technical_notes, priority }
         4. Write result back to node record
```

---

## Mistral Prompt Strategy

Both endpoints use `mistral-small-latest` with `response_format: { type: "json_object" }`.

### Summarize system prompt
> You are a technical documentation assistant for a cross-functional team. Given scattered notes, research, and file descriptions from connected canvas nodes, produce a coherent context document. Identify gaps — what information is missing for a developer to understand the full picture.

### Generate-task system prompt
> You are a senior technical PM. Given upstream context and a rough task idea, produce a structured, executable task spec. Write acceptance criteria that a developer can verify. Include technical notes based on the context available. Be specific, not generic.

---

## Frontend Component Tree

```
app/
├── layout.tsx              ← Inter + Geist fonts, global CSS (dot grid bg)
├── page.tsx                ← Main canvas page, layout shell
│   ├── Canvas.tsx          ← @xyflow/react <ReactFlow> container
│   │   ├── InfoNode.tsx    ← info node card (title, desc, attachments)
│   │   │   ├── AttachmentList.tsx
│   │   │   └── NodeToolbar.tsx   ← hover actions (summarize, delete)
│   │   └── TaskNode.tsx    ← task node card
│   │       ├── AssigneeBadge.tsx
│   │       └── StatusTag.tsx
│   ├── Sidebar.tsx         ← left tool panel (add node, triggers)
│   ├── BottomBar.tsx       ← bottom view switcher (Canvas | Gantt | List)
│   ├── ContextPanel.tsx    ← right slide-out panel (summarize results / task specs)
│   └── CreateNodeModal.tsx ← node creation modal (title, desc, file upload)
│
├── api/
│   └── client.ts           ← fetch() wrapper, baseURL = env(NEXT_PUBLIC_API_URL)
│
└── lib/
    └── types.ts            ← Node, Edge, Attachment, SummarizeResult, TaskSpec types
```

### Key Interaction Flows

1. **Create node:** Drag from Sidebar → CreateNodeModal → fill form → POST /api/nodes → node renders on canvas
2. **Summarize context:** Select node → toolbar "Summarize" → POST /api/summarize → ContextPanel slides out with result
3. **Generate task:** Create task node → "Generate Task" → POST /api/generate-task → TaskNode auto-fills spec
4. **Connect nodes:** Drag handle between two nodes → POST /api/edges
5. **Move node:** Drag on canvas → onNodeDragStop → PATCH /api/nodes/{id} with new position

---

## Design System (from Figma exports)

| Token | Value |
|-------|-------|
| Font (headings) | Inter, 400–700 |
| Font (labels) | Geist, 500–600 |
| Primary | #3525cd (Deep Indigo) |
| AI accent | #006c49 (Teal) |
| Background | #f7f9fb with dot grid (#E2E8F0, 15%, 24px spacing) |
| Node border | 1px #E2E8F0 |
| Active node border | 2px #4F46E5 |
| Bezier curve | 2px, tension 0.5 |
| AI-suggested links | Dashed teal stroke (`stroke-dasharray: 4 4`) |

---

## Phase 1 Scope (this hackathon)

### In scope
- Infinite canvas with node CRUD (title, description, file upload)
- Node connections via Bezier curves
- Two node types: info and task
- Assignee field on task nodes
- Mistral context chain summarization (BFS upstream)
- Mistral task spec auto-generation
- Vercel Blob file attachments
- Frontend → Vercel, Backend → Render

### Out of scope
- Authentication / user accounts
- Jira integration
- Slack / Discord / Email notifications
- MCP server
- Gantt chart / List view (UI buttons can be stubs)
- Multi-project / multi-canvas

---

## Success Criteria (Demo Flow)

1. PM creates 3 info nodes: "User feedback summary", "Competitor analysis", "Design mockups"
2. PM uploads screenshots/research to each node
3. PM connects all 3 nodes → a new task node "Build onboarding v2"
4. PM clicks "Generate Task" → Mistral reads all upstream content → outputs structured task spec
5. PM assigns to "张三", task node turns green (AI-generated)
6. PM clicks "Summarize" on any node → ContextPanel shows coherent context doc
