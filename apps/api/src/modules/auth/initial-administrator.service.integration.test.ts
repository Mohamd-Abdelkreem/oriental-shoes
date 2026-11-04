import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  UserRole,
  UserStatus,
  createDatabaseClient,
  type DatabaseClient,
} from "@template/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  InitialAdministratorError,
  InitialAdministratorService,
} from "./initial-administrator.service.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";

const execFileAsync = promisify(execFile);

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);

const CANDIDATE_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const OTHER_CANDIDATE_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const ADMINISTRATOR_ID = "cccccccc-3333-4333-8333-333333333333";
const CANDIDATE_EMAIL = "candidate@example.com";
const CANDIDATE_PASSWORD_HASH = "argon2-candidate-password-hash";
const OPERATOR_REFERENCE = "operator-42";

const input = (
  overrides: Partial<{
    userId: string;
    expectedEmail: string;
    expectedAccessVersion: number;
  }> = {},
) => ({
  userId: CANDIDATE_ID,
  expectedEmail: CANDIDATE_EMAIL,
  expectedAccessVersion: 0,
  operatorReference: OPERATOR_REFERENCE,
  ...overrides,
});

type CliProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/**
 * The standalone procedure runs as a real child process against the owned
 * container only. No developer or production connection is ever used.
 */
