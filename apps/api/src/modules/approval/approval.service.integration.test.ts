import {
  administrationCommandFactsSchema,
  administrationCommandDataSchema,
  returnedOrderCorrectionsSchema,
  type SalesOrderDto,
} from "@template/contracts";
import {
  SALES_ORDER_SELECT,
  mapSalesOrder,
} from "../sales-orders/sales-orders.mapper.js";
import {
  calculateOrderMoney,
  deriveOrderCounts,
  parseMoneyCents,
} from "../sales-orders/sales-orders.rules.js";
import { loadIdentityAccount } from "../auth/account-authority.js";
import { advanceManufacturingReportFixture } from "../../test-support/manufacturing.fixture.js";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
import {
  submitContactBodySchema,
  reportIssueBodySchema,
  approvalEventFactsSchema,
  approveInitialBodySchema,
  returnInitialBodySchema,
  resubmitOrderBodySchema,
  salesOrderTypeSchema,
  qualityCommandBodySchema,
} from "@template/contracts";
import { StaffService } from "../staff/staff.service.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient } from "@template/database";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { ApprovalCommandExecutor } from "./approval-command-executor.js";
import { ApprovalService } from "./approval.service.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (uri === undefined || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned integration database required");
const db = createDatabaseClient(uri),
  commands = new ApprovalCommandExecutor(db),
  service = new ApprovalService(db, commands, null);
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
});
afterAll(async () => {
  await resetOwnedIdentityTestData(db);
  await db.$disconnect();
});
const graph = async (orderId: string) => ({
  workVisits: await db.manufacturingWorkVisit.findMany({
    where: { orderId: orderId },
    orderBy: [{ pieceId: "asc" }, { sequence: "asc" }],
  }),
  workOrders: await db.manufacturingCommandOrder.findMany({
    where: { orderId: orderId },
    orderBy: { afterVersion: "asc" },
  }),
  workEvents: await db.manufacturingPieceEvent.findMany({
    where: { orderId: orderId },
    orderBy: { id: "asc" },
  }),
  workCommands: await db.manufacturingCommand.findMany({
    where: { orders: { some: { orderId: orderId } } },
    orderBy: { commandId: "asc" },
  }),

  root: await db.salesDraft.findUnique({ where: { id: orderId } }),
  order: await db.salesOrder.findUnique({ where: { id: orderId } }),
  captures: await db.salesDraftPiece.findMany({
    where: { draftId: orderId },
    orderBy: { id: "asc" },
  }),
  pieces: await db.salesOrderPiece.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  }),
  events: await db.approvalCommand.findMany({
    where: { orderId },
    orderBy: { afterVersion: "asc" },
  }),
  issues: await db.manufacturingIssue.findMany({
    where: { orderId },
    orderBy: { cycle: "asc" },
  }),
  proposals: await db.pieceContactProposal.findMany({
    where: { orderId },
    orderBy: { sequence: "asc" },
  }),
  refs: await db.salesPieceCatalogSelection.findMany({
    where: { piece: { draftId: orderId } },
    orderBy: [{ pieceId: "asc" }, { field: "asc" }],
  }),
  salesEvents: await db.salesCommand.findMany({
    where: { draftId: orderId },
    orderBy: { afterVersion: "asc" },
  }),
});

const receivedRemainderFixture = async () => {
  const fixture = await createQualityFixture(db);
  const [accepted, missing] = fixture.order.pieces;
  if (accepted === undefined || missing === undefined)
    throw new Error("Two physical pieces required");
  const orderId = fixture.order.id,
    quality = new QualityCommandExecutor(db);
  const currentVersion = async () =>
    (
      await db.salesDraft.findUniqueOrThrow({
        where: { id: orderId },
        select: { version: true },
      })
    ).version;
  await quality.execute({
    actorId: fixture.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId,
          expectedVersion: await currentVersion(),
          pieceIds: [accepted.id],
        },
      ],
    },
  });
  await quality.execute({
    actorId: fixture.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId,
          expectedVersion: await currentVersion(),
          decisions: [{ pieceId: accepted.id, decision: "ACCEPT" }],
          inspectorNote: "Preserve inspection",
          packing: { cartonCount: " 2 ", cartonNumbers: "C-01" },
        },
      ],
    }),
  });
  await quality.execute({
    actorId: fixture.qualityB,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "REPORT_ISSUES",
      orders: [
        {
          orderId,
          expectedVersion: await currentVersion(),
          pieceIds: [missing.id],
        },
      ],
      reason: "Customer cancellation required",
      notes: null,
    }),
  });
  const source = await db.qualityPieceEvent.findFirstOrThrow({
    where: { orderId, pieceId: accepted.id, decision: "ACCEPT" },
  });
  const actor = await db.user.findUniqueOrThrow({
    where: { id: fixture.approvalActorId },
  });
  const beforeVersion = await currentVersion(),
    occurredAt = new Date(),
    commandId = randomUUID(),
    eventId = randomUUID(),
    groupId = randomUUID();
  // A real SQL-guarded receipt is setup for the P04 boundary. The application receipt producer belongs to T013.
  await db.$transaction(async (tx) => {
    await tx.warehouseCommand.create({
      data: {
        commandId,
        operation: "RECEIVE",
        actorId: actor.id,
        actorFullName: actor.fullName,
        actorRole: actor.role,
        actorDepartment: actor.department,
        payloadHash: "b".repeat(64),
        occurredAt,
        outcome: {
          orders: [
            {
              eventId,
              orderId,
              beforeVersion,
              afterVersion: beforeVersion + 1,
              status: "APPROVED",
              pieceIds: [accepted.id],
              receiptGroupId: groupId,
              attemptId: null,
              retryId: null,
            },
          ],
        },
      },
    });
    await tx.warehouseCommandOrder.create({
      data: {
        commandId,
        orderId,
        eventId,
        beforeVersion,
        afterVersion: beforeVersion + 1,
        beforeStatus: "APPROVED",
        afterStatus: "APPROVED",
        pieceIds: [accepted.id],
      },
    });
    await tx.warehouseReceiptGroup.create({
      data: {
        id: groupId,
        commandId,
        orderId,
        cartonCount: " 1 ",
        storageLocation: "Shelf B-12",
        notes: null,
      },
    });
    await tx.warehouseReceiptPiece.create({
      data: {
        pieceId: accepted.id,
        orderId,
        origin: "COMMAND",
        groupId,
        qualityEventId: source.id,
        receivedAt: occurredAt,
      },
    });
    await tx.salesOrderPiece.update({
      where: { id: accepted.id },
      data: { workState: "COMPLETED", receivedAt: occurredAt },
    });
    await tx.salesDraft.update({
      where: { id: orderId },
      data: { version: { increment: 1 }, updatedAt: occurredAt },
    });
  });
  const issue = await db.manufacturingIssue.findFirstOrThrow({
    where: { orderId, pieceId: missing.id, state: "APPROVAL_REVIEW" },
  });
  return { fixture, accepted, missing, orderId, issue, currentVersion };
};

