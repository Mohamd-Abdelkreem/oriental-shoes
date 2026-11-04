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
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";

import PendingApprovalPage from "@/app/auth/pending-approval/page";
import RejectedPage from "@/app/auth/rejected/page";
import SuspendedPage from "@/app/auth/suspended/page";
import { UnauthorizedView } from "@/features/prototype/screens/unauthorized-view";
import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  pathname: "/auth/pending-approval",
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock("@/services/api/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>();
  return {
    ...actual,
    apiClient: {
      get: mocks.get,
      patch: vi.fn(),
      post: mocks.post,
      request: vi.fn(),
    },
  };
});

const pendingApprovalUser: AuthUserData["user"] = {
  id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "حساب قيد الاعتماد",
  email: "pending@example.com",
  phone: null,
  role: "USER",
  status: "PENDING_APPROVAL",
  department: null,
  staffApprovedAt: null,
  accessVersion: 1,
  emailVerifiedAt: "2026-08-18T00:00:00.000Z",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const rejectedUser: AuthUserData["user"] = {
  ...pendingApprovalUser,
  id: "2c4e904e-a46c-4dd8-9cb7-d0767546ea95",
  email: "rejected@example.com",
  status: "REJECTED",
};

const suspendedUser: AuthUserData["user"] = {
  ...pendingApprovalUser,
  id: "3d5f904e-a46c-4dd8-9cb7-d0767546ea95",
  email: "suspended@example.com",
  status: "SUSPENDED",
};

const salesUser: AuthUserData["user"] = {
  ...pendingApprovalUser,
  id: "4e60904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "ريم خالد",
  email: "sales@example.com",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-18T00:00:00.000Z",
};

const envelope = (data: unknown, path: string): Record<string, unknown> => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
  requestId: "request-1",
  timestamp: "2026-08-18T00:00:00.000Z",
  path,
});

const sessionEnvelope = (user: AuthUserData["user"]): Record<string, unknown> =>
  envelope(
    { user, tokens: { accessToken: "restored-access-token" } },
    "/api/v1/auth/refresh",
  );

const accountEnvelope = (user: AuthUserData["user"]): Record<string, unknown> =>
  envelope({ user }, "/api/v1/users/me");

const apiError = (
  statusCode: number,
  code: string,
  message: string,
): unknown => ({
  isAxiosError: true,
  response: {
    status: statusCode,
    headers: {},
    data: {
      success: false,
      statusCode,
      code,
      message,
      requestId: "request-1",
      timestamp: "2026-08-18T00:00:00.000Z",
      path: "/api/v1/users/me",
      errors: [],
    },
  },
});

/**
 * The credential lifecycle is shared module state, so every case starts from an
 * open restore policy bound to the account it reads.
 */
const resetCredentialLifecycle = async (subjectId: string): Promise<void> => {
  const api = await import("@/services/api/api-client");
  const epoch = api.beginAuthSessionEpoch("credential-login");
  api.acceptCredentialLogin("lifecycle-reset-token", epoch, subjectId);
};

const renderWithSession = async (
  view: ReactNode,
  user: AuthUserData["user"] | null,
) => {
  await resetCredentialLifecycle(user?.id ?? "anonymous-subject");
  if (user === null) {
    mocks.post.mockRejectedValue(
      apiError(401, "UNAUTHORIZED", "Sign in required."),
    );
    mocks.get.mockRejectedValue(
      apiError(401, "UNAUTHORIZED", "Sign in required."),
    );
  } else {
    mocks.post.mockResolvedValue({ data: sessionEnvelope(user) });
    mocks.get.mockResolvedValue({ data: accountEnvelope(user) });
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MvpStoreProvider>{view}</MvpStoreProvider>
    </QueryClientProvider>,
  );
  return queryClient;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/auth/pending-approval";
});

