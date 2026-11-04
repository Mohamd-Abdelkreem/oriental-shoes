/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest expect.objectContaining matchers are typed as any; the exact result projection assertions intentionally use them. */
import {
  staffCommandDataSchema,
  staffDecisionsDataSchema,
  staffListDataSchema,
} from "@template/contracts";
import {
  Department,
  type StaffDecisionAction,
  type StaffOperation,
  UserRole,
  UserStatus,
  type DatabaseClient,
} from "@template/database";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import { AccountRestrictedError } from "../auth/auth.errors.js";
import {
  isStaffCommandIdConflict,
  StaffAccessConflictError,
  StaffAdminTargetForbiddenError,
  StaffCommandConflictError,
  StaffNotFoundError,
  StaffTransitionConflictError,
} from "./staff.errors.js";
import { mapStaffDecision } from "./staff.mapper.js";
import { buildStaffWhere, escapeStaffSearch } from "./staff.queries.js";
import { StaffService } from "./staff.service.js";

const ADMIN_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const OTHER_ID = "cccccccc-3333-4333-8444-333333333333";
const COMMAND_ID = "dddddddd-4444-4444-8444-444444444444";
const DECISION_ID = "ffffffff-6666-4666-8666-666666666666";

const VERIFIED_AT = new Date("2026-11-01T00:00:00.000Z");
const APPROVED_AT = new Date("2026-11-02T00:00:00.000Z");
const CREATED_AT = new Date("2026-11-01T00:00:00.000Z");

type StoredUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: typeof UserRole.USER | typeof UserRole.ADMIN;
  status: (typeof UserStatus)[keyof typeof UserStatus];
  emailVerifiedAt: Date | null;
  department: Department | null;
  staffApprovedAt: Date | null;
  staffApprovedById: string | null;
  accessVersion: number;
  createdAt: Date;
  updatedAt: Date;
  passwordHash: string;
};

type StoredDecision = {
  id: string;
  commandId: string;
  operation: StaffOperation;
  requestedDepartment: Department | null;
  action: StaffDecisionAction;
  actorId: string;
  actorFullName: string;
  actorRole: typeof UserRole.ADMIN;
  targetId: string;
  occurredAt: Date;
  beforeVersion: number;
  beforeStatus: UserStatus;
  beforeDepartment: Department | null;
  beforeApprovedAt: Date | null;
  afterVersion: number;
  afterStatus: UserStatus;
  afterDepartment: Department | null;
  afterApprovedAt: Date | null;
  afterApprovedById: string | null;
};

type FakeStringFilter = { contains?: string; mode?: string };

type FakeUserWhere = {
  id?: string;
  role?: string;
  status?: string;
  accessVersion?: number;
  emailVerifiedAt?: { not: null };
  department?: string | null;
  staffApprovedAt?: Date | null;
  staffApprovedById?: string | null;
  fullName?: FakeStringFilter;
  email?: FakeStringFilter;
  phone?: FakeStringFilter;
  OR?: FakeUserWhere[];
};

type FakeUpdateData = {
  status?: UserStatus;
  department?: Department | null;
  staffApprovedAt?: Date | null;
  staffApprovedById?: string | null;
  accessVersion?: { increment: number };
};

const matchesStringFilter = (
  value: string | null,
  filter: FakeStringFilter | undefined,
): boolean => {
  if (filter?.contains === undefined) {
    return true;
  }
  if (value === null) {
    return false;
  }
  return value.toLowerCase().includes(filter.contains.toLowerCase());
};

