import {
  runPrepare,
  observeAdministrator,
  applyAdministrator,
  runRestart,
  runBackup,
  recoverReplacement,
  openTraffic,
} from "./release-lifecycle.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import childProcess, { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  chmod,
  mkdir,
  writeFile,
  readFile,
  readdir,
  cp,
  rename,
  rm,
  realpath,
  symlink,
} from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import https from "node:https";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { isIP } from "node:net";
import {
  ReleaseFailure,
  parseReleaseConfig,
  parseReleaseArguments,
  renderCaddyMode,
} from "./release-config.mjs";
import {
  createOperationContext,
  runReleaseAction,
  changeCaddyMode,
} from "./release.mjs";

import {
  createVerifiedBackup,
  readDatabaseFingerprint,
  verifyBackupInDisposableDatabase,
  pruneVerifiedDailyBackups,
} from "./backup.mjs";
import {
  observeDeployment,
  observeCaddyMode,
  observeCaddyResponse,
  sha256,
  queryDatabase,
} from "./operation-runtime.mjs";
import {
  parsePackageRecord,
  parseServiceSnapshot,
  initialReleaseState,
  recordIdentity,
  parseBackupManifest,
  parseBackupIndex,
} from "./operations-records.mjs";

const execute = promisify(execFile);
const discoveryEnvironment = Object.freeze({
  PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
  HOME: homedir(),
  LANG: "C.UTF-8",
});
const repository = path.resolve(import.meta.dirname, "../..");
const bases = {
  node: "node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496",
  postgres:
    "postgres:18.4@sha256:a02db8cac496f15b094798a38254f14d6e00741f709360e5e00bb6668ea31636",
  caddy:
    "caddy:2@sha256:f971688b2aaf1a26d256de552f17fb13f64fc5ed2dee4cf40c7f9d70cea0e12d",
};

async function command(executable, argv, options = {}) {
  const response = await execute(executable, argv, {
    encoding: "utf8",
    maxBuffer: 1048576,
    timeout: 1800000,
    env: discoveryEnvironment,
    ...options,
  });
  return response.stdout;
}

async function snapshotSource(root) {
  const source = path.join(root, "snapshot");
  await mkdir(source, { mode: 0o700 });
  const filenames = (
    await command("git", [
      "-C",
      repository,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ])
  )
    .split("\0")
    .filter(Boolean);
  for (const filename of new Set(filenames)) {
    if (filename.endsWith(".xlsx")) continue;
    const destination = path.join(source, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await cp(path.join(repository, filename), destination, {
        recursive: false,
        errorOnExist: true,
      });
    } catch (failure) {
      if (failure?.code !== "ENOENT") throw failure;
    }
  }
  await command("git", ["-C", source, "init", "--quiet"]);
  await command("git", ["-C", source, "add", "."]);
  await command("git", [
    "-C",
    source,
    "-c",
    "user.name=P08 Isolated Fixture",
    "-c",
    "user.email=p08-fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "Disposable Group 5 source fixture",
  ]);
  const revision = (
    await command("git", ["-C", source, "rev-parse", "HEAD"])
  ).trim();
  const release = path.join(root, "deployment", "releases", revision);
  await mkdir(path.dirname(release), { recursive: true });
  await rename(source, release);
  return { revision, release };
}

async function fixture(root, runId, revision) {
  const endpoint = JSON.parse(
    await command("docker", [
      "context",
      "inspect",
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ]),
  );
  assert.match(endpoint, /^unix:\/\/\//u);
  const runtimeEnvFile = path.join(root, "runtime.env"),
    postgresEnvFile = path.join(root, "postgres.env");
  const config = parseReleaseConfig({
    version: 1,
    environmentId: "isolated-acceptance",
    projectName: "oriental-shoes-isolated-acceptance",
    expectedMachineIdSha256: "a".repeat(64),
    expectedDockerEngineId: (
      await command("docker", [
        "--host",
        endpoint,
        "info",
        "--format",
        "{{.ID}}",
      ])
    ).trim(),
    appDomain: "acceptance.example.com",
    acceptanceCidrs: ["127.0.0.1/32"],
    releaseRevision: revision,
    nodeImage: bases.node,
    postgresImage: bases.postgres,
    caddyImage: bases.caddy,
    runtimeEnvFile,
    postgresEnvFile,
    databaseName: "oriental",
    applicationRole: "oriental_app",
    bootstrapRole: "oriental_bootstrap",
    operatorReference: "p08-isolated-operator",
    acceptanceInbox: "operator@example.com",
    initialAdministrator: {
      userId: null,
      expectedEmail: "operator@example.com",
      expectedAccessVersion: null,
    },
    backupDirectory: `${root}/mount/backups`,
    backupMountPoint: `${root}/mount`,
    backupStorageIdentity: "isolated-storage",
    backupMountSource: "isolated-source",
    backupStorageApprovalReference: "isolated-approval",
    scheduledBackupAuthorizationReference: "isolated-daily-authorization",
  });
  const appPassword = 'isolated-app-$"\\=password';
  const rawMailPassword = 'isolated-mail-$"\\=password';
  const runtime = {
    NODE_ENV: "production",
    API_HOST: "0.0.0.0",
    API_PORT: "4000",
    API_PREFIX: "/api/v1",
    TRUST_PROXY: "1",
    AUTH_COOKIE_SAME_SITE: "lax",
    SHUTDOWN_TIMEOUT_MS: "10000",
    LOG_LEVEL: "info",
    WEB_APP_URL: `https://${config.appDomain}`,
    CORS_ORIGINS: `https://${config.appDomain}`,
    ORDER_BUSINESS_TIME_ZONE: "Asia/Riyadh",
    EMAIL_PROVIDER: "smtp",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_ALLOW_SELF_SIGNED_TLS: "false",
    SMTP_TLS_MIN_VERSION: "TLSv1.2",
    SMTP_HOST: "smtp.invalid",
    SMTP_USER: "isolated-mailer",
    SMTP_PASSWORD: rawMailPassword,
    MAIL_FROM_NAME: "Isolated Operations",
    MAIL_FROM_ADDRESS: "mail@example.com",
    MAIL_REPLY_TO: "operator@example.com",
    AUTH_JWT_SECRET: "isolated-first-auth-".repeat(3),
    AUTH_REFRESH_JWT_SECRET: "isolated-second-auth-".repeat(3),
    AUTH_VERIFICATION_JWT_SECRET: "isolated-third-auth-".repeat(3),
    AUTH_RESET_JWT_SECRET: "isolated-fourth-auth-".repeat(3),
    DATABASE_URL: `postgresql://${config.applicationRole}:${encodeURIComponent(appPassword)}@postgres:5432/${config.databaseName}?schema=public`,
  };
  await writeFile(
    runtimeEnvFile,
    Object.entries(runtime)
      .map(([key, literal]) => `${key}=${literal}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  await writeFile(
    postgresEnvFile,
    `POSTGRES_USER=${config.bootstrapRole}\nPOSTGRES_PASSWORD=isolated-separate-bootstrap\nPOSTGRES_DB=postgres\n`,
    { mode: 0o600 },
  );
  const operationalContext = await createOperationContext(config, {
    scope: "isolated",
    runId,
    root,
    deadline: Date.now() + 1800000,
    dockerEndpoint: endpoint,
  });
  const context = Object.freeze({
    ...operationalContext,
    command: async (request) => {
      const tracked = trackOperationRequest(
        context,
        request,
        operationalContext.runId,
      );
      if (request.stage === "package-build") {
        const tagIndex = request.argv.indexOf("--tag");
        assert.ok(tagIndex >= 0);
        context.captures.expectedImageTags.add(request.argv[tagIndex + 1]);
        context.captures.expectedImageRuns.set(
          request.argv[tagIndex + 1],
          operationalContext.runId,
        );
      }
      try {
        return await operationalContext.command(request);
      } finally {
        if (tracked || request.stage === "package-build")
          await captureKnownResources(context);
      }
    },
    captures: {
      containers: new Map(),
      volumes: new Map(),
      networks: new Map(),
      images: new Map(),
      expectedContainerNames: new Map(),
      expectedImageTags: new Set(),
      expectedImageRuns: new Map(),
    },
  });
  await mkdir(context.paths.dockerConfig, { mode: 0o700 });
  const plugins = JSON.parse(
    await command("docker", [
      "info",
      "--format",
      "{{json .ClientInfo.Plugins}}",
    ]),
  );
  await mkdir(path.join(context.paths.dockerConfig, "cli-plugins"), {
    mode: 0o700,
  });
  for (const pluginName of ["compose", "buildx"]) {
    const plugin = plugins.find((candidate) => candidate.Name === pluginName);
    assert.equal(typeof plugin?.Path, "string");
    await symlink(
      await realpath(plugin.Path),
      path.join(
        context.paths.dockerConfig,
        "cli-plugins",
        `docker-${pluginName}`,
      ),
    );
  }

  await mkdir(context.paths.caddy, { mode: 0o755 });
  await chmod(context.paths.caddy, 0o755);
  const base = (
    await readFile(path.join(repository, "deploy/Caddyfile"), "utf8")
  ).replace(
    "encode zstd gzip",
    "log {\n output stdout\n format json\n }\n encode zstd gzip",
  );
  await writeFile(
    path.join(context.paths.caddy, "Caddyfile"),
    `{\n local_certs\n}\n${base}`,
    { mode: 0o644 },
  );
  await writeFile(
    path.join(context.paths.caddy, "mode.caddy"),
    renderCaddyMode(config, "normal"),
    { mode: 0o644 },
  );
  const labels = `      io.oriental-shoes.scope: isolated\n      io.oriental-shoes.run: ${runId}\n`;
  let override = "services:\n";
  for (const service of ["postgres", "api", "web", "caddy"]) {
    override += `  ${service}:\n    labels:\n${labels}`;
    if (service === "caddy")
      override +=
        '    ports: !override\n      - "127.0.0.1::80"\n      - "127.0.0.1::443"\n      - "127.0.0.1::443/udp"\n';
  }
  override += "volumes:\n";
  for (const volume of ["postgres_data", "caddy_data", "caddy_config"])
    override += `  ${volume}:\n    labels:\n${labels}`;
  override += `networks:\n  default:\n    labels:\n${labels}`;
  await writeFile(path.join(root, "compose.isolated.yaml"), override, {
    mode: 0o600,
  });
  return { context, appPassword, rawMailPassword };
}

function trackOperationRequest(context, request, runId) {
  if (request.executable !== "docker") return false;
  const argv = request.argv;
  let tracked = false;
  if (argv[0] === "compose" && argv.includes("up"))
    for (const role of ["api", "web", "postgres", "caddy"])
      if (argv.includes(role)) {
        context.captures.expectedContainerNames.set(
          `${context.projectName}-${role}-1`,
          role,
        );
        tracked = true;
      }
  const nameIndex = argv.indexOf("--name");
  if (nameIndex >= 0) {
    const role = argv
      .find((value) => value.startsWith("io.oriental-shoes.role="))
      ?.split("=")[1];
    if (
      ["package-verifier", "backup-restore", "operation-tool"].includes(role)
    ) {
      assert.ok(argv.includes(`io.oriental-shoes.run=${runId}`));
      context.captures.expectedContainerNames.set(argv[nameIndex + 1], {
        role,
        runId,
      });
      tracked = true;
    }
  }
  return tracked;
}

async function nextInvocation(base, config = base.config) {
  const actual = await createOperationContext(config, {
    scope: "isolated",
    runId: randomUUID(),
    isolationId: base.resourceRunId,
    root: base.paths.state,
    deadline: Date.now() + 1800000,
    dockerEndpoint: base.dockerEndpoint,
  });
  return Object.freeze({
    ...actual,
    captures: base.captures,
    command: async (request) => {
      const tracked = trackOperationRequest(base, request, actual.runId);
      if (request.stage === "package-build") {
        const tag = request.argv[request.argv.indexOf("--tag") + 1];
        base.captures.expectedImageTags.add(tag);
        base.captures.expectedImageRuns.set(tag, actual.runId);
      }
      try {
        return await actual.command(request);
      } finally {
        if (tracked || request.stage === "package-build")
          await captureKnownResources(base);
      }
    },
  });
}

async function dockerCommand(context, argv, options = {}) {
  return command("docker", argv, {
    timeout: 30000,
    ...options,
    env: context.toolEnvironment,
  });
}

async function compose(context, image, argv, input) {
  const config = context.config;
  const operation = argv.find((argument) =>
    ["up", "run", "restart", "stop"].includes(argument),
  );
  if (operation === "run") {
    const role = argv.find((argument) =>
      ["api", "web", "postgres", "caddy"].includes(argument),
    );
    const name = `${context.projectName}-tool-${randomUUID()}`;
    context.captures.expectedContainerNames.set(name, role);
    argv = [argv[0], "--name", name, ...argv.slice(1)];
  }
  if (operation === "up" && argv.includes("api") && !argv.includes("--no-deps"))
    context.captures.expectedContainerNames.set(
      `${context.projectName}-postgres-1`,
      "postgres",
    );
  if (["up", "restart", "stop"].includes(operation))
    for (const role of ["postgres", "api", "web", "caddy"])
      if (argv.includes(role))
        context.captures.expectedContainerNames.set(
          `${context.projectName}-${role}-1`,
          role,
        );
  let response;
  try {
    response = await context.command({
      executable: "docker",
      argv: [
        "compose",
        "--project-name",
        context.projectName,
        "--project-directory",
        context.paths.release,
        "--file",
        `${context.paths.release}/deploy/compose.production.yaml`,
        "--file",
        `${context.paths.state}/compose.isolated.yaml`,
        ...argv,
      ],
      stage: "isolated-compose",
      ...(typeof input === "string" || input?.input !== undefined
        ? { input: typeof input === "string" ? input : input.input }
        : {}),
      timeoutMs: 1800000,
      publicEnvironment: {
        ENVIRONMENT_ID: config.environmentId,
        POSTGRES_IMAGE: config.postgresImage,
        CADDY_IMAGE: config.caddyImage,
        APPLICATION_IMAGE: image,
        RUNTIME_ENV_FILE: config.runtimeEnvFile,
        POSTGRES_ENV_FILE: config.postgresEnvFile,
        APP_DOMAIN: config.appDomain,
        CADDY_CONFIG_DIRECTORY: context.paths.caddy,
      },
    });
  } finally {
    await captureKnownResources(context);
  }
  if (input?.expectedFailure) {
    assert.notEqual(response.exitCode, 0);
    return response;
  }
  assert.equal(response.exitCode, 0, `isolated compose ${argv[0]} failed`);
  return response.stdout;
}

async function tlsRequest(config, port, ca, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: config.appDomain,
        port,
        servername: config.appDomain,
        ca,
        method: options.method ?? "GET",
        headers: {
          "X-Forwarded-For": "127.0.0.1",
          ...options.headers,
          ...(options.body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                Origin: `https://${config.appDomain}`,
              }),
        },
        lookup: (_hostname, options, callback) =>
          options?.all
            ? callback(null, [{ address: "127.0.0.1", family: 4 }])
            : callback(null, "127.0.0.1", 4),
        path: pathname,
        timeout: 10000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.on("timeout", () =>
      request.destroy(new Error("isolated TLS timeout")),
    );
    request.end(options.body);
  });
}

