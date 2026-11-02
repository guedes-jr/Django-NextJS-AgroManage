# API Guide

Read this document only for REST API, authentication or frontend/backend contract work.

## Base approach

The backend uses Django REST Framework and the frontend consumes the API through its existing service/client layer.

## Contract rules

- Treat request/response shape as a contract.
- Preserve backwards compatibility unless the requested change intentionally breaks it.
- Keep validation errors predictable.
- Keep pagination consistent with the existing project standard.
- Preserve authentication and organization/tenant authorization.
- Do not expose internal fields or secrets.

## Marketing campaign content

Campaigns have a `category`: `system` (service communications and platform billing
notices) or `marketing` (advertising). Existing campaigns and API requests omitting
the field retain `marketing`; the UI starts new communications as `system` with
all recipient roles selected. System campaigns create system notifications and do
not require `marketing_alerts` or an active marketing category. They retain
organization scope, selected roles, active-user checks, master notification
opt-out, system category/channel policy, limits and WhatsApp contact authorization.
Tenant financial notifications and their access controls remain unchanged.
The System category now supports enabling WhatsApp for these communications.

Publishing kicks off the durable campaign outbox after the database transaction
commits; scheduled processing remains the recovery path if broker enqueue fails.
Notification list and unread-count requests also prepare bounded batches of the
authenticated user's queued in-app campaign recipients. Login can therefore show
confirmed in-app communications even if Celery is unavailable, without consuming
another user's recipients or marking anything read. Preparation remains
idempotent and rechecks current eligibility. Draft, cancelled and WhatsApp-only
recipients are not prepared by these inbox requests. External delivery still
requires an active Celery worker.
Delivered unread campaign notifications appear in a centered modal throughout
the tenant home area, with full-width images and scrollable content. Explicit
acknowledgement marks the notification as read. View later or Escape dismisses
the pending modals for the current session without marking them read.
The notification provider refreshes content when the unread count changes, on
window focus and when returning to a visible tab.

Campaign create/update accepts any combination of title, body, link URL and
images, requiring at least one nonempty item. Title and body may be omitted or
blank. Partial updates validate the resulting content, including existing images;
clearing all content is rejected. Supplied links must still be valid HTTP(S) URLs.

Campaign responses include `created_at`, `updated_at` and nullable `queued_at`
timestamps for management history. Campaign preview also returns `blockers`,
a list of actionable reasons that currently prevent publication (disabled
selected category, disabled selected channels, or no eligible recipients).
The final review prepares this preview automatically. Publication still requires
explicit confirmation and a current preview token, and revalidates policy and
recipient consent on the server. A failed publication requires a fresh review
before retrying; the editor retains the draft.

Preview includes an `eligibility` breakdown of users in the matching active
organizations: total, eligible, inactive, excluded roles, excluded platform staff,
disabled notifications and missing marketing authorization. Exclusion counts are
mutually exclusive. For marketing campaigns, missing notification preferences count as not authorized;
selecting an organization never grants marketing consent. Sample organizations
also include their eligible-user count. In-app reach counts eligible users rather
than selected organizations.

The campaign list accepts optional `search` (title, body or saved audience name)
and `status` (a campaign status value) alongside existing pagination. Invalid
status filters return a validation error. Resuming a draft retrieves its own
audience by ID if it is absent from the saved-audience list.

POST `platform/marketing/audiences/query/` previews organization filters without
creating or updating an audience. All filters are optional; an empty request
matches active organizations. It uses the same platform administrator permission
as saved audiences. Responses include `count`, `page`, `has_next` and 25
`results` per page with ID, name, document, email, phone, plan label,
subscription status label, city and state (from the primary address when present).
Query parameters accept `page` and `ordering` (`name`, `-name`, `document`,
`-document`). The organization table searches independently of the current
selection, retaining selected IDs across pages in the audience's
`filters.organizations`. An empty explicit selection cannot be saved in the UI;
users can instead choose all organizations matching the filters. For explicit
selections, saving uses only the selected IDs and recipient roles; discovery
filters do not silently exclude organizations selected on other pages or searches.
Choosing all matches saves the organization filters instead.

## When changing an endpoint

Check:
1. route/router,
2. permissions,
3. serializer/request validation,
4. service/business logic,
5. queryset/selectors,
6. response shape,
7. frontend types/client usage,
8. targeted tests.

## Nursery batch dates

Batch create/update preserves nullable `birth_date`, including non-reproductive
categories such as `Terminação`. Nursery rows expose `idade` as elapsed calendar
days since birth and `prev_crescimento` as birth date plus 70 days. At that date,
the display status is `ready_for_growth`; the phase changes through the existing
transfer operation. Unknown birth dates produce null age and forecast; arrival
date is not a substitute. Older manually registered lots whose birth date was
discarded must have that date entered again.

## Growth batch dates

Growth rows expose `idade` as elapsed days since birth, independently of `dias`
(days in the growth phase). `previsao` is an ISO date derived from the existing
estimated days to reach 60 kg. Batches at or above that weight use today's date;
unknown weight produces a null forecast. The growth table displays age in place
of GPD and formats the forecast as a calendar date.

## Fattening batch dates

Fattening rows expose `idade` as elapsed days since birth. `previsao` is an ISO
date: the recorded `exit_date` takes precedence, otherwise the existing estimate
to reach 110 kg is added to today's local date. Lots already at target weight
use today's date; unknown weight produces a null estimate. The table displays
age instead of GPD and formats the sale forecast as a calendar date.

## Batch technical sheet

Batch details resolve birth dates from the lot and its linked birth/animal/source
records. Manually entered birth dates that were previously discarded still need
to be entered again. `initial_quantity` also uses the registration event for
manually registered lots. `deaths_count` counts recorded batch deaths and linked
maternity mortality, rather than interpreting every quantity reduction as death.
Phase history exposes `entry_weight_kg` and `entry_quantity`, and represents an
open phase once with `is_current=true`. Closed phases recover entry metrics from
the preceding phase or the registration event when available. The sheet uses
these baselines for GPD and feed conversion; missing baselines remain unknown.

## Authentication

The repository documentation indicates JWT-based authentication and optional Google OAuth. Confirm current implementation before changing auth flows.

Security-sensitive auth changes require targeted tests and should not be bundled with unrelated refactors.

## OpenRouter integration

The rural assistant and system support use the shared provider router. OpenRouter
uses its OpenAI-compatible Chat Completions API and imports text models and explicit
prompt/completion prices from its models endpoint. Unknown prices and per-request
charges prevent automatic classification as free. Paid models are disabled on first
import; changing the primary model remains an explicit platform-admin operation.

The platform AI panel exposes OpenRouter credentials (write-only, encrypted),
provider selection, primary models, priorities, and catalogue synchronization.
`POST /platform/ai/model-sync/` accepts `provider: "openrouter"` or `"opencode_zen"`;
omitting it preserves the previous asynchronous Zen behavior. OpenRouter manual
synchronization runs directly and returns `status: "completed"` with `run_id`,
so the panel works without Redis/Celery. An optional Celery weekly schedule with
bounded retries skips disabled OpenRouter configurations. `sync_openrouter_models`
also supports manual server execution.
No schema migration is required; the provider row is created on first panel access.

The saved OpenRouter key takes precedence over `OPENROUTER_API_KEY`. Runtime settings
include `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL` (default `openrouter/free`),
`OPENROUTER_MAX_OUTPUT_TOKENS` and `OPENROUTER_TIMEOUT_SECONDS`. An empty catalogue
respects the enabled default provider selected in the admin panel. OpenRouter uses
the existing local agricultural risk checks; no remote moderation endpoint is used.
Configure a key, synchronize, select a primary model, then switch the default provider.

## Animal batch sales

`POST /livestock/batches/{id}/register-sale/` accepts `mode` (`whole` or
`partial`), `quantity` (required for partial), manual `weight_kg` (total kg),
`price_per_kg`, `date`, `buyer`, optional `responsible` and `notes`. Whole sales
use the locked batch quantity; manual quantities must not exceed the available quantity. Selling the entire
remaining balance, including in partial mode, finalizes the batch. Stock, operational history and paid revenue are updated
atomically. Sales of the remaining balance mark the batch sold; smaller sales retain active
status and decrease its quantity. Total revenue is weight × price, rounded to cents.
`GET /livestock/batches/sales/` returns the latest 100 pig sales in the current
organization, including historical revenue entries whose weight/price are unknown.

On the final whole sale, the current phase closes on the sale date. A persistent
`Fechamento de Venda do Lote` event freezes `sale_summary`: combined sold quantity,
total sale weight, weighted average weight (total kg / animals sold), revenue,
phase entry baselines, GPD ((final average − entry average) / phase days) and
feed conversion (phase feed kg / total live-weight gain). Missing input records
produce null indicators. Partial sales do not close or overwrite phase metrics.
Batch detail exposes this summary and phase history uses its preserved entry
metrics. Batches with sales cannot be deleted through the batch endpoint; sold
batches remain in the inventory report and their sheets open from the general
batch report. Prior sales without a closure event retain their existing history.

`GET /reports/livestock/inventory/?species=suinos&include_costs=true` adds
financial columns for the general batch table, without changing the default
inventory response. Decimal strings (or null for unavailable breakdowns) include
reproduction/feed, purchase, phase costs, medication, labor, total cost, paid
sales, profit, margin, and cost per animal. Costs are cumulative direct records,
including non-cancelled expenses and stored feed/vaccine/treatment snapshots.
Phase attribution uses the recorded destination or dated phase history. Source
lots supply mother identifiers but retain their own direct costs to avoid duplication.
Sire upkeep follows the allocation rule below instead of being duplicated on sources.
General expenses without a batch are not allocated. Missing prices are counted;
zero sales produce a null margin. Closed sales use their preserved sale quantity
for cost per animal. Purchase expenses use financial references, with a fallback
to the recorded purchase value only when no matching transaction exists.

### Monthly sire allocation

The `reproduction` column and batch financial details include monthly sire upkeep.
Calendar months use feed start dates, vaccination/clinical/health application dates
and expense due dates. Only recorded costs linked to the sire or its batch are used.
Shared feed/batch expenses are split equally among their registered recipient animals;
individual applications take precedence over a batch link. Acquisition purchases,
revenues, cancelled expenses and unrelated farm costs are excluded from this rule.

Each sire-month pool is divided equally among **all** its linked matings in that
month, including pending and failed attempts. A share is attributed to a litter
only through its recorded birth/pregnancy/mating chain; shares without a birth stay
unallocated and are not shifted to successful matings. Monthly totals are recalculated
from current recorded costs and matings, so adding/correcting records updates reports.

`wean_birth` records a `Transferência de Leitões` event for partial weaning, with
`source_batch_ids`, `source_quantities` and `source_available_quantities`. Each
transfer takes the moved headcount's proportion of the source's remaining share.
A same-ID phase change retains the share. Audited full `Junção de Lotes` events
move each source share to the merged lot, leaving zero on the sources. New merge
metadata also preserves each source headcount. Zero-headcount sources retain their
cost. Transfers are replayed chronologically; each split distributes all cents once.

Legacy partial/source links without audited quantities block attribution for the
connected litter chain rather than estimating shares. Missing upkeep prices produce
an incomplete-allocation warning while known prices remain usable.
`reproduction_allocation_pending` flags these cases on inventory rows and batch
financial details. Detail entries identify the sire, coverage month, monthly cost,
number of matings, per-mating share and the value retained by the selected lot.
No extra financial transaction is created by report calculation.

Printed batch sheets contain operational data only: no feed prices or financial
analysis. The general batch report opens a separate cost detail via
`GET /livestock/batches/{id}/financial-details/`. This tenant-scoped endpoint
lists recorded feed costs, vaccination cost snapshots, clinical treatment costs,
non-cancelled batch expenses and applications without stored costs, including
source batches once. It returns category totals, total recorded cost, per-animal
and per-kg-of-total-weight costs, and a count of missing costs. Missing costs are
not imputed and are excluded from the total. This does not change permissions.

## Swine productive indicators

`GET /api/v1/reports/livestock/productivity/?year=2026&farm=<uuid>` returns
`phases` (`creche`, `crescimento`, `engorda`), `feed_conversion`,
`profit_per_matrix`, current `distribution`, tenant-owned `farms`, and
`missing_reasons`. The optional farm must belong to the authenticated organization.
A missing measurement is `null`, while recorded/countable zero remains `0`.
Phase attribution uses phase history and feed destination, rather than category.
Daily gain uses weights from the same phase and selected year. Feed conversion
uses only batch-linked feed recorded between those weight measurements; unmatched
feed still contributes to consumption totals. Phase entry/exit snapshots and sale
closures preserve entry quantities and sold quantities even after a zero balance.
Profit uses paid swine expenses and revenue in the selected year, plus recorded
feed, vaccination and semen costs, plus animal purchases missing a financial entry. A farm filter excludes financial entries without a
farm/batch link. Crushing mortality uses the recorded death cause and stays null when deaths lack classification. DNP and indicator targets are not inferred.
The report UI counts births and weanings by their own dates, includes records from
inactive mothers, and uses only known outcomes for pregnancy/farrowing rates.

## Tenant roles and operator scope

| Perfil | Operação | Financeiro | Usuários e permissões |
| --- | --- | --- | --- |
| `admin` | Completa | Sim | Sim |
| `manager` | Gestão operacional | Sim | Não |
| `operator` | Áreas autorizadas; opção somente consulta | Não | Não |

`User.Role.choices` and audience options expose these three organization roles;
platform staff roles remain independent. `/auth/me/` returns read-only `access`,
`can_operate_crops`, `allowed_livestock` (species UUIDs), `operator_read_only` and
`organization_responsible`. Personal updates cannot change role, activity or scope.
GET `/auth/operator-options/` returns roles and the current species catalog.

Only administrators create/change members using `/auth/members/create/` and
`/auth/members/<uuid>/`. New operators default to no areas. Scope changes and
creation are atomic and audited. DELETE deactivates the account and preserves its
organization/history. Self-demotion/deactivation, removal of the last active admin,
and demotion/deactivation of the organization responsible are rejected. The
responsible flag is separate from role and cannot be reassigned in a client payload.
The legacy `/auth/users/` directory remains read-only.

