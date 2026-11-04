import { describe, expect, it } from "vitest";

import {
  staffAccessSnapshotSchema,
  staffApprovalBodySchema,
  staffCommandBodySchema,
  staffCommandDataSchema,
  staffDecisionActionSchema,
  staffDecisionActorSchema,
  staffDecisionSchema,
  staffDecisionsDataSchema,
  staffDepartmentBodySchema,
  staffEmptyQuerySchema,
  staffHistoryQuerySchema,
  staffListDataSchema,
  staffListQuerySchema,
  staffOperationSchema,
  staffUserDataSchema,
  staffUserParamsSchema,
} from "./staff.schema.ts";

const employee = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Template User",
  email: "user@example.com",
  phone: null,
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-18T00:00:00.000Z",
  accessVersion: 4,
  emailVerifiedAt: "2026-08-18T00:00:00.000Z",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const pagination = {
  page: 1,
  limit: 25,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const snapshot = {
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-18T00:00:00.000Z",
  accessVersion: 4,
};

const actor = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Template Admin",
  role: "ADMIN",
  department: null,
};

const decision = {
  id: "33333333-3333-4333-8333-333333333333",
  commandId: "44444444-4444-4444-8444-444444444444",
  action: "APPROVE",
  actor,
  targetUserId: employee.id,
  occurredAt: "2026-08-18T00:00:00.000Z",
  before: {
    ...snapshot,
    status: "PENDING_APPROVAL",
    department: null,
    staffApprovedAt: null,
    accessVersion: 3,
  },
  after: snapshot,
};

