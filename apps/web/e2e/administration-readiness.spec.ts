import {
  expect,
  test,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import type { z } from "zod";
import {
  successEnvelopeSchema,
  errorEnvelopeSchema,
  catalogDataSchema,
  catalogQuoteDataSchema,
  customerCommandDataSchema,
  salesOrderCommandDataSchema,
  approvalCommandDataSchema,
  manufacturingOrderDataSchema,
  manufacturingCommandDataSchema,
  manufacturingCommandBodySchema,
  type ManufacturingDepartment,
  type ManufacturingCommandBody,
  type SalesOrderType,
  qualityOrderDataSchema,
  qualityCommandDataSchema,
  qualityCommandBodySchema,
  warehouseOrderDataSchema,
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  type WarehouseOrderData,
} from "@template/contracts";
import {
  readE2eRuntime,
  waitForCapturedAction,
  type E2eRuntimeIdentity,
} from "./runtime";

import { P08_ROUTE_CASES } from "./p08-route-cases";
import { readdir, readFile, mkdtemp, chmod, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  administrationOrderDataSchema,
  administrationCommandDataSchema,
  administrationReportPrintDataSchema,
} from "@template/contracts";

import {
  P08_ACTION_CASES,
  P08_UNREACHED_ALTERNATIVES,
} from "./p08-route-cases";
import { administrationCommandBodySchema } from "@template/contracts";

import {
  administrationReportDataSchema,
  administrationDashboardDataSchema,
  administrationOrdersDataSchema,
  administrationApprovalsDataSchema,
  administrationActivityDataSchema,
} from "@template/contracts";
import {
  initialSnapshot,
  storageKey,
} from "../src/features/prototype/state/mvp-selectors";
import { snapshotSchema } from "../src/features/prototype/state/mvp-snapshot-schema";

test.use({ actionTimeout: 15_000 });
type StaffDepartment = ManufacturingDepartment | "QUALITY" | "WAREHOUSE";
type Session = Readonly<{
  page: Page;
  context: BrowserContext;
  headers: Record<string, string>;
  email: string;
}>;
const api = (path: string) => `${readE2eRuntime().apiOrigin}/api/v1${path}`;
const goto = async (page: Page, path: string) => {
  await page.goto(`${readE2eRuntime().webOrigin}${path}`);
  if (!path.startsWith("/auth/"))
    await expect(page.locator(".oriental-logout-btn")).toHaveCount(1);
};
const responseFor = (page: Page, path: string, method = "POST") =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1${path}` &&
      response.request().method() === method,
  );
const dataFrom = async <T>(
  response: Response | APIResponse,
  schema: z.ZodType<T>,
): Promise<T> => {
  const raw: unknown = await response.json();
  if (!response.ok()) {
    const failure = errorEnvelopeSchema.parse(raw);
    throw new Error(
      `P08 HTTP ${String(response.status())} ${failure.code} fields:${(failure.errors ?? []).map((issue) => issue.field).join(",")}`,
    );
  }
  return schema.parse(successEnvelopeSchema.parse(raw).data);
};
type SessionCookies = Awaited<ReturnType<BrowserContext["cookies"]>>;
// Synthetic fixture identities/cookies stay in this worker's memory only.
// Every context/QueryClient is fresh; no cookies or operational state are written to disk.
type WorkerIdentity = Pick<E2eRuntimeIdentity, "email" | "password">;
const fixtureSessionCookies = new Map<string, SessionCookies>();
const departmentColleagues = new Map<StaffDepartment, WorkerIdentity[]>();
test.afterAll(() => {
  fixtureSessionCookies.clear();
  departmentColleagues.clear();
});
const signIn = async (
  browser: Browser,
  identity: Pick<E2eRuntimeIdentity, "email" | "password">,
  viewport: { width: number; height: number } | null,
  cookies?: SessionCookies,
): Promise<Session> => {
  const context = await browser.newContext({
    ...(viewport === null ? {} : { viewport }),
    ...(cookies ? { storageState: { cookies, origins: [] } } : {}),
  });
  try {
    const page = await context.newPage();
    const identityRead = () =>
      page.waitForRequest(
        async (request) =>
          new URL(request.url()).pathname === "/api/v1/users/me" &&
          (await request.headerValue("authorization")) !== null,
      );
    let authorization: string | null;
    if (cookies) {
      const [observed] = await Promise.all([
        identityRead(),
        goto(page, "/auth/login"),
      ]);
      await expect(page).not.toHaveURL(/\/auth\/login$/u);
      authorization = await observed.headerValue("authorization");
    } else {
      await goto(page, "/auth/login");
      await page
        .getByLabel("البريد الإلكتروني", { exact: true })
        .fill(identity.email);
      await page
        .getByLabel("كلمة المرور", { exact: true })
        .fill(identity.password);
      await page
        .getByRole("button", { name: "تسجيل الدخول", exact: true })
        .click();
      await expect(page).not.toHaveURL(/\/auth\/login$/u);
      await expect(page.locator(".oriental-logout-btn")).toHaveCount(1);
      const [observed] = await Promise.all([identityRead(), page.reload()]);
      authorization = await observed.headerValue("authorization");
    }
    await expect(page.locator(".oriental-logout-btn")).toHaveCount(1);
    const csrf = (await context.cookies(readE2eRuntime().apiOrigin)).find(
      (cookie) => cookie.name === "csrfToken",
    );
    if (authorization === null || csrf === undefined)
      throw new Error("P08 owned session observation failed");
    return {
      page,
      context,
      email: identity.email,
      headers: { authorization, "x-csrf-token": csrf.value },
    };
  } catch (error: unknown) {
    await context.close();
    throw error;
  }
};
const mutationHeaders = async (session: Session) => {
  const csrf = (await session.context.cookies(readE2eRuntime().apiOrigin)).find(
    (cookie) => cookie.name === "csrfToken",
  );
  if (!csrf) throw new Error("Owned CSRF cookie missing");
  return { ...session.headers, "x-csrf-token": csrf.value };
};

// Every context belongs to the current test and closes even after a failed assertion.
const scenario = async (
  browser: Browser,
  project: string,
  viewport: { width: number; height: number } | null,
) => {
  const owned: BrowserContext[] = [];
  const fixture = readE2eRuntime().p04ByProject[project];
  if (!fixture) throw new Error("P08 project fixture missing");
  const fixtureEmails = new Set([
    readE2eRuntime().admin.email,
    fixture.sales.email,
    fixture.approver.email,
  ]);
  const fixtureSessions: Session[] = [];
  const login = async (
    identity: Pick<E2eRuntimeIdentity, "email" | "password">,
  ) => {
    const reusable = fixtureEmails.has(identity.email);
    const session = await signIn(
      browser,
      identity,
      viewport,
      reusable ? fixtureSessionCookies.get(identity.email) : undefined,
    );
    owned.push(session.context);
    if (reusable) fixtureSessions.push(session);
    return session;
  };
  try {
    const admin = await login(readE2eRuntime().admin);
    const sales = await login(fixture.sales);
    const approver = await login(fixture.approver);
    const registerWorker = async (
      department: StaffDepartment,
    ): Promise<WorkerIdentity> => {
      const context = await browser.newContext(
        viewport === null ? {} : { viewport },
      );
      owned.push(context);
      const page = await context.newPage();
      const email = `p08.${crypto.randomUUID()}@p08-e2e.test`;
      const password = "P08!SyntheticWorker2026";
      await goto(page, "/auth/register");
      await page
        .getByLabel("الاسم الكامل")
        .fill(`P08 ${department} ${email.slice(4, 12)}`);
      await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
      await page.getByLabel(/^كلمة المرور/u).fill(password);
      await page.getByRole("button", { name: "طلب تسجيل الحساب" }).click();
      await expect(
        page.getByRole("heading", { name: "تحقق من بريدك الإلكتروني" }),
      ).toBeVisible();
      await page.goto(await waitForCapturedAction(email, "verification"));
      await expect(
        page.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
      ).toBeVisible();
      await goto(admin.page, "/admin/users");
      await admin.page
        .getByPlaceholder("ابحث بالاسم، البريد أو رقم الهاتف...")
        .fill(email);
      const row = admin.page
        .getByRole("row")
        .filter({ has: admin.page.getByText(email, { exact: true }) });
      await row.locator("[data-staff-row-action]").click();
      const dialog = admin.page.getByRole("dialog");
      await dialog.locator("[data-staff-department]").selectOption(department);
      await dialog.getByRole("button", { name: "اعتماد وتعيين القسم" }).click();
      await expect(dialog).toBeHidden();
      await context.close();
      owned.splice(owned.indexOf(context), 1);
      return { email, password };
    };
    const claimedColleagues = new Map<StaffDepartment, number>();
    const worker = async (department: StaffDepartment) => {
      const index = claimedColleagues.get(department) ?? 0;
      claimedColleagues.set(department, index + 1);
      const colleagues = departmentColleagues.get(department) ?? [];
      let identity = colleagues[index];
      if (!identity) {
        identity = await registerWorker(department);
        colleagues.push(identity);
        departmentColleagues.set(department, colleagues);
      }
      fixtureEmails.add(identity.email);
      return login(identity);
    };
    const isolatedWorker = async (department: StaffDepartment) =>
      login(await registerWorker(department));
    return {
      admin,
      sales,
      approver,
      worker,
      isolatedWorker,
      close: async () => {
        try {
          for (const session of fixtureSessions) {
            const cookies = (await session.context.cookies()).filter(
              (cookie) =>
                cookie.name === "refreshToken" || cookie.name === "csrfToken",
            );
            if (
              !cookies.some((cookie) => cookie.name === "refreshToken") ||
              !cookies.some((cookie) => cookie.name === "csrfToken")
            )
              throw new Error("P08 fixture auth cookies missing");
            fixtureSessionCookies.set(session.email, cookies);
          }
        } finally {
          await Promise.all(owned.map((context) => context.close()));
        }
      },
    };
  } catch (error: unknown) {
    await Promise.all(owned.map((context) => context.close()));
    throw error;
  }
};
const readOrder = async (
  session: Session,
  department: ManufacturingDepartment,
  id: string,
) =>
  dataFrom(
    await session.page.request.get(
      api(`/manufacturing/${department.toLowerCase()}/orders/${id}`),
      { headers: session.headers },
    ),
    manufacturingOrderDataSchema,
  );
const post = async (session: Session, path: string, data: unknown) =>
  session.page.request.post(api(path), {
    headers: await mutationHeaders(session),
    data,
  });
const createOrder = async (
  sales: Session,
  approver: Session,
  type: SalesOrderType = "SHOP",
  quantity = 3,
) => {
  const catalog = await dataFrom(
    await sales.page.request.get(api("/catalogs"), { headers: sales.headers }),
    catalogDataSchema,
  );
  if (catalog.availability !== "available")
    throw new Error("Synthetic catalog unavailable");
  const decoration = catalog.entries.find(
    (entry) =>
      entry.kind === "decoration" && entry.displayValue === "زبيري - z",
  );
  const model = catalog.entries.find((entry) => entry.kind === "model");
  const base = catalog.entries.find((entry) => entry.kind === "leatherBase");
  if (!decoration || !model || !base)
    throw new Error("Synthetic catalog entries missing");
  const customer = (
    await dataFrom(
      await post(sales, "/customers", {
        commandId: crypto.randomUUID(),
        customer: {
          name: "P08 owned browser customer",
          phone: `050${String(Date.now()).slice(-7)}`,
          address: "P08 private address",
          email: "private.customer@p08-e2e.test",
        },
      }),
      customerCommandDataSchema,
    )
  ).savedCustomer;
  const pieces = Array.from({ length: quantity }, () => ({
    id: crypto.randomUUID(),
    model: model.displayValue,
    size: "40",
    leatherBase: base.displayValue,
    decoration: decoration.displayValue,
    face: "P08 retained face",
    catalogSelections: { decoration: decoration.id },
  }));
  const quote = await dataFrom(
    await post(sales, "/catalogs/quotes", {
      requestId: crypto.randomUUID(),
      pieces: pieces.map((piece) => ({
        id: piece.id,
        decoration: piece.decoration,
        catalogSelections: piece.catalogSelections,
      })),
    }),
    catalogQuoteDataSchema,
  );
  if (quote.availability !== "available")
    throw new Error("Synthetic quote unavailable");
  const order = (
    await dataFrom(
      await post(sales, "/sales-orders", {
        origin: "new",
        commandId: crypto.randomUUID(),
        expectedCustomerVersion: customer.version,
        capture: {
          type,
          customerId: customer.id,
          deliveryDate: "2026-12-01",
          paidAmount: "0.00",
          pieces,
        },
        reviewedQuote: {
          sourceId: quote.sourceId,
          fingerprint: quote.fingerprint,
        },
      }),
      salesOrderCommandDataSchema,
    )
  ).savedOrder;
  await goto(approver.page, `/approval/orders/${order.id}`);
  const approval = responseFor(
    approver.page,
    `/approvals/orders/${order.id}/approve`,
  );
  await approver.page
    .getByRole("button", { name: "اعتماد أمر التفصيل", exact: true })
    .click();
  await dataFrom(await approval, approvalCommandDataSchema);
  return order;
};
const command = async (
  session: Session,
  department: ManufacturingDepartment,
  id: string,
  operation: ManufacturingCommandBody["operation"],
  pieceIds: readonly string[],
) => {
  const detail = await readOrder(session, department, id);
  const body = manufacturingCommandBodySchema.parse({
    commandId: crypto.randomUUID(),
    operation,
    orders: [
      { orderId: id, expectedVersion: detail.paper.order.version, pieceIds },
    ],
  });
  return dataFrom(
    await post(
      session,
      `/manufacturing/${department.toLowerCase()}/commands`,
      body,
    ),
    manufacturingCommandDataSchema,
  );
};

const qualityOrder = async (session: Session, id: string) =>
  dataFrom(
    await session.page.request.get(api(`/quality/orders/${id}`), {
      headers: session.headers,
    }),
    qualityOrderDataSchema,
  );
const warehouseOrder = async (session: Session, id: string) =>
  dataFrom(
    await session.page.request.get(api(`/warehouse/orders/${id}`), {
      headers: session.headers,
    }),
    warehouseOrderDataSchema,
  );
const handoff = async (
  run: Awaited<ReturnType<typeof scenario>>,
  orderId: string,
  pieceIds: readonly string[],
  packing: Readonly<{
    cartonCount: string;
    cartonNumbers: string;
  }> | null = null,
) => {
  for (const department of ["CUTTING", "PRODUCTION"] as const) {
    await command(
      run.admin,
      department,
      orderId,
      "RECEIVE_AND_START",
      pieceIds,
    );
    await command(
      run.admin,
      department,
      orderId,
      "COMPLETE_TRANSFER",
      pieceIds,
    );
  }
  let detail = await qualityOrder(run.admin, orderId);
  await dataFrom(
    await post(
      run.admin,
      "/quality/commands",
      qualityCommandBodySchema.parse({
        commandId: crypto.randomUUID(),
        operation: "RECEIVE_AND_START",
        orders: [
          { orderId, expectedVersion: detail.paper.order.version, pieceIds },
        ],
      }),
    ),
    qualityCommandDataSchema,
  );
  detail = await qualityOrder(run.admin, orderId);
  return dataFrom(
    await post(
      run.admin,
      "/quality/commands",
      qualityCommandBodySchema.parse({
        commandId: crypto.randomUUID(),
        operation: "INSPECT",
        orders: [
          {
            orderId,
            expectedVersion: detail.paper.order.version,
            decisions: pieceIds.map((pieceId) => ({
              pieceId,
              decision: "ACCEPT",
            })),
            packing,
          },
        ],
      }),
    ),
    qualityCommandDataSchema,
  );
};

const sourcePages = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? sourcePages(path)
        : entry.name === "page.tsx"
          ? [path]
          : [];
    }),
  );
  return pages.flat();
};
const repository = resolve(import.meta.dirname, "../../..");
const normalizedRoute = (path: string) =>
  "/" +
  path
    .replace(/^apps\/web\/src\/app\//u, "")
    .replace(/(?:^|\/)\([^/]+\)/gu, "")
    .replace(/(?:^|\/)page\.tsx$/u, "")
    .replace(/^\//u, "");

test("P08 route inventory equals current source and protected roadmap URL sets", async () => {
  const paths = (
    await sourcePages(resolve(repository, "apps/web/src/app"))
  ).map((path) => path.slice(repository.length + 1));
  expect(P08_ROUTE_CASES.map((item) => item.sourcePage).toSorted()).toEqual(
    paths.toSorted(),
  );
  const routes = P08_ROUTE_CASES.map((item) => item.routePattern);
  expect(new Set(routes).size).toBe(routes.length);
  expect(new Set(P08_ROUTE_CASES.map((item) => item.scenarioKey)).size).toBe(
    routes.length,
  );
  for (const item of P08_ROUTE_CASES)
    expect(normalizedRoute(item.sourcePage)).toBe(item.routePattern);
  const roadmap = await readFile(resolve(repository, "plan.md"), "utf8");
  const appendix = roadmap
    .split("## Appendix A.")[1]
    ?.split("## Appendix B.")[0];
  expect(appendix).toBeDefined();
  const inventory = [
    ...(appendix ?? "").matchAll(/^\|\s*`([^`]+)`\s*\|/gmu),
  ].map((match) => match[1]);
  expect(routes.toSorted()).toEqual(inventory.toSorted());
});

