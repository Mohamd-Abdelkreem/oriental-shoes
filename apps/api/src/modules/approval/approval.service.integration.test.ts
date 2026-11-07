import {
  submitContactBodySchema,
  reportIssueBodySchema,
  approvalEventFactsSchema,
  approveInitialBodySchema,
  returnInitialBodySchema,
  resubmitOrderBodySchema,
  salesOrderTypeSchema,
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
    // Isolated downstream state, not evidence of P05/P06 work execution.
    await db.salesOrderPiece.update({
      where: { id: pieceId },
      data: { stage: department, workState: "IN_PROGRESS" },
    });
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
        expectedVersion: 2,
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
    expect(after.issues[0]).toMatchObject({
      sourceDepartment: department,
      sourceStage: department,
      sourceWorkState: "IN_PROGRESS",
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
        expectedVersion: 3,
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
it.each(["OUT_FOR_DELIVERY", "DELIVERED"] as const)(
  "denies cancellation on isolated downstream %s state",
  async (status) => {
    const { actorId, order, pieceId, issueId } = await heldFixture();
    // Isolated denial setup, not evidence of dispatch/delivery implementation.
    await db.salesOrder.update({ where: { id: order.id }, data: { status } });
    const before = await graph(order.id);
    await expect(
      service.resolveIssue(actorId, order.id, pieceId, issueId, {
        commandId: randomUUID(),
        expectedVersion: 3,
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
it("denies another-owner ADMIN, inactive/unknown/wrong-kind changes and rolls back proposal-before-receipt failure", async () => {
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
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
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
