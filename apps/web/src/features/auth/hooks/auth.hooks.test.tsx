import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { CanceledError } from "axios";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUserData } from "@template/contracts";

import {
  AUTH_SESSION_QUERY_KEY,
  loadSession,
  sessionQueryOptions,
  useChangePassword,
  useLogin,
  useLogout,
  useLogoutAll,
  useResetPassword,
  useSession,
  useValidateResetToken,
} from "./auth.hooks";

const mocks = vi.hoisted(() => {
  const state = {
    epoch: 1,
    policy: "restore" as
      "restore" | "credential-required" | "identity-changed" | "signed-out",
    token: { kind: "missing" } as
      { kind: "missing" } | { kind: "present"; value: string },
  };
  return {
    state,
    beginAuthSessionEpoch: vi.fn(),
    changePassword: vi.fn(),
    clearAccessToken: vi.fn(),
    getAccessToken: vi.fn(),
    getApiError: vi.fn(),
    getAuthSessionEpoch: vi.fn(),
    getAuthSessionRestorePolicy: vi.fn(),
    getMe: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    refresh: vi.fn(),
    replaceWithLogin: vi.fn(),
    resetPassword: vi.fn(),
    validateResetToken: vi.fn(),
  };
});

vi.mock("@/services/api/api-client", () => ({
  beginAuthSessionEpoch: mocks.beginAuthSessionEpoch,
  clearAccessToken: mocks.clearAccessToken,
  getAccessToken: mocks.getAccessToken,
  getApiError: mocks.getApiError,
  getAuthSessionEpoch: mocks.getAuthSessionEpoch,
  getAuthSessionRestorePolicy: mocks.getAuthSessionRestorePolicy,
  AuthIdentityChangedError: class AuthIdentityChangedError extends Error {
    constructor() {
      super("Your active account changed. Sign in again to continue.");
      this.name = "AuthIdentityChangedError";
    }
  },
  AuthReauthenticationRequiredError: class AuthReauthenticationRequiredError extends Error {
    constructor() {
      super("Sign in again to continue.");
      this.name = "AuthReauthenticationRequiredError";
    }
  },
}));
vi.mock("@/features/users/api/users.api", () => ({
  usersApi: { getMe: mocks.getMe },
}));
vi.mock("../api/auth.api", () => ({
  authApi: {
    changePassword: mocks.changePassword,
    login: mocks.login,
    logout: mocks.logout,
    logoutAll: mocks.logoutAll,
    refresh: mocks.refresh,
    resetPassword: mocks.resetPassword,
    validateResetToken: mocks.validateResetToken,
  },
}));
vi.mock("../utils/session-navigation", () => ({
  replaceWithLogin: mocks.replaceWithLogin,
}));

const apiError = (statusCode: number, code: string) => ({
  message: "test",
  statusCode,
  code,
  requestId: "request",
  fieldErrors: {},
});

const createDeferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const account = {
  user: {
    id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
    fullName: "Template User",
    email: "user@example.com",
    phone: null,
    role: "USER" as const,
    status: "ACTIVE" as const,
    department: "SALES" as const,
    staffApprovedAt: "2026-08-18T00:00:00.000Z",
    accessVersion: 3,
    emailVerifiedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  },
};

const newerAccount = {
  ...account,
  user: { ...account.user, accessVersion: 7 },
};

const otherAccount = {
  ...account,
  user: { ...account.user, id: "7f1c0f9e-2b3e-4c0a-9b3a-1a2b3c4d5e6f" },
};

const loginBody = {
  email: "user@example.com",
  password: "CorrectHorseBatteryStaple!1",
  rememberMe: false,
};

const changePasswordBody = {
  currentPassword: "OldCorrectHorseBatteryStaple!1",
  newPassword: "NewCorrectHorseBatteryStaple!1",
  passwordConfirmation: "NewCorrectHorseBatteryStaple!1",
};

const resetPasswordBody = {
  newPassword: "NewCorrectHorseBatteryStaple!1",
  passwordConfirmation: "NewCorrectHorseBatteryStaple!1",
};

