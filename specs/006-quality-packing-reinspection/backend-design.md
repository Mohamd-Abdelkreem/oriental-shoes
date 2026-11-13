# P06 backend operation blueprint

This is a **proposed design**, not implemented quality endpoints or executed evidence.
[The specification](spec.md) owns product behavior; [the contract ledger](contracts/quality.md)
owns wire fields/statuses and [the data model](data-model.md) owns persistence and SQL
witnesses. Root `plan.md` is the protected roadmap. All new paths and symbols below
are proposed unless explicitly labelled existing. PLAN does not produce `tasks.md`.

## B01. Current owners, constraints and bounded changes

Read the full current owners and their immediate callers before implementation:

| Existing owner                                                             | Reuse / necessary change                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/auth/account-authority.ts`                           | Reuse `lockAccountRows`, `loadIdentityAccount`, `assertBusinessAuthority` and `AuthorityAccount`; no new authentication protocol.                                                                                                                                                           |
| `apps/api/src/modules/manufacturing/manufacturing-command-executor.ts`     | Existing account → intent → sorted roots lock order, bounded transaction retry, immutable result and exact-selection model; do not expand its operation enum to quality.                                                                                                                    |
| `apps/api/src/modules/manufacturing/manufacturing-work.lifecycle.ts`       | Reuse `openQualityCorrectionVisit` with the caller's transaction/locks/root version. `currentWorkVisitId` remains exclusively CUTTING/PRODUCTION.                                                                                                                                           |
| `apps/api/src/modules/approval/approval.service.ts`                        | Extract its existing `reportIssue` work into one transaction-local writer; ordinary P04 reporting keeps the same route, input/result, authority and single-piece +1 version behavior. Add quality-visit interruption and correction cancellation calls at their existing source operations. |
| `apps/api/src/modules/approval/approval-command-executor.ts`               | Extract only its existing result validation/create/map block for shared transaction-local persistence; retain its public executor's lock/authority/replay/transaction behavior.                                                                                                             |
| `apps/api/src/modules/approval/approval.queries.ts` / `approval.mapper.ts` | Reuse `lockApprovalOrder`, `CURRENT_ISSUE_SELECT`, `mapApprovalFacts`, P04 issue instructions and safe factory-field meanings. Full approval facts remain server-only.                                                                                                                      |
| `apps/api/src/modules/manufacturing/manufacturing.mapper.ts`               | Reuse factory-safe field selection/projection meanings and source/date helpers; do not import a whole manufacturing read to obtain quality scope.                                                                                                                                           |
| `apps/api/src/modules/sales-orders/sales-orders.rules.ts`                  | Reuse `deriveOrderCounts`; receipt and cancellation remain the single physical-piece truth.                                                                                                                                                                                                 |
| `apps/api/src/modules/sales-orders/order-activity.queries.ts`              | Add the safe `quality` summary variant to existing paged history; retain all current sales/approval/manufacturing variants and owner filtering.                                                                                                                                             |
| `apps/api/src/router.ts`, module index, OpenAPI construction               | Construct quality executor/service/controller once, mount the two routers and document actual registered routes.                                                                                                                                                                            |
| `packages/database/prisma/schema.prisma`, authored P04/P05 SQL             | Add forward P06 storage/constraints and exact compatibility replacements described in M05–M07; preserve every previous migration's bytes.                                                                                                                                                   |

P05's current SQL rejects a quality visit in `currentWorkVisitId`. Its deferred root
guard requires exactly one next-version witness; its piece-transition guard accepts
only existing domain witnesses and its narrow future-quality return seam. P04 issue
records require a separate retained `REPORT_ISSUE` approval command per piece, unique
per order/version, with each command stepping +1. Its new-command head guard compares
against final root version. These facts prohibit a nested-loop call to public
`ApprovalService.reportIssue` for a P06 atomic batch and prohibit copying P05 visits
for quality. M05 records the exact forward compatibility changes.

## B02. Proposed module and interface ledger

Use the canonical controller/service/module recipe, meaningful feature-local query,
mapper, rule and lifecycle owners; no generic repository or transaction framework.

| Proposed file                                                                                                     | Exact responsibility / public symbols                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/quality/quality.service.ts`                                                                 | `QualityService` owns protected reads and delegates commands. Constructor `(database: DatabaseClient, commands: QualityCommandExecutor)`.                                                                                                                                                                                            |
| `quality-command-executor.ts` in that directory                                                                   | `QualityCommandExecutor` owns one complete quality transaction/recovery; constructor `(database: DatabaseClient)`. `execute(input: QualityCommandExecution): Promise<QualityCommandData>`; `observe(actorId: string, commandId: string): Promise<QualityCommandData>`. `hashQualityCommandIntent(body: QualityCommandBody): string`. |
| `quality.queries.ts`                                                                                              | `lockQualityOrders`, `loadQualityPieceContexts`, `findQualityDashboard`, `findQualityOrders`, `findQualityPieces`, `findQualityOrder`, `findQualityActivity`, `findQualityOrderHistory`, `qualityPieceRelationSql`.                                                                                                                  |
| `quality.mapper.ts`                                                                                               | Exact safe selects, record types, `mapQualityPieceContext`, `mapQualityCommandResult`, `mapQualityPaper` and `qualitySummarySql`. No raw record spread.                                                                                                                                                                              |
| `quality.rules.ts`                                                                                                | `canonicalQualityOrders`, `isCurrentQualityWork`, `qualityActionHints`, `qualityQueueMembership`, validated pure intent/outcome normalization.                                                                                                                                                                                       |
| `quality-work.lifecycle.ts`                                                                                       | Transaction-local `startQualityVisit`, `endQualityVisitForIssue`, `cancelQualityCorrection`; no database-client construction, transaction opening or root-version increment.                                                                                                                                                         |
| `quality.types.ts`                                                                                                | `QualityCommandExecution`, `LockedQualityOrder`, `QualityPieceContextRecord`, `PendingQualityPieceEvent`; no duplicate wire types.                                                                                                                                                                                                   |
| `quality.errors.ts`                                                                                               | Named selection/unchanged/intent/result/transaction errors from the contract ledger; narrowly classify actual new named database constraints.                                                                                                                                                                                        |
| `quality.controller.ts`, `quality.routes.ts`, `dto/quality-read.dto.ts`, `dto/quality-command.dto.ts`, `index.ts` | Thin authenticated/validated adapters, schema aliases, `qualityRoutes(controller, authentication)` and `qualityCommandRoutes(controller, authentication)`.                                                                                                                                                                           |
| `apps/api/src/modules/approval/approval-issue-report.writer.ts`                                                   | `writeApprovalIssueReport(tx: Prisma.TransactionClient, input: ApprovalIssueReportWrite): Promise<ApprovalIssueReportResult>`. Extract current behavior without making a parallel issue policy.                                                                                                                                      |
| `apps/api/src/modules/approval/approval-command.writer.ts`                                                        | `persistApprovalCommand(tx: Prisma.TransactionClient, input: ApprovalCommandWrite): Promise<ApprovalCommandData>`. Existing execution-result validation, create and mapper block shared by P04 and P06. `advanceApprovalOrderVersion` extracts the existing conditional +1 helper. No transaction creation.                          |

`QualityService` public methods are:

```text
dashboard(actorId: string): Promise<QualityDashboardData>
listOrders(actorId: string, query: QualityOrdersQuery): Promise<QualityOrdersData>
listPieces(actorId: string, query: QualityPiecesQuery): Promise<QualityPiecesData>
getOrder(actorId: string, orderId: string): Promise<QualityOrderData>
activity(actorId: string, query: QualityActivityQuery): Promise<QualityActivityData>
orderHistory(actorId: string, orderId: string, query: QualityOrderHistoryQuery): Promise<QualityOrderHistoryData>
execute(actorId: string, body: QualityCommandBody): Promise<QualityCommandData>
observe(actorId: string, commandId: string): Promise<QualityCommandData>
```

