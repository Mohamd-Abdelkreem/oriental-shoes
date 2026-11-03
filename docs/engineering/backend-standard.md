# Backend Standard

Use this guide for Oriental Shoes Express modules, use cases, provider adapters and process
lifecycle. Read the [engineering index](README.md) first, then use
[API contracts](api-contracts.md) for wire formats, [data patterns](data-patterns.md)
for persistence, [security](security.md) for authority and
[testing](testing.md) for evidence. The [constitution](../../.specify/memory/constitution.md)
defines scope and acceptance; this guide supplies the canonical implementation recipe.

## 1. Start from the existing owners

The checked-in API uses TypeScript ESM, Express 5 and explicit constructor
dependencies. Verify current versions in [the API manifest](../../apps/api/package.json)
and the lockfile before using framework-specific guidance.

| Existing owner                   | Responsibility                                                           |
| -------------------------------- | ------------------------------------------------------------------------ |
| `apps/api/src/server.ts`         | Database/process startup, HTTP timeouts, signals and shutdown            |
| `apps/api/src/app.ts`            | Application factory, middleware order, API mounting, final errors        |
| `apps/api/src/router.ts`         | Construct services/controllers and mount module routers                  |
| `apps/api/src/modules/<domain>/` | Domain routes, controllers, services and focused helpers                 |
| `apps/api/src/middlewares/`      | Reusable authentication, role, CSRF, validation and HTTP concerns        |
| `apps/api/src/core/`             | Configuration, safe errors, responses, request types and pagination      |
| `apps/api/src/infrastructure/`   | Database error translation, email, security primitives, logs and OpenAPI |
| `packages/contracts/src/`        | Browser-safe request/response schemas and inferred wire types            |
| `packages/database/`             | Prisma client factory, schema, generated client and migrations           |

The request path is route middleware → controller → service → persistence or
adapter → explicit response mapping. Build dependencies at composition boundaries,
not inside controllers or individual requests. Existing classes are the default
for new domain controllers/services. Pure rules, mappings and route factories can
be functions; this pattern does not require every helper to become a class.

## 2. Canonical module recipe

During PLAN, use this recipe to decide and record exact interfaces, dependencies,
use-case steps, query/write predicates, transaction boundaries, error mappings and
verification cases in the technical blueprint. TASKS later derives execution briefs
in `tasks.md` from that design; PLAN does not create the task list. During IMPLEMENT,
read the approved blueprint and selected brief, then verify the referenced current
owners and signatures before writing. The
[implementation handoff](../workflow/implementation-handoff.md) owns the required
fields and readiness gate; this recipe does not delegate unresolved design to the
implementation model.

Follow the approved steps in order. Routine coding choices remain possible within
the fixed contracts and architecture. A missing material design decision or stale
interface blocks its dependent work until resolved through an authorized planning
step; independent authorized work may continue. A path containing `<domain>` is a
proposed placement pattern, not an existing module or permission to create it.
Create optional files only when their planned responsibility exists.

| Proposed module file     | Contents                                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| `<domain>.routes.ts`     | Router factory, middleware ordering and endpoint registration              |
| `<domain>.controller.ts` | Controller class adapting validated HTTP context to service calls          |
| `<domain>.service.ts`    | Service class owning use cases, policy and dependent writes                |
| `dto/<operation>.dto.ts` | Alias/re-export of a shared request schema and inferred type               |
| `<domain>.mapper.ts`     | Persistence selections and safe DTO mappings when substantial/reused       |
| `<domain>.queries.ts`    | Complex or reused feature-local reads, with explicit transaction ownership |
| `<domain>.rules.ts`      | Pure domain decisions with meaningful independent behavior                 |
| `<domain>.types.ts`      | Independently shared module types that do not belong in wire contracts     |
| `<domain>.errors.ts`     | Named safe domain errors that do not belong in generic core errors         |
| `index.ts`               | Deliberate public exports consumed by composition or other modules         |

1. **Verify the planned use case.** Read its accepted requirements, blueprint, task
   brief, callers and existing foundations. Confirm the specified actor, input,
   result, denial/conflict/failure outcomes, invariants and side effects against
   current source. Reuse the planned service owner. Done means the handoff gate
   passes and no material decision has been left for implementation to invent.
