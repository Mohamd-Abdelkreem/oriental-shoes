import { pipeline } from "node:stream/promises";
import { buildPackageUnderLease } from "./release-package.mjs";
import {
  mkdir,
  readFile,
  open,
  lstat,
  realpath,
  rename,
  unlink,
  readlink,
  symlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import {
  ReleaseFailure,
  parsePrivateJson,
  renderCaddyMode,
  parseRawEnvironment,
  validateReleaseEnvironment,
  bindAdministratorConfig,
  parseReleaseConfig,
} from "./release-config.mjs";
import {
  observeDeployment,
  checkedCommand,
  changeCaddyMode,
  observeCaddyMode,
  observeCaddyResponse,
  sourceIdentity,
  inspectImage,
  readPrivateFile,
  sha256,
  composeCommand,
  queryDatabase,
  replaceAdministratorBinding,
  observeTargetTls,
  writeAtomicPrivate,
  admitPrivateDirectory,
  openDockerStream,
} from "./operation-runtime.mjs";
import {
  parsePackageRecord,
  parseReleaseState,
  parseServiceSnapshot,
  parseBackupIndex,
  parseBackupManifest,
  assertBackupEntryBinding,
  parseOperationReceipt,
  parseAuthorityRebind,
  parseOperatorEvidence,
  initialReleaseState,
  parseAccountIdentity,
  parseProvisioningReceipt,
  parseOperatorSession,
  recordIdentity,
} from "./operations-records.mjs";
import {
  createVerifiedBackup,
  readDatabaseFingerprint,
  pruneVerifiedDailyBackups,
  verifyBackupInDisposableDatabase,
  verifyBackupFiles,
} from "./backup.mjs";
/** @typedef {import('./operation-runtime.mjs').OperationContext} OperationContext */
/** @typedef {import('./release-config.mjs').ReleaseArguments} ReleaseArguments */
/** @typedef {import('./operations-records.mjs').ReleaseState} ReleaseState */
/** @typedef {import('./operations-records.mjs').PackageRecord} PackageRecord */
/** @typedef {import('./operations-records.mjs').ServiceSnapshot} ServiceSnapshot */
const services = /** @type {const} */ (["api", "web", "postgres", "caddy"]);
/** @param {OperationContext} context */
async function loadIndex(context) {
  return parseBackupIndex(
    parsePrivateJson(
      await readPrivateFile(
        `${context.config.backupDirectory}/${context.config.environmentId}.index.json`,
        {
          uid: context.scope === "live" ? 0 : (process.getuid?.() ?? -1),
          maximumBytes: 1048576,
        },
      ),
    ),
    recordIdentity(context),
  );
}
/** @param {OperationContext} context */
function now(context) {
  return new Date(context.clock()).toISOString();
}
/** @param {OperationContext} context */
async function loadState(context) {
  return parseReleaseState(
    parsePrivateJson(await context.files.read(context.paths.stateFile)),
    recordIdentity(context),
  );
}
/** @param {OperationContext} context */
async function loadPackage(context) {
  const record = parsePackageRecord(
    parsePrivateJson(
      await context.files.read(
        `${context.paths.packages}/${context.config.releaseRevision}.json`,
      ),
    ),
  );
  const identity = recordIdentity(context);
  if (
    record.scope !== identity.scope ||
    record.environmentId !== identity.environmentId ||
    record.projectName !== identity.projectName ||
    record.revision !== context.config.releaseRevision ||
    record.machineEngineObservation.engine !==
      context.config.expectedDockerEngineId ||
    record.publicApiOrigin !== `https://${context.config.appDomain}/api/v1`
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "package-identity");
  const source = await sourceIdentity(context),
    image = await inspectImage(context, record.applicationImageId);
  const references = [
    context.config.nodeImage,
    context.config.postgresImage,
    context.config.caddyImage,
  ];
  for (const [index, reference] of references.entries()) {
    const base = record.bases[index],
      observed = await inspectImage(context, reference);
    if (
      !base ||
      base.reference !== reference ||
      base.id !== observed.id ||
      observed.architecture !== image.architecture
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "package-base-image");
  }
  if (
    source.sourceSha256 !== record.sourceSha256 ||
    source.lockfileSha256 !== record.lockfileSha256 ||
    source.migrationSetHash !== record.migrationSetHash ||
    image.id !== record.applicationImageId ||
    image.architecture !== record.architecture
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "package-source-image");
  return record;
}
/** @param {OperationContext} context */
function snapshot(context) {
  return parseServiceSnapshot(
    Object.fromEntries(
      services.map((role) => {
        const selected = context.registry.get(role);
        return [
          role,
          selected
            ? {
                id: selected.id,
                imageId: selected.imageId,
                running: selected.running,
              }
            : null,
        ];
      }),
    ),
  );
}
/** @param {OperationContext} context @param {ServiceSnapshot} expected */
async function sameServices(context, expected) {
  await observeDeployment(context);
  const actual = snapshot(context);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "service-snapshot");
}
/** @param {OperationContext} context @param {PackageRecord} record @param {ServiceSnapshot} expected */
async function healthy(context, record, expected) {
  await sameServices(context, expected);
  for (const role of services) {
    const actual = expected[role];
    if (!actual?.running)
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "healthy-services-required",
      );
    if (
      (role === "api" || role === "web") &&
      actual.imageId !== record.applicationImageId
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "application-image");
  }
  for (const role of ["api", "web"]) {
    const selected = expected[/** @type {'api'|'web'} */ (role)];
    if (!selected)
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "application-service",
      );
    const program =
      role === "api"
        ? "for(const path of ['live','ready']){const r=await fetch('http://127.0.0.1:4000/api/v1/health/'+path,{redirect:'error',signal:AbortSignal.timeout(10000)});if(r.status!==200)process.exit(1);}"
        : "const r=await fetch('http://127.0.0.1:3000/auth/login',{redirect:'error',signal:AbortSignal.timeout(10000)});if(r.status!==200)process.exit(1);";
    const deadline = Math.min(context.deadline, Date.now() + 120000);
    let ready = false;
    while (Date.now() < deadline) {
      const response = await context.command({
        executable: "docker",
        argv: [
          "exec",
          selected.id,
          "node",
          "--input-type=module",
          "-e",
          program,
        ],
        stage: `${role}-health`,
        timeoutMs: 15000,
      });
      if (response.exitCode === 0) {
        ready = true;
        break;
      }
      await sameServices(context, expected);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready)
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", `${role}-health`);
  }
}
/** @param {OperationContext} context */
async function assertAuthoritySettled(context) {
  let content;
  try {
    content = await context.files.read(context.paths.authorityRebind);
  } catch (failure) {
    if (
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    )
      return;
    throw failure;
  }
  parseAuthorityRebind(parsePrivateJson(content), recordIdentity(context));
  throw new ReleaseFailure(
    "RELEASE_ADMISSION_MISSING",
    "authority-rebind-pending",
  );
}
/** @param {OperationContext} context @param {ReleaseState} state @param {PackageRecord} record */
async function steady(context, state, record) {
  await assertAuthoritySettled(context);
  await assertCurrentPublication(context, state);
  if (
    state.lastFailure !== null ||
    state.administratorReauthenticationRequired ||
    state.phase !== "OPEN" ||
    state.caddyMode !== "normal" ||
    state.active?.applicationImageId !== record.applicationImageId ||
    state.active.revision !== record.revision
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "healthy-open-state-required",
    );
  await healthy(context, record, state.serviceSnapshot);
  if ((await observeCaddyMode(context)) !== state.caddyMode)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "state-caddy-mode");
  if (
    (await readFile(`${context.paths.caddy}/mode.caddy`, "utf8")) !==
    renderCaddyMode(context.config, "normal")
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "state-caddy-mode");
}
/** @typedef {Readonly<{state:ReleaseState,args:ReleaseArguments,startedAt:string,outcome:string,checkpointId:string|null,stages?:readonly Readonly<{stage:string,outcome:string}>[]}>} Publication */
/** @param {OperationContext} context @param {Publication} publication */
async function publish(context, publication) {
  const { state, args, startedAt, outcome, checkpointId } = publication;
  await context.files.assertLock();
  const completedAt = now(context);
  const next = parseReleaseState(
    {
      ...state,
      checkpointId,
      updatedAt: completedAt,
      lastTransition: {
        runId: context.runId,
        action: args.action,
        stage: "completed",
        startedAt,
        completedAt,
        outcome,
      },
    },
    recordIdentity(context),
  );
  const receipt = parseOperationReceipt(
    {
      version: 1,
      ...recordIdentity(context),
      runId: context.runId,
      action: args.action,
      environmentId: context.config.environmentId,
      revision: context.config.releaseRevision,
      startedAt,
      completedAt,
      phase: next.phase,
      outcome,
      authorizationReference: args.scheduled
        ? context.config.scheduledBackupAuthorizationReference
        : args.authorizationReference,
      priorStateReference: context.paths.stateFile,
      nextStateReference: context.paths.stateFile,
      stages: publication.stages ?? [{ stage: "completed", outcome }],
      remainingGates: ["T048-target-acceptance"],
    },
    recordIdentity(context),
  );
  await mkdir(context.paths.runs, { recursive: true, mode: 0o700 });
  const evidenceReference = `${context.paths.runs}/${context.runId}.json`;
  await context.files.writeJson(evidenceReference, receipt);
  await context.files.writeJson(context.paths.stateFile, next);
  return Object.freeze({
    runId: context.runId,
    action: args.action,
    phase: next.phase,
    outcome,
    evidenceReference,
  });
}
/** @param {OperationContext} context @param {ReleaseState} prior @param {unknown} failure @param {ReleaseArguments} args @param {string} startedAt @param {boolean} safelyRestored */
async function recordFailure(
  context,
  prior,
  failure,
  args,
  startedAt,
  safelyRestored,
) {
  const selected =
    failure instanceof ReleaseFailure
      ? failure
      : new ReleaseFailure("RELEASE_CHECK_FAILED", "backup-operation");
  const state = parseReleaseState(
    {
      ...prior,
      phase: safelyRestored ? prior.phase : "UNCERTAIN",
      caddyMode: safelyRestored ? prior.caddyMode : "maintenance",
      serviceSnapshot: snapshot(context),
      lastFailure: {
        runId: context.runId,
        code: selected.code,
        stage: selected.stage,
        occurredAt: now(context),
      },
    },
    recordIdentity(context),
  );
  await publish(context, {
    state: state,
    args: args,
    startedAt: startedAt,
    outcome:
      selected.code === "RELEASE_STATE_UNCERTAIN" ? "UNCERTAIN" : "FAILED",
    checkpointId: prior.checkpointId,
  });
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function runBackup(context, args) {
  const lease = await context.files.acquireLock(),
    startedAt = now(context);
  /** @type {ReleaseState|null} */ let prior = null;
  let maintenanceAttempted = false,
    quiesced = false,
    safelyRestored = false;
  try {
    await observeDeployment(context);
    const record = await loadPackage(context);
    prior = await loadState(context);
    assertNoPendingOpening(prior);
    if (args.kind === null)
      throw new ReleaseFailure("RELEASE_INPUT_INVALID", "backup-kind");
    if (args.kind === "daily") await steady(context, prior, record);
    const sourceServices = snapshot(context),
      sourceCaddyMode = await observeCaddyMode(context);
    if (sourceCaddyMode !== prior.caddyMode)
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "state-caddy-mode");
    const backupContext = Object.freeze({
      ...context,
      packageRecord: record,
      authorizationReference: args.scheduled
        ? context.config.scheduledBackupAuthorizationReference
        : (args.authorizationReference ?? ""),
      sourceServices,
      sourceCaddyMode,
    });
    const preflight = await readDatabaseFingerprint(backupContext, "postgres");
    if (
      args.kind === "daily" &&
      preflight.migrationFacts.length !== record.migrations.length
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "daily-migration-compatibility",
      );
    maintenanceAttempted = true;
    await changeCaddyMode(context, "maintenance");
    quiesced = true;
    await observeCaddyResponse(context, 503);
    for (const role of ["api", "web"]) {
      const service = context.registry.get(role);
      if (service?.running)
        await checkedCommand(context, {
          executable: "docker",
          argv: ["stop", "--time", "15", service.id],
          stage: "backup-stop-writers",
        });
    }
    await observeDeployment(context);
    const before = await readDatabaseFingerprint(backupContext, "postgres");
    let bundle = null;
    /** @type {unknown} */ let backupFailure = null;
    try {
      bundle = await createVerifiedBackup(backupContext, args.kind);
      const index = await loadIndex(context);
      await pruneVerifiedDailyBackups(backupContext, index);
    } catch (failure) {
      backupFailure = failure;
    }
    if (args.kind === "daily") {
      if (
        JSON.stringify(
          await readDatabaseFingerprint(backupContext, "postgres"),
        ) !== JSON.stringify(before)
      )
        throw new ReleaseFailure(
          "RELEASE_TARGET_MISMATCH",
          "daily-source-changed",
        );
      for (const role of ["api", "web"]) {
        const expected = sourceServices[/** @type {'api'|'web'} */ (role)],
          actual = context.registry.get(role);
        if (
          !expected?.running ||
          !actual ||
          actual.id !== expected.id ||
          actual.imageId !== expected.imageId ||
          actual.running
        )
          throw new ReleaseFailure(
            "RELEASE_TARGET_MISMATCH",
            "daily-resume-owner",
          );
        await checkedCommand(context, {
          executable: "docker",
          argv: ["start", actual.id],
          stage: "daily-resume",
        });
      }
      await observeDeployment(context);
      await healthy(context, record, sourceServices);
      await changeCaddyMode(context, sourceCaddyMode);
      safelyRestored = true;
    }
    if (backupFailure !== null) throw backupFailure;
    if (bundle === null)
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "backup-result");
    const next =
      args.kind === "daily"
        ? prior
        : parseReleaseState(
            {
              ...prior,
              phase: "MAINTENANCE",
              caddyMode: "maintenance",
              serviceSnapshot: snapshot(context),
            },
            recordIdentity(context),
          );
    return await publish(context, {
      state: next,
      args: args,
      startedAt: startedAt,
      outcome: "COMPLETED",
      checkpointId: bundle.manifest.id,
    });
  } catch (failure) {
    if (prior !== null && maintenanceAttempted && !quiesced)
      return await failPreparation(context, prior, args, startedAt, failure);
    if (prior !== null && quiesced)
      await recordFailure(
        context,
        prior,
        failure,
        args,
        startedAt,
        safelyRestored,
      );
    throw failure;
  } finally {
    await lease.release();
  }
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function installBackupTimer(context, args) {
  const lease = await context.files.acquireLock();
  const startedAt = now(context);
  try {
    await observeDeployment(context);
    const state = await loadState(context),
      record = await loadPackage(context);
    await steady(context, state, record);
    const index = await loadIndex(context);
    if (
      index.storageIdentity !== context.config.backupStorageIdentity ||
      !index.entries.some(
        (entry) => entry.kind === "daily" && entry.revision === record.revision,
      )
    )
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "verified-daily-demonstration",
      );
    const demonstration = index.entries
      .filter(
        (entry) => entry.kind === "daily" && entry.revision === record.revision,
      )
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
    if (!demonstration)
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "verified-daily-demonstration",
      );
    const directory = path.join(
      context.config.backupDirectory,
      demonstration.id,
    );
    const contents = await readPrivateFile(
      path.join(directory, "manifest.json"),
      {
        uid: context.scope === "live" ? 0 : (process.getuid?.() ?? -1),
        maximumBytes: 1048576,
      },
    );
    const manifest = parseBackupManifest(parsePrivateJson(contents));
    assertBackupEntryBinding(
      manifest,
      demonstration,
      recordIdentity(context),
      context.config.backupStorageIdentity,
    );
    if (
      manifest.machineIdSha256 !== context.config.expectedMachineIdSha256 ||
      manifest.dockerEngineId !== context.config.expectedDockerEngineId ||
      sha256(contents) !== demonstration.manifestSha256
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "daily-demonstration-manifest",
      );
    await verifyBackupInDisposableDatabase(
      {
        ...context,
        packageRecord: record,
        authorizationReference: args.authorizationReference ?? "",
        sourceServices: state.serviceSnapshot,
        sourceCaddyMode: state.caddyMode,
      },
      { directory, manifest },
    );
    if (
      context.scope !== "live" ||
      process.platform !== "linux" ||
      process.getuid?.() !== 0
    )
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "systemd-install-host",
      );
    const names = [
      "oriental-shoes-backup@.service",
      "oriental-shoes-backup@.timer",
    ];
    const sources = names.map((name) =>
      path.join(context.paths.release, "deploy/systemd", name),
    );
    await checkedCommand(context, {
      executable: "systemd-analyze",
      argv: ["verify", ...sources],
      stage: "backup-unit-syntax",
    });
    for (const [index, name] of names.entries()) {
      const source = sources[index];
      if (source === undefined)
        throw new ReleaseFailure("RELEASE_INPUT_INVALID", "backup-unit-path");
      const contents = await readFile(source, "utf8"),
        destination = `/etc/systemd/system/${name}`;
      try {
        const metadata = await lstat(destination);
        if (
          !metadata.isFile() ||
          metadata.uid !== 0 ||
          (metadata.mode & 0o777) !== 0o644 ||
          metadata.nlink !== 1 ||
          (await readFile(destination, "utf8")) !== contents
        )
          throw new ReleaseFailure(
            "RELEASE_TARGET_MISMATCH",
            "existing-backup-unit",
          );
      } catch (failure) {
        if (!(
          failure instanceof Error &&
          "code" in failure &&
          failure.code === "ENOENT"
        ))
          throw failure;
        const file = await open(
          destination,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o644,
        );
        try {
          await file.writeFile(contents);
          await file.sync();
        } finally {
          await file.close();
        }
      }
    }
    await checkedCommand(context, {
      executable: "systemctl",
      argv: ["daemon-reload"],
      stage: "backup-daemon-reload",
    });
    const instance = `oriental-shoes-backup@${context.config.environmentId}`;
    await checkedCommand(context, {
      executable: "systemctl",
      argv: ["enable", "--now", `${instance}.timer`],
      stage: "backup-timer-enable",
    });
    const timer = await checkedCommand(context, {
      executable: "systemctl",
      argv: ["show", `${instance}.timer`, "--property=ActiveState", "--value"],
      stage: "backup-timer-observe",
    });
    if (timer.trim() !== "active")
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "backup-timer-active");
    await checkedCommand(context, {
      executable: "systemctl",
      argv: ["list-timers", "--all", `${instance}.timer`, "--no-pager"],
      stage: "backup-timer-schedule",
    });
    const service = await checkedCommand(context, {
      executable: "systemctl",
      argv: ["show", `${instance}.service`, "--property=Result", "--value"],
      stage: "backup-service-observe",
    });
    if (service.trim() !== "success")
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "backup-service-result");
    return await publish(context, {
      state: state,
      args: args,
      startedAt: startedAt,
      outcome: "COMPLETED",
      checkpointId: state.checkpointId,
    });
  } finally {
    await lease.release();
  }
}