Internal input records are fixed as follows; imported types are owned by existing
source or the canonical shared contract, never recreated as competing schemas:

```text
QualityCommandExecution = { actorId: string; body: QualityCommandBody }
LockedQualityOrder = { id: string; version: number; root: ApprovalOrderRecord;
  pieces: readonly QualityPieceContextRecord[] }
QualityPieceContextRecord = { piece: QualityPhysicalPieceRecord;
  orderStatus: SalesOrderStatus; visit: QualityVisitRecord | null;
  lastAction: QualityLastActionRecord | null;
  correction: QualityCorrectionRecord | null; issue: SafeCurrentIssueRecord | null;
  productionArrival: QualityArrivalRecord | null }
ApprovalIssueReportWrite = { actor: AuthorityAccount; root: ApprovalOrderRecord;
  pieceId: string; commandId: string; expectedVersion: number;
  reason: string; notes: string | null; occurredAt: Date }
ApprovalCommandWrite = { execution: ApprovalCommandIntent;
  actor: AuthorityAccount; occurredAt: Date; result: ApprovalCommandWorkResult }
```

`canonicalQualityOrders(body:QualityCommandBody):CanonicalQualityOrder[]` produces
ascending order/member sets without deduplication. Each normalized internal group is
`{orderId,expectedVersion,pieceIds,decisions,inspectorNote,packing}`; decisions/packing
use types derived from the existing INSPECT body branch and are null for other
operations, not separate wire definitions. `QualityArrivalRecord` is
`{eventId,commandId,orderId,pieceId,occurredAt:Date}` from an actual production event.
`QualityPhysicalPieceRecord` reuses the Prisma selection of the existing physical
tuple used by P05 (id/orderId/stage/workState/issueId/receivedAt/cancelledAt/
cancellationReason/currentWorkVisitId). `QualityLastActionRecord` contains
`{eventId,commandId,operation,actorId,actorFullName,actorRole,actorDepartment,occurredAt}`.
`SafeCurrentIssueRecord` selects only the explicit existing issue scalar allowlist
below, never private proposals. Safe resolved instructions are loaded separately
with existing `findIssueInstructions(tx,issueIds,"FACTORY")`.

### Mapper selections and derived record aliases

New selects live in `quality.mapper.ts`, use `as const satisfies Prisma.<Model>Select`
and the exact Prisma camelCase fields corresponding to M02; no broad include tree.
New model names and enum mappings are fixed in M02, not inferred from wire types.

| Select symbol                               | Exact scalar / bounded relation fields                                                                                                                                                                                                                                                                                                                                                                                                  | Derived record alias                                                                                                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REUSE `MANUFACTURING_PHYSICAL_PIECE_SELECT` | Existing physical tuple above, unchanged.                                                                                                                                                                                                                                                                                                                                                                                               | `QualityPhysicalPieceRecord` is an import alias of existing `ManufacturingPhysicalPieceRecord`; no copied schema.                                                                                                                               |
| REUSE `MANUFACTURING_ORDER_SELECT`          | Existing safe header/specification/physical tuple select, `take:201` sentinel for existing 200-piece bound, no contact/finance.                                                                                                                                                                                                                                                                                                         | `QualityOrderRecord` is an import alias of existing `ManufacturingOrderRecord`; `mapQualityPaper` uses the same accepted safe fields and adds separately loaded safe issue facts.                                                               |
| `QUALITY_COMMAND_SELECT`                    | commandId,operation,actorId,actorFullName,actorRole,actorDepartment,payloadHash,outcome,occurredAt.                                                                                                                                                                                                                                                                                                                                     | `QualityCommandRecord = Prisma.QualityCommandGetPayload<{select:typeof QUALITY_COMMAND_SELECT}>`.                                                                                                                                               |
| `QUALITY_ACTOR_COMMAND_SELECT`              | commandId,operation,actorId,actorFullName,actorRole,actorDepartment,occurredAt.                                                                                                                                                                                                                                                                                                                                                         | `QualityActorCommandRecord = Prisma.QualityCommandGetPayload<{select:typeof QUALITY_ACTOR_COMMAND_SELECT}>`.                                                                                                                                    |
| `QUALITY_APPROVAL_ACTOR_SELECT`             | Existing ApprovalCommand commandId,operation,actorId,actorFullName,actorRole,actorDepartment,occurredAt.                                                                                                                                                                                                                                                                                                                                | `QualityApprovalActorRecord = Prisma.ApprovalCommandGetPayload<{select:typeof QUALITY_APPROVAL_ACTOR_SELECT}>`.                                                                                                                                 |
| `QUALITY_VISIT_SELECT`                      | id,orderId,pieceId,sequence,originKind,sourceProductionEventId,sourceCorrectionId,enteredAt,receivedAt,startedAt,startedCommandId,endedAt,endReason,endQualityEventId,endApprovalCommandId,legacyUnknownStart; `startedCommand` selects QUALITY_ACTOR_COMMAND_SELECT; `endQualityEvent` selects id/commandId plus `commandOrder.command` with QUALITY_ACTOR_COMMAND_SELECT; `endApprovalCommand` selects QUALITY_APPROVAL_ACTOR_SELECT. | `QualityVisitRecord = Prisma.QualityWorkVisitGetPayload<{select:typeof QUALITY_VISIT_SELECT}>`.                                                                                                                                                 |
| `QUALITY_CORRECTION_SELECT`                 | id,orderId,pieceId,cycle,rejectionEventId,target,reason,instructions,state,resolvedAt,resolutionQualityEventId,resolutionApprovalCommandId; `rejectionEvent` selects id/commandId plus `commandOrder.command` with QUALITY_ACTOR_COMMAND_SELECT. Resolved actor/event details are joined separately for paged history.                                                                                                                  | `QualityCorrectionRecord = Prisma.QualityCorrectionCycleGetPayload<{select:typeof QUALITY_CORRECTION_SELECT}>`.                                                                                                                                 |
| `QUALITY_ARRIVAL_SELECT`                    | Existing ManufacturingPieceEvent id,commandId,orderId,pieceId; `commandOrder.command` selects occurredAt. Query predicate fixes actual PRODUCTION COMPLETE_TRANSFER→QUALITY.                                                                                                                                                                                                                                                            | `QualityArrivalSelectionRecord = Prisma.ManufacturingPieceEventGetPayload<{select:typeof QUALITY_ARRIVAL_SELECT}>`; `QualityArrivalRecord` maps id to eventId and `commandOrder.command.occurredAt` to occurredAt with other scalars unchanged. |
| `QUALITY_CURRENT_ISSUE_SELECT`              | Existing ManufacturingIssue id,orderId,pieceId,state,sourceDepartment,sourceStage,sourceWorkState,reason,notes,reportedAt,reportedCommandId,resumeTarget,resolvedAt,resolutionCommandId. No latestProposal/proposals/contact payload relation.                                                                                                                                                                                          | `SafeCurrentIssueRecord = Prisma.ManufacturingIssueGetPayload<{select:typeof QUALITY_CURRENT_ISSUE_SELECT}>`.                                                                                                                                   |
| `QUALITY_PIECE_EVENT_SELECT`                | id,commandId,orderId,pieceId,visitId,decision,correctionId,issueId,approvalCommandId,beforeStage,beforeWorkState,afterStage,afterWorkState. Load command/order/cycle/packing data in bounded bulk maps; no recursive cycle↔event include.                                                                                                                                                                                               | `QualityPieceEventRecord = Prisma.QualityPieceEventGetPayload<{select:typeof QUALITY_PIECE_EVENT_SELECT}>`.                                                                                                                                     |
| `QUALITY_PACKING_SELECT`                    | id,commandId,orderId,cartonCount,cartonNumbers; `pieces` selects pieceId with `take:201`, sorted pieceId. The command/order note and actor/time are loaded by parent IDs.                                                                                                                                                                                                                                                               | `QualityPackingRecord = Prisma.QualityPackingGroupGetPayload<{select:typeof QUALITY_PACKING_SELECT}>`.                                                                                                                                          |