const createHarness = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.epoch = 1;
  mocks.state.policy = "restore";
  mocks.state.token = { kind: "missing" };
  mocks.getAccessToken.mockImplementation(() => mocks.state.token);
  mocks.getAuthSessionEpoch.mockImplementation(() => mocks.state.epoch);
  mocks.getAuthSessionRestorePolicy.mockImplementation(
    () => mocks.state.policy,
  );
  mocks.getApiError.mockImplementation(() => apiError(0, "NETWORK_ERROR"));
  mocks.clearAccessToken.mockImplementation(() => {
    mocks.state.token = { kind: "missing" };
  });
  mocks.beginAuthSessionEpoch.mockImplementation(
    (reason: "credential-login" | "confirmed-ending") => {
      mocks.state.epoch += 1;
      mocks.state.policy =
        reason === "credential-login" ? "credential-required" : "signed-out";
      mocks.state.token = { kind: "missing" };
      return mocks.state.epoch;
    },
  );
  mocks.login.mockImplementation(() => {
    mocks.state.policy = "restore";
    mocks.state.token = { kind: "present", value: "issued-token" };
    return Promise.resolve({ data: { user: account.user } });
  });
  mocks.getMe.mockResolvedValue(account);
  mocks.refresh.mockResolvedValue({});
});

describe("business denial reconciliation", () => {
  const body = {
    currentPassword: "Test-current",
    newPassword: "Test-next",
    passwordConfirmation: "Test-next",
  };

  it("leaves the session query errored when a decisive denial's fresh lookup fails", async () => {
    const denied = new Error("Restricted");
    const readFailure = new Error("Current session unavailable");
    mocks.state.token = { kind: "present", value: "test-access" };
    mocks.getApiError.mockReturnValue(apiError(403, "ACCOUNT_RESTRICTED"));
    mocks.changePassword.mockRejectedValue(denied);
    mocks.getMe.mockRejectedValue(readFailure);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(body)).rejects.toBe(denied);
    });
    expect(queryClient.getQueryState(AUTH_SESSION_QUERY_KEY)).toMatchObject({
      status: "error",
      data: account,
      error: readFailure,
    });
    expect(mocks.getMe).toHaveBeenCalledTimes(1);
    expect(mocks.changePassword).toHaveBeenCalledTimes(1);
    expect(mocks.beginAuthSessionEpoch).not.toHaveBeenCalled();
  });

  it.each([
    "FORBIDDEN",
    "RATE_LIMITED",
    "obsolete actor",
    "public reset",
  ] as const)(
    "does not infer a session restriction from %s",
    async (scenario) => {
      const denied = new Error("Request denied");
      const { queryClient, wrapper } = createHarness();
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
      mocks.getApiError.mockReturnValue(
        apiError(
          scenario === "RATE_LIMITED" ? 429 : 403,
          scenario === "FORBIDDEN" || scenario === "RATE_LIMITED"
            ? scenario
            : "ACCOUNT_RESTRICTED",
        ),
      );
      mocks.changePassword.mockImplementation(async () => {
        await Promise.resolve();
        if (scenario === "obsolete actor") mocks.state.epoch += 1;
        throw denied;
      });
      mocks.resetPassword.mockRejectedValue(denied);
      const { result } = renderHook(
        () => ({
          password: useChangePassword(),
          reset: useResetPassword(),
        }),
        { wrapper },
      );
      await act(async () => {
        const outcome =
          scenario === "public reset"
            ? result.current.reset.mutateAsync({
                token: "purpose-token",
                body: {
                  newPassword: body.newPassword,
                  passwordConfirmation: body.passwordConfirmation,
                },
              })
            : result.current.password.mutateAsync(body);
        await expect(outcome).rejects.toBe(denied);
      });
      expect(mocks.getMe).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(account);
    },
  );
});

