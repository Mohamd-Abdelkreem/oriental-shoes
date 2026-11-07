# Feature Specification: Approval, Piece Reapproval and Official Printing

**Roadmap Phase**: P04 — Approval, per-piece decisions, customer-contact reapproval, and official printing\
**Feature Directory**: `specs/004-approval-reapproval-printing`\
**Feature Branch**: `main` at intake; feature numbering is independent of the Git branch\
**Created**: 2026-11-06\
**Status**: Draft — product decisions complete; ready for technical planning, no implementation or phase acceptance claimed\
**Input**: Specify P04 only, read root `plan.md` and `docs/workflow/phase-delivery.md`, and reuse a matching accepted feature if present. The owner confirmed the contact allowlist, pending-review print block and nonaccepted-proposal disposition during this invocation.

## Scope and Baseline

- **Outcome**: Approvers decide submitted orders and individual manufacturing problems; owner sales submits customer-contact proposals or cancellation requests without bypassing piece reapproval; eligible staff obtain approved official paper.
- **Selection**: No P04 feature existed. Create one feature and select it instead of P03; preserve P01–P03 artifacts, IDs, decisions and progress.
- **Current evidence**: Intake revision `b9d2b3d`, branch `main`, clean tracked worktree. Current source composes real staff/customer/draft/catalog/submitted-order/sales-command behavior. Approval views and print decisions still use local MVP state. The return dialog uses preset reasons/fixed actor; customer-contact save resumes work directly and cancellation uses draft deletion. These are integration defects, not accepted behavior. The existing contact modal has no discovered caller; its queue/action must become reachable through existing sales surfaces.
- **Prerequisite evidence**: The inspected P03 task ledger records all 53 tasks complete and local phase reacceptance with persistent/HTTP and desktop/narrow browser evidence. This is reused recorded evidence, not fresh execution. Its controlled approved/returned fixtures do not prove live P04 commands. PLAN must reconcile current prerequisite interfaces/evidence before execution.
- **Deliverables**: Initial queues/counts/review/own history; approve/return; manufacturing issue-report boundary; individual A/B/C decisions; owner contact/proposal/cancellation-request handling; mandatory piece reapproval; retained cancellation/totals; official-paper permission/projections; factory-safe specifications; existing-surface integration and verification requirements.
- **Dependencies**: Reuse P01 identity/current department authority, P02 stable customer/order/piece and business-change foundations, and P03 submitted-order/customer/price/history/numbering/money behavior. P03 owns returned-order correction/resubmission and paid updates; P04 supplies actual decisions. P05/P06 later bind work/quality reporting controls to P04's issue boundary; their work/inspection transitions are excluded.
- **Client/release gates**: CAT-01/PRC-01 are confirmed; CAT-02 values were received. Actual accepted catalog/pricing/submission evidence must be reconciled, not imported again by this command. NUM-01 is confirmed by P03's explicit owner answer D-002: `TYPE-YYYY-NNNN`, shared sequence across types/years. That supersedes the older pending roadmap row for this feature without editing root `plan.md`. OPS-01 and production calendar/release confirmation remain separate gates.
- **Existing foundations**: Preserve auth/session safeguards, ownership, exact money, frozen contacts/prices, command reconciliation, validation/errors, retained history and isolated verification infrastructure. Architecture, executable contracts, persistence and query/form choices belong to PLAN.
- **Frontend boundary**: Preserve Arabic/RTL/Cairo, existing approval/sales routes and dialogs, source-language values, paper fields/measurement placement, tracking/tabs, both print aliases, browser Print/Save as PDF and A4 landscape/eight-row pagination. Necessary functional changes include free-text return reason, reapproval/request actions and reachable contact interaction; no new route/redesign is requested.
- **Exclusions**: P05 work controls, P06 inspection/packing/correction commands, P07 warehouse/delivery, P08 admin/reports/reopening/whole-order cancellation/release; assignment platform; repricing/discounts/tax/refunds/payment services; PDF service; catalog upload/management; demo imports; application implementation, commit/push/deployment and external messages.
- **Open decisions**: None after the explicit owner answers D-003–005. Prerequisite reconciliation, technical design, executed acceptance and release remain separate gates.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Review, return and approve an order (Priority: P1)

An eligible approver reviews submitted paper, releases its pieces or returns it to its owner with an actionable explanation.

**Why this priority**: One authoritative decision determines whether manufacturing may begin.

**Independent Test**: Return a valid P03 submission, correct/resubmit through P03, approve, then reload in another eligible session.

**Acceptance Scenarios**:

1. **Given** an awaiting-approval order, **When** its existing review surface opens, **Then** current paper/pieces, submission/return history and actions agree with pending queues/counts.
2. **Given** a current pending revision, **When** approval succeeds, **Then** one decision records actual actor/time and every active piece enters cutting for all seven types, including REPAIR and ADJUSTMENT.
3. **Given** a current pending revision, **When** returned with reason `Please confirm the requested size` and optional notes, **Then** owner sales sees them, no piece is released, and P03 correction/resubmission retains original number/frozen terms and awaits fresh approval.
4. **Given** blank reason, denied authority, stale state, competing approve/return or failed write, **When** attempted, **Then** visible validation/denial/conflict/failure leaves no partial decision/release/history. Replaying a committed intent cannot release pieces twice.

### User Story 2 — Resolve one manufacturing problem (Priority: P1)

A current-department actor reports one affected piece; approval resolves that issue without stopping its companions.

**Why this priority**: Independent piece authority prevents order-wide disruption and establishes the P05/P06 reporting boundary.

**Independent Test**: In isolated downstream state, report P1 while P2 continues, exercise A/B/C in separate cases and reload all piece/history/financial results.

**Acceptance Scenarios**:

1. **Given** an eligible cutting/production/quality piece, **When** its authorized current department reports a nonblank reason and optional notes, **Then** a retained unresolved issue identifies piece/source state/department/reporter/time; only that piece stops for approval.
2. **Given** a current unresolved issue, **When** approval chooses A with instructions and cutting or production target, **Then** only that piece re-enters the selected department's ordinary workflow with traceable decision/target; other pieces retain work/state/terms.
3. **Given** that issue, **When** approval chooses B with contact instructions and a retained approver-selected resume target, **Then** only owner sales receives the contact action; the piece stays blocked and sales gains no factory-transition authority.
4. **Given** that issue, **When** approval confirms C with a reason, **Then** the piece is retained as cancelled and removed once from active quantity/total; actual paid and other pieces remain unchanged.
5. **Given** wrong department, foreign/noncurrent/cancelled piece, an existing unresolved issue or competing resolutions, **When** attempted, **Then** denial/conflict prevents duplicate issue, movement, cancellation or change evidence.

### User Story 3 — Contact the customer and request piece reapproval (Priority: P1)

Owner sales records contact notes and a proposed correction or cancellation request for the referred piece.

**Why this priority**: Customer agreement informs approval without independently resuming or cancelling factory work.

**Independent Test**: After a real B referral, submit notes and a model/size/base/floor proposal, reject it back to sales, resubmit and approve at the retained target; separately test approval cancellation.

**Acceptance Scenarios**:

1. **Given** an owner referral, **When** its modal opens from the existing sales workflow, **Then** exact piece/issue, frozen contacts, prior specifications, instructions and retained target appear with real options and no invented defaults.
2. **Given** valid notes and a permitted proposal, **When** explicitly submitted for review, **Then** proposal/prior values persist and the piece awaits approval; manufacturing cannot consume the proposal or resume. A notes-only response may confirm retaining existing specifications.
3. **Given** a cancellation request, **When** sales confirms sending it, **Then** approval receives a request without piece deletion/cancellation, total/paid change or work release.
4. **Given** a current proposal, **When** approval accepts, **Then** approved changes/decision become traceable together and only that piece resumes at the retained cutting/production target. Frozen prices/contacts and companion pieces remain unchanged.
5. **Given** approval does not accept a proposal, **When** it returns the piece to owner sales with a nonblank reason, **Then** that same piece/issue remains held for renewed contact, prior proposals/reasons remain traceable, companions continue and no earlier specification is automatically restored/released. Approval may instead confirm C, cancelling only that piece without applying the unapproved proposal.
6. **Given** another owner, missing notes, invalid/prohibited fields, stale referral or failure, **When** submitted, **Then** saved specifications/money/target/history remain unchanged and recoverable input remains available.
7. **Given** a referred piece, **When** sales proposes model/size/leather-base/floor changes, **Then** only those four existing fields may change; decoration, price, customer and every other specification remain fixed. Required model/size/base cannot be cleared; optional floor may be explicitly cleared. Original source labels and separate middle floor-addition/color values remain intact.

### User Story 4 — Retain cancellations and accurate money (Priority: P1)

Authorized staff distinguish active work, cancelled history, actual paid and customer surplus after a piece decision.

**Why this priority**: Cancellation cannot erase identity, double-deduct quantities or discard money evidence.

**Independent Test**: Start with frozen prices `1800.00`/`1500.00` and paid `2000.00`; cancel the second piece and compare retained counts/money/history.

**Acceptance Scenarios**:

1. **Given** that two-piece order, **When** P2 is cancelled, **Then** original/cancelled/active counts are 2/1/1, total `1800.00`, paid `2000.00`, due `0.00`, surplus `200.00`; no refund occurs.
2. **Given** committed cancellation, **When** repeated/concurrently attempted, **Then** no second deduction/change evidence occurs; identity/history remain.
3. **Given** all pieces become cancelled, **When** read, **Then** zero active pieces, retained reasons/history/paid and no deliverable 100%-completion claim appear.
4. **Given** direct sales cancellation, an ineligible/dispatched/delivered piece or failed write, **When** attempted, **Then** piece/quantities/money/history remain unchanged.

