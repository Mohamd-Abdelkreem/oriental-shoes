import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  chmod,
  symlink,
  link,
  readdir,
  readFile,
  rm,
  unlink,
  rename,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { replaceAdministratorBinding, sha256 } from "./operation-runtime.mjs";
import {
  parseReleaseArguments,
  ReleaseFailure,
  parseReleaseConfig,
} from "./release-config.mjs";
import {
  createOperationContext,
  planReleaseAction,
  runReleaseAction,
} from "./release.mjs";

function configuration() {
  return parseReleaseConfig({
    version: 1,
    environmentId: "acceptance",
    projectName: "oriental-shoes-acceptance",
    expectedMachineIdSha256: "a".repeat(64),
    expectedDockerEngineId: "engine-acceptance",
    appDomain: "acceptance.example.com",
    acceptanceCidrs: ["192.0.2.0/24"],
    releaseRevision: "b".repeat(40),
    nodeImage: `node:24-bookworm@sha256:${"c".repeat(64)}`,
    postgresImage: `postgres:18.4@sha256:${"d".repeat(64)}`,
    caddyImage: `caddy:2@sha256:${"e".repeat(64)}`,
    runtimeEnvFile: "/etc/private/api.env",
    postgresEnvFile: "/etc/private/postgres.env",
    databaseName: "oriental",
    applicationRole: "oriental_app",
    bootstrapRole: "oriental_bootstrap",
    operatorReference: "test-operator",
    acceptanceInbox: "operator@example.com",
    initialAdministrator: {
      userId: null,
      expectedEmail: "operator@example.com",
      expectedAccessVersion: null,
    },
    backupDirectory: "/mnt/offhost/oriental",
    backupMountPoint: "/mnt/offhost",
    backupStorageIdentity: "test-storage",
    backupMountSource: "storage:/oriental",
    backupStorageApprovalReference: "test-storage-approval",
    scheduledBackupAuthorizationReference: "test-daily-approval",
  });
}

const configFlags = ["--config", "/etc/oriental-shoes/acceptance/release.json"];

async function liveContext(config) {
  return createOperationContext(config, {
    scope: "live",
    runId: randomUUID(),
    deadline: Date.now() + 60000,
  });
}

test("preview plans contain no credentials and execute no primitive effects", async () => {
  const config = configuration();
  const args = parseReleaseArguments(["prepare", ...configFlags]);
  const plan = await runReleaseAction(await liveContext(config), args);
  assert.deepEqual(plan, planReleaseAction(config, args));

  assert.equal(plan.action, "prepare");
  assert.ok(plan.steps.some((step) => step.stage === "verified-checkpoint"));
  assert.doesNotMatch(
    JSON.stringify(plan),
    /DATABASE_URL|smtp|password|private\/|docker build/u,
  );
});

test("unbound administrator blocks protected plans while fresh prepare remains available", () => {
  const config = configuration();
  assert.doesNotThrow(() =>
    planReleaseAction(
      config,
      parseReleaseArguments(["prepare", ...configFlags]),
    ),
  );
  assert.throws(
    () =>
      planReleaseAction(
        config,
        parseReleaseArguments(["admin-preview", ...configFlags]),
      ),
    { code: "RELEASE_ADMISSION_MISSING", stage: "administrator-binding" },
  );
});

test("mismatched applied confirmation refuses before any action handler", async () => {
  const config = configuration();
  const args = parseReleaseArguments([
    "package",
    ...configFlags,
    "--apply",
    "--confirm-environment",
    "other",
    "--authorization-reference",
    "test-approval",
  ]);
  await assert.rejects(runReleaseAction(await liveContext(config), args), {
    code: "RELEASE_TARGET_MISMATCH",
    stage: "confirm-environment",
  });
});