JWT requests and domain query/detail/mutations enforce scope, including related
objects and custom actions. Existing tokens immediately respect revocations.
Financial/admin/report APIs, sales, deletion and configuration writes are blocked.
Livestock references require both an authorized species and the current tenant.
Crop access requires `can_operate_crops`. Shared inventory lookups omit monetary
fields; feed consumption requires authorized destinations. Financial fields,
including nested fields, are rejected in operator mutations and removed from
operational responses. Shared rural forms omit computed price fields for operators;
normal server services derive inventory costs for accounting.

Operator authorship is stored for new operational records. Operators correct their
own still-open records without deleting them or changing finalized situations.
Crop corrections affecting quantities/dates/stock, and changes to feed consumption,
require a manager; crop notes and operator descriptions remain editable. Legacy
records without reliable authorship are not claimed by operators. Assigned tasks
allow status updates; tasks created by the operator allow other edits while open.

`/reports/dashboard/` returns `mode: operational`, crop/herd counts and up to 20
assigned open tasks for operators, without querying financial models. Financial
KPIs, managerial charts, activity and billing are absent. Menus/module shortcuts
follow scope. Notification history, email digests and queued deliveries exclude
financial categories and reproductive events outside authorized tenant/species.
System notifications and opted-in marketing remain available.

Accounts migrations 0007/0008 convert owners to admins with the responsible flag.
Existing operators retain crops and the species already in the catalog; new species
require explicit authorization. Former viewers become read-only operators with no
areas pending admin review. Saved campaign/audience role filters map to the new
codes; published recipient snapshots remain immutable. Reversing 0008 maps
responsible admins back to owner and read-only operators to viewer, without
reconstructing previous marketing audience filters.

## Global system support

`/support/configuration/`, `/support/articles/` and `/support/conversations/`
serve authenticated organization members, including all subscription plans.
Only published articles are visible across organizations. Drafts and global
configuration/content mutations are restricted to active platform owners/admins
at `/platform/support/configuration/` (GET/PATCH) and
`/platform/support/articles/` (CRUD); these mutations create platform audit records.
Tenant administrators cannot change the global knowledge base.

Support conversations use subject `support`, are private to their creator and
organization, and are separate from `/ai/conversations/`. The dedicated endpoints
provide creation/list/detail and POST actions `ask`, `resolve`, `handoff`.
`ask` reuses the existing provider router, moderation, model fallback and token
observability with a system-use prompt and published knowledge. Operational
context IDs are rejected. Support uses an independent per-user daily allowance
(default 20, configurable 1–100) and a 30/hour burst limit, preserving rural-assistant
plan entitlements. Provider/moderation failures refund daily allowance. Concurrent
pending questions and closed conversations return 409.

`handoff` returns a reviewable problem/attempt summary and an encoded `wa.me` link;
an optional edited `summary` (3–4000 characters) regenerates the link. Labelled
passwords/tokens/keys are redacted. The message is sent by the user in WhatsApp,
not automatically by the backend. A missing contact returns `whatsapp_url: null`.
The platform admin configures the contact as 10–15 digits including DDI/DDD,
AI availability, daily allowance and welcome text. Article types are `faq` and
`tutorial`, with category, position, publish state, plain-text procedure and
optional HTTPS video/material URL. Migrations 0006/0007 add the models/subject
and four editable published starter articles; apply them before enabling the pages.
Frontend routes are `/home/suporte` and `/platform/support`.

## OpenRouter routing and consumption

Platform administrators can edit OpenRouter-specific `prefer_free_models`
(default true), `allow_paid_models` (default false), `max_model_attempts`
(1–10, default 3) and `max_output_tokens` (128–8192, default 1200) through the
existing provider PATCH endpoint and `/platform/ai`. Other providers reject these
fields. Paid OpenRouter models require explicit permission even when marked as
primary. Free-only requests also send zero prompt/completion price ceilings to
OpenRouter. When paid fallback is allowed, the final attempt can be reserved for
a paid model after free alternatives, within the configured attempt limit.

Migration `0008` records generation costs with nine decimal places, requested
model, cached input tokens and reasoning output tokens. The platform dashboard
groups consumption by actual model and day, covering rural and support answers,
including generated answers subsequently blocked by moderation (without storing
blocked content). Provider-reported costs take precedence; when unavailable,
known catalogue prices may produce an estimate captured at generation time.
Unknown prices and cached responses without reported costs remain unknown.
Historical messages are not repriced or assumed free. Cache/reasoning counts are
subsets of input/output tokens and must not be added to total tokens. Support
keeps its separate question allowance while sharing the token/cost ledger.

## WhatsApp pairing and alerts

Platform-admin-only `/platform/whatsapp-web/status/` normalizes WPPConnect
connection responses to a string status and boolean `connected`. Session start
returns promptly (`waitQrCode: false`); transport/authentication failures return
503 instead of a successful generating state. `/qrcode/` reads WPPConnect
`status-session` JSON and returns nullable `qrcode` and `status`, avoiding the
PNG response from `qrcode-session`. The panel polls every four seconds and
clears the QR after connection.

Pairing, manual messages and reproductive alerts use the same WPPConnect
authentication: `WPP_CONNECT_SECRET` generates a session token when configured,
otherwise `WPP_CONNECT_TOKEN` is used. HTTP 200 with an explicit send failure
is not recorded as delivered. Alert eligibility and tenant permissions remain
unchanged: opted-in users receive eligible reproductive alerts at their user
profile phone through Celery.

The status response also includes `checked_at`, the pairing stage and optional
`qrcode`, allowing a single panel request per polling cycle. GET `/account/`
returns only `{account: {name, phone} | null, detail}` from `host-device`; unavailable
profile data does not invalidate an otherwise connected session. POST `/reconnect/`
checks session state, starts closed sessions directly, and closes/restarts active
browser sessions while retaining paired credentials and
records an audit event; `/disconnect/` logs out and requires a new QR pairing.

GET `/alerts/?page=1&status=failed` is restricted to platform owners/admins,
like all WhatsApp management routes. It paginates 20 WhatsApp deliveries with
recipient, organization, status, attempts, timestamps and failure reason. Its
`overview` reports global counts for `pending`, `sent`, `failed`, `skipped`,
eligible event types, active opted-in users with animal alerts enabled, and
Brazilian-phone eligibility. Eligible recipients also require an owner/admin
organization role, matching the scheduled events. Counts are not filtered by history status. These
are potential recipients, subject to the existing event authorization rules.
The UI refreshes history every 30 seconds. Manual tests use the existing audited
message endpoint; they do not create an automatic-alert delivery record.

Connection diagnostics distinguish missing/invalid configuration, DNS, refused
connections, timeouts, TLS, HTTP authentication failures and invalid upstream
responses without including raw URLs, secrets or response bodies. Status/start requests allow 65 seconds and reconnect allows 95 seconds in the
platform client, covering the default 15-second WPPConnect timeout for sequential
authentication/session calls, including the reconnect state lookup.

Reconnect returns 409 while a session is initializing, showing a QR or syncing.
These states may still be placeholder clients in WPPConnect, without a `close`
method. The panel must finish pairing before reconnecting; no session data is
deleted to recover from this condition.

## WhatsApp session management

Platform owners/admins can GET `/platform/whatsapp-web/sessions/?page=1` to
list service sessions (six per page), their state, observation timestamps, elapsed
time, last sanitized error and operation availability. The server-only secret is
used for inventory; token-only installations expose the configured session only.
No token, QR payload, secret-bearing URL or raw provider error is returned.
`WhatsAppSessionObservation` persists timing across web workers (migration 0013).
A state observed unchanged for 120 seconds is marked `suspected_stuck` only while
initializing/connecting/syncing; QR waiting is never classified as stuck.

POST `/sessions/<name>/action/` accepts `operation: close|reconnect`; close also
requires `confirm: true`. Names must belong to the configured service inventory.
Close preserves paired credentials, unlike logout. Placeholder clients return 409
with `recovery_required: true`; the API does not call their missing close method
or silently restart every session. Success/failure is recorded in platform audit.

POST `/restart-service/` requires `confirm_all_sessions: true`, a platform-admin
role and server-side recovery enablement. It runs a fixed privileged helper,
interrupts all sessions, preserves volumes, and permits one attempt per 60 seconds
through a shared database control row. Request/result are audited. The helper must
be installed as documented in `docs/ai/infra.md`; the backend never accepts a
container name, command, path or Docker flags from the client. The panel polls the
list every 15 seconds and pauses while mutations run.

## User contact and system alert consent

Registration, `/auth/me/` and organization member create/update accept and return
`phone_is_whatsapp` and `receive_system_alerts`. The checkboxes are independent:
a WhatsApp contact requires a phone; system alert consent applies to in-app,
email, push and WhatsApp notifications. The master preference gates notification
creation, queued deliveries and daily/weekly email digests without overwriting
category/email/push preferences. Existing authorization and reproductive WhatsApp
event rules remain in force. The contact flag synchronizes the existing
`whatsapp_reproductive_alerts` channel preference; disabling it stops WhatsApp
while other channels continue if the master preference is enabled.

Accounts migration 0006 adds both fields. Existing users retain system alerts and
existing WhatsApp opt-ins become WhatsApp contacts. New registrations default to
both unchecked. Profile multipart updates accept explicit `true`/`false`; omitted
fields retain values on PATCH. Disabling alerts preserves historical notifications.

## Notification classification and platform controls

Notifications retain the existing `type` contract and now expose `category` and
`category_display`. Categories are system, animal cycles, overdue payments,
marketing, stock, other animal alerts, other financial alerts and reports.
Known reproductive event keys become `animal_cycle`; known overdue finance
transaction keys become `overdue_payment`. Historical rows are classified by
type/event key in notifications migration 0004; titles are not guessed.
User-facing filters accept `category`, and recipients cannot alter classification.
Manual notification creation accepts an explicit category compatible with type.

Platform owners/admins use `/platform/notifications` and the following APIs:
GET `/platform/notifications/categories/`, PATCH `/categories/<category>/` with
`enabled`, `in_app_enabled`, `email_enabled`, `push_enabled`, `whatsapp_enabled`, and paginated GET
`/platform/notifications/history/?category=animal_cycle&organization=<uuid>`.
Category changes are atomic and audited; tenant users and other platform roles
cannot read or edit these global controls. History includes classification,
recipient, organization, title, timestamps, read/archive state and per-channel
delivery status/attempts without raw provider diagnostics.

Disabling a category blocks new notifications and queued external deliveries.
Email digests honor category/channel policies. Rules limit delivery and never
override the user's master consent or category/channel preferences. WhatsApp supports approved reproductive events and consent-aware marketing campaigns;
enabling other WhatsApp categories is rejected. Marketing is disabled globally by default and requires
separate `marketing_alerts` user opt-in, also unchecked by default.
Operational reproductive dashboard alerts expose their category and
`notifications_enabled`; the notification bell respects that flag while the
reproduction dashboard keeps its operational information available.
The same endpoint accepts `include_all_alerts=true` for the dedicated operational
alert consultation (`/home/notifications/alertas`). This returns the complete
operational selector, including scheduled dates beyond the dashboard's three-day
window, while preserving organization/species scope and per-user acknowledgements.
The consultation filters and paginates the returned generated snapshot on the
client. Dashboard cards show at most ten alerts, newest scheduled date first
(undated alerts retain their relative order at the end), and retain the full count.


The in-app channel is recorded as `show_in_app` when an event is created or
updated. External-only records stay in platform history but do not appear in the
recipient notification list, unread count or SSE feed. Historical visibility is
preserved unless the event recurs under the new policy.

## Campaigns, notification volume and metrics

Notifications migrations 0005/0006 add drafts, images, saved audiences, recipient
snapshots, creation guards, grouped items and delivery leases. Category PATCH
accepts `repeat_cooldown_minutes` (0–10080), `group_similar_minutes` (0–60;
0 means immediate) and `max_per_day` (0–5000; 0 means unlimited), defaulting
to 60, 0 and 50. Explicit event keys retain one record, including archived
events. Other content repeats are suppressed during the cooldown. Grouping
combines same-category/title/link events and delays external dispatch; urgent
notifications are immediate and never grouped. GET
`/platform/notifications/metrics/?days=7|30|90&category=&channel=` provides
channel/category/day counts, service-confirmed success, delivery latency,
in-app reads, old pending deliveries and suppression/grouping/limit counters.

Owners/admins manage `/platform/marketing` through
`/platform/marketing/audiences/` and `/campaigns/` (list/create/PATCH),
GET `/options/` (roles from `User.Role.choices`, plans and subscription statuses)
and POST `/images/` (multipart JPEG/PNG/WebP, up to 5 MB and 20 megapixels).
Audience filters allow only search, organization UUIDs, plan codes, subscription
statuses, state and a nonempty list of roles. Empty optional filters mean all
active organizations. Plans use actual subscriptions, with legacy fallback for
organizations without a subscription. Active platform staff are excluded.
Master consent and marketing opt-in are required; WhatsApp also requires an
authorized, valid Brazilian contact. Duplicate phone numbers receive one
WhatsApp message per campaign.

Drafts contain title, Markdown-style body, up to five uploaded images, HTTP(S)
CTA URL/label, audience and `send_in_app`/`send_whatsapp`. Rendering escapes HTML
and supports bold, italic, strike, lists and safe links. Campaign notifications
expose read-only `promotion` content/images and `group_items`. GET
`/audiences/{id}/preview/` returns an organization sample/count. GET
`/campaigns/{id}/preview/` returns eligible counts and a signed 15-minute token.
POST `/campaigns/{id}/publish/` requires `confirm: true` and that token; changed
content, contacts, audience or channel policies require a fresh preview.
Publication snapshots recipients, roles and authorized WhatsApp phones, locks
editing and records an audit event. Shared audience edits do not change existing
snapshots. POST `/campaigns/{id}/cancel/` stops remaining preparation and queued
WhatsApp sends; prior deliveries remain in history.

