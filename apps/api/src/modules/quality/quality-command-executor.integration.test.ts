import { ManufacturingCommandExecutor } from "../manufacturing/manufacturing-command-executor.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient, Prisma } from "@template/database";
import {
  qualityCommandBodySchema,
  type QualityCommandBody,
} from "@template/contracts";
import {
  createQualityFixture,
  appendQualityOrder,
} from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { StaffService } from "../staff/staff.service.js";
import { QualityCommandExecutor } from "./quality-command-executor.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  commands = new QualityCommandExecutor(db);
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Expected fixture value");
  return value;
};
const version = async (orderId: string) =>
  (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    })
  ).version;
const work = async (
  actorId: string,
  orderId: string,
  pieceIds: string[],
  operation: "RECEIVE_AND_START" | "CONTINUE",
) =>
  commands.execute({
    actorId,
    body: {
      commandId: randomUUID(),
      operation,
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
    },
  });
const graph = () =>
  db.$queryRaw(Prisma.sql`SELECT jsonb_build_object(
 'roots',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_drafts r),
 'headers',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_orders r),
 'specifications',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_draft_pieces r),
 'pieces',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_order_pieces r),
 'approval',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM approval_commands r),
 'issues',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_issues r),
 'manufacturing',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM manufacturing_commands r),
 'manufacturingOrders',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,order_id) FROM manufacturing_command_orders r),
 'manufacturingEvents',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_piece_events r),
 'manufacturingVisits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_work_visits r),
 'quality',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM quality_commands r),
 'qualityOrders',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,order_id) FROM quality_command_orders r),
 'qualityVisits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_work_visits r),
 'qualityEvents',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_piece_events r),
 'corrections',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_correction_cycles r),
 'packing',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_packing_groups r),
 'packingPieces',(SELECT jsonb_agg(to_jsonb(r) ORDER BY group_id,piece_id) FROM quality_packing_pieces r),
 'reports',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,order_id,ordinal) FROM quality_approval_reports r)) AS graph`);

it("retains the original starter, colleague continuation and exact own-result recovery under current authority", async () => {
  const f = await createQualityFixture(db),
    ids = f.order.pieces.map((p) => p.id),
    p1 = required(ids[0]);
  const body: QualityCommandBody = {
    commandId: randomUUID(),
    operation: "RECEIVE_AND_START",
    orders: [
      { orderId: f.order.id, expectedVersion: f.version, pieceIds: ids },
    ],
  };
  const started = await commands.execute({ actorId: f.qualityA, body });
  expect(started.outcome.orders[0]).toMatchObject({
    beforeVersion: f.version,
    afterVersion: f.version + 1,
  });
  const visits = await db.qualityWorkVisit.findMany({
    where: { orderId: f.order.id },
    orderBy: { pieceId: "asc" },
  });
  expect(visits).toHaveLength(2);
  for (const visit of visits)
    expect(visit).toMatchObject({
      startedCommandId: body.commandId,
      startedAt: new Date(started.receipt.occurredAt),
      receivedAt: new Date(started.receipt.occurredAt),
      endedAt: null,
      legacyUnknownStart: false,
    });
  const continued = await work(f.qualityB, f.order.id, [p1], "CONTINUE");
  expect(continued.receipt.actor.id).toBe(f.qualityB);
  expect(
    await db.qualityWorkVisit.findMany({
      where: { orderId: f.order.id },
      orderBy: { pieceId: "asc" },
    }),
  ).toEqual(visits);
  expect(
    await db.qualityPieceEvent.count({ where: { orderId: f.order.id } }),
  ).toBe(3);
  const before = await graph();
  await expect(
    work(f.qualityB, f.order.id, [p1], "CONTINUE"),
  ).rejects.toMatchObject({ code: "QUALITY_WORK_UNCHANGED" });
  expect(await commands.execute({ actorId: f.qualityA, body })).toEqual({
    ...started,
    replayed: true,
  });
  expect(await commands.observe(f.qualityA, body.commandId)).toEqual({
    ...started,
    replayed: true,
  });
  await expect(
    commands.execute({
      actorId: f.qualityA,
      body: {
        ...body,
        orders: [{ ...required(body.orders[0]), pieceIds: [p1] }],
      },
    }),
  ).rejects.toMatchObject({ code: "QUALITY_COMMAND_CONFLICT" });
  await expect(
    commands.execute({ actorId: f.qualityB, body }),
  ).rejects.toMatchObject({ code: "QUALITY_COMMAND_CONFLICT" });
  await expect(
    commands.observe(f.qualityB, body.commandId),
  ).rejects.toMatchObject({ code: "QUALITY_COMMAND_NOT_FOUND" });
  expect(await graph()).toEqual(before);
  await new StaffService(db).changeDepartment(f.approvalActorId, f.qualityA, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "CUTTING",
  });
  const withdrawn = await graph();
  await expect(
    commands.observe(f.qualityA, body.commandId),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await expect(
    work(f.qualityA, f.order.id, [p1], "CONTINUE"),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  expect(await graph()).toEqual(withdrawn);
});
it("rejects duplicate, stale, foreign and held members as whole selections with unchanged persisted graphs", async () => {
  const f = await createQualityFixture(db),
    ids = f.order.pieces.map((p) => p.id),
    other = await appendQualityOrder(db, f),
    first = required(ids[0]);
  for (const selected of [
    [first, first],
    [first, required(other.pieces[0]).id],
  ]) {
    const before = await graph();
    await expect(
      commands.execute({
        actorId: f.qualityA,
        body: {
          commandId: randomUUID(),
          operation: "RECEIVE_AND_START",
          orders: [
            {
              orderId: f.order.id,
              expectedVersion: f.version,
              pieceIds: selected,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code:
        selected[0] === selected[1] ? "VALIDATION_ERROR" : "ORDER_NOT_FOUND",
    });
    expect(await graph()).toEqual(before);
  }
  const before = await graph();
  await expect(
    commands.execute({
      actorId: f.qualityA,
      body: {
        commandId: randomUUID(),
        operation: "RECEIVE_AND_START",
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: f.version - 1,
            pieceIds: ids,
          },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  expect(await graph()).toEqual(before);
  await f.approval.reportIssue(f.qualityA, f.order.id, required(ids[1]), {
    commandId: randomUUID(),
    expectedVersion: await version(f.order.id),
    reason: "Actual held quality member",
    notes: null,
  });
  const held = await graph();
  await expect(
    work(f.qualityA, f.order.id, ids, "RECEIVE_AND_START"),
  ).rejects.toMatchObject({ code: "QUALITY_SELECTION_CONFLICT" });
  expect(await graph()).toEqual(held);
});
it("accepts exact subsets with original carton text and later note-only inspection preserving prior packing", async () => {
  const f = await createQualityFixture(db),
    order = await appendQualityOrder(db, f, 3),
    ids = order.pieces.map((p) => p.id),
    p1 = required(ids[0]),
    p2 = required(ids[1]),
    p3 = required(ids[2]);
  await work(f.qualityA, order.id, ids, "RECEIVE_AND_START");
  const beforeHeader = await db.salesOrder.findUniqueOrThrow({
      where: { id: order.id },
    }),
    beforeTerms = await db.salesOrderPiece.findMany({
      where: { orderId: order.id },
      orderBy: { id: "asc" },
    });
  const body = qualityCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "INSPECT",
    orders: [
      {
        orderId: order.id,
        expectedVersion: await version(order.id),
        decisions: [
          { pieceId: p3, decision: "ACCEPT" },
          { pieceId: p1, decision: "ACCEPT" },
        ],
        inspectorNote: "Original inspection",
        packing: { cartonCount: "كرتونتين", cartonNumbers: "أ-١، ب-٢" },
      },
    ],
  });
  const accepted = await commands.execute({ actorId: f.qualityB, body });
  const packing = await db.qualityPackingGroup.findMany({
    where: { orderId: order.id },
    include: { pieces: { orderBy: { pieceId: "asc" } } },
  });
  expect(packing).toHaveLength(1);
  expect(packing[0]).toMatchObject({
    id: accepted.outcome.orders[0]?.packingGroupId,
    cartonCount: "كرتونتين",
    cartonNumbers: "أ-١، ب-٢",
  });
  expect(packing[0]?.pieces.map((p) => p.pieceId)).toEqual([p1, p3].sort());
  const after = await db.salesOrderPiece.findMany({
    where: { orderId: order.id },
    orderBy: { id: "asc" },
  });
  for (const piece of after) {
    const before = required(beforeTerms.find((p) => p.id === piece.id));
    expect(piece).toEqual(
      piece.id === p2
        ? before
        : { ...before, stage: "WAREHOUSE", workState: "INCOMING" },
    );
    expect(piece.receivedAt).toBeNull();
  }
  expect(
    await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
  ).toEqual(beforeHeader);
  await commands.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: order.id,
          expectedVersion: await version(order.id),
          decisions: [{ pieceId: p2, decision: "ACCEPT" }],
          inspectorNote: "Note without packing",
        },
      ],
    }),
  });
  expect(
    await db.qualityPackingGroup.findMany({
      where: { orderId: order.id },
      include: { pieces: { orderBy: { pieceId: "asc" } } },
    }),
  ).toEqual(packing);
  expect(
    (
      await db.qualityCommandOrder.findMany({
        where: { orderId: order.id },
        orderBy: { afterVersion: "desc" },
      })
    )[0],
  ).toMatchObject({ inspectorNote: "Note without packing" });
  expect(await commands.execute({ actorId: f.qualityB, body })).toEqual({
    ...accepted,
    replayed: true,
  });
});