const matchesUserWhere = (user: StoredUser, where: FakeUserWhere): boolean => {
  if (where.id !== undefined && user.id !== where.id) return false;
  if (where.role !== undefined && user.role !== where.role) return false;
  if (where.status !== undefined && user.status !== where.status) return false;
  if (
    where.accessVersion !== undefined &&
    user.accessVersion !== where.accessVersion
  ) {
    return false;
  }
  if (where.emailVerifiedAt !== undefined && user.emailVerifiedAt === null) {
    return false;
  }
  if (where.department !== undefined) {
    if (where.department === null) {
      if (user.department !== null) return false;
    } else if (user.department !== where.department) {
      return false;
    }
  }
  if (where.staffApprovedAt !== undefined) {
    if (where.staffApprovedAt === null) {
      if (user.staffApprovedAt !== null) return false;
    } else if (
      user.staffApprovedAt?.getTime() !== where.staffApprovedAt.getTime()
    ) {
      return false;
    }
  }
  if (where.staffApprovedById !== undefined) {
    if (where.staffApprovedById === null) {
      if (user.staffApprovedById !== null) return false;
    } else if (user.staffApprovedById !== where.staffApprovedById) {
      return false;
    }
  }
  if (!matchesStringFilter(user.fullName, where.fullName)) return false;
  if (!matchesStringFilter(user.email, where.email)) return false;
  if (!matchesStringFilter(user.phone, where.phone)) return false;
  if (where.OR !== undefined) {
    const matched = where.OR.some((clause) => matchesUserWhere(user, clause));
    if (!matched) return false;
  }
  return true;
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

type TransactionOptions = Readonly<{
  isolationLevel?: string;
  maxWait?: number;
  timeout?: number;
}>;

type Harness = {
  service: StaffService;
  users: StoredUser[];
  decisions: StoredDecision[];
  runTransaction: ReturnType<typeof vi.fn>;
  transactionOptions: TransactionOptions[];
  create: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

const createHarness = ({
  users,
  decisions = [],
  createFailure,
}: {
  users: StoredUser[];
  decisions?: StoredDecision[];
  createFailure?: {
    error: Error;
    winner?: { decision: StoredDecision; target: Partial<StoredUser> };
  };
}): Harness => {
  const storedUsers = [...users];
  const storedDecisions = [...decisions];

  const tx = {
    $queryRaw: vi.fn(() => Promise.resolve([])),
    user: {
      findUnique: vi.fn((args: { where: { id: string } }) => {
        const found = storedUsers.find((user) => user.id === args.where.id);
        return Promise.resolve(found === undefined ? null : { ...found });
      }),
      findMany: vi.fn(
        (args: { where?: FakeUserWhere; skip?: number; take?: number }) => {
          const rows = storedUsers
            .filter((user) => matchesUserWhere(user, args.where ?? {}))
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime() ||
                compareText(right.id, left.id),
            );
          const skip = args.skip ?? 0;
          return Promise.resolve(
            rows.slice(skip, skip + (args.take ?? rows.length)),
          );
        },
      ),
      count: vi.fn((args: { where?: FakeUserWhere }) =>
        Promise.resolve(
          storedUsers.filter((user) => matchesUserWhere(user, args.where ?? {}))
            .length,
        ),
      ),
      updateMany: vi.fn(
        (args: { where: FakeUserWhere; data: FakeUpdateData }) => {
          const matched = storedUsers.filter((user) =>
            matchesUserWhere(user, args.where),
          );
          for (const user of matched) {
            if (args.data.status !== undefined) {
              user.status = args.data.status;
            }
            if (args.data.department !== undefined) {
              user.department = args.data.department;
            }
            if (args.data.staffApprovedAt !== undefined) {
              user.staffApprovedAt = args.data.staffApprovedAt;
            }
            if (args.data.staffApprovedById !== undefined) {
              user.staffApprovedById = args.data.staffApprovedById;
            }
            if (args.data.accessVersion !== undefined) {
              user.accessVersion += args.data.accessVersion.increment;
            }
            user.updatedAt = new Date();
          }
          return Promise.resolve({ count: matched.length });
        },
      ),
    },
    staffDecision: {
      findUnique: vi.fn((args: { where: { commandId: string } }) => {
        const found = storedDecisions.find(
          (decision) => decision.commandId === args.where.commandId,
        );
        return Promise.resolve(found === undefined ? null : { ...found });
      }),
      findMany: vi.fn(
        (args: {
          where: { targetId: string };
          skip?: number;
          take?: number;
        }) => {
          const rows = storedDecisions
            .filter((decision) => decision.targetId === args.where.targetId)
            .sort(
              (left, right) =>
                right.occurredAt.getTime() - left.occurredAt.getTime() ||
                compareText(right.id, left.id),
            );
          const skip = args.skip ?? 0;
          return Promise.resolve(
            rows.slice(skip, skip + (args.take ?? rows.length)),
          );
        },
      ),
      count: vi.fn((args: { where: { targetId: string } }) =>
        Promise.resolve(
          storedDecisions.filter(
            (decision) => decision.targetId === args.where.targetId,
          ).length,
        ),
      ),
      create: vi.fn((args: { data: Omit<StoredDecision, "id"> }) => {
        if (createFailure !== undefined) {
          // The competing transaction committed its receipt before this attempt.
          const winner = createFailure.winner;
          if (winner !== undefined) {
            const target = storedUsers.find(
              (user) => user.id === winner.decision.targetId,
            );
            if (target !== undefined) {
              Object.assign(target, winner.target);
            }
            storedDecisions.push({ ...winner.decision });
          }
          return Promise.reject(createFailure.error);
        }
        const created: StoredDecision = { id: DECISION_ID, ...args.data };
        storedDecisions.push(created);
        return Promise.resolve(created);
      }),
    },
  };

  const transactionOptions: TransactionOptions[] = [];
  const runTransaction = vi.fn(
    (
      callback: (client: typeof tx) => Promise<unknown>,
      options?: TransactionOptions,
    ) => {
      transactionOptions.push(options ?? {});
      return callback(tx);
    },
  );

  const database = {
    $transaction: runTransaction,
  } as unknown as DatabaseClient;

  return {
    service: new StaffService(database),
    users: storedUsers,
    decisions: storedDecisions,
    runTransaction,
    transactionOptions,
    create: tx.staffDecision.create,
    updateMany: tx.user.updateMany,
  };
};

const administrator = (overrides: Partial<StoredUser> = {}): StoredUser => ({
  id: ADMIN_ID,
  email: "administrator@example.com",
  fullName: "Current Administrator",
  phone: null,
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
  emailVerifiedAt: VERIFIED_AT,
  department: null,
  staffApprovedAt: null,
  staffApprovedById: null,
  accessVersion: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  passwordHash: "never-returned",
  ...overrides,
});

const employee = (overrides: Partial<StoredUser> = {}): StoredUser => ({
  id: EMPLOYEE_ID,
  email: "employee@example.com",
  fullName: "Pending Employee",
  phone: null,
  role: UserRole.USER,
  status: UserStatus.PENDING_APPROVAL,
  emailVerifiedAt: VERIFIED_AT,
  department: null,
  staffApprovedAt: null,
  staffApprovedById: null,
  accessVersion: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  passwordHash: "never-returned",
  ...overrides,
});

const approvedEmployee = (overrides: Partial<StoredUser> = {}): StoredUser =>
  employee({
    status: UserStatus.ACTIVE,
    department: Department.SALES,
    staffApprovedAt: APPROVED_AT,
    staffApprovedById: ADMIN_ID,
    accessVersion: 3,
    ...overrides,
  });

const storedDecision = (
  overrides: Partial<StoredDecision> = {},
): StoredDecision => ({
  id: DECISION_ID,
  commandId: COMMAND_ID,
  operation: "APPROVE",
  requestedDepartment: Department.SALES,
  action: "APPROVE",
  actorId: ADMIN_ID,
  actorFullName: "Current Administrator",
  actorRole: UserRole.ADMIN,
  targetId: EMPLOYEE_ID,
  occurredAt: APPROVED_AT,
  beforeVersion: 0,
  beforeStatus: UserStatus.PENDING_APPROVAL,
  beforeDepartment: null,
  beforeApprovedAt: null,
  afterVersion: 1,
  afterStatus: UserStatus.ACTIVE,
  afterDepartment: Department.SALES,
  afterApprovedAt: APPROVED_AT,
  afterApprovedById: ADMIN_ID,
  ...overrides,
});

describe("staff search and filter rules", () => {
  it("escapes the literal wildcard characters of a search term", () => {
    expect(escapeStaffSearch("50% off _x_ \\y")).toBe(
      "50\\% off \\_x\\_ \\\\y",
    );
  });

  it("selects the verified pending employees for the pending scope only", () => {
    expect(buildStaffWhere({ scope: "pending" })).toEqual({
      role: UserRole.USER,
      status: UserStatus.PENDING_APPROVAL,
      emailVerifiedAt: { not: null },
    });
    expect(buildStaffWhere({ scope: "all" })).toEqual({});
  });

  it("searches the name, the email and the phone case-insensitively", () => {
    const where = buildStaffWhere({ scope: "all", search: "Amina" });

    expect(where.OR).toEqual([
      { fullName: { contains: "Amina", mode: "insensitive" } },
      { email: { contains: "Amina", mode: "insensitive" } },
      { phone: { contains: "Amina", mode: "insensitive" } },
    ]);
  });
});

describe("staff decision projection", () => {
  it("maps the retained actor and the access snapshots without hidden fields", () => {
    const decision = mapStaffDecision(storedDecision());

    expect(decision).toEqual({
      id: DECISION_ID,
      commandId: COMMAND_ID,
      action: "APPROVE",
      actor: {
        id: ADMIN_ID,
        fullName: "Current Administrator",
        role: "ADMIN",
        department: null,
      },
      targetUserId: EMPLOYEE_ID,
      occurredAt: APPROVED_AT.toISOString(),
      before: {
        status: UserStatus.PENDING_APPROVAL,
        department: null,
        staffApprovedAt: null,
        accessVersion: 0,
      },
      after: {
        status: UserStatus.ACTIVE,
        department: Department.SALES,
        staffApprovedAt: APPROVED_AT.toISOString(),
        accessVersion: 1,
      },
    });
    expect(decision).not.toHaveProperty("actor.passwordHash");
    expect(decision).not.toHaveProperty("targetFullName");
  });
});

describe("StaffService reads", () => {
  it("lists the bounded directory with its pagination and pending count", async () => {
    const harness = createHarness({
      users: [
        administrator(),
        approvedEmployee(),
        employee({
          id: OTHER_ID,
          email: "other@example.com",
          fullName: "Other Employee",
        }),
      ],
    });

    const data = await harness.service.listStaff(ADMIN_ID, { scope: "all" });

    expect(staffListDataSchema.parse(data)).toEqual(data);
    expect(data.pendingCount).toBe(1);
    expect(data.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(data.staff.map((member) => member.id)).toEqual([
      OTHER_ID,
      EMPLOYEE_ID,
      ADMIN_ID,
    ]);
    expect(data.staff[1]).not.toHaveProperty("passwordHash");
  });

  it("keeps the pending count independent of the current search", async () => {
    const harness = createHarness({
      users: [
        administrator(),
        approvedEmployee(),
        employee({ id: OTHER_ID, email: "other@example.com" }),
      ],
    });

    const data = await harness.service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "employee@example.com",
    });

    expect(data.staff.map((member) => member.id)).toEqual([EMPLOYEE_ID]);
    expect(data.pagination.total).toBe(1);
    expect(data.pendingCount).toBe(1);
  });

  it("returns an empty page for an out-of-range page", async () => {
    const harness = createHarness({ users: [administrator()] });

    const data = await harness.service.listStaff(ADMIN_ID, {
      scope: "all",
      page: 9,
    });

    expect(data.staff).toEqual([]);
    expect(data.pagination).toEqual({
      page: 9,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it("returns the selected account and reports a missing target", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
    });

    const staff = await harness.service.getStaff(ADMIN_ID, EMPLOYEE_ID);
    expect(staff.id).toBe(EMPLOYEE_ID);
    expect(staff).not.toHaveProperty("passwordHash");

    await expect(
      harness.service.getStaff(ADMIN_ID, OTHER_ID),
    ).rejects.toBeInstanceOf(StaffNotFoundError);
  });

  it("reads the retained decisions of a target and reports a missing target", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
      decisions: [storedDecision()],
    });

    const history = await harness.service.listStaffDecisions(
      ADMIN_ID,
      EMPLOYEE_ID,
      {},
    );

    expect(staffDecisionsDataSchema.parse(history)).toEqual(history);
    expect(history.decisions).toHaveLength(1);
    expect(history.pagination.total).toBe(1);

    await expect(
      harness.service.listStaffDecisions(ADMIN_ID, OTHER_ID, {}),
    ).rejects.toBeInstanceOf(StaffNotFoundError);
  });

  it("denies a non-administrator, a restricted administrator and a missing identity", async () => {
    const employeeHarness = createHarness({
      users: [administrator(), approvedEmployee()],
    });
    await expect(
      employeeHarness.service.listStaff(EMPLOYEE_ID, { scope: "all" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const restrictedHarness = createHarness({
      users: [
        administrator({ status: UserStatus.SUSPENDED }),
        approvedEmployee(),
      ],
    });
    await expect(
      restrictedHarness.service.listStaff(ADMIN_ID, { scope: "all" }),
    ).rejects.toBeInstanceOf(AccountRestrictedError);

    const missingHarness = createHarness({ users: [approvedEmployee()] });
    await expect(
      missingHarness.service.listStaff(ADMIN_ID, { scope: "all" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("reads the directory under a repeatable read transaction", async () => {
    const harness = createHarness({ users: [administrator()] });

    await harness.service.listStaff(ADMIN_ID, { scope: "all" });

    expect(harness.transactionOptions[0]).toMatchObject({
      isolationLevel: "RepeatableRead",
    });
  });
});

describe("StaffService staff commands", () => {
  it("approves a pending employee and records the decision", async () => {
    const harness = createHarness({
      users: [administrator(), employee()],
    });

    const result = await harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
      commandId: COMMAND_ID,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });

    expect(staffCommandDataSchema.parse(result)).toEqual(result);
    expect(result.replayed).toBe(false);
    expect(result.decision?.action).toBe("APPROVE");
    expect(result.staff.status).toBe(UserStatus.ACTIVE);
    expect(result.staff.department).toBe(Department.SALES);
    expect(result.staff.accessVersion).toBe(1);
    expect(result.staff.staffApprovedAt).not.toBeNull();

    const stored = harness.users.find((user) => user.id === EMPLOYEE_ID);
    expect(stored?.status).toBe(UserStatus.ACTIVE);
    expect(stored?.staffApprovedById).toBe(ADMIN_ID);
  });

  it("reconsiders a rejected employee and prepares an unapproved suspension", async () => {
    const reconsider = createHarness({
      users: [administrator(), employee({ status: UserStatus.REJECTED })],
    });

    const reconsidered = await reconsider.service.approveStaff(
      ADMIN_ID,
      EMPLOYEE_ID,
      {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
        department: Department.CUTTING,
      },
    );
    expect(reconsidered.decision?.action).toBe("RECONSIDER");
    expect(reconsidered.staff.status).toBe(UserStatus.ACTIVE);

    const prepared = createHarness({
      users: [administrator(), employee({ status: UserStatus.SUSPENDED })],
    });

    const preparation = await prepared.service.approveStaff(
      ADMIN_ID,
      EMPLOYEE_ID,
      {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
        department: Department.CUTTING,
      },
    );
    expect(preparation.decision?.action).toBe("PREPARE_APPROVAL");
    expect(preparation.staff.status).toBe(UserStatus.SUSPENDED);
    expect(preparation.staff.department).toBe(Department.CUTTING);
  });

  it("leaves a same-intent request unchanged without a decision", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
    });

    const result = await harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
      commandId: COMMAND_ID,
      expectedAccessVersion: 3,
      department: Department.SALES,
    });

    expect(result).toEqual({
      staff: expect.objectContaining({ accessVersion: 3 }),
      decision: null,
      replayed: false,
    });
    expect(harness.updateMany).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("leaves an already rejected, an already suspended and an already active employee unchanged", async () => {
    const rejected = createHarness({
      users: [administrator(), employee({ status: UserStatus.REJECTED })],
    });
    const rejectedResult = await rejected.service.rejectStaff(
      ADMIN_ID,
      EMPLOYEE_ID,
      { commandId: COMMAND_ID, expectedAccessVersion: 0 },
    );
    expect(rejectedResult.decision).toBeNull();
    expect(rejected.updateMany).not.toHaveBeenCalled();

    const suspended = createHarness({
      users: [
        administrator(),
        approvedEmployee({ status: UserStatus.SUSPENDED }),
      ],
    });
    const suspendedResult = await suspended.service.suspendStaff(
      ADMIN_ID,
      EMPLOYEE_ID,
      { commandId: COMMAND_ID, expectedAccessVersion: 3 },
    );
    expect(suspendedResult.decision).toBeNull();

    const active = createHarness({
      users: [administrator(), approvedEmployee()],
    });
    const activeResult = await active.service.reactivateStaff(
      ADMIN_ID,
      EMPLOYEE_ID,
      { commandId: COMMAND_ID, expectedAccessVersion: 3 },
    );
    expect(activeResult.decision).toBeNull();

    const reassigned = createHarness({
      users: [administrator(), approvedEmployee()],
    });
    const reassignedResult = await reassigned.service.changeDepartment(
      ADMIN_ID,
      EMPLOYEE_ID,
      {
        commandId: COMMAND_ID,
        expectedAccessVersion: 3,
        department: Department.SALES,
      },
    );
    expect(reassignedResult.decision).toBeNull();
  });

  it("conflicts on an unsupported source state and on a stale version", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
    });

    await expect(
      harness.service.rejectStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 3,
      }),
    ).rejects.toBeInstanceOf(StaffTransitionConflictError);

    await expect(
      harness.service.suspendStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 1,
      }),
    ).rejects.toBeInstanceOf(StaffAccessConflictError);
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("denies a missing target and an administrator target", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
    });

    await expect(
      harness.service.suspendStaff(ADMIN_ID, OTHER_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
      }),
    ).rejects.toBeInstanceOf(StaffNotFoundError);

    await expect(
      harness.service.suspendStaff(ADMIN_ID, ADMIN_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
      }),
    ).rejects.toBeInstanceOf(StaffAdminTargetForbiddenError);
  });

  it("replays an exact receipt without appending a new decision", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
      decisions: [
        storedDecision({
          afterVersion: 3,
          afterStatus: UserStatus.ACTIVE,
          afterDepartment: Department.SALES,
          afterApprovedAt: APPROVED_AT,
        }),
      ],
    });

    const result = await harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
      commandId: COMMAND_ID,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });

    expect(result.replayed).toBe(true);
    expect(result.decision?.commandId).toBe(COMMAND_ID);
    expect(result.staff.accessVersion).toBe(3);
    expect(harness.updateMany).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("refuses to replay a receipt whose approval identity no longer matches", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
      decisions: [
        storedDecision({
          afterVersion: 3,
          afterStatus: UserStatus.ACTIVE,
          afterDepartment: Department.SALES,
          afterApprovedAt: APPROVED_AT,
          afterApprovedById: "bbbbbbbb-2222-4222-8222-222222222222",
        }),
      ],
    });

    await expect(
      harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
        department: Department.SALES,
      }),
    ).rejects.toBeInstanceOf(StaffAccessConflictError);
    expect(harness.updateMany).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("conflicts when the stored receipt is bound to a different request", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee()],
      decisions: [storedDecision()],
    });

    await expect(
      harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
        department: Department.CUTTING,
      }),
    ).rejects.toBeInstanceOf(StaffCommandConflictError);

    await expect(
      harness.service.suspendStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
      }),
    ).rejects.toBeInstanceOf(StaffCommandConflictError);

    await expect(
      harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 7,
        department: Department.SALES,
      }),
    ).rejects.toBeInstanceOf(StaffCommandConflictError);
  });

  it("conflicts when the recorded result no longer describes the target", async () => {
    const harness = createHarness({
      users: [administrator(), approvedEmployee({ accessVersion: 4 })],
      decisions: [storedDecision()],
    });

    await expect(
      harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
        department: Department.SALES,
      }),
    ).rejects.toBeInstanceOf(StaffAccessConflictError);
  });

  it("runs a staff command under a read committed transaction", async () => {
    const harness = createHarness({
      users: [administrator(), employee()],
    });

    await harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
      commandId: COMMAND_ID,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });

    expect(harness.transactionOptions[0]).toMatchObject({
      isolationLevel: "ReadCommitted",
    });
  });
});

