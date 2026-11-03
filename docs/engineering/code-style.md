# Code style, ownership and efficiency

Use this guide while writing code and again during [review](code-review.md). Mechanical
formatting/type rules come from [shared configuration](../../packages/typescript-config/base.json),
[ESLint](../../packages/eslint-config/base.mjs) and the owning package's configuration.
Behavior, ownership and error design still need explicit review.

## Before writing a file

1. State the observable behavior and the existing owner to extend. Read that owner,
   its callers, contracts and relevant tests in full.
2. Identify the inputs, output, authority, failure outcomes and side effects. Assign
   each responsibility using the [placement map](README.md#placement-decisions).
3. Choose the smallest dependency-safe change. Name the test proving the outcome.
   Work on the selected slice until its behavior and checks are complete before
   generating another group of files.

Done means the behavior has an owner and a verification route, not merely a folder tree.

## Naming and public interfaces

- Use intention-revealing domain names: operations describe the outcome; boolean
  names describe a condition. Include units in ambiguous numeric/time values.
- Use existing kebab-case filenames and suffixes such as `.service.ts`,
  `.controller.ts`, `.routes.ts`, `.schema.ts`, `.test.ts` and `.integration.test.ts`.
  Match neighboring feature conventions instead of introducing a second vocabulary.
- Prefer named exports. Keep default exports where a framework/tool convention uses
  them, such as App Router entry files or configuration.
- Functions accept explicit dependencies/inputs and return a meaningful result.
  Replace long sets of same-typed arguments with a named object when confusion is likely.
- Export only intentional module/package boundaries. Internal implementation types
  remain local unless independent callers need them.

## Canonical module patterns

| Kind                      | Default pattern                                                   | Extraction rule                                                                 |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| API controller            | Exported class adapting validated HTTP context to service calls   | Move business policy, DB work and provider mechanics to their owners            |
| API use-case service      | Exported class with explicit constructor dependencies             | Keep cohesive orchestration together; extract independent rules/queries/mappers |
| Route/composition factory | Named function creating a router or wiring dependencies           | Construct shared dependencies once at the existing composition boundary         |
| Pure rule/transform       | Named function with explicit data and no hidden I/O               | Keep feature-local until independent consumers share its meaning                |
| Infrastructure adapter    | Existing functional/class style appropriate to its technical seam | Expose only the narrow operations the use case needs                            |
| React feature             | API + hooks + model + components per frontend recipe              | Rendering does not own transport or a second server-state store                 |

Use one pattern consistently within each new module. A service/controller class owns
its private implementation helpers; independently reusable errors, types and pure
rules belong to their meaningful feature files. Imports, related type definitions
and constants are allowed at module scope when they belong there. Do not enforce
an imports-plus-class-only file rule or split files by an arbitrary line count.

The [backend](backend-standard.md) and [frontend](frontend-standard.md) guides own
the detailed recipes. A small pure operation need not become a class. A class does
not justify a generic base class, repository framework or DI container.

## Type safety and boundary truth

- Preserve strict TypeScript, exact optional property semantics and unchecked-index
  checks. Represent missing, null, pending, failed and valid states explicitly.
- Use `unknown` for unvalidated input/caught errors; narrow with actual guards or
  runtime schemas. Type assertions do not validate data.
- Use type-only imports. API/database ESM relative imports follow the existing emitted
  `.js` convention; web imports follow its configured `@/` alias and local conventions.
- Prefer inferred types from owning schemas. Distinguish raw form/input values from
  parsed output when normalization or coercion changes the type.
- Restrict `as`, non-null assertions and framework augmentation to a demonstrated
  boundary. Explain why it is sound and cover that boundary when it matters.
- Broad `any`, `as unknown as`, `@ts-ignore`, `@ts-nocheck`, wide lint disables and
  edited compiler settings must not be used to hide a defect. Keep unavoidable
  framework exceptions narrow, justified and reviewed.

## Cohesion and reuse

Functions should perform one coherent operation at one abstraction level. Prefer
early validation/returns and explicit branches over deeply nested multi-purpose logic.
Extract when the result has its own responsibility, independent verification or real
reuse; do not create chains of one-line forwarding files without a useful boundary.

Share code because its meaning and change reasons are shared. Similar-looking admin
and public operations may have different authority/output rules. Keep clear local
duplication until a stable common responsibility emerges. Do not promote feature
helpers into `shared/`, `core/` or infrastructure simply to reduce a line count.

Keep new errors with their feature unless their meaning is truly cross-feature.
Likewise, feature query/mapping/rule files stay in that feature rather than a global
miscellaneous utility directory. Remove obsolete branches/imports when the accepted
change makes them dead; avoid unrelated cleanup.

## Async work, errors and side effects

- Await work whose outcome belongs to the command. A successful response must mean
  the documented acceptance point was reached.
- Use `try/catch` when recovering, translating a known boundary failure or cleaning
  up. Otherwise propagate to the existing error owner. Preserve unexpected errors
  for safe diagnostics; do not convert every error into a business rejection.
- Validate at intentional untrusted boundaries. An internal invalid response is a
  server defect, not automatically a caller validation error.
- Every background/detached task needs an explicit owner for durability, failure,
  retry and shutdown. A detached promise is not a reliable job queue.
- Keep request-specific state out of mutable module globals. Process-level clients
  and the deliberately single browser transport/session machinery are separate
  established owners, not patterns for arbitrary shared state.
- Close owned resources and remove listeners/timers on success, failure and teardown.
  Use `finally` where it makes ownership visible.

## Efficiency without speculative architecture

Before introducing a cache or new infrastructure, identify a requirement or measured
cost and the simplest correction. Record the observation and the check demonstrating
improvement. For a list/query, examine bounded page size, deterministic ordering,
selected columns, relevant indexes, query count and total payload. A loop that issues
one database call per item needs deliberate batching or a justified bound.

For independent I/O, use bounded concurrency when appropriate. Respect dependencies
and transaction semantics; `Promise.all` does not make queries on one transaction's
single connection execute concurrently. Avoid external I/O inside transactions.

For React, examine server/client boundaries, duplicated requests, derived state,
render-triggered effects, expensive lists and bundle cost. Follow the installed
framework/compiler behavior before adding memoization. The frontend guide owns
query freshness and cache invalidation choices.

Define performance acceptance with an environment, dataset and threshold when a
feature needs one. Do not claim a throughput/latency gain, scalability or lower
complexity without a defensible argument and evidence proportional to the claim.

## Comments, dependencies and review

Comments explain a non-obvious invariant, tradeoff, unsafe framework boundary or
reason. Prefer expressive code over comments narrating each statement. Document
public units, side effects and failure semantics where the signature cannot show them.

Before adding a dependency: identify the exact use case, inspect whether the workspace
already solves it, verify installed-version compatibility and review its runtime
and security cost. Keep lockfile changes intentional. A documentation example is not
permission to install another HTTP client, state manager or authentication stack.

The post-edit gate asks: does every changed responsibility have one owner; are names,
types, branches and errors truthful; are abstractions justified; is work bounded;
are compatibility and tests intact? Record concrete findings through
[code review](code-review.md), without turning subjective preferences into blockers.
