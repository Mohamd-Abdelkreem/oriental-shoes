# P01 Data, Transactions, and Existing-Account Transition

**Stage:** PLAN design, 2026-11-03. All additions below are proposed; no schema,
migration, application code, database action or test execution is delivered here.
This document owns persistent fields, constraints, transition predicates and lock
ordering. The [specification](spec.md) owns product behavior; the feature plan and
contract design own service/HTTP/browser interfaces and reference this document.

## 1. Verified foundations and affected owners

| Current owner                                                                                        | Observed behavior                                                                                                            | Planned use                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/schema.prisma`                                                             | `User`, `RefreshToken`, `UserRole`, `UserStatus`; PostgreSQL; generated client output `../src/generated/prisma`              | Extend these identities; add retained employee decisions and one initial-admin receipt. Preserve generator and refresh relationships.       |
| `packages/database/prisma/migrations/20260818000000_init_authentication/migration.sql`               | Normalized-email uniqueness; `ck_users_email_normalized`; `ck_users_status_timestamps_consistent`; refresh-token cascade     | Preserve the applied migration and its checks; use new forward migrations.                                                                  |
| `packages/database/src/client.ts` and `src/index.ts`                                                 | Injected adapter-backed `DatabaseClient`; exported `Prisma` namespace                                                        | Reuse client creation, transaction type, parameterized SQL and generated enum exports.                                                      |
| `apps/api/src/modules/auth/auth.service.ts`                                                          | Verification activates USER; reset consumes token/changes password/revokes refresh records together; refresh rotates records | Verification becomes pending approval. Add current-authority locking to touched writes without changing token protocol.                     |
| `apps/api/src/middlewares/auth.middleware.ts`                                                        | JWT verification plus current active/verified user lookup                                                                    | Separate identity resolution from business eligibility as fixed in the feature plan. Middleware pre-reads do not replace write-time checks. |
| `apps/api/src/modules/users/users.service.ts`                                                        | Active-account pre-read followed by profile update                                                                           | Recheck/lock current business authority in the profile write transaction.                                                                   |
| `packages/database/tests/schema-contract.test.ts`, `tests/integration/migration.integration.test.ts` | Exact initial model/column/check inventory                                                                                   | Extend intentional inventory assertions; retain prior checks and migration coverage.                                                        |
| `apps/api/src/modules/auth/auth.service.integration.test.ts`                                         | Real disposable PostgreSQL auth behavior; current fixture cleanup deletes users                                              | Preserve regressions and change owned test cleanup for retained decision foreign keys.                                                      |

Installed `@prisma/client`, `prisma` and `@prisma/adapter-pg` are **7.9.1** in
`packages/database/package.json`. The generated `internal/class.ts` exposes
interactive `$transaction(callback, { isolationLevel, maxWait, timeout })` and
transaction `$queryRaw(TemplateStringsArray | Prisma.Sql)`; generated
`internal/prismaNamespace.ts` exports `Prisma.sql`, `Prisma.join`,
`Prisma.TransactionIsolationLevel` and `Prisma.TransactionClient`. These are current
APIs, not new wrappers or permission to edit generated output.

## 2. Proposed enums and account fields

Keep `UserRole` = `USER | ADMIN`. Extend `UserStatus` (mapped type `user_status`)
with `PENDING_APPROVAL | REJECTED`, retaining existing values. Add:

| Proposed enum         | Values                                                                                              | Database type           |
| --------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| `Department`          | `SALES`, `APPROVAL`, `CUTTING`, `PRODUCTION`, `QUALITY`, `WAREHOUSE`                                | `department`            |
| `StaffOperation`      | `APPROVE`, `REJECT`, `CHANGE_DEPARTMENT`, `SUSPEND`, `REACTIVATE`                                   | `staff_operation`       |
| `StaffDecisionAction` | `APPROVE`, `RECONSIDER`, `PREPARE_APPROVAL`, `REJECT`, `CHANGE_DEPARTMENT`, `SUSPEND`, `REACTIVATE` | `staff_decision_action` |

`StaffOperation` records the requested named operation; `StaffDecisionAction`
distinguishes initial approval, rejected-account reconsideration and preparatory
approval of a legacy suspended account. No administration/special department exists.

Add these fields to `User`; existing identity/credential/profile fields remain:

| Prisma field        | PostgreSQL column/type             | Null/default and meaning                                                                                                                                                                                      |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `department`        | `department department`            | Nullable; absent before approval and for ADMIN. Singular scalar, never a membership list.                                                                                                                     |
| `staffApprovedAt`   | `staff_approved_at timestamptz(6)` | Nullable; first explicit employee approval time. Retained through suspension/reassignment/reactivation.                                                                                                       |
| `staffApprovedById` | `staff_approved_by_id uuid`        | Nullable with approval time; FK to `users.id`, `ON DELETE RESTRICT`, `ON UPDATE CASCADE`. Historical approval is not dependent on the approver remaining active.                                              |
| `accessVersion`     | `access_version integer`           | Required, default `0`; nonnegative monotonic authority revision. Increment on effective verification/staff/restricted-admin authority transitions. Profile/password/refresh-only changes do not increment it. |

Do not substitute `updatedAt` for `accessVersion`: profile edits must not invalidate
a staff dialog. Versions use the PostgreSQL integer range; reject an increment at
`2147483647` with a safe conflict and no write, rather than wrap/reset it. No access
version is trusted from a JWT as current authority. The current user row remains
authoritative for old and newly issued credentials.

### Valid current account combinations

| Role/status                                             | Verification                                                                                                                                  | Approval and department                                | Business access                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| USER / `PENDING_VERIFICATION`                           | Absent; legacy verified USER rows become pending approval in migration                                                                        | All absent                                             | None                                                  |
| USER / `PENDING_APPROVAL`                               | Present                                                                                                                                       | All absent                                             | None                                                  |
| USER / `REJECTED`                                       | Present                                                                                                                                       | All absent                                             | None                                                  |
| USER / `ACTIVE`                                         | Present                                                                                                                                       | Approval time/actor and exactly one department present | Assigned department                                   |
| USER / `SUSPENDED`, unapproved legacy                   | Present under existing check                                                                                                                  | All absent                                             | None; preparatory approval keeps suspension           |
| USER / `SUSPENDED`, approved                            | Present                                                                                                                                       | Approval time/actor and one department retained        | None                                                  |
| ADMIN / `PENDING_VERIFICATION`, `ACTIVE` or `SUSPENDED` | Absent iff pending verification; present for active/suspended. Preserve valid legacy combinations; inconsistent legacy ADMIN stops migration. | All employee approval/department fields absent         | Only verified `ACTIVE` has cross-department authority |

ADMIN cannot use `PENDING_APPROVAL`/`REJECTED`; ordinary employee commands cannot
change ADMIN. Existing `ck_users_status_timestamps_consistent` is retained: every
state except `PENDING_VERIFICATION` requires `email_verified_at`. Do not reinterpret
that legacy check as an approval requirement. Add
`ck_users_verification_state_consistent` so `status = PENDING_VERIFICATION` iff
`email_verified_at IS NULL` for either role. This strengthens the current check's
one-way implication and agrees with the safe-account wire invariant; it does not
silently alter an administrator's state or verification evidence.

### Named new account constraints and indexes

| Name                                     | Exact invariant/purpose                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ck_users_staff_approval_pair`           | `staff_approved_at IS NULL` iff `staff_approved_by_id IS NULL`.                                                                                                                                                                                                                                          |
| `ck_users_access_version_nonnegative`    | `access_version >= 0`.                                                                                                                                                                                                                                                                                   |
| `ck_users_verification_state_consistent` | `(status = 'PENDING_VERIFICATION') = (email_verified_at IS NULL)`. Every other status requires verification; verified accounts cannot retain pending-verification state.                                                                                                                                 |
| `ck_users_staff_access_consistent`       | ADMIN has no department/approval fields and no review/rejected state. USER is either unapproved with no department in pending-verification/pending-approval/rejected/suspended, or approved with department and verified email in active/suspended. No active unapproved USER and no partial assignment. |
| `users_staff_approved_by_id_fkey`        | Retain the approving identity; delete is restricted.                                                                                                                                                                                                                                                     |
| `users_created_id_idx`                   | `(created_at DESC, id DESC)` for bounded all-staff directory ordering.                                                                                                                                                                                                                                   |
| `users_role_status_created_id_idx`       | `(role, status, created_at DESC, id DESC)` for verified USER pending-review reads.                                                                                                                                                                                                                       |

