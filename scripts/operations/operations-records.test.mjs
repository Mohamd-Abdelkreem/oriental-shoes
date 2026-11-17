import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import {
  parsePackageRecord,
  parseReleaseState,
  initialReleaseState,
  parseDatabaseFingerprint,
  parseBackupManifest,
  parseBackupIndex,
  assertBackupEntryBinding,
  parseOperationReceipt,
  parseAuthorityRebind,
  assertCheckpointReleaseReceipt,
  parseOperatorSession,
  parseOperatorEvidence,
} from "./operations-records.mjs";

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  buildId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner = {
  scope: "isolated",
  environmentId: "acceptance",
  projectName: `p08-ops-test-${runId}`,
};
const now = Date.parse("2026-11-17T00:00:00.000Z");
function packageRecord() {
  const migrations = [{ name: "20261101000000_first", sha256: "a".repeat(64) }];
  return {
    version: 1,
    ...owner,
    runId,
    buildId,
    imageReference: `${owner.projectName}-app:${"b".repeat(40)}-${buildId}`,
    packagedAt: new Date(now).toISOString(),
    revision: "b".repeat(40),
    sourceSha256: "c".repeat(64),
    lockfileSha256: "d".repeat(64),
    migrationSetHash: createHash("sha256")
      .update(JSON.stringify(migrations))
      .digest("hex"),
    migrations,
    tableInventoryByPrefix: [
      { completedMigrations: 0, tables: ["_prisma_migrations"] },
      { completedMigrations: 1, tables: ["_prisma_migrations", "users"] },
    ],
    publicApiOrigin: "https://acceptance.example.com/api/v1",
    applicationImageId: `sha256:${"e".repeat(64)}`,
    architecture: "arm64",
    bases: ["node:24-bookworm", "postgres:18.4", "caddy:2"].map(
      (reference) => ({
        reference: `${reference}@sha256:${"f".repeat(64)}`,
        id: `sha256:${"f".repeat(64)}`,
        architecture: "arm64",
      }),
    ),
    machineEngineObservation: {
      engine: "actual-fixture-engine",
      architecture: "aarch64",
      composeVersion: "5.5.0",
      availableDiskBytes: "99999999999999999",
    },
  };
}
function fingerprint() {
  return {
    classification: "MIGRATED",
    ledgerAbsent: false,
    tables: [
      { table: "_prisma_migrations", rowCount: "1", sha256: "a".repeat(64) },
      { table: "users", rowCount: "9007199254740993", sha256: "b".repeat(64) },
    ],
    migrationFacts: [
      {
        name: "20261101000000_first",
        checksum: "a".repeat(64),
        finishedAt: new Date(now).toISOString(),
      },
    ],
    ownership: {
      databaseOwner: "app",
      applicationRole: "app",
      superuser: false,
      createDatabase: false,
      createRole: false,
      replication: false,
      tableOwners: [
        { table: "_prisma_migrations", owner: "app" },
        { table: "users", owner: "app" },
      ],
    },
  };
}
function manifest() {
  const before = fingerprint();
  return {
    version: 1,
    ...owner,
    id: randomUUID(),
    kind: "daily",
    businessDate: "2026-11-17",
    runId,
    operatorReference: "operator-ref",
    authorizationReference: "authorization-ref",
    storageIdentity: "storage-ref",
    machineIdSha256: "a".repeat(64),
    dockerEngineId: "actual-fixture-engine",
    packageRecord: packageRecord(),
    sourceServices: {
      api: null,
      web: null,
      postgres: {
        id: "1".repeat(64),
        imageId: `sha256:${"f".repeat(64)}`,
        running: true,
      },
      caddy: null,
    },
    sourceCaddyMode: "maintenance",
    classification: "MIGRATED",
    archive: { bytes: "4096", sha256: "c".repeat(64) },
    privateFiles: [
      "runtime.env",
      "postgres.env",
      "release.json",
      "mode.caddy",
      "package.json",
    ].map((name) => ({ name, bytes: "1", sha256: "d".repeat(64) })),
    before,
    restored: structuredClone(before),
    restarted: structuredClone(before),
    verified: true,
    completedAt: new Date(now).toISOString(),
    durations: { dumpMs: 1, restoreMs: 2, restartMs: 3, totalMs: 6 },
  };
}