test("applied lifecycle preserves lease refusal before invoking target tools", async () => {
  const base = await liveContext(configuration());
  let targetCalls = 0;
  const context = {
    ...base,
    files: {
      ...base.files,
      acquireLock: async () => {
        throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "run-lock-held");
      },
    },
    command: async () => {
      targetCalls++;
      throw Error("Unexpected target command");
    },
  };
  const args = parseReleaseArguments([
    "prepare",
    ...configFlags,
    "--apply",
    "--confirm-environment",
    "acceptance",
    "--authorization-reference",
    "test-approval",
  ]);
  await assert.rejects(runReleaseAction(context, args), {
    code: "RELEASE_ADMISSION_MISSING",
    stage: "run-lock-held",
  });
  assert.equal(targetCalls, 0);
});

test("inherited Docker, Compose and secret input cannot alter plans or leak in CLI errors", () => {
  const sentinel = "PRIVATE_SENTINEL_DO_NOT_PRINT";
  const child = spawnSync(
    process.execPath,
    [
      "scripts/operations/release.mjs",
      "inspect",
      "--config",
      `/nonexistent/${sentinel}`,
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        COMPOSE_ENV_FILES: `${sentinel}.env`,
        COMPOSE_FILE: `${sentinel}.yml`,
        DOCKER_CONTEXT: sentinel,
        DOCKER_HOST: `tcp://${sentinel}:2375`,
        HTTPS_PROXY: sentinel,
        SMTP_PASSWORD: sentinel,
      },
    },
  );
  assert.equal(child.status, 5);
  assert.equal(child.stdout, "");
  assert.doesNotMatch(child.stderr, new RegExp(sentinel, "u"));
  assert.equal(JSON.parse(child.stderr).code, "RELEASE_CHECK_FAILED");
  assert.equal(JSON.parse(child.stderr).stage, "private-input");
});

async function isolatedFiles(run) {
  const previous = process.env.P08_OPERATIONS_ISOLATED;
  process.env.P08_OPERATIONS_ISOLATED = "1";
  const runId = randomUUID();
  const root = await mkdtemp(path.join(tmpdir(), `p08-ops-test-${runId}-`));
  await chmod(root, 0o700);
  try {
    const config = parseReleaseConfig({
      ...configuration(),
      runtimeEnvFile: `${root}/runtime.env`,
      postgresEnvFile: `${root}/postgres.env`,
      backupDirectory: `${root}/mount/backups`,
      backupMountPoint: `${root}/mount`,
    });
    const context = await createOperationContext(config, {
      scope: "isolated",
      runId,
      deadline: Date.now() + 60000,
      root,
    });
    await run({ context, root });
  } finally {
    if (previous === undefined) delete process.env.P08_OPERATIONS_ISOLATED;
    else process.env.P08_OPERATIONS_ISOLATED = previous;
    await rm(root, { recursive: true, force: true });
  }
}

test("private files enforce canonical containment, mode, links and bounded reads", async () => {
  await isolatedFiles(async ({ context, root }) => {
    const filename = path.join(root, "private.json");
    await writeFile(filename, '{"safe":true}', { mode: 0o600 });
    assert.equal(await context.files.read(filename), '{"safe":true}');
    await chmod(filename, 0o644);
    await assert.rejects(context.files.read(filename), {
      code: "RELEASE_ADMISSION_MISSING",
    });
    await chmod(filename, 0o600);
    const symbolic = path.join(root, "symbolic.json");
    await symlink(filename, symbolic);
    await assert.rejects(context.files.read(symbolic), {
      code: "RELEASE_ADMISSION_MISSING",
    });
    const hard = path.join(root, "hard.json");
    await link(filename, hard);
    await assert.rejects(context.files.read(filename), {
      code: "RELEASE_ADMISSION_MISSING",
    });
    await unlink(hard);
    assert.throws(() => context.files.read(`${root}/../outside`), {
      code: "RELEASE_INPUT_INVALID",
    });
    const oversized = path.join(root, "oversized.json");
    await writeFile(oversized, "x".repeat(1048577), { mode: 0o600 });
    await assert.rejects(context.files.read(oversized), {
      code: "RELEASE_ADMISSION_MISSING",
    });
    const directory = path.join(root, "nested");
    await mkdir(directory, { mode: 0o700 });
    const alias = path.join(root, "alias");
    await symlink(directory, alias);
    await writeFile(path.join(directory, "record.json"), "{}", { mode: 0o600 });
    await assert.rejects(context.files.read(path.join(alias, "record.json")), {
      code: "RELEASE_ADMISSION_MISSING",
    });
  });
});

