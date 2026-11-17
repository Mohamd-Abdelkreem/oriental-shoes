import { createHash } from "node:crypto";
import { ReleaseFailure } from "./release-config.mjs";

/** @typedef {'live'|'isolated'} Scope */
/** @typedef {Readonly<{scope:Scope,environmentId:string,projectName:string}>} RecordIdentity */

/** @param {boolean} accepted @param {string} stage @returns {asserts accepted} */
function requireRecord(accepted, stage) {
  if (!accepted) throw new ReleaseFailure("RELEASE_INPUT_INVALID", stage);
}
/** @param {unknown} input @param {readonly string[]} keys @param {string} stage @returns {Record<string,unknown>} */
function object(input, keys, stage) {
  requireRecord(
    typeof input === "object" && input !== null && !Array.isArray(input),
    stage,
  );
  const record = /** @type {Record<string,unknown>} */ (input);
  requireRecord(
    Object.keys(record).length === keys.length &&
      keys.every((key) => Object.hasOwn(record, key)),
    stage,
  );
  return record;
}
/** @param {unknown} input @param {string} stage @param {number} [limit] */
function text(input, stage, limit = 4096) {
  requireRecord(
    typeof input === "string" &&
      input.length > 0 &&
      input.length <= limit &&
      !/[\u0000-\u001f\u007f]/u.test(input),
    stage,
  );
  return input;
}
/** @param {unknown} input @param {RegExp} pattern @param {string} stage */
function matching(input, pattern, stage) {
  const parsed = text(input, stage);
  requireRecord(pattern.test(parsed), stage);
  return parsed;
}
/** @template {string} T @param {unknown} input @param {readonly T[]} choices @param {string} stage @returns {T} */
function choice(input, choices, stage) {
  const selected = choices.find((entry) => entry === input);
  requireRecord(selected !== undefined, stage);
  return selected;
}
/** @param {unknown} input @param {string} stage */
function boolean(input, stage) {
  requireRecord(typeof input === "boolean", stage);
  return input;
}
/** @param {unknown} input @param {string} stage */
function integer(input, stage) {
  requireRecord(
    typeof input === "number" && Number.isSafeInteger(input) && input >= 0,
    stage,
  );
  return input;
}
/** @template T @param {unknown} input @param {(entry:unknown)=>T} parse @param {string} stage @returns {readonly T[]} */
function array(input, parse, stage) {
  requireRecord(Array.isArray(input) && input.length <= 4096, stage);
  return Object.freeze(input.map(parse));
}
/** @template T @param {unknown} input @param {(entry:unknown)=>T} parse @returns {T|null} */
function nullable(input, parse) {
  return input === null ? null : parse(input);
}
/** @param {unknown} input */
function uuid(input) {
  return matching(
    input,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    "record-uuid",
  );
}
/** @param {unknown} input */
function hash(input) {
  return matching(input, /^[0-9a-f]{64}$/u, "record-hash");
}
/** @param {unknown} input */
function revision(input) {
  return matching(input, /^[0-9a-f]{40}$/u, "record-revision");
}
/** @param {unknown} input */
function imageId(input) {
  return matching(input, /^sha256:[0-9a-f]{64}$/u, "record-image");
}
/** @param {unknown} input */
function decimal(input) {
  return matching(input, /^(?:0|[1-9][0-9]*)$/u, "record-count");
}
/** @param {unknown} input */
function identifier(input) {
  return matching(input, /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u, "record-identifier");
}
/** @param {unknown} input */
function reference(input) {
  const parsed = text(input, "record-reference", 128);
  requireRecord(
    /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(parsed),
    "record-reference",
  );
  return parsed;
}
/** @param {unknown} input */
function utc(input) {
  const parsed = text(input, "record-time", 24);
  const date = new Date(parsed);
  requireRecord(
    Number.isFinite(date.getTime()) && date.toISOString() === parsed,
    "record-time",
  );
  return parsed;
}
/** @param {unknown} input */
function businessDate(input) {
  const parsed = matching(
    input,
    /^\d{4}-\d{2}-\d{2}$/u,
    "record-business-date",
  );
  const instant = Date.parse(`${parsed}T00:00:00.000Z`);
  requireRecord(
    Number.isFinite(instant) &&
      new Date(instant).toISOString().slice(0, 10) === parsed,
    "record-business-date",
  );
  return parsed;
}
/** @param {unknown} input */
function version(input) {
  requireRecord(input === 1, "record-version");
  return /** @type {const} */ (1);
}
/** @param {Record<string,unknown>} record @returns {RecordIdentity} */
function identity(record) {
  const scope = choice(record["scope"], ["live", "isolated"], "record-scope");
  const environmentId = matching(
    record["environmentId"],
    /^[a-z][a-z0-9-]{0,39}$/u,
    "record-environment",
  );
  const projectName = text(record["projectName"], "record-project", 100);
  requireRecord(
    scope === "live"
      ? projectName === `oriental-shoes-${environmentId}`
      : /^p08-ops-test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          projectName,
        ),
    "record-project",
  );
  return Object.freeze({ scope, environmentId, projectName });
}
/** @param {RecordIdentity} actual @param {RecordIdentity} expected */
export function assertRecordIdentity(actual, expected) {
  if (
    actual.scope !== expected.scope ||
    actual.environmentId !== expected.environmentId ||
    actual.projectName !== expected.projectName
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "record-identity");
}
/** @param {Readonly<{scope:Scope,projectName:string,config:Readonly<{environmentId:string}>}>} context @returns {RecordIdentity} */
export function recordIdentity(context) {
  return Object.freeze({
    scope: context.scope,
    environmentId: context.config.environmentId,
    projectName: context.projectName,
  });
}
/** @param {readonly string[]} keys @param {string} stage */
function sortedUnique(keys, stage) {
  requireRecord(
    keys.every(
      (entry, index) => index === 0 || (keys[index - 1] ?? "") < entry,
    ),
    stage,
  );
}

