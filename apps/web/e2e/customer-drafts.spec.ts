import {
  expect,
  test,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import type { z } from "zod";
import {
  catalogDataSchema,
  catalogQuoteDataSchema,
  salesOrderEditorDataSchema,
  salesOrderListDataSchema,
  salesOrderDataSchema,
  salesOrderCommandDataSchema,
  salesOrderActivityDataSchema,
  salesOrderRevisionDataSchema,
  customerOrdersDataSchema,
  customerOrderMeasurementsDataSchema,
  submitOrderBodySchema,
  resubmitOrderBodySchema,
  type DraftCapture,
  type DraftCommandData,
  customerDataSchema,
  customerDraftsDataSchema,
  customerMeasurementsDataSchema,
  draftListDataSchema,
  draftChangesDataSchema,
  salesCommandDataSchema,
  customerCommandDataSchema,
  draftCommandDataSchema,
  draftDataSchema,
  createDraftBodySchema,
  saveDraftBodySchema,
  customerListDataSchema,
  errorEnvelopeSchema,
  successEnvelopeSchema,
} from "@template/contracts";
import { readE2eRuntime, waitForCapturedAction } from "./runtime";

test.use({ actionTimeout: 15_000 });

const PASSWORD = "P02!SyntheticSales#2026";
type SalesBrowser = Readonly<{
  context: BrowserContext;
  page: Page;
  email: string;
  password: string;
}>;
const dataFrom = async <T>(
  response: Response | APIResponse,
  schema: z.ZodType<T>,
): Promise<T> => {
  expect(response.ok()).toBe(true);
  const raw: unknown = await response.json();
  return schema.parse(successEnvelopeSchema.parse(raw).data);
};
const signInP02 = async (
  page: Page,
  email: string,
  password: string,
): Promise<void> => {
  await page.goto(`${readE2eRuntime().webOrigin}/auth/login`);
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
};
const createSalesBrowser = async (
  browser: Browser,
  adminPage: Page,
  label: string,
): Promise<SalesBrowser> => {
  const context = await browser.newContext({
    viewport: adminPage.viewportSize(),
  });
  try {
    const page = await context.newPage(),
      email = `${label.toLowerCase()}.${crypto.randomUUID().slice(0, 8)}@p02-e2e.test`,
      runtime = readE2eRuntime();
    await page.goto(`${runtime.webOrigin}/auth/register`);
    await page.getByLabel("الاسم الكامل").fill(`P02 ${label}`);
    await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
    await page.getByLabel(/^كلمة المرور/u).fill(PASSWORD);
    await page.getByRole("button", { name: "طلب تسجيل الحساب" }).click();
    await expect(
      page.getByRole("heading", { name: "تحقق من بريدك الإلكتروني" }),
    ).toBeVisible();
    await page.goto(await waitForCapturedAction(email, "verification"));
    await expect(
      page.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
    ).toBeVisible();
    await adminPage.goto(`${runtime.webOrigin}/admin/users`);
    await adminPage
      .getByPlaceholder("ابحث بالاسم، البريد أو رقم الهاتف...")
      .fill(email);
    const row = adminPage.getByRole("row").filter({ hasText: email });
    await row.locator("[data-staff-row-action]").click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.locator("[data-staff-department]").selectOption("SALES");
    await dialog.getByRole("button", { name: "اعتماد وتعيين القسم" }).click();
    await expect(dialog).toBeHidden();
    await signInP02(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/sales\/dashboard$/u);
    return { context, page, email, password: PASSWORD };
  } catch (error: unknown) {
    await context.close();
    throw error;
  }
};
const goto = async (page: Page, path: string) => {
  await page.goto(`${readE2eRuntime().webOrigin}${path}`);
};
const responseFor = (page: Page, path: string, method: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1${path}` &&
      response.request().method() === method,
  );
const createCustomer = async (
  page: Page,
  name: string,
  phone: string,
  email?: string,
) => {
  await goto(page, `/sales/customers/${encodeURIComponent("+966599000001")}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "العميل غير موجود" }),
  ).toBeVisible();
  await goto(page, "/sales/customers/new");
  await page.getByLabel(/اسم العميل/u).fill(name);
  await page.getByLabel(/رقم الهاتف/u).fill(phone);
  if (email !== undefined)
    await page.getByLabel(/البريد الإلكتروني/u).fill(email);
  const pending = responseFor(page, "/customers", "POST");
  await page.getByRole("button", { name: "حفظ بيانات العميل" }).click();
  const saved = await dataFrom(await pending, customerCommandDataSchema);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return saved.savedCustomer;
};

