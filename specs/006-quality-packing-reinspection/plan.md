# Implementation Plan: Quality, Packing, Rejection, and Reinspection

**Roadmap Phase**: P06 — Quality, packing, rejection, and reinspection\
**Feature Directory**: `specs/006-quality-packing-reinspection`\
**Date**: 2026-11-11\
**Spec**: [spec.md](spec.md)\
**Authorized Scope**: PLAN only: operation blueprints and design-readiness evidence. No TASKS, application code, migration execution, acceptance runs or release.

**Scoped amendment, 2026-11-11**: The owner authorized resolving ANALYZE findings
and repeating the affected Spec Kit stages through ANALYZE. This PLAN amendment
owns C1's operation-aware lock-helper interface and D1's canonical-table formatting;
the existing product specification/clarification decisions remain valid. TASKS is
amended separately within that sequence; application implementation is not included.

## Summary

Replace current quality browser-local authority with the existing authenticated Express/contracts/PostgreSQL boundary while preserving reached Arabic/RTL/Cairo screens. Exact accepted/rejected pieces, optional entered packing, traceable correction cycles and distinct P04 issue escalation are authoritative. Acceptance ends at warehouse incoming; P07 physical receipt is separate. Complete all backend contracts/data/commands/queries/failure behavior and its real acceptance before frontend wiring.

## Technical Context

- **Source baseline**: `c8d9e778f8240bc65d15196e2a9258685a0dedcd`, actual Git branch `main`; script context `006-quality-packing-reinspection` is not a branch claim.
- **Runtime/toolchain**: Manifest requirements Node >=24 <25, pnpm >=11 <12 with packageManager pnpm@11.17.0; TypeScript 5.9.3. No upgrade is proposed.
- **API/contracts/data**: Express 5.2.1, Zod 4.4.3, Prisma/client/adapter 7.9.1, pg 8.22.0; PostgreSQL via existing client factory. No new dependency/provider/worker.
- **Web**: Next 16.2.12, React 19.2.8, TanStack Query 5.101.4, RHF 7.84.0, Axios 1.19.0. Retain installed framework and existing feature owners.
- **Testing**: Vitest 4.1.10; Playwright 1.64.1. Existing isolated migrated PostgreSQL/real Express/browser harnesses are reused. Concrete test owners/cases are recorded below; none was executed during PLAN.
- **Target**: Existing authenticated web workspaces, desktop/narrow Chromium acceptance; deployment, mail and physical warehouse operations remain separate scopes.
- **Preserved work**: Existing untracked P06 spec/checklist and selected feature pointer are preserved byte-for-byte; root roadmap and all tracked source/prior feature artifacts remain unchanged.
- **Product decisions**: Owner-confirmed whole-batch rejection, exact identity partitions, optional original packing text, both normal correction routes and factory-safe output are fixed by the spec. No remaining material product question.
- **Performance/scale**: No accepted SLA/throughput target. Reuse finite pages, selection budget 200 pieces and bounded group detail hydration; assess query count/indexes in the operation designs.

## Constitution Check

The intake checkpoint establishes authorization, a viable source-grounded design approach and coverage of concrete unknowns. The post-design checkpoint reflects the completed blueprints and independent source/cross-artifact review. Both are design-stage evidence; neither is implementation or executed acceptance.

| Check                                               | Applicable owners / evidence route                                                                                         | Before research | After design                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| Scope, phase/feature, dependencies and preservation | Exact P06 mapping; accepted spec/clarify; protected baseline hashes; P01–P05 source and recorded P05 ledger                | PASS            | PASS — Q01–09; fixed scope and preserved baseline                 |
| Architecture and responsibility                     | Canonical API module, shared schemas, existing manufacturing presentation; source analysis of existing factories/executors | PASS            | PASS — B02/F02 and single canonical contract owner                |
| Contracts/HTTP/authority/privacy                    | Existing authority, transport/envelope/schema owners; new QUALITY-only producer without widening P05 departments           | PASS            | PASS — contract §§1–7, safe projections and exact history links   |
| Data/invariants/races/migrations                    | Inspect schema + authored P04/P05 SQL; resolve quality visits, per-piece report audits and exactly-one version witnesses   | PASS            | PASS — M01–07/B03–07, exact +1/+n witnesses and rollback cases    |
| Backend gate/preserved UI/states                    | Spec FR-024–027 and owning guides; installed Next guidance and actual P05 hooks as sources                                 | PASS            | PASS — F01–11, ordered backend gate and preserved surfaces        |
| Tests/review/infrastructure                         | Existing discovery/harnesses and guard conventions; no application test invocation during PLAN                             | PASS            | PASS — V01–12/B10/M07/F11 and independent reviews                 |
| Operation readiness and future briefs               | Handoff section 2; parallel backend/data, frontend and verification source research; root owns canonical interfaces        | PASS            | PASS — all nine blueprints complete; bounded briefs pending TASKS |

## Research Scope and Decision Ownership

