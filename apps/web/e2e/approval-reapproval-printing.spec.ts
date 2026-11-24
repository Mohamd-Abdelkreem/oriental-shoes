import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approvalCommandDataSchema,
  approvalOrderDataSchema,
  catalogDataSchema,
  catalogQuoteDataSchema,
  catalogQuoteBodySchema,
  customerCommandDataSchema,
  salesOrderCommandDataSchema,
  salesOrderDataSchema,
  salesOrderActivityDataSchema,
  submitContactBodySchema,
  officialOrderPaperDataSchema,
  factoryOrderPaperDataSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
  type SalesOrderDto,
  type SalesOrderType,
} from "@template/contracts";
import {
  readE2eRuntime,
  type E2eRuntimeIdentity,
  type E2eP04Fixtures,
} from "./runtime";

test.use({ actionTimeout: 15_000 });
const mode = process.env["P04_E2E_CATALOG_MODE"] ?? "synthetic";
if (mode !== "synthetic" && mode !== "reviewed-workbook")
  throw new Error("P04_E2E_CATALOG_MODE_INVALID");
type Session = Readonly<{
  page: Page;
  context: BrowserContext;
  headers: Record<string, string>;
}>;
const api = (path: string) => `${readE2eRuntime().apiOrigin}/api/v1${path}`;
const goto = (page: Page, path: string) =>
  page.goto(`${readE2eRuntime().webOrigin}${path}`);
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
      `P04 HTTP ${String(response.status())} ${failure.code} fields:${(failure.errors ?? []).map((issue) => issue.field).join(",")}`,
    );
  }
  return schema.parse(successEnvelopeSchema.parse(raw).data);
};
const signIn = async (
  browser: Browser,
  identity: E2eRuntimeIdentity,
  viewport: { width: number; height: number } | null,
): Promise<Session> => {
  const context = await browser.newContext({
    ...(viewport === null ? {} : { viewport }),
  });
  try {
    const page = await context.newPage();
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
    const pending = page.waitForRequest(
      async (request) =>
        new URL(request.url()).pathname === "/api/v1/users/me" &&
        (await request.headerValue("authorization")) !== null,
    );
    await page.reload();
    const authorization = await (await pending).headerValue("authorization"),
      csrf = (await context.cookies(readE2eRuntime().apiOrigin)).find(
        (cookie) => cookie.name === "csrfToken",
      );
    if (authorization === null || csrf === undefined)
      throw new Error("P04 owned session observation failed");
    return {
      page,
      context,
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
const fixtures = (project: string): E2eP04Fixtures => {
  const fixture = readE2eRuntime().p04ByProject[project];
  if (!fixture) throw new Error("Missing P04 project fixtures");
  return fixture;
};
const current = async (session: Session, orderId: string) =>
  dataFrom(
    await session.page.request.get(api(`/approvals/orders/${orderId}`), {
      headers: session.headers,
    }),
    approvalOrderDataSchema,
  );
const salesOrder = async (session: Session, orderId: string) =>
  (
    await dataFrom(
      await session.page.request.get(api(`/sales-orders/${orderId}`), {
        headers: session.headers,
      }),
      salesOrderDataSchema,
    )
  ).order;
const choose = async (
  page: Page,
  label: string | RegExp,
  column: string,
  text: string,
) => {
  const trigger = page.getByRole("combobox", { name: label }).first();
  await trigger.click();
  const search = page.getByPlaceholder(`ابحث في ${column}...`);
  await expect(search).toBeFocused();
  await search.fill(text);
  await page.getByRole("option", { name: text, exact: true }).first().click();
  await expect(trigger).toBeFocused();
};
const catalogFor = async (session: Session) => {
  const catalog = await dataFrom(
    await session.page.request.get(api("/catalogs"), {
      headers: session.headers,
    }),
    catalogDataSchema,
  );
  if (catalog.availability !== "available")
    throw new Error("Owned catalog unavailable");
  return catalog;
};
const submitOrder = async (session: Session, type: SalesOrderType = "SHOP") => {
  const catalog = await catalogFor(session),
    selected = (kind: string) => {
      const entry = catalog.entries.find((entry) => entry.kind === kind);
      if (!entry) throw new Error("Missing catalog entry");
      return entry;
    };
  const customer = (
    await dataFrom(
      await session.page.request.post(api("/customers"), {
        headers: await mutationHeaders(session),
        data: {
          commandId: crypto.randomUUID(),
          customer: {
            name: "P04 browser customer",
            phone: `050${String(Date.now()).slice(-7)}`,
            address: "Owned browser address",
          },
        },
      }),
      customerCommandDataSchema,
    )
  ).savedCustomer;
  const model = selected("model"),
    base = selected("leatherBase"),
    decoration = catalog.entries.find(
      (entry) =>
        entry.kind === "decoration" && entry.displayValue === "زبيري - z",
    );
  if (!decoration) throw new Error("Missing decoration");
  if (type === "SHOP") {
    await goto(
      session.page,
      `/sales/orders/new?customer=${encodeURIComponent(customer.phone)}`,
    );
    await expect(
      session.page.getByRole("button", { name: "إزالة اختيار العميل" }),
    ).toBeVisible();
    await choose(session.page, /^الموديل —/u, "الموديل", model.displayValue);
    await choose(session.page, "المقاس", "المقاس", "40");
    await choose(session.page, /^الأساس —/u, "الأساس", base.displayValue);
    await choose(
      session.page,
      /^التطعيم —/u,
      "التطعيم",
      decoration.displayValue,
    );
    await session.page
      .getByRole("textbox", { name: /^الوجه —/u })
      .fill("P04 captured face");
    await session.page
      .getByLabel("توقيع المسؤول", { exact: true })
      .fill("P04 captured responsible signature");
    await expect(
      session.page.getByLabel("الإجمالي المعروض للمراجعة"),
    ).toHaveText("1800.00");
    const pending = responseFor(session.page, "/sales-orders");
    await session.page
      .getByRole("button", { name: "إرسال للاعتماد", exact: true })
      .click();
    const saved = (await dataFrom(await pending, salesOrderCommandDataSchema))
      .savedOrder;
    await expect(session.page).toHaveURL(
      new RegExp(`/sales/orders/${saved.id}$`, "u"),
    );
    return saved;
  }
  const capture = {
    type,
    customerId: customer.id,
    paidAmount: "0.00",
    pieces: [
      {
        id: crypto.randomUUID(),
        model: model.displayValue,
        size: "40",
        leatherBase: base.displayValue,
        decoration: decoration.displayValue,
        face: "P04 retained repair face",
        catalogSelections: { decoration: decoration.id },
      },
    ],
  };
  const quote = await dataFrom(
    await session.page.request.post(api("/catalogs/quotes"), {
      headers: await mutationHeaders(session),
      data: catalogQuoteBodySchema.parse({
        requestId: crypto.randomUUID(),
        pieces: capture.pieces.map((piece) => ({
          id: piece.id,
          decoration: piece.decoration,
          catalogSelections: piece.catalogSelections,
        })),
      }),
    }),
    catalogQuoteDataSchema,
  );
  if (quote.availability !== "available")
    throw new Error("Owned quote unavailable");
  return (
    await dataFrom(
      await session.page.request.post(api("/sales-orders"), {
        headers: await mutationHeaders(session),
        data: {
          origin: "new",
          commandId: crypto.randomUUID(),
          expectedCustomerVersion: customer.version,
          capture,
          reviewedQuote: {
            sourceId: quote.sourceId,
            fingerprint: quote.fingerprint,
          },
        },
      }),
      salesOrderCommandDataSchema,
    )
  ).savedOrder;
};
const approve = async (session: Session, orderId: string) => {
  await goto(session.page, `/approval/orders/${orderId}`);
  const pending = responseFor(
    session.page,
    `/approvals/orders/${orderId}/approve`,
  );
  await session.page
    .getByRole("button", { name: "اعتماد أمر التفصيل", exact: true })
    .click();
  const saved = await dataFrom(await pending, approvalCommandDataSchema);
  await expect(
    session.page.getByRole("button", {
      name: "اعتماد أمر التفصيل",
      exact: true,
    }),
  ).toHaveCount(0);
  return saved;
};
const retainedTerms = (order: SalesOrderDto) => ({
  responsibleSignature: order.responsibleSignature,
  businessNumber: order.businessNumber,
  customer: order.customerSnapshot,
  money: order.money,
  pieces: order.pieces.map((piece) => ({
    id: piece.id,
    price: piece.unitPrice,
    decoration: piece.decoration,
  })),
});

if (mode === "synthetic") {
  test("P04 initial approval refreshes the cutting queue and its piece badges in the same workspace session", async ({
    browser,
    page,
  }, info) => {
    const viewport = page.viewportSize();
    const sales = await signIn(
      browser,
      fixtures(info.project.name).sales,
      viewport,
    );
    try {
      const admin = await signIn(browser, readE2eRuntime().admin, viewport);
      try {
        const order = await submitOrder(sales);
        const workspace = admin.page.getByRole("combobox", {
          name: "الانتقال إلى قسم",
        });
        const orderToggle = admin.page.getByRole("button", {
          name: new RegExp(order.businessNumber, "u"),
        });
        await goto(admin.page, "/cutting/incoming");
        await admin.page.getByRole("textbox").fill(order.businessNumber);
        await expect(
          admin.page.getByRole("heading", {
            name: "لا توجد أوامر مطابقة في هذا القسم.",
          }),
        ).toBeVisible();

        await workspace.selectOption("approval");
        await admin.page
          .getByRole("link", { name: /^فتح قائمة انتظار الاعتماد/u })
          .click();
        await admin.page
          .getByPlaceholder("ابحث برقم الطلب، العميل، أو الهاتف...")
          .fill(order.businessNumber);
        await admin.page
          .locator(`a[href="/approval/orders/${order.id}"]`)
          .first()
          .click();
        const pending = responseFor(
          admin.page,
          `/approvals/orders/${order.id}/approve`,
        );
        await admin.page
          .getByRole("button", {
            name: "اعتماد أمر التفصيل وتوجيهه للمصنع",
            exact: true,
          })
          .click();
        const saved = await dataFrom(await pending, approvalCommandDataSchema);
        expect(saved.outcome.orderStatus).toBe("APPROVED");
        await expect(admin.page).toHaveURL(/\/approval\/pending$/u);
        await expect(
          admin.page.getByText("تم اعتماد أمر التفصيل", { exact: true }),
        ).toBeVisible();
        const approved = (await current(admin, order.id)).order;
        expect(
          approved.pieces.map(({ stage, workState }) => ({ stage, workState })),
        ).toEqual(
          order.pieces.map(() => ({ stage: "CUTTING", workState: "INCOMING" })),
        );

        await workspace.selectOption("cutting");
        await admin.page
          .getByRole("link", {
            name: "فتح الصفحة المخصصة — وارد للقص والتفصيل",
          })
          .click();
        await admin.page.getByRole("textbox").fill(order.businessNumber);
        await orderToggle.click();
        const card = admin.page
          .getByRole("article")
          .filter({ has: orderToggle });
        await expect(card.getByText("في القص", { exact: true })).toHaveCount(
          order.pieces.length,
        );
        await expect(
          card.getByText("بانتظار الاستلام", { exact: true }),
        ).toHaveCount(order.pieces.length);
      } finally {
        await admin.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });

  test("P04 US1 administrator resubmits a sales return before a fresh approval", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const original = await submitOrder(sales);
        await goto(approver.page, `/approval/orders/${original.id}`);
        await approver.page
          .getByRole("button", { name: "إعادة للمبيعات مع سبب" })
          .click();
        await approver.page
          .getByLabel("سبب الإعادة الإلزامي *")
          .fill("Customer asked for exact half-size correction");
        await approver.page
          .getByLabel("تفاصيل وملاحظات إضافية للمبيعات (اختياري):")
          .fill("Retain decoration and first submission price");
        const returned = responseFor(
          approver.page,
          `/approvals/orders/${original.id}/return`,
        );
        await approver.page
          .getByRole("button", { name: "تأكيد الإعادة للمبيعات" })
          .click();
        const first = await dataFrom(await returned, approvalCommandDataSchema);
        expect(first.outcome.orderStatus).toBe("RETURNED");
        await goto(sales.page, `/sales/orders/${original.id}`);
        await expect(
          sales.page.getByText(
            "Customer asked for exact half-size correction",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          sales.page.getByText("Retain decoration and first submission price", {
            exact: true,
          }),
        ).toBeVisible();
        const admin = await signIn(
          browser,
          readE2eRuntime().admin,
          page.viewportSize(),
        );
        let corrected: Awaited<ReturnType<typeof salesOrder>>;
        try {
          await goto(admin.page, "/sales/orders/returned");
          await admin.page
            .getByRole("row")
            .filter({ hasText: original.businessNumber })
            .getByRole("link", { name: "تصحيح وإعادة الإرسال" })
            .click();
          await choose(admin.page, "المقاس", "المقاس", "40.5");
          const resubmitted = responseFor(
            admin.page,
            `/sales-orders/${original.id}/resubmit`,
          );
          await admin.page
            .getByRole("button", {
              name: "إعادة الإرسال للاعتماد",
              exact: true,
            })
            .click();
          const result = await dataFrom(
            await resubmitted,
            salesOrderCommandDataSchema,
          );
          expect(result.receipt.actor.id).toBe(readE2eRuntime().admin.id);
          corrected = result.savedOrder;
          expect(corrected).toMatchObject({
            status: "AWAITING_APPROVAL",
            owner: original.owner,
            pieces: expect.arrayContaining([
              expect.objectContaining({ size: "40.5" }),
            ]),
          });
          await goto(admin.page, "/sales/orders/returned");
          await expect(
            admin.page.getByRole("link", {
              name: original.businessNumber,
              exact: true,
            }),
          ).toHaveCount(0);
        } finally {
          await admin.context.close();
        }
        expect(retainedTerms(corrected)).toEqual(retainedTerms(original));
        await approve(approver, original.id);
        const approved = (await current(approver, original.id)).order;
        expect(approved.status).toBe("APPROVED");
        expect(
          approved.pieces.every(
            (piece) =>
              piece.stage === "CUTTING" && piece.workState === "INCOMING",
          ),
        ).toBe(true);
        expect(retainedTerms(approved)).toEqual(retainedTerms(original));
        const stale = await approver.page.request.post(
          api(`/approvals/orders/${original.id}/return`),
          {
            headers: await mutationHeaders(approver),
            data: {
              commandId: crypto.randomUUID(),
              expectedVersion: corrected.version,
              reason: "Obsolete competing decision",
            },
          },
        );
        expect(stale.status()).toBe(409);
        expect((await current(approver, original.id)).order.version).toBe(
          approved.version,
        );
        const other = await signIn(
          browser,
          fixture.otherSales,
          page.viewportSize(),
        );
        try {
          expect(
            (
              await other.page.request.get(
                api(`/sales-orders/${original.id}`),
                { headers: other.headers },
              )
            ).status(),
          ).toBe(404);
        } finally {
          await other.context.close();
        }
        await sales.page.reload();
        expect(retainedTerms(await salesOrder(sales, original.id))).toEqual(
          retainedTerms(original),
        );
        const second = await signIn(
          browser,
          fixture.approver,
          page.viewportSize(),
        );
        try {
          await goto(second.page, `/approval/orders/${original.id}`);
          expect(
            (await current(second, original.id)).workflow.initialApproval?.actor
              .id,
          ).toBe(fixture.approver.id);
        } finally {
          await second.context.close();
        }
        await goto(approver.page, "/approval/history");
        await expect(
          approver.page
            .getByText(original.businessNumber, { exact: true })
            .first(),
        ).toBeVisible();
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });
  for (const type of ["REPAIR", "ADJUSTMENT"] as const)
    test(`P04 US1 ${type} has no approval shortcut`, async ({
      browser,
      page,
    }, info) => {
      const fixture = fixtures(info.project.name),
        sales = await signIn(browser, fixture.sales, page.viewportSize());
      try {
        const order = await submitOrder(sales, type),
          approver = await signIn(
            browser,
            fixture.approver,
            page.viewportSize(),
          );
        try {
          expect(order.status).toBe("AWAITING_APPROVAL");
          expect(
            order.pieces.every((piece) => piece.stage === "AWAITING_APPROVAL"),
          ).toBe(true);
          await approve(approver, order.id);
          expect(
            (await current(approver, order.id)).order.pieces.every(
              (piece) =>
                piece.stage === "CUTTING" && piece.workState === "INCOMING",
            ),
          ).toBe(true);
        } finally {
          await approver.context.close();
        }
      } finally {
        await sales.context.close();
      }
    });
}

const scenario = (fixture: E2eP04Fixtures, name: string) => {
  const selected = fixture.scenarios[name];
  if (!selected) throw new Error("Missing P04 scenario");
  return selected;
};
const post = async (session: Session, path: string, body: unknown) =>
  session.page.request.post(api(path), {
    headers: await mutationHeaders(session),
    data: body,
  });
const report = async (
  factory: Session,
  orderId: string,
  pieceId: string,
  version: number,
) =>
  dataFrom(
    await post(
      factory,
      `/manufacturing-orders/${orderId}/pieces/${pieceId}/issues`,
      {
        commandId: crypto.randomUUID(),
        expectedVersion: version,
        reason: "P04 actual factory problem",
        notes: "Only this piece is affected",
      },
    ),
    approvalCommandDataSchema,
  );
const resolveUi = async (
  approver: Session,
  orderId: string,
  decision: "RETURN_TO_DEPARTMENT" | "SEND_TO_SALES" | "CANCEL",
) => {
  await goto(approver.page, `/approval/orders/${orderId}`);
  await approver.page
    .getByRole("button", { name: "اتخاذ قرار معالجة المشكلة (أ، ب، ج)" })
    .first()
    .click();
  const dialog = approver.page.locator(".oriental-modal-container");
  await dialog
    .getByLabel(
      decision === "RETURN_TO_DEPARTMENT"
        ? /الخيار \(أ\)/u
        : decision === "SEND_TO_SALES"
          ? /الخيار \(ب\)/u
          : /الخيار \(ج\)/u,
    )
    .check();
  if (decision === "CANCEL") {
    await dialog
      .getByLabel("سبب إلغاء القطعة *:")
      .fill("P04 confirmed retained cancellation");
    await dialog.getByRole("button", { name: "مراجعة إلغاء القطعة" }).click();
    await approver.page
      .getByRole("alertdialog")
      .getByRole("button", { name: "العودة دون إلغاء" })
      .click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "مراجعة إلغاء القطعة" }).click();
  } else {
    await dialog.getByLabel("توجيه إلى قسم:").selectOption("PRODUCTION");
    await dialog
      .getByRole("textbox")
      .fill("P04 explicit retained production instructions");
  }
  const pending = approver.page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith(
        `/api/v1/approvals/orders/${orderId}/pieces/`,
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
  const response = await pending,
    saved = await dataFrom(response, approvalCommandDataSchema);
  await expect(dialog).toBeHidden();
  return { saved, body: response.request().postDataJSON() as unknown };
};
const assertFactoryPrivacy = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const child of value) assertFactoryPrivacy(child);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect(
      [
        "money",
        "unitPrice",
        "total",
        "paidAmount",
        "remainingDue",
        "surplus",
        "priceProvenance",
        "customerSnapshot",
        "contactNotes",
        "currentProposal",
        "phone",
        "email",
        "address",
      ].includes(key),
      `Forbidden factory field ${key}`,
    ).toBe(false);
    assertFactoryPrivacy(child);
  }
};
if (mode === "synthetic")
  for (const [name, decision] of [
    ["resolveA", "RETURN_TO_DEPARTMENT"],
    ["resolveB", "SEND_TO_SALES"],
    ["resolveC", "CANCEL"],
  ] as const)
    test(`P04 US2 ${decision} changes only the reported piece`, async ({
      browser,
      page,
    }, info) => {
      const fixture = fixtures(info.project.name),
        selected = scenario(fixture, name),
        factory = await signIn(browser, fixture.factory, page.viewportSize());
      try {
        const approver = await signIn(
          browser,
          fixture.approver,
          page.viewportSize(),
        );
        try {
          const before = await current(approver, selected.orderId),
            companion = before.order.pieces.find(
              (piece) => piece.id !== selected.pieceId,
            );
          if (!companion) throw new Error("Missing companion");
          const reported = await report(
              factory,
              selected.orderId,
              selected.pieceId,
              before.order.version,
            ),
            issueId = reported.outcome.issueId;
          if (!issueId) throw new Error("Missing actual issue");
          const held = await current(approver, selected.orderId),
            issue = held.workflow.issues.find((issue) => issue.id === issueId);
          expect(issue).toMatchObject({
            pieceId: selected.pieceId,
            reason: "P04 actual factory problem",
            source: {
              department: "CUTTING",
              stage: "CUTTING",
              workState: "INCOMING",
            },
            reporter: { id: fixture.factory.id },
          });
          expect(issue?.reportedAt).toBeTruthy();
          expect(
            held.order.pieces.find((piece) => piece.id === companion.id),
          ).toEqual(companion);
          const foreign = await post(
            approver,
            `/approvals/orders/${selected.orderId}/pieces/${companion.id}/issues/${issueId}/resolve`,
            {
              commandId: crypto.randomUUID(),
              expectedVersion: held.order.version,
              decision: "RETURN_TO_DEPARTMENT",
              target: "CUTTING",
              notes: "Foreign issue binding must deny",
            },
          );
          expect(foreign.status()).toBe(404);
          const { saved } = await resolveUi(
              approver,
              selected.orderId,
              decision,
            ),
            after = await current(approver, selected.orderId);
          expect(
            after.order.pieces.find((piece) => piece.id === companion.id),
          ).toEqual(companion);
          expect(saved.outcome).toMatchObject({
            pieceId: selected.pieceId,
            issueId,
            pieceStage:
              decision === "CANCEL"
                ? "CANCELLED"
                : decision === "SEND_TO_SALES"
                  ? "CUTTING"
                  : "PRODUCTION",
            pieceWorkState:
              decision === "RETURN_TO_DEPARTMENT" ? "INCOMING" : "BLOCKED",
            issueState:
              decision === "SEND_TO_SALES" ? "SALES_CONTACT" : "RESOLVED",
          });
          expect(after.order.customerSnapshot).toEqual(
            before.order.customerSnapshot,
          );
          expect(
            after.order.pieces.map((piece) => ({
              id: piece.id,
              unitPrice: piece.unitPrice,
              decoration: piece.decoration,
            })),
          ).toEqual(
            before.order.pieces.map((piece) => ({
              id: piece.id,
              unitPrice: piece.unitPrice,
              decoration: piece.decoration,
            })),
          );
          if (decision === "SEND_TO_SALES")
            expect(
              after.workflow.issues.find((issue) => issue.id === issueId)
                ?.resumeTarget,
            ).toBe("PRODUCTION");
          const obsolete = await post(
            approver,
            `/approvals/orders/${selected.orderId}/pieces/${selected.pieceId}/issues/${issueId}/resolve`,
            {
              commandId: crypto.randomUUID(),
              expectedVersion: held.order.version,
              decision: "CANCEL",
              reason: "Obsolete cancellation",
              confirmed: true,
            },
          );
          expect(obsolete.status()).toBe(409);
          if (decision === "RETURN_TO_DEPARTMENT") {
            const wrong = await post(
              factory,
              `/manufacturing-orders/${selected.orderId}/pieces/${selected.pieceId}/issues`,
              {
                commandId: crypto.randomUUID(),
                expectedVersion: after.order.version,
                reason: "Wrong source department",
              },
            );
            expect(wrong.status()).toBe(403);
          }
          const safe = await factory.page.request.get(
            api(`/manufacturing-orders/${selected.orderId}`),
            { headers: factory.headers },
          );
          expect(safe.ok()).toBe(true);
          assertFactoryPrivacy(
            successEnvelopeSchema.parse((await safe.json()) as unknown).data,
          );
          await approver.page.reload();
          expect(
            (await current(approver, selected.orderId)).order.version,
          ).toBe(after.order.version);
        } finally {
          await approver.context.close();
        }
      } finally {
        await factory.context.close();
      }
    });

const openContact = async (
  sales: Session,
  orderId: string,
  entry: "detail" | "returned" = "detail",
) => {
  await goto(
    sales.page,
    `/sales/orders/${entry === "returned" ? "returned" : orderId}`,
  );
  await sales.page
    .getByRole("link", { name: "التواصل مع العميل", exact: true })
    .and(sales.page.locator(`a[href^="/sales/orders/${orderId}?contact="]`))
    .first()
    .click();
  const form = sales.page.getByRole("form", {
    name: "مراجعة أمر التفصيل بعد التواصل مع العميل",
  });
  await expect(
    form.getByLabel("ملاحظات تواصل المبيعات مع العميل *:"),
  ).toBeVisible();
  await expect(sales.page).toHaveURL(
    (url) =>
      url.pathname === `/sales/orders/${orderId}` &&
      url.searchParams.has("contact"),
  );
  await expect(
    form.getByRole("region", { name: "أمر التفصيل الحالي" }),
  ).toBeVisible();
  return form;
};
const submitContactUi = async (
  sales: Session,
  orderId: string,
  input: {
    notes: string;
    modelId?: string;
    baseId?: string;
    sizeId?: string;
    clearSole?: true;
    extended?: { decorationId: string; aFieldId: string; fFieldId: string };
    kind?: "CANCEL_REQUEST";
    entry?: "returned";
  },
) => {
  const modal = await openContact(sales, orderId, input.entry);
  const selections = [
    { id: input.modelId, label: /^الموديل —/u, column: "الموديل" },
    { id: input.baseId, label: /^الأساس —/u, column: "الأساس" },
    {
      id: input.extended?.decorationId,
      label: /^التطعيم —/u,
      column: "التطعيم",
    },
    { id: input.sizeId, label: "المقاس", column: "المقاس" },
    { id: input.extended?.aFieldId, label: /^A$/u, column: "A" },
    { id: input.extended?.fFieldId, label: /^F$/u, column: "F" },
  ];
  if (selections.some(({ id }) => id !== undefined)) {
    const catalog = await catalogFor(sales);
    for (const { id, label, column } of selections) {
      if (id === undefined) continue;
      const option = catalog.entries.find((entry) => entry.id === id);
      if (!option) throw new Error("Missing selected contact catalog option");
      await choose(sales.page, label, column, option.displayValue);
    }
  }
  if (input.clearSole)
    await modal
      .getByRole("combobox", { name: /^النوع والموديل —/u })
      .getByRole("button", { name: "مسح القيمة", exact: true })
      .click();
  if (input.extended) {
    await expect(
      modal
        .getByRole("table", { name: /قياسات القطعة/u })
        .getByRole("columnheader"),
    ).toHaveText(["المقاس", "A", "F"]);
    await modal
      .getByRole("button", { name: "مكسي (X)", exact: true })
      .press("Space");
    await modal
      .getByRole("button", { name: "ربر دبل ١/٢ (R.D1/2)", exact: true })
      .click();
  }
  await modal
    .getByLabel("ملاحظات تواصل المبيعات مع العميل *:")
    .fill(input.notes);
  const pending = sales.page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith(
        `/api/v1/sales-contact/orders/${orderId}/pieces/`,
      ) &&
      new URL(response.url()).pathname.endsWith("/proposals") &&
      response.request().method() === "POST",
  );
  if (input.kind === "CANCEL_REQUEST") {
    await modal
      .getByRole("button", { name: "طلب إلغاء القطعة", exact: true })
      .click();
    await modal
      .getByRole("alertdialog")
      .getByRole("button", { name: "تأكيد طلب الإلغاء" })
      .click();
  } else
    await modal.getByRole("button", { name: "إرسال المقترح للاعتماد" }).click();
  const response = await pending,
    saved = await dataFrom(response, approvalCommandDataSchema),
    body = submitContactBodySchema.parse(
      response.request().postDataJSON() as unknown,
    );
  await expect(modal).toBeHidden();
  return { saved, body };
};
const reviewCurrentUi = async (
  approver: Session,
  orderId: string,
  decision: "ACCEPT" | "RETURN_TO_SALES" | "CANCEL",
  expectedCustomerNotes?: string,
) => {
  await approver.page
    .getByRole("button", { name: "مراجعة تعديل العميل", exact: true })
    .first()
    .click();
  const modal = approver.page.locator(".oriental-modal-container");
  if (expectedCustomerNotes !== undefined) {
    const notes = modal.getByRole("region", {
      name: "ملاحظات تواصل المبيعات مع العميل",
    });
    await expect(
      notes.getByText(expectedCustomerNotes, { exact: true }),
    ).toBeVisible();
  }
  await modal
    .getByLabel(
      decision === "ACCEPT"
        ? "قبول التعديل وإعادة الاعتماد"
        : decision === "RETURN_TO_SALES"
          ? "إرجاع القطعة للمبيعات مع السبب"
          : "إلغاء القطعة مع الاحتفاظ بسجلها",
      { exact: true },
    )
    .check();
  await modal
    .getByRole("textbox")
    .fill(
      decision === "RETURN_TO_SALES"
        ? "Confirm size with customer again"
        : "P04 actual review decision",
    );
  const pending = approver.page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith(
        `/api/v1/approvals/orders/${orderId}/pieces/`,
      ) &&
      new URL(response.url()).pathname.endsWith("/review") &&
      response.request().method() === "POST",
  );
  if (decision === "CANCEL") {
    await modal.getByRole("button", { name: "مراجعة إلغاء القطعة" }).click();
    await approver.page
      .getByRole("alertdialog")
      .getByRole("button", { name: "تأكيد إلغاء القطعة" })
      .click();
  } else
    await modal.getByRole("button", { name: "تنفيذ قرار الاعتماد" }).click();
  const saved = await dataFrom(await pending, approvalCommandDataSchema);
  await expect(modal).toBeHidden();
  return saved;
};
const printHeld = async (session: Session, orderId: string) => {
  const response = await session.page.request.get(
    api(`/order-paper/${orderId}`),
    { headers: session.headers },
  );
  expect(response.status()).toBe(409);
  expect(
    errorEnvelopeSchema.parse((await response.json()) as unknown).code,
  ).toBe("ORDER_PRINT_REAPPROVAL_PENDING");
};
const halfSize = async (sales: Session) => {
  const catalog = await catalogFor(sales),
    entry = catalog.entries.find(
      (entry) => entry.kind === "size" && entry.displayValue === "40.5",
    );
  if (!entry) throw new Error("Missing reviewed half-size");
  return entry.id;
};
if (mode === "synthetic") {
  test("P04 US3 administrator renews a sales contact proposal while the piece stays held", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      selected = scenario(fixture, "contact"),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const before = await current(approver, selected.orderId),
          sizeId = await halfSize(sales),
          version = before.order.version;
        const catalog = await catalogFor(sales);
        const nextModel = catalog.entries.filter(
          (entry) => entry.kind === "model",
        )[1];
        const nextBase = catalog.entries.filter(
          (entry) => entry.kind === "leatherBase",
        )[1];
        const previousDecoration = before.order.pieces.find(
          (piece) => piece.id === selected.pieceId,
        )?.decoration;
        const nextDecoration = catalog.entries.find(
          (entry) =>
            entry.kind === "decoration" &&
            entry.displayValue !== previousDecoration,
        );
        const aField = catalog.entries.find((entry) => entry.kind === "aField");
        const fField = catalog.entries.find((entry) => entry.kind === "fField");
        if (!nextModel || !nextBase || !nextDecoration || !aField || !fField)
          throw new Error("Missing alternative reviewed selections");
        if (selected.issueId === null) throw new Error("Missing referral");
        const endpoint = `/sales-contact/orders/${selected.orderId}/pieces/${selected.pieceId}/issues/${selected.issueId}/proposals`;
        const denied = await signIn(
          browser,
          fixture.otherSales,
          page.viewportSize(),
        );
        try {
          expect(
            (
              await post(denied, endpoint, {
                commandId: crypto.randomUUID(),
                expectedVersion: version,
                kind: "AMEND",
                changes: { size: sizeId },
                contactNotes: "Wrong owner must not submit",
              })
            ).status(),
          ).toBe(404);
        } finally {
          await denied.context.close();
        }
        const first = await submitContactUi(sales, selected.orderId, {
          notes: "Customer proposes exact half-size and no floor",
          modelId: nextModel.id,
          baseId: nextBase.id,
          sizeId,
          clearSole: true,
        });
        expect(first.body.kind).toBe("AMEND");
        if (first.body.kind !== "AMEND") throw new Error("Expected amendment");
        expect(first.body.changes).toEqual({
          model: nextModel.id,
          leatherBase: nextBase.id,
          size: sizeId,
          sole: null,
        });
        const held = await current(approver, selected.orderId),
          proposal = held.workflow.issues.find(
            (issue) => issue.id === selected.issueId,
          )?.currentProposal;
        expect(proposal?.before).toMatchObject({ size: "40" });
        expect(proposal?.proposed).toMatchObject({ size: "40.5", sole: null });
        expect(held.order.pieces).toEqual(before.order.pieces);
        await printHeld(sales, selected.orderId);
        await goto(approver.page, `/approval/orders/${selected.orderId}`);
        await reviewCurrentUi(approver, selected.orderId, "RETURN_TO_SALES");
        const returned = await current(approver, selected.orderId),
          issue = returned.workflow.issues.find(
            (issue) => issue.id === selected.issueId,
          );
        expect(issue).toMatchObject({
          state: "SALES_CONTACT",
          resumeTarget: "PRODUCTION",
        });
        expect(returned.order.pieces).toEqual(before.order.pieces);
        await printHeld(sales, selected.orderId);
        await goto(sales.page, `/sales/orders/${selected.orderId}`);
        await expect(
          sales.page.getByText("Confirm size with customer again", {
            exact: true,
          }),
        ).toBeVisible();
        const admin = await signIn(
          browser,
          readE2eRuntime().admin,
          page.viewportSize(),
        );
        const customerReply =
          "أكّد العميل المقاس المطلوب بعد التجربة.\nوطلب تعديل التطعيم.";
        try {
          const renewed = await submitContactUi(admin, selected.orderId, {
            entry: "returned",
            notes: customerReply,
            modelId: nextModel.id,
            baseId: nextBase.id,
            sizeId,
            clearSole: true,
            extended: {
              decorationId: nextDecoration.id,
              aFieldId: aField.id,
              fFieldId: fField.id,
            },
          });
          expect(renewed.saved.receipt.actor.id).toBe(
            readE2eRuntime().admin.id,
          );
          expect(renewed.saved.outcome.issueId).toBe(selected.issueId);
          expect(renewed.saved.outcome.proposalId).not.toBe(
            first.saved.outcome.proposalId,
          );
        } finally {
          await admin.context.close();
        }
        await goto(approver.page, `/approval/orders/${selected.orderId}`);
        await reviewCurrentUi(
          approver,
          selected.orderId,
          "ACCEPT",
          customerReply,
        );
        const accepted = (await current(approver, selected.orderId)).order,
          changed = accepted.pieces.find(
            (piece) => piece.id === selected.pieceId,
          );
        expect(changed).toMatchObject({
          model: nextModel.displayValue,
          leatherBase: nextBase.displayValue,
          size: "40.5",
          sole: null,
          decoration: nextDecoration.displayValue,
          aField: aField.displayValue,
          fField: fField.displayValue,
          paperCodes: ["X", "R.D1/2"],
          stage: "PRODUCTION",
          workState: "INCOMING",
        });
        expect(accepted.customerSnapshot).toEqual(
          before.order.customerSnapshot,
        );
        expect(accepted.money).toEqual(before.order.money);
        expect(
          accepted.pieces.find((piece) => piece.id !== selected.pieceId),
        ).toEqual(
          before.order.pieces.find((piece) => piece.id !== selected.pieceId),
        );
        expect(changed?.unitPrice).toBe(
          before.order.pieces.find((piece) => piece.id === selected.pieceId)
            ?.unitPrice,
        );
        await sales.page.reload();
        expect(
          (await salesOrder(sales, selected.orderId)).pieces.find(
            (piece) => piece.id === selected.pieceId,
          )?.size,
        ).toBe("40.5");
        const history = await dataFrom(
          await sales.page.request.get(
            api(`/approvals/orders/${selected.orderId}/history`),
            { headers: sales.headers },
          ),
          salesOrderActivityDataSchema,
        );
        const reviews = history.events.filter(
          (event) =>
            event.kind === "approval" &&
            event.event.operation === "REVIEW_CONTACT",
        );
        expect(reviews).toHaveLength(2);
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });
  test("P04 US3 lost notes-only response survives leaving the contact page and confirmed refresh failure without replay", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      selected = scenario(fixture, "notes"),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const before = await current(approver, selected.orderId),
          modal = await openContact(sales, selected.orderId);
        await modal
          .getByLabel("ملاحظات تواصل المبيعات مع العميل *:")
          .fill("Customer confirms retained specifications");
        const command: { id: string | null } = { id: null };
        let writes = 0;
        const proposalPattern = `**/sales-contact/orders/${selected.orderId}/pieces/*/issues/*/proposals`;
        await sales.page.route(proposalPattern, async (route) => {
          writes++;
          const body = submitContactBodySchema.parse(
            route.request().postDataJSON() as unknown,
          );
          command.id = body.commandId;
          expect(body.kind).toBe("AMEND");
          if (body.kind !== "AMEND")
            throw new Error("Expected notes amendment");
          expect(body.changes).toEqual({});
          await dataFrom(await route.fetch(), approvalCommandDataSchema);
          await route.abort("failed");
        });
        await modal
          .getByRole("button", { name: "إرسال المقترح للاعتماد" })
          .click();
        await expect(
          sales.page.getByText(
            "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
            { exact: true },
          ),
        ).toBeVisible();
        await sales.page
          .getByRole("link", { name: "العودة للطلب", exact: true })
          .click();
        await expect(modal).toBeHidden();
        const wrapperPattern = `**/sales-contact/orders/${selected.orderId}`;
        await sales.page.route(wrapperPattern, async (route) => {
          await route.fetch();
          await route.abort("failed");
        });
        if (command.id === null)
          throw new Error("Missing actual committed command");
        const observed = responseFor(
          sales.page,
          `/approval-commands/${command.id}`,
          "GET",
        );
        await sales.page
          .getByRole("button", { name: "التحقق من النتيجة" })
          .click();
        await dataFrom(await observed, approvalCommandDataSchema);
        await expect(
          sales.page.getByText("تم الحفظ؛ تعذر تحديث العرض الحالي.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          sales.page.getByRole("button", { name: "إعادة نفس العملية" }),
        ).toHaveCount(0);
        expect(writes).toBe(1);
        await sales.page.unroute(wrapperPattern);
        await sales.page
          .getByRole("button", { name: "تحديث العرض", exact: true })
          .click();
        await expect(
          sales.page.getByText("تم الحفظ وتحديث البيانات.", { exact: true }),
        ).toBeVisible();
        await sales.page
          .getByRole("button", { name: "تم", exact: true })
          .click();
        expect(writes).toBe(1);
        await sales.page.unroute(proposalPattern);
        const held = await current(approver, selected.orderId);
        expect(held.order.pieces).toEqual(before.order.pieces);
        await printHeld(sales, selected.orderId);
        await goto(approver.page, `/approval/orders/${selected.orderId}`);
        await reviewCurrentUi(approver, selected.orderId, "ACCEPT");
        expect(
          (await current(approver, selected.orderId)).order.pieces.find(
            (piece) => piece.id === selected.pieceId,
          ),
        ).toMatchObject({
          size: "40",
          stage: "PRODUCTION",
          workState: "INCOMING",
        });
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });
  test("P04 US3 cancellation request changes no money until approval cancellation", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      selected = scenario(fixture, "cancelRequest"),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const before = await current(approver, selected.orderId),
          submitted = await submitContactUi(sales, selected.orderId, {
            notes: "Customer requests cancellation only",
            kind: "CANCEL_REQUEST",
          });
        expect(submitted.body.kind).toBe("CANCEL_REQUEST");
        expect(submitted.body).not.toHaveProperty("changes");
        const held = await current(approver, selected.orderId);
        expect(held.order.pieces).toEqual(before.order.pieces);
        expect(held.order.money).toEqual(before.order.money);
        await printHeld(sales, selected.orderId);
        await goto(approver.page, `/approval/orders/${selected.orderId}`);
        await reviewCurrentUi(approver, selected.orderId, "CANCEL");
        const after = (await current(approver, selected.orderId)).order;
        expect(
          after.pieces.find((piece) => piece.id === selected.pieceId),
        ).toMatchObject({ stage: "CANCELLED", size: "40" });
        expect(after.money.paidAmount).toBe(before.order.money.paidAmount);
        expect(
          after.pieces.find((piece) => piece.id !== selected.pieceId),
        ).toEqual(
          before.order.pieces.find((piece) => piece.id !== selected.pieceId),
        );
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });
  test("P04 US3 ADMIN owner keeps one origin command across client-side approval navigation", async ({
    browser,
    page,
  }) => {
    const runtime = readE2eRuntime(),
      admin = await signIn(browser, runtime.admin, page.viewportSize());
    try {
      // Project selection comes from this worker, not from another account or browser context.
      const project = test.info().project.name,
        selected = fixtures(project).adminOwnedContact,
        businessNumber = (await current(admin, selected.orderId)).order
          .businessNumber;
      const modal = await openContact(admin, selected.orderId);
      await modal
        .getByLabel("ملاحظات تواصل المبيعات مع العميل *:")
        .fill("ADMIN owner confirmed retained specifications");
      const command: { id: string | null } = { id: null };
      let writes = 0;
      admin.page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname.includes(selected.orderId)
        )
          writes++;
      });
      await admin.page.route(
        `**/sales-contact/orders/${selected.orderId}/pieces/*/issues/*/proposals`,
        async (route) => {
          const body = submitContactBodySchema.parse(
            route.request().postDataJSON() as unknown,
          );
          command.id = body.commandId;
          await dataFrom(await route.fetch(), approvalCommandDataSchema);
          await route.abort("failed");
        },
      );
      await modal
        .getByRole("button", { name: "إرسال المقترح للاعتماد" })
        .click();
      await expect(
        admin.page.getByText(
          "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
          { exact: true },
        ),
      ).toBeVisible();
      await admin.page
        .getByRole("link", { name: "العودة للطلب", exact: true })
        .click();
      await admin.page.evaluate(() => {
        document.documentElement.dataset["p04NavigationWitness"] =
          "same-document";
      });
      await admin.page
        .getByRole("combobox", { name: "الانتقال إلى قسم" })
        .selectOption("approval");
      // The dashboard is a five-issue preview, so use the existing full list.
      await admin.page
        .locator('a[href="/approval/pending?tab=problems"]')
        .first()
        .click();
      await admin.page
        .getByPlaceholder("ابحث برقم الطلب، العميل، أو الهاتف...")
        .fill(businessNumber);
      await admin.page
        .locator(`a[href="/approval/orders/${selected.orderId}"]`)
        .first()
        .click();
      await expect(admin.page.locator("html")).toHaveAttribute(
        "data-p04-navigation-witness",
        "same-document",
      );
      await expect(
        admin.page.getByText(
          "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
          { exact: true },
        ),
      ).toBeVisible();
      expect(
        (await current(admin, selected.orderId)).workflow.issues.find(
          (issue) => issue.id === selected.issueId,
        )?.allowedActions.canReviewContact,
      ).toBe(true);
      await expect(
        admin.page.getByRole("button", {
          name: "مراجعة تعديل العميل",
          exact: true,
        }),
      ).toBeDisabled();
      expect(writes).toBe(1);
      if (command.id === null)
        throw new Error("Missing original ADMIN command");
      const receipt = responseFor(
          admin.page,
          `/approval-commands/${command.id}`,
          "GET",
        ),
        wrapper = responseFor(
          admin.page,
          `/sales-contact/orders/${selected.orderId}`,
          "GET",
        );
      await admin.page
        .getByRole("button", { name: "التحقق من النتيجة" })
        .click();
      await dataFrom(await receipt, approvalCommandDataSchema);
      await dataFrom(await wrapper, approvalOrderDataSchema);
      await expect(
        admin.page.getByText("تم الحفظ وتحديث البيانات.", { exact: true }),
      ).toBeVisible();
      expect(writes).toBe(1);
      await admin.page.getByRole("button", { name: "تم", exact: true }).click();
      await expect(
        admin.page.getByRole("button", {
          name: "مراجعة تعديل العميل",
          exact: true,
        }),
      ).toBeEnabled();
      await reviewCurrentUi(admin, selected.orderId, "ACCEPT");
      expect(writes).toBe(2);
      expect(
        (await current(admin, selected.orderId)).order.pieces.find(
          (piece) => piece.id === selected.pieceId,
        ),
      ).toMatchObject({ stage: "PRODUCTION", workState: "INCOMING" });
    } finally {
      await admin.context.close();
    }
  });
}

