# Feature Specification: Shared Customers and Persistent Incomplete Sales Drafts

**Roadmap Phase**: P02 — Shared customers and persistent incomplete sales drafts  
**Feature Directory**: `specs/002-shared-customers-drafts`  
**Feature Branch**: `main` at intake; feature numbering is independent of the Git branch  
**Created**: 2026-11-05  
**Status**: Draft — product specification; no implementation or phase acceptance claimed  
**Input**: SPECIFY P02 only, read root plan.md and phase-delivery.md, and reuse a matching accepted feature if present. The owner additionally confirmed that the site and customer phone numbers are Saudi-only and delegated the appropriate normalization choice.

## Scope and Baseline

- **Outcome**: Authorized sales staff manage shared customers and save/reopen their own incomplete drafts across sessions. A shared customer does not grant access to another salesperson's orders or measurements.
- **Selection**: No P02 feature existed at intake. `001-staff-access-accounts` belongs to P01 and is preserved. This is one new P02 feature; the root roadmap and its owner-review status remain unchanged.
- **Current evidence**: Intake revision `b286d4e`, clean working tree. Current persistence/routing includes accounts, staff decisions and initial administrator provisioning, but no operational customer/order domain. Customer/draft screens still use browser-local operational state. Customer detail can fall back to the first customer, inline creation does not reliably link the returned record, and draft save wrongly requires submission-like fields. These are observed limitations, not accepted behavior.
- **Deliverables**: Shared customer list/search/detail/create/update; normalized phone uniqueness; inline customer creation/selection; stable customer/draft/piece identity; manual incomplete-draft save/load/edit/list and piece add/duplicate/remove; scoped related reads/counts; concurrent-edit protection; real actor/time and retained change evidence; truthful failure and unavailable-submission states.
- **Dependencies**: Reuse P01 identity, current eligibility, departments and ADMIN authority. The P01 task record reports local acceptance on 2026-11-04; this is inspected historical evidence, not a fresh test run. PLAN verifies prerequisite interfaces/evidence before dependent execution. The root roadmap's historical “not started” summary is not current source evidence and is not rewritten here.
- **Existing foundations**: Preserve authentication/account/session safeguards, shared validation/errors, credentialed transport, shared server-state integration and isolated test infrastructure. Architecture, exact interfaces and persistence design belong to PLAN.
- **Frontend boundary**: Preserve existing Arabic/RTL/Cairo customer screens/dialogs, create/edit paper, draft views and reached draft reads. Preserve searchable cells/portal menus, measurements, adjustment fields, lower paper area, row actions and read-only financial controls. Only necessary functional wiring/feedback is included.
- **Exclusions**: P03 catalog activation/quotes/final validation/numbering/submission/snapshots/full sales read models; P04–P08 lifecycle/official printing/reporting/release work; customer merge/deletion, whole-draft deletion, autosave, bulk imports, new screens, redesign and employee assignment workflows. No browser-fixture import, application implementation, commit, push or deployment is authorized here.
- **Client gates**: CAT-01 mapping/control kinds and PRC-01 decoration-only rates are confirmed; CAT-02 values are received but activation remains P03 work. NUM-01 still gates real business numbering; OPS-01 gates release. None prevents P02 draft save. P02 may complete with submission explicitly unavailable.
- **Open decisions**: None at the product-specification stage after the Saudi-only answer and decisions below. Technical bounds, algorithms and interfaces remain PLAN outputs and cannot change these product rules.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Maintain shared customer data (Priority: P1)

An active salesperson finds, creates and updates shared basic customer data so colleagues reuse the same customer.

**Why this priority**: Stable shared customer identity is needed before linking drafts.

**Independent Test**: Two eligible sales accounts discover the same saved customer; only name and valid Saudi phone are required.

**Acceptance Scenarios**:

