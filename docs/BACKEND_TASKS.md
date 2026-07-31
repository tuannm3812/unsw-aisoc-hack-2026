# Spatial Brain — Backend Implementation Tasks

> **For the Python teammate.** Priority order, with exact file paths and API contracts.

---

## P0: Fix Mistral Cache Pollution

**File:** `backend/app/services/mistral_service.py`

**Bug:** `_cache_write()` is called unconditionally after every extraction attempt, even when all chunks fail (empty `ExtractionResult()`). A single transient Mistral error permanently caches "zero findings" for that file — re-parsing returns the empty cache.

**Fix:**
```python
# In extract_from_text and extract_from_pdf:
result = _parse_extraction(...) or ExtractionResult()
if result and (result.findings or result.constraints):  # ← guard
    _cache_write(cache_key, result)
return result
```

---

## P1: Validate task_status With Enum

**File:** `backend/app/routers/boards.py`, line ~146

**Bug:** `update_node` does `node.task_status = payload.task_status` with no validation. Any string is accepted. The frontend edge styling (`edge-open`/`edge-active`/`edge-done`) depends on exact values.

**Fix:** Add Pydantic validation:
```python
from enum import Enum

class TaskStatus(str, Enum):
    open = "open"
    assigned = "assigned"
    in_progress = "in_progress"
    in_review = "in_review"
    done = "done"
```
Wire it into `NodeUpdate` schema. Return 422 for invalid values.

---

## P2: Fix assign_task Schema Bypass

**File:** `backend/app/routers/tasks.py`

**Bug:** `assign` endpoint signature is `payload: dict`, manually `payload.get("assignee_id")`. The `AssignRequest` schema in `schemas.py` exists but isn't used. Missing `assignee_id` produces a 404 instead of 422.

**Fix:** Change to `payload: AssignRequest`.

---

## P3: Add PATCH /api/boards/{board_id}/edges/{edge_id}

**Files:** `backend/app/routers/boards.py`, `backend/app/schemas.py`

**Why:** The frontend's edge-relation-change currently does delete-then-create, losing `created_by`/`created_at` and risking permanent loss if the create half fails.

**Contract:**
```
PATCH /api/boards/{board_id}/edges/{edge_id}
Body: { "relation": "supports" }  # must be valid RelationType
Response: EdgeOut
Errors: 400 (invalid relation), 400 (creates task cycle), 404
```

**Implementation hints:**
1. Validate `relation` is in `Relation` enum
2. Run `creates_task_cycle(source_id, target_id)` — see existing logic in the POST handler
3. If valid, set `edge.relation = new_value` and commit
4. Return `EdgeOut` with all fields

---

## P4: Expose Edge Timestamps in EdgeOut

**File:** `backend/app/schemas.py`

**Why:** The frontend wants to show `created_by` and `created_at` in the edge Inspector. The `Edge` model already has these columns — just add four lines to `EdgeOut`.

**Schema change:**
```python
class EdgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    board_id: str
    source_id: str
    target_id: str
    relation: str
    created_by: str = ""       # ← add
    created_at: datetime | None = None  # ← add
```

---

## P5: Add Activity Log Endpoint

**File:** New `backend/app/routers/activity.py`

**Why:** The `ActivityLog` table is written to everywhere (`log_activity` calls in boards.py, tasks.py, agent.py). The frontend can't show it — there's no GET endpoint.

**Contract:**
```
GET /api/boards/{board_id}/activity?limit=20
Response: [{ action, actor, subject_id, detail, created_at }]
```
Reuse the existing `ActivityLog` model — just query and return.

---

## P6: Jira Status Webhook (Long-Term)

**Why:** Close the loop — when a Jira ticket moves to "In Progress" or "Done", the canvas task node should reflect that.

**Contract:** `POST /api/jira-webhook` receives Jira Cloud webhook payload → match `correlation.spatialBrain.taskId` → update `task_status` on the corresponding node.

This needs https access — for the hackathon demo, skip unless Render/Vercel gives you a public URL.

---

## Prompt Templates for the Teammate

Copy these into Cursor or Claude Code:

```
# Fix Mistral cache pollution
Read backend/app/services/mistral_service.py. Find every call to _cache_write(). 
Add a guard: only write to cache if the extraction result is non-empty 
(has findings or constraints). Show the diff.

# Validate task_status
Read backend/app/routers/boards.py, find update_node. Add a TaskStatus str enum 
to schemas.py. Wire it into NodeUpdate so invalid status values return 422.

# Add PATCH /edges/{edge_id}
Read backend/app/routers/boards.py. Add a PATCH handler for edges that accepts 
{ "relation": "supports" }. Validate the relation is legal. Check for task cycles 
using the existing creates_task_cycle(). Return EdgeOut.

# Expose edge timestamps
Read backend/app/schemas.py. Add created_by: str and created_at: datetime | None 
to EdgeOut. No migration needed — columns already exist on the Edge model.

# Activity log endpoint
Read backend/app/models.py ActivityLog. Create backend/app/routers/activity.py 
with GET /api/boards/{board_id}/activity?limit=20. 
Register in main.py. Return the last N activity log entries as JSON.
```

---

## Do NOT Change

- Database schema (no migrations needed)
- Lineage walk logic (`backend/app/services/lineage.py`)
- Mistral OCR pipeline structure
- Jira service
- MCP server
- The three demo accounts / seed data
