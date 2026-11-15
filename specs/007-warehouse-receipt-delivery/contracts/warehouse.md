# P07 Warehouse Contract Blueprint

Status: proposed interfaces for P07 PLAN; no endpoint or schema in this document is claimed implemented. The accepted [specification](../spec.md), particularly D-002–004, owns product intent. [Backend design](../backend-design.md) owns execution; [data model](../data-model.md) owns persistence. Names below are the implementation contract, not suggestions to the implementing model.

## C01. Owners, protocol and authority

Create `packages/contracts/src/warehouse/warehouse-command.schema.ts`, `warehouse.schema.ts`, `warehouse-event.schema.ts` and their discovered adjacent `.test.ts` files. Export deliberate symbols through the existing contracts index. Request schemas are aliased in proposed `apps/api/src/modules/warehouse/dto/warehouse-command.dto.ts` and `dto/warehouse-read.dto.ts`; they are not redefined in web/API.

The configured API prefix defaults to `/api/v1` in `apps/api/src/core/config/app.config.ts`. Paths below include that default; routers remain relative to configuration. Every response is the current `successEnvelopeSchema` plus the named domain data schema. Every GET and POST succeeds with HTTP 200 via `ResponseHelper.ok`; replay also returns 200 with `replayed:true`. There is no extra envelope, 202/204 result, bodyless success or public warehouse endpoint.

Middleware order: existing business authentication → `authorizeDepartments(Department.WAREHOUSE)` → existing CSRF for POST → `validationMiddleware` for the exact body/query/params → controller. Services recheck the current account inside their transaction. An eligible verified active ADMIN passes the same resource/state rules; warehouse staff need current staff approval and WAREHOUSE assignment. Detail/query participation rules apply to ADMIN in this warehouse context too; broader admin reads retain their separate owners. A privileged actor/body field is rejected, never trusted or ignored by a mass assignment.

| Method / default path                           | Shared request schemas                                           | Domain data schema / type                                       |
| ----------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| GET `/api/v1/warehouse/dashboard`               | `warehouseDashboardQuerySchema`                                  | `warehouseDashboardDataSchema` / `WarehouseDashboardData`       |
| GET `/api/v1/warehouse/orders`                  | `warehouseOrdersQuerySchema`                                     | `warehouseOrdersDataSchema` / `WarehouseOrdersData`             |
| GET `/api/v1/warehouse/pieces`                  | `warehousePiecesQuerySchema`                                     | `warehousePiecesDataSchema` / `WarehousePiecesData`             |
| GET `/api/v1/warehouse/orders/:orderId`         | `warehouseOrderParamsSchema`, existing `salesEmptyQuerySchema`   | `warehouseOrderDataSchema` / `WarehouseOrderData`               |
| GET `/api/v1/warehouse/activity`                | `warehouseActivityQuerySchema`                                   | `warehouseActivityDataSchema` / `WarehouseActivityData`         |
| GET `/api/v1/warehouse/orders/:orderId/history` | `warehouseOrderParamsSchema`, `warehouseOrderHistoryQuerySchema` | `warehouseOrderHistoryDataSchema` / `WarehouseOrderHistoryData` |
| POST `/api/v1/warehouse/commands`               | `warehouseCommandBodySchema`, `salesEmptyQuerySchema`            | `warehouseCommandDataSchema` / `WarehouseCommandData`           |
| GET `/api/v1/warehouse-commands/:commandId`     | `warehouseCommandParamsSchema`, `salesEmptyQuerySchema`          | `warehouseCommandDataSchema` / `WarehouseCommandData`           |

Params are strict objects: `{orderId:salesUuidSchema}` or `{commandId:salesUuidSchema}`. All command variants and nested groups are strict. Query shapes are strict too. Authentication headers/cookies/CSRF are the current central transport protocol; add no credentials or actor IDs to these shapes.

## C02. Scalar and selection rules