test("package identity rejects retagging, altered migration evidence and incomplete inventories", async (t) => {
  assert.equal(parsePackageRecord(packageRecord()).buildId, buildId);
  for (const [scenario, mutate] of [
    [
      "mutable-tag",
      (record) => {
        record.imageReference = `${owner.projectName}:latest`;
      },
    ],
    [
      "changed-migration",
      (record) => {
        record.migrations[0].sha256 = "e".repeat(64);
      },
    ],
    [
      "missing-inventory",
      (record) => {
        record.tableInventoryByPrefix.pop();
      },
    ],
    [
      "wrong-base",
      (record) => {
        record.bases[0].reference = `node:22@sha256:${"f".repeat(64)}`;
      },
    ],
    [
      "unknown-field",
      (record) => {
        record.credentials = "PRIVATE_SENTINEL";
      },
    ],
  ])
    await t.test(scenario, () => {
      const record = packageRecord();
      mutate(record);
      assert.throws(() => parsePackageRecord(record), {
        code: "RELEASE_INPUT_INVALID",
      });
    });
});

test("release state binds its namespace and nested packages instead of accepting arbitrary markers", () => {
  const initial = initialReleaseState(owner, now);
  const userId = randomUUID();
  const historical = {
    userId,
    email: "operator@example.com",
    accessVersion: 3,
    observedAt: new Date(now).toISOString(),
    source: "users-me",
    provisioningReceipt: {
      targetId: userId,
      beforeVersion: 1,
      afterVersion: 2,
      occurredAt: new Date(now).toISOString(),
      operatorReference: "operator-ref",
    },
  };
  assert.equal(
    parseReleaseState(
      {
        ...initial,
        authority: historical,
        provisioningReceipt: historical.provisioningReceipt,
      },
      owner,
    ).authority.provisioningReceipt.afterVersion,
    2,
  );
  assert.throws(
    () =>
      parseReleaseState(
        { ...initial, authority: { ...historical, accessVersion: 1 } },
        owner,
      ),
    { code: "RELEASE_INPUT_INVALID" },
  );

  const awaiting = parseReleaseState(
    {
      ...initial,
      phase: "ACCEPTANCE",
      authority: null,
      provisioningReceipt: historical.provisioningReceipt,
      administratorReauthenticationRequired: true,
    },
    owner,
  );
  assert.equal(awaiting.authority, null);
  assert.equal(awaiting.provisioningReceipt.afterVersion, 2);
  assert.throws(
    () =>
      parseReleaseState(
        { ...initial, authority: historical, provisioningReceipt: null },
        owner,
      ),
    { code: "RELEASE_INPUT_INVALID", stage: "state-provisioning-receipt" },
  );
  assert.equal(parseReleaseState(initial, owner).phase, "UNPREPARED");
  assert.throws(
    () => parseReleaseState({ ...initial, phase: "READY_ENOUGH" }, owner),
    { code: "RELEASE_INPUT_INVALID" },
  );
  assert.throws(
    () =>
      parseReleaseState(
        { ...initial, scope: "live", projectName: "oriental-shoes-acceptance" },
        owner,
      ),
    { code: "RELEASE_TARGET_MISMATCH" },
  );
  assert.throws(
    () =>
      parseReleaseState(
        {
          ...initial,
          candidate: {
            ...packageRecord(),
            projectName: `p08-ops-test-${randomUUID()}`,
          },
        },
        owner,
      ),
    { code: "RELEASE_INPUT_INVALID" },
  );
  assert.throws(
    () =>
      parseReleaseState(
        {
          ...initial,
          active: {
            ...packageRecord(),
            scope: "live",
            projectName: "oriental-shoes-acceptance",
            imageReference: `oriental-shoes-acceptance-app:${"b".repeat(40)}-${buildId}`,
          },
        },
        owner,
      ),
    { code: "RELEASE_TARGET_MISMATCH" },
  );
});

