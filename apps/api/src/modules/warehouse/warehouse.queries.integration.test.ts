import { AdministrationCommandExecutor } from "../administration/administration-command-executor.js";
import { administrationCommandBodySchema } from "@template/contracts";
import {
  approvalOrdersQuerySchema,
  approvalIssuesQuerySchema,
  reportIssueBodySchema,
} from "@template/contracts";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import {
  manufacturingOrdersQuerySchema,
  qualityOrdersQuerySchema,
} from "@template/contracts";
import { appendManufacturingOrder } from "../../test-support/manufacturing.fixture.js";
import { ManufacturingService } from "../manufacturing/manufacturing.service.js";
import { ManufacturingCommandExecutor } from "../manufacturing/manufacturing-command-executor.js";
import { QualityService } from "../quality/quality.service.js";
import {
  administrationCommandFactsSchema,
  administrationCommandDataSchema,
  salesOrderListQuerySchema,
  type AdministrationCorrectionValues,
} from "@template/contracts";
import {
  SALES_ORDER_SELECT,
  mapSalesOrder,
} from "../sales-orders/sales-orders.mapper.js";
import { loadIdentityAccount } from "../auth/account-authority.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient } from "@template/database";
import {
  qualityCommandBodySchema,
  warehouseCommandBodySchema,
  warehouseOrdersQuerySchema,
  warehousePiecesQuerySchema,
  warehouseDashboardQuerySchema,
  warehouseActivityQuerySchema,
  warehouseOrderHistoryQuerySchema,
  salesOrderTypeSchema,
  type SalesOrderType,
} from "@template/contracts";
import {
  createQualityFixture,
  appendQualityOrder,
} from "../../test-support/quality.fixture.js";
import { CustomersService } from "../customers/customers.service.js";
import { SalesCommandExecutor } from "../sales-commands/sales-command-executor.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { ApprovalService } from "../approval/approval.service.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
import { WarehouseCommandExecutor } from "./warehouse-command-executor.js";
import { WarehouseService } from "./warehouse.service.js";
import { StaffService } from "../staff/staff.service.js";
import { createP05LegacyUpgradeFixture } from "../../test-support/p05-legacy-upgrade.fixture.js";
import { createP07LegacyUpgradeFixture } from "../../test-support/p07-legacy-upgrade.fixture.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (uri === undefined || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  commands = new WarehouseCommandExecutor(db),
  service = new WarehouseService(db, commands);
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const version = async (orderId: string) =>
  (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    })
  ).version;
const acceptFixture = async (type: SalesOrderType = "SHOP") => {
  const f = await createQualityFixture(db, type),
    quality = new QualityCommandExecutor(db),
    pieceIds = f.order.pieces.map((piece) => piece.id),
    orderId = f.order.id;
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
    },
  });
  const inspected = await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          decisions: pieceIds.map((pieceId) => ({
            pieceId,
            decision: "ACCEPT",
          })),
          inspectorNote: "  Original note  ",
          packing: { cartonCount: " 2 ", cartonNumbers: " C-01/C-02 " },
        },
      ],
    }),
  });
  return { ...f, pieceIds, inspected };
};
const receive = async (actorId: string, orderId: string, pieceIds: string[]) =>
  service.execute(
    actorId,
    warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
    }),
  );

it("does not expose upstream-only orders even to ADMIN warehouse context", async () => {
  const f = await createQualityFixture(db);
  const dashboard = await service.dashboard(
    f.approvalActorId,
    warehouseDashboardQuerySchema.parse({}),
  );
  expect(
    Object.values(dashboard.counts).every(
      (count) => count.orders === 0 && count.pieces === 0,
    ),
  ).toBe(true);
  await expect(
    service.listPieces(
      f.approvalActorId,
      warehousePiecesQuerySchema.parse({
        view: "INCOMPLETE",
        orderId: f.order.id,
      }),
    ),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
});

it("keeps a 199-of-200 order incomplete at 99 percent with bounded pages and exact type filtering", async () => {
  const f = await createQualityFixture(db),
    order = await appendQualityOrder(db, f, 200),
    pieceIds = order.pieces.map((piece) => piece.id),
    orderId = order.id,
    quality = new QualityCommandExecutor(db);
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
    },
  });
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          decisions: pieceIds.map((pieceId) => ({
            pieceId,
            decision: "ACCEPT",
          })),
        },
      ],
    }),
  });
  await receive(f.approvalActorId, orderId, pieceIds.slice(0, 199));
  const grouped = await service.listOrders(
    f.approvalActorId,
    warehouseOrdersQuerySchema.parse({
      view: "INCOMPLETE",
      type: "SHOP",
      limit: 25,
    }),
  );
  expect(grouped.counts).toEqual({ orders: 1, pieces: 200 });
  expect(grouped.orders[0]).toMatchObject({
    counts: { active: 200, received: 199, completionPercent: 99 },
    allowedActions: { canDispatch: false },
  });
  const flat = await service.listPieces(
    f.approvalActorId,
    warehousePiecesQuerySchema.parse({
      view: "INCOMPLETE",
      orderId,
      limit: 100,
    }),
  );
  expect(flat.pieces).toHaveLength(100);
  expect(flat.counts).toEqual({ orders: 1, pieces: 200 });
  expect(flat.pagination).toMatchObject({
    limit: 100,
    total: 200,
    totalPages: 2,
  });
  expect(
    (
      await service.listOrders(
        f.approvalActorId,
        warehouseOrdersQuerySchema.parse({ view: "INCOMPLETE", type: "GIFT" }),
      )
    ).counts,
  ).toEqual({ orders: 0, pieces: 0 });
  expect(
    (
      await service.listOrders(
        f.approvalActorId,
        warehouseOrdersQuerySchema.parse({ view: "READY" }),
      )
    ).counts,
  ).toEqual({ orders: 0, pieces: 0 });
});