Celery Beat consumes the durable outbox every minute (50 recipients per campaign
batch, up to 50 pending deliveries queued per pass). `completed` means recipient
preparation completed; delivery states are separate. Consent, organization
membership, role, activity and the original phone are checked before WhatsApp
delivery. Images use WPPConnect `send-file-base64`; confirmed parts are tracked.
Delivery leases prevent concurrent sends. Interrupted/ambiguous outcomes become
`unknown` and are never automatically resent. Confirmation is not a read receipt.
Campaigns use only selected system/WhatsApp channels and are excluded from email
digests. Saving a draft never sends it.

### Financeiro SaaS da plataforma

`GET /api/v1/platform/finance/dashboard/` e `GET /api/v1/platform/invoices/`
compartilham `date_from`, `date_to`, `date_field` (`due_date`, `issued_at`, `paid_at`),
`organization`, `plan`, `status` e `search`. Busca inclui número, organização e
itens da cobrança. Faturas abertas com vencimento passado têm `effective_status=overdue`;
o filtro `overdue` inclui essas faturas. Pagamentos parciais entram no filtro por
data de pagamento sem duplicar faturas. Datas invertidas ou inválidas retornam 400.

MRR/ARR representam assinaturas ativas atuais, considerando descontos vigentes e
os filtros de organização/plano. Recebimentos consideram pagamentos confirmados
nas datas selecionadas e vinculados às faturas filtradas; saldos e inadimplência
consideram as faturas desse mesmo recorte. Inadimplência é a proporção de faturas
vencidas entre as faturas com saldo em aberto. A resposta mantém `received_month`
e acrescenta `received_period`, `overdue_amount`, `overdue_rate`, `distribution`,
`receipts`, `billed` e `invoice_count`.

`GET /api/v1/platform/invoices/{id}/details/` inclui itens e histórico de pagamentos.
`GET /api/v1/platform/invoices/report/` fornece um snapshot com indicadores, todas
as faturas filtradas e histórico completo dos seus pagamentos para PDF/Excel.
Paginação não limita esse relatório; recortes acima de 10.000 faturas retornam 400
para solicitar filtros mais específicos. Exportações geram auditoria.

`POST /api/v1/platform/invoices/{id}/record-payment/` aceita `paid_at` e `notes`
opcionais. Data futura, valores não positivos e pagamento superior ao saldo são
rejeitados. Observações ficam em `Payment.metadata.notes`; nenhuma migração é
necessária. Escrita permanece restrita aos administradores da plataforma.

### Rotina e fila WhatsApp

Alertas operacionais de animais são consultados a cada 120 segundos, sem depender
que alguém abra a dashboard. Os seletores de datas são compartilhados com as
views de manejo: vacinas, ferro, diagnóstico, cio/cobertura, parto e transferências;
limiares operacionais incluem desmame, mortalidade, lotes aptos para mudança de
fase e ausência de peso. Os avisos antecipados entram no envio. Cada evento tem
uma chave por organização, espécie, identidade e etapa (`scheduled`, `due`,
`overdue` ou `active`), evitando repetição a cada consulta. Confirmações do usuário
suprimem novos envios e mensagens automáticas pendentes. Operadores só recebem
sobre espécies autorizadas. Os controles globais, consentimento e telefone
WhatsApp continuam obrigatórios; o campo legado `whatsapp_reproductive_alerts`
passa a representar a adesão aos alertas operacionais.

A consulta periódica também verifica estoque baixo. WhatsApp de estoque e
animais fica disponível nos controles de categoria. Sistema, financeiro e
propagandas não são habilitados por esta atualização.

`GET /api/v1/platform/whatsapp-web/queue/` lista a fila persistente, com paginação,
`status`, `search`, conteúdo, tentativas, erros e histórico. `GET/PATCH/POST
/api/v1/platform/whatsapp-web/queue/{id}/` consulta, edita `body` (até 4096
caracteres) ou solicita reenvio. Apenas administradores da plataforma acessam.
Reenvio de resultado `sent` ou `unknown` exige `confirm_resend=true`. Tentativas
em processamento bloqueiam edição/reenvio. Edição afeta somente aquela mensagem,
não a configuração do evento ou conteúdo já recebido. Consentimento e acesso
continuam revalidados no envio, inclusive em reenvios manuais.

Mensagens individuais de `POST /platform/whatsapp-web/messages/` agora retornam
`status=queued` e `id`: entram na mesma fila, processada a cada 30 segundos.
A falta de conexão mantém mensagens pendentes. Falhas de resultado ambíguo ficam
`unknown` sem reenvio automático. Cada tentativa e edição fica registrada.
Entregas de notificações anteriores são importadas; o conteúdo histórico é
reconstruído da notificação original. Mensagens individuais antigas cujo texto
não era persistido não podem ser reconstruídas.

Dated automatic livestock operational reminders enter WhatsApp only when their
current due date is at most three local calendar days ahead. Due-today and overdue
pending events remain eligible; undated active operational alerts keep their
existing behavior. Dashboard forecasts retain their original horizon. The upcoming
stage is `upcoming_3d`, deduplicated throughout the three-day window; due/overdue
stages retain their existing keys. Old `scheduled` messages no longer qualify for
automatic sending, while an earlier sent forecast does not suppress the new
three-day reminder. Eligibility is checked both by the queue worker and direct
notification dispatch before transport. Explicit administrator historical resends
retain their existing override behavior; consent and tenant scope still apply.

## Navbar search

`GET /livestock/animals/?search=<term>&page_size=5` searches animal identifiers
and the associated batch code/name. `GET /livestock/batches/?search=<term>&page_size=5`
searches batch codes and names. Both retain existing pagination, tenant isolation
and operator species restrictions. The dashboard navbar queries these endpoints
after two characters. Animal results navigate to the individual pig page, or the
species page for other species; batch results open the existing technical sheet.

Navbar search also queries `/inventory/items/?search=<term>&page_size=5` and
`/farms/structures/?search=<term>&page_size=5` for profiles authorized to open
those sections. Selecting an inventory result opens `/home/estoque/produtos?search=...`;
selecting a structure opens `/home/estrutura?farm=...&search=...`, resolving the
requested farm against the authenticated organization's available farms.

## Assisted organization access

`POST /platform/support-access/` requires only `organization_id`. Optional legacy
`ticket_reference`, `justification` and `duration_minutes` remain accepted; sessions
default to 30 minutes. Active platform owners, administrators and support staff
receive organization administrator permissions within the selected active tenant.
The operator identity is retained; tenant queries remain scoped to that organization.
Creation, reopening and revocation are recorded in platform audit history.
Expired/revoked grants, suspended organizations and disabled/unauthorized staff
are rejected on each request. The platform support access screen requires no
protocol, justification or duration selection.

## Organization lifecycle

Organizations expose `status` (`active`, `suspended`, `archived`),
`status_display`, `status_changed_at` and an administrative `status_reason`.
`is_active` remains compatible and is true only for `active`; a database
constraint prevents inconsistent values. The tenant organization response exposes
the state and date, but not the internal reason. Subscription states are independent.

Platform administrators use the existing POST actions
`platform/organizations/{id}/suspend/`, `archive/` and `activate/` with optional
`reason` (up to 1,000 characters). Active organizations may be suspended or archived;
suspended organizations may be reactivated or archived; archived organizations
must be reactivated before suspension. Repeated/invalid transitions return 400.
State fields cannot be changed through the organization registration PATCH.
The list accepts `status` alongside the legacy `is_active` filter.

Transitions run atomically with row locking and audit previous/new state and reason.
All member session versions are incremented and all support grants revoked, including
on reactivation; existing tokens cannot return after access is restored. Data and
subscription state are preserved. Password and Google login report suspended or
archived state appropriately; active platform staff retain their backoffice access.

Migrations `organizations.0003`–`0005` add fields, backfill and enforce consistency.
Inactive records use the latest lifecycle audit event to recover archival; absent
or conflicting evidence defaults to suspension, with an `organization.status_migrated`
log recording the evidence and whether the state was inferred. Migration dates
use the known event timestamp, falling back to the previous update timestamp for
ambiguous inactive records and creation time for active records without activation
evidence. These fallbacks are approximate historical dates. Existing inactive
tenants also have member sessions and support grants revoked.

Deployment must coordinate application code and migrations: pause organization
state writes from old application instances before applying the final constraint,
then use the updated instances. Old code writing only `is_active` directly cannot
satisfy the new constraint. Apply normal `manage.py migrate` against the intended
environment before serving the updated API. Backfill rollback does not restore
revoked sessions/grants or delete migration audit history; reauthentication is required.

## First administrator invitation

Platform organization creation now requires an `administrator` object containing
`full_name` and `email`, in addition to the existing organization/plan fields.
Example: `{"name":"Cliente","plan_id":"<uuid>","administrator":{"full_name":"Responsável","email":"responsavel@example.com"}}`.
This intentionally replaces administrative creation of organizations without an
administrator; existing organizations are unchanged. Organization PATCH rejects
`administrator`, which cannot be used to transfer or replace a responsible user.

The service creates the organization, subscription, responsible administrator and
invitation atomically. The account has no usable password and remains inactive
until acceptance. Existing emails are checked case-insensitively and rejected,
including accounts without an organization and platform staff. No existing user
is automatically moved or attached to a tenant. Concurrent database conflicts
roll back provisioning instead of leaving a partially created organization.

Only the SHA-256 digest of a random 256-bit invitation token is stored. The raw
token is sent by email after commit, with a default 24-hour lifetime. SMTP failure
keeps the organization and invitation, records a sanitized failure and permits
resend. Delivery callbacks are idempotent for each token and ignore superseded
links. Sending uses the existing Django email backend synchronously after commit,
with `EMAIL_TIMEOUT` defaulting to 10 seconds; it does not require Celery. If the
process stops before the callback finishes, the persisted pending state can be
recovered through explicit resend. SMTP acceptance is recorded as `sent`, not
confirmation that the recipient opened or received the message in their inbox.

`POST /platform/organizations/{id}/resend-administrator-invitation/` is restricted
to platform owners/admins, rotates the token, renews expiry and invalidates the old
link. It rejects accepted invitations, unavailable organizations and accounts whose
responsible-user eligibility has changed. Organization detail returns
`administrator_invitation` (null for legacy organizations), including `state`
(`pending`, `sent`, `failed`, `expired`, `accepted`), responsible name/email,
expiry, acceptance and delivery timestamps, attempt count and sanitized error.
Neither raw tokens nor their digest are returned through administrative APIs.
Creation, resend, delivery outcomes and acceptance are audited.

The public route `/aceitar-convite#token=...` displays the organization and
responsible account and collects a password and confirmation. The token stays in
the URL fragment (not query parameters or HTTP referrers) until acceptance, when
the fragment is removed. `POST /auth/organization-invitations/inspect/` accepts
`token`; `POST /auth/organization-invitations/accept/` accepts `token`, `password`
and `password_confirmation`. Both are public, ignore existing bearer credentials
and share an IP throttle of 30 requests/minute. Acceptance validates Django password
policy, locks organization/invitation/user, consumes the token once and activates
the account without issuing login tokens. The user then logs in normally.
Expired/used/unknown tokens and changed account/organization eligibility return 400;
weak or mismatched passwords leave the invitation available for another attempt.

Apply `accounts.0009` before exposing these endpoints. Configure `FRONTEND_URL`
with the public web origin for the environment (default `http://localhost:3000`),
`ORGANIZATION_INVITATION_HOURS` if changing the default lifetime, and the existing
SMTP settings for production. Development continues to use console email and
tests use the in-memory email backend. No real invitation email is sent by tests.

## Organization responsible transfer

Organization detail now returns `responsible` (null when missing), with ID, name,
email, role and account activity. This describes the current responsible user;
`administrator_invitation` continues to describe the historical first administrator.

Platform owners/admins use `GET /platform/organizations/{id}/responsible-candidates/`
to search active tenant users by name/email (`search`) with standard pagination.
The current responsible user, internal staff (including inactive staff profiles)
and accounts restricted to the affiliate portal are excluded. Other platform roles
and tenant administrators cannot list candidates or perform transfers.

`POST /platform/organizations/{id}/transfer-responsible/` accepts `user_id` and
required nullable `expected_responsible_id`. The expected ID must match the current
responsible user, or be null when none exists. A changed snapshot, selecting the
current responsible user or an unavailable/external/internal candidate returns 400.
The response is the updated organization detail. The action is also available for
suspended/archived organizations; it does not reactivate the organization or alter
its subscription.

The service locks organization, invitation and affected user rows in a consistent
order, then clears the previous designation and assigns the active target. The target
becomes an administrator; operator scopes are cleared. Promotion increments the
target's session version so it must log in again. The previous administrator keeps
its role and original active/inactive state. Existing tenant rules continue to
prevent removal/demotion of the current responsible user. Responsibility cannot
be assigned through profile/organization registration PATCH.

An outstanding first-administrator invitation is revoked during the transfer;
its existing link, delivery callback and resend action no longer work. Invitations
expose `revoked_at` and an additional `state: "revoked"`. Accepted invitations remain
as historical records. All flag changes, promotion, invitation revocation and the
`organization.responsible_transferred` audit event are committed atomically.
The audit stores actor, organization, previous/new IDs and names and the target's
previous role.

Apply `accounts.0010` and `0011` before exposing transfer. The data migration keeps
existing designated tenant administrators (preferring active, then older accounts
when duplicates exist); otherwise it selects the oldest active tenant administrator.
Internal/affiliate-only accounts and non-administrators are never chosen or promoted
by the migration. Former flags, selected user and selection rule are recorded for
reconciled cases. Organizations with no eligible administrator retain no responsible
user and receive an audit event requiring manual resolution. Existing inactive
designated administrators, including pending invitees, are preserved when valid.
The subsequent conditional database unique constraint permits at most one responsible
per organization; each successful transfer guarantees exactly one active responsible.

Coordinate responsibility writes with deployment while backfill and constraint run.
Data rollback does not recreate duplicate flags or remove migration audit history.
The frontend details screen shows the current responsible user and provides a
searchable, paginated confirmation dialog restricted to platform owners/admins.

## Organization dossier

