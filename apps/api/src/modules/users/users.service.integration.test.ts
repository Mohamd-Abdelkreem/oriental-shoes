import {
  createDatabaseClient,
  Department,
  UserRole,
  UserStatus,
} from "@template/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import { generateHash } from "../../infrastructure/security/index.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { AccountRestrictedError } from "../auth/auth.errors.js";
import { UsersService } from "./users.service.js";

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database = createDatabaseClient(databaseUrl);
const service = new UsersService(database);

const INITIAL_PASSWORD = "initial-secure-password";

const createUserRow = async (input: {
  email: string;
  role?: UserRole;
  status: UserStatus;
  department?: Department | null;
  staffApprovedById?: string | null;
}) => {
  const pendingVerification = input.status === UserStatus.PENDING_VERIFICATION;
  const emailVerifiedAt = pendingVerification ? null : new Date();
  const staffApprovedById = input.staffApprovedById ?? null;

  return database.user.create({
    data: {
      email: input.email,
      fullName: "Fixture User",
      passwordHash: await generateHash(INITIAL_PASSWORD),
      role: input.role ?? UserRole.USER,
      status: input.status,
      emailVerifiedAt,
      department: input.department ?? null,
      staffApprovedAt: staffApprovedById === null ? null : new Date(),
      staffApprovedById,
    },
  });
};

const createApprover = async () =>
  createUserRow({
    email: "approver@example.com",
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  });

