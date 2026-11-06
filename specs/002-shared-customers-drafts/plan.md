# Implementation Plan: Shared Customers and Persistent Incomplete Sales Drafts

**Roadmap Phase**: P02 — Shared customers and persistent incomplete sales drafts  
**Feature Directory**: `specs/002-shared-customers-drafts`  
**Date**: 2026-11-05  
**Spec**: [Accepted product definition](spec.md)  
**Git baseline**: `main`, `b286d4e`; P02 specification/checklist are existing untracked work to preserve  
**Authorized Scope**: PLAN only: operation blueprints, supporting contract/data/frontend design and design-readiness evidence. No implementation, task generation, requirement/checklist amendments, application tests, migrations, imports, commits, pushes or deployment.

**Authorized follow-up (2026-11-05)**: Scoped OP-04A/backend/F10 amendment and remaining Group 3 implementation were subsequently owner-approved; the initial PLAN-only scope above is historical. See OP-04A below; root roadmap and Group4 authorization remain unchanged.

## Summary

Extend the existing account/staff foundation with one shared customer directory and owner-scoped incomplete draft aggregates. Customer identity is independent of its mutable Saudi phone. A saved draft is one ordered aggregate with stable piece UUIDs, optional customer and provisional captured paper values. The existing manual save persists its entire form; row add/duplicate/remove are local form actions until that save. A scoped retained command record supplies atomic change evidence and lost-response reconciliation for customer and draft writes. Required backend acceptance precedes any dependent frontend integration.

Preserve the reached Arabic/RTL/Cairo pages, dialogs, searchable cells, measurement placement and print family. Converted P02 consumers use validated real responses without fixture fallback. Price/total/balance and submission remain explicitly unavailable until P03. No customer-master update rewrites a later submitted snapshot. P01 and the protected root roadmap are unchanged.

## Technical Context

| Topic                | Verified baseline and selected design                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/tooling      | Root manifests require Node `>=24 <25`, pnpm `>=11 <12`, `pnpm@11.17.0`; strict TypeScript `5.9.3`. No toolchain upgrade.                                                                                                          |
| API/contracts        | Express `5.2.1`, Zod `4.4.3`, `zod-openapi 6.0.0`; explicit service/controller classes and injected collaborators. Shared browser-safe contracts remain the one wire owner.                                                        |
| Persistence          | Prisma/adapter-pg `7.9.1`, PostgreSQL; existing `createDatabaseClient(connectionString)` and generated client. Add forward migrations only; retain all five existing SQL migrations.                                               |
| Web                  | Next `16.2.12`, React `19.2.8`, React Query `5.101.4`, RHF `7.84.0`, resolvers `5.7.1`, Axios `1.19.0`. Reuse existing QueryClient, session, transport, form helpers and source paper.                                             |
| Tests                | Vitest `4.1.10`, jsdom/Testing Library, real migrated PostgreSQL Testcontainers and the existing Playwright `1.64.1` harness (`desktop` and `narrow`). Source reading is not fresh test execution.                                 |
| Transport/config     | Existing `/api/v1`, central credential/CSRF/refresh handling, JSON success/error envelopes and no-store authentication boundary. `BODY_LIMIT` defaults to `1mb`; retain it and apply the narrower contract aggregate bound.        |
| Operational baseline | `apps/api/src/router.ts` mounts auth/users/staff/health/OpenAPI; schema holds identity/staff models. Operational customer/draft data is still browser-local. No P02 API or database model exists at intake.                        |
| Dependencies         | No new infrastructure/client/auth library. Reuse P01 authority locks and contract parsing. New helper/module extraction is justified by the actual customer/draft operations below, not a repository framework.                    |
| Performance/scale    | No accepted throughput/latency/commercial-capacity target. Bounded pages, payloads, projections, transaction duration and set-based queries are specified in the supporting design; this plan makes no measured performance claim. |
| Platform/release     | Retained web routes and existing Chromium profiles. Hosting/domain/mail/business-timezone/bootstrap/backup release specifics remain OPS-01 and do not block date-only draft capture.                                               |
| Preserved work       | Existing P02 `spec.md` and `checklists/requirements.md`, active pointer, root `plan.md`, P01 artifacts, production source and prior migration checksums remain untouched.                                                          |

## Constitution Check

Before-research assessment: the request, matching feature, preserved baseline and actual foundation seams were identified before choosing the new operation design. Relevant unknowns were source interfaces, concurrency, paper callers, receipt semantics and test isolation; their owners were inspected in parallel. All seven gates had a viable in-scope design path. The post-design column is assessed against the linked filled owners, with final review evidence recorded under Design Readiness and Exit. A PASS is design compliance and planned evidence, never an executed behavior/test/release result.

| Gate                                       | Before research | After design | Evidence and applicability                                                                                                                                                           |
| ------------------------------------------ | --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope/selection/dependencies/preservation  | PASS            | PASS         | P02 maps to this feature; P01 current interfaces reused; spec FR-001–027 and exclusions retained; NUM-01/P03/OPS-01 limits remain.                                                   |
| Ownership/direction/reuse                  | PASS            | PASS         | Source ledger below; modular Express and feature API/hooks/model seams; no Prisma in browser, second session/transport/store or generic repository.                                  |
| Contracts/HTTP/authority/safety            | PASS            | PASS         | [Contract ledger](contracts/customers-drafts.md); current actor locks and strict schemas; private owner-scoped projections; established envelopes/CSRF/error handling.               |
| Data/bounds/concurrency/migration/recovery | PASS            | PASS         | [Data model](data-model.md); named constraints, scoped short transactions, command binding/CAS, retained tombstones/history and forward-only upgrade. External provider work is N/A. |
| Delivery order/preserved UI/state          | PASS            | PASS         | Backend acceptance group before UI; [frontend design](frontend-design.md) fixes each reached caller, query/identity/draft state and unavailable finance/submission.                  |
| Verification/review                        | PASS            | PASS         | Verification matrix below specifies real database/HTTP/React/browser boundaries, isolated cleanup and separate conformity reviews; no tests executed by PLAN.                        |
| Operation/implementation handoff           | PASS            | PASS         | OP-01–09 plus exact contract/data/frontend ledgers resolve technical decisions; bounded execution briefs are the future TASKS output, not generated/preapproved here.                |

## Project Structure and Responsibility Owners

### Feature artifacts and one owner per decision

