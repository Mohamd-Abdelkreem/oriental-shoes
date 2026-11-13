# P06 data and integrity design

All new models, columns, constraints, functions and migration names below are
**proposed**, not current schema or executed migrations. [The spec](spec.md) owns
product rules; [backend design](backend-design.md) owns algorithms and
[contracts](contracts/quality.md) owns wire types. Preserve all existing migration
bytes; implement only through a new reviewed forward migration.

## M01. Existing authority and physical state

Reuse `SalesDraft` as the order root/version/row-lock owner, `SalesOrder` as approved
submitted header/frozen commercial terms, and `SalesOrderPiece` as each physical
piece. No quality quantity, segment, carton-stock or alternative order model.

Existing fields remain authoritative:

| Existing field / owner                                 | P06 rule                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SalesOrderPiece.stage/workState`                      | Incoming QUALITY → in-progress QUALITY → WAREHOUSE/INCOMING acceptance or CUTTING/PRODUCTION INCOMING rejection. P04 report leaves QUALITY/BLOCKED.                 |
| `receivedAt`                                           | Explicit later physical warehouse receipt only. Every P06 quality action leaves it null/unchanged.                                                                  |
| `cancelledAt/cancellationReason`                       | Existing P04 cancellation authority; P06 cannot reactivate or rewrite.                                                                                              |
| `issueId`                                              | Current unresolved P04 issue; reuse existing one-open-issue and issue/command graph.                                                                                |
| `currentWorkVisitId`                                   | Existing manufacturing pointer for CUTTING/PRODUCTION only; must stay null in all current quality work.                                                             |
| `SalesDraft.version`                                   | +1 per quality receive/start, continue or inspection per affected order. Report batch steps +1 per actual P04 issue child, parent records the complete v→v+n range. |
| Frozen specifications/prices/contacts and paid history | Untouched by quality. Factory outputs project accepted manufacturing fields only.                                                                                   |

Quality visits are a separate table keyed to stable piece/order. Current QUALITY
INCOMING may have no quality visit; QUALITY IN_PROGRESS requires exactly one open
quality visit. Do not alter P05's manufacturing-department enum or pointer semantics.

## M02. Proposed schema ledger

Every UUID uses `@db.Uuid`, instant `@db.Timestamptz(6)`, text limits noted below;
server timestamps/actors come from authenticated command execution. Prisma owns
declared models/indexes; authored SQL owns partial/deferred/check/history constraints.
Composite foreign keys establish piece/order identity, not just globally valid IDs.

Freeze Prisma names and SQL mappings as follows; these are new, not extensions of
P05's department/operation enums:

| Proposed Prisma enum    | `@@map` SQL type       | Exact values                                        |
| ----------------------- | ---------------------- | --------------------------------------------------- |
| `QualityOperation`      | `quality_operation`    | RECEIVE_AND_START, CONTINUE, INSPECT, REPORT_ISSUES |
| `QualityVisitOrigin`    | `quality_visit_origin` | PRODUCTION_ARRIVAL, LEGACY_BASELINE                 |
| `QualityVisitEndReason` | `quality_visit_end`    | INSPECT_ACCEPTED, INSPECT_REJECTED, ISSUE_REPORTED  |
| `QualityDecision`       | `quality_decision`     | ACCEPT, REJECT                                      |
| `QualityCycleState`     | `quality_cycle_state`  | OPEN, ACCEPTED, REJECTED, CANCELLED                 |

### QualityCommand / `quality_commands`

| Column                                                          | Type / invariant                                                                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command_id`                                                    | UUID PK `quality_commands_pkey`; the client parent intent identity.                                                                                                                    |
| `operation`                                                     | New `quality_operation`: RECEIVE_AND_START, CONTINUE, INSPECT, REPORT_ISSUES.                                                                                                          |
| `actor_id`, `actor_full_name`, `actor_role`, `actor_department` | User FK plus action-time snapshot, full name varchar150 nonblank; role ADMIN or captured department QUALITY.                                                                           |
| `payload_hash`                                                  | char64 lowercase SHA-256 of canonical intent, server-only.                                                                                                                             |
| `outcome`                                                       | JSONB validated immutable `QualityCommandOutcome`, finite 1..200 selected pieces, ≤262144 serialized UTF-8 bytes. This is a transport/storage budget, not a new order-capacity policy. |
| `occurred_at`                                                   | Authoritative instant for the complete parent.                                                                                                                                         |

Index `quality_commands_actor_time_idx(actor_id,occurred_at DESC,command_id DESC)`.
All updates/deletes rejected by retained-history trigger.

### QualityCommandOrder / `quality_command_orders`

| Column                            | Type / invariant                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `command_id`, `order_id`          | Composite PK; deferred parent command and SalesOrder FKs.                                                                                        |
| `event_id`                        | UUID unique `quality_command_orders_event_key`, per-order activity identity.                                                                     |
| `before_version`, `after_version` | int, positive bounded. Non-report after=before+1; report after=before+cardinality(piece_ids). Parent graph fixes operation-dependent expression. |
| `piece_ids`                       | UUID[] sorted, unique, nonempty, ≤200; exact selected membership.                                                                                |
| `inspector_note`                  | nullable varchar4000, nonblank when present, original text retained. INSPECT only; no duplicate packing-note owner.                              |

Unique `(order_id,after_version)` within quality group rows
`quality_command_orders_order_version_key`; index `(order_id,event_id)`.
Different domain witness tables are checked together by M05, not assumed unique by
this local index. Every command's total selection across groups is ≤200.

### QualityWorkVisit / `quality_work_visits`

