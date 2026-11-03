# Oriental Shoes engineering standards and reading map

These guides define how to extend and review Oriental Shoes. The
[constitution](../../.specify/memory/constitution.md) makes them mandatory; accepted
feature requirements define what to build. Guidance is self-contained and does not
require another project's files, global skills or Spec Kit initialization after clone.
Follow the [root setup](../../README.md#local-setup) for actual runtime prerequisites.

## Start here

1. Read the constitution and the user's scope. Inspect Git status, the roadmap if
   present, actual manifests and the selected feature's accepted artifacts.
2. At initial phase intake, read the nine core guides below in full. For subsequent
   task batches, reopen their applicable sections and actual source/callers. A
   context reset or handoff must preserve references and reread any missing context.
3. Identify affected boundaries, file owners, acceptance risks and checks. Record
   them in the feature's existing plan/tasks when the command permits writing, or
   in the response during a read-only review. Apply every relevant rule; mark an unused capability
   `N/A` with a reason instead of inventing that capability.
4. Execute the canonical recipe for the selected layer, then review against the same
   guides. Finish with verifiable behavior, review findings and honest evidence.

For Spec Kit, [phase delivery](../workflow/phase-delivery.md) owns the exact command
sequence, scope and feature selection. Outside Spec Kit, read this index and the
guides for the boundaries actually touched; ordinary maintenance does not invent a phase.

## One owner per topic

The nine rows below are the core guide set. The last column defines when a guide
must be revisited after phase intake.

| Guide                             | Owns                                                  | Revisit when                                        |
| --------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| This index                        | Reading, placement and adoption                       | Intake, changed boundaries, handoff                 |
| [Code style](code-style.md)       | Names, types, modules, reuse and efficiency           | Any production change or review                     |
| [Backend](backend-standard.md)    | Express module and lifecycle recipe                   | Routes, services, adapters, background effects      |
| [Frontend](frontend-standard.md)  | Next/React, forms, query/cache and interaction recipe | UI, hooks, feature APIs, session/transport          |
| [API contracts](api-contracts.md) | Shared schemas, validation, HTTP and compatibility    | Inputs, outputs, endpoints, integration             |
| [Data patterns](data-patterns.md) | Prisma/PostgreSQL, queries, transactions, migrations  | Persistence, schema, races, history                 |
| [Security](security.md)           | Authority, credentials, private/untrusted boundaries  | Identity, data access, input, files, providers      |
| [Testing](testing.md)             | Evidence, discovery, commands and cleanup             | Planning tests, changed behavior, completion        |
| [Code review](code-review.md)     | Review scope, findings and separate verdicts          | Post-edit review, analysis, convergence, phase exit |

The [integration walkthrough](integration-walkthrough.md) traces an existing flow
and applies these rules; it is a teaching reference, not a second rule owner.
[Implementation handoff](../workflow/implementation-handoff.md) owns the detailed
blueprint, per-task execution briefs and readiness gate for the limited implementation
model. Planning resolves material technical decisions from requirements and source;
implementation consumes those recorded decisions and checks for source drift. Read
that guide when producing, reviewing or implementing a phase's artifacts.
[Reusable prompts](../workflow/prompts.md) launch the workflow without hardcoded phases.

Keep full explanations in their owning guide and link from elsewhere. A new file
needs a distinct responsibility. Examples, old code and historical reports do not
waive current rules. Update owning guidance when the documented interface changes.

## Existing Oriental baseline

The root [roadmap](../../plan.md) already exists. Read its current status, decisions,
phase dependencies and client-input rows; preserve it instead of generating another
roadmap. This documentation adoption does not approve its draft phases or client data.
The dated [migration audit](../FRONTEND_MIGRATION_AUDIT.md) is historical evidence;
verify its observations against current source and the roadmap before reuse.

Real authentication, account/profile APIs and PostgreSQL foundation coexist with
operational views backed by local MVP state. The existing owners include
`features/administration/`, `sales/`, `approval/`, `manufacturing/`, `orders/`,
`printing/` and `prototype/`. Operational `screens/` and paper components remain
valid owners. A folder named `prototype` is not permission to discard reached UI.
New API/hooks/model seams integrate those owners without mechanically moving views.

[The MVP provider](../../apps/web/src/features/prototype/state/mvp-provider.tsx)
loads/saves browser snapshots; it is not a production source of business authority.
[Local selectors](../../apps/web/src/features/prototype/state/mvp-selectors.ts)
and URL-derived workspace selection are not server department permissions. The
roadmap owns their replacement and domain rules. Preserve current Arabic/RTL/Cairo,
dialogs, print presentation and both order-print routes while wiring accepted behavior.

## Existing repository and dependency direction

```text
Next.js page / feature component
  -> feature hook / React Query
  -> feature API / central Axios client
  -> Express route / middleware / controller
  -> use-case service / feature rules / queries / mapper
  -> injected Prisma client
  -> PostgreSQL

@template/contracts supplies browser-safe wire schemas to API and web.
@template/database supplies persistence types/client to the API, never the browser.
```

This is a responsibility map. Simple operations may keep a query local to their
service; the [backend recipe](backend-standard.md) defines when extraction earns a file.

| Existing owner                                  | Responsibility                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/app/`                             | Thin App Router pages, layouts and framework boundaries                       |
| `apps/web/src/features/`                        | Existing operational screens/paper UI and feature-local API/hooks/model seams |
| `apps/web/src/components/`                      | Meaningfully shared auth, form, brand and workspace UI                        |
| `apps/web/src/services/api/`                    | Credentialed transport, refresh and safe error normalization                  |
| `apps/web/src/shared/forms/`, `shared/query/`   | Shared form integration and QueryClient policy                                |
| `apps/api/src/app.ts`, `router.ts`, `server.ts` | App/composition/process lifecycle                                             |
| `apps/api/src/modules/`                         | Domain HTTP adapters, use cases, DTO aliases and projections                  |
| `apps/api/src/middlewares/`                     | Shared HTTP parsing, authentication/authorization/errors                      |
| `apps/api/src/core/`                            | Config, generic errors/responses, pagination and core types                   |
| `apps/api/src/infrastructure/`                  | Email, security, logging, OpenAPI and technical adapters                      |
| `packages/contracts/src/`                       | Shared Zod schemas and inferred browser-safe wire types                       |
| `packages/database/`                            | Prisma schema/migrations, generated client and client factory                 |
| `packages/*-config/`                            | Shared TypeScript, ESLint and formatting configuration                        |
| `.specify/`, agent adapters                     | Checked-in Spec Kit runtime, project overrides and commands                   |

The actual package names are `@template/web`, `@template/api`, `@template/contracts`
and `@template/database`. Resolve dependency versions from manifests and lockfile;
retain the installed toolchain until a scoped compatibility change is authorized.
The project currently uses Next.js/React, Express, Zod, Prisma and PostgreSQL.

## Placement decisions

| Behavior                                              | Owner                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Wire fields consumed by web and API                   | Domain schema in contracts; DTO aliases in API                            |
| Backend authorization/use-case sequence               | Owning service, with route authority and transactional rechecks as needed |
| Pure domain rule or reusable domain error             | Feature-local rule/error owner                                            |
| Complex DB selection, reusable query or serialization | Feature query/mapper                                                      |
| Provider SDK/network mechanics                        | Injected infrastructure adapter                                           |
| Form rules, command shaping, pure UI state            | Feature `model/` for new substantive features                             |
| Request and response projection                       | Feature `api/`, using central transport                                   |
| Query keys, mutations and cache reconciliation        | Feature `hooks/`                                                          |
| Layout, focus and transient interaction               | Feature `components/`                                                     |
| New durable invariant                                 | Schema plus migration, enforced through the service's write path          |

Follow existing small-feature owners where they already fit. New substantive modules
use the canonical layout; touched deviations get a bounded correction or an explicit
finding. Do not relocate unrelated code or create empty folders to normalize the tree.

## Adoption and honest baseline

This is an engineering target for new and changed Oriental Shoes work. It does not certify all
pre-existing code as compliant or authorize a blanket rewrite. The guides label
material current limitations alongside relevant rules. Resolve affected limitations
within accepted scope, or report their impact as unfinished work; do not copy them
into new modules as precedent.

Examples introduce no additional product domain, tenant model, payment gateway,
upload pipeline or background queue. Extend Oriental Shoes only through accepted
requirements and the selected roadmap phase; examples do not add business scope. Performance/security evidence must match actual tests and environment.
The same intake and review work applies whether the agent is a strong or weak model.
