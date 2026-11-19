import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "./forgot-password-form";

const mocks = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  authApi: {
    forgotPassword: mocks.forgotPassword,
  },
}));

const EMAIL_LABEL = /^البريد الإلكتروني للحساب/u;
const EMAIL = "user@example.com";

const apiFailure = (
  statusCode: number,
  code: string,
  message = "Request failed.",
  fieldErrors: Readonly<Record<string, readonly string[]>> = {},
) => ({
  isAxiosError: true,
  response: {
    status: statusCode,
    headers: {},
    data: {
      success: false,
      message,
      statusCode,
      code,
      requestId: "request-test",
      errors: Object.entries(fieldErrors).flatMap(([field, messages]) =>
        messages.map((message) => ({ field, message })),
      ),
    },
  },
});

const createDeferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
  return render(<ForgotPasswordForm />, { wrapper });
};

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createQueryClient();
    mocks.forgotPassword.mockResolvedValue({
      data: {
        message:
          "إذا كان الحساب مسجّلًا ومؤهلًا للاستعادة، سيصلك رابط لإعادة تعيين كلمة المرور.",
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("shows the neutral acknowledgement without disclosing the account", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
      target: { value: EMAIL },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "إرسال رابط الاستعادة" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "إذا كان الحساب مسجّلًا ومؤهلًا للاستعادة، سيصلك رابط لإعادة تعيين كلمة المرور.",
        ),
      ).toBeInTheDocument();
    });
    expect(mocks.forgotPassword).toHaveBeenCalledWith({ email: EMAIL });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("maps a server field failure to the email input", async () => {
    mocks.forgotPassword.mockRejectedValue(
      apiFailure(422, "VALIDATION_ERROR", "Review the fields.", {
        email: ["Email not recognized."],
      }),
    );

    renderForm();

    fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
      target: { value: EMAIL },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "إرسال رابط الاستعادة" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("أدخل بريدًا إلكترونيًا صحيحًا."),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByText("راجع البيانات الموضّحة في الحقول ثم أعد المحاولة."),
    ).toBeInTheDocument();
  });

  it("retains the entered address after a failure", async () => {
    mocks.forgotPassword.mockRejectedValue(
      apiFailure(500, "INTERNAL_ERROR", "Something went wrong."),
    );

    renderForm();

    fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
      target: { value: EMAIL },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "إرسال رابط الاستعادة" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "حدث خطأ في الخادم أثناء معالجة الطلب.",
      );
    });
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveValue(EMAIL);
  });

  it("prevents a duplicate request while the request is pending", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
      target: { value: EMAIL },
    });
    mocks.forgotPassword.mockReturnValue(createDeferred<unknown>().promise);

    const form = document.querySelector("form");
    if (form === null) throw new Error("The recovery form is not rendered.");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.forgotPassword).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "جارٍ الإرسال…" }),
      ).toBeDisabled();
    });

    fireEvent.submit(form);

    expect(mocks.forgotPassword).toHaveBeenCalledTimes(1);
  });
});
