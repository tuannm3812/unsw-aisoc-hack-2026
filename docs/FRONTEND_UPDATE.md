# Frontend Update Report — 2026-07-31

**Branch:** `main` | **Commit:** `54d2c7f` | **Files changed:** 41

---

## Summary

The frontend (Next.js 15 + React Flow + Zustand + shadcn/ui) received a significant interaction layer upgrade. All changes are frontend-only — zero backend modifications required.

---

## Canvas Interactions

### ⊕ Edge Derivation
Hover any edge midpoint → click the ⊕ button → creates a "Branch Idea" finding node and automatically wires it via `derived_from`. The button is always subtly visible (25% opacity) and pops to full on hover.

**Files:** `components/canvas/CustomEdge.tsx` (new), `components/canvas/Canvas.tsx`

### Right-Click Context Menus

Three surfaces, all using the same React Flow context menu pattern:

| Surface | Menu items |
|---------|-----------|
| **Node right-click** | Create downstream nodes (Finding / Constraint / Task / Subtask, auto-wired with correct relation), Focus, Copy Task ID, Mark Done, Duplicate, Delete |
| **Edge right-click** | Switch relation type (supports / constrains / derived from / implements), Delete edge |
| **Canvas right-click** | Add Finding / Add Constraint / Add Task — free placement |

**Files:** `components/canvas/NodeContextMenu.tsx` (new), `components/canvas/EdgeContextMenu.tsx` (new), `components/canvas/Canvas.tsx`

### Drag-to-Create
Drag a connection handle from any node → drop on empty canvas → the context menu appears at the drop point, offering connected creation with the correct relation type for the source node's kind.

**How it works:** `onConnectStart` records the source node's ID and kind in a ref. `onConnectEnd` checks whether the drop target was the pane rather than a valid node. If yes and the event is a `MouseEvent` (touch-safe guard), the menu opens.

**Files:** `components/canvas/Canvas.tsx`

### My Tasks Filter
TopBar now has a "My Tasks" toggle button. When active, all task nodes not assigned to the signed-in user render at 25% opacity with pointer-events disabled, making it visually obvious which tasks belong to you.

State is cleared on sign-out to prevent cross-session leakage.

**Files:** `components/canvas/TopBar.tsx`, `components/canvas/Canvas.tsx`, `stores/graphStore.ts`

---

## Inspector Panel (Right Sidebar)

### Conflict Detector
Task nodes in the Inspector now have a "Check Alignment" button in the Details tab (below the Status section) and a dedicated "Alignment" tab.

Clicking it triggers a mock Mistral analysis that scans connected context nodes for contradictions and renders them as flagged pairs (Node A vs Node B) with descriptions. When the backend adds a `/api/check-alignment` endpoint, the mock is automatically replaced.

**Files:** `components/canvas/Inspector.tsx`

### AI Task Breakdown
Task nodes now have a "Break into subtasks" button in the Details tab. It shows a Mistral‑suggested list of concrete subtasks with titles and descriptions.

The mock data is display‑only (no store writes, no API calls — unlike the previous version which was corrected in code review).

**Files:** `components/canvas/Inspector.tsx`

### Sprint Review
The Toolbar has a "Sprint Review" button (bar chart icon, rightmost position). Clicking it opens a full‑screen dialog with three sections — Shipped, Blocked, Next — each item showing assignee, title, and a one‑line summary. Mock data; replaceable with `/api/sprint-review`.

**Files:** `components/canvas/Toolbar.tsx`

---

## Task Node Visuals

### Priority Badges
Task nodes auto‑detect priority from title and body text via keyword matching:

| Matches | Badge |
|---------|-------|
| `P0`, `urgent`, `critical` | Red "P0" |
| `P1`, `high`, `blocker` | Amber "P1" |
| `P2`, `medium` | Blue "P2" |
| `P3`, `low` | Gray "P3" |
| `P4`, `nice`, `later` | Light gray "P4" |

None of this touches the backend — the badge is rendered purely from client‑side text analysis.

