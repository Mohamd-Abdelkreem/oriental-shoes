import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthNeutralData,
  AuthUserData,
  EmailRequestBody,
  RegisterBody,
} from "@template/contracts";
import type { ApiResponse } from "@/services/api/api-client";

import { RegisterForm } from "./register-form";

type RegisterMock = (body: RegisterBody) => Promise<ApiResponse<AuthUserData>>;
type VerifyMock = (token: string) => Promise<ApiResponse<AuthUserData>>;
type ResendMock = (
  body: EmailRequestBody,
) => Promise<ApiResponse<AuthNeutralData>>;

const mocks = vi.hoisted(() => ({
  register: vi.fn<RegisterMock>(),
  verifyEmail: vi.fn<VerifyMock>(),
  resendVerification: vi.fn<ResendMock>(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  authApi: {
    register: mocks.register,
    verifyEmail: mocks.verifyEmail,
    resendVerification: mocks.resendVerification,
  },
}));

const apiResponse = <T,>(data: T, statusCode = 201): ApiResponse<T> => ({
  success: true,
  statusCode,
  message: "ok",
  requestId: "request-test",
  timestamp: "2026-01-01T00:00:00.000Z",
  path: "/auth/register",
  data,
});

const pendingUser = (overrides: Partial<AuthUserData["user"]> = {}) => ({
  id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "Nour Test",
  email: "nour@example.test",
  phone: null,
  role: "USER" as const,
  status: "PENDING_VERIFICATION" as const,
  department: null,
  staffApprovedAt: null,
  accessVersion: 0,
  emailVerifiedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/**
 * A transport-shaped failure. The central transport classifies it exactly like
 * a real rejected response envelope.
 */
const apiFailure = (
  statusCode: number,
  code: string,
  message: string,
  fieldErrors: Readonly<Record<string, readonly string[]>> = {},
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
      path: "/auth/register",
      errors: Object.entries(fieldErrors).flatMap(([field, messages]) =>
        messages.map((text) => ({ field, message: text })),
      ),
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

const FULL_NAME_LABEL = /^الاسم الكامل/;
const EMAIL_LABEL = /^البريد الإلكتروني/;
const PHONE_LABEL = /^رقم الهاتف/;
const PASSWORD_LABEL = /^كلمة المرور/;

const renderRegisterForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterForm />
    </QueryClientProvider>,
  );
};

const getForm = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (form === null) throw new Error("The registration form is missing.");
  return form;
};

const fillRegistration = (
  options: {
    fullName?: string;
    email?: string;
    phone?: string;
    password?: string;
  } = {},
): void => {
  fireEvent.change(screen.getByLabelText(FULL_NAME_LABEL), {
    target: { value: options.fullName ?? "Nour Test" },
  });
  fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
    target: { value: options.email ?? "NOUR@example.test" },
  });
  if (options.phone !== undefined) {
    fireEvent.change(screen.getByLabelText(PHONE_LABEL), {
      target: { value: options.phone },
    });
  }
  fireEvent.change(screen.getByLabelText(PASSWORD_LABEL), {
    target: { value: options.password ?? "a-secure-password" },
  });
};

const submitRegistration = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "طلب تسجيل الحساب" }));
};

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.register.mockResolvedValue(
      apiResponse({ user: pendingUser({ email: "nour@example.test" }) }),
    );
  });

  it("shows the normalized email returned by the server, not the raw input", async () => {
    renderRegisterForm();
    fillRegistration();
    submitRegistration();

    await waitFor(() => {
      expect(screen.getByText("nour@example.test")).toBeInTheDocument();
    });
    expect(screen.queryByText("NOUR@example.test")).not.toBeInTheDocument();
    expect(screen.getByText(/أرسلنا رابط التحقق/)).toBeInTheDocument();
  });

  it("sends only the shared registration fields without a department or role", async () => {
    renderRegisterForm();
    fillRegistration({ phone: "+201000000000" });
    submitRegistration();

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledTimes(1);
    });
    expect(mocks.register).toHaveBeenCalledWith({
      fullName: "Nour Test",
      email: "nour@example.test",
      phone: "+201000000000",
      password: "a-secure-password",
    });
    const body = mocks.register.mock.calls[0]?.[0];
    expect(body).not.toHaveProperty("department");
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("requestedDepartment");
  });

  it("keeps an omitted phone absent and still reports the confirmed account", async () => {
    renderRegisterForm();
    fillRegistration();
    submitRegistration();

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledTimes(1);
    });
    expect(mocks.register.mock.calls[0]?.[0].phone).toBeNull();
    expect(await screen.findByText("nour@example.test")).toBeInTheDocument();
  });

  it("reports no success and keeps the input for an out-of-bounds phone", async () => {
    renderRegisterForm();
    const tooLongPhone = "0".repeat(31);
    fillRegistration({ phone: tooLongPhone });
    submitRegistration();

    await waitFor(() => {
      expect(screen.getByLabelText(PHONE_LABEL)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
    expect(mocks.register).not.toHaveBeenCalled();
    expect(screen.getByLabelText(PHONE_LABEL)).toHaveValue(tooLongPhone);
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveValue("NOUR@example.test");
    expect(screen.queryByText(/أرسلنا رابط التحقق/)).not.toBeInTheDocument();
  });

  it("reports no success and keeps the input for a duplicate email conflict", async () => {
    mocks.register.mockRejectedValue(
      apiFailure(409, "CONFLICT", "An account already exists for this email."),
    );
    renderRegisterForm();
    fillRegistration();
    submitRegistration();

    await waitFor(() => {
      expect(
        screen.getByText("An account already exists for this email."),
      ).toBeInTheDocument();
    });
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(FULL_NAME_LABEL)).toHaveValue("Nour Test");
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveValue("NOUR@example.test");
    expect(screen.getByLabelText(PASSWORD_LABEL)).toHaveValue(
      "a-secure-password",
    );
    expect(screen.queryByText(/أرسلنا رابط التحقق/)).not.toBeInTheDocument();
  });

  it("maps a server field error to the matching field and keeps the draft", async () => {
    mocks.register.mockRejectedValue(
      apiFailure(422, "VALIDATION_ERROR", "Review the fields.", {
        email: ["This email is already registered."],
      }),
    );
    renderRegisterForm();
    fillRegistration();
    submitRegistration();

    await waitFor(() => {
      expect(
        screen.getByText("This email is already registered."),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Review the fields.")).toBeInTheDocument();
    expect(screen.getByLabelText(FULL_NAME_LABEL)).toHaveValue("Nour Test");
    expect(screen.queryByText(/أرسلنا رابط التحقق/)).not.toBeInTheDocument();
  });

  it("issues a single registration while a submission is pending", async () => {
    const request = deferred<ApiResponse<AuthUserData>>();
    mocks.register.mockImplementation(() => request.promise);
    const { container } = renderRegisterForm();
    fillRegistration();

    const form = getForm(container);
    fireEvent.submit(form);
    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("button", { name: "جارٍ إنشاء الحساب…" }),
    ).toBeDisabled();

    // A repeated trigger cannot issue a second registration.
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole("button", { name: "جارٍ إنشاء الحساب…" }));
    request.resolve(
      apiResponse({ user: pendingUser({ email: "nour@example.test" }) }),
    );

    await waitFor(() => {
      expect(screen.getByText("nour@example.test")).toBeInTheDocument();
    });
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });
});