`QualityLastActionRecord` is `Pick<QualityCommandRecord,"commandId"|"operation"|
"actorId"|"actorFullName"|"actorRole"|"actorDepartment"|"occurredAt"> &
{eventId:string}`. A latest-event query derives it by actual per-order version then
event ID, using the retained parent actor rather than current profile names.
`QualityArrivalRecord`'s dates/IDs retain the selected Prisma scalar types; its map
does not create authority or untyped assertions. The context and wire visit mapper
derive startedBy/endedBy from these bounded retained command relations.

`lockQualityOrders(tx, {actor, operation, orders})` takes `actor: AuthorityAccount`,
`operation: QualityCommandOperation` and `orders: readonly CanonicalQualityOrder[]`,
and returns `Promise<LockedQualityOrder[]>`. The executor passes the runtime-parsed
`body.operation` unchanged; operation is not inferred from decisions, piece state or
group membership. Canonical order groups retain their shape above. After establishing
every selected relationship, the helper checks each locked root's expected version
and computes its own `delta = operation === 'REPORT_ISSUES' ? group.pieceIds.length : 1`.
Require `root.version + delta <= 2147483647` for every order before any effect;
otherwise throw the existing `OrderVersionConflictError` for the whole selection.
Use that order's selected count, never the command-wide count. The helper owns these
operation-aware overflow prechecks under the root locks; it opens no transaction and
advances no version. `loadQualityPieceContexts(tx, pieces,
orderStatuses)` returns `Promise<QualityPieceContextRecord[]>`; load selected
visits/latest events/current correction/issues/arrival witnesses in bounded bulk
queries, rather than one read per rendered row. Pure context contains no customer
contacts, price or raw submitted snapshot. A full root is server-only writer input.

Every `findQuality*` function receives the same transaction and current
`AuthorityAccount` as its first two arguments. Remaining arguments and exact return
types match the corresponding `QualityService` method above without actorId;
`findQualityOrder(tx,actor,orderId)` and
`findQualityOrderHistory(tx,actor,orderId,query)` authorize that exact order.
No query helper starts another transaction or falls back to local state.

Extract proposed `ApprovalCommandIntent` in existing `approval.types.ts` from the
current `ApprovalCommandExecution` target/actor/command/version/hash fields, without
its `work` callback. Keep `ApprovalCommandExecution = ApprovalCommandIntent &
{work(tx,actor,occurredAt):Promise<ApprovalCommandWorkResult>}` so existing callers
retain their current public interface. Persistence receives plain intent metadata;
P06 never supplies a dummy callback merely to record a child. Extract
`advanceApprovalOrderVersion(tx,{orderId,expectedVersion,occurredAt}):Promise<number>`
from the current same-named private service method to `approval-command.writer.ts`;
update existing P04 call sites to that shared helper without changing its predicates,
affected-row checks or returned next version; existing caller overflow gating remains.
This is bounded extraction,
not a new root-version authority.

Lifecycle signatures:

```text
startQualityVisit(tx, {orderId, pieceId, commandId, occurredAt,
  productionArrival: QualityArrivalRecord | null,
  correctionId: string | null}): Promise<{visitId: string}>
endQualityVisitForIssue(tx, {orderId, pieceId,
  approvalCommandId: string, occurredAt: Date}): Promise<{visitId: string | null}>
cancelQualityCorrection(tx, {orderId, pieceId,
  approvalCommandId: string, occurredAt: Date}): Promise<void>
```

The issue helper returns null for incoming work without an open quality visit; it
must not create a fictitious start. The cancellation helper closes a current quality
cycle only when the caller already established the real P04 cancellation. It is a
no-op when no quality cycle exists. Both use the caller's locked root and transaction.
They must fail on a contradictory existing graph rather than silently fixing it.

## B03. Authority, lock order and transaction envelope

Applies to FR-001/016/018–020/022 and VR-005–006.

1. Runtime-parse the full strict command before a transaction. Canonicalize normalized
   order IDs and exact member IDs; INSPECT decisions are sorted by piece ID and remain
   attached to their own outcome/target/text. Packing strings retain entered nonblank
   text. Missing/null/blank optional values normalize to absence. Hash operation,
   every order/version/member/outcome/rejection value, inspector note and packing.
   The hash excludes only `commandId`; actor is separately bound by retained receipt.
2. For a new REPORT_ISSUES attempt preallocate one random child approval command UUID
   per selected piece, sorted by order then piece. Reuse those UUIDs during one safe
   transaction retry. Parent replay reads retained children and does not allocate work.
3. Begin `ReadCommitted`, `maxWait:5000`, `timeout:10000`, transaction-local
   `lock_timeout='5000ms'`, matching P05's bounded policy. Use the same transaction
   client for every query/writer; no external I/O or detached work.
4. Acquire the actor account FOR SHARE using existing `lockAccountRows`, load current
   account, and `assertBusinessAuthority(actor, Department.QUALITY)`. This serializes
   against P01 account/department changes and never trusts the UI's inspector.
5. Acquire the parent advisory lock using signed int64 derived from the first 16 hex
   SHA-256 digits of `p06-quality-command:<normalized commandId>`. Fetch existing
   QualityCommand. If present, require same actor, operation and hash; return its
   immutable safe result with `replayed:true` under current QUALITY authority. Do not
   require the pieces to remain in their original current states for observation.
6. For a new report parent acquire all child advisory locks using P04's existing
   `p04-approval-command:<childId>` namespace in sorted UUID order before root locks.
   Extract the small lock helper to `approval-command.writer.ts` as
   `lockApprovalCommandIds(tx, commandIds): Promise<void>` and make the ordinary P04
   executor use the same helper; no changed external behavior.
7. Call `lockQualityOrders(tx,{actor,operation:body.operation,orders})` with the
   canonical groups. It locks every selected SUBMITTED `sales_drafts` row FOR UPDATE
   in ascending UUID order.
   All P03/P04/P05/P06 writes share these roots. Missing root/selected relationship
   returns the existing private not-found meaning. First establish every selected
   piece's actual order and quality relationship, then expose version/state conflicts;
   do not disclose a foreign root version through a mixed batch.
8. The helper re-reads roots, order headers, physical pieces and contexts under these
   locks. Require current APPROVED order and exact expectedVersion. Its explicit
   operation input fixes the per-order delta: +1 for ordinary operations, or that
   group's selected piece count for REPORT_ISSUES. Require
   `version + delta <= 2147483647` for every group before returning to the executor.
   Reject duplicate/cross-order members before any effect. Validate all selections,
   states, current visits/cycles and operation data across the entire batch now.
9. Choose one authoritative `occurredAt` after locks. Perform B04–B07, build validated
   per-order outcomes/events, create retained parent/order/events/packing/correction
   links, then let all deferred integrity/witness checks run at commit. Any required
   failure rolls the complete transaction back, including every child report.
10. Translate only named expected conflicts. Retry the whole transaction once for
    existing recognized serialization/deadlock or actual parent-command uniqueness
    races; recheck authority and all input. Lock timeout/exhaustion gives the defined
    conflict and original-result recovery instruction. Do not retry arbitrary
    connectivity, integrity or unknown-commit errors as fresh intent.