- [spec.md](spec.md) is the preserved product owner; its existing built-in checklist remains 16/16 at the previously reviewed requirements level. PLAN does not change markers.
- This `plan.md` owns operation ordering, cross-boundary blueprints, verification and design-readiness evidence.
- [contracts/customers-drafts.md](contracts/customers-drafts.md) owns exact methods/paths/statuses, request/response types, field normalization/bounds, safe error codes and proposed service interfaces. Other documents reference it instead of defining competing DTOs.
- [data-model.md](data-model.md) owns persistence fields/relations, named constraints/indexes, transaction/receipt algorithm, query projections and migration/recovery.
- [frontend-design.md](frontend-design.md) owns the reached UI inventory, exact API/hook/model signatures, query keys/options, state machine, form adapters and paper compatibility.
- Separate `research.md`: N/A; concrete decisions and alternatives fit their owners above. Current-source and scoped primary-reference checks, including Saudi number shapes and PostgreSQL transaction locks, are recorded in the contract/data owners without a separate research report.
- Separate `quickstart.md`: N/A; runnable prerequisites/verification and command effects are owned by this plan's Verification and Review Plan. No new runtime setup is introduced.
- `tasks.md`: not created; TASKS must later derive bounded briefs from the operation references below. No custom checklist is created by PLAN.

### Existing foundation interface ledger

All entries in this table exist at the inspected baseline. Local private staff helpers are examples, not exported reusable APIs.

