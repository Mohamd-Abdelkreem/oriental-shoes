import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AuthUserData } from "@template/contracts";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";

import { WorkspaceShell } from "./workspace-shell";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  logoutAll: vi.fn(),
  pathname: "/admin/dashboard",
  push: vi.fn(),
  refresh: vi.fn(),
  replaceWithLogin: vi.fn(),
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
      <MvpStoreProvider>
        <WorkspaceShell>
          <main>Workspace</main>
        </WorkspaceShell>
      </MvpStoreProvider>
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
        "Server sign-out could not be confirmed",
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