/** @param {OperationContext} context */
function privateUid(context) {
  const selected = context.scope === "live" ? 0 : process.getuid?.();
  if (selected === undefined)
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "posix-owner");
  return selected;
}
/** @param {OperationContext} context */
async function runtimeEnvironment(context) {
  const policy = { uid: privateUid(context), maximumBytes: 1048576 };
  const runtime = parseRawEnvironment(
      await readPrivateFile(context.config.runtimeEnvFile, policy),
    ),
    postgres = parseRawEnvironment(
      await readPrivateFile(context.config.postgresEnvFile, policy),
    );
  validateReleaseEnvironment(context.config, runtime, postgres);
  return runtime;
}
/** @param {OperationContext} context @param {PackageRecord} record */
async function loadEvidence(context, record) {
  return parseOperatorEvidence(
    parsePrivateJson(await context.files.read(context.paths.evidence)),
    {
      identity: recordIdentity(context),
      revision: record.revision,
      machineIdSha256: context.config.expectedMachineIdSha256,
      dockerEngineId: context.config.expectedDockerEngineId,
      applicationImageId: record.applicationImageId,
      migrationSetHash: record.migrationSetHash,
      operatorReference: context.config.operatorReference,
      now: context.clock(),
    },
  );
}
/** @param {OperationContext} context */
async function stateOrInitial(context) {
  try {
    return await loadState(context);
  } catch (failure) {
    if (
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    )
      return initialReleaseState(recordIdentity(context), context.clock());
    throw failure;
  }
}
/** @param {ReleaseState} state */
function assertNoPendingOpening(state) {
  if (
    state.phase === "UNCERTAIN" &&
    state.lastTransition?.action === "open-traffic"
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "opening-publication-pending",
    );
}
/** @param {unknown} value */
function databaseObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "database-metadata");
  return /** @type {Record<string,unknown>} */ (value);
}
/** @param {OperationContext} context @param {string} filename @param {string} contents */
async function initialCaddyFile(context, filename, contents) {
  const temporary = `${filename}.${context.runId}.partial`,
    handle = await open(temporary, "wx", 0o644);
  try {
    await handle.chmod(0o644);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    await rename(temporary, filename);
    const directory = await open(context.paths.caddy, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await handle.close();
    try {
      await unlink(temporary);
    } catch (failure) {
      if (!(
        failure instanceof Error &&
        "code" in failure &&
        failure.code === "ENOENT"
      ))
        throw failure;
    }
  }
}
/** @param {OperationContext} context @param {PackageRecord} record */
async function ensureMaintenanceCaddy(context, record) {
  const uid = privateUid(context),
    directory = context.paths.caddy;
  try {
    await mkdir(directory, { mode: 0o755 });
  } catch (failure) {
    if (!(
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "EEXIST"
    ))
      throw failure;
  }
  const metadata = await lstat(directory);
  if (
    !metadata.isDirectory() ||
    metadata.uid !== uid ||
    (metadata.mode & 0o777) !== 0o755 ||
    (await realpath(directory)) !== directory
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-directory");
  const filename = path.join(directory, "Caddyfile"),
    source = await readFile(
      path.join(context.paths.release, "deploy/Caddyfile"),
      "utf8",
    );
  try {
    const file = await lstat(filename);
    if (
      !file.isFile() ||
      file.uid !== uid ||
      file.nlink !== 1 ||
      (file.mode & 0o777) !== 0o644 ||
      (await realpath(filename)) !== filename ||
      (context.scope === "live" &&
        (await readFile(filename, "utf8")) !== source)
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-base-file");
  } catch (failure) {
    if (!(
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    ))
      throw failure;
    await initialCaddyFile(
      context,
      filename,
      context.scope === "isolated" ? `{\n local_certs\n}\n${source}` : source,
    );
  }
  await observeDeployment(context);
  if (context.registry.get("caddy")?.running) {
    const prior = await observeCaddyMode(context);
    await changeCaddyMode(context, "maintenance");
    return prior;
  }
  const modeFile = path.join(directory, "mode.caddy");
  try {
    const mode = await lstat(modeFile);
    if (
      !mode.isFile() ||
      mode.uid !== uid ||
      mode.nlink !== 1 ||
      (mode.mode & 0o777) !== 0o644 ||
      (await realpath(modeFile)) !== modeFile
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-mode-file");
    const existing = await readFile(modeFile, "utf8");
    if (
      !["normal", "maintenance", "acceptance"].some(
        (mode) =>
          renderCaddyMode(
            context.config,
            /** @type {'normal'|'maintenance'|'acceptance'} */ (mode),
          ) === existing,
      )
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "unknown-caddy-mode");
  } catch (failure) {
    if (!(
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    ))
      throw failure;
  }
  await initialCaddyFile(
    context,
    modeFile,
    renderCaddyMode(context.config, "maintenance"),
  );
  const validation = await composeCommand(context, record, {
    operation: "validate-caddy",
  });
  if (validation.exitCode !== 0)
    throw new ReleaseFailure(
      "RELEASE_CHECK_FAILED",
      "caddy-initial-validation",
    );
  const started = await composeCommand(context, record, {
    operation: "start-caddy",
  });
  if (started.exitCode !== 0)
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "caddy-initial-start");
  const deadline = Math.min(context.deadline, Date.now() + 120000);
  while (Date.now() < deadline) {
    try {
      if ((await observeCaddyMode(context)) === "maintenance")
        return "maintenance";
    } catch (failure) {
      if (
        !(failure instanceof ReleaseFailure) ||
        !["RELEASE_CHECK_FAILED", "RELEASE_STATE_UNCERTAIN"].includes(
          failure.code,
        )
      )
        throw failure;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new ReleaseFailure("RELEASE_CHECK_FAILED", "caddy-initial-readiness");
}
/** @param {OperationContext} context @param {ServiceSnapshot} [expected] */
async function stopApplications(context, expected) {
  await observeDeployment(context);
  for (const role of /** @type {const} */ (["api", "web"])) {
    const service = context.registry.get(role),
      prior = expected?.[role];
    if (
      expected !== undefined &&
      (service?.id !== prior?.id || service?.imageId !== prior?.imageId)
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "application-stop-owner",
      );
    if (service?.running)
      await checkedCommand(context, {
        executable: "docker",
        argv: ["stop", "--time", "15", service.id],
        stage: "stop-application-writers",
      });
  }
  await observeDeployment(context);
  for (const role of ["api", "web"])
    if (context.registry.get(role)?.running)
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "writers-not-stopped",
      );
}
/** @param {OperationContext} context @param {PackageRecord} record */
async function ensurePostgres(context, record) {
  await observeDeployment(context);
  const postgres = context.registry.get("postgres");
  if (postgres && postgres.imageId !== record.bases[1]?.id)
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "postgres-pinned-image",
    );
  if (postgres && !postgres.running)
    await checkedCommand(context, {
      executable: "docker",
      argv: ["start", postgres.id],
      stage: "start-owned-postgres",
    });
  else if (!postgres) {
    const started = await composeCommand(context, record, {
      operation: "start-postgres",
    });
    if (started.exitCode !== 0)
      throw new ReleaseFailure(
        "RELEASE_CHECK_FAILED",
        "postgres-initial-start",
      );
  }
  await observeDeployment(context);
  const current = context.registry.get("postgres");
  if (!current?.running)
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "postgres-readiness");
  const deadline = Math.min(context.deadline, Date.now() + 120000);
  while (Date.now() < deadline) {
    const ready = await context.command({
      executable: "docker",
      argv: [
        "exec",
        current.id,
        "pg_isready",
        `--username=${context.config.bootstrapRole}`,
        "--dbname=postgres",
      ],
      stage: "postgres-readiness",
    });
    if (ready.exitCode === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new ReleaseFailure("RELEASE_CHECK_FAILED", "postgres-readiness");
}
/** @param {OperationContext} context */
async function initializationFacts(context) {
  const role = context.config.applicationRole,
    database = context.config.databaseName;
  const sql = `SELECT json_build_object('role',(SELECT json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'createDatabase',rolcreatedb,'createRole',rolcreaterole,'replication',rolreplication) FROM pg_catalog.pg_roles WHERE rolname='${role}'),'database',(SELECT json_build_object('name',datname,'owner',pg_catalog.pg_get_userbyid(datdba)) FROM pg_catalog.pg_database WHERE datname='${database}'))::text;`;
  const facts = databaseObject(
    parsePrivateJson(
      (
        await queryDatabase(context, {
          database: "postgres",
          sql,
          stage: "database-initialization-observation",
        })
      ).trim(),
    ),
  );
  const selectedRole =
      facts["role"] === null ? null : databaseObject(facts["role"]),
    selectedDatabase =
      facts["database"] === null ? null : databaseObject(facts["database"]);
  if (
    selectedRole &&
    (selectedRole["name"] !== role ||
      selectedRole["login"] !== true ||
      ["superuser", "createDatabase", "createRole", "replication"].some(
        (key) => selectedRole[key] !== false,
      ))
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "application-role-ownership",
    );
  if (
    selectedDatabase &&
    (selectedDatabase["name"] !== database ||
      selectedDatabase["owner"] !== role)
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "application-database-ownership",
    );
  return {
    roleExists: selectedRole !== null,
    databaseExists: selectedDatabase !== null,
  };
}
/** @param {OperationContext} context @param {Readonly<Record<string,string>>} runtime */
async function initializeApplicationDatabase(context, runtime) {
  const url = runtime["DATABASE_URL"];
  if (url === undefined)
    throw new ReleaseFailure(
      "RELEASE_INPUT_INVALID",
      "application-database-url",
    );
  const password = decodeURIComponent(new URL(url).password);
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(password))
    throw new ReleaseFailure(
      "RELEASE_INPUT_INVALID",
      "application-database-password",
    );
  let facts = await initializationFacts(context);
  if (!facts.roleExists) {
    try {
      await queryDatabase(context, {
        database: "postgres",
        sql: `SET standard_conforming_strings=on;\nCREATE ROLE "${context.config.applicationRole}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password.replaceAll("'", "''")}';\n`,
        stage: "application-role-initialization",
      });
    } catch {
      facts = await initializationFacts(context);
      if (!facts.roleExists)
        throw new ReleaseFailure(
          "RELEASE_CHECK_FAILED",
          "application-role-initialization",
        );
    }
  }
  facts = await initializationFacts(context);
  if (!facts.databaseExists) {
    try {
      await queryDatabase(context, {
        database: "postgres",
        sql: `CREATE DATABASE "${context.config.databaseName}" OWNER "${context.config.applicationRole}" TEMPLATE template0;\n`,
        stage: "application-database-initialization",
      });
    } catch {
      facts = await initializationFacts(context);
      if (!facts.databaseExists)
        throw new ReleaseFailure(
          "RELEASE_CHECK_FAILED",
          "application-database-initialization",
        );
    }
  }
  facts = await initializationFacts(context);
  if (!facts.roleExists || !facts.databaseExists)
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "application-initialization-result",
    );
}
/** @param {OperationContext} context @param {ReleaseState} prior @param {ReleaseArguments} args @param {string} startedAt @param {unknown} failure @returns {Promise<never>} */
async function failPreparation(context, prior, args, startedAt, failure) {
  let contained = true;
  try {
    await observeDeployment(context);
    if (context.registry.get("caddy")?.running)
      await changeCaddyMode(context, "maintenance");
    await stopApplications(context);
  } catch {
    contained = false;
  }
  const selected = contained
    ? failure instanceof ReleaseFailure
      ? failure
      : new ReleaseFailure("RELEASE_CHECK_FAILED", "prepare-operation")
    : new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "prepare-containment");
  const failed = parseReleaseState(
    {
      ...prior,
      phase:
        selected.code === "RELEASE_STATE_UNCERTAIN"
          ? "UNCERTAIN"
          : "MAINTENANCE",
      caddyMode: "maintenance",
      serviceSnapshot: snapshot(context),
      lastFailure: {
        runId: context.runId,
        code: selected.code,
        stage: selected.stage,
        occurredAt: now(context),
      },
    },
    recordIdentity(context),
  );
  await publish(context, {
    state: failed,
    args: args,
    startedAt: startedAt,
    outcome:
      selected.code === "RELEASE_STATE_UNCERTAIN" ? "UNCERTAIN" : "FAILED",
    checkpointId: failed.checkpointId,
  });
  throw selected;
}
/** @param {OperationContext} context @param {ReleaseArguments} args @param {PackageRecord} record @param {ReleaseState} prior @param {string} startedAt */
async function prepareUnderLease(context, args, record, prior, startedAt) {
  await context.files.assertLock();
  await assertAuthoritySettled(context);
  assertNoPendingOpening(prior);
  await assertCurrentPublication(context, prior);
  const evidence = await loadEvidence(context, record);
  for (const key of [
    "backend",
    "frontend",
    "browser",
    "localOperations",
    "requirementsReview",
    "engineeringReview",
  ])
    if (evidence.observations[key]?.status !== "PASS")
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "local-acceptance-evidence",
      );
  const runtime = await runtimeEnvironment(context);
  let state = prior;
  try {
    const priorMode = await ensureMaintenanceCaddy(context, record);
    state = parseReleaseState(
      {
        ...prior,
        phase: "MAINTENANCE",
        candidate: record,
        caddyMode: "maintenance",
        lastFailure: null,
        updatedAt: now(context),
        lastTransition: {
          runId: context.runId,
          action: args.action,
          stage: "maintenance",
          startedAt,
          completedAt: null,
          outcome: "IN_PROGRESS",
        },
      },
      recordIdentity(context),
    );
    await context.files.writeJson(context.paths.stateFile, state);
    await ensurePostgres(context, record);
    const sourceServices = snapshot(context);
    if (sourceServices.api?.running || sourceServices.web?.running)
      await observeCaddyResponse(context, 503);
    await stopApplications(context, sourceServices);
    await initializeApplicationDatabase(context, runtime);
    const backupContext = {
      ...context,
      packageRecord: record,
      authorizationReference: args.authorizationReference ?? "",
      sourceServices,
      sourceCaddyMode: priorMode,
    };
    const before = await readDatabaseFingerprint(backupContext, "postgres");
    const bundle = await createVerifiedBackup(backupContext, "predeploy");
    if (
      JSON.stringify(bundle.manifest.before) !== JSON.stringify(before) ||
      JSON.stringify(
        await readDatabaseFingerprint(backupContext, "postgres"),
      ) !== JSON.stringify(before)
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "prepare-checkpoint-source",
      );
    state = parseReleaseState(
      {
        ...state,
        checkpointId: bundle.manifest.id,
        serviceSnapshot: snapshot(context),
      },
      recordIdentity(context),
    );
    await context.files.writeJson(context.paths.stateFile, state);
    const access = await composeCommand(context, record, {
      operation: "database-access",
    });
    if (
      access.exitCode !== 0 ||
      access.stdout.trim() !== "APPLICATION_DATABASE_ACCESS_VERIFIED"
    )
      throw new ReleaseFailure(
        "RELEASE_CHECK_FAILED",
        "application-database-access",
      );
    const status = await composeCommand(context, record, {
        operation: "migration-status",
      }),
      pending =
        before.ledgerAbsent ||
        before.migrationFacts.length < record.migrations.length;
    if (status.exitCode !== 0 && !(status.exitCode === 1 && pending))
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "migration-pre-status");
    const deployed = await composeCommand(context, record, {
      operation: "migration-deploy",
    });
    if (deployed.exitCode !== 0)
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "migration-deploy");
    const finalStatus = await composeCommand(context, record, {
      operation: "migration-status",
    });
    if (finalStatus.exitCode !== 0)
      throw new ReleaseFailure(
        "RELEASE_CHECK_FAILED",
        "migration-final-status",
      );
    const migrated = await readDatabaseFingerprint(backupContext, "postgres");
    if (
      migrated.ledgerAbsent ||
      migrated.migrationFacts.length !== record.migrations.length
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "migration-final-ledger",
      );
    const started = await composeCommand(context, record, {
      operation: "start-applications",
    });
    if (started.exitCode !== 0)
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "application-start");
    await observeDeployment(context);
    const serviceSnapshot = snapshot(context);
    await healthy(context, record, serviceSnapshot);
    await changeCaddyMode(context, "acceptance");
    state = parseReleaseState(
      {
        ...state,
        phase: "ACCEPTANCE",
        caddyMode: "acceptance",
        serviceSnapshot,
        administratorReauthenticationRequired:
          prior.administratorReauthenticationRequired ||
          prior.authority === null,
        lastFailure: null,
      },
      recordIdentity(context),
    );
    return await publish(context, {
      state: state,
      args: args,
      startedAt: startedAt,
      outcome: state.administratorReauthenticationRequired
        ? "AWAITING_OPERATOR"
        : "COMPLETED",
      checkpointId: bundle.manifest.id,
    });
  } catch (failure) {
    return await failPreparation(context, state, args, startedAt, failure);
  }
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function runPrepare(context, args) {
  const lease = await context.files.acquireLock(),
    startedAt = now(context);
  try {
    await observeDeployment(context);
    const record = await loadPackage(context),
      prior = await stateOrInitial(context);
    return await prepareUnderLease(context, args, record, prior, startedAt);
  } finally {
    await lease.release();
  }
}

