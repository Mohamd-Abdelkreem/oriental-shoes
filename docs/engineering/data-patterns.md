# Persistence, Queries and Migrations

Use this guide for Prisma/PostgreSQL design, persistent use cases and schema changes.
Read [backend ownership](backend-standard.md), [wire contracts](api-contracts.md),
[security](security.md) and [testing](testing.md) at the affected boundaries.
Business invariants come from the accepted Oriental Shoes feature requirements,
not the initial authentication-only persistence inventory.

## 1. Current ownership and extension boundary

| Existing owner                                                | Responsibility                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [schema.prisma](../../packages/database/prisma/schema.prisma) | Models, relations, mapped tables, enums and declared indexes       |
| [migrations](../../packages/database/prisma/migrations/)      | Forward SQL history, including constraints not expressed in Prisma |
| [prisma.config.ts](../../packages/database/prisma.config.ts)  | Schema/migration locations, CLI datasource URL and seed command    |
| [client.ts](../../packages/database/src/client.ts)            | `createDatabaseClient(connectionString)` using `PrismaPg`          |
| [database index](../../packages/database/src/index.ts)        | Server-owned persistence exports                                   |
| [seed-config.ts](../../packages/database/src/seed-config.ts)  | Optional local account seed validation and create-only decisions   |
| [database tests](../../packages/database/tests/)              | Schema/seed behavior and migrated PostgreSQL evidence              |

The project currently uses Prisma 7 with `@prisma/adapter-pg`; inspect
[the package manifest](../../packages/database/package.json) and lockfile for exact
versions. Preserve its `prisma-client` generator and configured generated output
under `packages/database/src/generated/prisma`. Generate that output with the
declared command; never author or patch its generated files.

The datasource provider is PostgreSQL; connection URL configuration is in
`prisma.config.ts`, not an older Prisma schema example. That config independently
loads the root `.env`; API environment loading is a separate mechanism.
`createDatabaseClient` creates the adapter-backed client. Construct one client per
owning process and inject it into services. Controllers/browser code must not
construct clients, and browser contracts must not import persistence types.

The initial schema contains `User`, `RefreshToken`, `UserRole` and `UserStatus`.
New domains are expected to extend it when authorized. Existing schema-contract
and migration tests deliberately assert the initial inventory; update those
expectations together with legitimate extensions, preserving the actual constraints
and history. They are not a permanent prohibition on adding business models.

## 2. Design an invariant before a table

For each persistent operation, record:

1. Required fields, ownership, lifecycle and meaning of absent/null values.
2. Unique business identities, relations and allowed deletion/retention behavior.
3. Valid states/ranges and invariants spanning fields or records.
4. Query filters, ordering, expected workload and useful bounds/indexes.
5. Dependent writes, competing operations, retry/duplicate semantics and audit needs.
6. Existing-data migration, verification and recovery appropriate to the change.

Completion means each invariant has an enforcement owner and a testable failure
outcome. Request validation improves feedback; database keys, checks and conditional
writes protect data against concurrent or alternate callers.

Read authored SQL as well as Prisma declarations. The initial auth migration adds
`ck_users_email_normalized` and `ck_users_status_timestamps_consistent`; they enforce
normalized email and verification consistency beyond the model's field types.
Preserve existing checks when extending the schema and name new constraints so
failure classification can stay narrow.

Use unique/foreign-key/check constraints and explicit transitions where their
semantics fit. A pre-read for existence or state is not a uniqueness guarantee.
Choose cascade/restrict/set-null/retention per relationship. Refresh-token cascade
deletion does not justify deleting unrelated history when a user changes lifecycle.
Use soft deletion only when the domain needs it, with explicit query/uniqueness rules.

Keep stable wire values browser-safe under shared contracts and persistence enums
server-owned. Reuse existing canonical enums within the permitted dependency boundary;
do not import a generated Prisma module into the web to avoid a small wire mapping.

## 3. Queries, projections and pagination

Select required columns, include relations deliberately and map outputs explicitly.
The existing [users mapper](../../apps/api/src/modules/users/users.mapper.ts) owns
`SAFE_USER_SELECT`, its selected record type and `mapSafeUser`; it converts timestamps
to ISO strings and allowlists the public account fields. A safe mapper does not
itself authorize access to the mapped account.

Keep a simple cohesive query in its service. Extract complex/reused queries to the
owning feature's meaningful helper, not a universal repository layer. Make actor
scope and transaction ownership explicit. Avoid raw record spreading, unbounded
relation trees and fetching a full table to filter/page in JavaScript.