describe("private account status surfaces", () => {
  it("renders the pending approval card only for a pending approval account", async () => {
    await renderWithSession(<PendingApprovalPage />, pendingApprovalUser);

    await waitFor(() => {
      expect(
        screen.getByText("طلبك قيد المراجعة والاعتماد"),
      ).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("hides retained private actions through refresh failure, retries, and follows the next confirmed status", async () => {
    const queryClient = await renderWithSession(
      <PendingApprovalPage />,
      pendingApprovalUser,
    );
    const title = "طلبك قيد المراجعة والاعتماد";
    const refresh = "تحديث حالة الطلب";
    await screen.findByText(title);
    let rejectRefresh: (reason: unknown) => void = () => undefined;
    mocks.get.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRefresh = reject;
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: refresh }));
    expect(await screen.findByText("Restoring your workspace.")).toBeVisible();
    expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: refresh }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "تسجيل الخروج" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "العودة لتسجيل الدخول" }),
    ).not.toBeInTheDocument();

    act(() => {
      rejectRefresh(
        apiError(
          503,
          "SERVICE_UNAVAILABLE",
          "The status lookup is unavailable.",
        ),
      );
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The status lookup is unavailable.",
    );
    expect(screen.getByText("رقم الطلب: request-1")).toBeVisible();
    expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: refresh }),
    ).not.toBeInTheDocument();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual({
      user: pendingApprovalUser,
    });

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText(title)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.get.mockResolvedValueOnce({
      data: accountEnvelope({
        ...pendingApprovalUser,
        status: "SUSPENDED",
        accessVersion: 2,
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: refresh }));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/suspended");
    });
    expect(screen.queryByText(title)).not.toBeInTheDocument();
  });

  it("blocks a rejected account from the pending approval surface", async () => {
    await renderWithSession(<PendingApprovalPage />, rejectedUser);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/rejected");
    });
    expect(
      screen.queryByText("طلبك قيد المراجعة والاعتماد"),
    ).not.toBeInTheDocument();
  });

  it("blocks a suspended account from the rejected surface", async () => {
    await renderWithSession(<RejectedPage />, suspendedUser);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/suspended");
    });
    expect(screen.queryByText("تم رفض طلب التسجيل")).not.toBeInTheDocument();
  });

  it("blocks a business eligible account from a private status surface", async () => {
    await renderWithSession(<SuspendedPage />, salesUser);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/sales/dashboard");
    });
    expect(screen.queryByText("الحساب موقوف مؤقتاً")).not.toBeInTheDocument();
  });

  it("sends an anonymous visitor to the login page", async () => {
    await renderWithSession(<RejectedPage />, null);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login");
    });
    expect(screen.queryByText("تم رفض طلب التسجيل")).not.toBeInTheDocument();
  });
});

describe("denied view authority", () => {
  it("carries no prototype link and no prototype role", async () => {
    await renderWithSession(<UnauthorizedView />, salesUser);

    await waitFor(() => {
      expect(screen.getByText("المبيعات")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("الانتقال لمركز الاختبار وتبديل الدور"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("الإدارة")).not.toBeInTheDocument();
  });

  it("shows no private account label to an anonymous visitor", async () => {
    await renderWithSession(<UnauthorizedView />, null);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "تسجيل الدخول للوصول إلى مساحة عملك",
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/أنت مسجل حالياً بدور/u)).not.toBeInTheDocument();
  });

  it("returns an authenticated account to its own approved workspace", async () => {
    await renderWithSession(<UnauthorizedView />, salesUser);

    const back = await screen.findByRole("button", {
      name: "العودة لمساحة عملي المعتمدة",
    });
    back.click();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/sales/dashboard");
    });
  });

  it("sends an anonymous visitor to the login page from the denied view", async () => {
    await renderWithSession(<UnauthorizedView />, null);

    const signIn = await screen.findByRole("button", {
      name: "تسجيل الدخول للوصول إلى مساحة عملك",
    });
    signIn.click();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/auth/login");
    });
  });
});