const adminDetail = async (session: Session, orderId: string) =>
  dataFrom(
    await session.page.request.get(api(`/administration/orders/${orderId}`), {
      headers: session.headers,
    }),
    administrationOrderDataSchema,
  );
const warehouseWrite = async (session: Session, body: unknown) =>
  dataFrom(
    await post(
      session,
      "/warehouse/commands",
      warehouseCommandBodySchema.parse(body),
    ),
    warehouseCommandDataSchema,
  );
const administrationWrite = async (session: Session, body: unknown) =>
  dataFrom(
    await post(session, "/administration/commands", body),
    administrationCommandDataSchema,
  );
const warehouseSelection = (
  detail: WarehouseOrderData,
  orderId: string,
  pieceIds: readonly string[],
) => ({
  orderId,
  expectedVersion: detail.summary.version,
  pieceIds,
});

test("P08 seven types cross real cutting production quality receipt and whole-order delivery", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(600_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const cutting = await run.worker("CUTTING"),
      production = await run.worker("PRODUCTION"),
      quality = await run.worker("QUALITY"),
      warehouse = await run.worker("WAREHOUSE");
    for (const type of [
      "SHOP",
      "EXTERNAL",
      "REPAIR",
      "GIFT",
      "READY",
      "ACCESSORY",
      "ADJUSTMENT",
    ] as const) {
      const order = await createOrder(run.sales, run.approver, type, 2);
      const ids = order.pieces.map((piece) => piece.id).toSorted();
      for (const [department, worker] of [
        ["CUTTING", cutting],
        ["PRODUCTION", production],
      ] as const) {
        await command(worker, department, order.id, "RECEIVE_AND_START", ids);
        await command(worker, department, order.id, "COMPLETE_TRANSFER", ids);
      }
      let current = await qualityOrder(quality, order.id);
      await dataFrom(
        await post(quality, "/quality/commands", {
          commandId: crypto.randomUUID(),
          operation: "RECEIVE_AND_START",
          orders: [
            {
              orderId: order.id,
              expectedVersion: current.paper.order.version,
              pieceIds: ids,
            },
          ],
        }),
        qualityCommandDataSchema,
      );
      current = await qualityOrder(quality, order.id);
      await dataFrom(
        await post(quality, "/quality/commands", {
          commandId: crypto.randomUUID(),
          operation: "INSPECT",
          orders: [
            {
              orderId: order.id,
              expectedVersion: current.paper.order.version,
              decisions: ids.map((pieceId) => ({
                pieceId,
                decision: "ACCEPT",
              })),
              packing: { cartonCount: "2", cartonNumbers: `P08-${type}` },
            },
          ],
        }),
        qualityCommandDataSchema,
      );
      let delivery = await warehouseOrder(warehouse, order.id);
      expect(delivery.summary.counts.received).toBe(0);
      for (const [index, pieceId] of ids.entries()) {
        await warehouseWrite(warehouse, {
          commandId: crypto.randomUUID(),
          operation: "RECEIVE",
          orders: [
            {
              ...warehouseSelection(delivery, order.id, [pieceId]),
              receipt: {
                cartonCount: "1",
                storageLocation: "P08 owned shelf",
                notes: null,
              },
            },
          ],
        });
        delivery = await warehouseOrder(warehouse, order.id);
        expect(delivery.summary.counts.received).toBe(index + 1);
        expect(delivery.summary.allowedActions.canDispatch).toBe(
          index === ids.length - 1,
        );
      }
      await goto(warehouse.page, `/warehouse/orders/${order.id}`);
      await expect(warehouse.page.locator("main")).toContainText(
        order.businessNumber,
      );
      await warehouseWrite(warehouse, {
        commandId: crypto.randomUUID(),
        operation: "DISPATCH",
        orders: [
          {
            ...warehouseSelection(delivery, order.id, ids),
            deliveryNote: `P08 ${type} whole delivery`,
          },
        ],
      });
      delivery = await warehouseOrder(warehouse, order.id);
      expect(delivery.summary.status).toBe("OUT_FOR_DELIVERY");
      expect(delivery.currentAttempt?.pieceIds).toEqual(ids);
      const attemptId = delivery.currentAttempt?.id;
      expect(attemptId).toBeDefined();
      await warehouseWrite(warehouse, {
        commandId: crypto.randomUUID(),
        operation: "CONFIRM_DELIVERY",
        orders: [
          {
            ...warehouseSelection(delivery, order.id, ids),
            attemptId,
            recipient: "P08 owned recipient",
            deliveredAt: null,
            notes: "P08 confirmed",
          },
        ],
      });
      delivery = await warehouseOrder(warehouse, order.id);
      expect(delivery.summary.status).toBe("DELIVERED");
      expect(delivery.currentAttempt?.status).toBe("DELIVERED");
      await goto(run.admin.page, `/admin/orders/${order.id}`);
      await expect(run.admin.page.locator("main")).toContainText(
        order.businessNumber,
      );
      const persisted = await adminDetail(run.admin, order.id);
      expect(persisted.kind).toBe("submitted");
      if (persisted.kind !== "submitted")
        throw new Error("Submitted P08 order required");
      expect(persisted.order.status).toBe("DELIVERED");
      expect(persisted.order.type).toBe(type);
    }
  } finally {
    await run.close();
  }
});

