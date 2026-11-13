# P06 Quality Contracts

**Status**: Proposed implementation contract; PLAN design only. No described new endpoint/schema/file exists until implemented. Existing symbols explicitly marked REUSE were inspected at `c8d9e77`. This document is the single wire-field/schema owner; [backend design](../backend-design.md), [data model](../data-model.md) and [frontend design](../frontend-design.md) reference it.

## 1. Ownership and dependency direction

Proposed browser-safe files in `packages/contracts/src/quality/`:

| File                                       | Exports / purpose                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality-command.schema.ts`                | `qualityViewSchema`, `qualityCommandOperationSchema`, `qualityOrderParamsSchema`, `qualityCommandParamsSchema`, `qualityInspectionDecisionSchema`, `qualityCommandBodySchema`, `qualityPieceOutcomeSchema`, `qualityOrderOutcomeSchema`, `qualityCommandReceiptSchema`, `qualityCommandOutcomeSchema`, `qualityCommandDataSchema`; inferred PascalCase types with the same base names |
| `quality-event.schema.ts`                  | `qualityPackingGroupSchema`, `qualityInspectionSummarySchema`, `qualityCorrectionEventLinkSchema`, `qualityActivityEventSchema`; primitive-only dependency graph                                                                                                                                                                                                                      |
| `quality.schema.ts`                        | Quality work/correction context, read queries and safe read/page schemas below; imports existing safe factory schemas                                                                                                                                                                                                                                                                 |
| Existing `packages/contracts/src/index.ts` | Export every intentional quality schema/type; no persistence imports                                                                                                                                                                                                                                                                                                                  |

REUSE `salesUuidSchema`, `salesVersionSchema`, `salesInstantSchema`, `MAX_DRAFT_PIECES=200`, `salesOrderTypeSchema`, `orderPieceStageSchema`, `orderWorkStateSchema`, `approvalActorSchema`, `nonEmptyBoundedString`, `paginationQueryFields`, `isSafePaginationWindow`, `paginationMetaSchema`, `salesEmptyQuerySchema`, `successEnvelopeSchema` and `errorEnvelopeSchema` from their existing contract owners. Reuse the safe `factoryOrderSchema`/`factoryOrderPieceSchema`, `factoryOrderPaperDataSchema` and `manufacturingOrderHeaderSchema` where the meaning is identical; do not fork monetary or paper contracts.

`quality-command.schema.ts` imports only HTTP/account/approval-command primitives and sales draft/order value schemas. `quality-event.schema.ts` imports those primitives and quality-command schemas; it MUST NOT import `sales-orders.schema.ts`, `approval.schema.ts` or `manufacturing.schema.ts`. The main `quality.schema.ts` may import full safe factory/manufacturing schemas. This breaks the otherwise circular sales-history → quality-event → full-sales-schema path. Keep P05 `manufacturingDepartmentSchema` restricted to CUTTING/PRODUCTION.

## 2. HTTP ledger

Paths below are relative to the existing configurable API prefix (default `/api/v1`). All JSON success uses `ResponseHelper.ok` / HTTP 200 with existing envelope and domain `data`; including initial command acceptance, replay and observation. Set `Cache-Control: private, no-store` on protected quality responses. No alternate envelope, Next server endpoint or provider acknowledgement.

| Method / path                          | Parsed params / query / body                     | Returned data schema            |
| -------------------------------------- | ------------------------------------------------ | ------------------------------- |
| GET `/quality/dashboard`               | strict empty query                               | `qualityDashboardDataSchema`    |
| GET `/quality/orders`                  | `qualityOrdersQuerySchema`                       | `qualityOrdersDataSchema`       |
| GET `/quality/pieces`                  | `qualityPiecesQuerySchema`                       | `qualityPiecesDataSchema`       |
| GET `/quality/orders/:orderId`         | `qualityOrderParamsSchema`, strict empty query   | `qualityOrderDataSchema`        |
| GET `/quality/activity`                | `qualityActivityQuerySchema`                     | `qualityActivityDataSchema`     |
| GET `/quality/orders/:orderId/history` | order params, `qualityOrderHistoryQuerySchema`   | `qualityOrderHistoryDataSchema` |
| POST `/quality/commands`               | strict empty query, `qualityCommandBodySchema`   | `qualityCommandDataSchema`      |
| GET `/quality-commands/:commandId`     | `qualityCommandParamsSchema`, strict empty query | `qualityCommandDataSchema`      |

Routes use business authentication → `authorizeDepartments(Department.QUALITY)` (ADMIN follows existing authorization semantics) → CSRF for POST → shared validation for every consumed params/query/body → controller. Controller requires nonempty server actor identity and parsed context; missing middleware context is an internal wiring failure. Service rechecks account/status/department while holding current account rows and protected order locks. No client actor/department/time/price/state field is accepted. Observation is actor-bound and rechecks current QUALITY/ADMIN authority; another actor gets the same not-found result as an unknown command.

## 3. Common values, text and bounds

- UUID/value/version/instant shapes reuse existing schemas. `salesVersionSchema` is a positive database-safe version. Reject overflow before a write, including the entire report-chain delta.
- `qualityViewSchema`: `INCOMING | INSPECTION | ACCEPTED | CORRECTIONS`. This does not widen P05 views or departments.
- `qualityCommandOperationSchema`: `RECEIVE_AND_START | CONTINUE | INSPECT | REPORT_ISSUES`.
- Required reason/instructions use `nonEmptyBoundedString(4000)` unchanged: preserve nonblank original text, reject absent/null/empty/whitespace-only, embedded null and over-limit input; no truncation.
- Optional inspector/report notes and carton count/reference text accept omitted/null/string up to 4000, reject embedded null/over-limit, and normalize omitted/null/empty/whitespace-only to null. A nonblank string retains its original spelling, whitespace, Arabic or mixed-language values. This transport bound adds no numeric/unique/required carton policy.
- Commands select 1–200 distinct orders with 1–200 distinct total physical pieces. Each order appears once, each physical ID once globally, and each order carries one expectedVersion. A supplied piece/order mismatch is invalid; no replacement/filtering. Sort orders by UUID and per-order piece identities by UUID for hashing/locking; reject duplicates before sorting.
- Keep existing `BODY_LIMIT` (`1mb` default). It also bounds a request independently of field/selection limits. Existing `PAYLOAD_TOO_LARGE` / 413 is a known pre-command rejection; preserve the draft and ask to reduce the explicit selection/text and reconfirm. Never increase the global limit or auto-split an atomic batch to evade it.

## 4. Command request ledger

All objects are strict. `qualityOrderParamsSchema` is exactly `{orderId: salesUuidSchema}`; `qualityCommandParamsSchema` reuses existing `{commandId: salesUuidSchema}`. Raw optional fields normalize as above. Types below describe exact shapes, not implementation bodies.

### 4.1 Receive/start and continuation

`QualityCommandBody` branches:

```text
{ commandId: UUID, operation: RECEIVE_AND_START | CONTINUE,
  orders: [{ orderId: UUID, expectedVersion: Version, pieceIds: UUID[] }] }
