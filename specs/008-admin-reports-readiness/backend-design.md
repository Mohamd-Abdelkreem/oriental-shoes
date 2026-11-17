# P08 backend operation blueprints

Design readiness only. All administration files/symbols below are proposed; reused
owners are explicitly labelled existing. No routes, schema changes, tests or release
operations were executed while writing this design. The canonical wire fields live
in [contracts/administration.md](contracts/administration.md), durable changes in
[data-model.md](data-model.md), and frontend behavior in
[frontend-design.md](frontend-design.md). This document owns algorithms and interfaces,
not a second set of wire definitions.

## B01 — Authority, composition and read transaction

Requirements: FR-001–004/023–024. Create API module
`apps/api/src/modules/administration/` with `administration.routes.ts`,
`administration.controller.ts`, `administration.service.ts`,
`administration.queries.ts`, `administration.mapper.ts`, `administration.rules.ts`,
`administration.types.ts`, `administration.errors.ts`,
`administration-command-executor.ts`, `administration-command.writer.ts`,
`administration-report.queries.ts`, `administration-activity.queries.ts`,
`dto/administration-read.dto.ts`, `dto/administration-command.dto.ts`, `index.ts`.
Each query/writer file has the distinct complex read/write responsibility named here;
do not add repositories, generic base services, queues or empty wrapper files.

Proposed constructor/method ledger, with request/result types imported from the
contract owner. Every method returns `Promise` of its named data type:

```ts
type AdministrationCalendar = Readonly<{
  businessTimeZone: string | null;
  now: () => Date;
}>;
class AdministrationService {
  constructor(
    database: DatabaseClient,
    commands: AdministrationCommandExecutor,
    calendar: AdministrationCalendar,
  );
  dashboard(
    actorId: string,
    query: AdministrationDashboardQuery,
  ): Promise<AdministrationDashboardData>;
  filterOptions(
    actorId: string,
    query: AdministrationFilterOptionsQuery,
  ): Promise<AdministrationFilterOptionsData>;
  listOrders(
    actorId: string,
    query: AdministrationOrdersQuery,
  ): Promise<AdministrationOrdersData>;
  getOrder(actorId: string, orderId: string): Promise<AdministrationOrderData>;
  approvals(
    actorId: string,
    query: AdministrationApprovalsQuery,
  ): Promise<AdministrationApprovalsData>;
  corrections(
    actorId: string,
    query: AdministrationCorrectionsQuery,
  ): Promise<AdministrationCorrectionsData>;
  deliveryExceptions(
    actorId: string,
    query: AdministrationDeliveryExceptionsQuery,
  ): Promise<AdministrationDeliveryExceptionsData>;
  activity(
    actorId: string,
    query: AdministrationActivityQuery,
  ): Promise<AdministrationActivityData>;
  orderHistory(
    actorId: string,
    orderId: string,
    query: AdministrationOrderHistoryQuery,
  ): Promise<AdministrationActivityData>;
  report(
    actorId: string,
    query: AdministrationReportQuery,
  ): Promise<AdministrationReportData>;
  printReport(
    actorId: string,
    query: AdministrationReportPrintQuery,
  ): Promise<AdministrationReportPrintData>;
  execute(
    actorId: string,
    body: AdministrationCommandBody,
  ): Promise<AdministrationCommandData>;
  observe(
    actorId: string,
    commandId: string,
  ): Promise<AdministrationCommandData>;
}
class AdministrationCommandExecutor {
  constructor(database: DatabaseClient, now: () => Date);
  execute(
    input: Readonly<{ actorId: string; body: AdministrationCommandBody }>,
  ): Promise<AdministrationCommandData>;
  observe(
    actorId: string,
    commandId: string,
  ): Promise<AdministrationCommandData>;
}
```

Internal proposed type ledger in `administration.types.ts` (all referenced helpers
below use these exact types rather than anonymous unresolved payloads):

```ts
type AdministrationObservation = Readonly<{
  generatedAt: Date;
  businessTimeZone: string | null;
  businessDate: DateOnlyString | null;
}>;
type AdministrationResolvedPeriod = Readonly<{
  timeZone: string;
  businessDate: DateOnlyString;
  effectiveFrom: DateOnlyString | null;
  effectiveTo: DateOnlyString | null;
}>;
type AdministrationRootRecord = Prisma.SalesDraftGetPayload<{
  select: typeof ADMINISTRATION_ORDER_SELECT;
}>;
type AdministrationAggregateFacts = Readonly<{
  original: number;
  cancelled: number;
  active: number;
  received: number;
  completionPercent: number;
  currentDepartments: readonly (
    "CUTTING" | "PRODUCTION" | "QUALITY" | "WAREHOUSE"
  )[];
  isOverdue: boolean;
  hasQualityCorrectionHistory: boolean;
  hasOpenQualityCorrection: boolean;
}>;
type AdministrationCancellationPlan = Readonly<{
  body: Extract<AdministrationCommandBody, { operation: "ADMIN_CANCEL" }>;
  reason: string;
  before: AdministrationCommandFacts;
  after: AdministrationCommandFacts;
  result: AdministrationCommandData["result"];
}>;
type AdministrationCorrectionPlan = Readonly<{
  body: Extract<AdministrationCommandBody, { operation: "ADMIN_CORRECT" }>;
  reason: string;
  changedFields: readonly (keyof AdministrationCorrectionValues)[];
  before: AdministrationCommandFacts;
  after: AdministrationCommandFacts;
  result: AdministrationCommandData["result"];
}>;
type AdministrationCancellationPlanInput = Readonly<{
  root: AdministrationRootRecord;
  body: AdministrationCancellationPlan["body"];
  actor: AuthorityAccount;
  occurredAt: Date;
}>;
type AdministrationCorrectionPlanInput = Readonly<{
  root: AdministrationRootRecord;
  effective: AdministrationCorrectionValues;
  body: AdministrationCorrectionPlan["body"];
  actor: AuthorityAccount;
  occurredAt: Date;
}>;
```

`ADMINISTRATION_ORDER_SELECT` is a proposed explicit select constant in
administration.mapper: compose existing SALES_ORDER_SELECT, retaining all its fields,
and add selected physical `currentWorkVisitId`, current issue identity/state/proposal,
latest correction complete contacts/version, OPEN quality-cycle IDs, open quality visit
IDs and latest warehouse attempt/outcome/retry/member IDs. Every relation is bounded
to current/latest records or the accepted <=200 physical pieces; never include full
historical relation trees in a command/detail. Internal helpers accept this selected
record, not an unbounded Prisma model or unknown object.
Select the latest attempt through order.warehouseCommandOrders with attempt isNot null,
orderBy afterVersion desc and take1; select its attempt identity, member piece IDs,
actual outcome kind/returnedToWarehouse and retry identity. Select the original
APPROVE_INITIAL command with take1 and APPROVAL_STAMP_SELECT from approval.queries;
mapApprovalStamp and getApprovalPrintEligibility own canPrint, including current
held proposal blockers. Select only currentIssue id/state/latestProposalId/resumeTarget
per piece, open quality visit IDs and OPEN quality correction IDs (take1 each).
The latest administrationCorrections select includes complete four contacts,
afterVersion/commandId and retained command actor/reason/time/changedFields needed by
B04/T020; no original snapshot mutation. Use a type-only typeof select import in
types.ts. Pure mapAdministrationCommandFacts(root) lives in administration.rules,
using deriveSalesOrderFinancialFacts/effectiveOrderContact/shared facts validation;
mapper may import pure eligibility rules, while rules has no runtime mapper import.
This avoids a mapper/rules runtime dependency cycle. ADMINISTRATION_ORDER_SELECT
and mapAdministrationOrderSummary remain in administration.mapper.
Complete before/after wire
facts come from the shared `AdministrationCommandFacts` contract schema.

