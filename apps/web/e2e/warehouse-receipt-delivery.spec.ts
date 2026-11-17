import {
  expect,
  test,
  type APIResponse,
  type Request,
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
  approvalOrderDataSchema,
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
  warehouseOrdersDataSchema,
  warehouseDashboardDataSchema,
  warehouseActivityDataSchema,
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  warehouseOrderHistoryDataSchema,
  salesOrderDataSchema,
  type WarehouseCommandOperation,
  type WarehouseOrderData,
} from "@template/contracts";
import {
  readE2eRuntime,
  waitForCapturedAction,
  type E2eRuntimeIdentity,
} from "./runtime";

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
      `P07 HTTP ${String(response.status())} ${failure.code} fields:${(failure.errors ?? []).map((issue) => issue.field).join(",")}`,
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
      throw new Error("P07 owned session observation failed");
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
const reloadAuthenticated = async (session: Session) => {
  await session.page.reload();
  await expect(session.page.locator(".oriental-logout-btn")).toHaveCount(1);
  if (new URL(session.page.url()).pathname.includes("/tasks/"))
    await expect(
      session.page.getByRole("heading", { name: /^مهمة /u }),
    ).toBeVisible();
  else
    await expect(
      session.page.locator("main").getByRole("heading").first(),
    ).toBeVisible();
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
  if (!fixture) throw new Error("P07 project fixture missing");
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
      const email = `p07.${crypto.randomUUID()}@p07-e2e.test`;
      const password = "P07!SyntheticWorker2026";
      await goto(page, "/auth/register");
      await page
        .getByLabel("الاسم الكامل")
        .fill(`P07 ${department} ${email.slice(4, 12)}`);
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
              throw new Error("P07 fixture auth cookies missing");
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
          name: "P07 owned browser customer",
          phone: `050${String(Date.now()).slice(-7)}`,
          address: "P07 private address",
          email: "private.customer@p07-e2e.test",
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
    face: "P07 retained face",
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
const queuePaths = {
  RECEIVE: "incoming",
  DISPATCH: "ready",
  CONFIRM_DELIVERY: "out-for-delivery",
  FAIL_DELIVERY: "out-for-delivery",
  RETRY_DELIVERY: "delivery-failed",
} as const;
const rowActions = {
  RECEIVE: "تأكيد الاستلام الفعلي",
  DISPATCH: "مراجعة خروج الطلب الكامل للتوصيل",
  CONFIRM_DELIVERY: "مراجعة تسليم الطلب الكامل للعميل",
  FAIL_DELIVERY: "مراجعة فشل التوصيل والعودة الكاملة",
  RETRY_DELIVERY: "مراجعة إعادة الطلب الكامل للجاهز",
} as const;
const openPieceAction = async (
  session: Session,
  order: Readonly<{ id: string; businessNumber: string }>,
  position: number,
  operation: WarehouseCommandOperation,
) => {
  await goto(session.page, `/warehouse/${queuePaths[operation]}`);
  await session.page
    .getByPlaceholder(
      "البحث برقم أمر التفصيل، العميل، الموديل، الموظف المسؤول...",
    )
    .fill(order.businessNumber);
  await session.page
    .getByRole("button", { name: "حسب القطعة", exact: true })
    .click();
  const checkbox = session.page.getByRole("checkbox", {
    name: `تحديد القطعة ${String(position)} من ${order.businessNumber}`,
    exact: true,
  });
  await expect(checkbox).toBeVisible();
  const row = session.page.getByRole("row").filter({ has: checkbox });
  await row
    .getByRole("button", { name: rowActions[operation], exact: true })
    .click();
  const dialog = session.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};
const saveWarehouse = async (session: Session) => {
  const saved = responseFor(session.page, "/warehouse/commands");
  await session.page
    .getByRole("dialog")
    .getByRole("button", { name: "تأكيد الإجراء", exact: true })
    .click();
  const response = await saved,
    body = warehouseCommandBodySchema.parse(response.request().postDataJSON()),
    result = await dataFrom(response, warehouseCommandDataSchema);
  await expect(
    session.page.getByText("تم حفظ الإجراء وتحديث البيانات.", { exact: true }),
  ).toBeVisible();
  await session.page
    .getByRole("button", { name: "إغلاق التأكيد", exact: true })
    .click();
  await expect(session.page.getByRole("dialog")).toHaveCount(0);
  return { body, result };
};
const physicalTerms = (detail: WarehouseOrderData) => ({
  contact: detail.deliveryContact,
  pieces: detail.paper.order.pieces.map(
    ({
      stage: _stage,
      workState: _state,
      receivedAt: _received,
      cancelledAt: _cancelled,
      cancellationReason: _reason,
      ...specification
    }) => specification,
  ),
});
const allHistory = async (session: Session, id: string) => {
  const first = await dataFrom(
      await session.page.request.get(
        api(`/warehouse/orders/${id}/history?limit=25`),
        { headers: session.headers },
      ),
      warehouseOrderHistoryDataSchema,
    ),
    events = [...first.events];
  expect(first.pagination.totalPages).toBeLessThanOrEqual(20);
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const next = await dataFrom(
      await session.page.request.get(
        api(`/warehouse/orders/${id}/history?limit=25&page=${String(page)}`),
        { headers: session.headers },
      ),
      warehouseOrderHistoryDataSchema,
    );
    events.push(...next.events);
  }
  expect(events).toHaveLength(first.pagination.total);
  return events;
};