test("P02-C1 shared customers, equivalent phones and stable identity", async ({
  browser,
  page,
}, testInfo) => {
  const runtime = readE2eRuntime();
  await signInP02(page, runtime.admin.email, runtime.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/u);
  const a = await createSalesBrowser(
    browser,
    page,
    `c1-a-${testInfo.project.name}`,
  );
  try {
    const b = await createSalesBrowser(
      browser,
      page,
      `c1-b-${testInfo.project.name}`,
    );
    try {
      const narrow = testInfo.project.name === "narrow",
        phone = narrow ? "0501000002" : "0501000001",
        changed = narrow ? "0501100002" : "0501100001",
        secondPhone = narrow ? "0501200002" : "0501200001",
        email = `reuse.${testInfo.project.name}@p02-e2e.test`;
      await goto(
        a.page,
        `/sales/customers/${encodeURIComponent("+966599000001")}`,
      );
      await expect(
        a.page.getByRole("alert").filter({ hasText: "العميل غير موجود" }),
      ).toBeVisible();
      const c = await createCustomer(
        a.page,
        `P02 shared contact ${testInfo.project.name}`,
        phone,
      );
      expect(c).toMatchObject({ email: null, address: null, notes: null });
      await expect(a.page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(a.page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(a.page.getByRole("heading", { name: c.name })).toHaveCSS(
        "font-family",
        /Cairo/iu,
      );
      await goto(b.page, "/sales/customers");
      const search = b.page.getByPlaceholder(
        "ابحث باسم العميل أو رقم الهاتف أو البريد...",
      );
      await search.fill(c.name);
      await expect(
        b.page.getByRole("row").filter({ hasText: c.name }),
      ).toBeVisible();
      await search.fill(phone);
      await expect(
        b.page.getByRole("row").filter({ hasText: c.phone }),
      ).toBeVisible();
      await goto(b.page, "/sales/customers/new");
      await b.page.getByLabel(/اسم العميل/u).fill("Duplicate remains unsaved");
      await b.page.getByLabel(/رقم الهاتف/u).fill(`00966${phone.slice(1)}`);
      const duplicate = responseFor(b.page, "/customers", "POST");
      await b.page.getByRole("button", { name: "حفظ بيانات العميل" }).click();
      const rejected = await duplicate;
      expect(rejected.status()).toBe(409);
      const raw: unknown = await rejected.json();
      expect(errorEnvelopeSchema.parse(raw).code).toBe(
        "CUSTOMER_PHONE_CONFLICT",
      );
      await expect(b.page.getByLabel(/اسم العميل/u)).toHaveValue(
        "Duplicate remains unsaved",
      );
      await goto(
        a.page,
        `/sales/customers/${encodeURIComponent(c.phone)}/edit`,
      );
      await a.page.getByLabel(/البريد الإلكتروني/u).fill(email.toUpperCase());
      await a.page.getByLabel(/رقم الهاتف/u).fill(changed);
      const patch = responseFor(a.page, `/customers/${c.id}`, "PATCH");
      await a.page.getByRole("button", { name: "حفظ التعديلات" }).click();
      const updated = await dataFrom(await patch, customerCommandDataSchema);
      expect(updated.savedCustomer.id).toBe(c.id);
      expect(updated.savedCustomer.email).toBe(email);
      await expect(a.page).toHaveURL(
        new RegExp(
          `/sales/customers/${encodeURIComponent(updated.savedCustomer.phone)}$`,
          "u",
        ),
      );
      await goto(b.page, "/sales/customers");
      await search.fill(email.toUpperCase());
      await expect(
        b.page
          .getByRole("row")
          .filter({ hasText: updated.savedCustomer.phone }),
      ).toBeVisible();
      const c2 = await createCustomer(
        b.page,
        "P02 reused email",
        secondPhone,
        email,
      );
      expect(c2.id).not.toBe(c.id);
      expect(c2.email).toBe(email);
      await goto(b.page, "/sales/customers");
      const list = b.page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/v1/customers" &&
          new URL(response.url()).searchParams.get("search") ===
            email.toUpperCase(),
      );
      await search.fill(email.toUpperCase());
      const found = await dataFrom(await list, customerListDataSchema);
      expect(new Set(found.customers.map((row) => row.customer.id))).toEqual(
        new Set([c.id, c2.id]),
      );
      expect(found.pagination.total).toBe(2);
      await goto(
        b.page,
        `/sales/customers/${encodeURIComponent("+966599000001")}`,
      );
      await expect(
        b.page.getByRole("alert").filter({ hasText: "العميل غير موجود" }),
      ).toBeVisible();
      await expect(b.page.getByRole("heading", { name: c.name })).toHaveCount(
        0,
      );
    } finally {
      await b.context.close();
    }
  } finally {
    await a.context.close();
  }
});

const savePaper = async (page: Page, id?: string) => {
  const pending = responseFor(
    page,
    id === undefined ? "/sales-drafts" : `/sales-drafts/${id}`,
    id === undefined ? "POST" : "PUT",
  );
  await page
    .getByRole("button", { name: "حفظ كمسودة", exact: true })
    .first()
    .click();
  const response = await pending,
    saved = await dataFrom(response, draftCommandDataSchema);
  const raw: unknown = response.request().postDataJSON(),
    body =
      id === undefined
        ? createDraftBodySchema.parse(raw)
        : saveDraftBodySchema.parse(raw);
  if (id === undefined) {
    await expect(page).toHaveURL(
      new RegExp(`edit=${saved.savedDraft.id}$`, "u"),
    );
    await expect(
      page.getByLabel("الملاحظات العامة", { exact: true }),
    ).toHaveValue(saved.savedDraft.generalNotes ?? "");
  } else {
    await expect(
      page.getByText(
        "تم حفظ المسودة بنجاح؛ التغييرات اللاحقة تحتاج إلى حفظ جديد.",
      ),
    ).toBeVisible();
  }
  return {
    draft: saved.savedDraft,
    capture: body.draft,
    commandId: saved.receipt.commandId,
  };
};
const signOut = async (page: Page) => {
  const menu = page.getByRole("button", {
    name: "فتح القائمة الجانبية",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/u);
};
const sessionHeaders = async (page: Page) => {
  const pending = page.waitForRequest(
    async (request) =>
      new URL(request.url()).pathname === "/api/v1/users/me" &&
      (await request.headerValue("authorization")) !== null,
    { timeout: 20_000 },
  );
  await page.reload();
  const authorization = await (await pending).headerValue("authorization");
  const csrf = (await page.context().cookies(readE2eRuntime().apiOrigin)).find(
    (cookie) => cookie.name === "csrfToken",
  );
  if (authorization === null || csrf === undefined)
    throw new Error("Owned browser credential observation failed");
  return { authorization, "x-csrf-token": csrf.value };
};
const customCell = async (
  page: Page,
  label: RegExp,
  column: string,
  value: string,
  index = 0,
) => {
  const trigger = page.getByRole("combobox", { name: label }).nth(index);
  await trigger.click();
  const search = page.getByPlaceholder(`ابحث في ${column}...`);
  await expect(search).toBeFocused();
  await search.fill(value);
  const exactOption = page.getByRole("option", { name: value, exact: true });
  if ((await exactOption.count()) === 1) {
    await exactOption.click();
    await expect(trigger).toBeFocused();
    return;
  }
  await expect(page.locator('.paper-cell-menu [role="option"]')).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `استخدام القيمة المكتوبة: "${value}"`,
      exact: true,
    })
    .click();
  await expect(trigger).toBeFocused();
};

test("P02-C2 blank draft survives actual sign-out and relogin", async ({
  browser,
  page,
}, info) => {
  const runtime = readE2eRuntime();
  await signInP02(page, runtime.admin.email, runtime.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/u);
  const sales = await createSalesBrowser(
    browser,
    page,
    `c2-blank-${info.project.name}`,
  );
  try {
    await goto(sales.page, "/sales/orders/new");
    await expect(
      sales.page.getByRole("button", { name: "إرسال للاعتماد" }),
    ).toBeDisabled();
    const saved = await savePaper(sales.page);
    expect(saved.draft).toMatchObject({
      type: "SHOP",
      customer: null,
      deliveryDate: null,
      paidAmount: null,
      generalNotes: null,
      responsibleSignature: null,
      pieces: [{ quantity: 1, model: null, size: null }],
    });
    await signOut(sales.page);
    await signInP02(sales.page, sales.email, sales.password);
    await expect(sales.page).toHaveURL(/\/sales\/dashboard$/u);
    const read = responseFor(
      sales.page,
      `/sales-order-editor/${saved.draft.id}`,
      "GET",
    );
    await goto(sales.page, `/sales/orders/new?edit=${saved.draft.id}`);
    const editor = await dataFrom(await read, salesOrderEditorDataSchema);
    expect(editor.kind).toBe("draft");
    if (editor.kind !== "draft") throw new Error("Expected persisted draft");
    expect(editor.draft).toEqual(saved.draft);
    await expect(
      sales.page.getByRole("button", { name: "حذف آخر قطعة", exact: true }),
    ).toBeDisabled();
    await expect(sales.page.getByLabel("الإجمالي غير متاح")).toHaveText("—");
    await expect(sales.page.getByLabel("الباقي غير متاح")).toHaveText("—");
    await goto(sales.page, `/sales/orders/${saved.draft.id}`);
    await expect(
      sales.page.getByRole("button", { name: "معاينة الطباعة" }),
    ).toBeDisabled();
    await expect(sales.page.getByText(/لا يوجد مسار تصنيع/u)).toBeVisible();
    await goto(
      sales.page,
      `/sales/orders?status=${encodeURIComponent("في المستودع")}`,
    );
    await expect(
      sales.page.getByRole("alert").filter({ hasText: "هذه الحالة غير متاحة" }),
    ).toBeVisible();
    const menu = sales.page.getByRole("button", {
      name: "فتح القائمة الجانبية",
      exact: true,
    });
    if (await menu.isVisible()) await menu.click();
    const orders = responseFor(sales.page, "/sales-orders", "GET").then(
      (response) => dataFrom(response, salesOrderListDataSchema),
    );
    await sales.page
      .getByRole("link", { name: "جميع طلبات المبيعات", exact: true })
      .click();
    await expect(sales.page).toHaveURL(/\/sales\/orders$/u);
    expect(
      (await orders).items.some(
        (row) => row.kind === "draft" && row.draft.id === saved.draft.id,
      ),
    ).toBe(true);
    await expect(
      sales.page.locator(`a[href="/sales/orders/new?edit=${saved.draft.id}"]`),
    ).toBeVisible();
    await expect(
      sales.page.getByRole("alert").filter({ hasText: "هذه الحالة غير متاحة" }),
    ).toHaveCount(0);
  } finally {
    await sales.context.close();
  }
});

