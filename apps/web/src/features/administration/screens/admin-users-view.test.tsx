import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AuthUserData, SafeUser } from "@template/contracts";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";

import { AdminUsersView } from "./admin-users-view";

const staffApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  decisions: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  suspend: vi.fn(),
  reactivate: vi.fn(),
  changeDepartment: vi.fn(),
}));

vi.mock("@/features/administration/api/staff.api", () => ({
  staffApi: staffApiMocks,
}));

const usersApiMocks = vi.hoisted(() => ({ getMe: vi.fn() }));

vi.mock("@/features/users/api/users.api", () => ({
  usersApi: usersApiMocks,
}));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_TARGET_ID = "33333333-3333-4333-8333-333333333333";

const safeUser = (
  id: string,
  accessVersion = 1,
  overrides: Readonly<Record<string, unknown>> = {},
): SafeUser => ({
  id,
  fullName: "Staff Member",
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

const listData = (
  staff: SafeUser[],
  overrides: Readonly<Record<string, unknown>> = {},
) => ({
  staff,
  pagination: {
    page: 1,
    limit: 25,
    total: staff.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  pendingCount: 0,
  ...overrides,
});

const clients: QueryClient[] = [];

const renderDirectory = (pendingOnly = false) => {
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
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<AdminUsersView pendingOnly={pendingOnly} />, { wrapper });
  return queryClient;
};

const searchInput = () =>
  screen.getByPlaceholderText("ابحث بالاسم، البريد أو رقم الهاتف...");

const openSession = (): void => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("session-access-token", epoch, ADMIN_ID);
};

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
  openSession();
});

afterEach(() => {
  while (clients.length > 0) {
    clients.pop()?.clear();
  }
});

