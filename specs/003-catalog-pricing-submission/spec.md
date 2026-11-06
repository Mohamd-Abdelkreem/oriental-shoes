# Feature Specification: Catalogs, Automatic Pricing, Submission and Sales Tracking

**Roadmap Phase**: P03 — Client-confirmed catalogs, automatic pricing, submission, and sales tracking  
**Feature Directory**: `specs/003-catalog-pricing-submission`  
**Feature Branch**: `main` at intake; feature numbering is independent of the Git branch  
**Created**: 2026-11-06  
**Status**: Draft — specification complete for technical planning; no implementation or phase acceptance claimed  
**Input**: Specify P03 only in English, read the root roadmap and phase-delivery contract, and reuse an accepted matching feature if present. The owner confirmed numbering scope, returned-order correction restrictions and initial paid-amount treatment during this invocation.

## Scope and Baseline

- **Outcome**: An eligible salesperson uses the existing paper to select confirmed catalog values, obtain automatic decoration prices, submit one complete order and follow its real details, pieces, totals and activity across sessions.
- **Selection**: No P03 feature existed at intake. This is one new feature. P01 `001-staff-access-accounts`, P02 `002-shared-customers-drafts`, their accepted artifacts and the protected root roadmap are preserved.
- **Current evidence**: Intake revision `665f794`, clean working tree. Current source includes staff authority, shared customers, persistent incomplete drafts, stable pieces and command receipts. Draft contracts/mapping explicitly return `P03_NOT_IMPLEMENTED` pricing and `P03_NOT_READY` submission. Submitted-order/catalog/pricing behavior is absent; returned-order and downstream operational views still contain local MVP behavior. Those views are integration targets, not persistent authority.
- **Deliverables**: Confirmed catalog loading/reads; decoration-only quotes; exact totals; first-submission customer/price snapshots; unique business display numbers; atomic submission and edit lock; restricted correction/resubmission; scoped sales dashboard/lists/details/activity/customer history/tracking; initial paid recording and post-approval cumulative paid updates; preserved paper/data presentation and meaningful verification requirements.
- **Dependencies**: Reuse P01 current identity/eligibility/department authority and P02 customer/draft/piece/command foundations. P02's final task ledger records local acceptance on November 6, 2026; that is inspected, reused evidence, not a fresh application test. PLAN must reconcile current prerequisite interfaces/evidence before dependent execution. P04 supplies actual approval/return decisions and official print eligibility; P05–P07 supply later manufacturing/receipt/delivery events. P03 defines/consumes their stable order/piece/history boundary without executing their commands.
- **Client gates**: CAT-01 mapping/control kinds and PRC-01 all 14 decoration rates are confirmed in the roadmap. CAT-02 values/source identity are received; loading/activation and real verification remain implementation work. NUM-01 format/sequence policy is now confirmed by D-002 below; allocation/testing are still unperformed. The root roadmap's older pending NUM-01 row is preserved and superseded for this selected feature by that explicit owner answer. OPS-01 remains a release prerequisite, including operational business-date timezone confirmation; no hosting/mail/bootstrap/backup decision is made here.
- **Source availability**: The Downloads path was absent during intake. The owner subsequently supplied the identical [repository-root reviewed workbook](../../أمر_تفصيل_الحذاء_الشرقي.xlsx), `أمر_تفصيل_الحذاء_الشرقي.xlsx`, on 2026-11-06: 33,191 bytes and the reviewed SHA-256 `88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b`. Read-only same-byte ZIP/XML inspection confirmed worksheet `القوائم`, extent `A1:AA942`, all 1,874 mapped options, all 14 exact label/rate pairs and the 152 formula-label caches. No formula recalculation, implemented loader preview, database loading/activation or submission has occurred. The root copy is the current operator input; source policy remains roadmap Section 4.
- **Existing foundations**: Preserve authentication/account/session safeguards, customer identity and Saudi-only phone policy, draft saves, command reconciliation, shared validation/errors, credentialed transport, server-state integration and the owned isolated test/browser infrastructure. Technical architecture/interfaces belong to PLAN.
- **Frontend boundary**: Preserve existing Arabic/RTL/Cairo routes, screens/dialogs, searchable paper cells/portal menus, field placement, adjustment/type sections, lower paper area, one piece per row, row actions, read-only finances, tabs/tracking and eight-row A4 landscape paper pagination. English specification prose does not authorize translating catalog data or product UI.
- **Exclusions**: P04 approval/return/issue decisions, customer-contact manufacturing-problem actions and official print permission wiring; P05–P07 work/quality/receipt/delivery commands; P08 administration/reports/release; redesign/new screens, workbook-upload or catalog-management pages, generic form/workflow engines, discounts/surcharges/tax, payment gateways/invoices/refunds, fixture imports, customer reassignment, submitted-piece add/remove/cancellation by sales, automatic repricing, commit/push/deployment and application implementation in this command.
- **Open product decisions**: None for this specification after D-002–004. Runtime catalog loading, prerequisite reconciliation, technical design, configured calendar validation and executed acceptance remain separate gates; they are not claimed complete.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Use the confirmed catalogs without changing the paper (Priority: P1)

Sales staff select the supplied values in the existing fields while free-text fields keep their current behavior.

**Why this priority**: Submission must use the client's actual catalog instead of demonstration choices.

**Independent Test**: With the reviewed catalog available, open/reload a draft, select representative source records and verify saved/read-only values, family grouping, measurements and field placement.

**Acceptance Scenarios**:

1. **Given** the reviewed values are available, **When** sales opens a selection, **Then** it contains the corresponding source range's evaluated values with original language, codes, punctuation, case and leading zeroes; formulas/headers/statistics are not selectable labels.
2. **Given** M1/M2/M3/face/final additions, **When** arbitrary valid text is saved and reopened, **Then** it remains text; the distinct middle floor addition retains its own selection and position.
3. **Given** missing catalog data or a failed read, **When** the form opens, **Then** unavailable/error/empty states are honest, prior draft input remains and no demonstration choices are substituted.
4. **Given** the recorded source asymmetries, **When** sales chooses decoration/color independently, **Then** supplied records remain available without invented matching-family restrictions, colors, decorations or prices.

### User Story 2 — Obtain an authoritative automatic price (Priority: P1)

Sales selects a decoration and sees its automatic price in the existing read-only amount cells.

**Why this priority**: Correct pricing and unavailable-price handling precede submission.

**Independent Test**: On an unsubmitted draft select records Z3, Z4 and Z12 and observe prices 1800, 1500 and 650 respectively; exercise every Z3:Z16/AA3:AA16 pair in automated acceptance.

**Acceptance Scenarios**:

1. **Given** an unsubmitted piece, **When** decoration changes, **Then** its current authoritative quote and order total reflect the same-row AA amount; changing model/size/base/color/floor/additions introduces no price modifier.
2. **Given** blank/unknown decoration or missing/non-numeric/conflicting rates, **When** a quote is requested, **Then** the price is unavailable with visible feedback, no zero/free-product fallback/manual override and no submission.
3. **Given** two successive decoration changes, **When** the older quote arrives last, **Then** it cannot price the newer selection or another piece/account; submission uses current authoritative data. If accepted quoted terms change before submission, the user sees a refresh/review conflict, retains input and explicitly retries after reviewing the fresh quote; no number/submission is issued on that conflict.
4. **Given** a price/total supplied by sales, **When** submitted as authoritative input, **Then** it is rejected without changing saved terms.

### User Story 3 — Submit one complete numbered order (Priority: P1)

The draft owner submits a valid paper once and receives a durable numbered order awaiting approval.

**Why this priority**: Atomic submission establishes the stable downstream business record.

**Independent Test**: With prerequisite authority/catalog gates satisfied, submit a complete two-piece draft, reload/relogin and compare identities, number, customer snapshot, frozen prices, totals, actor/time and activity.

**Acceptance Scenarios**:

1. **Given** a linked customer, known type and complete eligible pieces, **When** first submission succeeds, **Then** the existing draft/piece identities remain traceable, one unique business number is issued, customer/price snapshots and initial paid amount are retained, and the order awaits approval with sales specification edits locked.
2. **Given** incomplete/invalid paper, stale data, unavailable pricing/catalog, invalid current authority or a persistence failure, **When** submission is attempted, **Then** there is no partial submitted order, issued business number or submission history; saved draft and editable input remain available.
3. **Given** repeated/concurrent submission or a lost response after commit, **When** the same intent is observed/retried, **Then** one committed order/number/submission event is recovered without duplicate pieces or effects; changed/stale intent receives conflict and review feedback.
4. **Given** numbering has issued sequence 1 for SHOP in 2026 and sequence 2 for EXTERNAL in 2026, **When** the next accepted submission is SHOP in 2027, **Then** its number is `SHOP-2027-0003`, with no type/year reset.

### User Story 4 — Correct a returned order without rewriting its terms (Priority: P1)

The owner corrects an order returned by approval and explicitly resubmits it for another approval decision.

**Why this priority**: Returns must preserve agreed commercial terms and earlier decisions.

**Independent Test**: Starting with an authoritative P04 return decision, correct permitted fields, resubmit and compare original identities/number/customer/decoration/prices and every earlier submission/decision.

**Acceptance Scenarios**:

1. **Given** an order returned by P04 with a reason, **When** its owner corrects remaining nonprice specifications/notes/date and resubmits, **Then** the corrections, retained revision and awaiting-approval state persist together under its original number and frozen customer/price terms; prior values/decisions remain traceable. Editing before that explicit action is local, and ordinary cancel/navigation leaves the saved returned revision unchanged.
2. **Given** a returned order, **When** sales attempts customer replacement, decoration replacement, piece addition/removal/cancellation or price changes, **Then** the action is denied and original terms/pieces/history remain unchanged.
3. **Given** an order not currently returned or a stale correction, **When** sales attempts resubmission, **Then** visible denial/conflict occurs without bypassing approval or directly releasing manufacturing work.
4. **Given** later catalog/customer-master changes, **When** a retained order is corrected/read/resubmitted, **Then** its original contacts and prices are not silently refreshed or repriced; unchanged retained selections remain readable even if absent from a later catalog revision.

### User Story 5 — Follow real sales work without leaking another owner's orders (Priority: P1)

Sales staff follow their own dashboard, orders, returned queue, activity, customer history and individual pieces; ADMIN has the agreed broader reads.

**Why this priority**: Every retained sales surface needs consistent persistent truth and privacy.

**Independent Test**: Two sales owners share one customer; compare filtered lists/counts/details/measurements/activity and direct resource access for both owners, ADMIN and denied users.

**Acceptance Scenarios**:

1. **Given** saved/submitted records, **When** sales filters/searches/pages or opens tabs/details, **Then** rows, counts, statuses, totals, piece locations/progress and scoped histories agree with persisted records after reload.
2. **Given** a shared customer, **When** one salesperson opens its history/measurements, **Then** only that owner's related work contributes; another owner's IDs/search matches/counts/latest measurements do not leak.
3. **Given** no records, unavailable later-stage events or failed reads, **When** the view resolves, **Then** true empty/not-yet-available/error states appear without fixture timelines, fixed actors/dates, fabricated approval signatures or fake completion.
4. **Given** later stages provide piece changes, **When** the sales projection refreshes, **Then** it retains stable per-piece identity and accurate location/history; quality acceptance alone never counts as physical warehouse receipt.

