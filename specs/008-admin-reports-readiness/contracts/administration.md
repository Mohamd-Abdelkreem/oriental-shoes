# Administration contract and interface ledger

This is the P08 proposed wire/interface owner for FR-001–024 and D-007–009.
Every `administration*` schema/type and API route below is **proposed**, not
implemented. Existing imported symbols are explicitly identified. The API prefix
comes from the existing application configuration; paths below are relative to it.
The frontend API client already owns that prefix, credentials, refresh and CSRF.

## 1. Files and exported schemas

Create `packages/contracts/src/administration/administration.schema.ts`,
`administration-command.schema.ts` and `administration-event.schema.ts`, exporting
their public symbols from `packages/contracts/src/index.ts`. API DTOs alias these
schemas rather than recreate validation. All objects are strict; unknown query,
body, patch and projection fields fail validation. Database types remain server-only.

Existing reusable exports: `salesUuidSchema`, `salesVersionSchema`,
`salesInstantSchema`, `salesOrderTypeSchema`, `salesOrderStatusSchema`,
`currentOrderCountsSchema`, `salesOrderSchema`, `salesOrderSummarySchema`,
`salesOrderTrackingDataSchema`, `draftSchema`, `draftSummarySchema`,
`customerCaptureSchema`, `customerPatchSchema`, `customerPhoneSchema`,
`paginationQueryFields`, `paginationMetaSchema`, `isSafePaginationWindow`,
`nonEmptyBoundedString`, `salesCommandActorSchema`, `successEnvelopeSchema` and
`errorEnvelopeSchema`. Reuse existing domain event schemas for their own variants;
do not widen their fields to admit unrelated admin facts.

| Proposed export                                | Inferred type / responsibility                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `administrationOrderFiltersSchema`             | `AdministrationOrderFilters`; normalized common cohort filters                                                                        |
| `administrationOrdersQuerySchema`              | `AdministrationOrdersQuery`, `AdministrationOrdersQueryInput`; filters + page/limit                                                   |
| `administrationDashboardQuerySchema`           | `AdministrationDashboardQuery`; empty strict object                                                                                   |
| `administrationFilterOptionsQuerySchema`       | `AdministrationFilterOptionsQuery`; optional legacy salesperson name resolution                                                       |
| `administrationFilterOptionsDataSchema`        | `AdministrationFilterOptionsData`; real retained owner choices and explicit legacy resolution                                         |
| `administrationApprovalsQuerySchema`           | `AdministrationApprovalsQuery`; approval tab + search/page/limit                                                                      |
| `administrationCorrectionsQuerySchema`         | `AdministrationCorrectionsQuery`; cycle tab + search/page/limit                                                                       |
| `administrationDeliveryExceptionsQuerySchema`  | `AdministrationDeliveryExceptionsQuery`; exception tab + search/page/limit                                                            |
| `administrationActivityQuerySchema`            | `AdministrationActivityQuery`; search/page/limit; optional orderId                                                                    |
| `administrationOrderHistoryQuerySchema`        | `AdministrationOrderHistoryQuery`; page/limit only                                                                                    |
| `administrationReportQuerySchema`              | `AdministrationReportQuery`, `AdministrationReportQueryInput`; cohort filters + page/limit                                            |
| `administrationReportPrintQuerySchema`         | `AdministrationReportPrintQuery`; cohort filters without page/limit                                                                   |
| `administrationOrderParamsSchema`              | `{orderId:uuid}`                                                                                                                      |
| `administrationCommandParamsSchema`            | `{commandId:uuid}`                                                                                                                    |
| `administrationOrderSummarySchema`             | `AdministrationOrderSummary`; submitted summary plus operational/admin hints                                                          |
| `administrationOrdersDataSchema`               | `AdministrationOrdersData`; discriminated rows + exact filtered totals                                                                |
| `administrationOrderDataSchema`                | `AdministrationOrderData`; draft/submitted detail union                                                                               |
| `administrationDashboardDataSchema`            | `AdministrationDashboardData`; named dashboard/shell counts                                                                           |
| `administrationApprovalsDataSchema`            | `AdministrationApprovalsData`; tabbed oversight rows/counts                                                                           |
| `administrationCorrectionsDataSchema`          | `AdministrationCorrectionsData`; retained quality-cycle rows/counts                                                                   |
| `administrationDeliveryExceptionsDataSchema`   | `AdministrationDeliveryExceptionsData`; tabbed current exception rows/counts                                                          |
| `administrationActivityDataSchema`             | `AdministrationActivityData`; paged immutable normalized events                                                                       |
| `administrationReportDataSchema`               | `AdministrationReportData`; snapshot metadata, common aggregates, paged report rows, workforce                                        |
| `administrationReportPrintDataSchema`          | `AdministrationReportPrintData`; complete bounded response, six sections                                                              |
| `administrationCommandBodySchema`              | `AdministrationCommandBody`, `AdministrationCommandBodyInput`; discriminated exact intent                                             |
| `administrationOperationSchema`                | `AdministrationOperation`; ADMIN_CANCEL/ADMIN_CORRECT primitive shared by commands, events and action labels                          |
| `administrationCorrectionValuesSchema`         | `AdministrationCorrectionValues`; complete permitted effective values                                                                 |
| `administrationCorrectionPatchSchema`          | `AdministrationCorrectionPatch`; nonempty strict partial intent                                                                       |
| `administrationCommandDataSchema`              | `AdministrationCommandData`; retained receipt and confirmed facts                                                                     |
| `administrationCommandFactsSchema`             | `AdministrationCommandFacts`; exact before/after durable facts                                                                        |
| `administrationActivityEventSchema`            | `AdministrationActivityEvent`; admin event variant                                                                                    |
| `administrationOrderActivityEventSchema`       | `AdministrationOrderActivityEvent`; value-free summary for existing owner-sales/approval mixed history                                |
| `administrationOperationalActivityEventSchema` | `AdministrationOperationalActivityEvent`; minimal cancellation-only factory/warehouse history variant                                 |
| `administrationActivityItemSchema`             | `AdministrationActivityItem`; administration-only mixed union with full admin event                                                   |
| `nonAdministrationActivityItemSchemas`         | readonly tuple of the six existing strict mixed items, extracted/exported from sales-orders.schema.ts for safe/full union composition |
| `manufacturingOrderHistoryItemSchema`          | `ManufacturingOrderHistoryItem`; existing manufacturing/issue history plus minimal administration cancellation, order-history only    |
| `qualityOrderHistoryItemSchema`                | `QualityOrderHistoryItem`; existing quality/manufacturing/issue history plus minimal administration cancellation, order-history only  |

