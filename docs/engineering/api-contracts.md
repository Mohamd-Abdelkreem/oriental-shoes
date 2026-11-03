# API Contracts and HTTP Boundaries

Use this guide when adding or changing a request, response, feature API adapter or
OpenAPI operation. `@template/contracts` owns executable browser-safe wire schemas;
the API and web consume that owner. Read the [engineering index](README.md),
[backend standard](backend-standard.md), [frontend standard](frontend-standard.md)
and [security](security.md) for their respective boundaries.

## 1. Existing contract owners

| Existing file                                                                    | Owns                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [auth.schema.ts](../../packages/contracts/src/auth/auth.schema.ts)               | Auth/profile request schemas, input rules and inferred types    |
| [account.schema.ts](../../packages/contracts/src/account/account.schema.ts)      | Safe account/session response shapes and role/status wire enums |
| [http.schema.ts](../../packages/contracts/src/http/http.schema.ts)               | Success/error envelopes, field errors and pagination metadata   |
| [contracts index](../../packages/contracts/src/index.ts)                         | Deliberate public exports                                       |
| [validation middleware](../../apps/api/src/middlewares/validation.middleware.ts) | Async request parsing and target-prefixed field errors          |
| [response helper](../../apps/api/src/core/responses/api-response.ts)             | Established success response construction                       |
| [OpenAPI owner](../../apps/api/src/infrastructure/openapi/openapi.ts)            | Generated API document construction                             |
| [central web transport](../../apps/web/src/services/api/api-client.ts)           | Credentials, refresh, CSRF and shared transport/error handling  |

Add new domain contracts beside the existing contracts; do not copy them into API
DTOs or frontend models. Keep this package usable by the browser: no Prisma,
Express, Node filesystem, environment-secret reads, server initialization or provider
SDK imports. A view model may add local display/draft state without redefining the
wire's authoritative facts.

Verify the installed Zod version in [the manifest](../../packages/contracts/package.json)
before adopting upstream APIs. The current project uses Zod 4; current upstream
documentation can describe features introduced after the locked version.

## 2. Define an operation before wiring it

For each accepted operation, settle the following contract before route/UI wiring:

| Decision      | Required detail                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ |
| HTTP          | Actual method/path, API prefix, content type and success status                            |
| Actor         | Public/protected access, current role/ownership/restriction checks                         |
| Input         | Field names, raw type, presence, nullability, normalization, bounds and unsupported fields |
| Result        | Explicit safe fields, domain data schema and envelope/binary/bodyless behavior             |
| Failure       | Stable safe error codes, statuses, field paths, denial/conflict/unknown outcomes           |
| Lists         | Bounds, filters, sort/tie-breaker and metadata/cursor semantics                            |
| Commands      | Duplicate, replay, stale-version and side-effect semantics when relevant                   |
| Compatibility | Producer/consumer changes, older-client handling and rollout needs                         |

Then follow this implementation sequence:

1. Define the request and safe response schemas under the owning contract domain.
   Infer types from them and export the intended public surface in the package index.
2. Alias the request schema/type from the API module's `dto/` file. The existing
   [profile DTO](../../apps/api/src/modules/users/dto/update-profile.dto.ts) demonstrates
   this seam; it does not maintain a second schema.
3. Parse the request in route middleware, authorize the operation on the server,
   select/map its safe DTO and return the documented response.
4. Parse the unknown response in the feature API adapter before its data reaches
   hooks/components. Align form field mapping and Query behavior with safe failures.
5. Update OpenAPI and discovered producer/consumer tests together. Check compatibility
   for every changed exported field and error behavior.

Completion means producer, consumer, docs and tests describe the same actual route.
Creating a schema alone neither registers an endpoint nor enforces permission.

## 3. Parse at real boundaries

### Request parsing

Use shared runtime schemas with the existing `validationMiddleware({ body, params,
query })`. Its parser uses `safeParseAsync`; asynchronous refinements/transforms are
supported. Consume the parsed values from `request.validated`; query input must not
be treated as already typed or assigned back into Express's query property.

Define normalization deliberately. Current shared auth schemas normalize email
case/outer whitespace. Passwords remain significant input and must not be trimmed.
Login accepts an existing password independently of stronger new-password rules.
Preserve that distinction when extending registration or reset requirements.