The platform organization detail screen has lazy sections: summary, registration,
users, subscription, invoices, payments, administrative history and assisted access.
The detail response adds `available_sections` and `can_manage`, calculated from the
request's current permissions. Create/edit/transfer/resend detail responses expose
the same capabilities. The client uses these capabilities for navigation and actions;
server permissions remain authoritative. The selected section is reflected in the
`tab` URL parameter, and unavailable sections fall back to the summary with a notice.

Read-only GET endpoints under `/platform/organizations/{id}/`:

| Suffix | Response | Permission |
|---|---|---|
| `registration/` | Registration with additional addresses and contacts | Active platform staff |
| `users/` | Paginated tenant users, excluding internal and affiliate-only accounts | Active platform staff |
| `subscription/` | `{subscription: <existing subscription shape or null>}` | Active platform staff |
| `invoices/` | Paginated invoices, including effective overdue state and balance | Active platform staff |
| `payments/` | Paginated payments with invoice, amount, currency, method and notes | Active platform staff |
| `history/` | Paginated existing platform audit entries | Platform owner/admin/auditor |
| `support-access/` | Paginated existing assisted-access grants | Platform owner/admin/support |

These permissions preserve existing directory/billing/audit/support policies. In
particular, billing reads remain available to active platform staff, including
support and finance; this delivery does not change global financial authorization.
Support operators see only grants assigned to themselves, while owners/admins
can see all grants for the selected organization. Tenant administrators and inactive
platform profiles cannot access these endpoints.

The organization in the URL is always the data boundary; query parameters cannot
replace it. List sections accept `search` (maximum 200 characters), `page` and the
existing bounded `page_size`. Search operates on child records, independently of
the parent organization's name. Results use deterministic ordering and related
objects are joined to avoid N+1 queries. Registration and subscription are single
resources; registration's addresses/contacts belong only to the selected tenant.
Missing organizations return 404; absent subscriptions and empty lists have explicit
empty states. POST and other writes are not supported on these section endpoints.

Summary retains current responsible, state, counts and administrative actions;
users includes first-administrator invitation tracking and resend. Existing edit,
responsible transfer and lifecycle actions remain in place. Tabular sections have
search, pagination, refresh, loading, empty and retry states. Last-login absence is
shown as an unavailable record, without inferring that the client never used the
system. Adoption metrics remain a separate planned delivery. No schema migration
is added for this dossier delivery.


## Organization consumption and quotas

The dossier's `consumption` section is available to active platform staff.
Under `/platform/organizations/{id}/`, `GET usage/` returns plan, effective limits,
consumption, remaining capacity, warning status and storage reconciliation metadata.
`PATCH usage/` and `POST reconcile-storage/` require platform owner/admin and record
administrative audit events. All operations use the organization in the URL.

Overrides live in `Subscription.custom_limits`: `max_users`, `max_farms`,
`max_storage_mb` and `warning_threshold_percent`. PATCH accepts a nonnegative
integer or null for each capacity; null means unlimited, zero prevents growth.
`inherit: ["max_users", ...]` removes selected overrides to follow the plan again.
The warning threshold is an integer from 1 to 100 (default 80). Unknown request keys,
empty changes and simultaneous override/inherit of the same key are rejected;
unrelated existing custom settings are preserved. An organization needs a
subscription before receiving overrides. Limits are resolved on each operation.

Seats count active customer accounts plus valid pending first-administrator
invitations for inactive customer accounts. Internal platform and affiliate-only
accounts are excluded. Failed email delivery still reserves the invitation's seat
until expiration or revocation. Accepting a reserved invitation does not consume a
second seat; resending an expired invitation requires available capacity. Farms
count only while active. Deactivation frees capacity according to these rules.

Storage counts referenced organization logos, customer avatars, supplier images,
transaction attachments, soil-analysis files and generated report files. Inactive
customer avatars remain included; internal-team avatars are excluded. Shared
storage names count once per organization. One MB means 1,048,576 bytes; storage
`used`, `capacity` and `remaining` are bytes, while configured storage limits are MB.
The tenant organization summary also exposes real usage instead of a placeholder.

Quota failures return HTTP 409 before growth is committed. Lowering a limit below
current usage preserves existing data; non-growing edits, deletions and smaller
replacement files remain possible. Model saves and the supported ORM bulk
create/update paths enforce limits under organization row locks. Bulk conflict
ignoring/upserts and quota-field update expressions are unsupported. Raw SQL and
private ORM managers bypass these guarantees and must not be used for quota writes.
Uploads reserve logical capacity before writing; old files are removed after commit
only when no registered model references them. Failed model saves remove newly
written files and roll back reservations. Database transactions cannot roll back
storage operations: an unrelated outer transaction rollback or process crash can
leave an unreferenced blob. This is a quota on registered references, not a hard
physical bucket limit; orphan-bucket discovery/deletion is outside this operation.

Apply billing migration `0010_organizationstoragestate_organizationstoredfile`
before serving this code. Existing file references are reconciled lazily on first
usage and then daily by Celery Beat's `organization-storage-reconciliation` task.
Operators can prewarm or repair with `manage.py reconcile_organization_storage`
(optionally `--organization UUID`) or the dossier action. Reconciliation measures
only registered tenant references. Missing files are reported with zero size;
unreadable sizes preserve known values and are reported as unknown. Positive
storage growth under a finite limit is refused while unknown sizes remain.
Deployments must run the existing Celery worker and Beat for scheduled refreshes.


## Organization adoption and inactive customers

`GET /platform/organizations/{id}/adoption/` is available to active platform staff
and returns `{metrics: null}` until the first materialization, then a scoped snapshot.
The dossier adds the `adoption` capability. Organization list/detail responses also
include nullable `adoption`; the list uses a related-object join rather than
aggregating events per request. No tenant may read the platform endpoint.

Evidence starts with platform_admin migration
`0014_adoptionobservation_organizationadoption_and_more`, which records the
observation start without inventing prior events. Successful password/Google login
and authenticated self-registration record login activity. Token refresh does not.
Successful POST/PUT/PATCH/DELETE requests in farms, livestock, crops, inventory,
finance and tasks record operational activity. GET/HEAD, errors, scheduled tasks,
platform requests and automatic inventory alert generation do not. This delivery
measures authenticated domain mutations, not passive page reading or time spent.
Internal profiles (including inactive profiles), affiliate-only accounts and assisted
access never contribute. No request bodies, credentials, IPs or entity content are
stored in activity rows. Collection runs after commit, with robust callbacks so
analytics errors do not fail a committed business operation; monitor callback logs.

Each organization/user/UTC-day has one row holding monotonic last-login and
last-operation timestamps. Repeated requests do not inflate unique-user counts.
The hourly Celery Beat task `apps.platform_admin.tasks.refresh_organization_adoption`
materializes organization snapshots under per-organization locks, using exact rolling
7/30-day cutoffs and distinct customer IDs. The task can be repeated safely. Run
`manage.py refresh_organization_adoption` after migration to initialize snapshots;
otherwise they remain pending until Beat runs. Deploy the schema before this code
and run the existing worker/Beat. A failed scheduled calculation leaves the previous
snapshot visible with its original date; monitor task failures and stale timestamps.

Metrics expose `calculated_at`, `observed_since`, `history_complete`, coverage flags
`period_7d_complete` / `period_30d_complete`, `active_users_7d` / `active_users_30d`,
`last_customer_login_at`, `last_operation_at`, `days_without_use` and `checklist`.
"Active users" means users with observed login or operational activity in the window,
including customers subsequently deactivated. Snapshot computation excludes users
now assigned elsewhere or now internal/affiliate-only. Deleting a user cascades its
daily evidence; these metrics are operational indicators, not an immutable audit.
The checklist tests current active designated responsible and existence of a farm;
first operation means an observed successful operational mutation. It does not
infer an earlier operation from imported records or old modification timestamps.

Status uses the most recent observed login or operation: `active` (under 7 full days),
`inactive_7` (7–14), `inactive_15` (15–29), `inactive_30` (30 or more). These are
exclusive buckets. Without evidence, organizations created since observation began
are `never`; older organizations are `unknown`, with unknown first-operation history.
Partial windows and unknown history are shown explicitly. Snapshot timestamps stay
visible in the dossier and listing; refreshing the screen reads the saved snapshot
and does not trigger a full recalculation.

`GET /platform/organizations/?adoption=<status>` filters these exclusive buckets;
`pending` selects organizations without a snapshot. Invalid values return 400.
Existing search/status/plan filters remain composable. The platform dashboard adds
`adoption: {by_status, pending, oldest_calculated_at}`, computed from snapshots; it
shows customers with use in seven days and customers without use for 30 days.
Operational call tracking and broader bulk actions remain subsequent deliveries.


## Organization filters and reviewed batches

The organization directory and batch selection share a validated filter service.
`GET /platform/organizations/` accepts composable `search` (200 characters), `status`,
`is_active`, `plan` (subscription plan code, with legacy fallback), `trial`,
`financial_pending`, `without_admin`, `without_responsible`, `adoption`, `unused_days`
(7/15/30), `near_limit`, `created_from` and `created_to` (ISO dates, inclusive in the
application timezone). Boolean filters accept true/false; omitted booleans impose
no restriction. Invalid values, reversed date intervals and invalid ordering return
400. Pagination remains bounded at 100 rows, with stable primary-key tie breaking.

`trial` uses the subscription's trialing state. Financial pendency means an invoice
with an outstanding balance and a past due date, excluding draft, paid and void
invoices. Missing-admin/responsible filters consider active customer accounts only,
excluding internal profiles and affiliate-only users. `without_responsible` means
no active designated responsible. `unused_days` includes all observed inactivity
buckets at or above the requested threshold; never/unknown/pending are separate
adoption filters. Search is a case-insensitive substring across name/slug/document/
email. Directory and frozen selection apply identical rules.

`near_limit` uses the hourly `OrganizationQuotaSnapshot`: any users/farms/storage
resource in warning/at-limit/over-limit status qualifies, using effective plan and
organization overrides. Organizations without a snapshot match neither true nor
false. List/detail adds nullable `quota_snapshot: {near_limit, calculated_at}` and
`subscription_plan_code`; the UI shows the calculation date and effective plan.
The hourly `apps.platform_admin.tasks.refresh_organization_quota_snapshots` task
reuses the quota service outside directory requests. Operators can initialize it
with `manage.py refresh_organization_quota_snapshots`. Failed calculation leaves
old timestamps or no snapshot; monitor Celery failures.

The batch API is under `/platform/organization-batches/`. Active platform staff can
prepare and execute directory exports. Platform owner/admin is required for suspend,
activate and invitation resend. Assisted-access context cannot prepare or execute
batches. Every batch endpoint is restricted to its creator; global administrative
audit still contains the batch and per-organization history. Request authentication
and permissions are checked on each request, then the worker reloads the actor and
rechecks current permission for each item.

- `POST /`: prepare a review with `action` (`export`, `suspend`, `activate`,
  `resend_invitation`), optional `reason`, and either explicit UUID `ids` or
  `all_matching: true` with `filters`. Filters are accepted only in all-matching mode;
  unknown fields/filters are rejected. State changes require a nonblank reason.
  Explicit IDs are deduplicated; missing IDs fail preparation. Selections contain
  1–10,000 organizations. Preparation snapshots IDs and listing fields in one
  transaction; it does not change organizations or send email. The draft expires
  after one hour. Newly matching organizations never join an existing selection.
- `GET /`, `GET /{id}/`: paginated own history / batch summary, including status,
  total, succeeded/failed/skipped counts, dates, action, reason, filters and parent.
- `GET /{id}/items/?page=...&status=...`: paginated frozen records and individual
  pending/delivery_pending/succeeded/failed/skipped results with sanitized messages.
- `POST /{id}/confirm/` with `expected_total`: require the exact reviewed count and
  an unexpired draft. The durable status becomes queued; repeated confirmation of
  the same batch does not dispatch it again. Drafts cannot execute without this step.
- `POST /{id}/retry/`: after completion, prepare a new draft containing only failed
  items. Completed/skipped items never enter retries. Repeated requests reuse the
  same child review (a fresh child may replace an expired unconfirmed review).
  Confirm the child explicitly; retrying a failed child forms a new history link.
- `GET /{id}/download/`: for completed export batches, download UTF-8 BOM CSV of
  successful frozen listing records. It contains ID/name/slug/document/email/state/
  effective plan/registration date, not the customer's full domain dataset. Formula
  prefixes are escaped; response uses no-store. Downloads are authorized and audited.

The UI supports checkboxes across pages, an explicit all-results option, review of
server-frozen quantity and records, execution confirmation, paginated outcomes,
follow-up review of failures, CSV download and reopening own recent batches.
Applying changed filters clears the current selection; prepared batches stay frozen.
Polling is limited to queued/running batches and reads progress, not adoption events.

Workers use `apps.platform_admin.tasks.process_organization_batch`. An item locks the
batch and organization, then commits its outcome together with any lifecycle change;
duplicate workers and redelivery cannot repeat committed transitions. Eligibility is
re-evaluated against current state: suspend only active tenants, reactivate only
suspended tenants. Archived tenants are skipped; this API does not restore/archive/
delete organizations in bulk. Existing lifecycle service revokes sessions and
assisted grants. Exports retain reviewed field values while checking organization
existence at execution. Item failures roll back that item and preserve other results.

Invitation resends reuse the existing first-administrator invitation flow, quota
checks and operational email; they add no marketing send or consent bypass. An item
first commits delivery_pending with an internal revision hash; the existing callback
sends after commit. Confirmed sends become succeeded and are never automatically
resent by batch redelivery. Provider failure becomes failed. A missing callback or
ambiguous outcome is left pending for up to two minutes, then marked failed for
explicit operator review/retry. SMTP cannot guarantee exactly-once delivery: if a
provider accepted a message before a crash, an explicit retry can send another one
and invalidates the earlier link. Check the invitation before retrying unknown sends.
Raw tokens and provider exception strings are never returned by batch endpoints.