```

Each distinct selected piece must be current QUALITY incoming for start, or current QUALITY in-progress for continuation, without issue/receipt/cancellation. Start creates a real quality work visit; continuation retains original start and records actual later actor. Continuing already-last-recorded work as the same actor is `QUALITY_WORK_UNCHANGED`, with no new event/version.

### 4.2 Inspection

```text
{ commandId: UUID, operation: INSPECT,
  orders: [{ orderId: UUID, expectedVersion: Version,
    decisions: [
      { pieceId: UUID, decision: ACCEPT }
      | { pieceId: UUID, decision: REJECT, target: CUTTING | PRODUCTION,
          reason: RequiredText4000, instructions: RequiredText4000 }
    ],
    inspectorNote?: OptionalText4000,
    packing?: { cartonCount?: OptionalText4000,
                cartonNumbers?: OptionalText4000 } | null
  }] }
```

The decisions array is nonempty and is the entire confirmed inspected selection. ACCEPT and REJECT are disjoint tagged shapes; ACCEPT cannot carry target/rejection fields. Untouched pieces are absent. Derived displayed quantities are never writable authority: inspected=decisions.length, accepted/rejected are tag counts. No raw inspectedQty/acceptedQty/rejectedQty is accepted. If a legacy form bridge supplies raw counts, its form-only validator rejects fractional/negative/mismatched counts before shaping this body.

Packing belongs to the exact ACCEPT identities in that order group. Nonempty packing with zero ACCEPT decisions is invalid; a null/all-blank packing object normalizes to null. Normalize optional inspectorNote independently of packing, so rejected-only inspector notes survive. Per-piece acceptance without packing controls omits packing; do not add demo defaults or a mandatory form. A packing row exists only when actual carton text is recorded, with accepted membership retained once. Inspector note is owned by the inspection group, never duplicated as packing.note.

Each REJECT may have a different target/reason/instructions. UI common-fill conveniences apply only to explicitly confirmed rejected identities. Schema validation never infers identity from quantities, order position or legacy segment IDs.

### 4.3 Approval escalation

```text
{ commandId: UUID, operation: REPORT_ISSUES,
  orders: [{ orderId: UUID, expectedVersion: Version, pieceIds: UUID[] }],
  reason: RequiredText4000, notes?: OptionalText4000 }