async function tlsReady(config, port, ca, pathname) {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      return await tlsRequest(config, port, ca, pathname);
    } catch (failure) {
      if (
        Date.now() >= deadline ||
        !["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(
          failure.code,
        )
      )
        throw failure;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function assertOwnedLabels(
  context,
  labels,
  role,
  runId = context.resourceRunId,
) {
  assert.equal(labels?.["io.oriental-shoes.scope"], "isolated");
  assert.equal(labels?.["io.oriental-shoes.run"], runId);
  assert.equal(
    labels?.["io.oriental-shoes.environment"],
    context.config.environmentId,
  );
  assert.equal(labels?.["com.docker.compose.project"], context.projectName);
  assert.equal(labels?.["io.oriental-shoes.role"], role);
}

async function optionalInspection(context, family, name) {
  const formats = {
    container:
      '{"Id":{{json .Id}},"Name":{{json .Name}},"Image":{{json .Image}},"Config":{"Labels":{{json .Config.Labels}}},"State":{"Status":{{json .State.Status}},"ExitCode":{{json .State.ExitCode}},"Health":{"Status":{{with (index .State "Health")}}{{json .Status}}{{else}}null{{end}}}}}',
    image:
      '{"Id":{{json .Id}},"RepoTags":{{json .RepoTags}},"Config":{"Labels":{{json .Config.Labels}}}}',
    volume:
      '{"Name":{{json .Name}},"CreatedAt":{{json .CreatedAt}},"Labels":{{json .Labels}}}',
    network:
      '{"Id":{{json .Id}},"Name":{{json .Name}},"Labels":{{json .Labels}}}',
  };
  const argv =
    family === "container"
      ? ["inspect", "--format", formats[family], name]
      : [family, "inspect", "--format", formats[family], name];
  try {
    return JSON.parse(await dockerCommand(context, argv));
  } catch (failure) {
    if (
      failure.code === 1 &&
      (/\bno such (?:object|container|volume|network|image)(?::|\b)/iu.test(
        failure.stderr ?? "",
      ) ||
        (family === "network" &&
          (failure.stderr ?? "").includes(`network ${name} not found`)))
    )
      return null;
    throw failure;
  }
}

async function captureKnownResources(context) {
  for (const [name, expected] of context.captures.expectedContainerNames) {
    const role = typeof expected === "string" ? expected : expected.role,
      runId =
        typeof expected === "string" ? context.resourceRunId : expected.runId;
    const observed = await optionalInspection(context, "container", name);
    if (!observed) continue;
    assertOwnedLabels(context, observed.Config.Labels, role, runId);
    context.captures.containers.set(observed.Id, {
      id: observed.Id,
      role,
      runId,
      imageId: observed.Image,
    });
  }
  for (const [suffix, role] of [
    ["postgres_data", "postgres-data"],
    ["caddy_data", "caddy-data"],
    ["caddy_config", "caddy-config"],
  ]) {
    const name = `${context.projectName}_${suffix}`;
    const observed = await optionalInspection(context, "volume", name);
    if (!observed) continue;
    assertOwnedLabels(context, observed.Labels, role);
    context.captures.volumes.set(name, {
      name,
      role,
      createdAt: observed.CreatedAt,
    });
  }
  const network = await optionalInspection(
    context,
    "network",
    `${context.projectName}_default`,
  );
  if (network) {
    assertOwnedLabels(context, network.Labels, "application-network");
    context.captures.networks.set(network.Id, { id: network.Id });
  }
  for (const tag of context.captures.expectedImageTags) {
    const image = await optionalInspection(context, "image", tag);
    if (!image) continue;
    const runId = context.captures.expectedImageRuns.get(tag) ?? context.runId;
    assertOwnedLabels(context, image.Config.Labels, "application-image", runId);
    assert.equal(
      image.Config.Labels["org.opencontainers.image.revision"],
      context.config.releaseRevision,
    );
    const buildId = tag.slice(tag.length - 36);
    assert.match(buildId, /^[0-9a-f-]{36}$/u);
    assert.equal(image.Config.Labels["io.oriental-shoes.build"], buildId);
    context.captures.images.set(image.Id, {
      id: image.Id,
      tag,
      buildId,
      runId,
    });
  }
}

async function ownedCleanup(context) {
  const failures = [];
  const clean = async (operation) => {
    try {
      await operation();
    } catch (failure) {
      failures.push(failure);
    }
  };
  assert.equal(
    await dockerCommand(context, ["info", "--format", "{{.ID}}"]).then(
      (value) => value.trim(),
    ),
    context.config.expectedDockerEngineId,
  );
  await clean(() => captureKnownResources(context));
  for (const captured of context.captures.containers.values())
    await clean(async () => {
      const observed = await optionalInspection(
        context,
        "container",
        captured.id,
      );
      if (!observed) return;
      assertOwnedLabels(
        context,
        observed.Config.Labels,
        captured.role,
        captured.runId,
      );
      assert.equal(observed.Id, captured.id);
      assert.equal(observed.Image, captured.imageId);
      await dockerCommand(context, ["rm", "-f", "-v", captured.id]);
    });
  for (const captured of context.captures.volumes.values())
    await clean(async () => {
      const observed = await optionalInspection(
        context,
        "volume",
        captured.name,
      );
      if (!observed) return;
      assertOwnedLabels(context, observed.Labels, captured.role);
      assert.equal(observed.CreatedAt, captured.createdAt);
      await dockerCommand(context, ["volume", "rm", captured.name]);
    });
  for (const captured of context.captures.networks.values())
    await clean(async () => {
      const observed = await optionalInspection(
        context,
        "network",
        captured.id,
      );
      if (!observed) return;
      assertOwnedLabels(context, observed.Labels, "application-network");
      assert.equal(observed.Id, captured.id);
      await dockerCommand(context, ["network", "rm", captured.id]);
    });
  for (const captured of context.captures.images.values())
    await clean(async () => {
      const observed = await optionalInspection(context, "image", captured.id);
      if (!observed) return;
      assert.equal(observed.Id, captured.id);
      assert.equal(
        observed.Config.Labels["io.oriental-shoes.run"],
        captured.runId,
      );
      assert.equal(
        observed.Config.Labels["io.oriental-shoes.scope"],
        "isolated",
      );
      assert.ok(
        observed.RepoTags === null ||
          observed.RepoTags.length === 0 ||
          (observed.RepoTags.length === 1 &&
            observed.RepoTags[0] === captured.tag),
      );
      await dockerCommand(context, ["image", "rm", captured.id]);
    });
  for (const family of ["container", "volume", "network", "image"])
    await clean(async () => {
      const argv =
        family === "container" ? ["ps", "-aq"] : [family, "ls", "-q"];
      assert.equal(
        (
          await dockerCommand(context, [
            ...argv,
            "--filter",
            `label=com.docker.compose.project=${context.projectName}`,
            "--filter",
            "label=io.oriental-shoes.scope=isolated",
          ])
        ).trim(),
        "",
      );
    });
  if (failures.length)
    throw new AggregateError(failures, "Owned isolated cleanup incomplete");
}

async function saveFailureEvidence(context, failure) {
  const root = await mkdtemp(
    path.join(tmpdir(), `p08-g5-failure-${context.runId}-`),
  );
  await chmod(root, 0o700);
  const describe = (error) => ({
    name: error?.name,
    message: error?.message,
    code: error?.code,
    stage: error?.stage,
    stack: error?.stack,
    ...(error instanceof AggregateError
      ? { errors: error.errors.map(describe) }
      : {}),
  });
  await writeFile(
    path.join(root, "operation-error.json"),
    JSON.stringify(describe(failure), null, 2),
    { mode: 0o600 },
  );
  for (const captured of context.captures.containers.values()) {
    const observed = await optionalInspection(
      context,
      "container",
      captured.id,
    );
    if (!observed) continue;
    assertOwnedLabels(context, observed.Config.Labels, captured.role);
    await writeFile(
      path.join(root, `${captured.role}.state.json`),
      JSON.stringify({
        status: observed.State.Status,
        exitCode: observed.State.ExitCode,
        health: observed.State.Health?.Status,
      }),
      { mode: 0o600 },
    );
    try {
      const logs = await execute(
        "docker",
        ["logs", "--tail", "150", captured.id],
        { encoding: "utf8", maxBuffer: 1048576, env: context.toolEnvironment },
      );
      await writeFile(
        path.join(root, `${captured.role}.log`),
        logs.stdout + logs.stderr,
        { mode: 0o600 },
      );
    } catch (failure) {
      await writeFile(
        path.join(root, `${captured.role}.log`),
        String(failure.stdout ?? "") + String(failure.stderr ?? ""),
        { mode: 0o600 },
      );
    }
  }
  return root;
}

test(
  "isolated package boots real private services and verifies raw env, trusted TLS and Caddy recovery",
  { timeout: 1800000 },
  async (testContext) => {
    assert.equal(
      process.env.P08_OPERATIONS_ISOLATED,
      "1",
      "Set P08_OPERATIONS_ISOLATED=1 explicitly; no target fallback is allowed.",
    );
    const runId = randomUUID();
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), `p08-ops-test-${runId}-`)),
    );
    await chmod(root, 0o700);
    let context;
    let operationFailure = null;

    try {
      const source = await snapshotSource(root);
      const prepared = await fixture(root, runId, source.revision);
      context = prepared.context;
      const applied = parseReleaseArguments([
        "package",
        "--config",
        context.paths.config,
        "--apply",
        "--confirm-environment",
        context.config.environmentId,
        "--authorization-reference",
        "isolated-package-authorization",
      ]);
      const packaged = await runReleaseAction(context, applied);
      assert.equal(packaged.phase, "PACKAGED");
      assert.ok("evidenceReference" in packaged);
      const manifest = JSON.parse(
        await context.files.read(packaged.evidenceReference),
      );
      assert.equal(manifest.scope, "isolated");
      assert.equal(manifest.revision, source.revision);
      const image = manifest.applicationImageId;

      assert.match(image, /^sha256:[0-9a-f]{64}$/u);
      await captureKnownResources(context);
      const publishedPackage = await context.files.read(
        packaged.evidenceReference,
      );
      let verifierId = null;
      let loseCreationOnce = true;
      const lostCreation = Object.freeze({
        ...context,
        command: async (request) => {
          const response = await context.command(request);
          if (
            request.stage === "package-verifier-create" &&
            response.exitCode === 0 &&
            loseCreationOnce
          ) {
            loseCreationOnce = false;
            verifierId = response.stdout.trim();
            assert.match(verifierId, /^[0-9a-f]{64}$/u);
            context.captures.containers.set(verifierId, {
              id: verifierId,
              role: "package-verifier",
            });
            throw new ReleaseFailure(
              "RELEASE_STATE_UNCERTAIN",
              "isolated-lost-create-reply",
            );
          }
          return response;
        },
      });
      await assert.rejects(runReleaseAction(lostCreation, applied), {
        code: "RELEASE_STATE_UNCERTAIN",
      });
      assert.equal(typeof verifierId, "string");
      assert.equal(
        await optionalInspection(context, "container", verifierId),
        null,
      );
      assert.equal(
        await context.files.read(packaged.evidenceReference),
        publishedPackage,
      );
      assert.equal(
        (await optionalInspection(context, "image", manifest.imageReference))
          .Id,
        image,
      );
      for (const reference of context.captures.expectedImageTags)
        if (reference !== manifest.imageReference)
          assert.equal(
            await optionalInspection(context, "image", reference),
            null,
          );

      await captureKnownResources(context);
      process.stdout.write(
        "P08 isolated: lost verifier creation reply reconciled and cleaned\n",
      );

      const artifactProgram = `
      const fs=require('node:fs'),path=require('node:path');
      const forbidden=[];let publicOrigin=false;
      function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
        if(entry.name==='node_modules')continue;
        const filename=path.join(directory,entry.name);
        if(entry.isDirectory()){if(['src','test-support','e2e','tests','docs'].includes(entry.name))forbidden.push(filename);else walk(filename);}
        else {if(entry.name.startsWith('.env')||entry.name.endsWith('.map')||/\\.(test|spec)\\./u.test(entry.name)||entry.name==='seed.ts')forbidden.push(filename);
          if(filename.includes('/.next/static/')&&filename.endsWith('.js')&&fs.readFileSync(filename,'utf8').includes('https://acceptance.example.com/api/v1'))publicOrigin=true;}
      }}
      for(const directory of ['/workspace/apps/api','/workspace/packages/contracts','/workspace/packages/database','/workspace/web/apps/web'])walk(directory);
      if(forbidden.length||!publicOrigin)throw Error('ARTIFACT_ALLOWLIST_FAILED:'+JSON.stringify(forbidden));
      for(const filename of ['/workspace/apps/api/dist/server.js','/workspace/web/apps/web/server.js','/workspace/packages/database/prisma.config.ts'])fs.accessSync(filename);
      console.log('ARTIFACT_ALLOWLIST_AND_PUBLIC_ORIGIN_OK');
    `;
      const artifactName = `${context.projectName}-artifact-${runId}`;
      context.captures.expectedContainerNames.set(
        artifactName,
        "artifact-observer",
      );
      const artifactId = (
        await dockerCommand(context, [
          "create",
          "--name",
          artifactName,
          "--network",
          "none",
          "--label",
          "io.oriental-shoes.scope=isolated",
          "--label",
          `io.oriental-shoes.run=${runId}`,
          "--label",
          `io.oriental-shoes.environment=${context.config.environmentId}`,
          "--label",
          `com.docker.compose.project=${context.projectName}`,
          "--label",
          "io.oriental-shoes.role=artifact-observer",
          image,
          "node",
          "-e",
          artifactProgram,
        ])
      ).trim();
      await captureKnownResources(context);
      try {
        assert.match(
          await dockerCommand(context, ["start", "--attach", artifactId]),
          /ARTIFACT_ALLOWLIST_AND_PUBLIC_ORIGIN_OK/u,
        );
      } finally {
        const observed = await optionalInspection(
          context,
          "container",
          artifactId,
        );
        if (observed) {
          assertOwnedLabels(
            context,
            observed.Config.Labels,
            "artifact-observer",
          );
          await dockerCommand(context, ["rm", "-f", "-v", artifactId]);
        }
      }
      process.stdout.write("P08 isolated: image and artifacts verified\n");

      assert.equal(await compose(context, image, ["config", "--quiet"]), "");
      await writeFile(
        path.join(source.release, ".env"),
        "COMPOSE_FILE=/foreign.yml\nDOCKER_HOST=tcp://foreign:2375\nPOSTGRES_IMAGE=foreign\n",
        { mode: 0o600 },
      );
      assert.equal(await compose(context, image, ["config", "--quiet"]), "");
      const poisoned = {
        COMPOSE_ENV_FILES: "/nonexistent-p08-environment",
        COMPOSE_FILE: "/nonexistent-p08-compose",
        DOCKER_HOST: "tcp://invalid-p08-host:2375",
        DOCKER_CONTEXT: "invalid-p08-context",
        HTTPS_PROXY: "http://invalid-p08-proxy:8888",
      };
      const inherited = Object.fromEntries(
        Object.keys(poisoned).map((key) => [key, process.env[key]]),
      );
      Object.assign(process.env, poisoned);
      try {
        assert.equal(await compose(context, image, ["config", "--quiet"]), "");
      } finally {
        for (const [key, prior] of Object.entries(inherited)) {
          if (prior === undefined) delete process.env[key];
          else process.env[key] = prior;
        }
      }
      const unhealthy = path.join(root, "compose.unhealthy.yaml");
      await writeFile(
        unhealthy,
        'services:\n  postgres:\n    healthcheck:\n      test: ["CMD", "false"]\n      interval: 1s\n      timeout: 1s\n      retries: 1\n      start_period: 0s\n',
        { mode: 0o600 },
      );
      await compose(
        context,
        image,
        [
          "--file",
          unhealthy,
          "up",
          "-d",
          "--wait",
          "--wait-timeout",
          "15",
          "api",
          "web",
        ],
        { expectedFailure: true },
      );
      const blockedApi = await optionalInspection(
        context,
        "container",
        `${context.projectName}-api-1`,
      );
      assert.notEqual(blockedApi?.State.Status, "running");
      const unhealthyPostgres = await optionalInspection(
        context,
        "container",
        `${context.projectName}-postgres-1`,
      );
      assert.equal(unhealthyPostgres.State.Health.Status, "unhealthy");
      await compose(context, image, ["stop", "--timeout", "15", "web"]);
      await compose(context, image, [
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "120",
        "postgres",
      ]);
      process.stdout.write(
        "P08 isolated: dependency failure and PostgreSQL readiness verified\n",
      );
      await mkdir(context.config.backupDirectory, {
        recursive: true,
        mode: 0o700,
      });
      await context.files.writeJson(context.paths.config, context.config);
      async function backupFixture(kind) {
        await observeDeployment(context);
        const sourceServices = parseServiceSnapshot(
          Object.fromEntries(
            ["api", "web", "postgres", "caddy"].map((role) => {
              const service = context.registry.get(role);
              return [
                role,
                service
                  ? {
                      id: service.id,
                      imageId: service.imageId,
                      running: service.running,
                    }
                  : null,
              ];
            }),
          ),
        );
        const backupContext = Object.freeze({
          ...context,
          packageRecord: parsePackageRecord(manifest),
          authorizationReference: "isolated-backup-authorization",
          sourceServices,
          sourceCaddyMode: "normal",
        });
        const lock = await context.files.acquireLock();
        try {
          return {
            bundle: await createVerifiedBackup(backupContext, kind),
            backupContext,
          };
        } finally {
          await lock.release();
        }
      }
      const observationKeys = [
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
      const localOnlyEvidence = {
        version: 1,
        ...recordIdentity(context),
        releaseRevision: manifest.revision,
        machineIdSha256: context.config.expectedMachineIdSha256,
        dockerEngineId: context.config.expectedDockerEngineId,
        applicationImageId: image,
        migrationSetHash: manifest.migrationSetHash,
        observations: Object.fromEntries(
          observationKeys.map((key, index) => [
            key,
            index < 6
              ? {
                  status: "PASS",
                  reference: `isolated-fixture-${key}`,
                  observedAt: new Date().toISOString(),
                  operatorReference: context.config.operatorReference,
                }
              : {
                  status: "UNPERFORMED",
                  reference: null,
                  observedAt: null,
                  operatorReference: null,
                },
          ]),
        ),
      };
      await context.files.writeJson(context.paths.evidence, localOnlyEvidence);
      const preparedLifecycle = await runPrepare(
        context,
        parseReleaseArguments([
          "prepare",
          "--config",
          context.paths.config,
          "--apply",
          "--confirm-environment",
          context.config.environmentId,
          "--authorization-reference",
          "isolated-prepare-authorization",
        ]),
      );
      assert.equal(preparedLifecycle.phase, "ACCEPTANCE");
      assert.equal(preparedLifecycle.outcome, "AWAITING_OPERATOR");
      const preparedState = JSON.parse(
        await context.files.read(context.paths.stateFile),
      );
      assert.ok(preparedState.checkpointId);
      assert.equal(preparedState.candidate.applicationImageId, image);
      const preparedCheckpoint = JSON.parse(
        await readFile(
          path.join(
            context.config.backupDirectory,
            preparedState.checkpointId,
            "manifest.json",
          ),
          "utf8",
        ),
      );
      assert.equal(preparedCheckpoint.classification, "FRESH_EMPTY");
      assert.equal(preparedCheckpoint.verified, true);
      const freshBackup = {
        bundle: {
          directory: path.join(
            context.config.backupDirectory,
            preparedState.checkpointId,
          ),
          manifest: preparedCheckpoint,
        },
      };
      assert.equal(freshBackup.bundle.manifest.classification, "FRESH_EMPTY");
      assert.equal(freshBackup.bundle.manifest.verified, true);
      assert.equal(freshBackup.bundle.manifest.before.ledgerAbsent, true);
      assert.deepEqual(
        freshBackup.bundle.manifest.before,
        freshBackup.bundle.manifest.restarted,
      );
      process.stdout.write(
        "P08 isolated: fresh empty archive restore/restart verified before migration\n",
      );

      const fixtureNormalLease = await context.files.acquireLock();
      try {
        await changeCaddyMode(context, "normal");
      } finally {
        await fixtureNormalLease.release();
      }
      process.stdout.write(
        "P08 isolated: actual prepare empty-checkpoint, application credentials, status/deploy/status and acceptance verified\n",
      );

      await compose(context, image, [
        "up",
        "-d",
        "--no-deps",
        "--wait",
        "--wait-timeout",
        "120",
        "api",
        "web",
      ]);
      process.stdout.write(
        "P08 isolated: migrations and normal application startup verified\n",
      );
      const validRuntime = await readFile(
        context.config.runtimeEnvFile,
        "utf8",
      );
      try {
        await writeFile(
          context.config.runtimeEnvFile,
          validRuntime.replace(
            "NODE_ENV=production",
            "NODE_ENV=invalid-startup-check",
          ),
        );
        await compose(
          context,
          image,
          [
            "up",
            "-d",
            "--no-deps",
            "--force-recreate",
            "--wait",
            "--wait-timeout",
            "15",
            "api",
          ],
          { expectedFailure: true },
        );
        const failedApi = await optionalInspection(
          context,
          "container",
          `${context.projectName}-api-1`,
        );
        assert.notEqual(failedApi.State.Health.Status, "healthy");
      } finally {
        await writeFile(context.config.runtimeEnvFile, validRuntime);
      }
      await compose(context, image, [
        "up",
        "-d",
        "--no-deps",
        "--wait",
        "--wait-timeout",
        "120",
        "api",
      ]);
      const rawProof =
        "let expected='';for await(const chunk of process.stdin)expected+=chunk;if(process.env.SMTP_PASSWORD!==expected)process.exit(1);console.log('RAW_ENV_OK')";
      assert.match(
        await compose(
          context,
          image,
          ["exec", "-T", "api", "node", "-e", rawProof],
          prepared.rawMailPassword,
        ),
        /RAW_ENV_OK/u,
      );
      await compose(context, image, [
        "run",
        "--rm",
        "--no-deps",
        "caddy",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
        "--adapter",
        "caddyfile",
      ]);
      await compose(context, image, ["up", "-d", "--no-deps", "caddy"]);
      const caddy = (
        await compose(context, image, ["ps", "--quiet", "caddy"])
      ).trim();
      assert.match(caddy, /^[0-9a-f]{64}$/u);
      const certificate = path.join(root, "ca.crt");
      const deadline = Date.now() + 30000;
      while (true) {
        try {
          await dockerCommand(context, [
            "cp",
            `${caddy}:/data/caddy/pki/authorities/local/root.crt`,
            certificate,
          ]);
          break;
        } catch (failure) {
          if (Date.now() >= deadline) throw failure;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      const ca = await readFile(certificate);
      const binding = (
        await compose(context, image, ["port", "caddy", "443"])
      ).trim();
      assert.match(binding, /^127\.0\.0\.1:\d+$/u);
      let port = Number(binding.split(":")[1]);
      assert.equal(
        (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
          .status,
        200,
      );
      assert.equal(
        (await tlsReady(context.config, port, ca, "/auth/login")).status,
        200,
      );
      for (const service of ["api", "web", "postgres"]) {
        const id = (
          await compose(context, image, ["ps", "--quiet", service])
        ).trim();
        const published = JSON.parse(
          await dockerCommand(context, [
            "inspect",
            "--format",
            "{{json .HostConfig.PortBindings}}",
            id,
          ]),
        );
        assert.ok(published === null || Object.keys(published).length === 0);
      }
      const changeMode = async (mode, selected = context) => {
        const lease = await selected.files.acquireLock();
        try {
          return await changeCaddyMode(selected, mode);
        } finally {
          await lease.release();
        }
      };
      await changeMode("maintenance");
      const unavailable = await tlsRequest(
        context.config,
        port,
        ca,
        "/api/v1/health/ready",
      );
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.headers["retry-after"], "60");
      await changeMode("acceptance");
      assert.equal(
        (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
          .status,
        503,
      );
      const access = (
        await execute("docker", ["logs", "--tail", "100", caddy], {
          encoding: "utf8",
          maxBuffer: 1048576,
        })
      ).stdout
        .trim()
        .split("\n")
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((entry) => entry?.request?.uri === "/api/v1/health/ready");
      const peer = access.at(-1)?.request?.remote_ip;
      assert.ok(isIP(peer));
      const allowed = Object.freeze({
        ...context,
        config: parseReleaseConfig({
          ...context.config,
          acceptanceCidrs: [`${peer}/${isIP(peer) === 4 ? 32 : 128}`],
        }),
      });
      await changeMode("acceptance", allowed);
      assert.equal(
        (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
          .status,
        200,
      );
      assert.equal(
        (await tlsReady(context.config, port, ca, "/auth/login")).status,
        200,
      );
      // An eligible USER is an explicit fixture precondition. Registration/mail
      // authority is independently proved by canonical T025; only the real CLI
      // below creates ADMIN and its actual singleton receipt.
      context = Object.freeze({ ...context, config: allowed.config });
      await context.files.writeJson(context.paths.config, context.config);
      const prepareAgain = await nextInvocation(context);
      await runPrepare(
        prepareAgain,
        parseReleaseArguments([
          "prepare",
          "--config",
          context.paths.config,
          "--apply",
          "--confirm-environment",
          context.config.environmentId,
          "--authorization-reference",
          "isolated-populated-prepare",
        ]),
      );
      const actorPassword = "P08-isolated-signin-valid-password-42!",
        actorEmail = "operator@example.com";
      const actorProgram =
        "import {createDatabaseClient} from '@template/database';import argon2 from 'argon2';let text='';for await(const chunk of process.stdin)text+=chunk;const input=JSON.parse(text);const database=createDatabaseClient(process.env.DATABASE_URL);try{const user=await database.user.create({data:{email:input.email,passwordHash:await argon2.hash(input.password),fullName:'Isolated operator',role:'USER',status:'PENDING_APPROVAL',accessVersion:1,emailVerifiedAt:new Date()}});console.log(user.id);}finally{await database.$disconnect();}";
      const actorId = (
        await compose(
          context,
          image,
          [
            "exec",
            "-T",
            "--workdir",
            "/workspace/apps/api",
            "api",
            "node",
            "--input-type=module",
            "--eval",
            actorProgram,
          ],
          JSON.stringify({ email: actorEmail, password: actorPassword }),
        )
      ).trim();
      assert.match(actorId, /^[a-f0-9-]{36}$/u);
      async function actorLogin() {
        const response = await tlsRequest(
          context.config,
          port,
          ca,
          "/api/v1/auth/login",
          {
            method: "POST",
            body: JSON.stringify({
              email: actorEmail,
              password: actorPassword,
              rememberMe: false,
            }),
          },
        );
        assert.equal(response.status, 200);
        const data = JSON.parse(response.body).data;
        assert.equal(data.user.id, actorId);
        if (typeof data.tokens?.accessToken !== "string")
          throw Error("Missing private login credential");
        await context.files.writeJson(context.paths.session, {
          version: 1,
          accessToken: data.tokens.accessToken,
        });
        return data.user;
      }
      const restricted = await actorLogin();
      assert.equal(restricted.role, "USER");
      assert.equal(restricted.accessVersion, 1);
      context = Object.freeze({
        ...context,
        config: parseReleaseConfig({
          ...context.config,
          initialAdministrator: {
            userId: restricted.id,
            expectedEmail: restricted.email,
            expectedAccessVersion: restricted.accessVersion,
          },
        }),
      });
      await context.files.writeJson(context.paths.config, context.config);
      const adminObserveArgs = parseReleaseArguments([
          "admin-preview",
          "--config",
          context.paths.config,
          "--observe",
        ]),
        adminApplyArgs = parseReleaseArguments([
          "admin-apply",
          "--config",
          context.paths.config,
          "--apply",
          "--confirm-environment",
          context.config.environmentId,
          "--authorization-reference",
          "isolated-confirmed-administrator",
          "--confirm-user",
          actorId,
        ]);
      const beforeObserve = await context.files.read(context.paths.stateFile),
        beforeConfig = await context.files.read(context.paths.config),
        beforeRuns = (await readdir(context.paths.runs)).sort();
      const previewed = await observeAdministrator(
        await nextInvocation(context),
        adminObserveArgs,
      );
      assert.equal(previewed.outcome, "ELIGIBLE_NOT_APPLIED");
      assert.equal(previewed.evidenceReference, null);
      assert.equal(
        await context.files.read(context.paths.stateFile),
        beforeObserve,
      );
      assert.equal(
        await context.files.read(context.paths.config),
        beforeConfig,
      );
      assert.deepEqual((await readdir(context.paths.runs)).sort(), beforeRuns);
      assert.ok(!(await readdir(context.paths.state)).includes("run.lock"));
      const applyInvocation = await nextInvocation(context);
      let promotions = 0;
      const lostPromotion = {
        ...applyInvocation,
        command: async (request) => {
          const response = await applyInvocation.command(request);
          if (request.stage === "operation-admin-apply") {
            promotions++;
            throw new ReleaseFailure(
              "RELEASE_STATE_UNCERTAIN",
              "isolated-lost-promotion-reply",
            );
          }
          return response;
        },
      };
      const waiting = await applyAdministrator(lostPromotion, adminApplyArgs);
      assert.equal(waiting.outcome, "AWAITING_OPERATOR");
      assert.equal(promotions, 1);
      const previousCredential = JSON.parse(
        await context.files.read(context.paths.session),
      ).accessToken;
      const stillIdentityValid = await tlsRequest(
        context.config,
        port,
        ca,
        "/api/v1/users/me",
        { headers: { Authorization: `Bearer ${previousCredential}` } },
      );
      assert.equal(stillIdentityValid.status, 200);
      assert.equal(
        JSON.parse(stillIdentityValid.body).data.user.accessVersion,
        2,
      );
      const pendingActor = JSON.parse(
        await context.files.read(context.paths.stateFile),
      );
      assert.equal(pendingActor.authority, null);
      assert.equal(pendingActor.administratorReauthenticationRequired, true);
      assert.equal(pendingActor.provisioningReceipt.beforeVersion, 1);
      assert.equal(pendingActor.provisioningReceipt.afterVersion, 2);
      await assert.rejects(
        observeAdministrator(await nextInvocation(context), adminObserveArgs),
        {
          code: "RELEASE_ADMISSION_MISSING",
          stage: "administrator-reauthentication",
        },
      );
      const administrator = await actorLogin();
      assert.equal(administrator.role, "ADMIN");
      assert.equal(administrator.status, "ACTIVE");
      assert.equal(administrator.accessVersion, 2);
      const bindingInvocation = await nextInvocation(context);
      let failStateReply = true;
      const lostBindingState = {
        ...bindingInvocation,
        files: {
          ...bindingInvocation.files,
          writeJson: async (filename, record) => {
            await bindingInvocation.files.writeJson(filename, record);
            if (
              filename === context.paths.stateFile &&
              record.administratorReauthenticationRequired === false &&
              failStateReply
            ) {
              failStateReply = false;
              throw new ReleaseFailure(
                "RELEASE_STATE_UNCERTAIN",
                "isolated-lost-authority-state-reply",
              );
            }
          },
        },
      };
      await assert.rejects(
        applyAdministrator(lostBindingState, adminApplyArgs),
        {
          code: "RELEASE_STATE_UNCERTAIN",
          stage: "isolated-lost-authority-state-reply",
        },
      );
      const reboundConfig = parseReleaseConfig(
        JSON.parse(await context.files.read(context.paths.config)),
      );
      assert.equal(reboundConfig.initialAdministrator.expectedAccessVersion, 2);
      assert.ok(
        (await readdir(context.paths.state)).includes("authority-rebind.json"),
      );
      context = Object.freeze({ ...context, config: reboundConfig });
      const finalBindingInvocation = await nextInvocation(context);
      let repeatedPromotions = 0;
      const finalAuthorityBinding = {
        ...finalBindingInvocation,
        command: async (request) => {
          if (request.stage === "operation-admin-apply") repeatedPromotions++;
          return finalBindingInvocation.command(request);
        },
      };
      const bound = await applyAdministrator(
        finalAuthorityBinding,
        adminApplyArgs,
      );
      assert.equal(bound.outcome, "COMPLETED");
      assert.equal(repeatedPromotions, 0);
      assert.ok(
        !(await readdir(context.paths.state)).includes("authority-rebind.json"),
      );
      const boundState = JSON.parse(
        await context.files.read(context.paths.stateFile),
      );
      assert.equal(boundState.authority.accessVersion, 2);
      assert.equal(boundState.authority.provisioningReceipt.beforeVersion, 1);
      assert.equal(boundState.provisioningReceipt.afterVersion, 2);
      assert.equal(boundState.administratorReauthenticationRequired, false);
      process.stdout.write(
        "P08 isolated: real preview/promotion lost reply, pre-promotion credential freshness, current ADMIN2 and interrupted private binding reconciled without repeat promotion\n",
      );
      const lifecycleArgs = (action) =>
        parseReleaseArguments([
          action,
          "--config",
          context.paths.config,
          "--apply",
          "--confirm-environment",
          context.config.environmentId,
          "--authorization-reference",
          "isolated-lifecycle-verification",
          ...(action === "backup" ? ["--kind", "predeploy"] : []),
        ]);
      const restarted = await runRestart(
        await nextInvocation(context),
        lifecycleArgs("restart"),
      );
      assert.equal(restarted.outcome, "COMPLETED");
      const acceptedBytes = await context.files.read(context.paths.stateFile);
      const acceptedState = JSON.parse(acceptedBytes);
      assert.equal(acceptedState.phase, "ACCEPTANCE");
      assert.equal(acceptedState.authority.accessVersion, 2);
      const restartReceipt = JSON.parse(
        await context.files.read(restarted.evidenceReference),
      );
      const restartStages = Object.fromEntries(
        restartReceipt.stages.map((item) => [item.stage, item.outcome]),
      );
      assert.equal(
        restartStages["database-volume-before"],
        restartStages["database-volume-after"],
      );
      assert.equal(
        restartStages["database-fingerprint-before"],
        restartStages["database-fingerprint-after"],
      );
      await assert.rejects(
        openTraffic(
          await nextInvocation(context),
          lifecycleArgs("open-traffic"),
        ),
        {
          code: "RELEASE_ADMISSION_MISSING",
          stage: "opening-observation-evidence",
        },
      );
      assert.equal(
        await context.files.read(context.paths.stateFile),
        acceptedBytes,
      );
      // Explicit isolated operator attestations exercise admission mechanics only.
      // They do not establish any real public TLS, mail, training or T048 evidence.
      const isolatedOpeningEvidence = {
        ...localOnlyEvidence,
        observations: Object.fromEntries(
          observationKeys.map((key) => [
            key,
            key === "scheduledBackup"
              ? localOnlyEvidence.observations[key]
              : {
                  status: "PASS",
                  reference: `isolated-attestation-${key}`,
                  observedAt: new Date().toISOString(),
                  operatorReference: context.config.operatorReference,
                },
          ]),
        ),
      };
      await context.files.writeJson(
        context.paths.evidence,
        isolatedOpeningEvidence,
      );
      const originalIndex = await readFile(
        path.join(
          context.config.backupDirectory,
          `${context.config.environmentId}.index.json`,
        ),
        "utf8",
      );
      // All effects preceding each injected lost reply are real. Test-only repair
      // reinstates this captured fixture; the CLI offers no force/repair command.
      for (const boundary of ["barrier", "reload", "receipt", "final-state"]) {
        const invocation = await nextInvocation(context);
        let fired = false;
        const interrupted = {
          ...invocation,
          command: async (request) => {
            const result = await invocation.command(request);
            if (
              boundary === "reload" &&
              request.stage === "caddy-reload" &&
              !fired
            ) {
              fired = true;
              throw new ReleaseFailure(
                "RELEASE_STATE_UNCERTAIN",
                "isolated-opening-reload",
              );
            }
            return result;
          },
          files: {
            ...invocation.files,
            writeJson: async (filename, value) => {
              if (
                boundary === "final-state" &&
                filename === context.paths.stateFile &&
                value.phase === "OPEN" &&
                !fired
              ) {
                fired = true;
                throw new ReleaseFailure(
                  "RELEASE_STATE_UNCERTAIN",
                  "isolated-opening-final-state",
                );
              }
              await invocation.files.writeJson(filename, value);
              if (
                !fired &&
                ((boundary === "barrier" &&
                  filename === context.paths.stateFile &&
                  value.lastTransition?.stage === "opening-pending") ||
                  (boundary === "receipt" &&
                    filename ===
                      `${context.paths.runs}/${invocation.runId}.json` &&
                    value.phase === "OPEN"))
              ) {
                fired = true;
                throw new ReleaseFailure(
                  "RELEASE_STATE_UNCERTAIN",
                  `isolated-opening-${boundary}`,
                );
              }
            },
          },
        };
        await assert.rejects(
          openTraffic(interrupted, lifecycleArgs("open-traffic")),
          {
            code:
              boundary === "reload"
                ? "RELEASE_CHECK_FAILED"
                : "RELEASE_STATE_UNCERTAIN",
          },
        );
        assert.equal(fired, true);
        const pendingBytes = await context.files.read(context.paths.stateFile);
        assert.equal(JSON.parse(pendingBytes).phase, "UNCERTAIN");
        for (const [handler, action, extra] of [
          [runBackup, "backup", { kind: "predeploy" }],
          [runBackup, "backup", { kind: "daily" }],
          [runPrepare, "prepare", {}],
          [runRestart, "restart", {}],
          [openTraffic, "open-traffic", {}],
        ]) {
          await assert.rejects(
            handler(await nextInvocation(context), {
              ...lifecycleArgs(action),
              ...extra,
            }),
            {
              code: "RELEASE_ADMISSION_MISSING",
              stage: "opening-publication-pending",
            },
          );
          assert.equal(
            await context.files.read(context.paths.stateFile),
            pendingBytes,
          );
        }
        assert.equal(
          await readFile(
            path.join(
              context.config.backupDirectory,
              `${context.config.environmentId}.index.json`,
            ),
            "utf8",
          ),
          originalIndex,
        );
        assert.equal(
          await fsPromises.lstat(context.paths.current).catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
          }),
          null,
        );
        await context.files.writeJson(context.paths.stateFile, acceptedState);
      }
      const openingInvocation = await nextInvocation(context);
      let finalReplyLost = false;
      const opened = await openTraffic(
        {
          ...openingInvocation,
          files: {
            ...openingInvocation.files,
            writeJson: async (filename, value) => {
              await openingInvocation.files.writeJson(filename, value);
              if (
                filename === context.paths.stateFile &&
                value.phase === "OPEN" &&
                !finalReplyLost
              ) {
                finalReplyLost = true;
                throw new ReleaseFailure(
                  "RELEASE_STATE_UNCERTAIN",
                  "isolated-final-state-reply",
                );
              }
            },
          },
        },
        lifecycleArgs("open-traffic"),
      );
      assert.equal(opened.outcome, "COMPLETED");
      assert.equal(finalReplyLost, true);
      const actualOpen = JSON.parse(
        await context.files.read(context.paths.stateFile),
      );
      assert.equal(actualOpen.phase, "OPEN");
      assert.equal(actualOpen.openingRunId, openingInvocation.runId);
      assert.equal(
        await fsPromises.readlink(context.paths.current),
        context.paths.release,
      );
      await runRestart(await nextInvocation(context), lifecycleArgs("restart"));
      assert.equal(
        JSON.parse(await context.files.read(context.paths.stateFile))
          .openingRunId,
        openingInvocation.runId,
      );
      const openReceiptPath = `${context.paths.runs}/${openingInvocation.runId}.json`;
      const heldReceiptPath = `${openReceiptPath}.crash-fixture-held`;
      await rename(openReceiptPath, heldReceiptPath);
      await fsPromises.unlink(context.paths.current);
      try {
        for (const crashAfter of ["barrier", "reload", "pointer", "receipt"]) {
          // Persist the producer's actual shapes without invoking caught-failure
          // restoration: these fixtures represent process death between commits.
          const pendingOpening = {
            ...acceptedState,
            phase: "UNCERTAIN",
            lastFailure: null,
            lastTransition: {
              runId: openingInvocation.runId,
              action: "open-traffic",
              stage: "opening-pending",
              startedAt: actualOpen.lastTransition.startedAt,
              completedAt: null,
              outcome: "IN_PROGRESS",
            },
          };
          await context.files.writeJson(
            context.paths.stateFile,
            pendingOpening,
          );
          await changeMode(crashAfter === "barrier" ? "acceptance" : "normal");
          if (["pointer", "receipt"].includes(crashAfter))
            await symlink(context.paths.release, context.paths.current);
          if (crashAfter === "receipt")
            await rename(heldReceiptPath, openReceiptPath);
          const pendingBytes = await context.files.read(
            context.paths.stateFile,
          );
          let serviceStarts = 0;
          const interrupted = await nextInvocation(context);
          const guarded = {
            ...interrupted,
            command: async (request) => {
              if (
                request.argv[0] === "start" ||
                request.argv[0] === "restart" ||
                (request.argv[0] === "compose" && request.argv.includes("up"))
              )
                serviceStarts++;
              return interrupted.command(request);
            },
          };
          const observed = await runReleaseAction(
            guarded,
            parseReleaseArguments([
              "inspect",
              "--config",
              context.paths.config,
              "--observe",
            ]),
          );
          assert.equal(observed.phase, "UNCERTAIN");
          for (const action of [
            "prepare",
            "restart",
            "open-traffic",
            "backup",
            "install-backup-timer",
          ]) {
            await assert.rejects(
              runReleaseAction(guarded, lifecycleArgs(action)),
              (error) =>
                error instanceof ReleaseFailure &&
                [
                  "RELEASE_ADMISSION_MISSING",
                  "RELEASE_TARGET_MISMATCH",
                ].includes(error.code),
            );
            assert.equal(
              await context.files.read(context.paths.stateFile),
              pendingBytes,
            );
          }
          assert.equal(serviceStarts, 0);
          assert.equal(
            await readFile(
              path.join(
                context.config.backupDirectory,
                `${context.config.environmentId}.index.json`,
              ),
              "utf8",
            ),
            originalIndex,
          );
          if (["pointer", "receipt"].includes(crashAfter))
            await fsPromises.unlink(context.paths.current);
          if (crashAfter === "receipt")
            await rename(openReceiptPath, heldReceiptPath);
        }
      } finally {
        const held = await fsPromises.lstat(heldReceiptPath).catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
        if (held !== null) await rename(heldReceiptPath, openReceiptPath);
        const pointer = await fsPromises
          .readlink(context.paths.current)
          .catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
        if (pointer === null)
          await symlink(context.paths.release, context.paths.current);
        else assert.equal(pointer, context.paths.release);
      }
      // Restore only this test-owned fixture for the existing Caddy fault matrix.
      await fsPromises.unlink(context.paths.current);
      await changeMode("acceptance");
      await context.files.writeJson(context.paths.stateFile, acceptedState);
      await context.files.writeJson(context.paths.evidence, localOnlyEvidence);
      const uncertainRestartInvocation = await nextInvocation(context);
      let uncertainReload = false;
      await assert.rejects(
        runRestart(
          {
            ...uncertainRestartInvocation,
            command: async (request) => {
              if (
                ["caddy-reload", "caddy-prior-reload"].includes(request.stage)
              ) {
                uncertainReload = true;
                throw new ReleaseFailure(
                  "RELEASE_STATE_UNCERTAIN",
                  "isolated-restart-reload",
                );
              }
              return uncertainRestartInvocation.command(request);
            },
          },
          lifecycleArgs("restart"),
        ),
        { code: "RELEASE_STATE_UNCERTAIN" },
      );
      assert.equal(uncertainReload, true);
      const failedRestart = JSON.parse(
        await context.files.read(context.paths.stateFile),
      );
      assert.equal(failedRestart.phase, "UNCERTAIN");
      assert.notEqual(failedRestart.lastFailure, null);
      await assert.rejects(
        runRestart(await nextInvocation(context), lifecycleArgs("restart")),
        { code: "RELEASE_ADMISSION_MISSING" },
      );
      await compose(context, image, ["start", "api", "web"]);
      await changeMode("acceptance");
      await context.files.writeJson(context.paths.stateFile, acceptedState);
      process.stdout.write(
        "P08 isolated: actual retained-PG restart, opening refusal/barriers/publication and lost final reply verified\n",
      );
      await changeMode("normal");
      assert.equal(
        (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
          .status,
        200,
      );
      let corruptOnce = true;
      const rejected = Object.freeze({
        ...context,
        command: async (request) => {
          const response = await context.command(request);
          if (request.stage === "caddy-validate" && corruptOnce) {
            corruptOnce = false;
            await writeFile(
              path.join(context.paths.caddy, "mode.caddy"),
              "invalid_caddy_directive\n",
            );
          }
          return response;
        },
      });
      await assert.rejects(changeMode("maintenance", rejected), {
        code: "RELEASE_CHECK_FAILED",
      });
      assert.equal(
        await readFile(path.join(context.paths.caddy, "mode.caddy"), "utf8"),
        renderCaddyMode(context.config, "normal"),
      );
      assert.equal(
        (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
          .status,
        200,
      );
      let loseOnce = true;
      const lost = Object.freeze({
        ...context,
        command: async (request) => {
          const response = await context.command(request);
          if (
            request.stage === "caddy-reload" &&
            response.exitCode === 0 &&
            loseOnce
          ) {
            loseOnce = false;
            throw new ReleaseFailure(
              "RELEASE_STATE_UNCERTAIN",
              "isolated-lost-reply",
            );
          }
          return response;
        },
      });
      await assert.rejects(changeMode("maintenance", lost), {
        code: "RELEASE_CHECK_FAILED",
      });
      assert.equal(
        await readFile(path.join(context.paths.caddy, "mode.caddy"), "utf8"),
        renderCaddyMode(context.config, "normal"),
      );
      assert.equal(
        (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
          .status,
        200,
      );
      process.stdout.write(
        "P08 isolated: CIDR allow/deny and rejected/lost-reply Caddy recovery verified\n",
      );
      for (const failedOperation of ["writeFile", "sync"]) {
        const originalOpen = fsPromises.open;
        let injectOnce = true;
        fsPromises.open = async (...arguments_) => {
          const handle = await originalOpen(...arguments_);
          if (
            injectOnce &&
            String(arguments_[0]) ===
              `${context.paths.caddy}/mode.caddy.${context.runId}.partial`
          ) {
            injectOnce = false;
            const original = handle[failedOperation].bind(handle);
            handle[failedOperation] = async (...operationArguments) => {
              if (failedOperation === "writeFile")
                await original(String(operationArguments[0]).slice(0, 6));
              const failure = new Error("isolated-publication-io-failure");
              failure.code = "EIO";
              throw failure;
            };
          }
          return handle;
        };
        syncBuiltinESMExports();
        try {
          await assert.rejects(changeMode("maintenance"), {
            code: "RELEASE_CHECK_FAILED",
          });
        } finally {
          fsPromises.open = originalOpen;
          syncBuiltinESMExports();
        }
        assert.equal(
          (await readdir(context.paths.caddy)).some((filename) =>
            filename.endsWith(".partial"),
          ),
          false,
        );
        assert.equal(
          await readFile(path.join(context.paths.caddy, "mode.caddy"), "utf8"),
          renderCaddyMode(context.config, "normal"),
        );
        assert.equal(
          (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
            .status,
          200,
        );
      }
      let denyRestoreOnce = true;
      const diskFailure = Object.freeze({
        ...context,
        command: async (request) => {
          const response = await context.command(request);
          if (request.stage === "caddy-validate" && denyRestoreOnce) {
            denyRestoreOnce = false;
            await writeFile(
              path.join(context.paths.caddy, "mode.caddy"),
              "invalid_caddy_directive\n",
            );
            await chmod(context.paths.caddy, 0o555);
          }
          return response;
        },
      });
      try {
        await assert.rejects(changeMode("maintenance", diskFailure), {
          code: "RELEASE_STATE_UNCERTAIN",
        });
      } finally {
        await chmod(context.paths.caddy, 0o755);
        await writeFile(
          path.join(context.paths.caddy, "mode.caddy"),
          renderCaddyMode(context.config, "normal"),
        );
      }
      await changeMode("normal");
      await compose(context, image, ["stop", "--timeout", "15", "caddy"]);
      await assert.rejects(changeMode("maintenance"), {
        code: "RELEASE_ADMISSION_MISSING",
        stage: "caddy-not-running",
      });
      assert.equal(
        await readFile(path.join(context.paths.caddy, "mode.caddy"), "utf8"),
        renderCaddyMode(context.config, "normal"),
      );
      const previousCaddy = await optionalInspection(
        context,
        "container",
        caddy,
      );
      assertOwnedLabels(context, previousCaddy.Config.Labels, "caddy");
      await dockerCommand(context, ["rm", caddy]);
      await assert.rejects(changeMode("maintenance"), {
        code: "RELEASE_ADMISSION_MISSING",
        stage: "caddy-not-running",
      });
      assert.equal(context.registry.has("caddy"), false);
      await compose(context, image, ["up", "-d", "--no-deps", "caddy"]);
      await compose(context, image, ["restart", "caddy"]);
      const currentBinding = (
        await compose(context, image, ["port", "caddy", "443"])
      ).trim();
      assert.match(currentBinding, /^127\.0\.0\.1:\d+$/u);
      port = Number(currentBinding.split(":")[1]);
      assert.equal(
        await readFile(path.join(context.paths.caddy, "mode.caddy"), "utf8"),
        renderCaddyMode(context.config, "normal"),
      );
      await runReleaseAction(
        context,
        parseReleaseArguments([
          "inspect",
          "--config",
          context.paths.config,
          "--observe",
        ]),
      );
      await observeDeployment(context);
      const openServices = parseServiceSnapshot(
        Object.fromEntries(
          ["api", "web", "postgres", "caddy"].map((role) => {
            const service = context.registry.get(role);
            return [
              role,
              service
                ? {
                    id: service.id,
                    imageId: service.imageId,
                    running: service.running,
                  }
                : null,
            ];
          }),
        ),
      );
      const openingRunId = randomUUID(),
        openingTime = new Date().toISOString();
      const openState = {
        ...initialReleaseState(
          recordIdentity(context),
          new Date().toISOString(),
        ),
        phase: "OPEN",
        active: manifest,
        caddyMode: "normal",
        serviceSnapshot: openServices,
        openingRunId,
      };
      await symlink(context.paths.release, context.paths.current);
      await mkdir(context.paths.runs, { recursive: true, mode: 0o700 });
      await context.files.writeJson(
        `${context.paths.runs}/${openingRunId}.json`,
        {
          version: 1,
          ...recordIdentity(context),
          runId: openingRunId,
          action: "open-traffic",
          revision: manifest.revision,
          startedAt: openingTime,
          completedAt: openingTime,
          phase: "OPEN",
          outcome: "COMPLETED",
          authorizationReference: "isolated-open-precondition",
          priorStateReference: context.paths.stateFile,
          nextStateReference: context.paths.stateFile,
          stages: [
            { stage: "isolated-fixture-precondition", outcome: "COMPLETED" },
          ],
          remainingGates: ["T048-target-acceptance"],
        },
      );
      await context.files.writeJson(context.paths.stateFile, openState);
      const timerArgs = parseReleaseArguments([
        "install-backup-timer",
        "--config",
        context.paths.config,
        "--apply",
        "--confirm-environment",
        context.config.environmentId,
        "--authorization-reference",
        "isolated-timer-admission-only",
      ]);
      await writeFile(
        path.join(context.paths.caddy, "mode.caddy"),
        renderCaddyMode(context.config, "maintenance"),
      );
      let systemdCalls = 0;
      const staleTimer = {
        ...context,
        command: async (request) => {
          if (
            request.executable.startsWith("systemd") ||
            request.executable === "systemctl"
          )
            systemdCalls++;
          return context.command(request);
        },
      };
      try {
        await assert.rejects(runReleaseAction(staleTimer, timerArgs), {
          code: "RELEASE_STATE_UNCERTAIN",
          stage: "caddy-active-mismatch",
        });
        assert.equal(systemdCalls, 0);
      } finally {
        await writeFile(
          path.join(context.paths.caddy, "mode.caddy"),
          renderCaddyMode(context.config, "normal"),
        );
      }
      const dailyArgs = parseReleaseArguments([
        "backup",
        "--config",
        context.paths.config,
        "--kind",
        "daily",
        "--apply",
        "--confirm-environment",
        context.config.environmentId,
        "--authorization-reference",
        "isolated-daily-approval",
      ]);
      let committedDuringDrain = false;
      const guardedContext = {
        ...context,
        command: async (request) => {
          if (
            request.stage === "backup-stop-writers" &&
            !committedDuringDrain
          ) {
            committedDuringDrain = true;
            await compose(
              context,
              image,
              [
                "exec",
                "-T",
                "postgres",
                "psql",
                "-X",
                "-q",
                "-v",
                "ON_ERROR_STOP=1",
                "--username=oriental_bootstrap",
                "--dbname=oriental",
              ],
              `INSERT INTO public.users (id,email,password_hash,full_name,updated_at) VALUES ('${randomUUID()}','drain-commit@example.com','synthetic-not-a-login','Committed during drain',now());`,
            );
          }
          return context.command(request);
        },
        files: {
          ...context.files,
          read: async (filename) => {
            assert.ok(
              !filename.startsWith(context.config.backupDirectory + "/"),
              "off-host input uses its own private reader",
            );
            return context.files.read(filename);
          },
        },
      };
      const daily = await runReleaseAction(guardedContext, dailyArgs);
      assert.equal(daily.outcome, "COMPLETED");
      assert.equal(daily.phase, "OPEN");
      assert.ok(committedDuringDrain);
      const dailyState = JSON.parse(
        await context.files.read(context.paths.stateFile),
      );
      const dailyManifest = JSON.parse(
        await readFile(
          path.join(
            context.config.backupDirectory,
            dailyState.checkpointId,
            "manifest.json",
          ),
          "utf8",
        ),
      );
      assert.equal(
        dailyManifest.before.tables.find((table) => table.table === "users")
          .rowCount,
        "2",
      );
      await observeDeployment(context);
      assert.ok(context.registry.get("api").running);
      assert.ok(context.registry.get("web").running);
      const modeLease = await context.files.acquireLock();
      try {
        assert.equal(await observeCaddyMode(context), "normal");
        await observeCaddyResponse(context, 200);
      } finally {
        await modeLease.release();
      }
      const staleState = {
        ...openState,
        caddyMode: "acceptance",
        phase: "ACCEPTANCE",
      };
      await context.files.writeJson(context.paths.stateFile, staleState);
      const predeployArgs = parseReleaseArguments([
        "backup",
        "--config",
        context.paths.config,
        "--kind",
        "predeploy",
        "--apply",
        "--confirm-environment",
        context.config.environmentId,
        "--authorization-reference",
        "isolated-predeploy-approval",
      ]);
      await assert.rejects(runReleaseAction(context, predeployArgs), {
        code: "RELEASE_TARGET_MISMATCH",
        stage: "state-caddy-mode",
      });
      await observeDeployment(context);
      assert.ok(context.registry.get("api").running);
      for (const backupArgs of [dailyArgs, predeployArgs]) {
        for (const fault of ["rejected", "ambiguous", "containment-failed"]) {
          await compose(context, image, ["start", "api", "web"]);
          await changeMode("normal");
          const readyDeadline = Date.now() + 60000;
          while (true) {
            const response = await tlsReady(
              context.config,
              port,
              ca,
              "/api/v1/health/ready",
            );
            if (response.status === 200) break;
            if (Date.now() >= readyDeadline)
              throw new Error("T056 owned fixture readiness failed");
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          await context.files.writeJson(context.paths.stateFile, openState);
          const invocation = await nextInvocation(context);
          await observeDeployment(invocation);
          const fingerprintContext = {
            ...invocation,
            packageRecord: parsePackageRecord(manifest),
            authorizationReference: backupArgs.authorizationReference,
            sourceServices: openState.serviceSnapshot,
            sourceCaddyMode: "normal",
          };
          const before = await readDatabaseFingerprint(
            fingerprintContext,
            "postgres",
          );
          const indexBefore = await readFile(
            path.join(
              context.config.backupDirectory,
              `${context.config.environmentId}.index.json`,
            ),
          );
          const bundlesBefore = (
            await readdir(context.config.backupDirectory)
          ).sort();
          let reloads = 0,
            starts = 0,
            dumps = 0,
            migrations = 0,
            corruptOnce = true;
          const injected = {
            ...invocation,
            command: async (request) => {
              if (request.argv[0] === "start") starts++;
              if (request.stage.includes("dump")) dumps++;
              if (
                request.argv.some((argument) =>
                  argument.includes("migration-deploy"),
                ) ||
                (request.argv.includes("migrate") &&
                  request.argv.includes("deploy"))
              )
                migrations++;
              const response = await invocation.command(request);
              if (
                fault === "rejected" &&
                request.stage === "caddy-validate" &&
                corruptOnce
              ) {
                corruptOnce = false;
                await writeFile(
                  path.join(context.paths.caddy, "mode.caddy"),
                  "invalid_caddy_directive\n",
                );
              }
              if (
                ["caddy-reload", "caddy-prior-reload"].includes(request.stage)
              ) {
                reloads++;
                if (
                  fault !== "rejected" &&
                  (reloads <= 2 || fault === "containment-failed")
                )
                  throw new ReleaseFailure(
                    "RELEASE_STATE_UNCERTAIN",
                    "isolated-backup-reload-lost",
                  );
              }
              return response;
            },
          };
          await assert.rejects(runBackup(injected, backupArgs), {
            code:
              fault === "rejected"
                ? "RELEASE_CHECK_FAILED"
                : "RELEASE_STATE_UNCERTAIN",
          });
          const failed = JSON.parse(
            await context.files.read(context.paths.stateFile),
          );
          assert.equal(
            failed.phase,
            fault === "rejected" ? "MAINTENANCE" : "UNCERTAIN",
          );
          assert.equal(failed.lastFailure.runId, invocation.runId);
          assert.equal(
            failed.lastFailure.code,
            fault === "rejected"
              ? "RELEASE_CHECK_FAILED"
              : "RELEASE_STATE_UNCERTAIN",
          );
          assert.equal(
            failed.lastFailure.stage,
            fault === "rejected"
              ? "caddy-transition"
              : fault === "ambiguous"
                ? "caddy-prior-mode"
                : "prepare-containment",
          );
          assert.deepEqual(failed.candidate, openState.candidate);
          await observeDeployment(invocation);
          for (const role of ["api", "web", "postgres", "caddy"]) {
            const actual = invocation.registry.get(role);
            assert.deepEqual(
              failed.serviceSnapshot[role],
              actual
                ? {
                    id: actual.id,
                    imageId: actual.imageId,
                    running: actual.running,
                  }
                : null,
            );
          }
          if (fault !== "containment-failed") {
            assert.equal(failed.serviceSnapshot.api?.running, false);
            assert.equal(failed.serviceSnapshot.web?.running, false);
            const lease = await invocation.files.acquireLock();
            try {
              assert.equal(await observeCaddyMode(invocation), "maintenance");
              await observeCaddyResponse(invocation, 503);
            } finally {
              await lease.release();
            }
          }

          assert.deepEqual(failed.active, openState.active);
          assert.equal(failed.checkpointId, openState.checkpointId);
          const receipt = JSON.parse(
            await context.files.read(
              path.join(context.paths.runs, `${invocation.runId}.json`),
            ),
          );
          assert.equal(receipt.runId, invocation.runId);
          assert.equal(receipt.action, "backup");
          assert.equal(receipt.phase, failed.phase);
          assert.equal(failed.lastTransition.runId, invocation.runId);
          assert.equal(
            receipt.outcome,
            fault === "rejected" ? "FAILED" : "UNCERTAIN",
          );
          assert.deepEqual(
            await readDatabaseFingerprint(fingerprintContext, "postgres"),
            before,
          );
          assert.deepEqual(
            await readFile(
              path.join(
                context.config.backupDirectory,
                `${context.config.environmentId}.index.json`,
              ),
            ),
            indexBefore,
          );
          assert.deepEqual(
            (await readdir(context.config.backupDirectory)).sort(),
            bundlesBefore,
          );
          assert.equal(starts, 0);
          assert.equal(dumps, 0);
          assert.equal(migrations, 0);
          for (const action of ["backup", "restart"]) {
            const next = await nextInvocation(context);
            let effects = 0;
            const guarded = {
              ...next,
              command: async (request) => {
                if (
                  ["start", "stop"].includes(request.argv[0]) ||
                  request.stage.includes("dump") ||
                  request.stage === "caddy-reload" ||
                  request.argv.some((argument) =>
                    argument.includes("migration-deploy"),
                  )
                )
                  effects++;
                return next.command(request);
              },
            };
            await assert.rejects(
              runReleaseAction(
                guarded,
                action === "backup"
                  ? {
                      ...dailyArgs,
                      scheduled: true,
                      authorizationReference: null,
                    }
                  : lifecycleArgs("restart"),
              ),
              { code: "RELEASE_ADMISSION_MISSING" },
            );
            assert.equal(effects, 0);
          }
        }
      }
      await compose(context, image, ["start", "api", "web"]);
      await changeMode("normal");
      await context.files.writeJson(context.paths.stateFile, openState);
      process.stdout.write(
        "P08 T056: both backup kinds retain known/uncertain/failed-containment gates and refuse subsequent effects\n",
      );
      const failedState = {
        ...openState,
        phase: "UNCERTAIN",
        lastFailure: {
          runId,
          code: "RELEASE_CHECK_FAILED",
          stage: "migration-deploy",
          occurredAt: new Date().toISOString(),
        },
      };
      await context.files.writeJson(context.paths.stateFile, failedState);
      let starts = 0;
      const noStarts = {
        ...context,
        command: async (request) => {
          if (request.argv[0] === "start") starts++;
          return context.command(request);
        },
      };
      await assert.rejects(
        runReleaseAction(noStarts, {
          ...dailyArgs,
          scheduled: true,
          authorizationReference: null,
        }),
        {
          code: "RELEASE_ADMISSION_MISSING",
          stage: "healthy-open-state-required",
        },
      );
      assert.equal(starts, 0);
      await context.files.writeJson(context.paths.stateFile, openState);
      let replacedMaintenance = false,
        stopsBefore503 = 0;
      const wrongMaintenance = {
        ...context,
        command: async (request) => {
          if (request.argv[0] === "stop") stopsBefore503++;
          const response = await context.command(request);
          if (request.stage === "caddy-isolated-port" && !replacedMaintenance) {
            replacedMaintenance = true;
            await changeCaddyMode(context, "normal");
          }
          return response;
        },
      };
      await assert.rejects(runReleaseAction(wrongMaintenance, dailyArgs), {
        code: "RELEASE_CHECK_FAILED",
        stage: "caddy-http-status",
      });
      assert.equal(stopsBefore503, 0);
      assert.ok(replacedMaintenance);
      await context.files.writeJson(context.paths.stateFile, openState);
      const failureBundlesBefore = new Set(
        await readdir(context.config.backupDirectory),
      );
      let failBackupRestore = true;
      const failedDaily = {
        ...context,
        command: async (request) => {
          const response = await context.command(request);
          if (request.stage === "restore-create" && failBackupRestore) {
            failBackupRestore = false;
            throw new ReleaseFailure(
              "RELEASE_STATE_UNCERTAIN",
              "daily-restore-lost-reply",
            );
          }
          return response;
        },
      };
      await assert.rejects(runReleaseAction(failedDaily, dailyArgs), {
        code: "RELEASE_STATE_UNCERTAIN",
        stage: "daily-restore-lost-reply",
      });
      await observeDeployment(context);
      assert.ok(context.registry.get("api").running);
      assert.ok(context.registry.get("web").running);
      const failureState = JSON.parse(
        await context.files.read(context.paths.stateFile),
      );
      assert.equal(failureState.phase, "OPEN");
      assert.equal(failureState.lastFailure.stage, "daily-restore-lost-reply");
      const failedBundle = (await readdir(context.config.backupDirectory)).find(
        (name) =>
          !failureBundlesBefore.has(name) && /^[a-f0-9-]{36}$/u.test(name),
      );
      assert.ok(failedBundle);
      assert.equal(
        JSON.parse(
          await readFile(
            path.join(
              context.config.backupDirectory,
              failedBundle,
              "manifest.json",
            ),
            "utf8",
          ),
        ).verified,
        false,
      );
      await context.files.writeJson(context.paths.stateFile, openState);
      await compose(context, image, ["stop", "--timeout", "15", "api", "web"]);
      const stoppedBackup = await runReleaseAction(context, predeployArgs);
      assert.equal(stoppedBackup.phase, "MAINTENANCE");
      await observeDeployment(context);
      assert.equal(context.registry.get("api").running, false);
      assert.equal(context.registry.get("web").running, false);
      await compose(context, image, [
        "up",
        "-d",
        "--no-deps",
        "--wait",
        "--wait-timeout",
        "120",
        "api",
        "web",
      ]);
      const restoreModeLease = await context.files.acquireLock();
      try {
        await changeCaddyMode(context, "normal");
      } finally {
        await restoreModeLease.release();
      }
      await context.files.writeJson(context.paths.stateFile, openState);
      process.stdout.write(
        "P08 isolated: wrong maintenance response blocks stop, failed backup safely restores availability, manual stopped backup never starts services\n",
      );
      process.stdout.write(
        "P08 isolated: healthy daily resume, stale mode and failed-state scheduled refusal verified\n",
      );
      const active = await readFile(
        path.join(context.paths.caddy, "Caddyfile"),
        "utf8",
      );
      await writeFile(
        path.join(context.paths.caddy, "Caddyfile"),
        active.replace("local_certs", "local_certs\n admin off"),
      );
      await compose(context, image, ["restart", "caddy"]);
      const finalBinding = (
        await compose(context, image, ["port", "caddy", "443"])
      ).trim();
      assert.match(finalBinding, /^127\.0\.0\.1:\d+$/u);
      port = Number(finalBinding.split(":")[1]);
      await assert.rejects(changeMode("maintenance"), {
        code: "RELEASE_STATE_UNCERTAIN",
      });
      assert.equal(
        await readFile(path.join(context.paths.caddy, "mode.caddy"), "utf8"),
        renderCaddyMode(context.config, "normal"),
      );
      assert.equal(
        (await tlsReady(context.config, port, ca, "/api/v1/health/ready"))
          .status,
        200,
      );
      await compose(context, image, ["stop", "--timeout", "15", "api", "web"]);
      await compose(
        context,
        image,
        [
          "exec",
          "-T",
          "postgres",
          "psql",
          "-X",
          "-q",
          "-v",
          "ON_ERROR_STOP=1",
          "--username=oriental_bootstrap",
          "--dbname=oriental",
        ],
        `INSERT INTO public.users (id,email,password_hash,full_name,updated_at) VALUES ('${randomUUID()}','backup-check@example.com','synthetic-not-a-login',E'أحذية\\nUnicode 🥿',now());`,
      );
      const migratedBackup = await backupFixture("daily");
      assert.equal(migratedBackup.bundle.manifest.classification, "MIGRATED");
      assert.equal(
        migratedBackup.bundle.manifest.before.tables.find(
          (table) => table.table === "users",
        ).rowCount,
        "3",
      );
      assert.deepEqual(
        migratedBackup.bundle.manifest.before,
        migratedBackup.bundle.manifest.restored,
      );
      assert.deepEqual(
        migratedBackup.bundle.manifest.before,
        migratedBackup.bundle.manifest.restarted,
      );
      const backupFile = path.join(
        migratedBackup.bundle.directory,
        "database.dump",
      );
      const originalArchiveOpen = fsPromises.open,
        originalRestoreSpawn = childProcess.spawn;
      let archiveOpenCount = 0,
        restoreChildStarts = 0;
      fsPromises.open = async (filename, ...args) => {
        if (String(filename) === backupFile && ++archiveOpenCount === 2)
          throw Object.assign(new Error("Owned archive reopen failed"), {
            code: "EIO",
          });
        return originalArchiveOpen(filename, ...args);
      };
      childProcess.spawn = (...args) => {
        if (Array.isArray(args[1]) && args[1].includes("pg_restore"))
          restoreChildStarts++;
        return originalRestoreSpawn(...args);
      };
      syncBuiltinESMExports();
      try {
        await assert.rejects(
          verifyBackupInDisposableDatabase(
            migratedBackup.backupContext,
            migratedBackup.bundle,
          ),
          { code: "EIO" },
        );
        assert.equal(archiveOpenCount, 2);
        assert.equal(restoreChildStarts, 0);
        assert.ok(
          !(await readdir(context.paths.state)).some(
            (name) => name.startsWith("restore-") && name.endsWith(".env"),
          ),
        );
        for (const captured of context.captures.containers.values())
          if (captured.role === "backup-restore")
            assert.equal(
              await optionalInspection(context, "container", captured.id),
              null,
            );
      } finally {
        fsPromises.open = originalArchiveOpen;
        childProcess.spawn = originalRestoreSpawn;
        syncBuiltinESMExports();
      }
      assert.deepEqual(
        await readDatabaseFingerprint(migratedBackup.backupContext, "postgres"),
        migratedBackup.bundle.manifest.before,
      );
      process.stdout.write(
        "P08 isolated: archive reopen I/O failure starts no restore child, cleans owned scratch resources and preserves source\n",
      );
      const originalArchive = await readFile(backupFile);
      await writeFile(
        backupFile,
        originalArchive.subarray(0, Math.floor(originalArchive.length / 2)),
      );
      await assert.rejects(
        verifyBackupInDisposableDatabase(
          migratedBackup.backupContext,
          migratedBackup.bundle,
        ),
        { code: "RELEASE_CHECK_FAILED" },
      );
      const truncatedArchive = originalArchive.subarray(
        0,
        Math.floor(originalArchive.length / 2),
      );
      const transferredBundle = {
        ...migratedBackup.bundle,
        manifest: parseBackupManifest({
          ...migratedBackup.bundle.manifest,
          archive: {
            bytes: String(truncatedArchive.length),
            sha256: sha256(truncatedArchive),
          },
        }),
      };
      await assert.rejects(
        verifyBackupInDisposableDatabase(
          migratedBackup.backupContext,
          transferredBundle,
        ),
        { code: "RELEASE_CHECK_FAILED", stage: "archive-restore" },
      );
      assert.ok(
        !(await readdir(context.paths.state)).some(
          (name) => name.startsWith("restore-") && name.endsWith(".env"),
        ),
      );
      await writeFile(backupFile, originalArchive);
      let lostRestoreId = null;
      const lostRestoreContext = {
        ...migratedBackup.backupContext,
        command: async (request) => {
          const response = await context.command(request);
          if (request.stage === "restore-create") {
            lostRestoreId = response.stdout.trim();
            throw new ReleaseFailure(
              "RELEASE_STATE_UNCERTAIN",
              "restore-create-lost-reply",
            );
          }
          return response;
        },
      };
      await assert.rejects(
        verifyBackupInDisposableDatabase(
          lostRestoreContext,
          migratedBackup.bundle,
        ),
        { code: "RELEASE_STATE_UNCERTAIN", stage: "restore-create-lost-reply" },
      );
      assert.match(lostRestoreId, /^[0-9a-f]{64}$/u);
      assert.equal(
        await optionalInspection(context, "container", lostRestoreId),
        null,
      );
      let nonemptyId = null;
      const nonemptyRestore = {
        ...migratedBackup.backupContext,
        command: async (request) => {
          const response = await context.command(request);
          if (request.stage === "restore-empty-initialize") {
            nonemptyId = request.argv[2];
            await context.command({
              executable: "docker",
              argv: [
                "exec",
                "-i",
                nonemptyId,
                "psql",
                "-X",
                "-q",
                "-v",
                "ON_ERROR_STOP=1",
                "--username=oriental_bootstrap",
                "--dbname=oriental",
              ],
              input:
                "CREATE TABLE public.unexpected_existing_piece (id integer);",
              stage: "isolated-restore-nonempty-fixture",
            });
          }
          return response;
        },
      };
      await assert.rejects(
        verifyBackupInDisposableDatabase(
          nonemptyRestore,
          migratedBackup.bundle,
        ),
        { code: "RELEASE_TARGET_MISMATCH", stage: "restore-nonempty" },
      );
      assert.equal(
        await optionalInspection(context, "container", nonemptyId),
        null,
      );
      assert.ok(
        !(await readdir(context.paths.state)).some(
          (name) => name.startsWith("restore-") && name.endsWith(".env"),
        ),
      );
      assert.deepEqual(
        await readDatabaseFingerprint(migratedBackup.backupContext, "postgres"),
        migratedBackup.bundle.manifest.before,
      );
      const unownedContext = {
        ...migratedBackup.backupContext,
        registry: new Map(),
      };
      await assert.rejects(
        readDatabaseFingerprint(unownedContext, "postgres"),
        { code: "RELEASE_TARGET_MISMATCH" },
      );
      const currentIndexPath = path.join(
        context.config.backupDirectory,
        `${context.config.environmentId}.index.json`,
      );
      const originalIndexBytes = await readFile(currentIndexPath, "utf8");
      const foreignIndexBytes = JSON.stringify({
        ...JSON.parse(originalIndexBytes),
        storageIdentity: "foreign-storage",
      });
      await writeFile(currentIndexPath, foreignIndexBytes);
      const bundleNamesBefore = await readdir(context.config.backupDirectory);
      const badIndexLease = await context.files.acquireLock();
      try {
        await assert.rejects(
          createVerifiedBackup(migratedBackup.backupContext, "daily"),
          { code: "RELEASE_TARGET_MISMATCH", stage: "backup-index-storage" },
        );
        assert.equal(
          await readFile(currentIndexPath, "utf8"),
          foreignIndexBytes,
        );
        assert.deepEqual(
          await readdir(context.config.backupDirectory),
          bundleNamesBefore,
        );
      } finally {
        await writeFile(currentIndexPath, originalIndexBytes);
        await badIndexLease.release();
      }
      const backupContext = migratedBackup.backupContext;
      const indexPath = path.join(
        context.config.backupDirectory,
        `${context.config.environmentId}.index.json`,
      );
      const initialIndex = parseBackupIndex(
        JSON.parse(await readFile(indexPath, "utf8")),
        recordIdentity(context),
      );
      const entries = [...initialIndex.entries];
      for (let day = 1; day <= 16; day++) {
        const id = randomUUID(),
          directory = path.join(context.config.backupDirectory, id),
          date = `2025-01-${String(day).padStart(2, "0")}`;
        await mkdir(directory, { mode: 0o700 });
        const cloned = parseBackupManifest({
          ...migratedBackup.bundle.manifest,
          id,
          businessDate: date,
          completedAt: `${date}T00:00:00.000Z`,
        });
        for (const name of [
          "database.dump",
          ...cloned.privateFiles.map((file) => file.name),
        ])
          await writeFile(
            path.join(directory, name),
            await readFile(path.join(migratedBackup.bundle.directory, name)),
            { mode: 0o600 },
          );
        const contents = JSON.stringify(cloned);
        await writeFile(path.join(directory, "manifest.json"), contents, {
          mode: 0o600,
        });
        entries.push({
          ...initialIndex.entries.find(
            (entry) => entry.id === migratedBackup.bundle.manifest.id,
          ),
          id,
          businessDate: date,
          completedAt: cloned.completedAt,
          manifestSha256: sha256(contents),
        });
      }
      const retentionIndex = parseBackupIndex(
        { ...initialIndex, entries },
        recordIdentity(context),
      );
      await writeFile(indexPath, JSON.stringify(retentionIndex));
      const retentionNamesBefore = (
        await readdir(context.config.backupDirectory)
      ).sort();
      const retentionLease = await context.files.acquireLock();
      const originalOpen = fsPromises.open,
        originalUnlink = fsPromises.unlink;
      try {
        const absentReceiptId = randomUUID();
        const falseOpening = parseBackupIndex(
          {
            ...retentionIndex,
            entries: retentionIndex.entries.map((entry) =>
              entry.id === freshBackup.bundle.manifest.id
                ? {
                    ...entry,
                    openedByRevision: "f".repeat(40),
                    openReceiptReference: `run:${absentReceiptId}`,
                  }
                : entry,
            ),
          },
          recordIdentity(context),
        );
        await assert.rejects(
          pruneVerifiedDailyBackups(backupContext, falseOpening),
        );
        assert.deepEqual(
          (await readdir(context.config.backupDirectory)).sort(),
          retentionNamesBefore,
        );
        assert.equal(
          await readFile(indexPath, "utf8"),
          JSON.stringify(retentionIndex),
        );

        let rejectedPublication = false;
        fsPromises.open = async (filename, ...rest) => {
          if (
            String(filename).startsWith(indexPath + ".") &&
            String(filename).endsWith(".partial") &&
            !rejectedPublication
          ) {
            rejectedPublication = true;
            throw Object.assign(Error("injected index storage failure"), {
              code: "ENOSPC",
            });
          }
          return originalOpen(filename, ...rest);
        };
        syncBuiltinESMExports();
        await assert.rejects(
          pruneVerifiedDailyBackups(backupContext, retentionIndex),
        );
        assert.ok(rejectedPublication);
        assert.deepEqual(
          (await readdir(context.config.backupDirectory)).sort(),
          retentionNamesBefore,
        );
        for (const entry of retentionIndex.entries) {
          const directory = path.join(context.config.backupDirectory, entry.id);
          assert.ok(
            (await readFile(path.join(directory, "database.dump"))).length > 0,
          );
          assert.equal(
            sha256(await readFile(path.join(directory, "manifest.json"))),
            entry.manifestSha256,
          );
        }
        fsPromises.open = originalOpen;
        syncBuiltinESMExports();
        let removed = 0;
        fsPromises.unlink = async (filename) => {
          if (
            String(filename).startsWith(context.config.backupDirectory + "/") &&
            !String(filename).includes(".partial")
          ) {
            removed++;
            if (removed === 2)
              throw Object.assign(Error("injected deletion interruption"), {
                code: "EIO",
              });
          }
          return originalUnlink(filename);
        };
        syncBuiltinESMExports();
        await assert.rejects(
          pruneVerifiedDailyBackups(backupContext, retentionIndex),
        );
        assert.equal(removed, 2);
        fsPromises.unlink = originalUnlink;
        syncBuiltinESMExports();
        const durableIndex = parseBackupIndex(
          JSON.parse(await readFile(indexPath, "utf8")),
          recordIdentity(context),
        );
        assert.equal(
          new Set(
            durableIndex.entries
              .filter((entry) => entry.kind === "daily")
              .map((entry) => entry.businessDate),
          ).size,
          14,
        );
        assert.ok(
          durableIndex.entries.some(
            (entry) => entry.id === freshBackup.bundle.manifest.id,
          ),
        );
        const retried = await pruneVerifiedDailyBackups(
          backupContext,
          durableIndex,
        );
        assert.deepEqual(retried, durableIndex);
      } finally {
        fsPromises.open = originalOpen;
        fsPromises.unlink = originalUnlink;
        syncBuiltinESMExports();
        await retentionLease.release();
      }
      process.stdout.write(
        "P08 isolated: fourteen daily dates and protected checkpoint retained; publication/deletion failures stay recoverable\n",
      );
      const replacementRunId = randomUUID();
      const replacementRoot = await realpath(
        await mkdtemp(path.join(tmpdir(), `p08-ops-test-${replacementRunId}-`)),
      );
      await chmod(replacementRoot, 0o700);
      let replacement;
      try {
        const replacementRelease = path.join(
          replacementRoot,
          "deployment",
          "releases",
          manifest.revision,
        );
        await mkdir(path.dirname(replacementRelease), { recursive: true });
        await cp(context.paths.release, replacementRelease, {
          recursive: true,
        });
        replacement = (
          await fixture(replacementRoot, replacementRunId, manifest.revision)
        ).context;
        await replacement.files.writeJson(
          replacement.paths.config,
          replacement.config,
        );
        await mkdir(replacement.config.backupDirectory, {
          recursive: true,
          mode: 0o700,
        });
        await chmod(replacement.config.backupMountPoint, 0o700);
        const importParent = path.join(
          replacement.config.backupDirectory,
          "recovery-source",
        );
        await mkdir(importParent, { mode: 0o700 });
        const importedBundle = path.join(
          importParent,
          migratedBackup.bundle.manifest.id,
        );
        await cp(migratedBackup.bundle.directory, importedBundle, {
          recursive: true,
        });
        await writeFile(
          path.join(importParent, `${context.config.environmentId}.index.json`),
          await readFile(indexPath),
          { mode: 0o600 },
        );
        const recoveryArgs = parseReleaseArguments([
          "recover-replacement",
          "--config",
          replacement.paths.config,
          "--apply",
          "--confirm-environment",
          replacement.config.environmentId,
          "--authorization-reference",
          "isolated-replacement-recovery",
          "--backup-id",
          migratedBackup.bundle.manifest.id,
          "--confirm-restore",
          `${replacement.config.environmentId}:${replacement.config.projectName}:${replacement.config.databaseName}`,
        ]);
        const originalManifestBytes = await readFile(
          path.join(importedBundle, "manifest.json"),
          "utf8",
        );
        await writeFile(
          path.join(importedBundle, "manifest.json"),
          JSON.stringify({
            ...JSON.parse(originalManifestBytes),
            operatorReference: "modified-valid-reference",
          }),
        );
        await assert.rejects(
          recoverReplacement(await nextInvocation(replacement), recoveryArgs),
          {
            code: "RELEASE_TARGET_MISMATCH",
            stage: "replacement-manifest-hash",
          },
        );
        assert.equal(
          (
            await dockerCommand(replacement, [
              "ps",
              "-aq",
              "--filter",
              `label=com.docker.compose.project=${replacement.projectName}`,
            ])
          ).trim(),
          "",
        );
        await writeFile(
          path.join(importedBundle, "manifest.json"),
          originalManifestBytes,
        );
        const sourceArchiveBytes = await readFile(
          path.join(importedBundle, "database.dump"),
        );
        await writeFile(
          path.join(importedBundle, "database.dump"),
          Buffer.concat([sourceArchiveBytes, Buffer.from("corruption")]),
        );
        await assert.rejects(
          recoverReplacement(await nextInvocation(replacement), recoveryArgs),
          { code: "RELEASE_CHECK_FAILED", stage: "backup-archive-hash" },
        );
        assert.equal(
          (
            await dockerCommand(replacement, [
              "ps",
              "-aq",
              "--filter",
              `label=com.docker.compose.project=${replacement.projectName}`,
            ])
          ).trim(),
          "",
        );
        await writeFile(
          path.join(importedBundle, "database.dump"),
          sourceArchiveBytes,
        );
        const packagedReplacement = await recoverReplacement(
          await nextInvocation(replacement),
          recoveryArgs,
        );
        assert.equal(packagedReplacement.phase, "PACKAGED");
        assert.equal(packagedReplacement.outcome, "AWAITING_OPERATOR");
        assert.equal(
          (
            await dockerCommand(replacement, [
              "ps",
              "-aq",
              "--filter",
              `label=com.docker.compose.project=${replacement.projectName}`,
            ])
          ).trim(),
          "",
        );
        const replacementPackage = JSON.parse(
          await replacement.files.read(packagedReplacement.evidenceReference),
        );
        assert.equal(replacementPackage.projectName, replacement.projectName);
        assert.notEqual(replacementPackage.projectName, manifest.projectName);
        await replacement.files.writeJson(replacement.paths.evidence, {
          ...localOnlyEvidence,
          ...recordIdentity(replacement),
          applicationImageId: replacementPackage.applicationImageId,
          observations: localOnlyEvidence.observations,
        });
        const sourceFingerprintBeforeRecovery = await readDatabaseFingerprint(
          backupContext,
          "postgres",
        );
        const recovered = await recoverReplacement(
          await nextInvocation(replacement),
          recoveryArgs,
        );
        assert.equal(recovered.phase, "ACCEPTANCE");
        assert.equal(recovered.outcome, "AWAITING_OPERATOR");
        const recoveredState = JSON.parse(
          await replacement.files.read(replacement.paths.stateFile),
        );
        assert.equal(recoveredState.active, null);
        assert.equal(recoveredState.authority, null);
        assert.equal(
          recoveredState.administratorReauthenticationRequired,
          true,
        );
        assert.notEqual(
          recoveredState.checkpointId,
          migratedBackup.bundle.manifest.id,
        );
        const replacementCheckpoint = parseBackupManifest(
          JSON.parse(
            await readFile(
              path.join(
                replacement.config.backupDirectory,
                recoveredState.checkpointId,
                "manifest.json",
              ),
              "utf8",
            ),
          ),
        );
        assert.deepEqual(
          replacementCheckpoint.before,
          migratedBackup.bundle.manifest.before,
        );
        assert.deepEqual(
          await readDatabaseFingerprint(backupContext, "postgres"),
          sourceFingerprintBeforeRecovery,
        );
        assert.equal(
          await readFile(path.join(importedBundle, "manifest.json"), "utf8"),
          originalManifestBytes,
        );
        assert.deepEqual(
          await readFile(path.join(importedBundle, "database.dump")),
          sourceArchiveBytes,
        );
        await assert.rejects(
          recoverReplacement(await nextInvocation(replacement), recoveryArgs),
          {
            code: "RELEASE_ADMISSION_MISSING",
            stage: "replacement-initial-state",
          },
        );
        process.stdout.write(
          "P08 isolated: second-project repackage, imported hash refusals, real retained-data restore and fresh checkpoint/acceptance verified; source unchanged\n",
        );
      } finally {
        if (replacement) await ownedCleanup(replacement);
        await rm(replacementRoot, { recursive: true, force: true });
      }
      const upgradeRunId = randomUUID();
      const upgradeRoot = await realpath(
        await mkdtemp(path.join(tmpdir(), `p08-ops-test-${upgradeRunId}-`)),
      );
      await chmod(upgradeRoot, 0o700);
      let upgrade;
      try {
        const targetRelease = path.join(
          upgradeRoot,
          "deployment",
          "releases",
          manifest.revision,
        );
        await mkdir(path.dirname(targetRelease), { recursive: true });
        await cp(context.paths.release, targetRelease, { recursive: true });
        const upgradeFixture = await fixture(
          upgradeRoot,
          upgradeRunId,
          manifest.revision,
        );
        upgrade = upgradeFixture.context;
        await upgrade.files.writeJson(upgrade.paths.config, upgrade.config);
        await mkdir(upgrade.config.backupDirectory, {
          recursive: true,
          mode: 0o700,
        });
        await chmod(upgrade.config.backupMountPoint, 0o700);
        const packaged = await runReleaseAction(upgrade, {
          ...applied,
          configFile: upgrade.paths.config,
        });
        const pkg = JSON.parse(
          await upgrade.files.read(packaged.evidenceReference),
        );
        await upgrade.files.writeJson(upgrade.paths.evidence, {
          ...localOnlyEvidence,
          ...recordIdentity(upgrade),
          applicationImageId: pkg.applicationImageId,
        });
        await compose(upgrade, pkg.applicationImageId, [
          "up",
          "-d",
          "--wait",
          "--wait-timeout",
          "120",
          "postgres",
        ]);
        const fixtureLease = await upgrade.files.acquireLock();
        try {
          await queryDatabase(upgrade, {
            database: "postgres",
            stage: "isolated-prefix-initialize",
            sql: `SET standard_conforming_strings=on;CREATE ROLE ${upgrade.config.applicationRole} LOGIN PASSWORD '${upgradeFixture.appPassword.replaceAll("'", "''")}';CREATE DATABASE ${upgrade.config.databaseName} OWNER ${upgrade.config.applicationRole} TEMPLATE template0 ENCODING 'UTF8';`,
          });
        } finally {
          await fixtureLease.release();
        }
        const prefixProgram =
          "import{readdir,rm}from'node:fs/promises';import{spawnSync}from'node:child_process';const root='/workspace/packages/database/prisma/migrations';const names=(await readdir(root)).filter(x=>/^\\d{14}_/.test(x)).sort();await rm(root+'/'+names.at(-1),{recursive:true});const result=spawnSync('pnpm',['--config.verify-deps-before-run=false','--filter','@template/database','db:migrate:deploy'],{cwd:'/workspace',env:process.env,stdio:'inherit'});process.exit(result.status??1);";
        await compose(upgrade, pkg.applicationImageId, [
          "run",
          "--rm",
          "--no-deps",
          "--workdir",
          "/workspace/apps/api",
          "api",
          "node",
          "--input-type=module",
          "--eval",
          prefixProgram,
        ]);
        const prefixLease = await upgrade.files.acquireLock();
        try {
          await queryDatabase(upgrade, {
            database: "application",
            stage: "isolated-prefix-data",
            sql: `SET ROLE ${upgrade.config.applicationRole};INSERT INTO users(id,email,full_name,password_hash,role,status,access_version,created_at,updated_at) VALUES('${randomUUID()}','upgrade@example.com','Retained upgrade fixture','unusable-test-hash','USER','PENDING_VERIFICATION',0,now(),now());`,
          });
        } finally {
          await prefixLease.release();
        }
        const prepareArgs = parseReleaseArguments([
          "prepare",
          "--config",
          upgrade.paths.config,
          "--apply",
          "--confirm-environment",
          upgrade.config.environmentId,
          "--authorization-reference",
          "isolated-forward-upgrade",
        ]);
        const prefixLast = pkg.migrations.at(-2);
        for (const invalid of [
          {
            stage: "checksum",
            breakSql: `UPDATE _prisma_migrations SET checksum='${"0".repeat(64)}' WHERE migration_name='${prefixLast.name}';`,
            repairSql: `UPDATE _prisma_migrations SET checksum='${prefixLast.sha256}' WHERE migration_name='${prefixLast.name}';`,
          },
          {
            stage: "failed",
            breakSql: `UPDATE _prisma_migrations SET rolled_back_at=now() WHERE migration_name='${prefixLast.name}';`,
            repairSql: `UPDATE _prisma_migrations SET rolled_back_at=NULL WHERE migration_name='${prefixLast.name}';`,
          },
          {
            stage: "missing",
            breakSql: `ALTER TABLE _prisma_migrations RENAME TO isolated_hidden_ledger;`,
            repairSql: `ALTER TABLE isolated_hidden_ledger RENAME TO _prisma_migrations;`,
          },
        ]) {
          const mutation = await upgrade.files.acquireLock();
          try {
            await queryDatabase(upgrade, {
              database: "application",
              stage: `isolated-${invalid.stage}-ledger`,
              sql: invalid.breakSql,
            });
          } finally {
            await mutation.release();
          }
          let starts = 0,
            migrations = 0;
          const denied = await nextInvocation(upgrade);
          try {
            await assert.rejects(
              runPrepare(
                {
                  ...denied,
                  command: async (request) => {
                    if (request.stage === "operation-start-applications")
                      starts++;
                    if (request.stage === "operation-migration-deploy")
                      migrations++;
                    return denied.command(request);
                  },
                },
                prepareArgs,
              ),
              { code: "RELEASE_CHECK_FAILED" },
            );
            assert.equal(starts, 0);
            assert.equal(migrations, 0);
          } finally {
            const repair = await upgrade.files.acquireLock();
            try {
              await queryDatabase(upgrade, {
                database: "application",
                stage: `isolated-repair-${invalid.stage}-ledger`,
                sql: invalid.repairSql,
              });
            } finally {
              await repair.release();
            }
          }
        }
        let realDeployFailed = false;
        const failedInvocation = await nextInvocation(upgrade);
        const failLoginBeforeDeploy = {
          ...failedInvocation,
          command: async (request) => {
            if (
              request.stage === "operation-migration-deploy" &&
              !realDeployFailed
            ) {
              realDeployFailed = true;
              await queryDatabase(failedInvocation, {
                database: "postgres",
                stage: "isolated-disable-prefix-login",
                sql: `ALTER ROLE ${upgrade.config.applicationRole} NOLOGIN;`,
              });
            }
            return failedInvocation.command(request);
          },
        };
        await assert.rejects(runPrepare(failLoginBeforeDeploy, prepareArgs), {
          code: "RELEASE_CHECK_FAILED",
          stage: "migration-deploy",
        });
        assert.equal(realDeployFailed, true);
        const failed = JSON.parse(
          await upgrade.files.read(upgrade.paths.stateFile),
        );
        assert.equal(failed.phase, "MAINTENANCE");
        assert.notEqual(failed.lastFailure, null);
        assert.equal(
          upgrade.captures.expectedContainerNames.has(
            `${upgrade.projectName}-api-1`,
          ),
          false,
        );
        await assert.rejects(
          runRestart(await nextInvocation(upgrade), {
            ...prepareArgs,
            action: "restart",
          }),
          { code: "RELEASE_ADMISSION_MISSING" },
        );
        await assert.rejects(
          runBackup(await nextInvocation(upgrade), {
            ...prepareArgs,
            action: "backup",
            kind: "daily",
            scheduled: true,
          }),
          { code: "RELEASE_ADMISSION_MISSING" },
        );
        const restoreFixture = await upgrade.files.acquireLock();
        try {
          await queryDatabase(upgrade, {
            database: "postgres",
            stage: "isolated-restore-prefix-login",
            sql: `ALTER ROLE ${upgrade.config.applicationRole} LOGIN;`,
          });
        } finally {
          await restoreFixture.release();
        }
        const completed = await runPrepare(
          await nextInvocation(upgrade),
          prepareArgs,
        );
        assert.equal(completed.phase, "ACCEPTANCE");
        const checkpointState = JSON.parse(
          await upgrade.files.read(upgrade.paths.stateFile),
        );
        const checkpoint = parseBackupManifest(
          JSON.parse(
            await readFile(
              path.join(
                upgrade.config.backupDirectory,
                checkpointState.checkpointId,
                "manifest.json",
              ),
              "utf8",
            ),
          ),
        );
        assert.equal(
          checkpoint.before.migrationFacts.length,
          pkg.migrations.length - 1,
        );
        assert.equal(
          checkpoint.before.tables.find((item) => item.table === "users")
            .rowCount,
          "1",
        );
        const finalFingerprint = await readDatabaseFingerprint(
          {
            ...upgrade,
            packageRecord: pkg,
            authorizationReference: "isolated-upgrade-observation",
            sourceServices: checkpointState.serviceSnapshot,
            sourceCaddyMode: "acceptance",
          },
          "postgres",
        );
        assert.equal(
          finalFingerprint.migrationFacts.length,
          pkg.migrations.length,
        );
        assert.equal(
          finalFingerprint.tables.find((item) => item.table === "users")
            .rowCount,
          "1",
        );
        process.stdout.write(
          "P08 isolated: real populated Prisma prefix, failed migration containment/no revival, retained-data forward upgrade verified\n",
        );
      } finally {
        if (upgrade) await ownedCleanup(upgrade);
        await rm(upgradeRoot, { recursive: true, force: true });
      }
      process.stdout.write(
        "P08 isolated: migrated Unicode/null archive restore/restart and corrupt transfer refusal verified\n",
      );
    } catch (failure) {
      operationFailure = failure;
      if (context) {
        try {
          await captureKnownResources(context);
        } catch (observationFailure) {
          operationFailure = new AggregateError(
            [failure, observationFailure],
            "Operation and private failure observation failed",
          );
        }
        testContext.diagnostic(
          `Private failure evidence: ${await saveFailureEvidence(context, operationFailure)}`,
        );
      }
      throw operationFailure;
    } finally {
      try {
        if (context) await ownedCleanup(context);
      } catch (cleanupFailure) {
        if (operationFailure)
          throw new AggregateError(
            [operationFailure, cleanupFailure],
            "Operation and owned cleanup failed",
          );
        throw cleanupFailure;
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  },
);