test("P07 US1 separate physical arrivals retain exact fields and reconcile ready across colleagues", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("WAREHOUSE"),
      b = await run.worker("WAREHOUSE"),
      order = await createOrder(run.sales, run.approver, "SHOP", 3),
      [p1, p2, p3] = order.pieces.map((piece) => piece.id);
    if (!p1 || !p2 || !p3) throw new Error("Three pieces required");
    await handoff(run, order.id, [p1, p2], {
      cartonCount: "Quality cartons",
      cartonNumbers: "QC-12",
    });
    const before = await warehouseOrder(a, order.id),
      terms = physicalTerms(before),
      packing = before.qualityPackingGroups;
    expect(before.summary.counts).toMatchObject({
      original: 3,
      active: 3,
      received: 0,
      completionPercent: 0,
    });
    expect(
      before.paper.order.pieces.find((piece) => piece.id === p3)?.stage,
    ).toBe("CUTTING");
    const counts = await dataFrom(
      await a.page.request.get(
        api(
          `/warehouse/dashboard?search=${encodeURIComponent(order.businessNumber)}`,
        ),
        { headers: a.headers },
      ),
      warehouseDashboardDataSchema,
    );
    expect(counts.counts.incoming).toEqual({ orders: 1, pieces: 2 });
    expect(counts.counts.incomplete).toEqual({ orders: 1, pieces: 3 });
    expect(counts.counts.ready.orders).toBe(0);
    await goto(a.page, "/warehouse/dashboard");
    await expect(
      a.page.getByRole("heading", { name: "لوحة المستودع والتوصيل" }),
    ).toBeVisible();
    let dialog = await openPieceAction(a, order, 1, "RECEIVE");
    await expect(dialog).toContainText(p1);
    await expect(dialog).not.toContainText(p2);
    await dialog.getByLabel("عدد الكراتين المستلمة", { exact: true }).fill("2");
    await dialog
      .getByLabel("موقع التخزين بالرفوف", { exact: true })
      .fill("Shelf B-12");
    await dialog
      .getByLabel("ملاحظات", { exact: true })
      .fill("Protect finished surfaces");
    const first = await saveWarehouse(a);
    expect(first.body).toMatchObject({
      operation: "RECEIVE",
      orders: [
        {
          orderId: order.id,
          pieceIds: [p1],
          receipt: {
            cartonCount: "2",
            storageLocation: "Shelf B-12",
            notes: "Protect finished surfaces",
          },
        },
      ],
    });
    let current = await warehouseOrder(b, order.id);
    expect(current.summary.counts.received).toBe(1);
    expect(current.receiptGroups).toHaveLength(1);
    expect(current.receiptGroups[0]).toMatchObject({
      pieceIds: [p1],
      cartonCount: "2",
      storageLocation: "Shelf B-12",
      notes: "Protect finished surfaces",
      actor: first.result.receipt.actor,
      receivedAt: first.result.receipt.occurredAt,
    });
    expect(
      current.work.find((work) => work.pieceId === p2)?.receivedAt,
    ).toBeNull();
    expect(current.summary.allowedActions.canDispatch).toBe(false);
    expect(current.qualityPackingGroups).toEqual(packing);
    await goto(b.page, `/warehouse/orders/${order.id}`);
    await reloadAuthenticated(b);
    await expect(b.page.getByLabel("مجموعات الاستلام الفعلي")).toContainText(
      "Shelf B-12",
    );
    await expect(
      b.page.getByRole("button", { name: /إرسال الطلب الكامل/ }),
    ).toHaveCount(0);
    await openPieceAction(b, order, 2, "RECEIVE");
    const second = await saveWarehouse(b);
    expect(second.body).toMatchObject({
      orders: [
        {
          pieceIds: [p2],
          receipt: { cartonCount: null, storageLocation: null, notes: null },
        },
      ],
    });
    await handoff(run, order.id, [p3]);
    dialog = await openPieceAction(a, order, 3, "RECEIVE");
    await dialog
      .getByLabel("عدد الكراتين المستلمة", { exact: true })
      .fill("Third arrival");
    await dialog
      .getByLabel("موقع التخزين بالرفوف", { exact: true })
      .fill("Shelf C-3");
    await saveWarehouse(a);
    current = await warehouseOrder(b, order.id);
    expect(current.summary.status).toBe("READY_FOR_DELIVERY");
    expect(current.summary.counts).toEqual({
      original: 3,
      cancelled: 0,
      active: 3,
      received: 3,
      completionPercent: 100,
    });
    expect(current.receiptGroups).toHaveLength(3);
    expect(current.qualityPackingGroups).toEqual(packing);
    expect(physicalTerms(current)).toEqual(terms);
    for (const path of ["ready", "in-progress"]) {
      await goto(b.page, `/warehouse/${path}`);
      await b.page
        .getByPlaceholder(
          "البحث برقم أمر التفصيل، العميل، الموديل، الموظف المسؤول...",
        )
        .fill(order.businessNumber);
      await expect(
        b.page.getByRole("link", { name: "عرض أمر التفصيل", exact: true }),
      ).toHaveCount(1);
    }
    const financial = await dataFrom(
      await run.sales.page.request.get(api(`/sales-orders/${order.id}`), {
        headers: run.sales.headers,
      }),
      salesOrderDataSchema,
    );
    expect(financial.order.customerSnapshot).toEqual(order.customerSnapshot);
    expect(financial.order.money).toEqual(order.money);
    expect(
      financial.order.pieces.map((piece) => ({
        id: piece.id,
        unitPrice: piece.unitPrice,
        catalogSourceId: piece.catalogSourceId,
      })),
    ).toEqual(
      order.pieces.map((piece) => ({
        id: piece.id,
        unitPrice: piece.unitPrice,
        catalogSourceId: piece.catalogSourceId,
      })),
    );
    const history = await allHistory(b, order.id);
    expect(
      history.filter(
        (item) =>
          item.kind === "warehouse" && item.event.operation === "RECEIVE",
      ),
    ).toHaveLength(3);
  } finally {
    await run.close();
  }
});

const snapshot = (detail: WarehouseOrderData) => ({
  version: detail.summary.version,
  status: detail.summary.status,
  counts: detail.summary.counts,
  work: detail.work,
  attempt: detail.currentAttempt,
  receipts: detail.receiptGroups.map((group) => ({
    id: group.id,
    pieceIds: group.pieceIds,
  })),
});
const warehouseCommand = async (session: Session, body: unknown) =>
  dataFrom(
    await post(
      session,
      "/warehouse/commands",
      warehouseCommandBodySchema.parse(body),
    ),
    warehouseCommandDataSchema,
  );
