# P05 HTTP and executable-contract design

This is the proposed canonical wire and public-interface ledger for [P05](../spec.md), not implemented endpoints or executed evidence. [Backend design](../backend-design.md) owns algorithms and transaction/query enforcement; [data model](../data-model.md) owns persistence; [frontend design](../frontend-design.md) owns presentation, keys and recovery state. Root `plan.md` remains the protected project roadmap. Every path below is relative to the configured `/api/v1` prefix.

## C01. Existing owners and proposed contract files

Reuse installed Zod `4.4.3` and the existing `successEnvelopeSchema`, `paginationMetaSchema`, `paginationQueryFields`, `isSafePaginationWindow`, `nonEmptyBoundedString`, `salesUuidSchema`, `salesVersionSchema`, `salesInstantSchema`, `salesOrderTypeSchema`, `salesOrderStatusSchema`, `orderPieceStageSchema`, `orderWorkStateSchema`, `salesBusinessNumberSchema`, `approvalActorSchema`, `factoryOrderPieceSchema`, `factoryOrderSchema` and `factoryOrderPaperDataSchema`. These already exist and are publicly exported from `packages/contracts/src/index.ts`. `FactoryOrderPiece`, `FactoryOrderProjection` and `FactoryOrderPaperData` are existing inferred public types.

Create these browser-safe owners; no Prisma, Express, filesystem, environment or provider imports enter them:

| Proposed file                                                          | Responsibility                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/manufacturing/manufacturing-command.schema.ts` | Department/operation values, exact batch input, immutable receipt/outcome and cross-field validation                  |
| `packages/contracts/src/manufacturing/manufacturing-event.schema.ts`   | Safe per-order work-event summary; imports scalar values and command schemas only, never full order/approval wrappers |
| `packages/contracts/src/manufacturing/manufacturing.schema.ts`         | Read queries, visits, contexts, queue/detail/history output and safe issue-history projection                         |
| `packages/contracts/src/index.ts`                                      | Deliberate exports of every named public schema/type below                                                            |

`sales-orders/sales-orders.schema.ts` imports only the new event owner to add the `kind:'manufacturing'` activity variant. The event owner must not import that full sales-order schema or `approval.schema.ts`, avoiding an import cycle. Existing sales/approval receipt enums, results, frozen snapshots and `draft`/`order`/`approval` activity variants remain unchanged.

## C02. Values, parsing and request bounds

All new objects are strict at every nested level. Reject unknown keys, including actor/role, prices, timestamps, states, counters, destination, visit identity and alternate order/piece IDs. Nullable means explicit `null` is required in a response; an omitted nullable response field is malformed. No command accepts client-selected workers or business facts.

| Public schema / type                                                    | Exact meaning                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `manufacturingDepartmentSchema` / `ManufacturingDepartment`             | `CUTTING \| PRODUCTION`                                                                       |
| `manufacturingDepartmentPathSchema` / `ManufacturingDepartmentPath`     | URL literal `cutting \| production`; map explicitly to the corresponding uppercase department |
| `manufacturingViewSchema` / `ManufacturingView`                         | `INCOMING \| IN_PROGRESS \| RETURNED \| COMPLETED`                                            |
| `manufacturingCommandOperationSchema` / `ManufacturingCommandOperation` | `RECEIVE_AND_START \| CONTINUE \| COMPLETE_TRANSFER`                                          |
| `manufacturingDepartmentParamsSchema` / `ManufacturingDepartmentParams` | `{department:ManufacturingDepartmentPath}`                                                    |
| `manufacturingOrderParamsSchema` / `ManufacturingOrderParams`           | `{department:ManufacturingDepartmentPath,orderId:UUID}`                                       |
| `manufacturingCommandParamsSchema` / `ManufacturingCommandParams`       | Alias the existing strict `{commandId:UUID}` meaning of `salesCommandParamsSchema`            |

UUIDs use the existing lowercasing UUID parser. Versions are integer `1..2147483647`; an accepted update must remain inside that range. Instants are offset-aware ISO strings, emitted in UTC. General actor snapshots reuse the complete strict `approvalActorSchema`: `{id,fullName,role,department}`, full name maximum 150, existing account enums, nullable department. A command additionally requires ADMIN or an employee whose captured department equals the command department; an approval actor ending an interrupted/cancelled visit is not incorrectly classified as a manufacturing worker.

Read `search` is optional textual input, trimmed, maximum 150 characters before matching, rejects NUL; blank normalizes to omission. It is a literal case-insensitive substring, not client SQL or a regular expression. Queue search examines authorized order UUID/business number/customer name and matching piece UUID/model/position text/latest known actual worker name. A piece-level search match includes that piece only; an order-level match includes all pieces otherwise matching the view. `type` is an optional existing seven-type enum. There is no urgency, phone, financial or arbitrary actor filter.

Use existing page/limit parsing, safe offset validation and pagination metadata. Defaults are page 1/limit 25. Grouped orders allow limit `1..25`; flat pieces and activity/history allow `1..100`. The UI explicitly requests 10 where its existing table displays 10. Grouped page size is narrower because every summary includes up to 200 exact matching IDs; no full specifications are embedded per group. These are transport/work bounds, not commercial capacity rules.

The work-command technical request budget is at most **200 selected physical pieces in total**, at most 200 nonempty order groups, with at most 200 pieces in any order. This reuses the existing per-order bound as a conservative bounded transaction/selection budget, preventing an unbounded cross-order request. It does not lower the accepted order size, cap the department's backlog or authorize silently splitting one user confirmation into separately committed commands. Reject an over-budget selection with a field error and let the worker explicitly select a smaller set.

## C03. Exact batch input and immutable result

`manufacturingCommandBodySchema` / `ManufacturingCommandBody` is:

`{commandId:UUID,operation:ManufacturingCommandOperation,orders:[{orderId:UUID,expectedVersion:Version,pieceIds:UUID[]}]}`.

Every array is nonempty. Order groups are distinct; piece IDs are distinct both within each group and across the complete body. Reject duplicates rather than deduplicating. The route owns department; there is no duplicate department field in the body. Each `expectedVersion` is the existing `sales_drafts.version` of that order. No input `visitId` is needed: exact piece identity plus the root version prevents stale intent from authorizing a later correction visit. Validate current membership and department before any mutation, not merely UUID syntax.

Canonical hashing sorts normalized order groups by UUID and each `pieceIds` array by UUID, then hashes department, operation, order IDs, expected versions and exact piece membership. Actor identity is separately bound by the retained command row and checked with that hash. Reordering the same set is the same intent. Changing any bound value under an existing command ID is a conflict. The hash is server-only, never proof supplied by the browser.

| Public schema / type                                                | Complete fields                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `manufacturingPieceOutcomeSchema` / `ManufacturingPieceOutcome`     | `{pieceId:UUID,visitId:UUID,nextVisitId:UUID\|null,stage:OrderPieceStage,workState:OrderWorkState}`                                  |
| `manufacturingOrderOutcomeSchema` / `ManufacturingOrderOutcome`     | `{eventId:UUID,orderId:UUID,beforeVersion:Version,afterVersion:Version,pieces:ManufacturingPieceOutcome[]}`                          |
| `manufacturingCommandReceiptSchema` / `ManufacturingCommandReceipt` | `{commandId:UUID,operation:ManufacturingCommandOperation,department:ManufacturingDepartment,actor:ApprovalActor,occurredAt:Instant}` |
| `manufacturingCommandOutcomeSchema` / `ManufacturingCommandOutcome` | `{orders:ManufacturingOrderOutcome[]}`                                                                                               |
| `manufacturingCommandDataSchema` / `ManufacturingCommandData`       | `{kind:'manufacturing-command',receipt:ManufacturingCommandReceipt,replayed:boolean,outcome:ManufacturingCommandOutcome}`            |

Response groups/pieces are sorted by normalized UUID. Validate the same 200-piece total, distinct order/piece/event IDs, nonempty groups, and `afterVersion = beforeVersion + 1` once per affected root. `eventId` is the unique per-order command-summary identity; `visitId` identifies the source visit acted upon, including a visit just completed. `nextVisitId` is the new production visit for cutting completion and otherwise null. Return only safe immutable accepted facts, never a saved financial order, full request payload, dynamic action hints or current specifications.

| Operation                       | Required current state                                                                              | Accepted per-piece outcome                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `RECEIVE_AND_START`             | Approved, current requested department, active nonblocked incoming piece and its current open visit | Same stage, `IN_PROGRESS`, source visit retained, no next visit; actual receipt/start and original starter recorded together |
| `CONTINUE`                      | Approved, current requested department, active nonblocked in-progress piece/current visit           | Same stage and `IN_PROGRESS`, original starter unchanged, actual continuation actor/time retained; no next visit             |
| `COMPLETE_TRANSFER`, cutting    | Current eligible cutting in-progress visit                                                          | `PRODUCTION/INCOMING`, old visit ends, new production visit ID returned                                                      |
| `COMPLETE_TRANSFER`, production | Current eligible production in-progress visit                                                       | `QUALITY/INCOMING`, old visit ends, `nextVisitId:null`; no quality/warehouse acceptance                                      |

The owner-confirmed atomic unit is the **entire exact selection**, including across orders. Any validation, current authority, relation, version, eligibility or required-write failure rejects it without changes to any selected piece, root, visit, movement or history. No partial-result/success array, eligible-subset filtering or background continuation is permitted. Repeated committed intent returns its original result with `replayed:true`, even after later work changes; it does not publish that old result as current state.

For a new CONTINUE intent, the same already-latest actual worker produces `MANUFACTURING_WORK_UNCHANGED` without an event/version change; `canContinue:false` expresses that state. Exact committed command replay is resolved before this check. A → B → A are distinct permitted continuations, and completion/reporting remains available to eligible colleagues regardless of latest worker. An unknown legacy original start is not fabricated when a real colleague continues.

## C04. Work visits and safe piece context

`manufacturingWorkVisitSchema` / `ManufacturingWorkVisit` contains exactly:

| Field                                | Wire type / meaning                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `id`, `pieceId`                      | UUIDs                                                                                              |
| `department`                         | `ManufacturingDepartment`                                                                          |
| `sequence`                           | Integer `1..2147483647`, per-piece visit sequence across all manufacturing departments             |
| `origin`                             | Strict `{kind,sourceDepartment,eventId,issueId,referenceId,correctionCycle,instructions}` as below |
| `enteredAt`                          | Instant or null for genuinely unknown legacy provenance                                            |
| `receivedAt`, `startedAt`, `endedAt` | Instant or null                                                                                    |
| `receivedBy`, `startedBy`, `endedBy` | General safe actor snapshot or null; derived from retained actual command witnesses                |
| `endReason`                          | `TRANSFERRED \| ISSUE_REPORTED \| CANCELLED \| null`                                               |
| `destination`                        | `PRODUCTION \| QUALITY \| null`; nonnull only for transfer                                         |
| `legacyUnknownStart`                 | Boolean marking an inherited in-progress record whose original start/worker cannot be established  |

Origin `kind` is `INITIAL_APPROVAL \| APPROVAL_RETURN \| DEPARTMENT_TRANSFER \| QUALITY_CORRECTION \| LEGACY_BASELINE`. `sourceDepartment` is an existing department or null. `eventId` is the actual source P04 command ID or per-piece P05 transfer-event ID, otherwise null; `issueId` is the retained source issue or null. `referenceId` is a future P06 correction witness or null, not an invented inspected result. `correctionCycle` is an integer `1..2147483647` only for QUALITY_CORRECTION and otherwise null; persist it as `sourceCorrectionCycle` with the actual future correction reference. It is the P06 correction-cycle identity, distinct from the piece's visit `sequence` across departments; P04 issue IDs retain their own separate cycles. `instructions` is null or retained nonblank text up to 4000 characters, only approved manufacturing guidance; no contact correspondence/proposed specifications.

Required cross-field refinements: known receipt/start/end actor and timestamp agree as pairs; an end requires an end reason; destination exists exactly for transfer and is the normal next department. Started work with unknown legacy provenance uses null original start/actor plus `legacyUnknownStart:true`, not an invented employee/time. New work always records real receipt/start. A visit's original starter never changes when a colleague continues. Older visits are retained. A department visit receipt is never `SalesOrderPiece.receivedAt`, which retains physical warehouse meaning.

`manufacturingPieceContextSchema` / `ManufacturingPieceContext` is:

`{pieceId:UUID,visit:ManufacturingWorkVisit|null,lastAction:null|{eventId:UUID,commandId:UUID,operation:ManufacturingCommandOperation,actor:ApprovalActor,occurredAt:Instant},isReturned:boolean,allowedActions:{canReceiveAndStart:boolean,canContinue:boolean,canCompleteTransfer:boolean,canReportIssue:boolean}}`.

`visit` is the latest requested-department visit for that piece, including an ended visit; it is not necessarily the piece's current visit. `lastAction.eventId` is the actual per-piece work-event identity; no work witness means null. Current action hints require the piece/current open visit in the requested department and the same server predicates used by commands. A historical relation or ended visit never enables work. `canReportIssue` uses P04's current incoming/in-progress source rule. Hints aid rendering, never replace write authority. `isReturned` follows the exact FR-005 current held/released-correction rule, not the mere existence of old rejection history.

## C05. Queue, dashboard and detail DTOs

`manufacturingOrderHeaderSchema` / `ManufacturingOrderHeader` is the minimal safe strict header:

`{id:UUID,version:Version,type:SalesOrderType,status:SalesOrderStatus,businessNumber:SalesBusinessNumber,customerName:NonblankString150,deliveryDate:existing nullable validated date-only value,counts:existing factoryOrderSchema counts}`.

The reused count object retains `original,cancelled,active,received,completionPercent` and its exact inherited invariants. No prices, private customer fields, owner credentials or financial eligibility appear.

`manufacturingOrderSummarySchema` / `ManufacturingOrderSummary` extends that header with `{matchingPieceIds:UUID[],matchingPieceCount:integer,lastWorkAt:Instant|null}`. IDs are distinct, `1..200`; count equals their length. Membership is the actual current query scope, not every piece in the order. `lastWorkAt` is the latest relevant work/entry/issue instant among matching pieces; unknown historical provenance remains null.

`manufacturingDashboardOrderSummarySchema` / `ManufacturingDashboardOrderSummary` extends that summary with `{hasInProgress:boolean}`. Dashboard matching IDs are the union of current requested-department incoming/in-progress pieces; `hasInProgress` is true exactly when at least one of those matching pieces is in progress. This preserves the existing active-order badge without a per-row detail request.

`manufacturingPieceRowSchema` / `ManufacturingPieceRow` is `{order:ManufacturingOrderHeader,piece:FactoryOrderPiece,work:ManufacturingPieceContext}`; the piece/context IDs agree. Reuse the current strict piece specification owner, including original labels, measurement placement and distinct `soleAddition`/`additions`. Do not wrap a financial order and delete fields afterward.

| Public schema / types                                                                          | Exact fields                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manufacturingOrdersQuerySchema` / `ManufacturingOrdersQueryInput`, `ManufacturingOrdersQuery` | `{view,page,limit,search?,type?}`; grouped bounds C02                                                                                                                                                                            |
| `manufacturingPiecesQuerySchema` / `ManufacturingPiecesQueryInput`, `ManufacturingPiecesQuery` | Same fields plus optional `orderId:UUID`; flat bounds C02                                                                                                                                                                        |
| `manufacturingOrdersDataSchema` / `ManufacturingOrdersData`                                    | `{department,view,items:ManufacturingOrderSummary[],counts:{orders:SafeCount,pieces:SafeCount},pagination}`; at most 25 items                                                                                                    |
| `manufacturingPiecesDataSchema` / `ManufacturingPiecesData`                                    | `{department,view,items:ManufacturingPieceRow[],counts:{orders:SafeCount,pieces:SafeCount},pagination}`; at most 100 items                                                                                                       |
| `manufacturingDashboardDataSchema` / `ManufacturingDashboardData`                              | `{department,counts:{incoming:QueueCount,inProgress:QueueCount,returned:QueueCount,completed:QueueCount,repairs:QueueCount},recentOrders:ManufacturingDashboardOrderSummary[]}`; at most five active incoming/in-progress groups |
| `manufacturingOrderDataSchema` / `ManufacturingOrderData`                                      | `{department,paper:FactoryOrderPaperData,work:ManufacturingPieceContext[]}`; one context per `paper.order.pieces` identity, maximum 200                                                                                          |