Reuse `salesUuidSchema`, `salesVersionSchema`, `salesInstantSchema`, `salesOrderTypeSchema`, `salesOrderStatusSchema`, `orderPieceStageSchema`, `orderWorkStateSchema`, `approvalActorSchema`, `paginationQueryFields`, `paginationMetaSchema` and `isSafePaginationWindow` from their actual existing owners. Warehouse actors refine `approvalActorSchema` to ADMIN or department WAREHOUSE. UUID canonicalization, integer versions 1–2147483647 and offset-bearing instants retain the existing schemas' behavior.

`warehouseOptionalTextSchema`: string of at most 4000 characters, no NUL, nullish; undefined/null/empty/whitespace-only transforms to null. Otherwise preserve the complete original text, including language and significant surrounding whitespace. Raw length is checked before blank normalization. Use this for receipt carton text, storage location, all notes and recipient. This is a finite existing transport bound, not numeric carton validation or a new business requiredness rule. `warehouseRequiredReasonSchema` uses existing `nonEmptyBoundedString(4000)`; reject blank/missing/null/over-limit without truncation.

`warehouseRetryDateSchema`: nullish/blank → null; otherwise exactly `YYYY-MM-DD`, year 0001–9999, real Gregorian calendar date checked without JavaScript rollover. In the browser-safe contracts package, reuse the nonnull date schema from existing `draftReplacementSchema.shape.deliveryDate.unwrap()` and apply optional normalization around it; do not import API `core/date-only.ts` into contracts. API persistence uses its actual `parseDateOnly`/`serializeNullableDateOnly` UTC-component round-trip helpers. There is no browser/host timezone conversion and no invented minimum/maximum relative date. Preserve supplied calendar date. `warehouseDeliveredAtSchema`: nullish/blank → null; otherwise an offset-bearing ISO instant accepted by `salesInstantSchema`, normalized to UTC ISO for persisted/wire output. UI accepts its existing text field in explicit `YYYY-MM-DD HH:mm +/-HH:mm` form and converts it lexically, without inferring an offset. This concrete presentation is fixed in [frontend design](../frontend-design.md), not an OPS-01 choice. Recording time remains a separately server-derived instant. Do not substitute current time for absent actual-delivery evidence.

Each command has 1–200 distinct order groups and 1–200 distinct affected physical pieces **in total**, as in existing P05/P06 bounded commands. Each individual order remains at most 200 pieces. Reject duplicated order entries, duplicated piece IDs anywhere, empty sets and cross-order reused IDs. An expanded delivery selection above 200 must fail review with guidance to select fewer whole orders; never split an accepted batch, truncate membership or save an eligible subset. The existing global `appConfig.bodyLimit` defaults to `1mb` and remains an independent hard HTTP limit; a theoretical 200×4000-character payload is not promised to fit. HTTP 413 preserves the frozen draft and requires fewer selected whole orders/shorter input, never truncation, automatic batching or an increased global limit. These are request bounds, not a throughput SLA. Input arrays may be unordered; canonical intent sorts groups by orderId and each group's IDs by UUID. Reject duplicates before sorting/deduplication. Optional text/date normalization is part of intent identity.

## C03. Exact command body union

Export `warehouseCommandOperationSchema` / `WarehouseCommandOperation` with `RECEIVE`, `DISPATCH`, `CONFIRM_DELIVERY`, `FAIL_DELIVERY`, `RETRY_DELIVERY`.

Each body contains `{commandId:UUID, operation:Operation, orders:Group[]}`. The following is exhaustive; no field is inherited implicitly from a legacy callback.

| Operation          | Exact per-order group fields in addition to `orderId`, `expectedVersion`, `pieceIds`                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `RECEIVE`          | `receipt:{cartonCount:OptionalText,storageLocation:OptionalText,notes:OptionalText}`; object nullish → all three null |
| `DISPATCH`         | `deliveryNote:OptionalText`                                                                                           |
| `CONFIRM_DELIVERY` | `attemptId:UUID`, `recipient:OptionalText`, `deliveredAt:OptionalDeliveredAt`, `notes:OptionalText`                   |
| `FAIL_DELIVERY`    | `attemptId:UUID`, `returnedToWarehouse:true`, `reason:RequiredReason`, `notes:OptionalText`                           |
| `RETRY_DELIVERY`   | `attemptId:UUID`, `retryDate:OptionalRetryDate`, `notes:OptionalText`                                                 |