```

One confirmed common reason/note applies to those exact selected identities; different details require separately confirmed intents. Selected pieces may be quality INCOMING or IN_PROGRESS. They must meet P04 reporting rules and have no unresolved issue. Execute one all-or-nothing server command; never implement this by multiple browser requests.

## 5. Command response, replay and observation

`QualityCommandData` exact shape:

```text
{ kind: quality-command,
  receipt: { commandId: UUID, operation: QualityCommandOperation,
             actor: ApprovalActor, occurredAt: Instant },
  replayed: boolean,
  outcome: { orders: [
    { eventId: UUID, orderId: UUID, beforeVersion: Version, afterVersion: Version,
      pieces: [{ pieceId: UUID, visitId: UUID | null,
                 decision: ACCEPT | REJECT | null,
                 stage: OrderPieceStage, workState: OrderWorkState,
                 correctionId: UUID | null, issueId: UUID | null }],
      packingGroupId: UUID | null }
  ] }
}
```

Every order/event/piece identity is distinct and the whole outcome stays within the 200-piece budget. Actor is current QUALITY at acceptance or ADMIN, with real historical name/department, and never client-supplied. Stored original outcome is immutable and safe for replay after pieces move onward. Validate the outcome with its runtime schema before persistence and again when mapping stored results.

| Operation         | Versions per order                                                         | Exact piece outcome                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| RECEIVE_AND_START | after=before+1                                                             | QUALITY/IN_PROGRESS, new visitId, null decision/issueId, relevant open correctionId or null, no packing                                     |
| CONTINUE          | after=before+1                                                             | QUALITY/IN_PROGRESS, existing visitId, null decision/issueId, relevant open correctionId or null, no packing                                |
| INSPECT ACCEPT    | after=before+1 for the whole order group                                   | WAREHOUSE/INCOMING, ended quality visitId, ACCEPT, resolved correctionId or null, null issueId; no receivedAt write                         |
| INSPECT REJECT    | same one order increment, even mixed                                       | target CUTTING or PRODUCTION/INCOMING, ended quality visitId, REJECT, new correctionId, null issueId                                        |
| REPORT_ISSUES     | after=before+selected piece count, through sequential +1 P04 child updates | QUALITY/BLOCKED, quality visitId or null for unstarted incoming, null decision, relevant open correctionId or null, new issueId; no packing |

REPORT_ISSUES has that deliberate version delta because each retained P04 per-piece issue requires its own existing +1 approval command witness. The quality parent groups recovery and links the exact chain; it adds no duplicate version witness/increment. This is storage/audit compatibility, not a new product action. The client binds the returned delta to operation and selected count instead of assuming every operation is +1.

`bindQualityCommandResult(data, body)` must compare commandId, operation, actor/scope, exact order set, each expected beforeVersion and specified delta, exact piece IDs/decisions/target results, visit/correction/issue nullability and packingGroupId presence to the confirmed body. Matching count alone is insufficient. Observation binds the same original frozen body, not the current form/selection.

Hash canonical parsed intent (operation + sorted normalized orders/decisions + normalized notes/packing + expected versions; commandId excluded) using SHA-256. Do not trim meaningful nonblank packing/reason text during hashing. Same committed commandId + actor + exact hash returns original safe result with replayed=true before stale-current-state checks. Changed payload or another actor conflicts; current authority still applies. A new commandId for already-completed work fails current selection/state, not another business effect.

GET observation returns 200 original result, or actor-private 404 `QUALITY_COMMAND_NOT_FOUND`. It acquires the same command advisory lock so an in-flight original command serializes before the result lookup. 404 does not prove that a previously sent request cannot later arrive; retain and safely resend the identical frozen command under its original ID to reconcile. No automatic new ID, changed selection, background write retry or terminal-absence claim.

## 6. Read queries and schema ledger

`qualityOrdersQuerySchema`: strict `{view, search?, type?, page?, limit?}`. `qualityPiecesQuerySchema`: same plus `orderId?`. Reuse existing pagination normalization (default page 1/limit 25, integer-only textual/number input); grouped limit<=25, flat<=100, safe offset arithmetic. Search is optional trimmed text<=150, embedded-null rejected, blank normalized absent; search literal `%`, `_`, backslash are escaped for ILIKE, never SQL syntax. Type uses all seven existing order types. No new date/dedicated-worker/status filter widget.

`qualityActivityQuerySchema`: strict `{page?,limit?}`; department activity (not a fabricated fixed actor). `qualityOrderHistoryQuerySchema`: same plus optional UUID pieceId. History limit<=100. Empty input uses strict existing empty-query schema; unknown query keys fail. Export inferred `Quality*Query` output and `Quality*QueryInput` raw types.

All read data carry `department: QUALITY`. Export every named schema below and inferred PascalCase type; each object is strict. UUID/instant/actor/enum/text rules reuse sections 1–3. Null fields are present on output; nullable output is not omission.

### 6.1 Context and inspection entities

| Schema / type                                                 | Exact fields / refinements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualityWorkVisitSchema` / `QualityWorkVisit`                 | `{id,pieceId,sequence,originKind: PRODUCTION_ARRIVAL         \| LEGACY_BASELINE,sourceProductionEventId:UUID                                               \| null,sourceCorrectionId:UUID                    \| null,enteredAt:Instant                                                                                                                                                                                                    \| null,receivedAt:Instant                                                                                                                                                                                                                                                                                                                                                                                      \| null,startedAt:Instant \| null,startedBy:Actor \| null,endedAt:Instant \| null,endReason:INSPECT_ACCEPTED \| INSPECT_REJECTED \| ISSUE_REPORTED \| null,endedBy:Actor \| null,legacyUnknownStart:boolean}`. Source event/time agree for a witnessed production arrival; real combined receipt/start times and actor agree. Legacy unknown start is explicitly nullable, never an invented actor/time; all newly started runtime work has real current starter/time. End fields are all null while open or all valid/bound when ended. |
| `qualityCorrectionSummarySchema` / `QualityCorrectionSummary` | `{id,pieceId,cycle,target:CUTTING                            \| PRODUCTION,reason,instructions,rejectedAt:Instant,inspector:Actor,phase:WAITING_CORRECTION \| AWAITING_REINSPECTION                           \| INSPECTING}`. Represents only the one OPEN cycle; terminal cycle outcomes remain in history. Phase is derived from current piece/visit/issue, not writable input.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `qualityInspectionSummarySchema` / `QualityInspectionSummary` | `{decisionId,inspectionId,visitId,decision:ACCEPT            \| REJECT,inspector:Actor,inspectedAt:Instant,inspectorNote:string                            \| null,packingGroupId:UUID                        \| null,correctionId:UUID                                                                                                                                                                                                    \| null}`. inspectionId is the per-order QualityCommandOrder.eventId; decisionId is QualityPieceEvent.id. REJECT requires new correctionId and null packing; ACCEPT links resolved correction or null.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `qualityPackingGroupSchema` / `QualityPackingGroup`           | `{id,inspectionId,acceptedPieceIds:UUID[],cartonCount:string \| null,cartonNumbers:string                                                                  \| null,inspectorNote:string                       \| null,inspector:Actor,packedAt:Instant}`. 1–200 distinct exact accepted members; some actual carton text exists. Note/actor/time are derived from the same immutable command/order, not separately writable packing facts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `qualityPieceContextSchema` / `QualityPieceContext`           | `{pieceId,visit:QualityWorkVisit                             \| null,lastAction:{eventId,commandId,operation:QualityCommandOperation,actor,occurredAt}     \| null,currentCorrection:QualityCorrectionSummary \| null,latestInspection:QualityInspectionSummary                                                                                                                                                                            \| null,allowedActions:{canReceiveAndStart:boolean,canContinue:boolean,canInspect:boolean,canReportIssue:boolean}}`. Every nested pieceId matches context. No active action hint for a foreign/ended/blocked/cancelled/received piece. Incoming can receive/start and report; in-progress can continue (different last actor), inspect and report. Historical latest closed visit never grants current actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