const anonymousLogin = async (
  page: Page,
  identity: Pick<E2eRuntimeIdentity, "email" | "password">,
) => {
  await page.goto(`${readE2eRuntime().webOrigin}/auth/login`);
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill(identity.email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
};
const restrictedIdentity = async (
  browser: Browser,
  admin: Session,
  state: "pending-approval" | "rejected",
) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const identity = {
      email: `p08.${crypto.randomUUID()}@p08-e2e.test`,
      password: "P08!Restricted2026",
    };
    await page.goto(`${readE2eRuntime().webOrigin}/auth/register`);
    await page.getByLabel("الاسم الكامل").fill("P08 restricted owned identity");
    await page
      .getByLabel("البريد الإلكتروني", { exact: true })
      .fill(identity.email);
    await page.getByLabel(/^كلمة المرور/u).fill(identity.password);
    await page.getByRole("button", { name: "طلب تسجيل الحساب" }).click();
    await expect(
      page.getByRole("heading", { name: "تحقق من بريدك الإلكتروني" }),
    ).toBeVisible();
    await page.goto(
      await waitForCapturedAction(identity.email, "verification"),
    );
    await expect(
      page.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
    ).toBeVisible();
    if (state === "rejected") {
      await goto(admin.page, "/admin/users");
      await admin.page
        .getByPlaceholder("ابحث بالاسم، البريد أو رقم الهاتف...")
        .fill(identity.email);
      await admin.page
        .getByRole("row")
        .filter({ hasText: identity.email })
        .locator("[data-staff-row-action]")
        .click();
      await admin.page
        .getByRole("dialog")
        .getByRole("button", { name: "رفض", exact: true })
        .click();
      await expect(admin.page.getByRole("dialog")).toBeHidden();
    }
    await anonymousLogin(page, identity);
    await expect(page).toHaveURL(new RegExp(`/auth/${state}$`, "u"));
    return { context, page };
  } catch (error: unknown) {
    await context.close();
    throw error;
  }
};

