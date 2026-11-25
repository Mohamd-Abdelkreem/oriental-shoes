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
  qualityOrdersDataSchema,
  qualityPiecesDataSchema,
  qualityOrderHistoryDataSchema,
  qualityCommandDataSchema,
  qualityCommandBodySchema,
  type QualityOrderData,
} from "@template/contracts";
import {
  readE2eRuntime,
  waitForCapturedAction,
  type E2eRuntimeIdentity,
} from "./runtime";

test.use({ actionTimeout: 15_000 });
type StaffDepartment = ManufacturingDepartment | "QUALITY";
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
      `P06 HTTP ${String(response.status())} ${failure.code} fields:${(failure.errors ?? []).map((issue) => issue.field).join(",")}`,
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
      throw new Error("P06 owned session observation failed");
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
  if (!fixture) throw new Error("P06 project fixture missing");
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
      const email = `p06.${crypto.randomUUID()}@p06-e2e.test`;
      const password = "P06!SyntheticWorker2026";
      await goto(page, "/auth/register");
      await page
        .getByLabel("الاسم الكامل")
        .fill(`P06 ${department} ${email.slice(4, 12)}`);
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
              throw new Error("P06 fixture auth cookies missing");
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
          name: "P06 owned browser customer",
          phone: `050${String(Date.now()).slice(-7)}`,
          address: "P06 private address",
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
    face: "P06 retained face",
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
    .getByRole("button", {
      name: "اعتماد أمر التفصيل وتوجيهه للمصنع",
      exact: true,
    })
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
const qualityIncoming = async (
  run: Awaited<ReturnType<typeof scenario>>,
  quantity = 5,
) => {
  const order = await createOrder(run.sales, run.approver, "SHOP", quantity),
    ids = order.pieces.map((piece) => piece.id);
  for (const department of ["CUTTING", "PRODUCTION"] as const) {
    await command(run.admin, department, order.id, "RECEIVE_AND_START", ids);
    await command(run.admin, department, order.id, "COMPLETE_TRANSFER", ids);
  }
  return order;
};
const selectQuality = async (
  session: Session,
  orders: readonly { id: string; pieceIds: readonly string[] }[],
  view = "inspection",
) => {
  await goto(session.page, `/quality/${view}`);
  await session.page
    .getByRole("button", { name: "حسب القطعة", exact: true })
    .click();
  for (const selected of orders) {
    const detail = await qualityOrder(session, selected.id);
    for (const id of selected.pieceIds) {
      const piece = detail.paper.order.pieces.find((piece) => piece.id === id);
      if (!piece) throw new Error("Exact quality piece missing");
      await session.page
        .getByRole("checkbox", {
          name: `تحديد القطعة ${String(piece.position)} من ${detail.paper.order.businessNumber}`,
          exact: true,
        })
        .check();
    }
  }
};
const qualityWorkUi = async (
  session: Session,
  id: string,
  pieceIds: readonly string[],
  operation: "RECEIVE_AND_START" | "CONTINUE",
  reinspection = false,
) => {
  if (pieceIds.length === 1) {
    await goto(
      session.page,
      `/quality/tasks/${id}?pieceId=${pieceIds[0] ?? ""}`,
    );
    await session.page
      .getByRole("button", {
        name: operation === "CONTINUE" ? "متابعة الفحص" : "استلام وبدء الفحص",
        exact: true,
      })
      .click();
  } else {
    if (operation !== "RECEIVE_AND_START")
      throw new Error(
        "Only receive and start is available in the batch toolbar",
      );
    await selectQuality(session, [{ id, pieceIds }], "incoming");
    await session.page
      .getByRole("button", {
        name: reinspection
          ? "استلام وبدء إعادة فحص المحدد"
          : "استلام وبدء فحص المحدد",
        exact: true,
      })
      .click();
  }
  const dialog = session.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(pieceIds.length);
  for (const pieceId of pieceIds)
    await expect(dialog).not.toContainText(pieceId);
  const originUrl = session.page.url();
  const pending = responseFor(session.page, "/quality/commands");
  await dialog.getByRole("button", { name: /^تأكيد /u }).click();
  const response = await pending,
    result = await dataFrom(response, qualityCommandDataSchema);
  expect(
    qualityCommandBodySchema.parse(response.request().postDataJSON()).orders[0],
  ).toMatchObject({ orderId: id, pieceIds: [...pieceIds].sort() });
  await expect(
    session.page.getByText(
      operation === "RECEIVE_AND_START"
        ? `تم استلام وبدء فحص ${String(pieceIds.length)} قطعة`
        : `تم تسجيل متابعة فحص ${String(pieceIds.length)} قطعة`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(session.page).toHaveURL(originUrl);
  if (pieceIds.length === 1 && operation === "RECEIVE_AND_START")
    await expect(
      session.page.getByRole("button", {
        name: "استلام وبدء الفحص",
        exact: true,
      }),
    ).toHaveCount(0);
  return result;
};
const openInspection = async (
  session: Session,
  orders: readonly { id: string; pieceIds: readonly string[] }[],
  mode: "piece" | "group" = "group",
  reinspection = false,
) => {
  const first = orders[0],
    pieceId = first?.pieceIds[0];
  if (!first || !pieceId)
    throw new Error("Exact inspection selection required");
  if (mode === "piece") {
    expect(orders).toHaveLength(1);
    expect(first.pieceIds).toHaveLength(1);
    await goto(session.page, `/quality/tasks/${first.id}?pieceId=${pieceId}`);
    await session.page
      .getByRole("button", { name: "تسجيل نتيجة الفحص", exact: true })
      .click();
  } else {
    await selectQuality(session, orders);
    await session.page
      .getByRole("button", {
        name: reinspection
          ? "تسجيل نتيجة إعادة فحص المحدد"
          : "تسجيل نتيجة فحص المحدد",
        exact: true,
      })
      .click();
  }
  const dialog = session.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};
const inspectionRow = (
  dialog: ReturnType<Page["getByRole"]>,
  pieceId: string,
) => dialog.getByText(pieceId, { exact: false }).locator("..");
const chooseOutcome = async (
  dialog: ReturnType<Page["getByRole"]>,
  pieceId: string,
  decision: "ACCEPT" | "REJECT",
  target: "CUTTING" | "PRODUCTION" = "PRODUCTION",
  details = true,
) => {
  const row = inspectionRow(dialog, pieceId);
  await row
    .getByRole("combobox", { name: /^نتيجة القطعة/u })
    .selectOption(decision);
  if (decision === "REJECT" && details) {
    await row
      .getByRole("combobox", { name: /^القسم المسؤول/u })
      .selectOption(target);
    await row
      .getByLabel("سبب الرفض", { exact: true })
      .fill(`P06 original defect ${pieceId}`);
    await row
      .getByLabel("تعليمات التصحيح", { exact: true })
      .fill(`P06 original instructions ${pieceId}`);
  }
};
const saveInspection = async (session: Session) => {
  const originUrl = session.page.url();
  const pending = responseFor(session.page, "/quality/commands");
  await session.page
    .getByRole("dialog")
    .getByRole("button", { name: "تأكيد نتيجة الفحص", exact: true })
    .click();
  const response = await pending;
  const body = qualityCommandBodySchema.parse(
      response.request().postDataJSON(),
    ),
    result = await dataFrom(response, qualityCommandDataSchema);
  await expect(session.page.getByRole("dialog")).toBeHidden();
  await expect(session.page).toHaveURL(originUrl);
  return { body, result };
};
const pieceContext = (data: QualityOrderData, id: string) => {
  const piece = data.paper.order.pieces.find((piece) => piece.id === id),
    work = data.work.find((work) => work.pieceId === id);
  if (!piece || !work) throw new Error("Requested quality identity missing");
  return { piece, work };
};
test("P06 US1 ordinary colleagues exact subsets optional packing and physical receipt separation", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("QUALITY"),
      b = await run.worker("QUALITY"),
      order = await qualityIncoming(run),
      ids = order.pieces.map((piece) => piece.id),
      [p1, p2, p3, p4, p5] = ids;
    if (!p1 || !p2 || !p3 || !p4 || !p5)
      throw new Error("Five pieces required");
    await goto(a.page, `/quality/orders/${order.id}?tab=form`);
    const paper = a.page.getByRole("article", {
      name: "مواصفات أمر التفصيل للمصنع",
    });
    await expect(paper).toContainText(order.createdAt);
    await expect(
      paper.getByRole("columnheader", { name: "المقاس", exact: true }),
    ).toHaveCount(1);
    await expect(paper.getByText(/المركز الرئيسي/u)).toBeVisible();
    await qualityWorkUi(a, order.id, ids, "RECEIVE_AND_START");
    const start = (await qualityOrder(a, order.id)).work[0]?.visit?.startedBy;
    await qualityWorkUi(b, order.id, [p1], "CONTINUE");
    const continued = await qualityOrder(b, order.id);
    expect(pieceContext(continued, p1).work.visit?.startedBy).toEqual(start);
    expect(pieceContext(continued, p1).work.lastAction?.actor.id).not.toBe(
      start?.id,
    );
    let dialog = await openInspection(b, [{ id: order.id, pieceIds: ids }]);
    await chooseOutcome(dialog, p1, "ACCEPT");
    for (const id of ids.slice(1))
      await inspectionRow(dialog, id).getByLabel("فحص هذه القطعة").uncheck();
    await dialog
      .getByLabel("عدد الكراتين (اختياري)", { exact: true })
      .fill("  2 / اثنان  ");
    await dialog
      .getByLabel("أرقام الكراتين (اختياري)", { exact: true })
      .fill("C-12, C-13");
    await dialog
      .getByLabel("ملاحظات فاحص الجودة (اختياري)", { exact: true })
      .fill("Protect finished surfaces");
    await saveInspection(b);
    dialog = await openInspection(
      b,
      [{ id: order.id, pieceIds: [p2] }],
      "piece",
    );
    await expect(dialog.getByLabel(/عدد الكراتين/u)).toHaveCount(0);
    await dialog
      .getByRole("radio", { name: "قبول وتغليف (مطابقة)", exact: true })
      .click();
    await saveInspection(b);
    dialog = await openInspection(b, [{ id: order.id, pieceIds: [p3] }]);
    await chooseOutcome(dialog, p3, "ACCEPT");
    await dialog
      .getByLabel("ملاحظات فاحص الجودة (اختياري)", { exact: true })
      .fill("Note only, no carton group");
    await saveInspection(b);
    dialog = await openInspection(b, [{ id: order.id, pieceIds: [p4] }]);
    await chooseOutcome(dialog, p4, "ACCEPT");
    await dialog
      .getByLabel("أرقام الكراتين (اختياري)", { exact: true })
      .fill("Later group / B");
    await saveInspection(b);
    await reloadAuthenticated(b);
    const saved = await qualityOrder(b, order.id);
    expect(saved.paper.order.counts.received).toBe(0);
    expect(saved.paper.order.counts.completionPercent).toBe(0);
    expect(saved.packingGroups).toHaveLength(2);
    expect(
      saved.packingGroups.find((group) => group.acceptedPieceIds.includes(p1)),
    ).toMatchObject({
      cartonCount: "  2 / اثنان  ",
      cartonNumbers: "C-12, C-13",
      inspectorNote: "Protect finished surfaces",
    });
    expect(
      saved.packingGroups.find((group) => group.acceptedPieceIds.includes(p4))
        ?.cartonNumbers,
    ).toBe("Later group / B");
    for (const id of [p1, p2, p3, p4])
      expect(pieceContext(saved, id).piece).toMatchObject({
        stage: "WAREHOUSE",
        workState: "INCOMING",
        receivedAt: null,
      });
    expect(pieceContext(saved, p5)).toEqual(pieceContext(continued, p5));
    expect(pieceContext(saved, p3).work.latestInspection?.inspectorNote).toBe(
      "Note only, no carton group",
    );
    expect(
      pieceContext(saved, p2).work.latestInspection?.packingGroupId,
    ).toBeNull();
    expect(pieceContext(saved, p1).work.visit?.startedBy).toEqual(start);
    await goto(a.page, `/quality/orders/${order.id}`);
    await expect(a.page.getByRole("link", { name: /طباعة/u })).toHaveCount(0);
    await expect(
      a.page.getByText("C-12, C-13", { exact: false }),
    ).toBeVisible();
    expect(await a.page.locator("html").getAttribute("dir")).toBe("rtl");
  } finally {
    await run.close();
  }
});