### User Story 6 — Record paid amounts without unlocking specifications (Priority: P2)

The order records an initial manually entered paid amount at submission; the owner salesperson or ADMIN can update cumulative paid after approval.

**Why this priority**: Paid tracking is an allowed financial exception to the specification lock.

**Independent Test**: Submit with entered paid `100.50` or blank; after an authoritative approval update cumulative paid and verify old/new amount, actor/time, due/surplus and unchanged specifications.

**Acceptance Scenarios**:

1. **Given** a valid draft paid capture, **When** first submission succeeds, **Then** that exact amount becomes initial cumulative paid with retained actor/time; absent/null/blank means unpaid `0.00`. This records reported money and performs no payment.
2. **Given** an approved order and authorized owner/ADMIN, **When** cumulative paid changes from `300.00` to `450.50`, **Then** `450.50` is the new cumulative amount, not an added installment; the old/new values and actual actor/time are retained.
3. **Given** invalid/negative/over-precision input, wrong owner/role, unapproved/returned order or stale concurrent action, **When** a paid update is attempted, **Then** it fails visibly without changing money/specifications/history. A repeated accepted intent cannot duplicate change evidence.
4. **Given** paid exceeds current total, including a later authorized cancellation, **When** finances are read, **Then** actual paid remains, due and customer surplus are distinct and no refund is initiated.

### Concrete Acceptance Examples

All customer/actor/identity examples are synthetic. Z/AA references identify the exact original-language records in the roadmap; they are not replacement display labels. A/B are distinct eligible sales accounts. Catalog rates are recorded business amounts without a new currency/conversion rule.

| Requirement / scenario | Actor and starting state             | Concrete input / action                                                   | Expected observable result                                                                           | State unchanged on failure                     |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| FR-002–005 / US1       | Reviewed catalog                     | Compare I3:I592, I104, L:Y families and row 104                           | 590 base entries including I104; 1,010 colors; statistic cells excluded only from color options      | No partial or silently altered catalog         |
| FR-003–005             | Draft piece P                        | Size `25.5`, A `10.5`, F `30.5`, model `SM`, text `custom face`           | Allowed source values and text round-trip in their existing fields                                   | Invalid membership changes no saved piece      |
| FR-004–005             | P has middle addition and final text | Save distinct `soleAddition` selection and `additions=custom note`        | Separate values survive reload/read-only/paper projection                                            | Neither overwrites the other                   |
| FR-006–008 / US2       | Unsubmitted P                        | Select Z3, then Z4, then Z12                                              | Current quote 1800, 1500, 650; all 14 pairs checked separately                                       | No client override                             |
| FR-006–008             | Pieces P1/P2                         | Select Z3 and Z4; change size/base/floor                                  | Total `3300.00`; nondecoration changes add no modifier                                               | No hidden surcharge                            |
| FR-007–008             | Current valid quote                  | Clear decoration; send unknown key; supply bad/ambiguous rate             | Unavailable quote; submission denied, not zero pricing                                               | Draft, snapshots and numbers unchanged         |
| FR-009–011 / US3       | A's incomplete draft                 | Omit customer/model/size/base/face/decoration                             | Missing required fields identified; draft save still allowed                                         | No submission or number                        |
| FR-009                 | One otherwise valid piece            | Optional fields omitted; supply invalid date `2026-02-30` or size `25.25` | Optional omission allowed; invalid supplied value rejected                                           | Saved draft/input retained                     |
| FR-010–013             | Complete draft; valid gates          | Submit P1/P2 once; repeat/concurrently retry                              | Same stable resources, one number, frozen `1800.00`/`1500.00`, total `3300.00`, one submission       | No partial/duplicate record                    |
| FR-012 / D-002         | Sequence 1, then 2 issued            | SHOP in 2026; EXTERNAL in 2026; SHOP in 2027                              | `SHOP-2026-0001`, `EXTERNAL-2026-0002`, `SHOP-2027-0003`                                             | No number reassignment/reuse                   |
| FR-011,013             | Submission commits; response lost    | Observe/reconcile original intent                                         | Actual one committed result recovered; no false failure/success                                      | No second order/number/event                   |
| FR-014–017 / US4       | P submitted at `1800.00`; returned   | Later rate changes; correct size from `40` to `40.5`; resubmit            | Same customer/P/decoration/number; price stays `1800.00`; earlier review retained                    | No silent reprice/history overwrite            |
| FR-015–017             | Returned P                           | Replace customer/decoration; add/remove a piece                           | Explicit denial for prohibited correction                                                            | Customer, piece set and frozen terms retained  |
| FR-018–021 / US5       | A/B share customer C                 | A requests B's detail/history/measurements or matching search             | No B content/existence disclosure; A-only related counts/history                                     | Both owners' data unchanged                    |
| FR-019–021             | Two active pieces; one QC accepted   | Read locations/warehouse completion                                       | Piece handoff visible; warehouse received count remains zero until actual receipt                    | No manufactured progress/event                 |
| FR-022–025 / US6       | New submission                       | Paid `100.50`; separately absent/null/blank                               | Initial paid `100.50`; otherwise `0.00`, with actor/time                                             | No payment/provider action                     |
| FR-023–025             | Approved A order; paid `300.00`      | A/ADMIN sets `450.50`; B tries same; retry accepted intent                | Authorized cumulative `450.50`; old/new audit; B denied; no duplicate event                          | Specs/customer/prices unchanged                |
| FR-024–025             | Approved total `650.00`              | Paid `700.00`; separately `-1`, `1.001`, blank/null/omitted update        | Valid surplus `50.00`, due zero; malformed/absent update denied                                      | Actual paid retained after failure             |
| FR-026–029             | Dirty form; pending query/write      | Fail read, refetch, switch account, receive old quote/save                | Useful error/retry/reconciliation; input preserved in its original scope; private old results hidden | No fixture fallback or old-account publication |

