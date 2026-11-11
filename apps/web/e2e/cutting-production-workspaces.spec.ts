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
  reportIssueBodySchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
  catalogDataSchema,
  catalogQuoteDataSchema,
  customerCommandDataSchema,
  salesOrderCommandDataSchema,
  salesOrderDataSchema,
  approvalCommandDataSchema,
  approvalOrderDataSchema,
  manufacturingOrderDataSchema,
  manufacturingOrdersDataSchema,
  manufacturingPiecesDataSchema,
  manufacturingActivityDataSchema,
  manufacturingOrderHistoryDataSchema,
  manufacturingCommandDataSchema,
  manufacturingCommandBodySchema,
  type ManufacturingDepartment,
  type ManufacturingCommandBody,
  type SalesOrderType,
} from "@template/contracts";
import {
  readE2eRuntime,
  waitForCapturedAction,
  type E2eRuntimeIdentity,
} from "./runtime";

test.use({ actionTimeout: 15_000 });
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
      `P05 HTTP ${String(response.status())} ${failure.code} fields:${(failure.errors ?? []).map((issue) => issue.field).join(",")}`,
    );
  }
  return schema.parse(successEnvelopeSchema.parse(raw).data);
};
type SessionCookies = Awaited<ReturnType<BrowserContext["cookies"]>>;
// Synthetic fixture identities/cookies stay in this worker's memory only.
// Every context/QueryClient is fresh; no cookies or operational state are written to disk.
type WorkerIdentity = Pick<E2eRuntimeIdentity, "email" | "password">;
const fixtureSessionCookies = new Map<string, SessionCookies>();
const departmentColleagues = new Map<
  ManufacturingDepartment,
  WorkerIdentity[]
>();
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
      throw new Error("P05 owned session observation failed");
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
  if (!fixture) throw new Error("P05 project fixture missing");
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
      department: ManufacturingDepartment,
    ): Promise<WorkerIdentity> => {
      const context = await browser.newContext(
        viewport === null ? {} : { viewport },
      );
      owned.push(context);
      const page = await context.newPage();
      const email = `p05.${crypto.randomUUID()}@p05-e2e.test`;
      const password = "P05!SyntheticWorker2026";
      await goto(page, "/auth/register");
      await page
        .getByLabel("الاسم الكامل")
        .fill(`P05 ${department} ${email.slice(4, 12)}`);
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
    const claimedColleagues = new Map<ManufacturingDepartment, number>();
    const worker = async (department: ManufacturingDepartment) => {
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
    const isolatedWorker = async (department: ManufacturingDepartment) =>
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
              throw new Error("P05 fixture auth cookies missing");
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
          name: "P05 owned browser customer",
          phone: `050${String(Date.now()).slice(-7)}`,
          address: "P05 private address",
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
    face: "P05 retained face",
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
        capture: { type, customerId: customer.id, paidAmount: "0.00", pieces },
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
const task = (
  session: Session,
  department: ManufacturingDepartment,
  id: string,
  pieceIds: readonly string[],
) =>
  goto(
    session.page,
    `/${department.toLowerCase()}/tasks/${id}?${pieceIds.map((piece) => `pieceId=${piece}`).join("&")}`,
  );
const workUi = async (
  session: Session,
  department: ManufacturingDepartment,
  id: string,
  pieceIds: readonly string[],
  operation: ManufacturingCommandBody["operation"],
) => {
  const action =
    operation === "RECEIVE_AND_START"
      ? "استلام وبدء العمل"
      : operation === "CONTINUE"
        ? "متابعة العمل"
        : "إتمام وتحويل";
  if (pieceIds.length === 1) {
    await task(session, department, id, pieceIds);
    const live = await readOrder(session, department, id);
    const requestedPiece = pieceIds[0];
    if (!requestedPiece) throw new Error("Exact task piece missing");
    expect(
      requirePiece(live, requestedPiece).work.allowedActions[
        operation === "RECEIVE_AND_START"
          ? "canReceiveAndStart"
          : operation === "CONTINUE"
            ? "canContinue"
            : "canCompleteTransfer"
      ],
    ).toBe(true);
    await session.page
      .getByRole("button", { name: action, exact: true })
      .click();
  } else {
    const detail = await readOrder(session, department, id);
    await goto(
      session.page,
      `/${department.toLowerCase()}/${operation === "RECEIVE_AND_START" ? "incoming" : "in-progress"}`,
    );
    await session.page
      .getByRole("textbox")
      .fill(detail.paper.order.businessNumber);
    await session.page
      .getByRole("button", { name: "حسب القطعة", exact: true })
      .click();
    for (const pieceId of pieceIds) {
      const { piece } = requirePiece(detail, pieceId);
      await session.page
        .getByRole("checkbox", {
          name: `تحديد القطعة ${String(piece.position)} من ${detail.paper.order.businessNumber}`,
          exact: true,
        })
        .check();
    }
    const label =
      operation === "RECEIVE_AND_START"
        ? "استلام وبدء المحدد"
        : operation === "CONTINUE"
          ? "متابعة المحدد"
          : "إتمام وتحويل المحدد";
    await session.page
      .getByRole("button", { name: label, exact: true })
      .click();
  }
  const dialog = session.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const pieceId of pieceIds)
    await expect(dialog.getByText(pieceId, { exact: false })).toBeVisible();
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  const pending = responseFor(
    session.page,
    `/manufacturing/${department.toLowerCase()}/commands`,
  );
  await dialog.getByRole("button", { name: /^تأكيد /u }).click();
  const response = await pending;
  const body = manufacturingCommandBodySchema.parse(
    response.request().postDataJSON(),
  );
  expect(body.orders).toEqual([
    {
      orderId: id,
      expectedVersion: body.orders[0]?.expectedVersion,
      pieceIds: [...pieceIds].sort(),
    },
  ]);
  const result = await dataFrom(response, manufacturingCommandDataSchema);
  await expect(dialog).toBeHidden();
  return result;
};
const requirePiece = (
  detail: z.infer<typeof manufacturingOrderDataSchema>,
  id: string,
) => {
  const piece = detail.paper.order.pieces.find((piece) => piece.id === id);
  const work = detail.work.find((work) => work.pieceId === id);
  if (!piece || !work) throw new Error("Exact physical piece missing");
  return { piece, work };
};
const safeKeys = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const child of value) safeKeys(child);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect([
      "money",
      "unitPrice",
      "paidAmount",
      "customerSnapshot",
      "phone",
      "address",
      "proposedSnapshot",
      "contactNotes",
      "responsibleSignature",
    ]).not.toContain(key);
    safeKeys(child);
  }
};

