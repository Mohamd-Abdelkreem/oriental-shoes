# P08 Operations, Full Regression and Release Evidence Design

**Scope**: FR-025–031, VR-007–010 and SC-006–008 of [the accepted specification](spec.md), with production-safe configuration supporting FR-021/029. This is a PLAN artifact: source inspection and designed verification only. No build, application test, migration, provisioning, backup, restore, mail or deployment command has run here.

**Readiness distinction**: The independent designs and the concrete O13 deployment design are complete. In the delegated-choice amendment, the owner authorized the recommended topology and operational preferences recorded below. OPS-01 is now a **runtime admission gate** for actual host/domain/mail/account/storage facts, private configuration and action/environment authorization; it is not an unresolved architecture choice. No target is configured or executed by this document. A test calendar, local green suite or provider message ID does not close operational admission or release acceptance.

## Source and Ownership Ledger

| Existing owner                                                                          | Verified interface / behavior to reuse                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                          | Node `>=24 <25`, pnpm `11.17.0`; `build`, `format:check`, `lint`, `check-types`, `test`, `test:integration`, `verify:build-output`, database forwarding scripts. `verify` writes/formats/generates before checks.                                                                                                                                        |
| `apps/api/package.json`                                                                 | Compiled `start` is `node --enable-source-maps dist/server.js`; `admin:provision` is `node dist/scripts/provision-initial-admin.js`; separate harness `check:e2e-types`.                                                                                                                                                                                 |
| `apps/web/package.json`, `apps/web/scripts/next.mjs`                                    | Compiled `start` uses the existing Next launcher; it loads package `.env.local` if present. Build uses webpack; `test:e2e` is the existing Playwright runner.                                                                                                                                                                                            |
| `compose.yaml`                                                                          | PostgreSQL `18.4` only, persisted `postgres_data`, configured host port and `pg_isready`. No API/web/edge service exists in this file.                                                                                                                                                                                                                   |
| `Caddyfile`                                                                             | Existing one-origin template routes `/api/*` to `api:4000`, other paths to `web:3000`, with compression. Those service names require separately deployed services; this is not a complete stack.                                                                                                                                                         |
| `apps/api/src/server.ts`                                                                | Creates one database/app, connects before listen, fails on startup/port conflict, sets request/header/keepalive timeouts and owns graceful SIGINT/SIGTERM shutdown.                                                                                                                                                                                      |
| `apps/api/src/modules/health/health.service.ts`                                         | `new HealthService(database)`, `getLiveness(): HealthResult`, `checkHealth(): Promise<HealthResult>`; readiness performs `SELECT 1`, never a mail or migration certification.                                                                                                                                                                            |
| `apps/api/src/modules/health/health.controller.ts`, `health.routes.ts`, `router.ts`     | Existing `GET /api/v1/health/live` returns 200 without checking DB; `GET /api/v1/health/ready` returns the established success envelope with 200/503 according to DB availability. Preserve these paths/shapes.                                                                                                                                          |
| `apps/api/src/core/config/{app,email,cookie,cors,auth-secrets,order,env}.ts`            | Typed configuration, four independent production auth secrets, HTTPS web URL, production console-mail refusal, exact origins/current proxy setting, secure cookies, explicit business timezone. Nonproduction API may load root `.env`; production must receive environment explicitly.                                                                  |
| `apps/api/src/infrastructure/email/email-delivery.ts`, `email.service.ts`               | `EmailDelivery.send(EmailSendRequest): Promise<EmailSendResult>`; existing console/Resend/SMTP adapters and bounded provider retries. `EmailService.sendVerificationEmail(name,email,token)` and `sendPasswordResetEmail(name,email,token)` build existing one-time action URLs. A returned result/message ID is provider acceptance, not inbox receipt. |
| `apps/api/src/scripts/provision-initial-admin.ts`, `initial-administrator.arguments.ts` | `runInitialAdministratorProvisioning(): Promise<number>`; parser accepts only the existing exact flags, defaults to preview and resolves DB after argument validation. `InitialAdministratorService.preview(input)`/`apply(input)` preserve restricted singleton eligibility.                                                                            |
| `packages/database/src/seed-config.ts`                                                  | `parseSeedGroup(group, environment, nodeEnv)` refuses configured production seeding; optional local seed is create-only, never production bootstrap.                                                                                                                                                                                                     |
| `apps/api/src/infrastructure/logger/{logger,request-sanitizer}.ts`                      | Existing `createLogger`, named redaction paths and `sanitizeRequestForLog`/`sanitizeRequestUrl`; preserve request IDs and token-query redaction. No credentials/action links in normal evidence.                                                                                                                                                         |
| `packages/database/prisma.config.ts`                                                    | Datasource URL and migration history owner; it loads root `.env` independently of API runtime configuration. Explicit process `DATABASE_URL` must bind every isolated/target CLI invocation.                                                                                                                                                             |
| `packages/database/tests/integration/migration.integration.test.ts`                     | Existing real fresh/legacy upgrade and preserved-history assertions; extend intentional schema inventory, never delete assertions or edit old migration SQL.                                                                                                                                                                                             |
| API/database integration setup files                                                    | Each runner owns disposable `postgres:18.4`, applies real migrations and replaces its own database environment. Serial files do not prove races.                                                                                                                                                                                                         |
| `apps/web/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/runtime.ts`                | Existing two Chromium projects, one worker, zero retries, trace/video/screenshots off. Harness owns isolated DB/API/compiled Next and private runtime/mailbox, explicit `UTC` test calendar; `readE2eRuntime()` and `waitForCapturedAction(recipient,kind)` are existing private test coordination.                                                      |

The existing health and runtime contracts remain intact. O13 adds a small deployment-specific CLI and Compose definition; it does not add a queue, public diagnostics endpoint or production fixture endpoint.

## O09 — Production Configuration, Health and Mail

**Requirements**: FR-021, FR-028–029; VR-009–010. **Design status**: PASS for independent configuration/test design; actual target values and external checks BLOCKED by OPS-01.

### Allowed file actions and interfaces

- Modify `apps/api/src/core/config/email.config.ts` only for the narrow insecure-production-SMTP gap below; retain all existing exports, parsing, provider selection, timeout bounds and failure messages.
- Add exported pure `assertProductionSmtpSecurity(input: Readonly<{ isProduction: boolean; provider: EmailProvider; allowSelfSignedTls: boolean; tlsMinVersion: SmtpTlsMinVersion }>): void` to that existing owner. It is **proposed**, not present now. Read and parse both SMTP settings once, validate before constructing `emailConfig`, then use the same validated values in the frozen object.
- Modify `apps/api/src/core/config/mailer.config.ts` without changing the existing `getSmtpTransporter(): SmtpTransporter` export or single cached-transporter owner. Add `requireTLS: appConfig.isProduction && !emailConfig.smtpSecure` to Nodemailer's existing options; production port 587-style sessions must negotiate STARTTLS before credentials/message data, while an already-secure SMTP socket remains implicit TLS. Do not enable `ignoreTLS` or `opportunisticTLS`. Import the existing `appConfig` owner rather than reading environment in this adapter.
- Create discovered `apps/api/src/core/config/email.config.test.ts` for the pure security function/production-validation regressions and `apps/api/src/core/config/mailer.config.test.ts` for transport-option and controlled STARTTLS-refusal coverage. Reuse existing `auth-secrets.test.ts`, `email-delivery.test.ts`, logger/request-sanitizer tests and `app.integration.test.ts`.
- Reuse health service/controller/routes without a new health contract or mail probe. Extend `apps/api/src/app.integration.test.ts` with actual health envelope/status cases if the current file lacks them.
- Modify `.env.example` comments and the proposed `docs/operations/release-runbook.md` to describe actual accepted production topology and required settings without committing secret values. Update `README.md` and `PROJECT_REFERENCE.md` only after implemented behavior exists.

### Ordered decisions

1. Existing configuration checks continue to reject missing/repeated/placeholder production auth secrets, unsupported provider/URL/config values, console mail in production and non-HTTPS public web URL. Do not widen cookies/CORS to make a test pass.
2. `assertProductionSmtpSecurity` returns without effect outside production or when provider is not SMTP. For production SMTP, reject `allowSelfSignedTls=true` with fixed message `SMTP_ALLOW_SELF_SIGNED_TLS is not allowed in production.` and reject `tlsMinVersion=TLSv1` with `SMTP_TLS_MIN_VERSION must be TLSv1.2 or TLSv1.3 in production.` Existing valid SMTP settings and Resend behavior remain unchanged. This closes an observed source allowance rather than inventing another provider.
   The existing SMTP transport also lacks forced STARTTLS: installed Nodemailer source falls back to HELO unless `requireTLS` is set. The proposed option above forces the secure upgrade in production before authentication/message transmission; a controlled refusing server must fail the send rather than accepting plaintext. This is independent of certificate validation and minimum protocol version.
3. Bind the actual target web origin to `WEB_APP_URL`, exact `CORS_ORIGINS` and build-time `NEXT_PUBLIC_API_URL`; the latter is public. O13 selects one direct Caddy hop, no intervening CDN/proxy and no published API port, so its target configuration requires `TRUST_PROXY=1`. `AUTH_COOKIE_SAME_SITE=lax`, HTTPS and the current same-origin CSRF design remain. Another proxy topology is a design change, not an operator override.
4. Production API receives validated environment from the selected supervisor/platform; production web receives the corresponding public API origin at build and runtime. Do not let an accidental developer `.env.local` travel with the release or override target settings through the Next launcher. Preserve the existing Node/pnpm/locked workspace; no automatic version upgrade.
5. Start only after reviewed migration status and configuration admission. `server.ts` must connect to DB before listening. After startup, call live and ready separately: live proves process response; ready proves current DB reachability only. A failed DB/readiness request leaves deployment admission incomplete, even if liveness remains 200.
6. Execute verification and recovery mail through existing user flows for a dedicated operator-controlled acceptance identity, with explicit target/mail authorization. Observe actual inbox arrival, correct HTTPS origin/path, valid one-time action and successful consumption; attempt reuse is rejected. Record mailbox confirmation and action outcome without copying token URLs, bodies or credentials into evidence. Captured local mail proves the isolated flow only.
7. For unavailable provider, exercise the existing isolated adapter failure behavior and truthful UI/retry path. Preserve neutral recovery behavior and existing provider retry policy; no unaccepted durable-mail guarantee or new queue is inferred. Do not claim DB-ready means mail-ready.
8. Inspect sanitized target logs for request correlation, startup/failed-operation classification and absence of passwords, bearer/cookie/CSRF/provider/database credentials and verification/reset query tokens. Record only classification and request ID; do not publish raw payload/log dumps. A redaction test or source read does not certify every future log.

### Concrete verification

| Case                                                                 | Boundary and expected outcome                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production SMTP plus self-signed override or TLSv1                   | Pure config function throws the fixed safe message; valid TLSv1.2/1.3 succeeds. Non-SMTP or nonproduction preserves prior capability.                                                                                                                                                                                                                                      |
| Production SMTP with `smtpSecure=false` and server refusing STARTTLS | Existing transporter options require TLS. A loopback-only controlled SMTP server refuses the upgrade; actual Nodemailer send rejects before the server observes AUTH or MAIL FROM. Use existing injectable adapter retry wait to avoid sleeps, close transport/sockets/listener in `finally`, and restore stubbed environment/modules. No real mail provider is contacted. |
| Production implicit TLS versus development SMTP                      | Existing secure socket uses `secure:true`; development's prior local SMTP capability remains. Option assertions alone do not replace the preceding real protocol-refusal case.                                                                                                                                                                                             |
| Invalid production auth/URL/provider setting                         | Existing configuration fails before server admission; no fallback to committed developer values.                                                                                                                                                                                                                                                                           |
| Healthy owned API and DB                                             | Real HTTP live=200 with `database:not_checked`; ready=200 with `database:ok`, documented envelope and request ID.                                                                                                                                                                                                                                                          |
| Owned DB made unreachable after startup                              | Real ready=503/`degraded` and `database:error`; process liveness can remain 200. Restore the owned resource before teardown; never stop a developer container.                                                                                                                                                                                                             |
| SMTP/Resend rejection versus real receipt                            | Controlled failure remains failure; provider acknowledgement is labelled separately from later inbox/action confirmation.                                                                                                                                                                                                                                                  |
| Token-bearing auth URL and named credential fields                   | Existing redaction tests plus affected target log inspection retain safe request correlation and omit secret content.                                                                                                                                                                                                                                                      |

## O10 — Fresh/Populated Migration and Restricted Bootstrap

**Requirements**: FR-027–029, VR-009. **Design status**: PASS for isolated upgrade/bootstrap design; real target migration/provisioning BLOCKED by OPS-01 and explicit environment authorization.

### Owners and fixed sequence

Reuse `packages/database/tests/integration/migration.integration.test.ts`, the P08 forward migration designed in [data-model.md](data-model.md), `apps/api/src/modules/auth/initial-administrator.service.integration.test.ts`, `apps/api/src/scripts/provision-initial-admin.test.ts` and seed tests. Extend existing owners for the actual changed tables/checks. No new bootstrap mechanism is needed.

1. Freeze reviewed source revision, lockfile, migration names and SHA-256 for every pre-P08 SQL file. A history whose application is unknown is preserved, not rewritten.
2. Fresh case: owned empty PostgreSQL 18.4 → actual migration deploy → exact expected tables/constraints/indexes including P08 additions → second deploy/status reports no pending changes. Update intentional inventory assertions while preserving existing constraints.
3. Populated case: create an independently owned pre-P08 target by applying the existing migration prefix through `20261113000100_p07_warehouse_receipt_delivery`; populate representative retained records through existing reviewed fixture/service paths. Mark only that exact prefix as applied where the existing migration-upgrade fixture requires it. Deploy the new forward migration, inspect retained identities/authority/contacts/frozen prices/paid/cancelled pieces/manufacturing/quality/receipt/delivery/command receipts and new defaults/backfill, then deploy again. Never use the user's development database as the populated fixture.
4. Preserve the existing legacy-account upgrade cases that prove email verification does not silently approve/assign a department, as well as create-only seed behavior. P08 admission cannot approve a generic legacy USER because it appears verified.
5. Bootstrap fixture: selected verified, pending, unassigned USER with no existing ADMIN/receipt. Existing preview prints masked address, safe eligibility and identity/version only and writes nothing. Apply changes only the selected account and writes its singleton receipt; no password/profile/verification/department rewrite or fake staff decision. A stale candidate, existing ADMIN/receipt or second successful provisioning is denied with unchanged other accounts.
6. Use existing CLI argument semantics exactly: `--user-id`, `--expected-email`, `--expected-access-version`, `--operator-reference`; default preview. `--apply` writes and production additionally requires `--allow-production`. These flags do not grant environment authorization. Exit codes remain 0 success/preview, 1 unexpected/missing connection, 2 invalid arguments/production acknowledgement, 3 ineligible/stale. A lost outcome is reconciled by account/receipt observation before attempting another write.
7. For actual release, the operator supplies approved nonsecret candidate identity/reference and binds secrets/connection privately. Inspect target migration history/status before any write; complete the target backup checkpoint first. Run the existing compiled package script's preview and review it, then only the authorized apply. No local seed or admin UI action substitutes for this procedure.

### Future commands and their boundary

Commands below are designs for later authorized execution, not commands run during PLAN. The selected process environment must bind the intended isolated or explicitly authorized target; do not place connection URLs/passwords in command text or logs.

```sh
pnpm --filter @template/database exec prisma migrate status
pnpm --filter @template/database db:migrate:deploy
pnpm --filter @template/api admin:provision --user-id <uuid> --expected-email <email> --expected-access-version <version> --operator-reference <reference>
```

The placeholders are deliberate operator-supplied values, not unresolved algorithms or literal executable arguments. Production apply appends both existing write flags only after preview and action/environment authorization. Root `pnpm start` starts local Compose PostgreSQL and applies migrations; it is not the target-neutral deployment command.

## O11 — Backup and Disposable Restore Evidence

**Requirements**: FR-027/030, VR-008–010, SC-007/008. **Design status**: PASS for the bounded logical recovery exercise and O13's selected backup mechanism/policy. Actual mounted storage identity, encryption/access approval, operator and observed restoration remain runtime admission/evidence gates. No RPO/RTO or uptime guarantee is made.

### Interface and file ledger