Export names, casing and field names in this ledger are canonical for API/frontend
design. New public aliases beyond these require a concrete caller. Use `z.input`
for request input types where defaults/normalization change raw fields.

## 2. Query normalization and cohort

`AdministrationOrderFilters` contains the fields below. Parsed `period` is required
and defaulted by the endpoint; other cohort fields remain optional and absent keys
are omitted, never serialized as null. Missing means no restriction, except the
period default below. Blank search normalizes to absent.
Do not send Arabic UI labels as wire enum values: frontend URL adapters translate
the retained visible labels to these enums before validation.

| Field           | Wire values / bounds / meaning                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`        | trimmed string <=150, no NUL; escaped literal case-insensitive match of business number/customer name/phone/piece model; UUID search also matches internal ID |
| `status`        | `DRAFT` or existing `salesOrderStatusSchema` values                                                                                                           |
| `type`          | existing seven `salesOrderTypeSchema` values                                                                                                                  |
| `department`    | `CUTTING`, `PRODUCTION`, `QUALITY`, `WAREHOUSE`; order has a current noncancelled piece there                                                                 |
| `exception`     | `OVERDUE`, `PARTIALLY_CANCELLED`, `READY`, `DELIVERED`; ANDed with other filters; partially cancelled means cancelled>0 and active>0                          |
| `salespersonId` | UUID; compares persisted root `owner_id`, never display-name equality                                                                                         |
| `period`        | `TODAY`, `MONTH`, `YEAR`, `ALL`; report screen default `MONTH`; direct print/all-orders default `ALL`                                                         |
| `from`, `to`    | valid real `YYYY-MM-DD` dates, years 0001–9999; explicit endpoint overrides corresponding preset endpoint                                                     |
| `page`, `limit` | shared defaults 1/25, max limit100 and safe offset; absent from print query                                                                                   |

Dates filter `SalesDraft.createdAt`, matching the current `SalesOrderDto.createdAt`
and source `createdIso` meaning, not first submission/action dates. In the configured
IANA business calendar use `[start-of-from, start-of-day-after-to)`; each endpoint
inherits its preset or is open under ALL. TODAY is today/today; MONTH and YEAR are
first calendar day through today. Reject an effective reversed range. Use one
captured `generatedAt` instant and business date for every section. A missing valid
calendar produces `ORDER_CALENDAR_UNAVAILABLE`, including unfiltered reports that
display overdue/current-date facts. No implicit host calendar fallback.

The common order cohort is the intersection of accepted filters. Draft roots remain
visible in all-orders, reports and read-only detail; report operational counts exclude
drafts from physical-piece facts and label their physical facts zero. An absent status
includes both root kinds; status=DRAFT selects drafts alone and any submitted status
selects submitted roots alone. Department/current-piece and physical exception filters cannot match a
draft. Report type/owner/date predicates operate on the selected cohort before
pagination. The distinct order count is never computed by joining one row per piece.

All paged data shapes below additionally carry `context:{query:<endpoint-specific
parsed canonical query>}`. Order history uses `{orderId,query}`; detail uses
`context:{orderId}`. Parsed paged queries always contain page/limit; report/all-order
queries additionally contain period (report screen MONTH, direct print/all-orders
ALL); tab queries always
contain their defaulted tab. Other absent optional fields are omitted in the echo.
The echo uses that endpoint's query schema and is schema validated, including fixed
order ID on history. It supports request-context binding, not permission. All list
results use deterministic `createdAt DESC,id DESC` except activity/cycles
below. A requested page beyond the last returns `items:[]` and truthful metadata;
the frontend retries a valid page in the same scope. Never silently reset filters.

## 3. HTTP routes and failure protocol

Mount proposed `administrationRoutes(controller, businessAuthenticationMiddleware)`
at `/administration`, and `administrationCommandRoutes` at
`/administration-commands`. Read order: business authentication →
`authorizeRoles(UserRole.ADMIN)` → validation → controller. Writes additionally
place existing `csrfMiddleware` before validation. Each service transaction reloads
and locks current actor eligibility; role in cached request context is insufficient.

| Method/path                                   | Request schema                             | Data schema              | Success                     |
| --------------------------------------------- | ------------------------------------------ | ------------------------ | --------------------------- |
| GET `/administration/dashboard`               | dashboard query                            | dashboard data           | 200                         |
| GET `/administration/filter-options`          | filter-options query                       | filter-options data      | 200                         |
| GET `/administration/orders`                  | orders query                               | orders data              | 200                         |
| GET `/administration/orders/:orderId`         | order params + existing strict empty query | order data               | 200                         |
| GET `/administration/orders/:orderId/history` | params + history query                     | activity data            | 200                         |
| GET `/administration/approvals`               | approvals query                            | approvals data           | 200                         |
| GET `/administration/corrections`             | corrections query                          | corrections data         | 200                         |
| GET `/administration/delivery-exceptions`     | delivery-exceptions query                  | delivery-exceptions data | 200                         |
| GET `/administration/activity`                | activity query                             | activity data            | 200                         |
| GET `/administration/reports`                 | report query                               | report data              | 200                         |
| GET `/administration/reports/print`           | print query                                | print data               | 200                         |
| POST `/administration/commands`               | strict empty query + command body          | command data             | 200, including exact replay |
| GET `/administration-commands/:commandId`     | command params + empty query               | command data             | 200 with `replayed:true`    |

Use `ResponseHelper.ok` and existing success envelope, including data, request ID
and envelope timestamp. Errors use existing error envelope/field paths. API messages
are safe action descriptions; frontend maps to accepted Arabic meanings. Never
expose SQL/parser/Prisma objects or response bodies to UI.

| Status/code                               | Existing/proposed                                                   | Meaning / client action                                                   |
| ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 400 `VALIDATION_ERROR`                    | existing `ValidationException` in `core/errors/validation.error.ts` | Correct named body/query/params field; retain safe input                  |
| 401 existing auth codes                   | existing                                                            | Existing sign-in/recovery policy, not blanket anonymous conversion        |
| 403 `FORBIDDEN` / `ACCOUNT_RESTRICTED`    | existing `ForbiddenException` / `AccountRestrictedError`            | Withdraw protected content; current access recovery                       |
| 404 `ORDER_NOT_FOUND`                     | existing                                                            | Missing root/draft/submitted target, including a foreign piece in command |
| 404 `ADMINISTRATION_COMMAND_NOT_FOUND`    | proposed                                                            | No observable receipt for this current actor; no proof of failed write    |
| 409 `ORDER_VERSION_CONFLICT`              | existing                                                            | Refresh entire order and explicitly review intent                         |
| 409 `ORDER_STATE_CONFLICT`                | existing                                                            | Current custody/lifecycle disallows operation                             |
| 409 `ADMINISTRATION_SELECTION_CONFLICT`   | proposed                                                            | Invalid/stale reviewed scope; whole action unchanged                      |
| 409 `ADMINISTRATION_COMMAND_CONFLICT`     | proposed                                                            | Same command ID bound to different actor/operation/version/payload        |
| 409 `ADMINISTRATION_CORRECTION_UNCHANGED` | proposed                                                            | Normalized patch changes no effective value                               |
| 409 `ADMINISTRATION_TRANSACTION_CONFLICT` | proposed                                                            | Bounded safe retry exhausted/lock timeout; refresh/observe                |
| 422 `REPORT_SCOPE_TOO_LARGE`              | proposed                                                            | Complete output exceeds technical guard; narrow filters; no partial data  |
| 503 `ORDER_CALENDAR_UNAVAILABLE`          | existing                                                            | Explicit business calendar missing/invalid                                |
| 500 existing safe internal code           | existing                                                            | Unexpected failure; observe unknown command outcome before another effect |

Do not introduce status-code guessing into frontend adapters. Reuse these exact
existing error classes and stable codes rather than another competing literal.

Proposed exact module error class names in `administration.errors.ts`:
`AdministrationCommandNotFoundError`404, `AdministrationSelectionConflictError`409,
`AdministrationCommandConflictError`409, `AdministrationCorrectionUnchangedError`409,
`AdministrationTransactionConflictError`409 and `ReportScopeTooLargeError`422.
Each constructor takes no unsafe raw exception/payload, uses its corresponding stable
code from the table, and supplies a safe action/recovery description. Reuse existing
OrderNotFoundError/OrderVersionConflictError/OrderStateConflictError/
OrderCalendarUnavailableError/ValidationException/ForbiddenException rather than
subclasses with competing codes.

## 4. Safe read shapes

All counts are nonnegative safe integers. Per-order counts use
`currentOrderCountsSchema`, capped at the accepted 200 physical pieces; aggregate
counts use safe integer validation, never unsafe bigint-to-number conversion.

`AdministrationOrderSummary` = existing `SalesOrderSummary` plus:

- `currentDepartments: Department[]` using only the four production departments,
  unique in fixed CUTTING/PRODUCTION/QUALITY/WAREHOUSE order;
- `isOverdue:boolean`, `hasQualityCorrectionHistory:boolean`,
  `hasOpenQualityCorrection:boolean`;
- `adminActions:{canCancel:boolean,canCorrect:boolean,canPrint:boolean}`. Hints
  derive from the same current predicates as writes/official paper; never authority.

`AdministrationOrdersData` = `{items: Array<{kind:'draft',draft:DraftSummary} |
{kind:'submitted',order:AdministrationOrderSummary}>,pagination,totalOrders,
totalPieces,statusCounts}`. `statusCounts` keys are DRAFT and every existing order
status; counts follow the complete filtered cohort, not current page. Each items
array is <=100. `totalPieces` counts retained draft rows for draft items and original
physical rows for submitted items, avoiding double counting their root relationship.

`AdministrationOrderData` is a strict union:

- Draft: `{kind:'draft',draft:DraftDto,historyCount,adminActions:{canCancel:false,
canCorrect:false,canPrint:false}}`; read-only existing paper, no admin draft write.
- Submitted: `{kind:'submitted',order:SalesOrderDto,historyCount,
tracking:SalesOrderTrackingData,adminActions,
cancellationCandidates:[{pieceId,position,model,stage,workState,receivedAt,
eligible,denialReason}],correction:{originalSubmitted:
AdministrationCorrectionValues,effective:AdministrationCorrectionValues,
lastCorrection:null|{id,reason,actor,occurredAt,changedFields}}}`. Last-correction
  identity is its actual command UUID; reason/actor/time come from that immutable
  command and changedFields is the five-field correction subset. historyCount is a
  nonnegative safe integer from the identical merged activity identity count under
  this read transaction; drafts use actual CREATE_DRAFT/SAVE_DRAFT events and no
  submitted-only visibility guard. Candidate array contains all retained physical
  pieces <=200 in position/id order; `denialReason` is null or
  `CANCELLED|OUT_FOR_DELIVERY|DELIVERED|INVALID_STATE`. Received pieces and pieces
  held by issues can be cancelled when not in current delivery custody. For a
  returned failed delivery, history stays returned until explicit ordinary retry.

Current authorized `order.customerSnapshot` and `order.generalNotes` are effective
values from the shared projection described in the data model. Original first
submission values and every before/after record remain retained. Factory projections
remain finance/contact-redacted; do not pass an admin DTO to factory consumers.

`AdministrationDashboardData` = `{generatedAt,businessDate,counts:{totalOrders,
activeOrders,pendingApproval,activeCorrections,openCorrectionOrders,
deliveryExceptions,pendingUsers,readyOrders,overdueOrders,failedDeliveries,
activePieces,pendingApprovalPieces,overduePieces,readyPieces},
departments:[{department,pieces}],recentOrders}`. totalOrders counts all retained
roots for the existing View All link. RecentOrders uses the same draft/submitted
item union as AdministrationOrdersData, <=5 sorted actual updatedAt DESC,id DESC,
matching its recently-updated heading without excluding drafts.
`activeOrders` counts all retained roots,
including drafts, except submitted DELIVERED/CANCELLED; physical piece quantities
remain submitted-only. pendingApproval is AWAITING_APPROVAL; activeCorrections counts
OPEN quality-cycle rows for the existing sidebar badge, while openCorrectionOrders
counts distinct orders with OPEN cycles for the existing dashboard attention card.
deliveryExceptions counts distinct union
of current failed, current dispatched and overdue; pendingUsers follows P01 pending
review authority. `readyOrders` requires positive fully received eligible status;
`departments` counts current noncancelled pieces, not previous visits.
activePieces/pendingApprovalPieces/overduePieces/readyPieces sum noncancelled
physical rows under the exact corresponding active/pending/overdue/ready order
predicates. Drafts contribute zero physical pieces. activePieces also supplies the
existing current-operational-total headline, including current courier context,
excluding delivered/cancelled pieces. Do not derive any subtitle from the five
recent rows or sum incomplete department rows in the browser.

`AdministrationFilterOptionsQuery` is strict `{salespersonName?:string}`; trim/no NUL,
max150, blank absent. `AdministrationFilterOptionsData` = `{context:{query},
salespeople:[{id,fullName,phone:string|null}],legacySalesperson:null|{input,match:'UNIQUE'|'MISSING'|
'AMBIGUOUS',salespersonId:uuid|null}}`. Options are distinct real retained root
owner IDs with current User.fullName/actual nullable phone, including historical/suspended owners, sorted
fullName ASC,id ASC; no fixture labels, name-key authority or workforce department
filter. Optional legacy lookup compares exact current name or real retained submission
owner name, distinct owner IDs; only one match yields UNIQUE/id. MISSING/AMBIGUOUS
has null ID and requires explicit user choice, never silently clears/broadens a filter.
Max5000 options/8MiB output is complete-or-fail422, not a hidden partial dropdown.

Approvals query `tab:PENDING|RETURNED|APPROVED|ALL` defaults PENDING; data is
`{items:AdministrationOrderSummary[],pagination,counts:{pending,returned,approved,all}}`.
APPROVED includes roots with actual retained `approvedAt`, including downstream and
cancelled history; it is oversight, not a second approval action. Search affects both
rows/counts; tab selects rows, with tab counts for that same search scope.

Corrections query `tab:ACTIVE|RESOLVED|ALL` defaults ACTIVE. Data:
`{items:[{id,orderId,businessNumber,customerName,pieceId,position,model,target,
cycle,state,reason,instructions,rejectedAt,resolvedAt}],pagination,
counts:{active,resolved,all,activePieces}}`. `id` is actual quality cycle ID;
state is existing OPEN/ACCEPTED/REJECTED/CANCELLED, rejectedAt is its real rejection
event time, no fabricated segment dates. Sort rejectedAt DESC,id DESC. ActivePieces
counts distinct pieces on OPEN cycles, while active/resolved/all count cycle rows.

Delivery-exceptions query `tab:FAILED|OVERDUE|DISPATCHED|ALL` defaults FAILED; data
`{items:AdministrationOrderSummary[],pagination,counts:{failed,overdue,dispatched,
all}}`, where all is distinct union. Search affects all counts and rows; tab then
restricts rows. Sort createdAt DESC,id DESC. Read-only oversight links to owning
warehouse operations; P08 adds no duplicate delivery command.

## 5. Activity and report response shapes

`AdministrationActivityEvent` = `{id,orderId,orderVersion,businessNumber,
operation:'ADMIN_CANCEL'|'ADMIN_CORRECT',actor,occurredAt,reason,pieceIds,
changedFields,before,after}`. Actor reuses existing retained actor schema but must
have ADMIN role. pieceIds is sorted unique <=200; empty for correction.
changedFields is sorted code-point order, unique, and operation-specific:
ADMIN_CANCEL contains `cancellation` and adds `total`/`status` exactly when those
facts change; ADMIN_CORRECT contains exactly the nonempty changed subset of
`generalNotes,customerName,customerPhone,customerEmail,customerAddress`.
before/after use command facts below. Full events are restricted to the protected
administration activity/history API; retained command facts additionally remain in
its actor-bound receipt/observation protocol. No current-directory rename replaces
historical actor data.

`AdministrationOrderActivityEvent` is the separate strict summary
`{id,orderId,orderVersion,businessNumber,operation,actor,occurredAt,pieceIds,
changedFields}`. Its identifiers/actor/time/operation/selection/changed-field rules
are identical to the full event, including sorted unique IDs (1–200 for cancellation,
empty for correction). It has no reason, before/after object, contact value, general
note, money value or arbitrary free text. These keys are rejected, not stripped.
Emit this exact variant in existing `salesActivityItemSchema` /
`SalesActivityItem` and `salesOrderActivityDataSchema` for owner-sales and approval
mixed-history endpoints. That projection stays the same when the caller is ADMIN;
having an ADMIN actor does not switch an existing endpoint to full admin history.
Existing ownership/approval authorization still applies. A field name such as
customerPhone reports which category changed and discloses no old/new value.

`AdministrationOperationalActivityEvent` is a separate strict safe shape:
`{id,orderId,orderVersion,businessNumber,operation:'ADMIN_CANCEL',actor,occurredAt,
pieceIds,beforeStatus,afterStatus}`. It contains no reason, notes, changedFields,
before/after JSON, contact, price, total, paid or other changed values. Existing
factory/warehouse history authorization and department relation still apply before
mapping it. Omit ADMIN_CORRECT events from those operational history projections;
the owner-sales/approval summary above is their separate policy. No full-event
object is spread into either safe variant and no Prisma object crosses the boundary.

### Operational order-history containers

Preserve the existing standalone feed schemas/types and source populations:
`manufacturingHistoryItemSchema` / `ManufacturingHistoryItem`,
`manufacturingActivityDataSchema` / `ManufacturingActivityData`,
`qualityActivityItemSchema` / `QualityActivityItem`,
`qualityActivityDataSchema` / `QualityActivityData`, and warehouseActivityDataSchema
keep their present non-administration variants. In particular, do not widen a feed
merely because its old schema is also reused by order history.

In `packages/contracts/src/manufacturing/manufacturing.schema.ts`, create
`manufacturingOrderHistoryItemSchema` by composing the existing
manufacturingHistoryItemSchema options plus the strict
`{kind:'administration',event:administrationOperationalActivityEventSchema}` item;
export inferred `ManufacturingOrderHistoryItem` through the existing package index.
Rebuild the existing manufacturingOrderHistoryDataSchema as its own strict object
`{department:manufacturingDepartmentSchema,orderId:salesUuidSchema,
events:ManufacturingOrderHistoryItem[0..100],pagination:paginationMetaSchema}`.
Preserve limit<=100, events.length<=pagination.limit, kind-qualified distinct IDs
and every event.orderId===page.orderId. For each existing manufacturing/issue item,
retain exact event.department===page.department. For administration, require its
strict minimal schema/ADMIN_CANCEL; it has no department field and must not acquire
a fabricated one. Requested-department relevance is separately enforced by the
owning server query before projection. Do not use .safeExtend of the old feed and
accidentally retain its event.department predicate for an administration event.

In `packages/contracts/src/quality/quality.schema.ts`, compose proposed
`qualityOrderHistoryItemSchema` from the existing qualityActivityItemSchema options
plus that same minimal administration item; export `QualityOrderHistoryItem`.
Rebuild qualityOrderHistoryDataSchema independently as strict
`{department:'QUALITY',orderId:salesUuidSchema,
events:QualityOrderHistoryItem[0..100],pagination:paginationMetaSchema}` with the
current limit/pageContains/kind-qualified-distinct/order-ID refinements unchanged
for the complete page. Quality has no event.department equality predicate to add.
The existing public QualityActivityItem stays narrow; the shared
QualityHistoryEventContent presentation accepts QualityOrderHistoryItem so the old
feed's narrower items remain assignable without a cast or a new feed branch.

Warehouse already has separate own-feed and order-history containers. Extend only
warehouseHistoryItemSchema with the minimal administration item; preserve
warehouseOrderHistoryDataSchema's existing limit/pageContains/order-ID/distinct-key
refinements and the warehouse-only feed unchanged. None of these schemas performs
resource authorization; preserve actual current service/query relation checks.

Extend discovered manufacturing.schema.test.ts, quality.schema.test.ts and
warehouse.schema.test.ts under their existing contracts directories. Accept
legitimate minimal admin order-history rows without department; reject added fake
department/private keys, wrong-order events, duplicate kind/ID and malformed pages.
Existing wrong-department manufacturing/issue rows must still fail. The unchanged
standalone feed schemas reject administration rows. Real cross-department/resource
denial and query relevance are separate PostgreSQL/HTTP cases in B04, not a DTO's
claim to have proven permission.

`administrationActivityItemSchema` in administration.schema.ts composes the
six existing non-administration strict items unchanged plus
`{kind:'administration',event:administrationActivityEventSchema}`. Reuse the existing
six item objects as proposed exported readonly tuple
`nonAdministrationActivityItemSchemas` in sales-orders.schema.ts; existing
salesActivityItemSchema composes that tuple plus its owner-safe administration
member, and administrationActivityItemSchema composes the same tuple plus the full
member. No base schema imports an administration read schema. Do not derive the
safe member by stripping a full object at a public mapper. The corresponding
`AdministrationActivityItem` is its inferred type.
`AdministrationActivityData` = `{events,pagination,context}`; events <=100 each with a
discriminant `kind:'draft'|'order'|'approval'|'manufacturing'|'quality'|'warehouse'|
'administration'` and exactly its designated event body. Context is the endpoint
echo defined in §2. Normalize SQL UNION columns for filtering/paging, then use the
owning mapper/schema. Sort occurredAt DESC,eventId DESC,kind ASC, preserving the
existing mixed-history tie-breaker. Search matches displayed action label, business
number/internal order UUID, retained actor name or that projection's permitted
event note as one OR group. Optional orderId is ANDed before count/pagination.
Order history uses identical event projection with fixed orderId, never independently
concatenated page1s. Never match private administration reason/values in owner-safe
or operational projections: hidden search hits must not disclose their existence.

### Canonical action labels and search

Create the browser-safe owner
`packages/contracts/src/sales-orders/order-activity-labels.ts` and its discovered
`order-activity-labels.test.ts`. Export from the package index:

- `orderActivityActionSchema` and inferred `OrderActivityAction`, strict discriminated
  union `{kind,operation}` with the finite bindings below;
- `orderActivityActionLabels`, a readonly nested kind→operation→product-label record
  exhaustive for that union; this is the sole action-label data owner for the
  administration activity surface and the operation-label wrappers below;
- `toOrderActivityActionLabel(action:OrderActivityAction):string`;
- `findOrderActivityActions(search:string):readonly OrderActivityAction[]`, returning
  every matching pair in kind ASC/operation ASC order, no duplicates. Compare
  `label.toLowerCase().includes(search.trim().toLowerCase())`; a blank search returns
  an empty pair list and the query caller omits the search predicate entirely.

| Kind           | Exact operation set                                                                          | Existing label value owner to move unchanged                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| draft          | CREATE_DRAFT, SAVE_DRAFT                                                                     | the two `toSalesActivityRow` draft-branch labels in `apps/web/src/features/sales/model/order-view.model.ts`                                                                                                                                 |
| order          | SUBMIT_NEW_ORDER, SUBMIT_DRAFT, RESUBMIT_ORDER, SET_ORDER_PAID                               | `orderOperationLabels` in that same file                                                                                                                                                                                                    |
| approval       | APPROVE_INITIAL, RETURN_INITIAL, REPORT_ISSUE, RESOLVE_ISSUE, SUBMIT_CONTACT, REVIEW_CONTACT | `approvalOperationLabels` in that same file                                                                                                                                                                                                 |
| manufacturing  | RECEIVE_AND_START, CONTINUE, COMPLETE_TRANSFER                                               | `operationLabels` in `apps/web/src/features/manufacturing/model/manufacturing-event.model.ts`                                                                                                                                               |
| quality        | RECEIVE_AND_START, CONTINUE, INSPECT, REPORT_ISSUES                                          | `operationLabels` in `apps/web/src/features/manufacturing/model/quality-event.model.ts`                                                                                                                                                     |
| warehouse      | RECEIVE, DISPATCH, CONFIRM_DELIVERY, FAIL_DELIVERY, RETRY_DELIVERY                           | `operationLabels` in `apps/web/src/features/warehouse/model/warehouse-event.model.ts`                                                                                                                                                       |
| administration | ADMIN_CANCEL, ADMIN_CORRECT                                                                  | cancellation uses the static administrative-cancellation prefix of `createApprovalActions.adminCancelQuantity` in `apps/web/src/features/prototype/state/approval-actions.ts`; correction uses the fixed information-correction label below |

The new ADMIN_CORRECT product label has the exact Unicode value encoded by the JSON
string `"\u062a\u0635\u062d\u064a\u062d \u0628\u064a\u0627\u0646\u0627\u062a \u0623\u0645\u0631 \u0627\u0644\u062a\u0641\u0635\u064a\u0644 \u0625\u062f\u0627\u0631\u064a\u0627\u064b"`
(administrative order-information correction). It makes no claim that work reopens.
ADMIN_CANCEL uses the existing prefix encoded by the JSON string
`"\u0625\u0644\u063a\u0627\u0621 \u0625\u062f\u0627\u0631\u064a"`, without quantity
interpolation; quantity is separate actual selected-piece context.
Source schemas use the existing primitive command-operation schemas; draft/order
use the corresponding extracts of salesCommandOperationSchema. Administration uses
the proposed administrationOperationSchema. This owner imports no event/full-order
schema, web module, Prisma, Node API or administration read schema, so the label
registry cannot create a mixed-event cycle.

Existing `toSalesActivityRow`, `toManufacturingOperationLabel`,
`toQualityOperationLabel`, `toWarehouseOperationLabel` and proposed
`toAdministrationOperationLabel` delegate this one record. Remove their relocated
operation-label maps; leave field/decision/status/summary formatting at its current
owner. The existing approval-decision screen has deliberately different contextual
labels in its own operationLabels; preserve those old labels and add an explicit
administration summary branch delegated to this registry. It is not an alternate
label source for global activity search. The API calls findOrderActivityActions
once for normalized search and adds
matching kind/operation pairs as bound predicates to its merged identity source
before both count and page. No SQL CASE label copy, label table, client-supplied
operation-pair authority, frontend-only filtering or new dependency is introduced.

### Report response

Report metadata: `{generatedAt:instant,businessDate:date,businessTimeZone:string,
generatedBy:{id,fullName},filters:normalized filters,effectiveFrom:date|null,
effectiveTo:date|null,cohort:{kind:'MIXED'|'SUBMITTED'|'DRAFT',orderCount},complete:boolean}`.
This is an immutable-in-response snapshot, not a saved official report/document ID.
`generatedAt` is actual server time. No fabricated registration/reference/title.

Common report facts:

- `kpis:{orders,originalPieces,cancelledPieces,activePieces,receivedPieces,
completionPercent,readyOrders,deliveredOrders,overdueOrders}`; aggregate percent
  uses 0 for no active, 100 iff equality, otherwise min99 rounded ratio.
- `departments:[{department,pieces}]` includes four production departments plus
  `AWAITING_APPROVAL`/`WITH_COURIER`/`DELIVERED` context buckets as separate explicit
  current-status categories; production department distribution does not include
  delivered/cancelled pieces. Preserve the five existing printed distribution rows:
  four production departments and WITH_COURIER shipping context. Context is not a
  new department; do not render an additional invented workspace.
- `exceptions:{categoryCases,distinctOrders,overdueOrders,failedOrders,
correctionHistoryOrders,returnedOrders}` counts same cohort. A historical
  quality correction category includes actual retained cycle history; a current
  RETURNED revision is distinct. UI labels overlapping category cases honestly.
- Report row fields: `{kind:'draft'|'submitted',orderId,businessNumber:string|null,
displayReference,type,status,createdAt,deliveryDate,
customer:{name:string|null,phone:string|null,address:string|null},
salesperson:{id,fullName},counts,currentDepartments,
isOverdue,hasQualityCorrectionHistory,isCurrentlyReturned}`. Submitted contact
  fields are effective approved-scope order values; drafts use actual linked customer
  values or honest nulls. `displayReference` is the actual issued business number or
  the actual internal draft UUID, never an invented issued number. Draft physical
  counts are all zero, admin labels distinguish draft from submitted. No finance/
  email/notes/specification payload in operational report rows. Address preserves
  the existing ADMIN report detail field without widening other roles.
- `workforce:{scope:{kind:'CURRENT_DIRECTORY',department:null|Department},
activeStaff,totalStaff,items:[{id,fullName,phone,role,department,status}]}`.
  Scope is independent of order date/type/status/salesperson filters; only assigned
  department filters membership. Include current extant P01 directory entries with
  actual statuses, including no-assignment entries under no department filter.
  Historical actors are not manufactured into current roster entries.
- `endorsements:{mode:'MANUAL',signatories:[]}` renders existing blank roles/signoff
  spaces; no generated executive identity, stamp or approval claim.

Screen response `AdministrationReportData` = `{meta,kpis,departments,exceptions,
orders:{items:ReportRow[],pagination},workforce,endorsements}`; `complete` refers to
aggregate consistency, not that screen order page contains every row. Print
response `AdministrationReportPrintData` has `orders:{items:ReportRow[],total}`
and `exceptionRows:[{orderId,businessNumber,customerName,category:
'OVERDUE'|'DELIVERY_FAILED'|'QUALITY_CORRECTION_HISTORY'|'RETURNED_FOR_CORRECTION',
currentDepartments,deliveryDate}]`; no pagination input, `complete:true` only after
all rows/sections serialized successfully. Each order appears once per category.

Technical safeguards, not business capacity promises: print max5000 order rows,
max5000 workforce rows, max20000 exception cases, max8MiB UTF-8 serialized data;
screen response max100 order rows plus max5000 roster rows and same8MiB guard.
Count before materializing arrays; assemble no partial response. Exceeding any
guard returns 422 `REPORT_SCOPE_TOO_LARGE` with no report data. UI retains filters
and explains narrowing; never silently remove staff/orders or claim truncated output
as complete. SQL counts/aggregates remain bounded in query count, with timeout and
indexed cohort predicates; do not fetch all physical pieces to aggregate in JS.

## 6. Commands and retained result

Common body `{commandId:uuid,operation,orderId:uuid,expectedVersion:version}`.
Single-order commands match existing detail dialogs; no unsolicited multi-order
admin command is introduced.

ADMIN_CANCEL adds `{scope:'ORDER'|'ITEM'|'QUANTITY',pieceIds:uuid[1..200],
reason:string|null}`. Missing/blank reason normalizes to null; derive the honest
scope description server-side for audit. Sort IDs for hashing but reject duplicates
before sorting. ORDER must equal every active identity and every member must be eligible; do not
silently omit an ineligible active member. ITEM contains exactly the reviewed physical paper-row ID (one piece per row);
QUANTITY contains exactly selected candidates and quantity is length. No actor,
timestamp, total, claimed eligibility or manual quantity input is accepted.

ADMIN_CORRECT adds `{patch:AdministrationCorrectionPatch,reason:nonblank<=4000}`.
Patch fields and normalization:

- `generalNotes`: existing draft generalNotes bounded nullable text, max4000;
- `customerName`: `customerCaptureSchema.shape.name` (trimmed nonblank max150);
- `customerPhone`: existing `customerPhoneSchema` normalized canonical Saudi phone;
- `customerEmail`: existing customer patch email validation, nullable; blank clears;
- `customerAddress`: existing customer patch address validation max2000, nullable.

Every field optional but at least one present; omitted preserves, explicit optional
null/blank clears. No master uniqueness check on order-only corrected phone. Reject
NUL/over-limit/forbidden fields. Normalized no-effective-change is409 unchanged.
No required field can clear. Reason must remain nonblank and <=4000 after trim.

`AdministrationCorrectionValues` is the complete five-field effective object above.
`AdministrationCommandData` = `{receipt:{commandId,operation,orderId,beforeVersion,
afterVersion,actor,occurredAt},replayed:boolean,result:{orderId,version,status,
counts,money,correction:AdministrationCorrectionValues,pieceIds},before,after}`.
before/after are complete facts `{version,status,counts,money,correction,pieces,
returnProof}`; returnProof is null except RETURNED, where it contains actual
`{decisionId,reason,returnedAt,version}` to witness unchanged decision/reason/time
through the contiguous current-applicability version chain.
pieces contain `{id,stage,workState,issueId,currentWorkVisitId,receivedAt,cancelledAt,
cancellationReason}` for all physical rows <=200. Never return Prisma records.
Receipt afterVersion=beforeVersion+1=result.version=after.version; all IDs agree.
Money uses exact existing sales-order money meaning. Move the existing private
moneySchema and current/retained count schema definitions into proposed
`packages/contracts/src/sales-orders/order-facts.schema.ts`, exporting
`salesOrderMoneySchema`, `currentOrderCountsSchema`, `retainedOrderCountsSchema` from
that owner. Existing sales-orders.schema imports/reexports the same count symbols
and uses/reexports salesOrderMoneySchema unchanged. Contracts index exports that
public money name for frontend exact-cents previews. Administration command/event schemas import
facts from that primitive owner rather than sales-orders.schema. This prevents the
cycle sales-orders → mixed admin event → admin command → sales-orders while preserving
all existing public types/refinements. No duplicate numeric/count schema is created.

Current actor alone can observe/replay their own command, with current eligible
ADMIN authority. Different actor sees 404 on observe and409 on same-ID execute,
without private receipt content. Exact replay returns stored facts even after later
order changes; clients then read current order. Observation404 under the serialized
command lock means no retained command at that observation point, not failure of an
in-flight pre-request never yet sent. Retry only original ID+intent after observation,
never mint a new ID to repair an uncertain effect.

## 7. Compatibility and required verification

Coordinate contracts/API/frontend/OpenAPI in one deployment. Existing auth/transport,
paid commands, official print eligibility and domain event variants remain intact.
Add administration activity variants only to authorized mixed activity consumers;
the existing sales/approval mixed union always uses AdministrationOrderActivityEvent,
administration API uses the full AdministrationActivityEvent, and factory/warehouse
use AdministrationOperationalActivityEvent for cancellation only. No client role or
untrusted projection field enlarges the selected shape.

Concrete tests must prove every strict query/body/output shape, canonical ID/hash,
field omission/clear/invalid handling, filtered row/count consistency, complete report
limits, exact role denial, source-label search before count/page, three-way activity
privacy and same-ID recovery. Real PostgreSQL/HTTP/browser evidence
is future IMPLEMENT work; this contract describes no executed endpoint or test.