const readyOrder = async (
  run: Awaited<ReturnType<typeof scenario>>,
  receiver: Session,
  options: Readonly<{ cancelLast?: boolean }> = {},
) => {
  const order = await createOrder(
      run.sales,
      run.approver,
      "SHOP",
      options.cancelLast ? 3 : 2,
    ),
    ids = order.pieces.map((piece) => piece.id),
    active = options.cancelLast ? ids.slice(0, -1) : ids;
  await handoff(run, order.id, active);
  await goto(receiver.page, `/warehouse/orders/${order.id}`);
  await receiver.page
    .getByRole("button", { name: /تأكيد استلام وتسجيل الكراتين/ })
    .click();
  await expect(receiver.page.getByRole("dialog")).toBeVisible();
  await saveWarehouse(receiver);
  if (options.cancelLast) {
    const pieceId = ids.at(-1);
    if (!pieceId) throw new Error("Cancelled companion required");
    const current = await readOrder(run.admin, "CUTTING", order.id),
      report = await dataFrom(
        await post(
          run.admin,
          `/manufacturing-orders/${order.id}/pieces/${pieceId}/issues`,
          {
            commandId: crypto.randomUUID(),
            expectedVersion: current.paper.order.version,
            reason: "Cancel upstream companion",
            notes: null,
          },
        ),
        approvalCommandDataSchema,
      ),
      issueId = report.outcome.issueId;
    if (!issueId) throw new Error("Real issue required");
    const approval = await dataFrom(
      await run.approver.page.request.get(
        api(`/approvals/orders/${order.id}`),
        { headers: run.approver.headers },
      ),
      approvalOrderDataSchema,
    );
    await dataFrom(
      await post(
        run.approver,
        `/approvals/orders/${order.id}/pieces/${pieceId}/issues/${issueId}/resolve`,
        {
          commandId: crypto.randomUUID(),
          expectedVersion: approval.order.version,
          decision: "CANCEL",
          reason: "Approved cancellation of upstream companion",
          confirmed: true,
        },
      ),
      approvalCommandDataSchema,
    );
  }
  expect(
    (await warehouseOrder(receiver, order.id)).summary.allowedActions
      .canDispatch,
  ).toBe(true);
  return order;
};
const rejected = async (response: APIResponse | Response, code: string) => {
  expect(response.status()).toBe(409);
  expect(errorEnvelopeSchema.parse(await response.json()).code).toBe(code);
};
test("P07 US3 cancelled companion whole-order review cancel dispatch and supplied customer receipt", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("WAREHOUSE"),
      b = await run.worker("WAREHOUSE"),
      order = await readyOrder(run, a, { cancelLast: true }),
      before = await warehouseOrder(a, order.id),
      active = before.summary.matchingPieceIds.toSorted(),
      cancelled = order.pieces.at(-1)?.id;
    if (!cancelled) throw new Error("Cancelled piece required");
    expect(before.summary.counts).toMatchObject({
      original: 3,
      cancelled: 1,
      active: 2,
      received: 2,
    });
    await rejected(
      await post(a, "/warehouse/commands", {
        commandId: crypto.randomUUID(),
        operation: "CONFIRM_DELIVERY",
        orders: [
          {
            orderId: order.id,
            expectedVersion: before.summary.version,
            pieceIds: active,
            attemptId: crypto.randomUUID(),
          },
        ],
      }),
      "ORDER_STATE_CONFLICT",
    );
    expect(snapshot(await warehouseOrder(a, order.id))).toEqual(
      snapshot(before),
    );
    let dialog = await openPieceAction(a, order, 1, "DISPATCH");
    for (const id of active) await expect(dialog).toContainText(id);
    await expect(dialog).not.toContainText(cancelled);
    await expect(
      dialog.getByRole("heading", { name: new RegExp(order.businessNumber) }),
    ).toHaveCount(1);
    await expect(dialog).toContainText("خارج التحديد والصفحة الحالية");
    let writes = 0;
    const count = (request: Request) => {
      if (
        new URL(request.url()).pathname === "/api/v1/warehouse/commands" &&
        request.method() === "POST"
      )
        writes++;
    };
    a.page.on("request", count);
    try {
      await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(writes).toBe(0);
    } finally {
      a.page.off("request", count);
    }
    expect(snapshot(await warehouseOrder(a, order.id))).toEqual(
      snapshot(before),
    );
    dialog = await openPieceAction(a, order, 1, "DISPATCH");
    await dialog
      .getByLabel("ملاحظات التوصيل (اختياري)", { exact: true })
      .fill("P07 handoff note");
    const dispatch = await saveWarehouse(a);
    expect(dispatch.body).toMatchObject({
      operation: "DISPATCH",
      orders: [
        {
          orderId: order.id,
          pieceIds: active,
          deliveryNote: "P07 handoff note",
        },
      ],
    });
    let current = await warehouseOrder(b, order.id);
    expect(current.summary.status).toBe("OUT_FOR_DELIVERY");
    expect(current.currentAttempt).toMatchObject({
      pieceIds: active,
      number: 1,
      status: "DISPATCHED",
      deliveryNote: "P07 handoff note",
      outcome: null,
    });
    expect(
      current.paper.order.pieces.find((piece) => piece.id === cancelled)?.stage,
    ).toBe("CANCELLED");
    const historyBefore = await allHistory(b, order.id),
      originalDispatch = historyBefore.find(
        (item) =>
          item.kind === "warehouse" && item.event.operation === "DISPATCH",
      );
    expect(originalDispatch).toBeDefined();
    await rejected(
      await post(b, "/warehouse/commands", {
        commandId: crypto.randomUUID(),
        operation: "CONFIRM_DELIVERY",
        orders: [
          {
            orderId: order.id,
            expectedVersion: current.summary.version,
            pieceIds: active.slice(0, 1),
            attemptId: current.currentAttempt?.id,
          },
        ],
      }),
      "WAREHOUSE_SELECTION_CONFLICT",
    );
    dialog = await openPieceAction(a, order, 1, "CONFIRM_DELIVERY");
    await dialog
      .getByLabel("اسم المستلم الفعلي (اختياري)", { exact: true })
      .fill("Test Recipient");
    await dialog
      .getByLabel("وقت وتاريخ التسليم الفعلي (اختياري)", { exact: true })
      .fill("2026-11-13 14:30 +02:00");
    await dialog
      .getByLabel("ملاحظات", { exact: true })
      .fill("Handed to recipient");
    const delivery = await saveWarehouse(a);
    expect(delivery.body).toMatchObject({
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          pieceIds: active,
          attemptId: current.currentAttempt?.id,
          recipient: "Test Recipient",
          deliveredAt: "2026-11-13T12:30:00.000Z",
          notes: "Handed to recipient",
        },
      ],
    });
    current = await warehouseOrder(b, order.id);
    expect(current.summary.status).toBe("DELIVERED");
    expect(current.currentAttempt?.outcome).toMatchObject({
      kind: "DELIVERED",
      recipient: "Test Recipient",
      deliveredAt: "2026-11-13T12:30:00.000Z",
      notes: "Handed to recipient",
      recordedBy: delivery.result.receipt.actor,
      recordedAt: delivery.result.receipt.occurredAt,
    });
    expect(current.summary.counts).toEqual(before.summary.counts);
    expect(current.receiptGroups).toEqual(before.receiptGroups);
    await goto(b.page, `/warehouse/orders/${order.id}`);
    await reloadAuthenticated(b);
    await expect(b.page.getByLabel("محاولة التوصيل الحالية")).toContainText(
      "Test Recipient",
    );
    await expect(b.page.getByText("لدى العميل", { exact: true })).toHaveCount(
      2,
    );
    expect(
      (await allHistory(b, order.id)).find(
        (item) =>
          item.kind === "warehouse" && item.event.operation === "DISPATCH",
      ),
    ).toEqual(originalDispatch);
  } finally {
    await run.close();
  }
});
test("P07 US3 stale cross-order batch rejects all effects and optional receipt stays absent", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("WAREHOUSE"),
      b = await run.worker("WAREHOUSE"),
      one = await readyOrder(run, a),
      two = await readyOrder(run, b),
      beforeOne = await warehouseOrder(a, one.id),
      beforeTwo = await warehouseOrder(b, two.id);
    await goto(a.page, "/warehouse/ready");
    await a.page
      .getByPlaceholder(
        "البحث برقم أمر التفصيل، العميل، الموديل، الموظف المسؤول...",
      )
      .fill("P07 owned browser customer");
    await a.page
      .getByRole("button", { name: "حسب القطعة", exact: true })
      .click();
    for (const order of [one, two])
      await a.page
        .getByRole("checkbox", {
          name: `تحديد القطعة 1 من ${order.businessNumber}`,
          exact: true,
        })
        .check();
    await a.page
      .getByRole("button", {
        name: "مراجعة خروج الطلبات الكاملة للتوصيل",
        exact: true,
      })
      .click();
    const dialog = a.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (const order of [beforeOne, beforeTwo])
      for (const id of order.summary.matchingPieceIds)
        await expect(dialog).toContainText(id);
    for (const input of await dialog
      .getByLabel("ملاحظات التوصيل (اختياري)", { exact: true })
      .all())
      await input.fill("Preserved stale batch note");
    await warehouseCommand(b, {
      commandId: crypto.randomUUID(),
      operation: "DISPATCH",
      orders: [
        {
          orderId: two.id,
          expectedVersion: beforeTwo.summary.version,
          pieceIds: beforeTwo.summary.matchingPieceIds,
        },
      ],
    });
    const changedTwo = await warehouseOrder(b, two.id),
      failed = responseFor(a.page, "/warehouse/commands");
    await dialog
      .getByRole("button", { name: "تأكيد الإجراء", exact: true })
      .click();
    const response = await failed;
    await rejected(response, "ORDER_VERSION_CONFLICT");
    const original = warehouseCommandBodySchema.parse(
      response.request().postDataJSON(),
    );
    expect(original.orders).toHaveLength(2);
    expect(
      (
        await a.page.request.get(
          api(`/warehouse-commands/${original.commandId}`),
          { headers: a.headers },
        )
      ).status(),
    ).toBe(404);
    expect(snapshot(await warehouseOrder(a, one.id))).toEqual(
      snapshot(beforeOne),
    );
    expect(snapshot(await warehouseOrder(a, two.id))).toEqual(
      snapshot(changedTwo),
    );
    for (const input of await dialog
      .getByLabel("ملاحظات التوصيل (اختياري)", { exact: true })
      .all())
      await expect(input).toHaveValue("Preserved stale batch note");
    await dialog
      .getByRole("button", { name: "مراجعة النطاق الحالي", exact: true })
      .click();
    await expect(dialog).toContainText("لم يتم إرسال إجراء حفظ");
    await expect(
      dialog.getByRole("button", { name: "تأكيد الإجراء", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
    await openPieceAction(a, one, 1, "DISPATCH");
    const later = await saveWarehouse(a);
    expect(later.body.orders.map((order) => order.orderId)).toEqual([one.id]);
    await openPieceAction(b, two, 1, "CONFIRM_DELIVERY");
    const empty = await saveWarehouse(b);
    expect(empty.body).toMatchObject({
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          orderId: two.id,
          pieceIds: beforeTwo.summary.matchingPieceIds.toSorted(),
          recipient: null,
          deliveredAt: null,
          notes: null,
        },
      ],
    });
    expect(
      (await warehouseOrder(a, two.id)).currentAttempt?.outcome,
    ).toMatchObject({
      kind: "DELIVERED",
      recipient: null,
      deliveredAt: null,
      notes: null,
    });
  } finally {
    await run.close();
  }
});