| Column                                            | Type / invariant                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `order_id`, `piece_id`                      | UUID PK and composite FK to physical piece; unique `(id,order_id,piece_id)`.                                                                                                                                                                          |
| `sequence`                                        | int≥1, unique `(piece_id,sequence)`; no skipped accepted visits.                                                                                                                                                                                      |
| `origin_kind`                                     | New `quality_visit_origin`: PRODUCTION_ARRIVAL or LEGACY_BASELINE. The open correction link independently identifies correction return.                                                                                                               |
| `source_production_event_id`                      | nullable composite FK to actual ManufacturingPieceEvent with operation COMPLETE_TRANSFER, PRODUCTION→QUALITY for this same piece/order.                                                                                                               |
| `source_correction_id`                            | nullable same-piece/order FK to the OPEN cycle being reinspected; unchanged original link after cycle closure.                                                                                                                                        |
| `entered_at`                                      | nullable actual source manufacturing command instant; null when unknown, not a fabricated arrival.                                                                                                                                                    |
| `received_at`, `started_at`, `started_command_id` | Real start uses the same authoritative time for receipt/start and actual QualityCommand RECEIVE_AND_START. Legacy baseline may have all null with `legacy_unknown_start=true`. No second received-command owner is needed for combined receive/start. |
| `ended_at`, `end_reason`                          | nullable together. New `quality_visit_end`: INSPECT_ACCEPTED, INSPECT_REJECTED, ISSUE_REPORTED.                                                                                                                                                       |
| `end_quality_event_id`, `end_approval_command_id` | Exactly one appropriate witness when ended; quality inspection event or real P04 report command.                                                                                                                                                      |
| `legacy_unknown_start`                            | false for all runtime-created visits; true only migration-only legacy in-progress baseline.                                                                                                                                                           |

Partial unique `quality_work_visits_one_open_piece_key(piece_id) WHERE ended_at IS
NULL`; order/piece sequence-desc index. Original origin/start fields immutable once
known; ending happens once and becomes immutable. Actor snapshots are read through
retained start/event commands, never a mutable worker field.

Runtime source-arrival may be unknown for an accepted legacy quality incoming row;
such a new started visit uses LEGACY_BASELINE origin with **real** current start and
`legacy_unknown_start=false`. `legacy_unknown_start=true` remains migration-only;
the runtime guard forbids it. Source identity/time stays honest without making old
data invent a production event. A current witnessed transfer always uses
PRODUCTION_ARRIVAL; no caller can supply a synthetic origin.

### QualityPieceEvent / `quality_piece_events`

| Column                                                                 | Type / invariant                                                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                   | UUID PK; unique `(id,order_id,piece_id)` and `(command_id,order_id,piece_id)` for exact membership foreign keys.                          |
| `command_id`, `order_id`, `piece_id`                                   | Deferred FK `(command_id,order_id)`→QualityCommandOrder and composite piece/order FK; unique `(command_id,piece_id)`.                     |
| `visit_id`                                                             | nullable composite QualityWorkVisit FK; null only REPORT_ISSUES from incoming with no visit.                                              |
| `decision`                                                             | nullable enum ACCEPT/REJECT; required exactly for INSPECT.                                                                                |
| `correction_id`                                                        | nullable same-piece/order cycle FK: newly opened cycle for REJECT, resolved/current cycle for ACCEPT/start/continue/report if applicable. |
| `issue_id`, `approval_command_id`                                      | nullable matched P04 issue/child command; required exactly REPORT_ISSUES.                                                                 |
| `before_stage`, `before_work_state`, `after_stage`, `after_work_state` | Existing stable enums; operation graph fixes legal transition, not arbitrary caller input.                                                |

Unique partial `quality_piece_events_one_inspection_key(visit_id) WHERE decision IS
NOT NULL`; indexed `(order_id,piece_id,command_id)` and `(visit_id,id)`. CONTINUE can
append multiple different-actor events; one physical inspection decision per visit.
Event is immutable. Receipt/cancellation facts are not copied as new authority;
operation graph requires unchanged null receipt/cancellation and exact issue rules.

### QualityCorrectionCycle / `quality_correction_cycles`

| Column                                                          | Type / invariant                                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `order_id`, `piece_id`                                    | UUID PK, composite piece/order FK; unique `(id,order_id,piece_id)`.                                                               |
| `cycle`                                                         | positive int; unique `(piece_id,cycle)`, contiguous accepted rejections.                                                          |
| `rejection_event_id`                                            | unique same-piece/order QualityPieceEvent FK with decision REJECT; inspector/time inherited from its immutable parent.            |
| `target`                                                        | Existing Department limited CUTTING/PRODUCTION.                                                                                   |
| `reason`, `instructions`                                        | varchar4000 nonblank; original entered text retained.                                                                             |
| `state`                                                         | New `quality_cycle_state`: OPEN, ACCEPTED, REJECTED, CANCELLED.                                                                   |
| `resolved_at`                                                   | null iff OPEN; otherwise authoritative resolving event/approval instant.                                                          |
| `resolution_quality_event_id`, `resolution_approval_command_id` | Exactly one resolver when closed: ACCEPTED/REJECTED use matching actual reinspection; CANCELLED uses existing P04 CANCEL command. |

Partial unique `quality_correction_cycles_one_open_piece_key(piece_id) WHERE
state='OPEN'`; index `(order_id,piece_id,cycle DESC)` and `(state,order_id,piece_id)`.
Original rejection facts immutable. OPEN may terminalize once, then no changes.
An event rejecting reinspection can resolve cycle k REJECTED and create k+1 OPEN;
links are distinct original-vs-resolution roles. A piece never has two OPEN cycles.
Cancellation at any subsequent department closes the current quality cycle only
through real P04 authority; the original rejected target remains historical truth.

### QualityPackingGroup / `quality_packing_groups`

| Column                           | Type / invariant                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `command_id`, `order_id`   | UUID PK plus deferred QualityCommandOrder FK, unique `(command_id,order_id)` and `(id,command_id,order_id)`. INSPECT only.                  |
| `carton_count`, `carton_numbers` | nullable varchar4000 free text, nonblank when present, original-language/spacing retained; no numeric, uniqueness or generated-carton rule. |

Inspector note is read through the command/order row; a registry's inspectorNote is
a derived projection, not a separately stored packing note. Create a group only if the
inspection has accepted pieces and some nonblank carton text exists; absent
packing stays absent. No updating existing groups. `QualityPackingPiece` /
`quality_packing_pieces` uses PK `(group_id,piece_id)` and the same `command_id,
order_id,piece_id` composite event FK; it must match that event's ACCEPT decision.
Store each physical member once. Carton count is group text, never multiplied by
membership count. The group graph requires membership equal to **all** accepted
events in its command/order and none rejected. Unique `(command_id,piece_id)` prevents
two packing groups for one accepted event. A rejected-only note creates no group.