test("fingerprints preserve large counts and reject unsafe ownership or fabricated empty classification", () => {
  assert.equal(
    parseDatabaseFingerprint(fingerprint()).tables[1].rowCount,
    "9007199254740993",
  );
  for (const mutate of [
    (record) => {
      record.ownership.superuser = true;
    },
    (record) => {
      record.ownership.tableOwners[1].owner = "bootstrap";
    },
    (record) => {
      record.classification = "FRESH_EMPTY";
    },
    (record) => {
      record.tables[1].rowCount = "01";
    },
  ]) {
    const record = fingerprint();
    mutate(record);
    assert.throws(() => parseDatabaseFingerprint(record), {
      code: "RELEASE_INPUT_INVALID",
    });
  }
});

test("verified backup requires matching restored and restarted data, exact private copies and measured completion", () => {
  const accepted = parseBackupManifest(manifest());
  assert.equal(accepted.verified, true);
  for (const mutate of [
    (record) => {
      record.restored.tables[1].rowCount = "1";
    },
    (record) => {
      record.restarted = null;
    },
    (record) => {
      record.privateFiles.pop();
    },
    (record) => {
      record.privateFiles[0].name = "operator-session.json";
    },
    (record) => {
      record.durations.totalMs = null;
    },
    (record) => {
      record.businessDate = "2026-02-30";
    },
  ]) {
    const record = manifest();
    mutate(record);
    assert.throws(() => parseBackupManifest(record), {
      code: "RELEASE_INPUT_INVALID",
    });
  }
});

test("backup index rejects foreign identities, duplicate paths and unpaired protection release references", () => {
  const backup = { ...manifest(), kind: "predeploy" };
  const entry = {
    id: backup.id,
    ...owner,
    revision: backup.packageRecord.revision,
    kind: "predeploy",
    businessDate: backup.businessDate,
    manifestSha256: "a".repeat(64),
    completedAt: backup.completedAt,
    verified: true,
    protectedForRevision: backup.packageRecord.revision,
    openedByRevision: null,
    openReceiptReference: null,
  };
  const index = {
    version: 1,
    ...owner,
    storageIdentity: "storage-ref",
    entries: [entry],
  };
  assert.equal(parseBackupIndex(index, owner).entries.length, 1);
  assert.doesNotThrow(() =>
    assertBackupEntryBinding(
      parseBackupManifest(backup),
      parseBackupIndex(index, owner).entries[0],
      owner,
      index.storageIdentity,
    ),
  );
  for (const change of [
    { kind: "daily" },
    { revision: "f".repeat(40) },
    { businessDate: "2026-11-16" },
    { completedAt: "2026-11-16T00:00:00.000Z" },
  ])
    assert.throws(
      () =>
        assertBackupEntryBinding(
          parseBackupManifest(backup),
          { ...entry, ...change },
          owner,
          index.storageIdentity,
        ),
      { code: "RELEASE_INPUT_INVALID" },
    );
  assert.throws(
    () =>
      assertBackupEntryBinding(
        parseBackupManifest(backup),
        entry,
        owner,
        "foreign-storage",
      ),
    { code: "RELEASE_INPUT_INVALID" },
  );
  assert.throws(
    () => parseBackupIndex({ ...index, entries: [entry, entry] }, owner),
    { code: "RELEASE_INPUT_INVALID" },
  );
  assert.throws(
    () =>
      parseBackupIndex(
        { ...index, entries: [{ ...entry, id: "../foreign" }] },
        owner,
      ),
    { code: "RELEASE_INPUT_INVALID" },
  );
  assert.throws(
    () =>
      parseBackupIndex(
        { ...index, entries: [{ ...entry, openedByRevision: "f".repeat(40) }] },
        owner,
      ),
    { code: "RELEASE_INPUT_INVALID" },
  );
  assert.throws(
    () =>
      parseBackupIndex(
        { ...index, projectName: `p08-ops-test-${randomUUID()}` },
        owner,
      ),
    { code: "RELEASE_TARGET_MISMATCH" },
  );
});

