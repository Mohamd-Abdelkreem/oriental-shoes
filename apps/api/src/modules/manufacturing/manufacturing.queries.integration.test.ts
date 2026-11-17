import { AdministrationCommandExecutor } from "../administration/administration-command-executor.js";
import { administrationCommandBodySchema } from "@template/contracts";
import { StaffService } from "../staff/staff.service.js";
import { createP05LegacyUpgradeFixture } from "../../test-support/p05-legacy-upgrade.fixture.js";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@template/database";
import {
  manufacturingOrdersQuerySchema,
  manufacturingPiecesQuerySchema,
  manufacturingActivityQuerySchema,
  manufacturingOrderHistoryQuerySchema,
} from "@template/contracts";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createManufacturingFixture } from "../../test-support/manufacturing.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { ManufacturingCommandExecutor } from "./manufacturing-command-executor.js";
import { ManufacturingService } from "./manufacturing.service.js";
import { findOrderActivity } from "../sales-orders/order-activity.queries.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  service = new ManufacturingService(db, new ManufacturingCommandExecutor(db));
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
});
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const forbiddenKeys = new Set([
  "unitPrice",
  "paidAmount",
  "totalAmount",
  "money",
  "customerPhone",
  "customerAddress",
  "phone",
  "address",
  "proposed",
  "beforeFacts",
  "afterFacts",
  "contactNotes",
]);
const assertPrivate = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const item of value) assertPrivate(item);
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      expect(forbiddenKeys.has(key), key).toBe(false);
      assertPrivate(item);
    }
  }
};
it("serves exact mixed queues, truthful counts/pages, historical safe detail and actor-filtered original work/report IDs", async () => {
  const f = await createManufacturingFixture(db),
    id = f.order.id,
    [p1, p2] = f.order.pieces.map((p) => p.id);
  if (!p1 || !p2) throw new Error("Two pieces required");
  const work = async (
    actorId: string,
    department: "CUTTING" | "PRODUCTION",
    operation: "RECEIVE_AND_START" | "CONTINUE" | "COMPLETE_TRANSFER",
    pieceIds: string[],
  ) => {
    const root = await db.salesDraft.findUniqueOrThrow({ where: { id } });
    return service.execute(actorId, department, {
      commandId: randomUUID(),
      operation,
      orders: [{ orderId: id, expectedVersion: root.version, pieceIds }],
    });
  };
  const incoming = await service.listOrders(
    f.cuttingA,
    "CUTTING",
    manufacturingOrdersQuerySchema.parse({ view: "INCOMING", limit: 1 }),
  );
  expect(incoming.counts).toEqual({ orders: 1, pieces: 2 });
  expect(incoming.items[0]?.matchingPieceIds).toEqual([p1, p2].sort());
  const started = await work(f.cuttingA, "CUTTING", "RECEIVE_AND_START", [p1]);
  const dashboard = await service.dashboard(f.cuttingB, "CUTTING");
  expect(dashboard.counts.incoming.pieces).toBe(1);
  expect(dashboard.counts.inProgress.pieces).toBe(1);
  expect(dashboard.recentOrders[0]?.hasInProgress).toBe(true);
  let detail = await service.getOrder(f.cuttingB, "CUTTING", id);
  expect(
    detail.work.find((p) => p.pieceId === p1)?.allowedActions,
  ).toMatchObject({
    canContinue: true,
    canCompleteTransfer: true,
    canReceiveAndStart: false,
  });
  await work(f.cuttingB, "CUTTING", "CONTINUE", [p1]);
  detail = await service.getOrder(f.cuttingB, "CUTTING", id);
  expect(
    detail.work.find((p) => p.pieceId === p1)?.allowedActions.canContinue,
  ).toBe(false);
  await work(f.cuttingB, "CUTTING", "COMPLETE_TRANSFER", [p1]);
  const flat = await service.listPieces(
    f.cuttingA,
    "CUTTING",
    manufacturingPiecesQuerySchema.parse({ view: "COMPLETED", limit: 10 }),
  );
  expect(flat.counts).toEqual({ orders: 1, pieces: 1 });
  expect(flat.items.map((r) => r.piece.id)).toEqual([p1]);
  expect(flat.items[0]?.work.allowedActions.canCompleteTransfer).toBe(false);
  expect(
    (
      await service.listPieces(
        f.productionA,
        "PRODUCTION",
        manufacturingPiecesQuerySchema.parse({ view: "INCOMING" }),
      )
    ).items[0]?.piece.id,
  ).toBe(p1);
  expect(
    (
      await service.listOrders(
        f.cuttingA,
        "CUTTING",
        manufacturingOrdersQuerySchema.parse({
          view: "INCOMING",
          page: 8,
          limit: 1,
        }),
      )
    ).pagination,
  ).toMatchObject({ page: 8, total: 1, totalPages: 1 });
  for (const search of ["%_", "0501234567", "Frozen address"]) {
    const empty = await service.listPieces(
      f.cuttingA,
      "CUTTING",
      manufacturingPiecesQuerySchema.parse({ view: "INCOMING", search }),
    );
    expect(empty.items).toEqual([]);
    expect(empty.pagination.totalPages).toBe(0);
  }
  await work(f.productionA, "PRODUCTION", "RECEIVE_AND_START", [p1]);
  await work(f.productionB, "PRODUCTION", "COMPLETE_TRANSFER", [p1]);
  const root = await db.salesDraft.findUniqueOrThrow({ where: { id } });
  const report = await f.approval.reportIssue(f.cuttingB, id, p2, {
    commandId: randomUUID(),
    expectedVersion: root.version,
    reason: "Safe actual issue",
    notes: null,
  });
  const returned = await service.listPieces(
    f.cuttingA,
    "CUTTING",
    manufacturingPiecesQuerySchema.parse({ view: "RETURNED" }),
  );
  expect(returned.counts.pieces).toBe(1);
  expect(returned.items[0]?.piece.id).toBe(p2);
  expect(returned.items[0]?.work.allowedActions.canReceiveAndStart).toBe(false);
  detail = await service.getOrder(f.cuttingA, "CUTTING", id);
  expect(detail.paper.order.counts.received).toBe(0);
  assertPrivate(detail);
  assertPrivate(returned);
  assertPrivate(dashboard);
  const mine = await service.activity(
    f.cuttingA,
    "CUTTING",
    manufacturingActivityQuerySchema.parse({ actor: "me" }),
  );
  expect(mine.events.map((e) => e.event.commandId)).toEqual([
    started.receipt.commandId,
  ]);
  const colleague = await service.activity(
    f.cuttingB,
    "CUTTING",
    manufacturingActivityQuerySchema.parse({ actor: "me" }),
  );
  expect(
    colleague.events.find((e) => e.kind === "issue")?.event.commandId,
  ).toBe(report.receipt.commandId);
  assertPrivate(colleague);
  const history = await service.orderHistory(
    f.cuttingA,
    "CUTTING",
    id,
    manufacturingOrderHistoryQuerySchema.parse({ pieceId: p1 }),
  );
  expect(history.events).toHaveLength(3);
  expect(history.events.every((e) => e.kind === "manufacturing")).toBe(true);
  await expect(
    service.orderHistory(
      f.cuttingA,
      "CUTTING",
      id,
      manufacturingOrderHistoryQuerySchema.parse({ pieceId: randomUUID() }),
    ),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  await expect(
    service.getOrder(f.cuttingA, "PRODUCTION", id),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await expect(
    service.getOrder(f.cuttingA, "CUTTING", randomUUID()),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  const upstream = await db.$transaction((tx) =>
    findOrderActivity(
      tx,
      { kind: "OWNER", ownerId: f.actorId },
      { page: 1, limit: 100 },
      id,
    ),
  );
  expect(
    upstream.events.filter((e) => e.kind === "manufacturing"),
  ).toHaveLength(5);
  const foreign = await db.$transaction((tx) =>
    findOrderActivity(
      tx,
      { kind: "OWNER", ownerId: f.cuttingA },
      { page: 1, limit: 100 },
      id,
    ),
  );
  expect(foreign.events).toEqual([]);
});

it("tracks repairs, repeated corrections and cancellation without reviving old completion or changing earlier receipts", async () => {
  const f = await createManufacturingFixture(db, "REPAIR"),
    id = f.order.id,
    [p1, p2] = f.order.pieces.map((p) => p.id);
  if (!p1 || !p2) throw new Error("Two pieces required");
  const work = async (
    actorId: string,
    department: "CUTTING" | "PRODUCTION",
    operation: "RECEIVE_AND_START" | "COMPLETE_TRANSFER",
    pieceIds: string[],
  ) =>
    service.execute(actorId, department, {
      commandId: randomUUID(),
      operation,
      orders: [
        {
          orderId: id,
          expectedVersion: (
            await db.salesDraft.findUniqueOrThrow({ where: { id } })
          ).version,
          pieceIds,
        },
      ],
    });
  const original = await work(f.cuttingA, "CUTTING", "RECEIVE_AND_START", [
    p1,
    p2,
  ]);
  await work(f.cuttingB, "CUTTING", "COMPLETE_TRANSFER", [p1, p2]);
  expect(
    (await service.dashboard(f.productionA, "PRODUCTION")).counts.repairs,
  ).toEqual({ orders: 1, pieces: 2 });
  expect(
    (await service.dashboard(f.cuttingA, "CUTTING")).counts.repairs,
  ).toEqual({ orders: 0, pieces: 0 });
  expect(
    (
      await service.listOrders(
        f.productionA,
        "PRODUCTION",
        manufacturingOrdersQuerySchema.parse({
          view: "INCOMING",
          type: "SHOP",
        }),
      )
    ).items,
  ).toEqual([]);
  await work(f.productionA, "PRODUCTION", "RECEIVE_AND_START", [p1]);
  const source = await db.manufacturingWorkVisit.findFirstOrThrow({
    where: { pieceId: p1, endedAt: null },
  });
  const report = await f.approval.reportIssue(f.productionB, id, p1, {
    commandId: randomUUID(),
    expectedVersion: 5,
    reason: "Production material issue",
    notes: null,
  });
  if (report.outcome.issueId === null) throw new Error("Issue required");
  await f.approval.resolveIssue(
    f.approvalActorId,
    id,
    p1,
    report.outcome.issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 6,
      decision: "RETURN_TO_DEPARTMENT",
      target: "CUTTING",
      notes: "Approved cutting correction",
    },
  );
  const detail = await service.getOrder(f.cuttingB, "CUTTING", id),
    context = detail.work.find((c) => c.pieceId === p1);
  expect(context?.visit).toMatchObject({
    sequence: 3,
    origin: {
      kind: "APPROVAL_RETURN",
      instructions: "Approved cutting correction",
    },
    receivedAt: null,
    startedAt: null,
  });
  expect(context?.isReturned).toBe(true);
  expect(
    (
      await service.listPieces(
        f.cuttingB,
        "CUTTING",
        manufacturingPiecesQuerySchema.parse({ view: "COMPLETED" }),
      )
    ).items.map((i) => i.piece.id),
  ).toEqual([p2]);
  expect(
    (
      await service.listPieces(
        f.cuttingB,
        "CUTTING",
        manufacturingPiecesQuerySchema.parse({ view: "RETURNED" }),
      )
    ).items.map((i) => i.piece.id),
  ).toEqual([p1]);
  expect(
    await db.manufacturingWorkVisit.findUniqueOrThrow({
      where: { id: source.id },
    }),
  ).toMatchObject({
    startedCommandId: source.startedCommandId,
    receivedCommandId: source.receivedCommandId,
    startedAt: source.startedAt,
    receivedAt: source.receivedAt,
    endReason: "ISSUE_REPORTED",
    endApprovalCommandId: report.receipt.commandId,
  });
  const mine = await service.activity(
    f.productionB,
    "PRODUCTION",
    manufacturingActivityQuerySchema.parse({ actor: "me" }),
  );
  expect(mine.events.map((e) => e.event.commandId)).toContain(
    report.receipt.commandId,
  );
  const first = await service.activity(
      f.cuttingA,
      "CUTTING",
      manufacturingActivityQuerySchema.parse({ limit: 1 }),
    ),
    second = await service.activity(
      f.cuttingA,
      "CUTTING",
      manufacturingActivityQuerySchema.parse({ limit: 1, page: 2 }),
    );
  expect(first.events[0]?.event.id).not.toBe(second.events[0]?.event.id);
  expect(first.pagination.total).toBe(3);
  await work(f.cuttingA, "CUTTING", "RECEIVE_AND_START", [p1]);
  const reportedAgain = await f.approval.reportIssue(f.cuttingB, id, p1, {
    commandId: randomUUID(),
    expectedVersion: 8,
    reason: "Cancel exact rework",
    notes: null,
  });
  if (reportedAgain.outcome.issueId === null) throw new Error("Issue required");
  await f.approval.resolveIssue(
    f.approvalActorId,
    id,
    p1,
    reportedAgain.outcome.issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 9,
      decision: "CANCEL",
      confirmed: true,
      reason: "Approved cancellation",
    },
  );
  const history = await service.orderHistory(
    f.cuttingA,
    "CUTTING",
    id,
    manufacturingOrderHistoryQuerySchema.parse({ pieceId: p1 }),
  );
  assertPrivate(history);
  expect(
    history.events.find(
      (e) => e.kind === "issue" && e.event.result === "CANCELLED",
    )?.event,
  ).toMatchObject({ reason: "Approved cancellation", notes: null });
  expect(
    (await service.dashboard(f.cuttingA, "CUTTING")).counts.returned.pieces,
  ).toBe(0);
  expect(await service.observe(f.cuttingA, original.receipt.commandId)).toEqual(
    { ...original, replayed: true },
  );
});

it("treats percent, underscore and backslash as literal searchable customer text and keeps canonical tied piece ordering", async () => {
  const f = await createManufacturingFixture(
    db,
    "SHOP",
    "Literal %_ back\\slash",
  );
  for (const search of ["%_", "back\\slash"]) {
    const grouped = await service.listOrders(
        f.cuttingA,
        "CUTTING",
        manufacturingOrdersQuerySchema.parse({ view: "INCOMING", search }),
      ),
      flat = await service.listPieces(
        f.cuttingA,
        "CUTTING",
        manufacturingPiecesQuerySchema.parse({
          view: "INCOMING",
          search,
          limit: 1,
        }),
      );
    expect(grouped.counts).toEqual({ orders: 1, pieces: 2 });
    expect(flat.counts).toEqual(grouped.counts);
    expect(flat.pagination.totalPages).toBe(2);
    expect(flat.items[0]?.piece.id).toBe(
      [...f.order.pieces.map((p) => p.id)].sort().reverse()[0],
    );
    const next = await service.listPieces(
      f.cuttingA,
      "CUTTING",
      manufacturingPiecesQuerySchema.parse({
        view: "INCOMING",
        search,
        limit: 1,
        page: 2,
      }),
    );
    expect(next.items[0]?.piece.id).not.toBe(flat.items[0]?.piece.id);
  }
});

it("does not invent department participation or completion from a legacy downstream location", async () => {
  const legacy = await createP05LegacyUpgradeFixture(
    "PRE_P05_DOWNSTREAM_COUNTS",
  );
  try {
    const ownService = new ManufacturingService(
      legacy.database,
      new ManufacturingCommandExecutor(legacy.database),
    );
    const workerId = randomUUID();
    await legacy.database.user.create({
      data: {
        id: workerId,
        email: `${workerId}@example.test`,
        fullName: "Legacy reader",
        passwordHash: "synthetic",
        status: "PENDING_APPROVAL",
        emailVerifiedAt: new Date(),
      },
    });
    await new StaffService(legacy.database).approveStaff(
      legacy.approvalActorId,
      workerId,
      {
        commandId: randomUUID(),
        expectedAccessVersion: 0,
        department: "CUTTING",
      },
    );
    expect(
      (
        await ownService.listPieces(
          workerId,
          "CUTTING",
          manufacturingPiecesQuerySchema.parse({ view: "COMPLETED" }),
        )
      ).counts.pieces,
    ).toBe(0);
    const current = await ownService.getOrder(
      workerId,
      "CUTTING",
      legacy.orderId,
    );
    expect(current.paper.order.counts.completionPercent).toBe(50);
    const warehouse = current.paper.order.pieces.find(
      (p) => p.stage === "WAREHOUSE",
    );
    if (!warehouse) throw new Error("Legacy receipt required");
    await expect(
      ownService.orderHistory(
        workerId,
        "CUTTING",
        legacy.orderId,
        manufacturingOrderHistoryQuerySchema.parse({ pieceId: warehouse.id }),
      ),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    expect(
      (
        await ownService.activity(
          workerId,
          "CUTTING",
          manufacturingActivityQuerySchema.parse({}),
        )
      ).events,
    ).toEqual([]);
  } finally {
    await legacy.dispose();
  }
});

it("manufacturing order history includes only relevant minimal administrative cancellation and preserves feed/piece scope", async () => {
  const f = await createManufacturingFixture(db),
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
      f.cuttingA,
      "CUTTING",
      f.order.id,
      manufacturingOrderHistoryQuerySchema.parse({ pieceId, limit: 100 }),
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
    f.cuttingA,
    "CUTTING",
    manufacturingActivityQuerySchema.parse({ limit: 100 }),
  );
  expect(ownFeed.events.map((item) => item.kind)).not.toContain(
    "administration",
  );
  expect(JSON.stringify(events)).not.toContain("Private");
  await expect(history(randomUUID())).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
});
