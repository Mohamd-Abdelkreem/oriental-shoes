import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "../../src/client.js";

const execFileAsync = promisify(execFile);

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(currentDirectory, "..", "..");

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);

const SEED_PASSWORD = "SeedOnlyPassword!42";
const OTHER_PASSWORD = "ChangedSeedPassword!43";

type SeedRun = {
  code: number;
  stdout: string;
  stderr: string;
};

const runSeed = async (
  environment: Readonly<Record<string, string | undefined>>,
): Promise<SeedRun> => {
  const baseEnvironment: Record<string, string> = {
    PATH: process.env["PATH"] ?? "",
    HOME: process.env["HOME"] ?? "",
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "prisma/seed.ts"],
      {
        cwd: packageRoot,
        env: { ...baseEnvironment, ...environment },
        timeout: 120_000,
        windowsHide: true,
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
};

const resetOwnedDatabase = async (): Promise<void> => {
  if (process.env["NODE_ENV"] !== "test") {
    throw new Error("Seed cleanup requires NODE_ENV=test.");
  }
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (marker === undefined || marker.length === 0) {
    throw new Error("Seed cleanup requires an owned database marker.");
  }
  if (marker !== process.env["DATABASE_URL"]) {
    throw new Error(
      "Seed cleanup requires the configured database to match the marker.",
    );
  }

  const ownedUrl = new URL(marker);
  const expectedName = decodeURIComponent(ownedUrl.pathname.slice(1));
  if (
    !["postgresql:", "postgres:"].includes(ownedUrl.protocol) ||
    expectedName.length === 0 ||
    expectedName.includes("/")
  ) {
    throw new Error("Seed cleanup requires a PostgreSQL database URL.");
  }
  const [selected] = await database.$queryRaw<Array<{ name: string }>>`
    SELECT current_database() AS name
  `;
  if (selected?.name !== expectedName) {
    throw new Error("Seed cleanup refused the selected database.");
  }
  await database.$executeRaw`
    TRUNCATE TABLE "sales_commands", "sales_draft_pieces", "sales_drafts", "customers", "staff_decisions", "initial_administrator_provisioning", "refresh_tokens", "users"
  `;
};

beforeEach(async () => {
  await resetOwnedDatabase();
});

afterAll(async () => {
  try {
    await resetOwnedDatabase();
  } finally {
    await database.$disconnect();
  }
});

describe("owned seed cleanup", () => {
  it("clears the populated P02 restricted graph only inside its owned target", async () => {
    const now = new Date();
    const actor = await database.user.create({
      data: {
        email: "p02-cleanup@example.test",
        passwordHash: "synthetic-hash",
        fullName: "Cleanup Admin",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: now,
      },
    });
    const customer = await database.customer.create({
      data: {
        name: "Customer",
        phone: "+966500000001",
        createdAt: now,
        updatedAt: now,
      },
    });
    const draft = await database.salesDraft.create({
      data: {
        ownerId: actor.id,
        customerId: customer.id,
        type: "SHOP",
        createdAt: now,
        updatedAt: now,
      },
    });
    await database.salesDraftPiece.create({
      data: {
        id: "66666666-6666-4666-8666-666666666666",
        draftId: draft.id,
        position: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
    await database.salesCommand.create({
      data: {
        commandId: "77777777-7777-4777-8777-777777777777",
        operation: "CREATE_DRAFT",
        actorId: actor.id,
        actorFullName: actor.fullName,
        actorRole: "ADMIN",
        draftId: draft.id,
        afterVersion: 1,
        payloadHash: "b".repeat(64),
        after: {},
        occurredAt: now,
      },
    });
    await resetOwnedDatabase();
    expect(await database.customer.count()).toBe(0);
    expect(await database.salesDraft.count()).toBe(0);
    expect(await database.salesDraftPiece.count()).toBe(0);
    expect(await database.salesCommand.count()).toBe(0);
    expect(await database.user.count()).toBe(0);
  });

  it.each([
    [
      "missing marker",
      undefined,
      databaseUrl,
      /requires an owned database marker/u,
    ],
    [
      "mismatched marker",
      "postgresql://localhost/other",
      databaseUrl,
      /match the marker/u,
    ],
    [
      "wrong selected database",
      "postgresql://localhost/other",
      "postgresql://localhost/other",
      /refused the selected database/u,
    ],
  ] as const)(
    "retains fixture data with %s",
    async (_case, marker, configured, error) => {
      const sentinel = await database.user.create({
        data: {
          email: "seed-cleanup-sentinel@example.com",
          fullName: "Cleanup Sentinel",
          passwordHash: "test-sentinel-hash",
        },
      });
      const originalMarker = process.env["P01_TEST_DATABASE_URL"];
      const originalConfigured = process.env["DATABASE_URL"];
      try {
        if (marker === undefined) delete process.env["P01_TEST_DATABASE_URL"];
        else process.env["P01_TEST_DATABASE_URL"] = marker;
        process.env["DATABASE_URL"] = configured;
        await expect(resetOwnedDatabase()).rejects.toThrow(error);
        expect(
          await database.user.findUnique({ where: { id: sentinel.id } }),
        ).toEqual(sentinel);
      } finally {
        if (originalMarker === undefined)
          delete process.env["P01_TEST_DATABASE_URL"];
        else process.env["P01_TEST_DATABASE_URL"] = originalMarker;
        if (originalConfigured === undefined)
          delete process.env["DATABASE_URL"];
        else process.env["DATABASE_URL"] = originalConfigured;
      }
    },
  );
});

describe("optional local seed compatibility", () => {
  it("writes no account when no group is configured", async () => {
    const run = await runSeed({});

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("no optional users were configured");
    expect(await database.user.count()).toBe(0);
  });

  it("creates a new employee as a verified pending-approval account without employee fields", async () => {
    const run = await runSeed({
      SEED_USER_EMAIL: "Seed.User@Example.com",
      SEED_USER_NAME: "Seed User",
      SEED_USER_PASSWORD: SEED_PASSWORD,
    });

    expect(run.code).toBe(0);
    const created = await database.user.findUnique({
      where: { email: "seed.user@example.com" },
    });
    expect(created).not.toBeNull();
    expect(created?.role).toBe("USER");
    expect(created?.status).toBe("PENDING_APPROVAL");
    expect(created?.emailVerifiedAt).not.toBeNull();
    expect(created?.department).toBeNull();
    expect(created?.staffApprovedAt).toBeNull();
    expect(created?.staffApprovedById).toBeNull();
    expect(created?.accessVersion).toBe(0);
  });

  it("creates a new administrator as a verified active account without employee fields", async () => {
    const run = await runSeed({
      SEED_ADMIN_EMAIL: "seed.admin@example.com",
      SEED_ADMIN_NAME: "Seed Admin",
      SEED_ADMIN_PASSWORD: SEED_PASSWORD,
    });

    expect(run.code).toBe(0);
    const created = await database.user.findUnique({
      where: { email: "seed.admin@example.com" },
    });
    expect(created?.role).toBe("ADMIN");
    expect(created?.status).toBe("ACTIVE");
    expect(created?.emailVerifiedAt).not.toBeNull();
    expect(created?.department).toBeNull();
    expect(created?.staffApprovedAt).toBeNull();
    expect(created?.staffApprovedById).toBeNull();
    expect(created?.accessVersion).toBe(0);
  });

  it("refuses configured credentials in production and writes nothing", async () => {
    const run = await runSeed({
      NODE_ENV: "production",
      SEED_ADMIN_EMAIL: "seed.admin@example.com",
      SEED_ADMIN_NAME: "Seed Admin",
      SEED_ADMIN_PASSWORD: SEED_PASSWORD,
    });

    expect(run.code).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toContain("SEED_CONFIGURATION");
    expect(await database.user.count()).toBe(0);
  });

  it("leaves an existing account completely unchanged on a later run", async () => {
    const first = await runSeed({
      SEED_USER_EMAIL: "seed.user@example.com",
      SEED_USER_NAME: "Seed User",
      SEED_USER_PASSWORD: SEED_PASSWORD,
    });
    expect(first.code).toBe(0);

    const before = await database.user.findUnique({
      where: { email: "seed.user@example.com" },
    });

    const second = await runSeed({
      SEED_USER_EMAIL: "seed.user@example.com",
      SEED_USER_NAME: "Renamed Seed User",
      SEED_USER_PASSWORD: OTHER_PASSWORD,
    });

    expect(second.code).toBe(0);
    expect(second.stdout).toContain("already exists");

    const after = await database.user.findUnique({
      where: { email: "seed.user@example.com" },
    });
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.fullName).toBe(before?.fullName);
    expect(after?.role).toBe(before?.role);
    expect(after?.status).toBe(before?.status);
    expect(after?.accessVersion).toBe(before?.accessVersion);
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(after?.emailVerifiedAt).toEqual(before?.emailVerifiedAt);
  });

  it("leaves an already approved employee and its retained history unchanged", async () => {
    const administrator = await database.user.create({
      data: {
        email: "seed.approver@example.com",
        passwordHash: "argon2-test-hash",
        fullName: "Seed Approver",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    const employee = await database.user.create({
      data: {
        email: "seed.user@example.com",
        passwordHash: "argon2-test-hash",
        fullName: "Approved Employee",
        role: "USER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        department: "SALES",
        staffApprovedAt: new Date(),
        staffApprovedById: administrator.id,
        accessVersion: 7,
      },
    });
    await database.staffDecision.create({
      data: {
        commandId: "44444444-4444-4444-8444-444444444444",
        targetId: employee.id,
        actorId: administrator.id,
        targetFullName: "Approved Employee",
        targetEmail: "seed.user@example.com",
        actorFullName: "Seed Approver",
        actorRole: "ADMIN",
        actorStatus: "ACTIVE",
        actorEmailVerifiedAt: new Date(),
        operation: "APPROVE",
        action: "APPROVE",
        requestedDepartment: "SALES",
        beforeVersion: 6,
        afterVersion: 7,
        beforeStatus: "PENDING_APPROVAL",
        afterStatus: "ACTIVE",
        beforeDepartment: null,
        afterDepartment: "SALES",
        beforeApprovedAt: null,
        afterApprovedAt: new Date(),
        beforeApprovedById: null,
        afterApprovedById: administrator.id,
        occurredAt: new Date(),
      },
    });

    const run = await runSeed({
      SEED_USER_EMAIL: "seed.user@example.com",
      SEED_USER_NAME: "Seed User",
      SEED_USER_PASSWORD: OTHER_PASSWORD,
    });

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("already exists");

    const after = await database.user.findUnique({
      where: { email: "seed.user@example.com" },
    });
    expect(after?.fullName).toBe("Approved Employee");
    expect(after?.status).toBe("ACTIVE");
    expect(after?.department).toBe("SALES");
    expect(after?.accessVersion).toBe(7);
    expect(await database.staffDecision.count()).toBe(1);
  });

  it("creates exactly one identity when two independent runners race the same email", async () => {
    const environment = {
      SEED_USER_EMAIL: "race.user@example.com",
      SEED_USER_NAME: "Race User",
      SEED_USER_PASSWORD: SEED_PASSWORD,
    };

    const [first, second] = await Promise.all([
      runSeed(environment),
      runSeed(environment),
    ]);

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(
      await database.user.count({ where: { email: "race.user@example.com" } }),
    ).toBe(1);

    const created = await database.user.findUnique({
      where: { email: "race.user@example.com" },
    });
    expect(created?.status).toBe("PENDING_APPROVAL");
    expect(created?.accessVersion).toBe(0);
    expect(created?.fullName).toBe("Race User");
  });

  it("never prints a credential, a password hash or the connection URI", async () => {
    const run = await runSeed({
      SEED_USER_EMAIL: "seed.user@example.com",
      SEED_USER_NAME: "Seed User",
      SEED_USER_PASSWORD: SEED_PASSWORD,
    });

    const output = `${run.stdout}${run.stderr}`;
    expect(output).not.toContain(SEED_PASSWORD);
    expect(output).not.toContain(databaseUrl);
    expect(output).not.toContain("argon2");
  });
});
