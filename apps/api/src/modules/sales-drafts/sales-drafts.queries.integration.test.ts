import { randomUUID } from "node:crypto";
import { draftListQuerySchema } from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, expect, it } from "vitest";
import { parseDateOnly } from "../../core/date-only.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { loadIdentityAccount } from "../auth/account-authority.js";
import { DRAFT_SELECT, mapDraft } from "./sales-drafts.mapper.js";
import {
  findDraftChanges,
  findDraftData,
  findDraftPage,
} from "./sales-drafts.queries.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const database = createDatabaseClient(uri);
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID(),
  customerId = randomUUID();
const aShop = "20000000-0000-4000-8000-000000000001",
  aRepair = "20000000-0000-4000-8000-000000000002",
  bShop = "20000000-0000-4000-8000-000000000003";
const p1 = randomUUID(),
  p2 = randomUUID(),
  p3 = randomUUID();
const now = new Date("2026-11-05T00:00:00.000Z");
beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  await database.user.create({
    data: {
      id: admin,
      email: "draft-query-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic-hash",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const [id, email] of [
    [a, "draft-query-a@example.test"],
    [b, "draft-query-b@example.test"],
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
  await database.customer.create({
    data: {
      id: customerId,
      name: "Customer",
      phone: "+966500000001",
      createdAt: now,
      updatedAt: now,
    },
  });
  for (const [id, ownerId, type] of [
    [aShop, a, "SHOP"],
    [aRepair, a, "REPAIR"],
    [bShop, b, "SHOP"],
  ] as const) {
    await database.salesDraft.create({
      data: {
        id,
        ownerId,
        type,
        customerId: id === aRepair ? null : customerId,
        paidAmount: "100.50",
        deliveryDate: parseDateOnly("0001-01-01"),
        generalNotes: "Sensitive notes",
        createdAt: now,
        updatedAt: now,
      },
    });
    await database.salesDraftPiece.create({
      data: {
        id: id === aShop ? p1 : randomUUID(),
        draftId: id,
        position: 1,
        model: id === aShop ? "Model%_\\" : "Other",
        soleAddition: "روضة - H ",
        additions: "ملاحظة",
        faceRight: "م١",
        faceLeft: "م٢",
        mixing: "م٣",
        face: "وجه",
        aField: "A",
        fField: "F",
        sideNotes: "Side",
        createdAt: now,
        updatedAt: now,
      },
    });
    if (id === aShop)
      await database.salesDraftPiece.create({
        data: {
          id: p2,
          draftId: id,
          position: 2,
          createdAt: now,
          updatedAt: now,
        },
      });
    const after = mapDraft(
      await database.salesDraft.findUniqueOrThrow({
        where: { id },
        select: DRAFT_SELECT,
      }),
    );
    await database.salesCommand.create({
      data: {
        commandId: randomUUID(),
        operation: "CREATE_DRAFT",
        actorId: ownerId,
        actorFullName:
          ownerId === a
            ? "draft-query-a@example.test"
            : "draft-query-b@example.test",
        actorRole: "USER",
        actorDepartment: "SALES",
        draftId: id,
        afterVersion: 1,
        payloadHash: "a".repeat(64),
        after,
        occurredAt: now,
      },
    });
  }
  const before = mapDraft(
    await database.salesDraft.findUniqueOrThrow({
      where: { id: aShop },
      select: DRAFT_SELECT,
    }),
  );
  await database.salesDraftPiece.update({
    where: { id: p2 },
    data: { removedAt: now },
  });
  await database.salesDraftPiece.create({
    data: {
      id: p3,
      draftId: aShop,
      position: 2,
      createdAt: now,
      updatedAt: now,
    },
  });
  await database.salesDraft.update({
    where: { id: aShop },
    data: { version: 2, generalNotes: "New sensitive notes" },
  });
  const after = mapDraft(
    await database.salesDraft.findUniqueOrThrow({
      where: { id: aShop },
      select: DRAFT_SELECT,
    }),
  );
  await database.salesCommand.create({
    data: {
      commandId: randomUUID(),
      operation: "SAVE_DRAFT",
      actorId: a,
      actorFullName: "draft-query-a@example.test",
      actorRole: "USER",
      actorDepartment: "SALES",
      requestTargetId: aShop,
      draftId: aShop,
      expectedVersion: 1,
      beforeVersion: 1,
      afterVersion: 2,
      payloadHash: "b".repeat(64),
      before,
      after,
      occurredAt: now,
    },
  });
});
afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

it.each([
  [a, 2, 3, 3],
  [b, 1, 1, 1],
  [admin, 3, 4, 4],
] as const)(
  "scopes draft/count/activity projections for %s",
  async (actorId, drafts, pieces, changes) => {
    await database.$transaction(async (tx) => {
      const actor = await loadIdentityAccount(tx, actorId);
      const page = await findDraftPage(
        tx,
        actor,
        draftListQuerySchema.parse({}),
      );
      expect(page).toMatchObject({
        totalDrafts: drafts,
        totalPieces: pieces,
        pagination: { total: drafts },
      });
      if (actorId !== admin)
        expect(page.drafts.every((draft) => draft.owner.id === actorId)).toBe(
          true,
        );
      const activity = await findDraftChanges(tx, actor, {
        page: 1,
        limit: 25,
      });
      expect(activity.changes).toHaveLength(changes);
      expect(JSON.stringify(activity)).not.toMatch(
        /Sensitive|sensitive|payloadHash|passwordHash/u,
      );
      if (actorId === b) {
        expect(await findDraftData(tx, actor, aShop)).toBeNull();
        expect(
          (await findDraftChanges(tx, actor, { page: 1, limit: 25 }, aShop))
            .changes,
        ).toEqual([]);
      }
    });
  },
);
it("maps exact decimal, low-year date, independent captures and active stable piece identities", async () => {
  const draft = await database.$transaction(async (tx) =>
    findDraftData(tx, await loadIdentityAccount(tx, a), aShop),
  );
  expect(draft).toMatchObject({
    paidAmount: "100.50",
    deliveryDate: "0001-01-01",
    pricing: { availability: "unavailable" },
    submission: { available: false },
  });
  expect(draft?.pieces.map((piece) => piece.id)).toEqual([p1, p3]);
  expect(draft?.pieces[0]).toMatchObject({
    position: 1,
    quantity: 1,
    soleAddition: "روضة - H ",
    additions: "ملاحظة",
    faceRight: "م١",
    faceLeft: "م٢",
    mixing: "م٣",
    face: "وجه",
    aField: "A",
    fField: "F",
    sideNotes: "Side",
  });
  expect(draft).not.toHaveProperty("ownerId");
  expect(draft).not.toHaveProperty("total");
});
it("keeps base totals independent of search and uses stable tie sorting and page metadata", async () => {
  await database.$transaction(async (tx) => {
    const actor = await loadIdentityAccount(tx, a);
    const first = await findDraftPage(
      tx,
      actor,
      draftListQuerySchema.parse({ limit: 1 }),
    );
    expect(first.drafts[0]?.id).toBe(aRepair);
    const model = await findDraftPage(
      tx,
      actor,
      draftListQuerySchema.parse({ search: "%_\\" }),
    );
    expect(model.drafts.map((draft) => draft.id)).toEqual([aShop]);
    expect(model).toMatchObject({
      totalDrafts: 2,
      totalPieces: 3,
      pagination: { total: 1 },
    });
    const exact = await findDraftPage(
      tx,
      actor,
      draftListQuerySchema.parse({ search: aShop }),
    );
    expect(exact.drafts.map((draft) => draft.id)).toEqual([aShop]);
    const phone = await findDraftPage(
      tx,
      actor,
      draftListQuerySchema.parse({ search: "٠٥٠٠٠٠٠٠٠١" }),
    );
    expect(phone.drafts.map((draft) => draft.id)).toEqual([aShop]);
    const filtered = await findDraftPage(
      tx,
      actor,
      draftListQuerySchema.parse({ customerId, type: "SHOP" }),
    );
    expect(filtered).toMatchObject({ totalDrafts: 1, totalPieces: 2 });
    const beyond = await findDraftPage(
      tx,
      actor,
      draftListQuerySchema.parse({ page: 99 }),
    );
    expect(beyond.drafts).toEqual([]);
    expect(beyond.pagination.total).toBe(2);
  });
});
it("summarizes header and piece changes without returning captured PII or historic snapshots", async () => {
  await database.$transaction(async (tx) => {
    const actor = await loadIdentityAccount(tx, a),
      data = await findDraftChanges(tx, actor, { page: 1, limit: 25 }, aShop);
    const saved = data.changes.find(
      (change) => change.operation === "SAVE_DRAFT",
    );
    expect(saved).toMatchObject({
      beforeVersion: 1,
      afterVersion: 2,
      addedPieceIds: [p3],
      removedPieceIds: [p2],
    });
    expect(saved?.changedFields).toEqual(["generalNotes", "pieces"]);
    expect(saved).not.toHaveProperty("before");
    expect(saved).not.toHaveProperty("after");
    expect(await findDraftData(tx, actor, randomUUID())).toBeNull();
  });
});
