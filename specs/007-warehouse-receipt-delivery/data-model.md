# P07 Persistent Warehouse Model

Status: proposed PLAN design, not an applied schema/migration or data audit. Read [contracts](contracts/warehouse.md), [backend algorithms](backend-design.md) and the accepted [specification](spec.md). Current Prisma/PostgreSQL, stable `SalesDraft` root and physical `SalesOrderPiece` remain authoritative. No new order, segment ledger, inventory platform or generic event framework is introduced.

## D01. Existing roots and lifecycle

Retain `SalesDraft.id/version/status`, submitted `SalesOrder`, captured `SalesDraftPiece`, physical `SalesOrderPiece`, all P03–P06 data and existing enum meanings. `SalesOrderStatus` already includes READY_FOR_DELIVERY, OUT_FOR_DELIVERY, DELIVERY_FAILED and DELIVERED. `SalesPieceStage` has WAREHOUSE, not delivery stages. Add no new delivery piece-stage values. After receipt a noncancelled physical piece stays WAREHOUSE/COMPLETED with its immutable initial receivedAt; order status plus the attempt/outcome explains present custody.

Receipt changes WAREHOUSE/INCOMING/receivedAt null → WAREHOUSE/COMPLETED/receivedAt command.occurredAt. Current work visit/issue/cancellation are null; the accepted source is a real Quality ACCEPT event. Every order group, regardless of selected piece count, increments the existing root version once and updates root.updatedAt once. Shared sales paid and P04 issue/cancellation use that same lock/version. No second version authority is introduced.

| Operation                                            | Root order status before → after      | Initial receivedAt / physical state                                        |
| ---------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| Partial RECEIVE                                      | APPROVED → APPROVED                   | Exact received subset once; companions unchanged                           |
| Final RECEIVE                                        | APPROVED → READY_FOR_DELIVERY         | Exact positive active received equality after subset write                 |
| P04 cancellation of last unreceived active companion | APPROVED → READY_FOR_DELIVERY         | Existing cancellation only; remaining received facts unchanged             |
| P04 cancellation of last active piece                | APPROVED → CANCELLED                  | Existing cancellation/history/money semantics                              |
| DISPATCH                                             | READY_FOR_DELIVERY → OUT_FOR_DELIVERY | All active membership retained in attempt; no extra receipt                |
| CONFIRM_DELIVERY                                     | OUT_FOR_DELIVERY → DELIVERED          | Current attempt complete outcome; receivedAt unchanged                     |
| FAIL_DELIVERY                                        | OUT_FOR_DELIVERY → DELIVERY_FAILED    | Current attempt full physical-return acknowledgement; receivedAt unchanged |
| RETRY_DELIVERY                                       | DELIVERY_FAILED → READY_FOR_DELIVERY  | Immutable retry record; no new attempt until DISPATCH                      |

`deriveOrderStatusAfterCancellation` in the existing sales-orders rules owner computes zero active→CANCELLED; otherwise exact positive received equality with no hold→READY_FOR_DELIVERY; otherwise APPROVED, for the existing APPROVED cancellation context. P04's current authority/issue eligibility remains unchanged. It receives remaining physical records, not a browser count. Reject unexpected starting statuses through the existing caller guards; the pure helper does not legalize warehouse cancellation. Its use and the matching READY cancellation outcome/schema/SQL changes are required P07 integration.

## D02. New model ledger

All names and mapped tables below are proposed additions to `packages/database/prisma/schema.prisma`. UUIDs are PostgreSQL UUID, instants Timestamptz(6), date-only `Date`, finite strings VarChar as specified; all FKs use RESTRICT/NO ACTION and retain records. `ActorStamp` below expands to actorId FK User, actorFullName VarChar150, actorRole UserRole and nullable actorDepartment Department. Real command actors must be ADMIN or WAREHOUSE in SQL checks. It is a field shorthand in this document, **not** a new Prisma embedded type/table.

### WarehouseCommand → `warehouse_commands`

