# Feature Specification: Administration, Reports and Production Readiness

**Roadmap Phase**: P08 — Administration, reports, full regression, and production readiness\
**Feature Directory**: `specs/008-admin-reports-readiness`\
**Feature Branch**: `main` at intake; feature numbering is independent of the Git branch\
**Created**: 2026-11-15\
**Status**: Draft — specification complete for technical planning; no implementation or phase acceptance claimed
**Initial Input**: Specify P08 only in English; read root `plan.md` and `docs/workflow/phase-delivery.md`; reuse a matching accepted feature if one exists. During this invocation the owner accepted exact-piece cancellation selection, correction of any submitted order within the existing dialog, and a common order-report cohort with separately scoped current workforce (D-007–009).

## Scope and Baseline

- **Outcome**: ADMIN reads the same operational facts as departments, makes bounded audited cancellations/corrections and produces accurate operational reports. The operator distinguishes local acceptance from an agreed environment's release evidence.
- **Selection**: No matching P08 specification exists among inspected P01–P07 features. Create/select this one P08 feature in place of P07; preserve earlier artifacts, decisions, IDs and progress.
- **Current evidence**: Intake revision `382a7f5`, actual branch `main`, clean tracked/untracked worktree. Persisted staff, customer, sales, approval, manufacturing, quality and warehouse owners exist. Remaining admin operational/report screens and report print still use browser-local MVP data. Admin customer and staff views already use real services. The root roadmap's older foundation-only inventory/status is historical, not a current implementation assessment.
- **Prerequisite evidence**: P01–P07 task ledgers contain no unchecked task markers; P07 T054 records renewed local exit evidence on 2026-11-15. These are inspected records, not fresh application checks here. Revalidate applicable contracts, source and acceptance before dependent integration or project completion.
- **Deliverables**: Existing admin dashboard, orders/detail, customers/detail, approval oversight, correction history, delivery exceptions, activity, reports/print; administrative cancellation scopes; order-only notes/contact/address correction; removal of remaining production fixture authority; full cross-role regression and operational readiness/cutover requirements.
- **Exclusions**: New departments, assignment systems, accounting/financial reporting, invoices, payment gateways, refunds/settlement, partial delivery, courier platforms, catalog-management/upload screens, workflow engines, new product screens/redesign, automatic historical-data import or widened staff/customer/print permissions. The original SPECIFY command performed no later stage. The current delegated sequence below includes planning/checklist/task amendments and read-only analysis only, with no application implementation/tests, catalog loading, provisioning, migrations, deployment, external messaging, commit or push.
- **Dependencies/foundations**: Reuse P01 staff/auth/account authority and restricted admin provisioning; P02 customer services/stable identities; P03 submitted terms, exact money, separate paid command and confirmed numbering; P04 retained cancellation/issue/print rules; P05–P07 work/quality/receipt/delivery facts and history. Full release requires their actual acceptance and OPS-01. Technical architecture, deployment mechanics and execution briefs belong to their separate PLAN/TASKS owners.
- **Client gates**: CAT-01 mapping and PRC-01 rates are confirmed; CAT-02 values are received. Verify actual loading/pricing/submission evidence rather than inferring activation from receipt. P03 D-002 resolves NUM-01 as `TYPE-YYYY-NNNN` with one shared counter continuing across years; do not reopen the root's older pending row. OPS-01 still requires actual host/domain, live mail, initial administrator identity, approved storage and operational-owner bindings/evidence before dependent production work; D-011 now fixes the recommended production calendar and backup policy.
- **Frontend boundary**: Preserve Arabic/RTL/Cairo, routes/redirects, menus, filter URLs, tables, pagination, tracking/history, dialogs, A4 landscape order paper and A4 portrait six-section reports. Functional additions remain within existing surfaces. Reached `features/prototype/` components are valid UI owners.
- **Open decisions and gates**: No unresolved material product question remains after D-007–009. OPS-01 remains open for actual target binding/execution and release; it does not prevent independent technical planning with explicit isolated test conditions. Preserve roadmap owner-review status and actual upstream/activation/evidence gates.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Observe consistent administration data (Priority: P1)

Eligible ADMIN follows dashboard/filter → order detail → approval/correction/delivery history and customer context using the same operational facts as departments.

**Why this priority**: Oversight and decisions need consistent quantities, identity, money and current state.

**Independent Test**: Three original pieces have P1 physically received, P2 in production and P3 cancelled. ADMIN reloads list/detail/dashboard/history: active is 2 and received-active is 1 everywhere. Sales still sees only its own order context.

**Acceptance Scenarios**:

1. **Given** permitted records, **When** ADMIN searches, filters, pages and drills down, **Then** results/counts/detail reflect the documented scope and actual actors/timestamps, including genuine empty results.
2. **Given** real staff/customer functions, **When** opened through administration, **Then** existing authoritative behavior remains; customer-master changes do not rewrite retained order contacts.
3. **Given** non-admin, suspended or revoked authority, **When** direct admin URLs/actions are requested, **Then** no protected data/write is allowed; cached/browser identity cannot establish access.
4. **Given** failed reads or malformed results, **When** a view loads, **Then** safe recovery appears without false empty/demo/success content.

### User Story 2 — Cancel an exact administrative scope (Priority: P1)

