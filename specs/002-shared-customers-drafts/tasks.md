# Tasks: Shared Customers and Persistent Incomplete Sales Drafts

**Roadmap Phase**: P02 — Shared customers and persistent incomplete sales drafts  
**Feature Directory**: `specs/002-shared-customers-drafts`  
**Generated**: 2026-11-05  
**Input**: [spec.md](spec.md), [technical plan](plan.md), [contracts](contracts/customers-drafts.md), [data design](data-model.md), [frontend design](frontend-design.md) and the existing requirements-quality checklists  
**Git baseline**: `main`, `b286d4e`; the seven existing untracked P02 artifacts are preserved  
**Authorized Scope**: TASKS generation only. No implementation, checklist approval, tests/builds, database action, artifact regeneration, commit/push or deployment is performed by this command.

**Authorized follow-up (2026-11-05)**: Owner approved the scoped OP-04A/F10 planning/backend addition and completion of remaining Group 3 tasks; T043/T044 are ordered before T029. Original generation scope above and earlier BLOCKED evidence are historical. Group4 remains outside this execution.

Apply the root constitution, `AGENTS.md`, `docs/workflow/phase-delivery.md`, the engineering index and `docs/workflow/implementation-handoff.md`. These delivery groups remain within one P02 feature; they are not additional roadmap phases. Unqualified `plan.md` in briefs means this feature's technical plan; the root roadmap is always identified as root `plan.md`. Code/test paths are project-relative. The named read bundles are required context, not instructions to copy documents or create report files.

## Task Format and Execution Rules

- Every task is initially unchecked. A future implementation request resolves permitted IDs and dependency evidence before edits; this file does not authorize execution by existing alone.
- Each stable ID below has one complete execution brief. Existing sources are marked for reuse/modification; new P02 interfaces remain dependency outputs until their producer tasks actually pass. Design readiness never substitutes for producer execution.
- The built-in [requirements checklist](checklists/requirements.md) remains 16/16 from its prior review. The custom [customer/draft quality checklist](checklists/customers-drafts.md) remains 36/36 unchecked. TASKS neither reviews nor changes these markers. A later IMPLEMENT request includes evidence-based requirements review before its outline/code under phase-delivery; once implementation starts the markers are read-only. Unanswered material requirements are genuine gates.
- Reuse completed P01 accounts/authority/session/transport, contracts, database/client, shared QueryClient, current forms/paper and owned test/browser harness. No boilerplate, authentication or Spec Kit setup is missing.
- T018 is the complete backend acceptance gate. Every T019–T037 explicitly depends on it, including adapters/models. T037 precedes real cross-layer browser work. Partial services, fixture responses, local state and mocked persistence cannot satisfy these gates.
- `[P]` means disjoint ready source/test work after all listed dependencies. It does not permit overlapping shared-file writers or package-wide verification while another writer is changing its imported package graph. Use an edit-completion barrier, build ready producers, then serialize package-wide checks; otherwise choose serial execution. Per-task focused tests and later group/exit checks have different evidence scope.
- Use meaningful discovered tests at the claimed boundary; apply code/test/docs/React guards when those actual files are later authored, and separate requirements from engineering verdicts. No arbitrary coverage/file quotas, suppression, blanket retry, skipped acceptance or ceremonial tests.
- Follow the frozen contracts/data/algorithm/cache decisions in the briefs. Naming the canonical hashing helper in T009 and browser-local test helpers makes selected seams concrete; it introduces no new business behavior, storage strategy, protocol or external endpoint. A material newly discovered design conflict returns to its authorized owner rather than being guessed.

## Group 1: Scoped Intake and Actual Prerequisites

**Goal**: Resolve current selection, permitted scope, preserved work, written-requirement admission and P01 source/dependency evidence. No new environment or auth foundation is invented.

- [x] T001 Reconcile P02 selection, requirements review and current-source prerequisite evidence in specs/002-shared-customers-drafts/tasks.md before code work.

## Group 2: Required Backend, Tests and Acceptance

Story labels trace shared domain work to the accepted stories; dependency order takes precedence over nominal story priority. The US6 integrity protocol is an early prerequisite even though its user-facing recovery story is P2.

### Shared contract inputs

- [x] T002 [P] Define common receipt/type/pagination schemas and public exports in packages/contracts/src/sales-commands/command-receipt.schema.ts, sales-drafts/sales-draft-values.schema.ts, http/http.schema.ts and index.ts; extend http/http.schema.test.ts.
- [x] T003 [US1] Define customer/phone/measurement command contracts and tests in packages/contracts/src/customers/customers.schema.ts, customers.schema.test.ts and src/index.ts.
- [x] T004 [US3] Define incomplete draft/command-union contracts and final exports in packages/contracts/src/sales-drafts/sales-drafts.schema.ts, sales-commands/sales-commands.schema.ts, matching schema tests and src/index.ts.

### Additive storage and reached shared boundaries

- [x] T005 [P] Extend the four P02 models/enums/relations in packages/database/prisma/schema.prisma and public exports in packages/database/src/index.ts using the verbatim field constraints in its brief.
- [x] T006 Add packages/database/prisma/migrations/20261105000100_shared_customers_sales_drafts/migration.sql with the quoted model constraints/triggers/indexes and extend packages/database/tests/schema-contract.test.ts and tests/integration/migration.integration.test.ts.
- [x] T007 Extend the fixed owned cleanup graph in apps/api/src/test-support/reset-test-data.ts, its unit/integration tests and packages/database/tests/integration/seed.integration.test.ts without weakening guards.
- [x] T008 [P] Correct date-only/parser errors in apps/api/src/core/date-only.ts, core/constants/http-status.constants.ts and middlewares/error-handler.middleware.ts; extend their existing tests.

### Scoped domain operations and retained commands

- [x] T009 [P] [US6] Implement the audited command executor/types/mapper/errors and real command integration in apps/api/src/modules/sales-commands/sales-command-executor.ts and related named files.
- [x] T010 [P] [US1] Implement scoped customer queries/projections and meaningful query integration in apps/api/src/modules/customers/customers.queries.ts, customers.mapper.ts and customers.queries.integration.test.ts.
- [x] T011 [P] [US1] Implement CustomersService customer reads/writes and persistence evidence in apps/api/src/modules/customers/customers.service.ts, customers.errors.ts and customers.service.integration.test.ts.
- [x] T012 [P] [US3] Implement draft query/mapper/piece-rule owners and tests in apps/api/src/modules/sales-drafts/sales-drafts.queries.ts, sales-drafts.mapper.ts, sales-drafts.rules.ts and matching discovered tests.
- [x] T013 [P] [US3] Implement SalesDraftsService aggregate operations and real persistence checks in apps/api/src/modules/sales-drafts/sales-drafts.service.ts, sales-drafts.errors.ts and sales-drafts.service.integration.test.ts.

### HTTP adapters, actual boundary evidence and backend gate

- [x] T014 [P] [US1] Add customer DTO/controller/routes/module exports and wiring checks in apps/api/src/modules/customers/customers.controller.ts and apps/api/src/modules/customers/customers.routes.ts.
- [x] T015 [US3] Add draft adapters and private receipt observation in apps/api/src/modules/sales-drafts/sales-drafts.routes.ts and apps/api/src/modules/sales-commands/sales-commands.service.ts with named DTOs/controllers/tests.
- [x] T016 Compose the three P02 modules and align OpenAPI with real HTTP integration in apps/api/src/router.ts, modules/index.ts, infrastructure/openapi/openapi.ts and modules/sales-drafts/sales-drafts.http.integration.test.ts.
- [x] T017 [US6] Complete controlled replay/race/rollback/live-authority/privacy cases in apps/api/src/modules/sales-commands/sales-command-executor.integration.test.ts and the named customer/draft/HTTP integration owners.
- [x] T018 Record separately supported requirements/engineering/backend acceptance in specs/002-shared-customers-drafts/tasks.md after the complete required backend checks and review pass.

**Backend gate**: T018 must pass with all T002–T017 behavior, review and real evidence before any dependent frontend task. A backend-only batch is not P02 completion.

## Group 3: Dependent Existing-Frontend Integration

All tasks below require T018. Existing design, account boundary, paper controls and unrelated unconverted callers/provider remain preserved.

### Shared scope, transport, queries and command lifecycle

- [x] T019 [P] Implement current-session operational scope and four-part query-root guards in `apps/web/src/shared/query/operational-scope.ts` with discovered scope tests.
- [x] T020 [P] [US1] Implement runtime-validated customer reads/writes and cancellable reads in `apps/web/src/features/customers/api/customers.api.ts` with adapter tests.
- [x] T021 [P] [US3] Implement draft and actor-private receipt adapters in `apps/web/src/features/sales/api/drafts.api.ts` and `apps/web/src/features/sales/api/sales-commands.api.ts` with adapter tests.
- [x] T022 [US1] Implement scoped customer queries, exact resolution and current-detail options in `apps/web/src/features/customers/hooks/customers.hooks.ts` with real QueryClient tests.
- [x] T023 [US3] Implement scoped draft/list/change/activity queries and current-detail options in `apps/web/src/features/sales/hooks/drafts.hooks.ts` with real QueryClient tests.
- [x] T024 [US6] Implement frozen four-operation commands, receipt observation and confirmed-write synchronization in `apps/web/src/features/sales/model/sales-command-state.ts` and `apps/web/src/features/sales/hooks/sales-commands.hooks.ts` with tests.

### Pure form/entry decisions and customer surfaces

- [x] T025 [P] [US1] Implement customer defaults, dirty patch, validated route and known-field errors in `apps/web/src/features/customers/model/customer-form.model.ts` with tests.
- [x] T026 [P] [US3] Implement complete draft capture/entry/paper/error models and order-type shared aliases in `apps/web/src/features/sales/model/draft-form.model.ts` and `apps/web/src/features/orders/order-types.ts` with tests.
- [x] T027 [P] [US1] Connect sales/admin customer directories to controlled server pages in `apps/web/src/features/sales/screens/sales-customers-view.tsx` and `apps/web/src/features/administration/screens/admin-customers-view.tsx` with tests.
- [x] T028 [P] [US1] Connect standalone RHF customer create/edit forms in `apps/web/src/features/sales/screens/sales-customer-new-view.tsx` and `apps/web/src/features/sales/screens/sales-customer-edit-view.tsx` with tests.
- [x] T043 [US5] Add and accept the owner-authorized paginated customer draft-card backend under OP-04A/contracts §7, preserving existing schemas/migrations.
- [x] T044 [US5] Add scoped customer draft-card adapter/query reads under F10 after T043 backend acceptance.
- [x] T029 [P] [US5] Connect scoped customer draft/measurement panels in `apps/web/src/features/sales/screens/sales-customer-detail-view.tsx` and `apps/web/src/features/administration/screens/admin-customer-detail-view.tsx` with tests.

### Atomic paper/inline integration and reached draft views

- [x] T030 [P] [US3] Add compatible P02 paper dataState/options/unpriced/error-focus props in `apps/web/src/features/orders/components/order-paper-form-props.tsx` and its paper consumers with regression tests.
- [x] T031 [US3] Integrate actual RHF paper, inline customer/selection interfaces and their immediate caller atomically in `apps/web/src/features/sales/screens/sales-create-order-view.tsx`, `apps/web/src/features/sales/screens/inline-customer-modal.tsx` and `apps/web/src/features/sales/screens/sales-customer-section.tsx`, including entry wrappers/metadata/basic smokes.
- [x] T032 [P] [US2] Prove actual inline-in-paper saved-customer/cancel/duplicate/unknown/late-result flows in `apps/web/src/features/sales/screens/inline-customer-flow.test.tsx` without application edits.
- [x] T033 [P] [US4] Prove controlled row add/duplicate/remove/resequence/error identity in `apps/web/src/features/sales/screens/sales-create-order-view.test.tsx` and `apps/web/src/features/orders/draft-paper-state.test.tsx`.
- [x] T034 [P] [US3] Connect P02 draft/all-orders/dashboard reads in `apps/web/src/features/sales/screens/sales-drafts-view.tsx`, `apps/web/src/features/sales/screens/sales-all-orders-view.tsx` and `apps/web/src/features/sales/screens/sales-dashboard-view.tsx` with tests.
- [x] T035 [P] [US5] Connect real draft detail/history and scoped activity in `apps/web/src/features/sales/screens/sales-order-detail-view.tsx` and `apps/web/src/features/sales/screens/sales-activity-view.tsx` with tests.
- [x] T036 [US6] Complete coordinated late/retry/sync/dirty-conflict regressions across `apps/web/src/features/sales/hooks/sales-commands.hooks.test.tsx` and reached customer/draft screen tests, correcting only their listed P02 owners.
- [x] T037 Review the frontend and record focused/full web and harness-typecheck evidence in `specs/002-shared-customers-drafts/tasks.md` before browser acceptance.

## Group 4: Cross-Layer and Phase Exit

Browser work uses only the existing owned real stack, after the complete backend and frontend gates. No fixture endpoint, production operation or second test platform is introduced.

- [x] T038 [US1] Add real shared-customer browser acceptance in apps/web/e2e/customer-drafts.spec.ts on both existing browser profiles.
- [x] T039 [US3] Add inline-customer, incomplete-draft and individual-piece browser acceptance in apps/web/e2e/customer-drafts.spec.ts.
- [x] T040 [US5] Add owner isolation, ADMIN, stale-edit and lost-reply browser acceptance in apps/web/e2e/customer-drafts.spec.ts.
- [x] T041 Update only implemented P02 behavior and evidence limits in README.md and PROJECT_REFERENCE.md.
- [x] T042 Run complete applicable verification and record separate conformity, backend, frontend, browser and P02 verdicts in specs/002-shared-customers-drafts/tasks.md.

**Exit**: All scoped requirements, both conformity reviews and required evidence must pass for P02. Prices/submission remain explicitly unavailable until P03. NUM-01, catalog activation, submitted snapshots/lifecycle and OPS-01 release remain their owning phases. No task grants commit/push/deployment, retained-target destructive action, real spending or external-message authorization.

## Dependencies and Safe Execution

The table is the canonical direct dependency ledger; each brief supplies its exact source/interface and evidence context. A range includes every ID in that range. Original dependencies point to earlier IDs; the owner-authorized T043/T044 amendment is explicitly ordered before T029 regardless of its preserved numeric IDs; no consumer may treat an unfinished producer as an implemented foundation.

| Task | Direct prerequisites                                 | Story / design owner             |
| ---- | ---------------------------------------------------- | -------------------------------- |
| T001 | None                                                 | Shared; Scope / gates            |
| T002 | T001                                                 | Shared; OP-01/06                 |
| T003 | T002                                                 | US1; OP-01–04/07                 |
| T004 | T002, T003                                           | US3; OP-01/04–06                 |
| T005 | T001                                                 | Shared; OP-09                    |
| T006 | T005                                                 | Shared; OP-09                    |
| T007 | T006                                                 | Shared; OP-09                    |
| T008 | T001                                                 | Shared; OP-01                    |
| T009 | T004, T006, T007                                     | US6; OP-03/05–06                 |
| T010 | T003, T006, T007                                     | US1; OP-02/04                    |
| T011 | T009, T010                                           | US1; OP-02–04                    |
| T012 | T004, T006, T007, T008, T009, T010                   | US3; OP-04–05                    |
| T013 | T011, T012                                           | US3; OP-04–06                    |
| T014 | T011                                                 | US1; OP-01–03                    |
| T015 | T009, T013                                           | US3; OP-01/04–06                 |
| T016 | T008, T014, T015                                     | Shared; OP-01–06                 |
| T017 | T009, T011, T013, T016                               | US6; OP-02–06/09                 |
| T018 | T002–T017                                            | Shared; Backend gate             |
| T019 | T018                                                 | Shared; OP-08 / F02              |
| T020 | T018                                                 | US1; OP-01–03                    |
| T021 | T018                                                 | US3; OP-01/04–06                 |
| T022 | T018, T019, T020                                     | US1; OP-02/04                    |
| T023 | T018, T019, T021                                     | US3; OP-04                       |
| T024 | T018, T019, T020, T021, T022, T023                   | US6; OP-03/05–08                 |
| T025 | T018                                                 | US1; OP-07                       |
| T026 | T018, T019                                           | US3; OP-05/08                    |
| T027 | T018, T022                                           | US1; OP-02/07                    |
| T028 | T018, T022, T024, T025                               | US1; OP-03/07                    |
| T043 | T018                                                 | US5; OP-04A / backend acceptance |
| T044 | T043, T019, T020, T022                               | US5; F10 / prepared reads        |
| T029 | T018, T022, T023, T025, T043, T044                   | US5; OP-02/04/07                 |
| T030 | T018, T026                                           | US3; OP-08                       |
| T031 | T018, T022, T023, T024, T025, T026, T030             | US3; OP-05/07–08                 |
| T032 | T018, T031                                           | US2; OP-06–08 / US2              |
| T033 | T018, T031                                           | US4; OP-05/08 / US4              |
| T034 | T018, T022, T023, T025, T026, T031                   | US3; OP-04/08                    |
| T035 | T018, T023, T026, T030, T031                         | US5; OP-04/08                    |
| T036 | T018, T024, T028, T029, T031, T032, T033, T034, T035 | US6; OP-06–08                    |
| T037 | T018; T019–T036                                      | Shared; Frontend gate            |
| T038 | T018, T037                                           | US1; US1 / browser               |
| T039 | T018, T037, T038                                     | US3; US2/US3/US4 / browser       |
| T040 | T018, T037, T038, T039                               | US5; US5/US6 / browser           |
| T041 | T018, T037, T038, T039, T040                         | Shared; Scoped documentation     |
| T042 | T001–T041                                            | Shared; Phase exit               |

### Parallel execution examples by story

| Story | Conditional safe example                                                                                                                                   | Shared-writer / validation limit                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| US1   | T020 customer adapters with T021 draft adapters after T018; later T027 directory and T028 standalone forms after all their producers                       | Distinct source/test owners; neither edits common hooks, paper or package exports                                                                     |
| US2   | T032 inline-flow tests with T033 row tests after atomic T031                                                                                               | Separate test files; any required parent-source correction is serialized under T031, not performed concurrently                                       |
| US3   | Ready T026 pure models with T020/T021; ready optional-paper T030 with T027/T028/T029; later T034 views with T035                                           | T031 waits for prepared models/hooks/paper and changes dialog/section/parent together; no deferred broken required props                              |
| US4   | T033 real row interaction coverage with T032/T034/T035 after T031 and their individual prerequisites                                                       | Do not overlap T030/T031/T036 writers of the editor/paper or its tests                                                                                |
| US5   | T029 scoped related panels with ready T027/T028; later T035 with T034                                                                                      | Private-scope shared hooks are already produced; view/test paths differ                                                                               |
| US6   | T009 retained-command producer with T010 query-only customer reads after T004/T006/T007; T011 service with T012 draft query work after their prerequisites | No shared source/test writes; package-wide checks wait for active API writers. T024/T036 and T017 cross-owner corrections are deliberately serialized |

Shared setup T002/T005/T008 may overlap after T001 only at their disjoint edit boundaries; wait for ready generated/built dependencies before package-wide type/lint/integration checks. T002→T003→T004 serialize contracts index writes. T016 alone owns API composition/OpenAPI. T038→T039→T040 serialize one browser spec. T041/T042 follow completed evidence, not parallel product changes.

### Story order, independent acceptance and MVP

“Independent” below means a distinct observable outcome after its documented prerequisites, not deployment without the common backend gate.

| Story / priority                     | Primary-labelled task count | Implementation / evidence references                                | Independent acceptance criterion                                                                                                                                         |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US1 / P1 shared customers            | 10                          | T003/T010/T011/T014/T020/T022/T025/T027/T028/T038; shared gates     | Two eligible sales accounts discover one saved customer through equivalent phones; basic contact edit, optional fields, duplicates and missing states have real evidence |
| US2 / P1 inline customer             | 1                           | Core implementation T031; focused T032; browser T039                | Confirmed actual C is selected without losing or implicitly saving the paper; unsent cancel has no write                                                                 |
| US3 / P1 incomplete drafts           | 11                          | T004/T012/T013/T015/T021/T023/T026/T030/T031/T034/T039              | One blank-row known-type draft without customer/date/specifications persists and reopens after relogin with saved fields/IDs                                             |
| US4 / P1 individual pieces           | 1                           | Core T012/T013/T026/T031; interaction T033; browser T039            | Copy/remove/resequence retains original IDs and new copy identity, one piece per row and final-row/history boundaries                                                    |
| US5 / P1 private sales work          | 3                           | T029/T035/T040; backend T010–T017 and shared scope                  | Shared C does not expose another owner's related drafts/counts/measurements/activity; direct denial and ADMIN broader access are explicit                                |
| US6 / P2 conflict/recovery/readiness | 4                           | T009/T017/T024/T036; browser T040; unavailable P03 across T030–T035 | Stale losers keep input, unknown writes reconcile to one effect and saved-refresh-failure stays distinct from failed persistence                                         |

Twelve tasks are shared intake/foundation/review/exit work; story counts use each checkbox's primary label once and do not double-count cross-story coverage. All six stories remain required for P02.

The smallest demonstrable MVP after **all required backend acceptance T018** is US1's retained customer directory/create/edit flow (T019/T020/T022/T024/T025/T027/T028 plus their producers). Inline capture and draft value follow through US2/US3; US4/US5/US6 and full browser/exit evidence remain mandatory for whole P02. This is delivery sequencing, not authority to stop the requested phase early or release a partial feature. A suggested future first implementation batch is T001, then the ready shared producers T002/T005/T008; this TASKS request starts none of them.

## Task Briefs

Each ID below supplies its own outcome/dependencies, allowed files/symbols, read bundle, ordered steps, invariants/failure behavior and concrete verification/done proof. Precisely referenced filled blueprints remain the source of shared behavior. T005/T006 quote model constraints verbatim as required; they do not create a competing mutable schema owner. Runtime parameters and conditional meaningful test choices are deliberate, not unresolved design placeholders.

### T001 — Reconcile the selected phase and admission evidence

- **Outcome / requirements / dependencies**: P02 maps to `specs/002-shared-customers-drafts`, with an agreed permitted task range and preserved work. Covers the spec Scope/Baseline, FR-001/019/027 and plan Constitution Check; dependencies: none. This task has no application implementation. Current TASKS generation leaves every task and custom checklist item unchecked.
- **Allowed file actions**: READ root `plan.md`, `.specify/feature.json`, all seven existing P02 requirements/design/checklist files, manifests/configuration and the source bundles named by the selected dependent briefs. APPEND only scoped execution observations under this `tasks.md` when later execution is authorized; MODIFY `.specify/feature.json` only if needed to select the known relative path `specs/002-shared-customers-drafts`, without overwriting an unresolved conflicting selection. Requirements-quality markers may be reviewed only in the pre-code review explicitly covered by `docs/workflow/phase-delivery.md`; do not rewrite their text or accepted decisions, and keep markers read-only once code work starts. No application or roadmap change is part of T001. A missing/mismatched pointer may be repaired only to the known P02 feature as step 1 defines; current TASKS generation leaves it unchanged.
- **Read-before-edit bundle**: Root `AGENTS.md`, constitution, engineering index, phase-delivery §§1–4 and implementation-handoff §§3–4; spec Scope/Baseline/Authority/Phase Exit; plan Technical Context/Constitution Check/Existing foundation interface ledger and the exact OPs for the selected batch. Read both `checklists/requirements.md` and `checklists/customers-drafts.md`. Inspect `apps/api/src/modules/auth/account-authority.ts`, `apps/api/src/router.ts`, `packages/database/src/index.ts`, actual current manifests, and each selected brief's immediate callers. At generation, P01 source is real while operational customer/draft state remains local; the P01 local-acceptance record is historical evidence, not a fresh run.
- **Ordered steps**:
  1. Inspect Git branch/status, effective environment/pointer selection and the requested task IDs; resolve a missing/mismatched write-workflow selection only when needed to select this known feature. Preserve unrelated staged/unstaged/untracked work. Resolve no new roadmap phase.
  2. Before implementation outline/code, review written checklist criteria using the phase-delivery authority of the later IMPLEMENT request; genuine unanswered requirements remain gates. This TASKS command neither performs that review nor preapproves the 36 custom items.
  3. Compare selected briefs and dependency outputs with current source. Mark nonexistent P02 interfaces as proposed outputs of named producer tasks, not existing APIs; block a consumer until its actual producer evidence exists. Do not recreate P01 auth, transport, QueryClient, Spec Kit or the browser harness.
  4. Record permitted/completed scope, source revision, dependency evidence and any exact drift or missing infrastructure in this tasks file's Execution Evidence section. A material behavior/contract/transaction/cache change returns to its authorized planning owner; routine faithful implementation remains allowed.
- **Preserve / failure unchanged**: No reset, fixture import, historic SQL rewrite, app implementation, commit/push/deployment or external action. A selection/readiness failure changes no domain data or code. Missing infrastructure is recorded without using an unrelated database.
- **Tests / verification**: Documentation/source checks only: `git status --short --untracked-files=all`, `git branch --show-current`, path-only prerequisite resolution and source/manifest comparison. No runtime suite or Docker startup is required just to complete intake. Actual backend/frontend/phase acceptance remains in T018/T037/T042.
- **Done when**: The selected scope and current-source/dependency/requirements-quality admission conditions are unambiguous, supported observations are recorded and no unresolved material gate is silently waived. T001 does not mark any implementation task or product phase complete.

### T002 — Common browser-safe receipt, order-type and pagination values

**Outcome / traceability / dependencies**: Foundational support for FR-001/010/019–023/025 and OP-01/06; dependency T001. Produce the common schemas consumed by T003/T004, without customer/draft implementation or a story-completion claim. May run with T005/T008 after T001 because those files are disjoint.

**Allowed file actions and symbols**: CREATE `packages/contracts/src/sales-commands/command-receipt.schema.ts` (`salesCommandActorSchema`, `salesCommandReceiptSchema`, their inferred types) and `packages/contracts/src/sales-drafts/sales-draft-values.schema.ts` (`salesOrderTypeSchema`, `SalesOrderType`, declared shared draft scalar limits). MODIFY existing `packages/contracts/src/http/http.schema.ts` only for `paginationQueryFields` and `isSafePaginationWindow(value:Readonly<{page:number;limit:number}>):boolean`; MODIFY `packages/contracts/src/index.ts` only for these common additive exports; EXTEND existing `packages/contracts/src/http/http.schema.test.ts`. No customer/draft result union imports enter the common receipt file; no database/API import enters contracts. T003 and T004 own later serial additions to index.ts.

**Read-before-edit context**: `plan.md` OP-01/06 and Technical Context; `contracts/customers-drafts.md` §1, §2 and §3 Command results; `data-model.md` SalesCommand actor/version fields. Read current `packages/contracts/src/account/account.schema.ts`, `http/http.schema.ts`, `index.ts`, `http/http.schema.test.ts`, package manifest/config, plus the existing API pagination parser as comparison evidence only. Guides: API contracts §2–3/5–7; code style Type safety and boundary truth/Cohesion and reuse; testing Current harness and discovery/Construct meaningful cases. Account/HTTP schemas exist; all P02 common values are new.

**Ordered implementation**:

1. Reuse existing role/department/ISO/string/envelope definitions; implement strict actor/receipt schema and operation/version/resource consistency refinements exactly from the contract. Preserve actual nullable ADMIN department context; employee authority context is SALES.
2. Define the exact seven-value order-type schema once. Keep receipt/type dependencies acyclic as contracts §1 specifies.
3. Add browser-safe page/limit scalar normalization: blank/missing default1/25; unsigned ASCII digit string≤32 or safe integer; reject0, negative/nondigit/unsafe/null/array/object; limit>100 is an error, never clamp; require safe `(page-1)*limit`. Existing old staff schemas remain unchanged.
4. Add only the new common public exports, then extend current HTTP schema tests for genuine parsing/window edge cases and receipt checks through the later union owner T004 where needed.

**Preserved invariants / failures**: No secret/Prisma/Express/Node import, alternate envelope, changed existing account shape or new performance quota. Invalid input fails rather than silently defaults, except the explicitly accepted blank/missing pagination default. Schema validation does not confer role/ownership authority.

**Verification / done proof**: Later run `pnpm --filter @template/contracts test src/http/http.schema.test.ts` and `pnpm --filter @template/contracts check-types`. Cases: omitted/blank→1/25, `page='2'`→2, limit100 valid,101/0/`'1e2'`/unsafe offset invalid; existing HTTP envelope/account imports still work. Review actual intended discovery and both requirements/engineering dimensions; record fresh versus reused output. No database required. Done means the common exports are present and bounded parsing works, not that any P02 endpoint exists.

### T003 — Customer and Saudi phone contracts

**Outcome / traceability / dependencies**: US1 and support for US2/US5; FR-002–009/017/019/025, OP-01/02/03/07. Dependency T002. Produce the customer producer/consumer types needed before queries/services.

**Allowed file actions and symbols**: CREATE `packages/contracts/src/customers/customers.schema.ts` with `normalizeSaudiCustomerPhone`, `customerPhoneSchema`, all customer capture/patch/body/params/query/read/measurement/command schema and Input/Output types listed in contracts §3; CREATE `packages/contracts/src/customers/customers.schema.test.ts`. MODIFY `packages/contracts/src/index.ts` only to add those customer exports after T002 common exports; T004 makes later draft/union additions. Existing `emailSchema`, HTTP and account shapes are reused, not rewritten.

**Read-before-edit context**: `plan.md` OP-01–03/04; contracts §1–3 Customer shapes, §4/5/7; spec US1/2/5 and phone/clear/missing examples. Reopen `packages/contracts/src/auth/auth.schema.ts`, current account/http/index/tests/config, and T002 values. Read reached customer forms `sales-customer-new-view.tsx`, `sales-customer-edit-view.tsx`, `inline-customer-modal.tsx` as evidence of required name/phone/optional fields, not as authority. Guides: API contracts §2–3/5–7; security Validation, output and injection protection; testing Construct meaningful cases.

**Ordered implementation**:

1. Implement the single pure Saudi normalizer with the exact contract algorithm: both Arabic digit sets, supported separators, one local0/+966/00966 prefix, canonical ordinary mobile/fixed predicate. Do not reuse auth's generic optional phone schema or add a phone provider/library.
2. Implement strict capture/patch semantics, optional nonunique normalized email, lengths and NUL rejection. Omitted patch values remain omitted; explicit optional blank/null clears; required name/phone and empty patches reject.
3. Define safe summary/full/read/measurement/customer-command DTOs, scoped count meanings, unavailable submitted-history literal, exact query/params types and common receipt refinements. A selection summary omits notes/revisions; no private/raw records in output.
4. Add serial customer public exports and meaningful schema tests for both accepted and denied raw inputs/output shapes.

**Preserved invariants / failures**: Phone unique meaning belongs to the database later; schema prechecks do not prove race safety. Email reuse is allowed. Preserve nonblank source-specific paper strings outside this customer normalization. No implicit first-customer selection/merge, invented approved measurements, client authority or new fields.

**Verification / done proof**: Later run `pnpm --filter @template/contracts test src/customers/customers.schema.test.ts src/http/http.schema.test.ts` and contracts check-types. Verify `0500000001`, Arabic formatted form, `+966 50 000 0001`, `00966500000001`→same canonical phone; fixed `0112000001` accepted; foreign/short/letters/repeated prefixes rejected. Verify email omission/clear/reuse, required-field clear, unknown owner/price fields, safe strict output/count/query boundaries. No database claim. Done requires exact exports and actual discovered tests; preserve old auth/staff contract regressions.

### T004 — Incomplete draft captures, safe result union and final exports

**Outcome / traceability / dependencies**: US3/4 and support for US5/6; FR-010–027, OP-01/04/05/06. Dependencies T002,T003. Complete browser-safe aggregate and command result contracts before backend consumers.

**Allowed file actions and symbols**: CREATE `packages/contracts/src/sales-drafts/sales-drafts.schema.ts`, `packages/contracts/src/sales-drafts/sales-drafts.schema.test.ts`, `packages/contracts/src/sales-commands/sales-commands.schema.ts`, `packages/contracts/src/sales-commands/sales-commands.schema.test.ts`; MODIFY `packages/contracts/src/index.ts` for remaining draft/command union exports. Implement every draft capture/replacement/read/list/change/params/body/result schema and matching Input/Output type in contracts §3, importing T002 common values and T003 CustomerSummary only. No index writer may overlap T002/T003.

**Read-before-edit context**: `plan.md` OP-01/04–06; contracts §1–5/7, data-model §1–3, spec US3/4/6 concrete examples. Read current `mvp-types.ts`, `sales-create-order-view.tsx`, `empty-line.tsx`, paper financial/size/side controls and the schema owners from T002/T003; preserve their reached typed fields, not local authority. Guides: API contracts Request parsing/Raw input versus parsed output/Response and provider parsing/Values dates commands; data patterns Precision time and history; testing.

