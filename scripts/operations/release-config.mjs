import path from "node:path";
import { isIP } from "node:net";

/** @typedef {Readonly<{userId:string|null,expectedEmail:string,expectedAccessVersion:number|null}>} Administrator */
/** @typedef {Readonly<{version:1,environmentId:string,projectName:string,expectedMachineIdSha256:string,expectedDockerEngineId:string,appDomain:string,acceptanceCidrs:readonly string[],releaseRevision:string,nodeImage:string,postgresImage:string,caddyImage:string,runtimeEnvFile:string,postgresEnvFile:string,databaseName:string,applicationRole:string,bootstrapRole:string,operatorReference:string,acceptanceInbox:string,initialAdministrator:Administrator,backupDirectory:string,backupMountPoint:string,backupStorageIdentity:string,backupMountSource:string,backupStorageApprovalReference:string,scheduledBackupAuthorizationReference:string}>} ReleaseConfig */
/** @typedef {'inspect'|'package'|'backup'|'prepare'|'admin-preview'|'admin-apply'|'restart'|'recover-replacement'|'open-traffic'|'install-backup-timer'} ReleaseAction */
/** @typedef {Readonly<{action:ReleaseAction,mode:'preview'|'observe'|'apply',configFile:string,confirmEnvironment:string|null,authorizationReference:string|null,scheduled:boolean,confirmUser:string|null,confirmRestore:string|null,kind:'daily'|'predeploy'|null,backupId:string|null}>} ReleaseArguments */
/** @typedef {'RELEASE_INPUT_INVALID'|'RELEASE_ADMISSION_MISSING'|'RELEASE_TARGET_MISMATCH'|'RELEASE_CHECK_FAILED'|'RELEASE_STATE_UNCERTAIN'} FailureCode */

const exitCodes = Object.freeze({
  RELEASE_INPUT_INVALID: 2,
  RELEASE_ADMISSION_MISSING: 3,
  RELEASE_TARGET_MISMATCH: 4,
  RELEASE_CHECK_FAILED: 5,
  RELEASE_STATE_UNCERTAIN: 6,
});
export class ReleaseFailure extends Error {
  /** @param {FailureCode} code @param {string} stage */
  constructor(code, stage) {
    super(code);
    this.name = "ReleaseFailure";
    this.code = code;
    this.stage = stage;
    this.exitCode = exitCodes[code];
  }
}

/** @param {boolean} condition @param {string} stage @returns {asserts condition} */
function requireInput(condition, stage) {
  if (!condition) throw new ReleaseFailure("RELEASE_INPUT_INVALID", stage);
}

/** @param {unknown} input @param {readonly string[]} keys @param {string} stage @returns {Record<string,unknown>} */
function strictRecord(input, keys, stage) {
  requireInput(
    typeof input === "object" && input !== null && !Array.isArray(input),
    stage,
  );
  const record = /** @type {Record<string,unknown>} */ (input);
  requireInput(
    Object.keys(record).length === keys.length &&
      keys.every((key) => Object.hasOwn(record, key)),
    stage,
  );
  return record;
}

/** @param {unknown} input @param {string} stage @param {number} [limit] */
function safeText(input, stage, limit = 4096) {
  requireInput(
    typeof input === "string" &&
      input.length > 0 &&
      input.length <= limit &&
      !/[\u0000-\u001f\u007f]/u.test(input),
    stage,
  );
  return input;
}

/** @param {unknown} input @param {string} stage */
function reference(input, stage) {
  const text = safeText(input, stage, 128);
  requireInput(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(text), stage);
  return text;
}

/** @param {unknown} input @param {string} stage */
function absolutePath(input, stage) {
  const filename = safeText(input, stage);
  requireInput(
    path.posix.isAbsolute(filename) &&
      path.posix.normalize(filename) === filename &&
      filename !== "/" &&
      !filename.endsWith("/"),
    stage,
  );
  return filename;
}

/** @param {unknown} input @param {string} stage */
function email(input, stage) {
  const address = safeText(input, stage, 320);
  requireInput(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(address), stage);
  return address;
}

