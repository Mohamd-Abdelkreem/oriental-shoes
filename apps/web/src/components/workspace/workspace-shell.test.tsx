import { renderWithToast as render } from "@/test/render-with-toast";
import { administrationCommandSessionSchema } from "@/features/administration/model/administration-command-state";
import {
  p08CorrectionCommandFixture,
  p08DetailFixture,
  p08DraftDetailFixture,
} from "@/test/p08-fixtures";
import {
  readAdministrationOperationalScope,
  administrationScopeKey,
} from "@/shared/query/operational-scope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AuthUserData } from "@template/contracts";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";

import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { readOperationalScope } from "@/shared/query/operational-scope";

import { WorkspaceShell } from "./workspace-shell";

import { apiClient } from "@/services/api/api-client";
import { orderFixture, p03Envelope, p03Ids } from "@/test/p03-fixtures";
import { QualityWorkspace } from "@/features/manufacturing/screens/quality-workspace";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  pathname: "/admin/dashboard",
  push: vi.fn(),
  refresh: vi.fn(),
  replaceWithLogin: vi.fn(),
}));

vi.mock("@/features/sales/api/orders.api", () => ({
  ordersApi: { dashboard: mocks.dashboard },
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/components/auth/session-loader", () => ({
  SessionLoader: () => <div>Loading session</div>,
}));
vi.mock("@/features/auth/api/auth.api", () => ({
  authApi: {
    logout: mocks.logout,
    logoutAll: mocks.logoutAll,
    refresh: mocks.refresh,
  },
}));
vi.mock("@/features/auth/utils/session-navigation", () => ({
  replaceWithLogin: mocks.replaceWithLogin,
}));

const adminAccount: AuthUserData = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    fullName: "مدير النظام",
    email: "admin@example.com",
    phone: null,
    role: "ADMIN",
    status: "ACTIVE",
    department: null,
    staffApprovedAt: null,
    accessVersion: 1,
    emailVerifiedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
};

const salesAccount: AuthUserData = {
  user: {
    ...adminAccount.user,
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "ريم خالد",
    email: "sales@example.com",
    role: "USER",
    department: "SALES",
    staffApprovedAt: "2026-08-01T00:00:00.000Z",
  },
};

const restrictedAccount: AuthUserData = {
  user: {
    ...salesAccount.user,
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
  },
};

const renderShell = (account: AuthUserData | null) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceShell>
        <main>Workspace</main>
      </WorkspaceShell>
    </QueryClientProvider>,
  );
  return { queryClient, view };
};

const signOutButton = () =>
  screen.getByRole("button", { name: "تسجيل الخروج" });

