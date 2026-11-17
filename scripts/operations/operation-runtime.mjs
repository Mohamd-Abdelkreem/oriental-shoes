import { constants } from "node:fs";
import {
  open,
  lstat,
  realpath,
  rename,
  unlink,
  readFile,
  readdir,
  statfs,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { lookup } from "node:dns/promises";
import { spawn } from "node:child_process";
import https from "node:https";
import { TLSSocket } from "node:tls";
import {
  ReleaseFailure,
  deriveReleasePaths,
  parsePrivateJson,
  parseRawEnvironment,
  parseReleaseConfig,
  validateReleaseEnvironment,
  admitTarget,
  renderCaddyMode,
  assertResourceOwnership,
  bindAdministratorConfig,
} from "./release-config.mjs";
/** @typedef {import('./release-config.mjs').ReleaseConfig} ReleaseConfig */
/** @typedef {Awaited<ReturnType<typeof createOperationContext>>} OperationContext */
/** @typedef {Readonly<{executable:'docker'|'git'|'systemctl'|'systemd-analyze'|'findmnt',argv:readonly string[],stage:string,cwd?:string,input?:string,timeoutMs?:number,publicEnvironment?:Readonly<Record<string,string>>}>} CommandRequest */

/** @param {CommandRequest} request @param {Readonly<{environment:NodeJS.ProcessEnv,deadline:number}>} execution */
export async function runMetadataCommand(request, execution) {
  const publicKeys = new Set([
    "ENVIRONMENT_ID",
    "POSTGRES_IMAGE",
    "CADDY_IMAGE",
    "APPLICATION_IMAGE",
    "RUNTIME_ENV_FILE",
    "POSTGRES_ENV_FILE",
    "APP_DOMAIN",
    "CADDY_CONFIG_DIRECTORY",
  ]);
  if (
    request.publicEnvironment &&
    Object.keys(request.publicEnvironment).some((key) => !publicKeys.has(key))
  )
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "child-environment");
  const timeoutMs = Math.min(
    request.timeoutMs ?? 120000,
    execution.deadline - Date.now(),
  );
  if (timeoutMs <= 0)
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", request.stage);
  return new Promise(
    /** @param {(output:Readonly<{exitCode:number,stdout:string}>)=>void} resolve @param {(failure:unknown)=>void} reject */ (
      resolve,
      reject,
    ) => {
      const child = spawn(request.executable, request.argv, {
        cwd: request.cwd,
        env: { ...execution.environment, ...request.publicEnvironment },
        stdio: ["pipe", "pipe", "ignore"],
      });
      /** @type {Buffer[]} */ const chunks = [];
      let bytes = 0;
      let uncertain = false;
      const timeout = setTimeout(() => {
        uncertain = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 1048576) {
          uncertain = true;
          child.kill("SIGKILL");
        } else chunks.push(chunk);
      });
      child.stdin.on("error", () => {
        uncertain = true;
      });
      child.on("error", () => {
        clearTimeout(timeout);
        reject(new ReleaseFailure("RELEASE_CHECK_FAILED", request.stage));
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (uncertain || code === null)
          reject(new ReleaseFailure("RELEASE_STATE_UNCERTAIN", request.stage));
        else
          resolve(
            Object.freeze({
              exitCode: code,
              stdout: Buffer.concat(chunks).toString("utf8"),
            }),
          );
      });
      child.stdin.end(request.input ?? "");
    },
  );
}

/** @param {OperationContext} context @param {CommandRequest} request */
export async function checkedCommand(context, request) {
  const response = await context.command(request);
  if (response.exitCode !== 0)
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", request.stage);
  return response.stdout;
}

/** @param {string} filename @param {Readonly<{uid:number,maximumBytes:number}>} policy */
export async function readPrivateFile(filename, policy) {
  const metadata = await lstat(filename);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== policy.uid ||
    (metadata.mode & 0o777) !== 0o600 ||
    metadata.nlink !== 1 ||
    metadata.size > policy.maximumBytes
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "private-file");
  if ((await realpath(filename)) !== filename)
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "private-file-path");
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const opened = await handle.stat();
    if (
      opened.ino !== metadata.ino ||
      opened.dev !== metadata.dev ||
      opened.size > policy.maximumBytes ||
      opened.uid !== policy.uid ||
      (opened.mode & 0o777) !== 0o600
    )
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "private-file-race");
    const bytes = Buffer.alloc(policy.maximumBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = await handle.read(bytes, count, bytes.length - count, null);
      if (read.bytesRead === 0) break;
      count += read.bytesRead;
    }
    if (count > policy.maximumBytes)
      throw new ReleaseFailure("RELEASE_INPUT_INVALID", "private-file-size");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, count),
    );
  } finally {
    await handle.close();
  }
}

/** @param {ReleaseConfig} config @param {string} repository */
export function validatePrivateLocations(config, repository) {
  const paths = deriveReleasePaths(config);
  for (const filename of [config.runtimeEnvFile, config.postgresEnvFile]) {
    if (
      [repository, paths.base, config.backupDirectory].some(
        (directory) =>
          filename === directory || filename.startsWith(`${directory}/`),
      )
    )
      throw new ReleaseFailure(
        "RELEASE_INPUT_INVALID",
        "private-file-location",
      );
  }
}

/** @param {unknown} failure @param {string} code */
export function isFileFailure(failure, code) {
  return failure instanceof Error && "code" in failure && failure.code === code;
}

/** @param {string} directory @param {number} uid */
export async function admitPrivateDirectory(directory, uid) {
  const metadata = await lstat(directory);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== uid ||
    (metadata.mode & 0o777) !== 0o700 ||
    (await realpath(directory)) !== directory
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "private-directory");
}

/** @param {string} filename @param {number} uid */
async function admitExistingPrivateFile(filename, uid) {
  try {
    const metadata = await lstat(filename);
    if (
      !metadata.isFile() ||
      metadata.uid !== uid ||
      metadata.nlink !== 1 ||
      (metadata.mode & 0o777) !== 0o600
    )
      throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "private-file");
  } catch (failure) {
    if (!isFileFailure(failure, "ENOENT")) throw failure;
  }
}

/** @param {Readonly<{filename:string,contents:string,uid:number}>} request */
export async function writeAtomicPrivate(request) {
  await admitPrivateDirectory(path.dirname(request.filename), request.uid);
  await admitExistingPrivateFile(request.filename, request.uid);
  if (Buffer.byteLength(request.contents) > 1048576)
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "private-file-size");
  const temporary = `${request.filename}.${randomUUID()}.partial`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(request.contents, "utf8");
    await handle.sync();
    await handle.close();
    await admitExistingPrivateFile(request.filename, request.uid);
    await rename(temporary, request.filename);
    const directory = await open(
      path.dirname(request.filename),
      constants.O_RDONLY,
    );
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
      if (!isFileFailure(failure, "ENOENT")) throw failure;
    }
  }
}