The latest quality visit/decision and current cycle are independent facts: a piece under cutting correction can retain a closed quality visit and its rejection summary. `visit.sourceCorrectionId` identifies the cycle that visit reinspected; event/outcome correctionId identifies the cycle relevant at that action, including the newly opened cycle on rejection. Do not confuse those roles. A legacy start without original witness remains honestly unknown; current action history is still real.

### 6.2 Safe order, queue and page entities

| Schema / type                                               | Exact fields / refinements                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualityOrderHeaderSchema` / `QualityOrderHeader`           | Alias meaning of existing `manufacturingOrderHeaderSchema`: `{id,version,type,status,businessNumber,customerName,deliveryDate,counts}`. Existing counts fields are original/cancelled/active/received/completionPercent and use physical receipt. No finance/contact fields.                                                                                                                   |
| `qualityOrderSummarySchema` / `QualityOrderSummary`         | Header plus `{matchingPieceIds:UUID[],matchingPieceCount:integer,lastWorkAt:Instant                                                                                                                                                                                                                                     \| null}`. 1–200 distinct IDs, count equals membership and <=original. |
| `qualityPieceRowSchema` / `QualityPieceRow`                 | `{order:QualityOrderHeader,piece:FactoryOrderPiece,work:QualityPieceContext}`. `piece.id===work.pieceId`; one correct physical order.                                                                                                                                                                                                                                                          |
| `qualityDashboardDataSchema` / `QualityDashboardData`       | `{department:QUALITY,counts:{incoming:QueueCount,inspection:QueueCount,accepted:QueueCount,corrections:QueueCount},recentOrders:QualityOrderSummary[]}`; <=5 distinct recent orders, each with actual current/retained quality relation.                                                                                                                                                       |
| `qualityOrdersDataSchema` / `QualityOrdersData`             | `{department:QUALITY,view:QualityView,items:QualityOrderSummary[],counts:QueueCount,pagination:PaginationMeta}`; <=25 distinct items, total=counts.orders, page/limit match request.                                                                                                                                                                                                           |
| `qualityPiecesDataSchema` / `QualityPiecesData`             | `{department:QUALITY,view:QualityView,items:QualityPieceRow[],packingGroups:QualityPackingGroup[],counts:QueueCount,pagination:PaginationMeta}`; <=100 distinct piece rows, total=counts.pieces. Packing registry contains distinct latest groups referenced by returned contexts; no independent per-piece carton sum.                                                                        |
| `qualityOrderDataSchema` / `QualityOrderData`               | `{department:QUALITY,paper:FactoryOrderPaperData,work:QualityPieceContext[],packingGroups:QualityPackingGroup[]}`. Exactly one context for every safe paper piece, 1–200 total, unique IDs; <=200 distinct latest linked packing groups. No previous groups are overwritten; historical groups are paged in history.                                                                           |
| `qualityActivityDataSchema` / `QualityActivityData`         | `{department:QUALITY,events:QualityActivityItem[],pagination:PaginationMeta}`; <=100 distinct `(kind,event.id)` entries, consistent row/count scope.                                                                                                                                                                                                                                           |
| `qualityOrderHistoryDataSchema` / `QualityOrderHistoryData` | Activity shape plus `{orderId}`; every event belongs to that order and, when pieceId filter is supplied, contains that physical piece. Return its original complete per-order group membership rather than truncating immutable inspection/packing facts. No unrelated event substitution.                                                                                                     |

`QueueCount={orders:nonnegativeSafeInteger,pieces:nonnegativeSafeInteger}`, orders<=pieces and zero agree. Zero total means zero pages; out-of-range page yields empty items and accurate totals, then UI explicitly requests `max(1,totalPages)`. Query ordering is actual lastWorkAt DESC NULLS LAST, order UUID DESC for groups; for flat rows actual lastWorkAt DESC NULLS LAST, order UUID DESC, physical position ASC, piece UUID ASC. Latest decisions/visits use stable sequence/order-version tie breakers, not mutable display names or array order. Backend B08 defines the shared current/historical/search predicates and index owners; count and page queries use the same predicates in one read snapshot.

Queue membership follows spec: current actionable incoming/inspection; latest accepted noncancelled piece retained after onward movement; one OPEN correction per noncancelled piece, including visible blocked facts with no action hints. `currentCorrection.phase` distinguishes ordinary waiting, returned incoming and active reinspection. Correction scopes may overlap incoming/inspection; no summed stock total. Held pieces contribute no actionable controls/count claim. `counts` in a queue measures that named matching scope; physical header counts remain separately explicit.

Packing registries contain only referenced distinct groups and every recorded member is a real ACCEPT event of that inspection/order. Per-piece latest summaries may reference the same group; display its carton fields once at group/history level. They are free text, not stock quantities to total. Whole-order detail can show a rejected piece's history without manufacturing a current packing group.

### 6.3 Activity events, history and shared projections

`qualityInspectionDecisionSchema` is exported by the command schema owner and is the strict per-piece ACCEPT/REJECT input shape from §4.2, imported by the event owner and reused in an immutable inspection event (not an input authority shortcut). `qualityActivityEventSchema` / `QualityActivityEvent` is:

```text
{id:UUID,commandId:UUID,orderId:UUID,orderVersion:Version,
 businessNumber:BusinessNumber,department:QUALITY,operation:QualityCommandOperation,
 actor:Actor,occurredAt:Instant,pieces:QualityPieceOutcome[],
 correctionLinks:QualityCorrectionEventLink[],
 inspection:{decisions:QualityInspectionDecision[],inspectorNote:string|null,
             packing:QualityPackingGroup|null}|null,
 report:{reason:RequiredText4000,notes:string|null}|null}