Keep `users_email_key`, `users_status_role_idx` and current refresh indexes. The
directory searches supported name/email/phone with bounded input and pagination;
these are parameterized filters, not authorization. Do not claim a B-tree speeds
arbitrary substring matching or add an unmeasured full-text subsystem.

## 3. Proposed retained `StaffDecision`

Create Prisma model `StaffDecision`, mapped table `staff_decisions`. Fields:

| Field(s)                                           | Database shape                                                                                         | Meaning                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                               | `uuid` PK/default UUID                                                                                 | Stable decision identity.                                                                                                        |
| `commandId`                                        | `command_id uuid`, required/unique                                                                     | Effective-command replay identity. Constraint/index `staff_decisions_command_id_key`.                                            |
| `targetId`, `actorId`                              | `target_id`, `actor_id uuid`, required                                                                 | Both FKs to `users.id`, restrict delete/cascade update; names `staff_decisions_target_id_fkey`, `staff_decisions_actor_id_fkey`. |
| `targetFullName`, `targetEmail`                    | `target_full_name varchar(150)`, `target_email varchar(320)`                                           | Locked target identity snapshot. Later profile edits do not rewrite it.                                                          |
| `actorFullName`                                    | `actor_full_name varchar(150)`                                                                         | Actual actor name at action time.                                                                                                |
| `actorRole`, `actorStatus`, `actorEmailVerifiedAt` | `actor_role user_role`, `actor_status user_status`, `actor_email_verified_at timestamptz(6)`; required | Actor authority snapshot; must be ADMIN/ACTIVE/verified. No client-supplied actor values.                                        |
| `operation`, `action`                              | `staff_operation`, `staff_decision_action`, required                                                   | Requested operation and resulting semantic action.                                                                               |
| `requestedDepartment`                              | `requested_department department`, nullable                                                            | Present only for approve/change-department; normalized request value used for replay binding.                                    |
| `beforeVersion`, `afterVersion`                    | `before_version`, `after_version integer`, required                                                    | Before version equals request `expectedAccessVersion`; result is exactly before + 1.                                             |
| `beforeStatus`, `afterStatus`                      | `before_status`, `after_status user_status`, required                                                  | Effective state snapshots.                                                                                                       |
| `beforeDepartment`, `afterDepartment`              | `before_department`, `after_department department`, nullable                                           | Assignment snapshots.                                                                                                            |
| `beforeApprovedAt`, `afterApprovedAt`              | `before_approved_at`, `after_approved_at timestamptz(6)`, nullable                                     | Approval evidence snapshots.                                                                                                     |
| `beforeApprovedById`, `afterApprovedById`          | `before_approved_by_id`, `after_approved_by_id uuid`, nullable snapshots                               | Approval actor identities at each side; historical scalar snapshots, not a mutable current-authority reference.                  |
| `occurredAt`                                       | `occurred_at timestamptz(6)`, required                                                                 | One server time captured after locks/validation; used for new approval time and decision together.                               |

