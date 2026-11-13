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

## Organization language

Authenticated workspace pages use `OrganizationLocaleProvider` from
`frontend/src/lib/locale.tsx`, mounted by the home layout. Use
`useOrganizationLocale()` and its typed `t()` function for interface text, and
format dates/numbers with the returned organization language. The language is
shared by all members and persisted through `/organizations/me/`; do not store
it as a per-user preference or add a competing localization mechanism.

Typed catalogs and pure `translateMessage()` live in `frontend/src/lib/localeMessages.ts`
so exports can use the same translations without importing a React provider.
Pass `language` explicitly to service/report formatters; keep persisted API values,
currency, units and operational time zones independent of the interface language.
The provider waits for the organization language before mounting workspace pages
and refreshes it when the tab regains focus. Public pages and login use
`PublicLocaleProvider`, which derives its language from the browser. Public server
pages and metadata use `getPublicTranslator()` from `publicLocaleServer.ts`, with
weighted `Accept-Language` negotiation and the same `publicMessages.ts` catalog.
Seed the public provider with that language to keep server and client output
consistent. Keep URLs, anchors, plan identifiers/prices and custom organization
content independent of translated labels. Shared controls mounted in both public
and tenant pages can use `useInterfaceLocale()`; organization context takes
precedence, while platform-only usage retains Portuguese.

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

## Local development and PWA cache

PWAInstallPrompt unregisters this app's `/sw.js` worker and clears only
`fazenda-mais-static-*` caches in development. A previously controlled page reloads
once after cleanup. Development chunks reuse URLs, so a production-style static
cache can restore obsolete React code after refresh. Production PWA registration
and caching remain enabled. Do not clear authentication storage or unrelated
service workers/caches to troubleshoot this issue.

## Reproduction presentation

Swine and cattle share ReproducaoLayout header, phase cards and phase tabs,
ReproducaoKpiCards and ReproducaoTabContent/DataTable. Keep styles in the existing
reproducao.css rather than reproducing them in species-specific CSS. DataTable
accepts optional zero-based ServerPagination; without it the existing client
pagination is unchanged. Cattle server pagination/search must retain tenant/farm
filters and conditional row actions.

Reproduction phase lists must keep the same table, search, status filters,
pagination, details and row-action presentation across species. Operational
forms use ReproducaoModal; structured cattle registration and detail sheets use
Modal's reproduction variant so headers, overlay, controls and footer retain
the same visual language. Preserve species-specific fields, validation and
permissions rather than introducing another visual pattern per culture.

## Bovine operations center

`CattleOperationsWorkspace` reuses DataTable, CattleForm/Modal, app-workspace
sizing and scoped theme tokens. Operations include productive-purpose review,
transfer previews, occurrences, assisted CSV import, protocol stages and milk/cost
queries. API access and CSV parsing live in cattleOperationsService. Contextual
beef/dairy links preserve the segment path; purpose is independent of aptitude
and lactation. Existing dairy milk records stay visible even when current purpose
or lactation changes. Generated Agenda tasks show their operational source link
instead of allowing edits that would disconnect source execution from the agenda.

## Cattle navigation and legacy routes

Canonical web trees are `/home/seguimento/gado-de-corte` and
`/home/seguimento/pecuaria-leiteira`. Every function lives below its segment
(`cadastro`, `lotes`, `reproducao`, `racao`, `pastos`, `manejos`, `operacoes`,
`vendas`, `relatorios`). Milk production lives at `pecuaria-leiteira/leite`;
`pecuaria-leiteira/animais` redirects to its `cadastro`, preserving filters.

The former `/home/seguimento/bovinos/**` pages contain compatibility redirects
only. `CattleLegacyRedirect` preserves query filters, resolves legacy production
context and removes the obsolete `production` query. Old bookmarks still work;
new links must not point into that tree. Context-free legacy addresses default
to beef, while milk and old nested dairy paths intrinsically resolve to dairy.

`CattleSegmentPage` supplies existing shared screens with the purpose fixed by
the route, rather than a query that could conflict with the URL. The components
remain shared to preserve the existing design and domain operations.
`CattleSegmentProvider` supplies route context to food production/formulas and
other embedded components. `cattleNavigation` centralizes canonical link/parent
resolution. Neither changes authentication or tenant scope.

