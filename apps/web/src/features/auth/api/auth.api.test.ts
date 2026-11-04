import { CanceledError } from "axios";
import type * as ApiClient from "@/services/api/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authApi } from "./auth.api";

const transportMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  acceptCredentialLogin: vi.fn(() => true),
  assertAuthSessionSubject: vi.fn(),
  getAuthSessionEpoch: vi.fn(() => 7),
  refreshAuthSession: vi.fn(),
}));

vi.mock("@/services/api/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>();
  return {
    ...actual,
    apiClient: {
      get: transportMocks.get,
      patch: transportMocks.patch,
      post: transportMocks.post,
    },
    acceptCredentialLogin: transportMocks.acceptCredentialLogin,
    assertAuthSessionSubject: transportMocks.assertAuthSessionSubject,
    getAuthSessionEpoch: transportMocks.getAuthSessionEpoch,
    refreshAuthSession: transportMocks.refreshAuthSession,
  };
});

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";

const safeUser = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: SUBJECT_ID,
  fullName: "Test User",
  email: "test.user@example.com",
  phone: "+201000000000",
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-01T00:00:00.000Z",
  accessVersion: 1,
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const envelope = (data: unknown): Record<string, unknown> => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
  requestId: "request-1",
  timestamp: "2026-08-18T00:00:00.000Z",
  path: "/api/v1/auth/login",
});

const sessionEnvelope = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  envelope({
    user: safeUser(),
    tokens: { accessToken: "fresh-token" },
    ...overrides,
  });

const resolved = <T>(data: T) => Promise.resolve({ data });

beforeEach(() => {
  transportMocks.get.mockReset();
  transportMocks.patch.mockReset();
  transportMocks.post.mockReset();
  transportMocks.acceptCredentialLogin.mockReset();
  transportMocks.acceptCredentialLogin.mockReturnValue(true);
  transportMocks.assertAuthSessionSubject.mockReset();
  transportMocks.getAuthSessionEpoch.mockReset();
  transportMocks.getAuthSessionEpoch.mockReturnValue(7);
  transportMocks.refreshAuthSession.mockReset();
});

describe("authApi response parsing", () => {
  it("parses the expanded account shape for registration", async () => {
    transportMocks.post.mockReturnValue(
      resolved(envelope({ user: safeUser({ accessVersion: 3 }) })),
    );

    const result = await authApi.register({
      fullName: "Test User",
      email: "test.user@example.com",
      phone: null,
      password: "Str0ng!Passw0rd",
    });

    expect(result.data.user.accessVersion).toBe(3);
    expect(result.data.user.department).toBe("SALES");
    expect(result.data.user.staffApprovedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(result.requestId).toBe("request-1");
  });

  it.each([
    ["a missing field", { department: undefined }],
    ["a wrong type", { accessVersion: "three" }],
    ["an extra field", { isAdmin: true }],
    ["a private field", { passwordHash: "hash" }],
    ["a staff decision field", { staffApprovedById: SUBJECT_ID }],
  ])("rejects %s in the account payload", async (_label, override) => {
    const user = safeUser();
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) {
        Reflect.deleteProperty(user, key);
      } else {
        user[key] = value;
      }
    }
    transportMocks.post.mockReturnValue(resolved(envelope({ user })));

    await expect(
      authApi.register({
        fullName: "Test User",
        email: "test.user@example.com",
        phone: null,
        password: "Str0ng!Passw0rd",
      }),
    ).rejects.toBeDefined();
  });

  it("parses the neutral, empty and reset-validation shapes", async () => {
    transportMocks.post.mockReturnValueOnce(
      resolved(envelope({ message: "Verification email sent." })),
    );
    transportMocks.post.mockReturnValueOnce(resolved(envelope({})));
    transportMocks.get.mockReturnValueOnce(resolved(envelope({ valid: true })));

    await expect(
      authApi.resendVerification({ email: "test.user@example.com" }),
    ).resolves.toMatchObject({ data: { message: "Verification email sent." } });
    await expect(authApi.logout()).resolves.toMatchObject({ data: {} });
    await expect(authApi.validateResetToken("token")).resolves.toMatchObject({
      data: { valid: true },
    });
  });

  it("rejects a malformed neutral payload", async () => {
    transportMocks.post.mockReturnValue(resolved(envelope({ message: "" })));
    await expect(
      authApi.forgotPassword({ email: "test.user@example.com" }),
    ).rejects.toBeDefined();
  });
});

