import { randomUUID } from "node:crypto";
import {
  submitOrderBodySchema,
  createDraftBodySchema,
  createCustomerBodySchema,
  type SubmitOrderBody,
} from "@template/contracts";
import { createDatabaseClient, type Prisma } from "@template/database";
import { afterAll, beforeEach, it, expect } from "vitest";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { syntheticCatalogPreview } from "../../test-support/reviewed-catalog.fixture.js";
import { CatalogLoaderService } from "../catalogs/catalog-loader.service.js";
import { CatalogsService } from "../catalogs/catalogs.service.js";
import { CustomersService } from "../customers/customers.service.js";
import { SalesDraftsService } from "../sales-drafts/sales-drafts.service.js";
import { SalesCommandExecutor } from "../sales-commands/sales-command-executor.js";
import { SalesOrdersService } from "./sales-orders.service.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const db = createDatabaseClient(uri),
  executor = new SalesCommandExecutor(db),
  service = new SalesOrdersService(db, executor, "UTC"),
  catalogs = new CatalogsService(db),
  drafts = new SalesDraftsService(db, executor),
  customers = new CustomersService(db, executor);
const actor = randomUUID();
let customerId: string;
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
  await db.user.create({
    data: {
      id: actor,
      email: "order-admin@example.test",
      fullName: "Order Admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const customer = await customers.create(
    actor,
    createCustomerBodySchema.parse({
      commandId: randomUUID(),
      customer: {
        name: "Frozen contact",
        phone: "0501234567",
        address: "Frozen address",
      },
    }),
  );
  customerId = customer.savedCustomer.id;
  const [database] = await db.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (!database) throw new Error("Missing database");
  await new CatalogLoaderService(db).apply(
    syntheticCatalogPreview(),
    database.name,
  );
});
afterAll(async () => {
  await resetOwnedIdentityTestData(db);
  await db.$disconnect();
});
const submission = async (
  overrides: Record<string, unknown> = {},
): Promise<SubmitOrderBody> => {
  const capture = {
    type: "SHOP",
    customerId,
    paidAmount: "100.50",
    pieces: [
      {
        id: randomUUID(),
        model: "SM",
        size: "40",
        leatherBase: "synthetic I3",
        decoration: "زبيري - z",
        face: "standard",
      },
    ],
  };
  const quote = await catalogs.quote(actor, {
    requestId: randomUUID(),
    pieces: capture.pieces,
  });
  if (quote.availability !== "available")
    throw new Error("Missing synthetic quote");
  return submitOrderBodySchema.parse({
    origin: "new",
    commandId: randomUUID(),
    capture,
    expectedCustomerVersion: 1,
    reviewedQuote: { sourceId: quote.sourceId, fingerprint: quote.fingerprint },
    ...overrides,
  });
};
const graph = async () => ({
  roots: await db.salesDraft.findMany({ orderBy: { id: "asc" } }),
  pieces: await db.salesDraftPiece.findMany({ orderBy: { id: "asc" } }),
  refs: await db.salesPieceCatalogSelection.findMany({
    orderBy: [{ pieceId: "asc" }, { field: "asc" }],
  }),
  orders: await db.salesOrder.findMany({ orderBy: { id: "asc" } }),
  terms: await db.salesOrderPiece.findMany({ orderBy: { id: "asc" } }),
  counter: await db.businessOrderCounter.findMany(),
  commands: await db.salesCommand.findMany({ orderBy: { commandId: "asc" } }),
});
it("submits new paper atomically with frozen contacts, selected identities, paid and one immutable receipt", async () => {
  const input = await submission(),
    result = await service.submit(actor, input),
    order = result.savedOrder;
  expect(order).toMatchObject({
    version: 1,
    status: "AWAITING_APPROVAL",
    businessNumber: `SHOP-${String(new Date().getUTCFullYear())}-0001`,
    money: { total: "1800.00", paidAmount: "100.50", remainingDue: "1699.50" },
    customerSnapshot: { name: "Frozen contact", address: "Frozen address" },
  });
  expect(order.pieces.map((p) => p.id)).toEqual(
    input.capture.pieces.map((p) => p.id),
  );
  expect(await db.salesDraft.count()).toBe(1);
  expect(await db.salesCommand.count({ where: { draftId: order.id } })).toBe(1);
  const before = await graph();
  expect(await service.submit(actor, input)).toEqual({
    ...result,
    replayed: true,
  });
  expect(await graph()).toEqual(before);
  await db.customer.update({
    where: { id: customerId },
    data: { name: "Changed master", version: { increment: 1 } },
  });
  expect(
    (await service.submit(actor, input)).savedOrder.customerSnapshot.name,
  ).toBe("Frozen contact");
});
it("promotes a saved root once, retaining piece IDs and historical draft receipt", async () => {
  const input = await submission();
  const draft = await drafts.create(
    actor,
    createDraftBodySchema.parse({
      commandId: randomUUID(),
      draft: input.capture,
    }),
  );
  const saved = submitOrderBodySchema.parse({
    ...input,
    origin: "draft",
    draftId: draft.savedDraft.id,
    expectedVersion: 1,
  });
  const result = await service.submit(actor, saved);
  expect(result.savedOrder.id).toBe(draft.savedDraft.id);
  expect(result.savedOrder.version).toBe(2);
  expect(result.savedOrder.pieces[0]?.id).toBe(draft.savedDraft.pieces[0]?.id);
  const before = await graph();
  await expect(
    service.submit(actor, { ...saved, commandId: randomUUID() }),
  ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
  expect(await graph()).toEqual(before);
});
it("rejects stale quote/customer, invalid optional selections and unavailable calendar before issuing any number", async () => {
  const input = await submission(),
    before = await graph();
  await expect(
    service.submit(actor, {
      ...input,
      reviewedQuote: { ...input.reviewedQuote, fingerprint: "0".repeat(64) },
    }),
  ).rejects.toMatchObject({ code: "ORDER_QUOTE_CHANGED" });
  await expect(
    service.submit(actor, { ...input, expectedCustomerVersion: 2 }),
  ).rejects.toMatchObject({ code: "ORDER_CUSTOMER_CHANGED" });
  const invalid = submitOrderBodySchema.parse({
    ...input,
    capture: {
      ...input.capture,
      pieces: input.capture.pieces.map((p) => ({ ...p, sole: "invalid" })),
    },
  });
  await expect(service.submit(actor, invalid)).rejects.toThrow();
  await expect(
    new SalesOrdersService(db, executor, null).submit(actor, input),
  ).rejects.toMatchObject({ code: "ORDER_CALENDAR_UNAVAILABLE" });
  expect(await graph()).toEqual(before);
});
it("rolls back counter, root, pieces and frozen terms when receipt persistence fails", async () => {
  const input = await submission(),
    before = await graph();
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p03_test_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='SUBMIT_NEW_ORDER' THEN RAISE EXCEPTION 'owned receipt failure'; END IF; RETURN NEW; END $$",
  );
  await db.$executeRawUnsafe(
    "CREATE TRIGGER p03_test_reject_receipt BEFORE INSERT ON sales_commands FOR EACH ROW EXECUTE FUNCTION p03_test_reject_receipt()",
  );
  try {
    await expect(service.submit(actor, input)).rejects.toThrow();
    expect(await graph()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p03_test_reject_receipt ON sales_commands",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p03_test_reject_receipt()");
  }
  expect((await service.submit(actor, input)).savedOrder.sequence).toBe("1");
});