it("makes the physically received remainder ready when P04 cancels the final missing piece", async () => {
  const { fixture, missing, orderId, issue, currentVersion } =
    await receivedRemainderFixture();
  const before = await graph(orderId),
    receipts = await db.warehouseReceiptPiece.findMany({ where: { orderId } }),
    packing = await db.qualityPackingGroup.findMany({ where: { orderId } });
  const input = {
    commandId: randomUUID(),
    expectedVersion: await currentVersion(),
    decision: "CANCEL" as const,
    confirmed: true as const,
    reason: "Confirmed missing-piece cancellation",
  };
  const result = await service.resolveIssue(
    fixture.approvalActorId,
    orderId,
    missing.id,
    issue.id,
    input,
  );
  const after = await graph(orderId);
  expect(result.outcome).toMatchObject({
    orderStatus: "READY_FOR_DELIVERY",
    pieceStage: "CANCELLED",
    issueState: "RESOLVED",
  });
  expect(after.root?.version).toBe(input.expectedVersion + 1);
  expect(after.order?.status).toBe("READY_FOR_DELIVERY");
  expect(after.order?.paidAmount).toEqual(before.order?.paidAmount);
  expect(after.captures).toEqual(before.captures);
  expect(after.events).toHaveLength(before.events.length + 1);
  expect(
    approvalEventFactsSchema.parse(after.events.at(-1)?.afterFacts).counts,
  ).toEqual({
    original: 2,
    cancelled: 1,
    active: 1,
    received: 1,
    completionPercent: 100,
  });
  expect(
    await db.warehouseReceiptPiece.findMany({ where: { orderId } }),
  ).toEqual(receipts);
  expect(await db.qualityPackingGroup.findMany({ where: { orderId } })).toEqual(
    packing,
  );
  expect(await db.warehouseCommand.count()).toBe(1);
  expect(
    await service.resolveIssue(
      fixture.approvalActorId,
      orderId,
      missing.id,
      issue.id,
      input,
    ),
  ).toEqual({ ...result, replayed: true });
  expect(await graph(orderId)).toEqual(after);
});
it.each(salesOrderTypeSchema.options)(
  "releases every retained %s piece to cutting once without requiring a dashboard calendar",
  async (type) => {
    const fixture = await createApprovalOrderFixture(db, type),
      input = approveInitialBodySchema.parse({
        commandId: randomUUID(),
        expectedVersion: 1,
      });
    const before = await graph(fixture.order.id),
      result = await service.approveInitial(
        fixture.actorId,
        fixture.order.id,
        input,
      ),
      after = await graph(fixture.order.id);
    expect(result).toMatchObject({
      replayed: false,
      receipt: {
        operation: "APPROVE_INITIAL",
        beforeVersion: 1,
        afterVersion: 2,
        actor: { id: fixture.actorId },
      },
      outcome: { orderStatus: "APPROVED" },
    });
    expect(after.pieces).toHaveLength(before.pieces.length);
    for (const piece of after.pieces)
      expect(piece).toMatchObject({
        stage: "CUTTING",
        workState: "INCOMING",
        issueId: null,
        receivedAt: null,
        cancelledAt: null,
      });
    expect(after.captures).toEqual(before.captures);
    expect(after.order).toMatchObject({
      businessNumber: before.order?.businessNumber,
      totalAmount: before.order?.totalAmount,
      paidAmount: before.order?.paidAmount,
      customerPhone: before.order?.customerPhone,
    });
    expect(after.events).toHaveLength(1);
    expect(
      await service.approveInitial(fixture.actorId, fixture.order.id, input),
    ).toEqual({ ...result, replayed: true });
    expect(await graph(fixture.order.id)).toEqual(after);
    await expect(
      service.returnInitial(fixture.actorId, fixture.order.id, {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Obsolete",
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
    expect(await graph(fixture.order.id)).toEqual(after);
  },
);
it("retains separately bounded return reason and optional notes without releasing manufacturing work", async () => {
  const fixture = await createApprovalOrderFixture(db),
    input = returnInitialBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 1,
      reason: "r".repeat(4000),
      notes: "n".repeat(4000),
    });
  const before = await graph(fixture.order.id),
    result = await service.returnInitial(
      fixture.actorId,
      fixture.order.id,
      input,
    ),
    after = await graph(fixture.order.id);
  expect(after.order).toMatchObject({
    status: "RETURNED",
    currentReturnDecisionId: input.commandId,
    currentReturnOrderVersion: 2,
    currentReturnReason: input.reason,
    currentReturnedAt: new Date(result.receipt.occurredAt),
  });
  expect(after.pieces).toEqual(before.pieces);
  expect(after.captures).toEqual(before.captures);
  expect(
    approvalEventFactsSchema.parse(after.events[0]?.afterFacts).currentReturn,
  ).toMatchObject({ reason: input.reason, notes: input.notes });
  expect(await commands.observe(fixture.actorId, input.commandId)).toEqual({
    ...result,
    replayed: true,
  });
});
it("uses the actual return witness for P03 correction/resubmission and fresh approval while retaining terms", async () => {
  const fixture = await createApprovalOrderFixture(db);
  const initial = await graph(fixture.order.id);
  const returned = await service.returnInitial(
    fixture.actorId,
    fixture.order.id,
    returnInitialBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 1,
      reason: "Confirm size",
      notes: "Customer response required",
    }),
  );
  const piece = fixture.order.pieces[0];
  if (piece === undefined) throw new Error("Expected the owned physical piece");
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
    ...capture
  } = piece;
  const corrected = await fixture.sales.resubmit(
    fixture.actorId,
    fixture.order.id,
    resubmitOrderBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: returned.receipt.afterVersion,
      corrections: {
        deliveryDate: fixture.order.deliveryDate,
        generalNotes: "Corrected after customer review",
        responsibleSignature: fixture.order.responsibleSignature,
        repairNote: fixture.order.repairNote,
        adjustmentRequested: fixture.order.adjustmentRequested,
        adjustmentReason: fixture.order.adjustmentReason,
        adjustmentActionTaken: fixture.order.adjustmentActionTaken,
        pieces: [{ ...capture, size: "40.5" }],
      },
    }),
  );
  expect(corrected.savedOrder).toMatchObject({
    version: 3,
    status: "AWAITING_APPROVAL",
    businessNumber: fixture.order.businessNumber,
    money: fixture.order.money,
  });
  const approved = await service.approveInitial(
    fixture.actorId,
    fixture.order.id,
    { commandId: randomUUID(), expectedVersion: 3 },
  );
  expect(approved.receipt.afterVersion).toBe(4);
  const after = await graph(fixture.order.id);
  expect(after.order).toMatchObject({
    status: "APPROVED",
    businessNumber: fixture.order.businessNumber,
    totalAmount: initial.order?.totalAmount,
    paidAmount: initial.order?.paidAmount,
    customerPhone: initial.order?.customerPhone,
  });
  expect(after.events.map((event) => event.operation)).toEqual([
    "RETURN_INITIAL",
    "APPROVE_INITIAL",
  ]);
  expect(after.salesEvents).toHaveLength(2);
  expect(after.pieces[0]).toMatchObject({
    id: piece.id,
    stage: "CUTTING",
    workState: "INCOMING",
    decorationEntryId: piece.decorationEntryId,
    unitPrice: initial.pieces[0]?.unitPrice,
  });
});
it("commits exactly one initial decision when two actual service calls queue on the same root", async () => {
  const fixture = await createApprovalOrderFixture(db);
  const outcomes = await contendOnRoot(fixture.order.id, () => {
    const requests: Array<Promise<unknown>> = [];
    requests.push(
      service.approveInitial(fixture.actorId, fixture.order.id, {
        commandId: randomUUID(),
        expectedVersion: 1,
      }),
      service.returnInitial(fixture.actorId, fixture.order.id, {
        commandId: randomUUID(),
        expectedVersion: 1,
        reason: "Review current revision",
        notes: null,
      }),
    );
    return requests;
  });
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const loser = outcomes.find((result) => result.status === "rejected");
  expect(loser).toMatchObject({
    status: "rejected",
    reason: { code: "ORDER_VERSION_CONFLICT" },
  });
  const after = await graph(fixture.order.id);
  expect(after.events).toHaveLength(1);
  expect(after.root?.version).toBe(2);
  for (const piece of after.pieces)
    expect(piece.stage).toBe(
      after.order?.status === "APPROVED" ? "CUTTING" : "AWAITING_APPROVAL",
    );
});
it("rolls back actual approval state and release when immutable receipt insertion fails", async () => {
  const fixture = await createApprovalOrderFixture(db),
    before = await graph(fixture.order.id);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION p04_owned_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled receipt failure' USING ERRCODE='23514'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER p04_owned_fail_receipt BEFORE INSERT ON approval_commands FOR EACH ROW EXECUTE FUNCTION p04_owned_fail_receipt()`,
  );
  try {
    await expect(
      service.approveInitial(fixture.actorId, fixture.order.id, {
        commandId: randomUUID(),
        expectedVersion: 1,
      }),
    ).rejects.toThrow();
    expect(await graph(fixture.order.id)).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p04_owned_fail_receipt ON approval_commands",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p04_owned_fail_receipt()");
  }
});

