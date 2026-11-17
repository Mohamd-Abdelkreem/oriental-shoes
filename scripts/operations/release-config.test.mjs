import assert from "node:assert/strict";
import test from "node:test";
import {
  admitTarget,
  assertResourceOwnership,
  deriveReleasePaths,
  parsePrivateJson,
  parseRawEnvironment,
  parseReleaseArguments,
  parseReleaseConfig,
  renderCaddyMode,
  validateReleaseEnvironment,
} from "./release-config.mjs";

function configuration() {
  return {
    version: 1,
    environmentId: "acceptance",
    projectName: "oriental-shoes-acceptance",
    expectedMachineIdSha256: "a".repeat(64),
    expectedDockerEngineId: "engine-acceptance",
    appDomain: "acceptance.example.com",
    acceptanceCidrs: ["192.0.2.0/24", "2001:db8::/32"],
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
  };
}

function environment(config) {
  const literalPassword = 'unique-$"\\= password';
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
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "test-mailer",
    SMTP_PASSWORD: literalPassword,
    MAIL_FROM_NAME: "Test Operations",
    MAIL_FROM_ADDRESS: "mail@example.com",
    MAIL_REPLY_TO: "operator@example.com",
    AUTH_JWT_SECRET: "first-auth-".repeat(5),
    AUTH_REFRESH_JWT_SECRET: "second-auth-".repeat(5),
    AUTH_VERIFICATION_JWT_SECRET: "third-auth-".repeat(5),
    AUTH_RESET_JWT_SECRET: "fourth-auth-".repeat(5),
    DATABASE_URL: `postgresql://${config.applicationRole}:${encodeURIComponent(literalPassword)}@postgres:5432/${config.databaseName}?schema=public`,
  };
  return {
    runtime,
    postgres: {
      POSTGRES_USER: config.bootstrapRole,
      POSTGRES_PASSWORD: "separate-bootstrap",
      POSTGRES_DB: "postgres",
    },
    literalPassword,
  };
}

test("strict config rejects unknown, malformed, unsafe and inconsistent runtime inputs", async (context) => {
  const mutations = [
    [
      "unknown",
      (config) => {
        config.unknown = true;
      },
    ],
    [
      "missing",
      (config) => {
        delete config.operatorReference;
      },
    ],
    [
      "control",
      (config) => {
        config.operatorReference = "operator\nsecret";
      },
    ],
    [
      "namespace",
      (config) => {
        config.projectName = "other";
      },
    ],
    [
      "reserved-isolation",
      (config) => {
        config.environmentId = "p08-ops-test-forged";
      },
    ],
    [
      "domain",
      (config) => {
        config.appDomain = "localhost:3000";
      },
    ],
    [
      "all-ipv4",
      (config) => {
        config.acceptanceCidrs = ["0.0.0.0/0"];
      },
    ],
    [
      "all-ipv6",
      (config) => {
        config.acceptanceCidrs = ["::/0"];
      },
    ],
    [
      "cidr",
      (config) => {
        config.acceptanceCidrs = ["192.0.2.1/33"];
      },
    ],
    [
      "revision",
      (config) => {
        config.releaseRevision = "main";
      },
    ],
    [
      "unpinned",
      (config) => {
        config.nodeImage = "node:24-bookworm";
      },
    ],
    [
      "wrong-image",
      (config) => {
        config.postgresImage = `postgres:17@sha256:${"d".repeat(64)}`;
      },
    ],
    [
      "relative",
      (config) => {
        config.runtimeEnvFile = "api.env";
      },
    ],
    [
      "traversal",
      (config) => {
        config.runtimeEnvFile = "/etc/../api.env";
      },
    ],
    [
      "same-files",
      (config) => {
        config.runtimeEnvFile = config.postgresEnvFile;
      },
    ],
    [
      "same-role",
      (config) => {
        config.applicationRole = config.bootstrapRole;
      },
    ],
    [
      "reserved-db",
      (config) => {
        config.databaseName = "postgres";
      },
    ],
    [
      "version-binding",
      (config) => {
        config.initialAdministrator.expectedAccessVersion = 1;
      },
    ],
    [
      "mount-escape",
      (config) => {
        config.backupDirectory = "/mnt/offhost-neighbor";
      },
    ],
  ];
  for (const [scenario, mutate] of mutations)
    await context.test(scenario, () => {
      const candidate = configuration();
      mutate(candidate);
      assert.throws(() => parseReleaseConfig(candidate), {
        code: "RELEASE_INPUT_INVALID",
      });
    });
  const config = parseReleaseConfig(configuration());
  assert.equal(config.initialAdministrator.userId, null);
  assert.equal(
    deriveReleasePaths(config).config,
    "/etc/oriental-shoes/acceptance/release.json",
  );
  assert.ok(Object.isFrozen(config.acceptanceCidrs));
});

