# Feature Specification: Physical Warehouse Receipt and Whole-Order Delivery

**Roadmap Phase**: P07 — Physical warehouse receipt and whole-order delivery\
**Feature Directory**: `specs/007-warehouse-receipt-delivery`\
**Feature Branch**: `main` at intake; feature numbering is independent of the Git branch\
**Created**: 2026-11-13\
**Status**: Draft — specification complete for technical planning; no implementation or phase acceptance claimed\
**Input**: Specify P07 only in English, read root `plan.md` and `docs/workflow/phase-delivery.md`, and reuse its matching accepted feature if one exists. During this invocation the owner confirmed explicit whole-order scope review, rejection of an entire invalid batch, and minimal warehouse delivery-contact access (D-002–004).

## Scope and Baseline

- **Outcome**: Authorized warehouse staff physically receive exact accepted pieces, reconcile complete orders, and record whole-order dispatch, customer receipt, physical-return failure and retry, retaining evidence across sessions.
- **Selection**: No matching P07 feature exists among the inspected P01–P06 specifications. Create this one P07 feature and select it instead of P06. Preserve earlier artifacts, IDs, decisions and progress.
- **Current evidence**: Intake revision `d6c3a06`, actual branch `main`, clean tracked/untracked worktree. Identity, submitted orders, approval, manufacturing and quality have persisted owners. Quality acceptance produces warehouse-incoming pieces without physical receipt. Warehouse queues and delivery actions still use browser-local operational state; no warehouse command module is composed in the current API. The protected roadmap's older source/status inventory is historical, not current implementation evidence.
- **Prerequisite evidence**: P04–P06 task ledgers have no unchecked task markers. P06's latest T066 entry records local exit PASS on 2026-11-13, including backend, frontend and browser evidence. This invocation inspected those records and current handoff source; it reran no application tests. Verify current prerequisites before dependent implementation. Recorded upstream acceptance does not establish P07 acceptance.
- **Deliverables**: Existing warehouse dashboard, incoming, incomplete, ready, dispatched, failed, delivered, activity and order-detail views and aliases; physical piece receipt and captured arrival data; exact counts/readiness; reviewed whole-order selection and atomic batches; retained delivery attempts/captured fields; truthful access, failure and recovery states; minimal delivery-contact visibility.
- **Exclusions**: New quality/manufacturing/approval or sales policies; warehouse manufacturing start/finish; partial customer delivery; courier accounts/dashboards/integrations; stock/carton inventory or numbering platform; payment collection, settlement, refunds or financial reporting; customer-master or submitted-snapshot edits; administrative cancellation/reopening/reports and release work (P08); new screens/redesign, imports, activation, commit/push or deployment.
- **Dependencies and foundations**: Reuse P01 current account/department authority; P02 stable order/piece identities and activity; P03 frozen submitted terms/counts/tracking; P04 retained cancellation and privacy/print decisions; P05 manufacturing history; and P06 accepted-piece incoming handoff and optional packing groups. Reuse existing authentication, validation, safe errors, command-result recovery, transport and authoritative-state conventions. Architecture, interfaces, storage and task briefs belong to later PLAN/TASKS commands.
- **Frontend boundary**: Preserve Arabic/RTL/Cairo, routes/navigation, grouped/flat views, expansion/selection, filters, pagination, dialogs, details, tracking/history and paper presentation. Necessary functional corrections include truthful receipt/delivery labels, full-scope confirmation, retained dialog values, actual actors/dates, safe contact output and recovery. Retain reached UI under `apps/web/src/features/prototype/`.
- **Open decisions and gates**: No unresolved material product question remains after D-002–004. Readiness is distinct from technical planning, prerequisite revalidation and executed acceptance. Preserve root owner-review/release status, activation evidence requirements and OPS-01. Reuse P03's confirmed numbering decision rather than reopening the root roadmap's older pending NUM-01 row.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Physically receive an exact arrival (Priority: P1)

An active warehouse employee or ADMIN finds quality-accepted incoming pieces and acknowledges those physically present, retaining arrival data without claiming absent pieces arrived.

**Why this priority**: Physical receipt establishes completion; quality acceptance/packing alone cannot.

**Independent Test**: Quality accepts P1/P2 of a three-piece order. A receives P1 with carton text `2`, location `Shelf B-12` and note `Protect finished surfaces`. B reloads the same arrival; P2 remains incoming, P3 remains upstream and the order is incomplete.

**Acceptance Scenarios**:

1. **Given** accepted incoming P1/P2, **When** A physically receives P1, **Then** only P1 is received once, with actual actor/time and entered arrival data; P2 and upstream pieces are unchanged.
2. **Given** another arrival, **When** B receives remaining eligible pieces with different or absent optional data, **Then** both arrivals retain their own pieces/values; earlier receipt and quality packing are not overwritten.
3. **Given** an accepted piece not physically present, **When** quality acceptance/packing is recorded or read, **Then** it remains warehouse incoming and contributes no physical receipt.
4. **Given** duplicate, stale, cancelled, held, unaccepted or foreign-stage members, **When** receipt is requested, **Then** the entire confirmed batch is rejected unchanged with refresh/review guidance.
5. **Given** a committed receipt with a lost reply, **When** the actor recovers/repeats the same intent, **Then** the original result is observable without another receipt, group or count increase.

