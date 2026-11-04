import { randomUUID } from "node:crypto";

import {
  createDatabaseClient,
  Department,
  StaffDecisionAction,
  StaffOperation,
  UserRole,
  UserStatus,
  type DatabaseClient,
} from "@template/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { AccountRestrictedError } from "../auth/auth.errors.js";
import {
  StaffAccessConflictError,
  StaffCommandConflictError,
  StaffNotFoundError,
} from "./staff.errors.js";
import { StaffService } from "./staff.service.js";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);
const service = new StaffService(database);

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const RESTRICTED_ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const PENDING_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_PENDING_ID = "55555555-5555-4555-8555-555555555555";
const ACTIVE_ID = "66666666-6666-4666-8666-666666666666";
const PERCENT_ID = "77777777-7777-4777-8777-777777777777";
const UNDERSCORE_ID = "88888888-8888-4888-8888-888888888888";
const NO_PHONE_ID = "99999999-9999-4999-8999-999999999999";
const MATCH_FIRST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MATCH_SECOND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MATCH_THIRD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TIE_FIRST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TIE_SECOND_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MISSING_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const COMMAND_ID = "12345678-1234-4234-8234-123456789abc";

const VERIFIED_AT = new Date("2026-01-01T00:00:00.000Z");
const APPROVED_AT = new Date("2026-01-02T00:00:00.000Z");
const BASE_CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

const createUser = async (data: {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role?: (typeof UserRole)[keyof typeof UserRole];
  status?: (typeof UserStatus)[keyof typeof UserStatus];
  emailVerifiedAt?: Date | null;
  department?: Department | null;
  staffApprovedAt?: Date | null;
  staffApprovedById?: string | null;
  accessVersion?: number;
  createdAt?: Date;
}) => {
  await database.user.create({
    data: {
      id: data.id,
      email: data.email,
      fullName: data.fullName,
      phone: data.phone ?? null,
      role: data.role ?? UserRole.USER,
      status: data.status ?? UserStatus.PENDING_APPROVAL,
      emailVerifiedAt:
        data.emailVerifiedAt === undefined ? VERIFIED_AT : data.emailVerifiedAt,
      department: data.department ?? null,
      staffApprovedAt: data.staffApprovedAt ?? null,
      staffApprovedById: data.staffApprovedById ?? null,
      accessVersion: data.accessVersion ?? 0,
      createdAt: data.createdAt ?? BASE_CREATED_AT,
      passwordHash: "argon2-test-hash",
    },
  });
};

const createActiveEmployee = async (data: {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  accessVersion?: number;
  createdAt?: Date;
}): Promise<void> => {
  await createUser({
    ...data,
    status: UserStatus.ACTIVE,
    department: Department.SALES,
    staffApprovedAt: APPROVED_AT,
    staffApprovedById: ADMIN_ID,
    accessVersion: data.accessVersion ?? 1,
  });
};

beforeEach(async () => {
  await resetOwnedIdentityTestData(database);

  await createUser({
    id: ADMIN_ID,
    email: "staff.admin@example.com",
    fullName: "Original Administrator",
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  });
  await createUser({
    id: RESTRICTED_ADMIN_ID,
    email: "staff.restricted@example.com",
    fullName: "Restricted Administrator",
    role: UserRole.ADMIN,
    status: UserStatus.SUSPENDED,
  });
  await createUser({
    id: EMPLOYEE_ID,
    email: "staff.employee@example.com",
    fullName: "Business Employee",
    status: UserStatus.ACTIVE,
    department: Department.SALES,
    staffApprovedAt: APPROVED_AT,
    staffApprovedById: ADMIN_ID,
    accessVersion: 2,
  });
  await createUser({
    id: PENDING_ID,
    email: "staff.pending@example.com",
    fullName: "Pending Employee",
  });
  await createUser({
    id: SECOND_PENDING_ID,
    email: "staff.pending-two@example.com",
    fullName: "Second Pending Employee",
  });
  await createUser({
    id: ACTIVE_ID,
    email: "staff.active@example.com",
    fullName: "Active Employee",
    status: UserStatus.ACTIVE,
    department: Department.CUTTING,
    staffApprovedAt: APPROVED_AT,
    staffApprovedById: ADMIN_ID,
    accessVersion: 4,
  });
  await createActiveEmployee({
    id: PERCENT_ID,
    email: "staff.percent@example.com",
    fullName: "100% Cotton",
    phone: "555-0100",
  });
  await createActiveEmployee({
    id: UNDERSCORE_ID,
    email: "staff.underscore@example.com",
    fullName: "Under_score",
  });
  await createActiveEmployee({
    id: NO_PHONE_ID,
    email: "staff.nophone@example.com",
    fullName: "No Phone Employee",
  });
  await createActiveEmployee({
    id: MATCH_FIRST_ID,
    email: "staff.match-one@example.com",
    fullName: "Match One",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  });
  await createActiveEmployee({
    id: MATCH_SECOND_ID,
    email: "staff.match-two@example.com",
    fullName: "Match Two",
    createdAt: new Date("2026-02-02T00:00:00.000Z"),
  });
  await createActiveEmployee({
    id: MATCH_THIRD_ID,
    email: "staff.match-three@example.com",
    fullName: "Match Three",
    createdAt: new Date("2026-02-03T00:00:00.000Z"),
  });
  await createActiveEmployee({
    id: TIE_FIRST_ID,
    email: "staff.tie-one@example.com",
    fullName: "Tie One",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  });
  await createActiveEmployee({
    id: TIE_SECOND_ID,
    email: "staff.tie-two@example.com",
    fullName: "Tie Two",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  });
});

afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

describe("staff directory reads against a migrated database", () => {
  it("denies a non-administrator caller before any directory row is read", async () => {
    await expect(
      service.listStaff(EMPLOYEE_ID, { scope: "all" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies a restricted administrator and a missing identity", async () => {
    await expect(
      service.listStaff(RESTRICTED_ADMIN_ID, { scope: "all" }),
    ).rejects.toBeInstanceOf(AccountRestrictedError);

    await expect(
      service.listStaff(MISSING_ID, { scope: "all" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("counts the pending employees independently of the current scope and search", async () => {
    const all = await service.listStaff(ADMIN_ID, { scope: "all" });

    expect(all.pagination.total).toBe(14);
    expect(all.pendingCount).toBe(2);
    expect(all.staff.every((member) => member.id !== MISSING_ID)).toBe(true);

    const pending = await service.listStaff(ADMIN_ID, { scope: "pending" });
    expect(pending.pagination.total).toBe(2);
    expect(pending.pendingCount).toBe(2);
    expect(pending.staff.map((member) => member.id).sort()).toEqual(
      [PENDING_ID, SECOND_PENDING_ID].sort(),
    );

    const filtered = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "Pending Employee",
    });
    expect(filtered.pagination.total).toBe(2);
    expect(filtered.pendingCount).toBe(2);
  });

  it("returns the matches that follow the first page", async () => {
    const first = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "Match",
      page: 1,
      limit: 1,
    });
    const second = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "Match",
      page: 2,
      limit: 1,
    });

    expect(first.pagination.total).toBe(3);
    expect(first.pagination.totalPages).toBe(3);
    expect(first.staff.map((member) => member.id)).toEqual([MATCH_THIRD_ID]);
    expect(second.staff.map((member) => member.id)).toEqual([MATCH_SECOND_ID]);
    expect(first.pagination.hasNextPage).toBe(true);
    expect(second.pagination.hasPreviousPage).toBe(true);
  });

  it("treats a wildcard as a literal character and never matches a null phone", async () => {
    const percent = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "%",
    });
    expect(percent.staff.map((member) => member.id)).toEqual([PERCENT_ID]);

    const underscore = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "_",
    });
    expect(underscore.staff.map((member) => member.id)).toEqual([
      UNDERSCORE_ID,
    ]);

    const phone = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "555-0100",
    });
    expect(phone.staff.map((member) => member.id)).toEqual([PERCENT_ID]);
  });

  it("orders equal creation timestamps by the identifier", async () => {
    const directory = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "Tie",
    });

    expect(directory.staff.map((member) => member.id)).toEqual([
      TIE_SECOND_ID,
      TIE_FIRST_ID,
    ]);
  });

  it("returns empty truthful pages for zero and out-of-range pages", async () => {
    const empty = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "no such staff member",
    });

    expect(empty.staff).toEqual([]);
    expect(empty.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    const beyond = await service.listStaff(ADMIN_ID, {
      scope: "all",
      search: "Match",
      page: 9,
      limit: 1,
    });

    expect(beyond.staff).toEqual([]);
    expect(beyond.pagination.total).toBe(3);
    expect(beyond.pagination.totalPages).toBe(3);
    expect(beyond.pagination.hasNextPage).toBe(false);
    expect(beyond.pagination.hasPreviousPage).toBe(true);
  });

  it("reads a selected account and reports a missing target", async () => {
    const staff = await service.getStaff(ADMIN_ID, ACTIVE_ID);

    expect(staff.id).toBe(ACTIVE_ID);
    expect(staff.department).toBe(Department.CUTTING);
    expect(staff).not.toHaveProperty("passwordHash");
    expect(staff).not.toHaveProperty("staffApprovedById");

    await expect(service.getStaff(ADMIN_ID, MISSING_ID)).rejects.toBeInstanceOf(
      StaffNotFoundError,
    );
    await expect(
      service.listStaffDecisions(ADMIN_ID, MISSING_ID, {}),
    ).rejects.toBeInstanceOf(StaffNotFoundError);
  });

  it("retains the recorded actor name after a later profile change", async () => {
    await database.staffDecision.create({
      data: {
        commandId: COMMAND_ID,
        targetId: ACTIVE_ID,
        actorId: ADMIN_ID,
        targetFullName: "Active Employee",
        targetEmail: "staff.active@example.com",
        actorFullName: "Original Administrator",
        actorRole: UserRole.ADMIN,
        actorStatus: UserStatus.ACTIVE,
        actorEmailVerifiedAt: VERIFIED_AT,
        operation: StaffOperation.CHANGE_DEPARTMENT,
        action: StaffDecisionAction.CHANGE_DEPARTMENT,
        requestedDepartment: Department.PRODUCTION,
        beforeVersion: 4,
        afterVersion: 5,
        beforeStatus: UserStatus.ACTIVE,
        afterStatus: UserStatus.ACTIVE,
        beforeDepartment: Department.CUTTING,
        afterDepartment: Department.PRODUCTION,
        beforeApprovedAt: APPROVED_AT,
        afterApprovedAt: APPROVED_AT,
        beforeApprovedById: ADMIN_ID,
        afterApprovedById: ADMIN_ID,
        occurredAt: APPROVED_AT,
      },
    });

    await database.user.update({
      where: { id: ADMIN_ID },
      data: { fullName: "Renamed Administrator" },
    });

    const history = await service.listStaffDecisions(ADMIN_ID, ACTIVE_ID, {});

    expect(history.decisions).toHaveLength(1);
    expect(history.decisions[0]?.actor.fullName).toBe("Original Administrator");
    expect(history.decisions[0]?.actor.role).toBe("ADMIN");
    expect(history.decisions[0]?.actor.department).toBeNull();
    expect(history.decisions[0]?.before.department).toBe(Department.CUTTING);
    expect(history.decisions[0]?.after.department).toBe(Department.PRODUCTION);
  });

  it("returns an empty history for an account without decisions", async () => {
    const history = await service.listStaffDecisions(ADMIN_ID, PENDING_ID, {});

    expect(history.decisions).toEqual([]);
    expect(history.pagination.total).toBe(0);
    expect(history.pagination.totalPages).toBe(0);
  });
});