test("atomic private records preserve previous state on rejected writes and leave no partial files", async () => {
  await isolatedFiles(async ({ context, root }) => {
    const filename = path.join(root, "state.json");
    await context.files.writeJson(filename, { version: 1, phase: "PACKAGED" });
    await context.files.writeJson(filename, {
      version: 1,
      phase: "MAINTENANCE",
    });
    assert.equal(
      JSON.parse(await context.files.read(filename)).phase,
      "MAINTENANCE",
    );
    await assert.rejects(
      context.files.writeJson(filename, { oversized: "x".repeat(1048577) }),
      { code: "RELEASE_INPUT_INVALID" },
    );
    assert.equal(
      JSON.parse(await readFile(filename, "utf8")).phase,
      "MAINTENANCE",
    );
    assert.deepEqual(await readdir(root), ["state.json"]);
  });
});

test("exclusive run lease refuses overlap and never unlinks a replacement lock", async () => {
  await isolatedFiles(async ({ context, root }) => {
    const lease = await context.files.acquireLock();
    await assert.rejects(context.files.acquireLock(), {
      code: "RELEASE_ADMISSION_MISSING",
      stage: "run-lock-held",
    });
    assert.equal(
      JSON.parse(await context.files.read(path.join(root, "run.lock"))).runId,
      context.runId,
    );
    const retained = path.join(root, "retained.lock");
    await rename(path.join(root, "run.lock"), retained);
    await writeFile(path.join(root, "run.lock"), '{"foreign":true}', {
      mode: 0o600,
    });
    await assert.rejects(lease.release(), {
      code: "RELEASE_STATE_UNCERTAIN",
      stage: "run-lock-owner",
    });
    assert.equal(
      await readFile(path.join(root, "run.lock"), "utf8"),
      '{"foreign":true}',
    );
    await unlink(path.join(root, "run.lock"));
    await rename(retained, path.join(root, "run.lock"));
    await lease.release();
    assert.deepEqual(await readdir(root), []);
  });
});

test("isolated context requires its explicit programmatic guard and live paths cannot be overridden", async () => {
  const prior = process.env.P08_OPERATIONS_ISOLATED;
  delete process.env.P08_OPERATIONS_ISOLATED;
  const options = {
    scope: "isolated",
    runId: randomUUID(),
    deadline: Date.now() + 60000,
    root: "/tmp",
  };
  try {
    await assert.rejects(createOperationContext(configuration(), options), {
      code: "RELEASE_ADMISSION_MISSING",
    });
  } finally {
    if (prior !== undefined) process.env.P08_OPERATIONS_ISOLATED = prior;
  }
  await assert.rejects(
    createOperationContext(configuration(), { ...options, scope: "live" }),
    { code: "RELEASE_INPUT_INVALID" },
  );
});

