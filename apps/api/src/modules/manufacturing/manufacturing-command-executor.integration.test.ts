import { StaffService } from "../staff/staff.service.js";
import { ApprovalService } from "../approval/approval.service.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { randomUUID } from "node:crypto";
import type {
  ManufacturingCommandBody,
  ManufacturingDepartment,
} from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  appendManufacturingOrder,
  createManufacturingFixture,
} from "../../test-support/manufacturing.fixture.js";
import { createP05LegacyUpgradeFixture } from "../../test-support/p05-legacy-upgrade.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { ManufacturingCommandExecutor } from "./manufacturing-command-executor.js";

const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Expected owned fixture value");
  return value;
};
const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  commands = new ManufacturingCommandExecutor(db);
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

const singleOrderWork = (
  executor: ManufacturingCommandExecutor,
  input: {
    actorId: string;
    department: ManufacturingDepartment;
    orderId: string;
    expectedVersion: number;
    pieceIds: string[];
    operation: ManufacturingCommandBody["operation"];
    commandId?: string;
  },
) =>
  executor.execute({
    actorId: input.actorId,
    department: input.department,
    body: {
      commandId: input.commandId ?? randomUUID(),
      operation: input.operation,
      orders: [
        {
          orderId: input.orderId,
          expectedVersion: input.expectedVersion,
          pieceIds: input.pieceIds,
        },
      ],
    },
  });

const graph = async (orderIds: readonly string[]) => ({
  captures: await db.salesDraftPiece.findMany({
    where: { draftId: { in: [...orderIds] } },
    orderBy: { id: "asc" },
  }),
  references: await db.salesPieceCatalogSelection.findMany({
    where: { piece: { draftId: { in: [...orderIds] } } },
    orderBy: [{ pieceId: "asc" }, { field: "asc" }],
  }),
  sales: await db.salesCommand.findMany({
    where: { draftId: { in: [...orderIds] } },
    orderBy: { commandId: "asc" },
  }),

  roots: await db.salesDraft.findMany({
    where: { id: { in: [...orderIds] } },
    orderBy: { id: "asc" },
  }),
  headers: await db.salesOrder.findMany({
    where: { id: { in: [...orderIds] } },
    orderBy: { id: "asc" },
  }),
  pieces: await db.salesOrderPiece.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: { id: "asc" },
  }),
  visits: await db.manufacturingWorkVisit.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: [{ pieceId: "asc" }, { sequence: "asc" }],
  }),
  orders: await db.manufacturingCommandOrder.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: [{ orderId: "asc" }, { afterVersion: "asc" }],
  }),
  commands: await db.manufacturingCommand.findMany({
    where: { orders: { some: { orderId: { in: [...orderIds] } } } },
    orderBy: { commandId: "asc" },
  }),
  events: await db.manufacturingPieceEvent.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: { id: "asc" },
  }),
  issues: await db.manufacturingIssue.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: { id: "asc" },
  }),
  approval: await db.approvalCommand.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: [{ orderId: "asc" }, { afterVersion: "asc" }],
  }),
});