### User Story 2 — Reconcile incomplete and ready orders (Priority: P1)

Warehouse staff distinguish incoming pieces, orders awaiting more pieces and complete orders ready for dispatch, using the same retained physical facts everywhere.

**Why this priority**: Accurate readiness prevents partial or premature shipment.

**Independent Test**: Four original pieces include one cancelled upstream and two of three active pieces received. The order stays incomplete until the third arrives. A fully cancelled order is never ready.

**Acceptance Scenarios**:

1. **Given** partial receipt, **When** lists/detail/dashboard/shared tracking refresh, **Then** original/cancelled/active/received counts agree, each piece counts once and dispatch is unavailable.
2. **Given** 199 of 200 active pieces received, **When** progress/readiness is read or dispatch attempted, **Then** the order is incomplete, no displayed 100% claims full receipt and dispatch is denied.
3. **Given** authorized upstream cancellation, **When** counts reconcile, **Then** active requirement decreases once, history and paid remain, and readiness uses remaining active pieces.
4. **Given** no active pieces, **When** the order is read, **Then** it is cancelled/non-deliverable rather than ready or deliverable 100%-complete.
5. **Given** dispatched, failed-returned or delivered orders, **When** manufacturing-incomplete results are read, **Then** those orders are excluded while historical work remains traceable.

### User Story 3 — Review and dispatch whole orders (Priority: P1)

Warehouse staff select existing rows, review the resulting whole-order scope, and dispatch complete eligible orders without hidden partial shipment or silent expansion.

**Why this priority**: Piece selection must communicate the owner-approved whole-order action.

**Independent Test**: Select only P1 from ready O1 containing P1/P2. The existing confirmation shows O1, both active pieces and full quantity. Confirmation dispatches both once; cancelling writes nothing.

**Acceptance Scenarios**:

1. **Given** selected rows from ready orders, **When** dispatch is prepared, **Then** every affected order appears once with all active pieces/full quantity, including pieces outside the initial selection, before confirmation (D-002).
2. **Given** two distinct rows from O1, **When** they resolve to whole-order scope, **Then** O1 is reviewed once. This intentional grouping differs from an invalid repeated piece identity or submitted order entry.
3. **Given** reviewed full scopes, **When** the actor confirms, **Then** every active piece of each order dispatches together and a retained attempt records actual actor/time and supplied handoff details.
4. **Given** ready O1 plus incomplete, failed, delivered or concurrently changed O2, **When** the batch is confirmed, **Then** neither order changes; refresh/review is required (D-003).
5. **Given** optional delivery notes, **When** dispatch succeeds, **Then** the entered handoff note survives reload as a note, not a courier identity or fixture name.

### User Story 4 — Confirm whole-order customer receipt (Priority: P1)

Warehouse staff record receipt of every active piece from the current dispatched attempt and retain recipient, actual delivery date/time and notes where supplied.

**Why this priority**: Delivered must mean complete customer receipt with traceable evidence.

**Independent Test**: Dispatch O1/P1/P2, confirm complete receipt with recipient `Test Recipient`, actual delivery date/time `2026-11-13 14:30 +02:00` and note `Handed to recipient`, then reload under another eligible operator. This synthetic offset-bearing example does not select the production business timezone.

**Acceptance Scenarios**:

1. **Given** a current dispatched attempt, **When** complete receipt is confirmed, **Then** the whole order becomes delivered once; supplied recipient/date/notes and recording actor/time remain linked to that attempt.
2. **Given** a nondispatched order, old attempt or subset-only request, **When** delivery confirmation is attempted, **Then** it is rejected unchanged without rewriting earlier receipt/delivery facts.
3. **Given** absent optional capture, **When** confirmation is otherwise valid, **Then** values remain honestly unrecorded; no recipient or demo time is fabricated.
4. **Given** competing success and failure for one attempt, **When** both are submitted, **Then** at most one valid outcome succeeds; the loser conflicts and the order cannot be both delivered and failed.

### User Story 5 — Record returned goods and retry (Priority: P1)

Warehouse staff record failure only after all goods physically return, then explicitly return the order to ready, optionally entering a new date/notes before ordinary dispatch.

**Why this priority**: A delivery exception must not imply custody before return or silently start another attempt.

**Independent Test**: Dispatch O1; record failure with reason `Customer unavailable` and acknowledge return of all active pieces. Retry without a date, dispatch again and succeed. Reload both distinct attempts/outcomes.

**Acceptance Scenarios**:

1. **Given** goods not all returned, **When** failure is considered, **Then** confirmation explains its full-return meaning and cannot truthfully be completed; no returned-goods state is recorded.
2. **Given** all goods returned, **When** failure is acknowledged with nonblank reason, **Then** the current attempt retains its failed/returned outcome and the order enters failed delivery in warehouse custody; original receipt counts/history do not increase or rewind.
3. **Given** blank reason or no return acknowledgement, **When** confirmation is submitted, **Then** the whole operation is rejected with field/action guidance; no reason or return evidence is invented.
4. **Given** failed-returned O1, **When** retry is confirmed with or without a new date/notes, **Then** it becomes ready with supplied values retained. No new dispatch/attempt is claimed until ordinary dispatch succeeds.
5. **Given** a failed order, **When** any row/batch/detail/direct action tries dispatch without retry, **Then** it is denied with retry-to-ready guidance. Repeated cycles preserve all attempts.

### User Story 6 — Work safely across operators and failures (Priority: P1)

Authorized staff see consistent facts and minimal delivery contacts; denied/uncertain actions preserve state and provide recovery through existing surfaces.

**Why this priority**: Local confirmations, stale authority or lost replies cannot establish custody or delivery.

**Independent Test**: Two sessions open O1. One completes an action while the other has a dirty dialog; the second sees a conflict and reviews current state. Repeat with revoked access and a lost reply.

**Acceptance Scenarios**:

1. **Given** current warehouse authority, **When** delivery context is read, **Then** staff see submitted name/phone/address without email, finance, unrelated history or raw snapshots (D-004).
2. **Given** suspended/pending/unverified/wrong-department access, **When** data/action is requested directly, **Then** it is denied without disclosure or changes; browser workspace selection grants no authority.
3. **Given** loading, failed reads or invalid responses, **When** a view/dialog appears, **Then** pending/error differs from actual empty success and offers Arabic recovery without fixture fallback.
4. **Given** pending/conflicting/uncertain writes, **When** the actor double-clicks, closes a dialog or switches account/order, **Then** original-scope recovery remains available without duplicates or another context's late success.
5. **Given** recoverable validation/save failure, **When** feedback appears, **Then** safe input remains, success is not announced and a retry/review path names the failed action.

### Concrete Acceptance Examples

Identifiers and entered text are synthetic acceptance cases, not executed results.

| Requirement / scenario | Actor and starting state                   | Concrete safe input / action                                                                                    | Expected observable result                                                  | State unchanged on failure                     |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| FR-005–007 / US1       | P1/P2 accepted, P3 production              | Receive P1; carton `2`, location `Shelf B-12`, note `Protect finished surfaces`                                 | One P1 receipt/arrival; received 1/3; others unchanged                      | No duplicate count/event/group                 |
| FR-006–007 / US1       | P2 incoming after earlier arrival          | Receive P2 with optional capture absent/blank                                                                   | P2 received; absence unrecorded; first arrival and quality packing retained | No default carton/shelf or overwrite           |
| FR-008–010 / US2       | Four original, one cancelled, two received | Read counts/progress                                                                                            | Original 4, cancelled 1, active 3, received 2; incomplete                   | Paid/cancellation evidence retained            |
| FR-009 / US2           | 200 active, 199 received                   | Read readiness; try dispatch                                                                                    | Incomplete, no false 100%, no dispatch                                      | All piece states/history unchanged             |
| FR-010 / US2           | All pieces cancelled                       | Read readiness; try dispatch                                                                                    | Non-deliverable, never ready                                                | No zero-piece shipment                         |
| FR-011–013 / US3       | O1 ready with P1/P2                        | Select P1, review O1/P1/P2, confirm                                                                             | One full-order attempt, both dispatched                                     | Cancel before submit writes nothing            |
| FR-012/022 / US3       | O1 ready; O2 changes after review          | Confirm O1/O2 batch                                                                                             | Entire batch rejected for refreshed review                                  | Both states/attempts/activity unchanged        |
| FR-014–015 / US4       | O1 dispatched                              | Complete receipt; recipient `Test Recipient`, actual time `2026-11-13 14:30 +02:00`, note `Handed to recipient` | Delivered once; supplied evidence survives reload                           | No partial delivery or money change            |
| FR-016–017 / US5       | O1 dispatched, goods all returned          | Acknowledge return; reason `Customer unavailable`                                                               | One failed-returned attempt, warehouse custody                              | Initial receipt/manufacturing retained         |
| FR-017 / US5           | O1 dispatched                              | Whitespace reason or no return acknowledgement                                                                  | Required-field/action error                                                 | No invented reason/return                      |
| FR-018–019 / US5       | O1 failed-returned                         | Retry without date, dispatch; after another returned failure retry for `2026-11-15`                             | Each retry restores ready; each dispatch creates one attempt                | No forced date/auto-dispatch/history overwrite |
| FR-021–024 / US6       | Committed action, reply lost               | Recover/repeat original intent                                                                                  | Original outcome once; changed intent conflicts                             | No duplicate effects/activity                  |
| FR-003–004 / US6       | Authorized warehouse employee              | Open O1 delivery context                                                                                        | Submitted name/phone/address; no email/finance/unrelated history            | Other private data undisclosed                 |
| FR-027 / US6           | Dirty retry dialog                         | Enter `2026-02-30` or a 4001-character note; submit                                                             | Field-associated Arabic correction; input retained                          | No transition/truncation                       |