test("preview primitive sentinels reject accidental writes, network or subprocess execution", () => {
  const script = `
    import fs from 'node:fs'; import fsp from 'node:fs/promises';
    import cp from 'node:child_process'; import net from 'node:net';
    import http from 'node:http'; import https from 'node:https';
    import {syncBuiltinESMExports} from 'node:module';
    let attempts=0;
    const prohibited=()=>{attempts++;throw Error('forbidden-effect')};
    for(const key of ['spawn','spawnSync','exec','execFile','execSync','execFileSync','fork']) cp[key]=prohibited;
    for(const key of ['writeFile','appendFile','mkdir','rename','unlink','rm','symlink','link','chmod','chown']) {fs[key]=prohibited;fsp[key]=prohibited;}
    const originalOpen=fsp.open;
    fsp.open=(filename,flags,...rest)=>{if(typeof flags==='string' && /[wax+]/u.test(flags))return prohibited();return originalOpen(filename,flags,...rest)};
    net.connect=prohibited;net.createConnection=prohibited;http.request=prohibited;http.get=prohibited;https.request=prohibited;https.get=prohibited;globalThis.fetch=prohibited;
    syncBuiltinESMExports();
    const {runReleaseAction,createOperationContext}=await import('./scripts/operations/release.mjs');
    const {parseReleaseArguments}=await import('./scripts/operations/release-config.mjs');
    const config=JSON.parse(fs.readFileSync(0,'utf8'));
    const context=await createOperationContext(config,{scope:'live',runId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',deadline:Date.now()+60000});
    const plan=await runReleaseAction(context,parseReleaseArguments(['prepare','--config','/etc/oriental-shoes/acceptance/release.json']));
    console.log(JSON.stringify({attempts,plan}));
  `;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8", input: JSON.stringify(configuration()) },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).attempts, 0);
  assert.equal(JSON.parse(child.stdout).plan.action, "prepare");
});

test("isolated adapters reject foreign private directories, other runs and unknown scope", async () => {
  await isolatedFiles(async ({ context, root }) => {
    await assert.rejects(
      createOperationContext(
        parseReleaseConfig({
          ...context.config,
          runtimeEnvFile: "/etc/private/foreign.env",
        }),
        {
          scope: "isolated",
          root,
          runId: context.runId,
          deadline: Date.now() + 60000,
        },
      ),
      { code: "RELEASE_ADMISSION_MISSING", stage: "isolated-paths" },
    );
    const unrelated = path.join(root, "unrelated-private");
    await mkdir(unrelated, { mode: 0o700 });
    const options = {
      scope: "isolated",
      runId: context.runId,
      deadline: Date.now() + 60000,
      root: unrelated,
    };
    await assert.rejects(createOperationContext(context.config, options), {
      code: "RELEASE_ADMISSION_MISSING",
      stage: "isolated-root",
    });
    await assert.rejects(
      createOperationContext(context.config, {
        ...options,
        root,
        runId: randomUUID(),
      }),
      { code: "RELEASE_ADMISSION_MISSING", stage: "isolated-root" },
    );
    await assert.rejects(
      createOperationContext(context.config, { ...options, scope: "typo" }),
      { code: "RELEASE_INPUT_INVALID", stage: "context-scope" },
    );
    assert.deepEqual(await readdir(unrelated), []);
  });
});

test("separate isolated invocation IDs share only the admitted resource namespace and exclusive lease", async () => {
  await isolatedFiles(async ({ context, root }) => {
    const laterRun = randomUUID(),
      businessTime = Date.UTC(2026, 10, 17, 23, 30);
    const later = await createOperationContext(context.config, {
      scope: "isolated",
      runId: laterRun,
      isolationId: context.resourceRunId,
      root,
      deadline: Date.now() + 60000,
      clock: () => businessTime,
    });
    assert.notEqual(later.runId, context.runId);
    assert.equal(later.projectName, context.projectName);
    assert.equal(later.resourceRunId, context.resourceRunId);
    assert.equal(later.clock(), businessTime);
    const first = await context.files.acquireLock();
    try {
      await assert.rejects(later.files.acquireLock(), {
        code: "RELEASE_ADMISSION_MISSING",
      });
    } finally {
      await first.release();
    }
    const second = await later.files.acquireLock();
    await later.files.assertLock();
    await second.release();
    assert.ok(!(await readdir(root)).includes("run.lock"));
    await assert.rejects(
      createOperationContext(context.config, {
        scope: "isolated",
        runId: randomUUID(),
        isolationId: randomUUID(),
        root,
        deadline: Date.now() + 60000,
      }),
      { code: "RELEASE_ADMISSION_MISSING" },
    );
  });
});