describe("WorkspaceShell session control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/admin/dashboard";
    mocks.logout.mockResolvedValue(undefined);
    mocks.logoutAll.mockResolvedValue(undefined);
    mocks.refresh.mockResolvedValue(undefined);
  });

  it("replaces the page with login only after server logout succeeds", async () => {
    renderShell(adminAccount);

    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(mocks.replaceWithLogin).toHaveBeenCalled();
    });
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it("shows an actionable failure without navigating and permits retry", async () => {
    mocks.logout.mockRejectedValue(new Error("network"));
    renderShell(adminAccount);

    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "تعذر تأكيد تسجيل الخروج من الخادم",
      );
    });
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();

    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledTimes(2);
    });
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
  });

  it("lets an admin open every department from the project header", () => {
    renderShell(adminAccount);

    const sectionPicker = screen.getByRole("combobox", {
      name: "الانتقال إلى قسم",
    });
    expect(screen.getAllByRole("option")).toHaveLength(7);
    fireEvent.change(sectionPicker, { target: { value: "quality" } });
    expect(mocks.push).toHaveBeenCalledWith("/quality/dashboard");
  });

  it("shows the department picker only to an admin account", () => {
    renderShell(salesAccount);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("derives the disabled loading state from the mutation", async () => {
    let release!: () => void;
    mocks.logout.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    renderShell(adminAccount);

    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(signOutButton()).toBeDisabled();
    });

    release();
    await waitFor(() => {
      expect(mocks.replaceWithLogin).toHaveBeenCalled();
    });
  });

  it("presents the employee's own department instead of the pathname section", () => {
    mocks.pathname = "/quality/dashboard";
    renderShell(salesAccount);

    expect(screen.getAllByText("لوحة المبيعات").length).toBeGreaterThan(0);
    expect(screen.queryByText("لوحة الجودة والتغليف")).not.toBeInTheDocument();
  });

  it("follows the guarded route for an administrator's selected section", () => {
    mocks.pathname = "/quality/dashboard";
    renderShell(adminAccount);

    expect(screen.getAllByText("لوحة الجودة والتغليف").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("لوحة المبيعات")).not.toBeInTheDocument();
  });

  it("presents the current account name of the session", () => {
    renderShell(salesAccount);

    expect(screen.getAllByText("ريم خالد").length).toBeGreaterThan(0);
  });

  it("presents no private account for an account without business access", () => {
    renderShell(restrictedAccount);

    expect(screen.getByText("Loading session")).toBeInTheDocument();
    expect(screen.queryByText("ريم خالد")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("presents no workspace for an anonymous session", () => {
    renderShell(null);

    expect(screen.getByText("Loading session")).toBeInTheDocument();
    expect(
      screen.queryByText("العودة لمساحة عملي المعتمدة"),
    ).not.toBeInTheDocument();
  });

  it("presents the refreshed current account", async () => {
    const { queryClient } = renderShell(salesAccount);

    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { ...salesAccount.user, fullName: "ريم خالد المحدثة" },
    });

    await waitFor(() => {
      expect(screen.getAllByText("ريم خالد المحدثة").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("ريم خالد")).not.toBeInTheDocument();
  });
});

const dashboardCounts = (drafts: number, returned: number) => ({
  counts: {
    totalOrders: drafts + returned,
    totalPieces: drafts + returned,
    drafts,
    draftPieces: drafts,
    returned,
    awaitingApproval: 0,
    approved: 0,
  },
  recentOrders: [],
});
const salesBadge = (label: string) =>
  within(screen.getByRole("link", { name: new RegExp(label) }));
const selectSalesIdentity = (account = salesAccount) => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic-shell-token", epoch, account.user.id);
};