test("P05 US1 safe current and retained reads preserve routes exact selection and presentation", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const cutting = await run.worker("CUTTING");
    const production = await run.worker("PRODUCTION");
    const order = await createOrder(run.sales, run.approver);
    const detail = await readOrder(cutting, "CUTTING", order.id);
    const firstPiece = detail.paper.order.pieces[0];
    if (!firstPiece) throw new Error("Exact piece missing");
    safeKeys(detail);
    const visit = detail.work.find(
      (work) => work.pieceId === firstPiece.id,
    )?.visit;
    if (!visit) throw new Error("Actual current visit missing");
    for (const reference of [
      `itemId=${firstPiece.id}`,
      `segmentId=${visit.id}`,
    ]) {
      await goto(cutting.page, `/cutting/tasks/${order.id}?${reference}`);
      await expect(
        cutting.page.getByRole("button", {
          name: "استلام وبدء العمل",
          exact: true,
        }),
      ).toBeVisible();
    }
    await goto(
      cutting.page,
      `/cutting/tasks/${order.id}?segmentId=${crypto.randomUUID()}`,
    );
    await expect(
      cutting.page.getByRole("alert").filter({ hasText: "اختيار قطعة المهمة" }),
    ).toBeVisible();
    await expect(
      cutting.page.getByRole("button", {
        name: "استلام وبدء العمل",
        exact: true,
      }),
    ).toHaveCount(0);
    const denied = await production.page.request.get(
      api(`/manufacturing/production/orders/${order.id}`),
      { headers: production.headers },
    );
    expect(denied.status()).toBe(404);
    for (const [session, department] of [
      [cutting, "CUTTING"],
      [production, "PRODUCTION"],
    ] as const) {
      const role = department.toLowerCase();
      for (const [alias, destination] of [
        ["", "dashboard"],
        ["waiting", "incoming"],
        ["sent", "completed"],
      ] as const) {
        await goto(session.page, `/${role}/${alias}`);
        await expect(session.page).toHaveURL(
          new RegExp(`/${role}/${destination}$`, "u"),
        );
      }
      for (const route of [
        "dashboard",
        "incoming",
        "in-progress",
        "returned",
        "completed",
        "activity",
        ...(department === "PRODUCTION" ? ["repairs"] : []),
      ] as const) {
        await goto(session.page, `/${role}/${route}`);
        await expect(session.page.locator("html")).toHaveAttribute(
          "dir",
          "rtl",
        );
        await expect(session.page.locator("html")).toHaveAttribute(
          "lang",
          "ar",
        );
        await expect(session.page.locator("body")).toHaveCSS(
          "font-family",
          /Cairo/iu,
        );
        await expect(
          session.page.getByText("Application error", { exact: false }),
        ).toHaveCount(0);
      }
    }
    await goto(cutting.page, "/cutting/incoming");
    await cutting.page.getByRole("textbox").fill(order.businessNumber);
    await expect(
      cutting.page.getByRole("button", {
        name: new RegExp(order.businessNumber, "u"),
      }),
    ).toBeVisible();
    await cutting.page
      .getByRole("button", { name: new RegExp(order.businessNumber, "u") })
      .click();
    await expect(
      cutting.page.getByRole("checkbox", {
        name: `تحديد قطع ${order.businessNumber}`,
      }),
    ).toBeEnabled();
    await cutting.page
      .getByRole("button", { name: "حسب القطعة", exact: true })
      .click();
    const pieces = await dataFrom(
      await cutting.page.request.get(
        api(
          `/manufacturing/cutting/pieces?view=INCOMING&search=${order.businessNumber}`,
        ),
        { headers: cutting.headers },
      ),
      manufacturingPiecesDataSchema,
    );
    const groups = await dataFrom(
      await cutting.page.request.get(
        api(
          `/manufacturing/cutting/orders?view=INCOMING&search=${order.businessNumber}`,
        ),
        { headers: cutting.headers },
      ),
      manufacturingOrdersDataSchema,
    );
    expect(pieces.counts).toEqual({ orders: 1, pieces: 3 });
    expect(groups.counts).toEqual(pieces.counts);
    expect(pieces.items.map((row) => row.piece.id).sort()).toEqual(
      order.pieces.map((piece) => piece.id).sort(),
    );
    await task(cutting, "CUTTING", order.id, []);
    await expect(
      cutting.page.getByRole("heading", { name: "اختر قطعة لعرض المهمة" }),
    ).toBeVisible();
    await task(cutting, "CUTTING", order.id, [crypto.randomUUID()]);
    await expect(
      cutting.page.getByRole("alert").filter({ hasText: "اختيار قطعة المهمة" }),
    ).toContainText("اختيار قطعة المهمة");
    await expect(
      cutting.page.getByRole("button", {
        name: "استلام وبدء العمل",
        exact: true,
      }),
    ).toHaveCount(0);
    await command(
      cutting,
      "CUTTING",
      order.id,
      "RECEIVE_AND_START",
      order.pieces.map((piece) => piece.id),
    );
    await command(
      cutting,
      "CUTTING",
      order.id,
      "COMPLETE_TRANSFER",
      order.pieces.map((piece) => piece.id),
    );
    const retained = await readOrder(cutting, "CUTTING", order.id);
    safeKeys(retained);
    expect(
      retained.work.every(
        (work) => !Object.values(work.allowedActions).some(Boolean),
      ),
    ).toBe(true);
    await goto(cutting.page, `/cutting/orders/${order.id}`);
    await expect(
      cutting.page.getByRole("button", { name: /طباعة|PDF/iu }),
    ).toHaveCount(0);
    await task(cutting, "CUTTING", order.id, [
      detail.paper.order.pieces[0]?.id ?? "missing-piece",
    ]);
    await expect(
      cutting.page.getByRole("button", { name: "إتمام وتحويل", exact: true }),
    ).toHaveCount(0);
    await expect(
      cutting.page.getByRole("button", {
        name: "استلام وبدء العمل",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await run.close();
  }
});

for (const department of ["CUTTING", "PRODUCTION"] as const) {
  test(`P05 US2 ${department} colleague preserves starter and exact companions`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport);
    try {
      const a = await run.worker(department),
        b = await run.worker(department);
      const order = await createOrder(run.sales, run.approver);
      const ids = order.pieces.map((piece) => piece.id);
      const [p1, p2, p3] = ids;
      if (!p1 || !p2 || !p3) throw new Error("Three exact pieces required");
      if (department === "PRODUCTION") {
        await command(run.admin, "CUTTING", order.id, "RECEIVE_AND_START", ids);
        await command(run.admin, "CUTTING", order.id, "COMPLETE_TRANSFER", ids);
      }
      const start = await workUi(
        a,
        department,
        order.id,
        [p1, p2],
        "RECEIVE_AND_START",
      );
      const before = await readOrder(a, department, order.id);
      const original = requirePiece(before, p1).work.visit;
      expect(original?.startedBy?.id).toBe(start.receipt.actor.id);
      const continued = await workUi(b, department, order.id, [p1], "CONTINUE");
      expect(continued.receipt.actor.id).not.toBe(start.receipt.actor.id);
      const after = await readOrder(a, department, order.id);
      expect(requirePiece(after, p1).work.visit).toEqual(original);
      expect(requirePiece(after, p1).work.lastAction?.actor.id).toBe(
        continued.receipt.actor.id,
      );
      expect(requirePiece(after, p2)).toEqual(requirePiece(before, p2));
      expect(requirePiece(after, p3)).toEqual(requirePiece(before, p3));
      const unchanged = await post(
        b,
        `/manufacturing/${department.toLowerCase()}/commands`,
        {
          commandId: crypto.randomUUID(),
          operation: "CONTINUE",
          orders: [
            {
              orderId: order.id,
              expectedVersion: after.paper.order.version,
              pieceIds: [p1],
            },
          ],
        },
      );
      expect(unchanged.status()).toBe(409);
      expect(
        (await readOrder(b, department, order.id)).paper.order.version,
      ).toBe(after.paper.order.version);
      await workUi(b, department, order.id, [p1], "COMPLETE_TRANSFER");
      await reloadAuthenticated(a);
      const final = await readOrder(a, department, order.id);
      expect(requirePiece(final, p1).work.visit?.startedAt).toBe(
        original?.startedAt,
      );
      expect(requirePiece(final, p1).work.visit?.endedBy?.id).toBe(
        continued.receipt.actor.id,
      );
      expect(requirePiece(final, p2)).toEqual(requirePiece(before, p2));
    } finally {
      await run.close();
    }
  });
}