1. **Given** no matching phone, **When** sales creates a customer without email/address/notes, **Then** one customer is confirmed and visible to both sales accounts.
2. **Given** an existing normalized phone, **When** another create or phone-changing edit claims it, **Then** a visible duplicate result identifies the shared record without creating, merging or overwriting data.
3. **Given** a customer linked to a draft, **When** its contact data/phone changes, **Then** the same customer identity and draft relation remain; a stale edit changes nothing.
4. **Given** a name, phone or email query, **When** search resolves, **Then** matching shared customers appear, including case-insensitive email matches; an unmatched query or unknown phone URL shows an honest empty/missing state without a first-customer fallback.

### User Story 2 — Create a customer inside the paper form (Priority: P1)

The draft editor creates a customer inline and continues without losing the paper or inferring identity from typed text.

**Why this priority**: The existing create-and-link workflow must use the actual saved record.

**Independent Test**: Create a customer inline from a partially filled paper; the returned record is selected and all paper input remains.

**Acceptance Scenarios**:

1. **Given** a partial unsaved paper, **When** inline creation succeeds, **Then** the actual confirmed customer is selected in that form. Its link persists with the next explicit draft save; customer creation alone does not silently save the paper.
2. **Given** an unsent dialog, **When** it is cancelled, **Then** no customer/draft write occurs and the prior selection/paper remain.
3. **Given** duplicate, validation or service failure, **When** inline creation fails, **Then** dialog/paper input and previous selection remain. Selecting an existing duplicate customer requires an explicit choice.
4. **Given** a pending write, **When** the user repeats it or leaves the dialog, **Then** pending/unknown status stays truthful; closing cannot imply rollback or apply a late result to another form/account.

### User Story 3 — Resume incomplete work across sessions (Priority: P1)

A salesperson saves available work without a customer, catalog activation or complete specifications, then resumes later.

**Why this priority**: This is P02's central value before submission exists.

**Independent Test**: Save a known type with one blank row and no customer/date/specifications; relogin in another session and compare saved values/identities.

**Acceptance Scenarios**:

1. **Given** one blank row and a known type, **When** the owner saves without customer/specifications/date, **Then** a durable draft receives stable identity, actual owner/time and no approved business number.
2. **Given** a saved partial draft, **When** the owner edits captured fields/customer/notes and saves, **Then** reopen restores the last confirmed data and retained piece IDs.
3. **Given** malformed supplied values or a nonexistent selected customer, **When** saving is attempted, **Then** validation/missing feedback appears, previous saved data remains intact and local input is retained.
4. **Given** failure or lost response, **When** persistence is unconfirmed, **Then** no saved-success claim or input discard occurs; observation/reconciliation and safe retry cannot duplicate the draft.

### User Story 4 — Maintain individual draft pieces (Priority: P1)

The draft owner adds, duplicates and removes paper rows while retained physical pieces keep stable identities.

**Why this priority**: Later lifecycle work depends on distinct pieces, not mutable display numbers.

**Independent Test**: Save two rows, duplicate the first, remove the second, save/reopen and compare identity, order and captured values.

**Acceptance Scenarios**:

1. **Given** a draft piece, **When** duplicated and saved, **Then** the copy retains editable specifications but has a distinct ID; no workflow/price authority is copied.
2. **Given** multiple pieces, **When** one is removed and saved, **Then** only that draft row is removed from the active paper; retained IDs survive display resequencing and removal remains traceable.
3. **Given** one remaining row, **When** removal is attempted, **Then** the existing one-row minimum is preserved, even if the row is blank.
4. **Given** a foreign piece or a draft that has left draft state, **When** a row write is attempted, **Then** it is denied without changing either resource.

### User Story 5 — Protect sales work inside a shared directory (Priority: P1)

Sales staff share contacts while orders, drafts, counts, measurements and activity stay owner-scoped. Eligible ADMIN has the agreed broader access.

**Why this priority**: Contact sharing must not leak another employee's work.

**Independent Test**: A and B link separate drafts to one customer; compare related reads/counts/direct resource access for A, B, ADMIN and non-sales staff.

**Acceptance Scenarios**:

1. **Given** A/B share a customer, **When** A opens it, **Then** A sees shared contacts and only A's related drafts, measurements, counts and latest-value summaries.
2. **Given** B's draft ID, **When** A reads/edits it directly, **Then** no B content/existence detail is leaked and neither draft changes.
3. **Given** eligible ADMIN, **When** existing customer/draft surfaces are used, **Then** broader reads/edits work while original ownership stays intact. New drafts belong to their authenticated creator; no create-for-another-employee workflow is introduced.
4. **Given** a wrong-department/ineligible user or a live suspension/department change, **When** a protected action occurs, **Then** current authority denies it and saved state remains unchanged.

### User Story 6 — Resolve conflicts and see submission readiness (Priority: P2)

Editors retain stale work for review and understand why unpriced drafts cannot yet be submitted.

**Why this priority**: Concurrent edits and absent P03 capabilities must not produce lost work or false financial claims.

**Independent Test**: Save one of two concurrent editors; reject the stale editor with input retained. Attempt submission while P03 is unavailable.

**Acceptance Scenarios**:

1. **Given** customer/draft revision R in two sessions, **When** one saves and the other saves R, **Then** the latter receives conflict, retains input and can explicitly reload/review; the winner is not overwritten.
2. **Given** dirty paper input, **When** background data refreshes, **Then** input is not silently replaced and newer customer data stays distinct from unsaved paper fields.
3. **Given** P02 without P03 acceptance, **When** prices/submission are reached, **Then** missing prices are unavailable, not zero/demo amounts; no submission/numbering occurs, readiness is explained and draft save still works.

### Concrete Acceptance Examples

All contacts/identifiers below are synthetic, not real customer data. A/B/ADMIN are distinct eligible accounts. “Same intent” is a retry of one action, not an intentional new draft.

| Requirement / scenario | Actor and starting state           | Concrete input / action                                                       | Expected observable result                                                                | State unchanged on failure               |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| FR-002–004 / US1.1     | A; empty directory                 | Name `عميل اختبار أ`; phone `0500000001`; omit optional fields                | One customer C; canonical phone `+966500000001`; optional data absent                     | No partial customer                      |
| FR-003–004 / US1.2     | C exists                           | Create with `٠٥٠ ٠٠٠-٠٠٠١`, `+966 50 000 0001`, `00966500000001`              | Equivalent phone; duplicate result, no extra C                                            | Existing C/selection unchanged           |
| FR-003                 | No matching customer               | Saudi fixed line `0112000001`                                                 | Accepted canonical `+966112000001`; same local/international equivalence                  | No malformed-number write                |
| FR-003                 | A edits a customer                 | Foreign `+201000000001`, short `05001`, letters or service short code         | Clear phone validation failure                                                            | Customer and links unchanged             |
| FR-002,004             | Two distinct phones                | Optional `shared@example.test` on both                                        | Two customers allowed; email warning cannot merge/block                                   | Existing customer unchanged              |
| FR-005–006             | C linked to A's draft              | Change phone to `0500000002`; reopen                                          | Same C/draft IDs and relation; updated contact                                            | All-or-nothing update                    |
| FR-005                 | C has optional contact data        | Omit fields in one edit; explicitly clear email with blank/null in another    | Omission retains; explicit clear removes email only                                       | Name/phone cannot be cleared             |
| FR-006–007             | Unknown customer route/prefill     | Open absent phone or type an unmatched name                                   | Missing/unresolved selection, no first-customer fallback                                  | No implicit create/select                |
| FR-008–009             | Unsaved paper has notes `تجربة`    | Create C inline; explicitly save paper later                                  | Actual C selected; notes/rows retained; link durable on paper save                        | Failed creation leaves prior selection   |
| FR-009                 | Unsent dialog open                 | Enter name/phone, then cancel                                                 | No write; surrounding paper retained                                                      | All persisted state unchanged            |
| FR-010–012             | A; new paper                       | `SHOP`; blank row; no customer/date/specs                                     | Durable draft D, actual owner/time, stable ID, no business number                         | No partial save                          |
| FR-012–014             | D has piece P                      | Capture `soleAddition=روضة - H`, `additions=ملاحظة`, M1 `نص أ`, A/F and notes | Separate provisional values restored with same P ID                                       | Rejected input preserves saved D         |
| FR-013–014             | D has no date/paid entry           | Save `2026-02-30` or paid `-1`/nonnumeric text                                | Validation failure, no invented amount/date                                               | Saved D and local input retained         |
| FR-013–014             | D; no quote                        | Save date `2026-11-20`, paid entry `100.50`                                   | Provisional input restored; no processed-payment/total/balance claim                      | Missing paid is not fabricated payment   |
| FR-015–016             | D has P1/P2                        | Duplicate P1 into P3; remove P2; save/reopen                                  | Distinct P1/P3 IDs, retained P1, resequenced display, one piece per row                   | Foreign/stale targets change nothing     |
| FR-017–019             | A/B own drafts linked to C         | A opens C and requests B's ID                                                 | Shared contact; only A's related records/counts/provisional sizes; direct B access denied | Both drafts unchanged                    |
| FR-019                 | A opened editor before suspension  | Save after suspension/department change                                       | Denied using current authority                                                            | Protected data/change evidence unchanged |
| FR-020                 | Two sessions edit C at R           | One saves `عنوان أ`; other saves `عنوان ب`                                    | One winner; stale conflict with losing input retained and reload/review                   | Winner not overwritten                   |
| FR-021–022             | Create/save commits; response lost | Reconcile and repeat same intent                                              | One durable effect and matching change evidence                                           | No duplicate C/D/piece/event             |
| FR-023–024             | P03 unavailable                    | Supply owner B, price `1`, number/status; try submit                          | Authority rejected; unpriced/readiness state; no submission                               | Ownership/workflow/pricing unchanged     |
| FR-025–027             | Dirty D; old response pending      | Refetch/change draft/account before reply                                     | Input stays in original form; no old data enters new account/resource                     | No navigation/cancel write               |

