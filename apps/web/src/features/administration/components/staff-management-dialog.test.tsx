import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  AuthUserData,
  SafeUser,
  StaffApprovalBody,
  StaffCommandBody,
  StaffCommandData,
  StaffDecisionsData,
  StaffDecision,
  StaffDepartmentBody,
  StaffHistoryQueryInput,
  StaffListData,
  StaffListQueryInput,
  StaffUserData,
} from "@template/contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";

import { StaffManagementDialog } from "./staff-management-dialog";

const staffApiMocks = vi.hoisted(() => ({
  list: vi.fn<
    (query: StaffListQueryInput, signal?: AbortSignal) => Promise<StaffListData>
  >(),
  get: vi.fn<
    (userId: string, signal?: AbortSignal) => Promise<StaffUserData>
  >(),
  decisions:
    vi.fn<
      (
        userId: string,
        query: StaffHistoryQueryInput,
        signal?: AbortSignal,
      ) => Promise<StaffDecisionsData>
    >(),
  approve:
    vi.fn<
      (userId: string, body: StaffApprovalBody) => Promise<StaffCommandData>
    >(),
  reject:
    vi.fn<
      (userId: string, body: StaffCommandBody) => Promise<StaffCommandData>
    >(),
  suspend:
    vi.fn<
      (userId: string, body: StaffCommandBody) => Promise<StaffCommandData>
    >(),
  reactivate:
    vi.fn<
      (userId: string, body: StaffCommandBody) => Promise<StaffCommandData>
    >(),
  changeDepartment:
    vi.fn<
      (userId: string, body: StaffDepartmentBody) => Promise<StaffCommandData>
    >(),
}));

vi.mock("@/features/administration/api/staff.api", () => ({
  staffApi: staffApiMocks,
}));

const usersApiMocks = vi.hoisted(() => ({ getMe: vi.fn() }));

vi.mock("@/features/users/api/users.api", () => ({
  usersApi: usersApiMocks,
}));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TARGET_ID = "33333333-3333-4333-8333-333333333333";

const safeUser = (
  id: string,
  accessVersion = 1,
  overrides: Readonly<Record<string, unknown>> = {},
): SafeUser => ({
  id,
  fullName: "Nour Adel",
  email: `${id}@example.com`,
  phone: "+201000000000",
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-02T00:00:00.000Z",
  accessVersion,
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  ...overrides,
});

const adminAccount: AuthUserData = {
  user: safeUser(ADMIN_ID, 1, {
    role: "ADMIN",
    department: null,
    staffApprovedAt: null,
  }),
};