for (const type of [
  "SHOP",
  "EXTERNAL",
  "REPAIR",
  "GIFT",
  "READY",
  "ACCESSORY",
  "ADJUSTMENT",
] as const) {
  test(`P05 US3 ${type} exact subset follows both normal destinations`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport);
    try {
      const cutting = await run.worker("CUTTING"),
        production = await run.worker("PRODUCTION");
      const order = await createOrder(run.sales, run.approver, type);
      const [p1, p2, p3] = order.pieces;
      if (!p1 || !p2 || !p3) throw new Error("Three-piece fixture required");
      await workUi(
        cutting,
        "CUTTING",
        order.id,
        [p1.id, p2.id, p3.id],
        "RECEIVE_AND_START",
      );
      const before = await readOrder(cutting, "CUTTING", order.id);
      await workUi(
        cutting,
        "CUTTING",
        order.id,
        [p1.id, p3.id],
        "COMPLETE_TRANSFER",
      );
      const cut = await readOrder(cutting, "CUTTING", order.id);
      expect(requirePiece(cut, p2.id)).toEqual(requirePiece(before, p2.id));
      expect(cut.paper.order.counts.original).toBe(3);
      const prod = await readOrder(production, "PRODUCTION", order.id);
      for (const id of [p1.id, p3.id]) {
        expect(
          requirePiece(prod, id).work.allowedActions.canReceiveAndStart,
        ).toBe(true);
        expect(requirePiece(prod, id).piece.stage).toBe("PRODUCTION");
      }
      await workUi(
        production,
        "PRODUCTION",
        order.id,
        [p1.id, p3.id],
        "RECEIVE_AND_START",
      );
      await workUi(
        production,
        "PRODUCTION",
        order.id,
        [p1.id, p3.id],
        "COMPLETE_TRANSFER",
      );
      await reloadAuthenticated(cutting);
      await reloadAuthenticated(production);
      const final = await readOrder(cutting, "CUTTING", order.id);
      for (const id of [p1.id, p3.id]) {
        expect(requirePiece(final, id).piece.stage).toBe("QUALITY");
        expect(requirePiece(final, id).piece.workState).toBe("INCOMING");
      }
      expect(requirePiece(final, p2.id)).toEqual(requirePiece(before, p2.id));
      const sales = (
        await dataFrom(
          await run.sales.page.request.get(api(`/sales-orders/${order.id}`), {
            headers: run.sales.headers,
          }),
          salesOrderDataSchema,
        )
      ).order;
      expect(sales.money).toEqual(order.money);
      expect(sales.counts.original).toBe(3);
      expect(sales.counts.received).toBe(0);
    } finally {
      await run.close();
    }
  });
}

test("P05 US3 stale cross-order confirmation rejects every selected piece unchanged", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const cutting = await run.worker("CUTTING"),
      other = await run.worker("CUTTING");
    const first = await createOrder(run.sales, run.approver),
      second = await createOrder(run.sales, run.approver);
    const a = first.pieces[0],
      b = second.pieces[0];
    if (!a || !b) throw new Error("Physical pieces missing");
    const detailA = await readOrder(cutting, "CUTTING", first.id);
    await goto(cutting.page, "/cutting/incoming");
    for (const order of [first, second]) {
      await cutting.page
        .getByRole("button", { name: new RegExp(order.businessNumber, "u") })
        .click();
      await cutting.page
        .getByRole("checkbox", {
          name: `تحديد قطع ${order.businessNumber}`,
          exact: true,
        })
        .check();
    }
    await cutting.page
      .getByRole("button", { name: "استلام وبدء المحدد", exact: true })
      .click();
    const dialog = cutting.page.getByRole("dialog");
    await expect(dialog).toContainText("المحدد: 6 قطعة");
    await command(other, "CUTTING", second.id, "RECEIVE_AND_START", [b.id]);
    const winner = await readOrder(cutting, "CUTTING", second.id);
    const rejectedResponse = responseFor(
      cutting.page,
      "/manufacturing/cutting/commands",
    );
    await dialog
      .getByRole("button", { name: "تأكيد استلام وبدء العمل", exact: true })
      .click();
    const rejected = await rejectedResponse;
    const attempted = manufacturingCommandBodySchema.parse(
      rejected.request().postDataJSON(),
    );
    expect(attempted.orders.map((order) => order.orderId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(attempted.orders.flatMap((order) => order.pieceIds)).toHaveLength(6);
    expect(rejected.status()).toBe(409);
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "تحديث ومراجعة القطع المحددة" }),
    ).toBeVisible();
    expect(await readOrder(cutting, "CUTTING", first.id)).toEqual(detailA);
    expect(await readOrder(cutting, "CUTTING", second.id)).toEqual(winner);
  } finally {
    await run.close();
  }
});

const reportUi = async (
  session: Session,
  department: ManufacturingDepartment,
  orderId: string,
  pieceId: string,
  validate = false,
) => {
  await task(session, department, orderId, [pieceId]);
  await session.page
    .getByRole("button", { name: "تسجيل مشكلة", exact: true })
    .click();
  const dialog = session.page.getByRole("dialog");
  const reason = dialog.getByLabel("سبب المشكلة (مطلوب)", { exact: true });
  const notes = dialog.getByLabel("ملاحظات إضافية (اختيارية)", { exact: true });
  if (validate) {
    await dialog
      .getByRole("button", { name: "تسجيل المشكلة", exact: true })
      .click();
    await expect(reason).toHaveAttribute("aria-invalid", "true");
    await expect(reason).toHaveAttribute("aria-describedby", /.+/u);
    await reason.fill("x".repeat(4001));
    await notes.fill("n".repeat(4001));
    await dialog
      .getByRole("button", { name: "تسجيل المشكلة", exact: true })
      .click();
    await expect(notes).toHaveAttribute("aria-invalid", "true");
    await expect(reason).toHaveValue("x".repeat(4001));
  }
  await reason.fill("P05 exact one-piece problem");
  await notes.fill("");
  const pending = responseFor(
    session.page,
    `/manufacturing-orders/${orderId}/pieces/${pieceId}/issues`,
  );
  await dialog
    .getByRole("button", { name: "تسجيل المشكلة", exact: true })
    .click();
  const saved = await dataFrom(await pending, approvalCommandDataSchema);
  await expect(dialog).toBeHidden();
  return saved;
};
const resolve = async (
  approver: Session,
  orderId: string,
  pieceId: string,
  issueId: string,
  decision: "RETURN_TO_DEPARTMENT" | "SEND_TO_SALES" | "CANCEL",
  target: ManufacturingDepartment,
) => {
  const current = await dataFrom(
    await approver.page.request.get(api(`/approvals/orders/${orderId}`), {
      headers: approver.headers,
    }),
    approvalOrderDataSchema,
  );
  return dataFrom(
    await post(
      approver,
      `/approvals/orders/${orderId}/pieces/${pieceId}/issues/${issueId}/resolve`,
      {
        commandId: crypto.randomUUID(),
        expectedVersion: current.order.version,
        decision,
        ...(decision === "CANCEL"
          ? { reason: "P05 retained cancellation", confirmed: true }
          : { target, notes: "P05 accepted correction instructions" }),
      },
    ),
    approvalCommandDataSchema,
  );
};
for (const department of ["CUTTING", "PRODUCTION"] as const) {
  test(`P05 US4 ${department} one-piece hold repeated approved returns and cancellation retain history`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport);
    try {
      const worker = await run.worker(department);
      const order = await createOrder(run.sales, run.approver);
      const [p1, p2] = order.pieces;
      if (!p1 || !p2) throw new Error("Companions missing");
      if (department === "PRODUCTION") {
        await command(
          run.admin,
          "CUTTING",
          order.id,
          "RECEIVE_AND_START",
          order.pieces.map((piece) => piece.id),
        );
        await command(
          run.admin,
          "CUTTING",
          order.id,
          "COMPLETE_TRANSFER",
          order.pieces.map((piece) => piece.id),
        );
      }
      for (let cycle = 0; cycle < 2; cycle++) {
        if (cycle === 1)
          await workUi(
            worker,
            department,
            order.id,
            [p1.id],
            "RECEIVE_AND_START",
          );
        const reported = await reportUi(
          worker,
          department,
          order.id,
          p1.id,
          cycle === 0,
        );
        const issueId = reported.outcome.issueId;
        if (!issueId) throw new Error("Report issue missing");
        const held = await readOrder(worker, department, order.id);
        expect(requirePiece(held, p1.id).piece.workState).toBe("BLOCKED");
        expect(
          Object.values(requirePiece(held, p1.id).work.allowedActions).some(
            Boolean,
          ),
        ).toBe(false);
        expect(requirePiece(held, p1.id).work.visit?.endReason).toBe(
          "ISSUE_REPORTED",
        );
        if (cycle === 0)
          await workUi(
            worker,
            department,
            order.id,
            [p2.id],
            "RECEIVE_AND_START",
          );
        await resolve(
          run.approver,
          order.id,
          p1.id,
          issueId,
          "RETURN_TO_DEPARTMENT",
          department,
        );
        const released = await readOrder(worker, department, order.id);
        expect(requirePiece(released, p1.id).work.isReturned).toBe(true);
        expect(
          requirePiece(released, p1.id).work.visit?.origin.instructions,
        ).toBe("P05 accepted correction instructions");
        expect(
          requirePiece(released, p1.id).work.allowedActions.canReceiveAndStart,
        ).toBe(true);
        await reloadAuthenticated(worker);
      }
      await workUi(worker, department, order.id, [p1.id], "RECEIVE_AND_START");
      const reported = await reportUi(worker, department, order.id, p1.id);
      const issueId = reported.outcome.issueId;
      if (!issueId) throw new Error("Report missing");
      const before = await readOrder(worker, department, order.id);
      const ended = requirePiece(before, p1.id).work.visit;
      await resolve(
        run.approver,
        order.id,
        p1.id,
        issueId,
        "CANCEL",
        department,
      );
      const after = await readOrder(worker, department, order.id);
      expect(requirePiece(after, p1.id).work.visit).toEqual(ended);
      expect(requirePiece(after, p1.id).piece.cancelledAt).not.toBeNull();
      expect(requirePiece(after, p2.id)).toEqual(requirePiece(before, p2.id));
      expect(after.paper.order.counts.cancelled).toBe(1);
      await workUi(worker, department, order.id, [p2.id], "COMPLETE_TRANSFER");
      const history = await dataFrom(
        await worker.page.request.get(
          api(
            `/manufacturing/${department.toLowerCase()}/orders/${order.id}/history`,
          ),
          { headers: worker.headers },
        ),
        manufacturingOrderHistoryDataSchema,
      );
      safeKeys(history);
    } finally {
      await run.close();
    }
  });
}