test("operator evidence cannot turn absent, future, wrong-operator or wrong-scope observations into acceptance", () => {
  const expected = {
    identity: owner,
    revision: "b".repeat(40),
    machineIdSha256: "a".repeat(64),
    dockerEngineId: "actual-fixture-engine",
    applicationImageId: `sha256:${"e".repeat(64)}`,
    migrationSetHash: packageRecord().migrationSetHash,
    operatorReference: "operator-ref",
    now,
  };
  const keys = [
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
  ];
  const evidence = {
    version: 1,
    ...owner,
    releaseRevision: expected.revision,
    machineIdSha256: expected.machineIdSha256,
    dockerEngineId: expected.dockerEngineId,
    applicationImageId: expected.applicationImageId,
    migrationSetHash: expected.migrationSetHash,
    observations: Object.fromEntries(
      keys.map((key) => [
        key,
        {
          status: "UNPERFORMED",
          reference: null,
          observedAt: null,
          operatorReference: null,
        },
      ]),
    ),
  };
  assert.equal(
    parseOperatorEvidence(evidence, expected).observations.backend.status,
    "UNPERFORMED",
  );
  for (const observation of [
    {
      status: "PASS",
      reference: null,
      observedAt: null,
      operatorReference: null,
    },
    {
      status: "PASS",
      reference: "real-ref",
      observedAt: new Date(now + 1).toISOString(),
      operatorReference: "operator-ref",
    },
    {
      status: "PASS",
      reference: "real-ref",
      observedAt: new Date(now).toISOString(),
      operatorReference: "other-operator",
    },
  ])
    assert.throws(
      () =>
        parseOperatorEvidence(
          {
            ...evidence,
            observations: { ...evidence.observations, backend: observation },
          },
          expected,
        ),
      { code: "RELEASE_INPUT_INVALID" },
    );
  assert.throws(
    () =>
      parseOperatorEvidence(
        { ...evidence, applicationImageId: `sha256:${"1".repeat(64)}` },
        expected,
      ),
    { code: "RELEASE_TARGET_MISMATCH" },
  );
});

test("private bearer input is strict and rejected credentials never appear in errors", () => {
  assert.equal(
    parseOperatorSession({
      version: 1,
      accessToken: "header.payload.signature",
    }).version,
    1,
  );
  const sentinel = "PRIVATE_SENTINEL";
  for (const input of [
    { version: 1, accessToken: sentinel },
    { version: 1, accessToken: "header.payload.signature", password: sentinel },
  ])
    assert.throws(
      () => parseOperatorSession(input),
      (failure) =>
        failure.code === "RELEASE_INPUT_INVALID" &&
        !failure.message.includes(sentinel),
    );
});

test("checkpoint release receipts require a strict matching operation identity and real completion order", () => {
  const receipt = {
    version: 1,
    ...owner,
    runId,
    action: "open-traffic",
    revision: "f".repeat(40),
    startedAt: "2026-11-17T00:00:00.000Z",
    completedAt: "2026-11-17T00:01:00.000Z",
    phase: "OPEN",
    outcome: "COMPLETED",
    authorizationReference: "explicit-isolated-cutover",
    priorStateReference: "/private/state.json",
    nextStateReference: "/private/state.json",
    stages: [{ stage: "open-traffic", outcome: "COMPLETED" }],
    remainingGates: ["T048-target-acceptance"],
  };
  assert.equal(parseOperationReceipt(receipt, owner).runId, runId);
  for (const change of [
    { action: "force" },
    { outcome: "SUCCESS" },
    { completedAt: "2026-11-16T00:00:00.000Z" },
    { scope: "live" },
    { nextStateReference: "/private/../foreign.json" },
    { token: "PRIVATE_SENTINEL" },
    {
      stages: [
        {
          stage: "open-traffic",
          outcome: "COMPLETED",
          accessToken: "PRIVATE_SENTINEL",
        },
      ],
    },
  ])
    assert.throws(() =>
      parseOperationReceipt({ ...receipt, ...change }, owner),
    );
});