describe("WorkspaceShell authoritative sales badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/sales/orders";
    selectSalesIdentity();
  });
  afterEach(() => {
    beginAuthSessionEpoch("confirmed-ending");
  });

  it("hides local counts while pending, refreshes confirmed counts and hides failed reads", async () => {
    let resolveDashboard!: (value: ReturnType<typeof dashboardCounts>) => void;
    mocks.dashboard.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDashboard = resolve;
      }),
    );
    const { queryClient } = renderShell(salesAccount);
    expect(salesBadge("المسودات").queryByText("1")).not.toBeInTheDocument();
    expect(
      salesBadge("طلبات معادة للتعديل").queryByText("1"),
    ).not.toBeInTheDocument();
    act(() => {
      resolveDashboard(dashboardCounts(7, 3));
    });
    expect(await salesBadge("المسودات").findByText("7")).toBeInTheDocument();
    expect(
      salesBadge("طلبات معادة للتعديل").getByText("3"),
    ).toBeInTheDocument();
    const scope = readOperationalScope(queryClient);
    if (!scope) throw new Error("Expected current sales scope");
    mocks.dashboard.mockResolvedValueOnce(dashboardCounts(0, 2));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: customerKeys.root(scope),
      });
    });
    await waitFor(() =>
      expect(salesBadge("المسودات").queryByText("7")).not.toBeInTheDocument(),
    );
    expect(
      await salesBadge("طلبات معادة للتعديل").findByText("2"),
    ).toBeInTheDocument();
    mocks.dashboard.mockRejectedValueOnce(new Error("Unavailable dashboard"));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: customerKeys.root(scope),
      });
    });
    await waitFor(() =>
      expect(
        salesBadge("طلبات معادة للتعديل").queryByText("2"),
      ).not.toBeInTheDocument(),
    );
    queryClient.clear();
  });

  it("hides prior actor counts and rejects a delayed old reply after account switch", async () => {
    mocks.dashboard.mockResolvedValueOnce(dashboardCounts(7, 3));
    const { queryClient } = renderShell(salesAccount);
    expect(await salesBadge("المسودات").findByText("7")).toBeInTheDocument();
    let resolveOld!: (value: ReturnType<typeof dashboardCounts>) => void;
    mocks.dashboard.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const scope = readOperationalScope(queryClient);
    if (!scope) throw new Error("Expected current sales scope");
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = queryClient.invalidateQueries({
        queryKey: customerKeys.root(scope),
      });
    });
    await waitFor(() => {
      expect(mocks.dashboard).toHaveBeenCalledTimes(2);
    });
    const other = {
      user: {
        ...salesAccount.user,
        id: "33333333-3333-4333-8333-333333333333",
        fullName: "Other sales",
      },
    };
    let resolveOther!: (value: ReturnType<typeof dashboardCounts>) => void;
    mocks.dashboard.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOther = resolve;
      }),
    );
    act(() => {
      selectSalesIdentity(other);
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, other);
    });
    await waitFor(() =>
      expect(salesBadge("المسودات").queryByText("7")).not.toBeInTheDocument(),
    );
    await act(async () => {
      resolveOld(dashboardCounts(9, 9));
      await refreshing;
    });
    expect(salesBadge("المسودات").queryByText("9")).not.toBeInTheDocument();
    act(() => {
      resolveOther(dashboardCounts(2, 0));
    });
    expect(await salesBadge("المسودات").findByText("2")).toBeInTheDocument();
    expect(
      salesBadge("طلبات معادة للتعديل").queryByText("3"),
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it("does not request sales counts outside the guarded sales shell", () => {
    mocks.pathname = "/admin/dashboard";
    selectSalesIdentity(adminAccount);
    const { queryClient } = renderShell(adminAccount);
    expect(mocks.dashboard).not.toHaveBeenCalled();
    queryClient.clear();
  });
});
it("shares the Quality dashboard with the shell and hides unavailable badges instead of using prototype counts", async () => {
  mocks.pathname = "/quality/dashboard";
  const account: AuthUserData = {
    user: { ...salesAccount.user, department: "QUALITY" },
  };
  selectSalesIdentity(account);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
  let release: (value: unknown) => void = () => undefined;
  const gate = new Promise<unknown>((resolve) => {
      release = resolve;
    }),
    get = vi.spyOn(apiClient, "get").mockImplementation(() => gate);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceShell>
        <QualityWorkspace />
      </WorkspaceShell>
    </QueryClientProvider>,
  );
  try {
    const incoming = within(screen.getByRole("link", { name: /وارد للجودة/ }));
    expect(incoming.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
    await act(async () => {
      release(
        p03Envelope({
          department: "QUALITY",
          counts: {
            incoming: { orders: 2, pieces: 37 },
            inspection: { orders: 0, pieces: 0 },
            accepted: { orders: 0, pieces: 0 },
            corrections: { orders: 1, pieces: 7 },
          },
          recentOrders: [],
        }),
      );
      await gate;
    });
    expect(await incoming.findByText("37")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("link", { name: /دورات التصحيح/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("دورات التصحيح الجارية")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /دورات التصحيح/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "محطة الفحص والتغليف" }),
    ).toBeInTheDocument();
  } finally {
    release(p03Envelope({}));
    await gate;
    view.unmount();
    queryClient.clear();
    get.mockRestore();
    beginAuthSessionEpoch("confirmed-ending");
  }
});