`RECEIVE.pieceIds` is the exact incoming arrival subset. All other operations use every current noncancelled piece in the affected order, explicitly reviewed, not merely initial selected rows. Results/failure/retry additionally bind the latest original dispatch attempt ID. The server compares the supplied identity set to that full current membership under the root lock. A distinct initial row mapping to an already reviewed order is ordinary UI grouping; repeated submitted order entries or physical IDs are invalid.

`DISPATCH.deliveryNote` is the actual optional note captured by `dispatch-delivery-dialog.tsx`. Its legacy representative callback name does not make it a courier name. There is no invented courier input, dummy courier name, required courier field or external courier call. Any later real courier field needs an accepted amendment and coordinated contract; this invocation preserves all currently reached capture without fabricating it.

Example normalized body:

```json
{
  "commandId": "10000000-0000-4000-8000-000000000001",
  "operation": "FAIL_DELIVERY",
  "orders": [
    {
      "orderId": "20000000-0000-4000-8000-000000000001",
      "expectedVersion": 8,
      "pieceIds": ["30000000-0000-4000-8000-000000000001"],
      "attemptId": "40000000-0000-4000-8000-000000000001",
      "returnedToWarehouse": true,
      "reason": "Customer unavailable",
      "notes": null
    }
  ]
}
```

Omitting `returnedToWarehouse`, sending false, blank reason, a subset or an old attempt fails before any effect. Cancel before POST creates no command. Closing after POST does not cancel a committed command.

## C04. Immutable command result and observation

Export `warehouseCommandReceiptSchema`, `warehouseOrderOutcomeSchema`, `warehouseCommandOutcomeSchema`, `warehouseCommandDataSchema`, and corresponding PascalCase types. Exact result:

```text
WarehouseCommandData = {
  kind:'warehouse-command',
  receipt:{commandId,operation,actor:WarehouseActor,occurredAt:Instant},
  replayed:boolean,
  outcome:{orders:Array<{
    eventId:UUID, orderId:UUID, beforeVersion:Version, afterVersion:Version,
    status:SalesOrderStatus, pieceIds:UUID[],
    receiptGroupId:UUID|null, attemptId:UUID|null, retryId:UUID|null
  }>}
}
```

Every group has `afterVersion=beforeVersion+1`, no overflow, the same total selection budget and distinct group/event identities. RECEIVE has receiptGroupId nonnull, attemptId/retryId null and status APPROVED or READY_FOR_DELIVERY. DISPATCH has attemptId nonnull, receiptGroupId/retryId null, status OUT_FOR_DELIVERY. CONFIRM has its original attemptId, other IDs null, status DELIVERED. FAIL has its original attemptId, other IDs null, status DELIVERY_FAILED. RETRY has attemptId and retryId, receiptGroupId null, status READY_FOR_DELIVERY. Disallow other combinations at schema and database boundaries.

The output contains no contacts, submitted snapshots, finance or a newly fetched mutable order. Stored results retain original versions/status even after later actions. A fresh detail reload provides current truth. Same actor/operation/canonical normalized payload and command ID returns original output with replayed true. Same ID/different actor or intent conflicts without revealing another actor's result. Another ID targeting an already received/ineligible state conflicts without adding an effect. Command IDs live in the warehouse namespace, independently from existing sales/approval/manufacturing/quality command tables.

Observation is private to the initiating currently eligible actor, including for ADMIN: no admin override to inspect another actor's command UUID. Missing/foreign commands both return WAREHOUSE_COMMAND_NOT_FOUND. Observation serializes on the same transaction advisory lock as execution; a racing request waits within the fixed lock budget or returns conflict. A 404 is an unobserved result, **not proof a delayed request cannot commit**. The frontend retains the frozen body/key and uses the original key for safe resubmission after observation/review; never create a replacement key to resolve uncertainty. No command/body is stored in browser durable storage.

## C05. Read query contracts and membership