Use strict command shapes for supported editable fields. Reject client-selected
authority fields rather than silently merging them into database writes. Validate
bounded arrays/strings/objects, supported enum values and ID syntax. A well-formed
ID proves neither existence nor ownership. Server authorization remains separate.

Query values can have unexpected shapes. Parse supported textual booleans explicitly;
generic boolean coercion can turn the string `"false"` into true. Define acceptable
pagination/filter/sort input rather than trusting a TypeScript annotation.

### Raw input versus parsed output

Use `z.input<typeof schema>` for raw values when preprocessing/defaults/transforms
change their type; use `z.output` or `z.infer` for parsed values. Keep React Hook Form
input/output types aligned with the chosen resolver and shared form helpers.

Preserve omitted, explicit null and blank when their meanings differ. In the current
profile schema, omitted `phone` leaves it unchanged; a blank string normalizes to
null and clears it; an unsupported field is rejected. An empty update is invalid.
Those semantics must survive API mapping and frontend form submission.

### Response and provider parsing

New feature API adapters must receive untrusted successful response data as
`unknown`, validate the envelope and then validate domain `data` before returning
it. Axios generics and `SuccessEnvelope<T>` provide static typing only.
The existing auth/users adapters rely substantially on generics; their existence
does not establish that the runtime-validation target is already satisfied.

The existing exported symbols for an account response are
`successEnvelopeSchema`, `authUserDataSchema` and `AuthUserData` from
`@template/contracts`. The required sequence is:

1. Parse the unknown complete JSON value with `successEnvelopeSchema.parse`.
2. Parse the resulting `data` with `authUserDataSchema.parse`.
3. Return that validated result to the hook; it has the `AuthUserData` shape.

The following standalone TypeScript example uses the existing package exports.
It requires installed workspace dependencies and resolved `@template/contracts`
exports, through the repository's development condition or built package output.
`parseProfileResponse` is an illustrative helper to place in an authorized adapter;
it is not a helper already exported by the repository. It performs no network I/O.

<!-- verified-contract-parser -->

```ts
import {
  authUserDataSchema,
  successEnvelopeSchema,
  type AuthUserData,
} from "@template/contracts";

export const parseProfileResponse = (raw: unknown): AuthUserData => {
  const envelope = successEnvelopeSchema.parse(raw);
  return authUserDataSchema.parse(envelope.data);
};
```

Both parse calls throw a Zod validation error for invalid input. The adapter's safe
error boundary must classify that failure; it must not return a default user.
Use async parsing if the selected schema requires it. New domains supply their own
response-data schema; an account schema cannot validate unrelated domain data.

On an invalid envelope/data, reject with a bounded safe contract error through the
existing error strategy. Do not turn malformed success into an empty list, default
account, zero value or retryable offline response. UI feedback must not expose raw
payloads, parser issues, transport headers or backend internals. Follow
[frontend state/error ownership](frontend-standard.md) and [security](security.md).
The current `getApiError` normalizer classifies a non-Axios parser error as a
network error. Introducing response parsing therefore includes extending that
existing error boundary as needed to expose a bounded contract-failure category,
with a malformed-response-to-UI regression test. Keep one normalization/retry
strategy; merely adding `.parse` is insufficient if the UI then reports offline.
Provider replies require equivalent validation inside their infrastructure adapter;
a provider acknowledgement does not replace domain completion evidence.

## 4. Use the existing HTTP protocol

Successful JSON uses `success: true`, `statusCode`, `message`, `data`, `requestId`,
`timestamp` and `path`, with optional `paginationMeta`. `data` must be present even
when its accepted value is null. The shared envelope validates structure; the
operation's schema validates the contents of `data`.

The actual helper signatures are:

- `ResponseHelper.ok(response, data, message, path, requestId)` for HTTP 200.
- `ResponseHelper.created(response, data, message, path, requestId)` for HTTP 201.
- `ResponseHelper.success(response, data, message, statusCode, path, requestId)`
  when the accepted JSON operation needs another status.

Use the established helper; do not introduce another JSON envelope or confuse
message/status argument ordering. The helper can project a valid `data.pagination`
object into `paginationMeta`; keep the domain's response shape deliberate.