| Owner / exported interface                             | Exact reuse                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/src/client.ts`                      | `createDatabaseClient(connectionString: string): DatabaseClient`; existing server composition owns the client, not a controller/browser.                                                                                                                                                        |
| `apps/api/src/modules/auth/account-authority.ts`       | `lockAccountRows(tx: Prisma.TransactionClient, userIds: readonly string[], mode: "read" \| "write"): Promise<void>`; `loadIdentityAccount(tx, userId): Promise<AuthorityAccount>`; `assertBusinessAuthority(account, department?): void`.                                                       |
| `apps/api/src/middlewares/auth.middleware.ts`          | `createAuthenticationMiddleware(database)` supplies current business identity and `Cache-Control: no-store`; service transactions recheck current authority.                                                                                                                                    |
| `apps/api/src/middlewares/authorization.middleware.ts` | `authorizeDepartments(...departments: readonly Department[])`; ADMIN exemption is already supported. Use SALES on every P02 route.                                                                                                                                                              |
| `apps/api/src/middlewares/validation.middleware.ts`    | Existing parsed `request.validated` body/query/params owner; missing authenticated/validated context is a server wiring error, not an empty actor fallback.                                                                                                                                     |
| `apps/api/src/core/responses/api-response.ts`          | `ResponseHelper.ok(response,data,message,path,requestId)` / `.created(...)`; retain existing envelope argument order.                                                                                                                                                                           |
| `apps/api/src/core/date-only.ts`                       | `parseDateOnly(value: string): Date`, `serializeNullableDateOnly(value: Date \| null): DateOnlyString \| null`; retain interfaces, correct low-year UTC construction for the contract's real-calendar range, and extend existing date tests. API-only conversion, no import into contracts/web. |
| `apps/api/src/core/serialization/decimal.ts`           | `serializeDecimalToString(value: unknown): string`; canonical decimal serialization, not a complete pricing policy.                                                                                                                                                                             |
| `apps/web/src/services/api/api-client.ts`              | `apiClient`, `parseApiResponse<T>(raw: unknown,dataSchema: ZodType<T>): ApiResponse<T>`, `getApiError`, `ApiContractError`; session epoch/subject/restore exports reused, not rebuilt.                                                                                                          |
| `apps/web/src/features/auth/hooks/auth.hooks.ts`       | `AUTH_SESSION_QUERY_KEY`, `useSession(options?)`, `reconcileBusinessDenial(queryClient,error,scope)`; exact scope arguments remain defined by source and frontend design.                                                                                                                       |
| `apps/web/src/shared/query/query-client.ts`            | `createQueryClient(): QueryClient`; stable existing provider; 30-second default freshness, bounded network/500–504 query retries, no automatic mutation retry.                                                                                                                                  |
| `apps/api/src/test-support/reset-test-data.ts`         | `resetOwnedIdentityTestData(database): Promise<void>`; extend only its fixed owned fixture graph while preserving all ownership/environment/database-name guards.                                                                                                                               |
| `apps/web/e2e/runtime.ts`                              | `readE2eRuntime(): E2eRuntime`, `waitForCapturedAction(email,kind): Promise<string>`; owned fixture coordination only, not operational authority.                                                                                                                                               |

### Proposed and modified owners

The following P02 symbols/files do not exist at intake. Exact complete symbol/file/type ledgers are fixed in contracts §6 and frontend design; a proposed output must exist and pass its producer gate before a consumer imports it.

| Responsibility                | Owner/action                                                                                                                                                                                                                                                                                                                        | Boundary                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executable wire schemas       | CREATE `packages/contracts/src/customers/customers.schema.ts`, `sales-drafts/sales-drafts.schema.ts`, `sales-drafts/sales-draft-values.schema.ts`, `sales-commands/command-receipt.schema.ts`, `sales-commands/sales-commands.schema.ts`; MODIFY `packages/contracts/src/http/http.schema.ts` and `packages/contracts/src/index.ts` | Browser-safe canonical inputs/outputs; additive shared pagination fields; acyclic receipt/type/domain union dependency graph; no API/database dependency. |
| Customer HTTP/use cases       | CREATE `apps/api/src/modules/customers/customers.service.ts`, `.controller.ts`, `.routes.ts`, focused `.queries.ts`, `.mapper.ts`, `.errors.ts` and exact DTO aliases in contract ledger                                                                                                                                            | Shared customer writes/reads; derive actor, no controller database work.                                                                                  |
| Draft HTTP/use cases          | CREATE `apps/api/src/modules/sales-drafts/sales-drafts.service.ts`, `.controller.ts`, `.routes.ts`, `.queries.ts`, `.mapper.ts`, `.rules.ts`, `.errors.ts` and DTO aliases                                                                                                                                                          | One aggregate write path and scoped projections; pure piece diff/validation has independent meaning.                                                      |
| Retained command/history      | CREATE `apps/api/src/modules/sales-commands/sales-command-executor.ts` and named types/errors/mapper/service/controller/routes in contract ledger                                                                                                                                                                                   | Customer/draft command replay/audit/receipt only; no generic job/event/workflow framework.                                                                |
| Composition/OpenAPI           | MODIFY `apps/api/src/router.ts`, `apps/api/src/modules/index.ts`, `apps/api/src/infrastructure/openapi/openapi.ts`; module public exports                                                                                                                                                                                           | One injected executor shared by customer/draft services; register literal routes before dynamic routes.                                                   |
| Reached shared input boundary | MODIFY `apps/api/src/middlewares/error-handler.middleware.ts`, `apps/api/src/core/constants/http-status.constants.ts` and `apps/api/src/core/date-only.ts` with existing error/date tests                                                                                                                                           | New safe parser400/413 mapping and correct real-calendar conversion; no global body-limit or auth protocol change.                                        |
| Persistence                   | MODIFY `packages/database/prisma/schema.prisma`; CREATE the one new forward SQL migration named in data-model §5                                                                                                                                                                                                                    | Add only P02 records/relations/constraints; no rewrite/backfill of approval or browser data.                                                              |
| Frontend read/write seams     | CREATE customer API/read hooks/model and sales draft API/read hooks/model, `features/sales/hooks/sales-commands.hooks.ts`, `features/sales/model/sales-command-state.ts`, and `shared/query/operational-scope.ts` as inventoried in frontend design                                                                                 | One scoped write lifecycle for the four actual commands; real independent customer/draft query consumers justify the shared scope guard.                  |
| Reached components/routes     | MODIFY the exact sales/admin customer, create/edit/drafts/read consumers and shared paper owners inventoried in frontend design                                                                                                                                                                                                     | Preserve pages/markup; replace selected local reads/actions without removing the provider required by unconverted departments.                            |
| Tests/cleanup                 | CREATE/EXTEND the discovered files in Verification and Review Plan                                                                                                                                                                                                                                                                  | Preserve isolated owned resource graphs, prior regressions and source discovery patterns.                                                                 |

## Contracts, Authority and Failure Design

Use [contracts §2–6](contracts/customers-drafts.md) for every concrete schema/DTO/error/path/status, and [data-model §2–4](data-model.md) for constraints, actor/resource locking, CAS/replay and query details. These are deliberately proposed interfaces, not existing endpoints.

The shared protocol is: business authentication → SALES-or-ADMIN route authorization → CSRF for writes → strict body/query/params validation → required controller context → service transaction with current actor authority → minimal safe result → established response envelope → existing runtime parser → scoped Query publication → existing presentation. Public/global errors retain existing safe request IDs and no raw SQL/payload disclosure.

Current P01 source already exports authority-row locks, safe success parsing, `ApiContractError` and session-epoch protection. Some general engineering guide baseline paragraphs predate P01 and describe those capabilities as missing; use the verified source and current normative target, rather than scheduling a second implementation of them. P01's private staff cache helpers remain private; only the narrow actual shared exports above are reused.

The receipt is the immutable committed after-image, not a current resource projection. A replay never silently changes its original result. A confirmed write with failed current refetch is “saved, refresh incomplete”; keep its receipt and retry observation. Unknown outcomes use the same frozen command identity and body. Current authority/resource scope still applies to receipt observation. Exact response unions, hash binding and conflict codes are fixed in the contract/data owners.

No P02 submit endpoint is introduced. Strict request allowlists reject client authority/price/status fields. The existing submit UI is unavailable and its local workflow mutation is removed from the converted path. Unsupported direct submission paths cannot create a number/order transition. No new price/catalog rows, official-print projection or manufacturing release is created.

## Operation Blueprints

For every operation, follow the specific algorithms and exact ledgers linked below. References to complete contract/data/frontend sections are part of the blueprint. Tests named below are planned owners; none is claimed present/passing merely because it is listed. No material algorithm/interface/cache choice may be delegated to IMPLEMENT.

### OP-01 — Validate and adapt the P02 boundary

**Requirements**: FR-001–005, FR-010–014, FR-019/023/025; spec input/authority examples.  
**Owners/interfaces**: New shared schemas in contracts §2–3; new DTO aliases/routes/controllers in §4/6. Reuse middleware, response helpers and `parseApiResponse` from the foundation ledger. New requests are parsed raw inputs; schema output types are inferred once and imported by producer/consumer. The current staff controller's local context helpers are not importable APIs.

**Ordered decisions**:

1. Existing global body parsing precedes route guards. Add the narrowly recognized safe `INVALID_JSON`400 / `PAYLOAD_TOO_LARGE`413 translation from contracts §5 without logging raw parser bodies or changing the global limit. Then validate strict request shape, UUID syntax, bounded query/strings/collections and operation-specific omission/null/blank semantics. Never coerce a client-selected authority field into an allowed update.
2. Normalize Saudi local/`+966`/`00966` and both Arabic digit sets by the single contract-owned policy; email is optional and nonunique. Keep original paper strings/language independent of normalization used for phone identity/search.
3. Validate date-only and exact provisional paid amount separately from server time/price. Blank paper fields are valid captures, quantity is one and draft type is one of the seven accepted values. No catalog membership/quote or business number is required.
4. Controllers require actor plus validated input, call the named service and map its safe output. The browser parses envelope and data with `parseApiResponse`; malformed success becomes `ApiContractError`, not a network/empty-success fallback.

**Frontend**: Raw form/wire adapters and typed nested field-error mapping in frontend design. Preserve local input after errors. Unknown field paths stay a safe general error; no arbitrary nested cast.  
**Verification**: Contract tests for meaningful accepted/rejected boundaries and canonical numeric pagination; response-adapter malformed/private-field tests; HTTP strict input/context/parser error envelopes; existing date-only cases extended for valid low years and leap-day/0000 rejection. Examples include blank draft success, `2026-02-30` rejection, paid `100.50` exact two-place capture without floating point, negative/excess precision and client owner/price/status rejection. Saved state remains unchanged on rejected input.  
**Design status**: PASS; schema/method/error/normalization owners are fixed, not implementation output.

### OP-02 — Read/search/resolve shared customers

**Requirements**: FR-002–007/017–019/025–027; US1/US5, SC-001/004/005.  
**Service interface**: Proposed `CustomersService.list(actorId: string,query: CustomerListQuery): Promise<CustomerListData>`, `.get(actorId,customerId): Promise<CustomerData>`, `.getByPhone(actorId,phone): Promise<CustomerData>`. Exact file/DTO definitions: contracts §3/4/6; query/projection owner: data-model §4.

**Ordered algorithm**:

1. In the specified repeatable-read transaction, acquire the current actor account read lock before loading authority; require `assertBusinessAuthority(actor, SALES)` (ADMIN exempt from department matching).
2. Parse search/filter/page once and form a single bounded where/sort scope. Customer contacts are shared; joined draft counts/latest values are owner-filtered for sales and broader for ADMIN. Use matching row/count filters, stable tie-breaker and set-based bounded relation reads.
3. Phone routes use exact canonical resolution; a missing current phone/customer produces the documented missing result. No `.find(...) || customers[0]`, partial-name auto-selection or permanent old-phone alias.
4. Allowlist fields from queried records, serialize safe dates and return the contract's consistent page/count/detail data. New page links use the current phone, while saved relations use immutable customer ID.

**Frontend**: Customer keys/options/abort/identity publication are fixed in frontend design. Preserve name/phone/email search and case-insensitive email matching; changing search resets page and cancels obsolete reads. Keep loading/empty/error separate; no browser filtering of only one server page while claiming full-directory search.  
**Concrete checks**: A/B both find C by normalized phone; an email query in different case finds C; unknown phone shows missing; A sees zero B-only draft count/measurement while ADMIN sees broader results; no-match and read failure differ; empty/out-of-range pages preserve correct metadata. Owners: customer service integration, P02 HTTP integration, customer read hooks and reached screen tests.  
**Design status**: PASS.

### OP-03 — Create/update a shared customer atomically

**Requirements**: FR-002–006/019–023/025–026; US1, phone-change/optional-field/duplicate/stale examples.  
**Interfaces**: Proposed `CustomersService(database: DatabaseClient,commands: SalesCommandExecutor)`, `.create(actorId,input: CreateCustomerBody): Promise<CustomerCommandData>`, `.update(actorId,customerId,input: UpdateCustomerBody): Promise<CustomerCommandData>`. Contracts §4–6 own HTTP/create/update/replay results; data-model §3 owns locks/command ordering and phone constraint handling.

**Ordered algorithm**:

1. Enter the command executor with frozen command ID, operation, authenticated actor, target/expected version and canonical payload binding. Recheck current SALES/ADMIN authority while holding its P01 account lock.
2. Serialize the command identity using the transaction-scoped protocol fixed in data-model §3 before receipt lookup or resource work. Recognize an already committed same-actor/same-intent command before applying a stale-version update. Matching replay returns the original immutable saved customer; changed intent conflicts. Replays still require current scope.
3. New create uses server UUID/time and explicit editable fields. Update locks/selects C, checks current expected revision, applies only supplied normalized fields and preserves omitted values; no owner/history changes or linked-order rewrites.
4. Enforce canonical phone uniqueness at the database. Classify only its named collision as duplicate; identify the accessible shared C through an authorized lookup. Other failures are not silently treated as duplicates. Do not merge on email.
5. Persist the master change, version, command receipt and safe before/after actor evidence together. Roll back all on a dependent failure. Return the command's validated saved after-image.

**Frontend**: Shared command hook in frontend design owns pending/same-intent replay/current reads/cache sync; on update success resolve C's current URL and retain stable relation. Confirmed receipt is not directly substituted for a newer current detail. Duplicate stays an error plus explicit existing-customer selection.  
**Concrete checks**: Competing `0500000001`/Arabic/`+966` creates yield one customer and one winning receipt; distinct phones with same email both persist. Phone edit retains draft C ID. Two revisions yield one winner/one stale rejection. Forced receipt failure rolls back customer/version/history; lost response reconciles one effect. Owners: customers service integration, command executor integration, actual HTTP and customer/shared-command hook tests.  
**Design status**: PASS.

### OP-04 — Read scoped drafts, provisional measurements and draft activity

**Requirements**: FR-007/010–012/017–019/025–027; US3/US5, SC-002/004.  
**Interfaces**: Proposed `SalesDraftsService.list(actorId,query: DraftListQuery): Promise<DraftListData>`, `.get(actorId,draftId): Promise<DraftData>`, `.changes(actorId,query: DraftChangesQuery,draftId?: string): Promise<DraftChangesData>`; `CustomersService.measurements(actorId,customerId,query: CustomerMeasurementsQuery): Promise<CustomerMeasurementsData>`. Exact route/query/summary/projection shape: contracts §3–6 and data-model §4.

**Ordered algorithm**:

1. Establish current authority inside the repeatable-read snapshot as OP-02. Build owner scope from current server actor; a customer ID or URL never grants extra order permission.
2. Read matching page, count and specified summaries from that scope. Detail selects only the exact accessible draft and active ordered pieces; foreign and missing IDs share the safe missing outcome. ADMIN broader reads never reassign original owner.
3. Customer-related draft/measurement reads use stable customer ID plus the same owner scope. Label measurements provisional, retain actual values/actor/time and keep submitted/approved-history sections honestly unavailable until P03. Bound latest/profile/history queries explicitly.
4. Global draft activity and per-draft changes use retained command evidence scoped by draft owner/current ADMIN. Register literal `/changes` before dynamic draft ID matching. Customer-master shared access does not widen private activity.

**Frontend**: Existing `/sales/orders/drafts`, draft portions of order/detail/dashboard/activity and sales/admin customer panels use the exact read hooks/mappings in frontend design. P03-only portions display readiness/actual empty data, never local fixtures or demo order links. ADMIN uses retained cross-department sales draft routes for real details, not an invented P08 admin draft editor.  
**Concrete checks**: A/B share C but only own D/P/activity/count/latest measurement is visible; every direct foreign read is missing; ADMIN broader read works; size from a draft is never called approved; empty data produces no seed result. Owners: service/HTTP integration, draft/customer hook/screen tests and two-context browser journey.  
**Design status**: PASS.

### OP-05 — Create/save an incomplete draft aggregate and piece changes

**Requirements**: FR-008/010–016/019–024; US3/US4, SC-002/003/006/007.  
**Interfaces**: Proposed `SalesDraftsService(database: DatabaseClient,commands: SalesCommandExecutor)`, `.create(actorId,input: CreateDraftBody): Promise<DraftCommandData>`, `.save(actorId,draftId,input: SaveDraftBody): Promise<DraftCommandData>`. The strict full capture schema, payload bound, UUID semantics and error ledger are in contracts §2–6. Exact model/constraints/piece-diff/receipt algorithm: data-model §1–3.

**Ordered algorithm**:

1. Parse one complete capture with at least one piece, known type, optional customer/date/notes/paid/signature, distinct UUIDs and quantity one. Bind frozen command identity to its normalized payload. Do not require specifications/catalog/number/quote.
2. Under the command transaction, establish current actor, matching replay and accessible editable draft. Create derives owner/ID/time; save locks exact draft and CAS revision/state. A stale/locked/foreign target changes nothing.
3. When a customer ID is supplied, lock/resolve its saved stable record by the specified order; missing is not converted to no selection. A cleared optional relation is valid. Master contact changes never detach links.
4. Diff active stored piece IDs versus the submitted ordered IDs. Retained IDs keep identity; additions/copies are new globally unused IDs; foreign/tombstoned reuse is rejected safely. Removed pieces are retained inactive evidence. Assign display position from payload order, preserving one physical row each.
5. Persist draft capture/version, all dependent pieces and retained command before/after evidence as one short transaction; price/total/workflow/counter authority is absent from accepted input. On failure, no partial row/version/history remains. Stable internal identity is retained for later phase evolution without creating a business number.
6. Return the immutable saved draft result from this command. Future current reads may show a later revision; the UI distinguishes those from this receipt.

**Frontend**: The paper uses one RHF-owned capture/pieces field, no second persisted store. Existing add/duplicate/remove functions become pure draft form operations; no save is sent until explicit Save. Copy creates a new UUID and excludes server fields. Existing final-row restriction remains. Retain all typed fields and provisional values; source bottom-box selection remains transient because no persistent/business semantics were accepted.  
**Concrete checks**: Blank single-row save without C/date/specs; relogin restores all fields and stable IDs; two-row copy/remove retains P1 and distinct P3; duplicate IDs/foreign/tombstone reuse/final-row violation rejected; stale writes lose no winning data; controlled dependent-history failure rolls back aggregate/pieces/receipt. P02's database enum has only DRAFT: test rejection of client-selected status now, while real persisted non-DRAFT/submit-versus-save race execution is N/A until P03 adds those states. Retain the exact DRAFT write predicate; do not fake a future state or weaken schema to claim that test passed. Owners: contract/pure draft rule/integration/HTTP/form and browser tests.  
**Design status**: PASS.

### OP-06 — Observe retained command results and reconcile uncertainty

**Requirements**: FR-020–022/025–026; US2.4/US3.4/US6.1; SC-006.  
**Interfaces**: Proposed `SalesCommandsService(database: DatabaseClient).get(actorId,commandId): Promise<SalesCommandData>` and `SalesCommandExecutor` correlated customer/draft overloads in contracts §6; no arbitrary generic callback result cast. The command execution request/result types are declared in the named feature type owner. Contract §5 and data-model §3 define actor/operation/target/version/hash binding, safe retry and exact conflict handling.

**Ordered algorithm**:

1. Every new explicit intent gets one UUID and frozen normalized variables. Double click, existing transport refresh replay and uncertainty retry reuse them; changed intent gets a new key only after the prior outcome is resolved. Serialize that command before domain writes by the concrete transaction algorithm in data-model §3. Do not persist commands in browser storage or log their payloads.
2. A receipt GET establishes current authority, same command actor and current resource scope. Unknown/other-actor/out-of-scope commands share the documented missing result. Existing receipt reconstructs only its matching validated immutable after-image and committed metadata.
3. After write confirmation or found receipt, invalidate the exact operational feature scope and fetch current affected records with the specified throwing synchronization path. If access changes, suppress publication and follow current session policy. Do not announce complete success when synchronization was skipped/failed.
4. A missing receipt is not proof that an in-flight original request rolled back. Retry the original unchanged intent safely under server command uniqueness; no automatic new-key write. A known committed result with failed reads enters the typed saved-refresh-incomplete state and offers read-only retry.
5. Retain losing local form input until explicit reload/review; do not apply older saved after-images over a newer current version or change another active form/account on late settlement.

**Concrete checks**: Commit then abort response delivery; observation returns one receipt; safe same-intent replay adds no event. Changed body under key conflicts. Simultaneous receipt-missing observation and original commit still yield one effect. Failed/skipped post-commit synchronization rejects as the typed confirmation-with-sync-error state, never retries create; old epoch result/error changes no new-account state. Owners: command integration, shared command state/hooks and real backend browser lost-response scenario.  
**Design status**: PASS.

### OP-07 — Customer forms and inline create/select without implicit draft writes

**Requirements**: FR-002–009/025–027; US1/US2, SC-001/005/006/008.  
**File/symbol ledger**: Frontend F01/F04 own exact existing `SalesCustomersView`, `SalesCustomerNewView`, `SalesCustomerEditView`, `SalesCustomerDetailView`, `AdminCustomersView`, `AdminCustomerDetailView`, `InlineCustomerModal`, `SalesCustomerSection` callers and proposed customer form/API/read interfaces; F02/F03 own scope and shared command lifecycle. Wire shape remains contracts §3–5.

**Ordered interaction**:

1. Load exact requested saved record or show loading/error/missing; mount/edit defaults once. Name/phone/email search lists explicit matching options, not automatic first-record identity.
2. Shared form rules preserve requiredness and optional clears. Submit captures one current operational scope and frozen command. Pending prevents conflicting/duplicate submits; failed validation/duplicate/conflict/unknown keeps input and previous selection.
3. A successful standalone save reconciles current C and navigates to its current phone URL. Inline confirmation selects only the returned stable C in the originating still-current paper instance; no paper write is sent.
4. Unsent cancel closes dialog without mutations and retains paper selection/input. Pending cannot be portrayed as rolled back. Late committed results settle shared state only within their valid scope; they do not select into another form. Existing duplicate requires explicit choose-existing action.

**Failure/caches/focus**: Exact keys/options/error mapping/reset/refetch/late-result policies in frontend design apply; no duplicate notification owner. Preserve field labels/focus/Arabic feedback and existing narrow/wide design.  
**Concrete checks**: Inline saved C differs from typed display/normalization and correct C is selected; next paper save links it. Cancel sends zero customer/draft writes. Duplicate email permits distinct phones. Conflict preserves edits; background refresh/old-account response does not replace them. Owners: customer adapter/model/hooks/reached screen tests and browser.  
**Design status**: PASS.

### OP-08 — Paper editor, scoped read consumers and unavailable P03 behavior

**Requirements**: FR-010–018/023–027; US3–US6, SC-002–008.  
**File/symbol ledger**: Frontend F01/F05 identify existing `SalesCreateOrderView`, `OrderPaperForm`, `Cell`, `PaperFinance`, `PaperSizeTable`, `SideTable`, searchable select/menu, metadata and proposed draft form interfaces; F06 fixes order/detail/dashboard/activity bindings, F02/F03 the read/command/scope protocol, and F07/F08 visible errors/verification. Read contracts and immutable command results are separate types.

**Ordered interaction**:

1. Resolve the actual edit ID or phone-prefill alias under the current account before mounting an editable capture. A missing/denied requested draft never becomes a new blank draft. New form has known type and one blank UUID row, empty real dates/signature/notes rather than demo facts.
2. Existing searchable controls receive explicitly empty P02 suggestion collections rather than sample catalog arrays; retain their existing custom-text selection behavior for provisional capture. Keep M1/M2/M3/face/final additions as text and distinct floor `soleAddition`. P03 later owns authoritative membership.
3. Drive one RHF capture/pieces owner. Manual row edits/copy/remove are unsaved local changes. Map supported nested server fields by frozen piece identity to current indices; a structural mismatch stays general rather than highlighting a different piece.
4. Save calls OP-05/06. Lock editable fields and row actions while the intent is pending/reconciling, preventing overlapping edits; retain existing input on rejection/uncertainty. Successful synchronization resets only the matching form/target/scope and base version. Background reads never silently reset an ordinary dirty editor. Conflict retains input and requires explicit reload/review; account/resource switch retires prior callbacks/data publication.
5. Add an explicit P02 draft mode at the existing shared paper boundary that propagates unpriced state to cells/finance, omits fabricated dates/signatures/notes and prevents demo/zero totals. Retain existing non-P02/default callers until their owning phases. No broad shared paper rewrite.
6. Existing submit triggers display readiness and issue no local workflow/save-as-submitted action. Non-P02 lists/history/metrics in reached P02 sales/customer consumers show explicit later-phase readiness; no fixture values, prices, employee names or business numbers are relabelled as real.

**Query/state algorithm**: The sole key root is `['customer-drafts',actorId,accessVersion,epoch]`; the nonsecret transport epoch also guards dispatch, settlement and structural cache publication. Distinct epoch roots prevent old cleanup from deleting a same-account new-session subtree. Exact children/options/cancellation/invalidation/current-read/version rules are fixed in frontend F02/F03. Reuse the existing QueryClient/session and exported scope checks; the shared helper is not another authority store.  
**Concrete checks**: Blank save/relogin/reopen; all separate fields retained; current custom select and portal keyboard behavior survive empty suggestions; no price zero/fixed date/signature in P02; submission sends no transition; dirty refresh preserves input, pending editing is disabled, and failed saves retain the frozen input; B never receives A cached draft/measurements. Extend existing paper regressions including unchanged non-P02 print family, plus dedicated P02 draft state and reached-screen tests. Real browser covers narrow/wide/RTL/focus.  
**Design status**: PASS.

### OP-09 — Introduce persistence safely and keep test isolation intact

**Requirements**: FR-004–006/010–022; VR-002/005; prerequisite/release exclusions.  
**Owners**: Existing Prisma schema/client/migration inventory, proposed one P02 migration and fixed test cleanup changes named in data-model §5. No prior migration or generated client is authored/replaced by PLAN.

**Ordered change design**:

1. Add the P02 model/constraint/index graph from data-model §1–2 through a new forward migration. New domain tables start empty. Keep existing identity/approval rows, decision history, checks and all existing SQL/checksums; no browser import/default customer/demo actor backfill.
2. Review generated draft SQL against the design before applying it to an explicitly owned disposable target. Record fresh migration and representative populated-P01 upgrade evidence separately from any preserved/deployed target. No reset/schema-push substitute.
3. Extend `resetOwnedIdentityTestData` and database seed test's private `resetOwnedDatabase` to their exact fixed expanded owned table graph. Retain `NODE_ENV=test`, nonempty marker, exact URL/URI/database-name checks, fixed SQL identifiers and no `CASCADE`; foreign reference must still stop cleanup.
4. Intentionally extend exact schema/enum/migration-inventory assertions and rollback/concurrency test data. Cleanup only suite-owned records/resources. Existing P01 failures due new FKs are addressed by this graph change, not by dropping safeguards.
5. Compatibility/recovery is additive schema-first/backend then consumers, with P03 absent. Roll back application changes without erasing retained business data; a populated deployed target needs reviewed forward repair/restoration under separate environment authorization. This plan executes none of those actions.

**Concrete checks**: Fresh migrate and second deploy succeed; populated P01 records/checksums unchanged; unique phone, pieces/positions, command identity, history immutability and links enforced; controlled failure rolls back complete state. Owned graph cleanup succeeds only with all guards; wrong target/marker and foreign referencing table prevent destructive work. Owners: schema-contract/migration/seed/reset support integration and domain integration.  
**Design status**: PASS.

## Backend and Frontend Delivery Groups

1. **Backend producers**: shared schemas/phone and capture validation; additive models/migration/constraints; P02 command executor/history; current authority/owner-scoped services/queries/mappers; routes/controllers/composition/OpenAPI; expanded guarded isolated fixture cleanup. Pure rules and real boundary tests are included with their behavior.
2. **Backend acceptance gate**: all required contracts/data/current-authority/command/HTTP behavior passes meaningful real migrated database/concurrency/rollback/HTTP tests and separate requirements/engineering review. Synthetic fixtures prove isolated behavior, not client catalog activation or deployment. No dependent UI wiring before this entire gate.
3. **Frontend consumers**: the exact inventoried APIs/read hooks/shared command hook/form/scope/retained components and paper compatibility after producer acceptance. No second server-state store or wholesale provider removal.
4. **Integrated acceptance**: actual two-sales-session/ADMIN journeys, safe direct denial, reload/relogin, stale/unknown outcomes, RTL/keyboard/focus/narrow/wide and existing auth/paper regressions. Whole P02 still requires these tests; PLAN does not mark the phase complete.

No provider/queue/upload/object storage/payment/email delivery is needed for P02 operations. Existing test mail capture is reused solely to provision isolated sales accounts through real P01 flows.

## Verification and Review Plan

### Test owner and case matrix

All paths marked CREATE are proposed discovered tests, not existing output. Extend existing owners where they already test the boundary; avoid one test per trivial wrapper or a second test of the same effect.

| Requirement/risk                             | Exact planned owner                                                                                                                                                                                                                                              | Required observable evidence                                                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer inputs/phone/optional/strict output | CREATE `packages/contracts/src/customers/customers.schema.test.ts`                                                                                                                                                                                               | National/international/both digit sets/format variants; mobile/fixed; foreign/malformed rejection; email reuse and omission/clear; bounded query and safe DTO.                                                                                    |
| Incomplete capture/piece/date/paid/authority | CREATE `packages/contracts/src/sales-drafts/sales-drafts.schema.test.ts`                                                                                                                                                                                         | All seven types; one blank row; distinct captured strings; quantity/UUID uniqueness/bounds; real date/decimal; rejected price/actor/workflow.                                                                                                     |
| Receipt operation/resource bindings          | CREATE `packages/contracts/src/sales-commands/sales-commands.schema.test.ts`                                                                                                                                                                                     | Safe discriminated saved after-images and metadata; malformed/missing/wrong kind/private field rejection; no tautological export assertions.                                                                                                      |
| Shared pagination/date/parser compatibility  | EXTEND `packages/contracts/src/http/http.schema.test.ts`, `apps/api/src/core/date-only.test.ts`, `apps/api/src/middlewares/error-handler.middleware.test.ts`                                                                                                     | Browser-safe canonical page/limit defaults/bounds/no-clamp;0001/0099/0100/leap/0000 dates; known parser400/413 safe no-body/no-stack/log behavior and unchanged existing errors. Actual raw request proof remains in HTTP integration.            |
| Shared customer persistence and scope        | CREATE `apps/api/src/modules/customers/customers.service.integration.test.ts`                                                                                                                                                                                    | Phone races/email reuse/stable links/CAS/actor/time/scoped joined counts and measurements, final stored state.                                                                                                                                    |
| Draft aggregate/piece/owner behavior         | CREATE `apps/api/src/modules/sales-drafts/sales-drafts.service.integration.test.ts`; meaningful pure rules in `sales-drafts.rules.test.ts`                                                                                                                       | Blank and full capture round-trip; piece retain/copy/tombstone/reorder; foreign/missing/live authority; rejected client status, stale/version/bounds and final aggregate state. Persisted non-DRAFT race execution is N/A before P03 supplies it. |
| Atomic receipt/replay/rollback               | CREATE `apps/api/src/modules/sales-commands/sales-command-executor.integration.test.ts`                                                                                                                                                                          | One same-intent concurrent effect/event; changed binding conflict; unknown observation; dependent audit failure rolls back every domain/version/piece/receipt write.                                                                              |
| Actual middleware/HTTP/OpenAPI               | CREATE `apps/api/src/modules/sales-drafts/sales-drafts.http.integration.test.ts`; EXTEND `apps/api/src/infrastructure/openapi/openapi.test.ts`                                                                                                                   | Real `createApp`, credentials/department/CSRF/strict schemas/status/envelope/field paths, private missing denial, scoped pages/counts and reconciliation; exact OpenAPI agreement.                                                                |
| Migration/inventory/isolation                | EXTEND `packages/database/tests/schema-contract.test.ts`, `tests/integration/migration.integration.test.ts`, `tests/integration/seed.integration.test.ts`; `apps/api/src/test-support/reset-test-data.test.ts` and `.integration.test.ts`                        | Fresh/populated upgrade; prior data/checksums/invariants retained; exact new inventory; fixed cleanup graph/all guards/noCASCADE/foreign reference stops cleanup.                                                                                 |
| Frontend adapters/read scopes/forms          | CREATE `apps/web/src/features/customers/api/customers.api.test.ts`, `hooks/customers.hooks.test.tsx`, `model/customer-form.model.test.ts`; `apps/web/src/features/sales/api/drafts.api.test.ts`, `hooks/drafts.hooks.test.tsx`, `model/draft-form.model.test.ts` | Transport-boundary doubles plus real parser/QueryClient/form behavior; no empty/fixture fallback; inline actual record, nested errors, dirty data, stable pieces, scoped keys/current data.                                                       |
| Shared command/identity protocol             | CREATE `apps/web/src/features/sales/hooks/sales-commands.hooks.test.tsx`, `model/sales-command-state.test.ts`, `apps/web/src/shared/query/operational-scope.test.ts`                                                                                             | Frozen variables, replay/reconcile, saved-sync-error, no extra create, epoch/access-version mismatch, errored session and stale settlement/publication.                                                                                           |
| Reached screens/paper                        | CREATE/EXTEND exact `.test.tsx` owners inventoried in frontend design, including proposed `draft-paper-state.test.tsx`                                                                                                                                           | Customer missing/selection/counts, local manual rows, unavailable finance/submit, no demo facts, preserved custom search/text and non-P02 paper/print callers.                                                                                    |
| Cross-layer browser                          | CREATE `apps/web/e2e/customer-drafts.spec.ts`; reuse existing runtime/config                                                                                                                                                                                     | Real P01 register→verify→approve SALES for A/B, ADMIN access, shared customer/private drafts, incomplete reopen, phone update, inline cancel/link, stale two-context edit, lost reply and unavailable submission on both profiles.                |

### Infrastructure, controlled failures and cleanup

- Existing API/database integration setups each own a `postgres:18.4` container, clear inherited database variables, apply real migrations and publish `P01_TEST_DATABASE_URL` only afterward. Invoke through pnpm for `npm_execpath`. Missing Docker/image access leaves real persistence evidence unperformed; never substitute a developer database/SQLite.
- API integration runs serial files in one fork with `isolate:false`. Race tests still need independent clients/connections and controlled interleaving. Reuse the current account-authority test pattern of deferred release plus bounded polling of `pg_stat_activity`/`pg_blocking_pids`; arbitrary sleeps or sequential calls do not prove races.
- Rollback evidence may add a narrowly named failing test-only trigger/constraint for one synthetic command's retained evidence write in the owned database, then remove it in `finally`. Inspect every affected table/version after failure. No production failpoint or mocked transaction proves this boundary.
- Existing browser runtime supplies ADMIN and suspended legacy fixtures, not ready sales A/B. Register/verify/approve A/B through real P01 surfaces/captured synthetic mail. Local helpers in `staff-identity.spec.ts` are not exported; extract a deliberate reusable test helper only if useful. Observe actual context auth/CSRF for direct HTTP denial without printing credentials. Keep trace/video/screenshots off as configured.
- A real lost-reply browser case may let the request complete via `route.fetch()` against the owned real backend and abort only browser delivery, then observe the actual command receipt. Main journeys must not use intercepted fake success.
- Per-suite fresh QueryClients, owned synthetic rows/trigger names, `finally` cleanup and bounded waits are mandatory. Existing isolation/cleanup guards are preserved; no runner suppression, weakened assertions or leaked processes/containers.

### Planned commands and order

These are manifest/source-verified future execution commands, not commands run during PLAN. Producer builds generate files and require an inspected worktree/selected owned environment. Target test files must exist under the documented runner discovery before execution.

```sh
pnpm --filter @template/contracts build
pnpm --filter @template/database build
pnpm --filter @template/contracts test src/customers/customers.schema.test.ts src/sales-drafts/sales-drafts.schema.test.ts src/sales-commands/sales-commands.schema.test.ts src/http/http.schema.test.ts
pnpm --filter @template/database test tests/schema-contract.test.ts
pnpm --filter @template/database test:integration tests/integration/migration.integration.test.ts tests/integration/seed.integration.test.ts
pnpm --filter @template/api test src/test-support/reset-test-data.test.ts src/modules/sales-drafts/sales-drafts.rules.test.ts src/infrastructure/openapi/openapi.test.ts src/core/date-only.test.ts src/middlewares/error-handler.middleware.test.ts
pnpm --filter @template/api test:integration src/modules/customers/customers.service.integration.test.ts src/modules/sales-drafts/sales-drafts.service.integration.test.ts src/modules/sales-commands/sales-command-executor.integration.test.ts src/modules/sales-drafts/sales-drafts.http.integration.test.ts src/test-support/reset-test-data.integration.test.ts
```

After the entire backend group and its review pass, run focused web owners from the matrix (package-relative filenames) plus affected shared auth/transport/form/paper regressions. Then check/run the owned browser harness:

```sh
pnpm --filter @template/web check:e2e-types
pnpm --filter @template/api check:e2e-types
pnpm --filter @template/web test:e2e e2e/customer-drafts.spec.ts
```

At P02 implementation exit, full applicable suites and existing/new browser journeys are required:

```sh
pnpm format:check
pnpm lint
pnpm check-types
pnpm test
pnpm test:integration
pnpm build
pnpm verify:build-output
pnpm --filter @template/web test:e2e
git diff --check
```

`database build` generates Prisma; web `check-types` runs `next typegen`. Root `pnpm verify` first formats/validates/generates Prisma and builds dependencies. None is a read-only planning check and none ran here. Chromium installation is a prerequisite only if absent, not a feature test. Browser/DB suites require their owned infrastructure; no release/runtime/mail/backup claim follows from a local green result.

### Review coverage and producing-stage handoff

Apply the same guide sections used in the design: code-style (interfaces/strict types/reuse/efficiency), backend (composition/service/queries), contracts (strict raw/output/HTTP/errors/lists), data (invariants/locks/migrations), security (authority/privacy/secrets), frontend (existing surfaces/state/forms/cache/framework), testing (real boundary/isolation) and code-review (separate verdicts). Use `docs-guard` on these design artifacts; production/test/React guards become applicable when those later files are authored. Do not install optional tools to claim a review.

TASKS must create backend-first bounded briefs referencing each OP, exact contract/data/frontend headings, existing/proposed symbols and named tests. Each brief must fix allowed file actions, dependencies, read-before-edit context, ordered steps, invariants/failure states and done evidence. PLAN does not create that task list or pretend later briefs/execution already pass. ANALYZE later reviews all generated briefs read-only before implementation.

## Decisions and Complexity Tracking

| Decision                                                   | Reason                                                                                                  | Simpler alternative and impact                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Whole draft aggregate save                                 | Matches current manual paper save and makes fields/pieces/version/audit atomic.                         | Separate row endpoints add partial-save UX and consistency without accepted need.                                            |
| Customer/draft-specific retained command executor          | Four real operations share lost-response replay, authority and atomic change evidence.                  | UI-only double-click blocking or browser IDs cannot protect transport/retry races; a general event/job engine exceeds scope. |
| Version/CAS plus P01 actor locks                           | Protects both stale data and concurrent eligibility changes using current foundation.                   | Pre-read permissions and unchecked updates allow races.                                                                      |
| Immutable command after-image plus current refetch         | Distinguishes accepted effect from present resource; preserves later revisions.                         | Returning current data as an original receipt conflates replay and later changes.                                            |
| Retained removed draft pieces                              | Preserves stable identity and traceable removal; excludes submitted cancellation.                       | Physical deletion/reuse risks history loss and foreign-ID ambiguity.                                                         |
| Scope guard shared only by actual operational hooks        | Customer/draft reads and writes share identity/access-version/epoch publication meaning.                | Copying private staff logic or introducing another auth store creates competing state.                                       |
| Explicit P02 paper mode/empty suggestions                  | Keeps existing layout/custom capture while removing demo authority.                                     | Rebuild paper or activate sample catalog/prices violates accepted boundaries.                                                |
| Additional research/quickstart/provider subsystems omitted | Their necessary facts fit existing design/verification owners; P02 needs no new external effects/setup. | Empty artifacts or speculative platforms add no handoff value.                                                               |

## Design Readiness and Exit

| Operation                                      | Design/source/verification owner                                       | Readiness |
| ---------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| OP-01 boundary                                 | Contracts §2–6; current middleware/parser; contract/HTTP/adapter cases | PASS      |
| OP-02 customer reads                           | Contracts §4/6; data-model §4; frontend customer queries               | PASS      |
| OP-03 customer writes                          | Contracts §5/6; data-model §3; shared command state                    | PASS      |
| OP-04 private draft/measurement/activity reads | Contracts §3–6; data-model §4; reached consumer mappings               | PASS      |
| OP-05 aggregate/piece writes                   | Contracts capture schema; data-model §1–3; paper form state            | PASS      |
| OP-06 receipts/uncertainty                     | Command union/binding/after-image; current read/sync/epoch algorithm   | PASS      |
| OP-07 customer forms/inline                    | Frontend exact caller/adapter/query/form ledger and user-visible cases | PASS      |
| OP-08 paper/read-consumer compatibility        | Frontend paper/state/source inventory and installed Next guidance      | PASS      |
| OP-09 migration/isolation                      | Data-model §5/6; exact owned cleanup graphs and real migration tests   | PASS      |

**Requirements design: PASS.** Independent final review confirmed FR-001–027 / SC-001–008 coverage, preserved product decisions and P02 boundaries. **Engineering design: PASS.** The filled source/interface/contract/data/UI/verification owners agree. These are producing-stage design verdicts only.

### Actual PLAN verification evidence — 2026-11-05

- Reused the matching P02 specification/selection and ran `setup-plan.sh --json` only after confirming no existing technical plan. Its BRANCH value was treated as feature context; the verified Git branch is `main`.
- Applied `docs-guard` against current source, manifest commands, existing versus proposed interfaces and references. Independent requirements/engineering design review found no remaining material finding after corrections to command serialization/timestamps, epoch isolation, typed entry/model boundaries, receipt/current-data distinction and verification limits.
- Fresh `pnpm exec prettier --check` over the four new design owners passed after formatting only those four files. Local-link, table-shape, placeholder and contiguous OP-01–09 checks passed. `git diff --check` passed.
- SHA-256 checks confirmed existing P02 spec/checklist, root roadmap and active pointer are byte-for-byte unchanged. Git confirmed no tracked source/config/migration change, no staged change and the expected six untracked feature files (two pre-existing requirements artifacts plus four new design owners).
- No extension hooks file exists. No `tasks.md`, separate research/quickstart, application tests/builds, database action, browser journey, catalog activation or release action was performed. The separate-artifact N/A decisions remain as documented above.

**Pending outputs/evidence**: TASKS briefs and all implementation/backend/frontend/browser/release evidence remain unperformed. NUM-01/P03 and OPS-01 retain their recorded later gates and do not block this P02 design. No material product question is delegated to the implementer. Stop after PLAN; no automatic TASKS/CHECKLIST/IMPLEMENT or phase advance.

### OP-04A — Customer-linked draft cards, owner-authorized Group 3 amendment

**Authorization/current source**: On 2026-11-05 the owner selected preserving the existing customer page/cards and supplying their captured piece information in one paginated backend response, then completing remaining Group 3 work. This scoped PLAN/TASKS/IMPLEMENT sequence supersedes the earlier T029 loading gap and its suggested user-opened-detail alternative. Existing completed IDs, root roadmap, checklists, P03/NUM-01/OPS-01 boundaries and prior evidence remain intact. Current backend already persists the captures; no migration or new write is required.

**Contract/owners**: Contracts §7 and frontend F10 below are normative. Add GET `/customers/:customerId/drafts` to CustomersService/controller/routes and OpenAPI. Reuse current authentication → SALES-or-ADMIN → params/query validation; service current-authority RepeatableRead read helper. Proposed `findCustomerDraftPage(tx,actor,customerId,query)` in customers.queries owns a parent page and batched nested piece selection. Shared symbols live in sales-drafts.schema.ts to reuse its summary/piece/header schemas without a customer↔draft schema import cycle. Existing generic list/detail/measurement contracts are unchanged.

**Ordered algorithm**: (1) Validate stable customer UUID and strict page/limit only, default25/max25. (2) In the existing authorized read transaction confirm customer existence (404 CUSTOMER_NOT_FOUND), derive SALES ownerId or ADMIN broad scope. (3) Count and page drafts for exactly this customer, ordered updatedAt DESC/id DESC. Select summary fields, generalNotes and active pieces only (position ASC, id tie-breaker); nested take200 matches the existing invariant. Map only ID/position/quantity/model/size/leatherBase per piece. (4) Return cards plus canonical pagination. No per-card service/HTTP query, audit write, mutation, manufacture or pricing projection. A shared contact with no accessible drafts returns an empty successful page, never another owner's work.

**Delivery/verification**: T043 implements/reviews/tests the additive backend and real PostgreSQL/HTTP proof before T044 adapter/hook and T029 consumers. T036/T037 follow. Prove two owners on shared C, ADMIN broader results, another customer's exclusion, blank/non-measurement pieces, removed pieces, notes, page boundaries/max limit, safe projection/denial/missing. Existing migration history is preserved. Planning REQUIREMENTS/ENGINEERING PASS: fixed interfaces/authority/bounds/read algorithm/cache/UI and test owners are filled; this is design readiness only. Implementation acceptance remains its own gate. No research/dependency/schema migration is needed for this ordinary existing Prisma read.
