import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient, type Prisma } from "@template/database";
import {
  qualityCommandBodySchema,
  warehouseCommandBodySchema,
  reportIssueBodySchema,
} from "@template/contracts";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { appendManufacturingOrder } from "../../test-support/manufacturing.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { ManufacturingCommandExecutor } from "../manufacturing/manufacturing-command-executor.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
import { WarehouseCommandExecutor } from "./warehouse-command-executor.js";
import { WarehouseService } from "./warehouse.service.js";
import { createP07LegacyUpgradeFixture } from "../../test-support/p07-legacy-upgrade.fixture.js";
import { SalesOrdersService } from "../sales-orders/sales-orders.service.js";
import {
  SalesCommandExecutor,
  hashSalesCommandIntent,
} from "../sales-commands/sales-command-executor.js";
import { SalesCommandsService } from "../sales-commands/sales-commands.service.js";
import {
  SALES_ORDER_SELECT,
  mapSalesOrder,
} from "../sales-orders/sales-orders.mapper.js";
import { loadIdentityAccount } from "../auth/account-authority.js";
import {
  ApprovalCommandExecutor,
  hashApprovalCommandIntent,
} from "../approval/approval-command-executor.js";
import { ApprovalService } from "../approval/approval.service.js";
import {
  APPROVAL_FACTS_ORDER_SELECT,
  CURRENT_ISSUE_SELECT,
  mapApprovalFacts,
} from "../approval/approval.mapper.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (uri === undefined || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  commands = new WarehouseCommandExecutor(db);
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
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Owned fixture value required");
  return value;
};
const incomingFixture = async () => {
  const f = await createQualityFixture(db),
    order = await appendManufacturingOrder(db, f, 3),
    ids = order.pieces.map((piece) => piece.id),
    selected = ids.slice(0, 2);
  const manufacturing = new ManufacturingCommandExecutor(db),
    quality = new QualityCommandExecutor(db);
  for (const [department, operation, actorId, pieceIds] of [
    ["CUTTING", "RECEIVE_AND_START", f.cuttingA, ids],
    ["CUTTING", "COMPLETE_TRANSFER", f.cuttingA, ids],
    ["PRODUCTION", "RECEIVE_AND_START", f.productionA, ids],
    ["PRODUCTION", "COMPLETE_TRANSFER", f.productionA, selected],
  ] as const)
    await manufacturing.execute({
      actorId,
      department,
      body: {
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId: order.id,
            expectedVersion: await version(order.id),
            pieceIds: [...pieceIds],
          },
        ],
      },
    });
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: order.id,
          expectedVersion: await version(order.id),
          pieceIds: selected,
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
          orderId: order.id,
          expectedVersion: await version(order.id),
          decisions: selected.map((pieceId) => ({
            pieceId,
            decision: "ACCEPT",
          })),
          inspectorNote: "Original quality note",
          packing: { cartonCount: " 2 ", cartonNumbers: "C-01/C-02" },
        },
      ],
    }),
  });
  return { ...f, order, ids, selected, manufacturing, quality };
};
const graph = async (orderId: string) => ({
  root: await db.salesDraft.findUniqueOrThrow({ where: { id: orderId } }),
  header: await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } }),
  physical: await db.salesOrderPiece.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  }),
  capture: await db.salesDraftPiece.findMany({
    where: { draftId: orderId },
    orderBy: { id: "asc" },
  }),
  quality: await db.qualityCommandOrder.findMany({
    where: { orderId },
    orderBy: { afterVersion: "asc" },
  }),
  packing: await db.qualityPackingGroup.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  }),
  commands: await db.warehouseCommand.findMany({
    where: { orders: { some: { orderId } } },
    orderBy: { commandId: "asc" },
  }),
  groups: await db.warehouseReceiptGroup.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  }),
  receipts: await db.warehouseReceiptPiece.findMany({
    where: { orderId },
    orderBy: { pieceId: "asc" },
  }),
});
it("records separate exact arrivals without changing original packing, upstream work or frozen terms, then makes the final receipt ready", async () => {
  const f = await incomingFixture(),
    orderId = f.order.id,
    first = required(f.ids[0]),
    second = required(f.ids[1]),
    third = required(f.ids[2]);
  const before = await graph(orderId);
  const body = warehouseCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "RECEIVE",
    orders: [
      {
        orderId,
        expectedVersion: before.root.version,
        pieceIds: [first],
        receipt: {
          cartonCount: " 2 ",
          storageLocation: "Shelf B-12",
          notes: "Keep dry",
        },
      },
    ],
  });
  if (body.operation !== "RECEIVE") throw new Error("Receipt capture required");
  const result = await commands.execute({ actorId: f.approvalActorId, body }),
    after = await graph(orderId);
  expect(result.outcome.orders[0]).toMatchObject({
    status: "APPROVED",
    beforeVersion: before.root.version,
    afterVersion: before.root.version + 1,
    pieceIds: [first],
  });
  expect(after.receipts).toHaveLength(1);
  expect(after.groups).toHaveLength(1);
  expect(after.groups[0]).toMatchObject({
    cartonCount: " 2 ",
    storageLocation: "Shelf B-12",
    notes: "Keep dry",
  });
  expect(after.physical.filter((piece) => piece.id !== first)).toEqual(
    before.physical.filter((piece) => piece.id !== first),
  );
  expect(after.header).toEqual(before.header);
  expect(after.capture).toEqual(before.capture);
  expect(after.quality).toEqual(before.quality);
  expect(after.packing).toEqual(before.packing);
  expect(await commands.execute({ actorId: f.approvalActorId, body })).toEqual({
    ...result,
    replayed: true,
  });
  expect(await graph(orderId)).toEqual(after);
  await expect(
    commands.execute({
      actorId: f.approvalActorId,
      body: {
        ...body,
        commandId: randomUUID(),
        orders: body.orders.map((group) => ({
          ...group,
          expectedVersion: after.root.version,
        })),
      },
    }),
  ).rejects.toMatchObject({ code: "WAREHOUSE_SELECTION_CONFLICT" });
  expect(await graph(orderId)).toEqual(after);
  await commands.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        { orderId, expectedVersion: after.root.version, pieceIds: [second] },
      ],
    }),
  });
  const secondArrival = await graph(orderId);
  expect(secondArrival.receipts).toHaveLength(2);
  expect(secondArrival.groups).toContainEqual(after.groups[0]);
  expect(
    secondArrival.groups.find((group) => group.id !== after.groups[0]?.id),
  ).toMatchObject({ cartonCount: null, storageLocation: null, notes: null });
  expect(secondArrival.header.status).toBe("APPROVED");
  await f.manufacturing.execute({
    actorId: f.productionA,
    department: "PRODUCTION",
    body: {
      commandId: randomUUID(),
      operation: "COMPLETE_TRANSFER",
      orders: [
        { orderId, expectedVersion: await version(orderId), pieceIds: [third] },
      ],
    },
  });
  await f.quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        { orderId, expectedVersion: await version(orderId), pieceIds: [third] },
      ],
    },
  });
  await f.quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          decisions: [{ pieceId: third, decision: "ACCEPT" }],
        },
      ],
    }),
  });
  await commands.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        { orderId, expectedVersion: await version(orderId), pieceIds: [third] },
      ],
    }),
  });
  const final = await graph(orderId);
  expect(final.header.status).toBe("READY_FOR_DELIVERY");
  expect(final.receipts).toHaveLength(3);
  expect(
    final.physical.every(
      (piece) =>
        piece.stage === "WAREHOUSE" &&
        piece.workState === "COMPLETED" &&
        piece.receivedAt !== null,
    ),
  ).toBe(true);
  expect(final.header.paidAmount).toEqual(before.header.paidAmount);
  expect(final.capture).toEqual(before.capture);
  expect(final.groups).toEqual(expect.arrayContaining(secondArrival.groups));
});