test("private administrator binding compares exact pretty config bytes and preserves all other fields", async () => {
  await isolatedFiles(async ({ context }) => {
    const userId = randomUUID(),
      config = parseReleaseConfig({
        ...context.config,
        initialAdministrator: {
          userId,
          expectedEmail: "operator@example.com",
          expectedAccessVersion: 1,
        },
      });
    const boundContext = { ...context, config };
    const original = JSON.stringify(config, null, 2) + "\n";
    await writeFile(context.paths.config, original, { mode: 0o600 });
    const lease = await context.files.acquireLock();
    try {
      const updated = await replaceAdministratorBinding(boundContext, {
        expectedConfigSha256: sha256(original),
        authority: { userId, email: "operator@example.com", accessVersion: 2 },
      });
      assert.deepEqual(updated, {
        ...config,
        initialAdministrator: {
          ...config.initialAdministrator,
          expectedAccessVersion: 2,
        },
      });
      assert.deepEqual(
        JSON.parse(await readFile(context.paths.config, "utf8")),
        updated,
      );
      const committed = await readFile(context.paths.config, "utf8");
      await assert.rejects(
        replaceAdministratorBinding(boundContext, {
          expectedConfigSha256: sha256(original),
          authority: {
            userId,
            email: "operator@example.com",
            accessVersion: 2,
          },
        }),
        {
          code: "RELEASE_TARGET_MISMATCH",
          stage: "administrator-config-changed",
        },
      );
      assert.equal(await readFile(context.paths.config, "utf8"), committed);
      assert.ok(
        !(await readdir(context.paths.state)).some((name) =>
          name.endsWith(".binding.partial"),
        ),
      );
    } finally {
      await lease.release();
    }
  });
});

test("concurrent config drift is preserved and a lost binding rename reply is classified without retry", async () => {
  await isolatedFiles(async ({ context }) => {
    const userId = randomUUID(),
      config = parseReleaseConfig({
        ...context.config,
        initialAdministrator: {
          userId,
          expectedEmail: "operator@example.com",
          expectedAccessVersion: 1,
        },
      });
    const boundContext = { ...context, config },
      original = JSON.stringify(config, null, 2);
    await writeFile(context.paths.config, original, { mode: 0o600 });
    const lease = await context.files.acquireLock();
    const originalOpen = fsPromises.open,
      originalRename = fsPromises.rename;
    try {
      let changed = false;
      const concurrent = JSON.stringify({
        ...config,
        operatorReference: "different-confirmed-operator",
      });
      fsPromises.open = async (filename, ...rest) => {
        if (String(filename).endsWith(".binding.partial") && !changed) {
          changed = true;
          await writeFile(context.paths.config, concurrent);
        }
        return originalOpen(filename, ...rest);
      };
      syncBuiltinESMExports();
      await assert.rejects(
        replaceAdministratorBinding(boundContext, {
          expectedConfigSha256: sha256(original),
          authority: {
            userId,
            email: "operator@example.com",
            accessVersion: 2,
          },
        }),
        {
          code: "RELEASE_TARGET_MISMATCH",
          stage: "administrator-config-changed",
        },
      );
      assert.equal(await readFile(context.paths.config, "utf8"), concurrent);
      assert.ok(changed);
      fsPromises.open = originalOpen;
      syncBuiltinESMExports();
      await writeFile(context.paths.config, original);
      let renames = 0;
      fsPromises.rename = async (from, to) => {
        const result = await originalRename(from, to);
        if (to === context.paths.config) {
          renames++;
          throw Object.assign(Error("lost rename reply"), { code: "EIO" });
        }
        return result;
      };
      syncBuiltinESMExports();
      await assert.rejects(
        replaceAdministratorBinding(boundContext, {
          expectedConfigSha256: sha256(original),
          authority: {
            userId,
            email: "operator@example.com",
            accessVersion: 2,
          },
        }),
        {
          code: "RELEASE_STATE_UNCERTAIN",
          stage: "administrator-config-published-unconfirmed",
        },
      );
      assert.equal(renames, 1);
      assert.equal(
        JSON.parse(await readFile(context.paths.config, "utf8"))
          .initialAdministrator.expectedAccessVersion,
        2,
      );
      assert.ok(
        !(await readdir(context.paths.state)).some((name) =>
          name.endsWith(".binding.partial"),
        ),
      );
    } finally {
      fsPromises.open = originalOpen;
      fsPromises.rename = originalRename;
      syncBuiltinESMExports();
      await lease.release();
    }
  });
});