it.each(["CUTTING", "PRODUCTION", "QUALITY"] as const)(
  "reports the persisted %s source with an actual current employee and leaves its companion untouched",
  async (department) => {
    const fixture = await createApprovalOrderFixture(db, "SHOP", [
      "زبيري - z",
      "نعام - O",
    ]);
    await service.approveInitial(fixture.actorId, fixture.order.id, {
      commandId: randomUUID(),
      expectedVersion: 1,
    });
    const pieceId = fixture.order.pieces[0]?.id,
      companionId = fixture.order.pieces[1]?.id;
    if (pieceId === undefined || companionId === undefined)
      throw new Error("Expected two owned pieces");
    const reportVersion = await advanceManufacturingReportFixture(
      db,
      fixture.actorId,
      fixture.order.id,
      pieceId,
      department,
    );
    const worker = await db.user.create({
      data: {
        email: `${department.toLowerCase()}@example.test`,
        fullName: "Actual source worker",
        passwordHash: "synthetic",
        status: "PENDING_APPROVAL",
        emailVerifiedAt: new Date(),
      },
    });
    await new StaffService(db).approveStaff(fixture.actorId, worker.id, {
      commandId: randomUUID(),
      expectedAccessVersion: 0,
      department,
    });
    const before = await graph(fixture.order.id),
      body = reportIssueBodySchema.parse({
        commandId: randomUUID(),
        expectedVersion: reportVersion,
        reason: "Required material unavailable",
        notes: "Recorded at source",
      });
    const reported = await service.reportIssue(
        worker.id,
        fixture.order.id,
        pieceId,
        body,
      ),
      after = await graph(fixture.order.id);
    expect(after.issues).toHaveLength(1);
    if (department !== "QUALITY") {
      const original = before.workVisits.find(
        (v) => v.pieceId === pieceId && v.endedAt === null,
      );
      if (original === undefined || original.startedCommandId === null)
        throw new Error("Actual source start required");
      expect(after.workVisits.find((v) => v.id === original.id)).toMatchObject({
        originKind: original.originKind,
        sourceApprovalCommandId: original.sourceApprovalCommandId,
        sourceTransferEventId: original.sourceTransferEventId,
        receivedAt: original.receivedAt,
        receivedCommandId: original.receivedCommandId,
        startedAt: original.startedAt,
        startedCommandId: original.startedCommandId,
        endReason: "ISSUE_REPORTED",
        endApprovalCommandId: body.commandId,
        endManufacturingCommandId: null,
        destination: null,
      });
      expect(
        after.pieces.find((p) => p.id === pieceId)?.currentWorkVisitId,
      ).toBeNull();
      expect(after.workCommands).toEqual(before.workCommands);
      expect(after.workEvents).toEqual(before.workEvents);
      expect(after.workOrders).toEqual(before.workOrders);
    }

    expect(after.issues[0]).toMatchObject({
      sourceDepartment: department,
      sourceStage: department,
      sourceWorkState: department === "QUALITY" ? "INCOMING" : "IN_PROGRESS",
      reporterId: worker.id,
      reporterFullName: worker.fullName,
      reportedCommandId: body.commandId,
      state: "APPROVAL_REVIEW",
      cycle: 1,
    });
    expect(after.pieces.find((piece) => piece.id === companionId)).toEqual(
      before.pieces.find((piece) => piece.id === companionId),
    );
    expect(after.captures).toEqual(before.captures);
    expect(after.order?.totalAmount).toEqual(before.order?.totalAmount);
    expect(after.order?.paidAmount).toEqual(before.order?.paidAmount);
    expect(reported).not.toHaveProperty("savedOrder");
    expect(reported).not.toHaveProperty("money");
    expect(
      await service.reportIssue(worker.id, fixture.order.id, pieceId, body),
    ).toEqual({ ...reported, replayed: true });
    expect(await graph(fixture.order.id)).toEqual(after);
    await expect(
      service.reportIssue(worker.id, fixture.order.id, pieceId, {
        ...body,
        commandId: randomUUID(),
        expectedVersion: reportVersion + 1,
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_ISSUE_CONFLICT" });
    expect(await graph(fixture.order.id)).toEqual(after);
    expect(
      (
        await new ApprovalService(db, commands, "UTC").dashboard(
          fixture.actorId,
        )
      ).counts.approvalIssues,
    ).toBe(1);
  },
);
it("denies a wrong-department report, a foreign piece and a nonapproved order without adding evidence", async () => {
  const fixture = await createApprovalOrderFixture(db),
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected the owned piece");
  const body = reportIssueBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Material issue",
  });
  const initial = await graph(fixture.order.id);
  await expect(
    service.reportIssue(fixture.actorId, fixture.order.id, pieceId, body),
  ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
  expect(await graph(fixture.order.id)).toEqual(initial);
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const worker = await db.user.create({
    data: {
      email: "wrong-source@example.test",
      fullName: "Wrong department",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(db).approveStaff(fixture.actorId, worker.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "PRODUCTION",
  });
  const before = await graph(fixture.order.id);
  await expect(
    service.reportIssue(worker.id, fixture.order.id, pieceId, {
      ...body,
      expectedVersion: 2,
    }),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await expect(
    service.reportIssue(fixture.actorId, fixture.order.id, randomUUID(), {
      ...body,
      expectedVersion: 2,
    }),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  expect(await graph(fixture.order.id)).toEqual(before);
});
it("rolls back a reported issue, hold, version and event when the dependent receipt write fails", async () => {
  const fixture = await createApprovalOrderFixture(db),
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected the owned piece");
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const before = await graph(fixture.order.id);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION p04_owned_fail_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='REPORT_ISSUE' THEN RAISE EXCEPTION 'controlled report failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER p04_owned_fail_report BEFORE INSERT ON approval_commands FOR EACH ROW EXECUTE FUNCTION p04_owned_fail_report()`,
  );
  try {
    await expect(
      service.reportIssue(fixture.actorId, fixture.order.id, pieceId, {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Material",
        notes: null,
      }),
    ).rejects.toThrow();
    expect(await graph(fixture.order.id)).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p04_owned_fail_report ON approval_commands",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p04_owned_fail_report()");
  }
});
it("allocates a later issue cycle without overwriting a retained earlier cycle", async () => {
  const fixture = await createApprovalOrderFixture(db),
    orderId = fixture.order.id,
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected the owned piece");
  await service.approveInitial(fixture.actorId, orderId, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const first = await service.reportIssue(fixture.actorId, orderId, pieceId, {
    commandId: randomUUID(),
    expectedVersion: 2,
    reason: "First cycle",
    notes: null,
  });
  const issueId = first.outcome.issueId;
  if (issueId === null) throw new Error("Expected the first retained issue");
  await service.resolveIssue(fixture.actorId, orderId, pieceId, issueId, {
    commandId: randomUUID(),
    expectedVersion: 3,
    decision: "RETURN_TO_DEPARTMENT",
    target: "CUTTING",
    notes: "Review the next cycle",
  });
  const retained = await db.manufacturingIssue.findUnique({
    where: { id: issueId },
  });
  const second = await service.reportIssue(fixture.actorId, orderId, pieceId, {
    commandId: randomUUID(),
    expectedVersion: 4,
    reason: "Later cycle",
    notes: null,
  });
  expect(second.outcome.issueId).not.toBe(issueId);
  expect(
    await db.manufacturingIssue.findUnique({ where: { id: issueId } }),
  ).toEqual(retained);
  expect(
    (
      await db.manufacturingIssue.findMany({
        where: { orderId },
        orderBy: { cycle: "asc" },
      })
    ).map((issue) => ({ cycle: issue.cycle, state: issue.state })),
  ).toEqual([
    { cycle: 1, state: "RESOLVED" },
    { cycle: 2, state: "APPROVAL_REVIEW" },
  ]);
});

it("retains exactly one issue when distinct report commands queue on the same root", async () => {
  const fixture = await createApprovalOrderFixture(db);
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected owned piece");
  const outcomes = await contendOnRoot(fixture.order.id, () => {
    const requests: Array<Promise<unknown>> = [];
    for (let index = 0; index < 2; index++)
      requests.push(
        service.reportIssue(fixture.actorId, fixture.order.id, pieceId, {
          commandId: randomUUID(),
          expectedVersion: 2,
          reason: "Report concurrently",
          notes: null,
        }),
      );
    return requests;
  });
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const loser = outcomes.find((result) => result.status === "rejected");
  expect(loser).toMatchObject({
    status: "rejected",
    reason: { code: "ORDER_VERSION_CONFLICT" },
  });
  const after = await graph(fixture.order.id);
  expect(after.events).toHaveLength(2);
  expect(after.root?.version).toBe(3);
  expect(after.issues).toHaveLength(1);
  expect(after.pieces[0]).toMatchObject({
    stage: "CUTTING",
    workState: "BLOCKED",
    issueId: after.issues[0]?.id,
  });
});
const heldFixture = async (
  decorations: readonly string[] = ["زبيري - z"],
  ownerKind: "ADMIN" | "SALES" = "ADMIN",
) => {
  const fixture = await createApprovalOrderFixture(
    db,
    "SHOP",
    decorations,
    ownerKind,
  );
  await service.approveInitial(fixture.approvalActorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected owned piece");
  const report = await service.reportIssue(
    fixture.approvalActorId,
    fixture.order.id,
    pieceId,
    {
      commandId: randomUUID(),
      expectedVersion: 2,
      reason: "Manufacturing issue",
      notes: "Reporter note",
    },
  );
  const issueId = report.outcome.issueId;
  if (issueId === null) throw new Error("Expected retained issue");
  return { ...fixture, pieceId, issueId };
};
it.each(["RETURN_TO_DEPARTMENT", "SEND_TO_SALES", "CANCEL"] as const)(
  "resolves %s once with retained history and an untouched companion",
  async (decision) => {
    const fixture = await heldFixture(["زبيري - z", "نعام - O"]),
      { actorId, order, pieceId, issueId } = fixture;
    const before = await graph(order.id);
    const input =
      decision === "CANCEL"
        ? {
            commandId: randomUUID(),
            expectedVersion: 3,
            decision,
            reason: "Customer cancellation",
            confirmed: true as const,
          }
        : {
            commandId: randomUUID(),
            expectedVersion: 3,
            decision,
            target: "PRODUCTION" as const,
            notes: "Exact target instructions",
          };
    const result = await service.resolveIssue(
      actorId,
      order.id,
      pieceId,
      issueId,
      input,
    );
    const after = await graph(order.id),
      piece = after.pieces.find((row) => row.id === pieceId),
      issue = after.issues[0];
    expect(after.pieces.find((row) => row.id !== pieceId)).toEqual(
      before.pieces.find((row) => row.id !== pieceId),
    );
    expect(after.captures).toEqual(before.captures);
    expect(after.order?.paidAmount).toEqual(before.order?.paidAmount);
    expect(after.root?.version).toBe(4);
    expect(result.outcome.issueState).toBe(
      decision === "SEND_TO_SALES" ? "SALES_CONTACT" : "RESOLVED",
    );
    expect(issue).toMatchObject({
      sourceStage: "CUTTING",
      reason: "Manufacturing issue",
      notes: "Reporter note",
      resumeTarget: decision === "CANCEL" ? null : "PRODUCTION",
    });
    expect(piece).toMatchObject(
      decision === "SEND_TO_SALES"
        ? { stage: "CUTTING", workState: "BLOCKED", issueId }
        : {
            stage: decision === "CANCEL" ? "CANCELLED" : "PRODUCTION",
            workState: decision === "CANCEL" ? "BLOCKED" : "INCOMING",
            issueId: null,
          },
    );
    expect(
      await service.resolveIssue(actorId, order.id, pieceId, issueId, input),
    ).toEqual({ ...result, replayed: true });
    expect(await graph(order.id)).toEqual(after);
    await expect(
      service.resolveIssue(actorId, order.id, pieceId, issueId, {
        ...input,
        commandId: randomUUID(),
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_ISSUE_CONFLICT" });
    expect(await graph(order.id)).toEqual(after);
  },
);
it("rejects foreign/stale resolution and rolls back after dependent piece cancellation", async () => {
  const { actorId, order, pieceId, issueId } = await heldFixture(),
    before = await graph(order.id);
  const input = {
    commandId: randomUUID(),
    expectedVersion: 3,
    decision: "CANCEL" as const,
    confirmed: true as const,
    reason: "Confirmed reason",
  };
  await expect(
    service.resolveIssue(actorId, order.id, pieceId, randomUUID(), input),
  ).rejects.toMatchObject({ code: "APPROVAL_ISSUE_NOT_FOUND" });
  await expect(
    service.resolveIssue(actorId, order.id, pieceId, issueId, {
      ...input,
      expectedVersion: 2,
    }),
  ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  expect(await graph(order.id)).toEqual(before);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION p04_owned_fail_resolve() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='RESOLVE_ISSUE' THEN RAISE EXCEPTION 'controlled resolution failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER p04_owned_fail_resolve BEFORE INSERT ON approval_commands FOR EACH ROW EXECUTE FUNCTION p04_owned_fail_resolve()`,
  );
  try {
    await expect(
      service.resolveIssue(actorId, order.id, pieceId, issueId, input),
    ).rejects.toThrow();
    expect(await graph(order.id)).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p04_owned_fail_resolve ON approval_commands",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p04_owned_fail_resolve()");
  }
});

it("accepts exactly one A/C decision when distinct resolution commands contend", async () => {
  const fixture = await heldFixture(),
    pieceId = fixture.pieceId;
  const outcomes = await contendOnRoot(fixture.order.id, () => {
    const requests: Array<Promise<unknown>> = [];
    requests.push(
      service.resolveIssue(
        fixture.actorId,
        fixture.order.id,
        pieceId,
        fixture.issueId,
        {
          commandId: randomUUID(),
          expectedVersion: 3,
          decision: "RETURN_TO_DEPARTMENT",
          target: "PRODUCTION",
          notes: "Resume reviewed piece",
        },
      ),
      service.resolveIssue(
        fixture.actorId,
        fixture.order.id,
        pieceId,
        fixture.issueId,
        {
          commandId: randomUUID(),
          expectedVersion: 3,
          decision: "CANCEL",
          confirmed: true,
          reason: "Cancel reviewed piece",
        },
      ),
    );
    return requests;
  });
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const loser = outcomes.find((result) => result.status === "rejected");
  expect(loser).toMatchObject({
    status: "rejected",
    reason: { code: "ORDER_VERSION_CONFLICT" },
  });
  const after = await graph(fixture.order.id);
  expect(after.events).toHaveLength(3);
  expect(after.root?.version).toBe(4);
  expect(after.issues[0]).toMatchObject({ state: "RESOLVED" });
  expect(after.pieces[0]?.issueId).toBeNull();
});
// An independent connection holds the aggregate root until both actual commands are observed waiting.
const contendOnRoot = async (
  orderId: string,
  start: () => Array<Promise<unknown>>,
) => {
  const blocker = createDatabaseClient(uri);
  let release: () => void = () => {
      throw new Error("Barrier not initialized");
    },
    entered: () => void = () => {
      throw new Error("Barrier not initialized");
    };
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
  let requests: Array<Promise<unknown>> = [];
  try {
    await inside;
    requests = start();
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((rows[0]?.count ?? 0) >= 2) {
        waiting = true;
        break;
      }
    }
    expect(waiting).toBe(true);
    release();
    await gate;
    return await Promise.allSettled(requests);
  } finally {
    release();
    await Promise.allSettled([gate, ...requests]);
    await blocker.$disconnect();
  }
};

it("retains exact 3300/2000 terms through partial and full cancellation without refund or completion", async () => {
  const fixture = await heldFixture(["زبيري - z", "نعام - O"]),
    { actorId, order, pieceId, issueId, sales } = fixture,
    secondId = order.pieces.find((piece) => piece.id !== pieceId)?.id;
  if (secondId === undefined) throw new Error("Expected second frozen piece");
  await sales.setPaid(actorId, order.id, {
    commandId: randomUUID(),
    expectedVersion: 3,
    paidAmount: "2000.00",
  });
  const report = await service.reportIssue(actorId, order.id, secondId, {
    commandId: randomUUID(),
    expectedVersion: 4,
    reason: "Cancel second piece",
    notes: null,
  });
  const secondIssue = report.outcome.issueId;
  if (secondIssue === null) throw new Error("Expected second issue");
  const input = {
    commandId: randomUUID(),
    expectedVersion: 5,
    decision: "CANCEL" as const,
    confirmed: true as const,
    reason: "Confirmed second-piece cancellation",
  };
  const partial = await service.resolveIssue(
    actorId,
    order.id,
    secondId,
    secondIssue,
    input,
  );
  const afterPartial = await graph(order.id),
    event = afterPartial.events.at(-1);
  expect(approvalEventFactsSchema.parse(event?.beforeFacts).money).toEqual({
    total: "3300.00",
    paidAmount: "2000.00",
    remainingDue: "1300.00",
    surplus: "0.00",
  });
  expect(approvalEventFactsSchema.parse(event?.afterFacts)).toMatchObject({
    money: {
      total: "1800.00",
      paidAmount: "2000.00",
      remainingDue: "0.00",
      surplus: "200.00",
    },
    counts: {
      original: 2,
      cancelled: 1,
      active: 1,
      received: 0,
      completionPercent: 0,
    },
  });
  expect(
    await service.resolveIssue(actorId, order.id, secondId, secondIssue, input),
  ).toEqual({ ...partial, replayed: true });
  expect(await graph(order.id)).toEqual(afterPartial);
  await service.resolveIssue(actorId, order.id, pieceId, issueId, {
    commandId: randomUUID(),
    expectedVersion: 6,
    decision: "CANCEL",
    confirmed: true,
    reason: "Confirmed last-piece cancellation",
  });
  const final = await graph(order.id);
  expect(final.captures).toEqual(afterPartial.captures);
  expect(final.pieces).toHaveLength(2);
  expect(
    final.pieces.every(
      (piece) =>
        piece.stage === "CANCELLED" &&
        piece.receivedAt === null &&
        piece.cancelledAt !== null,
    ),
  ).toBe(true);
  expect(final.issues.every((issue) => issue.state === "RESOLVED")).toBe(true);
  expect(
    approvalEventFactsSchema.parse(final.events.at(-1)?.afterFacts),
  ).toMatchObject({
    orderStatus: "CANCELLED",
    money: {
      total: "0.00",
      paidAmount: "2000.00",
      remainingDue: "0.00",
      surplus: "2000.00",
    },
    counts: {
      original: 2,
      cancelled: 2,
      active: 0,
      received: 0,
      completionPercent: 0,
    },
  });
});
it("serializes cancellation with actual cumulative paid and preserves both after a reviewed retry", async () => {
  const { actorId, order, pieceId, issueId, sales } = await heldFixture([
    "زبيري - z",
    "نعام - O",
  ]);
  const cancel = (expectedVersion: number) =>
    service.resolveIssue(actorId, order.id, pieceId, issueId, {
      commandId: randomUUID(),
      expectedVersion,
      decision: "CANCEL",
      confirmed: true,
      reason: "Reviewed cancellation",
    });
  const paid = (expectedVersion: number) =>
    sales.setPaid(actorId, order.id, {
      commandId: randomUUID(),
      expectedVersion,
      paidAmount: "2000.00",
    });
  const outcomes = await contendOnRoot(order.id, () => [cancel(3), paid(3)]);
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(outcomes.find((result) => result.status === "rejected")).toMatchObject(
    { reason: { code: "ORDER_VERSION_CONFLICT" } },
  );
  const winner = await graph(order.id);
  expect(winner.root?.version).toBe(4);
  const cancelled =
    winner.pieces.find((piece) => piece.id === pieceId)?.stage === "CANCELLED";
  expect(winner.events).toHaveLength(cancelled ? 3 : 2);
  expect(winner.salesEvents).toHaveLength(cancelled ? 1 : 2);
  if (cancelled) await paid(4);
  else await cancel(4);
  const final = await graph(order.id);
  expect(final.root?.version).toBe(5);
  expect(final.events).toHaveLength(3);
  expect(final.salesEvents).toHaveLength(2);
  expect(final.order?.totalAmount.toFixed(2)).toBe("1500.00");
  expect(final.order?.paidAmount.toFixed(2)).toBe("2000.00");
  expect(final.captures).toEqual(winner.captures);
  expect(
    final.pieces.filter((piece) => piece.stage === "CANCELLED"),
  ).toHaveLength(1);
});
// These enabled-guard fixtures establish P04 denial contexts; warehouse application producers are tested in their own tasks.
const recordDownstreamFixture = async (
  actorId: string,
  orderId: string,
  pieceId: string,
  operation: "DISPATCH" | "CONFIRM_DELIVERY",
) => {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  const root = await db.salesDraft.findUniqueOrThrow({
    where: { id: orderId },
  });
  const header = await db.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  const commandId = randomUUID(),
    eventId = randomUUID(),
    occurredAt = new Date();
  const attemptId =
    operation === "DISPATCH"
      ? randomUUID()
      : (
          await db.warehouseDeliveryAttempt.findFirstOrThrow({
            where: { orderId },
            orderBy: { number: "desc" },
          })
        ).id;
  const afterStatus =
    operation === "DISPATCH" ? "OUT_FOR_DELIVERY" : "DELIVERED";
  await db.$transaction(async (tx) => {
    await tx.warehouseCommand.create({
      data: {
        commandId,
        operation,
        actorId,
        actorFullName: actor.fullName,
        actorRole: actor.role,
        actorDepartment: actor.department,
        payloadHash: "c".repeat(64),
        occurredAt,
        outcome: {
          orders: [
            {
              eventId,
              orderId,
              beforeVersion: root.version,
              afterVersion: root.version + 1,
              status: afterStatus,
              pieceIds: [pieceId],
              receiptGroupId: null,
              attemptId,
              retryId: null,
            },
          ],
        },
      },
    });
    await tx.warehouseCommandOrder.create({
      data: {
        commandId,
        orderId,
        eventId,
        beforeVersion: root.version,
        afterVersion: root.version + 1,
        beforeStatus: header.status,
        afterStatus,
        pieceIds: [pieceId],
      },
    });
    if (operation === "DISPATCH") {
      await tx.warehouseDeliveryAttempt.create({
        data: {
          id: attemptId,
          orderId,
          commandId,
          number: 1,
          deliveryNote: null,
          predecessorRetryId: null,
        },
      });
      await tx.warehouseDeliveryAttemptMember.create({
        data: { attemptId, orderId, pieceId },
      });
    } else {
      await tx.warehouseDeliveryOutcome.create({
        data: {
          id: randomUUID(),
          attemptId,
          orderId,
          commandId,
          kind: "DELIVERED",
          recipient: null,
          deliveredAt: null,
          reason: null,
          notes: null,
          returnedToWarehouse: false,
        },
      });
    }
    await tx.salesOrder.update({
      where: { id: orderId },
      data: { status: afterStatus },
    });
    await tx.salesDraft.update({
      where: { id: orderId },
      data: { version: { increment: 1 }, updatedAt: occurredAt },
    });
  });
};
it.each(["OUT_FOR_DELIVERY", "DELIVERED"] as const)(
  "denies cancellation on witnessed downstream %s state",
  async (status) => {
    const { fixture, accepted, missing, orderId, issue, currentVersion } =
      await receivedRemainderFixture();
    const actorId = fixture.approvalActorId,
      order = fixture.order,
      pieceId = missing.id,
      issueId = issue.id;
    await service.resolveIssue(actorId, orderId, pieceId, issueId, {
      commandId: randomUUID(),
      expectedVersion: await currentVersion(),
      decision: "CANCEL",
      confirmed: true,
      reason: "Complete missing-piece cancellation",
    });
    await recordDownstreamFixture(actorId, orderId, accepted.id, "DISPATCH");
    if (status === "DELIVERED")
      await recordDownstreamFixture(
        actorId,
        orderId,
        accepted.id,
        "CONFIRM_DELIVERY",
      );
    const before = await graph(order.id);
    await expect(
      service.resolveIssue(actorId, order.id, pieceId, issueId, {
        commandId: randomUUID(),
        expectedVersion: await currentVersion(),
        decision: "CANCEL",
        confirmed: true,
        reason: "Cannot cancel",
      }),
    ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
    expect(await graph(order.id)).toEqual(before);
  },
);

const contactFixture = async (ownerKind: "ADMIN" | "SALES" = "ADMIN") => {
  const fixture = await heldFixture(["زبيري - z", "نعام - O"], ownerKind);
  await service.resolveIssue(
    fixture.approvalActorId,
    fixture.order.id,
    fixture.pieceId,
    fixture.issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "SEND_TO_SALES",
      target: "PRODUCTION",
      notes: "Ask customer for the four permitted fields",
    },
  );
  return fixture;
};
it.each(["ADMIN", "SALES"] as const)(
  "stores only pending four-field intent from the actual %s owner",
  async (ownerKind) => {
    const { actorId, order, pieceId, issueId } =
        await contactFixture(ownerKind),
      before = await graph(order.id);
    const changes: {
      model?: string;
      size?: string;
      leatherBase?: string;
      sole?: string | null;
    } = {};
    for (const field of ["model", "size", "leatherBase", "sole"] as const) {
      const entry = await db.catalogEntry.findFirstOrThrow({
        where: {
          kind: field,
          displayValue: {
            not:
              before.captures.find((piece) => piece.id === pieceId)?.[field] ??
              "",
          },
        },
        orderBy: { id: "asc" },
      });
      changes[field] = entry.id;
    }
    const input = submitContactBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 4,
      kind: "AMEND",
      contactNotes: "Exact customer response",
      changes,
    });
    const result = await service.submitContact(
        actorId,
        order.id,
        pieceId,
        issueId,
        input,
      ),
      after = await graph(order.id);
    expect(after.root?.version).toBe(5);
    expect(after.captures).toEqual(before.captures);
    expect(after.pieces).toEqual(before.pieces);
    expect(after.order).toEqual(before.order);
    expect(after.refs).toEqual(before.refs);
    expect(after.issues[0]).toMatchObject({
      state: "REAPPROVAL",
      resumeTarget: "PRODUCTION",
      latestProposalId: result.outcome.proposalId,
    });
    const proposal = after.proposals[0];
    expect(proposal).toMatchObject({
      sequence: 1,
      kind: "AMEND",
      submittedById: actorId,
      contactNotes: "Exact customer response",
      proposedModelId: changes.model,
      proposedSizeId: changes.size,
      proposedLeatherBaseId: changes.leatherBase,
      proposedSoleId: changes.sole,
    });
    expect(
      approvalEventFactsSchema.parse(after.events.at(-1)?.afterFacts).proposal
        ?.submittedBy,
    ).toMatchObject({
      id: actorId,
      role: ownerKind === "ADMIN" ? "ADMIN" : "USER",
      department: ownerKind === "ADMIN" ? null : "SALES",
    });
    expect(
      await service.submitContact(actorId, order.id, pieceId, issueId, input),
    ).toEqual({ ...result, replayed: true });
    expect(await graph(order.id)).toEqual(after);
    expect(await commands.observe(actorId, input.commandId)).toEqual({
      ...result,
      replayed: true,
    });
  },
);
it.each([
  { kind: "AMEND", clear: true },
  { kind: "AMEND", clear: false },
  { kind: "CANCEL_REQUEST", clear: false },
] as const)(
  "retains historical labels/null references without an active catalog for %s",
  async ({ kind, clear }) => {
    const { actorId, order, pieceId, issueId } = await contactFixture();
    // Isolated migrated-style nullable selection references; frozen price/provenance stays intact.
    await db.salesPieceCatalogSelection.deleteMany({
      where: {
        pieceId,
        field: { in: ["model", "size", "leatherBase", "sole"] },
      },
    });
    await db.catalogActivation.update({
      where: { id: "active" },
      data: { sourceId: null, activatedAt: null },
    });
    const before = await graph(order.id);
    const input = submitContactBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 4,
      kind,
      contactNotes: "Customer confirmed",
      ...(kind === "AMEND" ? { changes: clear ? { sole: null } : {} } : {}),
    });
    await service.submitContact(actorId, order.id, pieceId, issueId, input);
    const after = await graph(order.id),
      proposal = after.proposals[0];
    expect(after.captures).toEqual(before.captures);
    expect(after.pieces).toEqual(before.pieces);
    expect(after.order).toEqual(before.order);
    expect(proposal).toMatchObject({
      beforeModel: "SM",
      beforeSize: "40",
      beforeLeatherBase: "synthetic I3",
      beforeModelId: null,
      beforeSizeId: null,
      beforeLeatherBaseId: null,
      proposedModel: kind === "AMEND" ? "SM" : null,
      proposedSole: null,
      proposedSoleId: null,
    });
  },
);
it("rejects unavailable or invalid contact changes and rolls back proposal-before-receipt failure", async () => {
  const { actorId, order, pieceId, issueId } = await contactFixture("SALES"),
    before = await graph(order.id);
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const input = submitContactBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 4,
    kind: "AMEND",
    contactNotes: "Changed field",
    changes: { model: randomUUID() },
  });
  await expect(
    service.submitContact(admin.id, order.id, pieceId, issueId, input),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(
    service.submitContact(actorId, order.id, pieceId, issueId, input),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  const wrong = await db.catalogEntry.findFirstOrThrow({
    where: { kind: "decoration" },
  });
  await expect(
    service.submitContact(actorId, order.id, pieceId, issueId, {
      ...input,
      kind: "AMEND",
      changes: { model: wrong.id },
    }),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(await graph(order.id)).toEqual(before);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION p04_owned_fail_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='SUBMIT_CONTACT' THEN RAISE EXCEPTION 'controlled proposal failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER p04_owned_fail_contact BEFORE INSERT ON approval_commands FOR EACH ROW EXECUTE FUNCTION p04_owned_fail_contact()`,
  );
  try {
    await expect(
      service.submitContact(
        actorId,
        order.id,
        pieceId,
        issueId,
        submitContactBodySchema.parse({ ...input, changes: {} }),
      ),
    ).rejects.toThrow();
    expect(await graph(order.id)).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p04_owned_fail_contact ON approval_commands",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p04_owned_fail_contact()");
  }
  await db.catalogActivation.update({
    where: { id: "active" },
    data: { sourceId: null, activatedAt: null },
  });
  await expect(
    service.submitContact(actorId, order.id, pieceId, issueId, input),
  ).rejects.toMatchObject({ code: "ORDER_CATALOG_UNAVAILABLE" });
  expect(await graph(order.id)).toEqual(before);
});

const submittedContactFixture = async (
  kind: "AMEND" | "CANCEL_REQUEST" = "AMEND",
  notesOnly = false,
) => {
  const fixture = await contactFixture("SALES"),
    changes: {
      model?: string;
      size?: string;
      leatherBase?: string;
      sole?: string | null;
    } = {};
  if (!notesOnly)
    for (const field of ["model", "size", "leatherBase", "sole"] as const) {
      const current = fixture.order.pieces.find(
        (piece) => piece.id === fixture.pieceId,
      )?.[field];
      const entry = await db.catalogEntry.findFirstOrThrow({
        where: { kind: field, displayValue: { not: current ?? "" } },
        orderBy: { id: "asc" },
      });
      changes[field] = entry.id;
    }
  const result = await service.submitContact(
    fixture.actorId,
    fixture.order.id,
    fixture.pieceId,
    fixture.issueId,
    submitContactBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 4,
      kind,
      contactNotes: "Customer private confirmation",
      ...(kind === "AMEND" ? { changes } : {}),
    }),
  );
  const proposalId = result.outcome.proposalId;
  if (proposalId === null) throw new Error("Expected proposal");
  return { ...fixture, proposalId };
};
it("retains a returned proposal and accepts a fresh exact four-field proposal despite catalog deactivation", async () => {
  const { actorId, approvalActorId, order, pieceId, issueId, proposalId } =
    await submittedContactFixture();
  const first = await graph(order.id);
  await service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
    commandId: randomUUID(),
    expectedVersion: 5,
    proposalId,
    decision: "RETURN_TO_SALES",
    reason: "Confirm the customer details again",
  });
  const returned = await graph(order.id);
  expect(returned.captures).toEqual(first.captures);
  expect(returned.pieces).toEqual(first.pieces);
  expect(returned.proposals).toEqual(first.proposals);
  expect(returned.issues[0]).toMatchObject({
    state: "SALES_CONTACT",
    resumeTarget: "PRODUCTION",
    latestProposalId: proposalId,
  });
  const stored = first.proposals[0];
  if (
    stored === undefined ||
    stored.proposedModelId === null ||
    stored.proposedSizeId === null ||
    stored.proposedLeatherBaseId === null ||
    stored.proposedSoleId === null
  )
    throw new Error("Expected complete stored amendment");
  const second = await service.submitContact(
    actorId,
    order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 6,
      kind: "AMEND",
      contactNotes: "Customer reconfirmed four fields",
      changes: {
        model: stored.proposedModelId,
        size: stored.proposedSizeId,
        leatherBase: stored.proposedLeatherBaseId,
        sole: stored.proposedSoleId,
      },
    },
  );
  const latest = second.outcome.proposalId;
  if (latest === null) throw new Error("Expected new proposal");
  const before = await graph(order.id);
  await expect(
    service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
      commandId: randomUUID(),
      expectedVersion: 7,
      proposalId,
      decision: "ACCEPT",
      notes: "Old proposal must not apply",
    }),
  ).rejects.toMatchObject({ code: "APPROVAL_PROPOSAL_CONFLICT" });
  expect(await graph(order.id)).toEqual(before);
  await db.catalogActivation.update({
    where: { id: "active" },
    data: { sourceId: null, activatedAt: null },
  });
  const input = {
    commandId: randomUUID(),
    expectedVersion: 7,
    proposalId: latest,
    decision: "ACCEPT" as const,
    notes: "Resume with these reviewed values",
  };
  const accepted = await service.reviewContact(
      approvalActorId,
      order.id,
      pieceId,
      issueId,
      input,
    ),
    after = await graph(order.id);
  const oldPiece = before.captures.find((piece) => piece.id === pieceId),
    newPiece = after.captures.find((piece) => piece.id === pieceId);
  if (oldPiece === undefined || newPiece === undefined)
    throw new Error("Expected retained capture");
  expect(newPiece).toMatchObject({
    model: stored.proposedModel,
    size: stored.proposedSize,
    leatherBase: stored.proposedLeatherBase,
    sole: stored.proposedSole,
  });
  expect({
    ...newPiece,
    model: oldPiece.model,
    size: oldPiece.size,
    leatherBase: oldPiece.leatherBase,
    sole: oldPiece.sole,
    updatedAt: oldPiece.updatedAt,
  }).toEqual(oldPiece);
  expect(after.captures.find((piece) => piece.id !== pieceId)).toEqual(
    before.captures.find((piece) => piece.id !== pieceId),
  );
  expect(after.pieces.find((piece) => piece.id !== pieceId)).toEqual(
    before.pieces.find((piece) => piece.id !== pieceId),
  );
  expect(after.order).toEqual(before.order);
  expect(after.proposals).toEqual(before.proposals);
  expect(after.pieces.find((piece) => piece.id === pieceId)).toMatchObject({
    stage: "PRODUCTION",
    workState: "INCOMING",
    issueId: null,
    receivedAt: null,
  });
  for (const [field, entryId] of Object.entries({
    model: stored.proposedModelId,
    size: stored.proposedSizeId,
    leatherBase: stored.proposedLeatherBaseId,
    sole: stored.proposedSoleId,
  }))
    expect(after.refs).toContainEqual({ pieceId, field, entryId });
  expect(
    after.refs.filter(
      (ref) =>
        ref.pieceId !== pieceId ||
        !["model", "size", "leatherBase", "sole"].includes(ref.field),
    ),
  ).toEqual(
    before.refs.filter(
      (ref) =>
        ref.pieceId !== pieceId ||
        !["model", "size", "leatherBase", "sole"].includes(ref.field),
    ),
  );
  expect(
    await service.reviewContact(
      approvalActorId,
      order.id,
      pieceId,
      issueId,
      input,
    ),
  ).toEqual({ ...accepted, replayed: true });
  expect(await graph(order.id)).toEqual(after);
});
it("positively releases a notes-only confirmation without applying any new values", async () => {
  const { approvalActorId, order, pieceId, issueId, proposalId } =
      await submittedContactFixture("AMEND", true),
    before = await graph(order.id);
  await service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
    commandId: randomUUID(),
    expectedVersion: 5,
    proposalId,
    decision: "ACCEPT",
    notes: "Confirmed existing specifications",
  });
  const after = await graph(order.id);
  expect(
    after.captures.map(({ updatedAt: _updatedAt, ...piece }) => piece),
  ).toEqual(
    before.captures.map(({ updatedAt: _updatedAt, ...piece }) => piece),
  );
  expect(after.refs).toEqual(before.refs);
  expect(after.order).toEqual(before.order);
  expect(after.pieces.find((piece) => piece.id === pieceId)).toMatchObject({
    stage: "PRODUCTION",
    workState: "INCOMING",
    issueId: null,
  });
});
it.each(["AMEND", "CANCEL_REQUEST"] as const)(
  "cancels retained %s without applying any proposed specification",
  async (kind) => {
    const { approvalActorId, order, pieceId, issueId, proposalId } =
        await submittedContactFixture(kind),
      before = await graph(order.id);
    if (kind === "CANCEL_REQUEST") {
      await expect(
        service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
          commandId: randomUUID(),
          expectedVersion: 5,
          proposalId,
          decision: "ACCEPT",
          notes: "Must not accept cancellation intent",
        }),
      ).rejects.toMatchObject({ code: "APPROVAL_PROPOSAL_CONFLICT" });
      expect(await graph(order.id)).toEqual(before);
    }
    await service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
      commandId: randomUUID(),
      expectedVersion: 5,
      proposalId,
      decision: "CANCEL",
      confirmed: true,
      reason: "Approved customer cancellation",
    });
    const after = await graph(order.id);
    expect(after.captures).toEqual(before.captures);
    expect(after.refs).toEqual(before.refs);
    expect(after.proposals).toEqual(before.proposals);
    expect(after.pieces.find((piece) => piece.id === pieceId)).toMatchObject({
      stage: "CANCELLED",
      issueId: null,
      cancellationReason: "Approved customer cancellation",
    });
    expect(after.pieces.find((piece) => piece.id !== pieceId)).toEqual(
      before.pieces.find((piece) => piece.id !== pieceId),
    );
  },
);
it("rolls back capture, selections, issue and receipt when a dependent selection insert fails", async () => {
  const { approvalActorId, order, pieceId, issueId, proposalId } =
      await submittedContactFixture(),
    before = await graph(order.id);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION p04_owned_fail_selection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled selection failure' USING ERRCODE='23514'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER p04_owned_fail_selection BEFORE INSERT ON sales_piece_catalog_selections FOR EACH ROW EXECUTE FUNCTION p04_owned_fail_selection()`,
  );
  try {
    await expect(
      service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
        commandId: randomUUID(),
        expectedVersion: 5,
        proposalId,
        decision: "ACCEPT",
        notes: "Apply reviewed proposal",
      }),
    ).rejects.toThrow();
    expect(await graph(order.id)).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p04_owned_fail_selection ON sales_piece_catalog_selections",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p04_owned_fail_selection()");
  }
});
it("accepts one of concurrent accept/recontact decisions without an automatic resume from recontact", async () => {
  const { approvalActorId, order, pieceId, issueId, proposalId } =
      await submittedContactFixture(),
    before = await graph(order.id);
  const outcomes = await contendOnRoot(order.id, () => [
    service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
      commandId: randomUUID(),
      expectedVersion: 5,
      proposalId,
      decision: "ACCEPT",
      notes: "Accept reviewed values",
    }),
    service.reviewContact(approvalActorId, order.id, pieceId, issueId, {
      commandId: randomUUID(),
      expectedVersion: 5,
      proposalId,
      decision: "RETURN_TO_SALES",
      reason: "Ask the customer again",
    }),
  ]);
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(outcomes.find((result) => result.status === "rejected")).toMatchObject(
    { reason: { code: "ORDER_VERSION_CONFLICT" } },
  );
  const after = await graph(order.id);
  expect(after.root?.version).toBe(6);
  expect(after.events).toHaveLength(5);
  expect(after.proposals).toEqual(before.proposals);
  if (after.issues[0]?.state === "SALES_CONTACT") {
    expect(after.captures).toEqual(before.captures);
    expect(after.pieces).toEqual(before.pieces);
  } else {
    expect(after.issues[0]?.state).toBe("RESOLVED");
    expect(after.pieces.find((piece) => piece.id === pieceId)).toMatchObject({
      stage: "PRODUCTION",
      workState: "INCOMING",
      issueId: null,
    });
  }
});

