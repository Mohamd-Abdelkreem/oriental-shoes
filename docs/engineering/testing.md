# Testing, verification and evidence

Test accepted behavior at the boundary claimed. Every behavior-changing implementation
phase creates or extends actual discovered test files. Documentation-only changes use
formatting, links, references, template resolution and example checks. Test quantity,
one test per method and arbitrary coverage percentages are not acceptance criteria.

## Plan tests before implementing the slice

1. Map each material requirement/risk to an observable outcome and the evidence row
   below. Include applicable success, failure, bounds, authority and regressions.
2. Name the test owner/path, real infrastructure and fixture/cleanup strategy in tasks.
3. Reproduce a bug with a meaningful failing test when feasible. For a new feature,
   define acceptance cases before implementation and keep checks close to the slice.
4. Implement, execute focused checks, inspect failures, review assertions and preserve
   their meaning. Completion requires the relevant behavior and evidence, not a green
   test created by copying the implementation's internals.

## Choose the correct evidence

| Claim                                   | Evidence                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Contract/normalization                  | Accepted/rejected fields, bounds, omitted/null distinctions and serialized output                     |
| Pure rule                               | Deterministic inputs and boundary/invariant outputs                                                   |
| Service orchestration                   | Observable result/effects with doubles only for boundaries outside the claim                          |
| Persistence/constraint/rollback         | Real migrated PostgreSQL and the real service/query path, inspecting final state                      |
| Concurrency/idempotency                 | Competing independent operations, controlled race/barrier, winners/losers and final persisted effects |
| HTTP authority/validation               | Actual `createApp`, routes, middleware, credentials, error envelope and protected state               |
| React form/cache                        | Rendered interaction or real hook with an isolated real QueryClient and transport-boundary doubles    |
| Browser cookies/history/focus/hydration | Real-browser journey/network evidence in the relevant topology                                        |
| Provider failure                        | Controlled boundary double; real isolated provider/sandbox evidence only when required for that claim |
| Migration upgrade                       | Fresh deployment plus representative existing-data upgrade and expected constraints                   |

A mocked `$transaction` does not prove rollback. HTTP status alone does not prove a
write happened or was denied. Sequential replay does not prove race safety. A screenshot
does not prove keyboard behavior, authorization or persistence.

## Current harness and discovery

Verify configuration when it changes; these are the existing entry points:

| Package               | Discovered unit/component files                              | Integration files                |
| --------------------- | ------------------------------------------------------------ | -------------------------------- |
| `@template/contracts` | `src/**/*.test.ts`                                           | No integration script            |
| `@template/database`  | `tests/**/*.test.ts`, excluding `tests/integration/**`       | `tests/integration/**/*.test.ts` |
| `@template/api`       | `src/**/*.test.ts`, excluding `src/**/*.integration.test.ts` | `src/**/*.integration.test.ts`   |
| `@template/web`       | `src/**/*.test.ts`, `src/**/*.test.tsx`                      | `e2e/**/*.spec.ts` (Playwright)  |

The owner configs are [contracts](../../packages/contracts/vitest.config.ts),
[database unit](../../packages/database/vitest.config.ts) /
[integration](../../packages/database/vitest.integration.config.ts),
[API unit](../../apps/api/vitest.config.ts) /
[integration](../../apps/api/vitest.integration.config.ts),
[web](../../apps/web/vitest.config.ts) and
[browser](../../apps/web/playwright.config.ts). A `.spec.ts` file placed
arbitrarily is not automatically discovered. Web tests run in jsdom with
[shared setup](../../apps/web/src/test/setup.ts).

Component and browser discovery stay separate. Vitest discovers
`src/**/*.test.ts` and `src/**/*.test.tsx` under the web config; Playwright
discovers `e2e/**/*.spec.ts` under the browser config. A `.spec.ts` file is
not discovered by Vitest, and a `.test.ts(x)` file is not discovered by
Playwright.