test("P07 US5 repeated acknowledged returns retain attempts and explicit retry dates", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("WAREHOUSE"),
      b = await run.worker("WAREHOUSE"),
      order = await readyOrder(run, a);
    const before = await warehouseOrder(a, order.id),
      baselineHistory = await allHistory(a, order.id);
    const dispatches: Awaited<ReturnType<typeof saveWarehouse>>[] = [];
    const attempts: string[] = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      await openPieceAction(a, order, 1, "DISPATCH");
      dispatches.push(await saveWarehouse(a));
      const dispatched = await warehouseOrder(b, order.id);
      expect(dispatched.currentAttempt?.number).toBe(cycle + 1);
      const attemptId = dispatched.currentAttempt?.id;
      if (!attemptId) throw new Error("Real dispatched attempt required");
      attempts.push(attemptId);
      let dialog = await openPieceAction(a, order, 1, "FAIL_DELIVERY");
      await expect(dialog.getByLabel(/أؤكد عودة جميع قطع/)).not.toBeChecked();
      await dialog
        .getByLabel("ملاحظات", { exact: true })
        .fill(`Return notes ${String(cycle)}`);
      let writes = 0;
      const count = (request: Request) => {
        if (
          new URL(request.url()).pathname === "/api/v1/warehouse/commands" &&
          request.method() === "POST"
        )
          writes++;
      };
      a.page.on("request", count);
      try {
        await dialog
          .getByRole("button", { name: "تأكيد الإجراء", exact: true })
          .click();
        await expect(dialog.getByText(/سبب تعذر التسليم مطلوب/)).toBeVisible();
        await dialog
          .getByLabel("سبب تعذر التسليم", { exact: true })
          .fill("   ");
        await dialog
          .getByRole("button", { name: "تأكيد الإجراء", exact: true })
          .click();
        await expect(dialog.getByText(/سبب تعذر التسليم مطلوب/)).toBeVisible();
        expect(writes).toBe(0);
        expect(
          (await warehouseOrder(b, order.id)).currentAttempt?.outcome,
        ).toBeNull();
        await expect(dialog.getByLabel("ملاحظات", { exact: true })).toHaveValue(
          `Return notes ${String(cycle)}`,
        );
      } finally {
        a.page.off("request", count);
      }
      await dialog
        .getByRole("button", { name: "العميل غير متواجد بالموقع", exact: true })
        .click();
      await expect(
        dialog.getByLabel("سبب تعذر التسليم", { exact: true }),
      ).toHaveValue("العميل غير متواجد بالموقع");
      await dialog
        .getByLabel("سبب تعذر التسليم", { exact: true })
        .fill("Customer unavailable");
      a.page.on("request", count);
      try {
        await dialog
          .getByRole("button", { name: "تأكيد الإجراء", exact: true })
          .click();
        await expect(dialog.getByLabel(/أؤكد عودة جميع قطع/)).toHaveAttribute(
          "aria-invalid",
          "true",
        );
        expect(writes).toBe(0);
        expect(
          (await warehouseOrder(b, order.id)).currentAttempt?.outcome,
        ).toBeNull();
      } finally {
        a.page.off("request", count);
      }
      await dialog.getByLabel(/أؤكد عودة جميع قطع/).check();
      const failure = await saveWarehouse(a);
      expect(failure.body).toMatchObject({
        operation: "FAIL_DELIVERY",
        orders: [
          {
            attemptId,
            returnedToWarehouse: true,
            reason: "Customer unavailable",
            notes: `Return notes ${String(cycle)}`,
          },
        ],
      });
      let current = await warehouseOrder(b, order.id);
      expect(current.summary.status).toBe("DELIVERY_FAILED");
      expect(current.currentAttempt?.outcome).toMatchObject({
        kind: "FAILED",
        returnedToWarehouse: true,
        reason: "Customer unavailable",
        recordedBy: failure.result.receipt.actor,
        recordedAt: failure.result.receipt.occurredAt,
      });
      await rejected(
        await post(a, "/warehouse/commands", {
          commandId: crypto.randomUUID(),
          operation: "DISPATCH",
          orders: [
            {
              orderId: order.id,
              expectedVersion: current.summary.version,
              pieceIds: current.summary.matchingPieceIds,
            },
          ],
        }),
        "ORDER_STATE_CONFLICT",
      );
      expect(snapshot(await warehouseOrder(b, order.id))).toEqual(
        snapshot(current),
      );
      dialog = await openPieceAction(a, order, 1, "RETRY_DELIVERY");
      const date = dialog.getByLabel("موعد المحاولة الجديدة (اختياري)", {
        exact: true,
      });
      await expect(date).toHaveValue("");
      await dialog
        .getByLabel("ملاحظات", { exact: true })
        .fill(`Retry notes ${String(cycle)}`);
      await date.fill("2026-02-30");
      await dialog
        .getByRole("button", { name: "تأكيد الإجراء", exact: true })
        .click();
      await expect(date).toHaveAttribute("aria-invalid", "true");
      expect(snapshot(await warehouseOrder(b, order.id))).toEqual(
        snapshot(current),
      );
      await expect(dialog.getByLabel("ملاحظات", { exact: true })).toHaveValue(
        `Retry notes ${String(cycle)}`,
      );
      await date.fill(cycle === 0 ? "" : "2026-11-15");
      const retry = await saveWarehouse(a);
      expect(retry.body).toMatchObject({
        operation: "RETRY_DELIVERY",
        orders: [{ attemptId, retryDate: cycle === 0 ? null : "2026-11-15" }],
      });
      current = await warehouseOrder(b, order.id);
      expect(current.summary.status).toBe("READY_FOR_DELIVERY");
      expect(current.currentAttempt?.id).toBe(attemptId);
      expect(current.currentAttempt?.retry).toMatchObject({
        retryDate: cycle === 0 ? null : "2026-11-15",
        notes: `Retry notes ${String(cycle)}`,
      });
      expect(current.receiptGroups).toEqual(before.receiptGroups);
      expect(current.summary.counts).toEqual(before.summary.counts);
      expect(current.paper.order.deliveryDate).toBe(
        before.paper.order.deliveryDate,
      );
      expect(physicalTerms(current)).toEqual(physicalTerms(before));
    }
    await openPieceAction(a, order, 1, "DISPATCH");
    await saveWarehouse(a);
    let current = await warehouseOrder(b, order.id);
    expect(current.currentAttempt?.number).toBe(3);
    expect(attempts).not.toContain(current.currentAttempt?.id);
    await openPieceAction(a, order, 1, "CONFIRM_DELIVERY");
    await saveWarehouse(a);
    current = await warehouseOrder(b, order.id);
    expect(current.summary.status).toBe("DELIVERED");
    const history = await allHistory(b, order.id),
      events = history.filter((item) => item.kind === "warehouse");
    expect(events).toHaveLength(9);
    for (const event of events.filter(
      (item) => item.event.operation === "DISPATCH",
    )) {
      expect(event.event.attempt).toMatchObject({
        status: "DISPATCHED",
        outcome: null,
        retry: null,
      });
    }
    for (const id of attempts) {
      expect(
        events.filter(
          (item) =>
            item.event.operation === "FAIL_DELIVERY" &&
            item.event.attempt?.id === id,
        ),
      ).toHaveLength(1);
      expect(
        events.filter(
          (item) =>
            item.event.operation === "RETRY_DELIVERY" &&
            item.event.attempt?.id === id,
        ),
      ).toHaveLength(1);
    }
    expect(history.filter((item) => item.kind !== "warehouse")).toEqual(
      baselineHistory.filter((item) => item.kind !== "warehouse"),
    );
    await rejected(
      await post(a, "/warehouse/commands", {
        commandId: crypto.randomUUID(),
        operation: "CONFIRM_DELIVERY",
        orders: [
          {
            orderId: order.id,
            expectedVersion: current.summary.version,
            pieceIds: current.summary.matchingPieceIds,
            attemptId: attempts[0],
          },
        ],
      }),
      "ORDER_STATE_CONFLICT",
    );
    const financial = await dataFrom(
      await run.sales.page.request.get(api(`/sales-orders/${order.id}`), {
        headers: run.sales.headers,
      }),
      salesOrderDataSchema,
    );
    expect(financial.order.customerSnapshot).toEqual(order.customerSnapshot);
    expect(financial.order.money).toEqual(order.money);
    expect(
      financial.order.pieces.map((piece) => ({
        id: piece.id,
        unitPrice: piece.unitPrice,
        catalogSourceId: piece.catalogSourceId,
      })),
    ).toEqual(
      order.pieces.map((piece) => ({
        id: piece.id,
        unitPrice: piece.unitPrice,
        catalogSourceId: piece.catalogSourceId,
      })),
    );
    const original = dispatches[0];
    if (!original) throw new Error("Original accepted command required");
    const replay = await warehouseCommand(a, original.body);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(original.result.receipt);
    expect(snapshot(await warehouseOrder(b, order.id))).toEqual(
      snapshot(current),
    );
    expect(await allHistory(b, order.id)).toEqual(history);
  } finally {
    await run.close();
  }
});

