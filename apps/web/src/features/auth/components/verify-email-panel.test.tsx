import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthNeutralData,
  AuthUserData,
  EmailRequestBody,
  RegisterBody,
} from "@template/contracts";
import type { ApiResponse } from "@/services/api/api-client";

import { VerifyEmailPanel } from "./verify-email-panel";

type RegisterMock = (body: RegisterBody) => Promise<ApiResponse<AuthUserData>>;
type VerifyMock = (token: string) => Promise<ApiResponse<AuthUserData>>;
type ResendMock = (
  body: EmailRequestBody,
) => Promise<ApiResponse<AuthNeutralData>>;

const mocks = vi.hoisted(() => ({
  register: vi.fn<RegisterMock>(),
  verifyEmail: vi.fn<VerifyMock>(),
  resendVerification: vi.fn<ResendMock>(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  authApi: {
    register: mocks.register,
    verifyEmail: mocks.verifyEmail,
    resendVerification: mocks.resendVerification,
  },
}));

const EMAIL_LABEL = /^البريد الإلكتروني/;

const apiResponse = <T,>(data: T, statusCode = 200): ApiResponse<T> => ({
  success: true,
  statusCode,
  message: "ok",
  requestId: "request-test",
  timestamp: "2026-01-01T00:00:00.000Z",
  path: "/auth/verify-email",
  data,
});

const verifiedEmployee = {
  id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "Nour Test",
  email: "nour@example.test",
  phone: null,
  role: "USER" as const,
  status: "PENDING_APPROVAL" as const,
  department: null,
  staffApprovedAt: null,
  accessVersion: 1,
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const verifiedAdministrator = {
  ...verifiedEmployee,
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
};

/**
 * A transport-shaped failure. The central transport classifies it exactly like
 * a real rejected response envelope.
 */
const apiFailure = (
  statusCode: number,
  code: string,
  message: string,
): Error => {
  const failure = new Error(message) as Error & {
    isAxiosError: boolean;
    response: {
      status: number;
      data: unknown;
      headers: Record<string, string>;
    };
  };
  failure.isAxiosError = true;
  failure.response = {
    status: statusCode,
    data: {
      success: false,
      statusCode,
      code,
      message,
      requestId: "request-test",
      timestamp: "2026-01-01T00:00:00.000Z",
      path: "/auth/verify-email",
    },
    headers: { "x-request-id": "request-test" },
  };
  return failure;
};

const deferred = <T,>() => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: (value: T) => {
      resolve?.(value);
    },
    reject: (reason: unknown) => {
      reject?.(reason);
    },
  };
};

const getForm = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (form === null) throw new Error("The resend form is missing.");
  return form;
};

const renderPanel = (token: string | null) => {
  mocks.searchParams = new URLSearchParams(
    token === null ? "" : `token=${token}`,
  );
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const view = () => (
    <QueryClientProvider client={queryClient}>
      <VerifyEmailPanel />
    </QueryClientProvider>
  );
  const result = render(view());
  return {
    ...result,
    setToken: (nextToken: string | null) => {
      mocks.searchParams = new URLSearchParams(
        nextToken === null ? "" : `token=${nextToken}`,
      );
      result.rerender(view());
    },
  };
};