/** @param {unknown} input @param {string} stage */
function uuid(input, stage) {
  const identifier = safeText(input, stage, 36);
  requireInput(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      identifier,
    ),
    stage,
  );
  return identifier;
}

/** @param {unknown} input @param {string} stage */
function hexHash(input, stage) {
  const digest = safeText(input, stage, 64);
  requireInput(/^[0-9a-f]{64}$/u.test(digest), stage);
  return digest;
}

/** @param {unknown} input */
function cidr(input) {
  const network = safeText(input, "acceptanceCidrs", 64);
  const members = network.split("/");
  const address = members[0] ?? "";
  const bits = members[1] ?? "";
  const family = isIP(address);
  requireInput(
    members.length === 2 &&
      family !== 0 &&
      /^[1-9][0-9]*$/u.test(bits) &&
      Number(bits) <= (family === 4 ? 32 : 128),
    "acceptanceCidrs",
  );
  return network;
}

/** Reject duplicate keys before JSON.parse can erase their history.
 * @param {string} text @returns {unknown} */
export function parsePrivateJson(text) {
  requireInput(Buffer.byteLength(text) <= 1048576, "json-size");
  /** @type {Set<string>[]} */ const objects = [];
  let index = 0;
  let depth = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '"') {
      const start = index++;
      while (index < text.length && text[index] !== '"') {
        if (text[index] === "\\") index++;
        index++;
      }
      index++;
      const token = text.slice(start, index);
      let next = index;
      while (/\s/u.test(text[next] ?? "") && next < text.length) next++;
      if (text[next] === ":") {
        let key;
        try {
          key = JSON.parse(token);
        } catch {
          throw new ReleaseFailure("RELEASE_INPUT_INVALID", "json");
        }
        const object = objects.at(-1);
        requireInput(
          typeof key === "string" && object !== undefined && !object.has(key),
          "json-duplicate",
        );
        object.add(key);
      }
      continue;
    }
    if (character === "{" || character === "[") {
      depth++;
      requireInput(depth <= 32, "json-depth");
      if (character === "{") objects.push(new Set());
    }
    if (character === "}" || character === "]") {
      depth--;
      if (character === "}") objects.pop();
    }
    index++;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ReleaseFailure("RELEASE_INPUT_INVALID", "json");
  }
}

