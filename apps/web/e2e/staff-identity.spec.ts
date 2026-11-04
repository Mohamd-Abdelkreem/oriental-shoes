import { expect, test, type Page } from "@playwright/test";

import { readE2eRuntime, waitForCapturedAction } from "./runtime";

/**
 * The isolated C1–C4 identity and staff journeys.
 *
 * Every journey runs against the harness-owned API, database, mailbox and Next
 * process. No developer server, developer database, shared port or real mail
 * provider is involved: the verification and recovery links come from the
 * harness-owned synthetic mailbox and the credentials come from the
 * harness-owned runtime manifest.
 *
 * The journeys use accessible UI interactions only. A direct HTTP check would
 * use a context's own real credentials and CSRF token against the same
 * isolated backend; no invented domain endpoint is used.
 */
const EMPLOYEE_PASSWORD = "Str0ng!Employee#2026";
const NEW_PASSWORD = "An0ther!Employee#2026";
const CHANGED_PASSWORD = "Ch4nged!Employee#2026";

const uniqueEmail = (prefix: string): string =>
  `${prefix}.${crypto.randomUUID().slice(0, 8)}@p01-e2e.test`;

const signIn = async (
  page: Page,
  email: string,
  password: string,
  options?: Readonly<{
    alreadyOnLoginPath?: boolean;
    returnTo?: string;
  }>,
): Promise<void> => {
  const runtime = readE2eRuntime();
  if (options?.alreadyOnLoginPath !== true) {
    const target =
      options?.returnTo === undefined
        ? "/auth/login"
        : `/auth/login?returnTo=${encodeURIComponent(options.returnTo)}`;
    await page.goto(`${runtime.webOrigin}${target}`);
  }
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
};

const registerEmployee = async (
  page: Page,
  fullName: string,
  email: string,
): Promise<void> => {
  const runtime = readE2eRuntime();
  await page.goto(`${runtime.webOrigin}/auth/register`);
  await page.getByLabel("الاسم الكامل").fill(fullName);
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel(/^كلمة المرور/).fill(EMPLOYEE_PASSWORD);
  await page.getByRole("button", { name: "طلب تسجيل الحساب" }).click();
  await expect(
    page.getByRole("heading", { name: "تحقق من بريدك الإلكتروني" }),
  ).toBeVisible();
};

