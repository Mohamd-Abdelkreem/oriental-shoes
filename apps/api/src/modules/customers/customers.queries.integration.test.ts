import { randomUUID } from "node:crypto";
import { customerListQuerySchema } from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, expect, it } from "vitest";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { loadIdentityAccount } from "../auth/account-authority.js";
import {
  findCustomerData,
  findCustomerDraftPage,
  findCustomerMeasurements,
  findCustomerPage,
} from "./customers.queries.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const database = createDatabaseClient(uri);
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
const c1 = "10000000-0000-4000-8000-000000000001",
  c2 = "10000000-0000-4000-8000-000000000002",
  c3 = "10000000-0000-4000-8000-000000000003";
const now = new Date("2026-11-01T00:00:00.000Z");
beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  await database.user.create({
    data: {
      id: admin,
      email: "query-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic-hash",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const [id, email] of [
    [a, "query-a@example.test"],
    [b, "query-b@example.test"],
  ] as const) {
    await database.user.create({
      data: {
        id,
        email,
        fullName: email,
        passwordHash: "synthetic-hash",
        status: "ACTIVE",
        emailVerifiedAt: now,
        department: "SALES",
        staffApprovedAt: now,
        staffApprovedById: admin,
      },
    });
  }
  await database.customer.createMany({
    data: [
      {
        id: c1,
        name: "Needle%_\\",
        phone: "+966500000001",
        email: "mixed@example.test",
        notes: "shared detail notes",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: c2,
        name: "Other",
        phone: "+966500000002",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: c3,
        name: "Third",
        phone: "+966112000001",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  for (const [ownerId, size, day] of [
    [a, "41", 1],
    [a, "42", 2],
    [b, "99", 3],
  ] as const) {
    const updatedAt = new Date(`2026-11-0${String(day)}T00:00:00.000Z`);
    const draft = await database.salesDraft.create({
      data: {
        ownerId,
        customerId: c1,
        type: "SHOP",
        createdAt: now,
        updatedAt,
      },
    });
    await database.salesDraftPiece.create({
      data: {
        id: randomUUID(),
        draftId: draft.id,
        position: 1,
        size,
        aField: `A${size}`,
        createdAt: now,
        updatedAt,
      },
    });
    await database.salesDraftPiece.create({
      data: {
        id: randomUUID(),
        draftId: draft.id,
        position: 2,
        size: "removed",
        removedAt: now,
        createdAt: now,
        updatedAt,
      },
    });
  }
});
afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

it.each([
  [a, 2, "42"],
  [b, 1, "99"],
  [admin, 3, "99"],
] as const)(
  "keeps shared contact and related values scoped for %s",
  async (actorId, count, latestSize) => {
    await database.$transaction(async (tx) => {
      const actor = await loadIdentityAccount(tx, actorId);
      const data = await findCustomerData(tx, actor, c1);
      expect(data).toMatchObject({
        customer: { id: c1, notes: "shared detail notes" },
        draftCount: count,
        latestMeasurement: { size: latestSize, source: "DRAFT" },
        submittedHistory: { availability: "not_available" },
      });
      const measurements = await findCustomerMeasurements(tx, actor, c1, {
        page: 1,
        limit: 100,
      });
      expect(measurements.pagination.total).toBe(count);
      expect(measurements.measurements.map((row) => row.size)).not.toContain(
        "removed",
      );
      if (actorId !== admin)
        expect(
          measurements.measurements.every((row) => row.owner.id === actorId),
        ).toBe(true);
      const page = await findCustomerPage(
        tx,
        actor,
        customerListQuerySchema.parse({ search: "mixed@EXAMPLE.test" }),
      );
      expect(page.customers).toHaveLength(1);
      expect(page.customers[0]).toMatchObject({
        draftCount: count,
        customer: { id: c1 },
      });
      expect(page.customers[0]?.customer).not.toHaveProperty("notes");
      expect(page.customers[0]?.customer).not.toHaveProperty("version");
    });
  },
);
it.each([
  "0500000001",
  "٠٥٠٠٠٠٠٠٠١",
  "+966 50 000 0001",
  "00966500000001",
  "٠٥٠٠٠٠٠٠٠",
])("resolves normalized phone search fragment %s", async (search) => {
  const page = await database.$transaction(async (tx) =>
    findCustomerPage(
      tx,
      await loadIdentityAccount(tx, a),
      customerListQuerySchema.parse({ search }),
    ),
  );
  expect(page.customers.map((row) => row.customer.id)).toContain(c1);
});
it("keeps literal wildcard searches, deterministic pages and filtered/unfiltered totals truthful", async () => {
  await database.$transaction(async (tx) => {
    const actor = await loadIdentityAccount(tx, a);
    const literal = await findCustomerPage(
      tx,
      actor,
      customerListQuerySchema.parse({ search: "%_\\" }),
    );
    expect(literal.customers.map((row) => row.customer.id)).toEqual([c1]);
    expect(literal.pagination.total).toBe(1);
    expect(literal.totalCustomers).toBe(3);
    const first = await findCustomerPage(tx, actor, { page: 1, limit: 1 });
    const second = await findCustomerPage(tx, actor, { page: 2, limit: 1 });
    expect(first.customers[0]?.customer.id).toBe(c3);
    expect(second.customers[0]?.customer.id).toBe(c2);
    const beyond = await findCustomerPage(tx, actor, { page: 99, limit: 1 });
    expect(beyond.customers).toEqual([]);
    expect(beyond.pagination).toMatchObject({
      total: 3,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    const empty = await findCustomerPage(tx, actor, {
      search: "absent",
      page: 1,
      limit: 25,
    });
    expect(empty.customers).toEqual([]);
    expect(empty.pagination.totalPages).toBe(0);
    expect(await findCustomerData(tx, actor, randomUUID())).toBeNull();
  });
});

it.each([
  [a, 2],
  [b, 1],
  [admin, 3],
] as const)(
  "pages captured cards for actor %s without leaking other owners/customers or removed pieces",
  async (actorId, total) => {
    const own = await database.salesDraft.findFirstOrThrow({
      where: { ownerId: a, customerId: c1 },
      orderBy: { updatedAt: "desc" },
    });
    await database.salesDraft.update({
      where: { id: own.id },
      data: { generalNotes: "Saved card notes" },
    });
    await database.salesDraftPiece.updateMany({
      where: { draftId: own.id, removedAt: null },
      data: { model: "Card model", leatherBase: "Card leather" },
    });
    await database.salesDraftPiece.create({
      data: {
        id: randomUUID(),
        draftId: own.id,
        position: 3,
        createdAt: now,
        updatedAt: now,
      },
    });
    await database.salesDraft.create({
      data: {
        ownerId: actorId,
        customerId: c2,
        type: "SHOP",
        createdAt: now,
        updatedAt: now,
        pieces: {
          create: {
            id: randomUUID(),
            position: 1,
            model: "Foreign customer",
            createdAt: now,
            updatedAt: now,
          },
        },
      },
    });
    await database.$transaction(async (tx) => {
      const actor = await loadIdentityAccount(tx, actorId);
      const first = await findCustomerDraftPage(tx, actor, c1, {
        page: 1,
        limit: 1,
      });
      expect(first.pagination.total).toBe(total);
      expect(first.drafts).toHaveLength(1);
      if (actorId !== admin) expect(first.drafts[0]?.owner.id).toBe(actorId);
      const all = await findCustomerDraftPage(tx, actor, c1, {
        page: 1,
        limit: 25,
      });
      expect(
        all.drafts
          .flatMap((draft) => draft.pieces)
          .some(
            (piece) =>
              piece.size === "removed" || piece.model === "Foreign customer",
          ),
      ).toBe(false);
      if (actorId !== b) {
        const card = all.drafts.find((draft) => draft.id === own.id);
        expect(card).toMatchObject({
          generalNotes: "Saved card notes",
          pieceCount: 2,
          pieces: [
            { model: "Card model", leatherBase: "Card leather" },
            { model: null, size: null, leatherBase: null },
          ],
        });
        expect(card?.pieces.map((piece) => piece.position)).toEqual([1, 2]);
      }
      const beyond = await findCustomerDraftPage(tx, actor, c1, {
        page: 9,
        limit: 1,
      });
      expect(beyond.drafts).toEqual([]);
      expect(beyond.pagination.total).toBe(total);
    });
  },
);
