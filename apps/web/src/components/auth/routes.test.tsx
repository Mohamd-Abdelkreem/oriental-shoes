import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AuthUserData } from "@template/contracts";
import type * as ApiClient from "@/services/api/api-client";
import type * as AuthHooks from "@/features/auth/hooks/auth.hooks";
import { useEffect, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { GuestOnlyRoute } from "./guest-only-route";
import { ProtectedRoute } from "./protected-route";

const mocks = vi.hoisted(() => ({
  loadSession: vi.fn<(signal?: AbortSignal) => Promise<AuthUserData | null>>(),
  replace: vi.fn(),
  pathname: vi.fn(() => "/auth/login"),
  search: vi.fn(() => ""),
  browserLocation: vi.fn(() => ({
    pathname: "/auth/login",
    search: "",
  })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname(),
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search()),
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
  getBrowserLocation: mocks.browserLocation,
}));

vi.mock("@/services/api/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>();
  return {
    ...actual,
    getApiError: () => ({
      message: "Session lookup failed.",
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      requestId: "request-test",
      fieldErrors: {},
    }),
  };
});

const salesUser: AuthUserData = {
  user: {
    id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
    fullName: "Template User",
    email: "user@example.com",
    phone: null,
    role: "USER",
    status: "ACTIVE",
    department: "SALES",
    staffApprovedAt: "2026-08-01T00:00:00.000Z",
    accessVersion: 1,
    emailVerifiedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  },
};

const restrictedUser: AuthUserData = {
  user: {
    ...salesUser.user,
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
  },
};

const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

const wrapper = (children: ReactNode, queryClient = createQueryClient()) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname.mockReturnValue("/auth/login");
  mocks.search.mockReturnValue("");
  mocks.browserLocation.mockReturnValue({
    pathname: "/auth/login",
    search: "",
  });
  mocks.loadSession.mockResolvedValue(null);
});

afterEach(() => {
  /**
   * The credential lifecycle is module state. Every case leaves it in the
   * initial restore policy so no case can inherit a closed gate from another.
   */
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("restored-session-token", epoch, salesUser.user.id);
});

