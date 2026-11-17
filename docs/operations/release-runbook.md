# Local operations and release gates

The application has persisted staff, customer, sales, approval, manufacturing,
quality, warehouse and administration workflows. Local verification is separate from
production release. Read the current [P08 evidence](../../specs/008-admin-reports-readiness/tasks.md)
for completed checks, failures and unperformed gates. No command in this document
supplies target authorization or missing OPS-01 values.

## Current capabilities

The existing Arabic/RTL screens use authenticated API reads and commands. Development
preview/OTP routes remain isolated and unavailable in a production build. An old
browser snapshot cannot establish operational facts or grant a role.

Administrative cancellation reviews exact eligible pieces and preserves original
identities, paid amounts, surplus and history; it performs no refund. Administrative
correction changes only the accepted order notes/contact/address fields with a reason.
It preserves lifecycle state, frozen specifications/prices and completed/cancelled work.
Reports use one filtered order cohort and a separately labelled current staff directory.
Department filtering also restricts that directory. Report output is a complete,
time-stamped operational snapshot with manual signoff blanks, not financial reporting.

## Local setup and compiled starts

Use [local setup](../../README.md#local-setup) for Node 24, pnpm 11 and the existing
PostgreSQL 18.4 Compose service. Preserve existing environment files. The root Compose
file contains PostgreSQL only; the root Caddyfile is a routing template, not a verified
production application stack.

After local configuration and authorized migration setup:

```sh
pnpm build
pnpm verify:build-output
pnpm start
```

`pnpm start` starts/waits for PostgreSQL, applies pending migrations, then runs the
compiled API and web. It is not a read-only health command. `pnpm preview` builds and
then starts. Source changes require another build/restart. Stop only the processes
started for this local session; PostgreSQL remains running after application shutdown.

The API package's `start` script runs its compiled `dist/server.js` with source maps.
The web package's `start` script uses its existing Next launcher. These local scripts
remain separate from the packaged target CLI below. Target packaging must
exclude developer `.env`/`.env.local` files and bind the reviewed public API URL at build.

## Configuration and health

Keep secrets in the admitted private runtime environment. Production requires four
independent, non-placeholder AUTH signing secrets, HTTPS `WEB_APP_URL`, exact allowed
CORS origin, credentialed same-origin API routing and the existing CSRF policy.
The selected target uses one direct Caddy hop and `TRUST_PROXY=1`; its API/database
ports are private. Another proxy topology needs its own design review.

The selected target mail provider is SMTP. Set the real host/account through approved
private configuration. Production rejects `SMTP_ALLOW_SELF_SIGNED_TLS=true` and TLSv1;
`SMTP_TLS_MIN_VERSION` must be TLSv1.2 or TLSv1.3. A non-implicit-TLS production SMTP
connection requires STARTTLS before sending. Existing console previews and captured
harness mail are local evidence, not inbox delivery. Inspect actual verification and
recovery inbox arrival and one-time use/reuse denial only under covered target/mail
acceptance authorization.

The current default prefix exposes:

| Read                       | Meaning                                                     |
| -------------------------- | ----------------------------------------------------------- |
| GET `/api/v1/health/live`  | Process response; database is not checked                   |
| GET `/api/v1/health/ready` | Current database probe; 200 when healthy, 503 when degraded |

The API connects to its database before listening. A later database outage can leave
liveness healthy while readiness fails. Neither endpoint checks inbox delivery,
backup quality, migration compatibility or complete business readiness. Keep request
IDs for diagnosis; do not copy raw cookies/tokens, mail links, credentials or private
payloads into ordinary evidence.

## Migration and administrator admission

Before an authorized migration, bind the exact environment, reviewed source/lockfile
and migration names/checksums. Inspect the existing ledger and preserve applied SQL.
The current status command is:

```sh
pnpm --filter @template/database exec prisma migrate status
```

This reads the configured database. Pending/failed/unrecognized history requires
inspection; do not reset/reseed, rewrite old checksums or automatically roll back.
Forward deployment requires a verified predeployment backup and distinct restore
checkpoint through the accepted operational procedure. Root `db:migrate:deploy`
exists, but its existence does not authorize a target write.

The compiled restricted initial-administrator entry is the API package's
`admin:provision` script. It requires `--user-id`, `--expected-email`,
`--expected-access-version` and `--operator-reference`. Without `--apply` it previews;
production apply additionally requires `--allow-production`. Only a verified pending,
unassigned eligible employee can be selected, and an existing administrator prevents
another successful bootstrap. It does not create credentials or reactivate a legacy
suspended account. See the [existing procedure](../../README.md#ordinary-staff-and-the-first-administrator).

After a failed/unknown apply result, observe actual administrator/account state before
any retry. Preserve the original operation reference. Neither a seed nor a browser
role selector is an administrator provisioning mechanism.

## Recovering administrative operations

For administrative cancellation/correction, use the current server detail and actual command result. For an uncertain save,
retain the original intent/UUID and use its recovery panel to observe the result.
Retry Same Intent observes first; only the bound not-found/current-intent branch can
send that original write. A confirmed save with failed refresh repairs reads only.
A stale review requires explicit current review while preserving intended dirty fields.
Closing an unsent dialog performs no write. Other workflows retain their own recovery panel/protocol; the administration observe-first request ordering does not describe every department replay.

These drafts/recovery sessions live in the current signed-in QueryClient. A full
reload does not reconstruct command payloads from browser storage. Inspect current
facts and retained history; missing activity alone does not prove a failed command.
Do not manufacture a new operation merely to hide an unknown outcome.

## Backup and restoration boundary

The current disposable restore test is an application-data logical backup exercise:

```sh
pnpm --filter @template/api test:integration src/operations-readiness.integration.test.ts
```

Build affected dependencies first. The test owns distinct PostgreSQL containers,
exports a custom-format logical archive, restores into an empty distinct target,
compares data/migration fingerprints and real application reads, restarts the retained
target and verifies persistence. It also checks refusal/corruption/failure cleanup.
This proves that isolated boundary; it is not a production backup, scheduled service,
cluster-role backup or point-in-time recovery guarantee.

## Packaged target operations

The repository now provides `deploy/Dockerfile`, `deploy/compose.production.yaml`,
`deploy/Caddyfile`, the two backup systemd units and
[`scripts/operations/release.mjs`](../../scripts/operations/release.mjs). This is a
staged operational CLI, not automatic release acceptance. The root `compose.yaml`
and root Caddyfile retain their separate local/template roles.

The target adapter requires Linux, root, Node24, systemd, rootful Linux Docker on
its canonical local Unix socket, and Compose2.30 or newer. The systemd service uses
`/usr/bin/node`; verify the target installation there. Use a clean exact reviewed
Git checkout at `/srv/oriental-shoes/<environment>/releases/<40-character revision>`.
The CLI validates source/lockfile/migration identity, pinned base images and actual
machine/engine/resource/storage ownership. It does not provision a host, DNS, SMTP
account, encryption or storage approval.

Keep `/srv/oriental-shoes/<environment>`, its state directory and private configuration
outside the source checkout. Supply actual admitted runtime values; none are configured
by the examples below. Private directories are root-owned0700; private regular files
are0600, with no symlinks or extra hard links. Caddy's owned files are readable by
its container. Existing deployment/backup resources must have their exact expected
labels, images, ports and writable named PostgreSQL volume. Only Caddy publishes
80/tcp and443/tcp+udp. The API, web and PostgreSQL publish no host ports.

### Configuration and private records

`/etc/oriental-shoes/<environment>/release.json` uses the strict version1 schema in
[`parseReleaseConfig`](../../scripts/operations/release-config.mjs). Unknown/missing
keys and duplicate JSON keys are rejected. Supply every field below:

| Fields                                                                                                                | Required meaning                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`, `environmentId`, `projectName`                                                                             | Version1; selected lowercase environment; project exactly `oriental-shoes-<environment>`                                                                     |
| `expectedMachineIdSha256`, `expectedDockerEngineId`                                                                   | Actual host machine-ID SHA-256 and actual Docker engine ID                                                                                                   |
| `appDomain`, `acceptanceCidrs`                                                                                        | Real HTTPS domain and the approved operator CIDRs                                                                                                            |
| `releaseRevision`                                                                                                     | Exact reviewed40-character lowercase Git revision                                                                                                            |
| `nodeImage`, `postgresImage`, `caddyImage`                                                                            | Reviewed digest-pinned `node:24-bookworm`, `postgres:18.4`, `caddy:2` references with matching architecture                                                  |
| `runtimeEnvFile`, `postgresEnvFile`                                                                                   | Distinct canonical private environment-file paths                                                                                                            |
| `databaseName`, `applicationRole`, `bootstrapRole`                                                                    | Valid database identifiers; distinct dedicated app/bootstrap roles                                                                                           |
| `operatorReference`, `acceptanceInbox`                                                                                | Actual operator reference and controlled acceptance inbox                                                                                                    |
| `initialAdministrator`                                                                                                | Exact `{userId,expectedEmail,expectedAccessVersion}`; UUID/version are both null before selecting a real person, then both bind actual identity observations |
| `backupDirectory`, `backupMountPoint`, `backupStorageIdentity`, `backupMountSource`, `backupStorageApprovalReference` | Approved backup directory beneath the actual admitted independently mounted storage and its nonsecret identity/approval references                           |
| `scheduledBackupAuthorizationReference`                                                                               | Standing authorization reference for daily backup execution                                                                                                  |

Environment files use literal `KEY=value` lines: dollar signs, quotes and backslashes
are data, not shell expansion. Do not source them into a shell. The CLI validates
production SMTP/auth/origin settings, `ORDER_BUSINESS_TIME_ZONE=Asia/Riyadh`,
`SHUTDOWN_TIMEOUT_MS=10000`, private `postgres:5432` database routing, separate
bootstrap/app passwords and the configured roles. It passes these files using Compose's
raw environment format with an allowlisted tool environment. Do not copy developer
`.env` files into the clean release or package. Real storage encryption/off-host
approval and inbox delivery require separate actual evidence.

Under `/var/lib/oriental-shoes/<environment>/`:

| Record                               | Owner and purpose                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operator-session.json`              | Operator-supplied strict `{version:1,accessToken:string}`, max64KiB, from the existing sign-in flow; no refresh cookie/password. Never place credentials in CLI arguments or evidence.          |
| `operator-evidence.json`             | Operator-supplied strict image/revision/machine/engine/migration-bound observations described below.                                                                                            |
| `releases/<revision>.json`           | CLI-produced package/image/source manifest.                                                                                                                                                     |
| `state.json`, `runs/<run UUID>.json` | CLI-produced lifecycle facts and fixed-classification operation receipts. `openingRunId` anchors the completed opening even after later backups/restarts.                                       |
| `authority-rebind.json`              | CLI-produced interrupted administrator-binding journal; it is an incident gate, not an operator-editable success marker.                                                                        |
| `run.lock`, `docker/`, `caddy/`      | Exclusive operation lease, private Docker tooling configuration and owned Caddy files. A stale lock or uncertain state requires owning incident inspection; the CLI has no force/unlock action. |

Evidence has exact top-level keys `version`, `scope`, `environmentId`, `projectName`,
`releaseRevision`, `machineIdSha256`, `dockerEngineId`, `applicationImageId`,
`migrationSetHash`, `observations`. Live scope is `live`. Every observation contains
exactly `{status,reference,observedAt,operatorReference}`. Status is `PASS`, `FAILED`
or `UNPERFORMED`; PASS needs an actual safe reference, canonical UTC timestamp no later
than now and the configured operator reference. Use null reference/time/operator for
an unperformed observation. Closed observation keys are:

- `backend`, `frontend`, `browser`, `localOperations`, `requirementsReview`, `engineeringReview`;
- `targetHttps`, `targetMail`, `targetAuthority`, `targetDatabaseRestart`, `targetRestore`, `targetBackup`, `operatorTraining`, `scheduledBackup`.

Use the exact strict schemas in
[`operations-records.mjs`](../../scripts/operations/operations-records.mjs) and the
[private protocol](../../specs/008-admin-reports-readiness/operations-readiness.md#o138--private-observation-state-and-recovery-protocols).
Never turn an unperformed observation into PASS because a file, provider ACK or local
fixture exists. Prepare needs the first six PASS observations; opening needs every
observation except `scheduledBackup`. Real first scheduled success remains a later
T048 acceptance requirement. Session/evidence files are not copied into backup bundles.

### Command sequence and outcomes

Run from the admitted clean release. In the templates below, `CONFIG_FILE`, `ENV_ID`,
`AUTH_REF`, `ADMIN_ID` and `BACKUP_ID` mean values already supplied for the selected
operation. They are not installed defaults. `AUTH_REF` is a nonsecret reference to
covered action authorization. Every applied action also rechecks runtime admission.

```sh
node scripts/operations/release.mjs inspect --config "$CONFIG_FILE"
node scripts/operations/release.mjs inspect --config "$CONFIG_FILE" --observe
```

Omitting `--apply`/`--observe` produces a static plan without subprocesses, network,
locks or writes. It still validates the private input file and action-specific flags.
`inspect --observe` reads actual ownership and recorded lifecycle state; it does not
clear uncertainty, certify migrations or establish release acceptance.

| Action                 | Additional flags and effect                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package`              | Apply builds/verifies the pinned image and package record; no service cutover.                                                                                                                                                                       |
| `prepare`              | Apply puts maintenance before schema work, stops writers, creates/verifies the predeploy checkpoint, admits SQL ledger, checks real app credentials and runs status/deploy/status before starting acceptance.                                        |
| `admin-preview`        | `--observe` makes real selected-account/protected identity observations and the existing restricted CLI preview, without lock or persistent writes.                                                                                                  |
| `admin-apply`          | Apply additionally needs `--confirm-user "$ADMIN_ID"`; follows the two-step fresh-credential procedure below.                                                                                                                                        |
| `restart`              | Apply requires healthy matching OPEN or verified ACCEPTANCE with complete ledger/current authority; restarts only captured services, including retained PG, and compares volume/data before restoring the prior mode.                                |
| `backup`               | Always needs `--kind daily` or `--kind predeploy`, including preview. Apply performs verified logical backup/distinct restore; daily safely resumes only the previously healthy running deployment. Predeploy leaves writers stopped in maintenance. |
| `recover-replacement`  | Always needs `--backup-id "$BACKUP_ID"`. Apply additionally needs `--confirm-restore "$ENV_ID:oriental-shoes-$ENV_ID:$DATABASE_NAME"`; new empty admitted target only, as below.                                                                     |
| `open-traffic`         | Apply requires all opening evidence, actual bound target TLS/health/current authority and checkpoint. It reloads normal routing and publishes current/receipt/OPEN with the durable uncertainty barrier.                                             |
| `install-backup-timer` | Apply requires healthy OPEN, standing authorization and a verified daily demonstration. Validates/installs the two exact systemd templates and enables the environment timer.                                                                        |

For example, the common apply flags are:

```sh
node scripts/operations/release.mjs package --config "$CONFIG_FILE" \
  --apply --confirm-environment "$ENV_ID" --authorization-reference "$AUTH_REF"
```

Add the relevant flags from the table when selecting another action. Exit0 means
that named operation or preview/observation succeeded; inspect the outcome, including
`AWAITING_OPERATOR`. It never means complete release acceptance. Exit2 is
`RELEASE_INPUT_INVALID`,3 `RELEASE_ADMISSION_MISSING`,4 `RELEASE_TARGET_MISMATCH`,
5 `RELEASE_CHECK_FAILED`,6 `RELEASE_STATE_UNCERTAIN`. Ordinary output contains fixed
classifications/references, not raw exception text or credentials. There is no
force, reset, volume-delete, arbitrary command, rollback or live-overwrite action.

Prepare refuses failed/diverged/in-progress/unrecognized ledger or a populated database
without its ledger. Expected Prisma status1 is admitted only after SQL proves a fresh
or pending accepted prefix and real application credentials work. Existing roles and
passwords are checked, never changed to fit configuration. A fresh namespace gets an
empty template0 app database and a verified empty checkpoint before migration.
Failed/unknown migration leaves maintenance/stopped writers. Restart and scheduled
backup cannot revive it; inspect and use the owning forward repair/replacement scope.

For read-only migration diagnosis, independently verify the actual captured PG ID,
role/database and owned mount before using existing PostgreSQL tooling, for example:

```sh
docker exec "$POSTGRES_ID" psql -X --username="$BOOTSTRAP_ROLE" \
  --dbname="$DATABASE_NAME" --command \
  'SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name;'
```

This does not apply migrations or repair missing history. Compare with the package's
ordered migration names/checksums; retain the actual response and fixed error references
privately. Do not rewrite applied SQL/checksums or reset/reseed to make status pass.

### First administrator and uncertain transitions

The person registers/verifies/signs in through the existing application. Bind their
actual UUID/email/accessVersion in private configuration and provide their fresh
access credential privately. Run `admin-preview --observe`, then the separately
confirmed `admin-apply`. The CLI observes the actual account/singleton before any
promotion and reconciles a lost promotion reply without repeating the write.

A committed promotion returns `AWAITING_OPERATOR`. The existing JWT may still be
identity-valid and `/users/me` may report current DB authority; this CLI additionally
requires a fresh credential whose verified role agrees with the observed current role.
Sign in again, replace only the private session file, then repeat confirmed
`admin-apply` for the same person. The CLI observes the original receipt/current
version and atomically rebinds configuration and recorded authority. It does not guess
version2 or create a second promotion. Existing active administrators use the same
confirmed observation/binding path without a new provisioning receipt.

If `authority-rebind.json` remains, use fresh inspection and only the same confirmed
binding reconciliation after checking actual account/session/config facts. Do not
remove or edit the journal to bypass it. Pending opening is different: UNCERTAIN
open-traffic blocks prepare, opening, restart, every backup kind and timer success,
even if a pointer/receipt looks successful. There is no inferred opening retry or
CLI force repair. Preserve the owned state/pointer/receipt and use separately authorized
owning incident repair. A completed OPEN requires matching state/current/receipt and
fresh routing/authority; a prior snapshot alone cannot establish that fact.

### Backup, scheduler and replacement recovery

The implemented policy uses a daily02:00 `Asia/Riyadh` logical backup,14 verified daily
business dates, and separately protected predeploy checkpoints. Retention preserves
unverified/unindexed material and protected checkpoints; an older checkpoint becomes
eligible only after a matching durable later-opening receipt. It publishes the retained
index before deleting eligible owned bundles. A failed backup still fails even if safe
availability recovery succeeds.

`<backupDirectory>/<environment>.index.json` indexes verified bundles under their UUID
directories. Each contains a custom-format dump, private runtime/postgres/release/Caddy/
package copies, exact byte hashes, stopped-source/restored/restarted fingerprints and
measured durations. Keep that material private on the admitted mount. It is a logical
application/database backup; it is not cluster-role backup or point-in-time recovery.

The installed timer is `oriental-shoes-backup@<environment>.timer`, with its same-named
service. Its fixed service invocation uses `backup --kind daily --apply
--confirm-environment <environment> --scheduled` and the configured standing reference;
no interactive JWT is needed for the nightly backup. Observe `systemctl list-timers`,
service result and a new VERIFIED business-date bundle after the actual first run.
A timer being active or a default service status is not first-run success. Inspect
failed/missed dates daily. Installation and first scheduled execution on the real host
remain T048 work; local Linux unit verification does not establish either.

Replacement recovery requires a new admitted host/engine, empty namespace and empty
new app database. It refuses existing project containers, networks or volumes and
never restores over the source/live database. Rebind new host/daemon/storage/operator/
private config values; the original private copies are evidence, not files to install.
Transfer the unchanged original source index and selected bundle to:

```text
<backupDirectory>/recovery-source/<environment>.index.json
<backupDirectory>/recovery-source/<backup UUID>/
```

The import parent is private0700 on the admitted mount. Recovery validates original
index membership, exact manifest/archive/private-copy hashes, source revision/lock/
migrations, database/app-role identity and pinned bases/architecture. It builds the
reviewed source on the replacement without requiring the old local application image.
If no image-bound local evidence exists, it returns PACKAGED/AWAITING_OPERATOR before
creating services/state. Record actual evidence against that package and repeat the
confirmed action; it reuses only the replacement's admitted package.

The applied restore uses only the new owned empty PG, compares complete source facts,
creates the replacement's own verified checkpoint and runs forward prepare into
acceptance. It leaves original source/index/bundle intact and returns
AWAITING_OPERATOR for current administrator/target acceptance. Obtain separate explicit
DNS-change authorization, change DNS through the operator's existing controls, then
observe actual replacement public certificate/routing, inbox delivery, current authority,
retained restart and operator demonstration. No provider/DNS API or automatic opening
is added. Only a later authorized `open-traffic` opens routing.

Local validation uses owned disposable Docker projects, loopback ephemeral ports and
this run's explicitly trusted Caddy internal CA. Live CLI/config cannot select that
exception. It proves mechanics; it does not establish public ACME/DNS, real off-host
storage, real inbox delivery, distinct replacement hardware or trained operator acceptance.

## Target evidence still required

Keep nonsecret evidence references in the accepted owner; keep actual private values
outside the repository. Unobserved fields remain `UNPERFORMED`.

| Evidence field                                                                      | Current target state |
| ----------------------------------------------------------------------------------- | -------------------- |
| releaseRevision, environmentReference, operatorReference, authorizedActionReference | UNPERFORMED          |
| migrationSetHash, backupReference, backupCompletedAt                                | UNPERFORMED          |
| restoreTargetReference, restoreStartedAt, restoreCompletedAt, fingerprintComparison | UNPERFORMED          |
| startupReadinessOutcome, observedRestartOutcome, mailReceiptOutcome                 | UNPERFORMED          |
| HTTPS/origin/cookie/CSRF, current administrator/denied access, redacted logs        | UNPERFORMED          |
| scheduling/retention/storage, operator demonstration, explicit traffic opening      | UNPERFORMED          |

T048 depends on accepted T049–T053 construction, actual OPS-01 runtime inputs and
covered action/environment authorization. Local browser, workbook, restore, lint or
build success cannot close that target gate. Preserve all remaining roadmap/client
input gates; this runbook does not approve catalog activation, numbering changes,
production data writes, external messages or deployment.