/** @param {unknown} input */
export function parsePackageRecord(input) {
  const record = object(
    input,
    [
      "version",
      "scope",
      "environmentId",
      "projectName",
      "runId",
      "buildId",
      "imageReference",
      "packagedAt",
      "revision",
      "sourceSha256",
      "lockfileSha256",
      "migrationSetHash",
      "migrations",
      "tableInventoryByPrefix",
      "publicApiOrigin",
      "applicationImageId",
      "architecture",
      "bases",
      "machineEngineObservation",
    ],
    "package-record",
  );
  const owner = identity(record),
    sourceRevision = revision(record["revision"]),
    buildId = uuid(record["buildId"]);
  const imageReference = text(record["imageReference"], "package-reference");
  requireRecord(
    imageReference === `${owner.projectName}-app:${sourceRevision}-${buildId}`,
    "package-reference",
  );
  const migrations = array(
    record["migrations"],
    (entry) => {
      const migration = object(entry, ["name", "sha256"], "package-migration");
      return Object.freeze({
        name: matching(
          migration["name"],
          /^\d{14}_[a-z0-9_]+$/u,
          "package-migration",
        ),
        sha256: hash(migration["sha256"]),
      });
    },
    "package-migrations",
  );
  requireRecord(migrations.length > 0, "package-migrations");
  sortedUnique(
    migrations.map((entry) => entry.name),
    "package-migrations",
  );
  const migrationSetHash = hash(record["migrationSetHash"]);
  requireRecord(
    createHash("sha256").update(JSON.stringify(migrations)).digest("hex") ===
      migrationSetHash,
    "package-migration-hash",
  );
  const inventory = array(
    record["tableInventoryByPrefix"],
    (entry) => {
      const prefix = object(
        entry,
        ["completedMigrations", "tables"],
        "package-inventory",
      );
      const tables = array(prefix["tables"], identifier, "package-tables");
      sortedUnique(tables, "package-tables");
      requireRecord(tables.includes("_prisma_migrations"), "package-tables");
      return Object.freeze({
        completedMigrations: integer(
          prefix["completedMigrations"],
          "package-prefix",
        ),
        tables,
      });
    },
    "package-inventory",
  );
  requireRecord(
    inventory.length === migrations.length + 1 &&
      inventory.every((entry, index) => entry.completedMigrations === index),
    "package-inventory",
  );
  const architecture = matching(
    record["architecture"],
    /^[a-z0-9_]+$/u,
    "package-architecture",
  );
  const bases = array(
    record["bases"],
    (entry) => {
      const base = object(
        entry,
        ["reference", "id", "architecture"],
        "package-base",
      );
      const reference = text(base["reference"], "package-base");
      requireRecord(
        /^(?:node:24-bookworm|postgres:18\.4|caddy:2)@sha256:[0-9a-f]{64}$/u.test(
          reference,
        ),
        "package-base",
      );
      requireRecord(
        base["architecture"] === architecture,
        "package-architecture",
      );
      return Object.freeze({
        reference,
        id: imageId(base["id"]),
        architecture,
      });
    },
    "package-bases",
  );
  requireRecord(
    bases.length === 3 &&
      bases[0]?.reference.startsWith("node:") === true &&
      bases[1]?.reference.startsWith("postgres:") === true &&
      bases[2]?.reference.startsWith("caddy:") === true,
    "package-bases",
  );
  const observed = object(
    record["machineEngineObservation"],
    ["engine", "architecture", "composeVersion", "availableDiskBytes"],
    "package-observation",
  );
  const publicApiOrigin = text(record["publicApiOrigin"], "package-origin");
  requireRecord(
    /^https:\/\/[a-z0-9.-]+\/api\/v1$/u.test(publicApiOrigin),
    "package-origin",
  );
  return Object.freeze({
    version: version(record["version"]),
    ...owner,
    runId: uuid(record["runId"]),
    buildId,
    imageReference,
    packagedAt: utc(record["packagedAt"]),
    revision: sourceRevision,
    sourceSha256: hash(record["sourceSha256"]),
    lockfileSha256: hash(record["lockfileSha256"]),
    migrationSetHash,
    migrations,
    tableInventoryByPrefix: inventory,
    publicApiOrigin,
    applicationImageId: imageId(record["applicationImageId"]),
    architecture,
    bases,
    machineEngineObservation: Object.freeze({
      engine: reference(observed["engine"]),
      architecture: matching(
        observed["architecture"],
        /^[A-Za-z0-9_]+$/u,
        "package-observation",
      ),
      composeVersion: matching(
        observed["composeVersion"],
        /^\d+\.\d+\.\d+$/u,
        "package-observation",
      ),
      availableDiskBytes: decimal(observed["availableDiskBytes"]),
    }),
  });
}
/** @typedef {ReturnType<typeof parsePackageRecord>} PackageRecord */

