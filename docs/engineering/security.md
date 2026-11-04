# Security and authority boundaries

Use this guide for every untrusted-input, identity, private-data or provider boundary.
It defines requirements for new/changed work, not a certification of the existing app.
The [backend](backend-standard.md), [contracts](api-contracts.md),
[data](data-patterns.md) and [frontend](frontend-standard.md) guides own implementation
placement; [testing](testing.md) owns the evidence needed to prove a protection.

## Start with an authority table

For each operation, record these decisions in the feature plan before writing code:

| Question            | Required decision                                                            |
| ------------------- | ---------------------------------------------------------------------------- |
| Who can call it?    | Public/authenticated actor, current account status and role                  |
| Which resource?     | Ownership or explicit access relation, including nested resources            |
| In which state?     | Allowed transition and concurrent changes that invalidate it                 |
| What input?         | Allowlisted fields, sizes, formats, ranges and unsupported privileged fields |
| What output?        | Minimal safe projection, including error and existence-disclosure policy     |
| Which side effect?  | Actor-derived values, duplicate/replay semantics and audit need              |
| Which credentials?  | Transport, cookie/CSRF, provider/config and retention boundaries             |
| What proves denial? | Actual HTTP/service result and unchanged protected state                     |

Default to denied when authority is absent. Derive actor identity from authenticated
server context; a supplied user ID, hidden button or valid-looking resource ID is
not permission. Browser guards provide navigation/feedback only. Recheck relevant
current permissions/state at the write boundary when a race can invalidate an earlier
read. Multi-tenant scoping is required only if an accepted feature introduces tenants;
it is not part of the present authentication foundation.

## Oriental operational authority baseline

The real authentication foundation currently has generic account roles. Department
access, staff approval and operational resource rules come from the selected accepted
[roadmap](../../plan.md) requirements; their presence in a local screen is not proof
they are enforced by Express. Preserve current approval/client-input gates.

[Workspace selection](../../apps/web/src/components/workspace/workspace-shell.tsx)
uses the route, and operational previews use
[MVP selectors](../../apps/web/src/features/prototype/state/mvp-selectors.ts).
Neither establishes server authority. The existing print layout's generic ADMIN
check and local print-role decisions likewise do not certify the roadmap's print
permissions or price-safe projections. Resolve those boundaries in their owning
phase, preserving reached screens and paper rather than replacing the application.

Existing real auth/account data and local operational demo data are distinct.
Accepted integration uses real identities and server-enforced rules; an API failure
must not fall back to fixture/local success. This standard does not implement the
planned departments, price rules or account lifecycle by itself.

## Existing authentication and transport owners

Read these sources when changing identity or request transport:

- [Authentication middleware](../../apps/api/src/middlewares/auth.middleware.ts)
  verifies a bearer JWT and loads current account state. The private identity
  guard accepts any extant credential-valid identity. The business guard also
  enforces current eligibility before handing off to route-level role checks.
- [Authorization middleware](../../apps/api/src/middlewares/authorization.middleware.ts)
  supplies the existing role allowlist boundary.
- [Auth service](../../apps/api/src/modules/auth/auth.service.ts) owns account/token
  operations; [security infrastructure](../../apps/api/src/infrastructure/security/index.ts)
  owns password and token mechanics.
- [Cookie configuration](../../apps/api/src/core/config/cookie.config.ts),
  [CSRF middleware](../../apps/api/src/middlewares/csrf.middleware.ts) and
  [auth routes](../../apps/api/src/modules/auth/auth.routes.ts) define the protocol.
- [Browser API client](../../apps/web/src/services/api/api-client.ts) owns the
  credentialed Axios client, in-memory access token and refresh coordination.

Preserve one session owner: React Query owns browser session state; the access token
stays in transport module memory, the refresh token in an HttpOnly cookie and the
CSRF token in its intentionally readable cookie. Do not create a second auth context,
browser-persisted token store or parallel refresh client.

Refresh, logout, password-change and password-reset operations revoke or rotate refresh records. Already-issued
stateless access JWTs remain usable until expiry unless another checked authority
condition fails. There is no access-token revocation store; do not promise immediate
logout of every existing access token.

Current refresh interception clears the in-memory token on any refresh failure and
redirects only for the exact expected anonymous code/status pairs. Other failures
remain errors. Changing that policy requires coordinated transport/session tests;
do not normalize every network/403/429/500 failure into a successful anonymous state.

## Cookies, CSRF, origins and deployment topology

