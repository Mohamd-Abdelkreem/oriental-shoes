import { randomUUID } from "node:crypto";
import {
  createCustomerBodySchema,
  createDraftBodySchema,
  draftListQuerySchema,
  saveDraftBodySchema,
  type DraftCapture,
} from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, expect, it } from "vitest";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { CustomersService } from "../customers/customers.service.js";
import { SalesCommandExecutor } from "../sales-commands/sales-command-executor.js";
import { SalesDraftsService } from "./sales-drafts.service.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const database = createDatabaseClient(uri),
  otherConnection = createDatabaseClient(uri);
const service = new SalesDraftsService(
  database,
  new SalesCommandExecutor(database),
);
const competitor = new SalesDraftsService(
  otherConnection,
  new SalesCommandExecutor(otherConnection),
);
const customers = new CustomersService(
  database,
  new SalesCommandExecutor(database),
);
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
const blank = () =>
  createDraftBodySchema.parse({
    commandId: randomUUID(),
    draft: { type: "SHOP", pieces: [{ id: randomUUID() }] },
  });
const save = (draft: DraftCapture, expectedVersion = 1) =>
  saveDraftBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion,
    draft,
  });
beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  const now = new Date();
  await database.user.create({
    data: {
      id: admin,
      email: "draft-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic-hash",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const [id, email] of [
    [a, "draft-a@example.test"],
    [b, "draft-b@example.test"],
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
});
afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
  await otherConnection.$disconnect();
});
it("persists one blank row without customer/date/specifications and reopens through another connection", async () => {
  const input = blank(),
    result = await service.create(a, input);
  expect(result.savedDraft).toMatchObject({
    version: 1,
    status: "DRAFT",
    owner: { id: a },
    customer: null,
    deliveryDate: null,
    paidAmount: null,
    pricing: { availability: "unavailable" },
    submission: { available: false },
  });
  expect(result.savedDraft.pieces.map((piece) => piece.id)).toEqual(
    input.draft.pieces.map((piece) => piece.id),
  );
  expect(result.savedDraft.createdAt).toBe(result.receipt.occurredAt);
  expect((await competitor.get(a, result.savedDraft.id)).draft).toEqual(
    result.savedDraft,
  );
  expect(result.savedDraft).not.toHaveProperty("businessNumber");
  expect(await database.salesCommand.count()).toBe(1);
});
it("round trips all independent paper captures and preserves hidden fields when type changes", async () => {
  const customer = await customers.create(
    a,
    createCustomerBodySchema.parse({
      commandId: randomUUID(),
      customer: { name: "Customer", phone: "0500000001" },
    }),
  );
  const input = createDraftBodySchema.parse({
    commandId: randomUUID(),
    draft: {
      type: "REPAIR",
      customerId: customer.savedCustomer.id,
      deliveryDate: "2026-11-20",
      paidAmount: "100.50",
      generalNotes: "General",
      responsibleSignature: "Captured signature",
      repairNote: "Repair",
      adjustmentRequested: "Requested",
      adjustmentReason: "Reason",
      adjustmentActionTaken: "Action",
      pieces: [
        {
          id: randomUUID(),
          model: "Model",
          size: "42",
          leatherBase: "Base",
          decoration: "Decoration",
          decorationColor: "Color",
          faceRight: " م١ ",
          faceLeft: "م٢",
          mixing: "م٣",
          face: "وجه",
          sole: "Floor",
          soleAddition: "روضة - H ",
          soleColor: "Floor color",
          additions: "ملاحظة",
          aField: "A",
          fField: "F",
          sideNotes: "Side notes",
        },
      ],
    },
  });
  const initial = await service.create(a, input);
  const changed = await service.save(
    a,
    initial.savedDraft.id,
    save({ ...input.draft, type: "ADJUSTMENT" }),
  );
  const reopened = (await service.get(a, initial.savedDraft.id)).draft;
  const { customerId: capturedCustomerId, ...expectedCapture } = input.draft;
  expect(capturedCustomerId).toBe(customer.savedCustomer.id);
  expect(reopened).toMatchObject({ ...expectedCapture, type: "ADJUSTMENT" });
  expect(reopened.customer?.id).toBe(customer.savedCustomer.id);
  expect(reopened.pieces[0]).toMatchObject(input.draft.pieces[0] ?? {});
  expect(reopened.paidAmount).toBe("100.50");
  expect(reopened.deliveryDate).toBe("2026-11-20");
  expect(reopened.responsibleSignature).not.toBe(
    changed.receipt.actor.fullName,
  );
});
it("copies and removes pieces atomically, reorders retained IDs and replays without extra effects", async () => {
  const input = blank(),
    first = input.draft.pieces[0];
  if (!first) throw new Error("Missing fixture row");
  first.model = "Copied model";
  const second = { ...first, id: randomUUID(), model: "Removed model" };
  input.draft.pieces.push(second);
  const initial = await service.create(a, input),
    copied = { ...first, id: randomUUID() };
  const next = { ...input.draft, pieces: [copied, first] },
    action = save(next);
  const result = await service.save(a, initial.savedDraft.id, action);
  expect(
    result.savedDraft.pieces.map((piece) => [
      piece.id,
      piece.position,
      piece.quantity,
    ]),
  ).toEqual([
    [copied.id, 1, 1],
    [first.id, 2, 1],
  ]);
  const removed = await database.salesDraftPiece.findUniqueOrThrow({
    where: { id: second.id },
  });
  expect(removed.removedAt?.toISOString()).toBe(result.receipt.occurredAt);
  expect(removed.model).toBe("Removed model");
  expect(await database.salesDraftPiece.count()).toBe(3);
  expect(
    (await service.save(a, initial.savedDraft.id, action)).savedDraft,
  ).toEqual(result.savedDraft);
  expect(await database.salesCommand.count()).toBe(2);
  const changes = await service.changes(
    a,
    { page: 1, limit: 25 },
    initial.savedDraft.id,
  );
  expect(changes.changes[0]).toMatchObject({
    addedPieceIds: [copied.id],
    removedPieceIds: [second.id],
  });
  const deliberate = await service.save(
    a,
    initial.savedDraft.id,
    save(next, 2),
  );
  expect(deliberate.savedDraft.version).toBe(3);
  expect(await database.salesCommand.count()).toBe(3);
});
it("rejects own tombstone resurrection and foreign piece adoption without changing either draft", async () => {
  const input = blank(),
    extra = { ...input.draft.pieces[0], id: randomUUID() };
  const first = input.draft.pieces[0];
  if (!first) throw new Error("Missing fixture row");
  input.draft.pieces.push({ ...first, id: extra.id });
  const initial = await service.create(a, input);
  const retained = { ...input.draft, pieces: [first] };
  await service.save(a, initial.savedDraft.id, save(retained));
  await expect(
    service.save(a, initial.savedDraft.id, save(input.draft, 2)),
  ).rejects.toMatchObject({ code: "DRAFT_PIECE_CONFLICT" });
  const foreignInput = blank(),
    foreign = await service.create(b, foreignInput);
  const foreignPiece = foreignInput.draft.pieces[0];
  if (!foreignPiece) throw new Error("Missing foreign fixture");
  await expect(
    service.save(
      a,
      initial.savedDraft.id,
      save({ ...retained, pieces: [foreignPiece] }, 2),
    ),
  ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
  expect((await service.get(a, initial.savedDraft.id)).draft.version).toBe(2);
  expect((await service.get(b, foreign.savedDraft.id)).draft).toEqual(
    foreign.savedDraft,
  );
  expect(await database.salesCommand.count()).toBe(3);
});
it("does not silently drop a missing customer or broaden a missing customer filter", async () => {
  const input = blank(),
    missing = randomUUID();
  await expect(
    service.create(a, {
      ...input,
      draft: { ...input.draft, customerId: missing },
    }),
  ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  expect(await database.salesDraft.count()).toBe(0);
  expect(await database.salesDraftPiece.count()).toBe(0);
  const initial = await service.create(a, input);
  await expect(
    service.save(
      a,
      initial.savedDraft.id,
      save({
        ...input.draft,
        customerId: missing,
        generalNotes: "must not apply",
      }),
    ),
  ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  await expect(
    service.list(a, draftListQuerySchema.parse({ customerId: missing })),
  ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  expect((await service.get(a, initial.savedDraft.id)).draft).toEqual(
    initial.savedDraft,
  );
  expect(await database.salesCommand.count()).toBe(1);
});
it("allows explicit customer unlink without editing or deleting the shared master", async () => {
  const customer = await customers.create(
    a,
    createCustomerBodySchema.parse({
      commandId: randomUUID(),
      customer: { name: "Customer", phone: "0500000001" },
    }),
  );
  const input = blank();
  input.draft.customerId = customer.savedCustomer.id;
  const initial = await service.create(a, input);
  const changed = await service.save(
    a,
    initial.savedDraft.id,
    save({ ...input.draft, customerId: null }),
  );
  expect(changed.savedDraft.customer).toBeNull();
  expect((await customers.get(b, customer.savedCustomer.id)).customer).toEqual(
    customer.savedCustomer,
  );
});
it("keeps direct reads/writes/history owner-private while ADMIN edits preserve original ownership", async () => {
  const aInput = blank(),
    bInput = blank(),
    owned = await service.create(a, aInput),
    foreign = await service.create(b, bInput);
  await expect(service.get(a, foreign.savedDraft.id)).rejects.toMatchObject({
    code: "DRAFT_NOT_FOUND",
  });
  await expect(service.get(a, randomUUID())).rejects.toMatchObject({
    code: "DRAFT_NOT_FOUND",
  });
  await expect(
    service.changes(a, { page: 1, limit: 25 }, foreign.savedDraft.id),
  ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
  await expect(
    service.save(a, foreign.savedDraft.id, save(bInput.draft)),
  ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
  expect(
    (await service.list(a, draftListQuerySchema.parse({}))).drafts.map(
      (row) => row.id,
    ),
  ).toEqual([owned.savedDraft.id]);
  expect(
    (await service.list(admin, draftListQuerySchema.parse({}))).drafts,
  ).toHaveLength(2);
  const edited = await service.save(
    admin,
    foreign.savedDraft.id,
    save({ ...bInput.draft, generalNotes: "ADMIN edit" }),
  );
  expect(edited.savedDraft.owner.id).toBe(b);
  expect(edited.receipt.actor.id).toBe(admin);
  const ownAdmin = await service.create(admin, blank());
  expect(ownAdmin.savedDraft.owner.id).toBe(admin);
});
it("permits one stale-save winner and records no losing child or receipt changes", async () => {
  const input = blank(),
    initial = await service.create(a, input),
    id = initial.savedDraft.id;
  const results = await Promise.allSettled([
    service.save(a, id, save({ ...input.draft, generalNotes: "A" })),
    competitor.save(a, id, save({ ...input.draft, generalNotes: "B" })),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const loser = results.find((result) => result.status === "rejected");
  expect(loser?.status === "rejected" ? loser.reason : null).toMatchObject({
    code: "DRAFT_VERSION_CONFLICT",
  });
  expect((await service.get(a, id)).draft.version).toBe(2);
  expect(await database.salesDraftPiece.count()).toBe(1);
  expect(await database.salesCommand.count()).toBe(2);
});
it.each(["empty", "duplicate", "too-many"] as const)(
  "protects the aggregate against %s row input even from an internal caller",
  async (kind) => {
    const input = blank(),
      initial = await service.create(a, input),
      first = input.draft.pieces[0];
    if (!first) throw new Error("Missing fixture");
    const pieces =
      kind === "empty"
        ? []
        : kind === "duplicate"
          ? [first, first]
          : Array.from({ length: 201 }, () => ({ ...first, id: randomUUID() }));
    await expect(
      service.save(a, initial.savedDraft.id, {
        commandId: randomUUID(),
        expectedVersion: 1,
        draft: { ...input.draft, pieces },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await service.get(a, initial.savedDraft.id)).draft).toEqual(
      initial.savedDraft,
    );
    expect(await database.salesCommand.count()).toBe(1);
  },
);
it("denies live authority loss and exhausted revisions without touching stored pieces", async () => {
  const input = blank(),
    initial = await service.create(a, input),
    id = initial.savedDraft.id;
  await database.user.update({
    where: { id: a },
    data: { status: "SUSPENDED" },
  });
  await expect(service.save(a, id, save(input.draft))).rejects.toMatchObject({
    code: "ACCOUNT_RESTRICTED",
  });
  await database.user.update({
    where: { id: b },
    data: { department: "QUALITY" },
  });
  await expect(
    service.list(b, draftListQuerySchema.parse({})),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await database.salesDraft.update({
    where: { id },
    data: { version: 2147483647 },
  });
  await expect(
    service.save(admin, id, save(input.draft, 2147483647)),
  ).rejects.toMatchObject({ code: "DRAFT_VERSION_CONFLICT" });
  expect((await service.get(admin, id)).draft.pieces).toEqual(
    initial.savedDraft.pieces,
  );
  expect(await database.salesCommand.count()).toBe(1);
});
it("returns empty history for an accessible parent that has no retained commands", async () => {
  const now = new Date(),
    draft = await database.salesDraft.create({
      data: { ownerId: a, type: "SHOP", createdAt: now, updatedAt: now },
    });
  expect(
    (await service.changes(a, { page: 1, limit: 25 }, draft.id)).changes,
  ).toEqual([]);
  await expect(
    service.changes(b, { page: 1, limit: 25 }, draft.id),
  ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
});

it("rolls back header, paid amount, retained positions, removals and new pieces after a late receipt failure", async () => {
  const input = blank();
  input.draft.pieces.push({
    ...input.draft.pieces[0],
    id: randomUUID(),
    model: null,
    size: null,
    leatherBase: null,
    decoration: null,
    decorationColor: null,
    faceRight: null,
    faceLeft: null,
    mixing: null,
    face: null,
    sole: null,
    soleAddition: null,
    soleColor: null,
    additions: null,
    aField: null,
    fField: null,
    sideNotes: null,
  });
  const initial = await service.create(a, input),
    id = initial.savedDraft.id;
  const before = {
    header: await database.salesDraft.findUniqueOrThrow({ where: { id } }),
    pieces: await database.salesDraftPiece.findMany({
      where: { draftId: id },
      orderBy: { id: "asc" },
    }),
    commands: await database.salesCommand.findMany({
      orderBy: { commandId: "asc" },
    }),
  };
  await database.$executeRaw`CREATE FUNCTION p02_test_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned late audit fault'; END; $$`;
  try {
    await database.$executeRaw`CREATE TRIGGER p02_test_fail_receipt BEFORE INSERT ON sales_commands FOR EACH ROW EXECUTE FUNCTION p02_test_fail_receipt()`;
    const retained = input.draft.pieces[1];
    if (retained === undefined)
      throw new Error("Expected retained second piece");
    const replacement = {
      ...input.draft,
      paidAmount: "99.50",
      generalNotes: "must roll back",
      pieces: [
        { ...retained, model: "changed" },
        { ...retained, id: randomUUID(), model: "new" },
      ],
    };
    await expect(service.save(a, id, save(replacement))).rejects.toThrow();
    expect(
      await database.salesDraft.findUniqueOrThrow({ where: { id } }),
    ).toEqual(before.header);
    expect(
      await database.salesDraftPiece.findMany({
        where: { draftId: id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before.pieces);
    expect(
      await database.salesCommand.findMany({ orderBy: { commandId: "asc" } }),
    ).toEqual(before.commands);
  } finally {
    await database.$executeRaw`DROP TRIGGER IF EXISTS p02_test_fail_receipt ON sales_commands`;
    await database.$executeRaw`DROP FUNCTION p02_test_fail_receipt()`;
  }
});

it("maps a controlled concurrent piece UUID claim to safe missing without partial draft or receipt", async () => {
  let enter: () => void = () => {
    throw new Error("Uninitialized gate");
  };
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  let release: () => void = () => {
    throw new Error("Uninitialized release");
  };
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await database.$executeRaw`CREATE FUNCTION p02_test_gate_piece() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(90212017); RETURN NEW; END; $$`;
  const holding = otherConnection.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(90212017)`;
      enter();
      await released;
    },
    { timeout: 15000 },
  );
  const settledHolding = Promise.allSettled([holding]);
  let settledFirst: Promise<unknown> = Promise.resolve(),
    settledSecond: Promise<unknown> = Promise.resolve();
  try {
    await Promise.race([entered, holding]);
    await database.$executeRaw`CREATE TRIGGER p02_test_gate_piece AFTER INSERT ON sales_draft_pieces FOR EACH ROW EXECUTE FUNCTION p02_test_gate_piece()`;
    const firstInput = blank(),
      secondInput = { ...firstInput, commandId: randomUUID() };
    const first = service.create(a, firstInput);
    settledFirst = Promise.allSettled([first]);
    await expect
      .poll(
        async () => {
          const rows = await database.$queryRaw<
            Array<{ count: number }>
          >`SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid=90212017`;
          return rows[0]?.count ?? 0;
        },
        { timeout: 3000, interval: 10 },
      )
      .toBe(1);
    const second = competitor.create(b, secondInput);
    settledSecond = Promise.allSettled([second]);
    await expect
      .poll(
        async () => {
          const rows = await database.$queryRaw<
            Array<{ count: number }>
          >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO%"sales_draft_pieces"%'`;
          return rows[0]?.count ?? 0;
        },
        { timeout: 3000, interval: 10 },
      )
      .toBe(2);
    release();
    await holding;
    const winner = await first;
    await expect(second).rejects.toMatchObject({
      code: "DRAFT_NOT_FOUND",
      statusCode: 404,
    });
    expect(await database.salesDraft.count()).toBe(1);
    expect(await database.salesDraftPiece.count()).toBe(1);
    expect(await database.salesCommand.count()).toBe(1);
    expect((await service.get(a, winner.savedDraft.id)).draft.owner.id).toBe(a);
  } finally {
    release();
    await settledHolding;
    await settledFirst;
    await settledSecond;
    await database.$executeRaw`DROP TRIGGER IF EXISTS p02_test_gate_piece ON sales_draft_pieces`;
    await database.$executeRaw`DROP FUNCTION p02_test_gate_piece()`;
  }
}, 20000);