const barrier = () => {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const prepareWarehouseRecovery = async (
  session: Session,
  order: Awaited<ReturnType<typeof readyOrder>>,
) => {
  await goto(session.page, "/warehouse/dashboard");
  await session.page.evaluate(() => {
    document.documentElement.dataset["p07RecoveryWitness"] = "same-document";
  });
  await session.page.locator('main a[href="/warehouse/ready"]').first().click();
  await session.page.getByRole("textbox").fill(order.businessNumber);
  await session.page
    .getByRole("button", { name: "حسب القطعة", exact: true })
    .click();
  const checkbox = session.page.getByRole("checkbox", {
    name: `تحديد القطعة 1 من ${order.businessNumber}`,
    exact: true,
  });
  await session.page
    .getByRole("row")
    .filter({ has: checkbox })
    .getByRole("button", { name: rowActions.DISPATCH, exact: true })
    .click();
  const dialog = session.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};

test("P07 US6 committed lost reply survives unmount and exact replay without duplicate effects", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("WAREHOUSE"),
      b = await run.worker("WAREHOUSE"),
      order = await readyOrder(run, a),
      before = await warehouseOrder(a, order.id);
    const dialog = await prepareWarehouseRecovery(a, order),
      bodies: unknown[] = [];
    let original:
      ReturnType<typeof warehouseCommandDataSchema.parse> | undefined;
    await a.page.route("**/api/v1/warehouse/commands", async (route) => {
      bodies.push(
        warehouseCommandBodySchema.parse(route.request().postDataJSON()),
      );
      const response = await route.fetch(),
        saved = await dataFrom(response, warehouseCommandDataSchema);
      if (bodies.length === 1) {
        original = saved;
        await route.abort("failed");
      } else {
        expect(saved.replayed).toBe(true);
        expect(saved.receipt).toEqual(original?.receipt);
        expect(saved.outcome).toEqual(original?.outcome);
        await route.fulfill({ response });
      }
    });
    await dialog
      .getByRole("button", { name: "تأكيد الإجراء", exact: true })
      .click();
    const recovery = a.page.getByLabel("متابعة نتيجة الإجراء", { exact: true });
    await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    await a.page.goBack();
    await expect(a.page).toHaveURL(/\/warehouse\/dashboard$/u);
    await expect(a.page.locator("html")).toHaveAttribute(
      "data-p07-recovery-witness",
      "same-document",
    );
    await expect(recovery).toHaveCount(1);
    if (!original) throw new Error("Real committed command required");
    const receiptPath = `/warehouse-commands/${original.receipt.commandId}`;
    await a.page.route(`**/api/v1${receiptPath}`, async (route) => {
      await dataFrom(await route.fetch(), warehouseCommandDataSchema);
      await route.abort("failed");
    });
    await recovery
      .getByRole("button", { name: "التحقق من النتيجة", exact: true })
      .click();
    await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
    expect(bodies).toHaveLength(1);
    await recovery
      .getByRole("button", { name: "إعادة نفس الإجراء", exact: true })
      .click();
    await expect(recovery).toContainText("تم حفظ الإجراء وتحديث البيانات");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    await recovery
      .getByRole("button", { name: "إغلاق التأكيد", exact: true })
      .click();
    await a.page.unroute(`**/api/v1${receiptPath}`);
    const saved = await warehouseOrder(b, order.id);
    expect(saved.summary.version).toBe(before.summary.version + 1);
    expect(saved.currentAttempt?.number).toBe(1);
    expect(saved.receiptGroups).toEqual(before.receiptGroups);
    expect(
      (await allHistory(b, order.id)).filter(
        (item) =>
          item.kind === "warehouse" &&
          item.event.commandId === original?.receipt.commandId,
      ),
    ).toHaveLength(1);
    for (const session of [b, run.admin]) {
      const foreign = await session.page.request.get(api(receiptPath), {
        headers: session.headers,
      });
      const missing = await session.page.request.get(
        api(`/warehouse-commands/${crypto.randomUUID()}`),
        { headers: session.headers },
      );
      expect(foreign.status()).toBe(404);
      expect(missing.status()).toBe(404);
      expect(errorEnvelopeSchema.parse(await foreign.json()).code).toBe(
        errorEnvelopeSchema.parse(await missing.json()).code,
      );
    }
    const originalReceipt = original.receipt;
    const activityRead = responseFor(a.page, "/warehouse/activity", "GET");
    await goto(a.page, "/warehouse/activity");
    await dataFrom(await activityRead, warehouseActivityDataSchema);
    const reloadedActivity = responseFor(a.page, "/warehouse/activity", "GET");
    await reloadAuthenticated(a);
    const activity = await dataFrom(
      await reloadedActivity,
      warehouseActivityDataSchema,
    );
    expect(
      activity.events.find(
        ({ event }) => event.commandId === originalReceipt.commandId,
      )?.event,
    ).toMatchObject({
      commandId: originalReceipt.commandId,
      orderId: order.id,
      actor: originalReceipt.actor,
      operation: "DISPATCH",
    });
    await expect(recovery).toHaveCount(0);
    const row = a.page
      .getByRole("row")
      .filter({ hasText: order.businessNumber })
      .filter({ hasText: "خروج" });
    const observed = responseFor(a.page, receiptPath, "GET");
    await row
      .getByRole("button", { name: "التحقق من النتيجة الأصلية", exact: true })
      .click();
    expect(
      (await dataFrom(await observed, warehouseCommandDataSchema)).receipt,
    ).toEqual(original.receipt);
    await expect(row.getByRole("status")).toContainText(
      original.receipt.commandId,
    );
    await expect(
      a.page.getByRole("button", { name: "إعادة نفس الإجراء", exact: true }),
    ).toHaveCount(0);
    expect(
      await a.page.evaluate(
        ({ commandId, pieceId }) =>
          [localStorage, sessionStorage].some((store) =>
            Object.keys(store).some((key) =>
              [key, store.getItem(key) ?? ""].some((text) =>
                [commandId, pieceId].some((id) => text.includes(id)),
              ),
            ),
          ),
        {
          commandId: original.receipt.commandId,
          pieceId: order.pieces[0]?.id ?? "missing",
        },
      ),
    ).toBe(false);
  } finally {
    await run.close();
  }
});

