import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  administrationDashboardDataSchema,
  administrationReportDataSchema,
  approvalDashboardDataSchema,
  catalogDataSchema,
  manufacturingDashboardDataSchema,
  qualityDashboardDataSchema,
  salesDashboardDataSchema,
  salesOrderTypeSchema,
  warehouseDashboardDataSchema,
  type Department,
} from "@template/contracts";
import {
  DemoSeedError,
  demoHttp,
  type DemoCredentials,
  type DemoRequest,
} from "./demo-seed/http.js";
import { prepareDemoSales } from "./demo-seed/sales.js";
import { seedDemoScenarios } from "./demo-seed/scenarios.js";
import { createDemoStaff, demoStaffCredentials } from "./demo-seed/staff.js";
import { demoWork } from "./demo-seed/work.js";

const localDatabaseUrl = () => {
  if (
    process.env["NODE_ENV"] !== "development" ||
    process.env["RAILWAY_ENVIRONMENT"] !== undefined
  )
    throw new DemoSeedError("Demo seeding requires local development mode");
  const url = URL.parse(process.env["DATABASE_URL"] ?? "");
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.searchParams.has("host")
  )
    throw new DemoSeedError(
      "Demo seeding requires a loopback PostgreSQL DATABASE_URL",
    );
  return url;
};

const adminCredentials = (): DemoCredentials => {
  const email =
    process.env["DEMO_ADMIN_EMAIL"] ?? process.env["SEED_ADMIN_EMAIL"];
  const password =
    process.env["DEMO_ADMIN_PASSWORD"] ?? process.env["SEED_ADMIN_PASSWORD"];
  if (!email || !password)
    throw new DemoSeedError(
      "Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD for an existing local administrator",
    );
  return { email, password };
};

const verifyDashboards = async (
  actors: Record<Department | "ADMIN", DemoRequest>,
) => {
  const [
    admin,
    sales,
    approval,
    cutting,
    production,
    quality,
    warehouse,
    report,
  ] = await Promise.all([
    actors.ADMIN(
      "/administration/dashboard",
      administrationDashboardDataSchema,
    ),
    actors.SALES("/sales-orders/dashboard", salesDashboardDataSchema),
    actors.APPROVAL("/approvals/dashboard", approvalDashboardDataSchema),
    actors.CUTTING(
      "/manufacturing/cutting/dashboard",
      manufacturingDashboardDataSchema,
    ),
    actors.PRODUCTION(
      "/manufacturing/production/dashboard",
      manufacturingDashboardDataSchema,
    ),
    actors.QUALITY("/quality/dashboard", qualityDashboardDataSchema),
    actors.WAREHOUSE("/warehouse/dashboard", warehouseDashboardDataSchema),
    actors.ADMIN("/administration/reports", administrationReportDataSchema),
  ]);
  console.info(
    JSON.stringify(
      {
        administration: admin.counts,
        sales: sales.counts,
        approval: approval.counts,
        cutting: cutting.counts,
        production: production.counts,
        quality: quality.counts,
        warehouse: warehouse.counts,
        reportOrders: report.orders.pagination.total,
      },
      null,
      2,
    ),
  );
};