it("resubmits a labelled P04-shaped return with identical physical IDs, terms and proof retained in history", async () => {
  const result = await service.submit(actor, await submission()),
    order = result.savedOrder;
  // Isolated consumer fixture. P03 exposes no approve/return command.
  const decisionId = randomUUID();
  await db.$transaction(async (tx) => {
    await tx.salesDraft.update({
      where: { id: order.id },
      data: { version: 2 },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: "RETURNED",
        currentReturnDecisionId: decisionId,
        currentReturnOrderVersion: 2,
        currentReturnReason: "Review size",
        currentReturnedAt: new Date(),
      },
    });
  });
  const { readCurrentOrderReturnProof } =
    await import("./sales-orders.queries.js");
  expect(
    await db.$transaction((tx) => readCurrentOrderReturnProof(tx, order.id)),
  ).toMatchObject({ decisionId, orderVersion: 2 });
  const { resubmitOrderBodySchema } = await import("@template/contracts");
  const {
    position: _position,
    quantity: _quantity,
    decoration: _decoration,
    catalogSelections: _references,
    decorationEntryId: _entry,
    catalogSourceId: _source,
    unitPrice: _price,
    stage: _stage,
    workState: _work,
    receivedAt: _received,
    cancelledAt: _cancelled,
    cancellationReason: _reason,
    ...piece
  } = order.pieces[0] ??
  (() => {
    throw new Error("Missing piece");
  })();
  const input = resubmitOrderBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 2,
    corrections: {
      deliveryDate: null,
      generalNotes: "Corrected header",
      responsibleSignature: order.responsibleSignature,
      repairNote: order.repairNote,
      adjustmentRequested: order.adjustmentRequested,
      adjustmentReason: order.adjustmentReason,
      adjustmentActionTaken: order.adjustmentActionTaken,
      pieces: [{ ...piece, size: "40.5" }],
    },
  });
  const terms = await db.salesOrderPiece.findMany(),
    corrected = await service.resubmit(actor, order.id, input);
  expect(corrected.savedOrder).toMatchObject({
    version: 3,
    status: "AWAITING_APPROVAL",
    businessNumber: order.businessNumber,
    money: order.money,
  });
  expect(corrected.savedOrder.pieces[0]).toMatchObject({
    id: piece.id,
    position: 1,
    quantity: 1,
    size: "40.5",
    unitPrice: "1800.00",
  });
  expect(await db.salesOrderPiece.findMany()).toEqual(terms);
  expect(
    await db.$transaction((tx) => readCurrentOrderReturnProof(tx, order.id)),
  ).toBeNull();
  const command = await db.salesCommand.findUniqueOrThrow({
    where: { commandId: input.commandId },
  });
  expect(command.before).toMatchObject({
    approval: { returnDecisionId: decisionId, returnRevision: 2 },
  });
  const before = await graph();
  expect((await service.resubmit(actor, order.id, input)).replayed).toBe(true);
  expect(await graph()).toEqual(before);
});
it("changes cumulative paid only after isolated approval, allowing correction and surplus while preserving original capture", async () => {
  const { setOrderPaidBodySchema } = await import("@template/contracts");
  const order = (await service.submit(actor, await submission())).savedOrder;
  const paid = (amount: string, version: number) =>
    setOrderPaidBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: version,
      paidAmount: amount,
    });
  await expect(
    service.setPaid(actor, order.id, paid("450.50", 1)),
  ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
  // Isolated consumer evidence, not a P04 approval workflow.
  await db.$transaction(async (tx) => {
    await tx.salesDraft.update({
      where: { id: order.id },
      data: { version: 2 },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
  });
  const input = paid("450.50", 2),
    updated = await service.setPaid(actor, order.id, input);
  expect(updated.savedOrder.money.paidAmount).toBe("450.50");
  expect(
    (
      await db.salesDraft.findUniqueOrThrow({ where: { id: order.id } })
    ).paidAmount?.toString(),
  ).toBe("100.5");
  const before = await graph();
  await expect(
    service.setPaid(actor, order.id, paid("450.50", 3)),
  ).rejects.toMatchObject({ code: "ORDER_PAID_UNCHANGED" });
  expect(await graph()).toEqual(before);
  expect((await service.setPaid(actor, order.id, input)).replayed).toBe(true);
  expect(
    (await service.setPaid(actor, order.id, paid("300", 3))).savedOrder.money
      .paidAmount,
  ).toBe("300.00");
  expect(
    (await service.setPaid(actor, order.id, paid("1900", 4))).savedOrder.money,
  ).toMatchObject({
    total: "1800.00",
    paidAmount: "1900.00",
    remainingDue: "0.00",
    surplus: "100.00",
  });
});

const independent = createDatabaseClient(uri),
  observer = createDatabaseClient(uri);
const competingOrders = new SalesOrdersService(
  independent,
  new SalesCommandExecutor(independent),
  "UTC",
);
afterAll(async () => {
  await independent.$disconnect();
  await observer.$disconnect();
});
const raceBehindLock = async <T>(
  lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
  attempts: () => Array<Promise<T>>,
) => {
  let acquired!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const blocker = observer.$transaction(
    async (tx) => {
      await lock(tx);
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await ready;
  const settled = Promise.allSettled(attempts());
  try {
    const deadline = Date.now() + 4000;
    let waiting = 0;
    while (Date.now() < deadline && waiting < 2) {
      const [row] = await observer.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
      waiting = row?.count ?? 0;
    }
    expect(waiting).toBeGreaterThanOrEqual(2);
  } finally {
    release();
    await blocker;
    await settled;
  }
  return settled;
};
it("serializes same-key new submission and distinct new numbers through real independent connections", async () => {
  const input = await submission();
  const same = await raceBehindLock(
    (tx) =>
      tx.$queryRaw`SELECT id FROM customers WHERE id=${customerId}::uuid FOR UPDATE`,
    () => [service.submit(actor, input), competingOrders.submit(actor, input)],
  );
  expect(same.every((result) => result.status === "fulfilled")).toBe(true);
  expect(await db.salesOrder.count()).toBe(1);
  expect(
    await db.salesCommand.count({ where: { operation: "SUBMIT_NEW_ORDER" } }),
  ).toBe(1);
  expect(
    (
      await db.businessOrderCounter.findUniqueOrThrow({
        where: { id: "global" },
      })
    ).lastIssued,
  ).toBe(1n);
  const left = await submission(),
    right = await submission();
  const distinct = await raceBehindLock(
    (tx) =>
      tx.$queryRaw`SELECT id FROM business_order_counter WHERE id='global' FOR UPDATE`,
    () => [service.submit(actor, left), competingOrders.submit(actor, right)],
  );
  expect(distinct.every((result) => result.status === "fulfilled")).toBe(true);
  expect(
    (await db.salesOrder.findMany({ orderBy: { numberSequence: "asc" } })).map(
      (order) => order.numberSequence,
    ),
  ).toEqual([1n, 2n, 3n]);
});
it("allows one distinct-key saved submission and one save-versus-submit winner without a losing write", async () => {
  const input = await submission(),
    draft = await drafts.create(
      actor,
      createDraftBodySchema.parse({
        commandId: randomUUID(),
        draft: input.capture,
      }),
    ),
    id = draft.savedDraft.id;
  const saved = submitOrderBodySchema.parse({
    ...input,
    origin: "draft",
    draftId: id,
    expectedVersion: 1,
  });
  const results = await raceBehindLock(
    (tx) =>
      tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${id}::uuid FOR UPDATE`,
    () => [
      service.submit(actor, saved),
      competingOrders.submit(actor, { ...saved, commandId: randomUUID() }),
    ],
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    results.filter((result) => result.status === "rejected"),
  ).toMatchObject([{ reason: { code: "ORDER_STATE_CONFLICT" } }]);
  expect(await db.salesCommand.count({ where: { draftId: id } })).toBe(2);
  expect(
    (await db.salesDraft.findUniqueOrThrow({ where: { id } })).version,
  ).toBe(2);
  const second = await submission(),
    created = await drafts.create(
      actor,
      createDraftBodySchema.parse({
        commandId: randomUUID(),
        draft: second.capture,
      }),
    ),
    secondId = created.savedDraft.id;
  const submit = submitOrderBodySchema.parse({
    ...second,
    origin: "draft",
    draftId: secondId,
    expectedVersion: 1,
  });
  const { saveDraftBodySchema } = await import("@template/contracts");
  const otherDrafts = new SalesDraftsService(
    independent,
    new SalesCommandExecutor(independent),
  );
  const mixed = await raceBehindLock<unknown>(
    (tx) =>
      tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${secondId}::uuid FOR UPDATE`,
    () => [
      service.submit(actor, submit),
      otherDrafts.save(
        actor,
        secondId,
        saveDraftBodySchema.parse({
          commandId: randomUUID(),
          expectedVersion: 1,
          draft: { ...second.capture, generalNotes: "Raced save" },
        }),
      ),
    ],
  );
  expect(mixed.filter((result) => result.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(await db.salesCommand.count({ where: { draftId: secondId } })).toBe(2);
  expect(
    (await db.salesDraft.findUniqueOrThrow({ where: { id: secondId } }))
      .version,
  ).toBe(2);
});
it("rechecks customer and live account changes after their locks and allocates no number for losers", async () => {
  const input = await submission();
  let release!: () => void, acquired!: () => void;
  const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const blocker = observer.$transaction(
    async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { version: { increment: 1 }, name: "Concurrent change" },
      });
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await ready;
  const pending = service.submit(actor, input);
  let waiting = false;
  try {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && !waiting) {
      const [row] = await observer.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%customers%FOR SHARE%'`;
      waiting = (row?.count ?? 0) > 0;
    }
    expect(waiting).toBe(true);
  } finally {
    release();
  }
  await blocker;
  await expect(pending).rejects.toMatchObject({
    code: "ORDER_CUSTOMER_CHANGED",
  });
  expect(await db.salesOrder.count()).toBe(0);
  // Both attempts wait for the current-account change, not token claims or cached authority.
  const results = await raceBehindLock(
    (tx) =>
      tx.user.update({ where: { id: actor }, data: { status: "SUSPENDED" } }),
    () => [service.submit(actor, input), competingOrders.submit(actor, input)],
  );
  expect(
    results.filter((result) => result.status === "rejected"),
  ).toMatchObject([
    { reason: { code: "ACCOUNT_RESTRICTED" } },
    { reason: { code: "ACCOUNT_RESTRICTED" } },
  ]);
  expect(await db.salesOrder.count()).toBe(0);
  expect(
    (
      await db.businessOrderCounter.findUniqueOrThrow({
        where: { id: "global" },
      })
    ).lastIssued,
  ).toBe(0n);
});
it("conflicts on a newly activated source without mixing historical and current terms", async () => {
  const input = await submission(),
    old = await db.catalogSource.findFirstOrThrow(),
    replacementId = randomUUID();
  const entries = await db.catalogEntry.findMany({
    where: { sourceId: old.id },
  });
  const decoration = entries.find(
    (entry) => entry.kind === "decoration" && entry.sourceCell === "Z3",
  );
  if (!decoration) throw new Error("Missing original decoration");
  input.capture.pieces = input.capture.pieces.map((piece) => ({
    ...piece,
    catalogSelections: { decoration: decoration.id },
  }));

  await db.$transaction(async (tx) => {
    await tx.catalogSource.create({
      data: {
        ...old,
        id: replacementId,
        sha256: "a".repeat(64),
        loadedByReference: "isolated source-race fixture",
        manifest: { syntheticConsumer: true },
      },
    });
    await tx.catalogEntry.createMany({
      data: entries.map((entry) => ({
        ...entry,
        id: randomUUID(),
        sourceId: replacementId,
      })),
    });
  });
  const results = await raceBehindLock(
    (tx) =>
      tx.catalogActivation.update({
        where: { id: "active" },
        data: { sourceId: replacementId, activatedAt: new Date() },
      }),
    () => [
      service.submit(actor, input),
      competingOrders.submit(actor, { ...input, commandId: randomUUID() }),
    ],
  );
  expect(
    results.filter((result) => result.status === "rejected"),
  ).toMatchObject([
    { reason: { code: "ORDER_QUOTE_CHANGED" } },
    { reason: { code: "ORDER_QUOTE_CHANGED" } },
  ]);
  expect(await db.salesOrder.count()).toBe(0);
  expect(await db.salesDraft.count()).toBe(0);
  expect(
    await db.salesCommand.count({ where: { operation: "SUBMIT_NEW_ORDER" } }),
  ).toBe(0);
  expect(
    (
      await db.businessOrderCounter.findUniqueOrThrow({
        where: { id: "global" },
      })
    ).lastIssued,
  ).toBe(0n);
});

it("keeps one global sequence across types and calendar years and rejects exhausted numbering", async () => {
  const { vi } = await import("vitest");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2026-12-31T22:00:00Z"));
    const first = (await service.submit(actor, await submission())).savedOrder;
    const next = await submission();
    const second = (
      await service.submit(
        actor,
        submitOrderBodySchema.parse({
          ...next,
          capture: { ...next.capture, type: "EXTERNAL", paidAmount: null },
        }),
      )
    ).savedOrder;
    vi.setSystemTime(new Date("2027-01-01T01:00:00Z"));
    const third = (await service.submit(actor, await submission())).savedOrder;
    expect([
      first.businessNumber,
      second.businessNumber,
      third.businessNumber,
    ]).toEqual(["SHOP-2026-0001", "EXTERNAL-2026-0002", "SHOP-2027-0003"]);
    expect(second.money.paidAmount).toBe("0.00");
    await db.businessOrderCounter.update({
      where: { id: "global" },
      data: { lastIssued: 9223372036854775807n },
    });
    const input = await submission(),
      before = await graph();
    await expect(service.submit(actor, input)).rejects.toMatchObject({
      code: "ORDER_NUMBER_UNAVAILABLE",
    });
    expect(await graph()).toEqual(before);
  } finally {
    vi.useRealTimers();
  }
});
it("permits header-only retained selections without an active catalog and rejects newly selected values or membership changes", async () => {
  const { resubmitOrderBodySchema } = await import("@template/contracts");
  const initial = await submission(),
    order = (await service.submit(actor, initial)).savedOrder;
  const { decoration: _decoration, ...piece } =
    initial.capture.pieces[0] ??
    (() => {
      throw new Error("Missing piece");
    })();
  await db.$transaction(async (tx) => {
    await tx.salesDraft.update({
      where: { id: order.id },
      data: { version: 2 },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: "RETURNED",
        currentReturnDecisionId: randomUUID(),
        currentReturnOrderVersion: 2,
        currentReturnReason: "Isolated P04 consumer fixture",
        currentReturnedAt: new Date(),
      },
    });
    await tx.catalogActivation.update({
      where: { id: "active" },
      data: { sourceId: null, activatedAt: null },
    });
  });
  const corrections = {
      deliveryDate: null,
      generalNotes: "Header only",
      responsibleSignature: null,
      repairNote: null,
      adjustmentRequested: null,
      adjustmentReason: null,
      adjustmentActionTaken: null,
      pieces: [piece],
    },
    command = { commandId: randomUUID(), expectedVersion: 2 };
  const before = await graph();
  await expect(
    service.resubmit(
      actor,
      order.id,
      resubmitOrderBodySchema.parse({
        ...command,
        corrections: { ...corrections, pieces: [{ ...piece, size: "41" }] },
      }),
    ),
  ).rejects.toMatchObject({ code: "ORDER_CATALOG_UNAVAILABLE" });
  await expect(
    service.resubmit(
      actor,
      order.id,
      resubmitOrderBodySchema.parse({
        ...command,
        corrections: {
          ...corrections,
          pieces: [{ ...piece, id: randomUUID() }],
        },
      }),
    ),
  ).rejects.toMatchObject({ code: "ORDER_CORRECTION_CONFLICT" });
  expect(await graph()).toEqual(before);
  const results = await raceBehindLock(
    (tx) =>
      tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${order.id}::uuid FOR UPDATE`,
    () => [
      service.resubmit(
        actor,
        order.id,
        resubmitOrderBodySchema.parse({ ...command, corrections }),
      ),
      competingOrders.resubmit(
        actor,
        order.id,
        resubmitOrderBodySchema.parse({
          ...command,
          commandId: randomUUID(),
          corrections,
        }),
      ),
    ],
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    results.filter((result) => result.status === "rejected"),
  ).toMatchObject([{ reason: { code: "ORDER_VERSION_CONFLICT" } }]);
  const saved = (await service.get(actor, order.id)).order;
  expect(saved.generalNotes).toBe("Header only");
  expect(saved.pieces).toEqual(order.pieces);
  expect(saved.money).toEqual(order.money);
  expect(await db.salesCommand.count({ where: { draftId: order.id } })).toBe(2);
});
it("serializes paid replacements and restores paid/root/receipt together after an injected audit failure", async () => {
  const { setOrderPaidBodySchema } = await import("@template/contracts");
  const order = (await service.submit(actor, await submission())).savedOrder;
  await db.$transaction(async (tx) => {
    await tx.salesDraft.update({
      where: { id: order.id },
      data: { version: 2 },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
  });
  const paid = (amount: string, version: number) =>
    setOrderPaidBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: version,
      paidAmount: amount,
    });
  const results = await raceBehindLock(
    (tx) =>
      tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${order.id}::uuid FOR UPDATE`,
    () => [
      service.setPaid(actor, order.id, paid("450.50", 2)),
      competingOrders.setPaid(actor, order.id, paid("700", 2)),
    ],
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    results.filter((result) => result.status === "rejected"),
  ).toMatchObject([{ reason: { code: "ORDER_VERSION_CONFLICT" } }]);
  const before = await graph();
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p03_test_reject_paid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='SET_ORDER_PAID' THEN RAISE EXCEPTION 'owned paid receipt failure'; END IF; RETURN NEW; END $$",
  );
  await db.$executeRawUnsafe(
    "CREATE TRIGGER p03_test_reject_paid BEFORE INSERT ON sales_commands FOR EACH ROW EXECUTE FUNCTION p03_test_reject_paid()",
  );
  try {
    await expect(
      service.setPaid(actor, order.id, paid("300", 3)),
    ).rejects.toThrow();
    expect(await graph()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p03_test_reject_paid ON sales_commands",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p03_test_reject_paid()");
  }
});

it("denies admin on-behalf submission and foreign piece reuse with identical missing-resource outcomes", async () => {
  const foreign = randomUUID();
  await db.user.create({
    data: {
      id: foreign,
      email: "other-admin@example.test",
      fullName: "Other admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const input = await submission(),
    foreignDraft = await drafts.create(
      foreign,
      createDraftBodySchema.parse({
        commandId: randomUUID(),
        draft: input.capture,
      }),
    ),
    before = await graph();
  await expect(
    service.submit(
      actor,
      submitOrderBodySchema.parse({
        ...input,
        origin: "draft",
        draftId: foreignDraft.savedDraft.id,
        expectedVersion: 1,
      }),
    ),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  await expect(service.submit(actor, input)).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  expect(await graph()).toEqual(before);
});