`SafeCount` is a nonnegative safe integer. `QueueCount` is strict `{orders:SafeCount,pieces:SafeCount}`. Group pagination counts matching distinct orders; flat pagination counts matching distinct pieces. Both `counts` objects describe the entire authorized filtered view, not the visible page. No order/piece counts are summed across overlapping queues. Zero totals produce zero totalPages; an out-of-range page has empty items with correct metadata, never another page/resource fallback.

Queue predicates are FR-004–006: current eligible incoming/in-progress; current originating holds or actual released correction visits for returned; successful latest applicable completion for completed, excluding active cancelled pieces and visits superseded by a new pending visit. Authorized history retains cancellations and previous visits. The same order may therefore appear in multiple views for different pieces.

The existing UI tab mapping is exact: `ready → INCOMING`, `in_progress → IN_PROGRESS`, `problems → RETURNED`, `completed → COMPLETED`. `/waiting` redirects to incoming and `/sent` to completed; these are UI aliases, not additional wire views. The production repair route uses INCOMING plus `type:REPAIR`.

After permission/view/search/type filtering, groups sort by `lastWorkAt DESC NULLS LAST,id DESC`. Flat pieces sort by their relevant work/entry/issue instant descending/nulls last, then piece UUID descending; do not insert an additional position/order tie-breaker. Dashboard individual counts use the same queue predicates; recent groups use the union of current INCOMING/IN_PROGRESS pieces, the same relevance sort and at most five groups. Production `repairs` counts and its existing route are `INCOMING + type REPAIR`; cutting returns zero repairs. Remove unsupported urgency/bypass claims. No calendar/today metric or new date-filter requirement is introduced.