/** @param {unknown} input */
function capturedService(input) {
  const record = object(
    input,
    ["id", "imageId", "running"],
    "service-snapshot",
  );
  return Object.freeze({
    id: matching(record["id"], /^[0-9a-f]{64}$/u, "service-id"),
    imageId: imageId(record["imageId"]),
    running: boolean(record["running"], "service-running"),
  });
}
/** @param {unknown} input */
export function parseServiceSnapshot(input) {
  const services = object(
    input,
    ["api", "web", "postgres", "caddy"],
    "service-snapshot",
  );
  return Object.freeze({
    api: nullable(services["api"], capturedService),
    web: nullable(services["web"], capturedService),
    postgres: nullable(services["postgres"], capturedService),
    caddy: nullable(services["caddy"], capturedService),
  });
}
/** @typedef {ReturnType<typeof parseServiceSnapshot>} ServiceSnapshot */

/** @param {unknown} input */
function provisioningReceipt(input) {
  const record = object(
    input,
    [
      "targetId",
      "beforeVersion",
      "afterVersion",
      "occurredAt",
      "operatorReference",
    ],
    "provisioning-receipt",
  );
  const beforeVersion = integer(record["beforeVersion"], "authority-version"),
    afterVersion = integer(record["afterVersion"], "authority-version");
  requireRecord(
    afterVersion === beforeVersion + 1 && afterVersion <= 2147483647,
    "authority-version",
  );
  return Object.freeze({
    targetId: uuid(record["targetId"]),
    beforeVersion,
    afterVersion,
    occurredAt: utc(record["occurredAt"]),
    operatorReference: reference(record["operatorReference"]),
  });
}
/** @param {unknown} input */
function authority(input) {
  const record = object(
    input,
    [
      "userId",
      "email",
      "accessVersion",
      "observedAt",
      "source",
      "provisioningReceipt",
    ],
    "authority",
  );
  requireRecord(record["source"] === "users-me", "authority-source");
  const accessVersion = integer(record["accessVersion"], "authority-version");
  requireRecord(accessVersion <= 2147483647, "authority-version");
  const userId = uuid(record["userId"]),
    receipt = nullable(record["provisioningReceipt"], provisioningReceipt);
  requireRecord(
    receipt === null ||
      (receipt.targetId === userId && receipt.afterVersion <= accessVersion),
    "authority-receipt",
  );
  return Object.freeze({
    userId,
    email: matching(
      record["email"],
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/u,
      "authority-email",
    ),
    accessVersion,
    observedAt: utc(record["observedAt"]),
    source: /** @type {const} */ ("users-me"),
    provisioningReceipt: receipt,
  });
}
/** @param {unknown} input */
function transition(input) {
  const record = object(
    input,
    ["runId", "action", "stage", "startedAt", "completedAt", "outcome"],
    "transition",
  );
  return Object.freeze({
    runId: uuid(record["runId"]),
    action: reference(record["action"]),
    stage: reference(record["stage"]),
    startedAt: utc(record["startedAt"]),
    completedAt: nullable(record["completedAt"], utc),
    outcome: reference(record["outcome"]),
  });
}
/** @param {unknown} input */
function failure(input) {
  const record = object(
    input,
    ["runId", "code", "stage", "occurredAt"],
    "failure",
  );
  return Object.freeze({
    runId: uuid(record["runId"]),
    code: choice(
      record["code"],
      [
        "RELEASE_INPUT_INVALID",
        "RELEASE_ADMISSION_MISSING",
        "RELEASE_TARGET_MISMATCH",
        "RELEASE_CHECK_FAILED",
        "RELEASE_STATE_UNCERTAIN",
      ],
      "failure-code",
    ),
    stage: reference(record["stage"]),
    occurredAt: utc(record["occurredAt"]),
  });
}