The API/database integration global setups start separate disposable PostgreSQL
containers, replace `DATABASE_URL`, deploy real migrations and stop their containers.
They require Docker/image access and the pnpm invocation context. Never replace this
isolation with a developer database or SQLite when the required infrastructure is
missing. Report the gate as unperformed/blocked instead.

Integration files run serially in the present harness. Race tests must still create
actual competing operations; serial file execution does not establish concurrency
correctness. Check shared test cleanup before adding tables/parallel workers.

### Browser harness

The browser harness is test tooling. It is not part of any production build
output and it adds no production endpoint.

[playwright.config.ts](../../apps/web/playwright.config.ts) runs the `desktop`
(1440×900) and `narrow` (390×844) Chromium projects over `e2e/**/*.spec.ts`
with `fullyParallel: false`, `workers: 1` and `retries: 0`. Trace, video and
screenshot capture are off, so a run writes no credential-bearing artifact.

The [global setup](../../apps/web/e2e/global-setup.ts) owns every resource of
one run: a disposable PostgreSQL 18.4 container, a real API child with the real
`createApp`, real migrations and a capturing mail adapter, and a disposable
Next child on a reserved loopback port. The private runtime directory is mode
0700 and its manifest mode 0600. Parent and child exchange only
`ready`/`fatal`/`shutdown` metadata over IPC. Readiness is a bounded poll, and
the teardown removes only the container, the child processes and the temporary
files of that run.

[e2e/runtime.ts](../../apps/web/e2e/runtime.ts) exposes `readE2eRuntime()` and
`waitForCapturedAction(recipient, kind)`. The capture helper returns only the
action URL of one exact synthetic recipient and kind; it never returns an HTML
body, never logs a token and never reads the database. It is test
coordination, not application authority.

The owned API child creates its synthetic administrator and one distinct
synthetic suspended employee per browser project. Those are disposable
fixtures, not usable credentials, and captured mail is not production delivery
evidence.

## Commands and their limits