describe("staff request contracts", () => {
  it("accepts only a canonicalized user id parameter", () => {
    expect(
      staffUserParamsSchema.parse({
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({ userId: "11111111-1111-4111-8111-111111111111" });
    expect(
      staffUserParamsSchema.parse({
        userId: "11111111-1111-4111-8111-AAAAAAAAAAAA",
      }),
    ).toEqual({ userId: "11111111-1111-4111-8111-aaaaaaaaaaaa" });
    expect(
      staffUserParamsSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        extra: "x",
      }).success,
    ).toBe(false);
    expect(staffUserParamsSchema.safeParse({}).success).toBe(false);
  });

  it("defaults the list scope and trims the search term", () => {
    expect(staffListQuerySchema.parse({})).toEqual({ scope: "all" });
    expect(staffListQuerySchema.parse({ scope: "pending" })).toEqual({
      scope: "pending",
    });
    expect(staffListQuerySchema.parse({ search: "  ada  " })).toEqual({
      scope: "all",
      search: "ada",
    });
  });

  it("omits a blank search instead of filtering on whitespace", () => {
    expect(staffListQuerySchema.parse({ search: "   " })).toEqual({
      scope: "all",
    });
  });

  it("rejects an embedded null character in the search term", () => {
    expect(
      staffListQuerySchema.safeParse({ search: "ada\u0000" }).success,
    ).toBe(false);
  });

  it("accepts raw pagination scalars but rejects other shapes", () => {
    expect(staffListQuerySchema.parse({ page: "2", limit: 50 })).toEqual({
      scope: "all",
      page: "2",
      limit: 50,
    });
    expect(staffListQuerySchema.safeParse({ page: ["2"] }).success).toBe(false);
    expect(
      staffListQuerySchema.safeParse({ limit: { value: 2 } }).success,
    ).toBe(false);
    expect(staffListQuerySchema.safeParse({ page: null }).success).toBe(false);
    expect(
      staffListQuerySchema.safeParse({ page: "x".repeat(33) }).success,
    ).toBe(false);
  });

  it("rejects unknown list query fields", () => {
    expect(staffListQuerySchema.safeParse({ sort: "name" }).success).toBe(
      false,
    );
  });

  it("accepts only page and limit in the history query", () => {
    expect(staffHistoryQuerySchema.parse({})).toEqual({});
    expect(staffHistoryQuerySchema.parse({ page: 2 })).toEqual({ page: 2 });
    expect(staffHistoryQuerySchema.safeParse({ scope: "all" }).success).toBe(
      false,
    );
  });

  it("rejects any field on an empty staff query", () => {
    expect(staffEmptyQuerySchema.parse({})).toEqual({});
    expect(staffEmptyQuerySchema.safeParse({ page: 1 }).success).toBe(false);
  });
});

describe("staff command contracts", () => {
  it("requires a command id and an expected access version", () => {
    expect(
      staffCommandBodySchema.parse({
        commandId: "44444444-4444-4444-8444-444444444444",
        expectedAccessVersion: 0,
      }),
    ).toEqual({
      commandId: "44444444-4444-4444-8444-444444444444",
      expectedAccessVersion: 0,
    });
    expect(
      staffCommandBodySchema.safeParse({
        commandId: "44444444-4444-4444-8444-444444444444",
      }).success,
    ).toBe(false);
  });

  it("canonicalizes the command id to lowercase", () => {
    expect(
      staffCommandBodySchema.parse({
        commandId: "44444444-4444-4444-8444-4444444444AA",
        expectedAccessVersion: 1,
      }).commandId,
    ).toBe("44444444-4444-4444-8444-4444444444aa");
  });

  it("never coerces a string access version", () => {
    expect(
      staffCommandBodySchema.safeParse({
        commandId: "44444444-4444-4444-8444-444444444444",
        expectedAccessVersion: "1",
      }).success,
    ).toBe(false);
    expect(
      staffCommandBodySchema.safeParse({
        commandId: "44444444-4444-4444-8444-444444444444",
        expectedAccessVersion: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects optional fields and defaults in a command body", () => {
    expect(
      staffCommandBodySchema.safeParse({
        commandId: "44444444-4444-4444-8444-444444444444",
        expectedAccessVersion: 1,
        department: "SALES",
      }).success,
    ).toBe(false);
  });

  it("requires exactly one allowed department on approval and change bodies", () => {
    for (const schema of [staffApprovalBodySchema, staffDepartmentBodySchema]) {
      expect(
        schema.parse({
          commandId: "44444444-4444-4444-8444-444444444444",
          expectedAccessVersion: 1,
          department: "CUTTING",
        }).department,
      ).toBe("CUTTING");
      expect(
        schema.safeParse({
          commandId: "44444444-4444-4444-8444-444444444444",
          expectedAccessVersion: 1,
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          commandId: "44444444-4444-4444-8444-444444444444",
          expectedAccessVersion: 1,
          department: null,
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          commandId: "44444444-4444-4444-8444-444444444444",
          expectedAccessVersion: 1,
          department: "",
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          commandId: "44444444-4444-4444-8444-444444444444",
          expectedAccessVersion: 1,
          department: ["SALES"],
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          commandId: "44444444-4444-4444-8444-444444444444",
          expectedAccessVersion: 1,
          department: "ADMIN",
        }).success,
      ).toBe(false);
    }
  });
});

describe("staff projection contracts", () => {
  it("keeps the requested operation distinct from the recorded action", () => {
    expect(staffOperationSchema.options).toEqual([
      "APPROVE",
      "REJECT",
      "CHANGE_DEPARTMENT",
      "SUSPEND",
      "REACTIVATE",
    ]);
    expect(staffDecisionActionSchema.options).toContain("RECONSIDER");
    expect(staffDecisionActionSchema.options).toContain("PREPARE_APPROVAL");
    expect(staffOperationSchema.options).not.toContain("RECONSIDER");
  });

  it("requires an access snapshot to describe status, assignment and version", () => {
    expect(staffAccessSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      staffAccessSnapshotSchema.safeParse({
        status: "ACTIVE",
        department: null,
        staffApprovedAt: null,
        accessVersion: 4,
      }).success,
    ).toBe(true);
    expect(
      staffAccessSnapshotSchema.safeParse({ status: "ACTIVE" }).success,
    ).toBe(false);
  });

  it("describes the historical actor without employee assignment", () => {
    expect(staffDecisionActorSchema.parse(actor)).toEqual(actor);
    expect(
      staffDecisionActorSchema.safeParse({ ...actor, department: "SALES" })
        .success,
    ).toBe(false);
    expect(
      staffDecisionActorSchema.safeParse({ ...actor, role: "USER" }).success,
    ).toBe(false);
  });

  it("parses a retained decision without credentials or request payloads", () => {
    expect(staffDecisionSchema.parse(decision)).toEqual(decision);
    expect(
      staffDecisionSchema.safeParse({ ...decision, password: "secret" })
        .success,
    ).toBe(false);
    expect(
      staffDecisionSchema.safeParse({ ...decision, requestedBody: {} }).success,
    ).toBe(false);
  });

  it("bounds the staff list and reports the global pending count", () => {
    expect(
      staffListDataSchema.parse({
        staff: [employee],
        pagination,
        pendingCount: 2,
      }),
    ).toEqual({ staff: [employee], pagination, pendingCount: 2 });
    expect(
      staffListDataSchema.safeParse({
        staff: [employee],
        pagination,
        pendingCount: -1,
      }).success,
    ).toBe(false);
    expect(
      staffListDataSchema.safeParse({
        staff: Array.from({ length: 101 }, () => employee),
        pagination,
        pendingCount: 0,
      }).success,
    ).toBe(false);
  });

  it("returns a selected staff account", () => {
    expect(staffUserDataSchema.parse({ staff: employee })).toEqual({
      staff: employee,
    });
  });

  it("returns bounded retained decisions", () => {
    expect(
      staffDecisionsDataSchema.parse({ decisions: [decision], pagination }),
    ).toEqual({ decisions: [decision], pagination });
    expect(
      staffDecisionsDataSchema.safeParse({
        decisions: Array.from({ length: 101 }, () => decision),
        pagination,
      }).success,
    ).toBe(false);
  });
});

describe("staff command result relationships", () => {
  it("requires a decision for a replayed result", () => {
    expect(
      staffCommandDataSchema.safeParse({
        staff: employee,
        decision: null,
        replayed: true,
      }).success,
    ).toBe(false);
    expect(
      staffCommandDataSchema.parse({
        staff: employee,
        decision,
        replayed: true,
      }),
    ).toEqual({ staff: employee, decision, replayed: true });
  });

  it("accepts a null decision only as the unchanged outcome", () => {
    expect(
      staffCommandDataSchema.parse({
        staff: employee,
        decision: null,
        replayed: false,
      }),
    ).toEqual({ staff: employee, decision: null, replayed: false });
  });

  it("requires an applied decision to match the returned target authority", () => {
    expect(
      staffCommandDataSchema.safeParse({
        staff: { ...employee, accessVersion: 5 },
        decision,
        replayed: false,
      }).success,
    ).toBe(false);
    expect(
      staffCommandDataSchema.safeParse({
        staff: { ...employee, department: "CUTTING" },
        decision,
        replayed: false,
      }).success,
    ).toBe(false);
  });
});
