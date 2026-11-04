import {
  safeUserSchema,
  type Department,
  type SafeUser,
  type StaffOperation,
} from "@template/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  availableStaffOperations,
  createStaffCommand,
  staffDepartmentFormSchema,
  type StaffCommandIntent,
} from "./staff-management.model";

const VERIFIED_AT = "2026-01-01T08:00:00.000Z";
const APPROVED_AT = "2026-01-02T08:00:00.000Z";
const CREATED_AT = "2025-12-01T08:00:00.000Z";
const UPDATED_AT = "2026-01-03T08:00:00.000Z";

const TARGET_ID = "0f4d3a2b-6c1e-4f57-9d38-5a7b9c0e1f22";
const COMMAND_ID = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

const DEPARTMENTS: readonly Department[] = [
  "SALES",
  "APPROVAL",
  "CUTTING",
  "PRODUCTION",
  "QUALITY",
  "WAREHOUSE",
];

type StaffOverrides = {
  role?: SafeUser["role"];
  status?: SafeUser["status"];
  department?: SafeUser["department"];
  staffApprovedAt?: SafeUser["staffApprovedAt"];
  emailVerifiedAt?: SafeUser["emailVerifiedAt"];
  accessVersion?: SafeUser["accessVersion"];
};

/**
 * Builds one complete account. The cases below combine only the field sets the
 * shared account schema accepts, so every fixture is a real account state and
 * not a mock of the model.
 */