/** @param {Readonly<{filename:string,uid:number,runId:string,bootId:string}>} request */
async function acquireRunLock(request) {
  await admitPrivateDirectory(path.dirname(request.filename), request.uid);
  let handle;
  try {
    handle = await open(request.filename, "wx", 0o600);
  } catch (failure) {
    if (isFileFailure(failure, "EEXIST"))
      throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "run-lock-held");
    throw failure;
  }
  const contents = JSON.stringify({
    version: 1,
    runId: request.runId,
    pid: process.pid,
    bootId: request.bootId,
  });
  const captured = await handle.stat();
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const assertOwner = async () => {
    const current = await lstat(request.filename);
    if (
      current.ino !== captured.ino ||
      current.dev !== captured.dev ||
      (await readPrivateFile(request.filename, {
        uid: request.uid,
        maximumBytes: 65536,
      })) !== contents
    )
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "run-lock-owner");
  };
  return Object.freeze({
    runId: request.runId,
    assertOwner,
    release: async () => {
      await assertOwner();
      await unlink(request.filename);
    },
  });
}

/** @param {ReleaseConfig} config @param {Readonly<{scope:'live'|'isolated',runId:string,deadline:number,root?:string,dockerEndpoint?:string,isolationId?:string,clock?:()=>number}>} options */
export async function createOperationContext(config, options) {
  if (options.scope !== "live" && options.scope !== "isolated")
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "context-scope");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      options.runId,
    ) ||
    !Number.isFinite(options.deadline) ||
    options.deadline <= Date.now()
  )
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "context-identity");
  const resourceRunId =
    options.scope === "isolated"
      ? (options.isolationId ?? options.runId)
      : options.runId;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      resourceRunId,
    )
  )
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "resource-run-identity");
  const uid = options.scope === "live" ? 0 : process.getuid?.();
  if (uid === undefined)
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "posix-ownership");
  if (
    options.scope === "isolated" &&
    (process.env["P08_OPERATIONS_ISOLATED"] !== "1" || !options.root)
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "isolated-guard");
  if (
    options.scope === "live" &&
    (options.root !== undefined ||
      options.dockerEndpoint !== undefined ||
      options.isolationId !== undefined ||
      options.clock !== undefined)
  )
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "live-root-override");
  const root = options.scope === "live" ? "/" : (options.root ?? "");
  if (options.scope === "isolated") {
    await admitPrivateDirectory(root, uid);
    if (
      path.dirname(root) !== (await realpath(tmpdir())) ||
      !path.basename(root).startsWith(`p08-ops-test-${resourceRunId}-`)
    )
      throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "isolated-root");
    if (
      [
        config.runtimeEnvFile,
        config.postgresEnvFile,
        config.backupDirectory,
        config.backupMountPoint,
      ].some((filename) => !filename.startsWith(`${root}/`))
    )
      throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "isolated-paths");
  }
  const paths =
    options.scope === "live"
      ? deriveReleasePaths(config)
      : Object.freeze({
          base: `${root}/deployment`,
          release: `${root}/deployment/releases/${config.releaseRevision}`,
          current: `${root}/deployment/current`,
          state: root,
          config: `${root}/release.json`,
          caddy: `${root}/caddy`,
          lock: `${root}/run.lock`,
          dockerConfig: `${root}/docker`,
          stateFile: `${root}/state.json`,
          authorityRebind: `${root}/authority-rebind.json`,
          session: `${root}/operator-session.json`,
          evidence: `${root}/operator-evidence.json`,
          packages: `${root}/releases`,
          runs: `${root}/runs`,
        });
  const stateDirectory = options.scope === "live" ? paths.state : root;
  const ownedPath = /** @param {string} filename */ (filename) => {
    if (
      !path.isAbsolute(filename) ||
      path.normalize(filename) !== filename ||
      !filename.startsWith(`${stateDirectory}/`)
    )
      throw new ReleaseFailure(
        "RELEASE_INPUT_INVALID",
        "private-path-containment",
      );
    return filename;
  };
  /** @type {Awaited<ReturnType<typeof acquireRunLock>>|null} */
  let heldLock = null;
  const files = Object.freeze({
    read: /** @param {string} filename */ (filename) =>
      readPrivateFile(ownedPath(filename), { uid, maximumBytes: 1048576 }),
    writeJson: /** @param {string} filename @param {unknown} record */ (
      filename,
      record,
    ) =>
      writeAtomicPrivate({
        filename: ownedPath(filename),
        contents: JSON.stringify(record),
        uid,
      }),
    assertLock: async () => {
      if (heldLock === null)
        throw new ReleaseFailure(
          "RELEASE_ADMISSION_MISSING",
          "run-lock-required",
        );
      await heldLock.assertOwner();
    },
    acquireLock: async () => {
      if (heldLock !== null)
        throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "run-lock-held");
      const bootId =
        options.scope === "isolated"
          ? `isolated-${options.runId}`
          : (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
      const lease = await acquireRunLock({
        filename: `${stateDirectory}/run.lock`,
        uid,
        runId: options.runId,
        bootId,
      });
      heldLock = lease;
      return Object.freeze({
        runId: lease.runId,
        release: async () => {
          await lease.release();
          heldLock = null;
        },
      });
    },
  });
  /** @type {Map<string,Readonly<{id:string,role:string,scope:'live'|'isolated',runId:string,imageId:string,running:boolean}>>} */
  const registry = new Map();
  const dockerEndpoint =
    options.scope === "live"
      ? "unix:///var/run/docker.sock"
      : (options.dockerEndpoint ?? "unix:///var/run/docker.sock");
  if (
    !/^unix:\/\/\//u.test(dockerEndpoint) ||
    /[\u0000-\u0020\u007f]/u.test(dockerEndpoint) ||
    path.normalize(dockerEndpoint.slice(7)) !== dockerEndpoint.slice(7)
  )
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "docker-endpoint");
  const environment = Object.freeze({
    PATH: "/usr/local/bin:/usr/bin:/bin",
    LANG: "C.UTF-8",
    DOCKER_HOST: dockerEndpoint,
    DOCKER_CONFIG: paths.dockerConfig,
    COMPOSE_DISABLE_ENV_FILE: "1",
  });
  return Object.freeze({
    config,
    runId: options.runId,
    deadline: options.deadline,
    scope: options.scope,
    resourceRunId,
    clock:
      options.scope === "isolated" ? (options.clock ?? Date.now) : Date.now,
    paths,
    files,
    registry,
    toolEnvironment: environment,
    projectName:
      options.scope === "live"
        ? config.projectName
        : `p08-ops-test-${resourceRunId}`,
    dockerEndpoint,
    command: /** @param {CommandRequest} request */ (request) =>
      runMetadataCommand(request, { environment, deadline: options.deadline }),
  });
}

/** @param {string|Buffer} contents */
export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