**Ordered implementation**:

1. Implement optional raw captures with canonical nullable output, preserving every character of nonblank paper values. Keep soleAddition separate from additions, M1/M2/M3/face as text, no catalog membership. Retain all header type-specific fields even when hidden by another selected type.
2. Define strict full PUT replacement (all editable keys required explicitly), exact nullable date/provisional decimal parsing,1–200 distinct row UUIDs and normalized aggregate UTF8≤262144. Quantity/position/status/owner/price/totals are output-only or absent, not accepted input.
3. Define full/summary/list/provisional-readiness and bounded activity schemas. `DraftChangesQuery` is page/limit only. Build `kind` customer/draft command union without circular imports; saved after-image/refinement must match receipt operation/resource/version and remain distinct from current resource data.
4. Add final public exports and tests that would catch missing fields, wrong kinds/private fields, false zero prices and silent replacement omissions.

**Preserved invariants / failures**: Blank one-row drafts are valid; no customer/date/spec completeness/number/quote is required. Do not accept a zero-length row list, duplicate UUIDs or authoritative fields. A runtime contract failure must remain a rejection, never fabricated empty/success. DTOs contain no Prisma Decimal/date objects or credentials.

**Verification / done proof**: Later run `pnpm --filter @template/contracts test src/sales-drafts/sales-drafts.schema.test.ts src/sales-commands/sales-commands.schema.test.ts src/customers/customers.schema.test.ts src/http/http.schema.test.ts` and contracts check-types/build. Cases include all seven types, one blank row, distinct soleAddition/additions, retained significant trailing source whitespace, omitted create versus explicit-null full replacement, `2026-02-30`, paid `100.50`/negative/excess precision/upper bound, 200/201 rows, Unicode byte boundary, receipt wrong-kind/resource/version and private field rejection. Done is the executed bounded contract evidence; no backend or UI claim.

### T005 — Additive Prisma domain models and server exports

**Outcome / traceability / dependencies**: Foundational storage for FR-002–007/010–023 and OP-02–06/09. Dependency T001. May run with T002/T008; owns schema/public database exports only. P01 models, migrations and account records remain intact.

**Allowed file actions and symbols**: MODIFY existing `packages/database/prisma/schema.prisma` to add Customer, SalesDraft, SalesDraftPiece, SalesCommand and SalesOrderType/SalesDraftStatus/SalesCommandOperation plus explicitly required User/customer/draft/command relations. MODIFY existing `packages/database/src/index.ts` to export those generated enums/model types required by API imports. Normal declared client generation is permitted during later execution; never author/edit generated Prisma files. T006 owns authored SQL, migration inventory and migration tests.

**Read-before-edit context**: `plan.md` OP-09/source ledger; `data-model.md` §1 Models and stable identity, §2/5; contracts §2–3; actual schema, five existing migration SQL files, database `src/index.ts`, `src/client.ts`, `prisma.config.ts`, package scripts and T001 source check. Guides: data patterns §1–2/5–7; backend §1–2; code style Type safety and boundary truth. Existing generated public exports are explicit, so schema changes alone do not make new names importable.

**Verbatim field constraints required by this task description**: The following quotes are extracted from the accepted data-model table cells; apply them to every listed grouped field, not just the first name. Model enum values and wire normalizers remain the single contract owner.

**Customer / `customers`**

- `id`: “`String @id @default(uuid()) @db.Uuid`” — “Stable customer identity”.

- `name`: “`String @db.VarChar(150)`” — “Trimmed required name”.

- `phone`: “`String @unique(map: "customers_phone_key") @db.VarChar(13)`” — “Canonical Saudi `+966` contact; no raw formatting identity”.

- `email`: “`String? @db.VarChar(320)`” — “Optional normalized email; deliberately nonunique”.

- `address`: “`String? @db.VarChar(2000)`” — “Optional basic address”.

- `notes`: “`String? @db.VarChar(4000)`” — “Optional shared customer notes”.

- `version`: “`Int @default(1)`” — “Edit revision, 1 through 2,147,483,647”.

- `createdAt`, `updatedAt`: “`DateTime @db.Timestamptz(6)`” — “Server instants, explicit update time from command”.

**SalesDraft / `sales_drafts`**

- `id`: “UUID primary key, server generated” — “Internal draft identity, never business number”.

- `ownerId`: “UUID, FK `User`, `onDelete: Restrict`” — “Authenticated creator, immutable through P02 writes”.

- `customerId`: “Nullable UUID, FK `Customer`, `onDelete: Restrict`” — “No customer is a valid incomplete draft”.

- `type`: “New `SalesOrderType` enum” — “Seven exact accepted type strings”.

- `status`: “New `SalesDraftStatus` enum, currently only `DRAFT`” — “Explicit editable-state predicate; later states require P03 design/migration”.

- `deliveryDate`: “`DateTime? @db.Date`” — “Nullable real calendar date; never an action instant”.

- `generalNotes`, `repairNote`, `adjustmentRequested`, `adjustmentReason`, `adjustmentActionTaken`: “`String? @db.VarChar(4000)` each” — “Captured text, including retained nonvisible type-specific fields”.

- `responsibleSignature`: “`String? @db.VarChar(150)`” — “Captured text, never actor/approval authority”.

- `paidAmount`: “`Decimal? @db.Decimal(11,2)`” — “Optional exact provisional entry, 0 through 999999999.99”.

- `version`: “`Int @default(1)`” — “Aggregate revision covering header/customer/ordered pieces”.

- `createdAt`, `updatedAt`: “`DateTime @db.Timestamptz(6)`” — “Server-generated action instants”.

**SalesDraftPiece / `sales_draft_pieces`**

- `id`: “UUID primary key” — “Submitted client-generated UUID is adopted only for a genuinely new row”.

- `draftId`: “UUID FK `SalesDraft`, `onDelete: Restrict`” — “Immutable membership”.

- `position`: “`Int`” — “Positive display order; response derives one-based positions after ordering”.

- `quantity`: “`Int @default(1)`” — “Database check requires exactly one”.

- `model`, `size`, `leatherBase`, `decoration`, `decorationColor`, `faceRight`, `faceLeft`, `mixing`, `face`, `sole`, `soleAddition`, `soleColor`, `additions`, `aField`, `fField`: “`String? @db.VarChar(200)` each” — “Independent provisional captures; no catalog FK or requiredness”.

- `sideNotes`: “`String? @db.VarChar(4000)`” — “Independent optional paper notes”.

- `createdAt`, `updatedAt`: “`DateTime @db.Timestamptz(6)`” — “Server instants”.

- `removedAt`: “`DateTime? @db.Timestamptz(6)`” — “Draft-row tombstone; absent from active paper”.

**SalesCommand / `sales_commands`**

- `commandId`: “UUID primary key, constraint `sales_commands_pkey`” — “Global command identity”.

- `operation`: “New `SalesCommandOperation` enum” — “`CREATE_CUSTOMER`, `UPDATE_CUSTOMER`, `CREATE_DRAFT`, `SAVE_DRAFT`”.

- `actorId`: “UUID FK `User`, Restrict” — “Real authenticated actor”.

- `actorFullName`: “`String @db.VarChar(150)`” — “Name at action time”.

- `actorRole`: “Existing `UserRole`” — “Role at action time”.

- `actorDepartment`: “Existing `Department?`” — “SALES for employee; ADMIN records its real nullable department”.

- `requestTargetId`: “Nullable UUID” — “Null for create, exact route ID for update”.

- `customerId`, `draftId`: “Nullable UUID FKs, Restrict” — “Exactly one affected resource according to operation”.

- `expectedVersion`, `beforeVersion`: “Nullable `Int`” — “Null for creation; expected/current pre-update revision otherwise”.

- `afterVersion`: “`Int`” — “Resulting revision”.

- `payloadHash`: “`String @db.Char(64)`” — “Server SHA-256 of canonical accepted intent”.

- `before`: “`Json? @db.JsonB`” — “Null on create; safe resource DTO before update”.

- `after`: “`Json @db.JsonB`” — “Exact safe committed resource DTO; replay result owner”.

- `occurredAt`: “`DateTime @db.Timestamptz(6)`” — “Same instant as resource update and removed-row timestamp”.

**Ordered implementation**:

1. Preserve current generator/provider/P01 enums/models/defaults/relations; add the four proposed mapped tables and three exact enums. Preserve full stable IDs and Restrict relations; no catalog, manufacturing, approved number, frozen price or browser import model.
2. Apply every quoted type/nullability/length/decimal/default/identity field decision. Dates are Date versus timestamptz as documented; captured optional text remains nullable. Add explicit User owner/actor relations without cascade deletion.
3. Add declared Prisma-compatible indexes from data-model §2; partial constraints/immutability remain T006 authored SQL. Export generated names from database index without importing database into browser contracts.
4. Run only declared schema validation/client generation/checks for this schema step; do not apply migrations, seed or reset a preserved target.

**Preserved invariants / failures**: Preserve all possibly applied prior SQL/checksums and production account state. No silent USER approval, data backfill, identity derived from phone/array length, submitted state or pricing authority. Missing environment/tooling blocks the corresponding check; it never authorizes another database.

**Verification / done proof**: Later run `pnpm --filter @template/database db:validate`, `pnpm --filter @template/database db:generate` and database check-types using the existing safe configuration; inspect generator output and additive export consumption. No database application is claimed by validation/generation. T006 intentionally owns the updated schema-contract inventory and real migrations, so do not run unchanged inventory assertions and falsely call their expected old inventory a production failure. Done requires exact modeled fields/exported types and preserved source boundary; SQL/backend acceptance remains open.

### T006 — Forward SQL invariants, migration preservation and inventory proof

**Outcome / traceability / dependencies**: Foundational FR-002–007/010–023 and OP-09; dependency T005. Deliver deployable additive constraints/indexes/triggers and real migration evidence before any dependent domain service. No application/developer/production migration is authorized by TASKS generation.

**Allowed file actions and symbols**: CREATE proposed `packages/database/prisma/migrations/20261105000100_shared_customers_sales_drafts/migration.sql` after verifying no newer conflicting migration appeared. EXTEND existing `packages/database/tests/schema-contract.test.ts` and `packages/database/tests/integration/migration.integration.test.ts` for the exact P02 inventory and data-model §2/5/6 evidence. Preserve all five earlier SQL files byte-for-byte. Do not alter seed/API cleanup files here; T007 owns them.

**Read-before-edit context**: `plan.md` OP-09 and Verification Test owner matrix; `data-model.md` §1/2/5/6; contracts §2 and authority/receipt invariants. Read actual schema from T005, current migration directory/lock/config, current migration test's independently owned upgrade containers/databases, schema inventory assertions and package runners. Guides: data patterns §2/4/6/7, testing Choose the correct evidence/Cleanup and test integrity, code review §2/4. Current migration test already has owned PostgreSQL Clients/Pools, migrations and checksum preservation; reuse them, not a new unowned DB harness.

**Verbatim modeled field constraints required by this task description**: SQL/storage and migration assertions must implement the same quoted constraints for every field/group below; no length/nullability/enum or decimal choice is deferred to implementation.

**Customer / `customers`**

- `id`: “`String @id @default(uuid()) @db.Uuid`” — “Stable customer identity”.

- `name`: “`String @db.VarChar(150)`” — “Trimmed required name”.

- `phone`: “`String @unique(map: "customers_phone_key") @db.VarChar(13)`” — “Canonical Saudi `+966` contact; no raw formatting identity”.

- `email`: “`String? @db.VarChar(320)`” — “Optional normalized email; deliberately nonunique”.

- `address`: “`String? @db.VarChar(2000)`” — “Optional basic address”.

- `notes`: “`String? @db.VarChar(4000)`” — “Optional shared customer notes”.

- `version`: “`Int @default(1)`” — “Edit revision, 1 through 2,147,483,647”.

- `createdAt`, `updatedAt`: “`DateTime @db.Timestamptz(6)`” — “Server instants, explicit update time from command”.

**SalesDraft / `sales_drafts`**

- `id`: “UUID primary key, server generated” — “Internal draft identity, never business number”.

- `ownerId`: “UUID, FK `User`, `onDelete: Restrict`” — “Authenticated creator, immutable through P02 writes”.

- `customerId`: “Nullable UUID, FK `Customer`, `onDelete: Restrict`” — “No customer is a valid incomplete draft”.

- `type`: “New `SalesOrderType` enum” — “Seven exact accepted type strings”.

- `status`: “New `SalesDraftStatus` enum, currently only `DRAFT`” — “Explicit editable-state predicate; later states require P03 design/migration”.

- `deliveryDate`: “`DateTime? @db.Date`” — “Nullable real calendar date; never an action instant”.

- `generalNotes`, `repairNote`, `adjustmentRequested`, `adjustmentReason`, `adjustmentActionTaken`: “`String? @db.VarChar(4000)` each” — “Captured text, including retained nonvisible type-specific fields”.

- `responsibleSignature`: “`String? @db.VarChar(150)`” — “Captured text, never actor/approval authority”.

- `paidAmount`: “`Decimal? @db.Decimal(11,2)`” — “Optional exact provisional entry, 0 through 999999999.99”.

- `version`: “`Int @default(1)`” — “Aggregate revision covering header/customer/ordered pieces”.

- `createdAt`, `updatedAt`: “`DateTime @db.Timestamptz(6)`” — “Server-generated action instants”.

**SalesDraftPiece / `sales_draft_pieces`**

- `id`: “UUID primary key” — “Submitted client-generated UUID is adopted only for a genuinely new row”.

- `draftId`: “UUID FK `SalesDraft`, `onDelete: Restrict`” — “Immutable membership”.

- `position`: “`Int`” — “Positive display order; response derives one-based positions after ordering”.

- `quantity`: “`Int @default(1)`” — “Database check requires exactly one”.

- `model`, `size`, `leatherBase`, `decoration`, `decorationColor`, `faceRight`, `faceLeft`, `mixing`, `face`, `sole`, `soleAddition`, `soleColor`, `additions`, `aField`, `fField`: “`String? @db.VarChar(200)` each” — “Independent provisional captures; no catalog FK or requiredness”.

- `sideNotes`: “`String? @db.VarChar(4000)`” — “Independent optional paper notes”.

- `createdAt`, `updatedAt`: “`DateTime @db.Timestamptz(6)`” — “Server instants”.

- `removedAt`: “`DateTime? @db.Timestamptz(6)`” — “Draft-row tombstone; absent from active paper”.

**SalesCommand / `sales_commands`**

- `commandId`: “UUID primary key, constraint `sales_commands_pkey`” — “Global command identity”.

- `operation`: “New `SalesCommandOperation` enum” — “`CREATE_CUSTOMER`, `UPDATE_CUSTOMER`, `CREATE_DRAFT`, `SAVE_DRAFT`”.

- `actorId`: “UUID FK `User`, Restrict” — “Real authenticated actor”.

- `actorFullName`: “`String @db.VarChar(150)`” — “Name at action time”.

- `actorRole`: “Existing `UserRole`” — “Role at action time”.

- `actorDepartment`: “Existing `Department?`” — “SALES for employee; ADMIN records its real nullable department”.

- `requestTargetId`: “Nullable UUID” — “Null for create, exact route ID for update”.

- `customerId`, `draftId`: “Nullable UUID FKs, Restrict” — “Exactly one affected resource according to operation”.

- `expectedVersion`, `beforeVersion`: “Nullable `Int`” — “Null for creation; expected/current pre-update revision otherwise”.

- `afterVersion`: “`Int`” — “Resulting revision”.

- `payloadHash`: “`String @db.Char(64)`” — “Server SHA-256 of canonical accepted intent”.

- `before`: “`Json? @db.JsonB`” — “Null on create; safe resource DTO before update”.

- `after`: “`Json @db.JsonB`” — “Exact safe committed resource DTO; replay result owner”.

- `occurredAt`: “`DateTime @db.Timestamptz(6)`” — “Same instant as resource update and removed-row timestamp”.

**Verbatim named invariant constraints from data-model §2**:

- `customers_phone_key`: “Unique canonical phone under race”.

- `ck_customers_phone_saudi`: “Phone matches the canonical predicate in contract §2”.

- `ck_customers_name_nonblank`: “Trimmed nonempty name, no NUL”.

- `ck_customers_email_normalized`: “Null or normalized valid-shape lower-case email; shared schema supplies full validation”.

- `ck_customers_version` / `ck_sales_drafts_version`: “Revision between 1 and signed 32-bit maximum”.

- `ck_sales_drafts_paid_amount`: “Null or nonnegative exact decimal; Decimal(11,2) supplies storage bound”.

- `ck_sales_draft_pieces_quantity`: “`quantity = 1`”.

- `ck_sales_draft_pieces_position`: “`position > 0`”.

- `sales_draft_pieces_active_position_key`: “Partial unique index `(draft_id, position) WHERE removed_at IS NULL`”.

- `ck_sales_commands_binding`: “Customer operations have customer_id only; draft operations draft_id only; create has null requestTarget/expected/beforeVersion and afterVersion1; update target matches affected ID, expectedVersion=beforeVersion, afterVersion=beforeVersion+1”.

- `ck_sales_commands_hash`: “Exactly 64 lower-case hex digits”.

- `sales_commands_customer_version_key` / `sales_commands_draft_version_key`: “Partial unique `(customer_id,after_version)` / `(draft_id,after_version)` when nonnull”.

**Ordered implementation**:

1. Create only the additive P02 migration for new tables/enums/FKs and mapped fields; preserve P01 data/history and current enum meanings. Confirm the new migration filename is still the correct chronological addition.
2. Implement the quoted canonical phone/name/email/version/paid/quantity/position/command-binding/hash constraints and partial unique indexes, plus the exact seven named access/order indexes from data-model §2. Keep SQL-only partial indexes/triggers authored here and represented intentionally in inventory tests. PostgreSQL text rejects NUL inherently; do not construct SQL `chr(0)` checks. Preserve the accepted nonblank and normalization constraints without changing the verbatim field quotes.
3. Add the three narrow new-table identity/retention triggers with named SQLSTATE23514 constraints: draft id/owner immutable, piece id/draft membership immutable and removed row never mutable/resurrected, command UPDATE/DELETE denied. Do not mutate P01 tables or build generic history machinery.
4. Extend meaningful fresh/all-history and P01-populated upgrade tests; retain old row/checksum assertions, test constraints/triggers directly and redeploy with no extra action. Ensure every migration test owns/closes only its disposable target/resources.

**Preserved invariants / failures**: No earlier SQL rewrite, reset/db:push, fixture import, implicit cascade or destructive downgrade. Forward repair preserves new domain data. An unavailable Docker target leaves migration evidence unperformed; never substitute the developer DB. T007 is deliberately not complete, so this task's focused run MUST NOT execute the seed suite or API reset consumers whose four-table cleanup graph still needs extension.

**Verification / done proof**: Later run `pnpm --filter @template/database test tests/schema-contract.test.ts` and `pnpm --filter @template/database test:integration tests/integration/migration.integration.test.ts`. Use real owned PostgreSQL with meaningful P01-populated and fresh deployment cases, phone collision/version/paid/quantity/binding/immutability failures, preserved old checksums and idempotent redeploy. Inspect final rows/constraints and close owned resources. Done requires those actual discovered focused tests; whole database/API/backend acceptance remains pending T007/T018.

### T007 — Preserve guarded cleanup across the expanded fixture graph

**Outcome / traceability / dependencies**: Foundational safe verification for FR-019/022 and VR-002/005, OP-09. Dependency T006. New Restrict FKs must not force tests to widen cleanup or bypass current ownership checks.

**Allowed file actions and symbols**: MODIFY existing `apps/api/src/test-support/reset-test-data.ts` (`resetOwnedIdentityTestData`, unchanged marker/error API); EXTEND existing `apps/api/src/test-support/reset-test-data.test.ts` and `apps/api/src/test-support/reset-test-data.integration.test.ts`; MODIFY/EXTEND existing `packages/database/tests/integration/seed.integration.test.ts` only its `resetOwnedDatabase` fixed graph and corresponding safety assertions. Do not change seed mutation semantics, marker naming, production guard or generic Prisma reset behavior.

**Read-before-edit context**: `plan.md` OP-09 Infrastructure, controlled failures and cleanup; `data-model.md` §5; actual API reset helper/tests/current integration global setup; database seed integration/global setup and create-only seed owners. Read actual P01 tests importing reset helper and new P02 Restrict graph from T006. Guides: data patterns Seed and test isolation/Forward migrations; testing Current harness and discovery/Cleanup and test integrity; security Secrets configuration errors and logs.

**Ordered implementation**:

1. Retain NODE_ENV=test, explicit `P01_TEST_DATABASE_URL`, configured URI equality and selected current_database checks exactly; retain refusal reasons and no credential logging.
2. Extend the one fixed static TRUNCATE graph to include sales_commands, sales_draft_pieces, sales_drafts, customers and the four existing tables. Never use CASCADE/dynamic identifier discovery or a broad cleanup fallback.
3. Apply the same narrow graph change to the independent owned seed integration reset helper; preserve its protocol/database-name verification. Seed itself stays create-only and production-denied.
4. Extend meaningful refusal/owned-success tests including an outside referencing FK that stops cleanup and populated new domain/history rows. Restore/drop only test-owned extra objects and close their clients.

**Preserved invariants / failures**: Guard failure performs no TRUNCATE; foreign references do not trigger wider deletion. Existing passwords/profile/authority/history are not replaced by seed. No developer/production reset or seed runs for these tests.

**Verification / done proof**: Later run `pnpm --filter @template/api test src/test-support/reset-test-data.test.ts`, `pnpm --filter @template/api test:integration src/test-support/reset-test-data.integration.test.ts` and `pnpm --filter @template/database test:integration tests/integration/seed.integration.test.ts`, with current producer builds as needed and owned harness markers only. Verify populated P02 graph cleans only the owned target; every wrong-environment/marker/current-database/outside-FK case retains protected data. Done is real guarded fixture evidence, not merely an expanded SQL string.

### T008 — Correct reached date-only and raw-parser boundaries

**Outcome / traceability / dependencies**: Foundational FR-013/019/025 and OP-01; dependency T001. May run with T002/T005 because the shared source/test owners are disjoint. This is a bounded shared-boundary correction required for accepted P02 values.

**Allowed file actions and symbols**: MODIFY existing `apps/api/src/core/date-only.ts` (`isDateOnlyString`, `parseDateOnly`, serializer compatibility), `apps/api/src/core/constants/http-status.constants.ts` (add PAYLOAD_TOO_LARGE413) and `apps/api/src/middlewares/error-handler.middleware.ts` (safe known parser classification). EXTEND existing `apps/api/src/core/date-only.test.ts` and `apps/api/src/middlewares/error-handler.middleware.test.ts`; use existing AppError/safe-envelope/logger owners, no new parsing framework or raw provider errors.

**Read-before-edit context**: `plan.md` OP-01, contracts §2/5 Parser correction, data-model SalesDraft date mapper paragraph. Reopen these exact current files/callers, `AppError`, error/status schemas, `createApp`, appConfig.bodyLimit, request logger/redaction, installed body-parser/read.js and raw-body/index.js known type/status shapes. Guides: API contracts Parse at real boundaries/HTTP protocol/Values dates; security Secrets configuration errors and logs; testing evidence/meaningful cases.

**Ordered implementation**:

1. Preserve YYYY-MM-DD/UTC semantics but reject year0000/>9999 and replace Date.UTC year0..99 coercion with zeroed UTC date plus setUTCFullYear(year,month-1,day), then compare components. Use the same construction in parsing; retain nullable serialization and real leap-day behavior.
2. Before generic Prisma fallback, safely narrow Error/type/numeric status for only entity.parse.failed400 and entity.too.large413; create fresh fixed operational AppError INVALID_JSON/PAYLOAD_TOO_LARGE. Never retain/log original body/cause or expose its stack, including development.
3. Preserve existing AppError/session/CSRF/Prisma handling, request ID/safe envelope and BODY_LIMIT default1mb. Schema normalized-capture over256KiB remains400 VALIDATION_ERROR later; global parser over1mb is413.
4. Extend current tests for specific new branches and unchanged existing behavior. Raw createApp proof belongs to T016, not a mocked handler claim.

**Preserved invariants / failures**: No broad error swallowing, changed date timezone policy, widened request size, client-derived timestamps, raw SQL/body/log disclosure or reimplementation of existing auth/error transport. Unsupported/unknown errors retain safe existing fallback.

**Verification / done proof**: Later run `pnpm --filter @template/api test src/core/date-only.test.ts src/middlewares/error-handler.middleware.test.ts` and affected API check-types/lint. Verify0001/0099/0100 round-trip, real leap and invalid2026-02-30/0000 rejection; parser known pairs exact status/code and no raw-body/stack/log leakage; mismatched pseudo-code-shaped objects do not become trusted parser errors. Done requires focused real unit boundary evidence; HTTP/backend acceptance remains pending.

### T009 — Serialized audited command execution and immutable saved results

**Outcome / traceability / dependencies**: US6 with shared US1–5 support; FR-019–023/025–026, OP-03/05/06. Dependencies T004,T006,T007. Implement the shared transaction/receipt producer before customer/draft write services, proving its own boundary with real callbacks rather than claiming nonexistent service behavior.

**Allowed file actions and symbols**: CREATE `apps/api/src/modules/sales-commands/sales-command-executor.ts` (`SalesCommandExecutor` exact two overloads; named hashing seam below), `apps/api/src/modules/sales-commands/sales-command.types.ts` (correlated execution/hash-intent types), `apps/api/src/modules/sales-commands/sales-command.mapper.ts` (`SALES_COMMAND_SELECT`, `SalesCommandRecord`, `mapSalesCommandResult`), `apps/api/src/modules/sales-commands/sales-command.errors.ts` (three named safe errors and exact collision/timeout/transaction classifiers), `apps/api/src/modules/sales-commands/sales-command-executor.integration.test.ts`. Add focused `apps/api/src/modules/sales-commands/sales-command-executor.test.ts` only for pure canonical intent hashing/classification cases not already proved by integration. Do not write services/routes/composition yet.

**Read-before-edit context**: `plan.md` OP-03/05/06; contracts §3 Command results, §5 Canonical command binding and §6 execution types/mapper; data-model §3 full numbered executor algorithm/Receipt observation and §6. Reopen current `auth/account-authority.ts`, `staff.service.ts` transaction/lock/retry seam, staff.errors.ts nested adapter error classification, T004 schemas, T006 models/SQL, T007 guarded reset/global setup, existing safe result mapper/parser. Guides: backend §5/6, data patterns Transactions and concurrent writes/Precision time and history, security authority/errors, testing controlled races/real rollback.

**Ordered implementation**:

1. Implement the fixed canonical SHA-256 intent algorithm from contracts §5 in executor owner. Pin routine shared seam `hashSalesCommandIntent(input:SalesCommandHashIntent):string`; the type in sales-command.types.ts is a four-operation discriminated union: CREATE_CUSTOMER with targetId/expectedVersion null and normalized CustomerCapture payload; UPDATE_CUSTOMER with string targetId/numeric expectedVersion and CustomerPatch; CREATE_DRAFT with null target/version and DraftCapture; SAVE_DRAFT with string target/numeric version and DraftCapture. This names the already designed algorithm for later services, adding no new behavior or artifact decision.
2. Implement exact correlated `execute(CustomerCommandExecution)`/`execute(DraftCommandExecution)` and union implementation, with `work(tx,actor,occurredAt:Date)` returning matching before/after type. Keep all dependent work on tx and create one server Date after receipt check for resource/piece/tombstone/receipt use.
3. Apply transaction-local5000ms lock_timeout, actor SHARE lock/current SALES-or-ADMIN check, then deterministic signed64-bit command advisory lock BEFORE receipt lookup/domain work. Use the exact parameterized integer-projection SQL/hash key conversion, ReadCommitted/5000maxWait/10000timeout and lock/resource ordering in data-model §3.
4. Recheck immutable receipt binding and current scope before replay; return validated original saved after-image/replayed flag, not current state. New work/receipt succeed together; classify only exact command PK/P2034 as one safe whole retry and known P2010 nested55P03 as bounded transaction conflict. Never replay arbitrary uniqueness errors or query an aborted transaction.
5. Construct explicit safe receipt/after projections; keep hashes/raw JSON/internal binding out of public summaries. Implement meaningful direct executor integration callbacks writing real owned resources; do not double the transaction being claimed.

**Preserved invariants / failures**: Current authority still controls replay; same actor/intent has one effect, changed binding conflicts; same UUID with another actor cannot reveal retained content. No out-of-transaction helper, generic workflow/DI/repository engine, detached job, raw SQL interpolation or fake saved success. Unknown commit outcomes retain reconcile-by-command semantics.

**Verification / done proof**: Build changed producers with `pnpm --filter @template/contracts build` and `pnpm --filter @template/database build`, then run `pnpm --filter @template/api test:integration src/modules/sales-commands/sales-command-executor.integration.test.ts` plus the named pure test if created. Real PostgreSQL cases: equivalent normalized hash versus changed piece/order/clear intent; identical CREATE and SAVE concurrency serialize before phone/CAS, one revision/receipt and retained replay; changed actor/target/payload conflict; a controlled callback failure after first write rolls back all state/receipt; version1 saved receipt remains version1 after later revision/current read. Close clients and use T007-owned cleanup. Done requires observed final state and both review verdicts; cross-service HTTP/race completion remains T017/T018.

### T010 — Scoped shared-customer query and mapping boundary

**Outcome / traceability / dependencies**: US1 with US5 read privacy; FR-002/006–007/017–019, OP-02/04. Dependencies T003,T006,T007. Deliver actual reusable query/projection helpers, not CustomersService or HTTP behavior.

**Allowed file actions and symbols**: CREATE `apps/api/src/modules/customers/customers.queries.ts` (`CustomerQueryClient`, `findCustomerPage`, `findCustomerData`, `findCustomerMeasurements` exact contracts §6 signatures), `apps/api/src/modules/customers/customers.mapper.ts` (`CUSTOMER_SELECT`, `CUSTOMER_SUMMARY_SELECT`, their Prisma record aliases, explicit map functions), `apps/api/src/modules/customers/customers.queries.integration.test.ts`. Helpers use only the given transaction client/locked-authority input; no root DB or new client is constructed.

**Read-before-edit context**: `plan.md` OP-02/04; contracts §3 Customer shapes, §6 Complete query/mapper type boundaries; data-model §4 read projections/indexes. Read current staff.queries.ts/staff.mapper.ts, users.mapper.ts, core pagination helpers, T003 exports, T006 graph and T007 test cleanup; reached customer directories/detail count/measurement consumers are data-shape callers, still local. Guides: backend Queries mapping efficiency, data patterns Queries projections pagination, security authority table, API contracts Lists/pagination, testing evidence.

**Ordered implementation**:

1. Select only declared customer full/summary fields and serialize actual instants; never raw-spread Prisma objects. Define the exact narrowed transaction delegate type and record aliases from proposed selections.
2. Implement literal name/phone/email matching and normalized phone fragments; use one page/count where, defaults/bounds from shared schemas/API pagination and stable createdAt/id ordering.
3. Query scoped joined draft counts/latest data set-wise over only page customer IDs, never one relation read per customer. totalCustomers remains unfiltered shared-directory count; related data stays actor-owner-scoped unless ADMIN.
4. Implement exact-ID data and bounded provisional measurements/latest summary with current contract sort/source and honestly unavailable submitted history. Missing returns the declared null/empty semantics, never first-customer fallback; service-level authority/error decisions await T011.
5. Add real query-boundary tests using minimal owned rows/actors and the actual helper inside a real transaction. Direct fixture setup is test data, not a claim that a service exists.

**Preserved invariants / failures**: Shared contacts never widen owner-related counts/size/latest records; drafts are not approved history. No unbounded all-row browser filter or N+1 query loop, fixed mock count/name/date, foreign content or credential field. Query helpers neither grant authority nor silently open their own transaction.

**Verification / done proof**: Later run `pnpm --filter @template/api test:integration src/modules/customers/customers.queries.integration.test.ts` after producer builds from prior tasks are current. A/B drafts linked to C must yield distinct owner counts/measurements, ADMIN broader values; email mixed-case search, phone variants/fragments, empty/out-of-range and tie-sort pages must agree with counts; mapping excludes notes from summaries and all credentials. Use actual isolated PostgreSQL/T007 cleanup. Done establishes query/projection behavior only; live service/HTTP authority remains later.

### T011 — Current-authority customer service reads and atomic writes

**Outcome / traceability / dependencies**: US1 and backend US2/5 foundations; FR-001–009/017–026, OP-02/03/04. Dependencies T009,T010. [P] may overlap T012 once both prerequisites are verified; these source/test owners differ.