const revealWorkspaceSidebar = async (page: Page): Promise<void> => {
  const mobileMenu = page.getByRole("button", { name: "فتح القائمة الجانبية" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
};

const searchEmployee = async (page: Page, email: string): Promise<void> => {
  if (new URL(page.url()).pathname !== "/admin/users") {
    const link = page.locator('.oriental-sidebar a[href="/admin/users"]');
    await expect(link).toBeVisible();
    await revealWorkspaceSidebar(page);
    await link.click();
    await expect(page).toHaveURL(/\/admin\/users$/);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByPlaceholder("ابحث بالاسم، البريد أو رقم الهاتف...")
    .fill(email);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
};

const openEmployeeDialog = async (page: Page, email: string) => {
  await searchEmployee(page, email);
  const rowAction = page
    .getByRole("row")
    .filter({ has: page.getByText(email, { exact: true }) })
    .locator("[data-staff-row-action]");
  await expect(rowAction).toBeVisible();
  await rowAction.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe("C1–C4 identity and staff journeys", () => {
  test("C1: a verified employee waits for approval, then reaches only the approved workspace", async ({
    browser,
    page,
  }) => {
    const runtime = readE2eRuntime();
    const email = uniqueEmail("c1.employee");

    const employeeContext = await browser.newContext();
    const employee = await employeeContext.newPage();

    await registerEmployee(employee, "C1 Employee", email);

    const verificationUrl = await waitForCapturedAction(email, "verification");
    await employee.goto(verificationUrl);
    await expect(
      employee.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
    ).toBeVisible();

    /**
     * A verified employee is still awaiting staff review: the credential
     * succeeds but the workspace stays closed.
     */
    await signIn(employee, email, EMPLOYEE_PASSWORD);
    await expect(employee).toHaveURL(/\/auth\/pending-approval/);
    await expect(employee.getByText("بعد موافقة الإدارة العامة")).toBeVisible();

    const otherEmail = uniqueEmail("c1.switch");
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await registerEmployee(other, "C1 Second Employee", otherEmail);
      await other.goto(await waitForCapturedAction(otherEmail, "verification"));
      await expect(
        other.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
      ).toBeVisible();
      await employee
        .getByRole("link", { name: "العودة لتسجيل الدخول" })
        .click();
      await expect(employee).toHaveURL(/\/auth\/login/);
      await signIn(employee, otherEmail, EMPLOYEE_PASSWORD, {
        alreadyOnLoginPath: true,
      });
      await expect(employee).toHaveURL(/\/auth\/pending-approval/);
      await expect(
        employee.getByText("بعد موافقة الإدارة العامة"),
      ).toBeVisible();
    } finally {
      await otherContext.close();
    }

    /**
     * The restricted status card can switch the account. The other identity
     * reaches its own destination and the restricted surface does not loop.
     */
    await employee.getByRole("link", { name: "العودة لتسجيل الدخول" }).click();
    await expect(employee).toHaveURL(/\/auth\/login/);
    await employee
      .getByLabel("البريد الإلكتروني", { exact: true })
      .fill(runtime.admin.email);
    await employee
      .getByLabel("كلمة المرور", { exact: true })
      .fill(runtime.admin.password);
    await employee.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(employee).toHaveURL(/\/admin\/dashboard/);
    await expect(employee.locator(".oriental-logout-btn")).toBeVisible();

    await signIn(page, runtime.admin.email, runtime.admin.password);
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    await searchEmployee(page, email);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
    const trigger = page
      .getByRole("row")
      .filter({ has: page.getByText(email, { exact: true }) })
      .locator("[data-staff-row-action]");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const keyboardDialog = page.getByRole("dialog");
    const department = keyboardDialog.locator("[data-staff-department]");
    await expect(department).toBeFocused();
    await expect(keyboardDialog).toHaveAttribute("dir", "rtl");
    await expect(keyboardDialog).toHaveCSS("font-family", /Cairo/i);
    await keyboardDialog.getByRole("button", { name: "إلغاء" }).focus();
    await page.keyboard.press("Tab");
    expect(
      await keyboardDialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(keyboardDialog).toBeHidden();
    await expect(trigger).toBeFocused();

    const dialog = await openEmployeeDialog(page, email);
    await dialog.locator("[data-staff-department]").selectOption("CUTTING");
    await dialog.getByRole("button", { name: "اعتماد وتعيين القسم" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: "تم حفظ قرار الموظف بنجاح." }),
    ).toBeVisible();

    /**
     * The approved employee reaches the approved workspace only. The wrong
     * department stays denied and a reload keeps the denial.
     */
    const approvedContext = await browser.newContext();
    const approved = await approvedContext.newPage();
    await signIn(approved, email, EMPLOYEE_PASSWORD);
    await expect(approved).toHaveURL(/\/cutting\/dashboard/);

    await approved.goto(`${runtime.webOrigin}/sales/dashboard`);
    await expect(approved).toHaveURL(/\/unauthorized/);

    await approved.reload();
    await expect(approved).toHaveURL(/\/unauthorized/);

    /**
     * A permitted login return survives exactly, while an unsafe and a
     * wrong-department return fall back to the account's own landing.
     */
    const permittedContext = await browser.newContext();
    const permitted = await permittedContext.newPage();
    await signIn(permitted, email, EMPLOYEE_PASSWORD, {
      returnTo: "/cutting/account?view=profile",
    });
    await expect(permitted).toHaveURL(/\/cutting\/account\?view=profile/);
    await permittedContext.close();

    const unsafeContext = await browser.newContext();
    const unsafe = await unsafeContext.newPage();
    await signIn(unsafe, email, EMPLOYEE_PASSWORD, {
      returnTo: "https://evil.example/x",
    });
    await expect(unsafe).toHaveURL(/\/cutting\/dashboard/);
    await unsafeContext.close();

    const wrongDepartmentContext = await browser.newContext();
    const wrongDepartment = await wrongDepartmentContext.newPage();
    await signIn(wrongDepartment, email, EMPLOYEE_PASSWORD, {
      returnTo: "/sales/dashboard",
    });
    await expect(wrongDepartment).toHaveURL(/\/cutting\/dashboard/);
    await wrongDepartmentContext.close();

    await approvedContext.close();
    await employeeContext.close();
  });

  test("C2: the directory keeps every decision of the same identity and never reactivates a legacy suspended account", async ({
    browser,
    page,
  }) => {
    const runtime = readE2eRuntime();
    const email = uniqueEmail("c2.employee");

    const employeeContext = await browser.newContext();
    const employee = await employeeContext.newPage();

    await registerEmployee(employee, "C2 Employee", email);
    const verificationUrl = await waitForCapturedAction(email, "verification");
    await employee.goto(verificationUrl);
    await expect(
      employee.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
    ).toBeVisible();

    await signIn(page, runtime.admin.email, runtime.admin.password);

    const dialog = await openEmployeeDialog(page, email);
    await dialog.getByRole("button", { name: "رفض" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: "تم حفظ قرار الموظف بنجاح." }),
    ).toBeVisible();

    await expect(page.getByText("مرفوض", { exact: true })).toBeVisible();

    /**
     * The same identity is reconsidered: the retained decision history still
     * shows the earlier rejection next to the new approval.
     */
    const reconsider = await openEmployeeDialog(page, email);
    await expect(
      reconsider.getByRole("button", { name: "إعادة النظر واعتماد الموظف" }),
    ).toBeVisible();
    await reconsider.locator("[data-staff-department]").selectOption("SALES");
    await reconsider
      .getByRole("button", { name: "إعادة النظر واعتماد الموظف" })
      .click();
    await expect(reconsider).toBeHidden();

    const history = await openEmployeeDialog(page, email);
    await expect(
      history.getByRole("region", { name: "سجل قرارات الموظف" }),
    ).toBeVisible();
    await expect(history.getByText("رفض", { exact: true })).toBeVisible();
    await history.getByRole("button", { name: "إلغاء" }).click();
    await expect(history).toBeHidden();

    /**
     * The owned legacy suspended fixture is prepared without a reactivation:
     * only the approval preparation is offered and the account stays
     * suspended.
     */
    const legacy = runtime.legacyStaffByProject[test.info().project.name];
    if (legacy === undefined) {
      throw new Error("The harness did not provide a legacy employee fixture.");
    }
    const legacyDialog = await openEmployeeDialog(page, legacy.email);
    await expect(
      legacyDialog.getByRole("button", { name: "تجهيز اعتماد الموظف" }),
    ).toBeVisible();
    await expect(
      legacyDialog.getByRole("button", { name: "إعادة تفعيل الحساب" }),
    ).toHaveCount(0);

    /**
     * The explicit preparation grants the approval fields but keeps the
     * retained identity suspended, and the reactivation stays a separate
     * action that the administrator has to request on its own.
     */
    await legacyDialog.locator("[data-staff-department]").selectOption("SALES");
    await legacyDialog
      .getByRole("button", { name: "تجهيز اعتماد الموظف" })
      .click();
    await expect(legacyDialog).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: "تم حفظ قرار الموظف بنجاح." }),
    ).toBeVisible();

    const preparedDialog = await openEmployeeDialog(page, legacy.email);
    await expect(
      preparedDialog.getByText("موقوف", { exact: true }),
    ).toBeVisible();
    await expect(
      preparedDialog.getByRole("button", { name: "إعادة تفعيل الحساب" }),
    ).toBeVisible();
    await expect(
      preparedDialog.getByRole("button", { name: "تجهيز اعتماد الموظف" }),
    ).toHaveCount(0);
    await preparedDialog.getByRole("button", { name: "إلغاء" }).click();

    await employeeContext.close();
  });

  test("C3: a suspended employee's next protected request is denied and a later department is allowed", async ({
    browser,
    page,
  }) => {
    const runtime = readE2eRuntime();
    const email = uniqueEmail("c3.employee");

    const employeeContext = await browser.newContext();
    const employee = await employeeContext.newPage();

    await registerEmployee(employee, "C3 Employee", email);
    const verificationUrl = await waitForCapturedAction(email, "verification");
    await employee.goto(verificationUrl);
    await expect(
      employee.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
    ).toBeVisible();

    await signIn(page, runtime.admin.email, runtime.admin.password);
    const approval = await openEmployeeDialog(page, email);
    await approval.locator("[data-staff-department]").selectOption("WAREHOUSE");
    await approval.getByRole("button", { name: "اعتماد وتعيين القسم" }).click();
    await expect(approval).toBeHidden();

    const secondContext = await browser.newContext();
    try {
      const second = await secondContext.newPage();
      const sessions = [];
      for (const session of [employee, second]) {
        const identityRead = session.waitForRequest(
          async (request) =>
            new URL(request.url()).pathname === "/api/v1/users/me" &&
            request.method() === "GET" &&
            (await request.headerValue("authorization")) !== null,
          { timeout: 20_000 },
        );
        await signIn(session, email, EMPLOYEE_PASSWORD, {
          returnTo: "/warehouse/account",
        });
        await expect(session).toHaveURL(/\/warehouse\/account/);
        await expect(
          session.getByLabel("الاسم الكامل", { exact: true }),
        ).toHaveValue("C3 Employee");
        const authorization = await (
          await identityRead
        ).headerValue("authorization");
        if (authorization === null)
          throw new Error("The browser session did not send its credential.");
        const csrf = (await session.context().cookies(runtime.apiOrigin)).find(
          ({ name }) => name === "csrfToken",
        );
        if (csrf === undefined)
          throw new Error(
            "The browser session did not receive its CSRF cookie.",
          );
        sessions.push({ session, authorization, csrf: csrf.value });
      }

      const suspension = await openEmployeeDialog(page, email);
      await suspension
        .getByRole("button", { name: "إيقاف الحساب مؤقتاً" })
        .click();
      await expect(suspension).toBeHidden();

      for (const { session, authorization, csrf } of sessions) {
        const response = await session.request.patch(
          `${runtime.apiOrigin}/api/v1/users/me`,
          {
            headers: { authorization, "x-csrf-token": csrf },
            data: { fullName: "Denied profile write" },
            timeout: 15_000,
          },
        );
        expect(response.status()).toBe(403);
        expect(await response.json()).toMatchObject({
          code: "ACCOUNT_RESTRICTED",
        });
        await session.reload();
        await expect(session).toHaveURL(/\/auth\/suspended/);
      }

      const reactivation = await openEmployeeDialog(page, email);
      await reactivation
        .getByRole("button", { name: "إعادة تفعيل الحساب" })
        .click();
      await expect(reactivation).toBeHidden();

      const reassignment = await openEmployeeDialog(page, email);
      await reassignment
        .locator("[data-staff-department]")
        .selectOption("CUTTING");
      await reassignment
        .getByRole("button", { name: "تغيير القسم المعتمد" })
        .click();
      await expect(reassignment).toBeHidden();
      const persisted = await openEmployeeDialog(page, email);
      await expect(persisted.locator("[data-staff-department]")).toHaveValue(
        "CUTTING",
      );
      await expect(
        persisted.getByRole("row").filter({ hasText: "تغيير القسم" }),
      ).toBeVisible();
      await persisted.getByRole("button", { name: "إلغاء" }).click();
      for (const session of [employee, second]) {
        await session.goto(`${runtime.webOrigin}/warehouse/account`);
        await expect(session).toHaveURL(/\/unauthorized/);
        await session.goto(`${runtime.webOrigin}/cutting/account`);
        await expect(session).toHaveURL(/\/cutting\/account/);
        await expect(
          session.getByLabel("الاسم الكامل", { exact: true }),
        ).toHaveValue("C3 Employee");
      }
    } finally {
      await secondContext.close();
    }

    await employeeContext.close();
  });

  test("C4: recovery, a password change and a session ending behave truthfully", async ({
    browser,
    page,
  }) => {
    const runtime = readE2eRuntime();
    const email = uniqueEmail("c4.employee");

    const employeeContext = await browser.newContext();
    const employee = await employeeContext.newPage();
    employee.setDefaultTimeout(15_000);

    await registerEmployee(employee, "C4 Employee", email);
    const verificationUrl = await waitForCapturedAction(email, "verification");
    await employee.goto(verificationUrl);
    await expect(
      employee.getByRole("heading", { name: "تم تأكيد البريد الإلكتروني" }),
    ).toBeVisible();

    /**
     * An unusable recovery link is reported as an invalid link instead of a
     * successful reset.
     */
    await employee.goto(
      `${runtime.webOrigin}/auth/reset-password?token=not-a-real-token`,
    );
    await expect(
      employee.getByRole("heading", { name: "الرابط غير متاح" }),
    ).toBeVisible();

    /**
     * The recovery link is only issued for an eligible account, so the
     * employee is approved through the real administrator surface first.
     */
    await signIn(page, runtime.admin.email, runtime.admin.password);
    const approval = await openEmployeeDialog(page, email);
    await approval.locator("[data-staff-department]").selectOption("SALES");
    await approval.getByRole("button", { name: "اعتماد وتعيين القسم" }).click();
    await expect(approval).toBeHidden();

    /**
     * The eligible account receives a real captured recovery link and the
     * new password is accepted afterwards.
     */
    await employee.goto(`${runtime.webOrigin}/auth/forgot-password`);
    await employee.getByLabel("البريد الإلكتروني للحساب").fill(email);
    await employee
      .getByRole("button", { name: "إرسال رابط الاستعادة" })
      .click();

    const resetUrl = await waitForCapturedAction(email, "reset");
    await employee.goto(resetUrl);
    await employee.getByLabel(/^كلمة المرور الجديدة/).fill(NEW_PASSWORD);
    await employee
      .getByLabel("تأكيد كلمة المرور الجديدة", { exact: true })
      .fill(NEW_PASSWORD);
    await employee.getByRole("button", { name: "تعيين كلمة المرور" }).click();

    await expect(employee).toHaveURL(/\/auth\/login/);
    await signIn(employee, email, NEW_PASSWORD, { alreadyOnLoginPath: true });
    await expect(employee).not.toHaveURL(/\/auth\/login/);

    /**
     * The old password no longer works after the change.
     */
    const staleContext = await browser.newContext();
    const stale = await staleContext.newPage();
    await signIn(stale, email, EMPLOYEE_PASSWORD);
    await expect(stale.getByRole("alert").first()).toBeVisible();
    await expect(stale).toHaveURL(/\/auth\/login/);
    await staleContext.close();

    const accountPath = `${runtime.webOrigin}/sales/account`;
    const peerContext = await browser.newContext();
    try {
      const peer = await peerContext.newPage();
      peer.setDefaultTimeout(15_000);
      await signIn(peer, email, NEW_PASSWORD, { returnTo: "/sales/account" });
      await expect(
        peer.getByRole("button", { name: "حفظ التعديلات" }),
      ).toBeVisible();

      await employee.goto(accountPath);
      const profileName = employee.getByLabel("الاسم الكامل", { exact: true });
      await expect(profileName).toHaveValue("C4 Employee");
      await profileName.press("ControlOrMeta+a");
      await profileName.pressSequentially("C4 Saved Employee");
      await expect(profileName).toHaveValue("C4 Saved Employee");
      const saveProfile = employee.getByRole("button", {
        name: "حفظ التعديلات",
      });
      await expect(saveProfile).toBeEnabled();
      await saveProfile.click();
      await expect(
        employee
          .getByRole("status")
          .filter({ hasText: "تم حفظ وتحديث البيانات الشخصية بنجاح." }),
      ).toBeVisible();
      await employee.reload();
      await expect(profileName).toHaveValue("C4 Saved Employee");

      const endAll = employee.getByRole("button", { name: "إنهاء كل الجلسات" });
      await profileName.fill("Retained draft");
      const endingEndpoint = `${runtime.apiOrigin}/api/v1/auth/logout-all`;
      await employee.route(endingEndpoint, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        await employeeContext.setOffline(true);
        await route.abort("internetdisconnected");
      });
      try {
        await endAll.click();
        await expect(
          employee
            .getByRole("alert")
            .filter({ hasText: "تعذر تأكيد تسجيل الخروج من الأجهزة الأخرى." }),
        ).toBeVisible();
        await expect(endAll).toBeEnabled();
        await expect(profileName).toBeEditable();
        await expect(profileName).toHaveValue("Retained draft");
        await expect(employee).toHaveURL(/\/sales\/account/);
      } finally {
        await employeeContext.setOffline(false);
        await employee.unroute(endingEndpoint);
      }

      await revealWorkspaceSidebar(employee);
      await employee.locator(".oriental-logout-btn").click();
      await expect(employee).toHaveURL(/\/auth\/login/);
      await employee.goto(accountPath);
      await expect(employee).toHaveURL(/\/auth\/login/);
      await peer.reload();
      await expect(
        peer.getByLabel("الاسم الكامل", { exact: true }),
      ).toHaveValue("C4 Saved Employee");

      await signIn(employee, email, NEW_PASSWORD, {
        returnTo: "/sales/account",
      });
      await employee
        .getByLabel("كلمة المرور الحالية", { exact: true })
        .fill(NEW_PASSWORD);
      await employee
        .getByLabel("كلمة المرور الجديدة", { exact: true })
        .fill(CHANGED_PASSWORD);
      await employee
        .getByLabel("تأكيد كلمة المرور الجديدة", { exact: true })
        .fill(CHANGED_PASSWORD);
      await employee.getByRole("button", { name: "تحديث كلمة المرور" }).click();
      await expect(employee).toHaveURL(/\/auth\/login/);
      await peer.reload();
      await expect(peer).toHaveURL(/\/auth\/login/);
      await signIn(employee, email, NEW_PASSWORD);
      await expect(employee.getByRole("alert").first()).toBeVisible();
      await signIn(employee, email, CHANGED_PASSWORD, {
        returnTo: "/sales/account",
      });
      await signIn(peer, email, CHANGED_PASSWORD, {
        returnTo: "/sales/account",
      });
      await expect(
        peer.getByRole("button", { name: "حفظ التعديلات" }),
      ).toBeVisible();

      await endAll.click();
      await expect(employee).toHaveURL(/\/auth\/login/);
      await peer.reload();
      await expect(peer).toHaveURL(/\/auth\/login/);
      await employee.goto(accountPath);
      await expect(employee).toHaveURL(/\/auth\/login/);
    } finally {
      await peerContext.close();
    }

    await employeeContext.close();
  });
});
