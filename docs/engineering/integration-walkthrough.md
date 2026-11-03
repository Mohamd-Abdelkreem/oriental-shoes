# Integration walkthrough: update the current profile

This walkthrough traces existing `PATCH /api/v1/users/me` behavior to show where
each responsibility lives. It is a source map and reading exercise, not a request
to rewrite the feature or an executable API script. Read the source links before
reusing a pattern; the [constitution](../../.specify/memory/constitution.md) and
owning guides define the target standard. Current behavior is described below
with its limits, rather than treated as automatic compliance with that standard.

This is a real Oriental account flow. Operational customer/order/manufacturing
screens still use browser-local prototype state; they do not provide another
already-persistent example. The protected [root roadmap](../../plan.md) owns their
P01–P08 integration and client-input gates. Its draft/owner-review status is not
changed here. Preserve it and the [historical migration audit](../FRONTEND_MIGRATION_AUDIT.md);
dated audit results are not evidence that an operational phase passed today.

For new work, [API contracts](api-contracts.md) owns the wire boundary,
[backend standard](backend-standard.md) the Express recipe,
[frontend standard](frontend-standard.md) forms/hooks/cache,
[security](security.md) identity and credentials, and
[data patterns](data-patterns.md) persistence and races. Begin a feature through
the [engineering index](README.md) and [phase workflow](../workflow/phase-delivery.md).

## 1. Read the request from the shared contract

[auth.schema.ts](../../packages/contracts/src/auth/auth.schema.ts) exports
`updateProfileBodySchema` and its inferred `UpdateProfileBody`. Despite the auth
filename, this is the existing shared owner for the profile request.

| Field        | Existing request behavior                                                                |
| ------------ | ---------------------------------------------------------------------------------------- |
| `fullName`   | Optional, bounded nonempty string with whitespace-only/null-character rejection          |
| `phone`      | Optional; strings are trimmed and blank strings become `null`; maximum length is bounded |
| Other fields | Rejected by the strict schema                                                            |
| Empty object | Rejected because at least one supported field must be supplied                           |

The exact limits and transforms belong to the schema and its imported
`nonEmptyBoundedString`; do not reproduce them in a frontend validator. A form
that displays email does not thereby gain permission to send an email update.
Current profile persistence allows only the two supported fields.

[account.schema.ts](../../packages/contracts/src/account/account.schema.ts) owns
`safeUserSchema`, `authUserDataSchema` and `AuthUserData`. A safe user includes
identity/profile/account-state fields and serialized timestamps, excluding
password/token material. The successful data payload has the shape `{ user }`.
The HTTP envelope is a separate schema in
[http.schema.ts](../../packages/contracts/src/http/http.schema.ts).

**Check:** identify one request-schema owner, one safe-output owner and the
difference between an HTTP response envelope and its `data` payload.

## 2. Follow the browser draft into the feature mutation

[ProfileForm](../../apps/web/src/features/users/components/profile-form.tsx) is a
client component. It reads the current safe user through `useSession`, initializes
React Hook Form with the shared schema via `zodResolver`, and distinguishes schema
input from `UpdateProfileBody` output. It displays email read-only.

Existing department account pages compose
[OrientalAccountSettings](../../apps/web/src/features/prototype/components/oriental-account-settings.tsx).
That wrapper renders `ProfileForm variant="oriental"`, `PasswordForm variant="oriental"`
and `SessionControls variant="oriental"`. Its location under `prototype/components`
does not make those real account controls disposable fixtures. The role prop
labels the presentation; it does not grant a department permission.

On submit, its `handleSubmit` callback:

1. Clears the previous general notice.
2. Awaits `updateProfile.mutateAsync(values)` with parsed values; the
   `updateProfile` hook result was created by `useUpdateProfile()` during component
   rendering, not inside the submit callback.
3. Shows the saved message only after resolution.
4. On rejection, maps known field errors through `applyApiFormError` and displays
   its returned general message.

The submit button uses `isSubmitting` to show pending feedback. The default profile
variant uses [FormField](../../apps/web/src/components/forms/form-field.tsx). The
Oriental variant preserves its custom Arabic labels/inputs, styling and icons;
`messageIsError` distinguishes an error alert from a successful status notice.
Do not describe it as already using every accessibility association supplied by
FormField. Preserve the selected markup while verifying labels, field errors and
focus as required by [frontend standard](frontend-standard.md).

[useUpdateProfile](../../apps/web/src/features/users/hooks/users.hooks.ts) owns the
mutation. It calls the feature API and replaces `AUTH_SESSION_QUERY_KEY` with the
returned account on success. There is no optimistic profile write or separate
profile session store.