const adminDashboard = () => ({
  generatedAt: "2026-11-16T00:00:00.000Z",
  businessDate: "2026-11-16",
  counts: {
    totalOrders: 20,
    activeOrders: 13,
    pendingApproval: 2,
    activeCorrections: 5,
    openCorrectionOrders: 1,
    deliveryExceptions: 3,
    pendingUsers: 0,
    readyOrders: 1,
    overdueOrders: 1,
    failedDeliveries: 1,
    activePieces: 37,
    pendingApprovalPieces: 7,
    overduePieces: 2,
    readyPieces: 3,
  },
  departments: [],
  recentOrders: [],
});
const departmentDashboard = (role: string) => {
  const queue = { orders: 2, pieces: 37 };
  if (role === "admin") return adminDashboard();
  if (role === "approval")
    return {
      counts: {
        initialOrders: 2,
        approvalIssues: 3,
        salesContactPieces: 4,
        reapprovalPieces: 5,
        unresolvedIssues: 12,
        approvedToday: 1,
        returnedOrders: 1,
      },
      recentOrders: [],
    };
  if (role === "quality")
    return {
      department: "QUALITY",
      counts: {
        incoming: queue,
        inspection: queue,
        accepted: queue,
        corrections: queue,
      },
      recentOrders: [],
    };
  if (role === "warehouse")
    return {
      counts: {
        incoming: queue,
        incomplete: queue,
        ready: queue,
        outForDelivery: queue,
        deliveryFailed: queue,
        delivered: queue,
      },
    };
  return {
    department: role === "cutting" ? "CUTTING" : "PRODUCTION",
    counts: {
      incoming: queue,
      inProgress: queue,
      returned: queue,
      completed: queue,
      repairs: role === "cutting" ? { orders: 0, pieces: 0 } : queue,
    },
    recentOrders: [],
  };
};
it.each([
  ["admin", null, "جميع الطلبات", "13"],
  ["sales", "SALES", "المسودات", "7"],
  ["approval", "APPROVAL", "بانتظار الاعتماد", "2"],
  ["cutting", "CUTTING", "وارد للقص", "37"],
  ["production", "PRODUCTION", "وارد للإنتاج", "37"],
  ["quality", "QUALITY", "وارد للجودة", "37"],
  ["warehouse", "WAREHOUSE", "طلبات غير مكتملة بالمصنع", "2"],
] as const)(
  "composes real %s shell without MVP provider and shows the owning count unit",
  async (role, department, label, count) => {
    const account: AuthUserData = {
      user: {
        ...adminAccount.user,
        fullName: `Current ${role} account`,
        role: role === "admin" ? "ADMIN" : "USER",
        department,
        staffApprovedAt:
          department === null ? null : "2026-08-01T00:00:00.000Z",
      },
    };
    mocks.pathname = `/${role}/dashboard`;
    selectSalesIdentity(account);
    mocks.dashboard.mockResolvedValue(dashboardCounts(7, 0));
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue(p03Envelope(departmentDashboard(role)));
    const storage = vi.spyOn(Storage.prototype, "getItem");
    const { queryClient, view } = renderShell(account);
    try {
      expect(
        await within(
          screen.getByRole("link", { name: new RegExp(label) }),
        ).findByText(count),
      ).toBeInTheDocument();
      if (role === "production")
        expect(
          screen.queryByRole("link", { name: /طلبات الإصلاح/u }),
        ).not.toBeInTheDocument();
      if (role === "sales") expect(mocks.dashboard).toHaveBeenCalledTimes(1);
      else expect(get).toHaveBeenCalledTimes(1);
      expect(storage).not.toHaveBeenCalledWith(
        "oriental-shoes-mvp-v11-per-piece",
      );
    } finally {
      view.unmount();
      queryClient.clear();
      get.mockRestore();
      storage.mockRestore();
      beginAuthSessionEpoch("confirmed-ending");
    }
  },
);
it("shows the business order number in the review breadcrumb once loaded", async () => {
  const order = orderFixture();
  mocks.pathname = `/approval/orders/${p03Ids.order}`;
  selectSalesIdentity(adminAccount);
  const get = vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
    await Promise.resolve();
    if (path === `/approvals/orders/${order.id}`)
      return p03Envelope({
        order,
        workflow: {
          initialApproval: null,
          currentReturn: null,
          allowedActions: { canApproveInitial: true, canReturnInitial: true },
          printEligibility: { allowed: false, reason: "NOT_APPROVED" },
          issues: [],
        },
      });
    return p03Envelope(departmentDashboard("approval"));
  });
  const { queryClient, view } = renderShell(adminAccount);
  try {
    const crumbs = screen.getByRole("navigation", { name: "مسار التنقل" });
    expect(within(crumbs).getByText("مراجعة أمر التفصيل")).toBeVisible();
    expect(crumbs).not.toHaveTextContent(order.id);
    expect(await within(crumbs).findByText(order.businessNumber)).toBeVisible();
    expect(crumbs).not.toHaveTextContent(order.id);
  } finally {
    view.unmount();
    queryClient.clear();
    get.mockRestore();
    beginAuthSessionEpoch("confirmed-ending");
  }
});