`AdministrationController` constructor accepts AdministrationService; named arrow
handlers have the same method names, read `request.validated` and `request.user.id`,
call one service method and `ResponseHelper.ok`. `administrationRoutes` and
`administrationCommandRoutes` each accept `(controller: AdministrationController,
authentication: RequestHandler): Router`. Mount precisely as the contract route table
in existing `apps/api/src/router.ts`, exported through current module index. Construct
one executor/service/controller at composition with `orderConfig.businessTimeZone`
and `now:()=>new Date()`. No module import starts a process or captures a stale clock.
Extend existing OpenAPI registration with exactly these shared request/response shapes.
The existing infrastructure/openapi/openapi.test.ts exact path inventory is a
required integration owner: add only the 13 canonical administration paths and
verify exact GET/POST/security/query/body/status ledgers against registered routes;
preserve every existing expected path and domain assertion.

Read algorithm:

1. Existing business-authentication middleware, role-only ADMIN allowlist and shared
   strict validation run in documented route order. Services do not trust them alone.
2. Service read helper opens existing database `$transaction`, isolation RepeatableRead,
   maxWait5000ms/timeout10000ms; `set_config('lock_timeout','5000ms',true)` and
   `set_config('statement_timeout','8000ms',true)` bound DB work.
3. Existing `lockAccountRows(tx,[actorId],'read')`, `loadIdentityAccount`,
   `assertBusinessAuthority(actor)`, then require actor.role===ADMIN using existing
   ForbiddenException. Shared actor lock serializes suspension/role changes with the
   read. Missing credential/identity keeps existing401 behavior; restricted403.
4. Capture `calendar.now()` once within this attempt after authority; validate finite
   instant. Calendar-dependent reads resolve accepted explicit IANA config; pure
   detail/history/command recovery do not invent a calendar prerequisite.
5. Use one tx for rows/counts/sections and explicit select/schema projection. Return
   parsed canonical query echo. Retry the whole read once only for recognized existing
   sales transaction conflict predicate; lock timeout or second conflict becomes
   AdministrationTransactionConflictError409. No blanket DB error retry or zero fallback.

Existing request body limit remains `appConfig.bodyLimit`, default BODY_LIMIT=1mb.
New command schema additionally enforces UTF-8 serialized intent <=65536 bytes;
400 VALIDATION_ERROR on schema excess, existing payload-too-large middleware behavior
on global parser excess. No report uses a POST body. Read/output guards are B05,
not changes to global auth/transport/body settings. New errors remain module-local
AppError subclasses with exact contract codes/statuses; unexpected DB errors go to
existing safe internal-error/logging owner, no raw diagnostic in response.

## B02 — Common cohort, exact counts and business calendar

Requirements: FR-004–006/017–018. Proposed query exports:

- `resolveAdministrationPeriod(input: AdministrationOrderFilters, instant: Date,
timeZone: string|null): AdministrationResolvedPeriod` in administration.rules;
- `administrationCohortSql(input: {query: AdministrationOrderFilters;
period: AdministrationResolvedPeriod}): Prisma.Sql` in administration.queries;
- `findAdministrationOrders(tx,actor,query,observation): Promise<AdministrationOrdersData>`;
- `administrationPhysicalFactsSql(): Prisma.Sql` in administration.queries;
- `mapAdministrationOrderSummary(record, actor, facts): AdministrationOrderSummary`
  in administration.mapper. Types are explicit selected records/inferred outputs.

