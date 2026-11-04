import { spawn, fork, type ChildProcess } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { FullConfig } from "@playwright/test";

import { E2E_BROWSER_PROJECTS } from "../playwright.config";
import {
  E2E_RUNTIME_FILE_ENVIRONMENT_KEY,
  parseE2eRuntime,
  type E2eRuntimeIdentity,
} from "./runtime";

/**
 * The global setup of the isolated browser harness.
 *
 * It owns every process and every file of one run: the private runtime
 * directory, the disposable API child with its own PostgreSQL container, and
 * the disposable Next child. Nothing is reused from the developer machine, and
 * a partial startup is cleaned up before the failure is reported.
 */

const CHILD_MAILBOX_ENVIRONMENT_KEY = "P01_E2E_MAILBOX_DIRECTORY";
const CHILD_PROJECTS_ENVIRONMENT_KEY = "P01_E2E_PROJECTS";

const API_READY_TIMEOUT_MS = 240_000;
const READINESS_TIMEOUT_MS = 240_000;
const READINESS_POLL_INTERVAL_MS = 250;
const READINESS_REQUEST_TIMEOUT_MS = 2_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;

type ApiChildReadyMessage = Readonly<{
  type: "ready";
  apiOrigin: string;
  admin: E2eRuntimeIdentity;
  legacyStaffByProject: Record<string, E2eRuntimeIdentity>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isApiChildReadyMessage = (
  message: unknown,
): message is ApiChildReadyMessage =>
  isRecord(message) && message["type"] === "ready";

const isApiChildFatalMessage = (message: unknown): boolean =>
  isRecord(message) && message["type"] === "fatal";

const delay = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
};

/**
 * Reserves one disposable loopback port. The reservation is released before
 * the owned server binds it, so a conflict fails this startup instead of
 * terminating an unrelated listener.
 */
const reserveLoopbackPort = async (): Promise<number> => {
  const server = createServer();

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      resolveListen();
    });
  });

  const address = server.address();
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClose();
        return;
      }
      rejectClose(error);
    });
  });

  if (address === null || typeof address === "string") {
    throw new Error("P01_E2E_PORT_RESERVATION_FAILED");
  }

  return address.port;
};

/**
 * Builds the environment of the owned API child.
 *
 * Only the platform variables the child truly needs are preserved. The
 * synthetic values are test-owned; no developer database URI, provider
 * credential or workspace `.env` value is inherited.
 */
const buildApiChildEnvironment = (options: {
  mailboxDirectory: string;
  webOrigin: string;
}): NodeJS.ProcessEnv => {
  const inherited = {
    PATH: process.env["PATH"],
    HOME: process.env["HOME"],
    TMPDIR: process.env["TMPDIR"],
    npm_execpath: process.env["npm_execpath"],
  };

  return {
    ...(inherited.PATH === undefined ? {} : { PATH: inherited.PATH }),
    ...(inherited.HOME === undefined ? {} : { HOME: inherited.HOME }),
    ...(inherited.TMPDIR === undefined ? {} : { TMPDIR: inherited.TMPDIR }),
    ...(inherited.npm_execpath === undefined
      ? {}
      : { npm_execpath: inherited.npm_execpath }),
    NODE_ENV: "test",
    // A nonsecret marker keeps the API configuration from loading the
    // workspace `.env` file, which carries a developer database URI.
    RAILWAY_ENVIRONMENT: "p01-e2e",
    API_HOST: "127.0.0.1",
    API_PREFIX: "/api/v1",
    CORS_ORIGINS: options.webOrigin,
    WEB_APP_URL: options.webOrigin,
    EMAIL_PROVIDER: "console",
    MAIL_FROM_ADDRESS: "no-reply@p01-e2e.invalid",
    MAIL_FROM_NAME: "Oriental Shoes E2E",
    LOG_LEVEL: "warn",
    AUTH_JWT_SECRET: "p01-e2e-harness-access-secret-0123456789abcdef",
    AUTH_REFRESH_JWT_SECRET: "p01-e2e-harness-refresh-secret-0123456789abcdef",
    AUTH_VERIFICATION_JWT_SECRET:
      "p01-e2e-harness-verification-secret-0123456789",
    AUTH_RESET_JWT_SECRET: "p01-e2e-harness-reset-secret-0123456789abcdef",
    AUTH_ARGON2_MEMORY_KIB: "1944",
    AUTH_ARGON2_TIME_COST: "1",
    AUTH_ARGON2_PARALLELISM: "1",
    /**
     * The owned disposable environment runs the real rate limiters. The
     * journeys need more attempts than a real client budget allows, so the
     * owned child raises the synthetic budgets only. No production or
     * developer configuration is touched.
     */
    API_RATE_LIMIT_MAX: "5000",
    AUTH_LIMIT_REGISTER_PER_HOUR: "100",
    AUTH_LIMIT_VERIFY_PER_15_MIN: "500",
    AUTH_LIMIT_RESEND_PER_HOUR_SOURCE: "100",
    AUTH_LIMIT_RESEND_PER_HOUR_ACCOUNT: "100",
    AUTH_LIMIT_LOGIN_PER_15_MIN: "100",
    AUTH_LIMIT_LOGIN_PER_15_MIN_ACCOUNT: "100",
    AUTH_LIMIT_REFRESH_PER_15_MIN: "500",
    AUTH_LIMIT_FORGOT_PER_HOUR_SOURCE: "100",
    AUTH_LIMIT_FORGOT_PER_HOUR_ACCOUNT: "100",
    AUTH_LIMIT_RESET_PER_15_MIN: "100",
    AUTH_LIMIT_PASSWORD_CHANGE_PER_15_MIN: "100",
    AUTH_LIMIT_LOGOUT_PER_15_MIN: "100",
    AUTH_LIMIT_LOGOUT_ALL_PER_15_MIN: "100",
    [CHILD_MAILBOX_ENVIRONMENT_KEY]: options.mailboxDirectory,
    [CHILD_PROJECTS_ENVIRONMENT_KEY]: E2E_BROWSER_PROJECTS.join(","),
  };
};