/** @param {OperationContext} context */
export async function observeDeployment(context) {
  if (
    context.scope === "live" &&
    (process.platform !== "linux" ||
      process.getuid?.() !== 0 ||
      process.versions.node.split(".")[0] !== "24")
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "target-capabilities",
    );
  const raw = await checkedCommand(context, {
    executable: "docker",
    argv: [
      "info",
      "--format",
      "{{json .ID}}\n{{json .OSType}}\n{{json .Architecture}}\n{{json .SecurityOptions}}\n{{json .DockerRootDir}}",
    ],
    stage: "docker-observation",
  });
  const lines = raw.trim().split("\n");
  if (lines.length !== 5)
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "docker-observation");
  const engine = JSON.parse(lines[0] ?? "null"),
    operatingSystem = JSON.parse(lines[1] ?? "null"),
    architecture = JSON.parse(lines[2] ?? "null"),
    security = JSON.parse(lines[3] ?? "null");
  if (
    typeof engine !== "string" ||
    operatingSystem !== "linux" ||
    typeof architecture !== "string" ||
    !Array.isArray(security) ||
    !security.every((entry) => typeof entry === "string") ||
    security.some((entry) => entry.includes("rootless"))
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "docker-capabilities",
    );
  const composeVersion = (
    await checkedCommand(context, {
      executable: "docker",
      argv: ["compose", "version", "--short"],
      stage: "compose-version",
    })
  )
    .trim()
    .replace(/^v/u, "");
  if (context.scope === "live") {
    const machineIdSha256 = sha256(await readFile("/etc/machine-id"));
    const initName = (await readFile("/proc/1/comm", "utf8")).trim();
    admitTarget(context.config, {
      platform: process.platform,
      uid: process.getuid?.() ?? -1,
      nodeMajor: Number(process.versions.node.split(".")[0]),
      composeVersion,
      machineIdSha256,
      dockerEngineId: engine,
      dockerEndpoint: context.dockerEndpoint,
      dockerOs: operatingSystem,
      rootless: false,
      systemd: initName === "systemd",
    });
  } else {
    if (engine !== context.config.expectedDockerEngineId)
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "target-identity");
    const version = /^(\d+)\.(\d+)/u.exec(composeVersion);
    if (
      !version ||
      !(
        Number(version[1]) > 2 ||
        (Number(version[1]) === 2 && Number(version[2]) >= 30)
      )
    )
      throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "compose-version");
  }
  await inspectOwnedNamespace(context);
  if (context.scope === "live") {
    const dockerRoot = JSON.parse(lines[4] ?? "null");
    if (
      typeof dockerRoot !== "string" ||
      !path.isAbsolute(dockerRoot) ||
      path.normalize(dockerRoot) !== dockerRoot
    )
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "docker-storage");
    await admitLiveFilesAndStorage(context, dockerRoot);
    const socket = await lstat("/var/run/docker.sock");
    if (!socket.isSocket() || socket.uid !== 0)
      throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "docker-socket");
    if ((await lookup(context.config.appDomain, { all: true })).length === 0)
      throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "domain-dns");
  }
  const filesystem = await statfs(context.paths.state, { bigint: true });
  if (filesystem.bavail <= 0n || filesystem.bsize <= 0n)
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "free-disk");
  return Object.freeze({
    engine,
    architecture,
    composeVersion,
    availableDiskBytes: (filesystem.bavail * filesystem.bsize).toString(),
  });
}

/** @param {OperationContext} context */
async function inspectOwnedNamespace(context) {
  const raw = await checkedCommand(context, {
    executable: "docker",
    argv: [
      "ps",
      "-a",
      "--no-trunc",
      "--filter",
      `name=^/${context.projectName}-`,
      "--format",
      "{{.ID}}",
    ],
    stage: "namespace-containers",
  });
  context.registry.clear();
  /** @type {Set<string>} */
  const roles = new Set();
  for (const id of raw.trim().split("\n").filter(Boolean)) {
    if (!/^[0-9a-f]{64}$/u.test(id))
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "container-id");
    const observation = (
      await checkedCommand(context, {
        executable: "docker",
        argv: [
          "inspect",
          "--format",
          "{{json .Config.Labels}}\n{{.Id}}\n{{.Image}}\n{{.State.Running}}\n{{json .Mounts}}\n{{json .HostConfig.PortBindings}}",
          id,
        ],
        stage: "container-labels",
      })
    )
      .trim()
      .split("\n");
    const metadata = JSON.parse(observation[0] ?? "null");
    const imageId = observation[2] ?? "";
    if (
      observation.length !== 6 ||
      observation[1] !== id ||
      !/^sha256:[0-9a-f]{64}$/u.test(imageId) ||
      !["true", "false"].includes(observation[3] ?? "")
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "container-observation",
      );
    if (
      typeof metadata !== "object" ||
      metadata === null ||
      Array.isArray(metadata) ||
      !Object.values(metadata).every((entry) => typeof entry === "string")
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "container-labels");
    const labels = /** @type {Record<string,string>} */ (metadata);
    const role = labels["io.oriental-shoes.role"] ?? "";
    if (!["api", "web", "postgres", "caddy"].includes(role) || roles.has(role))
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "container-role");
    assertResourceOwnership(
      { id, labels },
      {
        environmentId: context.config.environmentId,
        projectName: context.projectName,
        scope: context.scope,
        role,
        runId: context.resourceRunId,
      },
    );
    assertServicePorts(
      context.scope,
      role,
      parsePrivateJson(observation[5] ?? "null"),
    );
    if (role === "postgres")
      assertPostgresStorage(
        context.projectName,
        parsePrivateJson(observation[4] ?? "null"),
      );
    roles.add(role);
    context.registry.set(role, {
      id,
      role,
      scope: context.scope,
      runId: context.resourceRunId,
      imageId,
      running: observation[3] === "true",
    });
  }
  const volumeNames = (
    await checkedCommand(context, {
      executable: "docker",
      argv: ["volume", "ls", "--format", "{{.Name}}"],
      stage: "namespace-volumes",
    })
  )
    .trim()
    .split("\n");
  for (const [suffix, role] of [
    ["postgres_data", "postgres-data"],
    ["caddy_data", "caddy-data"],
    ["caddy_config", "caddy-config"],
  ]) {
    const name = `${context.projectName}_${suffix}`;
    if (!volumeNames.includes(name)) continue;
    const labels = JSON.parse(
      await checkedCommand(context, {
        executable: "docker",
        argv: ["volume", "inspect", "--format", "{{json .Labels}}", name],
        stage: "volume-labels",
      }),
    );
    if (
      typeof labels !== "object" ||
      labels === null ||
      Array.isArray(labels) ||
      !Object.values(labels).every((entry) => typeof entry === "string")
    )
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "volume-labels");
    assertResourceOwnership(
      { id: name, labels },
      {
        environmentId: context.config.environmentId,
        projectName: context.projectName,
        scope: context.scope,
        role: role ?? "",
        runId: context.resourceRunId,
      },
    );
  }
}