test("P05 US4 sales referral stays held through proposal return and positive reapproval", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const worker = await run.worker("CUTTING");
    const order = await createOrder(run.sales, run.approver);
    const piece = order.pieces[0];
    if (!piece) throw new Error("Piece missing");
    const reported = await reportUi(worker, "CUTTING", order.id, piece.id);
    const issueId = reported.outcome.issueId;
    if (!issueId) throw new Error("Issue missing");
    await resolve(
      run.approver,
      order.id,
      piece.id,
      issueId,
      "SEND_TO_SALES",
      "CUTTING",
    );
    const held = await readOrder(worker, "CUTTING", order.id);
    for (const decision of ["RETURN_TO_SALES", "ACCEPT"] as const) {
      const version = (await readOrder(worker, "CUTTING", order.id)).paper.order
        .version;
      const proposed = await dataFrom(
        await post(
          run.sales,
          `/sales-contact/orders/${order.id}/pieces/${piece.id}/issues/${issueId}/proposals`,
          {
            commandId: crypto.randomUUID(),
            expectedVersion: version,
            kind: "AMEND",
            contactNotes: "P05 private unaccepted correspondence",
            changes: {},
          },
        ),
        approvalCommandDataSchema,
      );
      const stillHeld = await readOrder(worker, "CUTTING", order.id);
      expect(requirePiece(stillHeld, piece.id).piece.workState).toBe("BLOCKED");
      expect(requirePiece(stillHeld, piece.id).work.visit).toEqual(
        requirePiece(held, piece.id).work.visit,
      );
      safeKeys(stillHeld);
      expect(JSON.stringify(stillHeld)).not.toContain(
        "P05 private unaccepted correspondence",
      );
      const proposalId = proposed.outcome.proposalId;
      if (!proposalId) throw new Error("Proposal missing");
      await dataFrom(
        await post(
          run.approver,
          `/approvals/orders/${order.id}/pieces/${piece.id}/issues/${issueId}/review`,
          {
            commandId: crypto.randomUUID(),
            expectedVersion: stillHeld.paper.order.version,
            proposalId,
            decision,
            ...(decision === "ACCEPT"
              ? { notes: "P05 accepted customer instructions" }
              : { reason: "P05 confirm client again" }),
          },
        ),
        approvalCommandDataSchema,
      );
      const reviewed = await readOrder(worker, "CUTTING", order.id);
      expect(requirePiece(reviewed, piece.id).piece.workState).toBe(
        decision === "ACCEPT" ? "INCOMING" : "BLOCKED",
      );
    }
    await workUi(worker, "CUTTING", order.id, [piece.id], "RECEIVE_AND_START");
    await workUi(worker, "CUTTING", order.id, [piece.id], "COMPLETE_TRANSFER");
    const final = await readOrder(worker, "CUTTING", order.id);
    expect(requirePiece(final, piece.id).piece.stage).toBe("PRODUCTION");
  } finally {
    await run.close();
  }
});