const buildStaff = (overrides: StaffOverrides = {}): SafeUser => ({
  id: TARGET_ID,
  fullName: "Amina Mostaql",
  email: "amina@example.com",
  phone: null,
  role: overrides.role ?? "USER",
  status: overrides.status ?? "ACTIVE",
  department: overrides.department ?? null,
  staffApprovedAt: overrides.staffApprovedAt ?? null,
  accessVersion: overrides.accessVersion ?? 4,
  emailVerifiedAt: overrides.emailVerifiedAt ?? null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

const pendingEmployee = buildStaff({
  status: "PENDING_APPROVAL",
  emailVerifiedAt: VERIFIED_AT,
});

const rejectedEmployee = buildStaff({
  status: "REJECTED",
  emailVerifiedAt: VERIFIED_AT,
});

const activeApprovedEmployee = buildStaff({
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: APPROVED_AT,
  emailVerifiedAt: VERIFIED_AT,
});

const suspendedApprovedEmployee = buildStaff({
  status: "SUSPENDED",
  department: "SALES",
  staffApprovedAt: APPROVED_AT,
  emailVerifiedAt: VERIFIED_AT,
});

const suspendedUnapprovedEmployee = buildStaff({
  status: "SUSPENDED",
  emailVerifiedAt: VERIFIED_AT,
});

const administrator = buildStaff({
  role: "ADMIN",
  status: "ACTIVE",
  emailVerifiedAt: VERIFIED_AT,
});

const unverifiedEmployee = buildStaff({
  status: "PENDING_VERIFICATION",
});

const ACTION_MATRIX: ReadonlyArray<
  readonly [
    label: string,
    staff: SafeUser,
    operations: readonly StaffOperation[],
  ]
> = [
  ["a verified pending employee", pendingEmployee, ["APPROVE", "REJECT"]],
  ["a rejected employee", rejectedEmployee, ["APPROVE"]],
  [
    "an approved active employee",
    activeApprovedEmployee,
    ["CHANGE_DEPARTMENT", "SUSPEND"],
  ],
  [
    "an approved suspended employee",
    suspendedApprovedEmployee,
    ["CHANGE_DEPARTMENT", "REACTIVATE"],
  ],
  [
    "an unapproved suspended employee",
    suspendedUnapprovedEmployee,
    ["APPROVE"],
  ],
  ["an administrator", administrator, []],
  ["an unverified employee", unverifiedEmployee, []],
];

const ASSIGNMENT_INTENTS: ReadonlyArray<
  readonly [label: string, intent: StaffCommandIntent]
> = [
  ["APPROVE", { operation: "APPROVE", department: "CUTTING" }],
  [
    "CHANGE_DEPARTMENT",
    { operation: "CHANGE_DEPARTMENT", department: "WAREHOUSE" },
  ],
];

const STATE_INTENTS: ReadonlyArray<
  readonly [label: string, intent: StaffCommandIntent]
> = [
  ["REJECT", { operation: "REJECT" }],
  ["SUSPEND", { operation: "SUSPEND" }],
  ["REACTIVATE", { operation: "REACTIVATE" }],
];

const REQUIRED_DRAFTS: ReadonlyArray<readonly [label: string, draft: unknown]> =
  [
    ["an absent selection", {}],
    ["a null selection", { department: null }],
    ["an empty selection", { department: "" }],
    ["a blank selection", { department: "   " }],
  ];

const UNSUPPORTED_DRAFTS: ReadonlyArray<
  readonly [label: string, draft: unknown]
> = [
  ["multiple departments", { department: ["SALES", "CUTTING"] }],
  ["an administration value", { department: "ADMIN" }],
];

describe("availableStaffOperations", () => {
  it.each(ACTION_MATRIX)(
    "offers %s exactly the operations of the visible action matrix",
    (_label, staff, operations) => {
      expect(availableStaffOperations(staff)).toEqual(operations);
    },
  );

  it.each(ACTION_MATRIX)(
    "derives the operations of %s from a real account state",
    (_label, staff) => {
      expect(safeUserSchema.safeParse(staff).success).toBe(true);
    },
  );

  it("offers no employee command to an administrator", () => {
    expect(availableStaffOperations(administrator)).toEqual([]);
  });

  it("offers no employee command to an unverified account", () => {
    expect(availableStaffOperations(unverifiedEmployee)).toEqual([]);
  });

  it("prepares a legacy suspension through approval instead of reactivation", () => {
    const operations = availableStaffOperations(suspendedUnapprovedEmployee);

    expect(operations).toEqual(["APPROVE"]);
    expect(operations).not.toContain("REACTIVATE");
  });

  it("keeps the department assignment and the reactivation of an approved suspension apart", () => {
    const operations = availableStaffOperations(suspendedApprovedEmployee);

    expect(operations).toContain("CHANGE_DEPARTMENT");
    expect(operations).toContain("REACTIVATE");
    expect(operations).not.toContain("APPROVE");
  });
});

describe("staffDepartmentFormSchema", () => {
  it.each(DEPARTMENTS)("accepts the %s department", (department) => {
    const parsed = staffDepartmentFormSchema.safeParse({ department });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ department });
  });

  it.each(REQUIRED_DRAFTS)("rejects %s", (_label, draft) => {
    const parsed = staffDepartmentFormSchema.safeParse(draft);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["department"]);
    expect(parsed.error?.issues[0]?.message).toBe(
      "a department must be selected",
    );
  });

  it.each(UNSUPPORTED_DRAFTS)("rejects %s", (_label, draft) => {
    const parsed = staffDepartmentFormSchema.safeParse(draft);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["department"]);
  });

  it("never defaults an absent selection to a department", () => {
    const parsed = staffDepartmentFormSchema.safeParse({});

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "a department must be selected",
    );
  });

  it("validates only the one department draft", () => {
    const parsed = staffDepartmentFormSchema.safeParse({
      department: "CUTTING",
      role: "ADMIN",
      status: "ACTIVE",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ department: "CUTTING" });
  });
});