Grouped expansion may load `ManufacturingOrderData` on demand; it must not eagerly fetch a full order per group to render initial summaries. Before a group action, its `matchingPieceIds` must all bind the expanded detail and its captured version; a different detail version requires refresh/review, never substitution with all order pieces. Exact batch confirmation displays the selected pieces/count/normal destination.

The new detail permits an eligible employee's current requested-department piece/issue relation **or retained requested-department receipt/start/continuation/completion/transfer history**, as accepted by FR-007. Then return the whole existing safe factory order context; departmental visits/history remain scoped. ADMIN uses the selected department with actual ADMIN identity. Existing GET `/manufacturing-orders/:orderId` retains its P04 current-resource rule unchanged; no widening of that legacy endpoint is necessary.

## C06. Safe activity, history and reload discovery

`manufacturingActivityEventSchema` / `ManufacturingActivityEvent`, defined in the cycle-safe event owner, is:

`{id:UUID,commandId:UUID,orderId:UUID,orderVersion:Version,businessNumber:SalesBusinessNumber,department:ManufacturingDepartment,operation:ManufacturingCommandOperation,actor:ApprovalActor,occurredAt:Instant,pieces:ManufacturingPieceOutcome[],destination:'PRODUCTION'|'QUALITY'|null}`.

`id` is the unique per-order command row's `eventId`; `orderVersion` is its accepted after-version. Pieces are the exact affected subset for that order, unique and at most 200. Destination is null for receive/start/continue, PRODUCTION for cutting completion and QUALITY for production completion. Command actor/department, operation and outcome states must agree with C03. Different orders from one batch have different event IDs but retain the same `commandId`, permitting durable correlation without a second activity authority.