### Edge Cases

- Empty selection, repeated physical identities/submitted order scopes, wrong-order IDs and quantities that cannot identify exact whole pieces.
- Partial arrivals, unresolved active-piece hold, upstream cancellation, zero active pieces and rounded progress at 199/200.
- Already received piece under another intent; concurrent last receipt/cancellation/dispatch; dispatch versus dispatch and success versus failure.
- Repeated attempts, late earlier-attempt result, failure before full return, partial return, retry before failure and failed-to-dispatch bypass.
- Optional capture absent/blank, unknown historical values, invalid entered dates and excess text. Carton text is neither an independent counter nor a carton registry.
- Refresh during dirty confirmation, selection change after review, closed-dialog recovery, uncertain commit, revoked access and replies for another account/order.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Provide authoritative warehouse dashboard, incoming, incomplete, ready, out-for-delivery, failed, delivered, detail and activity reads through existing surfaces. Warehouse order context requires current or retained participation through an accepted warehouse handoff, physical receipt or delivery attempt; approval or upstream manufacturing alone grants no warehouse visibility. Within a permitted order, show safe companion-piece locations needed for reconciliation. Preserve order-type, order/customer/piece/model/worker search, status and pagination interactions where present; rows/counts/totals MUST share the authorized filter scope.
- **FR-002**: Preserve `/warehouse/in-progress` as ready compatibility, `/warehouse/tasks/[orderId]` as redirect to the same order detail, and `/warehouse` as dashboard redirect. Unknown/inaccessible identities MUST NOT open a fallback order. Retain receipt/delivery history after current work ends.
- **FR-003**: Only currently eligible warehouse employees or ADMIN may read warehouse operational context or execute its commands, under current order/piece/attempt preconditions. Direct requests MUST enforce authority; other departments gain no warehouse command permission.
- **FR-004**: Warehouse delivery output MAY include submitted name, phone and address for the permitted order (D-004). Warehouse employees MUST NOT receive email, unit/row prices, totals, paid/due/surplus, price provenance, unrelated customer/order history or raw snapshots. Do not expand manufacturing-contact or official-print access; ADMIN keeps its separately authorized context.
- **FR-005**: Physical receipt MUST acknowledge exact noncancelled, quality-accepted incoming pieces actually received, with actual actor/time, changing only those pieces' physical-received facts. Quality acceptance/packing, generic transfer, segment quantity or manufacturing start/finish MUST NOT substitute for receipt.
- **FR-006**: Count each piece's initial warehouse receipt once. Repetition with the same or another intent MUST NOT add receipt/quantity/group evidence; handle replay/conflict under FR-021. Delivery return/retry MUST NOT count another initial receipt.
- **FR-007**: Retain supplied carton-count text, storage location and note against the exact receipt group/pieces. Different arrivals keep independent values. Optional absent/blank values mean unrecorded, not fabricated defaults, zero cartons or deletion of previous evidence. Preserve P06 packing separately; do not multiply group cartons per piece or introduce carton inventory.
- **FR-008**: Original/cancelled/active/received-active counts and tracking MUST derive from retained physical identities. Active is original minus retained cancellations; received-active includes each physically received noncancelled piece once. Cancellation reduces the active requirement once without erasing history or changing actual paid.
- **FR-009**: Physical completion requires positive active count and every active piece physically received. Dispatch readiness also requires eligible ready state, no unresolved active-piece blocker, no current dispatch/delivered outcome and no failed-awaiting-retry state. Rounding MUST NOT grant readiness or show 100% before exact full receipt; 199/200 stays incomplete.
- **FR-010**: The incomplete queue contains permitted orders under FR-001 with positive active count and received-active count below active count, excluding dispatched, failed, delivered and fully cancelled orders. Accepted incoming participation qualifies even before the first physical receipt. Such orders may include received pieces while others remain upstream/incoming, but cannot dispatch. Fully cancelled orders remain non-deliverable, never ready/100%-deliverable; retained history alone never makes an order actionable.
- **FR-011**: Delivery row selection MUST resolve to distinct whole orders. Before dispatch confirmation, show every affected order, all active-piece membership/full quantity, including pieces outside initial selection, and applicable handoff details. Explicitly confirm that scope; no partial delivery or silent expansion (D-002).
- **FR-012**: Dispatch MUST revalidate the exact reviewed scopes and change every active piece together. Changed membership/state/authority since review rejects for refreshed review. Cancelled pieces stay outside delivery membership with history retained.
- **FR-013**: Each successful dispatch creates one retained attempt with whole-order scope, actual actor/time and supplied handoff details. Preserve optional delivery note as a note, not a courier name. Retain actual courier details where genuinely supplied; require no new courier account/input or fabricated identity.
- **FR-014**: Confirm complete customer receipt only for the current dispatched attempt and whole active order, becoming delivered once. Subset confirmation, old-attempt result or another starting state MUST be denied unchanged.
- **FR-015**: Preserve supplied actual recipient, delivery date/time and notes against the attempt, separately from recording actor/time. Optional absence stays unrecorded. Entered date/time MUST be valid/unambiguous; do not substitute demo text, assumed customer recipient or guessed timestamps.
- **FR-016**: Failure MUST explicitly acknowledge that all dispatched active goods physically returned. It applies only to the current dispatched attempt; before full return no failed-returned custody state may be confirmed. Partial return creates no partial delivery or return-management subsystem.
- **FR-017**: Failure requires nonblank reason and retains supplied details/notes, actual actor/time and returned outcome. Quick-fill may assist; blank text MUST NOT become an invented generic reason. Return restores custody without duplicating initial receipt, resetting manufacturing or changing frozen terms/paid.
- **FR-018**: Explicit retry applies only to failed-returned orders, restores ready and records actual actor/time with optional new date/notes. Omitted/blank date is valid and means no new date recorded; supplied date must be a valid calendar date. Retry preserves failed attempts and does not dispatch/create another attempt.
- **FR-019**: Ordinary dispatch after retry creates the next attempt. Reject failed-to-dispatch, ready-to-delivered, delivered-to-failed and other shortcuts from every row/batch/detail/direct path. Multiple attempts retain distinct handoff/recipient/failure/retry evidence.
- **FR-020**: State, captured receipt/attempt data and required activity MUST succeed/fail together. Retain actual actor ID/name/department at action time, authoritative time, order/piece scope, operation, reason/notes and relevant prior/resulting state. Never rewrite actual manufacturing, inspection, cancellation or delivery history.
- **FR-021**: Repeating accepted intent MUST expose its original outcome without duplicate effects/events. Same intent identity with changed payload conflicts; another intent against completed/ineligible work cannot repeat the effect. Reconcile unknown results before another intent. Concurrent operators cannot both commit incompatible transitions.
- **FR-022**: Every P07 batch MUST commit its entire exact confirmed piece/whole-order scope or leave it unchanged (D-003). Empty, duplicated, stale, foreign, cancelled, held or otherwise ineligible members, or required-save failure, reject all members/effects. No skip, per-order partial commit or replacement selection. Grouping distinct selected rows into one reviewed order under FR-011 is valid.
- **FR-023**: Preserve specifications, submitted customer/price snapshots, order identity/number, paid and upstream history. Consume existing cancellation/totals outcomes; P07 grants no cancellation, repricing, payment/refund, customer correction or administrative reopen authority.
- **FR-024**: Confirmed actions MUST reconcile affected warehouse queues/details/dashboard/activity, piece locations/progress and existing authorized shared tracking. Another eligible session sees the same persisted result after reload. Do not claim unconverted P08 surfaces integrated or populate them with fixture success.
- **FR-025**: Distinguish loading, actual empty success, refresh, missing/denied, validation, pending, confirmed success, conflict, read/write failure and unknown outcome. Success follows authoritative confirmation; errors MUST NOT become fixture/empty/local success or another order. Unavailable/stale eligibility is not current dispatch permission.
- **FR-026**: Preserve safe dirty input on recoverable errors/refresh; require review before resubmitting stale scope. Prevent duplicate/conflicting submits, retain result recovery after dialog closure and prevent old-context replies replacing data or announcing another action's success. Unsent cancel writes nothing; closing a submitted dialog does not imply rollback.
- **FR-027**: Failures MUST use Arabic meanings/recovery below: name failed action/relevant field, distinguish missing/invalid input and avoid diagnostics/guessed causes. Preserve RTL/Cairo, keyboard/focus, field/error/status associations and narrow/wide presentation.