const otherAdminAccount: AuthUserData = {
  user: {
    id: OTHER_ADMIN_ID,
    fullName: "Sayed Adel",
    email: `${OTHER_ADMIN_ID}@example.com`,
    phone: "+201000000000",
    role: "ADMIN",
    status: "ACTIVE",
    department: null,
    staffApprovedAt: null,
    accessVersion: 1,
    emailVerifiedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
};

const pendingStaff = (accessVersion = 1): SafeUser =>
  safeUser(TARGET_ID, accessVersion, {
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
  });

const rejectedStaff = (accessVersion = 1): SafeUser =>
  safeUser(TARGET_ID, accessVersion, {
    status: "REJECTED",
    department: null,
    staffApprovedAt: null,
  });

const legacySuspendedStaff = (accessVersion = 1): SafeUser =>
  safeUser(TARGET_ID, accessVersion, {
    status: "SUSPENDED",
    department: null,
    staffApprovedAt: null,
  });

const approvedSuspendedStaff = (accessVersion = 1): SafeUser =>
  safeUser(TARGET_ID, accessVersion, {
    status: "SUSPENDED",
    department: "SALES",
    staffApprovedAt: "2026-08-02T00:00:00.000Z",
  });

const detailData = (staff: SafeUser): StaffUserData => ({ staff });

const emptyDecisions = () => ({
  decisions: [],
  pagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});

const decision = (overrides: Partial<StaffDecision> = {}): StaffDecision => ({
  id: "55555555-5555-4555-8555-555555555555",
  commandId: "66666666-6666-4666-8666-666666666666",
  action: "APPROVE",
  actor: {
    id: ADMIN_ID,
    fullName: "Sayed Adel",
    role: "ADMIN",
    department: null,
  },
  targetUserId: TARGET_ID,
  occurredAt: "2026-08-02T10:00:00.000Z",
  before: {
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
    accessVersion: 1,
  },
  after: {
    status: "ACTIVE",
    department: "SALES",
    staffApprovedAt: "2026-08-02T10:00:00.000Z",
    accessVersion: 2,
  },
  ...overrides,
});

const commandReceipt = (
  staff: SafeUser,
  applied: StaffDecision | null = null,
  replayed = false,
): StaffCommandData => ({ staff, decision: applied, replayed });

type ApiFailure = Error & {
  readonly isAxiosError: true;
  readonly response: {
    readonly status: number;
    readonly data: unknown;
    readonly headers: Readonly<Record<string, string>>;
  };
};

const apiFailure = (
  statusCode: number,
  message: string,
  code = "VALIDATION_ERROR",
  errors?: readonly { field: string; message: string }[],
): ApiFailure =>
  Object.assign(new Error(message), {
    isAxiosError: true as const,
    response: {
      status: statusCode,
      data: {
        success: false,
        message,
        statusCode,
        code,
        requestId: "request-1",
        ...(errors === undefined ? {} : { errors }),
      },
      headers: {},
    },
  });

const createDeferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const clients: QueryClient[] = [];

const createClient = (): QueryClient => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  clients.push(queryClient);
  queryClient.setQueryData<AuthUserData | null>(
    AUTH_SESSION_QUERY_KEY,
    adminAccount,
  );
  return queryClient;
};

const renderDialog = (
  userId: string = TARGET_ID,
  onClose: () => void = () => undefined,
  queryClient: QueryClient = createClient(),
) => {
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<StaffManagementDialog userId={userId} onClose={onClose} />, {
    wrapper,
  });
  return queryClient;
};

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const departmentSelect = () =>
  screen.getByLabelText<HTMLSelectElement>("القسم المعتمد لهذا الموظف:");

const approveButton = () =>
  screen.getByRole("button", { name: "اعتماد وتعيين القسم" });

beforeEach(() => {
  staffApiMocks.list.mockReset();
  staffApiMocks.get.mockReset();
  staffApiMocks.decisions.mockReset();
  staffApiMocks.approve.mockReset();
  staffApiMocks.reject.mockReset();
  staffApiMocks.suspend.mockReset();
  staffApiMocks.reactivate.mockReset();
  staffApiMocks.changeDepartment.mockReset();
  usersApiMocks.getMe.mockReset();
  usersApiMocks.getMe.mockResolvedValue(adminAccount);
  staffApiMocks.decisions.mockResolvedValue(emptyDecisions());
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("session-access-token", epoch, ADMIN_ID);
});

afterEach(() => {
  while (clients.length > 0) {
    clients.pop()?.clear();
  }
});