Add exactly `{kind:'manufacturing',event:ManufacturingActivityEvent}` to the existing `salesActivityItemSchema`. Extend `findOrderActivity` to merge these retained per-order summaries with existing draft/order/approval items under its current order ownership/approval authority, sort and pagination. Keep P03/P04 history details and financial snapshot endpoints unchanged. The new work item has no raw payload or financial snapshot; consumers handle its discriminant explicitly instead of parsing it as an old P03/P04 event. No manufacturing revision-detail endpoint is introduced.

Factory activity uses a separate safe issue shape, never the broad P04 approval event/facts DTO:

`manufacturingIssueActivityEventSchema` / `ManufacturingIssueActivityEvent` is `{id:UUID,commandId:UUID,orderId:UUID,orderVersion:Version,businessNumber:SalesBusinessNumber,pieceId:UUID,issueId:UUID,department:ManufacturingDepartment,sourceDepartment:'CUTTING'|'PRODUCTION'|'QUALITY',operation:'REPORT_ISSUE'|'RESOLVE_ISSUE'|'REVIEW_CONTACT',result:'REPORTED'|'HELD_FOR_CONTACT'|'RELEASED'|'CANCELLED',target:'CUTTING'|'PRODUCTION'|null,actor:ApprovalActor,occurredAt:Instant,reason:BoundedText4000|null,notes:BoundedText4000|null}`.

Its `id` and `commandId` are the actual retained P04 command ID. `department` is the requested related factory context. Include only issue events whose source or positive release target relates to that department, with that order's current/historical safe relation. Map actual REPORT_ISSUE reason/optional report notes; positive release/acceptance permits retained approved work instructions in `notes`; cancellation permits its retained cancellation reason; referral/return-to-sales hold metadata has null text. Exclude contact submissions, proposed field values, SEND_TO_SALES/RETURN_TO_SALES correspondence, raw facts and financial change details. `REPORTED` corresponds only to REPORT_ISSUE; other result/operation/target combinations must match the actual retained decision. No pseudo-event is created for a guessed legacy action.

