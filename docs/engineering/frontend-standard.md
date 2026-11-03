# Frontend standard

Read this guide for Next.js routes, React components, forms, browser API integration,
server-state hooks or cache changes. It owns frontend placement and behavior. Start
with the [engineering index](README.md) and the [constitution](../../.specify/memory/constitution.md).
Use [API contracts](api-contracts.md) for wire validation, [security](security.md) for
authority and credentials, [code style](code-style.md) for types and extraction, and
[testing](testing.md) for evidence. The [integration walkthrough](integration-walkthrough.md)
traces an existing complete request without introducing a second architecture.

The protected [root roadmap](../../plan.md) owns Oriental Shoes' P01–P08 scope,
business decisions and client-input gates. Its recorded draft/owner-review state
is not changed by adopting these guides. Read the roadmap and
[historical migration audit](../FRONTEND_MIGRATION_AUDIT.md) at project intake;
preserve both files and distinguish their dated observations from current source.
Do not approve a phase, supply missing client values or implement business changes
merely because a documentation example mentions them.

## 1. Establish the feature before editing

During PLAN, decide and record the exact feature API interfaces, model/form mapping,
query keys, fetch eligibility, mutation/cache/error behavior and draft/late-response
rules using this guide. During IMPLEMENT, consume that approved technical blueprint
and the selected task brief; inspect their referenced owners and current signatures
before writing. The [implementation handoff](../workflow/implementation-handoff.md)
owns the required fields and readiness gate. Routine coding choices within the
fixed contracts are allowed; missing material design or stale assumptions must be
resolved through an authorized planning step before dependent implementation.
Continue independent authorized work while that correction is pending.

1. For roadmap delivery, resolve the selected phase, Spec Kit feature and authorized
   tasks using [phase delivery](../workflow/phase-delivery.md). For ordinary maintenance,
   use the user request and established behavior without inventing a phase. Inspect
   the affected route, feature, shared contract and existing components.
2. Record the approved surface and interaction that must survive integration:
   route, navigation, layout, labels, responsive behavior and language/direction.
   A missing required surface is a product decision to resolve explicitly.
3. Confirm acceptance of the backend group this UI depends on, using
   [backend standard](backend-standard.md). An endpoint stub or mocked success does
   not establish real persistence, validation or authorization. If the change has
   no backend dependency, record that capability as N/A with its reason.
4. During PLAN, record the applicable state/cache decisions from sections 4–7 and
   exact owners in the blueprint. TASKS later derives execution briefs in `tasks.md`;
   PLAN does not create that task list. During IMPLEMENT, verify those decisions and
   reused interfaces rather than choosing them anew. Then implement the selected
   brief in the order in section 9.

**Ready to implement:** the backend gate has evidence, each visible action maps to
an accepted API contract, the selected brief passes the handoff gate against current
source, and the planned UI changes fit the authorized surface.

### Distinguish the current Oriental boundary from the target

Real authentication, recovery, profile, password and session controls already use
the API. Operational orders/customers/staff/manufacturing/report views still use
[MvpStoreProvider](../../apps/web/src/features/prototype/state/mvp-provider.tsx)
and browser-local snapshots. Its fixture identity, role and mutations are not
department authorization or persisted server operations. The
workspace layout at `apps/web/src/app/(workspace)/layout.tsx` currently protects
these views with the real session while mounting that local provider. A successful
login therefore does not prove that an operational command is backend-integrated.

For each selected phase, the blueprint must inventory its reached views, dialogs,
store calls and dependent shared controls, then name the real contracts/hooks that
replace their authority after the backend gate. Converted consumers read the API
through React Query; an API error remains an error, with no fixture or local-store
fallback. Do not remove the provider or reusable `prototype` components wholesale
while unconverted consumers still depend on them. Their folder name is not a
classification of disposable UI. Keep isolated development previews separate from
production authority according to the roadmap.

Current generic roles are `USER` and `ADMIN`; the
[workspace shell](../../apps/web/src/components/workspace/workspace-shell.tsx)
derives a workspace label from the route. The
print layout at `apps/web/src/app/(print)/layout.tsx` requires real ADMIN, while
the order-print view also checks local preview role. These are existing limits,
not the completed employee-department/print policy. Apply the selected roadmap
gate and [security](security.md) before replacing those controls; hiding a link or
changing the route label cannot grant access.

## 2. Place code by responsibility

The following is the canonical shape for a new feature. `<feature>` is a naming
placeholder, not a directory to create literally. Create a file only when it owns
real behavior; a small feature can use one file per responsibility.

