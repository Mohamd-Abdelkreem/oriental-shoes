# P08 persistence, invariants and forward-change design

Design only, based on the current Prisma schema and authored P03–P07 migrations.
No migration is created/applied by PLAN. Wire names live in
[the administration contract](contracts/administration.md); operation order lives
in [backend design](backend-design.md). Proposed models below are not current source.

## D01 — Existing and proposed owners

Existing identity and quantity owners remain `User`, `SalesDraft`, `SalesDraftPiece`,
`SalesOrder`, `SalesOrderPiece`, their retained sales/approval/manufacturing/quality/
warehouse commands and operational history. `SalesDraft.version` is the single
submitted-order version. A draft paper row is one stable physical identity after
submission; never add a quantity/segment authority. Customer master and original
submitted contacts remain distinct. Receipt/attempt history is retained, not stock
that is erased when a piece is cancelled.

Add these Prisma models to `packages/database/prisma/schema.prisma` and relations
to their current owning records. All FKs use RESTRICT/NO ACTION; new cyclic graph
references are DEFERRABLE INITIALLY DEFERRED in authored forward SQL, following the
existing graph convention. Model/map names are fixed:

New Prisma enum names/mapped PostgreSQL identities are `AdministrationOperation`
→ `administration_operation` (ADMIN_CANCEL, ADMIN_CORRECT) and
`AdministrationCancellationScope` → `administration_cancellation_scope`
(ORDER, ITEM, QUANTITY). Existing quality enum identity is separately recorded in D02.