/** @param {unknown} input @returns {ReleaseConfig} */
export function parseReleaseConfig(input) {
  const record = strictRecord(
    input,
    [
      "version",
      "environmentId",
      "projectName",
      "expectedMachineIdSha256",
      "expectedDockerEngineId",
      "appDomain",
      "acceptanceCidrs",
      "releaseRevision",
      "nodeImage",
      "postgresImage",
      "caddyImage",
      "runtimeEnvFile",
      "postgresEnvFile",
      "databaseName",
      "applicationRole",
      "bootstrapRole",
      "operatorReference",
      "acceptanceInbox",
      "initialAdministrator",
      "backupDirectory",
      "backupMountPoint",
      "backupStorageIdentity",
      "backupMountSource",
      "backupStorageApprovalReference",
      "scheduledBackupAuthorizationReference",
    ],
    "config",
  );
  requireInput(record["version"] === 1, "version");
  const environmentId = safeText(record["environmentId"], "environmentId", 40);
  requireInput(
    /^[a-z][a-z0-9-]{0,39}$/u.test(environmentId) &&
      !environmentId.startsWith("p08-ops-test-"),
    "environmentId",
  );
  const projectName = safeText(record["projectName"], "projectName");
  requireInput(
    projectName === `oriental-shoes-${environmentId}`,
    "projectName",
  );
  const appDomain = safeText(record["appDomain"], "appDomain", 253);
  requireInput(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
      appDomain,
    ) &&
      !appDomain.endsWith(".localhost") &&
      !appDomain.endsWith(".local"),
    "appDomain",
  );
  const ranges = record["acceptanceCidrs"];
  requireInput(
    Array.isArray(ranges) && ranges.length > 0 && ranges.length <= 128,
    "acceptanceCidrs",
  );
  const acceptanceCidrs = Object.freeze(ranges.map(cidr));
  requireInput(
    new Set(acceptanceCidrs).size === acceptanceCidrs.length,
    "acceptanceCidrs",
  );
  const releaseRevision = safeText(
    record["releaseRevision"],
    "releaseRevision",
    40,
  );
  requireInput(/^[0-9a-f]{40}$/u.test(releaseRevision), "releaseRevision");
  const nodeImage = pinnedImage(record["nodeImage"], "node:24-bookworm");
  const postgresImage = pinnedImage(record["postgresImage"], "postgres:18.4");
  const caddyImage = pinnedImage(record["caddyImage"], "caddy:2");
  const runtimeEnvFile = absolutePath(
    record["runtimeEnvFile"],
    "runtimeEnvFile",
  );
  const postgresEnvFile = absolutePath(
    record["postgresEnvFile"],
    "postgresEnvFile",
  );
  requireInput(runtimeEnvFile !== postgresEnvFile, "private-files-distinct");
  const databaseName = databaseIdentifier(
    record["databaseName"],
    "databaseName",
  );
  const applicationRole = databaseIdentifier(
    record["applicationRole"],
    "applicationRole",
  );
  const bootstrapRole = databaseIdentifier(
    record["bootstrapRole"],
    "bootstrapRole",
  );
  requireInput(applicationRole !== bootstrapRole, "roles-distinct");
  const administrator = strictRecord(
    record["initialAdministrator"],
    ["userId", "expectedEmail", "expectedAccessVersion"],
    "initialAdministrator",
  );
  const userId =
    administrator["userId"] === null
      ? null
      : uuid(administrator["userId"], "administrator-id");
  const version = administrator["expectedAccessVersion"];
  requireInput(
    (userId === null && version === null) ||
      (userId !== null &&
        typeof version === "number" &&
        Number.isInteger(version) &&
        version >= 0 &&
        version <= 2147483647),
    "administrator-version",
  );
  const backupDirectory = absolutePath(
    record["backupDirectory"],
    "backupDirectory",
  );
  const backupMountPoint = absolutePath(
    record["backupMountPoint"],
    "backupMountPoint",
  );
  requireInput(
    backupDirectory.startsWith(`${backupMountPoint}/`),
    "backup-containment",
  );
  return Object.freeze({
    version: 1,
    environmentId,
    projectName,
    expectedMachineIdSha256: hexHash(
      record["expectedMachineIdSha256"],
      "machine",
    ),
    expectedDockerEngineId: reference(
      record["expectedDockerEngineId"],
      "engine",
    ),
    appDomain,
    acceptanceCidrs,
    releaseRevision,
    nodeImage,
    postgresImage,
    caddyImage,
    runtimeEnvFile,
    postgresEnvFile,
    databaseName,
    applicationRole,
    bootstrapRole,
    operatorReference: reference(
      record["operatorReference"],
      "operatorReference",
    ),
    acceptanceInbox: email(record["acceptanceInbox"], "acceptanceInbox"),
    initialAdministrator: Object.freeze({
      userId,
      expectedEmail: email(
        administrator["expectedEmail"],
        "administrator-email",
      ),
      expectedAccessVersion: /** @type {number|null} */ (version),
    }),
    backupDirectory,
    backupMountPoint,
    backupStorageIdentity: reference(
      record["backupStorageIdentity"],
      "storageIdentity",
    ),
    backupMountSource: safeText(record["backupMountSource"], "mountSource"),
    backupStorageApprovalReference: reference(
      record["backupStorageApprovalReference"],
      "storageApproval",
    ),
    scheduledBackupAuthorizationReference: reference(
      record["scheduledBackupAuthorizationReference"],
      "scheduledAuthorization",
    ),
  });
}

/** @param {unknown} input @param {string} image */
function pinnedImage(input, image) {
  const candidate = safeText(input, "image");
  requireInput(
    candidate.startsWith(`${image}@sha256:`) &&
      /^[0-9a-f]{64}$/u.test(candidate.slice(`${image}@sha256:`.length)),
    "image",
  );
  return candidate;
}

