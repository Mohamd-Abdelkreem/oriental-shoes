# Oriental Shoes

Oriental Shoes uses Next.js 16, Express 5, PostgreSQL and Prisma 7. Existing Arabic/RTL
operational screens and printing coexist with a real email/password account lifecycle.
Shared customers, incomplete sales drafts, catalog quotes, submitted sales orders,
approval decisions, customer-contact reapproval, official order printing, cutting/production
quality/packing/reinspection, warehouse receipt/delivery and administration/report
workspaces use the real API and database. Production routes have no operational
browser-fixture authority; development previews remain isolated. Local verification
and target release are separate. The existing [roadmap](plan.md)
owns phase scope, decisions, dependencies and current approval/client-input gates.

## What is included

- React 19 and Next.js App Router
- Axios credentialed transport with an in-memory access token
- React Query as the only browser session-state owner
- Express, Zod validation, OpenAPI 3.1, and Pino
- Argon2id passwords and purpose-bound JWTs
- rotating, one-time refresh sessions
- HttpOnly refresh cookie plus readable double-submit CSRF cookie
- console, Resend, and SMTP email delivery
- request IDs, URL credential sanitization, rate limits, and safe errors
- account states, one department per employee, and retained staff decisions
- shared Saudi customer contacts and owner-scoped incomplete sales drafts, with
  individual pieces, retained command receipts and explicit recovery states
- reviewed catalogs, exact decoration quotes, atomic numbered submission, returned
  corrections and paid-only updates with scoped sales histories
- initial approval/return, per-piece issue decisions, owner contact proposals and
  positive reapproval with retained history, exact cancellation totals and safe factory reads
- official order-paper aliases with current server authorization and approval metadata
- persisted exact-piece quality inspections, optional packing, correction cycles and
  atomic issue reports with private command recovery
- unit tests, disposable PostgreSQL Testcontainers integration tests, and a
  real-browser staff/customer, seven-type workflow, warehouse, administration and printing harness
- existing Oriental operational screens, dialogs and print surfaces to preserve

## Engineering and phase delivery

The repository includes a populated [constitution](.specify/memory/constitution.md),
[agent instructions](AGENTS.md), [engineering guides](docs/engineering/README.md),
client command adapters and project-owned template overrides. These instructions
travel with the checkout; they do not require Spec Kit or Docs reinitialization.
Keep the existing `plan.md` instead of generating another roadmap. This setup does
not approve or implement its phases.

Use [phase delivery](docs/workflow/phase-delivery.md) and the
[copyable requests](docs/workflow/prompts.md) to select one roadmap phase and its
matching feature under `specs/`. That feature's `plan.md` is technical design, distinct
from the root roadmap. Preserve accepted decisions, task IDs, existing UI and current
client-input status; reuse real auth/account and the existing database foundation.

[Implementation handoff](docs/workflow/implementation-handoff.md) assumes a model
with limited reasoning/context will implement each phase. Plans must fix operation
interfaces/algorithms and applicable data/HTTP/UI/cache decisions; tasks supply bounded
briefs, source references and concrete test expectations. Missing material decisions
block dependent code work. Requirements quality, implementation readiness, executed
tests, backend acceptance and release are separate claims.

The [profile walkthrough](docs/engineering/integration-walkthrough.md) traces a real
existing request across the stack. Operational order flows are not claimed API-backed
by that example. Read the current source and roadmap alongside the guides; historical
audits and policy adoption do not certify all existing code as compliant.

## Local setup

Requirements: Node.js 24, pnpm 11, and Docker (or PostgreSQL 18).

Install dependencies and create both environment files for a fresh checkout. Preserve
existing environment files when the checkout is already configured.

Unix/macOS:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

PowerShell:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Replace every `AUTH_*_SECRET` placeholder in `.env` with an independent
random value of at least 32 characters. Development and tests default to
`EMAIL_PROVIDER=console`, which writes complete HTML previews beneath the
workspace-root, Git-ignored `.local-emails` directory, requesting owner-only
filesystem modes where the platform supports them, without making a provider
network call. Open the newest `.html` file and click its verification or reset
button. The API log reports the preview file path, not the link or token.