const inspect = async (
  actorId: string,
  orderId: string,
  decisions: Array<
    | { pieceId: string; decision: "ACCEPT" }
    | {
        pieceId: string;
        decision: "REJECT";
        target: "CUTTING" | "PRODUCTION";
        reason: string;
        instructions: string;
      }
  >,
) =>
  commands.execute({
    actorId,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [{ orderId, expectedVersion: await version(orderId), decisions }],
    }),
  });
const correctionRoute = async (
  f: Awaited<ReturnType<typeof createQualityFixture>>,
  pieceId: string,
  target: "CUTTING" | "PRODUCTION",
) => {
  const manufacturing = new ManufacturingCommandExecutor(db);
  for (const department of target === "CUTTING"
    ? (["CUTTING", "PRODUCTION"] as const)
    : (["PRODUCTION"] as const)) {
    for (const operation of ["RECEIVE_AND_START", "COMPLETE_TRANSFER"] as const)
      await manufacturing.execute({
        actorId: department === "CUTTING" ? f.cuttingA : f.productionA,
        department,
        body: {
          commandId: randomUUID(),
          operation,
          orders: [
            {
              orderId: f.order.id,
              expectedVersion: await version(f.order.id),
              pieceIds: [pieceId],
            },
          ],
        },
      });
  }
};
it("produces both real correction routes, failed reinspection and a later accepted cycle without rewriting origins", async () => {
  const f = await createQualityFixture(db),
    [p1, p2] = f.order.pieces.map((p) => p.id);
  if (!p1 || !p2) throw new Error("Two pieces required");
  await work(f.qualityA, f.order.id, [p1, p2], "RECEIVE_AND_START");
  const rejected = await inspect(f.qualityB, f.order.id, [
    {
      pieceId: p1,
      decision: "REJECT",
      target: "CUTTING",
      reason: "Original cut",
      instructions: "Re-cut original",
    },
    {
      pieceId: p2,
      decision: "REJECT",
      target: "PRODUCTION",
      reason: "Original production",
      instructions: "Rebuild original",
    },
  ]);
  const initial = await db.qualityCorrectionCycle.findMany({
    where: { orderId: f.order.id },
    orderBy: { pieceId: "asc" },
  });
  expect(initial).toHaveLength(2);
  for (const cycle of initial) {
    expect(cycle).toMatchObject({ cycle: 1, state: "OPEN" });
    const visit = await db.manufacturingWorkVisit.findFirstOrThrow({
      where: { pieceId: cycle.pieceId, originKind: "QUALITY_CORRECTION" },
    });
    expect(visit).toMatchObject({
      sourceReferenceId: cycle.id,
      sourceCorrectionCycle: 1,
      sourceOrderVersion: rejected.outcome.orders[0]?.afterVersion,
      instructions: cycle.instructions,
      department: cycle.target,
    });
  }
  await correctionRoute(f, p1, "CUTTING");
  await correctionRoute(f, p2, "PRODUCTION");
  await work(f.qualityA, f.order.id, [p1, p2], "RECEIVE_AND_START");
  const reinspected = await inspect(f.qualityB, f.order.id, [
    {
      pieceId: p1,
      decision: "REJECT",
      target: "PRODUCTION",
      reason: "Still wrong",
      instructions: "Rebuild again",
    },
    { pieceId: p2, decision: "ACCEPT" },
  ]);
  const prior = await db.qualityCorrectionCycle.findMany({
    where: { orderId: f.order.id, cycle: 1 },
    orderBy: { pieceId: "asc" },
  });
  for (const cycle of prior) {
    const original = required(initial.find((c) => c.id === cycle.id));
    expect(cycle).toMatchObject({
      ...original,
      state: cycle.pieceId === p1 ? "REJECTED" : "ACCEPTED",
      resolvedAt: new Date(reinspected.receipt.occurredAt),
      resolutionQualityEventId: (
        await db.qualityPieceEvent.findFirstOrThrow({
          where: {
            commandId: reinspected.receipt.commandId,
            pieceId: cycle.pieceId,
          },
        })
      ).id,
    });
  }
  const next = await db.qualityCorrectionCycle.findFirstOrThrow({
    where: { pieceId: p1, state: "OPEN" },
  });
  expect(next).toMatchObject({
    cycle: 2,
    target: "PRODUCTION",
    reason: "Still wrong",
  });
  await correctionRoute(f, p1, "PRODUCTION");
  await work(f.qualityA, f.order.id, [p1], "RECEIVE_AND_START");
  await inspect(f.qualityB, f.order.id, [{ pieceId: p1, decision: "ACCEPT" }]);
  expect(
    await db.qualityCorrectionCycle.count({
      where: { orderId: f.order.id, state: "OPEN" },
    }),
  ).toBe(0);
  expect(
    await db.qualityCorrectionCycle.findUniqueOrThrow({
      where: { id: next.id },
    }),
  ).toMatchObject({ state: "ACCEPTED", cycle: 2 });
  expect(await db.qualityWorkVisit.count({ where: { pieceId: p1 } })).toBe(3);
  expect(await db.qualityWorkVisit.count({ where: { pieceId: p2 } })).toBe(2);
  for (const piece of await db.salesOrderPiece.findMany({
    where: { orderId: f.order.id },
  }))
    expect(piece).toMatchObject({
      stage: "WAREHOUSE",
      workState: "INCOMING",
      receivedAt: null,
      currentWorkVisitId: null,
    });
});
it("groups real P04 children into one multi-order report with exact contiguous per-order +N versions", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f),
    ids = f.order.pieces.map((p) => p.id),
    otherId = required(other.pieces[0]).id;
  await work(f.qualityA, f.order.id, [required(ids[0])], "RECEIVE_AND_START");
  const versions = new Map([
      [f.order.id, await version(f.order.id)],
      [other.id, await version(other.id)],
    ]),
    commandId = randomUUID();
  const body = qualityCommandBodySchema.parse({
    commandId,
    operation: "REPORT_ISSUES",
    orders: [
      {
        orderId: other.id,
        expectedVersion: versions.get(other.id),
        pieceIds: [otherId],
      },
      {
        orderId: f.order.id,
        expectedVersion: versions.get(f.order.id),
        pieceIds: ids,
      },
    ],
    reason: "Actual common quality issue",
    notes: "Report note",
  });
  const saved = await commands.execute({ actorId: f.qualityB, body });
  for (const group of saved.outcome.orders) {
    expect(group.beforeVersion).toBe(versions.get(group.orderId));
    expect(group.afterVersion).toBe(group.beforeVersion + group.pieces.length);
    expect(await version(group.orderId)).toBe(group.afterVersion);
    const children = await db.qualityApprovalReport.findMany({
      where: { commandId, orderId: group.orderId },
      orderBy: { ordinal: "asc" },
      include: { approvalCommand: true },
    });
    expect(children.map((c) => c.pieceId)).toEqual(
      group.pieces.map((p) => p.pieceId),
    );
    for (const [index, child] of children.entries())
      expect(child.approvalCommand).toMatchObject({
        operation: "REPORT_ISSUE",
        beforeVersion: group.beforeVersion + index,
        afterVersion: group.beforeVersion + index + 1,
        actorId: f.qualityB,
        occurredAt: new Date(saved.receipt.occurredAt),
      });
  }
  expect(
    await db.qualityWorkVisit.findFirstOrThrow({
      where: { pieceId: required(ids[0]) },
    }),
  ).toMatchObject({
    endReason: "ISSUE_REPORTED",
    endedAt: new Date(saved.receipt.occurredAt),
  });
  const before = await graph();
  expect(await commands.execute({ actorId: f.qualityB, body })).toEqual({
    ...saved,
    replayed: true,
  });
  expect(await commands.observe(f.qualityB, commandId)).toEqual({
    ...saved,
    replayed: true,
  });
  expect(await graph()).toEqual(before);
});