ADMIN reviews exact eligible pieces for whole-order, item or partial-quantity cancellation, with retained reason/history and financial consequences.

**Why this priority**: Quantity alone cannot choose the wrong physical work or conceal customer surplus.

**Independent Test**: P1/P2 each cost `650.00`, paid is `1000.00`, neither is dispatched/delivered. Cancel exactly P1: total `650.00`, paid `1000.00`, due `0.00`, surplus `350.00`; P2 continues and no refund occurs. D-007 fixes exact selection within the existing dialog.

**Acceptance Scenarios**:

1. **Given** eligible pieces, **When** ADMIN confirms a reviewed scope, **Then** precisely those identities are retained as cancelled once, with reason/actor/time and correct counts/totals/history.
2. **Given** dispatched/delivered, cancelled, duplicate, foreign or stale members, **When** requested, **Then** reject the entire action unchanged with refresh/review guidance; never replace/skip members.
3. **Given** all remaining eligible pieces cancelled, **When** read, **Then** the order remains retained and non-deliverable, with paid/surplus and no false 100%-deliverable state.
4. **Given** lost replies or cancellation/dispatch/payment races, **When** observed/retried, **Then** one coherent result remains without duplicate effects or erased paid/delivery evidence.
5. **Given** an unsent dialog, **When** cancelled/closed, **Then** no business write occurs.

### User Story 3 — Correct allowed information without restarting work (Priority: P1)

ADMIN corrects order notes or retained contact/address information with reason and before/after evidence, preserving completed/cancelled work.

**Why this priority**: Correction must not bypass specification approval or falsify history.

**Independent Test**: On an order eligible under D-008, change address `Building A` to `Building B`, reason `Correct building reference`. Reload: effective B and original A/change remain traceable; customer master, work and delivery history remain unchanged.

**Acceptance Scenarios**:

1. **Given** an eligible order, **When** allowed changes/reason are explicitly saved, **Then** only those changes and audit persist together; a reason-only action does not claim correction/work restart.
2. **Given** specification, price, linked customer ID/reassignment, quantity, paid, cancellation, work-state or delivery-history changes, **When** sent as a correction, **Then** reject the whole save unchanged. Paid uses its separate command.
3. **Given** a delivered/fully cancelled order eligible under D-008, **When** corrected, **Then** terminal work stays terminal. Repair after delivery is a new repair order following the full route.
4. **Given** invalid, stale, denied or failed save, **When** submitted, **Then** safe input remains and no partial correction/audit or success appears.

### User Story 4 — Produce truthful operational reports (Priority: P1)

ADMIN uses existing filters and prints six sections with explicit common scope and truthful workforce/signoff data.

**Why this priority**: Oversight cannot rely on fabricated employees, dates, endorsements or contradictory totals.

**Independent Test**: A controlled dataset has distinct creation dates, owners, types, current departments and exceptions. Under D-009, compare cards/detail/department/exception/print totals, including orders beyond the current screen page.

**Acceptance Scenarios**:

1. **Given** valid filters, **When** screen/print loads, **Then** scopes and data agree under D-009; pagination does not change aggregate meaning or limit print to one page.
2. **Given** selected date boundaries, **When** creation falls on either boundary date, **Then** include it under the business calendar. Invalid/reversed dates fail visibly; missing timezone is not replaced by a demo/browser clock.
3. **Given** two workers in one department, **When** workforce appears, **Then** identities/statuses are real and neither is credited with the entire department's work as personal output.
4. **Given** absent endorsement/signature/reference, **When** printed, **Then** show honest unavailable/blank manual signoff, without fabricated official claims.
5. **Given** denied/failed loading, **When** printing is requested, **Then** no stale/fixture report is represented as current eligible output.
6. **Given** current staff with no activity on the filtered orders, **When** order date/type/status/salesperson filters change, **Then** staff directory membership remains unchanged; selecting a department restricts staff to that assigned department, with accurate statuses/active count and explicit scope label.

### User Story 5 — Remove remaining production demo authority (Priority: P1)

Employees use retained product routes with authoritative data; browser snapshots/previews cannot grant access, create records or hide outages.

**Why this priority**: Final integration is incomplete while a production workflow can act on fixtures.

**Independent Test**: Put obsolete synthetic MVP data in browser storage and open admin/report routes against fresh real data: only permitted records or genuine empty/error states appear. Preview/OTP/reset controls cannot bypass production authority.

**Acceptance Scenarios**:

1. **Given** production execution, **When** operational reads/actions run, **Then** identities, prices, numbers, clocks and effects use permitted real facts with no fixture fallback/import.
2. **Given** isolated development previews, **When** used, **Then** fixtures remain isolated from production routes, permissions and real persistence.
3. **Given** pending/failed/uncertain commands or changed account/order/filter, **When** responses arrive or the dialog closes, **Then** no false success, duplicate write or old-context disclosure occurs; original results remain recoverable.

### User Story 6 — Verify the product and prepare the agreed release (Priority: P1)

The owner/operator receives evidence for every accepted workflow, route/action and release/recovery requirement, with open gates explicit.

**Why this priority**: Local success cannot prove live mail, persistence after restart or restoration.