it("rejects an ineligible upstream companion atomically before any receipt is saved", async () => {
  const f = await incomingFixture(),
    orderId = f.order.id,
    before = await graph(orderId);
  await expect(
    commands.execute({
      actorId: f.approvalActorId,
      body: warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "RECEIVE",
        orders: [
          {
            orderId,
            expectedVersion: before.root.version,
            pieceIds: [required(f.ids[0]), required(f.ids[2])],
          },
        ],
      }),
    }),
  ).rejects.toMatchObject({ code: "WAREHOUSE_SELECTION_CONFLICT" });
  expect(await graph(orderId)).toEqual(before);
});

it("recovers old rounded100 sales/P04 JSON unchanged while current reads/new facts use99 and final cancellation makes the received remainder ready", async () => {
  const paidInput = {
      commandId: randomUUID(),
      expectedVersion: 1,
      paidAmount: "360000.00",
    },
    reportInput = reportIssueBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 2,
      reason: "Legacy missing-piece report",
      notes: null,
    }),
    issueId = randomUUID();
  let originalSales: unknown,
    originalApproval: unknown,
    pieceId = "",
    orderId = "";
  const fixture = await createP07LegacyUpgradeFixture(
    "RETAINED_COUNTS",
    async (context) => {
      const database = context.database;
      // This fixture intentionally runs against immutable pre-P08 storage.
      const historicalSalesOrder = async (
        tx: Prisma.TransactionClient,
        actor: Parameters<typeof mapSalesOrder>[1],
      ) => {
        const record = await tx.salesDraft.findUniqueOrThrow({
          where: { id: orderId },
          select: {
            ...SALES_ORDER_SELECT,
            order: {
              select: {
                ...SALES_ORDER_SELECT.order.select,
                administrationCorrections: false,
              },
            },
          },
        });
        return mapSalesOrder(
          {
            ...record,
            order:
              record.order === null
                ? null
                : {
                    ...record.order,
                    administrationCorrections: [],
                  },
          },
          actor,
        );
      };
      const rootId = context.orderIds[0];
      if (!rootId) throw new Error("Historical root required");
      orderId = rootId;
      const last = await database.salesDraftPiece.findFirstOrThrow({
        where: { draftId: orderId, position: 200 },
        select: { id: true },
      });
      pieceId = last.id;
      await database.$transaction(async (tx) => {
        const actor = await loadIdentityAccount(tx, context.actorId),
          before = await historicalSalesOrder(tx, actor),
          occurredAt = new Date("2026-01-02T00:00:00Z");
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { paidAmount: paidInput.paidAmount },
        });
        await tx.salesDraft.update({
          where: { id: orderId },
          data: { version: 2, updatedAt: occurredAt },
        });
        const after = await historicalSalesOrder(tx, actor);
        originalSales = await tx.salesCommand.create({
          data: {
            commandId: paidInput.commandId,
            operation: "SET_ORDER_PAID",
            actorId: actor.id,
            actorFullName: actor.fullName,
            actorRole: actor.role,
            actorDepartment: actor.department,
            requestTargetId: orderId,
            draftId: orderId,
            customerId: null,
            expectedVersion: 1,
            beforeVersion: 1,
            afterVersion: 2,
            payloadHash: hashSalesCommandIntent({
              operation: "SET_ORDER_PAID",
              targetId: orderId,
              expectedVersion: 1,
              payload: paidInput,
            }),
            occurredAt,
            before: {
              ...before,
              counts: { ...before.counts, completionPercent: 100 },
            },
            after: {
              ...after,
              counts: { ...after.counts, completionPercent: 100 },
            },
          },
        });
      });
      await database.$transaction(async (tx) => {
        const actor = await loadIdentityAccount(tx, context.actorId),
          root = await tx.salesDraft.findUniqueOrThrow({
            where: { id: orderId },
            select: APPROVAL_FACTS_ORDER_SELECT,
          }),
          before = mapApprovalFacts(root, actor, {
            pieceId,
            issue: null,
            returnNotes: null,
          }),
          occurredAt = new Date("2026-01-03T00:00:00Z");
        await tx.manufacturingIssue.create({
          data: {
            id: issueId,
            orderId,
            pieceId,
            cycle: 1,
            state: "APPROVAL_REVIEW",
            sourceDepartment: "CUTTING",
            sourceStage: "CUTTING",
            sourceWorkState: "INCOMING",
            reporterId: actor.id,
            reporterFullName: actor.fullName,
            reporterRole: actor.role,
            reporterDepartment: actor.department,
            reason: reportInput.reason,
            notes: null,
            reportedAt: occurredAt,
            updatedAt: occurredAt,
            reportedCommandId: reportInput.commandId,
          },
          select: { id: true },
        });
        await tx.salesOrderPiece.update({
          where: { id: pieceId },
          data: { workState: "BLOCKED", issueId },
          select: { id: true },
        });
        await tx.salesDraft.update({
          where: { id: orderId },
          data: { version: 3, updatedAt: occurredAt },
        });
        const current = await tx.manufacturingIssue.findUniqueOrThrow({
            where: { id: issueId },
            select: CURRENT_ISSUE_SELECT,
          }),
          afterRoot = await tx.salesDraft.findUniqueOrThrow({
            where: { id: orderId },
            select: APPROVAL_FACTS_ORDER_SELECT,
          }),
          after = mapApprovalFacts(afterRoot, actor, {
            pieceId,
            issue: current,
            returnNotes: null,
          });
        originalApproval = await tx.approvalCommand.create({
          data: {
            commandId: reportInput.commandId,
            operation: "REPORT_ISSUE",
            actorId: actor.id,
            actorFullName: actor.fullName,
            actorRole: actor.role,
            actorDepartment: actor.department,
            orderId,
            pieceId,
            issueId,
            expectedVersion: 2,
            beforeVersion: 2,
            afterVersion: 3,
            payloadHash: hashApprovalCommandIntent({
              operation: "REPORT_ISSUE",
              orderId,
              pieceId,
              expectedVersion: 2,
              payload: reportInput,
            }),
            decision: null,
            decisionNotes: null,
            occurredAt,
            beforeFacts: {
              ...before,
              counts: { ...before.counts, completionPercent: 100 },
            },
            afterFacts: {
              ...after,
              counts: { ...after.counts, completionPercent: 100 },
            },
            outcome: {
              orderId,
              orderVersion: 3,
              orderStatus: "APPROVED",
              pieceId,
              pieceStage: "CUTTING",
              pieceWorkState: "BLOCKED",
              issueId,
              issueState: "APPROVAL_REVIEW",
              proposalId: null,
            },
          },
        });
      });
    },
  );
  try {
    const database = fixture.database,
      sales = new SalesOrdersService(
        database,
        new SalesCommandExecutor(database),
        "UTC",
      ),
      approval = new ApprovalService(
        database,
        new ApprovalCommandExecutor(database),
        null,
      ),
      warehouse = new WarehouseService(
        database,
        new WarehouseCommandExecutor(database),
      );
    const recovered = await new SalesCommandsService(database).get(
      fixture.actorId,
      paidInput.commandId,
    );
    if (recovered.kind !== "order")
      throw new Error("Historical order result required");
    expect(recovered.savedOrder.counts.completionPercent).toBe(100);
    expect(await sales.setPaid(fixture.actorId, orderId, paidInput)).toEqual(
      recovered,
    );
    const revision = await sales.revision(
      fixture.actorId,
      orderId,
      paidInput.commandId,
    );
    expect(revision.after.counts.completionPercent).toBe(100);
    expect(
      (await approval.event(fixture.actorId, orderId, reportInput.commandId))
        .after.counts.completionPercent,
    ).toBe(100);
    expect(
      (
        await approval.reportIssue(
          fixture.actorId,
          orderId,
          pieceId,
          reportInput,
        )
      ).replayed,
    ).toBe(true);
    expect(
      (await warehouse.getOrder(fixture.actorId, orderId)).summary.counts,
    ).toEqual({
      original: 200,
      cancelled: 0,
      active: 200,
      received: 199,
      completionPercent: 99,
    });
    expect(
      (await approval.factoryPaper(fixture.actorId, orderId)).order.counts
        .completionPercent,
    ).toBe(99);
    const paid = await sales.setPaid(fixture.actorId, orderId, {
      commandId: randomUUID(),
      expectedVersion: 3,
      paidAmount: "360001.00",
    });
    expect(paid.savedOrder.counts.completionPercent).toBe(99);
    await approval.resolveIssue(fixture.actorId, orderId, pieceId, issueId, {
      commandId: randomUUID(),
      expectedVersion: 4,
      decision: "CANCEL",
      confirmed: true,
      reason: "Confirmed final missing-piece cancellation",
    });
    const detail = await warehouse.getOrder(fixture.actorId, orderId);
    expect(detail.summary).toMatchObject({
      status: "READY_FOR_DELIVERY",
      counts: {
        original: 200,
        cancelled: 1,
        active: 199,
        received: 199,
        completionPercent: 100,
      },
    });
    const last = await database.approvalCommand.findFirstOrThrow({
      where: { orderId },
      orderBy: { afterVersion: "desc" },
    });
    expect(last.beforeFacts).toMatchObject({
      counts: { completionPercent: 99 },
    });
    expect(last.afterFacts).toMatchObject({
      money: { paidAmount: "360001.00", surplus: "1801.00" },
    });
    expect(
      await database.salesCommand.findUniqueOrThrow({
        where: { commandId: paidInput.commandId },
      }),
    ).toEqual(originalSales);
    expect(
      await database.approvalCommand.findUniqueOrThrow({
        where: { commandId: reportInput.commandId },
      }),
    ).toEqual(originalApproval);
  } finally {
    await fixture.dispose();
  }
});

