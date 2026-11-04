import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClientModule from "@/services/api/api-client";

import { ResetPasswordForm } from "./reset-password-form";

const mocks = vi.hoisted(() => ({
  getApiError: vi.fn(),
  replaceWithLogin: vi.fn(),
  resetPassword: vi.fn(),
  searchParams: new URLSearchParams(),
  validateResetToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  authApi: {
    resetPassword: mocks.resetPassword,
    validateResetToken: mocks.validateResetToken,
  },
}));

vi.mock("@/features/auth/utils/session-navigation", () => ({
  replaceWithLogin: mocks.replaceWithLogin,
}));

vi.mock("@/services/api/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return { ...actual, getApiError: mocks.getApiError };
});

const CHECKING_TEXT = "جارٍ التحقق من رابط الاستعادة...";
const SUBMIT_LABEL = "تعيين كلمة المرور";
const NEW_PASSWORD = "CorrectHorseBatteryStaple!1";

type ApiError = ApiClientModule.ApiError;

const apiFailure = (
  statusCode: number,
  code: string,
  message = "Request failed.",
  fieldErrors: Readonly<Record<string, readonly string[]>> = {},
): ApiError => ({
  message,
  statusCode,
  code,
  requestId: "request-test",
  fieldErrors,
});

const isApiFailure = (error: unknown): error is ApiError =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  "code" in error;

const createDeferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

let queryClient: QueryClient;