| Proposed model / table                                               | Fields and keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdministrationCommand` / `administration_commands`                  | commandId UUID PK; operation enum ADMIN_CANCEL or ADMIN_CORRECT; actorId UUID FK User; actorFullName varchar150; actorRole existing UserRole restricted ADMIN; actorDepartment existing nullable Department; orderId UUID FK SalesOrder; expectedVersion/beforeVersion/afterVersion int; payloadHash char64; reason varchar4000 nonblank; scope nullable enum ORDER, ITEM or QUANTITY; pieceIds UUID[] sorted distinct; beforeFacts/afterFacts/outcome JSONB validated against contract; occurredAt timestamptz6. Unique `(commandId,orderId)` and `(orderId,afterVersion)`. |
| `AdministrationCancelledPiece` / `administration_cancelled_pieces`   | commandId/orderId/pieceId UUID; PK `(commandId,pieceId)`; unique pieceId (one actual cancellation ever); compound FKs `(commandId,orderId)` to admin command and `(pieceId,orderId)` to physical piece. beforeFacts/afterFacts JSONB exact physical facts; no duplicated quantity/price.                                                                                                                                                                                                                                                                                     |
| `AdministrationOrderCorrection` / `administration_order_corrections` | commandId UUID PK; orderId UUID; afterVersion int; compound command/order FK; full effective customerName varchar150, customerPhone varchar13, customerEmail nullable varchar320, customerAddress nullable varchar2000; beforeValues/afterValues JSONB complete five-field correction snapshots (including generalNotes); changedFields text[] sorted unique; unique `(orderId,afterVersion)`; FK to order. Append-only.                                                                                                                                                     |

New indexes: `administration_commands_order_time_id_idx(order_id,occurred_at DESC,
command_id DESC)`, `administration_commands_actor_time_id_idx(actor_id,occurred_at
DESC,command_id DESC)`, `administration_order_corrections_order_version_idx(order_id,
after_version DESC,command_id DESC)`. Existing piece-stage/root-created/owner indexes
support cohort queries; add `sales_drafts_created_id_idx(created_at DESC,id DESC)`
for admin/report creation-date ordering and
`sales_drafts_owner_created_id_idx(owner_id,created_at DESC,id DESC)` for owner/date.
Do not add speculative per-label trigram indexes/dependencies. Parameterized escaped
literal search is correct first; later performance evidence can justify an index.

### Current versus original values

Preserve `SalesOrder.customerName/Phone/Email/Address` as original submission contact
snapshot. Current contact is the latest AdministrationOrderCorrection by afterVersion
or those original columns if none. A correction row always captures all effective
contact values, so an omitted field cannot revert a preceding correction. No separate
mutable overlay/cache table or retention/deletion policy is needed.

`SalesDraft.generalNotes` is already the current editable order-level notes field in
returned resubmission. An accepted admin note correction writes that current field
with its exact before/after witness in the same transaction. Later legitimate returned
sales edits use this current value, so a historical admin overlay cannot mask a newer
legitimate note change. Original notes remain in the first SUBMIT_NEW_ORDER/SUBMIT_DRAFT
sales-command after snapshot. New correction snapshots retain every prior/current
note, contact and reason. Do not rewrite historical command JSON or customer master.

Extend current `SALES_ORDER_SELECT` with latest correction contact fields (nested
take1, afterVersion DESC,commandId DESC); extend its inferred record type rather than
cast. Proposed pure `effectiveOrderContact` in
`apps/api/src/modules/sales-orders/order-contact.projection.ts` accepts original
contact and a nullable complete latest-contact value, returning that allowlisted
four-field object. `mapSalesOrder` and `mapSalesOrderSummary` use it for current
projection; retained command/revision readers keep their stored snapshots unchanged.
`mapFactoryOrder` may use the effective name already permitted there, never expose
phone/email/address/finance. Warehouse current delivery summaries/details use only
effective name/phone/address under P07's existing minimal contact policy. Update SQL
search/summary projections consistently with a latest-correction lateral join rather
than independently making frontend overrides.

Current queue producers are part of this same T014 projection boundary:
`manufacturing.queries.ts` queueSource/filteredQueue/loadQueuePapers and
`quality.queries.ts` qualityQueueSource/qualitySearchSql/loadQualityHeaders.
Their current list/piece/dashboard headers use the bounded selected latest name,
and their search predicates use a lateral latest customer_name lookup ordered by
after_version DESC,command_id DESC LIMIT 1 with fallback to original h.customer_name.
Apply the same predicate before current count/page queries; do not overlay historical
event builders. Factory selects only the permitted latest name; warehouse selects only
name/phone/address, and full sales/approval contact projection uses effectiveOrderContact.
Sales list/status counters and approval pending/issue searches use one parameterized
current-contact cohort per owner before count/page, preserving owner/department/type/
customer/state filters, literal wildcard escaping, retained physical count semantics,
and updatedAt/id or reportedAt/id tie-breakers. Return only bounded page IDs for
Prisma record mapping and validate aggregate numeric capacity; do not materialize
unbounded matching IDs or filter after pagination. Existing current notes stay on
the root. Admin-only latest reason/actor/time/changedFields are emitted later by B04/T020,
not by these ordinary or factory projections; their proposed root select is T015.
T014's real cross-role tests cover current fields, null clearing, two current department
queue searches, current approval pending/issue search and unchanged original snapshots.

## D02 — Invariants and exact forward-compatibility changes

### New retained administrative graph

New named checks/triggers:

- `ck_administration_command_shape`: ADMIN actor, positive versions below max-int,
  after=before+1=expected+1, nonblank reason, hex hash, strict JSON objects, command
  operation agrees with scope/piece IDs/correction child. ADMIN_CORRECT has no scope
  and empty pieceIds; ADMIN_CANCEL has 1–200 sorted unique IDs; ITEM exactly one.
- `ck_administration_correction_values`: valid required name/canonical Saudi phone,
  optional field lengths/no NUL, nonempty changedFields subset of the five allowed
  fields, complete strict before/after snapshots and at least one effective change.
- `ck_administration_piece_binding`: cancellation child before/after facts bind the
  same physical identity/order and parent selected IDs; after CANCELLED/BLOCKED,
  issue/current visit null, cancellation time/reason equal parent; receivedAt unchanged.
- `ck_administration_command_graph`: exact selected child set, true persisted current
  counts/money/status/effective contacts, unchanged paid/frozen fields/companions,
  parent afterVersion current root at insertion, full required side-effect witnesses.
- `ck_administration_retained`: reject UPDATE/DELETE of commands/correction/cancelled
  child facts. Historical facts cannot be rewritten after later domain operations.

`check_p08_administration_command(uuid)` validates a newly inserted command's
relational shape/selected children/recorded before-after transition and current head
at that insertion transaction's commit. Deferred `enforce_p08_administration_graph()`
runs on INSERT of administration_commands and its correction/cancellation children.
The root/piece deferred paths resolve only a command whose afterVersion equals the
current root version and whose selected OLD/NEW facts match this actual transition;
they do not iterate older commands or compare historical afterFacts with later state.
Once inserted, old facts remain immutable and replayable even after new operations;
history is validated against its own recorded child graph, not today's root head.
`enforce_p08_administration_retained()` rejects changes to the three new tables.
No trigger is disabled and no session-variable bypass is trusted as authority.

Add deferred `p08_order_note_witness` on submitted SalesDraft generalNotes changes,
using new `ck_administration_order_note_witness`. At commit resolve the current root
head and require one exact next-version ADMIN_CORRECT or existing RESUBMIT_ORDER
witness whose recorded before/after notes equal this OLD/NEW note transition;
expected/beforeVersion=OLD.version, afterVersion=currentRoot.version=OLD.version+1.
Read current root version at deferred execution, because the mechanical note update
and existing advanceApprovalOrderVersion call are separate statements in one tx.
Unchanged-note version increments skip this note-specific trigger. Direct SQL note
rewrites with no next-version witness fail; old historical receipts cannot authorize
a new note change. Original sales resubmission remains valid under its real source.

### Current root, returned proof and first approval

The current P07 definition of `enforce_p05_root_head()` accepts sales/approval/
manufacturing/quality/warehouse witnesses only. Extend its UNION with
administration_commands matching `(orderId,afterVersion)` while preserving the
exactly-one-next-version condition and every existing branch.

`check_sales_order_graph(uuid)` currently requires a RETURNED header's
current_return_order_version=current root.version. Keep that property. On an admin
correction or partial cancellation of RETURNED, advance only this current applicability
version to afterVersion; preserve original decision ID/reason/time. The original
RETURN_INITIAL command remains immutable. Modify `check_approval_order_graph(uuid)`
and `enforce_p04_initial_transition_witness()` (trigger
`p04_return_decision_binding`) to accept either the original decision at its own
version or a gap-free chain of later admin commands that each preserve RETURNED and
the same return proof, terminating at current version. Chain versions must be
contiguous, operation ADMIN_CORRECT/ADMIN_CANCEL, count exactly currentVersion minus
decision.afterVersion, with no ordinary sales/approval step hidden between them.
`readCurrentOrderReturnProof`/`mapCurrentOrderReturnProof` keep checking current
applicability version; no fake new return or automatic sales resubmission occurs.
Full cancellation clears current return fields because state becomes CANCELLED,
while original return command/history remains.

Preapproval admin cancellation is compatible with submitted-order scope. Update
`assertInitialDecisionState`/`ApprovalService.executeInitial`: validate all retained
pieces, require at least one active piece, validate active pieces are awaiting/incoming,
retain already cancelled rows, and release/open work visits only for active IDs.
`mapApprovalFacts` still records all retained pieces for initial decisions; graph
validation requires active pieces at CUTTING and cancelled pieces unchanged instead
of requiring every retained row at CUTTING. Returned `SalesOrdersService.resubmit`
keeps exact original piece membership/order; cancelled rows remain read-only and
unchanged, only active rows may receive the existing allowed corrections. Frozen
prices, original contacts, type/number and cancelled state remain unchanged.
Extend `check_approval_order_graph`, `enforce_p04_command_head` initial branches and
`enforce_p05_piece_transition` only for these witnessed active/cancelled distinctions.
No cancelled piece is reapproved/released or removed from captured membership.

### Cancellation lifecycle sources

Existing `ApprovalService.cancelIssuePiece` is private, requires a held manufacturing
issue and uses an approval command ID. It cannot be called with a made-up approval
ID for admin cancellation. Extract shared mechanics to proposed
`apps/api/src/modules/approval/order-cancellation.writer.ts` with an explicit source
union `{kind:'approval',commandId}|{kind:'administration',commandId}`. Existing P04
authorization/held-issue prechecks remain at their service; P08's broader eligible
state checks remain at its service. Shared writer cancels exact validated physical
IDs, ends current work/corrections, resolves held issues and preserves paid/receipt/
history. The calling service calculates remaining total/status with existing pure
money/status helpers; the shared mechanical writer does not own those policies.

Add nullable FK source columns to existing models:

- ManufacturingWorkVisit.endAdministrationCommandId;
- QualityWorkVisit.endAdministrationCommandId;
- QualityCorrectionCycle.resolutionAdministrationCommandId;
- ManufacturingIssue.resolutionAdministrationCommandId.

Adding a terminal source also requires its current safe read projection. Extend
`apps/api/src/modules/manufacturing/manufacturing.mapper.ts`
`MANUFACTURING_VISIT_SELECT` with endAdministrationCommandId and
`endAdministrationCommand:{select:WORK_ACTOR_SELECT}`. Existing WORK_ACTOR_SELECT
contains exactly actorId/actorFullName/actorRole/actorDepartment and is structurally
valid for the new retained command. In the existing private `mapVisit`, resolve
endedBy from the single nonnull terminal command among endManufacturingCommand,
endApprovalCommand and endAdministrationCommand. Exact-one-source SQL guarantees
that choice; missing/multiple source or invalid actor remains an internal defect,
never a guessed starter/current-directory actor. Preserve startedBy, receivedBy,
origin, sequence and every original timestamp. The existing manufacturing visit
contract already admits CANCELLED and ADMIN; retain its endedAt/endedBy/endReason
parity refinements rather than widening/nulling them. `loadManufacturingPieceContexts`
selects latest retained visits and `findManufacturingOrder` maps every retained
piece, including cancelled pieces, so this update is required before command
acceptance, not only a new admin-history presentation concern.

Add `QualityVisitEndReason.CANCELLED` to its mapped PostgreSQL enum
`quality_visit_end` through a separate enum migration first. Extend
existing `cancelManufacturingVisit`/`cancelQualityCorrection` to accept the explicit
source union; retain old approval call compatibility through discriminated callers.
An admin cancel can end active QUALITY inspection, so close its QualityWorkVisit with
CANCELLED and admin source; the current helper's prohibition on any open quality
visit remains for its ordinary P04 held-issue path. Close an OPEN correction cycle
as CANCELLED with real source/time; resolve current held issue without accepting its
pending proposal. Clear current issue/work-visit pointers, preserve proposal/report/
inspection/packing history and every original actor/start time.

Producer/consumer enum compatibility is required, not only a database enum change:
existing `packages/contracts/src/quality/quality.schema.ts` `qualityWorkVisitSchema`
has an inline endReason enum of INSPECT_ACCEPTED/INSPECT_REJECTED/ISSUE_REPORTED.
Add CANCELLED there with the same chronological/end-witness refinements; its
qualityActor already permits ADMIN. Extend existing
`apps/api/src/modules/quality/quality.mapper.ts` `QUALITY_VISIT_SELECT` to select
endAdministrationCommand with the safe actor-only selection, and `mapQualityVisit`
endedBy to use that real command when cancellation source is administration.
Preserve actual earlier startedBy/start/origin values. Do not cast CANCELLED through
the old schema or mislabel it as inspection rejection/issue reporting. Existing
`apps/web/src/features/manufacturing/model/quality-view.model.ts` already labels a
cancelled physical piece as history-only; retain that behavior and permit the parsed
visit enum. No current frontend switch renders the three old end reasons, so no
invented new panel is needed. Extend `packages/contracts/src/quality/quality.schema.test.ts`,
`apps/api/src/modules/quality/quality-work.lifecycle.test.ts`,
`apps/api/src/modules/quality/quality-command-executor.integration.test.ts` and
`apps/web/src/features/manufacturing/model/quality-view.model.test.ts` with real
admin-cancelled visit/actor and no-action history cases.

Proposed `apps/api/src/modules/manufacturing/manufacturing.mapper.test.ts` first
covers typed selected-record terminal-actor mapping without claiming database
evidence. After the administration executor exists, its integration test and existing
`apps/api/src/modules/manufacturing/manufacturing.queries.integration.test.ts` /
`apps/api/src/modules/manufacturing/manufacturing.http.integration.test.ts` prove
both CUTTING and PRODUCTION:
receive/start (and colleague continuation), execute real administration cancellation,
then read actual manufacturing detail/history through its owning service/HTTP entry.
The latest ended visit retains real admin endedBy, original startedBy/origin/time,
CANCELLED end reason and no restored action. No fake ApprovalCommand or null actor
may make the schema pass. Source closure and read projection use the same real
PostgreSQL fixture and new guards; the earlier mapper task does not import a future
executor. Preserve the existing approval-cancellation integration regression too.

Extend existing `ck_manufacturing_visit_times`, `ck_quality_visit_shape`,
`ck_quality_correction_shape` and `ck_manufacturing_issues_state` so
each terminal event has exactly one appropriate approval/admin/quality source;
noncancellation branches require admin source null. Update source-binding trigger
functions `enforce_manufacturing_issue_transition`,
`enforce_p04_issue_transition_witness`, `check_approval_order_graph`,
`check_p05_manufacturing_order_graph`, `enforce_p05_manufacturing_retained`,
`enforce_p06_quality_retained`/`enforce_p06_quality_graph` to bind the new source only
to its exact selected piece/order/time/afterVersion. Include
`check_p06_quality_order_graph` for quality visit/cycle source validation. Preserve
every existing source branch and no-mutation rule. These identifiers were read from
authored P04/P05/P06 migration SQL; B09 records the source owners to reopen for drift.

In `enforce_manufacturing_issue_transition`, an ADMIN_CANCEL witness also permits
SALES_CONTACT→RESOLVED (the current normal graph requires SALES_CONTACT→REAPPROVAL),
without changing latest proposal/resume target/source fields. This extra terminal
branch requires a real selected admin cancellation child and matching resolvedAt;
ordinary approval/sales callers retain their existing transitions. Unresolved issues
require both resolution source columns null; resolved issues require exactly one
approval/admin source. Contact proposals stay retained and unaccepted.

### Receipt and failed-delivery compatibility

`ck_sales_order_piece_receipt` already allows receivedAt on CANCELLED. Keep original
receivedAt and WarehouseReceiptPiece immutable; active received count excludes
CANCELLED, so cancellation adjusts the active denominator once without erasing receipt.
`enforce_p05_piece_transition` must admit exactly witnessed admin physical transitions
from any active eligible preapproval/manufacturing/warehouse state to CANCELLED,
with before/after facts equal actual OLD/NEW and no price/contact/receipt rewrite.

Current `check_p07_warehouse_order_state(uuid)` requires latest attempt membership
equal current active membership and derives current status from that attempt. Extend
only for admin-cancelled historical members after an actual FAILED outcome with
returned_to_warehouse=true. Historical attempt membership remains its complete
original dispatched set; current active subset is its members minus pieces with
later retained exact admin cancellation. No admin cancellation of a current
OUT_FOR_DELIVERY or DELIVERED order is allowed. Under partial failed-return
cancellation, keep DELIVERY_FAILED until ordinary explicit retry; under full
cancellation set CANCELLED/non-deliverable and preserve original outcome/attempt.
After a previous explicit retry, keep READY_FOR_DELIVERY if a positive fully received
active set remains; no new retry record is invented.

Forward-replace `enforce_p07_order_transition()` with a narrowly witnessed
ADMIN_CANCEL branch for existing current statuses → derived allowed state. Extend
`enforce_p07_root_current_state()` to validate admin heads. In
`check_p07_warehouse_command(uuid)` only the new RETRY_DELIVERY path may match
remaining-active members of the original failed attempt, with every omitted member
proved cancelled by a later retained admin command; retain all original past command
facts. The next DISPATCH must create a fresh attempt with the complete then-current
active set and its predecessor retry reference. No partial customer delivery is added.

Update `warehouse.rules.ts` `deliveryActions`/`assertWarehouseSelection`,
`warehouse.queries.ts` `warehouseRootsSql`, queue predicates,
`lockWarehouseOrders`, and the existing executor retry/dispatch plan so they use the
same remaining-active intersection. Existing failed attempt outcome/history renders
original attempted pieces; current ready/dispatch selection shows only active pieces.
Do not reconstruct historical attempt membership from today's active set.

The pre-P08 `packages/contracts/src/warehouse/warehouse.schema.ts`
`warehouseOrderDataSchema` required currentAttempt membership to equal the
active set and rejected CANCELLED detail with an attempt. The P08 amendment changes that existing
refinement without changing wire fields or `warehouseAttemptSchema`: preserve exact
active equality for DISPATCHED/DELIVERED attempts. For a real FAILED/returned outcome
under DELIVERY_FAILED, retried READY_FOR_DELIVERY, or fully CANCELLED, require every
active ID in the original attempt, every original attempt ID in the retained paper,
and every extra attempt ID to identify a CANCELLED paper piece with retained receivedAt
and cancelledAt at or after the failure's recordedAt. Keep all other paper/work/receipt/
packing/count/action/identity checks. CANCELLED requires zero active pieces and all
four delivery actions false; retain any original retry/outcome as history. Current
summary retryDate remains READY-only through its existing mapper guard. Server/SQL
source/version checks still prove each omitted member's exact later ADMIN_CANCEL;
the safe contract checks only the available allowed facts and exposes no admin audit.
Extend existing warehouse.schema.test.ts with partial failed/retried/full-cancel
success plus foreign, omitted-active, noncancelled, missing receipt, earlier cancellation
and dispatched/delivered mismatch denials. T013 owns this coordinated contract change
and its real warehouse detail/read/write regressions.

## D03 — Migration, existing data and recovery

Proposed forward files, after all currently checked-in migrations:

1. `packages/database/prisma/migrations/20261115000100_p08_admin_enums/migration.sql`:
   add quality_visit_end CANCELLED separately so following transactional SQL can use
   it; create new administration enums. No existing enum value is removed/renamed.
2. `packages/database/prisma/migrations/20261115000200_p08_administration/migration.sql`: additive tables/indexes/FKs,
   nullable lifecycle source columns, amended checks and exact existing function
   definitions with narrow extra admin witnesses; new retained/deferred graph guards.
3. `packages/database/prisma/migrations/20261116000100_p08_restore_safe_function_paths/migration.sql`: forward-only configuration of the three
   immutable P08 CHECK helper functions (p08_has_exact_keys(jsonb,text[]),
   p08_valid_correction(jsonb), p08_valid_facts(jsonb)) with fixed
   `search_path=pg_catalog,public,pg_temp`. A real custom-archive restore reproduced
   missing p08_has_exact_keys while pg_restore runs with an empty search path.
   Keep all function bodies, validation semantics, roles/grants and previous SQL
   checksums unchanged; configuration must travel in the archive and restore all
   nested helper lookups safely. No restore-side search-path override or disabled
   CHECK/trigger substitutes for this fix. Fresh deploy, current-row rejection and
   real archive/restore/restart evidence must include this migration.

No original data backfill, default staff/role changes, invented cancellation,
correction, receipt, report or actor is necessary. New source columns are null for
every existing row. New correction tables are empty; effective contacts fall back
to original snapshot. Historical commands stay byte-identical. Existing current
warehouse membership is already valid and unchanged. Migration must preflight old
constraints/graphs and fail if inconsistent; do not repair unrelated facts by inference.

Apply only to owned disposable targets during implementation tests; production
application is OPS-01/environment-authorized release work. Preserve Prisma migration
history/checksums; generate Prisma output with actual package scripts. Deployment
must coordinate contracts/API/web because admin activity unions/effective projections
and new source columns are introduced together. An old API cannot safely resume
after new admin commands have been written; recovery is forward-compatible deploy
or an authorized restore of the matching backup into an isolated verified target,
not deleting history or rolling SQL backward. Test both empty fresh migration and
upgrade from a populated migrated P01–P07 graph before acceptance.

## D04 — Required data evidence

Later actual PostgreSQL tests must prove:

- Direct SQL cannot forge an admin actor/version/head/source, mismatched selection,
  receipt rewrite, unrelated price/paid change, silent issue release, no-change
  correction or mutable historical command. Assert exact SQLSTATE/constraint names.
- Two 650.00 pieces/paid1000.00: cancel one gives total650.00/due0/surplus350.00;
  received cancelled piece retains receipt but no longer active/received-active.
- Partial/full cancellation before approval and while RETURNED; correction on
  RETURNED; normal resubmission/approval still works only for remaining active pieces,
  no reactivation, return reason/history/first-submission snapshots intact.
- Manufacturing started/colleague-continued piece, active QUALITY visit/open cycle,
  held issue/proposal, warehouse incoming, warehouse received, failed physical return,
  retried-ready cancellation; correctly close only required live work with real source.
- Failed attempt `[P1,P2]`, cancel P1, keep DELIVERY_FAILED, retry `[P2]`, new dispatch
  `[P2]`; original failed attempt/history remains `[P1,P2]`. Deny current dispatched/
  delivered cancellation, stale mixed selection and unknown foreign ID without effects.
- Independent connections race cancellation/dispatch, cancellation/paid, correction/
  returned resubmit, cancellation/quality and authority change; one serial outcome.
  Induced required-audit/child/visit save failure rolls back every earlier changed row.
- Fresh/populated upgrade retains known old records and migration checksums; applying
  new empty columns/tables never silently approves/accounts/imports/deletes records.

These are design obligations, not executed results. Exact test owners and allowed
commands are recorded in the main plan and later TASKS briefs; no test/database work
is authorized by this file's creation.