test("P08 every route case renders in its admitted context with exact redirects and production isolation", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(600_000);
  const run = await scenario(browser, info.project.name, viewport);
  const extra: BrowserContext[] = [];
  try {
    const owned = await createOrder(run.sales, run.approver);
    await handoff(
      run,
      owned.id,
      owned.pieces.map((piece) => piece.id),
    );
    expect(
      (await warehouseOrder(run.admin, owned.id)).summary.counts.active,
    ).toBe(owned.pieces.length);
    const roles = {
      "eligible-admin": run.admin,
      "eligible-sales-owner": run.sales,
      "eligible-approval": run.approver,
      "eligible-cutting": await run.worker("CUTTING"),
      "eligible-production": await run.worker("PRODUCTION"),
      "eligible-quality": await run.worker("QUALITY"),
      "eligible-warehouse": await run.worker("WAREHOUSE"),
    };
    const p03 = readE2eRuntime().p03ByProject[info.project.name];
    if (!p03) throw new Error("P08 exact returned fixture required");
    const returnedSales = await signIn(browser, p03.sales, viewport);
    extra.push(returnedSales.context);
    const anonymous = await browser.newContext(
      viewport === null ? {} : { viewport },
    );
    extra.push(anonymous);
    const anonymousPage = await anonymous.newPage();
    const pending = await restrictedIdentity(
      browser,
      run.admin,
      "pending-approval",
    );
    extra.push(pending.context);
    const rejected = await restrictedIdentity(browser, run.admin, "rejected");
    extra.push(rejected.context);
    const suspended = await browser.newContext();
    extra.push(suspended);
    const suspendedPage = await suspended.newPage();
    const legacy = readE2eRuntime().legacyStaffByProject[info.project.name];
    if (!legacy) throw new Error("P08 exact suspended fixture required");
    await anonymousLogin(suspendedPage, legacy);
    await expect(suspendedPage).toHaveURL(/\/auth\/suspended$/u);
    for (const item of P08_ROUTE_CASES) {
      await test.step(item.scenarioKey, async () => {
        const path = item.routePattern
          .replace(
            "[orderId]",
            item.fixtureKey === "returned-order"
              ? p03.returnedOrderId
              : owned.id,
          )
          .replace("[phone]", encodeURIComponent(owned.customerSnapshot.phone));
        const page =
          item.allowedContext === "anonymous"
            ? anonymousPage
            : item.allowedContext === "credential-valid-restricted"
              ? item.fixtureKey === "pending-approval"
                ? pending.page
                : item.fixtureKey === "rejected"
                  ? rejected.page
                  : suspendedPage
              : item.fixtureKey === "returned-order"
                ? returnedSales.page
                : roles[item.allowedContext].page;
        const response = await page.goto(
          `${readE2eRuntime().webOrigin}${path}`,
        );
        if (item.kind === "development-only") {
          expect([200, 404]).toContain(response?.status());
          await expect(
            page.getByRole("heading", {
              name: "This route does not exist.",
              exact: true,
            }),
          ).toBeVisible();
          await expect
            .poll(() =>
              page.locator('meta[name="robots"][content~="noindex"]').count(),
            )
            .toBeGreaterThan(0);
          await expect(page.locator(".oriental-logout-btn")).toHaveCount(0);
        } else {
          const destination = (item.expectedDestination ?? path).replace(
            "[orderId]",
            owned.id,
          );
          await expect
            .poll(() => new URL(page.url()).pathname)
            .toBe(destination);
          await expect(page.getByRole("heading").first()).toBeVisible();
          if (path.startsWith("/orders/") || path.startsWith("/print/order/"))
            await expect(
              page.locator('[data-official-paper="true"]'),
            ).toBeVisible();
          if (path === "/reports/print")
            await expect(page.locator(".a4-sheet")).toBeVisible();
          if (path === "/unauthorized")
            await expect(
              page.getByRole("button", {
                name: "العودة لمساحة عملي المعتمدة",
                exact: true,
              }),
            ).toBeVisible();
          expect(response?.status()).toBeLessThan(400);
          await expect(
            page.getByText("Application error", { exact: false }),
          ).toHaveCount(0);
          if (
            item.allowedContext.startsWith("eligible-") &&
            !path.includes("/print") &&
            path !== "/unauthorized"
          )
            await expect(page.locator(".oriental-logout-btn")).toHaveCount(1);
        }
      });
    }
    for (const path of [
      "/admin/orders",
      "/admin/reports",
      `/admin/orders/${owned.id}`,
      "/reports/print",
    ]) {
      await run.sales.page.goto(`${readE2eRuntime().webOrigin}${path}`);
      await expect(run.sales.page).toHaveURL(/\/unauthorized(?:\?|$)/u);
      await expect(
        run.sales.page.getByText(owned.businessNumber, { exact: true }),
      ).toHaveCount(0);
    }
    for (const path of [
      "/administration/dashboard",
      `/administration/orders/${owned.id}`,
      "/administration/reports/print",
    ]) {
      const denied = await run.sales.page.request.get(api(path), {
        headers: run.sales.headers,
      });
      expect(denied.status()).toBe(403);
      expect(errorEnvelopeSchema.parse(await denied.json()).code).toBe(
        "FORBIDDEN",
      );
    }
  } finally {
    await Promise.all(extra.map((context) => context.close()));
    await run.close();
  }
});

const submitted = async (session: Session, id: string) => {
  const detail = await adminDetail(session, id);
  if (detail.kind !== "submitted")
    throw new Error("P08 submitted fixture required");
  return detail;
};
const closeConfirmation = async (session: Session) => {
  const close = session.page.getByRole("button", {
    name: "إغلاق التأكيد",
    exact: true,
  });
  await expect(close).toBeVisible();
  await close.click();
};
const correctThroughDialog = async (
  session: Session,
  id: string,
  address: string,
) => {
  await goto(session.page, `/admin/orders/${id}`);
  await session.page
    .getByRole("button", { name: "تصحيح بيانات أمر التفصيل", exact: true })
    .click();
  const dialog = session.page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /^عنوان التسليم:/u }).fill(address);
  await dialog
    .getByRole("textbox", { name: /^سبب التصحيح \(إلزامي\):/u })
    .fill("P08 exact address correction");
  const saved = responseFor(session.page, "/administration/commands");
  await dialog
    .getByRole("button", { name: "حفظ التصحيح", exact: true })
    .click();
  await dataFrom(await saved, administrationCommandDataSchema);
  await expect(dialog).toBeHidden();
  await closeConfirmation(session);
};
const cancelThroughDialog = async (
  session: Session,
  id: string,
  scope: "ORDER" | "ITEM" | "QUANTITY",
  ids: readonly string[],
) => {
  await goto(session.page, `/admin/orders/${id}`);
  await session.page
    .getByRole("button", { name: "إلغاء كمية إدارياً", exact: true })
    .click();
  const dialog = session.page.getByRole("dialog");
  await dialog
    .getByRole("button", {
      name:
        scope === "ORDER"
          ? "كامل أمر التفصيل"
          : scope === "ITEM"
            ? "بند كامل"
            : "قطع محددة",
      exact: true,
    })
    .click();
  if (scope === "ITEM")
    await dialog.getByLabel("البند المستهدف").selectOption(ids[0] ?? "");
  if (scope === "QUANTITY")
    for (const id of ids)
      await dialog
        .locator("label")
        .filter({ hasText: id })
        .getByRole("checkbox")
        .check();
  await dialog
    .getByLabel("سبب الإلغاء الإداري (اختياري):")
    .fill("P08 exact retained cancellation");
  const saved = responseFor(session.page, "/administration/commands");
  await dialog
    .getByRole("button", {
      name: `تأكيد إلغاء ${String(ids.length)} قطعة`,
      exact: true,
    })
    .click();
  const result = await dataFrom(await saved, administrationCommandDataSchema);
  await expect(dialog).toBeHidden();
  await closeConfirmation(session);
  return result;
};

