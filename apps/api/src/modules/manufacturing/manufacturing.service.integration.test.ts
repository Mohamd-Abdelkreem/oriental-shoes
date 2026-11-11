import { ManufacturingService } from "./manufacturing.service.js";
import { ManufacturingCommandExecutor } from "./manufacturing-command-executor.js";
import { randomUUID } from "node:crypto";
import { salesOrderTypeSchema, salesUuidSchema } from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import { createManufacturingFixture } from "../../test-support/manufacturing.fixture.js";
import { createP05LegacyUpgradeFixture } from "../../test-support/p05-legacy-upgrade.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { ApprovalService } from "../approval/approval.service.js";
import {
  loadIdentityAccount,
  lockAccountRows,
} from "../auth/account-authority.js";
import { openQualityCorrectionVisit } from "./manufacturing-work.lifecycle.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated integration database required");
const db = createDatabaseClient(uri);
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
const orderGraph = async (orderId: string) => ({
  root: await db.salesDraft.findUnique({ where: { id: orderId } }),
  header: await db.salesOrder.findUnique({ where: { id: orderId } }),
  pieces: await db.salesOrderPiece.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  }),
  visits: await db.manufacturingWorkVisit.findMany({
    where: { orderId },
    orderBy: [{ pieceId: "asc" }, { sequence: "asc" }],
  }),
  approval: await db.approvalCommand.findMany({
    where: { orderId },
    orderBy: { afterVersion: "asc" },
  }),
  issues: await db.manufacturingIssue.findMany({
    where: { orderId },
    orderBy: [{ pieceId: "asc" }, { cycle: "asc" }],
  }),
  events: await db.manufacturingPieceEvent.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  }),
});