const runCliProcess = async (
  args: readonly string[],
): Promise<CliProcessResult> => {
  const scriptPath = fileURLToPath(
    new URL("../../scripts/provision-initial-admin.ts", import.meta.url),
  );
  const apiRoot = fileURLToPath(new URL("../../../", import.meta.url));

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--conditions=development", "--import", "tsx", scriptPath, ...args],
      { cwd: apiRoot, env: { ...process.env } },
    );

    return { code: 0, stdout, stderr };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const failure = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };

    return {
      code: typeof failure.code === "number" ? failure.code : -1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
};

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createCandidate = async (id: string, email: string): Promise<void> => {
  await database.user.create({
    data: {
      id,
      email,
      passwordHash: CANDIDATE_PASSWORD_HASH,
      fullName: "Bootstrap Candidate",
      phone: "+201000000000",
      role: UserRole.USER,
      status: UserStatus.PENDING_APPROVAL,
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
};

const installReceiptRejection = async (): Promise<void> => {
  await database.$executeRaw`CREATE OR REPLACE FUNCTION test_owned_reject_initial_admin_receipt() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'test-owned receipt rejection';
    END;
  $$ LANGUAGE plpgsql`;
  await database.$executeRaw`CREATE TRIGGER test_owned_reject_initial_admin_receipt
    BEFORE INSERT ON "initial_administrator_provisioning"
    FOR EACH ROW EXECUTE FUNCTION test_owned_reject_initial_admin_receipt()`;
};

const removeReceiptRejection = async (): Promise<void> => {
  await database.$executeRaw`DROP TRIGGER IF EXISTS test_owned_reject_initial_admin_receipt ON "initial_administrator_provisioning"`;
  await database.$executeRaw`DROP FUNCTION IF EXISTS test_owned_reject_initial_admin_receipt()`;
};

beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
});

afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

describe("the restricted initial-administrator procedure", () => {
  it("previews the candidate without reserving or writing anything", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    const service = new InitialAdministratorService(database);
    const before = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });

    const preview = await service.preview(input());

    expect(preview.eligible).toBe(true);
    expect(preview.reason).toBe("ELIGIBLE");
    expect(preview.user?.id).toBe(CANDIDATE_ID);

    const after = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });
    expect(after).toStrictEqual(before);
    expect(await database.initialAdministratorProvisioning.count()).toBe(0);
    expect(await database.staffDecision.count()).toBe(0);
  });

  it("denies the procedure while an administrator row exists", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    await database.user.create({
      data: {
        id: ADMINISTRATOR_ID,
        email: "restricted.admin@example.com",
        passwordHash: "argon2-restricted-admin-hash",
        fullName: "Restricted Administrator",
        role: UserRole.ADMIN,
        status: UserStatus.SUSPENDED,
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const service = new InitialAdministratorService(database);

    const preview = await service.preview(input());

    expect(preview.eligible).toBe(false);
    expect(preview.reason).toBe("INITIAL_ADMIN_EXISTS");
  });

  it("denies the procedure while an unverified administrator row exists", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    await database.user.create({
      data: {
        id: ADMINISTRATOR_ID,
        email: "unverified.admin@example.com",
        passwordHash: "argon2-unverified-admin-hash",
        fullName: "Unverified Administrator",
        role: UserRole.ADMIN,
        status: UserStatus.PENDING_VERIFICATION,
      },
    });
    const service = new InitialAdministratorService(database);

    const preview = await service.preview(input());

    expect(preview.eligible).toBe(false);
    expect(preview.reason).toBe("INITIAL_ADMIN_EXISTS");

    await expect(service.apply(input())).rejects.toThrow(
      InitialAdministratorError,
    );
    expect(await database.initialAdministratorProvisioning.count()).toBe(0);
  });

  it("denies the procedure while the singleton receipt exists", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    await database.initialAdministratorProvisioning.create({
      data: {
        id: "INITIAL_ADMIN",
        targetId: CANDIDATE_ID,
        operatorReference: "earlier-operator",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        beforeVersion: 0,
        afterVersion: 1,
      },
    });
    const service = new InitialAdministratorService(database);

    const preview = await service.preview(input());

    expect(preview.eligible).toBe(false);
    expect(preview.reason).toBe("INITIAL_ADMIN_EXISTS");
  });

  it("denies an absent, unverified or suspended candidate", async () => {
    const service = new InitialAdministratorService(database);

    const absent = await service.preview(input());
    expect(absent.reason).toBe("INVALID_CANDIDATE");
    expect(absent.user).toBeNull();

    await database.user.create({
      data: {
        id: CANDIDATE_ID,
        email: CANDIDATE_EMAIL,
        passwordHash: CANDIDATE_PASSWORD_HASH,
        fullName: "Bootstrap Candidate",
        role: UserRole.USER,
        status: UserStatus.PENDING_VERIFICATION,
      },
    });
    const unverified = await service.preview(input());
    expect(unverified.reason).toBe("INVALID_CANDIDATE");

    await database.user.update({
      where: { id: CANDIDATE_ID },
      data: {
        status: UserStatus.SUSPENDED,
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const suspended = await service.preview(input());
    expect(suspended.reason).toBe("INVALID_CANDIDATE");
  });

  it("denies a wrong expected email and a wrong expected access version", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    const service = new InitialAdministratorService(database);

    const wrongEmail = await service.preview(
      input({ expectedEmail: "someone.else@example.com" }),
    );
    expect(wrongEmail.reason).toBe("STALE_CANDIDATE");
    expect(wrongEmail.user).toBeNull();

    const wrongVersion = await service.preview(
      input({ expectedAccessVersion: 4 }),
    );
    expect(wrongVersion.reason).toBe("STALE_CANDIDATE");
    expect(wrongVersion.user?.accessVersion).toBe(0);
  });

  it("promotes only the selected candidate and keeps every credential", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    await createCandidate(OTHER_CANDIDATE_ID, "other.candidate@example.com");
    const service = new InitialAdministratorService(database);
    const before = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });

    const result = await service.apply(input());

    expect(result.user.id).toBe(CANDIDATE_ID);
    expect(result.user.role).toBe(UserRole.ADMIN);
    expect(result.user.status).toBe(UserStatus.ACTIVE);
    expect(result.user.department).toBeNull();
    expect(result.user.staffApprovedAt).toBeNull();
    expect(result.user.accessVersion).toBe(1);
    expect(result.operatorReference).toBe(OPERATOR_REFERENCE);

    const after = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.email).toBe(before.email);
    expect(after.emailVerifiedAt).toStrictEqual(before.emailVerifiedAt);
    expect(after.fullName).toBe(before.fullName);
    expect(after.phone).toBe(before.phone);
    expect(after.verificationTokenHash).toBe(before.verificationTokenHash);
    expect(after.resetTokenHash).toBe(before.resetTokenHash);
    expect(after.department).toBeNull();
    expect(after.staffApprovedAt).toBeNull();
    expect(after.staffApprovedById).toBeNull();

    const other = await database.user.findUniqueOrThrow({
      where: { id: OTHER_CANDIDATE_ID },
    });
    expect(other.role).toBe(UserRole.USER);
    expect(other.status).toBe(UserStatus.PENDING_APPROVAL);
    expect(other.accessVersion).toBe(0);

    const receipt =
      await database.initialAdministratorProvisioning.findUniqueOrThrow({
        where: { id: "INITIAL_ADMIN" },
      });
    expect(receipt.targetId).toBe(CANDIDATE_ID);
    expect(receipt.operatorReference).toBe(OPERATOR_REFERENCE);
    expect(receipt.beforeVersion).toBe(0);
    expect(receipt.afterVersion).toBe(1);
    expect(receipt.occurredAt.toISOString()).toBe(result.occurredAt);

    expect(await database.staffDecision.count()).toBe(0);
  });

  it("refuses a denied apply without any promotion or receipt", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    const service = new InitialAdministratorService(database);
    const before = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });

    await expect(
      service.apply(input({ expectedAccessVersion: 3 })),
    ).rejects.toThrow(InitialAdministratorError);
    await expect(
      service.apply(input({ expectedEmail: "someone.else@example.com" })),
    ).rejects.toThrow(InitialAdministratorError);

    const after = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });
    expect(after).toStrictEqual(before);
    expect(await database.initialAdministratorProvisioning.count()).toBe(0);
  });

  it("refuses a repeated apply and creates no second receipt", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    const service = new InitialAdministratorService(database);

    await service.apply(input());

    await expect(service.apply(input())).rejects.toThrow(
      InitialAdministratorError,
    );
    expect(await database.initialAdministratorProvisioning.count()).toBe(1);
    const account = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });
    expect(account.accessVersion).toBe(1);
    expect(account.role).toBe(UserRole.ADMIN);
  });

  it("lets exactly one of two competing applies win", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    const first = createDatabaseClient(databaseUrl);
    const second = createDatabaseClient(databaseUrl);

    try {
      const outcomes = await Promise.allSettled([
        new InitialAdministratorService(first).apply(input()),
        new InitialAdministratorService(second).apply(input()),
      ]);

      const winners = outcomes.filter(
        (outcome) => outcome.status === "fulfilled",
      );
      const losers = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      const failure = losers[0];
      expect(failure?.status).toBe("rejected");
      if (failure?.status === "rejected") {
        expect(failure.reason).toBeInstanceOf(InitialAdministratorError);
        expect((failure.reason as InitialAdministratorError).reason).toBe(
          "INITIAL_ADMIN_EXISTS",
        );
      }

      expect(await database.initialAdministratorProvisioning.count()).toBe(1);
      const account = await database.user.findUniqueOrThrow({
        where: { id: CANDIDATE_ID },
      });
      expect(account.role).toBe(UserRole.ADMIN);
      expect(account.status).toBe(UserStatus.ACTIVE);
      expect(account.accessVersion).toBe(1);
    } finally {
      await first.$disconnect();
      await second.$disconnect();
    }
  }, 60_000);

  it("waits for the bootstrap advisory lock before it promotes", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    const blocker = createDatabaseClient(databaseUrl);
    const lockHeld = deferred();
    const releaseLock = deferred();
    let settled: Promise<unknown> = Promise.resolve();
    let blockerPid: number | undefined;
    const holding = blocker.$transaction(
      async (tx) => {
        const [session] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        blockerPid = session?.pid;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(50201)`;
        lockHeld.resolve();
        await releaseLock.promise;
        return "released";
      },
      { timeout: 15_000 },
    );
    const blockerSettled = Promise.allSettled([holding]);

    try {
      await Promise.race([lockHeld.promise, holding]);
      expect(blockerPid).toBeDefined();
      const applying = new InitialAdministratorService(database).apply(input());
      settled = Promise.allSettled([applying]);

      await expect
        .poll(
          async () => {
            const [waiter] = await database.$queryRaw<Array<{ pid: number }>>`
          SELECT lock.pid
            FROM pg_locks AS lock
            JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
           WHERE activity.datname = current_database()
             AND lock.locktype = 'advisory' AND NOT lock.granted
             AND lock.classid = 0 AND lock.objid = 50201 AND lock.objsubid = 1
             AND ${blockerPid ?? -1}::integer = ANY(pg_blocking_pids(lock.pid))
        `;
            return waiter?.pid;
          },
          { timeout: 5_000 },
        )
        .toBeTypeOf("number");

      const waiting = await database.user.findUniqueOrThrow({
        where: { id: CANDIDATE_ID },
      });
      expect(waiting.role).toBe(UserRole.USER);
      expect(waiting.accessVersion).toBe(0);
      expect(await database.initialAdministratorProvisioning.count()).toBe(0);

      releaseLock.resolve();
      await expect(applying).resolves.toBeDefined();
      await holding;

      const promoted = await database.user.findUniqueOrThrow({
        where: { id: CANDIDATE_ID },
      });
      expect(promoted.role).toBe(UserRole.ADMIN);
      expect(promoted.accessVersion).toBe(1);
      expect(await database.initialAdministratorProvisioning.count()).toBe(1);
    } finally {
      releaseLock.resolve();
      // The promotion must never outlive this test: an in-flight transaction
      // would keep the advisory and row locks and block the next suite.
      await blockerSettled;
      await settled;
      await blocker.$disconnect();
    }
  }, 60_000);

  it("rolls the promotion back when the receipt cannot be written", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    const service = new InitialAdministratorService(database);
    const before = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });

    await installReceiptRejection();

    try {
      await expect(service.apply(input())).rejects.toThrow();
    } finally {
      await removeReceiptRejection();
    }

    const after = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });
    expect(after.role).toBe(UserRole.USER);
    expect(after.status).toBe(UserStatus.PENDING_APPROVAL);
    expect(after.accessVersion).toBe(before.accessVersion);
    expect(after.updatedAt).toStrictEqual(before.updatedAt);
    expect(await database.initialAdministratorProvisioning.count()).toBe(0);
  });
});

describe("the standalone procedure process", () => {
  const cliArguments = (
    overrides: Partial<{
      userId: string;
      expectedEmail: string;
      expectedAccessVersion: number;
    }> = {},
  ): string[] => [
    "--user-id",
    overrides.userId ?? CANDIDATE_ID,
    "--expected-email",
    overrides.expectedEmail ?? CANDIDATE_EMAIL,
    "--expected-access-version",
    String(overrides.expectedAccessVersion ?? 0),
    "--operator-reference",
    OPERATOR_REFERENCE,
  ];

  it("previews by default and masks the address", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);

    const result = await runCliProcess(cliArguments());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("outcome=PREVIEW");
    expect(result.stdout).toContain(`selected_id=${CANDIDATE_ID}`);
    expect(result.stdout).toContain("email_masked=c***@e***.com");
    expect(result.stdout).not.toContain(CANDIDATE_EMAIL);

    const account = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });
    expect(account.role).toBe(UserRole.USER);
    expect(await database.initialAdministratorProvisioning.count()).toBe(0);
  }, 60_000);

  it("exits three for a known ineligible outcome", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);

    const result = await runCliProcess([
      ...cliArguments({ expectedAccessVersion: 7 }),
      "--apply",
    ]);

    expect(result.code).toBe(3);
    expect(result.stdout).toContain("reason=STALE_CANDIDATE");
    expect(await database.initialAdministratorProvisioning.count()).toBe(0);
  }, 60_000);

  it("exits one with PROVISIONING_FAILED alone for an unexpected failure", async () => {
    await createCandidate(CANDIDATE_ID, CANDIDATE_EMAIL);
    await installReceiptRejection();

    try {
      const result = await runCliProcess([...cliArguments(), "--apply"]);

      expect(result.code).toBe(1);
      expect(result.stderr.trim()).toBe("PROVISIONING_FAILED");
      expect(result.stdout).not.toContain("@");
    } finally {
      await removeReceiptRejection();
    }

    const account = await database.user.findUniqueOrThrow({
      where: { id: CANDIDATE_ID },
    });
    expect(account.role).toBe(UserRole.USER);
    expect(account.accessVersion).toBe(0);
    expect(await database.initialAdministratorProvisioning.count()).toBe(0);
  }, 60_000);
});