for (const protocol of ["work", "report"] as const) {
  test(`P05 US5 ${protocol} lost response survives close observation and failed synchronization`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport);
    try {
      const worker = await run.worker("CUTTING");
      const order = await createOrder(run.sales, run.approver);
      const piece = order.pieces[0];
      if (!piece) throw new Error("Piece missing");
      await task(worker, "CUTTING", order.id, [piece.id]);
      const action = protocol === "work" ? "استلام وبدء العمل" : "تسجيل مشكلة";
      await worker.page
        .getByRole("button", { name: action, exact: true })
        .click();
      const dialog = worker.page.getByRole("dialog");
      if (protocol === "report")
        await dialog
          .getByLabel("سبب المشكلة (مطلوب)")
          .fill("P05 uncertain actual report");
      const endpoint =
        protocol === "work"
          ? "/manufacturing/cutting/commands"
          : `/manufacturing-orders/${order.id}/pieces/${piece.id}/issues`;
      let writes = 0;
      const ids: string[] = [];
      await worker.page.route(`**/api/v1${endpoint}`, async (route) => {
        writes++;
        const body: unknown = route.request().postDataJSON();
        const parsed =
          protocol === "work"
            ? manufacturingCommandBodySchema.parse(body)
            : reportIssueBodySchema.parse(body);
        ids.push(parsed.commandId);
        if (protocol === "work")
          await dataFrom(await route.fetch(), manufacturingCommandDataSchema);
        else await dataFrom(await route.fetch(), approvalCommandDataSchema);
        await route.abort("failed");
      });
      await dialog
        .getByRole("button", {
          name:
            protocol === "work" ? "تأكيد استلام وبدء العمل" : "تسجيل المشكلة",
          exact: true,
        })
        .click();
      const recovery = worker.page.getByLabel("متابعة نتيجة الإجراء", {
        exact: true,
      });
      await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
      await dialog
        .getByRole("button", { name: "إغلاق النافذة", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      expect(writes).toBe(1);
      const readPattern = `**/api/v1/manufacturing/cutting/orders/${order.id}`;
      await worker.page.route(readPattern, async (route) => {
        await route.fetch();
        await route.abort("failed");
      });
      const id = ids[0];
      if (!id) throw new Error("Original command missing");
      const observation = responseFor(
        worker.page,
        `/${protocol === "work" ? "manufacturing" : "approval"}-commands/${id}`,
        "GET",
      );
      await recovery
        .getByRole("button", { name: "التحقق من النتيجة", exact: true })
        .click();
      if (protocol === "work")
        await dataFrom(await observation, manufacturingCommandDataSchema);
      else await dataFrom(await observation, approvalCommandDataSchema);
      await expect(recovery).toContainText(
        "تم حفظ الإجراء، لكن تعذر تحديث العرض",
      );
      await expect(
        recovery.getByRole("button", { name: "إعادة نفس الإجراء" }),
      ).toHaveCount(0);
      expect(writes).toBe(1);
      await expect(
        recovery.getByRole("button", { name: "تحديث البيانات المحفوظة" }),
      ).toBeEnabled();
      await worker.page.unroute(readPattern);
      await recovery
        .getByRole("button", { name: "تحديث البيانات المحفوظة" })
        .click();
      await expect(recovery).toContainText("تم حفظ الإجراء وتحديث البيانات");
      await recovery.getByRole("button", { name: "إغلاق التأكيد" }).click();
      expect(writes).toBe(1);
      await reloadAuthenticated(worker);
      const actual = await readOrder(worker, "CUTTING", order.id);
      expect(requirePiece(actual, piece.id).piece.workState).toBe(
        protocol === "work" ? "IN_PROGRESS" : "BLOCKED",
      );
      const activity = await dataFrom(
        await worker.page.request.get(
          api("/manufacturing/cutting/activity?actor=me&limit=25&page=1"),
          { headers: worker.headers },
        ),
        manufacturingActivityDataSchema,
      );
      expect(activity.events.some((row) => row.event.commandId === id)).toBe(
        true,
      );
      await goto(worker.page, "/cutting/activity");
      await worker.page.getByLabel("عملياتي فقط").check();
      const original = responseFor(
        worker.page,
        `/${protocol === "work" ? "manufacturing" : "approval"}-commands/${id}`,
        "GET",
      );
      await worker.page
        .getByRole("row")
        .filter({ hasText: order.businessNumber })
        .getByRole("button", { name: "التحقق من نتيجة الإجراء" })
        .click();
      if (protocol === "work")
        await dataFrom(await original, manufacturingCommandDataSchema);
      else await dataFrom(await original, approvalCommandDataSchema);
      expect(writes).toBe(1);
      const storesRecovery = await worker.page.evaluate(
        ({ commandId, pieceId }) =>
          [localStorage, sessionStorage].some((storage) =>
            Object.keys(storage).some((key) =>
              [key, storage.getItem(key) ?? ""].some((text) =>
                [commandId, pieceId, "P05 uncertain actual report"].some(
                  (reference) => text.includes(reference),
                ),
              ),
            ),
          ),
        { commandId: id, pieceId: piece.id },
      );
      expect(storesRecovery).toBe(false);
    } finally {
      await run.close();
    }
  });
}

for (const protocol of ["work", "report"] as const) {
  for (const visibility of ["committed", "missing"] as const) {
    test(`P05 US5 ${protocol} ${visibility} inconclusive observation replays immutable intent and ADMIN retains origin across departments`, async ({
      browser,
      viewport,
    }, info) => {
      const run = await scenario(browser, info.project.name, viewport);
      try {
        const admin = run.admin;
        const order = await createOrder(run.sales, run.approver);
        const piece = order.pieces[0];
        if (!piece) throw new Error("Physical piece missing");
        await task(admin, "CUTTING", order.id, [piece.id]);
        await admin.page
          .getByRole("button", {
            name: protocol === "work" ? "استلام وبدء العمل" : "تسجيل مشكلة",
            exact: true,
          })
          .click();
        const dialog = admin.page.getByRole("dialog");
        if (protocol === "report")
          await dialog
            .getByLabel("سبب المشكلة (مطلوب)")
            .fill("P05 retained immutable report");
        const endpoint =
          protocol === "work"
            ? "/manufacturing/cutting/commands"
            : `/manufacturing-orders/${order.id}/pieces/${piece.id}/issues`;
        const bodies: unknown[] = [];
        await admin.page.route(`**/api/v1${endpoint}`, async (route) => {
          bodies.push(route.request().postDataJSON());
          if (bodies.length === 1 && visibility === "missing") {
            await route.abort("failed");
            return;
          }
          const response = await route.fetch();
          const saved =
            protocol === "work"
              ? await dataFrom(response, manufacturingCommandDataSchema)
              : await dataFrom(response, approvalCommandDataSchema);
          if (bodies.length === 1) await route.abort("failed");
          else {
            expect(saved.replayed).toBe(visibility === "committed");
            await route.fulfill({ response });
          }
        });
        await dialog
          .getByRole("button", {
            name:
              protocol === "work" ? "تأكيد استلام وبدء العمل" : "تسجيل المشكلة",
            exact: true,
          })
          .click();
        const recovery = admin.page.getByLabel("متابعة نتيجة الإجراء", {
          exact: true,
        });
        await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
        await dialog.getByRole("button", { name: "إغلاق النافذة" }).click();
        await admin.page.evaluate(() => {
          document.documentElement.dataset["p05NavigationWitness"] =
            "same-document";
        });
        await admin.page
          .getByRole("combobox", { name: "الانتقال إلى قسم" })
          .selectOption("production");
        await expect(admin.page).toHaveURL(/\/production\/dashboard$/u);
        await expect(admin.page.locator("html")).toHaveAttribute(
          "data-p05-navigation-witness",
          "same-document",
        );
        await expect(recovery).toContainText("القسم الأصلي: القص");
        const original =
          protocol === "work"
            ? manufacturingCommandBodySchema.parse(bodies[0])
            : reportIssueBodySchema.parse(bodies[0]);
        const observationPath = `/${protocol === "work" ? "manufacturing" : "approval"}-commands/${original.commandId}`;
        if (visibility === "missing") {
          const missing = responseFor(admin.page, observationPath, "GET");
          await recovery
            .getByRole("button", { name: "التحقق من النتيجة", exact: true })
            .click();
          const absent = await missing;
          expect(absent.status()).toBe(404);
          errorEnvelopeSchema.parse(await absent.json());
        } else {
          await admin.page.route(
            `**/api/v1${observationPath}`,
            async (route) => {
              const observed = await route.fetch();
              if (protocol === "work")
                await dataFrom(observed, manufacturingCommandDataSchema);
              else await dataFrom(observed, approvalCommandDataSchema);
              await route.abort("failed");
            },
          );
          await recovery
            .getByRole("button", { name: "التحقق من النتيجة", exact: true })
            .click();
        }
        await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
        expect(bodies).toHaveLength(1);
        await recovery
          .getByRole("button", { name: "إعادة نفس الإجراء" })
          .click();
        await expect(recovery).toContainText("تم حفظ الإجراء وتحديث البيانات");
        expect(bodies).toHaveLength(2);
        expect(bodies[1]).toEqual(bodies[0]);
        await recovery.getByRole("button", { name: "إغلاق التأكيد" }).click();
        const detail = await readOrder(admin, "CUTTING", order.id);
        expect(detail.paper.order.version).toBe(3);
        expect(requirePiece(detail, piece.id).piece.workState).toBe(
          protocol === "work" ? "IN_PROGRESS" : "BLOCKED",
        );
      } finally {
        await run.close();
      }
    });
  }
}