/** @param {unknown} input @param {RecordIdentity} expected */
export function parseReleaseState(input, expected) {
  const record = object(
    input,
    [
      "version",
      "scope",
      "environmentId",
      "projectName",
      "phase",
      "active",
      "candidate",
      "caddyMode",
      "serviceSnapshot",
      "checkpointId",
      "openingRunId",
      "authority",
      "provisioningReceipt",
      "administratorReauthenticationRequired",
      "lastTransition",
      "lastFailure",
      "updatedAt",
    ],
    "release-state",
  );
  const owner = identity(record);
  assertRecordIdentity(owner, expected);
  const active = nullable(record["active"], parsePackageRecord),
    candidate = nullable(record["candidate"], parsePackageRecord);
  for (const packageRecord of [active, candidate])
    if (packageRecord !== null) assertRecordIdentity(packageRecord, owner);
  const observedAuthority = nullable(record["authority"], authority),
    receipt = nullable(record["provisioningReceipt"], provisioningReceipt);
  requireRecord(
    observedAuthority?.provisioningReceipt === null ||
      observedAuthority === null ||
      JSON.stringify(observedAuthority.provisioningReceipt) ===
        JSON.stringify(receipt),
    "state-provisioning-receipt",
  );
  requireRecord(
    receipt === null ||
      observedAuthority === null ||
      receipt.targetId === observedAuthority.userId,
    "state-provisioning-target",
  );
  const services = object(
    record["serviceSnapshot"],
    ["api", "web", "postgres", "caddy"],
    "service-snapshot",
  );
  return Object.freeze({
    version: version(record["version"]),
    ...owner,
    phase: choice(
      record["phase"],
      [
        "UNPREPARED",
        "PACKAGED",
        "MAINTENANCE",
        "ACCEPTANCE",
        "OPEN",
        "UNCERTAIN",
      ],
      "release-phase",
    ),
    active,
    candidate,
    caddyMode: choice(
      record["caddyMode"],
      ["normal", "maintenance", "acceptance"],
      "caddy-mode",
    ),
    serviceSnapshot: Object.freeze({
      api: nullable(services["api"], capturedService),
      web: nullable(services["web"], capturedService),
      postgres: nullable(services["postgres"], capturedService),
      caddy: nullable(services["caddy"], capturedService),
    }),
    checkpointId: nullable(record["checkpointId"], uuid),
    openingRunId: nullable(record["openingRunId"], uuid),
    authority: observedAuthority,
    provisioningReceipt: receipt,
    administratorReauthenticationRequired: boolean(
      record["administratorReauthenticationRequired"],
      "authority-reauthentication",
    ),
    lastTransition: nullable(record["lastTransition"], transition),
    lastFailure: nullable(record["lastFailure"], failure),
    updatedAt: utc(record["updatedAt"]),
  });
}
/** @typedef {ReturnType<typeof parseReleaseState>} ReleaseState */
/** @param {RecordIdentity} owner @param {number} now @returns {ReleaseState} */
export function initialReleaseState(owner, now) {
  return Object.freeze({
    version: 1,
    ...owner,
    phase: "UNPREPARED",
    active: null,
    candidate: null,
    caddyMode: "maintenance",
    serviceSnapshot: Object.freeze({
      api: null,
      web: null,
      postgres: null,
      caddy: null,
    }),
    checkpointId: null,
    openingRunId: null,
    authority: null,
    provisioningReceipt: null,
    administratorReauthenticationRequired: false,
    lastTransition: null,
    lastFailure: null,
    updatedAt: new Date(now).toISOString(),
  });
}