it("preserves an absent submitted address after later customer-master changes", async () => {
  const f = await createQualityFixture(db),
    customer = await db.customer.findUniqueOrThrow({
      where: { id: f.order.customerId },
    }),
    customers = new CustomersService(db, new SalesCommandExecutor(db));
  const updated = await customers.update(f.actorId, customer.id, {
    commandId: randomUUID(),
    expectedVersion: customer.version,
    patch: { address: null },
  });
  const order = await appendQualityOrder(db, f),
    orderId = order.id,
    pieceIds = order.pieces.map((piece) => piece.id),
    quality = new QualityCommandExecutor(db);
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
    },
  });
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          decisions: pieceIds.map((pieceId) => ({
            pieceId,
            decision: "ACCEPT",
          })),
        },
      ],
    }),
  });
  await customers.update(f.actorId, customer.id, {
    commandId: randomUUID(),
    expectedVersion: updated.savedCustomer.version,
    patch: {
      address: "Later unrelated master address",
      email: "private@example.test",
      notes: "Private unrelated history",
    },
  });
  const detail = await service.getOrder(f.approvalActorId, orderId);
  expect(detail.deliveryContact.address).toBeNull();
  expect(detail.qualityPackingGroups).toEqual([]);
  expect(
    detail.work.every((work) => work.acceptedHandoff?.packingGroupId === null),
  ).toBe(true);
  expect(forbiddenKeys(detail)).toEqual([]);
});

it("keeps retained cancelled companions visible while fully cancelled upstream orders remain non-deliverable", async () => {
  const f = await createQualityFixture(db),
    actor = f.approvalActorId,
    orderId = f.order.id,
    pieceIds = f.order.pieces.map((piece) => piece.id),
    quality = new QualityCommandExecutor(db),
    approval = new ApprovalService(db, new ApprovalCommandExecutor(db), null);
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "REPORT_ISSUES",
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
      reason: "Confirmed upstream cancellation",
    }),
  });
  for (const pieceId of pieceIds) {
    const issue = await db.manufacturingIssue.findFirstOrThrow({
      where: { orderId, pieceId, state: "APPROVAL_REVIEW" },
    });
    await approval.resolveIssue(actor, orderId, pieceId, issue.id, {
      commandId: randomUUID(),
      expectedVersion: await version(orderId),
      decision: "CANCEL",
      confirmed: true,
      reason: "Confirmed complete cancellation",
    });
  }
  expect(
    (await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
  ).toBe("CANCELLED");
  expect(
    (await service.dashboard(actor, warehouseDashboardQuerySchema.parse({})))
      .counts.ready,
  ).toEqual({ orders: 0, pieces: 0 });
  await expect(service.getOrder(actor, orderId)).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  await expect(
    service.execute(
      actor,
      warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "DISPATCH",
        orders: [
          { orderId, expectedVersion: await version(orderId), pieceIds },
        ],
      }),
    ),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  const other = await appendQualityOrder(db, f),
    otherIds = other.pieces.map((piece) => piece.id),
    [accepted, missing] = otherIds;
  if (!accepted || !missing)
    throw new Error("Two companion identities required");
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: other.id,
          expectedVersion: await version(other.id),
          pieceIds: [accepted],
        },
      ],
    },
  });
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: other.id,
          expectedVersion: await version(other.id),
          decisions: [{ pieceId: accepted, decision: "ACCEPT" }],
        },
      ],
    }),
  });
  await receive(actor, other.id, [accepted]);
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "REPORT_ISSUES",
      orders: [
        {
          orderId: other.id,
          expectedVersion: await version(other.id),
          pieceIds: [missing],
        },
      ],
      reason: "Missing companion cancellation",
    }),
  });
  const issue = await db.manufacturingIssue.findFirstOrThrow({
    where: { orderId: other.id, pieceId: missing, state: "APPROVAL_REVIEW" },
  });
  await approval.resolveIssue(actor, other.id, missing, issue.id, {
    commandId: randomUUID(),
    expectedVersion: await version(other.id),
    decision: "CANCEL",
    confirmed: true,
    reason: "Confirmed missing companion cancellation",
  });
  const detail = await service.getOrder(actor, other.id);
  expect(detail.summary.counts).toEqual({
    original: 2,
    cancelled: 1,
    active: 1,
    received: 1,
    completionPercent: 100,
  });
  expect(
    detail.paper.order.pieces.find((piece) => piece.id === missing),
  ).toMatchObject({
    stage: "CANCELLED",
    cancellationReason: "Confirmed missing companion cancellation",
  });
  expect(
    detail.work.find((work) => work.pieceId === missing)?.allowedActions
      .canReceive,
  ).toBe(false);
});
it("uses the same matching relation for counts, pages and header-versus-piece search through partial and final receipt", async () => {
  const f = await acceptFixture(),
    actor = f.approvalActorId,
    orderId = f.order.id,
    first = f.pieceIds[0],
    second = f.pieceIds[1];
  if (first === undefined || second === undefined)
    throw new Error("Two physical pieces required");
  const dashboard = await service.dashboard(
    actor,
    warehouseDashboardQuerySchema.parse({}),
  );
  expect(dashboard.counts).toMatchObject({
    incoming: { orders: 1, pieces: 2 },
    incomplete: { orders: 1, pieces: 2 },
    ready: { orders: 0, pieces: 0 },
  });
  const page = await service.listPieces(
    actor,
    warehousePiecesQuerySchema.parse({ view: "INCOMING", limit: 1 }),
  );
  expect(page.pieces).toHaveLength(1);
  expect(page.counts).toEqual({ orders: 1, pieces: 2 });
  expect(page.pagination).toMatchObject({
    page: 1,
    limit: 1,
    total: 2,
    totalPages: 2,
  });
  expect(page.qualityPackingGroups).toHaveLength(1);
  expect(page.qualityPackingGroups[0]).toMatchObject({
    inspectionId: f.inspected.outcome.orders[0]?.eventId,
    acceptedPieceIds: [...f.pieceIds].sort(),
    cartonCount: " 2 ",
    cartonNumbers: " C-01/C-02 ",
    inspectorNote: "  Original note  ",
    inspector: f.inspected.receipt.actor,
    packedAt: f.inspected.receipt.occurredAt,
  });
  const oneMatch = await service.listOrders(
    actor,
    warehouseOrdersQuerySchema.parse({ view: "INCOMING", search: first }),
  );
  expect(oneMatch.counts).toEqual({ orders: 1, pieces: 1 });
  expect(oneMatch.orders[0]).toMatchObject({
    matchingPieceIds: [first],
    counts: { original: 2, active: 2, received: 0 },
  });
  const headerMatch = await service.listOrders(
    actor,
    warehouseOrdersQuerySchema.parse({
      view: "INCOMING",
      search: f.order.businessNumber,
    }),
  );
  expect(headerMatch.counts).toEqual({ orders: 1, pieces: 2 });
  expect(
    (
      await service.listPieces(
        actor,
        warehousePiecesQuerySchema.parse({ view: "INCOMING", search: "%" }),
      )
    ).counts,
  ).toEqual({ orders: 0, pieces: 0 });
  await receive(actor, orderId, [first]);
  const partial = await service.listOrders(
    actor,
    warehouseOrdersQuerySchema.parse({ view: "INCOMPLETE" }),
  );
  expect(partial.counts).toEqual({ orders: 1, pieces: 2 });
  expect(partial.orders[0]?.counts).toEqual({
    original: 2,
    cancelled: 0,
    active: 2,
    received: 1,
    completionPercent: 50,
  });
  expect(
    (await service.dashboard(actor, warehouseDashboardQuerySchema.parse({})))
      .counts.incoming,
  ).toEqual({ orders: 1, pieces: 1 });
  const outOfRange = await service.listPieces(
    actor,
    warehousePiecesQuerySchema.parse({
      view: "INCOMING",
      orderId,
      page: 20,
      limit: 1,
    }),
  );
  expect(outOfRange).toMatchObject({
    department: "WAREHOUSE",
    view: "INCOMING",
    orderId,
    pieces: [],
    counts: { orders: 1, pieces: 1 },
    pagination: { page: 20, total: 1, totalPages: 1 },
    receiptGroups: [],
    qualityPackingGroups: [],
  });
  await receive(actor, orderId, [second]);
  const ready = await service.listOrders(
    actor,
    warehouseOrdersQuerySchema.parse({ view: "READY" }),
  );
  expect(ready.counts).toEqual({ orders: 1, pieces: 2 });
  expect(ready.orders[0]).toMatchObject({
    status: "READY_FOR_DELIVERY",
    allowedActions: { canDispatch: true },
    counts: { received: 2, completionPercent: 100 },
  });
  expect(
    (await service.dashboard(actor, warehouseDashboardQuerySchema.parse({})))
      .counts.incomplete,
  ).toEqual({ orders: 0, pieces: 0 });
});

const forbiddenKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(forbiddenKeys);
  if (value === null || typeof value !== "object") return [];
  const denied = new Set([
    "email",
    "passwordHash",
    "customerId",
    "unitPrice",
    "paidAmount",
    "totalAmount",
    "remainingDue",
    "surplus",
    "money",
    "beforeFacts",
    "afterFacts",
    "proposedValues",
    "contactNotes",
    "catalogSelections",
  ]);
  return Object.entries(value).flatMap(([key, nested]) => [
    ...(denied.has(key) ? [key] : []),
    ...forbiddenKeys(nested),
  ]);
};

it.each(salesOrderTypeSchema.options)(
  "reconciles actual %s warehouse counts and safely filters every reached read",
  async (type) => {
    const f = await acceptFixture(type),
      actor = f.approvalActorId;
    const dashboard = await service.dashboard(
        actor,
        warehouseDashboardQuerySchema.parse({ type }),
      ),
      grouped = await service.listOrders(
        actor,
        warehouseOrdersQuerySchema.parse({ view: "INCOMING", type }),
      ),
      flat = await service.listPieces(
        actor,
        warehousePiecesQuerySchema.parse({ view: "INCOMING", type }),
      );
    expect(dashboard.counts.incoming).toEqual({ orders: 1, pieces: 2 });
    expect(grouped.orders[0]?.type).toBe(type);
    expect(flat.counts).toEqual({ orders: 1, pieces: 2 });
    for (const data of [
      dashboard,
      grouped,
      flat,
      await service.getOrder(actor, f.order.id),
    ])
      expect(forbiddenKeys(data)).toEqual([]);
  },
);