**Independent Test**: Complete cross-role regression and restore a backup in disposable infrastructure. Separately, after OPS-01 and explicit environment authorization, observe target HTTPS, mail receipt, migrations, health, restart and recovery.

**Acceptance Scenarios**:

1. **Given** prerequisite acceptance, **When** full regression runs, **Then** all seven types and retained routes/actions have actual authority/persistence/failure/recovery/presentation evidence.
2. **Given** fresh and representative populated data, **When** upgrades/restoration run in isolated targets, **Then** identities, terms, counts, paid and history survive without unapproved reset/fixture activation.
3. **Given** missing target/mail/backup access or unresolved OPS-01, **When** reported, **Then** the exact gate stays open; configuration/provider acknowledgement is not live acceptance.
4. **Given** later authorized target checks, **When** completed, **Then** record actual secure access/mail receipt/restart/restore/operator handoff separately from local results.

### Concrete Acceptance Examples

| Requirement / scenario | Actor and starting state                                                          | Concrete safe input / action                                 | Expected observable result                                                                                             | State unchanged on failure                         |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| FR-002–006 / US1       | ADMIN; original 3, P3 cancelled, P1 received, P2 production                       | Filter/drill down/reload                                     | Original 3, cancelled 1, active 2, received-active 1 everywhere                                                        | Reads change no history/state                      |
| FR-007–011 / US2       | P1/P2 frozen `650.00`, paid `1000.00`                                             | Cancel exact P1                                              | Total `650.00`, due `0.00`, surplus `350.00`; P2 continues                                                             | Paid/prices/P2 unchanged                           |
| FR-008–010 / US2       | Reviewed P1 dispatched by another operator                                        | Confirm stale scope                                          | Conflict; refresh/review; no substituted P2                                                                            | Pieces/money/audit unchanged                       |
| FR-011 / US2           | Last active piece, paid `1000.00`                                                 | Valid cancellation                                           | Active/total 0; paid/surplus `1000.00`; no shipment/refund                                                             | Earlier history retained                           |
| FR-012–015 / US3       | Eligible order, address A                                                         | Address B, reason `Correct building reference`               | Effective B, retained A/change/actor/time                                                                              | Master/work/deliveries unchanged                   |
| FR-012–014 / US3       | Eligible order                                                                    | Add price/paid field or blank required reason                | Entire save denied with relevant recovery                                                                              | Saved order/audit unchanged; safe draft retained   |
| FR-014 / US3           | Optional existing note                                                            | Omit versus explicitly clear                                 | Omission preserves; valid clearing removes effective note only                                                         | Required name/phone cannot be cleared              |
| FR-016–020 / US4       | Two same-department workers                                                       | Workforce under D-009                                        | Real scoped current directory; no doubled personal workload                                                            | No fabricated staff/signoff                        |
| FR-017–018 / US4       | O1: P1 cutting/P2 production; O2: P3 warehouse; current staff in both departments | Filter department to cutting; then change salesperson filter | Cohort O1 has active 2, cutting 1, production 1; directory has current cutting staff, unaffected by order-only filters | No attribution of both pieces to each staff member |
| FR-005/017 / US4       | Creation on selected boundary                                                     | Same-day range; reversed range                               | Boundary included; reversed dates rejected                                                                             | No broad fallback/write                            |
| FR-019 / US4           | More filtered orders than one screen page                                         | Print existing URL                                           | Complete permitted scope/totals/pages, A4 portrait                                                                     | Failure is not partial-report success              |
| FR-001/021–024 / US5   | Non-admin/revoked ADMIN, old local snapshot                                       | Direct admin/report/action                                   | Denied, content withdrawn, safe access recovery                                                                        | No protected data/write or fixture fallback        |
| FR-025–031 / US6       | Owned isolated data                                                               | Full journey, upgrade, restore                               | Matching terms/counts/history; explicit local/target verdict                                                           | Unrelated data untouched                           |

### Edge Cases