No password/credential, arbitrary request body, mutable JSON authority blob or
mandatory rejection reason is stored. Event snapshots are internal; the contract
owner explicitly allowlists the decision data that staff responses expose.

Add `staff_decisions_target_version_key` unique `(target_id, after_version)` and
`staff_decisions_target_occurred_id_idx` on `(target_id, occurred_at DESC, id DESC)`.
Add checks `ck_staff_decisions_actor_authority` (ADMIN/ACTIVE and verified time),
`ck_staff_decisions_versions` (before nonnegative and after = before + 1),
`ck_staff_decisions_request_shape` (requested department iff approve/change), and
`ck_staff_decisions_approval_pairs` (both before/after approval time/actor pairs).
`ck_staff_decisions_transition` enforces the action rows in section 4, including
status, changed/retained department and approval evidence, without consulting a
user's later state. History need not have consecutive versions: verification and
restricted-admin procedure revisions are not employee staff decisions.

Reject `UPDATE` and `DELETE` on this table with migration-authored trigger
`staff_decisions_immutable` calling trigger function
`reject_staff_decision_mutation()`. There is no application history-edit/delete
method or account-delete feature. Runtime code performs append-only inserts;
database-owner privileges are outside this application guarantee. Test teardown
uses the API test-only helper proposed at
`apps/api/src/test-support/reset-test-data.ts`, excluded from production build/output,
or equivalent database-package-owned integration cleanup. Both require the owned
disposable-URI marker and test environment, then explicitly truncate only
`staff_decisions`, `initial_administrator_provisioning`, `refresh_tokens`, `users`
together, without `CASCADE`. Otherwise destroy the owned container. A new domain FK
must fail this bounded cleanup until its owner updates the explicit fixture graph;
do not add a runtime bypass flag to the trigger or import an API test helper into
the database package's rootDir. The feature plan owns exact helper/build exclusion
and isolated teardown instructions.

## 4. Effective employee transitions

All rows require current verified active ADMIN actor, USER target, expected current
version, and atomic account-plus-decision success. Absent department/approval means
all three approval/assignment fields are null; approved means all are present.