/** @param {unknown} input */
export function parseDatabaseFingerprint(input) {
  const record = object(
    input,
    ["classification", "ledgerAbsent", "tables", "migrationFacts", "ownership"],
    "database-fingerprint",
  );
  const classification = choice(
      record["classification"],
      ["FRESH_EMPTY", "MIGRATED"],
      "database-classification",
    ),
    ledgerAbsent = boolean(record["ledgerAbsent"], "database-ledger");
  const tables = array(
    record["tables"],
    (entry) => {
      const table = object(
        entry,
        ["table", "rowCount", "sha256"],
        "table-fingerprint",
      );
      return Object.freeze({
        table: identifier(table["table"]),
        rowCount: decimal(table["rowCount"]),
        sha256: hash(table["sha256"]),
      });
    },
    "table-fingerprints",
  );
  sortedUnique(
    tables.map((entry) => entry.table),
    "table-fingerprints",
  );
  const migrationFacts = array(
    record["migrationFacts"],
    (entry) => {
      const migration = object(
        entry,
        ["name", "checksum", "finishedAt"],
        "migration-fact",
      );
      return Object.freeze({
        name: matching(
          migration["name"],
          /^\d{14}_[a-z0-9_]+$/u,
          "migration-name",
        ),
        checksum: hash(migration["checksum"]),
        finishedAt: utc(migration["finishedAt"]),
      });
    },
    "migration-facts",
  );
  sortedUnique(
    migrationFacts.map((entry) => entry.name),
    "migration-facts",
  );
  const rawOwner = object(
    record["ownership"],
    [
      "databaseOwner",
      "applicationRole",
      "superuser",
      "createDatabase",
      "createRole",
      "replication",
      "tableOwners",
    ],
    "database-ownership",
  );
  const tableOwners = array(
    rawOwner["tableOwners"],
    (entry) => {
      const table = object(entry, ["table", "owner"], "table-owner");
      return Object.freeze({
        table: identifier(table["table"]),
        owner: identifier(table["owner"]),
      });
    },
    "table-owners",
  );
  sortedUnique(
    tableOwners.map((entry) => entry.table),
    "table-owners",
  );
  const applicationRole = identifier(rawOwner["applicationRole"]),
    databaseOwner = identifier(rawOwner["databaseOwner"]);
  const ownership = Object.freeze({
    databaseOwner,
    applicationRole,
    superuser: boolean(rawOwner["superuser"], "database-role"),
    createDatabase: boolean(rawOwner["createDatabase"], "database-role"),
    createRole: boolean(rawOwner["createRole"], "database-role"),
    replication: boolean(rawOwner["replication"], "database-role"),
    tableOwners,
  });
  requireRecord(
    databaseOwner === applicationRole &&
      !ownership.superuser &&
      !ownership.createDatabase &&
      !ownership.createRole &&
      !ownership.replication &&
      tableOwners.length === tables.length &&
      tableOwners.every(
        (entry, index) =>
          entry.table === tables[index]?.table &&
          entry.owner === applicationRole,
      ),
    "database-ownership",
  );
  requireRecord(
    classification === "FRESH_EMPTY"
      ? ledgerAbsent && tables.length === 0 && migrationFacts.length === 0
      : !ledgerAbsent &&
          tables.some((entry) => entry.table === "_prisma_migrations"),
    "database-classification",
  );
  return Object.freeze({
    classification,
    ledgerAbsent,
    tables,
    migrationFacts,
    ownership,
  });
}
/** @typedef {ReturnType<typeof parseDatabaseFingerprint>} DatabaseFingerprint */

/** @param {unknown} input */
export function parseBackupManifest(input) {
  const record = object(
    input,
    [
      "version",
      "scope",
      "id",
      "environmentId",
      "projectName",
      "kind",
      "businessDate",
      "runId",
      "operatorReference",
      "authorizationReference",
      "storageIdentity",
      "machineIdSha256",
      "dockerEngineId",
      "packageRecord",
      "sourceServices",
      "sourceCaddyMode",
      "classification",
      "archive",
      "privateFiles",
      "before",
      "restored",
      "restarted",
      "verified",
      "completedAt",
      "durations",
    ],
    "backup-manifest",
  );
  const owner = identity(record),
    packageRecord = parsePackageRecord(record["packageRecord"]);
  assertRecordIdentity(packageRecord, owner);
  const sourceServices = parseServiceSnapshot(record["sourceServices"]),
    sourceCaddyMode = choice(
      record["sourceCaddyMode"],
      ["normal", "maintenance", "acceptance"],
      "backup-source-mode",
    );
  requireRecord(
    sourceServices.postgres !== null &&
      sourceServices.postgres.running &&
      sourceServices.postgres.imageId === packageRecord.bases[1]?.id,
    "backup-source-postgres",
  );
  const classification = choice(
      record["classification"],
      ["FRESH_EMPTY", "MIGRATED"],
      "backup-classification",
    ),
    before = parseDatabaseFingerprint(record["before"]),
    restored = nullable(record["restored"], parseDatabaseFingerprint),
    restarted = nullable(record["restarted"], parseDatabaseFingerprint);
  requireRecord(
    before.classification === classification,
    "backup-classification",
  );
  const archive = nullable(record["archive"], (entry) => {
    const archive = object(entry, ["bytes", "sha256"], "backup-archive");
    return Object.freeze({
      bytes: decimal(archive["bytes"]),
      sha256: hash(archive["sha256"]),
    });
  });
  const privateFiles = array(
    record["privateFiles"],
    (entry) => {
      const file = object(
        entry,
        ["name", "bytes", "sha256"],
        "backup-private-file",
      );
      return Object.freeze({
        name: choice(
          file["name"],
          [
            "runtime.env",
            "postgres.env",
            "release.json",
            "mode.caddy",
            "package.json",
          ],
          "backup-private-file",
        ),
        bytes: decimal(file["bytes"]),
        sha256: hash(file["sha256"]),
      });
    },
    "backup-private-files",
  );
  requireRecord(
    new Set(privateFiles.map((entry) => entry.name)).size ===
      privateFiles.length,
    "backup-private-files",
  );
  const rawDurations = object(
    record["durations"],
    ["dumpMs", "restoreMs", "restartMs", "totalMs"],
    "backup-durations",
  );
  const durations = Object.freeze({
    dumpMs: nullable(rawDurations["dumpMs"], (entry) =>
      integer(entry, "dump-duration"),
    ),
    restoreMs: nullable(rawDurations["restoreMs"], (entry) =>
      integer(entry, "restore-duration"),
    ),
    restartMs: nullable(rawDurations["restartMs"], (entry) =>
      integer(entry, "restart-duration"),
    ),
    totalMs: nullable(rawDurations["totalMs"], (entry) =>
      integer(entry, "backup-duration"),
    ),
  });
  const verified = boolean(record["verified"], "backup-verified"),
    completedAt = nullable(record["completedAt"], utc);
  if (verified)
    requireRecord(
      archive !== null &&
        archive.bytes !== "0" &&
        completedAt !== null &&
        restored !== null &&
        restarted !== null &&
        JSON.stringify(before) === JSON.stringify(restored) &&
        JSON.stringify(before) === JSON.stringify(restarted) &&
        privateFiles.length === 5 &&
        Object.values(durations).every((entry) => entry !== null),
      "backup-verification",
    );
  return Object.freeze({
    version: version(record["version"]),
    ...owner,
    id: uuid(record["id"]),
    kind: choice(record["kind"], ["daily", "predeploy"], "backup-kind"),
    businessDate: businessDate(record["businessDate"]),
    runId: uuid(record["runId"]),
    operatorReference: reference(record["operatorReference"]),
    authorizationReference: reference(record["authorizationReference"]),
    storageIdentity: reference(record["storageIdentity"]),
    machineIdSha256: hash(record["machineIdSha256"]),
    dockerEngineId: reference(record["dockerEngineId"]),
    packageRecord,
    sourceServices,
    sourceCaddyMode,
    classification,
    archive,
    privateFiles,
    before,
    restored,
    restarted,
    verified,
    completedAt,
    durations,
  });
}
/** @typedef {ReturnType<typeof parseBackupManifest>} BackupManifest */