```text
apps/web/src/app/.../page.tsx          Route composition and metadata
apps/web/src/features/<feature>/
  api/                               Transport calls and response parsing
  hooks/                             Queries, mutations and cache lifecycle
  model/                             Pure rules, form-only schemas and adapters
  components/                        Feature presentation and interaction
apps/web/src/components/              Established cross-feature UI components
apps/web/src/shared/                  Cohesive cross-feature behavior
packages/contracts/src/               Shared browser-safe wire schemas and types
```

| Owner             | Put here                                                          | Keep elsewhere                                        |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Route page/layout | Compose feature components and route-specific shells              | Reusable mutation logic and business decisions        |
| Feature API       | Method/path, request and response contracts, central-client call  | React state, notifications and navigation             |
| Feature hooks     | Query keys/options, mutations, cache synchronization              | Markup and provider credentials                       |
| Feature model     | Pure derivation, form-only validation, deliberate UI/wire mapping | HTTP calls and copied shared wire schemas             |
| Feature component | Semantic markup, form interaction, local display state            | Persistence authority and a second transport          |
| Shared component  | An existing reusable visual primitive                             | Product-specific workflow hidden behind generic props |

The existing `auth` and `users` features demonstrate the API/hooks/components
seams. Their form schemas come directly from contracts; this does not require an
empty `model/` directory. Some existing auth navigation helpers live in `utils/`.
Reuse an existing owner when extending it; use `model/` for new pure feature rules
rather than spreading the same rules across components and hooks. The extraction
criteria remain in [code style](code-style.md).

Oriental's existing operational features also have reached `screens/` owners under
`administration`, `sales`, `approval`, `manufacturing` and `printing`. Preserve those
screen/route compositions while adding the planned API/hooks/model seams; new
focused presentation can use `components/` where appropriate. Do not move all
screens or replace the paper implementation to normalize the directory tree.
Existing shared Oriental controls in `features/prototype/components/` and paper
owners in `features/orders/components/` and `features/orders/paper/` remain valid
extension points. The blueprint records deliberate extraction and caller updates.

Frontend code imports `@template/contracts`, not `@template/api`,
`@template/database`, Prisma or server provider clients. Import the established
transport from [api-client.ts](../../apps/web/src/services/api/api-client.ts).
Creating another Axios instance or bypassing it with a component-level request
would bypass its credential, CSRF, refresh and error behavior.

## 3. Keep the Next.js boundary deliberate

Read [apps/web/AGENTS.md](../../apps/web/AGENTS.md) and the relevant guide installed
under `apps/web/node_modules/next/dist/docs/` before framework-dependent changes.
The [web manifest](../../apps/web/package.json) and lockfile own supported versions.
For example, the bundled `01-app/01-getting-started/05-server-and-client-components.md`
and `01-app/03-api-reference/01-directives/use-client.md` explain the boundary for the
installed framework. If dependencies are absent, use the supported setup in the
[root README](../../README.md), or report that installed guidance is unavailable;
do not claim to have read it.

Keep pages/layouts as server components where they only compose UI. Put
`"use client"` at the interactive entry point that uses hooks, event handlers or
browser APIs. Its imports become part of the client graph; pass serializable
values across the server/client boundary and keep server configuration out of
that graph. Browser APIs also need appropriate runtime guards because client
components can participate in initial server rendering.

This repository's authenticated browser flow uses an access token held in module
memory. A server component cannot read that browser value. Adding a protected
server fetch, Server Action or Next route handler is an architectural change to
design with [security](security.md) and [API contracts](api-contracts.md), not a
shortcut around the Express boundary. Production business writes belong in Express;
the existing local operational mutations are migration inputs, not an alternative
persistence boundary to carry into new integrated features.

[AppProviders](../../apps/web/src/app/providers.tsx) creates one stable QueryClient
through `useState`; keep using it. Do not create a client per component or render.
The [Next configuration](../../apps/web/next.config.ts) already enables typed routes
and React Compiler. Consult installed guidance before adding framework options or
manual memoization to solve an evidenced rendering cost.

[RootLayout](../../apps/web/src/app/layout.tsx) preserves Arabic `lang`, RTL direction,
Cairo font setup, ordered Oriental styles and the existing ToastProvider inside
AppProviders. These are current product owners, not a second session store. The
web manifest uses the checked-in Next launcher for development/start and webpack
for development/build; do not copy a different project's startup assumptions.

## 4. Give every kind of state one owner