// A retained SQL prerequisite fixture, not administration-executor acceptance (T017).
const retainPreapprovalAdministration = async (
  fixture: Awaited<ReturnType<typeof createApprovalOrderFixture>>,
  input: { cancelIds: readonly string[] } | { generalNotes: string },
) =>
  db.$transaction(async (tx) => {
    const root = await tx.salesDraft.findUniqueOrThrow({
      where: { id: fixture.order.id },
      select: SALES_ORDER_SELECT,
    });
    const actor = await loadIdentityAccount(tx, fixture.approvalActorId),
      order = mapSalesOrder(root, actor),
      header = root.order;
    if (!header) throw new Error("Expected submitted header");
    const physicalRows = await tx.salesOrderPiece.findMany({
      where: { orderId: root.id },
    });
    const physicalById = new Map(
      physicalRows.map((piece) => [piece.id, piece]),
    );
    const before = administrationCommandFactsSchema.parse({
      version: root.version,
      status: header.status,
      counts: order.counts,
      money: order.money,
      correction: {
        generalNotes: root.generalNotes,
        customerName: header.customerName,
        customerPhone: header.customerPhone,
        customerEmail: header.customerEmail,
        customerAddress: header.customerAddress,
      },
      pieces: root.pieces
        .map((p) => {
          const physical = physicalById.get(p.id);
          if (!physical) throw new Error("Expected physical identity");
          return {
            id: p.id,
            stage: physical.stage,
            workState: physical.workState,
            issueId: physical.issueId,
            currentWorkVisitId: physical.currentWorkVisitId,
            receivedAt: physical.receivedAt?.toISOString() ?? null,
            cancelledAt: physical.cancelledAt?.toISOString() ?? null,
            cancellationReason: physical.cancellationReason,
          };
        })
        .toSorted((a, b) => a.id.localeCompare(b.id)),
      returnProof:
        header.status === "RETURNED"
          ? {
              decisionId: header.currentReturnDecisionId,
              reason: header.currentReturnReason,
              returnedAt: header.currentReturnedAt?.toISOString(),
              version: header.currentReturnOrderVersion,
            }
          : null,
    });
    const cancel = "cancelIds" in input,
      ids = cancel ? [...input.cancelIds].sort() : [],
      selected = new Set(ids),
      occurredAt = new Date(),
      commandId = randomUUID(),
      reason = cancel
        ? "Administrative cancellation"
        : "Correct current order notes";
    const pieces = before.pieces.map((p) =>
      selected.has(p.id)
        ? {
            ...p,
            stage: "CANCELLED" as const,
            workState: "BLOCKED" as const,
            cancelledAt: occurredAt.toISOString(),
            cancellationReason: reason,
          }
        : p,
    );
    const counts = deriveOrderCounts(pieces),
      money = calculateOrderMoney(
        order.pieces
          .filter((p) => !selected.has(p.id) && p.stage !== "CANCELLED")
          .map((p) => parseMoneyCents(p.unitPrice)),
        parseMoneyCents(order.money.paidAmount),
      );
    const after = administrationCommandFactsSchema.parse({
      ...before,
      version: before.version + 1,
      status: counts.active === 0 ? "CANCELLED" : before.status,
      counts,
      money,
      pieces,
      correction: cancel
        ? before.correction
        : { ...before.correction, generalNotes: input.generalNotes },
      returnProof:
        counts.active === 0
          ? null
          : before.returnProof === null
            ? null
            : { ...before.returnProof, version: before.version + 1 },
    });
    const command = administrationCommandDataSchema.parse({
      receipt: {
        commandId,
        operation: cancel ? "ADMIN_CANCEL" : "ADMIN_CORRECT",
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
        counts,
        money,
        correction: after.correction,
        pieceIds: ids,
      },
    });
    await tx.administrationCommand.create({
      data: {
        commandId,
        operation: command.receipt.operation,
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
        scope: cancel ? "QUANTITY" : null,
        pieceIds: ids,
        beforeFacts: before,
        afterFacts: after,
        outcome: command,
        occurredAt,
      },
    });
    if (cancel) {
      for (const pieceId of ids) {
        const beforePiece = before.pieces.find((p) => p.id === pieceId),
          afterPiece = after.pieces.find((p) => p.id === pieceId);
        if (!beforePiece || !afterPiece)
          throw new Error("Expected selected identity");
        await tx.administrationCancelledPiece.create({
          data: {
            commandId,
            orderId: order.id,
            pieceId,
            beforeFacts: beforePiece,
            afterFacts: afterPiece,
          },
        });
      }
      await tx.salesOrderPiece.updateMany({
        where: { orderId: order.id, id: { in: ids } },
        data: {
          stage: "CANCELLED",
          workState: "BLOCKED",
          cancelledAt: occurredAt,
          cancellationReason: reason,
        },
      });
    } else {
      await tx.administrationOrderCorrection.create({
        data: {
          commandId,
          orderId: order.id,
          afterVersion: after.version,
          customerName: after.correction.customerName,
          customerPhone: after.correction.customerPhone,
          customerEmail: after.correction.customerEmail,
          customerAddress: after.correction.customerAddress,
          beforeValues: before.correction,
          afterValues: after.correction,
          changedFields: ["generalNotes"],
        },
      });
    }
    await tx.salesDraft.update({
      where: { id: order.id },
      data: {
        version: after.version,
        generalNotes: after.correction.generalNotes,
      },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: after.status,
        totalAmount: money.total,
        currentReturnDecisionId: after.returnProof?.decisionId ?? null,
        currentReturnOrderVersion: after.returnProof?.version ?? null,
        currentReturnReason: after.returnProof?.reason ?? null,
        currentReturnedAt:
          after.returnProof === null
            ? null
            : new Date(after.returnProof.returnedAt),
      },
    });
    return command;
  });