test("P07 US6 missing observation before admission stays unknown and exact replay saves once", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport),
    entered = barrier(),
    release = barrier(),
    settled = barrier();
  let routeFailure: unknown;
  const routing = { entered: false };
  try {
    const a = await run.worker("WAREHOUSE"),
      order = await readyOrder(run, a),
      before = await warehouseOrder(a, order.id),
      bodies: unknown[] = [];
    const dialog = await prepareWarehouseRecovery(a, order);
    await a.page.route("**/api/v1/warehouse/commands", async (route) => {
      routing.entered = true;
      const body = warehouseCommandBodySchema.parse(
        route.request().postDataJSON(),
      );
      bodies.push(body);
      if (bodies.length === 1) {
        await route.abort("failed");
        entered.release();
        try {
          await release.promise;
          await warehouseCommand(a, body);
        } catch (error: unknown) {
          routeFailure = error;
        } finally {
          settled.release();
        }
      } else {
        const response = await route.fetch();
        await dataFrom(response, warehouseCommandDataSchema);
        await route.fulfill({ response });
      }
    });
    await dialog
      .getByRole("button", { name: "تأكيد الإجراء", exact: true })
      .click();
    await entered.promise;
    const recovery = a.page.getByLabel("متابعة نتيجة الإجراء", { exact: true });
    await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    await recovery
      .getByRole("button", { name: "التحقق من النتيجة", exact: true })
      .click();
    await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
    expect(bodies).toHaveLength(1);
    expect(snapshot(await warehouseOrder(a, order.id))).toEqual(
      snapshot(before),
    );
    await recovery
      .getByRole("button", { name: "إعادة نفس الإجراء", exact: true })
      .click();
    await expect(recovery).toContainText("تم حفظ الإجراء وتحديث البيانات");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    release.release();
    await settled.promise;
    expect(routeFailure).toBeUndefined();
    const current = await warehouseOrder(a, order.id);
    expect(current.summary.version).toBe(before.summary.version + 1);
    expect(current.currentAttempt?.number).toBe(1);
    expect(
      (await allHistory(a, order.id)).filter(
        (item) =>
          item.kind === "warehouse" && item.event.operation === "DISPATCH",
      ),
    ).toHaveLength(1);
  } finally {
    release.release();
    if (routing.entered) await settled.promise;
    await run.close();
  }
});