describe("UsersService with PostgreSQL", () => {
  beforeEach(async () => {
    await resetOwnedIdentityTestData(database);
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  describe("current identity", () => {
    it("returns the own current state for a restricted identity", async () => {
      const pending = await createUserRow({
        email: "pending@example.com",
        status: UserStatus.PENDING_APPROVAL,
      });

      const current = await service.getCurrentUser(pending.id);

      expect(current.id).toBe(pending.id);
      expect(current.status).toBe(UserStatus.PENDING_APPROVAL);
      expect(current.department).toBeNull();
      expect(current.staffApprovedAt).toBeNull();
      expect(current).not.toHaveProperty("passwordHash");
      expect(current).not.toHaveProperty("staffApprovedById");
    });

    it("returns the current row after the stored state changed", async () => {
      const approver = await createApprover();
      const employee = await createUserRow({
        email: "employee@example.com",
        status: UserStatus.ACTIVE,
        department: Department.SALES,
        staffApprovedById: approver.id,
      });
      await database.user.update({
        where: { id: employee.id },
        data: { accessVersion: 4 },
      });

      const current = await service.getCurrentUser(employee.id);

      expect(current.accessVersion).toBe(4);
      expect(current.status).toBe(UserStatus.ACTIVE);
      expect(current.department).toBe(Department.SALES);
    });

    it("rejects a missing identity with 401", async () => {
      await expect(
        service.getCurrentUser("1b3d904e-a46c-4dd8-9cb7-d0767546ea95"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("profile update", () => {
    it("requires current business eligibility", async () => {
      const pending = await createUserRow({
        email: "pending@example.com",
        status: UserStatus.PENDING_APPROVAL,
      });

      await expect(
        service.updateCurrentUser(pending.id, { fullName: "Renamed User" }),
      ).rejects.toBeInstanceOf(AccountRestrictedError);

      const stored = await database.user.findUniqueOrThrow({
        where: { id: pending.id },
      });
      expect(stored.fullName).toBe("Fixture User");
    });

    it("denies a waiting profile write after suspension commits", async () => {
      const approver = await createApprover();
      const employee = await createUserRow({
        email: "employee@example.com",
        status: UserStatus.ACTIVE,
        department: Department.SALES,
        staffApprovedById: approver.id,
      });
      await database.user.update({
        where: { id: employee.id },
        data: { phone: "+201000000000" },
      });
      const contender = createDatabaseClient(databaseUrl);
      const blocker = createDatabaseClient(databaseUrl);
      const locked = deferred<number>();
      const release = deferred<undefined>();
      const suspension = blocker.$transaction(
        async (tx) => {
          const [session] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          if (session === undefined)
            throw new Error("Missing suspension session.");
          const suspended = await tx.user.update({
            where: { id: employee.id },
            data: {
              status: UserStatus.SUSPENDED,
              accessVersion: { increment: 1 },
            },
          });
          locked.resolve(session.pid);
          await release.promise;
          return suspended;
        },
        { timeout: 15_000 },
      );
      const suspensionSettled = Promise.allSettled([suspension]);
      let saveSettled: Promise<unknown> = Promise.resolve();

      try {
        const blockerPid = await Promise.race([
          locked.promise,
          suspension.then(() => {
            throw new Error("Suspension committed before the profile write.");
          }),
        ]);
        const save = new UsersService(contender).updateCurrentUser(
          employee.id,
          {
            fullName: "Renamed User",
            phone: null,
          },
        );
        saveSettled = Promise.allSettled([save]);
        await expect
          .poll(
            async () => {
              const [waiter] = await database.$queryRaw<Array<{ pid: number }>>`
            SELECT pid FROM pg_stat_activity
             WHERE datname = current_database()
               AND wait_event_type = 'Lock'
               AND query LIKE '%FROM "users"%FOR UPDATE'
               AND ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
          `;
              return waiter?.pid;
            },
            { timeout: 4_000 },
          )
          .toBeTypeOf("number");

        release.resolve(undefined);
        const suspended = await suspension;
        await expect(save).rejects.toBeInstanceOf(AccountRestrictedError);
        expect(
          await database.user.findUnique({ where: { id: employee.id } }),
        ).toEqual(suspended);
        expect(await database.staffDecision.count()).toBe(0);
      } finally {
        release.resolve(undefined);
        await suspensionSettled;
        await saveSettled;
        await blocker.$disconnect();
        await contender.$disconnect();
      }
    });

    it("performs no write for an unchanged profile", async () => {
      const approver = await createApprover();
      const employee = await createUserRow({
        email: "employee@example.com",
        status: UserStatus.ACTIVE,
        department: Department.SALES,
        staffApprovedById: approver.id,
      });
      const before = await database.user.findUniqueOrThrow({
        where: { id: employee.id },
      });

      const current = await service.updateCurrentUser(employee.id, {
        fullName: "Fixture User",
      });

      expect(current.fullName).toBe("Fixture User");
      const after = await database.user.findUniqueOrThrow({
        where: { id: employee.id },
      });
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(after.accessVersion).toBe(before.accessVersion);
    });

    it("updates only the supplied profile fields", async () => {
      const approver = await createApprover();
      const employee = await createUserRow({
        email: "employee@example.com",
        status: UserStatus.ACTIVE,
        department: Department.SALES,
        staffApprovedById: approver.id,
      });
      const before = await database.user.update({
        where: { id: employee.id },
        data: { phone: "+201000000000" },
      });

      const current = await service.updateCurrentUser(employee.id, {
        fullName: "  Renamed User  ",
      });

      expect(current.fullName).toBe("Renamed User");
      const after = await database.user.findUniqueOrThrow({
        where: { id: employee.id },
      });
      expect(after.fullName).toBe("Renamed User");
      expect(after.phone).toBe(before.phone);
      expect(after.status).toBe(before.status);
      expect(after.role).toBe(before.role);
      expect(after.department).toBe(before.department);
      expect(after.staffApprovedAt).toEqual(before.staffApprovedAt);
      expect(after.staffApprovedById).toBe(before.staffApprovedById);
      expect(after.accessVersion).toBe(before.accessVersion);
      await expect(database.staffDecision.count()).resolves.toBe(0);
    });

    it("clears an explicitly blank phone", async () => {
      const approver = await createApprover();
      const employee = await createUserRow({
        email: "employee@example.com",
        status: UserStatus.ACTIVE,
        department: Department.SALES,
        staffApprovedById: approver.id,
      });
      await database.user.update({
        where: { id: employee.id },
        data: { phone: "+201000000000" },
      });

      const current = await service.updateCurrentUser(employee.id, {
        phone: "   ",
      });

      expect(current.phone).toBeNull();
      const after = await database.user.findUniqueOrThrow({
        where: { id: employee.id },
      });
      expect(after.phone).toBeNull();
    });
  });
});