Apply platform_admin migration `0015_organizationbatch_organizationquotasnapshot_and_more`
before this code. It creates only new tables/constraints, without rewriting customer
records. Run the existing Celery worker and Beat. Confirmation publishes after commit;
`organization-batch-resume` scans queued/running rows every minute and republishes
work if broker publication failed or a worker stopped. Per-item outcomes and prepared/
confirmed/completed/download events use existing administrative audit. Drafts,
selections and results persist as operational history; no automatic destructive
cleanup, customer-data recovery or full-tenant export is introduced here.


## Human support tickets

Customer API: `/support/tickets/`. Team API: `/platform/support/tickets/`.
The frontend customer entry is Central de suporte → Precisa de um atendente or
`/home/suporte/chamados`; the team queue is `/platform/tickets`. Existing articles,
private AI conversations and WhatsApp handoff remain available.

Customers must be active members of active organizations. Requesters read and reply
to their own tickets; current organization administrators may read and act on all
public tickets in that organization. Managers/operators remain limited to their own.
Internal profiles (including inactive profiles), affiliate-only accounts and assisted
access cannot use the customer ticket context. Team endpoints require an active
platform owner/admin/support profile and reject assisted-access tokens. Finance,
auditors and developers have no access to ticket content through these endpoints.
Ticket queries always apply the current organization/role boundary before lookup;
foreign tickets and attachments return 404. No bulk deletion or message-edit route
exists. Requester references are protected; organization deletion cascades its tickets.

All lists, messages, history and assignee searches use bounded pagination. Lists
accept `status`, `category`, `priority`, `search` (max 200 characters); team lists also
accept `organization_id`, `assignee_id`, `unassigned` and `mine`. Search uses public
subject, plus organization/requester names for team users; it never searches internal
notes for customers. Omitted boolean query filters impose no restriction. Sorting
is deterministic by last update/UUID, with newest messages and events first.
Related ticket users/organization and message attachments are joined/prefetched.

- Customer `POST /` opens a ticket with `subject` (3–200), `body` (3–10,000),
  `category` (access/billing/technical/question/other), `priority`
  (low/normal/high/urgent, default normal), and UUID `creation_key`. Organization,
  requester, assignee and initial state are server-owned. Creation writes the first
  public message and opening event atomically. Repeating the creation key with the
  same original payload returns the existing ticket, even after staff changes its
  metadata; changed payload returns 409. Team creation is not supported.
- `GET /{id}/` returns subject, category, priority, state, version, organization,
  requester, assigned display name, shared approved summary and lifecycle dates.
  Only team responses include the assigned account UUID.
- `GET/POST /{id}/messages/`: posting requires `body` (1–10,000), UUID `request_key`
  and `expected_version`. Team posting additionally accepts `is_internal`; customer
  payloads reject that field. Repeating a message key with the same author/body/
  visibility returns the original message without notifying again; mismatches return
  409. Terminal resolved/closed tickets require explicit reopening before new messages.
- `GET /{id}/history/` lists immutable events. Customer queries filter internal
  messages/events before pagination and omit the is_internal field entirely. Notes,
  note attachments and internal assignment history never enter customer results or
  pagination counts. Team messages/events explicitly mark internal visibility.
- Team `PATCH /{id}/` accepts `expected_version` and changed `assignee_id`
  (nullable), `category` or `priority`. Assignees must be current active support/
  owner/admin profiles. `GET /assignees/?search=...` supplies paginated candidates.
  Assignment history stores previous/new IDs and display names, visible only to team.
- `POST /{id}/transition/` requires `status` and `expected_version`. Team transitions:
  open → in_progress/waiting_customer/resolved; in_progress → waiting_customer/
  resolved; waiting_customer → in_progress/resolved; resolved → closed/open;
  closed → open. Customer actions are limited to resolution, closing a resolved
  ticket and reopening a resolved/closed ticket. A customer reply automatically
  returns waiting_customer to in_progress and records that change.

Writes lock the ticket and compare expected_version; stale requests return 409,
requiring a fresh read before retry. Creation is serialized per organization and
uses a unique requester/organization/creation-key constraint; message/upload keys
also have database uniqueness constraints. Creation/message identity keys are not
exposed in read serializers. The first public team reply sets first_response_at
once; notes do not. first_resolved_at is immutable, while resolved_at/closed_at
represent the current resolution/closure and clear on reopening. Reopen/history
never erase prior lifecycle events. Platform audit references events without
copying message or note bodies.

Optional conversation linking requires the customer's own support conversation UUID
and a nonblank `shared_context` (max 4,000 characters) explicitly reviewed on opening.
Other users' conversations and other tenants return 404. Linking does not grant team
access to the original conversation, expose its UUID in responses, or copy its
messages. Only the approved summary enters the ticket. This also applies when an
organization administrator reads another customer's ticket.

`POST /{id}/messages/{message_id}/attachments/` accepts multipart `file`, UUID
`request_key` and `expected_version`. Only the message's author may append files,
with at most five files per message, each nonempty and at most 10 MB. Allowed
extensions: pdf/txt/csv/png/jpg/jpeg/webp/xlsx/docx/zip; files are never executed or
extracted. The server computes size and SHA-256, stores a normalized original display
name plus a random storage name, and rejects changed content under an existing key.
The response contains only attachment ID/name/size/date, never storage paths/URLs.
Uploads lock organization before ticket, consume the organization storage quota
(including team/note attachments), and clean new blobs if the enclosing action fails.
They use the shared logical quota/reconciliation rules; attachments remain counted
while referenced. File replacement/deletion is not exposed by this delivery.

`GET /{id}/attachments/{attachment_id}/download/` rechecks ticket and public/internal
message authorization, then streams the private file. Cross-ticket IDs and hidden
attachments return 404; a missing physical file returns 404. Binary attachment
responses are no-store/nosniff with explicit attachment disposition. Configure a
persistent private SUPPORT_ATTACHMENT_ROOT outside public media/static roots;
see the infrastructure guide. The normal filesystem/database outer-rollback caveat
for quota files still applies; physical bucket cleanup is not introduced.

Opening and client replies notify assigned support staff, or the active support
team if unassigned/unavailable. Assignment changes notify the eligible assignee;
public team replies and state changes notify the current active tenant requester.
Internal notes notify only team recipients. Notifications contain generic text and
an authorized ticket link, never message bodies, note contents or shared summaries.
Existing system-category preferences, rate/group policies, idempotent event keys,
transactional creation and external delivery scheduling are reused. Ticket message
replays do not repeat logical notification creation. Notifications are not marketing
and introduce no WhatsApp policy bypass. Team/customer UI exposes loading, failure,
empty and refresh states, paginated history/messages and an explicitly labelled
public-message versus internal-note composer; attachments use authenticated requests.

Apply ai_assistant migration `0009_supportticket_supportticketevent_and_more` before
serving this code. It creates new ticket/message/event/attachment tables and indexes,
without backfilling or publishing existing AI history. SLA targets, overdue alerts,
satisfaction surveys and integrating tickets into the organization dossier remain
later work; no SLA behavior is inferred from priority.


## Integrated organization operations and support

The organization dossier adds `operation` for active platform staff and `tickets`
only for current platform owner/admin/support profiles outside assisted access.
These are computed capabilities; endpoints continue enforcing server permissions.
The summary embeds the operational overview, which is also available as a dedicated
Operation and pendencies tab. Existing responsible-management actions remain intact.
The responsible shown on the detail and overview excludes internal/affiliate-only
accounts, using the same customer eligibility as adoption and quotas.

`GET /platform/organizations/{id}/operation/` returns `calculated_at`, current
responsible, `has_active_admin`, effective `usage`, the saved `adoption` snapshot,
`billing`, nullable `support` and `issues: [{code, severity, section}]`.
Quota calculation reuses `organization_usage`, including first-read legacy storage
reconciliation. Adoption is read without recomputation; its own calculated_at,
partial-window flags and unknown history remain visible. Snapshot absence is shown
as pending, never inferred as lack of use. Unknown first-operation history is not
converted to an incomplete event record. A current administrator/responsible can
differ from the hourly adoption checklist; dates identify these observation windows.

Billing returns unpaid_count, overdue_count and overdue_amounts grouped by currency,
with exact decimal strings. Unpaid means total greater than amount_paid and status
outside paid/void/draft; overdue additionally requires a past due date. Fully paid
balances are excluded even if the status still says open. Uncollectible invoices
with outstanding past-due balances remain financial pendencies. The directory's
financial_pending filter and executive dashboard now use these same selectors.
Amounts in the dossier are never summed across currencies.

The support aggregate contains total, active, awaiting_team, waiting_customer,
unassigned, urgent and without_first_response counts. Active states are open,
in_progress and waiting_customer; awaiting_team includes only open/in_progress.
Urgent/unassigned/no-first-response counts consider active tickets only. Resolved
and closed tickets stay in total/history. Both the executive dashboard's nullable
`support` field and dossier use the same aggregate and support authorization.
Finance/auditor/developer profiles and assisted contexts receive null, with no
support issues or ticket capability. Aggregation never reads message/note bodies.

Overview issues direct users to the matching authorized section: missing/inactive
responsible or administrator, pending/failed/expired invitations, missing or blocked
subscription, overdue balances, quota warnings/limits, unreadable/missing storage,
unknown/pending adoption, observed lack of use, onboarding gaps and pending or
unassigned support tickets. They describe the current indicators; they introduce
no automatic suspension, sending or remediation. Refresh reads current indicators
and preserves the saved adoption calculation date.

`GET /platform/organizations/{id}/tickets/` is a read-only, paginated team endpoint.
It reuses human-support visibility, serializers and filters (status/category/
priority/search/assignee_id/unassigned/mine). The URL organization always wins over
an organization_id query parameter, including on later pages. Results contain ticket
metadata, not messages, notes, raw conversation links or attachment paths. Foreign
organizations return their own bounded results only when explicitly opened via that
organization's authorized URL. Missing organizations return 404. Mutations continue
through existing support-ticket services, version checks and audit/notification rules.

The dossier ticket tab reuses the team queue with a fixed organization and opens
individual ticket details inline, including the existing authorized reply, note,
assignment, state/history and authenticated attachment flows. Returning keeps the
operator inside the organization. Normal ticket links still allow opening a separate
browser tab. No route through a global queue is required. Loading, retry, empty,
permission and pagination states are retained. No schema migration, dependency,
new background task or historical backfill is introduced by this integration.

## Organization data exports

The dossier `exports` capability is restricted to active platform owners/admins;
assisted sessions, support, finance and tenant users cannot request or download
packages. The same authorization applies on every request and is checked again
before capture and publication. Endpoints under
`/api/v1/platform/organizations/{organization_id}/exports/`:

- `GET /` paginated history; `GET /{id}/` status, progress, summary, expiry and SHA-256.
- `POST /` with `format: customer|recovery` and UUID `request_key` returns 202.
  Reusing the key for the same request returns its existing job; conflicting reuse fails.
- `POST /{id}/retry/` with a new UUID `request_key` creates a linked child job for
  failed/expired exports, preserving the original history.
- `GET /{id}/download/` streams an authenticated ZIP while ready and unexpired,
  with `Cache-Control: private, no-store` and `X-Archive-SHA256`. No storage URL is exposed.

Both version-1 formats contain `manifest.json`, `schema.json`, `README.txt`,
`data/{model}.jsonl`, approved M2M `relations/*.jsonl` and referenced `files/`.
Customer format additionally includes UTF-8 CSV tables with formula escaping;
recovery format preserves typed field metadata, IDs and relationships without
CSV duplication. Decimal and UUID JSON values are strings. This technical export is accepted by the controlled recovery contract below.

The authoritative inventory is the explicit 93-model allowlist in
`backend/apps/platform_admin/exports/registry.py`. It covers organization and
customer accounts/preferences, farms/sectors, crop cycles and activities,
livestock and health/production records, inventory and movements, finances,
tasks, generated reports, customer AI conversations/messages/usage/feedback,
public support messages/events/attachments, notification preferences and billing
reference records. Shared species/breed/health/plan catalogs and global inventory
items are included only when referenced. Customer AI content is private customer
data and is intentionally included. Every scalar field, file field and M2M must
be explicitly inventoried; new models/fields stop generation until reviewed.

Passwords, staff privileges, session versions, permission groups, provider IDs,
provider attempts, safety classifications, support request keys/digests, internal
support notes, internal billing notes/payment metadata, generated report errors,
platform audit/administration, affiliate records, invitations, credentials,
sessions, integration settings and transient notification/delivery jobs are
excluded. Business text entered by customers remains customer data. Internal
staff/affiliate-only actors referenced by customer records become deterministic,
disabled synthetic accounts inside the package; real staff identity is omitted.
These placeholders have only export-required fields and need defaults if imported.
Cross-organization customer references fail generation rather than importing the
other customer's records. Billing entities are reference-only: a future recovery
must never replay payments or external provider events.

The manifest records inventory/format versions, organization/export IDs, snapshot
time, counts, schema hash, exclusions, synthetic actors and each entry's path,
size and SHA-256. File references point to archive-relative paths. ZIP CRCs are
checked before private atomic publication; the API exposes the complete archive
SHA-256. Missing/unreadable/changing files and inconsistent references fail the
whole job. Failed jobs never expose partial downloads. Request, start, completion,
failure, expiry and download have platform audit records with sanitized errors.

## Controlled organization recovery

`/api/v1/platform/organizations/{organization_id}/recoveries/` uses the same active
owner/admin authorization as exports. Assisted sessions, support, finance and
customer users cannot create, confirm or read recoveries. Only a ready, unexpired,
server-generated `recovery` export of the URL organization is accepted; arbitrary
uploaded packages and cross-organization sources are not accepted.

- `GET /`, `GET /{id}/`: paginated history/detail, operation/status/progress,
  sanitized error, isolated organization ID, preview, confirmation digests and hashes.
- `POST /` with `source_id`, UUID `request_key`: idempotent 202 rehearsal request.
- `POST /{id}/refresh/`: asynchronously rebuild the impact preview after source
  data changes. The successful rehearsal and its ID mapping remain available.
- `POST /{id}/apply/`: requires the latest `preview_digest` as `digest` and the
  exact current organization name as `confirmation`. Returns 202. A stale source
  fingerprint blocks execution even after a valid HTTP confirmation.
- `POST /{id}/rollback/`: same confirmation, using `applied_digest`. Refuses to
  undo when tenant data changed after application; no later work is discarded.
