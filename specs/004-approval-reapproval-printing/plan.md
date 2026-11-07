# Implementation Plan: Approval, Piece Reapproval and Official Printing

**Roadmap Phase**: P04 — Approval, per-piece decisions, customer-contact reapproval, and official printing\
**Feature Directory**: `specs/004-approval-reapproval-printing`\
**Date**: 2026-11-06\
**Spec**: [spec.md](spec.md)\
**Authorized Scope**: PLAN operation blueprints and design-readiness evidence only. No TASKS, application implementation, migration, business action or release.

## Summary

Preserve P01–P03 and the existing Arabic/RTL product. Design authoritative initial approval/return, per-piece issue A/B/C, owner contact proposals and reapproval, retained cancellation/money, official print access and factory-safe reads. Accepted D-003–005 fix four editable contact fields, whole-order pending-review print blocking and return-to-sales/cancel without automatic restore/resume.

## Intake and Before-Research Evidence

Actual Git branch `main`, revision `b9d2b3d`; P04 spec/checklist are existing untracked work to preserve. No P04 technical plan existed. The setup script copied the project-resolved plan template and reports feature context `004-approval-reapproval-printing`; that context is not the Git branch. `.specify/feature.json` selects P04; no environment override or extension hooks exist. A baseline records 897 pre-existing files, including selection state, for preservation checks. P03's task ledger is reused historical/local acceptance, not a new test result.

Source inspection already identifies shared account locks/authority, one sales-draft aggregate version, exact-money submitted-order projections, isolated test/browser infrastructure and a SALES-only command executor. Research is limited to concrete source questions: safe P04 receipt ownership, extension of current database invariants, P03 return/payment/history compatibility, current scope/cache/command lifecycle and print-route gates. The three parallel source/design reviews cover backend/data, contracts/HTTP/privacy and frontend/installed framework behavior. No external provider/library upgrade or speculative architecture research is needed.

## Constitution Check

Before-research PASS records viable authorized scope/source coverage at intake. After-design PASS records the completed linked blueprints and planned evidence after review; neither column claims implementation or executed acceptance. Future TASKS briefs cannot block their own producing step.

| Check                                           | Applicable owners/evidence                                                                                    | Before research | After design                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Scope/selection/dependencies/preserved baseline | P04 spec, root roadmap, actual Git/feature pointer, preservation snapshot                                     | PASS            | PASS — same feature/scope; original artifacts protected                              |
| Architecture/responsibility/reuse               | Current Express class modules, contracts/database ownership, existing feature screens and query/session owner | PASS            | PASS — bounded module/receipt owner and existing source ledgers                      |
| Contracts/HTTP/authority/privacy                | Current middleware, P03 safe projections, bounded P04 contracts review                                        | PASS            | PASS — exact contract ledger, current actor/resource checks and safe projections     |
| Data/bounds/races/migration/recovery            | Existing root version/locks, immutable sales receipts, exact money and forward-migration review               | PASS            | PASS — data model, B01–B07, named deferred constraints and legacy treatment          |
| Backend before UI/preserved design/state        | Accepted scope, existing views/dialogs/aliases and frontend scope/receipt review                              | PASS            | PASS — required backend gate; F00–F08 exact scope/cache/form/print behavior          |
| Verification/review/evidence                    | Actual manifests and isolated persistence/HTTP/component/browser runners; two review dimensions               | PASS            | PASS — concrete cases/discovered owners/commands, unperformed execution explicit     |
| Operation blueprint/handoff                     | Handoff stage-2 fields, source/design ownership split, future task briefs explicitly pending                  | PASS            | PASS — filled operation interfaces/algorithms and task-brief production requirements |

## Technical Context