**Allowed file actions and symbols**: CREATE `apps/api/src/modules/customers/customers.service.ts` (`CustomersService(database,commands)`, all six exact read/write methods in contracts §6), `apps/api/src/modules/customers/customers.errors.ts` (CustomerNotFound/PhoneConflict/VersionConflict errors and narrow phone classifier), `apps/api/src/modules/customers/customers.service.integration.test.ts`. Reuse T009 hash/executor types and T010 query/mappers. Do not alter customer query files under a simultaneous T012 run, module index/composition, or web/local store.

**Read-before-edit context**: `plan.md` OP-02/03/04, contracts §4–6, data-model §3 Customer write details/§4 and spec US1/2/5. Read actual current authority helpers and StaffService locks/read transaction, T009 executor/hash result and T010 helpers, Prisma adapter nested error shapes, existing service integration harness/reset. Guides: backend Service authorization/state boundaries, data patterns transactions/queries, security current authority, testing persisted/negative/concurrent proof.

**Ordered implementation**:

1. Implement actor-locked RepeatableRead reads using current SALES/ADMIN checks and exact query helpers. Resolve canonical phone to stable customer inside the same transaction; no nested independent service transaction or first-record fallback.
2. For create/update, construct normalized discriminated hash intent and call T009 executor. Create derives UUID/version1/server values; update locks exact C, checks expected version/exhaustion and conditionally updates allowed fields with affected-count1.
3. Preserve omitted patch values, explicit optional clearing and nonunique email. Classify only new phone uniqueness as CUSTOMER_PHONE_CONFLICT; do not merge, overwrite or rewrite linked draft/order contact data.
4. Return original saved after-image and retained receipt after atomic commit. All before/after and actor time use the executor-supplied occurredAt; customer-linked draft IDs remain stable.
5. Test actual service/path/final state, not mocked transactions or another module's private helpers.

**Preserved invariants / failures**: Authenticated context derives authority/actor; shared customer basic data is broader than related private orders. Duplicate/stale/denied/missing inputs leave records/receipt graph unchanged. No client-owner/price/status acceptance, silent last-write-wins, email identity or separate event ledger.

**Verification / done proof**: Later run `pnpm --filter @template/api test:integration src/modules/customers/customers.service.integration.test.ts`. Create optional-email C with both local/intl normalized phone examples; same email with another phone allowed; phone edit retains stable linked D; clear versus omission differs; A/B/ADMIN read scopes agree. Test denied current state, two expected revisions one winner, narrow duplicate-phone outcome and one complete before/after receipt. Infrastructure is real owned PostgreSQL with T007 cleanup; changed producer builds must be current. Done requires all six service methods and meaningful stored outcomes; route/UI acceptance remains open.

### T012 — Private draft reads, exact paper mapper and identity rule

**Outcome / traceability / dependencies**: US3/4 and US5 privacy; FR-007/010–018/019/023–025, OP-04/05. Dependencies T004,T006,T007,T008,T009,T010. [P] may overlap T011 because files are disjoint; T013 consumes this output.

**Allowed file actions and symbols**: CREATE `apps/api/src/modules/sales-drafts/sales-drafts.queries.ts` (`DraftQueryClient`, findDraftPage/Data/Changes exact signatures), `apps/api/src/modules/sales-drafts/sales-drafts.mapper.ts` (`DRAFT_SELECT`, `DraftRecord`, `mapDraft`), `apps/api/src/modules/sales-drafts/sales-drafts.rules.ts` (DraftPieceIdentity/Plan/PlanResult and classifyDraftPieces), `apps/api/src/modules/sales-drafts/sales-drafts.rules.test.ts`, `apps/api/src/modules/sales-drafts/sales-drafts.queries.integration.test.ts`. Reuse T010 customer summary mapping and T008 date-only helpers; the existing general Decimal serializer is reused but not changed.

**Read-before-edit context**: `plan.md` OP-04/05; contracts §2–3 draft/read/activity, §6 exact queries/mappers/rule union; data-model §3 Draft aggregate write details/§4. Read staff queries/mapper, corrected core/date-only.ts, core/serialization/decimal.ts, T010 customer types, T009 command mapping, and current paper/mvp fields only as consumer shape. Guides: backend Queries/mapping, data patterns bounded queries/precision/history, API contracts strict safe output, testing pure rules/real query evidence.

**Ordered implementation**:

1. Implement declared owner/ADMIN filters first, exact accessible draft selection and active position-ordered piece projection. Use current linked customer summary and owner relation; omit internal history/hash/private authority/price fields.
2. Implement matching filtered pages/counts and unsearched base totalDrafts/totalPieces semantics, exact UUID/customer/model/phone search, stable updatedAt/id order, and page-only global/per-draft activity from retained command summaries. Measurements remain in customer query owner; do not duplicate their selector semantics.
3. Map nullable fields independently and unchanged, use corrected date-only helpers, and pad existing canonical Decimal text to exactly2 fraction digits without Number arithmetic. Emit only the specified unavailable pricing/submission constants.
4. Implement pure bounded identity classification: duplicates, foreign membership, own tombstones or valid retained/new/removed ID arrays. A valid result alone does not perform writes or assign authority. Keep this exact discriminated result; do not replace it with broad throw/cast behavior.
5. Create pure regression cases for identities and real query/mapping cases for scope/ordering/decimals/field independence.

**Preserved invariants / failures**: Piece IDs survive resequencing; one row is one piece; no fixture fallback or approved measurement label. Distinct soleAddition/additions/text/size/A/F/side notes never collapse. Unavailable price never becomes0. Raw Decimal/Date/Prisma internals do not escape.

**Verification / done proof**: Later run `pnpm --filter @template/api test src/modules/sales-drafts/sales-drafts.rules.test.ts` and `pnpm --filter @template/api test:integration src/modules/sales-drafts/sales-drafts.queries.integration.test.ts`. Cases: P1/P2→P3/P1 valid classification, duplicate/foreign/removed outcomes, A/B scope and ADMIN broader counts/activity, tied dates/pagination, paid100.50 exact text, valid low-year date, separate floor/addition/text round-trip and only safe fields. Use owned PostgreSQL/T007 cleanup for query claims. Done establishes declared query/rule/mapper output, not aggregate persistence or HTTP.

### T013 — Incomplete draft aggregate service and persistence

**Outcome / traceability / dependencies**: US3/4 with US5/6 authority/concurrency support; FR-010–026, OP-04/05. Dependencies T011,T012 (T012 brings T004/T006–010 producers; T011 supplies the shared customer error owner). [P] may overlap T014 after T011/T012; files differ.

**Allowed file actions and symbols**: CREATE `apps/api/src/modules/sales-drafts/sales-drafts.service.ts` (`SalesDraftsService(database,commands)`, list/get/create/save/changes exact signatures), `apps/api/src/modules/sales-drafts/sales-drafts.errors.ts` (documented DraftNotFound/VersionConflict/StateConflict/PieceConflict and narrow piece-PK classifier), `apps/api/src/modules/sales-drafts/sales-drafts.service.integration.test.ts`. Reuse T009 hash/executor, T012 query/rule/mapper and T011’s `CustomerNotFoundError` from `apps/api/src/modules/customers/customers.errors.ts` for an absent supplied customer. Do not duplicate that error or modify its owner here. Do not create route/index/HTTP wiring or use local browser mutations.

**Read-before-edit context**: `plan.md` OP-04/05/06; contracts §2–6 full replacement/results/error ledger; data-model §1–4 exact locks/diff/temporary positions/tombstones and shared Date; spec US3/4/5/6. Read current authority helper, T009 execution/hash types, T012 rule/mapper, T006 identity triggers/partial index, corrected date and current integration setup/reset. Guides: backend use cases/current authority, data patterns conditional writes/transactions/history, security owner scope, testing meaningful DB outcome.

**Ordered implementation**:

1. Implement actor-locked RepeatableRead list/get/changes through T012. For list with customerId, resolve that shared customer in the same protected transaction and throw T011’s CustomerNotFoundError if absent before the list query. For get and per-draft changes, establish the exact accessible parent first; absent/foreign IDs share DRAFT_NOT_FOUND, while an accessible parent with no changes has an empty result. Query-only helpers return their declared data/null and do not import unproduced service errors.
2. For create/save use exact normalized hash intent and T009 executor. Create derives owner/new draftID/version1; save scopes and locks parent before unscoped children, checks DRAFT/expected revision/exhaustion and preserves original owner.
3. Lock/resolve optional linked saved customer under the documented order; a nonexistent supplied ID is not silently cleared. Classify submitted piece UUIDs once through T012; map foreign→generic404, own tombstone→409 and duplicate→400; no cross-draft adoption.
4. Apply full header replacement and ordered child diff atomically using the executor Date: tombstone omissions, shift retained active positions by200, apply desired1..N positions, insert genuinely new rows, preserve retained IDs, and conditionally increment parent owner/status/version with affected-count1.
5. Map safe before/after and commit one receipt; preserve captured type-specific text, nullable date and exact provisional paid entry. No number/submission/quote/workflow/price or whole-draft/customer deletion is implemented.

**Preserved invariants / failures**: Blank1-row/no customer/spec/date works; final row cannot disappear. Retired pieces/history remain, no resurrection/reparenting/partial child ledger. Every failed/stale/denied write rolls back parent/pieces/versions/paid/history. Persisted non-DRAFT race execution is N/A because this phase's enum has DRAFT only; retain the exact state predicate and test rejected client status without weakening schema or inventing future P03 states.

**Verification / done proof**: Later run `pnpm --filter @template/api test:integration src/modules/sales-drafts/sales-drafts.service.integration.test.ts`. Save/reopen blank draft and full captured paper with notes, repairs/adjustments, customer link, soleAddition/additions/M1/A/F/paid/date; duplicate P1 into P3/removeP2/reorder and assert retained IDs/tombstone/one-per-row; reject foreign/tombstoned/zero rows/authority, stale versions and version exhaustion unchanged. Test current authority and scoped reads with real DB, not mocked transactions. Reuse T007-owned cleanup and current producer builds. Done requires all service methods and final persisted state; controlled full cross-service races finish in T017.

### T014 — Customer HTTP adapters and DTO aliases

**Outcome / traceability / dependencies**: US1 with US2/5 foundation; FR-001–009/019/025, OP-01–03. Dependency T011. [P] may overlap T013; T016 exclusively owns central composition/OpenAPI.

**Allowed file actions and symbols**: CREATE `apps/api/src/modules/customers/customers.controller.ts` (`CustomersController` handlers), `apps/api/src/modules/customers/customers.routes.ts` (`customersRoutes(controller,businessAuthenticationMiddleware):Router`), `apps/api/src/modules/customers/index.ts`, `apps/api/src/modules/customers/customers.routes.test.ts`; create only required alias files `apps/api/src/modules/customers/dto/create-customer.dto.ts`, `apps/api/src/modules/customers/dto/update-customer.dto.ts`, `apps/api/src/modules/customers/dto/customer-params.dto.ts`, `apps/api/src/modules/customers/dto/customer-phone.dto.ts`, `apps/api/src/modules/customers/dto/customer-list.dto.ts`, `apps/api/src/modules/customers/dto/customer-measurements.dto.ts`. These alias/re-export the exact shared schemas/types; no copied wire DTOs. CREATE `apps/api/src/modules/customers/customers.controller.test.ts` only if a meaningful nonduplicated missing-context branch needs its own controller test.

**Read-before-edit context**: `plan.md` OP-01/02/03; contracts §4 route order/status/middleware and §6 controller/DTO seams; T011 methods. Read existing staff.routes.ts/staff.controller.ts/index.ts, auth/department/CSRF/validation middleware, ResponseHelper, Request validated typing and API module composition callers. Guides: backend HTTP boundary/controller and module recipe, API contracts parsing/protocol, security direct-call authority, testing wiring versus HTTP claims.

**Ordered implementation**:

1. Alias shared customer DTOs/types and implement required actor/validated-slot checks; absent context is InternalServerError. Safely reparse/narrow the already parsed unknown slot using idempotent shared schema; no empty actor, broad assertion or request-object forwarding.
2. Controllers call only the matching service with authenticated actor, exact parsed target/query/body and proper200/201 existing response helper signatures.
3. Register GET list, literal by-phone, detail, measurements and POST/PATCH with current business auth/SALES-or-ADMIN middleware, CSRF for writes and strict query/params/body schemas. Keep literal resolver before dynamic UUID routes.
4. Export only the intended controller/routes/service surface from new module index; leave central modules/index/router/OpenAPI to T016. Add meaningful wiring tests whose doubles stay outside the adapter boundary being proved.

**Preserved invariants / failures**: No queries/business policy in controllers, duplicate customer validator, alternate envelope, hidden auth bypass, fake inline link, automatic merge or service-exception swallowing. Unit wiring checks are not real persistence/authorization evidence.

**Verification / done proof**: Later run `pnpm --filter @template/api test src/modules/customers/customers.routes.test.ts` (and `pnpm --filter @template/api test src/modules/customers/customers.controller.test.ts` only if that named test is created), API check-types/lint after current dependency builds. Test exact service argument/status projection, strict unexpected fields/query and denied earlier guard preventing handler; missing validated context is internal error. Actual createApp/DB/credentials/CSRF/phone privacy proof remains T016. Done requires reachable module factory/export and adapter-level evidence without central file conflicts.

### T015 — Draft routes and private committed-command observation

**Outcome / traceability / dependencies**: US3/6 with US4/5 support; FR-010–026, OP-01/04–06. Dependencies T009,T013. Deliver existing-designed observation service and both module adapters; no new status/submission endpoint.

**Allowed file actions and symbols**: CREATE `apps/api/src/modules/sales-drafts/sales-drafts.controller.ts`, `apps/api/src/modules/sales-drafts/sales-drafts.routes.ts`, `apps/api/src/modules/sales-drafts/index.ts`, `apps/api/src/modules/sales-drafts/sales-drafts.routes.test.ts`, aliases `apps/api/src/modules/sales-drafts/dto/create-draft.dto.ts`, `apps/api/src/modules/sales-drafts/dto/save-draft.dto.ts`, `apps/api/src/modules/sales-drafts/dto/draft-params.dto.ts`, `apps/api/src/modules/sales-drafts/dto/draft-list.dto.ts`, `apps/api/src/modules/sales-drafts/dto/draft-changes.dto.ts`; CREATE `apps/api/src/modules/sales-commands/sales-commands.service.ts` (`SalesCommandsService.get`), `apps/api/src/modules/sales-commands/sales-commands.controller.ts`, `apps/api/src/modules/sales-commands/sales-commands.routes.ts`, `apps/api/src/modules/sales-commands/index.ts`, `apps/api/src/modules/sales-commands/dto/sales-command-params.dto.ts`, `apps/api/src/modules/sales-commands/sales-commands.routes.test.ts`, `apps/api/src/modules/sales-commands/sales-commands.service.integration.test.ts`. Reuse executor types/mapper/errors; no central router/modules index or OpenAPI edit yet.

**Read-before-edit context**: `plan.md` OP-01/04/05/06; contracts §3–6 exact endpoint/service/context ledger; data-model Receipt observation/Read projections; T009 outputs and T013 all service methods. Read current staff route/controller auth+CSRF+validated context pattern, current safe response helpers, T007 reset/harness. Guides: backend module recipe/HTTP/service, API contracts parsing/HTTP/errors, security current scope, testing actual evidence.

**Ordered implementation**:

1. Implement SalesCommandsService.get in the actor-locked read transaction: current SALES/ADMIN eligibility, same recorded actor, current target visibility, then immutable after-image mapping; absent/other-actor/inaccessible all SALES_COMMAND_NOT_FOUND. A missing receipt is not proof of rollback.
2. Implement module-local required actor/validated-slot safe checks and alias schemas without casts/duplicate contracts. Controllers adapt to matching T013/observation method and existing response helpers only.
3. Register paged draft list, literal global `/changes` before dynamic draftId, detail/per-draft changes, POST create/PUT full save, and GET command by UUID; auth/department, CSRF for writes and strict empty queries match ledger. No submit/delete/piece/price route is registered.
4. Export deliberate module surfaces; add meaningful adapter wiring and real observation service tests using draft commands from T013/owned fixtures, without relying on an unfinished customer service dependency.

**Preserved invariants / failures**: Global activity remains page-only and owner-scoped; same customer does not widen command history. Reconciliation returns saved history as saved, not current. No customer/draft effects on observation, private actor leakage, fresh command ID creation or future submitted states.

**Verification / done proof**: Later run `pnpm --filter @template/api test src/modules/sales-drafts/sales-drafts.routes.test.ts src/modules/sales-commands/sales-commands.routes.test.ts` and `pnpm --filter @template/api test:integration src/modules/sales-commands/sales-commands.service.integration.test.ts`. Verify literal routes resolve, create201/save200/strict DTO mapping, same-actor observed old version after a newer save, other actor/foreign target404 with unchanged graph, eligible ADMIN broader draft read but not another actor's receipt. Use actual owned PostgreSQL/T007 cleanup for observation claims; route tests alone do not establish auth persistence.

### T016 — Compose real P02 HTTP, OpenAPI and cross-layer contracts

**Outcome / traceability / dependencies**: All backend story entry points, FR-001–026/VR-001–002, OP-01–06. Dependencies T008,T014,T015. One writer owns the central composition and API document to avoid parallel namespace conflicts.

**Allowed file actions and symbols**: MODIFY existing `apps/api/src/modules/index.ts`, `apps/api/src/router.ts` and `apps/api/src/infrastructure/openapi/openapi.ts`; EXTEND existing `apps/api/src/infrastructure/openapi/openapi.test.ts`; CREATE `apps/api/src/modules/sales-drafts/sales-drafts.http.integration.test.ts`. Reuse `createApp`, configured API prefix, authentication/department/CSRF/rate/request-ID/errors and existing test auth helpers. Do not start a second server framework or add public fixture/reset/submission endpoints.

**Read-before-edit context**: `plan.md` OP-01–06 Backend and Frontend Delivery Groups/Test owner matrix; contracts §4 endpoint ledger/§5 errors/§6 composition, data-model authority/atomicity; actual router/modules index/OpenAPI, app.integration.test.ts/createApp/shared integration setup, T014/T015 exports and T008 parser behavior. Guides: backend composition/HTTP/lifecycle, API contracts exact producer/consumer/OpenAPI, security CSRF/current authorization, testing actual createApp evidence.

**Ordered implementation**:

1. Export the three modules intentionally and construct one shared SalesCommandExecutor with database; inject it into CustomersService/SalesDraftsService, construct observation service/controllers and mount customers/sales-drafts/sales-commands under existing prefix.
2. Describe exact request/response/status/errors/authorization/query/receipt semantics in existing OpenAPI with shared schemas. Preserve auth/staff/health registration and existing security descriptions.
3. Build one real createApp HTTP integration owner with distinct synthetic A/B/ADMIN/non-sales/restricted accounts in the owned migrated DB, correct bearer/CSRF cookies and current guards. Exercise actual routes, not intercepted fake success.
4. Verify producer outputs against shared envelopes/data and OpenAPI agreement; include raw malformed JSON400 INVALID_JSON and >1mb413 PAYLOAD_TOO_LARGE no raw body/stack/log exposure, plus unchanged existing auth error cases.
5. Verify unknown direct submission paths cannot mutate anything; P02 emits unavailable readiness but registers no fake submission API.

**Preserved invariants / failures**: Existing central transport/auth composition remains authoritative; no body owner/actor/status/price grants rights. HTTP success means committed resource/receipt. Denied/invalid/conflict outcomes preserve protected rows; malformed success never passes strict contract output. No client fixture import/fallback or production action.

**Verification / done proof**: Later run `pnpm --filter @template/api test src/infrastructure/openapi/openapi.test.ts`, `pnpm --filter @template/api test:integration src/modules/sales-drafts/sales-drafts.http.integration.test.ts` and affected `src/app.integration.test.ts` when shared behavior changed. Assert201/200/envelope/requestId/data,403 current department/eligibility, CSRF denial, strict nested field errors, phone duplicates, incomplete save/reopen, foreign404, scoped count/measurement/activity and actor-bound receipt replay. Inspect DB state as well as status; use only owned harness cleanup. Done is actual reached HTTP/OpenAPI evidence, not entire backend acceptance until T017/T018.

### T017 — Controlled real races, rollback and live privacy corrections

**Outcome / traceability / dependencies**: US6 and cross-story integrity, FR-004–007/015–023/025–026, SC-001/003–006, OP-02–06/09. Dependencies T009,T011,T013,T016. This task owns only meaningful gaps after reading producer coverage; do not duplicate a case already fully proven by its owning test.

**Allowed file actions and symbols**: EXTEND only new `apps/api/src/modules/sales-commands/sales-command-executor.integration.test.ts`, `apps/api/src/modules/customers/customers.service.integration.test.ts`, `apps/api/src/modules/sales-drafts/sales-drafts.service.integration.test.ts`, `apps/api/src/modules/sales-drafts/sales-drafts.http.integration.test.ts` for uncovered controlled races/rollback/authority/privacy. Test-only helpers may remain private in those exact files; no production fault-injection API, generalized harness or changed accepted source/contract is authorized by this task.

**Read-before-edit context**: `plan.md` OP-03/05/06 and Infrastructure controlled failures/cleanup; data-model §3/6; contracts §5 canonical binding/unknown outcomes, spec US5/6 examples and final-state criteria. Inspect actual tests from T009/T011/T013/T016 and P01 `account-authority.integration.test.ts`/StaffService locking cases; read current P01 reset guards. Guides: testing real concurrency/rollback/cleanup/meaningful assertions, data patterns transaction retry, security current authority, code review trace behavior.

**Ordered implementation**:

1. Map existing cases to each accepted risk and add only missing observable proof. Use independent connections/clients and controlled barriers/lock observations, never arbitrary sleep as evidence.
2. Race different command IDs for equivalent phones and stale customer/draft revisions; race identical CREATE_CUSTOMER and SAVE_DRAFT intent to prove command lock before uniqueness/CAS; reuse changed command payload/actor to prove no duplicate/misbound receipt.
3. Control both live-authority orderings: staff revocation wins before actor SHARE lock→denied untouched graph, or domain lock validly wins→one commit before later revocation and next write denied. Verify two sales owners share C but not related counts/pieces/measurements/activity/direct resources.
4. Induce a deterministic late audit failure after earlier real domain/piece changes using only test-owned SQL/transaction callback seam, then inspect complete final pre-operation graph (header/paid/positions/tombstones/version/receipt). Restore only owned fault-injection objects.
5. Observe/replay an earlier command after a later save and after a deliberately lost HTTP response: original saved image remains original, current GET newer, no repeated effect/history. Persisted non-DRAFT/submit-versus-save race is explicitly N/A before P03 supplies states; test rejected client status and absent submission routes now without faking that future case.

**Preserved invariants / failures**: No mocked transaction, sequential replay advertised as race, private payload diagnostics, test skips/sleeps/retry blanket, weakening SQL/authority, deleting immutable receipts except fixed guarded TRUNCATE, or unrelated data cleanup. Missing real infrastructure leaves acceptance open.

**Verification / done proof**: Later run the four exact targeted API integration files with `pnpm --filter @template/api test:integration` and their package-relative paths. Assert winners/losers/counts/versions/no partial audit and private outputs, not only status/call counts. Verify bounded lock-timeout/P2034 classification against actual adapter shape. Close every owned client/barrier/server and preserve guards. Done means each accepted risk has a meaningful executed owner and no required in-scope integrity finding remains; no frontend/browser/release acceptance is implied.

### T018 — Required backend review and acceptance before frontend wiring

**Outcome / traceability / dependencies**: Required backend acceptance for all six stories; FR-001–026, VR-001–003/005 and plan Backend and Frontend Delivery Groups. Dependencies T002–T017. Produce distinct requirements and engineering verdicts supported by real backend/contract/migration/HTTP evidence, then permit dependent frontend tasks only if this gate passes.

**Allowed file actions and symbols**: READ all scoped contracts/schema/SQL/module/middleware/composition/tests and accepted design; append concise actual command/result/coverage/limits evidence and this task's marker only in `specs/002-shared-customers-drafts/tasks.md` after later implementation. This review task does not silently redesign/fix other code, rewrite spec/plan/checklists or waive prerequisites; route any required correction to its owning earlier task before claiming completion.

**Read-before-edit context**: `plan.md` entire Backend and Frontend Delivery Groups, Verification and Review Plan and Design Readiness; contracts §1–7/data-model §1–6, current implementation/callers/tests from T002–T017, spec FR/VR/SC and built-in/custom checklist state already reviewed at implementation intake. Revisit all applicable engineering guides, especially code review Establish coverage/Trace behavior/Verify correct close; testing Commands and limits/Review evidence. Apply installed matching clean-code-guard/test-guard/docs-guard according to changed file kind without claiming tool use merely by naming it.

**Ordered review and checks**:

1. Confirm selected P02 IDs, prerequisite artifacts/current source agreement, preserved edits and actual test discovery. Confirm every necessary backend producer is complete and no later UI changes were used as a substitute.
2. Review requirements trace separately from engineering ownership/type/contracts/security/data/concurrency/test integrity, including all source/callers and failure paths. Required in-scope findings block this gate and return to the exact owning task; do not change accepted requirements or mark future execution checked to bypass it.
3. With current inspected producers, run complete relevant backend/contract/database suites and checks: contracts test/build/check-types/lint; database test/test:integration/check-types/lint/build; API test/test:integration/check-types/lint/build; affected formatting check and `git diff --check`. Use real declared package scripts/owned infrastructure. Producer build/generate effects are implementation work, not read-only review; preserve unrelated edits and label caches/fresh execution.
4. Reconcile every required case, populated/fresh migration and cleanup outcome from T006/T007/T017 with actual output. Record useful warnings/missing evidence honestly; no Docker means not accepted, never a fallback database.
5. Append concise REQUIREMENTS and ENGINEERING STANDARDS verdicts plus backend gate, actual commands/results, N/A persisted non-DRAFT limitation, remaining frontend/browser/P03/release boundaries in existing tasks evidence. Mark T018 only after both verdicts and required evidence pass.

**Preserved invariants / failure state**: A green narrow/unit/mock suite cannot establish whole backend, P02 or release acceptance. Failure leaves this gate open and blocks dependent frontend wiring; existing auth/accounts/migration history and frozen presentation remain preserved. No commit/push/deploy, catalog activation, numbering or data import is inferred.

**Verification / done proof**: Exact later command families are manifest-backed: `pnpm --filter @template/contracts test`, `pnpm --filter @template/database test`, `pnpm --filter @template/database test:integration`, `pnpm --filter @template/api test`, `pnpm --filter @template/api test:integration`, each affected package's lint/check-types/build, `pnpm exec prettier --check` over changed owned files and `git diff --check`. Check intended discovery and final persisted state, not just exit0. Done is a supported backend PASS with unresolved frontend/browser/release explicitly separate; no task or test has been executed by this TASKS command.

### T019 — Current operational scope and query-root guards

**Outcome and dependencies**: FR-001/017/019/025–027, OP-08, F02. Depends on T018. Both customer and draft consumers can capture/check the same eligible SALES-or-ADMIN actor, accessVersion and nonsecret epoch without creating another session owner.

**Allowed file actions**: CREATE `apps/web/src/shared/query/operational-scope.ts` with the exact F01 `OperationalScope`, `useOperationalScope`, `readOperationalScope`, `isCurrentOperationalScope`, `assertCurrentOperationalScope` interfaces; CREATE `apps/web/src/shared/query/operational-scope.test.ts`. Existing auth/transport/query-client files are READ/REUSE only.

**Read-before-edit context**: `plan.md` OP-08; `frontend-design.md` F01/F02/F08; contracts §1/6; `docs/engineering/frontend-standard.md` §4/5 and `docs/engineering/security.md` “Start with an authority table.” Inspect `apps/web/src/features/auth/hooks/auth.hooks.ts` session options/reconciliation, `apps/web/src/features/auth/model/account-access.ts` `hasBusinessAccess`, `apps/web/src/services/api/api-client.ts` epoch/policy/subject exports, `apps/web/src/shared/query/query-client.ts`, and existing `apps/web/src/features/administration/hooks/staff.hooks.ts` plus `.test.tsx` for current real-QueryClient test coordination. Staff-private helpers are not importable dependencies.

**Ordered steps**:

1. Implement F02's successful/nonerrored parsed session gate, `hasBusinessAccess` and SALES-or-ADMIN predicate; capture actor/accessVersion/epoch and verify existing transport policy/subject.
2. Compare all three values at dispatch and publication. Expected obsolete/identity/reauthentication results fail closed; unexpected errors propagate to the existing safe error strategy.
3. Expose the precise guard primitives for later hook consumers; the key identity is `['customer-drafts',actorId,accessVersion,epoch]`. Old-root cleanup must compare to current root and never remove current data, including same-actor re-login.

**Invariants and failures**: No token/second QueryClient/session/cache authority, no imports from a private staff helper, no cached errored-user permission, and no stale published incoming resource.

**Verification and done**: In the discovered scope test, seed real session query data for eligible SALES, ADMIN, suspended/wrong-department and cached-success-plus-error accounts. Change accessVersion/epoch and settle old work; assert ineligible scope is null, obsolete assertion cancels and same-actor new-epoch state survives old cleanup. Run `pnpm --filter @template/web test src/shared/query/operational-scope.test.ts`. Done when guard behavior and bounded ownership pass requirements/engineering review; no customer/draft hook wiring is included here.

### T020 — Customer API adapters

**Outcome and dependencies**: US1, FR-002–009/019/025, OP-01–03 and F01. Depends on T018. The browser consumes only validated customer domain results and uses the existing credential/CSRF/error transport.

**Allowed file actions**: CREATE `apps/web/src/features/customers/api/customers.api.ts` with F01's `customersApi.list/byPhone/get/measurements/create/update`; CREATE `apps/web/src/features/customers/api/customers.api.test.ts`. No hook, UI, contract or transport redesign.

**Read-before-edit context**: `plan.md` OP-01–03; `contracts/customers-drafts.md` §1–7; frontend F01/F02/F04; `docs/engineering/api-contracts.md` §3/4/7 and frontend guide §2/5. Inspect T018's actual `packages/contracts/src/index.ts` exports and current customer HTTP registration/OpenAPI, `apps/web/src/features/administration/api/staff.api.ts` and `.test.ts`, `apps/web/src/features/users/api/users.api.ts`, and `apps/web/src/services/api/api-client.ts` `apiClient`/`parseApiResponse`/`ApiContractError`.

**Ordered steps**:

1. Add exact relative endpoints/methods/bodies and shared return schemas from the contract; `/api/v1` is already in the central base URL. Encode canonical phone once and use stable UUID targets where required.
2. Accept unknown successful payloads and call the existing full-envelope plus domain parser before returning `.data`; do not rely on Axios generics or default records.
3. Forward optional `AbortSignal` on every read and query parameters without changing their canonical meaning. Dispatched creates/updates accept no abort signal or local retry.

**Invariants and failures**: Preserve shared credentials/refresh/CSRF; malformed success rejects as contract failure; 404/409/denied errors remain errors rather than empty/default customer. Do not merge by email or infer a saved selection from submitted phone.

**Verification and done**: The adapter test drives the actual parser with transport-boundary responses: valid list/detail/measurement/command; absent/wrong-type/extra protected output; wrong data kind; phone encoding; read cancellation; rejected duplicate/denied responses. Assert safe parsed data or `ApiContractError`, exact request path/body and forwarded signal; no fictitious success. Run `pnpm --filter @template/web test src/features/customers/api/customers.api.test.ts` and affected `src/services/api/api-client.test.ts`. Done when methods agree with T018's registered contract and all targeted checks/review pass.

### T021 — Draft and private command-receipt API adapters

**Outcome and dependencies**: US3, FR-010–026, OP-01/04–06. Depends on T018. The browser has validated aggregate/read/activity/receipt boundaries without adding submission or browser money authority.

**Allowed file actions**: CREATE `apps/web/src/features/sales/api/drafts.api.ts` with F01's `draftsApi.list/get/changes/activity/create/save`; CREATE `apps/web/src/features/sales/api/sales-commands.api.ts` with `salesCommandsApi.get`; CREATE `apps/web/src/features/sales/api/drafts.api.test.ts` and `apps/web/src/features/sales/api/sales-commands.api.test.ts`.

**Read-before-edit context**: `plan.md` OP-01/04–06; contracts §2–7; data-model §1/3/4; frontend F01–03/F06; API-contract guide §3–7 and frontend §2/5. Read the actual T018 shared exports/routes, existing `staff.api.ts`/test and central transport/parser source. `DraftData`, `DraftCommandData` and discriminated `SalesCommandData` are distinct contracts, not interchangeable after-images/current reads.

**Ordered steps**:

1. Implement exact `GET /sales-drafts`, literal `/sales-drafts/changes`, `/:draftId`, `/:draftId/changes`, actor-private `/sales-commands/:commandId`, and POST/PUT bodies from the contract.
2. Parse all unknown successful envelope/data with the correct shared schema. Preserve `savedDraft`, `receipt`, `replayed`, current `draft`, availability and pagination distinctions.
3. Forward signals on reads only; changes/activity accept page/limit only. Keep writes explicit with one supplied commandId and no signal/automatic retry. No submit/quote API is invented.

**Invariants and failures**: Never send view-only quantity/position/prices/actor/status or persist raw transport payloads. Missing/foreign receipt or draft remains a rejected read; malformed success cannot be a saved claim.

**Verification and done**: Transport-boundary adapter tests cover valid incomplete captures/receipts, nullable date/paid output, strict extra/malformed fields, wrong union kind/IDs, literal activity path, parameters/signals, and 404/409/denied propagation. Run `pnpm --filter @template/web test src/features/sales/api/drafts.api.test.ts src/features/sales/api/sales-commands.api.test.ts` plus `src/services/api/api-client.test.ts` if its boundary is touched by failures. Done when exact producer/consumer shapes and targeted checks/review pass.

### T022 — Customer read hooks and monotonic detail owner

**Outcome and dependencies**: US1, FR-006–007/017–020/025–026, OP-02/07. Depends on T018, T019 and T020. Directory, exact-phone, stable-detail and measurements share the accepted scope/query policy.

**Allowed file actions**: CREATE `apps/web/src/features/customers/hooks/customers.hooks.ts` with F01/F02 `customerKeys`, `useCustomerList`, `useCustomerByPhone`, `useCustomer`, `useCustomerMeasurements`, `customerDetailOptions`; CREATE `apps/web/src/features/customers/hooks/customers.hooks.test.tsx`. Reuse T019 guards and T020 API; no form/command implementation.

**Read-before-edit context**: plan OP-02/07; frontend F01/F02/F04/F08; contract §2–4/6; data-model §4; frontend guide §4/5/7, testing “React form/cache.” Inspect actual scope/API producers, `auth.hooks.ts`, `query-client.ts`, and staff hook monotonic/structural-sharing source and tests.

**Ordered steps**:

1. Build exact actor/accessVersion/epoch roots and canonical child keys from F02; include every actual selector/filter/page. Normalize using shared schemas; invalid selected targets disable requests and expose proper validation/missing state.
2. Guard reads before/after awaiting and at structural publication; forward signal and invoke existing denial reconciliation. Use current-session gating rather than cached erroneous account data.
3. Export one detail-options constructor for observers and later `fetchQuery`. Validate same target; preserve a newer cached version against older replies; accept equal-version refreshed related projections. Retain existing retry/freshness policy, no cross-key placeholder/default array.
4. Apply controlled server-page/out-of-range handling and current-root-safe old-scope cancellation/removal from F02.

**Invariants and failures**: Shared contact does not imply unscoped counts/measurements; errors remain visible; old phone/account results cannot retarget a record or repopulate current queries.

**Verification and done**: Use a real isolated QueryClient and deferred API/transport double. Assert normalized key differences, exact server pages, customer phone resolution, missing/error instead of first fallback, lower-version reply after newer detail, A→B and same-A-new-epoch late replies/cleanup, errored session disabled. Run `pnpm --filter @template/web test src/features/customers/hooks/customers.hooks.test.tsx src/shared/query/operational-scope.test.ts`. Done when F02 current-data rules hold with focused review; backend privacy remains T018 evidence, not claimed from mocks.

### T023 — Draft read hooks and scoped activity

**Outcome and dependencies**: US3 with US5 privacy coverage, FR-007/017–020/025–026, OP-04/08. Depends on T018, T019 and T021. One read owner serves draft list/detail/change/activity consumers with no MVP fallback.

**Allowed file actions**: CREATE `apps/web/src/features/sales/hooks/drafts.hooks.ts` with F01/F02 `draftKeys`, `useDraftList`, `useDraft`, `useDraftChanges`, `useDraftActivity`, `draftDetailOptions`; CREATE `apps/web/src/features/sales/hooks/drafts.hooks.test.tsx`.

**Read-before-edit context**: plan OP-04/08; frontend F01/F02/F06/F08; contracts §3–6; data-model §4 scope/sorts/counts; frontend §4/5/7, contracts guide §6. Inspect T019/T021 outputs, current `SalesDraftsView`, `SalesActivityView`, existing staff hook/query tests and real QueryClient test setup. T022 is not a required import/producer for this task.

**Ordered steps**:

1. Implement accepted list key search/type/customerId/page/limit and exact detail/change/activity keys. Changes/activity page/limit has no invented filters.
2. Apply scope/signal/denial/publication guards and the single exported monotonic draft-detail options builder; no stale lower-version overwrite or unknown-ID new-draft fallback.
3. Preserve server aggregates versus filtered pagination semantics; handle empty/out-of-range pages and propagate availability fields. Derive no warehouse/payment/progress or private counts in browser.

**Invariants and failures**: No cache leakage between owners/epochs/accessVersions; failed read is not empty success; returned saved receipt is not current draft data; no local events or fixture orders.

**Verification and done**: With real QueryClients, exercise A/B and customerId/type/search/page key separation, old epoch/target reply after switch, lower-version draft detail, same-version projection refresh, aborted query, 404/403/malformed response and count/page handling. Run `pnpm --filter @template/web test src/features/sales/hooks/drafts.hooks.test.tsx src/shared/query/operational-scope.test.ts`. Done when exact keys/current-read policy and focused review pass.

### T024 — Frozen write intent, receipt observation and synchronization

**Outcome and dependencies**: US6, FR-009/019–026, OP-03/05–08. Depends on T018–T023, specifically T019/T020/T021/T022/T023. Four concrete writes share one safe lifecycle, and an already saved operation cannot be repeated to repair a failed refresh.

**Allowed file actions**: CREATE `apps/web/src/features/sales/model/sales-command-state.ts`, `apps/web/src/features/sales/model/sales-command-state.test.ts`, `apps/web/src/features/sales/hooks/sales-commands.hooks.ts` and `apps/web/src/features/sales/hooks/sales-commands.hooks.test.tsx`. Implement F01's `SalesCommandIntent`, `SalesCommandVariables`, `SalesSynchronizationError`, `isUnknownSalesWrite`, `useSalesCommand`, `useSalesCommandReceipt`, `synchronizeSalesCommand`. Read/reuse adapter/query/scope producers; no alternative transport or generic mutation framework.

**Read-before-edit context**: plan OP-03/05/06/07/08; frontend F01–03/F07/F08; contracts §3/5/6, data-model §3 replay/after-image rules; frontend guide §5/6/7. Inspect all completed API/read-options producers, existing `StaffSynchronizationError` lifecycle/tests, `reconcileBusinessDenial`, central auth epoch/subject/error classifications, and existing mutation retry defaults.

**Ordered steps**:

1. Define exact four-operation union and frozen in-memory intent: one UUID commandId, parsed payload, update target/base version, originating form token and captured scope. A retry reuses it; no browser storage or credential/payload mutation key.
2. Dispatch only after scope checks; cancel affected pre-write reads and call the proper adapter. Validate result kind and `receipt.operation/commandId/actor.id/resourceId` against the frozen operation; updates bind the exact target.
3. Keep confirmed receipt; use T022/T023 detail options for a current stable-ID fetch whose version is at least receipt.afterVersion. Guard every publication and await F03's invalidations with throwOnError. Old receipt after-image never regresses current data.
4. Throw typed `SalesSynchronizationError` with unchanged confirmed result on skipped/undefined/current-scope failure or read/invalidation failure. Saved-refresh retry performs reads only. Unknown 0/500–504/malformed-success outcome retains frozen intent; manual receipt query is disabled-by-default, no retry, staleTime0/gcTime0. Receipt404 stays unconfirmed; explicit retry uses the identical body/commandId.
5. Distinguish rejection of the current attempt from the outcome of an earlier unknown attempt. A validated operation-specific pre-write/rolled-back rejection means no new write by that attempt only. If an earlier attempt is unresolved, a later 400/403/404/409 (including changed authority or binding conflict) must not imply that earlier write failed or permit a fresh command ID. Retain the frozen unresolved intent/possible-commit state until authorized receipt/current observation resolves it; show current denial without leaking old private state across scope. On a first definitively rejected intent, retain input and permit explicit correction under the normal state rules. Same-form callbacks/notices require successful synchronization in the still-current scope; existing business-denial reconciliation remains the sole session recovery.

**Invariants and failures**: No automatic write retries/new IDs after uncertainty, false rollback, double evidence or saved claim from malformed reply; no late selection/navigation into another form/account; mutation confirmed state and refreshed current state remain distinct.

**Verification and done**: Model tests classify all four operations, current-attempt rejection versus unresolved earlier outcome, and unknown→403-after-revocation / unknown→409-binding-conflict without allocating a new command. Interpret Frontend F03’s rejection shorthand consistently with Spec SC-006/FR-021. Real QueryClient hook tests defer writes/readbacks: duplicate activation, lost reply→receipt404→same-ID retry, replay after a newer revision, wrong actor/target/kind, failed/undefined publication, invalidation rejection and scope change before/after settlement. Assert one command intent, preserved result, read-only sync retry and no old-scope cache/callback. Run `pnpm --filter @template/web test src/features/sales/model/sales-command-state.test.ts src/features/sales/hooks/sales-commands.hooks.test.tsx` plus both read-hook files. Done only after full F03 state transitions and independent requirements/engineering review pass.

### T025 — Customer form, patch, route and error models

**Outcome and dependencies**: US1, FR-002–006/025–027, OP-07. Depends on T018. Pure form behavior is ready for retained create/edit/inline consumers without importing unfinished hooks/APIs.

**Allowed file actions**: CREATE `apps/web/src/features/customers/model/customer-form.model.ts` and `apps/web/src/features/customers/model/customer-form.model.test.ts` implementing F01's typed form/defaults/dirty-patch/route/error interfaces. Reuse contracts/shared form types and existing safe-error normalization. No UI/backend edits.

**Read-before-edit context**: frontend F01/F04/F05 typed-route seam/F07/F08; plan OP-01/07; contracts §2/3/6; frontend §6; API-contract guide §3 raw versus parsed; installed Next `01-app/03-api-reference/05-config/02-typescript.md` “Statically Typed Links.” Inspect existing customer new/edit field behavior, `shared/forms/form.ts` top-level mapper limits and the actual T018 shared captures.

**Ordered steps**:

1. Reuse `customerCaptureSchema` and its raw/output types; defaults are deliberate blanks/current saved data. Preserve requiredness and optional clears. Constraints remain verbatim: “String 1..150 after outer trim, nonblank/no NUL; required”; phone “String at most64 before normalization”; email “Optional/null/blank→null” with existing valid/max320 behavior; address/notes “max2000/4000; no NUL.” Do not duplicate these validators locally.
2. Build update patch from supported dirty fields only; explicit blank/null optional field clears, omission retains. A true no-op returns no command intent.
3. Build only known existing customer route templates after shared phone validation/encoding, returning Next `Route`; any narrow assertion stays within this fixed-template helper. Map only known `body.customer.`/`body.patch.` field paths into the typed target; unsupported authority paths remain general.

**Invariants and failures**: Email reuse never becomes a merge/denial; phone is not internal identity; invalid route data cannot become arbitrary navigation; model cannot fetch/mutate or import an unfinished API/hook.

**Verification and done**: Test Saudi normalized variants, default/clear/omit/no-op patch, maximum/invalid values through shared schema, distinct-phone/shared-email acceptance, correct encoded sales/admin/detail/edit routes, and unknown field-path general error. Run `pnpm --filter @template/web test src/features/customers/model/customer-form.model.test.ts src/shared/forms/form.test.ts`. Done when pure outputs match contract and focused review; no production persistence claim.

### T026 — Draft capture, entry, paper and nested-error models

**Outcome and dependencies**: US3, FR-010–016/023–027, OP-01/08. Depends on T018 and T019; independent of unfinished T020/T021 API/hook files. The exact pure capture/entry boundary is available to paper/editor consumers.

**Allowed file actions**: CREATE `apps/web/src/features/sales/model/draft-form.model.ts` and `apps/web/src/features/sales/model/draft-form.model.test.ts`; MODIFY `apps/web/src/features/orders/order-types.ts` and EXTEND `apps/web/src/features/orders/order-types.test.tsx`. Implement F01/F05 defaults/capture/paper/route/entry/error interfaces, exact `DRAFT_PIECE_CAPTURE_FIELDS`, derived field type and guard; retain existing public order-type presentation exports.

**Read-before-edit context**: plan OP-01/05/08; frontend F01/F05/F07/F08; contracts §2/3/5, data-model §1; frontend §6, code-style type boundaries, installed Next statically typed link guide. Read existing `mvp-types.ts` ProductLine/MvpOrder as view requirements, `empty-line.tsx`, `order-types.ts`, `order-paper-form-props.tsx`, shared forms mapper and actual T018 capture schemas. T019 supplies only scope type; APIs/hooks are not imported.

**Ordered steps**:

1. Implement all explicit `draftReplacementSchema` raw keys/defaults; new SHOP has no customer/date/signature/paid and one blank UUID piece. Reuse shared validations. Quote applicable fixed bounds: piece scalar “Nullable string max200, no NUL”; side/order/repair/adjustment notes “Nullable max4000”; signature “Nullable max150”; paid “at most9 integer digits plus at most2 decimal digits, max999999999.99”; pieces “Required array of1..200 unique UUIDs”; aggregate “UTF-8 length≤262144 bytes.” Do not relax/catalog-validate these provisional captures.
2. Map all sixteen accepted capture fields independently; preserve `soleAddition`/`additions`, nonblank display strings, IDs and type-specific hidden text. Never spread view/status/money/workflow data into wire capture. `toDraftPaper` uses the real owner context and existing presentation shape without invented prices/dates.
3. Implement exact serialized DraftEditorEntry/CustomerPrefill/DraftListEntry parsers and precedence from F05; invalid/repeated/empty edit cannot become new mode. Build validated fixed-template `draftEditRoute():Route`.
4. Implement frozen-submission-ID→current-index nested error mapping and allowlisted field guard; structural mismatch is general feedback. Alias existing `OrderType`/values to shared type/schema options while retaining exact Arabic label/title map.

**Invariants and failures**: Pure/browser-safe models, no API/hook dependency, no array-position identity, float money, client authority, first-record fallback or invalid-edit-to-create path.

**Verification and done**: Test blank complete replacement, every independent captured field/null, exact decimal/date edge cases, raw strict authority rejection, UUID stability/view allowlist, route arrays/empty/bad ID/prefill/status, guard/nested errors after removal/reorder and same accepted seven labels/types. Run `pnpm --filter @template/web test src/features/sales/model/draft-form.model.test.ts src/features/orders/order-types.test.tsx`. Done after schema-aligned outputs and focused review pass.

### T027 — Sales/admin shared customer directories

**Outcome and dependencies**: US1, FR-006/007/017–019/025–027, OP-02/07. Depends on T018 and T022. Existing directories show shared persisted contacts and server-scoped related counts rather than local arrays.

**Allowed file actions**: MODIFY `apps/web/src/features/sales/screens/sales-customers-view.tsx` `SalesCustomersView` and `apps/web/src/features/administration/screens/admin-customers-view.tsx` `AdminCustomersView`; CREATE `apps/web/src/features/sales/screens/sales-customers-view.test.tsx` and `apps/web/src/features/administration/screens/admin-customers-view.test.tsx`. Reuse current `OrientalTable`, `OrientalFilterBar`, headers/classes and direct known-template links; T025 is not required/imported for this bounded task.

**Read-before-edit context**: plan OP-02/07; frontend F01/F02/F04/F06/F07; contract CustomerListData/pagination; frontend §5/7/8 and tests evidence guide. Read actual T022 hooks, both current screens and `features/prototype/components/data-table.tsx` controlled pagination semantics plus `filter-bar.tsx`.

**Ordered steps**:

1. Replace only customer/order reads with current `useCustomerList({search,page,limit:25})`; key rows by stable customer ID, use returned scoped `draftCount`, filtered pagination and `totalCustomers`.
2. Preserve name/phone/email search and optional email/address display. Reset page1 when search changes; pass actual server rows and pagination without a second browser slice/filter.
3. Render loading, true empty/search-empty, missing scope, error/retry and background refresh correctly; generate current encoded-phone routes. Keep admin/sales existing actions/layout; do not add admin create/edit controls.

**Invariants and failures**: No fixture fallback/MVP counts, cross-owner count derivation, fake-empty read failure or unstable phone React key.

**Verification and done**: Render real QueryClient hooks with transport results for two pages, email query, empty success versus 503, scoped draftCount distinct from totalCustomers, and out-of-range recovery. Assert displayed rows/counts/pages and retry, with no local fixtures. Run `pnpm --filter @template/web test src/features/sales/screens/sales-customers-view.test.tsx src/features/administration/screens/admin-customers-view.test.tsx`. Done after preserved layout/behavior review and targeted tests; browser layout proof remains later.

### T028 — Standalone customer create/edit RHF views

**Outcome and dependencies**: US1, FR-002–006/020–027, OP-03/06/07. Depends on T018, T022, T024 and T025. Actual retained forms use confirmed commands, stable identity and explicit stale-data handling.

**Allowed file actions**: MODIFY `apps/web/src/features/sales/screens/sales-customer-new-view.tsx` `SalesCustomerNewView` and `apps/web/src/features/sales/screens/sales-customer-edit-view.tsx` `SalesCustomerEditView`; CREATE `apps/web/src/features/sales/screens/sales-customer-new-view.test.tsx` and `apps/web/src/features/sales/screens/sales-customer-edit-view.test.tsx`. Use local typed inner editor functions if needed; no new surface/component family, auth protocol, master/order-rewrite or route redesign.

**Read-before-edit context**: plan OP-03/06/07; frontend F01–04/F05 reset annotation/F07; contracts §2/3/5/6; data-model §3; frontend guide §6/7/8. Read T022/T024/T025 outputs, current fields and route wrappers, `shared/forms/form.ts`, existing `users/components/profile-form.tsx` clean-reset/`use no memo` boundary, and installed React Compiler/typed-link guidance.

**Ordered steps**:

1. Resolve edit phone to one stable C and mount defaults only after authoritative load; missing never becomes blank editor. Key editor by identity/scope/record, use shared-schema RHF and narrow compiler opt-out for actual form function.
2. Create or dirty-field PATCH through T024's frozen command, actual ID/base revision and T025 mapping. Disable conflicting inputs/submits while pending; no-op does not dispatch.
3. On confirmed synchronized result navigate to C's current validated phone route. Duplicate conflict resolves accessible actual C and keeps form; duplicate email warning never blocks. Background change retains dirty input; stale edit requires explicit reload/review.
4. Correct existing copy that calls phone internal identity or promises historic snapshot rewriting; preserve markup/classes/labels, add associated errors/focus/request ID and one notice owner.

**Invariants and failures**: Preserve the saved record/links after rejection, unsaved values after recoverable error, and old selection/record target after phone reassignment. No false success on unknown/sync error or new command to refresh a confirmed write.

**Verification and done**: Test valid create without optional fields, shared email, phone duplicate, optional clears, same stable C after phone update, cached-error/missing load, dirty background update, CAS conflict/reload, reset-then-edit registration, pending double submission and saved-refresh-incomplete retry. Run `pnpm --filter @template/web test src/features/sales/screens/sales-customer-new-view.test.tsx src/features/sales/screens/sales-customer-edit-view.test.tsx src/features/customers/model/customer-form.model.test.ts`. Done after real RHF/Query interaction outcomes and requirements/engineering review pass.

### T029 — Scoped customer draft and measurement panels

**Outcome and dependencies**: US5, FR-006–007/017–019/025–027, OP-02/04/07/08. Depends on T018, T022, T023, T025, T043 and T044. Shared contacts no longer reveal another salesperson's related work or falsely approved measurements.

**Allowed file actions**: MODIFY `apps/web/src/features/sales/screens/sales-customer-detail-view.tsx` `SalesCustomerDetailView` and `apps/web/src/features/administration/screens/admin-customer-detail-view.tsx` `AdminCustomerDetailView`; CREATE `apps/web/src/features/sales/screens/sales-customer-detail-view.test.tsx` and `apps/web/src/features/administration/screens/admin-customer-detail-view.test.tsx`. No P08 admin order/detail implementation or new editor.

**Read-before-edit context**: plan OP-02/04/04A/07/08; frontend F02/F04/F06/F07/F08/F10; contracts §7; contracts §3/4, data-model §4 exact scopes/sorts/summary meanings; frontend §5/7/8. Read current details, `mvp-selectors.ts` `getCustomerSizeProfile` only to identify removed authority, actual read hooks and CustomerData.latestMeasurement/submittedHistory shapes.

**Ordered steps**:

1. Replace first-customer fallback with exact phone→stable-ID read and true loading/error/missing handling.
2. Bind related cards/counts to useCustomerDrafts and measurements under F10; use actual latestMeasurement and separate paged provisional history. Label source DRAFT/provisional rather than approved; later submitted-history availability remains explicit.
3. Preserve cards/contact/notes/actions and per-piece captured information without manufacturing/warehouse/progress invention. Admin draft links use retained sales draft/detail/edit paths allowed to ADMIN, not the local P08 order detail.
4. Remove local order/size-profile/count reads from both converted views; control server pages and current phone routing.

**Invariants and failures**: Customer sharing grants contact access only; browser cannot widen summary/history scope. Unknown ID/empty/error never displays another customer or demo orders.

**Verification and done**: Supply A/B-linked resources with server projections containing only permitted A records versus broader ADMIN projection. Assert only provided scoped IDs/counts/latest measurement, provisional labels, paged history, P03 unavailability and correct real-draft links. Reject missing/error reads visibly. Run `pnpm --filter @template/web test src/features/sales/screens/sales-customer-detail-view.test.tsx src/features/administration/screens/admin-customer-detail-view.test.tsx src/features/customers/hooks/customers.hooks.test.tsx src/features/sales/hooks/drafts.hooks.test.tsx`. Done when actual rendered consumer behavior/review passes; real HTTP owner denial remains backend/browser evidence.

### T030 — Compatible shared-paper draft state and error focus

**Outcome and dependencies**: US3, FR-012–016/023–027, OP-08. Depends on T018 and T026. Existing paper accepts explicit P02 capture/unpriced/options/focus state without altering its default unconverted callers.

**Allowed file actions**: MODIFY `apps/web/src/features/orders/components/order-paper-form-props.tsx`, `apps/web/src/features/orders/components/order-paper-form.tsx`, `apps/web/src/features/orders/components/order-paper-form-screen.tsx`, `apps/web/src/features/orders/components/product-table.tsx`, `apps/web/src/features/orders/components/cell.tsx`, `apps/web/src/features/orders/components/side-table.tsx`, `apps/web/src/features/orders/components/paper-size-table.tsx`, `apps/web/src/features/orders/components/paper-finance.tsx`, `apps/web/src/features/orders/components/paper-cell-select.tsx`; CREATE `apps/web/src/features/orders/draft-paper-state.test.tsx`; EXTEND `apps/web/src/features/orders/order-price-non-editable.test.tsx`, `apps/web/src/features/orders/order-mixing-text-fields.test.tsx`, `apps/web/src/features/orders/side-table-columns.test.tsx`, `apps/web/src/features/orders/order-print-rows.test.tsx` and `apps/web/src/features/orders/components/paper-cell-select.test.tsx`. No CSS/layout or lifecycle-owner rewrite.

**Read-before-edit context**: plan OP-08; frontend F01/F05/F07/F08, especially shared-paper compatibility/nested errors; contracts capture/availability fields; frontend guide §6/8, code-style type-boundary rules, testing render versus browser evidence. Inspect all allowed paper files, existing `paper-cell-select-menu.tsx` custom-entry/portal behavior, current `ORDER_PAPER_COLUMNS`, `paper-options.ts`, and immediate read-only/print callers `apps/web/src/features/printing/screens/print-order-view.tsx`, `apps/web/src/features/approval/screens/approval-decision-view.tsx`, `apps/web/src/features/administration/screens/admin-order-detail-view.tsx`, `apps/web/src/features/manufacturing/screens/manufacturing-order-detail-view.tsx`.

**Ordered steps**:

1. Add F05's optional discriminated dataState and exact eight-key DraftPaperOptions exports at the existing props/entry owner. Integrated draft has explicit empty suggestions; default callers retain current defaults.
2. Forward state through actual paper tables/cells/finance; draft state bypasses local totals/zero fallback and displays unavailable unit/row/order total/balance, retaining only provisional paid input. Keep controls/column positions, distinct soleAddition/additions and text fields.
3. Omit fake signature/general-note/Hijri/creation facts in integrated draft, retain unsaved technical header and transient boxes. Do not persist boxes, activate catalog, grant official print or change default callers.
4. Forward optional field messages/element callbacks through the exact input/combobox boundaries; preserve internal trigger ref/escape focus while adding invalid/description associations and first-error focus support. Keep first-row A/F/side-note placement and all row IDs.

**Invariants and failures**: No sample-price/catalog fallback, new paper/design, price editability, disabled factory redaction or broad changed print output. No hidden cast validates captured rows.

**Verification and done**: New draft-paper test renders blank/unpriced capture, custom provisional menu entry with no options, all independent text/floor/A/F fields, paid capture, nested error focus and blank factual fallbacks. Extend existing tests to assert non-P02 defaults and 1/8/9/17-row print family unchanged. Run `pnpm --filter @template/web test src/features/orders`. Done when component regressions and requirements/engineering review pass; real portal/browser layout/focus remain later harness acceptance.

### T031 — Atomic incomplete-paper, inline-customer and immediate-caller integration

**Outcome and dependencies**: US3 with US2 workflow implementation, FR-002/006/008–016/019–027, OP-05–08. Depends on T018, T022, T023, T024, T025, T026 and T030. One bounded existing paperworkflow adopts the prepared read/command/models/paper seams together. The dialog, selection section and their actual parent caller change atomically, so a completed task leaves no required-prop/type/runtime break or temporary local-store compatibility path.

**Allowed file actions**: MODIFY `apps/web/src/features/sales/screens/sales-create-order-view.tsx` `SalesCreateOrderView`, `apps/web/src/features/sales/screens/inline-customer-modal.tsx` `InlineCustomerModal`, `apps/web/src/features/sales/screens/sales-customer-section.tsx` `SalesCustomerSection`, `apps/web/src/features/sales/screens/sales-order-metadata-section.tsx` `SalesOrderMetadataSection`, and `apps/web/src/features/sales/screens/empty-line.tsx` only if needed to reuse the accepted blank-piece adapter/remove obsolete integrated use; MODIFY `apps/web/src/app/(workspace)/sales/orders/new/page.tsx` and `apps/web/src/app/(workspace)/sales/orders/[orderId]/edit/page.tsx`; CREATE `apps/web/src/features/sales/screens/sales-create-order-view.test.tsx`, `apps/web/src/features/sales/screens/inline-customer-modal.test.tsx`, `apps/web/src/features/sales/screens/sales-customer-section.test.tsx` and `apps/web/src/features/sales/screens/sales-order-metadata-section.test.tsx`. Own-order/dashboard reads belong to T034. Do not add another app component family, endpoint, source of line state or compatibility mock.

**Read-before-edit context**: `plan.md` OP-05–08; `frontend-design.md` F01–05/F07/F08 (exact modal/selection/entry/form interfaces and F03 intent state machine); contracts §2/3/5/6 and data-model §1/3. Read actual T022/T023 query options, T024 command/receipt lifecycle, T025 customer model, T026 draft model and T030 compatible shared-paper props; current create/modal/section/metadata sources and both page wrappers; existing profile RHF reset pattern; `apps/web/AGENTS.md`; installed Next server/client/use-client/searchParams/typed-link/ReactCompiler guidance. Apply frontend guide §3–8 and testing real form/QueryClient boundary rules. Hooks, models and optional paper props are already produced; this task chooses no new wire/cache/authority design.

**Ordered steps**:

1. Adapt the thin server wrappers and actual parent view together to the accepted serialized DraftEditorEntry parser. Await only route/search params; invalid/missing/foreign edit never becomes a new form. Valid customer prefill resolves exact phone, while missing/invalid prefill remains visibly unselected and optional.
2. Mount one scope/record-keyed RHF editor after authoritative load with the narrow compiler annotation, shared replacement schema and one controlled pieces field. New SHOP/one blank UUID/customer-null/empty dates/signature/paid is valid. Pass actual draft owner name read-only; an ADMIN editor is an actor, not a replacement owner.
3. Implement actual add/duplicate/remove handlers in that RHF capture using accepted UUID/copy/one-row rules. Use the T026 allowlist and T030 paper dataState/options/error-focus seam; preserve independent fields, M1/M2/M3/face/additions, soleAddition, A/F placement and hidden type text. Remove independent lines/currentTotals/local save authority.
4. Change InlineCustomerModal, SalesCustomerSection and their immediate SalesCreateOrderView bindings in the same task to F04's exact interfaces. Modal owns its RHF customer capture and the prepared shared command, not addCustomer/submitted text. Section controls query/results/explicit selection/clear; typing a name alone never supplies customerId. No unsent create/cancel action saves the paper.
5. For inline success, read the synchronized current C, bind matching receipt target/version/origin scope/form token, then select its stable ID in the unchanged paper and close/restore trigger focus. Duplicate customer requires explicit existing-record selection. Failed validation/duplicate/create preserves dialog values, previous selection and paper. Unsent cancel/Escape closes only dialog with zero writes; pending cannot claim rollback. Suppress late callback into another form/account.
6. Both paper Save buttons share one synchronous intent latch and T024 create/save protocol. Lock conflicting controls while pending/reconciling; preserve frozen input after rejected/unknown/sync-incomplete result. Confirmed synchronized new draft changes to its stable edit URL; subsequent saves retain ID/base revision. No blind overwrite or new command for refresh.
7. Disable existing real-submit triggers with P03 readiness explanation and no transition. Remove fixed date/actor/price facts and repair-bypass copy, retain existing layout/dialogs/portal controls. Standalone customer producer/consumer interfaces remain unchanged from T028.

**Invariants and failures**: No broken required-prop caller remains at task completion. No customer/specification/catalog/business-number prerequisite for incomplete save; no initial missing-edit fallback; no implicit paper save, first-name match, fabricated customer, money/owner/status authority, second state store, permissive legacy callback or late-account publication. Retain one notice owner and existing Arabic/RTL/focus behavior.

**Verification and done**: Add basic real parent/form save smokes and narrow modal/selection binding tests sufficient to prove the atomic interface change: blank save, missing edit/prefill, same-tick header/sticky Save, pending lock, confirmed C selection without paper write, normal cancel, failed save retaining input, synchronized reset then edit, and no default fixture path. Do not duplicate T032's full inline uncertainty/privacy journey or T033's row-regression matrix. Run `pnpm --filter @template/web test src/features/sales/screens/sales-create-order-view.test.tsx src/features/sales/screens/inline-customer-modal.test.tsx src/features/sales/screens/sales-customer-section.test.tsx src/features/sales/screens/sales-order-metadata-section.test.tsx src/features/sales/model/draft-form.model.test.ts src/features/orders/draft-paper-state.test.tsx` and `pnpm --filter @template/web check-types` after inspecting generated-type effects. Done only when the immediate dialog/selection/parent/page interfaces agree, focused interaction checks and typecheck pass, and both requirements/engineering reviews pass. Real persistence/relogin/browser focus remain their actual evidence boundary.

### T032 — Inline customer flow through the actual paper

**Outcome and dependencies**: US2, FR-006/008–009/020–027, OP-06/07/08. Depends on T018 and T031. The actual integrated paper/dialog/selection/command flow receives focused US2 regression proof after its atomic producer/caller implementation; this task introduces no new UI or command design.

**Allowed file actions**: CREATE only `apps/web/src/features/sales/screens/inline-customer-flow.test.tsx`. Existing application/model/hook/test files are READ/REUSE only. If a genuine application defect is found, report its exact T031 or earlier producing-owner correction rather than edit production through this test-only task or weaken the assertion.

**Read-before-edit context**: plan OP-06–08; frontend F02/F03/F04/F07/F08; contracts customer command/current-read/receipt and duplicate/error semantics; data-model §3 after-image/replay. Read actual T031 SalesCreateOrderView/InlineCustomerModal/SalesCustomerSection, T024 command/receipt state, T022 current detail options and T025 models, plus their basic producer tests to avoid duplication. Follow testing “Choose the correct evidence,” “Construct meaningful cases” and cleanup; use a real isolated QueryClient, actual parent/dialog/RHF/components, and doubles only at the transport boundary.

**Ordered steps**:

1. Mount the actual paper, type representative notes/row captures and open inline creation. Return a normalized saved customer whose actual name/phone/ID differs from the raw input; complete its current-resource synchronization. Assert the actual C is selected, all original paper values survive, zero draft writes occurred, and only a later explicit paper save sends C's stable ID.
2. Drive unsent cancel and duplicate-phone explicit choose-existing paths. Assert no customer/draft write on cancel and no silent duplicate selection/merge; an error leaves the prior selected customer and both form inputs intact.
3. Defer a customer write and synchronization: prove pending lock, then lost reply/receipt observation or confirmed-write refresh failure. Retry only the accepted observation/same-intent path and verify no extra create; one accurate uncertainty/confirmed-incomplete notice remains until reconciled.
4. Navigate/remount the originating paper or change account/epoch before a deferred successful reply. Assert no late selection, success notice or navigation in the replacement paper/account, while scoped shared settlement follows the prepared hook protocol.
5. Exercise retained dialog keyboard close/focus restoration in the ordinary successful/cancelled paths without claiming jsdom proves real browser layout/focus.

**Invariants and failures**: Use real forms/QueryClient/parser behavior rather than a fake parent callback-only harness. No mock local persistence, new compatibility layer, raw input identity, implicit paper save, arbitrary sleep/retry or copied unit tests. The test controls request completion, not business outcomes inside the claimed frontend boundary.

**Verification and done**: Run `pnpm --filter @template/web test src/features/sales/screens/inline-customer-flow.test.tsx` and the T031 basic modal/create-form files as affected regression. Release deferred requests, unmount all roots and clear the test-owned QueryClient/timers in teardown. Done when every full-flow branch has meaningful observable assertions and passes test/requirements/engineering review. Any unresolved producer defect keeps this task open; real database/HTTP/browser claims remain T018 and T038–T040.

### T033 — Controlled row and error-identity interaction regressions

**Outcome and dependencies**: US4, FR-012/015–016/020–021/025–027, OP-05/08. Depends on T018 and T031. Real controlled editor interaction proves row lifecycle; do not create a second set of pure mapper tests.

**Allowed file actions**: EXTEND `apps/web/src/features/sales/screens/sales-create-order-view.test.tsx` and `apps/web/src/features/orders/draft-paper-state.test.tsx`. If these observable regressions uncover an in-scope defect, MODIFY only `apps/web/src/features/sales/screens/sales-create-order-view.tsx`, `apps/web/src/features/sales/model/draft-form.model.ts` and the T030 listed paper component files needed by the failing boundary; no new row architecture or requirement change.

**Read-before-edit context**: plan OP-05/08; frontend F05 row/error algorithms/F08; contracts piece IDs/one-row/omission; spec US4 examples; testing “Construct meaningful cases” and test-guard rules. Read T031 actual handlers/paper callbacks, T026 identity/error mapping and existing pure tests to avoid duplicating them.

**Ordered steps**:

1. Through rendered controls, fill P1/P2 differently, duplicate P1, remove P2, resequence and save; inspect the outgoing accepted capture and server-confirmed reopening.
2. Assert retained P1 ID, new copy ID, exact copied sixteen fields, independent middle/final addition and no copied prices/workflow; removed IDs remain absent and last-row remove remains unavailable.
3. Use deferred failed save with nested piece error and a controlled current-row mismatch; verify errors bind to the submitted stable piece or remain general, never to a different row. Verify pending operations cannot double-add/save and local row notices are not persisted claims.

**Invariants and failures**: Stable physical identity survives display order, and local row edits are durable only after explicit confirmed save. Keep tests focused on user-visible result/wire intent, not handler invocation count or internal array implementation.

**Verification and done**: Run `pnpm --filter @template/web test src/features/sales/screens/sales-create-order-view.test.tsx src/features/orders/draft-paper-state.test.tsx`. Use real paper/form plus transport boundary double, restore deferred work and QueryClient. Done when cases would fail for UUID reuse, wrong-row removal/error or unintended field loss, and all correction regressions/reviews pass.

### T034 — Drafts, all-orders and dashboard P02 reads

**Outcome and dependencies**: US3, FR-010/017–019/024–027, OP-04/08. Depends on T018, T022, T023, T025, T026 and T031. Reached sales read portions show real drafts and truthful later-phase unavailability.

**Allowed file actions**: MODIFY `apps/web/src/features/sales/screens/sales-drafts-view.tsx`, `apps/web/src/features/sales/screens/sales-all-orders-view.tsx`, `apps/web/src/features/sales/screens/sales-dashboard-view.tsx` and `apps/web/src/app/(workspace)/sales/orders/page.tsx`; CREATE `apps/web/src/features/sales/screens/sales-drafts-view.test.tsx`, `apps/web/src/features/sales/screens/sales-all-orders-view.test.tsx` and `apps/web/src/features/sales/screens/sales-dashboard-view.test.tsx`. Reuse existing KpiGrid/filters/tables/headers; no P03 order submission, returned queue or P04 contact-problem implementation.

**Read-before-edit context**: plan OP-04/08; frontend F02/F05 entry/F06/F07/F08; contracts DraftListData totals/search/page semantics and CustomerListData; data-model §4; frontend §3/5/7/8. Read actual T022/T023 hooks, T025 routes/T026 list-entry helpers, current three screens/page and `features/prototype/components/kpi-cards.tsx` existing string-or-number value plus controlled table API.

**Ordered steps**:

1. Bind drafts list and All/Draft order-list status to paged scoped drafts with retained search/type filters. Parse awaited status entry in the thin page; later/invalid status shows explicit readiness/error without a misleading empty query or fixtures.
2. Use server technical reference, pieceCount and nullable customer/date; edit/reopen routes use real draft IDs. No fixed salesperson-name filters or browser authority/counts.
3. Dashboard draft KPI uses returned totalDrafts/totalPieces; recent query uses page1/limit5, shared newest customers page1/limit4. Retain later KPI geometry with `—`/unavailable copy, and remove local contact/returned/manufacturing rows from the converted view rather than invent zero/live history.
4. Preserve navigation/layout; render loading/empty/error/retry separately and controlled pagination without double-slicing.

**Invariants and failures**: No combined real/local records, fabricated factory progress/warehouse state, changed schema filter or new phase behavior.

**Verification and done**: Test server pages/search/type/customer-empty records, total aggregates versus text-filtered page counts, invalid/repeated status, later status readiness, dashboard 5/4 limits and unavailable cards, errors and old-owner replies. Run `pnpm --filter @template/web test src/features/sales/screens/sales-drafts-view.test.tsx src/features/sales/screens/sales-all-orders-view.test.tsx src/features/sales/screens/sales-dashboard-view.test.tsx`. Done after read-consumer scope/presentation review and discovered interaction checks pass.

### T035 — Real draft detail/history and scoped sales activity

**Outcome and dependencies**: US5 with US3 draft-read coverage, FR-017–019/024–027, OP-04/08. Depends on T018, T023, T026, T030 and T031. Reached draft/detail/history consumes the actual authorized record rather than fake tracking or events.

**Allowed file actions**: MODIFY `apps/web/src/features/sales/screens/sales-order-detail-view.tsx` `SalesOrderDetailView` and `apps/web/src/features/sales/screens/sales-activity-view.tsx` `SalesActivityView`; CREATE `apps/web/src/features/sales/screens/sales-order-detail-view.test.tsx` and `apps/web/src/features/sales/screens/sales-activity-view.test.tsx`. Existing detail tabs/paper/page wrappers are reused; no P04 printing or shared manufacturing tracking rewrite.

**Read-before-edit context**: plan OP-04/08; frontend F02/F05/F06/F07/F08; contracts DraftDto/DraftChangesData/current availability; data-model §4; frontend §5/7/8. Read actual query/paper/model producers, current two views, `features/orders/components/order-detail-tabs.tsx`, `features/prototype/components/order-tracking-view.tsx` and its metrics/location callers to identify data that must not be inferred for drafts.

**Ordered steps**:

1. Resolve detail through authorized draft query; safe missing/denied/error never resolves local records. Retain tabs and use read-only P02 paper with real owner/customer/captures.
2. Draft tracking explicitly says unsubmitted/no manufacturing; do not invoke a projection that invents movement/progress/warehouse state. Official-print action stays unavailable with explanation, and edit uses stable accepted route.
3. Bind detail history to paged draft changes and global activity to page/limit-only scoped activity; use real actor/time/changed fields. Remove local fixed-name/role/event filtering; later non-draft history remains explicit unavailable.

**Invariants and failures**: B cannot receive A's record/history via ID or cache; read-only draft must not acquire approval/print eligibility, financial authority or sample timeline.

**Verification and done**: Render actual query/paper consumers with A/B/ADMIN projections, missing/error and old-epoch responses; assert only scoped returned changes, pagination, no invented tracking/price/print, actual actor/date and preserved tabs. Run `pnpm --filter @template/web test src/features/sales/screens/sales-order-detail-view.test.tsx src/features/sales/screens/sales-activity-view.test.tsx` plus draft hook/paper tests if modified. Done after targeted tests and both review dimensions pass; real permission proof remains backend/browser.

### T036 — Cross-consumer late, retry, synchronization and dirty-state regressions

**Outcome and dependencies**: US6, FR-009/019–027, OP-06–08. Depends on T018, T024, T028, T029, T031, T032, T033, T034 and T035. Coordinated consumer cases close shared-state risks without redesigning resolved policy.

**Allowed file actions**: EXTEND `apps/web/src/features/sales/hooks/sales-commands.hooks.test.tsx`, `apps/web/src/features/customers/hooks/customers.hooks.test.tsx`, `apps/web/src/features/sales/hooks/drafts.hooks.test.tsx`, `apps/web/src/shared/query/operational-scope.test.ts`, `apps/web/src/features/sales/screens/sales-customer-edit-view.test.tsx`, `apps/web/src/features/sales/screens/inline-customer-modal.test.tsx`, `apps/web/src/features/sales/screens/sales-create-order-view.test.tsx`, `apps/web/src/features/sales/screens/sales-order-detail-view.test.tsx`, and `apps/web/src/features/administration/screens/admin-customer-detail-view.test.tsx`. Required bug corrections are limited to `apps/web/src/shared/query/operational-scope.ts`, `apps/web/src/features/customers/hooks/customers.hooks.ts`, `apps/web/src/features/sales/hooks/drafts.hooks.ts`, `apps/web/src/features/sales/hooks/sales-commands.hooks.ts`, `apps/web/src/features/sales/model/sales-command-state.ts`, `apps/web/src/features/sales/screens/sales-customer-edit-view.tsx`, `apps/web/src/features/sales/screens/inline-customer-modal.tsx`, `apps/web/src/features/sales/screens/sales-customer-section.tsx`, `apps/web/src/features/sales/screens/sales-customer-detail-view.tsx`, `apps/web/src/features/sales/screens/sales-create-order-view.tsx`, `apps/web/src/features/sales/screens/sales-order-detail-view.tsx` and `apps/web/src/features/administration/screens/admin-customer-detail-view.tsx`. Only the failing accepted boundary may be corrected; no unrelated transport/auth/spec/plan/checklist edit.

**Read-before-edit context**: plan OP-06/07/08 and verification matrix; frontend F02/F03/F04/F05/F07/F08; contracts receipt/current-after-image distinction and 404/409 codes; data-model §3/4; frontend §5–7, testing meaningful-case/cleanup and code-review procedure. Read complete actual owners/callers and earlier tests, including T032 `apps/web/src/features/sales/screens/inline-customer-flow.test.tsx`, before adding another assertion; avoid duplicating the completed US2 flow or already sufficient pure tests.

**Ordered steps**:

1. Exercise one real QueryClient across a mounted editor, related detail/list and deferred command/read replies; verify current scopes at dispatch, commit and callback, including same-user/new-epoch old cleanup.
2. Drive lost write reply→receipt absent→identical retry and committed receipt→failed current read/invalidation→read-only refresh. Assert exact frozen intent/no extra create, retained confirmed result and honest UI; no next-account notice/selection.
3. Drive dirty background refetch and two-version conflict through actual form input; input survives until explicit reload/review. During pending/reconciliation attempted edits/row actions are locked, not accepted then erased. Test newer cached revision versus old replay after-image.
4. Correct any required defect in the listed owning production path using the fixed design; rerun affected prior cases and retain meaningful assertions. A material architecture/product gap is reported, not invented under this task.

**Invariants and failures**: No request-count-only pseudo-persistence, blanket retries/sleeps, stale account private rendering, duplicate saved event, silent last-write-wins or falsely successful refresh.

**Verification and done**: Use deferred transport completions and real components/QueryClient; close every observer/client and release all pending work in teardown. Run `pnpm --filter @template/web test src/shared/query/operational-scope.test.ts src/features/customers/hooks/customers.hooks.test.tsx src/features/sales/hooks/drafts.hooks.test.tsx src/features/sales/hooks/sales-commands.hooks.test.tsx src/features/sales/screens/sales-customer-edit-view.test.tsx src/features/sales/screens/inline-customer-modal.test.tsx src/features/sales/screens/sales-create-order-view.test.tsx src/features/sales/screens/sales-order-detail-view.test.tsx src/features/administration/screens/admin-customer-detail-view.test.tsx`. Done when each named observable regression passes, affected corrections receive requirements and engineering review, and browser-only claims remain unperformed until later tasks.

### T037 — Frontend acceptance review and fresh web checks

**Outcome and dependencies**: FR-001–027, VR-003/005, SC-001–008 at the frontend/component boundary. Depends on T018 and all T019–T036. Establish the integrated frontend group status before later real-stack browser acceptance; this is not whole P02/release acceptance.

**Allowed file actions**: APPEND actual frontend verification/review evidence to `specs/002-shared-customers-drafts/tasks.md`, preserving all task IDs/markers/content except verified in-scope completion. READ all T019–T036 source/tests/callers. No spec/plan/checklist-marker changes, new product design, unrelated fixes or browser suite implementation. A required correction returns to its precise owning accepted task and affected recheck.

**Read-before-edit context**: plan backend/frontend groups and verification/review/producing-stage handoff; frontend F01–F09; all accepted contract/data boundaries; `docs/engineering/code-review.md` §1–4; frontend §1/9; testing “Commands and their limits”/“Review and completion evidence”; manifests and runner configs. Recheck backend T018 evidence and actual current worktree, imports/callers, no-fallback/UI preservation and source/interface agreement.

**Ordered steps**:

1. Assess REQUIREMENTS and ENGINEERING separately across every converted customer/draft/paper/read/command path, including rejected/unknown/conflict paths and non-P02 shared-paper callers. Record concrete findings or clean evidence; optional skills supplement owning guides.
2. Run focused changed frontend owners plus affected auth/transport/shared-form/query/paper regressions; then full web unit suite, lint, typecheck and build. Run both actual harness typechecks; do not count them as browser execution.
3. Record exact commands/discovery/results/warnings/fresh versus cached evidence and remaining browser/phase/release gates in the existing tasks evidence owner. Do not mark pass after an omitted suite or reuse an old run as fresh.

**Invariants and failures**: Real backend gate stays prerequisite; green component tests do not prove HTTP persistence/browser focus, production mail or release. Preserve dirty worktrees and do not run root `pnpm verify` merely for a report because it writes Prisma/generated/build artifacts.

**Verification and done**: Run `pnpm --filter @template/web test`, `pnpm --filter @template/web lint`, `pnpm --filter @template/web check-types`, `pnpm --filter @template/web build`, `pnpm --filter @template/web check:e2e-types`, `pnpm --filter @template/api check:e2e-types`, and `git diff --check`; run `pnpm exec prettier --check "apps/web/src/features/customers/**/*.{ts,tsx}" "apps/web/src/features/sales/**/*.{ts,tsx}" "apps/web/src/features/orders/**/*.{ts,tsx}" apps/web/src/shared/query/operational-scope.ts apps/web/src/shared/query/operational-scope.test.ts "apps/web/src/features/administration/screens/admin-customer*.tsx" "apps/web/src/app/(workspace)/sales/orders/**/page.tsx" specs/002-shared-customers-drafts/tasks.md`. These are read-only formatting checks; an unrelated pre-existing formatting issue does not authorize broad formatting/fixes. The web typecheck runs `next typegen` and build generates output: inspect worktree and preserve unrelated edits first. Later browser fixtures/processes remain owned by T038–T040; here unmount/clear test-owned QueryClients and close deferred work. Done only when both frontend review verdicts and required fresh checks pass with accurate remaining browser/whole-phase/release status.

### T038 — Prove shared customers through the real browser stack

- **Outcome / requirements / dependencies**: US1, FR-002–007/019/025/027 and SC-001/005/008 have real retained-surface evidence. Dependencies: T018 and T037. T038 creates only the browser test owner and bounded local helpers reused by T039/T040; no application implementation is authorized by this brief.
- **Allowed file actions**: CREATE `apps/web/e2e/customer-drafts.spec.ts`. Keep fixture helpers local to this file: `signInP02(page: Page,email: string,password: string): Promise<void>` and `createSalesBrowser(browser: Browser,adminPage: Page,label: string): Promise<SalesBrowser>`, with local `SalesBrowser = Readonly<{context: BrowserContext;page: Page;email: string;password: string}>`. Do not modify `playwright.config.ts`, global setup, runtime manifest policy or production endpoints; no cross-file helper extraction is needed.
- **Read-before-edit bundle**: Spec US1/US5 and concrete phone/optional/duplicate/missing examples; plan OP-02/03/07 and Verification infrastructure; Contracts §§2–5; Frontend F04/F07/F08. Read `apps/web/e2e/staff-identity.spec.ts` local register/sign-in/approval flow, `apps/web/e2e/runtime.ts` exported `readE2eRuntime`/`waitForCapturedAction`, `apps/web/e2e/global-setup.ts`, `apps/web/playwright.config.ts`, and final T027/T028/T029 accessible customer surfaces. Engineering testing Browser harness/Cleanup/test integrity and code-review evidence rules apply. Existing staff helper functions are private, and the harness does not supply active sales A/B.
- **Ordered steps**:
  1. Use only the harness-owned origins, ADMIN identity and captured verification URL for exact synthetic `.test` recipients. The local helper registers through the real P01 UI, confirms captured verification and has ADMIN approve the employee into SALES. Create isolated contexts and close them in `finally`; never log credentials/action URLs or access the database from the browser test.
  2. Add tests named with `P02-C1` for both configured projects. Use deterministic per-project synthetic Saudi phones and distinct recipients. Create C with name/phone only; distinguish missing optional fields from an invented empty identity.
  3. Assert shared discovery by another eligible sales account, name/phone/case-insensitive email search, formatting-equivalent duplicate rejection without a second customer, email reuse with a distinct phone, phone edit preserving C's observed stable identity, and honest unknown-phone missing state. Keep contact duplicate hints explicit rather than automatic merge/selection.
  4. Observe strictly validated real server responses when stable IDs are needed; use shared contract schemas and actual UI requests, never fixture database reads or array positions. Exercise dialog keyboard/focus and retained Arabic/RTL/Cairo on desktop/narrow without image artifacts.
- **Preserve / failure unchanged**: No intercepted happy-path success, developer server/database/mail, real SMS/email, screenshot/trace/video artifact, arbitrary sleeps or retries. On a duplicate/stale/invalid result, the prior customer data remains and input is visible. Current account/auth flows remain covered by their existing browser spec.
- **Tests / verification**: Later run `pnpm --filter @template/web check:e2e-types`, `pnpm --filter @template/api check:e2e-types`, then `pnpm --filter @template/web test:e2e e2e/customer-drafts.spec.ts --grep P02-C1`. Docker, Chromium and the harness-owned migrated PostgreSQL/API/Next processes are required. Inspect both project results and owned teardown, not only exit code. Missing prerequisites leave browser evidence unperformed; no alternative data target is permitted.
- **Done when**: The real customer journey and negative/missing/duplicate outcomes pass on both existing profiles, synthetic contexts/resources are released and concise actual results/limits are recorded in this tasks file. Requirements and test-quality review pass; this does not yet establish US2–US6 or release.

### T039 — Prove inline linking, incomplete drafts and piece identity after relogin

- **Outcome / requirements / dependencies**: Primary US3 plus US2/US4, FR-008–016/023–027 and SC-002/003/005/007/008. Dependencies: T018, T037 and T038. This is real cross-layer acceptance of the already implemented paper, not a second form implementation.
- **Allowed file actions**: EXTEND `apps/web/e2e/customer-drafts.spec.ts` with cases named `P02-C2` and its existing local helpers from T038. No shared runtime/configuration or application-file changes here; any product defect returns to its owning prior task.
- **Read-before-edit bundle**: Spec US2/US3/US4, concrete blank/capture/date/paid/inline/piece examples; plan OP-05/07/08; Contracts §3 capture and command shapes; Data §§1/3; Frontend F03–F05/F08. Read T030/T031/T032/T033 final component/tests, T038 local helper signatures, runtime/global setup and existing searchable menu/paper interactions. Testing real-boundary/browser/cleanup and test-guard criteria apply.
- **Ordered steps**:
  1. Provision an eligible synthetic sales account through the T038 helper. Save SHOP with one blank row and no customer/specification/date/paid entry. Observe the real saved ID/version/piece response; after actual sign-out/sign-in or another owned session, reopen the exact stable draft and compare its saved state.
  2. In a partially filled paper, open inline creation and cancel before dispatch: assert no customer or paper command was sent and input/selection remain. Create inline successfully: actual confirmed C is selected, paper values stay present and no draft write occurs until explicit Save; then relogin/reopen proves the durable stable C link.
  3. Capture distinct `soleAddition=روضة - H`, `additions=ملاحظة`, M1/M2/M3/face strings, A/F/side/general notes, repair/adjustment text where exposed, valid date `2026-11-20` and provisional paid `100.50`. Compare saved/reopened fields without source-label translation or fabricated signature. Test malformed date/negative paid as rejected input with retained prior state.
  4. Add P2, copy P1 into new P3, remove P2, resequence and Save. Observe actual response IDs to prove retained P1, distinct P3 and absent active P2; verify the final row cannot be removed. This complements pure-model/component cases rather than claiming UI labels alone prove identity.
  5. Assert empty suggestions retain custom provisional entry/search portal behavior; unit/row/order totals and balance remain unavailable, not zero/demo amounts. Submission and official-print controls communicate readiness and send no transition; direct unsupported authority remains covered at HTTP boundary. Verify keyboard/dialog focus and RTL/narrow layout with no capture artifacts.
- **Preserve / failure unchanged**: Main persistence path uses real backend/migrations; no route fulfillment with fake success or browser-local fallback. Manual unsent paper changes are not promised across sessions. All created test contexts close in `finally` and only harness-owned resources are used.
- **Tests / verification**: Run the two harness typechecks then `pnpm --filter @template/web test:e2e e2e/customer-drafts.spec.ts --grep P02-C2` on both projects. Use separate focused cases where independent setup is needed; retain `retries:0` and existing bounded assertions, not arbitrary waits. Record actual fields/IDs/outcomes without credentials.
- **Done when**: US2 inline/cancel, US3 incomplete session persistence and US4 retained/copy/remove identities all have observed real-stack evidence on both profiles, with truthful unavailable P03 behavior and successful cleanup. Keep their individual scope/results explicit; no phase/release claim yet.

### T040 — Prove privacy, concurrent edits and lost-reply recovery

- **Outcome / requirements / dependencies**: Primary US5 plus US6, FR-001/004–007/017–026 and SC-004/006. Dependencies: T018, T037, T038 and T039. The real browser boundary complements the controlled PostgreSQL races in T017 and current-scope component tests in T036.
- **Allowed file actions**: EXTEND only `apps/web/e2e/customer-drafts.spec.ts`, using T038's local helper types/functions and cases named `P02-C3 privacy`, `P02-C3 stale` and `P02-C3 lost-reply`. No new fixture/token/seed endpoint or harness policy change.
- **Read-before-edit bundle**: Spec US5/US6 and SC-006; plan OP-04/06/08; Contracts §5, Data §§3–4 and Frontend F02–F03/F06–F08. Read actual T016 direct owner-denial status/envelope, T017 receipt/CAS race cases, T024/T036 command/scope state, final customer/draft views, and C3 request-credential observation in `apps/web/e2e/staff-identity.spec.ts`. Existing real request auth/CSRF may be observed only within the same owned synthetic browser context, without logs/artifacts.
- **Ordered steps**:
  1. Through real P01 provisioning create SALES A/B plus the owned ADMIN page. Link A/B drafts to shared C. A/B may see C, but each related list/count/latest measurement/activity is private. Direct B request for A's draft/read or write returns the same safe `404 DRAFT_NOT_FOUND` as missing, with no foreign data and unchanged real state. ADMIN's broader view must preserve original owner.
  2. Edit C at one base revision in A and B: save A, then submit B's old revision. Observe conflict, retained B input and unchanged winner; explicit reload/review uses current data. Add the draft stale case using two A-owned contexts rather than incorrectly letting B edit A's private draft.
  3. For one known new intent, intercept delivery only: let `route.fetch()` complete against the real owned backend, then abort that reply to the browser. Keep the frozen command ID/body. Observation finds the actual committed receipt and current record; no new command UUID, second draft/customer/piece or duplicate event is created. A missing receipt is not represented as proven rollback.
  4. Keep independent cases bounded. Validate saved/current distinction after a later revision and confirmed-save/refresh-failure through the actual surfaced retry where applicable; component scope tests remain the proof for controlled same-actor-new-epoch/late-cache branches. Do not replace those component assertions with an unrelated happy browser path.
- **Preserve / failure unchanged**: Never print bearer/CSRF credentials or enable trace/video/screenshots. No direct database access, fake successful endpoint, wider admin action, manufacturing/submission state or production resource. Non-DRAFT persisted races remain N/A until P03; no fixture state is invented to satisfy them.
- **Tests / verification**: Run both harness typechecks and `pnpm --filter @template/web test:e2e e2e/customer-drafts.spec.ts --grep P02-C3`. Require real returned status/envelope plus current saved state. All contexts/routes/listeners close in `finally`; the existing harness tears down its own container/processes/private files. No skipped cases, hidden retries or timing sleeps substitute for failures.
- **Done when**: Privacy/ADMIN, stale winning/losing state and one-effect lost-reply reconciliation pass on both profiles, with recorded scope/cleanup and matching component/database evidence for the boundaries they prove. Release and later submitted-order behavior remain excluded.

### T041 — Document the implemented P02 boundary accurately

- **Outcome / requirements / dependencies**: Scoped product/runtime documentation describes actual P02 behavior and remaining browser-local/later-phase domains. Dependencies: T018, T037, T038, T039 and T040. Covers spec scope/phase exit and plan Verification/Review; no new business requirement.
- **Allowed file actions**: MODIFY `README.md` only its included-capabilities, account/remaining-domain boundary, relevant database invariants and verification descriptions; MODIFY `PROJECT_REFERENCE.md` only Boundaries, reached Web/API extension descriptions and relevant test references. Read implemented source/OpenAPI/evidence. Do not edit root roadmap, accepted spec/plan/contracts/data/frontend design, constitution/engineering policy, checklist markers, commands/configuration or application code.
- **Read-before-edit bundle**: Plan Summary/Technical Context/OP-09/Verification/Design Exit; spec exclusions and P03/NUM-01/OPS-01 limits; final T016 OpenAPI and real module source, T019–T036 consumers and T038–T040 evidence. Existing README still says all operational customers/orders are browser-local; PROJECT_REFERENCE likewise predates P02. Apply docs-guard, code-review §4 documentation checks and actual package manifest commands.
- **Ordered steps**:
  1. Describe shared saved customers, owner-scoped incomplete draft captures and manual save/reopen/receipt/error behavior actually implemented. Identify the real converted routes without treating unrelated operational provider consumers as migrated.
  2. Explain Saudi phone equivalence, optional customer/incomplete specifications, provisional signature/paid/date versus authority, unavailable pricing/submission/business numbering and retained design. Preserve P01 authentication/initial-admin/session facts.
  3. Update only source-verified interfaces/commands and honest evidence references. No catalog activation, real mail, production migration/deployment, whole P03 completion, SLA or security guarantee is inferred from local P02 results.
  4. Resolve touched links/references against source and format only the two owned documentation files. Keep detailed contracts in their existing owners instead of duplicating schema tables into README.
- **Preserve / failure unchanged**: No product/policy/approval amendment and no data side effect. Unperformed evidence is labelled; documentation never declares a missing acceptance gate complete.
- **Tests / verification**: `pnpm exec prettier --check README.md PROJECT_REFERENCE.md` and `git diff --check`; inspect every new path/symbol/command/link against implementation/manifests. Documentation-only checking does not run root `pnpm verify`, migration, seed or application suites.
- **Done when**: The two changed docs accurately distinguish implemented P02/P01 from remaining domains/releases, links/commands agree with source, scoped format/diff checks and docs review pass, and evidence is recorded in this tasks file.

### T042 — Complete phase verification and record distinct acceptance verdicts

- **Outcome / requirements / dependencies**: All FR-001–027, SC-001–008, VR-001–005 and P02 phase exit have actual appropriately scoped evidence or explicit remaining gates. Dependencies: every T001–T041. This is an execution/review gate after future implementation, not a completion marker set by TASKS generation.
- **Allowed file actions**: READ all selected implementation/test/docs artifacts and their immediate consumers; APPEND actual checks, warnings, findings and separate verdicts in `specs/002-shared-customers-drafts/tasks.md`. A discovered defect returns to its earlier task's explicit allowed files/checks; T042 itself authorizes no unrelated source/policy/requirement changes. Mark only verified task IDs done under the later permitted execution scope.
- **Read-before-edit bundle**: Spec Verification/Success/Phase Exit; plan Backend/Frontend Delivery Groups, Verification and Review Plan, Design Readiness; all prior brief evidence; root package scripts plus package Vitest/Playwright discovery and integration setups. Reopen engineering index/core affected guides, testing Commands/Cleanup/Evidence and code-review separate conformity dimensions. Use applicable production/test/docs/React guards on the actual changed files; no optional tool installation or suppression is required for a pass.
- **Ordered steps**:
  1. Reconcile current source revision/dirty state with prior evidence. Ensure backend T018 and frontend T037 gates, all browser cases, producer/consumer agreement and P02 docs are complete. Missing Docker/Chromium/required evidence leaves the associated gate open without another database or mocked-success substitution.
  2. Run the plan's full applicable exit commands once after final changes: `pnpm format:check`, `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm verify:build-output`, both harness typechecks, `pnpm --filter @template/web test:e2e`, and `git diff --check`. Schema/client producers must already be generated/built by their tasks. Web typecheck writes Next generated types; builds generate outputs; preserve prior edits and do not invoke a broad formatter as a shortcut. Root `pnpm verify` also formats/generates Prisma and is not a read-only substitute.
  3. Inspect actual discovered cases/results, query/schema/OpenAPI alignment, final state assertions, both browser projects and owned resource cleanup. Distinguish fresh direct/uncached integration evidence from Turbo-cached results; rerun only what new changes/failures/unresolved concerns require.
  4. Review requirements conformity and engineering conformity separately; resolve required in-scope findings through their owning task and repeat affected checks. A green suite waives neither requirement nor engineering defect.
  5. Record BACKEND, FRONTEND, BROWSER and P02 status separately from RELEASE. P02 acceptance requires every agreed deliverable/evidence gate while prices/submission remain explicitly unavailable. NUM-01/P03 and OPS-01 retain their later boundaries. No commit, push, deployment, preserved-target migration/import, real spending or external message is performed through this task.
- **Preserve / failure unchanged**: Preserve historic migrations/data and all requirements decisions. No `.skip`/`.todo`/`.only`, weakened assertion, blanket retry, arbitrary sleep or warning suppression can close a required gate. A failed/unperformed command is recorded candidly; budget/time or a partially green batch cannot mark P02 complete.
- **Tests / verification**: Use the exact manifest-backed command set above and the real isolated database/HTTP/React/browser boundaries from plan/earlier briefs. Missing infrastructure is not a test pass. All owned clients/containers/processes/temporary files/listeners are released, and diagnostics contain no credentials or private payloads.
- **Done when**: Every required in-scope implementation/review/verification task has evidence, both conformity verdicts pass and P02 acceptance is supported with clear limits. Otherwise leave this gate open with exact failing task/owner/next evidence; release remains separately unperformed unless expressly authorized later.

## Implementation Readiness Coverage

The following PASS means a filled task brief and source-grounded design exist at TASKS production time. Every execution checkbox remains unchecked; dependency outputs, requirements-review admission and actual checks are pending. No backend/frontend/browser/P02/release acceptance is preapproved. ANALYZE must later assess the complete file read-only; IMPLEMENT reopens selected source and dependencies before code.