for (const department of ["CUTTING", "PRODUCTION"] as const) {
  test(`P05 US1 ${department} read failures stay errors and keyboard confirmation cancels without a write`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport);
    const pendingRead = barrier();
    try {
      const worker = await run.worker(department);
      const order = await createOrder(run.sales, run.approver);
      const piece = order.pieces[0];
      if (!piece) throw new Error("Physical piece missing");
      if (department === "PRODUCTION") {
        await command(run.admin, "CUTTING", order.id, "RECEIVE_AND_START", [
          piece.id,
        ]);
        await command(run.admin, "CUTTING", order.id, "COMPLETE_TRANSFER", [
          piece.id,
        ]);
      }
      const pattern = `**/api/v1/manufacturing/${department.toLowerCase()}/orders?*`;
      await worker.page.route(pattern, async (route) => {
        await pendingRead.promise;
        await route.abort("failed");
      });
      await goto(worker.page, `/${department.toLowerCase()}/incoming`);
      await expect(
        worker.page.getByRole("status").filter({ hasText: "جارٍ تحميل القطع" }),
      ).toBeVisible();
      pendingRead.release();
      await expect(
        worker.page.getByRole("alert").filter({ hasText: "تحميل القائمة" }),
      ).toBeVisible();
      await expect(
        worker.page.getByText("لا توجد أوامر مطابقة في هذا القسم.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await worker.page.unroute(pattern);
      await worker.page
        .getByRole("button", { name: "إعادة المحاولة", exact: true })
        .click();
      await worker.page
        .getByRole("textbox")
        .fill(`p05-no-match-${crypto.randomUUID()}`);
      await expect(
        worker.page.getByText("لا توجد أوامر مطابقة في هذا القسم.", {
          exact: true,
        }),
      ).toBeVisible();
      await task(worker, department, order.id, [piece.id]);
      let writes = 0;
      worker.page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          (new URL(request.url()).pathname.endsWith("/commands") ||
            new URL(request.url()).pathname.endsWith("/issues"))
        )
          writes++;
      });
      const trigger = worker.page.getByRole("button", {
        name: "استلام وبدء العمل",
        exact: true,
      });
      await trigger.focus();
      await worker.page.keyboard.press("Enter");
      const dialog = worker.page.getByRole("dialog", {
        name: "استلام وبدء العمل",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
      await dialog.getByRole("button", { name: "إغلاق", exact: true }).focus();
      await worker.page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
      await worker.page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(writes).toBe(0);
      await goto(worker.page, `/${department.toLowerCase()}/incoming`);
      await worker.page.getByRole("textbox").fill(order.businessNumber);
      await worker.page
        .getByRole("button", { name: "حسب القطعة", exact: true })
        .click();
      const selectedRow = worker.page.getByRole("row").filter({
        has: worker.page.getByRole("checkbox", {
          name: `تحديد القطعة ${String(piece.position)} من ${order.businessNumber}`,
          exact: true,
        }),
      });
      const reportTrigger = selectedRow.getByRole("button", {
        name: "تسجيل مشكلة",
        exact: true,
      });
      await reportTrigger.focus();
      await worker.page.keyboard.press("Enter");
      const reportDialog = worker.page.getByRole("dialog", {
        name: "تسجيل مشكلة تصنيع على القطعة",
        exact: true,
      });
      await expect(reportDialog).toBeVisible();
      await worker.page.keyboard.press("Escape");
      await expect(reportDialog).toBeHidden();
      await expect(reportTrigger).toBeFocused();
      expect(writes).toBe(0);
      expect(
        requirePiece(await readOrder(worker, department, order.id), piece.id)
          .piece.workState,
      ).toBe("INCOMING");
    } finally {
      pendingRead.release();
      await run.close();
    }
  });
}

for (const change of ["suspend", "reassign"] as const) {
  test(`P05 US5 ${change} current authority rejects old command recovery while committed work survives`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport);
    try {
      const worker = await run.isolatedWorker("CUTTING");
      const order = await createOrder(run.sales, run.approver);
      const piece = order.pieces[0];
      if (!piece) throw new Error("Physical piece missing");
      await task(worker, "CUTTING", order.id, [piece.id]);
      await worker.page
        .getByRole("button", { name: "استلام وبدء العمل", exact: true })
        .click();
      const original: { id: string | null } = { id: null };
      let writes = 0;
      await worker.page.route(
        "**/api/v1/manufacturing/cutting/commands",
        async (route) => {
          writes++;
          original.id = manufacturingCommandBodySchema.parse(
            route.request().postDataJSON(),
          ).commandId;
          await dataFrom(await route.fetch(), manufacturingCommandDataSchema);
          await route.abort("failed");
        },
      );
      await worker.page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد استلام وبدء العمل", exact: true })
        .click();
      await expect(
        worker.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
      ).toContainText("نتيجة الإجراء غير مؤكدة");
      await worker.page
        .getByRole("dialog")
        .getByRole("button", { name: "إغلاق النافذة" })
        .click();
      await goto(run.admin.page, "/admin/users");
      await run.admin.page
        .getByPlaceholder("ابحث بالاسم، البريد أو رقم الهاتف...")
        .fill(worker.email);
      await run.admin.page
        .getByRole("row")
        .filter({
          has: run.admin.page.getByText(worker.email, { exact: true }),
        })
        .locator("[data-staff-row-action]")
        .click();
      const staff = run.admin.page.getByRole("dialog");
      if (change === "reassign")
        await staff
          .locator("[data-staff-department]")
          .selectOption("PRODUCTION");
      await staff
        .getByRole("button", {
          name:
            change === "suspend"
              ? "إيقاف الحساب مؤقتاً"
              : "تغيير القسم المعتمد",
          exact: true,
        })
        .click();
      await expect(staff).toBeHidden();
      if (!original.id) throw new Error("Committed command missing");
      const response = await worker.page.request.get(
        api(`/manufacturing-commands/${original.id}`),
        { headers: worker.headers },
      );
      expect(response.status()).toBe(403);
      await worker.page
        .getByLabel("متابعة نتيجة الإجراء", { exact: true })
        .getByRole("button", { name: "التحقق من النتيجة", exact: true })
        .click();
      await expect(worker.page).toHaveURL(
        change === "suspend"
          ? /\/auth\/suspended/u
          : /\/(unauthorized|production\/dashboard)/u,
      );
      await expect(
        worker.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
      ).toHaveCount(0);
      expect(writes).toBe(1);
      expect(
        requirePiece(await readOrder(run.admin, "CUTTING", order.id), piece.id)
          .piece.workState,
      ).toBe("IN_PROGRESS");
    } finally {
      await run.close();
    }
  });
}

const barrier = () => {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release: () => {
      release();
    },
  };
};
test("P05 US5 pending close and account replacement discard a delayed prior success", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  const accepted = barrier(),
    deliver = barrier(),
    settled = barrier();
  try {
    const worker = await run.isolatedWorker("CUTTING");
    const order = await createOrder(run.sales, run.approver);
    const piece = order.pieces[0];
    if (!piece) throw new Error("Piece missing");
    await task(worker, "CUTTING", order.id, [piece.id]);
    await worker.page
      .getByRole("button", { name: "استلام وبدء العمل", exact: true })
      .click();
    let writes = 0;
    await worker.page.route(
      "**/api/v1/manufacturing/cutting/commands",
      async (route) => {
        try {
          writes++;
          const response = await route.fetch();
          await dataFrom(response, manufacturingCommandDataSchema);
          accepted.release();
          await deliver.promise;
          await route.fulfill({ response });
        } finally {
          settled.release();
        }
      },
    );
    const dialog = worker.page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "تأكيد استلام وبدء العمل", exact: true })
      .click();
    await accepted.promise;
    await expect(
      dialog.getByRole("button", {
        name: "تأكيد استلام وبدء العمل",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    await expect(
      worker.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
    ).toContainText("جارٍ إرسال الإجراء");
    const menu = worker.page.getByRole("button", {
      name: "فتح القائمة الجانبية",
    });
    if (await menu.isVisible()) await menu.click();
    await worker.page.locator(".oriental-logout-btn").click();
    await expect(worker.page).toHaveURL(/\/auth\/login/u);
    const replacement =
      readE2eRuntime().p04ByProject[info.project.name]?.factory;
    if (!replacement) throw new Error("Replacement identity missing");
    await worker.page
      .getByLabel("البريد الإلكتروني", { exact: true })
      .fill(replacement.email);
    await worker.page
      .getByLabel("كلمة المرور", { exact: true })
      .fill(replacement.password);
    await worker.page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .click();
    await expect(worker.page).toHaveURL(/\/cutting\/dashboard/u);
    deliver.release();
    await settled.promise;
    await expect(
      worker.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
    ).toHaveCount(0);
    await expect(
      worker.page.getByText("تم حفظ الإجراء وتحديث البيانات.", { exact: true }),
    ).toHaveCount(0);
    expect(writes).toBe(1);
    expect(
      requirePiece(await readOrder(run.admin, "CUTTING", order.id), piece.id)
        .piece.workState,
    ).toBe("IN_PROGRESS");
  } finally {
    deliver.release();
    await run.close();
  }
});