/** @param {OperationContext} context */
export async function sourceIdentity(context) {
  const git = /** @param {readonly string[]} argv */ (argv) =>
    checkedCommand(context, {
      executable: "git",
      argv: ["--no-optional-locks", "-C", context.paths.release, ...argv],
      stage: "reviewed-source",
    });
  const revision = (await git(["rev-parse", "HEAD"])).trim();
  if (
    revision !== context.config.releaseRevision ||
    (await git(["status", "--porcelain", "--untracked-files=all"])).length !==
      0 ||
    (await realpath(context.paths.release)) !== context.paths.release ||
    (await git(["rev-parse", "--show-toplevel"])).trim() !==
      context.paths.release
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "reviewed-source");
  const tracked = (await git(["ls-files", "-z"]))
    .split("\0")
    .filter(Boolean)
    .sort();
  const source = createHash("sha256");
  for (const filename of tracked) {
    if (
      path.isAbsolute(filename) ||
      path.normalize(filename) !== filename ||
      filename.startsWith("../")
    )
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "source-path");
    const absolute = path.join(context.paths.release, filename);
    if (!(await lstat(absolute)).isFile())
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "source-file");
    source.update(
      `${Buffer.byteLength(filename)}:${filename}:${sha256(await readFile(absolute))}\n`,
    );
  }
  const migrationRoot = path.join(
    context.paths.release,
    "packages/database/prisma/migrations",
  );
  const names = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  /** @type {{name:string,sha256:string}[]} */ const migrations = [];
  const tables = new Set(["_prisma_migrations"]);
  const tableInventoryByPrefix = [
    { completedMigrations: 0, tables: [...tables] },
  ];
  for (const name of names) {
    if (!/^\d{14}_[a-z0-9_]+$/u.test(name))
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "migration-name");
    const sql = await readFile(
      path.join(migrationRoot, name, "migration.sql"),
      "utf8",
    );
    if (/\bDROP\s+TABLE\b|\bALTER\s+TABLE[^;]+\bRENAME\s+TO\b/iu.test(sql))
      throw new ReleaseFailure(
        "RELEASE_CHECK_FAILED",
        "migration-inventory-review",
      );
    for (const match of sql.matchAll(
      /^CREATE TABLE "([A-Za-z_][A-Za-z0-9_]{0,62})"\s*\(/gmu,
    ))
      tables.add(match[1] ?? "");
    migrations.push({ name, sha256: sha256(sql) });
    tableInventoryByPrefix.push({
      completedMigrations: migrations.length,
      tables: [...tables].sort(),
    });
  }
  if (migrations.length === 0)
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "migration-inventory");
  return Object.freeze({
    revision,
    sourceSha256: source.digest("hex"),
    lockfileSha256: sha256(
      await readFile(path.join(context.paths.release, "pnpm-lock.yaml")),
    ),
    migrationSetHash: sha256(JSON.stringify(migrations)),
    migrations,
    tableInventoryByPrefix,
  });
}

/** @param {OperationContext} context @param {string} reference */
export async function inspectImage(context, reference) {
  const raw = await checkedCommand(context, {
    executable: "docker",
    argv: [
      "image",
      "inspect",
      "--format",
      "{{.Id}}\n{{.Architecture}}",
      reference,
    ],
    stage: "image-identity",
  });
  const [id, architecture] = raw.trim().split("\n");
  if (
    !id ||
    !/^sha256:[0-9a-f]{64}$/u.test(id) ||
    !architecture ||
    !/^[a-z0-9_]+$/u.test(architecture)
  )
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "image-identity");
  return Object.freeze({ id, architecture });
}

/** @param {unknown} input @returns {string} */
function canonicalJson(input) {
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
  if (typeof input === "object" && input !== null) {
    const record = /** @type {Record<string,unknown>} */ (input);
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(input);
  if (encoded === undefined)
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "caddy-observation");
  return encoded;
}

/** @param {OperationContext} context @param {Readonly<{id:string,imageId:string}>} captured */
async function assertCapturedCaddy(context, captured) {
  await context.files.assertLock();
  await observeDeployment(context);
  const current = context.registry.get("caddy");
  if (
    !current ||
    !current.running ||
    current.id !== captured.id ||
    current.imageId !== captured.imageId
  )
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "caddy-identity");
}

/** @param {OperationContext} context @param {Readonly<{id:string,imageId:string}>} captured @param {Readonly<{arguments:readonly string[],stage:string}>} request */
async function caddyCommand(context, captured, request) {
  await assertCapturedCaddy(context, captured);
  return checkedCommand(context, {
    executable: "docker",
    argv: ["exec", captured.id, ...request.arguments],
    stage: request.stage,
  });
}

/** @param {OperationContext} context @param {Readonly<{id:string,imageId:string}>} captured */
async function verifyActiveCaddy(context, captured) {
  const adapted = await caddyCommand(context, captured, {
    arguments: [
      "caddy",
      "adapt",
      "--config",
      "/etc/caddy/Caddyfile",
      "--adapter",
      "caddyfile",
    ],
    stage: "caddy-adapt",
  });
  const active = await caddyCommand(context, captured, {
    arguments: [
      "wget",
      "-q",
      "-O",
      "-",
      "-T",
      "10",
      "http://127.0.0.1:2019/config/",
    ],
    stage: "caddy-active-observation",
  });
  if (
    canonicalJson(parsePrivateJson(adapted)) !==
    canonicalJson(parsePrivateJson(active))
  )
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "caddy-active-mismatch",
    );
}