test("private JSON detects escaped duplicate keys and bounded malformed payloads", () => {
  for (const payload of [
    '{"version":1,"version":2}',
    '{"a":{"role":1,"r\\u006fle":2}}',
    '{"a":[{"x":1,"x":2}]}',
    '{"x":',
    "[".repeat(33) + "]".repeat(33),
    " ".repeat(1048577),
  ])
    assert.throws(() => parsePrivateJson(payload), {
      code: "RELEASE_INPUT_INVALID",
    });
  assert.deepEqual(
    parsePrivateJson('{"a":[{"x":1},{"x":2}],"b":"{\\\"x\\\":3}"}'),
    { a: [{ x: 1 }, { x: 2 }], b: '{"x":3}' },
  );
});

test("raw environment preserves literal quotes, dollars, slashes and equals without expansion", () => {
  const literal = '"$DOLLAR\\backslash=tail"';
  assert.equal(
    parseRawEnvironment(`SMTP_PASSWORD=${literal}\n# comment\n`)[
      "SMTP_PASSWORD"
    ],
    literal,
  );
  for (const payload of [
    "SMTP_USER=a\nSMTP_USER=b",
    "export SMTP_USER=a",
    "COMPOSE_FILE=foreign",
    "SMTP_PASSWORD=a\r",
    "SMTP_PASSWORD=\u0000",
    "SMTP_PASSWORD=a\nunkeyed",
  ])
    assert.throws(() => parseRawEnvironment(payload), {
      code: "RELEASE_INPUT_INVALID",
    });
});

test("production environment enforces dedicated credentials, exact topology, calendar and secure SMTP", async (context) => {
  const config = parseReleaseConfig(configuration());
  const accepted = environment(config);
  const privateEnvironment = validateReleaseEnvironment(
    config,
    accepted.runtime,
    accepted.postgres,
  );
  assert.equal(
    privateEnvironment.applicationPassword,
    accepted.literalPassword,
  );
  const whitespaceSecrets = {
    ...accepted.runtime,
    AUTH_JWT_SECRET: " ".repeat(32),
    AUTH_REFRESH_JWT_SECRET: " ".repeat(33),
    AUTH_VERIFICATION_JWT_SECRET: " ".repeat(34),
    AUTH_RESET_JWT_SECRET: " ".repeat(35),
  };
  assert.throws(
    () =>
      validateReleaseEnvironment(config, whitespaceSecrets, accepted.postgres),
    { code: "RELEASE_INPUT_INVALID" },
  );
  const mutations = [
    ["NODE_ENV", "test"],
    ["TRUST_PROXY", "true"],
    ["ORDER_BUSINESS_TIME_ZONE", "UTC"],
    ["SMTP_PORT", "465"],
    ["SMTP_SECURE", "true"],
    ["SMTP_ALLOW_SELF_SIGNED_TLS", "true"],
    ["SMTP_TLS_MIN_VERSION", "TLSv1"],
    ["SHUTDOWN_TIMEOUT_MS", "20000"],
    ["CORS_ORIGINS", "*"],
    ["AUTH_JWT_SECRET", "replace-with-".repeat(5)],
    ["AUTH_JWT_SECRET", accepted.runtime.AUTH_REFRESH_JWT_SECRET],
    [
      "DATABASE_URL",
      accepted.runtime.DATABASE_URL.replace("@postgres:", "@localhost:"),
    ],
    [
      "DATABASE_URL",
      accepted.runtime.DATABASE_URL.replace(
        config.applicationRole,
        config.bootstrapRole,
      ),
    ],
    ["POSTGRES_PASSWORD", "forbidden-in-api"],
  ];
  for (const [index, [key, replacement]] of mutations.entries())
    await context.test(`${key}:${index}`, () => {
      assert.throws(
        () =>
          validateReleaseEnvironment(
            config,
            { ...accepted.runtime, [key]: replacement },
            accepted.postgres,
          ),
        { code: "RELEASE_INPUT_INVALID" },
      );
    });
  assert.throws(
    () =>
      validateReleaseEnvironment(config, accepted.runtime, {
        ...accepted.postgres,
        EXTRA: "no",
      }),
    { code: "RELEASE_INPUT_INVALID" },
  );
});