- `GET /{id}/records/?entity=farms.farm&page=1`: paginated source/restored pairs
  for conference, using the verified private ID map and only export-approved fields.
  Shared catalogs/billing are marked reference-only and have no restored row.
- `GET /{id}/download/?kind=source|before`: authenticated private source or
  pre-application ZIP; full archive SHA-256 is verified before streaming.

The worker verifies the full ZIP hash, every declared entry's size/SHA-256,
format/inventory/schema compatibility, counts, fields/types, IDs, FK/M2M links,
tenant ownership and file references. Duplicate paths, traversal, symlinks,
undeclared entries and limits fail closed. No extraction of archive paths occurs.
Shared catalogs must already exist and match; recovery never edits them. Schema
compatibility is exact for approved fields/relations, allowing migrations that
only add explicitly excluded operational metadata.

The rehearsal creates a suspended `recovery_isolated` organization with new UUIDs
(and new numeric ownership IDs), remapped relationships, disabled users with
unusable passwords and synthetic `@export.invalid` addresses. Scheduled reports
and notification channels are disabled. Files remain quarantined in the pinned
private ZIP for integrity checks/download, rather than creating public copies.
No subscription is provisioned and billing records are reference-only. All
restored values, row counts and M2M relations are checked before committing the
rehearsal. It is unavailable through ordinary authentication or assisted access;
its state cannot be activated. Conference is through the recovery endpoints.

Application policy is an explicit **merge**, not a historical database replacement:
restore approved fields of snapshot business records, recreate missing records,
replace approved M2M links of restored sources and preserve records absent from
the package. Existing users and notification preferences remain unchanged;
new users are inactive and require a separate normal activation process. Existing
organization slug, plan and lifecycle state remain unchanged. Imported report
schedules stay disabled and unfinished reports become failed. Billing and external
events are never replayed; account authorization is never rolled back. Counts of
creates, updates, preserved accounts, reference-only rows and newer preserved
records appear in the preview. Natural-key/constraint collisions abort atomically.
This policy can preserve transactions/movements newer than the snapshot; operators
must review historical balances/quantities when selecting the source and impact.

Before application, a private technical snapshot and a checksummed inverse journal
are written. Imports bypass model save hooks and signals deliberately, avoiding
inventory movements, notifications and provider calls being executed twice.
File quota ledgers are reconciled inside the transaction. Original IDs are retained
on application; isolated IDs are never substituted into the original tenant.
Rollback restores the journal's exact previous field/M2M values, removes records
created by that application and compares the result with the pre-application
fingerprint. Previous file bytes can be rehydrated from the backup if an
unreferenced physical upload has already been collected. A failure rolls back every domain change; file cleanup removes only
uncommitted/orphaned copies. A new source requires a new recovery request.

Statuses are `queued`, `running`, `ready`, `applied`, `rolled_back`, `failed`.
Failed application returns to `ready`; failed rollback returns to `applied`, with
a sanitized error, preserving the last committed state and permitting retry.
The request actor is immutable; subsequent confirmed operations record their
own authorized actor. Requests, execution, result, failure and downloads are audited.

## Bovine workspace (beef and dairy)

The bovine pages under `/home/rebanho/bovinos/` use the isolated
`/api/v1/livestock/cattle/` API. Existing swine, poultry and generic livestock
routes retain their contracts. The bovine workspace replaces its former
under-development gate and sample reproduction data with persisted records.

- `overview/`: tenant-scoped active head count, identified animals, collective
  batches, reproductive status, identified-animal average weight, monthly milk
  production/discard and pasture area. Identified members of collective batches
  are not counted twice.
- `animals/`: paginated cattle-only inventory, exact `identifier` and `farm`
  filters plus sex/category/status/reproductive filters and text search. Creation
  uses `farm_id`, a unique brinco in that farm and `species_code_input=bovinos`.
  Entry weight is saved as a weighing. Cattle pesagens do not allow a backdated
  record to overwrite a more recent current weight.
- Animal actions: `register-weight/`, `register-vaccination/`, `register-mating/`,
  `diagnose-pregnancy/`, `record-birth/`, `record-event/`, `full-history/`.
  Birth accepts `date`, `outcome=alive|stillborn`, optional `weight_kg`, and a new
  `calf_identifier` plus `calf_gender` for live births. It atomically completes
  the pregnancy and creates a calf linked to its dam, without generating swine
  maternity batches. Management events cover weaning, castration, dry-off,
  pregnancy loss and mortality; state-changing management requires a manager.
- `batches/`: collective cattle lots with cattle categories and phases
  `creche` (Cria), `crescimento` (Recria), `engorda`, `reproducao`. Exact
  `batch_code`/`farm` filters are supported. `change-phase/` retains phase history;
  `register-sale/` reuses the existing atomic sale/revenue service. Complete
  sales also close open pasture occupancy. A positive purchase value also triggers the shared livestock financial signal,
  which now creates an open payable linked to the farm; settlement is confirmed
  in Finance. Sales create open receivables and accept an optional `due_date`.
  Existing paid documents retain their original status.
- `pastures/`: farm, name, positive area in hectares and notes.
  `grazings/`: a cattle batch and pasture from the same farm, entry and optional
  exit. Only one open occupancy is allowed per batch. POST `grazings/{id}/close/`
  accepts `exit_date`. This version records occupancy; it does not provide
  satellite imagery or geographic pasture polygons.
- `milk/`: per-cow/per-date/per-session (`morning`, `afternoon`, `evening`)
  production and discarded liters. Duplicate sessions and discard exceeding
  production are rejected. Records require an active bovine cow or matrix.
- `feed/`: cattle-specific consumption backed by existing inventory records.
  Accept a collective `lote_animal` or identified `animais`, cattle feed in kg,
  `data_inicio`, `data_fim`, and total `quantidade`. Stock deduction and cost
  snapshots are atomic. Existing swine consumption validation is unchanged.

Organization and species authorization apply on the server. Operators need
bovinos in `allowed_livestock`; read-only access cannot mutate records. Financial
values and sales remain restricted. The UI uses local CSS modules and existing
Bootstrap, modal, organization-access and API-client conventions, with 30-row
pagination and CSV exports for managerial animal, batch and milking reports.

Migration `livestock.0033` adds pasture, grazing and milk records without changing
existing livestock rows. These three models are included in the explicit tenant
export/recovery registry. Device/RFID integration, offline synchronization,
satellite monitoring and predictive AI are not part of this implementation.

### Confirmed cattle management and independent lactation

Migration `livestock.0034` adds cattle-only profiles, collective managements and
participants, pasture capacity and milk discard reasons. It preserves existing
bovine lactation states and recorded castrations without changing other species.
The three new models and fields are included in tenant export/recovery.

- `managements/`: managerial list/create/retrieve/PATCH for identified animals,
  filtered by `farm`, `kind=weighing|sanitary|castration`, `status` and `search`.
  Payload includes `farm`, `kind`, `date`, `description`, `entries` (1–1000 unique
  `{animal, weight_kg}` rows) and optional `responsible`/`notes`. Weighing requires
  each participant's positive weight; other kinds do not accept weights.
  Sanitary headers also accept `treatment_type`, nonnegative `cost_per_animal`,
  `next_procedure_date`, `milk_withdrawal_until` and `meat_withdrawal_until`.
  Dates of follow-up/withdrawal cannot precede the application. This manual
  sanitary flow creates HealthRecords with the declared costs; it does **not**
  deduct medication stock. Existing individual vaccination retains its stock
  integration. Collective drafts do not change weights, histories or costs.
- POST `managements/{id}/confirm/`: admin/manager only; locks the document and
  animals, revalidates current state and farm/species/date, then applies all
  effects atomically. Retrying an already confirmed document returns it without
  duplicating effects. Confirmed/cancelled documents cannot be edited or deleted.
  POST `managements/{id}/cancel/` requires a nonempty `reason` and cancels only a
  draft. Confirmed management reversal is not implemented; the UI does not offer
  cancellation as a substitute. Collective endpoints are unavailable to operators.
- Animal responses additionally expose read-only `is_lactating`, `is_castrated`,
  `weaning_date`, `management_group` and withdrawal end dates. The latest confirmed
  sanitary end dates are displayed; `withdrawal=milk|meat` filters currently
  restricted animals. Each withdrawal includes its final day. Meat withdrawal
  here is informational for identified animals; it does not implement a slaughter
  sale workflow or restrictions for untracked collective animals.
- `record-event/` additionally accepts `start_lactation`; `dry_off` closes the
  independent lactation flag while preserving an ongoing pregnancy. Covering a
  lactating cow preserves that flag. Birth opens lactation. Castration persists
  a flag and rejects a repeat. Weaning optionally accepts positive `weight_kg`
  and `destination_group` (a cattle profile label, **not** a collective lot
  transfer); it records weight/date/group and leaves the dam's lactation intact.
  These fields are rejected for other events. State-changing events remain
  managerial. A complete independent lactation-cycle model is not implemented.
- `milk/`: `discard_reason` is required whenever discarded liters are positive.
  A confirmed sanitary milk restriction covering the recording date requires
  full discard. Historical end dates are evaluated against the milk date, not
  today's date. Confirming a new restriction over previously usable milk is
  rejected until those records are corrected explicitly. Both flows lock the
  same animal to serialize application/production; existing milk ownership
  restrictions remain. Cow reassignment of an existing milking is prohibited.
- `pastures/`: optional positive `max_stocking_ua_ha`; read-only `occupancy`
  reports currently occupied collective heads, known weight, missing-weight
  heads, UA/ha and percentage of capacity using 1 UA = 450 kg. Missing weights
  or capacity produce null metrics, not a false zero. Changing a pasture's farm
  by PATCH is rejected. No geographic polygons or individual pasture occupancy
  are added in this iteration.
- `overview/` accepts optional `farm`, counts lactation independently of
  reproductive status, and returns `agenda` with predicted births and sanitary
  follow-ups (up to eight of each, including past dates for review).
  Milk, pasture, grazing, feed and sales queries also support the farm filter.
  UI CSV exports carry the current farm/search/status/category/withdrawal filters
  applicable to each resource and export all matching pages.

This iteration keeps existing sales/finance contracts. Purchase documents,
confirmed-sale reversal, carcass settlements, economic cost allocation, offline
synchronization and the sale simulator remain separate follow-up work.

## Stock counts

`LoteEstoque.quantidade_atual` is read-only. Supplying it in a write request is
rejected; the initial quantity cannot be changed after creation. Creating a lot
with a positive initial quantity creates an `entrada` movement atomically.
Lots with balance cannot be deactivated, and lots with balance or movements
cannot be deleted. Historical balances are not backfilled.

`POST /api/v1/inventory/lotes/{id}/ajustar-estoque/` accepts
`quantidade_contada` (nonnegative decimal), `saldo_esperado` (observed balance),
and a required `motivo`. Admins/managers within the organization can submit it.
It locks the item and lot, rejects stale balances with 409 and unchanged counts
with 400, and records a signed `ajuste` movement for the difference together
with the responsible user, previous balance, count and reason. The movement
and new balance commit atomically. An inactive lot must be reactivated at zero
before receiving positive balance. Adjustments cannot be edited or deleted,
including bulk deletion; correct them with a new count. Generic movement
creation rejects `ajuste`; ordinary entries/exits require positive quantities.
This operation does not create a financial transaction.

## Financial posting and settlements (OCTA study, increments A/B)

`BankAccount.current_balance` is reconciled from `initial_balance` plus paid
revenues minus paid expenses in the same organization/account. Pending, overdue
and cancelled documents do not enter the realized balance. Normal model saves,
account reassignment and transaction deletion refresh affected accounts under
ordered row locks in the same transaction. Bulk writes bypass model hooks; the
controlled recovery importer restores the captured balance together with its
documents. Migration `finance.0007` reconciles existing balances without changing
the payment status of historical documents. No missing bank/farm is guessed.
An account with documents cannot be deleted; deactivate it instead. Opening
balance is protected after first use; category type is protected after posting.

New stock purchases create one payable per receipt (`STOCK-MOV-{movement UUID}`),
including receipts reusing an existing lot. `farm` is explicit on stock movements.
Their write-only purchase fields are `purchase_due_date`,
`purchase_payment_status=pending|paid` (default pending),
`purchase_bank_account`, `purchase_payment_date`, `purchase_payment_method`. Paid purchases require a
positive known cost, own active account and nonfuture payment date; creating the
receipt, document, payment event and stock balance is atomic. Ordinary stock
entries do not create purchase expenses. Raw cost-bearing lot creation outside
this receipt flow retains the existing financial integration, now as a pending
payable. Feed transformation lots remain excluded. Receipts linked to a payable
cannot be silently edited/deleted independently of the financial origin.

New livestock purchase/sale titles are open, linked to farm/batch/species. Cattle,
swine vaccination and crop stock services transmit the actual production farm;
shared generic stock movements without a farm remain unassigned. These changes
do not retrospectively reassign historical movements.

`POST /api/v1/finance/transactions/{id}/settle/` accepts `bank_account`,
`payment_date`, `payment_method` and UUID `idempotency_key`. It settles the full
positive amount of an open title and records an immutable `PaymentEvent` with
actor/date/account. `POST .../{id}/reverse/` requires a reason and a new UUID key;
provide `payment` with the active payment-event UUID. For a legacy paid title
without events, the first reversal snapshots its original payment before
recording the reversal. The title reopens; the original payment stays in history.
Replay of the same key within the same title returns its original event without
changing the balance; mismatched parameters are rejected. Financial fields are
protected after a payment event, including writes through shared model services.
Paid/history-bearing titles cannot be deleted. Existing clients posting an
already-paid title remain supported and now create an initial payment event.
New settlement/reversal actions retain organization and role authorization.
Partial settlements are not implemented in this increment.

`POST .../transactions/series/` accepts UUID `series_id`,
`kind=installment|recurrence`, `count` (2–120) and `transaction` (normal title
fields). All titles start pending. Installments divide the total into exact cents;
recurrence repeats the full value. Monthly dates retain the original day when
possible and clamp to the last day for shorter months. The organization/series
number constraint and organization lock prevent duplicate generation; a retry
returns the existing series. This is a finite monthly schedule, not an automatic
background billing task.