Start the database, deploy the migration, and run both applications:

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev
```

For a fixed build that stays running while source files are edited, stop any
existing `pnpm dev` process using the same ports, then run from the repository
root:

```bash
pnpm build
pnpm start
```

`pnpm preview` runs those two commands in sequence. `pnpm start` waits for
PostgreSQL, applies pending migrations, and starts the compiled API and Next.js
server without file watching. Source changes appear after another build and
restart. Ctrl+C stops the API and web servers; PostgreSQL remains running.
On Windows, press Ctrl+C again if Turbo stays at `tasks shutting down`.

If port `5432` is already owned by a local PostgreSQL installation, choose a
free `POSTGRES_PORT` in `.env` and use the same port in `DATABASE_URL` before
starting Compose. A healthy container cannot make the API ready when the host
URL resolves to a different PostgreSQL server.

The local topology uses `localhost` consistently:

| Service | URL                            |
| ------- | ------------------------------ |
| Web     | `http://localhost:3000`        |
| API     | `http://localhost:4000/api/v1` |

`NEXT_PUBLIC_API_URL` is validated at module load and has no silent fallback.
If `apps/web/.env.local` changes, restart the Next.js development server.
The web dev launcher uses Webpack and reads an optional `PORT` from
`apps/web/.env.local` before Next.js starts. To run beside another project,
set `PORT=3001` and `NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1`
there, then set `API_PORT=4001`, `CORS_ORIGINS=http://localhost:3001`,
and `WEB_APP_URL=http://localhost:3001` in the root `.env`.

## Authentication model

Registration normalizes email, stores an Argon2id password hash, stores only a
SHA-256 fingerprint of the verification token, and awaits email delivery. The
account becomes active only after the one-time verification link is consumed.
Consumption is conditional and atomic: exactly one concurrent request can
activate the pending account, while reused tokens and tokens replaced by resend
fail.
If delivery fails, the API removes only the pending account created by that
request before returning the failure, so the same address can be retried.

Password length is a fixed shared contract: 15 through 128 characters. The Web,
API DTOs, and optional seed validation consume those contract constants; there
is no environment override that can make their policies drift.

Production requires four independent JWT signing secrets — `AUTH_JWT_SECRET`,
`AUTH_REFRESH_JWT_SECRET`, `AUTH_VERIFICATION_JWT_SECRET` and
`AUTH_RESET_JWT_SECRET`. Each must be at least 32 characters, none may be blank,
none may repeat another, and none may start with a committed example or test
placeholder prefix. A failure names the offending variable only; no secret value
is ever logged. Outside production the three secondary secrets fall back to the
access secret, so a local checkout needs one value, but that fallback is never
accepted when `NODE_ENV=production`.

Login returns only an access token in JSON and sets:

- `refreshToken`: HttpOnly, `SameSite=Lax` by default, path
  `/api/v1/auth`
- `csrfToken`: readable by the web app, same policy, path `/`

Both are session cookies unless `rememberMe=true`; remembered lifetimes match
the configured refresh-session TTL. Cookie domain is omitted.

The browser stores the access token only in module memory. Axios attaches the
bearer token and sends the CSRF header only for unsafe methods. One
single-flight refresh handles concurrent protected `401` responses and each
request is replayed at most once. Public authentication failures never trigger
refresh. A failed intercepted refresh clears the in-memory token; only exact
responses `400/BAD_REQUEST` and `401/UNAUTHORIZED` replace the page with login.
Network, CSRF, rate-limit, and server refresh failures remain visible; a replay failure
is reported separately from the refresh that enabled the replay. React Query
owns the current safe-user session. During restoration, only those same exact
anonymous code/status pairs become `null`; unexpected `400` or `401` codes and
all other restore failures remain visible and retryable.