`observe` uses current account lock/authority and parent intent advisory lock in
the same order, then own-actor lookup. Another actor's/missing result is a safe 404;
lost department/eligibility is denied even when the original result exists. It never
reconstructs a POST from a historical event. No outcome contains server payloadHash,
raw approval facts or credentials.

## B04. Receive/start and continue quality work

Applies to FR-005–009/017–020, SC-002 and VR-002/006.

| Operation         | Full precondition                                                                                                     | Writes / exact outcome                                                                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RECEIVE_AND_START | Approved current QUALITY/INCOMING, issue/receipt/cancellation null, `currentWorkVisitId=null`, no open quality visit. | Create one new quality visit with next per-piece sequence, real receipt/start actor/time from parent command and actual production-arrival witness when present; link current quality correction if open. Conditional piece transition to QUALITY/IN_PROGRESS. One event per selected piece, decision null; per-order root +1 once. |
| CONTINUE          | Same physical eligibility but QUALITY/IN_PROGRESS with one matching open quality visit.                               | Append actual continuation event/actor at parent timestamp; preserve original start. If last actual action actor is already this actor, reject the entire batch as unchanged, matching P05 continuation semantics. Root +1 once; piece state stays identical.                                                                       |

Normal quality incoming work is represented directly by stage; it does not require
an eagerly inserted visit. A quality visit begins only on real receive/start.
`productionArrival` is the latest actual PRODUCTION COMPLETE_TRANSFER event for this
piece/order leading to QUALITY, with its command time; a missing legacy source is
shown as unknown, not supplied by a fake worker/time. Quality history can include
that source transfer without claiming it was a quality inspection.

`startQualityVisit` checks the locked physical tuple again and the absence of an open
quality visit. The partial unique key and deferred graph are race protection; the
pre-read alone is not. CONTINUE changes no starter field. Its event can be current
last-worker evidence without creating another receipt/start. Per-order root +1 and
the parent receipt still witness the event even when the piece tuple is unchanged.

## B05. Inspect, pack and accept

Applies to FR-007–011/017–021, SC-003/005–006 and VR-002/005–006.

All INSPECT members require QUALITY/IN_PROGRESS, no hold/receipt/cancellation,
no manufacturing visit and one matching open quality visit. Validate complete
accepted/rejected partition before applying any member. Input quantities summarize
these identities and cannot independently choose first-N pieces. One mixed selection
is one transaction across all orders; no internal partial-confirmation splitting.

For each accepted member in sorted order:

1. Record one immutable QualityPieceEvent with `decision:ACCEPT`, source quality
   visit, before QUALITY/IN_PROGRESS and after WAREHOUSE/INCOMING. Outcome correctionId
   points to the open cycle being resolved, or null for ordinary work.
2. End its quality visit as INSPECT_ACCEPTED with this event/parent timestamp. If an
   open correction cycle exists, close it ACCEPTED with this exact reinspection
   event; do not change its original reason/target/instructions/rejecting actor.
3. Conditional physical update sets only stage WAREHOUSE and workState INCOMING.
   Preserve `receivedAt=null`, cancellation/issue null, and `currentWorkVisitId=null`.
   The accepted event is the warehouse-incoming handoff witness; there is no physical
   receipt write, warehouse command invocation or readiness side effect.

For each order with accepted identities, create at most one QualityPackingGroup if
either carton text field is present. The group stores only the two
optional carton strings and accepted membership; `inspectorNote` has one owner on
QualityCommandOrder. If both carton fields are absent, packingGroupId is null and no fabricated
packing group exists. A note remains accessible through the inspection/order event
even when rejected-only and no packing group exists. Later operations create new
groups; none updates an earlier group. Per-piece acceptance without packing inputs
works with no group. Carton text is neither numeric inventory nor unique identifiers.

Record accepted/rejected piece events, group membership, visit/cycle endpoints and
per-order +1 root change with the same transaction. The parent result uses its
actual packingGroupId and each exact outcome; it does not infer successful warehouse
receipt from a toast, local mutation or order status.

## B06. Reject and consume reinspection

Applies to FR-012–014/017–021, SC-004 and VR-003/006.

For each REJECT member of INSPECT after full-batch validation:

1. Validate target CUTTING/PRODUCTION, required reason/instructions and 4000 limits
   using the shared contract. Preserve original entered text; reject blank/null or
   excessive values rather than truncating or inserting default instructions.
2. Allocate the next correction cycle under the locked root. If this visit is
   reinspection of an open cycle, close that prior cycle REJECTED using the current
   event; create exactly one next OPEN cycle. The same event links the failed prior
   outcome and new rejection without replacing earlier facts. Ordinary rejection
   starts cycle 1. Overflow rejects the entire batch.
3. End the quality visit INSPECT_REJECTED and create its event/new correction row.
4. Call the existing `openQualityCorrectionVisit(tx,{actor,orderId,pieceId,
expectedVersion:lockedRootVersion,target,correctionId:newCycleId,
correctionCycle:nextCycle,instructions,occurredAt})`. This changes only the exact
   piece to target/INCOMING, opens a manufacturing visit and sets its manufacturing
   pointer. It writes sourceOrderVersion `lockedRootVersion+1`; advance that root
   exactly once for the complete INSPECT operation, after all selected members.
5. Persist the event→cycle→manufacturing-origin witnesses defined in M05. Multiple
   rejected members do not introduce extra root bumps or multiple root witnesses.

No P05 operation is invoked implicitly. Cutting receives/starts/completes to
production and production to quality. On subsequent real production transfer the
piece is QUALITY/INCOMING with no quality visit; its open correction remains linked.
Next RECEIVE_AND_START creates a new quality visit, linking that cycle. Acceptance
ends it ACCEPTED; another rejection performs the closed-prior/new-current transition.
Mixed targets remain per-piece facts, not an order-wide target overwrite.

## B07. Atomic issue reporting through P04

Applies to FR-015/018–020, SC-007 and VR-004–006. This is distinct from INSPECT.

### Extract, do not duplicate or nest

`writeApprovalIssueReport` receives a locked full root/current actor and performs the
existing P04 rules: APPROVED root, exact current CUTTING/PRODUCTION/QUALITY piece,
incoming/in-progress, active source-department authority, no unresolved issue, no
receipt/cancellation; next issue cycle; actual reporter/source/time; create the issue;
set only that piece BLOCKED with issueId; interrupt the matching manufacturing visit;
advance root +1; reload server-only root and return before/after facts/outcome.

Add `endQualityVisitForIssue` immediately after the physical hold is established;
quality in-progress must end its one open visit, while quality incoming may have
none. Non-quality pieces must have no open quality visit. This call is also used by
the unchanged direct P04 `reportIssue`, so callers cannot bypass quality integrity.
Existing `interruptManufacturingVisit` remains unchanged, including its legal
QUALITY/no-manufacturing-visit case.

`persistApprovalCommand` checks the existing approval fact schemas, +1 outcome and
execution/result identities, creates the immutable ApprovalCommand with existing
actor/hash/facts fields and maps its current wire result. It does not start a
transaction, acquire actor/root locks, replay or independently commit. Normal P04
executor still handles those responsibilities and invokes the extracted writer.

### Parent REPORT_ISSUES algorithm and version chain

1. Complete B03's full selection/authority/version/report validations before any
   child write. The source is QUALITY only for this endpoint; the shared P04 writer
   retains all existing source departments for its original callers.