### User Story 5 — Print approved paper with correct permissions (Priority: P1)

Owner sales, approval and ADMIN obtain official approved paper; factory staff receive authorized manufacturing specifications without finance/private contacts.

**Why this priority**: Paper must reflect approval and preserve restricted data.

**Independent Test**: Exercise both aliases with eligible/denied actors, approved/unapproved/returned states and one/multiple pending piece reviews; check field parity and 1/8/9/17 eligible rows.

**Acceptance Scenarios**:

1. **Given** an approved eligible revision without a pending review, **When** owner sales/approval/ADMIN opens either alias, **Then** the same paper shows actual number/contacts/frozen prices/current money and real approval identity/time, without fabricated signature/seal.
2. **Given** draft/initially unapproved/returned revision, another salesperson or ineligible account, **When** direct print access is attempted, **Then** it is denied without exposing protected paper or printable false approval.
3. **Given** a current-department authorized factory reader, **When** specifications/history are read, **Then** permitted work instructions appear without unit/row prices, totals, paid/due/surplus, provenance, private contact details or raw financial change history at the authoritative boundary.
4. **Given** 1/8/9/17 eligible populated rows, **When** printed, **Then** eight-row pagination produces 1/1/2/3 A4 landscape pages with preserved Arabic/RTL values. Cancelled pieces stay in history, outside active paper rows; empty/padding rows create no piece/amount.
5. **Given** a pending piece proposal, **When** either official print alias is opened by any otherwise eligible role, **Then** official printing of the whole order is temporarily blocked with an explanation; no last-approved paper alternative is offered and companions keep manufacturing. Returning the proposal to sales does not clear the hold. Printing becomes available only when every pending piece review is resolved by approval or cancellation and current order eligibility is satisfied.

### Concrete Acceptance Examples

All identities, notes and issue states below are synthetic. Amounts reuse accepted P03 prices without a new currency/repricing rule.

| Requirement / scenario | Actor and starting state                                        | Concrete input / action                                                                        | Expected observable result                                                                                                          | State unchanged on failure                                           |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| FR-003–007 / US1       | Two-piece pending revision                                      | Approve; test each of seven types                                                              | One decision, P1/P2 at cutting, real actor/time                                                                                     | No partial release/history                                           |
| FR-005–006             | Pending revision                                                | Return `Please confirm the requested size`; optional notes omitted/null/blank                  | Reason retained, no invented notes; owner uses P03 correction/resubmit                                                              | Number/frozen terms/prior submissions retained                       |
| FR-005                 | Pending revision                                                | Missing/null/empty/space-only reason; separately exceed existing 4000-character reason bound   | Visible validation; no return/release                                                                                               | Pending state/history unchanged                                      |
| FR-007                 | Same revision in two sessions                                   | Race approve/return; lose winning response                                                     | One committed outcome; loser conflicts; observe original result                                                                     | No duplicate decision/release                                        |
| FR-008–010             | P1 in production; P2 continuing                                 | Current production worker reports `Required material unavailable`                              | One P1 issue with source/reporter/time; P2 continues                                                                                | Wrong-department report adds no issue/history                        |
| FR-011–012             | P1 unresolved issue                                             | A to cutting with instructions; separately B with contact notes and target production          | A resumes P1 at cutting; B holds it for owner, target retained                                                                      | P2 state/specifications/prices unchanged                             |
| FR-013–015             | P1 `1800.00`, P2 `1500.00`; paid `2000.00`                      | Approval cancels P2                                                                            | Counts 2/1/1; total `1800.00`, paid `2000.00`, due `0.00`, surplus `200.00`                                                         | Replay cannot deduct/refund again                                    |
| FR-015                 | Last active piece cancelled                                     | Reload progress/counts                                                                         | Zero active, retained evidence; no deliverable completion                                                                           | Paid/history retained                                                |
| FR-016–020             | P1 referred to owner, target production                         | Submit notes/permitted proposal; approver accepts                                              | Pending until acceptance; then only P1 resumes at retained target with old/new values                                               | Invalid/stale/failing action changes no saved terms                  |
| FR-018 / D-003         | P1 has model `SM`, size `40`, retained decoration/price         | Propose size `40.5`; separately attempt decoration or middle floor-addition change             | Size proposal may await approval; prohibited fields rejected, price unchanged                                                       | No saved proposal/specification/history from invalid intent          |
| FR-018                 | P1 required model/size/base and optional floor                  | Omit unchanged fields; explicitly clear floor; separately clear model                          | Omission preserves; valid floor clear awaits review; required clear rejected                                                        | Required values/frozen terms unchanged                               |
| FR-019–021 / D-005     | Proposed P1 size `40.5`, prior approved `40`, target production | Approval returns to sales with `Confirm size with customer`; owner resubmits; approval accepts | Same held piece/issue through return; proposal history retained; only positive approval activates `40.5` and releases to production | No automatic old-value restore/resume; companions unchanged          |
| FR-013,021–022         | Pending proposal/cancellation request                           | Approval confirms C; separately cancel its confirmation dialog                                 | Confirmed cancellation retains reason/money; unapproved values never applied; dialog cancel has no write                            | No cancellation or proposal application from cancelled/failed action |
| FR-018,022             | Owner's referred piece                                          | Request cancellation                                                                           | Request awaits approval; active total/paid unchanged                                                                                | No deletion/cancellation by sales                                    |
| FR-023–026             | Approved versus unapproved/returned/foreign order               | Open both print aliases as owner/approval/ADMIN/other owner/factory                            | Eligible aliases agree; wrong actors/revisions denied; factory safe projection                                                      | No private-field exposure or fake approval                           |
| FR-023–024 / D-004     | Approved order with P1/P2 pending review                        | Try both aliases; resolve P1; return P2 to sales; finally approve/cancel P2                    | Both blocked until all reviews resolved; no previous-version workaround; companions keep working                                    | No print eligibility from partial/failed resolution                  |
| FR-026                 | Approved 1/8/9/17 active rows plus cancelled/empty rows         | Preview/Print/Save as PDF                                                                      | 1/1/2/3 landscape pages; cancelled rows excluded                                                                                    | No fabricated business row/amount                                    |
| FR-027–029             | Dirty form; response lost or account changed                    | Observe original command/read; receive late reply                                              | Input retained, truthful uncertainty, one result, old-account reply suppressed                                                      | No implicit resubmit/cross-piece change                              |