### Edge Cases

- Phone uniqueness covers concurrent creation and phone changes. Duplicate names yield multiple choices; typed search text is not confirmed customer selection.
- Changing phone frees the old phone for a different customer. Links follow identity; old phone URLs resolve a current exact match or missing state, not a permanent historical alias. Successful editing navigates to that customer's current URL.
- A valid absent customer differs from a supplied nonexistent customer. Clearing selection does not delete/edit the customer master.
- Blank rows/specifications are valid drafts. Unknown types, duplicate/foreign piece IDs and quantities other than one are invalid; P03 catalog membership/requiredness is not imposed here.
- Saving a stale editor cannot edit a submitted/otherwise locked order. Returned-order correction/resubmission belongs to P03/P04.
- Removing a draft row is not post-submission cancellation; no whole-draft/customer deletion or retention purge is introduced.
- Cancelling unsent dialogs or ordinary navigation performs no implicit save. Leaving a new unsaved paper creates nothing; last confirmed saves survive. Unsent edits have no cross-session recovery promise.
- Closing/cancelling after a command was sent cannot undo an unknown/committed effect. A known committed write with failed synchronization is reconciled without repeating creation.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: P02 operations MUST use authenticated server identity and current P01 authority, as defined by the authority table below.
- **FR-002**: Customer creation MUST require a trimmed nonblank name and valid Saudi contact phone. Address/email/notes are optional; supplied nonblank email must be valid. Email is neither unique nor a customer identity.
- **FR-003**: One Saudi phone policy MUST govern create/update/exact lookup/uniqueness/search/phone-route resolution. Accept valid ordinary Saudi mobile and fixed-line contacts in leading-zero local, `+966` and `00966` formats. Convert Arabic-Indic/Eastern Arabic-Indic digits to ASCII, remove formatting spaces/hyphens/parentheses, and compare/store canonical `+966` with the local trunk zero removed. Reject foreign numbers, malformed/repeated prefixes, incorrect lengths, letters/extensions and short service codes. Formatting does not prove ownership/reachability; no OTP workflow is introduced.
- **FR-004**: Phone uniqueness MUST survive concurrent creates/phone edits. Duplicate feedback MUST identify the accessible shared record for explicit selection, leaving existing data untouched; no silent phone/email merge is permitted.
- **FR-005**: Customer updates MUST preserve identity and reject stale edits. Omission retains existing values; blank/null explicitly clears optional values; name/phone cannot be cleared. Supplied changes succeed together or not at all.
- **FR-006**: Customer list/search/detail and existing phone URLs MUST resolve real saved records. Preserve name/phone/email search, including case-insensitive email matching, with bounded navigable results and matching counts. Unknown/unmatched routes/prefills MUST not select the first record. A phone change MUST not detach draft/order relations or rewrite later submitted contact snapshots.
- **FR-007**: Customer panels MUST separate shared contacts from scoped related drafts/orders, counts, provisional measurements and latest summaries. No demo history may substitute for P03 submitted data; draft measurements MUST not be labelled approved.
- **FR-008**: Inline success MUST select the actual confirmed saved customer in its originating form without losing input. The link persists on the next explicit successful draft save; inline creation MUST not implicitly save the paper.
- **FR-009**: Unsent cancellation MUST write nothing. Inline duplicate/validation/service failure MUST retain dialog/paper input and prior selection. Pending/uncertain writes MUST remain truthful, and late results MUST not alter another form/account.
- **FR-010**: Draft creation MUST assign immutable internal identity, authenticated creator/owner, known type, draft state and real creation/update time. Known types are `SHOP`, `EXTERNAL`, `REPAIR`, `GIFT`, `READY`, `ACCESSORY`, `ADJUSTMENT`; preserve the current `SHOP` initial selection. Technical references MUST be distinguishable from an approved business order number.
- **FR-011**: Manual draft save MUST accept no customer, blank/incomplete specifications, optional notes and absent promised-delivery date. Preserve at least one row, including an entirely blank row. Catalog activation, quotes, full paper completeness and business number MUST not be draft-save prerequisites.
- **FR-012**: Save/load/edit MUST round-trip captured model, size, base, decoration/color, M1/M2/M3/face, floor model/middle addition/color, final additions, A/F measurements and side notes independently. Keep `soleAddition` separate from `additions`; M1/M2/M3/face/final additions remain text. Type/customer/general notes/signature text and existing repair/adjustment fields where exposed MUST survive save/reopen. P02 captures provisional values; it neither activates demonstration options nor imposes P03 catalog completeness/membership.
- **FR-013**: Supplied promised-delivery dates MUST be real calendar dates, distinct from action timestamps; absent/cleared stays absent. Fresh drafts MUST not use fixed demo dates/year/names/signatures as facts. Captured signature text MUST not replace actual actor or certify approval.
- **FR-014**: The current optional paid-amount input MUST round-trip as a provisional nonnegative exact amount at its existing two-decimal input precision. Omitted/cleared means no captured entry; negative/invalid amounts fail without writes. Capture MUST not imply processed payment, invoice, approved balance or authoritative total; later payment/pricing behavior remains P03.
- **FR-015**: Add/duplicate/remove rows MUST preserve one physical piece per row, distinct stable identities for additions/copies, and retained IDs through save/reload/resequencing. Duplication copies editable captures only, not workflow/price authority. Explicit draft save persists row edits.
- **FR-016**: Remove MUST affect only the selected eligible draft piece, retain other identities and traceable removal evidence, and preserve the final-row restriction. It MUST not execute submitted-piece cancellation or erase history.
- **FR-017**: Sales draft/read/edit/list/activity and customer-related records/counts/measurements MUST be owner-scoped everywhere, including summaries/search. ADMIN has broader access; sharing a customer MUST not widen order rights.
- **FR-018**: Drafts and the draft portion of reached own-order/detail/dashboard/activity/customer panels MUST show actual saved records, supported filters, consistent counts and bounded navigable results. Later-phase portions remain with their owners; converted P02 reads MUST not mix fixtures into results or turn failure into empty success.
- **FR-019**: Current eligibility/department/role, ownership, draft state and piece membership MUST be enforced at protected reads/writes, including direct requests/live authority changes. Client-selected identity or a valid-looking ID grants no permission. Denial MUST preserve protected data and avoid disclosing another salesperson's draft existence/content.
- **FR-020**: Stale customer/draft saves MUST visibly conflict, preserve the winning record and retain losing local input with explicit reload/review before resaving. Silent last-write-wins or dirty-input replacement is prohibited.
- **FR-021**: Repeating one create/save/row-change intent through double activation, replay or lost reply MUST not duplicate customers/drafts/pieces/events. Unknown outcomes MUST support observation/reconciliation before another effect. Intentional separate new drafts remain possible.
- **FR-022**: Confirmed changes MUST retain actual actor ID/name at action time, department/ADMIN context, affected stable customer/draft/piece references, server time and relevant prior/new values/reason/notes. Change and its evidence succeed together; rejection/conflict/failure MUST leave no partial change or false success event. Replays MUST not duplicate evidence.
- **FR-023**: Attempts to set privileged/derived owner/actor/time/business-number/workflow/approval/location/counter/authoritative-price/row-total/order-total/balance fields MUST be rejected. Paid/signature capture is only the explicit provisional input allowed above.
- **FR-024**: Until P03 catalog/quote/submission behavior and remaining gates pass, missing prices/totals MUST be unavailable, not demo/zero/free pricing. Existing financial/submission controls MUST explain readiness; direct and visible attempts MUST cause no real submission, number, snapshot, approval or manufacturing release, while draft save remains usable.
- **FR-025**: Reads/writes MUST distinguish loading, empty/missing, validation, denial, conflict, service/contract error, pending, unknown and confirmed success. Recoverable failure retains input and safe retry/reconciliation. Malformed successful responses MUST not become saved records or empty lists.
- **FR-026**: Success MUST reconcile current details/lists/selections/related counts/draft activity; incomplete synchronization remains visible without repeating a confirmed write. Refresh MUST retain dirty input; earlier account/resource replies MUST not populate the current view.
- **FR-027**: Integration MUST preserve existing routes/navigation, Arabic/RTL/Cairo presentation, paper/control kinds, row order and lower-area layout. Necessary feedback must be readable/keyboard accessible, associated with relevant inputs/actions and retain dialog focus behavior on narrow/wide surfaces. No redesign/replacement paper/new management workflow is authorized.