2. For each order with initial version `v` and `n` distinct selected pieces, sort
   piece IDs. For ordinal `i=1..n`, use child expectedVersion `v+i-1`. Reload the full
   root after the preceding child so facts reflect current state. Build existing
   REPORT_ISSUE input/hash using that child UUID/version/common reason/notes.
3. Invoke `writeApprovalIssueReport` and `persistApprovalCommand` on the same tx;
   each child has beforeVersion `v+i-1`, afterVersion `v+i`, one issue/piece and an
   exact QualityApprovalReport link with parent/order/piece/ordinal. There is no
   nested public executor call or early result publication. Capture quality visitId
   from the prevalidated context (null for unstarted incoming), issueId and event.
4. The parent QualityCommandOrder is a grouping/recovery receipt with beforeVersion
   `v`, afterVersion `v+n`; **do not increment the root again**. For every other
   quality operation afterVersion remains `v+1`.
5. Parent outcome contains exactly the selected BLOCKED quality pieces/issue IDs.
   The root's intermediate +1 updates are each witnessed by the corresponding
   retained P04 child. Parent REPORT_ISSUES is not an additional root-head witness.
   M05 narrowly extends deferred child-head/piece-witness checks for this exact
   validated chain; ordinary P04 behavior remains unchanged.
6. Any later child failure aborts all earlier children, issues, parent events,
   quality-visit endpoints and root increments across every selected order. One
   parent intent is observed/replayed as one result; child IDs are audit links,
   not new client retry instructions.

The chosen algorithm retains the source-faithful full-root refresh/fact mapping
between report children. It is explicitly bounded by at most 200 selected members
overall and the existing at-most-200 physical pieces per root; it cannot read an
unbounded backlog. This can rehydrate/map an order's pieces repeatedly in the
maximum one-order batch. A concrete real 200-member REPORT_ISSUES acceptance case
must pass with the unchanged 10000ms transaction timeout and whole-selection
semantics. No throughput/latency improvement is claimed. If implementation evidence
exposes that bound as impractical, resolve the measured correction through its
authorized owner rather than silently splitting the operation or weakening limits.

On real P04 cancellation, `cancelIssuePiece` first establishes its current existing
cancelled state and then calls `cancelQualityCorrection` using the same tx/command.
The helper terminalizes an OPEN correction as CANCELLED with that approval witness.
No P06 cancellation command, money change or new authority is added. A P04 hold or
return without cancellation preserves the original quality cycle as suspended work;
accepted P04 release follows its target and normal path before quality resumes.

### B07a. Measured maximum-report correction — 2026-11-12

The real 200-piece acceptance run reached REPORT_ISSUES after 117452 ms of actual
upstream setup, then expired at 10539 ms inside the unchanged 10000 ms transaction.
This is failed execution evidence, not permission to split the atomic selection or
increase the runtime timeout. Apply the owner's earlier instruction to resolve
findings through the planning/task/read-only-analysis sequence. No product/wire
requirement, account authority, schema field or accepted all-or-nothing policy changes.

**Fixed internal response and callers.** Add `ApprovalIssueReportResult = Readonly<{
command: ApprovalCommandWorkResult; root: ApprovalOrderRecord }>` in approval.types.ts.
The issue writer returns its existing validated command facts as `command` and its
already reloaded complete persisted `after` record as `root`. Do not manufacture an
in-memory next root or remove the writer's full source read. Normal P04 reportIssue
unwraps `.command` for its unchanged public executor callback. P06 reportPiece
returns its normal piece outcome/event plus that exact `root`; applyOrder passes
it to the next child and removes its duplicate findUniqueOrThrow. Child ordinals,
expected versions, common text, actor/time, hashes and persistence stay unchanged.
After every child there is still one source-faithful full-root refresh before the
next child. Existing private direct-writer integration callers unwrap the response.

**Fixed fact projection.** In existing sales-orders.mapper.ts extract and export
`deriveSalesOrderFinancialFacts(record: SalesOrderRecord): Pick<SalesOrderDto,
"money"|"counts">`. Reuse submittedHeader and physicalPiece identity/quantity checks,
existing Decimal serialization, parseMoneyCents/MAX_ORDER_TOTAL_CENTS,
calculateOrderMoney and deriveOrderCounts. Reject inconsistent retained total as
mapSalesOrder already does. Calculate from actual noncancelled frozen unit prices
and paidAmount; counts include every actual physical member. mapSalesOrder reuses
this helper while keeping its full current projection. mapApprovalFacts uses this
same financial/count owner and the actual header status/approvedAt, rather than
mapping unrelated specification/contact/action fields for every child. Preserve
current-return and selected-piece/issue/proposal allowlists, exact safe schemas and
all existing error checks. No second financial rule or cached count owner is added.

**Fixed SQL execution strategy.** Apply M05a's equivalent set-based validation in
the one new P06 migration, including its exact P04 per-issue witness and receipt-equivalence ledgers. No old migration/checksum changes. Keep all named guards,
all trigger registrations and each actual +1 child update; keep full parent checks
inside the positively linked P04/P05 exception helpers. No caller-controlled GUC,
validation cache/queue, disabled guard or relaxed final-state predicate is permitted.
M05b permits only its repeated full-parent, exact-delta proof to omit a redundant
P05 recheck when manufacturing state demonstrably did not change.

**Verification.** T018 owns this bounded remediation of its dependency outputs.
Run existing P04 command/service/HTTP regressions, financial/count mapper tests,
P06 pure tests and all current producer/race/required-save tests, plus fresh/populated
P04/P05/P06 constraint suites. The maximum-case setup may use its explicit bounded
600000 ms test allowance because real upstream manufacturing commits precede P06;
the executor remains 10000 ms and the test independently requires execute-through-
COMMIT elapsed time below 10000 ms. Snapshot the complete selected graph before the
report; on any failed attempt assert exact rollback then rethrow. Record actual
elapsed time without a throughput claim. A further failure remains an open gate;
never weaken the time assertion, schemas, membership or SQL negative cases.

## B08. Queries, safe scope and history

Applies to FR-002–004/017/021–024, SC-001/007–008 and VR-001/005.

Protected reads use `QualityService.read<T>`: existing account FOR SHARE/current
QUALITY authority in `RepeatableRead`, maxWait5000/timeout10000/lockTimeout5000 and
at most one recognized transaction-conflict retry under B08a. This gives matching
rows/counts within a response; it does not promise a cross-request frozen dataset.

### Piece relation and current queue predicates

`qualityPieceRelationSql()` is a fixed, parameterized SQL fragment for owned alias
`p`; no client SQL identifier enters it. A quality relationship is current stage
QUALITY, or a real production-transfer-to-quality event, quality visit/event/cycle,
or P04 issue with actual sourceDepartment QUALITY and its matching REPORT_ISSUE
command. Historical rows must join correct piece/order keys and actual witness,
not merely a client-requested ID. ADMIN retains broader existing visibility but
current quality actions still require full eligible QUALITY state.

All queue rows start from one row per `sales_order_pieces` joined to SUBMITTED root
and submitted header. Queue reads exclude CANCELLED pieces; detail/history can show
retained cancellation safely. Base actionable state requires header APPROVED,
`issueId=null`, `receivedAt=null`, `cancelledAt=null`, `cancellationReason=null`.

| View        | Exact membership                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INCOMING    | Base actionable + stage QUALITY/workState INCOMING + no open quality visit. Open correction may exist.                                                                                                                                                                                                                                                                                                                                    |
| INSPECTION  | Base actionable + QUALITY/IN_PROGRESS + one matching open quality visit.                                                                                                                                                                                                                                                                                                                                                                  |
| ACCEPTED    | Noncancelled related piece whose latest INSPECT event by per-order afterVersion/eventId is ACCEPT; retained after handoff/receipt/delivery. No current open correction/issue can manufacture an accepted fact.                                                                                                                                                                                                                            |
| CORRECTIONS | Noncancelled piece with exactly one OPEN quality correction cycle; current stage may be CUTTING/PRODUCTION/QUALITY or held by P04. Return computed `phase:WAITING_CORRECTION` for cutting/production or held work, `AWAITING_REINSPECTION` for eligible QUALITY incoming and `INSPECTING` for current quality inspection. Held work is also explicit through safe issue facts and has no actionable hints; it is not a fourth phase enum. |