### Edge Cases

- Mandatory reasons/notes reject absent/null/empty/whitespace-only input. Optional notes omitted/null/blank mean no extra note, never a fabricated explanation.
- Stable piece/order/issue identities, not row position or caller-selected actor/state, determine authority. One piece cannot have parallel unresolved cycles; subsequent legitimate issues retain earlier decisions.
- Suspension/department change, piece movement or another resolution between read/write invalidates stale authority/state without partial effects.
- Whole-order return/correction differs from post-approval piece referral. Piece review must not return the whole order to draft/returned, unlock companions or resend all pieces to cutting.
- Required proposed model/size/base cannot be cleared. Omitted allowed fields preserve prior values; an explicit valid floor clear removes it. Do not choose a first option or change any other specification field.
- New selections obey confirmed catalog membership/original labels; unchanged retained selections remain readable. No proposal updates customer master or first-submission prices/provenance.
- Notes-only responses and cancellation requests still require approval. Unsent cancel performs no write; closing during pending/unknown work does not establish rollback.
- Rejected proposals return to the same owner's contact workflow with instructions, held piece and retained target/history. A renewed notes-only proposal retaining original values can resume only after a positive approval; rejection never automatically restores/releases them.
- An order stays print-blocked while any submitted piece proposal/request remains in its reapproval/contact cycle. Resolving one of several reviews or returning one to sales cannot clear the other holds. No earlier-version print feature is added.
- Cancellation versus a paid update must preserve both current outcomes without lost money changes; P03 paid authority remains separate.
- Initial release always enters cutting. Later explicit issue correction to production is a decision for that piece, not a type shortcut. Quality rejection remains distinct from approval escalation.
- All-cancelled/empty output cannot create manufacturing pieces, prices or deliverable completion. Padding print rows never enter counts/history.
- Previously exported paper cannot be revoked. Future reads/print preparation enforce current authority/revision eligibility; switched accounts cannot display prior private paper as current.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Enforce current authenticated eligibility, department/ADMIN authority, ownership/resource relation and allowed state on all P04 operations. Approval/ADMIN may make scoped decisions; owner sales alone submits its contact response. Denied/ineligible actors receive no protected data or write.
- **FR-002**: Supply existing approval dashboard/pending/history/detail with consistent pending-order, unresolved-issue and reapproval counts, bounded filtering/search/pagination and piece tracking. Ordinary approver history shows its own actual decisions; authorized order context retains relevant other actors/revisions without an assignment platform.
- **FR-003**: Review MUST expose current revision/paper/retained contact-price terms/pieces and previous submissions/decisions. No demo identity/date/status or fabricated downstream event is authority.
- **FR-004**: Initial approval MUST retain one coherent decision and release every active piece to cutting for SHOP, EXTERNAL, REPAIR, GIFT, READY, ACCESSORY and ADJUSTMENT, without identity/term changes, skipped cutting or partial release.
- **FR-005**: Return MUST require a nonblank free-text reason within the existing 4000-character return-reason bound, retain optional extra notes, actual actor/time and no manufacturing release. Current reason/notes and previous decisions remain visible to owner sales/approval; no preset-only or fabricated reason.
- **FR-006**: Produce the current P04 return decision/proof consumed by P03 owner correction/resubmission. Preserve customer/type/number/piece membership/decorations/prices/contacts and earlier values/decisions under P03 FR-014–017. Resubmission awaits fresh approval; no returned-save/returned-to-draft workflow is added.
- **FR-007**: Decisions, issue reports, contact submissions and reapproval MUST each have one confirmed state/history outcome. Repeated accepted intent cannot duplicate effects; changed/stale/conflicting intent fails visibly. Concurrent approve/return cannot both succeed. Failed writes preserve complete prior state/history; unknown outcomes require observation/reconciliation before another effect.
- **FR-008**: Establish the issue-report boundary for later authorized current cutting/production/quality actions: exact stable piece, authoritative source state/department, actual reporter/time, required nonblank reason, optional notes and unresolved status. ADMIN cannot invent source department/state.
- **FR-009**: Reported issues MUST hold only the affected piece for approval, retain prior work/context and leave companions' locations/work/specifications/prices unchanged. One unresolved cycle per piece; later cycles retain earlier issue/decision history.
- **FR-010**: Eligible approval/ADMIN resolves a current issue using A/B/C with actual actor/time, meaningful instructions/notes or cancellation reason and target/before-after context. Missing mandatory text, unsupported target or stale/foreign/noncurrent issue fails without change.
- **FR-011**: A returns only the affected piece to explicitly selected cutting/production with retained instructions and decision history. P04 does not claim that department's receipt/start/completion/transfer occurred.
- **FR-012**: B refers only that piece to its owner sales with instructions, prior specifications and an explicit approver-selected cutting/production resume target. Retain target through communication/reapproval; sales cannot change it or resume work. Companions continue.
- **FR-013**: C requires explicit confirmation/nonblank reason, retains cancelled piece/history and removes it once from active requirement. Deny physical deletion, repeat cancellation effects and cancellation of dispatched/delivered pieces. P08 administrative cancellation scope remains separate.
- **FR-014**: Recalculate active total using exact frozen prices; preserve actual cumulative paid. Derive consistent original/cancelled/active/physically-received counts once per piece and distinct nonnegative due/surplus. No demo price, double cancellation deduction, paid clamp or refund/settlement.
- **FR-015**: Fully cancelled orders retain identities/decisions/paid/surplus with zero active pieces and no deliverable 100%-completion claim. Approval/cancellation cannot invent warehouse receipt/delivery/progress.
- **FR-016**: Existing sales surfaces MUST expose owner-scoped contact work and open the existing modal for the exact referred piece, showing issue/instructions/prior values/frozen contacts/target without cross-owner leakage. Do not replace it with whole-order return/correction.
- **FR-017**: Sales explicitly submits nonblank real contact notes with permitted proposal, notes-only response or cancellation request. Retain pending intent/prior-proposed values/actor/time; success means awaiting approval, not manufacturing resumed. Unsent cancel writes nothing; invalid/denied/stale/failed input preserves saved work and recoverable form input.
- **FR-018**: Contact corrections MUST allow only the existing four fields `model`, `size`, `leatherBase` and `sole`. Apply P03 membership/requiredness/captured bounds/original labels: model/size/base remain required; floor remains optional, unchanged omission preserves and explicit valid clearing removes it. Decoration, price/provenance, customer, middle floor addition/color and every other captured specification MUST remain unchanged. Reject prohibited fields, repricing, customer/piece replacement, identity/number/paid changes and companion edits.
- **FR-019**: Pending proposals remain separate from approved manufacturing specifications and cannot be executed. Approval reviews the exact current proposal/prior values/contact notes/target; another sales save cannot replace an approved decision or release work.
- **FR-020**: Proposal acceptance retains old/new values and actual decision identity/time together and resumes only that piece at its retained cutting/production target. Prices/customer snapshot/companions remain fixed; failed acceptance cannot partially change/release it.
- **FR-021**: When not accepting a proposal, approval MUST either return the same piece to owner sales with a nonblank reason/instructions or explicitly confirm C under FR-013–015. Returning keeps the issue/piece held, target fixed and previous proposals/reasons retained; owner may submit a fresh response for another review. Neither rejection nor return automatically restores/releases prior values. C never applies the unapproved proposal. Only positive acceptance under FR-020 resumes the piece.
- **FR-022**: Sales cancellation is a request, leaving active piece/counts/total/paid unchanged until approval executes C. Request review/execution reuses the same confirmation/reason/history/money rules; no draft-deletion or direct-sales bypass.
- **FR-023**: Only eligible owner sales/approval/ADMIN may obtain official paper after authoritative approval of the relevant revision. Drafts/initially unapproved/returned revisions are denied. Any submitted piece proposal/request awaiting reapproval blocks official printing of the whole order across all eligible roles and both aliases, including renewed contact after nonacceptance. Keep the block until all pending reviews resolve by acceptance/cancellation and current order eligibility is satisfied; companions continue work. Do not offer last-approved-version printing or print unapproved values. No fake seals/signatures.
- **FR-024**: `/orders/[orderId]/print` and `/print/order/[orderId]` MUST share authoritative eligibility/content. URL/local-role/cache changes cannot bypass ownership/revision permission. Read errors/denials cannot present stale/fixture paper as eligible.
- **FR-025**: Factory specification/paper/safe issue-history output MUST omit unit/row prices, totals, paid/due/surplus, price provenance, private phone/email/address and raw financial/revision snapshots before delivery. Reuse P03's factory-safe meaning with current department/resource authority; visual hiding alone is insufficient.
- **FR-026**: Preserve fields/source labels, floor-addition separation, measurement placement, one piece per row, eight eligible rows per page, A4 landscape and browser Print/Save as PDF. Exclude cancelled rows from active paper, retain history, omit empty rows when populated rows exist and never create business records from padding. Verify 1/8/9/17 eligible rows and truthful empty/all-cancelled handling.
- **FR-027**: Distinguish applicable loading/actual empty/background refresh/validation/pending/confirmed success/denied/missing/conflict/read failure-retry/unknown outcome. Success follows confirmed persistence; errors preserve safe context/input without fake empty/success/fixture fallback.
- **FR-028**: Confirmed actions synchronize affected queues/counts/details/history/piece state/money/print eligibility. Refresh cannot erase dirty input or silently rebase stale proposals. Late/account/resource-switched replies cannot expose private old data or confirm another piece's action. Unknown results remain observable after dialog closure.
- **FR-029**: Preserve Arabic/RTL/Cairo, responsive/accessible labels, keyboard/focus, confirmation/error patterns and navigation. Change preset-only reasons/fixed actors/direct-sales resume-delete/type shortcuts only within scope. PLAN maps reachable queue/reapproval actions to existing surfaces without a new screen.