describe("P05 lifecycle", () => {
  it.each(salesOrderTypeSchema.options)(
    "opens source-bound cutting visits and follows normal cutting/production routing for %s",
    async (type) => {
      const fixture = await createManufacturingFixture(db, type);
      const pieces = await db.salesOrderPiece.findMany({
        where: { orderId: fixture.order.id },
        orderBy: { id: "asc" },
      });
      const visits = await db.manufacturingWorkVisit.findMany({
        where: { orderId: fixture.order.id },
        orderBy: { pieceId: "asc" },
      });
      expect(visits).toHaveLength(2);
      for (const [index, piece] of pieces.entries()) {
        const visit = visits[index];
        expect(piece).toMatchObject({
          stage: "CUTTING",
          workState: "INCOMING",
          receivedAt: null,
          currentWorkVisitId: visit?.id,
        });
        expect(visit).toMatchObject({
          pieceId: piece.id,
          sequence: 1,
          originKind: "INITIAL_APPROVAL",
          sourceDepartment: "APPROVAL",
          sourceApprovalCommandId: fixture.released.receipt.commandId,
          enteredAt: new Date(fixture.released.receipt.occurredAt),
          startedAt: null,
          receivedAt: null,
          endedAt: null,
          legacyUnknownStart: false,
        });
      }
      const service = new ManufacturingService(
        db,
        new ManufacturingCommandExecutor(db),
      );
      let version = 2;
      const beforeHeader = await db.salesOrder.findUniqueOrThrow({
        where: { id: fixture.order.id },
      });
      for (const [actorId, department, operation] of [
        [fixture.cuttingA, "CUTTING", "RECEIVE_AND_START"],
        [fixture.cuttingB, "CUTTING", "COMPLETE_TRANSFER"],
        [fixture.productionA, "PRODUCTION", "RECEIVE_AND_START"],
        [fixture.productionB, "PRODUCTION", "COMPLETE_TRANSFER"],
      ] as const) {
        await service.execute(actorId, department, {
          commandId: randomUUID(),
          operation,
          orders: [
            {
              orderId: fixture.order.id,
              expectedVersion: version,
              pieceIds: pieces.map((p) => p.id),
            },
          ],
        });
        version++;
      }
      const after = await service.getOrder(
        fixture.cuttingA,
        "CUTTING",
        fixture.order.id,
      );
      expect(
        after.paper.order.pieces.every(
          (p) =>
            p.stage === "QUALITY" &&
            p.workState === "INCOMING" &&
            p.receivedAt === null,
        ),
      ).toBe(true);
      expect(after.paper.order.counts).toMatchObject({
        original: 2,
        active: 2,
        received: 0,
        completionPercent: 0,
      });
      expect(
        await db.salesOrder.findUniqueOrThrow({
          where: { id: fixture.order.id },
        }),
      ).toEqual(beforeHeader);
    },
  );

  it("holds one incoming piece, returns it with a new visit and preserves companion work and earlier history", async () => {
    const fixture = await createManufacturingFixture(db);
    const pieceId = fixture.order.pieces[0]?.id,
      companionId = fixture.order.pieces[1]?.id;
    if (!pieceId || !companionId) throw new Error("Expected two exact pieces");
    const before = await db.salesOrderPiece.findUniqueOrThrow({
      where: { id: companionId },
    });
    const firstVisit = await db.manufacturingWorkVisit.findFirstOrThrow({
      where: { pieceId },
    });
    const report = await fixture.approval.reportIssue(
      fixture.cuttingB,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Material needs review",
        notes: null,
      },
    );
    const issueId = report.outcome.issueId;
    if (!issueId) throw new Error("Expected issue receipt");
    expect(
      await db.manufacturingWorkVisit.findUniqueOrThrow({
        where: { id: firstVisit.id },
      }),
    ).toMatchObject({
      originKind: firstVisit.originKind,
      sourceApprovalCommandId: firstVisit.sourceApprovalCommandId,
      startedAt: null,
      receivedAt: null,
      endReason: "ISSUE_REPORTED",
      endApprovalCommandId: report.receipt.commandId,
      endManufacturingCommandId: null,
      destination: null,
    });
    expect(
      await db.salesOrderPiece.findUniqueOrThrow({ where: { id: pieceId } }),
    ).toMatchObject({
      workState: "BLOCKED",
      issueId,
      currentWorkVisitId: null,
    });
    expect(
      await db.salesOrderPiece.findUniqueOrThrow({
        where: { id: companionId },
      }),
    ).toEqual(before);
    const returned = await fixture.approval.resolveIssue(
      fixture.approvalActorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: 3,
        decision: "RETURN_TO_DEPARTMENT",
        target: "CUTTING",
        notes: "Use approved material",
      },
    );
    const next = await db.manufacturingWorkVisit.findFirstOrThrow({
      where: { pieceId, endedAt: null },
    });
    expect(next.id).not.toBe(firstVisit.id);
    expect(next).toMatchObject({
      sequence: 2,
      originKind: "APPROVAL_RETURN",
      sourceIssueId: issueId,
      sourceApprovalCommandId: returned.receipt.commandId,
      instructions: "Use approved material",
      startedAt: null,
      receivedAt: null,
    });
    expect(
      await new ApprovalCommandExecutor(db).observe(
        fixture.cuttingB,
        report.receipt.commandId,
      ),
    ).toEqual({ ...report, replayed: true });
    expect(
      await db.salesOrderPiece.findUniqueOrThrow({
        where: { id: companionId },
      }),
    ).toEqual(before);
  });

  it("keeps contact holds unstarted until an actual positive review, then preserves reported history on cancellation", async () => {
    const fixture = await createManufacturingFixture(db),
      pieceId = fixture.order.pieces[0]?.id;
    if (!pieceId) throw new Error("Expected exact piece");
    const report = await fixture.approval.reportIssue(
      fixture.cuttingA,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Check size",
        notes: null,
      },
    );
    const issueId = report.outcome.issueId;
    if (!issueId) throw new Error("Expected issue");
    await fixture.approval.resolveIssue(
      fixture.approvalActorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: 3,
        decision: "SEND_TO_SALES",
        target: "PRODUCTION",
        notes: "Confirm source",
      },
    );
    const submitted = await fixture.approval.submitContact(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: 4,
        kind: "AMEND",
        contactNotes: "Customer confirmed",
        changes: {},
      },
    );
    const proposalId = submitted.outcome.proposalId;
    if (!proposalId) throw new Error("Expected proposal");
    await fixture.approval.reviewContact(
      fixture.approvalActorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: 5,
        proposalId,
        decision: "RETURN_TO_SALES",
        reason: "Confirm again",
      },
    );
    expect(
      await db.manufacturingWorkVisit.count({
        where: { pieceId, endedAt: null },
      }),
    ).toBe(0);
    expect(await db.manufacturingWorkVisit.count({ where: { pieceId } })).toBe(
      1,
    );
    const resubmitted = await fixture.approval.submitContact(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: 6,
        kind: "AMEND",
        contactNotes: "Confirmed again",
        changes: {},
      },
    );
    const latestProposalId = resubmitted.outcome.proposalId;
    if (!latestProposalId) throw new Error("Expected proposal");
    const accepted = await fixture.approval.reviewContact(
      fixture.approvalActorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: 7,
        proposalId: latestProposalId,
        decision: "ACCEPT",
        notes: "Approved production guidance",
      },
    );
    const production = await db.manufacturingWorkVisit.findFirstOrThrow({
      where: { pieceId, endedAt: null },
    });
    expect(production).toMatchObject({
      department: "PRODUCTION",
      sequence: 2,
      sourceApprovalCommandId: accepted.receipt.commandId,
      instructions: "Approved production guidance",
      receivedAt: null,
      startedAt: null,
    });
    const laterReport = await fixture.approval.reportIssue(
      fixture.productionB,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 8,
        reason: "Cancel this piece",
        notes: null,
      },
    );
    const laterIssueId = laterReport.outcome.issueId;
    if (!laterIssueId) throw new Error("Expected later issue");
    const ended = await db.manufacturingWorkVisit.findUniqueOrThrow({
      where: { id: production.id },
    });
    await fixture.approval.resolveIssue(
      fixture.approvalActorId,
      fixture.order.id,
      pieceId,
      laterIssueId,
      {
        commandId: randomUUID(),
        expectedVersion: 9,
        decision: "CANCEL",
        reason: "Confirmed cancellation",
        confirmed: true,
      },
    );
    expect(
      await db.manufacturingWorkVisit.findUniqueOrThrow({
        where: { id: production.id },
      }),
    ).toEqual(ended);
    expect(
      await db.salesOrderPiece.findUniqueOrThrow({ where: { id: pieceId } }),
    ).toMatchObject({ stage: "CANCELLED", currentWorkVisitId: null });
  });

  it("rolls back initial approval and earlier piece visits when a required later visit insertion fails", async () => {
    const fixture = await createApprovalOrderFixture(db, "SHOP", [
      "زبيري - z",
      "زبيري - z",
    ]);
    const secondId = salesUuidSchema.parse(fixture.order.pieces[1]?.id),
      before = await orderGraph(fixture.order.id);
    try {
      await db.$executeRawUnsafe(
        `CREATE FUNCTION p05_lifecycle_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.piece_id='${secondId}'::uuid THEN RAISE EXCEPTION 'Owned lifecycle failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        "CREATE TRIGGER p05_lifecycle_test_fault BEFORE INSERT ON manufacturing_work_visits FOR EACH ROW EXECUTE FUNCTION p05_lifecycle_test_fault()",
      );
      const approval = new ApprovalService(
        db,
        new ApprovalCommandExecutor(db),
        "UTC",
      );
      await expect(
        approval.approveInitial(fixture.approvalActorId, fixture.order.id, {
          commandId: randomUUID(),
          expectedVersion: 1,
        }),
      ).rejects.toThrow("Owned lifecycle failure");
      expect(await orderGraph(fixture.order.id)).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(
        "DROP TRIGGER IF EXISTS p05_lifecycle_test_fault ON manufacturing_work_visits",
      );
      await db.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS p05_lifecycle_test_fault()",
      );
    }
  });

  it("consumes an isolated future quality source with one shared version witness and distinct piece cycles", async () => {
    const fixture = await createP05LegacyUpgradeFixture(
      "PRE_P05_QUALITY_SOURCE",
    );
    try {
      const actorId = fixture.qualityActorId;
      if (!actorId) throw new Error("Expected legacy source actor");
      const correctionId = randomUUID(),
        occurredAt = new Date();
      await fixture.database.$transaction(async (tx) => {
        await lockAccountRows(tx, [actorId], "read");
        const actor = await loadIdentityAccount(tx, actorId);
        await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${fixture.orderId}::uuid FOR UPDATE`;
        for (const [index, pieceId] of fixture.pieceIds.entries()) {
          await openQualityCorrectionVisit(tx, {
            actor,
            orderId: fixture.orderId,
            pieceId,
            expectedVersion: 1,
            target: index === 0 ? "CUTTING" : "PRODUCTION",
            correctionId,
            correctionCycle: index + 7,
            instructions: "Isolated future-source guidance",
            occurredAt,
          });
        }
        expect(
          (
            await tx.salesDraft.updateMany({
              where: { id: fixture.orderId, version: 1 },
              data: { version: { increment: 1 } },
            })
          ).count,
        ).toBe(1);
      });
      const visits = await fixture.database.manufacturingWorkVisit.findMany({
        where: { orderId: fixture.orderId },
      });
      expect(visits).toHaveLength(2);
      expect(visits.map((visit) => visit.sourceCorrectionCycle).sort()).toEqual(
        [7, 8],
      );
      for (const visit of visits)
        expect(visit).toMatchObject({
          originKind: "QUALITY_CORRECTION",
          sourceDepartment: "QUALITY",
          sourceReferenceId: correctionId,
          sourceOrderVersion: 2,
          receivedAt: null,
          startedAt: null,
          legacyUnknownStart: false,
        });
    } finally {
      await fixture.dispose();
    }
  });
});