/** @param {OperationContext} context @param {ReleaseState} state */
async function assertCurrentPublication(context, state) {
  const selectedPointer = await currentPointer(context),
    pointer =
      selectedPointer === null
        ? null
        : path.resolve(path.dirname(context.paths.current), selectedPointer);
  if (state.active === null) {
    if (pointer !== null || state.openingRunId !== null)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "uncommitted-current-release",
      );
    return;
  }
  const expected = path.join(
    context.paths.base,
    "releases",
    state.active.revision,
  );
  if (
    pointer !== expected ||
    state.openingRunId === null ||
    (await realpath(expected)) !== expected
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "current-release-pointer",
    );
  const receipt = parseOperationReceipt(
    parsePrivateJson(
      await context.files.read(
        `${context.paths.runs}/${state.openingRunId}.json`,
      ),
    ),
    recordIdentity(context),
  );
  if (
    receipt.runId !== state.openingRunId ||
    receipt.action !== "open-traffic" ||
    receipt.phase !== "OPEN" ||
    receipt.outcome !== "COMPLETED" ||
    receipt.revision !== state.active.revision ||
    receipt.priorStateReference !== context.paths.stateFile ||
    receipt.nextStateReference !== context.paths.stateFile
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "current-opening-receipt",
    );
}

/** @typedef {import('./operations-records.mjs').AccountIdentity} AccountIdentity */
/** @param {OperationContext} context */
async function administratorFacts(context) {
  const userId = context.config.initialAdministrator.userId;
  if (userId === null)
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "administrator-binding",
    );
  const sql = `SELECT json_build_object('user',(SELECT json_build_object('id',id::text,'email',email,'role',role::text,'status',status::text,'accessVersion',access_version) FROM public.users WHERE id='${userId}'::uuid),'receipt',(SELECT json_build_object('targetId',target_id::text,'beforeVersion',before_version,'afterVersion',after_version,'occurredAt',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'operatorReference',operator_reference) FROM public.initial_administrator_provisioning WHERE id='INITIAL_ADMIN'))::text;`;
  const facts = databaseObject(
    parsePrivateJson(
      (
        await queryDatabase(context, {
          database: "application",
          sql,
          stage: "administrator-database-observation",
          readOnly: true,
        })
      ).trim(),
    ),
  );
  if (Object.keys(facts).sort().join(",") !== "receipt,user")
    throw new ReleaseFailure(
      "RELEASE_CHECK_FAILED",
      "administrator-database-response",
    );
  return Object.freeze({
    user: facts["user"] === null ? null : parseAccountIdentity(facts["user"]),
    receipt:
      facts["receipt"] === null
        ? null
        : parseProvisioningReceipt(facts["receipt"]),
  });
}
/** @param {OperationContext} context @param {AccountIdentity} identity */
function selectedIdentity(context, identity) {
  if (
    identity.id !== context.config.initialAdministrator.userId ||
    identity.email !== context.config.initialAdministrator.expectedEmail
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "authenticated-administrator-identity",
    );
}
/** @param {OperationContext} context @param {PackageRecord} record @returns {Promise<AccountIdentity|null>} */
async function authenticatedIdentity(context, record) {
  await observeDeployment(context);
  const api = context.registry.get("api");
  if (!api?.running || api.imageId !== record.applicationImageId)
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "authenticated-api-image",
    );
  const session = parseOperatorSession(
      parsePrivateJson(
        await readPrivateFile(context.paths.session, {
          uid: privateUid(context),
          maximumBytes: 65536,
        }),
      ),
    ),
    environment = await runtimeEnvironment(context),
    environmentKeys = Object.keys(environment).sort(),
    environmentSha256 = sha256(
      JSON.stringify(
        Object.fromEntries(
          environmentKeys.map((key) => [key, environment[key]]),
        ),
      ),
    );
  const program = `
  import {createHash} from 'node:crypto';
  import {successEnvelopeSchema,authUserDataSchema} from '@template/contracts';
  import {verifyAccessToken} from './dist/infrastructure/security/jwt.service.js';
  try{
   let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>131072)throw Error();}
   const request=JSON.parse(input);
   const actual=Object.fromEntries(request.environmentKeys.map(key=>[key,process.env[key]]));
   if(createHash('sha256').update(JSON.stringify(actual)).digest('hex')!==request.environmentSha256)throw Error();
   const response=await fetch('http://127.0.0.1:4000/api/v1/users/me',{headers:{Authorization:'Bearer '+request.accessToken},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.status===401||response.status===403){await response.body?.cancel();console.log(JSON.stringify({kind:'reauthentication-required'}));}
   else{
    if(response.status!==200||response.body===null)throw Error();
    let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>65536)throw Error();chunks.push(chunk);}
    const envelope=successEnvelopeSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const {user}=authUserDataSchema.parse(envelope.data);
    const verified=verifyAccessToken(request.accessToken);if(!verified.valid)throw Error();
    if(verified.payload.role!==user.role)console.log(JSON.stringify({kind:'reauthentication-required'}));
    else console.log(JSON.stringify({kind:'identity',identity:{id:user.id,email:user.email,role:user.role,status:user.status,accessVersion:user.accessVersion}}));
   }
  }catch{process.exitCode=1;}
 `;
  const metadata = databaseObject(
    parsePrivateJson(
      (
        await checkedCommand(context, {
          executable: "docker",
          argv: [
            "exec",
            "-i",
            "--workdir",
            "/workspace/apps/api",
            api.id,
            "node",
            "--input-type=module",
            "--eval",
            program,
          ],
          input: JSON.stringify({
            accessToken: session.accessToken,
            environmentKeys,
            environmentSha256,
          }),
          stage: "authenticated-users-me",
        })
      ).trim(),
    ),
  );
  if (
    metadata["kind"] === "reauthentication-required" &&
    Object.keys(metadata).length === 1
  )
    return null;
  if (
    metadata["kind"] !== "identity" ||
    Object.keys(metadata).sort().join(",") !== "identity,kind"
  )
    throw new ReleaseFailure(
      "RELEASE_CHECK_FAILED",
      "authenticated-users-me-response",
    );
  const identity = parseAccountIdentity(metadata["identity"]);
  selectedIdentity(context, identity);
  return identity;
}
/** @param {AccountIdentity} identity @param {Awaited<ReturnType<typeof administratorFacts>>} facts */
function sameAccountObservation(identity, facts) {
  if (
    facts.user === null ||
    JSON.stringify(identity) !== JSON.stringify(facts.user)
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-authority-race",
    );
}
/** @param {string} output @param {Readonly<{userId:string,beforeVersion:number}>} expected */
function provisioningPreview(output, expected) {
  /** @type {Map<string,string>} */
  const values = new Map();
  for (const line of output.trim().split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    if (
      ![
        "outcome",
        "eligible",
        "reason",
        "selected_id",
        "email_masked",
        "role",
        "status",
        "access_version",
      ].includes(key)
    )
      continue;
    if (values.has(key))
      throw new ReleaseFailure(
        "RELEASE_CHECK_FAILED",
        "administrator-preview-output",
      );
    values.set(key, line.slice(separator + 1));
  }
  if (
    values.get("outcome") !== "PREVIEW" ||
    (values.get("eligible") !== "true" && values.get("eligible") !== "false") ||
    ![
      "ELIGIBLE",
      "INITIAL_ADMIN_EXISTS",
      "INVALID_CANDIDATE",
      "STALE_CANDIDATE",
    ].includes(values.get("reason") ?? "")
  )
    throw new ReleaseFailure(
      "RELEASE_CHECK_FAILED",
      "administrator-preview-output",
    );
  if (
    values.get("selected_id") !== expected.userId ||
    values.get("access_version") !== String(expected.beforeVersion) ||
    (values.get("eligible") === "true") !==
      (values.get("reason") === "ELIGIBLE")
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-preview-target",
    );
  return values.get("eligible") === "true";
}
/** @param {OperationContext} context @param {AccountIdentity} identity */
function configuredAccountVersion(context, identity) {
  selectedIdentity(context, identity);
  if (
    identity.accessVersion !==
    context.config.initialAdministrator.expectedAccessVersion
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-access-version",
    );
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function observeAdministrator(context, args) {
  await observeDeployment(context);
  const record = await loadPackage(context),
    identity = await authenticatedIdentity(context, record);
  if (identity === null)
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "administrator-reauthentication",
    );
  configuredAccountVersion(context, identity);
  let facts = await administratorFacts(context);
  sameAccountObservation(identity, facts);
  let outcome = "INELIGIBLE_NOT_APPLIED";
  if (identity.role === "ADMIN" && identity.status === "ACTIVE")
    outcome = "ALREADY_ADMIN_NOT_APPLIED";
  else {
    const preview = await composeCommand(context, record, {
      operation: "admin-preview",
      administrator: {
        userId: identity.id,
        email: identity.email,
        beforeVersion: identity.accessVersion,
      },
    });
    if (preview.exitCode !== 0)
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "administrator-preview");
    outcome = provisioningPreview(preview.stdout, {
      userId: identity.id,
      beforeVersion: identity.accessVersion,
    })
      ? "ELIGIBLE_NOT_APPLIED"
      : "INELIGIBLE_NOT_APPLIED";
    facts = await administratorFacts(context);
    sameAccountObservation(identity, facts);
  }
  return Object.freeze({
    runId: context.runId,
    action: args.action,
    phase: "OBSERVED",
    outcome,
    evidenceReference: null,
  });
}