- Empty/missing/out-of-range results, unknown filters, invalid/reversed dates and duplicate employee names.
- Same-model pieces at different stages; duplicate/foreign/stale cancellation; dispatch/cancel, paid/cancel and correction/correction races; fully cancelled/partially received orders.
- Omitted/cleared optional text versus invalid required contacts; no-change correction; customer reassignment or hidden forbidden fields.
- Failed audit save, lost committed reply, repeated changed intent, closed dialog, changed identity/resource/filter and late reads.
- No active workforce, suspended current staff, renamed historical actors, blank endorsements and multi-page reports.
- Date-only promised/retry values versus recording instants; midnight/year boundaries; unconfirmed business timezone.
- Database/mail/proxy/startup/restore failure; unresolved OPS-01; fresh operations without demo import; direct preview/reset/role bypass attempts.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Enforce current eligible ADMIN authority for oversight/reports/cancellation/correction at protected reads/writes. Preserve existing staff/department, sales ownership, factory/warehouse privacy and official-print permissions. Denial exposes no protected content and changes nothing.
- **FR-002**: Supply existing dashboard, all-orders/detail, approvals, corrections, delivery exceptions and immutable activity from owning operational facts, with actual actors/times, physical pieces/locations, review/delivery history and authorized money; no competing ledger.
- **FR-003**: Reuse P01 staff/account/provisioning, P02 customers and P03 scoped customer/order/measurement history and paid updates. Admin/sales customer perspectives retain their respective authority; master updates cannot implicitly change orders.
- **FR-004**: Preserve offered search/status/type/department/exception/date/salesperson filters, pagination and drill-down URLs. Apply search/filter to the full permitted result, with matching row/count scope, genuine empty results and recovery from disappearing pages. Invalid input cannot silently broaden scope/access. Activity search includes the displayed action label/operation meaning as well as the offered order reference, actor and note fields; matching counts and rows use the full permitted event population before pagination.
- **FR-005**: Report dates retain inclusive order-creation calendar-date meaning using real configured business time. Today means the current business date; month/year means first day through today. Each explicit endpoint overrides that endpoint of the preset; a missing endpoint uses the preset, or is open under all-periods. Require valid dates and effective start no later than effective end. D-011 selects Asia/Riyadh for production; actual OPS-01 configuration/evidence must verify it. Controlled local planning/tests may still use an explicit isolated calendar and must identify it separately. No implicit computer/host/demo timezone is accepted. An order is overdue only when it has a promised date strictly before today and is not ready, dispatched/with courier, delivery-failed, awaiting delivery retry, delivered or fully cancelled. No promised date and a date equal to today are not overdue. Preserve these existing report meanings while replacing the fixed clock.
- **FR-006**: Original/cancelled/active/received-active counts, current locations, readiness and progress agree with P03–P07. Count each piece once; quality acceptance is not receipt; 199/200 is incomplete and zero-active is non-deliverable. Historical work is not current departmental workload.
- **FR-007**: Preserve whole-order/item/partial-quantity cancellation intentions for submitted orders with eligible active physical pieces, resolved to exact identities before explicit confirmation. Draft editing/deletion remains P02/P03 behavior, not administrative physical-piece cancellation. Do not invent a quantity ledger or select by incidental array order. Dispatched/delivered pieces cannot be cancelled; retain cancelled records.
- **FR-008**: For partial quantity, ADMIN explicitly selects exact eligible physical pieces in the existing cancellation dialog; quantity derives from that selection (D-007). Whole/item scopes resolve and show every affected identity. All scopes show resulting counts/money before confirmation. Reject zero/duplicate/foreign/stale/ineligible scope in full; changed membership requires renewed review, never substitution, skip or partial success. Preserve one physical piece per row; item/quantity controls cannot invent extra pieces.
- **FR-009**: Retain cancellation scope/reason/actual actor/time. Preserve optional custom reason; absent/blank records an honest administrative-action description, never a fabricated customer request. Supplied reason uses the existing 4000-character business-text bound with no silent truncation. Reuse P04 retained cancellation/finance meaning.
- **FR-010**: Cancellation/correction and required audit/effects succeed/fail together for the entire confirmed action. Repeated accepted intent recovers its original result without duplicate effects/history; changed/stale intent conflicts visibly. Races cannot commit incompatible state/authority outcomes. Unknown results require observation before another write. Explicit recovery of an unknown command performs a fresh observation of that exact original intent before any repeated write. A found receipt proceeds to synchronization only; a not-found observation permits only the same original ID and body without claiming the earlier request failed. Other observation failures preserve uncertainty and send no repeated write.
- **FR-011**: Recalculate cancellation total from remaining frozen prices and active identities once; preserve paid/prior terms/history. Show distinct nonnegative due/surplus; never clamp paid, erase overpayment or auto-refund/settle. Fully cancelled stays retained/non-deliverable.
- **FR-012**: Administrative correction opens the full existing tailoring paper. Eligible ADMIN may correct the order contact snapshot, promised date, signature, paper notes and fields for the existing order type, and specifications, measurements and paper codes on every retained piece. Preserve the order number/type, linked customer, physical identities and counts, frozen price and payment, lifecycle and prior evidence.
- **FR-013**: Any submitted order, including awaiting approval, returned, in-progress, delivered and fully cancelled retained orders, may receive FR-012 corrections by eligible ADMIN. Drafts remain outside this action. The full paper requires a nonblank reason within the existing 4000-character bound and explicit Save. At least one allowed value must change. Unsent cancel writes nothing.
- **FR-014**: Reuse existing field bounds, active catalog references and contact validation. Omitted fields preserve their current value; optional fields can clear. Required name, phone, model, size, base and decoration cannot clear. Invalid/foreign piece edits reject the entire save. Contact changes affect the order snapshot only.
- **FR-015**: Retain original submitted values and every before/after correction, reason and actor/department/time. Already-authorized detail/delivery/official-paper consumers show effective permitted corrections; prior delivery facts remain unchanged and history preserves original values. Do not overwrite historical actor names/departments or widen factory contact/finance access. Existing owner-sales and approval history surfaces receive only an order-visible administration summary: event/order identity, version/reference, operation, retained actor/time, exact selected piece IDs and changed-field labels. They receive no administration reason or before/after values. Full administration audit facts remain restricted to the administration context; ordinary effective order fields and original authorized historical snapshots retain their existing permissions.
- **FR-016**: Supply six existing operational report sections: KPI summary, department distribution, workforce, detailed orders, exceptions and endorsements. Do not introduce financial reporting or broaden output authority.
- **FR-017**: KPI, department, detailed-order, exception and print totals use one permitted order cohort selected by the intersection of applicable order filters (D-009). Department filtering selects orders having current active pieces in that department; distribution shows all current active pieces in those selected orders, not only pieces in the selected department. Cards/rows/counts and print use that cohort independently of screen pagination. Department piece counts represent current active location once. Preserve existing report exception populations: overdue under FR-005, currently delivery-failed, and orders with retained quality-correction history or currently returned to sales for correction. Historical/resolved correction inclusion must be labelled as history rather than outstanding work, and distinguished from a current returned revision. An order appears once per matching category; category-case total may count it in several categories and must be labelled separately from distinct affected-order count. Admin quality-correction active/resolved/all tabs remain based on actual retained cycles, without invented segment-derived dates/cycles. Administrative notes/contact edits are their own audit events, not fabricated quality-rework cycles.
- **FR-018**: Workforce is the separately labelled current staff directory using actual staff/status/assigned department/contact permitted to ADMIN (D-009). A department filter restricts this directory to that assigned department; order date/type/status/salesperson and other order-only filters do not restrict directory membership. Display actual row statuses and derive an active-staff headline from eligible active members of that directory scope. Distinguish historical actors from current directory entries; never infer assignments by name, fabricate titles or credit every worker with department totals. Department workload, if retained as role context, is labelled shared department context from the order cohort, never personal output. Role descriptions imply no personal productivity metric.
- **FR-019**: Filter URLs, preview and print agree. Print includes complete permitted filtered scope beyond the current screen page, accurate totals and pagination; fail visibly instead of silently truncating. Preserve six sections/A4 portrait and P04 official-order aliases/eligibility/effective approved content/A4 landscape/eight-row pagination.
- **FR-020**: Report metadata uses real generation actor/time and actual reference only if one exists. Missing endorsements/signatures remain unavailable/blank for manual signoff, never fabricated official claims. Denied/failed authoritative loading cannot leave stale print eligibility active.
- **FR-021**: Production routes/actions use real permitted persisted facts, without operational browser-storage/fixture identity/catalog/price/number/clock/mutation or API-failure fallback. Isolated development previews cannot populate real data, grant permissions, expose production reset or roll out real OTP.
- **FR-022**: Preserve routes/redirects, dialogs, paper/report layout, Arabic/RTL/Cairo and real status/unauthorized/error/account pages. Only accepted functional selection/correction/data/state additions occur within existing surfaces. A `prototype` path does not justify UI removal.
- **FR-023**: Distinguish initial loading, actual empty, refresh, denied/missing, validation, pending, confirmed persistence, conflict, read/write failure, malformed result and uncertain write outcome. Preserve safe dirty input; block duplicate/conflicting submits; require stale review. Synchronize affected lists/details/counts/history/money/print/report after confirmation; failed synchronization is not complete success. Late old-context replies cannot disclose or confirm another identity/order/action.
- **FR-024**: Failures/fallback use active Arabic UI language, field/action identification, safe known cause and concrete next action below. Preserve request-ID recovery without diagnostics; verify accessibility, keyboard/focus and wide/narrow layouts.
- **FR-025**: Full regression covers staff approval/current authority; shared customers/own sales; incomplete drafts; actual received catalog/decoration pricing/confirmed-number submission; return/correction/resubmission; all seven types through cutting/production; colleague continuation; single-piece A/B/C and sales reapproval; quality correction/packing; physical receipt; whole-order delivery/failure/retry; paid/surplus/cancellation; administrative correction; authorized order/report print.
- **FR-026**: Account for every roadmap Appendix A route and Appendix B reached action using current callers/classification, preserved redirects and development-only exclusions. Main browser paths use real isolated/staging backend/persistence; intercepted success/rendering/history alone cannot close acceptance.
- **FR-027**: Verify existing-account/populated upgrades, fresh migrations, full domain/account/security regression, direct unauthorized access, two users/tabs, stale/repeated/concurrent actions and API/database/mail failures/recovery. Preserve identities/constraints/terms/paid/history without unapproved resets/imports or unrelated data use.
- **FR-028**: Validate OPS-01 runtime admission before target-specific deployment: hosting/domain, mail, timezone, initial administrator identity, backup/restore arrangements and operator. Independent configurable-calendar planning and controlled isolated tests may proceed with their explicit test calendar. Reuse restricted provisioning, not public/in-app ADMIN escalation, fixture credentials or production local seed. Secrets remain outside artifacts/logs/chat. Under the owner-delegated recommended decision D-011, the selected production business calendar is Asia/Riyadh; actual target configuration must use and verify that value. Real host/domain, mail/account/admin identities, credentials and operator/storage references are required runtime facts, not values to fabricate to pass planning.
- **FR-029**: The agreed environment must provide HTTPS/same-origin application/API access, fail-closed production settings, real migration/startup/health/readiness, redacted logs and actual verification/recovery mail receipt. Missing dependencies fail honestly; templates/provider acknowledgement do not establish readiness.
- **FR-030**: Observe restart persistence and backup restoration into a disposable target preserving data/authority/history; record tested scope and responsible operator. Do not invent retention schedules, recovery-time/data-loss guarantees; OPS-01 must settle required arrangements before dependent operational work. The delegated baseline is a daily backup at 02:00 in the selected business calendar, retaining 14 successfully verified daily archives and the latest predeployment archive until a later release succeeds. Use approved encrypted off-host storage distinct from live database storage. Report measured recovery duration and remaining limits without a contractual recovery-time or data-loss guarantee.
- **FR-031**: Supply practical deployment/migration/mail/backup/restore/recovery/operator instructions and update existing product references to real commands/behavior. Separate fresh/reused/cached/failed/unperformed evidence and requirements/engineering/backend/frontend/browser/local/target-release verdicts. P08 stays incomplete while any mandatory phase/input/check/environment gate is open. Actual deployment/cutover/external actions need explicit action/environment authorization.