test("P07 US6 confirmed save retries only synchronization and dirty read failures guard submission", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("WAREHOUSE"),
      b = await run.worker("WAREHOUSE"),
      order = await readyOrder(run, a),
      before = await warehouseOrder(a, order.id);
    const dialog = await prepareWarehouseRecovery(a, order);
    await dialog
      .getByLabel("ملاحظات التوصيل (اختياري)", { exact: true })
      .fill("Retained dirty dispatch");
    // A colleague completes a real return/retry cycle while this reviewed version remains open.
    for (const operation of [
      "DISPATCH",
      "FAIL_DELIVERY",
      "RETRY_DELIVERY",
    ] as const) {
      const current = await warehouseOrder(b, order.id);
      await warehouseCommand(b, {
        commandId: crypto.randomUUID(),
        operation,
        orders: [
          {
            orderId: order.id,
            expectedVersion: current.summary.version,
            pieceIds: current.summary.matchingPieceIds,
            ...(operation === "DISPATCH"
              ? {}
              : { attemptId: current.currentAttempt?.id }),
            ...(operation === "FAIL_DELIVERY"
              ? { returnedToWarehouse: true, reason: "Owned colleague return" }
              : {}),
          },
        ],
      });
    }
    let writes = 0;
    const count = (request: Request) => {
      if (
        new URL(request.url()).pathname === "/api/v1/warehouse/commands" &&
        request.method() === "POST"
      )
        writes++;
    };
    a.page.on("request", count);
    const stale = responseFor(a.page, "/warehouse/commands");
    await dialog
      .getByRole("button", { name: "تأكيد الإجراء", exact: true })
      .click();
    await rejected(await stale, "ORDER_VERSION_CONFLICT");
    expect(writes).toBe(1);
    let readsFail = true;
    await a.page.route(
      `**/api/v1/warehouse/orders/${order.id}`,
      async (route) => {
        if (readsFail) {
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      },
    );
    await dialog
      .getByRole("button", { name: "مراجعة النطاق الحالي", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "إعادة تحميل البيانات", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "تأكيد الإجراء", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByLabel("ملاحظات التوصيل (اختياري)", { exact: true }),
    ).toHaveValue("Retained dirty dispatch");
    await dialog.locator("form").evaluate((form) => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await dialog
      .getByLabel("ملاحظات التوصيل (اختياري)", { exact: true })
      .press("Enter");
    expect(writes).toBe(1);
    readsFail = false;
    await dialog
      .getByRole("button", { name: "إعادة تحميل البيانات", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "مراجعة النطاق الحالي", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "تأكيد الإجراء", exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByLabel("ملاحظات التوصيل (اختياري)", { exact: true }),
    ).toHaveValue("Retained dirty dispatch");
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
    await a.page.unroute(`**/api/v1/warehouse/orders/${order.id}`);
    let saved = false;
    await a.page.route("**/api/v1/warehouse/commands", async (route) => {
      const response = await route.fetch();
      await dataFrom(response, warehouseCommandDataSchema);
      saved = true;
      await route.fulfill({ response });
    });
    await a.page.route("**/api/v1/warehouse/**", async (route) => {
      if (saved && route.request().method() === "GET") {
        await route.fetch();
        await route.abort("failed");
      } else await route.fallback();
    });
    await dialog
      .getByRole("button", { name: "تأكيد الإجراء", exact: true })
      .click();
    const recovery = a.page.getByLabel("متابعة نتيجة الإجراء", { exact: true });
    await expect(recovery).toContainText(
      "تم حفظ الإجراء، لكن تعذر تحديث العرض",
    );
    expect(writes).toBe(2);
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    await a.page.unroute("**/api/v1/warehouse/**");
    await recovery
      .getByRole("button", { name: "تحديث البيانات المحفوظة", exact: true })
      .click();
    await expect(recovery).toContainText("تم حفظ الإجراء وتحديث البيانات");
    expect(writes).toBe(2);
    const current = await warehouseOrder(a, order.id);
    expect(current.summary.version).toBe(before.summary.version + 4);
    expect(current.currentAttempt?.number).toBe(2);
    a.page.off("request", count);
  } finally {
    await run.close();
  }
});

test("P07 US6 account replacement fences late private receipt publication", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport),
    accepted = barrier(),
    deliver = barrier(),
    settled = barrier();
  let routeFailure: unknown;
  const routing = { entered: false };
  try {
    const a = await run.isolatedWorker("WAREHOUSE"),
      b = await run.worker("WAREHOUSE"),
      order = await readyOrder(run, a),
      dialog = await prepareWarehouseRecovery(a, order);
    let original:
        ReturnType<typeof warehouseCommandDataSchema.parse> | undefined,
      writes = 0;
    await a.page.route("**/api/v1/warehouse/commands", async (route) => {
      routing.entered = true;
      try {
        writes++;
        const response = await route.fetch();
        original = await dataFrom(response, warehouseCommandDataSchema);
        accepted.release();
        await deliver.promise;
        await route.fulfill({ response });
      } catch (error: unknown) {
        routeFailure = error;
        accepted.release();
        await route.abort("failed");
      } finally {
        settled.release();
      }
    });
    await dialog
      .getByRole("button", { name: "تأكيد الإجراء", exact: true })
      .click();
    await accepted.promise;
    expect(routeFailure).toBeUndefined();
    await expect(
      dialog.getByRole("button", { name: "تأكيد الإجراء", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    const menu = a.page.getByRole("button", {
      name: "فتح القائمة الجانبية",
      exact: true,
    });
    if (await menu.isVisible()) await menu.click();
    await a.page.locator(".oriental-logout-btn").click();
    await expect(a.page).toHaveURL(/\/auth\/login/u);
    const replacement = departmentColleagues
      .get("WAREHOUSE")
      ?.find((identity) => identity.email === b.email);
    if (!replacement) throw new Error("Owned replacement required");
    await a.page
      .getByLabel("البريد الإلكتروني", { exact: true })
      .fill(replacement.email);
    await a.page
      .getByLabel("كلمة المرور", { exact: true })
      .fill(replacement.password);
    await a.page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .click();
    await expect(a.page).toHaveURL(/\/warehouse\/dashboard$/u);
    deliver.release();
    await settled.promise;
    expect(routeFailure).toBeUndefined();
    await expect(
      a.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
    ).toHaveCount(0);
    await expect(
      a.page.getByText("تم حفظ الإجراء وتحديث البيانات.", { exact: true }),
    ).toHaveCount(0);
    if (!original) throw new Error("Real old-context receipt required");
    expect(writes).toBe(1);
    expect(
      (await warehouseOrder(b, order.id)).currentAttempt?.dispatchedBy,
    ).toEqual(original.receipt.actor);
    expect(
      (
        await b.page.request.get(
          api(`/warehouse-commands/${original.receipt.commandId}`),
          { headers: b.headers },
        )
      ).status(),
    ).toBe(404);
    await expect(
      a.page.getByText(original.receipt.commandId, { exact: false }),
    ).toHaveCount(0);
  } finally {
    deliver.release();
    if (routing.entered) await settled.promise;
    await run.close();
  }
});

test("P07 US6 access safe projections aliases keyboard and page-scoped selection", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("WAREHOUSE"),
      wrong = await run.worker("CUTTING"),
      order = await readyOrder(run, a),
      upstream = await createOrder(run.sales, run.approver, "SHOP", 1);
    const denied = await wrong.page.request.get(
      api(`/warehouse/orders/${order.id}`),
      { headers: wrong.headers },
    );
    expect(denied.status()).toBe(403);
    expect(errorEnvelopeSchema.parse(await denied.json()).code).toBe(
      "DEPARTMENT_ACCESS_DENIED",
    );
    const deniedWrite = await post(wrong, "/warehouse/commands", {
      commandId: crypto.randomUUID(),
      operation: "DISPATCH",
      orders: [
        {
          orderId: order.id,
          expectedVersion: 1,
          pieceIds: order.pieces.map((piece) => piece.id),
        },
      ],
    });
    expect(deniedWrite.status()).toBe(403);
    expect(
      (
        await a.page.request.get(api(`/warehouse/orders/${upstream.id}`), {
          headers: a.headers,
        })
      ).status(),
    ).toBe(404);
    for (const session of [a, run.admin]) {
      const safe = await warehouseOrder(session, order.id);
      expect(Object.keys(safe.deliveryContact).toSorted()).toEqual([
        "address",
        "name",
        "phone",
      ]);
      expect(safe.deliveryContact).toMatchObject({
        name: "P07 owned browser customer",
        address: "P07 private address",
      });
      const forbidden = new Set([
        "email",
        "totalAmount",
        "paidAmount",
        "remainingAmount",
        "unitPrice",
        "customerSnapshot",
        "password",
        "refreshToken",
      ]);
      const inspect = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(inspect);
          return;
        }
        if (value && typeof value === "object")
          for (const [key, item] of Object.entries(value)) {
            expect(forbidden.has(key)).toBe(false);
            inspect(item);
          }
      };
      inspect(safe);
      await goto(session.page, `/warehouse/orders/${order.id}?tab=form`);
      await expect(
        session.page.getByRole("button", {
          name: "المواصفات المعتمدة للمصنع",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(session.page.locator("main")).not.toContainText(
        "private.customer@p07-e2e.test",
      );
      await expect(
        session.page.getByRole("button", { name: /طباعة/ }),
      ).toHaveCount(0);
    }
    await goto(a.page, "/warehouse");
    await expect(a.page).toHaveURL(/\/warehouse\/dashboard$/u);
    await goto(a.page, "/warehouse/in-progress");
    await expect(a.page).toHaveURL(/\/warehouse\/in-progress$/u);
    await expect(
      a.page.getByRole("heading", {
        name: "جاهز للتسليم (كامل القطع)",
        exact: true,
      }),
    ).toBeVisible();
    await goto(
      a.page,
      `/warehouse/tasks/${order.id}?pieceId=${order.pieces[0]?.id ?? "missing"}&tab=history`,
    );
    await expect(a.page).toHaveURL(
      new RegExp(
        `/warehouse/orders/${order.id}\\?pieceId=.*&tab=history$`,
        "u",
      ),
    );
    await expect(
      a.page.getByRole("heading", {
        name: `أمر التفصيل ${order.businessNumber}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(a.page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(
      await a.page
        .locator("body")
        .evaluate((element) => getComputedStyle(element).fontFamily),
    ).toMatch(/Cairo/iu);
    const dialog = await openPieceAction(a, order, 1, "DISPATCH");
    const note = dialog.getByLabel("ملاحظات التوصيل (اختياري)", {
      exact: true,
    });
    await note.focus();
    await note.press("Tab");
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
    await dialog.getByRole("button", { name: "إلغاء", exact: true }).focus();
    await a.page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "إغلاق النافذة", exact: true }),
    ).toBeFocused();
    await note.fill("Keyboard draft");
    await a.page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => a.page.evaluate(() => document.activeElement?.textContent))
      .toContain(rowActions.DISPATCH);
    await a.page.keyboard.press("Enter");
    await expect(a.page.getByRole("dialog")).toBeVisible();
    await a.page
      .getByRole("dialog")
      .getByRole("button", { name: "إلغاء", exact: true })
      .click();
    for (const [path, heading] of [
      ["incomplete", "أوامر غير مكتملة بالمستودع"],
      ["out-for-delivery", "خرج للتوصيل"],
      ["delivery-failed", "تعذر التسليم"],
      ["delivered", "تم التسليم"],
    ] as const) {
      await goto(a.page, `/warehouse/${path}`);
      await expect(
        a.page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await wrong.page.goto(
      `${readE2eRuntime().webOrigin}/warehouse/orders/${order.id}`,
    );
    await expect(wrong.page).toHaveURL(/\/unauthorized$/u);
    await expect(
      wrong.page.getByRole("heading", {
        name: `أمر التفصيل ${order.businessNumber}`,
        exact: true,
      }),
    ).toHaveCount(0);
    const many = await createOrder(run.sales, run.approver, "SHOP", 26);
    await handoff(
      run,
      many.id,
      many.pieces.map((piece) => piece.id),
    );
    await goto(a.page, "/warehouse/incoming");
    const search = a.page.getByRole("textbox", {
      name: /البحث برقم أمر التفصيل/u,
    });
    await search.focus();
    const originalSearch = await search.elementHandle();

    try {
      const filtered = a.page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/v1/warehouse/orders" &&
          url.searchParams.get("search") === many.businessNumber &&
          response.request().method() === "GET"
        );
      });
      await a.page.keyboard.type(` ${many.businessNumber} `);
      const result = await dataFrom(await filtered, warehouseOrdersDataSchema);
      expect(result.orders.map((summary) => summary.id)).toEqual([many.id]);
      expect(
        await originalSearch.evaluate(
          (element) =>
            element.isConnected && element === document.activeElement,
        ),
      ).toBe(true);
      await expect(search).toHaveValue(` ${many.businessNumber} `);
      await search.evaluate((element) => {
        if (element instanceof HTMLInputElement)
          element.setSelectionRange(2, 3);
      });
      await a.page.keyboard.type("H");
      await expect(search).toHaveValue(` ${many.businessNumber} `);
      expect(
        await originalSearch.evaluate((element) => ({
          connected: element.isConnected,
          focused: element === document.activeElement,
          caret:
            element instanceof HTMLInputElement ? element.selectionStart : null,
        })),
      ).toEqual({ connected: true, focused: true, caret: 3 });
    } finally {
      await originalSearch.dispose();
    }
    const type = a.page.getByRole("combobox", {
      name: "نوع أمر التفصيل",
      exact: true,
    });
    await type.focus();
    const originalType = await type.elementHandle();

    try {
      // Native macOS select menus ignore Playwright's arrow dispatch. Chromium's
      // trusted char event exercises Arabic keyboard type-ahead without changing DOM state.
      const keyboard = await a.page.context().newCDPSession(a.page);
      try {
        await keyboard.send("Input.dispatchKeyEvent", {
          type: "char",
          key: "ط",
          text: "ط",
        });
      } finally {
        await keyboard.detach();
      }
      await expect(type).toHaveValue("SHOP");
      expect(
        await originalType.evaluate(
          (element) =>
            element.isConnected && element === document.activeElement,
        ),
      ).toBe(true);
    } finally {
      await originalType.dispose();
    }
    const flat = a.page.getByRole("button", {
      name: "حسب القطعة",
      exact: true,
    });
    await flat.focus();
    const originalFlat = await flat.elementHandle();

    try {
      await a.page.keyboard.press("Enter");
      await expect(flat).toHaveAttribute("aria-pressed", "true");
      expect(
        await originalFlat.evaluate(
          (element) =>
            element.isConnected && element === document.activeElement,
        ),
      ).toBe(true);
    } finally {
      await originalFlat.dispose();
    }
    await expect(
      a.page.getByRole("checkbox", { name: /^تحديد القطعة /u }),
    ).toHaveCount(25);
    await a.page
      .getByRole("checkbox", { name: "تحديد قطع الصفحة", exact: true })
      .check();
    await expect(
      a.page.getByRole("checkbox", { name: /^تحديد القطعة /u, checked: true }),
    ).toHaveCount(25);
    let releasePage: () => void = () => {};
    const pageGate = new Promise<void>((resolve) => {
      releasePage = resolve;
    });
    let pageArrived: () => void = () => {};
    const pageStarted = new Promise<void>((resolve) => {
      pageArrived = resolve;
    });
    const piecesRoute = "**/api/v1/warehouse/pieces?**";
    await a.page.route(piecesRoute, async (route) => {
      if (new URL(route.request().url()).searchParams.get("page") === "2") {
        pageArrived();
        await pageGate;
      }
      await route.continue();
    });
    const pageTwo = a.page.getByRole("button", { name: "2", exact: true });
    await pageTwo.focus();
    const originalPage = await pageTwo.elementHandle();

    try {
      await a.page.keyboard.press("Enter");
      await pageStarted;
      await expect(a.page.getByText(/حسب آخر تحميل مؤكد/u)).toBeVisible();
      await expect(
        a.page.getByRole("checkbox", { name: /^تحديد القطعة /u }),
      ).toHaveCount(0);
      expect(
        await originalPage.evaluate(
          (element) =>
            element.isConnected && element === document.activeElement,
        ),
      ).toBe(true);
      releasePage();
      await expect(
        a.page.getByRole("checkbox", { name: /^تحديد القطعة /u }),
      ).toHaveCount(1);
      expect(
        await originalPage.evaluate(
          (element) =>
            element.isConnected && element === document.activeElement,
        ),
      ).toBe(true);
    } finally {
      releasePage();
      await a.page.unroute(piecesRoute);
      await originalPage.dispose();
    }
    await expect(
      a.page.getByRole("checkbox", { name: /^تحديد القطعة /u }),
    ).toHaveCount(1);
    await expect(
      a.page.getByRole("checkbox", { name: /^تحديد القطعة /u, checked: true }),
    ).toHaveCount(0);
    await expect(
      a.page.getByRole("checkbox", { name: "تحديد قطع الصفحة", exact: true }),
    ).not.toBeChecked();
    expect((await warehouseOrder(a, many.id)).summary.counts.received).toBe(0);
    await goto(a.page, "/warehouse/incoming");
    await a.page.getByRole("textbox").fill(`unmatched-${crypto.randomUUID()}`);
    await expect(
      a.page.getByText("لا توجد أوامر مطابقة في هذا القسم.", { exact: true }),
    ).toBeVisible();
    await goto(a.page, `/warehouse/orders/${upstream.id}`);
    await expect(a.page.locator("main").getByRole("alert")).toBeVisible();
    await expect(
      a.page.getByRole("heading", {
        name: `أمر التفصيل ${order.businessNumber}`,
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await run.close();
  }
});
