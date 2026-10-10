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