| Proposed owner                                          | Exact responsibility / interface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/operations-readiness.integration.test.ts` | Discovered integration file; owns two PostgreSQL 18.4 containers and private files for this test only. Local helpers `readRestoreFingerprint(database: DatabaseClient): Promise<RestoreFingerprint>`, `dumpOwnedDatabase(source: StartedPostgreSqlContainer): Promise<void>`, `restoreOwnedArchive(source: StartedPostgreSqlContainer, target: StartedPostgreSqlContainer): Promise<void>`. `DatabaseClient`/`createDatabaseClient` come from existing `@template/database`; `StartedPostgreSqlContainer` comes from existing `@testcontainers/postgresql`. No production export.                                                                                                                                                                             |
| Same test file, `RestoreFingerprint`                    | Test-only readonly structure containing sorted migration `(name,checksum,finished)` facts, application table counts, selected synthetic order/piece/paid/actor/history/command facts, stable catalog source identity and business counter. Compare values privately, never log DB URLs/token/password data. Include all three P08 models/tables from the data-model owner: AdministrationCommand/administration_commands, AdministrationCancelledPiece/administration_cancelled_pieces and AdministrationOrderCorrection/administration_order_corrections. Compare retained scope/selected IDs, before/after versions, reason, actor/time and before/after corrected contacts/general notes as well as parent/child counts, without emitting private content. |
| `docs/operations/release-runbook.md`                    | Proposed owner of real backup/restore admission and verification instructions, secret-free evidence schema and operator binding. It documents provider-specific steps only after OPS-01 supplies them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

No general-purpose backup/restore HTTP endpoint, new production CLI or destructive restore command is added. The existing API integration runner discovers the new file; its test owns additional source/restore containers rather than restoring into the runner's shared migrated DB. This location reuses existing API lifecycle fixture/services without reversing database-package dependencies or adding a pg dependency to the API.

### Isolated algorithm

1. Allocate source and target containers through the existing installed `@testcontainers/postgresql` package with image `postgres:18.4`, distinct run-owned database names and synthetic credentials. Keep those object handles as the only authority for `exec`, archive transfer and cleanup. Refuse source/target identity equality; do not accept a caller-provided URL or ambient developer `DATABASE_URL` for either container.
2. Deploy actual migrations only to the owned source. In the new test file, local `createRecoveryFixture(database: DatabaseClient): Promise<RecoveryFixtureIds>` composes existing `createQualityFixture`/`appendQualityOrder` from `apps/api/src/test-support/quality.fixture.ts`, actual `QualityCommandExecutor`/`WarehouseCommandExecutor` and proposed `AdministrationCommandExecutor.execute({actorId,body})` from the backend blueprint; it does not import another test module or insert invented lifecycle history. Use at least two orders so branches remain truthful: one order undergoes quality rejection → ordinary cutting/production correction → reinspection acceptance → physical receipt → dispatch → confirmed delivery; a second order is accepted/received → dispatched → physically returned failed → partial administrative cancellation → explicit retry → new dispatch/delivery. Apply an allowed administrative contact/note correction and a separate accepted cumulative-paid update creating surplus on the second order; preserve both attempts and cancelled receipt facts. Keep an active and a suspended account. Read current root version before each actual executor command, use fresh synthetic command IDs and existing accepted schemas; no direct status/history insertion is permitted. Capture the fingerprint only after these actual commands settle, including retained receipts, catalog identity and business counter. Sensitive credentials are synthetic and stay private.
3. In the source container run `pg_dump` as the container's configured PostgreSQL user, via `exec` with a fixed string-array argv: `pg_dump --format=custom --file=/tmp/p08-recovery.dump --username=<owned-user> --dbname=<owned-db>`. Credentials come from that owned container's existing environment; neither values nor raw command output are public evidence. No shell interpolation, table filtering or live data is involved.
4. Check the child exit code before proceeding. Transfer the single dump archive using installed `copyArchiveFromContainer('/tmp/p08-recovery.dump')` and target `copyArchiveToContainer(transfer, '/tmp')`; preserve binary data. The source method returns `NodeJS.ReadableStream` while the target consumes a Node `Readable`: adapt through a `PassThrough` from `node:stream` and `pipeline` from `node:stream/promises`, start the target consumer before awaiting the producer pipeline, and await both promises. On either failure destroy owned streams/settle the other promise in `finally`; no unsafe cast or full binary-text buffer. These methods are verified in installed Testcontainers 12.1.0 types. A transfer failure is not a valid backup.
5. Verify the target is still the distinct test-owned empty database; do not pre-migrate it. In its container run fixed argv `pg_restore --exit-on-error --single-transaction --no-owner --no-acl --username=<owned-user> --dbname=<owned-db> /tmp/p08-recovery.dump`. No `--clean`, `--create`, schema push or reset is used. Failure aborts the exercise instead of continuing with a partially accepted result.
6. Read the target fingerprint using its own injected DatabaseClient, compare every selected fact and application table count/migration checksum, then run migration status/deploy against that owned target to establish no pending migration or checksum drift. Exercise a permitted protected read and a denied employee operation against the restored data through the real API/service boundary where that claim is made. Do not infer HTTP authority from SQL counts alone.
7. Close target clients, call the installed `target.restart()` method on that retained owned container, wait by bounded SQL-readiness observation using the existing 120-second container startup bound, recreate target clients and reread the same facts. Do not call `stop()` before restart: normal final stop may remove the container and its storage. Restarting an API process alone is not database durability evidence; restarting the test DB also does not establish target hosting persistence.
8. Negative cases: corrupt/truncated archive is rejected; wrong/nonempty/identical target is refused before restore; induced transfer/restore failure yields no success; source remains unchanged. `finally` closes every test client/stream, stops only both owned containers and removes only any private run-owned temporary files. A source container contains no unrelated data; its cleanup is never generalized to a developer instance.

The selected logical archive uses PostgreSQL 18's supported custom format and explicit restore failure handling. O11 proves application-data restoration; O13 adds scheduled verified logical archives and private runtime-configuration copies. Neither claims cluster-role backup or point-in-time recovery. The exact option semantics were checked against [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html) and [PostgreSQL 18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html); the project image remains pinned at its existing 18.4, without an implicit upgrade.

### Target evidence record and admission

The runbook's nonsecret evidence record contains `releaseRevision`, `environmentReference`, `operatorReference`, `authorizedActionReference`, `migrationSetHash`, `backupReference`, `backupCompletedAt`, `restoreTargetReference`, `restoreStartedAt`, `restoreCompletedAt`, `fingerprintComparison`, `startupReadinessOutcome`, `observedRestartOutcome`, `mailReceiptOutcome`, `remainingGates`. Values describing not-run steps are explicitly `UNPERFORMED`, never omitted as though passed.

Before any real target backup/restore: verify environment identity through the provider's approved safe controls, record authorization/reference and confirm the intended source plus distinct disposable restore target. Backup material contains private operational data; use only the approved access/storage/retention arrangements, never source control or chat attachments. Obtain the approved backup using that provider/host procedure and test restoration into an isolated target. Record actual scope, checksums and comparison outcome. Failed or unknown backup completion requires observation, not a destructive retry against the source. Actual disaster restoration to a live database requires its own explicit recovery authorization and target-specific reviewed procedure; it is not authorized by this local exercise or P08 PLAN.

## O12 — Full Regression, Route Inventory and Active Actions

**Requirements**: FR-025–027, VR-007–009, SC-006/007. **Design status**: PASS for exact suite/discovery/coverage design. Executed tests and all phase acceptance remain unperformed by this PLAN.

### Current inventory and reproducible completion rule

Fresh read-only enumeration of `apps/web/src/app/**/page.tsx` at planning intake yields **102 definitions: 84 screen wrappers and 18 redirects**, matching root Appendix A. This is a source count, not browser acceptance. Recompute at implementation admission and compare URL sets rather than trusting the number.

Proposed `apps/web/e2e/p08-route-cases.ts` exports `P08_ROUTE_CASES: readonly P08RouteCase[]`. Each case has `sourcePage`, `routePattern`, `kind: 'screen' | 'redirect' | 'development-only'`, `allowedContext`, `fixtureKey: string | null`, `expectedDestination: string | null` and `scenarioKey: string` identifying a real assertion in the browser owner. `allowedContext` is one of anonymous, eligible-admin, eligible-sales-owner, eligible-approval, eligible-cutting, eligible-production, eligible-quality, eligible-warehouse or credential-valid-restricted; conditional statuses are bound by the case fixture. Redirects require the exact destination; nonredirects use null. Case values derive from current wrappers/callers enumerated in the complete family matrix below. Dynamic URLs use stable synthetic IDs/phone from the real owned fixture, not first-record fallbacks.

Proposed `apps/web/e2e/administration-readiness.spec.ts` compares the case file's normalized page/URL set to the current source set and root Appendix A. Normalization removes parenthesized App Router groups and `/page.tsx`, retaining dynamic segments. It verifies uniqueness, includes every current page and rejects unexplained extras or exclusions. A new route cannot be accepted by retaining the old count. The route helper is test support, not a production registry.

| Complete current URL family / members                                                                                                                                                                                                                                                                       | Owning real acceptance / required P08 coverage                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`                                                                                                                                                                                                 | Existing `staff-identity.spec.ts`: anonymous/auth/verification/recovery and root redirect; preserve one-time credential handling.                                                                                          |
| `/auth/pending-approval`, `/auth/rejected`, `/auth/suspended`, `/unauthorized`                                                                                                                                                                                                                              | Existing current identity/status routes and protected-state tests; correct credential context, no public lifecycle enumeration; preserve reached presentations.                                                            |
| `/auth/otp`, `/auth/verify-otp`, `/prototype-preview`                                                                                                                                                                                                                                                       | Development-only: current source already calls `notFound()` outside development, including before the OTP redirect. Production-built browser run must prove unavailable; isolated previews retain no production authority. |
| `/{admin,sales,approval,cutting,production,quality,warehouse}/account`                                                                                                                                                                                                                                      | Existing real profile/password/logout/session acceptance in each admitted workspace; no fixture fallback.                                                                                                                  |
| `/admin`, `/admin/registration-requests`, `/admin/users`, `/admin/users/pending`                                                                                                                                                                                                                            | Admin redirect, registration redirect and existing P01 staff management/current authority.                                                                                                                                 |
| `/admin/customers`, `/admin/customers/[phone]`; `/sales/customers`, `/sales/customers/new`, `/sales/customers/[phone]`, `/sales/customers/[phone]/edit`                                                                                                                                                     | Existing `customer-drafts.spec.ts` plus admin counterpart/current submitted history; shared master, stable links, own-sales privacy, phone-change/missing-route handling.                                                  |
| `/sales`, `/sales/dashboard`, `/sales/activity`, `/sales/orders`, `/sales/orders/drafts`, `/sales/orders/new`, `/sales/orders/returned`, `/sales/orders/[orderId]`, `/sales/orders/[orderId]/edit`                                                                                                          | Existing customer/approval suites plus complete P08 catalog-backed seven-type creation/submission, dates/numbers/paid and own-order histories.                                                                             |
| `/approval`, `/approval/dashboard`, `/approval/pending`, `/approval/history`, `/approval/orders/[orderId]`                                                                                                                                                                                                  | Existing `approval-reapproval-printing.spec.ts`: initial return/resubmit/approve and exact-piece A/B/C/contact-reapproval/print locks.                                                                                     |
| `/cutting`, `/cutting/dashboard`, `/cutting/activity`, `/cutting/incoming`, `/cutting/in-progress`, `/cutting/completed`, `/cutting/returned`, `/cutting/waiting`, `/cutting/sent`, `/cutting/orders/[orderId]`, `/cutting/tasks/[orderId]`                                                                 | Existing `cutting-production-workspaces.spec.ts`: all queues/aliases, colleague continuation, selected-piece work, exact batches/problem/report/return, financial/contact redaction.                                       |
| `/production`, `/production/dashboard`, `/production/activity`, `/production/incoming`, `/production/in-progress`, `/production/completed`, `/production/returned`, `/production/repairs`, `/production/waiting`, `/production/sent`, `/production/orders/[orderId]`, `/production/tasks/[orderId]`         | Same P05 suite, including repair-type filter with full cutting route; no new assignment authority.                                                                                                                         |
| `/quality`, `/quality/dashboard`, `/quality/activity`, `/quality/incoming`, `/quality/inspection`, `/quality/accepted`, `/quality/corrections`, `/quality/reinspection`, `/quality/waiting`, `/quality/sent`, `/quality/orders/[orderId]`, `/quality/tasks/[orderId]`                                       | Existing `quality-packing-reinspection.spec.ts`: normal acceptance, exact batches, both correction targets/repeated cycles, packing and incoming handoff without physical receipt.                                         |
| `/warehouse`, `/warehouse/dashboard`, `/warehouse/activity`, `/warehouse/incoming`, `/warehouse/in-progress`, `/warehouse/incomplete`, `/warehouse/ready`, `/warehouse/out-for-delivery`, `/warehouse/delivery-failed`, `/warehouse/delivered`, `/warehouse/orders/[orderId]`, `/warehouse/tasks/[orderId]` | Existing `warehouse-receipt-delivery.spec.ts`: receipt once, exact readiness, whole-order review, dispatch/recipient/failure-return/retry/attempt evidence and aliases.                                                    |
| `/admin/dashboard`, `/admin/orders`, `/admin/orders/[orderId]`, `/admin/approvals`, `/admin/corrections`, `/admin/delivery-exceptions`, `/admin/activity`, `/admin/reports`, `/reports/print`                                                                                                               | New P08 browser owner: every authoritative admin view/dialog/filter/page, D-007–009, report consistency/all six sections and physical portrait output; direct non-admin denial.                                            |
| `/orders/[orderId]/print`, `/print/order/[orderId]`                                                                                                                                                                                                                                                         | Existing P04 suites plus P08 corrected effective contacts, authoritative eligibility/redaction, 1/8/9/17 active-row physical landscape output and all-cancelled/empty handling.                                            |

### Active-action matrix and required evidence

Every root Appendix B row is accounted for below, with current source callers recorded now. Later admission rechecks source drift rather than discovering an undecided integration path. A definition/barrel export without a rendering caller is classified as unreached and is not connected simply because it exists. The frontend design owns exact P08 algorithms and provider-removal work.

Current call-site ledger (paths are below `apps/web/src/features/`; these are existing files):

| Entry point                      | Current caller / classification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff management                 | `administration/screens/admin-users-view.tsx` renders `administration/components/staff-management-dialog.tsx`; it already uses real staff hooks. `prototype/components/admin-assign-role-dialog.tsx` has no rendering caller outside its own implementation and the `action-dialogs.tsx` barrel; unreached, do not wire a mock alternate.                                                                                                                                                                                             |
| Account forms                    | `prototype/components/oriental-account-settings.tsx` composes real `users/components/profile-form.tsx`, `account/components/password-form.tsx` and `account/components/session-controls.tsx` for department account routes.                                                                                                                                                                                                                                                                                                           |
| Inline customer/paper            | `sales/screens/sales-create-order-view.tsx` renders `InlineCustomerModal` and `OrderPaperForm`; `sales/screens/inline-customer-modal.tsx` is the real inline save/link owner. Paper controls remain in `orders/components/order-paper-form-screen.tsx` and their existing cells/column owners.                                                                                                                                                                                                                                        |
| Approval return/issue decisions  | `approval/screens/approval-decision-view.tsx` renders `ApprovalReturnModal`/`ApprovalProblemResolutionModal`; `approval-pending-view.tsx` and `approval-dashboard-view.tsx` also render the issue modal.                                                                                                                                                                                                                                                                                                                              |
| Sales problem contact            | `sales/screens/sales-order-detail-view.tsx` and `sales-returned-view.tsx` render `sales-problem-contact-modal.tsx`, including its nested cancellation-request confirmation.                                                                                                                                                                                                                                                                                                                                                           |
| Receive/start/completion/problem | `manufacturing/screens/cutting-workspace.tsx` and `factory-task-detail-view.tsx` select the reached receive/start versus completion dialog and render problem controls. `department-piece-table.tsx` also renders piece problem/quality controls. `prototype/components/confirm-receipt-dialog.tsx` and `start-work-dialog.tsx` have definitions/barrel exports only and no external rendering caller; unreached alternatives remain classified.                                                                                      |
| Quality inspection               | `manufacturing/screens/quality-workspace.tsx`, `factory-task-detail-view.tsx` and `department-piece-table.tsx` render the current `QualityInspectionDialog`/`QualityInspectPieceModal`/problem flows, using existing persisted discriminated branches.                                                                                                                                                                                                                                                                                |
| Warehouse reached paths          | `warehouse/components/warehouse-queue.tsx` renders receipt, dispatch, confirmation, failure and retry dialogs; `warehouse-order-detail.tsx` renders the same operations. Its `RecordDeliveryFailedDialog` is an existing alias of `DeliveryFailedDialog`, not a separate policy. `manufacturing/screens/department-order-table.tsx` contains the older delivery-failure call site; preserve its existing real-versus-legacy source classification in the frontend provider-removal ledger instead of adding another delivery command. |
| Admin cancellation/correction    | `administration/screens/admin-order-detail-view.tsx` renders `AdminCancelDialog`/`AdminReopenDialog` through existing `prototype/components/action-dialogs.tsx`; these are P08 conversion owners.                                                                                                                                                                                                                                                                                                                                     |
| Report sections                  | `administration/screens/admin-reports-view.tsx` opens `/reports/print`; `printing/screens/print-report-view.tsx` composes existing overview, workforce, orders, exceptions and endorsements owners.                                                                                                                                                                                                                                                                                                                                   |

The ledger records current call sites, not proof that every conditional branch ran. Existing owning phase blueprints and their real tests provide the persisted branch contracts; [frontend-design.md](frontend-design.md) fixes the final P08 caller/state mapping without connecting unreachable controls.