test("P08 exact cancellation scopes retain paid and audit while terminal correction never rewinds work", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(300_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const order = await createOrder(run.sales, run.approver, "SHOP", 3);
    const obsolete = snapshotSchema.parse(initialSnapshot());
    const fixtureOrder = obsolete.orders[0];
    if (!fixtureOrder)
      throw new Error("P08 valid legacy snapshot fixture required");
    obsolete.orders = [
      {
        ...fixtureOrder,
        id: order.id,
        customer: "P08 obsolete local only",
        warehouse: 777,
        status: "تم التسليم",
      },
    ];
    obsolete.sessionRole = "warehouse";
    const legacy = JSON.stringify(snapshotSchema.parse(obsolete));
    await run.admin.page.evaluate(
      ({ key, serialized }) => {
        localStorage.setItem(key, serialized);
      },
      { key: storageKey, serialized: legacy },
    );
    const paidAmount = order.money.total;
    const paidCents = BigInt(paidAmount.replace(".", ""));
    expect(paidCents).toBeGreaterThan(0n);
    await dataFrom(
      await run.sales.page.request.patch(
        api(`/sales-orders/${order.id}/paid`),
        {
          headers: await mutationHeaders(run.sales),
          data: {
            commandId: crypto.randomUUID(),
            expectedVersion: (await submitted(run.admin, order.id)).order
              .version,
            paidAmount,
          },
        },
      ),
      salesOrderCommandDataSchema,
    );
    let current = await submitted(run.admin, order.id);
    const original = current.order.customerSnapshot;
    await correctThroughDialog(
      run.admin,
      order.id,
      "P08 corrected live address",
    );
    current = await submitted(run.admin, order.id);
    expect(current.order.status).toBe("APPROVED");
    expect(current.order.customerSnapshot.address).toBe(
      "P08 corrected live address",
    );
    expect(current.order.money.paidAmount).toBe(paidAmount);
    const one = order.pieces[0]?.id,
      two = order.pieces[1]?.id;
    if (!one || !two) throw new Error("P08 physical pieces required");
    await cancelThroughDialog(run.admin, order.id, "QUANTITY", [one]);
    current = await submitted(run.admin, order.id);
    expect(current.order.counts).toMatchObject({
      original: 3,
      active: 2,
      cancelled: 1,
    });
    expect(current.order.money).toMatchObject({
      paidAmount,
      remainingDue: "0.00",
    });
    expect(BigInt(current.order.money.surplus.replace(".", ""))).toBe(
      paidCents - BigInt(current.order.money.total.replace(".", "")),
    );
    const beforeInvalid = current.order;
    const invalid = await post(run.admin, "/administration/commands", {
      commandId: crypto.randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: order.id,
      expectedVersion: current.order.version,
      scope: "QUANTITY",
      pieceIds: [one, two],
      reason: "P08 invalid mixed action",
    });
    expect(invalid.status()).toBe(409);
    expect((await submitted(run.admin, order.id)).order).toEqual(beforeInvalid);
    await cancelThroughDialog(run.admin, order.id, "ITEM", [two]);
    current = await submitted(run.admin, order.id);
    const remaining = current.order.pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .map((piece) => piece.id);
    await cancelThroughDialog(run.admin, order.id, "ORDER", remaining);
    current = await submitted(run.admin, order.id);
    expect(current.order.status).toBe("CANCELLED");
    expect(current.order.counts).toMatchObject({
      original: 3,
      active: 0,
      cancelled: 3,
    });
    expect(current.order.money).toMatchObject({
      total: "0.00",
      paidAmount,
      surplus: paidAmount,
    });
    await correctThroughDialog(
      run.admin,
      order.id,
      "P08 corrected fully cancelled address",
    );
    const terminal = await submitted(run.admin, order.id);
    expect(terminal.order.status).toBe("CANCELLED");
    expect(terminal.order.pieces).toEqual(current.order.pieces);
    expect(terminal.order.money).toEqual(current.order.money);
    expect(
      await run.admin.page.evaluate(
        (key) => localStorage.getItem(key),
        storageKey,
      ),
    ).toBe(legacy);
    await expect(run.admin.page.locator("main")).not.toContainText(
      "P08 obsolete local only",
    );
    expect(original.address).not.toBe(terminal.order.customerSnapshot.address);
    const other = await signIn(browser, readE2eRuntime().admin, viewport);
    try {
      await goto(other.page, `/admin/orders/${order.id}`);
      await other.page
        .getByRole("button", { name: "تصحيح بيانات أمر التفصيل", exact: true })
        .click();
      await expect(
        other.page
          .getByRole("dialog")
          .getByRole("textbox", { name: /^عنوان التسليم:/u }),
      ).toHaveValue("P08 corrected fully cancelled address");
      await other.page
        .getByRole("dialog")
        .getByRole("button", { name: "إلغاء", exact: true })
        .click();
      expect((await submitted(other, order.id)).order).toEqual(terminal.order);
    } finally {
      await other.context.close();
    }
    const forbidden = await post(run.admin, "/administration/commands", {
      commandId: crypto.randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: order.id,
      expectedVersion: terminal.order.version,
      patch: { paidAmount: "0.00" },
      reason: "P08 forbidden money patch",
    });
    expect(forbidden.status()).toBe(400);
    expect((await submitted(run.admin, order.id)).order).toEqual(
      terminal.order,
    );
  } finally {
    await run.close();
  }
});

test("P08 Appendix B actions retain exact current callers and named browser evidence owners", async () => {
  const roadmap = await readFile(resolve(repository, "plan.md"), "utf8");
  const appendix = roadmap
    .split("## Appendix B.")[1]
    ?.split("## Appendix C.")[0];
  if (!appendix) throw new Error("P08 action appendix missing");
  const rows = appendix
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => line.split("|")[1]?.trim());
  expect(P08_ACTION_CASES.map((item) => item.roadmapEntry)).toEqual(rows);
  for (const item of P08_ACTION_CASES) {
    for (const caller of item.callers)
      expect(
        (await readFile(resolve(repository, caller), "utf8")).length,
      ).toBeGreaterThan(0);
    for (const evidence of item.evidence) {
      const suite = await readFile(resolve(repository, evidence.owner), "utf8");
      expect(suite).toContain(
        "sourceWitness" in evidence
          ? evidence.sourceWitness
          : JSON.stringify(evidence.scenarioKey),
      );
    }
  }
  const sources = await Promise.all(
    (await sourceFiles(resolve(repository, "apps/web/src"))).map(
      async (path) => ({ path, text: await readFile(path, "utf8") }),
    ),
  );
  for (const name of P08_UNREACHED_ALTERNATIVES) {
    const callers = sources.filter((source) =>
      new RegExp(String.raw`<${name}(?=[\s/>])`, "u").test(source.text),
    );
    expect(callers, `${name} must remain an unreached alternative`).toEqual([]);
  }
});
const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? sourceFiles(path)
          : /\.tsx?$/u.test(entry.name) && !entry.name.includes(".test.")
            ? [path]
            : [];
      }),
    )
  ).flat();
};

test("P08 committed lost reply survives close and observes original intent without repost", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(180_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const order = await createOrder(run.sales, run.approver);
    const before = await submitted(run.admin, order.id);
    await goto(run.admin.page, `/admin/orders/${order.id}`);
    await run.admin.page
      .getByRole("button", { name: "تصحيح بيانات أمر التفصيل", exact: true })
      .click();
    const dialog = run.admin.page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: /^عنوان التسليم:/u })
      .fill("P08 committed lost reply address");
    await dialog
      .getByRole("textbox", { name: /^سبب التصحيح \(إلزامي\):/u })
      .fill("P08 lost response boundary");
    const bodies: ReturnType<typeof administrationCommandBodySchema.parse>[] =
      [];
    await run.admin.page.route(
      "**/api/v1/administration/commands",
      async (route) => {
        bodies.push(
          administrationCommandBodySchema.parse(route.request().postDataJSON()),
        );
        const actual = await route.fetch();
        await dataFrom(actual, administrationCommandDataSchema);
        await route.abort("failed");
      },
    );
    try {
      await dialog
        .getByRole("button", { name: "حفظ التصحيح", exact: true })
        .click();
      const recovery = run.admin.page.locator(
        'section[aria-label="متابعة نتيجة الإجراء الإداري"]',
      );
      await expect(recovery).toContainText("النتيجة غير مؤكدة");
      await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(bodies).toHaveLength(1);
      const intent = bodies[0];
      if (!intent) throw new Error("P08 original intent required");
      const observation = responseFor(
        run.admin.page,
        `/administration-commands/${intent.commandId}`,
        "GET",
      );
      await recovery
        .getByRole("button", { name: "إعادة نفس الإجراء", exact: true })
        .click();
      await dataFrom(await observation, administrationCommandDataSchema);
      await expect(recovery).toContainText("تم حفظ الإجراء وتحديث البيانات");
      expect(bodies).toHaveLength(1);
      const saved = await submitted(run.admin, order.id);
      expect(saved.order.version).toBe(before.order.version + 1);
      expect(saved.order.customerSnapshot.address).toBe(
        "P08 committed lost reply address",
      );
      await closeConfirmation(run.admin);
      await run.admin.page.reload();
      await run.admin.page
        .getByRole("button", { name: "تصحيح بيانات أمر التفصيل", exact: true })
        .click();
      await expect(
        run.admin.page
          .getByRole("dialog")
          .getByRole("textbox", { name: /^عنوان التسليم:/u }),
      ).toHaveValue("P08 committed lost reply address");
      await run.admin.page
        .getByRole("dialog")
        .getByRole("button", { name: "إلغاء", exact: true })
        .click();
    } finally {
      await run.admin.page.unroute("**/api/v1/administration/commands");
    }
  } finally {
    await run.close();
  }
});