Export `warehouseViewSchema` / `WarehouseView`: INCOMING, INCOMPLETE, READY, OUT_FOR_DELIVERY, DELIVERY_FAILED, DELIVERED. Existing `/warehouse/in-progress` maps to READY; no extra queue enum/control is invented.

| Schema / type                                                     | Exact fields                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `warehouseDashboardQuerySchema` / `WarehouseDashboardQuery`       | `{search?:string,type?:SalesOrderType}`                                       |
| `warehouseOrdersQuerySchema` / `WarehouseOrdersQuery`             | pagination + `{view:WarehouseView,search?,type?}`; default limit25, maximum25 |
| `warehousePiecesQuerySchema` / `WarehousePiecesQuery`             | pagination + same fields + `{orderId?:UUID}`; default limit25, maximum100     |
| `warehouseActivityQuerySchema` / `WarehouseActivityQuery`         | pagination only; default25, maximum100                                        |
| `warehouseOrderHistoryQuerySchema` / `WarehouseOrderHistoryQuery` | pagination + `{pieceId?:UUID}`; default25, maximum100                         |

Export `WarehouseDashboardQueryInput`, `WarehouseOrdersQueryInput`, `WarehousePiecesQueryInput`, `WarehouseActivityQueryInput` and `WarehouseOrderHistoryQueryInput` as `z.input<typeof correspondingSchema>`; existing PascalCase Query types above are `z.output`/inferred parsed output.

Reuse actual `paginationQueryFields` coercion/defaults/page bounds and `isSafePaginationWindow`; enforce the stated smaller limit after parsing. `search` trims, max150, rejects NUL; omitted/blank is absent. Type is one of the seven existing uppercase types. Unsupported status/department/sort/date/worker filter fields fail; reached status navigation is `view`, and worker matching is part of free search. Sorting is fixed by C07, never client SQL. An out-of-range page returns an empty page with the actual unchanged page/total metadata; UI offers page reset rather than selecting a different order.

Warehouse participation requires an actual accepted Quality handoff or retained physical receipt/attempt for any piece of the exact order. Pure approval/upstream work is insufficient. Within that order, safe companion locations are visible for reconciliation; this does not expose unrelated orders or customer histories. Cancelled history retains participation but never actionable stock. Search spans business number, submitted customer display name, exact piece UUID/text reference, model and retained responsible-worker/action names. Do not search inaccessible private phone/email or widen owner authority.

Queue membership and count scope:

| View             | Eligible orders and matching piece rows                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INCOMING         | Participating APPROVED order; accepted WAREHOUSE/INCOMING, receivedAt null, no issue/cancellation/open correction; rows are exactly those accepted incoming pieces                      |
| INCOMPLETE       | Participating APPROVED order, active>0 and received<active; rows are all active companion identities, including upstream ones; accepted arrival qualifies before first receipt          |
| READY            | READY_FOR_DELIVERY, active>0, exact received=active, all active WAREHOUSE/COMPLETED, no issue/open correction, no dispatched/delivered/latest failed-unretried attempt; rows all active |
| OUT_FOR_DELIVERY | OUT_FOR_DELIVERY plus latest dispatched unresolved attempt; rows its full membership                                                                                                    |
| DELIVERY_FAILED  | DELIVERY_FAILED plus latest failed full-return outcome with no retry; rows its full membership                                                                                          |
| DELIVERED        | DELIVERED plus latest complete delivered outcome; rows its full membership                                                                                                              |

Apply authorized participation + view + type + search identically before count and page selection. A header match includes all view-matching pieces; a piece/model/worker match includes the matching view-piece subset. Queue counts count distinct matching orders and matching piece identities; summary `counts` always describes the entire physical order independent of search. Incoming/incomplete legitimately overlap and must never be summed as independent stock. Historical all-cancelled detail is accessible but absent from these six queues.

## C06. Read DTO ledger

All shapes strict. Existing `FactoryOrderPiece`, `FactoryOrderPaperData`, `QualityPackingGroup`, `ManufacturingActivityEvent`, `QualityActivityEvent` and `QualityIssueActivityEvent` are reused as actual schema owners; do not alias sales/financial projections. `qualityIssueActivityEventSchema` already permits CUTTING/PRODUCTION/QUALITY sources and excludes customer-contact proposals, making it a valid safe history member despite its historical name.

