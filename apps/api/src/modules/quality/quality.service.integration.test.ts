import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient } from "@template/database";
import {
  qualityOrdersQuerySchema,
  qualityPiecesQuerySchema,
  qualityActivityQuerySchema,
  qualityOrderHistoryQuerySchema,
} from "@template/contracts";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { StaffService } from "../staff/staff.service.js";
import { QualityCommandExecutor } from "./quality-command-executor.js";
import { QualityService } from "./quality.service.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  service = new QualityService(db, new QualityCommandExecutor(db));
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const graph = async () => ({
  roots: await db.salesDraft.findMany({ orderBy: { id: "asc" } }),
  pieces: await db.salesOrderPiece.findMany({ orderBy: { id: "asc" } }),
  commands: await db.qualityCommand.findMany({ orderBy: { commandId: "asc" } }),
  visits: await db.qualityWorkVisit.findMany({ orderBy: { id: "asc" } }),
});
it("serves every protected read and delegates real execution and actor-private immutable recovery", async () => {
  const f = await createQualityFixture(db),
    pieceId = f.order.pieces[0]?.id;
  if (!pieceId) throw new Error("Owned member required");
  const dashboard = await service.dashboard(f.qualityA),
    orders = await service.listOrders(
      f.qualityA,
      qualityOrdersQuerySchema.parse({ view: "INCOMING" }),
    ),
    pieces = await service.listPieces(
      f.qualityB,
      qualityPiecesQuerySchema.parse({ view: "INCOMING" }),
    );
  expect(dashboard.counts.incoming).toEqual(orders.counts);
  expect(orders.counts.pieces).toBe(pieces.items.length);
  expect(
    (await service.getOrder(f.qualityB, f.order.id)).work.every(
      (context) => context.allowedActions.canReceiveAndStart,
    ),
  ).toBe(true);
  const saved = await service.execute(f.qualityA, {
    commandId: randomUUID(),
    operation: "RECEIVE_AND_START",
    orders: [
      { orderId: f.order.id, expectedVersion: f.version, pieceIds: [pieceId] },
    ],
  });
  expect(
    (await service.observe(f.qualityA, saved.receipt.commandId)).outcome,
  ).toEqual(saved.outcome);
  await expect(
    service.observe(f.qualityB, saved.receipt.commandId),
  ).rejects.toMatchObject({ code: "QUALITY_COMMAND_NOT_FOUND" });
  const activity = await service.activity(
      f.qualityB,
      qualityActivityQuerySchema.parse({}),
    ),
    history = await service.orderHistory(
      f.qualityB,
      f.order.id,
      qualityOrderHistoryQuerySchema.parse({ pieceId }),
    );
  expect(
    activity.events.some(
      (entry) =>
        entry.kind === "quality" &&
        entry.event.commandId === saved.receipt.commandId,
    ),
  ).toBe(true);
  expect(
    history.events.some(
      (entry) =>
        entry.kind === "quality" &&
        entry.event.commandId === saved.receipt.commandId,
    ),
  ).toBe(true);
  expect(
    (await service.getOrder(f.qualityB, f.order.id)).work.find(
      (context) => context.pieceId === pieceId,
    )?.allowedActions.canContinue,
  ).toBe(true);
  const before = await graph();
  await new StaffService(db).changeDepartment(f.approvalActorId, f.qualityA, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "CUTTING",
  });
  const denied = [
    () => service.dashboard(f.qualityA),
    () =>
      service.listOrders(
        f.qualityA,
        qualityOrdersQuerySchema.parse({ view: "INCOMING" }),
      ),
    () =>
      service.listPieces(
        f.qualityA,
        qualityPiecesQuerySchema.parse({ view: "INSPECTION" }),
      ),
    () => service.getOrder(f.qualityA, f.order.id),
    () => service.activity(f.qualityA, qualityActivityQuerySchema.parse({})),
    () =>
      service.orderHistory(
        f.qualityA,
        f.order.id,
        qualityOrderHistoryQuerySchema.parse({}),
      ),
    () => service.observe(f.qualityA, saved.receipt.commandId),
    () =>
      service.execute(f.qualityA, {
        commandId: randomUUID(),
        operation: "CONTINUE",
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: saved.outcome.orders[0]?.afterVersion ?? 0,
            pieceIds: [pieceId],
          },
        ],
      }),
  ];
  for (const operation of denied)
    await expect(operation()).rejects.toMatchObject({
      code: "DEPARTMENT_ACCESS_DENIED",
    });
  await new StaffService(db).suspendStaff(f.approvalActorId, f.qualityB, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
  });
  await expect(service.dashboard(f.qualityB)).rejects.toMatchObject({
    code: "ACCOUNT_RESTRICTED",
  });
  expect(await graph()).toEqual(before);
});
it("rechecks current authority after a queued withdrawal conflicts with the repeatable read snapshot", async () => {
  const f = await createQualityFixture(db),
    blocker = createDatabaseClient(uri),
    before = await graph();
  let release: () => void = () => {
      throw new Error("Owned gate unavailable");
    },
    signal: () => void = () => {
      throw new Error("Owned signal unavailable");
    };
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      signal = resolve;
    });
  const pending: Promise<unknown>[] = [];
  const blocking = blocker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${f.qualityA}::uuid FOR UPDATE`;
      signal();
      await gate;
    },
    { timeout: 10000 },
  );
  const waitForQueued = async (count: number) => {
    const deadline = Date.now() + 3000;
    for (;;) {
      const [row] = await db.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%users%'`;
      if (row !== undefined && row.count >= count) return;
      if (Date.now() > deadline)
        throw new Error("Owned authority lock barrier was not reached");
    }
  };
  try {
    await locked;
    const changed = Promise.allSettled([
      new StaffService(db).changeDepartment(f.approvalActorId, f.qualityA, {
        commandId: randomUUID(),
        expectedAccessVersion: 1,
        department: "PRODUCTION",
      }),
    ]);
    pending.push(changed);
    await waitForQueued(1);
    const read = service.dashboard(f.qualityA).then(
      (projection) => ({ kind: "success" as const, projection }),
      (error: unknown) => ({ kind: "failure" as const, error }),
    );
    pending.push(read);
    await waitForQueued(2);
    release();
    await blocking;
    expect(await changed).toMatchObject([{ status: "fulfilled" }]);
    const observed = await read;
    expect(observed).toMatchObject({
      kind: "failure",
      error: { code: "DEPARTMENT_ACCESS_DENIED" },
    });
    expect(await graph()).toEqual(before);
  } finally {
    release();
    await blocking;
    await Promise.allSettled(pending);
    await blocker.$disconnect();
  }
});

it("returns the named read lock-timeout conflict without changing any domain row", async () => {
  const f = await createQualityFixture(db),
    before = await graph(),
    blocker = createDatabaseClient(uri);
  let release: () => void = () => {
      throw new Error("Owned gate unavailable");
    },
    signal: () => void = () => {
      throw new Error("Owned signal unavailable");
    };
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      signal = resolve;
    });
  const blocking = blocker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${f.qualityA}::uuid FOR UPDATE`;
      signal();
      await gate;
    },
    { timeout: 10000 },
  );
  try {
    await locked;
    await expect(service.dashboard(f.qualityA)).rejects.toMatchObject({
      code: "QUALITY_TRANSACTION_CONFLICT",
    });
    expect(await graph()).toEqual(before);
  } finally {
    release();
    await blocking;
    await blocker.$disconnect();
  }
});