### Authority and Data Rules

| Operation                                      | Eligible ADMIN                                     | Other actors                                                        |
| ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Admin oversight/report/correction/cancellation | Current permitted states/resources only            | No new authority; direct access denied                              |
| Staff/customer/account                         | Existing P01/P02 behavior                          | Existing department/owner scope                                     |
| Paid update                                    | Separate P03 post-approval command                 | Owner sales under P03 only                                          |
| Official order paper                           | P04 revision/eligibility                           | Owner sales/approval under P04; no factory finance/contact widening |
| Warehouse delivery contacts                    | Effective permitted order contacts                 | P07 minimal contacts only                                           |
| Production provisioning/release                | Restricted procedure and environment authorization | No role/reset/preview bypass                                        |

- Stable identities, original snapshots, history and delivery attempts survive correction/cancellation. Read-only reports introduce no business writes.
- Entire confirmed administrative scope has one coherent result/audit, including rollback/races/recovery; grouping never creates a second authority.
- Existing exact-money/contact/text/date bounds apply. No currency/tax/rounding, capacity/performance target or history-deletion policy is added.

### Frontend and State Requirements

Preserve `/admin/dashboard`, `/admin/orders`, `/admin/orders/[orderId]`, `/admin/approvals`, `/admin/corrections`, `/admin/delivery-exceptions`, `/admin/activity`, `/admin/reports`, `/reports/print` and `/admin` redirect. Reuse real admin/customer/staff/account routes and existing sales customer perspectives; retain both official-order print aliases. D-007/D-008 authorize bounded selection/correction fields within existing cancel/reopen dialogs, not new pages.