it("starts exact pieces, lets colleagues continue and complete, and observes original results after all cutting work leaves", async () => {
  const fixture = await createManufacturingFixture(db),
    orderId = fixture.order.id;
  const p1 = fixture.order.pieces[0]?.id,
    p2 = fixture.order.pieces[1]?.id;
  if (!p1 || !p2) throw new Error("Expected exact physical pieces");
  const headerBefore = await db.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  const commandId = randomUUID();
  const start = await singleOrderWork(commands, {
    actorId: fixture.cuttingA,
    department: "CUTTING",
    orderId,
    expectedVersion: 2,
    pieceIds: [p1, p2],
    operation: "RECEIVE_AND_START",
    commandId,
  });
  expect(start.receipt.actor.id).toBe(fixture.cuttingA);
  const original = await db.manufacturingWorkVisit.findFirstOrThrow({
    where: { pieceId: p1, endedAt: null },
  });
  const companion = await db.manufacturingWorkVisit.findFirstOrThrow({
    where: { pieceId: p2, endedAt: null },
  });
  expect(original).toMatchObject({
    receivedCommandId: commandId,
    startedCommandId: commandId,
    receivedAt: new Date(start.receipt.occurredAt),
    startedAt: new Date(start.receipt.occurredAt),
  });
  const continued = await singleOrderWork(commands, {
    actorId: fixture.cuttingB,
    department: "CUTTING",
    orderId,
    expectedVersion: 3,
    pieceIds: [p1],
    operation: "CONTINUE",
  });
  expect(continued.receipt.actor.id).toBe(fixture.cuttingB);
  const beforeUnchanged = await graph([orderId]);
  await expect(
    singleOrderWork(commands, {
      actorId: fixture.cuttingB,
      department: "CUTTING",
      orderId,
      expectedVersion: 4,
      pieceIds: [p1],
      operation: "CONTINUE",
    }),
  ).rejects.toMatchObject({ code: "MANUFACTURING_WORK_UNCHANGED" });
  expect(await graph([orderId])).toEqual(beforeUnchanged);
  expect(
    await commands.observe(fixture.cuttingB, continued.receipt.commandId),
  ).toEqual({ ...continued, replayed: true });
  await singleOrderWork(commands, {
    actorId: fixture.cuttingA,
    department: "CUTTING",
    orderId,
    expectedVersion: 4,
    pieceIds: [p1],
    operation: "CONTINUE",
  });
  const completed = await singleOrderWork(commands, {
    actorId: fixture.cuttingB,
    department: "CUTTING",
    orderId,
    expectedVersion: 5,
    pieceIds: [p1],
    operation: "COMPLETE_TRANSFER",
  });
  const ended = await db.manufacturingWorkVisit.findUniqueOrThrow({
    where: { id: original.id },
  });
  expect(ended).toMatchObject({
    receivedAt: original.receivedAt,
    receivedCommandId: original.receivedCommandId,
    startedAt: original.startedAt,
    startedCommandId: original.startedCommandId,
    endManufacturingCommandId: completed.receipt.commandId,
    endReason: "TRANSFERRED",
    destination: "PRODUCTION",
  });
  expect(
    await db.manufacturingWorkVisit.findUniqueOrThrow({
      where: { id: companion.id },
    }),
  ).toEqual(companion);
  const productionVisit = await db.manufacturingWorkVisit.findFirstOrThrow({
    where: { pieceId: p1, endedAt: null },
  });
  expect(productionVisit).toMatchObject({
    department: "PRODUCTION",
    sequence: 2,
    originKind: "DEPARTMENT_TRANSFER",
    startedAt: null,
    receivedAt: null,
  });
  expect(completed.outcome.orders[0]?.pieces[0]).toMatchObject({
    pieceId: p1,
    visitId: original.id,
    nextVisitId: productionVisit.id,
    stage: "PRODUCTION",
    workState: "INCOMING",
  });
  await singleOrderWork(commands, {
    actorId: fixture.productionA,
    department: "PRODUCTION",
    orderId,
    expectedVersion: 6,
    pieceIds: [p1],
    operation: "RECEIVE_AND_START",
  });
  await singleOrderWork(commands, {
    actorId: fixture.productionB,
    department: "PRODUCTION",
    orderId,
    expectedVersion: 7,
    pieceIds: [p1],
    operation: "COMPLETE_TRANSFER",
  });
  expect(
    await db.salesOrderPiece.findUniqueOrThrow({ where: { id: p1 } }),
  ).toMatchObject({
    stage: "QUALITY",
    workState: "INCOMING",
    receivedAt: null,
    currentWorkVisitId: null,
  });
  expect(
    await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } }),
  ).toMatchObject({ status: "APPROVED" });
  await singleOrderWork(commands, {
    actorId: fixture.cuttingB,
    department: "CUTTING",
    orderId,
    expectedVersion: 8,
    pieceIds: [p2],
    operation: "COMPLETE_TRANSFER",
  });
  expect(await commands.observe(fixture.cuttingA, commandId)).toEqual({
    ...start,
    replayed: true,
  });
  expect(
    await singleOrderWork(commands, {
      actorId: fixture.cuttingA,
      department: "CUTTING",
      orderId,
      expectedVersion: 2,
      pieceIds: [p2, p1],
      operation: "RECEIVE_AND_START",
      commandId,
    }),
  ).toEqual({ ...start, replayed: true });
  expect(
    await db.salesOrder.findUniqueOrThrow({ where: { id: orderId } }),
  ).toEqual(headerBefore);
  await expect(
    commands.observe(fixture.cuttingB, commandId),
  ).rejects.toMatchObject({ code: "MANUFACTURING_COMMAND_NOT_FOUND" });
});