### Authority and Data Rules

| Operation                                               | Eligible approval                           | Eligible owner sales        | Other sales             | Eligible ADMIN                                   | Factory/current department                        |
| ------------------------------------------------------- | ------------------------------------------- | --------------------------- | ----------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Initial review/approve/return; A/B/C; proposal decision | Current eligible state                      | No decision authority       | Denied                  | Same scoped decisions                            | Denied                                            |
| Approval history                                        | Own decisions plus authorized order context | Own order activity only     | No other-owner activity | Broader authorized context; no new P08 dashboard | Safe permitted work history                       |
| Contact response/request                                | Review, no impersonated response            | Own current referred piece  | Denied                  | No new on-behalf sales response                  | Denied                                            |
| Report issue                                            | No invented reporting department            | Denied                      | Denied                  | Actual current source rules apply                | Eligible current cutting/production/quality piece |
| Official paper                                          | Approved eligible revision                  | Own approved eligible order | Denied for other owner  | Approved eligible revision                       | No official financial paper                       |
| Manufacturing specification                             | Authorized context                          | Own permitted read          | No other-owner read     | Authorized context                               | Current authorized safe projection                |
| Cumulative paid                                         | No new authority                            | P03 separate command        | Denied for other owner  | P03 separate command                             | Denied                                            |