it("uses stable tied order times and exact physical membership for pagination and retained-worker search", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f),
    orders = [f.order, other],
    quality = new QualityCommandExecutor(db);
  const groups = await Promise.all(
    orders.map(async (order) => ({
      orderId: order.id,
      expectedVersion: await version(order.id),
      pieceIds: order.pieces.map((piece) => piece.id),
    })),
  );
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: groups,
    },
  });
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: await Promise.all(
        orders.map(async (order) => ({
          orderId: order.id,
          expectedVersion: await version(order.id),
          decisions: order.pieces.map((piece) => ({
            pieceId: piece.id,
            decision: "ACCEPT",
          })),
        })),
      ),
    }),
  });
  const expected = [...orders].sort((a, b) => b.id.localeCompare(a.id)),
    pages = [];
  for (const page of [1, 2])
    pages.push(
      await service.listOrders(
        f.approvalActorId,
        warehouseOrdersQuerySchema.parse({ view: "INCOMING", limit: 1, page }),
      ),
    );
  expect(pages.map((page) => page.orders[0]?.id)).toEqual(
    expected.map((order) => order.id),
  );
  expect(pages[0]?.orders[0]?.lastActionAt).toBe(
    pages[1]?.orders[0]?.lastActionAt,
  );
  const flat = await service.listPieces(
    f.approvalActorId,
    warehousePiecesQuerySchema.parse({ view: "INCOMING", search: "Quality A" }),
  );
  expect(flat.counts).toEqual({ orders: 2, pieces: 4 });
  expect(flat.pieces.map((row) => row.piece.id)).toEqual(
    expected.flatMap((order) =>
      [...order.pieces]
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((piece) => piece.id),
    ),
  );
  expect(
    (
      await service.listPieces(
        f.approvalActorId,
        warehousePiecesQuerySchema.parse({ view: "INCOMING", search: "_" }),
      )
    ).counts,
  ).toEqual({ orders: 0, pieces: 0 });
});

it("reconciles all six queues across dispatch, full return, retry and delivery without double-counting receipts", async () => {
  const f = await acceptFixture(),
    actor = f.approvalActorId,
    orderId = f.order.id;
  await receive(actor, orderId, f.pieceIds);
  const expectQueue = async (
    key: "ready" | "outForDelivery" | "deliveryFailed" | "delivered",
    view: "READY" | "OUT_FOR_DELIVERY" | "DELIVERY_FAILED" | "DELIVERED",
  ) => {
    const dashboard = await service.dashboard(
      actor,
      warehouseDashboardQuerySchema.parse({}),
    );
    for (const [name, count] of Object.entries(dashboard.counts))
      expect(count).toEqual({
        orders: name === key ? 1 : 0,
        pieces: name === key ? 2 : 0,
      });
    expect(
      (
        await service.listPieces(
          actor,
          warehousePiecesQuerySchema.parse({ view }),
        )
      ).pieces
        .map((row) => row.piece.id)
        .sort(),
    ).toEqual([...f.pieceIds].sort());
    expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(
      2,
    );
  };
  const execute = async (operation: string, capture: object = {}) =>
    service.execute(
      actor,
      warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds: f.pieceIds,
            ...capture,
          },
        ],
      }),
    );
  await expectQueue("ready", "READY");
  const dispatched = await execute("DISPATCH"),
    firstAttempt = dispatched.outcome.orders[0]?.attemptId;
  await expectQueue("outForDelivery", "OUT_FOR_DELIVERY");
  await execute("FAIL_DELIVERY", {
    attemptId: firstAttempt,
    returnedToWarehouse: true,
    reason: "Full return acknowledged",
  });
  await expectQueue("deliveryFailed", "DELIVERY_FAILED");
  await execute("RETRY_DELIVERY", { attemptId: firstAttempt });
  await expectQueue("ready", "READY");
  const second = await execute("DISPATCH");
  await execute("CONFIRM_DELIVERY", {
    attemptId: second.outcome.orders[0]?.attemptId,
  });
  await expectQueue("delivered", "DELIVERED");
});