it("rejects a wrong department or stale root before any work, receipt or history changes", async () => {
  const fixture = await createManufacturingFixture(db),
    pieceId = fixture.order.pieces[0]?.id;
  if (!pieceId) throw new Error("Expected exact piece");
  const before = await graph([fixture.order.id]);
  await expect(
    singleOrderWork(commands, {
      actorId: fixture.productionA,
      department: "CUTTING",
      orderId: fixture.order.id,
      expectedVersion: 2,
      pieceIds: [pieceId],
      operation: "RECEIVE_AND_START",
    }),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await expect(
    singleOrderWork(commands, {
      actorId: fixture.cuttingA,
      department: "CUTTING",
      orderId: fixture.order.id,
      expectedVersion: 1,
      pieceIds: [pieceId],
      operation: "RECEIVE_AND_START",
    }),
  ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  expect(await graph([fixture.order.id])).toEqual(before);
});

it("continues and completes genuine migrated unknown-start work without fabricating a starter or resetting its origin", async () => {
  const fixture = await createP05LegacyUpgradeFixture("PRE_P04_APPROVED");
  try {
    const executor = new ManufacturingCommandExecutor(fixture.database),
      pieceId = fixture.pieceIds[0];
    if (!pieceId) throw new Error("Expected legacy piece");
    const original =
      await fixture.database.manufacturingWorkVisit.findFirstOrThrow({
        where: { pieceId },
      });
    expect(original).toMatchObject({
      originKind: "LEGACY_BASELINE",
      legacyUnknownStart: true,
      enteredAt: null,
      receivedAt: null,
      startedAt: null,
    });
    const continued = await singleOrderWork(executor, {
      actorId: fixture.approvalActorId,
      department: "CUTTING",
      orderId: fixture.orderId,
      expectedVersion: 1,
      pieceIds: [pieceId],
      operation: "CONTINUE",
    });
    await singleOrderWork(executor, {
      actorId: fixture.approvalActorId,
      department: "CUTTING",
      orderId: fixture.orderId,
      expectedVersion: 2,
      pieceIds: [pieceId],
      operation: "COMPLETE_TRANSFER",
    });
    expect(
      await fixture.database.manufacturingWorkVisit.findUniqueOrThrow({
        where: { id: original.id },
      }),
    ).toMatchObject({
      originKind: original.originKind,
      legacyUnknownStart: true,
      receivedAt: null,
      startedAt: null,
      receivedCommandId: null,
      startedCommandId: null,
      endReason: "TRANSFERRED",
    });
    expect(
      await executor.observe(
        fixture.approvalActorId,
        continued.receipt.commandId,
      ),
    ).toEqual({ ...continued, replayed: true });
  } finally {
    await fixture.dispose();
  }
});

it("rejects a whole cross-order selection and rolls back immediate and deferred failures before retaining one reordered receipt", async () => {
  const f = await createManufacturingFixture(db),
    second = await appendManufacturingOrder(db, f);
  const ids = [f.order.id, second.id],
    selected = [f.order, second].map((order) => ({
      orderId: order.id,
      expectedVersion: 2,
      pieceIds: order.pieces.map((p) => p.id),
    }));
  const body: ManufacturingCommandBody = {
    commandId: randomUUID(),
    operation: "RECEIVE_AND_START",
    orders: selected,
  };
  const run = (value: ManufacturingCommandBody) =>
    commands.execute({
      actorId: f.cuttingA,
      department: "CUTTING",
      body: value,
    });
  const before = await graph(ids);
  for (const orders of [
    [required(selected[0]), { ...required(selected[1]), expectedVersion: 1 }],
    [
      required(selected[0]),
      { ...required(selected[1]), pieceIds: [randomUUID()] },
    ],
    [
      required(selected[0]),
      {
        ...required(selected[1]),
        pieceIds: [required(required(selected[0]).pieceIds[0])],
      },
    ],
    [
      required(selected[0]),
      {
        ...required(selected[1]),
        pieceIds: [
          required(second.pieces[0]).id,
          required(second.pieces[0]).id,
        ],
      },
    ],
    [
      required(selected[0]),
      {
        ...required(selected[1]),
        pieceIds: Array.from({ length: 201 }, () => randomUUID()),
      },
    ],
  ]) {
    await expect(run({ ...body, orders })).rejects.toBeDefined();
    expect(await graph(ids)).toEqual(before);
  }
  const lastOrder = required(
    [...selected].sort((a, b) => a.orderId.localeCompare(b.orderId)).at(-1),
  );
  const last = required(lastOrder.pieceIds.at(-1));
  for (const fault of ["immediate", "deferred", "corrupt-graph"] as const) {
    await db.$executeRawUnsafe(
      fault === "corrupt-graph"
        ? `CREATE FUNCTION p05_owned_event_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.piece_id='${last}'::uuid THEN NEW.before_work_state := 'IN_PROGRESS'; END IF; RETURN NEW; END $$`
        : `CREATE FUNCTION p05_owned_event_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.piece_id='${last}'::uuid THEN RAISE EXCEPTION 'Owned event failure'; END IF; RETURN NEW; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        fault === "deferred"
          ? "CREATE CONSTRAINT TRIGGER p05_owned_event_fault AFTER INSERT ON manufacturing_piece_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION p05_owned_event_fault()"
          : "CREATE TRIGGER p05_owned_event_fault BEFORE INSERT ON manufacturing_piece_events FOR EACH ROW EXECUTE FUNCTION p05_owned_event_fault()",
      );
      await expect(run(body)).rejects.toThrow(
        fault === "corrupt-graph"
          ? "Command events do not match exact intent"
          : "Owned event failure",
      );
      expect(await graph(ids)).toEqual(before);
      expect(
        await db.manufacturingCommand.count({
          where: { commandId: body.commandId },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        "DROP TRIGGER IF EXISTS p05_owned_event_fault ON manufacturing_piece_events",
      );
      await db.$executeRawUnsafe("DROP FUNCTION p05_owned_event_fault()");
    }
  }
  const accepted = await run(body);
  expect(accepted.outcome.orders.map((o) => o.afterVersion)).toEqual([3, 3]);
  const after = await graph(ids);
  expect(after.commands).toHaveLength(1);
  expect(after.events).toHaveLength(4);
  expect(
    await run({
      ...body,
      orders: [...selected]
        .reverse()
        .map((o) => ({ ...o, pieceIds: [...o.pieceIds].reverse() })),
    }),
  ).toEqual({ ...accepted, replayed: true });
  await expect(
    run({ ...body, operation: "COMPLETE_TRANSFER" }),
  ).rejects.toMatchObject({ code: "MANUFACTURING_COMMAND_CONFLICT" });
  expect(await graph(ids)).toEqual(after);
  await expect(
    commands.observe(f.cuttingA, randomUUID()),
  ).rejects.toMatchObject({ code: "MANUFACTURING_COMMAND_NOT_FOUND" });
});

// Independent clients wait behind a held PostgreSQL root/account/advisory lock;
// querying pg_locks proves overlap rather than depending on wall-clock sleeps.
const contend = async (
  kind: "root" | "actor" | "advisory",
  id: string,
  start: () => Array<Promise<unknown>> | Promise<Array<Promise<unknown>>>,
  minimumWaiters = 2,
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
      if (kind === "root")
        await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${id}::uuid FOR UPDATE`;
      else if (kind === "actor")
        await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(505011::bigint)`;
      entered();
      await hold;
    },
    { timeout: 10000 },
  );
  let requests: Array<Promise<unknown>> = [],
    settled: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await inside;
    requests = await start();
    settled = Promise.allSettled(requests);
    let observed = false;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((row?.count ?? 0) >= minimumWaiters) {
        observed = true;
        break;
      }
    }
    expect(observed).toBe(true);
    release();
    await gate;
    return await settled;
  } finally {
    release();
    await Promise.allSettled([gate, ...requests]);
    await blocker.$disconnect();
  }
};

it.each(["same-key", "same-piece", "disjoint"] as const)(
  "serializes %s starts on independent transactions without losing a companion",
  async (mode) => {
    const f = await createManufacturingFixture(db),
      second = createDatabaseClient(uri),
      other = new ManufacturingCommandExecutor(second);
    const [p1, p2] = f.order.pieces.map((p) => p.id);
    if (!p1 || !p2) throw new Error("Two pieces required");
    const input = {
      actorId: f.cuttingA,
      department: "CUTTING" as const,
      orderId: f.order.id,
      expectedVersion: 2,
      pieceIds: [p1],
      operation: "RECEIVE_AND_START" as const,
      commandId: randomUUID(),
    };
    try {
      const results = await contend("root", f.order.id, () => [
        singleOrderWork(commands, input),
        singleOrderWork(other, {
          ...input,
          actorId: mode === "same-key" ? f.cuttingA : f.cuttingB,
          commandId: mode === "same-key" ? input.commandId : randomUUID(),
          pieceIds: [mode === "disjoint" ? p2 : p1],
        }),
      ]);
      const good = results.filter((r) => r.status === "fulfilled"),
        bad = results.filter((r) => r.status === "rejected");
      expect(good).toHaveLength(mode === "same-key" ? 2 : 1);
      expect(bad).toHaveLength(mode === "same-key" ? 0 : 1);
      if (mode === "same-key")
        expect(good.map((r) => r.value)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ replayed: true }),
            expect.objectContaining({ replayed: false }),
          ]),
        );
      else
        expect(bad[0]?.reason).toMatchObject({
          code: "ORDER_VERSION_CONFLICT",
        });
      const after = await graph([f.order.id]);
      expect(after.commands).toHaveLength(1);
      expect(after.events).toHaveLength(1);
      expect(after.roots[0]?.version).toBe(3);
      expect(
        after.pieces.filter((p) => p.workState === "IN_PROGRESS"),
      ).toHaveLength(1);
      if (mode === "disjoint") {
        const untouched = after.pieces.find((p) => p.workState === "INCOMING");
        if (!untouched) throw new Error("Companion required");
        await singleOrderWork(other, {
          ...input,
          actorId: f.cuttingB,
          expectedVersion: 3,
          pieceIds: [untouched.id],
          commandId: randomUUID(),
        });
        expect(
          (await graph([f.order.id])).pieces.every(
            (p) => p.workState === "IN_PROGRESS",
          ),
        ).toBe(true);
      }
    } finally {
      await second.$disconnect();
    }
  },
);

it("serializes colleague completion against real P04 reporting without transferred-and-held work", async () => {
  const f = await createManufacturingFixture(db),
    pieceId = required(f.order.pieces[0]).id,
    other = createDatabaseClient(uri);
  const approval = new ApprovalService(
    other,
    new ApprovalCommandExecutor(other),
    "UTC",
  );
  await singleOrderWork(commands, {
    actorId: f.cuttingA,
    department: "CUTTING",
    orderId: f.order.id,
    expectedVersion: 2,
    pieceIds: [pieceId],
    operation: "RECEIVE_AND_START",
  });
  try {
    const outcomes = await contend("root", f.order.id, () => [
      singleOrderWork(commands, {
        actorId: f.cuttingB,
        department: "CUTTING",
        orderId: f.order.id,
        expectedVersion: 3,
        pieceIds: [pieceId],
        operation: "COMPLETE_TRANSFER",
      }),
      approval.reportIssue(f.cuttingA, f.order.id, pieceId, {
        commandId: randomUUID(),
        expectedVersion: 3,
        reason: "Actual competing report",
        notes: null,
      }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      outcomes.filter((r) => r.status === "rejected")[0]?.reason,
    ).toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
    const state = await graph([f.order.id]),
      piece = state.pieces.find((p) => p.id === pieceId),
      visit = state.visits.find(
        (v) => v.pieceId === pieceId && v.sequence === 1,
      );
    expect(state.roots[0]?.version).toBe(4);
    expect(visit?.startedCommandId).toBe(
      state.commands.find((c) => c.operation === "RECEIVE_AND_START")
        ?.commandId,
    );
    if (piece?.stage === "PRODUCTION") {
      expect(piece.issueId).toBeNull();
      expect(state.issues).toEqual([]);
      expect(visit?.endReason).toBe("TRANSFERRED");
    } else {
      expect(piece?.workState).toBe("BLOCKED");
      expect(piece?.currentWorkVisitId).toBeNull();
      expect(state.issues).toHaveLength(1);
      expect(visit?.endReason).toBe("ISSUE_REPORTED");
    }
  } finally {
    await other.$disconnect();
  }
});

it.each(["suspend", "reassign"] as const)(
  "serializes %s with current work authority and denies original recovery afterward",
  async (action) => {
    const f = await createManufacturingFixture(db),
      other = createDatabaseClient(uri),
      staff = new StaffService(other),
      pieceId = required(f.order.pieces[0]).id;
    const commandId = randomUUID();
    try {
      const outcomes = await contend("actor", f.cuttingA, () => [
        singleOrderWork(commands, {
          actorId: f.cuttingA,
          department: "CUTTING",
          orderId: f.order.id,
          expectedVersion: 2,
          pieceIds: [pieceId],
          operation: "RECEIVE_AND_START",
          commandId,
        }),
        action === "suspend"
          ? staff.suspendStaff(f.approvalActorId, f.cuttingA, {
              commandId: randomUUID(),
              expectedAccessVersion: 1,
            })
          : staff.changeDepartment(f.approvalActorId, f.cuttingA, {
              commandId: randomUUID(),
              expectedAccessVersion: 1,
              department: "PRODUCTION",
            }),
      ]);
      expect(outcomes[1]?.status).toBe("fulfilled");
      if (outcomes[0]?.status === "rejected")
        expect(outcomes[0].reason).toMatchObject({
          code:
            action === "suspend"
              ? "ACCOUNT_RESTRICTED"
              : "DEPARTMENT_ACCESS_DENIED",
        });
      const after = await graph([f.order.id]);
      expect(after.events).toHaveLength(
        outcomes[0]?.status === "fulfilled" ? 1 : 0,
      );
      expect(after.roots[0]?.version).toBe(
        outcomes[0]?.status === "fulfilled" ? 3 : 2,
      );
      await expect(
        commands.observe(f.cuttingA, commandId),
      ).rejects.toMatchObject({
        code:
          action === "suspend"
            ? "ACCOUNT_RESTRICTED"
            : "DEPARTMENT_ACCESS_DENIED",
      });
    } finally {
      await other.$disconnect();
    }
  },
);

it("waits for an uncommitted same-key result before observer recovery", async () => {
  const f = await createManufacturingFixture(db),
    other = createDatabaseClient(uri),
    observer = new ManufacturingCommandExecutor(other),
    commandId = randomUUID();
  let pendingWriter: Promise<unknown> | undefined;
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p05_owned_event_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(505011::bigint); RETURN NEW; END $$",
  );
  try {
    await db.$executeRawUnsafe(
      "CREATE TRIGGER p05_owned_event_gate BEFORE INSERT ON manufacturing_piece_events FOR EACH ROW EXECUTE FUNCTION p05_owned_event_gate()",
    );
    const results = await contend("advisory", "", async () => {
      const writer = singleOrderWork(commands, {
        actorId: f.cuttingA,
        department: "CUTTING",
        orderId: f.order.id,
        expectedVersion: 2,
        pieceIds: [required(f.order.pieces[0]).id],
        operation: "RECEIVE_AND_START",
        commandId,
      });
      pendingWriter = writer;
      // Attach rejection handling before observing the writer's actual trigger lock wait.
      void writer.catch(() => {});
      let waiting = false;
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const [row] = await db.$queryRaw<
          Array<{ waiting: boolean }>
        >`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted) AS waiting`;
        if (row?.waiting) {
          waiting = true;
          break;
        }
      }
      expect(waiting).toBe(true);
      return [writer, observer.observe(f.cuttingA, commandId)];
    });
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    const recovered = await observer.observe(f.cuttingA, commandId);
    expect(recovered.replayed).toBe(true);
    expect(recovered.receipt.commandId).toBe(commandId);
    expect((await graph([f.order.id])).commands).toHaveLength(1);
  } finally {
    await Promise.allSettled(
      pendingWriter === undefined ? [] : [pendingWriter],
    );
    await db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS p05_owned_event_gate ON manufacturing_piece_events",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p05_owned_event_gate()");
    await other.$disconnect();
  }
});

it("accepts the declared 200-piece transaction budget without splitting a confirmation", async () => {
  const f = await createManufacturingFixture(db),
    order = await appendManufacturingOrder(db, f, 200);
  const result = await singleOrderWork(commands, {
    actorId: f.cuttingA,
    department: "CUTTING",
    orderId: order.id,
    expectedVersion: 2,
    pieceIds: order.pieces.map((p) => p.id),
    operation: "RECEIVE_AND_START",
  });
  expect(result.outcome.orders).toHaveLength(1);
  expect(result.outcome.orders[0]?.pieces).toHaveLength(200);
  expect(
    await db.manufacturingPieceEvent.count({
      where: { commandId: result.receipt.commandId },
    }),
  ).toBe(200);
  expect(
    (await db.salesDraft.findUniqueOrThrow({ where: { id: order.id } }))
      .version,
  ).toBe(3);
});

it.each(["RETURN_TO_DEPARTMENT", "CANCEL"] as const)(
  "serializes completion with a real %s decision on a held companion",
  async (decision) => {
    const f = await createManufacturingFixture(db),
      [p1, p2] = f.order.pieces.map((p) => p.id);
    if (!p1 || !p2) throw new Error("Two pieces required");
    const start = await singleOrderWork(commands, {
      actorId: f.cuttingA,
      department: "CUTTING",
      orderId: f.order.id,
      expectedVersion: 2,
      pieceIds: [p1],
      operation: "RECEIVE_AND_START",
    });
    const report = await f.approval.reportIssue(f.cuttingB, f.order.id, p2, {
      commandId: randomUUID(),
      expectedVersion: 3,
      reason: "Competing companion decision",
      notes: null,
    });
    const issueId = report.outcome.issueId;
    if (issueId === null) throw new Error("Issue required");
    const other = createDatabaseClient(uri),
      approval = new ApprovalService(
        other,
        new ApprovalCommandExecutor(other),
        "UTC",
      ),
      before = await graph([f.order.id]);
    try {
      const results = await contend("root", f.order.id, () => [
        singleOrderWork(commands, {
          actorId: f.cuttingB,
          department: "CUTTING",
          orderId: f.order.id,
          expectedVersion: 4,
          pieceIds: [p1],
          operation: "COMPLETE_TRANSFER",
        }),
        approval.resolveIssue(
          f.approvalActorId,
          f.order.id,
          p2,
          issueId,
          decision === "CANCEL"
            ? {
                commandId: randomUUID(),
                expectedVersion: 4,
                decision,
                reason: "Approved cancellation",
                confirmed: true,
              }
            : {
                commandId: randomUUID(),
                expectedVersion: 4,
                decision,
                target: "CUTTING",
                notes: "Approved retry",
              },
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        results.filter((r) => r.status === "rejected")[0]?.reason,
      ).toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
      const after = await graph([f.order.id]);
      expect(after.roots[0]?.version).toBe(5);
      expect(
        after.commands.filter((c) => c.operation === "COMPLETE_TRANSFER"),
      ).toHaveLength(results[0]?.status === "fulfilled" ? 1 : 0);
      const companion = after.pieces.find((p) => p.id === p2);
      if (results[0]?.status === "fulfilled")
        expect(companion).toEqual(before.pieces.find((p) => p.id === p2));
      else {
        expect(after.pieces.find((p) => p.id === p1)).toEqual(
          before.pieces.find((p) => p.id === p1),
        );
        expect(companion?.stage).toBe(
          decision === "CANCEL" ? "CANCELLED" : "CUTTING",
        );
        expect(companion?.issueId).toBeNull();
      }
      expect(
        await commands.observe(f.cuttingA, start.receipt.commandId),
      ).toEqual({ ...start, replayed: true });
    } finally {
      await other.$disconnect();
    }
  },
);

it("rejects held, cancelled and moved second-order pieces without changing a valid first order", async () => {
  const f = await createManufacturingFixture(db),
    second = await appendManufacturingOrder(db, f),
    firstPiece = required(second.pieces[0]).id;
  let pieceId = firstPiece;
  const rejectBatch = async () => {
    const ids = [f.order.id, second.id],
      before = await graph(ids),
      root = await db.salesDraft.findUniqueOrThrow({
        where: { id: second.id },
      });
    await expect(
      commands.execute({
        actorId: f.cuttingA,
        department: "CUTTING",
        body: {
          commandId: randomUUID(),
          operation: "RECEIVE_AND_START",
          orders: [
            {
              orderId: f.order.id,
              expectedVersion: 2,
              pieceIds: [required(f.order.pieces[0]).id],
            },
            {
              orderId: second.id,
              expectedVersion: root.version,
              pieceIds: [pieceId],
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "MANUFACTURING_SELECTION_CONFLICT" });
    expect(await graph(ids)).toEqual(before);
  };
  const report = await f.approval.reportIssue(f.cuttingB, second.id, pieceId, {
    commandId: randomUUID(),
    expectedVersion: 2,
    reason: "Held second order",
    notes: null,
  });
  if (report.outcome.issueId === null) throw new Error("Issue required");
  await rejectBatch();
  await f.approval.resolveIssue(
    f.approvalActorId,
    second.id,
    pieceId,
    report.outcome.issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "CANCEL",
      reason: "Cancelled second order",
      confirmed: true,
    },
  );
  await rejectBatch();
  pieceId = required(second.pieces[1]).id;
  await singleOrderWork(commands, {
    actorId: f.cuttingA,
    department: "CUTTING",
    orderId: second.id,
    expectedVersion: 4,
    pieceIds: [pieceId],
    operation: "RECEIVE_AND_START",
  });
  await singleOrderWork(commands, {
    actorId: f.cuttingB,
    department: "CUTTING",
    orderId: second.id,
    expectedVersion: 5,
    pieceIds: [pieceId],
    operation: "COMPLETE_TRANSFER",
  });
  await rejectBatch();
});

it("allows a separate root to finish while another root is held", async () => {
  const f = await createManufacturingFixture(db),
    second = await appendManufacturingOrder(db, f),
    other = createDatabaseClient(uri),
    executor = new ManufacturingCommandExecutor(other);
  let pending: Promise<unknown> | undefined;
  try {
    const outcomes = await contend(
      "root",
      f.order.id,
      async () => {
        pending = singleOrderWork(commands, {
          actorId: f.cuttingA,
          department: "CUTTING",
          orderId: f.order.id,
          expectedVersion: 2,
          pieceIds: [required(f.order.pieces[0]).id],
          operation: "RECEIVE_AND_START",
        });
        void pending.catch(() => {});
        const independent = await singleOrderWork(executor, {
          actorId: f.cuttingB,
          department: "CUTTING",
          orderId: second.id,
          expectedVersion: 2,
          pieceIds: [required(second.pieces[0]).id],
          operation: "RECEIVE_AND_START",
        });
        expect(independent.outcome.orders[0]?.afterVersion).toBe(3);
        expect(
          (await db.salesDraft.findUniqueOrThrow({ where: { id: f.order.id } }))
            .version,
        ).toBe(2);
        return [pending, Promise.resolve(independent)];
      },
      1,
    );
    expect(outcomes.map((o) => o.status)).toEqual(["fulfilled", "fulfilled"]);
    expect((await graph([f.order.id, second.id])).commands).toHaveLength(2);
  } finally {
    await Promise.allSettled(pending === undefined ? [] : [pending]);
    await other.$disconnect();
  }
});