describe("loadSession", () => {
  it("binds the restored session to the current account", async () => {
    mocks.refresh.mockResolvedValue({});
    mocks.getMe.mockResolvedValue(account);

    await expect(loadSession()).resolves.toBe(account);

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.getMe).toHaveBeenCalledOnce();
  });

  it.each([
    ["credential-required", "AuthReauthenticationRequiredError"],
    ["identity-changed", "AuthIdentityChangedError"],
  ] as const)(
    "refuses a restricted %s restore without any API call",
    async (policy, name) => {
      mocks.state.policy = policy;

      await expect(loadSession()).rejects.toMatchObject({ name });

      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.getMe).not.toHaveBeenCalled();
    },
  );

  it("returns the known null of a signed-out session without a refresh", async () => {
    mocks.state.policy = "signed-out";

    await expect(loadSession()).resolves.toBeNull();

    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.getMe).not.toHaveBeenCalled();
    expect(mocks.clearAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
  ])("treats refresh %s/%s as anonymous", async (statusCode, code) => {
    mocks.refresh.mockRejectedValue(new Error("anonymous"));
    mocks.getApiError.mockReturnValue(apiError(statusCode, code));

    await expect(loadSession()).resolves.toBeNull();

    expect(mocks.clearAccessToken).toHaveBeenCalledOnce();
    expect(mocks.getMe).not.toHaveBeenCalled();
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [401, "TOKEN_REPLAYED"],
    [403, "FORBIDDEN"],
    [503, "SERVICE_UNAVAILABLE"],
  ])("rethrows unexpected refresh %s/%s", async (statusCode, code) => {
    const error = new Error("unexpected");
    mocks.refresh.mockRejectedValue(error);
    mocks.getApiError.mockReturnValue(apiError(statusCode, code));

    await expect(loadSession()).rejects.toBe(error);

    expect(mocks.clearAccessToken).not.toHaveBeenCalled();
  });

  it("skips the proactive refresh when an access token already exists", async () => {
    mocks.state.token = { kind: "present", value: "token" };
    mocks.getMe.mockResolvedValue(account);

    await expect(loadSession()).resolves.toBe(account);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
  ])("treats current-user %s/%s as anonymous", async (statusCode, code) => {
    mocks.state.token = { kind: "present", value: "token" };
    mocks.getMe.mockRejectedValue(new Error("anonymous current user"));
    mocks.getApiError.mockReturnValue(apiError(statusCode, code));

    await expect(loadSession()).resolves.toBeNull();

    expect(mocks.clearAccessToken).toHaveBeenCalledOnce();
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [401, "TOKEN_REPLAYED"],
    [403, "FORBIDDEN"],
    [500, "INTERNAL_SERVER_ERROR"],
    [0, "NETWORK_ERROR"],
  ])("rethrows unexpected current-user %s/%s", async (statusCode, code) => {
    const error = new Error("unexpected current-user failure");
    mocks.state.token = { kind: "present", value: "token" };
    mocks.getMe.mockRejectedValue(error);
    mocks.getApiError.mockReturnValue(apiError(statusCode, code));

    await expect(loadSession()).rejects.toBe(error);

    expect(mocks.clearAccessToken).not.toHaveBeenCalled();
  });

  it("suppresses a session result that arrives after the epoch advanced", async () => {
    const deferred = createDeferred<AuthUserData>();
    mocks.state.token = { kind: "present", value: "token" };
    mocks.getMe.mockReturnValue(deferred.promise);

    const pending = loadSession();
    mocks.state.epoch += 1;
    deferred.resolve(account);

    await expect(pending).rejects.toBeInstanceOf(CanceledError);
  });
});

describe("sessionQueryOptions", () => {
  it("owns the single session key", () => {
    const { queryClient } = createHarness();

    const options = sessionQueryOptions(queryClient);

    expect(options.queryKey).toEqual(AUTH_SESSION_QUERY_KEY);
    expect(options.retry).toBe(false);
  });
});

