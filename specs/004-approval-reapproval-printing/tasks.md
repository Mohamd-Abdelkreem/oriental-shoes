# Tasks: P04 Approval, Piece Decisions, Contact Reapproval and Official Printing

**Roadmap Phase**: P04 — Approval, per-piece decisions, customer-contact reapproval, and official printing  
**Feature Directory**: `specs/004-approval-reapproval-printing`  
**Input**: [specification](spec.md), [technical plan](plan.md), [data model](data-model.md), [backend blueprints](backend-design.md), [frontend blueprints](frontend-design.md), [wire contract](contracts/approval.md) and existing source/callers  
**Authorized Scope**: TASKS only, for this matching feature. This ledger creates bounded future work; it executes no implementation, application check, migration, workbook import, business action or release step.

Apply the [constitution](../../.specify/memory/constitution.md), [phase delivery](../../docs/workflow/phase-delivery.md), [implementation handoff](../../docs/workflow/implementation-handoff.md) and [engineering index](../../docs/engineering/README.md). The four groups below belong to one P04 feature. Root `plan.md` remains the protected roadmap; this feature's `plan.md` remains its accepted technical design. Existing P01–P03 foundations, owner-review/client-input gates and all prior artifacts are preserved.

## Task Format and Generation Rules

Every execution item uses `- [ ] T### [P?] [US#?] Description with exact file path`. All 46 start unchecked. Story labels identify primary ownership; shared prerequisites and acceptance tasks serve several stories without claiming independent deliverability. `[P]` identifies work that can run concurrently only after listed dependencies pass and only with different writers. Serialize generated-output builds, database mutation/check commands and evidence edits.

Existing owners below are source-grounded; CREATE identifies proposed outputs that do not yet exist. Reopen source before each batch, accounting for completed predecessors. Each brief fixes allowed work and tests; it does not authorize another stage or edits to accepted product/design owners. Local syntax choices need no approval; a new material product/interface/algorithm choice returns to its proper owner and blocks dependent work. No blanket refactor, new dependency, new screen, auth rebuild, framework reinitialization or migration rewrite is required.

The built-in [requirements checklist](checklists/requirements.md) contains the earlier 16/16 written-spec review. The [custom quality checklist](checklists/approval-reapproval-printing.md) has 40 reviewer-owned unchecked items. TASKS evaluates neither. T001 describes the evidence-based pre-code review authorized by a later IMPLEMENT request; it cannot preapprove future execution results. During code work, checklist markers remain read-only. Record actual execution evidence under the relevant brief without changing its accepted scope.

## Group 1: Scoped Intake and Actual Prerequisites

**Goal:** establish effective P04 selection, preserve the current worktree and review written requirements/design before code. Reuse recorded P03 acceptance with its original evidence boundary; current source is rechecked, and later required checks remain explicit.

- [x] T001 Reconcile P04 selection/current source and perform the pre-code requirements-quality intake in specs/004-approval-reapproval-printing/tasks.md and checklists/approval-reapproval-printing.md.

## Group 2: Required Backend, Tests and Acceptance

**Goal:** establish every required contract, durable invariant, current-authority command/read, projection and real HTTP outcome before dependent frontend work. Shared scalar/schema/data/executor tasks precede operation-specific tasks. Each operation includes its meaningful discovered tests and two review dimensions.

### Shared contracts, data and command foundation

- [x] T002 [P] Create P04 scalar/receipt/event-summary schemas and tests in packages/contracts/src/sales-orders/sales-order-values.schema.ts and packages/contracts/src/approval/approval-command.schema.ts / approval-event.schema.ts.
- [x] T003 Define P04 strict command/read/workflow/paper schemas and additive activity compatibility in packages/contracts/src/approval/approval.schema.ts and packages/contracts/src/sales-orders/sales-orders.schema.ts.
- [x] T004 [P] Add the three constrained P04 models/enums and retained relations in packages/database/prisma/schema.prisma without altering prior migrations or generating competing state.
- [x] T005 Create the additive P04 migration in packages/database/prisma/migrations/20261106000400_p04_approval_piece_issues/migration.sql and initial migration smoke coverage in packages/database/tests/integration/p04-approval-constraints.integration.test.ts.
- [x] T006 Extend packages/database/tests/integration/p04-approval-constraints.integration.test.ts, migration.integration.test.ts and schema-contract.test.ts, plus fixed owned cleanup in apps/api/src/test-support/reset-test-data.ts.
- [x] T007 Create ApprovalCommandExecutor, typed intent/hash/errors and receipt mapping in apps/api/src/modules/approval/approval-command-executor.ts, approval.types.ts, approval.errors.ts and approval.mapper.ts with unit/integration coverage.
- [x] T008 Implement root locking/current-rule/strict mapper seams in apps/api/src/modules/approval/approval.queries.ts, approval.rules.ts and approval.mapper.ts, and narrow sales action hints in apps/api/src/modules/sales-orders/sales-orders.mapper.ts.

### US1: Initial decisions and current review reads

- [x] T009 [US1] Implement approveInitial/returnInitial and real-decision fixture conversion in apps/api/src/modules/approval/approval.service.ts, approval.service.integration.test.ts and existing sales-orders service/query/HTTP integration owners.
- [x] T010 [US1] Implement listPending/dashboard/history reads in apps/api/src/modules/approval/approval.queries.ts and approval.service.ts with bounded/calendar/actor-scope cases in approval.queries.integration.test.ts.

### US2: Current-department reporting and A/B/C

- [x] T011 [US2] Implement reportIssue in apps/api/src/modules/approval/approval.service.ts with source/duplicate/independent-piece evidence in approval.service.integration.test.ts.
- [x] T012 [US2] Implement resolveIssue and private cancelIssuePiece in apps/api/src/modules/approval/approval.service.ts with A/B/C and target/history cases in approval.service.integration.test.ts.

### US4: Exact cancellation and paid concurrency

- [x] T013 [US4] Extend monetary/cancellation regressions in apps/api/src/modules/approval/approval.service.integration.test.ts and apps/api/src/modules/sales-orders/sales-orders.service.integration.test.ts.

### US3: Owner contact and mandatory piece review

- [x] T014 [US3] Implement submitContact in apps/api/src/modules/approval/approval.service.ts with four-field immutable proposal cases in approval.service.integration.test.ts.
- [x] T015 [US3] Implement reviewContact and private applyContactProposal in apps/api/src/modules/approval/approval.service.ts with retained target/rejection/cancellation cycles in approval.service.integration.test.ts.
- [x] T016 [US3] Implement owner contact queues/current-order workflow in apps/api/src/modules/approval/approval.queries.ts, approval.mapper.ts and approval.service.ts with scoped query coverage.

### US1: Compatible retained activity

- [x] T017 [US1] Create shared merged activity in apps/api/src/modules/sales-orders/order-activity.queries.ts and P04 event detail in apps/api/src/modules/approval/approval.queries.ts without altering historical P03 snapshots.

### US5: Authoritative official and factory paper

- [x] T018 [US5] Implement officialPaper/factoryPaper in apps/api/src/modules/approval/approval.service.ts, approval.queries.ts and approval.mapper.ts with witness/hold/private-output cases.

### US1: Shared HTTP composition and all-operation authority

- [x] T019 [US1] Create thin P04 HTTP adapters in apps/api/src/modules/approval/approval.controller.ts and approval.routes.ts; compose routes and OpenAPI in their existing owners.
- [x] T020 [US1] Create actual-app P04 HTTP matrix in apps/api/src/modules/approval/approval.http.integration.test.ts and extend affected apps/api/src/modules/sales-orders/sales-orders.http.integration.test.ts regressions.

### Complete backend acceptance

- [x] T021 Review all required P04 backend boundaries and record real contract/database/HTTP acceptance in specs/004-approval-reapproval-printing/tasks.md.

**Hard gate:** T021 requires complete actual backend behavior, real migrated PostgreSQL/HTTP evidence and separate requirements/engineering PASS verdicts. All T022–T038 explicitly depend on T021. A partial endpoint, test double, controlled approval fixture or design-readiness PASS cannot satisfy this gate.

## Group 3: Dependent Existing-Frontend Integration

**Goal:** replace reached local operational authority through existing Arabic/RTL/Cairo views, dialogs and paper using the accepted feature API/model/hooks seams. Preserve layout and interaction patterns; expose actual loading, denial, conflict, uncertain-result and recovery behavior.

### Shared capability scope

- [x] T022 Extend apps/web/src/shared/query/operational-scope.ts and its existing test with capability-specific P04 identity/current-scope helpers while preserving existing sales scope behavior.

### Story adapters and shared confirmed-command lifecycle

- [x] T023 [P] [US1] Create approval APIs and read hooks in apps/web/src/features/approval/api/approval.api.ts, approval-commands.api.ts and hooks/approval.hooks.ts with discovered adapter/query tests.
- [x] T024 [P] [US3] Create apps/web/src/features/sales/api/sales-contact.api.ts and hooks/sales-contact.hooks.ts with adapter and real QueryClient tests for owner-contact queue/detail.
- [x] T025 [P] [US5] Create apps/web/src/features/printing/api/order-paper.api.ts and hooks/order-paper.hooks.ts with strict official-paper adapter/query tests.
- [x] T026 Create apps/web/src/features/approval/model/approval-command-state.ts, hooks/approval-commands.hooks.ts and components/approval-command-recovery.tsx with uncertainty/scope/synchronization tests.

### US1: Approval review surfaces

- [x] T027 [P] [US1] Replace local reads in apps/web/src/features/approval/screens/approval-dashboard-view.tsx, approval-pending-view.tsx and approval-history-view.tsx with verified scoped queries and screen tests.
- [x] T028 [P] [US1] Connect apps/web/src/features/approval/screens/approval-decision-view.tsx and approval-return-modal.tsx using new approval-form/view models and focused decision tests.

### US2: Piece decision and reapproval actions

- [x] T029 [US2] Replace apps/web/src/features/approval/screens/approval-problem-resolution-modal.tsx and its three reached callers with current issue/proposal commands and tests.

### US3: Owner contact surfaces

- [x] T030 [P] [US3] Create apps/web/src/features/sales/model/sales-contact.model.ts and replace sales-problem-contact-modal.tsx with four-field proposal/request behavior and tests.
- [x] T031 [US3] Extend apps/web/src/features/sales/screens/sales-returned-view.tsx and its test with a separately paginated contact subsection and existing order-detail links.
- [x] T032 [US3] Extend apps/web/src/features/sales/screens/sales-order-detail-view.tsx and its test with all-submitted wrapper reads, matching-version contact/print hints and separate return notes.

### US1: Additive activity presentation

- [x] T033 [US1] Update apps/web/src/features/sales/model/order-view.model.ts, sales-activity-view.tsx and sales-order-detail-view.tsx with mixed-history presentation and capability-correct P04 event expansion tests.

### US4: Retained cancellation and monetary presentation

- [x] T034 [US4] Extend apps/web/src/features/sales/model/order-view.model.ts and current paper/model tests to map canonical cancelled lines while retaining exact server money and history.

### US5: Shared authoritative print family

- [x] T035 [P] [US5] Create apps/web/src/features/printing/components/print-access-boundary.tsx and tests, await both existing print route parameters, and add the compatible explicit ID prop to print-order-view.tsx without activating wider access.
- [x] T036 [US5] Extend apps/web/src/features/orders/components/order-paper-form-props.tsx, order-paper-form-screen.tsx, order-paper-form.tsx and paper-form.css with the typed compact approval annotation and row/long-name tests.
- [x] T037 [US5] Replace apps/web/src/features/printing/screens/print-order-view.tsx, activate PrintAccessBoundary in apps/web/src/app/(print)/layout.tsx and add official-view/preflight/native-print tests.

### Complete frontend boundary review

- [x] T038 Record frontend requirements/engineering review and fresh focused/full component evidence in specs/004-approval-reapproval-printing/tasks.md after T022–T037.

**Gate:** T038 requires complete focused/component/regression evidence and separate reviews. It leaves real browser journeys, actual reviewed-source acceptance and physical PDF inspection open for T039–T044. T035 prepares the print boundary without activating it; T037 changes the layout and authoritative view together.

## Group 4: Cross-Layer and Phase Exit

**Goal:** prove the implemented producer/consumer journeys in owned isolated infrastructure, document only verified behavior and complete actual full verification. Backend-only, component-only and synthetic-only results are not P04 phase acceptance.

- [x] T039 Extend private P04 browser fixtures/catalog evidence in apps/api/tests/e2e/server.ts, apps/web/e2e/global-setup.ts and apps/web/e2e/runtime.ts.
- [x] T040 [US1] Create the US1 real-stack journeys and shared private browser helpers in apps/web/e2e/approval-reapproval-printing.spec.ts.
- [x] T041 [US2] Add independent piece-report/A/B/C browser scenarios in apps/web/e2e/approval-reapproval-printing.spec.ts.
- [x] T042 [US3] Add owner contact, rejected-review recovery and cancellation-request journeys in apps/web/e2e/approval-reapproval-printing.spec.ts.
- [x] T043 [ US4] Add exact paid/surplus/full-cancellation browser acceptance in apps/web/e2e/approval-reapproval-printing.spec.ts.
- [x] T044 [US5] Complete official-print/privacy, reviewed-workbook and physical PDF acceptance in apps/web/e2e/approval-reapproval-printing.spec.ts.
- [x] T045 Update implemented P04 references in README.md and PROJECT_REFERENCE.md and record scoped evidence in specs/004-approval-reapproval-printing/tasks.md.
- [x] T046 Run complete P04 exit verification and record separate requirements/engineering/backend/frontend/phase/release verdicts in specs/004-approval-reapproval-printing/tasks.md.

**Exit:** accepted FR-001–029, VR-001–008 and SC-001–008 have current persistent/backend/frontend/browser/output evidence and separate requirements/engineering verdicts. P04 completion remains distinct from OPS-01/production/release acceptance, commit, push and deployment.

## Dependencies and Safe Execution

The table is authoritative execution order, not evidence that a prerequisite has run. All dependency IDs precede their consumers. After a later implementation authorization, the first bounded batch is T001; if it passes, T002 and T004 can run concurrently. Never begin a consumer because its predecessor is merely designed.