test("primary PostgreSQL admission binds its actual writable mount to the owned project volume", async (t) => {
  const { assertPostgresStorage } = await import("./operation-runtime.mjs");
  const project = "oriental-shoes-test",
    mount = {
      Type: "volume",
      Name: `${project}_postgres_data`,
      Destination: "/var/lib/postgresql",
      Source: "/var/lib/docker/volumes/owned/_data",
      RW: true,
    };
  assert.doesNotThrow(() => assertPostgresStorage(project, [mount]));
  for (const [label, mounts] of [
    ["absent", []],
    ["foreign", [{ ...mount, Name: "foreign_live" }]],
    ["bind", [{ ...mount, Type: "bind" }]],
    ["readonly", [{ ...mount, RW: false }]],
    [
      "wrong destination",
      [{ ...mount, Destination: "/var/lib/postgresql/data" }],
    ],
    ["extra live mount", [mount, { ...mount, Name: "foreign_live" }]],
    ["unsafe source", [{ ...mount, Source: "/var/lib/docker/../foreign" }]],
  ])
    await t.test(label, () =>
      assert.throws(() => assertPostgresStorage(project, mounts), {
        code: "RELEASE_TARGET_MISMATCH",
        stage: "postgres-storage-topology",
      }),
    );
});

test("only Caddy publishes the three selected ports and isolated bindings stay on loopback", async (t) => {
  const { assertServicePorts } = await import("./operation-runtime.mjs");
  const live = Object.fromEntries(
    ["80/tcp", "443/tcp", "443/udp"].map((port) => [
      port,
      [{ HostIp: "", HostPort: port.split("/")[0] }],
    ]),
  );
  const isolated = Object.fromEntries(
    Object.keys(live).map((port) => [
      port,
      [{ HostIp: "127.0.0.1", HostPort: "" }],
    ]),
  );
  assert.doesNotThrow(() => assertServicePorts("live", "caddy", live));
  assert.doesNotThrow(() => assertServicePorts("isolated", "caddy", isolated));
  for (const role of ["api", "web", "postgres"]) {
    assert.doesNotThrow(() => assertServicePorts("live", role, null));
    await t.test(role + " exposure", () =>
      assert.throws(
        () =>
          assertServicePorts("live", role, {
            "4000/tcp": [{ HostIp: "", HostPort: "4000" }],
          }),
        { code: "RELEASE_TARGET_MISMATCH", stage: "private-service-published" },
      ),
    );
  }
  for (const [label, scope, bindings] of [
    [
      "extra port",
      "live",
      { ...live, "2019/tcp": [{ HostIp: "", HostPort: "2019" }] },
    ],
    [
      "wrong public port",
      "live",
      { ...live, "443/tcp": [{ HostIp: "", HostPort: "444" }] },
    ],
    ["test on public interface", "isolated", live],
    ["live on loopback", "live", isolated],
  ])
    await t.test(label, () =>
      assert.throws(() => assertServicePorts(scope, "caddy", bindings), {
        code: "RELEASE_TARGET_MISMATCH",
      }),
    );
});
