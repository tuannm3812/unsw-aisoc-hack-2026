# Canvas Information Density & Relation Editing — Implementation Plan

**Goal:** Make task cards information-rich, edges first-class citizens, ⊕ derivation smarter, and Inspector properly structured.

**Architecture:** Pure frontend + minimal backend additions (PATCH /edges, EdgeOut fields). No DB schema changes.

**Priority order (impact ÷ cost):**

---
### Phase 1: Fix Fake Data (P0)

- [x] **5.1** Replace Stripe/checkout mock data with retrieval-grounding content

### Phase 2: Task Card Info (P0)

- [ ] **1.1** Status pill on task cards
- [ ] **1.4** Grounded-in-N count chip (BFS lineage count)
- [ ] **1.5** Assignee initials chip
- [ ] **1.2** PR badge
- [ ] **1.3** Jira sync state indicator
- [ ] **1.6** Relative time

### Phase 3: Edge as First-Class (P1)

- [ ] **2.1** Full relation labels
- [ ] **2.5** Parallel edge label offset
- [ ] **3.4** Remove assigned_to or use it

### Phase 4: ⊕ Derivation Redo (P1)

- [ ] **4.1** Mini-menu for kind selection
- [ ] **4.3** Auto-select + edit after derive
- [ ] **4.4** Collision-avoiding placement
- [ ] **4.5** ⊕ only on edge hover

### Phase 5: Inspector (P2)

- [ ] **5.2** Alignment tab self-contained
- [ ] **5.3** Details tab grouping
- [ ] **5.4** Downstream dependencies
- [ ] **5.5** Auto-lineage on task select
- [ ] **5.6** Collapsible panel