describe("useSession", () => {
  it("never adopts a cookie subject after an identity mismatch, across retries", async () => {
    const { queryClient, wrapper } = createHarness();
    mocks.state.policy = "identity-changed";
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.getMe).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeUndefined();

    await act(async () => {
      await result.current.refetch();
    });
    await act(async () => {
      await result.current.refetch();
    });

    expect(mocks.getMe).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeUndefined();
  });

  it("does not start a background read for a settled anonymous observer", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null);
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useSession({ enabled: false });
      },
      { wrapper },
    );
    const initialRenders = renders;

    await act(async () => {
      await Promise.resolve();
    });

    expect(renders).toBe(initialRenders);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.getMe).not.toHaveBeenCalled();
  });

  it("does not start a background read for a restricted restore observer", async () => {
    const { wrapper } = createHarness();
    mocks.state.policy = "credential-required";
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useSession({ enabled: false });
      },
      { wrapper },
    );
    const initialRenders = renders;

    await act(async () => {
      await Promise.resolve();
    });

    expect(renders).toBe(initialRenders);
    expect(result.current.fetchStatus).toBe("idle");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.getMe).not.toHaveBeenCalled();
  });
});

describe("useLogin", () => {
  it("publishes the accepted account and returns the canonical cache object", async () => {
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => useLogin(), { wrapper });

    let published: AuthUserData | undefined;
    await act(async () => {
      published = await result.current.mutateAsync(loginBody);
    });

    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.getMe).toHaveBeenCalledOnce();
    expect(published).toEqual(account);
    expect(published).toBe(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY));
  });

  it("keeps the credential-required policy when the login is rejected", async () => {
    const { queryClient, wrapper } = createHarness();
    const failure = new Error("network");
    mocks.login.mockRejectedValue(failure);
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(loginBody)).rejects.toBe(failure);
    });

    expect(mocks.getMe).not.toHaveBeenCalled();
    expect(mocks.state.policy).toBe("credential-required");
    expect(mocks.clearAccessToken).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
  });

  it("surfaces a malformed login outcome without publishing an account", async () => {
    const { queryClient, wrapper } = createHarness();
    const failure = new Error("malformed envelope");
    failure.name = "ApiContractError";
    mocks.login.mockRejectedValue(failure);
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(loginBody)).rejects.toBe(failure);
    });

    expect(mocks.getMe).not.toHaveBeenCalled();
    expect(mocks.state.policy).toBe("credential-required");
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });

  it("keeps the accepted binding when the follow-up current-user read fails", async () => {
    const { queryClient, wrapper } = createHarness();
    const failure = new Error("current user unavailable");
    mocks.getMe.mockRejectedValue(failure);
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(loginBody)).rejects.toBe(failure);
    });

    expect(mocks.state.policy).toBe("restore");
    expect(mocks.state.token).toEqual({
      kind: "present",
      value: "issued-token",
    });
    expect(mocks.clearAccessToken).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });

  it("ignores the completion of a superseded overlapping login", async () => {
    const { queryClient, wrapper } = createHarness();
    const firstLogin = createDeferred<unknown>();
    mocks.login.mockImplementationOnce(() => firstLogin.promise);
    mocks.getMe.mockResolvedValue(account);
    const first = renderHook(() => useLogin(), { wrapper });
    const second = renderHook(() => useLogin(), { wrapper });

    let firstFailure: unknown;
    let firstPromise: Promise<unknown> = Promise.resolve();
    await act(async () => {
      firstPromise = first.result.current
        .mutateAsync(loginBody)
        .catch((error: unknown) => {
          firstFailure = error;
        });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledTimes(1);
    });

    let secondPublished: AuthUserData | undefined;
    await act(async () => {
      secondPublished = await second.result.current.mutateAsync(loginBody);
    });

    await act(async () => {
      firstLogin.resolve({});
      await firstPromise;
    });

    expect(firstFailure).toBeInstanceOf(CanceledError);
    expect(secondPublished).toEqual(account);
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBe(
      secondPublished,
    );
  });

  it("preserves a newer same-subject access version at publication", async () => {
    const { queryClient, wrapper } = createHarness();
    const older = { ...account, user: { ...account.user, accessVersion: 2 } };
    mocks.getMe.mockImplementation(() => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, newerAccount);
      return Promise.resolve(older);
    });
    const { result } = renderHook(() => useLogin(), { wrapper });

    let published: AuthUserData | undefined;
    await act(async () => {
      published = await result.current.mutateAsync(loginBody);
    });

    expect(published).toBe(newerAccount);
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBe(newerAccount);
  });

  it("keeps the session query object and removes the other cached data", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    queryClient.setQueryData(["staff", "list"], "cached");
    const sessionQuery = queryClient
      .getQueryCache()
      .find({ queryKey: AUTH_SESSION_QUERY_KEY, exact: true });
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(loginBody);
    });

    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: AUTH_SESSION_QUERY_KEY, exact: true }),
    ).toBe(sessionQuery);
    expect(queryClient.getQueryData(["staff", "list"])).toBeUndefined();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(account);
  });
});