- Server-derived actual identity/context/time owns authority. Reject caller-selected actor/role/counters/approval/price/location/timestamps as authority.
- Retain stable order/piece/issue IDs, submissions/terms and issue/proposal/decision history. Cancellation is retained, not erasure; no history purge/event bus/workflow platform/version registry is introduced.
- Keep upstream 1–200-piece bounds, captured-field limits and exact two-decimal money meaning. Return/report/decision reasons, instructions, contact notes and optional decision notes use the existing 4000-character business-text bound. Mandatory text must contain nonwhitespace content; optional omitted/null/blank text means no extra note. Reject over-limit text without truncation or a write. PLAN records matching executable validation without inventing commercial limits.
- State/change evidence succeeds or fails together. Retry/conflict protection covers partial release, lost decisions, duplicate cancellation and orphaned history; disabled controls alone cannot enforce it.
- Contact proposals do not edit customer master or accepted specifications before approval. Staff contact notes do not prove a message/call was sent; external communication is outside this command.

### Frontend and State Requirements

| Existing surface                                                         | P04 responsibility                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Approval dashboard/pending/history/order detail and `/approval` redirect | Real queries/counts/own decisions/review/tracking, issue and piece-review actions                    |
| Return and A/B/C dialogs                                                 | Free-text reason, actual actor, explicit target/instructions, retained cancellation confirmation     |
| Sales dashboard/returned/detail surfaces and contact modal               | Preserve P03 correction; expose distinct owner contact/proposal/request without direct resume/delete |
| Both official-print aliases and paper                                    | Shared eligibility/content and preserved eight-row landscape output                                  |
| Factory specification/detail consumers                                   | Authoritative nonfinancial/private-safe data; later work/inspection wiring remains P05/P06           |