The table specifies intended Arabic message meaning in English to keep this artifact English-only; implementation renders it in Arabic using established product vocabulary.

| Failure/state                                       | Intended localized meaning                                            | Recovery / preserved state                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Missing/invalid cancellation selection/quantity     | Identify required pieces or invalid quantity/current eligibility      | Correct selection; retain safe reason; no write                                    |
| Moved/dispatched/delivered/cancelled member         | Selected pieces cannot be cancelled in their current state            | Refresh/review exact scope; entire action unchanged                                |
| Missing reason/invalid contact/forbidden correction | Name affected field, missing versus invalid input, allowed correction | Correct field/reason; preserve allowed draft; no partial save                      |
| No effective correction                             | No allowed field changed                                              | Edit allowed field or cancel; no lifecycle action                                  |
| Invalid filter/date/page                            | Name invalid value or reversed range                                  | Correct filter; no broad fallback                                                  |
| Disappearing result page                            | Page no longer contains matching records                              | Recover valid page/current scope, never another resource                           |
| Failed admin/report read                            | Named data/report could not load                                      | Retry read; retain filters; no false empty/demo                                    |
| Malformed result                                    | Named operation returned unusable information                         | Reload/safe observation; no raw payload/fake success                               |
| Stale record/changed access                         | Record/access changed; save not confirmed                             | Retain safe draft, review or existing sign-in/access flow; withdraw forbidden data |
| Pending/failed synchronization                      | Action pending or saved result still needs refresh                    | Prevent conflicting writes; retry observation, not committed effect                |
| Lost write response                                 | Result cannot yet be confirmed                                        | Recover original intent after dialog closure; retain safe context                  |
| Unexpected failure                                  | Named action could not complete/be confirmed                          | Safe retry/observation and request ID; no guessed cause/diagnostics                |
| Missing timezone/operational setup                  | Required business-time/environment setup unavailable                  | State exact gate; no host/demo assumption or release claim                         |
| Mail/startup/backup/restore failure                 | Named operational check failed/remains unverified                     | Keep gate open; safe operator recovery; preserve existing data                     |

### Key Entities _(when data is involved)_

- **Administrative order projection**: Existing customer/owner/approval terms, physical pieces/counts/money and retained history under ADMIN authority.
- **Cancellation intent/result**: Reviewed exact identities/preconditions, retained reason/actor/time and before/after counts/money.
- **Administrative correction**: Order-only allowlisted changes, original/effective values, reason and actor/time without lifecycle/master mutation.
- **Operational report scope/result**: Filters, creation-date/business calendar, complete order cohort, six sections, real generation metadata/manual signoff.
- **Workforce projection**: Separately scoped current directory under D-009, with real status/assigned department/contact and explicitly shared operational context.
- **Readiness evidence**: Named environment/operator and observed migration/mail/health/restart/restore/cutover results; not a new product screen.

## Verification Requirements