| Action family / current entry points                                                                           | Concrete accepted evidence                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff approve/reject/manage/department/status; `admin-assign-role-dialog.tsx` alternate                        | Current server decisions, actor/time, active authority revocation, stale/repeat denial; resolve alternate's actual callers against P01 owner, no mock admin path.                |
| Profile/password/logout/logout-all                                                                             | Confirmed account result, failures/retry; no fixture password or false signout.                                                                                                  |
| Customer forms and `inline-customer-modal.tsx`                                                                 | Actual create/update/link, duplicate normalization/conflict, cancel no write, shared master without cross-owner order leakage.                                                   |
| Paper cells/search portals/size/adjustment/floor/text/money; piece add/duplicate/remove; draft/submit/resubmit | Persisted existing controls/source-language fidelity, `soleAddition` distinction, read-only quote/freeze, incomplete draft, atomic once-only submit and revised-reapproval flow. |
| `approval-return-modal.tsx`, `approval-problem-resolution-modal.tsx`, `sales-problem-contact-modal.tsx`        | Required free text, exact affected piece, A/B/C, customer proposal/request → approval; unaffected pieces continue and sales cannot cancel/resume directly.                       |
| Receive/start/completion/problem controls and current overlapping dialogs                                      | Same-department colleague continuation, selected physical IDs, partial work, completion/forward together, one-piece problem hold and real actor/time.                            |
| `quality-inspect-piece-modal.tsx`, `quality-inspection-dialog.tsx`                                             | Captured packing/inspection/rejection data; both correction routes/reinspection; quality acceptance never counts warehouse physical receipt.                                     |
| Warehouse receipt/dispatch/confirm/failure/retry and reached alternate dialogs                                 | Actual carton/location/notes/recipient/date/attempts, whole-order review, physical-return acknowledgement, optional retry date, no direct failed-to-dispatch bypass.             |
| `admin-cancel-dialog.tsx`, `cancellation-scope.tsx`                                                            | Exact reviewed IDs, derived quantity, full-action rejection on invalid member, retained paid/surplus/history and no refund.                                                      |
| `admin-reopen-dialog.tsx`                                                                                      | Any submitted retained order, allowed general notes/contact/address/reason/Save, no lifecycle/specification/price/paid rewrite, original/current audit.                          |
| Filters/print/pagination/group/flat/expand/select-all/tracking/history/toasts                                  | Scope/count/result synchronization, stable keyboard/focus, honest Arabic loading/error/retry/conflict/unknown outcome; no local fixture success.                                 |
| OTP/role/reset controls in preview                                                                             | Development-only isolation and production denial, no real OTP or fixture-import/reset endpoint.                                                                                  |

### Browser and data admission algorithm

1. Reuse actual owned harness and existing discovered six browser files; do not replace their real paths with intercepted successful requests. New P08 spec imports existing `readE2eRuntime()` and `waitForCapturedAction()` and uses real HTTP contracts/CSRF/auth. Synthetic identities/cookies remain per-context memory and private harness state; no shared developer session.
2. New P08 cases own distinct synthetic orders and staff per project. Reuse the source fixture patterns already present in the P05–P07 browser files, creating roles through actual registration/verification/admin approval and orders through current accepted commands. No production endpoint is added for fixture provisioning. If helper extraction is justified, move only genuinely reused fixture meaning with its existing signatures and callers, not an unrelated test rewrite.
3. Complete one end-to-end order of each of the seven accepted types through real submission → approval → cutting → production → quality → physical receipt → whole-order delivery. Include independent return/resubmit, colleague continuation, issue A/B/C, sales reapproval, quality correction, partial arrival, failed-return/retry, cancellation/overpayment and administrative correction branches using exact fixture IDs. Existing narrower suites retain regression coverage; the whole-flow case proves integration rather than counts of mocked calls.
4. Run the reviewed-workbook mode where actual catalog-source verification is claimed. Existing `apps/api/tests/e2e/server.ts`, in its `p03-consumer-fixtures` step, reads the fixed repository-root reviewed workbook through `readReviewedCatalogBytes`, `ExcelCatalogWorkbookReader.read` and `assertReviewedCatalogPreview` before applying it only to the owned DB. Existing harness forwards `P04_E2E_CATALOG_MODE=reviewed-workbook`; missing/mismatched workbook is a failure, never a synthetic fallback. The new P08 browser owner must assert `readE2eRuntime().catalogEvidence` equals kind `reviewed-workbook` and source SHA-256 `88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b` before claiming workbook-backed acceptance. Run the exact mode command below after implementation. Isolated workbook-backed evidence does not activate production catalog, select the production timezone or prove target submission.
5. Exercise wrong owner/department/role, current-account revocation, direct URL and HTTP calls, two independent contexts/tabs, stale versions/selection and unknown/repeated command recovery. A 401/CSRF precheck is not proof an obsolete protected write route is gone; satisfy earlier guards when verifying actual route removal.
6. Browser cases exercise network refusal, lost/delayed replies after a real observed write, retry/observation and current-authority changes using the existing Playwright request controls; they do not claim a database or mail-provider outage. T024 owns actual Express/database unavailability and controlled provider-failure/recovery evidence through existing `apps/api/src/app.integration.test.ts`, `src/infrastructure/email/email-delivery.test.ts` and logger tests; O09/T023 own production SMTP configuration and real loopback STARTTLS-refusal tests. Link those discovered cases in the full regression evidence rather than adding browser fault controls or manipulating the harness database/mailbox. Transport doubles prove only their named transport/component boundary and cannot replace persistence/recovery or main browser-path evidence. No arbitrary sleeps, test retries or weakened assertions close a failed gate.
7. Verify complete route/action case coverage, report/order PDF behavior, keyboard/focus and both configured widths. Actual exported PDFs and page geometry must be inspected with installed PDF tooling, not only DOM paper counts. Keep credentials out of trace/video/screenshots; save only owned synthetic PDF artifacts privately, verify expected count/format/hash before enumerated cleanup.
8. Record each case's actor/context, exact input/state, observed HTTP/UI/database result, source revision, fresh/cache status and cleanup. Recheck normal production build after harness-specific Next build/origin to avoid accepting a test-origin build as the release artifact.

### Planned command sequence and discovery

All commands below exist in current manifests except package-relative filenames marked proposed. They are future implementation checks, not executed PLAN evidence. Docker/image access, Node24/pnpm11 dependencies, Chromium and Poppler `pdfinfo` are prerequisites. Review actual setup/error output rather than falling back to unrelated data or an unconfigured browser.

```sh
pnpm --filter @template/api test src/core/config/email.config.test.ts
pnpm --filter @template/api test src/core/config/mailer.config.test.ts
pnpm --filter @template/api test:integration src/operations-readiness.integration.test.ts
pnpm --filter @template/database test:integration tests/integration/migration.integration.test.ts
pnpm --filter @template/api test:integration src/app.integration.test.ts src/modules/auth/initial-administrator.service.integration.test.ts
pnpm format:check
pnpm lint
pnpm check-types
pnpm test --concurrency=1 -- --maxWorkers=2
pnpm test:integration --concurrency=1
pnpm build
pnpm verify:build-output
pnpm --filter @template/web check:e2e-types
pnpm --filter @template/api check:e2e-types
pnpm --filter @template/web test:e2e administration-readiness.spec.ts
P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e approval-reapproval-printing.spec.ts administration-readiness.spec.ts
pnpm --filter @template/web test:e2e
pnpm build
pnpm verify:build-output
git diff --check
```

`email.config.test.ts`, `mailer.config.test.ts`, `operations-readiness.integration.test.ts` and `administration-readiness.spec.ts` are proposed outputs and must exist in their owning runner before those focused commands can prove anything. Runner success must show intended test discovery. The bounded full unit command is reused from accepted P07 exit evidence; it does not invent another runner. Integration remains uncached. Full browser runs use desktop/narrow, one worker, zero retries and capture-off configuration; record any environment warning/failure without suppression. The second normal build/output check restores the deployment build after harness activity.

No new root `verify:release` command is claimed. Root `pnpm verify` remains writing/generating implementation tooling and is not run for this planning artifact. Browser installation is a separate tooling setup step (`pnpm --filter @template/web exec playwright install chromium`), not an acceptance check.

## O13 — Target Cutover, Restart and Operator Handoff

**Requirements**: FR-028–031, VR-010, SC-008. **Design status**: PASS for the selected stack, interfaces, operations and verification. Construction is future implementation. Actual target inputs, consequential-action authorization and observations remain OPS-01/runtime/release gates.

### O13.1 — Delegated choices and deployment boundary

The owner delegated recommended choices for unclear items. This amendment selects one Linux host with rootful Docker Engine, **Docker Compose >=2.30.0**, systemd and host Node24. Compose supervises four long-lived services with `restart: unless-stopped`: `postgres`, `api`, `web`, `caddy`. Only Caddy publishes TCP80/443 and UDP443. API4000, web3000 and PostgreSQL5432 have no host port mapping; all share a project-owned bridge. There is no CDN or second proxy. Caddy terminates automatic public HTTPS and preserves `/api/v1` while routing `/api/*` to API and other requests to Next. Its admin interface remains container-loopback-only. API `TRUST_PROXY=1` is valid for this exact isolated one-hop topology.

Production mail uses the existing SMTP adapter, port587, `SMTP_SECURE=false`, forced STARTTLS from O09, certificate validation and minimum TLSv1.2. The actual authenticated SMTP host/account/from address and acceptance inbox are runtime facts; no provider account, subscription or alternative transport is purchased or invented. Production `ORDER_BUSINESS_TIME_ZONE=Asia/Riyadh` is the explicitly delegated policy, not an observation about deployed configuration. Both the deployment validator and actual application settings must agree.

PostgreSQL stays18.4. Its project-owned named volume mounts `/var/lib/postgresql`, consistent with the existing repository and PostgreSQL18 image layout. Caddy has separate named `/data` and `/config` volumes. No operational action removes a live named volume. The application connects as a dedicated database-owner/login role with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`; bootstrap superuser credentials go only to PostgreSQL/tools. Backup storage is an **operator-provided encrypted off-host mounted filesystem**, independently identified and approved. No cloud client or storage account is added.

Daily backups run at **02:00 Asia/Riyadh**. Retain14 successfully verified daily bundles plus the latest verified predeployment bundle until a later release succeeds. A failed/unverified bundle never displaces a verified one. Backups include the logical archive, privately copied runtime configuration, manifest and fingerprints. Record measured dump/restore/restart durations; these preferences create no contractual RPO/RTO, uptime or point-in-time recovery promise. Nightly verification may deliberately pause application writes.

These selected mechanics use documented [Compose service/raw-env-file behavior](https://docs.docker.com/reference/compose-file/services/), [healthy dependency ordering](https://docs.docker.com/compose/how-tos/startup-order), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [Caddy reload](https://caddyserver.com/docs/command-line#caddy-reload), [PostgreSQL18 storage layout](https://hub.docker.com/_/postgres), and [systemd timezone/calendar syntax](https://www.freedesktop.org/software/systemd/man/latest/systemd.time.html#Calendar%20Events). Their availability on the eventual host is checked, not assumed from this source review.

### O13.2 — Exact proposed owners and interfaces

Every path in this table is **proposed**, except the explicitly reused application interfaces. No file listed here has been created by PLAN.

| Owner                                                                               | Fixed responsibility / interface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/Dockerfile`                                                                 | Multi-stage Node24 Debian-bookworm image; `ARG NODE_IMAGE` is a supplied digest-pinned `node:24-bookworm@sha256:…` reference. Builder uses `npm install --global pnpm@11.17.0`, `pnpm install --frozen-lockfile --prod=false`, then `pnpm build --env-mode=loose` with public `NEXT_PUBLIC_API_URL`, `ORIENTAL_DEPLOYMENT_BUILD=standalone` and a synthetic build-only nonconnecting `DATABASE_URL`; run existing `pnpm verify:build-output`. Runtime installs the same pinned pnpm via npm and copies only the explicit artifacts below, runs as `node`, and labels revision. Same immutable image serves API, standalone web and one-off Prisma tools.                                                                                                                                                                                                                            |
| `apps/web/next.config.ts` (modify existing)                                         | Add the fixed build-only branch `process.env["ORIENTAL_DEPLOYMENT_BUILD"] === "standalone"` selecting `output: "standalone"` and `outputFileTracingRoot: path.resolve(import.meta.dirname, "../..")`; preserve every current setting and ordinary build/start behavior. This setting is supplied only by Docker build, never a product/runtime feature flag. Installed Next16.2.12 `dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` is the authority for output paths/assets.                                                                                                                                                                                                                                                                                                                                                                              |
| `.dockerignore`                                                                     | Exclude Git, agent/spec/docs directories, all node_modules/build/cache/private artifacts, all `.env`/`.env.*` except examples, API tests/test-support, web e2e and `*.test.*`/`*.spec.*`. Never copy host credentials, received private backups or test fixtures. Preserve production source needed by Next's actual build.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `deploy/compose.production.yaml`                                                    | Explicit project from CLI; four services, private bridge, pinned PG18.4/Caddy2 image digests, named persistent volumes, no socket mounts or privileged apps; `api` receives a required raw env-file, `postgres` a distinct required raw bootstrap env-file, `web` only NODE_ENV/public API URL/PORT/HOSTNAME. API runs existing compiled start `node --enable-source-maps apps/api/dist/server.js` from image WORKDIR `/workspace`; web runs generated `node /workspace/web/apps/web/server.js` from that same image WORKDIR with HOSTNAME0.0.0.0/PORT3000. Both use init:true and stop grace15s exceeding API shutdown10s. API depends on healthy PG; API health calls existing ready, web health GETs `/auth/login` using Node fetch. Caddy never waits on API health to serve maintenance503. Logs use Docker json-file max-size10m/max-file3 and no Caddy access-log directive. |
| `deploy/Caddyfile`                                                                  | Public domain from validated `APP_DOMAIN`, compression and `import /etc/caddy/mode.caddy` inside that site. Bind the whole run-owned Caddy configuration directory read-only; persist it across reboot. `renderCaddyMode(config, mode)` below creates only the fixed normal/maintenance/acceptance snippet, not arbitrary Caddy syntax from input.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `deploy/systemd/oriental-shoes-backup@.service` / `.timer`                          | Root-owned oneshot invokes host `/usr/bin/node /srv/oriental-shoes/%i/current/scripts/operations/release.mjs backup --config /etc/oriental-shoes/%i/release.json --kind daily --apply --confirm-environment %i --scheduled`; no shell. Timer `OnCalendar=*-*-* 02:00:00 Asia/Riyadh`, `Persistent=true`, `RandomizedDelaySec=0`; service requires/starts after docker.service, has TimeoutStartSec=3600, no RemainAfterExit. Scheduled authorization reference comes from the private validated configuration.                                                                                                                                                                                                                                                                                                                                                                      |
| `scripts/operations/release-config.mjs`                                             | Built-in Node-only module. Exports `parseReleaseConfig(input): ReleaseConfig`, `parseRawEnvironment(text): Readonly<Record<string,string>>`, `parseReleaseArguments(argv): ReleaseArguments`, `admitTarget(config, observations): TargetAdmission`, `renderCaddyMode(config, mode): string`. Signatures use JSDoc readonly types and checked input; never emit input/secret values in errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `scripts/operations/release.mjs`                                                    | Built-in Node-only CLI/composition. Exports `planReleaseAction(config, args): ReleasePlan`, `runReleaseAction(context, args): Promise<OperationResult>`, `main(argv): Promise<number>`. Closed actions/argv, fixed spawn arrays, bounded subprocesses, exclusive run lock, atomic private state/evidence and transition algorithms below; no general remote-command or SSH interface. Imports config/backup owners.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `scripts/operations/backup.mjs`                                                     | Exports `readDatabaseFingerprint(context, target): Promise<DatabaseFingerprint>`, `createVerifiedBackup(context, kind): Promise<BackupBundle>`, `verifyBackupInDisposableDatabase(context, bundle): Promise<RestoreEvidence>`, `pruneVerifiedDailyBackups(context, index): Promise<BackupIndex>`. `target` is the registered owned-container string key (for example `postgres` or a run-owned restore key); the runtime registry supplies validated ID/environment/run/role ownership, never an arbitrary URL/name. All payload streams stay binary/private.                                                                                                                                                                                                                                                                                                                       |
| `scripts/operations/release-config.test.mjs`, `backup.test.mjs`, `release.test.mjs` | Node built-in unit tests for validation, guard refusal, argv/preview, fixed rendering, transition/failure/cleanup and retention. Doubled subprocess tests establish planning/control flow only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `scripts/operations/release.integration.test.mjs`                                   | Node built-in isolated Docker test owner for actual image/Compose/private-port/Caddy-mode/PG-role/migration/dump/restore/restart/failure evidence. Test-only programmatic context accepts only run-owned `p08-ops-test-*` resources and loopback published ephemeral ports; CLI target mode has no bypass flag. Reuse O11 for actual domain-history/authority assertions rather than inventing replacement SQL histories.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/operations/release-runbook.md`, `README.md`, `PROJECT_REFERENCE.md`           | Actual implemented command/operator owners. T046 remains local guidance; later ops acceptance updates these to the implemented O13 tools and evidence. No unperformed target result is promoted to PASS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

No root/package manifest change or new npm dependency is needed. Node's [built-in test runner](https://nodejs.org/docs/latest-v24.x/api/test.html) discovers these exact `.test.mjs` files only through the explicit commands below; root Turbo unit tasks do not claim to discover them.

The runtime COPY allowlist preserves pnpm's relative module links: root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `node_modules`; package manifests and `node_modules` for `apps/api`, `packages/contracts`, `packages/database`; those three packages' `dist` directories; database `prisma/schema.prisma`, complete `prisma/migrations` and `prisma.config.ts` (the sole required TypeScript operator-config asset). Copy Next's entire traced `apps/web/.next/standalone` tree to `/workspace/web`, plus `apps/web/public` to `/workspace/web/apps/web/public` and `.next/static` to `/workspace/web/apps/web/.next/static`. The monorepo trace root fixes generated entry `/workspace/web/apps/web/server.js`. Keep Prisma7.9.1 CLI/engines/adapter/runtime and native Argon2 dependencies from the existing installed store; do not reinstall workspace dependencies at runtime or change lockfile. Remove project source-map files from the staged artifact copies, retaining needed declarations; copy no project `src`, tests, harness, seed.ts, `.env*`, docs or agent files. Image tests assert this allowlist and actual compiled API/Prisma/Next imports. External dependency package assets are retained as installed, not pruned speculatively. The [pnpm npm-install/Node24 compatibility](https://pnpm.io/installation) and [frozen all-dependency install](https://pnpm.io/cli/install) support the pinned recipe; neither authorizes upgrading to the documentation site's latest pnpm.

The JS interface types are local JSDoc owners, not a new shared application contract: `ReleaseArguments` contains the closed action, preview/observe/apply mode and action-specific confirmed inputs; `ReleasePlan` is `{action, environmentId, revision, steps: readonly {stage, safeSummary}[], requiredAuthorizations: readonly string[]}` with no raw command/secret payload; `OperationResult` is `{runId, action, phase, outcome, evidenceReference}`. `OperationContext` contains validated config, real subprocess/private-file adapters, deadline, run ID and an in-memory registry of captured owned container IDs; CLI constructs it, while only tests inject doubles/isolated adapters. `DatabaseFingerprint` contains sorted table `{table,rowCount,sha256}` entries, sorted migration `{name,checksum,finishedAt}` facts and owner/role flags; `BackupBundle`/`RestoreEvidence` contain the exact O13.5 manifest/results, never row contents or credentials. Live resources carry `io.oriental-shoes.environment=<environment>`, `io.oriental-shoes.scope=live` and their fixed service role; disposable resources additionally carry scope=isolated and the exact run UUID. Persistent volume labels do not change with application revision.

### O13.3 — Runtime input schema and fail-closed admission

`ReleaseConfig` is a strict version1 JSON object. Reject unknown keys, absent required values and control characters. The following are mandatory nonsecret **actual values**, not generated defaults:

| Field                                                                                                                 | Validation / meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environmentId`, `projectName`                                                                                        | environment `[a-z][a-z0-9-]{0,39}`; project exactly `oriental-shoes-` plus environment. No reserved `p08-ops-test-` prefix in target mode.                                                                                                                                                                                                                                                                                                                                       |
| `expectedMachineIdSha256`, `expectedDockerEngineId`                                                                   | Exact observed host `/etc/machine-id` SHA-256 and local Docker Engine ID; verify both before execution and before any consequential stage. Docker endpoint must be a local Unix socket, not a remote context.                                                                                                                                                                                                                                                                    |
| `appDomain`, `acceptanceCidrs`                                                                                        | Lowercase ASCII public FQDN, no wildcard/IP/port/path/localhost; at least one strict IPv4/IPv6 CIDR, no all-address `/0`. Actual DNS/ports/certificate and operator reachability remain observed admission checks. No additional CDN/proxy is supported.                                                                                                                                                                                                                         |
| `releaseRevision`, `nodeImage`, `postgresImage`, `caddyImage`                                                         | Revision exactly40 lowercase hex; supplied image references constrained respectively to `node:24-bookworm@sha256:<64hex>`, `postgres:18.4@sha256:<64hex>`, `caddy:2@sha256:<64hex>`. Resolve/record exact local image IDs and architecture at packaging; reject tag-only or later image-ID drift. No implicit base-image upgrade.                                                                                                                                                |
| `runtimeEnvFile`, `postgresEnvFile`                                                                                   | Absolute existing regular nonsymlink files, root-owned0600, outside repository/releases and backup source volume. Must be distinct. Paths are values; contents remain private.                                                                                                                                                                                                                                                                                                   |
| `databaseName`, `applicationRole`, `bootstrapRole`                                                                    | Distinct application/bootstrap roles and nonreserved database, each `[a-z][a-z0-9_]{0,62}`. API URL must address `postgres:5432`, selected database/role, nonempty percent-encoded password and schema=public; it cannot use bootstrap credentials.                                                                                                                                                                                                                              |
| `operatorReference`, `acceptanceInbox`, `initialAdministrator`                                                        | Fixed safe operator reference<=128; real operator-controlled inbox; strict `{userId: UUID                                                                                                                                                                                                                                                                                                                                                                                        | null, expectedEmail: valid email<=320, expectedAccessVersion: integer0..2147483647 | null}`. The ID/version pair may be null only for fresh preparation before the selected real person registers; preview/apply/open-traffic require the actual observed pair. No credential or fake identity. Existing ADMIN is verified; otherwise real registration/verification and restricted provisioning apply. |
| `backupDirectory`, `backupMountPoint`, `backupStorageIdentity`, `backupMountSource`, `backupStorageApprovalReference` | Absolute existing private directory inside an existing off-host mount; mount source/type and root-owned `.storage-identity` record match exact supplied identity. Approval reference attests encryption/access/off-host independence. Compare mounted source/device against the inspected live PG volume backing filesystem; reject missing/fallen-through/same-storage/symlink targets before writes and before marking a bundle verified. A bare path or boolean is not proof. |
| `scheduledBackupAuthorizationReference`                                                                               | Standing authorization reference for the selected daily backup/restore/retention actions; required before timer installation or `--scheduled`. No automatic authority for deployment, admin promotion or disaster recovery.                                                                                                                                                                                                                                                      |