/** @param {unknown} input @param {RecordIdentity} expected */
export function parseBackupIndex(input, expected) {
  const record = object(
    input,
    [
      "version",
      "scope",
      "environmentId",
      "projectName",
      "storageIdentity",
      "entries",
    ],
    "backup-index",
  );
  const owner = identity(record);
  assertRecordIdentity(owner, expected);
  const entries = array(
    record["entries"],
    (entry) => {
      const record = object(
        entry,
        [
          "id",
          "scope",
          "environmentId",
          "projectName",
          "revision",
          "kind",
          "businessDate",
          "manifestSha256",
          "completedAt",
          "verified",
          "protectedForRevision",
          "openedByRevision",
          "openReceiptReference",
        ],
        "backup-index-entry",
      );
      const entryOwner = identity(record);
      assertRecordIdentity(entryOwner, owner);
      requireRecord(record["verified"] === true, "backup-index-verification");
      const protectedForRevision = nullable(
          record["protectedForRevision"],
          revision,
        ),
        openedByRevision = nullable(record["openedByRevision"], revision),
        openReceiptReference = nullable(
          record["openReceiptReference"],
          reference,
        );
      requireRecord(
        (openedByRevision === null) === (openReceiptReference === null) &&
          (openedByRevision === null ||
            (protectedForRevision !== null &&
              openedByRevision !== protectedForRevision)),
        "backup-protection",
      );
      const kind = choice(
          record["kind"],
          ["daily", "predeploy"],
          "backup-index-kind",
        ),
        sourceRevision = revision(record["revision"]);
      requireRecord(
        kind === "daily"
          ? protectedForRevision === null &&
              openedByRevision === null &&
              openReceiptReference === null
          : protectedForRevision === sourceRevision,
        "backup-kind-protection",
      );
      if (openReceiptReference !== null)
        uuid(
          matching(
            openReceiptReference,
            /^run:[0-9a-f-]{36}$/u,
            "backup-open-receipt",
          ).slice(4),
        );
      return Object.freeze({
        id: uuid(record["id"]),
        ...entryOwner,
        revision: sourceRevision,
        kind,
        businessDate: businessDate(record["businessDate"]),
        manifestSha256: hash(record["manifestSha256"]),
        completedAt: utc(record["completedAt"]),
        verified: /** @type {const} */ (true),
        protectedForRevision,
        openedByRevision,
        openReceiptReference,
      });
    },
    "backup-index-entries",
  );
  requireRecord(
    new Set(entries.map((entry) => entry.id)).size === entries.length,
    "backup-index-duplicates",
  );
  return Object.freeze({
    version: version(record["version"]),
    ...owner,
    storageIdentity: reference(record["storageIdentity"]),
    entries,
  });
}
/** @typedef {ReturnType<typeof parseBackupIndex>} BackupIndex */

