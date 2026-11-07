import assert from "node:assert/strict";
import { salesUuidSchema } from "@template/contracts";
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

import type { AuthService } from "../../src/modules/auth/auth.service.js";
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

type P04Scenario = Readonly<{
  orderId: string;
  pieceId: string;
  issueId: string | null;
}>;
type P04Fixtures = Readonly<{
  sales: E2eSyntheticIdentity;
  otherSales: E2eSyntheticIdentity;
  approver: E2eSyntheticIdentity;
  factory: E2eSyntheticIdentity;
  scenarios: Record<string, P04Scenario>;
  adminOwnedContact: P04Scenario & { issueId: string };
}>;
type CatalogEvidence = Readonly<{
  kind: "synthetic" | "reviewed-workbook";
  sourceSha256: string;
}>;

/** The validated ready metadata the child sends to the owning parent. */
type E2eApiChildReadyMessage = Readonly<{
  type: "ready";
  apiOrigin: string;
  admin: E2eSyntheticIdentity;
  legacyStaffByProject: Record<string, E2eSyntheticIdentity>;
  p04ByProject: Record<string, P04Fixtures>;
  catalogEvidence: CatalogEvidence;
  p03ByProject: Record<
    string,
    {
      sales: E2eSyntheticIdentity;
      returnedOrderId: string;
      approvedOrderId: string;
    }
  >;
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

// Earlier consumers now use actual P04 decisions; their original sales receipts remain immutable.
const createP03ConsumerFixtures = async (options: {
  database: DatabaseClient;
  project: string;
  projectIndex: number;
  administratorId: string;
  authService: AuthService;
  delivery: CapturingEmailDelivery;
}): Promise<{
  sales: E2eSyntheticIdentity;
  returnedOrderId: string;
  approvedOrderId: string;
}> => {
  const { StaffService } =
    await import("../../src/modules/staff/staff.service.js");
  const { SalesCommandExecutor } =
    await import("../../src/modules/sales-commands/sales-command-executor.js");
  const { SalesCommandsService } =
    await import("../../src/modules/sales-commands/sales-commands.service.js");
  const { CustomersService } =
    await import("../../src/modules/customers/customers.service.js");
  const { CatalogsService } =
    await import("../../src/modules/catalogs/catalogs.service.js");
  const { SalesOrdersService } =
    await import("../../src/modules/sales-orders/sales-orders.service.js");
  const { createCustomerBodySchema, submitOrderBodySchema } =
    await import("@template/contracts");
  const project = sanitizeProjectName(options.project);
  const email = `p03-${project}@p01-e2e.invalid`,
    password = `${project}-P03-Consumer-Password-1`;
  const registered = await options.authService.register({
    fullName: `P03 Consumer ${project}`,
    email,
    password,
    phone: null,
  });
  const verified = await options.authService.verifyEmail(
    extractVerificationToken(options.delivery, email),
  );
  await new StaffService(options.database).approveStaff(
    options.administratorId,
    registered.user.id,
    {
      commandId: randomUUID(),
      expectedAccessVersion: verified.user.accessVersion,
      department: "SALES",
    },
  );
  const sales = { id: registered.user.id, email, password };
  const executor = new SalesCommandExecutor(options.database);
  const customers = new CustomersService(options.database, executor);
  const customer = (
    await customers.create(
      sales.id,
      createCustomerBodySchema.parse({
        commandId: randomUUID(),
        customer: {
          name: `P03 Fixture Customer ${project}`,
          phone: `05090000${String(options.projectIndex + 1).padStart(2, "0")}`,
          address: "Synthetic retained address",
        },
      }),
    )
  ).savedCustomer;
  const catalogs = new CatalogsService(options.database);
  const orders = new SalesOrdersService(options.database, executor, "UTC");
  const receipts = new SalesCommandsService(options.database);
  const active = await catalogs.get(sales.id);
  if (active.availability !== "available")
    throw new Error("P03_E2E_CATALOG_UNAVAILABLE");
  const selected = (kind: string, cell?: string) => {
    const entry = active.entries.find(
      (entry) =>
        entry.kind === kind &&
        (cell === undefined || entry.sourceCell === cell),
    );
    if (entry === undefined) throw new Error("P03_E2E_CATALOG_ENTRY_MISSING");
    return entry;
  };
  const ids: string[] = [];
  for (const [index, cell] of ["Z3", "Z12"].entries()) {
    const decoration = selected("decoration", cell);
    const capture = {
      type: "SHOP",
      customerId: customer.id,
      paidAmount: index === 1 ? "300.00" : "0.00",
      pieces: [
        {
          id: randomUUID(),
          model: selected("model").displayValue,
          size: "40",
          leatherBase: selected("leatherBase").displayValue,
          decoration: decoration.displayValue,
          face: "Synthetic face",
          catalogSelections: { decoration: decoration.id },
        },
      ],
    };
    const quote = await catalogs.quote(sales.id, {
      requestId: randomUUID(),
      pieces: capture.pieces,
    });
    if (quote.availability !== "available")
      throw new Error("P03_E2E_QUOTE_UNAVAILABLE");
    const submitted = await orders.submit(
      sales.id,
      submitOrderBodySchema.parse({
        origin: "new",
        commandId: randomUUID(),
        capture,
        expectedCustomerVersion: customer.version,
        reviewedQuote: {
          sourceId: quote.sourceId,
          fingerprint: quote.fingerprint,
        },
      }),
    );
    const original = submitted.savedOrder;
    const { ApprovalService } =
      await import("../../src/modules/approval/approval.service.js");
    const { ApprovalCommandExecutor } =
      await import("../../src/modules/approval/approval-command-executor.js");
    const approval = new ApprovalService(
      options.database,
      new ApprovalCommandExecutor(options.database),
      "UTC",
    );
    if (index === 0)
      await approval.returnInitial(options.administratorId, original.id, {
        commandId: randomUUID(),
        expectedVersion: original.version,
        reason: "Synthetic P04 consumer: review size",
        notes: "Separate retained fixture review notes",
      });
    else
      await approval.approveInitial(options.administratorId, original.id, {
        commandId: randomUUID(),
        expectedVersion: original.version,
      });
    const current = (await orders.get(sales.id, original.id)).order;
    assert.equal(current.version, 2);
    assert.equal(current.status, index === 0 ? "RETURNED" : "APPROVED");
    assert.equal(current.businessNumber, original.businessNumber);
    assert.deepEqual(current.customerSnapshot, original.customerSnapshot);
    assert.deepEqual(current.money, original.money);
    if (index === 0) assert.deepEqual(current.pieces, original.pieces);
    else
      for (const [position, piece] of current.pieces.entries()) {
        assert.deepEqual(
          {
            ...piece,
            stage: original.pieces[position]?.stage,
            workState: original.pieces[position]?.workState,
          },
          original.pieces[position],
        );
        assert.equal(piece.stage, "CUTTING");
        assert.equal(piece.workState, "INCOMING");
      }
    assert.equal(current.allowedActions.canResubmit, index === 0);
    assert.equal(current.allowedActions.canSetPaid, index === 1);
    if (index === 0) {
      assert.equal(current.approval.returnRevision, 2);
      assert.ok(current.approval.returnDecisionId);
    } else {
      assert.ok(current.approval.approvedAt);
      assert.equal(current.approval.returnDecisionId, null);
    }
    const retained = await receipts.get(sales.id, submitted.receipt.commandId);
    assert.equal(retained.kind, "order");
    assert.deepEqual(retained.savedOrder, original);
    assert.equal(retained.receipt.afterVersion, 1);
    ids.push(original.id);
  }
  const returnedOrderId = ids[0],
    approvedOrderId = ids[1];
  if (returnedOrderId === undefined || approvedOrderId === undefined)
    throw new Error("P03_E2E_FIXTURE_MISSING");
  return { sales, returnedOrderId, approvedOrderId };
};

// Each fixture is confined to the child's fresh migrated target. No P05/P06 history is invented.
const createP04Fixtures = async (options: {
  database: DatabaseClient;
  project: string;
  projectIndex: number;
  administratorId: string;
  sales: E2eSyntheticIdentity;
  authService: AuthService;
  delivery: CapturingEmailDelivery;
}): Promise<P04Fixtures> => {
  const { StaffService } =
    await import("../../src/modules/staff/staff.service.js");
  const { ApprovalService } =
    await import("../../src/modules/approval/approval.service.js");
  const { ApprovalCommandExecutor } =
    await import("../../src/modules/approval/approval-command-executor.js");
  const { SalesCommandExecutor } =
    await import("../../src/modules/sales-commands/sales-command-executor.js");
  const { CustomersService } =
    await import("../../src/modules/customers/customers.service.js");
  const { CatalogsService } =
    await import("../../src/modules/catalogs/catalogs.service.js");
  const { SalesOrdersService } =
    await import("../../src/modules/sales-orders/sales-orders.service.js");
  const { createCustomerBodySchema, submitOrderBodySchema } =
    await import("@template/contracts");
  const staff = new StaffService(options.database);
  const identity = async (department: "SALES" | "APPROVAL" | "CUTTING") => {
    const email = `p04-${options.project}-${department.toLowerCase()}@p01-e2e.invalid`,
      password = `${options.project}-P04-${department}-Password-1`;
    const registered = await options.authService.register({
      fullName:
        department === "APPROVAL"
          ? "A".repeat(150)
          : `P04 ${department} ${options.project}`,
      email,
      password,
      phone: null,
    });
    const verified = await options.authService.verifyEmail(
      extractVerificationToken(options.delivery, email),
    );
    await staff.approveStaff(options.administratorId, registered.user.id, {
      commandId: randomUUID(),
      expectedAccessVersion: verified.user.accessVersion,
      department,
    });
    return { id: registered.user.id, email, password };
  };
  const otherSales = await identity("SALES"),
    approver = await identity("APPROVAL"),
    factory = await identity("CUTTING");
  const salesCommands = new SalesCommandExecutor(options.database),
    customers = new CustomersService(options.database, salesCommands),
    orders = new SalesOrdersService(options.database, salesCommands, "UTC");
  const approval = new ApprovalService(
    options.database,
    new ApprovalCommandExecutor(options.database),
    "UTC",
  );
  const catalog = await new CatalogsService(options.database).get(
    options.sales.id,
  );
  if (catalog.availability !== "available")
    throw new Error("P04_E2E_CATALOG_UNAVAILABLE");
  const selected = (kind: string, text?: string) => {
    const found = catalog.entries.find(
      (entry) =>
        entry.kind === kind &&
        (text === undefined || entry.displayValue === text),
    );
    if (!found) throw new Error("P04_E2E_CATALOG_SELECTION_MISSING");
    return found;
  };
  const customer = (
    await customers.create(
      options.sales.id,
      createCustomerBodySchema.parse({
        commandId: randomUUID(),
        customer: {
          name: `P04 fixture ${options.project}`,
          phone: `05094000${String(options.projectIndex + 1).padStart(2, "0")}`,
          address: "Owned test address",
        },
      }),
    )
  ).savedCustomer;
  const makeOrder = async (
    ownerId: string,
    count: number,
    refer: boolean,
    paidAmount = "0.00",
  ): Promise<P04Scenario> => {
    const model = selected("model"),
      size = selected("size", "40"),
      leatherBase = selected("leatherBase"),
      sole = selected("sole");
    const capture = {
      type: "SHOP",
      customerId: customer.id,
      paidAmount,
      responsibleSignature: "P04 retained capture",
      pieces: Array.from({ length: count }, (_, index) => {
        const decoration = selected(
          "decoration",
          index === 1 ? "نعام - O" : "زبيري - z",
        );
        return {
          id: randomUUID(),
          model: model.displayValue,
          size: size.displayValue,
          leatherBase: leatherBase.displayValue,
          sole: sole.displayValue,
          decoration: decoration.displayValue,
          face: "Owned fixture face",
          catalogSelections: {
            model: model.id,
            size: size.id,
            leatherBase: leatherBase.id,
            sole: sole.id,
            decoration: decoration.id,
          },
        };
      }),
    };
    const quote = await new CatalogsService(options.database).quote(ownerId, {
      requestId: randomUUID(),
      pieces: capture.pieces,
    });
    if (quote.availability !== "available")
      throw new Error("P04_E2E_QUOTE_UNAVAILABLE");
    const submitted = await orders.submit(
      ownerId,
      submitOrderBodySchema.parse({
        origin: "new",
        commandId: randomUUID(),
        capture,
        expectedCustomerVersion: customer.version,
        reviewedQuote: {
          sourceId: quote.sourceId,
          fingerprint: quote.fingerprint,
        },
      }),
    );
    const orderId = submitted.savedOrder.id,
      pieceId = submitted.savedOrder.pieces[0]?.id;
    if (!pieceId) throw new Error("P04_E2E_PIECE_MISSING");
    await approval.approveInitial(approver.id, orderId, {
      commandId: randomUUID(),
      expectedVersion: submitted.savedOrder.version,
    });
    let issueId: string | null = null;
    if (refer) {
      const reported = await approval.reportIssue(
        factory.id,
        orderId,
        pieceId,
        {
          commandId: randomUUID(),
          expectedVersion: 2,
          reason: "Owned contact prerequisite",
          notes: "Reported through the actual P04 service",
        },
      );
      issueId = reported.outcome.issueId;
      if (!issueId) throw new Error("P04_E2E_ISSUE_MISSING");
      await approval.resolveIssue(approver.id, orderId, pieceId, issueId, {
        commandId: randomUUID(),
        expectedVersion: 3,
        decision: "SEND_TO_SALES",
        target: "PRODUCTION",
        notes: "Retained production target",
      });
    }
    return {
      orderId: salesUuidSchema.parse(orderId),
      pieceId: salesUuidSchema.parse(pieceId),
      issueId: issueId === null ? null : salesUuidSchema.parse(issueId),
    };
  };
  const scenarios: Record<string, P04Scenario> = {};
  for (const label of [
    "resolveA",
    "resolveB",
    "resolveC",
    "contact",
    "notes",
    "cancelRequest",
    "cancelAmendment",
    "money",
    "printHold",
    "printCancelled",
  ])
    scenarios[label] = await makeOrder(
      options.sales.id,
      2,
      ["contact", "notes", "cancelRequest"].includes(label),
      label === "money" ? "2000.00" : "0.00",
    );
  for (const count of [1, 8, 9, 17])
    scenarios[`print${String(count)}`] = await makeOrder(
      options.sales.id,
      count,
      false,
    );
  const adminOwnedContact = await makeOrder(options.administratorId, 2, true);
  if (adminOwnedContact.issueId === null)
    throw new Error("P04_E2E_ADMIN_ISSUE_MISSING");
  return {
    sales: options.sales,
    otherSales,
    approver,
    factory,
    scenarios,
    adminOwnedContact: {
      ...adminOwnedContact,
      issueId: adminOwnedContact.issueId,
    },
  };
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
    const catalogMode = process.env["P04_E2E_CATALOG_MODE"] ?? "synthetic";
    if (catalogMode !== "synthetic" && catalogMode !== "reviewed-workbook")
      throw new Error("P04_E2E_CATALOG_MODE_INVALID");
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

    step = "p03-consumer-fixtures";
    const { CatalogLoaderService, assertReviewedCatalogPreview } =
      await import("../../src/modules/catalogs/catalog-loader.service.js");
    const { syntheticCatalogPreview } =
      await import("../../src/test-support/reviewed-catalog.fixture.js");
    let preview;
    if (catalogMode === "reviewed-workbook") {
      const { readReviewedCatalogBytes } =
        await import("../../src/scripts/load-catalog.js");
      const { ExcelCatalogWorkbookReader } =
        await import("../../src/infrastructure/catalog/workbook-reader.js");
      const bytes = await readReviewedCatalogBytes(
        resolve(process.cwd(), "../../أمر_تفصيل_الحذاء_الشرقي.xlsx"),
      );
      preview = await new ExcelCatalogWorkbookReader().read(bytes);
      assertReviewedCatalogPreview(preview);
    } else preview = syntheticCatalogPreview();
    await new CatalogLoaderService(ownedDatabase).apply(
      preview,
      "p01_e2e_browser",
    );
    const catalogEvidence: CatalogEvidence = {
      kind: catalogMode,
      sourceSha256: preview.sourceSha256,
    };
    const p03ByProject: E2eApiChildReadyMessage["p03ByProject"] = {};
    for (const [projectIndex, project] of projects.entries())
      p03ByProject[project] = await createP03ConsumerFixtures({
        database: ownedDatabase,
        project,
        projectIndex,
        administratorId: provisioned.user.id,
        authService,
        delivery,
      });

    step = "p04-fixtures";
    const p04ByProject: Record<string, P04Fixtures> = {};
    for (const [projectIndex, project] of projects.entries()) {
      const p03 = p03ByProject[project];
      if (!p03) throw new Error("P04_E2E_PROJECT_MISSING");
      p04ByProject[project] = await createP04Fixtures({
        database: ownedDatabase,
        project,
        projectIndex,
        administratorId: provisioned.user.id,
        sales: p03.sales,
        authService,
        delivery,
      });
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
      p03ByProject,
      p04ByProject,
      catalogEvidence,
    });
  } catch {
    reportFatal(step);
    await shutdown();
    process.exit(1);
  }
};

void main();