it("reads known legacy receipt honestly without inventing handoff, actor or arrival groups", async () => {
  const fixture = await createP05LegacyUpgradeFixture(
    "PRE_P05_DOWNSTREAM_COUNTS",
  );
  try {
    const legacy = new WarehouseService(
      fixture.database,
      new WarehouseCommandExecutor(fixture.database),
    );
    const before = await fixture.database.salesOrderPiece.findMany({
      where: { orderId: fixture.orderId },
      orderBy: { id: "asc" },
    });
    const detail = await legacy.getOrder(
      fixture.approvalActorId,
      fixture.orderId,
    );
    expect(detail.summary.counts).toEqual({
      original: 3,
      cancelled: 1,
      active: 2,
      received: 1,
      completionPercent: 50,
    });
    expect(detail.work.filter((work) => work.legacyReceipt)).toHaveLength(1);
    expect(
      detail.work.every(
        (work) =>
          work.acceptedHandoff === null &&
          work.receiptGroupId === null &&
          !work.allowedActions.canReceive,
      ),
    ).toBe(true);
    expect(detail.receiptGroups).toEqual([]);
    expect(detail.qualityPackingGroups).toEqual([]);
    expect(
      (
        await legacy.dashboard(
          fixture.approvalActorId,
          warehouseDashboardQuerySchema.parse({}),
        )
      ).counts,
    ).toMatchObject({
      incoming: { orders: 0, pieces: 0 },
      incomplete: { orders: 1, pieces: 2 },
    });
    expect(await fixture.database.warehouseCommand.count()).toBe(0);
    expect(
      await fixture.database.salesOrderPiece.findMany({
        where: { orderId: fixture.orderId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    expect(forbiddenKeys(detail)).toEqual([]);
  } finally {
    await fixture.dispose();
  }
});

it("retains exact all-cancelled legacy receipt detail without making historical receipt actionable", async () => {
  const f = await createP07LegacyUpgradeFixture("CANCELLED_RECEIPT");
  try {
    const orderId = f.orderIds[0];
    if (!orderId) throw new Error("Historical cancelled root required");
    const warehouse = new WarehouseService(
        f.database,
        new WarehouseCommandExecutor(f.database),
      ),
      before = await f.database.salesOrderPiece.findMany({
        where: { orderId },
        orderBy: { id: "asc" },
      }),
      detail = await warehouse.getOrder(f.actorId, orderId);
    expect(detail.summary).toMatchObject({
      status: "CANCELLED",
      counts: {
        original: 200,
        cancelled: 200,
        active: 0,
        received: 0,
        completionPercent: 0,
      },
      matchingPieceIds: [],
      allowedActions: {
        canDispatch: false,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: false,
      },
    });
    expect(detail.paper.order.pieces).toHaveLength(200);
    expect(
      detail.work.every(
        (work) =>
          work.legacyReceipt &&
          work.receivedAt === "2026-01-01T00:00:00.000Z" &&
          work.acceptedHandoff === null &&
          work.receiptGroupId === null &&
          !work.allowedActions.canReceive,
      ),
    ).toBe(true);
    expect(detail.receiptGroups).toEqual([]);
    expect(detail.qualityPackingGroups).toEqual([]);
    expect(detail.currentAttempt).toBeNull();
    const dashboard = await warehouse.dashboard(
      f.actorId,
      warehouseDashboardQuerySchema.parse({}),
    );
    expect(
      Object.values(dashboard.counts).every(
        (count) => count.orders === 0 && count.pieces === 0,
      ),
    ).toBe(true);
    await expect(
      warehouse.execute(
        f.actorId,
        warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "DISPATCH",
          orders: [
            {
              orderId,
              expectedVersion: detail.summary.version,
              pieceIds: detail.paper.order.pieces.map((piece) => piece.id),
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
    expect(
      await f.database.salesOrderPiece.findMany({
        where: { orderId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    expect(await f.database.warehouseCommand.count()).toBe(0);
    expect(forbiddenKeys(detail)).toEqual([]);
  } finally {
    await f.dispose();
  }
});
it("retains complete packing and minimal submitted contacts on exact detail and a second authorized actor reload", async () => {
  const f = await acceptFixture(),
    actor = f.approvalActorId,
    orderId = f.order.id;
  const before = await service.getOrder(actor, orderId);
  const submitted = await db.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { customerName: true, customerPhone: true, customerAddress: true },
  });
  expect(before.deliveryContact).toEqual({
    name: submitted.customerName,
    phone: submitted.customerPhone,
    address: submitted.customerAddress,
  });
  expect(before.qualityPackingGroups[0]).toMatchObject({
    acceptedPieceIds: [...f.pieceIds].sort(),
    inspectorNote: "  Original note  ",
    inspector: f.inspected.receipt.actor,
    packedAt: f.inspected.receipt.occurredAt,
  });
  expect(
    before.work.every(
      (work) => work.allowedActions.canReceive && work.acceptedHandoff !== null,
    ),
  ).toBe(true);
  await receive(actor, orderId, f.pieceIds);
  const staffId = randomUUID();
  await db.user.create({
    data: {
      id: staffId,
      email: staffId + "@example.test",
      fullName: "Warehouse colleague",
      passwordHash: "synthetic-only",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(db).approveStaff(actor, staffId, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "WAREHOUSE",
  });
  const after = await service.getOrder(staffId, orderId);
  expect(after.deliveryContact).toEqual(before.deliveryContact);
  expect(after.qualityPackingGroups).toEqual(before.qualityPackingGroups);
  expect(after.summary).toMatchObject({
    status: "READY_FOR_DELIVERY",
    counts: { received: 2, active: 2 },
  });
  expect(
    after.work.every(
      (work) =>
        !work.allowedActions.canReceive &&
        work.receivedAt !== null &&
        work.receiptGroupId !== null,
    ),
  ).toBe(true);
  expect(after.receiptGroups).toHaveLength(1);
  expect(forbiddenKeys(after)).toEqual([]);
  const history = await service.orderHistory(
    staffId,
    orderId,
    warehouseOrderHistoryQuerySchema.parse({
      pieceId: f.pieceIds[0],
      limit: 100,
    }),
  );
  const inspection = history.events.find(
    (item) => item.kind === "quality" && item.event.operation === "INSPECT",
  );
  expect(inspection?.event).toMatchObject({
    id: f.inspected.outcome.orders[0]?.eventId,
  });
  if (inspection?.kind !== "quality")
    throw new Error("Original grouped inspection required");
  expect(inspection.event.pieces).toHaveLength(2);
  expect(history.events.some((item) => item.kind === "warehouse")).toBe(true);
  expect(forbiddenKeys(history)).toEqual([]);
  await expect(service.getOrder(staffId, randomUUID())).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  await expect(
    service.orderHistory(
      staffId,
      orderId,
      warehouseOrderHistoryQuerySchema.parse({ pieceId: randomUUID() }),
    ),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
});

it("retains original dispatch snapshots and earlier attempts after failure, retry, redispatch and delivery", async () => {
  const f = await acceptFixture(),
    actor = f.approvalActorId,
    orderId = f.order.id;
  await receive(actor, orderId, f.pieceIds);
  const dispatch = async () =>
    service.execute(
      actor,
      warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "DISPATCH",
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds: f.pieceIds,
            deliveryNote: "Delivery note",
          },
        ],
      }),
    );
  const first = await dispatch(),
    firstAttempt = first.outcome.orders[0]?.attemptId;
  if (!firstAttempt) throw new Error("First attempt required");
  const original = await service.activity(
    actor,
    warehouseActivityQuerySchema.parse({ limit: 100 }),
  );
  const firstDispatch = original.events.find(
    (item) => item.event.commandId === first.receipt.commandId,
  );
  expect(firstDispatch?.event.attempt).toMatchObject({
    id: firstAttempt,
    status: "DISPATCHED",
    outcome: null,
    retry: null,
  });
  await service.execute(
    actor,
    warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "FAIL_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds,
          attemptId: firstAttempt,
          returnedToWarehouse: true,
          reason: "Customer unavailable",
          notes: "Entire order returned",
        },
      ],
    }),
  );
  await service.execute(
    actor,
    warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RETRY_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds,
          attemptId: firstAttempt,
          retryDate: "2026-11-15",
          notes: "Confirmed new date",
        },
      ],
    }),
  );
  const second = await dispatch(),
    secondAttempt = second.outcome.orders[0]?.attemptId;
  if (!secondAttempt) throw new Error("Second attempt required");
  await service.execute(
    actor,
    warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds,
          attemptId: secondAttempt,
          recipient: "Test Recipient",
          deliveredAt: "2026-11-13T14:30:00+02:00",
          notes: "Confirmed complete delivery",
        },
      ],
    }),
  );
  const detail = await service.getOrder(actor, orderId),
    history = await service.orderHistory(
      actor,
      orderId,
      warehouseOrderHistoryQuerySchema.parse({ limit: 100 }),
    ),
    activity = await service.activity(
      actor,
      warehouseActivityQuerySchema.parse({ limit: 100 }),
    );
  expect(detail.currentAttempt).toMatchObject({
    id: secondAttempt,
    number: 2,
    status: "DELIVERED",
    retry: null,
    outcome: {
      recipient: "Test Recipient",
      deliveredAt: "2026-11-13T12:30:00.000Z",
    },
  });
  expect(
    activity.events.find(
      (item) => item.event.commandId === first.receipt.commandId,
    ),
  ).toEqual(firstDispatch);
  const retried = history.events.find(
    (item) =>
      item.kind === "warehouse" && item.event.operation === "RETRY_DELIVERY",
  );
  expect(retried?.event).toMatchObject({
    attempt: {
      id: firstAttempt,
      status: "FAILED",
      retry: { retryDate: "2026-11-15" },
    },
    retry: { retryDate: "2026-11-15", notes: "Confirmed new date" },
  });
  expect(forbiddenKeys(detail)).toEqual([]);
  expect(forbiddenKeys(history)).toEqual([]);
});