test("P08 complete report snapshot and physical portrait preserve six sections and real rows", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(240_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const longName = "N".repeat(150),
      longAddress = "A".repeat(512);
    const longOrder = await createOrder(run.sales, run.approver, "SHOP", 1);
    const pieceIds = longOrder.pieces.map((piece) => piece.id);
    for (const department of ["CUTTING", "PRODUCTION"] as const) {
      await command(
        run.admin,
        department,
        longOrder.id,
        "RECEIVE_AND_START",
        pieceIds,
      );
      await command(
        run.admin,
        department,
        longOrder.id,
        "COMPLETE_TRANSFER",
        pieceIds,
      );
    }
    let quality = await qualityOrder(run.admin, longOrder.id);
    await dataFrom(
      await post(
        run.admin,
        "/quality/commands",
        qualityCommandBodySchema.parse({
          commandId: crypto.randomUUID(),
          operation: "RECEIVE_AND_START",
          orders: [
            {
              orderId: longOrder.id,
              expectedVersion: quality.paper.order.version,
              pieceIds,
            },
          ],
        }),
      ),
      qualityCommandDataSchema,
    );
    quality = await qualityOrder(run.admin, longOrder.id);
    await dataFrom(
      await post(
        run.admin,
        "/quality/commands",
        qualityCommandBodySchema.parse({
          commandId: crypto.randomUUID(),
          operation: "INSPECT",
          orders: [
            {
              orderId: longOrder.id,
              expectedVersion: quality.paper.order.version,
              decisions: pieceIds.map((pieceId) => ({
                pieceId,
                decision: "REJECT",
                target: "CUTTING",
                reason: "P08 print defect",
                instructions: "P08 print correction",
              })),
              inspectorNote: null,
              packing: null,
            },
          ],
        }),
      ),
      qualityCommandDataSchema,
    );
    quality = await qualityOrder(run.admin, longOrder.id);
    expect(quality.work[0]?.currentCorrection?.phase).toBe(
      "WAITING_CORRECTION",
    );
    const current = await adminDetail(run.admin, longOrder.id);
    if (current.kind !== "submitted")
      throw new Error("Submitted print fixture required");
    await administrationWrite(run.admin, {
      commandId: crypto.randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: longOrder.id,
      expectedVersion: current.order.version,
      patch: { customerName: longName, customerAddress: longAddress },
      reason: "P08 long print content",
    });
    const evidence = readE2eRuntime().catalogEvidence;
    if (process.env["P04_E2E_CATALOG_MODE"] === "reviewed-workbook")
      expect(evidence).toEqual({
        kind: "reviewed-workbook",
        sourceSha256:
          "88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b",
      });
    else expect(evidence.kind).toBe("synthetic");
    const read = responseFor(
      run.admin.page,
      "/administration/reports/print",
      "GET",
    );
    await run.admin.page.goto(
      `${readE2eRuntime().webOrigin}/reports/print?period=ALL`,
    );
    const report = await dataFrom(
      await read,
      administrationReportPrintDataSchema,
    );
    expect(report.meta.complete).toBe(true);
    expect(report.orders.items.length).toBe(report.meta.cohort.orderCount);
    expect(report.orders.total).toBeGreaterThan(25);
    const paper = run.admin.page.locator(".a4-sheet");
    await expect(paper).toBeVisible();
    for (const numeral of ["١", "٢", "٣", "٤", "٥", "٦"])
      await expect(
        paper.getByRole("heading", { name: new RegExp(`^${numeral}\\.`) }),
      ).toHaveCount(1);
    const orderSection = paper
      .locator("section")
      .filter({ has: run.admin.page.getByRole("heading", { name: /^٤\./u }) });
    await expect(orderSection.locator("tbody > tr")).toHaveCount(
      report.orders.total,
    );
    for (const row of report.orders.items)
      if (row.businessNumber !== null)
        await expect(
          orderSection.getByText(row.businessNumber, { exact: true }),
        ).toHaveCount(1);
    expect(
      report.orders.items.find((row) => row.orderId === longOrder.id)?.customer,
    ).toMatchObject({ name: longName, address: longAddress });
    expect(
      report.exceptionRows.some(
        (row) =>
          row.orderId === longOrder.id &&
          row.category === "QUALITY_CORRECTION_HISTORY" &&
          row.customerName === longName,
      ),
    ).toBe(true);
    const assertReportBounds = async () => {
      for (const numeral of ["٤", "٥"]) {
        const section = paper.locator("section").filter({
          has: run.admin.page.getByRole("heading", {
            name: new RegExp(`^${numeral}\\.`),
          }),
        });
        await expect(section).toContainText(longName);
        const overflow = await section
          .locator("th, td")
          .evaluateAll((cells) => {
            const sheet = document.querySelector(".a4-sheet");
            if (!sheet) throw new Error("Report paper required");
            const bounds = sheet.getBoundingClientRect();
            return cells.some((cell) => {
              const box = cell.getBoundingClientRect();
              return (
                box.left < bounds.left - 1 ||
                box.right > bounds.right + 1 ||
                cell.scrollWidth > cell.clientWidth + 1
              );
            });
          });
        expect(overflow).toBe(false);
      }
    };
    await run.admin.page.evaluate(async () => {
      await document.fonts.ready;
    });
    await assertReportBounds();
    await run.admin.page.emulateMedia({ media: "print" });
    await assertReportBounds();
    await run.admin.page.emulateMedia({ media: "screen" });
    await expect(orderSection).toContainText(longAddress);
    await expect(
      paper
        .locator("section")
        .filter({ has: run.admin.page.getByRole("heading", { name: /^٢\./u }) })
        .locator("tbody > tr"),
    ).toHaveCount(5);
    await expect(paper).toContainText(report.meta.generatedBy.fullName);
    await expect(paper).toContainText(report.meta.businessTimeZone);
    const workforce = paper
      .locator("section")
      .filter({ has: run.admin.page.getByRole("heading", { name: /^٣\./u }) });
    const paperBounds = await paper.boundingBox();
    if (paperBounds === null) throw new Error("P08 report bounds required");
    for (const header of await workforce.getByRole("columnheader").all()) {
      const bounds = await header.boundingBox();
      if (bounds === null)
        throw new Error("P08 visible workforce column required");
      expect(bounds.x).toBeGreaterThanOrEqual(paperBounds.x - 1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        paperBounds.x + paperBounds.width + 1,
      );
    }
    await run.admin.page.evaluate(async () => {
      await document.fonts.ready;
    });
    // Replace only the browser print dialog boundary; the application must still
    // obtain its real fresh snapshot/grant and Chromium invokes its beforeprint guard.
    await run.admin.page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset["p08NativePrint"] = "ready";
      };
    });
    const fresh = responseFor(
      run.admin.page,
      "/administration/reports/print",
      "GET",
    );
    await run.admin.page
      .getByRole("button", { name: "طباعة التقرير (Ctrl + P)", exact: true })
      .click();
    await dataFrom(await fresh, administrationReportPrintDataSchema);
    await expect(run.admin.page.locator("html")).toHaveAttribute(
      "data-p08-native-print",
      "ready",
    );
    const directory = await mkdtemp(
      join(tmpdir(), `p08-report-${info.project.name}-`),
    );
    await chmod(directory, 0o700);
    const path = join(directory, "report.pdf");
    await run.admin.page.emulateMedia({ media: "print" });
    const bytes = await run.admin.page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    const pdf = await promisify(execFile)("pdfinfo", [path]);
    expect(Number(/^Pages:\s+(\d+)$/mu.exec(pdf.stdout)?.[1])).toBeGreaterThan(
      1,
    );
    const dimensions = /Page size:\s+([\d.]+) x ([\d.]+) pts/u.exec(pdf.stdout);
    expect(Math.abs(Number(dimensions?.[1]) - 595.28)).toBeLessThan(1.5);
    expect(Math.abs(Number(dimensions?.[2]) - 841.89)).toBeLessThan(1.5);
    const pdfText = await promisify(execFile)("pdftotext", ["-raw", path, "-"]);
    const compactText = pdfText.stdout.replace(/\s/gu, "");
    expect(compactText).toContain(longName);
    expect(compactText).toContain(longAddress);
    await promisify(execFile)("pdftoppm", [
      "-scale-to",
      "1400",
      "-png",
      path,
      join(directory, "first-page"),
    ]);
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        project: info.project.name,
        orders: report.orders.total,
        source: evidence.kind,
      }),
      { mode: 0o600, flag: "wx" },
    );
    console.info("P08 physical report inspection directory", directory);
  } finally {
    await run.close();
  }
});

