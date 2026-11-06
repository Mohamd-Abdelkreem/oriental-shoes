# Project reference

This describes the implemented identity/staff foundation, shared customers and
persistent incomplete sales drafts alongside the retained Oriental Shoes UI.
Other operational domains remain browser-local MVP/later-phase work.

For normative authoring/review rules, read the
[constitution](.specify/memory/constitution.md) and
[engineering index](docs/engineering/README.md). The existing [roadmap](plan.md)
owns product scope and current approval/client-input status;
[phase delivery](docs/workflow/phase-delivery.md) owns its Spec Kit workflow.
Preserve the roadmap and approved Arabic/RTL/Cairo UI. A dated migration audit or
available screen does not prove persisted business acceptance.

## Boundaries

```text
Next.js UI
  -> @template/contracts
  -> Axios API client
  -> Express routes / middleware / controllers / services
  -> Prisma
  -> PostgreSQL
```

- `@template/contracts` owns request bodies, safe user output, field errors,
  pagination metadata, and success/error envelopes.
- `@template/database` owns Prisma schema, migrations, generated types, seed
  behavior, and the client factory.
- `@template/api` owns HTTP security, account rules, staff authority, delivery
  adapters, customer/draft authority and persistence orchestration.
- `@template/web` imports contracts but no API/database implementation.

P02 persists shared Saudi customer contacts and manually saved incomplete drafts.
Draft resources, related counts/measurements and activity are owner-scoped for SALES;
ADMIN reads a broader scope without becoming the owner. Contacts and draft links use
stable IDs even when phone changes. Signature/paid/date fields are provisional;
prices, submission, business numbering and official draft printing are unavailable.
P03 and NUM-01 retain those gates; OPS-01 still owns release prerequisites.

All packages use ESM and emitted `.js` relative imports. TypeScript strictness
and exact optional property checking stay enabled.

## Web

`src/services/api/api-client.ts` is the only transport. It uses Axios with a
validated, trailing-slash-normalized base URL and `withCredentials: true`.
Access-token and refresh-promise state are discriminated module-memory values;
no token is written to local/session storage.

Request interception adds:

- `Authorization: Bearer ...` when memory contains a token
- `x-csrf-token` from the readable cookie for POST/PUT/PATCH/DELETE only

Response interception classifies exact public auth paths, coalesces concurrent
refresh, marks replayed requests with `_templateRetried`, and replays once.
An intercepted refresh failure clears memory. Only exact `400/BAD_REQUEST` and
`401/UNAUTHORIZED` refresh failures perform a safe full navigation without
credential-bearing return parameters. Network, CSRF, rate-limit, and server refresh failures remain
visible, and replay failures are reported separately from refresh failures.

`src/app/providers.tsx` contains only `QueryClientProvider`.
`AUTH_SESSION_QUERY_KEY` is the sole session cache. A missing access token
attempts refresh; only `400/BAD_REQUEST` and `401/UNAUTHORIZED` refresh
responses mean anonymous. Only those exact code/status pairs from the
current-user request are also normalized to anonymous after clearing the
in-memory token; unexpected `400`/`401` codes remain errors. Other failures are
rendered with retry and request ID. Logout and logout-all clear local session
state only after confirmed server success; failures stay visible and retryable,
and logout-all does not claim other-device revocation after a failure.

Pure guest/protected route-state functions cover pending, error, redirecting,
and authorized states. Protected accounts must be active, email-verified, and
match any requested generic `USER`/`ADMIN` role.

`src/features/auth/model/account-access.ts` is the pure workspace-authority
model. `hasBusinessAccess` requires an active, verified identity, and an
administrator is exempt from the employee approval and assignment while an
employee needs both an approval timestamp and exactly one department. A
missing value is treated as absent, so malformed authority is denied instead
of repaired. `workspaceDepartment` maps a pathname to its department root and
`canEnterWorkspace` admits an employee only to its own department, while
`/admin` stays administrator-only.

`src/services/api/api-client.ts` owns one session epoch with subject fencing.
Its restore policy is one of `restore`, `credential-required`,
`identity-changed` or `signed-out`. Only a fully parsed credential result of
the current epoch may bind a subject, a passive result carrying another
subject closes restoration, and an obsolete epoch is cancelled rather than
applied.

`src/components/auth/account-state-route.tsx` owns the private state routes. A
pending-approval, rejected or suspended identity renders its own card, another
restricted state goes to its own path, and a business-eligible identity
reaches its workspace.

`src/features/administration/` owns the staff directory, the pending scope and
the management dialog.
`src/features/administration/model/staff-management.model.ts` is the pure
owner of the command variables and the available operations. The directory
reads the server page, and the reusable `DataTable` renders a supplied server
page as-is in controlled mode while keeping its own slice in local mode.