/** @param {unknown} input @param {string} stage */
function databaseIdentifier(input, stage) {
  const identifier = safeText(input, stage, 63);
  requireInput(
    /^[a-z][a-z0-9_]{0,62}$/u.test(identifier) &&
      !identifier.startsWith("pg_") &&
      !["postgres", "template0", "template1", "public"].includes(identifier),
    stage,
  );
  return identifier;
}

const environmentKeys = new Set(
  "NODE_ENV APP_NAME API_HOST API_PORT API_PREFIX CORS_ORIGINS DATABASE_URL LOG_LEVEL TRUST_PROXY BODY_LIMIT API_RATE_LIMIT_WINDOW_MS API_RATE_LIMIT_MAX REQUEST_TIMEOUT_MS HEADERS_TIMEOUT_MS KEEP_ALIVE_TIMEOUT_MS SHUTDOWN_TIMEOUT_MS POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB AUTH_JWT_SECRET AUTH_REFRESH_JWT_SECRET AUTH_VERIFICATION_JWT_SECRET AUTH_RESET_JWT_SECRET AUTH_JWT_ISSUER AUTH_JWT_AUDIENCE AUTH_JWT_CLOCK_TOLERANCE_SECONDS AUTH_ACCESS_TOKEN_TTL_SECONDS AUTH_REFRESH_FAMILY_TTL_SECONDS AUTH_REFRESH_REMEMBERED_TTL_SECONDS AUTH_VERIFY_TOKEN_TTL_SECONDS AUTH_RESET_TOKEN_TTL_SECONDS AUTH_VERIFY_RESEND_COOLDOWN_SECONDS AUTH_ARGON2_MEMORY_KIB AUTH_ARGON2_TIME_COST AUTH_ARGON2_PARALLELISM AUTH_COOKIE_SAME_SITE AUTH_LIMIT_REGISTER_PER_HOUR AUTH_LIMIT_VERIFY_PER_15_MIN AUTH_LIMIT_VERIFY_TOKEN_MAX_ATTEMPTS AUTH_LIMIT_RESEND_PER_HOUR_SOURCE AUTH_LIMIT_RESEND_PER_HOUR_ACCOUNT AUTH_LIMIT_LOGIN_PER_15_MIN AUTH_LIMIT_LOGIN_PER_15_MIN_ACCOUNT AUTH_LIMIT_REFRESH_PER_15_MIN AUTH_LIMIT_FORGOT_PER_HOUR_SOURCE AUTH_LIMIT_FORGOT_PER_HOUR_ACCOUNT AUTH_LIMIT_RESET_PER_15_MIN AUTH_LIMIT_RESET_TOKEN_MAX_ATTEMPTS AUTH_LIMIT_PASSWORD_CHANGE_PER_15_MIN AUTH_LIMIT_LOGOUT_PER_15_MIN AUTH_LIMIT_LOGOUT_ALL_PER_15_MIN EMAIL_PROVIDER WEB_APP_URL MAIL_FROM_NAME MAIL_FROM_ADDRESS MAIL_REPLY_TO SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD SMTP_ALLOW_SELF_SIGNED_TLS SMTP_CONNECTION_TIMEOUT_MS SMTP_GREETING_TIMEOUT_MS SMTP_SOCKET_TIMEOUT_MS SMTP_TLS_MIN_VERSION ORDER_BUSINESS_TIME_ZONE".split(
    " ",
  ),
);

/** @param {string} text @returns {Readonly<Record<string,string>>} */
export function parseRawEnvironment(text) {
  requireInput(Buffer.byteLength(text) <= 1048576, "environment-size");
  /** @type {Record<string,string>} */ const entries = Object.create(null);
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    const literal = line.slice(separator + 1);
    requireInput(
      separator > 0 &&
        environmentKeys.has(key) &&
        !Object.hasOwn(entries, key) &&
        !/[\u0000-\u001f\u007f]/u.test(literal),
      "environment-key-or-line",
    );
    entries[key] = literal;
  }
  return Object.freeze(entries);
}