| Request                 | Eligible target                         | Result and audit action                                                            |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Approve with department | Verified `PENDING_APPROVAL`, unapproved | `ACTIVE`; assign department and first approval actor/time; `APPROVE`.              |
| Approve with department | Verified `REJECTED`, unapproved         | Same retained identity becomes `ACTIVE`; assign first approval; `RECONSIDER`.      |
| Approve with department | Verified `SUSPENDED`, unapproved legacy | Keep `SUSPENDED`; assign first approval/department; `PREPARE_APPROVAL`.            |
| Reject                  | Verified `PENDING_APPROVAL`, unapproved | `REJECTED`, fields remain absent; `REJECT`.                                        |
| Change department       | Approved `ACTIVE` or `SUSPENDED`        | Replace only department; retain status and original approval; `CHANGE_DEPARTMENT`. |
| Suspend                 | Approved `ACTIVE`                       | `SUSPENDED`; retain department/approval; `SUSPEND`.                                |
| Reactivate              | Verified approved `SUSPENDED`           | `ACTIVE`; retain department/approval; `REACTIVATE`.                                |

All effective rows increment `accessVersion` once. Unsupported source states
conflict; unverified targets cannot be approved. An ADMIN target is denied before
replay or target-eligibility interpretation. No employee action changes role,
credentials, verification, registration time or another account.

## 5. Staff command transaction, replay and failure algorithm

Named command bodies have `commandId` UUID and `expectedAccessVersion` integer,
plus `department` for approve/change only. The contract owner fixes schema exports,
DTOs and HTTP errors. The algorithm below is common to all named staff writes:

1. Validate UUID/version/strict command shape before transaction. Derive actor ID
   from verified identity, never request body. Open one interactive Prisma
   transaction at `ReadCommitted`, `maxWait: 5000`, `timeout: 10000`.
2. Deduplicate actor/target IDs, normalize canonical UUID text, sort ascending, and
   acquire each user row sequentially in that order using fixed parameterized
   `SELECT "id" FROM "users" WHERE "id" = ${id}::uuid FOR UPDATE`. This is a
   planning query shape, not executable application code. Do not use `$queryRawUnsafe`,
   concatenate IDs or inject a wire enum into SQL. Query/mapper operations after
   locking use the same transaction client.
3. Reload current actor with Prisma. Missing identity is unauthorized; actor must
   be ADMIN/ACTIVE/email-verified now. Deny without decision if that fails. Then
   reload target; missing target is not found; ADMIN target is forbidden. Return
   no private record from either failure.
4. Look up `StaffDecision.commandId`. If found, compare stored actor, target,
   operation, normalized requested department and `beforeVersion` to the exact
   request. Any mismatch conflicts. Exact binding replays only when the target's
   current version **and all current access fields** equal the decision's after
   snapshot. Return current safe target/original decision with `replayed: true`,
   no write/event. A later change means conflict even if values later coincidentally
   resemble the old result. Actor authority is still required for replay.
5. For an unrecorded command ID require expected version = current target version;
   stale intent conflicts before considering a no-op. If current approved state
   already satisfies the same named intent, return unchanged safe target,
   `decision: null`, `replayed: false`: approve with same department on approved
   active/suspended; reject on rejected; suspend on approved suspended; reactivate
   on approved active; change to the current department. Check verification and
   approval eligibility rather than treating any suspended account as a no-op.
6. A no-op **does not reserve its command ID** because it has no effective decision.
   A client retains the same ID for an uncertain retry of the same intent and
   creates a new ID for changed intent. Later revision still rejects that retry
   through its old expected version. Persisted key/payload binding is guaranteed
   for effective decisions, not unreserved no-op IDs; no extra receipt subsystem
   is introduced.
7. For a real change apply the exact source/result row in section 4. Capture one
   server time. Use conditional `user.updateMany` on target ID, role USER,
   `accessVersion`, current source status and relevant approval/department fields;
   require affected count = 1. Write only operation-allowed fields and increment
   version. Even under locks, predicates protect against future accidental callers.
8. Insert the complete decision with the same transaction client, then select/map
   safe result. Commit both together. On any insert/update/constraint failure,
   rollback both. Denied, invalid, conflicting and cancelled commands insert no
   successful event. Do not send notification mail; it is outside P01.
9. A competing global command-ID unique violation rolls back this attempt. Start
   one fresh read transaction with the same locks/authority/replay checks to
   classify the recorded receipt; do not turn every `P2002` into success. Recognized
   `P2034` transaction aborts permit at most one complete retry with the same
   request/command ID and fresh authority checks. Other errors are not blanket
   retried. An unknown commit/disconnection outcome remains uncertain; reload the
   same target before any new intent.