// Retained SQL correction prerequisite; real administration executor coverage is T017.
const correctOrderProjectionFixture = async (
  f: Readonly<{ order: Readonly<{ id: string }>; approvalActorId: string }>,
  values: AdministrationCorrectionValues,
) =>
  db.$transaction(async (tx) => {
    const root = await tx.salesDraft.findUniqueOrThrow({
        where: { id: f.order.id },
        select: SALES_ORDER_SELECT,
      }),
      actor = await loadIdentityAccount(tx, f.approvalActorId),
      order = mapSalesOrder(root, actor),
      snapshot = order.customerSnapshot;
    const physical = await tx.salesOrderPiece.findMany({
      where: { orderId: order.id },
      orderBy: { id: "asc" },
    });
    const before = administrationCommandFactsSchema.parse({
      version: root.version,
      status: order.status,
      counts: order.counts,
      money: order.money,
      correction: {
        generalNotes: root.generalNotes,
        customerName: snapshot.name,
        customerPhone: snapshot.phone,
        customerEmail: snapshot.email,
        customerAddress: snapshot.address,
      },
      returnProof: null,
      pieces: physical.map((p) => ({
        id: p.id,
        stage: p.stage,
        workState: p.workState,
        issueId: p.issueId,
        currentWorkVisitId: p.currentWorkVisitId,
        receivedAt: p.receivedAt?.toISOString() ?? null,
        cancelledAt: p.cancelledAt?.toISOString() ?? null,
        cancellationReason: p.cancellationReason,
      })),
    });
    const after = administrationCommandFactsSchema.parse({
        ...before,
        version: before.version + 1,
        correction: values,
      }),
      commandId = randomUUID(),
      occurredAt = new Date(),
      reason = "Private administrative correction reason";
    const changedFields = (
      Object.keys(values) as (keyof AdministrationCorrectionValues)[]
    )
      .filter((field) => values[field] !== before.correction[field])
      .sort();
    const command = administrationCommandDataSchema.parse({
      receipt: {
        commandId,
        operation: "ADMIN_CORRECT",
        orderId: order.id,
        beforeVersion: before.version,
        afterVersion: after.version,
        actor: {
          id: actor.id,
          fullName: actor.fullName,
          role: actor.role,
          department: actor.department,
        },
        occurredAt: occurredAt.toISOString(),
      },
      replayed: false,
      before,
      after,
      result: {
        orderId: order.id,
        version: after.version,
        status: after.status,
        counts: after.counts,
        money: after.money,
        correction: values,
        pieceIds: [],
      },
    });
    await tx.administrationCommand.create({
      data: {
        commandId,
        operation: "ADMIN_CORRECT",
        actorId: actor.id,
        actorFullName: actor.fullName,
        actorRole: actor.role,
        actorDepartment: actor.department,
        orderId: order.id,
        expectedVersion: before.version,
        beforeVersion: before.version,
        afterVersion: after.version,
        payloadHash: "a".repeat(64),
        reason,
        scope: null,
        pieceIds: [],
        beforeFacts: before,
        afterFacts: after,
        outcome: command,
        occurredAt,
      },
    });
    await tx.administrationOrderCorrection.create({
      data: {
        commandId,
        orderId: order.id,
        afterVersion: after.version,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail,
        customerAddress: values.customerAddress,
        beforeValues: before.correction,
        afterValues: values,
        changedFields,
      },
    });
    await tx.salesDraft.update({
      where: { id: order.id },
      data: {
        version: after.version,
        generalNotes: values.generalNotes,
        updatedAt: occurredAt,
      },
    });
    return command;
  });