test("predeploy protection requires the same successful later opening, including identity and both state references", async (t) => {
  const backup = { ...manifest(), kind: "predeploy" };
  const receipt = {
    version: 1,
    ...owner,
    runId,
    action: "open-traffic",
    revision: "f".repeat(40),
    startedAt: "2026-11-17T00:00:00.000Z",
    completedAt: "2026-11-17T00:01:00.000Z",
    phase: "OPEN",
    outcome: "COMPLETED",
    authorizationReference: "explicit-isolated-cutover",
    priorStateReference: "/private/state.json",
    nextStateReference: "/private/state.json",
    stages: [{ stage: "open-traffic", outcome: "COMPLETED" }],
    remainingGates: ["T048-target-acceptance"],
  };
  const entry = {
    id: backup.id,
    ...owner,
    revision: backup.packageRecord.revision,
    kind: "predeploy",
    businessDate: backup.businessDate,
    manifestSha256: "a".repeat(64),
    completedAt: backup.completedAt,
    verified: true,
    protectedForRevision: backup.packageRecord.revision,
    openedByRevision: receipt.revision,
    openReceiptReference: `run:${runId}`,
  };
  assert.doesNotThrow(() =>
    assertCheckpointReleaseReceipt(
      parseOperationReceipt(receipt, owner),
      entry,
      "/private/state.json",
    ),
  );
  for (const [label, change] of [
    ["wrong action", { action: "backup" }],
    ["wrong revision", { revision: "d".repeat(40) }],
    ["wrong run", { runId: randomUUID() }],
    ["failed outcome", { outcome: "FAILED" }],
    ["not open", { phase: "ACCEPTANCE" }],
    ["not later", { completedAt: backup.completedAt }],
    ["wrong prior path", { priorStateReference: "/foreign/state.json" }],
    ["wrong next path", { nextStateReference: "/foreign/state.json" }],
  ])
    await t.test(label, () =>
      assert.throws(
        () =>
          assertCheckpointReleaseReceipt(
            parseOperationReceipt({ ...receipt, ...change }, owner),
            entry,
            "/private/state.json",
          ),
        { code: "RELEASE_INPUT_INVALID" },
      ),
    );
  await t.test("foreign namespace", () =>
    assert.throws(
      () =>
        assertCheckpointReleaseReceipt(
          parseOperationReceipt(
            { ...receipt, ...owner, environmentId: "foreign" },
            { ...owner, environmentId: "foreign" },
          ),
          entry,
          "/private/state.json",
        ),
      { code: "RELEASE_TARGET_MISMATCH" },
    ),
  );
});

test("authority rebind journals bind one current identity and retain historical provisioning facts without credentials", () => {
  const userId = randomUUID(),
    receipt = {
      targetId: userId,
      beforeVersion: 1,
      afterVersion: 2,
      occurredAt: "2026-11-17T00:00:00.000Z",
      operatorReference: "operator-ref",
    };
  const journal = {
    version: 1,
    ...owner,
    runId,
    userId,
    email: "operator@example.com",
    observedAccessVersion: 4,
    configBeforeSha256: "a".repeat(64),
    configAfterSha256: "b".repeat(64),
    provisioningReceipt: receipt,
    createdAt: "2026-11-17T00:01:00.000Z",
  };
  assert.equal(
    parseAuthorityRebind(journal, owner).provisioningReceipt.afterVersion,
    2,
  );
  assert.equal(
    parseAuthorityRebind({ ...journal, provisioningReceipt: null }, owner)
      .provisioningReceipt,
    null,
  );
  for (const change of [
    { observedAccessVersion: 1 },
    { configBeforeSha256: "unbound" },
    { userId: randomUUID() },
    { accessToken: "PRIVATE_SENTINEL" },
    { provisioningReceipt: { ...receipt, afterVersion: 3 } },
  ])
    assert.throws(
      () => parseAuthorityRebind({ ...journal, ...change }, owner),
      { code: "RELEASE_INPUT_INVALID" },
    );
});