- commandId UUID primary key; operation new `WarehouseOperation` enum with C03's five values.
- ActorStamp, payloadHash Char64 lowercase SHA-256, occurredAt nonnull, outcome JsonB.
- `@@index([actorId,occurredAt(sort:Desc),commandId(sort:Desc)], map:"warehouse_commands_actor_time_idx")`.
- Immutable INSERT-only root, no update/delete/expiry/cleanup policy. Outcome is a safe immutable command projection validated against relational members, never the independent lifecycle ledger.

### WarehouseCommandOrder → `warehouse_command_orders`

- commandId, orderId UUID; composite PK `(commandId,orderId)`, FK command + SalesOrder.
- eventId UUID unique, beforeVersion Int, afterVersion Int, beforeStatus/afterStatus existing SalesOrderStatus, pieceIds UUID[] containing exact sorted distinct nonempty scope.
- unique `(orderId,afterVersion)`; index `(orderId,eventId)`.
- `afterVersion=beforeVersion+1` in BIGINT arithmetic, both 1–2147483647; max200 distinct IDs; event UUID stable. One row per affected order, one event even for200 receipt pieces. Root command across all groups totals1–200 pieces and1–200 orders.
- Immutable per-order version/event witness. FK `(commandId,orderId)` is the shared child key below; add corresponding composite unique keys where a child relation needs an ID+order reference.

### WarehouseReceiptGroup → `warehouse_receipt_groups`

- id UUID PK, commandId/orderId UUID unique pair and FK CommandOrder; unique `(id,orderId)`.
- cartonCount, storageLocation, notes nullable VarChar4000; blank forbidden after normalization, original significant text retained.
- No own fake worker/time: receipt actor/time is the parent command. One group per order in RECEIVE even when all optional fields absent. Distinct arrivals create distinct groups; group metadata is not copied per piece.
- A group belongs only to operation RECEIVE; each group must contain at least one matching COMMAND receipt member.

### WarehouseReceiptPiece → `warehouse_receipt_pieces`

- pieceId UUID PK: **one initial receipt witness per physical piece for its entire lifetime**.
- orderId UUID; FK `(pieceId,orderId)` to SalesOrderPiece `(id,orderId)`.
- origin new `WarehouseReceiptOrigin` enum COMMAND or LEGACY_BASELINE.
- groupId UUID nullable, FK `(groupId,orderId)` to ReceiptGroup `(id,orderId)`; qualityEventId UUID nullable, FK `(qualityEventId,orderId,pieceId)` to QualityPieceEvent `(id,orderId,pieceId)`.
- receivedAt nonnull; index `(orderId,groupId,pieceId)`; unique `(pieceId,orderId)` for attempt-member relations.
- COMMAND requires groupId and qualityEventId, exact source event is ACCEPT/QUALITY→WAREHOUSE and source parent INSPECT, source time≤receivedAt. Parent receipt command time equals receivedAt; command scope contains exactly these members. LEGACY_BASELINE requires groupId/qualityEventId null; it carries the pre-existing known timestamp only. It exposes no fabricated actor/packing/acceptance witness.
- Install runtime INSERT guard after migration baseline insertion to reject every new LEGACY_BASELINE member. All receipt members immutable. Presence of a group ID cannot bypass physical transition predicates.

### WarehouseDeliveryAttempt → `warehouse_delivery_attempts`

- id UUID PK, orderId UUID, number Int positive; unique `(orderId,number)` and `(id,orderId)`.
- commandId UUID; unique `(commandId,orderId)`, FK CommandOrder. deliveryNote nullable VarChar4000.
- predecessorRetryId UUID nullable unique, FK Retry `(id,orderId)`; first number1 has null predecessor; each later number binds the immediately preceding attempt's failed outcome + retry.
- Index `(orderId,number(sort:Desc))` supports latest attempt without loading all history.
- Actor/time comes from dispatch parent command. Attempt is immutable original dispatch, **no mutable status column**. DTO status is derived from unique outcome. Later outcome/retry does not update dispatch record or its event projection.

### WarehouseDeliveryAttemptMember → `warehouse_delivery_attempt_members`