test("P08 failed return cancellation preserves original attempt and requires explicit retry before remaining whole dispatch", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(180_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const worker = await run.worker("WAREHOUSE");
    const order = await createOrder(run.sales, run.approver, "SHOP", 3);
    const ids = order.pieces.map((piece) => piece.id).toSorted();
    await handoff(run, order.id, ids);
    let detail = await warehouseOrder(worker, order.id);
    await warehouseWrite(worker, {
      commandId: crypto.randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          ...warehouseSelection(detail, order.id, ids),
          receipt: {
            cartonCount: "3",
            storageLocation: "P08 retained shelf",
            notes: "P08 actual arrival",
          },
        },
      ],
    });
    detail = await warehouseOrder(worker, order.id);
    await warehouseWrite(worker, {
      commandId: crypto.randomUUID(),
      operation: "DISPATCH",
      orders: [
        {
          ...warehouseSelection(detail, order.id, ids),
          deliveryNote: "P08 original handoff",
        },
      ],
    });
    detail = await warehouseOrder(worker, order.id);
    const firstId = detail.currentAttempt?.id;
    if (!firstId) throw new Error("P08 original attempt required");
    const cancelId = ids[0];
    if (!cancelId) throw new Error("P08 exact cancellation required");
    let current = await submitted(run.admin, order.id);
    const refused = await post(run.admin, "/administration/commands", {
      commandId: crypto.randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: order.id,
      expectedVersion: current.order.version,
      scope: "ITEM",
      pieceIds: [cancelId],
      reason: "P08 dispatched piece denial",
    });
    expect(refused.status()).toBe(409);
    expect((await submitted(run.admin, order.id)).order).toEqual(current.order);
    await warehouseWrite(worker, {
      commandId: crypto.randomUUID(),
      operation: "FAIL_DELIVERY",
      orders: [
        {
          ...warehouseSelection(detail, order.id, ids),
          attemptId: firstId,
          returnedToWarehouse: true,
          reason: "P08 physical return",
          notes: "P08 retained failure",
        },
      ],
    });
    detail = await warehouseOrder(worker, order.id);
    const originalAttempt = detail.currentAttempt;
    current = await submitted(run.admin, order.id);
    await administrationWrite(run.admin, {
      commandId: crypto.randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: order.id,
      expectedVersion: current.order.version,
      scope: "ITEM",
      pieceIds: [cancelId],
      reason: "P08 returned cancellation",
    });
    detail = await warehouseOrder(worker, order.id);
    expect(detail.currentAttempt).toEqual(originalAttempt);
    expect(detail.summary.status).toBe("DELIVERY_FAILED");
    expect(detail.summary.allowedActions.canDispatch).toBe(false);
    expect(detail.summary.allowedActions.canRetryDelivery).toBe(true);
    await goto(worker.page, `/warehouse/orders/${order.id}`);
    await expect(worker.page.locator("main")).toContainText(
      "P08 physical return",
    );
    const active = ids.filter((id) => id !== cancelId);
    await warehouseWrite(worker, {
      commandId: crypto.randomUUID(),
      operation: "RETRY_DELIVERY",
      orders: [
        {
          ...warehouseSelection(detail, order.id, active),
          attemptId: firstId,
          retryDate: null,
          notes: "P08 explicit retry",
        },
      ],
    });
    detail = await warehouseOrder(worker, order.id);
    expect(detail.summary.status).toBe("READY_FOR_DELIVERY");
    await warehouseWrite(worker, {
      commandId: crypto.randomUUID(),
      operation: "DISPATCH",
      orders: [
        {
          ...warehouseSelection(detail, order.id, active),
          deliveryNote: "P08 remaining whole order",
        },
      ],
    });
    detail = await warehouseOrder(worker, order.id);
    expect(detail.currentAttempt?.pieceIds).toEqual(active);
    expect(detail.currentAttempt?.number).toBe(2);
    expect(detail.currentAttempt?.id).not.toBe(firstId);
    const secondId = detail.currentAttempt?.id;
    await warehouseWrite(worker, {
      commandId: crypto.randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          ...warehouseSelection(detail, order.id, active),
          attemptId: secondId,
          recipient: "P08 final recipient",
          deliveredAt: null,
          notes: null,
        },
      ],
    });
    const delivered = await submitted(run.admin, order.id);
    expect(delivered.order.status).toBe("DELIVERED");
    await correctThroughDialog(
      run.admin,
      order.id,
      "P08 delivered address correction",
    );
    const corrected = await submitted(run.admin, order.id);
    expect(corrected.order.status).toBe("DELIVERED");
    expect(corrected.order.pieces).toEqual(delivered.order.pieces);
    expect(corrected.order.money).toEqual(delivered.order.money);
    expect((await warehouseOrder(worker, order.id)).currentAttempt?.id).toBe(
      secondId,
    );
  } finally {
    await run.close();
  }
});

test("P08 two-session stale correction retains dirty intent until explicit current review and filters use real URLs", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(180_000);
  const run = await scenario(browser, info.project.name, viewport);
  let other: Session | undefined;
  try {
    other = await signIn(browser, readE2eRuntime().admin, viewport);
    const order = await createOrder(run.sales, run.approver);
    await goto(run.admin.page, `/admin/orders/${order.id}`);
    await run.admin.page
      .getByRole("button", { name: "تصحيح بيانات أمر التفصيل", exact: true })
      .click();
    const dialog = run.admin.page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: /^عنوان التسليم:/u })
      .fill("P08 local dirty intended address");
    await dialog
      .getByRole("textbox", { name: /^سبب التصحيح \(إلزامي\):/u })
      .fill("P08 stale review reason");
    const original = await submitted(other, order.id);
    await administrationWrite(other, {
      commandId: crypto.randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: order.id,
      expectedVersion: original.order.version,
      patch: {
        customerAddress: "P08 remote current address",
        generalNotes: "P08 remote pristine note",
      },
      reason: "P08 other session update",
    });
    const failed = responseFor(run.admin.page, "/administration/commands");
    await dialog
      .getByRole("button", { name: "حفظ التصحيح", exact: true })
      .click();
    expect((await failed).status()).toBe(409);
    await expect(
      dialog.getByRole("textbox", { name: /^عنوان التسليم:/u }),
    ).toHaveValue("P08 local dirty intended address");
    await dialog
      .getByRole("button", { name: "مراجعة البيانات الحالية", exact: true })
      .click();
    await expect(
      dialog.getByRole("textbox", { name: /^الملاحظات العامة:/u }),
    ).toHaveValue("P08 remote pristine note");
    await expect(
      dialog.getByRole("textbox", { name: /^عنوان التسليم:/u }),
    ).toHaveValue("P08 local dirty intended address");
    const saved = responseFor(run.admin.page, "/administration/commands");
    await dialog
      .getByRole("button", { name: "حفظ التصحيح", exact: true })
      .click();
    await dataFrom(await saved, administrationCommandDataSchema);
    await expect(dialog).toBeHidden();
    await closeConfirmation(run.admin);
    const current = await submitted(other, order.id);
    expect(current.order.generalNotes).toBe("P08 remote pristine note");
    expect(current.order.customerSnapshot.address).toBe(
      "P08 local dirty intended address",
    );
    await goto(run.admin.page, "/admin/orders");
    await run.admin.page
      .getByPlaceholder("ابحث برقم الطلب، العميل، الهاتف، أو الموديل...")
      .fill(order.businessNumber);
    await expect
      .poll(() => new URL(run.admin.page.url()).searchParams.get("search"))
      .toBe(order.businessNumber);
    await expect(
      run.admin.page.getByRole("row").filter({ hasText: order.businessNumber }),
    ).toHaveCount(1);
    for (const path of [
      "approvals",
      "corrections",
      "delivery-exceptions",
      "activity",
    ]) {
      await goto(run.admin.page, `/admin/${path}?search=P08-no-such-record`);
      await expect(
        run.admin.page.getByText("لا توجد سجلات", { exact: true }),
      ).toBeVisible();
      const invalid = `${readE2eRuntime().webOrigin}/admin/${path}?page=0&search=P08-retained`;
      await run.admin.page.goto(invalid);
      await expect(
        run.admin.page.locator("main").getByRole("alert"),
      ).toContainText("الصفحة");
      await expect(run.admin.page.getByRole("textbox")).toHaveValue(
        "P08-retained",
      );
      await run.admin.page
        .getByRole("button", { name: "إعادة الفلاتر الافتراضية", exact: true })
        .click();
      await expect
        .poll(() => new URL(run.admin.page.url()).searchParams.get("page"))
        .toBe("1");
    }
  } finally {
    await other?.context.close();
    await run.close();
  }
});

