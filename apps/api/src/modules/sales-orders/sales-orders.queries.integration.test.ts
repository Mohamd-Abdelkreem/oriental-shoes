import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, it, expect } from "vitest";
import {
  submitOrderBodySchema,
  salesOrderListQuerySchema,
  salesOrderListDataSchema,
  salesDashboardDataSchema,
  salesOrderEditorDataSchema,
  salesOrderTrackingDataSchema,
  salesOrderActivityDataSchema,
  customerOrdersQuerySchema,
  customerOrdersDataSchema,
  customerOrderMeasurementsQuerySchema,
  customerOrderMeasurementsDataSchema,
  createDraftBodySchema,
  factoryOrderSchema,
} from "@template/contracts";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { syntheticCatalogPreview } from "../../test-support/reviewed-catalog.fixture.js";
import { CatalogLoaderService } from "../catalogs/catalog-loader.service.js";
import { CatalogsService } from "../catalogs/catalogs.service.js";
import { SalesCommandExecutor } from "../sales-commands/sales-command-executor.js";
import { SalesDraftsService } from "../sales-drafts/sales-drafts.service.js";
import { SalesOrdersService } from "./sales-orders.service.js";
import { readCurrentOrderReturnProof } from "./sales-orders.queries.js";
import { SALES_ORDER_SELECT, mapFactoryOrder } from "./sales-orders.mapper.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const db = createDatabaseClient(uri),
  executor = new SalesCommandExecutor(db),
  service = new SalesOrdersService(db, executor, "UTC"),
  drafts = new SalesDraftsService(db, executor),
  catalogs = new CatalogsService(db);
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID(),
  customerId = randomUUID();
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
  const now = new Date();
  await db.user.create({
    data: {
      id: admin,
      email: "query-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const id of [a, b])
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        fullName: id,
        passwordHash: "synthetic",
        department: "SALES",
        status: "ACTIVE",
        emailVerifiedAt: now,
        staffApprovedAt: now,
        staffApprovedById: admin,
      },
    });
  await db.customer.create({
    data: {
      id: customerId,
      name: "Shared contact",
      phone: "+966501234567",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
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
const submit = async (actorId: string, count = 1) => {
  const pieces = Array.from({ length: count }, () => ({
      id: randomUUID(),
      model: "SM",
      size: "40",
      leatherBase: "synthetic I3",
      decoration: "زبيري - z",
      face: "standard",
    })),
    quote = await catalogs.quote(actorId, { requestId: randomUUID(), pieces });
  if (quote.availability !== "available") throw new Error("Missing quote");
  return service.submit(
    actorId,
    submitOrderBodySchema.parse({
      origin: "new",
      commandId: randomUUID(),
      expectedCustomerVersion: 1,
      capture: { type: "SHOP", customerId, pieces },
      reviewedQuote: {
        sourceId: quote.sourceId,
        fingerprint: quote.fingerprint,
      },
    }),
  );
};
it("keeps shared-customer rows, counts, history and measurements owner-scoped with one tagged editor", async () => {
  const own = await submit(a),
    foreign = await submit(b);
  const draft = await drafts.create(
    a,
    createDraftBodySchema.parse({
      commandId: randomUUID(),
      draft: {
        type: "REPAIR",
        customerId,
        pieces: [{ id: randomUUID(), size: "41" }],
      },
    }),
  );
  const all = salesOrderListDataSchema.parse(
    await service.list(a, salesOrderListQuerySchema.parse({ limit: 1 })),
  );
  expect(all).toMatchObject({
    totalOrders: 2,
    totalPieces: 2,
    pagination: { total: 2 },
    statusCounts: { DRAFT: 1, AWAITING_APPROVAL: 1, APPROVED: 0 },
  });
  expect(all.items).toHaveLength(1);
  expect(
    (await service.list(admin, salesOrderListQuerySchema.parse({})))
      .totalOrders,
  ).toBe(3);
  for (const search of [
    own.savedOrder.id,
    own.savedOrder.businessNumber,
    "Shared contact",
    "0501234567",
    "SM",
  ])
    expect(
      (
        await service.list(a, salesOrderListQuerySchema.parse({ search }))
      ).items.some(
        (item) =>
          item.kind === "submitted" && item.order.id === own.savedOrder.id,
      ),
    ).toBe(true);
  expect(
    (await service.list(a, salesOrderListQuerySchema.parse({ search: "%" })))
      .items,
  ).toEqual([]);
  const filtered = await service.list(
    a,
    salesOrderListQuerySchema.parse({ status: "DRAFT", page: 99 }),
  );
  expect(filtered.items).toEqual([]);
  expect(filtered.pagination.total).toBe(1);
  expect(filtered.totalOrders).toBe(2);
  expect(
    salesDashboardDataSchema.parse(await service.dashboard(a)).counts,
  ).toMatchObject({
    drafts: 1,
    draftPieces: 1,
    awaitingApproval: 1,
    totalOrders: 2,
  });
  expect(
    salesOrderEditorDataSchema.parse(
      await service.editor(a, draft.savedDraft.id),
    ).kind,
  ).toBe("draft");
  expect(
    salesOrderEditorDataSchema.parse(await service.editor(a, own.savedOrder.id))
      .kind,
  ).toBe("submitted");
  await expect(service.editor(a, foreign.savedOrder.id)).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  await expect(service.get(a, foreign.savedOrder.id)).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  expect(
    customerOrdersDataSchema
      .parse(
        await service.customerOrders(
          a,
          customerId,
          customerOrdersQuerySchema.parse({}),
        ),
      )
      .orders.map((order) => order.id),
  ).toEqual([own.savedOrder.id]);
  expect(
    customerOrderMeasurementsDataSchema.parse(
      await service.customerMeasurements(
        a,
        customerId,
        customerOrderMeasurementsQuerySchema.parse({}),
      ),
    ).measurements,
  ).toMatchObject([
    {
      source: "SUBMITTED",
      orderId: own.savedOrder.id,
      size: "40",
      cancelled: false,
    },
  ]);
  const activity = salesOrderActivityDataSchema.parse(
    await service.activity(a, { page: 1, limit: 25 }),
  );
  expect(activity.events).toHaveLength(2);
  expect(JSON.stringify(activity)).not.toMatch(/"before"|"after"|"pieces":/u);
  const revision = await service.revision(
    a,
    own.savedOrder.id,
    own.receipt.commandId,
  );
  expect(revision.before).toBeNull();
  expect(revision.after).toEqual(own.savedOrder);
  await expect(
    service.revision(a, own.savedOrder.id, foreign.receipt.commandId),
  ).rejects.toMatchObject({ code: "ORDER_REVISION_NOT_FOUND" });
  await expect(
    service.revision(a, foreign.savedOrder.id, foreign.receipt.commandId),
  ).rejects.toMatchObject({ code: "ORDER_REVISION_NOT_FOUND" });
});
it("derives physical receipt and cancellation counts and publishes a strict factory allowlist", async () => {
  const order = (await submit(a, 3)).savedOrder,
    ids = order.pieces.map((piece) => piece.id);
  const [received, cancelled] = ids;
  if (!received || !cancelled) throw new Error("Missing pieces");
  // Labelled downstream consumer fixture; no manufacturing or cancellation API is implemented here.
  await db.$transaction(async (tx) => {
    await tx.salesOrderPiece.update({
      where: { id: received },
      data: { stage: "WAREHOUSE", receivedAt: new Date() },
    });
    await tx.salesOrderPiece.update({
      where: { id: cancelled },
      data: {
        stage: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: "Isolated consumer fixture",
      },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { totalAmount: "3600.00" },
    });
  });
  expect(
    salesOrderTrackingDataSchema.parse(await service.tracking(a, order.id))
      .counts,
  ).toEqual({
    original: 3,
    cancelled: 1,
    active: 2,
    received: 1,
    completionPercent: 50,
  });
  const root = await db.salesDraft.findUniqueOrThrow({
    where: { id: order.id },
    select: SALES_ORDER_SELECT,
  });
  const factory = factoryOrderSchema.parse(mapFactoryOrder(root));
  expect(factory.pieces).toHaveLength(3);
  expect(JSON.stringify(factory)).not.toMatch(
    /unitPrice|money|paidAmount|remainingDue|surplus|catalogSourceId|decorationEntryId|customerPhone|customerEmail|customerAddress|responsibleSignature/u,
  );
  expect(
    (
      await service.customerMeasurements(
        a,
        customerId,
        customerOrderMeasurementsQuerySchema.parse({}),
      )
    ).measurements.filter((piece) => piece.cancelled),
  ).toHaveLength(1);
});
it("reads only complete current P04-shaped proof and SQL rejects incomplete or stale canonical fields", async () => {
  const order = (await submit(a)).savedOrder;
  expect(
    await db.$transaction((tx) => readCurrentOrderReturnProof(tx, order.id)),
  ).toBeNull();
  expect(
    await db.$transaction((tx) =>
      readCurrentOrderReturnProof(tx, randomUUID()),
    ),
  ).toBeNull();
  for (const data of [
    { status: "RETURNED" as const },
    {
      status: "RETURNED" as const,
      currentReturnDecisionId: randomUUID(),
      currentReturnOrderVersion: 99,
      currentReturnReason: "stale",
      currentReturnedAt: new Date(),
    },
  ])
    await expect(
      db.salesOrder.update({ where: { id: order.id }, data }),
    ).rejects.toThrow();
  expect((await service.get(a, order.id)).order).toEqual(order);
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
        currentReturnReason: "Isolated P04 proof",
        currentReturnedAt: new Date(),
      },
    });
  });
  expect(
    await db.$transaction((tx) => readCurrentOrderReturnProof(tx, order.id)),
  ).toMatchObject({
    orderId: order.id,
    orderVersion: 2,
    reason: "Isolated P04 proof",
  });
});
it("returns bounded summaries and a single lazy maximum-size revision without snapshot payloads on the page", async () => {
  const result = await submit(a, 200),
    activity = await service.activity(a, { page: 1, limit: 25 });
  expect(activity.events).toHaveLength(1);
  const event = activity.events[0];
  if (event?.kind !== "order") throw new Error("Missing order event");
  expect(event.event.pieceIds).toHaveLength(200);
  expect(Object.keys(event.event)).not.toContain("after");
  expect(
    (await service.revision(a, result.savedOrder.id, result.receipt.commandId))
      .after.pieces,
  ).toHaveLength(200);
  expect(
    (await service.list(a, salesOrderListQuerySchema.parse({}))).totalPieces,
  ).toBe(200);
});

