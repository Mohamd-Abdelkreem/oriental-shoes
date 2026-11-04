import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { StaffController } from "./staff.controller.js";
import type { StaffService } from "./staff.service.js";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

const staff = {
  id: TARGET_ID,
  fullName: "Template Employee",
  email: "employee@example.com",
  phone: null,
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-18T00:00:00.000Z",
  accessVersion: 3,
  emailVerifiedAt: "2026-08-18T00:00:00.000Z",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const decision = {
  id: "33333333-3333-4333-8333-333333333333",
  commandId: "44444444-4444-4444-8444-444444444444",
  action: "APPROVE",
  actor: {
    id: ACTOR_ID,
    fullName: "Template Admin",
    role: "ADMIN",
    department: null,
  },
  targetUserId: TARGET_ID,
  occurredAt: "2026-08-18T00:00:00.000Z",
  before: {
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
    accessVersion: 2,
  },
  after: {
    status: "ACTIVE",
    department: "SALES",
    staffApprovedAt: "2026-08-18T00:00:00.000Z",
    accessVersion: 3,
  },
};

const responseMock = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
};

const requestMock = (
  overrides: {
    actor?: string | null;
    validated?: Record<string, unknown>;
  } = {},
): Request =>
  ({
    path: "/staff",
    requestId: "request-id",
    user:
      overrides.actor === null
        ? undefined
        : { id: overrides.actor ?? ACTOR_ID },
    validated: overrides.validated,
  }) as unknown as Request;

type StaffServiceMock = {
  listStaff: ReturnType<typeof vi.fn>;
  getStaff: ReturnType<typeof vi.fn>;
  listStaffDecisions: ReturnType<typeof vi.fn>;
  approveStaff: ReturnType<typeof vi.fn>;
  rejectStaff: ReturnType<typeof vi.fn>;
  changeDepartment: ReturnType<typeof vi.fn>;
  suspendStaff: ReturnType<typeof vi.fn>;
  reactivateStaff: ReturnType<typeof vi.fn>;
};

const serviceMock = (): StaffServiceMock => ({
  listStaff: vi.fn().mockResolvedValue({
    staff: [staff],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    pendingCount: 0,
  }),
  getStaff: vi.fn().mockResolvedValue(staff),
  listStaffDecisions: vi.fn().mockResolvedValue({
    decisions: [decision],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  }),
  approveStaff: vi.fn().mockResolvedValue({
    staff,
    decision,
    replayed: false,
  }),
  rejectStaff: vi.fn().mockResolvedValue({
    staff,
    decision: null,
    replayed: false,
  }),
  changeDepartment: vi.fn().mockResolvedValue({
    staff,
    decision,
    replayed: false,
  }),
  suspendStaff: vi.fn().mockResolvedValue({
    staff,
    decision,
    replayed: false,
  }),
  reactivateStaff: vi.fn().mockResolvedValue({
    staff,
    decision,
    replayed: false,
  }),
});

describe("StaffController", () => {
  it("delegates the staff list to the service with the server actor and the validated query", async () => {
    const service = serviceMock();
    const controller = new StaffController(service as unknown as StaffService);
    const response = responseMock();

    await controller.list(
      requestMock({ validated: { query: { scope: "pending" } } }),
      response as unknown as Response,
    );

    expect(service.listStaff).toHaveBeenCalledWith(ACTOR_ID, {
      scope: "pending",
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("delegates the staff read to the service with the server actor and the selected identity", async () => {
    const service = serviceMock();
    const controller = new StaffController(service as unknown as StaffService);
    const response = responseMock();

    await controller.get(
      requestMock({ validated: { params: { userId: TARGET_ID } } }),
      response as unknown as Response,
    );

    expect(service.getStaff).toHaveBeenCalledWith(ACTOR_ID, TARGET_ID);
  });

  it("delegates the retained decision read to the service", async () => {
    const service = serviceMock();
    const controller = new StaffController(service as unknown as StaffService);
    const response = responseMock();

    await controller.decisions(
      requestMock({
        validated: {
          params: { userId: TARGET_ID },
          query: { page: 2 },
        },
      }),
      response as unknown as Response,
    );

    expect(service.listStaffDecisions).toHaveBeenCalledWith(
      ACTOR_ID,
      TARGET_ID,
      { page: 2 },
    );
  });

  it("delegates each staff command to its own named service method", async () => {
    const service = serviceMock();
    const controller = new StaffController(service as unknown as StaffService);
    const response = responseMock();

    const command = {
      commandId: "44444444-4444-4444-8444-444444444444",
      expectedAccessVersion: 2,
    };
    const approval = { ...command, department: "SALES" };

    await controller.approve(
      requestMock({
        validated: { params: { userId: TARGET_ID }, body: approval },
      }),
      response as unknown as Response,
    );
    await controller.reject(
      requestMock({
        validated: { params: { userId: TARGET_ID }, body: command },
      }),
      response as unknown as Response,
    );
    await controller.changeDepartment(
      requestMock({
        validated: { params: { userId: TARGET_ID }, body: approval },
      }),
      response as unknown as Response,
    );
    await controller.suspend(
      requestMock({
        validated: { params: { userId: TARGET_ID }, body: command },
      }),
      response as unknown as Response,
    );
    await controller.reactivate(
      requestMock({
        validated: { params: { userId: TARGET_ID }, body: command },
      }),
      response as unknown as Response,
    );

    expect(service.approveStaff).toHaveBeenCalledWith(
      ACTOR_ID,
      TARGET_ID,
      approval,
    );
    expect(service.rejectStaff).toHaveBeenCalledWith(
      ACTOR_ID,
      TARGET_ID,
      command,
    );
    expect(service.changeDepartment).toHaveBeenCalledWith(
      ACTOR_ID,
      TARGET_ID,
      approval,
    );
    expect(service.suspendStaff).toHaveBeenCalledWith(
      ACTOR_ID,
      TARGET_ID,
      command,
    );
    expect(service.reactivateStaff).toHaveBeenCalledWith(
      ACTOR_ID,
      TARGET_ID,
      command,
    );
  });

  it("never invents an actor when the request carries none", async () => {
    const service = serviceMock();
    const controller = new StaffController(service as unknown as StaffService);
    const response = responseMock();

    await expect(
      controller.list(
        requestMock({ actor: null, validated: { query: {} } }),
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(service.listStaff).not.toHaveBeenCalled();
  });

  it("never treats a missing validated payload as an empty payload", async () => {
    const service = serviceMock();
    const controller = new StaffController(service as unknown as StaffService);
    const response = responseMock();

    await expect(
      controller.approve(
        requestMock({ validated: {} }),
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(service.approveStaff).not.toHaveBeenCalled();
  });

  it("never exposes the internal approver identity in a response body", async () => {
    const service = serviceMock();
    const controller = new StaffController(service as unknown as StaffService);
    const response = responseMock();

    await controller.get(
      requestMock({ validated: { params: { userId: TARGET_ID } } }),
      response as unknown as Response,
    );

    const body = response.json.mock.calls[0]?.[0] as {
      data: { staff: Record<string, unknown> };
    };
    expect(body.data.staff).not.toHaveProperty("staffApprovedById");
    expect(body.data.staff).not.toHaveProperty("passwordHash");
  });
});