/** @param {OperationContext} context */
export async function observeCaddyMode(context) {
  await context.files.assertLock();
  await observeDeployment(context);
  const captured = context.registry.get("caddy");
  if (
    !captured?.running ||
    captured.imageId !==
      (await inspectImage(context, context.config.caddyImage)).id
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-mode-owner");
  const filename = `${context.paths.caddy}/mode.caddy`,
    metadata = await lstat(filename);
  if (
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    metadata.uid !== (context.scope === "live" ? 0 : process.getuid?.()) ||
    (metadata.mode & 0o777) !== 0o644 ||
    (await realpath(filename)) !== filename
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-mode-file");
  const content = await readFile(filename, "utf8");
  const modes = /** @type {const} */ (["normal", "maintenance", "acceptance"]);
  const mode = modes.find(
    (mode) => renderCaddyMode(context.config, mode) === content,
  );
  if (!mode)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "unknown-caddy-mode");
  await verifyActiveCaddy(context, captured);
  return mode;
}

/** @param {OperationContext} context @param {Readonly<{id:string,imageId:string}>} captured */
async function caddyHttpsEndpoint(context, captured) {
  let hostname = "127.0.0.1",
    port = 443;
  /** @type {string|undefined} */ let ca;
  if (context.scope === "isolated") {
    const binding = parsePrivateJson(
      await checkedCommand(context, {
        executable: "docker",
        argv: [
          "inspect",
          "--format",
          '{{json (index .NetworkSettings.Ports "443/tcp")}}',
          captured.id,
        ],
        stage: "caddy-isolated-port",
      }),
    );
    if (
      !Array.isArray(binding) ||
      binding.length !== 1 ||
      typeof binding[0] !== "object" ||
      binding[0] === null ||
      binding[0].HostIp !== "127.0.0.1" ||
      typeof binding[0].HostPort !== "string" ||
      !/^[1-9][0-9]{0,4}$/u.test(binding[0].HostPort)
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "caddy-isolated-port",
      );
    hostname = "127.0.0.1";
    port = Number(binding[0].HostPort);
    if (port > 65535)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "caddy-isolated-port",
      );
    ca = await caddyCommand(context, captured, {
      arguments: ["cat", "/data/caddy/pki/authorities/local/root.crt"],
      stage: "caddy-isolated-public-ca",
    });
  }
  return { hostname, port, ca };
}
/** @param {OperationContext} context @param {Readonly<{hostname:string,port:number,ca:string|undefined}>} endpoint @param {string} selectedPath */
async function httpsObservation(context, endpoint, selectedPath) {
  const timeout = Math.min(10000, context.deadline - Date.now());
  if (timeout <= 0)
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "caddy-http-response");
  return new Promise(
    /** @param {(observation:Readonly<{status:number,certificateSha256:string}>)=>void} resolve @param {(failure:unknown)=>void} reject */ (
      resolve,
      reject,
    ) => {
      const request = https.get(
        {
          hostname: endpoint.hostname,
          port: endpoint.port,
          servername: context.config.appDomain,
          path: selectedPath,
          headers: { Host: context.config.appDomain },
          ...(endpoint.ca === undefined ? {} : { ca: endpoint.ca }),
          agent: false,
          signal: AbortSignal.timeout(timeout),
        },
        (response) => {
          const fingerprint =
            response.socket instanceof TLSSocket
              ? response.socket.getPeerCertificate().fingerprint256
              : undefined;
          const certificateSha256 =
            typeof fingerprint === "string"
              ? fingerprint.replaceAll(":", "").toLowerCase()
              : "";
          const status = response.statusCode ?? 0;
          response.destroy();
          if (!/^[0-9a-f]{64}$/u.test(certificateSha256)) {
            reject(
              new ReleaseFailure("RELEASE_CHECK_FAILED", "caddy-certificate"),
            );
            return;
          }
          resolve(Object.freeze({ status, certificateSha256 }));
        },
      );
      request.on("error", () =>
        reject(
          new ReleaseFailure("RELEASE_CHECK_FAILED", "caddy-http-response"),
        ),
      );
    },
  );
}
/** @param {OperationContext} context @param {string} selectedPath @param {readonly number[]} allowedStatuses */
async function targetHttpsObservation(context, selectedPath, allowedStatuses) {
  await context.files.assertLock();
  await observeDeployment(context);
  const captured = context.registry.get("caddy");
  if (!captured?.running)
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "caddy-not-running");
  if (
    captured.imageId !==
    (await inspectImage(context, context.config.caddyImage)).id
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-image");
  await assertCapturedCaddy(context, captured);
  const local = await caddyHttpsEndpoint(context, captured);
  const served = await httpsObservation(context, local, selectedPath);
  const external = await httpsObservation(
    context,
    context.scope === "live"
      ? { hostname: context.config.appDomain, port: 443, ca: undefined }
      : local,
    selectedPath,
  );
  await assertCapturedCaddy(context, captured);
  if (served.certificateSha256 !== external.certificateSha256)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-public-binding");
  if (
    !allowedStatuses.includes(served.status) ||
    !allowedStatuses.includes(external.status)
  )
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "caddy-http-status");
  return external;
}
/** @param {OperationContext} context @param {number} expectedStatus */
export async function observeCaddyResponse(context, expectedStatus) {
  const observed = await targetHttpsObservation(context, "/", [expectedStatus]);
  return Object.freeze({ status: observed.status });
}
/** @param {OperationContext} context @param {'/auth/login'|'/api/v1/health/live'|'/api/v1/health/ready'} selectedPath @param {readonly number[]} allowedStatuses */
export async function observeTargetTls(context, selectedPath, allowedStatuses) {
  if (
    !["/auth/login", "/api/v1/health/live", "/api/v1/health/ready"].includes(
      selectedPath,
    ) ||
    allowedStatuses.length === 0 ||
    allowedStatuses.some((status) => status !== 200 && status !== 503)
  )
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "target-tls-observation");
  return targetHttpsObservation(context, selectedPath, allowedStatuses);
}

/** @param {Readonly<{directory:string,filename:string,runId:string,contents:string}>} request */
async function publishCaddyFile(request) {
  const temporary = `${request.filename}.${request.runId}.partial`;
  const handle = await open(temporary, "wx", 0o644);
  try {
    try {
      await handle.chmod(0o644);
      await handle.writeFile(request.contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, request.filename);
    const directory = await open(request.directory, constants.O_RDONLY);
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
      if (!isFileFailure(failure, "ENOENT")) throw failure;
    }
  }
}

/** @param {OperationContext} context @param {'normal'|'maintenance'|'acceptance'} mode */
export async function changeCaddyMode(context, mode) {
  await context.files.assertLock();
  await observeDeployment(context);
  const caddy = context.registry.get("caddy");
  if (!caddy || !caddy.running)
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "caddy-not-running");
  const expected = await inspectImage(context, context.config.caddyImage);
  if (caddy.imageId !== expected.id)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-image");
  const filename = `${context.paths.caddy}/mode.caddy`;
  const directory = await lstat(context.paths.caddy),
    file = await lstat(filename);
  const uid = context.scope === "live" ? 0 : process.getuid?.();
  if (
    uid === undefined ||
    !directory.isDirectory() ||
    directory.uid !== uid ||
    (directory.mode & 0o777) !== 0o755 ||
    (await realpath(context.paths.caddy)) !== context.paths.caddy ||
    !file.isFile() ||
    file.uid !== uid ||
    (file.mode & 0o777) !== 0o644 ||
    file.nlink !== 1
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "caddy-files");
  const before = await readFile(filename, "utf8"),
    candidate = renderCaddyMode(context.config, mode);
  const publish = /** @param {string} contents */ (contents) =>
    publishCaddyFile({
      directory: context.paths.caddy,
      filename,
      runId: context.runId,
      contents,
    });
  const validateArguments = [
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ];
  const reloadArguments = [
    "caddy",
    "reload",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ];
  try {
    await assertCapturedCaddy(context, caddy);
    await publish(candidate);
    await caddyCommand(context, caddy, {
      arguments: validateArguments,
      stage: "caddy-validate",
    });
    await caddyCommand(context, caddy, {
      arguments: reloadArguments,
      stage: "caddy-reload",
    });
    await verifyActiveCaddy(context, caddy);
    return Object.freeze({ mode, sha256: sha256(candidate) });
  } catch {
    try {
      await publish(before);
      await caddyCommand(context, caddy, {
        arguments: validateArguments,
        stage: "caddy-prior-validate",
      });
      await caddyCommand(context, caddy, {
        arguments: reloadArguments,
        stage: "caddy-prior-reload",
      });
      await verifyActiveCaddy(context, caddy);
    } catch {
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "caddy-prior-mode");
    }
    throw new ReleaseFailure("RELEASE_CHECK_FAILED", "caddy-transition");
  }
}