Logout revokes the current refresh record. Logout-all, password change, and
password reset revoke every refresh record. Refresh and reset tokens are
single-use. These operations cannot immediately revoke an already issued,
stateless access JWT: it remains usable until its short configured expiry (15
minutes by default). The authentication foundation has no token blacklist.
Browser session state is cleared only after the server confirms logout.
Failures stay visible and retryable, and a failed logout-all never claims that
sessions on other devices were revoked.

## Account states and staff access

An account is in one of `PENDING_VERIFICATION`, `PENDING_APPROVAL`, `REJECTED`,
`ACTIVE` or `SUSPENDED`. Registration creates a `USER` in
`PENDING_VERIFICATION` and collects no department. Consuming the one-time
verification link verifies a self-registered `USER` and moves the account to
`PENDING_APPROVAL` for staff review. A verified `USER` has no business access until a staff
command approves it and assigns exactly one department — `SALES`, `APPROVAL`,
`CUTTING`, `PRODUCTION`, `QUALITY` or `WAREHOUSE`.

Only a staff command changes an employee's authority. An administrator can
list the staff directory, review a pending account, approve it with a
department, reject it, reconsider a rejection through approval, change its
department, suspend it and reactivate it. Each decision is retained with the
acting administrator, the authority before and after, and the time. Each
command carries the client command id and the access version it reviewed. A
stale version is refused with `409 STAFF_ACCESS_CONFLICT`, a reused command id
with a different request with `409 STAFF_COMMAND_CONFLICT`, and an invalid
transition with `409 STAFF_TRANSITION_CONFLICT`. The exact same request
replayed after a successful decision returns the original decision and appends
no history.

An administrator keeps cross-department access and cannot itself be managed as
ordinary staff (`403 STAFF_ADMIN_TARGET_FORBIDDEN`). An employee enters only
its own department workspace, and `/admin` is administrator-only.

### Ordinary staff and the first administrator

Ordinary staff work happens on the administrator screens. `/admin/users` lists
the directory and `/admin/users/pending` narrows it to the accounts awaiting
review. The management dialog reads the server page, so paging is server-owned.

From `/admin/users/pending`, an active verified administrator can create an
ordinary employee with a name, email, initial password and one department. The
account first appears in the full directory awaiting email verification. The
verification link activates the account in the selected department and records
the administrator's approval. If that administrator has lost authority, the
verified account waits for ordinary staff approval. A duplicate email leaves
the existing account unchanged.

The first production administrator is different. No route, screen or
development seed can create one. A restricted standalone procedure promotes
one explicitly selected identity, and only a verified, still pending and
unassigned employee is eligible. It is a compiled API package script, so the
package must be built first, it acts on the configured `DATABASE_URL`, and it
writes nothing without `--apply`:

```bash
pnpm --filter @template/api admin:provision --user-id <uuid> --expected-email <email> --expected-access-version <n> --operator-reference <reference>
```

`--apply` performs the write and additionally requires `--allow-production`
when `NODE_ENV=production`. The procedure refuses an existing administrator
and a second successful run. The applied result prints only an outcome, the
selected account id, the operator reference and the server time; the preview
prints only safe fields and a masked address. No credential, connection URI or
raw error is ever printed. Do not run it against a developer or production
database without the release authorization that OPS-01 owns.

### Account controls and persisted order workflows

The account screen shows the signed-in profile with its role and offers the
real profile update, the real password change and the control that ends every
refresh session of the account. The workspace shell owns the single-session
logout.

Identity, account, staff, shared customers and incomplete sales drafts use the real
API and database. Customer contacts require name and a Saudi mobile/fixed phone;
email, address and notes are optional. Local, +966 and 00966 phone formats and
Arabic digits resolve to one canonical phone; email reuse does not merge contacts.
Changing a phone preserves the customer's stable ID and saved draft links.

Sales staff share contacts while their related draft lists, counts, measurements
and activity remain owner-scoped. ADMIN can read a broader draft scope with each
original owner retained. Known-type drafts allow one blank piece and optional
customer/specifications/date/paid entry. Manual Save persists individual piece IDs,
notes and the customer link across relogin; unsaved edits have no such guarantee.
Inline customer creation selects the confirmed contact without implicitly saving
the paper. Conflicts retain input for explicit reload/review. Unknown write outcomes
can be checked through their command receipt; a confirmed save with failed refresh
has a separate retry state. API errors never fall back to demo success.