describe("GuestOnlyRoute", () => {
  it("shows the session loader while the first lookup is pending", async () => {
    let release!: (value: AuthUserData | null) => void;
    mocks.loadSession.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>));

    expect(screen.getByText("Restoring your workspace.")).toBeInTheDocument();

    release(null);
    await waitFor(() => {
      expect(screen.getByText("Guest content")).toBeInTheDocument();
    });
  });

  it("renders anonymous-only content for an anonymous session", async () => {
    mocks.loadSession.mockResolvedValue(null);
    render(wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>));

    await waitFor(() => {
      expect(screen.getByText("Guest content")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects a business-eligible account to its safe destination", async () => {
    mocks.loadSession.mockResolvedValue(salesUser);
    render(wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/sales/dashboard");
    });
  });

  it("keeps a restored restricted account usable on the login path", async () => {
    mocks.loadSession.mockResolvedValue(restrictedUser);
    render(wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>));

    await waitFor(() => {
      expect(screen.getByText("Guest content")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("navigates when the credential lifecycle advanced before the account became current", async () => {
    /**
     * The real login flow advances the credential-lifecycle epoch first and
     * publishes the accepted account afterwards. The guard must resolve that
     * ordering and still perform its single replacement, so the epoch it
     * compares against is the current one and not a lagging render snapshot.
     */
    const queryClient = createQueryClient();
    mocks.loadSession.mockResolvedValue(null);

    render(
      wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>, queryClient),
    );

    await waitFor(() => {
      expect(screen.getByText("Guest content")).toBeInTheDocument();
    });

    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("accepted-session-token", epoch, salesUser.user.id);
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, salesUser);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/sales/dashboard");
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("keeps a permitted login return instead of the dashboard default", async () => {
    mocks.pathname.mockReturnValue("/auth/login");
    mocks.search.mockReturnValue(
      "returnTo=%2Fsales%2Faccount%3Fview%3Dprofile",
    );
    mocks.browserLocation.mockReturnValue({
      pathname: "/auth/login",
      search: "returnTo=%2Fsales%2Faccount%3Fview%3Dprofile",
    });
    mocks.loadSession.mockResolvedValue(salesUser);

    render(wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/sales/account?view=profile");
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it.each(["failed read", "same-ID replacement"] as const)(
    "rejects a rendered redirect after a live %s",
    async (intervention) => {
      const client = createQueryClient();
      client.setQueryData(AUTH_SESSION_QUERY_KEY, salesUser);
      if (intervention === "failed read")
        mocks.loadSession.mockRejectedValue(
          new Error("Session no longer confirmed"),
        );
      else mocks.loadSession.mockResolvedValue(restrictedUser);
      mocks.browserLocation.mockImplementationOnce(() => {
        if (intervention === "failed read") {
          client
            .getQueryCache()
            .find({ queryKey: AUTH_SESSION_QUERY_KEY })
            ?.setState({
              status: "error",
              error: new Error("Session no longer confirmed"),
            });
        } else {
          client.setQueryData(AUTH_SESSION_QUERY_KEY, restrictedUser);
        }
        return { pathname: "/auth/login", search: "" };
      });
      render(wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>, client));
      await waitFor(() => {
        expect(mocks.browserLocation).toHaveBeenCalled();
      });
      expect(mocks.replace).not.toHaveBeenCalled();
    },
  );

  it("discards the navigation when the live location changed", async () => {
    mocks.loadSession.mockResolvedValue(salesUser);
    mocks.browserLocation.mockReturnValue({
      pathname: "/auth/register",
      search: "",
    });

    render(wrapper(<GuestOnlyRoute>Guest content</GuestOnlyRoute>));

    await waitFor(() => {
      expect(screen.getByText("Restoring your workspace.")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("ProtectedRoute", () => {
  it("shows the session loader until the current path lookup resolves", async () => {
    let release!: (value: AuthUserData | null) => void;
    mocks.loadSession.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    mocks.pathname.mockReturnValue("/sales/dashboard");
    mocks.browserLocation.mockReturnValue({
      pathname: "/sales/dashboard",
      search: "",
    });

    render(wrapper(<ProtectedRoute>Private content</ProtectedRoute>));

    expect(screen.getByText("Restoring your workspace.")).toBeInTheDocument();
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();

    release(salesUser);
    await waitFor(() => {
      expect(screen.getByText("Private content")).toBeInTheDocument();
    });
  });

  it("redirects anonymous users with a safe return path", async () => {
    mocks.loadSession.mockResolvedValue(null);
    mocks.pathname.mockReturnValue("/admin/account");
    mocks.browserLocation.mockReturnValue({
      pathname: "/admin/account",
      search: "",
    });

    render(wrapper(<ProtectedRoute>Private content</ProtectedRoute>));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        "/auth/login?returnTo=%2Fadmin%2Faccount",
      );
    });
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  });

  it("renders protected content for an active verified account", async () => {
    mocks.loadSession.mockResolvedValue(salesUser);
    mocks.pathname.mockReturnValue("/sales/dashboard");
    mocks.browserLocation.mockReturnValue({
      pathname: "/sales/dashboard",
      search: "",
    });

    render(wrapper(<ProtectedRoute>Private content</ProtectedRoute>));

    await waitFor(() => {
      expect(screen.getByText("Private content")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("denies a business account outside its permitted root", async () => {
    mocks.loadSession.mockResolvedValue(salesUser);
    mocks.pathname.mockReturnValue("/cutting/dashboard");
    mocks.browserLocation.mockReturnValue({
      pathname: "/cutting/dashboard",
      search: "",
    });

    render(wrapper(<ProtectedRoute>Private content</ProtectedRoute>));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/unauthorized");
    });
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  });

  it("sends a restricted account to its own status surface", async () => {
    mocks.loadSession.mockResolvedValue(restrictedUser);
    mocks.pathname.mockReturnValue("/sales/dashboard");
    mocks.browserLocation.mockReturnValue({
      pathname: "/sales/dashboard",
      search: "",
    });

    render(wrapper(<ProtectedRoute>Private content</ProtectedRoute>));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/pending-approval");
    });
  });

  it("keeps the same dirty form hidden and inert through a failed session refresh and retries", async () => {
    const mounted = vi.fn();
    function Draft() {
      const { register } = useForm({ defaultValues: { name: "Original" } });
      useEffect(() => {
        mounted();
      }, []);
      return <input aria-label="Draft name" {...register("name")} />;
    }

    const client = createQueryClient();
    mocks.pathname.mockReturnValue("/sales/account");
    mocks.loadSession.mockResolvedValue(salesUser);
    const view = () =>
      wrapper(
        <ProtectedRoute>
          <Draft />
        </ProtectedRoute>,
        client,
      );
    const rendered = render(view());
    const field = await screen.findByRole("textbox", { name: "Draft name" });
    fireEvent.change(field, { target: { value: "Unsaved" } });

    const offline = new Error("offline");
    await act(async () => {
      await expect(
        client.fetchQuery({
          queryKey: AUTH_SESSION_QUERY_KEY,
          queryFn: () => Promise.reject(offline),
        }),
      ).rejects.toBe(offline);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session lookup failed.",
    );
    expect(field).not.toBeVisible();
    expect(field.closest("[inert]")).not.toBeNull();

    let finish: (value: AuthUserData | null) => void = () => undefined;
    let fail: (reason: Error) => void = () => undefined;
    mocks.loadSession.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("Restoring your workspace.")).toBeVisible();
    expect(field).not.toBeVisible();
    act(() => {
      fail(offline);
    });
    expect(await screen.findByRole("alert")).toBeVisible();

    mocks.loadSession.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    act(() => {
      finish(salesUser);
    });
    expect(await screen.findByRole("textbox", { name: "Draft name" })).toBe(
      field,
    );
    expect(field).toHaveValue("Unsaved");
    expect(mounted).toHaveBeenCalledTimes(1);

    mocks.pathname.mockReturnValue("/cutting/account");
    mocks.loadSession.mockResolvedValue(salesUser);
    rendered.rerender(view());
    expect(field).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/unauthorized");
    });
  });

  it("shows safe error feedback with a retry action", async () => {
    mocks.loadSession.mockRejectedValue(new Error("offline"));
    mocks.pathname.mockReturnValue("/sales/dashboard");
    mocks.browserLocation.mockReturnValue({
      pathname: "/sales/dashboard",
      search: "",
    });

    render(wrapper(<ProtectedRoute>Private content</ProtectedRoute>));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Session lookup failed.",
      );
    });
    expect(screen.getByText("رقم الطلب: request-test")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