it.each(["CUTTING", "PRODUCTION", "QUALITY"] as const)(
  "cancels the exact open quality cycle through real P04 work held in %s",
  async (department) => {
    const f = await createQualityFixture(db),
      pieceId = required(f.order.pieces[0]).id,
      companion = required(f.order.pieces[1]).id;
    await work(f.qualityA, f.order.id, [pieceId], "RECEIVE_AND_START");
    await inspect(f.qualityB, f.order.id, [
      {
        pieceId,
        decision: "REJECT",
        target: department === "QUALITY" ? "PRODUCTION" : department,
        reason: "Return for correction",
        instructions: "Retain these instructions",
      },
    ]);
    if (department === "QUALITY") {
      await correctionRoute(f, pieceId, "PRODUCTION");
      await work(f.qualityA, f.order.id, [pieceId], "RECEIVE_AND_START");
    }
    const cycle = await db.qualityCorrectionCycle.findFirstOrThrow({
        where: { pieceId, state: "OPEN" },
      }),
      beforeCompanion = await db.salesOrderPiece.findUniqueOrThrow({
        where: { id: companion },
      }),
      paid = (
        await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })
      ).paidAmount.toFixed(2);
    const report = await f.approval.reportIssue(
      department === "CUTTING"
        ? f.cuttingA
        : department === "PRODUCTION"
          ? f.productionA
          : f.qualityA,
      f.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: await version(f.order.id),
        reason: "Actual held correction",
        notes: null,
      },
    );
    const issueId = report.outcome.issueId;
    if (issueId === null) throw new Error("Actual issue required");
    expect(
      await db.qualityCorrectionCycle.findUniqueOrThrow({
        where: { id: cycle.id },
      }),
    ).toEqual(cycle);
    const cancelled = await f.approval.resolveIssue(
      f.approvalActorId,
      f.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: await version(f.order.id),
        decision: "CANCEL",
        reason: "Confirmed cancellation",
        confirmed: true,
      },
    );
    expect(
      await db.qualityCorrectionCycle.findUniqueOrThrow({
        where: { id: cycle.id },
      }),
    ).toEqual({
      ...cycle,
      state: "CANCELLED",
      resolvedAt: new Date(cancelled.receipt.occurredAt),
      resolutionApprovalCommandId: cancelled.receipt.commandId,
    });
    expect(
      await db.qualityWorkVisit.count({ where: { pieceId, endedAt: null } }),
    ).toBe(0);
    expect(
      await db.salesOrderPiece.findUniqueOrThrow({ where: { id: companion } }),
    ).toEqual(beforeCompanion);
    expect(
      (
        await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })
      ).paidAmount.toFixed(2),
    ).toBe(paid);
  },
);
it.each(["CUTTING", "PRODUCTION", "QUALITY"] as const)(
  "preserves suspended quality correction across P04 release from %s and normal routing",
  async (department) => {
    const f = await createQualityFixture(db),
      pieceId = required(f.order.pieces[0]).id,
      target = department === "CUTTING" ? "CUTTING" : "PRODUCTION";
    await work(f.qualityA, f.order.id, [pieceId], "RECEIVE_AND_START");
    await inspect(f.qualityB, f.order.id, [
      {
        pieceId,
        decision: "REJECT",
        target,
        reason: "Quality correction",
        instructions: "Actual original instruction",
      },
    ]);
    if (department === "QUALITY") {
      await correctionRoute(f, pieceId, "PRODUCTION");
      await work(f.qualityA, f.order.id, [pieceId], "RECEIVE_AND_START");
    }
    const original = await db.qualityCorrectionCycle.findFirstOrThrow({
      where: { pieceId, state: "OPEN" },
    });
    const report = await f.approval.reportIssue(
      department === "CUTTING"
        ? f.cuttingA
        : department === "QUALITY"
          ? f.qualityA
          : f.productionA,
      f.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: await version(f.order.id),
        reason: "Correction issue",
        notes: null,
      },
    );
    if (report.outcome.issueId === null)
      throw new Error("Actual issue required");
    await f.approval.resolveIssue(
      f.approvalActorId,
      f.order.id,
      pieceId,
      report.outcome.issueId,
      {
        commandId: randomUUID(),
        expectedVersion: await version(f.order.id),
        decision: "RETURN_TO_DEPARTMENT",
        target,
        notes: "Approved return",
      },
    );
    expect(
      await db.qualityCorrectionCycle.findUniqueOrThrow({
        where: { id: original.id },
      }),
    ).toEqual(original);
    await correctionRoute(f, pieceId, target);
    await work(f.qualityA, f.order.id, [pieceId], "RECEIVE_AND_START");
    await inspect(f.qualityB, f.order.id, [{ pieceId, decision: "ACCEPT" }]);
    expect(
      await db.qualityCorrectionCycle.findUniqueOrThrow({
        where: { id: original.id },
      }),
    ).toMatchObject({
      state: "ACCEPTED",
      reason: original.reason,
      instructions: original.instructions,
    });
  },
);
it.each(["packing", "deferred event", "late report child"] as const)(
  "rolls the whole saved graph back after a required %s failure",
  async (fault) => {
    const f = await createQualityFixture(db),
      ids = f.order.pieces.map((p) => p.id).sort();
    await work(f.qualityA, f.order.id, ids, "RECEIVE_AND_START");
    const reportOrders = [
      {
        orderId: f.order.id,
        expectedVersion: await version(f.order.id),
        pieceIds: ids,
      },
    ];
    if (fault === "late report child") {
      const other = await appendQualityOrder(db, f);
      const otherIds = other.pieces.map((p) => p.id).sort();
      await work(f.qualityA, other.id, otherIds, "RECEIVE_AND_START");
      reportOrders.push({
        orderId: other.id,
        expectedVersion: await version(other.id),
        pieceIds: otherIds,
      });
    }
    reportOrders.sort((a, b) => a.orderId.localeCompare(b.orderId));
    const before = await graph(),
      last =
        fault === "late report child"
          ? required(required(reportOrders.at(-1)).pieceIds.at(-1))
          : required(ids.at(-1));
    const table =
      fault === "packing"
        ? "quality_packing_pieces"
        : fault === "deferred event"
          ? "quality_piece_events"
          : "approval_commands";
    await db.$executeRawUnsafe(
      `CREATE FUNCTION p06_owned_required_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.piece_id='${last}'::uuid THEN RAISE EXCEPTION 'Owned required P06 save failure'; END IF; RETURN NEW; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        fault === "deferred event"
          ? `CREATE CONSTRAINT TRIGGER p06_owned_required_fault AFTER INSERT ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION p06_owned_required_fault()`
          : `CREATE TRIGGER p06_owned_required_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION p06_owned_required_fault()`,
      );
      const body = qualityCommandBodySchema.parse(
        fault === "late report child"
          ? {
              commandId: randomUUID(),
              operation: "REPORT_ISSUES",
              orders: reportOrders,
              reason: "Actual batch issue",
            }
          : {
              commandId: randomUUID(),
              operation: "INSPECT",
              orders: [
                {
                  orderId: f.order.id,
                  expectedVersion: await version(f.order.id),
                  decisions: ids.map((pieceId) => ({
                    pieceId,
                    decision: "ACCEPT",
                  })),
                  packing: { cartonCount: "One group" },
                },
              ],
            },
      );
      await expect(
        commands.execute({ actorId: f.qualityB, body }),
      ).rejects.toThrow("Owned required P06 save failure");
      expect(await graph()).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS p06_owned_required_fault ON ${table}`,
      );
      await db.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS p06_owned_required_fault()",
      );
    }
  },
);
it("commits a real 200-member report in one unchanged ten-second transaction budget", async () => {
  const f = await createQualityFixture(db);
  const order = await appendQualityOrder(db, f, 200),
    ids = order.pieces.map((p) => p.id).sort();
  const beforeReport = await graph();
  const reportStarted = Date.now();
  const saved = await commands
    .execute({
      actorId: f.qualityA,
      body: qualityCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "REPORT_ISSUES",
        orders: [
          { orderId: order.id, expectedVersion: order.version, pieceIds: ids },
        ],
        reason: "Maximum explicit selection",
        notes: "All two hundred exact members",
      }),
    })
    .catch(async (error: unknown) => {
      expect(await graph()).toEqual(beforeReport);
      throw error;
    });
  const reportElapsed = Date.now() - reportStarted;
  expect(saved.outcome.orders[0]).toMatchObject({
    beforeVersion: order.version,
    afterVersion: order.version + 200,
  });
  expect(saved.outcome.orders[0]?.pieces.map((p) => p.pieceId)).toEqual(ids);
  expect(
    await db.qualityApprovalReport.count({
      where: { commandId: saved.receipt.commandId },
    }),
  ).toBe(200);
  expect(
    await db.approvalCommand.count({
      where: { orderId: order.id, operation: "REPORT_ISSUE" },
    }),
  ).toBe(200);
  expect(
    await db.salesOrderPiece.count({
      where: {
        orderId: order.id,
        stage: "QUALITY",
        workState: "BLOCKED",
        receivedAt: null,
      },
    }),
  ).toBe(200);
  expect(await version(order.id)).toBe(order.version + 200);
  expect(reportElapsed).toBeLessThan(10000);
}, 600000);