const qualityCommand = async (
  session: Session,
  id: string,
  operation: "RECEIVE_AND_START" | "CONTINUE",
  pieceIds: readonly string[],
) => {
  const detail = await qualityOrder(session, id);
  return dataFrom(
    await post(session, "/quality/commands", {
      commandId: crypto.randomUUID(),
      operation,
      orders: [
        { orderId: id, expectedVersion: detail.paper.order.version, pieceIds },
      ],
    }),
    qualityCommandDataSchema,
  );
};
const correct = async (
  session: Session,
  orderId: string,
  pieceId: string,
  target: ManufacturingDepartment,
) => {
  for (const department of target === "CUTTING"
    ? (["CUTTING", "PRODUCTION"] as const)
    : (["PRODUCTION"] as const)) {
    await command(session, department, orderId, "RECEIVE_AND_START", [pieceId]);
    await command(session, department, orderId, "COMPLETE_TRANSFER", [pieceId]);
  }
};
const historyPages = async (session: Session, id: string) => {
  const first = await dataFrom(
      await session.page.request.get(
        api(`/quality/orders/${id}/history?page=1&limit=25`),
        { headers: session.headers },
      ),
      qualityOrderHistoryDataSchema,
    ),
    pages = [first];
  expect(first.pagination.totalPages).toBeLessThanOrEqual(10);
  for (let page = 2; page <= first.pagination.totalPages; page++)
    pages.push(
      await dataFrom(
        await session.page.request.get(
          api(`/quality/orders/${id}/history?page=${String(page)}&limit=25`),
          { headers: session.headers },
        ),
        qualityOrderHistoryDataSchema,
      ),
    );
  return pages;
};
const reportManufacturingUi = async (
  session: Session,
  department: ManufacturingDepartment,
  id: string,
  pieceId: string,
) => {
  await goto(
    session.page,
    `/${department.toLowerCase()}/tasks/${id}?pieceId=${pieceId}`,
  );
  await session.page
    .getByRole("button", { name: "تسجيل مشكلة", exact: true })
    .click();
  const dialog = session.page.getByRole("dialog");
  await dialog
    .getByLabel("سبب المشكلة (مطلوب)", { exact: true })
    .fill("P06 actual correction-department hold");
  const pending = responseFor(
    session.page,
    `/manufacturing-orders/${id}/pieces/${pieceId}/issues`,
  );
  await dialog
    .getByRole("button", { name: "تسجيل المشكلة", exact: true })
    .click();
  const result = await dataFrom(await pending, approvalCommandDataSchema);
  await expect(dialog).toBeHidden();
  return result;
};
const resolveUi = async (
  approver: Session,
  id: string,
  decision: "CANCEL" | "RETURN_TO_DEPARTMENT" | "SEND_TO_SALES",
  target: ManufacturingDepartment = "PRODUCTION",
) => {
  await goto(approver.page, `/approval/orders/${id}`);
  await approver.page
    .getByRole("button", { name: "اتخاذ قرار معالجة المشكلة (أ، ب، ج)" })
    .first()
    .click();
  const dialog = approver.page.locator(".oriental-modal-container");
  await dialog
    .getByLabel(
      decision === "CANCEL"
        ? /الخيار \(ج\)/u
        : decision === "RETURN_TO_DEPARTMENT"
          ? /الخيار \(أ\)/u
          : /الخيار \(ب\)/u,
    )
    .check();
  if (decision === "CANCEL") {
    await dialog
      .getByLabel("سبب إلغاء القطعة *:")
      .fill("P06 retained approval cancellation");
    await dialog.getByRole("button", { name: "مراجعة إلغاء القطعة" }).click();
  } else if (decision === "RETURN_TO_DEPARTMENT") {
    await dialog.getByLabel("توجيه إلى قسم:").selectOption(target);
    await dialog
      .getByRole("textbox")
      .fill("P06 actual approved return instructions");
  }
  const pending = approver.page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith(
        `/api/v1/approvals/orders/${id}/pieces/`,
      ) &&
      new URL(response.url()).pathname.endsWith("/resolve") &&
      response.request().method() === "POST",
  );
  if (decision === "CANCEL")
    await approver.page
      .getByRole("alertdialog")
      .getByRole("button", { name: "تأكيد إلغاء القطعة" })
      .click();
  else
    await dialog.getByRole("button", { name: "تنفيذ قرار الاعتماد" }).click();
  const result = await dataFrom(await pending, approvalCommandDataSchema);
  await expect(dialog).toBeHidden();
  return result;
};
test("P06 US3 both correction routes repeated cycles paginated immutable history and correction-department cancellation", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(240_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("QUALITY"),
      b = await run.worker("QUALITY"),
      order = await qualityIncoming(run, 3),
      [p1, p2, p3] = order.pieces;
    if (!p1 || !p2 || !p3) throw new Error("Three exact pieces required");
    await qualityWorkUi(
      a,
      order.id,
      order.pieces.map((piece) => piece.id),
      "RECEIVE_AND_START",
    );
    const untouched = pieceContext(await qualityOrder(b, order.id), p3.id);
    let dialog = await openInspection(a, [
      { id: order.id, pieceIds: [p1.id, p2.id] },
    ]);
    await chooseOutcome(dialog, p1.id, "REJECT", "CUTTING", false);
    await chooseOutcome(dialog, p2.id, "REJECT", "PRODUCTION");
    const before = await qualityOrder(a, order.id);
    await dialog
      .getByRole("button", { name: "تأكيد نتيجة الفحص", exact: true })
      .click();
    await expect(dialog.getByRole("alert").first()).toBeVisible();
    expect(await qualityOrder(a, order.id)).toEqual(before);
    await chooseOutcome(dialog, p1.id, "REJECT", "CUTTING");
    await saveInspection(a);
    const rejected = await qualityOrder(a, order.id),
      c1 = pieceContext(rejected, p1.id).work.currentCorrection,
      c2 = pieceContext(rejected, p2.id).work.currentCorrection;
    if (!c1 || !c2) throw new Error("Actual opened cycles required");
    expect(c1.cycle).toBe(1);
    expect(c2.target).toBe("PRODUCTION");
    await correct(run.admin, order.id, p1.id, "CUTTING");
    await correct(run.admin, order.id, p2.id, "PRODUCTION");
    await goto(a.page, "/quality/dashboard");
    await expect(
      a.page.getByText("وارد بانتظار الفحص", { exact: true }),
    ).toBeVisible();
    await expect(
      a.page.locator(
        'a[href="/quality/corrections"], a[href="/quality/reinspection"]',
      ),
    ).toHaveCount(0);
    for (const path of ["/quality/corrections", "/quality/reinspection"]) {
      await goto(a.page, path);
      await expect(a.page).toHaveURL(/\/quality\/incoming$/u);
    }
    await qualityWorkUi(a, order.id, [p1.id, p2.id], "RECEIVE_AND_START", true);
    dialog = await openInspection(
      a,
      [{ id: order.id, pieceIds: [p1.id, p2.id] }],
      "group",
      true,
    );
    await chooseOutcome(dialog, p1.id, "REJECT", "CUTTING");
    await chooseOutcome(dialog, p2.id, "ACCEPT");
    await dialog
      .getByLabel("أرقام الكراتين (اختياري)", { exact: true })
      .fill("Cycle-one accepted peer");
    await saveInspection(a);
    const again = await qualityOrder(a, order.id),
      next = pieceContext(again, p1.id).work.currentCorrection;
    if (!next) throw new Error("Next cycle required");
    expect(next.cycle).toBe(2);
    expect(next.id).not.toBe(c1.id);
    expect(pieceContext(again, p2.id).work.currentCorrection).toBeNull();
    const packing = again.packingGroups;
    await correct(run.admin, order.id, p1.id, "CUTTING");
    await qualityWorkUi(a, order.id, [p1.id], "RECEIVE_AND_START");
    for (let i = 0; i < 26; i++)
      await qualityCommand(i % 2 === 0 ? b : a, order.id, "CONTINUE", [p1.id]);
    dialog = await openInspection(
      a,
      [{ id: order.id, pieceIds: [p1.id] }],
      "group",
      true,
    );
    await chooseOutcome(dialog, p1.id, "ACCEPT");
    await saveInspection(a);
    const saved = await qualityOrder(b, order.id);
    expect(saved.packingGroups).toEqual(packing);
    expect(pieceContext(saved, p3.id)).toEqual(untouched);
    expect(pieceContext(saved, p1.id).work.currentCorrection).toBeNull();
    const pages = await historyPages(b, order.id),
      events = pages.flatMap((page) => page.events);
    expect(pages.length).toBeGreaterThan(1);
    expect(
      events.some(
        (item) =>
          item.kind === "quality" &&
          item.event.correctionLinks.some(
            (link) => link.correctionId === c1.id && link.action === "REJECTED",
          ),
      ),
    ).toBe(true);
    expect(
      events.some(
        (item) =>
          item.kind === "quality" &&
          item.event.correctionLinks.some(
            (link) =>
              link.correctionId === next.id && link.action === "ACCEPTED",
          ),
      ),
    ).toBe(true);
    const opening = pages.findIndex((page) =>
      page.events.some(
        (item) =>
          item.kind === "quality" &&
          item.event.correctionLinks.some(
            (link) => link.correctionId === c1.id && link.action === "OPENED",
          ),
      ),
    );
    expect(opening).toBeGreaterThanOrEqual(1);
    await goto(b.page, `/quality/orders/${order.id}?tab=history`);
    await b.page
      .getByRole("button", { name: String(opening + 1), exact: true })
      .click();
    await expect(b.page.getByText(new RegExp(c1.id)).first()).toBeVisible();
    await expect(
      b.page
        .getByText(`P06 original instructions ${p1.id}`, { exact: false })
        .first(),
    ).toBeVisible();
    for (const target of ["CUTTING", "PRODUCTION"] as const) {
      const cancelledOrder = await qualityIncoming(run, 1),
        piece = cancelledOrder.pieces[0];
      if (!piece) throw new Error("Cancellation piece required");
      await qualityWorkUi(
        a,
        cancelledOrder.id,
        [piece.id],
        "RECEIVE_AND_START",
      );
      dialog = await openInspection(a, [
        { id: cancelledOrder.id, pieceIds: [piece.id] },
      ]);
      await chooseOutcome(dialog, piece.id, "REJECT", target);
      await saveInspection(a);
      const cycle = pieceContext(
        await qualityOrder(a, cancelledOrder.id),
        piece.id,
      ).work.currentCorrection;
      if (!cycle) throw new Error("Cancellation cycle required");
      const worker = await run.worker(target);
      await reportManufacturingUi(worker, target, cancelledOrder.id, piece.id);
      await resolveUi(run.approver, cancelledOrder.id, "CANCEL");
      const rows = (await historyPages(b, cancelledOrder.id)).flatMap(
        (page) => page.events,
      );
      expect(
        rows.some(
          (item) =>
            item.kind === "issue" &&
            item.event.sourceDepartment === target &&
            item.event.correctionResolution?.correctionId === cycle.id &&
            item.event.result === "CANCELLED",
        ),
      ).toBe(true);
      await goto(b.page, `/quality/orders/${cancelledOrder.id}?tab=history`);
      await expect(b.page.getByText(/إلغاء دورة التصحيح 1/u)).toBeVisible();
    }
  } finally {
    await run.close();
  }
});
test("P06 US4 mixed exact cross-order outcomes and intervening hold reject the whole stale batch", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("QUALITY"),
      b = await run.worker("QUALITY"),
      first = await qualityIncoming(run),
      second = await qualityIncoming(run, 2),
      ids = first.pieces.map((piece) => piece.id),
      other = second.pieces.map((piece) => piece.id),
      [p1, p2, p3, p4, p5] = ids,
      [q1, q2] = other;
    if (!p1 || !p2 || !p3 || !p4 || !p5 || !q1 || !q2)
      throw new Error("Mixed identities required");
    await qualityCommand(a, first.id, "RECEIVE_AND_START", ids);
    await qualityCommand(a, second.id, "RECEIVE_AND_START", other);
    const original = await qualityOrder(a, first.id);
    let writes = 0;
    a.page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/v1/quality/commands" &&
        request.method() === "POST"
      )
        writes++;
    });
    let dialog = await openInspection(a, [
      { id: first.id, pieceIds: ids },
      { id: second.id, pieceIds: [q1] },
    ]);
    for (const id of [p1, p3, q1]) await chooseOutcome(dialog, id, "ACCEPT");
    await chooseOutcome(dialog, p2, "REJECT", "PRODUCTION");
    for (const id of [p4, p5])
      await inspectionRow(dialog, id).getByLabel("فحص هذه القطعة").uncheck();
    await expect(dialog.getByText("ستبقى هذه القطعة دون تغيير")).toHaveCount(2);
    const firstGroup = dialog
        .getByRole("heading", { name: first.businessNumber, exact: true })
        .locator(".."),
      secondGroup = dialog
        .getByRole("heading", { name: second.businessNumber, exact: true })
        .locator("..");
    await firstGroup
      .getByLabel("أرقام الكراتين (اختياري)", { exact: true })
      .fill("First order group");
    await secondGroup
      .getByLabel("عدد الكراتين (اختياري)", { exact: true })
      .fill("ثلاثة / 3");
    const inspected = await saveInspection(a);
    expect(writes).toBe(1);
    if (inspected.body.operation !== "INSPECT")
      throw new Error("Mixed inspection body required");
    expect(
      inspected.body.orders
        .find((order) => order.orderId === first.id)
        ?.decisions.map((decision) => decision.pieceId)
        .sort(),
    ).toEqual([p1, p2, p3].sort());
    expect(
      inspected.body.orders
        .find((order) => order.orderId === second.id)
        ?.decisions.map((decision) => decision.pieceId),
    ).toEqual([q1]);
    await reloadAuthenticated(a);
    const savedA = await qualityOrder(a, first.id),
      savedB = await qualityOrder(a, second.id);
    expect(pieceContext(savedA, p4)).toEqual(pieceContext(original, p4));
    expect(pieceContext(savedA, p5)).toEqual(pieceContext(original, p5));
    expect(savedA.paper.order.counts.received).toBe(0);
    expect(savedB.paper.order.counts.received).toBe(0);
    expect(savedA.packingGroups[0]?.acceptedPieceIds.sort()).toEqual(
      [p1, p3].sort(),
    );
    expect(savedB.packingGroups[0]).toMatchObject({
      cartonCount: "ثلاثة / 3",
      acceptedPieceIds: [q1],
    });
    dialog = await openInspection(a, [
      { id: first.id, pieceIds: [p4] },
      { id: second.id, pieceIds: [q2] },
    ]);
    await chooseOutcome(dialog, p4, "ACCEPT");
    await chooseOutcome(dialog, q2, "ACCEPT");
    await dialog
      .getByLabel("ملاحظات فاحص الجودة (اختياري)", { exact: true })
      .first()
      .fill("Retain this dirty confirmation");
    const current = await qualityOrder(b, second.id);
    await dataFrom(
      await post(b, "/quality/commands", {
        commandId: crypto.randomUUID(),
        operation: "REPORT_ISSUES",
        reason: "Real intervening hold",
        orders: [
          {
            orderId: second.id,
            expectedVersion: current.paper.order.version,
            pieceIds: [q2],
          },
        ],
      }),
      qualityCommandDataSchema,
    );
    const beforeA = await qualityOrder(a, first.id),
      beforeB = await qualityOrder(a, second.id),
      historyA = await historyPages(a, first.id),
      historyB = await historyPages(a, second.id);
    const pending = responseFor(a.page, "/quality/commands");
    await dialog
      .getByRole("button", { name: "تأكيد نتيجة الفحص", exact: true })
      .click();
    const rejected = await pending;
    expect(rejected.status()).toBe(409);
    expect(writes).toBe(2);
    expect(errorEnvelopeSchema.parse(await rejected.json()).code).toBe(
      "ORDER_VERSION_CONFLICT",
    );
    expect(await qualityOrder(a, first.id)).toEqual(beforeA);
    expect(await qualityOrder(a, second.id)).toEqual(beforeB);
    expect(await historyPages(a, first.id)).toEqual(historyA);
    expect(await historyPages(a, second.id)).toEqual(historyB);
    await expect(
      dialog.getByRole("button", { name: "تأكيد نتيجة الفحص", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog
        .getByLabel("ملاحظات فاحص الجودة (اختياري)", { exact: true })
        .first(),
    ).toHaveValue("Retain this dirty confirmation");
    await dialog
      .getByRole("button", { name: "تحديث ومراجعة جميع القطع", exact: true })
      .click();
    await expect(dialog.getByRole("alert").first()).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "تأكيد نتيجة الفحص", exact: true }),
    ).toBeDisabled();
    await expect(inspectionRow(dialog, q2)).toBeVisible();
    expect(writes).toBe(2);
    await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
    dialog = await openInspection(a, [{ id: first.id, pieceIds: [p4] }]);
    await chooseOutcome(dialog, p4, "ACCEPT");
    await saveInspection(a);
    expect(writes).toBe(3);
    expect(
      pieceContext(await qualityOrder(a, second.id), q2).piece.workState,
    ).toBe("BLOCKED");
  } finally {
    await run.close();
  }
});

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
test("P06 US5 exact issue holds retained safe history aliases filters keyboard and current authority", async ({
  browser,
  viewport,
}, info) => {
  test.setTimeout(240_000);
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const a = await run.worker("QUALITY"),
      b = await run.worker("QUALITY"),
      order = await qualityIncoming(run, 2),
      [p1, p2] = order.pieces.map((p) => p.id);
    if (!p1 || !p2) throw new Error("Two exact pieces required");
    const started = await qualityCommand(a, order.id, "RECEIVE_AND_START", [
      p1,
      p2,
    ]);
    await goto(a.page, `/quality/tasks/${order.id}?pieceId=${p1}`);
    const trigger = a.page.getByRole("button", {
      name: "تسجيل نتيجة الفحص",
      exact: true,
    });
    await trigger.focus();
    await a.page.keyboard.press("Enter");
    let dialog = a.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    expect(
      await dialog.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth;
      }),
    ).toBe(true);
    await dialog.getByRole("button", { name: "إغلاق", exact: true }).focus();
    await a.page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await a.page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await a.page.locator("html").getAttribute("dir")).toBe("rtl");
    expect(
      await a.page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toMatch(/cairo/iu);
    // Compare the retained factory-paper surface with its existing P05 owner.
    // The print-width paper is intentionally horizontally scrollable.
    const qualityWidth = await a.page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const production = await run.worker("PRODUCTION");
    await goto(production.page, `/production/tasks/${order.id}?pieceId=${p1}`);
    await expect(
      production.page.getByRole("heading", { name: /^مهمة /u }),
    ).toBeVisible();
    expect(qualityWidth).toBe(
      await production.page.evaluate(
        () => document.documentElement.scrollWidth,
      ),
    );
    const before = await qualityOrder(a, order.id);
    await a.page
      .getByRole("button", { name: "تسجيل مشكلة", exact: true })
      .click();
    dialog = a.page.getByRole("dialog");
    await dialog
      .getByLabel("سبب المشكلة (مطلوب)", { exact: true })
      .fill("P06 actual quality hold with optional blank notes");
    const reported = responseFor(a.page, "/quality/commands");
    await dialog
      .getByRole("button", { name: "تسجيل المشكلة", exact: true })
      .click();
    const report = await dataFrom(await reported, qualityCommandDataSchema);
    await expect(dialog).toBeHidden();
    const held = await qualityOrder(a, order.id);
    expect(pieceContext(held, p1).piece.workState).toBe("BLOCKED");
    expect(pieceContext(held, p2)).toEqual(pieceContext(before, p2));
    await resolveUi(
      run.approver,
      order.id,
      "RETURN_TO_DEPARTMENT",
      "PRODUCTION",
    );
    await correct(await run.worker("PRODUCTION"), order.id, p1, "PRODUCTION");
    await qualityCommand(a, order.id, "RECEIVE_AND_START", [p1]);
    dialog = await openInspection(a, [{ id: order.id, pieceIds: [p1] }]);
    await chooseOutcome(dialog, p1, "ACCEPT");
    await dialog
      .getByLabel("أرقام الكراتين (اختياري)", { exact: true })
      .fill("P06 safe retained carton");
    await saveInspection(a);
    // A standalone P04 report has no parent Quality batch and must remain visible.
    await dataFrom(
      await post(a, `/manufacturing-orders/${order.id}/pieces/${p2}/issues`, {
        commandId: crypto.randomUUID(),
        expectedVersion: (await qualityOrder(a, order.id)).paper.order.version,
        reason: "P06 standalone legacy quality report",
        notes: "",
      }),
      approvalCommandDataSchema,
    );
    await resolveUi(run.approver, order.id, "CANCEL");
    const retainedResponse = await b.page.request.get(
      api(`/quality/orders/${order.id}`),
      { headers: b.headers },
    );
    expect(retainedResponse.status()).toBe(200);
    const retainedRaw: unknown = await retainedResponse.json();
    safeKeys(retainedRaw);
    const retained = qualityOrderDataSchema.parse(
      successEnvelopeSchema.parse(retainedRaw).data,
    );
    expect(pieceContext(retained, p1).piece.stage).toBe("WAREHOUSE");
    expect(pieceContext(retained, p2).piece.stage).toBe("CANCELLED");
    for (const work of retained.work)
      expect(Object.values(work.allowedActions).some(Boolean)).toBe(false);
    const history = (await historyPages(b, order.id)).flatMap((p) => p.events);
    safeKeys(history);
    expect(
      history.filter(
        (e) =>
          e.kind === "quality" &&
          e.event.commandId === report.receipt.commandId,
      ),
    ).toHaveLength(1);
    expect(
      history.filter(
        (e) => e.kind === "issue" && e.event.operation === "REPORT_ISSUE",
      ),
    ).toHaveLength(1);
    expect(
      history.filter(
        (e) => e.kind === "issue" && e.event.operation === "RESOLVE_ISSUE",
      ),
    ).toHaveLength(2);
    for (const path of [
      `/quality/orders/${order.id}`,
      `/quality/tasks/${order.id}?pieceId=${p1}`,
      "/quality/activity",
    ]) {
      await goto(b.page, path);
      await expect(b.page.getByRole("link", { name: /طباعة/u })).toHaveCount(0);
    }
    await goto(b.page, `/quality/orders/${order.id}`);
    await expect(
      b.page.getByText("P06 safe retained carton", { exact: false }),
    ).toBeVisible();
    for (const [alias, destination] of [
      ["/quality", "dashboard"],
      ["/quality/waiting", "incoming"],
      ["/quality/sent", "accepted"],
      ["/quality/corrections", "incoming"],
      ["/quality/reinspection", "incoming"],
    ] as const) {
      await goto(b.page, alias);
      await expect(b.page).toHaveURL(
        new RegExp(`/quality/${destination}$`, "u"),
      );
    }
    await goto(b.page, "/quality/accepted");
    await b.page.getByRole("textbox").fill(order.businessNumber);
    await b.page
      .getByRole("combobox", { name: "نوع أمر التفصيل" })
      .selectOption("SHOP");
    await expect(
      b.page.locator(`a[href="/quality/orders/${order.id}"]`),
    ).toHaveCount(1);
    const grouped = await dataFrom(
      await b.page.request.get(
        api(
          `/quality/orders?view=ACCEPTED&type=SHOP&search=${order.businessNumber}&page=1&limit=10`,
        ),
        { headers: b.headers },
      ),
      qualityOrdersDataSchema,
    );
    expect(grouped.counts.pieces).toBe(1);
    await b.page
      .getByRole("button", { name: "حسب القطعة", exact: true })
      .click();
    const flat = await dataFrom(
      await b.page.request.get(
        api(
          `/quality/pieces?view=ACCEPTED&type=SHOP&search=${order.businessNumber}&page=1&limit=10`,
        ),
        { headers: b.headers },
      ),
      qualityPiecesDataSchema,
    );
    expect(flat.counts).toEqual(grouped.counts);
    expect(flat.items).toHaveLength(1);
    safeKeys(grouped);
    safeKeys(flat);
    for (const path of [
      `/quality/orders/${order.id}`,
      `/quality-commands/${started.receipt.commandId}`,
      `/order-paper/${order.id}`,
    ]) {
      const response = await a.page.request.get(api(path), {
        headers: path.startsWith("/order-paper")
          ? a.headers
          : run.sales.headers,
      });
      expect(response.status()).toBe(403);
    }
    expect(
      (
        await b.page.request.get(
          api(`/quality-commands/${started.receipt.commandId}`),
          { headers: b.headers },
        )
      ).status(),
    ).toBe(404);
    const unrelated = await createOrder(run.sales, run.approver, "SHOP", 1);
    expect(
      (
        await b.page.request.get(api(`/quality/orders/${unrelated.id}`), {
          headers: b.headers,
        })
      ).status(),
    ).toBe(404);
    await run.sales.page.goto(
      `${readE2eRuntime().webOrigin}/quality/orders/${order.id}`,
    );
    await expect(run.sales.page).toHaveURL(/\/unauthorized$/u);
    const denied = await post(run.sales, "/quality/commands", {
      commandId: crypto.randomUUID(),
      operation: "CONTINUE",
      orders: [
        {
          orderId: order.id,
          expectedVersion: retained.paper.order.version,
          pieceIds: [p1],
        },
      ],
    });
    expect(denied.status()).toBe(403);
    for (const change of ["reassign", "suspend"] as const) {
      const worker = await run.isolatedWorker("QUALITY");
      await goto(worker.page, `/quality/orders/${order.id}`);
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
      expect(
        (
          await worker.page.request.get(api(`/quality/orders/${order.id}`), {
            headers: worker.headers,
          })
        ).status(),
      ).toBe(403);
      await worker.page.reload();
      await expect(worker.page).not.toHaveURL(/\/quality\//u);
      await expect(
        worker.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
      ).toHaveCount(0);
    }
    expect(await qualityOrder(b, order.id)).toEqual(retained);
  } finally {
    await run.close();
  }
});

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
const prepareRecovery = async (
  session: Session,
  order: Awaited<ReturnType<typeof qualityIncoming>>,
  origin: "queue" | "task",
) => {
  const piece = order.pieces[0];
  if (!piece) throw new Error("Exact physical piece required");
  await goto(session.page, "/quality/dashboard");
  await session.page.evaluate(() => {
    document.documentElement.dataset["p06RecoveryWitness"] = "same-document";
  });
  await session.page
    .locator('main a[href="/quality/incoming"]')
    .first()
    .click();
  await expect(session.page).toHaveURL(/\/quality\/incoming$/u);
  await session.page.getByRole("textbox").fill(order.businessNumber);
  await session.page
    .getByRole("button", { name: "حسب القطعة", exact: true })
    .click();
  const row = session.page.getByRole("row").filter({
    has: session.page.getByRole("checkbox", {
      name: `تحديد القطعة ${String(piece.position)} من ${order.businessNumber}`,
      exact: true,
    }),
  });
  if (origin === "task") {
    await row
      .locator(`a[href="/quality/tasks/${order.id}?pieceId=${piece.id}"]`)
      .click();
    await session.page
      .getByRole("button", { name: "استلام وبدء الفحص", exact: true })
      .click();
  } else {
    await row.getByRole("checkbox").check();
    await session.page
      .getByRole("button", { name: "استلام وبدء فحص المحدد", exact: true })
      .click();
  }
  const dialog = session.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};
