# Infrastructure Guide

Read this document only for Docker, Nginx, deployment, environment or infrastructure tasks.

## Current location

Infrastructure is stored under `infra/` in the current repository tree. Do not assume old root-level `docker/` or `docker-compose*.yml` paths from stale documentation.

Before changing infrastructure:
1. inspect `infra/`,
2. inspect the relevant Makefile/script command,
3. inspect environment examples,
4. confirm development vs production target.

## Rules

- Never commit `.env` secrets.
- Do not expose database/Redis services publicly without a requirement.
- Preserve health checks and restart behavior where present.
- Keep development and production configuration differences explicit.
- Validate Nginx upstream/static/media paths against current app paths.
- Pin or deliberately manage major runtime versions.

If this document conflicts with actual `infra/` files, the current files are authoritative and this document should be updated.

## Isolated Next.js builds

Compile production updates in an isolated directory with local dependencies,
not a `node_modules` symlink to another project directory. Exclude `.next` from
the staging copy and discard `.next/cache` before moving a completed build into
production: Webpack caches can retain relative paths to the staging directory.
Never run `next build` against the `.next` directory used by an active server.
Keep the previous build for rollback and stop the frontend only for the final
artifact swap and restart.
