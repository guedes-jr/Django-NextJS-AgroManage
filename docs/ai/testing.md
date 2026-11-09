# Testing and Quality Guide

Read this document only when implementing or validating code changes.

## Goal

Use the narrowest test/check that gives confidence in the change.

## Backend

Prefer:
1. affected test/test module,
2. affected Django app tests,
3. lint for changed Python code,
4. broader suite only when necessary.

Repository documentation exposes Make targets such as `make test-fast`, `make lint`, `make typecheck`, and `make test`. Confirm that the current Makefile still matches the repository before relying on them.

## Frontend

Prefer:
1. targeted tests when available,
2. lint,
3. TypeScript typecheck,
4. build only when the change affects build/runtime integration or before release.

## Full suite

Run the full suite when:
- changing shared infrastructure/common code,
- changing auth/permissions broadly,
- changing cross-domain contracts,
- preparing a release/PR where full validation is requested.

Do not repeatedly run full coverage/build loops while iterating on a local styling or isolated logic change.

## Isolated PostgreSQL phase-3 validation

`config.settings.test` remains SQLite. The explicit `config.settings.test_postgres`
requires `AGROMANAGE_TEST_PG_SOCKET` under `/private/tmp/agromanage-phase3-pg.*`,
uses only a private local socket on port 55473, role `phase3_validator`, and
creates/destroys `test_agromanage_phase3`. Never point it at the project database.
Installed PostgreSQL binaries are required; no new package is added.

From repository root, a disposable cluster and the focused integration/concurrency
checks can be run as follows. Its host authentication rejects network access and
the server listens only on the private socket. Stop it even when a test fails.

```sh
(
set -e
phase3_pg_root=$(mktemp -d /private/tmp/agromanage-phase3-pg.XXXXXX)
initdb -D "$phase3_pg_root/data" -U phase3_validator --encoding=UTF8 --no-locale --auth-local=trust --auth-host=reject
pg_ctl -D "$phase3_pg_root/data" -l "$phase3_pg_root/server.log" -o "-k $phase3_pg_root -p 55473 -c listen_addresses=''" start
trap 'pg_ctl -D "$phase3_pg_root/data" -m fast stop' EXIT
AGROMANAGE_TEST_PG_SOCKET="$phase3_pg_root" backend/.venv/bin/python backend/manage.py test apps.inventory.tests.test_mobile_phase3_integration --settings=config.settings.test_postgres --noinput
)
```

The module contains one cross-domain API acceptance test and seven PostgreSQL
concurrency tests using separate connections/threads: same-key replay, changed
payload, competing batches, signed stock/production confirmations, purchase
payable deduplication and preference-version conflict. SQLite explicitly skips
those seven lock tests. It is complementary to device/native acceptance, not a
replacement. The phase-3 module document records the broader targeted regression
run and the Android/iOS acceptance checklist.