describe("staff command identity recognition", () => {
  const commandIdConflict = Object.assign(
    new Error("Unique constraint failed on the fields: (`command_id`)"),
    {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: {
            kind: "UniqueConstraintViolation",
            constraint: { fields: ["command_id"] },
          },
        },
      },
    },
  );

  const unrelatedConflict = Object.assign(
    new Error("Unique constraint failed on the fields: (`email`)"),
    {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: {
            kind: "UniqueConstraintViolation",
            constraint: { fields: ["email"] },
          },
        },
      },
    },
  );

  it("recognizes only the staff command identifier conflict", () => {
    expect(isStaffCommandIdConflict(commandIdConflict)).toBe(true);
    expect(isStaffCommandIdConflict(unrelatedConflict)).toBe(false);
    expect(isStaffCommandIdConflict(new Error("boom"))).toBe(false);
    expect(isStaffCommandIdConflict({ code: "P2002" })).toBe(false);
  });

  it("does not classify an unrelated unique violation as a command replay", async () => {
    const harness = createHarness({
      users: [administrator(), employee()],
      createFailure: { error: unrelatedConflict },
    });

    await expect(
      harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
        commandId: COMMAND_ID,
        expectedAccessVersion: 0,
        department: Department.SALES,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(harness.runTransaction).toHaveBeenCalledTimes(1);
  });

  it("reclassifies a competing command identifier race with a fresh transaction", async () => {
    const winnerApproval = new Date("2026-11-03T09:00:00.000Z");
    const harness = createHarness({
      users: [administrator(), employee()],
      createFailure: {
        error: commandIdConflict,
        winner: {
          decision: storedDecision({
            id: "99999999-7777-4777-8777-777777777777",
            afterApprovedAt: winnerApproval,
          }),
          target: {
            status: UserStatus.ACTIVE,
            department: Department.SALES,
            staffApprovedAt: winnerApproval,
            staffApprovedById: ADMIN_ID,
            accessVersion: 1,
          },
        },
      },
    });

    const result = await harness.service.approveStaff(ADMIN_ID, EMPLOYEE_ID, {
      commandId: COMMAND_ID,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });

    expect(result.replayed).toBe(true);
    expect(result.decision?.commandId).toBe(COMMAND_ID);
    expect(harness.runTransaction).toHaveBeenCalledTimes(2);
  });
});