The default production topology is one origin: a proxy routes `/api/*` to Express
and page traffic to Next.js. Cookie domain is omitted. A readable cookie on an
unrelated API domain is unavailable to frontend JavaScript, so changing
`SameSite` alone does not support unrelated registrable domains. See the
[runtime reference](../../PROJECT_REFERENCE.md#local-and-production-http-topology) and
[Caddy routing template](../../Caddyfile).

Preserve deliberate `HttpOnly`, `Secure`, `SameSite`, path and expiry behavior.
Production HTTPS and proxy termination must match cookie configuration; local HTTP
development uses the existing development policy. Never remove CSRF or broaden CORS
to make an integration pass.

The current double-submit middleware compares the readable cookie and custom header;
it is not a signed session-bound CSRF token. Preserve the existing route-specific
coverage, including cookie-based auth actions. Review this design with the actual
origin/subdomain threat model before changing topology. SameSite and CORS are not
substitutes for the required CSRF boundary.

Use exact trusted origins. Current CORS allows requests without an Origin header;
that is not authentication or proof of a trusted caller. `TRUST_PROXY` must match
the actual trusted proxy path, because forwarded IP/protocol information affects
logging, rate limits and secure transport reasoning. Verify edge headers and proxy
behavior in the deployed environment rather than infer them from local source.

## Validation, output and injection protection

Runtime-validate route/body/query fields through the existing shared Zod boundary.
Bound string sizes, collections, page sizes and work caused by one request. Reject
unsupported privileged fields instead of mass-assigning an input object into Prisma.
Use explicit write fields and explicit public selection/mapping. An ORM type or
TypeScript assertion is not a public-data allowlist.

Use Prisma parameterization and reviewed parameterized SQL. Keep identifiers and
sort choices on trusted allowlists. Do not compose query or shell syntax from user
strings. If a subprocess is part of an accepted feature, use a fixed executable,
argument arrays and bounded resources; audit any attacker-influenced option values.

Render text through React's escaped interpolation. Rich HTML/markdown, active file
formats and embedded scripts need a dedicated accepted design, sanitizer/allowlist
and tests at the actual rendering boundary. Validate navigation/media URL schemes
and hosts where applicable; use the existing safe-return-path owner for auth redirects.

## Secrets, configuration, errors and logs

- Keep secrets in validated server configuration and ignored local/deployment storage.
  `NEXT_PUBLIC_*`, client props, QueryClient state and public assets are public.
- Generate independent high-entropy values for every `AUTH_*_SECRET` group documented
  in [.env.example](../../.env.example). Validate required production values and
  reject placeholders; do not copy development credentials into production.
- [JWT secret validation](../../apps/api/src/core/config/auth-secrets.ts) requires
  four distinct values in production and rejects recognized placeholders.
  Outside production, omitted refresh, verification and reset secrets can fall
  back to the access secret.
- Reuse central safe errors and stable domain error codes. Public responses must not
  expose raw SQL, Prisma/provider objects, internal paths, stack traces or credentials.
- Preserve request IDs and structured redacted logging. Check URL/query as well as
  headers/body when adding a new credential name. A provider error message can contain
  sensitive data; log a safe classification and correlation identity instead.
- Verification/reset links are intentionally one-time credentials. Keep them out of
  ordinary logs, query/cache keys, analytics and return navigation. Console email
  previews belong only in the existing ignored local preview storage.
  [Reset-link validation](../../apps/web/src/features/auth/hooks/auth.hooks.ts)
  uses an abortable mutation with no credential in its key, variables or result.
  Test fixtures use isolated synthetic credentials. Keep live credentials and
  user secrets out of fixtures.

These are operational obligations as well as code rules. Never request or print
production secret values merely to verify that configuration is present.

## Optional capabilities: apply only when introduced

| Capability                     | Required security decisions                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload/private download        | Bounded bytes/dimensions/processing, content validation, generated storage keys, authorized access, safe content type/disposition, retention and cleanup |
| User-influenced outbound URL   | Allowed protocols/destinations, DNS/private-network/metadata protection, redirect policy, timeouts and size limits                                       |
| Webhook                        | Provider authenticity over required raw bytes, replay identity, bounded parsing and idempotent effects                                                   |
| Background job                 | Trusted durable identity, current authority at execution, safe duplicates/retries, private payload and shutdown/recovery ownership                       |
| Third-party script/embed       | Accepted need, data exposure, origin/sandbox/CSP/integrity policy and lifecycle                                                                          |
| Sensitive or high-value action | Fresh authority/confirmation appropriate to risk, audit identity from the server and durable uncertain-outcome handling                                  |

Do not implement these subsystems because the table mentions them. If Next.js Route
Handlers or Server Actions are later introduced, treat them as reachable server
endpoints with independent validation/authority/CSRF controls; they are not a way to
bypass the Express contract or reuse a browser-memory JWT on the server.

## Security verification and release limits

Test unauthorized, wrong-role/owner, stale-state, malformed, over-limit and replay
outcomes as applicable, including protected data that remains unchanged. Exercise
the actual middleware stack for HTTP claims and actual database writes for races.
Inspect safe output/logs and browser storage/bundle boundaries where affected.

Keep rate-limit, request-size, server timeout and dependency controls explicit. Review
advisories when changing dependencies; installing the newest release is not a substitute
for compatibility checks. Test HTTPS/proxy/cookie/header behavior in the deployment
environment before release. API Helmet headers do not by themselves prove Next.js
page CSP or edge configuration.

Report known residual risks, missing evidence and accepted constraints through the
feature review. No model, document or test suite guarantees a vulnerability-free app.

Primary references for the underlying controls:
[Express production security](https://expressjs.com/en/advanced/best-practice-security/),
[OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
Repository-specific owners and locked-version behavior take precedence over an
upstream example that assumes another session or deployment architecture.