test("arguments reject conflicting modes, misplaced flags and absent action authorization", () => {
  const config = ["--config", "/etc/oriental-shoes/acceptance/release.json"];
  for (const argv of [
    ["reset"],
    ["inspect", "--apply", "--observe"],
    ["inspect", "--kind", "daily"],
    ["backup"],
    ["backup", "--kind", "daily", "--scheduled"],
    ["package", "--apply"],
    ["package", "--config", "/x", "--config", "/y"],
    ["prepare", "--observe"],
    ["inspect", "--confirm-user", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["recover-replacement"],
    ["inspect", "--force"],
  ])
    assert.throws(() => parseReleaseArguments([...argv, ...config]), {
      code: "RELEASE_INPUT_INVALID",
    });
  const scheduled = parseReleaseArguments([
    "backup",
    ...config,
    "--kind",
    "daily",
    "--apply",
    "--confirm-environment",
    "acceptance",
    "--scheduled",
  ]);
  assert.equal(scheduled.mode, "apply");
  assert.equal(scheduled.authorizationReference, null);
  assert.throws(
    () =>
      parseReleaseArguments([
        "package",
        ...config,
        "--apply",
        "--confirm-environment",
        "acceptance",
        "--authorization-reference",
        "",
      ]),
    { code: "RELEASE_INPUT_INVALID" },
  );
  assert.throws(
    () => parseReleaseArguments(["inspect", ...config, "--confirm-user", ""]),
    { code: "RELEASE_INPUT_INVALID" },
  );
});

test("target admission rejects identity drift and unsupported host capabilities", async (context) => {
  const config = parseReleaseConfig(configuration());
  const actual = {
    platform: "linux",
    uid: 0,
    nodeMajor: 24,
    composeVersion: "5.5.0",
    machineIdSha256: config.expectedMachineIdSha256,
    dockerEngineId: config.expectedDockerEngineId,
    dockerEndpoint: "unix:///var/run/docker.sock",
    dockerOs: "linux",
    rootless: false,
    systemd: true,
  };
  assert.equal(
    admitTarget(config, actual).dockerEndpoint,
    actual.dockerEndpoint,
  );
  const childEnvironment = admitTarget(config, actual).childEnvironment;
  assert.deepEqual(Object.keys(childEnvironment).sort(), [
    "COMPOSE_DISABLE_ENV_FILE",
    "DOCKER_CONFIG",
    "DOCKER_HOST",
    "LANG",
    "PATH",
  ]);
  assert.equal(childEnvironment.COMPOSE_DISABLE_ENV_FILE, "1");
  assert.equal(childEnvironment.DOCKER_HOST, "unix:///var/run/docker.sock");
  for (const [key, replacement, code] of [
    ["machineIdSha256", "bad", "RELEASE_TARGET_MISMATCH"],
    ["dockerEngineId", "other", "RELEASE_TARGET_MISMATCH"],
    ["platform", "darwin", "RELEASE_ADMISSION_MISSING"],
    ["uid", 501, "RELEASE_ADMISSION_MISSING"],
    ["nodeMajor", 22, "RELEASE_ADMISSION_MISSING"],
    ["composeVersion", "2.29.9", "RELEASE_ADMISSION_MISSING"],
    ["dockerEndpoint", "tcp://remote:2375", "RELEASE_ADMISSION_MISSING"],
    ["rootless", true, "RELEASE_ADMISSION_MISSING"],
    ["systemd", false, "RELEASE_ADMISSION_MISSING"],
  ])
    await context.test(key, () =>
      assert.throws(
        () => admitTarget(config, { ...actual, [key]: replacement }),
        { code },
      ),
    );
});

test("resource ownership requires exact project, environment, role and captured isolated run", () => {
  const expected = {
    environmentId: "acceptance",
    projectName: "oriental-shoes-acceptance",
    scope: "isolated",
    role: "postgres",
    runId: "run-owned",
  };
  const labels = {
    "io.oriental-shoes.environment": expected.environmentId,
    "io.oriental-shoes.scope": "isolated",
    "com.docker.compose.project": expected.projectName,
    "io.oriental-shoes.role": "postgres",
    "io.oriental-shoes.run": "run-owned",
  };
  assert.doesNotThrow(() =>
    assertResourceOwnership({ id: "captured-id", labels }, expected),
  );
  for (const key of Object.keys(labels))
    assert.throws(
      () =>
        assertResourceOwnership(
          { id: "captured-id", labels: { ...labels, [key]: "foreign" } },
          expected,
        ),
      { code: "RELEASE_TARGET_MISMATCH" },
    );
});

test("Caddy modes preserve API prefix and use immediate-peer allowlisting only", () => {
  const config = parseReleaseConfig(configuration());
  assert.match(renderCaddyMode(config, "normal"), /handle \/api\/\*/u);
  assert.doesNotMatch(
    renderCaddyMode(config, "normal"),
    /handle_path|strip_prefix/u,
  );
  assert.doesNotMatch(renderCaddyMode(config, "maintenance"), /reverse_proxy/u);
  assert.match(renderCaddyMode(config, "maintenance"), /503/u);
  assert.match(
    renderCaddyMode(config, "acceptance"),
    /@operator remote_ip 192\.0\.2\.0\/24 2001:db8::\/32/u,
  );
  assert.doesNotMatch(
    renderCaddyMode(config, "acceptance"),
    /header_regexp|X-Forwarded/u,
  );
});