// An owned independent transaction holds the selected row until pg_locks proves overlap.
const contend = async (
  kind: "root" | "actor",
  id: string,
  start: () => Array<Promise<unknown>>,
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
      else
        await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
      entered();
      await hold;
    },
    { timeout: 10000 },
  );
  let requests: Array<Promise<unknown>> = [];
  try {
    await inside;
    requests = start();
    const settled = Promise.allSettled(requests);
    let observed = false;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const [locks] = await db.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((locks?.count ?? 0) >= minimumWaiters) {
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
it.each(["accept-reject", "report-inspect", "report-start"] as const)(
  "serializes controlled %s contention with exactly one selected effect",
  async (race) => {
    const f = await createQualityFixture(db),
      pieceId = required(f.order.pieces[0]).id,
      companion = required(f.order.pieces[1]).id;
    if (race !== "report-start")
      await work(f.qualityA, f.order.id, [pieceId], "RECEIVE_AND_START");
    const head = await version(f.order.id),
      companionBefore = await db.salesOrderPiece.findUniqueOrThrow({
        where: { id: companion },
      }),
      headerBefore = await db.salesOrder.findUniqueOrThrow({
        where: { id: f.order.id },
      });
    const second = createDatabaseClient(uri),
      other = new QualityCommandExecutor(second);
    const accept = qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: head,
          decisions: [{ pieceId, decision: "ACCEPT" }],
        },
      ],
    });
    const reject = qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: head,
          decisions: [
            {
              pieceId,
              decision: "REJECT",
              target: "CUTTING",
              reason: "Race rejection",
              instructions: "Real return",
            },
          ],
        },
      ],
    });
    const report = qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "REPORT_ISSUES",
      orders: [
        { orderId: f.order.id, expectedVersion: head, pieceIds: [pieceId] },
      ],
      reason: "Race issue",
    });
    const start: QualityCommandBody = {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        { orderId: f.order.id, expectedVersion: head, pieceIds: [pieceId] },
      ],
    };
    const left = race === "accept-reject" ? accept : report,
      right =
        race === "accept-reject"
          ? reject
          : race === "report-start"
            ? start
            : accept;
    try {
      const results = await contend("root", f.order.id, () => [
        commands.execute({ actorId: f.qualityA, body: left }),
        other.execute({ actorId: f.qualityB, body: right }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const loser = required(results.find((r) => r.status === "rejected"));
      expect(loser.reason).toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
      expect(await version(f.order.id)).toBe(head + 1);
      expect(
        await db.qualityCommand.count({
          where: { commandId: { in: [left.commandId, right.commandId] } },
        }),
      ).toBe(1);
      expect(
        await db.salesOrderPiece.findUniqueOrThrow({
          where: { id: companion },
        }),
      ).toEqual(companionBefore);
      expect(
        await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } }),
      ).toEqual(headerBefore);
      const saved = await db.qualityCommand.findFirstOrThrow({
        where: { commandId: { in: [left.commandId, right.commandId] } },
      });
      const event = await db.qualityPieceEvent.findFirstOrThrow({
        where: { commandId: saved.commandId, pieceId },
      });
      expect(
        await db.qualityPieceEvent.count({
          where: { commandId: { in: [left.commandId, right.commandId] } },
        }),
      ).toBe(1);
      expect(
        await db.qualityCorrectionCycle.count({ where: { pieceId } }),
      ).toBe(event.decision === "REJECT" ? 1 : 0);
      expect(await db.manufacturingIssue.count({ where: { pieceId } })).toBe(
        saved.operation === "REPORT_ISSUES" ? 1 : 0,
      );
      expect(
        await db.qualityWorkVisit.count({ where: { pieceId, endedAt: null } }),
      ).toBe(saved.operation === "RECEIVE_AND_START" ? 1 : 0);
      expect(await db.qualityPackingGroup.count()).toBe(0);
    } finally {
      await second.$disconnect();
    }
  },
);
it.each(["same intent", "different intent"] as const)(
  "binds simultaneous duplicate keys to %s without duplicate receipts or visits",
  async (mode) => {
    const f = await createQualityFixture(db),
      pieceIds = f.order.pieces.map((p) => p.id),
      second = createDatabaseClient(uri),
      other = new QualityCommandExecutor(second),
      commandId = randomUUID();
    const left: QualityCommandBody = {
      commandId,
      operation: "RECEIVE_AND_START",
      orders: [{ orderId: f.order.id, expectedVersion: f.version, pieceIds }],
    };
    const right =
      mode === "same intent"
        ? left
        : {
            ...left,
            orders: [
              {
                orderId: f.order.id,
                expectedVersion: f.version,
                pieceIds: [required(pieceIds[0])],
              },
            ],
          };
    try {
      const results = await contend(
        "root",
        f.order.id,
        () => [
          commands.execute({ actorId: f.qualityA, body: left }),
          other.execute({ actorId: f.qualityA, body: right }),
        ],
        1,
      );
      if (mode === "same intent") {
        expect(results.every((r) => r.status === "fulfilled")).toBe(true);
        const retained = await commands.observe(f.qualityA, commandId);
        expect(retained.replayed).toBe(true);
      } else {
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const loser = required(results.find((r) => r.status === "rejected"));
        expect(loser.reason).toMatchObject({
          code: "QUALITY_COMMAND_CONFLICT",
        });
      }
      expect(await db.qualityCommand.count({ where: { commandId } })).toBe(1);
      expect(await version(f.order.id)).toBe(f.version + 1);
      const saved = await commands.observe(f.qualityA, commandId);
      expect(
        await db.qualityWorkVisit.count({ where: { orderId: f.order.id } }),
      ).toBe(saved.outcome.orders[0]?.pieces.length);
    } finally {
      await second.$disconnect();
    }
  },
);
it("orders overlapping cross-order confirmations consistently and never saves a losing partial group", async () => {
  const f = await createQualityFixture(db),
    otherOrder = await appendQualityOrder(db, f),
    second = createDatabaseClient(uri),
    other = new QualityCommandExecutor(second);
  const groups = [
    {
      orderId: f.order.id,
      expectedVersion: f.version,
      pieceIds: f.order.pieces.map((p) => p.id),
    },
    {
      orderId: otherOrder.id,
      expectedVersion: otherOrder.version,
      pieceIds: otherOrder.pieces.map((p) => p.id),
    },
  ];
  try {
    const results = await contend(
      "root",
      required(
        [...groups].sort((a, b) => a.orderId.localeCompare(b.orderId))[0],
      ).orderId,
      () => [
        commands.execute({
          actorId: f.qualityA,
          body: {
            commandId: randomUUID(),
            operation: "RECEIVE_AND_START",
            orders: groups,
          },
        }),
        other.execute({
          actorId: f.qualityB,
          body: {
            commandId: randomUUID(),
            operation: "RECEIVE_AND_START",
            orders: [...groups].reverse(),
          },
        }),
      ],
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const group of groups) {
      expect(await version(group.orderId)).toBe(group.expectedVersion + 1);
      expect(
        await db.qualityWorkVisit.count({ where: { orderId: group.orderId } }),
      ).toBe(group.pieceIds.length);
    }
    expect(await db.qualityCommand.count()).toBe(1);
    expect(await db.qualityCommandOrder.count()).toBe(2);
  } finally {
    await second.$disconnect();
  }
});
it("serializes current department withdrawal against quality work under the account lock", async () => {
  const f = await createQualityFixture(db),
    second = createDatabaseClient(uri),
    other = new QualityCommandExecutor(second),
    pieceId = required(f.order.pieces[0]).id;
  try {
    const results = await contend("actor", f.qualityA, () => [
      other.execute({
        actorId: f.qualityA,
        body: {
          commandId: randomUUID(),
          operation: "RECEIVE_AND_START",
          orders: [
            {
              orderId: f.order.id,
              expectedVersion: f.version,
              pieceIds: [pieceId],
            },
          ],
        },
      }),
      new StaffService(db).changeDepartment(f.approvalActorId, f.qualityA, {
        commandId: randomUUID(),
        expectedAccessVersion: 1,
        department: "CUTTING",
      }),
    ]);
    expect(results[1]?.status).toBe("fulfilled");
    const wrote = results[0]?.status === "fulfilled";
    if (!wrote && results[0]?.status === "rejected")
      expect(results[0].reason).toMatchObject({
        code: "DEPARTMENT_ACCESS_DENIED",
      });
    expect(await db.qualityCommand.count()).toBe(wrote ? 1 : 0);
    expect(await db.qualityWorkVisit.count()).toBe(wrote ? 1 : 0);
    expect(await version(f.order.id)).toBe(f.version + (wrote ? 1 : 0));
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: f.qualityA } }))
        .department,
    ).toBe("CUTTING");
  } finally {
    await second.$disconnect();
  }
});