/**
 * T017: the real StaffService/Prisma boundary for commands, races, replay and
 * rollback. No unit double is used here: every claim is made against the
 * owned migrated PostgreSQL database.
 */
const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

/**
 * Waits until the database reports the expected number of connections that are
 * actually blocked on a lock. This is an observable barrier, not a sleep.
 */
const waitForBlockedLockWaiters = async (expected: number): Promise<void> => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const rows = await database.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND state = 'active'`,
    );
    if (Number(rows[0]?.count ?? 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    "Expected the competing commands to block on the owned row lock.",
  );
};

const createSecondAdministrator = async (): Promise<string> => {
  const id = randomUUID();
  await createUser({
    id,
    email: "staff.second-admin@example.com",
    fullName: "Second Administrator",
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  });
  return id;
};

const commandUuid = (): string => randomUUID();

describe("real staff command boundary against a migrated database", () => {
  it("applies every effective transition with one retained decision", async () => {
    const approve = await service.approveStaff(ADMIN_ID, PENDING_ID, {
      commandId: commandUuid(),
      expectedAccessVersion: 0,
      department: Department.SALES,
    });
    expect(approve.decision?.action).toBe("APPROVE");
    expect(approve.replayed).toBe(false);
    expect(approve.staff.status).toBe(UserStatus.ACTIVE);

    const reject = await service.rejectStaff(ADMIN_ID, SECOND_PENDING_ID, {
      commandId: commandUuid(),
      expectedAccessVersion: 0,
    });
    expect(reject.decision?.action).toBe("REJECT");
    expect(reject.staff.status).toBe(UserStatus.REJECTED);

    const changed = await service.changeDepartment(ADMIN_ID, ACTIVE_ID, {
      commandId: commandUuid(),
      expectedAccessVersion: 4,
      department: Department.PRODUCTION,
    });
    expect(changed.decision?.action).toBe("CHANGE_DEPARTMENT");
    expect(changed.staff.department).toBe(Department.PRODUCTION);
    expect(changed.staff.status).toBe(UserStatus.ACTIVE);

    const suspended = await service.suspendStaff(ADMIN_ID, ACTIVE_ID, {
      commandId: commandUuid(),
      expectedAccessVersion: 5,
    });
    expect(suspended.decision?.action).toBe("SUSPEND");
    expect(suspended.staff.status).toBe(UserStatus.SUSPENDED);
    expect(suspended.staff.department).toBe(Department.PRODUCTION);

    const reactivated = await service.reactivateStaff(ADMIN_ID, ACTIVE_ID, {
      commandId: commandUuid(),
      expectedAccessVersion: 6,
    });
    expect(reactivated.decision?.action).toBe("REACTIVATE");
    expect(reactivated.staff.status).toBe(UserStatus.ACTIVE);

    await expect(database.staffDecision.count()).resolves.toBe(5);
    const target = await database.user.findUniqueOrThrow({
      where: { id: ACTIVE_ID },
    });
    expect(target.accessVersion).toBe(7);
    expect(target.staffApprovedAt).not.toBeNull();
  });

  it("returns an unchanged no-op without reserving the command key", async () => {
    const commandId = commandUuid();
    const noop = await service.approveStaff(ADMIN_ID, ACTIVE_ID, {
      commandId,
      expectedAccessVersion: 4,
      department: Department.CUTTING,
    });

    expect(noop.decision).toBeNull();
    expect(noop.replayed).toBe(false);
    await expect(database.staffDecision.count()).resolves.toBe(0);

    const target = await database.user.findUniqueOrThrow({
      where: { id: ACTIVE_ID },
    });
    expect(target.accessVersion).toBe(4);
    expect(target.department).toBe(Department.CUTTING);
  });

  it("replays an identical command while the current version still matches", async () => {
    const commandId = commandUuid();
    const first = await service.approveStaff(ADMIN_ID, PENDING_ID, {
      commandId,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });
    expect(first.decision).not.toBeNull();

    const replay = await service.approveStaff(ADMIN_ID, PENDING_ID, {
      commandId,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.decision?.id).toBe(first.decision?.id);
    await expect(database.staffDecision.count()).resolves.toBe(1);

    const target = await database.user.findUniqueOrThrow({
      where: { id: PENDING_ID },
    });
    expect(target.accessVersion).toBe(1);
  });

  it("refuses a stored command key that is bound to a different action", async () => {
    const commandId = commandUuid();
    await service.approveStaff(ADMIN_ID, PENDING_ID, {
      commandId,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });

    await expect(
      service.rejectStaff(ADMIN_ID, PENDING_ID, {
        commandId,
        expectedAccessVersion: 1,
      }),
    ).rejects.toBeInstanceOf(StaffCommandConflictError);

    await expect(
      service.approveStaff(ADMIN_ID, SECOND_PENDING_ID, {
        commandId,
        expectedAccessVersion: 0,
        department: Department.SALES,
      }),
    ).rejects.toBeInstanceOf(StaffCommandConflictError);

    await expect(database.staffDecision.count()).resolves.toBe(1);
  });

  it("refuses the original retry once a later revision changed the account", async () => {
    const commandId = commandUuid();
    await service.approveStaff(ADMIN_ID, PENDING_ID, {
      commandId,
      expectedAccessVersion: 0,
      department: Department.SALES,
    });

    // A later legitimate revision moves the account away from the receipt's
    // committed after-state.
    await service.suspendStaff(ADMIN_ID, PENDING_ID, {
      commandId: commandUuid(),
      expectedAccessVersion: 1,
    });

    await expect(
      service.approveStaff(ADMIN_ID, PENDING_ID, {
        commandId,
        expectedAccessVersion: 0,
        department: Department.SALES,
      }),
    ).rejects.toBeInstanceOf(StaffAccessConflictError);
  });

  it("lets exactly one competing command commit when both start from one version", async () => {
    const secondAdmin = await createSecondAdministrator();
    const blocker = createDatabaseClient(databaseUrl);
    const contender = createDatabaseClient(databaseUrl);
    const locked = deferred();
    const release = deferred();
    const holding = blocker.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${PENDING_ID}::uuid FOR UPDATE`;
        locked.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    const holdingSettled = Promise.allSettled([holding]);
    let resultsSettled: Promise<unknown> = Promise.resolve();

    try {
      await Promise.race([locked.promise, holding]);
      const approving = service.approveStaff(ADMIN_ID, PENDING_ID, {
        commandId: commandUuid(),
        expectedAccessVersion: 0,
        department: Department.SALES,
      });
      const rejecting = new StaffService(contender).rejectStaff(
        secondAdmin,
        PENDING_ID,
        {
          commandId: commandUuid(),
          expectedAccessVersion: 0,
        },
      );
      const results = Promise.allSettled([approving, rejecting]);
      resultsSettled = results;

      await waitForBlockedLockWaiters(2);
      release.resolve();
      await holding;

      const outcomes = await results;
      expect(
        outcomes.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = outcomes.find(
        (outcome) => outcome.status === "rejected",
      );
      expect(rejected?.reason).toBeInstanceOf(StaffAccessConflictError);
      const events = await database.staffDecision.findMany();
      expect(events).toHaveLength(1);
      const target = await database.user.findUniqueOrThrow({
        where: { id: PENDING_ID },
      });
      expect(target.accessVersion).toBe(1);
      expect(target.status).toBe(events[0]?.afterStatus);
    } finally {
      release.resolve();
      await holdingSettled;
      await resultsSettled;
      await blocker.$disconnect();
      await contender.$disconnect();
    }
  }, 60_000);

  it("rolls back the loser of the global command-ID unique index race", async () => {
    const secondAdmin = await createSecondAdministrator();
    const sharedCommandId = commandUuid();
    const targetIds = [PENDING_ID, SECOND_PENDING_ID];
    const readTargets = () =>
      database.user.findMany({
        where: { id: { in: targetIds } },
        orderBy: { id: "asc" },
      });
    const before = await readTargets();
    await database.$executeRawUnsafe(
      `CREATE FUNCTION p01_hold_command_race() RETURNS trigger AS $$
       BEGIN
         PERFORM pg_advisory_xact_lock_shared(90211);
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`,
    );
    const gate = createDatabaseClient(databaseUrl);
    const contender = createDatabaseClient(databaseUrl);
    const locked = deferred();
    const release = deferred();
    let holdingSettled: Promise<unknown> = Promise.resolve();
    let resultsSettled: Promise<unknown> = Promise.resolve();

    try {
      await database.$executeRawUnsafe(
        `CREATE TRIGGER p01_hold_command_race BEFORE INSERT ON staff_decisions
         FOR EACH ROW EXECUTE FUNCTION p01_hold_command_race()`,
      );
      const holding = gate.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(90211)`;
          locked.resolve();
          await release.promise;
        },
        { timeout: 15_000 },
      );
      holdingSettled = Promise.allSettled([holding]);
      await Promise.race([locked.promise, holding]);

      const results = Promise.allSettled([
        service.approveStaff(ADMIN_ID, PENDING_ID, {
          commandId: sharedCommandId,
          expectedAccessVersion: 0,
          department: Department.SALES,
        }),
        new StaffService(contender).approveStaff(
          secondAdmin,
          SECOND_PENDING_ID,
          {
            commandId: sharedCommandId,
            expectedAccessVersion: 0,
            department: Department.CUTTING,
          },
        ),
      ]);
      resultsSettled = results;
      // Both are inside BEFORE INSERT, beyond receipt lookup and account update.
      await expect
        .poll(
          async () => {
            const [row] = await database.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_locks AS lock
            JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
           WHERE activity.datname = current_database()
             AND lock.locktype = 'advisory' AND NOT lock.granted
             AND lock.classid = 0 AND lock.objid = 90211 AND lock.objsubid = 1
        `;
            return row?.count;
          },
          { timeout: 5_000 },
        )
        .toBe(2);
      release.resolve();
      await holding;

      const outcomes = await results;
      expect(
        outcomes.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = outcomes.find(
        (outcome) => outcome.status === "rejected",
      );
      expect(rejected?.reason).toBeInstanceOf(StaffCommandConflictError);
      const events = await database.staffDecision.findMany();
      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event).toMatchObject({
        commandId: sharedCommandId,
        afterVersion: 1,
      });
      const after = await readTargets();
      expect(after.find(({ id }) => id === event?.targetId)).toMatchObject({
        accessVersion: 1,
        status: UserStatus.ACTIVE,
        staffApprovedById: event?.actorId,
      });
      expect(after.filter(({ id }) => id !== event?.targetId)).toEqual(
        before.filter(({ id }) => id !== event?.targetId),
      );
    } finally {
      release.resolve();
      await holdingSettled;
      await resultsSettled;
      await gate.$disconnect();
      await contender.$disconnect();
      await database.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS p01_hold_command_race ON staff_decisions`,
      );
      await database.$executeRawUnsafe(`DROP FUNCTION p01_hold_command_race()`);
    }
  }, 60_000);

  it("denies a staff command when the acting administrator was suspended first", async () => {
    await database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${ADMIN_ID}::uuid FOR UPDATE`;
      await tx.user.update({
        where: { id: ADMIN_ID },
        data: { status: UserStatus.SUSPENDED },
      });
    });

    await expect(
      service.approveStaff(ADMIN_ID, PENDING_ID, {
        commandId: commandUuid(),
        expectedAccessVersion: 0,
        department: Department.SALES,
      }),
    ).rejects.toBeInstanceOf(AccountRestrictedError);

    await expect(database.staffDecision.count()).resolves.toBe(0);
    const target = await database.user.findUniqueOrThrow({
      where: { id: PENDING_ID },
    });
    expect(target.accessVersion).toBe(0);
    expect(target.status).toBe(UserStatus.PENDING_APPROVAL);
  });

  it("commits the staff decision before a waiting administrator suspension", async () => {
    // The gate connection owns the advisory key. The owned trigger waits for it,
    // so the staff command is observed while it already holds the actor and
    // target row locks. The ordering is therefore decided by the locks the
    // staff command actually holds, not by the order in which PostgreSQL
    // happens to grant queued waiters.
    const gate = createDatabaseClient(databaseUrl);
    let staffCommandSettled: Promise<unknown> = Promise.resolve();

    try {
      await gate.$executeRawUnsafe(`SELECT pg_advisory_lock(90210)`);
      await database.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION p01_hold_staff_decision() RETURNS trigger AS $$
         BEGIN
           PERFORM pg_advisory_lock(90210);
           PERFORM pg_advisory_unlock(90210);
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;`,
      );
      await database.$executeRawUnsafe(
        `CREATE TRIGGER p01_hold_staff_decision
           BEFORE INSERT ON "staff_decisions"
           FOR EACH ROW EXECUTE FUNCTION p01_hold_staff_decision();`,
      );

      // The staff command takes the actor lock and the target lock, then blocks
      // inside the owned decision trigger while still holding both.
      const staffCommand = service.approveStaff(ADMIN_ID, PENDING_ID, {
        commandId: commandUuid(),
        expectedAccessVersion: 0,
        department: Department.SALES,
      });
      // The command must never outlive this test: an in-flight transaction
      // would keep the row locks and block the next suite's cleanup.
      staffCommandSettled = staffCommand.catch(() => undefined);
      await waitForBlockedLockWaiters(1);

      // The synthetic privileged suspension now requests the same actor lock and
      // must wait for the staff command to release it.
      const suspension = database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${ADMIN_ID}::uuid FOR UPDATE`;
        await tx.user.update({
          where: { id: ADMIN_ID },
          data: {
            status: UserStatus.SUSPENDED,
            accessVersion: { increment: 1 },
          },
        });
      });
      await waitForBlockedLockWaiters(2);

      // Let the staff command finish its decision insert and commit.
      await gate.$executeRawUnsafe(`SELECT pg_advisory_unlock(90210)`);

      await expect(staffCommand).resolves.toMatchObject({ replayed: false });
      await expect(suspension).resolves.toBeUndefined();

      await expect(database.staffDecision.count()).resolves.toBe(1);
      const decision = await database.staffDecision.findFirstOrThrow({
        where: { targetId: PENDING_ID },
      });
      // The decision was recorded while the acting administrator was still
      // eligible, so it committed before the suspension took effect.
      expect(decision.afterStatus).toBe(UserStatus.ACTIVE);
      expect(decision.afterVersion).toBe(1);

      const administrator = await database.user.findUniqueOrThrow({
        where: { id: ADMIN_ID },
      });
      expect(administrator.status).toBe(UserStatus.SUSPENDED);
      expect(administrator.accessVersion).toBe(1);
    } finally {
      // Release the gate first, then wait for the staff command to settle so
      // no transaction of this test survives into another suite.
      await gate.$executeRawUnsafe(`SELECT pg_advisory_unlock(90210)`);
      await staffCommandSettled.catch(() => undefined);
      await database.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS p01_hold_staff_decision ON "staff_decisions";`,
      );
      await database.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS p01_hold_staff_decision();`,
      );
      await gate.$disconnect();
    }
  }, 60_000);

  it("rolls the target update back when the dependent decision insert fails", async () => {
    const before = await database.user.findUniqueOrThrow({
      where: { id: PENDING_ID },
    });
    const failingCommandId = commandUuid();

    await database.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION p01_reject_staff_decision() RETURNS trigger AS $$
       BEGIN
         IF NEW.command_id = '${failingCommandId}'::uuid THEN
           RAISE EXCEPTION 'p01 test owned decision rejection';
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql;`,
    );
    await database.$executeRawUnsafe(
      `CREATE TRIGGER p01_reject_staff_decision
         BEFORE INSERT ON "staff_decisions"
         FOR EACH ROW EXECUTE FUNCTION p01_reject_staff_decision();`,
    );

    try {
      await expect(
        service.approveStaff(ADMIN_ID, PENDING_ID, {
          commandId: failingCommandId,
          expectedAccessVersion: 0,
          department: Department.SALES,
        }),
      ).rejects.toThrow();

      const after = await database.user.findUniqueOrThrow({
        where: { id: PENDING_ID },
      });
      expect(after.status).toBe(before.status);
      expect(after.department).toBe(before.department);
      expect(after.staffApprovedAt).toBe(before.staffApprovedAt);
      expect(after.accessVersion).toBe(before.accessVersion);
      expect(after.updatedAt).toEqual(before.updatedAt);
      await expect(database.staffDecision.count()).resolves.toBe(0);
    } finally {
      await database.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS p01_reject_staff_decision ON "staff_decisions";`,
      );
      await database.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS p01_reject_staff_decision();`,
      );
    }
  }, 60_000);

  it("keeps the retained history immutable and its referenced accounts undeletable", async () => {
    await service.approveStaff(ADMIN_ID, PENDING_ID, {
      commandId: commandUuid(),
      expectedAccessVersion: 0,
      department: Department.SALES,
    });

    await expect(
      database.$executeRawUnsafe(
        `UPDATE "staff_decisions" SET "actor_full_name" = 'Changed'`,
      ),
    ).rejects.toMatchObject({ code: "P2010" });
    await expect(
      database.$executeRawUnsafe(`DELETE FROM "staff_decisions"`),
    ).rejects.toMatchObject({ code: "P2010" });

    // The retained history and the retained approval reference both the actor
    // and the target, so a RESTRICT foreign key refuses the deletion of either.
    const actorDeletion = await database.user
      .delete({ where: { id: ADMIN_ID } })
      .catch((error: unknown) => error);
    expect(actorDeletion).toMatchObject({ code: "P2039" });
    expect(String(actorDeletion)).toContain(
      "violates RESTRICT setting of foreign key constraint",
    );

    const targetDeletion = await database.user
      .delete({ where: { id: PENDING_ID } })
      .catch((error: unknown) => error);
    expect(targetDeletion).toMatchObject({ code: "P2039" });
    expect(String(targetDeletion)).toContain(
      "violates RESTRICT setting of foreign key constraint",
    );
  });
});