/** @param {OperationContext} context @param {string} target */
export async function mountedFilesystem(context, target) {
  const stdout = await checkedCommand(context, {
    executable: "findmnt",
    argv: [
      "--json",
      "--target",
      target,
      "--output",
      "TARGET,SOURCE,FSTYPE,MAJ:MIN",
    ],
    stage: "mounted-storage",
  });
  const parsed = JSON.parse(stdout);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray(parsed.filesystems) ||
    parsed.filesystems.length !== 1
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "mounted-storage");
  const mount = parsed.filesystems[0];
  if (
    typeof mount !== "object" ||
    mount === null ||
    !["target", "source", "fstype", "maj:min"].every(
      (key) => typeof mount[key] === "string" && mount[key].length > 0,
    )
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "mounted-storage");
  return {
    target: String(mount.target),
    source: String(mount.source),
    filesystemType: String(mount.fstype),
    device: String(mount["maj:min"]),
  };
}

/** @typedef {Awaited<ReturnType<typeof mountedFilesystem>>} MountedFilesystem */
/** @param {ReleaseConfig} config @param {MountedFilesystem} mount @param {MountedFilesystem} directory @param {MountedFilesystem} live */
export function assertStorageMounts(config, mount, directory, live) {
  if (
    mount.target !== config.backupMountPoint ||
    mount.source !== config.backupMountSource
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "backup-mount");
  if (
    directory.target !== mount.target ||
    directory.source !== mount.source ||
    directory.device !== mount.device ||
    directory.filesystemType !== mount.filesystemType
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "backup-directory-mount",
    );
  if (live.device === mount.device || live.source === mount.source)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "backup-independence");
}

/** @param {OperationContext} context @param {string} dockerRoot */
export async function admitLiveFilesAndStorage(context, dockerRoot) {
  await admitPrivateDirectory(context.paths.state, 0);
  await admitPrivateDirectory(context.paths.dockerConfig, 0);
  validatePrivateLocations(context.config, context.paths.release);
  const [runtime, postgres] = await Promise.all([
    readPrivateFile(context.config.runtimeEnvFile, {
      uid: 0,
      maximumBytes: 1048576,
    }),
    readPrivateFile(context.config.postgresEnvFile, {
      uid: 0,
      maximumBytes: 1048576,
    }),
  ]);
  validateReleaseEnvironment(
    context.config,
    parseRawEnvironment(runtime),
    parseRawEnvironment(postgres),
  );
  const current = parseReleaseConfig(
    parsePrivateJson(
      await readPrivateFile(context.paths.config, {
        uid: 0,
        maximumBytes: 1048576,
      }),
    ),
  );
  if (JSON.stringify(current) !== JSON.stringify(context.config))
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "private-config-changed",
    );
  await admitPrivateDirectory(context.config.backupDirectory, 0);
  if (
    (await realpath(context.config.backupMountPoint)) !==
    context.config.backupMountPoint
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "backup-mount-path");
  const storage = parsePrivateJson(
    await readPrivateFile(
      `${context.config.backupMountPoint}/.storage-identity`,
      { uid: 0, maximumBytes: 65536 },
    ),
  );
  if (
    typeof storage !== "object" ||
    storage === null ||
    Array.isArray(storage) ||
    Object.keys(storage).sort().join(",") !==
      "approvalReference,identity,mountSource,version" ||
    !("version" in storage) ||
    storage.version !== 1 ||
    !("identity" in storage) ||
    storage.identity !== context.config.backupStorageIdentity ||
    !("mountSource" in storage) ||
    storage.mountSource !== context.config.backupMountSource ||
    !("approvalReference" in storage) ||
    storage.approvalReference !== context.config.backupStorageApprovalReference
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "storage-identity");
  const mount = await mountedFilesystem(
    context,
    context.config.backupMountPoint,
  );
  if (
    mount.target !== context.config.backupMountPoint ||
    mount.source !== context.config.backupMountSource
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "backup-mount");
  const names = (
    await checkedCommand(context, {
      executable: "docker",
      argv: ["volume", "ls", "--format", "{{.Name}}"],
      stage: "postgres-volume",
    })
  )
    .trim()
    .split("\n");
  const volume = `${context.projectName}_postgres_data`;
  const livePath = names.includes(volume)
    ? (
        await checkedCommand(context, {
          executable: "docker",
          argv: ["volume", "inspect", "--format", "{{.Mountpoint}}", volume],
          stage: "postgres-storage",
        })
      ).trim()
    : dockerRoot;
  if (!path.isAbsolute(livePath) || path.normalize(livePath) !== livePath)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "postgres-storage");
  const live = await mountedFilesystem(context, livePath);
  const directory = await mountedFilesystem(
    context,
    context.config.backupDirectory,
  );
  assertStorageMounts(context.config, mount, directory, live);
}

/** @param {OperationContext} context @param {number} deadline */
export async function assertCleanupTarget(context, deadline) {
  const engine = await runMetadataCommand(
    {
      executable: "docker",
      argv: ["info", "--format", "{{.ID}}"],
      stage: "cleanup-target",
    },
    { environment: context.toolEnvironment, deadline },
  );
  if (
    engine.exitCode !== 0 ||
    engine.stdout.trim() !== context.config.expectedDockerEngineId ||
    (context.scope === "live" &&
      sha256(await readFile("/etc/machine-id")) !==
        context.config.expectedMachineIdSha256)
  )
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "cleanup-target");
}

/** @param {OperationContext} context @param {Readonly<{argv:readonly string[],stage:string}>} request */
export function openDockerStream(context, request) {
  const remaining = context.deadline - Date.now();
  if (remaining <= 0)
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", request.stage);
  const child = spawn("docker", request.argv, {
    env: context.toolEnvironment,
    stdio: ["pipe", "pipe", "ignore"],
  });
  // Pipeline owners observe stream failures; completion still checks the child.
  // Handle EPIPE even when a metadata-only caller immediately ends stdin.
  child.stdin.on("error", () => {});
  /** @type {Promise<void>} */
  const completion = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), remaining);
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new ReleaseFailure("RELEASE_CHECK_FAILED", request.stage));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new ReleaseFailure(
            code === null ? "RELEASE_STATE_UNCERTAIN" : "RELEASE_CHECK_FAILED",
            request.stage,
          ),
        );
    });
  });
  return Object.freeze({
    stdin: child.stdin,
    stdout: child.stdout,
    completion,
    cancel: () => {
      child.stdin.destroy();
      child.stdout.destroy();
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    },
  });
}

