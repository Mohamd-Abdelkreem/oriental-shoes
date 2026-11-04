import type { Department, SafeUser } from "@template/contracts";
import { describe, expect, it } from "vitest";

import {
  defaultWorkspacePath,
  resolvePostLoginPath,
  sanitizeReturnPath,
} from "./safe-return-path";

const VERIFIED_AT = "2026-01-01T08:00:00.000Z";
const APPROVED_AT = "2026-01-02T08:00:00.000Z";
const CREATED_AT = "2025-12-01T08:00:00.000Z";
const UPDATED_AT = "2026-01-03T08:00:00.000Z";

const DEPARTMENTS: readonly Department[] = [
  "SALES",
  "APPROVAL",
  "CUTTING",
  "PRODUCTION",
  "QUALITY",
  "WAREHOUSE",
];

type UserOverrides = {
  role?: SafeUser["role"];
  status?: SafeUser["status"];
  department?: SafeUser["department"];
  staffApprovedAt?: SafeUser["staffApprovedAt"];
  emailVerifiedAt?: SafeUser["emailVerifiedAt"];
};

/**
 * Builds a complete account. Restricted and malformed combinations are
 * deliberate: they must never be guessed into an employee workspace.
 */
const buildUser = (overrides: UserOverrides = {}): SafeUser => ({
  id: "9c8b7a65-4d32-4e18-9f60-1b2c3d4e5f66",
  fullName: "Youssef Nassar",
  email: "youssef@example.com",
  phone: null,
  role: overrides.role ?? "USER",
  status: overrides.status ?? "ACTIVE",
  department: overrides.department ?? null,
  staffApprovedAt: overrides.staffApprovedAt ?? null,
  accessVersion: 7,
  emailVerifiedAt: overrides.emailVerifiedAt ?? null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

const employee = (department: Department): SafeUser =>
  buildUser({
    role: "USER",
    status: "ACTIVE",
    department,
    staffApprovedAt: APPROVED_AT,
    emailVerifiedAt: VERIFIED_AT,
  });

const administrator = (): SafeUser =>
  buildUser({
    role: "ADMIN",
    status: "ACTIVE",
    emailVerifiedAt: VERIFIED_AT,
  });

describe("safe return paths", () => {
  it.each(["/admin/dashboard", "/sales/orders/new", "/warehouse/account"])(
    "allows a project route %s",
    (path) => {
      expect(sanitizeReturnPath(path)).toBe(path);
    },
  );

  it.each([
    "https://attacker.example/admin",
    "//attacker.example/admin",
    "/auth/login",
    "/dashboard",
    "/settings",
    "/special-operations/dashboard",
    "/special-operations/tasks/SHOP-2026-0001",
    "/admin/dashboard?token=secret",
    "/admin%00",
    "/user@example.com",
    "/admin\\redirect",
    "%E0%A4%A",
  ])("rejects an unsafe or removed route %s", (path) => {
    expect(sanitizeReturnPath(path)).toBeNull();
  });

  it("sends an admin to the project admin dashboard by default", () => {
    expect(resolvePostLoginPath(null, administrator())).toBe(
      "/admin/dashboard",
    );
    expect(resolvePostLoginPath("//attacker.example", administrator())).toBe(
      "/admin/dashboard",
    );
  });

  it("sends an employee to its own workspace dashboard by default", () => {
    expect(resolvePostLoginPath(null, employee("SALES"))).toBe(
      "/sales/dashboard",
    );
  });

  it("never guesses a generic account into the sales workspace", () => {
    expect(resolvePostLoginPath(null, buildUser())).toBe("/auth/verify-email");
    expect(
      resolvePostLoginPath(null, buildUser({ emailVerifiedAt: VERIFIED_AT })),
    ).toBe("/auth/pending-approval");
  });
});

describe("defaultWorkspacePath", () => {
  it("lands an administrator in the admin dashboard", () => {
    expect(defaultWorkspacePath(administrator())).toBe("/admin/dashboard");
  });

  it.each(DEPARTMENTS)(
    "lands a %s employee in its own workspace dashboard",
    (department) => {
      expect(defaultWorkspacePath(employee(department))).toBe(
        `/${department.toLowerCase()}/dashboard`,
      );
    },
  );

  it("lands a pending verification account on the verification surface", () => {
    expect(
      defaultWorkspacePath(
        buildUser({ role: "USER", status: "PENDING_VERIFICATION" }),
      ),
    ).toBe("/auth/verify-email");
  });

  it("lands a pending approval account on the pending approval surface", () => {
    expect(
      defaultWorkspacePath(
        buildUser({
          role: "USER",
          status: "PENDING_APPROVAL",
          emailVerifiedAt: VERIFIED_AT,
        }),
      ),
    ).toBe("/auth/pending-approval");
  });

  it("lands a rejected account on the rejection surface", () => {
    expect(
      defaultWorkspacePath(
        buildUser({
          role: "USER",
          status: "REJECTED",
          emailVerifiedAt: VERIFIED_AT,
        }),
      ),
    ).toBe("/auth/rejected");
  });

  it("lands a suspended account on the suspension surface", () => {
    expect(
      defaultWorkspacePath(
        buildUser({
          role: "USER",
          status: "SUSPENDED",
          emailVerifiedAt: VERIFIED_AT,
        }),
      ),
    ).toBe("/auth/suspended");
  });

  it("lands an unverified account on the verification surface", () => {
    expect(
      defaultWorkspacePath(
        buildUser({
          role: "USER",
          status: "ACTIVE",
          department: "SALES",
          staffApprovedAt: APPROVED_AT,
          emailVerifiedAt: null,
        }),
      ),
    ).toBe("/auth/verify-email");
    expect(
      defaultWorkspacePath(
        buildUser({ role: "ADMIN", status: "ACTIVE", emailVerifiedAt: null }),
      ),
    ).toBe("/auth/verify-email");
  });

  it("lands a malformed active employee on a restricted surface", () => {
    expect(
      defaultWorkspacePath(
        buildUser({
          role: "USER",
          status: "ACTIVE",
          department: null,
          staffApprovedAt: APPROVED_AT,
          emailVerifiedAt: VERIFIED_AT,
        }),
      ),
    ).toBe("/auth/pending-approval");
  });
});

describe("resolvePostLoginPath", () => {
  it("keeps an allowed return of the matching department", () => {
    expect(resolvePostLoginPath("/sales/orders/new", employee("SALES"))).toBe(
      "/sales/orders/new",
    );
    expect(
      resolvePostLoginPath("/cutting/orders/new", employee("CUTTING")),
    ).toBe("/cutting/orders/new");
  });

  it("falls back to the permitted landing for a wrong department return", () => {
    expect(resolvePostLoginPath("/cutting/dashboard", employee("SALES"))).toBe(
      "/sales/dashboard",
    );
    expect(resolvePostLoginPath("/sales/dashboard", employee("CUTTING"))).toBe(
      "/cutting/dashboard",
    );
    expect(resolvePostLoginPath("/admin/users", employee("SALES"))).toBe(
      "/sales/dashboard",
    );
  });

  it("keeps an administrator cross department return", () => {
    expect(resolvePostLoginPath("/sales/dashboard", administrator())).toBe(
      "/sales/dashboard",
    );
  });

  it.each([
    null,
    "",
    "https://evil.example/x",
    "//evil.example/x",
    "/sales\u0000/dashboard",
    "/sales?token=x",
  ])(
    "falls back to the permitted landing for the unsafe return %s",
    (value) => {
      expect(resolvePostLoginPath(value, employee("SALES"))).toBe(
        "/sales/dashboard",
      );
    },
  );

  it("falls back to the permitted landing of a restricted account", () => {
    const pending = buildUser({
      role: "USER",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: VERIFIED_AT,
    });

    expect(resolvePostLoginPath("/sales/dashboard", pending)).toBe(
      "/auth/pending-approval",
    );
  });
});