`manufacturingHistoryItemSchema` / `ManufacturingHistoryItem` is the strict discriminated union `{kind:'manufacturing',event:ManufacturingActivityEvent}` or `{kind:'issue',event:ManufacturingIssueActivityEvent}`.

| Public schema / types                                                                                            | Exact fields                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manufacturingActivityQuerySchema` / `ManufacturingActivityQueryInput`, `ManufacturingActivityQuery`             | `{page,limit,actor?:'me'}`; omitted actor means authorized department history, `me` restricts actual event actor to authenticated identity          |
| `manufacturingOrderHistoryQuerySchema` / `ManufacturingOrderHistoryQueryInput`, `ManufacturingOrderHistoryQuery` | `{page,limit,pieceId?:UUID}`; optional piece must belong to the authorized order; no first-piece fallback                                           |
| `manufacturingActivityDataSchema` / `ManufacturingActivityData`                                                  | `{department,events:ManufacturingHistoryItem[],pagination}`; at most 100 items                                                                      |
| `manufacturingOrderHistoryDataSchema` / `ManufacturingOrderHistoryData`                                          | `{department,orderId:UUID,events:ManufacturingHistoryItem[],pagination}`; at most 100 items, every event binds that order and optional piece filter |

Filter before count/page; order by occurredAt DESC, event ID DESC, then kind as stable tie-breaker. Both sources are read in one consistent snapshot. Do not perform a separate issue/actor lookup per returned row. An employee's history contains the requested department's actual work and safe related issue events, not another department's unrelated work or private contact conversation.

`actor:'me'` gives a bounded path to discover committed original command IDs after a full reload. A worker may GET its own work command result using the manufacturing event's `commandId`; its own REPORT_ISSUE event maps to the existing approval result observer. Other actors' events and release decisions are read-only history, not the current worker's recovery authority. Repeat per-order events for one batch resolve to the same one work-command receipt.

An absent recent event or 404 observer result does not prove an in-flight transaction rolled back. Do not automatically replace it with a different POST. Within the same QueryClient document, retain immutable unknown intent after dialog closure/navigation and observe it before another effect. QueryClient memory is not durable across document reload: use no sessionStorage/localStorage correlation or operational snapshot. A hard reload/new browser starts from authoritative work and bounded own activity; committed original IDs can then be observed. Do not claim that an unknown precommit guard or original request payload survives reload, reconstruct a missing payload, or automatically replay a recently discovered event. A separately reviewed new manual intent still carries current root versions, so a delayed prior command cannot duplicate a winning transition. These frontend limits do not weaken persistent replay, state or batch atomicity protections.

## C07. Routes, middleware and exact service interfaces

All new successes are HTTP 200 JSON through existing `ResponseHelper.ok`, including true empty lists and exact replay. `Cache-Control: private, no-store` applies to all these private reads and command results. Use the existing success/error envelopes, request IDs, UTF-8 JSON, credentials, refresh and CSRF behavior; no second HTTP protocol or Next server credential shortcut.

| Method/path                                                               | Request contracts                                                          | Success data                                | Current authority                                                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET `/manufacturing/:department/dashboard`                                | Department params; `salesEmptyQuerySchema`                                 | `ManufacturingDashboardData`                | Eligible selected department or ADMIN                                                    |
| GET `/manufacturing/:department/orders`                                   | Department params; `ManufacturingOrdersQuery`                              | `ManufacturingOrdersData`                   | Permission-filtered selected-department current/history queue                            |
| GET `/manufacturing/:department/pieces`                                   | Department params; `ManufacturingPiecesQuery`                              | `ManufacturingPiecesData`                   | Same view/filter relation; optional order remains protected                              |
| GET `/manufacturing/:department/orders/:orderId`                          | Order params; `salesEmptyQuerySchema`                                      | `ManufacturingOrderData`                    | C05 current/historical relation or ADMIN                                                 |
| GET `/manufacturing/:department/activity`                                 | Department params; `ManufacturingActivityQuery`                            | `ManufacturingActivityData`                 | Department-safe history; `actor:me` derived from session                                 |
| GET `/manufacturing/:department/orders/:orderId/history`                  | Order params; `ManufacturingOrderHistoryQuery`                             | `ManufacturingOrderHistoryData`             | C05 relation plus requested-department history scope                                     |
| POST `/manufacturing/:department/commands`                                | Department params; `salesEmptyQuerySchema`; `ManufacturingCommandBody`     | `ManufacturingCommandData`                  | Current selected department/ADMIN and exact current source pieces                        |
| GET `/manufacturing-commands/:commandId`                                  | Command params; `salesEmptyQuerySchema`                                    | `ManufacturingCommandData`, `replayed:true` | Actual original actor, currently eligible ADMIN or still in original captured department |
| POST `/manufacturing-orders/:orderId/pieces/:pieceId/issues` **existing** | Existing `approvalPieceParamsSchema`, `reportIssueBodySchema`, empty query | Existing `ApprovalCommandData`              | Existing current incoming/in-progress source rule; P04 owns execution                    |
| GET `/approval-commands/:commandId` **existing**                          | Existing command params and empty query                                    | Existing `ApprovalCommandData`              | Existing actor/source-department reporting recovery rule                                 |

New routes use business authentication → `authorizeDepartments(CUTTING,PRODUCTION)` → CSRF for POST → shared params/query/body validation → thin controller. Service then validates the requested URL department against current employee department; ADMIN is exempt from employee matching but not state/relation rules. Current eligibility is rechecked at protected writes. No application report/print surface or P06 QUALITY work operation is introduced.

Proposed API DTO aliases in `apps/api/src/modules/manufacturing/dto/manufacturing-read.dto.ts` re-export the exact params/query schemas with `DtoSchema` suffixes and corresponding types. `manufacturing-command.dto.ts` aliases `manufacturingCommandBodySchema` as `manufacturingCommandBodyDtoSchema`. They do not define new schemas. Existing P04 issue DTO remains owned by approval.

| Proposed `ManufacturingService` method | Signature/result                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dashboard`                            | `(actorId:string,department:ManufacturingDepartment):Promise<ManufacturingDashboardData>`                                                        |
| `listOrders`                           | `(actorId:string,department:ManufacturingDepartment,query:ManufacturingOrdersQuery):Promise<ManufacturingOrdersData>`                            |
| `listPieces`                           | `(actorId:string,department:ManufacturingDepartment,query:ManufacturingPiecesQuery):Promise<ManufacturingPiecesData>`                            |
| `getOrder`                             | `(actorId:string,department:ManufacturingDepartment,orderId:string):Promise<ManufacturingOrderData>`                                             |
| `activity`                             | `(actorId:string,department:ManufacturingDepartment,query:ManufacturingActivityQuery):Promise<ManufacturingActivityData>`                        |
| `orderHistory`                         | `(actorId:string,department:ManufacturingDepartment,orderId:string,query:ManufacturingOrderHistoryQuery):Promise<ManufacturingOrderHistoryData>` |
| `execute`                              | `(actorId:string,department:ManufacturingDepartment,input:ManufacturingCommandBody):Promise<ManufacturingCommandData>`                           |
| `observe`                              | `(actorId:string,commandId:string):Promise<ManufacturingCommandData>`                                                                            |