/** @param {OperationContext} context @param {Readonly<{expectedConfigSha256:string,authority:Readonly<{userId:string,email:string,accessVersion:number}>}>} request */
export async function replaceAdministratorBinding(context, request) {
  await context.files.assertLock();
  const uid = context.scope === "live" ? 0 : process.getuid?.();
  if (
    uid === undefined ||
    !/^[0-9a-f]{64}$/u.test(request.expectedConfigSha256)
  )
    throw new ReleaseFailure(
      "RELEASE_INPUT_INVALID",
      "administrator-config-input",
    );
  const next = bindAdministratorConfig(context.config, request.authority),
    contents = JSON.stringify(next),
    afterSha256 = sha256(contents);
  const directory = path.dirname(context.paths.config),
    temporary = `${context.paths.config}.${context.runId}.binding.partial`;
  await admitPrivateDirectory(directory, uid);
  const before = await readPrivateFile(context.paths.config, {
    uid,
    maximumBytes: 1048576,
  });
  if (
    sha256(before) !== request.expectedConfigSha256 ||
    JSON.stringify(parseReleaseConfig(parsePrivateJson(before))) !==
      JSON.stringify(context.config)
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-config-changed",
    );
  const candidate = await open(temporary, "wx", 0o600);
  try {
    await candidate.writeFile(contents);
    await candidate.sync();
    await candidate.close();
    await context.files.assertLock();
    if (
      sha256(
        await readPrivateFile(context.paths.config, {
          uid,
          maximumBytes: 1048576,
        }),
      ) !== request.expectedConfigSha256
    )
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "administrator-config-changed",
      );
    await rename(temporary, context.paths.config);
    const parent = await open(directory, constants.O_RDONLY);
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    return next;
  } catch (failure) {
    if (
      failure instanceof ReleaseFailure &&
      failure.stage === "administrator-config-changed"
    )
      throw failure;
    let observed;
    try {
      observed = sha256(
        await readPrivateFile(context.paths.config, {
          uid,
          maximumBytes: 1048576,
        }),
      );
    } catch {
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "administrator-config-observation",
      );
    }
    throw new ReleaseFailure(
      observed === request.expectedConfigSha256
        ? "RELEASE_CHECK_FAILED"
        : "RELEASE_STATE_UNCERTAIN",
      observed === afterSha256
        ? "administrator-config-published-unconfirmed"
        : observed === request.expectedConfigSha256
          ? "administrator-config-unpublished"
          : "administrator-config-drift",
    );
  } finally {
    await candidate.close();
    try {
      await unlink(temporary);
    } catch (failure) {
      if (!isFileFailure(failure, "ENOENT"))
        throw new ReleaseFailure(
          "RELEASE_STATE_UNCERTAIN",
          "administrator-config-partial-cleanup",
        );
    }
  }
}

/** @typedef {Readonly<{operation:'validate-caddy'|'start-postgres'|'start-applications'|'start-caddy'|'migration-status'|'migration-deploy'|'database-access'}>|Readonly<{operation:'admin-preview'|'admin-apply',administrator:Readonly<{userId:string,email:string,beforeVersion:number}>}>} ComposeRequest */
/** @param {OperationContext} context @param {string} name */
async function operationToolId(context, name) {
  const result = await runMetadataCommand(
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
      stage: "operation-tool-reconcile",
    },
    { environment: context.toolEnvironment, deadline: Date.now() + 30000 },
  );
  if (result.exitCode !== 0)
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "operation-tool-reconcile",
    );
  const id = result.stdout.trim();
  if (id === "") return null;
  if (!/^[0-9a-f]{64}$/u.test(id))
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "operation-tool-identity",
    );
  return id;
}
/** @param {OperationContext} context @param {string} id @param {string} expectedImage */
async function cleanupOperationTool(context, id, expectedImage) {
  const deadline = Date.now() + 30000;
  await assertCleanupTarget(context, deadline);
  const result = await runMetadataCommand(
    {
      executable: "docker",
      argv: ["inspect", "--format", "{{json .Config.Labels}}\n{{.Image}}", id],
      stage: "operation-tool-owner",
    },
    { environment: context.toolEnvironment, deadline },
  );
  const lines = result.stdout.trim().split("\n"),
    labels = parsePrivateJson(lines[0] ?? "null");
  if (
    result.exitCode !== 0 ||
    lines.length !== 2 ||
    lines[1] !== expectedImage ||
    typeof labels !== "object" ||
    labels === null ||
    Array.isArray(labels) ||
    !Object.values(labels).every((value) => typeof value === "string")
  )
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "operation-tool-owner");
  if (
    !("io.oriental-shoes.run" in labels) ||
    labels["io.oriental-shoes.run"] !== context.runId
  )
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "operation-tool-run-owner",
    );
  assertResourceOwnership(
    { id, labels: /** @type {Record<string,string>} */ (labels) },
    {
      environmentId: context.config.environmentId,
      projectName: context.projectName,
      scope: context.scope,
      role: "operation-tool",
      runId: context.runId,
    },
  );
  const removed = await runMetadataCommand(
    {
      executable: "docker",
      argv: ["rm", "-f", "-v", id],
      stage: "operation-tool-cleanup",
    },
    { environment: context.toolEnvironment, deadline },
  );
  if (removed.exitCode !== 0)
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "operation-tool-cleanup",
    );
}
/** @param {OperationContext} context @param {import('./operations-records.mjs').PackageRecord} packageRecord @param {ComposeRequest} request @returns {Promise<Readonly<{exitCode:number,stdout:string}>>} */
export async function composeCommand(context, packageRecord, request) {
  if (request.operation !== "admin-preview") await context.files.assertLock();
  await observeDeployment(context);
  if (
    packageRecord.scope !== context.scope ||
    packageRecord.environmentId !== context.config.environmentId ||
    packageRecord.projectName !== context.projectName ||
    packageRecord.revision !== context.config.releaseRevision ||
    (await inspectImage(context, packageRecord.applicationImageId)).id !==
      packageRecord.applicationImageId
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "compose-package");
  const prefix = [
    "compose",
    "--project-name",
    context.projectName,
    "--project-directory",
    context.paths.release,
    "--file",
    `${context.paths.release}/deploy/compose.production.yaml`,
  ];
  if (context.scope === "isolated") {
    const override = `${context.paths.state}/compose.isolated.yaml`;
    await readPrivateFile(override, {
      uid: process.getuid?.() ?? -1,
      maximumBytes: 1048576,
    });
    prefix.push("--file", override);
  }
  const publicEnvironment = {
    ENVIRONMENT_ID: context.config.environmentId,
    POSTGRES_IMAGE: context.config.postgresImage,
    CADDY_IMAGE: context.config.caddyImage,
    APPLICATION_IMAGE: packageRecord.applicationImageId,
    RUNTIME_ENV_FILE: context.config.runtimeEnvFile,
    POSTGRES_ENV_FILE: context.config.postgresEnvFile,
    APP_DOMAIN: context.config.appDomain,
    CADDY_CONFIG_DIRECTORY: context.paths.caddy,
  };
  /** @type {string[]} */ let argv;
  /** @type {string|null} */ let toolName = null;
  let expectedImage = packageRecord.applicationImageId;
  if (request.operation === "start-postgres")
    argv = ["up", "-d", "--wait", "--wait-timeout", "120", "postgres"];
  else if (request.operation === "start-applications")
    argv = [
      "up",
      "-d",
      "--no-deps",
      "--wait",
      "--wait-timeout",
      "120",
      "api",
      "web",
    ];
  else if (request.operation === "start-caddy")
    argv = ["up", "-d", "--no-deps", "caddy"];
  else {
    toolName = `${context.projectName}-tool-${context.runId}-${request.operation}`;
    if ((await operationToolId(context, toolName)) !== null)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "existing-operation-tool",
      );
    const tool = [
      "run",
      "--rm",
      "--no-deps",
      "--name",
      toolName,
      "--label",
      `io.oriental-shoes.environment=${context.config.environmentId}`,
      "--label",
      `io.oriental-shoes.scope=${context.scope}`,
      "--label",
      `io.oriental-shoes.run=${context.runId}`,
      "--label",
      "io.oriental-shoes.role=operation-tool",
    ];
    if (request.operation === "validate-caddy") {
      expectedImage = (await inspectImage(context, context.config.caddyImage))
        .id;
      if (expectedImage !== packageRecord.bases[2]?.id)
        throw new ReleaseFailure(
          "RELEASE_TARGET_MISMATCH",
          "compose-caddy-image",
        );
      argv = [
        ...tool,
        "caddy",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
        "--adapter",
        "caddyfile",
      ];
    } else {
      const pnpm = ["pnpm", "--config.verify-deps-before-run=false"];
      const apiTool = [...tool, "--workdir", "/workspace/apps/api", "api"];
      if (request.operation === "database-access") {
        const program =
          "import {createDatabaseClient} from '@template/database';const database=createDatabaseClient(process.env.DATABASE_URL);try{const rows=await database.$queryRaw`SELECT current_user::text AS role,current_database()::text AS database`;if(rows.length!==1||rows[0].role!==" +
          JSON.stringify(context.config.applicationRole) +
          "||rows[0].database!==" +
          JSON.stringify(context.config.databaseName) +
          ")process.exitCode=1;else console.log('APPLICATION_DATABASE_ACCESS_VERIFIED');}finally{await database.$disconnect();}";
        argv = [...apiTool, "node", "--input-type=module", "--eval", program];
      } else if (request.operation === "migration-status")
        argv = [
          ...apiTool,
          ...pnpm,
          "--filter",
          "@template/database",
          "exec",
          "prisma",
          "migrate",
          "status",
        ];
      else if (request.operation === "migration-deploy")
        argv = [
          ...apiTool,
          ...pnpm,
          "--filter",
          "@template/database",
          "db:migrate:deploy",
        ];
      else if (
        request.operation === "admin-preview" ||
        request.operation === "admin-apply"
      ) {
        const administrator = request.administrator;
        if (
          administrator.userId !== context.config.initialAdministrator.userId ||
          administrator.email !==
            context.config.initialAdministrator.expectedEmail ||
          administrator.beforeVersion !==
            context.config.initialAdministrator.expectedAccessVersion
        )
          throw new ReleaseFailure(
            "RELEASE_TARGET_MISMATCH",
            "compose-administrator",
          );
        argv = [
          ...apiTool,
          ...pnpm,
          "--filter",
          "@template/api",
          "admin:provision",
          "--user-id",
          administrator.userId,
          "--expected-email",
          administrator.email,
          "--expected-access-version",
          String(administrator.beforeVersion),
          "--operator-reference",
          context.config.operatorReference,
        ];
        if (request.operation === "admin-apply")
          argv.push("--apply", "--allow-production");
      } else
        throw new ReleaseFailure("RELEASE_INPUT_INVALID", "compose-operation");
    }
  }
  try {
    return await context.command({
      executable: "docker",
      argv: [...prefix, ...argv],
      stage: `operation-${request.operation}`,
      publicEnvironment,
      timeoutMs: Math.max(1, context.deadline - Date.now()),
    });
  } finally {
    if (toolName !== null) {
      const id = await operationToolId(context, toolName);
      if (id !== null) await cleanupOperationTool(context, id, expectedImage);
    }
  }
}