describe("authApi credential ownership", () => {
  it("forwards the supplied epoch and accepts the credential after parsing", async () => {
    transportMocks.post.mockReturnValue(resolved(sessionEnvelope()));

    const result = await authApi.login(
      {
        email: "test.user@example.com",
        password: "Str0ng!Passw0rd",
        rememberMe: false,
      },
      12,
    );

    expect(transportMocks.post).toHaveBeenCalledTimes(1);
    const call = transportMocks.post.mock.calls[0];
    const config = call?.[2] as { _templateAuthEpoch?: number } | undefined;
    expect(config).toMatchObject({ _templateAuthEpoch: 12 });
    expect(transportMocks.acceptCredentialLogin).toHaveBeenCalledTimes(1);
    expect(transportMocks.acceptCredentialLogin).toHaveBeenCalledWith(
      "fresh-token",
      12,
      SUBJECT_ID,
    );
    expect(result.data.tokens.accessToken).toBe("fresh-token");
  });

  it("never accepts a credential for a malformed login result", async () => {
    transportMocks.post.mockReturnValue(
      resolved(sessionEnvelope({ user: {} })),
    );

    await expect(
      authApi.login(
        {
          email: "test.user@example.com",
          password: "Str0ng!Passw0rd",
          rememberMe: false,
        },
        12,
      ),
    ).rejects.toBeDefined();
    expect(transportMocks.acceptCredentialLogin).not.toHaveBeenCalled();
  });

  it("never accepts a credential for a rejected login result", async () => {
    transportMocks.post.mockReturnValue(
      Promise.reject(new Error("rejected by the server")),
    );

    await expect(
      authApi.login(
        {
          email: "test.user@example.com",
          password: "Str0ng!Passw0rd",
          rememberMe: false,
        },
        12,
      ),
    ).rejects.toBeDefined();
    expect(transportMocks.acceptCredentialLogin).not.toHaveBeenCalled();
  });

  it("turns a refused credential acceptance into a cancellation", async () => {
    transportMocks.post.mockReturnValue(resolved(sessionEnvelope()));
    transportMocks.acceptCredentialLogin.mockReturnValue(false);

    await expect(
      authApi.login(
        {
          email: "test.user@example.com",
          password: "Str0ng!Passw0rd",
          rememberMe: false,
        },
        12,
      ),
    ).rejects.toBeInstanceOf(CanceledError);
  });

  it("delegates the refresh once without its own post or setter", async () => {
    const parsed = { data: { tokens: { accessToken: "fresh-token" } } };
    transportMocks.refreshAuthSession.mockResolvedValue(parsed);

    const result = await authApi.refresh(12);

    expect(transportMocks.refreshAuthSession).toHaveBeenCalledTimes(1);
    expect(transportMocks.refreshAuthSession).toHaveBeenCalledWith(12);
    expect(transportMocks.post).not.toHaveBeenCalled();
    expect(transportMocks.acceptCredentialLogin).not.toHaveBeenCalled();
    expect(result).toBe(parsed);
  });

  it("does not join the shared refresh for an already aborted waiter", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(authApi.refresh(12, controller.signal)).rejects.toBeInstanceOf(
      CanceledError,
    );
    expect(transportMocks.refreshAuthSession).not.toHaveBeenCalled();
  });

  it("does not abort the shared refresh when the waiter is cancelled later", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    transportMocks.refreshAuthSession.mockReturnValue(pending);
    const controller = new AbortController();

    const attempt = authApi.refresh(12, controller.signal);
    await vi.waitFor(() => {
      expect(transportMocks.refreshAuthSession).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    release({ data: {} });

    await expect(attempt).rejects.toBeInstanceOf(CanceledError);
    expect(transportMocks.refreshAuthSession.mock.calls[0]).toHaveLength(1);
  });

  it("passes the waiter signal to an ordinary read", async () => {
    const controller = new AbortController();
    transportMocks.get.mockReturnValue(resolved(envelope({ valid: true })));

    await authApi.validateResetToken("token", controller.signal);

    expect(transportMocks.get).toHaveBeenCalledWith(
      "/auth/validate-reset-token",
      {
        params: { token: "token" },
        signal: controller.signal,
      },
    );
  });
});