/** @param {unknown} input */
export function parseOperatorSession(input) {
  const record = object(input, ["version", "accessToken"], "operator-session");
  const accessToken = text(record["accessToken"], "operator-session", 65500);
  requireRecord(
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(accessToken),
    "operator-session",
  );
  return Object.freeze({ version: version(record["version"]), accessToken });
}

const observationKeys = Object.freeze([
  "backend",
  "frontend",
  "browser",
  "localOperations",
  "requirementsReview",
  "engineeringReview",
  "targetHttps",
  "targetMail",
  "targetAuthority",
  "targetDatabaseRestart",
  "targetRestore",
  "targetBackup",
  "operatorTraining",
  "scheduledBackup",
]);
/** @param {unknown} input @param {Readonly<{identity:RecordIdentity,revision:string,machineIdSha256:string,dockerEngineId:string,applicationImageId:string,migrationSetHash:string,operatorReference:string,now:number}>} expected */
export function parseOperatorEvidence(input, expected) {
  const record = object(
    input,
    [
      "version",
      "scope",
      "environmentId",
      "projectName",
      "releaseRevision",
      "machineIdSha256",
      "dockerEngineId",
      "applicationImageId",
      "migrationSetHash",
      "observations",
    ],
    "operator-evidence",
  );
  const owner = identity(record);
  assertRecordIdentity(owner, expected.identity);
  const binding = {
    releaseRevision: revision(record["releaseRevision"]),
    machineIdSha256: hash(record["machineIdSha256"]),
    dockerEngineId: reference(record["dockerEngineId"]),
    applicationImageId: imageId(record["applicationImageId"]),
    migrationSetHash: hash(record["migrationSetHash"]),
  };
  if (
    binding.releaseRevision !== expected.revision ||
    binding.machineIdSha256 !== expected.machineIdSha256 ||
    binding.dockerEngineId !== expected.dockerEngineId ||
    binding.applicationImageId !== expected.applicationImageId ||
    binding.migrationSetHash !== expected.migrationSetHash
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "operator-evidence-binding",
    );
  const raw = object(
    record["observations"],
    observationKeys,
    "operator-observations",
  );
  const observations = Object.fromEntries(
    observationKeys.map((key) => {
      const observation = object(
        raw[key],
        ["status", "reference", "observedAt", "operatorReference"],
        "operator-observation",
      );
      const status = choice(
        observation["status"],
        ["PASS", "UNPERFORMED", "FAILED"],
        "operator-observation",
      );
      const parsed = {
        status,
        reference: nullable(observation["reference"], reference),
        observedAt: nullable(observation["observedAt"], utc),
        operatorReference: nullable(
          observation["operatorReference"],
          reference,
        ),
      };
      if (status === "PASS")
        requireRecord(
          parsed.reference !== null &&
            parsed.observedAt !== null &&
            Date.parse(parsed.observedAt) <= expected.now &&
            parsed.operatorReference === expected.operatorReference,
          "operator-observation-proof",
        );
      return /** @type {const} */ ([key, Object.freeze(parsed)]);
    }),
  );
  return Object.freeze({
    version: version(record["version"]),
    ...owner,
    ...binding,
    observations: Object.freeze(observations),
  });
}

/** @param {BackupManifest} manifest @param {BackupIndex['entries'][number]} entry @param {RecordIdentity} owner @param {string} storageIdentity */
export function assertBackupEntryBinding(
  manifest,
  entry,
  owner,
  storageIdentity,
) {
  assertRecordIdentity(manifest, owner);
  assertRecordIdentity(entry, owner);
  requireRecord(
    manifest.verified &&
      manifest.id === entry.id &&
      manifest.packageRecord.revision === entry.revision &&
      manifest.kind === entry.kind &&
      manifest.businessDate === entry.businessDate &&
      manifest.completedAt === entry.completedAt &&
      manifest.storageIdentity === storageIdentity,
    "backup-entry-binding",
  );
}

