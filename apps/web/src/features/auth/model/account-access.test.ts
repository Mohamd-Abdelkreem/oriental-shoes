import type { Department, SafeUser } from "@template/contracts";
import { describe, expect, it } from "vitest";

import {
  canEnterWorkspace,
  hasBusinessAccess,
  workspaceDepartment,
} from "./account-access";

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
 * Builds a complete account. Some cases deliberately combine fields that the
 * shared response schema rejects; the workspace model must still deny them
 * instead of repairing them into a department.
 */
const buildUser = (overrides: UserOverrides = {}): SafeUser => ({
  id: "0f4d3a2b-6c1e-4f57-9d38-5a7b9c0e1f22",
  fullName: "Amina Mostaql",
  email: "amina@example.com",
  phone: null,
  role: overrides.role ?? "USER",
  status: overrides.status ?? "ACTIVE",
  department: overrides.department ?? null,
  staffApprovedAt: overrides.staffApprovedAt ?? null,
  accessVersion: 4,
  emailVerifiedAt: overrides.emailVerifiedAt ?? null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

const activeEmployee = (department: Department): SafeUser =>
  buildUser({
    role: "USER",
    status: "ACTIVE",
    department,
    staffApprovedAt: APPROVED_AT,
    emailVerifiedAt: VERIFIED_AT,
  });

const activeAdministrator = (): SafeUser =>
  buildUser({
    role: "ADMIN",
    status: "ACTIVE",
    department: null,
    staffApprovedAt: null,
    emailVerifiedAt: VERIFIED_AT,
  });

describe("hasBusinessAccess", () => {
  it.each(DEPARTMENTS)(
    "grants business access to an active verified %s employee",
    (department) => {
      expect(hasBusinessAccess(activeEmployee(department))).toBe(true);
    },
  );

  it("grants business access to a verified active administrator", () => {
    expect(hasBusinessAccess(activeAdministrator())).toBe(true);
  });

  it.each([
    ["PENDING_VERIFICATION", null],
    ["PENDING_APPROVAL", VERIFIED_AT],
    ["REJECTED", VERIFIED_AT],
    ["SUSPENDED", VERIFIED_AT],
  ] as const)(
    "denies business access to a %s account",
    (status, verifiedAt) => {
      expect(
        hasBusinessAccess(
          buildUser({
            role: "USER",
            status,
            emailVerifiedAt: verifiedAt,
          }),
        ),
      ).toBe(false);
    },
  );

  it("denies business access without staff approval", () => {
    expect(
      hasBusinessAccess(
        buildUser({
          role: "USER",
          status: "ACTIVE",
          department: "SALES",
          staffApprovedAt: null,
          emailVerifiedAt: VERIFIED_AT,
        }),
      ),
    ).toBe(false);
  });

  it("denies business access without a department", () => {
    expect(
      hasBusinessAccess(
        buildUser({
          role: "USER",
          status: "ACTIVE",
          department: null,
          staffApprovedAt: APPROVED_AT,
          emailVerifiedAt: VERIFIED_AT,
        }),
      ),
    ).toBe(false);
  });

  it("denies business access without a verified email", () => {
    expect(
      hasBusinessAccess(
        buildUser({
          role: "USER",
          status: "ACTIVE",
          department: "SALES",
          staffApprovedAt: APPROVED_AT,
          emailVerifiedAt: null,
        }),
      ),
    ).toBe(false);
  });

  it("denies business access to an unverified administrator", () => {
    expect(
      hasBusinessAccess(
        buildUser({
          role: "ADMIN",
          status: "ACTIVE",
          emailVerifiedAt: null,
        }),
      ),
    ).toBe(false);
  });
});

describe("workspaceDepartment", () => {
  it.each(DEPARTMENTS)(
    "maps the %s workspace root to its department",
    (department) => {
      expect(workspaceDepartment(`/${department.toLowerCase()}`)).toBe(
        department,
      );
      expect(
        workspaceDepartment(`/${department.toLowerCase()}/orders/12`),
      ).toBe(department);
      expect(workspaceDepartment(`/${department.toLowerCase()}/`)).toBe(
        department,
      );
    },
  );

  it("does not treat administration as a department", () => {
    expect(workspaceDepartment("/admin")).toBeNull();
    expect(workspaceDepartment("/admin/users")).toBeNull();
  });

  it("returns null for a non workspace path", () => {
    expect(workspaceDepartment("/")).toBeNull();
    expect(workspaceDepartment("")).toBeNull();
    expect(workspaceDepartment("/salesx")).toBeNull();
    expect(workspaceDepartment("/foo")).toBeNull();
  });

  it("ignores a query string or a hash fragment", () => {
    expect(workspaceDepartment("/sales/orders?tab=1")).toBe("SALES");
    expect(workspaceDepartment("/sales/orders#anchor")).toBe("SALES");
  });
});

describe("canEnterWorkspace", () => {
  it.each(DEPARTMENTS)(
    "lets a %s employee enter only its own workspace root",
    (department) => {
      const user = activeEmployee(department);
      const root = `/${department.toLowerCase()}`;

      expect(canEnterWorkspace(user, root)).toBe(true);
      expect(canEnterWorkspace(user, `${root}/orders/12`)).toBe(true);
      expect(canEnterWorkspace(user, `${root}/orders/12?tab=1`)).toBe(true);

      for (const other of DEPARTMENTS) {
        if (other === department) continue;
        expect(canEnterWorkspace(user, `/${other.toLowerCase()}`)).toBe(false);
        expect(
          canEnterWorkspace(user, `/${other.toLowerCase()}/orders/12`),
        ).toBe(false);
      }
    },
  );

  it("denies a sales employee every other workspace root", () => {
    const user = activeEmployee("SALES");

    expect(canEnterWorkspace(user, "/cutting")).toBe(false);
    expect(canEnterWorkspace(user, "/cutting/orders/1")).toBe(false);
    expect(canEnterWorkspace(user, "/admin")).toBe(false);
    expect(canEnterWorkspace(user, "/admin/users")).toBe(false);
  });

  it("lets an administrator enter administration and an employee workspace", () => {
    const user = activeAdministrator();

    expect(canEnterWorkspace(user, "/admin")).toBe(true);
    expect(canEnterWorkspace(user, "/admin/users")).toBe(true);
    expect(canEnterWorkspace(user, "/sales/dashboard")).toBe(true);
  });

  it("denies any non workspace root", () => {
    const user = activeAdministrator();

    expect(canEnterWorkspace(user, "/salesx")).toBe(false);
    expect(canEnterWorkspace(user, "/foo")).toBe(false);
    expect(canEnterWorkspace(user, "/")).toBe(false);
  });

  it("denies a restricted account any workspace root", () => {
    const user = buildUser({
      role: "USER",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: VERIFIED_AT,
    });

    expect(canEnterWorkspace(user, "/sales")).toBe(false);
    expect(canEnterWorkspace(user, "/admin")).toBe(false);
  });

  it("never throws for an odd pathname", () => {
    const user = activeEmployee("SALES");
    const oddPathnames = [
      "",
      "/",
      "//",
      "///sales",
      "/sales//orders",
      "/%2e%2e/admin",
      "/sales\n",
      "sales",
      "/sales?tab=1#anchor",
    ];

    for (const pathname of oddPathnames) {
      expect(() => canEnterWorkspace(user, pathname)).not.toThrow();
      expect(() => workspaceDepartment(pathname)).not.toThrow();
    }
  });
});