Two additional stale/cancel examples make the persistence boundary explicit:

| Requirement / scenario | Actor and starting state                                                  | Concrete input / action                                     | Expected observable result                                                                             | State unchanged on failure                               |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| FR-008 / US2.3         | Draft quote `1800.00`; isolated future reviewed revision changes its rate | Submit the previously reviewed quote                        | Visible conflict; refresh/review current terms and explicitly retry                                    | No submission, issued number or lost draft input         |
| FR-014 / US4.1         | Saved returned P has size `40`                                            | Edit to `40.5`, then cancel; separately explicitly resubmit | Cancel retains saved `40`; successful resubmit commits `40.5`, revision and awaiting-approval together | Failed resubmit leaves saved returned revision unchanged |

### Edge Cases

- Preserve distinct catalog kinds/families even when codes overlap; retain original display strings despite internal lookup normalization. Do not discard I104 while excluding color statistics.
- Formula strings, unreviewed workbook identity, conflicting duplicate rates or partial catalog loading cannot become an active price source. Repeating the reviewed load must not duplicate records or alter old order snapshots.
- Unknown/cleared decoration is unpriced; missing quote, valid empty options and read failure are different states. A quote for a removed/replaced row cannot be reused.
- A reviewed future catalog revision changing quoted terms before first submission produces a visible refresh/review conflict, not silent acceptance of a different price. After reviewing a fresh quote, the owner explicitly submits again; this hypothetical revision does not amend the 14 currently confirmed rates.
- Incomplete draft saves remain valid before/after catalog activation. Required submission fields must not be imposed on ordinary P02 saves.
- Business numbers are distinct from stable internal IDs; changing customer phone/display row order cannot change relationships. A committed number is never reassigned; padding expands naturally beyond four digits without truncation or a new sequence.
- Concurrent draft save versus submit, submit versus current-authority change, two resubmissions, and two paid edits must not silently overwrite a winner or duplicate effects.
- Returned corrections cannot change original order type/number, linked customer, piece membership, decorations or frozen commercial terms. Submitted-piece cancellation remains with later authorized actors/commands.
- Invalid optional selections are rejected when supplied; omission/null/blank optional fields remain absent rather than selecting the first catalog value. No matching decoration/color-family dependency is inferred.
- Money zero is a real confirmed value only for accepted unpaid input; unknown unit price never means zero. Paid can exceed total; it must not be clamped or erased.
- A fully cancelled downstream order is not deliverable 100% completion. Cancelled identity/history remains readable; sales read models consume the owning phase's result rather than executing its cancellation.
- The number's year and overdue/date calculations must follow an explicitly configured business calendar, never a hardcoded demo year or browser/host default. OPS-01 calendar confirmation remains a release gate; controlled year-boundary acceptance uses an explicit calendar established by PLAN.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Protected P03 operations MUST use current eligible authenticated identity, department/role and resource ownership. Sales reads/writes apply to its owner's work; ADMIN has broader reads and the explicit paid exception, not a new create-for-another-salesperson workflow. Recheck current authority/state for protected changes; denied actions leave protected data unchanged.
- **FR-002**: The catalog MUST use only the reviewed workbook/source identity and confirmed mapping in root roadmap Section 4. Authorized later implementation MUST preview/reconcile evaluated values, ranges, counts, duplicates/invalid entries and source asymmetries before repeatable loading. A changed source needs comparison; loading must not partially activate invalid data, duplicate a repeated load or rewrite submitted snapshots.
- **FR-003**: Store and display catalog labels/values exactly as supplied, including original language, grouping, case, punctuation and leading zeroes. Keep kinds/families distinct; formulas resolve to evaluated values, headers/statistics are excluded, I104 is retained. No translation, inferred option or demonstration fallback is permitted.
- **FR-004**: Existing fields MUST follow the confirmed catalog/text mapping below, retain floor order and one physical piece per row, and round-trip selections/text through save/reload/details/corrections/paper output. No new conditional requiredness, measurement scope, bottom-box behavior or matching-family dependency is introduced.
- **FR-005**: Supplied selectable values MUST belong to their own reviewed catalog kind/family; supplied measurements use the exact received half-step sets. Optional absence stays absent; free-text fields remain text under existing input bounds. Out-of-catalog provisional draft values remain saveable under P02 but must be corrected before first submission if supplied there.
- **FR-006**: For each unsubmitted piece, the authoritative unit price MUST be the numeric AA value on the same reviewed Z decoration row, covering all 14 pairs. Model/size/base/color/floor/additions MUST NOT change price; no taxes, surcharges, discounts or conversions are introduced.
- **FR-007**: Empty/unknown decoration, missing/non-numeric rate or conflicting duplicate rates MUST yield unavailable pricing and visible validation/readiness feedback. They MUST NOT yield zero/free pricing, accept manual override or permit submission; current valid input remains available for correction.
- **FR-008**: Quotes, piece amounts and order total MUST use exact monetary values and current authoritative selections. Sales-supplied authoritative unit prices/totals/provenance MUST be rejected. Old quote replies cannot overwrite newer intent; first submission must validate current terms rather than trusting a displayed/stale quote. Changed quoted terms MUST produce a visible refresh/review conflict with input retained and no submission/issued number; the owner must review the fresh quote and explicitly retry. A quote reference expresses reviewed intent, not sales authority to choose a price.
- **FR-009**: First submission MUST require an existing linked customer, one of the seven known order types, at least one piece, and each piece's valid model, size, leather base, nonblank free-text face, selected priced decoration and quantity exactly one. Retain existing submission requiredness; customer email/address, delivery date, remaining catalog/text/measurement/repair/adjustment fields are not newly mandatory. Validate every supplied value/date. Missing/null/blank required input fails; optional absence does not create a fabricated value.
- **FR-010**: First submission MUST atomically retain stable order/draft/piece identity, selected specifications and original display values, customer name/contact/address snapshot, decoration/price/provenance snapshots, totals/initial paid, approved business number, authenticated owner/action time and retained submission activity, then enter awaiting approval and lock sales specification edits. Failure must leave no partial business submission/issued number/history.
- **FR-011**: A repeated/concurrent committed submit intent MUST resolve to one order/number/piece set/submission event. Conflicting/stale/different payload intent MUST be visibly rejected without overwriting confirmed work. An uncertain response MUST be reconciled to the original result before another effect is attempted; browser pending controls alone are insufficient.
- **FR-012**: Business numbers MUST follow `TYPE-YYYY-NNNN`, with exact uppercase prefixes `SHOP`, `EXTERNAL`, `REPAIR`, `GIFT`, `READY`, `ACCESSORY`, `ADJUSTMENT`. Use the actual first-submission year and one globally shared increasing sequence, initially 1, continuing across types and years without reset. Pad to at least four digits; preserve immutable, unique issued numbers separately from internal identity. Drafts/quotes/failed submissions issue no real number; resubmission retains the original. No branch-specific counter or array-length numbering is introduced.
- **FR-013**: First-submission prices/customer contacts MUST remain independent of later customer/catalog edits. Retain the selected decoration, exact original quote/source identity and customer business values needed to explain the terms, without silently rewriting history. Unchanged submitted catalog selections remain readable through later catalog revisions.
- **FR-014**: Returned-order correction/resubmission MUST require an authoritative current P04 return decision and the owner salesperson's current authority. Retain/display the return reason and earlier submissions/decisions. Explicit resubmission revalidates and atomically persists permitted corrections, retained revision/activity and awaiting-approval state; it never directly resumes manufacturing. Until that action, edits remain local and ordinary cancel/navigation leaves the saved returned revision unchanged. No separate durable correction-save action or returned-to-draft transition is introduced; P02 draft save cannot mutate a returned order.
- **FR-015**: On returned orders, the linked customer, original order type/number, original piece IDs/membership, decorations and frozen prices/contact snapshots MUST remain fixed. Sales MUST NOT add/remove/cancel pieces, replace customer/decoration or reprice. Other captured nonprice piece specifications and existing notes/date/signature/repair/adjustment text may be corrected within their existing fields. Signature text does not certify approval or replace the actual actor.
- **FR-016**: Correction MUST validate newly selected catalog values and required fields, preserve unchanged retained selections/terms and record relevant before/after values with actor/time. A prohibited/stale/invalid correction or failed resubmission MUST leave saved revisions, prior history and frozen terms unchanged and retain local input for review.
- **FR-017**: Outside the returned-order correction state, sales specification edits MUST be denied after first submission, including direct draft-save/row actions. Later approval/problem/cancellation/admin correction commands retain their separate owning-phase authority.
- **FR-018**: Provide persistent own-order/dashboard/draft/returned/detail/activity reads and customer order/measurement history on existing surfaces. Search/type/status/pagination/counts MUST share owner/filter scope, use bounded navigable results and distinguish actual empty/missing/denied/error states. ADMIN uses the agreed broader scope; sharing a customer grants no other owner's order/history/measurement/count access.
- **FR-019**: Tracking/progress, quantities, piece locations and timelines MUST derive from the same retained per-piece records/events used downstream. Keep original/cancelled/active/received counts consistent, count each piece once, and count completion by physical warehouse receipt, not quality acceptance. Do not fabricate later-stage events to populate a view.
- **FR-020**: Sales details/paper/monetary reads MUST show actual salesperson/action dates, original business number, selected values, frozen contacts/prices and distinct total/paid/due/surplus. Customer-master phone changes retain stable links and do not mutate submitted contacts. Lists/details/history must agree after confirmed changes and reload.
- **FR-021**: P03 MUST publish/test the stable submitted-order/piece/customer/price/totals/history meaning required downstream before dependent backend work. Factory projections MUST omit financial fields rather than merely hiding them visually. Isolated downstream fixtures prove only their tested boundary; P04 owns actual decision commands and official print eligibility, P05–P07 own subsequent transitions.
- **FR-022**: First submission MUST record the provisional paid entry as the initial cumulative paid amount, with actual actor/time; absent/null/blank means `0.00`. Validate a nonnegative exact amount at the existing two-decimal precision. This is a manual record and executes no payment, collection or external side effect.
- **FR-023**: After approval, only the owner salesperson or eligible ADMIN MAY set cumulative paid through the separate paid action. Record old/new amount, actual actor/time and relevant order/version together. A lower valid amount is an audited correction of the cumulative value; it does not initiate a refund. Do not add the submitted value as an installment or unlock specifications.
- **FR-024**: Paid updates MUST require an explicit valid amount; missing/null/blank, negative, nonnumeric, over-precision, denied/unapproved/returned/stale actions fail without writes. Repeated accepted intent cannot duplicate evidence; competing changed intent requires visible reconciliation rather than lost updates. Setting an already-current amount has no duplicate change effect.
- **FR-025**: Authoritative finances MUST retain exact total and actual cumulative paid; remaining due is the nonnegative excess of total over paid, and surplus owed is the nonnegative excess of paid over total. Later authorized cancellations recalculate total while preserving paid/history. No automatic settlement/refund or financial-reporting expansion is introduced.
- **FR-026**: Preserve existing approved routes/components/paper/print layout and Arabic/RTL/Cairo presentation. Bind received catalogs/quotes into completed controls; do not rebuild text inputs, middle floor column, read-only financial cells or measurement placement. Existing row actions remain draft-only after locking; paper projection/print parity does not grant preapproval official-print permission.
- **FR-027**: Reads/actions MUST visibly distinguish applicable loading, empty, unavailable, validation, pending, confirmed success, denied, conflict, read failure/retry and unknown write outcome. Success follows confirmed persistence; recoverable failure retains current input. Catalog/pricing failure cannot become demo data, zero pricing, fake success or an empty-success result.
- **FR-028**: Background refresh/late responses MUST preserve dirty input and selected resource/account boundaries. Confirmed mutations synchronize affected details/lists/counts/activity/customer histories; old-account/old-piece results cannot publish private data or reset newer input. Unsaved changes retain P02 manual-save/cancel behavior; closing a pending action never claims rollback.
- **FR-029**: Existing fields/dialogs/actions MUST retain accessible labels, keyboard/search-menu interaction, visible focus, useful field/general error feedback and narrow/wide RTL usability. Pending duplicate triggers and denied states need both truthful UI and authoritative enforcement.