The [root layout](../../apps/web/src/app/layout.tsx) supplies Arabic/RTL, Cairo,
the existing QueryClient provider and ToastProvider. This particular form displays
its own inline notice; it does not call `useToast`. A documentation transfer must
not add a duplicate toast or change the account presentation to resemble another
project.

**Check:** a rejected write must not produce the saved notice or replace the
session cache. The hook, not the form markup, owns the confirmed cache update.

## 3. Follow the feature API into the central transport

[usersApi.updateMe](../../apps/web/src/features/users/api/users.api.ts) calls the
existing `apiClient.patch` with relative path `/users/me`, the request body and a
compile-time `ApiResponse<AuthUserData>` annotation. It returns
`response.data.data`: the account data inside the HTTP envelope, not the entire
Axios response.

[api-client.ts](../../apps/web/src/services/api/api-client.ts) owns the configured
base URL, credentialed Axios instance and access-token module memory. Its request
interceptor attaches the bearer token when present and the readable CSRF cookie
value for unsafe methods. Components do not manually copy this credential work.
The base URL supplies `/api/v1`; `usersApi` does not prepend the prefix again.

The response interceptor coalesces protected `401` refresh work and replays a
request at most once. Public authentication paths have separate treatment. Read
[security](security.md) for exact session behavior and limitations instead of
implementing another refresh loop in a feature.

**Current response-validation gap:** the Axios generic is only a TypeScript
annotation. `usersApi.updateMe` currently does not runtime-parse the envelope or
`authUserDataSchema`. The shared schemas exist, but this call does not execute
them. New or changed integration must follow the runtime-validation boundary in
[API contracts](api-contracts.md), with malformed-response tests; adopting this
guide does not silently fix the current call.

**Check:** distinguish credential transport, feature endpoint adaptation and
runtime response validation. Neither a generic type nor a successful HTTP status
proves that an untrusted response has the expected shape.

## 4. Locate the Express composition and route boundary

[createApp](../../apps/api/src/app.ts) installs global middleware and mounts
`createApiRouter` at the configured API prefix.
[router.ts](../../apps/api/src/router.ts) constructs `UsersService(database)`,
`UsersController(service)` and authentication middleware, then mounts the users
router under `/users`.

[users.routes.ts](../../apps/api/src/modules/users/users.routes.ts) registers
`PATCH /me` in this order:

1. Authentication establishes `request.user` from a verified access token and a
   current active, verified database account.
2. CSRF middleware checks the unsafe request's double-submit credential.
3. `validationMiddleware` parses the body against `updateProfileBodyDtoSchema`.
4. `controller.updateMe` receives the validated request.

[update-profile.dto.ts](../../apps/api/src/modules/users/dto/update-profile.dto.ts)
aliases the shared request schema/type rather than defining a second shape.
[validation.middleware.ts](../../apps/api/src/middlewares/validation.middleware.ts)
stores successful parsed values in `request.validated`; input failures become
field errors with their request target, such as `body.fullName`.

**Check:** the mutation applies to authenticated identity, not a browser-supplied
user ID. Browser route guards do not replace these server checks. Read the
security owner before extending the endpoint to roles or other users' resources.

## 5. Keep HTTP adaptation separate from the use case

[UsersController.updateMe](../../apps/api/src/modules/users/users.controller.ts)
extracts the validated body and authenticated identity, delegates to the service,
then returns the result through `ResponseHelper.ok` with path and request ID.
It does not implement Prisma persistence or accept arbitrary body fields as an
update object.

[UsersService.updateCurrentUser](../../apps/api/src/modules/users/users.service.ts)
performs the existing use case:

1. Loads an account through `findActiveUser`, selecting safe fields and rejecting
   missing, suspended or unverified/inactive accounts.
2. Constructs an explicit update object for `fullName` and `phone` only; trims the
   name and preserves the distinction between omitted phone and explicit `null`.
3. Returns the existing safe projection when the requested values are unchanged.
4. Otherwise calls `database.user.update` for the authenticated ID and requests
   `SAFE_USER_SELECT`.
5. Maps the result into the browser-safe output.

The injected database dependency makes the service's persistence owner visible.
A separate repository abstraction is not needed merely to trace this simple
operation. More complex use cases use [backend standard](backend-standard.md) and
[data patterns](data-patterns.md) to decide query extraction and transactions.

**Current concurrency limit:** the account precheck and update are separate
operations. This profile path has no optimistic version/ETag contract or
conditional write that closes every possible account-state/stale-write race.
An individual successful update must not be described as serializing the whole
use case. New protected transitions must enforce the relevant invariant at the
write, according to [data patterns](data-patterns.md) and [security](security.md).

**Check:** list the actual write allowlist and the condition that prevents a
no-op write. Identify any race guarantee the accepted feature needs before
copying the persistence pattern.

## 6. Trace the safe response back to the screen

