# AgroManage Documentation Router

Use this page to choose the **minimum** documentation required for the current task.

> Agents: do not read every document. Open only the guide related to the requested work.

| Work area | Read |
|---|---|
| Django / DRF / backend behavior | `ai/backend.md` |
| Next.js / TypeScript / UI | `ai/frontend.md` |
| PostgreSQL / models / migrations | `ai/database.md` |
| REST API / auth / contracts | `ai/api.md` |
| Tests / lint / type checking | `ai/testing.md` |
| Docker / Nginx / deploy / infra | `ai/infra.md` |
| Cross-cutting architecture | `architecture/overview.md` |
| What is currently being worked on | `planning/current-state.md` |
| Planned next work | `planning/roadmap.md` |

## Source-of-truth order

For implementation details, use this order:

1. Current source code and configuration
2. `AGENTS.md`
3. Focused documentation under `docs/`
4. Historical/archive material

Planning notes and archived documents are not authoritative for current implementation.

## Documentation rules

- One concept should have one canonical document.
- Prefer links over duplicated explanations.
- Archive completed plans instead of leaving them in the repository root.
- Update paths immediately after structural changes.
- Keep agent-facing guides concise and operational.