Lock acquisition is bounded by transaction settings. Safe constraint/error mapping
must recognize only intentional named boundaries in the owning Prisma error mapper;
raw SQL/driver details never reach responses/logs. Timeout is not rollback evidence.

## 6. Current authority, session writes and competing suspension

Proposed `apps/api/src/modules/auth/account-authority.ts` owns these exact exports:

- `AUTHORITY_ACCOUNT_SELECT`: exported literal selecting exactly `id`, `email`,
  `fullName`, `phone`, `role`, `status`, `department`, `staffApprovedAt`,
  `staffApprovedById`, `accessVersion`, `emailVerifiedAt`, `createdAt`, `updatedAt`,
  each `true`; declare with `as const satisfies Prisma.UserSelect`. No credential/
  token field is selected. Middleware's existing `Pick<DatabaseClient, 'user'>`
  lookup and the transaction loader reuse this selection; do not add an unrelated
  full-record query or convert safe wire dates back into internal dates.
- `AuthorityAccount`: readonly `Prisma.UserGetPayload<{ select:
typeof AUTHORITY_ACCOUNT_SELECT }>` derived from that selection. Dates stay
  `Date` internally, and `staffApprovedById` remains internal. Middleware's private
  identity resolver shares this selected result between identity/business guards,
  then `mapSafeUser` performs the public ISO/field projection.
- `lockAccountRows(tx: Prisma.TransactionClient, userIds: readonly string[],
mode: 'read' | 'write'): Promise<void>`: lowercase canonical UUID text, deduplicate,
  sort and acquire sequential fixed `FOR SHARE` (`read`) or `FOR UPDATE` (`write`)
  row locks. Mode chooses one of two fixed query texts; it is not interpolated SQL.
  It does not authorize or fabricate missing rows.
- `loadIdentityAccount(tx: Prisma.TransactionClient, userId: string):
Promise<AuthorityAccount>`: uses `AUTHORITY_ACCOUNT_SELECT`; missing row throws
  existing `UnauthorizedException`. The caller establishes the appropriate lock.
- `assertBusinessAuthority(account: AuthorityAccount, department?: Department):
void`: current verified ACTIVE ADMIN is allowed across departments; USER requires
  current verified ACTIVE status, approval fields and one department. Restricted
  identity throws proposed `AccountRestrictedError`; wrong employee department
  throws proposed `DepartmentAccessDeniedError` from the new `auth.errors.ts`.

`Prisma`, `User`, server `Department`, `UserRole` and `UserStatus` come from
`@template/database`; the database index must export the new generated enum. Never
import browser contracts into the lock SQL to manufacture a database enum. The
helper is proposed; it is absent at PLAN intake. PostgreSQL's row-lock behavior and
consistent acquisition order are the basis for this protocol
([PostgreSQL 18 explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html)).

Reuse JWT/refresh identity and the existing token/CSRF/cookie owners. Restricted
states can resolve their own private account and logout through identity guards;
only verified active approved employees with a department, or verified active
ADMIN, satisfy business authority. Department/status/approval claims in old browser
state or tokens never override a fresh row.

- **Protected read:** in a short transaction acquire a fixed parameterized
  `FOR SHARE` actor-row lock, load current authority, then run scoped read(s) using
  that transaction. It serializes the current check/read against an authority
  change. Do not hold locks across response serialization, network or browser work.
- **Protected write:** acquire actor `FOR UPDATE` before current eligibility and
  dependent data writes; hold through commit. For multiple user identities use
  the same ascending lock order as section 5. P01 profile/password writes and
  future domain writes consume this protocol rather than trust middleware alone.
- **Verification:** lock the account, retain one-time token predicate/affected-row
  check and set verification time. USER moves to `PENDING_APPROVAL`; an existing
  ADMIN in `PENDING_VERIFICATION` moves to `ACTIVE`, retaining the same ADMIN role
  and null employee fields. Both increment accessVersion once and consume the
  credential. No employee approval/department/staff event or new public promotion
  is invented. Existing ADMIN verification is preserved independently of initial
  provisioning; suspended/consumed/invalid verification remains denied.