[users.mapper.ts](../../apps/api/src/modules/users/users.mapper.ts) owns
`SAFE_USER_SELECT` and `mapSafeUser`. Selection reduces fetched fields; the mapper
explicitly constructs the safe object and serializes dates. Neither raw Prisma
records nor arbitrary provider objects become the response.

[ResponseHelper.ok](../../apps/api/src/core/responses/api-response.ts) creates a
`200` success envelope with `data`, message, request ID, timestamp and path. It
does not runtime-parse `AuthUserData` in this path; its pagination parsing is a
separate concern. Read [API contracts](api-contracts.md) before extending output
validation.

On the return journey, the feature API unwraps the account, the mutation updates
the session query and the form shows confirmation. Existing consumers of
`useSession` observe the same account cache. A second locally maintained copy of
the saved profile would break that shared ownership.

In the operational workspace, the
[WorkspaceShell](../../apps/web/src/components/workspace/workspace-shell.tsx)
also reads `useSession` for the real account name and logout behavior, while its
workspace label is derived from the URL. The surrounding MvpStoreProvider still
owns unrelated local operational fixtures. This profile update neither provisions
a department nor turns those local orders into persisted API records.

**Current draft limit:** `ProfileForm` supplies reactive `values` from session
data without dirty-preservation/reset options. Background account changes can
therefore reset form values. This small example does not prove safe draft
preservation for longer editors or overlapping saves. Apply the draft decisions
in [frontend standard](frontend-standard.md) when adding such behavior.

## 7. Read failure behavior as part of the flow

| Boundary              | Existing failure path                                                                     | Reading/verification implication                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shared request        | Unsupported/empty/invalid input fails schema parsing                                      | Update schema and request-contract tests together                                                                         |
| Authentication        | Missing/invalid bearer or unavailable account is rejected                                 | Direct HTTP denial matters even when the UI hides a control                                                               |
| CSRF                  | Missing/mismatched credential rejects the write                                           | A component success mock proves nothing about this boundary                                                               |
| Service               | Missing, suspended or inactive account cannot complete its normal use case                | Persistence evidence must include relevant state changes/races                                                            |
| Central error handler | Known errors become stable envelopes; unexpected server failures use safe internal errors | Read [error-handler.middleware.ts](../../apps/api/src/middlewares/error-handler.middleware.ts), not a guessed error shape |
| Browser error adapter | `getApiError` exposes message, status/code, request ID and grouped field errors           | Preserve failure context instead of converting it to an empty account                                                     |
| Form                  | `applyApiFormError` maps known top-level fields and returns the general message           | Nested form paths need an explicit mapping; retain the draft on failure                                                   |

A lost response after a committed write remains an unknown outcome for the
browser. The example adds no idempotency or generic mutation retry. The central
client still performs its existing one-shot protected-401 refresh/replay, including
for eligible writes; that is distinct from retrying an unknown commit outcome. Resolve
such semantics in the accepted contract rather than interpreting every timeout
as a guaranteed rollback.

## 8. Locate evidence and state its limits

[users.hooks.test.tsx](../../apps/web/src/features/users/hooks/users.hooks.test.tsx)
uses a real QueryClient and a mocked feature API to prove that the confirmed
mutation result replaces the session cache. Its partial fixture is not a
wire-schema validation test and the mocked call is not an HTTP or database test.

[app.integration.test.ts](../../apps/api/src/app.integration.test.ts) includes the
current-user/profile flow against the Express app and disposable migrated
PostgreSQL. It exercises current-user reads, missing/mismatched CSRF rejection and
a successful profile write. See its setup and [testing](testing.md) before running
it; it requires the documented disposable infrastructure.

These source files identify available coverage. Reading them is not evidence
that they passed today. They also do not establish complete browser behavior,
draft preservation, response runtime validation or every concurrent account-state
change. Report fresh results, reused evidence and missing checks separately.

## 9. Reuse the sequence, then apply the target standard

For a new accepted feature, first define shared wire schemas and the backend
contract; complete its backend data/authorization/HTTP group and review. Then
implement the feature API, hooks, model rules and approved UI following
[frontend standard](frontend-standard.md). Select actual discovered tests for the
claims the feature makes and review both requirement conformity and engineering
conformity through [code review](code-review.md).

The useful pattern is visible ownership across the complete request. Existing
limitations remain explicit work to scope, not permission to omit target
requirements or to refactor unrelated code during a documentation task.

For Oriental operational integration, retain existing `screens/`, paper, dialogs,
tracking and print consumers and add the blueprint's API/hooks/model seams in the
selected phase. Replace local authority only after that feature's backend gate;
failed reads/writes must not fall back to fixtures. Use
[implementation handoff](../workflow/implementation-handoff.md) for the PLAN
blueprint, TASKS briefs and current-source gate rather than leaving the limited
implementation model to invent order contracts, query keys or business rules.