/** @param {OperationContext} context @param {ReleaseState} state @param {PackageRecord} record */
async function checkpointBundle(context, state, record) {
  if (state.checkpointId === null)
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "verified-checkpoint-required",
    );
  const index = await loadIndex(context);
  if (index.storageIdentity !== context.config.backupStorageIdentity)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "checkpoint-storage");
  const entry = index.entries.find((entry) => entry.id === state.checkpointId);
  if (!entry || entry.revision !== record.revision)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "checkpoint-index");
  const directory = path.join(context.config.backupDirectory, entry.id),
    contents = await readPrivateFile(path.join(directory, "manifest.json"), {
      uid: privateUid(context),
      maximumBytes: 1048576,
    }),
    manifest = parseBackupManifest(parsePrivateJson(contents));
  assertBackupEntryBinding(
    manifest,
    entry,
    recordIdentity(context),
    context.config.backupStorageIdentity,
  );
  if (
    sha256(contents) !== entry.manifestSha256 ||
    manifest.machineIdSha256 !== context.config.expectedMachineIdSha256 ||
    manifest.dockerEngineId !== context.config.expectedDockerEngineId ||
    manifest.packageRecord.sourceSha256 !== record.sourceSha256 ||
    manifest.packageRecord.lockfileSha256 !== record.lockfileSha256 ||
    manifest.packageRecord.migrationSetHash !== record.migrationSetHash
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "checkpoint-identity");
  const bundle = { directory, manifest };
  await verifyBackupFiles(context, bundle);
  return bundle;
}