Run these commands from the repository root after the normal dependency/setup steps
in [README](../../README.md#local-setup). They are real manifest scripts, not examples
of nonexistent E2E infrastructure.

```sh
pnpm --filter @template/contracts test src/auth/auth.schema.test.ts
pnpm --filter @template/api test src/modules/auth/auth.service.test.ts
pnpm --filter @template/api test:integration src/modules/auth/auth.service.integration.test.ts
pnpm --filter @template/database test:integration
pnpm --filter @template/web test src/features/users/hooks/users.hooks.test.tsx
```

Use package-relative filenames to narrow a run. Package runners do not automatically
build changed dependency packages; build affected workspace dependencies when needed
and record that step. The root Turbo test task depends on dependency builds.

After a batch, run affected files and shared regressions selected by the changed
boundary. At phase exit, run the full applicable suites and checks:

```sh
pnpm format:check
pnpm lint
pnpm check-types
pnpm test
pnpm test:integration
pnpm build
pnpm verify:build-output
git diff --check
```

`pnpm verify` is the existing aggregate. It first runs `db:format`, `db:validate`
and `db:generate`, then formatting/lint/types/unit/integration/build/build-output/diff
checks. **It writes/formats the Prisma schema and generates/builds artifacts.** Inspect
existing edits before invoking it. Do not use it for a documentation-only or explicitly
read-only review. Root `pnpm format` also writes broadly; format owned files instead.

Oriental's web `check-types` also runs `next typegen` before TypeScript, writing
generated framework types. Root `start` starts PostgreSQL and deploys pending
migrations before serving compiled apps; `preview` builds and then starts. These
commands are not read-only documentation checks. Read actual manifests and target
environment before execution; this documentation adoption runs no application phase.

Turbo can reuse cached unit/check/build results. Label reused/cached evidence honestly;
use direct package/file runs for fresh behavior evidence when needed. Integration is
configured uncached. A zero exit code must include the intended discovered tests;
review the run output rather than only the command status.

The browser harness has its own real scripts:

```sh
pnpm --filter @template/web exec playwright install chromium
pnpm --filter @template/web check:e2e-types
pnpm --filter @template/api check:e2e-types
pnpm --filter @template/web test:e2e
```

The first command is tooling setup, not a runtime claim. Docker and an
installed Chromium are prerequisites; without them the browser command fails
and the gate stays unperformed instead of being replaced by a mocked journey.
The two typecheck scripts cover only the harness files, which the package
`check-types` tasks do not include.

There is still no testnet and no complete deployment-verification command in
the current manifests. Browser-tool runs can provide explicitly recorded
manual evidence, but must not be advertised as an installed regression suite.
A green harness run is not deployment, mail-delivery or release evidence.

## Construct meaningful cases

Existing operational MVP/component tests establish their rendered/local behavior,
not production persistence, department authority or real catalog pricing. Preserve
useful assertions and extend the actual boundary when its selected phase integrates
the backend. The current [roadmap](../../plan.md) owns client-input status and business
acceptance; a synthetic catalog does not replace received-value validation or approval.
For reached paper/print controls, test their retained behavior rather than scheduling
their reconstruction merely because their data is still local.

Use minimal realistic fixtures with distinct actors/resources. For a protected update,
cover at least allowed result, malformed/unsupported input, denied actor/resource,
missing resource/state conflict where applicable, and the stored outcome. A no-op
update and a null-clearing update are different cases if the contract distinguishes them.

For a multi-write transaction, induce a controlled failure in the real operation after
an earlier write and inspect the complete final state. For races, dispatch independent
clients/connections and coordinate the relevant interleaving. Inspect winning/losing
results, counts/versions and unchanged losing effects; arbitrary delays are unreliable.

For frontend work, query by accessible roles/labels and exercise real interactions.
Use a fresh QueryClient per independent session. Cover pending/double-submit, retained
input on failure, safe server errors, invalidation/update, stale/late replies, account
changes and draft conflicts where the feature can encounter them. Keep data-layer
proof in integration tests rather than fake frontend persistence.

Use stable values and controlled clocks at time boundaries. Prefer outcome assertions
over internal call counts. Spies are useful when the boundary itself is observable,
such as preventing a duplicate external send or releasing an owned resource. Keep
snapshots focused; a huge snapshot is not an authorization or business invariant check.

## Cleanup and test integrity

Allocate isolated fixtures/databases/files for the suite's ownership. Close DB clients,
servers, containers, timers, listeners and owned pending work on both success and
failure. Restore mocks, globals and clocks; a runner option does not clean every kind
of resource. Scope deletion when a shared test database grows with new domains.

Do not reset/reseed developer or production data to make a suite pass. The
optional seed is create-only: it reads the row of each configured normalized
email first and, when one exists, performs no write and reports a
skipped-existing notice, so an existing password, profile, role, state,
verification, approval, authority version, timestamps and history stay
unchanged. Seeds are still not neutral test setup, they never reset or
reseed a developer or production database, and they do not replace the owned
disposable fixture and cleanup policy. Never log credentials or private
payloads in diagnostics.

The browser harness owns its disposable container, its two child processes and
its private temporary directory. Its teardown removes exactly those resources,
including after a partial startup failure, and reuses no developer database,
server or port. Do not widen that cleanup to shared resources.

Required acceptance cannot be replaced by `.only`, `.skip`, `.todo`, weakened
assertions, forced exits, warning suppression, arbitrary sleeps or retries concealing
flakiness. Diagnose whether a failure belongs to implementation, test, environment or
an unresolved requirement. Broaden/repeat tests for a new change, failure or remaining
concern, not to create a ritual around an already verified trivial edit.

## Review and completion evidence

Apply [code review](code-review.md) and available matching guards. For each test,
check that it would fail for the relevant regression and that a double has not removed
the very boundary it claims to verify. Assertions should survive a harmless refactor.

Report scope, test files added/extended, actual commands and outcomes, discovery,
warnings, fresh/cached/reused evidence and missing infrastructure/checks. Separate
batch, backend group, whole-phase and release status. A local green suite proves its
observed boundary; production readiness also requires the actual deployment, data,
configuration and recovery checks in the accepted release scope.