| Task ID | Filled context / blueprint                                  | Design handoff | Execution prerequisite / evidence limit                            |
| ------- | ----------------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| T001    | T001 brief; Scope / gates; named source/test bundle         | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T002    | T002 brief; OP-01/06; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T003    | T003 brief; OP-01–04/07; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T004    | T004 brief; OP-01/04–06; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T005    | T005 brief; OP-09; named source/test bundle                 | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T006    | T006 brief; OP-09; named source/test bundle                 | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T007    | T007 brief; OP-09; named source/test bundle                 | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T008    | T008 brief; OP-01; named source/test bundle                 | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T009    | T009 brief; OP-03/05–06; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T010    | T010 brief; OP-02/04; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T011    | T011 brief; OP-02–04; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T012    | T012 brief; OP-04–05; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T013    | T013 brief; OP-04–06; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T014    | T014 brief; OP-01–03; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T015    | T015 brief; OP-01/04–06; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T016    | T016 brief; OP-01–06; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T017    | T017 brief; OP-02–06/09; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T018    | T018 brief; Backend gate; named source/test bundle          | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T019    | T019 brief; OP-08 / F02; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T020    | T020 brief; OP-01–03; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T021    | T021 brief; OP-01/04–06; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T022    | T022 brief; OP-02/04; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T023    | T023 brief; OP-04; named source/test bundle                 | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T024    | T024 brief; OP-03/05–08; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T025    | T025 brief; OP-07; named source/test bundle                 | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T026    | T026 brief; OP-05/08; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T027    | T027 brief; OP-02/07; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T028    | T028 brief; OP-03/07; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T029    | T029 brief; OP-02/04/07; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T030    | T030 brief; OP-08; named source/test bundle                 | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T031    | T031 brief; OP-05/07–08; named source/test bundle           | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T032    | T032 brief; OP-06–08 / US2; named source/test bundle        | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T033    | T033 brief; OP-05/08 / US4; named source/test bundle        | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T034    | T034 brief; OP-04/08; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T035    | T035 brief; OP-04/08; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T036    | T036 brief; OP-06–08; named source/test bundle              | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T037    | T037 brief; Frontend gate; named source/test bundle         | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T038    | T038 brief; US1 / browser; named source/test bundle         | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T039    | T039 brief; US2/US3/US4 / browser; named source/test bundle | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T040    | T040 brief; US5/US6 / browser; named source/test bundle     | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T041    | T041 brief; Scoped documentation; named source/test bundle  | PASS           | Direct prerequisites above; actual completion evidence unperformed |
| T042    | T042 brief; Phase exit; named source/test bundle            | PASS           | Direct prerequisites above; actual completion evidence unperformed |

## Requirement and Review Coverage

Each listed implementation ID includes its brief's meaningful focused checks; the evidence column names additional boundary/group/exit owners. No test-file count is an acceptance target.

| Requirements / risk                                           | Main implementation IDs                                    | Meaningful evidence / review IDs                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| FR-001 current authority; FR-019 denial/privacy               | T009/T011/T013–T016/T019/T022–T024                         | T017/T018/T036/T037/T040/T042                                                    |
| FR-002–005 customer requiredness/phone/email/edits            | T002/T003/T005/T006/T010/T011/T014/T020/T025/T028          | Contract/service tests in producers; T017/T018/T038/T040                         |
| FR-006 exact shared identity/search/routes/links              | T010/T011/T014/T020/T022/T025/T027–T029/T031               | T016/T018/T032/T038/T039/T042                                                    |
| FR-007 provisional scoped histories/counts                    | T010/T012/T013/T022/T023/T029/T035                         | T016/T017/T018/T037/T040                                                         |
| FR-008–009 inline/cancel/late write                           | T024/T031                                                  | T032/T036/T039/T040                                                              |
| FR-010–011 stable known-type incomplete draft                 | T002/T004–T006/T012/T013/T021/T026/T031                    | T016/T018/T033/T037/T039                                                         |
| FR-012–014 fields/date/signature/paid captures                | T004–T006/T008/T012/T013/T026/T030/T031                    | Focused producer cases; T016/T018/T033/T039/T042                                 |
| FR-015–016 piece identity/removal/history                     | T004–T006/T012/T013/T026/T031                              | T017/T018/T033/T039                                                              |
| FR-017–018 all scoped read consumers/counts                   | T010–T013/T016/T019/T022/T023/T027/T029/T034/T035          | T017/T018/T036/T037/T040                                                         |
| FR-020 stale winning/losing values                            | T005/T009/T011/T013/T024/T028/T031                         | T017/T018/T032/T036/T040                                                         |
| FR-021–022 one-effect command/audit/rollback                  | T005–T007/T009/T011/T013/T015/T024                         | T016/T017/T018/T036/T040                                                         |
| FR-023–024 rejected authority/unpriced/P03 unavailable        | T003/T004/T012–T016/T026/T030/T031/T034/T035               | T018/T033/T037/T039/T040                                                         |
| FR-025–026 truthful errors/sync/cache/account lifetime        | T008/T019–T024/T027–T031/T034/T035                         | T016/T017/T018/T032/T036/T037/T040                                               |
| FR-027 retained Arabic/RTL/Cairo/keyboard/paper               | T025–T031/T034/T035                                        | T032/T033/T037–T040/T042                                                         |
| VR-001–005 and SC-001–008                                     | Full task graph with staged backend→frontend→browser gates | T018/T037/T038–T042; separate requirements and engineering verdicts              |
| Migration history/test isolation/recovery                     | T005–T007; no changes to prior SQL/seed authority          | T006/T007/T017/T018/T042                                                         |
| Written product/design admission; no implementation inference | T001; preserve both checklist lifecycles during generation | Current TASKS artifact checks only; later ANALYZE/IMPLEMENT/exit remain separate |

## Generation Evidence and Remaining Gates

All T001–T042 remain unchecked. This command creates only this tasks file and preserves all existing requirements/design/checklists, root roadmap and active selection. No implementation/application tests, builds, migration/catalog import, browser run or release action was performed. Artifact-level ID/dependency/brief/source-reference/format/preservation checks and independent task-handoff review are recorded in the completion response; they do not complete any task.

The current material product/design decisions are resolved. Future execution still requires requirements-quality review, permitted IDs, current-source alignment, completed dependencies and real evidence. Missing infrastructure or a newly discovered material contradiction blocks only its affected work and must be reported with its exact owner; it never permits unrelated data or invented contracts. No extension hooks file exists at generation.

## Execution Evidence

No task has been executed by TASKS generation. During later authorized work, append revision, permitted/completed IDs, exact commands/results, meaningful scenario/final-state evidence, both conformity verdicts, warnings, cleanup and remaining gates here. Preserve earlier evidence and mark only actually verified in-scope task IDs complete. Convergence may later append unique remediation tasks with equally bounded briefs; it does not rewrite earlier IDs/progress.

### 2026-11-05 — T001 / Group 1 intake

**Authorized and selected scope**: The user selected the existing internal group `Group 1: Scoped Intake and Actual Prerequisites`. Under phase-delivery §3 this resolves to **T001 only** within roadmap **P02**, feature `specs/002-shared-customers-drafts`; it does not select a new roadmap phase or T002–T042. T001 has no predecessor. The original generation statements above remain historical; this section owns the current execution evidence.

**Prewrite gate**: PASS for T001. Reopened its complete brief, both checklists, accepted scope/authority/exit requirements, Plan Technical Context/Constitution Check/foundation ledger, relevant contract/data/frontend decisions, the current constitution/index/workflow/handoff guides and current source below before writing. All ten roadmap/selection/P02 artifact hashes matched the preceding read-only analysis snapshot. Branch is `main`, revision `b286d4e`; the eight P02 Markdown files were existing untracked work, with no tracked or staged change. `SPECIFY_FEATURE_DIRECTORY` is unset and `.specify/feature.json` already selects the matching feature, so selection needed no repair.