it("projects canonical return reason/time in scoped list/dashboard/customer summaries without extra authority", async () => {
  const order = (await submit(a)).savedOrder,
    returnedAt = new Date("2026-11-06T10:00:00.000Z");
  // Isolated downstream consumer state; no production P04 return writer is invoked.
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
        currentReturnReason: "Correct size without repricing",
        currentReturnedAt: returnedAt,
      },
    });
  });
  const list = await service.list(
      a,
      salesOrderListQuerySchema.parse({ status: "RETURNED" }),
    ),
    row = list.items[0];
  expect(row).toMatchObject({
    kind: "submitted",
    order: {
      returnInfo: {
        reason: "Correct size without repricing",
        returnedAt: returnedAt.toISOString(),
      },
    },
  });
  expect((await service.dashboard(a)).recentOrders[0]).toMatchObject(row ?? {});
  expect(
    (
      await service.customerOrders(
        a,
        customerId,
        customerOrdersQuerySchema.parse({ status: "RETURNED" }),
      )
    ).orders[0]?.returnInfo,
  ).toEqual({
    reason: "Correct size without repricing",
    returnedAt: returnedAt.toISOString(),
  });
  expect(
    (
      await service.list(
        b,
        salesOrderListQuerySchema.parse({ status: "RETURNED" }),
      )
    ).items,
  ).toEqual([]);
  expect(
    (
      await service.list(
        admin,
        salesOrderListQuerySchema.parse({ status: "RETURNED" }),
      )
    ).items,
  ).toHaveLength(1);
  if (row?.kind !== "submitted") throw new Error("Expected returned summary");
  expect(Object.keys(row.order.returnInfo ?? {})).toEqual([
    "reason",
    "returnedAt",
  ]);
});
