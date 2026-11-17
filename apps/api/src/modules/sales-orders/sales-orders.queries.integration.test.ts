import {
  SALES_ORDER_FINANCIAL_SELECT,
  mapSalesOrder,
  mapSalesOrderSummary,
} from "./sales-orders.mapper.js";
import { loadIdentityAccount } from "../auth/account-authority.js";
import { ManufacturingCommandExecutor } from "../manufacturing/manufacturing-command-executor.js";
import { createP05LegacyUpgradeFixture } from "../../test-support/p05-legacy-upgrade.fixture.js";
import { ApprovalService } from "../approval/approval.service.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
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
const approvalFixture = () =>
  new ApprovalService(db, new ApprovalCommandExecutor(db), "UTC");
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
  const legacy = await createP05LegacyUpgradeFixture(
    "PRE_P05_DOWNSTREAM_COUNTS",
  );
  try {
    const ownService = new SalesOrdersService(
      legacy.database,
      new SalesCommandExecutor(legacy.database),
      "UTC",
    );
    expect(
      salesOrderTrackingDataSchema.parse(
        await ownService.tracking(legacy.ownerId, legacy.orderId),
      ).counts,
    ).toEqual({
      original: 3,
      cancelled: 1,
      active: 2,
      received: 1,
      completionPercent: 50,
    });
    const root = await legacy.database.salesDraft.findUniqueOrThrow({
      where: { id: legacy.orderId },
      select: SALES_ORDER_SELECT,
    });
    const factory = factoryOrderSchema.parse(mapFactoryOrder(root));
    expect(factory.pieces).toHaveLength(3);
    expect(JSON.stringify(factory)).not.toMatch(
      /unitPrice|money|paidAmount|remainingDue|surplus|catalogSourceId|decorationEntryId|customerPhone|customerEmail|customerAddress|responsibleSignature/u,
    );
    if (root.customerId === null) throw new Error("Legacy customer required");
    expect(
      (
        await ownService.customerMeasurements(
          legacy.ownerId,
          root.customerId,
          customerOrderMeasurementsQuerySchema.parse({}),
        )
      ).measurements.filter((piece) => piece.cancelled),
    ).toHaveLength(1);
  } finally {
    await legacy.dispose();
  }
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
  await approvalFixture().returnInitial(admin, order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Isolated P04 proof",
    notes: null,
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
  const order = (await submit(a)).savedOrder;
  // A real P04 return supplies the canonical reason and actual decision instant.
  const returnedDecision = await approvalFixture().returnInitial(
    admin,
    order.id,
    {
      commandId: randomUUID(),
      expectedVersion: 1,
      reason: "Correct size without repricing",
      notes: null,
    },
  );
  const returnedAt = new Date(returnedDecision.receipt.occurredAt);
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

it("exposes each batch order event once under existing owner scope without creating a financial revision", async () => {
  const orders = [(await submit(a)).savedOrder, (await submit(a)).savedOrder];
  for (const order of orders)
    await approvalFixture().approveInitial(admin, order.id, {
      commandId: randomUUID(),
      expectedVersion: 1,
    });
  const headers = await db.salesOrder.findMany({
    where: { id: { in: orders.map((o) => o.id) } },
    orderBy: { id: "asc" },
  });
  const accepted = await new ManufacturingCommandExecutor(db).execute({
    actorId: admin,
    department: "CUTTING",
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: orders.map((o) => ({
        orderId: o.id,
        expectedVersion: 2,
        pieceIds: o.pieces.map((p) => p.id),
      })),
    },
  });
  const history = salesOrderActivityDataSchema.parse(
      await service.activity(a, { page: 1, limit: 100 }),
    ),
    events = history.events.filter((item) => item.kind === "manufacturing");
  expect(events).toHaveLength(2);
  expect(new Set(events.map((item) => item.event.id)).size).toBe(2);
  expect(events.map((item) => item.event.commandId)).toEqual([
    accepted.receipt.commandId,
    accepted.receipt.commandId,
  ]);
  expect(events.map((item) => item.event.orderId).sort()).toEqual(
    orders.map((o) => o.id).sort(),
  );
  expect(
    (await service.activity(b, { page: 1, limit: 100 })).events.filter(
      (item) => item.kind === "manufacturing",
    ),
  ).toEqual([]);
  for (const item of events)
    await expect(
      service.revision(a, item.event.orderId, item.event.id),
    ).rejects.toMatchObject({ code: "ORDER_REVISION_NOT_FOUND" });
  expect(
    await db.salesOrder.findMany({
      where: { id: { in: orders.map((o) => o.id) } },
      orderBy: { id: "asc" },
    }),
  ).toEqual(headers);
});

it("maps a minimal financial header summary identically to full detail without loading specifications", async () => {
  const saved = await submit(a, 2);
  const full = await db.salesDraft.findUniqueOrThrow({
    where: { id: saved.savedOrder.id },
    select: SALES_ORDER_SELECT,
  });
  const minimal = await db.salesDraft.findUniqueOrThrow({
    where: { id: full.id },
    select: {
      ...SALES_ORDER_SELECT,
      pieces: SALES_ORDER_FINANCIAL_SELECT.pieces,
    },
  });
  const actor = await loadIdentityAccount(db, a);
  expect(mapSalesOrderSummary(minimal, actor)).toEqual(
    mapSalesOrderSummary(full, actor),
  );
  expect(mapSalesOrder(full, actor).pieces).toHaveLength(2);
  expect(minimal.pieces[0]).not.toHaveProperty("model");
});
