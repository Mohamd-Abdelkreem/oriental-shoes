import assert from "node:assert/strict";
import test from "node:test";
import {
  readDatabaseFingerprint,
  createVerifiedBackup,
  verifyBackupInDisposableDatabase,
} from "./backup.mjs";

// Only the physical Docker metadata/SQL response boundary is doubled here.
// Binary COPY/archive/restore behavior is covered by the guarded real Docker suite.
function observedDatabase({ tables = [], ownership = {}, ledger = [] } = {}) {
  const id = "a".repeat(64),
    imageId = `sha256:${"b".repeat(64)}`,
    runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const labels = {
    "io.oriental-shoes.environment": "test",
    "com.docker.compose.project": "oriental-shoes-test",
    "io.oriental-shoes.scope": "live",
    "io.oriental-shoes.role": "postgres",
    "io.oriental-shoes.run": runId,
  };
  const requests = [];
  const context = {
    scope: "live",
    projectName: "oriental-shoes-test",
    config: {
      environmentId: "test",
      applicationRole: "oriental_app",
      bootstrapRole: "bootstrap",
      databaseName: "oriental",
    },
    packageRecord: {
      migrations: [{ name: "001_initial", sha256: "c".repeat(64) }],
      tableInventoryByPrefix: [
        { prefix: 0, tables: [] },
        { prefix: 1, tables: ["_prisma_migrations", "users"] },
      ],
    },
    registry: new Map([
      [
        "postgres",
        { id, imageId, runId, scope: "live", role: "postgres", running: true },
      ],
    ]),
    command: async (request) => {
      requests.push(request);
      if (request.stage === "database-container-owner")
        return {
          exitCode: 0,
          stdout: `${JSON.stringify(labels)}\n${imageId}\ntrue\n`,
        };
      if (request.stage === "database-observation") {
        const sql = request.argv.at(-1);
        if (sql.includes("'serverVersion'"))
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              serverVersion: "180004",
              encoding: "UTF8",
              login: true,
              tables,
              ownership: {
                databaseOwner: "oriental_app",
                applicationRole: "oriental_app",
                superuser: false,
                createDatabase: false,
                createRole: false,
                replication: false,
                tableOwners: tables.map((table) => ({
                  table,
                  owner: "oriental_app",
                })),
                ...ownership,
              },
            }),
          };
        return { exitCode: 0, stdout: JSON.stringify(ledger) };
      }
      throw Error("Unexpected physical request");
    },
  };
  return { context, requests, labels };
}

test("fresh empty classification never queries the absent ledger or starts a writer", async () => {
  const { context, requests } = observedDatabase();
  const actual = await readDatabaseFingerprint(context, "postgres");
  assert.equal(actual.classification, "FRESH_EMPTY");
  assert.equal(actual.ledgerAbsent, true);
  assert.deepEqual(actual.tables, []);
  assert.deepEqual(actual.migrationFacts, []);
  assert.equal(
    requests.filter((request) => request.stage === "database-observation")
      .length,
    1,
  );
  assert.ok(
    requests.every(
      (request) => request.argv[0] === "inspect" || request.argv[0] === "exec",
    ),
  );
});

test("populated missing ledger and wrong inventories refuse before COPY", async (t) => {
  for (const fixture of [
    { tables: ["users"] },
    { tables: ["_prisma_migrations"] },
    {
      tables: ["_prisma_migrations", "unknown"],
      ledger: [
        {
          name: "001_initial",
          checksum: "c".repeat(64),
          finishedAt: "2026-11-17T00:00:00.000Z",
          invalid: false,
        },
      ],
    },
  ]) {
    await t.test(fixture.tables.join(","), async () => {
      const { context } = observedDatabase(fixture);
      await assert.rejects(readDatabaseFingerprint(context, "postgres"), {
        code: "RELEASE_CHECK_FAILED",
      });
    });
  }
});

test("failed, divergent and unknown ledger entries refuse before any COPY", async (t) => {
  const valid = {
    name: "001_initial",
    checksum: "c".repeat(64),
    finishedAt: "2026-11-17T00:00:00.000Z",
    invalid: false,
  };
  for (const change of [
    { invalid: true },
    { checksum: "d".repeat(64) },
    { name: "002_unknown" },
    { finishedAt: null },
  ])
    await t.test(JSON.stringify(change), async () => {
      const { context } = observedDatabase({
        tables: ["_prisma_migrations", "users"],
        ledger: [{ ...valid, ...change }],
      });
      await assert.rejects(readDatabaseFingerprint(context, "postgres"), {
        code: "RELEASE_CHECK_FAILED",
        stage: "migration-ledger",
      });
    });
});