Dashboard reports each named scope independently; corrections may overlap incoming
or inspection. Distinct order counts and piece counts are separately named. Never
sum overlapping queues into stock. `deriveOrderCounts` uses authoritative cancellation
and receivedAt; accept/pack never increments physical receipt/completion. No active
pieces yields 0 physical-completion and not deliverable.

### Search, pagination and projection

Use contract-owned page/limit/type/search validation. Grouped limit≤25, flat/history/
activity≤100; defaults page1/limit25 (UI may request its retained 10). Search is an
escaped parameterized literal case-insensitive substring of business number/internal
order ID, customer display name, model/piece reference and current/latest actual
quality worker; maximum150. Order-level matches include all otherwise matching
pieces; piece-level matches include only those pieces. Type accepts the existing
seven values. No new worker/date filter UI or financial/contact search.

Filter authorized piece identities first; grouped pages group that relation and
return matching exact piece IDs/counts, not full specification arrays. Order by
latest relevant arrival/action time descending with nulls last, then order UUID;
flat rows use relevant time DESC NULLS LAST, order UUID DESC, physical position ASC,
piece UUID ASC. Group order UUID tie-break is DESC. History/activity use occurredAt DESC,
eventId DESC, kind ASC. Both count/page use the same relation and RepeatableRead
snapshot. Zero total means zero totalPages; a valid out-of-range page returns empty
rows with correct totals. Bound current order pieces at existing per-order 200.

Factory selects explicitly expose header/type/business number/customer display name,
delivery date and accepted manufacturing specification fields, exact identities,
safe locations/counts, known actors/times, quality result/packing/correction/issue
instructions and allowed action hints. Exclude customer ID/phone/email/address,
prices/unitPrice/total/paid/balance/surplus, raw snapshots, credentials, full approval
facts and unapproved proposal values at every nested level. Reuse the existing
factory paper schema/field mapping, not full sales/approval DTOs and CSS hiding.

Order/task detail must authorize the actual requested order first and return exact
safe piece contexts; explicit requested piece/visit is resolved by the frontend from
those identities with no first-item fallback. Retained department relation supports
post-transfer read only; no hint for downstream mutations. For held pieces show
current approved specifications and safe issue/instructions, never proposed values.

### History without competing stores

Quality activity/history use per-order parent event IDs, not one fabricated event
per displayed quantity. Merge safe quality summaries, actual production arrivals,
relevant P05 correction movements and matching P04 quality report/decision history
under authorized piece relations. Suppress only P04 REPORT_ISSUE rows proven linked
to a quality parent through its exact QualityApprovalReport link; the parent represents
that grouped user action once. Use the identical suppression predicate in counts and
page identities/projections. The existing `findOrderActivity` shared by sales and
approval order history applies the same parent-plus-suppressed-linked-children policy,
with owner scope retained. Keep standalone P04 reports and later RESOLVE_ISSUE /
REVIEW_CONTACT events, every actual child receipt/audit record and the own-approver
decision-list behavior unchanged. Do not broaden P05 department-history or wire enums.

Add `quality-event.schema.ts` as a leaf scalar/schema owner and import only that
leaf from sales-order activity schema. Do not make a contracts import cycle via the
full quality order wrapper. `qualitySummarySql` emits only the strict safe summary
defined in the ledger. Factory history is constructed from safe fields rather than
passing through private P04 beforeFacts/afterFacts.

Optional order-history `pieceId` qualifies events containing that physical member;
the returned quality event is the original full immutable per-order group, including
all its decisions/outcomes and its packing group's original accepted membership.
Do not truncate a quality inspection into a misleading subset or fabricate a new
event ID. Manufacturing history can project only its actual relevant correction/
source members under the existing non-packing event schema, retaining the original
manufacturing event ID/actor/department/version. Apply that same qualified relation
to count and page queries; no event from another order is substituted.

### Historical correction links

The canonical history event now includes `correctionLinks`, not just the latest
physical outcome correctionId. Load these references in bounded bulk with the page's
actual event/member identities: OPENED joins `QualityCorrectionCycle.rejectionEventId`
to that QualityPieceEvent; ACCEPTED/REJECTED joins `resolutionQualityEventId`; a
REINSPECTION_STARTED link joins the actual RECEIVE_AND_START event's visit and
`startedCommandId` to `sourceCorrectionId`. Select the immutable cycle id/number
and exact event action. At most two links/member and 400/event. Reject mismatched
piece/order/source/ordinal graph rather than guessing cycle numbers. CONTINUE and
REPORT_ISSUES emit empty lifecycle-link arrays, not an invented new cycle action.

P04 safe issue history additionally projects canonical `correctionResolution` only
from a same-piece/order CANCELLED cycle whose `resolutionApprovalCommandId` is that
actual P04 command and whose resolution timestamp matches it. Include such a P04
event via that FK even when the issue arose later in CUTTING/PRODUCTION during
correction; sourceDepartment QUALITY alone is insufficient. Keep private proposal/
financial facts excluded and apply the identical qualification in count/page SQL.
Old opening events remain OPENED facts even after later resolution; no stored event
is rewritten. This adds no model/endpoint, current-state store or client lookup.

Verification: page a cycle1 opening separately from its failed-reinspection event,
then cycle2 acceptance or actual P04 cancellation after a CUTTING/PRODUCTION issue.
With currentCorrection null, each returned resolution still names the exact cycle
number/id/outcome and actor/time, earlier opening reasons/instructions remain in
their actual event, and neither historical page labels that opening as current work.

## B09. Failure, HTTP and composition

The [contract ledger](contracts/quality.md) is the canonical method/path/status/error
owner. Controller uses authenticated actor and `request.validated`, no empty-ID
fallback or body assertion. Route order is authentication → QUALITY/ADMIN business
department middleware → CSRF for POST → strict params/query/body validation → handler.
Own-result GET still checks current department/actor; public arbitrary observation
is not added. Use existing `ResponseHelper.ok` success and safe error envelope.

`QualitySelectionConflictError`, `QualityWorkUnchangedError`,
`QualityCommandConflictError`, `QualityCommandNotFoundError` and
`QualityTransactionConflictError` follow the exact stable codes in the ledger.
Reuse existing order not-found/state/version and current-account errors when their
meaning is unchanged. Do not map arbitrary SQL/check/FK failures to user ineligibility;
unexpected integrity failures are safe internal errors with private request-ID logs.
Preserve configured `appConfig.bodyLimit` / BODY_LIMIT (default 1mb). Existing
`safeParserError` in `error-handler.middleware.ts` already returns the safe 413
PAYLOAD_TOO_LARGE envelope for `entity.too.large`; no central-handler mutation or
limit increase is needed. Maximum identity/text counts do not imply that every
maximum-sized combination fits the transport budget. A known 413 occurs before
command execution and has no effects; retain draft and ask for an explicitly smaller
selection and reconfirmation, never silently split one atomic confirmation.
Frontend localizes according to the spec failure table, distinguishing known rejection
from malformed response or uncertain commit; server English messages are not UI copy.