The existing Arabic/RTL/Cairo screens and paper remain. Unsubmitted paid and
signature text are provisional captures. First submission freezes customer contacts,
selected catalog values, exact prices and initial cumulative paid; submitted money
comes from the server. Sales specifications lock after submission. Eligible returned
orders permit only the agreed correction fields and explicit resubmission. Paid-only
editing remains separate from specification editing and uses current server action
flags plus API authorization.

Approval staff or ADMIN can approve the current submitted revision, releasing its
pieces to cutting, or return it with a mandatory reason and separate optional notes.
The factory issue-report API holds only its exact piece. Approval can return that
piece to an explicit cutting/production target, refer it to owner sales with a retained
target, or cancel it with confirmation and a reason. Cancellation retains the piece,
history and actual paid amount; active totals, due and surplus are server-derived.
It performs no refund or settlement.

The existing owner-contact modal permits only model, size, leather base and floor
proposals, notes-only confirmation or a cancellation request. Customer, decoration
and prices stay frozen. Proposals await approval separately from manufacturing
values. A reasoned return keeps the piece held for renewed contact; only positive
approval resumes it at the retained target. Contact writes require actual ownership,
including for ADMIN. In the current browser session, lost outcomes retain the original
intent for receipt observation and synchronization before another action.

Both `/orders/[orderId]/print` and `/print/order/[orderId]` read current official paper
for eligible owner sales, approval staff or ADMIN. Initial unapproved/returned orders
and unresolved submitted reapproval cycles are denied; resolving only one pending
piece does not unlock the whole order. Factory reads omit money and private contact
correspondence, and `/reports/print` remains ADMIN-only. Paper preserves the captured
signature and eight-row landscape layout, with factual initial approval metadata;
full changed-piece approval stamps appear in preview. The print button rereads current
authority. Native printing can only guard already-known state, and exported PDFs
cannot be revoked. Later manufacturing workspace actions, delivery and report
integration remain outside P04.

## Cutting and production workspaces

P05 connects the existing cutting/production dashboards, queues, activity, order and
exact-piece task routes to persisted manufacturing reads and commands. Colleagues
can continue another employee's work while retaining the original starter and start
time. Confirmations capture exact pieces across orders: if any selected piece is
stale or ineligible, the whole batch is rejected without changes. All seven order
types follow cutting → production → quality incoming. P06 owns the subsequent
quality inspection; P07 separately persists warehouse physical receipt and delivery.

Problem reports use the existing P04 one-piece hold and approval/contact flow.
Accepted returns create ordinary department visits; repairs do not skip stages.
Factory specifications and history omit money, customer contacts and private sales
proposals, and do not expose official financial printing.

The current QueryClient retains one original work/report intent through dialog close
and client-side navigation. An unknown outcome offers original-result observation
or the same immutable retry; a known saved result retries synchronization only.
After a full reload, own activity can discover a retained receipt, without storing
or reconstructing a command payload. Missing activity or a receipt lookup returning
404 does not prove that the command failed.

The forward P05 migration and manufacturing activity producers/consumers require a
coordinated release. Local acceptance does not apply migrations to production or
close OPS-01/client-input gates. See [the P05 task ledger](specs/005-cutting-production-workspaces/tasks.md)
for executed evidence and separate review verdicts.

## Quality, packing and reinspection

P06 connects the existing Quality dashboard, incoming/inspection/corrections/accepted
queues, activity, order and exact-piece task routes to the API and database. Current
QUALITY employees and ADMIN use server-checked authority. Colleagues can continue
an inspection while retaining its original starter. Each confirmation captures exact
piece IDs and versions across orders; an ineligible or stale member rejects the whole
selection with no partial save.