it("retains two separately packed accepted groups without replacing earlier text or membership", async () => {
  const f = await createQualityFixture(db),
    ids = f.order.pieces.map((p) => p.id);
  await work(f.qualityA, f.order.id, ids, "RECEIVE_AND_START");
  const saved = [];
  for (const [index, pieceId] of ids.entries()) {
    await commands.execute({
      actorId: index === 0 ? f.qualityA : f.qualityB,
      body: qualityCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "INSPECT",
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: await version(f.order.id),
            decisions: [{ pieceId, decision: "ACCEPT" }],
            packing: {
              cartonCount: "Group " + String(index),
              cartonNumbers: "Same literal carton",
            },
            inspectorNote: "Inspector note " + String(index),
          },
        ],
      }),
    });
    saved.push(
      await db.qualityPackingGroup.findFirstOrThrow({
        where: { orderId: f.order.id, cartonCount: "Group " + String(index) },
        include: { pieces: true },
      }),
    );
  }
  expect(saved[0]?.id).not.toBe(saved[1]?.id);
  for (const group of saved)
    expect(
      await db.qualityPackingGroup.findUniqueOrThrow({
        where: { id: group.id },
        include: { pieces: true },
      }),
    ).toEqual(group);
  expect(saved.map((g) => g.pieces.map((p) => p.pieceId))).toEqual(
    ids.map((id) => [id]),
  );
});
it("commits one mixed multi-order inspection over exact selected identities while preserving unselected companions", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f),
    [p1, p2] = f.order.pieces.map((p) => p.id),
    p3 = required(other.pieces[0]).id,
    unselected = required(other.pieces[1]).id;
  if (!p1 || !p2) throw new Error("Two members required");
  await work(f.qualityA, f.order.id, [p1, p2], "RECEIVE_AND_START");
  await work(f.qualityA, other.id, [p3], "RECEIVE_AND_START");
  const companion = await db.salesOrderPiece.findUniqueOrThrow({
      where: { id: unselected },
    }),
    head1 = await version(f.order.id),
    head2 = await version(other.id);
  const saved = await commands.execute({
    actorId: f.qualityB,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: other.id,
          expectedVersion: head2,
          decisions: [
            {
              pieceId: p3,
              decision: "REJECT",
              target: "PRODUCTION",
              reason: "Production",
              instructions: "Rebuild",
            },
          ],
        },
        {
          orderId: f.order.id,
          expectedVersion: head1,
          decisions: [
            { pieceId: p1, decision: "ACCEPT" },
            {
              pieceId: p2,
              decision: "REJECT",
              target: "CUTTING",
              reason: "Cutting",
              instructions: "Re-cut",
            },
          ],
          packing: { cartonCount: "Accepted piece only" },
        },
      ],
    }),
  });
  expect(saved.outcome.orders).toHaveLength(2);
  expect(
    saved.outcome.orders.flatMap((g) => g.pieces.map((p) => p.pieceId)).sort(),
  ).toEqual([p1, p2, p3].sort());
  expect(await version(f.order.id)).toBe(head1 + 1);
  expect(await version(other.id)).toBe(head2 + 1);
  expect(
    await db.salesOrderPiece.findUniqueOrThrow({ where: { id: unselected } }),
  ).toEqual(companion);
  expect(
    await db.qualityCorrectionCycle.count({
      where: { pieceId: { in: [p2, p3] }, state: "OPEN" },
    }),
  ).toBe(2);
  expect(
    (await db.qualityPackingPiece.findMany()).map((p) => p.pieceId),
  ).toEqual([p1]);
});