it("projects current order-only corrections through authorized sales, official/factory and warehouse reads without changing original facts", async () => {
  const f = await acceptFixture(),
    orderId = f.order.id;
  await receive(f.approvalActorId, orderId, f.pieceIds);
  const dispatched = await service.execute(
      f.approvalActorId,
      warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "DISPATCH",
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds: f.pieceIds,
          },
        ],
      }),
    ),
    attemptId = dispatched.outcome.orders[0]?.attemptId;
  if (!attemptId) throw new Error("Expected retained delivery attempt");
  const original = await db.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    }),
    customer = await db.customer.findUniqueOrThrow({
      where: { id: f.order.customerId },
    }),
    attempt = await db.warehouseDeliveryAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    }),
    sales = await db.salesCommand.findMany({
      where: { draftId: orderId },
      orderBy: { commandId: "asc" },
    });
  const values: AdministrationCorrectionValues = {
    generalNotes: "Current operational notes",
    customerName: "Current %_\\ literal name",
    customerPhone: "+966511111111",
    customerEmail: "current-private@example.test",
    customerAddress: "Current delivery building",
  };
  await correctOrderProjectionFixture(f, values);
  const current = (await f.sales.get(f.actorId, orderId)).order;
  expect(current.customerSnapshot).toEqual({
    name: values.customerName,
    phone: values.customerPhone,
    email: values.customerEmail,
    address: values.customerAddress,
  });
  expect(current.generalNotes).toBe(values.generalNotes);
  expect(
    (
      await f.sales.list(
        f.actorId,
        salesOrderListQuerySchema.parse({ search: values.customerName }),
      )
    ).totalOrders,
  ).toBe(1);
  expect(
    (
      await f.sales.list(
        f.actorId,
        salesOrderListQuerySchema.parse({ search: original.customerName }),
      )
    ).totalOrders,
  ).toBe(0);
  const official = await f.approval.officialPaper(f.approvalActorId, orderId);
  expect(official.order.customerSnapshot).toEqual(current.customerSnapshot);
  const factory = await f.approval.factoryPaper(f.approvalActorId, orderId);
  expect(factory.order.customerName).toBe(values.customerName);
  expect(factory.order.generalNotes).toBe(values.generalNotes);
  const serializedFactory = JSON.stringify(factory);
  for (const privateValue of [
    values.customerPhone,
    values.customerEmail,
    values.customerAddress,
    "Private administrative correction reason",
  ])
    if (privateValue !== null)
      expect(serializedFactory).not.toContain(privateValue);
  const warehouse = await service.getOrder(f.approvalActorId, orderId);
  expect(warehouse.deliveryContact).toEqual({
    name: values.customerName,
    phone: values.customerPhone,
    address: values.customerAddress,
  });
  expect(warehouse.summary.customerName).toBe(values.customerName);
  expect(JSON.stringify(warehouse)).not.toContain(values.customerEmail);
  const tracking = await f.sales.tracking(f.actorId, orderId);
  expect(tracking.orderVersion).toBe(current.version);
  expect(tracking.counts).toEqual(current.counts);
  expect(tracking.pieces.map((p) => p.pieceId)).toEqual(
    current.pieces.map((p) => p.id),
  );
  const cleared = {
    ...values,
    customerName: "Latest cleared name",
    customerEmail: null,
    customerAddress: null,
  };
  await correctOrderProjectionFixture(f, cleared);
  expect(
    (await f.sales.get(f.actorId, orderId)).order.customerSnapshot,
  ).toEqual({
    name: cleared.customerName,
    phone: cleared.customerPhone,
    email: null,
    address: null,
  });
  expect(
    (await service.getOrder(f.approvalActorId, orderId)).deliveryContact
      .address,
  ).toBeNull();
  expect(
    (
      await f.sales.list(
        f.actorId,
        salesOrderListQuerySchema.parse({ search: values.customerName }),
      )
    ).totalOrders,
  ).toBe(0);
  expect(
    await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } }),
  ).toEqual(original);
  expect(
    await db.customer.findUniqueOrThrow({ where: { id: f.order.customerId } }),
  ).toEqual(customer);
  expect(
    await db.warehouseDeliveryAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    }),
  ).toEqual(attempt);
  expect(
    await db.salesCommand.findMany({
      where: { draftId: orderId },
      orderBy: { commandId: "asc" },
    }),
  ).toEqual(sales);
});