**Files:** `components/canvas/GraphNodeCard.tsx`

---

## Visual Polish

- **Canvas contrast:** Light‑mode canvas background darkened from `oklch(0.985)` to `oklch(0.96)` — node cards now clearly separate from the dot‑grid background.
- **Lineage dismiss:** A "Stop highlighting" button appears at the top center of the canvas whenever lineage tracing is active. Previously there was no way to clear the dimmed state without re‑selecting the task node.
- **Self‑connection guard:** `isValidConnection` prevents accidental node‑to‑self wiring.
- **Edge relation change rollback:** Switching an edge's relation now creates the new edge first, then deletes the original — if the new edge is rejected by the backend (e.g., cycle), the original edge survives.

---

## Bug Fixes

| # | Severity | Issue | Fix |
|---|:---:|------|------|
| 1 | P0 | ⊕ derivation used `screenToFlowPosition` on already‑flow coordinates → branch nodes landed off‑screen whenever the viewport was panned/zoomed | Removed the double transform — use flow coordinates directly |
| 2 | P0 | Task breakdown mock wrote 4 fabricated Stripe tasks into the real store and backend | Mock is now display‑only, no `addNode`/`addEdge` calls |
| 3 | P0 | Edge relation change deleted the original edge before validating the new one → 400 error lost the edge permanently | Create new edge first, delete original only on success |
| 4 | P0 | "Duplicate" on asset nodes POSTed `kind=asset` → backend 400 with no user feedback | Asset nodes are excluded from the Duplicate action |
| 5 | P1 | Lineage highlighting had no dismiss path → entire canvas rendered at 25% opacity with no recovery | "Stop highlighting" button rendered on canvas when lineage is active |
| 6 | P1 | Dragging a connection onto itself created a self‑link → backend 400 swallowed silently | `isValidConnection={source !== target}` guard |
| 7 | P1 | `onConnectEnd` cast `TouchEvent` to `MouseEvent` → `clientX` was undefined on touch devices | `instanceof MouseEvent` guard before reading coordinates |
| 8 | P1 | My Tasks filter state survived sign‑out → next user's board appeared dimmed or lineage‑locked | `clearLineage()` + `setMyTaskFilter(null)` on sign‑out |

---

## Files Created

```
frontend/
  components/canvas/
    CustomEdge.tsx          — ⊕ derivation edge component
    EdgeContextMenu.tsx     — edge right-click menu
    NodeContextMenu.tsx     — node/canvas right-click menu
```

## Files Modified

```
frontend/
  app/
    globals.css             — canvas background contrast
  components/canvas/
    Canvas.tsx              — edgeTypes, context menus, derivation, guards
    GraphNodeCard.tsx       — priority badges
    Inspector.tsx           — Conflict Detector, task breakdown, Alignment tab
    Toolbar.tsx             — Sprint Review button + dialog
    TopBar.tsx              — My Tasks filter, sign-out cleanup
  stores/
    graphStore.ts           — myTaskFilter state + setter
```

## What's NOT in this Update

- **Backend:** Zero changes. All new features degrade gracefully to mock data when the backend is unreachable or the endpoint doesn't exist.
- **Confluence publish button:** Removed — backend has no Confluence integration.
- **Original Seed Data / Demo PDF / MCP Server / Jira Service:** Untouched.

---

## To Connect the Mock Features to Mistral

Three endpoints exist in `frontend/lib/api.ts` that currently fall back to mock data. When the backend adds them, the UI will use real Mistral output automatically:

| Client method | Backend endpoint needed | Mock behavior |
|--------------|------------------------|---------------|
| `api.checkAlignment(nodeId)` | `POST /api/check-alignment` | Shows one demo conflict |
| `api.sprintReview()` | `POST /api/sprint-review` | Shows 5 demo items |
| `api.breakDown(nodeId)` | `POST /api/break-down` | Shows 4 demo subtasks |

No frontend code changes needed — just implement these three FastAPI routes.
