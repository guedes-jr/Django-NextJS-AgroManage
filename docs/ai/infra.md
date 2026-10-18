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

## WhatsApp recovery from the platform panel

The managed production container is `agromanage-wppconnect`. To allow platform
owners/admins to recover its browser from the web panel, install the fixed helper
and the narrow sudo rule as root:

```sh
install -o root -g root -m 0755 infra/whatsapp/agromanage-wppconnect-control /usr/local/sbin/agromanage-wppconnect-control
visudo -cf infra/whatsapp/agromanage-wppconnect.sudoers
install -o root -g root -m 0440 infra/whatsapp/agromanage-wppconnect.sudoers /etc/sudoers.d/agromanage-wppconnect
visudo -cf /etc/sudoers.d/agromanage-wppconnect
```

Recovery is enabled only for a configured local HTTP WPPConnect endpoint on
port 21465, matching the fixed container helper.

Enable `WPP_CONNECT_RECOVERY_ENABLED=True` in the backend environment and restart
the backend. Apply platform_admin migration 0013 for shared health observations.
The rule is for the existing `deploy` service user and exactly the helper's
`restart` argument. Keep the helper and its parent directory root-owned and
unwritable by deploy. Do not grant Docker group membership, Docker socket access
or arbitrary sudo commands to the web process. Recovery uses Docker restart with
a 15-second stop timeout and leaves tokens/userDataDir volumes intact.

When calling `scripts/update_project.sh` over root SSH, invoke it directly as
`sudo -u deploy bash /var/www/agromanage/scripts/update_project.sh`. Its root-to-
deploy wrapper applies a 60-second sudo timeout to the complete deployment; a
Next.js build can exceed that limit even though the script's global timeout is
600 seconds. Direct invocation avoids that wrapper.


## Private human-support attachments

Human support uses `SUPPORT_ATTACHMENT_ROOT` (default `backend/private_support`),
separate from MEDIA_ROOT and STATIC_ROOT. Storage rejects roots inside either public
root and does not implement a public URL. Downloads stream through authenticated
support endpoints with attachment disposition, octet-stream type, no-store and
nosniff. Do not add an Nginx/static alias or CDN URL for this directory.

Provision a persistent directory writable by the backend service user and shared
by every backend/worker instance. Files/directories are created with 0600/0700;
instances must use a compatible owner. Prefer a persistent path outside the source
checkout and set SUPPORT_ATTACHMENT_ROOT accordingly. The default directory is
gitignored and explicitly preserved by `scripts/update_project.sh` cleanup.
Back up this private root alongside the database and public media; copying only
MEDIA_ROOT is insufficient to recover support attachments. Changing the root does
not move existing files: copy them before switching configuration. Nginx upload
body limits must permit a 10 MB file plus multipart overhead. Never expose private
files to solve an upload/download configuration problem.

Apply ai_assistant migration 0009 before serving the new ticket endpoints. Existing
notification policy/preferences and Celery delivery workers handle support alerts;
no extra broker or delivery channel is introduced. In-app notification creation is
transactional with the ticket action; external delivery follows the existing outbox.

## Private organization exports

Apply `platform_admin.0016_organizationexport` before enabling the dossier export
section. Celery workers execute `generate_organization_export`; Beat runs
`maintain_organization_exports` every minute. Requests remain durably queued if
broker dispatch fails; maintenance dispatches them again. Duplicate deliveries
are ignored. Running jobs have a fenced two-hour lease; interrupted jobs become
failed and can be explicitly retried from their history.

`ORGANIZATION_EXPORT_ROOT` defaults to `backend/private_exports`, outside both
MEDIA_ROOT and STATIC_ROOT. It must be a persistent private volume shared by web
and all workers on the same filesystem (atomic rename is required). Never expose
it through Nginx, media/static routes or public object URLs. Files use mode 0600;
created directories use 0700. The update script preserves the default directory.
Custom locations require deployment-specific persistence and cleanup exclusions.

Defaults: `ORGANIZATION_EXPORT_RETENTION_DAYS=7`,
`ORGANIZATION_EXPORT_MAX_BYTES=5368709120`,
`ORGANIZATION_EXPORT_MAX_ROWS=1000000`. The byte limit is a staging-work budget,
including intermediate/final JSON, copied files and CSV, rather than the ZIP size;
provision additional space for compression, manifests and simultaneous packages.
Rows include M2M links and synthetic actors. Expiry blocks downloads immediately;
maintenance deletes expired ZIPs and abandoned staging/orphan ZIPs after three
hours. It retains database history. Retry creates a fresh snapshot, not a resume.