```text
WarehouseAllowedActions = {canDispatch,canConfirmDelivery,canFailDelivery,canRetryDelivery:boolean}
WarehouseOrderSummary = {
  id,version,type,status,businessNumber,customerName,deliveryDate:DateOnly|null,
  counts:{original,cancelled,active,received,completionPercent},
  matchingPieceIds:UUID[],matchingPieceCount:number,lastActionAt:Instant|null,
  allowedActions:WarehouseAllowedActions,currentAttemptId:UUID|null,retryDate:DateOnly|null
}
WarehousePieceContext = {
  pieceId,
  acceptedHandoff:{eventId,commandId,acceptedAt:Instant,actor:WarehouseSafeActor,packingGroupId:UUID|null}|null,
  receiptGroupId:UUID|null,receivedAt:Instant|null,legacyReceipt:boolean,
  allowedActions:{canReceive:boolean}
}
WarehousePieceRow = {order:WarehouseOrderSummary,piece:FactoryOrderPiece,work:WarehousePieceContext}
WarehouseReceiptGroup = {
  id,orderId,pieceIds:UUID[],actor:WarehouseActor,receivedAt:Instant,
  cartonCount:string|null,storageLocation:string|null,notes:string|null
}
WarehouseRetry = {id,actor:WarehouseActor,occurredAt:Instant,retryDate:DateOnly|null,notes:string|null}
WarehouseAttempt = {
  id,orderId,number:positiveInt,pieceIds:UUID[],
  status:'DISPATCHED'|'DELIVERED'|'FAILED',
  dispatchedBy:WarehouseActor,dispatchedAt:Instant,deliveryNote:string|null,
  outcome:DeliveredOutcome|FailedOutcome|null,retry:WarehouseRetry|null
}
DeliveredOutcome = {kind:'DELIVERED',id,recordedBy:WarehouseActor,recordedAt:Instant,
  recipient:string|null,deliveredAt:Instant|null,notes:string|null}
FailedOutcome = {kind:'FAILED',id,recordedBy:WarehouseActor,recordedAt:Instant,
  returnedToWarehouse:true,reason:string,notes:string|null}
WarehouseOrderData = {
  summary:WarehouseOrderSummary,paper:FactoryOrderPaperData,
  deliveryContact:{name:string,phone:string,address:string|null},
  work:WarehousePieceContext[],receiptGroups:WarehouseReceiptGroup[],
  qualityPackingGroups:QualityPackingGroup[],currentAttempt:WarehouseAttempt|null
}
```

Export lowerCamel schema names for each PascalCase DTO above, including `warehouseAllowedActionsSchema`, `warehousePieceContextSchema`, `warehouseReceiptGroupSchema`, `warehouseRetrySchema`, `warehouseAttemptSchema`, `warehouseOrderSummarySchema`, `warehousePieceRowSchema` and `warehouseOrderDataSchema`. WarehouseSafeActor uses the existing `approvalActorSchema` for upstream quality/worker stamps; WarehouseActor is its warehouse-authority refinement. Do not mistakenly require upstream acceptedHandoff.actor to be WAREHOUSE.

The summary customerName is the retained submitted name (max150). Detail contact name/phone/address reuse `customerSchema.shape.name`, `.phone` and `.address` from the current customer contract (maximum150/13/2000 respectively); address nullable max2000. Email, customerId/master relations, price provenance and money never enter WarehouseOrderData, including ADMIN's warehouse projection. Missing address stays null, never phone-as-address. Contacts are separate from reused factory paper, preserving manufacturing privacy/print roles. Paper has all retained pieces, at most200; work must bind each exactly once. Cancelled rows remain tracking facts and are omitted by existing active print-line semantics.