Composition instantiates `new QualityCommandExecutor(database)`,
`new QualityService(database, executor)`, and `new QualityController(service)` once;
mount `/quality` and `/quality-commands` below the configured API prefix. No new
session, API client, background worker, provider or runtime configuration. Backend
acceptance of contracts, forward migration, command/read/authority/privacy/rollback/
race behavior and separate engineering review precedes any quality UI integration.

## B10. Verification cases and actual owners

All paths below are **proposed tests**, not executed results. Reuse actual Vitest
discovery and real migrated PostgreSQL/Express; [the plan](plan.md) owns the
manifest-backed future commands. No task briefs are created by PLAN.

| Proposed / existing owner                                                                                                             | Required concrete evidence                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/quality/quality.rules.test.ts`                                                                                  | Canonical set/hash and outcomes, queue overlap, same-actor continuation unchanged, all seven types, no cancellation/receipt-derived false completion.                                                                                             |
| `quality-command-executor.test.ts`                                                                                                    | Safe normalization/policy/error branches only; doubles do not prove persistence/rollback.                                                                                                                                                         |
| `quality-command-executor.integration.test.ts`                                                                                        | A starts P1/P2, B continues; ordinary accept, exact P1/P3 subset, mixed accept/reject across two orders, same/different-intent replay and real competing commands. Whole selection unchanged if one blocked member or later required write fails. |
| `quality.service.integration.test.ts`                                                                                                 | Real correction returns using P05 both targets, repeated failure→next cycle→acceptance, P04 hold/release/cancellation, notes/packing group independence and unchanged paid/prices/received state.                                                 |
| `quality.queries.integration.test.ts`                                                                                                 | Group/flat/count/search/type parity, out-of-range/zero pages, overlapping correction queues, retained history after all pieces depart, exact unrelated-order denial, safe paper/nested payloads.                                                  |
| `quality.http.integration.test.ts`                                                                                                    | Actual createApp credential/CSRF/department/status/strict input and own observation; 4000/4001/null/blank/authority field cases; no private field anywhere in success/error and denied writes unchanged.                                          |
| Existing `approval.service.integration.test.ts`, `approval-command-executor.integration.test.ts`, `approval.http.integration.test.ts` | Original single-piece report/replay/return/contact/cancel unchanged; direct quality report ends visit, cancellation closes existing quality cycle; no nested transaction leakage.                                                                 |
| Existing manufacturing lifecycle/service/queries integration files                                                                    | Live P06 correction producer consumed by unchanged normal routes, retained original start, no pointer collision; existing isolated legacy seam fixtures continue with explicit limits.                                                            |
| `packages/database/tests/integration/p06-quality-constraints.integration.test.ts`, existing migration integration                     | Fresh + populated upgrade, malformed exact witnesses, mixed-reject single root witness, linked P04 v→v+n child chain, missing/duplicate/misaligned children, no orphan/rewritten history, whole rollback and legacy seam compatibility.           |
| `apps/api/src/test-support/quality.fixture.ts`                                                                                        | Compose existing actual approval/manufacturing fixtures/services to create quality incoming, actual P06 start for inspection; no production fixture import or direct stage bypass.                                                                |
| Existing reset-test-data source/tests and schema-contract test                                                                        | Include every new FK-owned table in the guarded owned-test reset; no broad developer/production reset or production cleanup API.                                                                                                                  |

Use barriers/independent connections for accept-vs-reject, report-vs-inspect,
authority-change-vs-write and overlapping batches; sequential replay alone is not
race evidence. Inject a controlled real required-write failure after an earlier
piece/child report, inspect all final roots/pieces/visits/events/cycles/packing/issues/
commands, then clean only owned fixtures. Include maximum 200 selection and version
overflow; do not silently split a large confirmation.

Operation-aware version-boundary cases reuse the rollback-only pattern in existing
`apps/api/src/modules/approval/approval.queries.integration.test.ts` (the exhausted
root-version case). Start from T009's real incoming fixture and snapshot its complete
persisted graph. Raise only the root version inside an owned isolated transaction,
under the normal actor/sorted-root lock order; never commit an artificial head or
disable deferred guards. This is explicit helper-boundary evidence, not a normal
lifecycle fixture or committed high-version workflow:

- In `quality.queries.integration.test.ts`, the same two eligible incoming members
  and root version `2147483646` allow RECEIVE_AND_START's +1 but reject
  REPORT_ISSUES' +2 as `ORDER_VERSION_CONFLICT`. One-member reporting at that version
  is allowed; any ordinary operation at `2147483647` is rejected. For allowed helper
  calls, assert the returned locked version/context and then throw a dedicated
  rollback sentinel; require that exact sentinel, so an unrelated SQL failure cannot
  pass. For denied calls require the exact version-conflict code. After each case
  compare the full persisted graph to the pre-transaction snapshot.
- Include two orders with different selected counts: use each group's own delta,
  and reject the whole helper call if one root overflows. Roll back every synthetic
  head and assert both complete persisted graphs unchanged. Relationship privacy
  checks still precede all version-conflict disclosure.
- In `quality-command-executor.test.ts`, verify that the parsed `body.operation`
  reaches `lockQualityOrders` unchanged and a helper overflow rejection invokes no
  mutation, child-report or receipt writer. This is orchestration evidence only.
- Existing real `quality-command-executor.integration.test.ts` cases prove actual
  +1 start/inspection and +N reporting commits at ordinary witnessed versions, plus
  full cross-order rollback after a required-write failure. Keep those producer
  proofs separate from the rollback-only high-version helper cases. Complete graph
  comparisons include roots, pieces, visits, cycles, packing, issues, all domain
  commands/events/receipts, frozen terms and untouched companions.

Detailed frontend/browser cases
belong to their owning design and verification plan, without substituting for backend
acceptance. PLAN PASS means this design is sufficiently specified, not tests passed.

## B08a. Observed raw-query serialization and owned cleanup correction

The real T022 queued withdrawal test produces Prisma P2010 with
meta.driverAdapterError.cause.kind=TransactionWriteConflict and originalCode=40001,
not P2034. Installed @prisma/adapter-pg 7.9.1 maps raw 40001 to this shape; 40P01
uses kind=postgres with code/originalCode=40P01. Existing isSalesTransactionConflict
recognizes only P2034. Keep that shared P01–P05 classifier unchanged.

Add isQualityTransactionConflict(error:unknown):boolean in quality.errors.ts. Reuse
isSalesTransactionConflict first. Otherwise require outer P2010 and object-shaped
meta/driverAdapterError/cause, then either the exact TransactionWriteConflict +
originalCode=40001 shape, or postgres + code=40P01 + originalCode=40P01. No message
matching, P2028/connection/unknown commit classification, arbitrary SQL error or
unique-constraint broadening. QualityService.read and QualityCommandExecutor retry
use this one domain-owned helper. Keep one retry, original intent/child identities,
account/order lock sequence and fixed timeouts. On a second recognized read conflict
throw existing QualityTransactionConflictError; unexpected failures propagate.
Before transaction-conflict retry, QualityService.read reuses existing isSalesLockTimeout to map an actual 55P03 to QualityTransactionConflictError immediately, with no retry. This aligns the read boundary with the existing contract ledger lock-timeout outcome and executor policy.
Writes retain their existing named exhausted-conflict behavior and precise parent-ID
race classifier. This changes no authority, selection or public response schema.

T022 owns this measured dependency correction and current-unit/integration regression.
The already failing two-client queued-withdrawal case must pass with current authority
denial after retry; do not accept raw P2010 as a replacement outcome. Extend discovered
quality.rules.test.ts with exact accepted/rejected adapter metadata. Rerun quality
executor tests and real fault/race tests. All pending test operations must settle in
finally after releasing owned barriers; remove diagnostic prints before completion.

### B07b. Fact-only source projection for repeated reports — authorized 2026-11-12

**Scope and evidence.** The owner explicitly authorized a narrow PLAN/TASKS → read-only ANALYZE → implementation correction after the full serial run passed 536/537 cases and the unchanged maximum report measured 10578ms. B07a removed a duplicate read but its required per-child refresh still uses the complete sales-screen select, including owner/contact/specification/catalogue relations. Disposable PostgreSQL profiling measured 2003 full Quality command validations (3249ms self time) in an 8182ms function-timing diagnostic without the separate CPU profiler. CPU profiling separately showed Prisma result handling/transport and garbage collection dominating application samples; instrumentation raised that diagnostic to 12169ms, which is failed timing evidence, not acceptance. Neither diagnostic replaces the strict uninstrumented acceptance test.

**Decision.** Preserve one fresh persisted read of every physical member after every child, with every field used by command facts and their integrity checks. Stop loading unrelated UI projection fields for that read. This supersedes B07a's requirement that the refreshed record carry the complete `SalesOrderRecord` shape; it does not permit an in-memory next root, cached financial/count facts, skipped validation, bulk child/version writes or changed SQL. M05a/M05b functions, triggers and every migration byte remain unchanged. No new migration/schema, index, wire/HTTP, UI/cache, authority, retry, timeout or dependency is needed.

**Proposed interface ledger (existing owners; no new runtime layer).**

- In `apps/api/src/modules/sales-orders/sales-orders.mapper.ts`, add `SALES_ORDER_FINANCIAL_SELECT` satisfying `Prisma.SalesDraftSelect` and inferred `SalesOrderFinancialRecord`. Select root `id,status,customerId`; header `id,totalAmount,paidAmount`; all nonremoved pieces in the existing position/id order with `id,quantity` and actual `orderPiece.id,orderId,unitPrice,stage,receivedAt`. Reuse the existing selection's physical-member filter/order. No customer/owner/specification/catalogue fields enter this select.
- Broaden `deriveSalesOrderFinancialFacts(record)`'s input to that inferred financial projection; existing full records remain structurally compatible. Its result stays `Pick<SalesOrderDto,'money'|'counts'>`. Keep the same submitted status/header/root/customer/cardinality checks, physical identity/order/quantity checks, Decimal serialization, exact money parsing/bounds, current noncancelled frozen-price sum, retained-total consistency and count owner. Extract a private physical-terms check reused by the full physical mapper and financial mapper. Make the existing header/terms checks preserve each caller's concrete inferred record type; no casts, fallback values or second monetary/count rule. The financial mapper constructs only stage/receipt/price inputs rather than copying specification fields.
- In `approval.mapper.ts`, add `APPROVAL_FACTS_ORDER_SELECT` extending the financial select and inferred `ApprovalFactsOrderRecord`. Add root `version`; header `status,approvedAt,currentReturnDecisionId,currentReturnReason,currentReturnedAt`; physical `workState,issueId,cancelledAt,cancellationReason`. All required financial identity fields remain selected. Existing `mapApprovalFacts(root,actor,context):ApprovalEventFacts` accepts this projection; all full-record callers remain valid. Preserve the exact current-return, selected-piece, issue/proposal allowlists and final canonical facts-schema parse.
- In `approval.types.ts`, only `ApprovalIssueReportWrite.root` and `ApprovalIssueReportResult.root` use the new facts record. `ApprovalOrderRecord` and other P04 interfaces stay full-record aliases. Use type-only imports to avoid a runtime cycle.
- `approval-issue-report.writer.ts` reuses `APPROVAL_FACTS_ORDER_SELECT` for its single after-child `salesDraft.findUniqueOrThrow`. Every precheck, actual issue/piece/visit write, +1 conditional root update, actual issue result, before/after facts and public outcome stays unchanged. The returned root is this actual query result.
- In `quality-command-executor.ts`, explicitly type the report chain's `currentRoot` and `reportPiece` input/result root as `ApprovalIssueReportResult['root']`. The initial locked full root is compatible; every subsequent value comes directly from the writer's fresh database read. Preserve exact sorted child IDs/ordinals, locks, expected versions, shared actor/time/text, hashes, real P04 receipts and parent persistence. No `Promise.all` on a transaction, synthesized physical row, mutable aggregate cache or extra query owner.

**Ordered algorithm / failure behavior.**

1. Retain all current request parsing, current actor/root/member locks, selection/version eligibility and replay checks. The initial locked root and work contexts do not change.
2. For each exact report child, derive before facts using the same canonical money/count and fact validators over its persisted full or fact-only root. Create the actual issue, update the exact piece, interrupt real visits and advance the root by one through the existing writers.
3. Refresh the root using the fact-only select on the same transaction. All physical identities/prices/current states and required header terms are re-read. Validate after facts using the same rules and actual issue record, persist the unchanged child and pass that returned root to the next ordinal.
4. Persist the unchanged parent and retain all immediate/deferred validators through COMMIT. Errors retain current rollback/conflict/uncertainty semantics; there is no partial save or automatic split. Missing/mismatched identity/header/price or retained total remains an error.

**Concrete verification owners.** Create `sales-orders.mapper.test.ts` for minimal-projection exact money/count results and retained guards (header/customer/cardinality, physical id/order/quantity, inconsistent totals, cancellation/receipt). Extend the existing actual callback-free writer test in `approval-command-executor.integration.test.ts` to compare complete `mapApprovalFacts` outputs from fresh full and fact-only selects before and after the real report, using the actual issue context. Keep all existing financial/cancellation/rollback/authority tests. Run the complete Quality executor plus approval writer/service integrations, unchanged strict 200-member execute-through-COMMIT test, API unit/lint/types and complete API integration. T061 then reruns its full manifest-backed checks and both full browser projects. Remove temporary profiler code/settings from shipped tests; retain diagnostic measurements as evidence. Backend acceptance must pass before renewed dependent phase acceptance.

**Readiness / constitution.** Design PASS for scope/ownership/contracts/current authority, source-faithful persistence, unchanged money/count rules and all guards, backend-first acceptance, truthful evidence and a bounded task brief to be produced by TASKS. Runtime performance/acceptance remains BLOCKED until execution proves the original limit. Schema/migrations/providers/uploads/external effects/new frontend behavior are N/A because none changes. No release, client gate, commit or deployment is authorized.

### B07c. Complete maximum-report correction through stateless guard dispatch — 2026-11-12

B07b's fact-only source refresh is retained, but its 75-case focused pass did not close the next full-run maximum failure. The already-authorized M05a/M05b follow-up is specified in [M05d](data-model.md#m05d-stateless-quality-validation-dispatch-by-unchanged-read-set--authorized-follow-up-2026-11-12): extract the unchanged full current-state predicate body, preserve the existing complete order/parent validator and all positively linked parent checks, and dispatch external mutations to current-state validation only where immutable/read-set analysis proves they cannot invalidate retained Quality command facts. All Quality read-set mutations keep complete parent traversal. No guard predicate, trigger, constraint, retention rule, authority or budget is removed or disabled; no stateful proof cache or caller-controlled flag is introduced.

Use the single new forward function migration and the exact preflight/equivalence/test ledger in M05d. Old P06/P04/P05 migration bytes stay intact. No HTTP/schema field/frontend behavior changes. This supersedes B07b's "no new migration" exclusion only for this source-grounded function-dispatch correction. T063 owns its implementation; T062/T057 reacceptance and T061 exit wait for the combined complete evidence. Current runtime acceptance remains BLOCKED. Design/constitution readiness PASS requires the explicit dependency proof, populated upgrade preservation, independent current-state forcing, pending malformed-parent rejection and complete regressions prescribed there; no timing result waives them.
