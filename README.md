# Oriental Shoes

Oriental Shoes uses Next.js 16, Express 5, PostgreSQL and Prisma 7. Existing Arabic/RTL
operational screens and printing coexist with a real email/password account lifecycle.
Operational MVP state is still browser-local; the presence of a page or local success
does not establish a persisted business workflow. The existing [roadmap](plan.md)
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
- unit tests, disposable PostgreSQL Testcontainers integration tests, and a
  real-browser identity and staff harness
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
verification link moves a `USER` to `PENDING_APPROVAL`: the account is verified
and awaits staff review. A verified `USER` has no business access until a staff
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

### Account controls and remaining browser-local domains

The account screen shows the signed-in profile with its role and offers the
real profile update, the real password change and the control that ends every
refresh session of the account. The workspace shell owns the single-session
logout.

The identity, account and staff surfaces above are backed by the real API and
database. The operational order, customer, manufacturing, reporting and print
domains are still browser-local MVP state and are unchanged by this work. The
development-only OTP preview pages are also unchanged and stay outside the
real account lifecycle.

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
template for separately deployed services named `api` and `web`; this repository
does not provide or claim a verified one-command production Compose stack.

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

The browser harness has its own scripts and is not part of `pnpm verify`:

```bash
pnpm --filter @template/web exec playwright install chromium
pnpm --filter @template/web check:e2e-types
pnpm --filter @template/api check:e2e-types
pnpm --filter @template/web test:e2e
```

The first command is tooling setup, not a runtime claim. Docker and an
installed Chromium are prerequisites for the browser run. The harness owns a
disposable database, its own API and web children, and their cleanup, and it
adds no production endpoint.

## Pending release work

The identity, staff and account surfaces are implemented and covered locally.
The following remain pending and are not covered by any local result:

- the restricted initial production administrator procedure in a real
  environment, with the release operator and the target values (OPS-01)
- release and environment configuration for a deployed API and web app
- real verification and recovery mail delivery beyond the captured
  local previews
- database backup and restore verification

No local command, synthetic account or browser run substitutes for those
checks. The repository still provides no verified one-command production stack
and no deployment-verification command.

See [PROJECT_REFERENCE.md](./PROJECT_REFERENCE.md) for boundaries and extension
guidance.