`src/features/customers/` owns contact APIs, hooks and form models;
`src/features/sales/api/`, `hooks/` and `model/` own draft and command seams.
They use the existing transport and QueryClient. Operational cache keys include
actor, access version and session epoch through
`src/shared/query/operational-scope.ts`; late obsolete results cannot publish into
the current scope. Commands retain one intent through unknown outcomes and fetch
current data separately from the saved receipt. Conflicts preserve local input for
explicit review; confirmed-save/refresh-failure remains distinct from failed save.

Converted routes include SALES customer directory/new/detail/edit, dashboard,
draft list, orders list/detail/edit/new and draft activity, plus ADMIN customer
list/detail. The paper uses manual save, returned stable customer identity and
individual piece IDs; inline customer creation never implicitly saves it. Other
operational consumers still use the URL/local MVP provider. Identity, staff and
these converted P02 surfaces use their API-backed owners.
Existing `screens/`, order paper components and
`features/prototype/components/` remain product UI owners.

## API

`createApp` is the composition boundary. It constructs the selected
`EmailDelivery`, then `EmailService`; the router constructs
`AuthService(database, emailService)`, controllers, and authentication
middleware. Authentication modules do not import provider clients or
singletons.

Security infrastructure is in `src/infrastructure/security`:

- `password-hasher.ts`: Argon2id hash/verify
- `token-hasher.ts`: SHA-256 token fingerprint
- `jwt.service.ts`: issue/verify purpose-bound access, refresh, verification,
  and reset JWTs

Auth DTOs use file-per-DTO modules. Auth rate-limit configuration is separate
from CSRF configuration. All API password DTOs use the fixed 15-to-128-character
schemas from `@template/contracts`; there is no API environment override. Role
authorization is a generic allowlist middleware.

Email verification consumes the normalized email, pending status, null
verification timestamp, token hash, and unexpired credential in one conditional
transaction. Exactly one concurrent request succeeds; reused tokens and tokens
replaced by resend fail, and the final response uses the safe-user projection.

`src/modules/staff` owns the staff authority boundary. Its routes expose the
directory, one staff record and its retained decisions, plus the approve,
reject, suspend, reactivate and department commands. Every route requires an
authenticated business account and the `ADMIN` role. Each command body carries
the client command id and the expected access version, is bound to actor,
target, operation and normalized payload, and is applied in a transaction that
stores the decision and increments the access version once. The retained
history is append-only, and a rejected account is reconsidered through
approval.

`src/modules/customers`, `src/modules/sales-drafts` and
`src/modules/sales-commands` own P02. Their `/api/v1/customers`,
`/api/v1/sales-drafts` and `/api/v1/sales-commands/:commandId` interfaces use
shared strict contracts and current business/department authority. Commands bind
the authenticated actor and normalized payload, use expected revisions for edits,
and retain transactional before/after evidence. Receipts are actor-scoped;
re-observation returns the saved result while current resource reads may be newer.
Foreign private drafts return the same safe missing result as absent drafts.
Customer phone normalization accepts Saudi local/international/Arabic-digit forms,
with unique canonical phone and optional nonunique email. Bounded customer draft
cards and measurement reads follow the caller's resource scope. OpenAPI lists the
implemented routes; no P02 transition submits or prices a draft.

`src/scripts/provision-initial-admin.ts` is the restricted initial
administrator procedure. It is a standalone script, not a route, and it
requires the target id, the expected email, the expected access version and an
operator reference. Without `--apply` it only previews the selected identity.
`--apply` performs the write and additionally requires `--allow-production`
when `NODE_ENV=production`. The database receipt keeps the procedure
single-target and non-repeatable, and the script prints only an outcome, the
selected account id, the operator reference and the server time.

Request validation uses `safeParseAsync`, aggregates body/query/params failures
with target-prefixed field paths, and stores parsed data on `req.validated`.
Only that boundary converts schema failures into operational 400 responses;
Zod errors raised by internal response or application schemas remain 500-class
server bugs.

The response helper uses `@template/contracts` types directly. Success always
has `data`; valid nested pagination is promoted to `paginationMeta`. Error
envelopes never contain `data: null`.

The Prisma mapper exposes only stable generic errors. Approved check-constraint
names are limited to the two User constraints. Raw messages, SQL, metadata,
database URLs, and provider secrets are never returned.

Request logging sanitizes credential values in `req.url`,
`req.originalUrl`, and query objects while retaining non-sensitive query
parameters. Header/body redaction continues to cover authorization, cookies,
the `x-csrf-token` header, passwords, tokens, SMTP/Resend credentials, database
URLs, and API keys. Email provider failure logs omit raw provider messages.
Tests exercise serialized Pino output and assert that credential fields contain
the redaction marker rather than their original values.

The development-only console email provider writes complete HTML previews to
the workspace-root, Git-ignored `.local-emails` directory, requesting owner-only
filesystem modes where supported, and logs only each preview path. Open the
newest `.html` file and click its verification or reset button. A failed
registration delivery triggers a guarded compensating delete of the newly
created pending user so the address can retry.

