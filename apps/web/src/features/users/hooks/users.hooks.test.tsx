import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { CanceledError } from "axios";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUserData } from "@template/contracts";

import { useUpdateProfile } from "./users.hooks";

type RestorePolicy =
  "restore" | "credential-required" | "identity-changed" | "signed-out";

const mocks = vi.hoisted(() => {
  const state: { epoch: number; policy: RestorePolicy } = {
    epoch: 1,
    policy: "restore",
  };
  return {
    state,
    getAuthSessionEpoch: vi.fn(),
    getAuthSessionRestorePolicy: vi.fn(),
    updateMe: vi.fn(),
    getMe: vi.fn(),
    getApiError: vi.fn(() => ({ code: "NETWORK_ERROR" })),
  };
});

vi.mock("@/services/api/api-client", () => ({
  getAuthSessionEpoch: mocks.getAuthSessionEpoch,
  getAccessToken: () => ({ kind: "present", value: "test-access" }),
  getApiError: mocks.getApiError,
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

vi.mock("../api/users.api", () => ({
  usersApi: { updateMe: mocks.updateMe, getMe: mocks.getMe },
}));

const sessionKey = ["auth", "session"] as const;

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

const updatedAccount = {
  ...account,
  user: { ...account.user, fullName: "Updated User" },
};

const newerAccount = {
  ...account,
  user: { ...account.user, accessVersion: 7 },
};

const otherAccount = {
  ...account,
  user: { ...account.user, id: "7f1c0f9e-2b3e-4c0a-9b3a-1a2b3c4d5e6f" },
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
  mocks.getApiError.mockReturnValue({ code: "NETWORK_ERROR" });
  mocks.state.epoch = 1;
  mocks.state.policy = "restore";
  mocks.getAuthSessionEpoch.mockImplementation(() => mocks.state.epoch);
  mocks.getAuthSessionRestorePolicy.mockImplementation(
    () => mocks.state.policy,
  );
});

describe("useUpdateProfile", () => {
  it("preserves the profile denial and reconciles the current session on its existing key", async () => {
    const denial = new Error("Named department denial");
    const moved: AuthUserData = {
      user: { ...account.user, department: "CUTTING", accessVersion: 4 },
    };
    mocks.getApiError.mockReturnValue({ code: "DEPARTMENT_ACCESS_DENIED" });
    mocks.updateMe.mockRejectedValue(denial);
    mocks.getMe.mockResolvedValue(moved);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(sessionKey, account);
    const query = queryClient.getQueryCache().find({ queryKey: sessionKey });
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ fullName: "Draft" }),
      ).rejects.toBe(denial);
    });
    expect(mocks.updateMe).toHaveBeenCalledTimes(1);
    expect(mocks.getMe).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(sessionKey)).toEqual(moved);
    expect(queryClient.getQueryCache().find({ queryKey: sessionKey })).toBe(
      query,
    );
    expect(mocks.state.epoch).toBe(1);
  });

  it("replaces the authoritative session cache with the returned profile", async () => {
    mocks.updateMe.mockResolvedValue(updatedAccount);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(sessionKey, account);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    let published: AuthUserData | undefined;
    await act(async () => {
      published = await result.current.mutateAsync({
        fullName: "Updated User",
        phone: null,
      });
    });

    expect(mocks.updateMe).toHaveBeenCalledWith({
      fullName: "Updated User",
      phone: null,
    });
    expect(queryClient.getQueryData(sessionKey)).toEqual(updatedAccount);
    expect(published).toBe(queryClient.getQueryData(sessionKey));
  });

  it("preserves a newer same-subject access version", async () => {
    mocks.updateMe.mockResolvedValue({
      ...account,
      user: { ...account.user, accessVersion: 2 },
    });
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(sessionKey, newerAccount);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    let published: AuthUserData | undefined;
    await act(async () => {
      published = await result.current.mutateAsync({
        fullName: "Template User",
        phone: null,
      });
    });

    expect(published).toBe(newerAccount);
    expect(queryClient.getQueryData(sessionKey)).toBe(newerAccount);
  });

  it("does not publish a result that arrives after the epoch advanced", async () => {
    mocks.updateMe.mockImplementation(() => {
      mocks.state.epoch += 1;
      return Promise.resolve(updatedAccount);
    });
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(sessionKey, account);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ fullName: "Updated User", phone: null }),
      ).rejects.toBeInstanceOf(CanceledError);
    });

    expect(queryClient.getQueryData(sessionKey)).toBe(account);
  });

  it("does not publish a result that belongs to another account", async () => {
    mocks.updateMe.mockImplementation(() => {
      queryClient.setQueryData(sessionKey, otherAccount);
      return Promise.resolve(updatedAccount);
    });
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(sessionKey, account);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ fullName: "Updated User", phone: null }),
      ).rejects.toBeInstanceOf(CanceledError);
    });

    expect(queryClient.getQueryData(sessionKey)).toEqual(otherAccount);
  });

  it("does not publish a result of a restricted restore policy", async () => {
    mocks.updateMe.mockImplementation(() => {
      mocks.state.policy = "identity-changed";
      return Promise.resolve(updatedAccount);
    });
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(sessionKey, account);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ fullName: "Updated User", phone: null }),
      ).rejects.toMatchObject({ name: "AuthIdentityChangedError" });
    });

    expect(queryClient.getQueryData(sessionKey)).toBe(account);
  });

  it("keeps the current session when the update request fails", async () => {
    const failure = new Error("network");
    mocks.updateMe.mockRejectedValue(failure);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(sessionKey, account);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ fullName: "Updated User", phone: null }),
      ).rejects.toBe(failure);
    });

    expect(queryClient.getQueryData(sessionKey)).toBe(account);
  });
});
