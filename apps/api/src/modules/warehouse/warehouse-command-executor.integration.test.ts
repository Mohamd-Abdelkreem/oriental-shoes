import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  Prisma,
  type DatabaseClient,
} from "@template/database";
import {
  qualityCommandBodySchema,
  warehouseCommandBodySchema,
  type WarehouseCommandBody,
} from "@template/contracts";
import {
  appendQualityOrder,
  createQualityFixture,
} from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { ApprovalService } from "../approval/approval.service.js";
import { WarehouseCommandExecutor } from "./warehouse-command-executor.js";
import { WarehouseService } from "./warehouse.service.js";
import { StaffService } from "../staff/staff.service.js";
import { createP07LegacyUpgradeFixture } from "../../test-support/p07-legacy-upgrade.fixture.js";
import {
  lockAccountRows,
  loadIdentityAccount,
} from "../auth/account-authority.js";
import { lockWarehouseOrders } from "./warehouse.queries.js";
import { canonicalWarehouseOrders } from "./warehouse.rules.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (uri === undefined || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  commands = new WarehouseCommandExecutor(db),
  quality = new QualityCommandExecutor(db);
let largeFixtureActive = false;
beforeEach(async () => {
  if (!largeFixtureActive) await resetOwnedIdentityTestData(db);
});
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const recordTiming = (entry: {
  case: string;
  setupMs?: number;
  executionThroughCommitMs: number;
}) =>
  appendFile(
    join(tmpdir(), "p07-warehouse-max-evidence.jsonl"),
    JSON.stringify({ ...entry, runAtUTC: new Date().toISOString() }) + "\n",
  );
const version = async (orderId: string) =>
  (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    })
  ).version;
const inspectAccepted = async (
  actorId: string,
  orderId: string,
  pieceIds: string[],
) => {
  await quality.execute({
    actorId,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
    },
  });
  await quality.execute({
    actorId,
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
};
const readyFixture = async () => {
  const f = await createQualityFixture(db),
    pieceIds = f.order.pieces.map((piece) => piece.id);
  await inspectAccepted(f.qualityA, f.order.id, pieceIds);
  await commands.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(f.order.id),
          pieceIds,
        },
      ],
    }),
  });
  return { ...f, pieceIds };
};
const graph = (database: DatabaseClient = db) =>
  database.$queryRaw(Prisma.sql`SELECT jsonb_build_object(
  'roots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_drafts t),
  'headers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_orders t),
  'pieces',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_order_pieces t),
  'captures',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_draft_pieces t),
  'quality',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM quality_commands t),
  'packing',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_packing_groups t),
  'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM warehouse_commands t),
  'orders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id) FROM warehouse_command_orders t),
  'groups',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_receipt_groups t),
  'receipts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY piece_id) FROM warehouse_receipt_pieces t),
  'attempts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_delivery_attempts t),
  'members',(SELECT jsonb_agg(to_jsonb(t) ORDER BY attempt_id,piece_id) FROM warehouse_delivery_attempt_members t),
  'outcomes',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_delivery_outcomes t),
  'retries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_delivery_retries t),
  'corrections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_correction_cycles t),
  'issues',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM manufacturing_issues t),
  'approval',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM approval_commands t),
  'sales',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM sales_commands t),
  'manufacturing',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM manufacturing_commands t),
  'manufacturingOrders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id) FROM manufacturing_command_orders t),
  'manufacturingEvents',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM manufacturing_piece_events t),
  'manufacturingVisits',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM manufacturing_work_visits t),
  'qualityOrders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id) FROM quality_command_orders t),
  'qualityEvents',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_piece_events t),
  'qualityVisits',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_work_visits t),
  'packingMembers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY group_id,piece_id) FROM quality_packing_pieces t),
  'proposals',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM piece_contact_proposals t),
  'qualityReports',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id,ordinal) FROM quality_approval_reports t),
  'catalogSelections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY piece_id,field) FROM sales_piece_catalog_selections t)) AS graph`);

