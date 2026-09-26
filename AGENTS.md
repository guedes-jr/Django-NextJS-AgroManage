# AgroManage — Agent Instructions

## Operating principle

Use the smallest useful context. Start from the request, search for the relevant symbols/files, and open only direct dependencies. Current source and configuration are authoritative over plans or historical notes.

## Guardrails

- Do not recursively scan the repository or preload documentation.
- Do not inspect generated/vendor directories (`.git`, virtual environments, `node_modules`, `.next`, coverage, caches).
- Never expose `.env` values or secrets.
- Preserve tenant isolation and existing authorization behavior.
- Keep changes scoped; do not refactor, rename, move files, or add dependencies outside the request.

## Context routing

Open [docs/README.md](docs/README.md) only when repository context is needed, then read one relevant guide:

| Task | Guide |
|---|---|
| Django / DRF | `docs/ai/backend.md` |
| Next.js / TypeScript / UI | `docs/ai/frontend.md` |
| Models / migrations | `docs/ai/database.md` |
| API / auth / contracts | `docs/ai/api.md` |
| Tests / quality | `docs/ai/testing.md` |
| Docker / deploy / infrastructure | `docs/ai/infra.md` |
| Cross-cutting architecture | `docs/architecture/overview.md` |
| Current status or roadmap | `docs/planning/` |

Do not read unrelated guides. Consult architecture or planning only for tasks that need them.

## Implementation

- Backend: keep domain logic out of views/serializers when a service or selector is the natural owner; avoid N+1 queries.
- Frontend: keep API access in the existing client/service layer; preserve typed, loading, error, empty, permission, and responsive states.
- Schema changes require migrations; other changes do not.
- For changed behavior, add or update the narrowest relevant test.

## Completion

Read the smallest affected set of files before editing. Run the narrowest relevant validation, fix failures caused by the change, and report files changed, validation, and unresolved issues. Use the full suite only for cross-cutting work or when targeted validation is insufficient.

## Documentation

Update the existing focused document only when architecture, contracts, infrastructure, or major project state changes. Do not create root-level plans, adjustment notes, or temporary agent-instruction files.
