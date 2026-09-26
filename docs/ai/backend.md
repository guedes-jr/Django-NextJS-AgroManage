# Backend Guide

Read this document only for backend/Django/DRF tasks.

## Location

Backend source lives under `backend/`.

The project is organized around Django apps/domains such as accounts, organizations, farms, livestock, crops, inventory, finance, reports, tasks and audit. Confirm the current directory names before changing code.

## Working rules

- Inspect the affected app first; do not scan every Django app.
- Keep HTTP concerns in views/viewsets and serializers.
- Put reusable or non-trivial business logic in the project's service/domain layer.
- Keep reusable/complex read logic in selectors/query helpers where the local app follows that pattern.
- Reuse shared helpers from `backend/common/` when appropriate.
- Preserve organization/tenant boundaries in every query and mutation.
- Avoid N+1 database access.
- Keep serializers explicit about writable/read-only fields.
- Use transactions for multi-write operations that must be atomic.
- Do not silently swallow domain errors.

## Django changes

For model changes:
1. Inspect related model, serializer/service, admin and tests.
2. Create a migration only when schema state changes.
3. Review migration safety before applying it.
4. Update API/types if the public shape changed.

For endpoint changes:
1. Inspect URL/router registration.
2. Inspect serializer and permissions.
3. Inspect service/query path.
4. Update targeted tests.
5. Update `docs/ai/api.md` only for meaningful contract changes.

## Performance

Check for:
- repeated queries in loops,
- missing `select_related`/`prefetch_related`,
- unnecessary `.all()` materialization,
- large unpaginated endpoints,
- expensive annotations repeated per row,
- avoidable serialization work.

Do not optimize speculatively; verify the query path first.

## Security

Never weaken:
- authentication,
- tenant/organization isolation,
- object-level authorization,
- validation,
- audit requirements for critical actions.

Never print or commit secrets.
