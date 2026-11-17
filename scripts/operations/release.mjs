import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  ReleaseFailure,
  deriveReleasePaths,
  parsePrivateJson,
  parseRawEnvironment,
  parseReleaseArguments,
  parseReleaseConfig,
  validateReleaseEnvironment,
} from "./release-config.mjs";
import {
  createOperationContext,
  changeCaddyMode,
  readPrivateFile,
  validatePrivateLocations,
} from "./operation-runtime.mjs";
import {
  runBackup,
  installBackupTimer,
  runPrepare,
  observeAdministrator,
  applyAdministrator,
  runRestart,
  recoverReplacement,
  openTraffic,
  observeReleaseState,
} from "./release-lifecycle.mjs";
import { packageRelease } from "./release-package.mjs";
export { createOperationContext, changeCaddyMode };
/** @typedef {import('./release-config.mjs').ReleaseConfig} ReleaseConfig */
/** @typedef {import('./release-config.mjs').ReleaseArguments} ReleaseArguments */
/** @typedef {import('./operation-runtime.mjs').OperationContext} OperationContext */
/** @typedef {Readonly<{action:ReleaseArguments['action'],environmentId:string,revision:string,steps:readonly Readonly<{stage:string,safeSummary:string}>[],requiredAuthorizations:readonly string[]}>} ReleasePlan */
const actionStages = Object.freeze({
  inspect: ["admit-host", "observe-private-resources"],
  package: [
    "admit-host",
    "freeze-reviewed-source",
    "build-pinned-image",
    "record-package",
  ],
  backup: [
    "admit-host",
    "verify-storage",
    "stop-writers",
    "dump-and-verify",
    "restore-and-restart",
    "retain-verified",
  ],
  prepare: [
    "admit-host",
    "maintenance",
    "verified-checkpoint",
    "inspect-ledger",
    "forward-migrate",
    "acceptance",
  ],
  "admin-preview": [
    "admit-host",
    "observe-authority",
    "preview-restricted-provisioning",
  ],
  "admin-apply": [
    "admit-host",
    "observe-authority-and-receipt",
    "restricted-provisioning",
    "await-reauthentication",
  ],
  restart: [
    "admit-host",
    "verify-steady-state",
    "maintenance",
    "restart-prior-services",
    "verify-persistence",
  ],
  "recover-replacement": [
    "admit-new-empty-target",
    "verify-source-bundle",
    "repackage-reviewed-source",
    "restore-distinct-target",
    "forward-prepare",
    "await-dns-handoff",
  ],
  "open-traffic": [
    "admit-host",
    "verify-bound-evidence",
    "observe-health-and-authority",
    "reload-normal",
    "publish-open",
  ],
  "install-backup-timer": [
    "admit-host",
    "verify-daily-demonstration",
    "verify-systemd-units",
    "install-standing-timer",
    "observe-result",
  ],
});

/** @param {ReleaseConfig} config @param {ReleaseArguments} args @returns {ReleasePlan} */
export function planReleaseAction(config, args) {
  validateConfirmations(config, args);
  if (
    ["admin-preview", "admin-apply", "open-traffic"].includes(args.action) &&
    config.initialAdministrator.userId === null
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "administrator-binding",
    );
  return Object.freeze({
    action: args.action,
    environmentId: config.environmentId,
    revision: config.releaseRevision,
    steps: Object.freeze(
      actionStages[args.action].map((stage) =>
        Object.freeze({ stage, safeSummary: stage.replaceAll("-", " ") }),
      ),
    ),
    requiredAuthorizations: Object.freeze(
      args.scheduled
        ? ["standing-daily-backup"]
        : args.mode === "apply"
          ? ["explicit-environment-action"]
          : ["execution-not-authorized-by-preview"],
    ),
  });
}

/** @param {ReleaseConfig} config @param {ReleaseArguments} args */
function validateConfirmations(config, args) {
  if (args.mode !== "apply") return;
  if (args.confirmEnvironment !== config.environmentId)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "confirm-environment");
  if (
    args.action === "admin-apply" &&
    args.confirmUser !== config.initialAdministrator.userId
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "confirm-user");
  if (
    args.action === "recover-replacement" &&
    args.confirmRestore !==
      `${config.environmentId}:${config.projectName}:${config.databaseName}`
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "confirm-restore");
}

/** @param {OperationContext} context @param {ReleaseArguments} args */
export async function runReleaseAction(context, args) {
  const plan = planReleaseAction(context.config, args);
  if (args.mode === "preview") return plan;
  if (args.action === "inspect" && args.mode === "observe")
    return observeReleaseState(context, args);
  if (args.action === "admin-preview" && args.mode === "observe")
    return observeAdministrator(context, args);
  if (args.action === "prepare" && args.mode === "apply")
    return runPrepare(context, args);
  if (args.action === "admin-apply" && args.mode === "apply")
    return applyAdministrator(context, args);
  if (args.action === "restart" && args.mode === "apply")
    return runRestart(context, args);
  if (args.action === "recover-replacement" && args.mode === "apply")
    return recoverReplacement(context, args);
  if (args.action === "open-traffic" && args.mode === "apply")
    return openTraffic(context, args);
  if (args.action === "package" && args.mode === "apply")
    return packageRelease(context);
  if (args.action === "backup" && args.mode === "apply")
    return runBackup(context, args);
  if (args.action === "install-backup-timer" && args.mode === "apply")
    return installBackupTimer(context, args);
  throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "action-handler");
}

/** @param {readonly string[]} argv @returns {Promise<number>} */
export async function main(argv) {
  const runId = randomUUID();
  try {
    const args = parseReleaseArguments(argv);
    const contents = await readPrivateFile(args.configFile, {
      uid: 0,
      maximumBytes: 1048576,
    });
    const config = parseReleaseConfig(parsePrivateJson(contents));
    if (args.configFile !== deriveReleasePaths(config).config)
      throw new ReleaseFailure(
        "RELEASE_INPUT_INVALID",
        "canonical-config-path",
      );
    validatePrivateLocations(
      config,
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    );
    const [runtime, postgres] = await Promise.all([
      readPrivateFile(config.runtimeEnvFile, { uid: 0, maximumBytes: 1048576 }),
      readPrivateFile(config.postgresEnvFile, {
        uid: 0,
        maximumBytes: 1048576,
      }),
    ]);
    validateReleaseEnvironment(
      config,
      parseRawEnvironment(runtime),
      parseRawEnvironment(postgres),
    );
    const context = await createOperationContext(config, {
      scope: "live",
      runId,
      deadline: Date.now() + 1800000,
    });
    const operation = await runReleaseAction(context, args);
    process.stdout.write(`${JSON.stringify(operation)}\n`);
    return 0;
  } catch (failure) {
    // CLI errors deliberately classify private I/O/child failures without echoing input.
    const safeFailure =
      failure instanceof ReleaseFailure
        ? failure
        : new ReleaseFailure("RELEASE_CHECK_FAILED", "private-input");
    process.stderr.write(
      `${JSON.stringify({ code: safeFailure.code, stage: safeFailure.stage, runId })}\n`,
    );
    return safeFailure.exitCode;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await main(process.argv.slice(2));
