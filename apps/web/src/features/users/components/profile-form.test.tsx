import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AuthUserData, UpdateProfileBody } from "@template/contracts";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";

import { ProfileForm } from "./profile-form";

const mocks = vi.hoisted(() => ({
  updateMe: vi.fn<(body: UpdateProfileBody) => Promise<AuthUserData>>(),
  getMe: vi.fn<(signal?: AbortSignal) => Promise<AuthUserData>>(),
}));

vi.mock("@/features/users/api/users.api", () => ({
  usersApi: { updateMe: mocks.updateMe, getMe: mocks.getMe },
}));

const account: AuthUserData = {
  user: {
    id: "0f7d2a5c-6b7d-4f5a-9f2e-5f1b3d4c5a6b",
    fullName: "Amina Salah",
    email: "amina.salah@example.com",
    phone: "+201001234567",
    role: "USER",
    status: "ACTIVE",
    department: "SALES",
    staffApprovedAt: "2026-01-02T08:00:00.000Z",
    accessVersion: 3,
    emailVerifiedAt: "2026-01-01T08:00:00.000Z",
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-02T08:00:00.000Z",
  },
};

const otherAccount: AuthUserData = {
  user: {
    ...account.user,
    id: "9a1c7e44-2f6d-4a58-9d21-6c0f1b7e8d33",
    fullName: "Karim Nabil",
    email: "karim.nabil@example.com",
  },
};

/**
 * A transport-shaped failure. The central client reads it as a server error
 * envelope, so the component observes the same error it observes in production.
 */
type ApiFailure = Error & {
  readonly isAxiosError: true;
  readonly response: {
    readonly status: number;
    readonly data: unknown;
    readonly headers: Readonly<Record<string, string>>;
  };
};

const apiFailure = (statusCode: number, message: string): ApiFailure =>
  Object.assign(new Error(message), {
    isAxiosError: true as const,
    response: {
      status: statusCode,
      data: {
        success: false,
        message,
        statusCode,
        code: "VALIDATION_ERROR",
        requestId: "request-1",
      },
      headers: {},
    },
  });

const renderProfileForm = (
  session: AuthUserData = account,
  variant: "default" | "oriental" = "default",
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData<AuthUserData | null>(
    AUTH_SESSION_QUERY_KEY,
    session,
  );
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<ProfileForm variant={variant} />, { wrapper });
  return queryClient;
};

const fullNameInput = () => screen.getByLabelText("Full name");
const phoneInput = () => screen.getByLabelText("Phone (optional)");
const saveButton = () =>
  screen.getByRole("button", { name: /Save profile|Saving/ });

/**
 * A macrotask boundary. The query client publishes its notifications in a
 * timer, so pending promise work has to reach the next task before the
 * observable state can be asserted.
 */