Queue summaries require positive distinct matching IDs/count equality; detail allows zero matching active IDs for all-cancelled history. Current `counts` uses W08's exact formula; original=active+cancelled, received≤active. Safe receivedAt matches work and paper piece. A COMMAND receipt must reference one matching returned group; legacy known receipt has legacyReceipt true/group null. Optional unknown handoff is null, not a fabricated inspector. `canReceive` requires an actual accepted event; no hint bypasses server checks. Order action hints are mutually state-consistent; all false on cancelled/incomplete/historical-only contexts. Server current attempt state must agree with root status; an inconsistent graph is a safe server failure, never silently repaired by a read.

`WarehouseOrdersData={department:'WAREHOUSE',view:WarehouseView,orders:WarehouseOrderSummary[],counts:{orders,pieces},pagination}`; max25 summaries. `WarehousePiecesData={department:'WAREHOUSE',view:WarehouseView,orderId:UUID|null,pieces:WarehousePieceRow[],counts:{orders,pieces},pagination,receiptGroups,qualityPackingGroups}`; max100 rows/groups of each kind, exactly distinct registries referenced by the page. Echo department/view exactly and pieces.orderId as requested orderId or null, including empty pages; the adapter rejects a wrong view/order scope before caching. Detail registries max200 and bind to its pieces; group metadata is returned once, never multiplied per piece. Latest accepted quality packing is linked to handoff; complete earlier inspection/packing remains in paginated history. `WarehouseDashboardData={counts:{incoming,incomplete,ready,outForDelivery,deliveryFailed,delivered}}`, each `{orders,pieces}` safe nonnegative integers; no fake totals, fixture cards or guessed worker counts. Export corresponding lowerCamel schemas/PascalCase types.

## C07. Activity, ordering and historical compatibility

Export `warehouseActivityEventSchema` / `WarehouseActivityEvent`:

```text
{id,commandId,orderId,orderVersion,businessNumber,operation,actor,occurredAt,pieceIds,
 beforeStatus,afterStatus,receiptGroup:WarehouseReceiptGroup|null,
 attempt:WarehouseAttempt|null,retry:WarehouseRetry|null}
```

`id` is the per-order command event UUID, not commandId; `orderVersion` is that group's afterVersion. Fields bind to the exact original operation and piece membership. RECEIVE exposes only receiptGroup; DISPATCH exposes its original dispatched attempt (outcome/retry null); CONFIRM/FAIL exposes that attempt and its newly recorded outcome, retry null; RETRY exposes its failed attempt and the newly recorded retry. Every event is reconstructed as of its command/order version, not from a mutable latest attempt join. Join an outcome/retry into an original event only when its own CommandOrder.afterVersion is≤the event.orderVersion; DISPATCH therefore has neither, and earlier failure events cannot acquire later retry data. Later success must not rewrite the original DISPATCH event into a delivered one.

`WarehouseActivityData={department:'WAREHOUSE',events:Array<{kind:'warehouse',event:WarehouseActivityEvent}>,pagination}` is the warehouse action log. `WarehouseOrderHistoryData={department:'WAREHOUSE',orderId,events:WarehouseHistoryItem[],pagination}` additionally allows `{kind:'manufacturing',event:ManufacturingActivityEvent}`, `{kind:'quality',event:QualityActivityEvent}` and `{kind:'issue',event:QualityIssueActivityEvent}` for this permitted order, optional piece filter. It never returns sales revisions/raw approval facts/contact proposals. Existing source identity unions are paged first and details projected only for that page. Preserve all members of a grouped original inspection/manufacturing event when one member matches a piece filter; never construct an invalid shortened original-event DTO.

Queue order sort: `lastActionAt DESC NULLS LAST, id DESC`; piece sort: same order time, orderId DESC, piece.position ASC, pieceId ASC. `lastActionAt` is the latest retained warehouse action time, else accepted handoff time, else known legacy receipt time. Activity/history: occurredAt DESC,eventId DESC,kind ASC. Count/page use one RepeatableRead snapshot. Page length and pagination total must agree; zero total→zero pages. DTO validators reject duplicate IDs, foreign group memberships, unauthorized nested finance/contact fields and contradictory attempt/root states.