```

`qualityCorrectionEventLinkSchema` / `QualityCorrectionEventLink` is strict `{pieceId:UUID,correctionId:UUID,cycle:Version,action:OPENED|REINSPECTION_STARTED|ACCEPTED|REJECTED}`. Every quality event carries `correctionLinks` (empty when no defined cycle action), with at most 400 distinct `(pieceId,correctionId,action)` links, at most two per piece. Link identities are bound to that event's actual member and persisted source/rejection/resolution witnesses:

| Event branch                              | Exact immutable cycle links                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordinary INSPECT REJECT                   | One OPENED link to the new rejected cycle and its actual cycle number.                                                                           |
| Reinspection INSPECT REJECT               | One REJECTED link to the prior cycle k plus one OPENED link to distinct new cycle k+1; identities and piece agree with visit source/new outcome. |
| Reinspection INSPECT ACCEPT               | One ACCEPTED link to the cycle actually resolved by that decision. Ordinary acceptance has none.                                                 |
| RECEIVE_AND_START for a correction return | One REINSPECTION_STARTED link to visit.sourceCorrectionId and its actual cycle number. Ordinary start has none.                                  |
| CONTINUE or REPORT_ISSUES                 | Empty links; their existing relevant correctionId is not fabricated into a new lifecycle action.                                                 |

Derive OPENED from QualityCorrectionCycle.rejectionEventId; terminal ACCEPTED/REJECTED from resolutionQualityEventId; REINSPECTION_STARTED from the actual started visit's sourceCorrectionId/startedCommandId. A later terminal cycle state must not rewrite an old OPENED event into a current-status claim. Original opening decision already carries target/reason/instructions, and the event carries original actor/time. Each page can render cycle number and actual terminal/predecessor transition without joining other history pages or pretending currentCorrection still exists.

id is per-order eventId, orderVersion is afterVersion, not a new sequence. For INSPECT only inspection is nonnull, exact IDs/outcomes/tags agree and report is null. For REPORT_ISSUES only report is nonnull; its distinct blocked pieces/issueIds and +N range remain linked to the real P04 children. For start/continue both are null. A piece-filtered history qualifies an event containing the requested piece and returns that original whole per-order event, with its complete decisions and actual packing membership; never falsify the stored group to make a filtered view. Event schema enforces operation/state/outcome and safe actor/text bindings.

In main `quality.schema.ts`, `qualityIssueActivityEventSchema` / `QualityIssueActivityEvent` is strict `{id,commandId,orderId,orderVersion,businessNumber,pieceId,issueId,sourceDepartment:CUTTING|PRODUCTION|QUALITY,operation:REPORT_ISSUE|RESOLVE_ISSUE|REVIEW_CONTACT,result:REPORTED|HELD_FOR_CONTACT|RELEASED|CANCELLED,target:CUTTING|PRODUCTION|null,actor,occurredAt,reason:string|null,notes:string|null,correctionResolution:{correctionId:UUID,cycle:Version,outcome:CANCELLED}|null}`. REPORT returns actual reason/optional report note; approved release/cancel returns accepted decision instructions/reason. HELD_FOR_CONTACT has no proposed specification or private contact notes. Require real actor authority for each operation/source. id=commandId. No proposal/contact snapshot/financial facts.

For a safe P04 cancellation event, `correctionResolution` is nonnull exactly when a same-order/piece quality cycle has `state=CANCELLED` and `resolutionApprovalCommandId===event.commandId`; the actual resolution time equals event.occurredAt. Otherwise it is null. Qualify that historical event by the resolution FK even when its issue.sourceDepartment is CUTTING or PRODUCTION: a piece rejected by quality can be cancelled after an issue in either correction department. This is a retained cycle outcome, not new cancellation authority. No guessed temporal join or mutable-current-cycle lookup is permitted.

`qualityActivityItemSchema` / `QualityActivityItem` is discriminated union:

- `{kind:quality,event:QualityActivityEvent}`.
- `{kind:manufacturing,event:ManufacturingActivityEvent}` using the existing primitive event schema; project only actual quality-related correction/source members, retaining real CUTTING/PRODUCTION department and actor.
- `{kind:issue,event:QualityIssueActivityEvent}`.

Top page department is QUALITY; do not require every contained event.department to be QUALITY. Qualify events by real current/retained quality order/piece participation. Activity/history ordering is occurredAt DESC, event UUID DESC, kind ASC, same in count/page projections. `QualityActivityQuery` is department-wide; own history-result observation controls appear only for event.actor.id===current actor and use that original commandId with no reconstructed POST.

Existing `salesActivityItemSchema` gains `{kind:quality,event:qualityActivityEventSchema}`. Existing order-activity SQL counts/pages include the quality parent once and suppress only P04 REPORT_ISSUE children with a positively validated QualityApprovalReport parent link; standalone reports and later RESOLVE_ISSUE/REVIEW_CONTACT remain. Quality activity/history uses the identical suppression policy. Direct P04 child records and authorized receipts are retained; the own-approver decision list remains unchanged. Quality never receives the full sales/approval activity union, whose private commercial/proposal branches are inappropriate for factory staff.

OpenAPI must register the same proposed request/result schemas and exact HTTP ledger, not copy divergent DTOs. Update producer/consumer union tests and safe nested projections together. History-only observation validates receipt ID/current actor and its schema; if no frozen submitted body exists after reload, it may display an original result but cannot reconstruct/retry an action from history. An active unknown command session still requires full frozen-intent binding for recovery/resend. No raw parent payloadHash, beforeFacts, afterFacts or child private facts leave the service.

## 7. Safe failures and compatibility

| HTTP / code                                | Meaning / unchanged state                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 400 `VALIDATION_ERROR`                     | Shared strict shape/text/identity/bound failure; no command effects; target-prefixed field paths                                |
| 400 `INVALID_JSON`                         | Existing parser failure, before quality command; no effects                                                                     |
| 401 existing auth codes                    | Missing/invalid identity/session; use existing session behavior                                                                 |
| 403 existing account/department/CSRF codes | Current authority or CSRF denied; no protected disclosure/write                                                                 |
| 404 existing `ORDER_NOT_FOUND`             | Unknown/inaccessible order/task/piece scope without fallback                                                                    |
| 404 `QUALITY_COMMAND_NOT_FOUND`            | Unknown/another actor's receipt; no private result                                                                              |
| 409 `QUALITY_SELECTION_CONFLICT`           | Any selected current piece invalid/blocked/moved/cancelled; whole batch unchanged                                               |
| 409 existing `ORDER_STATE_CONFLICT`        | Submitted order is not currently approved/eligible; whole batch unchanged                                                       |
| 409 existing `ORDER_VERSION_CONFLICT`      | Any root version stale/overflow; whole batch unchanged                                                                          |
| 409 `QUALITY_WORK_UNCHANGED`               | Continuation by same already-last actor; no fabricated work/event                                                               |
| 409 `QUALITY_COMMAND_CONFLICT`             | Committed commandId bound to different intent/actor                                                                             |
| 409 `QUALITY_TRANSACTION_CONFLICT`         | Bounded identified transaction/lock conflict; observe original result before safe same-intent retry                             |
| 413 existing `PAYLOAD_TOO_LARGE`           | Existing configured transport cap; no automatic split; retain input/reduce explicit selection/reconfirm                         |
| 500 existing `INTERNAL_SERVER_ERROR`       | Unexpected mapping/persistence error sanitized by existing handler; no false persisted success                                  |
| Client `ApiContractError`                  | Malformed/wrong-context success payload; reject publication; for a write its persisted outcome remains uncertain until observed |

Verify exact reused code strings/classes against their source at implementation. New errors are proposed in `apps/api/src/modules/quality/quality.errors.ts`; narrow database failure classifiers recognize only planned quality constraint/unique names, never arbitrary P2002/23514 as caller conflict. Reuse existing error envelopes/request IDs/redaction. Arabic UI messages map safe code/field/action to the spec's intended cause/recovery; don't display raw English server internals or user payloads.

All endpoints are additive. `salesActivityItemSchema` gains `kind: quality` with the primitive event; update all actual API producers/browser parsers/renderers/OpenAPI together. Preserve existing routes, department enums, P04 direct child records/receipts, factory financial redaction and accepted paper layouts. A coordinated API/web release is required for strict union consumers; old clients are not assumed compatible with an unknown activity discriminant. No release occurs during PLAN.