const correctionsFor = (order: SalesOrderDto) =>
  returnedOrderCorrectionsSchema.parse({
    deliveryDate: order.deliveryDate,
    generalNotes: order.generalNotes,
    responsibleSignature: order.responsibleSignature,
    repairNote: order.repairNote,
    adjustmentRequested: order.adjustmentRequested,
    adjustmentReason: order.adjustmentReason,
    adjustmentActionTaken: order.adjustmentActionTaken,
    pieces: order.pieces.map(
      ({
        position: _position,
        quantity: _quantity,
        decoration: _decoration,
        decorationEntryId: _entry,
        catalogSourceId: _source,
        unitPrice: _price,
        stage: _stage,
        workState: _work,
        receivedAt: _received,
        cancelledAt: _cancelled,
        cancellationReason: _reason,
        catalogSelections,
        ...piece
      }) => ({
        ...piece,
        catalogSelections:
          catalogSelections === undefined
            ? undefined
            : Object.fromEntries(
                Object.entries(catalogSelections).filter(
                  ([field]) => field !== "decoration",
                ),
              ),
      }),
    ),
  });
it("resubmits a carried return with immutable cancelled pieces, current notes and active-only first approval", async () => {
  const f = await createApprovalOrderFixture(db, "SHOP", [
      "زبيري - z",
      "زبيري - z",
    ]),
    id = f.order.id,
    selected = f.order.pieces[0]?.id;
  if (!selected) throw new Error("Expected selected physical identity");
  const returned = await service.returnInitial(
    f.approvalActorId,
    id,
    returnInitialBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 1,
      reason: "Original return",
      notes: "Original review",
    }),
  );
  await retainPreapprovalAdministration(f, {
    generalNotes: "Current administration notes",
  });
  const cancelled = await retainPreapprovalAdministration(f, {
    cancelIds: [selected],
  });
  const current = (await f.sales.get(f.actorId, id)).order,
    corrections = correctionsFor(current);
  const before = await graph(id),
    originalReturn = await db.approvalCommand.findUniqueOrThrow({
      where: { commandId: returned.receipt.commandId },
    });
  const bad = structuredClone(corrections),
    first = bad.pieces[0];
  if (!first) throw new Error("Expected retained capture");
  first.size = "Altered cancelled size";
  await expect(
    f.sales.resubmit(f.actorId, id, {
      commandId: randomUUID(),
      expectedVersion: cancelled.after.version,
      corrections: bad,
    }),
  ).rejects.toMatchObject({ code: "ORDER_CORRECTION_CONFLICT" });
  expect(await graph(id)).toEqual(before);
  const badReferences = structuredClone(corrections),
    frozen = badReferences.pieces.find((piece) => piece.id === selected);
  if (!frozen) throw new Error("Expected retained cancelled capture");
  frozen.catalogSelections = {
    ...frozen.catalogSelections,
    model: randomUUID(),
  };
  await expect(
    f.sales.resubmit(f.actorId, id, {
      commandId: randomUUID(),
      expectedVersion: cancelled.after.version,
      corrections: badReferences,
    }),
  ).rejects.toMatchObject({ code: "ORDER_CORRECTION_CONFLICT" });
  expect(await graph(id)).toEqual(before);
  const active = corrections.pieces.find((p) => p.id !== selected);
  if (!active) throw new Error("Expected remaining active piece");
  active.size = "40.5";
  if (active.catalogSelections) delete active.catalogSelections.size;
  const resubmitted = await f.sales.resubmit(f.actorId, id, {
    commandId: randomUUID(),
    expectedVersion: cancelled.after.version,
    corrections,
  });
  expect(resubmitted.savedOrder.generalNotes).toBe(
    "Current administration notes",
  );
  const approved = await service.approveInitial(f.approvalActorId, id, {
    commandId: randomUUID(),
    expectedVersion: resubmitted.savedOrder.version,
  });
  expect(approved.outcome.orderStatus).toBe("APPROVED");
  const after = await graph(id);
  expect(after.pieces.find((p) => p.id === selected)).toEqual(
    before.pieces.find((p) => p.id === selected),
  );
  expect(after.workVisits).toHaveLength(1);
  expect(after.workVisits[0]?.pieceId).toBe(active.id);
  expect(after.order?.paidAmount).toEqual(before.order?.paidAmount);
  expect(after.order?.businessNumber).toBe(before.order?.businessNumber);
  expect(
    await db.approvalCommand.findUniqueOrThrow({
      where: { commandId: returned.receipt.commandId },
    }),
  ).toEqual(originalReturn);
});
it("approves only active preapproval members", async () => {
  const f = await createApprovalOrderFixture(db, "SHOP", [
      "زبيري - z",
      "زبيري - z",
    ]),
    selected = f.order.pieces[0]?.id;
  if (!selected) throw new Error("Expected selected piece");
  const cancelled = await retainPreapprovalAdministration(f, {
    cancelIds: [selected],
  });
  const approved = await service.approveInitial(f.approvalActorId, f.order.id, {
    commandId: randomUUID(),
    expectedVersion: cancelled.after.version,
  });
  expect(approved.outcome.orderStatus).toBe("APPROVED");
  expect(
    (await graph(f.order.id)).pieces.find((piece) => piece.id === selected)
      ?.stage,
  ).toBe("CANCELLED");
  expect((await graph(f.order.id)).workVisits).toHaveLength(1);
});
it.each([false, true])(
  "rejects a fully cancelled root without effects after return %s",
  async (returned) => {
    const full = await createApprovalOrderFixture(db, "ACCESSORY", [
      "زبيري - z",
    ]);
    if (returned)
      await service.returnInitial(
        full.approvalActorId,
        full.order.id,
        returnInitialBodySchema.parse({
          commandId: randomUUID(),
          expectedVersion: 1,
          reason: "Confirm details",
        }),
      );
    const last = await retainPreapprovalAdministration(full, {
        cancelIds: full.order.pieces.map((p) => p.id),
      }),
      before = await graph(full.order.id);
    await expect(
      service.approveInitial(full.approvalActorId, full.order.id, {
        commandId: randomUUID(),
        expectedVersion: last.after.version,
      }),
    ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
    expect(await graph(full.order.id)).toEqual(before);
    await expect(
      full.sales.resubmit(full.actorId, full.order.id, {
        commandId: randomUUID(),
        expectedVersion: last.after.version,
        corrections: correctionsFor(full.order),
      }),
    ).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
    expect(await graph(full.order.id)).toEqual(before);
  },
);
