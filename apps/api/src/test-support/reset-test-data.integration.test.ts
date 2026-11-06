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
  const now = new Date();
  const customer = await database.customer.create({
    data: {
      name: "Cleanup Customer",
      phone: "+966500000001",
      createdAt: now,
      updatedAt: now,
    },
  });
  const draft = await database.salesDraft.create({
    data: {
      ownerId: ADMIN_ID,
      customerId: customer.id,
      type: "SHOP",
      createdAt: now,
      updatedAt: now,
    },
  });
  await database.salesDraftPiece.create({
    data: {
      id: "44444444-4444-4444-8444-444444444444",
      draftId: draft.id,
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
  const source = await database.catalogSource.create({
    data: {
      sha256: "c".repeat(64),
      worksheet: "owned synthetic source",
      sourceExtent: "A1:AA942",
      mappingVersion: 1,
      loadedAt: now,
      loadedByReference: "cleanup fixture",
      entryCount: 1874,
      manifest: {},
    },
  });
  const entry = await database.catalogEntry.create({
    data: {
      sourceId: source.id,
      kind: "decoration",
      sourceCell: "Z3",
      displayValue: "Decoration",
      lookupValue: "decoration",
      position: 1,
      unitPrice: "1800.00",
      priceSourceCell: "AA3",
    },
  });
  await database.catalogActivation.update({
    where: { id: "active" },
    data: { sourceId: source.id, activatedAt: now },
  });
  await database.salesDraftPiece.update({
    where: { id: "44444444-4444-4444-8444-444444444444" },
    data: { decoration: "Decoration" },
  });
  await database.salesPieceCatalogSelection.create({
    data: {
      pieceId: "44444444-4444-4444-8444-444444444444",
      field: "decoration",
      entryId: entry.id,
    },
  });
  await database.$transaction(async (tx) => {
    await tx.salesDraft.update({
      where: { id: draft.id },
      data: { status: "SUBMITTED" },
    });
    await tx.salesOrder.create({
      data: {
        id: draft.id,
        businessNumber: "SHOP-2026-0001",
        numberSequence: 1n,
        numberYear: 2026,
        submittedAt: now,
        submittedById: ADMIN_ID,
        ownerFullNameAtSubmission: "Reset Admin",
        customerName: customer.name,
        customerPhone: customer.phone,
        catalogSourceId: source.id,
        totalAmount: "1800.00",
        paidAmount: "0.00",
      },
    });
    await tx.salesOrderPiece.create({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        orderId: draft.id,
        decorationEntryId: entry.id,
        priceSourceId: source.id,
        decorationLabel: "Decoration",
        unitPrice: "1800.00",
        priceSourceCell: "AA3",
      },
    });
    await tx.businessOrderCounter.update({
      where: { id: "global" },
      data: { lastIssued: 1n },
    });
  });
  await database.salesCommand.create({
    data: {
      commandId: "55555555-5555-4555-8555-555555555555",
      operation: "CREATE_DRAFT",
      actorId: ADMIN_ID,
      actorFullName: "Reset Admin",
      actorRole: "ADMIN",
      draftId: draft.id,
      afterVersion: 1,
      payloadHash: "a".repeat(64),
      after: {},
      occurredAt: now,
    },
  });
};

type OwnedGraphCounts = {
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
      orders: 1,
      orderPieces: 1,
      selections: 1,
      sources: 1,
      entries: 1,
      customers: 1,
      drafts: 1,
      pieces: 1,
      commands: 1,
    });
    expect(seeded.users).toBe(2);
    expect(seeded.refreshTokens).toBe(1);
    expect(seeded.staffDecisions).toBe(1);
    expect(seeded.initialAdministratorProvisioning).toBe(1);

    await resetOwnedIdentityTestData(database);

    const cleared = await ownedGraphCounts();
    expect(cleared).toMatchObject({
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
        orders: 1,
        orderPieces: 1,
        selections: 1,
        sources: 1,
        entries: 1,
        customers: 1,
        drafts: 1,
        pieces: 1,
        commands: 1,
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