/** @param {ReleaseConfig} config @param {Readonly<Record<string,string>>} runtimeEnv @param {Readonly<Record<string,string>>} postgresEnv */
export function validateReleaseEnvironment(config, runtimeEnv, postgresEnv) {
  const bootstrapKeys = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"];
  requireInput(
    Object.keys(postgresEnv).length === 3 &&
      bootstrapKeys.every((key) => Object.hasOwn(postgresEnv, key)),
    "postgres-environment",
  );
  requireInput(
    !Object.keys(runtimeEnv).some((key) => bootstrapKeys.includes(key)),
    "runtime-environment",
  );
  const fixed = {
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
  };
  for (const [key, expected] of Object.entries(fixed))
    requireInput(runtimeEnv[key] === expected, `environment-${key}`);
  requireInput(
    ["TLSv1.2", "TLSv1.3"].includes(runtimeEnv["SMTP_TLS_MIN_VERSION"] ?? ""),
    "environment-SMTP_TLS_MIN_VERSION",
  );
  for (const key of [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "MAIL_FROM_NAME",
  ])
    requireInput(
      (runtimeEnv[key]?.trim().length ?? 0) > 0,
      `environment-${key}`,
    );
  email(runtimeEnv["MAIL_FROM_ADDRESS"], "environment-MAIL_FROM_ADDRESS");
  email(runtimeEnv["MAIL_REPLY_TO"], "environment-MAIL_REPLY_TO");
  const secrets = [
    "AUTH_JWT_SECRET",
    "AUTH_REFRESH_JWT_SECRET",
    "AUTH_VERIFICATION_JWT_SECRET",
    "AUTH_RESET_JWT_SECRET",
  ].map((key) => {
    const secret = safeText(runtimeEnv[key], `environment-${key}`);
    requireInput(
      secret.trim().length > 0 &&
        secret.length >= 32 &&
        !/^(?:replace-with-|test-only-|changeme)/iu.test(secret),
      `environment-${key}`,
    );
    return secret;
  });
  requireInput(new Set(secrets).size === 4, "auth-secrets-distinct");
  requireInput(
    postgresEnv["POSTGRES_USER"] === config.bootstrapRole &&
      postgresEnv["POSTGRES_DB"] === "postgres",
    "postgres-identity",
  );
  const bootstrapPassword = safeText(
    postgresEnv["POSTGRES_PASSWORD"],
    "postgres-password",
  );
  const applicationPassword = databasePassword(
    config,
    runtimeEnv["DATABASE_URL"],
  );
  requireInput(applicationPassword !== bootstrapPassword, "passwords-distinct");
  return Object.freeze({
    runtimeEnv,
    postgresEnv,
    applicationPassword,
    bootstrapPassword,
  });
}

/** @param {ReleaseConfig} config @param {unknown} input */
function databasePassword(config, input) {
  const raw = safeText(input, "environment-DATABASE_URL");
  let connection;
  try {
    connection = new URL(raw);
  } catch {
    throw new ReleaseFailure(
      "RELEASE_INPUT_INVALID",
      "environment-DATABASE_URL",
    );
  }
  let password;
  try {
    password = decodeURIComponent(connection.password);
  } catch {
    throw new ReleaseFailure(
      "RELEASE_INPUT_INVALID",
      "environment-DATABASE_URL",
    );
  }
  safeText(password, "database-password");
  const encoded = encodeURIComponent(password).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  requireInput(
    raw ===
      `postgresql://${config.applicationRole}:${encoded}@postgres:5432/${config.databaseName}?schema=public`,
    "environment-DATABASE_URL",
  );
  return password;
}

/** @param {ReleaseConfig} config */
export function deriveReleasePaths(config) {
  const base = `/srv/oriental-shoes/${config.environmentId}`;
  const state = `/var/lib/oriental-shoes/${config.environmentId}`;
  return Object.freeze({
    base,
    release: `${base}/releases/${config.releaseRevision}`,
    current: `${base}/current`,
    state,
    config: `/etc/oriental-shoes/${config.environmentId}/release.json`,
    caddy: `${state}/caddy`,
    lock: `${state}/run.lock`,
    dockerConfig: `${state}/docker`,
    stateFile: `${state}/state.json`,
    authorityRebind: `${state}/authority-rebind.json`,
    session: `${state}/operator-session.json`,
    evidence: `${state}/operator-evidence.json`,
    packages: `${state}/releases`,
    runs: `${state}/runs`,
  });
}

