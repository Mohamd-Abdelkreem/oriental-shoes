import { Department, UserRole, UserStatus } from "@template/database";
import { describe, expect, it } from "vitest";

import { mapSafeUser, SAFE_USER_SELECT } from "./users.mapper.js";

const source = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Template User",
  email: "user@example.com",
  phone: null,
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  department: Department.SALES,
  staffApprovedAt: new Date("2026-08-18T00:00:00.000Z"),
  accessVersion: 4,
  emailVerifiedAt: new Date("2026-08-18T00:00:00.000Z"),
  createdAt: new Date("2026-08-18T00:00:00.000Z"),
  updatedAt: new Date("2026-08-19T00:00:00.000Z"),
};

describe("public account projection", () => {
  it("selects exactly the browser-visible fields", () => {
    expect(Object.keys(SAFE_USER_SELECT).sort()).toEqual([
      "accessVersion",
      "createdAt",
      "department",
      "email",
      "emailVerifiedAt",
      "fullName",
      "id",
      "phone",
      "role",
      "staffApprovedAt",
      "status",
      "updatedAt",
    ]);
  });

  it("never selects a credential, a token or the internal approver identity", () => {
    expect(SAFE_USER_SELECT).not.toHaveProperty("passwordHash");
    expect(SAFE_USER_SELECT).not.toHaveProperty("verificationTokenHash");
    expect(SAFE_USER_SELECT).not.toHaveProperty("resetTokenHash");
    expect(SAFE_USER_SELECT).not.toHaveProperty("staffApprovedById");
  });

  it("projects the exact public field keys", () => {
    const mapped = mapSafeUser(source);
    expect(Object.keys(mapped).sort()).toEqual([
      "accessVersion",
      "createdAt",
      "department",
      "email",
      "emailVerifiedAt",
      "fullName",
      "id",
      "phone",
      "role",
      "staffApprovedAt",
      "status",
      "updatedAt",
    ]);
  });

  it("renders timestamps as ISO strings and keeps absent values null", () => {
    const mapped = mapSafeUser(source);
    expect(mapped.createdAt).toBe("2026-08-18T00:00:00.000Z");
    expect(mapped.updatedAt).toBe("2026-08-19T00:00:00.000Z");
    expect(mapped.staffApprovedAt).toBe("2026-08-18T00:00:00.000Z");
    expect(mapped.emailVerifiedAt).toBe("2026-08-18T00:00:00.000Z");
    expect(mapped.phone).toBeNull();

    const withoutAssignment = mapSafeUser({
      ...source,
      status: UserStatus.PENDING_APPROVAL,
      department: null,
      staffApprovedAt: null,
    });
    expect(withoutAssignment.department).toBeNull();
    expect(withoutAssignment.staffApprovedAt).toBeNull();
  });

  it("never emits the internal approver identity", () => {
    const mapped = mapSafeUser({
      ...source,
      staffApprovedById: "22222222-2222-4222-8222-222222222222",
    } as never);
    expect(JSON.stringify(mapped)).not.toContain("22222222-2222-4222-8222");
  });
});