Later implementation must extend/create discovered test files. PLAN chooses exact owners/interfaces/commands; this invocation runs documentation checks only.

- **VR-001**: Prove actual ADMIN/non-admin/revoked/owner/department read/write boundaries and unchanged denied state. Preserve customer-master versus order correction, warehouse minimal contacts, factory redaction and P04 print restrictions.
- **VR-002**: Prove list/count/drill-down/report scope with distinct owners/types/stages, overlapping exceptions, duplicate names, date/midnight/year boundaries, empty/out-of-range pages and multi-page print. Assert D-009 cohort/directory rules, including department versus order-only filters.
- **VR-003**: Prove accepted D-007 exact whole/item/partial cancellation, ineligible/mixed selections, receipt/count/money/full-cancellation and companion preservation. Compete cancellation/dispatch/paid/authority changes; induce required-save failure and inspect full rollback.
- **VR-004**: Prove current ADMIN correction eligibility, normalized fields, multi-piece isolation, active catalog validation, original/before-after evidence and unchanged master/price/work/delivery/paid facts. Test competing saves, audit failure and receipt replay.
- **VR-005**: Render actual pending/double-submit, safe draft retention, Arabic field/action recovery, closed-dialog result observation, denied/stale/late contexts and synchronized views. Main browser paths use real backend/persistence.
- **VR-006**: Exercise every admin/report route/dialog, both customer perspectives, filters/menus/pagination/print, all six sections, honest endorsements and wide/narrow RTL/keyboard/focus. Verify physical A4 portrait reports and preserved landscape order paper at 1/8/9/17 eligible rows, cancelled/empty cases.
- **VR-007**: Inventory Appendix A/B against current callers; complete FR-025's seven-type/cross-role flows and two-session/direct-denial/failure/recovery/no-fixture cases. Extend earlier suites rather than treating old task markers as fresh acceptance.
- **VR-008**: Use real migrated PostgreSQL for persistence/races/rollback/upgrade/restore, actual Express stack for HTTP and real browsers for navigation/cookies/print. Use owned disposable resources/cleanup. Later exit runs full applicable verification/build/harness checks with honest fresh/cached/failed evidence.
- **VR-009**: Prove fresh and populated/legacy-account upgrade without rewritten migration history, lost records or silent account approval; prove restricted admin provisioning and production seed/preview-reset denial.
- **VR-010**: After OPS-01 and explicit environment authorization, observe target HTTPS/routing/cookies, verification/recovery mail receipt, migrations, dependency-sensitive health, redacted logs, restart persistence and backup restore. Validate operator instructions against actual commands. Missing/failed/unperformed evidence leaves release open.

Backend behavior/review/testing precedes dependent frontend integration. Requirements quality, technical planning, local acceptance, production readiness and deployed release are distinct.

## Success Criteria _(mandatory)_

- **SC-001**: Under accepted filters, admin lists/details/counts/history/reports reproduce the same permitted facts after reload and in a second session. Empty/out-of-range/denied/failed results remain distinct.
- **SC-002**: Cancellation affects precisely reviewed eligible pieces once, preserves paid/history/companions, yields the example surplus and creates no deliverable cancelled order/refund. Invalid members/save failure leave the whole action unchanged.
- **SC-003**: Allowed corrections retain effective order-only fields and original/before-after/reason evidence. Forbidden/stale/denied changes preserve saved values/work/history; terminal work never restarts.
- **SC-004**: Six report sections/print obey D-009 across pages with real metadata/workforce and honest signoff. No doubled personal department workload, financial reporting or forbidden output appears.
- **SC-005**: Existing Arabic/RTL/Cairo, accessible wide/narrow interaction and portrait/landscape print survive. Failures retain safe draft/Arabic recovery without false success/empty/stale eligibility.
- **SC-006**: Every accepted seven-type/cross-role workflow and retained route/action has required evidence, including negative/race/retry/failure cases. Browser snapshots/fixtures/previews cannot grant production authority.
- **SC-007**: Fresh/populated migrations and disposable restoration preserve identities/terms/money/history/current account authority; cleanup affects no unrelated data/resources.
- **SC-008**: Full readiness requires earlier phase/input/regression acceptance, OPS-01 and actual authorized environment checks. Deployment is claimed only if separately authorized/observed; missing mail/restart/restore evidence remains incomplete.

## Assumptions and Decisions