it("preserves existing paid-update and official-print authority through ready, outbound, failed and delivered states", async () => {
  const f = await createQualityFixture(db),
    orderId = f.order.id,
    pieceIds = f.order.pieces.map((piece) => piece.id),
    quality = new QualityCommandExecutor(db),
    warehouse = new WarehouseService(db, commands),
    approval = new ApprovalService(db, new ApprovalCommandExecutor(db), null);
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
  const execute = async (operation: string, capture: object = {}) =>
    warehouse.execute(
      f.approvalActorId,
      warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds,
            ...capture,
          },
        ],
      }),
    );
  const paid = async (amount: string, status: string) => {
    const changed = await f.sales.setPaid(f.actorId, orderId, {
      commandId: randomUUID(),
      expectedVersion: await version(orderId),
      paidAmount: amount,
    });
    expect(changed.savedOrder).toMatchObject({
      status,
      money: { paidAmount: amount },
    });
    expect(
      (await approval.officialPaper(f.approvalActorId, orderId)).order.money
        .paidAmount,
    ).toBe(amount);
  };
  await execute("RECEIVE");
  const receipts = await db.warehouseReceiptPiece.findMany({
      where: { orderId },
      orderBy: { pieceId: "asc" },
    }),
    physical = await db.salesOrderPiece.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
    });
  await paid("1000.00", "READY_FOR_DELIVERY");
  const first = await execute("DISPATCH"),
    attemptId = first.outcome.orders[0]?.attemptId;
  await paid("2000.00", "OUT_FOR_DELIVERY");
  await execute("FAIL_DELIVERY", {
    attemptId,
    returnedToWarehouse: true,
    reason: "Whole order returned",
  });
  await paid("3000.00", "DELIVERY_FAILED");
  await execute("RETRY_DELIVERY", { attemptId });
  await paid("3500.00", "READY_FOR_DELIVERY");
  const second = await execute("DISPATCH");
  await execute("CONFIRM_DELIVERY", {
    attemptId: second.outcome.orders[0]?.attemptId,
  });
  await paid("4000.00", "DELIVERED");
  expect(
    await db.warehouseReceiptPiece.findMany({
      where: { orderId },
      orderBy: { pieceId: "asc" },
    }),
  ).toEqual(receipts);
  expect(
    await db.salesOrderPiece.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
    }),
  ).toEqual(physical);
  await expect(
    approval.officialPaper(f.qualityA, orderId),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  expect(
    JSON.stringify(await warehouse.getOrder(f.approvalActorId, orderId)),
  ).not.toContain("paidAmount");
});