if (mode === "synthetic")
  test("P04 US3 approval cancellation never applies an unaccepted size proposal", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      selected = scenario(fixture, "cancelAmendment"),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const factory = await signIn(
          browser,
          fixture.factory,
          page.viewportSize(),
        );
        try {
          const original = await current(approver, selected.orderId);
          await report(
            factory,
            selected.orderId,
            selected.pieceId,
            original.order.version,
          );
          await resolveUi(approver, selected.orderId, "SEND_TO_SALES");
          await submitContactUi(sales, selected.orderId, {
            notes: "Unaccepted size must not become a factory specification",
            sizeId: await halfSize(sales),
          });
          const held = await current(approver, selected.orderId);
          expect(
            held.workflow.issues.find(
              (issue) => issue.pieceId === selected.pieceId,
            )?.currentProposal?.proposed?.size,
          ).toBe("40.5");
          await goto(approver.page, `/approval/orders/${selected.orderId}`);
          await reviewCurrentUi(approver, selected.orderId, "CANCEL");
          const cancelled = (await current(approver, selected.orderId)).order;
          expect(
            cancelled.pieces.find((piece) => piece.id === selected.pieceId),
          ).toMatchObject({ size: "40", stage: "CANCELLED" });
          expect(
            cancelled.pieces.find((piece) => piece.id !== selected.pieceId),
          ).toEqual(
            original.order.pieces.find(
              (piece) => piece.id !== selected.pieceId,
            ),
          );
        } finally {
          await factory.context.close();
        }
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });

if (mode === "synthetic")
  test("P04 US4 retained cancellations preserve paid surplus and zero-active progress", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      selected = scenario(fixture, "money"),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const factory = await signIn(
          browser,
          fixture.factory,
          page.viewportSize(),
        );
        try {
          const before = (await current(approver, selected.orderId)).order,
            piece = before.pieces.find(
              (piece) => piece.unitPrice === "1500.00",
            ),
            companion = before.pieces.find(
              (piece) => piece.unitPrice === "1800.00",
            );
          if (!piece || !companion)
            throw new Error("Missing exact frozen money scenario");
          expect(before.money).toEqual({
            total: "3300.00",
            paidAmount: "2000.00",
            remainingDue: "1300.00",
            surplus: "0.00",
          });
          const reported = await report(
            factory,
            selected.orderId,
            piece.id,
            before.version,
          );
          if (reported.outcome.issueId === null)
            throw new Error("Missing money issue");
          const cancelled = await resolveUi(
              approver,
              selected.orderId,
              "CANCEL",
            ),
            partial = (await current(approver, selected.orderId)).order;
          expect(partial.counts).toMatchObject({
            original: 2,
            cancelled: 1,
            active: 1,
            received: 0,
            completionPercent: 0,
          });
          expect(partial.money).toEqual({
            total: "1800.00",
            paidAmount: "2000.00",
            remainingDue: "0.00",
            surplus: "200.00",
          });
          expect(
            partial.pieces.find((item) => item.id === piece.id),
          ).toMatchObject({
            stage: "CANCELLED",
            unitPrice: "1500.00",
            cancellationReason: "P04 confirmed retained cancellation",
          });
          expect(
            partial.pieces.find((item) => item.id === companion.id),
          ).toEqual(companion);
          const replay = await dataFrom(
            await post(
              approver,
              `/approvals/orders/${selected.orderId}/pieces/${piece.id}/issues/${reported.outcome.issueId}/resolve`,
              cancelled.body,
            ),
            approvalCommandDataSchema,
          );
          expect(replay.replayed).toBe(true);
          expect(
            (await current(approver, selected.orderId)).order.money,
          ).toEqual(partial.money);
          const safe = await factory.page.request.get(
            api(`/manufacturing-orders/${selected.orderId}`),
            { headers: factory.headers },
          );
          expect(safe.ok()).toBe(true);
          assertFactoryPrivacy(
            successEnvelopeSchema.parse((await safe.json()) as unknown).data,
          );
          await goto(sales.page, `/sales/orders/${selected.orderId}`);
          await sales.page
            .getByRole("button", { name: /الورقة الرسمية/u })
            .click();
          const paper = sales.page.locator(".order-paper");
          await expect(paper.getByLabel("الإجمالي المعتمد")).toHaveText(
            "1800.00",
          );
          await expect(paper.getByLabel("المدفوع المعتمد")).toHaveText(
            "2000.00",
          );
          await expect(paper.getByLabel("الباقي المعتمد")).toHaveText("0.00");
          await expect(paper.getByLabel("رصيد العميل الزائد")).toHaveText(
            "200.00",
          );
          await expect(
            paper.locator(
              ".paper-main-table > tbody > tr:not(.paper-blank-row)",
            ),
          ).toHaveCount(2);
          await report(
            factory,
            selected.orderId,
            companion.id,
            partial.version,
          );
          await resolveUi(approver, selected.orderId, "CANCEL");
          const all = (await current(approver, selected.orderId)).order;
          expect(all.status).toBe("CANCELLED");
          expect(all.counts).toEqual({
            original: 2,
            cancelled: 2,
            active: 0,
            received: 0,
            completionPercent: 0,
          });
          expect(all.money).toEqual({
            total: "0.00",
            paidAmount: "2000.00",
            remainingDue: "0.00",
            surplus: "2000.00",
          });
          expect(all.pieces.map((piece) => piece.id)).toEqual(
            before.pieces.map((piece) => piece.id),
          );
          await sales.page.reload();
          await expect(
            sales.page.getByText("0%", { exact: true }),
          ).toBeVisible();
          await expect(
            sales.page.getByText("جاهز ومكتمل بالمستودع", { exact: true }),
          ).toHaveCount(0);
          expect((await salesOrder(sales, selected.orderId)).money).toEqual(
            all.money,
          );
          await sales.page
            .getByRole("button", { name: /الورقة الرسمية/u })
            .click();
          await expect(
            sales.page.locator(
              ".paper-main-table > tbody > tr:not(.paper-blank-row)",
            ),
          ).toHaveCount(2);
          await expect(sales.page.getByLabel("المدفوع المعتمد")).toHaveText(
            "2000.00",
          );
        } finally {
          await factory.context.close();
        }
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });

const aliases = (orderId: string) =>
  [`/orders/${orderId}/print`, `/print/order/${orderId}`] as const;
const heldAliases = async (session: Session, orderId: string) => {
  for (const alias of aliases(orderId)) {
    await goto(session.page, alias);
    await expect(
      session.page.getByText(
        "الطباعة الرسمية متوقفة حتى حسم جميع تعديلات القطع المرسلة لإعادة الاعتماد.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      session.page.locator('[data-official-paper="true"]'),
    ).toHaveCount(0);
  }
};
const openOfficial = async (
  session: Session,
  orderId: string,
  path: ReturnType<typeof aliases>[number] = aliases(orderId)[0],
) => {
  const pending = responseFor(session.page, `/order-paper/${orderId}`, "GET");
  await goto(session.page, path);
  const dto = await dataFrom(await pending, officialOrderPaperDataSchema);
  expect(dto.order.id).toBe(orderId);
  await expect(
    session.page.locator('[data-official-paper="true"]'),
  ).toHaveAttribute("data-print-version", String(dto.printVersion));
  await session.page.evaluate(async () => {
    await document.fonts.ready;
  });
  return dto;
};
const returnAndResubmit = async (
  approver: Session,
  sales: Session,
  orderId: string,
) => {
  await goto(approver.page, `/approval/orders/${orderId}`);
  await approver.page
    .getByRole("button", { name: "إعادة للمبيعات مع سبب" })
    .click();
  await approver.page
    .getByLabel("سبب الإعادة الإلزامي *")
    .fill("P04 print journey confirms the exact size");
  await approver.page
    .getByLabel("تفاصيل وملاحظات إضافية للمبيعات (اختياري):")
    .fill("Preserve captured signature and frozen pricing");
  const returned = responseFor(
    approver.page,
    `/approvals/orders/${orderId}/return`,
  );
  await approver.page
    .getByRole("button", { name: "تأكيد الإعادة للمبيعات" })
    .click();
  await dataFrom(await returned, approvalCommandDataSchema);
  await expect(approver.page).toHaveURL(/\/approval\/pending$/u);
  for (const alias of aliases(orderId)) {
    const printPage = await sales.context.newPage();
    try {
      await goto(printPage, alias);
      await expect(
        printPage.getByText(
          "لا يمكن طباعة طلب معاد للمبيعات حتى حسم اعتماده.",
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      await expect(
        printPage.locator('[data-official-paper="true"]'),
      ).toHaveCount(0);
    } finally {
      await printPage.close();
    }
  }
  await goto(sales.page, `/sales/orders/new?edit=${orderId}`);
  await choose(sales.page, "المقاس", "المقاس", "40.5");
  const pending = responseFor(sales.page, `/sales-orders/${orderId}/resubmit`);
  await sales.page
    .getByRole("button", { name: "إعادة الإرسال للاعتماد", exact: true })
    .click();
  const saved = (await dataFrom(await pending, salesOrderCommandDataSchema))
    .savedOrder;
  await expect(sales.page).toHaveURL(
    new RegExp(`/sales/orders/${saved.id}$`, "u"),
  );
  return saved;
};
const nativePrintWitness = async (page: Page) =>
  page.evaluate(() => {
    document.documentElement.dataset["p04PrintEvents"] = "0";
    window.addEventListener("beforeprint", () => {
      document.documentElement.dataset["p04PrintEvents"] = String(
        Number(document.documentElement.dataset["p04PrintEvents"]) + 1,
      );
    });
  });
const exportPaper = async (
  session: Session,
  orderId: string,
  output: { path: string; expectedRows: number; expectedPages: number },
) => {
  const { path, expectedRows, expectedPages } = output;
  const dto = await openOfficial(session, orderId);
  await expect(session.page.locator(".order-paper")).toHaveCount(expectedPages);
  await expect(
    session.page.locator(
      ".paper-main-table > tbody > tr:not(.paper-blank-row)",
    ),
  ).toHaveCount(expectedRows);
  await expect(session.page.locator(".paper-approval-annotation")).toHaveCount(
    expectedPages,
  );
  for (const annotation of await session.page
    .locator(".paper-approval-annotation")
    .all())
    await expect(annotation).toContainText(dto.approval.initial.actor.fullName);
  await expect(session.page.locator(".paper-signature i")).toHaveText(
    Array.from(
      { length: expectedPages },
      () => dto.order.responsibleSignature ?? "",
    ),
  );
  const bytes = await session.page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  const { stdout } = await promisify(execFile)("pdfinfo", [path]);
  const physicalPages = /^Pages:\s+(\d+)$/mu.exec(stdout)?.[1];
  expect(
    physicalPages,
    "Physical PDF page count must match eight-row sheet pagination",
  ).toBe(String(expectedPages));
  return {
    file: path,
    expectedRows,
    expectedPages,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};
if (mode === "synthetic") {
  test("P04 US5 both aliases enforce current roles and initial approval with genuine metadata", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const original = await submitOrder(sales);
        for (const alias of aliases(original.id)) {
          const printPage = await sales.context.newPage();
          try {
            await goto(printPage, alias);
            await expect(
              printPage.getByText(
                "لا يمكن طباعة أمر التفصيل قبل اعتماد رسمي محفوظ.",
                { exact: true },
              ),
            ).toBeVisible();
            await expect(
              printPage.locator('[data-official-paper="true"]'),
            ).toHaveCount(0);
          } finally {
            await printPage.close();
          }
        }
        const corrected = await returnAndResubmit(approver, sales, original.id);
        expect(retainedTerms(corrected)).toEqual(retainedTerms(original));
        await approve(approver, original.id);
        for (const identity of [
          fixture.sales,
          fixture.approver,
          readE2eRuntime().admin,
          fixture.otherSales,
          fixture.factory,
        ]) {
          const session = await signIn(browser, identity, page.viewportSize());
          try {
            for (const alias of aliases(original.id)) {
              const printSession = {
                ...session,
                page: await session.context.newPage(),
              };
              try {
                if (
                  identity.id === fixture.otherSales.id ||
                  identity.id === fixture.factory.id
                ) {
                  await goto(printSession.page, alias);
                  await expect(
                    printSession.page.getByRole("heading", {
                      name:
                        identity.id === fixture.factory.id
                          ? "طباعة الاستمارة غير مصرحة لهذا الحساب"
                          : "أمر التفصيل غير متاح للطباعة",
                      exact: true,
                    }),
                  ).toBeVisible();
                  await expect(
                    printSession.page.locator('[data-official-paper="true"]'),
                  ).toHaveCount(0);
                  const denied = await printSession.page.request.get(
                    api(`/order-paper/${original.id}`),
                    { headers: session.headers },
                  );
                  expect(denied.status()).toBe(
                    identity.id === fixture.factory.id ? 403 : 404,
                  );
                } else {
                  const official = await openOfficial(
                    printSession,
                    original.id,
                    alias,
                  );
                  expect(official.approval.initial.actor.id).toBe(
                    fixture.approver.id,
                  );
                  await expect(
                    printSession.page.locator(".paper-signature i"),
                  ).toHaveText("P04 captured responsible signature");
                  await expect(
                    printSession.page.getByRole("region", {
                      name: "سجل الاعتماد الرسمي",
                    }),
                  ).toContainText("A".repeat(150));
                  await expect(
                    printSession.page.locator(".paper-approval-annotation"),
                  ).toContainText("A".repeat(150));
                  await expect(
                    printSession.page.getByLabel("الإجمالي المعتمد"),
                  ).toHaveText(original.money.total);
                }
              } finally {
                await printSession.page.close();
              }
            }
            if (identity.id === fixture.factory.id) {
              const safe = await dataFrom(
                await session.page.request.get(
                  api(`/manufacturing-orders/${original.id}`),
                  { headers: session.headers },
                ),
                factoryOrderPaperDataSchema,
              );
              assertFactoryPrivacy(safe);
            }
            await goto(session.page, "/reports/print");
            if (identity.id === readE2eRuntime().admin.id)
              await expect(
                session.page.locator(".print-report-container"),
              ).toBeVisible();
            else await expect(session.page).toHaveURL(/\/unauthorized$/u);
          } finally {
            await session.context.close();
          }
        }
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });
  test("P04 US5 exports 1 8 9 17 rows with full approval name and retained cancelled empty paper", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const directory = await mkdtemp(
        join(tmpdir(), `p04-paper-${info.project.name}-`),
      );
      await chmod(directory, 0o700);
      const exports = [];
      for (const count of [1, 8, 9, 17]) {
        const selected = scenario(fixture, `print${String(count)}`);
        exports.push(
          await exportPaper(sales, selected.orderId, {
            path: join(directory, `rows-${String(count)}.pdf`),
            expectedRows: count,
            expectedPages: Math.ceil(count / 8),
          }),
        );
      }
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const factory = await signIn(
          browser,
          fixture.factory,
          page.viewportSize(),
        );
        try {
          const selected = scenario(fixture, "printCancelled"),
            original = (await current(approver, selected.orderId)).order;
          for (const [index, piece] of original.pieces.entries()) {
            const fresh = await current(approver, selected.orderId);
            await report(
              factory,
              selected.orderId,
              piece.id,
              fresh.order.version,
            );
            await resolveUi(approver, selected.orderId, "CANCEL");
            const rows = original.pieces.length - index - 1;
            exports.push(
              await exportPaper(sales, selected.orderId, {
                path: join(directory, `cancelled-active-${String(rows)}.pdf`),
                expectedRows: rows,
                expectedPages: 1,
              }),
            );
          }
        } finally {
          await factory.context.close();
        }
      } finally {
        await approver.context.close();
      }
      await writeFile(
        join(directory, "manifest.json"),
        JSON.stringify({ project: info.project.name, exports }),
        { flag: "wx", mode: 0o600 },
      );
      console.info("P04 physical PDF inspection directory", directory);
    } finally {
      await sales.context.close();
    }
  });
  test("P04 US5 native valid print and fresh preflight enforce every pending piece review", async ({
    browser,
    page,
  }, info) => {
    const fixture = fixtures(info.project.name),
      selected = scenario(fixture, "printHold"),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const factory = await signIn(
          browser,
          fixture.factory,
          page.viewportSize(),
        );
        try {
          const original = await openOfficial(sales, selected.orderId);
          let reads = 0;
          sales.page.on("request", (request) => {
            if (
              request.method() === "GET" &&
              new URL(request.url()).pathname ===
                `/api/v1/order-paper/${selected.orderId}`
            )
              reads++;
          });
          await nativePrintWitness(sales.page);
          await sales.page.evaluate(() => {
            window.print();
          });
          await expect(sales.page.locator("html")).toHaveAttribute(
            "data-p04-print-events",
            "1",
          );
          expect(reads).toBe(0);
          // Chromium throttles a second asynchronous scripted print in the same
          // document. Exercise the button's first native print in a fresh one.
          await openOfficial(sales, selected.orderId);
          reads = 0;
          await nativePrintWitness(sales.page);
          const preflight = responseFor(
            sales.page,
            `/order-paper/${selected.orderId}`,
            "GET",
          );
          await sales.page
            .getByRole("button", { name: "طباعة المستند بالعرض (Ctrl + P)" })
            .click();
          await dataFrom(await preflight, officialOrderPaperDataSchema);
          await expect(sales.page.locator("html")).toHaveAttribute(
            "data-p04-print-events",
            "1",
          );
          expect(reads).toBe(1);
          const catalog = await catalogFor(sales),
            proposedSize = catalog.entries.find(
              (entry) => entry.kind === "size" && entry.displayValue === "40.5",
            );
          if (!proposedSize) throw new Error("Missing changed print size");
          for (const piece of original.order.pieces) {
            const before = await current(approver, selected.orderId),
              reported = await report(
                factory,
                selected.orderId,
                piece.id,
                before.order.version,
              );
            if (reported.outcome.issueId === null)
              throw new Error("Missing print issue");
            const referred = await dataFrom(
              await post(
                approver,
                `/approvals/orders/${selected.orderId}/pieces/${piece.id}/issues/${reported.outcome.issueId}/resolve`,
                {
                  commandId: crypto.randomUUID(),
                  expectedVersion: reported.receipt.afterVersion,
                  decision: "SEND_TO_SALES",
                  target: "PRODUCTION",
                  notes: "Confirm print hold without stopping other work",
                },
              ),
              approvalCommandDataSchema,
            );
            await dataFrom(
              await post(
                sales,
                `/sales-contact/orders/${selected.orderId}/pieces/${piece.id}/issues/${reported.outcome.issueId}/proposals`,
                {
                  commandId: crypto.randomUUID(),
                  expectedVersion: referred.receipt.afterVersion,
                  kind: "AMEND",
                  changes: { size: proposedSize.id },
                  contactNotes: "Print hold pending actual approval",
                },
              ),
              approvalCommandDataSchema,
            );
          }
          const denied = responseFor(
            sales.page,
            `/order-paper/${selected.orderId}`,
            "GET",
          );
          await sales.page
            .getByRole("button", { name: "طباعة المستند بالعرض (Ctrl + P)" })
            .click();
          expect((await denied).status()).toBe(409);
          await expect(
            sales.page.locator('[data-official-paper="true"]'),
          ).toHaveCount(0);
          await expect(sales.page.locator("html")).toHaveAttribute(
            "data-p04-print-events",
            "1",
          );
          await sales.page.evaluate(() => {
            window.print();
          });
          await expect(
            sales.page.locator('[data-official-paper="true"]'),
          ).toHaveCount(0);
          for (const alias of aliases(selected.orderId)) {
            await goto(sales.page, alias);
            await expect(
              sales.page.getByText(
                "الطباعة الرسمية متوقفة حتى حسم جميع تعديلات القطع المرسلة لإعادة الاعتماد.",
                { exact: true },
              ),
            ).toBeVisible();
            await expect(
              sales.page.locator('[data-official-paper="true"]'),
            ).toHaveCount(0);
          }
          await heldAliases(approver, selected.orderId);
          const administrator = await signIn(
            browser,
            readE2eRuntime().admin,
            page.viewportSize(),
          );
          try {
            await heldAliases(administrator, selected.orderId);
          } finally {
            await administrator.context.close();
          }
          await goto(approver.page, `/approval/orders/${selected.orderId}`);
          const first = await reviewCurrentUi(
            approver,
            selected.orderId,
            "ACCEPT",
          );
          const partial = await current(approver, selected.orderId),
            continuing = partial.order.pieces.find(
              (piece) => piece.id === first.outcome.pieceId,
            );
          expect(continuing).toMatchObject({
            stage: "PRODUCTION",
            workState: "INCOMING",
          });
          await printHeld(sales, selected.orderId);
          await heldAliases(sales, selected.orderId);
          await goto(approver.page, `/approval/orders/${selected.orderId}`);
          await reviewCurrentUi(approver, selected.orderId, "RETURN_TO_SALES");
          await printHeld(sales, selected.orderId);
          await heldAliases(sales, selected.orderId);
          const returned = await current(approver, selected.orderId),
            remaining = returned.workflow.issues[0];
          if (!remaining) throw new Error("Missing held companion issue");
          await dataFrom(
            await post(
              sales,
              `/sales-contact/orders/${selected.orderId}/pieces/${remaining.pieceId}/issues/${remaining.id}/proposals`,
              {
                commandId: crypto.randomUUID(),
                expectedVersion: returned.order.version,
                kind: "AMEND",
                changes: { size: proposedSize.id },
                contactNotes: "Renewed contact keeps the print hold",
              },
            ),
            approvalCommandDataSchema,
          );
          await goto(approver.page, `/approval/orders/${selected.orderId}`);
          await reviewCurrentUi(approver, selected.orderId, "ACCEPT");
          const complete = await current(approver, selected.orderId);
          expect(
            complete.order.pieces.find(
              (piece) => piece.id === first.outcome.pieceId,
            ),
          ).toEqual(continuing);
          expect(complete.order.money).toEqual(original.order.money);
          for (const alias of aliases(selected.orderId)) {
            const final = await openOfficial(sales, selected.orderId, alias);
            expect(final.approval.pieces).toHaveLength(2);
            await expect(
              sales.page
                .getByRole("region", { name: "سجل الاعتماد الرسمي" })
                .getByRole("listitem"),
            ).toHaveCount(2);
            await expect(sales.page.locator(".order-paper li")).toHaveCount(0);
          }
        } finally {
          await factory.context.close();
        }
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });
}
if (mode === "reviewed-workbook")
  test("P04 reviewed workbook approval reapproval and official paper", async ({
    browser,
    page,
  }, info) => {
    const runtime = readE2eRuntime();
    expect(runtime.catalogEvidence).toEqual({
      kind: "reviewed-workbook",
      sourceSha256:
        "88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b",
    });
    const fixture = fixtures(info.project.name),
      sales = await signIn(browser, fixture.sales, page.viewportSize());
    try {
      const approver = await signIn(
        browser,
        fixture.approver,
        page.viewportSize(),
      );
      try {
        const factory = await signIn(
          browser,
          fixture.factory,
          page.viewportSize(),
        );
        try {
          const original = await submitOrder(sales),
            corrected = await returnAndResubmit(approver, sales, original.id);
          expect(retainedTerms(corrected)).toEqual(retainedTerms(original));
          await approve(approver, original.id);
          const approved = await current(approver, original.id),
            piece = approved.order.pieces[0];
          if (!piece) throw new Error("Missing reviewed order piece");
          await report(factory, original.id, piece.id, approved.order.version);
          await resolveUi(approver, original.id, "SEND_TO_SALES");
          const catalog = await catalogFor(sales),
            size = catalog.entries.find(
              (entry) => entry.kind === "size" && entry.displayValue === "41",
            );
          if (!size) throw new Error("Missing actual workbook size");
          await submitContactUi(sales, original.id, {
            notes: "Actual workbook-backed size proposal",
            sizeId: size.id,
          });
          await printHeld(sales, original.id);
          await goto(approver.page, `/approval/orders/${original.id}`);
          await reviewCurrentUi(approver, original.id, "ACCEPT");
          for (const alias of aliases(original.id)) {
            const paper = await openOfficial(sales, original.id, alias);
            expect(paper.order.pieces[0]).toMatchObject({
              id: piece.id,
              size: "41",
              unitPrice: piece.unitPrice,
              decoration: piece.decoration,
              stage: "PRODUCTION",
              workState: "INCOMING",
            });
            expect(paper.order.money).toEqual(original.money);
            expect(paper.approval.pieces).toHaveLength(1);
            await expect(sales.page.locator(".paper-signature i")).toHaveText(
              "P04 captured responsible signature",
            );
          }
        } finally {
          await factory.context.close();
        }
      } finally {
        await approver.context.close();
      }
    } finally {
      await sales.context.close();
    }
  });
