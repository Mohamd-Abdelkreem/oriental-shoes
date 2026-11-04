import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import type { DatabaseClient, UserRole, UserStatus } from "@template/database";

import type {
  EmailDelivery,
  EmailSendRequest,
  EmailSendResult,
} from "../../src/infrastructure/email/email-delivery.js";

/**
 * The disposable API child of the isolated browser harness.
 *
 * It owns one PostgreSQL container, one migrated database, one capturing
 * mailbox and one real listener. No business request is intercepted, no
 * test-only route enters the production router and no provider is contacted.
 */

const execFileAsync = promisify(execFile);

const MAILBOX_ENVIRONMENT_KEY = "P01_E2E_MAILBOX_DIRECTORY";
const PROJECTS_ENVIRONMENT_KEY = "P01_E2E_PROJECTS";

const VERIFICATION_ACTION_PATH = "/auth/verify-email";
const RESET_ACTION_PATH = "/auth/reset-password";

const ADMIN_EMAIL = "admin@p01-e2e.invalid";
const ADMIN_FULL_NAME = "P01 E2E Administrator";
const ADMIN_PASSWORD = "P01-E2E-Administrator-Password-1";
const OPERATOR_REFERENCE = "p01-e2e-harness-operator";

const SHUTDOWN_TIMEOUT_MS = 20_000;
const MIGRATION_TIMEOUT_MS = 180_000;

type CapturedActionKind = "verification" | "reset";

/** One synthetic identity owned by the harness. */
type E2eSyntheticIdentity = Readonly<{
  id: string;
  email: string;
  password: string;
}>;

/** The validated ready metadata the child sends to the owning parent. */
type E2eApiChildReadyMessage = Readonly<{
  type: "ready";
  apiOrigin: string;
  admin: E2eSyntheticIdentity;
  legacyStaffByProject: Record<string, E2eSyntheticIdentity>;
}>;

/** The fixed failure classification the child sends to the owning parent. */
type E2eApiChildFatalMessage = Readonly<{
  type: "fatal";
  classification: "P01_E2E_SETUP_FAILED";
}>;

/** The explicit shutdown request the parent sends to the owned child. */
type E2eShutdownMessage = Readonly<{ type: "shutdown" }>;

/** The complete IPC schema of the owned API child. */
type E2eIpcMessage =
  E2eApiChildReadyMessage | E2eApiChildFatalMessage | E2eShutdownMessage;

const sendToParent = (
  message: E2eApiChildReadyMessage | E2eApiChildFatalMessage,
): void => {
  process.send?.(message);
};

/**
 * The safe startup classification. It never carries a provider error, a
 * database detail, a URI, a token or a credential. The write is synchronous so
 * that the classification survives the immediate process exit.
 */
const reportFatal = (step: string): void => {
  try {
    writeSync(
      2,
      `${JSON.stringify({ classification: "P01_E2E_SETUP_FAILED", step })}\n`,
    );
  } catch {
    // The classification is also delivered through the IPC channel.
  }
  sendToParent({ type: "fatal", classification: "P01_E2E_SETUP_FAILED" });
};

/**
 * The capturing mail delivery of the owned process.
 *
 * Every captured request becomes one atomic mode0600 JSON record inside the
 * private mailbox directory. The kind is derived from the validated purpose
 * pathname of the action link; an unexpected origin or pathname is rejected
 * instead of issuing an arbitrary link.
 */
class CapturingEmailDelivery implements EmailDelivery {
  readonly provider = "console" as const;

  private readonly captured: Array<
    Readonly<{
      sequence: number;
      recipient: string;
      kind: CapturedActionKind;
      actionUrl: string;
    }>
  > = [];

  private sequence = 0;

  constructor(
    private readonly mailboxDirectory: string,
    private readonly webOrigin: string,
  ) {}

  async send(request: EmailSendRequest): Promise<EmailSendResult> {
    const actionUrl = request.localPreviewUrl;
    if (actionUrl === undefined) {
      throw new Error("P01_E2E_MAIL_ACTION_MISSING");
    }

    const recipient = request.to.trim().toLowerCase();
    const kind = this.classifyAction(actionUrl);

    this.sequence += 1;
    const sequence = this.sequence;
    const record = {
      sequence,
      recipient,
      kind,
      actionUrl,
      html: request.html,
    };

    await mkdir(this.mailboxDirectory, { recursive: true, mode: 0o700 });
    const fileName = `${randomUUID()}.json`;
    const temporaryPath = join(this.mailboxDirectory, `${fileName}.tmp`);
    const finalPath = join(this.mailboxDirectory, fileName);
    await writeFile(temporaryPath, JSON.stringify(record), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, finalPath);

    this.captured.push({ sequence, recipient, kind, actionUrl });
    return { providerMessageId: `e2e/${String(sequence)}` };
  }