describe("AdminUsersView", () => {
  it("keeps the rendered directory and offers a retry after a background read fails", async () => {
    staffApiMocks.list.mockResolvedValue(listData([safeUser(TARGET_ID)]));
    const client = renderDirectory();
    expect(await screen.findByText("Staff Member")).toBeVisible();
    staffApiMocks.list.mockRejectedValueOnce(
      new Error("Directory unavailable"),
    );
    await act(async () => {
      await client.refetchQueries({ queryKey: ["staff", ADMIN_ID] });
    });
    expect(
      await screen.findByText("تعذّر تحميل قائمة الموظفين."),
    ).toBeVisible();
    expect(screen.getByText("Staff Member")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => {
      expect(
        screen.queryByText("تعذّر تحميل قائمة الموظفين."),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("Staff Member")).toBeVisible();
  });

  it("reads the all scope with a fixed page size of 25", async () => {
    staffApiMocks.list.mockResolvedValue(listData([safeUser(TARGET_ID)]));

    renderDirectory();

    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledWith(
        { scope: "all", page: 1, limit: 25 },
        expect.anything(),
      );
    });
  });

  it("reads the pending scope for the pending route", async () => {
    staffApiMocks.list.mockResolvedValue(listData([safeUser(TARGET_ID)]));

    renderDirectory(true);

    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledWith(
        { scope: "pending", page: 1, limit: 25 },
        expect.anything(),
      );
    });
  });

  it("renders the whole 25 row server page without slicing it", async () => {
    const rows = Array.from({ length: 25 }, (_unused, index) =>
      safeUser(`44444444-4444-4444-8444-${String(index).padStart(12, "0")}`),
    );
    staffApiMocks.list.mockResolvedValue(
      listData(rows, {
        pagination: {
          page: 1,
          limit: 25,
          total: 60,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      }),
    );

    renderDirectory();
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(26);
    });
    expect(screen.getByText(rows[24]?.email ?? "")).toBeInTheDocument();
  });

  it("shows the filtered total apart from the global pending count", async () => {
    staffApiMocks.list.mockResolvedValue(
      listData([safeUser(TARGET_ID)], {
        pagination: {
          page: 1,
          limit: 25,
          total: 42,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
        pendingCount: 7,
      }),
    );

    renderDirectory();
    await waitFor(() => {
      expect(screen.getByText("42 حساب")).toBeInTheDocument();
    });
    expect(screen.getByText("طلبات تسجيل الموظفين (7)")).toBeInTheDocument();
    expect(screen.queryByText("42 سجل")).not.toBeInTheDocument();
  });

  it("bounds the search to the accepted 150 characters", async () => {
    staffApiMocks.list.mockResolvedValue(listData([safeUser(TARGET_ID)]));

    renderDirectory();
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(1);
    });

    const long = "س".repeat(200);
    fireEvent.change(searchInput(), { target: { value: long } });

    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(2);
    });
    const lastCall = staffApiMocks.list.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({
      scope: "all",
      search: "س".repeat(150),
      page: 1,
      limit: 25,
    });
    expect((searchInput() as HTMLInputElement).value).toHaveLength(150);
  });

  it("resets the page when the search changes", async () => {
    staffApiMocks.list.mockResolvedValue(
      listData([safeUser(TARGET_ID)], {
        pagination: {
          page: 1,
          limit: 25,
          total: 60,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      }),
    );

    renderDirectory();
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledWith(
        { scope: "all", page: 2, limit: 25 },
        expect.anything(),
      );
    });

    fireEvent.change(searchInput(), { target: { value: "shoes" } });
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledWith(
        { scope: "all", search: "shoes", page: 1, limit: 25 },
        expect.anything(),
      );
    });
  });

  it("cancels the superseded search read", async () => {
    const signals: AbortSignal[] = [];
    staffApiMocks.list.mockImplementation(
      (_query: unknown, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise(() => undefined);
      },
    );

    renderDirectory();
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(searchInput(), { target: { value: "shoes" } });
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(2);
    });
    expect(signals[0]?.aborted).toBe(true);
  });

  it("moves to the last available page after an out-of-range read", async () => {
    const rows = [safeUser(TARGET_ID)];
    staffApiMocks.list
      .mockResolvedValueOnce(
        listData(rows, {
          pagination: {
            page: 1,
            limit: 25,
            total: 60,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        listData([], {
          pagination: {
            page: 3,
            limit: 25,
            total: 60,
            totalPages: 2,
            hasNextPage: false,
            hasPreviousPage: true,
          },
        }),
      )
      .mockResolvedValue(
        listData(rows, {
          pagination: {
            page: 2,
            limit: 25,
            total: 60,
            totalPages: 2,
            hasNextPage: false,
            hasPreviousPage: true,
          },
        }),
      );

    renderDirectory();
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledWith(
        { scope: "all", page: 3, limit: 25 },
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledWith(
        { scope: "all", page: 2, limit: 25 },
        expect.anything(),
      );
    });
  });

  it("returns to the first page when the current scope has no rows", async () => {
    staffApiMocks.list
      .mockResolvedValueOnce(
        listData([safeUser(TARGET_ID)], {
          pagination: {
            page: 1,
            limit: 25,
            total: 60,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        listData([], {
          pagination: {
            page: 3,
            limit: 25,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      )
      .mockResolvedValue(
        listData([], {
          pagination: {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      );

    renderDirectory();
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledWith(
        { scope: "all", page: 1, limit: 25 },
        expect.anything(),
      );
    });
    expect(
      await screen.findByText("لا توجد حسابات موظفين"),
    ).toBeInTheDocument();
  });

  it("shows the empty state for a zero total", async () => {
    staffApiMocks.list.mockResolvedValue(listData([]));

    renderDirectory();
    await waitFor(() => {
      expect(screen.getByText("لا توجد حسابات موظفين")).toBeInTheDocument();
    });
  });

  it("shows the error state and retries the read", async () => {
    staffApiMocks.list.mockRejectedValueOnce(
      new Error("directory unavailable"),
    );

    renderDirectory();
    await waitFor(() => {
      expect(
        screen.getByText("تعذّر تحميل قائمة الموظفين."),
      ).toBeInTheDocument();
    });

    staffApiMocks.list.mockResolvedValue(listData([safeUser(TARGET_ID)]));
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2);
    });
  });

  it("opens the management dialog for a stable user id", async () => {
    staffApiMocks.list.mockResolvedValue(
      listData([
        safeUser(TARGET_ID, 1, {
          fullName: "Nour Adel",
          status: "PENDING_APPROVAL",
          department: null,
          staffApprovedAt: null,
        }),
      ]),
    );
    staffApiMocks.get.mockResolvedValue({
      staff: safeUser(TARGET_ID, 1, {
        fullName: "Nour Adel",
        status: "PENDING_APPROVAL",
        department: null,
        staffApprovedAt: null,
      }),
    });
    staffApiMocks.decisions.mockResolvedValue({
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

    renderDirectory();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "اعتماد وتعيين القسم" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "اعتماد وتعيين القسم" }),
    );

    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledWith(
        TARGET_ID,
        expect.anything(),
      );
    });
    expect(staffApiMocks.get).not.toHaveBeenCalledWith(
      expect.stringContaining("@example.com"),
      expect.anything(),
    );
    expect(await screen.findByText("Nour Adel")).toBeInTheDocument();
  });

  it("announces a confirmed staff decision once after the dialog closes", async () => {
    const staff = safeUser(TARGET_ID, 1, {
      fullName: "Nour Adel",
      status: "PENDING_APPROVAL",
      department: null,
      staffApprovedAt: null,
    });
    staffApiMocks.list.mockResolvedValue(listData([staff]));
    staffApiMocks.get.mockResolvedValue({ staff });
    staffApiMocks.decisions.mockResolvedValue({
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
    staffApiMocks.approve.mockResolvedValue({
      staff: safeUser(TARGET_ID, 2),
      decision: null,
      replayed: false,
    });

    renderDirectory();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "اعتماد وتعيين القسم" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "اعتماد وتعيين القسم" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(
      await within(dialog).findByLabelText("القسم المعتمد لهذا الموظف:"),
      { target: { value: "SALES" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "اعتماد وتعيين القسم" }),
    );

    await waitFor(() => {
      expect(screen.getByText("تم حفظ قرار الموظف بنجاح.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
  });

  it("keeps an administrator row read-only", async () => {
    staffApiMocks.list.mockResolvedValue(
      listData([
        safeUser(ADMIN_TARGET_ID, 1, {
          role: "ADMIN",
          department: null,
          staffApprovedAt: null,
        }),
      ]),
    );

    renderDirectory();
    await waitFor(() => {
      expect(screen.getByText("عرض فقط")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "إدارة الحساب" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "اعتماد وتعيين القسم" }),
    ).not.toBeInTheDocument();
  });
});