const killOwnedProcessGroup = (
  child: ChildProcess,
  signal: NodeJS.Signals,
): void => {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // The owned process group is already gone.
    return;
  }
};

const waitForExit = async (
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return new Promise<boolean>((resolveExit) => {
    const onExit = (): void => {
      clearTimeout(timer);
      resolveExit(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolveExit(false);
    }, timeoutMs);
    child.on("exit", onExit);
  });
};

const stopNextChild = async (
  child: ChildProcess | undefined,
): Promise<void> => {
  if (child === undefined) {
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  killOwnedProcessGroup(child, "SIGTERM");
  const exited = await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
  if (!exited) {
    killOwnedProcessGroup(child, "SIGKILL");
    await waitForExit(child, FORCE_EXIT_TIMEOUT_MS);
  }
};

const stopApiChild = async (child: ChildProcess | undefined): Promise<void> => {
  if (child === undefined) {
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    child.send({ type: "shutdown" });
  } catch {
    // The IPC channel is already closed. The owned group is stopped below.
  }

  const exited = await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
  if (!exited) {
    killOwnedProcessGroup(child, "SIGKILL");
    await waitForExit(child, FORCE_EXIT_TIMEOUT_MS);
  }
};

const waitForApiReady = async (
  child: ChildProcess,
  timeoutMs: number,
): Promise<ApiChildReadyMessage> =>
  new Promise<ApiChildReadyMessage>((resolveReady, rejectReady) => {
    let settled = false;

    const finish = (
      outcome:
        | { readonly ok: true; readonly message: ApiChildReadyMessage }
        | { readonly ok: false; readonly error: Error },
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", onError);
      if (outcome.ok) {
        resolveReady(outcome.message);
        return;
      }
      rejectReady(outcome.error);
    };

    const onMessage = (message: unknown): void => {
      if (isApiChildFatalMessage(message)) {
        finish({
          ok: false,
          error: new Error("P01_E2E_SETUP_FAILED"),
        });
        return;
      }
      if (isApiChildReadyMessage(message)) {
        finish({ ok: true, message });
      }
    };

    const onExit = (code: number | null): void => {
      finish({
        ok: false,
        error: new Error(
          `P01_E2E_API_CHILD_EXITED_${String(code ?? "signal")}`,
        ),
      });
    };

    const onError = (): void => {
      finish({ ok: false, error: new Error("P01_E2E_API_CHILD_ERROR") });
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: new Error("P01_E2E_API_READY_TIMEOUT") });
    }, timeoutMs);

    child.on("message", onMessage);
    child.on("exit", onExit);
    child.on("error", onError);
  });