- **Login/refresh:** expensive password comparison occurs outside the transaction;
  login then acquires a `read` user lock and reloads the account, checking that its
  current password hash equals the hash actually compared before creating a refresh
  record. A raced password replacement cannot grant a new session using the old
  password. Refresh uses the same `read` user lock and loads/consumes the original
  refresh record and creates its replacement inside that transaction. Lock user
  first, then refresh row; all touched session operations share that order.
  Restricted identity may refresh
  identity-only status access, never restored business access. Rotation remains
  atomic and one-time; do not delete every refresh record on suspension, which
  would remove the existing identity's private status/exit path.
- **Password/reset:** expensive password hashing/verification happens outside the
  short transaction; inside, lock user, recheck active/verified business eligibility,
  current credential/token hashes and expiry, then update and revoke refresh
  records together. A reset issued before suspension/reassignment cannot bypass
  current eligibility. Profile/password changes never alter employee authority.
- **Logout/all:** identity-only authority suffices; lock current user before refresh
  deletion. Preserve existing revocation semantics, including the limitation of
  already-issued access tokens. This does not promise immediate universal token
  invalidation.

The separately authorized restricted-admin procedure must use the same user-row
locks for authority changes and increment `accessVersion`. If it suspends an acting
ADMIN first, a waiting staff transaction reloads that actor and denies with no
target/event changes. If the staff transaction locks the actor first, its decision
commits before suspension can commit. No staff decision is linearized after a
committed actor suspension. The same ordering applies to employee business writes
versus their suspension/reassignment. An in-flight operation can precede the saved
change; after the change, subsequent operations cannot use its prior authority.

## 7. Restricted initial-administrator receipt

Proposed model `InitialAdministratorProvisioning` maps to
`initial_administrator_provisioning`. It is the receipt for the separately restricted
initial-admin CLI in the feature plan, never an ordinary staff action or an invented
human ADMIN actor. Fields:

| Field                           | Database shape and constraint                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | `varchar(13)` primary key, literal `INITIAL_ADMIN`; check `ck_initial_admin_singleton` permits only that value.                                                                             |
| `targetId`                      | `target_id uuid`, required/unique; `initial_administrator_provisioning_target_id_key`; FK `initial_administrator_provisioning_target_id_fkey` to users with restrict delete/cascade update. |
| `operatorReference`             | `operator_reference varchar(128)`, required nonblank trimmed reference; `ck_initial_admin_operator_reference`. It identifies the authorized operator without storing a credential.          |
| `occurredAt`                    | `occurred_at timestamptz(6)`, required server time.                                                                                                                                         |
| `beforeVersion`, `afterVersion` | Integer columns `before_version`/`after_version`; `ck_initial_admin_versions` requires before nonnegative and after = before + 1.                                                           |

The CLI's apply transaction first acquires a fixed transaction advisory lock for
the initial-bootstrap operation, then the selected user `write` row lock. Under
that lock it checks the singleton is absent and **zero ADMIN rows exist**, including
suspended/unverified administrators. It validates expected ID/normalized email and
version against one verified `PENDING_APPROVAL` USER with absent employee fields;
the conditional USER→ADMIN/ACTIVE change leaves those fields null, increments
version and inserts this receipt atomically. Passwords/verification/profile remain.
It cannot unsuspend/promote a different state or overwrite another account. The
singleton remains even if authority later changes; repeat initial provisioning is
denied. Exact CLI flags, preview/apply procedure and operator/environment gates are
owned by the feature plan. No public/staff endpoint reaches this operation.

Add immutable trigger `initial_administrator_provisioning_immutable` using the
same rejecting trigger function as staff history. Do not add an admin-lifecycle
framework or use a fake employee approval. Future separately authorized ADMIN
lifecycle procedures must serialize through this bootstrap advisory lock whenever
creating/removing ADMIN authority, as well as affected user locks; P01 implements
only initial provisioning and ordinary employee management.

## 8. Forward migration and recovery design