Unsent edits are local; cancel leaves saved records unchanged. Failures retain dirty text/selections and safe retry/review. Newer decisions require review before stale submission. Account/resource changes hide obsolete private content. Technical query/form/cache/error interfaces belong to PLAN.

### Key Entities

- **Submitted Order / Physical Piece**: Stable upstream owner/type/number/pieces, frozen terms, lifecycle and counts; no second quantity authority.
- **Approval / Return Decision**: Current revision, actual decision/reason/notes/actor/time, coherent release or current return proof, retained earlier decisions.
- **Manufacturing Issue / Cycle**: Affected piece/source/reporter/reason/time, unresolved/disposition, retained target and successive issue history.
- **Contact Response / Proposal**: Owner notes, prior/proposed fields or cancellation request, review state and issue/decision links; saved proposal is not approved specification.
- **Piece Decision / Cancellation**: A/B/C or proposal disposition, instructions/reason/actor/time/target and retained monetary context.
- **Official / Manufacturing Paper**: Eligible approved business projection versus authorized nonfinancial specifications; neither grants authority by itself.
- **Activity / Monetary Summary**: Retained changes, original/cancelled/active/received counts, exact active total/paid/due/surplus; no settlement action.

## Verification Requirements

These are future implementation obligations, not executed application checks. PLAN identifies current owners/design; TASKS supplies bounded briefs.

- **VR-001**: Automate approve/return/free-text/optional notes/all-seven-types cutting release, own history, current return proof/P03 resubmission, snapshot retention and query/count consistency. P04 real commands must replace labelled upstream decision fixtures for P04 acceptance.
- **VR-002**: Actual isolated migrated persistence and HTTP prove source/resource authority, one unresolved issue per piece, A/B/C/targets/isolation, later issue cycles, retained cancellation/counts/money/surplus/all-cancelled states and denied sales resume/cancel. Inspect full final state/history after denial and controlled dependent-write failure.
- **VR-003**: Controlled concurrency covers approve/return, report/resolve duplication, stale/changed proposals, acceptance/cancellation, cancellation/paid and authority changes. Unknown-response observation recovers one result without double effects/lost unrelated work.
- **VR-004**: Exercise exactly four allowed fields and rejected decoration/other fields, optional floor clear/required-field rejection, membership, notes-only/contact/cancellation requests, old/new values and mandatory review. Test return-to-sales → renewed proposal → approval, return → cancellation, cancellation confirmation cancel/failure and frozen target/terms/companions. No rejection automatically restores/resumes work.
- **VR-005**: Actual HTTP/projection evidence proves official-paper ownership/current approval, shared alias meaning, unapproved/returned denial, current authority and nested factory privacy. Test whole-order print blocking for one/multiple submitted piece proposals/requests, continued blocking after return to sales or partial resolution, and eligibility recovery only after all pending reviews resolve without previous-version bypass.
- **VR-006**: Real form/component/state interaction covers loading/empty/error/retry, dirty retention, text/target/confirmation, double activation, stale review, unknown observation, closed dialogs, late switched-account/resource responses and affected state reconciliation. Doubles stay outside the proved boundary.
- **VR-007**: Extend owned real-stack browser journeys on existing routes: return → P03 correction/resubmit → approval/cutting; each A/B/C; contact/proposal → review → retained target; companion continuity; request-only cancellation; reload/second-session persistence; permission denials; wide/narrow RTL/keyboard/focus/dialog; source-field parity and 1/8/9/17-row printing with cancelled/empty cases. Isolated downstream setup cannot be claimed as live P05/P06 manufacturing/inspection acceptance.
- **VR-008**: Required backend authority/data/queries/commands/failure behavior and separate requirements/engineering review precede dependent frontend wiring. Preserve account/customer/draft/catalog/submission/paid/command/migration regressions and owned infrastructure; no unrelated database/reset/import as a test fallback.
- **Documentation-only scope**: This invocation checks completeness/decisions, template/selection, references, Markdown formatting and preserved file boundaries. No application tests, migration, workbook loading, business action or deployment is executed.

## Success Criteria _(mandatory)_