Derived locations are fixed: release `/srv/oriental-shoes/<environment>/releases/<revision>`, active symlink `/srv/oriental-shoes/<environment>/current`, private state `/var/lib/oriental-shoes/<environment>`, config `/etc/oriental-shoes/<environment>/release.json`. Root owns directories0700 except the public Caddy config directory0755/files0644. Validate canonical containment and revision/Git/lockfile/migration hashes; reject dirty/unmatched release source rather than cloning/resetting it. Private state files0600 are atomic-write/rename records. A run lock created with exclusive open contains run UUID/PID/boot identity; never remove another run's or an unexplained stale lock automatically.

`parseRawEnvironment` implements literal one-line `KEY=value`, splitting only the first equals sign; no export, multiline, interpolation or quote stripping. Reject duplicate/unknown keys, NUL/newline values and blank required fields. Production app input requires existing four distinct accepted auth secrets and valid current config, `NODE_ENV=production`, `API_HOST=0.0.0.0`, port4000, `/api/v1`, `TRUST_PROXY=1`, `AUTH_COOKIE_SAME_SITE=lax`, `SHUTDOWN_TIMEOUT_MS=10000` (no larger override under the selected15s Compose grace), `LOG_LEVEL=info`, `WEB_APP_URL=CORS_ORIGINS=https://<appDomain>`, `ORDER_BUSINESS_TIME_ZONE=Asia/Riyadh`, selected dedicated `DATABASE_URL`, SMTP587/STARTTLS settings above and real from/reply-to identities. Public web URL is derived as `https://<appDomain>/api/v1`; it is never read from private env for frontend serialization. PostgreSQL private file contains only selected bootstrap user/password and `POSTGRES_DB=postgres`. Preview validates these fixed operations constraints/private-key allowlists with pure built-in code; it neither imports side-effectful application config nor mutates host environment. Existing compiled API config independently validates its full current settings in an admitted one-off observation/start. Safe errors name keys, never values. Do not print `docker compose config`, `docker inspect` environments, child stderr or rendered secret-bearing argv.

Every action defaults to **preview**: parse/admit static inputs and return a sanitized ordered plan, with no spawn, file write, pull, build, DB/mail contact or timer change. `--observe` is accepted only for `inspect` and `admin-preview` and runs their read-only checks. Write execution requires `--apply --confirm-environment <exact environmentId> --authorization-reference <nonsecret reference>`; `--scheduled` is accepted only for daily backup and reads its standing reference instead. Refuse mixed observe/apply, unknown/duplicate flags, mismatched confirmation or missing authorization before effects. `admin-apply` additionally requires `--confirm-user <exact UUID>`; replacement recovery additionally requires `--confirm-restore <environmentId>:<projectName>:<databaseName>`.

Closed actions: `inspect`, `package`, `backup`, `prepare`, `admin-preview`, `admin-apply`, `restart`, `recover-replacement`, `open-traffic`, `install-backup-timer`. `--kind daily|predeploy` belongs only to backup; `--backup-id <UUID>` belongs only to replacement recovery. Exit0 means preview/read-only success or completed named operation, never entire release;2 `RELEASE_INPUT_INVALID`;3 `RELEASE_ADMISSION_MISSING`;4 `RELEASE_TARGET_MISMATCH`;5 `RELEASE_CHECK_FAILED`;6 `RELEASE_STATE_UNCERTAIN`. Emit fixed classification/stage/run/environment/revision references only. No force/skip/reset/push/volume-delete/live-overwrite command exists.

### O13.4 — Packaging, supervision and Caddy modes