const renderForm = () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ResetPasswordForm />, { wrapper });
};

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createQueryClient();
    mocks.searchParams = new URLSearchParams("token=token-a");
    mocks.getApiError.mockImplementation((error: unknown): ApiError => {
      if (isApiFailure(error)) return error;
      return apiFailure(0, "NETWORK_ERROR", "Unable to reach the server.");
    });
    mocks.validateResetToken.mockResolvedValue({ data: { valid: true } });
    mocks.resetPassword.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("checks the link before any reset form is available", async () => {
    mocks.validateResetToken.mockReturnValue(createDeferred<unknown>().promise);

    renderForm();

    expect(screen.getByText(CHECKING_TEXT)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SUBMIT_LABEL }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.validateResetToken).toHaveBeenCalledWith(
        "token-a",
        expect.anything(),
      );
    });
  });

  it("renders the reset form only after a successful link check", async () => {
    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL }),
      ).toBeInTheDocument();
    });
  });

  it("reports a missing link as unavailable without any request", () => {
    mocks.searchParams = new URLSearchParams();

    renderForm();

    expect(
      screen.getByRole("heading", { name: "الرابط غير متاح" }),
    ).toBeVisible();
    expect(mocks.validateResetToken).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: SUBMIT_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("treats a rejected 401 credential as an unavailable link", async () => {
    mocks.validateResetToken.mockRejectedValue(
      apiFailure(401, "UNAUTHORIZED", "Invalid reset token."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "الرابط غير متاح" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: SUBMIT_LABEL }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "إعادة المحاولة" }),
    ).not.toBeInTheDocument();
  });

  it("reports a valid-purpose restricted link as currently ineligible, not expired", async () => {
    mocks.validateResetToken.mockRejectedValue(
      apiFailure(403, "ACCOUNT_RESTRICTED", "Account is restricted."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "الاستعادة غير متاحة حاليًا" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/منتهي الصلاحية/u)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "العودة إلى تسجيل الدخول" }),
    ).toHaveAttribute("href", "/auth/login");
    expect(
      screen.queryByRole("button", { name: SUBMIT_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("keeps a CSRF 403 as a retryable session problem", async () => {
    mocks.validateResetToken.mockRejectedValue(
      apiFailure(403, "FORBIDDEN", "Invalid CSRF token."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "تعذر التحقق من الجلسة" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "الرابط غير متاح" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a rate-limited check retryable", async () => {
    mocks.validateResetToken.mockRejectedValue(
      apiFailure(429, "RATE_LIMIT_EXCEEDED", "Too many requests."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "تم تجاوز عدد المحاولات" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument();
  });

  it("keeps a network failure distinct from an invalid link", async () => {
    mocks.validateResetToken.mockRejectedValue(
      apiFailure(0, "NETWORK_ERROR", "Unable to reach the server."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "تعذر الاتصال بالخادم" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "الرابط غير متاح" }),
    ).not.toBeInTheDocument();
  });

  it("keeps an unavailable service distinct from an invalid link", async () => {
    mocks.validateResetToken.mockRejectedValue(
      apiFailure(503, "SERVICE_UNAVAILABLE", "Service unavailable."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "الخدمة غير متاحة مؤقتًا" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "الرابط غير متاح" }),
    ).not.toBeInTheDocument();
  });

  it("retries the current link without validation variables", async () => {
    mocks.validateResetToken.mockRejectedValueOnce(
      apiFailure(503, "SERVICE_UNAVAILABLE", "Service unavailable."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "إعادة المحاولة" }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL }),
      ).toBeInTheDocument();
    });
    expect(mocks.validateResetToken).toHaveBeenCalledTimes(2);
    expect(mocks.validateResetToken).toHaveBeenLastCalledWith(
      "token-a",
      expect.anything(),
    );
    const mutations = queryClient.getMutationCache().getAll();
    expect(mutations.length).toBeGreaterThan(0);
    for (const mutation of mutations) {
      expect(mutation.state.variables).toBeUndefined();
    }
  });

  it("ignores a late result from a replaced link", async () => {
    const first = createDeferred<unknown>();
    const second = createDeferred<unknown>();
    mocks.validateResetToken.mockImplementation((token: string) =>
      token === "token-a" ? first.promise : second.promise,
    );

    const { rerender } = renderForm();

    await waitFor(() => {
      expect(mocks.validateResetToken).toHaveBeenCalledWith(
        "token-a",
        expect.anything(),
      );
    });

    mocks.searchParams = new URLSearchParams("token=token-b");
    rerender(<ResetPasswordForm />);

    await waitFor(() => {
      expect(mocks.validateResetToken).toHaveBeenCalledWith(
        "token-b",
        expect.anything(),
      );
    });

    await act(async () => {
      await Promise.resolve();
      first.resolve({ data: { valid: true } });
    });

    expect(screen.getByText(CHECKING_TEXT)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SUBMIT_LABEL }),
    ).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
      second.resolve({ data: { valid: true } });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL }),
      ).toBeInTheDocument();
    });
  });

  it("closes a validated form when the link is replaced", async () => {
    const second = createDeferred<unknown>();
    mocks.validateResetToken.mockImplementation((token: string) =>
      token === "token-b" ? second.promise : Promise.resolve({ valid: true }),
    );

    const { rerender } = renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL }),
      ).toBeInTheDocument();
    });

    mocks.searchParams = new URLSearchParams("token=token-b");
    rerender(<ResetPasswordForm />);

    await waitFor(() => {
      expect(screen.getByText(CHECKING_TEXT)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: SUBMIT_LABEL }),
    ).not.toBeInTheDocument();
    expect(mocks.validateResetToken).toHaveBeenLastCalledWith(
      "token-b",
      expect.anything(),
    );
  });

  it("submits the current token with the parsed shared body", async () => {
    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL }),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/^كلمة المرور الجديدة/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(/^تأكيد كلمة المرور الجديدة/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledWith("token-a", {
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      });
    });
    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
  });

  it("retains the entered values after a failed reset", async () => {
    mocks.resetPassword.mockRejectedValue(
      apiFailure(400, "BAD_REQUEST", "New password is not acceptable."),
    );

    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL }),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/^كلمة المرور الجديدة/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(/^تأكيد كلمة المرور الجديدة/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "New password is not acceptable.",
      );
    });
    expect(screen.getByLabelText(/^كلمة المرور الجديدة/u)).toHaveValue(
      NEW_PASSWORD,
    );
    expect(screen.getByLabelText(/^تأكيد كلمة المرور الجديدة/u)).toHaveValue(
      NEW_PASSWORD,
    );
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
  });

  it("prevents a duplicate reset submission while the request is pending", async () => {
    renderForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL }),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/^كلمة المرور الجديدة/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(/^تأكيد كلمة المرور الجديدة/u), {
      target: { value: NEW_PASSWORD },
    });
    mocks.resetPassword.mockReturnValue(createDeferred<unknown>().promise);

    const form = document.querySelector("form");
    if (form === null) throw new Error("The reset form is not rendered.");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "جارٍ التحديث..." }),
      ).toBeDisabled();
    });

    fireEvent.submit(form);

    expect(mocks.resetPassword).toHaveBeenCalledTimes(1);
  });
});