Existing `ApprovalService.reportIssue(actorId,orderId,pieceId,input:ReportIssueBody):Promise<ApprovalCommandData>` and `observe(actorId,commandId):Promise<ApprovalCommandData>` remain unchanged public interfaces. The backend design specifies a narrow same-transaction work-visit collaborator inside P04's existing operations; a nested new command executor is forbidden.

The web adapter receives `unknown`, parses the complete existing envelope with `parseApiResponse` and the named data schema, then checks route department/order/piece, selected identities and command correlation. For a submitted command, require exact command ID/operation/department, every requested order/before-version, after-version and exact piece set, normal outcome states and source/next-visit semantics. Observation requires the requested command ID. Parser or correlation failure is existing `ApiContractError`; never offline, empty, fake success or an automatic fresh command. Current data is refetched after confirmed result; historical outcomes are not current-state cache replacements.

## C08. Errors, existence privacy and replay

Keep the existing error envelope and `target.path` field errors, e.g. `body.orders.0.pieceIds`, `body.orders.0.expectedVersion`, `query.view`, `params.department`. Messages in the Arabic UI follow the spec's meaning/recovery matrix; safe stable codes retain their machine semantics. Do not expose raw selected foreign identifiers, SQL, snapshots, source text or validation internals in error messages.

| Status/code                              | Exact condition / response meaning                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 400 `VALIDATION_ERROR`                   | Unsupported field/value, invalid ID/type/version/page/window, empty/duplicate/over-budget selection; no write                   |
| 401 `UNAUTHORIZED`                       | Missing/invalid credentials under existing auth behavior                                                                        |
| 403 `ACCOUNT_RESTRICTED`                 | Current account no longer business-eligible                                                                                     |
| 403 `DEPARTMENT_ACCESS_DENIED`           | Wrong URL department or original recovery department; ADMIN still must use a supported department                               |
| 403 `FORBIDDEN`                          | Existing CSRF guard denial                                                                                                      |
| 404 `ORDER_NOT_FOUND`                    | Missing or inaccessible selected/detail order or piece membership; do not distinguish an unrelated resource                     |
| 409 `ORDER_VERSION_CONFLICT`             | Accessible, related root changed from captured expected version; refresh/review exact set                                       |
| 409 `ORDER_STATE_CONFLICT`               | Accessible root no longer eligible for manufacturing                                                                            |
| 409 `MANUFACTURING_SELECTION_CONFLICT`   | Accessible selected current piece/visit/state changed or is ineligible; whole selection unchanged                               |
| 409 `MANUFACTURING_WORK_UNCHANGED`       | A new CONTINUE selects a piece whose latest actual worker is already this actor; no duplicate continuation/event/version change |
| 409 `MANUFACTURING_COMMAND_CONFLICT`     | Existing command ID bound to another actor/department/operation/exact version/set                                               |
| 409 `MANUFACTURING_TRANSACTION_CONFLICT` | Bounded safe transaction attempt cannot complete; retain original ID and observe before permitted same-intent retry             |
| 404 `MANUFACTURING_COMMAND_NOT_FOUND`    | No currently observable original-actor command result; neither rollback proof nor authority for a replacement ID                |
| 400/403/404/409 existing P04 codes       | Existing issue-report validation/source/version/unresolved-cycle/replay behavior; no manufacturing reinterpretation             |
| 500 existing safe internal error         | Unexpected persistence/mapping/contract defect; disclose no diagnostic details and retain safe recovery context                 |