test("P02-C2 inline captures and copied physical pieces persist without implicit saves", async ({
  browser,
  page,
}, info) => {
  const runtime = readE2eRuntime();
  await signInP02(page, runtime.admin.email, runtime.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/u);
  const sales = await createSalesBrowser(
    browser,
    page,
    `c2-paper-${info.project.name}`,
  );
  try {
    const p = sales.page;
    const existing = await createCustomer(
      p,
      `P02 existing inline ${info.project.name}`,
      info.project.name === "desktop" ? "0502100001" : "0502100002",
    );
    await goto(p, "/sales/orders/new");
    await p
      .getByLabel("الملاحظات العامة", { exact: true })
      .fill("ورقة غير محفوظة");
    const commands: string[] = [];
    const observe = (request: Request) => {
      const path = new URL(request.url()).pathname;
      if (
        ["POST", "PUT"].includes(request.method()) &&
        (path === "/api/v1/customers" ||
          path.startsWith("/api/v1/sales-drafts"))
      )
        commands.push(path);
    };
    p.on("request", observe);
    const trigger = p.getByRole("button", { name: /إنشاء عميل/u });
    await trigger.click();
    await p
      .getByRole("dialog")
      .getByLabel(/اسم العميل/u)
      .fill("Unsent customer");
    await p.keyboard.press("Tab");
    expect(
      await p
        .getByRole("dialog")
        .evaluate((element) => element.contains(document.activeElement)),
    ).toBe(true);
    await p.keyboard.press("Escape");
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(commands).toEqual([]);
    await expect(p.getByLabel("الملاحظات العامة", { exact: true })).toHaveValue(
      "ورقة غير محفوظة",
    );
    await trigger.click();
    const dialog = p.getByRole("dialog");
    await dialog
      .getByLabel(/اسم العميل/u)
      .fill(`P02 inline ${info.project.name}`);
    await dialog.getByLabel(/رقم الهاتف/u).fill(existing.phone);
    const duplicateReply = responseFor(p, "/customers", "POST");
    await dialog.getByRole("button", { name: "حفظ وربط بالطلب" }).click();
    const duplicate = await duplicateReply;
    expect(duplicate.status()).toBe(409);
    expect(
      errorEnvelopeSchema.parse((await duplicate.json()) as unknown).code,
    ).toBe("CUSTOMER_PHONE_CONFLICT");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/اسم العميل/u)).toHaveValue(
      `P02 inline ${info.project.name}`,
    );
    await expect(dialog.getByLabel(/رقم الهاتف/u)).toHaveValue(existing.phone);
    await expect(dialog.getByText(/رقم الهاتف مسجل بالفعل/u)).toBeVisible();
    await expect(
      p.getByRole("button", { name: "إزالة اختيار العميل" }),
    ).toHaveCount(0);
    await expect(
      p.locator("article").getByText("ورقة غير محفوظة", { exact: true }),
    ).toHaveCount(1);
    expect(commands).toEqual(["/api/v1/customers"]);
    await dialog
      .getByLabel(/رقم الهاتف/u)
      .fill(info.project.name === "desktop" ? "0502000001" : "0502000002");
    const customerReply = responseFor(p, "/customers", "POST");
    await dialog.getByRole("button", { name: "حفظ وربط بالطلب" }).click();
    const customer = (
      await dataFrom(await customerReply, customerCommandDataSchema)
    ).savedCustomer;
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(
      p.getByRole("article").getByText(customer.name, { exact: true }),
    ).toBeVisible();
    await expect(
      p.getByRole("button", { name: "إزالة اختيار العميل" }),
    ).toBeVisible();
    expect(commands).toEqual(["/api/v1/customers", "/api/v1/customers"]);
    await customCell(p, /^الموديل —/u, "الموديل", "موديل مبدئي");
    await customCell(p, /^الأساس —/u, "الأساس", "جلد مبدئي");
    await customCell(p, /^الإضافة —/u, "الإضافة", "روضة - H");
    await customCell(p, /^المقاس$/u, "المقاس", "42");
    for (const [label, value] of [
      [/^م١ —/u, "م١ مميز"],
      [/^م٢ —/u, "م٢ مميز"],
      [/^م٣ —/u, "م٣ مميز"],
      [/^الوجه —/u, "وجه مميز"],
      [/^الإضافات —/u, "ملاحظة"],
    ] as const)
      await p.getByRole("textbox", { name: label }).fill(value);
    await customCell(p, /^A$/u, "A", "A مميز");
    await customCell(p, /^F$/u, "F", "F مميز");
    await p.getByLabel("الملاحظات الجانبية", { exact: true }).fill("جانب مميز");
    await p.getByLabel("توقيع المسؤول", { exact: true }).fill("توقيع مدخل");
    await p
      .getByRole("combobox", { name: /نوع أمر التفصيل/u })
      .selectOption("REPAIR");
    await p.locator('[name="repairNote"]').fill("إصلاح محفوظ");
    await p
      .getByRole("combobox", { name: /نوع أمر التفصيل/u })
      .selectOption("ADJUSTMENT");
    for (const [name, value] of [
      ["adjustmentRequested", "تعديل محفوظ"],
      ["adjustmentReason", "سبب محفوظ"],
      ["adjustmentActionTaken", "إجراء محفوظ"],
    ] as const)
      await p.locator(`textarea[name="${name}"]`).first().fill(value);
    await p
      .getByRole("combobox", { name: /نوع أمر التفصيل/u })
      .selectOption("SHOP");
    await p
      .getByLabel("تاريخ التسليم المتوقع:", { exact: true })
      .fill("2026-11-20");
    await p.getByLabel("المبلغ المدفوع", { exact: true }).fill("-1");
    await p
      .getByRole("button", { name: "حفظ كمسودة", exact: true })
      .first()
      .click();
    await expect(
      p.getByLabel("المبلغ المدفوع", { exact: true }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(commands).toEqual(["/api/v1/customers", "/api/v1/customers"]);
    await p.getByLabel("المبلغ المدفوع", { exact: true }).fill("100.50");
    await p
      .getByRole("button", { name: "+ إضافة قطعة جديدة", exact: true })
      .click();
    await customCell(p, /^الموديل —/u, "الموديل", "P02 second", 1);
    const first = await savePaper(p);
    expect(first.draft.customer?.id).toBe(customer.id);
    const original = first.draft.pieces.find(
        (piece) => piece.model === "موديل مبدئي",
      ),
      second = first.draft.pieces.find((piece) => piece.model === "P02 second");
    if (original === undefined || second === undefined)
      throw new Error("Expected saved physical pieces");
    await p
      .getByTitle("تكرار هذه القطعة وإضافتها كقطعة جديدة", { exact: true })
      .first()
      .click();
    await p
      .getByTitle("حذف هذه القطعة من المسودة", { exact: true })
      .nth(2)
      .click();
    const final = await savePaper(p, first.draft.id);
    expect(final.draft.pieces).toHaveLength(2);
    const retained = final.draft.pieces.find(
        (piece) => piece.id === original.id,
      ),
      copy = final.draft.pieces.find((piece) => piece.id !== original.id);
    if (retained === undefined || copy === undefined)
      throw new Error("Expected retained original and copy");
    expect(copy.id).not.toBe(second.id);
    expect(final.draft.pieces.some((piece) => piece.id === second.id)).toBe(
      false,
    );
    const { position: _position, quantity: _quantity, ...captured } = retained;
    const {
      position: _copyPosition,
      quantity: _copyQuantity,
      ...copied
    } = copy;
    expect(copied).toEqual({ ...captured, id: copy.id });
    expect(final.draft.pieces.map((piece) => piece.position)).toEqual([1, 2]);
    expect(final.draft).toMatchObject({
      generalNotes: "ورقة غير محفوظة",
      responsibleSignature: "توقيع مدخل",
      repairNote: "إصلاح محفوظ",
      adjustmentRequested: "تعديل محفوظ",
      adjustmentReason: "سبب محفوظ",
      adjustmentActionTaken: "إجراء محفوظ",
      deliveryDate: "2026-11-20",
      paidAmount: "100.50",
    });
    p.off("request", observe);
    await signOut(p);
    await signInP02(p, sales.email, sales.password);
    await expect(p).toHaveURL(/\/sales\/dashboard$/u);
    const reopened = responseFor(
      p,
      `/sales-order-editor/${final.draft.id}`,
      "GET",
    );
    await goto(p, `/sales/orders/new?edit=${final.draft.id}`);
    const reopenedEditor = await dataFrom(
      await reopened,
      salesOrderEditorDataSchema,
    );
    expect(reopenedEditor.kind).toBe("draft");
    if (reopenedEditor.kind !== "draft")
      throw new Error("Expected persisted draft");
    expect(reopenedEditor.draft).toEqual(final.draft);
    await expect(p.getByLabel("الملاحظات العامة", { exact: true })).toHaveValue(
      "ورقة غير محفوظة",
    );
    await expect(
      p.getByRole("textbox", { name: /^الإضافات —/u }).first(),
    ).toHaveValue("ملاحظة");
    await expect(
      p.getByRole("combobox", { name: /^الإضافة —/u }).first(),
    ).toContainText("روضة - H");
    const headers = await sessionHeaders(p);
    const invalid = await p.request.put(
      `${runtime.apiOrigin}/api/v1/sales-drafts/${final.draft.id}`,
      {
        headers,
        data: {
          commandId: crypto.randomUUID(),
          expectedVersion: final.draft.version,
          draft: { ...final.capture, deliveryDate: "2026-02-30" },
        },
      },
    );
    expect(invalid.status()).toBe(400);
    const unchanged = await p.request.get(
      `${runtime.apiOrigin}/api/v1/sales-drafts/${final.draft.id}`,
      { headers },
    );
    expect(
      draftDataSchema.parse(
        successEnvelopeSchema.parse((await unchanged.json()) as unknown).data,
      ).draft,
    ).toEqual(final.draft);
    await expect(
      p.getByRole("button", { name: "إرسال للاعتماد" }),
    ).toBeDisabled();
    await expect(p.getByLabel("الإجمالي غير متاح")).toHaveText("—");
  } finally {
    await sales.context.close();
  }
});

