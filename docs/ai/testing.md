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