| State                                        | Owner                                  | Decision to record                                          |
| -------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| Server resources and current session         | TanStack React Query                   | Key, fetch eligibility, freshness and affected mutations    |
| Form draft and field errors                  | React Hook Form                        | Initial values, transforms, dirty reset and submit behavior |
| Open dialog, expanded row, temporary notice  | Local React state                      | Lifetime and reset condition                                |
| Shareable filters, selected resource or page | URL when required by the accepted flow | Parsing/defaults and navigation behavior                    |
| Derived labels, totals and filtered display  | Pure render/model computation          | Source inputs and any demonstrated computation cost         |

This table is the target for new/converted features, not a claim that current
operational forms already use React Hook Form or that local snapshots are server
state. Presentation preferences such as the existing sidebar's collapsed state may
remain browser-local; credentials and operational authority may not. Monetary and
workflow values displayed by integrated screens follow the authoritative API;
browser derivation does not establish a price, persisted total or allowed transition.

Use `useSession` and `AUTH_SESSION_QUERY_KEY` from
[auth.hooks.ts](../../apps/web/src/features/auth/hooks/auth.hooks.ts). A second
session context, independent store or persistent copy creates competing authority.
Use the session to render UI; keep authorization checks in Express as specified by
[security](security.md).

Derive values from existing props/state rather than synchronizing another copy in
an Effect. Submit a user action from its event/form handler. Use Effects for real
external synchronization, with cleanup for listeners, timers and subscriptions.
See [React's Effect guidance](https://react.dev/learn/you-might-not-need-an-effect).

## 5. Define queries, mutations and late responses together

### Queries and cache identity

Build serializable array keys from the feature/resource and every input that
changes the result: identity scope where necessary, ID, normalized filters, sort
and page. Reuse one key owner in the feature hooks; do not repeat differently
spelled keys in components. A resource key must distinguish users or contexts
when data can differ between them. Keep credentials out of keys and routine URLs.
Intentional purpose-bound verification/recovery links follow the approved protocol
and handling in [security](security.md); they do not permit access/refresh tokens,
passwords or provider secrets in navigation URLs.

Read the actual defaults in
[query-client.ts](../../apps/web/src/shared/query/query-client.ts) before overriding
them. Current queries are fresh for 30 seconds and retry at most twice, only for
Axios network failures or HTTP 500–504. Mutations do not automatically retry.
The session query sets its own freshness, collection and retry options in
`auth.hooks.ts`. Defaults are repository decisions, not TanStack's upstream defaults.

Render errors from the rejected query; returning `[]` after a failed read changes
failure into a false empty state. Fetch independent resources without unnecessary
serial dependency. Bound list requests using the accepted pagination contract;
filtering a small displayed page does not search the full server dataset.

### Mutations and confirmation

Let one feature mutation hook own the mutation and affected cache updates. Await
the server result before presenting persisted success. Use an immutable
`setQueryData` update when the returned projection completely describes that cache
entry, as the profile hook does. Invalidate affected lists, detail entries or
aggregates when the response cannot describe them fully. If the UI's completion
depends on refetch finishing, return/await that invalidation work in the mutation
lifecycle. Clearing the whole cache is reserved for an actual identity/session
boundary, not an ordinary resource update.

An optimistic feature needs an explicit pending display, prior-state snapshot,
rollback and final synchronization. Use server-confirmed state when a speculative
transition would misrepresent a consequential result. Retry a write only according
to the server's idempotency contract in [data patterns](data-patterns.md); a timeout
can leave the result unknown even if the server committed it.

### Cancellation, identity and cleanup

For new cancellable reads, pass the query function's `AbortSignal` through the
feature API to the existing Axios client's request options. Existing `usersApi`
methods do not currently accept a signal; do not describe that as existing
coverage. Cancellation stops unwanted client work, not a committed server write.

Before adding a resource with overlapping reads/writes, define what happens when
the user changes account, selected ID, filters or route while a request is in
flight. Use keys that preserve identity, cancel appropriate reads, and gate manual
cache updates or UI callbacks against the current request/account where needed.
A slow result from an old account must not repopulate the current account's state.
Component unmount alone does not guarantee all requests stop. Mutation settlement
must still leave shared state consistent even when its original form has closed.

The existing logout mutation's `onSuccess` handler clears local token/cache state
after confirmed server success. Transport refresh failures have separate token
cleanup behavior described in [security](security.md). This is a baseline to extend,
not proof that all future resource
races are solved. Add focused late-response tests when a feature introduces that
risk. See TanStack v5 [query keys](https://tanstack.com/query/v5/docs/framework/react/guides/query-keys),
[mutation responses](https://tanstack.com/query/v5/docs/framework/react/guides/updates-from-mutation-responses),
[invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations)
and [cancellation](https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation).

## 6. Treat the form draft separately from the server record

Use React Hook Form with the shared request schema through `zodResolver` when the
wire fields match the form. Distinguish `z.input<typeof schema>` from the parsed
output type when trimming, preprocessing or defaults change values. The submit
callback sends parsed output; form-only fields belong in a feature model and need
an explicit mapping to the shared request, not a second wire contract.

Reuse [FormField](../../apps/web/src/components/forms/form-field.tsx) where it fits
the existing surface, or preserve the established Oriental custom field markup and
visual classes. Ensure labels, errors, registered input props and ref reach the
real input; adopting a form helper is not permission to restyle the paper or dialogs.
[applyApiFormError](../../apps/web/src/shared/forms/form.ts) maps API field errors
to known top-level form fields after removing `body.` and returns the general
message. It does not currently resolve arbitrary nested field paths. A nested
form needs a deliberately typed and tested mapping rather than a guessed cast.

Choose draft reset behavior before wiring a query into the form:

- **Initial load:** provide deliberate default values or mount the form once its
  initial record is available. Keep loading/error UI outside an editable draft.
- **Background change:** retain dirty values or show that newer server data is
  available. Resetting all fields whenever a query refetches can erase edits.
- **Confirmed save:** reconcile the returned record and mark the intended submitted
  values clean, while preserving any later edits when overlapping editing is allowed.
- **Conflict:** retain the draft, show the accepted reload/reconcile path and use
  the server's version/transition semantics. Silent last-write-wins behavior needs
  an accepted requirement; a disabled button cannot enforce data concurrency.
- **Cancel, record change or navigation:** define whether to discard, preserve or
  request a decision for an unsaved draft according to the accepted interaction.

RHF `defaultValues` are cached; its reactive `values` prop updates/reset behavior
must be chosen consciously. The existing `ProfileForm` uses `values` from session
data without a dirty-preservation option. Treat it as a small existing example,
not a universal safe pattern for long-lived forms. Verify installed RHF types and
the [useForm reference](https://react-hook-form.com/docs/useform) before choosing
reset options for a new form.

Await `mutateAsync` in the submit handler, show pending state and prevent duplicate
submission through every relevant trigger. Preserve input and map field/general
errors on rejection. Announce success only after confirmation. A failed submit
must not close the editor, clear the draft or claim a successful save.

Existing operational forms such as
[SalesCreateOrderView](../../apps/web/src/features/sales/screens/sales-create-order-view.tsx)
use local state and store calls today. The selected blueprint must separate
incomplete-draft validation from final submission, field/form input from server
authority, and local unsaved edits from confirmed persistence. Follow the roadmap's
current client-input decisions and received mappings. Preserve already implemented
paper text fields, the middle floor-addition column and read-only financial cells;
bind authoritative data rather than scheduling their reconstruction. Inspect
[Cell](../../apps/web/src/features/orders/components/cell.tsx) and the existing
column/side-table owners before generating tasks. Demonstration option arrays or a
zero display fallback do not establish production lookup/pricing. Converting a
selected form to the shared schema/RHF
pattern is scoped integration work, not permission to replace every form or build
a generic form engine.

## 7. Make async states observable

For each query and action, implement the applicable rows. Record a reason for
omitting a state that cannot occur under the accepted contract.

| State                 | Required behavior                                                            | Observable check                                                    |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Initial loading       | Distinct progress while the first authoritative result is pending            | Slow request does not display false empty/success content           |
| Background fetching   | Keep valid existing content with proportionate refresh feedback              | Refetch does not reset a dirty form or blank the screen             |
| Empty success         | Explain the actual empty result and any accepted next action                 | Valid empty response differs from failed read                       |
| Read error            | Show a useful message and retry where safe; retain request ID when available | Rejection does not become an empty list or sign-out                 |
| Write pending         | Disable conflicting submits and indicate the operation                       | Repeated click/Enter cannot issue unintended duplicate writes       |
| Confirmed success     | Display server-confirmed projection and synchronize cache                    | Navigation or remount shows consistent data                         |
| Validation failure    | Associate field errors; preserve draft and general error context             | Invalid response reaches the relevant field or visible form message |
| Conflict/stale result | Keep draft and offer the accepted reconciliation path                        | Stale write does not silently replace newer state                   |
| Denied/anonymous      | Use existing route/session behavior and a useful denied state                | A hidden button does not replace backend denial                     |
| Unknown write outcome | State uncertainty and provide safe reconciliation/retry                      | Lost response does not become fabricated failure or success         |

Use `getApiError` from the central transport instead of ad hoc status parsing.
Reuse the pending/error/redirecting/authorized boundaries in
[ProtectedRoute](../../apps/web/src/components/auth/protected-route.tsx) when
protecting accepted screens. The exact refresh/session failure classification is
part of [security](security.md); a generic network failure must remain distinguishable
from a known anonymous session.

Reuse [useToast](../../apps/web/src/components/toast/toast-context.tsx) and existing
inline/confirmation surfaces. Choose one owner for each notice so a hook and its
component do not announce the same result twice. A local unsaved row edit may have
an appropriately worded draft notice; an integrated save/submit/transition notice
must follow confirmed persistence. Retain Arabic feedback and visible retry/error
context rather than copying English boilerplate messages into operational screens.

## 8. Preserve usability and measure meaningful costs

Keep approved typography, tokens, spacing, components, routes and navigation.
Functional wiring can add necessary progress, validation and failure feedback in
the existing design. A new screen, redesign or changed interaction needs accepted
scope; the standard itself does not authorize one.

Preserve the current paper and print family:

- [OrderPaperForm](../../apps/web/src/features/orders/components/order-paper-form-screen.tsx)
  owns the current read/edit/print presentation, eight-row print chunks, piece
  actions, adjustment fields and paper lower area. Preserve searchable cells and
  portal-menu behavior through the existing paper components.
- [oriental.css](../../apps/web/src/styles/oriental.css) owns the ordered stylesheet
  imports. [base-print.css](../../apps/web/src/styles/oriental/base-print.css) sets
  A4 landscape; [report-print.css](../../apps/web/src/styles/oriental/report-print.css)
  assigns the report family a named A4 portrait page. Keep both order-print aliases
  mapped to the same approved projection and preserve browser Print/Save as PDF.
- Field-policy, finance/print eligibility and acceptance examples remain owned by
  the [roadmap](../../plan.md) and selected feature. Factory API projections must
  omit forbidden finance; `hideFinancials` or print CSS alone is not access control.

When affected, verify print boundaries such as 1/8/9/17 rows, cancelled/empty rows,
report sections and RTL/responsive behavior at the boundary required by
[testing](testing.md). Historical audit screenshots/test counts are not current
acceptance or a reason to restore removed routes or old print orientation.

Use semantic links for navigation and buttons for actions, explicit button types,
associated labels, keyboard-operable controls and visible focus. Communicate
errors/progress through suitable text and status/alert semantics, not color alone.
Maintain focus when dialogs open/close and after validation where applicable.
Verify affected narrow/wide layouts and the accepted language/direction. Preserve
existing input autocomplete and accessibility associations when extracting fields.

Choose the smallest relevant performance correction: narrow a client boundary,
avoid repeated requests, bound payloads or remove a measured rendering bottleneck.
Use the installed framework's Link/image guidance when those components are
affected. Speculative memoization, blanket caching and loading every record into
the browser are not substitutes for evidence or a bounded API.

## 9. Implement a new feature in this order

| Step | Action                                                                      | Complete when                                                                                                                         |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Finish section 1 intake and the dependent backend gate                      | Actual source, contracts, backend tests and review support the needed capability                                                      |
| 2    | Implement the brief's API interfaces with shared schemas and central client | Exact method/path/payload and runtime-validated result match [API contracts](api-contracts.md), including malformed/failure responses |
| 3    | Implement the specified query keys, eligibility and mutation/cache behavior | Each changing input has the approved cache identity; affected entries, retries and late responses follow the blueprint                |
| 4    | Implement planned pure model/form rules where needed                        | Input/output mapping and draft/reset semantics match the brief and remain separate from transport and presentation                    |
| 5    | Connect the existing approved components and route                          | Applicable states from section 7 render with accessible interaction and minimal visual change                                         |
| 6    | Add/extend discovered tests                                                 | Required behavior, errors, cache/draft transitions and relevant races are asserted at the boundary they prove                         |
| 7    | Verify and review the bounded batch                                         | Affected checks and both review dimensions in [code review](code-review.md) pass; unperformed browser/infrastructure work is explicit |

**Frontend group complete:** the accepted behavior works against its verified
backend, the affected cache/draft/state/accessibility cases have evidence, and the
report distinguishes this group from full phase or release acceptance. Use
[testing](testing.md) for commands and [phase delivery](../workflow/phase-delivery.md)
for the final gate; a green component test does not establish browser acceptance.