Resolve only concrete design questions exposed by source: quality work cannot occupy P05 currentWorkVisitId; atomic multi-piece issue reporting must retain P04 per-piece command/issue bindings; new quality commands must fit deferred P04/P05 database witnesses; history/projection/cache integration must preserve existing boundaries. Source and installed dependencies supply these facts. No external architecture/tool comparison is needed. Decisions live in this plan and its data/backend/frontend/contracts owners; no separate research.md or quickstart.md is needed when those owners contain the full rationale and runnable future verification guide.

## Project Structure and Responsibility Owners

### Documentation owners

| Artifact                                                             | Scope / status                                                                                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [spec.md](spec.md), [built-in checklist](checklists/requirements.md) | Existing accepted product decisions / 16-item requirements review, preserved byte-for-byte. CLARIFY found no further material questions.     |
| [plan.md](plan.md)                                                   | This technical plan: scope, gates, operation/dependency map, verification commands and design-readiness evidence.                            |
| [contracts/quality.md](contracts/quality.md)                         | New canonical wire/HTTP/query/event/validation/replay/safe-error owner; exact proposed exported schemas and types.                           |
| [data-model.md](data-model.md)                                       | New persistence/constraints/forward migration/P04-P05 witness compatibility owner.                                                           |
| [backend-design.md](backend-design.md)                               | New exact API file/interface ledger, ordered service/transaction/read/history algorithms and concrete backend verification cases.            |
| [frontend-design.md](frontend-design.md)                             | New exact feature API/hooks/model/presentation owners, query/cache/form/command recovery decisions and component/browser verification cases. |

No `tasks.md` is produced. Future TASKS must create bounded task briefs in that file from these filled operation owners. No implementation source directory is created by PLAN. `research.md` is N/A as a separate artifact because source-grounded decisions and alternatives have their complete owners here/M05/F01. `quickstart.md` is N/A as a separate artifact because the actual prerequisites and future runnable verification commands are in this plan; neither omitted file hides an unresolved decision.

### Source and dependency map

All CREATE/MODIFY entries below describe future implementation. The precise path/symbol/interface/action ledgers are backend B02 and frontend F02; this table routes readers without duplicating those definitions.

| Boundary                   | Current owner / planned extension                                                                                                                                                                                | Evidence owner                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Shared executable contract | CREATE `packages/contracts/src/quality/quality-command.schema.ts`, `quality-event.schema.ts`, `quality.schema.ts`; MODIFY contracts index and existing sales activity discriminated union                        | Contract §§1–7                    |
| API module and composition | CREATE `apps/api/src/modules/quality/` concrete B02 files; MODIFY module index, `apps/api/src/router.ts` and existing OpenAPI construction                                                                       | B01–03/B09                        |
| P04 issue reuse            | Extract transaction-local issue mutation/command persistence writers from current approval service/executor; preserve public single-piece P04 protocol; extend actual issue interruption/cancellation seams only | B07, M05                          |
| Persisted integrity        | MODIFY Prisma schema via eight new quality models and a NEW forward migration; preserve old SQL/client/generated artifacts                                                                                       | M01–07                            |
| Existing quality UI        | Extend current manufacturing feature with quality API/hooks/models/recovery and closed quality presentation branches; preserve shared P05/warehouse branches and route layouts                                   | F01–08                            |
| Shared data consumers      | Add quality history union/labels to current sales and approval order history; synchronize P04/P05/quality read caches and current quality shell badges                                                           | B08, F08–09                       |
| Evidence/harness           | Add discovered P06 test files; extend named shared tests, exact schema/migration inventories and guarded test-data cleanup; use current disposable DB/real browser harness                                       | Verification table, B10, M07, F11 |

No new runtime package, transport, auth protocol, QueryClient, repository framework, event bus, worker, provider, generic workflow engine, carton inventory or screen is planned. Removing the shared MVP provider or unconverted P07 UI is outside scope.

## Contracts, Authority and Failure Design

The canonical [contract ledger](contracts/quality.md) fixes all eight HTTP operations, strict schemas, exported types, text/selection/transport limits, current authority, private errors, exact success/output shapes and producer-consumer rollout. It is the field owner, not this summary.

Use authenticated current QUALITY/ADMIN authority at both route and protected data boundary; stable physical pieces and existing order root/version own state. Factory output remains a deliberate allowlist. No quality DTO exposes money/private contacts/raw snapshots or proposed specifications. Read permission after historical quality participation never grants current cutting/production/warehouse actions.