/** @param {Readonly<{labels:Readonly<Record<string,string>>,id:string}>} observation @param {Readonly<{environmentId:string,projectName:string,scope:'live'|'isolated',role:string,runId?:string}>} expected */
export function assertResourceOwnership(observation, expected) {
  const labels = observation.labels;
  const matching =
    observation.id.length > 0 &&
    labels["io.oriental-shoes.environment"] === expected.environmentId &&
    labels["io.oriental-shoes.scope"] === expected.scope &&
    labels["com.docker.compose.project"] === expected.projectName &&
    labels["io.oriental-shoes.role"] === expected.role &&
    (expected.scope === "live" ||
      labels["io.oriental-shoes.run"] === expected.runId);
  if (!matching)
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "resource-ownership");
}

/** @param {ReleaseConfig} config @param {Readonly<{platform:string,uid:number,nodeMajor:number,composeVersion:string,machineIdSha256:string,dockerEngineId:string,dockerEndpoint:string,dockerOs:string,rootless:boolean,systemd:boolean}>} observations */
export function admitTarget(config, observations) {
  if (
    observations.machineIdSha256 !== config.expectedMachineIdSha256 ||
    observations.dockerEngineId !== config.expectedDockerEngineId
  )
    throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "target-identity");
  const version = /^(\d+)\.(\d+)(?:\.\d+)?$/u.exec(observations.composeVersion);
  const major = Number(version?.[1]);
  const minor = Number(version?.[2]);
  if (
    observations.platform !== "linux" ||
    observations.uid !== 0 ||
    observations.nodeMajor !== 24 ||
    !version ||
    !(major > 2 || (major === 2 && minor >= 30)) ||
    !/^unix:\/\/\//u.test(observations.dockerEndpoint) ||
    observations.dockerOs !== "linux" ||
    observations.rootless ||
    !observations.systemd
  )
    throw new ReleaseFailure(
      "RELEASE_ADMISSION_MISSING",
      "target-capabilities",
    );
  const socket = observations.dockerEndpoint.slice("unix://".length);
  if (
    !path.posix.isAbsolute(socket) ||
    path.posix.normalize(socket) !== socket ||
    /[\u0000-\u0020\u007f]/u.test(socket)
  )
    throw new ReleaseFailure("RELEASE_ADMISSION_MISSING", "docker-endpoint");
  return Object.freeze({
    dockerEndpoint: observations.dockerEndpoint,
    childEnvironment: Object.freeze({
      PATH: "/usr/local/bin:/usr/bin:/bin",
      LANG: "C.UTF-8",
      DOCKER_HOST: observations.dockerEndpoint,
      DOCKER_CONFIG: deriveReleasePaths(config).dockerConfig,
      COMPOSE_DISABLE_ENV_FILE: "1",
    }),
  });
}

