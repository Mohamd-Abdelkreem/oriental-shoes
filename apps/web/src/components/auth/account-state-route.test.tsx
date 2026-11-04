import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { AuthUserData } from "@template/contracts";
import type * as AuthHooks from "@/features/auth/hooks/auth.hooks";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthIdentityChangedError,
  AuthReauthenticationRequiredError,
} from "@/services/api/api-client";

import { AccountStateRoute } from "./account-state-route";

const mocks = vi.hoisted(() => ({
  loadSession: vi.fn<(signal?: AbortSignal) => Promise<AuthUserData | null>>(),
  replace: vi.fn(),
  pathname: vi.fn(() => "/auth/pending-approval"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname(),
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/auth/hooks/auth.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthHooks>();
  const { useQuery, useQueryClient } = await import("@tanstack/react-query");
  const sessionQueryOptions = (queryClient: QueryClient) => ({
    queryKey: actual.sessionQueryOptions(queryClient).queryKey,
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      mocks.loadSession(signal),
    staleTime: 0,
    retry: false,
  });
  return {
    ...actual,
    loadSession: mocks.loadSession,
    sessionQueryOptions,
    useSession: (options?: Readonly<{ enabled?: boolean }>) => {
      const queryClient = useQueryClient();
      return useQuery({
        ...sessionQueryOptions(queryClient),
        enabled: options?.enabled ?? true,
      });
    },
  };
});

vi.mock("@/services/api/browser-location", () => ({
  assignBrowserLocation: vi.fn(),
  getBrowserLocation: vi.fn(() => ({
    pathname: "/auth/pending-approval",
    search: "",
  })),
}));

const pendingApproval: AuthUserData = {
  user: {
    id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
    fullName: "Template User",
    email: "user@example.com",
    phone: null,
    role: "USER",
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
    accessVersion: 1,
    emailVerifiedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  },
};

const activeAdmin: AuthUserData = {
  user: {
    ...pendingApproval.user,
    status: "ACTIVE",
    role: "ADMIN",
    department: null,
    staffApprovedAt: null,
  },
};

const wrapper = (children: ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname.mockReturnValue("/auth/pending-approval");
  mocks.loadSession.mockResolvedValue(pendingApproval);
});

describe("AccountStateRoute", () => {
  it.each([
    new AuthIdentityChangedError(),
    new AuthReauthenticationRequiredError(),
  ])("requires explicit sign-in after an initial %s", async (error) => {
    let rejectRead: (reason: Error) => void = () => undefined;
    mocks.loadSession.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRead = reject;
      }),
    );
    render(
      wrapper(
        <AccountStateRoute status="PENDING_APPROVAL">
          Pending card
        </AccountStateRoute>,
      ),
    );

    expect(screen.getByText("Restoring your workspace.")).toBeVisible();
    expect(screen.queryByText("Pending card")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.loadSession).toHaveBeenCalledTimes(1);
    });
    act(() => {
      rejectRead(error);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(error.message);
    expect(
      screen.getByRole("link", { name: "تسجيل الدخول مرة أخرى" }),
    ).toHaveAttribute("href", "/auth/login");
    expect(
      screen.queryByRole("button", { name: "إعادة المحاولة" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Pending card")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("renders only the matching private state", async () => {
    render(
      wrapper(
        <AccountStateRoute status="PENDING_APPROVAL">
          Pending card
        </AccountStateRoute>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("Pending card")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects another restricted state to its own status path", async () => {
    mocks.loadSession.mockResolvedValue({
      user: { ...pendingApproval.user, status: "SUSPENDED" },
    });

    render(
      wrapper(
        <AccountStateRoute status="PENDING_APPROVAL">
          Pending card
        </AccountStateRoute>,
      ),
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/suspended");
    });
    expect(screen.queryByText("Pending card")).not.toBeInTheDocument();
  });

  it("redirects a business-eligible identity to its workspace", async () => {
    mocks.loadSession.mockResolvedValue(activeAdmin);

    render(
      wrapper(
        <AccountStateRoute status="PENDING_APPROVAL">
          Pending card
        </AccountStateRoute>,
      ),
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/admin/dashboard");
    });
  });

  it("redirects an anonymous visitor to the login page", async () => {
    mocks.loadSession.mockResolvedValue(null);

    render(
      wrapper(
        <AccountStateRoute status="PENDING_APPROVAL">
          Pending card
        </AccountStateRoute>,
      ),
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login");
    });
  });
});