test("P05 US4 sales cancellation request remains held until approval cancels the piece", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const worker = await run.isolatedWorker("CUTTING");
    const order = await createOrder(run.sales, run.approver);
    const piece = order.pieces[0];
    if (!piece) throw new Error("Piece missing");
    await workUi(worker, "CUTTING", order.id, [piece.id], "RECEIVE_AND_START");
    const report = await reportUi(worker, "CUTTING", order.id, piece.id);
    const issueId = report.outcome.issueId;
    if (!issueId) throw new Error("Issue missing");
    const ended = requirePiece(
      await readOrder(worker, "CUTTING", order.id),
      piece.id,
    ).work.visit;
    await resolve(
      run.approver,
      order.id,
      piece.id,
      issueId,
      "SEND_TO_SALES",
      "CUTTING",
    );
    const held = await readOrder(worker, "CUTTING", order.id);
    const proposal = await dataFrom(
      await post(
        run.sales,
        `/sales-contact/orders/${order.id}/pieces/${piece.id}/issues/${issueId}/proposals`,
        {
          commandId: crypto.randomUUID(),
          expectedVersion: held.paper.order.version,
          kind: "CANCEL_REQUEST",
          contactNotes: "P05 private cancellation request",
        },
      ),
      approvalCommandDataSchema,
    );
    const pending = await readOrder(worker, "CUTTING", order.id);
    expect(requirePiece(pending, piece.id).piece.cancelledAt).toBeNull();
    expect(requirePiece(pending, piece.id).piece.workState).toBe("BLOCKED");
    const proposalId = proposal.outcome.proposalId;
    if (!proposalId) throw new Error("Proposal missing");
    await dataFrom(
      await post(
        run.approver,
        `/approvals/orders/${order.id}/pieces/${piece.id}/issues/${issueId}/review`,
        {
          commandId: crypto.randomUUID(),
          expectedVersion: pending.paper.order.version,
          proposalId,
          decision: "CANCEL",
          confirmed: true,
          reason: "P05 accepted cancellation",
        },
      ),
      approvalCommandDataSchema,
    );
    const cancelled = await readOrder(worker, "CUTTING", order.id);
    expect(requirePiece(cancelled, piece.id).work.visit).toEqual(ended);
    expect(requirePiece(cancelled, piece.id).piece.cancelledAt).not.toBeNull();
    expect(cancelled.paper.order.counts).toMatchObject({
      original: 3,
      active: 2,
      cancelled: 1,
      received: 0,
    });
    safeKeys(cancelled);
  } finally {
    await run.close();
  }
});

for (const department of ["CUTTING", "PRODUCTION"] as const) {
  test(`P05 US1 ${department} server pages filters and select-all retain exact current-page identities`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport);
    try {
      const worker = await run.worker(department);
      const order = await createOrder(run.sales, run.approver, "REPAIR", 11);
      const ids = order.pieces.map((piece) => piece.id);
      if (department === "PRODUCTION") {
        await command(run.admin, "CUTTING", order.id, "RECEIVE_AND_START", ids);
        await command(run.admin, "CUTTING", order.id, "COMPLETE_TRANSFER", ids);
      }
      await goto(
        worker.page,
        `/${department.toLowerCase()}/${department === "PRODUCTION" ? "repairs" : "incoming"}`,
      );
      await worker.page.getByRole("textbox").fill(order.businessNumber);
      const type = worker.page.getByRole("combobox", {
        name: "نوع أمر التفصيل",
        exact: true,
      });
      if (department === "CUTTING") await type.selectOption("REPAIR");
      else await expect(type).toHaveValue("REPAIR");
      await worker.page
        .getByRole("button", { name: "حسب القطعة", exact: true })
        .click();
      await expect(
        worker.page.getByRole("checkbox", { name: /^تحديد القطعة /u }),
      ).toHaveCount(10);
      await expect(
        worker.page.getByText("عرض 11 من أصل 11 قطعة", { exact: true }),
      ).toBeVisible();
      await worker.page
        .getByRole("checkbox", { name: "تحديد قطع الصفحة", exact: true })
        .check();
      await worker.page
        .getByRole("button", { name: "استلام وبدء المحدد", exact: true })
        .click();
      const dialog = worker.page.getByRole("dialog");
      await expect(dialog).toContainText("المحدد: 10 قطعة");
      await expect(dialog.getByRole("listitem")).toHaveCount(10);
      await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
      const next = responseFor(
        worker.page,
        `/manufacturing/${department.toLowerCase()}/pieces`,
        "GET",
      );
      await worker.page
        .getByRole("button", { name: "الصفحة التالية", exact: true })
        .click();
      const second = await dataFrom(await next, manufacturingPiecesDataSchema);
      expect(second.pagination.page).toBe(2);
      expect(second.items).toHaveLength(1);
      await expect(
        worker.page.getByRole("checkbox", { name: /^تحديد القطعة /u }),
      ).toHaveCount(1);
      await expect(
        worker.page.getByRole("button", {
          name: "استلام وبدء المحدد",
          exact: true,
        }),
      ).toHaveCount(0);
      const piece = second.items[0]?.piece;
      if (!piece) throw new Error("Second page piece missing");
      await expect(
        worker.page.getByRole("checkbox", {
          name: `تحديد القطعة ${String(piece.position)} من ${order.businessNumber}`,
          exact: true,
        }),
      ).toBeVisible();
      const filtered = responseFor(
        worker.page,
        `/manufacturing/${department.toLowerCase()}/pieces`,
        "GET",
      );
      await worker.page.getByRole("textbox").fill("p05-no-such-order");
      const empty = await dataFrom(
        await filtered,
        manufacturingPiecesDataSchema,
      );
      expect(empty.pagination.page).toBe(1);
      expect(empty.pagination.total).toBe(0);
      await expect(
        worker.page.getByText("لا توجد قطع مطابقة", { exact: true }),
      ).toBeVisible();
      await expect(
        worker.page.getByRole("button", {
          name: "الصفحة السابقة",
          exact: true,
        }),
      ).toHaveCount(0);
      const final = await readOrder(worker, department, order.id);
      expect(final.paper.order.counts.original).toBe(11);
      expect(
        final.work.every((work) => work.allowedActions.canReceiveAndStart),
      ).toBe(true);
    } finally {
      await run.close();
    }
  });
}