describe("session ending families", () => {
  it("preserves the session when the logout request fails", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    const failure = new Error("network");
    mocks.logout.mockRejectedValue(failure);
    const { result } = renderHook(() => useLogout(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBe(failure);
    });

    expect(mocks.beginAuthSessionEpoch).not.toHaveBeenCalled();
    expect(mocks.clearAccessToken).not.toHaveBeenCalled();
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(account);
  });

  it("opens the confirmed-ending epoch after a confirmed logout", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    queryClient.setQueryData(["staff", "list"], "cached");
    const sessionQuery = queryClient
      .getQueryCache()
      .find({ queryKey: AUTH_SESSION_QUERY_KEY, exact: true });
    mocks.logout.mockResolvedValue({});
    const { result } = renderHook(() => useLogout(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocks.beginAuthSessionEpoch).toHaveBeenCalledWith(
      "confirmed-ending",
    );
    expect(mocks.clearAccessToken).toHaveBeenCalledOnce();
    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(queryClient.getQueryData(["staff", "list"])).toBeUndefined();
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: AUTH_SESSION_QUERY_KEY, exact: true }),
    ).toBe(sessionQuery);
  });

  it("preserves the session when the logout-all request fails", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    const failure = new Error("network");
    mocks.logoutAll.mockRejectedValue(failure);
    const { result } = renderHook(() => useLogoutAll(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBe(failure);
    });

    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(account);
  });

  it("opens the confirmed-ending epoch after a confirmed logout-all", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    mocks.logoutAll.mockResolvedValue({});
    const { result } = renderHook(() => useLogoutAll(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocks.beginAuthSessionEpoch).toHaveBeenCalledWith(
      "confirmed-ending",
    );
    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });

  it("preserves the session when the password change fails", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    const failure = new Error("network");
    mocks.changePassword.mockRejectedValue(failure);
    const { result } = renderHook(() => useChangePassword(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(changePasswordBody)).rejects.toBe(
        failure,
      );
    });

    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(account);
  });

  it("opens the confirmed-ending epoch after a confirmed password change", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    mocks.changePassword.mockResolvedValue({});
    const { result } = renderHook(() => useChangePassword(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(changePasswordBody);
    });

    expect(mocks.beginAuthSessionEpoch).toHaveBeenCalledWith(
      "confirmed-ending",
    );
    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });

  it("preserves the session when the password reset fails", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    const failure = new Error("network");
    mocks.resetPassword.mockRejectedValue(failure);
    const { result } = renderHook(() => useResetPassword(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          token: "opaque-reset-token",
          body: resetPasswordBody,
        }),
      ).rejects.toBe(failure);
    });

    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(account);
  });

  it("opens the confirmed-ending epoch after a confirmed password reset", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    mocks.resetPassword.mockResolvedValue({});
    const { result } = renderHook(() => useResetPassword(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        token: "opaque-reset-token",
        body: resetPasswordBody,
      });
    });

    expect(mocks.beginAuthSessionEpoch).toHaveBeenCalledWith(
      "confirmed-ending",
    );
    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });

  it("does not end or navigate a newer session when an old logout succeeds late", async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, account);
    const deferred = createDeferred<unknown>();
    mocks.logout.mockReturnValue(deferred.promise);
    mocks.getMe.mockResolvedValue(otherAccount);
    const logout = renderHook(() => useLogout(), { wrapper });
    const login = renderHook(() => useLogin(), { wrapper });

    let failure: unknown;
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = logout.result.current.mutateAsync().catch((error: unknown) => {
        failure = error;
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledOnce();
    });

    await act(async () => {
      await login.result.current.mutateAsync(loginBody);
    });

    await act(async () => {
      deferred.resolve({});
      await pending;
    });

    expect(failure).toBeInstanceOf(CanceledError);
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(
      otherAccount,
    );
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
    expect(mocks.beginAuthSessionEpoch).not.toHaveBeenCalledWith(
      "confirmed-ending",
    );
  });
});