it.each(["draft", "submitted"] as const)(
  "shows the public reference for %s admin order breadcrumbs",
  async (kind) => {
    const detail =
      kind === "draft" ? p08DraftDetailFixture() : p08DetailFixture();
    if (detail.kind === "draft") detail.draft.draftSequence = "17";
    const id = detail.kind === "draft" ? detail.draft.id : detail.order.id;
    const reference =
      detail.kind === "draft" ? "DRAFT-017" : detail.order.businessNumber;
    mocks.pathname = `/admin/orders/${id}`;
    selectSalesIdentity(adminAccount);
    const get = vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      await Promise.resolve();
      return p03Envelope(path === `/administration/orders/${id}` ? detail : {});
    });
    const { queryClient, view } = renderShell(adminAccount);
    try {
      const crumbs = screen.getByRole("navigation", { name: "مسار التنقل" });
      expect(crumbs).not.toHaveTextContent(id);
      expect(
        await within(crumbs).findByText(`تفاصيل الطلب (${reference})`),
      ).toBeVisible();
      expect(crumbs).not.toHaveTextContent(id);
    } finally {
      view.unmount();
      queryClient.clear();
      get.mockRestore();
      beginAuthSessionEpoch("confirmed-ending");
    }
  },
);

it("keeps ADMIN recovery visible across factory presentation and withholds it after employee identity change", async () => {
  mocks.pathname = "/quality/dashboard";
  selectSalesIdentity(adminAccount);
  const get = vi
    .spyOn(apiClient, "get")
    .mockResolvedValue(p03Envelope(departmentDashboard("quality")));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, adminAccount);
  const scope = readAdministrationOperationalScope(queryClient);
  if (!scope) throw new Error("Expected current admin");
  const body = p08CorrectionCommandFixture().body;
  queryClient.setQueryData(
    [...administrationScopeKey(scope), "command-session"],
    administrationCommandSessionSchema.parse({
      phase: "unknown",
      originScope: scope,
      body,
      failure: {
        message: "Unknown",
        statusCode: 0,
        code: "NETWORK_ERROR",
        requestId: "",
        fieldErrors: {},
      },
    }),
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceShell>
        <p>Production content</p>
      </WorkspaceShell>
    </QueryClientProvider>,
  );
  try {
    expect(
      await screen.findByRole("button", { name: "التحقق من النتيجة الأصلية" }),
    ).toBeInTheDocument();
    const employee: AuthUserData = {
      user: { ...salesAccount.user, department: "QUALITY" },
    };
    act(() => {
      selectSalesIdentity(employee);
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, employee);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "التحقق من النتيجة الأصلية" }),
      ).not.toBeInTheDocument();
    });
  } finally {
    view.unmount();
    queryClient.clear();
    get.mockRestore();
    beginAuthSessionEpoch("confirmed-ending");
  }
});