### Authority and Data Rules

| Operation / data                              | Eligible warehouse employee     | Eligible ADMIN                | Other departments                                       |
| --------------------------------------------- | ------------------------------- | ----------------------------- | ------------------------------------------------------- |
| Warehouse reads/history                       | Permitted operational context   | Permitted context             | No new warehouse access; own-domain reads remain scoped |
| Receipt/dispatch/confirm/failure/retry        | Current operation/state rules   | Same operation/state rules    | Denied                                                  |
| Submitted delivery name/phone/address         | Minimal permitted-order context | Existing authorized context   | Manufacturing privacy/sales ownership unchanged         |
| Finance/email/raw snapshots/unrelated history | Excluded                        | Existing separate permissions | Existing separate permissions                           |
| Official print/paid/cancel/admin correction   | No new authority                | Owning phase rules only       | Owning phase rules only                                 |

- All seven types use the same quality → incoming → physical receipt → whole-order delivery. Repair filters create no shortcut or rewind of delivered work.
- Preserve the accepted maximum 200 pieces per order and stable identities. Counts summarize explicit pieces; group/flat/segment views cannot create a competing ledger or allocate by array order.
- Failure reasons and optional notes reuse the 4000-character bound. Mandatory reason needs nonwhitespace text; optional omitted/null/blank note means no extra note. Reject excess without truncation/write. PLAN fixes finite capture/selection transport bounds from accepted limits/source without inventing business requiredness or capacity targets.
- Carton/location and recipient/date inputs remain optional captured data under D-005. Preserve original-language text; introduce no numeric carton validation, unique carton scheme or automatic carton arithmetic.
- Server recording instants, supplied actual delivery date/time and date-only retries are separate. Reuse accepted business-date behavior; OPS-01 remains a release gate, not an assumption from the user's computer timezone.
- Retain groups/attempts/activity; no delete/purge/history rewrite. Later optional omissions never erase earlier evidence. Caller-selected actor/role/counters/prices/arbitrary status or location patches grant no authority; entered storage-location text is descriptive capture only.
- Missing historical optional evidence is unrecorded. Quality acceptance, local snapshots or absent values cannot backfill receipt or fabricate courier/recipient/return. Later design/migration must safely preserve existing authoritative records.