Inspectors explicitly accept or reject selected pieces. Acceptance retains optional
carton count/numbers as entered text and an optional inspection note, linked to the
actual accepted group. Later groups retain their own identities and history. Rejection
requires a cutting/production target, reason and correction instructions. Corrections
follow the normal workshop route and require a new Quality start and reinspection;
repeated rejection, acceptance and approval cancellation retain earlier cycle facts.
Quality problem reports hold only the selected pieces through P04, with optional
additional notes. Approval/contact/reapproval still owns their resolution.

Acceptance persists WAREHOUSE/INCOMING handoffs. It does not physically receive
pieces, increase receipt completion or establish dispatch readiness. P07 now supplies persisted warehouse UI,
physical receipt and delivery integration. Quality reads and factory
paper omit money, private customer contacts and unapproved proposals; official
financial printing remains restricted to its existing authorized roles.

The existing QueryClient retains one immutable Quality command through dialog close
and client-side navigation. Unknown results permit observation or an explicitly chosen
identical replay; saved results retry display synchronization only. Full reload uses
own activity to observe an original receipt read-only, without reconstructing a POST.
Another actor cannot retrieve that private receipt; missing results remain inconclusive.

The forward migrations are
`packages/database/prisma/migrations/20261111000200_p06_quality_workspaces/migration.sql`
and `packages/database/prisma/migrations/20261112000100_p06_quality_validation_dispatch/migration.sql`.
The latter preserves the integrity predicates while narrowing redundant validation dispatch.
Release must coordinate them with the Quality/P04/P05 producers and the additive
activity consumers, including sales/approval histories. Local verification uses
synthetic data and disposable infrastructure; it does not activate production data,
close client-input/OPS-01 gates; P07 receipt/delivery has its own acceptance evidence. See
[the P06 task ledger](specs/006-quality-packing-reinspection/tasks.md) for executed
checks and separate acceptance verdicts.

## Warehouse, administration and reports

Warehouse staff or ADMIN record actual physical arrivals, optional cartons/location/
notes and whole-order dispatch, delivery, acknowledged failure return and explicit
retry. Quality acceptance alone cannot increase physical receipt counts. Original
attempts survive returned-piece cancellation; a later dispatch covers the complete
remaining active order. Commands and private recovery use the existing QueryClient.

Administration reads actual dashboard/order/approval/correction/delivery/activity facts.
Cancellation reviews exact eligible piece IDs and retains paid/surplus/history without
a refund operation. Audited notes/contact/address correction preserves submitted,
delivered and fully cancelled lifecycle state. Reports use one filtered order cohort
with a separately scoped current staff directory; print prepares one complete current
snapshot across all six retained sections. Same-page filters/pagination use validated
URLs and native History, including Back/Forward and explicit invalid-filter reset.

The [P08 ledger](specs/008-admin-reports-readiness/tasks.md) owns executed local evidence.
The [operations runbook](docs/operations/release-runbook.md) describes actual commands,
recovery and the constructed Linux/Compose/Caddy CLI, private protocols and target gates.
T048 target acceptance, actual OPS-01 inputs and separately covered release actions
remain open; no local pass is a deployment or live inbox observation.

## Catalog loading and submission calendar

The operator CLI is `apps/api/src/scripts/load-catalog.ts`, exposed by the API's
`catalog:load` script. It requires the installed workspace development tooling
(`tsx` and ExcelJS); it is not an automatic server-startup import or a production
catalog-management endpoint. Its reviewed mapping and SHA-256 manifest are in
`apps/api/src/modules/catalogs/reviewed-catalog.manifest.ts`.

The accepted workbook SHA-256 is
`88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b`.
Preview reads at most 16 MiB, verifies those exact bytes, and checks evaluated values,
formula caches, original labels, all ten catalog kinds (1,874 entries) and all 14
same-row decoration rates. It preserves the documented independent color families,
source asymmetries and I104. A different workbook requires explicit source review;
there is no force/hash-bypass flag.

Set `REVIEWED_WORKBOOK` to the reviewed file's readable path. From the repository
root, preview without opening a database:

```bash
pnpm --filter @template/api catalog:load --file "$REVIEWED_WORKBOOK" --mode preview
```

