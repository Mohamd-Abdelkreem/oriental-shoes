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
import { useEffect, useRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  location: { pathname: "/auth/login", search: "" },
  pathname: "/auth/login",
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/services/api/browser-location", () => ({
  assignBrowserLocation: vi.fn(),
  getBrowserLocation: () => mocks.location,
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

const restrictedUser: AuthUserData["user"] = {
  id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "حساب قيد الاعتماد",
  email: "restricted@example.com",
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

const salesUser: AuthUserData["user"] = {
  ...restrictedUser,
  id: "2c4e904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "ريم خالد",
  email: "sales@example.com",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-18T00:00:00.000Z",
};

const qualityUser: AuthUserData["user"] = {
  ...salesUser,
  id: "3d5f904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "منى سعيد",
  email: "quality@example.com",
  department: "QUALITY",
};

const adminUser: AuthUserData["user"] = {
  ...restrictedUser,
  id: "4e60904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "مدير النظام",
  email: "admin@example.com",
  role: "ADMIN",
  status: "ACTIVE",
};

const pendingVerificationUser: AuthUserData["user"] = {
  ...restrictedUser,
  id: "5f70904e-a46c-4dd8-9cb7-d0767546ea95",
  status: "PENDING_VERIFICATION",
  emailVerifiedAt: null,
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
    { user, tokens: { accessToken: "accepted-access-token" } },
    "/api/v1/auth/login",
  );

const accountEnvelope = (user: AuthUserData["user"]): Record<string, unknown> =>
  envelope({ user }, "/api/v1/users/me");

/**
 * A controlled server failure. The shape mirrors an API error envelope, so the
 * real error reader applies it without any test-only shortcut.
 */
class MockApiError extends Error {
  readonly isAxiosError = true;
  readonly response: Readonly<{
    status: number;
    data: Readonly<{
      success: false;
      statusCode: number;
      code: string;
      message: string;
      requestId: string;
      errors: unknown;
    }>;
  }>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    errors: unknown = [],
  ) {
    super(message);
    this.name = "MockApiError";
    this.response = {
      status: statusCode,
      data: {
        success: false,
        statusCode,
        code,
        message,
        requestId: "request-1",
        errors,
      },
    };
  }
}

const apiError = (
  statusCode: number,
  code: string,
  message: string,
  errors: unknown = [],
): MockApiError => new MockApiError(statusCode, code, message, errors);

/**
 * A fresh credential-lifecycle boundary. The session module is re-evaluated so
 * every case starts from its own epoch and restore policy.
 */
const loadLoginBoundary = async () => {
  vi.resetModules();
  const [loginForm, guestRoute, hooks] = await Promise.all([
    import("@/features/auth/components/login-form"),
    import("@/components/auth/guest-only-route"),
    import("@/features/auth/hooks/auth.hooks"),
  ]);
  return {
    AUTH_SESSION_QUERY_KEY: hooks.AUTH_SESSION_QUERY_KEY,
    GuestOnlyRoute: guestRoute.GuestOnlyRoute,
    LoginForm: loginForm.LoginForm,
    useSession: hooks.useSession,
  };
};

type Boundary = Awaited<ReturnType<typeof loadLoginBoundary>>;

const LIFECYCLE_SUBJECT_ID = "00000000-0000-4000-8000-000000000000";

/**
 * The credential lifecycle is shared module state, so every case starts from an
 * open restore policy. A closed policy from an earlier case would otherwise
 * decide the outcome of the next one.
 */
const resetCredentialLifecycle = async (
  subjectId: string = LIFECYCLE_SUBJECT_ID,
): Promise<void> => {
  const api = await import("@/services/api/api-client");
  if (api.getAuthSessionRestorePolicy() === "restore") return;
  const epoch = api.beginAuthSessionEpoch("credential-login");
  api.acceptCredentialLogin("lifecycle-reset-token", epoch, subjectId);
};

const renderBoundary = async (
  options: Readonly<{
    session?: AuthUserData["user"] | null;
    returnTo?: string | null;
    pathname?: string;
    interfere?: () => void;
  }> = {},
) => {
  const boundary = await loadLoginBoundary();
  await resetCredentialLifecycle(options.session?.id ?? LIFECYCLE_SUBJECT_ID);
  const search =
    options.returnTo === undefined || options.returnTo === null
      ? ""
      : `returnTo=${encodeURIComponent(options.returnTo)}`;
  mocks.pathname = options.pathname ?? "/auth/login";
  mocks.search = search;
  mocks.location = { pathname: mocks.pathname, search };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(
    boundary.AUTH_SESSION_QUERY_KEY,
    options.session === undefined || options.session === null
      ? null
      : { user: options.session },
  );

  const children =
    options.interfere === undefined
      ? null
      : interferenceChild(boundary.useSession, options.interfere);

  const view = render(
    <QueryClientProvider client={queryClient}>
      {children}
      <boundary.GuestOnlyRoute>
        <boundary.LoginForm />
      </boundary.GuestOnlyRoute>
    </QueryClientProvider>,
  );

  return { ...boundary, queryClient, view };
};

const fillCredentials = (email = "sales@example.com"): void => {
  fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("كلمة المرور"), {
    target: { value: "CorrectHorseBatteryStaple!1" },
  });
};

