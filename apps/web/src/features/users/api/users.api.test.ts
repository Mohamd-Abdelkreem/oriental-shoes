import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClient from "@/services/api/api-client";

import { usersApi } from "./users.api";

const transportMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  assertAuthSessionSubject: vi.fn(),
  getAuthSessionEpoch: vi.fn(() => 3),
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
    assertAuthSessionSubject: transportMocks.assertAuthSessionSubject,
    getAuthSessionEpoch: transportMocks.getAuthSessionEpoch,
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
  accessVersion: 4,
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
  path: "/api/v1/users/me",
});

const resolved = <T>(data: T) => Promise.resolve({ data });

beforeEach(() => {
  transportMocks.get.mockReset();
  transportMocks.patch.mockReset();
  transportMocks.post.mockReset();
  transportMocks.assertAuthSessionSubject.mockReset();
  transportMocks.getAuthSessionEpoch.mockReset();
  transportMocks.getAuthSessionEpoch.mockReturnValue(3);
});

describe("usersApi own-account reads", () => {
  it("parses the complete envelope and asserts the captured subject", async () => {
    transportMocks.get.mockReturnValue(
      resolved(envelope({ user: safeUser() })),
    );

    const account = await usersApi.getMe();

    expect(account.user.accessVersion).toBe(4);
    expect(transportMocks.assertAuthSessionSubject).toHaveBeenCalledTimes(1);
    expect(transportMocks.assertAuthSessionSubject).toHaveBeenCalledWith(
      SUBJECT_ID,
      3,
    );
  });

  it("passes the waiter signal to the own-account read", async () => {
    const controller = new AbortController();
    transportMocks.get.mockReturnValue(
      resolved(envelope({ user: safeUser() })),
    );

    await usersApi.getMe(controller.signal);

    expect(transportMocks.get).toHaveBeenCalledWith("/users/me", {
      signal: controller.signal,
    });
  });

  it("rejects before returning when the subject assertion fails", async () => {
    transportMocks.get.mockReturnValue(
      resolved(envelope({ user: safeUser() })),
    );
    transportMocks.assertAuthSessionSubject.mockImplementation(() => {
      throw new Error("subject mismatch");
    });

    await expect(usersApi.getMe()).rejects.toBeDefined();
  });

  it("rejects a malformed own-account payload", async () => {
    transportMocks.get.mockReturnValue(
      resolved(envelope({ user: safeUser({ department: null }) })),
    );

    await expect(usersApi.getMe()).rejects.toBeDefined();
    expect(transportMocks.assertAuthSessionSubject).not.toHaveBeenCalled();
  });

  it("asserts the subject for a profile write result", async () => {
    transportMocks.patch.mockReturnValue(
      resolved(envelope({ user: safeUser({ fullName: "Updated Name" }) })),
    );

    const account = await usersApi.updateMe({
      fullName: "Updated Name",
      phone: null,
    });

    expect(account.user.fullName).toBe("Updated Name");
    expect(transportMocks.assertAuthSessionSubject).toHaveBeenCalledWith(
      SUBJECT_ID,
      3,
    );
  });

  it("sends only the profile fields of the shared profile body", async () => {
    transportMocks.patch.mockReturnValue(
      resolved(envelope({ user: safeUser() })),
    );

    await usersApi.updateMe({ fullName: "Updated Name", phone: null });

    expect(transportMocks.patch).toHaveBeenCalledWith("/users/me", {
      fullName: "Updated Name",
      phone: null,
    });
  });
});