### Authority and Data Rules

| Operation                                                                            | Active sales                        | Eligible ADMIN                                                 | Other/anonymous/ineligible |
| ------------------------------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------- | -------------------------- |
| Shared customer list/search/detail/create/update                                     | All shared customers                | All shared customers through retained surfaces                 | Denied                     |
| Create draft through existing sales form                                             | Authenticated creator becomes owner | Authenticated creator becomes owner; no employee impersonation | Denied                     |
| Draft/piece/activity read and editable-draft write                                   | Own only                            | Broader access; original owner retained                        | Denied                     |
| Customer-linked records/measurements/counts                                          | Own records only                    | Broader records                                                | Denied                     |
| Set derived authority, submit, officially print or run later transitions through P02 | Denied                              | Denied through P02; later commands required                    | Denied                     |

- Mutable phone/name/display row numbers are not stable relationship identities. No customer/whole-draft deletion, history purge or browser import is introduced. Row removal retains change evidence.
- Draft captures are editable/provisional; later submitted snapshots remain independent of customer-master changes. P02 does not invent submitted production records to demonstrate P03.
- Search/list/count/history work must be bounded and consistently scoped. PLAN sets explicit request/string/collection safety bounds and stable list behavior from repository conventions without inventing commercial capacity quotas or catalog values. Invalid over-limit input fails safely with saved data unchanged.
- No payment, email, phone verification, catalog activation or external-provider side effect is part of draft save.

