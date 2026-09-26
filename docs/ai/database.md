# Database Guide

Read this document only for database, Django model, migration or query tasks.

## Database

AgroManage uses PostgreSQL through Django.

## Principles

- Preserve tenant/organization isolation.
- Prefer explicit constraints for invariants that belong in the database.
- Add indexes based on real access patterns, not speculation.
- Avoid destructive migrations without a migration/data strategy.
- Separate schema migrations from large data migrations when practical.
- Review nullable/default transitions carefully on populated tables.

## Query work

Before optimizing:
1. identify the endpoint/job/query,
2. inspect generated ORM access,
3. look for N+1 behavior,
4. check filtering/order/pagination,
5. then consider indexes or query restructuring.

## Migration checklist

- Does the change lock or rewrite a large table?
- Is a default safe for existing rows?
- Does data need backfilling?
- Can deployment run old and new code during rollout?
- Are unique/foreign-key constraints valid for existing data?
- Are rollback implications understood?

Never reset or destroy a database unless the user explicitly asks for it and the target environment is confirmed safe.
