import { Department, UserRole, UserStatus } from "@template/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "@template/database";

import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
} from "./account-authority.js";
import { AccountRestrictedError } from "./auth.errors.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);

const ADMIN_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "bbbbbbbb-2222-4222-8222-222222222222";

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  await database.user.create({
    data: {
      id: ADMIN_ID,
      email: "authority.admin@example.com",
      passwordHash: "argon2-test-hash",
      fullName: "Authority Admin",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
  await database.user.create({
    data: {
      id: EMPLOYEE_ID,
      email: "authority.employee@example.com",
      passwordHash: "argon2-test-hash",
      fullName: "Authority Employee",
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      department: Department.SALES,
      staffApprovedAt: new Date(),
      staffApprovedById: ADMIN_ID,
      accessVersion: 3,
    },
  });
});

afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

describe("account authority against a migrated database", () => {
  it("loads exactly the current authority fields of a live account", async () => {
    await database.$transaction(async (tx) => {
      await lockAccountRows(tx, [EMPLOYEE_ID], "read");
      const account = await loadIdentityAccount(tx, EMPLOYEE_ID);

      expect(account.id).toBe(EMPLOYEE_ID);
      expect(account.department).toBe(Department.SALES);
      expect(account.accessVersion).toBe(3);
      expect(account.staffApprovedById).toBe(ADMIN_ID);
      expect(account).not.toHaveProperty("passwordHash");
      expect(account).not.toHaveProperty("verificationTokenHash");
      expect(account).not.toHaveProperty("resetTokenHash");
      expect(() => {
        assertBusinessAuthority(account);
      }).not.toThrow();
    });
  });

  it("serializes a current-authority check against a committed suspension", async () => {
    const writer = createDatabaseClient(databaseUrl);
    const reader = createDatabaseClient(databaseUrl);
    const writerLocked = deferred();
    const releaseWriter = deferred();
    let writerPid: number | undefined;
    const writing = writer.$transaction(
      async (tx) => {
        const [session] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        writerPid = session?.pid;
        await lockAccountRows(tx, [EMPLOYEE_ID], "write");
        const account = await loadIdentityAccount(tx, EMPLOYEE_ID);
        expect(() => {
          assertBusinessAuthority(account);
        }).not.toThrow();
        writerLocked.resolve();
        await releaseWriter.promise;
        await tx.user.update({
          where: { id: EMPLOYEE_ID },
          data: { status: UserStatus.SUSPENDED },
        });
        return "committed";
      },
      { timeout: 15_000 },
    );
    const writerSettled = Promise.allSettled([writing]);
    let readerSettled: Promise<unknown> = Promise.resolve();

    try {
      await Promise.race([writerLocked.promise, writing]);
      expect(writerPid).toBeDefined();
      const reading = reader.$transaction(
        async (tx) => {
          await lockAccountRows(tx, [EMPLOYEE_ID], "read");
          return loadIdentityAccount(tx, EMPLOYEE_ID);
        },
        { timeout: 15_000 },
      );
      readerSettled = Promise.allSettled([reading]);
      await expect
        .poll(
          async () => {
            const [waiter] = await database.$queryRaw<Array<{ pid: number }>>`
          SELECT pid FROM pg_stat_activity
           WHERE datname = current_database()
             AND wait_event_type = 'Lock'
             AND query LIKE '%FROM "users"%FOR SHARE'
             AND ${writerPid ?? -1}::integer = ANY(pg_blocking_pids(pid))
        `;
            return waiter?.pid;
          },
          { timeout: 5_000 },
        )
        .toBeTypeOf("number");

      releaseWriter.resolve();
      await expect(writing).resolves.toBe("committed");

      const observed = await reading;
      // After the committed suspension the current row denies business authority.
      expect(observed.status).toBe(UserStatus.SUSPENDED);
      expect(() => {
        assertBusinessAuthority(observed);
      }).toThrow(AccountRestrictedError);
    } finally {
      releaseWriter.resolve();
      await writerSettled;
      await readerSettled;
      await writer.$disconnect();
      await reader.$disconnect();
    }
  }, 60_000);

  it("sees exactly one current department after a reassignment", async () => {
    await database.$transaction(async (tx) => {
      await lockAccountRows(tx, [EMPLOYEE_ID], "write");
      await tx.user.update({
        where: { id: EMPLOYEE_ID },
        data: {
          department: Department.CUTTING,
          accessVersion: { increment: 1 },
        },
      });
    });

    const account = await database.$transaction(async (tx) => {
      await lockAccountRows(tx, [EMPLOYEE_ID], "read");
      return loadIdentityAccount(tx, EMPLOYEE_ID);
    });

    expect(account.department).toBe(Department.CUTTING);
    expect(account.accessVersion).toBe(4);
    expect(() => {
      assertBusinessAuthority(account);
    }).not.toThrow();
    expect(() => {
      assertBusinessAuthority(account, Department.SALES);
    }).toThrow();
  });

  it("denies an account that no longer exists", async () => {
    await database.$transaction(async (tx) => {
      await lockAccountRows(tx, [EMPLOYEE_ID], "write");
      await tx.user.delete({ where: { id: EMPLOYEE_ID } });
    });

    await expect(
      database.$transaction(async (tx) => loadIdentityAccount(tx, EMPLOYEE_ID)),
    ).rejects.toThrow();
  });
});