const linkedPaper = async (
  page: Page,
  customer: { id: string; phone: string },
  note: string,
  size: string,
) => {
  await goto(
    page,
    `/sales/orders/new?customer=${encodeURIComponent(customer.phone)}`,
  );
  await expect(
    page.getByRole("button", { name: "إزالة اختيار العميل" }),
  ).toBeVisible();
  await page.getByLabel("الملاحظات العامة", { exact: true }).fill(note);
  await customCell(page, /^المقاس$/u, "المقاس", size);
  const saved = await savePaper(page);
  expect(saved.draft.customer?.id).toBe(customer.id);
  return saved;
};
test("P02-C3 privacy protects drafts, related counts, measurements and activity while ADMIN sees both owners", async ({
  browser,
  page,
}, info) => {
  const runtime = readE2eRuntime();
  await signInP02(page, runtime.admin.email, runtime.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/u);
  const a = await createSalesBrowser(
    browser,
    page,
    `c3-private-a-${info.project.name}`,
  );
  try {
    const b = await createSalesBrowser(
      browser,
      page,
      `c3-private-b-${info.project.name}`,
    );
    try {
      const c = await createCustomer(
        a.page,
        `P02 private ${info.project.name}`,
        info.project.name === "desktop" ? "0503000001" : "0503000002",
      );
      const da = await linkedPaper(a.page, c, "A private notes", "42"),
        db = await linkedPaper(b.page, c, "B private notes", "49");
      const headers = await sessionHeaders(b.page);
      await expect(
        b.page.getByRole("button", { name: "إزالة اختيار العميل" }),
      ).toBeVisible();
      await expect(
        b.page.getByLabel("الملاحظات العامة", { exact: true }),
      ).toHaveValue("B private notes");
      for (const target of [da.draft.id, crypto.randomUUID()]) {
        const denied = await b.page.request.get(
          `${runtime.apiOrigin}/api/v1/sales-drafts/${target}`,
          { headers },
        );
        expect(denied.status()).toBe(404);
        expect(
          errorEnvelopeSchema.parse((await denied.json()) as unknown).code,
        ).toBe("DRAFT_NOT_FOUND");
      }
      const write = await b.page.request.put(
        `${runtime.apiOrigin}/api/v1/sales-drafts/${da.draft.id}`,
        {
          headers,
          data: {
            commandId: crypto.randomUUID(),
            expectedVersion: da.draft.version,
            draft: da.capture,
          },
        },
      );
      expect(write.status()).toBe(404);
      expect(
        errorEnvelopeSchema.parse((await write.json()) as unknown).code,
      ).toBe("DRAFT_NOT_FOUND");
      const related = Promise.all([
        responseFor(b.page, `/customers/${c.id}`, "GET").then((response) =>
          dataFrom(response, customerDataSchema),
        ),
        responseFor(b.page, `/customers/${c.id}/drafts`, "GET").then(
          (response) => dataFrom(response, customerDraftsDataSchema),
        ),
        responseFor(b.page, `/customers/${c.id}/measurements`, "GET").then(
          (response) => dataFrom(response, customerMeasurementsDataSchema),
        ),
      ]);
      await goto(b.page, `/sales/customers/${encodeURIComponent(c.phone)}`);
      const [summary, cards, measurements] = await related;
      expect(summary).toMatchObject({
        draftCount: 1,
        latestMeasurement: {
          draftId: db.draft.id,
          size: "49",
          source: "DRAFT",
        },
      });
      expect(cards.drafts.map((draft) => draft.id)).toEqual([db.draft.id]);
      expect(measurements.measurements.map((row) => row.draftId)).toEqual([
        db.draft.id,
      ]);
      await expect(
        b.page.getByText("B private notes", { exact: true }),
      ).toBeVisible();
      await expect(
        b.page.getByText("A private notes", { exact: true }),
      ).toHaveCount(0);
      const activity = responseFor(
        b.page,
        "/sales-orders/activity",
        "GET",
      ).then((response) => dataFrom(response, salesOrderActivityDataSchema));
      await goto(b.page, "/sales/activity");
      expect(
        (await activity).events.flatMap((event) =>
          event.kind === "draft" ? [event.change.draftId] : [],
        ),
      ).toEqual([db.draft.id]);
      const broader = responseFor(
        page,
        `/customers/${c.id}/drafts`,
        "GET",
      ).then((response) => dataFrom(response, customerDraftsDataSchema));
      await goto(page, `/admin/customers/${encodeURIComponent(c.phone)}`);
      const result = await broader;
      expect(new Set(result.drafts.map((draft) => draft.id))).toEqual(
        new Set([da.draft.id, db.draft.id]),
      );
      for (const saved of [da.draft, db.draft]) {
        expect(
          result.drafts.find((draft) => draft.id === saved.id)?.owner,
        ).toEqual(saved.owner);
      }
      await expect(
        page.getByRole("link", { name: "عرض", exact: true }),
      ).toHaveCount(2);
      const own = await sessionHeaders(a.page);
      expect(
        (
          await dataFrom(
            await a.page.request.get(
              `${runtime.apiOrigin}/api/v1/sales-drafts/${da.draft.id}`,
              { headers: own },
            ),
            draftDataSchema,
          )
        ).draft,
      ).toEqual(da.draft);
    } finally {
      await b.context.close();
    }
  } finally {
    await a.context.close();
  }
});