const contendOnRoot = async (
  orderId: string,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) => {
  const blocker = createDatabaseClient(uri);
  let release = () => {},
    entered = () => {};
  const hold = new Promise<void>((resolve) => {
      release = resolve;
    }),
    inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const gate = blocker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${orderId}::uuid FOR UPDATE`;
      entered();
      await hold;
    },
    { timeout: 10000 },
  );
  const pending: Promise<PromiseSettledResult<unknown>[]>[] = [];
  const waitFor = async (minimum: number) => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((row?.count ?? 0) >= minimum) return;
    }
    throw new Error("Expected real queued warehouse contenders");
  };
  try {
    await inside;
    pending.push(Promise.allSettled([first()]));
    await waitFor(1);
    pending.push(Promise.allSettled([second()]));
    await waitFor(2);
    release();
    await gate;
    return (await Promise.all(pending)).flat();
  } finally {
    release();
    await Promise.allSettled([gate, ...pending]);
    await blocker.$disconnect();
  }
};
const expectOneWinner = (results: readonly PromiseSettledResult<unknown>[]) => {
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "ORDER_VERSION_CONFLICT" },
  });
};

it("rolls back both orders when the last required arrival-group save fails", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f);
  for (const order of [f.order, other])
    await inspectAccepted(
      f.qualityA,
      order.id,
      order.pieces.map((piece) => piece.id),
    );
  const orders = [f.order, other].sort((a, b) => a.id.localeCompare(b.id));
  const groups = await Promise.all(
    orders.map(async (order, index) => ({
      orderId: order.id,
      expectedVersion: await version(order.id),
      pieceIds: order.pieces.map((piece) => piece.id),
      receipt: { notes: index === 1 ? "owned-failure" : "First arrival" },
    })),
  );
  const before = await graph();
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p07_owned_fail_arrival() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.notes='owned-failure' THEN RAISE EXCEPTION 'controlled arrival failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$",
  );
  await db.$executeRawUnsafe(
    "CREATE TRIGGER p07_owned_fail_arrival BEFORE INSERT ON warehouse_receipt_groups FOR EACH ROW EXECUTE FUNCTION p07_owned_fail_arrival()",
  );
  try {
    await expect(
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "RECEIVE",
          orders: groups,
        }),
      }),
    ).rejects.toThrow();
    expect(await graph()).toEqual(before);
    expect(await db.warehouseCommand.count()).toBe(0);
    expect(await db.warehouseReceiptPiece.count()).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p07_owned_fail_arrival ON warehouse_receipt_groups",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p07_owned_fail_arrival()");
  }
});

it("rejects held and cancelled members without discarding a valid companion's eligibility", async () => {
  const f = await createQualityFixture(db),
    [accepted, held] = f.order.pieces;
  if (accepted === undefined || held === undefined)
    throw new Error("Two owned physical pieces required");
  await inspectAccepted(f.qualityA, f.order.id, [accepted.id]);
  await quality.execute({
    actorId: f.qualityB,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "REPORT_ISSUES",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(f.order.id),
          pieceIds: [held.id],
        },
      ],
      reason: "Missing customer confirmation",
    }),
  });
  const receive = async (pieceIds: string[]) =>
    commands.execute({
      actorId: f.approvalActorId,
      body: warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "RECEIVE",
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: await version(f.order.id),
            pieceIds,
          },
        ],
      }),
    });
  const before = await graph();
  await expect(receive([accepted.id, held.id])).rejects.toMatchObject({
    code: "WAREHOUSE_SELECTION_CONFLICT",
  });
  expect(await graph()).toEqual(before);
  await receive([accepted.id]);
  const afterReceive = await graph();
  const issue = await db.manufacturingIssue.findFirstOrThrow({
    where: { orderId: f.order.id, pieceId: held.id, state: "APPROVAL_REVIEW" },
  });
  await new ApprovalService(
    db,
    new ApprovalCommandExecutor(db),
    null,
  ).resolveIssue(f.approvalActorId, f.order.id, held.id, issue.id, {
    commandId: randomUUID(),
    expectedVersion: await version(f.order.id),
    decision: "CANCEL",
    confirmed: true,
    reason: "Confirmed cancellation",
  });
  const afterCancel = await graph();
  await expect(receive([held.id])).rejects.toMatchObject({
    code: "ORDER_STATE_CONFLICT",
  });
  expect(await graph()).toEqual(afterCancel);
  expect(afterReceive).not.toEqual(afterCancel);
  expect(await db.warehouseReceiptPiece.count()).toBe(1);
});

it("dispatches exactly the full active order once and rejects subsets and a stale second order atomically", async () => {
  const f = await readyFixture(),
    orderId = f.order.id,
    initial = await graph();
  const body = warehouseCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "DISPATCH",
    orders: [
      {
        orderId,
        expectedVersion: await version(orderId),
        pieceIds: f.pieceIds,
        deliveryNote: "  Delivery note only  ",
      },
    ],
  });
  if (body.operation !== "DISPATCH") throw new Error("Dispatch required");
  await expect(
    commands.execute({
      actorId: f.approvalActorId,
      body: {
        ...body,
        orders: body.orders.map((group) => ({
          ...group,
          pieceIds: group.pieceIds.slice(0, 1),
        })),
      },
    }),
  ).rejects.toMatchObject({ code: "WAREHOUSE_SELECTION_CONFLICT" });
  expect(await graph()).toEqual(initial);
  const other = await appendQualityOrder(db, f),
    otherIds = other.pieces.map((piece) => piece.id);
  await inspectAccepted(f.qualityA, other.id, otherIds);
  await commands.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId: other.id,
          expectedVersion: await version(other.id),
          pieceIds: otherIds,
        },
      ],
    }),
  });
  const beforeBatch = await graph();
  await expect(
    commands.execute({
      actorId: f.approvalActorId,
      body: {
        ...body,
        commandId: randomUUID(),
        orders: [
          ...body.orders,
          {
            orderId: other.id,
            expectedVersion: (await version(other.id)) - 1,
            pieceIds: otherIds,
            deliveryNote: null,
          },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  expect(await graph()).toEqual(beforeBatch);
  const physical = await db.salesOrderPiece.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  });
  const result = await commands.execute({ actorId: f.approvalActorId, body });
  const attempts = await db.warehouseDeliveryAttempt.findMany({
    where: { orderId },
    include: { members: { orderBy: { pieceId: "asc" } } },
  });
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    number: 1,
    deliveryNote: "  Delivery note only  ",
    predecessorRetryId: null,
  });
  expect(attempts[0]?.members.map((member) => member.pieceId)).toEqual(
    [...f.pieceIds].sort(),
  );
  expect(
    await db.warehouseDeliveryAttemptMember.count({ where: { orderId } }),
  ).toBe(2);
  expect(
    await db.salesOrderPiece.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
    }),
  ).toEqual(physical);
  const after = await graph();
  expect(await commands.execute({ actorId: f.approvalActorId, body })).toEqual({
    ...result,
    replayed: true,
  });
  expect(await graph()).toEqual(after);
});

it("retains full-return failure and a date-free retry without dispatching, then creates the next attempt and preserves absent delivery capture", async () => {
  const f = await readyFixture(),
    orderId = f.order.id,
    service = new WarehouseService(db, commands),
    receipt = await db.warehouseReceiptPiece.findMany({
      where: { orderId },
      orderBy: { pieceId: "asc" },
    }),
    originalHeader = await db.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    }),
    originalRoot = await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
    });
  const dispatch = async () =>
    service.execute(
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
    );
  const dispatched = await dispatch(),
    attemptId = dispatched.outcome.orders[0]?.attemptId;
  if (!attemptId) throw new Error("Dispatched attempt required");
  const beforeWrong = await graph();
  await expect(
    service.execute(f.approvalActorId, {
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds,
          attemptId,
          recipient: null,
          deliveredAt: "2026-11-13T12:30:00",
          notes: null,
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(
    service.execute(
      f.approvalActorId,
      warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "CONFIRM_DELIVERY",
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds: f.pieceIds,
            attemptId: randomUUID(),
          },
        ],
      }),
    ),
  ).rejects.toMatchObject({ code: "WAREHOUSE_SELECTION_CONFLICT" });
  expect(await graph()).toEqual(beforeWrong);
  const failed = await service.execute(
    f.approvalActorId,
    warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "FAIL_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds,
          attemptId,
          returnedToWarehouse: true,
          reason: "Customer unavailable",
          notes: "All pieces returned",
        },
      ],
    }),
  );
  expect(failed.outcome.orders[0]?.status).toBe("DELIVERY_FAILED");
  await expect(dispatch()).rejects.toMatchObject({
    code: "ORDER_STATE_CONFLICT",
  });
  const retryBody = warehouseCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "RETRY_DELIVERY",
    orders: [
      {
        orderId,
        expectedVersion: await version(orderId),
        pieceIds: f.pieceIds,
        attemptId,
        retryDate: " ",
        notes: "Try again after contact",
      },
    ],
  });
  const retried = await service.execute(f.approvalActorId, retryBody);
  expect(retried.outcome.orders[0]?.status).toBe("READY_FOR_DELIVERY");
  expect(await db.warehouseDeliveryAttempt.count({ where: { orderId } })).toBe(
    1,
  );
  const retry = await db.warehouseDeliveryRetry.findFirstOrThrow({
    where: { orderId },
  });
  expect(retry).toMatchObject({
    retryDate: null,
    notes: "Try again after contact",
  });
  const afterRetry = await graph();
  expect(await service.execute(f.approvalActorId, retryBody)).toEqual({
    ...retried,
    replayed: true,
  });
  await expect(
    service.execute(f.approvalActorId, {
      ...retryBody,
      commandId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  expect(await graph()).toEqual(afterRetry);
  const second = await dispatch(),
    secondAttempt = second.outcome.orders[0]?.attemptId;
  if (!secondAttempt) throw new Error("Second dispatched attempt required");
  expect(
    await db.warehouseDeliveryAttempt.findUniqueOrThrow({
      where: { id: secondAttempt },
    }),
  ).toMatchObject({ number: 2, predecessorRetryId: retry.id });
  await service.execute(
    f.approvalActorId,
    warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds,
          attemptId: secondAttempt,
        },
      ],
    }),
  );
  expect(
    await db.warehouseDeliveryOutcome.findUniqueOrThrow({
      where: { attemptId: secondAttempt },
    }),
  ).toMatchObject({
    kind: "DELIVERED",
    recipient: null,
    deliveredAt: null,
    notes: null,
    returnedToWarehouse: false,
    reason: null,
  });
  expect(
    await db.warehouseReceiptPiece.findMany({
      where: { orderId },
      orderBy: { pieceId: "asc" },
    }),
  ).toEqual(receipt);
  const finalHeader = await db.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    }),
    finalRoot = await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
    });
  expect(finalHeader.paidAmount).toEqual(originalHeader.paidAmount);
  expect(finalRoot.deliveryDate).toEqual(originalRoot.deliveryDate);
});

it("serializes competing receipts and last-receipt/dispatch with one physical receipt and reviewed versions", async () => {
  const f = await createQualityFixture(db),
    orderId = f.order.id,
    pieceIds = f.order.pieces.map((piece) => piece.id),
    [first, last] = pieceIds;
  if (!first || !last) throw new Error("Two members required");
  await inspectAccepted(f.qualityA, orderId, pieceIds);
  const initial = await version(orderId),
    receipt = () =>
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "RECEIVE",
          orders: [{ orderId, expectedVersion: initial, pieceIds: [first] }],
        }),
      });
  expectOneWinner(await contendOnRoot(orderId, receipt, receipt));
  expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(1);
  expect(await db.warehouseReceiptGroup.count({ where: { orderId } })).toBe(1);
  expect(await version(orderId)).toBe(initial + 1);
  const beforeFinal = await version(orderId);
  const results = await contendOnRoot(
    orderId,
    () =>
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "RECEIVE",
          orders: [{ orderId, expectedVersion: beforeFinal, pieceIds: [last] }],
        }),
      }),
    () =>
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "DISPATCH",
          orders: [{ orderId, expectedVersion: beforeFinal, pieceIds }],
        }),
      }),
  );
  expectOneWinner(results);
  expect(
    (await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
  ).toBe("READY_FOR_DELIVERY");
  expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(2);
  expect(await db.warehouseDeliveryAttempt.count({ where: { orderId } })).toBe(
    0,
  );
});

it("serializes dispatch/dispatch, terminal success/failure and retry/retry without contradictory durable outcomes", async () => {
  const f = await readyFixture(),
    orderId = f.order.id,
    pieceIds = f.pieceIds,
    initialVersion = await version(orderId);
  const dispatch = () =>
    commands.execute({
      actorId: f.approvalActorId,
      body: warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "DISPATCH",
        orders: [{ orderId, expectedVersion: initialVersion, pieceIds }],
      }),
    });
  expectOneWinner(await contendOnRoot(orderId, dispatch, dispatch));
  const attempt = await db.warehouseDeliveryAttempt.findFirstOrThrow({
      where: { orderId },
    }),
    dispatchedVersion = await version(orderId);
  expect(await db.warehouseDeliveryAttempt.count({ where: { orderId } })).toBe(
    1,
  );
  const terminal = await contendOnRoot(
    orderId,
    () =>
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "FAIL_DELIVERY",
          orders: [
            {
              orderId,
              expectedVersion: dispatchedVersion,
              pieceIds,
              attemptId: attempt.id,
              returnedToWarehouse: true,
              reason: "Entire order returned",
            },
          ],
        }),
      }),
    () =>
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "CONFIRM_DELIVERY",
          orders: [
            {
              orderId,
              expectedVersion: dispatchedVersion,
              pieceIds,
              attemptId: attempt.id,
            },
          ],
        }),
      }),
  );
  expectOneWinner(terminal);
  expect(await db.warehouseDeliveryOutcome.count({ where: { orderId } })).toBe(
    1,
  );
  expect(
    (
      await db.warehouseDeliveryOutcome.findUniqueOrThrow({
        where: { attemptId: attempt.id },
      })
    ).kind,
  ).toBe("FAILED");
  const failedVersion = await version(orderId),
    retry = () =>
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "RETRY_DELIVERY",
          orders: [
            {
              orderId,
              expectedVersion: failedVersion,
              pieceIds,
              attemptId: attempt.id,
            },
          ],
        }),
      });
  expectOneWinner(await contendOnRoot(orderId, retry, retry));
  expect(await db.warehouseDeliveryRetry.count({ where: { orderId } })).toBe(1);
  expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(2);
  expect(await version(orderId)).toBe(initialVersion + 3);
});

it.each(["receipt-first", "cancellation-first"] as const)(
  "serializes P04 cancellation and receipt with %s then a reviewed retry",
  async (ordering) => {
    const f = await createQualityFixture(db),
      orderId = f.order.id,
      [accepted, missing] = f.order.pieces;
    if (!accepted || !missing) throw new Error("Two members required");
    await inspectAccepted(f.qualityA, orderId, [accepted.id]);
    await quality.execute({
      actorId: f.qualityB,
      body: qualityCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "REPORT_ISSUES",
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds: [missing.id],
          },
        ],
        reason: "Confirmed missing piece",
      }),
    });
    const issue = await db.manufacturingIssue.findFirstOrThrow({
        where: { orderId, pieceId: missing.id, state: "APPROVAL_REVIEW" },
      }),
      initial = await version(orderId),
      header = await db.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
    const receipt = (expectedVersion: number) =>
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "RECEIVE",
          orders: [{ orderId, expectedVersion, pieceIds: [accepted.id] }],
        }),
      });
    const cancel = (expectedVersion: number) =>
      f.approval.resolveIssue(
        f.approvalActorId,
        orderId,
        missing.id,
        issue.id,
        {
          commandId: randomUUID(),
          expectedVersion,
          decision: "CANCEL",
          confirmed: true,
          reason: "Confirmed cancellation",
        },
      );
    const first =
        ordering === "receipt-first"
          ? () => receipt(initial)
          : () => cancel(initial),
      second =
        ordering === "receipt-first"
          ? () => cancel(initial)
          : () => receipt(initial);
    expectOneWinner(await contendOnRoot(orderId, first, second));
    if (ordering === "receipt-first") await cancel(await version(orderId));
    else await receipt(await version(orderId));
    const finalHeader = await db.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(finalHeader.status).toBe("READY_FOR_DELIVERY");
    expect(finalHeader.paidAmount).toEqual(header.paidAmount);
    expect(await version(orderId)).toBe(initial + 2);
    expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(
      1,
    );
    expect(
      await db.salesOrderPiece.count({
        where: { orderId, stage: "CANCELLED" },
      }),
    ).toBe(1);
  },
);

it("holds current warehouse account authority through commit before a queued staff revocation", async () => {
  const f = await createQualityFixture(db),
    orderId = f.order.id,
    pieceIds = f.order.pieces.map((piece) => piece.id),
    actorId = randomUUID();
  await inspectAccepted(f.qualityA, orderId, pieceIds);
  await db.user.create({
    data: {
      id: actorId,
      email: actorId + "@example.test",
      fullName: "Warehouse operator",
      passwordHash: "synthetic-only",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  const staff = new StaffService(db);
  await staff.approveStaff(f.approvalActorId, actorId, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "WAREHOUSE",
  });
  const commandId = randomUUID(),
    expectedVersion = await version(orderId);
  const results = await contendOnRoot(
    orderId,
    () =>
      commands.execute({
        actorId,
        body: warehouseCommandBodySchema.parse({
          commandId,
          operation: "RECEIVE",
          orders: [{ orderId, expectedVersion, pieceIds }],
        }),
      }),
    () =>
      staff.suspendStaff(f.approvalActorId, actorId, {
        commandId: randomUUID(),
        expectedAccessVersion: 1,
      }),
  );
  expect(results.every((result) => result.status === "fulfilled")).toBe(true);
  expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(2);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: actorId } })).status,
  ).toBe("SUSPENDED");
  await expect(commands.observe(actorId, commandId)).rejects.toMatchObject({
    code: "ACCOUNT_RESTRICTED",
  });
});

it("rolls back the full multi-order graph when the real deferred commit check fails", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f),
    orders = [f.order, other];
  for (const order of orders)
    await inspectAccepted(
      f.qualityA,
      order.id,
      order.pieces.map((piece) => piece.id),
    );
  const groups = await Promise.all(
      orders.map(async (order) => ({
        orderId: order.id,
        expectedVersion: await version(order.id),
        pieceIds: order.pieces.map((piece) => piece.id),
      })),
    ),
    before = await graph();
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p07_owned_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled deferred failure' USING ERRCODE='23514'; END $$",
  );
  await db.$executeRawUnsafe(
    "CREATE CONSTRAINT TRIGGER p07_owned_fail_commit AFTER INSERT ON warehouse_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION p07_owned_fail_commit()",
  );
  try {
    await expect(
      commands.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "RECEIVE",
          orders: groups,
        }),
      }),
    ).rejects.toThrow();
    expect(await graph()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p07_owned_fail_commit ON warehouse_commands",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p07_owned_fail_commit()");
  }
});

describe("maximum receipt command viability", () => {
  let fixture: Awaited<ReturnType<typeof createQualityFixture>> | undefined;
  let dense: Awaited<ReturnType<typeof appendQualityOrder>> | undefined;
  let setupMs = 0;
  beforeAll(async () => {
    largeFixtureActive = true;
    await resetOwnedIdentityTestData(db);
    const started = performance.now();
    fixture = await createQualityFixture(db);
    dense = await appendQualityOrder(db, fixture, 200);
    await inspectAccepted(
      fixture.qualityA,
      dense.id,
      dense.pieces.map((piece) => piece.id),
    );
    setupMs = performance.now() - started;
  });
  afterAll(async () => {
    largeFixtureActive = false;
    await resetOwnedIdentityTestData(db);
  });
  it("commits all 200 physical receipts under the unchanged transaction budget", async () => {
    if (!fixture || !dense) throw new Error("Dense owned fixture required");
    const orderId = dense.id,
      pieceIds = dense.pieces.map((piece) => piece.id),
      beforeVersion = await version(orderId),
      header = await db.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      }),
      captures = await db.salesDraftPiece.findMany({
        where: { draftId: orderId },
        orderBy: { id: "asc" },
      });
    const body = warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId,
          expectedVersion: beforeVersion,
          pieceIds,
          receipt: {
            cartonCount: "c".repeat(4000),
            storageLocation: "s".repeat(4000),
            notes: "n".repeat(4000),
          },
        },
      ],
    });
    const started = performance.now();
    await commands.execute({ actorId: fixture.approvalActorId, body });
    const elapsedMs = performance.now() - started;
    await recordTiming({
      case: "P07 dense 200",
      setupMs: Math.round(setupMs),
      executionThroughCommitMs: Math.round(elapsedMs),
    });
    expect(elapsedMs).toBeLessThan(10000);
    expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(
      200,
    );
    expect(await db.warehouseReceiptGroup.count({ where: { orderId } })).toBe(
      1,
    );
    expect(await version(orderId)).toBe(beforeVersion + 1);
    expect(
      (await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } }))
        .status,
    ).toBe("READY_FOR_DELIVERY");
    expect(
      (await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } }))
        .paidAmount,
    ).toEqual(header.paidAmount);
    expect(
      await db.salesDraftPiece.findMany({
        where: { draftId: orderId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(captures);
    await commands.execute({ actorId: fixture.approvalActorId, body });
    expect(await db.warehouseReceiptPiece.count({ where: { orderId } })).toBe(
      200,
    );
    expect(await version(orderId)).toBe(beforeVersion + 1);
  });
});

describe("sparse maximum receipt command viability", () => {
  let sparse:
    | {
        database: DatabaseClient;
        dispose(): Promise<void>;
        actorId: string;
        body: WarehouseCommandBody;
        setupMs: number;
        orderIds: string[];
        selectedIds: string[];
      }
    | undefined;
  beforeAll(async () => {
    largeFixtureActive = true;
    await resetOwnedIdentityTestData(db);
    const started = performance.now(),
      fixture = await createP07LegacyUpgradeFixture("SPARSE"),
      database = fixture.database;
    try {
      const quality = new QualityCommandExecutor(database);
      for (let offset = 0; offset < fixture.selected.length; offset += 10) {
        const batch = fixture.selected.slice(offset, offset + 10),
          roots = await database.salesDraft.findMany({
            where: { id: { in: batch.map((row) => row.orderId) } },
            select: { id: true, version: true },
          }),
          versions = new Map(roots.map((root) => [root.id, root.version]));
        const groups = batch.map((row) => {
          const expectedVersion = versions.get(row.orderId);
          if (expectedVersion === undefined)
            throw new Error("Sparse root required");
          return {
            orderId: row.orderId,
            expectedVersion,
            pieceIds: [row.pieceId],
          };
        });
        const started = await quality.execute({
          actorId: fixture.actorId,
          body: {
            commandId: randomUUID(),
            operation: "RECEIVE_AND_START",
            orders: groups,
          },
        });
        await quality.execute({
          actorId: fixture.actorId,
          body: qualityCommandBodySchema.parse({
            commandId: randomUUID(),
            operation: "INSPECT",
            orders: started.outcome.orders.map((order) => ({
              orderId: order.orderId,
              expectedVersion: order.afterVersion,
              decisions: batch
                .filter((row) => row.orderId === order.orderId)
                .map((row) => ({ pieceId: row.pieceId, decision: "ACCEPT" })),
              inspectorNote: "Original sparse inspection",
              packing: { cartonCount: " 1 " },
            })),
          }),
        });
      }
      const roots = await database.salesDraft.findMany({
          where: { id: { in: fixture.orderIds } },
          select: { id: true, version: true },
        }),
        versions = new Map(roots.map((root) => [root.id, root.version]));
      const orders = fixture.selected.map((row) => {
        const expectedVersion = versions.get(row.orderId);
        if (expectedVersion === undefined)
          throw new Error("Sparse root required");
        return {
          orderId: row.orderId,
          expectedVersion,
          pieceIds: [row.pieceId],
          receipt: { notes: "Sparse initial arrival" },
        };
      });
      sparse = {
        ...fixture,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "RECEIVE",
          orders,
        }),
        selectedIds: fixture.selected.map((row) => row.pieceId),
        setupMs: performance.now() - started,
      };
    } catch (error) {
      await fixture.dispose();
      throw error;
    }
  });
  afterAll(async () => {
    try {
      if (sparse) await sparse.dispose();
    } finally {
      largeFixtureActive = false;
      await resetOwnedIdentityTestData(db);
    }
  });
  it("rolls back a final child fault then commits exactly 200 selected effects among 40000 retained pieces", async () => {
    if (!sparse) throw new Error("Sparse owned fixture required");
    const fixture = sparse,
      db = fixture.database,
      commands = new WarehouseCommandExecutor(db);
    const selected = Prisma.join(
        fixture.selectedIds.map((id) => Prisma.sql`${id}::uuid`),
      ),
      ids = Prisma.join(fixture.orderIds.map((id) => Prisma.sql`${id}::uuid`));
    const protectedFacts = () =>
      db.$queryRaw(Prisma.sql`SELECT encode(sha256(convert_to(jsonb_build_object(
      'specifications',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_draft_pieces t WHERE draft_id IN (${ids})),
      'companions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_order_pieces t WHERE order_id IN (${ids}) AND id NOT IN (${selected})),
      'headers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_orders t WHERE id IN (${ids})),
      'packing',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_packing_groups t WHERE order_id IN (${ids})),
      'quality',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM quality_commands t))::text,'UTF8')),'hex') AS digest`);
    const beforeFacts = await protectedFacts(),
      before = await graph(db);
    const contexts = await db.$transaction(
      async (tx) => {
        await lockAccountRows(tx, [fixture.actorId], "read");
        const actor = await loadIdentityAccount(tx, fixture.actorId);
        return lockWarehouseOrders(tx, {
          actor,
          body: fixture.body,
          orders: canonicalWarehouseOrders(fixture.body),
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 10000,
      },
    );
    expect(contexts).toHaveLength(200);
    expect(
      contexts.reduce((sum, order) => sum + order.physical.length, 0),
    ).toBe(200);
    expect(
      contexts.every(
        (order) =>
          !("pieces" in order.root) &&
          order.counts.active === 200 &&
          order.counts.received === 0,
      ),
    ).toBe(true);
    await db.$executeRawUnsafe(
      "CREATE FUNCTION p07_owned_sparse_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.notes='Sparse initial arrival' AND (SELECT count(*) FROM warehouse_receipt_groups)=200 THEN RAISE EXCEPTION 'controlled final sparse child' USING ERRCODE='23514'; END IF; RETURN NEW; END $$",
    );
    await db.$executeRawUnsafe(
      "CREATE CONSTRAINT TRIGGER p07_owned_sparse_fault AFTER INSERT ON warehouse_receipt_groups DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION p07_owned_sparse_fault()",
    );
    try {
      const started = performance.now();
      await expect(
        commands.execute({ actorId: fixture.actorId, body: fixture.body }),
      ).rejects.toThrow();
      const faultMs = performance.now() - started;
      expect(await graph(db)).toEqual(before);
      expect(await protectedFacts()).toEqual(beforeFacts);
      await recordTiming({
        case: "P07 sparse 200x200 rollback",
        executionThroughCommitMs: Math.round(faultMs),
      });
    } finally {
      await db.$executeRawUnsafe(
        "DROP TRIGGER p07_owned_sparse_fault ON warehouse_receipt_groups",
      );
      await db.$executeRawUnsafe("DROP FUNCTION p07_owned_sparse_fault()");
    }
    const started = performance.now();
    await commands.execute({ actorId: fixture.actorId, body: fixture.body });
    const elapsedMs = performance.now() - started;
    await recordTiming({
      case: "P07 sparse 200x200",
      setupMs: Math.round(fixture.setupMs),
      executionThroughCommitMs: Math.round(elapsedMs),
    });
    expect(elapsedMs).toBeLessThan(10000);
    expect(await protectedFacts()).toEqual(beforeFacts);
    expect(
      await db.warehouseReceiptPiece.count({
        where: { orderId: { in: fixture.orderIds } },
      }),
    ).toBe(200);
    expect(
      await db.warehouseReceiptGroup.count({
        where: { orderId: { in: fixture.orderIds } },
      }),
    ).toBe(200);
    const counts = await db.$queryRaw<
      {
        id: string;
        version: number;
        status: string;
        active: number;
        received: number;
      }[]
    >(
      Prisma.sql`SELECT d.id,d.version,h.status,count(*) FILTER(WHERE p.stage<>'CANCELLED')::int AS active,count(*) FILTER(WHERE p.stage<>'CANCELLED' AND p.received_at IS NOT NULL)::int AS received FROM sales_drafts d JOIN sales_orders h ON h.id=d.id JOIN sales_order_pieces p ON p.order_id=d.id WHERE d.id IN (${ids}) GROUP BY d.id,h.status`,
    );
    expect(counts).toHaveLength(200);
    for (const row of counts) {
      expect(row).toMatchObject({
        status: "APPROVED",
        active: 200,
        received: 1,
      });
      const group = fixture.body.orders.find(
        (order) => order.orderId === row.id,
      );
      expect(row.version).toBe((group?.expectedVersion ?? 0) + 1);
    }
    expect(
      await db.salesOrderPiece.count({
        where: {
          orderId: { in: fixture.orderIds },
          id: { notIn: fixture.selectedIds },
          receivedAt: null,
        },
      }),
    ).toBe(39800);
  });
});