const seed = async (
  api: string,
  admin: DemoCredentials,
  verificationLinks: Map<string, string>,
) => {
  const batch = randomBytes(5).toString("hex");
  const http = demoHttp(api);
  try {
    const administrator = await http.login(admin);
    if (
      administrator.user.role !== "ADMIN" ||
      administrator.user.status !== "ACTIVE"
    )
      throw new DemoSeedError("Demo seed requires an active administrator");
    const adminRequest = administrator.request;
    const dashboard = await adminRequest(
      "/administration/dashboard",
      administrationDashboardDataSchema,
    );
    const catalog = await adminRequest("/catalogs", catalogDataSchema);
    if (catalog.availability !== "available")
      throw new DemoSeedError(
        "Load the reviewed catalog before running the demo seed",
      );

    const staff = demoStaffCredentials(batch);
    const credentialsFile = `.env.demo-${batch}`;
    const accounts = Object.entries(staff.accounts)
      .map(
        ([department, { email, password, fullName }]) =>
          `# ${department} • ${fullName}\n${department}_EMAIL=${email}\n${department}_PASSWORD=${password}\n`,
      )
      .join("\n");
    await writeFile(
      new URL(`../../../../${credentialsFile}`, import.meta.url),
      accounts,
      { mode: 0o600, flag: "wx" },
    );
    console.info(
      `Demo batch ${batch}. Staff sign-in details: ${credentialsFile}`,
    );
    await createDemoStaff(
      staff,
      adminRequest,
      http.anonymous,
      verificationLinks,
    );

    const login = async (department: Department) => {
      const { email, password } = staff.accounts[department];
      return (await http.login({ email, password })).request;
    };
    const actors = {
      ADMIN: adminRequest,
      SALES: await login("SALES"),
      APPROVAL: await login("APPROVAL"),
      CUTTING: await login("CUTTING"),
      PRODUCTION: await login("PRODUCTION"),
      QUALITY: await login("QUALITY"),
      WAREHOUSE: await login("WAREHOUSE"),
    };
    const intake = await prepareDemoSales(actors.SALES, {
      batch,
      businessDate: dashboard.businessDate,
      sellerName: staff.accounts.SALES.fullName,
    });
    for (const [index, type] of salesOrderTypeSchema.options.entries())
      console.info(`${await intake.saveDraft(index + 8, type)}  مسودة`);
    const orders = await seedDemoScenarios(
      actors.SALES,
      intake,
      demoWork(actors),
      dashboard.businessDate,
    );
    await verifyDashboards(actors);
    console.info(
      `Created ${String(intake.customers.length)} customers, ${String(salesOrderTypeSchema.options.length)} drafts, ${String(orders.length)} orders and ${String(orders.reduce((count, { order }) => count + order.pieces.length, 0))} physical pieces.`,
    );
  } finally {
    await http.logout();
  }
};

const main = async () => {
  const url = localDatabaseUrl();
  const admin = adminCredentials();
  // This listener is private to the seed process. It leaves the running API's limits and mail provider intact.
  process.env["API_RATE_LIMIT_MAX"] = "2000";
  process.env["LOG_LEVEL"] = "silent";
  process.env["EMAIL_PROVIDER"] = "console";
  const [
    { createApp },
    { createDatabaseClient },
    { appConfig },
    { orderConfig },
    { logger },
  ] = await Promise.all([
    import("../app.js"),
    import("@template/database"),
    import("../core/config/app.config.js"),
    import("../core/config/order.config.js"),
    import("../infrastructure/logger/logger.js"),
  ]);
  if (orderConfig.businessTimeZone === null)
    throw new DemoSeedError(
      "Configure ORDER_BUSINESS_TIME_ZONE before running the demo seed",
    );
  const database = createDatabaseClient(url.href);
  try {
    const verificationLinks = new Map<string, string>();
    const server = createApp({
      database,
      logger,
      emailDelivery: {
        provider: "console",
        send: (mail) => {
          if (
            !mail.to.endsWith("@demo.oriental.invalid") ||
            !mail.localPreviewUrl
          )
            throw new DemoSeedError("Unexpected demo verification recipient");
          verificationLinks.set(mail.to, mail.localPreviewUrl);
          return Promise.resolve({ providerMessageId: null });
        },
      },
    }).listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string")
        throw new DemoSeedError("Cannot listen on loopback");
      console.info(`Seeding local database ${url.pathname.slice(1)}`);
      await seed(
        `http://127.0.0.1:${String(address.port)}${appConfig.apiPrefix}`,
        admin,
        verificationLinks,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    }
  } finally {
    await database.$disconnect();
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof DemoSeedError
        ? error.message
        : `Demo seed failed (${error instanceof Error ? error.name : "unknown error"})`,
    );
    process.exitCode = 1;
  }
}