A successful preview prints JSON with `sourceSha256`, `valid`, `counts`, bounded
`diagnostics` and `totalIssueCount`. The accepted source has the informational
`NO_COLOR_FAMILY` at Z3 and `NO_DECORATION_RATE` at Y2; these preserve its asymmetries.
Source hash, invalid values or missing formula caches fail with exit 1 and a safe
error code; they do not activate a partial catalog.

Apply requires authorization covering the specific database and action. Deploy the
reviewed forward migrations and check the target's migration history first. Configure
its `DATABASE_URL` through the normal private server configuration; never print or
paste the connection string into an execution report. Set `CATALOG_DATABASE_NAME`
to that explicitly authorized database name, then run:

```bash
pnpm --filter @template/api catalog:load --file "$REVIEWED_WORKBOOK" --mode apply --database-name "$CATALOG_DATABASE_NAME"
```

The loader checks `current_database()` against `--database-name` and fails with
`CATALOG_TARGET_MISMATCH` for a mismatch. Source/entries/activation commit together.
A repeated matching source retains entry IDs without duplication; mismatched retained
source contents are rejected. Success reports source identity, entry count, activation
and whether the source was reused. A failed transaction retains the prior activation;
never reset counters, delete submitted records or rewrite migration/receipt history
as a recovery shortcut. Populated targets need a reviewed forward repair or separately
authorized restore when recovery requires one.

Set the server-only `ORDER_BUSINESS_TIME_ZONE` explicitly to the authorized IANA
business timezone before first submission. `.env.example` deliberately leaves it
blank. Missing/invalid timezone returns `ORDER_CALENDAR_UNAVAILABLE` (503) on first
submission; catalog reads, quotes and incomplete draft save remain available. There
is no host/browser timezone fallback. Quotes create no number or persisted sale.

Accepted numbers are uppercase `TYPE-YYYY-NNNN`, with at least four sequence digits.
One global sequence continues across types and years without reset. The year comes
from the first submission's actual server instant in the configured business calendar;
resubmission retains the original number. The selected
[P03 specification](specs/003-catalog-pricing-submission/spec.md) records the owner's
numbering answer; the protected roadmap's older NUM-01 entry is historical for this
feature. Do not edit that roadmap or substitute a production calendar merely to
match an acceptance example.

[The P03 task ledger](specs/003-catalog-pricing-submission/tasks.md) separates backend,
frontend, synthetic browser consumer fixtures, actual workbook preview/activation and
actual catalog-backed submission evidence. Its earlier consumer-fixture results
remain historical P03 evidence. The current harness creates those prerequisites
through actual P04 approval services and preserves original P03 receipts.
[The P04 task ledger](specs/004-approval-reapproval-printing/tasks.md) records current
cross-layer decisions/contact/printing checks, separate reviewed-workbook acceptance
and manual physical PDF inspection. An acceptance-only UTC calendar is not an
OPS-01 production timezone decision. Hosting,
real mail, production administrator setup, backup/restore and release authorization
remain the existing OPS-01/P08 gates.

## Email delivery

- `console`: development/test only; no provider network call
- `resend`: requires a non-placeholder `RESEND_API_KEY`
- `smtp`: production requires host, user, and password

Production rejects `EMAIL_PROVIDER=console` and requires an HTTPS
`WEB_APP_URL`. Registration does not report success if verification email
delivery fails. Provider failure logs contain only safe classifications such as
provider, attempt, error name, and status code; raw provider messages are not
logged.

## Optional seed accounts

Both groups are disabled unless all three values in that group are present:

```dotenv
SEED_ADMIN_EMAIL=
SEED_ADMIN_NAME=
SEED_ADMIN_PASSWORD=

SEED_USER_EMAIL=
SEED_USER_NAME=
SEED_USER_PASSWORD=
```

Partial groups fail clearly and configured production seeding is refused.
Passwords use the fixed shared policy and Argon2id. The seed is create-only: an
account that already exists for the normalized email is skipped and never
written, so its password, profile, role, state, verification, approval,
authority version, timestamps and history stay exactly as they were. A newly
created account gets no employee approval: the `USER` group is created verified
and awaiting approval, and the `ADMIN` group is created verified and active.
Both start at authority version 0 with no department and no approver. There are
no default credentials, and a seeded local administrator is not a substitute for
the restricted production administrator procedure.