for (const origin of ["queue", "task"] as const) {
  test(`P06 US4 recovery ${origin} unmount announces delayed real success once on the destination`, async ({
    browser,
    viewport,
  }, info) => {
    const run = await scenario(browser, info.project.name, viewport),
      accepted = barrier(),
      deliver = barrier(),
      settled = barrier();
    const routing = { entered: false };
    let routeFailure: unknown;
    try {
      const worker = await run.worker("QUALITY"),
        order = await qualityIncoming(run, 1),
        piece = order.pieces[0];
      if (!piece) throw new Error("Exact piece required");
      const before = await qualityOrder(worker, order.id),
        dialog = await prepareRecovery(worker, order, origin),
        bodies: unknown[] = [];
      await worker.page.route("**/api/v1/quality/commands", async (route) => {
        routing.entered = true;
        try {
          bodies.push(route.request().postDataJSON());
          const response = await route.fetch();
          await dataFrom(response, qualityCommandDataSchema);
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
      await dialog.getByRole("button", { name: /^تأكيد /u }).click();
      await accepted.promise;
      expect(routeFailure).toBeUndefined();
      await expect(
        dialog.getByRole("button", { name: /^تأكيد /u }),
      ).toBeDisabled();
      await dialog
        .getByRole("button", { name: "إغلاق النافذة", exact: true })
        .click();
      await worker.page.goBack();
      await expect(worker.page).toHaveURL(
        new RegExp(
          `/quality/${origin === "queue" ? "dashboard" : "incoming"}$`,
          "u",
        ),
      );
      await expect(worker.page.locator("html")).toHaveAttribute(
        "data-p06-recovery-witness",
        "same-document",
      );
      const recovery = worker.page.getByLabel("متابعة نتيجة الإجراء", {
        exact: true,
      });
      await expect(recovery).toContainText("جارٍ إرسال الإجراء");
      deliver.release();
      await settled.promise;
      expect(routeFailure).toBeUndefined();
      await expect(
        worker.page
          .getByLabel("قائمة الإشعارات")
          .getByText(/^تم استلام وبدء فحص/u),
      ).toHaveCount(1);
      await expect(recovery).toHaveCount(0);
      expect(bodies).toHaveLength(1);
      const intent = qualityCommandBodySchema.parse(bodies[0]);
      expect(intent.orders).toEqual([
        {
          orderId: order.id,
          expectedVersion: before.paper.order.version,
          pieceIds: [piece.id],
        },
      ]);
      const saved = await qualityOrder(worker, order.id);
      expect(saved.paper.order.version).toBe(before.paper.order.version + 1);
      expect(pieceContext(saved, piece.id).piece.workState).toBe("IN_PROGRESS");
      expect(
        (await historyPages(worker, order.id))
          .flatMap((p) => p.events)
          .filter(
            (e) =>
              e.kind === "quality" && e.event.commandId === intent.commandId,
          ),
      ).toHaveLength(1);
      await expect(recovery).toHaveCount(0);
    } finally {
      deliver.release();
      if (routing.entered) await settled.promise;
      await run.close();
    }
  });
}
test("P06 US4 recovery committed lost delivery retains unknown and replays frozen intent then reload observes read-only", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const worker = await run.worker("QUALITY"),
      order = await qualityIncoming(run, 1),
      piece = order.pieces[0];
    if (!piece) throw new Error("Exact piece required");
    const before = await qualityOrder(worker, order.id),
      dialog = await prepareRecovery(worker, order, "queue"),
      bodies: unknown[] = [];
    let original: ReturnType<typeof qualityCommandDataSchema.parse> | undefined;
    await worker.page.route("**/api/v1/quality/commands", async (route) => {
      bodies.push(route.request().postDataJSON());
      const response = await route.fetch(),
        saved = await dataFrom(response, qualityCommandDataSchema);
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
    await dialog.getByRole("button", { name: /^تأكيد /u }).click();
    const recovery = worker.page.getByLabel("متابعة نتيجة الإجراء", {
      exact: true,
    });
    await expect(recovery).toContainText("نتيجة الإجراء غير مؤكدة");
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    if (!original) throw new Error("Actual saved result required");
    const receiptPath = `/quality-commands/${original.receipt.commandId}`;
    await worker.page.route(`**/api/v1${receiptPath}`, async (route) => {
      await dataFrom(await route.fetch(), qualityCommandDataSchema);
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
    await expect(
      worker.page
        .getByLabel("قائمة الإشعارات")
        .getByText(/^تم استلام وبدء فحص/u),
    ).toHaveCount(1);
    await expect(recovery).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    await worker.page.unroute(`**/api/v1${receiptPath}`);
    const saved = await qualityOrder(worker, order.id);
    expect(saved.paper.order.version).toBe(before.paper.order.version + 1);
    expect(
      (await historyPages(worker, order.id))
        .flatMap((p) => p.events)
        .filter(
          (e) =>
            e.kind === "quality" &&
            e.event.commandId === original?.receipt.commandId,
        ),
    ).toHaveLength(1);
    await goto(worker.page, "/quality/activity");
    await reloadAuthenticated(worker);
    await expect(recovery).toHaveCount(0);
    const row = worker.page
      .getByRole("row")
      .filter({ hasText: order.businessNumber });
    const observed = responseFor(worker.page, receiptPath, "GET");
    await row
      .getByRole("button", { name: "التحقق من النتيجة الأصلية", exact: true })
      .click();
    expect(
      (await dataFrom(await observed, qualityCommandDataSchema)).receipt,
    ).toEqual(original.receipt);
    await expect(row.getByRole("status")).toContainText(
      original.receipt.commandId,
    );
    await expect(
      worker.page.getByRole("button", {
        name: "إعادة نفس الإجراء",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(
      await worker.page.evaluate(
        ({ commandId, pieceId }) =>
          [localStorage, sessionStorage].some((store) =>
            Object.keys(store).some((key) =>
              [key, store.getItem(key) ?? ""].some((text) =>
                [commandId, pieceId].some((id) => text.includes(id)),
              ),
            ),
          ),
        { commandId: original.receipt.commandId, pieceId: piece.id },
      ),
    ).toBe(false);
  } finally {
    await run.close();
  }
});
test("P06 US4 recovery account replacement suppresses delayed old-context publication and private receipt", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport),
    accepted = barrier(),
    deliver = barrier(),
    settled = barrier();
  const routing = { entered: false };
  let routeFailure: unknown;
  try {
    const a = await run.isolatedWorker("QUALITY"),
      b = await run.worker("QUALITY"),
      order = await qualityIncoming(run, 1),
      piece = order.pieces[0];
    if (!piece) throw new Error("Exact piece required");
    const dialog = await prepareRecovery(a, order, "task");
    let original: ReturnType<typeof qualityCommandDataSchema.parse> | undefined,
      writes = 0;
    await a.page.route("**/api/v1/quality/commands", async (route) => {
      routing.entered = true;
      try {
        writes++;
        const response = await route.fetch();
        original = await dataFrom(response, qualityCommandDataSchema);
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
    await dialog.getByRole("button", { name: /^تأكيد /u }).click();
    await accepted.promise;
    expect(routeFailure).toBeUndefined();
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    const menu = a.page.getByRole("button", { name: "فتح القائمة الجانبية" });
    if (await menu.isVisible()) await menu.click();
    await a.page.locator(".oriental-logout-btn").click();
    await expect(a.page).toHaveURL(/\/auth\/login/u);
    const replacement = departmentColleagues
      .get("QUALITY")
      ?.find((identity) => identity.email === b.email);
    if (!replacement) throw new Error("Owned replacement identity required");
    await a.page
      .getByLabel("البريد الإلكتروني", { exact: true })
      .fill(replacement.email);
    await a.page
      .getByLabel("كلمة المرور", { exact: true })
      .fill(replacement.password);
    await a.page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .click();
    await expect(a.page).toHaveURL(/\/quality\/dashboard$/u);
    deliver.release();
    await settled.promise;
    expect(routeFailure).toBeUndefined();
    await expect(
      a.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
    ).toHaveCount(0);
    await expect(a.page.getByLabel("قائمة الإشعارات")).toHaveCount(0);
    if (!original) throw new Error("Actual old-context receipt required");
    expect(writes).toBe(1);
    const saved = await qualityOrder(b, order.id);
    expect(pieceContext(saved, piece.id).work.visit?.startedBy).toEqual(
      original.receipt.actor,
    );
    expect(
      (
        await b.page.request.get(
          api(`/quality-commands/${original.receipt.commandId}`),
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

test("P06 convergence Arabic validation retains inactive drafts and saves the exact rejection-only subset", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport);
  try {
    const worker = await run.worker("QUALITY"),
      order = await qualityIncoming(run, 2),
      [p1, p2] = order.pieces.map((piece) => piece.id);
    if (!p1 || !p2) throw new Error("Two exact pieces required");
    await qualityCommand(worker, order.id, "RECEIVE_AND_START", [p1, p2]);
    const before = await qualityOrder(worker, order.id);
    let writes = 0;
    worker.page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/v1/quality/commands" &&
        request.method() === "POST"
      )
        writes++;
    });
    await goto(worker.page, `/quality/tasks/${order.id}?pieceId=${p1}`);
    await worker.page
      .getByRole("button", { name: "تسجيل مشكلة", exact: true })
      .click();
    let dialog = worker.page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "تسجيل المشكلة", exact: true })
      .click();
    const reportReason = dialog.getByLabel("سبب المشكلة (مطلوب)", {
      exact: true,
    });
    await expect(reportReason).toHaveAttribute("aria-invalid", "true");
    await expect(reportReason).toBeFocused();
    await expect(dialog.getByRole("alert")).toContainText("سبب المشكلة مطلوب");
    expect(writes).toBe(0);
    await dialog
      .getByRole("button", { name: "إغلاق النافذة", exact: true })
      .click();
    dialog = await openInspection(worker, [
      { id: order.id, pieceIds: [p1, p2] },
    ]);
    await chooseOutcome(dialog, p1, "ACCEPT");
    await chooseOutcome(dialog, p2, "ACCEPT");
    await dialog
      .getByLabel("عدد الكراتين (اختياري)", { exact: true })
      .fill("c".repeat(4001));
    await chooseOutcome(dialog, p1, "REJECT", "CUTTING", false);
    const first = inspectionRow(dialog, p1);
    await first
      .getByRole("combobox", { name: /^القسم المسؤول/u })
      .selectOption("CUTTING");
    await first
      .getByRole("combobox", { name: /^القسم المسؤول/u })
      .selectOption("");
    await first.getByLabel("سبب الرفض", { exact: true }).fill("r".repeat(4001));
    await first
      .getByLabel("تعليمات التصحيح", { exact: true })
      .fill("Retained first repair");
    await dialog
      .getByRole("button", { name: "تأكيد نتيجة الفحص", exact: true })
      .click();
    await expect(
      first.getByRole("combobox", { name: /^القسم المسؤول/u }),
    ).toHaveAttribute("aria-invalid", "true");
    await expect(
      first.getByRole("alert").filter({ hasText: "قسم التصحيح" }),
    ).toContainText("أعد التأكيد");
    await expect(first.getByLabel("سبب الرفض", { exact: true })).toHaveValue(
      "r".repeat(4001),
    );
    expect(writes).toBe(0);
    await first.getByLabel("فحص هذه القطعة", { exact: true }).uncheck();
    await chooseOutcome(dialog, p2, "REJECT", "PRODUCTION");
    await expect(
      dialog.getByLabel("عدد الكراتين (اختياري)", { exact: true }),
    ).toHaveCount(0);
    const saved = await saveInspection(worker);
    expect(writes).toBe(1);
    if (saved.body.operation !== "INSPECT")
      throw new Error("Inspection body required");
    expect(saved.body.orders).toEqual([
      {
        orderId: order.id,
        expectedVersion: before.paper.order.version,
        inspectorNote: null,
        packing: null,
        decisions: [
          {
            pieceId: p2,
            decision: "REJECT",
            target: "PRODUCTION",
            reason: `P06 original defect ${p2}`,
            instructions: `P06 original instructions ${p2}`,
          },
        ],
      },
    ]);
    const after = await qualityOrder(worker, order.id);
    expect(pieceContext(after, p1)).toEqual(pieceContext(before, p1));
    expect(pieceContext(after, p2).work.currentCorrection).toMatchObject({
      target: "PRODUCTION",
      id: saved.result.outcome.orders[0]?.pieces[0]?.correctionId,
      phase: "WAITING_CORRECTION",
      reason: `P06 original defect ${p2}`,
      instructions: `P06 original instructions ${p2}`,
    });
    expect(after.packingGroups).toEqual([]);
    expect(after.paper.order.counts.received).toBe(0);
    expect(
      after.paper.order.pieces.every((piece) => piece.receivedAt === null),
    ).toBe(true);
  } finally {
    await run.close();
  }
});

test("P06 convergence cached task read retry retains context and permits one exact report after recovery", async ({
  browser,
  viewport,
}, info) => {
  const run = await scenario(browser, info.project.name, viewport),
    accepted = barrier(),
    deliver = barrier(),
    settled = barrier();
  const routing = { entered: false, canDeliver: false };
  let routeFailure: unknown;
  let session: Session | undefined, pattern: string | undefined;
  try {
    const worker = await run.worker("QUALITY"),
      order = await qualityIncoming(run, 2),
      [piece, companion] = order.pieces;
    session = worker;
    if (!piece || !companion) throw new Error("Two exact pieces required");
    await qualityCommand(worker, order.id, "RECEIVE_AND_START", [piece.id]);
    const before = await qualityOrder(worker, order.id);
    await goto(worker.page, `/quality/tasks/${order.id}?pieceId=${piece.id}`);
    await expect(
      worker.page.getByRole("button", {
        name: "تسجيل نتيجة الفحص",
        exact: true,
      }),
    ).toBeEnabled();
    await worker.page.evaluate(() => {
      document.documentElement.dataset["p06RecoveryWitness"] = "same-document";
    });
    await worker.page
      .getByRole("link", { name: "عرض أمر التفصيل", exact: true })
      .click();
    await expect(worker.page).toHaveURL(
      new RegExp(`/quality/orders/${order.id}$`, "u"),
    );
    await worker.page.goBack();
    await expect(worker.page.locator("html")).toHaveAttribute(
      "data-p06-recovery-witness",
      "same-document",
    );
    const inspect = worker.page.getByRole("button", {
      name: "تسجيل نتيجة الفحص",
      exact: true,
    });
    await expect(inspect).toBeEnabled();
    let writes = 0;
    worker.page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/v1/quality/commands" &&
        request.method() === "POST"
      )
        writes++;
    });
    pattern = `**/api/v1/quality/orders/${order.id}`;
    await worker.page.route(pattern, async (route) => {
      const first = !routing.entered;
      routing.entered = true;
      try {
        const response = await route.fetch();
        await dataFrom(response, qualityOrderDataSchema);
        if (first) {
          accepted.release();
          await deliver.promise;
        }
        if (routing.canDeliver) await route.fulfill({ response });
        else await route.abort("failed");
      } catch (error: unknown) {
        routeFailure = error;
        accepted.release();
        await route.abort("failed");
      } finally {
        if (first) settled.release();
      }
    });
    await inspect.click();
    await accepted.promise;
    expect(routeFailure).toBeUndefined();
    await expect(
      worker.page.getByText("جارٍ تحديث المهمة…", { exact: true }),
    ).toBeVisible();
    await expect(
      worker.page.getByRole("heading", {
        name: `مهمة ${order.businessNumber}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(inspect).toBeDisabled();
    deliver.release();
    await settled.promise;
    const readFailure = worker.page
      .getByRole("alert")
      .filter({ hasText: "تعذر تحديث المهمة" });
    await expect(readFailure).toBeVisible();
    await expect(readFailure).not.toContainText("غير مؤكدة");
    await expect(inspect).toBeDisabled();
    await expect(worker.page.getByRole("dialog")).toHaveCount(0);
    expect(writes).toBe(0);
    routing.canDeliver = true;
    await readFailure
      .getByRole("button", { name: "إعادة المحاولة", exact: true })
      .click();
    await expect(readFailure).toHaveCount(0);
    await expect(inspect).toBeEnabled();
    await expect(
      worker.page.getByText("جارٍ تحديث المهمة…", { exact: true }),
    ).toHaveCount(0);
    await expect(
      worker.page.getByLabel("متابعة نتيجة الإجراء", { exact: true }),
    ).toHaveCount(0);
    expect(writes).toBe(0);
    expect(routeFailure).toBeUndefined();
    await inspect.click();
    await expect(worker.page.getByRole("dialog")).toBeVisible();
    await worker.page
      .getByRole("dialog")
      .getByRole("button", { name: "إغلاق", exact: true })
      .click();
    expect(writes).toBe(0);
    await worker.page
      .getByRole("button", { name: "تسجيل مشكلة", exact: true })
      .click();
    const reportDialog = worker.page.getByRole("dialog");
    await reportDialog
      .getByLabel("سبب المشكلة (مطلوب)", { exact: true })
      .fill("P06 exact report after read recovery");
    expect(writes).toBe(0);
    const reported = responseFor(worker.page, "/quality/commands");
    await reportDialog
      .getByRole("button", { name: "تسجيل المشكلة", exact: true })
      .click();
    const response = await reported,
      result = await dataFrom(response, qualityCommandDataSchema),
      body = qualityCommandBodySchema.parse(response.request().postDataJSON());
    expect(body).toEqual({
      commandId: result.receipt.commandId,
      operation: "REPORT_ISSUES",
      reason: "P06 exact report after read recovery",
      notes: null,
      orders: [
        {
          orderId: order.id,
          expectedVersion: before.paper.order.version,
          pieceIds: [piece.id],
        },
      ],
    });
    await expect(reportDialog).toBeHidden();
    expect(writes).toBe(1);
    const held = await qualityOrder(worker, order.id),
      outcome = result.outcome.orders[0]?.pieces[0];
    expect(outcome).toMatchObject({
      pieceId: piece.id,
      stage: "QUALITY",
      workState: "BLOCKED",
    });
    expect(outcome?.issueId).not.toBeNull();
    expect(pieceContext(held, piece.id).piece).toMatchObject({
      stage: "QUALITY",
      workState: "BLOCKED",
      receivedAt: null,
    });
    expect(
      Object.values(pieceContext(held, piece.id).work.allowedActions).some(
        Boolean,
      ),
    ).toBe(false);
    expect(pieceContext(held, companion.id)).toEqual(
      pieceContext(before, companion.id),
    );
    expect(held.paper.order.version).toBe(before.paper.order.version + 1);
    expect(held.paper.order.counts.received).toBe(
      before.paper.order.counts.received,
    );
    expect(held.paper.order.counts.completionPercent).toBe(
      before.paper.order.counts.completionPercent,
    );
    expect(held.packingGroups).toEqual(before.packingGroups);
    const reports = (await historyPages(worker, order.id))
      .flatMap((page) => page.events)
      .filter(
        (item) =>
          item.kind === "quality" &&
          item.event.commandId === result.receipt.commandId,
      );
    expect(reports).toHaveLength(1);
    expect(reports[0]?.event).toMatchObject({
      operation: "REPORT_ISSUES",
      pieces: [{ pieceId: piece.id, issueId: outcome?.issueId }],
    });
    safeKeys(held);
    expect(routeFailure).toBeUndefined();
  } finally {
    deliver.release();
    if (routing.entered) await settled.promise;
    if (session && pattern) await session.page.unroute(pattern);
    await run.close();
  }
});