const changeWorkerAccess = async (
  admin: Session,
  email: string,
  department: ManufacturingDepartment,
) => {
  await goto(admin.page, "/admin/users");
  await admin.page
    .getByPlaceholder("ابحث بالاسم، البريد أو رقم الهاتف...")
    .fill(email);
  await admin.page
    .getByRole("row")
    .filter({ has: admin.page.getByText(email, { exact: true }) })
    .locator("[data-staff-row-action]")
    .click();
  const staff = admin.page.getByRole("dialog");
  if (department === "PRODUCTION")
    await staff.locator("[data-staff-department]").selectOption("CUTTING");
  await staff
    .getByRole("button", {
      name:
        department === "CUTTING"
          ? "إيقاف الحساب مؤقتاً"
          : "تغيير القسم المعتمد",
      exact: true,
    })
    .click();
  await expect(staff).toBeHidden();
};
for (const department of ["CUTTING", "PRODUCTION"] as const) {
  for (const protocol of ["work", "report"] as const) {
    test(`P05 T049 ${department} own activity ${protocol} reconciles withdrawn authority`, async ({
      browser,
      viewport,
    }, info) => {
      const run = await scenario(browser, info.project.name, viewport);
      try {
        const worker = await run.isolatedWorker(department);
        const order = await createOrder(run.sales, run.approver);
        const piece = order.pieces[0];
        if (!piece) throw new Error("Exact piece missing");
        if (department === "PRODUCTION") {
          await command(run.admin, "CUTTING", order.id, "RECEIVE_AND_START", [
            piece.id,
          ]);
          await command(run.admin, "CUTTING", order.id, "COMPLETE_TRANSFER", [
            piece.id,
          ]);
        }
        if (protocol === "work")
          await workUi(
            worker,
            department,
            order.id,
            [piece.id],
            "RECEIVE_AND_START",
          );
        else await reportUi(worker, department, order.id, piece.id);
        await goto(worker.page, `/${department.toLowerCase()}/activity`);
        await worker.page.getByLabel("عملياتي فقط").check();
        const row = worker.page
          .getByRole("row")
          .filter({ hasText: order.businessNumber });
        const observe = row.getByRole("button", {
          name: "التحقق من نتيجة الإجراء",
          exact: true,
        });
        await expect(observe).toBeVisible();
        await changeWorkerAccess(run.admin, worker.email, department);
        let writes = 0;
        worker.page.on("request", (request) => {
          if (request.method() === "POST") writes++;
        });
        const denial = worker.page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname.startsWith(
              `/api/v1/${protocol === "work" ? "manufacturing" : "approval"}-commands/`,
            ) && response.request().method() === "GET",
        );
        await observe.click();
        const rejected = await denial;
        expect(rejected.status()).toBe(403);
        expect(errorEnvelopeSchema.parse(await rejected.json()).code).toBe(
          department === "CUTTING"
            ? "ACCOUNT_RESTRICTED"
            : "DEPARTMENT_ACCESS_DENIED",
        );
        await expect(worker.page).toHaveURL(
          department === "CUTTING"
            ? /\/auth\/suspended/u
            : /\/(unauthorized|cutting\/dashboard)/u,
        );
        await expect(
          worker.page.getByRole("heading", {
            name: "سجل نشاط القسم",
            exact: true,
          }),
        ).toHaveCount(0);
        expect(writes).toBe(0);
        const saved = await readOrder(run.admin, department, order.id);
        expect(requirePiece(saved, piece.id).piece.workState).toBe(
          protocol === "work" ? "IN_PROGRESS" : "BLOCKED",
        );
      } finally {
        await run.close();
      }
    });
  }
}

for (const department of ["CUTTING", "PRODUCTION"] as const) {
  for (const origin of ["queue", "task"] as const) {
    test(`P05 T050 ${department} ${origin} unmount preserves delayed successful recovery`, async ({
      browser,
      viewport,
    }, info) => {
      const run = await scenario(browser, info.project.name, viewport);
      const accepted = barrier(),
        deliver = barrier(),
        settled = barrier();
      try {
        const worker = await run.worker(department);
        const order = await createOrder(run.sales, run.approver);
        const piece = order.pieces[0];
        if (!piece) throw new Error("Exact piece missing");
        if (department === "PRODUCTION") {
          await command(run.admin, "CUTTING", order.id, "RECEIVE_AND_START", [
            piece.id,
          ]);
          await command(run.admin, "CUTTING", order.id, "COMPLETE_TRANSFER", [
            piece.id,
          ]);
        }
        const prefix = `/${department.toLowerCase()}`;
        await goto(worker.page, `${prefix}/dashboard`);
        await worker.page.evaluate(() => {
          document.documentElement.dataset["p05UnmountWitness"] =
            "same-document";
        });
        await worker.page
          .locator(`main a[href="${prefix}/incoming"]`)
          .first()
          .click();
        await expect(worker.page).toHaveURL(
          new RegExp(`${prefix}/incoming$`, "u"),
        );
        await worker.page.getByRole("textbox").fill(order.businessNumber);
        await worker.page
          .getByRole("button", { name: "حسب القطعة", exact: true })
          .click();
        const selectedRow = worker.page.getByRole("row").filter({
          has: worker.page.getByRole("checkbox", {
            name: `تحديد القطعة ${String(piece.position)} من ${order.businessNumber}`,
            exact: true,
          }),
        });
        if (origin === "task") {
          await selectedRow
            .locator(
              `a[href="${prefix}/tasks/${order.id}?pieceId=${piece.id}"]`,
            )
            .click();
          await expect(worker.page).toHaveURL(
            new RegExp(`${prefix}/tasks/${order.id}`, "u"),
          );
          await worker.page
            .getByRole("button", { name: "استلام وبدء العمل", exact: true })
            .click();
        } else {
          await selectedRow.getByRole("checkbox").check();
          await worker.page
            .getByRole("button", { name: "استلام وبدء المحدد", exact: true })
            .click();
        }
        let writes = 0;
        const bodies: ManufacturingCommandBody[] = [];
        await worker.page.route(
          `**/api/v1/manufacturing/${department.toLowerCase()}/commands`,
          async (route) => {
            try {
              writes++;
              bodies.push(
                manufacturingCommandBodySchema.parse(
                  route.request().postDataJSON(),
                ),
              );
              const response = await route.fetch();
              await dataFrom(response, manufacturingCommandDataSchema);
              accepted.release();
              await deliver.promise;
              await route.fulfill({ response });
            } finally {
              settled.release();
            }
          },
        );
        const dialog = worker.page.getByRole("dialog", {
          name: "استلام وبدء العمل",
          exact: true,
        });
        await dialog
          .getByRole("button", { name: "تأكيد استلام وبدء العمل", exact: true })
          .click();
        await accepted.promise;
        await expect(dialog).toBeVisible();
        await worker.page.goBack();
        await expect(worker.page).toHaveURL(
          new RegExp(
            `${prefix}/${origin === "queue" ? "dashboard" : "incoming"}$`,
            "u",
          ),
        );
        await expect(worker.page.locator("html")).toHaveAttribute(
          "data-p05-unmount-witness",
          "same-document",
        );
        await expect(worker.page.getByRole("dialog")).toHaveCount(0);
        const recovery = worker.page.getByLabel("متابعة نتيجة الإجراء", {
          exact: true,
        });
        await expect(recovery).toContainText("جارٍ إرسال الإجراء");
        deliver.release();
        await settled.promise;
        await expect(recovery).toContainText("تم حفظ الإجراء وتحديث البيانات");
        expect(writes).toBe(1);
        expect(bodies).toHaveLength(1);
        expect(bodies[0]?.orders).toEqual([
          {
            orderId: order.id,
            expectedVersion: department === "CUTTING" ? 2 : 4,
            pieceIds: [piece.id],
          },
        ]);
        await recovery
          .getByRole("button", { name: "إغلاق التأكيد", exact: true })
          .click();
        await expect(recovery).toHaveCount(0);
        await reloadAuthenticated(worker);
        const saved = await readOrder(worker, department, order.id);
        expect(requirePiece(saved, piece.id).piece.workState).toBe(
          "IN_PROGRESS",
        );
        expect(writes).toBe(1);
      } finally {
        deliver.release();
        await run.close();
      }
    });
  }
}
