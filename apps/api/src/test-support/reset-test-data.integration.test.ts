import { randomUUID } from "node:crypto";
import { createApprovalOrderFixture } from "./approval.fixture.js";
import { StaffService } from "../modules/staff/staff.service.js";
import { ApprovalService } from "../modules/approval/approval.service.js";
import { ApprovalCommandExecutor } from "../modules/approval/approval-command-executor.js";
import { ManufacturingCommandExecutor } from "../modules/manufacturing/manufacturing-command-executor.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "@template/database";

import { resetOwnedIdentityTestData } from "./reset-test-data.ts";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);

const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

const countOf = async (table: string): Promise<number> => {
  const rows = await database.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*)::bigint AS count FROM "${table}"`,
  );
  return Number(rows[0]?.count ?? 0);
};

const seedOwnedGraph = async (): Promise<void> => {
  const f = await createApprovalOrderFixture(database);
  await database.user.create({
    data: {
      id: EMPLOYEE_ID,
      email: "reset.employee@example.test",
      fullName: "Reset Employee",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(database).approveStaff(
    f.approvalActorId,
    EMPLOYEE_ID,
    {
      commandId: randomUUID(),
      expectedAccessVersion: 0,
      department: "CUTTING",
    },
  );
  await database.refreshToken.create({
    data: {
      userId: EMPLOYEE_ID,
      tokenHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await database.$executeRaw`INSERT INTO initial_administrator_provisioning(id,target_id,operator_reference,occurred_at,before_version,after_version) VALUES('INITIAL_ADMIN',${f.approvalActorId}::uuid,'reset-operator',CURRENT_TIMESTAMP,0,1)`;
  await new ApprovalService(
    database,
    new ApprovalCommandExecutor(database),
    "UTC",
  ).approveInitial(f.approvalActorId, f.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  await new ManufacturingCommandExecutor(database).execute({
    actorId: EMPLOYEE_ID,
    department: "CUTTING",
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: 2,
          pieceIds: f.order.pieces.map((p) => p.id),
        },
      ],
    },
  });
};

type OwnedGraphCounts = {
  workCommands: number;
  workOrders: number;
  workVisits: number;
  workEvents: number;
  approvalCommands: number;
  manufacturingIssues: number;
  contactProposals: number;
  orders: number;
  orderPieces: number;
  selections: number;
  sources: number;
  entries: number;
  customers: number;
  drafts: number;
  pieces: number;
  commands: number;
  users: number;
  refreshTokens: number;
  staffDecisions: number;
  initialAdministratorProvisioning: number;
};

const ownedGraphCounts = async (): Promise<OwnedGraphCounts> => ({
  workCommands: await countOf("manufacturing_commands"),
  workOrders: await countOf("manufacturing_command_orders"),
  workVisits: await countOf("manufacturing_work_visits"),
  workEvents: await countOf("manufacturing_piece_events"),
  approvalCommands: await countOf("approval_commands"),
  manufacturingIssues: await countOf("manufacturing_issues"),
  contactProposals: await countOf("piece_contact_proposals"),
  orders: await countOf("sales_orders"),
  orderPieces: await countOf("sales_order_pieces"),
  selections: await countOf("sales_piece_catalog_selections"),
  sources: await countOf("catalog_sources"),
  entries: await countOf("catalog_entries"),
  customers: await countOf("customers"),
  drafts: await countOf("sales_drafts"),
  pieces: await countOf("sales_draft_pieces"),
  commands: await countOf("sales_commands"),
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
    expect(seeded).toMatchObject({
      workCommands: 1,
      workOrders: 1,
      workVisits: 1,
      workEvents: 1,
      orders: 1,
      orderPieces: 1,
      selections: 4,
      sources: 1,
      entries: 1874,
      customers: 1,
      drafts: 1,
      pieces: 1,
      commands: 2,
    });
    expect(seeded.users).toBe(2);
    expect(seeded.refreshTokens).toBe(1);
    expect(seeded.staffDecisions).toBe(1);
    expect(seeded.initialAdministratorProvisioning).toBe(1);

    await resetOwnedIdentityTestData(database);

    const cleared = await ownedGraphCounts();
    expect(cleared).toMatchObject({
      workCommands: 0,
      workOrders: 0,
      workVisits: 0,
      workEvents: 0,
      orders: 0,
      orderPieces: 0,
      selections: 0,
      sources: 0,
      entries: 0,
      customers: 0,
      drafts: 0,
      pieces: 0,
      commands: 0,
    });
    expect(
      await database.catalogActivation.findUnique({
        where: { id: "active" },
        select: { sourceId: true, activatedAt: true },
      }),
    ).toEqual({ sourceId: null, activatedAt: null });
    expect(
      await database.businessOrderCounter.findUnique({
        where: { id: "global" },
        select: { lastIssued: true },
      }),
    ).toEqual({ lastIssued: 0n });
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
      expect(preserved).toMatchObject({
        workCommands: 1,
        workOrders: 1,
        workVisits: 1,
        workEvents: 1,
        orders: 1,
        orderPieces: 1,
        selections: 4,
        sources: 1,
        entries: 1874,
        customers: 1,
        drafts: 1,
        pieces: 1,
        commands: 2,
      });
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
    await seedOwnedGraph();
    const originalCounts = await ownedGraphCounts();
    const marker = process.env["P01_TEST_DATABASE_URL"];
    const nodeEnv = process.env["NODE_ENV"];
    try {
      delete process.env["P01_TEST_DATABASE_URL"];
      await expect(resetOwnedIdentityTestData(database)).rejects.toThrow();
      expect(await ownedGraphCounts()).toEqual(originalCounts);

      process.env["P01_TEST_DATABASE_URL"] =
        "postgresql://template_test:test-only-password@127.0.0.1:54321/not_the_owned_database?schema=public";
      await expect(resetOwnedIdentityTestData(database)).rejects.toThrow();
      expect(await ownedGraphCounts()).toEqual(originalCounts);
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
