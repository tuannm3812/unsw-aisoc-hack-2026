# Coding Standards (Spatial Brain)

Project-specific standards for this hackathon build. Inherits documentation, git,
and commit conventions from the master standard at
`~/Documents/GitHub/coding-standards/coding_standards.md` directly (sections 7-10
below). Sections 1-6 are rewritten for this project's actual shipped stack — a
Python/FastAPI backend plus a Next.js/TypeScript frontend, not the Next.js
monolith the original design spec proposed (see `README.md` "What shipped vs
the design spec" for why that changed).

## 1. Repository Scope

- `backend/app/` — FastAPI app: `routers/` (HTTP endpoints), `services/`
  (Mistral, Jira, lineage, graph logic), `mcp/` (the MCP server), `models.py`,
  `schemas.py`.
- `backend/tests/` — pytest suite. `backend/scripts/` — small CLI helpers
  (`preflight.py`, `smoke.py`, `mcp_check.py`) only, not core logic.
- `frontend/` — Next.js app: `app/` (routes), `components/canvas/` (the React
  Flow canvas and its parts), `components/ui/` (generic UI primitives),
  `lib/`, `stores/`.
- `docs/` — standards, demo runbook, MCP guide, Q&A prep, design spec (see
  `docs/README.md` for the index).
- `demo/` — assets used in the live demo (e.g. the seeded PDF). Recordings
  are gitignored (large; kept locally).
- Root `README.md` — what shipped, how to run, verify.

## 2. File & Naming

- **Backend (Python)**: `snake_case` for files, modules, functions, and
  variables; `PascalCase` for classes/dataclasses.
- **Frontend (TypeScript)**: `kebab-case` for files/folders, `PascalCase` for
  React components.
- API routes are grouped by resource under `backend/app/routers/` (e.g.
  `tasks.py`, `boards.py`, `agent.py`), not one file per endpoint.

## 3. Code Style

**Backend (Python)** — inherit the master standard's §3 (PEP8) directly, since
this is genuinely Python now, not notebook code:
- Type hints on function signatures; `from __future__ import annotations` for
  forward references.
- Module-level docstrings explain **why the module exists and what it
  guarantees** (see `lineage.py`'s docstring as the reference example), not
  just what functions do.
- Inline comments explain why a decision was made (e.g. "IDs not names,
  because team-managed projects make names ambiguous"), never restate the
  code.
- Group imports: standard library → third-party → local, blank line between
  groups.

**Frontend (TypeScript)**:
- `strict: true` in `tsconfig.json`. No `any`; explicit return types on
  exported functions.
- Import order: external packages → internal → relative, each group
  blank-line separated.
- Same "why, not what" comment rule as the backend.

## 4. API/Service Style

- Small, focused service modules — one concern per file (`jira_service.py`
  only talks to Jira, `lineage.py` only walks the graph, `mistral_service.py`
  only calls Mistral).
- Centralize config/env access through `backend/app/config.py`
  (`pydantic-settings`) rather than scattering `os.environ` reads through the
  codebase.
- Error handling follows the demo-safe pattern established in
  `jira_service.py`: distinguish a definite failure from an ambiguous one
  (e.g. a timeout after a create call) rather than guessing or retrying
  blindly, and surface the distinction to the UI instead of failing silently.
  See `docs/DESIGN_SPEC.md` §7 for the original rationale.

## 5-6. N/A

No feature-engineering/leakage concerns (§5 of the master doc) or plotting
(§6) in this project.

## 7. Documentation Style

Inherit the master standard's §7 directly: numbered sections where it aids
navigation, findings/implications first, relative links between docs,
timestamp any fact that can change (deadlines, scores, quotas — see how
`STRATEGY.md` is written).

## 8. Git Hygiene

Inherit the master standard's §8 directly, enforced via `.gitignore`: never
commit `node_modules/`, `.next/`, `backend/.venv/`, `__pycache__/`,
`.pytest_cache/`, SQLite database/upload/cache files under
`backend/storage/`, `.env*`, or demo video recordings.

## 9. Commit Message Convention

Inherit the master standard's §9 directly — Conventional Commits, scoped and
imperative:

```
<type>(<scope>): <imperative summary>
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Examples from this project's actual history:
- `feat(backend): FastAPI app with graph models, auth, Mistral, Jira, and MCP`
- `feat(frontend): React Flow canvas with typed nodes, inspector, and polling`
- `docs(demo): correct video-as-fallback framing to video-as-primary`
- `feat(setup): add macOS/Linux start.sh mirroring start.ps1`

One coherent change per commit; material detail goes in the commit body, not
just the subject.

## 10. Pre-Commit/Pre-Push Workflow

Inherit the master standard's §10 directly:

1. `git status --short` and review every path — never blind `git add -A`.
2. Run whatever verification is proportional to the change: `pytest` for
   backend logic, `npx tsc --noEmit` for frontend changes, or
   `./start.sh --check` (macOS/Linux) / `.\start.ps1 -Check` (Windows) for a
   full pass covering both plus seeding.
3. Stage only the intended change; `git diff --cached --stat` as a final
   check.
4. Write the commit message per §9 above.
5. Push without force; confirm the commit landed on the expected branch.