- **D-001 — Scope**: [Root P08](../../plan.md#p08--administration-reports-full-regression-and-production-readiness), [phase delivery](../../docs/workflow/phase-delivery.md), [constitution](../../.specify/memory/constitution.md) and [handoff](../../docs/workflow/implementation-handoff.md) govern SPECIFY only. Root owner review and earlier phase decisions/progress remain unchanged.
- **D-002 — Upstream**: [P03](../003-catalog-pricing-submission/spec.md) D-002 confirms numbering; frozen terms/separate paid remain. [P04](../004-approval-reapproval-printing/spec.md) owns cancellation/finance/reapproval/print; [P07](../007-warehouse-receipt-delivery/spec.md) owns physical receipt, reviewed whole-order delivery, whole-batch integrity and minimal delivery contacts. Oversight changes none of them.
- **D-003 — Source versus intent**: Current quantity cancellation chooses array-order segments, reopen changes terminal status/captures only reason, workforce repeats department totals/uses unfiltered orders, and metadata contains demo values. These are gaps, not accepted precedent. The existing report filter/overdue helpers in `apps/web/src/features/prototype/state/workflow.ts` support FR-005's preserved creation-date/preset/overdue meaning with a real clock; missing endpoints inherit presets rather than silently changing period scope.
- **D-004 — Correction exception**: Root BR-19 permits order-only notes/contact/address correction despite ordinary submitted immutability. Preserve original terms/prior delivery facts and trace effective corrections for already-authorized consumers. No master/customer identity, specification/price or privacy change follows.
- **D-005 — Operational gates**: The owner delegated recommended decisions during the pre-IMPLEMENT remediation sequence. D-011 fixes the selected calendar/backup policy, and PLAN fixes the target topology and command mechanics. OPS-01 retains actual environment/domain/mail/admin/operator/storage inputs and observed execution evidence. Validate those real values before dependent target execution; do not fabricate identities/credentials or infer spending, deployment authorization or recovery guarantees. Independent configurable-time work and isolated tests may use a clearly declared test calendar under P03 D-006, without closing production gates.
- **D-006 — Language/bounds**: Conversation/artifacts are English; UI remains Arabic/RTL/Cairo and catalog/entered strings keep their language. Existing exact-money/contact/text bounds apply. PLAN resolves finite technical query/output bounds without invented business targets or unresolved material choices delegated to implementation.

- **D-007 — Exact cancellation selection, owner confirmed 2026-11-15**: The owner selected exact eligible physical pieces within the existing cancellation dialog, with quantity derived from selection. Review identities/counts/money before confirmation; dispatched/delivered pieces are ineligible and any invalid member rejects the entire action. No hidden deterministic selection, incidental array order or replacement is accepted.
- **D-008 — Administrative paper correction, updated 2026-11-25**: Edit the existing full paper for any submitted order, with selectable per-piece measurements and codes, a required reason, and explicit Save. Keep the order's commercial and operational facts and immutable historical records.
- **D-009 — Report cohort and current workforce, owner confirmed 2026-11-15**: The owner selected one order cohort for KPI/department/detail/exception/print totals and a separately labelled current staff directory. Department filtering also restricts staff; order date/type/status/salesperson filters affect orders only. Department chooses orders with current active pieces there; distribution shows all active pieces in those orders. Department quantities are shared context, never each employee's personal output.

- **D-010 — Owner-safe history, delegated recommendation accepted 2026-11-15**: Use a summary of administration event identity/version/reference, operation, retained actor/time, selected piece IDs and changed-field labels in the existing owner-sales/approval contexts. Exclude administration reason and before/after values there. Full audit facts belong to the administration context; factory/warehouse retain their cancellation-only minimal history. This resolves the prior projection conflict without expanding any role's authority.
- **D-011 — Operational preferences, delegated recommendation accepted 2026-11-15**: Select Asia/Riyadh as the production business calendar, independent of the developer computer/browser. Back up daily at 02:00 in that calendar to approved encrypted off-host storage distinct from live database storage. Keep 14 verified daily archives and the latest predeployment backup until a later successful release; pruning is a separately authorized runtime policy action. Record measured recovery outcomes without contractual RPO/RTO/uptime promises. PLAN owns the exact deployment topology/interfaces. Real runtime identities, domain, provider configuration, private credentials and storage/operator references remain required inputs; selecting a policy does not claim they exist or authorize deployment.
- **D-012 — Verification boundaries, delegated recommendation accepted 2026-11-15**: Prove database availability and mail/provider failures through the owning real HTTP/database/provider test boundaries. Browser evidence covers actual workflows, transport failures, lost committed replies, two contexts and current-authority recovery. Every required failure needs real evidence at its claimed boundary; the browser need not invent database/mail fault controls already proved by their proper owners.

## Phase Exit

Specification readiness includes owner-confirmed D-007–009 and the completed built-in requirements-quality review. The amended PLAN/TASKS owners provide the operation-specific designs and bounded execution handoff; this delegated sequence ends at read-only ANALYZE. OPS-01 remains scoped to actual target runtime inputs/execution; explicit isolated calendar planning/tests may proceed. This pre-IMPLEMENT sequence approves no application implementation, target action or roadmap completion.

Later P08 acceptance requires FR-001–031, VR-001–010, SC-001–008, complete P01–P07/regression and actual catalog/submission evidence, separate requirements/engineering reviews, backend acceptance before frontend integration, every route/reached action accounted for and preserved print/RTL/responsive behavior. Production readiness also requires confirmed OPS-01 and actual authorized environment/mail/restart/backup/restore/operator evidence. Report local acceptance and deployed release separately; any mandatory missing phase/input/check/environment evidence leaves P08 incomplete.

### Pre-IMPLEMENT remediation sequence

The owner authorized recommended resolutions and repetition of SPECIFY, CLARIFY, PLAN, CHECKLIST, TASKS and read-only ANALYZE, stopping before IMPLEMENT. This amendment preserves FR/VR/SC IDs and D-007–009, and records D-010–012. No additional question was needed: decisions were delegated, and real target input values remain explicitly validated runtime prerequisites. Source code, migrations, application tests and external actions are outside this sequence.