describe("createStaffCommand", () => {
  it("shapes an approval command from the intent, the snapshot and the caller identity", () => {
    const command = createStaffCommand(
      { operation: "APPROVE", department: "CUTTING" },
      activeApprovedEmployee,
      COMMAND_ID,
    );

    expect(command).toEqual({
      operation: "APPROVE",
      userId: TARGET_ID,
      body: {
        commandId: COMMAND_ID,
        expectedAccessVersion: activeApprovedEmployee.accessVersion,
        department: "CUTTING",
      },
    });
  });

  it("shapes a department change command from the observed snapshot", () => {
    const command = createStaffCommand(
      { operation: "CHANGE_DEPARTMENT", department: "WAREHOUSE" },
      suspendedApprovedEmployee,
      COMMAND_ID,
    );

    expect(command).toEqual({
      operation: "CHANGE_DEPARTMENT",
      userId: TARGET_ID,
      body: {
        commandId: COMMAND_ID,
        expectedAccessVersion: suspendedApprovedEmployee.accessVersion,
        department: "WAREHOUSE",
      },
    });
  });

  it.each(STATE_INTENTS)(
    "shapes the state-only %s command without a department",
    (label, intent) => {
      const command = createStaffCommand(
        intent,
        activeApprovedEmployee,
        COMMAND_ID,
      );

      expect(command.operation).toBe(label);
      expect(command.userId).toBe(TARGET_ID);
      expect(command.body).toEqual({
        commandId: COMMAND_ID,
        expectedAccessVersion: activeApprovedEmployee.accessVersion,
      });
      expect(command.body).not.toHaveProperty("department");
    },
  );

  it.each(ASSIGNMENT_INTENTS)(
    "shapes the assignment %s command with its required department",
    (label, intent) => {
      const command = createStaffCommand(
        intent,
        activeApprovedEmployee,
        COMMAND_ID,
      );

      expect(command.operation).toBe(label);
      expect(command.body).toHaveProperty("department");
      expect(Object.keys(command.body).sort()).toEqual([
        "commandId",
        "department",
        "expectedAccessVersion",
      ]);
    },
  );

  it("preserves the caller command identity and the observed access version", () => {
    const command = createStaffCommand(
      { operation: "SUSPEND" },
      buildStaff({
        status: "ACTIVE",
        department: "SALES",
        staffApprovedAt: APPROVED_AT,
        emailVerifiedAt: VERIFIED_AT,
        accessVersion: 17,
      }),
      COMMAND_ID,
    );

    expect(command.body.commandId).toBe(COMMAND_ID);
    expect(command.body.expectedAccessVersion).toBe(17);
  });

  it("excludes the actor, the time, the role and every unsupported field", () => {
    const command = createStaffCommand(
      { operation: "SUSPEND" },
      activeApprovedEmployee,
      COMMAND_ID,
    );

    expect(Object.keys(command.body).sort()).toEqual([
      "commandId",
      "expectedAccessVersion",
    ]);
    expect(command.body).not.toHaveProperty("actor");
    expect(command.body).not.toHaveProperty("role");
    expect(command.body).not.toHaveProperty("action");
    expect(command.body).not.toHaveProperty("occurredAt");
    expect(command.body).not.toHaveProperty("targetUserId");
    expect(command.body).not.toHaveProperty("status");
  });

  it("addresses the observed target and not a resolved employee", () => {
    const command = createStaffCommand(
      { operation: "REJECT" },
      pendingEmployee,
      COMMAND_ID,
    );

    expect(command.userId).toBe(pendingEmployee.id);
  });
});

describe("StaffCommandIntent", () => {
  // The assertions below are checked by the TypeScript compiler; vitest
  // executes them as no-ops. They state the contract the dialog relies on.
  it("covers exactly the shared staff operations", () => {
    expectTypeOf<
      StaffCommandIntent["operation"]
    >().toEqualTypeOf<StaffOperation>();
  });

  it("requires a department for every assignment operation", () => {
    expectTypeOf<
      "department" extends keyof Extract<
        StaffCommandIntent,
        { operation: "APPROVE" }
      >
        ? true
        : false
    >().toEqualTypeOf<true>();
    expectTypeOf<
      "department" extends keyof Extract<
        StaffCommandIntent,
        { operation: "CHANGE_DEPARTMENT" }
      >
        ? true
        : false
    >().toEqualTypeOf<true>();
  });

  it("forbids a department for every state-only operation", () => {
    expectTypeOf<
      "department" extends keyof Extract<
        StaffCommandIntent,
        { operation: "REJECT" }
      >
        ? true
        : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "department" extends keyof Extract<
        StaffCommandIntent,
        { operation: "SUSPEND" }
      >
        ? true
        : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "department" extends keyof Extract<
        StaffCommandIntent,
        { operation: "REACTIVATE" }
      >
        ? true
        : false
    >().toEqualTypeOf<false>();
  });
});