PostgreSQL captures use a single REPEATABLE READ transaction and an organization
row lock while copying referenced files; application quota-aware file mutations
use that same lock and may wait until capture completes. External filesystem
writers must not overwrite customer files during capture. SQLite snapshots are
supported for tests; other database engines fail closed. Source domain data is
never changed by export. Tests cover isolation, manifests, catalog/M2M references,
private attachments, permission revocation, failed publication, missing files,
limits, expiration and delivery retries. Production PostgreSQL concurrency and
filesystem throughput should be exercised before rollout; local SQLite tests do
not validate those deployment properties.

## Organization recovery operations

Apply `organizations.0006` and `platform_admin.0017` before exposing recovery.
The existing Celery worker runs `process_organization_recovery`; Beat runs
`maintain_organization_recoveries` every minute to dispatch queued work, flag
expired two-hour leases and remove orphan imported files without live references.
The worker rechecks authorization before writes and publication and holds the
acting staff profile lock during the domain transaction. Concurrent revocation
waits for that transaction to commit or roll back. Job row locks
and lease tokens fence duplicate deliveries and stale workers.

Recovery work lives under `ORGANIZATION_EXPORT_ROOT/recoveries/{id}/`: pinned
source, private rehearsal ID map, preview, pre-application snapshot, inverse
journal and verification snapshots. Modes are 0700 for directories, 0600 for files.
These recovery artifacts and isolated organizations intentionally outlive the
export's seven-day download expiry to preserve conference and rollback evidence;
they have no automatic retention/deletion policy yet. Include them in private
volume capacity planning, backup and administrative data-retention procedures.
Export cleanup waits for a requested rehearsal to pin its source before deletion.
Defaults are 256 MiB uncompressed package data (`ORGANIZATION_RECOVERY_MAX_BYTES`)
and 100,000 records/links (`ORGANIZATION_RECOVERY_MAX_ROWS`). Increase only after
measuring memory, transaction duration and available staging space.

PostgreSQL uses REPEATABLE READ and a maintenance transaction with SHARE ROW
EXCLUSIVE locks on approved entity/M2M tables, in deterministic order, with a
10-second lock acquisition timeout. This deliberately fences legacy workers and
SQL writers that do not honor tenant row locks. **The write pause affects all
organizations using these tables while recovery commits**, although data reads
remain available and mutations are limited to the selected organization. Schedule
recovery for an operational maintenance window. The lock is released on commit,
rollback or worker connection loss; it is not a persistent tenant flag. External
filesystem writers must remain stopped during capture/recovery as with exports.

SQLite tests exercise rollback atomicity, isolation, manifest and relation checks,
files, publication failure, authentication, permission revocation, expiry and
conflicting previews. PostgreSQL lock contention/concurrency and production
filesystem throughput still require staging validation before production rollout.

## Celery and Redis production defaults

`CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` can be configured separately;
`REDIS_URL` remains the backwards-compatible broker fallback and the result
backend defaults to that broker. Existing installations can keep their current
Redis database. Startup connection retries are enabled. Worker defaults are one
reserved task per process, recycling after 100 tasks or 524288 KiB RSS (after the
current task completes), and 86400 seconds for result expiry. All four numeric
settings have same-name environment overrides. No global late-ack policy is added.

The systemd worker retains concurrency 2, a five-minute warm shutdown budget and
mixed kill mode; tasks exceeding that shutdown window need the existing durable
job retry/reconciliation flow. Beat retains its single persistent schedule under
`/var/lib/agromanage` with 0700 directory permissions; both services use umask 0077.
Install the tracked unit files, run daemon-reload and restart the worker/Beat after
configuration updates. Only one Beat instance should run for this deployment.

Redis must remain bound to loopback with protected mode enabled. For the local
broker, enable `appendonly yes`, `appendfsync everysec`, and
`maxmemory-policy noeviction`; reserve memory for Redis, Django, two worker
processes and Next.js. Enable AOF at runtime first and wait for successful rewrite
before persisting the configuration; changing only the file and restarting can
lose the in-memory queue. Snapshot the previous Redis config before changing it.
Do not flush Redis or migrate broker databases during a routine deployment.