const submitForm = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
};

const emailField = (): HTMLElement =>
  screen.getByLabelText("البريد الإلكتروني");

/**
 * A reached child that runs before the guard's own navigation effect. It lets a
 * case change the canonical cache object, the live URL or the credential
 * lifecycle between the accepted publication and the guard's decision.
 */
const interferenceChild = (
  useSession: Boundary["useSession"],
  interfere: () => void,
): ReactNode => {
  const Interference = () => {
    const session = useSession();
    const applied = useRef(false);
    useEffect(() => {
      if (applied.current) return;
      if (session.data === null || session.data === undefined) return;
      applied.current = true;
      interfere();
    }, [session.data]);
    return null;
  };
  return <Interference />;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/auth/login";
  mocks.search = "";
  mocks.location = { pathname: "/auth/login", search: "" };
  mocks.post.mockResolvedValue({ data: sessionEnvelope(salesUser) });
  mocks.get.mockResolvedValue({ data: accountEnvelope(salesUser) });
});

describe("LoginForm credential boundary", () => {
  it("applies safe server field errors to the corresponding input", async () => {
    mocks.post.mockRejectedValue(
      apiError(422, "VALIDATION_ERROR", "Review the fields.", [
        { field: "body.email", message: "Email not recognized." },
      ]),
    );
    await renderBoundary();

    fillCredentials("user@example.com");
    submitForm();

    await waitFor(() => {
      expect(screen.getByText("Email not recognized.")).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the draft and stays usable after rejected credentials", async () => {
    mocks.post.mockRejectedValue(
      apiError(401, "INVALID_CREDENTIALS", "Email or password is wrong."),
    );
    const { queryClient, AUTH_SESSION_QUERY_KEY } = await renderBoundary();

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Email or password is wrong.",
      );
    });
    expect(emailField()).toHaveValue("sales@example.com");
    expect(screen.getByLabelText("كلمة المرور")).toHaveValue(
      "CorrectHorseBatteryStaple!1",
    );
    expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });

  it("keeps a restored restricted account able to choose another account", async () => {
    await renderBoundary({ session: restrictedUser });

    expect(emailField()).not.toBeDisabled();
    fireEvent.change(emailField(), { target: { value: "other@example.com" } });
    expect(emailField()).toHaveValue("other@example.com");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the draft through a deferred account read and lands on the allowed return", async () => {
    let releaseAccount!: (value: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        releaseAccount = resolve;
      }),
    );
    await renderBoundary({ returnTo: "/sales/account?view=profile" });

    const reachedInput = emailField();
    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledTimes(1);
    });
    expect(mocks.post.mock.calls[0]?.[0]).toBe("/auth/login");
    expect(reachedInput).toHaveValue("sales@example.com");
    expect(emailField()).toBe(reachedInput);
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(() => {
      releaseAccount({ data: accountEnvelope(salesUser) });
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).toHaveBeenCalledWith("/sales/account?view=profile");
    expect(mocks.replace).not.toHaveBeenCalledWith("/sales/dashboard");
  });

  it("lands on the account's own default when no return is present", async () => {
    await renderBoundary();

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).toHaveBeenCalledWith("/sales/dashboard");
  });

  it.each([
    ["an unsafe return", "//evil.example.com/x"],
    ["an external return", "https://evil.example.com/x"],
    ["a credential-bearing return", "/sales/account?token=abc"],
    ["a wrong-department return", "/quality/dashboard"],
  ])("falls back to the account default for %s", async (_label, returnTo) => {
    await renderBoundary({ returnTo });

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).toHaveBeenCalledWith("/sales/dashboard");
  });

  it("keeps an administrator's agreed cross-department return", async () => {
    mocks.post.mockResolvedValue({ data: sessionEnvelope(adminUser) });
    mocks.get.mockResolvedValue({ data: accountEnvelope(adminUser) });
    await renderBoundary({ returnTo: "/quality/dashboard" });

    fillCredentials("admin@example.com");
    submitForm();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).toHaveBeenCalledWith("/quality/dashboard");
  });

  it.each([
    ["PENDING_APPROVAL", restrictedUser, "/auth/pending-approval"],
    ["PENDING_VERIFICATION", pendingVerificationUser, "/auth/verify-email"],
  ])(
    "sends a %s account to its own status surface",
    async (_label, user, target) => {
      mocks.post.mockResolvedValue({ data: sessionEnvelope(user) });
      mocks.get.mockResolvedValue({ data: accountEnvelope(user) });
      await renderBoundary();

      fillCredentials();
      submitForm();

      await waitFor(() => {
        expect(mocks.replace).toHaveBeenCalledTimes(1);
      });
      expect(mocks.replace).toHaveBeenCalledWith(target);
    },
  );

  it("navigates two restricted credentials to the same card in one auth layout", async () => {
    const second = {
      ...restrictedUser,
      id: "99999999-9999-4999-8999-999999999999",
      email: "second@example.com",
    };
    mocks.post
      .mockResolvedValueOnce({ data: sessionEnvelope(restrictedUser) })
      .mockResolvedValueOnce({ data: sessionEnvelope(second) });
    mocks.get
      .mockResolvedValueOnce({ data: accountEnvelope(restrictedUser) })
      .mockResolvedValueOnce({ data: accountEnvelope(second) });
    const boundary = await renderBoundary();
    const enter = (pathname: string, child: ReactNode) => {
      mocks.pathname = pathname;
      mocks.location = { pathname, search: "" };
      boundary.view.rerender(
        <QueryClientProvider client={boundary.queryClient}>
          {null}
          <boundary.GuestOnlyRoute>{child}</boundary.GuestOnlyRoute>
        </QueryClientProvider>,
      );
    };
    fillCredentials(restrictedUser.email);
    submitForm();
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    enter("/auth/pending-approval", <p>Pending card</p>);
    expect(await screen.findByText("Pending card")).toBeVisible();
    enter("/auth/login", <boundary.LoginForm />);
    fillCredentials(second.email);
    submitForm();
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(2);
    });
    expect(mocks.replace.mock.calls).toEqual([
      ["/auth/pending-approval"],
      ["/auth/pending-approval"],
    ]);
    expect(
      boundary.queryClient.getQueryData(boundary.AUTH_SESSION_QUERY_KEY),
    ).toEqual({ user: second });
  });

  it("keeps a restricted account on another auth page without a loop", async () => {
    await renderBoundary({
      session: restrictedUser,
      pathname: "/auth/register",
    });

    expect(emailField()).not.toBeDisabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("discards an obsolete completion from an older submission", async () => {
    let releaseAccount!: (value: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        releaseAccount = resolve;
      }),
    );
    await renderBoundary();
    const api = await import("@/services/api/api-client");

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    api.beginAuthSessionEpoch("confirmed-ending");
    await act(() => {
      releaseAccount({ data: accountEnvelope(salesUser) });
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "تسجيل الدخول" }),
      ).toBeEnabled();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(emailField()).toHaveValue("sales@example.com");
  });

  it("does not let an older submission replace a newer submission's feedback", async () => {
    let rejectFirst!: (reason: unknown) => void;
    mocks.post.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );
    mocks.post.mockRejectedValueOnce(
      apiError(422, "VALIDATION_ERROR", "Review the fields.", [
        { field: "body.email", message: "Email not recognized." },
      ]),
    );
    await renderBoundary();

    const form = screen
      .getByRole("button", { name: "تسجيل الدخول" })
      .closest("form");
    if (form === null) throw new Error("The login form is missing.");
    fillCredentials("first@example.com");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(emailField(), { target: { value: "second@example.com" } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Email not recognized.")).toBeInTheDocument();
    });

    await act(() => {
      rejectFirst(apiError(401, "INVALID_CREDENTIALS", "Old attempt failed."));
      return Promise.resolve();
    });

    expect(screen.queryByText("Old attempt failed.")).not.toBeInTheDocument();
    expect(screen.getByText("Email not recognized.")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not report a failure after the form was unmounted", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return;
    });
    let rejectLogin!: (reason: unknown) => void;
    mocks.post.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLogin = reject;
      }),
    );
    const { view } = await renderBoundary();

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    view.unmount();
    await act(() => {
      rejectLogin(apiError(401, "INVALID_CREDENTIALS", "Email or password."));
      return Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the reached form mounted across the credential lifecycle", async () => {
    let releaseAccount!: (value: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        releaseAccount = resolve;
      }),
    );
    await renderBoundary();

    const reachedInput = emailField();
    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledTimes(1);
    });
    expect(emailField()).toBe(reachedInput);
    expect(reachedInput).toHaveValue("sales@example.com");

    await act(() => {
      releaseAccount({ data: accountEnvelope(salesUser) });
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
  });

  it("discards a navigation for a changed canonical cache object", async () => {
    const holder: {
      queryClient: QueryClient | null;
      sessionKey: readonly unknown[] | null;
    } = { queryClient: null, sessionKey: null };

    const { queryClient, AUTH_SESSION_QUERY_KEY } = await renderBoundary({
      interfere: () => {
        if (holder.queryClient === null || holder.sessionKey === null) return;
        holder.queryClient.setQueryData(holder.sessionKey, {
          user: qualityUser,
        });
      },
    });
    holder.queryClient = queryClient;
    holder.sessionKey = AUTH_SESSION_QUERY_KEY;

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).not.toHaveBeenCalledWith("/sales/dashboard");
    expect(mocks.replace).toHaveBeenCalledWith("/quality/dashboard");
  });

  it("discards a navigation for a changed live URL", async () => {
    await renderBoundary({
      interfere: () => {
        mocks.location = { pathname: "/auth/register", search: "" };
      },
    });

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("discards a navigation for a changed credential lifecycle", async () => {
    const api = await import("@/services/api/api-client");
    await renderBoundary({
      interfere: () => {
        api.beginAuthSessionEpoch("confirmed-ending");
      },
    });

    fillCredentials();
    submitForm();

    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps a background query error from navigating while its object is retained", async () => {
    mocks.get.mockRejectedValue(new Error("offline"));
    const { queryClient, AUTH_SESSION_QUERY_KEY } = await renderBoundary({
      session: restrictedUser,
    });

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: AUTH_SESSION_QUERY_KEY,
        exact: true,
      });
    });

    await waitFor(() => {
      expect(
        queryClient
          .getQueryCache()
          .find({ queryKey: AUTH_SESSION_QUERY_KEY, exact: true })?.state
          .status,
      ).toBe("error");
    });
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual({
      user: restrictedUser,
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