2. **Define the shared contract.** Add the authorized request and response schemas
   to the appropriate `packages/contracts/src/` domain and exports. Follow the
   [contract recipe](api-contracts.md#2-define-an-operation-before-wiring-it).
   Done means both raw input and safe output have one executable owner.
3. **Prepare persistence when required.** Apply the planned schema, forward
   migrations, constraints, selection and transaction/concurrency rules using
   [data patterns](data-patterns.md). Done means the specified persistent invariants
   and existing-data handling are implemented; migration execution needs its own
   valid environment.
4. **Implement the service.** Receive only required collaborators in the constructor.
   Implement the planned named methods and input/result interfaces. Keep current authority,
   state transitions and dependent writes together. Done means success and failure
   behavior can be followed without reading HTTP presentation code.
5. **Implement the controller.** Read authenticated context and parsed input, call
   the service and use the established response helper. Done means it contains no
   Prisma queries, business policy or transaction orchestration.
6. **Register routes.** Accept the controller and required shared middleware as
   dependencies. Declare method/path and applicable authentication, role, CSRF,
   rate-limit and schema checks before the handler. Done means a direct HTTP caller
   cannot bypass controls merely by avoiding the frontend.
7. **Compose and document.** Export the intended module surface and construct it in
   `router.ts`; add genuinely shared process collaborators at the owning boundary.
   Align OpenAPI with registered routes. Done means the public app reaches the
   module through one composition path without import-time work.
8. **Verify and review.** Add discovered tests for the required behavior, run focused
   checks and review using [code review](code-review.md). Complete the backend gate
   before dependent frontend integration. Done requires the evidence selected by
   [testing](testing.md), not merely the existence of these files.

Small services may keep straightforward queries/mapping local. Extract when
responsibility, reuse, independent testing or readability earns the boundary.
For new modules, use the filenames above as the default. A cohesive group of many
operation types/errors may later justify a folder; record that reason instead of
choosing a different layout arbitrarily. Existing owners such as auth's `types/`
remain valid extension points and need no unrelated migration.
Use the same pattern across new modules; avoid parallel architectures, generic
base controllers, repository wrappers or DI containers without an accepted need.

## 3. Existing profile flow as a trace

The current profile flow shows the composition seams; it is not a claim that every
line already meets this target standard.

| Step           | Existing implementation                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Shared request | `updateProfileBodySchema` in [auth.schema.ts](../../packages/contracts/src/auth/auth.schema.ts)                                        |
| API DTO alias  | [update-profile.dto.ts](../../apps/api/src/modules/users/dto/update-profile.dto.ts)                                                    |
| Route          | [users.routes.ts](../../apps/api/src/modules/users/users.routes.ts): authenticated `GET /me`; authenticated/CSRF/validated `PATCH /me` |
| Composition    | [router.ts](../../apps/api/src/router.ts) mounts the module at `/users` below the configured API prefix                                |
| Controller     | [UsersController](../../apps/api/src/modules/users/users.controller.ts) calls the service and `ResponseHelper.ok`                      |
| Service        | [UsersService](../../apps/api/src/modules/users/users.service.ts) owns `getCurrentUser(userId)` and `updateCurrentUser(userId, data)`  |
| Projection     | [users.mapper.ts](../../apps/api/src/modules/users/users.mapper.ts) owns `SAFE_USER_SELECT` and `mapSafeUser`                          |
| HTTP evidence  | [app.integration.test.ts](../../apps/api/src/app.integration.test.ts) exercises bearer access, CSRF and profile writes with PostgreSQL |

The current controller uses a fallback empty actor ID and a parsed-body assertion.
For new handlers, establish required authenticated/validated context explicitly;
missing required context is a wiring defect, not a valid empty identity. The service
also pre-reads account state before an update. When a concurrent authority/state
change can invalidate a protected write, use the write-time protections below.
Adoption of this guide does not authorize blanket refactoring of existing modules.

## 4. HTTP boundary and controller responsibilities

Use the shared `validationMiddleware` with schemas for every consumed untrusted
body, query and params shape. It parses asynchronously and puts parsed values in
`request.validated`. Read parsed queries there; Express query properties are not
a mutable DTO store. See [API contracts](api-contracts.md#3-parse-at-real-boundaries)
for field errors and input/output semantics.

Keep controller methods small and explicit:

- Require authenticated identity when the route contract needs it. Derive actor
  identity from server context; a body/URL owner ID selects a target, not permission.
- Pass the parsed fields intended for this use case. Avoid forwarding complete
  request objects, headers or raw cookies into domain services.
- Call a named service operation. Preserve documented errors and let the final
  handler translate them; catch only when a concrete recovery/translation is needed.
- Return an explicit safe DTO through `ResponseHelper.ok` or `.created`, with the
  actual status and argument order described in [API contracts](api-contracts.md).

Express 5 forwards rejections from returned async handlers. Preserve that native
path instead of adding an Express 4 wrapper convention. Detached promises, timer
callbacks and event listeners still need explicit error/lifecycle ownership.
Do not respond with success before work necessary for that success has completed.

## 5. Service, authorization and state boundaries

The service owns the use case: required records, authorization near data,
eligibility, transition rules, persistence sequencing, safe return value and
required audit. A service should express a domain operation, not mechanically
rename every ORM method. HTTP status/envelope construction stays in the controller.

Follow [security](security.md) for current identity, role, ownership and session
semantics. Recheck mutable restrictions or target state at the protected write when
a race matters. A pre-read can explain denial but cannot enforce an invariant
against another transaction. Use appropriate conditional state/version predicates,
affected-row checks, uniqueness, locks or isolation with real database tests.

For commands where repeats or external effects matter, define business identity,
same-request replay, changed-payload conflict, in-progress outcome and stale-update
behavior before implementation. Require idempotency where the accepted operation
needs it; an ordinary read or simple local transform needs no ceremonial key.
Use explicit transitions rather than unrestricted client-selected status patches.

Transactional writes and concurrency details belong in
[data patterns](data-patterns.md#4-transactions-and-concurrent-writes).
Keep all dependent writes on the transaction client. An external timeout cannot
establish whether a remote side effect occurred; represent uncertainty and use the
provider's accepted reconciliation protocol instead of blindly repeating it.

## 6. Queries, mapping and efficiency

Select only fields needed for the operation and map public output deliberately.
`SAFE_USER_SELECT`/`mapSafeUser` demonstrate the selection-to-DTO seam; authorization
still decides which actor may receive that DTO. Persistence and provider objects
must not be spread into public responses.

Simple focused queries may stay inside the service. Move complex/reused reads into
the owning module's query helper when useful. Its input must make actor scope,
filters and transaction client clear. A helper called inside a transaction must
use that client rather than silently reaching for the root database.

Bound list limits, filters, joins, response sizes and background batches. Apply
pagination/filtering/sorting in PostgreSQL with deterministic ordering and a unique
tie-breaker. Assess N+1 relations and duplicate reads rather than hiding them behind
unbounded `Promise.all`. Use indexes justified by actual query patterns; follow
[data patterns](data-patterns.md#3-queries-projections-and-pagination) for details.

## 7. Providers and accepted background work

Place email, SDK, HTTP, file and other provider mechanics in focused infrastructure
adapters. Keep business rules in the service. Reuse the existing `EmailDelivery`
boundary and [email owners](../../apps/api/src/infrastructure/email/) when extending
mail; do not create a second unrelated delivery stack. The current
[email configuration](../../apps/api/src/core/config/email.config.ts) selects
`console`, `resend` or `smtp`. Local console delivery writes ignored HTML previews;
inspect the configured provider and its safe example before describing local mail
setup. Use the actual setup commands in the root README.

Each adapter defines validated input/output, bounded timeout/size/redirect behavior,
safe errors and a deliberate retry policy. Distinguish accepted, rejected and
unknown results. Sanitize failures before logging or returning them; provider
acknowledgement does not prove the user's intended downstream outcome.

Complete dependent database work in short transactions; perform remote I/O outside
them. When accepted work must survive process loss, persist enough state to resume,
deduplicate and reconcile it. Specify who claims it, completion evidence, stale-job
behavior and cleanup. A detached promise or in-memory timeout provides no durable
delivery guarantee. Introduce queues/workers only when accepted requirements need
them; the current foundation supplies no universal job framework.

## 8. Configuration and process lifecycle

Extend the typed owners under `core/config/`; read environment values at those
boundaries rather than throughout domain modules. Validate required values before
accepting traffic. Update safe environment examples and operational instructions
for newly required settings. Separate server secrets from public web configuration;
follow [security](security.md) for fail-closed production requirements.

The API config loader reads the root `.env` outside production when
`RAILWAY_ENVIRONMENT` is absent. Prisma CLI configuration loads the workspace `.env`
through its own `prisma.config.ts`; these are separate mechanisms. Preserve the
existing Prisma 7 factory/adapter and module import conventions.

`server.ts` creates the database once, connects before listening, applies HTTP
timeouts and closes the listener/database on shutdown. It uses `app.listen` on the
configured host/port. A startup port conflict fails instead of selecting another
port; coordinate ports explicitly through the existing configuration. Keep request
middleware in `app.ts` and process ownership in entrypoints.
New long-lived resources must have explicit startup, failure and shutdown owners.
Stop accepting new work before disposing dependencies and settle or persist owned
work. Importing a router, service or test subject must not start a server or worker.

## 9. Completion review

Before declaring a backend group accepted, verify all applicable points:

- Routes apply the intended schema, authentication, authorization, CSRF and limits;
  controllers consume required parsed/server context.
- Services own domain decisions and dependent writes; query/mapper/adapter
  boundaries have clear responsibilities and no import-time side effects.
- Wire shapes, safe projections, HTTP status/errors and OpenAPI agree.
- Persistent invariants, races, duplicates, rollback and provider failures have the
  evidence required by [testing](testing.md); missing infrastructure remains visible.
- Configuration, lifecycle, scripts and new dependencies match the implemented
  runtime. Existing auth and shared boundary regressions remain intact.
- [Requirements and engineering reviews](code-review.md) both pass for the selected
  scope before its dependent frontend work starts.

## References

- [Express 5 error handling](https://expressjs.com/en/guide/error-handling/).
- [Prisma ORM v7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

Use these for the APIs supported by the installed versions. Product requirements
and repository owners determine which capabilities to implement.
