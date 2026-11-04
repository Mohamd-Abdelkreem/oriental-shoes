import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClientModule from "@/services/api/api-client";

import { ApiContractError } from "@/services/api/api-client";

import { staffApi } from "./staff.api";

const transportMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/services/api/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    apiClient: {
      get: transportMocks.get,
      patch: transportMocks.patch,
      post: transportMocks.post,
    },
  };
});

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

const adminUser = (): Record<string, unknown> => ({
  id: ADMIN_ID,
  fullName: "Central Admin",
  email: "admin@example.com",
  phone: null,
  role: "ADMIN",
  status: "ACTIVE",
  department: null,
  staffApprovedAt: null,
  accessVersion: 1,
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

const employeeUser = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: TARGET_ID,
  fullName: "Sales Employee",
  email: "employee@example.com",
  phone: "+201000000000",
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-02T00:00:00.000Z",
  accessVersion: 2,
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  ...overrides,
});

const pagination = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  page: 1,
  limit: 25,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
  ...overrides,
});

const decision = (): Record<string, unknown> => ({
  id: "33333333-3333-4333-8333-333333333333",
  commandId: "44444444-4444-4444-8444-444444444444",
  action: "APPROVE",
  actor: {
    id: ADMIN_ID,
    fullName: "Central Admin",
    role: "ADMIN",
    department: null,
  },
  targetUserId: TARGET_ID,
  occurredAt: "2026-08-03T00:00:00.000Z",
  before: {
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
    accessVersion: 1,
  },
  after: {
    status: "ACTIVE",
    department: "SALES",
    staffApprovedAt: "2026-08-03T00:00:00.000Z",
    accessVersion: 2,
  },
});

const envelope = (
  data: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
  requestId: "request-1",
  timestamp: "2026-08-18T00:00:00.000Z",
  path: "/api/v1/staff",
  ...overrides,
});

const resolved = (data: unknown) => Promise.resolve({ data });

const controllers: AbortController[] = [];

const createSignal = (): AbortSignal => {
  const controller = new AbortController();
  controllers.push(controller);
  return controller.signal;
};

beforeEach(() => {
  transportMocks.get.mockReset();
  transportMocks.patch.mockReset();
  transportMocks.post.mockReset();
});

describe("staffApi reads", () => {
  it("parses a complete staff list and forwards the query and the signal", async () => {
    const signal = createSignal();
    transportMocks.get.mockReturnValue(
      resolved(
        envelope({
          staff: [employeeUser(), adminUser()],
          pagination: pagination({ total: 2, totalPages: 1 }),
          pendingCount: 3,
        }),
      ),
    );

    const result = await staffApi.list(
      { scope: "pending", search: "sales", page: 2, limit: 25 },
      signal,
    );

    expect(result.staff).toHaveLength(2);
    expect(result.staff[0]?.id).toBe(TARGET_ID);
    expect(result.pendingCount).toBe(3);
    expect(result.pagination.page).toBe(1);
    expect(transportMocks.get).toHaveBeenCalledTimes(1);
    expect(transportMocks.get).toHaveBeenCalledWith("/staff", {
      params: { scope: "pending", search: "sales", page: 2, limit: 25 },
      signal,
    });
  });

  it("omits an absent signal from the staff list request", async () => {
    transportMocks.get.mockReturnValue(
      resolved(
        envelope({
          staff: [],
          pagination: pagination({ total: 0, totalPages: 0 }),
          pendingCount: 0,
        }),
      ),
    );

    await staffApi.list({ scope: "all" });

    expect(transportMocks.get).toHaveBeenCalledWith("/staff", {
      params: { scope: "all" },
    });
  });

  it("rejects a malformed staff list payload", async () => {
    transportMocks.get.mockReturnValue(
      resolved(
        envelope({
          staff: [employeeUser()],
          pagination: pagination(),
          pendingCount: -1,
        }),
      ),
    );

    await expect(staffApi.list({ scope: "all" })).rejects.toBeInstanceOf(
      ApiContractError,
    );
  });

  it("rejects a malformed success envelope", async () => {
    transportMocks.get.mockReturnValue(
      resolved(envelope(undefined, { success: false, statusCode: 500 })),
    );

    await expect(staffApi.list({ scope: "all" })).rejects.toBeInstanceOf(
      ApiContractError,
    );
  });

  it("reads one selected account and forwards its signal", async () => {
    const signal = createSignal();
    transportMocks.get.mockReturnValue(
      resolved(envelope({ staff: employeeUser() })),
    );

    const result = await staffApi.get(TARGET_ID, signal);

    expect(result.staff.id).toBe(TARGET_ID);
    expect(result.staff.accessVersion).toBe(2);
    expect(transportMocks.get).toHaveBeenCalledWith(`/staff/${TARGET_ID}`, {
      signal,
    });
  });

  it("rejects a malformed selected account", async () => {
    transportMocks.get.mockReturnValue(
      resolved(envelope({ staff: employeeUser({ department: null }) })),
    );

    await expect(staffApi.get(TARGET_ID)).rejects.toBeInstanceOf(
      ApiContractError,
    );
  });

  it("reads the retained decisions with the history query and the signal", async () => {
    const signal = createSignal();
    transportMocks.get.mockReturnValue(
      resolved(
        envelope({
          decisions: [decision()],
          pagination: pagination(),
        }),
      ),
    );

    const result = await staffApi.decisions(
      TARGET_ID,
      { page: 1, limit: 25 },
      signal,
    );

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.action).toBe("APPROVE");
    expect(transportMocks.get).toHaveBeenCalledWith(
      `/staff/${TARGET_ID}/decisions`,
      { params: { page: 1, limit: 25 }, signal },
    );
  });

  it("rejects a malformed decision history", async () => {
    transportMocks.get.mockReturnValue(
      resolved(
        envelope({
          decisions: [{ ...decision(), actor: { ...adminUser() } }],
          pagination: pagination(),
        }),
      ),
    );

    await expect(
      staffApi.decisions(TARGET_ID, { page: 1, limit: 25 }),
    ).rejects.toBeInstanceOf(ApiContractError);
  });
});