/** @param {string} projectName @param {unknown} mounts */
export function assertPostgresStorage(projectName, mounts) {
  if (!Array.isArray(mounts) || mounts.length !== 1)
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "postgres-storage-topology",
    );
  const selected = mounts[0];
  if (
    typeof selected !== "object" ||
    selected === null ||
    selected.Type !== "volume" ||
    selected.Name !== `${projectName}_postgres_data` ||
    selected.Destination !== "/var/lib/postgresql" ||
    selected.RW !== true ||
    typeof selected.Source !== "string" ||
    !path.posix.isAbsolute(selected.Source) ||
    path.posix.normalize(selected.Source) !== selected.Source
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "postgres-storage-topology",
    );
}

/** @param {OperationContext} context @param {Readonly<{database:'application'|'postgres',sql:string,stage:string,readOnly?:boolean}>} request */
export async function queryDatabase(context, request) {
  if (request.readOnly !== true) await context.files.assertLock();
  await observeDeployment(context);
  const postgres = context.registry.get("postgres");
  if (
    !postgres?.running ||
    postgres.imageId !==
      (await inspectImage(context, context.config.postgresImage)).id
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "database-command-owner",
    );
  if (request.database !== "application" && request.database !== "postgres")
    throw new ReleaseFailure(
      "RELEASE_INPUT_INVALID",
      "database-command-target",
    );
  return checkedCommand(context, {
    executable: "docker",
    argv: [
      "exec",
      "-i",
      "--env",
      `PGOPTIONS=-c TimeZone=UTC -c DateStyle=ISO,YMD -c extra_float_digits=3 -c statement_timeout=120000${request.readOnly === true ? " -c default_transaction_read_only=on" : ""}`,
      postgres.id,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      `--username=${context.config.bootstrapRole}`,
      `--dbname=${request.database === "postgres" ? "postgres" : context.config.databaseName}`,
    ],
    input: request.sql,
    stage: request.stage,
  });
}

/** @param {'live'|'isolated'} scope @param {string} role @param {unknown} bindings */
export function assertServicePorts(scope, role, bindings) {
  const ports = bindings === null ? {} : bindings;
  if (typeof ports !== "object" || Array.isArray(ports))
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "service-port-topology",
    );
  if (role !== "caddy") {
    if (Object.keys(ports).length !== 0)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "private-service-published",
      );
    return;
  }
  if (Object.keys(ports).sort().join(",") !== "443/tcp,443/udp,80/tcp")
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "caddy-port-topology");
  for (const [containerPort, entries] of Object.entries(ports)) {
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 2)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "caddy-port-topology",
      );
    for (const entry of entries) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof entry.HostPort !== "string" ||
        typeof entry.HostIp !== "string"
      )
        throw new ReleaseFailure(
          "RELEASE_TARGET_MISMATCH",
          "caddy-port-topology",
        );
      if (
        scope === "live"
          ? entry.HostPort !== containerPort.split("/")[0] ||
            !["", "0.0.0.0", "::"].includes(entry.HostIp)
          : entry.HostIp !== "127.0.0.1" ||
            !(
              entry.HostPort === "" ||
              (/^[1-9][0-9]{0,4}$/u.test(entry.HostPort) &&
                Number(entry.HostPort) <= 65535)
            )
      )
        throw new ReleaseFailure(
          "RELEASE_TARGET_MISMATCH",
          "caddy-port-topology",
        );
    }
  }
}
