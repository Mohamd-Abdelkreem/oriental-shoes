# Feature Specification: Staff Identity, Approval, Department Access, and Accounts

**Roadmap Phase**: P01 — Staff identity, approval, department authorization, and accounts\
**Feature Directory**: `specs/001-staff-access-accounts`\
**Feature Branch**: `main` at intake; the feature number does not identify a Git branch\
**Created**: 2026-11-03\
**Status**: Draft specification; product clarification complete, implementation not started\
**Input**: Specify P01 only from root `plan.md` and `docs/workflow/phase-delivery.md`; reuse a matching accepted feature if present. No matching feature existed. The three owner answers below refine this feature only.

## Scope and Baseline

- **Outcome**: Verified employees work only after administrator approval and assignment to one department. Current account state governs access across sessions. ADMIN retains cross-department access. Existing account functionality remains real and usable.
- **Deliverables**: Employee registration/verification/review lifecycle; administrator staff directory and pending requests; approval, rejection, reconsideration, department changes, suspension and reactivation; current-user status and safe navigation; department access enforcement; preserved profile/password/session functions; existing-account transition rules; a restricted initial-administrator procedure; evidence requirements for the P01 journey.
- **Exclusions**: P02–P08 domain implementation, customer/order/manufacturing/report data, catalog/pricing/numbering, official-print permission changes, new staff-management pages, redesign, multiple employee departments, supervisors/assignment management, public administrator registration, in-app ADMIN lifecycle changes, OTP rollout, approval-notification delivery, production provisioning/deployment, resets/imports, commits and pushes.
- **Dependencies**: Reuse the adopted [constitution](../../.specify/memory/constitution.md), [engineering guides](../../docs/engineering/README.md), [phase contract](../../docs/workflow/phase-delivery.md) and [handoff rules](../../docs/workflow/implementation-handoff.md). Root [roadmap](../../plan.md) still says “Draft for owner review”; this SPECIFY request does not approve application implementation or other phases. P01 needs no catalog, price or order-number input. OPS-01 target/operator/initial-administrator values remain release dependencies; they do not prevent designing and testing a restricted procedure with synthetic data.
- **Existing foundations**: Reuse actual authentication, verification/recovery mail, profile/password/session behavior and existing validation, transport, server-state and persistence boundaries. Do not rebuild authentication or import fixture identities/passwords.
- **Frontend boundary**: Preserve Arabic/RTL/Cairo, existing navigation, screens, dialogs, account cards and responsive behavior. Necessary functional status/error/access copy and control restrictions use existing surfaces. Required backend acceptance precedes dependent frontend integration.
- **Open decisions**: None for the bounded product behavior below. PLAN must resolve technical interfaces, enforcement, migration mechanics and the provisioning procedure. Production environment/operator values remain OPS-01 inputs, never guessed credentials.

### Verified current behavior

Source inspected on 2026-11-03 establishes this baseline; application checks were not executed for this specification.

| Existing source owner                                                                                                                                                    | Current evidence and P01 distinction                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Auth service](../../apps/api/src/modules/auth/auth.service.ts) and [request contracts](../../packages/contracts/src/auth/auth.schema.ts)                                | Real registration, verification, login, recovery and sessions exist. Verification currently activates a generic account; P01 changes its business-access result to pending review. Registration collects name/email/optional phone/password, without a requested department. Recovery currently requires an active verified account. |
| [Account contracts](../../packages/contracts/src/account/account.schema.ts) and [database schema](../../packages/database/prisma/schema.prisma)                          | Roles are USER/ADMIN; states are pending verification, active and suspended. Department, approval/rejection and staff decision history are missing.                                                                                                                                                                                  |
| [Staff screen](../../apps/web/src/features/administration/screens/admin-users-view.tsx)                                                                                  | Search and account actions mutate browser-local employees. The existing UI is a migration surface, not persisted authority.                                                                                                                                                                                                          |
| [Workspace shell](../../apps/web/src/components/workspace/workspace-shell.tsx) and [return-path helper](../../apps/web/src/features/auth/utils/safe-return-path.ts)      | URL-derived workspace labels and the generic USER sales fallback do not establish department authorization.                                                                                                                                                                                                                          |
| [Account wrapper](../../apps/web/src/features/prototype/components/oriental-account-settings.tsx) and [users service](../../apps/api/src/modules/users/users.service.ts) | Profile/password/session forms already use real account behavior. Their location under `prototype` does not make them disposable.                                                                                                                                                                                                    |

