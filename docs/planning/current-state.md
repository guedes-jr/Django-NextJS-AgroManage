# Current Project State

Updated: 2026-09-26

This file is intentionally concise. Update it when major work changes; do not turn it into a changelog.

## Product scope visible in the repository documentation

AgroManage covers:
- organizations / multi-tenant structure
- farms and sectors
- livestock
- crops
- inventory
- finance
- reports
- operational tasks
- audit

## Current technical shape

- Django + Django REST Framework backend
- Next.js + TypeScript frontend
- PostgreSQL
- Redis + Celery
- infrastructure under `infra/`
- repository automation through `Makefile` and `scripts/`

## Current planning note

The repository currently contains/contained planning material for a SaaS administration panel and next-step plans. Before continuing that work, consolidate any still-open items into `docs/planning/roadmap.md` and archive completed plans.

## Maintenance rule

Keep only active, high-level state here. Completed implementation details belong in Git history or architecture documentation.