it("returns the named lock-timeout conflict without saving any selected graph", async () => {
  const f = await createQualityFixture(db),
    before = await graph(),
    blocker = createDatabaseClient(uri);
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
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${f.order.id}::uuid FOR UPDATE`;
      entered();
      await hold;
    },
    { timeout: 10000 },
  );
  try {
    await inside;
    await expect(
      commands.execute({
        actorId: f.qualityA,
        body: {
          commandId: randomUUID(),
          operation: "RECEIVE_AND_START",
          orders: [
            {
              orderId: f.order.id,
              expectedVersion: f.version,
              pieceIds: f.order.pieces.map((p) => p.id),
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "QUALITY_TRANSACTION_CONFLICT" });
    release();
    await gate;
    expect(await graph()).toEqual(before);
  } finally {
    release();
    await Promise.allSettled([gate]);
    await blocker.$disconnect();
  }
});
it("exhausts a real recognized serialization fault without any retained piece, command or visit", async () => {
  const f = await createQualityFixture(db),
    before = await graph();
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p06_owned_serialization_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned serialization fault' USING ERRCODE='40001'; END $$",
  );
  try {
    await db.$executeRawUnsafe(
      "CREATE TRIGGER p06_owned_serialization_fault BEFORE INSERT ON quality_piece_events FOR EACH ROW EXECUTE FUNCTION p06_owned_serialization_fault()",
    );
    await expect(
      work(
        f.qualityA,
        f.order.id,
        f.order.pieces.map((p) => p.id),
        "RECEIVE_AND_START",
      ),
    ).rejects.toMatchObject({ code: "QUALITY_TRANSACTION_CONFLICT" });
    expect(await graph()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS p06_owned_serialization_fault ON quality_piece_events",
    );
    await db.$executeRawUnsafe(
      "DROP FUNCTION IF EXISTS p06_owned_serialization_fault()",
    );
  }
});

// Queue each real contender behind the owned root gate before admitting the next.
const contendInOrder = async (
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
  const pending: Array<Promise<PromiseSettledResult<unknown>[]>> = [];
  const waitFor = async (minimum: number) => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((row?.count ?? 0) >= minimum) return;
    }
    throw new Error("Expected real queued root contenders");
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
it.each(["quality", "cancellation"] as const)(
  "keeps the losing graph unchanged when %s queues first against P04 cancellation",
  async (first) => {
    const f = await createQualityFixture(db),
      order = await appendQualityOrder(db, f, 3),
      [p1, p2, p3] = order.pieces.map((p) => p.id);
    if (!p1 || !p2 || !p3) throw new Error("Three physical pieces required");
    await work(f.qualityA, order.id, [p1, p2, p3], "RECEIVE_AND_START");
    await inspect(f.qualityB, order.id, [
      {
        pieceId: p2,
        decision: "REJECT",
        target: "PRODUCTION",
        reason: "Original defect",
        instructions: "Retained correction instructions",
      },
    ]);
    const report = await f.approval.reportIssue(f.productionA, order.id, p2, {
        commandId: randomUUID(),
        expectedVersion: await version(order.id),
        reason: "Held correction",
        notes: null,
      }),
      issueId = report.outcome.issueId;
    if (!issueId) throw new Error("Actual held issue required");
    const head = await version(order.id),
      qualityId = randomUUID(),
      cancelId = randomUUID(),
      other = createDatabaseClient(uri);
    const beforeGraph = await graph(),
      beforePieces = await db.salesOrderPiece.findMany({
        orderBy: { id: "asc" },
      }),
      beforeVisits = await db.qualityWorkVisit.findMany({
        orderBy: { id: "asc" },
      }),
      beforeCycles = await db.qualityCorrectionCycle.findMany({
        orderBy: { id: "asc" },
      }),
      beforeIssues = await db.manufacturingIssue.findMany({
        orderBy: { id: "asc" },
      }),
      beforeHeader = await db.salesOrder.findUniqueOrThrow({
        where: { id: order.id },
      }),
      beforeRoot = await db.salesDraft.findUniqueOrThrow({
        where: { id: order.id },
      });
    const body = qualityCommandBodySchema.parse({
      commandId: qualityId,
      operation: "INSPECT",
      orders: [
        {
          orderId: order.id,
          expectedVersion: head,
          decisions: [
            { pieceId: p1, decision: "ACCEPT" },
            { pieceId: p3, decision: "ACCEPT" },
          ],
          packing: { cartonCount: "  اثنان / 2  ", cartonNumbers: "RACE-1" },
        },
      ],
    });
    const quality = () =>
        new QualityCommandExecutor(other).execute({
          actorId: f.qualityA,
          body,
        }),
      cancel = () =>
        f.approval.resolveIssue(f.approvalActorId, order.id, p2, issueId, {
          commandId: cancelId,
          expectedVersion: head,
          decision: "CANCEL",
          reason: "Confirmed race cancellation",
          confirmed: true,
        });
    try {
      const results = await contendInOrder(
        order.id,
        first === "quality" ? quality : cancel,
        first === "quality" ? cancel : quality,
      );
      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]).toMatchObject({
        status: "rejected",
        reason: { code: "ORDER_VERSION_CONFLICT" },
      });
      expect(await version(order.id)).toBe(head + 1);
      const root = await db.salesDraft.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(root).toEqual({
        ...beforeRoot,
        version: head + 1,
        updatedAt: root.updatedAt,
      });
      const afterPieces = await db.salesOrderPiece.findMany({
          orderBy: { id: "asc" },
        }),
        afterHeader = await db.salesOrder.findUniqueOrThrow({
          where: { id: order.id },
        });
      expect(afterHeader.paidAmount).toEqual(beforeHeader.paidAmount);
      expect(afterPieces.map((piece) => piece.id)).toEqual(
        beforePieces.map((piece) => piece.id),
      );
      for (const piece of afterPieces) {
        const old = required(beforePieces.find((p) => p.id === piece.id));
        if (first === "quality" && [p1, p3].includes(piece.id))
          expect(piece).toEqual({
            ...old,
            stage: "WAREHOUSE",
            workState: "INCOMING",
          });
        else if (first === "cancellation" && piece.id === p2)
          expect(piece).toEqual({
            ...old,
            stage: "CANCELLED",
            workState: "BLOCKED",
            issueId: null,
            cancelledAt: piece.cancelledAt,
            cancellationReason: "Confirmed race cancellation",
          });
        else expect(piece).toEqual(old);
        expect(piece.receivedAt).toEqual(old.receivedAt);
      }
      const graphSchema = z.array(
        z.object({ graph: z.record(z.string(), z.unknown()) }),
      );
      const before = graphSchema.parse(beforeGraph)[0]?.graph,
        after = graphSchema.parse(await graph())[0]?.graph;
      if (!before || !after)
        throw new Error("Complete persisted graph required");
      const changed = new Set(
        first === "quality"
          ? [
              "roots",
              "pieces",
              "quality",
              "qualityOrders",
              "qualityVisits",
              "qualityEvents",
              "packing",
              "packingPieces",
            ]
          : ["roots", "headers", "pieces", "approval", "issues", "corrections"],
      );
      for (const [name, value] of Object.entries(before))
        if (!changed.has(name)) expect(after[name], name).toEqual(value);
      for (const name of ["roots", "headers"]) {
        const table = z.array(z.record(z.string(), z.unknown()));
        expect(
          table.parse(after[name]).filter((row) => row["id"] !== order.id),
        ).toEqual(
          table.parse(before[name]).filter((row) => row["id"] !== order.id),
        );
      }
      if (first === "quality") {
        expect(afterHeader).toEqual(beforeHeader);
        expect(
          await db.manufacturingIssue.findMany({ orderBy: { id: "asc" } }),
        ).toEqual(beforeIssues);
        expect(
          await db.qualityCorrectionCycle.findMany({ orderBy: { id: "asc" } }),
        ).toEqual(beforeCycles);
        expect(
          await db.approvalCommand.count({ where: { commandId: cancelId } }),
        ).toBe(0);
        const saved = await commands.observe(f.qualityA, qualityId),
          events = await db.qualityPieceEvent.findMany({
            where: { commandId: qualityId },
          });
        expect(events.map((e) => e.pieceId).sort()).toEqual([p1, p3].sort());
        expect(saved.receipt).toMatchObject({
          commandId: qualityId,
          operation: "INSPECT",
          actor: { id: f.qualityA },
        });
        expect(root.updatedAt).toEqual(new Date(saved.receipt.occurredAt));
        expect(
          (await db.qualityWorkVisit.findMany({ orderBy: { id: "asc" } })).map(
            (visit) => visit.id,
          ),
        ).toEqual(beforeVisits.map((visit) => visit.id));
        for (const visit of await db.qualityWorkVisit.findMany({
          orderBy: { id: "asc" },
        })) {
          const old = required(beforeVisits.find((v) => v.id === visit.id));
          expect(visit).toEqual(
            [p1, p3].includes(visit.pieceId)
              ? {
                  ...old,
                  endedAt: new Date(saved.receipt.occurredAt),
                  endReason: "INSPECT_ACCEPTED",
                  endQualityEventId: required(
                    events.find((e) => e.pieceId === visit.pieceId),
                  ).id,
                }
              : old,
          );
        }
        const group = await db.qualityPackingGroup.findMany({
          where: { commandId: qualityId },
          include: { pieces: true },
        });
        expect(group).toHaveLength(1);
        expect(group[0]?.cartonCount).toBe("  اثنان / 2  ");
        expect(group[0]?.cartonNumbers).toBe("RACE-1");
        expect(group[0]?.pieces.map((p) => p.pieceId).sort()).toEqual(
          [p1, p3].sort(),
        );
        for (const name of [
          "quality",
          "qualityOrders",
          "qualityEvents",
          "packing",
        ]) {
          const rows = z
            .array(z.record(z.string(), z.unknown()))
            .parse(after[name] ?? []);
          expect(
            rows.filter(
              (r: Record<string, unknown>) => r["command_id"] !== qualityId,
            ),
          ).toEqual(before[name] ?? []);
        }
      } else {
        expect(
          await db.qualityCommand.count({ where: { commandId: qualityId } }),
        ).toBe(0);
        expect(
          await db.qualityWorkVisit.findMany({ orderBy: { id: "asc" } }),
        ).toEqual(beforeVisits);
        const receipt = await f.approval.observe(f.approvalActorId, cancelId);
        const at = new Date(receipt.receipt.occurredAt);
        expect(receipt.receipt).toMatchObject({
          commandId: cancelId,
          operation: "RESOLVE_ISSUE",
          actor: { id: f.approvalActorId },
        });
        expect(root.updatedAt).toEqual(at);
        expect(
          required(afterPieces.find((piece) => piece.id === p2)).cancelledAt,
        ).toEqual(at);
        expect(
          await db.qualityCorrectionCycle.findMany({ orderBy: { id: "asc" } }),
        ).toEqual(
          beforeCycles.map((c) =>
            c.pieceId === p2
              ? {
                  ...c,
                  state: "CANCELLED",
                  resolvedAt: at,
                  resolutionApprovalCommandId: cancelId,
                }
              : c,
          ),
        );
        expect(
          await db.manufacturingIssue.findMany({ orderBy: { id: "asc" } }),
        ).toEqual(
          beforeIssues.map((i) =>
            i.id === issueId
              ? {
                  ...i,
                  state: "RESOLVED",
                  resolvedAt: at,
                  resolutionCommandId: cancelId,
                  updatedAt: at,
                }
              : i,
          ),
        );
        const removed = await db.salesOrderPiece.findUniqueOrThrow({
          where: { id: p2 },
        });
        expect(afterHeader).toEqual({
          ...beforeHeader,
          totalAmount: beforeHeader.totalAmount.minus(removed.unitPrice),
        });
        const approvalRows = z
          .array(z.record(z.string(), z.unknown()))
          .parse(after["approval"]);
        expect(
          approvalRows.filter((row) => row["command_id"] !== cancelId),
        ).toEqual(before["approval"]);
        expect(
          approvalRows.filter((row) => row["command_id"] === cancelId),
        ).toHaveLength(1);
      }
    } finally {
      await other.$disconnect();
    }
  },
);