W08 adds `{kind:'warehouse',event:warehouseActivityEventSchema}` to existing `salesActivityItemSchema` and the exact source-union/count/page queries in `findOrderActivity`, keeping owner/approval scope. These are no new revision-detail IDs: existing `findSalesActivityEvent` continues to serve sales revision events only. Existing sales/approval renderers use the new discriminator rather than pretending a warehouse event is an approval decision.

Current completion formula: active0→0; exact received=active and active>0→100; otherwise `min(99,round(100*received/active))`. Export `currentOrderCountsSchema` for current output and `retainedOrderCountsSchema` for immutable prior facts. The latter accepts count-consistent percentages equal **only** to the precise old round formula or new cap formula. Factor a `retainedSalesOrderSchema` with the same complete order validations but retained counts. Use it only at `salesOrderCommandDataSchema.savedOrder`, both order branches of `salesOrderRevisionDataSchema`, and `approvalEventFactsSchema.counts`; current order/detail/summary/factory/warehouse outputs remain strict new formula. Do not transform stored old 100 to99, update JSON, loosen arbitrary percentages or recompute old command status. Current new producers still derive/validate the new formula before saving. P04 cancellation outcomes add READY_FOR_DELIVERY only to the cancelled-piece resolved branch so last missing cancellation can make a received active remainder ready; old APPROVED/CANCELLED outcomes remain valid.

## C08. Error contract and recovery

Reuse actual common errors for unauthorized/account/department/CSRF, `VALIDATION_ERROR`, `ORDER_NOT_FOUND`, `ORDER_VERSION_CONFLICT`, `ORDER_STATE_CONFLICT`, 429 and safe internal failures. Request paths follow `body.orders.0.receipt.notes`, `body.orders.0.pieceIds`, `query.limit`, `params.orderId` etc. Add warehouse error classes only for distinct meanings below. Message payloads remain safe infrastructure English; UI maps codes/known editable fields to Arabic under the accepted failure-meaning table. No raw SQL or arbitrary server/parser string reaches a toast.

| Status/code                                           | Meaning and required recovery                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 400 `VALIDATION_ERROR`                                | Strict shape/bounds/date/full-return acknowledgement invalid; field-associated correction, safe draft retained, no effect         |
| 401 existing unauthorized codes                       | Existing session flow, no operation confirmation                                                                                  |
| 403 existing account/department codes                 | Current authority denied; hide old private context, no business write                                                             |
| 404 `ORDER_NOT_FOUND`                                 | Missing or nonparticipating exact resource; indistinguishable, authorized queue recovery                                          |
| 409 `ORDER_VERSION_CONFLICT`                          | Reviewed version stale or overflow; refresh/review full scope before new intent                                                   |
| 409 `ORDER_STATE_CONFLICT`                            | Order state does not allow operation; show current-context recovery                                                               |
| 409 `WAREHOUSE_SELECTION_CONFLICT`                    | Wrong/received/held/cancelled piece, membership mismatch or wrong/latest attempt; entire selection unchanged, refresh/review      |
| 409 `WAREHOUSE_COMMAND_CONFLICT`                      | Command ID bound to another actor/operation/canonical payload; never overwrite or claim earlier intent succeeded                  |
| 409 `WAREHOUSE_TRANSACTION_CONFLICT`                  | Lock timeout or bounded transaction retry exhausted; observe original intent, do not assume rollback of an earlier ambiguous call |
| 404 `WAREHOUSE_COMMAND_NOT_FOUND`                     | Initiator-private observation not yet found/foreign; preserve original key and uncertainty rules                                  |
| 413 `PAYLOAD_TOO_LARGE`                               | Existing global bound exceeded; preserve draft and explicitly reduce whole-order selection/input, no POST split or truncation     |
| 429 existing rate limit                               | Respect existing safe retry behavior; preserve draft; no invented write-success assumption                                        |
| 500/503, transport loss, malformed successful payload | Safe action-specific Arabic fallback; observe original command for unknown write outcome, retry reads separately                  |

Use existing idempotent central HTTP/session rules. Do not automatically retry POST with a fresh UUID, classify all 4xx as uncertain, or classify malformed success as an ordinary empty/offline read. Actual tests must prove both producer and adapter errors at their claimed boundaries; W01–W08 and the backend case matrix define them.