Transaction list/stats/CSV export share organization, type/status/search,
farm/account/species/batch/planting-cycle and due/payment-date range filters
(`due_date__gte|lte`, `payment_date__gte|lte`). Lookup choices are available at
`GET .../transactions/lookups/` and remain tenant-scoped except global species.
`GET .../transactions/export/` exports up to 10,000 filtered rows with a UTF-8 BOM
and escapes spreadsheet formulas in user-authored cells. Cash flow includes
payment/reversal events at their effective dates, plus legacy paid titles without
events, avoiding double counting. Account balance is organization-wide; title
filters do not apportion a bank balance across production activities.

The financial UI now supports paginated/searchable titles, production context,
full settlement/reversal history, monthly installments/recurrence, filtered CSV
export, and active/inactive accounts/categories. `finance.0006` adds payment
events and series metadata. Both are registered in tenant export/recovery.
Cost-center allocation, bank-statement reconciliation and geographic import
remain the separately specified increments C/D from the research document.

## Cattle operational planning (VSM priorities)

`GET /api/v1/livestock/cattle/agenda/` returns the standard paginated envelope.
Filters: optional organization-scoped `farm`, `kind=all|birth|diagnosis|sanitary`,
`period=all|current|overdue|today|upcoming`, and normal page/page_size. `current`
includes today and future dates. Events include a stable kind/source ID, source
record UUID, date, farm/name, animal when applicable and temporal classification.
Births, pending diagnoses and unresolved confirmed sanitary follow-ups are united
before pagination. The overview retains a bounded preview with separate room for
upcoming and overdue work and exposes `agenda_count`; it no longer limits each
origin to the first eight historical records without a way to reach the rest.

`Mating.expected_diagnosis_date` is an optional date set by the responsible user,
not earlier than mating. Both shared alerts and cattle agenda use it; null values
retain the existing shared 21-day fallback for compatibility. Recording a result
removes the corresponding pending diagnosis. No clinical protocol or application
is generated by viewing/planning the agenda.

`POST .../cattle/managements/{id}/resolve-follow-up/` accepts
`status=done|cancelled`, required `note`, and `execution` for a done follow-up.
The execution must be another confirmed sanitary management of the same farm,
not earlier than the origin, covering every original participant. Resolution is
managerial and preserves actor/time/note/execution. Matching replays are harmless;
conflicting resolutions are rejected. Audit fields are read-only on normal PATCH.
The previous next-procedure date remains in the historical management.

Cattle parent references are validated in both generic and cattle animal APIs.
Self-parenting, cycles, wrong parent sex and contradictory known birth dates are
rejected, including edits to a parent's date/sex that invalidate existing children.
Farm row locks serialize pedigree changes made through these serializers. Unknown
birth dates are not invented. `sire_identifier_input`/`dam_identifier_input` resolve
existing cattle in the selected farm; external names remain supported.
`GET .../cattle/animals/{id}/genealogy/` exposes three generations of identified
ancestors, repeated links and up to 50 direct children plus their total count.
It makes no genetic coefficient or absence-of-relatedness claim for missing data.
`manage.py audit_cattle_genealogy [--organization UUID] [--summary]` is a read-only
historical diagnosis; it never repairs or deletes data automatically.

Pastures have explicit `availability=unknown|available|resting|blocked` and
`availability_reason`. Legacy rows default to unknown. Resting/blocked pastures
require a reason, cannot receive new occupancies and cannot be restricted while
occupied. Empty does not automatically mean available. Occupancy now also exposes
state, maximum current occupied days, latest exit and empty days when known.
Batch operational summaries use annotations/prefetching for latest weighing,
identified count, active pastures/durations and current nutrition plans. Existing
identified-versus-collective herd counting is unchanged.

`/api/v1/livestock/cattle/feed-plans/` supports managerial GET/POST/PATCH with
batch, product, kg_per_head_day, start/end dates, is_active and notes. One active
plan per batch/product is enforced. Batch/item cannot be changed after creation;
close the plan and create another. Eligible products are active organization-owned
cattle/general feed or supplements in kg. Direct cattle consumption now also
accepts the supplement category, retaining its existing stock/cost transaction.
Planning alone has no stock or financial effect.

`GET/POST .../feed-plans/{id}/deliveries/` lists immutable deliveries or confirms
one using date, quantity_kg, remaining_before_kg, UUID request_key and optional
notes. Confirmation uses today's actual batch count and a physical count of the
same product already in the trough. It only accepts today's date and a current
plan/active batch. Item/lot row locks, stock sufficiency and the per-plan request
key protect the operation; mismatched retry data are rejected. A delivery records
head count, daily requirement, available-after quantity and cost snapshots and
creates exactly one warehouse outflow per source lot, linked by the new read-only
`MovimentacaoEstoque.cattle_delivery`. Such movements cannot be edited/deleted
through generic stock APIs. No additional financial purchase or measured animal
consumption is fabricated. Do not record the same warehouse outflow again as
ordinary cattle consumption.

Forecasts use the last physical count plus delivered quantity, less elapsed whole
days times the recorded daily requirement. They are estimates, not measured feed
intake. Missing delivery data remain unknown; changed head count/daily rate makes
the estimate require review until a new counted delivery. Plan/batch expiry is
respected. Historical snapshots are not recalculated. The UI includes supply
status, estimated remaining quantity/coverage/replenishment date and delivery
history. Plans and costs are restricted to administrators/managers.

`livestock.0035` adds plans/deliveries, pasture availability and follow-up audit
fields; `inventory.0028` adds the nullable delivery origin on stock movements;
`livestock.0036` adds the optional diagnosis date. New models/fields are included
in the explicit organization export/recovery registry. Recovery preserves snapshot
and movement identity mappings without consuming stock a second time.

`GET /api/v1/finance/transactions/projection/` accepts `days` (1–365), optional
own `bank_account`, and `include_overdue`. It starts from realized balances and
projects only pending/overdue titles through the horizon. Included overdue titles
are grouped on today's date. The general projection includes unassigned open
titles and reports their count; an account projection includes only assigned
titles for that account. It reports opening/closing balance, daily amounts and
first negative date, and performs no writes or settlements. The shared financial
UI offers 30/60/90-day horizons separately from realized cash flow.

### Organization agenda

`GET /tasks/agenda/` supplies the main-menu Agenda, with a monthly calendar by default, weekly calendar and paginated list views. Filters: `start`, `end` (inclusive, up to 42 days), `farm`, `domain` (`all`, `livestock`, `crops`, `tasks`), optional `species`, and `include_recorded`. Default range is the current Monday–Sunday. Each calendar day requests a paginated preview and its complete count; the day action opens its complete list. The UI supplies explicit date ranges for the selected month or week, and PDF export follows the selected view and filters.

Sources include due tasks, expected births, pending pregnancy diagnoses, sanitary follow-ups, next vaccine doses, expected weaning/hatching, estimated cattle feed replenishment, planned planting/harvest, and pending agronomist recommendations. The recorded toggle includes completed tasks and dated reproduction, vaccination and crop operations. Events without dates are absent. Source records remain authoritative; viewing the agenda creates no stock or financial transactions. Tenant isolation and operator species, crop and task permissions apply before aggregation.

### Organization holidays

`Holiday` (`tasks.0002_holiday`) stores organization, name, concrete date, source (`manual`/`national`) and creator. Dates do not automatically repeat annually. `(organization, date, name)` is unique; multiple named holidays may share a date.

- `GET /tasks/holidays/?year=2026`: paginated adopted holidays, tenant scoped. Admins/managers may `POST` a manual holiday (`name`, `date`) or `DELETE /tasks/holidays/{id}/`; operators can read only.
- `GET /tasks/holidays/national/?year=2026`: previews BrasilAPI dates with a `registered` flag. Public lookup uses validated TLS, an 8-second timeout and a one-day cache; an unavailable/invalid source returns 503 without writing records.
- `POST /tasks/holidays/import-national/`: `{year, dates:["2026-12-25"]}` imports only selected provider dates, atomically and idempotently, without overwriting manual entries. Year range 1900–2199. The provider may include religious/optional dates; the UI makes selection explicit.

Agenda queries accept `domain=holidays`; adopted holidays also appear in the all-domain agenda and PDF. They apply organization-wide even when filtering a farm. Calendar highlights are independent of activity filters; Saturdays, Sundays and adopted holidays have distinct styling. No holiday is adopted by merely consulting the provider.

### Manual agenda events and WhatsApp reminders

`Task` also represents an `event` or `appointment` via `event_kind` (legacy default `task`). The existing tenant-scoped `/tasks/` CRUD accepts `due_date`, optional same-day `start_time`/`end_time`, `location`, description, farm, priority and status. The agenda includes the start time in manual-event titles. The UI exposes “Novo evento” and opens existing task details from calendar/list cards.

`whatsapp_remind_at` is an optional aware timestamp, future-dated and no later than the event start (end of day for all-day events). Opt-in applies only to the creator's own authorized WhatsApp contact, not the assignee or arbitrary phone numbers. Changing an existing reminder requires its creator. `GET /tasks/agenda-options/` returns current-user editing/contact readiness, channel/configuration flags and application timezone. `reminder_status` exposes the linked delivery's actual status; saved reminders are not labelled sent.

Migrations: notifications `0011_alter_notification_category_and_more`, tasks `0003_task_end_time_task_event_kind_task_location_and_more`. The new `agenda` notification category has its own policy; existing category settings are unchanged. Agenda opt-in does not use the reproductive-alert preference. Global contact authorization, category controls, active organization/user and isolated-recovery barriers still apply.

Celery Beat calls `apps.tasks.tasks.collect_agenda_reminders` every 60 seconds. The collector locks each eligible task, uses a stable versioned notification key, and enqueues only WhatsApp through the existing durable outbox (which runs every 30 seconds). No message is sent during event save. End-to-end delivery requires a configured/connected WPPConnect service and running Celery worker/Beat. A 15-minute event-start grace accommodates scheduler delays; expired events are skipped. Edits rotate the reminder version; completion/cancellation/deletion, organization changes and expiration are checked again immediately before dispatch. Messages already sent cannot be recalled. Export/recovery preserves event fields, excluding the transient `reminder_delivery` pointer.

Agenda PDF uses a printable version of the web calendar: compact month/week grids, activity colors, current-day marker and distinct weekend/holiday backgrounds. Adopted holiday metadata is loaded independently of activity filters, matching the web highlights. The monthly overview stays on one page; previews that overflow or truncate have their complete event details included on additional pages. List export uses the same activity colors and filter header.


### Tratador and today's cattle feeding

`accounts.0012` adds `User.role=feeder` (Tratador). Existing assignments remain
unchanged. Administrators configure the role in Settings → Membros, where the
role information button explains the four roles. The feeder scope currently
supports **bovinos only**; member writes normalize crops to false and remove
other species. An empty scope grants no herd access. `operator_read_only`
blocks operational writes for this role too.

The JWT request gate uses an explicit feeder allowlist: own account,
notifications, support, role options, organization identity (GET), and
`/livestock/cattle/daily-feeding/` when Bovinos is authorized. It denies finance,
stock administration, planning, reports, other livestock resources, agenda and
member management. This is enforced server-side, independently of navigation.

`GET /api/v1/livestock/cattle/daily-feeding/` returns `{date, results}` for today's
active, effective plans and active batches within the organization. Rows expose
farm, batch, current pasture, current head count, product, current daily target,
today's supplied quantity, trough forecast and today's audited deliveries.
They deliberately contain no costs or stock prices. Daily target and supplied
quantity are distinct from measured consumption; no historical target is
inferred. A day without a delivery does not necessarily need replenishment.

`POST` accepts `plan`, `date`, `quantity_kg`, `remaining_before_kg`, `request_key`
(UUID), and optional `notes`. Administrators, managers and authorized writable
feeders can post. It reuses `deliver_feed`: today only, locks, current plan
validation, tenant checks, stock ledger, operator attribution, quantity/head
snapshots, and idempotency. The response contains only `id`, `date` and
`quantity_kg`. No direct stock balance update or extra financial title occurs.
The page is `/home/rebanho/bovinos/racao/tratos`, linked from cattle nutrition;
feeders enter directly here and receive a dedicated sidebar entry.


### Dairy landing indicators

`GET /api/v1/livestock/cattle/dairy-overview/?date=YYYY-MM-DD&farm=UUID`
returns daily produced/discarded/usable liters, distinct milked cows and the
average production per **cow with an actual milking record**, plus current
identified active cattle counts: lactating females, cows/matrices, non-lactating
cows, young females and bulls. Date defaults to today and cannot be future.
The selected date filters milk records, not current herd counts (`herd_as_of`).
All queries remain organization/farm scoped; no estimated revenue or price is
inferred. Counts use the shared bovine registry, not a separate dairy herd.
Zero milk records return zero volumes and a null average.

`GET /livestock/cattle/animals/?young_females=true` limits the existing authorized
queryset to females categorized Bezerro or Novilha. The dairy home shortcut
opens `/home/rebanho/bovinos/cadastro?group=young-females`; CSV export preserves
this filter. The dairy landing uses existing milk, reproduction, health, feeding,
feed factory and report routes. Milk tank management remains explicitly planned.


### Dairy animal list and optional bovine name

The dairy registry is `/home/rebanho/bovinos/pecuaria-leiteira/animais`.
It reuses the cattle endpoints and permissions, with a compact table without
photos and category counts matching the active farm/search/status filters.
The displayed herd remains the shared bovine registry; this UI change does not
classify existing animals by productive purpose.

`CattleAnimalProfile.name` (livestock.0037) stores an optional 100-character name,
separate from `Animal.identifier`. Cattle animal GET/POST/PATCH exposes `name`;
legacy animals return an empty string. Name writes preserve lactation and other
profile state. The explicit organization export/recovery inventory includes it.
The generic swine serializer and shared Animal model remain unchanged.