1. `inspect --observe` checks host Linux/rootful local Docker/systemd, host Node24 and Compose>=2.30, identity matches, private file/mount ownership, free disk, DNS/operator network admission and exact existing resource labels. Existing project containers/volumes must carry matching environment/project ownership; refuse an unrelated or ambiguous namespace. Read-only inspection does not contact SMTP or assert inbox delivery.
2. `package --apply ...` freezes reviewed source/lockfile/migration hashes, builds the digest-pinned Dockerfile using fixed `docker build --file <release>/deploy/Dockerfile --build-arg NODE_IMAGE=<validated ref> --build-arg NEXT_PUBLIC_API_URL=<derived public URL> --build-arg RELEASE_REVISION=<revision> --tag <project>-app:<revision>-<build UUID> <release>` argv. Build-only Prisma URL is synthetic and never points to live DB. Record resulting image ID; no runtime secret is a build arg/context file. Node's nonroot runtime owns its workspace/cache. Verify required emitted entries and no test-support/test artifacts or private env in the image. Local build evidence is separate from target execution.
3. Every Compose subprocess has fixed prefix `docker compose --project-name <project> --project-directory <release> --file <release>/deploy/compose.production.yaml`. Construct a minimal child environment: fixed safe PATH, LANG, root-owned Docker config path and validated public interpolation/path values, plus `COMPOSE_DISABLE_ENV_FILE=1`; exclude inherited `COMPOSE_*`, `DOCKER_HOST`, `DOCKER_CONTEXT` and proxy overrides. The admitted endpoint is the selected local Unix socket. This explicitly disables Compose's [default project .env loading](https://docs.docker.com/compose/how-tos/environment-variables/envvars/#compose_disable_env_file), independently of Git/Docker ignore rules. Secret values enter services through required `env_file: {path, format: raw}`. `config --quiet` may validate privately; never expose expanded configuration. PostgreSQL starts via `up -d --wait --wait-timeout 120 postgres`; API/web via `up -d --no-deps --wait --wait-timeout 120 api web` after migration. No dependency hook runs migrations automatically.
4. The persistent Caddy config directory contains the checked-in base plus generated `mode.caddy`. Normal mode uses the existing two `handle` branches and no URI stripping. Maintenance mode responds503 with fixed Arabic-safe unavailable text and Retry-After; it never proxies. Acceptance mode uses `@operator remote_ip <validated CIDRs>` and nested normal routing for those direct peers,503 for everyone else. Source IP comes from the direct connection, not untrusted forwarded headers. Caddy [remote_ip](https://caddyserver.com/docs/caddyfile/matchers#remote-ip) and [same-origin reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) are the selected mechanisms.
5. Before initial Caddy startup use `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` in its owned image. For a running instance atomically publish the candidate snippet, then `exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`; inspect exit/result. A rejected reload retains the active config; restore the previous file and record failure so reboot cannot load the rejected candidate. Do not stop Caddy or expose its admin API to change modes. Persist the last accepted snippet, so host/process restart retains normal or maintenance state.
6. Observe API live and ready independently through the permitted network, web response, HTTPS certificate/redirect and real API-prefix routing. Never use insecure TLS flags. Failure leaves maintenance/acceptance and its exact gate open; API health remains DB-only. Docker `unless-stopped` is supervision, not proof of startup/readiness or a remediation for invalid config.

The selected [`compose run --rm --no-deps`](https://docs.docker.com/reference/cli/docker/compose/run/) one-off tool commands reuse the API service's image/private configuration and publish no ports. [`compose exec -T`](https://docs.docker.com/reference/cli/docker/compose/exec/) preserves binary streams. [`compose stop`](https://docs.docker.com/reference/cli/docker/compose/stop/) preserves containers; [`compose up`](https://docs.docker.com/reference/cli/docker/compose/up/) may recreate services while preserving mounted volumes. These are different operations and are tested separately.

### O13.5 — Backup, distinct restore, scheduling and retention

1. Acquire the exclusive run lock and verify host/project/PG-container/volume labels plus off-host mount identity before writing. A scheduled daily job requires recorded OPEN steady state, healthy matching active images, exact complete migration ledger and no unresolved lifecycle failure; a failed/maintenance/uncertain prepare refuses the timer run without starting anything. Save exact prior service running/stopped state, images, ledger and Caddy mode. Change Caddy to maintenance, verify503, and `stop --timeout 15 api web`. No application writer remains; never stop PostgreSQL to take a logical dump. Manual incident-state/predeploy backups preserve an already stopped state and grant no recovery authority. Nightly jobs refuse overlap with a deploy/recovery and report a failed/missed run rather than retrying destructive guesses.
2. `readDatabaseFingerprint` first enumerates actual public base tables through pg_catalog. Migrated/populated data must include `_prisma_migrations` and the table inventory belonging to its observed completed migration prefix (T010/D02 fresh/populated inventories); do not require tables from still-pending P08 migrations. A fully migrated P08 source includes all three P08 tables. Only the admitted FRESH_EMPTY checkpoint records `ledgerAbsent=true`, `migrationFacts=[]` and the actual empty table set without selecting a nonexistent ledger; source/restore must match that classification. Returned identifiers must match `[A-Za-z_][A-Za-z0-9_]{0,62}`, then are double-quoted as SQL identifiers. Invoke fixed `psql -X -q -A -t -v ON_ERROR_STOP=1 --username=<bootstrap> --dbname=<database> --command=<fixed query>` arrays with fixed session `TimeZone=UTC`, `DateStyle=ISO,YMD`, `extra_float_digits=3` and statement timeout120s. For each table stream `COPY (SELECT to_jsonb(t)::text FROM public.<quoted table> AS t ORDER BY to_jsonb(t)::text COLLATE "C") TO STDOUT` into Node SHA-256 and row counter; COPY text escapes embedded newlines, keeping one physical row per output line. No row payload is printed/materialized in JS. Record table-set/count/hash and migration-name/checksum/finished facts privately. Use the same PG18.4 image/encoding/settings on both sides; timeout/unexpected missing table fails. [PostgreSQL COPY](https://www.postgresql.org/docs/18/sql-copy.html) and [psql error behavior](https://www.postgresql.org/docs/18/app-psql.html) define this stream boundary.
3. Under a new UUID directory0700 on the approved mount, open `database.dump.partial` exclusively0600. Stream `exec -T postgres pg_dump --format=custom --no-owner --no-acl --username=<bootstrap> --dbname=<database>` stdout directly to it while hashing. Check exit/end, reread source fingerprint unchanged, fsync/close; copy both private env files, validated release.json, accepted Caddy mode and source/lockfile/migration/release manifest0600 and hash them. No secret is included in public evidence. Replacement recovery uses these as private evidence and secret recovery material, while explicitly rebinding actual new host/storage facts; it never blindly restores the old target configuration. Total operation deadline1800s; no arbitrary sleeps. A partial write never becomes verified.
4. `verifyBackupInDisposableDatabase` creates a uniquely labelled PG18.4 container with `--network none`, no published ports and no live volume/secret-file mount. Use only its captured Docker ID for local `exec -i`; initialize a **new** app role/database from template0 using synthetic restore credentials and the same nonsuperuser ownership rules. Stream archive stdin to `pg_restore --exit-on-error --single-transaction --no-owner --no-acl --role=<applicationRole> --username=<restore bootstrap> --dbname=<database>`. Compare every table/count/hash/migration fact; compare role flags/ownership. A fresh empty source is recorded as such, never called populated proof. No live DB URL is accepted by the restore helper.
5. Restart that owned restore container with `docker restart --time 15 <captured ID>`, wait by bounded `pg_isready`/SQL observation up to120s, then compare fingerprint again. Finally stop/remove only its captured run-owned container and anonymous storage; verify labels before cleanup and never generalize cleanup to live volumes. Truncated/archive/transfer/restore/timeout/target-identity failures leave `verified=false`; source stays unchanged. This supplements O11's actual domain/API authority proof, not replaces it.
6. Recheck mount identity, archive and private-copy hashes before atomically promoting bundle/index to VERIFIED. Manifest contains O11's fields plus kind/businessDate, archive SHA-256/bytes, private-config hashes, table-set fingerprints, source image/migration identities, run/operator/authorization/storage references and measured durations. No credentials/raw rows enter ordinary evidence. After a daily backup resume **only** services proven previously running, using their exact prior image, unchanged compatible ledger/source and healthy live/ready, before restoring the prior OPEN mode. Never revive an already stopped/uncertain/incident deployment. A failed backup still returns failure even if this safe availability recovery succeeds; failure to establish compatibility/health leaves maintenance. Predeploy backup leaves writers stopped/maintenance for prepare.
7. Retention runs only after the new bundle is verified. Keep the newest14 distinct successfully verified daily business dates (latest successful bundle on a date is canonical) and latest predeploy checkpoint; retain a checkpoint through its protected release and retire it only after a later release's observed successful open-traffic receipt. Ignore partial/unrecognized/foreign files. Delete only exact expired bundle paths listed by the validated owned index, contained beneath the approved mounted directory; no glob/rm-rf, no deletion when the mount/index/identity is uncertain. Failed bundles are retained as failure evidence pending explicitly enumerated cleanup, not counted toward14.
8. `install-backup-timer --apply ...` requires standing scheduled authorization and a verified daily backup/restore demonstration. Install the two checked-in systemd templates root-owned0644, `systemd-analyze verify <both paths>`, `systemctl daemon-reload`, then `systemctl enable --now oriental-shoes-backup@<environment>.timer`. Verify `systemctl list-timers` and a real service result. [Persistent timers](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html#Persistent=) may catch up after downtime; the run lock still prevents overlap. A timer file or scheduled timestamp is not successful backup evidence. Operator checks failed units and last VERIFIED business date daily; missing access/failed jobs leave recovery readiness open.

### O13.6 — Forward upgrade, identity, restart, replacement recovery and opening

1. `prepare --apply ...` requires local/ops acceptance and exact packaged image/manifest. Persist phase MAINTENANCE and start Caddy's maintenance configuration before schema effects. A populated target requires a just-verified predeploy checkpoint bound to the same unchanged source fingerprint. On a genuinely fresh owned namespace, start PG and create the dedicated role/database from template0 only when absent, then internally complete O13.5's predeploy dump/distinct-restore checkpoint of that empty database before any migration; record FRESH_EMPTY, never populated proof. Role identifiers are validated/double-quoted; private psql stdin first sets standard_conforming_strings=on and uses a single-quoted password literal with every single quote doubled, rejecting NUL/control input. Never put that SQL/password in argv/log; real quoted/backslash-password tests must verify login and unchanged schema. If role/database already exists, verify ownership and safe flags; never alter/promote/drop it or rewrite passwords to fit config. Foreign/unsafe state refuses admission. Interrupted empty initialization is recovered by exact reinspection, not reset; no schema deployment proceeds without its checkpoint.
2. Bind actual private DATABASE_URL through the one-off API service env-file; repository `.env` is absent. First inspect `_prisma_migrations` directly against ordered reviewed migration names/SHA-256 checksums. Missing ledger is allowed only on the admitted fresh-empty target; otherwise require a known completed prefix with no unknown/mismatched/failed/in-progress/rolled-back entry. Then invoke existing `run --rm --no-deps api pnpm --filter @template/database exec prisma migrate status`. Prisma's [status exit1](https://www.prisma.io/docs/cli/migrate/status) covers both expected pending/no-table and errors: allow it **only** when the preceding successful SQL/source-ledger observation proves that exact fresh/pending prefix. Do not treat arbitrary stderr as permission. All other nonzero/unavailable/ambiguous states refuse migration. Run `run --rm --no-deps api pnpm --filter @template/database db:migrate:deploy`; it must exit0. Final status must exit0 and direct SQL must match the complete reviewed name/checksum/finished ledger with no failed/in-progress rows. Failed/unknown results keep API/web stopped and maintenance active; inspect recorded state and return any needed forward repair to its authorized owner. No reset/push/old SQL edits or automatic application rollback after schema changes.
3. Start current API/web, verify ready/live and switch only to acceptance mode. For a fresh administrator, the real selected person registers/verifies through existing pages/mail from an admitted operator address, then signs in through existing login for their credential-valid restricted session; registration/verification alone issue no session, and pending status remains until provisioning. Read that same person's actual UUID/current access version through identity-authenticated `GET /api/v1/users/me`, then atomically bind the previously null pair in private operator config/evidence; no ID is guessed/forced. `admin-preview --observe` requires that pair and invokes existing `run --rm --no-deps api pnpm --filter @template/api admin:provision --user-id <selected UUID> --expected-email <actual expected email> --expected-access-version <version> --operator-reference <reference>`. Existing ADMIN instead follows the protected real-current-account check; ineligible candidate is not force-promoted. Authorized `admin-apply --apply ... --confirm-user <UUID>` repeats current preview eligibility and appends existing `--apply --allow-production`. After success **or lost reply**, observe the singleton provisioning receipt and current selected account before retry; if it committed, do not promote again. The person reauthenticates and rereads `/users/me`; require same ID/email, ACTIVE ADMIN and the real returned new accessVersion, then atomically rebind private config/current-authority evidence. Do not infer the increment or parse an absent CLI field: existing CLI PROVISIONED output contains no version. Preserve the original preview/before version in the actual receipt. Open-traffic cross-checks this current pair and receipt. No seed/account-creation SQL supplies an administrator.
4. Target acceptance uses the designated real operator-controlled inbox and permitted acceptance identity/data scope. Observe actual verification and recovery inbox receipt, correct HTTPS origin/path, successful one-time action and rejected reuse; authorized and revoked/non-admin route/HTTP outcomes; approved catalog-backed submission/order/report print when separately authorized; exact cookies/CSRF and sanitized logs. Store evidence references/classifications/request IDs, never message bodies/action URLs/cookies. Configuration, provider ACK, acceptance503 bypass and a successful CLI do not prove these observations.
5. `restart --apply ...` is admitted only from recorded OPEN or verified ACCEPTANCE, with exact complete compatible migration ledger, matching previously running images/services and no failed/pending/uncertain transition. Capture that exact service state and selected retained fingerprints, place maintenance, stop only previously running API/web gracefully, then start those same services/images, verify health/fingerprints and reauthenticate authority before restoring prior acceptance/normal mode. It never starts an already stopped incident deployment or bypasses failed prepare. A separately authorized PG/container/host persistence demonstration records the same retained volume identity/data before/after; it is required evidence, not inferred from restarting API. Changed/unknown data or missing health leaves maintenance. `inspect --observe` reports uncertainty without clearing it; unresolved schema effects require the owning forward-repair/replacement-recovery procedure, not a restart/force bypass. Do not delete containers/volumes to simulate persistence.
6. `recover-replacement --apply ... --backup-id <UUID> --confirm-restore <exact triple>` is **only** for a separately authorized newly admitted replacement host/project with an empty, newly owned database. Refuse populated target, existing live namespace, wrong backup/hash/storage or missing recovery authorization; never overwrite original live DB. Recover private env evidence and **rebind** new machine/daemon/mount/operator/config references. Repackage the exact reviewed Git revision/lockfile/migration hashes on matching architecture with the recorded pinned base images; record the replacement's new image ID linked to that source identity, without assuming the old host's local image exists or promising bitwise equality. Recreate app role/database, restore with fixed transactional argv/ownership, compare pre-migration fingerprints/authority, then create a fresh verified checkpoint for this replacement before reviewed forward migrations/start acceptance. Keep original source/backup intact and measure recovery. Public HTTPS on the replacement requires actual DNS to point to it: while it remains maintenance/acceptance, obtain **separate explicit DNS-change authorization**, have the operator change DNS through their existing controls, observe the actual new binding/public certificate, then perform real HTTPS/mail/current-authority/restart/operator checks. No DNS/provider API is added. Only a subsequent separately authorized open-traffic action opens the replacement. Failure stays maintenance; no destructive live restore exists in this CLI.
7. `open-traffic --apply ...` requires recorded distinct backend/frontend/browser/local/ops requirements and engineering PASS, verified checkpoint/restore, correct current migration/image, actual target HTTPS/auth/mail/restart/backup/operator evidence and explicit release/cutover authorization. Evidence references must identify real observed outcomes; absence is UNPERFORMED. Revalidate current health/authority and observation source revision before changing to normal mode. Atomically update active release pointer/state OPEN only after the mode reload succeeds; preserve the old release manifest/checkpoint. Install/observe the scheduled backup after the first successful opening. Failed/unknown opening never emits release-complete and never triggers guessed repeat mutations.
8. Named operator demonstrates service status/start/stop, migration inspection, restricted provisioning, SMTP diagnosis/inbox confirmation, backup/restore/retention/scheduler inspection and incident maintenance/replacement recovery from the implemented runbook. Actual host/domain/SMTP/admin/mount/authorization values remain required runtime inputs. No infrastructure procurement, real mail, promotion, backup, migration, restart or deployment occurs during SDD.

### O13.7 — Concrete verification, ownership and task handoff

Unit cases cover missing/unknown fields; wrong environment/host/daemon/revision/digest; unsafe env/path/secret permissions; duplicate argv/no-apply/no-observe; public API/domain/calendar/proxy/SMTP mismatch; no secret in preview/error; exact Caddy modes/CIDR refusal; run lock; failed/unknown transition; all backup retention/promotion/containment rules; scheduled authorization isolation. Poison a release `.env` and inherited `COMPOSE_ENV_FILES`, `COMPOSE_FILE`, `DOCKER_CONTEXT`, `DOCKER_HOST` to prove they cannot change selected paths/variables/endpoint. Assert zero spawn/write on preview/refusal and that closed actions cannot express reset/live overwrite. Doubled runner tests are not database/HTTPS/mail evidence.

The isolated integration test explicitly owns all containers/networks/volumes/temp files. It runs only with `P08_OPERATIONS_ISOLATED=1` and refuses a remote daemon or non-test resource prefix. Its programmatic test context uses private loopback ephemeral ports and Caddy `tls internal` with that run's CA trusted by its own client; no insecure client TLS and no public ACME/domain/provider contact. This exception cannot be selected by target CLI/config. Test real image build/no-secret/no-test output, Compose raw dollar/quote preservation and poisoned-env exclusion, only intended ports, healthy dependency/start failure, nonsuperuser DB ownership, fresh/pending populated migration success versus failed/diverged/missing-populated-ledger refusal, maintenance/acceptance/normal modes and rejected reload preserving previous config, actual custom binary dump/restoration/table fingerprints with Unicode/newlines/nulls, corrupted/failed transfer/restore refusal, retained-volume restart, interrupted/partial cleanup and unchanged source. Failed prepare followed by scheduled backup/restart must start no service; test stopped-state preservation and failed daily safe availability recovery separately. Provisioning proof includes registration0 → verified1 → preview/apply1 → protected current ACTIVE ADMIN2 observation/rebinding, plus lost-reply receipt observation without repeat promotion. Reuse T010/T024/T025 and existing provisioning HTTP/service cases for real legacy/domain/current-authority/SMTP proof; do not fabricate domain histories or claim local CA/captured mail as public HTTPS/inbox acceptance.

Future local commands after the proposed files exist:

```sh
node --check scripts/operations/release-config.mjs
node --check scripts/operations/backup.mjs
node --check scripts/operations/operation-runtime.mjs
node --check scripts/operations/operations-records.mjs
node --check scripts/operations/release-lifecycle.mjs
node --check scripts/operations/release.mjs
node --test --test-concurrency=1 scripts/operations/release-config.test.mjs scripts/operations/operations-records.test.mjs scripts/operations/backup.test.mjs scripts/operations/release.test.mjs
P08_OPERATIONS_ISOLATED=1 node --test --test-concurrency=1 scripts/operations/release.integration.test.mjs
pnpm --filter @template/api test:integration src/operations-readiness.integration.test.ts
pnpm format:check
pnpm build
pnpm verify:build-output
git diff --check
```

The integration owner creates its private fixture config/Compose override and invokes actual `docker compose ... config --quiet`, image build, Caddy validate/reload and `systemd-analyze verify` only where available. Missing Linux/systemd validation blocks that specific operational proof; a macOS Docker run cannot certify timer installation. No target values or secrets are pulled from developer `.env`. After ops construction, refresh the complete applicable O12 exit and separate requirements/engineering/docs reviews before the observed release gate.

Preserve T001–T048 IDs/progress. Append bounded construction tasks T049 runtime config/preview; T050 packaging/Compose/Caddy; T051 backup/restore/scheduler; T052 lifecycle/upgrade/admin/recovery transitions; T053 runbook/full ops acceptance. Dependency order is **T047 → T049 → T050 → T051 → T052 → T053 → T048**, regardless of stable numeric order. T048 remains actual separately authorized target admission/observations/release acceptance, not completion of a planning checklist. Real runtime values may be missing while the construction briefs are design-ready; those values and action authorization gate execution against any real target.

## Design Readiness Evidence

| Operation                     | Independent design                                                                                                       | Remaining dependent gate                                                                                                                      | Actual evidence produced by PLAN                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| O09 configuration/health/mail | PASS: exact existing interfaces, narrow SMTP correction, tests and observation sequence                                  | Actual SMTP/origin values and target/inbox authorization; selected one-hop proxy/calendar fixed by O13                                        | Source/config/manifest inspection; no configuration, HTTP or mail check executed                                                                     |
| O10 migrations/bootstrap      | PASS: immutable migration history, fresh/populated fixtures, exact existing restricted CLI                               | Target identity, backup checkpoint, admin candidate/operator and migration/provisioning authorization                                         | Source/SQL inventory/argument parser and existing test inspection only                                                                               |
| O11 backup/restore            | PASS: two owned containers, fixed tool argv, archive transfer, fingerprint/restart/cleanup and negative cases            | Actual approved encrypted off-host mount/operator/authorization and observed recovery; O13 policy fixed                                       | Installed Testcontainers signatures and PostgreSQL 18 option documentation checked; no dump/restore run                                              |
| O12 full regression           | PASS: discovered owners, complete 102-route family/Appendix B coverage, real-boundary and ordered exit design            | Actual implementation/prerequisite acceptance, Docker/Chromium/PDF tooling and executed results                                               | Fresh static page inventory 102=84+18; harness/scripts/source inspection only                                                                        |
| O13 cutover/handoff           | PASS: concrete Compose/Caddy/SMTP/calendar/package/CLI/backup/scheduler/upgrade/recovery design and bounded task handoff | Runtime admission BLOCKED until actual validated host/domain/account/storage inputs and action authorization; target observations UNPERFORMED | Source/installed Next/official Docker/Caddy/PostgreSQL/systemd/pnpm/Node documentation checked; no production artifact, command or release execution |

TASKS must turn these sections into bounded briefs naming exact proposed/existing files, dependencies, current interfaces, isolated checks and operational admission. Actual runtime values are supplied and validated before their operations; they are not missing architecture decisions. This artifact changes no task/checklist completion marker and performs no construction or target action.

### O13.8 — Private observation, state and recovery protocols

This owner-authorized Group 5 technical amendment fills operator/adapter interfaces;
it preserves D-011, all closed actions, the strict release.json fields, application
APIs and target authorization gates. Values below are schemas and derived locations,
not configured target facts. No action executes during this amendment/ANALYZE.

**Pure interfaces.** Keep the O13.2 exports. Add only these shared validation seams
in `release-config.mjs`: `deriveReleasePaths(config): ReleasePaths`,
`validateReleaseEnvironment(config,runtimeEnv,postgresEnv): PrivateEnvironment`, and
`assertResourceOwnership(observation,expected): void`. They perform no I/O.
`PrivateEnvironment` holds the literal records and decoded application/bootstrap
passwords only in private memory. It is never serialized to plans/errors/evidence.
`ReleasePaths` has base/release/current/state/config/Caddy/lock/docker-config paths,
plus the private filenames below, derived only from the validated environment and
revision. The operational input/output types remain local readonly JSDoc types;
use current TypeScript with `--allowJs --checkJs --noEmit` for the production mjs
owners without a new manifest/config/dependency.

| Private owner                                                 | Exact protocol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/var/lib/oriental-shoes/<environment>/operator-session.json` | Root-owned regular nonsymlink0600, max65536 bytes; strict `{version:1,accessToken:string}`. Nonblank bounded JWT text with no controls; no password/refresh cookie or action URL. The real selected operator obtains a fresh token through the existing sign-in flow and supplies this file privately. CLI never logs, echoes, copies into backups or automatically renews it. Missing/expired/mismatched session blocks only protected observations, not static preview/package/fresh prepare.                                                                                                                                                                                                                                                                                                                                        |
| Same state directory, `operator-evidence.json`                | Root-owned0600, max1MiB; strict `{version:1,scope,environmentId,projectName,releaseRevision,machineIdSha256,dockerEngineId,applicationImageId,migrationSetHash,observations}`. Each observation is strict `{status,reference,observedAt,operatorReference}`. Status is PASS, UNPERFORMED or FAILED; the other fields are strings or null. PASS requires all three nonnull, canonical UTC ISO time not in the future, safe reference<=128 and matching configured operator. Closed observation keys: backend, frontend, browser, localOperations, requirementsReview, engineeringReview, targetHttps, targetMail, targetAuthority, targetDatabaseRestart, targetRestore, targetBackup, operatorTraining, scheduledBackup. No generated PASS/defaulted observation. Exact identity/hash binding is mandatory; unknown/missing keys fail. |
| Same state directory, `state.json`                            | Atomic0600 version1 state; strict environment/project identity, phase, active/candidate package records or null, Caddy mode, current service snapshot, checkpoint ID or null, authenticated authority record or null, administratorReauthenticationRequired boolean, lastTransition or null, lastFailure or null, updatedAt. Phases: UNPREPARED, PACKAGED, MAINTENANCE, ACCEPTANCE, OPEN, UNCERTAIN. Candidate packaging never overwrites active identity; active changes only after successful opening. Unknown/failed lifecycle state refuses restart/scheduled backup.                                                                                                                                                                                                                                                              |
| Same directory, `releases/<revision>.json`                    | Atomic0600 package record: version/environment/project/revision, runId, packagedAt, sourceSha256, lockfileSha256, migrationSetHash, ordered `{name,sha256}` migrations, table inventory per completed prefix, build public API origin, immutable application image ID/architecture, unique imageReference/buildId, pinned base references and observed base IDs. Git revision/source/lock/migration identity is checked, not inferred from an image tag.                                                                                                                                                                                                                                                                                                                                                                               |
| Same directory, `runs/<run UUID>.json`                        | Atomic0600 operation receipt; version, runId, action, environmentId, revision, startedAt/completedAt, phase, outcome, authorizationReference, prior/next state references, safe stage outcomes and remaining gates. No commands, private environment, bearer, row content or child stderr. Completed/awaiting-operator/failed/uncertain outcomes are distinct. Observe/preview never writes this file or a lock.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Same directory, `run.lock`                                    | Exclusive0600 record `{version:1,runId,pid,bootId}`. One owner across prepare/internal checkpoint helpers; nested helpers reuse that held lock, never reacquire/delete it. Only the matching current-run inode/content is unlinked in finally. An unexplained existing lock is refused; no stale-lock force action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `<backupMountPoint>/.storage-identity`                        | Root-owned0600 strict `{version:1,identity,mountSource,approvalReference}` matching the three configured storage/approval inputs. Actual findmnt target/source/type/device proves mount presence/independence; approval is operator attestation of encrypted/off-host/access policy, not a generated boolean or claimed cryptographic proof.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `<backupDirectory>/<environment>.index.json`                  | Atomic0600 strict version/storage identity plus entries with backup UUID, environment/project/scope/revision, kind/businessDate, manifest SHA256, verified/completedAt and protected release/open receipt references. Entry paths derive from validated UUIDs. Each environment owns its own index, avoiding cross-environment update races. Retention touches only that index's eligible owned entries.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `<backupDirectory>/<backup UUID>/manifest.json`               | Strict version1 private bundle record: scope, source environment/project/machine/engine, kind/businessDate/run/operator/authorization/storage references, source package identity, FRESH_EMPTY or MIGRATED classification, archive bytes/SHA256, exact private file-name/SHA256 list, before/restored/restarted fingerprints, verified flag/completedAt and measured durations. Archive begins as exclusive database.dump.partial and becomes database.dump only after all verification/hash/mount checks. Private copies are runtime.env, postgres.env, release.json, mode.caddy and package.json; no session token or operator evidence is copied. Unverified bundles cannot enter verified retention.                                                                                                                               |

Package/state snapshots are private bounded records, not a generic workflow engine.
A service snapshot records the exact named service's captured container ID, image ID
and previously running boolean; stopped services are not silently started. An authority
record is `{userId,email,accessVersion,observedAt,source:'users-me',provisioningReceipt}`;
receipt is null for a verified pre-existing administrator or its actual singleton
`{targetId,beforeVersion,afterVersion,occurredAt,operatorReference}`. A transition is
`{runId,action,stage,startedAt,completedAt,outcome}`; failure is only
`{runId,code,stage,occurredAt}` with fixed classifications, never arbitrary exception text.
All JSON boundaries reject duplicate keys before object parsing, controls, unknown
keys, oversized input/depth and invalid references. Dates/hashes/counts are checked.
Fingerprint row counts use decimal strings, preserving values beyond JS safe integers.

**Authenticated observation and read-only ownership.** The live CLI reads the private
session only for an admitted protected operation. Through the captured API container,
run a fixed Node program, passing the bearer solely on stdin. It calls actual
`http://127.0.0.1:4000/api/v1/users/me` (no redirects, bounded timeout), parses the
existing `successEnvelopeSchema`/`authUserDataSchema` from the compiled installed
`@template/contracts`, and privately returns only id/email/role/status/accessVersion.
The parent checks the actual selected identity/email/version and current ACTIVE ADMIN
where required. This private-network observation does not prove public HTTPS, cookie
or inbox acceptance. No token argument/environment/public output or new endpoint.
Preview performs zero spawn/write/network. Both observe actions are read-only:
no lock/state/config/evidence write, promotion, Caddy change or auto-binding occurs.
Their OperationResult evidenceReference is null unless referencing an existing record;
an ephemeral observation is never described as a stored acceptance receipt.

**Bootstrap binding.** A fresh selected person registers/verifies/signs in through the
existing flow. The operator initially binds the actual UUID/version in release.json
from that person's real authenticated identity response, then admin-preview observes
and compares it. This is runtime input, never guessed by the CLI. admin-apply first
observes account and singleton, then invokes the existing eligible preview/apply only
if no committed matching promotion exists. After a committed/lost-reply promotion,
record the real receipt and return ACCEPTANCE/AWAITING_OPERATOR while the pre-promotion credential does not meet the CLI freshness gate; the
existing identity endpoint may still report current database authority. Do not invent the increment or repeat promotion.
The operator reauthenticates and replaces operator-session.json. A separately applied
same confirmed admin-apply observes the existing receipt plus fresh `/users/me`,
atomically rebinds config/current authority to that actual version, and performs no
second promotion. A pre-existing actual ACTIVE ADMIN is verified/rebound under the
same applied confirmation without creating a provisioning receipt. Read-only preview
never performs either private write. Every rebind compares current config identity/
hash before atomic replacement and retains the original receipt's before version.

**Release evidence.** open-traffic requires all listed observations except scheduledBackup
to be PASS, bound to the exact current package/target/migration identity. Those external
records are explicitly operator attestations with actual references, not proof derived
from a marker file, provider ACK or local test fixture. Fresh internal live/ready/web,
current protected authority and actual valid public TLS are independently rechecked.
HTTP503 to the host's non-operator peer is valid in acceptance mode and does not prove
API routing; targetHttps records the real admitted operator's routing/cookie evidence.
After normal reload, verify public routing/health before recording OPEN/current; on
failure restore the prior accepted mode and do not publish OPEN. scheduledBackup is
observed after first opening/timer installation and remains required for T048's final
release acceptance. No CLI operation alone claims the entire release complete.

**Source/backup/replacement identity.** Source package admission requires a clean exact
Git revision and unchanged source/lock/migration hashes, never the current dirty working
tree. Integration may commit a snapshot only in its private disposable Git fixture;
this is not a commit in the user's repository. Recovery selects an exact VERIFIED live
bundle UUID, verifies its membership in the source environment's root-owned index and
all hashes/storage facts, and requires a distinct machine/engine/project tuple with
an empty new namespace. Source revision/database/application-role identity must match
the reviewed recovery inputs. New host/daemon/mount/operator/config paths are explicitly
rebound; old private config is evidence, never blindly installed. New checkpoint entries
belong to the replacement's index. Original source/bundle is unchanged. Public DNS and
real mail/operator observations remain explicit later handoffs; no DNS API or live restore.

### O13.9 — Adapter and isolated-evidence boundaries

The concrete context constructor is `createOperationContext(config, options)` in
`release.mjs`. Options fix runId/deadline and explicit scope; only a
programmatic isolated scope accepts a private canonical temporary root, requires
the explicit isolated guard, and uses the current uid. The CLI passes live scope
explicitly regardless of inherited environment. Construction performs no writes.
Its private file adapter reads bounded nonsymlink single-link0600 files, writes
bounded JSON by exclusive0600 temporary file/fsync/rename in an admitted0700
directory, and acquires an exclusive0600 run lock. Lock release compares captured
inode/device/run content before unlinking; another or unexplained lock is refused.
The same held lease is passed to nested operations. No adapter marks an unvalidated
state/evidence record accepted: owning lifecycle readers apply strict record schemas.
T049 tests exercise these primitives on owned temporary files; T050–T052 consume
them for their fixed package/lifecycle records. This constructor is the shared
OperationContext seam, not an additional CLI action or policy injection interface.

`OperationContext` fixes validated config/paths, scope live or isolated, run UUID/deadline,
clock, captured resource registry and primitive file/process adapters. Production uses
actual Node fs/child_process/streams; unit doubles replace only those boundaries, not
prepare/backup/provisioning policy. Metadata subprocess output is bounded1MiB; archives
and table COPY are streamed/hashes counted without row materialization. Fixed executable/
argv arrays never include SQL passwords, bearers or runtime env values. Private SQL and
credential input use stdin/private files. All child stderr stays private and only fixed
stage/code classifications leave main. Before each consequential stage recheck machine/
engine/resource/file identity; uncertain external outcomes must be observed, not guessed.
Rejected Caddy reload restores disk and verifies prior active mode; timeout/unknown reload
is reconciled through container-loopback admin observation and known prior-mode recovery,
otherwise state remains UNCERTAIN and no OPEN/restart/timer success is published.

Live paths/ownership are canonical Linux/root/private; admitted Docker endpoint is the
local rootful Unix socket, independent of inherited contexts. Child env uses only fixed
safe PATH/LANG, run-owned root-private Docker config, the admitted Unix endpoint, public
Compose interpolation/path values and COMPOSE_DISABLE_ENV_FILE=1. No inherited credentials,
COMPOSE_* or proxy values are copied. API/bootstrap raw files have separate allowlists;
validate four distinct non-placeholder auth secrets using current32-character rules,
fixed production/SMTP/calendar/proxy/shutdown/origins, selected canonical encoded DATABASE_URL
and distinct application/bootstrap credentials. Existing compiled API config independently
checks its remaining actual options before startup. Add no dependency or app-config import.

The isolated context is programmatic only, guarded by P08_OPERATIONS_ISOLATED=1 and
captured p08-ops-test-<run> Docker resources. Its canonical private temp root/current uid
and deployment project may differ from live derived paths/root ownership; every such
path/resource must remain within that exact run. The target CLI always constructs live
context and cannot select this exception via argv/config/environment. Isolated bundles/
evidence are scope-labelled and never accepted as live target evidence or recovery input.
Real archive, SQL, TLS, packaging and owned cleanup are exercised; mount/encryption/actual
operator approval remains an explicitly simulated storage boundary plus separate real
mount-guard unit cases, never an asserted off-host target proof. Local TLS uses only the
run's trusted internal CA; no insecure flags or public ACME/provider traffic. Syntax-check
systemd units in an owned appropriate Linux environment where available; actual installed
host manager/timer outcomes remain T048 observations. Missing required local checks stay open.

Construction order remains T049→T050→T051→T052→T053, with each batch's current source and
both review axes checked before completion. No T048 target action, user-repository commit,
push, purchase, real mail, deployment, timer install or cutover is authorized here.

#### O13.4 build-environment handoff correction

Current turbo.json passes through DATABASE_URL and NEXT_PUBLIC_API_URL but does not
pass ORIENTAL_DEPLOYMENT_BUILD under its default strict environment. T050 uses
`pnpm build --env-mode=loose` inside the isolated Docker builder only so the accepted
standalone branch reaches Next. The installed Turbo help confirms this flag; no
root manifest/Turbo configuration changes. The builder contains no runtime secrets
and uses only the synthetic database URL/public origin. Ordinary local build remains
unchanged. This command correction does not relax runtime child environments.

#### O13.4 Caddy verification seam

`release.mjs` exports the actual `changeCaddyMode(context, mode)`
operation for its T050 isolated integration checks and later internal lifecycle use.
It is not a CLI action or injected policy double. It admits the actual namespace,
requires the captured running Caddy identity, validates/reloads the candidate, and
restores and reloads the previous accepted file on failure; an uncertain restoration
returns RELEASE_STATE_UNCERTAIN. The isolated test exercises the same implementation
with owned Docker resources and trusted internal CA. No mode/host bypass flag is
accepted by main. All fixed O13.4 routing and target gates remain unchanged.

#### O13.4 immutable-runtime pnpm invocation

The actual reduced image retains all required dependencies but not every development
workspace manifest. With pinned pnpm11.17.0, an unqualified pnpm exec/run attempts
a new install and fails noninteractively. One-off runtime pnpm invocations therefore
use the fixed `pnpm --config.verify-deps-before-run=false ...` prefix before the
existing database script/exec arguments. This disables pnpm's automatic dependency
repair only in the already-built immutable runtime; packaging still performs the
frozen full install and verifies emitted artifacts/imports. It changes no manifest,
lock, package script or migration behavior. A network-disabled actual image check
verified Prisma7.9.1 loading with this prefix. T050 tests it; T052 consumes the exact
qualified one-off commands. No runtime install is permitted.

#### O13.4 captured Caddy execution and recovery detail

The mode seam needs no application-image argument: Caddy execution uses its exact
captured running container ID. Namespace observations clear stale entries and capture
ID, role, immutable image and running state; before each consequential Caddy command,
reobserve and reject disappearance/replacement/stopping/image drift. Execute fixed
`docker exec <captured ID> caddy ...` arrays, never resolve the service name again.
After reload, compare canonical adapted JSON with actual container-loopback admin
configuration. Restore disk and prior active configuration on any transition failure;
restoration failure or unobservable prior active state is RELEASE_STATE_UNCERTAIN.
When prior disk/active state is freshly proven restored, report RELEASE_CHECK_FAILED
for the attempted transition, including a reconciled lost reply. Never publish OPEN.

The isolated regression may inject a fault only at a primitive I/O boundary after
real validation (corrupt the owned candidate before actual reload), or lose a real
reload response. All Caddy validate/reload/admin/TLS observations still execute
against the actual owned container; no successful process/HTTP response is fabricated.
Test cleanup captures exact created container IDs, volume names/network IDs and image
IDs at creation, reinspects full ownership before deletion, and lists only to detect
leftovers. Bounded cleanup of a captured verifier has its own30-second deadline after
the work deadline; this permits only owner-verified cleanup, never continued work.

#### O13.4 immutable package attempts and failed-candidate cleanup

Every package attempt allocates a new build UUID even when a programmatic test
reuses its operation context. Build only `<project>-app:<revision>-<build UUID>`;
never retag a previously published reference. Record buildId, imageReference and
immutable applicationImageId together in the private package record. Add fixed
image labels for environment/project/scope/run/build and role application-image,
besides the source revision. These are nonsecret derived identities, not new inputs.

Build/runtime/source/admission verification must finish before replacing the latest
private package record. A failed attempt leaves the prior record and its tagged
image intact. Reconcile only the exact new candidate reference after a lost reply;
remove that candidate only after checking actual engine/machine identity, immutable
image ID, full environment/project/scope/run/build/revision labels and absence of
unrelated tags. Never force image removal or prune other images. Cleanup has its
own bounded30-second window; unresolved build/cleanup outcomes remain uncertain.
Successful package references remain retained for active/checkpoint consumers; no
new image-pruning CLI action is added. T052 consumes buildId/imageReference as part
of the fixed package identity and keeps active identity unchanged when packaging
a candidate. Same-source rebuilding still makes no bitwise-identity promise.

Verifier creation uses a deterministic run-owned name inside its cleanup boundary.
After a lost create reply, bounded exact-name observation captures the actual ID
before image/label-verified cleanup. Caddy publication cleans its owned partial in
finally even when writing/fsync fails, allowing known-prior restoration; failure to
prove restoration remains RELEASE_STATE_UNCERTAIN.

### O13.10 — Shared runtime and concrete private-record/backup handoff

The actual T050 source now contains reusable physical admission, file/lock, source,
Caddy and subprocess operations. T051 extracts those unchanged responsibilities
to `scripts/operations/operation-runtime.mjs`; release.mjs keeps preview/dispatch,
package publication and main, re-exporting createOperationContext/changeCaddyMode
for compatibility. Backup and lifecycle consumers import runtime directly, never
the CLI, so there is no runtime import cycle. No generic workflow framework or
policy callback is introduced. Runtime owns the actual primitive I/O adapters and
fixed host/namespace/source/Caddy guards; it adds openDockerStream(context,{argv,stage})
returning actual stdin/stdout, a checked completion promise and an owned cancel
operation. Archives/COPY streams stay binary/streamed; await pipeline and completion
together, cancel owned streams/processes in finally, and preserve nonzero/timeout
failures. Metadata remains bounded1MiB with private stderr and fixed safe environment.

`operations-records.mjs` owns pure strict parsers and readonly JSDoc types for the
private package/state/session/evidence/fingerprint/manifest/index protocols. It uses
built-ins and the existing bounded duplicate-key JSON reader, no new dependency.
Reject unknown/missing keys, controls, invalid canonical UTC/date/UUID/hash/decimal
strings and inconsistent nested identities. Package records now include the exact
T050 buildId/imageReference and machineEngineObservation (engine, architecture,
composeVersion, availableDiskBytes). Validate ordered unique migration checksums,
matching migrationSetHash, inventory cardinality/prefixes and pinned base identities.
State/evidence records are not proof of current health, authority or storage; every
operation still performs its stated actual observations.

`release-lifecycle.mjs` owns the fixed command workflows and state transitions. T051
adds runBackup(context,args) and installBackupTimer(context,args); T052 adds prepare,
admin-preview/apply, restart, replacement and opening there. It consumes runtime,
records and backup, while release.mjs dispatches only the closed authorized actions.
Missing later handlers continue to refuse; no successful stub is published.

**Context identity for repeated isolated invocations.** The operation runId/lease/
receipt UUID is distinct from a test fixture's resourceRunId. createOperationContext
accepts optional isolationId only in programmatic isolated scope (default runId);
canonical temp-root basename and project bind that isolationId. Existing primary
stack resources belong to resourceRunId/isolationId, whereas each temporary verifier
and backup receipt belongs to its actual operation runId. A new invocation may use
a fresh operation UUID against the same admitted isolated root/project. Live scope
accepts no isolationId/root/endpoint/clock override and main always selects live.
Isolated clock injection is a primitive business-date test seam only; physical
timeouts/deadlines remain real. Every input/backup path stays under the exact test
root, the actual local engine stays bound, and isolated records cannot become live
evidence. Test cleanup tracks exact created IDs with their actual owning run UUID;
project/scope queries detect leftovers only.

**Exact record keys.** All objects below are strict. Scope is live or isolated;
identities bind scope/environmentId/projectName. Hashes are64 lowercase hex, image
IDs are sha256 plus64hex, and byte/count fields are nonnegative decimal strings.

- ReleaseState: version, scope, environmentId, projectName, phase, active, candidate,
  caddyMode, serviceSnapshot, checkpointId, authority,
  administratorReauthenticationRequired, lastTransition, lastFailure, updatedAt.
  Active/candidate are PackageRecord or null. serviceSnapshot has exactly api/web/
  postgres/caddy, each null or {id,imageId,running}. Authority is null or the exact
  O13.8 users-me/receipt record. Transition/failure retain the O13.8 exact keys.
  Initial state is UNPREPARED with null packages/snapshots/checkpoint/authority and
  no claimed observations. Packaging a candidate never changes active.
- DatabaseFingerprint: classification (FRESH_EMPTY or MIGRATED), ledgerAbsent,
  tables (sorted {table,rowCount,sha256}), migrationFacts (ordered
  {name,checksum,finishedAt}), ownership ({databaseOwner,applicationRole,
  superuser,createDatabase,createRole,replication,tableOwners}). tableOwners is
  sorted {table,owner}. Source and restored/restarted facts must match exactly;
  database/table owner must be the selected nonsuperuser application role. Empty
  means no public base tables/ledger. A migrated source must match the actual known
  completed source-package prefix, with no failed/in-progress/rolled-back/unknown
  migration fact. The inventory includes the ledger once it exists; never SELECT
  a missing ledger. UTF8/session settings and table identifiers are validated.
- BackupManifest: version, scope, id, environmentId, projectName, kind, businessDate,
  runId, operatorReference, authorizationReference, storageIdentity,
  machineIdSha256, dockerEngineId, packageRecord, sourceServices, sourceCaddyMode, classification, archive,
  privateFiles, before, restored, restarted, verified, completedAt, durations.
  Archive is null until dumped or {bytes,sha256}; privateFiles are exact
  {name,bytes,sha256} entries for runtime.env/postgres.env/release.json/mode.caddy/
  package.json. Before is an actual fingerprint; restored/restarted may be null
  only while unverified. Durations has dumpMs/restoreMs/restartMs/totalMs, null until
  measured. VERIFIED requires all results/hashes, exact fingerprint equality and
  completedAt. No session/evidence token or row payload is copied.
- BackupIndex: version, scope, environmentId, projectName, storageIdentity, entries.
  Each entry: id, scope, environmentId, projectName, revision, kind, businessDate,
  manifestSha256, completedAt, verified, protectedForRevision, openedByRevision,
  openReceiptReference. Verified entries only; nullable protection/open references
  are checked together. Entry directories derive only from validated UUIDs.
  Preserve14 distinct successful daily dates and protected/latest predeploy entries;
  no deletion based on directory discovery or unverified metadata.

**T051 operation sequence and consumers.** Lifecycle obtains the one exclusive lease,
loads validated state/package and actual prior service/image/mode snapshot. Scheduled
daily refuses anything except healthy compatible OPEN/no failure before starting any
service; standing root/operator authorization does not require an interactive user
JWT to remain valid overnight. Manual incident/predeploy never grants recovery or
permission to revive stopped services. Lifecycle verifies maintenance, stops API/web
with15s grace and reobserves them stopped. It passes BackupContext = OperationContext
plus the validated current reviewed packageRecord, authorizationReference and actual prior sourceServices/sourceCaddyMode snapshot to
createVerifiedBackup; no injected prepare/backup policy method exists. Core backup
independently rechecks target/storage, actual stopped writers, source prefix/facts,
archive/hash/private-copy durability, actual distinct restore/restart and final
source/storage/hash identity before verified promotion. A new review package can
describe an older completed database prefix, so predeploy/recovery does not demand
future tables. Failed bundles remain unverified evidence and never enter retention.

Only lifecycle resumes a daily snapshot: previously running exact API/web images,
unchanged compatible ledger/source, passing live/ready/web, then the prior verified
mode. Previously stopped services stay stopped; predeploy stays maintenance/stopped.
Any failed dump/verification/retention or availability recovery returns failure even
when availability was safely restored. Unknown compatibility/health keeps maintenance
and records the fixed failure. Core helpers never start application services. Timer
installation requires standing authorization, healthy OPEN and a verified daily
restore demonstration, then exact template syntax/install/service observations.
Actual target installation/first scheduled success remain T048, not local proof.

T051 tests own all new runtime/record/backup files and rerun T050's complete isolated
stack after extraction. Add explicit Node syntax/strict-JSDoc checks for the new
owners and operations-records.test.mjs to the named unit command. T052 consumes the
same schemas/runtime; T053 documents and verifies all actually introduced owners.

The manifest sourceServices/sourceCaddyMode fields preserve the actual pre-quiesce
image/running/mode facts even when the reviewed candidate package is newer than
the deployed application. sourceServices uses the exact four-service snapshot type
above. Core reobserves stopped writers; a supplied snapshot is not permission to
start anything. This fills O13.5 source-image provenance, not an additional action.

An authority record binds the same selected user and may retain a historical
provisioning receipt whose afterVersion is at most the freshly observed current
accessVersion. Never rewrite that receipt to imitate later legitimate authority
changes; current HTTP/SQL authority is rechecked by the owning protected operation.

**T051 reviewed failure-path refinement.** Runtime adds apply-only
observeCaddyMode(context), which requires the existing lease, validates the captured
pinned Caddy identity and canonical current mode file, and compares adapted versus
actual loopback-admin configuration before returning normal/maintenance/acceptance.
Lifecycle compares this actual mode with state before quiescence; a disagreement
refuses before stopping writers. The bundle's mode.caddy copy renders this verified
pre-quiesce mode, rather than copying the temporary maintenance file.

Runtime observeCaddyResponse(context,expectedStatus) performs one bounded native
HTTPS GET `/` with configured hostname/SNI and valid TLS, no redirects, bearer or
response payload. Live uses the admitted public domain:443 with normal trust. Only
isolated scope discovers the captured Caddy's actual loopback-published443 and reads
its public local-CA certificate from that same captured container; it connects to
that loopback port with the configured hostname/SNI and explicit CA trust. No
insecure TLS, new config field, action or test result enters live evidence. Recheck
captured ownership before/after. Backup requires observed503 after maintenance and
before stopping any writer; a wrong/failed response leaves a recorded failure.

Retention first validates the complete current index and all candidate bundles,
then atomically/fsync publishes the retained-only index before deleting exact
validated obsolete paths. Failed publication deletes nothing. Interrupted deletion
may leave unindexed owned obsolete evidence, never an index pointing at a deletion
this operation has already begun. Such failure still fails the command; do not
rediscover/delete unindexed directories or claim cleanup success.

**T051 physical storage guard refinement.** In addition to observing the configured
mount point, observe actual findmnt for backupDirectory itself; a nested mount must
not redirect archives onto live storage. Runtime's pure
assertStorageMounts(config,mount,directory,live) consumes strict mountedFilesystem
results ({target,source,filesystemType,device}). Require mount.target/source to
match the approved configuration, directory's target/source/type/device to match
that mount, and live source/device to differ. The existing actual observer remains
the sole I/O producer; unit physical-response fixtures cover disappearance, nested
mount and same-source/device refusals without claiming real encrypted off-host
provisioning. T051's existing runtime and backup.test owners cover this guard.

**T051/T052 operation receipt and checkpoint release protocol.** Concrete strict
OperationReceipt keys are version, scope, environmentId, projectName, runId, action,
revision, startedAt, completedAt, phase, outcome, authorizationReference,
priorStateReference, nextStateReference, stages, remainingGates. Action is one of
the existing ten closed CLI actions; phase is an existing ReleaseState phase;
outcome is COMPLETED, AWAITING_OPERATOR, AWAITING_SCHEDULE, FAILED or UNCERTAIN.
Authorization is a nonnull safe reference; prior/next references are canonical
absolute private state-file paths. Stages are strict {stage,outcome} safe references;
remainingGates are safe references. Canonical UTC completion cannot precede start.
The pure records parser validates identity and all fields; lifecycle writes only
validated receipts. This fills the previously named O13.8 receipt protocol.

Index openReceiptReference is null or `run:<UUID>`. Daily entries have all three
protection/open fields null; predeploy protectedForRevision equals that entry's
revision. Before releasing any predeploy protection, retention reads exactly
paths.runs/<UUID>.json (never arbitrary paths), parses the receipt and requires
matching scope/environment/project/run/revision, action=open-traffic, phase=OPEN,
outcome=COMPLETED and completion after that bundle. Latest predeploy is retained
regardless. Missing/wrong receipt refuses pruning before index publication. T052's
successful open-traffic owner writes the receipt before marking older protected
entries openedByRevision/openReceiptReference; a failed/unknown opening never
releases protection. Existing T051 records/lifecycle/backup/tests own this consumer;
T052 consumes the fixed producer contract, with no new action or target authority.

### O13.11 — T052 concrete lifecycle composition handoff

T051's accepted runtime/records/backup primitives remain the foundation. T052
extracts the actual T050 package builder/verifier/owned-image cleanup into the new
`scripts/operations/release-package.mjs`, because both CLI package and replacement
recovery need it without a CLI/lifecycle import cycle. It exports
packageRelease(context) (exclusive-lease wrapper, existing OperationResult) and
buildPackageUnderLease(context) (asserts the existing lease, returns validated
PackageRecord after the same immutable build/verifier/publication protocol). It
never acquires/releases a second lease. release.mjs imports only handlers; lifecycle
imports the package owner directly. No generic workflow or injected policy callback.
T052 owns this extraction; T053 includes it in syntax/JSDoc/full review.

Runtime adds composeCommand(context,packageRecord,request), with request containing
fixed caller argv, stage and optional private stdin. It returns the existing bounded
{exitCode,stdout}; owning lifecycle alone interprets expected Prisma status1 after
actual SQL-prefix admission. Prefix/public environment are exactly O13.4, using the
immutable application image ID. Isolated scope additionally uses only the existing
private fixed `<isolated root>/compose.isolated.yaml` fixture override; live accepts
no override. Tool calls use closed run-owned deterministic names, no published ports,
no dependencies, explicit env/project/scope/run/operation-tool labels, the existing
API service and immutable image. Before cleanup reconcile only that exact name if a
create/run reply is lost, validate actual captured ID/image/full owner and engine,
then remove only that temporary tool. A failed/unknown migration result remains a
failed/uncertain lifecycle transition even if cleanup succeeds; never retry a schema
mutation from ambiguous stdout. No general shell/URL/command CLI is introduced.

Lifecycle's public fixed handlers are runPrepare(context,args),
observeAdministrator(context,args) (observe only, no lease/write),
applyAdministrator(context,args), runRestart(context,args),
recoverReplacement(context,args), openTraffic(context,args), plus the completed
T051 backup/timer handlers. Each apply handler holds one lease, loads strict package/
state and reobserves actual target. Internal prepare/checkpoint helpers reuse that
lease. Typed package/state/authority/evidence records come from operations-records;
unknown input is never promoted by a type assertion.

Prepare's local admission requires the first six explicitly bound observations
(backend/frontend/browser/localOperations/requirementsReview/engineeringReview)
PASS; target observations remain unperformed until actually provided. Missing first
state is admitted only as UNPREPARED, never OPEN. Ensure the root-owned base Caddy
file and maintenance snippet before initial service startup (existing live base
must equal the checked-in source; isolated base remains the known trusted fixture).
Existing running Caddy uses verified reload, never a restart. Start only owned PG
when needed, inspect bootstrap metadata and create absent app role/database with
private stdin and template0 as O13.6 specifies; existing safe role/database is
observed, never altered. Capture the stopped database fingerprint and internally
complete the predeploy checkpoint before migration. SQL prefix/inventory admission
precedes status; deploy/final status require0 and final exact completed SQL ledger.
Persist maintenance before schema effects; catch records failure and never starts
writers after failed/uncertain migration. Only successful complete ledger plus
actual live/ready/web permits API/web acceptance mode.

Admin observation runs the fixed compiled-contract `/users/me` program with CWD
/workspace/apps/api and bearer stdin, not argv/env. Restricted provisioning uses the
existing exact CLI flags and private raw API env. SQL reads only the selected user
and INITIAL_ADMIN singleton (receipt fields from current Prisma schema). Matching
committed receipt is reconciled before any repeat promotion, including lost reply;
a pre-promotion USER credential yields AWAITING_OPERATOR under the CLI freshness gate, not an invented new authority.
Only a fresh authenticated same ACTIVE ADMIN/current accessVersion allows atomic
config/authority rebinding; compare current config bytes before replacement and
retain the original before/after receipt. Preview writes nothing.

Restart requires healthy matching OPEN or verified ACCEPTANCE, no failure or pending
reauthentication, complete ledger, actual same services/images/mode and fresh current
authority. Stop/start only captured previously running app IDs, independently restart
captured PG with retained volume, compare stopped data/ownership/ledger before/after,
then live/ready/web/current authority and restore the prior mode. No failed prepare
or stopped incident is revived. Replacement requires initial UNPREPARED/no live
namespace, distinct source host/engine/project tuple, admitted source bundle/private
hashes and empty fresh target; repackage exact reviewed source on matching architecture
using buildPackageUnderLease, restore to the new owned PG only, compare retained
source facts before forward prepare/checkpoint and acceptance. Source configuration
is evidence, never installed over rebound target values. DNS/public acceptance remains
an explicit operator gate, with no provider API or automatic opening.

Open requires all O13.8 observations except scheduledBackup PASS and independent
fresh target TLS/live/ready/web/current authority, complete ledger/checkpoint and
reviewed image. After normal reload verify actual public routing before publishing
current/OPEN. Compare the existing current pointer/state before replacement; failed/
unknown publication keeps an explicit uncertain gate, never release-complete. A
successful applied opening writes the validated OPEN receipt, then marks only older
protected checkpoints with that run reference. The current release's own checkpoint
stays protected. No marker is written on failure. T048 separately observes first
scheduled success and final actual operator/release acceptance.

**T052 interrupted administrator rebinding.** Single-file atomic replacement is not
multi-file atomicity. Add paths.authorityRebind =
`<state>/authority-rebind.json` in both canonical live and isolated path constructors.
This root0600/max65536-byte strict journal has exactly version, scope, environmentId,
projectName, runId, userId, email, observedAccessVersion, configBeforeSha256,
configAfterSha256, provisioningReceipt, createdAt. It stores no credential. Records
exports parseAuthorityRebind(input,expectedIdentity), using the existing UUID/email/
version/hash/receipt/time rules and requiring a receipt's target to match userId and
its historical afterVersion<=observedAccessVersion. Presence (including malformed
or unreadable content) blocks dependent prepare/restart/open and steady daily/timer
admission; package, read-only observation and manual predeploy backup remain allowed.
Only same confirmed admin-apply may reconcile it through fresh SQL and authenticated
same ACTIVE ADMIN `/users/me`. No marker alone clears it.

Runtime exports replaceAdministratorBinding(context,{expectedConfigSha256,authority})
returning a validated ReleaseConfig. It changes only the already confirmed selected
administrator's current accessVersion pair; selected UUID/email and all target,
path, runtime and product fields stay fixed. Read canonical config via the explicit
root/current-uid private-file reader (not state-contained files.read). Validate
current content equals context.config, prepare exclusive0600/fsynced canonical JSON,
compare exact current bytes/hash immediately before rename under the held lease,
then rename/fsync parent. Refuse concurrent config drift without overwriting it.
A lost/error reply is reconciled as exact old/new/other hash, never a guessed write
or promotion retry; failed/unknown publication leaves the durable journal.

Applied rebinding order is fixed: (1) observe actual singleton/account and fresh
protected current authority; compute configBeforeSha256 from exact admitted on-disk bytes and configAfterSha256 from exact canonical replacement bytes; (2) durably
write the journal; (3) write state with administratorReauthenticationRequired=true,
observed authority/original receipt and pending transition; (4) compare-and-replace
config; (5) use an internal context copy with only its validated config updated,
same held lease/files/registry/paths, and reobserve actual authority; (6) durably
publish COMPLETED operation receipt then matching state with pending flag cleared;
(7) unlink only the exact matching journal and fsync its parent. If any earlier
step fails or is uncertain, do not attempt journal removal. Thus even a state-write
lost reply cannot bypass the independent durable admission barrier. If the final
unlink succeeds but directory fsync fails, prior config/state/receipt are already
durable; return UNCERTAIN, with no false release claim.

Reentry requires journal identity/user and actual config hash to equal its recorded
before or after hash. Reobserve SQL singleton and fresh same protected authority;
retain its original provisioning receipt. A legitimate later current accessVersion
may supersede a journal observation only through that same authenticated identity
and actual SQL; replace the journal with a new before/after pair, never rewrite the
historical receipt. Pre-existing actual ADMIN follows the same protocol with null
provisioning receipt and no promotion. Old/expired session keeps AWAITING_OPERATOR.
Inject failures before config publication, concurrent config change, config committed
but state/receipt failed/lost reply, and journal cleanup; assert no repeat promotion,
no dependent starts/open/timer, and successful exact-owner reconciliation. These
cases belong to T052's release/records unit and genuine provisioning integration
owners. T053 documents the journal as an incident gate, not a force-removal command.

**T052 Compose request ledger.** composeCommand's JSDoc request is a closed union:
`{operation:'validate-caddy'|'start-postgres'|'start-applications'|'start-caddy'|
'migration-status'|'migration-deploy'}` or
`{operation:'admin-preview'|'admin-apply',administrator:{userId,email,beforeVersion}}`.
It accepts no arbitrary argv, executable, URL, environment map or shell text.
Return is Promise<Readonly<{exitCode:number,stdout:string}>> with existing bounded
private-output rules. The implementation maps operations to O13.4 exact fixed argv:
Caddy validate one-off; PG up/wait120; API/web up/no-deps/wait120; Caddy up/no-deps;
API one-off pnpm/no-auto-install migration status or deploy; existing restricted
administrator preview/apply flags from the validated selected identity/current
beforeVersion and configured operator. Only admin-apply appends apply/allow-production.
Tool name/stage/role derive from this discriminant/run UUID. SQL secret stdin and
HTTP bearer stdin remain separate fixed native adapters, not Compose passthroughs.

**T052 primary storage/temporary ownership refinement.** Namespace admission verifies
the actual primary PostgreSQL container mount, not just a separately named labelled
volume: exactly one volume mount, Name=<project>_postgres_data,
Destination=/var/lib/postgresql, RW=true, with canonical absolute source. Runtime's
pure assertPostgresStorage(projectName,unknownMounts) owns this check; inspectOwnedNamespace
passes Docker's actual Mounts projection before registering postgres. This also
strengthens all existing backup consumers without another SQL owner or input.
Temporary operation-tool cleanup additionally requires exact io.oriental-shoes.run
for live scope; primary live resources intentionally have environment/project/role
ownership across invocations, but temporary tools always belong to one operation.
Existing T052 runtime/release.test owners verify foreign/bind/extra/readonly mounts
and wrong temporary-run ownership. T053 includes the strengthened admission.

**T052 read-only adapter exception.** The fixed admin-preview Compose operation is
also used by admin-preview --observe: it takes no lease and creates only its exact
run-owned ephemeral API CLI process/container, invokes the existing preview without
apply flags, and cleans only that captured tool. It never writes domain/state/config/
evidence or Caddy. All other Compose operations require the held lease. Preview's
eligibility is advisory and is rechecked by the existing transactional apply owner.

Runtime queryDatabase(context,{database:'application'|'postgres',sql,stage,readOnly?})
is the fixed native PG stdin adapter for internal source-owned SQL only, never a CLI
SQL/URL input. It verifies actual admitted PG identity/image/mount each time, uses
bootstrap/local fixed database targets and bounded private metadata output. Writes
require the held lease; readOnly=true is reserved for fixed administrator/account/
singleton observations, takes no lease and sets PostgreSQL default_transaction_read_only
in addition to the existing UTC/ISO/timeout session settings. Credentials occur only
in private initialization stdin. SQL errors are fixed classified outcomes, never
printed payloads. Observe Administrator rereads SQL/current protected identity to
reject authority races and always returns a non-persisted observation result.

**T052 administrator-state and public-target observations.** Administrator apply may
rebind a current selected actual ADMIN from healthy matching ACCEPTANCE or OPEN.
Initial promotion is allowed only in ACCEPTANCE; no failed migration/prepare is
repaired by provisioning. An UNCERTAIN administrator publication may reenter only
with its matching journal or an administrator-owned pending transition/reauthentication
flag, then actual complete ledger, healthy matching services, SQL singleton and
same fresh protected identity must still pass. An actually committed promotion
with the pre-promotion credential records ACCEPTANCE/AWAITING_OPERATOR, original receipt and pending
reauthentication; no CLI promotion repeats. Existing ADMIN does not create a receipt.

Runtime observeTargetTls(context,path,allowedStatuses) independently binds external
HTTPS to this admitted Caddy, not merely another healthy server for the same domain.
Paths are closed to /auth/login and /api/v1/health/live or /ready. Use valid hostname/
SNI and normal public CA trust. Compare the SHA-256 leaf certificate served through
actual host loopback443 by the captured published Caddy with the certificate through
public DNS:443; require equality, valid TLS, permitted HTTP status and unchanged
captured owner/image before/after. This needs no new public IP config/endpoint or
provider API. Isolated scope instead uses its actual loopback ephemeral443 and
trusted run CA for both observations and remains labelled local-only. Acceptance
may return503 to the host's non-operator peer; actual operator routing is separately
attested. Opening requires normal-mode200 for login/live/ready after reload before
OPEN/current publication. Certificate/binding failure retains a gate and cannot
become DNS/cutover proof. The read-only native TLS transport discards response bodies,
uses bounded requests and no redirects or insecure flags.

Namespace admission also checks actual service HostConfig.PortBindings: PG/API/web
publish none; only Caddy has exactly80/tcp,443/tcp,443/udp. Live bindings use those
fixed public host ports, whereas isolated bindings use only the owned loopback
fixture with ephemeral host ports. The pure runtime assertServicePorts(scope,role,
unknownBindings) consumes this physical projection; tests cover private-service
exposure and wrong/extra Caddy ports. inspectOwnedNamespace validates it before
registering any primary service, alongside the existing actual PG mount check.
These are concrete actual-target association checks within existing runtime/test
owners, not a new deployment topology or runtime input.

**T052 opening commit barrier.** Use existing state.json as the durable barrier and
final commit record; no additional opening journal or CLI action. Under the held
lease, verify all gates and exact prior pointer/state, then durably write
phase=UNCERTAIN with a pending open-traffic transition and preserved prior
active/candidate/checkpoint facts before normal reload or pointer changes. An
unproven barrier performs no cutover. After normal reload independently verify public
login/live/ready/current authority, compare-and-replace the exact owned current
symlink and fsync parent, write the validated OPEN receipt, then durably publish
matching state.phase=OPEN last. Committed OPEN requires matching state, current
pointer, receipt/run/package and actual routing/authority. Only afterward release
older checkpoint protection. Crashes before markers conservatively retain backups.

Caught failure attempts verified restoration of the prior pointer and acceptance
mode, leaves durable UNCERTAIN state, and never restores a previous successful OPEN
state over an interrupted opening. Pending/UNCERTAIN open-traffic state blocks
prepare, ordinary opening, restart, every backup kind and timer success regardless of
pointer/receipt appearance. Read-only inspection and separately authorized owning
incident repair remain available; no force action or inferred cutover retry. A lost
final-state reply may be reconciled only through exact expected state/receipt/
pointer plus fresh routing and authority; disagreement stays uncertain. Test failure/
death boundaries after barrier, reload, pointer, receipt and final state; no dependent
success or checkpoint release may accept partial publication. This ordering is the
engineering-reviewed smallest protocol using existing owners.

**T052 application database access before Prisma status.** Add internal closed
Compose operation database-access. It runs a fixed Node module program with CWD
/workspace/apps/api, imports the actual compiled @template/database, connects with
its raw private API DATABASE_URL, verifies SELECT current_user/current_database
against the configured application role/database, disconnects and emits only a fixed
success marker. No password/URL enters argv or output. All API tool operations use
that working directory; Prisma pnpm/filter behavior remains unchanged. Prepare
requires this exit0/marker after actual source-prefix/checkpoint admission and before
status1 can mean expected pending/no-table. Wrong credentials therefore refuse
before deploy, including literal quote/backslash passwords. This extends the
internal Compose request union, not the ten CLI actions or operator input schema.

**T052 persistent opening anchor.** ReleaseState additionally contains
openingRunId: UUID|null (initial null). It is the stable reference to the last
committed OPEN receipt while later backup/restart/timer transitions update
lastTransition. Final opening sets it to that opening's run UUID; other operations
preserve it. OPEN admission requires nonnull openingRunId and matching strict
runs/<UUID>.json action=open-traffic/phase=OPEN/outcome=COMPLETED, same identity and
active package revision, plus actual current pointer equal to that active release.
ACCEPTANCE may retain an older active/opening anchor while running the candidate;
first acceptance has no active/current/anchor. Pending opening barrier preserves
the prior anchor. This private pre-release protocol addition has no application API
or historical migration effect; T052 records/state fixtures and consumers own it.

**T052 protected API target association.** The fixed users-me child receives one
bounded private stdin JSON containing accessToken plus environmentKeys and
environmentSha256 derived from the already validated raw API env file. Keys are the
sorted existing allowed keys; hash is SHA-256 of canonical key/value JSON. The child
compares that hash against its actual captured API container environment before
HTTP, so an old container pointing at another database/config cannot prove this
configured target's authority. No environment value/hash/token is printed; output
is only a strict current identity subset or the fixed reauthentication-required
classification for HTTP401/403. Other HTTP/transport/contract failures fail the
observation. Response bytes/time are bounded and redirects refused. Pure records
parseAccountIdentity validates exactly id/email/role/status/accessVersion; its use
for SQL structure alone grants no authentication. The compiled wire-contract parse
and actual HTTP remain the authentication boundary. Parent rereads selected SQL
identity/receipt after the HTTP observation to reject races.

**T052 committed provisioning before fresh reauthentication.** ReleaseState also has
top-level provisioningReceipt: the existing strict singleton receipt or null,
observed from actual SQL independently of current authenticated authority. Initial
state is null. This preserves an actually committed/lost-reply promotion when the
existing identity endpoint can report current afterVersion even under the old credential; never label SQL-only accessVersion as users-me.
Pending state may retain the historical pre-promotion authenticated identity or null,
sets administratorReauthenticationRequired=true and keeps ACCEPTANCE; its top-level
receipt preserves the real before/after facts. Fresh authenticated ADMIN later binds
current authority with that same immutable receipt, using the existing durable
journal protocol. A nested authority receipt must equal the top-level receipt; a
pending old identity without a nested receipt is allowed and grants no new role.
Pre-existing ADMIN without its own singleton receipt uses null and creates none.
All dependent protected operations reread actual SQL and `/users/me`; neither receipt
slot alone proves current authority. Existing T052 records/lifecycle/test owners
cover the added private state slot, including lost promotion reply before new login.

**T052 shared checkpoint integrity reader.** T052 may narrowly reopen backup.mjs to
export its existing verifyBundleFiles implementation as
verifyBackupFiles(context:OperationContext,bundle:BackupBundle), with no policy or
archive-format change. Core backup/restore/retention call that same helper. Lifecycle
loads checkpoint through the strict owned index, compares actual manifest bytes/hash
and entry identity/revision/storage/host bindings, then calls this streamed physical
archive/private-copy verifier before relying on the recorded restore demonstration.
A prior configuration copy is historical recovery evidence, not the current authority
config. No session/evidence file is added to backup. This genuine second consumer
avoids duplicating binary/private integrity rules or rerunning a restore for every
protected observation. T052's existing tests cover the shared reader; T053 reviews it.

**T052 source-correct credential freshness.** Actual auth.middleware.ts resolves the
current database account behind a credential-valid JWT and intentionally ignores
its historical role for business authority. Access JWTs have no accessVersion
claim, and promotion does not revoke them. Do not change that application policy
or claim an old JWT is rejected. The CLI's explicit post-provisioning reauthentication
procedure is separate: the users-me child additionally imports the existing compiled
verifyAccessToken and, after a successful actual current-user response, requires
its verified credential role to agree with that current role. A pre-promotion USER
credential now reading ADMIN yields the fixed reauthentication-required outcome;
it never supplies ADMIN authority merely through its claim. A fresh ADMIN credential
still needs actual current ACTIVE ADMIN/version and selected SQL/receipt agreement.
No credential or claim values enter argv/output.

After this invocation commits or observes its just-attempted initial promotion,
always persist the actual receipt/pending flag and return AWAITING_OPERATOR. Do not
bind within that invocation. A separately confirmed admin-apply with the fresh
credential may perform the existing journaled bind; a matching committed receipt
is never promoted twice. Existing ADMIN without promotion uses the same actual
current-user verification. Test old credentials' identity validity separately from
CLI freshness refusal, then real login/new credential/current ADMIN2 and exact receipt
reconciliation. This corrects a disproved technical assumption in the handoff;
accepted product/auth behavior, account roles, endpoints and selected-person intent
remain fixed. Existing lifecycle/release integration owners cover it.

Opening's checkpoint-marker update remains under the same lease after final OPEN
state. If that post-commit metadata step fails before the command returns, compare
actual index bytes with the exact captured old/new versions: restore only the known
owned new version to its captured prior version, never another value. Then perform
the same verified pointer/acceptance restoration and leave UNCERTAIN state/receipt.
No retention deletion occurs in openTraffic. A lost final-state reply is reconciled
only at that final-write boundary: exact expected state/receipt/pointer plus fresh
routing/authority and successful file/parent fsync establish the commit before any
marker release. Otherwise restore known prior artifacts and preserve the uncertainty
gate. This distinguishes observed completion from guessed metadata retry without
a second generic workflow or force command.

**T052 restart mutation uncertainty.** After read-only admission, mark the maintenance
transition attempted before calling the Caddy adapter. Every failure after that point
uses existing failure containment and durable failure/UNCERTAIN publication even when
the adapter fails before returning. A failed or ambiguous reload cannot preserve a
healthy OPEN/ACCEPTANCE record. Pending opening refuses manual predeploy backup too,
before any mutation/publication: an incident backup must never overwrite the only
opening barrier. Rebinding-only incidents retain their existing manual backup policy.
Existing lifecycle/integration owners test both refusal and reload uncertainty.

**T052 replacement import protocol.** Rebound target inputs stay in their existing
canonical private paths. The operator transfers, without editing, the selected source
index to `<backupDirectory>/recovery-source/<environmentId>.index.json` and the exact
source bundle to `<backupDirectory>/recovery-source/<backup-id>/`. This import parent
is root-owned0700 on the already admitted backup mount; all source records retain
their original identity/storage reference. Parse the manifest first to derive its
source project identity, then strictly parse/bind the original index, verified entry,
source config/package/private-copy/archive hashes. Require same environment/scope,
reviewed revision/source/lock/migration hashes, pinned bases/architecture and database/
application role. Live requires both distinct machine and engine from the source;
isolated tests require a distinct owned project/root and explicitly prove only local
replacement mechanics on their actual daemon. Imported source index is never reused
as the replacement index or modified. Reuse verifyBackupFiles through a reader-only
context whose backupDirectory is this fixed import parent; it performs no deployment
observation or target mutation.

Before package/build or PG creation, refuse any state except initial UNPREPARED with
null active/candidate/checkpoint, and refuse every existing project-labelled container,
volume or network (including stopped resources). Require the replacement release
directory to be the clean exact reviewed source; never copy or install old private env.
Validate source inputs before creating anything. Reuse only this replacement
project’s already validated package record, or build under the same lease when none
exists; compare the produced immutable package with source evidence. Before namespace
creation, require image-bound local evidence. If the new package has no such evidence,
return AWAITING_OPERATOR/PACKAGED without state/services: the operator records existing
private evidence against that actual image and repeats the confirmed recovery. The
next invocation reuses the same admitted replacement package, never rebuilds endlessly
or accepts the original host’s image record. Publish MAINTENANCE before new
services; initialize only absent safe app role/database, prove FRESH_EMPTY immediately
before streaming fixed transactional pg_restore into captured owned PG with role set to
the application owner. Rehash the source archive/private copies after restore and
compare full stopped fingerprint with the manifest. Then call prepareUnderLease to
create the replacement's own verified checkpoint and forward/acceptance sequence;
its operator evidence must already bind the actual new packaged image. Existing
current ADMIN is observed by later admin-apply/fresh credentials; recovery never
promotes, binds authority, opens traffic or changes DNS. Receipt stages record source
backup UUID and elapsed recovery milliseconds. Any failure after new-target mutation
uses existing durable maintenance/uncertainty containment; no retry over nonempty
namespace or destructive restore is offered. Existing lifecycle/integration tests own
source-hash/wrong-scope/nonempty/namespace refusals and actual second-project restore.

**Group 5 full-regression HTTP diagnostic handoff.** The fresh full API run and
unchanged focused administration HTTP owner returned an unexpected404 at different
assertions (successful command and denied read). Reopen only that existing test owner
for bounded safe diagnostics: assertion context may include fixed method/path, status,
contract error code/request ID and content type, never response payloads/credentials.
Preserve every expected status, authority/no-write assertion and test. Inspect actual
Supertest listener/close and native HTTP response evidence. If it establishes the
same ephemeral-listener boundary as the existing sales HTTP owner, use its canonical
file-owned createServer(app), awaited loopback listen before tests, request(server)
and awaited close before DB disconnect, without transport retries, agent changes,
timeout increases or production edits. Otherwise retain the finding and return any
concrete production correction to its owning blueprint before repair. Group 5's final
verification consumes focused real HTTP and the complete unfiltered API run, plus
both independent review verdicts. Existing product/domain behavior stays fixed.