describe("StaffManagementDialog", () => {
  it("approves a pending employee with the required department", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    staffApiMocks.approve.mockResolvedValue(
      commandReceipt(safeUser(TARGET_ID, 2), decision()),
    );
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });
    const [calledUserId, body] = staffApiMocks.approve.mock.calls[0] ?? [];
    expect(calledUserId).toBe(TARGET_ID);
    expect(body?.expectedAccessVersion).toBe(1);
    expect(body?.department).toBe("SALES");
    expect(body?.commandId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("reconsiders a rejected employee through the approval endpoint", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(rejectedStaff()));
    staffApiMocks.approve.mockResolvedValue(
      commandReceipt(
        safeUser(TARGET_ID, 2),
        decision({ action: "RECONSIDER" }),
      ),
    );

    renderDialog();
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "CUTTING" } });
    fireEvent.click(
      screen.getByRole("button", { name: "إعادة النظر واعتماد الموظف" }),
    );

    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });
    expect(staffApiMocks.reject).not.toHaveBeenCalled();
    const body = staffApiMocks.approve.mock.calls[0]?.[1];
    expect(body?.expectedAccessVersion).toBe(1);
    expect(body?.department).toBe("CUTTING");
    expect(body?.commandId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
  });

  it("prepares a legacy suspension instead of reactivating it", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(legacySuspendedStaff()));
    staffApiMocks.approve.mockResolvedValue(
      commandReceipt(
        safeUser(TARGET_ID, 2),
        decision({ action: "PREPARE_APPROVAL" }),
      ),
    );

    renderDialog();
    await screen.findByText("Nour Adel");

    expect(
      screen.queryByRole("button", { name: "إعادة تفعيل الحساب" }),
    ).not.toBeInTheDocument();
    fireEvent.change(departmentSelect(), { target: { value: "WAREHOUSE" } });
    fireEvent.click(
      screen.getByRole("button", { name: "تجهيز اعتماد الموظف" }),
    );

    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });
    expect(staffApiMocks.reactivate).not.toHaveBeenCalled();
    const body = staffApiMocks.approve.mock.calls[0]?.[1];
    expect(body?.expectedAccessVersion).toBe(1);
    expect(body?.department).toBe("WAREHOUSE");
  });

  it("reactivates an approved suspension as a separate command", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(approvedSuspendedStaff()));
    staffApiMocks.reactivate.mockResolvedValue(
      commandReceipt(
        safeUser(TARGET_ID, 2),
        decision({ action: "REACTIVATE" }),
      ),
    );

    renderDialog();
    await screen.findByText("Nour Adel");

    expect(
      screen.queryByRole("button", { name: "تجهيز اعتماد الموظف" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تفعيل الحساب" }));

    await waitFor(() => {
      expect(staffApiMocks.reactivate).toHaveBeenCalledTimes(1);
    });
    expect(staffApiMocks.approve).not.toHaveBeenCalled();
    const body = staffApiMocks.reactivate.mock.calls[0]?.[1];
    expect(body?.expectedAccessVersion).toBe(1);
    expect(body?.commandId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
  });

  it("requires a department for an assignment command", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));

    renderDialog();
    await screen.findByText("Nour Adel");

    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(
        screen.getByText("a department must be selected"),
      ).toBeInTheDocument();
    });
    expect(staffApiMocks.approve).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(departmentSelect());
  });

  it("blocks a duplicate click and an implicit submission while pending", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const deferred = createDeferred<StaffCommandData>();
    staffApiMocks.approve.mockReturnValue(deferred.promise);

    renderDialog();
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(approveButton());
    fireEvent.keyDown(departmentSelect(), { key: "Enter" });
    const form = screen.getByRole("dialog").querySelector("form");
    if (form !== null) fireEvent.submit(form);
    await flush();

    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);

    deferred.resolve(commandReceipt(safeUser(TARGET_ID, 2), decision()));
    await flush();
  });

  it("cancels without writing a command", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(staffApiMocks.approve).not.toHaveBeenCalled();
    expect(staffApiMocks.reject).not.toHaveBeenCalled();
  });

  it("keeps the draft after a rejected validation", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    staffApiMocks.approve.mockRejectedValue(
      apiFailure(400, "قسم غير مسموح", "VALIDATION_ERROR", [
        { field: "body.department", message: "قسم غير مسموح" },
      ]),
    );
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(screen.getAllByText("قسم غير مسموح").length).toBeGreaterThan(0);
    });
    expect(departmentSelect().value).toBe("SALES");
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    "STAFF_ACCESS_CONFLICT",
    "STAFF_COMMAND_CONFLICT",
    "STAFF_TRANSITION_CONFLICT",
  ])("requires a current state review after %s", async (code) => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    staffApiMocks.approve.mockRejectedValue(
      apiFailure(409, "تعارض في الحالة الحالية", code),
    );
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(
        screen.getByText(
          "تعارضت الحالة الحالية مع الأمر. تم الاحتفاظ بتعديلاتك؛ راجع الحالة الحالية ثم أرسل أمراً جديداً.",
        ),
      ).toBeInTheDocument();
    });
    expect(departmentSelect().value).toBe("SALES");
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "مراجعة الحالة الحالية" }),
    ).toBeInTheDocument();
    expect(approveButton()).toBeDisabled();
  });

  it.each(["conflict", "uncertain", "saved"] as const)(
    "keeps the %s review barrier and draft through a failed guarded refresh",
    async (kind) => {
      staffApiMocks.get.mockResolvedValueOnce(detailData(pendingStaff()));
      staffApiMocks.get.mockRejectedValue(
        apiFailure(500, "Detail refresh unavailable"),
      );
      staffApiMocks.decisions.mockResolvedValueOnce(emptyDecisions());
      staffApiMocks.decisions.mockRejectedValue(
        apiFailure(500, "History refresh unavailable"),
      );
      if (kind === "saved") {
        staffApiMocks.approve.mockResolvedValue(
          commandReceipt(safeUser(TARGET_ID, 2), decision()),
        );
      } else {
        staffApiMocks.approve.mockRejectedValue(
          kind === "conflict"
            ? apiFailure(409, "Conflict", "STAFF_ACCESS_CONFLICT")
            : apiFailure(503, "Unknown response"),
        );
      }
      const onClose = vi.fn();
      renderDialog(TARGET_ID, onClose);
      await screen.findByText("Nour Adel");
      fireEvent.change(departmentSelect(), { target: { value: "CUTTING" } });
      fireEvent.click(approveButton());
      const review = await screen.findByRole("button", {
        name: "مراجعة الحالة الحالية",
      });
      await waitFor(() => {
        expect(review).toBeEnabled();
      });
      fireEvent.click(review);
      expect(
        await screen.findByText("تعذّرت مراجعة الحالة الحالية. أعد المحاولة."),
      ).toBeVisible();
      await waitFor(() => {
        expect(review).toBeEnabled();
      });
      const form = departmentSelect().form;
      if (form === null) throw new Error("Staff form is missing.");
      act(() => {
        fireEvent.submit(form);
      });
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
      expect(staffApiMocks.changeDepartment).not.toHaveBeenCalled();
      expect(departmentSelect()).toHaveValue("CUTTING");
      expect(screen.getByText("Nour Adel")).toBeVisible();
      expect(screen.getByText("تعذّر تحميل بيانات الموظف.")).toBeVisible();
      expect(screen.getByText("تعذّر تحميل سجل القرارات.")).toBeVisible();
      expect(onClose).not.toHaveBeenCalled();
      if (kind === "saved")
        expect(
          screen.getByText(/تم حفظ القرار بنجاح، لكن تعذّر/),
        ).toBeVisible();
      if (kind === "uncertain")
        expect(
          screen.getByRole("button", { name: "إعادة إرسال الأمر نفسه" }),
        ).toBeEnabled();
    },
  );

  it("creates no audit row for an unchanged command", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const deferred = createDeferred<StaffCommandData>();
    staffApiMocks.approve.mockReturnValue(deferred.promise);

    renderDialog();
    await screen.findByText("Nour Adel");

    expect(
      await screen.findByText("لا توجد قرارات محفوظة"),
    ).toBeInTheDocument();

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });

    deferred.resolve(commandReceipt(safeUser(TARGET_ID, 1), null, false));
    await flush();
    expect(screen.queryByText(/^آخر قرار:/u)).not.toBeInTheDocument();
  });

  it("closes a replayed command without a second change", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const onClose = vi.fn();
    staffApiMocks.approve.mockResolvedValue(
      commandReceipt(safeUser(TARGET_ID, 2), decision(), true),
    );

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmed save whose refresh failed", async () => {
    staffApiMocks.get
      .mockResolvedValueOnce(detailData(pendingStaff()))
      .mockRejectedValueOnce(apiFailure(500, "تعذّر تحديث القائمة"))
      .mockResolvedValue(detailData(safeUser(TARGET_ID, 2)));
    staffApiMocks.approve.mockResolvedValue(
      commandReceipt(safeUser(TARGET_ID, 2), decision()),
    );
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(
        screen.getByText(
          "تم حفظ القرار بنجاح، لكن تعذّر تحديث البيانات المعروضة. يمكنك تحديث البيانات فقط دون إعادة إرسال الأمر. تعذّر تحديث القائمة",
        ),
      ).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    expect(departmentSelect().value).toBe("SALES");

    fireEvent.click(screen.getByRole("button", { name: "تحديث البيانات" }));
    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledTimes(3);
    });
    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
  });

  it("keeps a newer committed state under review instead of closing", async () => {
    staffApiMocks.get
      .mockResolvedValueOnce(detailData(pendingStaff()))
      .mockResolvedValue(detailData(safeUser(TARGET_ID, 3)));
    staffApiMocks.approve.mockResolvedValue(
      commandReceipt(safeUser(TARGET_ID, 2), decision()),
    );
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(
        screen.getByText(
          "تم تحميل بيانات أحدث لهذا الموظف. تم الاحتفاظ بتعديلاتك؛ راجع الحالة الحالية قبل إرسال أمر جديد.",
        ),
      ).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(departmentSelect().value).toBe("SALES");
    expect(
      screen.getByRole("button", { name: "مراجعة الحالة الحالية" }),
    ).toBeInTheDocument();
  });

  it("reuses the frozen command identity for an uncertain retry", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    staffApiMocks.approve.mockRejectedValue(new Error("network down"));
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());

    await waitFor(() => {
      expect(
        screen.getByText(
          "تعذّر تأكيد نتيجة الأمر. لم يتم تكرار الأمر؛ تحقق من النتيجة الحالية أو أعد إرسال الأمر نفسه.",
        ),
      ).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "إعادة إرسال الأمر نفسه" }),
    );
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(2);
    });
    expect(staffApiMocks.approve.mock.calls[1]?.[1]).toEqual(
      staffApiMocks.approve.mock.calls[0]?.[1],
    );
  });

  it("keeps a terminal saved command incomplete when the session scope is lost", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const reply = createDeferred<StaffCommandData>();
    staffApiMocks.approve.mockReturnValue(reply.promise);
    const onClose = vi.fn();
    const queryClient = createClient();

    renderDialog(TARGET_ID, onClose, queryClient);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });

    // The session read fails while the command is on its way. The last
    // accepted account stays published, so the staff detail keeps its scope.
    usersApiMocks.getMe.mockRejectedValue(
      apiFailure(500, "session unavailable"),
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    });
    expect(queryClient.getQueryState(AUTH_SESSION_QUERY_KEY)?.status).toBe(
      "error",
    );

    act(() => {
      reply.resolve(commandReceipt(safeUser(TARGET_ID, 2), decision()));
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "تم حفظ القرار بنجاح، لكن تعذّر تحديث البيانات المعروضة. يمكنك تحديث البيانات فقط دون إعادة إرسال الأمر.",
        ),
      ).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    expect(departmentSelect().value).toBe("SALES");
    expect(screen.queryByText(/رمز المتابعة/u)).not.toBeInTheDocument();

    // A live recovery of the same actor and epoch never upgrades an already
    // incomplete outcome.
    usersApiMocks.getMe.mockResolvedValue(adminAccount);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    });
    await flush();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const readsBefore = staffApiMocks.get.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "تحديث البيانات" }));
    await waitFor(() => {
      expect(staffApiMocks.get.mock.calls.length).toBeGreaterThan(readsBefore);
    });
    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
  });

  it("allocates a fresh command identity and the reviewed version after a review", async () => {
    staffApiMocks.get
      .mockResolvedValueOnce(detailData(pendingStaff()))
      .mockResolvedValue(
        detailData(
          safeUser(TARGET_ID, 2, {
            status: "PENDING_APPROVAL",
            department: null,
            staffApprovedAt: null,
          }),
        ),
      );
    staffApiMocks.approve.mockRejectedValueOnce(
      apiFailure(409, "تعارض في الحالة الحالية", "STAFF_ACCESS_CONFLICT"),
    );
    const onClose = vi.fn();

    renderDialog(TARGET_ID, onClose);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });
    const firstBody = staffApiMocks.approve.mock.calls[0]?.[1];

    fireEvent.click(
      screen.getByRole("button", { name: "مراجعة الحالة الحالية" }),
    );
    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledTimes(3);
    });

    staffApiMocks.approve.mockResolvedValue(
      commandReceipt(safeUser(TARGET_ID, 3), decision()),
    );
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(2);
    });
    const secondBody = staffApiMocks.approve.mock.calls[1]?.[1];

    expect(secondBody?.commandId).not.toBe(firstBody?.commandId);
    expect(secondBody?.expectedAccessVersion).toBe(2);
  });

  it("suppresses a late result of a replaced target", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const deferred = createDeferred<StaffCommandData>();
    staffApiMocks.approve.mockReturnValue(deferred.promise);
    const onClose = vi.fn();
    const queryClient = createClient();
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { rerender } = render(
      <StaffManagementDialog userId={TARGET_ID} onClose={onClose} />,
      { wrapper },
    );
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });

    rerender(
      <StaffManagementDialog
        key={OTHER_TARGET_ID}
        userId={OTHER_TARGET_ID}
        onClose={onClose}
      />,
    );
    deferred.resolve(commandReceipt(safeUser(TARGET_ID, 2), decision()));
    await flush();

    expect(onClose).not.toHaveBeenCalled();
  });

  it("suppresses a late result of another actor", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const deferred = createDeferred<StaffCommandData>();
    staffApiMocks.approve.mockReturnValue(deferred.promise);
    const onClose = vi.fn();
    const queryClient = createClient();

    renderDialog(TARGET_ID, onClose, queryClient);
    await screen.findByText("Nour Adel");

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });

    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("session-access-token", epoch, OTHER_ADMIN_ID);
    queryClient.setQueryData<AuthUserData | null>(
      AUTH_SESSION_QUERY_KEY,
      otherAdminAccount,
    );

    deferred.resolve(commandReceipt(safeUser(TARGET_ID, 2), decision()));
    await flush();

    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the retained decisions with their actor and pagination", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    staffApiMocks.decisions.mockResolvedValue({
      decisions: [
        decision(),
        decision({ id: "77777777-7777-4777-8777-777777777777" }),
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 30,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });

    renderDialog();
    await screen.findByText("Nour Adel");

    await waitFor(() => {
      expect(screen.getAllByText("Sayed Adel")).toHaveLength(2);
    });
    expect(screen.getByText("(إجمالي 30 عنصر)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => {
      expect(staffApiMocks.decisions).toHaveBeenCalledWith(
        TARGET_ID,
        { page: 2, limit: 25 },
        expect.anything(),
      );
    });
  });

  it("contains the focus, restores the trigger and explains a blocked dismissal", async () => {
    staffApiMocks.get.mockResolvedValue(detailData(pendingStaff()));
    const deferred = createDeferred<StaffCommandData>();
    staffApiMocks.approve.mockReturnValue(deferred.promise);
    const queryClient = createClient();

    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button
            type="button"
            data-testid="trigger"
            onClick={() => {
              setOpen(true);
            }}
          >
            فتح إدارة الحساب
          </button>
          {open && (
            <StaffManagementDialog
              userId={TARGET_ID}
              onClose={() => {
                setOpen(false);
              }}
            />
          )}
        </div>
      );
    };
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    render(<Harness />, { wrapper });

    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByText("Nour Adel");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName();
    await waitFor(() => {
      expect(document.activeElement).toBe(departmentSelect());
    });

    const cancelButton = screen.getByRole("button", { name: "إلغاء" });
    cancelButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(departmentSelect());

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancelButton);

    fireEvent.change(departmentSelect(), { target: { value: "SALES" } });
    fireEvent.click(approveButton());
    await waitFor(() => {
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText(
        "لا يمكن إغلاق النافذة أثناء تنفيذ الأمر. انتظر اكتمال العملية.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeDisabled();

    // A pending command owns the dialog, so the dismissal stays blocked.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    deferred.resolve(commandReceipt(safeUser(TARGET_ID, 2), decision()));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);

    // A reopened dialog closes with Escape and restores the trigger focus.
    fireEvent.click(screen.getByTestId("trigger"));
    await screen.findByText("Nour Adel");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);
  });
});