test("P02-C3 stale customer and same-owner draft edits retain losing input until explicit review", async ({
  browser,
  page,
}, info) => {
  const runtime = readE2eRuntime();
  await signInP02(page, runtime.admin.email, runtime.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/u);
  const a = await createSalesBrowser(
    browser,
    page,
    `c3-stale-a-${info.project.name}`,
  );
  try {
    const b = await createSalesBrowser(
      browser,
      page,
      `c3-stale-b-${info.project.name}`,
    );
    try {
      const c = await createCustomer(
        a.page,
        `P02 stale ${info.project.name}`,
        info.project.name === "desktop" ? "0504000001" : "0504000002",
      );
      for (const p of [a.page, b.page]) {
        await goto(p, `/sales/customers/${encodeURIComponent(c.phone)}/edit`);
        await expect(p.getByLabel(/اسم العميل/u)).toHaveValue(c.name);
      }
      await a.page.getByLabel(/اسم العميل/u).fill("Customer winner");
      const win = responseFor(a.page, `/customers/${c.id}`, "PATCH");
      await a.page.getByRole("button", { name: "حفظ التعديلات" }).click();
      expect(
        (await dataFrom(await win, customerCommandDataSchema)).savedCustomer
          .version,
      ).toBe(2);
      await b.page.getByLabel(/اسم العميل/u).fill("Customer losing input");
      const lose = responseFor(b.page, `/customers/${c.id}`, "PATCH");
      await b.page.getByRole("button", { name: "حفظ التعديلات" }).click();
      const conflict = await lose;
      expect(conflict.status()).toBe(409);
      expect(
        errorEnvelopeSchema.parse((await conflict.json()) as unknown).code,
      ).toBe("CUSTOMER_VERSION_CONFLICT");
      await expect(b.page.getByLabel(/اسم العميل/u)).toHaveValue(
        "Customer losing input",
      );
      await b.page
        .getByRole("button", { name: "إعادة التحميل والمراجعة" })
        .click();
      await expect(b.page.getByLabel(/اسم العميل/u)).toHaveValue(
        "Customer winner",
      );
      await goto(a.page, "/sales/orders/new");
      await a.page
        .getByLabel("الملاحظات العامة", { exact: true })
        .fill("Draft base");
      const draft = await savePaper(a.page);
      const peerContext = await browser.newContext({
        viewport: page.viewportSize(),
      });
      try {
        const peer = await peerContext.newPage();
        await signInP02(peer, a.email, a.password);
        await expect(peer).toHaveURL(/\/sales\/dashboard$/u);
        await goto(peer, `/sales/orders/new?edit=${draft.draft.id}`);
        await expect(
          peer.getByLabel("الملاحظات العامة", { exact: true }),
        ).toHaveValue("Draft base");
        await a.page
          .getByLabel("الملاحظات العامة", { exact: true })
          .fill("Draft winner");
        const current = await savePaper(a.page, draft.draft.id);
        expect(current.draft.version).toBe(2);
        await peer
          .getByLabel("الملاحظات العامة", { exact: true })
          .fill("Draft losing input");
        const stale = responseFor(
          peer,
          `/sales-drafts/${draft.draft.id}`,
          "PUT",
        );
        await peer
          .getByRole("button", { name: "حفظ كمسودة", exact: true })
          .first()
          .click();
        const rejected = await stale;
        expect(rejected.status()).toBe(409);
        expect(
          errorEnvelopeSchema.parse((await rejected.json()) as unknown).code,
        ).toBe("DRAFT_VERSION_CONFLICT");
        await expect(
          peer.getByLabel("الملاحظات العامة", { exact: true }),
        ).toHaveValue("Draft losing input");
        await peer
          .getByRole("button", { name: "إعادة التحميل والمراجعة" })
          .click();
        await expect(
          peer.getByLabel("الملاحظات العامة", { exact: true }),
        ).toHaveValue("Draft winner");
      } finally {
        await peerContext.close();
      }
    } finally {
      await b.context.close();
    }
  } finally {
    await a.context.close();
  }
});