| Boundary                  | Verified source and design                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/toolchain         | Actual `node --version`: 24.18.1; `pnpm --version`: 11.17.0. Manifests require Node >=24 <25, pnpm >=11 <12 and pin TypeScript 5.9.3. Keep ESM API/database imports with emitted `.js` conventions.                                                                                                                                                                     |
| Existing server packages  | Express 5.2.1, Zod 4.4.3, Prisma/client/pg-adapter 7.9.1 and PostgreSQL. No new production dependency or external provider is planned.                                                                                                                                                                                                                                  |
| Existing browser packages | Next 16.2.12, React 19.2.8, TanStack Query 5.101.4, React Hook Form 7.84.0, Axios 1.19.0. Preserve the single current session, transport and QueryClient.                                                                                                                                                                                                               |
| Storage                   | Existing submitted order/root/piece/catalog graph plus three bounded P04 models in [data design](data-model.md). Existing nine migrations and original business data remain intact. No browser business authority, new quantity store, file storage or queue.                                                                                                           |
| Runners                   | Vitest 4.1.10 for contracts/API/database/component checks; Playwright 1.64.1 for owned desktop/narrow real-stack browser journeys. Existing `*.test.ts(x)`, API `*.integration.test.ts`, database `tests/integration/**/*.test.ts` and web `e2e/**/*.spec.ts` discovery apply.                                                                                          |
| Platform                  | Existing same-origin Next/Express browser product. Browser projects are Chromium 1440×900 and 390×844, one worker, zero retries. Hosting/mail/calendar/backup production acceptance remains OPS-01/P08.                                                                                                                                                                 |
| Framework guidance        | Read installed Next `01-app/01-getting-started/05-server-and-client-components.md`, `01-app/03-api-reference/01-directives/use-client.md` and `01-app/03-api-reference/04-functions/use-pathname.md`, under `apps/web/node_modules/next/dist/docs/`. Existing server route wrappers may compose a narrow client gate; they cannot read the browser-memory access token. |
| Bounds                    | Existing 1–200 retained physical pieces, quantity one, 4000-character business text, bounded queries and exact monetary capacity/BigInt cent helpers. Contract/data owners specify precise accepted normalization and limits. No invented commercial, throughput, latency or uptime target.                                                                             |
| Preserved work            | Root roadmap, P04 spec/checklist, all P01–P03 artifacts/progress, workbook, production source/tests/config and applied migration history. New design files only; neither checklist markers nor prior acceptance records are rewritten.                                                                                                                                  |

### Source investigation and omitted artifacts

**Research document: N/A.** Concrete technical questions were resolved from current source, existing SQL, installed framework guidance and coordinated boundary reviews. Decisions have clear owners below; a separate `research.md` would duplicate them. There is no external API, dependency upgrade, new provider or framework choice requiring web research.

**Quickstart document: N/A.** Existing setup and isolated harness remain unchanged. The exact future commands, discovery, prerequisite/cleanup rules and expected outcomes are in this plan and linked blueprints. No separate setup procedure or runnable feature exists yet.

**TASKS and custom checklist: not produced.** Their producing commands are outside this request. Existing built-in requirements quality is 16/16 and remains byte-identical. Future TASKS must turn the blueprint dependencies into bounded briefs; their absence does not block PLAN's design-readiness gate.

## Project Structure and Responsibility Owners

### Documentation ownership

| Artifact                                       | Ownership                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [spec.md](spec.md)                             | Accepted product requirements/examples and D-003–005; read-only during PLAN                                              |
| [plan.md](plan.md)                             | Scope, source baseline, gate checkpoints, operation/dependency map, verification and readiness evidence                  |
| [data-model.md](data-model.md)                 | Exact proposed persistence fields, relations, constraints, transitions, migration/existing-data treatment                |
| [contracts/approval.md](contracts/approval.md) | Sole P04 wire/schema/HTTP/status/error/projection owner; old-schema compatibility and consumer changes                   |
| [backend-design.md](backend-design.md)         | Exact proposed service/executor/query/mapper interfaces, ordered algorithms, write predicates and concrete backend cases |
| [frontend-design.md](frontend-design.md)       | Exact feature API/hooks/model/screen interfaces, query keys/cache/form/receipt states and browser cases                  |

### Existing foundations and proposed changes

Paths described as proposed do not exist yet and are outputs of later IMPLEMENT work. Backend/frontend ledgers name each create/modify/reuse action and exported signature; do not infer permission to create whole directory scaffolds.