### Confirmed Field Policy

The full source labels/families/rates remain owned by [root roadmap Section 4](../../plan.md#4-received-catalog-values-confirmed-pricing-and-remaining-gates). Coordinates below identify exact source records, not replacement UI text.

| Existing field(s)                                               | Confirmed source / allowed set                                 | Submission requiredness / preserved behavior                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `model`                                                         | A3:A9; seven supplied models                                   | Required selection                                                                         |
| `size`                                                          | E3:E57; 25–52 in steps of 0.5, 55 values                       | Required selection                                                                         |
| `leatherBase`                                                   | I3:I592; 590 evaluated values, including I104                  | Required selection, independent of color lists                                             |
| `decoration` / `unitPrice`                                      | Z3:Z16 joined to AA3:AA16 on the same row                      | Required priced decoration; read-only authoritative amount                                 |
| `decorationColor`                                               | L2:Y2 families; rows 3–72, except T through 102; 1,010 options | Optional; own family/source identity preserved; no decoration-family restriction           |
| `faceRight`, `faceLeft`, `mixing`                               | M1/M2/M3 free text, no lookup                                  | Optional text                                                                              |
| `face`                                                          | Free text, no lookup                                           | Required nonblank text                                                                     |
| `sole`                                                          | C3:C14; 12 source entries                                      | Optional selection                                                                         |
| `soleAddition`                                                  | B3:B7; five floor types                                        | Optional selection between `sole` and `soleColor`                                          |
| `soleColor`                                                     | D3:D42; integer numbers 1–40                                   | Optional selection                                                                         |
| `additions`                                                     | Final free text, no lookup                                     | Optional text, distinct from `soleAddition`                                                |
| `aField`                                                        | F3:F83; 10–50 in steps of 0.5, 81 values                       | Optional; retain placement                                                                 |
| `fField`                                                        | G3:G62; 1–30.5 in steps of 0.5, 60 values                      | Optional; F paper field comes from workbook G                                              |
| Side/general/type-specific notes, signature text, delivery date | Existing captured fields                                       | Optional; supplied dates real; no invented signature/approval                              |
| `paidAmount`                                                    | Existing exact two-decimal capture                             | Initial absent/null/blank becomes unpaid zero; later paid command requires explicit amount |

### Authority and Data Rules

| Operation                                                                                               | Eligible owner salesperson | Other salesperson        | Eligible ADMIN                                  | Other/ineligible actor      |
| ------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------ | ----------------------------------------------- | --------------------------- |
| Read catalogs/quotes in permitted sales workflow                                                        | Allowed                    | Allowed for own workflow | Allowed in permitted workflow                   | No new factory price access |
| Submit existing draft / correct returned order / resubmit                                               | Own eligible resource only | Denied                   | No new on-behalf submission/correction workflow | Denied                      |
| Sales lists/detail/tracking/activity/customer history                                                   | Own records only           | Own records only         | Broader authorized read                         | Denied through sales reads  |
| Set cumulative paid after approval                                                                      | Own order only             | Denied                   | Allowed                                         | Denied                      |
| Override price/actor/number/state; cancel submitted piece; approve/release/officially print through P03 | Denied                     | Denied                   | Separate owning-phase command required          | Denied                      |

- Each accepted write and its retained business change evidence share one confirmed outcome. Preserve actor identity/name/context/time, resource references and relevant before/after values. No history purge or generic ledger/version platform is introduced.
- Stable customer/order/piece identity is independent of phone, row position, business number and account display name. Catalog provenance must explain frozen terms without rewriting them when active data changes.
- Existing draft safety bounds remain the starting boundary: 1–200 pieces, bounded captured fields, two-decimal paid precision and bounded requests/results. PLAN chooses compatible wire/query/transaction details and monetary capacity from current source; it must not invent commercial limits or new price rules.
- Factory and inaccessible-owner projections omit prohibited fields at the authoritative boundary. No local role selector, fixed actor, cached fixture or browser-supplied total grants authority.

### Frontend and State Requirements

| Existing surface                                                                                                                    | P03 responsibility                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/sales/orders/new`, `/sales/orders/[orderId]/edit` and draft paper/detail                                                          | Preserve P02 draft behavior; catalog binding/quotes, submission, locking and permitted returned corrections        |
| `/sales/dashboard`, `/sales/orders`, `/sales/orders/drafts`, `/sales/orders/returned`, `/sales/activity`, `/sales/orders/[orderId]` | Real scoped rows/counts/filters/pagination/details/tabs/history/tracking/finances and truthful readiness           |
| `/sales/customers/[phone]`, `/admin/customers/[phone]` and existing customer history panels                                         | Submitted-order/measurement history with own-sales/broader-ADMIN scope; stable phone-to-customer links             |
| Existing paid controls and paper finance                                                                                            | Initial paid capture, authorized post-approval update, exact due/surplus and retained specification lock           |
| Shared paper read-only/print presentation                                                                                           | Original-language field/contact/price parity and preserved eight-row pagination; official print actions remain P04 |
| Existing manufacturing-problem customer-contact form                                                                                | Preserve its source-value semantics for P04 integration; no P03 issue-resolution/cancellation/resume action        |

Keep confirmed saved state distinct from current editable intent. Ordinary unsent cancel/navigation does not save; dialog cancel retains the surrounding paper. Failed/unknown writes retain context and reconcile safely. An account change hides private prior state; pending responses cannot reselect another customer's data, price another row or reset newer input. Technical form/query/cache choices belong to PLAN.

### Key Entities

- **Reviewed Catalog Source / Entry**: Reviewed source identity, kind, source cell/row, original display value, family membership and evaluated value; a decoration entry relates to its same-row price.
- **Unsubmitted Quote**: Current selected decoration's authoritative price/provenance or explicit unavailable reason; no frozen sale or issued number by itself.
- **Submitted Order / Piece**: Stable P02 identities, owner/type, immutable business number, retained ordered physical pieces, accepted specifications, current lifecycle, revision, real timestamps and first-submission customer/price terms.
- **Customer Snapshot / Piece Price Snapshot**: Original retained customer contact/address and selected decoration/price/provenance, separate from mutable master data and active rates.
- **Business Number Sequence**: One increasing sequence across all seven types and years; issued display combines type, first-submission year and padded sequence without becoming internal identity.
- **Submission / Return Revision / Activity**: Traceable submission/correction/decision references, current permitted state, actual actor/time and relevant before/after values; P04 owns approval/return decisions.
- **Paid Record / Monetary Projection**: Initial and later cumulative amount with retained change evidence; exact total, due and surplus. No payment-provider transaction is implied.

## Verification Requirements

These are requirements for later implementation, not application checks executed by SPECIFY. PLAN chooses actual current test owners/commands and technical blueprints; TASKS supplies bounded briefs and discovered automated test changes.

- **VR-001**: Automated catalog/field/quote cases cover every recorded range/count and all 14 same-row rates; original language/codes/case/leading zeroes; evaluated formulas; color-statistic exclusion with I104 retention; independent families and asymmetries; half-step boundaries; separate text/floor fields; repeat-load and rejected changed/invalid source. Reviewed-workbook and persisted-catalog checks are distinct from synthetic lookup tests.
- **VR-002**: Actual migrated isolated persistence and HTTP authority prove first submission/snapshot/number/history atomicity, rollback after dependent-write failure, controlled concurrent/repeated/stale/unknown actions, global cross-type/year numbering, current-authority changes, owner isolation and safe financial projections. Retain existing P01/P02 accounts/customer/draft/command/migration history; use no unrelated database/reset/fixture import.
- **VR-003**: Submitted snapshots survive master/rate edits; unapproved edits/overrides fail; permitted returned corrections/resubmission preserve terms and prior decisions. Use clearly labelled isolated P04 decision fixtures for pre-P04 boundary tests; actual return/approve/problem workflows and official printing require P04's later real acceptance, not simulated P03 claims.
- **VR-004**: Exact money tests cover quote/total sums, initial entered/absent/null/blank paid, post-approval cumulative replacements/corrections, invalid/denied/stale/repeated updates, old/new audit, due/surplus and unchanged paid after downstream cancellation fixtures. No fixture or mock payment establishes real collection/refund.
- **VR-005**: Real component/form/state interactions prove supplied-value binding, rapid quote changes/late replies, dirty refresh, retained input, optional/required validation, pending/double activation, missing/denied/conflict/error/retry/unknown outcomes, list/count/history reconciliation and account isolation. Keep doubles outside the boundary being proved.
- **VR-006**: Extend the existing owned real-stack browser harness across sales A/B and ADMIN on retained routes: shared customer/private histories; partial draft remains saveable; catalog-backed quotes; complete submit once; reload/relogin; edit lock; real counters/details/measurements/activity; narrow/wide RTL, keyboard/menu/dialog behavior and source-field/paper parity. Check 1/8/9/17-row paper pagination without bypassing P04 official-print eligibility.
- **VR-007**: Required backend contracts/data/authority/services/reads/commands/failures and requirements/engineering review must pass before dependent frontend integration. A stable downstream contract gate or fixture quote is not catalog activation, complete frontend/browser acceptance or P03 completion. Live P04–P07 end-to-end transitions remain their owning phases' evidence.
- **Documentation-only command scope**: This invocation checks specification/checklist completeness, recorded decisions, current references, selected feature, Markdown formatting and changed-file boundaries. No application tests, catalog loading, migration, real submission, payment update or deployment are executed.

## Success Criteria _(mandatory)_

- **SC-001**: Reviewed loading produces exactly the confirmed values/kinds/families and all 14 rates, with evaluated source-language values intact, no statistics/demo extras, I104 retained and no duplicate result from a repeated authorized load.
- **SC-002**: Every Z3:Z16 selection returns its exact same-row rate; Z3/Z4/Z12 visibly yield 1800/1500/650. Nondecoration edits add no modifier. Invalid/unavailable pricing blocks submission and preserves draft work without zero/manual fallback.
- **SC-003**: A complete catalog-backed draft submits once, reopens after reload/relogin as awaiting approval with stable identities, original contacts/prices, exact totals/initial paid, one confirmed number and one submission event. Incomplete drafts remain saveable and cannot partially submit.
- **SC-004**: Controlled numbering acceptance yields `SHOP-2026-0001`, `EXTERNAL-2026-0002`, then `SHOP-2027-0003`; concurrent/retried submissions keep unique immutable numbers with no type/year reset and no number from a failed action.
- **SC-005**: All tested direct/list/search/count/detail/history/measurement/activity paths enforce own-sales/broader-ADMIN scope and current authority. Denied writes change no protected records; factory projections omit financial data.
- **SC-006**: Permitted returned corrections resubmit under original customer/pieces/decorations/prices/number and retain prior decisions. Prohibited changes and nonreturned/stale actions fail without manufacturing release or historical rewrite; real return-decision execution is separately verified in P04.
- **SC-007**: Entered initial paid is retained exactly; blank is unpaid zero. Authorized post-approval cumulative updates retain old/new actor/time evidence without unlocking specifications, preserve actual overpayment, and show accurate due/surplus without provider/refund action.
- **SC-008**: Read/write/quote failures, lost responses, duplicate/conflicting actions, dirty refresh and late/account-switched replies produce truthful visible outcomes, retain appropriate input and reconcile to one persistent result with no fixture fallback or privacy leak.
- **SC-009**: Existing sales/customer/paper surfaces show consistent saved fields, totals, tracking and activity after reload and pass affected narrow/wide RTL, keyboard/dialog/search-menu and 1/8/9/17-row paper acceptance without redesign or premature official printing.

## Assumptions and Decisions

- **D-001 — Existing validation baseline**: The roadmap explicitly preserves existing agreed validation and prohibits inferred new requiredness. Its named source baseline `06bb580d22788d81447cacdeff3e3010faeaa440`, `sales-create-order-view.tsx` submission validation, requires linked customer and model/size/base/face/positive quantity. This historical source was inspected in this invocation; it is not current persistent implementation. FR-009 carries that set forward, applies accepted quantity one and required authoritative decoration pricing, and adds no type-specific/date/address/email requirement.
- **D-002 — Numbering confirmed by owner, 2026-11-06**: Keep current frontend type words/pattern. Current fixture/type definitions use uppercase prefixes, including SHOP and EXTERNAL. The owner explicitly selected one shared counter that keeps counting across years. FR-012 therefore fixes `TYPE-YYYY-NNNN`, all seven existing uppercase prefixes and no type/year reset. Synthetic examples are policy examples, not issued numbers or real submission evidence. The root roadmap is not amended by this SPECIFY command.
- **D-003 — Returned correction policy confirmed by owner, 2026-11-06**: Preserve original customer, piece set and decorations; allow other corrections and retain first-submission prices/contact snapshots. FR-014–017 apply that policy to the returned-order state, preserving original number/type and separating post-approval manufacturing-problem correction decisions owned by P04. The roadmap's explicit correction/resubmission action is the persistence boundary; no additional durable correction-save workflow is inferred.
- **D-004 — Initial paid confirmed by owner, 2026-11-06**: Promote the provisional entry to the initial cumulative paid record at first submission; blank means zero. Record actor/time, perform no payment, and restrict later updates to owner sales/ADMIN after approval. This resolves the distinction left open by P02's provisional paid capture without changing its permissive draft save.
- **D-005 — Received source remains authoritative**: Root roadmap Section 4 owns full labels/rates/ranges and recorded SHA-256 `88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b`. No color matching, surcharge, option repair, source replacement or translation is inferred from data asymmetries. The identical repository-root copy is now available and inspected; implemented preview and authorized activation remain later gates. This availability update does not replace the source or reopen confirmed values.
- **D-006 — Cross-phase and calendar limits**: Publish stable P03 domain meaning first; P04 can then test its backend against isolated submitted fixtures. Consuming returned/approved fixtures does not execute P04. Operational calendar configuration/year-boundary behavior must be made explicit in PLAN and confirmed with OPS-01 before release; the user's computer timezone and the mock year are not business authority.
- **D-007 — Governing command scope**: Preserve the [root roadmap](../../plan.md), [constitution](../../.specify/memory/constitution.md), [phase-delivery contract](../../docs/workflow/phase-delivery.md), [handoff obligations](../../docs/workflow/implementation-handoff.md) and upstream [P02 specification](../002-shared-customers-drafts/spec.md). Explicit answers amend P03 product requirements only; this command does not approve implementation, wider roadmap status or release.

## Phase Exit

P03 implementation is complete only when FR-001–029, VR-001–007 and SC-001–009 have requirements and engineering review plus the required persistent/backend/frontend/browser evidence. The reviewed workbook must be available and its identity/values reconciled, catalog loading/quote behavior actually implemented and verified, the confirmed number policy implemented/tested, and at least one actual catalog-backed submission observed in the authorized acceptance environment. Receipt of data, this spec, isolated lookup/decision fixtures or a backend-only contract gate cannot close P03.

P04's real approval/return/customer-contact/official-print actions and P05–P07's lifecycle commands remain separately scoped. P03 must prove its relevant consumers/commands at their real owned boundaries with labelled upstream decision fixtures where needed; later owning phases must prove the integrated live journeys. OPS-01 and production actions remain release prerequisites.

SPECIFY completion means this product definition and its built-in requirements-quality review are complete and ready for separately requested PLAN. PLAN must resolve the operation-specific design and bounded handoff strategy from current source; future TASKS briefs and executed tests are later outputs. No PLAN/TASKS/ANALYZE/IMPLEMENT, catalog activation, commit, push or release is performed by this invocation.