For every root/piece in a command, establish the current requested-department resource relationship before exposing its version/state conflict. Validate all roots/pieces before mutation. A foreign order/foreign piece inside an otherwise accessible order is a generic missing result for the whole batch; a current known piece that moved away but remains related through retained work may produce the safe selection conflict. This order prevents version probing of unrelated resources.

The actual original actor may observe/replay a committed work command after all its pieces move onward, using retained command origin and original department, without requiring current piece location. Current suspension/ineligibility denies it; employee reassignment to another department denies it. Other workers cannot retrieve the original actor's receipt merely because they can work/read that order. ADMIN recovers only its own command, not an impersonated actor's result. Replay/observation contain no current private projection and do not grant current detail access.

Use the same actor and sorted-root locking/order-version discipline as the backend owner. Command persistence and every selected work/visit/event/root update share one transaction. The backend owner defines exact lock predicates, recognized transient retries, rollback and actual isolated tests. A timeout/disconnected client is unknown, not rollback. An observer 404 may be followed only by an explicit same-ID/same-intent retry while the original immutable input remains available; no automatic replacement POST after a missing recent event or response.

## C09. Compatibility and verification design

All manufacturing routes/types are additive. Existing factory GET/current-resource authority, P04 issue report/result protocol, official paper, P03 snapshots/prices, sales receipts and accepted financial history remain intact. `salesActivityItemSchema` gains one discriminant: update the API merger, all web sales/approval history renderers, their adapters/model exhaustiveness and OpenAPI together. An independently deployed old client that validates the old closed union cannot consume the new variant; deploy coordinated producer/consumer artifacts, or hold producer emission until compatible consumers are deployed. Do not silently strip new work from an accepted updated client.

Align OpenAPI methods/paths/guards/statuses/strict requests/output/error and page semantics with this ledger. Planned contract cases cover all literal values, unknown/omitted/null input, UUID normalization, same-set reordering, duplicate/order/total bounds, exact before/after/result correspondence, actor/department/state/next-visit refinement, complete count relations, safe issue text mapping and nested privacy. Producer/consumer tests must reject a financial/private key even deep inside a history/paper/context response.

Actual HTTP/persistence verification must prove entire-batch cross-order rollback, current relation before version disclosure, original-actor/origin recovery after movement, authority changes, correct whole-order safe context, latest visit versus retained history, literal search/pagination/count agreement and actual P04 issue-report compatibility. Adapter/component tests prove route/result correlation and malformed-response classification. Real-browser work/reload/second-session evidence remains future implementation output; this artifact claims design readiness only.