### Frontend and State Requirements

| Existing surface                                     | Required behavior                                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/warehouse/dashboard`                               | Scoped counts/links and truthful states; overlapping queues are not separate stock                                                                                          |
| `/warehouse/incoming`                                | Accepted unreceived pieces; receipt, no manufacturing start/finish                                                                                                          |
| `/warehouse/incomplete`                              | Warehouse-participating orders with positive active count and received below active, including accepted incoming before first receipt; dispatched/failed/delivered excluded |
| `/warehouse/ready`, `/warehouse/in-progress`         | Same physically complete eligible ready scope; explicit dispatch review                                                                                                     |
| `/warehouse/out-for-delivery`                        | Current attempts; whole-order confirm or physical-return failure                                                                                                            |
| `/warehouse/delivery-failed`                         | Retained returned attempts; explicit retry-to-ready then ordinary dispatch                                                                                                  |
| `/warehouse/delivered`                               | Complete customer receipt/history; no manufacturing reopen                                                                                                                  |
| `/warehouse/activity`, `/warehouse/orders/[orderId]` | Actual actors, receipt groups, safe specifications/contacts, tracking and attempts                                                                                          |
| `/warehouse`, `/warehouse/tasks/[orderId]`           | Existing dashboard/detail aliases with same authority/identities                                                                                                            |
| Grouped/flat selection, batch toolbar and dialogs    | Exact receipt identities, full-order review, atomic results, retained supplied fields                                                                                       |

Incoming and incomplete may overlap for a partially arrived order; identify order versus piece count scope. Grouped/flat views retain the same membership. Confirmation/failure apply to the full current attempt even when initiated from one piece row; explicitly review that scope. Retry also reviews whole orders. Failed-returned must first retry; ready is not currently dispatched.

The English wording below specifies intended Arabic message meaning/recovery, not English product copy or permission to translate source labels.

| Expected failure                                              | Required message meaning                                                      | Recovery / unchanged outcome                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Empty/duplicate/wrong-order selection                         | Identify missing/repeated selection; exact pieces/whole orders required       | Correct/review selection; no write                                                 |
| Receipt member unaccepted, moved, received, cancelled or held | Explain why receipt is unavailable for current selection                      | Refresh/review; entire batch unchanged                                             |
| Incomplete/zero-active dispatch                               | All active pieces must be physically received in a nonempty deliverable order | Show received/required counts; await/receive missing pieces or return to list      |
| Reviewed scope changed                                        | None of the batch saved because eligibility/membership changed                | Preserve input; refresh and explicitly review full scope                           |
| Wrong/old attempt result                                      | Current attempt does not permit this result                                   | Refresh attempt/history; no rewrite                                                |
| Failure without full-return acknowledgement                   | Recording failure confirms all goods physically back in warehouse             | Await full return and acknowledge; no false custody                                |
| Blank failure reason                                          | Name reason field; require specific entered/chosen reason                     | Field error, retain other input; no default                                        |
| Failed dispatch without retry                                 | Returned failed delivery must first return to ready                           | Retry, review ready scope, then dispatch                                           |
| Invalid actual delivery date/time or optional retry date      | Name field; valid unambiguous actual time or calendar retry date required     | Correct value; retry date can be cleared; no fallback                              |
| Excess reason/note or captured text                           | Name field/allowed maximum, including 4000 for reasons/notes                  | Shorten without truncation; retain draft/state                                     |
| Denied/changed authority                                      | Warehouse action/data unavailable under current access; no private facts      | Existing sign-in/access flow or administrator; no write                            |
| Missing/inaccessible order                                    | Requested order cannot be opened                                              | Authorized queue; no fallback order                                                |
| Failed queue/detail/history read                              | Name failed view and offer retry                                              | Distinguish retained data/failed refresh from actual empty                         |
| Known failed save/unexpected response/server failure          | Name failed action and safe recovery/reference; do not guess cause            | Retain safe input, no success; reconcile uncertain result first                    |
| Lost reply/unknown outcome                                    | Operation result not yet confirmed                                            | Observe original result/current work before another intent; do not assume rollback |

### Key Entities

- **Physical receipt**: One accepted piece's initial arrival acknowledgement/actor/time, separate from quality handoff and later delivery returns.
- **Receipt group**: Exact pieces arriving together with optional carton/location/note capture, retained independently of other arrivals/quality packing.
- **Order reconciliation**: Derived counts, completion, custody and readiness, not a separate quantity authority.
- **Whole-order scope**: Reviewed orders and every noncancelled piece affected, even when initiated from fewer rows.
- **Delivery attempt**: One full-order dispatch/scope, handoff details, current state, receipt or returned failure, recipient/date/notes and actors/times; repeated attempts remain distinct.
- **Retry record**: Explicit failed-returned → ready action/date/notes, retaining failure without claiming dispatch.
- **Delivery contacts/activity**: Minimal submitted name/phone/address and safe operation history, not customer-master access, official paper or finance.

## Verification Requirements

- **VR-001**: Create/extend discovered automated tests for retained reads, seven-type/search filters, matching counts/pagination, grouped/flat membership, aliases, identity failures, history and no fallback. Verify warehouse-participation scope, denial for upstream-only orders, safe companion locations within a permitted order, incomplete membership before first receipt, order/piece count scope and allowed overlap.
- **VR-002**: Prove actual P06 acceptance → incoming → partial receipt, separate groups/optional data, retained packing, receipt once, unchanged companions and second-session reload. Include ordinary pieces with no issue/correction history.
- **VR-003**: Prove count arithmetic, cancellation once, zero-active exclusion, exact readiness, 199/200 incomplete/no false 100%, dispatched/failed/delivered exclusions and matching shared tracking without paid/snapshot changes.
- **VR-004**: Prove row expansion/full-order review, unsent cancel, complete dispatch/receipt, captured handoff/recipient/date/notes, valid/invalid optional dates and no defaults. Deny premature/partial/old-attempt/bypass actions from all reached paths.
- **VR-005**: Prove required full-return acknowledgement/reason, custody without another receipt, retry with/without date/notes, explicit ready step and repeated attempts through success, retaining each outcome.
- **VR-006**: Real isolated migrated persistence/protected HTTP must prove current authority/revocation, minimal contacts, excluded finance/email/unrelated data, rejected authority input and unchanged denied state. Preserve manufacturing privacy/print roles. If storage changes, verify fresh/populated migration and retained data.
- **VR-007**: Controlled races must prove receipt/receipt, last receipt/dispatch/cancellation where upstream permits cancellation, dispatch/dispatch, success/failure, retry/retry and revocation. One invalid member and an induced required-save failure after earlier selected work must leave the whole batch unchanged. Same/changed/different intent and unknown recovery cannot duplicate groups/counts/attempts/activity.
- **VR-008**: Rendered interaction must prove scope/return review, optional capture, Arabic field/action recovery, truthful async states, pending/double-submit, dirty retention, stale review, cancel, closed-dialog recovery, synchronized views and late-context protection. Doubles stay outside the claimed boundary.
- **VR-009**: Extend real-stack browser journeys across warehouse queues/detail/aliases for separate arrivals → ready → full dispatch → success, and returned failure → retry → redispatch → success. Verify captured fields/attempts after reload/another operator, denied direct access, batch/group/flat semantics, wide/narrow RTL, keyboard/focus and safe paper. Local warehouse state is not receipt evidence.
- **VR-010**: Complete/review/test the full P07 backend before dependent frontend wiring. Preserve P01–P06 identity/customer/draft/catalog/submission/paid/approval/print/manufacturing/quality regressions. PLAN/TASKS names exact later tests/commands; requirements and engineering need separate verdicts.
- **Documentation-only scope**: This SPECIFY invocation performs template/selection, decision/example, source-reference, link/format and write-boundary checks. No application test, migration, warehouse action, activation or deployment is performed.

## Success Criteria _(mandatory)_

- **SC-001**: Two authorized sessions see matching warehouse membership, filtered counts, piece locations, receipt groups and full attempt history after reload; aliases reach the specified real views.
- **SC-002**: Receiving P1 from P1/P2 incoming preserves P2/upstream P3, records one receipt and entered arrival values. Repetition/delivery return never increases initial received count; later arrivals never overwrite earlier capture/P06 packing.
- **SC-003**: Only positive fully received eligible orders are ready. Two of three and 199 of 200 stay incomplete/undispatchable; all-cancelled is non-deliverable. Shared progress never claims full receipt before equality.
- **SC-004**: One selected row of a ready two-piece order visibly reviews both before dispatch. Cancel writes nothing; dispatch/customer receipt affects all active pieces once, retains supplied data and creates no partial delivery.
- **SC-005**: Failure retains specific reason and acknowledged full return for the current attempt. Optional-date retry restores ready without dispatch. Redispatch/success preserves both attempts, custody/evidence and initial receipt/upstream terms/history.
- **SC-006**: Every batch commits its entire reviewed scope or changes nothing, including a stale member and induced save failure. Replays/races/changed intent/unknown recovery produce no duplicate or incompatible effects.
- **SC-007**: Warehouse employees receive approved submitted delivery contacts and safe context only. Denied direct access discloses no forbidden data/changes no state; manufacturing privacy, sales ownership and print permissions remain.
- **SC-008**: Existing Arabic/RTL/Cairo surfaces retain accessible wide/narrow interaction. Errors retain safe input/recovery; unknown results reconcile, stale scopes require review and late replies cannot confirm another context.

## Assumptions and Decisions

- **D-001 — Scope/evidence**: [Root P07](../../plan.md#p07--physical-warehouse-receipt-and-whole-order-delivery), [phase delivery](../../docs/workflow/phase-delivery.md), [constitution](../../.specify/memory/constitution.md) and [handoff](../../docs/workflow/implementation-handoff.md) govern SPECIFY only. [P06's ledger](../006-quality-packing-reinspection/tasks.md) records prior local acceptance, not fresh tests here. Root owner-review/client/release status is unchanged.
- **D-002 — Whole-order review, owner confirmed 2026-11-13**: The owner chose expansion to every active piece in each affected order with full scope shown before confirmation. FR-011–014 apply this explicit review rather than requiring every row initially selected or silently expanding. Use existing confirmations; partial delivery is excluded.
- **D-003 — Entire-batch rejection, owner confirmed 2026-11-13**: The owner chose saving nothing and refreshing/reviewing selection when any member is stale, duplicated or ineligible. This applies to every P07 receipt/whole-order operation and required effects across orders. It is confirmed independently of P06's similar policy.
- **D-004 — Minimal contacts, owner confirmed 2026-11-13**: The owner chose submitted name, phone and delivery address for authorized warehouse delivery, excluding email, finance and unrelated history. FR-004 is a P07-specific projection; do not widen [P04](../004-approval-reapproval-printing/spec.md) FR-025 manufacturing output/P05/P06, customer-master access or print roles. Snapshots remain frozen; later administrative corrections follow their owning phase.
- **D-005 — Existing optional capture/bounds**: Reached receipt captures carton text/location/note; dispatch captures optional delivery note despite its misnamed representative callback; confirmation captures recipient/date-time/notes; failure captures required reason/details; retry captures optional date/notes. Preserve supplied values without inventing mandatory carton/location/courier/recipient/date fields. Optional capture is honest, supplied dates valid, business reasons/notes bounded at 4000. PLAN settles finite capture bounds/date presentation within existing surfaces, not carton inventory policy.
- **D-006 — Earlier requirements**: [P03](../003-catalog-pricing-submission/spec.md) D-002 confirms numbering despite the older root pending row. [P04](../004-approval-reapproval-printing/spec.md) owns cancellation/terms/print, [P05](../005-cutting-production-workspaces/spec.md) manufacturing and [P06](../006-quality-packing-reinspection/spec.md) handoff/packing. Consume cancellation without new authority. Current activation/real-order evidence and OPS-01 remain separate gates.
- **D-007 — Observed defects**: Warehouse callers discard receipt/recipient/date/notes, use fixture actors, display phone as address, shortcut failed-to-dispatch and can update both piece/segment receipt. These are P07 corrections, not precedents. Current shared completion rounds 199/200 to 100%; FR-009 requires truthful full-completion presentation/exact readiness. PLAN resolves source owners/drift without redesign.
- **D-008 — Language/clocks**: Conversation/artifacts are English; UI stays Arabic/RTL/Cairo and entered/catalog text retains its language. Server action times, actual supplied delivery evidence and date-only retries differ. No computer/host timezone, fixed demo date, assumed recipient or unverified historical value establishes business truth.

## Phase Exit

P07 implementation acceptance requires FR-001–027, VR-001–010 and SC-001–008, owner-confirmed D-002–004, separate requirements/engineering reviews and real backend/frontend/browser evidence for every retained warehouse route/reached operation. Full backend acceptance precedes dependent UI wiring. Upstream acceptance/local warehouse tests alone are insufficient.

Verify P06 handoff → partial physical arrivals → exact readiness → whole-order delivery and returned failure/retry, retaining values/attempts/actors and unchanged upstream terms/history. Required failures/concurrency/replays preserve whole-batch integrity. Production activation, P08/OPS-01, deployment and release remain separate.

Built-in specification quality review: **READY FOR PLAN**, separately requested. Design, bounded task briefs, implementation and executed P07 acceptance are later outputs. This command neither changes the protected roadmap nor starts the next command.