### QualityApprovalReport / `quality_approval_reports`

| Column                               | Type / invariant                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `command_id`, `order_id`, `piece_id` | Parent REPORT_ISSUES order/member link; PK `(command_id,piece_id)` with composite event FK. |
| `approval_command_id`                | unique UUID FK to the real per-piece P04 REPORT_ISSUE command.                              |
| `ordinal`                            | int1..200, unique `(command_id,order_id,ordinal)`; sorted piece order.                      |

The graph validates `child.expectedVersion = child.beforeVersion = parent.beforeVersion + ordinal - 1`
and `child.afterVersion = parent.beforeVersion + ordinal`, exact actor/time,
piece/issue/source/reason/notes and final parent.afterVersion. The application computes
each child's hash using existing `hashApprovalCommandIntent` before persistence;
SQL preserves its existing hash-format check and exact semantic bindings. Do not
claim PostgreSQL recomputes JavaScript's canonical serialized intent hash or add a
crypto extension to make that claim.
No child can belong to two parents or cover a different piece. Every selected parent
member has exactly one child and every linked child has exactly one matching event.
Parent outcome may expose child issue IDs, not server private facts/hash.

Prisma relation names used by B02 are fixed: `QualityCommandOrder.command`,
`QualityCommandOrder.events`, `QualityPieceEvent.commandOrder`,
`QualityWorkVisit.startedCommand`, `.endQualityEvent`, `.endApprovalCommand`,
`.sourceProductionEvent`, `.sourceCorrection`, `QualityCorrectionCycle.rejectionEvent`,
`.resolutionQualityEvent`, `.resolutionApprovalCommand`,
`QualityPackingGroup.commandOrder` / `.pieces`, and `QualityPackingPiece.event`.
The event's parent actor path is `event.commandOrder.command`; do not invent a direct
`event.command` relation/FK absent from this ledger just to fit a mapper expression.

## M03. Foreign keys, history and deferred graph

Use named FKs, ON DELETE RESTRICT / ON UPDATE NO ACTION. Make cyclic source/event/
correction/group/command FKs `DEFERRABLE INITIALLY DEFERRED`, mirroring P04/P05:
required records may be inserted in algorithm order but must all exist together at
commit. Do not disable triggers or constraints in runtime/test writers.

New named checks/functions:

| Proposed owner                                      | Complete enforcement purpose                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ck_quality_command_shape`                          | QUALITY/ADMIN actor snapshot, hash/operation/outcome shape and finite bytes/membership.                                                                                                                                                                                                                                       |
| `ck_quality_command_order_shape`                    | Bounded versions/member arrays, no null/duplicate IDs, supported optional text; actual +1/+n checked with parent operation.                                                                                                                                                                                                   |
| `ck_quality_visit_shape` / `ck_quality_visit_times` | Origin/source completeness, real/legacy known-start consistency, chronological actual instants, correct exclusive endpoint witness.                                                                                                                                                                                           |
| `ck_quality_correction_shape`                       | Target/text/cycle/current-vs-terminal resolver and time consistency.                                                                                                                                                                                                                                                          |
| `ck_quality_packing_shape`                          | Nonblank optional free text, appropriate accepted group and immutable membership.                                                                                                                                                                                                                                             |
| `check_p06_quality_command(command_key uuid)`       | Reconstruct exact sorted parent outcome from order/events; ≤200 total identities, exact operation/actor/notes/packing/children/+1 or +n; all event and visit/cycle source bindings. Compare JSONB outcomes exactly, without comparing historical outcomes to later mutable piece state.                                       |
| `check_p06_quality_order_graph(order_key uuid)`     | Current quality in-progress ↔ exactly one open quality visit; no open visit elsewhere/held/cancelled/received; no manufacturing pointer on quality; one current cycle, correct piece/source/targets, valid original/resolver history and packing/child links. Closed histories are not required to equal later current state. |
| `enforce_p06_quality_head()`                        | For **new** parent order rows only, final root version/status and exact final selected physical state/visit/cycle/packing/child chain agree with accepted outcome. Old parent receipts survive later workflow.                                                                                                                |
| `enforce_p06_quality_retained()`                    | Reject deletes of all new audit rows and updates to commands/order events/piece events/packing/child links. Allow only one legitimate visit endpoint or OPEN-cycle resolution while retaining original facts.                                                                                                                 |
| `enforce_p06_new_quality_visit()`                   | Runtime start witness/source exactness and prohibition of migration-only unknown-start rows after upgrade.                                                                                                                                                                                                                    |

Attach deferred graph triggers to new tables plus physical-piece/root changes and
existing approval/issue/manufacturing-transfer changes that can affect quality work.
Trigger wrappers pass actual affected order/command keys. Do not check one deferred
row snapshot against unrelated later history; use final graph plus the row's exact
accepted witness. Newly inserted event head checks occur in that transaction, while
retained-origin checks remain valid forever.

Legacy production-arrival source must be actual PRODUCTION COMPLETE_TRANSFER and
the same piece/order; QualityWorkVisit.enteredAt equals that manufacturing command's
occurredAt. Start must occur at or after known arrival and ending at or after known
start. P06 rejection links a manufacturing QUALITY_CORRECTION visit whose
source_reference_id equals the exact new cycle ID, source_correction_cycle equals
cycle, target/instructions/enteredAt equal rejection facts and source_order_version
equals parent.afterVersion. Do not add a blanket FK from every historical P05
source_reference_id to the new cycle table; prior isolated seam fixtures remain
valid unlinked evidence. Positive P06 links are strictly checked.

### Historical projection bindings

No new stored event or table is required for canonical historical cycle links.
`QualityCorrectionCycle.rejectionEventId` proves the OPENED event; its
`resolutionQualityEventId` proves ACCEPTED/REJECTED; a started quality visit's
`sourceCorrectionId` plus `startedCommandId` proves REINSPECTION_STARTED. Preserve
original cycle number/id/target/reason/instructions and original action actor/time.
Failed reinspection has two distinct links (old k resolved REJECTED, new k+1 OPENED)
for that same physical piece. A terminal cycle never mutates an old opening event.
`resolutionApprovalCommandId` with CANCELLED state proves a safe P04 cancellation
history link even when that later issue's source department is CUTTING/PRODUCTION.
The history DTO is an allowlisted projection of these existing retained bindings;
no temporal guess or currentCorrection-only lookup can replace them.

## M04. Canonical write predicates and version rules

All runtime quality writers hold actor FOR SHARE and all affected roots FOR UPDATE
in sorted order, then validate the entire selection. Writes use conditional
`updateMany` with affected-row count exactly1; no unchecked Prisma update from a
browser role/piece ID.

| Action            | Physical predicate                                                                                                      | Changed columns / version witness                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RECEIVE_AND_START | order/piece exact; QUALITY/INCOMING; issue,received,cancelled,reason,manufacturing pointer null; no open quality visit. | workState IN_PROGRESS only; quality visit/event; root +1 once; quality parent sole witness.                                                                                                                      |
| CONTINUE          | QUALITY/IN_PROGRESS and same eligibility, matching open quality visit, different latest actual worker.                  | No physical state rewrite; event and root +1; quality parent witness.                                                                                                                                            |
| INSPECT ACCEPT    | Same current inspection predicate and unended visit.                                                                    | stage WAREHOUSE/workState INCOMING; event/visit end/optional cycle close/packing; root +1 once; parent sole witness.                                                                                             |
| INSPECT REJECT    | Same current inspection predicate.                                                                                      | Existing `openQualityCorrectionVisit` performs target INCOMING plus manufacturing pointer; event/new cycle/quality visit end; root +1 once; parent sole witness with linked legacy correction fallback excluded. |
| REPORT_ISSUES     | QUALITY INCOMING or IN_PROGRESS; no existing issue/receipt/cancel; correct visit shape.                                 | P04 issue/hold + visit interruption; each child conditional root +1; parent records v→v+n without another update or root witness.                                                                                |

Never include receivedAt, submitted terms, paid values or cancellation changes in a
quality data object. Deferred checks reject forged direct writes without exact
witnesses, not just malformed API inputs. Original actors/times/name snapshots,
cycles/groups/events and frozen terms remain retained on staff lifecycle changes.

## M05. Forward P04/P05 witness compatibility changes

The new migration **CREATE OR REPLACE**s the following existing functions with
preserved original branches and narrow additions; do not edit old migration SQL,
drop the guard triggers, disable constraints or allow arbitrary multiple witnesses.

### `enforce_p05_root_head`

Keep `NEW.version=OLD.version+1` for each submitted-root UPDATE event. Count the
existing sales/approval/manufacturing witnesses at NEW.version, plus one
QualityCommandOrder where parent.operation != REPORT_ISSUES and its afterVersion
equals NEW.version. Parent REPORT_ISSUES never counts as an extra witness.

For the old QUALITY_CORRECTION visit fallback, include only origins **not positively
linked** to a valid canonical P06 rejection. Positive link requires matching new
cycle ID/order/piece/cycle, rejection event/parent INSPECT, event REJECT and target,
instructions/occurredAt/sourceOrderVersion equal the visit and group afterVersion.
Group remaining legacy fallback exactly as before by source_reference_id/version.
This preserves unlinked P05 seam fixtures. It excludes neither a malformed partial
link nor an arbitrary visit simply because some quality parent exists in that order.

All normal quality commands then have exactly one parent witness even for multiple
rejected pieces or mixed accept/reject. Every report child +1 UPDATE has exactly one
existing approval witness at its own queued NEW.version, with no parent duplication.

### `enforce_p05_piece_transition`

Preserve all original manufacturing/approval/legacy-quality branches. Add a strict
P06 event branch: exact order/piece, parent.afterVersion equals final root.version,
parent not REPORT_ISSUES, old/new stage/workState equal event before/after, original
issue/receipt/cancellation unchanged and null. Operation-specific visit/cycle/state
graph must pass. A quality parent alone cannot witness arbitrary state.

For REPORT_ISSUES add a separate exact linked-child branch: child.operation
REPORT_ISSUE; QualityApprovalReport matches parent/order/piece/ordinal; parent group
afterVersion equals final root.version and child version fits the contiguous chain;
child beforeFacts/afterFacts match this row's complete physical old/new tuple using
the same original P04 comparison. It witnesses only that child's held piece, not
all pieces in the parent. Keep current manufacturing-pointer graph enforcement.

### `enforce_p04_command_head`

Retain every existing outcome/facts/money/count/state/identity validation. Replace
only the required equality `root.version=NEW.after_version` with: equality normally;
or a validated REPORT_ISSUE child with unique QualityApprovalReport link, parent
REPORT_ISSUES group ending at root.version, exact ordinal/version interval and the
whole parent graph valid. This is not `root.version>=child.after_version` in general.

Every child still has expectedVersion=beforeVersion and after=before+1, one affected
piece, one actual issue/report actor/time and unchanged counts/money; afterFacts for
its own piece still equal final state (distinct pieces, no later same-batch mutation).
Existing direct P04 commands get no relaxation and still require final head equality.

The parent/report graph requires selected n children exactly with ordinals1..n,
versions v+1..v+n, one per exact distinct piece, same parent actor/time/common report
text and no unrelated child. Parent operation/body/outcome remains replay-bound.
Call this graph checker from its own deferred triggers, not just as an optional
head precheck. Sparse chains, duplicate/missing children, foreign links, wrong final
root or mixed other-domain witness at any intermediate version fail commit.

Do not modify `enforce_p05_new_visit`: a new correction manufacturing visit still
uses sourceOrderVersion equal to final root.version, exactly parent INSPECT +1.
REPORT_ISSUES creates no manufacturing visit. Existing P05 command-head guard also
remains unchanged; P06 starts only after the prior production transfer committed.

### M05a. Set-based validation correction for maximum reporting

This is an execution-strategy correction, with unchanged tables, fields, keys,
constraints, trigger registrations and accepted graphs. It applies only to these
function bodies in the new P06 migration; existing migration files remain intact.

1. Forward-replace `check_p05_manufacturing_order_graph(affected_order uuid)`.
   Preserve its initial current-pointer, open-visit, contiguous-sequence and duplicate
   source checks and its final per-command check loop. Replace its per-visit PL/pgSQL
   queries with set-based EXISTS predicates joining each visit to its exact approval
   source, transfer event/command, received command, manufacturing end and approval
   end. Preserve every original same-order/piece/time/operation/department/decision/
   instructions predicate and the original named error for origin versus time
   failures. For INITIAL_APPROVAL flatten each distinct source command's afterFacts
   pieces once in a MATERIALIZED CTE, then join the exact physical ID with CUTTING /
   INCOMING proof; do not expand that complete JSON array once per visit. No legacy
   quality-origin admission or P05 enum/pointer behavior changes.
2. In `check_p06_quality_command(command_key uuid)`, preserve outer command/order
   budgets, exact sorted IDs, packing membership, per-order delta and exact immutable
   outcome equivalence under step 5. Replace the inner per-piece PL/pgSQL read loop by
   bounded joined sets: events plus same-order/piece visit, report link, actual child
   and actual issue. Derive report ordinal with row_number ordered by piece_id within
   this order. Keep every B04/B05/B06 event/visit/time/continuation predicate and
   B07 exact source/child/actor/text/version-chain predicate. Validate common reason/
   notes over the whole selected parent, including null distinctions. Preserve
   incoming-report historical correction lookup and existing named binding/chain
   errors. Validate stored pieces at their exact sorted ordinals using step 5; do not
   reconstruct full receipts on every invocation. Missing
   required witnesses still fail; an inner join must never silently discard them.
3. In `check_p06_quality_order_graph(order_key uuid)`, keep initial current-visit /
   correction / sequence checks and final per-command validation loop. Replace
   per-visit and per-cycle procedural reads with set-based EXISTS over the exact
   immutable FKs. Preserve actual production department/operation/time; actual
   start member/command/time; correction source chronology; inspection/report
   endpoint member/actor-time provenance; cycle rejection/manufacturing-origin
   witness; cycle1 versus failed prior k→k+1; exact accepted/rejected reinspection;
   and actual P04 cancellation outcome/time. Retain every named source/correction
   error. These checks still validate retained histories against their original
   witnesses rather than later mutable locations.

4. Forward-replace `check_approval_order_graph(affected_order uuid)` in the new
   P06 migration. Keep its root/header reads, initial unresolved/current issue
   consistency checks, full per-proposal check_piece_contact_proposal_bindings loop,
   immutable initial-approval timestamp and exact current-return witness. Replace
   only the per-issue loop with three set-based EXISTS checks. First left-join each
   actual issue to its reported approval command and retain missing/REPORT_ISSUE,
   exact order/piece/issue/reporter ID/fullName/role/department/time tuple and actual
   source-department authority checks. Second retain every RESOLVED issue's exact
   resolution command/order/piece/issue/operation/time/allowed-decision witness.
   Third retain latestProposalId matching its issue and absence of any higher
   sequence. Keep the three original named messages/ck_approval_order_graph errors;
   missing witnesses cannot disappear in an inner join. No P04 policy, proposal
   execution or source-fact change. This completes the same bounded set-based
   correction after the first corrected run returned successfully but required
   32334 ms through COMMIT. That timing is a failed gate, not maximum acceptance.

5. Preserve exact receipt equivalence without repeatedly constructing large JSON
   arrays. Apply this only inside check_p06_quality_command and a forward replacement
   of check_p05_manufacturing_command in the new P06 migration. Keep every existing
   event/visit/operation/packing/report/continuation/cycle/head predicate and all
   parent revalidation calls. The measured report invokes these checkers 1603/1600
   times; their self time is approximately 5121/3742 ms. This is repeated receipt
   construction cost, not permission to skip an already-checked graph.

   - Require outcome to be an object with exactly the `orders` key and an orders
     array whose length equals actual command-order rows. Iterate actual orders in
     ascending order_id and compare the same zero-based ordinal in stored orders.
     A group must be an object with a pieces array of the exact event membership
     length. Compare group minus `pieces` with the small exact expected metadata
     object: eventId/orderId/beforeVersion/afterVersion, plus packingGroupId for
     quality. Use JSONB equality for this metadata, preserving number-versus-string
     and UUID/null types, not permissive text or integer coercion.
   - At each group compare actual events sorted by piece_id with stored pieces
     `WITH ORDINALITY`, using equal array cardinality and ordinal joins. P05 keeps
     its next-visit join before canonical identity derivation, including duplicate
     source failure behavior. Require every fact to be an object. Require all
     expected keys with `?&` and no others with JSONB minus the expected text[] keys.
     Guard scalar/null objects before applying object subtraction so malformed
     values raise the existing named command-graph error.
   - P05 exact piece keys are pieceId/visitId/nextVisitId/stage/workState; P06 keys
     are pieceId/visitId/decision/stage/workState/correctionId/issueId. Compare each
     complete text/null tuple with the actual persisted UUID/enum/null tuple. UUID
     and enum facts must equal the canonical emitted text; nullable keys remain
     mandatory and JSON null stays different from missing or the string "null".
     All expected nonnull values are UUIDs/enums, so nonstring JSON types cannot
     match by text coercion. No quantities, unknown keys or independent identities
     enter the receipt. Metadata JSONB equality preserves numeric version types.
   - This rejects missing/extra groups/members/properties, reordered/duplicated
     members, changed identities, missing nullable keys, wrong null/type values
     and mismatched decisions/locations/links exactly as the old full JSON equality.
     Retain original named receipt failure constraints/messages and all other guard
     failures. No immutable history, wire shape or trigger registration changes.

   Before replacing the receipt comparison, extend P06's current-migration raw SQL
   constraint test with malformed parent/group/piece keys, missing nullable key,
   string-null, version-as-string, scalar piece and reversed member order cases.
   Prove the same cases for a real P05 receive/start produced from a valid P06
   rejection using actual cutting visits and witnesses. Drain the valid rejection's
   deferred checks before the next command in that owned rollback transaction, then
   assert each malformed new receipt fails with its exact command-graph constraint
   and complete rollback. Keep the separate historical P05-cutoff suite unchanged;
   it deliberately does not install the new P06 function replacement.

No unproved fast path, transaction-local validation state, deleted trigger or removed
parent revalidation is allowed. Only M05b may omit a redundant P05 recheck after its
exact unchanged-domain proof; affected-domain validation is never skipped. Equivalent set predicates reduce SQL call overhead;
all negative/bypass/retention cases remain mandatory, alongside real 200-member
report acceptance with the unchanged runtime budget. T018's brief owns execution
and evidence; design readiness does not assert this correction has run.

### M05b. Prove unchanged manufacturing state for canonical quality reports

The strict-receipt correction passed 79 P04/P05/P06 constraint tests but maximum
reporting still required 11986 ms. The profile shows 400 P05 order-graph calls and
1600 retained P05 command checks during a quality-only report. Forward-replace only
`enforce_p05_manufacturing_graph()` in the new P06 migration with the following exact
stateless dispatch. All triggers remain registered. All original full dispatch
branches remain the fallback, and is_p06_report_child still validates the complete
parent graph on every proposed early return. No GUC/cache/queue is introduced.

1. For sales_order_pieces, consider UPDATE only; nest table/operation tests before
   reading table-specific OLD/NEW fields. Require OLD stage QUALITY, work state
   INCOMING/IN_PROGRESS, null issue/receipt/cancellation/reason/currentWorkVisitId;
   NEW stage QUALITY/work state BLOCKED, nonnull issue and null receipt/cancellation/
   reason/currentWorkVisitId. Require to_jsonb(OLD) minus work_state/issue_id to equal
   the corresponding NEW object, so no identity/order/frozen term or pointer changed.
   Select that exact piece/order/issue's REPORT_ISSUE child through its actual
   QualityApprovalReport. Its beforeFacts/afterFacts must bind this row's exact full
   physical old/new tuple and piece ID, using the original P05 witness comparison
   fields. Load the actual final root version and call is_p06_report_child(childId,
   finalVersion). Only a true, fully validated result permits returning without a
   redundant check_p05_manufacturing_order_graph call. Otherwise use full dispatch.
2. For approval_commands INSERT, consider REPORT_ISSUE only. Require its actual issue
   to match command/order/piece and reportedCommandId and sourceDepartment/sourceStage
   QUALITY. Load the actual final root version and require the same complete
   is_p06_report_child proof before omitting only the redundant P05 order-graph call.
   Standalone P04 reports, other source departments, missing/foreign links and every
   other operation retain the full original dispatch.
3. Manufacturing visit/event/command/group triggers always run the original full
   P05 checks, as does every other physical mutation. P05 root-head and physical
   old/new transition witnesses, P04 head checks, P06 current-visit/cycle/parent/head
   checks, all FKs/checks and retention triggers remain unchanged. This branch does
   not admit a new transition or relax any root/head/child interval.

**Invariant proof.** In a previously valid committed graph, QUALITY has no current
manufacturing pointer or open manufacturing visit. Changing only its work state
and issueId to a canonical P04 hold leaves P05's physical current-pointer predicate
in the same nonmanufacturing branch with a null pointer. The other P05 predicates
read manufacturing history and immutable approval sources; this physical update
changes none of them. A new quality-source report cannot invalidate an existing
immutable manufacturing source. Any same-transaction visit/event/command insertion
or endpoint update has its own unchanged full P05 trigger; any pointer, identity,
other location or unselected-row mutation fails the local delta proof and receives
full dispatch. This remains true if constraints are forced early: subsequent domain
mutations enqueue/run their own full checks. Parent proof is repeated, not cached.
Existing root and piece witnesses independently enforce each real +1 child and its
exact hold; the quality parent remains no extra root witness. No starting invalid
legacy graph is admitted or repaired; normal migration preflight/history validation
and unchanged existing constraints remain prerequisites.

**Required guard tests before/after the change.** Extend only P06's current-migration
constraint file. Start with its exact valid two-child report graph. (a) Add an open
legacy-shaped manufacturing visit for a held quality piece; force
p05_visit_final_graph IMMEDIATE and require ck_manufacturing_current_visit_graph.
(b) Set that held piece's manufacturing pointer to such a visit; force
p05_piece_final_graph IMMEDIATE and require the same constraint. (c) Add a closed
manufacturing visit whose ISSUE_REPORTED endpoint wrongly uses the quality-source
child; force p05_visit_final_graph IMMEDIATE and require
ck_manufacturing_visit_times. No triggers are disabled: forcing the target check
first proves it still protects manufacturing independently of other guards. Require
complete savepoint rollback, retain all existing malformed-parent/child/direct-P04/
P05 legacy/receipt cases, and rerun actual P04/P05/P06 API and maximum tests. The
10000 ms execute-through-COMMIT criterion remains unchanged.

## M06. Migration, populated data and rollback/recovery

Proposed one forward migration directory:
`packages/database/prisma/migrations/20261111000200_p06_quality_workspaces/migration.sql`.
Verify actual next unused name before implementation; do not overwrite an existing
directory or rename applied history. New enums/tables/columns are additive and no
existing enum value needs a same-transaction enum alteration.

1. Create new enums/tables/indexes/FKs and new schema metadata in one transactional
   migration. Preserve all existing keys/checks and prior SQL/checksums.
2. Preflight existing physical graph. QUALITY incoming may exist from live P05
   transfers. QUALITY in-progress can predate this producer; QUALITY blocked belongs
   to actual P04 issue. A contradictory quality active row with received/cancellation
   or manufacturing pointer, missing approved root, or mismatched P04 hold fails
   migration for explicit reconciliation. Do not clear or fabricate protected facts.
3. Backfill **only** current eligible QUALITY/IN_PROGRESS with one migration-only
   visit sequence1, origin LEGACY_BASELINE when no real arrival source is known,
   `legacyUnknownStart=true` and null
   unknown arrival/start/actor. Do not invent an inspector or command. Current
   QUALITY incoming needs no visit; blocked QUALITY has no open visit. Do not
   manufacture old inspections/cycles/packing/handoffs from local browser storage.
4. When a genuine current production source can be established, use origin
   PRODUCTION_ARRIVAL and preserve its actual event/time as source even for a legacy
   unknown start. Otherwise display unknown.
   Never backfill a decided acceptance from a WAREHOUSE stage alone without evidence.
5. Drain deferred FK/backfill events with SET CONSTRAINTS ALL IMMEDIATE then restore
   deferred mode before altering witness functions/tables, following the P05 upgrade
   lesson. Install runtime migration-only guards after accepted backfill.
6. Create/replace M05 guards and install new retention/graph/head triggers; validate
   every affected order's final old and new graph. New implementation and producers
   deploy together after this forward migration in an authorized environment.

No production/developer migration is performed by PLAN. Deployment compatibility:
new API requires migrated schema; old code running during a coordinated upgrade can
still read existing domains but cannot provide P06 authority. Do not run old/new
quality writers concurrently; none exists at intake. Preserve existing P04/P05
requests during additive migration; exact original guards remain valid.

Recovery is restore/redeploy under separately authorized release procedure, or a
new forward repair after read-only applied-history inspection. Never auto-down/drop
quality audit tables or reset an unrelated database. Once new quality commands
exist, older application binaries cannot process their workflow safely; use the
coordinated rollout/rollback gate rather than claiming additive SQL alone makes
business rollback safe. Backup/restore production evidence remains P08/OPS-01.

## M07. Source-grounded migration and constraint verification

Use existing `packages/database/tests/integration/migration.integration.test.ts`,
P04/P05 constraint tests and guarded API integration harness. Add proposed
`packages/database/tests/integration/p06-quality-constraints.integration.test.ts`.
Discovery remains `tests/integration/**/*.test.ts` and real migrated PostgreSQL;
no SQLite or mocked `$transaction` for these claims.

Required acceptance cases:

- Fresh migration and representative populated upgrade with current P05 quality
  incoming, legacy quality in-progress, quality P04 holds, retained manufacturing/
  issue history and frozen terms. Verify null unknown starts and preserved old
  checksums. Contradictory graph fails without partial migrated state.
- Ordinary start/continue/accept, no issue history; exact mixed accept/reject with
  two rejecting targets and multiple members. One root bump/one quality witness,
  one event/decision per exact piece and no warehouse receivedAt change.
- Real `openQualityCorrectionVisit` consumer without a P06 producer remains bounded
  legacy seam evidence; live P06 rejection links strict positive witnesses. Missing
  cycle, wrong target/instructions/sourceVersion, or fabricated link cannot suppress
  the legacy witness and permit a bad command.
- REPORT_ISSUES for two pieces in one order produces versions v+1/v+2 and parent
  v→v+2, plus a second selected order. Both P04 +1 child receipts and all old guards
  remain valid. Missing/extra/duplicate/misaligned child/ordinal/actor/time/piece/hash/
  final-version links fail and roll back every selected order.
- Original direct P04 report and P05 complete/return/cancel commands retain exact
  head equality and original event/facts checks; an unlinked stale approval command
  cannot exploit the batch-child exception. No broad >= head relaxation.
- Duplicate start/decision/one-open-visit/cycle keys; correct lifecycle endpoints;
  failed reinspection closes k and opens exactly k+1; accepted reinspection closes
  latest; P04 held cancellation closes cycle with real cancellation witness.
- Packing group has exact accepted membership, optional free text retained once,
  no group on rejected-only/absent values; wrong piece/order/group/decision fails.
- Updates/deletes of retained commands/events/packing/children/original actor/reason/
  start fail. Allowed one-time visit/cycle endpoints succeed and cannot be rewritten.
- Induced real dependent-save failure after an earlier piece/child/group change
  leaves roots, pieces, starts, decisions, cycles, packing, issues and every command
  exactly unchanged. Independent-connection overlapping races preserve one winner
  and no duplicate quantity/decision/transfer.

Extend guarded `apps/api/src/test-support/reset-test-data.ts` and its discovered
tests to include new tables in exact FK-safe owned cleanup order, retaining the
existing owned-database marker checks and its explicit single TRUNCATE table list.
Do not remove or disable retention/integrity triggers for ordinary tests or cleanup.
Fault-injection cases may install and remove only their own temporary fault trigger;
all actual application guards stay enabled. No production cleanup endpoint or weaker
global reset is added. Schema-contract expectations extend the inventory
without removing old invariant assertions. No migration/test is executed by PLAN;
actual checks and evidence are later implementation outputs.

### M06a. Current-schema seed-test cleanup prerequisite

The full database suite observes 0A000 before seed scenarios because
packages/database/tests/integration/seed.integration.test.ts:resetOwnedDatabase has
an explicit pre-P06 TRUNCATE list. Add exactly quality_approval_reports,
quality_packing_pieces, quality_packing_groups, quality_piece_events,
quality_correction_cycles, quality_work_visits, quality_command_orders and
quality_commands to that same statement. Preserve NODE_ENV/owned marker/selected
current_database guards and all original tables, initial registry insertions and
no-CASCADE policy. Production prisma/seed.ts is unchanged. No developer database,
new cleanup API or migration change is authorized by this correction. T024 owns the
fresh failing full-suite regression and focused seed/integration rerun; prior T007
completion remains historical evidence, not a claim that this discovered caller was
already covered. The existing twelve real seed/guard scenarios must pass unchanged.

### M05c. Convergence report fact projection — 2026-11-12

The authorized [B07b blueprint](backend-design.md#b07b-fact-only-source-projection-for-repeated-reports--authorized-2026-11-12) narrows only the Prisma fields reloaded after each report child. It retains every actual physical member/identity/price/current state and required header fact, the same shared financial/count validators and all database guards. No table, field, index, function, trigger or migration changes; M05a/M05b and all prior bytes/checksums remain intact. A schema migration/backfill/recovery change is N/A. The current missing maximum-report acceptance is addressed by bounded source projection rather than skipped reads or relaxed constraints.

### M05d. Stateless Quality validation dispatch by unchanged read set — authorized follow-up, 2026-11-12

**Measured need and scope.** B07b's source projection passes 75 focused integrations but is insufficient for complete acceptance: the next full run passed all 160 database cases, then the maximum-report case failed again; that already-failed run was interrupted after its completed Quality file and approval queries (exit 130), so no complete API pass or exact report elapsed value is claimed for it. A diagnostic report measured 6704ms. Statement/function profiling identified repeated parent traversal: 2003 command validations, including 1202 order-graph traversals and 799 positively linked witness-helper calls. Four report-chain join variants showed no reliable gain (1000-call observations 673/668/970/655ms); none is adopted. The owner already authorized this narrow M05a/M05b planning/analysis/implementation correction while preserving all guards/history/budgets.

**Proposed forward owner.** Create only `packages/database/prisma/migrations/20261112000100_p06_quality_validation_dispatch/migration.sql`. Existing migration bytes/checksums, tables, columns, keys, indexes, triggers, retention guards, `check_p06_quality_command`, `is_p06_report_child` and its callers remain intact. No GUC, validation cache, dirty queue, caller flag, new mutable record or changed accepted graph.

**Fixed function interfaces and algorithm.**

1. CREATE `check_p06_quality_order_state(order_key UUID) RETURNS void LANGUAGE plpgsql`. Its body is the exact existing `check_p06_quality_order_graph` body before its final command loop: retain all current physical/open-visit pointers; visit/cycle sequence checks; correction-current-state constraints; actual production/start/correction/inspection/issue endpoints and chronological witnesses; rejection/normal manufacturing route/prior-cycle binding; reinspection and P04 cancellation resolution checks. Preserve each existing named exception and predicate verbatim.
2. CREATE OR REPLACE existing `check_p06_quality_order_graph(order_key UUID)` with a wrapper that calls that state helper, then performs its same existing `FOR command_key IN SELECT command_id FROM quality_command_orders WHERE order_id=order_key LOOP PERFORM check_p06_quality_command(command_key); END LOOP`. The complete validator keeps its existing name/signature and complete meaning for callers/manual validation/preflight. No parent predicate or loop is removed.
3. Before changing dispatch, run the complete validator for every existing sales order and the unchanged command validator for every quality command inside the migration transaction. This establishes the valid committed-base assumption, catches orphan/malformed parents as well as current state, and refuses a contradiction atomically without repairing/fabricating data.
4. CREATE OR REPLACE `enforce_p06_quality_graph() RETURNS trigger`. Keep its original record extraction and quality_commands branch (full command validation plus full order validation) unchanged. For the exact closed external table allowlist `sales_drafts`, `sales_order_pieces`, `manufacturing_issues`, `approval_commands`, `manufacturing_piece_events`, `manufacturing_work_visits`, derive the same order ID and invoke the state helper. Every other branch, including every Quality event/group/visit/cycle/packing/member/report mutation and any unknown future table, invokes the complete order validator. Keep every trigger registration enabled and unchanged. Keep all full parent validations inside `is_p06_report_child` and the P04/P05 positively linked exceptions.
5. Wrap all definitions/preflight in BEGIN/COMMIT. A failed preflight leaves data and prior definitions intact. No backfill or data UPDATE/DELETE. Recovery is a reviewed forward replacement restoring the earlier dispatcher if ever required; never edit an applied migration. Actual deployment remains outside this local task.

**Read-set / equivalence proof.** The unchanged command validator reads Quality commands, groups, events, visits, cycles, packing and report links; it also reads existing approval command facts and issue source/reporter/text facts. It does not read sales roots/physical rows or manufacturing events/visits. Those external mutations still run every original current-state/witness predicate through the state helper. Approval commands are retained and insert-only; a newly inserted external command cannot change an existing valid committed parent's referenced row. Issue source/reporter/text fields are immutable under the unchanged P04 transition guard; its mutable workflow/proposal fields are not read by the Quality command validator. New issue rows likewise cannot replace an existing referenced primary key. Any new/changed Quality row that references a newly inserted external row has its own unchanged full Quality trigger. Every possible mutation of the command validator's mutable Quality read set therefore still invokes full parent validation. All actual data predicates are preserved; only traversals whose read set cannot change are omitted from external state dispatch.

This is induction from a validated committed graph, not reuse of a remembered result. At COMMIT all registered constraints still execute. Forcing the external state checks early does not acknowledge or cancel pending Quality constraints; a later affected Quality mutation enqueues/runs its full check, including after a previous successful flush. No superseded state can be accepted by a cached proof. Preflight rejects an invalid starting graph. Root/head/version/physical transitions, P04/P05 consistency, FKs, retention and authority remain independent and unchanged.

**Verification fixed before implementation.** Extend current P06 constraint tests to (a) force `p06_quality_physical_graph` alone against a physical/open-visit contradiction and require its original current-state error with complete rollback; (b) build the existing invalid-ordinal report, force only external root/physical checks, then require the pending Quality checks at ALL IMMEDIATE to reject it with `ck_quality_report_chain` and complete rollback; (c) retain source-field immutability and all existing malformed receipt/child/visit/cycle/foreign/P04/P05 cases unchanged. Add a populated old-P06 → new-forward upgrade case in existing API `quality.queries.integration.test.ts`: reuse the current P05-cutoff fixture, apply/resolve the exact old P06 migration, produce a real two-member P06 report, snapshot complete graph/old ledger/trigger definitions/full command-validator definition, deploy only the pending forward migration, require unchanged snapshots/old checksums and original receipt recovery, then redeploy idempotently. Extract the existing owned-child Prisma runner locally in that test file for reuse; do not change the historical P05 fixture cutoff. Update only the schema-contract migration inventory and the P06 migration test's expected new-tail ledger filtering to name both authorized P06 migrations; preserve all prior-row comparisons and malformed-state assertions.

Run fresh full P04/P05/P06 database constraints, API Quality command/query/service and P04 writer/service tests, the unchanged 200-member through-COMMIT limit and all cancellation/rollback races; then complete root integration and T061's full unit/build/browser checks. No profiler/probe code or diagnostic settings ships. Both requirements and engineering reviews must assess the dependency proof and final persisted outcomes, not just speed. Planning readiness is not runtime acceptance.

M05d documentation alignment: update only the P06 runtime migration lists in root `README.md` and `PROJECT_REFERENCE.md` to include the new forward function migration beside the original. Existing release coordination and P07/client/OPS-01 exclusions remain unchanged; verify the named paths and scoped formatting. No broader documentation rewrite is planned.

M05d inventory alignment discovered by full verification: the existing populated P03/P04 upgrade cases in `packages/database/tests/integration/migration.integration.test.ts` also assert the final applied migration count. Their two final inventory assertions must advance from 12 to 13 for this already specified forward migration. Historical pre-upgrade counts, retained graph comparisons, all old ledger/checksum comparisons and idempotent redeployment assertions remain unchanged. This supplements the inventory owners above; it changes no migration, data behavior or guard.