  /** The newest captured action of one exact recipient and kind. */
  findActionUrl(recipient: string, kind: CapturedActionKind): string | null {
    const matches = this.captured.filter(
      (entry) => entry.recipient === recipient && entry.kind === kind,
    );
    const newest = matches[matches.length - 1];
    return newest === undefined ? null : newest.actionUrl;
  }

  private classifyAction(actionUrl: string): CapturedActionKind {
    let url: URL;
    try {
      url = new URL(actionUrl);
    } catch {
      throw new Error("P01_E2E_MAIL_ACTION_INVALID");
    }

    if (url.origin !== this.webOrigin) {
      throw new Error("P01_E2E_MAIL_ORIGIN_MISMATCH");
    }
    if (url.pathname === VERIFICATION_ACTION_PATH) {
      return "verification";
    }
    if (url.pathname === RESET_ACTION_PATH) {
      return "reset";
    }
    throw new Error("P01_E2E_MAIL_PATH_MISMATCH");
  }
}

const runPrisma = async (
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> => {
  const pnpmScript = process.env["npm_execpath"];
  if (pnpmScript === undefined) {
    throw new Error("P01_E2E_PNPM_EXECPATH_MISSING");
  }

  await execFileAsync(
    process.execPath,
    [pnpmScript, "exec", "prisma", ...args],
    {
      cwd: resolve(process.cwd(), "../../packages/database"),
      env: environment,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );
};

const sanitizeProjectName = (project: string): string =>
  project
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-");

/**
 * One owned disposable legacy employee per configured browser project.
 *
 * The account is a verified suspended employee without a department, without
 * an approval and without any retained decision. It carries no fabricated
 * approval and no fabricated history; real new employees still register
 * through the user interface.
 */
const createLegacyStaffFixture = async (
  database: DatabaseClient,
  project: string,
  generateHash: (value: string) => Promise<string>,
  userRole: UserRole,
  userStatus: UserStatus,
): Promise<E2eSyntheticIdentity> => {
  const safeProject = sanitizeProjectName(project);
  const email = `legacy-${safeProject}@p01-e2e.invalid`;
  const password = `${safeProject}-Legacy-Password-1`;
  const passwordHash = await generateHash(password);

  const created = await database.user.create({
    data: {
      email,
      passwordHash,
      fullName: `Legacy Employee ${safeProject}`,
      phone: null,
      role: userRole,
      status: userStatus,
      emailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      accessVersion: 0,
    },
    select: { id: true },
  });

  return { id: created.id, email, password };
};

const extractVerificationToken = (
  delivery: CapturingEmailDelivery,
  recipient: string,
): string => {
  const actionUrl = delivery.findActionUrl(recipient, "verification");
  if (actionUrl === null) {
    throw new Error("P01_E2E_VERIFICATION_CAPTURE_MISSING");
  }

  const token = new URL(actionUrl).searchParams.get("token");
  if (token === null || token.length === 0) {
    throw new Error("P01_E2E_VERIFICATION_TOKEN_MISSING");
  }
  return token;
};

const main = async (): Promise<void> => {
  let step = "startup";
  let container: StartedPostgreSqlContainer | undefined;
  let database: DatabaseClient | undefined;
  let server: Server | undefined;
  let isShuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    const forceTimer = setTimeout(() => {
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    const ownedServer = server;
    const ownedDatabase = database;
    const ownedContainer = container;

    try {
      if (ownedServer !== undefined) {
        await new Promise<void>((resolveClose) => {
          ownedServer.close(() => {
            resolveClose();
          });
          ownedServer.closeIdleConnections();
        });
      }
      if (ownedDatabase !== undefined) {
        await ownedDatabase.$disconnect();
      }
      if (ownedContainer !== undefined) {
        await ownedContainer.stop();
      }
      clearTimeout(forceTimer);
    } catch {
      clearTimeout(forceTimer);
      process.exit(1);
    }

    // The IPC channel keeps the event loop alive, so the owned child ends
    // explicitly once its listener, database and container are closed.
    process.exit(0);
  };

  try {
    step = "environment";
    const mailboxDirectory = process.env[MAILBOX_ENVIRONMENT_KEY];
    if (mailboxDirectory === undefined || mailboxDirectory.length === 0) {
      throw new Error("P01_E2E_MAILBOX_DIRECTORY_MISSING");
    }
    const projects = (process.env[PROJECTS_ENVIRONMENT_KEY] ?? "")
      .split(",")
      .map((project) => project.trim())
      .filter((project) => project.length > 0);
    if (projects.length === 0) {
      throw new Error("P01_E2E_PROJECTS_MISSING");
    }
    const webAppUrl = process.env["WEB_APP_URL"];
    if (webAppUrl === undefined || webAppUrl.length === 0) {
      throw new Error("P01_E2E_WEB_APP_URL_MISSING");
    }
    const webOrigin = new URL(webAppUrl).origin;

    step = "container";
    container = await new PostgreSqlContainer("postgres:18.4")
      .withDatabase("p01_e2e_browser")
      .withUsername("p01_e2e")
      .withPassword("test-only-password")
      .withStartupTimeout(120_000)
      .start();
    const databaseUrl = container.getConnectionUri();

    step = "migrations";
    const prismaEnvironment = { ...process.env, DATABASE_URL: databaseUrl };
    await runPrisma(["migrate", "deploy"], prismaEnvironment);
    await runPrisma(["generate"], prismaEnvironment);
    process.env["DATABASE_URL"] = databaseUrl;

    step = "application";
    const { createDatabaseClient, UserRole, UserStatus } =
      await import("@template/database");
    const { createApp } = await import("../../src/app.js");
    const { createLogger } =
      await import("../../src/infrastructure/logger/logger.js");
    const { EmailService } =
      await import("../../src/infrastructure/email/email.service.js");
    const { AuthService } =
      await import("../../src/modules/auth/auth.service.js");
    const { InitialAdministratorService } =
      await import("../../src/modules/auth/initial-administrator.service.js");
    const { generateHash } =
      await import("../../src/infrastructure/security/index.js");

    const ownedDatabase = createDatabaseClient(databaseUrl);
    database = ownedDatabase;
    await ownedDatabase.$connect();

    const delivery = new CapturingEmailDelivery(mailboxDirectory, webOrigin);
    const emailService = new EmailService(delivery);
    const authService = new AuthService(ownedDatabase, emailService);

    step = "initial-administrator";
    const registered = await authService.register({
      fullName: ADMIN_FULL_NAME,
      email: ADMIN_EMAIL,
      phone: null,
      password: ADMIN_PASSWORD,
    });
    await authService.verifyEmail(
      extractVerificationToken(delivery, ADMIN_EMAIL),
    );

    const candidate = await ownedDatabase.user.findUnique({
      where: { id: registered.user.id },
      select: { accessVersion: true },
    });
    if (candidate === null) {
      throw new Error("P01_E2E_INITIAL_ADMINISTRATOR_CANDIDATE_MISSING");
    }

    const initialAdministratorService = new InitialAdministratorService(
      ownedDatabase,
    );
    const provisioned = await initialAdministratorService.apply({
      userId: registered.user.id,
      expectedEmail: ADMIN_EMAIL,
      expectedAccessVersion: candidate.accessVersion,
      operatorReference: OPERATOR_REFERENCE,
    });

    step = "legacy-staff";
    const legacyStaffByProject: Record<string, E2eSyntheticIdentity> = {};
    for (const project of projects) {
      legacyStaffByProject[project] = await createLegacyStaffFixture(
        ownedDatabase,
        project,
        generateHash,
        UserRole.USER,
        UserStatus.SUSPENDED,
      );
    }

    step = "listener";
    const logger = createLogger({ level: "warn" });
    const app = createApp({
      database: ownedDatabase,
      logger,
      emailDelivery: delivery,
    });
    const ownedServer = app.listen(0, "127.0.0.1");
    server = ownedServer;
    await new Promise<void>((resolveListen, rejectListen) => {
      ownedServer.once("listening", () => {
        resolveListen();
      });
      ownedServer.once("error", (error: Error) => {
        rejectListen(error);
      });
    });

    const address = ownedServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("P01_E2E_API_ADDRESS_UNAVAILABLE");
    }
    const apiOrigin = `http://127.0.0.1:${String(address.port)}`;

    process.on("message", (message: unknown) => {
      const received = message as Partial<E2eIpcMessage>;
      if (received.type === "shutdown") {
        void shutdown();
      }
    });
    process.once("SIGINT", () => {
      void shutdown();
    });
    process.once("SIGTERM", () => {
      void shutdown();
    });

    step = "ready";
    sendToParent({
      type: "ready",
      apiOrigin,
      admin: {
        id: provisioned.user.id,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      legacyStaffByProject,
    });
  } catch {
    reportFatal(step);
    await shutdown();
    process.exit(1);
  }
};

void main();