test("P02-C3 lost-reply observes the committed receipt and newer current revision, then recovers a confirmed refresh failure", async ({
  browser,
  page,
}, info) => {
  const runtime = readE2eRuntime();
  await signInP02(page, runtime.admin.email, runtime.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/u);
  const sales = await createSalesBrowser(
    browser,
    page,
    `c3-lost-${info.project.name}`,
  );
  try {
    const p = sales.page;
    await goto(p, "/sales/orders/new");
    const headers = await sessionHeaders(p);
    await p
      .getByLabel("الملاحظات العامة", { exact: true })
      .fill("Original lost capture");
    let committed: DraftCommandData | undefined,
      capture: DraftCapture | undefined,
      postCount = 0;
    const endpoint = `${runtime.apiOrigin}/api/v1/sales-drafts`;
    await p.route(endpoint, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      postCount += 1;
      const raw: unknown = route.request().postDataJSON();
      capture = createDraftBodySchema.parse(raw).draft;
      committed = await dataFrom(await route.fetch(), draftCommandDataSchema);
      await route.abort("failed");
    });
    await p
      .getByRole("button", { name: "حفظ كمسودة", exact: true })
      .first()
      .click();
    await expect(
      p.getByRole("button", { name: "التحقق من الحفظ" }),
    ).toBeVisible();
    await expect(
      p.getByRole("button", { name: "+ إضافة قطعة جديدة", exact: true }),
    ).toBeDisabled();
    if (committed === undefined || capture === undefined)
      throw new Error("Expected actual committed write before delivery loss");
    const original = committed,
      expectedCapture = capture,
      laterCommand = crypto.randomUUID();
    const later = await dataFrom(
      await p.request.put(`${endpoint}/${original.savedDraft.id}`, {
        headers,
        data: {
          commandId: laterCommand,
          expectedVersion: 1,
          draft: {
            ...expectedCapture,
            generalNotes: "Newer current after lost reply",
          },
        },
      }),
      draftCommandDataSchema,
    );
    expect(later.savedDraft.version).toBe(2);
    await p.getByRole("button", { name: "التحقق من الحفظ" }).click();
    await expect(p).toHaveURL(
      new RegExp(`edit=${original.savedDraft.id}$`, "u"),
    );
    await expect(p.getByLabel("الملاحظات العامة", { exact: true })).toHaveValue(
      "Newer current after lost reply",
    );
    expect(postCount).toBe(1);
    await p.unroute(endpoint);
    const receipt = await dataFrom(
      await p.request.get(
        `${runtime.apiOrigin}/api/v1/sales-commands/${original.receipt.commandId}`,
        { headers },
      ),
      salesCommandDataSchema,
    );
    expect(receipt.receipt.afterVersion).toBe(1);
    const detailURL = `${runtime.apiOrigin}/api/v1/sales-order-editor/${original.savedDraft.id}`;
    await p.route(detailURL, async (route) => {
      if (route.request().method() === "GET") {
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await p
      .getByLabel("الملاحظات العامة", { exact: true })
      .fill("Confirmed newer capture");
    const savedReply = responseFor(
      p,
      `/sales-drafts/${original.savedDraft.id}`,
      "PUT",
    );
    await p
      .getByRole("button", { name: "حفظ كمسودة", exact: true })
      .first()
      .click();
    const final = await dataFrom(await savedReply, draftCommandDataSchema);
    expect(final.savedDraft.version).toBe(3);
    await expect(p.getByRole("button", { name: "تحديث العرض" })).toBeVisible();
    await expect(
      p.getByRole("button", { name: "حفظ كمسودة", exact: true }).first(),
    ).toBeDisabled();
    await p.unroute(detailURL);
    await p.getByRole("button", { name: "تحديث العرض" }).click();
    await expect(p.getByLabel("الملاحظات العامة", { exact: true })).toHaveValue(
      "Confirmed newer capture",
    );
    const list = await dataFrom(
      await p.request.get(endpoint, { headers }),
      draftListDataSchema,
    );
    expect(list.pagination.total).toBe(1);
    expect(list.drafts[0]?.pieceCount).toBe(1);
    const changes = await dataFrom(
      await p.request.get(`${endpoint}/${original.savedDraft.id}/changes`, {
        headers,
      }),
      draftChangesDataSchema,
    );
    expect(changes.pagination.total).toBe(3);
    expect(new Set(changes.changes.map((change) => change.commandId))).toEqual(
      new Set([
        original.receipt.commandId,
        laterCommand,
        final.receipt.commandId,
      ]),
    );
    expect(postCount).toBe(1);
  } finally {
    await sales.context.close();
  }
});

const chooseCatalogCell = async (
  page: Page,
  label: string | RegExp,
  column: string,
  value: string,
  index = 0,
) => {
  const trigger = page.getByRole("combobox", { name: label }).nth(index);
  await trigger.click();
  const search = page.getByPlaceholder(`ابحث في ${column}...`);
  await expect(search).toBeFocused();
  await search.fill(value);
  await page.getByRole("option", { name: value, exact: true }).first().click();
  await expect(trigger).toBeFocused();
};
const completeP03Paper = async (page: Page, phone: string) => {
  await goto(page, `/sales/orders/new?customer=${encodeURIComponent(phone)}`);
  await expect(
    page.getByRole("button", { name: "إزالة اختيار العميل" }),
  ).toBeVisible();
  await chooseCatalogCell(page, /^الموديل —/u, "الموديل", "SM");
  await chooseCatalogCell(page, "المقاس", "المقاس", "40.5");
  await chooseCatalogCell(page, /^الأساس —/u, "الأساس", "synthetic I3");
  await chooseCatalogCell(page, /^التطعيم —/u, "التطعيم", "سادة - S");
  await page
    .getByRole("textbox", { name: /^الوجه —/u })
    .fill("P03 retained face");
  await expect(page.getByLabel("الإجمالي المعروض للمراجعة")).toHaveText(
    "650.00",
  );
};
const submitP03Paper = async (page: Page) => {
  const pending = responseFor(page, "/sales-orders", "POST");
  const button = page.getByRole("button", {
    name: "إرسال للاعتماد",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement))
      throw new Error("Expected submit button");
    element.click();
    element.click();
  });
  const response = await pending;
  const body = submitOrderBodySchema.parse(
    response.request().postDataJSON() as unknown,
  );
  const result = await dataFrom(response, salesOrderCommandDataSchema);
  await expect(page).toHaveURL(
    new RegExp(`/sales/orders/${result.savedOrder.id}$`, "u"),
  );
  return { body, result };
};