const actions = /** @type {const} */ ([
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
]);
/** @param {readonly string[]} argv @returns {ReleaseArguments} */
export function parseReleaseArguments(argv) {
  const action = argv[0];
  requireInput(
    actions.some((candidate) => candidate === action),
    "action",
  );
  const switches = new Set(["--observe", "--apply", "--scheduled"]);
  const argumentsWithValue = new Set([
    "--config",
    "--confirm-environment",
    "--authorization-reference",
    "--confirm-user",
    "--confirm-restore",
    "--kind",
    "--backup-id",
  ]);
  /** @type {Record<string,string|true>} */ const options = Object.create(null);
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index] ?? "";
    requireInput(
      !Object.hasOwn(options, flag) &&
        (switches.has(flag) || argumentsWithValue.has(flag)),
      "flag",
    );
    if (switches.has(flag)) options[flag] = true;
    else {
      const argument = argv[++index];
      requireInput(
        typeof argument === "string" && !argument.startsWith("--"),
        "flag-value",
      );
      options[flag] = safeText(argument, "flag-value");
    }
  }
  const mode = options["--apply"]
    ? "apply"
    : options["--observe"]
      ? "observe"
      : "preview";
  requireInput(!(options["--apply"] && options["--observe"]), "mode");
  requireInput(
    mode !== "observe" || action === "inspect" || action === "admin-preview",
    "observe-action",
  );
  const scheduled = options["--scheduled"] === true;
  const kind = options["--kind"] ?? null;
  requireInput(
    (action === "backup" && (kind === "daily" || kind === "predeploy")) ||
      (action !== "backup" && kind === null),
    "backup-kind",
  );
  requireInput(
    !scheduled ||
      (mode === "apply" &&
        action === "backup" &&
        kind === "daily" &&
        !options["--authorization-reference"]),
    "scheduled",
  );
  requireInput(
    !options["--confirm-user"] || action === "admin-apply",
    "confirm-user-action",
  );
  requireInput(
    !options["--confirm-restore"] || action === "recover-replacement",
    "confirm-restore-action",
  );
  requireInput(
    (action === "recover-replacement") === Boolean(options["--backup-id"]),
    "backup-id-action",
  );
  requireInput(
    mode === "apply" ||
      ![
        "--confirm-environment",
        "--authorization-reference",
        "--confirm-user",
        "--confirm-restore",
      ].some((key) => Object.hasOwn(options, key)),
    "preview-confirmation",
  );
  if (mode === "apply") {
    requireInput(
      typeof options["--confirm-environment"] === "string" &&
        (scheduled || typeof options["--authorization-reference"] === "string"),
      "apply-authorization",
    );
    requireInput(
      action !== "admin-apply" || typeof options["--confirm-user"] === "string",
      "apply-user",
    );
    requireInput(
      action !== "recover-replacement" ||
        typeof options["--confirm-restore"] === "string",
      "apply-restore",
    );
  }
  return Object.freeze({
    action: /** @type {ReleaseAction} */ (action),
    mode,
    configFile: absolutePath(options["--config"], "config-path"),
    confirmEnvironment: options["--confirm-environment"]
      ? safeText(options["--confirm-environment"], "confirm-environment")
      : null,
    authorizationReference: options["--authorization-reference"]
      ? reference(options["--authorization-reference"], "authorization")
      : null,
    scheduled,
    confirmUser: options["--confirm-user"]
      ? uuid(options["--confirm-user"], "confirm-user")
      : null,
    confirmRestore: options["--confirm-restore"]
      ? safeText(options["--confirm-restore"], "confirm-restore")
      : null,
    kind: /** @type {'daily'|'predeploy'|null} */ (kind),
    backupId: options["--backup-id"]
      ? uuid(options["--backup-id"], "backup-id")
      : null,
  });
}

/** @param {ReleaseConfig} config @param {'normal'|'maintenance'|'acceptance'} mode */
export function renderCaddyMode(config, mode) {
  const normal =
    "handle /api/* {\n reverse_proxy api:4000\n}\nhandle {\n reverse_proxy web:3000\n}\n";
  const maintenance =
    'header Retry-After "60"\nrespond "الخدمة غير متاحة مؤقتاً. يرجى المحاولة لاحقاً." 503\n';
  if (mode === "normal") return normal;
  if (mode === "maintenance") return maintenance;
  if (mode === "acceptance")
    return `@operator remote_ip ${config.acceptanceCidrs.join(" ")}\nhandle @operator {\n${normal}}\nhandle {\n${maintenance}}\n`;
  throw new ReleaseFailure("RELEASE_INPUT_INVALID", "caddy-mode");
}

/** @param {ReleaseConfig} config @param {Readonly<{userId:string,email:string,accessVersion:number}>} authority @returns {ReleaseConfig} */
export function bindAdministratorConfig(config, authority) {
  if (
    config.initialAdministrator.userId === null ||
    authority.userId !== config.initialAdministrator.userId ||
    authority.email !== config.initialAdministrator.expectedEmail
  )
    throw new ReleaseFailure(
      "RELEASE_TARGET_MISMATCH",
      "administrator-binding-identity",
    );
  return parseReleaseConfig({
    ...config,
    initialAdministrator: {
      ...config.initialAdministrator,
      userId: authority.userId,
      expectedAccessVersion: authority.accessVersion,
    },
  });
}
