import { createHash, randomUUID, randomBytes } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import {
  open,
  mkdir,
  lstat,
  realpath,
  rename,
  unlink,
  rmdir,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { Writable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  ReleaseFailure,
  parsePrivateJson,
  assertResourceOwnership,
  renderCaddyMode,
} from "./release-config.mjs";
import {
  checkedCommand,
  runMetadataCommand,
  openDockerStream,
  observeDeployment,
  assertCleanupTarget,
  admitPrivateDirectory,
  readPrivateFile,
  writeAtomicPrivate,
  sha256,
  inspectImage,
} from "./operation-runtime.mjs";
import {
  parseDatabaseFingerprint,
  parseBackupManifest,
  parseBackupIndex,
  assertBackupEntryBinding,
  parseOperationReceipt,
  assertCheckpointReleaseReceipt,
  recordIdentity,
} from "./operations-records.mjs";

/** @typedef {import('./operation-runtime.mjs').OperationContext} OperationContext */
/** @typedef {import('./operations-records.mjs').PackageRecord} PackageRecord */
/** @typedef {import('./operations-records.mjs').DatabaseFingerprint} DatabaseFingerprint */
/** @typedef {import('./operations-records.mjs').BackupManifest} BackupManifest */
/** @typedef {import('./operations-records.mjs').BackupIndex} BackupIndex */
/** @typedef {OperationContext & Readonly<{packageRecord:PackageRecord,authorizationReference:string,sourceServices:import('./operations-records.mjs').ServiceSnapshot,sourceCaddyMode:'normal'|'maintenance'|'acceptance'}>} BackupContext */
/** @typedef {Readonly<{directory:string,manifest:BackupManifest}>} BackupBundle */

const sessionOptions =
  "-c TimeZone=UTC -c DateStyle=ISO,YMD -c extra_float_digits=3 -c statement_timeout=120000";
const privateNames = /** @type {const} */ ([
  "runtime.env",
  "postgres.env",
  "release.json",
  "mode.caddy",
  "package.json",
]);
/** @param {string} stage @returns {never} */
function failed(stage) {
  throw new ReleaseFailure("RELEASE_CHECK_FAILED", stage);
}
/** @param {OperationContext} context */
function uid(context) {
  const selected = context.scope === "live" ? 0 : process.getuid?.();
  if (selected === undefined)
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "backup-posix-owner");
  return selected;
}
/** @param {OperationContext} context @param {string} handle */
async function registeredContainer(context, handle) {
  const captured = context.registry.get(handle);
  if (!captured)
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "unregistered-database",
    );
  const observed = await checkedCommand(context, {
    executable: "docker",
    argv: [
      "inspect",
      "--format",
      "{{json .Config.Labels}}\n{{.Image}}\n{{.State.Running}}",
      captured.id,
    ],
    stage: "database-container-owner",
  });
  const lines = observed.trim().split("\n");
  const labels = parsePrivateJson(lines[0] ?? "null");
  if (
    typeof labels !== "object" ||
    labels === null ||
    Array.isArray(labels) ||
    !Object.values(labels).every((entry) => typeof entry === "string") ||
    lines[1] !== captured.imageId ||
    lines[2] !== "true"
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "database-container-owner",
    );
  assertResourceOwnership(
    { id: captured.id, labels: /** @type {Record<string,string>} */ (labels) },
    {
      environmentId: context.config.environmentId,
      projectName: context.projectName,
      scope: captured.scope,
      role: captured.role,
      runId: captured.runId,
    },
  );
  return captured;
}
/** @param {OperationContext} context @param {string} handle @param {string} sql */
async function query(context, handle, sql) {
  const captured = await registeredContainer(context, handle);
  return checkedCommand(context, {
    executable: "docker",
    argv: [
      "exec",
      "-i",
      "--env",
      `PGOPTIONS=${sessionOptions}`,
      captured.id,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      `--username=${context.config.bootstrapRole}`,
      `--dbname=${context.config.databaseName}`,
      "--command",
      sql,
    ],
    stage: "database-observation",
  });
}
/** @param {unknown} input @returns {Record<string,unknown>} */
function sqlObject(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    failed("database-response");
  return /** @type {Record<string,unknown>} */ (input);
}
/** @param {unknown} input */
function tableName(input) {
  if (
    typeof input !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(input)
  )
    failed("database-identifier");
  return input;
}
/** @param {BackupContext} context @param {string} handle */
async function tableMetadata(context, handle) {
  const role = context.config.applicationRole;
  const sql = `SELECT json_build_object('serverVersion',current_setting('server_version_num'),'encoding',getdatabaseencoding(),'tables',(SELECT coalesce(json_agg(tablename ORDER BY tablename COLLATE "C"),'[]'::json) FROM pg_catalog.pg_tables WHERE schemaname='public'),'login',(SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='${role}'),'ownership',json_build_object('databaseOwner',(SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database()),'applicationRole','${role}','superuser',(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname='${role}'),'createDatabase',(SELECT rolcreatedb FROM pg_catalog.pg_roles WHERE rolname='${role}'),'createRole',(SELECT rolcreaterole FROM pg_catalog.pg_roles WHERE rolname='${role}'),'replication',(SELECT rolreplication FROM pg_catalog.pg_roles WHERE rolname='${role}'),'tableOwners',(SELECT coalesce(json_agg(json_build_object('table',tablename,'owner',tableowner) ORDER BY tablename COLLATE "C"),'[]'::json) FROM pg_catalog.pg_tables WHERE schemaname='public')))::text`;
  const metadata = sqlObject(
    parsePrivateJson((await query(context, handle, sql)).trim()),
  );
  if (
    metadata["serverVersion"] !== "180004" ||
    metadata["encoding"] !== "UTF8" ||
    metadata["login"] !== true ||
    !Array.isArray(metadata["tables"])
  )
    failed("database-settings");
  return {
    tables: metadata["tables"].map(tableName),
    ownership: metadata["ownership"],
  };
}
/** @param {BackupContext} context @param {string} handle */
async function migrationFacts(context, handle) {
  const sql = `SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum,'finishedAt',to_char(finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'invalid',(finished_at IS NULL OR rolled_back_at IS NOT NULL)) ORDER BY migration_name COLLATE "C"),'[]'::json)::text FROM public."_prisma_migrations"`;
  const parsed = parsePrivateJson((await query(context, handle, sql)).trim());
  if (
    !Array.isArray(parsed) ||
    parsed.length > context.packageRecord.migrations.length
  )
    failed("migration-ledger");
  return parsed.map((entry, index) => {
    const fact = sqlObject(entry),
      expected = context.packageRecord.migrations[index];
    if (
      !expected ||
      fact["name"] !== expected.name ||
      fact["checksum"] !== expected.sha256 ||
      fact["invalid"] !== false ||
      typeof fact["finishedAt"] !== "string"
    )
      failed("migration-ledger");
    return {
      name: expected.name,
      checksum: expected.sha256,
      finishedAt: fact["finishedAt"],
    };
  });
}
/** @param {BackupContext} context @param {string} handle @param {string} table */
async function tableFingerprint(context, handle, table) {
  const captured = await registeredContainer(context, handle);
  const sql = `COPY (SELECT to_jsonb(t)::text FROM public."${tableName(table)}" AS t ORDER BY to_jsonb(t)::text COLLATE "C") TO STDOUT`;
  const stream = openDockerStream(context, {
    argv: [
      "exec",
      "-i",
      "--env",
      `PGOPTIONS=${sessionOptions}`,
      captured.id,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      `--username=${context.config.bootstrapRole}`,
      `--dbname=${context.config.databaseName}`,
      "--command",
      sql,
    ],
    stage: "database-copy-fingerprint",
  });
  const hash = createHash("sha256");
  let rows = 0n;
  const sink = new Writable({
    /** @param {Buffer} chunk @param {BufferEncoding} _encoding @param {(failure?:Error|null)=>void} callback */ write(
      chunk,
      _encoding,
      callback,
    ) {
      hash.update(chunk);
      let position = chunk.indexOf(10);
      while (position !== -1) {
        rows++;
        position = chunk.indexOf(10, position + 1);
      }
      callback();
    },
  });
  stream.stdin.end();
  try {
    await Promise.all([pipeline(stream.stdout, sink), stream.completion]);
  } finally {
    stream.cancel();
  }
  return Object.freeze({
    table,
    rowCount: rows.toString(),
    sha256: hash.digest("hex"),
  });
}
/** @param {BackupContext} context @param {string} registeredHandle @returns {Promise<DatabaseFingerprint>} */
export async function readDatabaseFingerprint(context, registeredHandle) {
  const metadata = await tableMetadata(context, registeredHandle);
  const ledgerPresent = metadata.tables.includes("_prisma_migrations");
  if (!ledgerPresent && metadata.tables.length !== 0)
    failed("missing-populated-ledger");
  const facts = ledgerPresent
    ? await migrationFacts(context, registeredHandle)
    : [];
  const expected = ledgerPresent
    ? context.packageRecord.tableInventoryByPrefix[facts.length]?.tables
    : [];
  if (!expected || JSON.stringify(metadata.tables) !== JSON.stringify(expected))
    failed("database-table-inventory");
  const tables = [];
  for (const table of metadata.tables)
    tables.push(await tableFingerprint(context, registeredHandle, table));
  try {
    return parseDatabaseFingerprint({
      classification: ledgerPresent ? "MIGRATED" : "FRESH_EMPTY",
      ledgerAbsent: !ledgerPresent,
      tables,
      migrationFacts: facts,
      ownership: metadata.ownership,
    });
  } catch {
    failed("database-fingerprint");
  }
}
/** @param {DatabaseFingerprint} actual @param {DatabaseFingerprint} expected */
function sameFingerprint(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    failed("restored-fingerprint-mismatch");
}
/** @param {string} filename */
async function privateStream(filename) {
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  return handle.createReadStream({ autoClose: true });
}
/** @param {OperationContext} context @param {string} filename */
async function fileHash(context, filename) {
  const hasher = createHash("sha256");
  let bytes = 0n;
  const input = await privateStream(filename);
  const sink = new Writable({
    /** @param {Buffer} chunk @param {BufferEncoding} _encoding @param {(failure?:Error|null)=>void} callback */ write(
      chunk,
      _encoding,
      callback,
    ) {
      hasher.update(chunk);
      bytes += BigInt(chunk.length);
      callback();
    },
  });
  await pipeline(input, sink, {
    signal: AbortSignal.timeout(Math.max(1, context.deadline - Date.now())),
  });
  return { bytes: bytes.toString(), sha256: hasher.digest("hex") };
}
/** @param {BackupContext} context @param {string} directory */
async function dumpArchive(context, directory) {
  const source = await registeredContainer(context, "postgres");
  const stream = openDockerStream(context, {
    argv: [
      "exec",
      "-i",
      source.id,
      "pg_dump",
      "--format=custom",
      "--no-owner",
      "--no-acl",
      `--username=${context.config.bootstrapRole}`,
      `--dbname=${context.config.databaseName}`,
    ],
    stage: "database-dump",
  });
  const archive = path.join(directory, "database.dump.partial"),
    hasher = createHash("sha256");
  let bytes = 0n;
  const hashing = new Transform({
    /** @param {Buffer} chunk @param {BufferEncoding} _encoding @param {(failure:Error|null,chunk?:Buffer)=>void} callback */ transform(
      chunk,
      _encoding,
      callback,
    ) {
      hasher.update(chunk);
      bytes += BigInt(chunk.length);
      callback(null, chunk);
    },
  });
  stream.stdin.end();
  try {
    await Promise.all([
      pipeline(
        stream.stdout,
        hashing,
        createWriteStream(archive, { flags: "wx", mode: 0o600 }),
      ),
      stream.completion,
    ]);
  } finally {
    stream.cancel();
  }
  const handle = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { bytes: bytes.toString(), sha256: hasher.digest("hex") };
}
/** @param {BackupContext} context @param {string} directory */
async function privateCopies(context, directory) {
  const contents = [
    await readPrivateFile(context.config.runtimeEnvFile, {
      uid: uid(context),
      maximumBytes: 1048576,
    }),
    await readPrivateFile(context.config.postgresEnvFile, {
      uid: uid(context),
      maximumBytes: 1048576,
    }),
    await readPrivateFile(context.paths.config, {
      uid: uid(context),
      maximumBytes: 1048576,
    }),
    renderCaddyMode(context.config, context.sourceCaddyMode),
    JSON.stringify(context.packageRecord),
  ];
  const copies = [];
  for (const [index, name] of privateNames.entries()) {
    const content = contents[index];
    if (content === undefined) failed("backup-private-copy");
    await writeAtomicPrivate({
      filename: path.join(directory, name),
      contents: content,
      uid: uid(context),
    });
    copies.push({
      name,
      bytes: String(Buffer.byteLength(content)),
      sha256: sha256(content),
    });
  }
  return copies;
}
/** @param {OperationContext} context @param {BackupBundle} bundle */
export async function verifyBackupFiles(context, bundle) {
  const metadata = await lstat(bundle.directory);
  if (
    !metadata.isDirectory() ||
    metadata.uid !== uid(context) ||
    (metadata.mode & 0o777) !== 0o700 ||
    (await realpath(bundle.directory)) !== bundle.directory ||
    path.dirname(bundle.directory) !== context.config.backupDirectory ||
    path.basename(bundle.directory) !== bundle.manifest.id
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "backup-bundle-path");
  const archive = bundle.manifest.archive;
  if (archive === null) failed("backup-archive-missing");
  const filename = path.join(
    bundle.directory,
    bundle.manifest.verified ? "database.dump" : "database.dump.partial",
  );
  const dump = await lstat(filename);
  if (
    !dump.isFile() ||
    dump.uid !== uid(context) ||
    dump.nlink !== 1 ||
    (dump.mode & 0o777) !== 0o600 ||
    JSON.stringify(await fileHash(context, filename)) !==
      JSON.stringify(archive)
  )
    failed("backup-archive-hash");
  for (const copy of bundle.manifest.privateFiles) {
    const filename = path.join(bundle.directory, copy.name);
    const actual = await readPrivateFile(filename, {
      uid: uid(context),
      maximumBytes: 1048576,
    });
    if (
      String(Buffer.byteLength(actual)) !== copy.bytes ||
      sha256(actual) !== copy.sha256
    )
      failed("backup-private-copy-hash");
  }
  return filename;
}
/** @param {BackupContext} context */
async function storageAdmission(context) {
  await observeDeployment(context);
  await admitPrivateDirectory(context.config.backupDirectory, uid(context));
  if (
    (await realpath(context.config.backupDirectory)) !==
      context.config.backupDirectory ||
    (await realpath(context.config.backupMountPoint)) !==
      context.config.backupMountPoint
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "backup-storage-path");
  // Live observeDeployment verifies actual findmnt/device independence and approval identity.
  // Isolated evidence exercises archive mechanics on the run-owned temporary filesystem.
}
/** @param {BackupContext} context @param {string} id @param {string} handle */
async function restoreOwnedDatabase(context, id, handle) {
  const captured = await registeredContainer(context, handle);
  if (
    captured.id !== id ||
    id === context.registry.get("postgres")?.id ||
    captured.scope !== "isolated" ||
    captured.role !== "backup-restore"
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "restore-target");
  const topology = parsePrivateJson(
    await checkedCommand(context, {
      executable: "docker",
      argv: [
        "inspect",
        "--format",
        '{"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}}}',
        id,
      ],
      stage: "restore-isolation",
    }),
  );
  const inspected = sqlObject(topology);
  if (
    inspected["network"] !== "none" ||
    (inspected["ports"] !== null &&
      Object.keys(sqlObject(inspected["ports"])).length !== 0) ||
    !Array.isArray(inspected["mounts"]) ||
    inspected["mounts"].length !== 1
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "restore-isolation");
  for (const mount of inspected["mounts"]) {
    const entry = sqlObject(mount);
    if (
      entry["Type"] !== "volume" ||
      entry["Destination"] !== "/var/lib/postgresql" ||
      typeof entry["Name"] !== "string" ||
      !/^[0-9a-f]{64}$/u.test(entry["Name"])
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "restore-storage");
  }
}
/** @param {BackupContext} context @param {string} id @param {string} name @param {string} credentials */
async function removeRestoreContainer(context, id, name, credentials) {
  try {
    const deadline = Date.now() + 30000;
    await assertCleanupTarget(context, deadline);
    const inspected = await runMetadataCommand(
      {
        executable: "docker",
        argv: [
          "inspect",
          "--format",
          "{{json .Config.Labels}}\n{{.Image}}",
          id,
        ],
        stage: "restore-cleanup-owner",
      },
      { environment: context.toolEnvironment, deadline },
    );
    const lines = inspected.stdout.trim().split("\n"),
      labels = parsePrivateJson(lines[0] ?? "null");
    if (
      inspected.exitCode !== 0 ||
      typeof labels !== "object" ||
      labels === null ||
      Array.isArray(labels) ||
      !Object.values(labels).every((entry) => typeof entry === "string") ||
      lines[1] !== context.packageRecord.bases[1]?.id
    )
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "restore-cleanup-owner",
      );
    assertResourceOwnership(
      { id, labels: /** @type {Record<string,string>} */ (labels) },
      {
        environmentId: context.config.environmentId,
        projectName: context.projectName,
        scope: "isolated",
        role: "backup-restore",
        runId: context.runId,
      },
    );
    const removed = await runMetadataCommand(
      {
        executable: "docker",
        argv: ["rm", "-f", "-v", id],
        stage: "restore-cleanup",
      },
      { environment: context.toolEnvironment, deadline },
    );
    if (removed.exitCode !== 0)
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "restore-cleanup");
    context.registry.delete(name);
    await unlink(credentials);
  } catch {
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "restore-cleanup");
  }
}
/** @param {BackupContext} context @param {string} id */
async function waitReady(context, id) {
  const deadline = Math.min(context.deadline, Date.now() + 120000);
  while (Date.now() < deadline) {
    const process = await context.command({
      executable: "docker",
      argv: ["exec", id, "cat", "/proc/1/comm"],
      stage: "restore-final-server",
    });
    if (process.exitCode !== 0 || process.stdout.trim() !== "postgres") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const ready = await context.command({
      executable: "docker",
      argv: [
        "exec",
        id,
        "pg_isready",
        `--username=${context.config.bootstrapRole}`,
        "--dbname=postgres",
      ],
      stage: "restore-readiness",
    });
    if (ready.exitCode === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  failed("restore-readiness");
}
/** @param {BackupContext} context @param {BackupBundle} bundle */
export async function verifyBackupInDisposableDatabase(context, bundle) {
  const archive = await verifyBackupFiles(context, bundle),
    started = Date.now();
  parseBackupManifest(bundle.manifest);
  const postgres = await inspectImage(context, context.config.postgresImage);
  if (
    postgres.id !== context.packageRecord.bases[1]?.id ||
    context.config.postgresImage !== context.packageRecord.bases[1]?.reference
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "restore-pinned-image");
  const nonce = randomUUID(),
    name = `p08-restore-${context.runId}-${nonce}`,
    handle = `restore-${nonce}`;
  const credentials = `${context.paths.state}/restore-${nonce}.env`;
  await writeAtomicPrivate({
    filename: credentials,
    contents: `POSTGRES_USER=${context.config.bootstrapRole}\nPOSTGRES_PASSWORD=${randomBytes(32).toString("base64url")}\nPOSTGRES_DB=postgres\n`,
    uid: uid(context),
  });
  let id = null;
  try {
    id = (
      await checkedCommand(context, {
        executable: "docker",
        argv: [
          "create",
          "--name",
          name,
          "--network",
          "none",
          "--env-file",
          credentials,
          "--label",
          `io.oriental-shoes.environment=${context.config.environmentId}`,
          "--label",
          `com.docker.compose.project=${context.projectName}`,
          "--label",
          "io.oriental-shoes.scope=isolated",
          "--label",
          "io.oriental-shoes.role=backup-restore",
          "--label",
          `io.oriental-shoes.run=${context.runId}`,
          context.config.postgresImage,
        ],
        stage: "restore-create",
      })
    ).trim();
    if (!/^[0-9a-f]{64}$/u.test(id))
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "restore-container-id",
      );
    await checkedCommand(context, {
      executable: "docker",
      argv: ["start", id],
      stage: "restore-start",
    });
    await waitReady(context, id);
    context.registry.set(handle, {
      id,
      role: "backup-restore",
      scope: "isolated",
      runId: context.runId,
      imageId: context.packageRecord.bases[1]?.id ?? "",
      running: true,
    });
    await restoreOwnedDatabase(context, id, handle);
    const password = randomBytes(32).toString("base64url");
    const sql = `SET standard_conforming_strings=on;\nCREATE ROLE "${context.config.applicationRole}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';\nCREATE DATABASE "${context.config.databaseName}" OWNER "${context.config.applicationRole}" TEMPLATE template0;\n`;
    await checkedCommand(context, {
      executable: "docker",
      argv: [
        "exec",
        "-i",
        id,
        "psql",
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        `--username=${context.config.bootstrapRole}`,
        "--dbname=postgres",
      ],
      input: sql,
      stage: "restore-empty-initialize",
    });
    const empty = await tableMetadata(context, handle);
    if (empty.tables.length !== 0)
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "restore-nonempty");
    const archiveHandle = await open(
      archive,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const archiveInput = archiveHandle.createReadStream({ autoClose: false });
    try {
      const restoring = openDockerStream(context, {
        argv: [
          "exec",
          "-i",
          id,
          "pg_restore",
          "--exit-on-error",
          "--single-transaction",
          "--no-owner",
          "--no-acl",
          `--role=${context.config.applicationRole}`,
          `--username=${context.config.bootstrapRole}`,
          `--dbname=${context.config.databaseName}`,
        ],
        stage: "archive-restore",
      });
      try {
        await Promise.all([
          pipeline(archiveInput, restoring.stdin),
          restoring.completion,
        ]);
      } finally {
        restoring.cancel();
      }
    } finally {
      archiveInput.destroy();
      await archiveHandle.close();
    }
    const restored = await readDatabaseFingerprint(context, handle);
    sameFingerprint(restored, bundle.manifest.before);
    const restoreMs = Date.now() - started;
    const restartStarted = Date.now();
    await checkedCommand(context, {
      executable: "docker",
      argv: ["restart", "--time", "15", id],
      stage: "restore-restart",
    });
    await waitReady(context, id);
    const restarted = await readDatabaseFingerprint(context, handle);
    sameFingerprint(restarted, bundle.manifest.before);
    return Object.freeze({
      restored,
      restarted,
      restoreMs,
      restartMs: Date.now() - restartStarted,
    });
  } finally {
    if (id !== null)
      await removeRestoreContainer(context, id, handle, credentials);
    else {
      const observed = await runMetadataCommand(
        {
          executable: "docker",
          argv: [
            "container",
            "ls",
            "--all",
            "--no-trunc",
            "--filter",
            `name=^/${name}$`,
            "--format",
            "{{.ID}}",
          ],
          stage: "restore-create-reconcile",
        },
        { environment: context.toolEnvironment, deadline: Date.now() + 30000 },
      );
      if (observed.exitCode !== 0)
        throw new ReleaseFailure(
          "RELEASE_STATE_UNCERTAIN",
          "restore-create-reconcile",
        );
      const reconciled = observed.stdout.trim();
      if (reconciled !== "") {
        if (!/^[0-9a-f]{64}$/u.test(reconciled))
          throw new ReleaseFailure(
            "RELEASE_STATE_UNCERTAIN",
            "restore-create-reconcile",
          );
        await removeRestoreContainer(context, reconciled, handle, credentials);
      } else await unlink(credentials);
    }
  }
}
/** @param {BackupContext} context @param {'daily'|'predeploy'} kind @returns {Promise<BackupBundle>} */
export async function createVerifiedBackup(context, kind) {
  await context.files.assertLock();
  await storageAdmission(context);
  for (const role of ["api", "web"])
    if (context.registry.get(role)?.running)
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "backup-writers-running",
      );
  const indexFile = path.join(
    context.config.backupDirectory,
    `${context.config.environmentId}.index.json`,
  );
  let index;
  /** @type {string|null} */ let initialIndex = null;
  try {
    initialIndex = await readPrivateFile(indexFile, {
      uid: uid(context),
      maximumBytes: 1048576,
    });
    index = parseBackupIndex(
      parsePrivateJson(initialIndex),
      recordIdentity(context),
    );
  } catch (failure) {
    if (
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    )
      index = {
        version: /** @type {const} */ (1),
        ...recordIdentity(context),
        storageIdentity: context.config.backupStorageIdentity,
        entries: [],
      };
    else throw failure;
  }
  if (index.storageIdentity !== context.config.backupStorageIdentity)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "backup-index-storage");
  const id = randomUUID(),
    directory = path.join(context.config.backupDirectory, id);
  await mkdir(directory, { mode: 0o700 });
  const before = await readDatabaseFingerprint(context, "postgres"),
    started = Date.now();
  const businessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(context.clock()));

  let manifest = parseBackupManifest({
    version: 1,
    ...recordIdentity(context),
    id,
    kind,
    businessDate,
    runId: context.runId,
    operatorReference: context.config.operatorReference,
    authorizationReference: context.authorizationReference,
    storageIdentity: context.config.backupStorageIdentity,
    machineIdSha256: context.config.expectedMachineIdSha256,
    dockerEngineId: context.config.expectedDockerEngineId,
    packageRecord: context.packageRecord,
    sourceServices: context.sourceServices,
    sourceCaddyMode: context.sourceCaddyMode,
    classification: before.classification,
    archive: null,
    privateFiles: [],
    before,
    restored: null,
    restarted: null,
    verified: false,
    completedAt: null,
    durations: {
      dumpMs: null,
      restoreMs: null,
      restartMs: null,
      totalMs: null,
    },
  });
  await writeAtomicPrivate({
    filename: path.join(directory, "manifest.json"),
    contents: JSON.stringify(manifest),
    uid: uid(context),
  });
  const archive = await dumpArchive(context, directory),
    dumpMs = Date.now() - started;
  sameFingerprint(await readDatabaseFingerprint(context, "postgres"), before);
  const privateFiles = await privateCopies(context, directory);
  manifest = parseBackupManifest({
    ...manifest,
    archive,
    privateFiles,
    durations: { ...manifest.durations, dumpMs },
  });
  await writeAtomicPrivate({
    filename: path.join(directory, "manifest.json"),
    contents: JSON.stringify(manifest),
    uid: uid(context),
  });
  const verified = await verifyBackupInDisposableDatabase(context, {
    directory,
    manifest,
  });
  await storageAdmission(context);
  await verifyBackupFiles(context, { directory, manifest });
  sameFingerprint(await readDatabaseFingerprint(context, "postgres"), before);
  await context.files.assertLock();
  let currentIndex = null;
  try {
    currentIndex = await readPrivateFile(indexFile, {
      uid: uid(context),
      maximumBytes: 1048576,
    });
  } catch (failure) {
    if (!(
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    ))
      throw failure;
  }
  if (currentIndex !== initialIndex)
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "backup-index-changed");
  await rename(
    path.join(directory, "database.dump.partial"),
    path.join(directory, "database.dump"),
  );
  manifest = parseBackupManifest({
    ...manifest,
    restored: verified.restored,
    restarted: verified.restarted,
    verified: true,
    completedAt: new Date(context.clock()).toISOString(),
    durations: {
      dumpMs,
      restoreMs: verified.restoreMs,
      restartMs: verified.restartMs,
      totalMs: Date.now() - started,
    },
  });
  await writeAtomicPrivate({
    filename: path.join(directory, "manifest.json"),
    contents: JSON.stringify(manifest),
    uid: uid(context),
  });
  const entry = {
    id,
    ...recordIdentity(context),
    revision: context.packageRecord.revision,
    kind,
    businessDate,
    manifestSha256: sha256(JSON.stringify(manifest)),
    completedAt: manifest.completedAt,
    verified: true,
    protectedForRevision:
      kind === "predeploy" ? context.packageRecord.revision : null,
    openedByRevision: null,
    openReceiptReference: null,
  };
  const updated = parseBackupIndex(
    { ...index, entries: [...index.entries, entry] },
    recordIdentity(context),
  );
  await writeAtomicPrivate({
    filename: indexFile,
    contents: JSON.stringify(updated),
    uid: uid(context),
  });
  return Object.freeze({ directory, manifest });
}
/** @param {BackupContext} context @param {BackupIndex} index */
export async function pruneVerifiedDailyBackups(context, index) {
  await context.files.assertLock();
  await storageAdmission(context);
  const validatedIndex = parseBackupIndex(index, recordIdentity(context));
  if (validatedIndex.storageIdentity !== context.config.backupStorageIdentity)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "backup-index-storage");
  for (const entry of validatedIndex.entries) {
    if (entry.openReceiptReference !== null) {
      const runId = entry.openReceiptReference.slice(4);
      const receipt = parseOperationReceipt(
        parsePrivateJson(
          await context.files.read(`${context.paths.runs}/${runId}.json`),
        ),
        recordIdentity(context),
      );
      assertCheckpointReleaseReceipt(receipt, entry, context.paths.stateFile);
    }
  }
  const days = [
    ...new Set(
      index.entries
        .filter((entry) => entry.kind === "daily")
        .map((entry) => entry.businessDate),
    ),
  ]
    .sort()
    .reverse()
    .slice(0, 14);
  const keep = new Set();
  for (const day of days) {
    const latest = index.entries
      .filter((entry) => entry.kind === "daily" && entry.businessDate === day)
      .sort((left, right) =>
        right.completedAt.localeCompare(left.completedAt),
      )[0];
    if (latest) keep.add(latest.id);
  }
  const latestPredeploy = index.entries
    .filter((entry) => entry.kind === "predeploy")
    .sort((left, right) =>
      right.completedAt.localeCompare(left.completedAt),
    )[0];
  if (latestPredeploy) keep.add(latestPredeploy.id);
  for (const entry of index.entries)
    if (
      entry.kind === "predeploy" &&
      (entry.protectedForRevision === null || entry.openedByRevision === null)
    )
      keep.add(entry.id);
  // Validate every indexed bundle before the first deletion. An incomplete or foreign
  // index cannot cause partial pruning of otherwise valid evidence.
  const removals = [];
  for (const entry of validatedIndex.entries) {
    const directory = path.join(context.config.backupDirectory, entry.id);
    const contents = await readPrivateFile(
      path.join(directory, "manifest.json"),
      { uid: uid(context), maximumBytes: 1048576 },
    );
    const manifest = parseBackupManifest(parsePrivateJson(contents));
    assertBackupEntryBinding(
      manifest,
      entry,
      recordIdentity(context),
      validatedIndex.storageIdentity,
    );
    if (sha256(contents) !== entry.manifestSha256)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "backup-retention-owner",
      );
    await verifyBackupFiles(context, { directory, manifest });
    if (!keep.has(entry.id)) {
      const names = ["database.dump", "manifest.json", ...privateNames].sort();
      if (
        JSON.stringify((await readdir(directory)).sort()) !==
        JSON.stringify(names)
      )
        throw new ReleaseFailure(
          "RELEASE_TARGET_MISMATCH",
          "backup-retention-contents",
        );
      removals.push({ directory, names });
    }
  }
  await storageAdmission(context);
  await context.files.assertLock();
  const updated = parseBackupIndex(
    {
      ...validatedIndex,
      entries: validatedIndex.entries.filter((entry) => keep.has(entry.id)),
    },
    recordIdentity(context),
  );
  await writeAtomicPrivate({
    filename: path.join(
      context.config.backupDirectory,
      `${context.config.environmentId}.index.json`,
    ),
    contents: JSON.stringify(updated),
    uid: uid(context),
  });
  for (const removal of removals) {
    await context.files.assertLock();
    for (const name of removal.names)
      await unlink(path.join(removal.directory, name));
    await rmdir(removal.directory);
  }
  return updated;
}
