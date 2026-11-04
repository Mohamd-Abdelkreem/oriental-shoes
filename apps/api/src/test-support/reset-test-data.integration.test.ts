import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "@template/database";

import { resetOwnedIdentityTestData } from "./reset-test-data.ts";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

const countOf = async (table: string): Promise<number> => {
  const rows = await database.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*)::bigint AS count FROM "${table}"`,
  );
  return Number(rows[0]?.count ?? 0);
};

const seedOwnedGraph = async (): Promise<void> => {
  await database.$executeRawUnsafe(
    `INSERT INTO users
       (id, email, password_hash, full_name, role, status, email_verified_at, updated_at)
     VALUES
       ('${ADMIN_ID}', 'reset.admin@example.com', 'argon2-test-hash', 'Reset Admin',
        'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('${EMPLOYEE_ID}', 'reset.employee@example.com', 'argon2-test-hash', 'Reset Employee',
        'USER', 'PENDING_APPROVAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
  );
  await database.$executeRawUnsafe(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ('${EMPLOYEE_ID}', repeat('b', 64), CURRENT_TIMESTAMP + INTERVAL '1 day')
     ON CONFLICT DO NOTHING`,
  );
  await database.$executeRawUnsafe(
    `INSERT INTO staff_decisions
       (command_id, target_id, actor_id, target_full_name, target_email,
        actor_full_name, actor_role, actor_status, actor_email_verified_at,
        operation, action, requested_department, before_version, after_version,
        before_status, after_status, before_department, after_department,
        before_approved_at, after_approved_at, before_approved_by_id,
        after_approved_by_id, occurred_at)
     VALUES ('33333333-3333-4333-8333-333333333333', '${EMPLOYEE_ID}', '${ADMIN_ID}',
             'Reset Employee', 'reset.employee@example.com',
             'Reset Admin', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP,
             'APPROVE', 'APPROVE', 'SALES', 0, 1,
             'PENDING_APPROVAL', 'ACTIVE', NULL, 'SALES',
             NULL, CURRENT_TIMESTAMP, NULL, '${ADMIN_ID}', CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
  );
  await database.$executeRawUnsafe(
    `INSERT INTO initial_administrator_provisioning
       (id, target_id, operator_reference, occurred_at, before_version, after_version)
     VALUES ('INITIAL_ADMIN', '${ADMIN_ID}', 'reset-operator', CURRENT_TIMESTAMP, 0, 1)
     ON CONFLICT DO NOTHING`,
  );
};

type OwnedGraphCounts = {
  users: number;
  refreshTokens: number;
  staffDecisions: number;
  initialAdministratorProvisioning: number;
};

const ownedGraphCounts = async (): Promise<OwnedGraphCounts> => ({
  users: await countOf("users"),
  refreshTokens: await countOf("refresh_tokens"),
  staffDecisions: await countOf("staff_decisions"),
  initialAdministratorProvisioning: await countOf(
    "initial_administrator_provisioning",
  ),
});

beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS p01_cleanup_sentinel (
       id INTEGER PRIMARY KEY,
       marker VARCHAR(32) NOT NULL
     )`,
  );
  await database.$executeRawUnsafe(`TRUNCATE TABLE p01_cleanup_sentinel`);
  await database.$executeRawUnsafe(
    `INSERT INTO p01_cleanup_sentinel (id, marker) VALUES (1, 'unrelated')`,
  );
});

afterAll(async () => {
  await database.$executeRawUnsafe(`DROP TABLE IF EXISTS p01_cleanup_sentinel`);
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

describe("owned identity test data cleanup against a migrated database", () => {
  it("clears exactly the explicit owned identity graph", async () => {
    await seedOwnedGraph();

    const seeded = await ownedGraphCounts();
    expect(seeded.users).toBe(2);
    expect(seeded.refreshTokens).toBe(1);
    expect(seeded.staffDecisions).toBe(1);
    expect(seeded.initialAdministratorProvisioning).toBe(1);

    await resetOwnedIdentityTestData(database);

    const cleared = await ownedGraphCounts();
    expect(cleared.users).toBe(0);
    expect(cleared.refreshTokens).toBe(0);
    expect(cleared.staffDecisions).toBe(0);
    expect(cleared.initialAdministratorProvisioning).toBe(0);

    // The cleanup reaches only its explicit graph.
    const sentinel = await database.$queryRawUnsafe<Array<{ marker: string }>>(
      `SELECT marker FROM p01_cleanup_sentinel WHERE id = 1`,
    );
    expect(sentinel[0]?.marker).toBe("unrelated");
  });

  it("stops the cleanup when an external foreign key references the owned graph", async () => {
    await database.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS p01_external_reference (
         id SERIAL PRIMARY KEY,
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
       )`,
    );
    try {
      await seedOwnedGraph();
      await database.$executeRawUnsafe(
        `INSERT INTO p01_external_reference (user_id) VALUES ('${EMPLOYEE_ID}')`,
      );

      await expect(resetOwnedIdentityTestData(database)).rejects.toThrow();

      // The refused cleanup left every fixture exactly as it was.
      const preserved = await ownedGraphCounts();
      expect(preserved.users).toBe(2);
      expect(preserved.refreshTokens).toBe(1);
      expect(preserved.staffDecisions).toBe(1);
      expect(preserved.initialAdministratorProvisioning).toBe(1);

      const external = await countOf("p01_external_reference");
      expect(external).toBe(1);
    } finally {
      await database.$executeRawUnsafe(
        `DROP TABLE IF EXISTS p01_external_reference`,
      );
    }
  });

  it("requires the owned marker and refuses a foreign owned environment", async () => {
    const marker = process.env["P01_TEST_DATABASE_URL"];
    const nodeEnv = process.env["NODE_ENV"];
    try {
      delete process.env["P01_TEST_DATABASE_URL"];
      await expect(resetOwnedIdentityTestData(database)).rejects.toThrow();

      process.env["P01_TEST_DATABASE_URL"] =
        "postgresql://template_test:test-only-password@127.0.0.1:54321/not_the_owned_database?schema=public";
      await expect(resetOwnedIdentityTestData(database)).rejects.toThrow();
    } finally {
      if (marker === undefined) {
        delete process.env["P01_TEST_DATABASE_URL"];
      } else {
        process.env["P01_TEST_DATABASE_URL"] = marker;
      }
      if (nodeEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = nodeEnv;
      }
    }
  });
});