const flush = async (action: () => void) => {
  await act(async () => {
    action();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMe.mockResolvedValue(account);
  });

  it("keeps the edited name when the same account publishes a newer phone", async () => {
    const queryClient = renderProfileForm();
    const nameField = fullNameInput();
    fireEvent.change(nameField, { target: { value: "Amina Salah Edited" } });

    await flush(() => {
      const published: AuthUserData = {
        user: { ...account.user, phone: "+201009999999" },
      };
      queryClient.setQueryData<AuthUserData | null>(
        AUTH_SESSION_QUERY_KEY,
        published,
      );
    });

    await waitFor(() => {
      expect(phoneInput()).toHaveValue("+201009999999");
    });
    expect(nameField).toHaveValue("Amina Salah Edited");
  });

  it("sends only the changed field", async () => {
    mocks.updateMe.mockResolvedValue({
      user: { ...account.user, fullName: "Amina Salah Edited" },
    });
    renderProfileForm();
    fireEvent.change(fullNameInput(), {
      target: { value: "Amina Salah Edited" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(mocks.updateMe).toHaveBeenCalledTimes(1);
    });
    expect(mocks.updateMe.mock.calls[0]?.[0]).toStrictEqual({
      fullName: "Amina Salah Edited",
    });
  });

  it("enables the Arabic save for a name edit and marks the confirmed value clean", async () => {
    const name = "Amina Salah Edited";
    mocks.updateMe.mockResolvedValue({
      user: { ...account.user, fullName: name },
    });
    renderProfileForm(account, "oriental");
    const save = screen.getByRole("button", { name: "حفظ التعديلات" });
    const field = screen.getByLabelText("الاسم الكامل");
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: name } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(
      await screen.findByText("تم حفظ وتحديث البيانات الشخصية بنجاح."),
    ).toBeVisible();
    expect(mocks.updateMe.mock.calls).toEqual([[{ fullName: name }]]);
    expect(field).toHaveValue(name);
    expect(save).toBeDisabled();
  });

  it("sends a cleared phone as the explicit null", async () => {
    mocks.updateMe.mockResolvedValue({
      user: { ...account.user, phone: null },
    });
    renderProfileForm();
    fireEvent.change(phoneInput(), { target: { value: "" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(mocks.updateMe).toHaveBeenCalledTimes(1);
    });
    expect(mocks.updateMe.mock.calls[0]?.[0]).toStrictEqual({ phone: null });
  });

  it("sends nothing when the draft is unchanged", async () => {
    renderProfileForm();
    expect(saveButton()).toBeDisabled();

    const form = saveButton().closest("form");
    if (form === null) {
      throw new Error("the profile form is missing");
    }
    await flush(() => {
      fireEvent.submit(form);
    });

    expect(mocks.updateMe).not.toHaveBeenCalled();
  });

  it("retains the entered values after a rejected update", async () => {
    mocks.updateMe.mockRejectedValue(
      apiFailure(422, "Some submitted values are invalid."),
    );
    renderProfileForm();
    const nameField = fullNameInput();
    fireEvent.change(nameField, { target: { value: "Amina Salah Edited" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByText("Some submitted values are invalid."),
      ).toBeInTheDocument();
    });
    expect(nameField).toHaveValue("Amina Salah Edited");
    expect(phoneInput()).toHaveValue("+201001234567");
    expect(saveButton()).toBeEnabled();
  });

  it("locks the edits while the save is pending", async () => {
    const pending = Promise.withResolvers<AuthUserData>();
    mocks.updateMe.mockReturnValue(pending.promise);
    renderProfileForm();
    fireEvent.change(fullNameInput(), {
      target: { value: "Amina Salah Edited" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(fullNameInput()).toBeDisabled();
    });
    expect(phoneInput()).toBeDisabled();
    expect(saveButton()).toBeDisabled();

    await flush(() => {
      pending.resolve({
        user: { ...account.user, fullName: "Amina Salah Edited" },
      });
    });
  });

  it("marks the values clean after a confirmed save", async () => {
    mocks.updateMe.mockResolvedValue({
      user: { ...account.user, fullName: "Amina Salah Edited" },
    });
    renderProfileForm();
    const nameField = fullNameInput();
    fireEvent.change(nameField, { target: { value: "Amina Salah Edited" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText("Profile details saved.")).toBeInTheDocument();
    });
    expect(nameField).toHaveValue("Amina Salah Edited");
    expect(saveButton()).toBeDisabled();
  });

  it("discards the old account draft when another account takes over", async () => {
    const pending = Promise.withResolvers<AuthUserData>();
    mocks.updateMe.mockReturnValue(pending.promise);
    const queryClient = renderProfileForm();
    fireEvent.change(fullNameInput(), {
      target: { value: "Amina Salah Edited" },
    });
    fireEvent.click(saveButton());

    // The update of the previous account is in flight.
    await waitFor(() => {
      expect(mocks.updateMe).toHaveBeenCalledTimes(1);
    });

    await flush(() => {
      queryClient.setQueryData<AuthUserData | null>(
        AUTH_SESSION_QUERY_KEY,
        otherAccount,
      );
    });

    await waitFor(() => {
      expect(fullNameInput()).toHaveValue("Karim Nabil");
    });

    await flush(() => {
      pending.resolve({
        user: { ...account.user, fullName: "Amina Salah Edited" },
      });
    });

    expect(fullNameInput()).toHaveValue("Karim Nabil");
    expect(
      screen.queryByText("Profile details saved."),
    ).not.toBeInTheDocument();
  });
});