**Requirements-quality admission**: PASS. Reused the built-in checklist at 16/16 without changes. Reviewed and marked CHK001–CHK036 in [the custom checklist](checklists/customers-drafts.md#requirements-review--2026-11-05-t001), with individual written-artifact evidence. Approval concerns requirements/design quality only. No execution result was approved in advance. The two nonblocking analysis advisories remain recorded there: A1's frontend rejection shorthand is resolved by FR-021/SC-006, OP-06 and T024 step 5; U1 names two additional T031 metadata regression references. Neither is a material T001 decision gap, and neither design/brief was silently amended.

**Fresh current-source and prerequisite observations**:

| Boundary                  | Inspected source and supported result                                                                                                                                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 authority             | `apps/api/src/modules/auth/account-authority.ts` exports `lockAccountRows`, `loadIdentityAccount` and `assertBusinessAuthority`; current-account selection and parameterized sorted read/write locks exist. Authentication retains no-store responses and department authorization retains the ADMIN exemption.                                     |
| Actual composition        | `apps/api/src/router.ts` mounts auth/users/staff/health/OpenAPI. No customer/draft/command router is mounted.                                                                                                                                                                                                                                       |
| Persistence               | `packages/database/src/client.ts` exports `createDatabaseClient`/`DatabaseClient`; `src/index.ts` explicitly exports current P01 types/enums. Schema has User, RefreshToken, StaffDecision and InitialAdministratorProvisioning; the five prior migration SQL files exist and were fingerprinted. No P02 model/migration is treated as implemented. |
| Web reuse                 | Inspected the existing `AUTH_SESSION_QUERY_KEY`, `useSession`, `reconcileBusinessDenial`, transport parser/epoch/subject exports and `createQueryClient`; the central QueryClient retains 30-second freshness, bounded query retries and mutation retry disabled. No second auth/transport/store setup is required.                                 |
| Test tooling              | Existing package manifests expose the planned unit/integration/browser and harness-typecheck commands; `apps/web/e2e/runtime.ts` remains the owned runtime/action-capture owner. No test infrastructure was started or required to complete this document-only task.                                                                                |
| Proposed producers        | Customer/draft/command API module and contract directories, customer API adapter and operational-scope helper are absent. These are designed outputs of T002–T017/T019–T036, not importable current interfaces. Consumers must wait for their actual producer evidence.                                                                             |
| Historical P01 acceptance | Read P01 T058/T059 execution evidence in `specs/001-staff-access-accounts/tasks.md`, which reports local acceptance and keeps OPS-01 open. This is historical recorded evidence, not a fresh P01 runtime run.                                                                                                                                       |

**Scope and capability limits**: Root P02 accepts this work without catalog activation, pricing or numbering. CAT-01/PRC-01 remain confirmed inputs, CAT-02 activation belongs to P03, NUM-01 remains pending and OPS-01 remains a release gate. Their current roadmap rows and draft/owner-review status are preserved. No new material product/design gap was found for T001. Docker/Chromium/real persistence/browser availability was not assessed; those are later execution prerequisites, not missing intake requirements. T018 backend acceptance, T037 frontend acceptance and T042 whole-P02 acceptance remain open. No dependent frontend or Group 2 task was executed.

**Scoped configuration**: Read the root/package manifests, `prettier.config.mjs`, shared Prettier configuration and `.prettierignore`; no ignore/lint/build/configuration change is needed. Fresh tool versions are Node `v24.18.1` and pnpm `11.17.0`, within the declared ranges. Documentation/source checks are appropriate under the testing guide; no ceremonial application tests, type generation, build, database action or Docker startup belongs to T001.

**Executed intake checks**: `git status --short --untracked-files=all`, `git branch --show-current`, `git rev-parse --short HEAD`, `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`, Node/pnpm version reads, and source/manifest/path/hash comparisons resolved the correct feature and prerequisites. No `.specify/extensions.yml` exists, so no before/after IMPLEMENT hook is registered. Final document format, link/reference, marker/dependency and preservation results are recorded below after execution.

**Review scope**: Requirements and engineering review cover T001, its checklist admission and this evidence only. Applied docs-guard and the checked-in code-review/testing guidance to the documentation claims. Production-code/test/React change guards are N/A because no such files changed. All later implementation and acceptance tasks remain separately scoped and unchecked.

**Final verification and completion**:

- PASS: scoped `pnpm exec prettier --check` for this tasks file and the custom checklist; `git diff --check`.
- PASS: local-link/reference checks, CHK001–CHK036 evidence/marker inventory, all 42 task IDs/briefs and preserved later-task markers. Original text is byte-for-byte preserved after reversing only the authorized markers and removing the new evidence sections.
- PASS: SHA-256 comparison keeps the other eight roadmap/selection/feature files unchanged; tracked/staged source, configuration, migrations and P01 artifacts remain unchanged. No new repository file was created.
- **REQUIREMENTS: PASS** for T001's selected scope, reviewed written requirements and current-source admission conditions.
- **ENGINEERING STANDARDS: PASS** for bounded ownership, fixed-decision reuse, source-grounded documentation and honest verification. No unresolved material T001 gate remains.

**T001 complete; Group 1 complete (1/1).** T002–T042 remain unchecked and unexecuted. The next dependency-ready producers are T002/T005/T008 after this intake, subject to a request covering Group 2; they are not started here. Backend/frontend/browser/P02 acceptance and release remain open. No application tests/builds, database change, import, commit/push, deployment or external message was performed.

### 2026-11-05 — Group 2 prewrite admission and T002

Authorized scope is T002–T018 only; T001 is complete. Reused the matching active P02 feature, root roadmap/client gates, accepted briefs/OP-01–09 and existing source/configuration. Built-in requirements 16/16 and custom requirements 36/36 remain approved with their T001 evidence; their markers are read-only. No extension hooks file exists. Existing untracked feature artifacts and five prior migration checksums are preserved. Current P01 authority/transport/database/test foundations are reused. Docker server 29.8.2 is available; only owned isolated test infrastructure may be used.

T002 REQUIREMENTS PASS; ENGINEERING PASS. Added the acyclic common receipt/actor/type values and additive browser-safe pagination fields/window check. Existing account/staff schema behavior is unchanged. Fresh contracts HTTP tests passed 16/16 and contracts check-types passed. Clean-code/test guard review found no required issue in this slice. Receipt-union integration cases belong to T004. No backend endpoint or persistence acceptance is claimed.

T003 REQUIREMENTS PASS; ENGINEERING PASS. One Saudi phone normalizer owns create/patch/exact resolution; optional fields clear explicitly, omitted patch keys stay absent and email is nonunique. Added strict customer read/command schemas and meaningful requiredness/phone/patch/projection cases. The first typecheck caught an incompatible Zod preprocessing pipeline; replaced it with typed safe parsing through the existing email schema. Fresh focused contracts tests passed 41/41 and check-types passed. No frontend source changed.

T004 REQUIREMENTS PASS; ENGINEERING PASS. Complete draft create/replacement/read/activity and command-union schemas preserve all independent captures, exact date/paid semantics, 1–200 distinct pieces and the normalized 262144-byte bound. Tests prove the exact UTF-8 boundary, strict privileged-field rejection and receipt operation/resource/revision/actor consistency. Fixed refined-object omission, a strict test index access and lint findings (deprecated safe modifier/unnecessary regex escape); no suppression was added. Fresh full contracts suite passed 127/127, lint/check-types/build passed. Auth/staff regressions are included. Public package exports are explicit. No backend acceptance is inferred.

T005 REQUIREMENTS PASS; ENGINEERING PASS. Added only Customer/SalesDraft/SalesDraftPiece/SalesCommand and their three enums, explicit Restrict relations, documented bounds/indexes and generated public database exports. Prisma schema validation, normal client generation and database check-types passed. Existing P01 models and prior SQL remain intact; no migration was applied by these commands. SQL constraints and actual upgrade evidence remain T006.

T006 REQUIREMENTS PASS; ENGINEERING PASS. Added one forward P02 migration with reviewed mapped tables/enums/FKs/indexes, named checks and narrow identity/retention triggers; no prior migration was edited. Schema inventory passed 9/9. Fresh real PostgreSQL migration tests passed 14/14, including populated P01 data/history/checksum preservation, named constraint/trigger rejection with savepoint isolation, full fixture rollback and idempotent deployment. Database lint/check-types pass after adding typed pg query results; an earlier lint overlapped generated-client replacement and was rerun after generation/build completed. Only owned disposable databases were used.

T008 REQUIREMENTS PASS; ENGINEERING PASS. Corrected low-year UTC date construction while rejecting year0000; known parser400/413 pairs now create fresh safe operational errors with no original body/stack/log leakage, including development. Existing error classifications remain. Fresh focused API tests passed 17/17; API lint/check-types passed. Real createApp HTTP proof remains T016.

T007 REQUIREMENTS PASS; ENGINEERING PASS. Expanded both fixed owned cleanup graphs to the four P02 plus four P01 tables, preserving every environment/marker/URI/current-database guard and no-CASCADE behavior. Populated P02 rows/retained commands clear only in the owned target; outside-FK and wrong-marker cases retain their graph and unrelated sentinel. Fresh API reset unit tests passed 8/8, real reset integration 3/3 and database seed integration 12/12. Database/API check-types passed. No seed mutation semantics or safeguards changed.

T009 REQUIREMENTS PASS; ENGINEERING PASS. Implemented the typed four-operation command executor, canonical hash, immutable result mapper and narrow conflict classifiers. Actor SHARE lock precedes the command advisory lock and any domain work; one timestamp and transaction cover resource/evidence. Fresh pure tests passed 3/3 and real executor integration 5/5, including independently connected identical CREATE/SAVE competitors observed waiting on the advisory lock, one effect, immutable replay after a newer revision, changed binding/actor, rollback and live suspension. API typecheck and scoped lint passed after correcting an overloaded test promise type and unnecessary optional access. No service/HTTP acceptance is inferred; final emitted lock-timeout/rollback cross-service cases remain T017.

T010 REQUIREMENTS PASS; ENGINEERING PASS. Added explicit customer projections and bounded set-based directory/count/latest/provisional-measurement queries on the caller transaction. Fresh real query integration passed 9/9 for A/B/ADMIN privacy, email/Saudi fragment/literal wildcard search, deterministic pages, missing and filtered/unfiltered counts. API typecheck and scoped lint passed. Corrected the producers' optional search output typing without changing accepted behavior; full contracts regression remains 127/127 and rebuilt exports pass. No service authority or HTTP acceptance is claimed by the query tests.

T011 REQUIREMENTS PASS; ENGINEERING PASS. All six customer service methods use current SALES/ADMIN authority and protected transactions; writes use the executor, row locks/CAS, explicit patches and narrowly classified phone uniqueness. Fresh real service integration passed 8/8 for shared creation, duplicate races/email reuse, phone changes/old-phone reuse/stable links, omission/clear, stale winners, related scope, live denial/missing and revision exhaustion. Typecheck/scoped lint passed after making the injected executor import type-only. Replays retain original after-images; no web or HTTP composition was changed.

T012 REQUIREMENTS PASS; ENGINEERING PASS. Added owner-scoped draft pages/details/activity summaries, exact Decimal/date mapping, active ordered piece projections and pure identity classification. Fresh identity-rule tests passed 5/5 and real query integration passed 6/6 for A/B/ADMIN scope, safe field independence, low-year/date/paid captures, active/tombstoned IDs, base-versus-search totals, tie sorting and PII-free change summaries. API typecheck/scoped lint passed. Aggregate command enforcement and actual HTTP authority remain T013/T016.

T013 REQUIREMENTS PASS; ENGINEERING PASS. Implemented protected draft list/get/changes and whole-aggregate create/save. Optional customer resolution is explicit, parent locks precede child access, IDs/tombstones remain stable, position shifting and affected-row checks preserve uniqueness, and owner/state/version predicates gate saves. Fresh real service integration passed 13/13 for blank/full round-trip, separate captures/date/paid/customer link/unlink, copy/remove/reorder/replay, foreign/tombstone denial, missing filters, privacy/ADMIN, stale winners, final-row/range/duplicate guards, live denial and exhaustion. API typecheck/scoped lint passed; the required runtime DRAFT guard is retained through a named string-state check and the conditional write. Query/service relation reads emitted an observed pg deprecation warning; no warning suppression or retry was added, and backend acceptance will record its source/limit. Future persisted non-DRAFT states remain N/A before P03.

T014 REQUIREMENTS PASS; ENGINEERING PASS. Customer DTOs alias shared schemas; controllers require actor/validated context and safely reparse the parsed slots without casts. Routes retain department/ADMIN, CSRF and strict input ordering; central composition is untouched. Fresh adapter tests passed 7/7 with actual Express middleware and a typed use-case boundary double, proving literal resolution, exact normalized arguments/statuses, earlier rejection and missing-context500. API typecheck/scoped lint passed. These are adapter-only claims; real credentials/persistence remain T016.

T015 REQUIREMENTS PASS; ENGINEERING PASS. Added strict draft adapters/DTO aliases and same-actor/current-visibility receipt observation with protected repeatable-read authority. Fresh adapter tests passed 5/5; receipt service integration passed 4/4. Fixed a test tuple type and two import-spacing lint findings; API check-types and scoped lint pass. No other actor receipt is exposed even to ADMIN.

T016 REQUIREMENTS PASS; ENGINEERING PASS. Mounted the three modules through the existing router, with one shared command executor, and registered all thirteen P02 operations from shared schemas in OpenAPI. Fresh actual createApp/login/CSRF PostgreSQL HTTP integration passed 4/4: incomplete capture/reopen, immutable replay/observation, stale/rejected writes, shared contact/private related projections, ADMIN limits, live restriction and safe parser400/413. Corrected test-only department/login fixtures after the first runs; no fake success transport was used. OpenAPI tests passed 8/8 before the final ledger assertion; final ledger and full existing app regressions remain part of T018. Backend acceptance remains open for T017/T018.

T017 REQUIREMENTS PASS; ENGINEERING PASS. Mapped existing phone/revision/identical-command race and privacy owners before extending only uncovered risks. The four targeted real PostgreSQL integration owners passed 37/37. Added both observed actor-lock/revocation orderings; real bounded advisory lock-timeout409 and actual adapter P2034 classification; controlled concurrent piece UUID claim404 with one aggregate/receipt; deterministic late receipt-trigger failure restoring complete header/paid/ordered pieces/tombstones/version/receipt graph; and an actually aborted HTTP response body followed by immutable observation/replay with one effect. Barriers, independent connections and pg_locks/pg_stat_activity observations establish concurrency; all owned triggers/functions/servers are closed in finally. Corrected the user-lock observation predicate after its first failure because one fixture used an unquoted table name. Test-only lint corrections and final full suites are checked at T018. The pg8.22 warning trace originates in Prisma7.9.1 PgTransaction.performIO/interpretNode array mapping during relation reads; application transaction queries are sequential. Installed pg8 is retained; no pg9 compatibility claim or dependency change. Persisted non-DRAFT and submit-versus-save execution remain N/A until P03.

### 2026-11-05 — T018 Group 2 backend acceptance

**Scope and preservation:** Reviewed T002–T018 against the accepted P02 briefs, OP-01–06/09, current contracts/database/services/query/mapping/adapters/composition/error/cleanup owners and their discovered tests on main at baseline b286d4e plus this uncommitted working tree. T001 remains complete. All 17 Group 2 tasks are complete. T019–T042 remain unchecked and unexecuted. Built-in requirements 16/16 and custom requirements 36/36 retain their T001 approval evidence. SHA-256 comparison against Group 2 intake confirms root roadmap, feature pointer, seven other feature artifacts and all five prior migrations are unchanged; only this task ledger changed among those protected baseline files. Existing untracked planning artifacts are retained. No material design gap or required in-scope finding remains.

| Review owner                                       | Reviewed boundary                                                                                                              | Verdict and evidence                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constitution, index, code style and backend recipe | Explicit module exports/composition, thin DTO/controller/routes, typed service/query/mapper/rule owners                        | PASS; existing auth, CSRF, errors and database lifecycle reused; no generic framework, untyped escape, production fixture or suppressed lint introduced.                                        |
| API contracts                                      | Shared strict customer/draft/receipt schemas, pagination, thirteen mounted operations and OpenAPI                              | PASS; 127 contract tests and 9 OpenAPI tests within the full API unit suite; real producer outputs parsed against shared envelopes/DTOs in HTTP integration.                                    |
| Data patterns                                      | Forward schema/SQL, stable identity, owner/CAS/command locks, pieces/tombstones, immutable receipts and scoped bounded queries | PASS; real PostgreSQL18.4 fresh/populated upgrade, prior row/history/checksum preservation, idempotent migration, named constraints, race, lock-timeout, P2034, rollback and cleanup evidence.  |
| Security                                           | Current authority, owner privacy, shared contact versus related data, same-actor receipt, parser/body limits                   | PASS; both authority orderings, foreign missing responses, ADMIN boundaries, CSRF and safe400/413 exercised through real services/createApp.                                                    |
| Testing                                            | Contract/pure/adapter/service/query/actual HTTP/migration/seed/cleanup owners                                                  | PASS; discovery and final persisted graph assertions inspected; adapter doubles claim wiring only, persistence evidence uses owned migrated infrastructure. No skips or arbitrary sleeps added. |
| Code review and matching guards                    | Requirements trace and engineering review assessed separately over scoped current producers/callers                            | PASS; clean-code/test/docs guard passes performed. OpenAPI symbols/methods/statuses/security, manifest commands and evidence counts checked against actual source/results.                      |
| Frontend and browser                               | Existing Arabic/RTL/Cairo screens/forms/printing and operational cache/session consumers                                       | N/A for this group: source is unchanged; integration and browser acceptance belong to later authorized groups.                                                                                  |

**Fresh complete required checks (all exit0):**

| Package             | Commands and discovered results                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @template/contracts | `test`: 7 files, 127 tests; `build`, `check-types`, `lint`: PASS.                                                                                                                         |
| @template/database  | `test`: 2 files, 21 tests; `test:integration`: 2 files, 26 tests; `check-types`, `lint`, `build`: PASS. Client generation ran through declared scripts before dependent API final checks. |
| @template/api       | `test`: 35 files, 268 tests; `test:integration`: 15 files, 181 tests, including existing app/auth/staff regressions; `check-types`, `lint`, `build`: PASS.                                |

Each package command above used `pnpm --filter <package> <command>`. Total complete suites: **623 tests across 61 discovered files**, with no skipped tests reported. The four targeted T017 integration owners also passed 37/37 before the complete final integration run. `pnpm exec prettier --check` over all 74 changed/new owned TypeScript files, this task ledger formatting check and `git diff --check` passed. All database behavior checks used disposable, marker-guarded Testcontainers targets; no developer/production database or retained deployment target was changed.

**Guard correction:** `apps/api/src/modules/sales-commands/sales-command-executor.ts` — removed an identical-branch ternary around the typed work callback; final full API suites/types/lint/build pass with the simpler call. clean-code-guard: 1 fixed, 0 flagged for author. Test-guard and docs-guard: no unresolved findings.

**Warnings and limits:** The installed pg8.22 deprecation warning about overlapping client queries was traced to Prisma7.9.1 adapter/runtime relation-query scheduling, not application Promise.all inside transactions. Current installed-version tests pass; this does not establish pg9 compatibility. Persisted non-DRAFT/submit-versus-save behavior is N/A until P03 defines those states; client-selected statuses/price fields and absent submission paths are tested now. Full P02 frontend/browser/RTL/keyboard/narrow-wide acceptance remains open, as do P03 catalog/price/numbering and release gates. No commit/push, deployment, import or external message was performed.

**REQUIREMENTS: PASS** for the selected Group 2 backend deliverables and their accepted failure/authority/integrity criteria. **ENGINEERING STANDARDS: PASS** for scoped ownership, executable contracts, persistence/migration safety, current authority/privacy and meaningful fresh verification. **BACKEND GATE: PASS. T018 complete; Group 2 complete (17/17).** Dependent frontend work is eligible for a separately authorized Group 3 request; it was not started here.

### 2026-11-05 — Group 3 admission and T019–T023

Authorized scope is T019–T037 only. Rechecked selected P02 feature/pointer, filled briefs/F01–F08 and current T018 backend producers/evidence against the preserved working tree on main at b286d4e. Matching T018 backend PASS is reused; no new database acceptance is claimed by frontend doubles. Requirements checklists retain 16/16 and 36/36 approval and remain read-only. No extensions hook file exists. Existing backend/planning edits and root roadmap/client gates are preserved. Existing transport/session/QueryClient/form/paper ownership and installed Next16.2.12 guidance are reused; no frontend redesign or Group4/browser execution is authorized.

T019 REQUIREMENTS PASS; ENGINEERING PASS. Added the current successful/nonerrored validated SALES-or-ADMIN scope, three-part authority comparison, cancellation and old-root cleanup with same-actor epoch isolation. Real QueryClient tests cover eligibility, cached error/malformed session, revision/epoch changes and cleanup preserving the current root.

T020 REQUIREMENTS PASS; ENGINEERING PASS. Added six explicit customer adapters using shared full-envelope/domain parsing, canonical Saudi exact resolution, forwarded read signals and explicit unsignalled writes. Tests cover normalized selectors, strict malformed/protected/wrong-kind outputs, actual receipt shapes and failure propagation.

T021 REQUIREMENTS PASS; ENGINEERING PASS. Added six draft adapters and actor-private receipt observation, preserving current-read versus retained-image distinctions, exact nullable capture/availability/receipt fields, literal activity routing, read signals and explicit commands. Strict malformed aggregate and missing receipt outcomes remain errors.

T022 REQUIREMENTS PASS; ENGINEERING PASS. Added canonical customer query keys and guarded reads/publication, shared monotonic detail options and bounded measurement queries. Tests exercise server pages, phone resolution, invalid-target disablement, newer-version retention, equal-version projection refresh, errored sessions and late same/different-actor epoch results. No fallback ID is used.

T023 REQUIREMENTS PASS; ENGINEERING PASS. Added scoped draft/filter/detail/change/activity queries and one monotonic detail-options owner. Tests cover every list selector, real server totals/page, bounded activity/history, invalid-target disablement, failure rather than empty/new fallback and same/different-actor late results.

Fresh combined command: `pnpm --filter @template/web test src/shared/query/operational-scope.test.ts src/features/customers/api/customers.api.test.ts src/features/sales/api/drafts.api.test.ts src/features/sales/api/sales-commands.api.test.ts src/features/customers/hooks/customers.hooks.test.tsx src/features/sales/hooks/drafts.hooks.test.tsx src/services/api/api-client.test.ts` passed 92/92 across seven discovered files. Web check-types and scoped eslint over these owners passed. Initial test fixtures omitted the required success-envelope path; corrected the fixtures, preserving strict parsing. Fixed import/void-expression lint and an explicit cached-detail test type; no suppressions or settings changes. Code/test guard review found no required unresolved issue. These are adapter/cache claims, not new backend/browser/phase acceptance.

T024 REQUIREMENTS PASS; ENGINEERING PASS. Implemented the four-operation intent/error classifier, explicit command dispatch, actor/operation/command/target receipt checks, guarded current-resource synchronization, old-phone resolver cleanup and awaited bounded-root invalidation. Confirmed refresh failure retains the receipt in SalesSynchronizationError; manual observation is disabled-by-default/no-retry/no-cache-retention and never dispatches a write. Real QueryClient tests cover all four dispatches, newer current data after an older receipt, failed refresh/invalidation/missing publication, incorrect actor/target/kind/command, manual unknown/404 observation, unchanged intent after unknown then403/409 and scope change during readback. Forms remain responsible for their accepted frozen-intent latch and for retaining prior uncertainty after a later rejected attempt; integrated proof follows T028/T031/T036. Corrected one observer assertion to await actual publication rather than assuming refetch completion synchronously rerenders.

T025 REQUIREMENTS PASS; ENGINEERING PASS. Added deliberate customer defaults, shared-validation-only dirty patches including optional clears/no-op, validated fixed-template sales/admin phone routes and known-operation field mapping with safe Arabic feedback/request ID. Error mapping tests use actual RHF methods rather than a fake overloaded getValues implementation. No contact/email identity or transport owner was added.

T026 REQUIREMENTS PASS; ENGINEERING PASS. Added complete blank/existing draft defaults, exact sixteen-field paper allowlists and UUID preservation, raw editing mappings separated from submit validation, typed fixed routes/entry precedence/status readiness and submitted-ID-to-current-row error mapping. Existing OrderType aliases now consume the shared seven values while preserving Arabic labels/titles. Existing seven rendered order-type cases pass. Invalid raw editing input remains editable instead of throwing during a paper mapping. Narrow numeric-template typing is confined to a verified findIndex result in the error mapper, covered by actual RHF reorder/removal tests.

Fresh combined model/command/read regression passed 70/70 across eight files; web check-types passed. Scoped lint over customer models/sales models/hooks passed after removing unnecessary null fallbacks on required legacy view fields and formatting the numeric error index explicitly. All checks use declared web scripts; no lint/type suppression or configuration change. Clean-code/test guard review found no required unresolved issue in these slices. Backend evidence is reused from T018; real screen/inline/browser journeys remain their later owning tasks.

T027 REQUIREMENTS PASS; ENGINEERING PASS. Converted both retained customer directories to real scoped server pages, stable customer keys, returned draft counts, bounded email/name/phone search and controlled table pagination. Existing row/header/filter classes and sales/admin action boundaries remain. Actual parser/QueryClient/table tests passed six cases across both views; the affected read-hook regressions plus these screens passed 18/18. Fresh web check-types and scoped lint passed before T028 source authoring. The out-of-range case found that a fresh cached destination page prevented the required one refetch; corrected owning T022/T023 list query functions to mark only the current-scope destination key stale with refetchType none before UI page recovery. No normal freshness policy or endpoint changed. No browser acceptance is claimed.

**T029 prewrite readiness BLOCKED — material planning gap, no T029 source edits:** The current SalesCustomerDetailView displays every linked draft's piece model/leather/size in retained cards. T029 ordered step3 requires preserving cards and per-piece captured information. F04/F06 plan only paged useDraftList(customerId), latestMeasurement and paged measurements; actual DraftListData returns draft summaries/pieceCount without pieces, while CustomerMeasurementsData includes only model/size/A/F for qualifying measurement rows. It cannot supply the retained leather/per-piece captures or blank/non-measurement pieces. Fetching each of up to25 full aggregates would introduce the N+1 read pattern excluded by the engineering guides; silently removing that information or introducing an unplanned expansion/selection algorithm would choose material UI/data behavior during IMPLEMENT. Owning correction: PLAN frontend-design F04/F06/OP-04 plus the T029 brief, preserving accepted IDs/backend contracts. Recommendation: define an explicit user-opened single-draft detail read through the existing useDraft/GET endpoint, including selection/loading/error/scope and preservation behavior, rather than extending the backend list or issuing a full-aggregate request per row. Standalone IMPLEMENT does not authorize that design change. T029 remains unchecked; T036/T037 cannot close through this unresolved prerequisite. Independent authorized T028/T030–T035 work continues. No accepted design/checklist/roadmap file was rewritten.

T028 REQUIREMENTS PASS; ENGINEERING PASS. Converted retained standalone create/edit forms to shared-schema RHF editors keyed by current scope/stable record, with narrow compiler annotations, actual server duplicate hints/email reuse warnings, dirty-only patches, stable UUID writes, explicit conflict/reload, frozen intent/receipt observation and read-only refresh recovery. Registered controls preserve markup/classes and have associated errors. Phone-copy/ID claims now reflect stable identity; snapshots are not promised to be rewritten. Same-tick submit/retry/observation uses the retained intent's running latch, and earlier uncertainty survives later rejection. Late unmounted/out-of-scope callbacks cannot navigate/reset. Eight real form/QueryClient/transport cases pass, including no-op/clear, normalized creation, reused email, authoritative phone conflict, dirty background/stale review, reset-then-edit, duplicate activation, saved-refresh failure and unknown→receipt404→same-ID409→original receipt recovery. The dirty-edit case found that RHF dirtyFields had not been subscribed before the first submit; subscribing in the actual editor fixed the false no-op. Observer UI assertions await actual publication. Fixture-only type/unused/async lint findings were corrected without weakening tests.

T030 REQUIREMENTS PASS; ENGINEERING PASS. Added optional typed draft dataState/eight explicit production option collections and error-element/message props through the existing paper. Draft mode bypasses calculation and zero-price fallbacks, shows unavailable totals/balance, captures paid as text value and retains the custom-entry portal with empty suggestions. Blank signature/general-note/Hijri fields stay blank; original non-P02 defaults, factory redaction, classes/columns and print pagination remain. Actual text/combobox/A/F/side-note elements expose invalid/description associations and callbacks while retaining the internal escape/select focus ref. Four new draft-paper cases plus a legacy factual-fallback regression complement the existing 1/2/8/9/17-row print cases rather than duplicating their matrix. Fresh `pnpm --filter @template/web test src/features/orders src/features/sales/screens/sales-customer-new-view.test.tsx src/features/sales/screens/sales-customer-edit-view.test.tsx` passed 58/58 across11 files; current web check-types and scoped ESLint over these form/paper/test owners pass. The paper callbacks leave unavailable money fields undefined/blank; only explicit paid text is consumed by the later P02 form adapter. No official print/browser/P02 acceptance is claimed. Code/test guard review found no required unresolved issue in these completed slices.

### Group 3 atomic editor and remaining independent consumers — 2026-11-05

T031 REQUIREMENTS PASS; ENGINEERING PASS. The real existing paper now has one scope/record-keyed RHF capture, shared replacement validation, controlled stable-ID pieces, exact entry parsing and synchronized create/save commands. Both Save buttons share a synchronous frozen-intent latch; pending/observation locks conflicting controls. New drafts change to the validated stable edit URL and subsequent saves retain identity/base revision. Missing/invalid edits never mount a new editor. Optional missing prefill remains visibly unselected and does not prevent a customer-null write; a failing active resolver during awaited root refresh is reported as confirmed-save/refresh-incomplete rather than failed persistence. Actual draft owner/date and explicit unavailable pricing/submission replace demo facts. The inline dialog, controlled customer section, metadata and both immediate server page wrappers agree atomically. Narrow compiler annotations remain on actual RHF owners. Existing metadata test callers now supply their actual order salesperson; no assertions or presentation were weakened.

T032 REQUIREMENTS PASS; ENGINEERING PASS at the component/query/transport boundary. The actual paper/dialog flow selects synchronized current C rather than raw submitted identity; notes, signature and a row capture survive and only later explicit Save sends C's UUID. Cases cover unsent Escape/cancel and trigger focus restoration, explicit duplicate selection, duplicate rejection retaining the previous selection/dialog/paper, pending locks, lost reply → receipt404 → original receipt, confirmed-create readback failure → read-only refresh, and late successful reply after originating paper replacement. No extra customer/draft write is fabricated during observation or cancellation. jsdom focus assertions are not real-browser layout/focus acceptance.

T033 REQUIREMENTS PASS; ENGINEERING PASS. Rendered actual-paper regressions change two pieces, duplicate all sixteen captures with a new UUID, remove the correct piece, save/reopen the confirmed sequence, protect the final row, then add/save a new blank identity. Distinct soleAddition/additions and M1/M2/M3/face/A/F/side notes remain intact, without price/workflow fields in the outgoing shared-schema capture. Pending row changes are unavailable. A deferred nested rejection marks/describes the submitted second piece while the first stays valid, retains edited text and ignores unsupported authority fields. Existing T026 actual-RHF reorder/removal tests supply the submitted-UUID/current-index mismatch proof; existing T030 real paper element callbacks/descriptions supply text/select/size/A/F/side-note focus coverage. Those cases are reused instead of introducing an impossible editable-pending UI or another line-state store.

T034 REQUIREMENTS PASS; ENGINEERING PASS. Draft/all-order lists consume bounded server pages without a second slice, server technical references/piece counts and nullable contacts/dates. Search/type changes reset page; awaited status entries reject repeated/invalid values and later states explicitly show unavailable without querying fixture orders. The dashboard uses page1/limit5 drafts, page1/limit4 shared customers and returned totalDrafts/totalPieces; its later KPI geometry displays unavailable dashes. Local contact/returned/manufacturing projections are absent from the converted dashboard. Stable customer routes encode the canonical phone once. Actual query/table tests cover 25-row pages, page2, search/type, totals distinct from filtered counts, status entry parsing, bounded dashboard reads, independent errors/retry and old-owner late list replies. FilterSelect is retained inside native labels so the actual selects have accessible names.

T035 REQUIREMENTS PASS; ENGINEERING PASS. Detail reads an actual authorized draft and retains tracking/paper/history tabs. Tracking explains unsubmitted/no manufacturing, official print is disabled with explanation, and the paper uses actual owner/customer/captures with unavailable financial authority. Detail changes/global activity use page/limit25 server rows, real actor/time/revision and Arabic labels for returned changed fields; no fixed-name/role filter or local event projection remains. T026's existing pure draft presentation owner now provides the shared typed changed-field labels consumed by these two readers. Tests cover SALES/ADMIN projections, missing/denied records without local fallback/history reads, pagination, actual read-only captures, unavailable print/price, errors/retry and deferred old-epoch detail/activity replies. Actual permissions/persistence remain the previously accepted T018 and later authorized browser boundary.

Fresh focused editor/inline/metadata/model/paper checks passed 37/37 across seven files after the stronger selected-customer/row-preservation assertions. The five read-surface files passed 17/17 after correcting fixture-only administrator approval shape and assertions against actual native filter labels/multiple owner text nodes. Initial lint findings in newly authored tests (non-null assertions, untyped mock-call projections, unused fixture members and import spacing) were corrected in their owners using checked element access, unknown boundary values and narrower fixture setup; no suppression/configuration or unrelated source change was introduced. Production build completed successfully. Final aggregate results and bounded overall verdict follow below; T029/T036/T037 remain unchecked.

### Group 3 final bounded evidence and readiness — 2026-11-05

Completed markers: T019–T028 and T030–T035 (16 of 19 selected tasks). T029 remains blocked on its recorded material PLAN-owned data-loading decision; T036 and T037 remain unchecked because their required T029 dependency is unresolved. No Group4 T038–T042 work was executed. This evidence records verification of the completed independent scope and does not waive those gates.

| Actual check                                      | Result and boundary                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @template/web test --maxWorkers=2` | PASS: 731 tests / 71 files, final full run. Existing and new assertions/timeouts remain intact.                                                                                                                                                               |
| `pnpm --filter @template/web check-types`         | PASS: fresh Next route generation and TypeScript.                                                                                                                                                                                                             |
| `pnpm --filter @template/web lint`                | PASS: full web lint, followed by passing scoped lint on the final modal/hook test edits. No suppression/configuration changes.                                                                                                                                |
| `pnpm --filter @template/web build`               | PASS: complete production build including TypeScript and static/dynamic route generation; no browser/deployment claim.                                                                                                                                        |
| `pnpm --filter @template/web check:e2e-types`     | PASS: existing browser-harness types only; browser execution remains unperformed.                                                                                                                                                                             |
| `pnpm --filter @template/api check:e2e-types`     | PASS: existing API-harness types only; no new backend acceptance claim.                                                                                                                                                                                       |
| Required source/ledger Prettier coverage          | PASS. The literal order-page glob in the brief was unmatched by the installed CLI; all six actual order pages were discovered and checked as explicit paths instead. All other named feature/model/paper/scope/admin-customer patterns and the ledger passed. |
| `git diff --check`                                | PASS.                                                                                                                                                                                                                                                         |

A first unrestricted full run passed 730/730 before the final test additions. A later unrestricted run hit six unchanged 5-second timeouts across existing and new suites during competing machine workloads. The first two-worker rerun exposed two command-observer assertions reading `variables` before React publication. The owning T024 tests now await that actual observable state with waitFor; assertions, production behavior and timeouts are unchanged. Its focused 15 tests pass, and the final complete two-worker run above passes 731/731. A new actual modal regression also proves that a first SALES_COMMAND_CONFLICT keeps frozen input/command identity and explicitly retries the identical body rather than silently allocating another command; its focused four cases pass. No tests were skipped/deleted and no production fixture path was introduced.

| Review boundary / owning guide                     | Completed independent scope verdict | Evidence / remaining limit                                                                                                                                                                                                                           |
| -------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted requirements / fixed OP/F01–F08 decisions | PASS                                | Real forms, scoped reads, command/receipt recovery, pieces and unavailable later lifecycle behavior trace through shared-schema adapters/hooks/models/paper/callers. T029 is excluded and remains explicitly blocked.                                |
| Code style / module ownership                      | PASS                                | Existing API/hooks/model/screens and shared paper owners; one RHF draft capture; no second transport/server-state store, new dependency or speculative framework.                                                                                    |
| Contracts / data                                   | PASS                                | Runtime response/input parsing, stable IDs, explicit allowlists, command bindings and monotonic current-record publication. Existing backend/contracts/migration hashes are preserved; backend T018 acceptance is reused.                            |
| Security / current access                          | PASS at frontend boundary           | Actor/accessVersion/epoch keys and guards, obsolete-root cancellation/removal, no late private publication or next-form callback. Actual server permissions are T018 evidence; real browser access remains later work.                               |
| Frontend / preserved presentation                  | PASS at component/source boundary   | Existing Arabic/RTL paper, dialog, tables, headers, classes, portals, print layouts and legacy default regressions retained; actual loading/error/empty/unknown/confirmed/conflict states. No browser visual or narrow-layout acceptance is claimed. |
| Testing / cleanup                                  | PASS at executed boundary           | Actual QueryClient/RHF/paper/parser behavior with network/API boundary doubles, deferred replies released in exercised cases, test roots/clients cleaned, full 731 tests and required web/harness checks above.                                      |
| Clean-code / test guard                            | PASS                                | Final guard review has no unresolved required production/test correction in completed tasks. Mechanical lint/type findings and observer-publication assertions were corrected in their owning tasks. `clean-code-guard: clean`.                      |
| Documentation / evidence guard                     | PASS for this ledger                | Named paths/symbols/commands checked against current owners/manifests/logs, observed versus reused/unperformed evidence separated. README/PROJECT_REFERENCE integration documentation remains authorized later T041 work.                            |

**Selected Group 3 REQUIREMENTS: BLOCKED. Selected Group 3 ENGINEERING STANDARDS: BLOCKED.** These are overall dependency/readiness verdicts, not reversals of the completed independent task reviews. The smallest next step is a scoped PLAN correction to F04/F06/OP-04 and T029's brief defining explicit user-opened single-draft detail loading through the existing endpoint, with selection/loading/error/scope behavior and preservation of the required piece information. Then resume T029 and its T036/T037 consumers. IMPLEMENT did not rewrite that design, add N+1 detail reads or silently remove required customer-detail content.

Protected baseline comparison found only this task ledger changed among accepted feature artifacts, root roadmap/pointer, API/contracts source and migration history. Checklists remain 16/16 and 36/36 approved/read-only. No `.specify/extensions.yml` exists, so no after-implement hooks apply. No commit, push, deployment, destructive data action or external message was performed. P02/browser/release acceptance remains open, including current roadmap client/release gates.

### T043 — Customer draft-card backend amendment

**Outcome/dependencies**: FR-006/007/017–019/025/027; OP-04A; owner authorization2026-11-05. Depends on existing T018. This is the required additive backend gate before T044/T029; completed original backend tasks/history remain intact.
**Allowed files/symbols**: MODIFY packages/contracts/src/sales-drafts/sales-drafts.schema.ts and its .test.ts, packages/contracts/src/index.ts; apps/api/src/modules/customers/customers.queries.ts findCustomerDraftPage, customers.service.ts drafts, customers.controller.ts drafts, customers.routes.ts; CREATE dto/customer-drafts.dto.ts; EXTEND customers.routes.test.ts, customers.queries.integration.test.ts, customers.service.integration.test.ts; EXTEND apps/api/src/modules/sales-drafts/sales-drafts.http.integration.test.ts and apps/api/src/infrastructure/openapi/openapi.ts/.test.ts. No migration/auth rewrite/generic-list response change.
**Read-before-edit**: OP-04A, contracts §7, data-model §7; current customer read transaction/queries/controller/DTO/routes; actual nested DRAFT_SELECT and shared draft schemas; real HTTP fixture, OpenAPI salesRead; contracts/backend/data/security/testing guides and manifests.
**Steps**: shared strict bounded query/card/output; explicit query select/map + existence/authority transaction; parsed DTO/controller/route/OpenAPI; real PostgreSQL A/B/ADMIN/page/blank/removed/safe-output proof and actual HTTP denial/missing/limits. Reuse existing query patterns and disposable harness; no developer database. Verify current source before each consumer.
**Failures/invariants**: Scoped empty success versus missing customer404; invalid/extra filters400; denied caller403; no other-owner/customer pieces; no write/audit/price/manufacturing and no N+1. Current capture values, not immutable receipt after-images.
**Verification/done**: pnpm --filter @template/contracts test; pnpm --filter @template/contracts build; pnpm --filter @template/api test; pnpm --filter @template/api test:integration src/modules/customers/customers.queries.integration.test.ts src/modules/customers/customers.service.integration.test.ts src/modules/sales-drafts/sales-drafts.http.integration.test.ts; API types/scoped lint. Record actual discovered counts, disposable PostgreSQL cleanup and REQUIREMENTS/ENGINEERING PASS before T044. Missing infrastructure leaves this gate open.

### T044 — Customer draft-card API/query consumer

**Outcome/dependencies**: F10/OP-04A. Depends on T043 acceptance, T019/T020/T022. Produces prepared reads for T029; no screen changes in this bounded task.
**Allowed files/symbols**: EXTEND apps/web/src/features/customers/api/customers.api.ts/.test.ts drafts; hooks/customers.hooks.ts/.test.tsx customerKeys.drafts/useCustomerDrafts. Reuse existing scope/read/errors/invalidation; no independent QueryClient/transport.
**Context**: F02/F10, contracts §7, current customer/draft adapters/read hooks and tests, frontend/contracts/testing guides. Actual backend acceptance from T043 is prerequisite.
**Steps**: strict response adapter with AbortSignal; canonical scoped keys and target validation; guarded query publication; exact destination stale on out-of-range; current command root invalidation already covers new keys. Tests returned cards/nulls, malformed success, selector/page keys, scope changes/late reads and out-of-range recovery.
**Failures/invariants**: Invalid target stays disabled; no fake UUID or previous-owner placeholder; no mutation. Errors remain actual errors, not successful empty lists.
**Verification/done**: pnpm --filter @template/web test src/features/customers; web types/scoped lint. Both reviews PASS then T029, T036 and T037 in that order. Group4 remains unauthorized.

### Owner-authorized Group 3 resumption — 2026-11-05

Earlier BLOCKED evidence is historical. Owner selected one paginated backend response with the existing customer detail cards preserved and authorized necessary scoped planning/backend/frontend completion. OP-04A/contracts §7/data-model §7/F10 and T043/T044 now close the material design decision. Requirements-quality review: existing checklists remain approved16/16 and36/36, markers unchanged; amended design preserves the reviewed authority, presentation, bounded-read and failure criteria. Readiness T043/T044/T029/T036/T037 PASS at artifact/current-source boundary; backend extension acceptance is still unperformed. No product requirement/client-input gate/root roadmap change, commit/push/deploy or Group4 work is authorized by this amendment.

T043 backend acceptance REQUIREMENTS PASS; ENGINEERING PASS. Shared strict max25 query/card schemas, explicit active-piece select/map, current-authority customer service read, thin parsed endpoint and OpenAPI agree. Full contracts128/7 and API unit268/35 pass; focused migrated disposable PostgreSQL/real auth HTTP27/3 pass, including SALES A/B/ADMIN, blank/removed pieces, wrong customer, missing/restricted reads, strict filters and no read side effects. API types and owning backend lint pass. Existing pg adapter emitted a client.query concurrency deprecation warning in integration; no assertion failed or warning was suppressed. Full API integration is additionally running; it is not counted as completed here. No schema/migration/command mutation changed. T044/T029 may now consume the accepted read. The final query adds the same quantity invariant check as the existing draft mapper and reuses MAX_DRAFT_PIECES; full integration rechecks this current source.

### Group 3 resumed implementation and review — 2026-11-05

T044 REQUIREMENTS PASS; ENGINEERING PASS. Added the explicit customer-card API and scoped query/key owner, strict response parser, target/epoch guards and exact destination stale handling for out-of-range recovery. New adapter/hook cases and the existing customer suite pass27/3. The actual sales page additionally proves a formerly fresh page1 refetches after page2 becomes out of range, rather than rendering its stale25 rows. No second transport, cache or per-card request exists.

T029 REQUIREMENTS PASS; ENGINEERING PASS. Existing SALES contact/summary/notes/actions, measurement table and per-draft/per-piece grids remain. Existing ADMIN summary/table remain. Exact phone resolution latches a stable UUID and disables the old resolver; current customer/card/history requests use that ID. Both details are keyed by actor/accessVersion/epoch/route, show actual loading/error/retry/empty/background states, and expose controlled server pagination. Each card displays current general notes and all active captured model/leather/size rows including blanks. Historical measurement rows are explicitly provisional piece measurements rather than fabricated approved orders; A/F captures remain visible. Later location/manufacturing/warehouse/completion figures are unavailable, never fake zeros or local projections. ADMIN links real drafts into authorized sales detail. Actual transport/QueryClient screen cases pass for A/B/ADMIN supplied projections, complete25-row/second pages, independent measurement paging, missing/invalid/error, retained current-phone actions, no per-card fetch, scope replacement and out-of-range recovery. No browser visual claim is made.

T036 REQUIREMENTS PASS; ENGINEERING PASS. Added a real shared QueryClient editor+ADMIN detail case: confirmed immutable version2 receipt, newer current customer version3, failed related-card invalidation, frozen submitted fields and no navigation, then read-only refresh resets from current3 without another PATCH. Added lost draft reply → absent receipt → same frozen command/body replay, preserving one draft/version at the controlled transport boundary. Reused existing same-user/new-epoch cleanup, late actor, dirty/stale version conflict, wrong receipt/current-after-image and inline uncertainty regressions rather than duplicating them.

Two new rendered regressions reproduced genuine data-loss defects before correction: a background detail error unmounted the dirty customer editor and dirty paper. Corrected only their T036-authorized route owners to reserve missing/error replacement for absent authoritative data, keep the actual RHF editor mounted when valid cached data exists, and show read-only retry feedback. Both dirty captures now survive failed reads and successful retry. Assertions first await actual observer publication; initial immediate checks were corrected to observe the error before assessing retained controls. The lost-reply test fixture was also corrected to actually return404 during observation, before replay, without weakening its frozen-body/no-extra-draft assertions.

Guard review: sales-customer-edit-view.tsx and sales-create-order-view.tsx — corrected background-error unmount/data loss, each with a red→green actual-form regression. New admin/customer detail safe-null/unused-render/import-spacing lint findings were corrected in place. No suppression, new dependency, test skip, root policy change or migration rewrite. Clean-code guard: 2 functional findings fixed, 0 unresolved. Test guard uses actual forms/QueryClient/parsers and transport/API doubles only outside the claimed boundary; HTTP/persistence remain separate fresh backend evidence. Final T037 aggregate acceptance follows after all required checks complete.

### T037 — Final resumed Group 3 acceptance, 2026-11-05

**REQUIREMENTS PASS. ENGINEERING STANDARDS PASS.** This supersedes the earlier historical Group 3 BLOCKED verdict: the owner authorized preserving the current cards with a dedicated bounded read, OP-04A/F10 and T043/T044 were filled before coding, the backend passed before dependent integration, and T029/T036 now have executed evidence. All original T019–T037 plus the two necessary amendment tasks T043/T044 are complete. Group4 T038–T042 remains unchecked/unperformed; this is frontend-group acceptance, not whole P02, browser, deployment or release acceptance.

| Fresh executed check                                       | Result                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @template/contracts test`                   | PASS128 tests /7 files.                                                                                                                                                                                                                                                                            |
| `pnpm --filter @template/contracts build`                  | PASS; new shared runtime exports built before API/web consumers.                                                                                                                                                                                                                                   |
| `pnpm --filter @template/api test`                         | PASS268 tests /35 files.                                                                                                                                                                                                                                                                           |
| Focused customer queries/services + sales HTTP integration | PASS27 tests /3 files against the owned migrated disposable PostgreSQL and real auth/Express stack.                                                                                                                                                                                                |
| `pnpm --filter @template/api test:integration`             | PASS186 tests /15 files, including the current quantity guard and new endpoint. Existing pg `client.query` deprecation warning remained visible; no failures or suppression.                                                                                                                       |
| `pnpm --filter @template/api check-types`                  | PASS.                                                                                                                                                                                                                                                                                              |
| Owning API and contracts ESLint                            | PASS; exact new/changed backend/schema owners.                                                                                                                                                                                                                                                     |
| `pnpm --filter @template/web test --maxWorkers=2`          | PASS750 tests /73 files, final full run after all source/test fixes. Worker count bounds machine contention; no timeout/assertion/retry policy was changed.                                                                                                                                        |
| `pnpm --filter @template/web lint`                         | PASS full web after correcting safe-null/unused-render/import spacing findings.                                                                                                                                                                                                                    |
| `pnpm --filter @template/web check-types`                  | PASS Next route generation and TypeScript; subsequent complete build also checks current source types.                                                                                                                                                                                             |
| `pnpm --filter @template/web build`                        | PASS complete production build and route generation.                                                                                                                                                                                                                                               |
| Web and API `check:e2e-types`                              | PASS both harness typechecks; browser execution remains unperformed.                                                                                                                                                                                                                               |
| Required Prettier coverage plus amendment owners           | PASS customer/sales/order/scope/admin-customer sources, six explicitly discovered order pages, amended feature plan/tasks/data/frontend/contracts and changed API/shared-schema paths. Explicit page paths replace the installed CLI's unmatched literal parenthesized glob; coverage is retained. |
| `git diff --check`                                         | PASS.                                                                                                                                                                                                                                                                                              |

Review traced shared schemas → explicit scoped query/authorized service → validated route/controller/OpenAPI → runtime-parsing adapter → actor/accessVersion/epoch query keys/guards → preserved customer screens and real command/form consumers. Existing T018 backend evidence and unchanged foundations remain valid; fresh extension integration/unit checks above are separate. No N+1 HTTP or per-row service lookup, false empty-on-error, first-customer fallback, new cache/store, manufactured price/progress/approved measurement, duplicate write on observation or stale receipt overwrite remains in the converted path. Current customer summaries and each related section retain their actual server scope and independent error/page states.

Requirements review covers the owner-approved existing-page preservation, optional/blank captures, current contact identity, bounded cards/measurements, A/B/ADMIN projections, current-phone actions, recovery and unavailable later lifecycle. Engineering review covers canonical ownership/strict schemas and projections, existing authority transaction, pagination/batched read, safe errors, scoped QueryClient invalidation, persistent RHF captures and preserved presentation. Real HTTP permission/persistence proof comes from the backend tests, while component doubles prove only their frontend boundary. Browser layout/focus/relogin checks remain Group4. Existing README/PROJECT_REFERENCE P02 documentation remains T041 work rather than an unapproved Group3 rewrite.

Clean-code guard: `sales-customer-edit-view.tsx` and `sales-create-order-view.tsx` — fixed two background-error unmount/data-loss findings with actual red→green form regressions. `clean-code-guard: 2 fixed, 0 flagged for author`. Test guard found no unresolved required issue after correcting observer-publication timing and the lost-reply fixture; no assertion was weakened or test skipped. Documentation guard verified amended symbols, paths, bounds, scripts and actual evidence against current source/manifests/logs. The selected group has no remaining material design or execution gate.

Final protection check: root roadmap, active feature pointer, all prior migration SQL and both approved checklists retain their intake hashes. The spec is unchanged; only the explicitly authorized technical design/task amendment and scoped implementation were written. The extension hook file is absent, so no plan/tasks/implement hooks apply. No commit/push, deployment, external message or destructive/developer-data operation occurred. Disposable integration infrastructure was owned by the existing harness; no developer/production database substituted for it. Root NUM-01/P03/OPS-01 and whole-phase/release gates remain intact.

### Group 4 intake and T038 — 2026-11-05

Selected T038–T042 only; backend T018/T043 and frontend T037 matching acceptance were checked against current source. Requirements checklists remain approved16/16 and36/36 and read-only. Existing dirty P02 work is preserved; no extension hook file exists. The actual disposable harness has Docker and its matching Chromium installed. Group4 test/source/docs corrections retain all roadmap/client/release gates and no commit/push/deployment authorization.

T038 REQUIREMENTS PASS; ENGINEERING PASS at its real-browser/test boundary. Real registration/captured verification/ADMIN SALES approval provision separate contexts with each project's actual viewport. Customer creation with absent optional fields, shared discovery, Saudi equivalent-phone409 preserving input, same ID after phone/email edit, case-insensitive email search, duplicate email with a different phone and honest unknown-phone feedback pass on desktop1440×900 and narrow390×844. Both profiles assert retained Arabic/RTL/Cairo. Runtime credentials/action links are not logged; contexts close in finally and the harness owns teardown. No intercepted success or direct database access.

The first actual route check exposed a producing T025/T028/T029 defect: the installed Next route supplies `%2B966…` as the phone segment; screens previously validated it as raw phone input. Corrected the route-facing customer model/screens to decode exactly once, reject malformed/double-encoded segments and retain the existing raw phone normalization policy. Three new actual-screen cases failed before correction; the affected model/customer/detail/edit regression run now passes48/6 plus web types. No backend or public contract changed. A development cold-route Fast Refresh reload also interrupted the first journey; running the existing required missing-phone branch before creation warms that real route without a fake success, sleep or retry. The narrow test fixture initially reused the desktop contact name and hit two legitimate shared rows; project-specific names fix the test ambiguity, without filtering away another owner's valid contact. The final focused command `pnpm --filter @template/web test:e2e e2e/customer-drafts.spec.ts --grep P02-C1` passes2/2 on both profiles. Safe temporary route diagnostics were removed; trace/video/screenshots remain off. Existing pg deprecation/NO_COLOR/Fast Refresh development warnings remained visible.

### T039 — 2026-11-05

REQUIREMENTS PASS; ENGINEERING PASS. Focused P02-C2: **4/4** (desktop and narrow), retries zero. Blank SHOP saves without customer/date/paid/specifications and reopens identically after real logout/login. Inline cancel sends no command and restores focus; confirmed inline customer retains unsaved paper and does not implicitly save it. Actual responses/reopened state verify distinct middle/final additions, M1/M2/M3/face, A/F/side/general notes, signature, hidden repair/adjustment captures, date and provisional paid amount. Negative paid and malformed calendar date are rejected without replacing saved state. Actual IDs prove retained original, new copy, removed second piece and ordered positions. Unavailable totals/submission/official print remain explicit.

A test sequencing failure on narrow occurred when clicking Copy before the first-save navigation finished; the helper now awaits the actual stable edit URL and hydrated notes before continuing. No timeout increase, retry, intercepted success or harness change. Focused browser run `/tmp/p02-g4-c2-navigation.log`; earlier failing diagnostics remain local. Both viewport contexts close and the disposable stack tears down. Existing controlled component/model tests remain the proof for finer capture/final-row boundaries; browser evidence is complementary.

### T040 — 2026-11-05

REQUIREMENTS PASS; ENGINEERING PASS. Focused P02-C3 **6/6** on desktop/narrow (`/tmp/p02-g4-c3-final.log`), followed by strengthened privacy **2/2** (`/tmp/p02-g4-privacy-final.log`). Shared C retains private A/B draft cards/count/latest measurements/activity. Direct foreign and missing reads have safe404 DRAFT_NOT_FOUND; foreign write has the same code and leaves A unchanged. ADMIN sees both drafts with each specific original owner retained. A/B stale contact edits and two A-owned stale draft sessions preserve losing input; explicit review loads the winner.

Lost-reply uses real route.fetch commit then aborted delivery, never fabricated success. Observing the original receipt after a later revision loads current revision2 while the saved receipt stays revision1. A subsequent confirmed revision3 with an aborted real GET shows the separate refresh-failure state; explicit refresh recovers. Final real list/history prove one draft/one piece, one POST, three intended command effects and no duplicated event. Controlled epoch/late-cache and PostgreSQL races remain the matching T036/T017 evidence rather than inferred browser coverage.

Earlier runs exposed test-observation races: reading a response after navigating away from the restored editor, and awaiting a transient notice after first-save navigation remounted the editor. Fixed by awaiting actual restored selection before installing profile listeners, consuming independent response bodies immediately, and verifying stable edit URL/current hydrated capture for first creation (existing saves still assert their notice). No deadline increase, retry, sleep, skip, fixture success or harness policy change. Browser typecheck and focused ESLint pass after type-only imports replaced forbidden inline type imports. Context teardown releases routes/listeners; no credentials/action links or images are logged.

### T041 — documentation review, 2026-11-05

README and PROJECT_REFERENCE now describe actual shared contacts, owner-scoped manual incomplete saves, piece identity, receipt/current-state recovery, converted screens and retained Arabic/RTL/Cairo. Source references checked against customer/draft/command modules, strict contracts, operational scope, route owners, migration SQL and actual package/browser scripts. No new endpoint/config/sample or product decision is invented. P01 facts and later P03/NUM-01/OPS-01 boundaries remain; local proof does not imply deployment, real mail, production migration or release. Scoped formatting/reference and final aggregate results follow below.

T041 REQUIREMENTS PASS; ENGINEERING/DOCS PASS. Both scoped Prettier checks and git diff --check pass; all touched local links resolve. No command, environment setting, P01 release procedure or unrelated documentation section changed.

### T042 review corrections — 2026-11-05

The first full exit run passed all lint/types/unit/integration/build/output/harness-type/browser/diff checks, with **20/20 browser tests**, but root formatting failed solely on the pre-existing compact ignored `.specify/feature.json`. T001 permits pointer modification only for selection repair; the correct selection and its bytes are preserved while a concrete formatting-only exception awaits the owner. No ignore rule or check was weakened.

The review corrected the earlier narrow Copy diagnosis: awaiting navigation made the test deterministic, but current T031 source also exposed a real editable window after first-save acknowledgement and before the saved-route remount. A held-navigation component regression failed against that source (`/tmp/p02-g4-navigation-red.log`). Returned to T031: the existing editor now derives a navigation lock from new-entry/saved-base, guards mutation handlers and late prefill, and stays read-only until the real edit entry mounts. No wire/authority/presentation/design decision changes. T031 and T032 component tests now model that route transition before further edits, preserving their original same-ID and inline-capture assertions rather than treating a mocked router as a completed navigation.

Focused corrected component tests **20/20 across3 files**, followed by all web tests **754/754 across73 files**. Test-guard also identified missing real inline-error coverage from VR-004: T039 now creates a contact through the real UI, submits a duplicate inside the actual inline modal, observes409 CUSTOMER_PHONE_CONFLICT, retains modal values/unselected state/read-only paper capture, then explicitly changes phone and saves the distinct confirmed contact. Exactly the failed and successful customer requests occur, with no draft request until explicit paper Save. The complete P02-C2 journey passes **4/4** on both profiles (`/tmp/p02-g4-inline-error-browser-final.log`).

The initial new assertion mistakenly looked for an editable notes input while the modal deliberately puts the paper in read-only mode; it now checks the actual rendered paper text, followed by real persisted capture assertions. No timeout/retry/success interception or requirement was relaxed. All affected source/consumer signatures were checked against the accepted briefs before these owner corrections. Final aggregate checks below supersede earlier results for the changed editor/tests.

Production review: clean-code-guard: clean. The route parser remains a small shared boundary for the three reached screens; the new navigation lock is derived locally without a new state owner/effect/cache or mutable module state. React review preserves the existing QueryClient/RHF ownership, session fencing and component keys. Test-guard PASS for real infrastructure, strict outputs, per-resource owner assertions, losing input and final effects; no internal helper mocks, skipped cases, fabricated success or timing sleeps. Docs-guard PASS for the two scoped reference updates and ledger claims. Overall engineering/phase verdict still waits for final checks and the formatting exception; these correction reviews alone do not close T042.

The earlier full dev-browser run logged one Next JSON-parse diagnostic for /admin/dashboard while all20 journeys still passed; it also logged Fast Refresh, NO_COLOR and pg concurrent-query deprecation warnings. They were not suppressed. The final run is serialized after production checks with no concurrent source edits; local dev-browser proof and successful production compilation remain separate from release/runtime verification.

### T042 final verification and bounded verdicts — 2026-11-05

Current state: main at b286d4e plus the preserved dirty/untracked P02 implementation. Selected Group4 T038–T042, with already accepted T018/T043 backend and T037 frontend prerequisites. T038–T041 are complete. All44 accepted task markers are complete except **T042**, which stays unchecked solely for the formatter gate below. No remaining material product/interface/design decision or required source/test correction was found.

| Required check after final editor/test corrections | Actual result | Evidence / freshness                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm format:check                                  | **BLOCKED**   | Only pre-existing ignored .specify/feature.json is nonconforming compact JSON; correct selection preserved. Concrete formatting-only exception requested and unanswered; no assumption of consent.                                              |
| pnpm lint                                          | PASS          | All4 packages; web fresh,3 unchanged-package results cached from this turn's earlier fresh pass.                                                                                                                                                |
| pnpm check-types                                   | PASS          | All4 packages; web fresh,3 unchanged-package results cached.                                                                                                                                                                                    |
| pnpm test                                          | PASS          | 1171 tests in117 files: contracts128/7, database21/2, API268/35, web754/73. Latest web suite fresh after the correction; other package tests reuse this turn's fresh unchanged-source results. Turbo5/6 tasks cached includes2 build producers. |
| pnpm test:integration                              | PASS          | Fresh API186/15 and database26/2 against separate migrated disposable PostgreSQL containers;2 cached producer builds, neither integration suite cached.                                                                                         |
| pnpm build                                         | PASS          | Fresh web production compilation;3 unchanged producer/API builds cached from this turn's successful builds.                                                                                                                                     |
| pnpm verify:build-output                           | PASS          | 6 required entry artifacts;416 emitted files checked, no test artifacts.                                                                                                                                                                        |
| pnpm --filter @template/web check:e2e-types        | PASS          | Direct fresh harness typecheck.                                                                                                                                                                                                                 |
| pnpm --filter @template/api check:e2e-types        | PASS          | Direct fresh harness typecheck.                                                                                                                                                                                                                 |
| pnpm --filter @template/web test:e2e               | PASS          | 20/20,10 desktop and10 narrow, zero retries. Includes final inline error/navigation behavior plus retained P01 C1–C4 regressions.                                                                                                               |
| git diff --check                                   | PASS          | No whitespace errors in tracked changes; scoped authored files also formatted.                                                                                                                                                                  |

Final command outputs: /tmp/p02-g4-exit-results.json and /tmp/p02-g4-exit-_.log. The aggregate runner intentionally retained a nonzero final result for format failure while allowing all independent checks to finish; it did not convert that failure to PASS. First-run logs remain /tmp/p02-g4-first-exit-_.log. No source edit or production build ran concurrently with the final browser suite. The earlier one-off Next JSON-parse diagnostic did not recur in this final run; Fast Refresh, NO_COLOR and pg deprecation warnings remain visible and unsuppressed. These results establish the stated local boundaries, not a deployed-stack or provider release claim.

| Review coverage                            | Verdict / supporting boundary                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accepted requirements/operation blueprints | REQUIREMENTS PASS: FR-001–027 / SC-001–008 / VR-001–005 behavior is supported by the actual contract, real DB/HTTP, component and browser evidence; prior backend admission preceded dependent integration. Whole-phase exit still requires its formatting gate.                                                                                 |
| Code style, module ownership, strict types | Changed production/test owners PASS: one shared route-input parser, derived navigation lock, no duplicate transport/state/validator or unsafe authority cast. Lint/types pass. Root formatting remains BLOCKED as explicitly recorded.                                                                                                           |
| Backend/API contracts/data                 | PASS at T018/T043 plus fresh service/HTTP/migration regressions: strict allowlists/projections, current authority, bounded reads, phone uniqueness, immutable owner/history, CAS/replay/rollback and actual final state. Historical SQL unchanged.                                                                                               |
| Frontend/React/security boundaries         | PASS: preserved Arabic/RTL/Cairo/paper; scoped QueryClient/RHF and current identity/epoch fences; stable customer/piece identities, retained conflicts and distinct unknown/confirmed-refresh outcomes; no fixture success or credentials in local/session storage. First-save old editor cannot accept edits that its navigation would discard. |
| Testing/test-guard                         | PASS: discovered tests exercise actual claimed boundaries, each ADMIN draft/owner pair is checked, real inline409 preserves captures, stale losers/current winners and receipt/current versions are distinct. Real route.fetch commits before delivery abortion; no fake fulfilled success, skip, retry, timing sleep or harness-policy change.  |
| Documentation/docs-guard                   | PASS: only scoped README/PROJECT_REFERENCE updates plus this execution ledger; referenced interfaces/paths/commands agree with source/manifests and local links resolve. P01 facts, remaining MVP domains and P03/NUM-01/OPS-01 limits are retained.                                                                                             |
| Overall engineering acceptance             | **ENGINEERING STANDARDS BLOCKED** solely by root format check and T001's pointer write boundary. Production/test/docs guard passes do not waive that check.                                                                                                                                                                                      |

| Acceptance boundary | Final status                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| BACKEND             | PASS for accepted P02 backend including T043; fresh real PostgreSQL/HTTP evidence supports the unchanged implementation.            |
| FRONTEND            | PASS including encoded-phone routing and navigation-lock corrections;754 component/unit tests and real integrated browser evidence. |
| BROWSER             | PASS20/20 on the current source, both profiles.                                                                                     |
| P02                 | **BLOCKED at T042 only** until the formatting-only pointer exception is authorized/applied and root formatting passes.              |
| RELEASE             | UNPERFORMED / outside authorization; P03/NUM-01/OPS-01 retain their recorded gates.                                                 |

Cleanup and preservation: all test-created contexts closed, the harness finished teardown, zero private p01-e2e runtime directories remain, and zero image/video/trace artifacts were emitted. Protected baseline SHA-256 comparison covers20 files: root roadmap, feature selection, accepted designs/checklists, every migration SQL and existing browser/harness files; only this permitted task ledger differs. No extension hook file exists, so before/after hooks are skipped. No commit/push/deployment, real mail, catalog import/activation, preserved-target migration/data action or unrelated cleanup occurred.

Concrete remaining action: format .specify/feature.json from its compact one-line JSON to the same property/value on three lines, retaining feature_directory=specs/002-shared-customers-drafts. T001 currently permits pointer changes only for selection repair; its selection is already correct. The owner exception remains pending. Once authorized, format only that file, rerun pnpm format:check and git diff --check, record the actual result and reassess ENGINEERING/P02/T042. No product suite rerun is needed for unchanged semantic machine-local selection alone.

### Authorized formatting exception and T042 closure — 2026-11-05

The owner explicitly answered **“Format the file; keep the same selection (Recommended)”**. That authorization covers this routine exception to T001's pointer edit limit. Applied only the installed Prettier formatter to .specify/feature.json; parsing confirms the sole property remains feature_directory=specs/002-shared-customers-drafts. Prettier's canonical form retains this short object on one line with spaces, rather than the three-line shape proposed in the question; only whitespace changed. No selection, product decision, accepted blueprint or requirement changed.

Fresh **pnpm format:check PASS** (`/tmp/p02-g4-authorized-format.log`) and **git diff --check PASS** close the sole remaining gate. The final editor/test source is unchanged from the successful aggregate:1171 unit/component tests,212 real-database integration tests,20 real-browser tests on both profiles, lint, types, production build, build-output and both harness typechecks all PASS with the cache/freshness distinctions recorded above. This machine-local whitespace-only change requires no product suite rerun.

This closure supersedes the earlier pending-format ENGINEERING/P02 BLOCKED rows: **REQUIREMENTS PASS; ENGINEERING STANDARDS PASS; BACKEND PASS; FRONTEND PASS; BROWSER PASS; P02 PASS for local accepted scope. RELEASE remains UNPERFORMED and outside this command**, with P03/NUM-01/OPS-01 boundaries preserved. All selected T038–T042 and all44 accepted P02 task markers are now complete. No required in-scope finding, material planning gap or unanswered approval remains.

Protected baseline permits exactly two differences: this task ledger and the explicitly authorized whitespace-only selection file. Root roadmap, accepted requirements/design/checklists, all migration SQL and pre-existing browser/harness files remain byte-identical. No extension hooks exist. No commit/push/deployment or preserved-target data action was performed. A final formatting/diff confirmation follows this evidence append.

## Phase 1: Convergence

This is the first numbered convergence section within the existing P02 feature, not a new roadmap phase. Assessment covered current source and recorded evidence for all 44 prior tasks, FR-001–027, SC-001–008, US1–US6's 23 acceptance scenarios, VR-001–005, OP-01–09/OP-04A and the ratified constitution. The earlier completion markers and acceptance records are preserved as historical evidence; the following current gaps require a later authorized IMPLEMENT pass. No tests, builds, generators or formatters ran during this convergence assessment.

- [x] T045 [US5] Recover customer measurement pagination after result shrink per FR-007/018/025/026, SC-004/008 and frontend F02/F10 (partial).
- [x] T046 [US3] Honor updated order-status entries during soft navigation and verify the corrected frontend per FR-018/025/027, SC-008 and frontend F05/F06 (partial).
- [x] T047 Append accurate diagnostic-log references without rewriting prior evidence per T042 and code-review documentation accuracy (partial).

### T045 — Recover a stranded provisional-measurement page

**Finding / outcome / dependencies**: F1, HIGH, partial. Depends on the existing T018/T043 backend admission, T022/T029/T044 measurement/customer consumers and their current source; those foundations are reused, not reimplemented. FR-007/018/025/026, SC-004/008 and frontend F02/F10 require bounded navigable measurements with truthful empty/error states. A successful response for an out-of-range page must move to the last available page (page 1 for zero total) and obtain current rows.

**Current evidence**: `apps/web/src/features/sales/screens/sales-customer-detail-view.tsx` stores independent `measurementPage` at lines 42–50, but lines 54–58 recover only draft-card `page`. `useCustomerMeasurements` in `apps/web/src/features/customers/hooks/customers.hooks.ts` lines 206–228 lacks the exact destination-key invalidation already implemented by `useCustomerDrafts`. The shared `DataTablePagination` hides controls at `totalPages <= 1` (line 34). With 26 qualifying measured pieces and measurement page 2 open, an allowed save clearing size/A/F on one piece reduces the total to 25. Refetch returns an empty page 2 with one total page: no page-1 read follows and navigation disappears. Clearing the remaining measurements to zero also fails to reset the page. Existing detail tests cover ordinary page 1→2 navigation, not this shrink.

**Allowed file actions**: MODIFY only `apps/web/src/features/customers/hooks/customers.hooks.ts` (`useCustomerMeasurements`), `apps/web/src/features/sales/screens/sales-customer-detail-view.tsx` (`CustomerDetail`), and their existing tests `apps/web/src/features/customers/hooks/customers.hooks.test.tsx` and `apps/web/src/features/sales/screens/sales-customer-detail-view.test.tsx`. APPEND execution/review evidence to this task ledger and mark T045 only after verification. Do not change API/contracts/migrations, shared pagination, draft-card/history/activity semantics, accepted artifacts or earlier task markers.

**Read-before-edit context**: Feature plan OP-02/04/04A/08; frontend F02 query keys/out-of-range policy, F03 invalidation and F10 independent measurement pagination; contracts customer measurements and data-model §4. Read the four allowed files completely, `customerKeys.measurements`, `useCustomerDrafts`' current scoped destination-staleness pattern, `customersApi.measurements`, `customers.queries.ts`' qualifying measurement predicates, `operational-scope.ts`, `sales-commands.hooks.ts` root invalidation, and `data-table-pagination.tsx` as a read-only caller. Revisit frontend-standard §§5/7/8, api-contracts §6, testing component/cleanup guidance, code-review, apps/web instructions and applicable installed Next guidance.

**Ordered implementation**:

1. Keep the existing `useCustomerMeasurements(customerId, options)` interface, parsed UUID/query, captured operational scope, existing API adapter and AbortSignal forwarding.
2. In its guarded query function, await the real measurement response, assert the captured scope is still current, and compute `destination = Math.max(1, data.pagination.totalPages)`. When requested page exceeds destination, await invalidation of exactly `customerKeys.measurements(scope, id, destination, query.limit)` with `exact: true, refetchType: "none"` before returning the response. Reuse the concrete `useCustomerDrafts` protocol; do not clear the feature cache or introduce another key/helper/state owner. Preserve structural-sharing parsing/publication guards and rejected reads.
3. In `CustomerDetail`, independently derive the measurement last page from available successful measurement data and lower `measurementPage` when necessary. Keep the current page while first data is unavailable; errors must not be converted into a fabricated zero total. The changed key must fetch the invalidated destination once, including page 1 for total zero, without a render/refetch loop.
4. Keep draft-card `page` independent, stable phone→customer-ID resolution, provisional labels, scope changes, retry feedback, classes/layout and current controls unchanged.

**Meaningful tests / invariants**: Extend the existing real QueryClient/component tests with transport-boundary responses. Cache a fresh page 1 of a 26-measurement result, navigate to page 2, change the backing fixture to 25 (remove a page-1 measurement so the destination rows actually differ), then invalidate/refetch. Assert an actual fresh page-1 request and the changed current rows, not merely a numeric page change or stale cached rows. Cover total zero resetting to page 1 with an honest empty state; failed read remaining an error; no old-scope response invalidating/publishing into a new scope; and unchanged draft-card pagination. Use existing valid schema fixtures, no private hook mocks, sleeps, relaxed timeouts or fabricated persistence claims. Do not invent history deletion or later non-DRAFT states to test this current measurement capability.

**Verification / done**: First run `pnpm --filter @template/web test src/features/customers/hooks/customers.hooks.test.tsx src/features/sales/screens/sales-customer-detail-view.test.tsx`, plus `pnpm --filter @template/web lint` and `pnpm --filter @template/web check-types`. Use scoped formatting checks and `git diff --check` during the later IMPLEMENT command; preserve unrelated edits/generated outputs. Unmount roots, clear test-owned QueryClients and settle deferred responses. Done when the shrink/cached-destination/zero/error/scope regressions pass and requirements plus engineering reviews pass. Final combined phase checks follow T046; component evidence does not claim new database or browser pagination execution.

### T046 — Reset the existing orders view for a changed route entry

**Finding / outcome / dependencies**: F2, HIGH, partial. Depends on T026/T034 and T045; the latter dependency serializes the final combined verification after both frontend corrections. FR-018/025/027, SC-008 and frontend F05/F06 require the reached orders route to honor its parsed status and preserve real navigation/readiness behavior.

**Current evidence**: `apps/web/src/features/sales/screens/sales-all-orders-view.tsx` lines 25–36 initializes local status from `entry` once and subsequently ignores new valid/unavailable entries. `apps/web/src/app/(workspace)/sales/orders/page.tsx` supplies new parsed entries without a key. Installed Next `dist/client/components/layout-router.js` lines 464–488 explicitly preserves client state across search-parameter changes. The existing sales sidebar links to `/sales/orders` (`prototype-data.ts` line 126, rendered by Next Link in `app-shell.tsx` lines 368–370). Opening `/sales/orders?status=قيد التصنيع` and then that existing base-route link can leave the valid base URL showing the old unavailable status. Invalid→ALL has the same stale-state issue; ALL→later can continue showing drafts for a newly requested unavailable status. Existing page tests mount each status separately and miss same-instance navigation.

**Allowed file actions**: MODIFY `apps/web/src/app/(workspace)/sales/orders/page.tsx`; EXTEND existing `apps/web/src/features/sales/screens/sales-all-orders-view.test.tsx` and `apps/web/e2e/customer-drafts.spec.ts`. APPEND actual verification/review evidence to this ledger and mark T046 only when supported. The existing `SalesAllOrdersView` interface and local filter logic are reused without a new component family, effect, router/state framework, route or API. Do not change its model/parser, shared shell/sidebar, lifecycle availability, accepted artifacts, prior markers or backend implementation.

**Read-before-edit context**: Feature plan OP-04/08, frontend F05 serialized `DraftListEntry` and F06 reached read consumers, T026/T034/T038–T040 briefs. Read the three allowed files, `SalesAllOrdersView`, `parseDraftListEntry`/`DraftListEntry` in `draft-form.model.ts`, `useDraftList`, the actual sidebar Link caller and existing browser `goto`/provision/save helpers. Read apps/web instructions and installed Next App Router search-params/use-router/Link guidance; the installed layout-router state-key implementation is concrete supporting evidence. Apply frontend-standard §§3/5/7/8 and testing real component versus browser boundaries.

**Ordered implementation**:

1. Await status search params and parse `DraftListEntry` once in the existing thin server page. Preserve the public page/child interfaces and accepted invalid/repeated/later-status classification.
2. Key the existing `SalesAllOrdersView` by normalized entry identity: `"invalid"` for invalid entry, otherwise `${entry.kind}:${entry.status}`. Use only the parsed bounded discriminated union; no raw query/credential enters the key. Pass that same parsed entry to the view. A genuinely different entry remounts its existing local filter owner; normal All/Draft/search/type interaction within the same entry remains unchanged.
3. Extend the existing awaited-page test using successive `Page({searchParams: Promise.resolve(...)})` elements rerendered under the same real QueryClient. Cover later→ALL, ALL→later and invalid→ALL; require real allowed rows on recovery and no new draft read for the invalid/unavailable destination. Preserve supported All/Draft local filter/search behavior and pagination reset rather than replacing it with route-only filtering.
4. Extend the existing P02-C2 browser journey, reusing its owned saved draft/account. Open the recognized later-status URL, assert readiness, then follow the actual sidebar AllOrders Next Link to the base route (open the existing sidebar on narrow as needed). Observe the real scoped draft response and saved draft link. This must exercise soft navigation; replacing the link click with a hard page.goto/reload does not reproduce the defect. Retain both existing profiles and all harness safety/cleanup rules.

**Invariants / failure behavior**: No fixture orders, submission/number/pricing authority or later lifecycle query is introduced. Invalid/unavailable entries remain visibly distinct and send no misleading draft read; allowed entries use current owner-scoped real data. Preserve Arabic/RTL/Cairo, navigation, existing local filters, QueryClient/transport/session owners and default later-phase boundaries. No browser helper/seed endpoint, direct database access, credential output, screenshot/trace/video, arbitrary sleep, retry, timeout increase or route-fulfilled fake success.

**Verification / done**: Run `pnpm --filter @template/web test src/features/sales/screens/sales-all-orders-view.test.tsx src/features/sales/model/draft-form.model.test.ts`, both existing harness typechecks and `pnpm --filter @template/web test:e2e e2e/customer-drafts.spec.ts --grep P02-C2` on desktop/narrow. After all T045/T046 edits and focused fixes, perform T042's complete applicable exit set once: `pnpm format:check`, `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm verify:build-output`, both harness typechecks, `pnpm --filter @template/web test:e2e` and `git diff --check`. Serialize builds and browser runs; use only harness-owned PostgreSQL/API/Next/mail resources, never a preserved target or root `pnpm verify` shortcut. Record fresh versus cached evidence, warnings and separate requirements/engineering/backend/frontend/browser/P02/release verdicts; unchanged backend admission is reused with matching current source, not reimplemented. Done when the soft-navigation regressions, combined checks and both conformity reviews pass. Release/P03/NUM-01/OPS-01 remain outside this task.

### T047 — Clarify the historical diagnostic-log references append-only

**Finding / outcome / dependencies**: F3, LOW, partial. Depends on T046 for the final corrected-source evidence to be available. T042 requires accurate actual verification references; code-review §4 and docs-guard Rule 1 require referenced paths to agree with their owners. This is a small documentation correction, not a missing runtime gate or a requirement to repeat successful product suites.

**Current evidence**: Prior task-ledger line 1570 contains literal `/tmp/p02-g4-exit-_.log` and `/tmp/p02-g4-first-exit-_.log`; those paths do not exist. The valid `/tmp/p02-g4-exit-results.json` explicitly lists real named log files, and `/tmp/p02-g4-authorized-format.log` plus `/tmp/p02-g4-closure-format.log` support the subsequent formatter closure. Recorded results remain supported; the malformed wildcard text needs a readable correction.

**Allowed file actions**: APPEND only an evidence-reference clarification and actual new execution/review results to `specs/002-shared-customers-drafts/tasks.md`; a later authorized IMPLEMENT may mark the new convergence task verified. Do not rewrite any prior paragraph/path, task ID, marker, blueprint, requirement, approval or result. No README/source/configuration/runtime change is needed.

**Read-before-edit context**: T042's brief and final verification/formatting-closure records, `/tmp/p02-g4-exit-results.json`, the actual referenced diagnostic files if still available, `docs/engineering/code-review.md` §4 and docs-guard claim/reference checks. Re-read the later T045/T046 results; ephemeral /tmp diagnostics must be labelled as such, and missing later files are reported rather than fabricated.

**Ordered steps / preserved behavior**:

1. Append a dated correction explicitly identifying the two earlier literal underscore paths as malformed pattern text. Keep the entire earlier record byte-for-byte intact.
2. Use code-delimited existing filenames obtained from the results JSON, or explicitly labelled code-delimited glob patterns `/tmp/p02-g4-exit-*.log` and `/tmp/p02-g4-first-exit-*.log`; verify actual matches before claiming availability. Keep the results JSON and formatting-closure references separate, because the earlier aggregate's format failure was subsequently resolved rather than retroactively passing.
3. Append the actual new T045/T046 validation and current verdict references without relabelling old/cached runs as fresh. Do not reassert whole-P02 acceptance before the new corrections and required checks have passed. Release remains unperformed unless separately authorized.

**Verification / done**: Check each appended reference against existing files/results metadata and manually inspect the appended Markdown/code delimiters. During the later IMPLEMENT use documentation-only scoped formatting/diff checks; no application tests or database/browser activity is justified solely for this reference correction. Any formatter must preserve prior bytes, not rewrite historical text. Apply docs-guard and separate requirements/engineering documentation review. Done when the clarification resolves the two false path references, accurately cites real evidence or its explicit availability limit, and all prior content is preserved.

### T045 implementation and review — 2026-11-06

Selected scope is T045–T047 only. The feature resolves to this existing P02 directory; custom and built-in checklists remain read-only at36/36 and16/16. T018/T043 backend acceptance and current measurement API/query/contract/authority owners were reconciled before dependent work; no backend or wire change is needed. All three selected briefs are filled and current; no material design gap was found. Preserved-work hashes and a complete before-copy of this ledger are stored locally under `/tmp/p02-t045-047-baseline.json` and `/tmp/p02-t045-047-tasks-before.md`. No extension hooks exist.

The two shrink regressions failed against the original source (`/tmp/p02-t045-red.log`): page2 never refetched page1 for totals25 or0. The correction marks only the captured scope/customer/limit destination measurement key stale without refetch, then independently lowers the measurement page in the existing customer detail. It preserves AbortSignal forwarding, strict parsing, rejected reads, epoch publication guards, draft-card pagination, phone-to-ID latch and presentation.

Focused final tests: **21/21 across2 files PASS** (`/tmp/p02-t045-final-tests.log`), including fresh cached destination rows after26→25, zero→page1, read-error/retry and a deferred old-epoch measurement result. Initial new-test type inference and three lint-only callback issues were corrected without suppressions or relaxed checks. Web **lint PASS** (`/tmp/p02-t045-final-lint.log`), **typecheck PASS** (`/tmp/p02-t045-types-final.log`), scoped Prettier check and git diff --check PASS. QueryClient/root teardown and deferred response settlement remain owned by the tests.

**T045 REQUIREMENTS PASS; ENGINEERING STANDARDS PASS** at the hook/component boundary. Test-guard confirms observable refreshed rows and current-cache state with transport/API-boundary doubles, not internal hook mocks or fabricated persistence. Clean-code/React review confirms a small local query change and derived page recovery, no new state/cache owner, dependency or effect. The descriptive measurement response variable avoids a generic data name. Real database/browser pagination is not claimed by these component tests; combined P02 reacceptance remains T046.

### T046 prewrite, regression and focused browser evidence — 2026-11-06

After T045 admission/verification, current T026/T034 parser/view/page and installed Next App Router guidance were checked against the filled T046 brief. The new same-instance awaited-page tests failed3 cases against the old wrapper (`/tmp/p02-t046-red.log`): later→ALL, ALL→later and invalid→ALL. Parsing once and keying the existing client view by the normalized bounded entry fixes that reset boundary without adding an effect, state owner, route or component family. A separate test preserves All/Draft local selection and search when normalized entry identity is unchanged.

Focused component/model tests **21/21 across2 files PASS** (`/tmp/p02-t046-green.log`); both direct harness typechecks PASS (`/tmp/p02-t046-web-harness-types.log`, `/tmp/p02-t046-api-harness-types.log`). The P02-C2 browser journey now follows the actual sidebar Next Link from later-status readiness to the base orders route, validates the real scoped response and saved draft edit link, and retains the existing relogin/piece/capture checks. **4/4 focused browser cases PASS**, desktop and narrow, retries0 (`/tmp/p02-t046-browser.log`). Contexts and harness-owned resources completed cleanup; no fake success, route hard-reload substitute, screenshots/traces/videos or direct database read was added.

Code/test/React review supports the scoped correction: normalized entry keys remain free of raw query data/credentials, allowed status parsing and local filter semantics stay with their existing owners, and tests observe rendered recovery or unavailable states rather than a private helper call. The new T045 execution append had two extra blank lines; only that new append was formatted after proving every previously accepted task byte remained identical except the authorized new task marker. Combined phase verification is pending below; T046 remains unchecked until its complete gate passes.

### T046 combined verification and acceptance — 2026-11-06

The complete required exit set ran once after the final production/test corrections. All11 commands passed, with detailed command/status/log metadata in `/tmp/p02-convergence-exit-results.json` and the explicitly labelled glob `/tmp/p02-convergence-exit-*.log`. No production source edit or build ran concurrently with the final browser suite.

- `pnpm format:check` PASS; `pnpm lint` PASS; `pnpm check-types` PASS. Web lint/types were fresh; the3 unchanged package results were cached and reconciled against preserved current source.
- `pnpm test` PASS: **1179 tests in117 files**: contracts128/7, database21/2, API268/35 and web762/73. The762 web tests were freshly executed after both corrections; unchanged contracts/database/API tests reused matching cached evidence. Turbo5/6 cached tasks include2 build producers, not5 cached test suites.
- `pnpm test:integration` PASS: fresh **212 tests in17 files**, API186/15 and database26/2, in separate disposable migrated PostgreSQL instances. Only2 producer builds were cached; neither integration test suite was cached.
- `pnpm build` PASS: fresh web production build;3 unchanged package/API builds cached. `pnpm verify:build-output` PASS:6 required entry artifacts,416 emitted files checked, no test artifacts.
- `pnpm --filter @template/web check:e2e-types` and `pnpm --filter @template/api check:e2e-types` PASS through direct current typechecks.
- `pnpm --filter @template/web test:e2e` PASS: **20/20**,10 desktop and10 narrow, retries0. This includes the new real sidebar soft-navigation assertion inside P02-C2 and the retained P02/P01 journeys.
- `git diff --check` PASS. Scoped authored-source formatting was also checked.

Fast Refresh full-reload messages, the NO_COLOR/FORCE_COLOR warning and pg concurrent-query deprecation remain visible; none was suppressed. There was no required failing check left in this run. Owned contexts/clients/processes/containers finished teardown, zero private p01-e2e runtime directories remain, and no image/video/trace artifact was emitted. The older recorded root formatting failure remains historical and is not relabelled as this run.

**T046 REQUIREMENTS PASS; ENGINEERING STANDARDS PASS.** The parsed-entry key fixes only the existing navigation boundary and preserves supported local filters. T045 measurement recovery remains scoped, bounded and independently paged; backend wire/authorization/migration behavior is unchanged. Test-guard review confirms observable changed destination rows, successful/denied/readiness distinctions, same-instance route transitions and the real browser Link action. React review confirms derived recovery/keyed reset rather than redundant effects or another state owner. Clean-code-guard found and corrected one new generic response-variable name in `customers.hooks.ts`; final production review has no unresolved finding.

### T047 evidence-reference clarification and final closure — 2026-11-06

The two historical strings at line1570, `/tmp/p02-g4-exit-_.log` and `/tmp/p02-g4-first-exit-_.log`, are malformed pattern text, not actual filenames. Their original paragraph is preserved byte-for-byte. The correct explicitly labelled, code-delimited glob patterns are `/tmp/p02-g4-exit-*.log` and `/tmp/p02-g4-first-exit-*.log`; each currently matches11 existing log files. These temporary local diagnostics may expire and are not a release archive.

`/tmp/p02-g4-exit-results.json` still exists and explicitly names all11 historical check logs; all11 referenced files were verified available. It correctly records the old aggregate's formatting exit1 alongside the passing product checks. The separate existing `/tmp/p02-g4-authorized-format.log` and `/tmp/p02-g4-closure-format.log` document the subsequent authorized formatting PASS; they do not retroactively change the old result. The current corrected-source run is independently recorded in `/tmp/p02-convergence-exit-results.json` and the code-delimited pattern `/tmp/p02-convergence-exit-*.log`, with all11 current check exits0.

Docs-guard verified these references against actual metadata/files and current manifests, checked the appended Markdown/code delimiters and kept old/cached/fresh outcomes distinct. No product suite was rerun solely for this reference correction. Only an evidence append and the authorized new completion markers changed in the ledger; no prior paragraph, task brief, result, path or earlier marker was rewritten. Scoped formatting and final diff confirmation are performed after this append. **T047 REQUIREMENTS PASS; ENGINEERING STANDARDS PASS.**

Final selected-scope verdicts: **REQUIREMENTS PASS; ENGINEERING STANDARDS PASS; BACKEND PASS (unchanged admission plus current integration regression); FRONTEND PASS; BROWSER PASS; P02 PASS for local accepted scope. RELEASE remains UNPERFORMED/outside authorization.** All47 accepted P02 task markers, including T045–T047, are complete. No selected task or material design gap remains open. P03/NUM-01/OPS-01 and other later-phase boundaries remain as recorded.

Preservation review covers704 baseline files: exactly the8 authorized source/test/ledger owners changed. Accepted requirements/design/checklists, active feature selection, root roadmap, all migration SQL, existing harness configuration and unrelated edits remain intact. The complete previous task prefix is preserved except the explicitly authorized T045/T046/T047 verification markers; new evidence is appended only. No hooks file exists, so pre/post extension hooks are skipped. No commit/push/deployment, catalog activation, real mail or preserved-target data action was performed.
