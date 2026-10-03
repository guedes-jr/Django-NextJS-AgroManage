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

## Tenant roles and operational writes

Role codes stay stable (`owner`, `admin`, `manager`, `operator`, `viewer`);
user role labels and member `role_display` are Portuguese.

| Cargo | Consulta | Criar categorias/registros | Editar | Excluir | Gerenciar usuários |
| --- | --- | --- | --- | --- | --- |
| Proprietário | Sim | Sim | Sim | Sim | Sim |
| Administrador | Sim | Sim | Sim | Sim | Sim, sem atribuir proprietário/administrador |
| Gerente | Sim | Sim | Sim | Sim | Não |
| Operador | Sim | Sim | Não | Não | Não |
| Visualizador | Sim | Não | Não | Não | Não |

`OrganizationRolePermission` enforces this matrix for finance, farms, inventory,
crops, livestock, tasks and organization contacts/addresses. Appending operational
events (weighing, vaccination, births, feed consumption) remains allowed for operators;
PUT/PATCH and deletion, including POST bulk deletion, are blocked. Supplier image
replacement and lot merging are edits; sow discard is a removal. Tenant filtering
is unchanged. Personal profile/preferences and personal notification confirmation
continue to use their existing self-service permissions.
Member changes use `/auth/members/<uuid>/`: only owners/admins manage users, only
owners assign/change owner/admin roles, and users cannot change their own role,
deactivate themselves or remove themselves. Saving an unchanged admin role alongside
profile fields is allowed. Apply accounts migration `0005_alter_user_role` for the
translated role choices; persisted role codes do not change.