## Generic utilities

- `core/pagination`: decimal-digit-only query parsing, defaults, maximum
  limit, safe integer checks, skip/take, and contract pagination metadata
- `core/date-only.ts`: real `YYYY-MM-DD` calendar validation and UTC-safe
  parsing/serialization
- `core/serialization/decimal.ts`: canonical Decimal strings without
  two-decimal money rounding; deep handling for arrays/plain objects while
  preserving Date, nullish, primitives, and unrelated class instances

## Local and production HTTP topology

Local values use only `localhost`:

```dotenv
CORS_ORIGINS=http://localhost:3000
WEB_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
AUTH_COOKIE_SAME_SITE=lax
```

HTTP integration tests prove the exact allowed CORS origin, credentials,
preflight including requested authorization/content-type/CSRF headers, rejected
origins, refresh/CSRF cookies, missing/mismatched CSRF, missing refresh cookie,
request IDs, and real auth/profile/recovery flows.

Production uses the same origin with `/api/v1` routed to Express. Cookie
domain remains omitted. Unrelated registrable domains require a different
architecture and are intentionally unsupported.

The root Compose file provisions PostgreSQL only. The Caddyfile is a routing
template for separately deployed `api` and `web` services, not a complete or
verified one-command production stack.

## Tests

Unit suites cover contracts, transport/error parsing, single-flight refresh,
query retry policy (network and 500-504, at most twice), session restoration,
route guards, safe return paths/forms, security services, authorization, CSRF,
cookie options, delivery injection/failure propagation, logger sanitization,
Prisma mapping, seed behavior, and generic utilities.

Contracts production builds exclude test/spec TypeScript and TSX sources. The
root build-output assertion verifies required entry artifacts and rejects any
emitted test/spec JavaScript, declaration, or source-map artifact.

Database integration starts PostgreSQL 18, deploys the real migrations, tests
constraints with direct SQL, validates schema inventory/cascade, and deploys a
second time.

API integration starts another disposable PostgreSQL 18 instance, deploys the
real migrations, builds the actual Express app with fake email delivery, and
uses Supertest agents for cookies. Independent tests cover CORS, validation,
register/verify/login, safe JSON, refresh rotation/replay, CSRF failures,
users/me/profile, current-session logout, logout-all, password change, neutral
forgot-password, reset single-use, session revocation, and new-password login.
Verification coverage also proves that concurrent service and HTTP requests
produce exactly one success, reused/replaced tokens fail, and suspended users
remain suspended.

The browser harness is separate from Vitest. `apps/web/playwright.config.ts`
runs the `desktop` and `narrow` Chromium projects over
`apps/web/e2e/**/*.spec.ts`, and `apps/web/e2e/global-setup.ts` owns a
disposable PostgreSQL 18.4 container, a real API child and a disposable Next
child on a reserved loopback port. `apps/web/e2e/staff-identity.spec.ts` covers
the C1-C4 identity and staff journeys in both projects. The harness is test
tooling: it adds no production endpoint and emits no production build
artifact, and its synthetic accounts are disposable fixtures rather than
usable credentials. `apps/web/e2e/customer-drafts.spec.ts` adds P02-C1/C2/C3:
shared contact identity/duplicates, inline cancel/linking, incomplete save/relogin,
individual pieces, private related projections, ADMIN, stale edits, lost replies
and confirmed refresh failure on both existing profiles. It uses actual server
responses and same-context credentials, without direct database access or fabricated
success. Trace/video/screenshots remain off.

P02 unit/component tests cover strict customer/draft contracts, capture fields,
query scope and recovery. Disposable PostgreSQL/HTTP suites cover phone-claim and
revision races, command replay, rollback, owner/department/live-account denial,
immutable history and migration upgrade preservation. Controlled epoch/late-cache
cases are component evidence. The full phase gate additionally checks formatting,
lint, types, unit/integration suites, build/output and both browser-harness types;
see [the task evidence](specs/002-shared-customers-drafts/tasks.md) for actual results
and separate verdicts. Local results do not prove production migration/deployment,
real delivery providers or later submitted-order behavior.

Logout, logout-all, password change, and password reset revoke refresh records,
not already-issued stateless access JWTs. An access JWT can therefore remain
usable until its short configured expiry (15 minutes by default); no blacklist
or other immediate-revocation store is included.

## Extension rules

1. Add cross-package contracts only when API and web both consume them.
2. Add a new migration after this initial baseline is released; do not rewrite
   applied production history.
3. Keep route/controller/service responsibilities within one API module.
4. Inject external services from the composition boundary.
5. Authorize close to protected data; browser guards are not security.
6. Add OpenAPI and tests with each endpoint.
7. Keep refresh tokens out of JavaScript storage, explicitly project safe users and
   redact credentials/production action links. Add Oriental domain behavior only
   through accepted roadmap requirements; demo defaults are not production authority.
   Local console action links belong only in ignored preview files.