### Frontend and State Requirements

| Existing surface                                                                                        | P02 responsibility                                                                                  |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/sales/customers`, `/sales/customers/new`, `/sales/customers/[phone]`, `/sales/customers/[phone]/edit` | Shared customer management; own related records/counts; missing/duplicate/conflict/error feedback   |
| `/admin/customers`, `/admin/customers/[phone]`                                                          | Same customer truth with broader reads; reuse reached actions without adding an admin editor        |
| Inline customer dialog in sales create/edit paper                                                       | Actual confirmed customer selection; no unsent-cancel write; retained paper                         |
| `/sales/orders/new`, `/sales/orders/[orderId]/edit` and existing edit/prefill query entry               | Incomplete draft/row editing; exact selection/resource resolution; unavailable pricing/submission   |
| `/sales/orders/drafts` and draft data in existing order/detail/dashboard/activity/customer panels       | Real scoped draft data/provisional measurements; later-phase portions explicit, no fixture fallback |

Manual save is the persistence boundary. Unsent changes remain in their current form; ordinary cancel/navigation discards them without writing, leaving the last confirmed version available. Dialog cancel retains the surrounding paper. Pending saves prevent conflicting/double submits; an old result cannot reset newer input. Conflict offers explicit reload/review without automatic merge. Account changes hide earlier private data. Technical form/cache/reset choices belong to PLAN.

### Key Entities

- **Shared Customer**: Stable identity; name; canonical unique Saudi phone; optional email/address/notes; edit revision and real timestamps. Shared contacts grant no order rights.
- **Sales Draft**: Stable identity; authenticated owner; known type; draft state; optional customer; captured notes/date/signature/paid entry; ordered pieces; edit revision and timestamps. No approved business number/submitted pricing.
- **Draft Piece**: Stable identity belonging to one draft; one physical row; mutable display position; optional captured specification/measurement fields. Copies gain new identity.
- **Retained Change Evidence**: Confirmed change with actual actor/context/time, affected identities, relevant before/after values and operation reference; scoped with its resource. No generic workflow/event platform is implied.

## Verification Requirements

These require later implementation evidence, not tests executed by SPECIFY. PLAN chooses actual test owners/commands; TASKS supplies discovered automated test work and bounded briefs.

- **VR-001**: Cover customer requiredness, Saudi local/international/Arabic-digit equivalence, phone versus email uniqueness, omission/null/blank, known types, incomplete fields, malformed date/money, unsupported authority, safe missing and malformed-result outcomes.
- **VR-002**: Real migrated isolated persistence and actual HTTP authority must prove concurrent phone claims, stable phone-change links, incomplete save/reload, piece identity/removal, owner isolation/ADMIN/live denials, stale/replayed/unknown actions and atomic change/history rollback. Inspect final state, not only responses. Preserve existing P01 accounts/history and auth regressions; use no unrelated database/reset/seed.
- **VR-003**: Actual form/state interaction must prove inline returned selection/cancel, retained input, pending/double activation, missing/duplicate/conflict/denied/error/retry, unavailable prices/submission, current lists/counts, dirty refresh and late replies/account switches. Doubles stay outside the claimed boundary; they do not prove persistence.
- **VR-004**: Extend the owned real-stack browser harness across two sales sessions and ADMIN on retained routes: shared discovery/private denial, incomplete save/relogin/reopen, fields/pieces, contact edit, inline cancel/error, submission readiness and narrow/wide RTL/keyboard/dialog behavior. Do not invent another browser platform.
- **VR-005**: Required backend behavior/evidence and both requirements/engineering review must pass before dependent frontend wiring. Whole-phase acceptance also requires integrated frontend/browser evidence, not only source inspection or unit tests.
- **Documentation-only command scope**: This SPECIFY run checks the filled spec, built-in quality checklist, references, selection, formatting and diff boundaries. It performs no application tests, implementation, migration, catalog loading or deployment.

## Success Criteria _(mandatory)_

- **SC-001**: Two eligible sales sessions find one confirmed customer through equivalent Saudi phone formats; concurrent duplicate attempts leave exactly one customer, while different phones can share email.
- **SC-002**: A known-type draft with one blank row and no customer/specifications/date saves and reopens after relogin/another session with identical saved fields and draft/piece IDs.
- **SC-003**: Add/duplicate/remove then save/reopen preserves copied fields, retained IDs, visible order, one piece per row and change evidence without duplicate effects or removing the final row.
- **SC-004**: With two sales owners sharing one customer, all tested direct/list/detail/count/history/measurement/activity/write paths expose/modify only allowed resources; ADMIN has broader scope and wrong-department/ineligible actors are denied.
- **SC-005**: Customer phone edits preserve links; unknown routes show missing state; inline success selects the saved customer without losing or implicitly saving the paper.
- **SC-006**: Rejected invalid/denied/stale writes leave saved state unchanged and retain local input. Failed/unknown outcomes retain input and reconcile to actual persisted state, including a possible committed write with a lost response. Safe retry/observation produces no duplicate effect or change evidence and no false success.
- **SC-007**: No demo/zero price becomes authoritative; P02 cannot issue real submission/number/approval/manufacturing release and explains readiness while permitting draft save.
- **SC-008**: Retained integrated screens/paper pass RTL, keyboard/dialog and narrow/wide acceptance with honest errors/states and no fixture fallback.

## Assumptions and Decisions

- **D-001 — Saudi-only (2026-11-05)**: The owner confirmed “أرقام التليفون هتبقى كلها في السعودية فقط ... الموقع ده هيشتغل في السعودية بس” and delegated the appropriate choice. FR-003 adopts national/international equivalence and mobile/fixed-line support. The national mobile/fixed examples and geographic codes were verified against the [CST numbering reference](https://www.cst.gov.sa/en/about/Numbering). Parser/library/metadata selection remains PLAN work. Format validity is not ownership/reachability evidence.
- **D-002 — Existing customer inputs**: Existing forms require name/phone and make email/address/notes optional; duplicate email warns. BR-05 makes phone unique. The local store's email-based merge is a defect, not a requirement.
- **D-003 — Capture versus authority**: P02 requires persistence of existing typed paper fields. Keep signature text and optional paid entry as provisional captures, separate from authenticated actor, approval and authoritative money. P03 owns quote/payment/submission. No demo date/name/price becomes factual data.
- **D-004 — Draft boundary**: Preserve existing one-row minimum, one piece per row, manual save and cancel navigation. No autosave/whole-draft deletion/unsaved-work recovery is inferred; only confirmed saves have a cross-session guarantee.
- **D-005 — Governing scope**: BR-03/05, BR-07/08 and P02/shared acceptance rules establish authority, ownership, actor/time and snapshot/price separation. SPECIFY is the only authorized stage. Preserve the [root roadmap](../../plan.md), [constitution](../../.specify/memory/constitution.md), [phase-delivery contract](../../docs/workflow/phase-delivery.md) and [handoff obligations](../../docs/workflow/implementation-handoff.md); this does not approve implementation or the wider roadmap.

## Phase Exit

P02 implementation is complete only when customer/draft deliverables, persistent authority/concurrency/history, existing frontend integration and browser acceptance satisfy FR-001–027, VR-001–005 and SC-001–008. Requirements and engineering reviews need separate supporting evidence. Missing infrastructure/prerequisite evidence leaves its gate open, without unrelated-database or fixture-success substitution.

SPECIFY completion means the product definition and built-in quality review are complete. PLAN/TASKS/ANALYZE/IMPLEMENT remain separately authorized stages. P03 submission/catalog/numbering and OPS-01 release remain outside this command and do not prevent P02 completion with submission explicitly unavailable.