The mapper's exact parameters are `(record:AdministrationSummaryRecord,
actor:AuthorityAccount,facts:AdministrationAggregateFacts)`;
AdministrationSummaryRecord is the payload of proposed ADMINISTRATION_SUMMARY_SELECT
in administration.mapper: preserve ADMINISTRATION_ORDER_SELECT's root/header
selection, replace pieces with SALES_ORDER_FINANCIAL_SELECT.pieces plus bounded
orderPiece current issue/work/quality metadata needed for eligibility; omit complete
specification/catalog fields. Complete detail/commands keep ADMINISTRATION_ORDER_SELECT.
The summary mapper accepts either this minimal record or the structurally wider full
record. Extract existing sales-order header/summary fields from mapSalesOrder into
mapSalesOrderHeader(record:SalesOrderHeaderRecord,actor) in sales-orders.mapper,
where SalesOrderHeaderRecord replaces only SalesOrderRecord.pieces with financial
selected pieces. mapSalesOrder and mapSalesOrderSummary reuse it; summary must no
longer map full physical specifications. No submitted/draft field policy changes.
Generalize the pure cancellation eligibility input to its actual structural needs:
status, selected order header/latest attempt, pieces with physical stage/cancelledAt.
T018 owns this bounded projection correction; existing callers remain source-compatible.
the record must have a
real submitted header, otherwise this mapper fails internally rather than fabricate
a summary. Draft mapper is the separately discriminated existing owner.

`AdministrationResolvedPeriod` = `{timeZone,businessDate,effectiveFrom,effectiveTo}`,
using date-only strings or null endpoints. Existing `parseOrderBusinessTimeZone`,
`isDateOnlyString`, `parseDateOnly`, `serializeDateOnly` own config/date parsing. Use
Intl.DateTimeFormat with explicit zone, gregory calendar and latn digits to derive
today from the captured instant. Date arithmetic changes the calendar Y/M/D through
UTC date-only helpers; it is not elapsed24h arithmetic.

Parsed report screen query defaults period MONTH; direct report-print query defaults
ALL, preserving the existing direct URL behavior. Links opened by the screen include
its explicit resolved period/from/to, so the screen and its print request agree.

SQL date predicate uses bound values and fixed SQL: `d.created_at >=
(${from}::date::timestamp AT TIME ZONE ${timeZone})` and
`d.created_at < (((${to}::date + 1)::timestamp) AT TIME ZONE ${timeZone})`.
Open endpoints omit only that predicate. This obtains each real midnight independently
and remains correct across DST23/25-hour days; do not append UTC Z to local midnight,
add24h to an instant or read host offset. Validate effective from<=to before query.

Canonical CTE aliases: `d` sales_drafts, `h` sales_orders, `p` sales_order_pieces,
`c` latest administration correction. Start from all retained root IDs, left join
submitted header, and lateral select latest correction contacts by version. Apply
parameterized literal search (`%`, `_`, backslash escaped), type/status/owner/date
predicates and current-piece EXISTS before paging. No client SQL identifier or label
is interpolated. Department means current active operational location, excluding
pieces currently with courier/delivered even though P07 stores their physical stage
as WAREHOUSE; failed returned custody is WAREHOUSE. Approval/quality holds retain
their actual source department and are not employee assignments.

Aggregate physical facts by order_id in SQL once: original=count physical rows;
cancelled=count stage CANCELLED; active=original-cancelled;
received=count noncancelled received_at nonnull. Use the existing
`deriveOrderCounts` rounding meaning:0 for zero-active,100 iff received=active,
otherwise min99 round ratio. Drafts have zero physical counts, not invented pieces.
Row counts use distinct root population, not joined piece cardinality. List totalPieces
is original physical rows for submitted roots and existing retained draft rows for
draft roots; report originalPieces is physical submitted rows only, clearly labelled.

Overdue: promised delivery date strictly before businessDate, excluding ready,
out-for-delivery, failed/awaiting-retry, delivered or cancelled custody. Missing/equal
date is false. Do not label an already received ready order manufacturing-overdue.
The same SQL predicate powers dashboard, list exception, report and count queries.
Partially cancelled means cancelled>0 AND active>0. READY and DELIVERED predicates
match exact current status plus required real eligibility, never fuzzy Arabic string.

Map money with existing `deriveSalesOrderFinancialFacts`, `calculateOrderMoney`,
`parseMoneyCents`, `formatMoneyCents` and Decimal serializer; no JS floating arithmetic.
Use finite record pages (limit<=100), selected relation rows bounded by200 physical
pieces per detail. List summaries aggregate without loading every specification.
Pagination order createdAt DESC,id DESC. SQL count/rows share the tx/cohort; count0
means0 pages, out-of-range items empty with actual metadata. No Promise.all on a
single tx is described as concurrent database work.

## B03 — Dashboard and read-only oversight

Requirements: FR-002–006/017/023. Proposed exports in administration.queries:
`findAdministrationDashboard`, `findAdministrationApprovals`,
`findAdministrationCorrections`, `findAdministrationDeliveryExceptions`,
`findAdministrationFilterOptions`. Every signature begins
`(tx:Prisma.TransactionClient,actor:AuthorityAccount,query:Q,
observation:AdministrationObservation):Promise<R>` with these fixed Q/R bindings:

| Query function                       | Q                                     | R                                    |
| ------------------------------------ | ------------------------------------- | ------------------------------------ |
| findAdministrationDashboard          | AdministrationDashboardQuery          | AdministrationDashboardData          |
| findAdministrationApprovals          | AdministrationApprovalsQuery          | AdministrationApprovalsData          |
| findAdministrationCorrections        | AdministrationCorrectionsQuery        | AdministrationCorrectionsData        |
| findAdministrationDeliveryExceptions | AdministrationDeliveryExceptionsQuery | AdministrationDeliveryExceptionsData |
| findAdministrationFilterOptions      | AdministrationFilterOptionsQuery      | AdministrationFilterOptionsData      |

Q/R here document each concrete signature, not a generic public query framework.
Observation contains
captured generatedAt and resolved business date/timezone. They assume B01 authority,
also assert ADMIN at entry to prevent accidental reuse by an unscoped caller.

Dashboard performs bounded aggregate queries for named fields from the contract.
activeOrders preserves the existing all-root behavior: drafts count alongside
nonterminal submitted orders; delivered/fully cancelled submitted roots do not.
Physical quantities remain submitted-only, never turn draft rows into factory pieces.
activeCorrections counts OPEN quality-cycle rows for the existing nav badge;
openCorrectionOrders is distinct OPEN-cycle orders for the dashboard attention card.
Corrections page tab counts are cycles, activePieces distinct
pieces. Delivery-exception dashboard/count headline is distinct orders in the union,
never sum overlapping categories. PendingUsers reuses P01 pending review predicate
(verified pending approval), no fixture employees. counts.totalOrders counts all
retained roots for View All; recentOrders<=5 uses the same all-orders mixed union
sorted actual updatedAt DESC,id DESC. Each physical quantity subtitle uses server
counts.activePieces/pendingApprovalPieces/overduePieces/readyPieces from the exact
corresponding order predicate, drafts zero; activePieces also supplies the current
operational total. Never derive them from recent5 or partial department rows.
Department buckets use current active location. Actual server
businessDate replaces DEMO_DATE_ISO. No whole-database fetch for dashboard cards.

Filter options use one distinct root-owner query, joined safe current user id/name/
nullable phone, sorted name/id; no secret/email/access-version output. Optional exact
legacy name resolution compares current label or retained submission owner name,
distinct owner IDs. Count before materialization, enforce5000 options/8MiB guard and
schema-validate explicit UNIQUE/MISSING/AMBIGUOUS response. It is independent of
workforce/current department filters; duplicate names never broaden a URL filter.

Approvals oversight: counts for PENDING(AWAITING_APPROVAL), RETURNED, APPROVED(actual
initial approval exists), ALL before tab restriction but after search. Retained initial
approval remains true through downstream/cancellation history. Existing P04 service
owns all approve/return/issue/reapproval mutations; this endpoint is read-only.

Corrections: select actual QualityCorrectionCycle, rejection QualityPieceEvent and
command time, order and physical row identity. ACTIVE=OPEN, RESOLVED=all other real
states, ALL union; search matches retained order/customer/model/reason/instructions.
No administrative contact change is a quality cycle. Count rows/cycles, separately
count distinct active pieces. Sort rejection time DESC,cycle ID DESC. Don't infer a
cycle from a segment/state flag or fabricate missing event dates.

For actual past-promise ready/dispatched/failed/retry exclusion fixtures, add optional deliveryDate:string|null=null
as the final argument to createApprovalOrderFixture, createManufacturingFixture and
createQualityFixture. Pass it unchanged through these existing fixture chains into
the actual initial submit capture. Existing arguments/defaults remain unchanged;
never overwrite a submitted order's delivery date or retained snapshot in setup.

Delivery exceptions: current FAILED, current dispatched, overdue; ALL distinct union,
search applied before tab counts. Retain owning warehouse detail links and never add
admin dispatch/confirm/fail/retry routes. A failed-return cancellation stays FAILED
until explicit warehouse retry (B07); refreshed labels/counters reflect that fact.

For each endpoint schema-parse its DTO, include canonical query context and return
actual empty/paged results. Denied access reveals no data; DB failure is a safe error,
not a successful empty array. Existing staff/customer APIs remain their current owners.

## B04 — Detail, effective fields and immutable activity

Requirements: FR-002–003/006/012–015/023. Proposed exports:
`findAdministrationOrder(tx,actor,orderId): Promise<AdministrationOrderData>` and
`findAdministrationActivity(tx,actor,query,orderId?): Promise<AdministrationActivityData>`.
Use existing `DRAFT_SELECT/mapDraft/getDraftReadiness` for read-only draft variants,
existing `SALES_ORDER_SELECT/mapSalesOrder` plus current domain tracking for submitted
detail. Missing root is ORDER_NOT_FOUND404; ADMIN can read known permitted roots,
ordinary staff never reach this service. Do not call a customer service with a fake
sales identity to get broader access.

Detail loads one root and <=200 retained pieces, latest correction, current issue/
quality blockers and latest warehouse attempt context in bounded batch queries.
Candidates show exact row identity/model/position/current state, received fact and
the same canCancel predicate as B07. canCorrect is any submitted root; draft false.
canPrint follows P04 current approval/pending-proposal block, and both official
aliases still use the existing authoritative endpoint. No historical copy/workflow
snapshot grants current official-print eligibility. Original first-submission notes
come from the first real SUBMIT_NEW_ORDER/SUBMIT_DRAFT command after snapshot;
absence/inconsistent historical records is an explicit internal defect, no made-up
signature/actor/contact. Factory/warehouse projections remain their allowlists.

Both detail variants include historyCount from the same merged-identity count query
used for actual history pagination in this tx. A draft is authorized by current ADMIN
plus existing SalesDraft.id; do not call P04 authorizeOrderHistory or another helper
requiring a submitted header. Its real CREATE_DRAFT/SAVE_DRAFT events count/render
under existing draft event schema; no submitted events are invented. Latest correction
metadata comes from its real linked AdministrationCommand selected safe actor/reason/
time and retained changedFields. Expose correction.lastCorrection as the canonical
nullable summary, not an ID-only field whose banner must guess actor/reason/time.

Existing `order-activity.queries.ts` `findOrderActivity` already merges and pages
sales/approval/manufacturing/quality/warehouse identities before mapping. Extend its
identity UNION with administration command ID/order/time/operation rather than
fetch each domain page1 and concatenate. Keep its existing signature and return
type `(tx,scope:OrderActivityScope,query:SalesOrderActivityQuery,orderId?:string):
Promise<SalesOrderActivityData>` for all current callers. Their new administration
member is always the strict `AdministrationOrderActivityEvent`, including when an
ADMIN calls existing sales/approval endpoints. `findSalesOrderActivity` and
`ApprovalService.orderHistory` retain their actual authority predicates and safe
response contract; role does not select a larger DTO.

Add this exact proposed export in the same existing order-activity.queries owner:

```ts
type AdministrationActivityReadInput = Readonly<{
  query: SalesOrderActivityQuery;
  orderId?: string;
  search?: string;
}>;
findAdministrationOrderActivity(
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  input: AdministrationActivityReadInput,
): Promise<Pick<AdministrationActivityData, "events" | "pagination">>;
```

This trusted export requires `assertBusinessAuthority(actor)` and ADMIN at entry,
uses the already locked/reloaded actor from B01, and fixes APPROVAL cross-order
scope internally. It is the only full administration projection entry point in
this shared owner; no query/body/header selects projection. The administrative
`findAdministrationActivity` wrapper validates root visibility for fixed history,
passes normalized page/limit/orderId/search to this export, and adds its own exact
endpoint context echo. It never substitutes the safe sales response as a full event.

Factor one private `readOrderActivityIdentityPage(tx,input)` with exact input
`{scope:OrderActivityScope,query:SalesOrderActivityQuery,orderId?:string,
search?:string,administrationProjection:"ORDER"|"ADMINISTRATION"}` and result
`{identities:readonly {eventId:string,occurredAt:Date,
kind:OrderActivityAction["kind"]}[],pagination:SalesOrderActivityData["pagination"]}`.
Only the two fixed exports above call it; the old export supplies ORDER and absent
search, the actor-checked export supplies ADMINISTRATION. Its <=100 identities are
counted/paged by one merged SQL source, then selected in bounded batches with
explicit safe/full source-specific JSON selectors and parsed by the matching union.
ORDER selects exactly the owner-safe administration keys from contract §5; it does
not fetch before/after/reason only to strip them. ADMINISTRATION selects full admin
event facts. Existing six non-administration event branches are unchanged. The
same private identity definition supplies detail historyCount in the same tx, with
no separate submitted-only authorization requirement for draft roots.
Keep action-row note/search mapping concrete: draft/order/manufacturing have null
notes; approval uses the existing approvalSummarySql notes CASE unchanged; quality
INSPECT uses inspectorNote, REPORT_ISSUES joins the original reason and optional
notes with " — ", other quality operations null. Warehouse RECEIVE uses receipt
notes, DISPATCH deliveryNote, FAIL_DELIVERY original reason plus optional notes with
" — ", RETRY_DELIVERY retry notes, CONFIRM_DELIVERY null. Administration full rows
use retained reason, owner-safe/operational rows never do. Omit null/empty join
members. F05's eventual presentation note must consume this same table; no arbitrary
before/after JSON or hidden contacts/money participate in search. The source kind
and operation remain real finite bound values.
mapAdministrationActions(record:AdministrationSummaryRecord) in administration.mapper
owns the existing print/cancel/correct hint composition, reused by summary/detail.
Detail must not manufacture aggregate flags merely to obtain these three actions.

Private `administrationOrderSummarySql:Prisma.Sql` and
`administrationFullSummarySql:Prisma.Sql` in this same owner use fixed aliases `c`
for administration_commands, `h` for sales_orders, and `correction` for the optional
administration_order_corrections row joined by commandId/orderId. Both project
retained actor columns, commandId/orderId/afterVersion/operation/occurredAt,
h.business_number and c.piece_ids. `changedFields` for correction is that exact
child's persisted sorted list; for cancellation it is sorted `cancellation` plus
status/total only if corresponding beforeFacts/afterFacts values differ. The safe
selector ends there. The full selector additionally projects c.reason and complete
c.before_facts/c.after_facts through the contract keys. Export only
`administrationOperationalSummarySql:Prisma.Sql` for department query reuse with
the same c/h aliases: select only the minimal operational keys, require
operation=ADMIN_CANCEL in each source predicate, and derive only beforeStatus/
afterStatus from the stored facts. This constant does not select reason,
changedFields or complete JSON; owning department authorization/relevance predicates
must run before mapping. Its source tables/order/source version are never inferred
from current physical membership.

Search preserves the reached action-label behavior in
`administration/screens/admin-activity-view.tsx`: current source tests event label,
order reference, actor and note. Import `findOrderActivityActions` from the proposed
single browser-safe label owner in contract §5. Once per nonblank normalized search,
resolve the finite matching `{kind,operation}` pairs; source identity rows carry
their real kind/operation, never a reconstructed event title. Filter the identity
UNION using one OR group of those bound pairs, literal escaped business number/
internal UUID/retained actor match, or the current projection's permitted note.
Apply that group and optional fixed orderId before both count and page. Empty pair
set does not disable the other search branches or broaden to all events. A label
shared across source kinds can match several genuine pairs (e.g. CONTINUE stays
kind-qualified); no API/web/SQL label copies or per-row JavaScript scan is needed.
Do not search hidden admin reason/contact/money in ORDER or operational projections.
ADMINISTRATION may search its displayed admin reason, not arbitrary before/after
JSON. Existing event note selectors preserve each branch's authorized note meaning.

Preserve qualityReportChildSql suppression so child approval issue reports don't
duplicate their quality parent. Order history applies its fixed visible root ID to
count and rows. Sort occurredAt DESC,eventId DESC,kind ASC consistently. Reuse
the owning constant selectors for the six current sources; the private note
predicate and eventual event projection must use the same permitted fields.

Existing factory/warehouse order histories get the exact
`AdministrationOperationalActivityEvent` variant for relevant cancellation only:
identity/order/version, operation, retained actor/time, selected piece IDs and
before/after status. Omit correction events and every arbitrary reason/free-text/
contact/finance/changed-value field. No full command JSON enters those queries.
New strict activity schemas must be extended together
with SQL/consumers; no cast permits a new event through an old union. Full admin
before/after facts are restricted to this admin API/receipt. Owner-sales/approval
use the explicit value-free summary with actual changed category names; operations
use the cancellation-only variant. These are three distinct strict schemas, never
a common full object with client-side hiding.

### Operational history-only source and schema compatibility

Standalone department activity feeds retain their existing schemas/types/rows and
original-result controls. Current manufacturing and quality order-history schemas
are extensions of their feed schemas, so contract §5 explicitly separates these
containers before adding the minimal admin member. New public exports are
`manufacturingOrderHistoryItemSchema` / `ManufacturingOrderHistoryItem` and
`qualityOrderHistoryItemSchema` / `QualityOrderHistoryItem`; old feed item/data
exports stay unchanged. Manufacturing order-history keeps event.department equality
for both old variants only; the strict admin variant has no invented department.
Quality and warehouse preserve their existing page/order/distinctness checks.

Concrete private query changes, all inside the existing owning *.queries.ts files:

- `departmentHistory(actor:AuthorityAccount,department:ManufacturingDepartment,
query:{actor?:"me"|undefined;orderId?:string|undefined;pieceId?:string|undefined},
includeAdministration:boolean):Prisma.Sql` in manufacturing.queries.ts retains
  every old branch. findManufacturingActivity supplies false; the already-authorized
  findManufacturingOrderHistory supplies true with its fixed orderId. True without
  orderId is an internal wiring defect. Only true adds the admin cancellation UNION.
  Bind c.order_id to that root, require ADMIN_CANCEL, join its exact cancellation
  child to physical alias p by (pieceId,orderId), and require
  manufacturingPieceRelationSql(department) for at least one selected piece. This
  reuses the actual requested-department current/historical relation, including
  retained visits/issues/events, rather than assigning actor.department or current
  cancelled stage as provenance. Optional pieceId requires membership in c.piece_ids
  as well as the existing root/piece authorization. Select the complete original
  selected group through administrationOperationalSummarySql with fixed c/h aliases;
  do not shrink the retained event to just the matching child.
- Extend private `QualityHistoryFilter` with required
  `includeAdministration:boolean`; its existing optional orderId/pieceId remain.
  qualityHistorySource(filter):Prisma.Sql and qualityHistoryPage(tx,query,filter)
  propagate it. findQualityActivity supplies false and no orderId; the existing
  authorized findQualityOrderHistory supplies true and its fixed orderId. Require
  orderId for true. Add only that history branch, with ADMIN_CANCEL, exact root,
  optional selected-piece membership, and EXISTS an exact cancellation child/physical
  p pair satisfying the existing qualityPieceRelationSql(). Historical work visits,
  correction cycles, issues and accepted transfer evidence remain its source of
  relation; no fabricated quality inspection or current-stage guess is added.
- Warehouse's private HistoryFilter already separates warehouseOnly:true (the own
  feed) from false (order history). Preserve that discriminator. Only
  warehouseOnly:false with fixed orderId adds admin identities to historySource;
  retain the warehouse_roots join/current authority and optional selected-piece
  predicate. Existing warehouseHistoryPage adds a kind=administration projection
  using the safe constant. The source identity is c.command_id for both event_id
  and command_id; order_id/occurred_at come from the retained admin row. The own-feed
  path still returns warehouse commands only and parses its unchanged narrow schema.

All three additions filter the source before count/page, keep existing deterministic
sort and original group identities, and preserve prior relation/denial checks even
for an explicit piece filter. SQL department relevance is a server condition;
the history DTO cannot prove it from a claimed department field. No request enables
the private inclusion flag. Existing APIs keep their methods/URLs/query fields.

T004's later schema cases belong to existing
`packages/contracts/src/manufacturing/manufacturing.schema.test.ts`,
`packages/contracts/src/quality/quality.schema.test.ts` and
`packages/contracts/src/warehouse/warehouse.schema.test.ts`: valid admin history
without department accepted; fake department/private fields rejected; old wrong
department/order/page/duplicate cases preserved; unchanged feed schemas reject
admin events. T020's later real query cases extend existing
`apps/api/src/modules/manufacturing/manufacturing.queries.integration.test.ts`,
`apps/api/src/modules/quality/quality.queries.integration.test.ts` and
`apps/api/src/modules/warehouse/warehouse.queries.integration.test.ts`. Prove an
eligible admin cancellation appears once in permitted order history, a foreign
department root is denied, a visible mixed-department order excludes an unrelated
selected cancellation, piece filtering retains complete original group membership,
and feed rows/counts remain their original non-administration population. Existing
manufacturing/quality/warehouse HTTP integration owners also exercise denied direct
requests and strict safe response parsing. This is compatibility evidence for V-B04,
not a new operational feed or action.

## B05 — Six-section report and complete print snapshot

Requirements: FR-005–006/016–020. Proposed exports in administration-report.queries:
`findAdministrationReport(tx,actor,query,observation)` and
`findAdministrationPrintReport(tx,actor,query,observation)` returning exact contract
data types; common internal `readAdministrationReportFacts` uses B02 cohort SQL.

1. Under B01 RepeatableRead, capture one actual generatedAt/business date and resolve
   normalized filters. No report IDs, approvals, employees, dates or seals are generated.
2. SQL determines the filtered root cohort and aggregate facts, independent of current
   screen page. Mixed/default includes draft roots, no implicit submitted-only switch;
   drafts have honest internal UUID reference/null business number and zero physical
   facts. Meta kind is MIXED/DRAFT/SUBMITTED as appropriate.
3. Compute KPI totals, current department distribution and exception categories from
   that same cohort. Production distribution uses four departments plus fifth shipping
   context row. OUT_FOR_DELIVERY pieces are WITH_COURIER context, DELIVERED pieces
   not warehouse occupancy. Warehouse current occupancy includes incoming/received
   actual pieces; it must not imply all are received/ready. No invented supervisor
   title/name or first roster member promoted to department head.
4. Workforce independently selects current P01 directory fields under department-only
   restriction. Count current actual row statuses; active headline uses current eligible
   active staff. No order date/type/status/salesperson restriction of membership. Role
   workload is shared cohort context, not output attributed to every employee.
5. Screen loads <=100 report rows with complete matching aggregate/count metadata.
   Print counts all cohort/roster/exception rows before loading. Technical limits:
   <=5000 orders, <=5000 roster rows, <=20000 category cases, <=8MiB serialized data.
   Any excess returns REPORT_SCOPE_TOO_LARGE422 with no report DTO. These are safe
   output guards, not acceptance of a maximum business population or silent truncation.
6. For allowed print output, fetch selected safe summary columns in batches<=100
   within this one tx, deterministic sort; use SQL aggregates for piece/history facts,
   not 5000×200 specifications. Build all sections including effective permitted
   address. Validate full DTO and UTF-8 serialized size before success/complete:true.
7. Preserve six sections. Endorsements are blank manual signoff roles/spaces; no
   fabricated executive approval, registration number or REP-count reference. A zero-
   exception section displays honest empty content instead of changing section count.

No stored report/snapshot table, retention policy, long-lived exported transaction or
job is introduced. Each response is one internally coherent observation. Opening print
later creates a newer observation and visibly records its actual generatedAt; it does
not claim the preceding screen snapshot is unchanged. Once displayed, immutable data
does not auto-change during browser printing; explicit refresh obtains a new complete
snapshot after current authority. Failed/denied reads cannot preserve active print
eligibility for stale data. 8s statement/10s tx timeout failures return a safe failure,
never partial-report success. Full complete output beyond a screen page is tested.

## B06 — Serialized command, replay and uncertain-result recovery

Requirements: FR-007–015/023. `hashAdministrationCommandIntent(body)` is proposed in
administration-command-executor; parses strict body, canonicalizes operation/order/
expectedVersion, sorted exact IDs/scope/normalized reason or ordered patch fields,
then existing Node SHA256. Do not hash commandId/actor-supplied authority fields into
business intent. CommandId is separately actor/operation/order/version/hash bound.

`lockAdministrationCommandIds(tx,ids)` in administration-command.writer uses sorted
unique IDs and the existing SHA256 signed64bit advisory-lock approach, namespace
`p08-administration-command:`. Existing lock helpers/executors are patterns to reuse,
not generic frameworks; do not invoke SalesCommandExecutor/ApprovalCommandExecutor/
WarehouseCommandExecutor nested transactions or fake an operation they don't support.

Execute sequence (one ReadCommitted tx, maxWait5000/timeout10000, lock/statement
timeouts as B01, one recognized serialization/deadlock/ID collision retry):

1. Reparse body, bound its bytes, canonicalize intent/hash outside tx. In tx take
   shared actor row lock, reload account, current business authority plus ADMIN role.
2. Take command advisory lock before any root lock; read retained admin command.
   If present, compare actor,operation,orderId,expectedVersion,hash exactly; mismatch
   ADMINISTRATION_COMMAND_CONFLICT409; match returns stored schema-validated result
   with replayed:true after current eligible authority. Don't reexecute current effects.
3. Lock `sales_drafts` target FOR UPDATE (existing all domain commands lock this root),
   require SUBMITTED plus real SalesOrder. Missing/foreign target404 before mutable
   version details. Check expectedVersion and require current version<=2147483646
   before adding one; current2147483647 is exhausted and returns
   ORDER_VERSION_CONFLICT409 without arithmetic overflow or a write.
4. Load physical rows/order/contacts/current issue and workflow context under root
   lock. All dependent writers use the same tx. Explicit physical row FOR UPDATE in
   ascending UUID order follows root lock; current domain writers also serialize on
   root, so this does not invert another command's lock order. Never lock another actor
   after root. Single-order action avoids cross-order lock ambiguity.
5. Capture one real now instant; validate finite. Compute complete before facts and
   planned after facts/child identities by B07/B08, without remote I/O.
6. Insert immutable parent with exact planned facts/result, then apply required child/
   physical/root/lifecycle writes. Deferred FKs/graph guards validate at commit. Advance
   existing root version via `advanceApprovalOrderVersion` once and update current
   return applicability proof when relevant (D02). Extend that existing helper's
   input with optional `notes: Readonly<{before:string|null;after:string|null}>`.
   When present, its same conditional update checks generalNotes=before and writes
   generalNotes=after together with version+1/updatedAt; existing callers omit notes
   and retain identical behavior. Administrative correction passes this only for an
   actually changed note. The P08 submitted-note witness requires note/version to
   change in the same UPDATE, so a second notes UPDATE is forbidden. Counts/affected-row outcomes checked.
7. Reload selected facts and validate equal planned after. Return mapped stored receipt
   only after tx commit. Any child/audit/mapping/constraint failure rolls back all effects.

Map only exact known new constraints to selection/correction conflicts; corruption/
unknown Prisma errors remain safe internal errors. Bounded retry restarts the complete
transaction with current actor/state; no blanket retry of connection errors or uncertain
commit. There is no email/provider/spending side effect in these commands.

Observe sequence: current actor authority, same advisory command lock, retained row
lookup, require retained.actorId===actor.id and visible submitted root, return original
receipt replayed:true. Another/missing actor record404 without leaking receipt.
Network/5xx/malformed-success after send means uncertain: client preserves original
intent/ID and observes. Observation success reconciles current reads; absence permits
only retry of same intent/ID, not a new effect ID. No browser storage of contact-bearing
command draft is required. Closing pending dialog does not undo a committed command.

## B07 — Exact administrative cancellation

Requirements: FR-007–011, D-007. Proposed
`planAdministrativeCancellation(input:AdministrationCancellationPlanInput):
AdministrationCancellationPlan` in administration.rules; proposed
`applyAdministrativeCancellation(tx:Prisma.TransactionClient,input:Readonly<{
root:AdministrationRootRecord;plan:AdministrationCancellationPlan}>):Promise<void>` in admin command writer
delegates durable mechanics to shared cancellation writer below.

1. Under B06 root lock, classify current custody from header/latest real attempt.
   Deny OUT_FOR_DELIVERY/DELIVERED or an unresolved current attempt, even though
   physical stage is WAREHOUSE. Failed delivery is eligible only with its real FAILED
   outcome/returnedToWarehouse=true. CANCELLED/zero-active has no cancellation scope.
2. Resolve active physical IDs (stage!=CANCELLED/cancelledAt null), validate supplied
   IDs exist in this order, unique/nonempty, not dispatched/delivered. ORDER must equal
   all active IDs, ITEM exactly one persisted row ID, QUANTITY exactly selected subset.
   No fallback by model/item name/array order, no zero/skip/replacement. Any member
   mismatch rejects the whole action. expectedVersion binds the review's identities,
   counts and money; refreshed differing membership requires new explicit confirmation.
3. Preserve optional custom reason; null becomes honest scope-specific administrative
   description, not a supposed customer instruction. Exact parent reason binds each
   cancelled physical row. Keep selected/remaining IDs before applying writes.
4. Shared writer sets selected physical stage CANCELLED/workState BLOCKED, issueId
   null, cancellation time/reason; receivedAt stays unchanged. For administration source, clear currentWorkVisitId in this same physical UPDATE;
   its exact OLD/NEW witness includes that pointer. Close only live work/
   quality/correction/held-issue records with actual admin provenance as D02.
   cancelManufacturingVisit retains its signature; for an administrative cancellation
   require the physical pointer already null, select the unique open visit by
   order/piece, close it conditionally and issue no second physical UPDATE. No open
   manufacturing visit is a legitimate no-op for other source stages; immutable
   graph guards still require every actual live visit's proper terminal source.
   Approval source keeps its existing pointer-driven closure path. Preserve
   original specification, frozen price, receipt/packing/attempt/history records.
   A newly terminal manufacturing visit must also remain readable by existing
   manufacturing detail: extend MANUFACTURING_VISIT_SELECT with its safe real
   endAdministrationCommand actor relation and mapVisit's endedBy resolution as
   prescribed in D02. Do the same existing quality actor mapping, preserve original
   starters/origins/times, and keep shared chronology/terminal-actor refinements.
5. Existing `calculateOrderMoney` from surviving frozen unit prices and unchanged paid
   produces total/due/surplus; no paid clamp/refund/settlement. Reuse
   `deriveOrderStatusAfterCancellation` only for ordinarily approved/ready paths.
   Status table below owns cases its current implementation cannot represent.

| Before state / remaining active                                   | After state                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Any eligible state / zero                                         | CANCELLED; clear current returned proof, retain history                                                              |
| AWAITING_APPROVAL / positive                                      | AWAITING_APPROVAL; do not approve/release                                                                            |
| RETURNED / positive                                               | RETURNED; preserve decision/reason/time, carry current proof version                                                 |
| DELIVERY_FAILED / positive                                        | DELIVERY_FAILED until explicit warehouse retry                                                                       |
| READY_FOR_DELIVERY after prior retry / positive fully received    | READY_FOR_DELIVERY                                                                                                   |
| APPROVED/READY with no failed-current-retry dependency / positive | Existing deriveOrderStatusAfterCancellation: READY only if every active piece received/unblocked, otherwise APPROVED |

For the last branch also require no OPEN quality cycle before claiming READY, matching
P07 blockers. Close selected cycles only; unaffected pieces keep their current holds/
locations/visits. Parent/child facts include all retained pieces and exact before/after
counts/money. Physical receipt does not mean delivered custody.

Shared proposed interface in `approval/order-cancellation.writer.ts`:

```ts
type OrderCancellationSource = Readonly<{
  kind: 'approval' | 'administration'; commandId: string;
}>;
applyRetainedPieceCancellation(tx: Prisma.TransactionClient, input: Readonly<{
  orderId: string; pieceIds: readonly string[]; reason: string;
  occurredAt: Date; source: OrderCancellationSource;
}>): Promise<void>;
```

It assumes caller locked/authorized/validated selected state and performs conditional
physical/lifecycle/issue updates with affected counts. It does not open a transaction,
increment root, select different pieces, decide broad authority or settle money. Extract
P04's existing physical/visit/cycle/issue mechanics to this writer and keep its old
single-piece held-issue authority unchanged. Call existing money/status helpers in
owning services; shared mechanics have one owner, no fake ApprovalCommand is inserted.
D02's P07 failed-attempt/current-active compatibility is required before this action
can pass backend acceptance or frontend wiring.

### B07 historical retry membership compatibility

The owner-approved T013 amendment adds only the existing
`packages/contracts/src/warehouse/warehouse-event.schema.ts` and its matching
`.test.ts` to the earlier warehouse owners. The actual global activity read fails
when a valid post-cancellation retry records2 remaining pieces but preserves the
original3-member failed attempt. This is historical evidence, not a changed payload.

In existing private `hasBoundAttempt(event)`, require the same order ID and then:
for `RETRY_DELIVERY` only, every event piece must belong to the original attempt;
for every other operation retain `sameIds(attempt.pieceIds,event.pieceIds)`.
Existing `pieceIdsSchema` keeps both sets nonempty, distinct and bounded, so equal
and proper-subset retries are accepted but empty/foreign membership is rejected.
Preserve FAILED/physical-return, chronological, retry identity/body, actor and
compact command-evidence refinements. No cancellation authority is inferred from
this public subset: actual server/database admission still proves each omitted
original member's retained administrative cancellation. Do not change payloads,
mapper projections, persistence, custody protection or authority.

Contract tests exercise equal/subset retry success through warehouse and shared
sales activity discriminators; empty/duplicate/foreign-member/order and mismatched
retry evidence rejection; strict membership for dispatch/failure/confirmation.
Extend the existing T013 `retries and redispatches only the surviving active set`
executor integration case: after actual partial cancellation and explicit retry,
read real `WarehouseService.activity` and `orderHistory`, require the same retry
event with current surviving IDs and the unchanged original attempt IDs, then
retain existing next-dispatch, receipt and immutable graph assertions. This tests
the global feed poisoned by a different order as well as fixed-order history.
Run contract tests/types, the existing warehouse rules/query/executor checks,
backend review and actual HTTP/browser regression before T045/T047 acceptance.

## B08 — Allowlisted administrative correction and current projection

Requirements: FR-012–015, D-008. Proposed
`planAdministrativeCorrection(input:AdministrationCorrectionPlanInput):
AdministrationCorrectionPlan` in administration.rules and
`applyAdministrativeCorrection(tx:Prisma.TransactionClient,input:Readonly<{
root:AdministrationRootRecord;plan:AdministrationCorrectionPlan}>):Promise<void>` in command writer.

1. B06 establishes current ADMIN and any submitted state, including unapproved,
   returned, manufacturing, delivered and retained CANCELLED; drafts are ineligible.
2. Reuse current customer input validators for name/phone/optional email/address and
   current draft general-notes text bound. Body and patch strict; no authority fields,
   customer ID, pieces, dates, paid, signature, price or manufacturing/attempt notes.
3. Read effective contacts from latest correction or original snapshot, notes from
   root.generalNotes. Apply only present normalized fields; null clears optional only.
   Compare normalized effective values; unchanged409 with no child/audit/root increment.
4. Require real nonblank bounded reason, preserve original/submitted values. Insert
   AdministrationOrderCorrection complete before/after contact snapshot and changedFields;
   update root.generalNotes only if supplied changed notes. No customer master write,
   no uniqueness restriction on order-only phone, no specification revalidation/reprice.
5. Preserve current lifecycle status and all physical/work/receipt/attempt/paid fields.
   Advance root once and carry RETURNED applicability proof exactly per D02. Terminal
   order stays terminal; no restoration/reapproval/unlock/repair routing effect.
6. Current existing authoritative sales/approval/admin paper/detail and P07 delivery
   consumers project effective permitted contacts; original retained command revisions/
   delivery-attempt facts stay unchanged. List/search/report SQL uses identical latest
   projection and root current notes. Factory only receives already-permitted name/
   notes, never expanded phone/address/finance. No frontend patches prototype state.

Use proposed pure `effectiveOrderContact(original,latest)` in the existing sales-order
projection owner, not a service-to-service circular dependency. Extend the bounded
selected record and affected SQL summary owners together; no global cache or async
contact synchronization. One response does not establish another independently loaded
view is current; frontend query reconciliation follows its blueprint.

### Shared projection and lifecycle interface details

Proposed `mapSalesOrderTracking(order:SalesOrderDto):SalesOrderTrackingData` in the
existing sales-orders.mapper extracts the exact mapping currently inside
SalesOrdersService.tracking: orderId/version/counts and each physical piece's id,
stage/workState/receivedAt/cancelledAt/cancellationReason. Both current sales tracking
and admin detail call this pure mapper; validate through existing shared schema.
Do not call SalesOrdersService.tracking from an admin read and open a second tx.

Proposed `effectiveOrderContact(original:Pick<AdministrationCorrectionValues,
'customerName'|'customerPhone'|'customerEmail'|'customerAddress'>,
latest:Pick<AdministrationCorrectionValues,'customerName'|'customerPhone'|
'customerEmail'|'customerAddress'>|null):Pick<AdministrationCorrectionValues,
'customerName'|'customerPhone'|'customerEmail'|'customerAddress'>` in
sales-orders/order-contact.projection.ts returns latest or original allowlisted
values. This is a pure structural projection; implementation must import browser-safe
types without API feature-service cycles. Current generalNotes remains on the root.

After shared extraction, `cancelManufacturingVisit` and `cancelQualityCorrection`
each have exact cancellation signature `(tx:Prisma.TransactionClient,input:Readonly<{
orderId:string;pieceId:string;source:OrderCancellationSource;occurredAt:Date}>)
:Promise<void>`. Update current approval cancellation callers to
source `{kind:'approval',commandId}` and new admin writer to administration source.
Issue interruption helpers retain their existing approval-only input signatures;
their internal calls map to explicit approval source. Do not broaden issue reporting
into an administrative operation. Required source relation/enum/guard changes and
conditional updates are D02, including admin cancellation of an active quality visit.

## B09 — Source ledger, regression owners and acceptance gates

Existing source to reopen before implementation, including actual immediate callers:

| Boundary                  | Current owner / exact reused symbols                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current authority/HTTP    | `auth/account-authority.ts`: lockAccountRows/loadIdentityAccount/assertBusinessAuthority; `authorization.middleware.ts`: authorizeRoles; existing validation/CSRF/ResponseHelper                                                                                                                              |
| Version/command patterns  | sales-commands/SalesCommandExecutor; approval/ApprovalCommandExecutor, lockApprovalCommandIds, advanceApprovalOrderVersion; warehouse/WarehouseCommandExecutor and actual observe semantics                                                                                                                   |
| Order projection/values   | sales-orders.mapper.ts SALES_ORDER_SELECT/mapSalesOrder/mapFactoryOrder/mapSalesOrderSummary/deriveSalesOrderFinancialFacts; sales-orders.rules.ts calculateOrderMoney/deriveOrderCounts/deriveOrderStatusAfterCancellation/parseMoneyCents/formatMoneyCents                                                  |
| Current return/reapproval | sales-orders.queries.ts mapCurrentOrderReturnProof/readCurrentOrderReturnProof; SalesOrdersService.resubmit; approval.rules.ts assertInitialDecisionState; ApprovalService.executeInitial/cancelIssuePiece; findApprovalOrder/findOfficialPaper                                                               |
| Work/correction closure   | manufacturing-work.lifecycle.ts cancelManufacturingVisit; quality-work.lifecycle.ts cancelQualityCorrection; existing current pointers and open-cycle queries                                                                                                                                                 |
| Terminal work projection  | manufacturing.mapper.ts MANUFACTURING_VISIT_SELECT/WORK_ACTOR_SELECT/private mapVisit; manufacturing.queries.ts loadManufacturingPieceContexts/findManufacturingOrder; quality.mapper.ts QUALITY_VISIT_SELECT/mapQualityVisit. Both real admin sources must preserve endedAt/endedBy parity.                  |
| Receipt/current custody   | warehouse.queries.ts lockWarehouseOrders/warehouseRootsSql; warehouse.rules.ts deliveryActions/assertWarehouseSelection/warehouseActionHints; warehouse.mapper.ts summary/detail/attempt projections                                                                                                          |
| Mixed immutable history   | sales-orders/order-activity.queries.ts findOrderActivity/findSalesActivityEvent; domain summarySql exports; salesActivityItemSchema and each department event contract                                                                                                                                        |
| SQL authority/integrity   | P03 `20261106000200_p03_catalogs_submitted_orders`; P04 `20261106000400_p04_approval_piece_issues`; P05 `20261111000100_p05_manufacturing_workspaces`; P06 `20261111000200_p06_quality_workspaces` plus `20261112000100_p06_quality_validation_dispatch`; P07 `20261113000100_p07_warehouse_receipt_delivery` |

The data model fixes each affected check/function and before/after predicate; do not
rewrite those prior migration files. New migrations replace current definitions
forward while retaining every old branch. Review generated Prisma/schema and actual
trigger graph tests before connecting UI.

Create discovered backend tests at proposed `apps/api/src/modules/administration/`
`administration.rules.test.ts`, `administration.queries.integration.test.ts`,
`administration.http.integration.test.ts`,
`administration-command-executor.integration.test.ts`; extend existing approval,
sales-orders, warehouse and database migration integration files for changed shared
behavior. The main plan owns concrete verified runner commands; tests must use their
existing harnesses and owned real PostgreSQL, not mock the boundary being claimed.

Exact new shared-boundary test owners:

- `packages/contracts/src/administration/administration.schema.test.ts` — filters,
  date/input/output strictness, mixed drafts/references, all read shape/context guards.
- `packages/contracts/src/administration/administration-command.schema.test.ts` —
  exact selection, field normalization/omission/clear, source-free strict intent,
  UTF-8 size/hash equivalence and version/result refinements.
- `packages/contracts/src/administration/administration-event.schema.test.ts` —
  three distinct strict full/admin-order-summary/operational projections; reject
  injected reason/before/after/contact/money/free-text in both safe variants.
- `packages/contracts/src/sales-orders/order-activity-labels.test.ts` — exhaustive
  source-kind/operation registry, byte-identical relocated labels, case-insensitive
  literal substring resolution, blank/unmatched search and kind-qualified overlaps;
  package-index initialization remains cycle-free.
- Proposed `apps/api/src/modules/manufacturing/manufacturing.mapper.test.ts` —
  pure typed selected-record mapping with actual admin terminal actor shape for
  CUTTING/PRODUCTION, preserved prior starter/origin/time, and rejected missing/
  multiple terminal sources. This mapping evidence may run before the new executor
  exists and claims no persistence proof.
- `packages/database/tests/integration/administration-migration.test.ts` — fresh/
  populated upgrade, checksums/retained old rows, enum/nullable additions/direct-SQL
  invalid graph/immutable original snapshots and exact named constraint outcomes.
- `packages/database/tests/integration/administration-lifecycle.test.ts` — current
  receipt retained after cancellation, source alternatives, failed-attempt history,
  returned-proof chain, preapproval cancellation/active-only release and rollback.
- Existing `apps/api/src/modules/approval/approval.service.integration.test.ts`,
  `apps/api/src/modules/sales-orders/sales-orders.service.integration.test.ts`,
  `apps/api/src/modules/sales-orders/sales-orders.queries.integration.test.ts`,
  `apps/api/src/modules/warehouse/warehouse-command-executor.integration.test.ts`,
  `apps/api/src/modules/warehouse/warehouse.queries.integration.test.ts` receive the affected compatibility
  and cross-role projection cases; their existing test harness owns cleanup.

After the administration executor exists, extend its integration test plus existing
`apps/api/src/modules/manufacturing/manufacturing.queries.integration.test.ts` and
`apps/api/src/modules/manufacturing/manufacturing.http.integration.test.ts` for real
receive/start/colleague-continuation
then administrative cancellation and actual manufacturing detail/history read.
The command, SQL witness and returned endedBy must agree; CANCELLED history has no
resumed work action and preserves prior starter/origin/timestamps. This later
boundary proof is not a prerequisite import of a future executor into the earlier
shared-mechanics task. Existing P04 cancellation still uses its real approval actor.

Activity privacy/query tests exercise actual existing sales and approval mixed HTTP
endpoints as both employee and ADMIN, the admin activity/history endpoints, and
factory/warehouse endpoints. Reject full-event injection in safe contract schemas;
assert absence of reason/before/after/contact/money values and private-field search
hits in safe API responses. The admin endpoints retain the permitted full facts.
Source-qualified event keys cannot collide and old event-to-decision links apply
only to real decision command variants. Label-search cases use the canonical
registry value itself (not a duplicate test literal), >one page of mixed source
events, partial labels, shared operation names with distinct labels, no-match and
literal `%`/`_`/backslash inputs. Count and every page must contain exactly the
same matching identity population. A label-only hit must survive before pagination;
post-page frontend filtering cannot satisfy the case.

Meaningful cases: mixed roots/duplicate employee names/current-vs-historical department
states, literal wildcard search, DST/year boundary inclusive date filters, overlapping
exceptions, empty/out-of-range pages, two workers/shared counts, more-than-page report,
guard overflow/no partial output; source facts cannot be replaced by fixture counters.
Commands cover every D04 state, controlled losing-race/rollback and original-ID recovery
with current authority. Preserve original P01–P07 migrations, auth/transport/contracts,
exact money, all seven types, customer isolation and P04 print block regressions.

Backend acceptance requires implemented contracts/migrations/current authorization,
shared writers/compatibility, producer-safe projections/OpenAPI, discovered real checks
and separate requirements/engineering review before dependent frontend integration.
PLAN PASS asserts none of those executed outcomes. OPS-01 blocks production calendar/
target-specific release work; independent design and explicit isolated test calendars
remain possible. No deployment/mail/backup access is invented by this blueprint.

### Concrete operation evidence matrix

The case IDs below are design/verification references, not task IDs or passed tests.
Use the exact proposed test owners; extend current shared regression owners where
the case crosses an existing boundary.

| Case / blueprint | Starting state and action                                                                                                                                                     | Required observable result                                                                                                                                                                                                      | Test owner                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-B01 / B01      | Active ADMIN reads; ordinary/then-suspended actor requests same HTTP URL                                                                                                      | Only current eligible ADMIN gets safe data; denial/no leaked content; later authority change cannot win an unprotected command race                                                                                             | `apps/api/src/modules/administration/administration.http.integration.test.ts`                                                                        |
| V-B02 / B02      | Draft plus submitted roots; three physical pieces: one cancelled, one received, one production; inclusive range across DST boundary                                           | Mixed roots once; physical original3/cancelled1/active2/received1; local boundary dates included using independently resolved midnights; no host offset assumption                                                              | `apps/api/src/modules/administration/administration.queries.integration.test.ts`                                                                     |
| V-B03 / B03      | Two OPEN quality cycles on one order, draft+submitted roots, two workers same department, past-promise ready/dispatched/failed/retry overdue exclusion, duplicate owner names | activeCorrections2 cycles/openCorrectionOrders1; correction active2 cycles; total/recent include draft; physical subtitles server-derived; exception headline distinct; real ID-based owner options and AMBIGUOUS legacy lookup | `apps/api/src/modules/administration/administration.queries.integration.test.ts`                                                                     |
| V-B04 / B04      | Owner-sales/approval mixed APIs (including ADMIN), admin history API, operational histories; label-only search beyond one page                                                | One identity count/page population; owner/approval receives strict value-free summary, admin receives full facts, operations cancellation-only; no private search disclosure or label drift                                     | `apps/api/src/modules/administration/administration.http.integration.test.ts` plus `administration.queries.integration.test.ts`                      |
| V-B05 / B05      | 26 matching orders, page1 limit25, two staff; then technical guard overflow; direct print URL missing period                                                                  | Print includes26 orders/common facts with separate current roster, phone/address and fifth courier context; default ALL direct versus explicit MONTH screen; overflow422 with no partial DTO                                    | `apps/api/src/modules/administration/administration.queries.integration.test.ts`                                                                     |
| V-B06 / B06      | Same ID/intent accepted; lost reply; changed payload; max-int root; required child save fails                                                                                 | One replayable original result; conflicting intent409; exhausted version409/no increment; rollback leaves complete prior graph                                                                                                  | `apps/api/src/modules/administration/administration-command-executor.integration.test.ts`                                                            |
| V-B07a / B07     | Two650.00 pieces/paid1000.00, P1 physically received; cancel exact P1                                                                                                         | Active1/received-active0, total650.00/paid1000.00/surplus350.00; original P1 receipt retained; P2 unchanged                                                                                                                     | `apps/api/src/modules/administration/administration-command-executor.integration.test.ts`                                                            |
| V-B07b / B07     | Failed returned attempt P1/P2; cancelP1 then retry/dispatchP2; separately cancel current dispatched/delivered                                                                 | Old failed membership remainsP1/P2; partial cancel staysFAILED until explicit retry; new full-active attemptP2; custody denial has no effects                                                                                   | `apps/api/src/modules/warehouse/warehouse-command-executor.integration.test.ts`                                                                      |
| V-B07c / B07     | Cancel active piece before approval and while RETURNED, or live quality/held piece; later resubmit/approve                                                                    | No cancelled row reactivation; only active rows release; real source closes visit/cycle/issue once; returned reason/history and paid remain                                                                                     | `packages/database/tests/integration/administration-lifecycle.test.ts`                                                                               |
| V-B07d / B07     | Start/continue CUTTING and PRODUCTION work, execute real admin cancellation, read existing manufacturing detail/history                                                       | CANCELLED ended visit parses with real admin endedBy; original starter/origin/time and old approval cancellation actor remain; no restored action or fake approval source                                                       | `apps/api/src/modules/administration/administration-command-executor.integration.test.ts`; existing manufacturing query/HTTP integration tests above |
| V-B08 / B08      | Any submitted/terminal order, addressA→B and general note update; then forbidden price field/no-change/stale save                                                             | EffectiveB/current note plus originalA/before-after reason; unchanged lifecycle/master/attempts/prices; rejected saves change no audit/root/fields                                                                              | `apps/api/src/modules/administration/administration-command-executor.integration.test.ts`                                                            |
| V-D03 / D03      | Fresh database and populated migrated P01–P07 data with recorded old row/history hashes                                                                                       | Forward upgrade preserves old rows/checksums; nullable sources remain null; forged/mutable admin graph rejects by exact constraint                                                                                              | `packages/database/tests/integration/administration-migration.test.ts`                                                                               |

### B09 exhausted-version fixture refinement

For the required real exhausted-root denial, extend the existing owned child
createP05LegacyUpgradeFixture(mode, rootVersion=1) helper. Validate rootVersion as
integer1..2147483647 and pass it into seedLegacy's original salesDraft.create before
P04/P05 lifecycle/head guards are installed. Default callers remain byte-equivalent.
Deploy all current immutable migrations on that owned historical child and execute
the real P08 command with expectedVersion2147483646 against root2147483647;
ORDER_VERSION_CONFLICT and unchanged graph/zero P08 rows are required. Never disable
a guard, rewrite migration SQL or manufacture billions of command rows.

### B09 restore-compatible CHECK helpers

T025 reproduced a real pg_restore failure: immutable P08 CHECK validators call
p08_has_exact_keys by unqualified name while pg_restore uses an empty search path.
D03's new forward migration pins only those three helper configurations to
pg_catalog,public,pg_temp. Preserve every earlier migration/body/guard/permission.
Extend the exact migration inventory and existing administration-migration test:
under SET LOCAL search_path=pg_catalog, schema-qualified P08 facts/correction
validators accept valid original values and reject malformed counts/extra fields.
T025's full real restore must then compare schema guards and app data before/after
restart. T026 repeats fresh/populated DB checks for the complete new migration set.

### B02 retained P04/P07 fixture compatibility

The existing warehouse.service integration retained-rounding fixture runs before
P08 tables exist. Its two historical sales projections must explicitly select
administrationCorrections:false and supply the known absent collection as [] to
the current pure mapper. Keep every original header/specification value and all
retained JSON/replay/199-of-200 assertions. This is an explicitly versioned test
projection, never a production missing-table fallback or altered old migration.

The existing manufacturing.service integration P05-only future-quality seam must
keep its exact cutoff/absence-of-P06 checks. Its final full visit read explicitly
omits endAdministrationCommandId, which did not exist at that historical boundary;
all original selected visit fields and source-cycle/version assertions remain.
