# Coding Standards (Context Canvas)

Project-specific standards for this Next.js/TypeScript hackathon build. Inherits
documentation, git, and commit conventions from the master standard at
`~/Documents/GitHub/coding-standards/coding_standards.md`; replaces its
notebook/Python-specific sections (repo scope, naming, code style) with
TypeScript equivalents below, since this project isn't notebook-first.

## 1. Repository Scope

- App code lives in the standard Next.js App Router layout: `app/`, `components/`, `lib/`, `prisma/`.
- `docs/` — standards, design specs, decisions (see `docs/README.md` for the index).
- `README.md` — high-level overview and setup instructions.
- Avoid ad hoc `scripts/` or `data/` folders unless a genuine local-execution need arises.

## 2. File & Naming

- `kebab-case` for files and folders, `PascalCase` for React components.
- API routes follow Next.js App Router conventions (e.g. `app/api/nodes/route.ts`).

## 3. Code Style

- `strict: true` in `tsconfig.json`. No `any`; explicit return types on exported functions.
- Import order: external packages → internal (`@/lib`, `@/components`) → relative — each group blank-line separated (ESLint import-order rule).
- Comments explain **why**, never restate what the code already does.

## 4. API/Component Style

- Small, focused API route handlers — one concern per handler.
- Centralize config/env access (e.g. a single `lib/env.ts`) rather than scattering `process.env.X` through the codebase.
- Error handling follows the design spec's demo-safe fallback pattern (`docs/superpowers/specs/2026-07-31-context-canvas-design.md` §7) — degrade visibly, never crash silently.

## 5–6. N/A

No feature-engineering/leakage concerns (§5 of the master doc) or plotting (§6) in this project.

## 7. Documentation Style

Inherit the master standard's §7 directly: numbered sections, findings/implications first, relative links between docs, timestamp any fact that can change (deadlines, scores, quotas — already how `STRATEGY.md` is written).

## 8. Git Hygiene

Inherit the master standard's §8 directly, enforced via `.gitignore`: never commit `node_modules/`, `.next/`, `.env*`, Prisma's generated client, or credentials/tokens.

## 9. Commit Message Convention

Inherit the master standard's §9 directly — Conventional Commits, scoped and imperative:

```
<type>(<scope>): <imperative summary>
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Examples for this project:
- `feat(canvas): add context node creation and file upload`
- `feat(mcp): expose get_task_context tool over streamable HTTP`
- `docs(spec): add Conflict Detector as third demo wow moment`
- `fix(mistral): retry once on transient summarization errors`

One coherent change per commit; material detail goes in the commit body, not just the subject.

## 10. Pre-Commit/Pre-Push Workflow

Inherit the master standard's §10 directly:

1. `git status --short` and review every path — never blind `git add -A`.
2. Run whatever verification is proportional to the change (typecheck/lint for code, relative-link check for docs-only changes).
3. Stage only the intended change; `git diff --cached --stat` as a final check.
4. Write the commit message per §9 above.
5. Push without force; confirm the commit landed on the expected branch.
