# Frontend Guide

Read this document only for Next.js/TypeScript/UI tasks.

## Location

Frontend source lives under `frontend/`, with application source expected under `frontend/src/`.

## Working rules

- Start with the route/component/feature named by the task.
- Inspect direct imports before searching broadly.
- Preserve the existing App Router architecture.
- Reuse existing components and design primitives.
- Keep domain-specific code near its feature when the current structure supports it.
- Keep API calls in the established API/service layer.
- Prefer existing hooks, formatters, validators and types.
- Avoid introducing a second state-management or form pattern for the same problem.
- Do not use `any` to bypass type errors unless documented and unavoidable.

## UI behavior

For user-facing changes, preserve:
- loading state,
- error state,
- empty state,
- permissions/disabled state,
- responsive behavior,
- keyboard/accessibility behavior where relevant.

## API changes

When backend response/request shape changes:
1. update the API call,
2. update TypeScript types,
3. update validators/schema when present,
4. update affected UI,
5. run type checking.

## Performance

Avoid:
- unnecessary client components,
- repeated fetches,
- large dependencies for trivial functionality,
- recreating expensive derived data every render,
- duplicated API calls across nested components.

Do not refactor unrelated UI while fixing a local issue.

## Workspace dimensions

Authenticated home, platform and affiliate shells use the `app-workspace` marker
and shared `frontend/src/app/workspace.css`. Desktop typography uses a relative
87.5% root size with compact navigation, controls and content padding. Mobile
keeps the default root size, 16px form inputs and 44px touch controls. The marker
also scopes portal-rendered forms through the root selector. Public pages and
login retain their own dimensions. Use the shared workspace hooks when adding
shells; avoid browser zoom, transforms or per-page scale overrides.