| Responsibility                  | Actual existing owner to preserve/extend                                                                                                                                 | Proposed owner and reason                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth and transaction authority  | `apps/api/src/modules/auth/account-authority.ts`: `lockAccountRows`, `loadIdentityAccount`, `assertBusinessAuthority`; existing business auth/CSRF/validation middleware | P04 per-operation authority remains in `ApprovalService`/executor close to protected data                                                                              |
| Contracts/response protocol     | `packages/contracts/src/index.ts`, existing HTTP envelopes, draft scalar/catalog/submitted-order schemas; `apps/api/src/core/responses/api-response.ts`                  | `packages/contracts/src/approval/approval.schema.ts`, contract-defined exports and DTO aliases; additive activity discriminator only, preserving retained P03 receipts |
| HTTP/composition                | `apps/api/src/router.ts`, `modules/index.ts`, current OpenAPI owner                                                                                                      | `apps/api/src/modules/approval/` bounded routes/controller/service/executor and focused query/mapper/rule/error/type/DTO owners, specified in backend ledger           |
| Persistence                     | `packages/database/prisma/schema.prisma`, existing migration history, `SalesDraft.version`, `SalesOrder`, `SalesOrderPiece` and catalog records                          | Three sidecar models and one proposed forward migration; no mutation of old SQL or legacy command rows                                                                 |
| Existing P03 behavior           | `sales-orders.service.ts`, `sales-orders.queries.ts`, `sales-orders.mapper.ts`, `sales-orders.rules.ts` under `apps/api/src/modules/sales-orders/`                       | Reuse current return proof/resubmit/paid/money/count behavior; narrowly add approval-safe reads/history integration without a second sales workflow                    |
| Browser session/scope/transport | `apps/web/src/shared/query/operational-scope.ts`, `query-client.ts`, `services/api/api-client.ts`, auth hooks                                                            | Capability-specific P04 scope extension preserves existing sales-only defaults; no second session/transport/client                                                     |
| Existing UI                     | `features/approval/screens/`, `features/sales/screens/`, `features/printing/screens/`, `features/orders/` and shared reached `features/prototype/components/`            | Add planned feature API/hooks/model seams; wire current screens/dialogs, not replacement pages or broad file moves                                                     |
| Print family                    | `apps/web/src/app/(print)/layout.tsx`, both existing order-print page aliases, existing paper/print CSS                                                                  | Narrow client print-family boundary admits authorized order-paper readers while reports retain ADMIN restriction; order paper uses current server projection           |
| Verification                    | Existing isolated unit/integration/browser owners and `apps/api/src/test-support/reset-test-data.ts`                                                                     | Discovered P04 files plus affected existing fixtures/regressions; exact paths/cases in linked blueprints                                                               |

## Contracts, Authority and Failure Design

The [contract owner](contracts/approval.md) fixes every method/path, shared request/response export, success status, error code, role/ownership projection and list shape. All paths there are relative to the existing `/api/v1` prefix. JSON uses the existing envelope; strict request schemas reject unsupported authority/price fields. Controllers consume parsed/server context and delegate, without raw-record spreading or transaction policy.

The six command operation names are `APPROVE_INITIAL`, `RETURN_INITIAL`, `REPORT_ISSUE`, `RESOLVE_ISSUE`, `SUBMIT_CONTACT` and `REVIEW_CONTACT`. A bounded `ApprovalCommandExecutor` owns P04 receipts/history; existing SALES-only `SalesCommandExecutor` and retained receipt schemas stay unchanged. Receipt output is metadata-only, not an embedded financial order snapshot. Current role-safe resources are fetched separately after success or observation. Contact submission requires actual immutable ownership for eligible SALES and ADMIN alike: the spec's ADMIN “no on-behalf” rule preserves current cross-department authority but never lets ADMIN respond for another owner or invent a sales identity.