/** @param {unknown} input @param {RecordIdentity} expected */
export function parseOperationReceipt(input, expected) {
  const record = object(
    input,
    [
      "version",
      "scope",
      "environmentId",
      "projectName",
      "runId",
      "action",
      "revision",
      "startedAt",
      "completedAt",
      "phase",
      "outcome",
      "authorizationReference",
      "priorStateReference",
      "nextStateReference",
      "stages",
      "remainingGates",
    ],
    "operation-receipt",
  );
  const owner = identity(record);
  assertRecordIdentity(owner, expected);
  const startedAt = utc(record["startedAt"]),
    completedAt = utc(record["completedAt"]);
  requireRecord(completedAt >= startedAt, "receipt-time-order");
  const statePath = /** @param {unknown} input */ (input) =>
    matching(
      input,
      /^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/u,
      "receipt-state-path",
    );
  const priorStateReference = statePath(record["priorStateReference"]),
    nextStateReference = statePath(record["nextStateReference"]);
  requireRecord(
    !priorStateReference
      .split("/")
      .some((part) => part === "." || part === "..") &&
      !nextStateReference
        .split("/")
        .some((part) => part === "." || part === ".."),
    "receipt-state-path",
  );
  return Object.freeze({
    version: version(record["version"]),
    ...owner,
    runId: uuid(record["runId"]),
    action: choice(
      record["action"],
      [
        "inspect",
        "package",
        "backup",
        "prepare",
        "admin-preview",
        "admin-apply",
        "restart",
        "recover-replacement",
        "open-traffic",
        "install-backup-timer",
      ],
      "receipt-action",
    ),
    revision: revision(record["revision"]),
    startedAt,
    completedAt,
    phase: choice(
      record["phase"],
      [
        "UNPREPARED",
        "PACKAGED",
        "MAINTENANCE",
        "ACCEPTANCE",
        "OPEN",
        "UNCERTAIN",
      ],
      "receipt-phase",
    ),
    outcome: choice(
      record["outcome"],
      [
        "COMPLETED",
        "AWAITING_OPERATOR",
        "AWAITING_SCHEDULE",
        "FAILED",
        "UNCERTAIN",
      ],
      "receipt-outcome",
    ),
    authorizationReference: reference(record["authorizationReference"]),
    priorStateReference,
    nextStateReference,
    stages: array(
      record["stages"],
      (entry) => {
        const stage = object(entry, ["stage", "outcome"], "receipt-stage");
        return Object.freeze({
          stage: reference(stage["stage"]),
          outcome: reference(stage["outcome"]),
        });
      },
      "receipt-stages",
    ),
    remainingGates: array(record["remainingGates"], reference, "receipt-gates"),
  });
}

/** @param {ReturnType<typeof parseOperationReceipt>} receipt @param {BackupIndex['entries'][number]} entry @param {string} stateFile */
export function assertCheckpointReleaseReceipt(receipt, entry, stateFile) {
  assertRecordIdentity(receipt, entry);
  requireRecord(
    entry.openReceiptReference === `run:${receipt.runId}` &&
      receipt.revision === entry.openedByRevision &&
      receipt.action === "open-traffic" &&
      receipt.phase === "OPEN" &&
      receipt.outcome === "COMPLETED" &&
      receipt.completedAt > entry.completedAt &&
      receipt.priorStateReference === stateFile &&
      receipt.nextStateReference === stateFile,
    "backup-protection-open-receipt",
  );
}

/** @param {unknown} input @param {RecordIdentity} expected */
export function parseAuthorityRebind(input, expected) {
  const record = object(
    input,
    [
      "version",
      "scope",
      "environmentId",
      "projectName",
      "runId",
      "userId",
      "email",
      "observedAccessVersion",
      "configBeforeSha256",
      "configAfterSha256",
      "provisioningReceipt",
      "createdAt",
    ],
    "authority-rebind",
  );
  const owner = identity(record);
  assertRecordIdentity(owner, expected);
  const userId = uuid(record["userId"]),
    observedAccessVersion = integer(
      record["observedAccessVersion"],
      "authority-version",
    ),
    receipt = nullable(record["provisioningReceipt"], provisioningReceipt);
  requireRecord(
    observedAccessVersion <= 2147483647 &&
      (receipt === null ||
        (receipt.targetId === userId &&
          receipt.afterVersion <= observedAccessVersion)),
    "authority-rebind-receipt",
  );
  return Object.freeze({
    version: version(record["version"]),
    ...owner,
    runId: uuid(record["runId"]),
    userId,
    email: matching(
      record["email"],
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/u,
      "authority-email",
    ),
    observedAccessVersion,
    configBeforeSha256: hash(record["configBeforeSha256"]),
    configAfterSha256: hash(record["configAfterSha256"]),
    provisioningReceipt: receipt,
    createdAt: utc(record["createdAt"]),
  });
}
/** @typedef {ReturnType<typeof parseAuthorityRebind>} AuthorityRebind */

/** @param {unknown} input */
export function parseAccountIdentity(input) {
  const record = object(
      input,
      ["id", "email", "role", "status", "accessVersion"],
      "account-identity",
    ),
    accessVersion = integer(record["accessVersion"], "authority-version");
  requireRecord(accessVersion <= 2147483647, "authority-version");
  return Object.freeze({
    id: uuid(record["id"]),
    email: matching(
      record["email"],
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/u,
      "authority-email",
    ),
    role: choice(record["role"], ["USER", "ADMIN"], "account-role"),
    status: choice(
      record["status"],
      [
        "PENDING_VERIFICATION",
        "PENDING_APPROVAL",
        "REJECTED",
        "ACTIVE",
        "SUSPENDED",
      ],
      "account-status",
    ),
    accessVersion,
  });
}
/** @typedef {ReturnType<typeof parseAccountIdentity>} AccountIdentity */
export { provisioningReceipt as parseProvisioningReceipt };