it.each(["CUTTING", "QUALITY"] as const)(
  "projects effective names before filtering/paging in the current %s queue",
  async (department) => {
    const f = await acceptFixture();
    const order =
      department === "CUTTING"
        ? await appendManufacturingOrder(db, f)
        : await appendQualityOrder(db, f);
    const name = `${department} current %_\\ literal name`;
    await correctOrderProjectionFixture(
      { order, approvalActorId: f.approvalActorId },
      {
        generalNotes: "Current department notes",
        customerName: name,
        customerPhone: "+966533333333",
        customerEmail: "department-private@example.test",
        customerAddress: "Private address",
      },
    );
    const factory = await f.approval.factoryPaper(
      department === "CUTTING" ? f.cuttingA : f.qualityA,
      order.id,
    );
    expect(factory.order.customerName).toBe(name);
    expect(JSON.stringify(factory)).not.toContain(
      "department-private@example.test",
    );
    expect(JSON.stringify(factory)).not.toContain("Private address");
    const result =
      department === "CUTTING"
        ? await new ManufacturingService(
            db,
            new ManufacturingCommandExecutor(db),
          ).listOrders(
            f.cuttingA,
            "CUTTING",
            manufacturingOrdersQuerySchema.parse({
              view: "INCOMING",
              search: name,
              limit: 1,
            }),
          )
        : await new QualityService(
            db,
            new QualityCommandExecutor(db),
          ).listOrders(
            f.qualityA,
            qualityOrdersQuerySchema.parse({
              view: "INCOMING",
              search: name,
              limit: 1,
            }),
          );
    expect(result.counts).toEqual({ orders: 1, pieces: order.pieces.length });
    expect(result.pagination.total).toBe(1);
    expect(result.items[0]?.customerName).toBe(name);
    for (const value of [
      "department-private@example.test",
      "Private address",
      "Private administrative correction reason",
    ])
      expect(JSON.stringify(result)).not.toContain(value);
  },
);

it("uses current corrected names and phones before pending and held-issue approval pagination", async () => {
  const f = await createApprovalOrderFixture(db),
    approval = new ApprovalService(db, new ApprovalCommandExecutor(db), "UTC"),
    name = "Pending current %_\\ literal name";
  const values: AdministrationCorrectionValues = {
    generalNotes: "Current pending notes",
    customerName: name,
    customerPhone: "+966533333333",
    customerEmail: null,
    customerAddress: null,
  };
  await correctOrderProjectionFixture(f, values);
  const pending = await approval.listPending(
    f.approvalActorId,
    approvalOrdersQuerySchema.parse({ search: name, limit: 1 }),
  );
  expect(pending.pagination.total).toBe(1);
  expect(pending.items[0]?.customerSnapshot.name).toBe(name);
  expect(
    (
      await approval.listPending(
        f.approvalActorId,
        approvalOrdersQuerySchema.parse({ search: "0533333333" }),
      )
    ).pagination.total,
  ).toBe(1);
  expect(
    (
      await approval.listPending(
        f.approvalActorId,
        approvalOrdersQuerySchema.parse({
          search: f.order.customerSnapshot.name,
        }),
      )
    ).pagination.total,
  ).toBe(0);
  await approval.approveInitial(f.approvalActorId, f.order.id, {
    commandId: randomUUID(),
    expectedVersion: await version(f.order.id),
  });
  const pieceId = f.order.pieces[0]?.id;
  if (!pieceId) throw new Error("Expected physical identity");
  await approval.reportIssue(
    f.approvalActorId,
    f.order.id,
    pieceId,
    reportIssueBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: await version(f.order.id),
      reason: "Review retained work",
    }),
  );
  const current = { ...values, customerName: "Held current name" };
  await correctOrderProjectionFixture(f, current);
  const held = await approval.listIssues(
    f.approvalActorId,
    approvalIssuesQuerySchema.parse({ search: current.customerName, limit: 1 }),
  );
  expect(held.pagination.total).toBe(1);
  expect(held.items[0]?.order.customerSnapshot.name).toBe(current.customerName);
  expect(
    (
      await approval.listIssues(
        f.approvalActorId,
        approvalIssuesQuerySchema.parse({ search: name }),
      )
    ).pagination.total,
  ).toBe(0);
});

it("warehouse order history includes only relevant minimal administrative cancellation and preserves feed/piece scope", async () => {
  const f = await acceptFixture(),
    commands = new AdministrationCommandExecutor(db, () => new Date()),
    selected = f.order.pieces[0]?.id,
    companion = f.order.pieces[1]?.id;
  if (!selected || !companion)
    throw new Error("Two real physical identities required");
  const current = async () =>
    (
      await db.salesDraft.findUniqueOrThrow({
        where: { id: f.order.id },
        select: { version: true },
      })
    ).version;
  const accepted = await commands.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: f.order.id,
      expectedVersion: await current(),
      scope: "ITEM",
      pieceIds: [selected],
      reason: "Private cancellation explanation",
    }),
  });
  await commands.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion: await current(),
      patch: { customerName: "Private current order label" },
      reason: "Private correction explanation",
    }),
  });
  const history = (pieceId?: string) =>
    service.orderHistory(
      f.approvalActorId,
      f.order.id,
      warehouseOrderHistoryQuerySchema.parse({ pieceId, limit: 100 }),
    );
  const all = await history(),
    events = all.events.filter((item) => item.kind === "administration");
  expect(events).toHaveLength(1);
  expect(events[0]?.event).toMatchObject({
    id: accepted.receipt.commandId,
    actor: accepted.receipt.actor,
    pieceIds: [selected],
    operation: "ADMIN_CANCEL",
  });
  expect(Object.keys(events[0]?.event ?? {}).sort()).toEqual(
    [
      "id",
      "orderId",
      "orderVersion",
      "businessNumber",
      "operation",
      "actor",
      "occurredAt",
      "pieceIds",
      "beforeStatus",
      "afterStatus",
    ].sort(),
  );
  expect(
    (await history(selected)).events.filter(
      (item) => item.kind === "administration",
    ),
  ).toHaveLength(1);
  expect(
    (await history(companion)).events.filter(
      (item) => item.kind === "administration",
    ),
  ).toEqual([]);
  const ownFeed = await service.activity(
    f.approvalActorId,
    warehouseActivityQuerySchema.parse({ limit: 100 }),
  );
  expect(ownFeed.events.map((item) => item.kind)).not.toContain(
    "administration",
  );
  expect(JSON.stringify(events)).not.toContain("Private");
  await expect(history(randomUUID())).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
});