Proposed new migration directories are
`20261103000100_extend_staff_access_enums` and
`20261103000200_staff_access_state_and_history`; neither exists at PLAN intake.
The first adds enum values/types and commits before the second references new
values. This avoids PostgreSQL's restriction on using an enum value added inside
the same uncommitted transaction ([PostgreSQL 18 ALTER TYPE](https://www.postgresql.org/docs/18/sql-altertype.html)).

The second migration runs the following database change as an explicit transaction:

1. Add nullable employee fields and version default 0; create decision and singleton
   initial-admin receipt tables, constraints/FKs/indexes and immutable triggers.
2. Preserve IDs, normalized email, password hashes, profile/contact, verification
   time, creation time and existing restrictions. Map ordinary USER rows as follows:
   verified and not suspended → `PENDING_APPROVAL`; unverified → remain
   `PENDING_VERIFICATION`; suspended → remain `SUSPENDED`. Set all legacy employee
   department/approval fields null. Preserve every valid ADMIN role/state/verification
   combination. Before modifying account rows, explicitly detect ADMIN rows with
   pending-verification status and a nonnull verification time, or another
   verification/status mismatch. Stop with a safe migration diagnostic identifying
   this named invariant and the affected row count; the authorized operator must
   review/correct those identities through a separate explicit procedure. Never
   choose a different ADMIN status or discard its verification time automatically.
3. Preserve existing credential hashes and refresh/reset records. New current-state
   checks deny USER business access and recovery while pending/suspended without
   granting review approval. Valid old identity can resolve private status; old
   JWTs/refresh data never carry approval into the new business guard. ADMIN retains
   its present verification/suspension restrictions.
4. Add/validate new account checks after backfill, including
   `ck_users_verification_state_consistent`; retain the normalized-email and existing
   status/verification checks. An unexpected contradictory legacy row fails the
   migration for explicit investigation, never silent promotion/assignment.
5. Do not create fake administrator decisions for migration: no actual approving
   actor exists. Access version starts at 0 after adoption; every later authority
   transition increments it. Verify counts, identity/credential preservation and
   constraints against representative populated fixtures.

This is a coordinated maintenance cutover: stop old application writers before
the second migration and run only the P01-compatible producer/consumer afterward.
Old auth binaries would otherwise activate USER on verification and cannot remain
running alongside the new checks. Migration execution, target database, backup and
production cutover require their own authorized environment; PLAN executes none.
Review generated SQL before applying and preserve the initial migration unchanged.
Do not use `db push`, reset or the optional seed as migration/provisioning substitutes.

The current optional local seed's ACTIVE USER upsert is incompatible with the new
employee constraint. Follow the create-only seed correction in feature
[OP-10](plan.md#op-10--existing-account-migration-and-coordinated-compatibility): new
synthetic USERs await approval; an existing normalized-email identity is skipped
without a write. It must not fabricate staff approval, replace credentials or
rewrite prior decisions. This is local compatibility work, never production bootstrap.

If enum expansion succeeds but the second transaction fails, old values/data remain
and the additional unused enum labels are harmless; inspect/fix the failed forward
migration through Prisma's reviewed recovery procedure. If the second commits,
rollback to old binaries is unsafe: use a corrected forward release or restore the
separately verified backup during an authorized maintenance action. Never restore
old automatic USER authority or delete retained history to obtain a green check.

### 8.1 History-preserving convergence

Application history outside disposable tests is unknown. This subsection supersedes
the original two-migration execution assumptions above. Add a data-only Prisma
migration `20261103000150_repair_legacy_verified_users/migration.sql` after the
committed enum expansion and before the existing state migration. Preserve all
original SQL and checksums. Prisma deploy must execute this missing migration
in order on a legacy database and as a data no-op on a database where the state
migration already succeeded.

1. Use a single atomic PostgreSQL DO statement and lock the users table against
   writers within it. If the
   validated verification consistency check from the state migration already
   exists on users, the repair is a no-op.
2. In the legacy schema, count verification/status contradictions excluding the
   specific repairable verified pending USER rows. If any remain, raise the
   existing named preflight diagnostic with a count and roll back. Never normalize
   an ADMIN. Then update only verified pending USER rows to `PENDING_APPROVAL`.
   Preserve every other field and retained record. The old timestamp constraint
   accepts the new status because those rows already have a verification timestamp.
3. The existing state migration runs unchanged after the repair. Each migration
   is a separate commit. Keep old writers offline throughout the cutover. If a
   later migration fails, the repair may already be durable and the old binaries
   must stay offline.
4. If Prisma reports a failed state migration from an earlier attempt, stop.
   An authorized operator must check the backup, ledger and actual schema/data.
   Only after proving the failed migration left no partial effects, use
   `prisma migrate resolve --rolled-back 20261103000200_staff_access_state_and_history`
   and retry deploy under maintenance. A partial or uncertain application requires
   separate recovery. Never resolve an unapplied migration as applied to bypass it.

On disposable PostgreSQL verify fresh deploy and repeat deploy, populated legacy
upgrade with exact verified pending USER and refresh-record preservation, refusal
of a contradictory ADMIN without repairing another row, and deployment over a
populated database carrying both original P01 migration checksums. Compare the
old applied ledger rows and stored identities before and after the latter deploy.

## 9. Planned data verification

These are future implementation cases, not executed evidence. Existing API and
database integration setups use disposable `postgres:18.4`, deploy migrations and
stop their owned containers. No developer/production fallback is allowed.

| Case                      | Concrete action and expected persisted outcome                                                                                                                                                                                                                                                                                                                                      | Proposed/discovered test owner                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh/populated migration | Initial migration only → representative verified USER, unverified USER, suspended USER, active/suspended ADMIN → both new migrations. Assert mapping, original IDs/password/profile/times, null assignment, reset/session policy, exact new inventory and repeated deploy.                                                                                                          | Extend `packages/database/tests/integration/migration.integration.test.ts`; extend `packages/database/tests/schema-contract.test.ts`. |
| Account constraints       | Attempt active unapproved USER, partial approval pair, multi-state inconsistency, verified pending-verification USER/ADMIN, ADMIN department/review state and negative version through SQL. Each is rejected by its named check, leaving the prior valid row. A populated upgrade containing an inconsistent legacy ADMIN fails atomically with no automatic state/time correction. | Same migration integration owner.                                                                                                     |
| Allowed transitions       | Pending→approve, pending→reject→reconsider, active/suspended department change, suspend/reactivate, legacy suspended prepare→separate reactivate. Assert one revision/event per effective change and preserved original approval/earlier decisions.                                                                                                                                 | Proposed `apps/api/src/modules/staff/staff.service.integration.test.ts`.                                                              |
| Denial and no-op          | Non-admin/suspended ADMIN/ADMIN target; stale source; same current intent; cancel before command. Assert account and successful-event inventory unchanged; no-op key remains unreserved.                                                                                                                                                                                            | Proposed staff service integration + actual HTTP cases in `apps/api/src/app.integration.test.ts`.                                     |
| Exact replay/key conflict | Lost effective response; same key/body while current → original decision; changed actor/target/payload/base version → conflict; later revision then original retry → conflict.                                                                                                                                                                                                      | Proposed staff service integration + HTTP owner.                                                                                      |
| Competing decisions       | Independent clients/barriers issue approve sales vs reject at one version. Exactly one change/event wins; losing state/history absent. Also race same key across targets and inspect unique binding.                                                                                                                                                                                | Proposed staff service integration owner.                                                                                             |
| Actor suspension ordering | Connection A locks acting ADMIN; B restricted-procedure fixture attempts suspension. Test both controlled lock orders; commit-before-suspend or deny-after-suspend, never a post-suspension winning decision.                                                                                                                                                                       | Proposed staff service integration owner; synthetic privileged fixture only.                                                          |
| Atomic failure/history    | Cause a real decision insert failure after target write in the actual transaction; inspect restored user/version and unchanged prior events. SQL UPDATE/DELETE of a retained decision is rejected; target/actor deletion is restricted.                                                                                                                                             | Proposed staff service integration; migration integration for trigger/FKs.                                                            |
| Initial admin singleton   | Preview performs no write; apply promotes only expected verified pending identity and records operator/time once; wrong identity/version/state, existing suspended ADMIN, repeat and two competing applies leave zero losing changes. Receipt insert failure rolls back role change.                                                                                                | Restricted-provisioning test owner in feature plan; migration integration verifies receipt checks/immutability.                       |
| Current session writes    | Existing access token + suspend/reassign; direct HTTP next request denied or scoped to new department. Race profile/reset/refresh against authority change, using independent connections and deterministic barriers.                                                                                                                                                               | Extend `apps/api/src/app.integration.test.ts`, `apps/api/src/modules/auth/auth.service.integration.test.ts`.                          |
| Regression                | Preserve email normalization, one-time verification/reset, rotation, neutral recovery, profile field rules, CSRF and safe output. New staff decisions never contain hashes/tokens/passwords.                                                                                                                                                                                        | Existing auth/app integration and contract tests plus new staff tests.                                                                |

Use database blockers/barriers and independent connections, not arbitrary sleeps or
two sequential calls presented as a race. Hash/mail doubles stay outside the actual
database boundary. Teardown must respect immutable history and close clients even
on failure. Future focused commands are the existing manifest scripts:

```sh
pnpm --filter @template/database test tests/schema-contract.test.ts
pnpm --filter @template/database test:integration tests/integration/migration.integration.test.ts
pnpm --filter @template/api test:integration src/modules/staff/staff.service.integration.test.ts
pnpm --filter @template/api test:integration src/modules/auth/auth.service.integration.test.ts src/app.integration.test.ts
```

The staff test path is proposed and must be created/discovered before its command
can claim coverage. No command above has been run for this PLAN artifact. Current
source/API inspection supports design choices; only later real migration/HTTP/race
execution can establish backend acceptance.