test("P03 catalog selections, exact quotes, free text and 1/8/9/17 physical paper rows", async ({
  page,
}, info) => {
  const fixture = readE2eRuntime().p03ByProject[info.project.name];
  if (fixture === undefined) throw new Error("Missing owned P03 fixture");
  await signInP02(page, fixture.sales.email, fixture.sales.password);
  await expect(page).toHaveURL(/\/sales\/dashboard$/u);
  const catalogReply = responseFor(page, "/catalogs", "GET");
  await goto(page, "/sales/orders/new");
  const catalog = await dataFrom(await catalogReply, catalogDataSchema);
  expect(catalog.availability).toBe("available");
  if (catalog.availability !== "available")
    throw new Error("Missing owned catalog");
  expect(catalog.entries).toHaveLength(1874);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(
    page.getByRole("heading", { name: "إنشاء أمر تفصيل جديد" }),
  ).toHaveCSS("font-family", /Cairo/iu);
  for (const [label, price] of [
    ["زبيري - z", "1800.00"],
    ["نعام - O", "1500.00"],
    ["سادة - S", "650.00"],
  ] as const) {
    const pending = responseFor(page, "/catalogs/quotes", "POST");
    await chooseCatalogCell(page, /^التطعيم —/u, "التطعيم", label);
    const quote = await dataFrom(await pending, catalogQuoteDataSchema);
    expect(quote.availability).toBe("available");
    await expect(page.getByLabel("الإجمالي المعروض للمراجعة")).toHaveText(
      price,
    );
  }
  await chooseCatalogCell(page, "المقاس", "المقاس", "40.5");
  await chooseCatalogCell(page, "A", "A", "22.5");
  await chooseCatalogCell(page, "F", "F", "22.5");
  await page
    .getByRole("textbox", { name: /^م٣ —/u })
    .fill("Independent free text");
  await expect(page.getByLabel("الإجمالي المعروض للمراجعة")).toHaveText(
    "650.00",
  );
  for (const count of [1, 8, 9, 17]) {
    while (
      (await page
        .locator(".paper-main-table > tbody > tr:not(.paper-blank-row)")
        .count()) < count
    )
      await page
        .getByRole("button", { name: "+ إضافة قطعة جديدة", exact: true })
        .click();
    await expect(
      page.locator(".paper-main-table > tbody > tr:not(.paper-blank-row)"),
    ).toHaveCount(count);
    await expect(page.locator(".order-paper")).toBeVisible();
  }
  const saved = await savePaper(page);
  expect(saved.draft.pieces).toHaveLength(17);
  expect(saved.draft.pieces[0]).toMatchObject({
    size: "40.5",
    aField: "22.5",
    fField: "22.5",
    mixing: "Independent free text",
    decoration: "سادة - S",
  });
  expect(saved.draft.pieces[0]?.catalogSelections?.decoration).toBe(
    catalog.entries.find(
      (entry) =>
        entry.kind === "decoration" && entry.displayValue === "سادة - S",
    )?.id,
  );
  await page.reload();
  await expect(
    page.locator(".paper-main-table > tbody > tr:not(.paper-blank-row)"),
  ).toHaveCount(17);
  await expect(page.getByLabel("الإجمالي غير متاح")).toHaveText("—");
});

test("P03 direct and dirty saved submission retain terms with A/B/admin scoped histories after reload", async ({
  browser,
  page,
}, info) => {
  const runtime = readE2eRuntime();
  await signInP02(page, runtime.admin.email, runtime.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/u);
  const a = await createSalesBrowser(
    browser,
    page,
    `p03-a-${info.project.name}`,
  );
  try {
    const b = await createSalesBrowser(
      browser,
      page,
      `p03-b-${info.project.name}`,
    );
    try {
      const customer = await createCustomer(
        a.page,
        `P03 shared ${info.project.name}`,
        info.project.name === "desktop" ? "0503100001" : "0503100002",
      );
      await completeP03Paper(a.page, customer.phone);
      await a.page.getByLabel("المبلغ المدفوع", { exact: true }).fill("100.50");
      const writes: string[] = [];
      const observe = (request: Request) => {
        const path = new URL(request.url()).pathname;
        if (
          request.method() === "POST" &&
          (path === "/api/v1/sales-orders" || path === "/api/v1/sales-drafts")
        )
          writes.push(path);
      };
      a.page.on("request", observe);
      const direct = await submitP03Paper(a.page);
      a.page.off("request", observe);
      expect(writes).toEqual(["/api/v1/sales-orders"]);
      expect(direct.body.origin).toBe("new");
      expect(direct.result.savedOrder.status).toBe("AWAITING_APPROVAL");
      expect(direct.result.savedOrder.money).toEqual({
        total: "650.00",
        paidAmount: "100.50",
        remainingDue: "549.50",
        surplus: "0.00",
      });
      await a.page.getByRole("button", { name: /الورقة الرسمية/u }).click();
      await expect(a.page.getByLabel("الإجمالي المعتمد")).toHaveText("650.00");
      await expect(a.page.getByRole("combobox")).toHaveCount(0);
      await expect(
        a.page.getByRole("button", { name: "الطباعة الرسمية غير متاحة" }),
      ).toBeDisabled();
      await completeP03Paper(a.page, customer.phone);
      const draft = await savePaper(a.page);
      await a.page
        .getByLabel("الملاحظات العامة", { exact: true })
        .fill("Dirty submission without preparatory save");
      const promoted = await submitP03Paper(a.page);
      expect(promoted.body.origin).toBe("draft");
      expect(promoted.result.savedOrder.id).toBe(draft.draft.id);
      expect(
        promoted.result.savedOrder.pieces.map((piece) => piece.id),
      ).toEqual(draft.draft.pieces.map((piece) => piece.id));
      expect(promoted.result.savedOrder.generalNotes).toBe(
        "Dirty submission without preparatory save",
      );
      await completeP03Paper(b.page, customer.phone);
      const foreign = await submitP03Paper(b.page);
      await signOut(a.page);
      await signInP02(a.page, a.email, a.password);
      await expect(a.page).toHaveURL(/\/sales\/dashboard$/u);
      const headers = await sessionHeaders(a.page);
      const persisted = await dataFrom(
        await a.page.request.get(
          `${runtime.apiOrigin}/api/v1/sales-orders/${direct.result.savedOrder.id}`,
          { headers },
        ),
        salesOrderDataSchema,
      );
      expect(persisted.order).toEqual(direct.result.savedOrder);
      const listReply = responseFor(a.page, "/sales-orders", "GET");
      await goto(a.page, "/sales/orders");
      const list = await dataFrom(await listReply, salesOrderListDataSchema);
      expect(
        list.items
          .flatMap((item) => (item.kind === "submitted" ? [item.order.id] : []))
          .sort(),
      ).toEqual(
        [direct.result.savedOrder.id, promoted.result.savedOrder.id].sort(),
      );
      const denied = await a.page.request.get(
        `${runtime.apiOrigin}/api/v1/sales-orders/${foreign.result.savedOrder.id}`,
        { headers },
      );
      expect(denied.status()).toBe(404);
      const history = responseFor(
        a.page,
        `/customers/${customer.id}/orders`,
        "GET",
      );
      const measures = responseFor(
        a.page,
        `/customers/${customer.id}/order-measurements`,
        "GET",
      );
      await goto(
        a.page,
        `/sales/customers/${encodeURIComponent(customer.phone)}`,
      );
      expect(
        (await dataFrom(await history, customerOrdersDataSchema)).totalOrders,
      ).toBe(2);
      expect(
        (await dataFrom(await measures, customerOrderMeasurementsDataSchema))
          .measurements,
      ).toHaveLength(2);
      await expect(
        a.page.getByRole("link", {
          name: foreign.result.savedOrder.businessNumber,
          exact: true,
        }),
      ).toHaveCount(0);
      const broader = responseFor(
        page,
        `/customers/${customer.id}/orders`,
        "GET",
      );
      await goto(
        page,
        `/admin/customers/${encodeURIComponent(customer.phone)}`,
      );
      expect(
        (await dataFrom(await broader, customerOrdersDataSchema)).totalOrders,
      ).toBe(3);
    } finally {
      await b.context.close();
    }
  } finally {
    await a.context.close();
  }
});

