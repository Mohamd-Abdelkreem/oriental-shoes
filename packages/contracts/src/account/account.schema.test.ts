import { describe, expect, it } from "vitest";

import {
  ACCOUNT_RESPONSE_FIELD_ALLOWLIST,
  authEmptyDataSchema,
  authNeutralDataSchema,
  resetTokenValidationDataSchema,
  safeUserSchema,
} from "./account.schema.ts";

const verifiedActiveEmployee = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Template User",
  email: "user@example.com",
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

describe("safe account contracts", () => {
  it("accepts exactly the approved browser-visible user fields", () => {
    expect(Object.keys(verifiedActiveEmployee).sort()).toEqual(
      [...ACCOUNT_RESPONSE_FIELD_ALLOWLIST].sort(),
    );
    expect(safeUserSchema.parse(verifiedActiveEmployee)).toEqual(
      verifiedActiveEmployee,
    );
  });

  it("rejects password and token storage fields", () => {
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        passwordHash: "secret",
      }).success,
    ).toBe(false);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        resetTokenHash: "secret",
      }).success,
    ).toBe(false);
  });

  it("never exposes the internal approver identity", () => {
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        staffApprovedById: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(false);
  });

  it("requires explicit department, approval and version fields", () => {
    const { department, staffApprovedAt, accessVersion, ...withoutAssignment } =
      verifiedActiveEmployee;
    expect(department).toBe("SALES");
    expect(staffApprovedAt).not.toBeNull();
    expect(accessVersion).toBe(3);
    expect(safeUserSchema.safeParse(withoutAssignment).success).toBe(false);
  });

  it("keeps null distinct from omission", () => {
    const pendingApproval = {
      ...verifiedActiveEmployee,
      status: "PENDING_APPROVAL",
      department: null,
      staffApprovedAt: null,
    };
    expect(safeUserSchema.safeParse(pendingApproval).success).toBe(true);
    expect(
      safeUserSchema.safeParse({
        ...pendingApproval,
        department: undefined,
      }).success,
    ).toBe(false);
  });

  it("requires an unverified pending-verification account to have no employee fields", () => {
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        status: "PENDING_VERIFICATION",
        emailVerifiedAt: null,
        department: null,
        staffApprovedAt: null,
      }).success,
    ).toBe(true);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        status: "PENDING_VERIFICATION",
        department: null,
        staffApprovedAt: null,
      }).success,
    ).toBe(false);
  });

  it("rejects an active employee without exactly one department and approval", () => {
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        department: null,
      }).success,
    ).toBe(false);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        staffApprovedAt: null,
      }).success,
    ).toBe(false);
  });

  it("requires a suspended employee to carry both or neither assignment fields", () => {
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        status: "SUSPENDED",
      }).success,
    ).toBe(true);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        status: "SUSPENDED",
        department: null,
      }).success,
    ).toBe(false);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        status: "SUSPENDED",
        staffApprovedAt: null,
      }).success,
    ).toBe(false);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        status: "SUSPENDED",
        department: null,
        staffApprovedAt: null,
      }).success,
    ).toBe(true);
  });

  it("exempts administrators from employee assignment fields and review states", () => {
    const administrator = {
      ...verifiedActiveEmployee,
      role: "ADMIN",
      department: null,
      staffApprovedAt: null,
    };
    expect(safeUserSchema.safeParse(administrator).success).toBe(true);
    expect(
      safeUserSchema.safeParse({
        ...administrator,
        department: "SALES",
      }).success,
    ).toBe(false);
    expect(
      safeUserSchema.safeParse({
        ...administrator,
        status: "REJECTED",
      }).success,
    ).toBe(false);
  });

  it("rejects a negative or oversized access version", () => {
    expect(
      safeUserSchema.safeParse({ ...verifiedActiveEmployee, accessVersion: -1 })
        .success,
    ).toBe(false);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        accessVersion: 2_147_483_648,
      }).success,
    ).toBe(false);
    expect(
      safeUserSchema.safeParse({
        ...verifiedActiveEmployee,
        accessVersion: "3",
      }).success,
    ).toBe(false);
  });
});

describe("existing account response shapes", () => {
  it("describes the neutral, empty and reset-validation payloads", () => {
    expect(
      authNeutralDataSchema.parse({ message: "If eligible, we will email." }),
    ).toEqual({ message: "If eligible, we will email." });
    expect(authNeutralDataSchema.safeParse({ message: "" }).success).toBe(
      false,
    );
    expect(authNeutralDataSchema.safeParse({}).success).toBe(false);

    expect(authEmptyDataSchema.parse({})).toEqual({});
    expect(authEmptyDataSchema.safeParse({ extra: true }).success).toBe(false);

    expect(resetTokenValidationDataSchema.parse({ valid: true })).toEqual({
      valid: true,
    });
    expect(
      resetTokenValidationDataSchema.safeParse({ valid: false }).success,
    ).toBe(false);
  });
});