Apply server-derived permission filters to every relevant read. Allowlist public
sort/filter fields, use parameterized Prisma operations and keep required raw SQL
small and owned. Parameterize values; a client-controlled SQL identifier is not
safe merely because value parameters are used elsewhere. Use the installed
Prisma 7 SQL APIs rather than interpolated query strings.

For lists:

- Bound pagination and expensive filters, select minimal data and use deterministic
  ordering with a unique tie-breaker. Define null ordering where it changes results.
- Reuse [parsePagination](../../apps/api/src/core/pagination/pagination.ts) and
  [parsePaginationQuery](../../apps/api/src/core/pagination/pagination.dto.ts) for
  compatible page-based contracts. Current defaults are page 1/limit 25, maximum
  limit 100, with safe offset arithmetic. These are pagination rules, not domain limits.
- Match row/count filters and define zero/out-of-range metadata through
  [API contracts](api-contracts.md#6-lists-and-pagination).
- Choose transaction isolation when row/count consistency is required. A default
  PostgreSQL `ReadCommitted` transaction does not give every query one snapshot.
  Stable ordering alone also does not freeze a dataset across HTTP requests.
- Define cursor/snapshot behavior only when the feature's access pattern needs it.
  Avoid adding a second generic pagination framework for a local requirement.

Assess N+1 reads by following relation access and call sites. Batch/load required
relations deliberately; unbounded parallel queries can move the bottleneck into
the connection pool. Index real authorization filters, joins and ordering/scans.
Use representative plans/data before speculative indexes or caching. A new index
also has write/storage and migration cost.

## 4. Transactions and concurrent writes

Use a nested write or transaction when one accepted operation requires several
dependent writes to succeed/fail together. The owning service defines that unit;
controllers do not orchestrate it. Pass the same transaction client to all helpers.
Using the root client or opening a second transaction in a helper escapes the
caller's rollback boundary.

Keep transactions short. Hashing, remote provider calls, email, substantial file
processing and other slow external work stay outside them. Where persistence and
external effects cannot commit together, define durable state, compensation or
reconciliation appropriate to the operation. Avoid promising distributed rollback.
The current registration cleanup after email failure is compensation; detached
resend/recovery email is not a durable queue.

Protect raced invariants using suitable database uniqueness, conditional updates,
locks or isolation. Check affected-row counts. Recheck mutable actor/target state
inside the protected write when it controls whether the operation is allowed.
Lock shared rows in a consistent order when locks are needed. Serializable
isolation is a tool for relevant invariants, not a substitute for business identity.

For repeated/competing commands, define applicable behavior explicitly:

| Case                                      | Required decision                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Same accepted intent repeated             | Existing result, safe no-op or documented conflict                            |
| Same idempotency key with changed payload | Conflict rather than silently changing the old intent                         |
| Different keys for one business fact      | Persistent business uniqueness when duplicate effects matter                  |
| Stale version/state                       | Conditional rejection or accepted transition; never an unrestricted overwrite |
| Recognized transaction abort              | Bounded retry of the complete safe operation, with current checks             |
| Unknown commit/external outcome           | Observation/reconciliation before another effect is attempted                 |

Retry only identified safe transient conflicts under a bounded policy. Do not
blanket-retry uniqueness errors, arbitrary connection errors or remote side effects.
Maintain the operation identity and recheck its preconditions on every allowed retry.
The existing [Prisma error mapper](../../apps/api/src/infrastructure/database/prisma-error.mapper.ts)
classifies selected safe codes/constraints; extend deliberately for a new boundary.
An error containing a database code does not prove a particular business result.

All queries within one interactive transaction use one connection. Wrapping them
in `Promise.all` does not establish database concurrency. Real race tests need
independent clients/connections and a controlled competing start; use
[testing](testing.md) for evidence requirements.

## 5. Precision, time and history

Choose units, ranges and arithmetic from domain requirements. Exact monetary or
other fixed-precision values need an explicit representation, overflow bounds and
rounding policy. Use suitable database numeric/integer types and matching server
arithmetic; JavaScript floating-point values must not silently decide exact totals.
Define conversion at the wire boundary. JSON cannot serialize raw bigint; converting
it to `Number` can lose precision. The existing Decimal serializer is a serialization
utility, not a complete money policy or a reason to prescribe one currency.

Store instants consistently and distinguish them from date-only values. If business
dates/deadlines depend on a calendar/timezone, define that policy on the server and
control the clock in tests. Do not let host/browser timezone, locale formatting or
an elapsed-duration guess decide calendar behavior.

When accepted terms/history must survive later configuration edits, persist the
necessary snapshots with the operation. Use version/state predicates for stale
commands where needed. Preserve historical meaning instead of recomputing old
outcomes under current settings. Retention, corrections and audit are feature
decisions; avoid both silent historical rewriting and an unsolicited universal
ledger/version-registry subsystem.

## 6. Forward migrations and existing data

Use the existing package scripts and `prisma.config.ts`. Create new forward
migrations for deployable changes; preserve possibly applied migration history.
Review generated SQL before applying it. A field rename may otherwise become
drop-and-add with data loss; customize the draft SQL when preserving existing
values requires it.

For populated tables, identify existing rows, null/default/backfill handling,
constraint validation, compatibility with running code and the deployment/recovery
sequence. Use an expand/backfill/contract sequence when incompatible changes need
several releases. Keep data backfill distinct from schema generation and deployment.
Document irreversible effects and an appropriate recovery path.

| Command family      | Intended use and effects                                                       |
| ------------------- | ------------------------------------------------------------------------------ |
| `db:generate`       | Generate the configured Prisma client from the schema                          |
| `db:migrate:dev`    | Develop migrations against an explicitly selected development database         |
| `db:migrate:deploy` | Apply pending migration history to the explicitly selected database            |
| `db:validate`       | Validate schema/configuration; does not prove migration correctness            |
| `db:push`           | Synchronize schema directly; does not supply a reviewed migration history      |
| `db:migrate:reset`  | Destructive recreation/reset; requires authorization for that environment/data |
| `db:seed`           | Run the configured seed; inspect its mutation semantics before use             |

Direct schema push/reset is not a substitute for a deployable migration. Verify
the target connection without disclosing credentials. Missing Docker or another
prerequisite must not trigger a fallback to an unrelated developer or production
database. Production migration/deployment and destructive operations need the
authorization required by the [constitution](../../.specify/memory/constitution.md).

## 7. Seed and test isolation

The optional seed accepts complete `SEED_ADMIN_*` or `SEED_USER_*` groups and
rejects configured account seeding when `NODE_ENV=production`. No configured groups
means it skips. This is a local convenience, not a production administrator setup.

The seed is create-only. It reads the existing row for each configured normalized
email first; when one exists it performs no write at all and reports a
skipped-existing notice, so the password hash, profile, role, state, verification
and token fields, approval, authority version, timestamps and retained history
stay unchanged even when the configured values differ. Only an absent email is
created. A created `USER` is verified and awaiting approval; a created `ADMIN`
is verified and active. Neither receives a department, an approver or a
fabricated approval, and both start at authority version 0. A locally seeded
administrator is not evidence that the restricted production administrator
procedure ran. Read
[seed-config.ts](../../packages/database/src/seed-config.ts) before executing;
never describe it as an upsert that replaces account state. Keep real
credentials out of examples, logs and committed data.

Persistence claims use isolated migrated PostgreSQL, not mocked transactions or
SQLite. The existing integration harness starts disposable PostgreSQL containers,
applies migrations and cleans them up. Keep those tests separate from developer
data and scope fixture cleanup to the harness's owned data. Follow
[testing](testing.md) for actual discovery, prerequisites and commands.

For a schema/command change, select proportionate evidence covering fresh migration,
meaningful populated upgrade, new constraints, rollback and competing writes where
relevant, safe projections and repeated deployment. Inspect full final state after
a controlled dependent-write failure; a mock callback cannot prove rollback.
Report checks not run and the boundary each result actually proves.

## 8. Review gate

- Every changed model/relationship has meaningful ownership, constraints, retention
  and safe output; generated code and applied history remain intact.
- Queries use actor scope, bounded work, minimal selections and deterministic lists;
  important paths have justified indexes and no concealed N+1 loading.
- Dependent writes share one transaction client; raced state and duplicate behavior
  are enforced at the write and verified at the real persistence boundary.
- Precision/time/history rules are explicit and aligned with the wire contract.
- Migration SQL preserves required existing data and constraints; seed/reset/deploy
  effects and authorization are clear.
- [Testing](testing.md) and [review](code-review.md) evidence match the claimed scope;
  local success does not establish deployed state or release readiness.

## References

- [Prisma ORM v7 transactions and isolation](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).
- [Prisma ORM v7 custom data-preserving migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations).

Use versioned Prisma v7 documentation. Unversioned current documentation may
describe a different major and incompatible client/configuration APIs.