`GET /livestock/cattle/animals/category-counts/` returns `all`, `cows` (female
Vaca/Matriz), `heifers` (female Novilha), `calves` (female Bezerro), and `bulls`
(male Touro/Reprodutor). Counts ignore pagination and `dairy_category`, while
honoring authorized queryset, farm, search, status, withdrawal and young_females.
`GET /livestock/cattle/animals/?dairy_category=all|cows|heifers|calves|bulls`
filters the paginated list. Invalid groups return 400. Search includes identifier,
optional bovine name, batch code and batch name. CSV export preserves the group.
A female may display both pregnancy and lactation badges; dry status is not
inferred merely from the absence of a lactation flag.

### Structured bovine registration and reproduction phases

livestock.0039 adds optional cattle-profile fields: `coat_color`, positive
`birth_weight_kg`, `genealogical_registration`, `dairy_aptitude`, `beef_aptitude`,
`embryo_role` (blank/donor/recipient), `historical_birth_count` and
`historical_last_birth_date`. Historical births are declared baseline data,
separate from `Animal.birth_count`; they create no Mating, Pregnancy or Birth.
Male animals cannot receive maternal history/embryo roles. Dates cannot be in
the future or precede the animal's birth. Aptitude flags are metadata, not the
productive-purpose classification or an automatic separation of existing herds.
`initial_weaning_date` is creation-only declared history; later weaning uses the
existing record-event command. Cattle registration/editing uses responsive
sections without photos and preserves the existing authorization rules.

Cattle GET exposes read-only `last_mating_date`, `expected_birth_date` and
`gestation_days` from actual reproductive records, through queryset annotations.
`GET /livestock/cattle/animals/reproduction-summary/` returns active-animal counts
`females`, `heifers`, `cows`, `pregnant`, `lactating`, `dry` and the legacy
`open`/`covered`/`suckling`/`calves` groups, scoped
by organization and normal farm/search filters, independent of pagination and
the chosen reproduction_group. `reproduction_group` on the animal list accepts
all/heifers/cows/pregnant/lactating/dry, plus the legacy groups; invalid values
return 400. Heifers include all female Novilha records; cows include Vaca/Matriz.
Dry cows require descanso status or a recorded dry-off and no current lactation;
absence of lactation alone does not classify an empty cow as dry.
The legacy open group includes non-lactating Vaca/Matriz
without coverage/pregnancy; calves include both sexes without recorded weaning.
Pregnancy and suckling may overlap. Cattle and swine share reproduction header, phase cards/tabs, KPIs and the
ReproducaoTabContent/DataTable presentation. Cattle uses server pagination and
search without collecting the entire herd into the browser. Phase IDs persist
in `tab`; `production=dairy|beef` supplies the navigation context, not a new data
classification. Existing bovine commands remain authoritative for each action.

### Cattle feeding and independent trough readings

Feeding uses the existing FormulaRacao → production → ItemEstoque / LoteEstoque
and ConsumoRacao flow. Feeding plans and manual headcount adjustments are not
part of the producer workflow. The former herd-movements endpoint and new batch
history/cost shortcuts were removed. Operational entry, birth, death, transfer
and sale commands continue to update herd quantity; raw quantity edits remain
blocked. Existing events and legacy plan/delivery data are preserved.

`GET /livestock/cattle/daily-feeding/` lists active cattle batches with today's
feed records, formula options (id/name/final product) and eligible feed products
(id/name), without prices or estimated feeding targets. POST accepts `batch`,
optional `formula` and/or `item`, today's `date`, positive `quantity_kg`, UUID
`request_key` and optional `notes`. A formula must be active, belong to the same
organization and have a final product; this command does not manufacture feed.
The product must match the formula when both are provided. The existing cattle
consumption service creates one ConsumoRacao and the normal stock ledger
movements, atomically. Retries with the same batch/key and matching input return
the original record. Only this mutation records its operational event; GET does
not append operational history or audit entries. Manager/admin/Tratador access
and read-only restrictions are preserved, without exposing financial data.

Both direct cattle consumption and daily feeding block expired/inactive stock
lots or lots received after the start of the recorded period. Validity through
the last consumption date is required; expiry-today and undated lots are allowed.
Selection uses earliest expiry, with undated lots last. Insufficient eligible
stock rolls back every effect. For historical periods this is deliberately
conservative because there is no per-day consumption allocation.

`GET/POST /livestock/cattle/trough-readings/` is manager/admin only. GET is
paginated and accepts farm/batch filters. POST accepts `batch`, optional active
bovine `formula`, today's `date`, `session` (morning/afternoon/evening), `score`
0–4 (empty/traces/thin layer/moderate leftovers/high leftovers), optional
nonnegative `remaining_kg`, UUID `request_key` and optional `notes`. The reading
snapshots formula name, current headcount and author. It requires no plan or
stock, creates no feeding/financial/stock movement and does not convert the
visual score into kg or a feeding recommendation. Identical retries have one
effect; GET generates no alteration history.

livestock.0040 adds batch/formula references to readings, backfills the batch
from existing protected plan references, and preserves original legacy fields.
The explicit export/recovery registry includes the new references. The former
feed-plans endpoints are read-only archival endpoints: creation, revision and
new delivery commands are disabled; no producer screens use them. No applied
migration or historical operational data is deleted.


## Milk production entries

`GET /livestock/cattle/milk/day-summary/?date=YYYY-MM-DD&farm=UUID` returns
scoped daily volumes, current eligible cow count and pending individual entries.
`GET /livestock/cattle/milk/cows/` accepts the same scope plus `search`,
`entry_status=pending|recorded|total`, `page` and `page_size`. Cows currently in
lactation and cows with an existing record on the requested date are included;
this is not a historical herd census. Existing individual `/cattle/milk/` entries
remain unique by animal/date/session, retain withdrawal/discard checks and are
corrected with PATCH rather than another POST.

`/livestock/cattle/milk-totals/` provides tenant-scoped daily aggregate CRUD and
filters by farm/date. Livestock migration 0041 adds CattleMilkDailyTotal with one
positive-volume record per farm/date and validated discard/reason fields. Both
entry paths lock the farm during save and reject mixing aggregate and individual
entries on that farm/date. Aggregate volumes participate in monthly cattle and
daily dairy summaries, but have no invented cow allocation: milked count, per-cow
mean and individual pending count are null whenever the selected scope includes
an aggregate. Individual and aggregate history remain distinct. Operator species,
read-only, ownership and manager deletion rules remain in force.

## Bovine operational improvements — 2026-11-01

The eight approved improvements are exposed through the existing bovine pages
and `/home/rebanho/bovinos/operacoes` (Central de manejo). No feeding-plan or
manual headcount-adjustment operation was reintroduced.

### Productive purpose

Animals and batches expose `cattle_purpose=unknown|beef|dairy|dual` through cattle
serializers. `production=beef|dairy` includes dual-purpose participants; `unknown`
is an explicit review queue. The general census still counts participants once.
Existing records are migrated to unknown, never inferred from lactation or breed.
Purpose changes create CattlePurposeChange with before/after, date and author.
Batch classification explicitly includes its active identified participants;
the confirmation form states this. Individual purpose cannot diverge from its
linked batch, preventing inconsistent segment counts.
Historical operational records are preserved; purpose filters describe the
current cohort rather than a reconstructed historical herd. Dairy herd counts
and new pending-milking lists use dairy/dual classification. Existing individual
milk records remain accessible even after classification or lactation changes.

### Operations API

`/livestock/cattle/operations/<kind>/` uses CattlePermission and keeps tenant
and bovine species scope. GET collections are paginated (default 10, max 100).
GET `members` returns only active organization IDs/names (operators see themselves).

| Kind | Method | Behavior |
|---|---|---|
| `purpose-history` | GET | Classification changes, optionally by farm |
| `classify` | POST | Manager/admin classification of explicit animal/batch IDs |
| `transfers` | GET/POST | Preview or confirm an explicit same-farm batch transfer |
| `move-pasture` | POST | Preview or atomically close/open a batch pasture occupation |
| `occurrences` | GET/POST | Occurrence with member, due date and existing Agenda Task |
| `resolve-occurrence` | POST | Authored resolution and task completion together |
| `import-preview` | POST | Per-line validation without database writes |
| `import-confirm` | POST | All-or-nothing revalidation/import, max 500 animals |
| `protocols` | GET/POST | Immutable template versions with relative-day steps |
| `protocol-runs` | GET | Animal execution and step history |
| `start-protocol` | POST | Snapshot selected version and generate agenda tasks |
| `execute-step` | POST | Real execution date, note, optional semen origin/mating |
| `matings` | GET | Authorized bovine mating choices, optionally by animal |
| `stock-lots` | GET | Product/lot/unit/balance options; `category=semen` for reproduction |
| `milk-trends` | GET | Bounded daily series, session totals and configurable drop flag |
| `costs` | GET | Manager/admin operational cost sources and separate financial expenses |

Transfers require date=today, compatible category/sex/purpose and exact identified
participants when the origin contains identities. Source/destination are locked
and reconciled together. Confirmations require expected source/destination counts
from the preview and a UUID request_key. Retries reuse the committed result;
changed payloads or stale counts are rejected. Pasture changes similarly bind
expected_source to the previous occupation and preserve a request-key history.
Acquisition value is proportionally transferred when known, without creating a
new financial expense. No generic quantity editing is enabled.

Imports use an explicit field whitelist and the normal cattle serializer; purchase
or unrelated operational columns are rejected. CSV templates and parsing are
provided by the service/UI. Reimporting an existing identifier is rejected, not
silently overwritten. Operators do not import, classify or transfer.

Occurrences and protocol stages reuse Agenda tasks. Operators may assign only
themselves and execute only their own/assigned operations, with read-only access
respected. Generated tasks expose operational_link and must be completed
through their source workflow; direct deletion is blocked, preventing
agenda/operational divergence.
Protocols do not fabricate matings, diagnoses or births. Optional semen
consumption requires a matching animal/date mating, eligible physical lot,
positive quantity in the stock unit and an idempotent step execution.

### Sanitary stock integration and costs

CattleManagement accepts optional inventory_lot and
inventory_quantity_per_animal. Quantity uses the item's stock unit, explicitly
shown in the form. Confirmation validates species, category, expiry, entry date,
balance and configured withdrawal periods. It creates one normal stock movement,
snapshots material cost and links generated HealthRecords to the management.
Service/additional cost_per_animal is separate from the consumed material.
Reports keep a known service cost even if the material price is unknown, showing
the material origin as pending instead of hiding the known portion.
Confirmation retries do not consume again. Milk/meat withdrawal checks remain.

Cost reports aggregate known feed, collective sanitary, individual treatment,
vaccination and protocol semen origins once. Generated collective HealthRecords
are excluded as duplicate representations of the same application. Financial
expenses are shown separately by due date and never added again to operational
stock consumption. Missing source prices are counted as pending, not invented. Equal per-participant
allocations distribute residual cents deterministically by participant ID, so
splitting a cohort cannot multiply or lose cents. Monetary report values use
decimal strings.
Batch/purpose filters use current participant registration, clearly stated in the
report; this is not a complete retrospective allocation or a profit/DRE engine.

Milk trends accept start/end (max 366 days), farm, animal and drop_percent (1–100).
Only recorded dates appear; absent days are not zero production. A drop flag
compares consecutive recorded past calendar days and warns to check missing turns.
Daily aggregate volumes are never distributed artificially by animal or session.

Migrations: 0042 adds purpose, operational records and stock origins; 0043 links
legacy collective HealthRecords only when an exact, unambiguous match exists.
All new schema is explicitly registered for tenant-safe export/restore.

### Collective cattle launches and lot result

Cattle batch detail routes retain tenant, purpose and farm scope. No schema
migration is required: launches use the existing operational ledger.

- `POST batches/{id}/registrar-mortalidade/`: `date`, `quantity`, `reason`, UUID
  `request_key`. Locks the batch, rejects future/pre-entry dates and identified
  participants, reduces heads and records author/cause once. A final mortality
  after partial sales closes as finished without a fabricated sale/revenue.
- `POST batches/{id}/record-treatment/`: collective `quantity`, `date`,
  `description`, optional `inventory_lot`, `quantity_per_head` in stock units,
  total external `service_cost`, UUID `request_key`. Checks tenant, species,
  receipt, expiry and stock; records one movement, material cost and configured
  meat withdrawal. Sales during withdrawal are rejected. Identified animals
  retain the existing management flow.
- `POST batches/{id}/record-cost/` (manager/admin): date, category
  (`sanitary`, `pasture`, `labor`, `freight`, `other`), description, positive total
  amount, UUID request_key. Explicit external cost appropriation, not a stock
  adjustment/payment. Do not repeat acquisitions, consumption or sale discounts.
- `GET batches/{id}/economic-result/` (manager/admin): acquisition + known
  operational origins + additional appropriations, gross/net sales, discounts,
  partial result/margin, cost/result per sold head, mortality, head reconciliation
  and weighing intervals/GMD. Financial expenses are not added twice. Missing
  costs and transferred cohorts are qualified. Carcass arrobas/cost require sale
  carcass data or explicit query `yield_percent`; estimates do not rewrite sales.
  This is a partial economic result, not net profit or cash balance.
- Cattle-only `register-sale` accepts `pricing_basis` (`live_kg` default or
  `carcass_arroba`), live total kg, corresponding price and measured carcass kg or
  yield percent for carcass pricing. Arroba = 15 kg carcass. Conversions retain
  decimal precision; monetary totals round to cents. Deductions require a
  description; `slaughter_reference` stores a romaneio reference. Net revenue
  remains pending until receipt. Swine payload behavior is preserved.
- `change-phase` accepts explicit category confirmation and records category
  changes with author rather than guessing from weight.
- New cattle batches accept `purchase_due_date`; operational saves preserve an
  existing cattle purchase payable's amount and negotiated due date. Existing
  payables are corrected through the normal authorized finance flow.

Bovine feed choices include `nucleo` (Suplementos), `suplemento` and `racao` in kg.
Stock receipt inputs accept non-future `data_entrada` for a new receipt lot,
independent of purchase_due_date. Existing lot chronology cannot be silently
backdated. FEFO, expiry and consumption chronology remain enforced. Dashboard
cash KPIs are labeled explicitly and the sum of all segment costs is separate.