Errors use `success: false`, stable `code`, safe `message`, `statusCode`, `requestId`,
`timestamp`, `path` and optional `errors`. Each field error has `field` and `message`.
Request field paths include their target, such as `body.email`, `query.page` or
`params.id`; map only known editable paths into a form. The error schema permits
an optional development stack; production responses must not disclose it.

Choose statuses and codes for the actual operation, not an assumed all-200/all-400
protocol. Authentication denial, authorization denial, validation, missing resource,
conflict and provider unavailability have different meanings. Use the existing safe
error owners and [security](security.md) for existence privacy and redaction.

Private binary files, multipart input, streams and bodyless success require their
own documented content type/status/cache semantics when introduced. Do not parse
them through a JSON envelope or invent support before their implementation exists.

## 5. Values, dates and command semantics

- Represent instants as unambiguous ISO strings with a timezone. The existing
  account contracts use offset-aware ISO validation and the mapper emits UTC ISO.
  Date-only values are calendar dates, not midnight instants. Choose an explicit
  domain calendar when needed; browser or host timezone must not silently define it.
- Choose amount/count/precision/range rules per accepted domain. For exact monetary
  values, define units and rounding in [data patterns](data-patterns.md#5-precision-time-and-history)
  before choosing a wire shape. JSON cannot carry a raw bigint; avoid float-based
  arithmetic where exactness is required. Shared HTTP infrastructure does not
  prescribe a currency; accepted feature requirements own that choice.
- Distinguish editable intent from server-derived role, ownership, totals,
  eligibility, timestamps and outcomes. The response may expose a field that the
  command must reject as input.
- Version/quote fields detect stale intent where applicable; they do not grant
  permission. Define the conflict response and refresh/review behavior.
- Where idempotency is needed, specify actor/operation/key/payload binding, duplicate
  result and in-progress/changed-payload behavior. Persistent business uniqueness
  must protect effects independently when different keys could repeat one action.
- A timeout or disconnected client does not prove that a command failed. Define
  how the existing operation is observed/reconciled before another effect can occur.

Keep domain-specific fees, deadlines, state machines and retention in their owning
requirements; do not embed another project's rules into shared HTTP infrastructure.

## 6. Lists and pagination

Specify page/limit or cursor, allowed filters/sort, bounds, null ordering where
relevant and a stable unique tie-breaker. Reuse the existing pagination helper for
compatible page-based lists; see [data patterns](data-patterns.md#3-queries-projections-and-pagination).
Search/filter input does not replace actor authorization filters.

The shared `paginationMetaSchema` owns `page`, `limit`, `total`, `totalPages`,
`hasNextPage` and `hasPreviousPage`. Zero total means zero pages. A total must refer
to the documented filter scope; row/count queries must match. Define the response
for an out-of-range page and how consumers recover without showing another
resource's data. A stable sort alone does not freeze a changing dataset.

If a feature needs cursor/snapshot semantics, document that explicit contract and
its compatibility; do not label a different shape as the existing page envelope.
Keep list projections minimal and query bounded subsets on the server.

## 7. Compatibility, OpenAPI and verification

For every implemented operation, align route registration, request schema, output
mapper, response-data schema, status/error behavior, authentication/authorization,
content type, list metadata and applicable idempotency rules with OpenAPI. Extend
the existing OpenAPI construction instead of maintaining divergent hand-copied DTOs.

When changing an exported shape, inspect API producers, all frontend adapters/hooks,
forms, shared tests and OpenAPI. Plan compatible rollout when independently deployed
clients may persist. A renamed field is a wire change even if TypeScript compiles.
Document an intended endpoint as proposed until the route and behavior exist.

Select test evidence through [testing](testing.md). Applicable cases include:

- Accepted and rejected raw values, normalization, bounds and null/omission semantics.
- Rejection of unsupported authority fields and safe response allowlists.
- Actual HTTP status/envelope/errors with route guards satisfied as appropriate.
- Valid response data and malformed/missing/wrong-type/private fields at adapters.
- Producer/consumer compatibility, pagination semantics and safe failure mapping.

To demonstrate a route was removed, call its original method with earlier guards
satisfied; an authentication or CSRF rejection only proves that earlier guard ran.
Mocks must conform to the current contract and stay outside the boundary under test.

## References

- [Zod parsing and inferred input/output types](https://zod.dev/basics).
- [Express 5 API](https://expressjs.com/en/5x/api.html).

Verify each referenced API against installed source/version metadata before use.