/** @param {OperationContext} context */
async function authorityJournal(context) {
  try {
    return parseAuthorityRebind(
      parsePrivateJson(
        await readPrivateFile(context.paths.authorityRebind, {
          uid: privateUid(context),
          maximumBytes: 65536,
        }),
      ),
      recordIdentity(context),
    );
  } catch (failure) {
    if (
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    )
      return null;
    throw failure;
  }
}
/** @param {OperationContext} context @param {Awaited<ReturnType<typeof administratorFacts>>} facts @param {ReleaseState} state */
function selectedProvisioningReceipt(context, facts, state) {
  const receipt =
    facts.receipt?.targetId === context.config.initialAdministrator.userId
      ? facts.receipt
      : null;
  if (
    state.provisioningReceipt !== null &&
    JSON.stringify(receipt) !== JSON.stringify(state.provisioningReceipt)
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-receipt-changed",
    );
  return receipt;
}
/** @param {OperationContext} context @param {PackageRecord} record @param {ReleaseState} state */
async function currentAdministrator(context, record, state) {
  const identity = await authenticatedIdentity(context, record);
  if (identity === null)
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "administrator-reauthentication",
    );
  configuredAccountVersion(context, identity);
  if (identity.role !== "ADMIN" || identity.status !== "ACTIVE")
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "administrator-not-active",
    );
  const facts = await administratorFacts(context);
  sameAccountObservation(identity, facts);
  const receipt = selectedProvisioningReceipt(context, facts, state);
  return Object.freeze({
    userId: identity.id,
    email: identity.email,
    accessVersion: identity.accessVersion,
    observedAt: now(context),
    source: /** @type {const} */ ("users-me"),
    provisioningReceipt: receipt,
  });
}
/** @param {OperationContext} context @param {import('./operations-records.mjs').AuthorityRebind} journal */
async function clearAuthorityJournal(context, journal) {
  await context.files.assertLock();
  const actual = await authorityJournal(context);
  if (
    actual === null ||
    actual.runId !== journal.runId ||
    JSON.stringify(actual) !== JSON.stringify(journal)
  )
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "authority-journal-owner",
    );
  await unlink(context.paths.authorityRebind);
  const parent = await open(context.paths.state, constants.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}
/** @param {OperationContext} context @param {ReleaseArguments} args @param {ReleaseState} state @param {PackageRecord} record @param {AccountIdentity} identity @param {ReturnType<typeof parseProvisioningReceipt>|null} receipt @param {string} startedAt */
async function bindCurrentAdministrator(
  context,
  args,
  state,
  record,
  identity,
  receipt,
  startedAt,
) {
  selectedIdentity(context, identity);
  if (identity.role !== "ADMIN" || identity.status !== "ACTIVE")
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "administrator-not-active",
    );
  const existing = await authorityJournal(context),
    contents = await readPrivateFile(context.paths.config, {
      uid: privateUid(context),
      maximumBytes: 1048576,
    }),
    beforeHash = sha256(contents);
  if (
    existing !== null &&
    (existing.userId !== identity.id ||
      existing.email !== identity.email ||
      (beforeHash !== existing.configBeforeSha256 &&
        beforeHash !== existing.configAfterSha256) ||
      JSON.stringify(existing.provisioningReceipt) !== JSON.stringify(receipt))
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "authority-journal-reconciliation",
    );
  const next = bindAdministratorConfig(context.config, {
    userId: identity.id,
    email: identity.email,
    accessVersion: identity.accessVersion,
  });
  const journal = parseAuthorityRebind(
    {
      version: 1,
      ...recordIdentity(context),
      runId: context.runId,
      userId: identity.id,
      email: identity.email,
      observedAccessVersion: identity.accessVersion,
      configBeforeSha256: beforeHash,
      configAfterSha256: sha256(JSON.stringify(next)),
      provisioningReceipt: receipt,
      createdAt: now(context),
    },
    recordIdentity(context),
  );
  await context.files.writeJson(context.paths.authorityRebind, journal);
  const authority = {
    userId: identity.id,
    email: identity.email,
    accessVersion: identity.accessVersion,
    observedAt: now(context),
    source: /** @type {const} */ ("users-me"),
    provisioningReceipt: receipt,
  };
  let pending = parseReleaseState(
    {
      ...state,
      provisioningReceipt: receipt,
      authority,
      administratorReauthenticationRequired: true,
      lastFailure: null,
      updatedAt: now(context),
      lastTransition: {
        runId: context.runId,
        action: "admin-apply",
        stage: "authority-rebind-pending",
        startedAt,
        completedAt: null,
        outcome: "IN_PROGRESS",
      },
    },
    recordIdentity(context),
  );
  await context.files.writeJson(context.paths.stateFile, pending);
  const config = await replaceAdministratorBinding(context, {
    expectedConfigSha256: beforeHash,
    authority,
  });
  const rebound = Object.freeze({ ...context, config }),
    current = await currentAdministrator(rebound, record, pending);
  pending = parseReleaseState(
    {
      ...pending,
      phase: state.caddyMode === "normal" ? "OPEN" : "ACCEPTANCE",
      authority: current,
      administratorReauthenticationRequired: false,
      lastFailure: null,
    },
    recordIdentity(rebound),
  );
  const result = await publish(rebound, {
    state: pending,
    args: args,
    startedAt: startedAt,
    outcome: "COMPLETED",
    checkpointId: pending.checkpointId,
  });
  await clearAuthorityJournal(rebound, journal);
  return result;
}
/** @param {OperationContext} context @param {ReleaseState} state @param {PackageRecord} record */
async function administratorStateAdmission(context, state, record) {
  assertNoPendingOpening(state);
  const journal = await authorityJournal(context),
    pending =
      journal !== null ||
      (state.administratorReauthenticationRequired &&
        state.lastTransition?.action === "admin-apply");
  if (
    (state.phase !== "ACCEPTANCE" &&
      state.phase !== "OPEN" &&
      !(state.phase === "UNCERTAIN" && pending)) ||
    (state.lastFailure !== null && !pending)
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "administrator-lifecycle-state",
    );
  if (
    state.authority !== null &&
    state.authority.userId !== context.config.initialAdministrator.userId
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-state-identity",
    );
  const selected = state.candidate ?? state.active;
  if (
    selected?.revision !== record.revision ||
    selected.applicationImageId !== record.applicationImageId
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-state-package",
    );
  await assertCurrentPublication(context, state);
  await healthy(context, record, state.serviceSnapshot);
  const mode = await observeCaddyMode(context);
  if (mode !== state.caddyMode || (mode !== "acceptance" && mode !== "normal"))
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-state-mode",
    );
  await checkpointBundle(context, state, record);
  const fingerprint = await readDatabaseFingerprint(
    {
      ...context,
      packageRecord: record,
      authorizationReference: "administrator-observation",
      sourceServices: state.serviceSnapshot,
      sourceCaddyMode: mode,
    },
    "postgres",
  );
  if (
    fingerprint.ledgerAbsent ||
    fingerprint.migrationFacts.length !== record.migrations.length
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-migration-ledger",
    );
  return journal;
}
/** @param {OperationContext} context @param {ReleaseState} state @param {ReleaseArguments} args @param {string} startedAt @param {unknown} failure */
async function recordAdministratorFailure(
  context,
  state,
  args,
  startedAt,
  failure,
) {
  const selected =
    failure instanceof ReleaseFailure
      ? failure
      : new ReleaseFailure("RELEASE_CHECK_FAILED", "administrator-operation");
  let current;
  try {
    current = await loadState(context);
  } catch {
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "administrator-state-observation",
    );
  }
  if (
    state.provisioningReceipt !== null &&
    current.provisioningReceipt === null
  )
    current = parseReleaseState(
      { ...current, provisioningReceipt: state.provisioningReceipt },
      recordIdentity(context),
    );
  const failed = parseReleaseState(
    {
      ...current,
      phase: "UNCERTAIN",
      administratorReauthenticationRequired: true,
      lastFailure: {
        runId: context.runId,
        code: selected.code,
        stage: selected.stage,
        occurredAt: now(context),
      },
    },
    recordIdentity(context),
  );
  await publish(context, {
    state: failed,
    args: args,
    startedAt: startedAt,
    outcome: "UNCERTAIN",
    checkpointId: failed.checkpointId,
  });
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function applyAdministrator(context, args) {
  const lease = await context.files.acquireLock(),
    startedAt = now(context);
  /** @type {ReleaseState|null} */ let state = null;
  let mutationStarted = false;
  try {
    await observeDeployment(context);
    const record = await loadPackage(context);
    state = await loadState(context);
    const journal = await administratorStateAdmission(context, state, record);
    let facts = await administratorFacts(context);
    if (facts.user === null)
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "administrator-target-missing",
      );
    selectedIdentity(context, facts.user);
    let identity;
    try {
      identity = await authenticatedIdentity(context, record);
    } catch (failure) {
      if (
        failure instanceof Error &&
        "code" in failure &&
        failure.code === "ENOENT"
      )
        identity = null;
      else throw failure;
    }
    if (identity !== null) {
      facts = await administratorFacts(context);
      sameAccountObservation(identity, facts);
    }
    let receipt = selectedProvisioningReceipt(context, facts, state);
    if (facts.user?.role === "ADMIN" && facts.user.status === "ACTIVE") {
      if (identity === null) {
        if (receipt === null)
          throw new ReleaseFailure(
            "RELEASE_ADMISSION_MISSING",
            "administrator-reauthentication",
          );
        mutationStarted = true;
        state = parseReleaseState(
          {
            ...state,
            phase: state.caddyMode === "normal" ? "OPEN" : "ACCEPTANCE",
            provisioningReceipt: receipt,
            authority: null,
            administratorReauthenticationRequired: true,
            lastFailure: null,
          },
          recordIdentity(context),
        );
        return await publish(context, {
          state: state,
          args: args,
          startedAt: startedAt,
          outcome: "AWAITING_OPERATOR",
          checkpointId: state.checkpointId,
        });
      }
      mutationStarted = true;
      return await bindCurrentAdministrator(
        context,
        args,
        state,
        record,
        identity,
        receipt,
        startedAt,
      );
    }
    if (
      journal !== null ||
      state.phase !== "ACCEPTANCE" ||
      state.caddyMode !== "acceptance"
    )
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "administrator-promotion-state",
      );
    if (identity === null)
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "administrator-reauthentication",
      );
    configuredAccountVersion(context, identity);
    const selected = {
      userId: identity.id,
      email: identity.email,
      beforeVersion: identity.accessVersion,
    };
    const preview = await composeCommand(context, record, {
      operation: "admin-preview",
      administrator: selected,
    });
    if (
      preview.exitCode !== 0 ||
      !provisioningPreview(preview.stdout, {
        userId: identity.id,
        beforeVersion: identity.accessVersion,
      })
    )
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "administrator-ineligible",
      );
    facts = await administratorFacts(context);
    sameAccountObservation(identity, facts);
    mutationStarted = true;
    let failedApply = false;
    try {
      const applied = await composeCommand(context, record, {
        operation: "admin-apply",
        administrator: selected,
      });
      failedApply = applied.exitCode !== 0;
    } catch {
      failedApply = true;
    }
    try {
      facts = await administratorFacts(context);
    } catch {
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "administrator-provisioning-observation",
      );
    }
    receipt = selectedProvisioningReceipt(context, facts, state);
    if (
      receipt === null ||
      receipt.beforeVersion !== identity.accessVersion ||
      facts.user?.role !== "ADMIN" ||
      facts.user.status !== "ACTIVE" ||
      facts.user.accessVersion < receipt.afterVersion
    )
      throw new ReleaseFailure(
        failedApply ? "RELEASE_STATE_UNCERTAIN" : "RELEASE_CHECK_FAILED",
        "administrator-provisioning-result",
      );
    state = parseReleaseState(
      {
        ...state,
        phase: "ACCEPTANCE",
        provisioningReceipt: receipt,
        authority: null,
        administratorReauthenticationRequired: true,
        lastFailure: null,
      },
      recordIdentity(context),
    );
    return await publish(context, {
      state,
      args,
      startedAt,
      outcome: "AWAITING_OPERATOR",
      checkpointId: state.checkpointId,
    });
  } catch (failure) {
    if (mutationStarted && state !== null)
      await recordAdministratorFailure(
        context,
        state,
        args,
        startedAt,
        failure,
      );
    throw failure;
  } finally {
    await lease.release();
  }
}