## Production topology

The default security model expects the web app and API on one origin. The
included [Caddyfile](./Caddyfile) routes `/api/*` to Express and everything
else to Next.js:

```dotenv
APP_DOMAIN=example.com
CORS_ORIGINS=https://example.com
WEB_APP_URL=https://example.com
NEXT_PUBLIC_API_URL=https://example.com/api/v1
AUTH_COOKIE_SAME_SITE=lax
```

Deploying web and API on unrelated registrable domains is not supported by the
default cookie/CSRF design. `SameSite=None` alone cannot make frontend
JavaScript read an unrelated API-domain CSRF cookie.

`compose.yaml` provisions PostgreSQL only. The Caddyfile is a deployment routing
template for separately deployed services named `api` and `web`. The separate
`deploy/` stack and `scripts/operations/release.mjs` implement staged packaging,
maintenance/acceptance, verified backups, restricted administrator binding, restart,
replacement recovery and explicit opening. See the [runbook](docs/operations/release-runbook.md).
Their local validation does not establish actual-target release acceptance.

## Database invariants

The initial migration creates `users` and `refresh_tokens`. Two forward
migrations add the staff access state and its history: they extend the account
status and department enums, add the staff access columns to `users`, and
create `staff_decisions` and `initial_administrator_provisioning`. The
enforced constraints include:

- `ck_users_email_normalized`
- `ck_users_status_timestamps_consistent`
- `ck_users_verification_state_consistent`
- `ck_users_staff_access_consistent`
- `ck_users_staff_approval_pair`
- `ck_users_access_version_nonnegative`

`staff_decisions` is append-only and immutable, and each target keeps at most
one decision per access version. `initial_administrator_provisioning` is
immutable and single-target, so a second administrator cannot be provisioned.
A user that still owns staff history or an initial-administrator receipt
cannot be deleted.

P02 adds a forward migration for `customers`, `sales_drafts`,
`sales_draft_pieces` and `sales_commands`. Constraints enforce canonical unique
Saudi phones, normalized optional email, positive revisions, nonnegative optional
paid captures, one physical piece per row and unique active positions. Draft owner
and piece identity are immutable; removed pieces and retained commands cannot be
rewritten. Customer email is not unique. Transactional commands bind actor, payload,
resource and revision; their retained receipts support replay/observation.

P06 adds retained Quality commands, visits, piece events, packing membership and
correction cycles, with linked P04 report witnesses. Its forward migration and real
integration tests enforce exact membership, one open correction, immutable history
and version-chain integrity alongside the existing P04/P05 constraints.

Migration integration tests inspect the constraints, reject invalid direct
inserts, accept valid pending/active users, verify cascade behavior, and deploy
the migrations a second time.

## Verification

```bash
pnpm verify
```

The command formats/validates/generates Prisma artifacts, checks formatting,
lints, type-checks, runs unit and disposable-database integration suites,
builds every package, and runs `git diff --check`. Docker is required for the
integration stage. Contracts test/spec sources are excluded from production
output, and the root build-output assertion verifies required emitted artifacts
while rejecting emitted test/spec JavaScript, declarations, and source maps.

Individual commands:

```bash
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm format
pnpm format:check
pnpm lint
pnpm check-types
pnpm test
pnpm test:integration
pnpm build
pnpm verify:build-output
```

For the P06 exit checks on a loaded local machine, the same complete unit and
integration sets can run with bounded package/worker concurrency:

```bash
pnpm test --concurrency=1 -- --maxWorkers=2
pnpm test:integration --concurrency=1
```

These commands preserve test discovery, assertions and transaction/timing limits.
[The P06 ledger](specs/006-quality-packing-reinspection/tasks.md) records both failed
parallel measurements and passing bounded runs; they are local evidence, not a
latency/throughput guarantee.