describe("VerifyEmailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  it.each([null, ""])(
    "shows an unavailable link without requesting credential %s",
    (token) => {
      renderPanel(token);
      expect(screen.getByText(/رابط التحقق مفقود أو غير صالح/)).toBeVisible();
      expect(screen.queryByText(/جارٍ التحقق/)).not.toBeInTheDocument();
      expect(mocks.verifyEmail).not.toHaveBeenCalled();
    },
  );

  it("ignores a verification completion after the URL credential becomes empty", async () => {
    const pending = deferred<ApiResponse<AuthUserData>>();
    mocks.verifyEmail.mockReturnValue(pending.promise);
    const panel = renderPanel("valid-credential");
    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);
    });
    panel.setToken("");
    act(() => {
      pending.resolve(apiResponse({ user: verifiedEmployee }));
    });
    expect(screen.getByText(/رابط التحقق مفقود أو غير صالح/)).toBeVisible();
    expect(screen.queryByText(/تم تأكيد البريد/)).not.toBeInTheDocument();
    expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it("states that a verified employee waits for administrator review", async () => {
    mocks.verifyEmail.mockResolvedValue(
      apiResponse({ user: verifiedEmployee }),
    );
    renderPanel("token-employee");

    await waitFor(() => {
      expect(screen.getByText(/في انتظار مراجعة الإدارة/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/حسابك مفعل/)).not.toBeInTheDocument();
    expect(screen.queryByText(/حسابك نشط/)).not.toBeInTheDocument();
    expect(screen.queryByText(/قسم/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "المتابعة إلى تسجيل الدخول" }),
    ).toHaveAttribute("href", "/auth/login");
  });

  it("follows the actual result of an existing administrator verification", async () => {
    mocks.verifyEmail.mockResolvedValue(
      apiResponse({ user: verifiedAdministrator }),
    );
    renderPanel("token-administrator");

    await waitFor(() => {
      expect(
        screen.getByText(/حسابك نشط وجاهز لتسجيل الدخول/),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/في انتظار مراجعة الإدارة/),
    ).not.toBeInTheDocument();
  });

  it("keeps an expired or replayed link invalid without granting an account", async () => {
    mocks.verifyEmail.mockRejectedValue(
      apiFailure(400, "BAD_REQUEST", "The verification credential is invalid."),
    );
    renderPanel("token-expired");

    await waitFor(() => {
      expect(
        screen.getByText(/رابط التحقق مفقود أو غير صالح/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/تم تأكيد البريد/)).not.toBeInTheDocument();
    expect(screen.queryByText(/حسابك/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(EMAIL_LABEL)).toBeInTheDocument();
  });

  it("keeps a transient verification failure retryable", async () => {
    mocks.verifyEmail.mockRejectedValueOnce(
      apiFailure(503, "SERVICE_UNAVAILABLE", "The service is unavailable."),
    );
    mocks.verifyEmail.mockResolvedValue(
      apiResponse({ user: verifiedEmployee }),
    );
    renderPanel("token-transient");

    await waitFor(() => {
      expect(
        screen.getByText("The service is unavailable."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/تم تأكيد البريد/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText(/في انتظار مراجعة الإدارة/)).toBeInTheDocument();
    });
  });

  it("does not publish the result of a replaced link while the current link is pending", async () => {
    const firstLink = deferred<ApiResponse<AuthUserData>>();
    const secondLink = deferred<ApiResponse<AuthUserData>>();
    mocks.verifyEmail.mockImplementation((token) =>
      token === "token-a" ? firstLink.promise : secondLink.promise,
    );
    const { setToken } = renderPanel("token-a");

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith("token-a");
    });
    setToken("token-b");
    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith("token-b");
    });

    await act(async () => {
      firstLink.resolve(apiResponse({ user: verifiedEmployee }));
      await Promise.resolve();
    });

    expect(
      screen.queryByText(/في انتظار مراجعة الإدارة/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/حسابك/)).not.toBeInTheDocument();
    expect(screen.getByText(/جارٍ التحقق من الرابط/)).toBeInTheDocument();
  });

  it("does not let a late result for an old token overwrite the current token", async () => {
    const firstLink = deferred<ApiResponse<AuthUserData>>();
    const secondLink = deferred<ApiResponse<AuthUserData>>();
    mocks.verifyEmail.mockImplementation((token) =>
      token === "token-a" ? firstLink.promise : secondLink.promise,
    );
    const { setToken } = renderPanel("token-a");

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith("token-a");
    });
    setToken("token-b");
    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith("token-b");
    });

    await act(async () => {
      secondLink.resolve(apiResponse({ user: verifiedAdministrator }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        screen.getByText(/حسابك نشط وجاهز لتسجيل الدخول/),
      ).toBeInTheDocument();
    });

    await act(async () => {
      firstLink.resolve(apiResponse({ user: verifiedEmployee }));
      await Promise.resolve();
    });

    expect(
      screen.getByText(/حسابك نشط وجاهز لتسجيل الدخول/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/في انتظار مراجعة الإدارة/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/جارٍ التحقق من الرابط/)).not.toBeInTheDocument();
  });

  it("shows the neutral resend result and keeps the requested email", async () => {
    mocks.verifyEmail.mockRejectedValue(
      apiFailure(400, "BAD_REQUEST", "The verification credential is invalid."),
    );
    mocks.resendVerification.mockResolvedValue(
      apiResponse({
        message: "If the account exists, a verification link has been sent.",
      }),
    );
    renderPanel("token-expired");

    await waitFor(() => {
      expect(screen.getByLabelText(EMAIL_LABEL)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
      target: { value: "NOUR@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إرسال رابط جديد" }));

    await waitFor(() => {
      expect(mocks.resendVerification).toHaveBeenCalledWith({
        email: "nour@example.test",
      });
    });
    expect(
      await screen.findByText(
        "If the account exists, a verification link has been sent.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveValue("NOUR@example.test");
  });

  it("shows a resend failure and keeps the entered email", async () => {
    mocks.verifyEmail.mockRejectedValue(
      apiFailure(400, "BAD_REQUEST", "The verification credential is invalid."),
    );
    mocks.resendVerification.mockRejectedValue(
      apiFailure(429, "RATE_LIMIT_EXCEEDED", "Too many requests."),
    );
    renderPanel("token-expired");

    await waitFor(() => {
      expect(screen.getByLabelText(EMAIL_LABEL)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
      target: { value: "NOUR@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إرسال رابط جديد" }));

    expect(await screen.findByText("Too many requests.")).toBeInTheDocument();
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveValue("NOUR@example.test");
  });

  it("shows the pending resend state and prevents a duplicate resend", async () => {
    mocks.verifyEmail.mockRejectedValue(
      apiFailure(400, "BAD_REQUEST", "The verification credential is invalid."),
    );
    const pending = deferred<ApiResponse<AuthNeutralData>>();
    mocks.resendVerification.mockImplementation(() => pending.promise);
    const { container } = renderPanel("token-expired");

    await waitFor(() => {
      expect(screen.getByLabelText(EMAIL_LABEL)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
      target: { value: "nour@example.test" },
    });
    const form = getForm(container);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.resendVerification).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("button", { name: "جارٍ الإرسال…" }),
    ).toBeDisabled();

    // A repeated trigger cannot issue a second resend request.
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole("button", { name: "جارٍ الإرسال…" }));

    pending.resolve(
      apiResponse({
        message: "If the account exists, a verification link has been sent.",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(
          "If the account exists, a verification link has been sent.",
        ),
      ).toBeInTheDocument();
    });
    expect(mocks.resendVerification).toHaveBeenCalledTimes(1);
  });
});