/** @param {OperationContext} context */
async function postgresVolumeIdentity(context) {
  await observeDeployment(context);
  return sha256(
    await checkedCommand(context, {
      executable: "docker",
      argv: [
        "volume",
        "inspect",
        "--format",
        '{"name":{{json .Name}},"driver":{{json .Driver}},"mountpoint":{{json .Mountpoint}},"createdAt":{{json .CreatedAt}},"labels":{{json .Labels}}}',
        `${context.projectName}_postgres_data`,
      ],
      stage: "retained-postgres-volume",
    }),
  );
}
/** @param {OperationContext} context @param {Readonly<{id:string,imageId:string}>} expected */
async function waitRestartedPostgres(context, expected) {
  const deadline = Math.min(context.deadline, Date.now() + 120000);
  while (Date.now() < deadline) {
    await observeDeployment(context);
    const current = context.registry.get("postgres");
    if (
      !current?.running ||
      current.id !== expected.id ||
      current.imageId !== expected.imageId
    )
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "postgres-restart-owner",
      );
    const ready = await context.command({
      executable: "docker",
      argv: [
        "exec",
        current.id,
        "pg_isready",
        `--username=${context.config.bootstrapRole}`,
        `--dbname=${context.config.databaseName}`,
      ],
      stage: "postgres-restart-readiness",
    });
    if (ready.exitCode === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new ReleaseFailure(
    "RELEASE_CHECK_FAILED",
    "postgres-restart-readiness",
  );
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function runRestart(context, args) {
  const lease = await context.files.acquireLock(),
    startedAt = now(context);
  /** @type {ReleaseState|null} */ let state = null;
  let maintenanceAttempted = false;
  try {
    await observeDeployment(context);
    const record = await loadPackage(context);
    state = await loadState(context);
    await assertAuthoritySettled(context);
    assertNoPendingOpening(state);
    await assertCurrentPublication(context, state);
    if (
      state.lastFailure !== null ||
      state.administratorReauthenticationRequired ||
      state.authority === null ||
      (state.phase !== "OPEN" && state.phase !== "ACCEPTANCE")
    )
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "restart-steady-state",
      );
    const selected = state.phase === "OPEN" ? state.active : state.candidate;
    if (
      selected?.revision !== record.revision ||
      selected.applicationImageId !== record.applicationImageId
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "restart-package");
    await healthy(context, record, state.serviceSnapshot);
    if (
      (await observeCaddyMode(context)) !== state.caddyMode ||
      (state.phase === "OPEN"
        ? state.caddyMode !== "normal"
        : state.caddyMode !== "acceptance")
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "restart-mode");
    await checkpointBundle(context, state, record);
    const authority = await currentAdministrator(context, record, state);
    if (
      authority.userId !== state.authority.userId ||
      authority.accessVersion !== state.authority.accessVersion
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "restart-authority-binding",
      );
    const sourceServices = snapshot(context),
      sourceCaddyMode = state.caddyMode,
      backupContext = {
        ...context,
        packageRecord: record,
        authorizationReference: args.authorizationReference ?? "",
        sourceServices,
        sourceCaddyMode,
      };
    const preflight = await readDatabaseFingerprint(backupContext, "postgres");
    if (
      preflight.ledgerAbsent ||
      preflight.migrationFacts.length !== record.migrations.length
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "restart-migration-ledger",
      );
    maintenanceAttempted = true;
    await changeCaddyMode(context, "maintenance");
    await observeCaddyResponse(context, 503);
    await stopApplications(context, sourceServices);
    const before = await readDatabaseFingerprint(backupContext, "postgres"),
      volumeBefore = await postgresVolumeIdentity(context),
      postgres = context.registry.get("postgres");
    if (
      !postgres?.running ||
      postgres.id !== sourceServices.postgres?.id ||
      postgres.imageId !== sourceServices.postgres.imageId
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "restart-postgres-identity",
      );
    await checkedCommand(context, {
      executable: "docker",
      argv: ["restart", "--time", "15", postgres.id],
      stage: "retained-database-restart",
    });
    await waitRestartedPostgres(context, postgres);
    const after = await readDatabaseFingerprint(backupContext, "postgres"),
      volumeAfter = await postgresVolumeIdentity(context);
    if (
      JSON.stringify(before) !== JSON.stringify(after) ||
      volumeBefore !== volumeAfter
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "restart-retained-data",
      );
    for (const role of /** @type {const} */ (["api", "web"])) {
      const current = context.registry.get(role),
        prior = sourceServices[role];
      if (
        !prior?.running ||
        !current ||
        current.running ||
        current.id !== prior.id ||
        current.imageId !== prior.imageId
      )
        throw new ReleaseFailure(
          "RELEASE_TARGET_MISMATCH",
          "restart-application-owner",
        );
      await checkedCommand(context, {
        executable: "docker",
        argv: ["start", current.id],
        stage: "restart-captured-application",
      });
    }
    await healthy(context, record, sourceServices);
    const current = await currentAdministrator(context, record, state);
    if (
      current.userId !== authority.userId ||
      current.accessVersion !== authority.accessVersion ||
      JSON.stringify(
        await readDatabaseFingerprint(backupContext, "postgres"),
      ) !== JSON.stringify(before)
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "restart-current-authority-data",
      );
    await changeCaddyMode(context, sourceCaddyMode);
    const next = parseReleaseState(
        {
          ...state,
          authority: current,
          serviceSnapshot: snapshot(context),
          lastFailure: null,
        },
        recordIdentity(context),
      ),
      fingerprint = sha256(JSON.stringify(before));
    return await publish(context, {
      state: next,
      args,
      startedAt,
      outcome: "COMPLETED",
      checkpointId: state.checkpointId,
      stages: [
        { stage: "database-volume-before", outcome: `sha256:${volumeBefore}` },
        { stage: "database-volume-after", outcome: `sha256:${volumeAfter}` },
        {
          stage: "database-fingerprint-before",
          outcome: `sha256:${fingerprint}`,
        },
        {
          stage: "database-fingerprint-after",
          outcome: `sha256:${sha256(JSON.stringify(after))}`,
        },
        { stage: "current-authority-health", outcome: "VERIFIED" },
      ],
    });
  } catch (failure) {
    if (maintenanceAttempted && state !== null)
      return await failPreparation(context, state, args, startedAt, failure);
    throw failure;
  } finally {
    await lease.release();
  }
}

/** @param {OperationContext} context */
async function currentPointer(context) {
  const base = await lstat(context.paths.base);
  if (
    !base.isDirectory() ||
    base.uid !== privateUid(context) ||
    (await realpath(context.paths.base)) !== context.paths.base ||
    (context.scope === "live" && (base.mode & 0o777) !== 0o700)
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "current-release-directory",
    );
  try {
    const metadata = await lstat(context.paths.current);
    if (
      !metadata.isSymbolicLink() ||
      metadata.uid !== privateUid(context) ||
      metadata.nlink !== 1
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "current-release-pointer",
      );
    return await readlink(context.paths.current);
  } catch (failure) {
    if (
      failure instanceof Error &&
      "code" in failure &&
      failure.code === "ENOENT"
    )
      return null;
    throw failure;
  }
}
/** @param {OperationContext} context @param {string|null} expected @param {string|null} next */
async function replaceCurrentPointer(context, expected, next) {
  await context.files.assertLock();
  if ((await currentPointer(context)) !== expected)
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "current-pointer-changed",
    );
  const temporary = `${context.paths.current}.${context.runId}.partial`;
  try {
    if (next === null) await unlink(context.paths.current);
    else {
      await symlink(next, temporary);
      if ((await currentPointer(context)) !== expected)
        throw new ReleaseFailure(
          "RELEASE_TARGET_MISMATCH",
          "current-pointer-changed",
        );
      await rename(temporary, context.paths.current);
    }
    const directory = await open(context.paths.base, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    try {
      await unlink(temporary);
    } catch (failure) {
      if (!(
        failure instanceof Error &&
        "code" in failure &&
        failure.code === "ENOENT"
      ))
        throw failure;
    }
  }
}
/** @param {OperationContext} context @param {ReleaseState} state */
async function verifiedOpenAdmission(context, state) {
  await assertAuthoritySettled(context);
  assertNoPendingOpening(state);
  if (
    state.phase !== "ACCEPTANCE" ||
    state.lastFailure !== null ||
    state.administratorReauthenticationRequired ||
    state.authority === null ||
    state.caddyMode !== "acceptance"
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "opening-acceptance-state",
    );
  const record = await loadPackage(context);
  if (
    state.candidate?.revision !== record.revision ||
    state.candidate.applicationImageId !== record.applicationImageId
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "opening-candidate");
  await assertCurrentPublication(context, state);
  await healthy(context, record, state.serviceSnapshot);
  if ((await observeCaddyMode(context)) !== "acceptance")
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "opening-mode");
  const evidence = await loadEvidence(context, record);
  for (const [key, value] of Object.entries(evidence.observations))
    if (key !== "scheduledBackup" && value.status !== "PASS")
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "opening-observation-evidence",
      );
  await checkpointBundle(context, state, record);
  const authority = await currentAdministrator(context, record, state);
  if (
    authority.userId !== state.authority.userId ||
    authority.accessVersion !== state.authority.accessVersion ||
    JSON.stringify(authority.provisioningReceipt) !==
      JSON.stringify(state.provisioningReceipt)
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "opening-authority-binding",
    );
  const fingerprint = await readDatabaseFingerprint(
    {
      ...context,
      packageRecord: record,
      authorizationReference: "opening-admission",
      sourceServices: state.serviceSnapshot,
      sourceCaddyMode: "acceptance",
    },
    "postgres",
  );
  if (
    fingerprint.ledgerAbsent ||
    fingerprint.migrationFacts.length !== record.migrations.length
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "opening-migration-ledger",
    );
  await observeTargetTls(context, "/auth/login", [200, 503]);
  return { record, authority };
}
/** @param {OperationContext} context */
async function verifyNormalRouting(context) {
  for (const selectedPath of /** @type {const} */ ([
    "/auth/login",
    "/api/v1/health/live",
    "/api/v1/health/ready",
  ]))
    await observeTargetTls(context, selectedPath, [200]);
}
/** @param {OperationContext} context @param {string} filename */
async function syncPrivateRecord(context, filename) {
  await readPrivateFile(filename, {
    uid: privateUid(context),
    maximumBytes: 1048576,
  });
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  const directory = await open(path.dirname(filename), constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
/** @param {OperationContext} context @param {ReleaseState} state @param {ReturnType<typeof parseOperationReceipt>} receipt @param {PackageRecord} record */
async function reconcileFinalOpening(context, state, receipt, record) {
  if (
    (await context.files.read(context.paths.stateFile)) !==
      JSON.stringify(state) ||
    (await context.files.read(
      `${context.paths.runs}/${context.runId}.json`,
    )) !== JSON.stringify(receipt)
  )
    return false;
  await assertCurrentPublication(context, state);
  if ((await observeCaddyMode(context)) !== "normal") return false;
  await healthy(context, record, state.serviceSnapshot);
  await verifyNormalRouting(context);
  const authority = await currentAdministrator(context, record, state);
  if (
    authority.userId !== state.authority?.userId ||
    authority.accessVersion !== state.authority.accessVersion
  )
    return false;
  await syncPrivateRecord(context, context.paths.stateFile);
  await syncPrivateRecord(
    context,
    `${context.paths.runs}/${context.runId}.json`,
  );
  const parent = await open(context.paths.base, constants.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return true;
}
/** @param {OperationContext} context @param {ReleaseState} prior @param {ReleaseArguments} args @param {string} startedAt @param {string|null} priorPointer @param {Readonly<{filename:string,before:string,after:string}>|null} indexChange @param {unknown} failure */
async function failOpening(
  context,
  prior,
  args,
  startedAt,
  priorPointer,
  indexChange,
  failure,
) {
  let contained = true;
  try {
    await observeDeployment(context);
    if (indexChange !== null) {
      const actual = await readPrivateFile(indexChange.filename, {
        uid: privateUid(context),
        maximumBytes: 1048576,
      });
      if (actual === indexChange.after)
        await writeAtomicPrivate({
          filename: indexChange.filename,
          contents: indexChange.before,
          uid: privateUid(context),
        });
      else if (actual !== indexChange.before)
        throw new ReleaseFailure(
          "RELEASE_STATE_UNCERTAIN",
          "opening-index-changed",
        );
    }
    const pointer = await currentPointer(context);
    if (pointer === context.paths.release && pointer !== priorPointer)
      await replaceCurrentPointer(context, pointer, priorPointer);
    else if (pointer !== priorPointer)
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "opening-pointer-changed",
      );
    const mode = await observeCaddyMode(context);
    if (mode === "normal") await changeCaddyMode(context, "acceptance");
    else if (mode !== "acceptance")
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "opening-mode-changed",
      );
  } catch {
    contained = false;
  }
  const selected = contained
    ? failure instanceof ReleaseFailure
      ? failure
      : new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "opening-publication")
    : new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "opening-containment");
  const failed = parseReleaseState(
    {
      ...prior,
      phase: "UNCERTAIN",
      caddyMode: "acceptance",
      serviceSnapshot: snapshot(context),
      lastFailure: {
        runId: context.runId,
        code: selected.code,
        stage: selected.stage,
        occurredAt: now(context),
      },
    },
    recordIdentity(context),
  );
  await publish(context, {
    state: failed,
    args,
    startedAt,
    outcome: "UNCERTAIN",
    checkpointId: prior.checkpointId,
  });
  throw selected;
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function openTraffic(context, args) {
  const lease = await context.files.acquireLock(),
    startedAt = now(context);
  /** @type {ReleaseState|null} */ let prior = null;
  /** @type {string|null} */ let priorPointer = null;
  /** @type {Readonly<{filename:string,before:string,after:string}>|null} */ let indexChange =
    null;
  let barrierAttempted = false;
  try {
    await observeDeployment(context);
    prior = await loadState(context);
    const admitted = await verifiedOpenAdmission(context, prior);
    const record = admitted.record;
    priorPointer = await currentPointer(context);
    const barrier = parseReleaseState(
      {
        ...prior,
        phase: "UNCERTAIN",
        lastFailure: null,
        updatedAt: now(context),
        lastTransition: {
          runId: context.runId,
          action: "open-traffic",
          stage: "opening-pending",
          startedAt,
          completedAt: null,
          outcome: "IN_PROGRESS",
        },
      },
      recordIdentity(context),
    );
    barrierAttempted = true;
    try {
      await context.files.writeJson(context.paths.stateFile, barrier);
    } catch {
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "opening-barrier-publication",
      );
    }
    await changeCaddyMode(context, "normal");
    await verifyNormalRouting(context);
    await healthy(context, record, prior.serviceSnapshot);
    const authority = await currentAdministrator(context, record, prior);
    if (authority.accessVersion !== admitted.authority.accessVersion)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "opening-authority-changed",
      );
    const source = await sourceIdentity(context);
    if (
      source.sourceSha256 !== record.sourceSha256 ||
      source.lockfileSha256 !== record.lockfileSha256 ||
      source.migrationSetHash !== record.migrationSetHash
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "opening-source-changed",
      );
    const completedAt = now(context);
    const expectedState = parseReleaseState(
      {
        ...prior,
        phase: "OPEN",
        active: record,
        candidate: null,
        caddyMode: "normal",
        authority,
        openingRunId: context.runId,
        serviceSnapshot: snapshot(context),
        lastFailure: null,
        updatedAt: completedAt,
        lastTransition: {
          runId: context.runId,
          action: "open-traffic",
          stage: "completed",
          startedAt,
          completedAt,
          outcome: "COMPLETED",
        },
      },
      recordIdentity(context),
    );
    const expectedReceipt = parseOperationReceipt(
      {
        version: 1,
        ...recordIdentity(context),
        runId: context.runId,
        action: "open-traffic",
        revision: record.revision,
        startedAt,
        completedAt,
        phase: "OPEN",
        outcome: "COMPLETED",
        authorizationReference: args.authorizationReference,
        priorStateReference: context.paths.stateFile,
        nextStateReference: context.paths.stateFile,
        stages: [
          { stage: "public-routing-authority", outcome: "VERIFIED" },
          { stage: "checkpoint", outcome: `backup:${prior.checkpointId}` },
        ],
        remainingGates: ["scheduled-backup", "T048-target-acceptance"],
      },
      recordIdentity(context),
    );
    await replaceCurrentPointer(context, priorPointer, context.paths.release);
    await mkdir(context.paths.runs, { recursive: true, mode: 0o700 });
    await context.files.writeJson(
      `${context.paths.runs}/${context.runId}.json`,
      expectedReceipt,
    );
    try {
      await context.files.writeJson(context.paths.stateFile, expectedState);
    } catch {
      if (
        !(await reconcileFinalOpening(
          context,
          expectedState,
          expectedReceipt,
          record,
        ))
      )
        throw new ReleaseFailure(
          "RELEASE_STATE_UNCERTAIN",
          "opening-final-state",
        );
    }
    const filename = path.join(
        context.config.backupDirectory,
        `${context.config.environmentId}.index.json`,
      ),
      before = await readPrivateFile(filename, {
        uid: privateUid(context),
        maximumBytes: 1048576,
      }),
      index = parseBackupIndex(
        parsePrivateJson(before),
        recordIdentity(context),
      );
    if (index.storageIdentity !== context.config.backupStorageIdentity)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "opening-index-storage",
      );
    const updated = parseBackupIndex(
      {
        ...index,
        entries: index.entries.map((entry) =>
          entry.kind === "predeploy" &&
          entry.protectedForRevision !== record.revision &&
          entry.openedByRevision === null &&
          entry.completedAt < completedAt
            ? {
                ...entry,
                openedByRevision: record.revision,
                openReceiptReference: `run:${context.runId}`,
              }
            : entry,
        ),
      },
      recordIdentity(context),
    );
    const after = JSON.stringify(updated);
    if (after !== before) {
      indexChange = { filename, before, after };
      await writeAtomicPrivate({
        filename,
        contents: after,
        uid: privateUid(context),
      });
    }
    return Object.freeze({
      runId: context.runId,
      action: args.action,
      phase: "OPEN",
      outcome: "COMPLETED",
      evidenceReference: `${context.paths.runs}/${context.runId}.json`,
    });
  } catch (failure) {
    if (barrierAttempted && prior !== null)
      return await failOpening(
        context,
        prior,
        args,
        startedAt,
        priorPointer,
        indexChange,
        failure,
      );
    throw failure;
  } finally {
    await lease.release();
  }
}