/**
 * Waits until one owned HTTP endpoint answers. The readiness is a bounded
 * condition poll with child-exit handling, never a fixed sleep.
 */
const waitForHttpReady = async (options: {
  url: string;
  child: ChildProcess;
  timeoutMs: number;
  failureMessage: string;
}): Promise<void> => {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    if (options.child.exitCode !== null) {
      throw new Error(options.failureMessage);
    }

    try {
      const response = await fetch(options.url, {
        signal: AbortSignal.timeout(READINESS_REQUEST_TIMEOUT_MS),
      });
      await response.body?.cancel();
      if (response.ok) {
        return;
      }
    } catch {
      // The owned server does not answer yet. The deadline below decides.
    }

    await delay(READINESS_POLL_INTERVAL_MS);
  }

  throw new Error(options.failureMessage);
};

export default async function globalSetup(
  config: FullConfig,
): Promise<() => Promise<void>> {
  const configFile = config.configFile;
  const webDirectory =
    configFile === undefined || configFile.length === 0
      ? process.cwd()
      : dirname(configFile);
  const apiDirectory = resolve(webDirectory, "..", "api");

  const runtimeDirectory = await mkdtemp(join(tmpdir(), "p01-e2e-"));
  await chmod(runtimeDirectory, 0o700);
  const mailboxDirectory = join(runtimeDirectory, "mailbox");
  await mkdir(mailboxDirectory, { recursive: true, mode: 0o700 });
  const runtimeFile = join(runtimeDirectory, "runtime.json");

  let apiChild: ChildProcess | undefined;
  let nextChild: ChildProcess | undefined;
  let cleanedUp = false;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    await stopNextChild(nextChild);
    await stopApiChild(apiChild);
    Reflect.deleteProperty(process.env, E2E_RUNTIME_FILE_ENVIRONMENT_KEY);
    await rm(runtimeDirectory, { recursive: true, force: true });
  };

  // A hard exit of the runner must not leave an owned server behind.
  process.on("exit", () => {
    if (nextChild !== undefined) {
      killOwnedProcessGroup(nextChild, "SIGKILL");
    }
    if (apiChild !== undefined) {
      killOwnedProcessGroup(apiChild, "SIGKILL");
    }
  });

  try {
    const webPort = await reserveLoopbackPort();
    const webOrigin = `http://127.0.0.1:${String(webPort)}`;

    apiChild = fork(join(apiDirectory, "tests", "e2e", "server.ts"), [], {
      cwd: apiDirectory,
      env: buildApiChildEnvironment({ mailboxDirectory, webOrigin }),
      execArgv: ["--conditions=development", "--import", "tsx"],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      detached: true,
    });
    apiChild.stdout?.resume();
    apiChild.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    const ready = await waitForApiReady(apiChild, API_READY_TIMEOUT_MS);
    const apiOrigin = ready.apiOrigin;

    nextChild = spawn(
      process.execPath,
      [
        "scripts/next.mjs",
        "dev",
        "--webpack",
        "--port",
        String(webPort),
        "--hostname",
        "127.0.0.1",
      ],
      {
        cwd: webDirectory,
        env: {
          ...process.env,
          NODE_ENV: "development",
          // The real API origin is present before the disposable Next process
          // evaluates the public environment.
          NEXT_PUBLIC_API_URL: `${apiOrigin}/api/v1`,
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      },
    );
    nextChild.stdout?.resume();
    nextChild.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    await waitForHttpReady({
      url: `${apiOrigin}/api/v1/health/ready`,
      child: apiChild,
      timeoutMs: READINESS_TIMEOUT_MS,
      failureMessage: "P01_E2E_API_READINESS_FAILED",
    });
    await waitForHttpReady({
      url: `${webOrigin}/auth/login`,
      child: nextChild,
      timeoutMs: READINESS_TIMEOUT_MS,
      failureMessage: "P01_E2E_WEB_READINESS_FAILED",
    });

    const runtime = parseE2eRuntime({
      apiOrigin,
      webOrigin,
      mailboxDirectory,
      admin: ready.admin,
      legacyStaffByProject: ready.legacyStaffByProject,
    });

    await writeFile(runtimeFile, `${JSON.stringify(runtime, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });

    // The workers read the private manifest through this variable.
    process.env[E2E_RUNTIME_FILE_ENVIRONMENT_KEY] = runtimeFile;
  } catch (error) {
    await cleanup();
    throw error;
  }

  return cleanup;
}
