# AgroManage Architecture Overview

This is a concise architecture map, not an exhaustive implementation specification.

## Purpose

AgroManage is a multi-domain agricultural management platform covering property/farm management, livestock, crops, inventory, finance, reports, operational tasks and auditing.

## Main components

```text
Browser
  |
  v
Next.js / TypeScript
  |
  v
Django REST Framework
  |
  +--> PostgreSQL
  |
  +--> Redis / Celery
```

Production infrastructure may include Nginx and container/deployment configuration under `infra/`.

## Backend

The Django backend is domain-oriented. Current repository documentation identifies domains including:

- accounts
- organizations
- farms
- livestock
- crops
- inventory
- finance
- reports
- tasks
- audit

Confirm actual source directories before implementation work.

## Frontend

The Next.js frontend uses App Router and TypeScript. Prefer feature/domain organization and shared UI primitives already present in the codebase.

## Mobile client

`mobile/` contains the React Native / Expo / TypeScript scaffold and the first login implementation against existing Django API contracts, alongside its development plan and visual concept. Session tokens use native secure storage; native-device and live-backend validation remain pending. Operational modules and the release pipeline are still planned. See [login setup and limitations](../../mobile/docs/LOGIN.md). Backend authorization and tenant boundaries remain authoritative. See [the mobile implementation plan](../../mobile/docs/IMPLEMENTACAO.md).

## Multi-tenancy

Organization/tenant boundaries are architectural constraints. Any query, mutation, report, background task or export that handles organization-owned data must preserve isolation.

## Cross-cutting concerns

- authentication and authorization
- auditability
- validation
- pagination
- query performance
- background processing
- consistent API contracts

## Source of truth

This file describes the high-level shape only. Current source code/configuration is authoritative for exact paths and behavior.