Internal species/API identity remains `bovinos`/`bovino`. Web access checks map
both new trees to the existing bovine species scope; operators retain the same
financial restrictions and feeders can only access daily feeding. Sidebar,
search, finance origins, task origins, agenda and new notifications generate
canonical URLs. Historical stored links remain valid through the redirects.


All livestock web routes use `/home/seguimento/...`, including swine and birds.
The physical App Router tree is `app/home/seguimento`. Next redirects the former
`/home/rebanho/:path*` prefix permanently before page handling, preserving suffix
and query parameters. Existing bovinos aliases then resolve as described above.
Only the web namespace changed: API endpoints, data, species scopes, roles and
operational flows remain unchanged. Permission checks normalize legacy URLs.
Dairy home cards show daily launches first, followed by monitoring, registration,
management and reports; planned functions stay last.


The segment homes expose daily feeding through “Lançar ração”; they no longer
show a separate Alimentação card. Reports reuse CattleFeedingReport for scoped,
searchable, paginated consumption/cost history and read-only CattleNutrition for
trough observations. Read-only observations do not fetch daily supply choices.
Operational period consumption, trough registration and formula/production
screens remain accessible through explicit report links. No stock movements or
financial entries are created by opening these reports.

MilkTankWorkspace at `/home/seguimento/pecuaria-leiteira/tanque-de-leite` reuses
compact cattle panels, tables and CattleForm/Modal. Its card follows milk, feed
and medication launches as the last daily shortcut. Tank/farm selection scopes
balances, production availability and paginated movement/quality tabs. Intake
uses the selected production day; collections, discards, observations and
justified cancellations use existing modal styling. Equipment and financial
controls are manager/admin only; bovine operators retain operational access and
read-only restrictions. API calls live in milkTankService. Ledger balances are
never edited in the UI and no opening balance is presumed.

## Public segment overview

The homepage `SegmentOverview` separates implemented workflows from commercial availability. Its read-only `publicSegments` service reads `/public/plan-segments/` without tenant credentials; only public segments with pricing tiers receive plan CTAs. Empty, loading and failed catalogs must not fabricate offers. Beef/dairy modules without a public offer direct visitors to contact; birds remain identified as in development. Preserve custom public-catalog copy and localize built-in descriptions in all four public languages.

The public `PlanBuilder` uses `publicPlanCatalog` for validated public segments, active tiers, prices, icons and per-segment annual discounts. Do not restore hardcoded offers, fallback prices or preselected products. Selection is keyed by tier ID, not array position. `/planos?segmento=CODE` preselects only an existing offer. Empty/unavailable catalogs block checkout; quote creation remains server-authoritative through `/public/subscription-quotes/` with selected IDs and billing cycle.

## Dairy milk and feeding worksheets

The dairy `/leite` route uses `DairyMilkWorkspace`: a farm/date scope, optional
batch/search, three milking sessions, discards, oxytocin usage, feed/silage/mineral,
and a reviewable daily grid. `DairyTotalPanel` handles period aggregates. Existing
milk records remain authoritative; worksheet state only adds feeding allocation
snapshots and reported oxytocin usage. The latter is a usage record, not a
prescription or automatic medication-stock deduction.

Dairy `/racao/tratos` uses `DairyFeedingWorkspace` for managers/admins: remote
animal selection across pages, multiple non-overlapping groups, kg/head/day or
period quantities, atomic stock consumption and justified cancellation. Feeders and operators
retain the existing daily batch-feeding screen and API. Beef routes are unchanged.
The dairy home keeps the existing domain screens and adds the sales shortcut;
this increment does not establish full form-by-form parity with the local HTML
reference. Reproduction, registry, feed mill, tank and sales retain their existing
contracts and screens.

API access stays in `dairyWorksheetService`/`dairyFeedingService`. Never resubmit
an uncertain result as a new intention. Keep the original payload and request
key, consult the durable receipt or explicitly repeat the same submission.
Farm/day filters are locked while worksheet drafts are pending. Empty fields
and removed rows never imply deleting other animals or a different page.
`/leite/historico` retains individual and aggregate production history and shows
period boundaries. A period's milk is booked once on its final date; it must not
be presented as estimated daily milkings. See the dairy worksheet API contract.