The browser harness has its own scripts and is not part of `pnpm verify`:

```bash
pnpm --filter @template/web exec playwright install chromium
pnpm --filter @template/web check:e2e-types
pnpm --filter @template/api check:e2e-types
pnpm --filter @template/web test:e2e
```

The first command is tooling setup, not a runtime claim. Docker and an
installed Chromium are prerequisites for the browser run. The harness owns a
disposable database, its own API and web children, and their cleanup. Before browser
work it builds Next and its workspace dependency with that run's API origin, then
serves the completed build on its reserved loopback port. This remains an isolated
test target and adds no production endpoint. `apps/web/e2e/customer-drafts.spec.ts` covers shared
contacts, incomplete save/relogin, inline cancel/linking, piece identity, privacy,
ADMIN scope, stale edits and lost-reply/refresh recovery on desktop and narrow
Chromium and also contains P03 submission consumers.
`apps/web/e2e/staff-identity.spec.ts` retains the P01 journeys.
`apps/web/e2e/approval-reapproval-printing.spec.ts` covers P04 initial decisions,
per-piece A/B/C, contact/reapproval/recovery, cancellation money and official printing.
`apps/web/e2e/cutting-production-workspaces.spec.ts` covers P05 safe reads and exact
routes, colleague work, all normal transfers, atomic cross-order rejection, one-piece
rework, lost-result recovery, account changes and keyboard behavior on both profiles.
It uses real registered/approved colleagues and the same owned runtime; fixture
sessions reuse real cookies in private test memory with fresh browser contexts.

`apps/web/e2e/quality-packing-reinspection.spec.ts` covers ordinary Quality work,
colleague continuation, optional packing, both correction routes/repeated cycles,
exact mixed batches, P04 issues, safe retained history, aliases, current authority
and delayed/lost-result recovery on both profiles. Run that discovered slice with:

```bash
pnpm --filter @template/web test:e2e quality-packing-reinspection.spec.ts
```

`pnpm --filter @template/web test:e2e` runs the complete browser suite, including
the existing regression journeys.
Browser checks complement contract/component tests and real database/HTTP race tests;
controlled epoch/late-cache branches remain component evidence. Current P02 results
and separate acceptance verdicts are recorded in
[the feature task ledger](specs/002-shared-customers-drafts/tasks.md). These are local
disposable-stack checks, not production migration, real mail or release evidence.

The default catalog mode is explicitly synthetic. A separate fresh run reads the
bounded, hash-checked reviewed workbook before any catalog admission, without a
synthetic fallback:

```bash
P04_E2E_CATALOG_MODE=reviewed-workbook pnpm --filter @template/web test:e2e --grep "P04 reviewed workbook"
```

The workbook must be present as `أمر_تفصيل_الحذاء_الشرقي.xlsx` at the repository root. This run
executes the complete P04 approval/contact/reapproval/official-paper journey on both
browser projects; it does not activate a production catalog. The default US5 export
case prints paths to private temporary PDF directories for manual page-fit inspection
and subsequent removal. A locally available PDF viewer/rendering tool is required
for that inspection; Chromium installation does not install one. Automated DOM counts
and PDF creation alone do not establish physical A4 landscape fit. Actual tools,
inspection and cleanup evidence belong to the P04 ledger and the current [P08 local-exit record](specs/008-admin-reports-readiness/tasks.md).

## Pending release work

The identity, staff and account surfaces are implemented and covered locally.
The following actual-target observations remain pending; local isolated results do not complete them:

- the restricted initial production administrator procedure in a real
  environment, with the release operator and the target values (OPS-01)
- release and environment configuration for a deployed API and web app
- real verification and recovery mail delivery beyond the captured
  local previews
- target production backup/restore, scheduling, retention and storage verification

No local command, synthetic account or browser run substitutes for those
checks. The operational CLI provides explicit guarded stages and recorded uncertainty;
it does not automatically certify or perform an entire production release.

See [PROJECT_REFERENCE.md](./PROJECT_REFERENCE.md) for boundaries and extension
guidance.