- **SC-001**: Return reason reaches owner; permitted correction/resubmission retains terms/history; one approval releases all active pieces to cutting for all seven types after reload.
- **SC-002**: Each issue/A/B/C outcome affects only its selected piece, retains target/history and leaves companions' work/terms intact after reload.
- **SC-003**: Sales can propose only model/size/base/floor or request cancellation, without direct resume/cancel. Nonacceptance returns the held piece to owner contact or cancels through approval; only accepted proposals activate at the retained target. All cycles/old-new values remain traceable and frozen terms/companions remain unchanged.
- **SC-004**: Cancelling the `1500.00` piece from total `3300.00`, paid `2000.00`, yields total `1800.00`, unchanged paid, due `0.00`, surplus `200.00`, counts 2/1/1 once. Full cancellation retains evidence without deliverable completion/refund.
- **SC-005**: Denied/invalid/stale/competing actions leave protected losing effects unchanged; repeated/unknown committed intent resolves once without partial release, duplicate cancellation or lost paid change.
- **SC-006**: Both aliases agree for eligible owner/approval/ADMIN and deny initially unapproved/returned/foreign/ineligible paper. All roles are blocked while any submitted piece review remains pending, including return to sales; printing recovers only after all resolve, without blocking companion work. Factory output contains no forbidden finance/private values.
- **SC-007**: 1/8/9/17 eligible rows yield 1/1/2/3 landscape pages with retained fields/source-language/RTL, cancelled rows excluded and no business records from empty/padding rows.
- **SC-008**: Existing approval/sales surfaces agree with confirmed queues/counts/pieces/money/history after reload and retain truthful failure/retry/unknown/stale/account-switch outcomes without fake success/fixture fallback/privacy leak.

## Assumptions and Decisions

- **D-001 — Governing scope**: [Root P04](../../plan.md#p04--approval-per-piece-decisions-customer-contact-reapproval-and-official-printing), [phase delivery](../../docs/workflow/phase-delivery.md), [constitution](../../.specify/memory/constitution.md) and [handoff](../../docs/workflow/implementation-handoff.md) govern SPECIFY only. Root owner-review/release status remains unchanged; next-command suggestions grant no authority.
- **D-002 — Reused upstream decisions**: [P03 spec](../003-catalog-pricing-submission/spec.md) D-002 confirms numbering; D-003/FR-014–017 governs initial returned correction; FR-022–025 governs paid/surplus. Its factory-safe meaning remains intact. These do not settle P04's separate contact allowlist. The [P03 ledger](../003-catalog-pricing-submission/tasks.md) is reused recorded acceptance, not fresh execution.
- **D-003 — Contact field allowlist, owner confirmed 2026-11-06**: The owner selected the four existing fields only: model, size, leather base and floor, retaining decoration/price/customer. FR-018 fixes their exact existing keys and inherited validation, with all other specifications unchanged. No expanded field form or new decoration/repricing rule is approved.
- **D-004 — Pending-review printing, owner confirmed 2026-11-06**: The owner selected temporary whole-order official-print blocking until piece reapproval is resolved; companions continue manufacturing. FR-023 applies that hold across review/renewed-contact cycles and all pending pieces without a previous-version print alternative. This does not stop unrelated manufacturing.
- **D-005 — Nonaccepted proposal, owner confirmed 2026-11-06**: The owner selected return of the same piece to sales with reason or cancellation by approval, with no automatic resume. FR-021 retains current issue/target/proposal history across renewed contact. No automatic restore/release of prior specifications is approved; C uses the same confirmed retained-cancellation rules.
- **D-006 — Target and surface**: Root P04 requires retaining the selected target through reapproval. FR-012 makes it an explicit approver-selected cutting/production target on referral, not a sales choice or inferred source default. Minimal wiring of the existing target/modal is in scope. Root P04 already requests a sales queue/contact modal; its missing caller is an integration gap. PLAN names precise placement/callers on existing surfaces; a new route/redesign needs a separate scope decision.
- **D-007 — Frozen terms and paper parity**: First-submission prices/contacts remain frozen; no commercial override/refund/repricing is accepted. Existing printable-line filtering excludes cancelled rows and ignores empty rows when populated rows exist; retain eight-row pagination. Catalog language/codes are preserved while technical prose stays English.
- **D-008 — Evidence limits**: Current backend and recorded P03 acceptance are prerequisites, not proof of local approval/print authority. Isolated downstream states may verify P04 reporting; actual P05/P06 work/reporting UI and P07/P08/release remain separate. OPS-01 calendar is not inferred from the user's computer timezone.

## Phase Exit

P04 implementation acceptance requires FR-001–029, VR-001–008 and SC-001–008, separate requirements/engineering review and real persistent/backend/frontend/browser evidence. D-003–005 are accepted product decisions with concrete examples; PLAN must now resolve operation-specific technical design and handoff without changing those decisions. Backend acceptance precedes dependent UI wiring.

Real-order acceptance requires P03's actual accepted catalog/pricing/submission and confirmed numbering implementation, not contract/seed fixtures alone. P04 proves live return/resubmit/approval/contact/reapproval/official print; later phases/release remain separate. Preserve root roadmap, prior artifacts, foundation data and migrations.

SPECIFY completion means this product definition and built-in requirements-quality review are complete and **READY FOR PLAN**, separately requested. Future technical design, TASKS briefs and executed checks are later outputs; no PLAN/TASKS/IMPLEMENT, business action/import, commit/push/deployment is performed by this invocation.