const filteredResponse = (
  page: Page,
  path: string,
  key: string,
  value: string,
) =>
  page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1${path}` &&
      url.searchParams.get(key) === value &&
      response.request().method() === "GET"
    );
  });

test("P08 report filters retain one order cohort and a separately scoped current staff directory", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(180_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    let response = responseFor(
      run.admin.page,
      "/administration/reports",
      "GET",
    );
    await goto(run.admin.page, "/admin/reports?period=ALL");
    const base = await dataFrom(await response, administrationReportDataSchema);
    expect(base.meta.cohort.orderCount).toBeGreaterThan(25);
    expect(base.orders.items).toHaveLength(25);
    response = filteredResponse(
      run.admin.page,
      "/administration/reports",
      "page",
      "2",
    );
    await run.admin.page
      .getByRole("button", { name: "الصفحة التالية", exact: true })
      .click();
    const second = await dataFrom(
      await response,
      administrationReportDataSchema,
    );
    expect(second.orders.pagination.page).toBe(2);
    expect(second.meta.cohort).toEqual(base.meta.cohort);
    expect(second.workforce).toEqual(base.workforce);
    await run.admin.page.goBack();
    await expect
      .poll(() => new URL(run.admin.page.url()).searchParams.get("page"))
      .toBeNull();
    await expect(
      run.admin.page.getByRole("button", {
        name: "الصفحة السابقة",
        exact: true,
      }),
    ).toBeDisabled();
    await run.admin.page.goForward();
    await expect
      .poll(() => new URL(run.admin.page.url()).searchParams.get("page"))
      .toBe("2");
    await expect(
      run.admin.page.getByRole("button", {
        name: "الصفحة السابقة",
        exact: true,
      }),
    ).toBeEnabled();
    expect(
      second.orders.items
        .map((row) => row.orderId)
        .some((id) => base.orders.items.some((row) => row.orderId === id)),
    ).toBe(false);
    response = filteredResponse(
      run.admin.page,
      "/administration/reports",
      "type",
      "ADJUSTMENT",
    );
    await run.admin.page
      .getByRole("combobox", { name: "نوع الطلب:", exact: true })
      .selectOption("ADJUSTMENT");
    const typed = await dataFrom(
      await response,
      administrationReportDataSchema,
    );
    expect(typed.orders.pagination.page).toBe(1);
    expect(typed.orders.items.every((row) => row.type === "ADJUSTMENT")).toBe(
      true,
    );
    expect(typed.workforce).toEqual(base.workforce);
    expect(new URL(run.admin.page.url()).searchParams.get("page")).toBe("1");
    response = filteredResponse(
      run.admin.page,
      "/administration/reports",
      "department",
      "CUTTING",
    );
    await run.admin.page
      .getByRole("combobox", { name: "المرحلة / القسم:", exact: true })
      .selectOption("CUTTING");
    const department = await dataFrom(
      await response,
      administrationReportDataSchema,
    );
    expect(department.workforce.scope).toEqual({
      kind: "CURRENT_DIRECTORY",
      department: "CUTTING",
    });
    expect(
      department.workforce.items.every(
        (staff) => staff.department === "CUTTING",
      ),
    ).toBe(true);
    expect(department.kpis.orders).toBe(department.meta.cohort.orderCount);
    const popup = run.admin.page.waitForEvent("popup");
    await run.admin.page
      .getByRole("button", { name: "طباعة التقرير التشغيلي (A4)", exact: true })
      .click();
    const print = await popup;
    try {
      await expect
        .poll(() => new URL(print.url()).pathname)
        .toBe("/reports/print");
      const params = new URL(print.url()).searchParams;
      expect(params.get("type")).toBe("ADJUSTMENT");
      expect(params.get("department")).toBe("CUTTING");
      expect(params.has("page")).toBe(false);
      expect(params.has("limit")).toBe(false);
      const snapshot = await dataFrom(
        await run.admin.page.request.get(
          api(`/administration/reports/print?${params.toString()}`),
          { headers: run.admin.headers },
        ),
        administrationReportPrintDataSchema,
      );
      expect(snapshot.orders.total).toBe(department.meta.cohort.orderCount);
      expect(snapshot.workforce).toEqual(department.workforce);
      await expect(print.getByRole("heading", { name: /^٣\./u })).toContainText(
        String(snapshot.workforce.activeStaff),
      );
    } finally {
      await print.close();
    }
  } finally {
    await run.close();
  }
});

test("P08 dashboard drilldown counts pages oversight tabs and lazy history use the current backend", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(180_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const order = await createOrder(run.sales, run.approver);
    const dashboardRead = responseFor(
      run.admin.page,
      "/administration/dashboard",
      "GET",
    );
    await goto(run.admin.page, "/admin/dashboard");
    const dashboard = await dataFrom(
      await dashboardRead,
      administrationDashboardDataSchema,
    );
    const listRead = responseFor(
      run.admin.page,
      "/administration/orders",
      "GET",
    );
    await run.admin.page
      .getByRole("link", {
        name: `عرض كل الطلبات (${String(dashboard.counts.totalOrders)})`,
        exact: true,
      })
      .click();
    const first = await dataFrom(
      await listRead,
      administrationOrdersDataSchema,
    );
    expect(first.pagination.total).toBe(dashboard.counts.totalOrders);
    const nextRead = filteredResponse(
      run.admin.page,
      "/administration/orders",
      "page",
      "2",
    );
    await run.admin.page
      .getByRole("button", { name: "الصفحة التالية", exact: true })
      .click();
    const second = await dataFrom(
      await nextRead,
      administrationOrdersDataSchema,
    );
    expect(second.pagination.page).toBe(2);
    expect(second.pagination.total).toBe(first.pagination.total);
    const searchRead = filteredResponse(
      run.admin.page,
      "/administration/orders",
      "search",
      order.businessNumber,
    );
    await run.admin.page
      .getByPlaceholder("ابحث برقم الطلب، العميل، الهاتف، أو الموديل...")
      .fill(order.businessNumber);
    const found = await dataFrom(
      await searchRead,
      administrationOrdersDataSchema,
    );
    expect(found.items).toHaveLength(1);
    expect(found.items[0]?.kind).toBe("submitted");
    const row = run.admin.page
      .getByRole("row")
      .filter({ hasText: order.businessNumber });
    await row.getByRole("link", { name: "تفاصيل", exact: true }).click();
    await expect(run.admin.page).toHaveURL(
      new RegExp(`/admin/orders/${order.id}$`, "u"),
    );
    const current = await submitted(run.admin, order.id);
    const historyRead = responseFor(
      run.admin.page,
      `/administration/orders/${order.id}/history`,
      "GET",
    );
    await run.admin.page
      .getByRole("button", { name: /^سجل الرقابة والحركات/u })
      .click();
    const history = await dataFrom(
      await historyRead,
      administrationActivityDataSchema,
    );
    expect(history.pagination.total).toBe(current.historyCount);
    expect(history.events.length).toBeGreaterThan(0);
    await run.admin.page
      .getByRole("button", { name: /^نموذج أمر التفصيل الورقي الكامل/u })
      .click();
    await run.admin.page
      .getByRole("button", { name: /^تتبع أمر التفصيل ومسار الكميات/u })
      .click();
    await expect(
      run.admin.page.getByRole("button", {
        name: /^تتبع أمر التفصيل ومسار الكميات/u,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(run.admin.page.locator("main")).toContainText(
      "موقف وتتبع قطع الطلب",
    );
    const approvedRead = responseFor(
      run.admin.page,
      "/administration/approvals",
      "GET",
    );
    await goto(
      run.admin.page,
      `/admin/approvals?tab=APPROVED&search=${encodeURIComponent(order.businessNumber)}`,
    );
    const approved = await dataFrom(
      await approvedRead,
      administrationApprovalsDataSchema,
    );
    expect(approved.items.map((item) => item.id)).toEqual([order.id]);
    await expect(
      run.admin.page.getByRole("button", {
        name: `سجل الطلبات المعتمدة (${String(approved.counts.approved)})`,
        exact: true,
      }),
    ).toBeVisible();
    const allRead = filteredResponse(
      run.admin.page,
      "/administration/approvals",
      "tab",
      "ALL",
    );
    await run.admin.page.getByRole("button", { name: /^كل الحالات/u }).click();
    const all = await dataFrom(
      await allRead,
      administrationApprovalsDataSchema,
    );
    expect(all.context.query.tab).toBe("ALL");
    expect(all.items.map((item) => item.id)).toEqual([order.id]);
    await expect
      .poll(() => new URL(run.admin.page.url()).searchParams.get("tab"))
      .toBe("ALL");
  } finally {
    await run.close();
  }
});