The [data design](data-model.md#transition-table) fixes lifecycle distinctions: initial whole-order RETURNED belongs to P03 resubmission; piece contact/return does not change the whole order into RETURNED. A report retains source stage, holds only its piece and creates one open issue. Sales submits an immutable proposal; acceptance applies only its four stored approved fields and re-enters the retained target. Nonacceptance returns to owner sales or confirms cancellation without applying unapproved data. Cancellation updates exact active total/retained piece/history together, preserving paid.

Account locks/current authority precede command deduplication and aggregate locking; the root order version coordinates P03/P04 writes. The backend owner fixes actual lock order, current predicates, affected-row checks, canonical payload hashing, replay/changed-intent behavior and bounded identified conflict retry. A lost response is an unknown outcome, not proof of rollback. Observation/retry preserves original frozen intent/ID; synchronization failure after confirmed commit must never repeat a business action.

No external side effect occurs inside or outside these commands: recorded customer contact is staff's account, print is browser output, and surplus does not trigger refund. Migration execution, actual contact messages, new business orders/imports and production operations are unperformed.

## Operation Blueprints

The referenced sections are filled stage-2 blueprints, not implementation instructions to choose an architecture. Each contains exact existing/proposed symbols, dependencies/read context, scoped legacy correction, ordered branches, HTTP/projection references and concrete verification outcomes. Frontend behavior is owned once in its linked design rather than repeated as competing cache/form rules.

| Operation / requirements                                                                        | Algorithm/interface owner                                                                                                                           | Dependent frontend/evidence                                                                          |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Initial approve and free-text return; current P03 return proof/resubmission — FR-001–007        | [B01](backend-design.md#b01-initial-approval-and-return)                                                                                            | Approval review/return modal, P03 owner correction, history/counts; backend acceptance first         |
| Current-department report and independent piece hold — FR-008–009                               | [B02](backend-design.md#b02-report-manufacturing-issue)                                                                                             | P04 defines/test reporting boundary; P05/P06 reporting-control integration remains excluded          |
| A/B/C, target retention, piece cancellation/exact money — FR-010–015                            | [B03](backend-design.md#b03-resolve-issue-abc)                                                                                                      | Existing problem-resolution dialog; affected details/counts/history/print state                      |
| Owner-only four-field proposal/notes/request — FR-016–019,022                                   | [B04](backend-design.md#b04-submit-customer-contact-response)                                                                                       | Existing sales returned/detail surfaces and contact modal; no direct resume/delete                   |
| Exact proposal acceptance or reasoned sales return/cancellation — FR-020–022                    | [B05](backend-design.md#b05-review-customer-contact-response)                                                                                       | Existing approval review/problem surfaces; same held issue/target and retained prior proposals       |
| Dashboard/pending/own decision history/order context/retained event detail — FR-002–003,027–028 | [B06](backend-design.md#b06-reads-histories-and-safe-projections) and contract read ledger                                                          | Scoped bounded current queries, full P03/P04 activity and safe lazy event detail                     |
| Receipt observation/replay/current authority — FR-007,027–028                                   | [Shared command protocol](backend-design.md#shared-command-protocol)                                                                                | Scope-bound recovery survives modal closure; confirmed commit plus failed refresh is a sync state    |
| Official paper/both aliases/current review block/factory privacy — FR-023–026                   | [B06](backend-design.md#b06-reads-histories-and-safe-projections) and contract projection owner                                                     | Print-family gate, authoritative preview/refetch and retained browser print behavior                 |
| Compatibility, schema/cleanup/harness and accepted P03 operations — FR-006–007,014–015,028      | [B07](backend-design.md#b07-p03-integration-and-verification-gates), [migration design](data-model.md#forward-migration-and-existing-data-strategy) | Fresh/populated upgrade, immutable graph/receipts, actual live decisions distinct from fixture setup |
| Form/query/cache/late-account/accessible surfaces — FR-016–029                                  | [Frontend blueprints](frontend-design.md)                                                                                                           | Exact per-surface actions, symbols, state transitions and concrete component/browser cases           |

### Source and invariant integration

Read current P03 exports before implementing: `SALES_ORDER_SELECT`, `mapSalesOrder`, `mapFactoryOrder`, `mapSalesOrderSummary`; `readCurrentOrderReturnProof`, `findSalesOrder`, `findSalesOrderActivity`; and `parseMoneyCents`, `formatMoneyCents`, `calculateOrderMoney`, `deriveOrderCounts`. Their current owners are in the source table. P04 must not call a SALES-only service method as a shortcut to grant approvers/factory access. Query reuse and projection reuse do not grant permission.

The source currently permits four captured-field changes under its frozen-term rules; no replacement of existing P03 immutability/graph functions is needed. Never call broad `writeDraftCapture` to accept a piece proposal: the new focused writer changes one piece and its allowed catalog bindings only. Persisted proposal IDs/labels are reviewed at submission, then accepted exactly; a later catalog activation cannot silently alter the proposal or frozen decoration price.

The newly proposed graph checks must distinguish retained historical facts from current mutable state and must not require old action-time staff department/status to remain current. Legacy P03 consumer fixtures/statuses are not real P04 approval evidence. Missing approval witness means no fabricated print stamp; the data/backend owners prescribe diagnostic handling, safe upgrade and new-command binding.

## Backend and Frontend Delivery Groups

These are design dependency groups, not generated task IDs or authorization to implement.

1. **Shared and data foundation:** executable P04 contracts/DTO types, additive persistence/constraints/forward migration, narrow receipt protocol and deterministic pure rules/projections. Preserve old migration/receipt/selection invariants and current auth.
2. **Complete required backend:** all six commands, current authority/locks/rollback/races, bounded approval/contact/event reads, P03 history/return/payment compatibility, current official/factory paper projections, routes/OpenAPI and discovered verification work.
3. **Backend acceptance gate:** requirements and engineering reviews plus actual migrated database/HTTP/contract/unit cases for the complete required group. A stub, partial service or synthetic success is insufficient; all relevant accepted four-field/print/rejection decisions must be covered before UI wiring.
4. **Dependent browser integration:** scoped API/hooks/models/recovery state, current approval screens/dialogs, existing-page sales contact entry points, additive activity detail, narrow print access, preserved paper and truthful loading/dirty/denial/conflict/unknown states.
5. **Cross-layer exit:** live return/resubmit/approve and contact/reapproval/print journeys; independent pieces/cancellation/financial privacy; existing P01–P03 regression; required browser/print/layout/accessibility outcomes and complete scoped reviews. Later-phase work/inspection/delivery fixtures remain clearly labelled setup, not completed P05–P08 behavior.

TASKS must produce a bounded brief per implementation ID with exact permitted files/symbols, dependencies, filled design sections, current callers/tests/guides to read, ordered algorithm, forbidden effects and concrete done evidence. Do not invent setup tasks for completed P01–P03 foundations, reconstruct existing controls, or combine backend/UI before the required gate.

## Verification and Review Plan

### Planned boundaries and cases

| Requirement/risk                         | Evidence owner                                                                                         | Required observable outcome                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact command/read/projection shapes     | Proposed approval contract tests named in the contract owner; existing contracts runner                | Valid/invalid/over-limit/null/omitted/privileged values, six operation bindings, old receipt compatibility, safe financial/factory/event schemas                                         |
| Initial approve/return and P03 consumers | B01/B07 service and HTTP cases; existing sales-order proof/resubmit/payment regression                 | All seven types released to cutting once; real free text/notes/proof; correct/resubmit/reapprove; frozen terms and actor/time retained                                                   |
| Current issue and A/B/C                  | B02/B03 real migrated service/HTTP cases                                                               | One affected piece, one open issue, exact target/instructions/cancellation, companion continuity, denied wrong source, no duplicate/partial effects                                      |
| Owner contact and piece review           | B04/B05 contract/service/HTTP cases                                                                    | Four allowed ID-backed fields, explicit optional floor clear, notes-only/request, retained old/new proposals, held return cycles, positive approval only, no direct sales cancellation   |
| Exact counts/money/full cancellation     | Existing pure money/count owners plus new real persistence cases                                       | 3300 total/2000 paid → cancel 1500 → total1800/due0/surplus200 once; paid preserved, zero-active not deliverable completion                                                              |
| Race/rollback/unknown outcome            | Shared executor/B01–B05 controlled independent connections and dependent-write failure                 | One winner, conflict loser with unchanged losing effects, complete rollback, observed original result, no duplicate command/event or lost paid change                                    |
| Privacy/print/current revision           | B06 HTTP and mapper cases plus frontend print cases                                                    | Owner/approval/ADMIN official permission, pending-review hold across cycles, no fake witness, both aliases agree, factory nested finance/private omission                                |
| Form/cache/session/receipt recovery      | Frontend component/hook/model cases with real QueryClient/RHF and transport doubles                    | Dirty input preserved, known errors useful, malformed response not fake success, pending duplicate prevention, late obsolete scope suppressed, closed-dialog unknown outcome recoverable |
| Migration/upgrade/history                | Data-model verification owners and existing immutable-graph/cleanup suites                             | Nine old SQL/checksums and business graph unchanged, new constraints meaningful, approved/returned legacy boundary explicit, fresh/populated/repeated deploy and recovery cases          |
| Real browser/output                      | Proposed `apps/web/e2e/approval-reapproval-printing.spec.ts` and existing isolated harness/regressions | Live owned sales/approval/admin/factory authority, reload/second session, wide/narrow RTL/keyboard/focus, 1/8/9/17-row paper and cancelled/empty handling                                |

Each linked blueprint supplies representative starting state/input and expected response/database/UI outcome; these rows are a coverage index, not substitute briefs or assertions. No test file exists merely because it is planned here.

### Actual commands and their future use

Manifests/configurations were inspected; the following are planned implementation commands, **not executed evidence from PLAN**. Use package-relative paths from the blueprint's proposed/existing test ledger to narrow each run after the files exist. Vitest runs require owned dependency builds where imports changed; root Turbo can reuse matching caches and must be labelled accordingly.

```sh
pnpm --filter @template/contracts test
pnpm --filter @template/database test
pnpm --filter @template/database test:integration
pnpm --filter @template/api test
pnpm --filter @template/api test:integration
pnpm --filter @template/web test
```

For focused API examples, the future test `src/modules/approval/approval.http.integration.test.ts` is selected through `pnpm --filter @template/api test:integration src/modules/approval/approval.http.integration.test.ts`. The contracts counterpart is `pnpm --filter @template/contracts test src/approval/approval.schema.test.ts`. The blueprint ledgers define other exact proposed owners; no arbitrary `.spec.ts` belongs in Vitest discovery.

At implementation phase exit, execute all applicable current checks and inspect actual discovered outcomes:

```sh
pnpm format:check
pnpm lint
pnpm check-types
pnpm test
pnpm test:integration
pnpm build
pnpm verify:build-output
pnpm --filter @template/web check:e2e-types
pnpm --filter @template/api check:e2e-types
pnpm --filter @template/web test:e2e
git diff --check
```

Docker/image access and installed Chromium are future persistence/browser prerequisites; availability was not probed by PLAN. Existing setup owns disposable PostgreSQL, real API and Next child processes and private test runtime files; extend that isolation rather than reusing developer/production servers/data. Existing browser artifacts remain disabled. Cleanup changes name the three new tables and owned fixtures only, preserve history protections and never broaden into unrelated data or process cleanup.

For print acceptance, native browser Print/Save as PDF stays available for a successfully authorized current-scope preview. The existing print button can re-fetch before `window.print`; known denial/error/invalidation hides printable content. Browser native print cannot await a new authorization read and saved exports cannot be revoked; do not claim a live revocation guarantee. Test the actual permitted/blocked rendered states and output page boundaries, not merely a button call.

Root `pnpm verify` mutates/formats/generates/builds, and web type checks generate Next types. They are future implementation/exit commands, not documentation checks. This PLAN uses only owned Markdown formatting, source/reference/link consistency and file-preservation checks; it starts no services/containers and runs no application suite.

### Review owners and verdict meaning

Apply all nine core guide owners: code style/module cohesion; backend recipe/composition; API exact schema/error/HTTP compatibility; data constraints/history/migration/races; current authority/privacy; frontend scope/cache/dirty/recovery/design; actual evidence boundaries; and separate requirements/engineering review. The installed framework source above governs Next choices. `docs-guard` validates design claims/references; later changed production code and tests must use the matching installed review guards under their authorized scope.

**REQUIREMENTS** evaluates traceability to accepted FR/SC/D decisions. **ENGINEERING STANDARDS** evaluates the proposed interfaces/algorithms/data/HTTP/UI/verification design. Their PLAN PASS does not certify code, executed checks, a backend gate, phase completion or release.

## Decisions and Complexity Tracking

| Decision                                               | Source constraint and smallest adequate design                                                                                  | Alternative and impact                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Separate bounded P04 receipt/event owner               | Existing executor/union/history is SALES-only; reuse account locks/version/error patterns but retain old sales ledger unchanged | Broadening old executor would couple factory/approver privacy to immutable embedded sales snapshots and expand regression scope |
| One aggregate version and lock                         | Existing P03 resubmission/paid already uses root version; serializing P04 there preserves money/history                         | Independent issue versions would allow stale order totals/review/print state or require a second concurrency protocol           |
| Immutable contact proposal                             | Four allowed selected fields resolve to reviewed catalog IDs/labels; pending input must never become live factory specification | Editing base piece before approval would require rollback/restoration policy and expose unapproved work                         |
| Existing-page contact entry and print-family gate      | Accepted workflow has missing contact caller; current shared print layout is ADMIN-only and also serves reports                 | New routes/redesign or globally widening report permission would exceed P04                                                     |
| Additive activity union with separate P04 event detail | Retained P03 receipts/revision parsers must stay valid; new actor-safe event summaries integrate current histories              | Widening old revision schema or returning raw JSON would break old meaning/privacy                                              |
| No new provider/framework                              | Existing contracts/Express/Prisma/query/form/harness fit the accepted operations                                                | Generic workflow engine/event bus/global command framework/PDF service adds unaccepted responsibilities                         |

## Design Readiness and Exit

**Design readiness: PASS. REQUIREMENTS: PASS. ENGINEERING STANDARDS: PASS**, for this PLAN's design/artifact scope only. The operation table and four supporting owners contain current source references, exact proposed interfaces/contracts, state/authority/transaction/migration decisions, frontend correlation/cache/form/print policy and concrete acceptance cases. Product decisions remain the accepted spec's D-003–005; no new material question is delegated to implementation.

| Producing-stage boundary         | Design result and evidence                                                                                                                          | Later gate                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Commands and receipt recovery    | Shared protocol/B01–B05, contract six-operation ledger and frontend F03; generated result IDs are not mistaken for request-selected replay identity | Actual unit/HTTP/persistence/replay/race/rollback checks                                                            |
| Retained proposal/decision graph | Data field/transition/deferred-FK ledgers; historical facts distinct from aggregate head/current source; no synthetic old approval witness          | Reviewed forward SQL, safe target-history preflight, fresh/populated upgrade and immutable-history proof            |
| Current reads/history/privacy    | B06, bounded row/count/history/event contracts, P03 additive activity compatibility and factory-safe whole-order context                            | Real authorization/filter/pagination/projection evidence and coordinated consumer rollout                           |
| Existing product surfaces        | F00–F08 exact source/placement/scope/recovery/annotation/native-print design; original language/layout/routes retained                              | Complete backend acceptance, then actual UI/browser/print evidence                                                  |
| Bounded task briefs              | Each operation has owning sections, concrete cases and source/test/guide context; no task IDs or progress fabricated                                | TASKS generates file-specific briefs; ANALYZE checks consistency; IMPLEMENT verifies selected current-source briefs |
| P03 prerequisite/runtime/release | Accepted numbering and recorded prior acceptance reused with clear limits; no fresh activation/production claim                                     | Reconcile actual prerequisite state before execution; OPS-01/P08 and separately authorized production actions       |

### Review corrections incorporated

- Preserved SALES-only old command/receipt semantics and chose metadata-only P04 observation with current authority; distinguish generated issue/proposal IDs from request-selected IDs when deduplicating.
- Specified original-source report-receipt recovery without granting current factory detail access; whole-order safe tracking/counts remain truthful under a current department relation.
- Kept current return notes separate from bounded reason and exposed them on initial-return owner detail, even without a manufacturing issue; retained P03 proof/resubmission remains unchanged.
- Made current queue action hints explicit, added the correct owner-sales capability to shared event/history hooks and preserved ADMIN actual-owner versus on-behalf behavior.
- Added exact deferred circular FK handling, nullable retained catalog bindings/labels, aggregate-head versus historical checks, legacy graph treatment and current-department-safe action hints for former sales owners.
- Fixed role-wide approved-today versus currently returned-order counters using explicit server calendar semantics; no browser clock or inferred production timezone.
- Bound factory instruction selection to current/latest relevant cycle per piece and excluded private sales correspondence; kept real initial/per-piece approval witnesses distinct from signatures and unrelated actors.
- Preserved browser-native printing and report-only ADMIN access, with precise print preflight and post-read/export limits; metadata annotation has an exact bounded presentation owner rather than an unbounded stamp list.

### Actual PLAN evidence

Performed only repository/source/manifest/installed-guidance reads, selected-feature/template setup, design authoring and documentation checks. Fresh targeted Prettier checks passed for all five new design artifacts; relative-link/anchor validation passed for 45 references and Markdown table validation passed for all 27 table groups across this feature. New-file whitespace checks and `git diff --check` passed. Preservation hashes confirmed all 897 intake files unchanged, including the original P04 spec/checklist, root roadmap, P01–P03 artifacts, source/tests/config, nine migration SQL files and feature pointer. The only new repository files are this plan, backend design, frontend design, data model and contract owner.

Source/interface, requirements and engineering reviews found no remaining material design blocker after the corrections above. This is documentation/design evidence only: no application suite, build/type generation, Docker/service launch, migration/schema generation, real command, workbook activation, production calendar choice, commit/push/deployment or external message was performed. Target migration-history/data checks, actual backend acceptance, future task briefs, browser/print output and OPS-01/release remain their explicit later gates.

No extension hook file exists at command exit, so no before/after-plan hooks are registered or executed. Research/quickstart are capability-specific N/A above; no empty files were created. The next separately authorized command is CHECKLIST for this feature, followed by TASKS/ANALYZE as requested. Application implementation is not authorized by this plan or its PASS verdicts.

### Scoped PLAN amendment: H1 command recovery

The owner authorized the proposed H1 remedy through PLAN, TASKS and a final read-only ANALYZE on 2026-11-06. Reuse the existing product specification, clarification decisions and quality checklists. This amendment resolves frontend handoff detail only; accepted business behavior, wire contracts, persistence, backend algorithms and protected roadmap remain unchanged. Setup confirmed the existing matching plan and skipped template copying.

Before amendment, H1 blocked T023/T026 and their dependents: command hooks did not select an explicit capability, same-order recovery across ADMIN's two eligible capabilities was undecided, and receipt-query ownership conflicted. Source review of `operational-scope.ts`, the existing sales command/receipt hook, QueryClient ownership and the backend observation protocol supports the bounded correction in [F03](frontend-design.md#f03-commands-uncertainty-and-synchronization):

- Required command-hook capability; SUBMIT_CONTACT maps to SALES_CONTACT and the four approver operations map to APPROVAL. Captured origin scope remains with every non-idle session and is never inferred from ADMIN or the currently visited view.
- One same-actor/accessVersion/epoch/order slot across the two exact QueryClient session keys. Inspect both and insert pending synchronously before awaiting/dispatching; retain the occupied slot through uncertainty and until synchronized acknowledgment. Both view subscribers recover the same original intent; no additional store or global registry is introduced.
- T023 owns receipt transport only. T026 owns the explicit-origin receipt query, command recovery, correlation and synchronization. Recovery uses its stored operation/origin scope; acknowledgment and late callbacks target only the matching origin key/command ID.
- Source verification of installed query-core 5.101.4 establishes that plain query removal does not notify disabled QueryObservers. F01/F03 therefore use public synchronous Query.reset before exact identity/data-guarded removal, with no initialData or intervening await; both subscribers see idle and replacements remain intact. Existing scope cleanup stays in its shared owner, without importing feature hooks.
- F-V07/F-V08 and the existing browser harness must exercise an ADMIN-owned contact command with a lost response, same-order navigation into approval, blocked second intent, original receipt observation, contact-wrapper synchronization and safe acknowledgment. These are future implementation checks, not executed results.

**Amendment design readiness: PASS; REQUIREMENTS: PASS; ENGINEERING STANDARDS: PASS**, for these recorded blueprint decisions. No product question remains. No backend/data/HTTP change, new dependency, new research/quickstart artifact or setup procedure is needed. TASKS must next align the affected briefs/callers/fixture and concrete tests while preserving every ID, checkbox and dependency. Final ANALYZE must independently reassess all 46 briefs read-only; this PLAN amendment does not preapprove that result or any implementation gate.