- attemptId/orderId/pieceId UUID; PK `(attemptId,pieceId)`.
- FKs `(attemptId,orderId)` to Attempt and `(pieceId,orderId)` to ReceiptPiece; index `(orderId,pieceId,attemptId)`.
- Exact original full active membership, max200. Different attempts may refer to the same received piece; one attempt may not repeat it. Insert-only.

### WarehouseDeliveryOutcome → `warehouse_delivery_outcomes`

- id UUID PK, attemptId/orderId UUID; attemptId unique, FK `(attemptId,orderId)`; unique `(id,orderId)`.
- commandId UUID, unique `(commandId,orderId)`, FK CommandOrder.
- kind new `WarehouseDeliveryOutcomeKind` enum DELIVERED or FAILED.
- recipient nullable VarChar4000, deliveredAt nullable Timestamptz(6), reason nullable VarChar4000, notes nullable VarChar4000, returnedToWarehouse Boolean.
- DELIVERED requires returnedToWarehouse false, reason null; optional recipient/actual deliveredAt retained. FAILED requires returnedToWarehouse true, nonblank reason, recipient/deliveredAt null. Actor/recording time comes from parent command and is separate from actual deliveredAt.
- A unique attemptId makes success-versus-failure mutually exclusive even across different command keys. One immutable outcome; no edits or replacement by a later response.

### WarehouseDeliveryRetry → `warehouse_delivery_retries`

- id UUID PK, attemptId/orderId UUID, outcomeId UUID; attemptId unique; FK `(attemptId,orderId)` to Attempt and `(outcomeId,orderId)` to Outcome; unique `(id,orderId)`.
- commandId UUID; unique `(commandId,orderId)`, FK CommandOrder; retryDate nullable PostgreSQL Date and notes nullable VarChar4000.
- Outcome must belong to that same attempt and be FAILED. Actor/time comes from retry command, at or after failed recording time. One immutable retry per failed attempt; ordinary next dispatch references it exactly once. No automatic dispatch or overwrite of submitted promised date.

No customer contact snapshot is copied into these tables. Read the accepted minimal fields from existing SalesOrder submitted columns; delivered-recipient evidence remains a separate captured value. All original catalog/price/customer snapshots and paid records remain untouched.

## D03. Database invariants and forward function changes

Create one forward migration at proposed `packages/database/prisma/migrations/20261113000100_p07_warehouse_receipt_delivery/migration.sql`; actual migration execution is later implementation work on owned disposable targets first. Do not alter any previous SQL/checksum. The new migration defines types/tables, validates baseline, then installs/replaces only the named functions below. Existing migrations through `20261112000100_p06_quality_validation_dispatch` remain byte-for-byte intact.

Names/purposes:

| Proposed SQL owner             | Required exact check                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ck_warehouse_command_shape`   | Actor, operation, payload hash, version arithmetic, original sorted membership and200-total budget                                 |
| `ck_warehouse_receipt_binding` | ReceiptGroup/member/Quality acceptance/physical timestamp and command identity bind exactly                                        |
| `ck_warehouse_attempt_graph`   | Sequential attempts, full received membership, original dispatch, unique terminal outcome, failed-only one retry and one successor |
| `ck_warehouse_command_head`    | New command outcome/group afterVersion/status equals its accepted head and relational child output                                 |
| `ck_warehouse_order_state`     | Current root/physical receipt/custody/attempt eligibility agree; no ready/in-flight/delivered zero-active order                    |
| `ck_warehouse_retained`        | No UPDATE/DELETE of any new immutable row; no runtime legacy receipt insertion                                                     |

Use ordinary CHECK/UNIQUE/FKs for row-local invariants. Defer graph checks as `DEFERRABLE INITIALLY DEFERRED` constraint triggers so one transaction can insert circular attempt↔retry/source relationships and required command history safely. Circular _type_ relations do not require fake callbacks or intermediate commits.

`check_p07_warehouse_command(command_key UUID)` validates one bounded immutable command as sets: group/event identity, proper operation-specific child presence, exact scope and output JSON, origin actors/times, status transition and max200 total. For RECEIVE, relational receipt members equal command scope; for dispatch, members equal original reviewed active scope; for outcomes/retry, scope equals referenced attempt members. It compares original retained facts, not a future live order state.

`check_p07_warehouse_order_state(order_key UUID)` validates current graph: every receivedAt has its matching receipt member and same timestamp; command receipts are WAREHOUSE/COMPLETED unless a later allowed cancellation retains receipt; no unreceived piece has a receipt member. Ready/in-flight/failed/delivered orders have positive active exact received equality, no issue/open correction/current manufacturing visit. Latest dispatched attempt corresponds to OUT_FOR_DELIVERY; latest failed/no-retry corresponds to DELIVERY_FAILED; latest delivered corresponds to DELIVERED. A failed+retry latest or no-attempt fully received order corresponds to READY_FOR_DELIVERY. No second unresolved attempt exists. Active membership of current delivery attempts cannot change through cancellation; the existing dispatched/delivered cancellation restrictions remain enforced. Cancelled historical identities/receipts stay retained and are excluded from active counts.

`enforce_p07_warehouse_graph()` is a deferred trigger on **WarehouseCommand INSERT only**: once for that parent, validate its complete bounded command and each affected current order; verify exactly one cross-module root-version witness at each group head. It is not attached to every child. Child BEFORE INSERT guards check only the specific row: allowed parent operation, exact declared command/order identity and pieceId membership, source FK/pair fields, and the matching frozen original outcome group/child ID. Original CommandOrder/outcome membership, unique child keys and complete parent validation guarantee initial coverage; later appending an undeclared order/piece/type is rejected locally, while already declared complete members conflict with existing unique keys. No child may mutate/delete.

A second deferred `p07_root_current_state` trigger runs once for the actual SalesDraft version bump when a matching P07 head exists, or for an actual P04 CANCEL head (readiness reconciliation); nonwarehouse/noncancellation roots return without a warehouse scan. Each P07 group advances its root exactly once. This yields at most two simple current-state checks per affected order (parent and root), never one complete command/history scan per piece. Physical and status updates are protected by the exact transition-witness guards below; they do not attach full graph scanners to every piece/status row. The existing P05/P06 guards remain enabled. Migration preflight validates full retained graphs once; new parent INSERT validates only that bounded parent, not all prior parents. The200-member through-COMMIT regression must retain this trigger dispatch and all integrity checks.

`enforce_p07_order_transition()` checks an actual changed SalesOrder.status. Preserve all existing initial approval/return validation. For APPROVED→READY, require a new P07 RECEIVE witness at current root.version or an actual P04 CANCEL decision at that version plus exact positive receipt equality. READY→OUT, OUT→DELIVERED/FAILED and FAILED→READY require the corresponding P07 head witness. No arbitrary direct status change is permitted. Existing P04 zero-active cancellation is preserved. Same-status paid updates do not create warehouse activity. Do not add broad exemption based only on actor/admin flags.

Required forward replacements of existing functions:

1. `enforce_p05_root_head`: retain every existing sales/approval/manufacturing/quality/correction branch from current P06 migration; add warehouse_command_orders as one distinct version witness. Every P07 operation is exactly+1; no REPORT_ISSUES-style child fan-out.
2. `enforce_p05_piece_transition`: retain every current P04/P05/P06 branch; add exactly WAREHOUSE/INCOMING/null receivedAt → WAREHOUSE/COMPLETED/command.occurredAt with a COMMAND receipt witness at root.version, real ACCEPT source, unchanged issue/currentWorkVisit/cancellation/identity. Do not allow broad receivedAt changes, generic warehouse stage patches or future delivery statuses as piece stages.
3. `enforce_p04_command_head`: retain authority, complete facts, money, proposal and current-head checks; change newly inserted after_facts counts to the strict capped formula, and allow the exact existing CANCEL decision's order result to be READY when remaining active received equality holds. Stored older facts are never rewritten or revalidated as current after-image facts.
4. Leave current `check_p06_quality_order_state`, `check_p06_quality_command`, `enforce_p06_quality_graph` and `enforce_p06_quality_head` unchanged. Source inspection establishes compatibility: current state checks in `20261112000100_p06_quality_validation_dispatch` require an open Quality visit exactly for QUALITY/IN_PROGRESS unreceived work, and reject open corrections outside upstream stages; accepted visits/corrections are already terminal before P07. The retained-command validator in `20261111000200_p06_quality_workspaces` checks original events/visits/packing rather than comparing accepted original outcomes to the later live piece. The head validator triggers only on insertion of quality_command_orders. P07 inserts none of those rows. External root/piece updates dispatch to the current-state checker only. Thus WAREHOUSE receipt and later root custody changes require no P06 relaxation; every original trigger/retention rule remains. Regression tests prove this exact preserved path.

SQL completion formula for new head facts mirrors TypeScript: active0→0; received=active→100; otherwise least(99,round(100.0*received/active)). Counts derive from stage<>'CANCELLED' and receivedAt IS NOT NULL. `approvalEventFactsSchema` historical compatibility does not authorize old round-only current writes after this migration.

## D04. Existing-data migration and recovery

The migration runs transactionally and fails without changes when data is contradictory. Before graph-trigger installation, inspect real existing rows in the target through a separately authorized read-only environment check. This PLAN command inspects source only, not a live database. A missing database or unresolved operational history cannot be repaired by demo import/reset.

Deterministic migration policy:

1. Preserve every pre-existing order/piece/submitted value, P01–P06 command JSON, actor, timestamp, visit, inspection, packing and correction. Do not recompute immutable percentages/status in old stored results. No delete/backfill of fake actors, quality acceptance or delivery attempts.
2. For existing nonnull physical `SalesOrderPiece.receivedAt`, insert one LEGACY_BASELINE ReceiptPiece containing its real order/piece/timestamp only. Group/acceptance/actor remain absent. Require a structurally valid WAREHOUSE/COMPLETED or retained cancelled piece and no active upstream visit/issue/correction. Never infer receipt from Quality ACCEPT, stage alone, packed cartons or browser snapshots.
3. An existing WAREHOUSE/INCOMING unreceived piece must have its retained real Quality ACCEPT source before it becomes actionable. Preserve an unwitnessed incoming row in the database; it is read-only companion context only inside an order that otherwise qualifies through a real accepted handoff/known receipt/attempt. An isolated unwitnessed stage row grants no warehouse read visibility or contact access; `canReceive=false`, with a safe unavailable-action explanation. It is not counted received or dispatchable and is not repaired by a fabricated acceptance. Production data remediation, if actually needed, requires a separately reviewed provenance decision; it cannot block independent new witnessed-flow development.
4. An existing READY_FOR_DELIVERY order requires exact positive complete receipt and no blocker. A pre-existing APPROVED order satisfying those same proved facts may be normalized to READY_FOR_DELIVERY by this forward migration's derived-state repair, without inventing a warehouse business action/actor or changing root version/history. The migration inventory labels this normalization explicitly; new runtime status changes require real witnesses. Sequencing is fixed: create new tables, insert known baseline receipt rows, reject inconsistent/pre-existing delivery cases, then perform this status-only normalization **before** installing the new P07 transition/graph triggers. Keep all earlier triggers enabled. Current `enforce_sales_order_terms` freezes submitted business/customer fields but permits a status-only update; `check_sales_order_graph` validates retained identity/active money and has no APPROVED-only rule; `enforce_p04_initial_transition_witness` requires a new decision only when approvedAt/return proof changes, neither of which is changed here. No SalesDraft UPDATE occurs, so the old root-version witness trigger is not invoked. After normalization, install P07 validators/runtime legacy guards and run full final graph checks. Source compatibility is established in the cited existing migration functions, not deferred to implementation choice. Incomplete APPROVED remains unchanged.
5. Pre-existing OUT_FOR_DELIVERY/DELIVERY_FAILED/DELIVERED without retained real attempt evidence cannot be converted into fabricated attempt rows. Abort migration with the affected stable IDs/count classification for a read-only data audit; disclose no customer/secret values. No blanket acceptance, reset or guessed successful migration. Before production application this explicit gate must be resolved from authoritative evidence. The current source supplies no old persisted delivery-attempt model; do not claim this target condition was checked.
6. Reject contradictory received timestamps/stages, invalid receipt uniqueness, partial delivery claims and impossible cancelled/ready state without altering original records. Fail migration transaction; diagnose through a reviewed populated fixture or authorized data read. Do not weaken constraints to pass existing bad data.
7. Install runtime guards rejecting new legacy receipt origin; validate all original P04–P06 graphs and new P07 baselines in bounded per-order checks. Fresh DB and repeat deploy must both work; migration is recorded by Prisma once, not rerun as ad hoc DML.

Recovery uses preserved backups/history and a new forward repair after diagnosis, never editing applied SQL or dropping the new history tables. Actual backup/production rollout are P08/OPS-01 actions with their own authorization. Application and schema release are coordinated: apply migration and API/contracts together before exposing warehouse frontend. Old browser writes cannot reach local fixture authority; malformed/old command fields fail safely.

## D05. Query indexes and bounded work

Existing order indexes support status/submitted time, and `sales_drafts_updated_id_idx` already supports root updatedAt/id. Reuse it; no speculative new root index is added since warehouse lastActionAt is a joined aggregate. New indexes are justified by actual joins: ReceiptPiece `(orderId,groupId,pieceId)`; CommandOrder `(orderId,eventId)` and unique order/version; Command actor/time; Attempt order/number DESC; attempt-members order/piece/attempt; all FK child keys that lack a leading index. Use existing Quality `(orderId,pieceId,commandId)` and accepted-parent indexes for the ACCEPT/source join; add no new speculative Quality index. Query-plan evidence at implementation verification can identify an actual remediation under the same owner.

W01 queries construct a fixed participating-order CTE using EXISTS real Quality accepted handoff/receipt/attempt. Compute physical count/status predicates with one aggregate per participating order; use one row per physical piece for matching/search/count/page. Use parameterized Prisma.sql with fixed aliases/enum predicates; no interpolated user SQL, unbounded Promise.all or row-by-row latest-attempt/history fetches. Query one latest attempt per paged order with LATERAL/order-index or DISTINCT ON, then bounded members/outcomes/retries/groups maps. Paginate identities before materializing display objects. Detail contains at most200 physical pieces/groups and only latest attempt, while older attempts/events use bounded history pages. The model has no external network work, file export, worker or queue.

## D06. Migration and integrity verification cases

The backend's B01–B14 cases own actual file mapping. At real migrated PostgreSQL boundary prove:

- Fresh deployment, schema-contract expected tables/types/FKs/index inventory, valid initial200-piece order and genuine Quality handoff.
- Populated upgrade with ordinary incoming, quality corrections/packing, known legacy receipt timestamp with honest missing actor/group, incomplete/complete/cancelled orders and unchanged old command JSON hashes.
- Abort on unproved pre-existing delivery state/contradictory received graph with all pre-migration data unchanged; read-only unwitnessed incoming remains unavailable rather than receiving a fabricated event.
- Illegal duplicate receipt/member, wrong-order composite FK, forged source ACCEPT, orphan child, changed immutable row and direct status/receivedAt tampering fail at commit. Negative tests keep earlier constraints intact.
- Full root-version witness + old P04/P05/P06 flows after the new migration; last-missing P04 cancellation→READY, zero-active cancellation→CANCELLED, safe new P04 counts99 and unchanged historical100 replay/detail.
- Forced required-child failure rolls back every selected order's physical state/status/version, groups/attempts/outcomes/retries/command and audit rows. Real competing sessions prove unique receipt/outcome and one retry/successor.
- Maximum200-member transaction through COMMIT under the existing10-second transaction budget, with all constraints enabled; this is bounded implementation viability evidence, not an end-user performance SLA.

Extend actual isolated test cleanup fixed-table allowlists in `apps/api/src/test-support/reset-test-data.ts` and `packages/database/tests/integration/seed.integration.test.ts`, schema inventory and migration assertions. Keep explicit FK order/no CASCADE; no developer or production data is a fallback. No test/migration is executed by this PLAN artifact.