test("foreign container and privilege/ownership drift are rejected", async (t) => {
  await t.test("foreign owner", async () => {
    const { context, labels } = observedDatabase();
    labels["com.docker.compose.project"] = "foreign";
    await assert.rejects(readDatabaseFingerprint(context, "postgres"), {
      code: "RELEASE_TARGET_MISMATCH",
    });
  });
  for (const ownership of [
    { superuser: true },
    { createDatabase: true },
    { createRole: true },
    { replication: true },
    { databaseOwner: "bootstrap" },
  ])
    await t.test(JSON.stringify(ownership), async () => {
      const { context } = observedDatabase({ ownership });
      await assert.rejects(readDatabaseFingerprint(context, "postgres"), {
        code: "RELEASE_CHECK_FAILED",
        stage: "database-fingerprint",
      });
    });
});

test("unregistered source and missing held lease reject without a physical request", async () => {
  const { context, requests } = observedDatabase();
  await assert.rejects(readDatabaseFingerprint(context, "foreign"), {
    code: "RELEASE_TARGET_MISMATCH",
  });
  const guarded = {
    ...context,
    files: {
      assertLock: async () => {
        throw Object.assign(Error("lease required"), {
          code: "RELEASE_ADMISSION_MISSING",
        });
      },
    },
  };
  await assert.rejects(createVerifiedBackup(guarded, "daily"), {
    code: "RELEASE_ADMISSION_MISSING",
  });
  assert.equal(requests.length, 0);
});

test("foreign bundle directory is rejected before creating a restore target", async () => {
  const { context, requests } = observedDatabase();
  // Existing /tmp is never a private UUID bundle under the configured backup root.
  await assert.rejects(
    verifyBackupInDisposableDatabase(
      {
        ...context,
        config: {
          ...context.config,
          backupDirectory: "/unconfigured-backup-root",
        },
      },
      {
        directory: "/tmp",
        manifest: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      },
    ),
    { code: "RELEASE_TARGET_MISMATCH" },
  );
  assert.equal(requests.length, 0);
});

test("actual mount observations reject disappeared, nested or live storage", async (t) => {
  const { mountedFilesystem, assertStorageMounts } =
    await import("./operation-runtime.mjs");
  const config = {
    backupMountPoint: "/mnt/offhost",
    backupMountSource: "backup:/encrypted",
  };
  const mount = {
    target: "/mnt/offhost",
    source: "backup:/encrypted",
    filesystemType: "nfs4",
    device: "0:42",
  };
  const live = {
    target: "/",
    source: "/dev/live",
    filesystemType: "ext4",
    device: "8:1",
  };
  assert.doesNotThrow(() => assertStorageMounts(config, mount, mount, live));
  for (const [label, selected, directory, source, stage] of [
    [
      "disappeared",
      { ...mount, target: "/", source: "/dev/live" },
      mount,
      live,
      "backup-mount",
    ],
    [
      "nested directory",
      mount,
      { ...live, target: "/mnt/offhost/backups" },
      live,
      "backup-directory-mount",
    ],
    [
      "same device",
      mount,
      mount,
      { ...live, device: mount.device },
      "backup-independence",
    ],
    [
      "same source",
      mount,
      mount,
      { ...live, source: mount.source },
      "backup-independence",
    ],
  ])
    await t.test(label, () =>
      assert.throws(
        () => assertStorageMounts(config, selected, directory, source),
        { code: "RELEASE_TARGET_MISMATCH", stage },
      ),
    );
  await assert.rejects(
    mountedFilesystem(
      { command: async () => ({ exitCode: 1, stdout: "" }) },
      "/mnt/offhost",
    ),
    { code: "RELEASE_CHECK_FAILED", stage: "mounted-storage" },
  );
  await assert.rejects(
    mountedFilesystem(
      { command: async () => ({ exitCode: 0, stdout: '{"filesystems":[]}' }) },
      "/mnt/offhost",
    ),
    { code: "RELEASE_ADMISSION_MISSING", stage: "mounted-storage" },
  );
});