[B03](backend-design.md#b03-authority-lock-order-and-transaction-envelope) fixes lock order, transaction isolation/timeouts, current checks, replay/observation, whole-selection validation and retry classification. [M05](data-model.md#m05-forward-p04p05-witness-compatibility-changes) fixes exact witness changes: ordinary quality commands advance one root version per order; REPORT_ISSUES groups a real sequential P04 +1 child chain per selected piece, preserving each issue's unique audit binding without a second parent witness. There is no nested public P04 executor, broad head relaxation or partial batch save.

The configured body parser limit remains unchanged. Known pre-command validation/413 leaves protected state unchanged; a network/malformed-success/unknown result remains uncertain and recovers the original command before any new intent. Existing request IDs/redaction/session/CSRF behavior is retained. No external side effect or physical receipt is hidden inside quality acceptance.

## Operation Blueprints

Each operation below has a complete interface/HTTP/data/algorithm/UI/verification owner. Every applicable handoff field is provided by the precise references, rather than repeated competing schemas. New source outputs remain proposed until earlier dependency groups implement them.

| Stable operation                                  | Requirements / observable outcome                                                                         | Ordered algorithm, interfaces and state owners                                                                                                                                                                      | Concrete acceptance / verification                                                                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q01 — Quality reads**                           | FR-001–004/021–024; current dashboard/queues/group/flat/order/task rows and safe historical participation | Contract §§2/6; B02/B08; M01–04; F03–05/F08. One RepeatableRead response, same authorized predicates/count/page, factory-safe paper, exact requested IDs and no fallback.                                           | V01/V07/V10, B10 reads: two sessions, empty/error/denied, after all pieces transfer, exact filters/aliases and safe nested payloads.                                                          |
| **Q02 — Receive and start**                       | FR-005–009/017–020; exact incoming becomes inspecting with original actual starter                        | Contract §4.1/5; B03–04; M02–05; F05–07. Lock/revalidate complete selection, create real quality visit/event, conditional state change and one root step per order together.                                        | V02/V06: A starts P1 while P2 remains incoming; duplicate/stale/hold/foreign member rejects all; legacy unknown actor is not fabricated.                                                      |
| **Q03 — Colleague continuation**                  | FR-006/017–020; actual B action without replacing A start                                                 | Same envelope as Q02, B04 continuation branch; F06/07. Existing open visit required; same-last actor gets unchanged conflict; different actor appends event only, root step still witnessed.                        | V02/V06: B continues/inspects A's work, two-actor race, same actor repeat, unchanged companions and original start.                                                                           |
| **Q04 — Inspect and accept/pack**                 | FR-007–011/017–021; exact ACCEPT subset becomes warehouse incoming with entered optional carton text      | Contract §§4.2/5/6; B03/B05; M02–05; F05–07/F09. Full partition validated first, immutable per-piece decision/visit endpoint/cycle close and group membership; no receivedAt or readiness write.                    | V03/V06: ordinary no-issue piece, all accepted/mixed subset, note-only versus actual carton group, later group preserved, required-save failure and replay.                                   |
| **Q05 — Reject and reinspect**                    | FR-012–014/017–021; cutting→production→quality or production→quality, repeated cycle retained             | Contract §4.2/6; B06 + existing `openQualityCorrectionVisit`; M02–05; F07–08. Close failed previous cycle/open one next cycle together; exact correction visit and final root witness.                              | V04/V06: both targets and all seven types, real P05 consumption, required 4000/4001 text, repeated correction, accepted resolution, held/cancelled histories.                                 |
| **Q06 — Approval escalation**                     | FR-015/018–020; exact batch held under P04 while companions continue                                      | Contract §4.3/5; B07; M02/M05; F06–07/F09. Validate all orders first, real per-piece P04 writer/retained child audits in one parent transaction, per-order v→v+n chain, no nested transaction.                      | V05/V06: two same-order pieces plus another order, one late child failure rolls everything back; source/actor/reason/notes exact; existing direct P04 unchanged.                              |
| **Q07 — Result observation/replay**               | FR-019/024–026; committed original result recovered once under current actor authority                    | Contract §5/7; B03/B09; M03/05; F03/04/06. Same parent advisory lock, own actor only, exact hash binding. Unknown 404 may mean late original POST: resend only frozen same ID/body, never new intent automatically. | V06/V08: lost result, same/reordered normalized replay, changed intent/actor, authority loss, closed dialog/navigation, post-reload observation-only and stale refresh recovery.              |
| **Q08 — Retained activity and shared projection** | FR-002–004/013/017/022–027; full cycle/packing/actors and source-safe history after transfer              | Contract §6.3; B08; F08–09. Stable per-order events, shared union without import cycles, parent once/suppress only validated linked report children, original same-order event under piece filter.                  | V07/V09/V10: exact count/page parity, prior standalone report and later decisions retained, no duplicated grouped action, no finance/proposals, actual P05 departments in correction history. |
| **Q09 — UI confirmation and synchronization**     | FR-008–009/023–027; truthful exact-selection forms/queues/badges/drafts/recovery                          | F02–10 owns exact existing/new file symbols, API mapping, query keys/options, frozen selection/form-only counts, pending/dirty/conflict/account/late rules and reciprocal P04/P05 invalidation.                     | V08/V10: no generic transfer bypass, task action reached, optional packing only where present, same selected IDs on review, valid Arabic recovery and narrow/wide keyboard/focus.             |

No architecture/data/error/cache/algorithm choice in these operations is delegated to IMPLEMENT. Ordinary local syntax remains free. TASKS must copy/reference the precise operation sections, actual source/callers, allowed files and named verification cases in each bounded task brief; no briefs or task completion markers are generated now.

## Backend and Frontend Delivery Groups

These are dependency groups for future TASKS, not tasks or additional roadmap phases.

1. **Contract/data foundation**: Add strict shared schemas/exports and intentional activity union changes; design-aligned Prisma models, reviewed forward SQL, deferred graph/retention/witness compatibility and isolated cleanup/inventory changes. Verify new migration on fresh and representative populated databases.
2. **Required backend**: Complete authority, exact batch commands/receipt recovery, transaction-local P04 reuse, correction source/consumer bindings, all queries/history/safe projections, HTTP/OpenAPI and failure handling. P01–P05 foundations remain reused.
3. **Backend acceptance gate**: Actual unit/contracts, real migrated persistence/rollback/race, real Express authority/output and affected P01–P05 regression results plus separate requirements/engineering reviews must pass. Written plans, isolated legacy quality seam fixtures and historical P05 ledger are insufficient.
4. **Dependent frontend**: Add fixed-QUALITY API/hooks/models/recovery, RHF forms and current scope; wire the existing dashboard/queue/group/flat/order/task/dialog/paper/shell/history surfaces only after group 3. Reconcile P04/P05 invalidation and shared activity consumers.
5. **Cross-layer acceptance**: Real-stack browser with two staff/current authority, ordinary/mixed acceptance, both normal correction routes/reinspection/issue flow/recovery, aliases/history and retained design. P06 handoff is persisted warehouse incoming; P07 UI/physical receipt/delivery and production release remain unaccepted here.

## Verification and Review Plan

### Concrete cases and discovered owners

Every new test path below is **proposed**, not a current file or a passed test. Extend actual existing neighbor files when those own the regression; don't duplicate implementation tests to increase counts. Detailed starting values/outcomes also live in spec concrete examples, B10, M07 and F11.

| ID / requirements                           | Exact test owner(s)                                                                                                                                                           | Concrete setup/action and required observation                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **V01** FR-001–004/022                      | Proposed `apps/api/src/modules/quality/quality.queries.integration.test.ts`, `quality.http.integration.test.ts`                                                               | Current eligible QUALITY/ADMIN versus wrong department/suspended/changed account; unknown or unrelated order. Inspect full safe payload and unchanged protected DB; no fallback or private existence/version disclosure.                                                                                                                                                                                                                                                                   |
| **V02** FR-005–007/017                      | Proposed `quality.service.integration.test.ts`, `quality.rules.test.ts` in that API directory                                                                                 | Real production transfers P1/P2 incoming; A starts P1, B continues. Reload exact visit/actors/source/time; P2 unchanged. A cannot create another continuation/start merely by retrying.                                                                                                                                                                                                                                                                                                    |
| **V03** FR-008–011/021                      | Proposed `quality-command-executor.integration.test.ts`; contracts `src/quality/quality.schema.test.ts`                                                                       | Five pieces; explicit inspect P1/P2/P3, accept P1/P3/reject P2. Exact partition/outcomes and P4/P5 unchanged. Preserve carton `2` / `C-12, C-13`, original-language strings, note-only absent group and later group evidence; received count stays zero.                                                                                                                                                                                                                                   |
| **V04** FR-012–014/017                      | Proposed `quality.service.integration.test.ts`; existing `manufacturing.service.integration.test.ts`                                                                          | Real P06 rejects to each target, real P05 start/complete consumes correction and returns through normal path, real P06 reinspects. Second rejection terminalizes cycle1 and opens only cycle2; acceptance/cancellation closes appropriate current cycle; earlier actors/reasons retained. Paged immutable cycle links retain exact numbers/prior resolutions even after currentCorrection is null; P04 cancellation in either correction department is included through its resolution FK. |
| **V05** FR-015/018                          | Proposed quality executor/service integrations; existing `apps/api/src/modules/approval/approval.service.integration.test.ts`                                                 | Report P1/P2 in one order plus P3 in another with common reason and omitted/null/blank notes. Assert +2/+1 parent versions, complete real P04 children/holds, safe parent recovery and untouched companions. Standalone P04 report remains +1.                                                                                                                                                                                                                                             |
| **V06** FR-018–020                          | Proposed quality executor integrations and database `tests/integration/p06-quality-constraints.integration.test.ts`                                                           | Controlled independent-connection accept-v-reject/report/start and authority/root races. Deliberate immediate/deferred save failure after earlier writes. Compare complete roots/pieces/old visits/issues/new events/cycles/groups/children/receipts/frozen money before/after. One winner, no losing/orphan/partial effects.                                                                                                                                                              |
| **V07** FR-002–004/017/022                  | Proposed quality query integrations; existing `sales-orders.queries.integration.test.ts`, `approval.queries.integration.test.ts`, `manufacturing.queries.integration.test.ts` | Post-transfer order/task access, exact grouped/flat search/type/count/page parity, overlapping correction scopes and no stale historical hold. Parent REPORT appears once; standalone reports/later decisions remain; requested-piece history returns original same-order event/group. Inspect nested privacy.                                                                                                                                                                             |
| **V08** FR-024–027                          | Proposed quality API/hooks/models tests beside F02 owners; existing shared scope/command tests                                                                                | Invalid/wrong-actor/malformed response rejected; exact query identity; frozen same-ID unknown replay; saved-but-refresh-failed state; cancelled unsent dialog; dirty text retained; reset-notify-remove and late-result suppression on account/department/epoch change.                                                                                                                                                                                                                    |
| **V09** shared-contract/privacy regressions | Existing contracts sales/manufacturing schema tests, web `features/sales/model/order-view.model.test.ts`, approval API/hooks/decision tests, sales detail tests               | Added quality union parses without cycles and existing branches remain. No quality event is routed to a sales revision/P04 detail endpoint; quality factory events never use private generic sales/approval DTOs.                                                                                                                                                                                                                                                                          |
| **V10** all primary UI/SC-001–008           | Proposed `apps/web/e2e/quality-packing-reinspection.spec.ts`; quality workspace/dialog/task/shared table/shell component tests in F11                                         | Real synthetic UI/API path and second eligible session across existing routes/aliases, exact selected outcomes, both correction routes, colleague, report, retry/history. Wide/narrow RTL, accessible fields/focus/keyboard, truthful badges and safe factory paper. No localStorage or DB stage patch as main proof.                                                                                                                                                                      |
| **V11** migration/constraint invariants     | Existing database schema/migration tests + proposed P06 constraint integration; existing guarded API reset-data test                                                          | Preserve prior migration hashes; fresh deploy/populated upgrade, unknown-start honesty, correct foreign keys/one-open-visit/cycle/exact selected graph, strict linked report chain and no broad head exception. Extend fixed owned TRUNCATE list without disabling guards/triggers.                                                                                                                                                                                                        |
| **V12** input/HTTP failure boundaries       | Proposed contracts quality tests and quality HTTP integration                                                                                                                 | Empty/duplicate/foreign/overlapping/unsupported quantities; null/blank/4000/4001 reason/instructions/notes; optional carton text and byte parser limit. Actual 400/401/403/404/409/413/error envelope/current authority plus unchanged state; malformed success stays client contract error.                                                                                                                                                                                               |

### Infrastructure, fixtures and cleanup

- Version-boundary verification follows backend B10: T011's real PostgreSQL helper
  tests raise a root version only inside a rollback-only transaction, prove +1
  versus per-order +N headroom and require the exact rollback sentinel or expected
  conflict. T014's unit tests prove the executor forwards the parsed operation and
  performs no write after helper rejection. Existing real command tests retain
  ordinary-version commits/full rollback; no artificial version head is committed.

- Use existing API/database integration global setups and their isolated migrated PostgreSQL containers; Docker/image access and pnpm context are required. Never fall back to a developer/production URL or SQLite. Files run serially; concurrency cases still use independent clients and controlled account/root/advisory lock barriers, with actual winner/loser state assertions and no arbitrary sleep.
- Extend `apps/api/src/test-support/reset-test-data.ts::resetOwnedIdentityTestData` and its exact statement test with every new quality table in one explicit FK-safe TRUNCATE statement. Keep NODE_ENV=test, owned test-URL equality and current_database guards. Do not weaken cleanup or remove/disable integrity triggers. Fault tests create/drop only their own isolated fault triggers.
- A proposed `apps/api/src/test-support/quality.fixture.ts` composes existing `createManufacturingFixture`, `appendManufacturingOrder` and real staff/approval/manufacturing commands. Accepted lifecycle tests never patch quality stage/history directly. Raw SQL is appropriate only inside explicit isolated negative constraint/migration/fault tests.
- Browser setup reuses existing synthetic administrator/catalog/sales/approver, register/verify/admin-approve quality colleagues through current real UI, and advance created orders through real public manufacturing commands. P05 `scenario/createOrder/workUi` helpers are file-local: create bounded P06 test-local helpers, not a fictitious existing import or new seed/test endpoint. Current harness owns its container/API/Next processes/private files; preserve that teardown and disabled credential-bearing trace/video/screenshots.

### Manifest-backed commands for later implementation

Run from repository root after the repository's actual setup. These commands are **planned**, not executed by PLAN; new-file commands apply after those files exist.

```sh
pnpm --filter @template/contracts build
pnpm --filter @template/database db:generate
pnpm --filter @template/database build
pnpm --filter @template/contracts test src/quality/quality.schema.test.ts
pnpm --filter @template/database test tests/schema-contract.test.ts
pnpm --filter @template/database test:integration tests/integration/p06-quality-constraints.integration.test.ts tests/integration/migration.integration.test.ts
pnpm --filter @template/api test src/modules/quality
pnpm --filter @template/api test:integration src/modules/quality
pnpm --filter @template/web test src/features/manufacturing
pnpm --filter @template/web check:e2e-types
pnpm --filter @template/api check:e2e-types
pnpm --filter @template/web test:e2e quality-packing-reinspection.spec.ts
```

Run affected shared approval/manufacturing/sales/scope/transport/contract regressions at the relevant group, as named by B10/F11. Exact narrowed file commands belong in the future task briefs. Package runners do not automatically rebuild changed dependencies; build changed contracts/database first. Database generation/build writes ignored generated files; it is later implementation tooling, not a documentation check.

At actual phase exit require full applicable `pnpm format:check`, `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm verify:build-output`, both harness typechecks, complete `pnpm --filter @template/web test:e2e`, and `git diff --check`. Root `pnpm verify` performs schema formatting/generation/builds; do not run it during PLAN. Missing infrastructure or required results leaves its acceptance gate open. Performance is assessed for bounded page/detail/200-piece/report-chain work without inventing latency/throughput claims.

### Review dimensions

Requirements review traces all FR-001–027/VR-001–009/SC-001–008 to Q01–09 and V01–12. Engineering review applies code-style names/cohesion/types; backend canonical classes/composition; shared contract parsing/compatibility; data locks/constraints/history/migration; current authority/privacy; frontend query/form/draft/cache/focus/localization; meaningful real-boundary tests. Use installed docs-guard for these artifacts, and later clean-code-guard/test-guard/React rules for actual affected implementation. Planning PASS does not preapprove later code or tests. Record actual later requirements/engineering verdicts separately.

## Decisions and Complexity Tracking

| Resolved technical decision                                       | Why / simplest alternative assessed                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate quality work visits; no second quantity store            | P05's currentWorkVisitId/database graph is intentionally CUTTING/PRODUCTION. Widening it would change accepted upstream wire/state semantics. A separate lifecycle adds only the distinct quality visit responsibility.                                                                       |
| One parent quality command across exact orders                    | Owner confirmed whole-selection failure. Browser loops/per-order commits cannot provide atomic mixed results or complete rollback/recovery.                                                                                                                                                   |
| P04 report child chain with narrowly scoped forward guards        | Existing required issue FK/audit, unique order/version and +1 head witnesses prohibit a naive parent-only report. Extract transaction-local actual P04 writers; preserve every old invariant except the exact validated parent-linked final-head equality branch. No generic batch framework. |
| Per-order inspection event plus per-piece decisions               | Existing stable order event/piece model already supplies inspection identity; a separate generic inspection registry/table is unnecessary. One packing group holds captured carton text and accepted members; inspectorNote has one owner.                                                    |
| Original values and optional packing; transport cap retained      | Current reached controls capture free text without numeric carton rules. Keep original nonblank values and finite 4000 limits; note-only inspections retain notes without inventing a packing fact. A known 413 asks explicit selection review, never partial save.                           |
| One current correction cycle, retained terminal outcomes          | Failed reinspection closes the prior cycle and opens one next; acceptance/P04 cancellation closes the current cycle through actual authority. Previous rejection flags cannot inflate current counts.                                                                                         |
| Leaf quality activity schema and validated child suppression      | Existing shared sales/approval history needs the new event without an import cycle or one action counted parent+children. Full private approval facts remain server-owned.                                                                                                                    |
| Closed existing quality UI branches and scoped query session      | Reusing P05 DTOs through casts would misrepresent departments/visits. Exact quality API/hooks/model seams retain reached design, one command recovery slot and old-context cleanup.                                                                                                           |
| Provider/upload/queue/financial/physical-receipt capabilities N/A | P06 introduces none. Warehouse incoming is saved piece state; physical receipt/delivery/P08 operations/release are later owning phases.                                                                                                                                                       |

## Design Readiness and Exit

**REQUIREMENTS DESIGN: PASS. ENGINEERING DESIGN: PASS.** Review at intake revision `c8d9e77` covered the final written operation/source/interface/contract/data/frontend and verification owners. Q01–Q09 and V01–V12 cover all FR-001–027, VR-001–009 and SC-001–008; each applicable blueprint has fixed interfaces, algorithms, state/authority/failure rules and concrete future evidence. No unresolved material product or technical design decision remains at the PLAN gate.

Independent source/verification and frontend/cross-artifact reviews plus the author/docs-guard pass resolved the following findings before readiness:

- Made the report-child equations explicit as `child.beforeVersion = parent.beforeVersion + ordinal - 1` and `child.afterVersion = parent.beforeVersion + ordinal`, avoiding Markdown list parsing of arithmetic.
- Added canonical immutable historical correction cycle IDs/numbers/action links, failed-prior/new-cycle binding and actual P04 cancellation resolution even when an issue originated in a correction department. Current status is not grafted onto an old opening event.
- Corrected the existing safe internal-error code to `INTERNAL_SERVER_ERROR` from its actual source.

The final design preserves optional carton text/note ownership, exact batch identity/whole rollback, strict P04 child audit chains, positive-only legacy correction witness compatibility, private factory projections, original group history and scoped frontend recovery. These are reviewed design claims, not code execution results.

Fresh documentation checks during this PLAN invocation passed: scoped Prettier formatting/check for all five new planning files, 25 relative file links/anchors, English-only artifacts without unresolved design placeholders or trailing whitespace, and `git diff --check`. SHA-256 preservation checks confirm the existing P06 spec/checklist, feature pointer and protected root roadmap are byte-identical. Git reports no tracked source changes and exactly these five planning additions alongside the two preserved P06 specification files. No extension manifest exists before/after PLAN, so no hook was registered or dispatched.

TASKS briefs remain a later producing-stage output. Backend implementation/acceptance, dependent frontend implementation/acceptance, full P06 execution and production release are **NOT PERFORMED**. Historical P05 ledger results remain inspected reused evidence only. This command changes only the five new P06 planning artifacts and preserves the existing spec/checklist/pointer, protected roadmap and all application/prior feature files.

### Scoped ANALYZE remediation — 2026-11-11

- **C1 resolved in the design**: B02 fixes
  `lockQualityOrders(tx,{actor,operation,orders})`, with the operation supplied from
  the strict parsed command. B03 assigns the helper the per-order +1/+selected-count
  overflow check after relationship authorization and before any effect. B10 fixes
  concrete, rollback-only boundary verification and executor forwarding evidence.
- **D1 resolved in the contract presentation**: Canonical union alternatives in
  Contracts §§6.1–6.2 use escaped table separators. Field meanings, alternatives,
  nullability, accepted product behavior and the wire contract are unchanged.
- The original intake/check evidence above is retained as historical PLAN evidence.
  This amendment reuses the accepted spec/clarification, data design and frontend
  blueprints; CHECKLIST/TASKS and a fresh read-only ANALYZE follow within the owner's
  authorized sequence. Their current results belong to those stages, not this PLAN
  entry. No application test, migration or task execution is claimed.
- **Scoped PLAN requirements/design review: PASS. Engineering design review: PASS.**
  The helper input and rollback-only boundary method were checked against current
  P04/P05 source. Scoped Prettier formatting/check passed for the three amended PLAN
  owners. All seven contract tables (65 rows) have matching column counts; the 14
  schema shape rows retain identical normalized field/type/union/nullability text.
  These are documentation/design checks only.

### Scoped arrival-selector correction — 2026-11-12

The owner explicitly approved returning the T010 stale interface assumption through
PLAN/TASKS and read-only ANALYZE, then resuming Group 2. Backend B02 now selects the
existing ManufacturingPieceEvent.commandOrder.command.occurredAt relation and maps
it into the unchanged flat QualityArrivalRecord.occurredAt. The prior direct
ManufacturingPieceEvent.command relation does not exist in current source/generated
Prisma types. No new relation/FK, wire shape, product rule or database change is
authorized or needed by this correction.

Requirements design: PASS. Engineering design: PASS for this narrow correction
against schema.prisma::ManufacturingPieceEvent, ManufacturingCommandOrder.command
and generated ManufacturingPieceEventSelect. Existing constitution gates, accepted
decisions, IDs/progress and verification cases remain valid. Separate research,
data-model, contracts and frontend amendments are N/A because their interfaces do
not change. Only the arrival selector and its implementation brief need alignment;
this planning result is not implementation/backend acceptance.

### Maximum-report design correction — 2026-11-12

The isolated required 200-member report failed at 10539 ms after real upstream
fixture setup (117452 ms). Backend acceptance is open. Under the owner's instruction
to apply recommended finding resolutions, B07a/M05a specify a bounded internal
writer-result/fact-projection and equivalent set-based-validator correction.
T018 consumes its completed dependency outputs and owns fresh regressions; prior
progress/evidence is preserved. No product/schema/wire, runtime budget, atomicity,
old migration, frontend, commit or deployment change is authorized by this correction.
Constitution design review: PASS for ownership/shared exact money rules, source-
faithful persistence/current authority, unchanged guards and planned actual maximum /
rollback checks. Execution and backend acceptance remain BLOCKED until required
fresh evidence passes. Read-only incremental ANALYZE follows the amended briefs.

The first maximum correction returned successfully but failed the through-COMMIT
10000 ms assertion at 32334 ms. M05a step 4 now includes equivalent set validation
of P04's repeated per-issue witness loop; original proposal/return/state checks and
all trigger registrations remain. This is still design-only readiness for the added
body, with T018/T024 execution acceptance open until fresh evidence passes.

Focused profiling of the remaining 13465 ms timing failure identified repeated full
P04/P05-compatible receipt construction (P06 command validation 5120.65 ms self;
P05 command validation 3742.05 ms self). M05a step 5 replaces only reconstruction
with exact typed metadata/ordinal/key/null comparisons and explicit malformed-
receipt regressions. All original guard calls, schemas, identities and time limits
remain. This amendment is a design/readiness correction, not execution acceptance.

The maximum after strict receipt comparison measured 11986 ms. M05b specifies an
inductive unchanged-manufacturing-state proof for the two canonical quality-report
trigger cases, with repeated full parent validation and unchanged full fallback /
all domain mutation triggers. T018 owns three named adversarial guard tests plus
fresh backend/maximum evidence. This is a bounded internal dispatch design change,
not a policy, schema, migration-history, timeout, atomicity or release change.

### Scoped Group 2 current-source corrections — T022/T024

B08a fixes the observed raw-query 40001 adapter mismatch using a quality-owned exact
classifier and the existing single-retry/named-conflict protocol; M06a extends one
existing owned seed-test cleanup list for eight actual new FK tables. No product,
wire/schema/roadmap/client gate or P01–P05 policy changes. Existing accepted files,
IDs and completed evidence are preserved. Applicable constitution gates remain PASS
at design level: canonical owners, actual source/installed adapter, current authority,
atomic bounded transactions, safe errors, meaningful real regressions and owned
cleanup are explicit. T022/T024 execution remains open until fresh evidence passes.

### Group 3 pure-binding owner correction

F02a resolves the model/API dependency conflict for T025/T028 by placing their one
exact binder in a pure feature model and retaining the accepted API export. Current
contracts/transport signatures and all product/authority/atomicity decisions remain
unchanged. Constitution ownership/contracts/readiness gates PASS at design level;
focused API and command-state checks must verify the implementation.

Group 3 narrow PLAN correction: F10a narrows applyQualityFormErrors to the canonical INSPECT orders pick; no command ID belongs to form rendering. Existing full-body callers remain compatible.

Group 3 review amendment F10b: explicit read/write failure context and guarded asynchronous review. These preserve truthful read states and existing write-recovery semantics.

Group 3 harness correction F08a: update the existing warehouse regression that consumes the converted Quality detail; use current canonical Quality data and actual QueryClient provider. No product change.

### Authorized convergence maximum-report projection correction — 2026-11-12

The full renewed serial integration run passed 536/537 cases; only the original 200-member through-COMMIT assertion failed at 10578ms. The owner authorized a narrow PLAN/TASKS correction, read-only ANALYZE, its accepted implementation and resumption of T057/T061. [B07b](backend-design.md#b07b-fact-only-source-projection-for-repeated-reports--authorized-2026-11-12) is the filled operation blueprint: retain each actual after-child database refresh and all current physical/financial/fact validation, but select only fields consumed by those facts instead of the complete sales-screen graph. It supplies exact proposed selects/types, compatible signatures, ordered writes/reads, preserved failures and concrete test owners.

This amends only B07a's internal refreshed-record shape. M05a/M05b, every existing migration/function/trigger, contracts, authority, child/version chain, transaction/body/lock limits, atomicity and frontend presentation remain unchanged. No new schema/migration/provider/dependency or performance SLA is introduced. Temporary owned profiling is diagnostic and will be removed; the uninstrumented `<10000ms` case and complete regressions must pass before backend/phase acceptance. Existing failure and passing histories remain visible.

Pre-research/design constitution gates: PASS for bounded authorized scope, existing owners, unchanged HTTP/current authority, actual source reads and exact shared money/count rules, unchanged frontend/delivery order, meaningful owned checks and explicit interfaces. Data migration and external capabilities are N/A because no storage or external-effect change is planned. B07b post-design readiness PASS; TASKS must add its bounded execution brief and ANALYZE must review it before production edits. This planning result is not runtime acceptance.

### Authorized maximum-report dispatch follow-up — 2026-11-12

The projection correction passed its 401 API units and 75 focused integrations but did not close the next full-run maximum failure. The owner-authorized narrow correction sequence continues through [B07c](backend-design.md#b07c-complete-maximum-report-correction-through-stateless-guard-dispatch--2026-11-12) and [M05d](data-model.md#m05d-stateless-quality-validation-dispatch-by-unchanged-read-set--authorized-follow-up-2026-11-12). These fill the exact new forward function owner, unchanged predicate extraction, closed trigger/read-set dispatch, valid-base preflight, equivalence/forcing proof, populated upgrade and required checks. Experimental join rewrites did not materially improve the measured cost and are excluded.

All guard predicates, triggers, retained full validators and positive witness-helper checks remain; redundant parent traversal is omitted only when the triggering table cannot change its read set. No cache/GUC/caller flag, migration rewrite, domain/wire/UI/authority/atomicity/budget change is permitted. One new forward function migration is now required; it replaces B07b's no-migration exclusion for this measured correction only. Existing schema fields/data remain unchanged. Planning constitution gates PASS for bounded scope, existing ownership, unchanged authority/contracts, explicit stateless integrity proof, forward safety, preserved frontend and concrete real checks. Runtime acceptance remains BLOCKED until T063, T062/T057 reacceptance and T061 full checks pass. TASKS must provide the bounded T063 brief; read-only ANALYZE precedes SQL edits.
