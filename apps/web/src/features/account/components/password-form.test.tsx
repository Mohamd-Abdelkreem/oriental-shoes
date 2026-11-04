import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClientModule from "@/services/api/api-client";

import { PasswordForm } from "./password-form";

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  getApiError: vi.fn(),
  replaceWithLogin: vi.fn(),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  authApi: {
    changePassword: mocks.changePassword,
  },
}));

vi.mock("@/features/auth/utils/session-navigation", () => ({
  replaceWithLogin: mocks.replaceWithLogin,
}));

vi.mock("@/services/api/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return { ...actual, getApiError: mocks.getApiError };
});

const CURRENT_PASSWORD = "CurrentPassphrase!1";
const NEW_PASSWORD = "CorrectHorseBatteryStaple!1";
const SUBMIT_LABEL = "Change password";

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

const renderForm = (variant: "default" | "oriental" = "default") => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<PasswordForm variant={variant} />, { wrapper });
};

const fillValidDraft = (): void => {
  fireEvent.change(screen.getByLabelText(/^Current password/u), {
    target: { value: CURRENT_PASSWORD },
  });
  fireEvent.change(screen.getByLabelText(/^New password/u), {
    target: { value: NEW_PASSWORD },
  });
  fireEvent.change(screen.getByLabelText(/^Confirm new password/u), {
    target: { value: NEW_PASSWORD },
  });
};

describe("PasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createQueryClient();
    mocks.getApiError.mockImplementation((error: unknown): ApiError => {
      if (isApiFailure(error)) return error;
      return apiFailure(0, "NETWORK_ERROR", "Unable to reach the server.");
    });
    mocks.changePassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("rejects a mismatched confirmation before any request", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Current password/u), {
      target: { value: CURRENT_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(/^New password/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/u), {
      target: { value: "DifferentPassphrase!2" },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      expect(
        screen.getByText("Password confirmation does not match."),
      ).toBeInTheDocument();
    });
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("rejects a new password equal to the current password before any request", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Current password/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(/^New password/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/u), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      expect(
        screen.getByText("New password must differ from current password."),
      ).toBeInTheDocument();
    });
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("attributes a rejected current password to the current password field", async () => {
    mocks.changePassword.mockRejectedValue(
      apiFailure(400, "BAD_REQUEST", "Current password is not correct."),
    );

    renderForm();

    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      const fieldError = document.getElementById("currentPassword-error");
      if (fieldError === null)
        throw new Error("The current password field error is missing.");
      expect(fieldError).toHaveTextContent("Current password is not correct.");
    });
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
  });

  it("maps a server current-password field error through the shared mapper", async () => {
    mocks.changePassword.mockRejectedValue(
      apiFailure(400, "BAD_REQUEST", "Current password is not correct.", {
        "body.currentPassword": ["Current password is not correct."],
      }),
    );

    renderForm();

    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      const fieldError = document.getElementById("currentPassword-error");
      if (fieldError === null)
        throw new Error("The current password field error is missing.");
      expect(fieldError).toHaveTextContent("Current password is not correct.");
    });
  });

  it("retains the draft and claims no revocation after a failed change", async () => {
    mocks.changePassword.mockRejectedValue(
      apiFailure(500, "INTERNAL_ERROR", "The password could not be changed."),
    );

    renderForm();

    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The password could not be changed.",
      );
    });
    expect(screen.getByLabelText(/^Current password/u)).toHaveValue(
      CURRENT_PASSWORD,
    );
    expect(screen.getByLabelText(/^New password/u)).toHaveValue(NEW_PASSWORD);
    expect(screen.getByLabelText(/^Confirm new password/u)).toHaveValue(
      NEW_PASSWORD,
    );
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
    expect(screen.queryByText(/every active device/u)).not.toBeInTheDocument();
  });

  it("prevents a duplicate change while the request is pending", async () => {
    renderForm();

    fillValidDraft();
    mocks.changePassword.mockReturnValue(createDeferred<unknown>().promise);

    const form = document.querySelector("form");
    if (form === null) throw new Error("The password form is not rendered.");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.changePassword).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Changing…" })).toBeDisabled();
    });

    fireEvent.submit(form);

    expect(mocks.changePassword).toHaveBeenCalledTimes(1);
    expect(mocks.changePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
  });

  it("does not promise that every issued access token disappears", () => {
    renderForm();

    expect(
      screen.getByText(/ends this browser's session/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/signs out every active device/u),
    ).not.toBeInTheDocument();
  });

  it("states the same truthful revocation limit in the oriental variant", () => {
    renderForm("oriental");

    expect(
      screen.getByText(/تبقى رموز الوصول الصادرة سارية/u),
    ).toBeInTheDocument();
  });
});
