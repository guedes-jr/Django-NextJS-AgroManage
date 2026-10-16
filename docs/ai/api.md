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
An active Celery worker is required to prepare and deliver the campaign.
Delivered unread campaign notifications appear as a persistent banner throughout
the tenant home area. Acknowledging the banner marks that notification as read.
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