describe("staffApi named commands", () => {
  const commandBody = {
    commandId: "44444444-4444-4444-8444-444444444444",
    expectedAccessVersion: 1,
  };

  const approvalBody = { ...commandBody, department: "SALES" as const };

  it("approves through the named approval endpoint", async () => {
    transportMocks.post.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser({
            status: "ACTIVE",
            department: "SALES",
            staffApprovedAt: "2026-08-03T00:00:00.000Z",
            accessVersion: 2,
          }),
          decision: decision(),
          replayed: false,
        }),
      ),
    );

    const result = await staffApi.approve(TARGET_ID, approvalBody);

    expect(result.decision?.action).toBe("APPROVE");
    expect(result.replayed).toBe(false);
    expect(transportMocks.post).toHaveBeenCalledWith(
      `/staff/${TARGET_ID}/approve`,
      approvalBody,
    );
  });

  it("rejects through the named rejection endpoint", async () => {
    transportMocks.post.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser({
            status: "REJECTED",
            department: null,
            staffApprovedAt: null,
            accessVersion: 2,
          }),
          decision: null,
          replayed: false,
        }),
      ),
    );

    const result = await staffApi.reject(TARGET_ID, commandBody);

    expect(result.decision).toBeNull();
    expect(transportMocks.post).toHaveBeenCalledWith(
      `/staff/${TARGET_ID}/reject`,
      commandBody,
    );
  });

  it("suspends through the named suspension endpoint", async () => {
    transportMocks.post.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser({ status: "SUSPENDED", accessVersion: 3 }),
          decision: null,
          replayed: false,
        }),
      ),
    );

    await staffApi.suspend(TARGET_ID, commandBody);

    expect(transportMocks.post).toHaveBeenCalledWith(
      `/staff/${TARGET_ID}/suspend`,
      commandBody,
    );
  });

  it("reactivates through the named reactivation endpoint", async () => {
    transportMocks.post.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser({ status: "ACTIVE", accessVersion: 4 }),
          decision: null,
          replayed: false,
        }),
      ),
    );

    await staffApi.reactivate(TARGET_ID, commandBody);

    expect(transportMocks.post).toHaveBeenCalledWith(
      `/staff/${TARGET_ID}/reactivate`,
      commandBody,
    );
  });

  it("changes the department through the department patch endpoint", async () => {
    transportMocks.patch.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser({ department: "CUTTING", accessVersion: 3 }),
          decision: null,
          replayed: false,
        }),
      ),
    );

    await staffApi.changeDepartment(TARGET_ID, {
      ...commandBody,
      department: "CUTTING" as const,
    });

    expect(transportMocks.patch).toHaveBeenCalledWith(
      `/staff/${TARGET_ID}/department`,
      { ...commandBody, department: "CUTTING" as const },
    );
    expect(transportMocks.post).not.toHaveBeenCalled();
  });

  it("never forwards a cancellation signal to a dispatched write", async () => {
    transportMocks.post.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser({ accessVersion: 2 }),
          decision: null,
          replayed: false,
        }),
      ),
    );

    await staffApi.suspend(TARGET_ID, commandBody);

    expect(transportMocks.post).toHaveBeenCalledTimes(1);
    expect(transportMocks.post.mock.calls[0]).toHaveLength(2);
  });

  it("rejects a malformed command result", async () => {
    transportMocks.post.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser(),
          decision: null,
          replayed: true,
        }),
      ),
    );

    await expect(
      staffApi.reject(TARGET_ID, commandBody),
    ).rejects.toBeInstanceOf(ApiContractError);
  });

  it("rejects a command result whose decision contradicts the target", async () => {
    transportMocks.post.mockReturnValue(
      resolved(
        envelope({
          staff: employeeUser({ status: "REJECTED", accessVersion: 2 }),
          decision: decision(),
          replayed: false,
        }),
      ),
    );

    await expect(
      staffApi.reject(TARGET_ID, commandBody),
    ).rejects.toBeInstanceOf(ApiContractError);
  });
});