| Task          | Direct prerequisites                                                                                             | Primary story |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| [T001](#t001) | None                                                                                                             | Shared        |
| [T002](#t002) | T001                                                                                                             | Shared        |
| [T003](#t003) | T002                                                                                                             | Shared        |
| [T004](#t004) | T001                                                                                                             | Shared        |
| [T005](#t005) | T003, T004                                                                                                       | Shared        |
| [T006](#t006) | T005                                                                                                             | Shared        |
| [T007](#t007) | T003, T006                                                                                                       | Shared        |
| [T008](#t008) | T007                                                                                                             | Shared        |
| [T009](#t009) | T008                                                                                                             | US1           |
| [T010](#t010) | T009                                                                                                             | US1           |
| [T011](#t011) | T010                                                                                                             | US2           |
| [T012](#t012) | T011                                                                                                             | US2           |
| [T013](#t013) | T012                                                                                                             | US4           |
| [T014](#t014) | T013                                                                                                             | US3           |
| [T015](#t015) | T014                                                                                                             | US3           |
| [T016](#t016) | T015                                                                                                             | US3           |
| [T017](#t017) | T016                                                                                                             | US1           |
| [T018](#t018) | T017                                                                                                             | US5           |
| [T019](#t019) | T018                                                                                                             | US1           |
| [T020](#t020) | T019                                                                                                             | US1           |
| [T021](#t021) | T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020 | Shared        |
| [T022](#t022) | T021                                                                                                             | Shared        |
| [T023](#t023) | T021, T022                                                                                                       | US1           |
| [T024](#t024) | T021, T022                                                                                                       | US3           |
| [T025](#t025) | T021, T022                                                                                                       | US5           |
| [T026](#t026) | T021, T023, T024, T025                                                                                           | Shared        |
| [T027](#t027) | T021, T026                                                                                                       | US1           |
| [T028](#t028) | T021, T026                                                                                                       | US1           |
| [T029](#t029) | T021, T027, T028                                                                                                 | US2           |
| [T030](#t030) | T021, T024, T026, T028                                                                                           | US3           |
| [T031](#t031) | T021, T030                                                                                                       | US3           |
| [T032](#t032) | T021, T031, T028                                                                                                 | US3           |
| [T033](#t033) | T021, T032                                                                                                       | US1           |
| [T034](#t034) | T021, T033                                                                                                       | US4           |
| [T035](#t035) | T021, T022, T025                                                                                                 | US5           |
| [T036](#t036) | T021, T034                                                                                                       | US5           |
| [T037](#t037) | T021, T035, T036                                                                                                 | US5           |
| [T038](#t038) | T021, T022, T023, T024, T025, T026, T027, T028, T029, T030, T031, T032, T033, T034, T035, T036, T037             | Shared        |
| [T039](#t039) | T021, T038                                                                                                       | Shared        |
| [T040](#t040) | T039                                                                                                             | US1           |
| [T041](#t041) | T040                                                                                                             | US2           |
| [T042](#t042) | T041                                                                                                             | US3           |
| [T043](#t043) | T042                                                                                                             | US4           |
| [T044](#t044) | T043                                                                                                             | US5           |
| [T045](#t045) | T044                                                                                                             | Shared        |
| [T046](#t046) | T045                                                                                                             | Shared        |

Story dependencies reflect this coupled workflow: US1 initial approval establishes the state needed for US2; US2 referral enables US3; US4 cancellation is exercised from US2/US3; US5 consumes authoritative initial approval, contact-review holds and cancellation. These dependencies do not remove each story's distinct acceptance scenario. Shared endpoint/composition and backend acceptance cover all six commands before UI.

### Parallel opportunities per story

| Story / foundation | Safe example once prerequisites pass                                                   | Writer boundaries and serialization                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared foundation  | T002 alongside T004 after T001                                                         | Contracts versus Prisma only; wait for both before T005, serialize generators/builds.                                                                 |
| US1                | T023 alongside T024/T025 after T021/T022; later T027 alongside T028 after T026         | Distinct adapter/read-hook owners; dashboard/pending/history versus detail/form owners. T029 follows both screens.                                    |
| US2                | T029 alongside T030 after T027/T028 and their other prerequisites                      | Approval decision/form owners versus sales contact model/modal; T030 reads only the stable T028 form base, not T029's new schemas.                    |
| US3                | T024 alongside T023/T025; T030 alongside T029                                          | Distinct files after stated prerequisites. T031/T032 and later shared detail/activity edits are serial.                                               |
| US4                | T034 can coexist with T035 if T033 and all T035 prerequisites passed                   | Canonical order-view model versus print-access/routes/minimal ID signature. T036 follows T034; never parallelize edits to the same model/paper owner. |
| US5                | T025 alongside T023/T024; T035 can run alongside T027/T028 after all its prerequisites | Paper adapter then separate boundary/routes; T037 waits for both T035 and T036.                                                                       |

T039–T044 write one harness/spec in dependency order; do not parallelize their writers. Browser projects retain the checked-in worker/retry/artifact policy. Build and evidence commands sharing generated output or this ledger run serially even when source edits are independent.

### Independent story criteria

| Story    | Observable acceptance in an isolated admitted starting state                                                                                                                                                                                               | Main evidence owners                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| US1 (P1) | Real free-text return with separate notes reaches owner; correction/resubmission preserves terms; fresh approval releases all active pieces to cutting for all seven types, with own history and one winner under approve/return race.                     | T009/T010/T017/T020, T027/T028/T033, T040; all-seven-type persistence cases are backend evidence. |
| US2 (P1) | Real source-authorized report holds one piece; A/B/C retains exact target/history, changes only that piece and rejects stale/foreign/duplicate actions without changing companions.                                                                        | T011/T012/T020, T029, T041.                                                                       |
| US3 (P1) | Owner can propose only four fields, clear optional sole, submit notes/request; return-to-sales stays held, renewed acceptance resumes only at retained target and C never applies pending values. Closed-modal unknown recovery observes the same command. | T014–T016/T020, T024/T026/T030–T032, T042.                                                        |
| US4 (P1) | Cancel1500 from3300 with paid2000 yields total1800/due0/surplus200 and counts2/1/1 once; last-piece cancellation retains paid/history without refund or deliverable completion.                                                                            | T012/T013/T020, T034, T043.                                                                       |
| US5 (P1) | Both aliases enforce owner/approval/ADMIN/current revision and every pending hold; factory output omits nested finance/private data; physical1/8/9/17-row paper yields1/1/2/3 landscape pages and actual reviewed-source journey passes.                   | T018/T020, T025/T035–T037, T044.                                                                  |

### Implementation strategy

The suggested first demonstrable MVP is **US1's return → owner correction/resubmission → approval → cutting**, after the complete T021 backend gate and its frontend dependencies. The real journey is T040; it is not independently shippable P04 acceptance. All five P1 stories and T046 remain required for phase completion. An explicit narrower implementation request changes authorized execution scope, not these requirement/dependency gates.

Use focused checks inside each task and full checks at the recorded backend/frontend/exit gates. Do not repeatedly broaden testing after a clean applicable gate unless changes or unresolved evidence warrant it. Exact future commands belong to each brief and the [plan's command ledger](plan.md#actual-commands-and-their-future-use). Current manifests remain the command owner.

### Shared read-before-edit context

Every brief inherits the exact context below for its affected layer, then adds its operation-specific blueprint and current source/callers. Reopen owning guides at execution; a generic guide link does not replace the filled decisions.

| Tasks / boundary                                 | Mandatory guide headings in addition to specific brief references                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every ID                                         | [Code style](../../docs/engineering/code-style.md): Before writing a file; Naming and public interfaces; Cohesion and reuse; Async work. [Review](../../docs/engineering/code-review.md): sections1–4, including separate verdicts. [Testing](../../docs/engineering/testing.md): correct evidence; current harness/discovery; meaningful cases; cleanup; completion evidence. Documentation-only IDs use reference/format checks. |
| T002/T003 and wire-consuming T007–T020/T023–T037 | [API contracts](../../docs/engineering/api-contracts.md): sections2–7, raw versus parsed input, response parsing, protocol, command semantics and compatibility. [Security](../../docs/engineering/security.md): authority table, existing auth/transport, validation/output and safe errors.                                                                                                                                      |
| T004–T020/T039                                   | [Data patterns](../../docs/engineering/data-patterns.md): sections2–8, queries/projections, transaction order, exact money/history, forward migrations and owned isolation. [Backend](../../docs/engineering/backend-standard.md): sections2,4–6,8–9, thin adapters/service authority and lifecycle. Reuse existing injected clients; no generic command platform.                                                                 |
| T022–T038 and browser consumers                  | [Frontend](../../docs/engineering/frontend-standard.md): sections1–9, deliberate Next boundary, state ownership, queries/mutations/cancellation, form drafts and truthful async UI. [Web instructions](../../apps/web/AGENTS.md) and applicable installed `apps/web/node_modules/next/dist/docs/` guides before relying on framework behavior. Preserve reached prototype screens and paper.                                       |
| T039–T046                                        | Testing: Browser harness, Commands and their limits, Cleanup and test integrity; Security: Secrets/configuration/errors/logs; Review: coverage and verify/correct/close. Browser workers never access database credentials or manipulate persistence directly.                                                                                                                                                                     |

## Task Briefs

Each heading is the bounded execution owner for that task. Proposed dependencies are future outputs, not missing-current-source defects. Read the linked blueprints alongside the named current owners; exact paths are repository-relative unless explicitly private temporary artifacts. Record commands/results and reviews here only during a separately authorized execution.

### T001

**Reconcile current scope, requirements review and prerequisite evidence**

**Execution prerequisites**: None.

**Requirements / dependencies**: All stories; FR-001–029; constitution I/X/XI. Current intake is main at b9d2b3d with P04 artifacts untracked; this task is future execution, not a review performed by TASKS. Dependencies: none.

**Allowed file actions**: READ root plan.md, AGENTS.md, constitution, engineering guides, this feature spec/plan/designs and both checklists. APPEND scoped evidence to specs/004-approval-reapproval-printing/tasks.md. Before code only, toggle supported reviewer-owned markers in specs/004-approval-reapproval-printing/checklists/approval-reapproval-printing.md with concise evidence while preserving item text/IDs; leave the built-in requirements.md unchanged unless its owning SPECIFY/CLARIFY step is separately authorized. No application/config/SQL edits.

**Read-before-edit bundle**: Workflow sections 1–4 and requirements approval before implementation; Handoff section 4; Plan Intake, Constitution Check, Operation Blueprints and Design Readiness; actual git status/branch and .specify/feature.json; P03 tasks final acceptance; current source owners in each selected brief. Core engineering guides were read at phase intake; reopen every guide mapped to the selected boundaries and current callers.

**Ordered steps**:

1. Resolve requested task IDs/phase and effective feature selection, inspect existing edits, and preserve their ownership. Reconcile all referenced current signatures and actual prior P03 evidence without calling it a fresh test.
2. Inspect all 40 custom criteria and reuse the prior built-in 16/16 only where still supported. Record supported quality evidence; leave genuine unresolved requirements/design/source drift blocking only dependent work. A checkbox concerning future results cannot be approved merely to unlock code.
3. Record source revision, permitted IDs, reused versus unperformed prerequisite evidence and selected dependency-safe batch in this ledger. Recheck hooks against authorization; never invoke a later-phase/deploy/destructive hook. No routine batch confirmation is needed within a later explicit implementation authorization.

**Preserve / failure unchanged**: Root roadmap draft/owner-review and client-input states, accepted D-003–005 and prior progress remain unchanged. No guessed catalog/numbering/calendar, replacement worktree, database action, commit/push or application change.

**Tests / verification**: Use read-only git status --short --branch, script path resolution after inspecting current selection, current references and source. Requirements quality needs evidence for written criteria, not application checks; record REQUIREMENTS and ENGINEERING handoff verdicts separately. Runtime/test environment availability is not assumed.

**Done when**: The actual selected scope and dependency evidence are recorded; mandatory requirements-quality/design gaps are resolved by the proper authorized owner or explicitly block their dependent IDs. No implementation begins before this intake gate.

### T002

**Define scalar, receipt and event-summary contracts**

**Execution prerequisites**: T001.

**Requirements / dependencies**: FR-001/007/023–025; VR-001/003/005. One browser-safe shared owner, exact per-operation actor/version/metadata shapes. Dependencies: T001.

**Allowed file actions**: CREATE proposed packages/contracts/src/sales-orders/sales-order-values.schema.ts, packages/contracts/src/approval/approval-command.schema.ts, packages/contracts/src/approval/approval-event.schema.ts, packages/contracts/src/approval/approval-command.schema.test.ts and packages/contracts/src/approval/approval-event.schema.test.ts. MODIFY packages/contracts/src/sales-orders/sales-orders.schema.ts and packages/contracts/src/index.ts only for scalar extraction and compatible reexports; MODIFY packages/contracts/src/sales-orders/sales-orders.schema.test.ts for scalar/historical-shape preservation assertions only. Do not add the kind:approval activity union here: its full dependent workflow/fact schemas are T003 outputs.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. contracts/approval.md sections 1–4 and retained event-summary subsection; backend-design.md interface ledger/shared command protocol. Inspect existing sales-orders schema, sales-commands/command-receipt.schema.ts, account/account.schema.ts and http/http.schema.ts. Existing sales receipt actor restriction/full snapshots remain authoritative.

**Ordered steps**:

1. Extract accepted order status/stage/work-state/business-number scalar schemas with identical enum/regex/bounds and existing-name compatibility reexports, avoiding an approval↔sales schema import cycle.
2. Implement exact six-operation safe actor/receipt/outcome/data schemas and event summary; derive types from schemas and export deliberate symbols. REPORT output recovers generated issue identity; no financial/order snapshot enters receipt.
3. Add accepted/rejected strict-shape, actor, before+1 version, ID/outcome identity, nullable target, changed-field uniqueness and historical-sales receipt regression cases.

**Preserve / failure unchanged**: Preserve old SALES-only operation/actor schema, receipts, revision shapes and enum values. Reject unknown privileged fields and malformed output; no new backend route, generated database import or dependency.

**Tests / verification**: Run pnpm --filter @template/contracts test src/approval/approval-command.schema.test.ts src/approval/approval-event.schema.test.ts src/sales-orders/sales-orders.schema.test.ts, then contracts lint/check-types. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: New metadata/event scalars parse at their real contract boundary, all focused checks pass and old receipt/scalar compatibility remains proven; no backend acceptance claimed.

### T003

**Complete body, workflow, paper and history wire contracts**

**Execution prerequisites**: T002.

**Requirements / dependencies**: FR-001–029; accepted D-003–005; VR-001/004/005. Exact producer/consumer ledger before API wiring. Dependencies: T002.

**Allowed file actions**: CREATE proposed packages/contracts/src/approval/approval.schema.ts and packages/contracts/src/approval/approval.schema.test.ts. MODIFY packages/contracts/src/index.ts, packages/contracts/src/sales-orders/sales-orders.schema.ts and packages/contracts/src/sales-orders/sales-orders.schema.test.ts only for named exports, additive kind:approval activity union and compatibility cases. MODIFY packages/contracts/src/approval/approval-command.schema.test.ts and packages/contracts/src/approval/approval-event.schema.test.ts only for needed cross-refinement tests of the now-complete schemas.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. contracts/approval.md sections 2–9; spec US1–5/authority table; data-model.md exact bounds. Inspect current nonEmptyBoundedString, optional draft text capture, pagination and existing strict salesOrderRevisionData parsing.

**Ordered steps**:

1. Implement all six discriminated command bodies, params and queries exactly; sparse changes only model/size/leatherBase/sole IDs, sole=null clear, notes-only empty changes and CANCEL_REQUEST without changes.
2. Implement exact workflow/currentReturn/proposal/action-hint/queue/dashboard/history/fact/official/factory output shapes and cross-field invariants. Preserve nullable retained catalog references with exact labels; owner ADMIN may respond only for itself.
3. Extend outer SalesActivityItem with kind:approval while preserving draft/order variants and full P03 revision protocol. Add contract cases for all boundaries, 4000 text, page limits, approval stamps, pending holds, <=200 unique piece contexts and safe nested factory output.

**Preserve / failure unchanged**: Do not weaken old strict sales receipt/revision schemas, accept browser price/state/actor, concatenate bounded return notes or introduce source-language normalization. Actor ownership remains service-enforced in addition to schemas.

**Tests / verification**: Run pnpm --filter @template/contracts test src/approval/approval.schema.test.ts src/approval/approval-command.schema.test.ts src/approval/approval-event.schema.test.ts src/sales-orders/sales-orders.schema.test.ts; contracts lint/check-types. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: Every contract-ledger symbol/shape/error-relevant input is executable/tested and existing historical receipt/revision compatibility passes; no API stub or fixture success substituted.

### T004

**Add the bounded P04 Prisma model declarations**

**Execution prerequisites**: T001.

**Requirements / dependencies**: FR-004–025; VR-002/003/008. All constrained fields must match the accepted data owner. The verbatim rows below are an implementation checklist copied from data-model.md, not a competing owner; read surrounding named constraints/transition prose as well.

> | Proposed enum              | Values                                                                                                   | Meaning                                                            |
> | -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
> | `ApprovalCommandOperation` | `APPROVE_INITIAL`, `RETURN_INITIAL`, `REPORT_ISSUE`, `RESOLVE_ISSUE`, `SUBMIT_CONTACT`, `REVIEW_CONTACT` | Exactly the six P04 commands                                       |
> | `ManufacturingIssueState`  | `APPROVAL_REVIEW`, `SALES_CONTACT`, `REAPPROVAL`, `RESOLVED`                                             | Workflow of one issue cycle, distinct from normal department stage |
> | `PieceContactKind`         | `AMEND`, `CANCEL_REQUEST`                                                                                | Immutable submitted response intent                                |
>
> | Field                                              | Type / nullability                          | Invariant                                                                                                                                                                                  |
> | -------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | `commandId`                                        | UUID PK `approval_commands_pkey`            | Caller command identity, globally unique inside this protocol                                                                                                                              |
> | `operation`                                        | `ApprovalCommandOperation`                  | Fixed operation binding                                                                                                                                                                    |
> | `actorId`                                          | UUID, nonnull, User FK RESTRICT             | Actual authenticated actor                                                                                                                                                                 |
> | `actorFullName`, `actorRole`, `actorDepartment`    | VarChar(150), UserRole, nullable Department | Retained actual action-time identity; no email/token/password                                                                                                                              |
> | `orderId`                                          | UUID, SalesOrder FK RESTRICT                | Every P04 command targets one submitted aggregate                                                                                                                                          |
> | `pieceId`                                          | Nullable UUID                               | Null only for initial approve/return; other commands name one physical piece                                                                                                               |
> | `issueId`, `proposalId`                            | Nullable UUID                               | Typed semantic binding described below; never arbitrary detached IDs                                                                                                                       |
> | `expectedVersion`, `beforeVersion`, `afterVersion` | Nonnull Int                                 | expected=before, before in 1..2147483646, after=before+1                                                                                                                                   |
> | `payloadHash`                                      | Char(64)                                    | Lowercase SHA-256 canonical intent                                                                                                                                                         |
> | `decision`, `decisionNotes`                        | Nullable VarChar(32) / VarChar(4000)        | RESOLVE uses RETURN_TO_DEPARTMENT/SEND_TO_SALES/CANCEL; REVIEW uses ACCEPT/RETURN_TO_SALES/CANCEL; these operations require nonblank decision notes; both fields null for other operations |
> | `beforeFacts`, `afterFacts`                        | Nonnull JsonB                               | Bounded internal P04 fact records, not full SalesOrder DTOs or opaque caller JSON                                                                                                          |
> | `outcome`                                          | Nonnull JsonB                               | Exactly the strict metadata-only `ApprovalCommandOutcome` contract                                                                                                                         |
> | `occurredAt`                                       | Timestamptz(6), nonnull                     | One server instant for command/state/history                                                                                                                                               |
>
> | Field                                                                  | Type / nullability                              | Invariant                                                                            |
> | ---------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
> | `id`                                                                   | UUID PK                                         | Server-created stable issue identity                                                 |
> | `orderId`, `pieceId`                                                   | UUID, nonnull                                   | Composite FK `(piece_id,order_id)` → SalesOrderPiece `(id,order_id)`, RESTRICT       |
> | `cycle`                                                                | Int, nonnull                                    | Positive, per-piece increasing; computed while root locked                           |
> | `state`                                                                | ManufacturingIssueState                         | One current workflow state                                                           |
> | `sourceDepartment`                                                     | Department                                      | CUTTING/PRODUCTION/QUALITY only                                                      |
> | `sourceStage`                                                          | SalesPieceStage                                 | Exact matching CUTTING/PRODUCTION/QUALITY stage at report                            |
> | `sourceWorkState`                                                      | SalesPieceWorkState                             | INCOMING or IN_PROGRESS at report                                                    |
> | `reporterId`, `reporterFullName`, `reporterRole`, `reporterDepartment` | User UUID FK RESTRICT, retained identity fields | Actual reporter; admin allowed, employee department equals source                    |
> | `reason`, `notes`                                                      | VarChar(4000), nonnull reason / nullable notes  | Required nonblank reason; optional absence is null                                   |
> | `reportedAt`, `updatedAt`                                              | Timestamptz(6), nonnull                         | Real report/workflow instants                                                        |
> | `reportedCommandId`                                                    | UUID, nonnull, unique command FK RESTRICT       | Its immutable REPORT_ISSUE witness; deferred because command inserts after issue     |
> | `resumeTarget`                                                         | Nullable SalesPieceStage                        | Only CUTTING/PRODUCTION; required after first sales referral and retained thereafter |
> | `latestProposalId`                                                     | Nullable UUID                                   | Composite FK with issue ID; points to this issue's latest immutable proposal         |
> | `resolvedAt`, `resolutionCommandId`                                    | Nullable instant / UUID command FK RESTRICT     | Both nonnull iff state RESOLVED                                                      |
>
> | Field                                                                          | Type / nullability                               | Invariant                                                                                                                         |
> | ------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
> | `id`                                                                           | UUID PK                                          | Server-created proposal identity                                                                                                  |
> | `orderId`, `pieceId`, `issueId`                                                | UUID, nonnull                                    | Composite FK `(issue_id,order_id,piece_id)` → issue; RESTRICT                                                                     |
> | `sequence`                                                                     | Positive Int                                     | Per-issue increasing under root lock; unique `(issue_id,sequence)`                                                                |
> | `kind`                                                                         | PieceContactKind                                 | AMEND or CANCEL_REQUEST                                                                                                           |
> | `submittedCommandId`                                                           | UUID, nonnull                                    | Unique FK to its SUBMIT_CONTACT command, RESTRICT                                                                                 |
> | `submittedById`, `submittedByFullName`                                         | User UUID FK RESTRICT, VarChar(150)              | Actual owner with current SALES/ADMIN authority; no on-behalf exemption; actor/time also in command                               |
> | `contactNotes`                                                                 | VarChar(4000), nonnull                           | Nonblank recorded communication, never proof of external delivery                                                                 |
> | `beforeModel`, `beforeSize`, `beforeLeatherBase`, `beforeSole`                 | VarChar(200); first three nonnull, sole nullable | Exact retained approved labels from base capture, never caller-authored snapshot values                                           |
> | `beforeModelId`, `beforeSizeId`, `beforeLeatherBaseId`, `beforeSoleId`         | Nullable CatalogEntry UUID FKs                   | Existing retained bindings when present; missing prior optional references are not fabricated                                     |
> | `proposedModel`, `proposedSize`, `proposedLeatherBase`, `proposedSole`         | Nullable VarChar(200) columns                    | AMEND requires first three labels; sole nullable; CANCEL_REQUEST has all null                                                     |
> | `proposedModelId`, `proposedSizeId`, `proposedLeatherBaseId`, `proposedSoleId` | Nullable CatalogEntry UUID FKs                   | Supplied changed selections resolve real IDs; omitted retained selections may retain null references; CANCEL_REQUEST has all null |
> | `submittedAt`                                                                  | Timestamptz(6), nonnull                          | Actual submission instant                                                                                                         |

**Allowed file actions**: MODIFY only packages/database/prisma/schema.prisma for ApprovalCommand, ManufacturingIssue, PieceContactProposal, their three enums, inverse retained relations and specified composite unique relations. Generated Prisma output is produced by the existing db:generate script, never hand-edited. No migration SQL in this task.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. data-model.md Existing owners and immutable boundaries; New enums and models; Existing-model additions. Inspect current SalesDraft/SalesOrder/SalesOrderPiece/CatalogEntry/SalesCommand and packages/database/prisma.config.ts / package.json. Existing source retains P03 immutable fields and one root version.

**Ordered steps**:

1. Translate the quoted exact field/type/nullability/enum/invariant rows to mapped Prisma declarations, reusing existing IDs/enums/money/state rather than a second workflow quantity authority.
2. Add the specified composite uniques/relations and explicit RESTRICT retention; keep the circular FK deferral/custom checks owned by T005 authored SQL, since Prisma relation syntax does not encode deferral.
3. Generate the configured client and validate schema using existing package scripts; inspect generated changes and leave prior SQL/provenance/credentials unchanged.

**Preserve / failure unchanged**: No data backfill, fixture import, reset, db:push or application database migration. Preserve every original model invariant and historical command protocol.

**Tests / verification**: Run pnpm --filter @template/database db:validate and pnpm --filter @template/database db:generate in the selected implementation checkout; no claims about constraint execution until T005/T006. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: Schema matches every quoted row/relationship and generation/validation passes without manual generated-code edits; SQL/persistence gates remain explicitly pending.

### T005

**Author the forward retained-graph migration**

**Execution prerequisites**: T003, T004.

**Requirements / dependencies**: FR-007–025; VR-002/003/008. Apply data-model.md named checks and exact transition table; preserve all nine pre-existing SQL files/checksums. Exact circular/transition obligations are quoted here:

> The authored forward SQL, not Prisma's relation syntax, owns circular deferral. The following named FKs are **DEFERRABLE INITIALLY DEFERRED**, all ON DELETE RESTRICT: `manufacturing_issues_reported_command_fkey` (`reported_command_id` → commandId), `manufacturing_issues_resolution_command_fkey` (`resolution_command_id` → commandId), `piece_contact_proposals_submitted_command_fkey` (`submitted_command_id` → commandId), `manufacturing_issues_latest_proposal_fkey` (`latest_proposal_id,id` → proposal `(id,issue_id)`), `sales_order_pieces_current_issue_fkey` (current issue/order/piece binding), `approval_commands_issue_fkey` (issue/order/piece binding), `approval_commands_proposal_fkey` (proposal/issue binding). Parent order/actor/catalog FKs without a cycle may remain immediate RESTRICT. This permits work to insert an issue/proposal or mark resolution before inserting the one immutable command while still rejecting a missing witness at commit.

> Named checks `ck_manufacturing_issues_source` and `ck_manufacturing_issues_state` enforce the source-stage/department/work-state mapping, retained reporter role/department compatibility, nonblank bounded reason and terminal/nonterminal target/proposal/resolution shape described above. `ck_approval_commands_actor` checks retained operation actor snapshots (APPROVAL or ADMIN for decisions; matching source employee or ADMIN report; SALES/ADMIN plus actual owner at submit). `ck_approval_commands_decision` checks operation-specific decision/notes presence. Contextual cross-row owner/source checks belong in `check_approval_order_graph`, under root serialization, not a fake CHECK that queries other tables.

> `enforce_manufacturing_issue_transition` BEFORE INSERT/UPDATE enforces initial APPROVAL_REVIEW and only APPROVAL_REVIEW→SALES_CONTACT/RESOLVED, SALES_CONTACT→REAPPROVAL, REAPPROVAL→SALES_CONTACT/RESOLVED. A resolved row cannot change/reopen. Once resumeTarget is nonnull it cannot change. RETURN_TO_SALES preserves latestProposalId; SALES_CONTACT→REAPPROVAL must attach a newly submitted higher-sequence proposal. The graph's current-command witness validates which permitted operation caused the transition. Illegal transitions use `ck_manufacturing_issue_transition`; they are not permitted merely because final nonnull fields look plausible.

> New `check_approval_order_graph(orderId)` runs as DEFERRABLE INITIALLY DEFERRED constraint triggers on the new three tables and updates to SalesOrder/SalesOrderPiece/SalesDraft. It verifies final transaction state: Dependencies: T003, T004.

**Allowed file actions**: CREATE proposed packages/database/prisma/migrations/20261106000400_p04_approval_piece_issues/migration.sql if that identifier remains unused; if another accepted migration has claimed it, stop and route the replacement forward identifier to the authorized design owner. CREATE proposed packages/database/tests/integration/p04-approval-constraints.integration.test.ts with initial smoke/witness cases. No existing migration SQL or source-state rewrite.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. data-model.md Existing-model additions and final graph checks / Transition table / Forward migration and existing-data strategy; backend shared protocol/B01–B05. Inspect current P03 immutable/graph SQL and the frozen-decoration forward repair, current migration harness/global setup.

**Ordered steps**:

1. Author additive enums/tables/indexes/checks/retained triggers/composite FKs. Make every named circular FK DEFERRABLE INITIALLY DEFERRED and ON DELETE RESTRICT. Keep old P03 trigger functions unchanged.
2. Implement new legal issue transitions, immutable event/proposal/source bindings, head-only current-fact witnesses and new-return/new-approval transition witnesses. Preserve untouched valid P03 approved/returned fixture graphs; never require historical actor current department or old afterFacts to equal later state.
3. Add fresh-deployment smoke and missing-command-witness-at-commit rollback cases. Pre-existing orphan issue pointers block the binding migration diagnostically; do not erase them or synthesize past history.

**Preserve / failure unchanged**: No developer/production data, reset, db:push or fabricated backfill. Failures leave the entire owned transaction unchanged; missing actual approval witness still fails closed at paper reads.

**Tests / verification**: Use only disposable migrated PostgreSQL from the existing database integration runner: pnpm --filter @template/database test:integration tests/integration/p04-approval-constraints.integration.test.ts. Inspect deferred commit failure, complete rollback and migration SQL review. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: The exact additive migration installs in isolation, meaningful smoke/witness rollback passes and old SQL stays byte-identical; full populated/inventory/constraint acceptance belongs to T006.

### T006

**Verify migrated constraints, populated upgrades and owned cleanup**

**Execution prerequisites**: T005.

**Requirements / dependencies**: FR-007–025; VR-002/003/008. Database evidence covers actual constraints/retention/upgrade, not mocked transactions. Dependencies: T005.

**Allowed file actions**: MODIFY packages/database/tests/integration/p04-approval-constraints.integration.test.ts, packages/database/tests/integration/migration.integration.test.ts, packages/database/tests/schema-contract.test.ts, packages/database/tests/integration/seed.integration.test.ts, apps/api/src/test-support/reset-test-data.ts, apps/api/src/test-support/reset-test-data.test.ts and apps/api/src/test-support/reset-test-data.integration.test.ts. Add exactly the three P04 tables to fixed owned truncate lists/assertions, preserving all existing ownership guards; no broad CASCADE or runtime cleanup widening.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. data-model.md Planned verification owners and all named constraint/migration sections; docs/engineering/data-patterns.md migration/testing sections. Inspect existing global setups, migration inventory/populated upgrade tests, P03 direct SQL fixture and owned reset guards/sentinel cases.

**Ordered steps**:

1. Cover wrong source/target/owner/operation, cross-order links, two open issues, immutable records, illegal reopen/target changes, kind/label/ref consistency, root/event versions and complete commit rollback on missing witnesses.
2. Extend exact inventory expectations and populated P03 upgrades including awaiting/approved/returned controlled graphs; compare all old rows/checksums and repeated deployment. Assert orphan issue pointers fail without mutation or invented witnesses.
3. Extend only fixed owned cleanup lists for the three tables while retaining NODE_ENV/marker/URI/database guards and unrelated-FK refusal/sentinel preservation. Run actual disposable DB/API cleanup evidence.

**Preserve / failure unchanged**: Preserve user credentials, old command bytes, submitted contacts/prices/sequences and all meaningful prior assertions. Historical fixture states remain labelled; no synthetic P04 acceptance claim. T006 proves data constraints/cleanup/inventory only. Existing P03 successful postmigration direct approval/return updates will be incompatible with the new witness triggers until T009 supplies actual initial-service fixture transitions. Do not run/claim all prior API or browser integration suites here, synthesize witness rows to force them green, or weaken the new triggers; T009 owns the three discovered API fixture files and root T039 owns the browser child fixture.

**Tests / verification**: Run pnpm --filter @template/database test tests/schema-contract.test.ts; pnpm --filter @template/database test:integration tests/integration/p04-approval-constraints.integration.test.ts tests/integration/migration.integration.test.ts tests/integration/seed.integration.test.ts; pnpm --filter @template/api test src/test-support/reset-test-data.test.ts and test:integration src/test-support/reset-test-data.integration.test.ts. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: Fresh/populated/repeated migration, negative constraints, temporal retention and exact owned cleanup pass on real isolated PostgreSQL; missing infrastructure leaves this task open.

### T007

**Implement the bounded P04 command executor**

**Execution prerequisites**: T003, T006.

**Requirements / dependencies**: FR-001/007/027; VR-002/003. Separate P04 metadata-only protocol, preserving accepted SalesCommand behavior. Dependencies: T003, T006.

**Allowed file actions**: CREATE proposed apps/api/src/modules/approval/approval-command-executor.ts, apps/api/src/modules/approval/approval.types.ts, apps/api/src/modules/approval/approval.errors.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval-command-executor.test.ts and apps/api/src/modules/approval/approval-command-executor.integration.test.ts. CREATE proposed test-only apps/api/src/test-support/approval.fixture.ts if shared coherent graph construction is needed. Reuse apps/api/src/test-support/reviewed-catalog.fixture.ts and apps/api/src/test-support/reset-test-data.ts without a production fixture endpoint or broader cleanup.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. backend-design.md Interface/helper ledgers and Shared command protocol; contracts sections 3/4/7/8; data command bindings. Read current sales-command-executor/types/errors/mapper, auth/account-authority.ts and actual Prisma transaction API owners. The sales executor is SALES-only; do not broaden it.

**Ordered steps**:

1. Implement exact six-operation execution/hash/work-result unions and canonical hash of request-selected IDs/version/intent; preserve omission versus sole=null and fixed field order.
2. Implement account lock/current per-operation authority, namespaced advisory lock, exact stored-command replay, bounded recognized retry and one atomic state/history outcome. REPORT generated issue IDs and SUBMIT generated proposal IDs are recovered from stored result, not compared with absent request slots.
3. Map/parse strict metadata receipt/outcome only; actor-only observe helpers enforce current operation authority, including same retained source department for report recovery after movement. Add real transaction replay/conflict/rollback/authority tests with controlled valid work, labelled executor-boundary evidence.

**Preserve / failure unchanged**: No SalesCommand enum/table/parser/executor changes, arbitrary retries, private snapshots in receipt, duplicate effects or unknown-commit-as-failure claim. Refuse other actors and changed intent.

**Tests / verification**: Run pnpm --filter @template/api test src/modules/approval/approval-command-executor.test.ts and test:integration src/modules/approval/approval-command-executor.integration.test.ts; API lint/check-types after dependency builds as required. Real rollback/races use independent owned connections. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: Exact replay returns one stored safe outcome, changed binding conflicts, recognized retries are bounded and all authority/rollback cases pass; this is not yet complete approval-service acceptance.

### T008

**Implement shared P04 root, rules and mapper seams**

**Execution prerequisites**: T007.

**Requirements / dependencies**: FR-001–003/007/009/019/025/028; VR-002/003/005. Reuse one root version/current actor and existing sales/factory/exact-money projections. Dependencies: T007.

**Allowed file actions**: CREATE proposed apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.rules.test.ts and apps/api/src/modules/approval/approval.queries.integration.test.ts. MODIFY apps/api/src/modules/approval/approval.types.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/sales-orders/sales-orders.mapper.ts and apps/api/src/modules/sales-orders/sales-orders.queries.test.ts for the exact shared seams and pure action-hint regression. Existing apps/api/src/modules/sales-orders/sales-orders.queries.integration.test.ts success-fixture conversion waits for real initial methods in T009; do not claim that incompatible suite here. Private service helpers retain exact blueprint ownership but are implemented at first real use in T009/T012/T015, with no unused stubs.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. backend helper/selected-record ledger and B07; contracts workflow/action hints; inspect SALES_ORDER_SELECT/mapSalesOrder/mapFactoryOrder and current return proof/money/count helpers. Existing mapper assumes SALES guard; wider approval readers require the recorded narrow hint correction.

**Ordered steps**:

1. Implement lockApprovalOrder exact trusted-scope signature and selected-record aliases; use actor-safe root FOR UPDATE/expectedVersion/max-version predicates and same transaction client.
2. Implement pure current issue/action/print eligibility rules and strict bounded mapper selections required by later operations, preserving typed labels/null retained refs and action-time actors.
3. Correct canResubmit/canSetPaid hints exactly as B07: former owner now APPROVAL gets no sales hints, ADMIN paid exception remains broader, contact always actual owner. Add rule/root/hint regression cases without private-internal tests or incomplete command success stubs.

**Preserve / failure unchanged**: Preserve P03 response shape/money/factory fields and permission enforcement; action hints never grant authority. Wrong owner/version/graph yields safe denial/conflict, no write or fallback.

**Tests / verification**: Run focused approval.rules.test.ts, the new approval.queries.integration.test.ts root-lock cases and existing sales-orders.queries.test.ts pure cases via API test/test:integration scripts, plus API lint/check-types. Do not claim all prior P03 integration suites until T009 converts their successful approval/return fixtures through actual service decisions. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test src/modules/approval/approval.rules.test.ts src/modules/sales-orders/sales-orders.queries.test.ts
pnpm --filter @template/api test:integration src/modules/approval/approval.queries.integration.test.ts
```

**Done when**: Shared rules, locks/selection and widened-reader hint behavior are tested and usable by real operations; unused private implementations wait for first caller, with no lint suppression.

### T009

**Implement initial approve and free-text return**

**Execution prerequisites**: T008.

**Requirements / dependencies**: FR-001–007; SC-001/005; backend B01. Actual initial decision and P03 proof boundary. Dependencies: T008.

**Allowed file actions**: CREATE proposed apps/api/src/modules/approval/approval.service.ts and apps/api/src/modules/approval/approval.service.integration.test.ts. MODIFY apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.rules.ts and apps/api/src/modules/approval/approval.mapper.ts only for B01 integration. MODIFY apps/api/src/test-support/approval.fixture.ts, apps/api/src/modules/sales-orders/sales-orders.service.integration.test.ts, apps/api/src/modules/sales-orders/sales-orders.queries.integration.test.ts and apps/api/src/modules/sales-orders/sales-orders.http.integration.test.ts only for actual return-proof/resubmit compatibility and successful direct-transition setup through real approveInitial/returnInitial. Preserve deliberate malformed-proof/forbidden-SQL negative tests. apps/api/tests/e2e/server.ts is excluded here; root T039 owns its post-backend fixture conversion.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. B01 and shared protocol/private helper signatures; contracts initial bodies; data new-transition witnesses. Read current SalesOrdersService.resubmit/readCurrentOrderReturnProof and immutable return proof/graph SQL.

**Ordered steps**:

1. Implement constructor and real approveInitial/returnInitial methods; implement private advanceApprovalOrderVersion at first real use with exactly one conditional root bump.
2. Require current pending initial revision/all retained active pieces; approve all seven types to CUTTING/INCOMING once, or set current return proof to this real command/new root version and retain reason/optional notes separately without release.
3. Convert only successful postmigration direct AWAITING_APPROVAL→RETURNED/APPROVED fixtures in the existing service/query/HTTP integration files to real current ApprovalService decisions using the owned synthetic approver/ADMIN. Keep intentionally invalid SQL transitions as negative cases; do not fabricate witness events or weaken triggers/assertions. Update expected root versions/real CUTTING/INCOMING release only where the actual fixture transition changes them.
4. Test actual return→P03 permitted correction/resubmit→approve, optional notes, frozen terms/history, approve-versus-return race, duplicate/unknown result and controlled after-piece-write failure rollback.

**Preserve / failure unchanged**: No repair shortcut, new piece, reprice/customer/number change, concatenated over-limit reason, unapproved release or fabricated approval actor. Failure preserves entire prior graph/history.

**Tests / verification**: Run pnpm --filter @template/api test:integration src/modules/approval/approval.service.integration.test.ts src/modules/sales-orders/sales-orders.service.integration.test.ts src/modules/sales-orders/sales-orders.queries.integration.test.ts src/modules/sales-orders/sales-orders.http.integration.test.ts; relevant rules tests and API lint/types. Broader pre-existing API regression becomes mandatory at backend acceptance T021, after every fixture/interface dependency is complete. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: Both initial commands and real P03 return/resubmit journey persist coherently with one winner/event/root version and complete rollback evidence; no frontend wiring.

### T010

**Implement pending/dashboard/own-decision reads**

**Execution prerequisites**: T009.

**Requirements / dependencies**: FR-002/003/027; SC-001/008; backend B06. Consistent existing approval queues/counts and current approver history. Dependencies: T009.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.queries.integration.test.ts and apps/api/src/modules/approval/approval.rules.test.ts for the pending/dashboard/own-history boundary. Reuse apps/api/src/core/config/order.config.ts and apps/api/src/modules/sales-orders/sales-orders.errors.ts without configuration or policy edits.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. B06 current reads; contract dashboard/queue/history ledger; current parsePaginationQuery/buildPaginationMeta, orderConfig/parseOrderBusinessTimeZone and SalesOrders.calendar source. No existing business-day-range helper is assumed.

**Ordered steps**:

1. Implement current-approval/ADMIN read transaction scope, bounded pending row/count queries and own actor decision history excluding report/contact operations.
2. Compute role-wide approvedToday from actual APPROVE_INITIAL events with parameterized configured-zone day bounds; returnedOrders is distinct CURRENT RETURNED roots, not a today count. Missing calendar returns existing 503 only for dashboard.
3. Test two approvers, filters/count/page/empty/out-of-range order, timezone boundaries/DST with controlled instant, no host/demo fallback and unchanged commands when calendar is absent.

**Preserve / failure unchanged**: No unbounded history/JSON fetch, fake empty on failure, actor-ID override or counting fixture approvedAt as actual decision. Current authority checked within consistent read snapshot.

**Tests / verification**: Run pnpm --filter @template/api test:integration src/modules/approval/approval.queries.integration.test.ts and test src/modules/approval/approval.rules.test.ts; API lint/types. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: Rows/counts/calendar/history match accepted semantics under real migrated reads and current actors; all denial/error cases remain truthful.

### T011

**Implement current-department issue reporting**

**Execution prerequisites**: T010.

**Requirements / dependencies**: FR-008/009; SC-002/005; B02. One retained issue cycle affects exactly one current-department piece. Dependencies: T010.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.service.integration.test.ts and apps/api/src/test-support/approval.fixture.ts only for current-department reporting and labelled isolated downstream setup.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. B02/shared protocol/data transition/source/partial-open-index rules. Read current Department/SalesPieceStage/workState enums and source piece/approval-report UI only as presentation reference; P05/P06 work controls remain excluded.

**Ordered steps**:

1. Validate header APPROVED, exact current piece source, INCOMING/IN_PROGRESS, no receipt/cancellation/current issue and current source department or ADMIN; derive reporter/source/time.
2. Allocate next issue cycle under root lock, insert immutable source/report witness binding and set only selected piece BLOCKED/current issue pointer while retaining source stage.
3. Record one root/event/outcome; test all three source departments, ADMIN actual source, wrong role/foreign/stale/duplicate/concurrent issue and later legitimate cycle without overwriting history.

**Preserve / failure unchanged**: Companions continue unchanged; no whole-order return, factory finance, browser source/actor authority, manufactured receipt/start/completion or P05/P06 wiring.

**Tests / verification**: Run focused approval.service.integration.test.ts and executor/rule regression via API scripts; inspect actual persisted cycle/pointer/event and complete failure rollback. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test:integration src/modules/approval/approval.service.integration.test.ts
pnpm --filter @template/api test src/modules/approval/approval.rules.test.ts src/modules/approval/approval-command-executor.test.ts
```

**Done when**: Authorized report source is retained once, wrong/duplicate actions are denied without effects and factory command response is metadata-only.

### T012

**Implement A/B/C and retained cancellation**

**Execution prerequisites**: T011.

**Requirements / dependencies**: FR-010–015; SC-002/004/005; B03. Current approval decision over one unresolved piece. Dependencies: T011.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.mapper.ts and apps/api/src/modules/approval/approval.service.integration.test.ts for A/B/C and the first-used retained cancellation helper. Reuse apps/api/src/modules/sales-orders/sales-orders.rules.ts exact money/count exports without changing their policy.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. B03, private helper signature, data issue transition/target immutability/cancellation constraints; contract resolve union and error codes. Read P03 exact monetary functions/graph-total check and canonical paid owner behavior.

**Ordered steps**:

1. Implement A explicit target→resolve/clear pointer/INCOMING; B explicit target/instructions→owner SALES_CONTACT while held; C confirmed reason→retained CANCELLED/BLOCKED with resolved issue.
2. Implement cancelIssuePiece at first real use; recompute active exact total in same transaction, preserve paid, set whole header CANCELLED only when no active pieces remain. Do not touch removedAt or frozen fields.
3. Test all branches, required text/target/confirmation, mismatched old cycle/current pointer, repeated/concurrent resolution, companion invariants and after-dependent-update rollback.

**Preserve / failure unchanged**: No deletion, duplicate deduction, refund, hidden source default, sales response impersonation or receipt/work-completion claim. Failure retains state/money/history exactly.

**Tests / verification**: Run focused approval.service.integration.test.ts plus existing sales-orders.rules.test.ts and P03 service regressions; real DB controls prove atomic branch outcomes. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test:integration src/modules/approval/approval.service.integration.test.ts src/modules/sales-orders/sales-orders.service.integration.test.ts
pnpm --filter @template/api test src/modules/sales-orders/sales-orders.rules.test.ts
```

**Done when**: All A/B/C transitions enforce current authority/source/version and retained target/cancellation semantics with one root/event outcome.

### T013

**Verify exact cancellation, full cancellation and paid races**

**Execution prerequisites**: T012.

**Requirements / dependencies**: FR-013–015/022; SC-004/005; VR-002/003. Prove exact business outcomes beyond helper unit calculations. Dependencies: T012.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.service.integration.test.ts, apps/api/src/modules/sales-orders/sales-orders.service.integration.test.ts and apps/api/src/modules/sales-orders/sales-orders.rules.test.ts for meaningful cancellation/money cases. If evidence exposes a required scoped defect, MODIFY only apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.mapper.ts or apps/api/src/modules/approval/approval.rules.ts within the already fixed T012 cancellation algorithm; do not amend design or financial rules.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. Spec US4/concrete 3300/2000 example; B03/B07; current calculateOrderMoney/deriveOrderCounts and SalesOrdersService.setPaid lock/version protocol.

**Ordered steps**:

1. Start actual two-piece frozen 1800/1500 order paid2000; confirm cancellation yields original/cancelled/active2/1/1, total1800, paid2000, due0, surplus200 once.
2. Cancel last active piece and prove zero active/completion0, retained memberships/reasons/paid/history and no refund or deliverable state. Include cancellation replay and denied dispatched/delivered fixture boundaries.
3. Race cancellation against real P03 cumulative-paid update using independent connections/barrier; inspect winner/loser and explicit fresh reviewed retry preserving both intended effects without lost paid.

**Preserve / failure unchanged**: No clamping actual paid, float arithmetic, double subtraction, fixture price defaults, automatic settlement, weakened assertions or broad production rewrite.

**Tests / verification**: Run both focused real integration files and existing exact money/count unit file; record complete final graph and unchanged losing effects, not only HTTP/status counts. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test:integration src/modules/approval/approval.service.integration.test.ts src/modules/sales-orders/sales-orders.service.integration.test.ts
pnpm --filter @template/api test src/modules/sales-orders/sales-orders.rules.test.ts
```

**Done when**: Exact single/full cancellation and actual P03 paid interaction pass under real persistence/concurrency, with retained evidence and no external money action.

### T014

**Implement owner contact proposals and requests**

**Execution prerequisites**: T013.

**Requirements / dependencies**: FR-016–019/022; SC-003/005; B04 and accepted D-003. Only actual owner SALES or owner ADMIN, never on behalf. Dependencies: T013.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.service.integration.test.ts, apps/api/src/modules/approval/approval.rules.test.ts and apps/api/src/test-support/approval.fixture.ts for owner contact proposal/request behavior. Reuse apps/api/src/modules/catalogs/catalogs.queries.ts and apps/api/src/modules/catalogs/catalogs.rules.ts without new catalog policy. No sales UI change.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. B04; contract AMEND/CANCEL_REQUEST union; data complete typed label/nullable-reference proposal fields and deferred submitted witness. Inspect current catalog lock/selection rules and captured optional selection behavior.

**Ordered steps**:

1. Enforce SALES_CONTACT/current held piece/target/root owner for SALES and ADMIN alike. Resolve sparse four-ID changes from active source; omission preserves old label/null reference, sole=null clears, empty changes records notes-only confirmation.
2. Insert complete immutable old/proposed proposal plus notes/actor/time/sequence; CANCEL_REQUEST has no proposed fields. Set latestProposal/REAPPROVAL; hold piece and start pending-review print block without changing current captured values.
3. Test prohibited decoration/other fields/customer/price/paid, required clear, exact source membership/language, absent catalog on changed selection, retained old values, admin-own allowed/admin-other denied, stale/duplicate/unknown and proposal-before-witness rollback.

**Preserve / failure unchanged**: No direct resume/cancel/delete, repricing, target override, customer master update, invented catalog ref/label or whole-order returned state. Failed input leaves all saved state and history unchanged.

**Tests / verification**: Run focused approval.service.integration.test.ts, approval.rules.test.ts and contract submit-contact cases through existing runners; real DB witnesses prove atomic creation. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test:integration src/modules/approval/approval.service.integration.test.ts
pnpm --filter @template/api test src/modules/approval/approval.rules.test.ts
pnpm --filter @template/contracts test src/approval/approval.schema.test.ts
```

**Done when**: Accepted response/request persists as pending immutable review intent only, obeying exact field/owner/notes/target rules and retaining previous data.

### T015

**Implement piece reapproval and repeated contact cycles**

**Execution prerequisites**: T014.

**Requirements / dependencies**: FR-019–023; SC-003/005/006; B05 and accepted D-005. Positive approval alone applies/resumes proposed changes. Dependencies: T014.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.service.integration.test.ts and apps/api/src/modules/approval/approval.rules.test.ts for piece review and the focused first-used writer. MODIFY packages/database/tests/integration/p04-approval-constraints.integration.test.ts only if the real selection/rollback boundary needs an additional assertion. Do not modify the broad apps/api/src/modules/sales-drafts/sales-draft-capture.writer.ts.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. B05/private signatures; contract REVIEW proposalId body and branch unions; data legal issue/immutable proposal/head witness checks. Inspect writeDraftCapture only to avoid its broad header/all-piece effects; reuse focused SQL/Prisma selection patterns.

**Ordered steps**:

1. Require current REAPPROVAL/latest proposal/version/held pointer and exact prior approved four values. ACCEPT only AMEND: implement focused applyContactProposal, updating one base row/four selection bindings from stored proposal without re-reading active catalog or price.
2. RETURN_TO_SALES preserves held pointer/target/latest proposal and records reason; owner may resubmit fresh intent. CANCEL reuses T012 helper for either kind and never applies unapproved fields; CANCEL_REQUEST cannot ACCEPT/resume.
3. Test contact→return→resubmit→accept, notes-only release, return→cancel, stale proposal, source activation change after submission, other pieces unchanged and failure after capture/selection update fully rolling back.

**Preserve / failure unchanged**: No automatic old-spec restoration/resume, new target, direct sales release, repricing, broad writeDraftCapture, companion edits or print unlock from resolving only one of several holds.

**Tests / verification**: Run focused approval.service.integration.test.ts and rule/contract regressions; inspect full old/new proposal/capture/reference/issue/root/history state with real rollback and competing review controls. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test:integration src/modules/approval/approval.service.integration.test.ts
pnpm --filter @template/api test src/modules/approval/approval.rules.test.ts
```

**Done when**: Exact stored four fields activate only on accepted current proposal, repeated contact remains held/traceable, cancellation stays retained and all failure/race cases preserve protected state.

### T016

**Implement contact/workflow reads and return-note visibility**

**Execution prerequisites**: T015.

**Requirements / dependencies**: FR-002/003/016/019/027/028; SC-003/008; B06. Real queues/proposals/instructions/notes without N+1 or cross-owner leaks. Dependencies: T015.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.service.ts and apps/api/src/modules/approval/approval.queries.integration.test.ts for listIssues, salesContacts, getOrder/getSalesContactOrder, shared hints and optional initial-return notes. Existing P03 schemas and commands remain unchanged.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. B06 current read/authority sections; contract workflow/issue/queue types; current root/read/pagination owners. Review new retained source/proposal/event fields from preceding tasks and source P03 returned reason-only projection.

**Ordered steps**:

1. Query one authorized consistent snapshot of root plus <=200 current issues, latest complete proposals and batched actual latest referral/return instructions. List counts/filters/order and action hints share current owner/state rules.
2. Keep approval-wide versus owner SALES/ADMIN read scope explicit; response submission hint always checks actual owner, including ADMIN. Resolve retained labels/null refs exactly without current-catalog substitution.
3. Expose optional initial currentReturn notes through the P04 wrapper even for RETURNED orders with no issues; test true empty/read failure/missing/denied, pending versus sales/reapproval state filters, page bounds and admin-other read-only context.

**Preserve / failure unchanged**: No private actor account fields, invented current values, whole-order correction substitution, per-row fetch cascade or action-hint permission bypass. Factory does not receive contact/proposal details.

**Tests / verification**: Run pnpm --filter @template/api test:integration src/modules/approval/approval.queries.integration.test.ts; focused rules/mapper regressions and API lint/types. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: All current/contact reads and hints match one scoped persistent truth, notes remain visible and row/count/owner/role/empty/error cases pass.

### T017

**Integrate merged history and safe event detail**

**Execution prerequisites**: T016.

**Requirements / dependencies**: FR-002/003/006/007/028; SC-001/008; B06 Histories/B07. One bounded authorized history across P02/P03/P04. Dependencies: T016.

**Allowed file actions**: CREATE proposed apps/api/src/modules/sales-orders/order-activity.queries.ts. MODIFY apps/api/src/modules/sales-orders/sales-orders.queries.ts, apps/api/src/modules/sales-orders/sales-orders.queries.test.ts, apps/api/src/modules/sales-orders/sales-orders.queries.integration.test.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.service.ts and apps/api/src/modules/approval/approval.queries.integration.test.ts for the exact merged history/P04 event boundary. No old receipt row, P03 full-revision schema or frontend edits.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. Contract sections retained event detail/history compatibility; B06 histories exact findOrderActivity/OrderActivityScope/findApprovalEvent signatures. Read current private activity predicate/summary selection, findSalesOrderActivity and findSalesOrderRevision before extracting.

**Ordered steps**:

1. Move compatible old summary query semantics to the trusted OWNER/APPROVAL scope owner; UNION approval summaries before one count/sort/page with occurredAt DESC,eventId DESC,kind ASC, not unbounded JavaScript merge.
2. Keep existing sales wrapper owner-scoped (ADMIN broader); approval order history uses approval scope only after current authorization. Add actual P04-only typed event facts/detail lookup bound to orderId; P03 full revision remains its original protocol.
3. Test mixed histories, duplicate cross-ledger UUID/time tie, two owners/approvers/admin, own-decision filters, prior actor reassignment, private snapshot denial and correct source-specific drilldown.

**Preserve / failure unchanged**: No global-ID uniqueness assumption, actor/scope browser override, fake partial SalesOrder revision, rewritten historical rows, factory raw facts/contact notes or swallowed unknown event.

**Tests / verification**: Run affected sales-orders query unit/integration and approval.queries.integration.test.ts using API scripts; producer schemas are parsed and scoped page/count outcomes inspected. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test src/modules/sales-orders/sales-orders.queries.test.ts
pnpm --filter @template/api test:integration src/modules/sales-orders/sales-orders.queries.integration.test.ts src/modules/approval/approval.queries.integration.test.ts
```

**Done when**: One merged summary owner preserves P03 semantics and strict revisions while exposing actual P04 history/detail with correct scope/order/privacy.

### T018

**Implement authoritative official and factory paper reads**

**Execution prerequisites**: T017.

**Requirements / dependencies**: FR-023–026; SC-006/007; B06 Official and factory paper. Real current approval and safe factory context precede any print UI. Dependencies: T017.

**Allowed file actions**: MODIFY apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.queries.integration.test.ts and apps/api/src/modules/approval/approval.rules.test.ts for official/factory paper. Reuse existing apps/api/src/modules/sales-orders/sales-orders.mapper.ts allowlists; no Next route, CSS or paper renderer change in this backend task.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. Contract exact paper DTOs/eligibility/errors; B06 paper relation/selected-cycle logic; spec D-004 and 1/8/9/17 acceptance; current P03 factory strict schema and old print mismatched guards as legacy context only.

**Ordered steps**:

1. Require actual APPROVE_INITIAL stamp matching approvedAt/current eligible header; select last accepted AMEND stamps for active changed pieces. Block both print aliases at their one backend producer while any submitted/recontact proposal hold remains; no previous-version alternative.
2. Authorize owner SALES/approval/ADMIN official reads and same-department/current-source-held factory relation. After relation, return whole existing factory-safe order/count/tracking, never a misleading subset or financial DTO.
3. Batch <=200 unique factory issue contexts: current open cycle else latest resolved; approvedInstructions only positive A/ACCEPT for that selected cycle, otherwise null. Test legacy witness absence, multiple/recontact holds, role/owner denial, old-cycle borrowing, nested private fields and truthful all-cancelled output.

**Preserve / failure unchanged**: No fake approval signature, late paid actor as signer, cached permission, contact/proposal notes, finance/provenance/private contacts in factory output or resource permission from receipt alone.

**Tests / verification**: Run focused approval.queries.integration.test.ts/rules plus contracts paper parsing cases; actual HTTP privacy follows T020. Browser row/layout verification remains later frontend/exit work, not claimed here. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

Exact future focused commands:

```sh
pnpm --filter @template/api test:integration src/modules/approval/approval.queries.integration.test.ts
pnpm --filter @template/api test src/modules/approval/approval.rules.test.ts
```

**Done when**: Authoritative current projection/eligibility and safe whole-order factory context pass persistent mapping/permission cases; no frontend integration accepted yet.

### T019

**Wire thin HTTP adapters and OpenAPI**

**Execution prerequisites**: T018.

**Requirements / dependencies**: FR-001–029; VR-001/002/005/008. Expose the complete accepted backend contract, preserving existing auth/HTTP owners. Dependencies: T018.

**Allowed file actions**: CREATE proposed apps/api/src/modules/approval/approval.controller.ts, apps/api/src/modules/approval/approval.routes.ts, apps/api/src/modules/approval/index.ts, apps/api/src/modules/approval/dto/approval-read.dto.ts, apps/api/src/modules/approval/dto/initial-decision.dto.ts, apps/api/src/modules/approval/dto/report-issue.dto.ts, apps/api/src/modules/approval/dto/resolve-issue.dto.ts, apps/api/src/modules/approval/dto/submit-contact.dto.ts, apps/api/src/modules/approval/dto/review-contact.dto.ts and apps/api/src/modules/approval/approval.routes.test.ts. MODIFY apps/api/src/modules/index.ts, apps/api/src/router.ts and apps/api/src/infrastructure/openapi/openapi.ts only for current composition/contract registration. No Express/auth/transport protocol replacement.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. Contract sections 6–8 exact 18-route ledger, five router factories/signatures, schema aliases/status/errors; backend interface ledger. Inspect current sales-orders routes/controller/DTO pattern, business auth/authorizeDepartments/CSRF/validation and ResponseHelper signatures/OpenAPI registration.

**Ordered steps**:

1. Alias exact shared params/query/body schemas with DtoSchema suffix; adapt required real actor/parsed input to the fixed service methods (review proposalId stays body field). Missing context is wiring defect, not empty identity/cast.
2. Register all five route factories at the contract prefixes with business auth→department gate→unsafe CSRF→shared validation→controller order; services retain transactional current authority/ownership.
3. Compose shared dependencies once and align OpenAPI methods/paths/strict schemas/HTTP200/failures. Set protected reads private,no-store; add route/middleware/schema/OpenAPI checks without controller business logic.

**Preserve / failure unchanged**: Preserve P03 routes/receipts and cookie/CSRF/CORS/errors. ADMIN general route exemption never permits on-behalf contact. No mock endpoint/success, new PDF service or factory financial route.

**Tests / verification**: Run pnpm --filter @template/api test src/modules/approval/approval.routes.test.ts and affected existing route/OpenAPI tests, API lint/check-types. Producer/consumer shape checks use actual exported schemas. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: All documented routes reach actual completed services with exact middleware/status/error/headers and OpenAPI agreement; full real HTTP authority is still T020.

### T020

**Prove actual HTTP permissions and command boundaries**

**Execution prerequisites**: T019.

**Requirements / dependencies**: FR-001–029; VR-001–005/008; SC-001–006/008. Actual middleware/credentials/database evidence for the whole required backend. Dependencies: T019.

**Allowed file actions**: CREATE proposed apps/api/src/modules/approval/approval.http.integration.test.ts. MODIFY apps/api/src/modules/sales-orders/sales-orders.http.integration.test.ts, apps/api/src/test-support/approval.fixture.ts and apps/api/src/test-support/business-http.fixture.ts only for scoped real-app fixtures/regressions. If actual HTTP evidence exposes an in-scope defect, MODIFY only the previously implemented apps/api/src/modules/approval/approval.service.ts, apps/api/src/modules/approval/approval.queries.ts, apps/api/src/modules/approval/approval.mapper.ts, apps/api/src/modules/approval/approval.rules.ts, apps/api/src/modules/approval/approval.errors.ts, apps/api/src/modules/approval/approval-command-executor.ts, apps/api/src/modules/approval/approval.controller.ts or apps/api/src/modules/approval/approval.routes.ts within their fixed algorithms; update scoped evidence without changing spec/design/checklists.

**Read-before-edit bundle**: Read root AGENTS.md, constitution, docs/engineering/README.md and the affected owning engineering guides; inspect referenced current source/callers before edits. Contract full route/error/actor/receipt/observation ledger; B01–B07 cases; existing createApp, business-http.fixture.ts, actual auth/CSRF and owned integration global setup/reset guards. Current specs/checklists remain requirements evidence, not executed tests.

**Ordered steps**:

1. Exercise all 18 endpoints through real createApp with approvalA/B, salesA/B, ownerAdmin/nonownerAdmin, cutting/production/quality and restricted accounts; include direct resource IDs, unsupported privileged fields and missing/mismatched CSRF.
2. Prove real return→P03 resubmit→approve, report/A/B/C, contact/review/return/cancel, ownerADMIN-only submission, metadata observation after movement versus reassignment, denied unchanged writes, real approval witness and factory nested redaction.
3. Cover status/envelope/requestID/private-no-store, stale/duplicate/changed-intent/unknown-result reconciliation, role changes, exact paid/cancellation interaction and preserved P03 endpoints/history. Use actual isolated migrations/transactions, never intercepted success.

**Preserve / failure unchanged**: No frontend wiring before T021, fake identity/authority, reduced request guards, fixture-as-live-P05 claim, arbitrary waits/retries or unrelated database. Denials leave protected records/history/money unchanged.

**Tests / verification**: Run pnpm --filter @template/api test:integration src/modules/approval/approval.http.integration.test.ts src/modules/sales-orders/sales-orders.http.integration.test.ts plus affected shared app/auth/current-account regressions selected by touched middleware; API lint/types and complete real final-state assertions. Record separate REQUIREMENTS and ENGINEERING STANDARDS findings/evidence in this task ledger; use applicable installed production/test guards. All commands below are future implementation checks, not TASKS execution evidence.

**Done when**: All scoped HTTP permissions/validation/projections/commands and P03 cross-boundary regressions pass fresh on owned PostgreSQL, with separate requirements/engineering reviews; root T021 must still accept the complete backend group.

### T021

**Accept the complete required backend before any dependent frontend**

**Execution prerequisites**: T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020.

**Requirements / dependencies**: All stories; VR-001–005/008, SC-001–006; constitution VII/IX/X. This is the hard prerequisite for T022–T038. Dependencies: T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020.

**Allowed file actions**: APPEND actual evidence to specs/004-approval-reapproval-printing/tasks.md; make no new business design or UI change. Required corrections stay within the accepted earlier task owners and must be reverified; a newly discovered material contract/product choice returns to its owning authorized step.

**Read-before-edit bundle**: Plan Backend and Frontend Delivery Groups, Verification and Review Plan, Design Readiness; Backend B01–B07, Contracts sections 1–9, Data constraints/upgrade; current source/tests produced by T002–T020 and their immediate callers; engineering code-review/testing/security/data/contracts/backend guides.

**Ordered steps**:

1. Inspect complete implemented files and callers against accepted D-003–005 and blueprints. Review requirements and engineering separately, including current authority, one-version transactions, generated-ID replay, retained proposals/targets, current return proof, cancellation/paid, histories and paper privacy.
2. Build changed contracts/database before API checks. Run the full relevant contracts, database unit/integration, API unit/integration and lint/type checks, using the existing owned disposable PostgreSQL harness. Confirm tests actually discovered, not zero-test success; inspect final rollback/losing-state assertions and P01–P03 regressions.
3. Record exact commands/results, source identity, fresh/cache/reused distinctions, failures/warnings and owned cleanup. Mark this gate complete only when every required backend command/read/HTTP/projection and both review dimensions pass; otherwise leave dependent frontend tasks blocked.

**Preserve / failure unchanged**: No partial endpoint, schema stub, mocked persistence, green formatter or fixture approval can satisfy this gate. No production/developer database, migration deployment or source workbook reapplication outside owned test infrastructure.

**Tests / verification**: Future commands: pnpm --filter @template/contracts build; pnpm --filter @template/database build; pnpm --filter @template/contracts test; pnpm --filter @template/database test; pnpm --filter @template/database test:integration; pnpm --filter @template/api test; pnpm --filter @template/api test:integration; package lint/check-types for contracts/database/API. Concrete outcomes are T009–T020 cases, including approve-v-return one winner, four-field cycles, exact 3300/2000 cancellation values, current print hold and nested factory omissions. Serialize shared generated-output builds. These commands are not run by TASKS.

**Done when**: All required backend behavior, discovered tests and separate REQUIREMENTS/ENGINEERING reviews pass with current owned-infrastructure evidence. Frontend integration may then start; neither the P04 phase nor release is yet accepted.

### T022

**Add explicit P04 capability scope without broadening sales authority**

**Execution prerequisites**: T021.

**Requirements / dependencies**:
FR-001, FR-027–029; frontend-design.md F01 and F-V01. T021 must record actual complete P04 backend acceptance, not merely plan readiness. Reuse current auth/session/epoch ownership.

**Allowed file actions**:
MODIFY only these exact repository-relative files:

- apps/web/src/shared/query/operational-scope.ts
- apps/web/src/shared/query/operational-scope.test.ts
  Add only F01 proposed symbols in the existing owner; preserve the existing sales scope exports and default behavior.

**Read-before-edit bundle**:
Read frontend-design.md F00/F01 and contracts/approval.md authority/receipt/read sections; actual operational-scope.ts, auth.hooks.ts useSession/reconcileBusinessDenial, account-access.ts hasBusinessAccess and api-client.ts epoch/subject checks; immediate customer/order/catalog hooks and their scope tests. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Extract the existing private validated business-session tuple logic without changing its restore-policy/subject/error behavior.
2. Keep existing sales helpers' restriction and add APPROVAL, SALES_CONTACT and OFFICIAL_PAPER capability predicates exactly as F01.
3. Include capability, actorId, accessVersion and epoch in p04ScopeKey. Recheck the captured tuple before publication and after cancellation.
4. Implement F01's observer-aware obsolete-prefix cleanup: after cancel/await/obsolescence recheck, reset each captured exact command-session Query synchronously, then exact-remove only if scope remains obsolete, Query identity matches and data is still undefined. Remove other old-prefix read queries with a predicate excluding command-session tails; preserve replacements and existing customer-drafts cleanup. Keep this cache-shape logic in operational-scope.ts without importing feature hooks.

**Preserve / failure unchanged**:
ADMIN broader contact reads do not authorize a response for another owner; actual-owner SALES/ADMIN plus server hint remains required by future commands. Old-account/old-accessVersion completion cannot publish data/errors/recovery state. Do not edit accepted spec/plan/design/checklist decisions, root roadmap, P01–P03 backend/contracts/migrations or the existing SalesCommandData protocol. No local MVP fallback, new route, redesign, dependency or business-rule change.

**Tests / verification**:
Extend the existing real QueryClient scope tests with F-V01: default sales rejection of APPROVAL, all three capability allow/deny sets, suspended/malformed/no-session cases, delayed current-scope change and replacement-safe cleanup. Mount both capability subscribers for one ADMIN/order: origin-authority loss must notify both, hide private recovery and preserve a replacement inserted during reset; cleanup performs zero transport. Use test-local disabled subscribers with the specified key shape and private sentinel data; T026's command hooks do not exist yet and must not be imported or reimplemented here. Run pnpm --filter @template/web test src/shared/query/operational-scope.test.ts src/features/customers/hooks/customers.hooks.test.tsx src/features/sales/hooks/orders.hooks.test.tsx. Record boundary and fresh result; source review must confirm no second session owner.

**Done when**:
T021 evidence is current; scope tests and affected sales regressions pass; existing consumers retain their public/default behavior; requirements and engineering review pass with no new authority/fallback.

### T023

**Implement approval and receipt transport adapters with scoped approval/history reads**

**Execution prerequisites**: T021, T022.

**Requirements / dependencies**:
FR-001–003, FR-007, FR-027–028; F02/F-V01–02. Depends on actual backend gate T021 and P04 scope T022; independent files from T024/T025.

**Allowed file actions**:
CREATE only these exact repository-relative files:

- apps/web/src/features/approval/api/approval.api.ts
- apps/web/src/features/approval/api/approval.api.test.ts
- apps/web/src/features/approval/api/approval-commands.api.ts
- apps/web/src/features/approval/api/approval-commands.api.test.ts
- apps/web/src/features/approval/hooks/approval.hooks.ts
- apps/web/src/features/approval/hooks/approval.hooks.test.tsx
  Implement only F02 API methods and scoped approval/history read hooks. Receipt transport/parsing is approvalCommandsApi.get; receipt query key/options/useApprovalCommandReceipt and command orchestration belong only to T026's approval-commands.hooks.ts. Do not create a competing receipt query in approval.hooks.ts.

**Read-before-edit bundle**:
Read contracts/approval.md exact body/read/event/receipt schemas, endpoint table and failures; frontend-design.md F01–F03 query ledger and history capability rule; backend-design.md B06. Inspect actual api-client.ts parseApiResponse/ApiContractError, orders.api.ts/orders.hooks.ts, auth denial reconciliation, QueryClient defaults and existing adapter/hook tests. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Implement approvalApi dashboard/orders/issues/history/order/orderHistory/event and the four action adapters, plus approvalCommandsApi.get, using central transport and unknown-response runtime parsing.
2. Define approvalKeys from p04ScopeKey and normalized search/type/state/page/limit; forward AbortSignal and validate resource/issue/receipt correlations.
3. Implement approval/history read options/hooks, monotonic same-order wrapper publication, current-scope checks and safe business denial reconciliation. Export only approvalCommandsApi.get for receipt transport; do not implement its observer/query lifecycle here.
4. Give useApprovalOrderHistory/useApprovalEvent explicit APPROVAL|SALES_CONTACT capability parameter defaulting APPROVAL; owner sales callers can select SALES_CONTACT without widening sales scope.
5. Implement honest retained-data error/out-of-range behavior and event-read F02 freshness/retry policies. T026 owns the explicit-origin manual receipt policy; expose no duplicate hook or query key here.

**Preserve / failure unchanged**:
Existing SalesCommandData, sales receipt snapshots, sales query keys and P03 revision endpoint stay unchanged. No failed read becomes empty success or malformed success becomes offline/default order. No raw financial facts enter receipt observation or query keys.

**Tests / verification**:
CREATE actual _.test.ts/_.test.tsx cases F-V01–02 for valid/malformed envelopes, wrong order/piece/issue/receipt-command ID, receipt API transport only, signal forwarding, normalized distinct keys, state filters, stable higher-version preservation, out-of-range page recovery, default approval denial for SALES and explicit contact capability success, old-account completion suppression. Run pnpm --filter @template/web test src/features/approval/api/approval.api.test.ts src/features/approval/api/approval-commands.api.test.ts src/features/approval/hooks/approval.hooks.test.tsx.

**Done when**:
All frozen methods/schema names and query keys match producer contracts; tests prove the consumed boundary with real QueryClient and transport doubles; no hook publication can cross scope or regress current detail; both reviews pass.

### T024

**Implement owner-contact adapters and scoped queue/detail reads**

**Execution prerequisites**: T021, T022.

**Requirements / dependencies**:
FR-016–019, FR-022, FR-027–028; F02/F-V01–02/F-V05. Depends T021/T022; independent of T023/T025 source owners.

**Allowed file actions**:
CREATE only these exact repository-relative files:

- apps/web/src/features/sales/api/sales-contact.api.ts
- apps/web/src/features/sales/api/sales-contact.api.test.ts
- apps/web/src/features/sales/hooks/sales-contact.hooks.ts
- apps/web/src/features/sales/hooks/sales-contact.hooks.test.tsx
  Export salesContactApi list/order/submit, salesContactKeys, salesContactOrderOptions, useSalesContactQueue and useSalesContactOrder exactly as F02.

**Read-before-edit bundle**:
Read contracts/approval.md contact bodies, queue item/current wrapper, allowedActions/ownership and exact routes; frontend-design.md F01/F02/F04; actual sales/catalog/customer adapters/hooks, current operational scope owner and shared transport. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Implement list/order/submit adapter methods with exact route IDs, shared schemas, AbortSignal on reads and parsed unknown envelopes.
2. Parse query defaults before key/request construction; include search/type/state/page/limit and SALES_CONTACT tuple in keys. Omitted state shows SALES_CONTACT plus REAPPROVAL, not just actionable work.
3. Add current-scope guards, monotonic same-order wrapper sharing, explicit read failures and proper out-of-range recovery.
4. Expose actual row/detail canSubmitContact hints; API read support for ADMIN is not an on-behalf write grant.

**Preserve / failure unchanged**:
The existing P03 RETURNED list and correction/paid hooks are untouched. Cross-owner/ineligible responses cannot publish; empty success differs from failed read. Submit adapter does not resume/cancel or translate source labels. Do not edit accepted spec/plan/design/checklist decisions, root roadmap, P01–P03 backend/contracts/migrations or the existing SalesCommandData protocol. No local MVP fallback, new route, redesign, dependency or business-rule change.

**Tests / verification**:
Adapter tests cover exact IDs/body unions, strict parse failure/no fallback and signals. Hook tests cover state-sensitive keys, owner/ADMIN current scope, higher-version retention, failed refresh retaining safe context, out-of-range recovery and late identity replies. Run pnpm --filter @template/web test src/features/sales/api/sales-contact.api.test.ts src/features/sales/hooks/sales-contact.hooks.test.tsx.

**Done when**:
Contact methods/queries conform to F02 and actual backend; all new tests pass; current sales reads remain unchanged and no response action is inferred solely from ADMIN or issue state; both reviews pass.

### T025

**Implement fresh official-paper adapter and scoped read options**

**Execution prerequisites**: T021, T022.

**Requirements / dependencies**:
FR-023–028; F02/F05/F-V02/F-V09. Depends T021/T022; files independent of T023/T024.

**Allowed file actions**:
CREATE only these exact repository-relative files:

- apps/web/src/features/printing/api/order-paper.api.ts
- apps/web/src/features/printing/api/order-paper.api.test.ts
- apps/web/src/features/printing/hooks/order-paper.hooks.ts
- apps/web/src/features/printing/hooks/order-paper.hooks.test.tsx
  Export orderPaperApi.get, orderPaperKeys.order, officialOrderPaperOptions and useOfficialOrderPaper; leave layout/view activation to T035/T037.

**Read-before-edit bundle**:
Read contracts/approval.md OfficialOrderPaperData, actual approval stamp constraints, print failures and no-store endpoint; frontend-design.md F01/F02/F05; actual transport parse/error owner, query defaults, current PrintOrderView/layout and P03 paper mapper. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Fetch only /order-paper/:orderId through central transport and strict officialOrderPaperDataSchema parsing; never substitute sales detail/local data.
2. Use OFFICIAL_PAPER capability keys with current UUID/scope checks, staleTime:0 and gcTime:0; forward signal and reject mismatched root ID/printVersion/stamps.
3. Expose query failure/known-ineligible state for later view composition, never placeholderData or previous-resource financial paper.
4. Reconcile recognized account/department denial without normalizing ordinary network error into signout.

**Preserve / failure unchanged**:
Reports remain ADMIN and unchanged; no page/layout/view authority is broadened in this task. Factory/other-owner/unapproved/returned/pending-review data never becomes eligible paper. Native browser behavior is addressed by T037, not a PDF service.

**Tests / verification**:
F-V02/F-V09 adapters/hooks test valid real-shaped stamps, malformed or wrong-version document, missing genuine initial stamp, all print denial codes, current scope gating, no placeholder fallback, signal propagation and old-account completion. Run pnpm --filter @template/web test src/features/printing/api/order-paper.api.test.ts src/features/printing/hooks/order-paper.hooks.test.tsx.

**Done when**:
Fresh official reads match the tested producer and strict schema, no local authority/fixture path exists in these new modules, focused tests and both reviews pass.

### T026

**Add P04 command dispatch, recovery and confirmed synchronization**

**Execution prerequisites**: T021, T023, T024, T025.

**Requirements / dependencies**:
FR-007, FR-017, FR-019–024, FR-027–028; F03/F-V07–08. T021 actual backend gate and T023–025 adapters/options must exist.

**Allowed file actions**:
CREATE only these exact repository-relative files:

- apps/web/src/features/approval/model/approval-command-state.ts
- apps/web/src/features/approval/model/approval-command-state.test.ts
- apps/web/src/features/approval/hooks/approval-commands.hooks.ts
- apps/web/src/features/approval/hooks/approval-commands.hooks.test.tsx
- apps/web/src/features/approval/components/approval-command-recovery.tsx
- apps/web/src/features/approval/components/approval-command-recovery.test.tsx
  Use the symbols/state/keys fixed in F03; do not edit existing sales command model/hooks.

**Read-before-edit bundle**:
Read frontend-design.md F01–F03, exact command state interface/submission/observation/synchronization algorithms; contracts/approval.md receipt/outcome/current-authority and errors; backend-design.md Shared command protocol. Inspect actual sales-command-state.ts/sales-commands.hooks.ts and usePaidEditor only as bounded patterns, plus current auth scope/transport and query keys produced by T023–025. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Define F03 ApprovalCommandCapability/ApprovalCommandScope, fixed SUBMIT_CONTACT→SALES_CONTACT and four-approver-operation→APPROVAL mapping, frozen origin-bearing state/variables and the unchanged five phases. Implement required useApprovalCommand(orderId,capability) and ApprovalCommandRecovery props {orderId,capability}; retain existing error/uncertainty rules. Wrong local mapping/busy/invariant errors never become unknown server writes.
2. Implement F03's two exact current-identity command-session subscriptions with skipToken, enabled:false, gcTime:Infinity and no initialData. Select the single valid origin entry; pending/unknown/confirmed/synchronized-unacknowledged all occupy one actor/accessVersion/epoch/order slot across both capabilities. In submit, validate requested capability/operation/order, inspect both keys and synchronously insert pending before the first await/mutateAsync. Never replace an occupied entry; dual/inconsistent entries fail closed locally without transport or automatic merge.
3. Own useApprovalCommandReceipt(commandId,originScope) and its command-receipt key in approval-commands.hooks.ts only: disabled/manual, retry:false, staleTime:0, gcTime:0, strict ID/actor/mapped-capability/current-origin checks. Mount it at hook top level; observe refetches the bound original observer and validates the complete frozen binding. Retry transitions only the same unknown entry to pending synchronously and reuses ID/body/path/origin. Missing receipt remains inconclusive; confirmed results permit sync only.
4. Synchronize through the stored operation/origin scope, using the contact wrapper even when an ADMIN observes a contact result from an approval view. Require received/published version >= receipt.afterVersion, then perform F03's bounded eligible invalidations without regression/global clearing. Never reclassify the origin according to the current screen.
5. Re-read exact origin key/command ID before actions and after every await. Implement F03's private synchronous clear helper: verify matching ID/permitted phase, capture exact Query, reset() to publish empty data, then exact-remove only if Query identity is unchanged and data remains undefined. Ack requires synchronized; definitive no-write failure preserves RHF input. No await/transport in clearing; preserve replacement data and use T022 F01 cleanup on origin-authority loss. Notices in either eligible view recover the same origin session; old callbacks cannot publish or clear another command.

**Preserve / failure unchanged**:
Never allocate a replacement ID to escape uncertainty, replay confirmed writes after refresh failure, persist credentials/body in browser storage or use receipt outcome as current business state. Keep entered RHF values separate from recovery metadata; scope loss removes private recovery only for obsolete tuple. ADMIN can submit contact only as actual immutable owner.

**Tests / verification**:
F-V07–08 real QueryClient/transport tests: lost response after one commit, missing receipt, same-ID retry, changed intent conflict, dialog closure/reopen, confirmed result plus failed refresh, current wrapper V+2 after receipt V+1, old account/accessVersion late replies and duplicate clicks. Mount both ADMIN capability subscribers: unknown contact→approval navigation retains the original origin/ID/body; overlapping new intents produce one pending entry/POST and a local busy loser; wrong capability produces no transport. Receipt observation uses the original SALES_CONTACT key and synchronization its contact wrapper. Ack/definitive failure notifies both subscribers to idle, cleanup sends no request, a replacement inserted during reset survives, origin-authority loss hides old data, and inconsistent two-entry state fails closed. Do not weaken these cases to internal call counts alone. Assert exact command ID/body retained, no replacement POST or global clear, no false success. Run pnpm --filter @template/web test src/features/approval/model/approval-command-state.test.ts src/features/approval/hooks/approval-commands.hooks.test.tsx src/features/approval/components/approval-command-recovery.test.tsx.

**Done when**:
The sole receipt-query owner and explicit-capability dispatch/observe/sync paths follow F03; all dual-capability occupancy, notification, replacement and uncertainty/scope cases pass; parent components can retain recovery after closing a modal; both reviews pass with no sales protocol rewrite.

### T027

**Connect approval dashboard, pending and own-history reads**

**Execution prerequisites**: T021, T026.

**Requirements / dependencies**:
FR-001–003, FR-027–029; F02 surface algorithms/F-V02. Depends T021/T026; may run beside T028/T030 only where its files are disjoint.

**Allowed file actions**:
MODIFY existing screens / CREATE listed tests only these exact repository-relative files:

- apps/web/src/features/approval/screens/approval-dashboard-view.tsx
- apps/web/src/features/approval/screens/approval-dashboard-view.test.tsx
- apps/web/src/features/approval/screens/approval-pending-view.tsx
- apps/web/src/features/approval/screens/approval-pending-view.test.tsx
- apps/web/src/features/approval/screens/approval-history-view.tsx
- apps/web/src/features/approval/screens/approval-history-view.test.tsx
  Reuse T023/T026 interfaces and existing UI; no hooks/models/detail/modal edits. Before T029, preserve review navigation without invoking legacy local decision handlers.

**Read-before-edit bundle**:
Read F00/F02/F03 and contracts/approval.md queues/dashboard/history. Inspect complete current screens, their route wrappers and local MVP callers, existing OrientalTable/filter/KPI components, T023 hooks and T026 recovery component. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Replace local orders/event-string counters with server counts initialOrders/unresolvedIssues/approvedToday/returnedOrders and recent roots; preserve current four cards and server business-calendar meaning.
2. Preserve orders/problems tabs and ?tab=problems; use server search/type/page data, all unresolved issue statuses, summary canResolve/canReviewContact hints and real order links. Do not client-filter a received page.
3. Own-history shows current actor's actual decisions with bounded pagination; errors/loading/empty/background states remain distinct.
4. Use ApprovalCommandRecovery with explicit capability APPROVAL for every interacted order; a recovered other-capability origin remains selected and keeps this order busy. Remove reached local decision mutations. Until T029 wires the new modal, retain real order-review navigation and do not invoke the legacy local decision modal or a fake handler. Retain parent recovery notices for any already-started real command.

**Preserve / failure unchanged**:
Arabic/RTL/Cairo, cards/tables/filter layout/links remain. SALES_CONTACT rows are held owner work with no approval action. Failed reads cannot show fixture/empty success; no fixed actor/date or browser role authority. This read-view task is not complete US1 acceptance.

**Tests / verification**:
Create real query/render interaction tests for accurate counts, status-hint actions, full-server filters/pagination, ?tab preservation, current own-history, actual empty versus failures, retained refresh error and scope switch. Run pnpm --filter @template/web test src/features/approval/screens/approval-dashboard-view.test.tsx src/features/approval/screens/approval-pending-view.test.tsx src/features/approval/screens/approval-history-view.test.tsx.

**Done when**:
All three converted read surfaces use only the verified scoped backend, have no reachable local mutation/fallback and pass focused tests/reviews; deferred problem modal wiring remains explicitly T029.

### T028

**Connect initial review, canonical tracking and free-text return**

**Execution prerequisites**: T021, T026.

**Requirements / dependencies**:
FR-003–007, FR-027–029; F02/F04 initial decision/F-V03. Depends T021/T026. Creates ApprovalFormBase later consumed by T030.

**Allowed file actions**:
MODIFY existing detail/return screens / CREATE listed models and tests only these exact repository-relative files:

- apps/web/src/features/approval/screens/approval-decision-view.tsx
- apps/web/src/features/approval/screens/approval-decision-view.test.tsx
- apps/web/src/features/approval/screens/approval-return-modal.tsx
- apps/web/src/features/approval/screens/approval-return-modal.test.tsx
- apps/web/src/features/approval/model/approval-form.model.ts
- apps/web/src/features/approval/model/approval-form.model.test.ts
- apps/web/src/features/approval/model/approval-view.model.ts
- apps/web/src/features/approval/model/approval-view.model.test.ts
  Only the initial return/base portion of approval-form.model.ts is permitted here; A/B/C/reapproval mode belongs T029. Keep unconverted problem actions unavailable rather than bridging to local mutations.

**Read-before-edit bundle**:
Read F02 detail/history/derived tracking, F03, F04 form ledger and initial approve/return; contracts current wrapper/body/return notes/event schemas; backend B01/B06. Inspect complete current detail/return screens, existing toSubmittedPaper/toAuthoritativePaperState/toAuthoritativeTracking, OrderFullTrackingView projection prop, detail tabs and P03 current-return consumers. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Create ApprovalFormBase/returnInitialFormSchema/toReturnInitialBody and pure toApprovalTracking from the same authorized wrapper via shared tracking schema and existing mapper.
2. Replace local order lookup/status heuristics/fixed actor with current wrapper hints, actual paper/tracking and authorized history. P03 summaries do not call the SALES-only revision endpoint from approval view.
3. Convert return reason to required free text, optional notes separate, both shared 4000-character validation; RHF input survives validation/error/conflict.
4. Submit initial approve/return through parent T026 command session with captured version and real scope; show success/close/navigate only after confirmed synchronization. All seven types go to cutting; remove repair shortcut copy.
5. Keep the new problem decision entry unavailable until T029; no legacy local action bridge. Parent recovery remains after modal close.

**Command/recovery binding**: Parent initial approve/return uses useApprovalCommand(orderId,"APPROVAL") and ApprovalCommandRecovery with the same explicit view capability. Display any valid same-order origin session; an ADMIN contact command already occupying the slot blocks a new initial/approval intent. Recovery never changes that original scope.

**Preserve / failure unchanged**:
Original submitted terms/number/customer/pieces/history, current P03 return-proof/resubmission protocol and existing read-only paper layout stay fixed. Do not copy actor/time authority into editable fields or treat RETURNED as already approved. Failure makes no synthetic release/success.

**Tests / verification**:
Model tests prove wrapper-derived counts/IDs/versions and no local tracking. Screen/dialog F-V03 tests prove valid free text and optional notes, 4000/blank errors, one intent on repeated triggers, current allowedActions, stale approve/return conflict with input retained, unknown/saved-not-refreshed recovery and no repair bypass. Run pnpm --filter @template/web test src/features/approval/model/approval-form.model.test.ts src/features/approval/model/approval-view.model.test.ts src/features/approval/screens/approval-decision-view.test.tsx src/features/approval/screens/approval-return-modal.test.tsx.

**Done when**:
Initial review/return/approve/derived tracking work against frozen interfaces, preserve UI/history/terms, and pass focused tests plus both reviews; no A/B/C local path remains reachable while T029 is pending.

### T029

**Wire A/B/C decisions and mandatory proposal-review mode**

**Execution prerequisites**: T021, T027, T028.

**Requirements / dependencies**:
FR-008–013, FR-019–022, FR-027–029; F04 issue/reapproval and F-V04/F-V06. Depends T021, T028 form/base/detail and T027 dashboard/pending callers to serialize their writes.

**Allowed file actions**:
MODIFY listed current owners / CREATE modal test if absent only these exact repository-relative files:

- apps/web/src/features/approval/screens/approval-problem-resolution-modal.tsx
- apps/web/src/features/approval/screens/approval-problem-resolution-modal.test.tsx
- apps/web/src/features/approval/screens/approval-dashboard-view.tsx
- apps/web/src/features/approval/screens/approval-dashboard-view.test.tsx
- apps/web/src/features/approval/screens/approval-pending-view.tsx
- apps/web/src/features/approval/screens/approval-pending-view.test.tsx
- apps/web/src/features/approval/screens/approval-decision-view.tsx
- apps/web/src/features/approval/screens/approval-decision-view.test.tsx
- apps/web/src/features/approval/model/approval-form.model.ts
- apps/web/src/features/approval/model/approval-form.model.test.ts
  Extend the shared form owner with issueDecisionFormSchema/toResolveIssueBody/contactReviewFormSchema/toReviewContactBody. No backend or contact-form changes.

**Read-before-edit bundle**:
Read contracts resolve/review unions/current issue/proposal/hints; F03/F04; backend B03/B05. Inspect actual modal/three callers, T027/T028 selections, T026 command session and F-V04/F-V06 acceptance. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Replace raw MvpOrder/ProductLine props with exact orderId/pieceId/issueId/mode selection and current wrapper read; key form by current scope/order/piece/issue/proposal.
2. Issue mode preserves A/B/C arrangement: A/B require explicit CUTTING/PRODUCTION target plus nonblank instructions; B retains target for owner contact. Never infer reporter target.
3. C requires nonblank reason and nested explicit confirmation; cancel confirmation writes nothing, wording retains cancellation rather than physical deletion.
4. Reapproval mode displays before/proposed four fields, actual contact notes/latest instructions and read-only retained target. AMEND may ACCEPT with notes; CANCEL_REQUEST cannot ACCEPT/resume; return with reason or confirmed C are its choices.
5. Wire all three callers via server summary hints/current detail and T026; retain companions, parent recovery and current-version conflict behavior.

**Command/recovery binding**: All three reached approval callers and issue/reapproval actions use useApprovalCommand(orderId,"APPROVAL") plus the explicit APPROVAL recovery notice. Respect the occupied same-order slot from either eligible origin; never re-key an existing contact command.

**Preserve / failure unchanged**:
Do not restore/resume old values automatically, change target on review, apply unapproved proposals during C, stop companions, accept a stale issue/proposal or use local actors/450 prices. Definitive/unknown failures retain proper input/context and no fake success.

**Tests / verification**:
Extend caller and form tests for F-V04/F-V06: explicit targets, notes/reasons, C cancel/confirm, stale/foreign IDs, exact proposal binding, notes-only AMEND, CANCEL_REQUEST ACCEPT unavailable, return-to-sales held cycle, then positive approval or C; double submit and late scope remain one safe intent. Run pnpm --filter @template/web test src/features/approval/model/approval-form.model.test.ts src/features/approval/screens/approval-problem-resolution-modal.test.tsx src/features/approval/screens/approval-dashboard-view.test.tsx src/features/approval/screens/approval-pending-view.test.tsx src/features/approval/screens/approval-decision-view.test.tsx.

**Done when**:
Every reached issue/reapproval entry invokes the correct real command, no local workflow path remains, selected piece/target/proposal isolation is covered and focused tests/both reviews pass.

### T030

**Implement the four-field owner-contact proposal form**

**Execution prerequisites**: T021, T024, T026, T028.

**Requirements / dependencies**:
FR-016–022, FR-027–029; accepted D-003/D-005; F04 owner form/F-V05–07. Depends T021/T024/T026 and T028's ApprovalFormBase; files disjoint from T029.

**Allowed file actions**:
CREATE contact model/tests / MODIFY existing contact modal only these exact repository-relative files:

- apps/web/src/features/sales/model/sales-contact.model.ts
- apps/web/src/features/sales/model/sales-contact.model.test.ts
- apps/web/src/features/sales/screens/sales-problem-contact-modal.tsx
- apps/web/src/features/sales/screens/sales-problem-contact-modal.test.tsx
  Reuse T024/T026/T028 and existing useCatalog; no catalog/quote/paid hook edits.

**Read-before-edit bundle**:
Read contact body/ContactValues/proposal/instructions schemas and ownership in contracts/approval.md; F03/F04 and backend B04/B05; current modal, catalog hooks and toPaperCatalogOptions; T028 ApprovalFormBase. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Implement named salesContactFormSchema/ContactDirtyFields/toContactChanges/toSubmitContactBody with exact model/size/leatherBase/sole UUID controls and contactNotes.
2. Read current exact issue and actual instructions/reporter context; defaults come from approved values, previous proposal shown separately. Preserve source labels and unchanged old references; no first option/demo size.
3. Emit only dirty allowed fields, explicit sole:null clear, or changes:{} notes-only; required model/size/base cannot clear. No decoration/price/customer/other fields/target are submitted and no quote/repricing is requested.
4. Replace resume/delete with AMEND or CANCEL_REQUEST through T026. Eligible SALES or ADMIN may respond only as immutable actual owner plus server hint; ADMIN for another owner remains read-only.
5. Preserve dirty values/base version on refresh/error, require explicit review of newer context, distinguish catalog unavailable from retained values and keep unknown command recovery after close.

**Command/recovery binding**: Contact submit/request uses useApprovalCommand(orderId,"SALES_CONTACT"); parent recovery receives SALES_CONTACT explicitly. Closing/navigation preserves the frozen origin session, and the shared slot blocks a second command even from an ADMIN approval view.

**Preserve / failure unchanged**:
Sales save never resumes/cancels work, request confirmation never changes money, and a rejected proposal does not auto-restore. Cancel unsent input writes nothing; invalid/stale/denied/failing intent leaves saved terms/history/target/companions unchanged. No catalog fallback or extra field surface.

**Tests / verification**:
F-V05–07 model/modal tests cover size40→40.5 IDs, optional floor clear, notes-only empty changes, required null rejection, strict prohibited fields, missing/over-limit notes, current/old catalog labels, catalog read failure/retry with dirty input, owner-sales and admin-owner allowed/admin-other denied, request-only cancellation, stale issue and modal-close uncertainty. Run pnpm --filter @template/web test src/features/sales/model/sales-contact.model.test.ts src/features/sales/screens/sales-problem-contact-modal.test.tsx.

**Done when**:
The existing modal is a real four-field proposal/request flow with no direct work/delete action; accepted ownership/frozen terms and failure recovery pass focused tests/reviews.

### T031

**Expose distinct contact work on the existing returned-order page**

**Execution prerequisites**: T021, T030.

**Requirements / dependencies**:
FR-005–006, FR-016–019, FR-027–029; F02 placement/F04/F-V05–06. Depends T021/T030, which already requires contact reads/commands.

**Allowed file actions**:
MODIFY only these exact repository-relative files:

- apps/web/src/features/sales/screens/sales-returned-view.tsx
- apps/web/src/features/sales/screens/sales-returned-view.test.tsx
  Reuse current returned-list/correction, T024 contact reads and T030 modal. No new route/page/API/hook.

**Read-before-edit bundle**:
Read F02 surface algorithms/F04, contracts contact queue/summary hints and currentReturn context; inspect actual SalesReturnedView, sales order links/pagination, T024 normalized keys, T030 modal props and existing tests. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Preserve the initial P03 RETURNED order table/query and its existing correction command destination.
2. Add the accepted contact subsection using existing table/card styles, a distinct contactPage and actual queue count. Omitted contact state shows SALES_CONTACT and REAPPROVAL; only canSubmitContact rows open the exact issue modal.
3. Link returned order reference to existing sales order detail for separate optional return notes; do not fetch a wrapper for each list row or concatenate reason/notes.
4. Add honest loading/empty/error/refresh and parent command-recovery context; submitted rows remain visibly pending review without a response action.

**Command/recovery binding**: Returned-page contact parents mount ApprovalCommandRecovery with capability SALES_CONTACT for interacted orders. Recovery uses the selected stored origin and remains after modal closure; no independently keyed command/session store is added.

**Preserve / failure unchanged**:
No global order RETURNED state is fabricated for a piece issue; no cross-owner queue leakage, no new route/redesign, no P03 returned correction regression and no local fallback. Cancel dialog leaves stored data unchanged.

**Tests / verification**:
Extend real component/QueryClient test with separate order/contact pages/counts, both issue statuses, hint-gated exact tuple, notes detail link and no per-row request, wrong-scope/delayed data and contact error distinct from initial-return success. Run pnpm --filter @template/web test src/features/sales/screens/sales-returned-view.test.tsx src/features/sales/screens/sales-problem-contact-modal.test.tsx.

**Done when**:
Both workflows coexist on the existing page with independent pagination/truthful states and real exact-piece modal access; focused tests and both reviews pass.

### T032

**Integrate current contact and return-note context into sales detail**

**Execution prerequisites**: T021, T031, T028.

**Requirements / dependencies**:
FR-005–006, FR-016–019, FR-023–024, FR-027–029; F02 step6/F04/F-V05/F-V08. Depends T021/T031 and T028; serialize later detail history edits in T033.

**Allowed file actions**:
MODIFY only these exact repository-relative files:

- apps/web/src/features/sales/screens/sales-order-detail-view.tsx
- apps/web/src/features/sales/screens/sales-order-detail-view.test.tsx
  Limit changes to wrapper/contact/currentReturn/print hints; use T024/T030/T026. Additive history expansion belongs T033.

**Read-before-edit bundle**:
Read F02 step6/F03/F04 and exact approval wrapper/currentReturn/printEligibility/issue hints. Inspect complete SubmittedDetail/usePaidEditor, current order-editor/detail/tracking version reconciliation, T024 wrapper options, T030 modal and current P03 paid/correction tests. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Fetch the contact wrapper for every submitted order, including initial RETURNED records with no issue, under SALES_CONTACT scope.
2. Display actual currentReturn.reason and optional notes separately; current absence remains absence.
3. Require wrapper ID/version to match displayed sales order before exposing contact/print actions. Refetch lagging side or current sales detail if wrapper is ahead; no silent reset of paid/dirty/correction form.
4. Add exact referred-piece contact action, pending-review context and parent recovery without touching the paid command protocol.
5. Use matching workflow.printEligibility for preview link/hint; actual official page still refetches backend eligibility.

**Command/recovery binding**: Sales-detail contact hooks/recovery pass SALES_CONTACT explicitly. They subscribe to the same order slot used by approval views, preserve stored origin and never substitute the existing paid-command session/protocol.

**Preserve / failure unchanged**:
Existing paid editor/unknown-result/review behavior, P03 initial-return resubmission, full paper/tracking and scope monotonicity remain. No action uses mismatched versions, no optional notes are invented/concatenated, no global order edit unlock or local issue mutation.

**Tests / verification**:
Extend detail tests for returned-no-issue optional notes, absent notes, wrapper lower/higher version reconciliation, stale hint suppression, owner exact-piece action, held proposal/current print hint, retained dirty paid input across wrapper refresh failure and old-account reply. Run pnpm --filter @template/web test src/features/sales/screens/sales-order-detail-view.test.tsx src/features/sales/hooks/sales-contact.hooks.test.tsx.

**Done when**:
All submitted detail states show correct return/contact context and current-version hints without paid/correction regressions; focused tests and both reviews pass.

### T033

**Render additive P04 activity and authorized event expansion**

**Execution prerequisites**: T021, T032.

**Requirements / dependencies**:
FR-002–003, FR-006–007, FR-017–021, FR-027–028; F02 history/F06/F-V02/F-V08. T021 merged-history backend/contracts and T032 detail integration must be complete.

**Allowed file actions**:
MODIFY only these exact repository-relative files:

- apps/web/src/features/sales/model/order-view.model.ts
- apps/web/src/features/sales/model/order-view.model.test.ts
- apps/web/src/features/sales/screens/sales-activity-view.tsx
- apps/web/src/features/sales/screens/sales-activity-view.test.tsx
- apps/web/src/features/sales/screens/sales-order-detail-view.tsx
- apps/web/src/features/sales/screens/sales-order-detail-view.test.tsx
  Reuse T023 useApprovalEvent with explicit SALES_CONTACT capability; no contract or sales receipt schema edit.

**Read-before-edit bundle**:
Read contracts/approval.md History producer/consumer compatibility, ApprovalActivityEvent/ApprovalEventData and old/new union distinction; F02/F06. Inspect existing activity label maps, revision hooks/parser and sales activity/detail tests, plus T023 capability/default behavior. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Extend typed presentation handling to the third kind:'approval' union, mapping its six operations/decision/actor/time without any/default suppression. Keep draft and P03-order variants unchanged.
2. In sales detail, route only P04 event expansion to useApprovalEvent(orderId,eventId,'SALES_CONTACT'); verify event/order/version before showing retained before/proposal/after/reasons.
3. Keep P03 full revision expansion on its existing endpoint and parser; P04 facts must never be cast or parsed as SalesOrderRevisionData.
4. Preserve mixed pagination, stable IDs, safe retained error/retry and actor/resource switches; close obsolete expansion on page/resource change.

**Preserve / failure unchanged**:
No dropping unknown variants to get a clean UI, no financial history exposed to factory, no owner SALES call through default APPROVAL capability and no current workflow reconstructed from historical facts. Earlier receipts/IDs/labels remain valid.

**Tests / verification**:
Extend model/activity/detail tests with mixed draft/P03/P04 pages, each new operation label, returned proposal reason/old-new values, event ID/order mismatch rejection, explicit owner capability, P03 endpoint unchanged, denied/failed expansion and late old event after navigation. Run pnpm --filter @template/web test src/features/sales/model/order-view.model.test.ts src/features/sales/screens/sales-activity-view.test.tsx src/features/sales/screens/sales-order-detail-view.test.tsx.

**Done when**:
All activity variants and drilldowns use their owning protocol/authority and preserve current state; focused compatibility tests and both reviews pass.

### T034

**Preserve canonical cancellation and monetary paper projections**

**Execution prerequisites**: T021, T033.

**Requirements / dependencies**:
FR-013–015, FR-025–026; F06/F-V11. Depends T021 backend retained cancellation/money and T033 to serialize order-view model edits.

**Allowed file actions**:
MODIFY only these exact repository-relative files:

- apps/web/src/features/sales/model/order-view.model.ts
- apps/web/src/features/sales/model/order-view.model.test.ts
- apps/web/src/features/orders/order-print-rows.test.tsx
- apps/web/src/features/orders/order-price-non-editable.test.tsx
  Reuse the existing printable-line algorithm and OrderPaperForm; no new row/financial authority or backend change.

**Read-before-edit bundle**:
Read F06/F-V11, spec US4 examples, canonical SalesOrderDto counts/money/cancelledAt meaning; inspect toSubmittedPaper/toAuthoritativePaperState, getPrintablePaperLines, eight-row slicing and existing row/price tests. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Map each retained piece's cancelledAt into its presentation line isDeleted; keep piece identity/order position/source text and cancelled history.
2. Continue passing authoritative money/price state; never recalculate from local row count/demo prices or clamp paid.
3. Prove cancelled lines leave active printable rows once, empty padding makes no piece/amount and all-cancelled state is truthful zero-active rather than deliverable completion.

**Preserve / failure unchanged**:
Frozen prices/contacts, actual paid/due/surplus, retained piece membership/history, existing printable filtering/8-row logic and draft editing controls remain unchanged. The 3300 total/2000 paid→cancel1500 case must display 1800 total, 2000 paid, 0 due, 200 surplus without refund.

**Tests / verification**:
Extend actual model/paper tests for canonical cancellation flag, replay-stable counts, full cancellation, retained history, exact money, separate floor/additions/source-language parity, and 1/8/9/17 active-row chunk boundaries with cancelled/empty rows. Run pnpm --filter @template/web test src/features/sales/model/order-view.model.test.ts src/features/orders/order-print-rows.test.tsx src/features/orders/order-price-non-editable.test.tsx.

**Done when**:
Presentation follows canonical cancellation/money without new quantity/financial authority; focused regressions and both reviews pass. Physical print fit remains future browser evidence, not a component-test claim.

### T035

**Prepare print-family boundary and explicit route parameters safely**

**Execution prerequisites**: T021, T022, T025.

**Requirements / dependencies**:
FR-023–024, FR-029; F05/F-V09. Depends T021/T022/T025. Preparatory task; T037 activates boundary and replaces local print authority atomically.

**Allowed file actions**:
CREATE boundary/test / MODIFY route pages and minimal screen signature only these exact repository-relative files:

- apps/web/src/features/printing/components/print-access-boundary.tsx
- apps/web/src/features/printing/components/print-access-boundary.test.tsx
- apps/web/src/app/(print)/orders/[orderId]/print/page.tsx
- apps/web/src/app/(print)/print/order/[orderId]/page.tsx
- apps/web/src/features/printing/screens/print-order-view.tsx
  In print-order-view.tsx only accept/use required {orderId:string} and remove pathname guessing. Do not edit or compose the new boundary in the existing print layout yet; its ADMIN guard/MVP provider remains until T037.

**Read-before-edit bundle**:
Read F05/current print sources, actual PrintLayout/PrintOrderView and both server route wrappers, ProtectedRoute/current session owner, installed Next server-client and use-client guides. Read T025 official hook API and contract current roles/print denials. Read docs/engineering/frontend-standard.md §§1–9, api-contracts.md §§2–7, security.md (current authority and safe errors), testing.md (actual boundary/discovery) and code-review.md; apps/web/AGENTS.md and installed Next client guidance when the task touches React/routes.

**Ordered steps**:

1. Implement the proposed focused boundary as specified: recognized two order families use current business protection plus page capability gate; report/unknown print families retain ADMIN/MVP provider behavior.
2. Test it in isolation against current session/route behavior; do not mount it over the legacy local view.
3. Make both thin server pages await Promise params and pass exact orderId into the common screen. Add compatible required screen prop/use with no local fallback ID guessing.
4. Retain the existing ADMIN layout/provider during this intermediate task so no broader role can reach legacy local paper and no useMvpStore provider is removed prematurely.

**Preserve / failure unchanged**:
Reports never gain sales/approval access; no new route, server JWT fetch, PDF service or disabled type check. This preparation does not claim official-view integration or broaden existing runtime permissions; T037 owns the activation cut.

**Tests / verification**:
New boundary component tests cover both alias families, report ADMIN, factory/ineligible current scope and unknown-family restriction; assert server route IDs share the same screen input. Run pnpm --filter @template/web test src/features/printing/components/print-access-boundary.test.tsx src/components/auth/routes.test.tsx src/components/auth/route-state.test.ts; run pnpm --filter @template/web check-types to verify awaited params/screen prop without suppressions.

**Done when**:
Preparatory component/explicit IDs compile and tests/reviews pass while existing runtime layout authority remains byte-for-byte unchanged; no unprotected/unsupported intermediate view is introduced.

### T036

**Add bounded factual approval annotation to preserved paper**

**Execution prerequisites**: T021, T034.

**Requirements / dependencies**:
FR-023, FR-026, FR-029; F05 exact annotation/F-V11. Depends T021 and T034 canonical cancelled line/money mapping.

**Allowed file actions**:
MODIFY only these exact repository-relative files:

- apps/web/src/features/orders/components/order-paper-form-props.tsx
- apps/web/src/features/orders/components/order-paper-form-screen.tsx
- apps/web/src/features/orders/components/order-paper-form.tsx
- apps/web/src/styles/oriental/paper-form.css
- apps/web/src/features/orders/order-print-rows.test.tsx
- apps/web/src/features/orders/order-price-non-editable.test.tsx
  No branding footer, base-print.css or report CSS changes.

**Read-before-edit bundle**:
Read F05 PaperApprovalAnnotation signature/exact placement and F-V11; actual paper props/barrel/screen .paper-signature block, .paper-main-lower grid and print CSS; prior row/financial tests; contract real initial/per-piece approval stamps.

**Ordered steps**:

1. Add/re-export PaperApprovalAnnotation readonly {initialActorName,initialApprovedAt,orderVersion,approvedAmendmentCount} and optional approvalAnnotation prop; no arbitrary ReactNode or authority field in user form.
2. Render one escaped small factual block immediately after the original captured-signature i inside existing .paper-signature, only when provided.
3. Use scoped .paper-approval-annotation font-size9px/line-height1.2/overflow-wrap:anywhere without fixed height/clipping/ellipsis. Keep grids/tables/footer/8-row chunks unchanged.
4. Print only compact initial approval/version/count; never render the up-to-200 per-piece stamp list on every page. Full factual stamps belong the T037 print:hidden preview context.

**Preserve / failure unchanged**:
Do not overwrite responsibleSignature, fabricate names/time/seals, silently truncate or change geometry to mask overflow. Prop absence leaves current paper behavior unchanged; canonical frozen fields/money and cancelled rows stay intact.

**Tests / verification**:
Extend component row tests for prop absent/present, escaped actual text, original signature kept, bounded one annotation per existing page, 150-character actor name and 1/8/9/17 eligible rows, cancelled/empty/all-cancelled cases. Run pnpm --filter @template/web test src/features/orders/order-print-rows.test.tsx src/features/orders/order-price-non-editable.test.tsx. Actual physical A4 fit must later pass browser/print acceptance; component chunk counts do not preapprove it.

**Done when**:
Typed prop/public export/minimal placement and component regressions pass both reviews; no clipping/layout redesign or fake signer is introduced. Any observed overflow is an explicit unresolved finding, not silently waived.

### T037

**Activate authoritative official printing on both preserved aliases**

**Execution prerequisites**: T021, T035, T036.

**Requirements / dependencies**:
FR-023–029; F05/F-V09–11. Depends T021, T035 explicit IDs/prepared boundary and T036 typed annotation; activates the final official route boundary atomically.

**Allowed file actions**:
MODIFY existing owners / CREATE print view test only these exact repository-relative files:

- apps/web/src/features/printing/screens/print-order-view.tsx
- apps/web/src/features/printing/screens/print-order-view.test.tsx
- apps/web/src/app/(print)/layout.tsx
- apps/web/src/features/printing/components/print-access-boundary.test.tsx
- apps/web/src/features/printing/hooks/order-paper.hooks.test.tsx
  Activate the final boundary/view atomically; reuse T025/T034/T036. No report, auth protocol or base-print.css changes.

**Read-before-edit bundle**:
Read F05 in full including native-print/post-read limit, T035 interim constraints, official contract/no-store/current stamps/printVersion, actual paper mapper and scoped props. Inspect current layout/view and approved PrintAccessBoundary, ProtectedRoute, query state/error helpers and installed Next client guidance.

**Ordered steps**:

1. In one bounded change compose PrintAccessBoundary in server layout and replace order PrintOrderView's useMvpStore/local role/order/status path with official hook/current capability data. Order branch no longer needs MVP authority; report branch retains ADMIN/provider unchanged.
2. Render no official document for loading/known denial/error/invalidated/obsolete scope. Show safe retry/explanation; no stale sales/local DTO fallback.
3. Map parsed official order into canonical paper with authoritative state/reference and T036 annotation; show full real initial/per-piece stamps only in print:hidden preview context, distinct from captured signature.
4. Existing print button force-refetches, correlates current scope/order/printVersion and waits for matching DOM commit before one window.print call. Obsolete/failing/denied result clears pending preparation.
5. Preserve native Ctrl+P/PDF. beforeprint synchronously checks current query state/scope and hides known-invalid plain wrapper; it cannot await network or revoke prior exports. Clean up listeners; do not require a custom-only print flow.

**Preserve / failure unchanged**:
All roles remain blocked while any submitted piece review remains pending, including renewed contact or partial resolution; companion manufacturing is unaffected. Factory/foreign/unapproved/returned paper stays denied. Reports stay ADMIN. Never print a fake signature/seal, old-account document, stale-success fallback or unapproved proposal.

**Tests / verification**:
View/boundary/hook tests F-V09–11 cover eligible roles, factory/other owner, unapproved/returned/pending one-or-many reviews, aliases sharing content, report restriction, failed refresh hiding DOM, print preflight denial/new version/single print, stale account callback, native valid preview and known-invalid hide. Run pnpm --filter @template/web test src/features/printing/screens/print-order-view.test.tsx src/features/printing/components/print-access-boundary.test.tsx src/features/printing/hooks/order-paper.hooks.test.tsx src/features/orders/order-print-rows.test.tsx. Native browser/physical output proof remains explicit future exit work.

**Done when**:
Both aliases use only authoritative official data with safe atomic boundary activation, native behavior and real metadata preserved; focused tests and both reviews pass with post-read/export limits documented.

### T038

**Review and verify the complete dependent frontend boundary**

**Execution prerequisites**: T021, T022, T023, T024, T025, T026, T027, T028, T029, T030, T031, T032, T033, T034, T035, T036, T037.

**Requirements / dependencies**:
FR-001–029, VR-006/008, SC-001–008 as far as frontend/component boundaries prove them; F-V01–11. Requires all T022–T037 and current T021 backend acceptance. Browser/physical-print/whole-phase evidence remains T039–T044.

**Allowed file actions**:
MODIFY evidence and verified task markers only only these exact repository-relative files:

- specs/004-approval-reapproval-printing/tasks.md
  All source/test owners from T022–T037 are read-only during this review task. Required fixes return to their owning authorized brief; accepted designs/spec/checklists/config/migrations are not edited here.

**Read-before-edit bundle**:
Read plan.md Verification and Review Plan/Design Readiness; frontend-design.md F00–F08; current accepted checklist review, T021 actual evidence and every completed frontend task brief/diff. Reopen docs/engineering/code-review.md, frontend-standard.md, api-contracts.md, security.md and testing.md; apply installed clean-code-guard/test-guard/docs-guard/React guidance to their actual changed boundaries rather than merely claiming skill names.

**Ordered steps**:

1. Reconcile current git status/diff ownership, source interfaces and dependency evidence; identify untouched/unreviewed boundaries and any drift before claiming acceptance.
2. Trace real approval/contact/receipt/current-wrapper/paper flows plus each failure path against F-V01–11, ADMIN actual-owner, four fields, separate notes/history capability, uncertainty/recovery and report/print limits. Check H1 explicitly: T023 has receipt transport only; T026 owns the origin-scoped observer; all callers pass their fixed capability; both subscriptions share same-order occupancy; reset-before-exact-removal notifies observers and preserves replacements. Require the real QueryClient dual-ADMIN navigation/overlap/ack/authority-loss cases.
3. Run targeted changed/shared regressions justified by current diff, then full web component suite, lint and types. Do not rerun already-passing checks without a new change/failure/concern merely for counts.
4. Record exact commands, fresh/cached results/warnings/limitations and separate REQUIREMENTS/ENGINEERING STANDARDS verdicts. Leave any unmet case/task open and route concrete fixes to its owner.
5. Keep real browser/native print/physical A4 and full-stack release claims pending; no green mocked component result substitutes for them.

**Preserve / failure unchanged**:
No skipped/weakened tests, extra retries, compiler relaxation, local-storage authority or permission bypass to obtain PASS. Existing P01–P03 contracts/receipts/paid/correction/session behavior and all accepted presentation remain protected.

**Tests / verification**:
Planned implementation commands: pnpm --filter @template/web test; pnpm --filter @template/web lint; pnpm --filter @template/web check-types, plus the targeted files named in T022–T037 when required by changes. check-types writes Next-generated types, so account for that expected tool output and preserve unrelated edits. Inspect actual test discovery and cleanup; do not run Docker/browser/migration from this component gate unless separately selected later.

**Done when**:
Current complete frontend source/diff passes separate requirements and engineering reviews and required component/static checks, with honest evidence in tasks.md; unresolved browser/physical-output/full-phase gates remain explicitly unperformed, not preapproved.

### T039

**Extend only the owned browser fixtures and reviewed-source arrangement**

**Execution prerequisites**: T021, T038.

**Requirements / dependencies**: VR-007/008; all story setup; Plan actual-data versus fixture evidence and Data legacy witness handling. This is test infrastructure only, with no production endpoint. Dependencies: T021, T038.

**Allowed file actions**: MODIFY exactly apps/api/tests/e2e/server.ts, apps/web/e2e/global-setup.ts and apps/web/e2e/runtime.ts. Private helper/type additions stay in those owners. Preserve apps/web/playwright.config.ts projects/retries/artifact policy; no new production router/config/seed/import endpoint.

**Read-before-edit bundle**: Existing API child E2eApiChildReadyMessage/sendToParent/createP03ConsumerFixtures/main, actual ApprovalService/ApprovalCommandExecutor produced earlier, real P03 SalesOrdersService; global setup ApiChildReadyMessage/buildApiChildEnvironment/manifest and teardown; runtime E2eRuntime/parseE2eRuntime/readE2eRuntime/waitForCapturedAction. Existing loader readReviewedCatalogBytes in apps/api/src/scripts/load-catalog.ts, ExcelCatalogWorkbookReader in infrastructure/catalog/workbook-reader.ts, assertReviewedCatalogPreview/CatalogLoaderService in modules/catalogs/catalog-loader.service.ts and reviewed manifest. Handoff/test isolation and security guides.

**Ordered steps**:

1. Convert the child private P03 returned/approved fixture construction to actual ApprovalService.returnInitial/approveInitial using the real current version/admin actor. Preserve p03ByProject keys/resource identity/original SalesCommand receipt bytes. Returned pieces remain unchanged; approved fixtures now assert exactly CUTTING/INCOMING rather than unchanged initial stages.
2. Add validated p04ByProject private ready metadata for distinct eligible sales owners/approvers/factory identities and isolated scenario order/piece IDs. Include per-project adminOwnedContact:{orderId,pieceId,issueId} for the existing runtime ADMIN identity as immutable owner: create/submit/approve/report/B-referral through the real services, retaining its selected target. It starts SALES_CONTACT with no submitted proposal and uses a separate order per project. Validate these UUID bindings in both child-ready and runtime parsing; do not expose an extra credential/fixture endpoint. Create actual P04 decisions through real services. Any unimplemented P05/P06 source-stage arrangement is explicitly labelled prerequisite setup and must not fabricate issue/decision/completion history. No fixture RPC or route is added; IPC remains ready/fatal/shutdown.
3. Parse private test-only P04_E2E_CATALOG_MODE as synthetic (default) or reviewed-workbook, rejecting any other value before bootstrap; forward only this allowlisted setting. In reviewed mode resolve the accepted repo-root workbook and invoke readReviewedCatalogBytes -> new ExcelCatalogWorkbookReader().read -> assertReviewedCatalogPreview -> CatalogLoaderService.apply(preview,"p01_e2e_browser") before any synthetic load. Synthetic mode preserves current setup. Never invoke the CLI environment-loading path, replace an immutable same-SHA synthetic source or fall back when the reviewed bytes are absent/invalid.
4. Add validated catalogEvidence {kind:"synthetic"|"reviewed-workbook",sourceSha256:string} alongside private per-project metadata, preserving mode0700 runtime directory/mode0600 manifest, project correlation and secret-safe output. Existing default regressions and the separate reviewed run each start a fresh owned container.

**Preserve / failure unchanged**: No real developer/production target, testnet, broad environment forwarding, exposed credential/token/DB URI or synthetic-as-reviewed claim. No new role/promotion/workflow; bootstrap and scoped fixtures remain owned test setup. Existing P01–P03 helpers private to customer-drafts.spec.ts are not importable exports.

**Tests / verification**: Future pnpm --filter @template/api check:e2e-types and pnpm --filter @template/web check:e2e-types must pass. Exercise default harness plus reviewed-source setup when T044 exists. Invalid mode/hash/missing bytes must fail setup before a synthetic fallback or business submit; verify only owned resources are removed after partial startup failure. Read-only TASKS tool discovery found no pdfinfo/pdftoppm installed; no PDF parser capability is assumed.

**Done when**: The existing owned harness can start two isolated source modes, publishes validated per-project metadata, constructs truthful P04 witnesses for earlier consumers plus the ADMIN-owned referred-order scenario, and tears down only its resources. Actual browser journeys/physical print evidence remain T040–T044.

### T040

**Prove the live initial return, resubmission and cutting-release journey**

**Execution prerequisites**: T039.

**Requirements / dependencies**: US1; FR-001–007/027–029; SC-001/005/008; real P04 decisions replace upstream fixtures for this claim. Dependencies: T039.

**Allowed file actions**: CREATE proposed apps/web/e2e/approval-reapproval-printing.spec.ts, with private helper functions for real browser identity/session/command reads; APPEND evidence to specs/004-approval-reapproval-printing/tasks.md. No app or harness changes beyond separately selected earlier task owners.

**Read-before-edit bundle**: Spec relevant US/FR/SC examples; Plan browser acceptance and discovery; Frontend F07 F-V01–12; Backend B01–B07; current apps/web/e2e/customer-drafts.spec.ts and staff-identity.spec.ts as private-helper examples; T039 runtime exports. Existing private helpers signInP02/dataFrom/createSalesBrowser/responseFor/sessionHeaders are not exports: define bounded equivalents privately in the new P04 spec, using current real session/cookies/CSRF and shared schemas. No direct DB reads/writes in browser workers.

**Ordered steps**:

1. Define P04 regression cases only for synthetic mode based on validated process environment available at test-definition time, never by reading runtime metadata before global setup. Keep existing P01–P03 test declarations unchanged. Reviewed-mode cases are added by T044; no skipped/todo required cases.
2. Use distinct real owned browsers and current routes to submit a complete P03 order, return it through approval with free text plus separate optional notes, observe owner detail notes, correct/resubmit through P03 and approve it to cutting. Assert original number/customer/decoration/prices/piece IDs and earlier decisions after reload/second session.
3. Exercise repair/adjustment UI without shortcuts, current pending/count/own-history behavior, denied other owner and stale competing decision. All-seven-type release is required by actual backend coverage; browser checks supplement it without pretending to run missing manufacturing UI.

**Preserve / failure unchanged**: No route-fulfilled fake success, role selector, fixed actor/time or direct DB approval. Source fixtures are labelled synthetic; this case does not claim actual workbook activation. Keep traces/videos/screenshots off and credentials out of artifacts.

**Tests / verification**: Future pnpm --filter @template/web test:e2e --grep "P04 US1" in both desktop/narrow projects; also both harness typechecks. Expected durable awaiting -> returned -> awaiting -> approved with all active pieces CUTTING/INCOMING once; wrong-owner/competing writes leave losing state unchanged. Own teardown remains T039 harness.

**Done when**: Both browser projects pass the real return/resubmit/approve route journey with persisted terms, notes/history and actual permission evidence, with no skips, retries hiding failure or P05 completion claim.

### T041

**Prove current-department issue reporting and A/B/C isolation**

**Execution prerequisites**: T040.

**Requirements / dependencies**: US2; FR-008–015; SC-002/005; F-V04/12. Dependencies: T040.

**Allowed file actions**: EXTEND only apps/web/e2e/approval-reapproval-printing.spec.ts and evidence in specs/004-approval-reapproval-printing/tasks.md; reuse T040 helpers and T039 per-project scenarios.

**Read-before-edit bundle**: Spec relevant US/FR/SC examples; Plan browser acceptance and discovery; Frontend F07 F-V01–12; Backend B01–B07; current apps/web/e2e/customer-drafts.spec.ts and staff-identity.spec.ts as private-helper examples; T039 runtime exports. Existing private helpers signInP02/dataFrom/createSalesBrowser/responseFor/sessionHeaders are not exports: define bounded equivalents privately in the new P04 spec, using current real session/cookies/CSRF and shared schemas. No direct DB reads/writes in browser workers.

**Ordered steps**:

1. Start from labelled prerequisite source-stage fixtures; use a real current factory account against the actual protected manufacturing issue operation, then the existing approval UI for separate A/B/C scenarios. Do not add P05/P06 controls.
2. Assert actual source/reporter/time, one held issue, explicit cutting/production targets, owner referral and retained cancellation; compare companion piece IDs/stage/workState/terms before and after. Wrong-source and obsolete/foreign issue attempts must deny without a second issue/event.
3. Reload under another permitted session and observe authoritative target/current issue/counts/history, with no ordinary manufacturing receipt/start/completion inferred from the issue decision.

**Preserve / failure unchanged**: Only selected piece changes. All source-state setup remains labelled fixture preparation; real P04 report/decision requests cannot be mocked or replaced by DB mutations.

**Tests / verification**: Future pnpm --filter @template/web test:e2e --grep "P04 US2" for desktop/narrow. Expected A target INCOMING, B held owner contact with fixed target, C retained cancellation once, companion unchanged. Actual HTTP redaction from the same factory context omits private/financial fields.

**Done when**: Real report and all three decision branches have role-aware browser/network/reload evidence with companion isolation and truthful lifecycle limits.

### T042

**Prove the four-field contact and mandatory reapproval cycles**

**Execution prerequisites**: T041.

**Requirements / dependencies**: US3; D-003/D-005; FR-016–023/027–029; SC-003/005/006/008; F-V05–08. Dependencies: T041.

**Allowed file actions**: EXTEND only apps/web/e2e/approval-reapproval-printing.spec.ts and evidence in specs/004-approval-reapproval-printing/tasks.md; reuse exact current protected operations and shared body/result schemas.

**Read-before-edit bundle**: Spec relevant US/FR/SC examples; Plan browser acceptance and discovery; Frontend F07 F-V01–12; Backend B01–B07; current apps/web/e2e/customer-drafts.spec.ts and staff-identity.spec.ts as private-helper examples; T039 runtime exports. Existing private helpers signInP02/dataFrom/createSalesBrowser/responseFor/sessionHeaders are not exports: define bounded equivalents privately in the new P04 spec, using current real session/cookies/CSRF and shared schemas. No direct DB reads/writes in browser workers.

**Ordered steps**:

1. Use real B referral, owner returned/detail contact UI and valid current catalog IDs to propose size40 -> 40.5, optional floor clear and a notes-only response in separate cases; fixed decoration/customer/price/other fields must stay fixed. Submit cancellation as a request, not a delete.
2. Return a proposal to the same owner with reason, observe held/print-blocked state and retained target/history, resubmit on the same issue and positively approve to the retained target; separately cancel through approval without applying pending values. Verify other owner and ADMIN-on-behalf denial; actual owner-ADMIN behavior is covered at the service/HTTP boundary.
3. For unknown response recovery use Playwright route.fetch() to the real command and abort only the response after actual commit. Close modal and observe the same command ID through the actual receipt endpoint; a confirmed refresh failure offers synchronization only. Never route.fulfill fabricated success or issue a replacement ID.
4. Use T039 adminOwnedContact with the existing ADMIN identity as actual owner. Submit under SALES_CONTACT, let the server commit and abort its response, then close/navigate to APPROVAL for the same order without changing actor/accessVersion/epoch. Use existing in-app links/client-side Next navigation within the same QueryClient; page.goto, reload or a new context would discard the memory-only session and cannot prove this recovery. The approval wrapper can now expose a valid current proposal, but the shared occupied slot must prevent REVIEW_CONTACT or any second POST. Recover the original receipt ID/body, synchronize through the original contact-wrapper route, acknowledge, and only then allow a fresh approval intent. Assert visible recovery and actual network/persisted effects; component tests own the private key/origin assertions, with no QueryClient/debug endpoint exported to the browser.

**Preserve / failure unchanged**: No automatic restore/resume, companion edit, repricing, sales cancellation or erased proposal history. Retain dirty input on recoverable error and prevent late account/resource response publication.

**Tests / verification**: Future pnpm --filter @template/web test:e2e --grep "P04 US3" across both projects. Inspect real root versions/current proposal IDs/held versus target state, prior values/reasons, request-only money unchanged and actual one-command recovery after modal closure/reopen or same-scope navigation. Separately reload to verify canonical persisted state; memory-only unresolved command/body is not reconstructed after a full browser reload.

**Done when**: Both projects prove the accepted allowlist and positive-approval-only release, repeated review cycles/request decisions, owner isolation, closed-dialog unknown/confirmed recovery and ADMIN cross-capability same-order recovery without a second intent before acknowledgment.

### T043

**Prove retained cancellation money and zero-active presentation**

**Execution prerequisites**: T042.

**Requirements / dependencies**: US4; FR-013–015; SC-004; F-V11; paid stays the existing P03 action. Dependencies: T042.

**Allowed file actions**: EXTEND only apps/web/e2e/approval-reapproval-printing.spec.ts and evidence in specs/004-approval-reapproval-printing/tasks.md.

**Read-before-edit bundle**: Spec relevant US/FR/SC examples; Plan browser acceptance and discovery; Frontend F07 F-V01–12; Backend B01–B07; current apps/web/e2e/customer-drafts.spec.ts and staff-identity.spec.ts as private-helper examples; T039 runtime exports. Existing private helpers signInP02/dataFrom/createSalesBrowser/responseFor/sessionHeaders are not exports: define bounded equivalents privately in the new P04 spec, using current real session/cookies/CSRF and shared schemas. No direct DB reads/writes in browser workers.

**Ordered steps**:

1. Use frozen pieces1800/1500 and actual cumulative paid2000 in an owned approved order. Cancel only the1500 piece through actual approval confirmation, then reload authorized sales/approval projections.
2. Assert original/cancelled/active 2/1/1, total1800, paid2000, due0, surplus200 and retained cancelled identity/reason; repeated original intent cannot deduct again. Factory output must remain private-safe.
3. Cancel the final eligible active piece through a real issue/review path and assert CANCELLED, active0/completion0, paid retained and no deliverable-ready/automatic refund claim. Compare unrelated work and historical money evidence.

**Preserve / failure unchanged**: No direct deletion, demo450 price, paid clamp, quantity double deduction or invented accounting/refund. Concurrent paid-write safety belongs to T013 actual database/HTTP evidence; a sequential browser case is not described as race proof.

**Tests / verification**: Future pnpm --filter @template/web test:e2e --grep "P04 US4" in both projects; exact canonical strings 1800.00/2000.00/0.00/200.00 and retained counts/history after reload. All-cancelled total0 and surplus equals actual paid, with no lost identities.

**Done when**: Real UI/network results agree on retained cancellations/exact money/zero-active status in both projects; no money movement is claimed.

### T044

**Prove official/factory permissions, reviewed source and physical paper fit**

**Execution prerequisites**: T043.

**Requirements / dependencies**: US5 plus actual-catalog P04 acceptance; FR-023–029, D-004, SC-006–008; F-V09–12; Plan real-data and print boundaries. Dependencies: T043.

**Allowed file actions**: EXTEND only apps/web/e2e/approval-reapproval-printing.spec.ts and evidence in specs/004-approval-reapproval-printing/tasks.md. Physical PDF artifacts are private mode0600 files in an owned random mode0700 temporary directory, removed after inspection; no committed PDFs/screenshots/tokens or new PDF service/parser dependency.

**Read-before-edit bundle**: Spec relevant US/FR/SC examples; Plan browser acceptance and discovery; Frontend F07 F-V01–12; Backend B01–B07; current apps/web/e2e/customer-drafts.spec.ts and staff-identity.spec.ts as private-helper examples; T039 runtime exports. Existing private helpers signInP02/dataFrom/createSalesBrowser/responseFor/sessionHeaders are not exports: define bounded equivalents privately in the new P04 spec, using current real session/cookies/CSRF and shared schemas. No direct DB reads/writes in browser workers. Read T039 mode/source evidence arrangement and current PrintOrderView/annotation/print CSS produced by T035–T037. Poppler pdfinfo/pdftoppm were not installed at TASKS intake; do not name them as available or infer an undeclared parser package.

**Ordered steps**:

1. In default synthetic-mode browser cases exercise both print aliases for owner sales/approval/ADMIN versus foreign sales/factory; pending one/two piece reviews, partial resolution and return-to-sales must keep whole paper blocked until all resolve. Current authority/known read denial removes paper; factory read preserves bounded safe whole-order context and excludes nested finance/private/proposal correspondence.
2. Assert actual initial/per-piece approval metadata, separate captured signature and no fake stamp. Exercise print-button current-read preflight plus preserved native print behavior and its explicit post-read/export limit. Check 1/8/9/17 eligible rows, cancelled/empty handling and maximum150-character actor name annotation without silently truncating real names or changing eight-row geometry.
3. Use real Chromium page.pdf({preferCSSPageSize:true,printBackground:true}) for the authorized cases. Retain only owned synthetic PDFs for manual browser/PDF-viewer inspection of physical page counts1/1/2/3, A4 landscape, clipping/wrapping and no blank extra pages. Record actual inspection; DOM article/row count alone cannot complete this gate. No brittle raw-PDF regex or unverified parser capability is acceptance evidence.
4. Declare a reviewed-mode test named "P04 reviewed workbook approval reapproval and official paper" based only on the explicit mode environment at test-definition time; inside it assert runtime.catalogEvidence.kind and reviewed SHA, then use actual workbook-backed P03 submit -> P04 return/resubmit/approve -> contact/reapproval -> official paper through real services/routes in the fresh owned target. No synthetic source is admitted in this run; no skips/todo or conditional pass when bytes are absent. Existing P01–P03 test declarations remain unchanged.

**Preserve / failure unchanged**: No official print while any submitted review remains pending, no prior-version alternative, no finance/private data in factory responses, no widening report access. Saved exports cannot be revoked; native print cannot await new auth. Real-workbook source hash alone is insufficient unless sourcekind/loader path is actual reviewed bytes before synthetic admission.

**Tests / verification**: Future default pnpm --filter @template/web test:e2e --grep "P04 US5" and a separate fresh P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e --grep "P04 reviewed workbook", both desktop/narrow, no retries/skips. Manual physical PDF inspection is required and recorded as manual evidence, separate from automated DOM/browser checks. Missing Docker/Chromium/source or physical inspection leaves this task open; no original database fallback.

**Done when**: Both alias/role/hold/privacy journeys, physical page-fit inspection and one actual reviewed-source P04 end-to-end journey pass with explicit source/environment/evidence labels. Temporary artifacts are cleaned only after inspection and evidence capture.

### T045

**Document the implemented P04 behavior without changing roadmap decisions**

**Execution prerequisites**: T044.

**Requirements / dependencies**: Constitution IX/X; Plan verification/docs and P04 exit; all stories. Dependencies: T044.

**Allowed file actions**: MODIFY only affected current behavior/route/test/permission/setup sections of README.md and PROJECT_REFERENCE.md. APPEND actual evidence in specs/004-approval-reapproval-printing/tasks.md. Root plan.md, accepted spec/technical design/checklist wording and P01–P03 evidence are not rewrite targets.

**Read-before-edit bundle**: Actual final router/OpenAPI/shared contracts and service/source owners after prior tasks; actual manifests/scripts; Plan source and evidence limits; engineering code-review documentation checks and docs-guard. Reference the existing setup without inventing installed PDF tooling or production deployment evidence.

**Ordered steps**:

1. Find each currently documented statement affected by P04 and update only its owning section to actual implemented initial decisions, issues/contact/reapproval, permissions/print, factory privacy and meaningful commands.
2. Keep synthetic default regression versus fresh reviewed-source acceptance, manual physical-output inspection, current access limits and later release scope explicit. Preserve the protected roadmap owner-review/client-input states and prior historical evidence.
3. Run targeted Markdown formatting/reference/command-symbol checks, inspect actual source/CLI definitions and record scoped documentation review outcomes in this ledger. Do not trigger root formatting/build to validate prose.

**Preserve / failure unchanged**: No unverified production-ready, refund/message-delivery, later manufacturing/warehouse or security guarantee. No new source/config/permission behavior from a documentation task.

**Tests / verification**: Future pnpm exec prettier --check README.md PROJECT_REFERENCE.md and git diff --check, plus relative-link/anchor and exact script/schema/route/source verification under docs-guard. Affected code examples must match final actual exports; never assume proposal files already implemented.

**Done when**: Affected existing docs accurately describe final source/commands and evidence limits with no unrelated rewrite, broken reference or invented capability; document review is recorded separately from application acceptance.

### T046

**Complete current full verification, cleanup and P04 acceptance**

**Execution prerequisites**: T045.

**Requirements / dependencies**: All FR-001–029, VR-001–008 and SC-001–008; Spec Phase Exit and Plan full-exit gate. Dependencies: T045.

**Allowed file actions**: APPEND exact commands, results, scoped source identity, reviews, manual print evidence and remaining limits in specs/004-approval-reapproval-printing/tasks.md. Mark only tasks whose required work/evidence passed. Corrections remain in their named prior owners; no accepted product/design change, migration rewrite, broad cleanup or release action.

**Read-before-edit bundle**: All earlier task briefs/evidence, Plan Verification and Review Plan and Design Readiness, current code/callers/contracts/migrations, code-review/testing/handoff guides. Preserve custom checklist markers as read-only during code; requirements-quality approval is not an execution result.

**Ordered steps**:

1. Reconcile the final source state and all requirement/risk coverage, ensure T021 backend and T038 frontend review gates remain applicable, and resolve required in-scope findings through their fixed owners. Distinguish fresh from cached/reused prior results and never represent pending infrastructure or manual inspection as passed.
2. Run the eleven current full commands listed in the shared verification policy, including the complete default real-stack browser regression across both projects, then the additional explicit reviewed-workbook browser acceptance run from T044 in a new owned target. Reuse no stale actual-source result when relevant source changed; physical PDF inspection must be current for final paper changes.
3. Inspect owned teardown after success/partial failure: no leftover owned API/Next children/container/private runtime, and remove only inspected owned PDF temporary artifacts. Preserve unrelated services/data, original migrations/checksums and workbook. Record REQUIREMENTS and ENGINEERING STANDARDS separately plus backend/frontend/P04 versus unperformed OPS-01/release status.

**Preserve / failure unchanged**: No forced pass, skipped required test, arbitrary retry/sleep/timeout change, suppressed warning, unrelated database or production action. No commit/push/deployment/external message without separate covering authority. A backend-only or partial batch cannot close P04.

**Tests / verification**: Future full commands: pnpm format:check; pnpm lint; pnpm check-types; pnpm test; pnpm test:integration; pnpm build; pnpm verify:build-output; pnpm --filter @template/web check:e2e-types; pnpm --filter @template/api check:e2e-types; pnpm --filter @template/web test:e2e; git diff --check. Additionally P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e --grep "P04 reviewed workbook" and current manual physical paper inspection. Root verify formats/generates/builds; no aggregate is read-only. Never run any of these application commands during TASKS generation.

**Done when**: All required accepted P04 behavior/reviews/current evidence, including real-source and physical print gates, pass; every unmet boundary remains explicit and open. P04 completion is distinct from release, whose OPS-01/production gates remain separately authorized.

## Implementation Readiness Coverage

PASS below means the brief is filled and its decisions/source references support handoff at TASKS generation. It does **not** mean dependencies, tests, checklist review, backend acceptance or implementation have passed. All execution is pending; T001 rechecks selection/source and T021 remains the mandatory frontend gate. A later ANALYZE performs its own read-only whole-list assessment.

| Task ID       | Filled brief / blueprint / source references                                                                            | Readiness           | Gap / evidence                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [T001](#t001) | Plan intake/constitution/readiness; workflow requirements approval; current selection                                   | PASS — brief/design | Seven filled fields; direct prerequisites none; execution evidence pending.                                                                                                             |
| [T002](#t002) | Contracts1–4/event summary; Backend interface/shared protocol; existing sales scalars                                   | PASS — brief/design | Seven filled fields; direct prerequisites T001; execution evidence pending.                                                                                                             |
| [T003](#t003) | Contracts3–9; Backend B06; existing sales-order/activity schemas                                                        | PASS — brief/design | Seven filled fields; direct prerequisites T002; execution evidence pending.                                                                                                             |
| [T004](#t004) | Data enums/three model tables; existing schema.prisma; quoted constraints                                               | PASS — brief/design | Seven filled fields; direct prerequisites T001; execution evidence pending.                                                                                                             |
| [T005](#t005) | Data sidecar invariants/transition/forward migration; nine preserved SQL owners                                         | PASS — brief/design | Seven filled fields; direct prerequisites T003, T004; execution evidence pending.                                                                                                       |
| [T006](#t006) | Data verification/upgrade; current migration/inventory/cleanup harness owners                                           | PASS — brief/design | Seven filled fields; direct prerequisites T005; execution evidence pending.                                                                                                             |
| [T007](#t007) | Backend shared protocol + interface ledger; Contracts4/7; existing SalesCommandExecutor                                 | PASS — brief/design | Seven filled fields; direct prerequisites T003, T006; execution evidence pending.                                                                                                       |
| [T008](#t008) | Backend helper ledger/shared algorithm/B06/B07; existing sales queries/mapper                                           | PASS — brief/design | Seven filled fields; direct prerequisites T007; execution evidence pending.                                                                                                             |
| [T009](#t009) | Backend B01/B07; Contracts3/4; real-service P03 consumer fixture conversion                                             | PASS — brief/design | Seven filled fields; direct prerequisites T008; execution evidence pending.                                                                                                             |
| [T010](#t010) | Backend B06 current reads/history; Contracts5/6; query integration owner                                                | PASS — brief/design | Seven filled fields; direct prerequisites T009; execution evidence pending.                                                                                                             |
| [T011](#t011) | Backend B02; Data source/one-open checks; Contracts3/6/7                                                                | PASS — brief/design | Seven filled fields; direct prerequisites T010; execution evidence pending.                                                                                                             |
| [T012](#t012) | Backend B03; Data retained transitions; Contracts3/4; cancellation helper                                               | PASS — brief/design | Seven filled fields; direct prerequisites T011; execution evidence pending.                                                                                                             |
| [T013](#t013) | Backend B03/B07; existing exact money/counts/paid command owners                                                        | PASS — brief/design | Seven filled fields; direct prerequisites T012; execution evidence pending.                                                                                                             |
| [T014](#t014) | Backend B04; Contracts3/5; Data immutable proposal + retained catalog IDs                                               | PASS — brief/design | Seven filled fields; direct prerequisites T013; execution evidence pending.                                                                                                             |
| [T015](#t015) | Backend B05; Data repeated transitions; Contracts3/4; applyContactProposal                                              | PASS — brief/design | Seven filled fields; direct prerequisites T014; execution evidence pending.                                                                                                             |
| [T016](#t016) | Backend B06 contact/workflow/return notes; Contracts5/6                                                                 | PASS — brief/design | Seven filled fields; direct prerequisites T015; execution evidence pending.                                                                                                             |
| [T017](#t017) | Backend B06 history/B07; Contracts9; current sales history consumers                                                    | PASS — brief/design | Seven filled fields; direct prerequisites T016; execution evidence pending.                                                                                                             |
| [T018](#t018) | Backend B06 official/factory paper; Contracts5/6; real witness/held-piece gate                                          | PASS — brief/design | Seven filled fields; direct prerequisites T017; execution evidence pending.                                                                                                             |
| [T019](#t019) | Backend B01–B07 interface ledger; Contracts6–8; current router/OpenAPI                                                  | PASS — brief/design | Seven filled fields; direct prerequisites T018; execution evidence pending.                                                                                                             |
| [T020](#t020) | Contracts6/7 matrix; Backend B07; actual-app HTTP integration harness                                                   | PASS — brief/design | Seven filled fields; direct prerequisites T019; execution evidence pending.                                                                                                             |
| [T021](#t021) | Plan backend gate/verification; all T002–T020 tests/callers; both reviews                                               | PASS — brief/design | Seven filled fields; direct prerequisites T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020; execution evidence pending. |
| [T022](#t022) | Frontend F00/F01/F-V01; existing operational scope/auth/transport                                                       | PASS — brief/design | Seven filled fields; direct prerequisites T021; execution evidence pending.                                                                                                             |
| [T023](#t023) | Frontend F02/F-V02 receipt transport only; Contracts6/8/9; current adapter/QueryClient pattern                          | PASS — brief/design | Seven filled fields; direct prerequisites T021, T022; execution evidence pending.                                                                                                       |
| [T024](#t024) | Frontend F02/F-V02; Contracts owner contact/wrapper; current scope hooks                                                | PASS — brief/design | Seven filled fields; direct prerequisites T021, T022; execution evidence pending.                                                                                                       |
| [T025](#t025) | Frontend F02/F05/F-V09; Contracts official paper; API output parser                                                     | PASS — brief/design | Seven filled fields; direct prerequisites T021, T022; execution evidence pending.                                                                                                       |
| [T026](#t026) | Frontend F03/F-V07–08 explicit capability/origin/receipt owner and two-key slot; Contracts4/7; current command patterns | PASS — brief/design | Seven filled fields; direct prerequisites T021, T023, T024, T025; execution evidence pending.                                                                                           |
| [T027](#t027) | Frontend F02/F04/F-V03; existing dashboard/pending/history views                                                        | PASS — brief/design | Seven filled fields; direct prerequisites T021, T026; execution evidence pending.                                                                                                       |
| [T028](#t028) | Frontend F04/F06/F-V03–04; current decision/return screens; form base                                                   | PASS — brief/design | Seven filled fields; direct prerequisites T021, T026; execution evidence pending.                                                                                                       |
| [T029](#t029) | Frontend F04/F-V04/06; current modal + three callers; current issue identity                                            | PASS — brief/design | Seven filled fields; direct prerequisites T021, T027, T028; execution evidence pending.                                                                                                 |
| [T030](#t030) | Frontend F04/F-V05; Contracts four-field patch; current modal/useCatalog                                                | PASS — brief/design | Seven filled fields; direct prerequisites T021, T024, T026, T028; execution evidence pending.                                                                                           |
| [T031](#t031) | Frontend F02/F04/F-V03/05; current returned-order page/P03 links                                                        | PASS — brief/design | Seven filled fields; direct prerequisites T021, T030; execution evidence pending.                                                                                                       |
| [T032](#t032) | Frontend F02/F04/F06; current sales detail/version/money/return notes                                                   | PASS — brief/design | Seven filled fields; direct prerequisites T021, T031, T028; execution evidence pending.                                                                                                 |
| [T033](#t033) | Contracts9; Frontend F02/F06; current activity/detail/revision projections                                              | PASS — brief/design | Seven filled fields; direct prerequisites T021, T032; execution evidence pending.                                                                                                       |
| [T034](#t034) | Frontend F06/F-V11; Backend B07; exact order-view/money/count owners                                                    | PASS — brief/design | Seven filled fields; direct prerequisites T021, T033; execution evidence pending.                                                                                                       |
| [T035](#t035) | Frontend F01/F05; installed Next route params; current print layout/view                                                | PASS — brief/design | Seven filled fields; direct prerequisites T021, T022, T025; execution evidence pending.                                                                                                 |
| [T036](#t036) | Frontend F05/F06/F-V10–11; existing paper props/CSS/signature box                                                       | PASS — brief/design | Seven filled fields; direct prerequisites T021, T034; execution evidence pending.                                                                                                       |
| [T037](#t037) | Frontend F05/F-V09; T035 boundary/T036 annotation; both current aliases                                                 | PASS — brief/design | Seven filled fields; direct prerequisites T021, T035, T036; execution evidence pending.                                                                                                 |
| [T038](#t038) | Plan frontend gate; Frontend F07/F08; changed tests/callers/reviews                                                     | PASS — brief/design | Seven filled fields; direct prerequisites T021, T022, T023, T024, T025, T026, T027, T028, T029, T030, T031, T032, T033, T034, T035, T036, T037; execution evidence pending.             |
| [T039](#t039) | Plan browser/actual-source; existing API child/setup/runtime/loader helpers                                             | PASS — brief/design | Seven filled fields; direct prerequisites T021, T038; execution evidence pending.                                                                                                       |
| [T040](#t040) | Spec US1/SC001; Backend B01/B07; Frontend F07; actual sessions/HTTP                                                     | PASS — brief/design | Seven filled fields; direct prerequisites T039; execution evidence pending.                                                                                                             |
| [T041](#t041) | Spec US2/SC002; Backend B02/B03; Frontend F07; live factory HTTP                                                        | PASS — brief/design | Seven filled fields; direct prerequisites T040; execution evidence pending.                                                                                                             |
| [T042](#t042) | Spec US3/D003/D005; Backend B04/B05; Frontend F03/F04/F07                                                               | PASS — brief/design | Seven filled fields; direct prerequisites T041; execution evidence pending.                                                                                                             |
| [T043](#t043) | Spec US4/SC004; Backend B03/B07; Frontend F06/F07                                                                       | PASS — brief/design | Seven filled fields; direct prerequisites T042; execution evidence pending.                                                                                                             |
| [T044](#t044) | Spec US5/SC006–007; Backend B06; Frontend F05/F07; owned source/PDF checks                                              | PASS — brief/design | Seven filled fields; direct prerequisites T043; execution evidence pending.                                                                                                             |
| [T045](#t045) | Existing README/PROJECT_REFERENCE claims; actual T040–T044 evidence                                                     | PASS — brief/design | Seven filled fields; direct prerequisites T044; execution evidence pending.                                                                                                             |
| [T046](#t046) | Spec phase exit; Plan full commands; all current evidence/source/reviews                                                | PASS — brief/design | Seven filled fields; direct prerequisites T045; execution evidence pending.                                                                                                             |

No unresolved material product or handoff choice is delegated to implementation. Runtime Docker/Chromium availability, a reviewed workbook in the owned run and manual physical PDF inspection are concrete future evidence gates. Missing capability leaves the task open; it does not permit another database, synthetic fallback or an invented pass.

## Requirement and Review Coverage

Ranges below are inclusive. Each implementation task includes named tests; acceptance IDs inspect the complete actual boundary. Shared T001/T021/T038/T046 apply to every row.

| Requirement / risk                                                              | Implementation IDs                           | Test / review / evidence IDs                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FR-001 authority/current resource/owner; no ADMIN on-behalf                     | T002/T003/T007–T020/T022–T026/T035/T037      | T020/T021/T022/T026/T038/T040–T044/T046                                                  |
| FR-002 queues/counts/filter/calendar/own history                                | T003/T010/T016/T017/T023/T027/T028/T031/T033 | T010/T016/T017/T020/T027/T033/T040/T046                                                  |
| FR-003 current revision/terms/real identity                                     | T003/T009/T016–T018/T028/T032/T033           | T009/T020/T028/T032/T040/T044                                                            |
| FR-004 all-seven-type coherent cutting release                                  | T004–T009/T019/T028                          | T006/T009/T020/T021/T040                                                                 |
| FR-005 reason4000/separate notes/retained actor                                 | T002/T003/T009/T016/T028/T032                | T003/T009/T020/T028/T032/T040                                                            |
| FR-006 P03 current proof/correction/resubmit                                    | T005/T006/T009/T016/T019/T028/T031/T032      | T006/T009/T020/T021/T040                                                                 |
| FR-007 exactly-once/stale/concurrency/rollback/unknown                          | T002–T008/T009/T011–T015/T019/T026           | T006/T007/T009/T011–T015/T020/T021/T026/T042                                             |
| FR-008 source-authorized exact piece issue/report                               | T003–T008/T011/T019                          | T006/T011/T020/T041                                                                      |
| FR-009 singleton hold/one-open cycle/companions                                 | T004–T008/T011/T012/T015/T029                | T006/T011/T012/T015/T020/T041/T042                                                       |
| FR-010 A/B/C actor/text/current identity                                        | T003/T007/T008/T012/T019/T029                | T003/T012/T020/T029/T041                                                                 |
| FR-011 A target and no invented work/transfer                                   | T012/T018/T029                               | T012/T018/T020/T029/T041                                                                 |
| FR-012 B owner/retained explicit target                                         | T004/T005/T012/T014–T016/T029–T032           | T006/T012/T014–T016/T020/T029–T032/T041/T042                                             |
| FR-013 retained C/confirm/reason/no dispatched cancel                           | T004–T008/T012/T013/T015/T029                | T006/T012/T013/T015/T020/T029/T041–T043                                                  |
| FR-014 frozen exact money/counts/paid/surplus                                   | T008/T012/T013/T015/T034                     | T006/T012/T013/T020/T034/T043                                                            |
| FR-015 zero-active retained/not deliverable completion                          | T012/T013/T034/T036/T037                     | T013/T020/T034/T037/T043/T044                                                            |
| FR-016 exact owner contact work/current piece                                   | T003/T016/T024/T030–T032                     | T016/T020/T024/T030–T032/T042                                                            |
| FR-017 real notes/proposal/request/dirty state                                  | T003/T014/T024/T026/T030–T032                | T003/T014/T020/T026/T030/T042                                                            |
| FR-018 four fields/sole clear/all other terms fixed; D-003                      | T003–T008/T014/T015/T030                     | T003/T006/T014/T015/T020/T030/T042                                                       |
| FR-019 pending intent separate/mandatory exact review                           | T004–T008/T014/T015/T029/T030                | T006/T014/T015/T020/T029/T030/T042                                                       |
| FR-020 accepted stored proposal/retained target/atomic                          | T005–T008/T015/T029                          | T006/T015/T020/T029/T042                                                                 |
| FR-021 same-owner return or C/no automatic resume; D-005                        | T003–T008/T015/T016/T029–T032                | T006/T015/T016/T020/T029/T042                                                            |
| FR-022 sales request only/no money/cancel side effect                           | T003/T014/T015/T029/T030                     | T014/T015/T020/T029/T030/T042/T043                                                       |
| FR-023 current witness/all pending holds; D-004                                 | T003/T008/T015/T018/T025/T035–T037           | T018/T020/T025/T037/T044                                                                 |
| FR-024 both aliases/current ownership/no stale fallback                         | T018/T019/T025/T035/T037                     | T020/T025/T035/T037/T044                                                                 |
| FR-025 factory nested privacy/current source                                    | T003/T008/T017/T018/T019                     | T003/T017/T018/T020/T021/T041/T044                                                       |
| FR-026 source fields/eight rows/A4/cancelled/empty                              | T034–T037                                    | T034/T036/T037/T044/T046; actual physical PDF1/1/2/3 pages                               |
| FR-027 truthful async/denied/error/retry/unknown                                | T007/T019/T020/T023–T033/T037                | T020/T023–T033/T037/T038/T040–T044                                                       |
| FR-028 synchronization/dirty/late scope/recovery                                | T022–T033/T037                               | T022–T033/T037/T038/T040/T042/T044                                                       |
| FR-029 preserved reached UI/RTL/Cairo/a11y                                      | T027–T037                                    | T027–T038/T040–T044; wide/narrow keyboard/focus                                          |
| VR-001 / SC-001 initial decisions and P03 retention                             | T009/T010/T016/T017/T027/T028/T032/T033      | T020/T021/T040/T046                                                                      |
| VR-002 / SC-002 / SC-004 persistent piece/money isolation                       | T004–T013/T018/T029/T034                     | T006/T011–T013/T020/T021/T041/T043                                                       |
| VR-003 / SC-005 controlled races/rollback/recovery                              | T007–T015/T026                               | T007/T009/T011–T015/T020/T026/T042/T046                                                  |
| VR-004 / SC-003 four-field repeated review                                      | T014–T016/T029–T032                          | T003/T014/T015/T020/T029/T030/T042                                                       |
| VR-005 / SC-006 current paper/holds/privacy                                     | T018/T025/T035–T037                          | T020/T021/T025/T037/T044                                                                 |
| VR-006 / SC-008 real forms/QueryClient/scope/UI consistency                     | T022–T038                                    | T023–T033/T037/T038/T040–T044                                                            |
| VR-007 / SC-007 real stack/actual paper/source                                  | T039–T044                                    | T040–T044/T046; actual reviewed workbook separate from synthetic                         |
| VR-008 / constitution VII/IX/X/XI backend-first/handoff                         | T001–T021/T038/T046                          | T001/T021/T038/T046; per-ID readiness and current source recheck                         |
| Migration retention/legacy witnesses/owned cleanup                              | T004–T009/T039                               | T005/T006/T009/T021/T039/T046; all nine old SQL byte-identical                           |
| Requirements versus engineering/documentation accuracy                          | Every brief; T045                            | T001/T021/T038/T045/T046; owning review guides and installed matching guards             |
| H1 explicit command capability, receipt ownership and cross-capability recovery | T022/T023/T026–T032/T039                     | T022/T026/T038/T042; F-V01/07/08, real QueryClient plus real ADMIN-owned browser journey |

## Generation Evidence

This section records TASKS-stage documentation evidence only. Generation reused the selected matching P04 spec/designs, its two existing checklists, source/manifests and the project override returned by `setup-tasks.sh --json`. No prior tasks.md existed. No extension configuration was present at preflight or completion, so no before/after hooks were dispatched.

The generated ledger has 46 sequential unchecked items and 46 filled seven-field briefs: US1=10, US2=4, US3=8, US4=3, US5=6, shared=15. Nine items have `[P]`; safe pairings above require actual prerequisite completion. Dependency validation requires an acyclic backward-only graph, and every frontend item T022–T038 directly names T021. T004 quotes every enum/model constraint-table row from the accepted data owner; the owner remains authoritative.

Final documentation checks: targeted Prettier, task/brief/ID/dependency/coverage/path/link consistency, verbatim field-content parity and preservation of all 903 pre-existing file hashes. These are generation checks, not formal ANALYZE or execution acceptance. The only repository addition is this tasks.md. No application tests, services, database/container operations, workbook loading, implementation, custom-checklist evaluation, commit, push or deployment ran. Read-only tool discovery found neither `pdfinfo` nor `pdftoppm`; the fixed future print gate uses actual Chromium PDFs plus separately recorded manual viewer inspection.

**TASKS handoff:** ready for the separately requested ANALYZE stage; all execution items and runtime/output gates remain pending.

### Scoped TASKS amendment: H1 recovery alignment

The owner authorized the remedy through PLAN/TASKS/ANALYZE on 2026-11-06. The amended F01–F04/F07 blueprint is the sole decision owner: required command capability, immutable origin, one synchronous cross-capability order slot, T026-only receipt query and observer-notifying replacement-safe cleanup. This amendment aligns T022/T023/T026–T032/T038/T039/T042 and their existing allowed test owners. It adds the ADMIN-owned fixture/real browser scenario without creating a product endpoint or changing accepted authority.

All 46 IDs, checklist summaries, story labels, parallel markers and dependencies are preserved; all task markers remain unchecked. SPECIFY/CLARIFY and both existing checklists are reused unchanged because the accepted product decisions and existing quality criteria cover this technical correction. No custom checklist item is evaluated or marked approved here. No backend, contract, data-model, migration or application source changes are part of this amendment.

TASKS handoff design is complete for the scoped correction; a final whole-feature ANALYZE must independently review every brief read-only. Documentation checks cover exact signature/caller/owner consistency, all seven brief fields, the unchanged task/dependency structure, links and preservation boundaries. Future component/browser/runtime checks remain pending, including the new ADMIN dual-capability scenario; no application suite, type generation, service/container, business action, workbook load, commit, push or deployment runs in this sequence.

## Group 1 Execution Evidence — 2026-11-07

### T001 scoped intake and pre-code review

**Authorized scope:** IMPLEMENT Group 1: Scoped Intake and Actual Prerequisites, exactly T001. The roadmap phase remains P04, mapped to `specs/004-approval-reapproval-printing`; the internal group is not a new roadmap phase. T002–T046 are outside this execution request. Earlier TASKS/PLAN scope statements and generation notes remain historical producing-stage records.

**Current baseline and selection:** Git branch `main`, HEAD `b9d2b3d`, ahead of `origin/main` by one existing commit. At intake the only Git status entry is the untracked P04 feature directory. `.specify/feature.json` already selects this feature; neither `SPECIFY_FEATURE_DIRECTORY` nor `SPECIFY_FEATURE` overrides it. The required `check-prerequisites.sh --json --require-tasks --include-tasks` call resolves its absolute path and lists `data-model.md`, `contracts/` and `tasks.md`. No selection correction or setup is needed. Preservation baseline: 904 repository/selection files captured before writing. Permitted writes are this ledger and the custom checklist only; accepted spec/design, built-in checklist, roadmap, prior features, source/tests/config, workbook and all nine SQL migrations are protected.

**Brief/readiness gate:** T001 has no execution prerequisite. Its exact allowed actions, context bundle, ordered steps, unchanged-state rules and documentation checks were checked under implementation-handoff section 4 before writing. Reviewed root instructions/constitution, workflow and handoff, all nine core engineering guide owners, accepted P04 spec/plan/backend/data/contract/frontend designs, task groups/dependencies and the selected T001 brief. No material product/interface/algorithm decision is missing for this intake. Proposed P04 code is not treated as existing dependency output.

**Current-source reconciliation:** Current account authority still lives in `apps/api/src/modules/auth/account-authority.ts` (`lockAccountRows`, `loadIdentityAccount`, `assertBusinessAuthority`). Existing sales rules still export exact-cent money/count/number helpers; mapper/query owners still provide `SALES_ORDER_SELECT`, sales/factory projections and `readCurrentOrderReturnProof`. `SalesOrdersService.resubmit`/`setPaid` use the existing submitted root and lock/version boundary. The old receipt actor schema and executor remain SALES/ADMIN-specific. Prisma still has the existing order/piece/return/issue-pointer fields, with no P04 sidecars or new migration yet. These observations support the planned additive boundary; they are not backend acceptance.

The frontend still has the SALES/ADMIN-only `readOperationalScope`, one stable `AppProviders` QueryClient, local MVP approval/contact/print behavior and ADMIN-only print layout. Those limitations are explicitly owned by the accepted later briefs, including removal of direct contact resume/delete and broader report permission prevention. The H1 remedy is present in F01/F03 and T022/T023/T026/T039/T042: explicit view capability, retained command origin, one occupied same-order slot across the two keys, sole receipt-query owner and observer-notifying guarded cleanup. T001 changes none of these interfaces or implementations.

**Requirements review:** Read every item in both checklists. The built-in specification review remains unchanged at 16/16. The custom review now records individual evidence for CHK001–CHK040 and marks all 40 satisfied for written quality only. No future execution check is marked passed, and no product choice is silently amended. Checklist markers are frozen for subsequent code work.

**Prerequisite evidence reused:** P03's final acceptance ledger records all 53 tasks complete, fresh API/database integration and 26 real browser journeys across desktop/narrow, with its documented cached counterparts and actual-workbook acceptance reuse boundary. This intake reuses that record and current source inspection; it reruns none of those tests and does not claim its controlled approval/return fixtures prove P04 commands or paper authority. P03 D-002 confirms `TYPE-YYYY-NNNN` with a shared sequence across types/years; it supersedes the protected roadmap's historical pending NUM-01 row for this feature. CAT-01/PRC-01 are confirmed and CAT-02 source is received; no source is reapplied. OPS-01, operational calendar/hosting/mail/backup and release acceptance remain separate. No host timezone is selected as policy.

**Tooling and future gates:** Fresh runtime versions are Node `24.18.1` and pnpm `11.17.0`, consistent with the current manifests. Inspected existing Prettier configuration/ignore owner and test discovery; no configuration change is needed. Docker/image availability, browser installation, live database migration history/orphan-pointer preflight and physical PDF tooling are not probed or assumed. They must be verified by their owning later tasks against owned isolated infrastructure. No database, service, application suite, build/type generation, import or business action is performed here.

**Dependency-safe continuation:** Once separately authorized, T002 and T004 have T001 as their only direct prerequisite and are the next eligible backend producers. All remaining dependencies retain their accepted order. The complete T002–T020 backend work and T021 acceptance gate must pass before dependent T022–T038 frontend integration. T039–T046 retain their cross-layer/phase-exit responsibilities. Completing T001 establishes intake only.

**Review coverage:** REQUIREMENTS review covers the selected intake, all custom written criteria, accepted decisions and prerequisite/evidence boundaries. ENGINEERING STANDARDS review covers constitution I/X/XI, workflow selection/write limits, handoff section 4, current ownership/source reconciliation and documentation verification under the engineering review procedure. Runtime architecture, persistent/HTTP behavior, React interaction and security behavior have no code change in T001; execution acceptance for those capabilities is N/A to this documentation-only batch, not approved for P04. `docs-guard` is used for the changed evidence; production/test guards are N/A because no production or test code changes.

**Fresh documentation verification:** Selected-feature prerequisite resolution passed. Targeted `pnpm exec prettier --write` and then `pnpm exec prettier --check` passed for this ledger and the custom checklist. Static checks confirmed all 46 sequential task IDs remain intact, all 40 custom criteria have individual review evidence, and 125 relative Markdown links/anchors across the two changed files resolve. The review checker initially assumed unpadded table cells; correcting its whitespace matcher made the check pass without changing artifact meaning. `git diff --check` passed; because P04 remains untracked, separate file/format/reference checks cover its content. Preservation comparison found exactly these two permitted files changed, no additions and 902 of 904 baseline files byte-identical, including selection, root roadmap, prior P03 evidence, source/tests/config, accepted design and migration history.

| Checklist                       | Total | Checked | Unchecked | Verdict                                                   |
| ------------------------------- | ----- | ------- | --------- | --------------------------------------------------------- |
| requirements.md                 | 16    | 16      | 0         | PASS — reused unchanged written-spec review               |
| approval-reapproval-printing.md | 40    | 40      | 0         | PASS — individual written-design review evidence recorded |

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS**, for T001's documentation/intake scope. `docs-guard` found no unresolved scoped evidence/reference issue. **Group 1 / T001: COMPLETE.** Only T001 is marked complete; T002–T046 remain unchecked. Backend acceptance, dependent frontend integration, complete P04 acceptance and release are pending, not inferred from these verdicts. No application tests were needed or run for this documentation-only change. No code, SQL, configuration, data, service or external action was changed. No commit/push/deployment occurred. Pre/post implementation hook checks found no `.specify/extensions.yml`, so no hooks were registered or executed. The request ends at Group 1.

## Group 2 Execution Evidence — 2026-11-07

**Scope:** T002–T021 only, P04 `004-approval-reapproval-printing`, `main` at `b9d2b3d`. T001 is reused complete. Fresh selection resolution matches; no environment override or hook file exists. Both requirements checklists remain read-only at 16/16 and 40/40. Existing untracked feature artifacts are preserved. A 904-file preservation snapshot was captured before code edits. Frontend integration and later groups remain excluded.

### T002 — scalar, receipt and event-summary contracts

Implemented the existing scalar extraction with compatible old exports, six-operation metadata-only receipt/outcome validation and strict safe activity summary. Actor rules are shared between receipt and summary without broadening old SALES-only schemas. Result validation correlates order/version and nullable/generated child targets; event decisions and unique changed fields are operation-bound. No route, database, old command receipt or history snapshot changed.

Fresh focused command: `pnpm --filter @template/contracts test src/approval/approval-command.schema.test.ts src/approval/approval-event.schema.test.ts src/sales-orders/sales-orders.schema.test.ts` — **42 tests / 3 files PASS**. `pnpm --filter @template/contracts check-types` passed. Initial lint found the compatibility reexport preceding remaining imports; moving it after all imports resolved the issue, and `pnpm --filter @template/contracts lint` passed. Targeted Prettier completed. No tests skipped or assertions weakened.

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T002. Clean-code-guard reviewed responsibility, existing primitive reuse, strict browser-safe dependency direction and explicit refinements; test-guard reviewed real schema inputs and accepted/denied/correlation/history regressions without mocks. Backend acceptance remains pending. Docker daemon read-only availability returned server 29.8.2; this does not yet establish isolated image/database or migration evidence.

### T003 — command, workflow, paper and history contracts

Added all six strict command bodies, exact params/query schemas, bounded current workflow/proposal/queue/dashboard/history/fact/official/factory projections and inferred public types. The activity union adds only `kind:approval`; legacy order/draft variants and full revision parsing remain intact. Tests cover the four-field allowlist, optional floor clear, notes-only/request separation, text bounds/normalization, required target/confirmation, pending/recontact print hold, identity bindings, source/reporter compatibility, exact labels/null retained references, factory nested privacy and additive-history compatibility. No API or frontend integration is claimed.

Fresh focused verification passed **51 tests / 4 files**. Initial lint identified a void shorthand, import spacing and two test-only non-null assertions; these were corrected without rule relaxation. Contracts lint and check-types passed after corrections. The complete contract regression run is recorded in the command output for this batch. Clean-code-guard and test-guard review found no remaining scoped ownership/type/assertion issue. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for this executable-contract slice. Backend producers/authority/migrations remain pending.

### T004 — Prisma declarations

Added exactly the three designed enums/models, retained actor/order/issue/proposal/catalog relations, composite identities and bounded index declarations in the existing schema. Existing models/columns remain; new inverse relations reuse existing owners. SQL deferral, partial unique indexes and cross-row/transition checks remain T005/T006 outputs, not encoded as a false Prisma validation claim.

Fresh `pnpm --filter @template/database db:format`, `db:validate` and `db:generate` passed with Prisma 7.9.1. Generated client output was produced solely by the existing generator, never hand-edited. No migration was applied and no data was read/written. Schema/relationship review against the data owner and all 50 quoted enum/model rows passed. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for declarations/generation only; persistence acceptance remains pending.

### T005 — additive migration and deferred witnesses

Authored `20261106000400_p04_approval_piece_issues/migration.sql` from the inspected installed Prisma diff plus reviewed SQL: all three tables/enums, retained/composite bindings, partial uniques, immutable source/event/proposal checks, legal issue transitions, aggregate/current-head bindings and separate new-approval/return witnesses. Seven circular FKs are explicitly DEFERRABLE INITIALLY DEFERRED and RESTRICT. Explicit transaction wrapping makes legacy orphan-pointer refusal atomic; no original SQL/function was replaced. Prisma generation is not used as constraint proof.

Fresh isolated PostgreSQL 18.4 run: `pnpm --filter @template/database test:integration tests/integration/p04-approval-constraints.integration.test.ts` — **4/4 PASS**. Tests inspect exact FK metadata; reject unwitnessed initial release with full state rollback; commit valid controlled data-boundary approval/report/referral graphs, then prove missing resolution/proposal witnesses fail at actual COMMIT and leave the prior root/piece/issue/proposal/command state intact. Controlled SQL witnesses prove constraints only, not live service acceptance. Initial runs exposed a SQL record/alias collision and fixture parameter cast conflict, both corrected. The proposal case now asserts its exact deferred missing-witness FK error, rather than incorrectly expecting a CHECK error.

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for migration/smoke scope. SQL/fixture review preserves old terms, history, current versus retained facts and isolated ownership; no reset, developer/production migration or actual client data action. Full constraint/populated/inventory/cleanup coverage remains T006.

### T006 — constraint, upgrade, inventory and owned cleanup verification

Updated exact model/enum/migration/table inventories and only the fixed owned truncate statements for `approval_commands`, `piece_contact_proposals` and `manufacturing_issues`. Existing environment/URI/database guards, unrelated sentinel preservation and external-FK refusal remain intact. No CASCADE or unrelated cleanup was introduced.

Fresh evidence: schema-contract **9/9 PASS**; database integration selection (P04/migration/seed) **44 tests / 3 files PASS** after adding fresh/populated/repeated P04 upgrade checks. Subsequently expanded P04 constraint selection passed **23/23** on its final test file, covering source/actor/operation/hash/version bindings, cross-order physical issue FK, immutable report/proposal retention, open-cycle uniqueness, required pointers, retained target, commit-time missing witnesses and rollback, and full cancellation without losing paid/history or allowing reopen. The actual migration source did not change during these later test additions. Three pre-P04 controlled states (awaiting/approved/returned) plus an incomplete draft preserve every old graph row and all nine applied migration/checksum rows; repeated deployment is unchanged and creates no fabricated approval. A legacy orphan pointer fails atomically before new tables appear.

Owned API cleanup unit **8/8 PASS** and real integration **3/3 PASS**. Contracts/database dependency builds passed; database lint and check-types and API lint passed. P03 fixture-success API suites are deliberately not claimed here: the accepted T009 conversions are still required before broad backend regression. Database fixtures are controlled constraint witnesses, not actual P04 service acceptance.

A T002 review correction additionally narrows piece outcomes to the designed held/resumed/cancelled states, rejecting warehouse/invalid release results. Complete contracts regression remained **187/187 PASS**, contracts lint/types/build passed. No existing SALES-only protocol was widened.

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T006. Clean-code-guard and test-guard review applies to the typed schema, additive SQL, real migrated negative/commit tests and fixed guarded cleanup. All supplied containers/clients are owned by the existing test harness and closed by its teardown; no developer/production database is used. T007 is now the next dependency-safe producer. Complete backend acceptance remains T021.

### T007 — bounded command executor and safe recovery

Implemented the six-operation typed execution/hash/work union, canonical selected-target hashing, P04-namespaced advisory lock, current account authority, exact intent replay and one bounded recognized conflict retry. The retained mapper returns only strict correlated metadata/outcome; root/piece/issue/proposal columns and returned target identities must agree. Actor-only observation preserves the report-source witness exception while denying a reassigned reporter from another factory department. Existing SALES executor/schema/table remain unchanged; existing narrow technical Prisma classifiers are reused rather than broadened.

Fresh hash tests: **2/2 PASS**. Final executor integration selection: **6/6 PASS** on disposable migrated PostgreSQL, including exact replay/changed intent/original-actor observation, actual rollback after dependent writes, current employee reassignment, generated issue-ID recovery without a second issue, bounded conflict exhaustion and a simultaneous same-ID test using independent connections with an observed blocked advisory lock before release. Controlled work callbacks are executor-boundary evidence, not ApprovalService/HTTP acceptance. All real services/queries remain later tasks.

API lint/check-types passed after removing an unused test import, unnecessary tuple optional chains and replacing a thrown test object with a real Error carrying the controlled adapter code. No rule or assertion was weakened. The existing pg query-concurrency deprecation warning remained visible; no suppression/retry configuration change was made. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for this executor slice under clean-code-guard/test-guard. SQL-backed rollback/race state, explicit dependencies, sanitized errors and no detached side effects were reviewed. T008 and its service consumers remain open; backend acceptance remains T021.

### T008 — existing root lock, strict mapping and pure hints

Implemented trusted APPROVAL/OWNER/FACTORY root locking on the existing submitted aggregate/version with actor-safe owner predicates (including ADMIN), bounded selected-record reuse and stale/exhausted-version rejection. Added typed retained proposal/current-issue selections and strict safe mappers, pure initial-state/issue-action/print-hold rules, and the specified sales hint correction. A former owner in APPROVAL receives no sales paid/resubmit hints; the existing nonowner ADMIN paid exception remains, while contact requires actual ownership.

Fresh focused pure rules/mapping/hints selection **6 tests / 2 files PASS**; root-lock integration **2/2 PASS** on migrated PostgreSQL. API lint/check-types passed after removing an unused old import and fixing test callback braces; no configuration change. Tests distinguish initial referral from submitted/recontact holds, partial resolution, retained source labels/null references, malformed capture failure, stale/foreign/exhausted roots and actual owner scope. No P03 postmigration successful direct-transition suite is claimed before T009 conversion. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** under current source/blueprint, clean-code-guard and test-guard review. No unused private service helper was created; real version/cancellation/application helpers remain at first use in their accepted tasks.

### T009 — actual initial approval/return and P03 compatibility

Implemented real approveInitial/returnInitial, one conditional private aggregate-version bump, complete all-type cutting release and separate reason/notes/current-proof facts. Replaced exactly eight successful direct-transition fixture blocks across the three named P03 service/query/HTTP test owners with actual authorized P04 service decisions. Intentional malformed-proof SQL negatives remain. Canonical returned timestamps now come from the real decision receipt; original frozen fields and P03 paid/resubmission protocols remain intact. Constructor keeps its accepted three-argument signature; query/calendar state is activated at its first read use in T010, rather than retaining unused private fields here.

Final focused integration: **33 tests / 4 files PASS**. The 11 new service cases cover all seven types, exact retained capture/money, max-bounded separate reason/notes, actual return→P03 correction/resubmit→approval, receipt replay, controlled competing root locks and complete rollback after an actual database receipt-insertion fault. The other 22 P03 regressions pass with real decision prerequisites. Initial runs exposed an omitted test-helper type parameter and style/type-only imports; those were corrected, with the complete selection rerun green. API lint/check-types passed. No browser child fixture or frontend changed; P04 HTTP evidence remains T020.

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T009 under actual transaction/current-authority/frozen-term and clean-code-guard/test-guard review. No SQL assertion or rule was weakened. The existing pg query-concurrency warning remained visible. Whole-backend acceptance remains T021.

### T010 — scoped pending/dashboard/own history reads

Added current-authority RepeatableRead/account-lock reads, matching bounded pending filters/counts/page ordering, current actor decision history and role-wide actual approval/calendar counts. Own history projects only bounded scalar summaries, never whole JSON snapshots. Dashboard counts current returned roots separately from approvedToday and uses parameterized configured-zone local-midnight bounds; missing/invalid zone affects dashboard only. No host timezone or fake empty/error fallback was introduced.

Fresh query integration **5/5 PASS**, including root checks, two eligible decision actors, own versus role-wide history/counts, search/type/out-of-range paging, denied sales actor, missing calendar with commands unaffected, and New York's controlled 25-hour fall-back day versus UTC. API lint/check-types passed after explicitly supplying the parsed optional-search output property for the internal dashboard query. The current schema review also found and fixed a T003 implementation omission: SALES_CONTACT response shapes now require their retained target even before a proposal exists. A focused regression was added; complete contracts **188/188 PASS**, lint/types/build PASS. No product/design artifact changed.

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for these reads and the scoped contract correction. Actual Postgres/timezone and current-authority behavior, bounded projections, no N+1/page-in-JavaScript and meaningful denial assertions were reviewed under the owning guides and guards. Complete HTTP/backend acceptance remains pending.

### T011 — current-department issue reporting

Verified current B02/source/partial-index protocol and current root/executor/mapper callers before writing. Actual current-department employees for CUTTING, PRODUCTION and QUALITY and ADMIN source derivation are covered. Reporting retains the immutable source and reporter, blocks only the selected physical piece, allocates a retained cycle and advances the root once. Companion capture/price/state and all money remain unchanged. Missing/foreign/stale/duplicate and simultaneous distinct reports cannot create another open cycle. A labelled controlled resolution fixture tests later report-cycle retention; actual A/B/C acceptance remains T012.

Fresh service integration **18/18 PASS**, including two actual concurrent report commands observed waiting on independently held PostgreSQL root locks and receipt-insertion fault rollback. Focused rules/executor **6/6 PASS**; API lint/check-types PASS. Three initial dashboard assertions used the intentionally calendar-free service; corrected those assertions to use a configured UTC service, preserving the explicit unavailable-calendar behavior. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** under clean-code-guard/test-guard review of current source and SQL-backed assertions. No downstream work execution is claimed.

### T012 — A/B/C decisions and retained cancellation

Reviewed B03, resolve union, retained-target database constraints, current held-piece graph and existing exact-money/P03 paid owners. Implemented explicit-target A/B and retained confirmed cancellation through one private helper. All paths retain source/report history, scope to the current pointer/cycle and advance the shared root once; cancellation preserves frozen captures and paid, recomputes active exact total and sets CANCELLED only for zero active pieces. The former labelled resolution setup in T011 is now a real resolveIssue service call.

Focused approval/P03 service integration **37 tests / 2 files PASS**; existing exact-money/count unit tests **12/12 PASS**; API lint/check-types PASS. Actual A/B/C/replay/obsolete-state/foreign/stale, companion invariants, independent-connection A/C contention and after-dependent-write fault rollback passed. Strict branch text/target/confirmation contracts remain enforced by the previously accepted executable schema tests. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after current implementation, callers, retained data and test-guard/clean-code-guard review. Shared test lock-barrier consolidation is being reverified with the T013 suite; no production protocol changed.

### T013 — exact cancellation and real paid contention

Read the accepted 3300/2000 case, B03/B07 and current exact-money/count/P03 paid code. Real two-piece frozen terms and actual cumulative-paid service calls prove partial cancellation total1800/paid2000/due0/surplus200, replay without another deduction, then full retained cancellation with zero active/completion0 and paid2000 retained. Actual cancellation-versus-paid contention uses independently held PostgreSQL root locks, requires one winner/stale loser and explicitly retries the reviewed loser with the new version; both intended effects and immutable history survive. Downstream denial fixtures use current OUT_FOR_DELIVERY and DELIVERED enum values and are labelled isolated setup, not workflow execution.

Fresh focused approval/P03 service integration **41 tests / 2 files PASS**; exact-money/count unit **12/12 PASS**; API lint/check-types PASS. Initial denial setup incorrectly named a nonexistent DISPATCHED enum; corrected to the actual OUT_FOR_DELIVERY source enum. Review corrected nonapproved-header resolution to the existing ORDER_STATE_CONFLICT, preserving issue-specific conflicts for obsolete cycles. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after implementation/test guards and caller/rollback review. Shared real-lock test harness now removes three duplicated barriers without reducing outcome assertions. No production financial action occurred.

### T014 — owner contact submissions

Verified B04, strict four-field union, catalog SHARE-lock/resolution owners, actual capture selections and deferred proposal witness before implementation. Actual owner ADMIN and real staff-approved SALES owner submit immutable complete AMEND/CANCEL_REQUEST intent only. Sparse field omission retains exact labels/references; explicit sole clearing and notes-only confirmations work without active catalog. Supplied IDs require current-source exact-kind membership. Current captures, companions, frozen finance, target and physical hold do not change. Another-owner ADMIN cannot submit.

Fresh service integration **33/33 PASS**; contract body/projection selection **10/10 PASS**, focused rules **4/4 PASS**; API lint/check-types PASS. Cases prove pending four-field values, actual actor receipt recovery/replay, absent/unknown/wrong-kind selection denials, labelled migrated-style null references, preserved source labels and whole-graph rollback after proposal insertion before receipt. Review found the deferred command relation is temporarily absent during submission facts: its type now explicitly models that possibility, retained mapping fails safely without a witness, and only the newly submitted in-transaction proposal receives the already locked authority actor before executor insertion. Fixture role/staff calls were corrected to actual USER/StaffApprovalBody source interfaces. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after clean-code-guard/test-guard checks. No specifications/prices/customer/UI were changed by submission.

### T015 — piece reapproval and repeated contact

Verified B05, current proposal/held-pointer/retained-target constraints and focused selection-writing source; broad writeDraftCapture was inspected and preserved. Review checks the immutable latest proposal and its complete before values. ACCEPT applies only the stored four AMEND fields/references and explicitly releases to the retained target; it never consults active pricing/catalog or edits companions. RETURN_TO_SALES preserves hold/target/latest intent; CANCEL reuses retained cancellation without applying proposed values.

Fresh service integration **39/39 PASS**, API lint/check-types PASS. Real contact→return→fresh submission→accept proves old proposal rejection, immutable retained responses, exact four-field application, other fields/reference keys/companions/finance unchanged and acceptance after catalog deactivation. Notes-only positive release, both cancellation kinds, invalid acceptance of CANCEL_REQUEST, receipt replay, actual selection-insert fault rollback and independently controlled accept-versus-recontact race pass. The recontact winner remains fully held without restored/resumed data. Existing body/rule regressions remain part of T021's full gate. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after focused clean-code-guard/test-guard review of all three branches, helper/callers and complete retained graphs. No material design deviation or frontend integration.

### T016 — scoped workflow/contact reads

Read B06, executable workflow/queue schemas, current pagination/root selectors and prior command outputs. Added current approval issue queue and owner SALES/ADMIN contact queue, consistent scoped order wrappers, actual initial stamp, exact current return notes, retained proposals and batched latest referral/recontact instructions. Queue count/page/filter share a snapshot; page roots/instructions are batch-selected, not fetched per row. Action hints reuse the current-pointer/actual-owner rule, including ADMIN other-owner read-only contact context.

Fresh queries integration **8/8 PASS**, API lint/check-types PASS. Tests cover actual initial referral versus submitted/recontact print hold, unchanged current capture, state/search/empty/out-of-range paging, real SALES owner/other-owner denial, ADMIN broader reads without impersonation, actual staff reassignment denying sales actions, separate initial return notes with zero issues and missing order. Previous calendar/DST/current-lock tests remain green. SQL selects safe bounded instructions and return-note scalars; no account-private data or full event JSON is loaded for paging. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after clean-code-guard/test-guard review of queries, authority, mapping and current callers. Backend gate remains pending T021.

### T017 — merged history and P04 event detail

Read existing private summary SQL/full revision implementation and B06 fixed scope design before extraction. Added the shared OWNER/APPROVAL activity query owner: ledger identities are UNION ALL scoped independently, counted and paged in SQL by occurredAt DESC/eventId DESC/kind ASC before bounded scalar summaries are projected. Existing P03 summary JSON and strict full-revision parser are preserved through an extracted source-specific event selector. Own-decision history reuses the approval summary SQL; authorized order history includes report/contact actors. Dedicated P04 detail validates exact typed before/after facts and selected order/event binding after current resource authorization.

Fresh approval/P03 query integration **15 tests / 2 files PASS**, existing query unit **2/2 PASS**, API lint/check-types PASS. Actual shared UUID/time across both immutable ledgers proves deterministic page/tie/count behavior and correct P03 paid revision versus P04 initial facts; P03 IDs fail the P04 endpoint. Actual multi-actor report/contact history, factory and reassigned-source detail denial, own-decision exclusions and missing parent pass. A privacy assertion was narrowed to forbid full snapshot objects while allowing the pre-existing safe paidChange before/after scalar strings; strict schemas remain unchanged. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after query/SQL, extraction compatibility and clean-code-guard/test-guard review. No unbounded JSON merge, historical row rewrite or permission from receipt recovery.

### T018 — authoritative official/factory paper

Verified B06/D-004, exact paper schemas/permission/error semantics and existing factory allowlist before implementation. Official reads require actual matching initial witness, current authority and absence of every submitted/recontact hold; active changed-piece stamps come only from actual accepted AMEND decisions. Late paid actors cannot become signers. Factory reads prove current/source-held department relation, retain whole-order counts and batch one current-or-latest-resolved context per piece, with positive instructions only from that selected cycle.

Fresh query integration **14/14 PASS**, focused print/action rules **4/4 PASS**, API lint/check-types PASS. Actual multiple holds/recontact/partial resolution, fresh approval stamps/current version, owner versus unrelated SALES/factory denial, source relation after movement, metadata observation without resource permission, nested factory redaction, no old-cycle instruction borrowing, returned/legacy-witness absence and zero-active retained paper pass. Historical witness-absence setup suppresses only the named new-transition trigger inside an owned transaction and restores it before commit; it is labelled historical shape, not real approval acceptance. Real pre-P04 upgrade preservation remains database-suite evidence. Review found equal timestamp ordering could select an older instruction: latest instructions/stamps now use the shared monotonically increasing root revision, with an actual equal-time/inverted-UUID regression. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after projection/permission/SQL and clean-code-guard/test-guard review. Browser layout/print aliases remain outside this backend scope.

### T019 — thin HTTP adapters and OpenAPI

Verified the full 18-route ledger, installed Express/validation/auth/CSRF/response owners and current composition/OpenAPI sources before edits. Added exact shared-schema DTO aliases, a typed thin controller with required actor/validated-slot guards, five routers with business auth→department→unsafe CSRF→validation order, one executor/service composition and private,no-store responses. The public observe facade delegates to the already tested actor-only executor boundary. OpenAPI documents every exact method/path, strict input and HTTP200 result; the existing exact public-route inventory test was extended for these new routes under the brief's affected OpenAPI checks.

Fresh adapter/OpenAPI selection **30 tests / 2 files PASS**, API lint/check-types PASS. All18 adapter selections and documentation methods/security, authentication/department/CSRF-before-validation, privileged input rejection and actual parsed actor/initial-command argument/output mapping pass. Controlled adapter rejections are explicitly not persisted business acceptance; T020 remains required. Tests now parse the actual shared top-level error/success envelope rather than assuming a nested error object; no response protocol changed. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after clean-code-guard/test-guard/docs-guard review of DTOs, controller, route gates, composition and generated OpenAPI paths. Existing P03/auth/session/transport owners remain intact.

### T020 — real-app authorization and workflow acceptance

Verified actual createApp/auth/CSRF, owned database reset, signed fixture credential helper and all18 route/schema/error cases before writing. New real-app tests create current staff through the actual StaffService approval boundary and use the actual router, credentials, PostgreSQL and receipt/projection parsers. Coverage includes two approvers, two SALES actors, owner/nonowner ADMIN, all three manufacturing departments and pending/suspended accounts. No intercepted business success or mock persisted authority is used.

Fresh approval/P03 HTTP integration **13 tests / 2 files PASS** (repeated fresh after import cleanup), API type checks and scoped/full lint passes. Actual return→P03 resubmit→approval, A/B/C, repeated AMEND review/contact, cancellation-request return→fresh cancellation, ADMIN-own-only submission, exact partial/full 3300/2000 cancellation, factory nested privacy, current actor observation after movement/reassignment, missing/mismatched CSRF, privileged/unsupported fields, stale/changed intent/replay, discarded-response metadata reconciliation and independently root-locked competing HTTP decisions pass with complete retained-state assertions. Test fixtures were corrected to normalized emails, exact current source enums and the full existing correction shape; existing error semantics remain 403 for source reassignment. One earlier request unexpectedly returned HTTP426; its strict assertion was retained and subsequent fresh full focused runs passed. No retry was added.

Final review also corrected T016's handling of preserved pre-P04 P03 return proofs: the existing header proof remains readable with null optional notes when no historical P04 witness exists. New real database historical-shape regression passes (**15 query tests PASS**); actual P04 returns still retain separate notes and no historical command is fabricated. A queue boolean flag was replaced by its trusted APPROVAL/CONTACT scope, and imports were consolidated/reclassified using the existing type-aware lint rule. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after current source/HTTP/test guards. Full backend-wide regression/review gate remains T021; no frontend starts here.

### T021 — complete required backend acceptance

**Authorized scope**: roadmap P04 / accepted feature `004-approval-reapproval-printing`, selected **Group 2: Required Backend, Tests and Acceptance**, T002–T021. T001 remains accepted from Group 1. All twenty selected backend tasks are now implemented, reviewed and verified. This gate accepts the backend group only; T022–T038 frontend integration, T039–T047 cross-layer/phase exit and release remain unperformed and unchecked. No additional phase, commit, push, deployment or non-test database action is accepted by this record.

**Reviewed source**: local working tree on `main`, unchanged HEAD `b9d2b3d`. The pre-existing accepted P04 artifacts were untracked at intake and remain preserved. Reviewed the complete new approval module/DTOs, shared contracts/scalars, three Prisma models/authored SQL, merged activity owner, touched P03 mapper/query/fixture callers, HTTP composition/OpenAPI and discovered test/cleanup owners against spec, B01–B07, data model, contracts and each selected execution brief. D-003 four-field-only contact changes, D-004 whole-order submitted/recontact print hold and D-005 no automatic restore/resume are enforced by actual service/query/HTTP evidence.

**Fresh complete checks** (each exited zero; no zero-test or cached aggregate acceptance):

| Command                                                                      | Actual result                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm --filter @template/contracts build`                                    | PASS                                                       |
| `pnpm --filter @template/database build`                                     | PASS; actual Prisma client generation and TypeScript build |
| `pnpm --filter @template/api build`                                          | PASS                                                       |
| `pnpm --filter @template/contracts test`                                     | 188 tests / 12 files PASS                                  |
| `pnpm --filter @template/database test`                                      | 21 tests / 2 files PASS, rerun after final SQL correction  |
| `pnpm --filter @template/database test:integration`                          | 101 tests / 4 files PASS on final migration                |
| `pnpm --filter @template/api test`                                           | 333 tests / 44 files PASS                                  |
| `pnpm --filter @template/api test:integration`                               | 288 tests / 23 files PASS, rerun on final migration        |
| `pnpm --filter @template/contracts lint` and `check-types`                   | Both PASS                                                  |
| `pnpm --filter @template/database lint` and `check-types`                    | Both PASS; type check regenerated the installed client     |
| `pnpm --filter @template/api lint` and `check-types`                         | Both PASS                                                  |
| Scoped `pnpm exec prettier --check` over all 51 changed/new TypeScript files | PASS                                                       |
| `git diff --check`                                                           | PASS                                                       |

The five complete test suites total **931 passing tests across 85 discovered files**. Contracts/database dependency builds and generated-client type checking were serialized before their consumers. Independent package checks used separate processes; API/database integration harnesses used their own migrated PostgreSQL 18.4 containers. TypeScript/contracts source did not change after its successful checks; only the new authored SQL required the final database and API integration reruns.

**Full-suite correction**: the first full database run exposed one unchanged P03 constraint regression (100/101 passed): a new P04 return-witness trigger reported its failure before the existing P03 graph check. Corrected only the new, locally authored P04 migration: newly changed approval/return witnesses first call the existing `check_sales_order_graph` boundary, then enforce the new witness. Existing P03 assertions and all nine earlier migration files remain unchanged. Final complete database **101/101** and API integration **288/288** pass against that corrected migration, including actual COMMIT deferral/rollback, populated awaiting/approved/returned upgrades, old checksums and repeat deployment. The correction was applied exclusively by disposable test harnesses; it was not deployed to an existing database.

**Requirements review — PASS**: all required six commands, twelve reads/observation operations and eighteen HTTP routes are live within their fixed contracts. Actual current authority/owner/source checks, immutable generated-ID receipts, same-version winner/loser behavior, complete rollback, seven-type initial release, separate return notes/P03 resubmission, retained A/B/C cycles, exact paid/cancellation values, immutable four-field proposal/recontact/review, scoped queues/history, source-specific detail, actual official stamps/holds and nested factory omissions were traced to the tested boundaries. Historical P03 return proofs remain readable with null absent notes; no historical P04 command/stamp is fabricated. No unresolved material requirement or design decision remains in this backend scope.

**Engineering standards review — PASS**, assessed separately through `docs/engineering/code-review.md`, clean-code-guard, test-guard and docs-guard:

| Owning guide/boundary                | Verdict and observed evidence                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constitution/index/code style        | PASS — accepted interfaces/owners, explicit collaborators, strict types, consolidated imports, no new dependency/configuration/platform or suppression; bounded task scope                                                                |
| Backend recipe                       | PASS — thin DTO/controller/router adapters; one executor/service composition; transactions and dependent writes remain service-owned; no detached work                                                                                    |
| API contracts                        | PASS — one shared strict schema owner; exact HTTP200/envelopes/errors/pagination, all18 OpenAPI operations, P03 receipt/revision meaning preserved                                                                                        |
| Data patterns                        | PASS — account/advisory/root lock order, one root version, seven deferred RESTRICT relations, retained immutable graph, exact money, batched scoped reads and SQL-before-paging history; real race/rollback/upgrade checks                |
| Security                             | PASS — current business authority in the transaction, actual owner including ADMIN, actor-only observation, report source exception without detail authority, CSRF and explicit nested safe projections                                   |
| Testing                              | PASS — real PostgreSQL and actual createApp credentials/middleware at the claimed boundaries, independent controlled lock races, losing-state and full rollback assertions, discovered full P01–P03 regressions and fixed guarded cleanup |
| Technical documentation              | PASS — English task evidence and exact source/command/result/route claims verified; accepted planning/checklist artifacts preserved                                                                                                       |
| Frontend/Next/provider-specific work | N/A in Group 2 — no frontend, print renderer, browser, provider, upload or background-job implementation introduced; their later acceptance is not claimed                                                                                |

**Preservation and identity**: SHA-256 comparison against all **904 intake files** found exactly the nineteen authorized existing source/test files plus this execution ledger changed, with no missing files; the other **884** files remained byte-identical. Protected root roadmap, accepted spec/design/contracts/checklists, feature pointer, P01–P03 ledgers, original workbook and nine earlier SQL migrations are preserved. Requirements checklists remain **40/40** and **16/16** checked with no implementation-stage marker edits. Final checked-source manifest contains **936 files**, excluding this mutable execution ledger; aggregate SHA-256 is `fd467a18e33ae5efd4320ed1bd028f04066863c230d42dadc7f2a801d2426bef`. Only the final P04 SQL correction differed from the initial full-check manifest. No checked source changed during the corrected integration runs.

**Warnings and cleanup**: the existing pg concurrent-query deprecation warning remained visible; no suppression or dependency change was added. The earlier isolated HTTP426 observation did not recur in subsequent focused or complete API suites; strict assertions were retained and no retry was introduced. Both integration processes exited successfully and all their PostgreSQL/Ryuk containers were removed; the three pre-existing unrelated containers remained untouched. `.specify/extensions.yml` is absent, so no before/after implementation hooks are registered. No browser evidence, whole-P04 acceptance or release is claimed.

**Gate verdict: Group 2 / T002–T021 ACCEPTED. REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS.** Stop at this authorized group boundary.

## Group 3 Execution Evidence — 2026-11-07

### Intake and T022 — explicit P04 capability scope

Selected roadmap P04 / accepted feature `004-approval-reapproval-printing`, **Group 3 / T022–T038 only**. T039–T046 and release remain outside this request. Existing dirty backend work and accepted artifacts were preserved; effective selection matches, with no feature environment overrides. Compared all 936 source files in the T021 manifest to current bytes: no drift. The recorded backend 931-test acceptance is matching reused evidence, not a new execution. Captured a new 937-file Group 3 intake baseline. Both requirements-quality checklists remain reviewed/read-only (16/16 and 40/40). No extension hook file exists.

Read the selected briefs, F00–F08, actual scope/auth/transport/QueryClient/callers and applicable frontend/contracts/security/testing/review guides plus installed Next client/server guidance before editing. T022 extracts existing private business-session validation, preserves every public SALES scope restriction and adds the exact three P04 capabilities. Obsolete cleanup awaits cancellation, rechecks scope, resets command-session Query objects to notify disabled subscribers and exact-removes only unchanged empty captured objects; later broad cleanup excludes session keys and preserves replacements.

Fresh required scope/customer/order hook selection **30 tests / 3 files PASS**; scoped ESLint PASS after naming the test-local hook correctly. Tests include every department/ADMIN capability, malformed/restricted/current-scope checks, delayed scope restoration, dual disabled ADMIN observers and replacement-safe reset/removal with zero transport. Existing sales consumers remain unchanged. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after clean-code-guard/test-guard and current-source review. No new session/credential store or frontend business authority was added.

### T023 — approval transport and scoped reads

Verified the current producer routes/shared schemas and existing Axios/QueryClient/auth scope callers against F02 before edits. Added all seven approval reads/four decision adapters, metadata-only receipt transport and exact normalized P04 query keys/hooks. Inputs/unknown responses are parsed, path/order/command/version/child identities correlated, signals forwarded and stale scope completions cancelled. Wrapper sharing preserves higher same-order versions; owner history/event uses explicit SALES_CONTACT capability while default reads remain APPROVAL-only. Receipt observer/key/orchestration are deliberately absent here and remain T026.

Fresh approval adapter/read-hook tests **9 tests / 3 files PASS**; combined with current scope tests **23/23 PASS**. Scoped ESLint PASS. Covered exact action/queue/event routes, safe malformed/foreign/binding failures, filter/default/state keys, out-of-range destination invalidation without fetch, monotonic detail, retained-context refresh error, owner capability and old-account response suppression. Test fixtures were corrected to consistent out-of-range metadata and to subscribe to the actual React Query error property before refetch; assertions were retained. Initial full web type check reports the existing sales activity/detail consumers of the new P04 union, assigned to T033; no suppression or premature change to that owner. The T022 test adapter restoration was corrected for exact optional property typing. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T023; complete web types remain a T038 gate after its dependent compatibility tasks.

### T024–T025 — contact reads and official-paper boundary

Implemented strict central-transport contact queue/detail/submit and official-paper reads with current capability checks, signals, exact root/command/child correlations and no fallback. Contact wrappers retain higher versions, distinguish states/defaults and invalidate shrink destinations without fetching. Official paper has separate OFFICIAL_PAPER keys with staleTime/gcTime zero and strict genuine-stamp/version parsing. No print layout or view is activated yet.

Fresh focused checks **19 tests / 4 files PASS**. Scoped ESLint PASS. Full web types still identify only the two existing T033 sales history consumers. One ADMIN fixture was corrected to the account schema's null staff approval, with unchanged assertions. Tests exercise denial, malformed/foreign responses, retained refresh errors, pagination, current department/ADMIN reads and late identity replies. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for these bounded adapters/hooks after separate source and test reviews; full Group 3 acceptance remains pending.

### T026 — shared command occupancy and recovery

Implemented the five-phase command protocol in its accepted owners, with the sole manual receipt observer, explicit operation/capability mapping and two disabled QueryClient session subscriptions. Reservation/retry are synchronous before dispatch. The frozen origin survives navigation between eligible ADMIN views; receipt observation and synchronization retain the original contact/approval owner. Full command/actor/version/child binding is checked. Uncertainty remains sticky until reconciliation; confirmed results permit read synchronization only. Exact Query reset/removal notifies both observers and preserves replacements. Paper is invalidated before fetching the current wrapper; both received/published versions must satisfy the receipt before bounded eligible invalidations. No global cache clear or sales-protocol edit.

Fresh **27 tests / 3 files PASS**, scoped ESLint PASS. Full web types report only the two accepted T033 compatibility consumers. Tests use real QueryClient/subscribers with transport doubles for shared-slot races, wrong capability, lost contact response/unmount/navigation, missing receipt and identical retry, persistent uncertainty after rejection, confirmed refresh failure, higher current wrappers, stale projection, paper invalidation, unrelated-cache preservation, reset/replacement notification, dual-entry invariant, lost origin capability and late actor/accessVersion replies. UI tests keep observation/replay distinct from saved-result refresh. Query notifications are awaited through their public observer behavior.

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after separate review of accepted F03, current transport/session/query implementations and new production/tests. Recovery failures are presented as safe, command-bound messages; no storage, second session owner, duplicate receipt hook, optimistic business mutation or transport retry was introduced. T027–T038 remain pending.

### T027 — existing approval read surfaces

Converted the existing four dashboard cards/recent roots, pending orders/problem tabs and own-history table to scoped backend hooks. Preserved Arabic/RTL component families, card geometry, problem-card arrangement, detail navigation and filters. Counts use the server calendar/projections; search/type/page run on the full server dataset, with explicit corrected-page fetching. Held sales-contact rows remain read-only. Until T029, issue actions navigate to canonical review and never reach the legacy local modal. Loading, retained-data refresh failure and genuine empty success remain distinct.

Fresh **7 tests / 3 files PASS** with actual hooks/QueryClient and transport doubles. Scoped ESLint PASS after typing mock-call inspection as unknown. Covered accurate non-page counts, current roots, retained refresh failure, scope hiding, problems-tab selection, held work, search/type/page forwarding, own decisions and shrinking-page destination refetch. Fixture summaries were narrowed to the strict shared projection; no production fallback was added. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for this read-view task. T029 owns new modal invocation and interacted-order recovery notices.

### T028 — canonical initial review, tracking and return

Initial review uses the current wrapper/action hints, original frozen paper/number/money and wrapper-derived validated tracking. History keeps P03 summaries and P04 detail expansion on their authorized owners; no sales-only revision endpoint or local factory event is invented. All types use cutting entry. Return is a RHF/Zod free-text reason plus separate optional notes; base version remains outside input and dirty text survives conflicts/refetch. A definitive conflict requires an explicit fresh review before a replacement intent. Parent recovery remains mounted after dialog closure. Success callbacks/navigation occur only after synchronization and current-scope/mount checks.

Fresh **13 tests / 4 files PASS**, scoped ESLint PASS. Cases cover shared 4000/blank validation, reason/notes separation, canonical cancelled tracking, repeated approval/return triggers, no navigation before synchronization, saved-but-refresh-failed recovery, current returned context without false approval/printing, retained dirty text, explicit conflict review and recovery after modal removal. Strict test fixtures were corrected to real decisionId and returnRevision rules; no production schema weakened. Separate **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** reviews confirmed no local store/fixed actor/repair bypass, optimistic business mutation or sales protocol rewrite. Issue decisions remain unavailable until T029.

### T029 — per-piece A/B/C and proposal review

Replaced the reached local decision modal with exact order/piece/issue/mode selection and a fresh canonical wrapper before authoring. A/B require explicit target and nonblank instructions. C retains cancellation history and requires a separate nested confirmation; switching away/cancelling confirmation writes nothing. Reapproval presents the four before/proposed values, actual contact context, separate current instructions and read-only target. AMEND supports explicit positive approval; cancellation requests offer return or confirmed C only. Shared form shaping omits inactive fields and binds the exact proposal/version. Captured context/dirty text survive newer wrapper data, which disables the authored decision. Conflicts require current-data review/reopening; reopening performs a fresh canonical read.

All dashboard/pending/detail callers now use server hints, current same-order occupancy, exact identifiers and parent-owned recovery. Scoped interacted-order notices remain after dialog closure; held owner-contact rows receive no approval action. No local actor, resume/delete mutation, old-value restoration, target change during review, unapproved capture application or pricing path remains reachable.

Fresh required selection **24 tests / 5 files PASS**; scoped ESLint PASS; full web types still report only T033's existing two sales-history consumers. Tests exercise active-branch validation/omission, explicit B target, nested C back/change/confirm, notes-only AMEND/proposal binding, cancellation-request return without ACCEPT, stale/foreign context, retained dirty values and all three real caller→modal→command boundaries with parent recovery after uncertain-dialog closure. Parser text matches were corrected to include visible Arabic context; strict assertions remained. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after separate accepted-design/current-source/test review. These component/transport-double checks do not claim real-stack browser or physical print evidence.

### T030 — owner-contact proposal/request form

Implemented the strict four-nullable-UUID/contact-notes form model and dirty-only final shared-body shaping. Required clears fail locally; notes-only emits an empty changes map; explicit floor clearing emits null even when the retained source label has no reference. The form shows actual approved labels, separate original report/current instructions/prior proposal and frozen decoration/customer/price. Existing scoped catalog reads supply exact labels/IDs; absent/error catalog never selects a first/demo value. New selections pause on unavailable/currently fetching catalog; notes-only, floor clear and cancellation request need no new source selection. Cancellation is a separately confirmed request with no changes, work release, deletion or financial mutation. Actual owner equality and current SALES/ADMIN capability plus server hint gate authoring. Dirty values/captured version survive read errors and newer context.

Fresh **16 tests / 2 files PASS**, scoped ESLint PASS; approval/contact regression **36 tests / 7 files PASS**. Covered size40→40.5 UUID proposal with current piece still40/BLOCKED and frozen1800.00, eligible SALES and ADMIN owners, other-owner ADMIN denial even with a hint, notes-only/unreferenced floor clear during catalog failure, request-only cancellation, source retry/dirty preservation, version review, typed nested errors/request ID and recovery after close. An unavailable active catalog can allow a valid persisted notes-only response while preventing full refresh acceptance: confirmed metadata remains, synchronization-only recovery is shown and the modal does not claim fully refreshed success. Tests assert that actual boundary instead of weakening the required invalidation error.

Earlier-owner repairs within T028/T029 preserve open captured form context when a successful refresh removes its issue/action hint, so authoritative state changes cannot accidentally suppress the completion callback; deliberate user unmount still suppresses it. Parent recovery alone owns confirmed-refresh failure messaging, avoiding a misleading generic network-failure message for a saved write. Current approval surface regression remains passing. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after separate source/design/test review. No catalog/quote/paid hook, backend or accepted design was changed.

### T031 — distinct contact work on the returned-order page

Preserved the existing P03 initial-return query/table/correction route and linked its business reference to current sales detail. Added a separately counted/paged contact subsection showing SALES_CONTACT and REAPPROVAL, latest actual instructions and exact-piece owner/hint-gated response. Reapproval rows remain visibly held with no new-response action. Existing styles/components and route families remain; no wrapper is fetched per list row. Scoped parent notices retain the occupied order after modal closure.

Fresh required selection **13 tests / 2 files PASS**, scoped ESLint PASS. Actual central-transport/component/QueryClient checks cover old correction reason/time/destination, separate queues/counts/pages, both issue states, no per-row detail request, exact selected wrapper/proposal route, parent uncertainty after close, contact failure beside successful initial-return data and scope hiding. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after separate source/test review. No whole-order RETURNED state, new endpoint or local workflow authority was introduced.

### T032 — matching-version sales detail context

Every submitted detail now reads its SALES_CONTACT wrapper, including initially returned roots without issues. Actual return reason/optional notes are rendered separately. Contact and print actions require matching root ID/version, current successful reads and an unoccupied P04 command slot. A lagging wrapper refetches through its owner; an ahead wrapper refreshes sales detail through its owner. Existing paid draft/version/command/recovery behavior and correction route remain unchanged. Exact-piece contact and parent recovery coexist with held reapproval status; genuine official eligibility remains an endpoint-owned final check.

Fresh **25 tests / 2 files PASS**, including all prior P03 detail cases. New checks cover actual/absent return notes without an issue, lower/higher version reconciliation with no stale print link, dirty paid input across wrapper failure, exact owner contact route/parent uncertainty, held submitted proposal and late-account response suppression. Existing P03 transport fixtures now provide a contact projection from their same synthetic submitted server record, without inventing an initial-approval witness; those legacy fixture papers stay ineligible. Test-file ESLint PASS after awaiting observer notifications and removing unsafe matcher assignments. Full source lint/types still identify the pre-existing additive history consumers, whose accepted owner is T033; no suppression/contract rollback was used. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for the bounded context integration, with complete Group 3 checks still gated by T033/T038.

### T033 — additive activity and retained event facts

Added one exhaustive typed presentation owner for draft/P03-order/P04-approval rows, all six P04 operation labels, actual decisions/actors/time and changed fields. Namespace-qualified row keys retain colliding command IDs. Sales detail captures selected kind/ID/version, sends only P04 expansion to useApprovalEvent with explicit SALES_CONTACT capability and checks returned order/event/version before rendering retained facts. P03 full revisions keep their exact endpoint/parser/paper renderer. P04 before/proposal/after/reasons/money remain historical facts and never replace current workflow or paid state. Page/tab/resource changes close expansion.

Fresh required selection **43 tests / 3 files PASS**, scoped ESLint PASS and full web TypeScript progress check **PASS**; the previously identified additive-union errors are resolved without suppression. Cases include every new operation/decision, mixed/colliding histories and retained refresh error, real owner-capability event reads, before/proposed values and return reason, unchanged P03 revision route, wrong root/version/denied facts with retry, current paid300.00 remaining separate and a delayed old event after paging. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after separate guide/design/source/test review. No contract, sales receipt, backend, paid protocol or factory authority was changed.

### T034 — retained cancellation and monetary paper parity

Added only cancelledAt→isDeleted to the canonical presentation mapper. All retained pieces/IDs/source strings/frozen prices remain in the projection/history; the existing printable-line filter and eight-row chunk owner decide active output. Authoritative monetary state remains unchanged and is never recomputed from filtered rows or local defaults.

Fresh required selection **37 tests / 3 files PASS**, scoped ESLint PASS. Added canonical retained/replay-stable projection, full-cancellation zero-active/not-ready checks, exact1800.00/2000.00/0.00/200.00 display after the retained1500.00 cancellation, 1/8/9/17 active-row boundaries with cancelled/empty presentation rows, separate floor/middle-addition source text, and a truthful empty all-cancelled frame with unchanged paid/surplus. Existing assertions remain. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after separate accepted-money/print-source/test review. No printable algorithm, finance authority, backend or physical-fit claim changed.

### T035 — prepared print boundary and explicit aliases

Prepared the focused print-family boundary without composing it into the runtime layout. Exact order aliases use current business protection followed by the page's official capability gate; report/unknown families retain ADMIN protection and their actual MVP provider. Both thin server pages await Promise params and pass the identical explicit orderId; the interim legacy screen accepts that required prop and has no pathname/ID guessing. Installed Next page/client/pathname guidance and actual auth/session/provider owners were inspected.

Fresh required boundary/auth selection **51 tests / 3 files PASS**, scoped ESLint PASS and `pnpm --filter @template/web check-types` **PASS** (route type generation plus TypeScript). Tests use the actual fresh-session ProtectedRoute and parsed session transport, both aliases/current eligible roles, factory capability denial, restricted accounts, ADMIN report provider, unknown families and server-prop parity. The pending-account fixture was corrected to null approval/department per the shared schema. Git confirms the existing print layout remains byte-for-byte unchanged; no broader runtime permission reaches the legacy local paper. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for preparation only; activation remains T037.

### T036 — compact factual paper annotation

Added/re-exported the typed readonly PaperApprovalAnnotation and optional prop. One escaped small block follows the original captured-signature i on each existing paper page, showing only supplied actual initial actor/time/version/accepted-piece count. The captured signature remains distinct. Scoped CSS contains only9px font size,1.2 line height and anywhere wrapping; grids/tables/footer/page chunks remain unchanged, with no fixed height/clipping/ellipsis. Full piece stamps are not rendered on paper.

Fresh required row/price selection **24 tests / 2 files PASS**, scoped ESLint PASS. Extended existing active1/8/9/17/cancelled/empty cases to verify one annotation per page, exact placement, original signature, complete150-character actor text, escaped script-like source text and unchanged frozen money. Prop absence preserves old callers, and the all-cancelled frame carries one bounded annotation with zero priced rows. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** after separate props/render/CSS/test review. Physical A4 fit is unperformed and remains a later acceptance gate; component chunk counts do not preapprove it.

### T026 review correction — overlapping recovery and obsolete controls

Final source review returned two implementation findings to this authorized owner: an overlapping receipt/retry or synchronization failure could downgrade an already confirmed/synchronized result, and recovery callbacks could select a replacement command. The command hook now rereads the immutable binding after each await, preserves known results, and binds recovery/acknowledgement controls to their original command. A submitting control retains only its own immutable binding for its post-await acknowledgement; QueryClient remains the sole session-state authority. Reusing an issued or non-idle control cannot create a replacement intent. Matching form owners suppress obsolete/busy local callback errors and leave saved-refresh notices to shared recovery.

Real QueryClient regressions cover receipt success before a late retry failure, obsolete acknowledgement/retry/synchronization against a replacement, original submit/acknowledge closure behavior, and successful synchronization before another synchronization fails. No second POST or replacement clearing occurs. The compiler immutability check rejected reassignment of a render-local variable; the binding holder was corrected without disabling the rule. The final full suite/lint/types below include this correction. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for the corrected T026 and its existing form callers.

### T037 — official aliases, fresh preflight and native-print boundary

Activated the prepared PrintAccessBoundary and authoritative PrintOrderView together. Both explicit-ID server aliases now reach only the current OFFICIAL_PAPER query, parsed shared DTO and canonical paper mapper. The report/unknown families retain ADMIN and their existing MVP provider. Factory accounts perform no official query; owner isolation and approval/reapproval denials remain server decisions. No local order, local role or sales DTO can supply an official document.

The preserved print button forces a current read, validates scope/order/version, waits for the matching paper DOM and consumes its request before one native window.print call. Loading, error, invalidation, old-account state and failed preflight remove printable content. A synchronous beforeprint guard hides known-invalid content in a plain wrapper; listeners and scheduled animation frames are cleaned up. Full real approval stamps render in print:hidden preview context; only the T036 compact annotation reaches the paper. Frozen amounts, captured signature and existing eight-row chunks remain intact.

Fresh focused verification selected the actual T037 four test owners together with the corrected command hook and four affected forms: **102 tests / 9 files PASS**. These include both real server aliases/layout with ProtectedRoute, eligible roles, factory/foreign/malformed/three print-denial cases, cached-preview fresh read, failed-refresh/retry, matching-new-version single printing under StrictMode, obsolete-account suppression, native valid-preview/no-extra-read, synchronous known-invalid hiding, listener cleanup and row/annotation regressions. The final full suite includes the later overlapping-synchronization regression. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** at the component boundary. Native printing cannot await fresh authorization, eliminate a post-read server race or revoke an exported PDF; real browser and physical A4 proof remain unperformed Group 4 work.

### T038 — complete frontend group review and verification

**Scope/state:** P04 feature 004-approval-reapproval-printing, Group 3 T022–T038, main HEAD b9d2b3d plus preserved working-tree changes. Reviewed the current selected briefs, F00–F08/F-V01–11, accepted checklist decisions, T021 evidence, complete changed frontend owners and their actual callers/contracts. Source findings were corrected under T026/T037 before this evidence-only closure. No material design gap remains for the selected component scope.

| Review owner                                        | Current boundary / finding resolution                                                                                                                                                                                                                                                               | Verdict                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Requirements / accepted spec and F-V01–05           | Current identity and exact reads; initial approve/return; explicit per-piece A/B/C and confirmation; actual-owner four-field contact with null/omitted/notes-only semantics; dirty-version conflicts and immutable price/customer/decoration                                                        | PASS at component boundary                                                        |
| Requirements / F-V06–08 and H1                      | Held proposal/reapproval context, separate history facts, retained original target; one synchronous cross-capability order slot, immutable origin/body, T026-only receipt observer, dual ADMIN subscribers, guarded reset/removal, original-wrapper synchronization and late replacement protection | PASS at component boundary; real cycle/navigation proof remains Group 4           |
| Requirements / F-V09–11                             | Official aliases, report restriction, known-stale hiding, fresh button preflight/native guard, factual stamps, cancelled rows and canonical money                                                                                                                                                   | PASS at component boundary; browser/native output and physical fit remain Group 4 |
| Code style / frontend sections 1–9 / React guidance | Existing feature/API/hooks/model owners, central transport and one QueryClient; RHF drafts, safe local recovery, deliberate Next server/client boundary, preserved reached RTL/Cairo controls and paper; no new provider/framework/engine                                                           | PASS                                                                              |
| API contracts sections 2–7 / security               | Shared runtime schemas, exact IDs/operations/capabilities/version correlation, allowlisted edits, safe errors/request IDs, current-scope checks before/after awaits, no fixture fallback or browser-persisted authority; real HTTP enforcement is matching T021 evidence                            | PASS for changed consumers                                                        |
| Testing / test-guard                                | Actual discovered Vitest/jsdom files, real QueryClient/RHF/session/cache behavior and transport-boundary doubles; controlled races assert retained results/replacement state and absence of extra writes. No skipped tests, weakened assertions or rule suppression                                 | PASS                                                                              |
| Documentation / docs-guard                          | Verified selected paths, scripts, symbols and result counts against current source/manifests/logs; historical evidence remains labelled; task markers describe only verified Group 3 work                                                                                                           | PASS                                                                              |
| Backend/data/migrations                             | Required T021 acceptance reused after preservation checks; no backend, contract, database, SQL, fixture, workbook or policy edit in this group                                                                                                                                                      | PASS for dependency preservation; no new backend execution claimed                |

**Fresh verification on final source:**

- `pnpm --filter @template/web test`: **1,061 tests / 104 files PASS**, 35.12 seconds; direct package execution, not Turbo cache. Includes all P01–P03 regressions and changed P04 component owners.
- `pnpm --filter @template/web lint`: **PASS**, zero reported errors/warnings after the binding correction.
- `pnpm --filter @template/web check-types`: **PASS**, Next route generation and TypeScript; generated types are expected tool output.
- Focused nine-file command described under T037: **102/102 PASS** before the additional synchronization race; that race then passed in the final full suite. The earlier six-file recovery/printing run passed **75/75**; an initially mistyped row selector matched no file, so row coverage is claimed from the corrected nine-file and full runs only.
- Owned-file Prettier and `git diff --check`: PASS at exit after formatting six owned frontend files and this ledger; formatting made no semantic change to the tested source. No root mutating verify, Docker, browser, migration or deployment command was run.

**Preservation/evidence:** Compared the 937-file intake manifest: no missing file, and every change/new file belongs to an exact T022–T038 allowed owner (64 files: 28 changed existing, 36 new). All 513 baseline files outside web source and the selected tasks ledger remain byte-identical, including accepted design/spec/checklists, protected root roadmap, prior task ledgers, backend/contracts/database/SQL and workbook. T021's non-web manifest still has no drift; its accepted 931-test result remains reused evidence, not a fresh run. Captured 972 source files excluding this mutable ledger at `/tmp/p04-group3-final-source-hashes.json`; aggregate SHA-256 `a889a271ea41a29b2a7a4ad9f55f85eaa01edd9bc68778a69b8a6df3d36d1bc0`. Both checklists remain 16/16 and 40/40 with zero unchecked requirements-quality items; markers were not edited. `.specify/extensions.yml` is absent at exit, so no post-implementation hooks apply.

**REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for Group 3 T022–T038. Both assessments cover current source and fresh component/static evidence; neither preapproves whole-phase/release acceptance. T039–T046 remain unchecked/unperformed: real-stack browser journeys, wide/narrow interaction, native browser/physical landscape PDF fit, broader exit/build/release gates and their review evidence are still required in their selected scope. No commit, push or deployment was performed.

## Group 4 Execution Evidence — 2026-11-07

### Intake and accepted dependencies

Authorized only P04 / `004-approval-reapproval-printing`, Group 4 T039–T046. Verified main HEAD b9d2b3d and preserved the dirty working tree. Effective feature selection and prerequisite script agree; no extension hook file exists. Captured 973 intake file hashes at `/tmp/p04-group4-intake-hashes.json`; all 972 Group 3 source hashes still match. T021 backend and T038 frontend evidence therefore remain applicable, labelled reused rather than rerun. Both requirements-quality checklists remain reviewed/read-only (16/16 and 40/40); written decisions and selected briefs were checked against current service, routes, schemas, UI and harness owners before edits. Docker server29.8.2, Node24.18.1 and pnpm11.17.0 are observed; no developer database or running application is reused.

### T039 — harness implementation and initial execution

Replaced direct P03 status mutations with actual ApprovalService initial return/approval calls and asserted CUTTING/INCOMING release while retaining original SalesCommand receipt bytes. Added per-project current SALES/other-owner/APPROVAL/CUTTING identities and distinct real-service scenario orders, including the actual ADMIN-owned referred order with retained PRODUCTION target. No P05/P06 history, production endpoint or fixture RPC was added. Added private UUID-validated P04 metadata and source evidence to the existing ready/manifest path. Explicit catalog mode rejects unsupported values before bootstrap; reviewed-workbook mode invokes the bounded/hash-checked byte reader, Excel decoder and reviewed-preview validator before the first catalog admission. Default synthetic admission remains explicitly labelled synthetic. Existing private runtime permissions/teardown/project/retry/artifact policy are unchanged.

Fresh API and web harness type checks pass after correcting the fixture decision literal to the existing SEND_TO_SALES contract. Default and reviewed-workbook runs of `pnpm --filter @template/web test:e2e --grep 'P03.*paid'` each pass both desktop/narrow projects (2/2 each;44.2s and47.6s). Invalid-mode startup fails as expected with P04_E2E_CATALOG_MODE_INVALID before a child/container can start. These are real isolated harness/P03-consumer checks, not P04 journey or physical output acceptance. Observed existing pg client.query deprecation, FORCE_COLOR/NO_COLOR warning and Next dev Fast Refresh full-reload notice; no warning was suppressed. Focused lint/review and remaining T039 failure/cleanup checks are still pending; task marker remains open until verified.

T039 closure: scoped API/web harness ESLint PASS; both harness type checks PASS. Direct execution of the reused reviewed-byte reader against an owned missing path and owned changed-hash file rejected before decode/admission, with temporary files removed in finally. Reviewed startup has no synthetic fallback branch. Reviewed/default successful teardown and invalid-mode partial teardown leave no owned API/Next process or runtime manifest; unrelated resources are preserved. Requirements review confirms truthful witnesses, exact owner/target metadata, two isolated modes and unchanged IPC/privacy policy. Engineering review confirms existing service/schema/loader owners, no production behavior change, strict types and preserved receipts. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T039 infrastructure; T040–T046 remain pending.

### T040 — real initial decision journey

Created the discovered P04 browser owner with private real-session/HTTP/shared-schema helpers. Synthetic-mode declarations exercise a UI P03 submission, free-text return with separate notes, owner correction/resubmission, actual approver UI release and fresh sessions/reload. Assertions preserve business number, frozen customer/decoration/prices/piece IDs/money, inspect actual initial witness and all-piece CUTTING/INCOMING, reject foreign owner reads and stale competing decisions without version change, and inspect own history. Separate REPAIR/ADJUSTMENT cases use real P03 HTTP submission and the existing approval UI; neither bypasses approval.

Fresh `pnpm --filter @template/web test:e2e --grep 'P04 US1'`: **6/6 PASS**, both projects,1.4m. Web harness types and scoped spec ESLint PASS. Initial test-authoring errors (correction query parameter, quote allowlist, and a stale CSRF cookie in the direct competing request) were corrected to the actual owners; conflict assertion remains409 after satisfying the real current CSRF guard. No product source or assertion was weakened. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** at the actual browser/HTTP/persistence boundary; seven-type service/race coverage remains matching T021 evidence, not a browser concurrency claim. T041–T046 remain pending.

### T041 — actual factory report and A/B/C isolation

Added data-driven real browser/HTTP cases for RETURN_TO_DEPARTMENT, SEND_TO_SALES and confirmed CANCEL, starting from genuine initial approval/CUTTING state. Actual factory commands create the issue; approval uses the existing modal. Assertions bind issue/source/reporter/time, explicit PRODUCTION instructions/retained target, unchanged companion/terms, cancellation retention, foreign issue404, obsolete decision409 and wrong-source department403. A second factory session reads the same resulting whole-order context; recursive checks reject finance/private/proposal correspondence, and approval reload observes the committed version. No downstream manufacturing receipt/start/completion is fabricated.

Fresh `pnpm --filter @template/web test:e2e --grep 'P04 US2'`: **6/6 PASS**, both projects,57.1s. Harness types, scoped ESLint and owned-source formatting PASS. Test-authoring route prefix and modal-container assumptions were corrected against the actual router/reached markup; accepted state/privacy assertions remain unchanged. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T041. T042–T046 remain pending.

### Returned correction to T032 — concurrent reconciliation reads

T042 browser execution exposed a real frontend race: a normal saved contact command could retain confirmed-needs-sync while automatic detail/version reconciliation cancelled the command coordinator's active sales-detail refresh. The minimal real-QueryClient/component regression in sales-order-detail-view.test.tsx failed before the fix (one aborted coordinator request;2.19s). Automatic version-alignment reads now use the installed Query refetch option cancelRefetch:false, joining active work instead of cancelling another owner. Scope/version checks and truthful mismatch/explicit refresh states remain; no error is swallowed, no write retry or new authority store is added.

The complete detail file passes28/28 after the fix (4.64s), including prior paid/history/contact regressions. The original real desktop cancellation-request reproduction passes1/1 (40.3s including fresh harness). Web source types PASS; scoped lint found only new-test callback/unknown-return hygiene, corrected without suppression. Temporary stage/network/public-state diagnostics are removed; the T026 source again exactly matches Group4 intake. Separate requirements and engineering reviews PASS for the bounded T032 correction; current whole-frontend and phase-exit evidence still require the later selected full checks. T042 remains open while its complete desktop/narrow cases execute.

### T042 — contact cycles, retained proposals and origin recovery

Fresh `pnpm --filter @template/web test:e2e --grep 'P04 US3'` passes **10/10**, both projects,2.0m after the T032 correction and native combobox selector correction. The cases exercise all four allowed fields (model, half-size, base and explicit floor null), immutable customer/decoration/price/companions, held old specifications, reasoned return to the same issue/owner, distinct renewed proposal and positive approval at retained PRODUCTION. History retains both review decisions. Foreign SALES and ADMIN-on-behalf submissions both404 under the actual privacy contract. Notes-only changes are exactly{}, while a cancellation request has no changes and no money/cancellation effect before approval. A separate unaccepted size proposal is cancelled without applying40.5.

Lost-response cases use route.fetch against the actual committed command and abort only its response. Closed-modal recovery observes the original receipt, preserves confirmed metadata on an induced real-read response loss, offers synchronization only and performs one write. The ADMIN actual-owner case navigates through the existing section selector/Next links in the same document/QueryClient; the shared occupied slot disables an otherwise server-eligible review. It observes the original receipt and original SALES_CONTACT wrapper, acknowledges, then permits exactly one new approval intent. Reload separately establishes persisted truth. No mock success or exported QueryClient interface is used.

Both harness type checks/scoped source/spec lint pass; all temporary diagnostics are removed. Review subsequently separated the unaccepted-amendment cancellation fixture from the US2 B fixture and reserved a dedicated cancelled-paper order, preventing cross-case state reuse in the eventual full suite. These are T039-owned scenario arrangement corrections only; the changed fixture binding gets targeted verification before the full default run. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T042 behavior and the reviewed isolation correction; final current full-suite acceptance remains T046.

T042 isolation closure: the newly dedicated cancelAmendment binding passes the targeted actual browser cancellation journey on both projects (2/2,49.1s); API harness types PASS after the additional scenario arrangement. All T042 behavior is verified without sharing mutable scenario orders with US2. The earlier failed runs, selector/contract corrections, one observed Next development JSON parse error and T032 race diagnosis are not counted as acceptance. The next clean ten-case run passed without that development error; no retries, timeout changes or warning suppression were introduced.

### T043 — retained cancellation and exact money

Fresh `pnpm --filter @template/web test:e2e --grep 'P04 US4'`: **2/2 PASS**, desktop/narrow,48.7s. Real factory reports and approval confirmations cancel the1500.00 piece from3300.00 with2000.00 paid, preserving its identity/reason, the1800.00 companion and exact total1800.00/due0.00/surplus200.00. Replaying the original HTTP intent returns replayed:true without a second deduction. Factory output remains private-safe. Authorized sales paper shows the canonical amounts after reload. Cancelling the last active piece yields retained2/cancelled2/active0/received0/completion0, CANCELLED, paid2000.00 and surplus2000.00, with no warehouse-ready claim or lost identity.

The read-only paper intentionally retains both cancelled-history rows; the initial test mistakenly expected print filtering there and was corrected against its actual mode. Official print row exclusion/empty frames remain T044 rather than being inferred from this read-only view. Harness types and scoped spec lint PASS. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T043; no physical receipt, refund or money movement is claimed.

### T044 — physical paper evidence (remaining browser acceptance pending)

Installed local Poppler26.11.0 tooling after discovering it absent; no project PDF dependency or service was added. Chromium exported twelve actual authorized PDFs across desktop/narrow: active1/8/9/17 rows and separately retained cancellation at active1/0. Actual pdfinfo reports page counts1/1/2/3/1/1 and A4 landscape841.92×594.96 points in each project. The owned random directories are0700 and PDFs/manifests0600; all twelve exported hashes match their private manifests. Their manifest SHA-256 values are cc00d1030b4caa72fc8576dcbc79fde7aae8037dba2768e3c6374efc8d60eec1 (desktop) and7736ece9bb45dbbedfe9210404a4171daa579d2308ba93e8914c04105308e61f (narrow).

Manually inspected all eighteen Poppler-rendered physical pages using image viewing, including every continuation and the empty frame. Eight-row pages, full150-character real actor name wrapping, separate captured signature, exact monetary columns, footer and branding fit without clipping or extra blank pages. This is visual inspection of exported browser PDFs, not a physical-printer or production claim. Current paper-source hashes are retained at /tmp/p04-g4-inspected-paper-source.json; final source preservation must match before reusing this physical evidence.

The initial browser run found test-authoring mistakes: navigating before P03 success routing completed, and expecting a second asynchronous native beforeprint in one Chromium document. Minimal blank-document capability probes reproduce the latter (first async print emits once; native then async repeat remains once), while the real native function was called twice. Test helpers now await the actual destination, and each native/button print path uses a fresh document with an actual beforeprint event; no print function replacement remains. Subsequent native/preflight/hold checks reach the final metadata assertion. That assertion incorrectly arranged notes-only proposals while expecting changed-piece stamps; the accepted B06 projection intentionally emits stamps for active changed pieces. Correcting the test arrangement must retain both holds and require actual changed-piece metadata. T044 remains open pending its complete fresh default/reviewed runs.

T044 closure: final current-source default `pnpm --filter @template/web test:e2e --grep "P04 US5"` passes **6/6**, desktop/narrow,3.3m. Separate fresh `P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e --grep "P04 reviewed workbook"` passes **2/2**, both projects,1.3m. Its source metadata verifies actual reviewed bytes/SHA before first catalog admission; the complete UI submission/return/resubmission/approval/report/referral/contact/positive-review/official-alias journey preserves frozen terms and captured signature. The earlier reviewed desktop403 was the test customer's stale captured CSRF header after browser restoration, confirmed at submitOrder's customer POST. All three direct submission-helper writes now read the current cookie through the existing mutationHeaders helper; the server guard and negative assertions remain unchanged.

Final synthetic cases prove both aliases for owner sales/approval/ADMIN, foreign-owner404 and factory403, actual denial UI rather than a transient empty loading state, ADMIN-only reports, real initial identity/full150-character annotation and distinct captured signature. Each permission alias uses its own fresh browser page and closes it in finally. This also removes dependence on rapid navigation away from a just-compiled alias; no navigation error is swallowed or retried. Actual size proposals on two pieces prove whole-order holds, partial acceptance with companion held, reasoned return still held, renewed acceptance and exactly two changed-piece stamps in preview only. Genuine native beforeprint/no-extra-read and fresh-button success/409 denial pass in both projects; a known denial leaves no printable document.

The quiet final synthetic runs pass after test arrangement/readiness corrections. Prior failed attempts and one observed Next development empty-manifest failure are not acceptance; retries remain0, timeouts and artifact policy unchanged, no warning suppression or production print-source change. All twelve PDFs from each successful export set additionally pass hash/mode/actual-page/A4 metadata inspection. The manually inspected eighteen-page physical set remains source-matching at closure. Web harness types and scoped spec ESLint PASS. Requirements review covers FR-023–029/SC-006–008 and explicit native/export limits; engineering/test-guard review covers real-session/service witnesses, strict shared parsing, actor privacy, current CSRF, private artifacts and finally cleanup. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T044; broad exit and remaining artifact cleanup remain T046.

### T045 — current references and documentation review

Updated only affected behavior/route/permission/test/setup sections of README.md and PROJECT_REFERENCE.md. They now describe real P03/P04 authority, initial/per-piece decisions, actual-owner four-field contact/reapproval, retained cancellation/exact money, both official aliases versus ADMIN-only reports, factory privacy and the deliberately later factory workspace integration. Native print/export and production/OPS-01 limits stay explicit; historical P01–P03 evidence and the protected roadmap are unchanged. Browser setup distinguishes default synthetic regression from the exact reviewed-workbook environment/grep command, actual root workbook requirement and manual PDF inspection/cleanup.

Docs-guard checked the actual router/approval route definitions, shared paper/body schemas, service/query authority, reached Next aliases/boundary, command-hook/detail reconciliation and print source, current package scripts and test mode/loader/byte-reader owners. Corrected a draft's inaccurate "path documented above" reference to the actual existing root workbook filename and qualified memory-only lost-result retention to the current browser session. Both documents' relative links/anchors resolve; owned Markdown Prettier check and git diff --check PASS. No source/config/permission change or blanket production claim was introduced. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for T045 documentation; full T046 verification remains open.

### Returned correction to T017 — date-independent history collision arrangement

The first T046 full integration run failed one API history collision case (287 API cases passed; the concurrent database task was interrupted, so that attempt is not complete acceptance). The case froze later commands at2026-11-07T12:00Z after creating its submission fixture at the real clock; once real time passed noon, the correctly newest-first query placed that newer submission ahead of the collision pair. The named T017 query-test owner now derives the one controlled collision instant exactly1000ms after the persisted fixture submittedAt, retains the original kind/pagination/source-detail/privacy assertions and explicitly verifies both commands have the same UUID and exact instant. No production query, sort, contract, database or migration changed.

The first strengthened assertion incorrectly required a Z-form timestamp, while the shared instant schema also accepts PostgreSQL's equivalent +00:00 form; it now compares parsed epoch values without weakening the exact-time assertion. Fresh whole-file `pnpm --filter @template/api test:integration src/modules/approval/approval.queries.integration.test.ts`: **15/15 PASS**,13.74s, owned disposable PostgreSQL. Test-guard review confirms actual service commands, a controlled chronology relative to persisted data, true collision assertions and unchanged page/detail/privacy requirements. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for this T017 correction; complete current backend/phase acceptance still requires the restarted full exit sequence.

### T042 full-suite arrangement correction — bounded dashboard preview

The full default browser run reached the ADMIN recovery case after preceding journeys had created more issues. Its direct target link was outside the dashboard's intentional five-issue preview (ApprovalDashboardView uses page1/limit5); waiting longer could not make it appear. Stopped that already-failed attempt with graceful SIGINT to its exact owned Playwright process, preserving retries0 and teardown; remaining cases in that attempt are unperformed and it is not acceptance. No timeout, dashboard bound or product behavior was changed.

The test now reads the actual order business number through its authorized HTTP owner, navigates through the existing department selector and full issue-list Next link, filters with the existing business-number search, then follows the exact order link. No reload, page.goto, replacement context/QueryClient or fabricated DOM link is used after the unknown contact write. The same-document witness, original contact receipt/wrapper, otherwise eligible disabled review, one-write-before-acknowledgement and two-total-writes-after-new-review assertions remain unchanged. Fresh `pnpm --filter @template/web test:e2e --grep "P04 US3 ADMIN owner"`: **2/2 PASS**, desktop/narrow,35.5s. Requirements/test-guard review confirms current full-list navigation instead of a fixture-rank assumption and unchanged F-V07/F-V08 recovery proof. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for the correction; the restarted complete56-case regression remains required by T046.

### Returned correction to T039 — finite login budget for the expanded suite

The next complete browser attempt passed all28 desktop cases and the first narrow journeys, then genuine login-source429 responses prevented subsequent narrow sessions from starting. Different newly used accounts failed together; the owned child still configured the earlier26-case suite's shared-source budget100 while the expanded suite has56 cases. Production AuthRouter still applies loginSource plus validated account/source limiting. Read the actual auth-rate-limit config, source/account key owners and route before the correction; production fallback limits20/source and5/account remain unchanged.

Changed only buildApiChildEnvironment's existing finite synthetic AUTH_LIMIT_LOGIN_PER_15_MIN from100 to250, covering the expanded workload on one loopback source. The per-account100 and all other child budgets are unchanged; both real middleware limiters remain active. No production config, bypass, new environment key, timeout, sleep-to-reset, retry, worker or artifact-policy change. Gracefully interrupted the already-failed run at its exact owned Playwright process; its unperformed remainder is not acceptance. Teardown removed the owned runtime/container/children and preserved unrelated services.

At this correction, all973 preceding source-manifest files still match except apps/web/e2e/global-setup.ts. The last passing full unit/integration/production-build checks remain matching evidence for their unchanged application, tests, contracts, database and build inputs. Harness-facing formatting/lint/types/unit and output checks plus complete default and reviewed browser runs are rerun below; no stale actual-source result is reused for the changed harness. Requirements/engineering review confirms a finite existing test-environment capacity adjustment rather than permission/rate-limiter removal. The56-case full pass remains the closure gate.

### T039 readiness correction — prepare the cold ADMIN customer route

The completed default run exercised all56 cases: **55 PASS,1 FAIL**,16.9m. All30 P04 journeys and all narrow cases passed with the finite login budget; no further429 occurred. The sole failure was unchanged P02-C3 desktop at customer-drafts.spec.ts:819, waiting for ADMIN's broader customer-drafts GET after navigation from its staff directory. The captured main page was still the prior staff directory, not a business-data denial. The same privacy assertions passed later in narrow, after that route family had been used. Observed development full-reload notices and the cold-route timing make a navigation/compilation race the working diagnosis; no application authorization defect is claimed from this timeout.

Read the actual ADMIN page/client query path, harness readiness/lifecycle and installed Next local-development/Fast Refresh guides. Extended only the owned Next startup readiness with an anonymous HTTP preparation of the existing /admin/customers/[phone] family, using an unused valid synthetic phone. This compiles code before browser subscribers start; it creates no session/customer/data, grants no access and supplies no business success. The existing bounded readiness poll, request/overall deadlines, stderr forwarding, development server, workers/retries/artifact policy and every P01–P03 test byte remain unchanged. Failure uses a safe named readiness error and existing owned cleanup.

Fresh unchanged `pnpm --filter @template/web test:e2e --grep "P02-C3 privacy"`: **2/2 PASS**, desktop/narrow,1.2m, with real UI/HTTP and all original privacy/broader-ADMIN assertions. This is targeted evidence for the bounded preparation, not a substitute for the complete run. The source manifest differs only in apps/web/e2e/global-setup.ts; the previously passed integration/production-build sources still match. Separate requirements and test-infrastructure/engineering reviews PASS for this T039 preparation; T046 remains open pending complete current regression and reviewed-source evidence.

### T039 complete-build readiness — replace development route preparation

The route-prepared full run completed **55/56 PASS**,19.9m. Both privacy cases now passed, but the last narrow identity C1 timed out at staff-identity.spec.ts:207: the approved account remained on the login "Restoring your workspace" handshake while awaiting the cutting dashboard. The per-route development preparation therefore does not establish whole-suite readiness. No failed attempt is accepted and no legacy assertion, timeout or retry is relaxed.

Within the existing T039 global-setup owner, replaced on-demand development serving and the partial anonymous route preparation with a bounded build followed by the built Next server. The installed Next Playwright guide explicitly recommends build/start for browser tests; local-development guidance distinguishes on-demand development compilation. The owned API origin exists before compilation. The actual installed pnpm workspace selector @template/web... builds the web package and its contracts dependency, then the existing scripts/next.mjs start command serves that completed build on the same reserved loopback port. NODE_ENV changes only for this owned web tooling/runtime; the API remains its disposable test configuration. Production configuration/source, roles, cookies/CSRF/permissions and all P01–P03 test bytes remain unchanged.

The existing Next child handle owns the build process group and then the server group sequentially; nonzero/unfinished build fails with P04_E2E_WEB_BUILD_FAILED and the existing cleanup path. Existing240-second readiness bound, shutdown bounds, stderr forwarding, private runtime, projects/workers/retries/artifact policy and finite login limits remain. Resolve pnpm through the existing npm_execpath/Node pattern already used by the owned API migration runner. No new dependency, endpoint, environment-loading path, developer server/database reuse or deployment is introduced.

Fresh unchanged `pnpm --filter @template/web test:e2e --grep "P02-C3 privacy|C1: a verified"`: **4/4 PASS**, both cases/both projects,1.1m including the owned build. Actual case times4.5–5.7s; source-specific privacy and live approved-workspace assertions remain intact. Harness types/scoped lint PASS after removing optional chaining from known pipe streams. README/PROJECT_REFERENCE setup text now describes the actual build/serve lifecycle; all other T045 claims remain valid. **REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS** for this bounded T039 correction. The complete current56-case/default and separate reviewed-source runs remain T046 gates.

### T046 — current exit evidence and bounded handoff blocker

**Selected scope:** Group4/T039–T046, HEAD b9d2b3d plus the preserved dirty worktree. Both requirements-quality checklists were reviewed read-only: requirements16/16 and approval-reapproval-printing40/40. Their completion is not execution acceptance. T039–T045 are verified complete; T046 remains unchecked because the mandatory complete default regression did not pass.

Current source identity: `/tmp/p04-group4-final-source-hashes.json` records973 files excluding this mutable execution ledger; its SHA256 is `247ee29582b623c1dd61a7a2a2d51ddc63c2e4e7da8e3315977a569b4710de6b`. All recorded files match after the final browser/diagnostic runs. Relative to Group4 intake, eight existing source/reference files plus this ledger changed and one browser file was created; no intake file is missing. Existing prior-group work remains preserved. Root roadmap, accepted spec/design/checklists, prior SQL/migrations, root workbook and T026 command hooks are unchanged from intake. The returned corrections are confined to named T032 and T017 owners above.

The current complete exit sequence ran the following commands, without skipping failing cases, retries or timeout changes:

| Command                                                                                                      | Current result    | Evidence boundary                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`                                                                                          | PASS              | Whole-workspace check,12.41s; ledger formatting checked again after this entry.                                                                                                |
| `pnpm lint`                                                                                                  | PASS              | Whole workspace,33.29s.                                                                                                                                                        |
| `pnpm check-types`                                                                                           | PASS              | Whole workspace,2.89s.                                                                                                                                                         |
| `pnpm test`                                                                                                  | PASS              | 1604 tests/162 files,35.03s: fresh web1062/104; matching Turbo cache API333/44, contracts188/12 and database21/2 from earlier executed checks.                                 |
| `pnpm test:integration`                                                                                      | PASS              | Fresh API288/23 plus database101/4,116.97s; disposable PostgreSQL. Dependency builds reused matching cache.                                                                    |
| `pnpm build`                                                                                                 | PASS              | 33.92s; fresh web build, matching dependency outputs.                                                                                                                          |
| `pnpm verify:build-output`                                                                                   | PASS              | Six required entry artifacts,570 emitted files, no emitted tests; repeated after the final harness builds with the same result.                                                |
| `pnpm --filter @template/web check:e2e-types`                                                                | PASS              | 1.22s.                                                                                                                                                                         |
| `pnpm --filter @template/api check:e2e-types`                                                                | PASS              | 1.60s.                                                                                                                                                                         |
| `pnpm --filter @template/web test:e2e`                                                                       | **BLOCKED:54/56** | Complete desktop/narrow run,4.9m; all30 P04 cases pass. The same unchanged P02 lost-reply case fails in each project before its command/recovery assertions begin.             |
| `git diff --check`                                                                                           | PASS              | Rechecked after the current runs; repeated after this ledger entry.                                                                                                            |
| `P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e --grep "P04 reviewed workbook"` | PASS              | Fresh separate owned target,2/2 desktop/narrow,1.0m; actual reviewed workbook, submission, return/resubmission, approval, report/contact/reapproval and both official aliases. |

Private local command results/logs are `/tmp/p04-g4-exit-built-results.json`, `/tmp/p04-g4-exit-built-*.log` and `/tmp/p04-g4-final-reviewed-built.log`. These are local diagnostic evidence, not committed portable artifacts or production acceptance. Existing pg query and color-environment warnings remain visible and unsuppressed.

**Concrete remaining finding:** `apps/web/e2e/customer-drafts.spec.ts:323` observes an authenticated users/me request while immediately reloading the page. Its lost-reply caller at982 first navigates to a blank new-order page without waiting for its protected form to become ready. Both current full-run failures time out in this observer, before the lost-response mutation. A private fresh real-stack diagnostic reproduces observer timeout and navigation to auth/login, with an auth/refresh request observed. A second private fresh diagnostic adds only an actual visible blank-form readiness wait before invoking the same observer: refresh200, authenticated users/me200 and customers200, observer completes, and the blank form remains at sales/orders/new. This supports a navigation/auth-restoration readiness race; it is not evidence that the later lost-response assertions have passed or that every auth failure has been excluded. The first diagnostic also reported an asynchronous request-header observer error during browser teardown; its diagnostic output is not counted as a passing test. The readiness diagnostic closes cleanly and supplies only method/path/status/bearer-presence observations, never credential values.

**Return to owning PLAN/TASKS:** add a bounded correction brief permitting the existing private P02 helper/caller owner `apps/web/e2e/customer-drafts.spec.ts` to wait for actual protected form/session readiness before its reload-based credential observation. Preserve every lost-reply receipt/current-revision/refresh-failure assertion, real credentials/CSRF, project, timeout, retry and artifact policy. Verify the two unchanged recovery journeys on both projects, then rerun the entire default56-case gate and separate reviewed-source acceptance on matching source. T039 currently permits modifications exactly in server.ts/global-setup.ts/runtime.ts; T040–T044 own the new P04 spec, and T046 permits corrections in named prior owners. None authorizes this legacy P02 file. No test/helper or accepted design was silently changed to close that ownership gap. This is a bounded test-readiness handoff correction, with no new product decision requested. Implementation-handoff section4 and the IMPLEMENT prewrite gate require returning such uncovered work to its owner while completing independent authorized checks.

**Current paper evidence:** the final built-server default run produced twelve real Chromium PDFs across desktop/narrow. Poppler verified A4 landscape841.92×594.96pt, source hashes and private permissions; actual1/8/9/17 rows produce1/1/2/3 pages, with one page each for retained-cancellation active1/active0 states. All eighteen current pages were rendered and visually inspected: RTL/Cairo text, wrapped full150-character actual approver name, retained signature distinction, rows/continuations/footer and empty/cancelled frames have no observed clipping, truncation or extra blank pages. This is exported-paper inspection, not a physical printer or deployment claim. Private inspection record `/tmp/p04-g4-final-paper-inspection.json` SHA256 `9b0751456acd75043593688367ca8e646ce7fc2b422dc9bed80446e6d3fce613` retains metadata/hashes; the two current and two superseded inspected owned paper directories were removed. No unrelated temporary files were removed.

**Separate review verdicts:**

| Review / boundary                              | Verdict                                                             | Basis / remaining limit                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements, T039–T045                        | PASS                                                                | US1–US5 actual HTTP/browser witnesses, immutable terms/owner/source/target/privacy, uncertainty recovery, exact money, reviewed source and inspected paper match the accepted requirements.                                                                           |
| Engineering standards, T039–T045               | PASS                                                                | Canonical auth/contracts/services/QueryClient reused; no new authority store, production fixture endpoint or presentation redesign. Named T032 automatic reads join active work; T017 collision arrangement follows persisted chronology.                             |
| Production-code review                         | PASS for the bounded T032 correction                                | Five automatic reconciliation reads use cancelRefetch:false; explicit user retries retain their owner. The real deferred QueryClient regression fails before and passes after the correction; the whole detail file passes28/28. No further Group4 production change. |
| Test-guard                                     | PASS for owned P04/T017/T032 tests; **BLOCKED at whole regression** | Actual services/schemas/receipts and focused negative assertions; distinct mutable scenarios, finite genuine limiter, private cleanup. The two existing P02 readiness failures remain visible and unmodified.                                                         |
| Docs-guard                                     | PASS                                                                | Affected README/PROJECT_REFERENCE routes, permissions, lifecycle and limitations match actual source;20 relative links/anchors resolve. No claim of complete P04/release acceptance.                                                                                  |
| Backend acceptance                             | PASS for current P04 source                                         | Prior T021 remains applicable, current backend/contracts/database unit542 plus fresh integration389 pass; no Group4 production backend/schema change.                                                                                                                 |
| Frontend implementation / P04 browser behavior | PASS within the stated boundary                                     | Prior T038 plus fresh1062 web unit tests, all30 default P04 cases and both reviewed-source cases; current18-page paper inspection.                                                                                                                                    |
| Whole frontend regression                      | **BLOCKED**                                                         | Default54/56; the required existing P02 recovery journeys remain unverified on the built-server lifecycle.                                                                                                                                                            |
| Whole Group4 requirements / engineering exit   | **BLOCKED / BLOCKED**                                               | Mandatory full regression and uncovered helper correction prevent T046 closure; bounded reviews above do not waive that gate.                                                                                                                                         |
| P04 phase completion                           | **BLOCKED**                                                         | T046 remains open; Groups1–3 and completed Group4 tasks are preserved.                                                                                                                                                                                                |
| OPS-01/P08/release                             | NOT PERFORMED / OPEN                                                | No production migration, deployment, physical-printer, commit, push or external-message action.                                                                                                                                                                       |

Cleanup checks cover successful, failed and diagnostic owned lifecycles: API/Next children and disposable application containers/private runtime are gone; only inspected owned paper artifacts were removed. Preserve the three baseline containers and unrelated Fury Manga Next process. Final resource/source/format checks follow this entry; any new discrepancy must be recorded rather than treated as passed.

Final cleanup correction: the first diagnostic's asynchronous observer error interrupted removal of its private runtime directory after its children/container had stopped. Inspected its synthetic P04/project metadata without printing credentials, verified both recorded loopback endpoint ports were closed and removed only that confirmed diagnostic-owned directory. This diagnostic teardown was not an automatic-cleanup pass. The second diagnostic and both required final browser runs closed normally. Final checks observe no owned runtime/paper directory, API/Next child or disposable application/helper container; only baseline containers960bfae2ce93/13100b00269f/5020f8294fff and unrelated Next79308 remain. All973 immutable source-manifest entries still match. Owned documentation formatting,20 relative links/anchors and git diff --check pass. No additional implementation/design file was changed after the final source manifest.

### T046 — explicitly approved legacy readiness correction

The owner explicitly approved the proposed bounded correction and its execution in English. This supersedes only the legacy test-file ownership blocker recorded above; product/design decisions, accepted IDs, prior completed work and mandatory acceptance gates remain unchanged.

**Filled correction brief:** dependency T045 and the preceding reproduced P02 readiness failure; MODIFY only the lost-reply scenario in apps/web/e2e/customer-drafts.spec.ts plus APPEND execution evidence/verified completion in this ledger. Read the private createSalesBrowser/goto/sessionHeaders helpers, complete lost-reply scenario, current auth/form/transport lifecycle and testing/security/review guides. After actual navigation to sales/orders/new, assert the existing general-notes control is visible before sessionHeaders reloads the document. This establishes the protected form's real readiness without a sleep, alternative credentials or altered observer semantics. Preserve all later lost-reply receipt, newer-revision, duplicate-write and confirmed-refresh-failure assertions. Do not change timeout/retry/project/artifact policy, production source or shared helper behavior. Verify both projects with the focused original scenario, then complete default regression, separate reviewed-workbook acceptance, current scoped checks/reviews and owned cleanup. T046 remains unchecked until these actual gates pass.

Prewrite verification: all973 prior immutable source-manifest entries match; existing dirty worktree is preserved, with no owned runtime/paper directory at intake. Both checklists remain read-only and complete16/16 and40/40. The accepted fix is a visible-form readiness assertion at the one failing caller; no extra test or product/API behavior is introduced.

### T046 — final accepted exit after the approved correction

**Outcome: T046 COMPLETE; P04 implementation and local phase-exit acceptance PASS.** This final evidence supersedes the earlier open ownership/regression verdicts without deleting their history. All46 accepted tasks are now complete. OPS-01/P08 and production release remain separate and unperformed.

The correction adds only three lines in the original P02 lost-reply case: await the actual general-notes control's visibility after navigating to the new-order route, then call the unchanged sessionHeaders observer. The protected route keeps its children hidden/inert until authorized; a visible control is an actual readiness witness. No production code, helper semantics, assertion, timeout, retry, worker, project, credential mechanism or artifact policy changed. The original receipt/version/three-command-history/single-create and confirmed-refresh-failure assertions remain intact. Fresh `pnpm --filter @template/web test:e2e --grep 'P02-C3 lost-reply'` passes2/2 in1.1m, including desktop7.5s and narrow5.9s. The full regression subsequently passes the same cases at6.0s and5.2s.

Final source manifest `/tmp/p04-t046-approved-source-hashes.json` has973 immutable entries and SHA256 `02eb5cb4d0ec2974fdf18dac0e7de893b5eeff7a28ce7b6cfe67476b54f37665`. All entries match after the final runs. Compared with the previously reviewed Group4 source, only apps/web/e2e/customer-drafts.spec.ts changed. Compared with this explicit-approval intake, only that test and this ledger changed. Prior dirty work, accepted design/spec/checklists, root roadmap, workbook, production source and migrations remain preserved.

The full required sequence was rerun, then reviewed-workbook acceptance used a fresh separate disposable target:

| Command                                                                                                      | Final result  | Evidence                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                          | PASS          | 16.84s; final ledger format also checked after recording these results.                                                    |
| `pnpm lint`                                                                                                  | PASS          | 46.76s; fresh web lint, matching cache for unchanged packages.                                                             |
| `pnpm check-types`                                                                                           | PASS          | 3.97s.                                                                                                                     |
| `pnpm test`                                                                                                  | PASS          | 1604 tests/162 files,45.75s; fresh web1062/104, matching cached API333/44, contracts188/12 and database21/2.               |
| `pnpm test:integration`                                                                                      | PASS          | Fresh API288/23 plus database101/4,131.51s; disposable PostgreSQL with real migrations, matching cached dependency builds. |
| `pnpm build`                                                                                                 | PASS          | 40.61s; fresh web production build, unchanged dependency outputs reused.                                                   |
| `pnpm verify:build-output`                                                                                   | PASS          | 0.40s; six required entry artifacts,570 emitted files, no emitted tests.                                                   |
| `pnpm --filter @template/web check:e2e-types`                                                                | PASS          | 1.85s.                                                                                                                     |
| `pnpm --filter @template/api check:e2e-types`                                                                | PASS          | 1.61s.                                                                                                                     |
| `pnpm --filter @template/web test:e2e`                                                                       | **PASS56/56** | Complete desktop/narrow regression,301.66s; all30 P04 cases plus existing P01–P03 regressions, retries0.                   |
| `git diff --check`                                                                                           | PASS          | 0.09s; repeated after this final ledger update.                                                                            |
| `P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e --grep "P04 reviewed workbook"` | **PASS2/2**   | 59.24s process duration/58.4s Playwright duration; actual reviewed workbook journey on desktop/narrow.                     |
| `pnpm verify:build-output` after browser builds                                                              | PASS          | Repeated0.40s; same six entry artifacts/570 files and no emitted tests.                                                    |

Private local results are `/tmp/p04-t046-approved-results.json` and `/tmp/p04-t046-approved-*.log`; these are local evidence, not portable committed artifacts. All thirteen recorded command exits are0. No retries, skipped required case, extra sleeps, relaxed assertion/timeout, forced success or warning suppression was used. Existing pg query/color warnings remain visible. No Spec Kit extension hooks are configured.

**Fresh paper acceptance:** the final56-case run produced twelve PDFs with eighteen actual pages across desktop/narrow. Verified each manifest/PDF SHA, directory0700/file0600, A4 landscape841.92×594.96pt and actual1/8/9/17-row page counts1/1/2/3, plus retained-cancellation active1/active0 one-page cases. Rendered and visually inspected every current page at1200px: RTL/Cairo content, full wrapped150-character actual approver name, separate retained signature, row/continuation/footer geometry and cancelled/empty frames pass with no observed clipping/truncation/extra blank page. This is actual PDF export inspection, not physical-printer/deployment evidence. Private record `/tmp/p04-t046-approved-paper-inspection.json` SHA256 `284dbd220b455c47d5b6e158a6ac4f6e99dfdc221cd11f70a14fba36e866f9ce` retains the source identity and actual export/page hashes. Removed only those two inspected owned paper directories after inspection.

| Final review / acceptance boundary   | Verdict                  | Evidence / limits                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements                         | **PASS**                 | Prior accepted US1–US5/FR/VR/SC coverage remains applicable; full default56/56, actual-source2/2 and current18-page visual inspection satisfy the remaining exit gate. Checklists remain read-only16/16 and40/40.                            |
| Engineering standards                | **PASS**                 | Bounded approved test owner, real visible-state synchronization, strict existing discovery/typing/privacy/cleanup, no authority/architecture/presentation change or waived gate.                                                             |
| Test-guard                           | **PASS**                 | The one original regression scenario remains real-stack and retains every behavioral assertion; the added visible-control check establishes caller readiness without mocking a session or extending deadlines. No new redundant test/helper. |
| Documentation review                 | **PASS**                 | This ledger reflects actual commands/current source, separates fresh/cached evidence and preserves failure history. Existing README/PROJECT_REFERENCE continue to link here for current acceptance and release limits.                       |
| Backend acceptance                   | **PASS**                 | T021 and previous production review remain source-matching; current backend/contracts/database unit542 and fresh integration389 pass. No backend production change in this correction.                                                       |
| Frontend acceptance                  | **PASS**                 | T038 and prior T032 review remain applicable; fresh web1062 tests, full browser56/56, reviewed-source2/2 and all current PDF pages pass.                                                                                                     |
| Group4 / T046 / P04 local phase exit | **PASS / COMPLETE**      | Every required accepted task/check and both review dimensions pass. Earlier54/56 and BLOCKED statuses above are historical and resolved by the explicitly approved correction.                                                               |
| OPS-01/P08 / release                 | **OPEN / NOT PERFORMED** | No production target/migration, physical-printer operation, commit, push, deployment, external message or later product phase was executed.                                                                                                  |

Final teardown verification observes no owned API/Next child, disposable application/helper container, private runtime or paper directory. Baseline containers960bfae2ce93/13100b00269f/5020f8294fff and unrelated Fury Manga Next79308 remain untouched. Final source/format/diff/task-marker checks follow this ledger entry; any discrepancy would reopen its affected gate.

## Phase 1: Convergence

This is the first convergence section within the existing P04 feature, following Groups 1–4. Assessment covers all 46 accepted tasks, 29 functional requirements, 25 user-story acceptance scenarios, eight success criteria, eight verification requirements, ten planned operation groups, six architecture decisions and eleven constitution principles. Existing task markers and earlier evidence remain historical records and are preserved. One actionable HIGH partial gap remains; no missing, contradicting or unrequested work was verified.

Current implementation and recorded evidence were inspected without running tests, builds or formatters. All 973 entries in `/tmp/p04-t046-approved-source-hashes.json` match current source; the recorded full-browser 56/56, reviewed-workbook 2/2 and eighteen-page PDF inspection remain source-matching evidence, not fresh execution. Backend and printing assessments found no additional actionable gap. Feature selection, accepted design, checklists, root roadmap and production/release gates remain unchanged.

- [x] T047 Show the retained approver-selected resume target as read-only context in apps/web/src/features/sales/screens/sales-problem-contact-modal.tsx and extend its existing component regression per FR-016 and US3/AC1 (partial).

### T047

**Outcome / traceability**: Resolve convergence finding F1, HIGH partial, against FR-016 and US3/AC1, with FR-012/018/027–029 as preserved constraints and T030 as the original implementation owner. The exact referred-piece modal must show its retained cutting/production destination before either contact action. At assessment, ContactEditor renders report/instructions, frozen customer/price and prior proposal at sales-problem-contact-modal.tsx:291–346, but the entire file never reads resumeTarget. The authoritative field already exists; this is a presentation omission, not a new product or interface decision.

**Dependencies / prerequisite evidence**: T021, T024, T026, T030 and T038 are implemented; T046 records the latest source-matching local exit. Recheck these current producers/callers before editing. Reuse the accepted backend and strict ManufacturingIssueDto semantics; no backend work is required for this correction.

**Allowed file actions**: MODIFY only these implementation/test owners:

- apps/web/src/features/sales/screens/sales-problem-contact-modal.tsx — ContactEditor contextual display and existing departmentLabels.
- apps/web/src/features/sales/screens/sales-problem-contact-modal.test.tsx — existing detail fixture and actual-owner/contact-request interaction cases.

Record implementation/review/check results in this appended task's execution evidence and mark only the verified task complete. Preserve every earlier artifact and evidence entry. API, contracts, database, form model, shared hooks, browser harness, CSS/layout and unrelated screens need no edits.

**Read-before-edit context**: Read spec.md US3/AC1 and FR-012/016/018/027–029; frontend-design.md F03 and F04 Owner contact modal; this ledger's T030 brief; contracts/approval.md contact/workflow shapes; packages/contracts/src/approval/approval.schema.ts manufacturingIssueSchema, issueReviewFieldsMatch and ManufacturingIssueDto. Inspect the complete current modal, ContactForm/ContactEditor captured-context and stale predicates, departmentLabels, test detail/mount helpers and existing AMEND/CANCEL_REQUEST/dirty-input cases. Read docs/engineering/frontend-standard.md forms/query/async-state sections, api-contracts.md boundary parsing, security.md current authority/safe outputs, testing.md meaningful cases/discovery, code-review.md, apps/web/AGENTS.md and applicable installed Next client-component guidance. Inspect immediate modal callers in sales-order-detail-view.tsx and sales-returned-view.tsx; their props and behavior remain unchanged.

**Ordered implementation**:

1. In the existing instruction/context block, display the captured issue's resumeTarget as noneditable text labelled `الوجهة المحفوظة:`. Use the existing departmentLabels values `القص` and `الإنتاج`; follow the existing approval modal's null display `—` defensively. A valid SALES_CONTACT issue already requires a nonnull target in the shared schema. Never infer the destination from source.department, the piece stage or the first option.
2. Bind the text to the same captured exact issue/version used by the authored form. Preserve dirty values and the existing stale/unavailable guard when a background read changes context; reopening is still required before a new intent.
3. Extend the existing component fixture/cases to exercise both CUTTING and PRODUCTION retained targets. Use a source department different from the target in a representative case so deriving the target from source would fail. Assert the visible destination before contact submission and cancellation-request confirmation.
4. Retain the existing exact request/identity assertions and verify neither AMEND nor CANCEL_REQUEST gains a target field or target control. Keep the existing owner/ADMIN, four-field, confirmation, dirty/stale and unknown-result regressions intact.

**Invariants / failure unchanged**: Preserve Arabic/RTL/Cairo and current modal layout/classes; add contextual text only. Exactly model, size, leatherBase and sole remain editable specifications. Target, customer, decoration, frozen prices, paid, companion pieces, issue identity and approval authority remain unchanged. No sales resume/cancel, automatic rebase, fixture fallback, new transport, request schema, store or route is introduced. Unsent cancel writes nothing; stale/denied/failed/unknown handling remains owned by the existing form and command lifecycle. Persistence/migration/external-effect changes are N/A because the required authoritative field is already delivered.

**Concrete verification / done**: First run `pnpm --filter @template/web test src/features/sales/screens/sales-problem-contact-modal.test.tsx src/features/sales/model/sales-contact.model.test.ts`. Require both retained destinations to be visible and read-only, unchanged exact command IDs/body, no target property, and retained dirty input with blocked stale submission. Then use the existing Plan Verification and Review Plan / T046 exit-command sequence for affected regressions and renewed phase-exit evidence; do not relax assertions, retry policy or artifact/privacy/cleanup rules. Source-matching unaffected backend evidence must be labelled reused/cached rather than fresh. Apply the installed production/test review guards and separate REQUIREMENTS and ENGINEERING STANDARDS reviews. Done means the required destination is visible for the exact referral, focused and applicable exit checks pass, evidence is recorded with honest limits and both reviews pass. Release/OPS-01/P08 remain separate.

### T047 Execution Evidence — 2026-11-07

**Outcome: T047 COMPLETE; Phase 1: Convergence COMPLETE; P04 implementation and local phase-exit acceptance PASS.** All 47 accepted tasks are complete. The original convergence finding and earlier acceptance/failure records remain preserved above; this execution resolves F1.

**Intake / prewrite gate:** Authorized scope is P04 feature `004-approval-reapproval-printing`, internal Phase 1: Convergence, exactly T047. Effective selection and the prerequisite script resolve the matching feature; branch `main`, HEAD `b9d2b3d`, with prior dirty work preserved. Captured 975 intake file hashes at `/tmp/p04-t047-intake.json`. Checked the complete T047 brief, accepted FR-012/016/018/027–029 and US3/AC1, F03/F04, shared issue schema, current modal/test/adapter/hooks and immediate callers before editing. T021/T024/T026/T030/T038 and final T046 evidence remain applicable; all 973 previously accepted source entries matched before test edits. No material behavior/interface/design gap required a planning amendment. Current server delivery already supplies the strict authoritative target, so no backend/schema/authority change was needed before this dependent display correction.

| Requirements-quality checklist  | Total | Checked | Unchecked | Review                                              |
| ------------------------------- | ----- | ------- | --------- | --------------------------------------------------- |
| requirements.md                 | 16    | 16      | 0         | PASS — accepted written-quality review reused       |
| approval-reapproval-printing.md | 40    | 40      | 0         | PASS — criteria and prior evidence remain supported |

Checklist markers remained read-only. Revisited the affected frontend/form/query, contract, security, testing, code-style/review and handoff rules, web instructions and installed Next client-component guidance. The accepted captured-context and stale-input policy is unchanged.

**Implementation:** Added exactly six JSX lines in ContactEditor, displaying `captured.issue.resumeTarget` through the existing issue alias and departmentLabels under `الوجهة المحفوظة:`. CUTTING shows `القص`, PRODUCTION shows `الإنتاج`; the accepted nullable type uses the existing `—` fallback. The destination is escaped contextual text in the existing block, with no new control, class, request property, state, hook or transport. Existing ownership, four-field editing, approval, confirmation and recovery behavior remain unchanged.

**Meaningful regression:** Extended existing cases rather than adding duplicate tests. The SALES/ADMIN owner table covers PRODUCTION/CUTTING destinations, including a target different from the reporting department. Both amendment and cancellation-request interactions assert visible read-only destination context and exactly four specification controls. Exact network-boundary body assertions retain IDs/version/notes/changes and reject an added target field; the captured command ID is checked through the existing strict SubmitContactBody schema. A newer wrapper with changed destination keeps the authored destination and dirty notes while submission remains disabled. Existing frozen-term/held-piece, double activation, denied owner, optional-floor/catalog, confirmation and unknown-outcome assertions remain intact.

Before the display fix, the required focused command reproduced four failures from the absent destination, with twelve passes. After the fix and final test typing, `pnpm --filter @template/web test src/features/sales/screens/sales-problem-contact-modal.test.tsx src/features/sales/model/sales-contact.model.test.ts` passes **16/16 in two files**, 2.75s. Logs are `/tmp/p04-t047-red.log` and `/tmp/p04-t047-green-final.log`. An initial full-lint attempt rejected two unsafe assignments from a test matcher. Replaced them with strict shared-schema parsing of the unknown captured body; no lint/type suppression or rule change. That failed attempt is retained at `/tmp/p04-t047-attempt1-*` and is not acceptance evidence.

**Final full verification:** Every command below exited zero on the final source; the reviewed-workbook run used a fresh separate owned target.

| Command                                                                                                      | Result / evidence                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                          | PASS, 12.60s; final ledger formatting checked again after recording.                                                    |
| `pnpm lint`                                                                                                  | PASS, 35.33s; fresh web lint, three unchanged package results reused from matching cache.                               |
| `pnpm check-types`                                                                                           | PASS, 4.14s; fresh web route generation/types, matching unchanged package cache.                                        |
| `pnpm test`                                                                                                  | PASS, 1604 tests/162 files, 39.57s; fresh web1062/104, matching cached API333/44, contracts188/12 and database21/2.     |
| `pnpm test:integration`                                                                                      | PASS, fresh API288/23 and database101/4, 124.37s; real migrated disposable PostgreSQL, matching dependency-build cache. |
| `pnpm build`                                                                                                 | PASS, 35.00s; fresh web production build, unchanged dependency outputs reused.                                          |
| `pnpm verify:build-output`                                                                                   | PASS, 0.38s; six entry artifacts,570 emitted files, no emitted tests.                                                   |
| `pnpm --filter @template/web check:e2e-types`                                                                | PASS, 1.14s.                                                                                                            |
| `pnpm --filter @template/api check:e2e-types`                                                                | PASS, 1.52s.                                                                                                            |
| `pnpm --filter @template/web test:e2e`                                                                       | PASS56/56, 333.68s; complete desktop/narrow regression, retries0.                                                       |
| `git diff --check`                                                                                           | PASS, 0.11s; repeated after this ledger update.                                                                         |
| `P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e --grep "P04 reviewed workbook"` | PASS2/2, 67.97s process duration; actual reviewed-source journey on both projects.                                      |
| `pnpm verify:build-output` after browser builds                                                              | PASS, 0.42s; same six entry artifacts/570 files.                                                                        |

Private local results are `/tmp/p04-t047-results.json` and `/tmp/p04-t047-*.log`; all thirteen final recorded exits are0. Existing pg concurrent-query deprecation and FORCE_COLOR/NO_COLOR warnings remain visible. No required case was skipped, no assertion weakened and no retry/timeout/artifact policy changed.

**Print evidence and cleanup:** Print producers/contracts/routes/components/CSS are byte-identical to the final T046 source; its eighteen-page visual inspection remains applicable as reused evidence, not a fresh visual inspection. Its record SHA256 remains `284dbd220b455c47d5b6e158a6ac4f6e99dfdc221cd11f70a14fba36e866f9ce`. The fresh browser run exported twelve PDFs/eighteen pages. Fresh Poppler metadata verifies actual1/8/9/17-row page counts1/1/2/3 plus active1/active0 cancellation cases, A4 landscape841.92×594.96pt, manifest/PDF hashes and directory0700/file0600 modes. Record `/tmp/p04-t047-paper-metadata.json` SHA256 `a5a9226d255b75c93582315d9d4caafbcca4e2af1afa95c85e2951fa356d92c6` explicitly labels metadata-only freshness and visual reuse. Removed only its two inspected owned export directories. Final observation finds no owned API/Next child, runtime/paper directory or disposable container; the baseline containers960bfae2ce93/13100b00269f/5020f8294fff and unrelated Next79308 remain untouched. No physical-printer or production claim is made.

**Source and preservation:** Final immutable manifest `/tmp/p04-t047-source-hashes.json` has973 entries, SHA256 `4fed6dd7a6e4f28614476fae5bc27c45e13c0dbd14c97c5b612b3b5989cd8604`; all match after verification. Relative to intake, only the two allowed modal/test owners and this ledger change, with no added/missing inventoried file. Earlier task text/evidence is preserved except the authorized T047 completion marker; implementation evidence is appended here. Selection, root roadmap, accepted spec/design/checklists, prior features, workbook, backend/contracts/database and migration history remain unchanged. Final preservation/format/diff/task-marker checks follow this entry; a discrepancy would reopen the affected gate.

| Review / acceptance boundary                     | Verdict              | Evidence / limit                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQUIREMENTS                                     | PASS                 | FR-016/US3-AC1 destination now visible for the exact captured referral; both destinations, four-field-only requests and stale/dirty behavior are verified. F1 resolved.                                    |
| ENGINEERING STANDARDS                            | PASS                 | Existing component/QueryClient/RHF/strict contract owners, escaped read-only presentation and preserved state/authority/design; no new abstraction, dependency or protocol.                                |
| clean-code-guard                                 | Clean                | Six-line derivation from the existing captured DTO and label map; no extra state/I/O, broad catch, cast, suppression or unrelated refactor.                                                                |
| test-guard                                       | PASS                 | Existing parameterized interaction cases, real QueryClient/RHF/shared schemas and justified transport-boundary doubles; red-to-green evidence and exact request assertions, without added duplicate tests. |
| Documentation review                             | PASS                 | English evidence matches current paths/manifests/source/logs and distinguishes fresh, cached and reused visual results; prior artifacts preserved.                                                         |
| Backend acceptance                               | PASS                 | T021 preserved; fresh API/database integration389 passes, unchanged unit542 reused from matching cache.                                                                                                    |
| Frontend / selected convergence / P04 local exit | PASS / COMPLETE      | Fresh web1062 tests, browser56/56, reviewed-source2/2 and the final full sequence pass; T047 and all47 accepted tasks complete.                                                                            |
| OPS-01/P08 / production release                  | OPEN / NOT PERFORMED | No commit, push, deployment, non-test migration, external message or later product phase executed.                                                                                                         |

Post-execution hook check finds no `.specify/extensions.yml`; no registered before/after implementation hook was executed. This request ends at the selected convergence section.