describe("useValidateResetToken", () => {
  it("keeps the credential out of the mutation variables, key and result", async () => {
    const { queryClient, wrapper } = createHarness();
    const deferred = createDeferred<unknown>();
    mocks.validateResetToken.mockReturnValue(deferred.promise);
    const { result } = renderHook(() => useValidateResetToken("opaque-token"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    const mutation = queryClient.getMutationCache().getAll()[0];
    expect(mutation?.state.variables).toBeUndefined();
    expect(mutation?.options.mutationKey).toBeUndefined();
    expect(mutation?.state.data).toBeUndefined();

    deferred.resolve({ data: { valid: true } });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({ data: { valid: true } });
    expect(JSON.stringify(result.current.data)).not.toContain("opaque-token");
  });

  it("releases the settled validation from the mutation cache", async () => {
    const { queryClient, wrapper } = createHarness();
    mocks.validateResetToken.mockResolvedValue({ data: { valid: true } });
    const { result, unmount } = renderHook(
      () => useValidateResetToken("opaque-token"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

    unmount();

    await waitFor(() => {
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    });
  });

  it("aborts the previous check when the token is replaced", async () => {
    const { wrapper } = createHarness();
    const signals: AbortSignal[] = [];
    const first = createDeferred<unknown>();
    const second = createDeferred<unknown>();
    mocks.validateResetToken
      .mockImplementationOnce((_token: string, signal: AbortSignal) => {
        signals.push(signal);
        return first.promise;
      })
      .mockImplementationOnce((_token: string, signal: AbortSignal) => {
        signals.push(signal);
        return second.promise;
      });
    const { result, rerender } = renderHook(
      ({ token }: Readonly<{ token: string }>) => useValidateResetToken(token),
      { wrapper, initialProps: { token: "first-token" } },
    );

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    rerender({ token: "second-token" });

    await waitFor(() => {
      expect(mocks.validateResetToken).toHaveBeenCalledTimes(2);
    });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    second.resolve({ data: { valid: true } });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("aborts the pending check on unmount", async () => {
    const { wrapper } = createHarness();
    const signals: AbortSignal[] = [];
    const deferred = createDeferred<unknown>();
    mocks.validateResetToken.mockImplementation(
      (_token: string, signal: AbortSignal) => {
        signals.push(signal);
        return deferred.promise;
      },
    );
    const { result, unmount } = renderHook(
      () => useValidateResetToken("opaque-token"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    unmount();

    expect(signals[0]?.aborted).toBe(true);
  });

  it("retries the current token only on an explicit retry", async () => {
    const { wrapper } = createHarness();
    mocks.validateResetToken
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { valid: true } });
    const { result } = renderHook(() => useValidateResetToken("opaque-token"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(mocks.validateResetToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.validateResetToken).toHaveBeenCalledTimes(2);
  });
});

describe("useResetPassword", () => {
  it("forwards the transient reset write inputs", async () => {
    const { wrapper } = createHarness();
    mocks.resetPassword.mockResolvedValue({});
    const { result } = renderHook(() => useResetPassword(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        token: "opaque-reset-token",
        body: resetPasswordBody,
      });
    });

    expect(mocks.resetPassword).toHaveBeenCalledWith(
      "opaque-reset-token",
      resetPasswordBody,
    );
  });
});