/** @param {OperationContext} context */
async function assertEmptyReplacementNamespace(context) {
  for (const kind of /** @type {const} */ ([
    "container",
    "volume",
    "network",
  ])) {
    const found = await checkedCommand(context, {
      executable: "docker",
      argv: [
        kind,
        "ls",
        ...(kind === "container" ? ["--all", "--no-trunc"] : []),
        "--filter",
        `label=com.docker.compose.project=${context.projectName}`,
        "--format",
        kind === "volume" ? "{{.Name}}" : "{{.ID}}",
      ],
      stage: "replacement-empty-namespace",
    });
    if (found.trim() !== "")
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "replacement-existing-namespace",
      );
  }
}
/** @param {OperationContext} context @param {string} backupId */
async function replacementSource(context, backupId) {
  const parent = path.join(context.config.backupDirectory, "recovery-source");
  await admitPrivateDirectory(parent, privateUid(context));
  const directory = path.join(parent, backupId);
  const manifestContents = await readPrivateFile(
    path.join(directory, "manifest.json"),
    { uid: privateUid(context), maximumBytes: 1048576 },
  );
  const manifest = parseBackupManifest(parsePrivateJson(manifestContents));
  const sourceOwner = {
    scope: manifest.scope,
    environmentId: manifest.environmentId,
    projectName: manifest.projectName,
  };
  const index = parseBackupIndex(
    parsePrivateJson(
      await readPrivateFile(
        path.join(parent, `${context.config.environmentId}.index.json`),
        { uid: privateUid(context), maximumBytes: 1048576 },
      ),
    ),
    sourceOwner,
  );
  const entry = index.entries.find((item) => item.id === backupId);
  if (
    !entry ||
    !manifest.verified ||
    manifest.scope !== context.scope ||
    manifest.environmentId !== context.config.environmentId
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "replacement-source-identity",
    );
  if (sha256(manifestContents) !== entry.manifestSha256)
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "replacement-manifest-hash",
    );
  assertBackupEntryBinding(manifest, entry, sourceOwner, index.storageIdentity);
  if (
    context.scope === "live"
      ? manifest.machineIdSha256 === context.config.expectedMachineIdSha256 ||
        manifest.dockerEngineId === context.config.expectedDockerEngineId
      : manifest.projectName === context.projectName
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "replacement-distinct-target",
    );
  const reader = {
    ...context,
    config: { ...context.config, backupDirectory: parent },
  };
  const archive = await verifyBackupFiles(reader, { directory, manifest });
  const sourceConfig = parseReleaseConfig(
    parsePrivateJson(
      await readPrivateFile(path.join(directory, "release.json"), {
        uid: privateUid(context),
        maximumBytes: 1048576,
      }),
    ),
  );
  const privatePackage = parsePackageRecord(
    parsePrivateJson(
      await readPrivateFile(path.join(directory, "package.json"), {
        uid: privateUid(context),
        maximumBytes: 1048576,
      }),
    ),
  );
  if (
    JSON.stringify(privatePackage) !== JSON.stringify(manifest.packageRecord) ||
    sourceConfig.environmentId !== manifest.environmentId ||
    sourceConfig.releaseRevision !== manifest.packageRecord.revision ||
    sourceConfig.databaseName !== context.config.databaseName ||
    sourceConfig.applicationRole !== context.config.applicationRole ||
    sourceConfig.expectedMachineIdSha256 !== manifest.machineIdSha256 ||
    sourceConfig.expectedDockerEngineId !== manifest.dockerEngineId ||
    sourceConfig.nodeImage !== context.config.nodeImage ||
    sourceConfig.postgresImage !== context.config.postgresImage ||
    sourceConfig.caddyImage !== context.config.caddyImage
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "replacement-source-config",
    );
  const source = await sourceIdentity(context),
    record = manifest.packageRecord;
  if (
    source.revision !== record.revision ||
    source.sourceSha256 !== record.sourceSha256 ||
    source.lockfileSha256 !== record.lockfileSha256 ||
    source.migrationSetHash !== record.migrationSetHash
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "replacement-reviewed-source",
    );
  return { parent, directory, manifest, archive };
}
/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function recoverReplacement(context, args) {
  const lease = await context.files.acquireLock(),
    startedAt = now(context);
  /** @type {ReleaseState|null} */ let state = null;
  let mutationAttempted = false;
  try {
    await observeDeployment(context);
    state = await stateOrInitial(context);
    if (
      args.backupId === null ||
      state.phase !== "UNPREPARED" ||
      state.active !== null ||
      state.candidate !== null ||
      state.checkpointId !== null ||
      state.lastFailure !== null
    )
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "replacement-initial-state",
      );
    await assertAuthoritySettled(context);
    await assertCurrentPublication(context, state);
    await assertEmptyReplacementNamespace(context);
    const source = await replacementSource(context, args.backupId);
    /** @type {PackageRecord} */ let record;
    try {
      record = await loadPackage(context);
    } catch (failure) {
      if (!(
        failure instanceof Error &&
        "code" in failure &&
        failure.code === "ENOENT"
      ))
        throw failure;
      record = await buildPackageUnderLease(context);
    }
    if (
      record.architecture !== source.manifest.packageRecord.architecture ||
      JSON.stringify(record.bases) !==
        JSON.stringify(source.manifest.packageRecord.bases)
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "replacement-package-bases",
      );
    try {
      const evidence = await loadEvidence(context, record);
      for (const key of [
        "backend",
        "frontend",
        "browser",
        "localOperations",
        "requirementsReview",
        "engineeringReview",
      ])
        if (evidence.observations[key]?.status !== "PASS")
          throw new ReleaseFailure(
            "RELEASE_ADMISSION_MISSING",
            "local-acceptance-evidence",
          );
    } catch (failure) {
      if (
        failure instanceof ReleaseFailure &&
        failure.code !== "RELEASE_ADMISSION_MISSING" &&
        failure.stage !== "operator-evidence-binding"
      )
        throw failure;
      if (
        !(failure instanceof ReleaseFailure) &&
        !(
          failure instanceof Error &&
          "code" in failure &&
          failure.code === "ENOENT"
        )
      )
        throw failure;
      return Object.freeze({
        runId: context.runId,
        action: args.action,
        phase: "PACKAGED",
        outcome: "AWAITING_OPERATOR",
        evidenceReference: `${context.paths.packages}/${record.revision}.json`,
      });
    }
    const runtime = await runtimeEnvironment(context);
    mutationAttempted = true;
    state = parseReleaseState(
      {
        ...state,
        phase: "MAINTENANCE",
        candidate: record,
        caddyMode: "maintenance",
        updatedAt: now(context),
        lastTransition: {
          runId: context.runId,
          action: args.action,
          stage: "replacement-maintenance",
          startedAt,
          completedAt: null,
          outcome: "IN_PROGRESS",
        },
      },
      recordIdentity(context),
    );
    await context.files.writeJson(context.paths.stateFile, state);
    await ensureMaintenanceCaddy(context, record);
    await ensurePostgres(context, record);
    await initializeApplicationDatabase(context, runtime);
    const backupContext = {
      ...context,
      packageRecord: record,
      authorizationReference: args.authorizationReference ?? "",
      sourceServices: snapshot(context),
      sourceCaddyMode: /** @type {const} */ ("maintenance"),
    };
    const empty = await readDatabaseFingerprint(backupContext, "postgres");
    if (empty.classification !== "FRESH_EMPTY")
      throw new ReleaseFailure(
        "RELEASE_ADMISSION_MISSING",
        "replacement-nonempty-database",
      );
    const postgres = context.registry.get("postgres");
    if (!postgres?.running)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "replacement-postgres",
      );
    const handle = await open(
      source.archive,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const restoring = openDockerStream(context, {
        argv: [
          "exec",
          "-i",
          postgres.id,
          "pg_restore",
          "--exit-on-error",
          "--single-transaction",
          "--no-owner",
          "--no-acl",
          `--role=${context.config.applicationRole}`,
          `--username=${context.config.bootstrapRole}`,
          `--dbname=${context.config.databaseName}`,
        ],
        stage: "replacement-archive-restore",
      });
      try {
        await Promise.all([
          pipeline(
            handle.createReadStream({ autoClose: false }),
            restoring.stdin,
          ),
          restoring.completion,
        ]);
      } finally {
        restoring.cancel();
      }
    } finally {
      await handle.close();
    }
    const restored = await readDatabaseFingerprint(backupContext, "postgres");
    if (JSON.stringify(restored) !== JSON.stringify(source.manifest.before))
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "replacement-restored-fingerprint",
      );
    await verifyBackupFiles(
      {
        ...context,
        config: { ...context.config, backupDirectory: source.parent },
      },
      { directory: source.directory, manifest: source.manifest },
    );
    const prepared = await prepareUnderLease(
      context,
      args,
      record,
      state,
      startedAt,
    );
    const accepted = await loadState(context);
    await publish(context, {
      state: accepted,
      args,
      startedAt,
      outcome: "AWAITING_OPERATOR",
      checkpointId: accepted.checkpointId,
      stages: [
        { stage: "source-backup", outcome: `backup:${source.manifest.id}` },
        {
          stage: "recovery-duration-ms",
          outcome: String(context.clock() - Date.parse(startedAt)),
        },
        { stage: "forward-acceptance", outcome: prepared.outcome },
      ],
    });
    return Object.freeze({
      runId: context.runId,
      action: args.action,
      phase: "ACCEPTANCE",
      outcome: "AWAITING_OPERATOR",
      evidenceReference: `${context.paths.runs}/${context.runId}.json`,
    });
  } catch (failure) {
    if (mutationAttempted && state !== null)
      return await failPreparation(
        context,
        await loadState(context),
        args,
        startedAt,
        failure,
      );
    throw failure;
  } finally {
    await lease.release();
  }
}

/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function observeReleaseState(context, args) {
  await observeDeployment(context);
  const state = await stateOrInitial(context),
    journal = await authorityJournal(context);
  const uncertain =
    journal !== null ||
    state.phase === "UNCERTAIN" ||
    state.lastFailure !== null ||
    state.administratorReauthenticationRequired;
  return Object.freeze({
    runId: context.runId,
    action: args.action,
    phase: uncertain ? "UNCERTAIN" : state.phase,
    outcome: uncertain
      ? "UNCERTAINTY_RECORDED_NOT_CLEARED"
      : "OBSERVED_NOT_ACCEPTED",
    evidenceReference: null,
  });
}