### Existing surfaces in scope

| Existing surface                                                                                                                             | Required P01 behavior                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/register`, `/auth/verify-email`, `/auth/login`                                                                                        | Real lifecycle and safe landing based on current verification, approval, status and department.                                                          |
| `/auth/forgot-password`, `/auth/reset-password`                                                                                              | Preserve neutral recovery and one-time reset behavior under the eligibility rules below.                                                                 |
| `/auth/pending-approval`, `/auth/rejected`, `/auth/suspended`                                                                                | Promote existing development presentations to private real-state feedback; guessed email/URL cannot reveal another account's state.                      |
| `/admin/users`, `/admin/users/pending`                                                                                                       | Real directory/search/counts and existing review/management dialog. Pending list contains verified applications awaiting review.                         |
| `/admin/registration-requests`                                                                                                               | Preserve redirect to `/admin/users/pending` with the same administrator restriction.                                                                     |
| `/admin/account`, `/sales/account`, `/approval/account`, `/cutting/account`, `/production/account`, `/quality/account`, `/warehouse/account` | Preserve real self-service controls. Employee access follows their department; ADMIN may enter agreed sections. Forms always edit the signed-in account. |
| Workspace navigation, `/unauthorized`, `/`                                                                                                   | Current-department landing, wrong-workspace denial, and existing root redirect to `/auth/login`.                                                         |

The separate `AdminAssignRoleDialog` has no rendered caller at intake and does not require another management path. OTP/prototype previews remain separate development capabilities. P01 guards retained workspace access; later phases still own operational data/commands. P01 cannot claim those commands are persisted or remove their reached UI/provider wholesale. Existing print restrictions remain until P04/P08 implement their projections and permissions.

## Clarifications

### Session 2026-11-03

- **Q1 — ADMIN lifecycle**: The owner selected ordinary-employee management only. ADMIN provisioning and changes use a separate restricted procedure. Staff UI cannot grant/revoke ADMIN or manage administrator status. The demo administration option is not an employee department.
- **Q2 — Existing USER accounts**: Existing verified generic USER accounts await administrator review without a department. Suspended accounts remain suspended. Past verification and old sessions do not establish approval.
- **Q3 — Rejected accounts**: ADMIN may approve the same retained rejected account after verification and department selection, preserving the earlier rejection decision.

## User Scenarios & Testing

### User Story 1 — Register and wait for approval (Priority: P1)

An employee registers, verifies email and sees their real pending state until ADMIN grants departmental access.

**Why this priority**: Verification alone must grant no business authority.

**Independent Test**: Using a new synthetic employee and existing identity infrastructure, complete registration/verification and attempt workspace access before approval. Approval is independently exercised in Story 2.

**Acceptance Scenarios**:

1. **Given** a new employee, **When** valid registration is submitted, **Then** the account awaits verification with no department, approval or ADMIN role.
2. **Given** an unverified employee, **When** a valid unused verification link is redeemed, **Then** verification is retained and the employee awaits administrator review without business access.
3. **Given** a verified pending employee, **When** correct credentials are presented, **Then** their private pending screen appears instead of a workspace; wrong credentials disclose no account status.
4. **Given** an invalid/expired/consumed verification link, **When** it is used, **Then** no approval or department is granted and existing safe feedback remains truthful.

### User Story 2 — Review and manage staff (Priority: P1)

ADMIN searches real staff and makes explicit department/account decisions through the existing screen.

**Why this priority**: Administrator decisions establish and maintain employee authority.

**Independent Test**: With verified pending/rejected/active/suspended synthetic staff and ADMIN, exercise allowed transitions and denials without customer/order data.

**Acceptance Scenarios**:

1. **Given** verified pending staff, **When** ADMIN finds a person by name/email/phone and approves one department, **Then** only that account becomes approved/active with that department and actual decision actor/time.
2. **Given** a pending application, **When** ADMIN rejects it, **Then** the retained account is denied, leaves the pending list and retains its decision on reload.
3. **Given** a verified rejected account, **When** ADMIN approves that same identity with one department, **Then** both rejection and later approval remain traceable.
4. **Given** an approved employee, **When** ADMIN changes department, suspends or reactivates them, **Then** the allowed transition is recorded. Reactivation requires verification, retained approval and one department.
5. **Given** an ADMIN target or non-admin actor, **When** an ordinary staff command attempts a privileged account change, **Then** it is denied with unchanged account/history.

### User Story 3 — Enforce current workspace authority (Priority: P1)

An active employee reaches their assigned workspace; ADMIN retains cross-department access. Changes affect sessions already in use.

**Why this priority**: A browser selector or old login must not preserve revoked authority.

**Independent Test**: Use one employee per employee department, ADMIN and two existing sessions of one employee. Exercise direct navigation and actual protected requests. Later-phase resources are not claimed as already implemented.

**Acceptance Scenarios**:

1. **Given** an approved active sales employee, **When** they sign in, **Then** sales is their landing; direct cutting navigation/requests are denied without protected content or record changes.
2. **Given** current authorized ADMIN, **When** agreed department sections are entered, **Then** identity authorization permits access without inventing an employee assignment.
3. **Given** an employee signed in twice, **When** ADMIN suspends them, **Then** subsequent protected reads/writes and status/refresh resolution grant no business access; validated identity can see the private suspended presentation.
4. **Given** active sales staff with an old session, **When** ADMIN changes their department to cutting, **Then** subsequent sales access is denied, current navigation resolves to cutting, and they never have both departments.
5. **Given** an unsafe or wrong-department return location, **When** login completes, **Then** the current authorized landing replaces it.

### User Story 4 — Keep real account and session controls (Priority: P1)

An eligible account owner maintains profile/password and ends sessions without changing their own authority.

**Why this priority**: Staff integration must preserve working account/recovery behavior and truthful failures.

**Independent Test**: With an approved active owner and isolated mail delivery, exercise actual forms and inspect saved data, credential/session effects and failed requests.

**Acceptance Scenarios**:

1. **Given** an eligible owner, **When** allowed profile fields are saved, **Then** reload shows their saved data; email/role/approval/status/department cannot be edited there.
2. **Given** eligible active verified and ineligible/nonexistent accounts, **When** recovery is requested, **Then** public feedback stays neutral and only eligible accounts receive usable recovery. Reset cannot grant approval or remove restrictions.
3. **Given** an eligible owner, **When** password change succeeds with correct current password and valid confirmation, **Then** existing credential/refresh-session effects occur. Invalid input preserves credentials and form draft.
4. **Given** a signed-in owner, **When** logout/logout-all succeeds, **Then** the browser reflects confirmed session termination and refresh revocation; failure remains visible without claiming signout success.

### User Story 5 — Adopt policy safely for existing accounts (Priority: P1)

The owner can adopt staff review without automatically authorizing old users or creating a public administrator path.

**Why this priority**: Migration must preserve identity and restrictions while establishing explicit approval.

**Independent Test**: Upgrade representative isolated accounts and inspect resulting access/data. Exercise the future restricted initial-admin procedure separately with synthetic identities.

**Acceptance Scenarios**:

1. **Given** old verified USER accounts without staff approval, **When** transitioned, **Then** identity/profile/password remain, but business access is denied pending review with no department.
2. **Given** old unverified or suspended USER accounts, **When** transitioned, **Then** those restrictions remain; a suspended unapproved employee requires explicit verified approval/department before separate reactivation.
3. **Given** existing ADMIN accounts, **When** transitioned, **Then** identity/role and verification/suspension restrictions are preserved; no USER is automatically promoted.
4. **Given** no initial production administrator, **When** a specifically authorized operator follows the restricted procedure, **Then** only the explicitly selected identity gains authority, without public registration, embedded credentials, fixture import or unintended changes to another account. This future requirement authorizes no provisioning now.

### Concrete Acceptance Examples

Values below are synthetic examples, never production seed accounts. Password examples describe bounds without publishing a credential.

| Requirement / scenario | Actor and starting state                       | Concrete input / action                                                                                       | Observable result                                                          | State unchanged on failure                |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| FR-001, FR-021         | New employee                                   | Register `Nour Test`, `NOUR@example.test`, omitted phone and a compliant 15-character password                | Normalized email, absent phone, pending verification, no business access   | Invalid input creates no accepted account |
| FR-021                 | New employee                                   | Blank name; name 151 characters; email 321 characters; phone 31 characters; new password 14 or 129 characters | Visible validation; no registration success                                | Other accounts and account inventory      |
| FR-002                 | Unverified employee                            | Use valid verification link                                                                                   | Verified, pending review, no department                                    | Approval/department remain absent         |
| FR-004, FR-006         | ADMIN; verified pending Nour                   | Approve into sales                                                                                            | One approved active sales identity and one actual ADMIN/time decision      | Other accounts and prior history          |
| FR-006                 | ADMIN; pending Nour                            | Omitted/null/blank/multiple department, administration or removed special operations                          | Validation/denial without implicit sales assignment                        | Pending state, department and decisions   |
| FR-007, FR-008         | ADMIN; rejected Nour                           | Approve retained identity into cutting                                                                        | Cutting only; earlier rejection plus new approval retained                 | No duplicate account                      |
| FR-005, FR-015         | Active sales staff                             | Attempt colleague approval or own role/status/department update                                               | Denied; no authority granted                                               | Target account and history                |
| FR-005                 | ADMIN                                          | Assign ADMIN or manage another ADMIN via staff UI/direct equivalent request                                   | Denied outside restricted procedure                                        | Administrator role/status                 |
| FR-009, FR-011         | Approved sales employee signed in twice        | Change department to cutting                                                                                  | Next sales request denied; current status and new login resolve cutting    | Stable identity and history               |
| FR-010, FR-011         | Active approved cutting staff                  | Suspend, then attempt work or refresh                                                                         | No business access; private suspended feedback after identity validation   | Operational records/history               |
| FR-010, FR-022         | Old suspended USER without approval/department | Direct reactivation                                                                                           | Rejected until verification, explicit approval and one department exist    | Suspension and absent business authority  |
| FR-012                 | Active employee                                | Request another department or external website as return location                                             | Current authorized landing; no external redirect                           | Role/department                           |
| FR-003, FR-016         | Anonymous caller                               | Guess `nour@example.test` in status/recovery flow                                                             | No public pending/rejected/suspended disclosure                            | Private account data                      |
| FR-017                 | Active owner with phone                        | Save name only; clear phone explicitly; submit empty update                                                   | Omitted phone preserved; blank/null clears; empty update invalid           | Invalid update preserves profile          |
| FR-018                 | Active verified owner with issued reset link   | Suspend, then redeem old link                                                                                 | No usable reset for now-ineligible account; no reactivation                | Password and suspension                   |
| FR-018                 | Pending/rejected/suspended/nonexistent account | Request recovery                                                                                              | Neutral public response; no usable recovery issued                         | Credentials/approval/status               |
| FR-019                 | Active owner                                   | Wrong current password or mismatched confirmation                                                             | Visible validation/authentication failure; draft retained                  | Password, authority and sessions          |
| FR-020                 | Signed-in owner                                | Logout request fails                                                                                          | Visible failure without fabricated signout success                         | No assumed server revocation              |
| FR-013                 | Two ADMINs reviewed same pending account       | Approve sales versus stale reject                                                                             | One commits; incompatible stale command conflicts and refreshes            | Winning state/department/history          |
| FR-013, FR-014         | ADMIN loses approval response after commit     | Reload target; repeat same still-current intent                                                               | Existing result visible; no duplicate decision or overwritten later change | Unrelated and later decisions             |
| FR-014                 | ADMIN; pending employee                        | Decision recording fails during approval                                                                      | No partial approval without its decision; visible failure                  | Account and all prior decisions           |
| FR-004, FR-024         | ADMIN                                          | Search `no-match@example.test`; separately fail the read                                                      | Real zero matches differ from error/retry; no sample staff fallback        | Staff data and recoverable draft          |
| FR-022                 | Old verified generic USER                      | Transition to P01                                                                                             | Same identity/profile/password, pending review without department          | No automatic approval/sales access        |
| FR-024                 | ADMIN opens management dialog                  | Choose department, then cancel before submit                                                                  | No command or saved decision                                               | Account/department/history                |

### Edge Cases

- Repeated registration/verification and expired/replayed links cannot create parallel identities or bypass review. Reconsideration uses the retained rejected identity, not duplicate registration with the same normalized email.
- Missing targets are visibly unsuccessful; another employee is never a fallback. Suspended/unverified administrators cannot complete staff commands.
- Approval/rejection, department changes and suspension can race. Actor authority and target eligibility must still hold when a change becomes effective.
- A lost response can follow a committed change: reload/reconcile before further intent; timeout is not proof of rollback.
- Dirty staff/profile input survives recoverable errors/background changes. Responses from an old account cannot replace the new account's presentation or reveal its data.
- Deny subsequent protected operations after access changes even with an old page/credential. This does not promise deletion of already-viewed information or introduce live push.

## Requirements

### Functional Requirements

- **FR-001**: Preserve self-registration with name, normalized unique email, optional phone and password under existing bounds. It grants no approval, department or ADMIN. Do not add a required requested-department input; absent requested values display honestly without fixture/default sales data.
- **FR-002**: Email verification establishes verified identity and leaves the employee pending review. Only verified employees are approvable. Invalid/expired/consumed verification credentials cannot grant authority.
- **FR-003**: Expose own verification/review/rejection/suspension/department only through authenticated or credential-validated context. Correct credentials may establish restricted own-status access without business access. Unknown/wrong credentials and guessed public status URLs disclose no private account state.
- **FR-004**: Current authorized ADMIN can read all-staff and verified-pending directories, search name/email/phone, and see matching rows/counts, real registration time, state and assigned department. Results are bounded and stably ordered; search covers all authorized matches rather than only the displayed page. Zero matches is valid empty success.
- **FR-005**: Ordinary staff management is ADMIN-only and targets ordinary employees only. It cannot grant/revoke ADMIN or manage administrator status/department. Direct requests have the same boundary. ADMIN lifecycle uses a separately restricted procedure.
- **FR-006**: Approving a verified pending employee requires exactly one allowed department and establishes approval, active state and department together. Employee departments are sales/exhibitions, approval, cutting, production/repair, quality/packing and warehouse/delivery. Administration is cross-department ADMIN authority; removed special operations is unavailable.
- **FR-007**: ADMIN may reject a verified pending application. Retain account/decision, remove pending eligibility and grant no business access. P01 introduces no mandatory rejection-reason or notification workflow absent from the accepted scope.
- **FR-008**: ADMIN may reconsider a verified rejected employee by approving that same identity with one department. Preserve rejection and later approval separately; duplicate registration is not reconsideration.
- **FR-009**: ADMIN may change an approved employee to one other allowed department. It must not create multiple departments, erase history or reactivate a suspended employee. Pending/rejected employees gain assignment through approval, never a department-only bypass.
- **FR-010**: ADMIN may suspend an approved active employee and reactivate suspended staff only with verification, explicit approval and one department. Suspension retains identity, department/approval evidence and history. For old suspended accounts lacking approval, establish verified approval/department explicitly through the existing management surface while keeping suspension; reactivation is a separate action, never an implicit consequence of assignment.
- **FR-011**: Protected P01 operations and retained workspace access boundaries must enforce current identity, verification, active state and required role. Employees additionally require explicit approval and their one assigned department; verified active ADMIN has cross-department authority without employee approval/assignment. Current-user/status/refresh resolution must respect changes affecting existing sessions. Restricted own-status access is not business access. After a change takes effect, subsequent operations cannot use revoked authority. URL/browser/local state or old credentials cannot override it. Later-phase operations must reuse this authority foundation.
- **FR-012**: Post-login/return navigation must use the current authorized department or private restricted-state presentation; ADMIN retains agreed cross-department navigation. Ignore unsafe/external/wrong-department returns. Never default an unapproved generic USER to sales.
- **FR-013**: Staff changes must check current actor authority and target eligibility. If a repeated intent is still the current committed result, acknowledge it without another decision. Incompatible stale actions or retries after a later change must conflict without overwriting it; refresh/review precedes new intent. Concurrent operations must leave one coherent outcome.
- **FR-014**: Every effective staff decision retains target identity, actual actor identity/name/authority at action time, server time and relevant before/after values. This includes approval, rejection, reconsideration, department change, suspension, legacy preparatory approval and reactivation. State/decision succeed or fail together. Denied/invalid/cancelled/conflicting/rolled-back commands append no successful decision. P01 provides no history-deletion action.
- **FR-015**: Derive actor, authority, decision result/time from trusted current context. Reject unsupported supplied role/approval/actor/time or other privileged fields outside the named authorized operation. Public registration/profile edits cannot alter rights.
- **FR-016**: Current-user/status/staff outputs include only allowed account/decision data. Never expose password hashes, plaintext/fixture passwords or verification/reset/refresh credentials. New status/review flows and public recovery feedback cannot disclose private staff lifecycle states or another account's private status. Preserve existing duplicate-email registration feedback without adding approval/rejection/suspension details; this is not a broader change to registration's existence-disclosure policy. Administrators cannot read employee passwords.
- **FR-017**: Preserve active eligible owners' profile editing of name/phone only. Omitted fields stay unchanged, blank/null phone clears, empty update is invalid and email is read-only. Invalid/unsupported updates leave the account unchanged. Account pages edit the signed-in identity.
- **FR-018**: Preserve active-and-email-verified recovery eligibility and neutral public feedback. Pending review, rejected, suspended, unverified and nonexistent accounts receive no usable recovery under this policy. Recheck eligibility when using a previously issued link. Reset cannot approve, assign a department or remove a restriction. Preserve one-time/expiry protections and truthful delivery-failure behavior.
- **FR-019**: Preserve eligible owners' password change with correct current password, matching confirmation, a different new password and existing bounds. Failure preserves credentials/authority. Success retains existing refresh-session effects and secret protections.
- **FR-020**: Preserve logout/logout-all with confirmed server outcomes and visible failures. Refresh cannot restore rejected/suspended/unapproved business authority or old department authority. Refresh-session revocation does not promise immediate invalidation of every issued access credential; current account authority still governs protected use.
- **FR-021**: Preserve existing bounds: nonblank name up to 150 characters; email up to 320 with case/outer-whitespace normalization; optional trimmed phone up to 30 with blank absent; new passwords 15–128 characters. Names reject null, empty, whitespace-only and embedded null-character values. Password whitespace remains significant and is not trimmed. Login/current-password retain nonempty maximum-128 input instead of a retroactive new-password minimum. Preserve the existing remember-me choice and its session-duration behavior. Staff/self-service commands reject unsupported fields.
- **FR-022**: Transition old verified generic USER accounts to pending review without department while retaining identity/email/profile/password. Preserve unverified status and existing suspensions. Suspended legacy approval/reactivation follows FR-010. Preserve existing ADMIN identity/role and verification/suspension restrictions. No automatic approval, sales assignment, promotion, deletion or fixture import.
- **FR-023**: Define a restricted initial production-ADMIN procedure for a specifically authorized operator and explicit identity. It cannot use public registration, ordinary staff UI, embedded credentials or the development seed. Verify resulting selected identity/authority and avoid overwriting another account's credentials/state. PLAN owns procedure design; actual environment/operator execution remains gated by OPS-01 and separate authorization.
- **FR-024**: Distinguish loading, empty, read-error/retry, write-pending, confirmed success, validation, denial, stale conflict and uncertain outcome on existing P01 surfaces. Preserve recoverable drafts, prevent duplicate submits, perform no write on pre-submit cancel, and synchronize status, directories/counts, navigation/account displays after success. Background/late results must not erase dirty input or repopulate another identity's data.
- **FR-025**: Preserve Arabic/RTL/Cairo, routes, account controls, accessible labels/focus and narrow/wide layouts. Make real status/unauthorized feedback usable outside development while keeping OTP/previews separate. Converted identity/staff surfaces cannot fall back to fixtures. Remove unsupported activation-message promises from pending copy; new approval email/SMS/push is outside P01.

### Authority and Data Rules

| Actor / state                                 | Allowed P01 behavior                                                      | Business authority                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Anonymous / invalid credentials               | Public registration and verification/recovery flow with safe feedback     | None; no private staff/status directory                                            |
| Unverified employee                           | Existing verification/resend feedback in validated context                | None; not approvable                                                               |
| Verified pending / rejected employee          | Own private status, credential validation and safe exit                   | None; no active profile/password/recovery self-service under preserved eligibility |
| Approved active employee                      | Real self-service account controls and assigned workspace                 | One department; later phases add resource ownership rules                          |
| Suspended employee                            | Own private suspended feedback through validated identity                 | None; refresh cannot restore work                                                  |
| Verified active ADMIN                         | Agreed cross-department access, own account and ordinary staff management | Current ADMIN authority; no in-app ADMIN lifecycle changes                         |
| Specifically authorized provisioning operator | Restricted procedure in separately authorized environment                 | No public or implicit staff-UI provisioning power                                  |

Employee assignment is absent before approval and singular when business authority is granted. Historical actors are not replaced by current profile names or fixtures. Staff decisions retain prior meaning through department/status changes. Credentials remain private rather than browser-persisted authority. Denied/cancelled/failed operations leave protected state unchanged. PLAN fixes technical enforcement, interfaces, safe field projections and query bounds before implementation.

### Frontend and State Requirements

| State / interaction            | Observable behavior                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Initial loading                | Progress until authoritative state is known; no flash of permitted workspace or fake empty staff.                             |
| Empty success                  | Accurate zero matches/counts without sample data.                                                                             |
| Read failure / retry           | Useful safe error/retry context; service failure is neither anonymous state nor empty success.                                |
| Write pending                  | Visible operation; conflicting submits/click/Enter duplicates prevented; no saved notice yet.                                 |
| Confirmed success              | Saved result and affected counts/status agree on reload and another session.                                                  |
| Validation / denial            | Useful Arabic feedback without internals; retain recoverable input and no false success.                                      |
| Stale conflict                 | Keep proposed input, explain changed state, refresh/review before another command.                                            |
| Unknown outcome                | Explain uncertainty and reload the same target before further intent.                                                         |
| Dirty form / background change | Preserve unsaved input and indicate newer saved state without silent reset.                                                   |
| Account / department change    | Re-evaluate access; late old-account results cannot enter current presentation; disallowed workspace cannot continue working. |
| Pre-submit cancel              | Close existing editor without account/history writes.                                                                         |

### Key Entities

- **Account**: Stable identity, unique normalized email, profile/contact, verified state and private credential/session relationships; verification is separate from staff approval.
- **Employee access**: Retained approval/rejection/suspension and one permitted department when approved; current authority does not rewrite history.
- **Administrator**: Explicitly authorized cross-department account outside ordinary employee assignment and in-app lifecycle changes.
- **Staff decision**: Retained target/actor/time, operation and prior/resulting values, inseparable from the effective change.
- **Session / purpose-bound link**: Existing identity/session or verification/recovery capability under existing expiry/revocation protections; cannot override current eligibility.

## Verification Requirements

- **VR-001**: Create/extend discovered automated tests for changed identity/staff rules and shared boundaries: verification versus approval; valid/absent departments; safe outputs; input limits/null/omission; privileged fields; allowed/denied transitions; restricted recovery; repeated/stale decisions; auth/session safeguards. PLAN selects concrete test owners/commands from the checkout.
- **VR-002**: Use real migrated PostgreSQL and actual Express requests for persistence/constraint/atomicity/authority claims. Cover fresh setup and representative populated upgrades, controlled competing ADMIN decisions, acting-admin suspension races, retries and rollback after dependent failure. Use isolated disposable data, never developer/production fallback.
- **VR-003**: Prove each department's allowed/wrong-department access, ADMIN access, restricted states, direct URLs/requests, current status/refresh and existing-session suspension/reassignment. Later-domain operations are outside execution claims; their future integration must consume P01 authority.
- **VR-004**: Use real form/component interactions for loading/empty/error/retry/pending/validation/conflict/uncertainty, cancel, dirty input, malformed authoritative responses, identity changes and late results. Mocked UI success cannot prove persistence.
- **VR-005**: Establish automated real-browser journey support during P01; none is configured at intake. Verify registration → verification → pending → ADMIN approval/department → correct workspace; direct wrong-workspace denial; suspension in existing sessions; reassignment/reconsideration; recovery/change password; logout/logout-all outcomes; reload and a second independent session. Main journey uses a real isolated backend rather than intercepted success. Preserve Arabic/RTL, keyboard/focus and narrow/wide staff/account layouts.
- **VR-006**: Keep verification/reset/refresh/CSRF/neutral-recovery/profile/security regressions and intentional schema/migration inventory assertions. Verify restricted initial-admin procedure with synthetic identities, denied public/staff escalation and nonselected-account preservation. Assess requirements and engineering conformity separately before backend acceptance and phase exit.

The entire required backend group must pass implementation/review/tests before dependent frontend integration. SPECIFY performs documentation checks only; it executes none of these future application checks and claims no backend/phase/release acceptance.

## Success Criteria

- **SC-001**: A synthetic employee completes registration/verification/review with no successful business access before verified approval and one department. Acceptance: real journey and stored account/decision outcomes.
- **SC-002**: All six employee departments deny direct wrong-department requests/navigation with unchanged protected state; assigned staff and ADMIN have specified access. Acceptance: automated authority matrix and browser evidence agree.
- **SC-003**: Suspension/reassignment govern subsequent operations in two existing sessions; refresh/new login cannot restore old authority. Acceptance: observed allowed/denied results and no losing business writes after the saved change.
- **SC-004**: Staff decisions retain actual actor/time and prior decisions. Repeated/competing commands leave one coherent result without duplicated decisions or partial state. Acceptance: real persistence/HTTP concurrency, retry and rollback cases.
- **SC-005**: Profile, eligible recovery, password change and session controls preserve defined behavior/privacy. Failures never show successful persistence or alter authority. Acceptance: preserved/extended regressions and account browser journey.
- **SC-006**: Representative old USER accounts gain no automatic approval/department; unverified/suspended restrictions and existing ADMIN restrictions survive. Acceptance: fresh/populated upgrade outcomes and access attempts.
- **SC-007**: Existing staff/status/account surfaces show real results across reload/sessions, retain recoverable input and preserve Arabic/RTL/keyboard use. Acceptance: component/browser evidence including empty/error/cancel cases.
- **SC-008**: The restricted admin procedure works for a selected synthetic identity with no public/in-app ADMIN escalation or unintended account changes. Acceptance: reviewed procedure plus isolated execution; production execution remains separately authorized.

## Assumptions and Decisions

- **Accepted baseline**: Root roadmap P01, BR-01/BR-03 and shared rules establish departments, verified approval, current authority, real actor/time and design preservation. This feature changes no other phase or root-roadmap review status.
- **Accepted refinements**: The three owner answers above settle ADMIN management, old USER treatment and rejected-account reconsideration. They are requirements, not pending recommendations.
- **Preserved recovery scope**: Real recovery requires active verified status. P01 retains that eligibility rather than adding restricted-account self-service; reset cannot bypass review/suspension. Broadening eligibility needs an explicit amendment.
- **Registration surface**: The real form collects no requested department. Retain it; final assignment comes from ADMIN, and the demo requested field adds no new registration requirement.
- **Notification scope**: Pending demo copy promises activation messaging without a real accepted capability. Truthful state feedback requires removing that unsupported promise; new notification delivery is not inferred.
- **Evidence boundary**: Current source proves the baseline only. PLAN must define operation design and TASKS must supply bounded briefs. Their absence at SPECIFY is expected, not evidence of implementation readiness.

## Phase Exit

P01 requires the complete backend group/review, followed by existing frontend integration, discovered automated tests, real-browser journey and preserved account/security regressions. Later evidence must record actual persistent results, command outcomes and infrastructure limits. Backend-only success, local fixtures, a checked quality checklist or this specification cannot close the phase.

The next eligible workflow step is PLAN because this command's material product questions are resolved. PLAN is not executed by this request. Root-roadmap owner review, actual production provisioning, OPS-01 release evidence, later phases and deployment remain outside this SPECIFY authorization.