test("P03 returned correction, lazy history and paid-only lost-response recovery use persisted consumer fixtures", async ({
  page,
}, info) => {
  const runtime = readE2eRuntime(),
    fixture = runtime.p03ByProject[info.project.name];
  if (fixture === undefined) throw new Error("Missing owned P03 fixture");
  await signInP02(page, fixture.sales.email, fixture.sales.password);
  await expect(page).toHaveURL(/\/sales\/dashboard$/u);
  const headers = await sessionHeaders(page);
  const original = (
    await dataFrom(
      await page.request.get(
        `${runtime.apiOrigin}/api/v1/sales-orders/${fixture.returnedOrderId}`,
        { headers },
      ),
      salesOrderDataSchema,
    )
  ).order;
  await goto(page, "/sales/orders/returned");
  const returnedNavigation = page.locator(
    'nav a[href="/sales/orders/returned"]',
  );
  await expect(
    returnedNavigation.locator(".oriental-nav-badge, .oriental-nav-badge-mini"),
  ).toHaveText("1");
  await expect(
    page.getByText("Synthetic P04 consumer: review size", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "تصحيح وإعادة الإرسال", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "حفظ كمسودة", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "تكرار", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /^التطعيم —/u })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("المبلغ المدفوع", { exact: true })).toHaveCount(
    0,
  );
  await chooseCatalogCell(page, "المقاس", "المقاس", "40.5");
  await page
    .getByLabel("الملاحظات العامة", { exact: true })
    .fill("P03 corrected retained revision");
  const pending = responseFor(
    page,
    `/sales-orders/${original.id}/resubmit`,
    "POST",
  );
  await page
    .getByRole("button", { name: "إعادة الإرسال للاعتماد", exact: true })
    .click();
  const reply = await pending;
  const body = resubmitOrderBodySchema.parse(
    reply.request().postDataJSON() as unknown,
  );
  const corrected = (await dataFrom(reply, salesOrderCommandDataSchema))
    .savedOrder;
  await expect(
    returnedNavigation.locator(".oriental-nav-badge, .oriental-nav-badge-mini"),
  ).toHaveCount(0);
  expect(body.corrections).not.toHaveProperty("paidAmount");
  expect(body.corrections.pieces[0]).not.toHaveProperty("decoration");
  expect(corrected.businessNumber).toBe(original.businessNumber);
  expect(corrected.customerSnapshot).toEqual(original.customerSnapshot);
  expect(corrected.money).toEqual(original.money);
  expect(
    corrected.pieces.map((piece) => ({
      id: piece.id,
      price: piece.unitPrice,
      decoration: piece.decoration,
    })),
  ).toEqual(
    original.pieces.map((piece) => ({
      id: piece.id,
      price: piece.unitPrice,
      decoration: piece.decoration,
    })),
  );
  expect(corrected.status).toBe("AWAITING_APPROVAL");
  await expect(page).toHaveURL(
    new RegExp(`/sales/orders/${original.id}$`, "u"),
  );
  const revisions: string[] = [];
  const observe = (request: Request) => {
    if (/\/activity\/[0-9a-f-]+$/u.test(new URL(request.url()).pathname))
      revisions.push(request.url());
  };
  page.on("request", observe);
  await page.getByRole("button", { name: /سجل الحركات والتوقيتات/u }).click();
  const expand = page
    .getByRole("button", { name: "عرض القيم السابقة واللاحقة", exact: true })
    .first();
  await expect(expand).toBeVisible();
  expect(revisions).toEqual([]);
  const historical = page.waitForResponse((response) =>
    /\/activity\/[0-9a-f-]+$/u.test(new URL(response.url()).pathname),
  );
  await expand.click();
  expect(
    (await dataFrom(await historical, salesOrderRevisionDataSchema)).after
      .version,
  ).toBe(3);
  await expect(
    page.getByRole("heading", { name: "قبل التغيير", exact: true }),
  ).toBeVisible();
  page.off("request", observe);
  await goto(page, `/sales/orders/${fixture.approvedOrderId}`);
  await page.getByRole("button", { name: /الورقة الرسمية/u }).click();
  await expect(page.getByLabel("المدفوع المعتمد")).toHaveText("300.00");
  await page
    .getByRole("button", { name: "تعديل المبلغ المدفوع", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "تعديل المبلغ المدفوع", exact: true })
    .fill("450.50");
  const paid = responseFor(
    page,
    `/sales-orders/${fixture.approvedOrderId}/paid`,
    "PATCH",
  );
  await page.getByRole("button", { name: "حفظ المدفوع", exact: true }).click();
  expect(
    (await dataFrom(await paid, salesOrderCommandDataSchema)).savedOrder.money
      .paidAmount,
  ).toBe("450.50");
  await expect(page.getByLabel("الباقي المعتمد")).toHaveText("199.50");
  const paidURL = `${runtime.apiOrigin}/api/v1/sales-orders/${fixture.approvedOrderId}/paid`;
  let writes = 0;
  await page.route(paidURL, async (route) => {
    if (route.request().method() === "PATCH") {
      writes++;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "تعديل المبلغ المدفوع", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "تعديل المبلغ المدفوع", exact: true })
    .fill("700.00");
  await page.getByRole("button", { name: "حفظ المدفوع", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "التحقق وتحديث المدفوع", exact: true }),
  ).toBeVisible();
  await page.unroute(paidURL);
  await page
    .getByRole("button", { name: "التحقق وتحديث المدفوع", exact: true })
    .click();
  await expect(page.getByLabel("رصيد العميل الزائد")).toHaveText("50.00");
  expect(writes).toBe(1);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /الورقة الرسمية/u }).click();
  await expect(page.getByLabel("المدفوع المعتمد")).toHaveText("700.00");
});
