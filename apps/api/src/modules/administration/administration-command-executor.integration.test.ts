import { administrationCommandDataSchema } from "@template/contracts";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import { createP05LegacyUpgradeFixture } from "../../test-support/p05-legacy-upgrade.fixture.js";
import { ApprovalService } from "../approval/approval.service.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { WarehouseCommandExecutor } from "../warehouse/warehouse-command-executor.js";
import {
  qualityCommandBodySchema,
  warehouseCommandBodySchema,
  resubmitOrderBodySchema,
} from "@template/contracts";
import { AdministrationCommandExecutor } from "./administration-command-executor.js";
import { AdministrationService } from "./administration.service.js";
import { createManufacturingFixture } from "../../test-support/manufacturing.fixture.js";
import { ManufacturingCommandExecutor } from "../manufacturing/manufacturing-command-executor.js";
import { ManufacturingService } from "../manufacturing/manufacturing.service.js";
import { createApp } from "../../app.js";
import { businessTestHeaders } from "../../test-support/business-http.fixture.js";
import {
  manufacturingOrderDataSchema,
  successEnvelopeSchema,
} from "@template/contracts";
import pino from "pino";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  administrationCommandBodySchema,
  type AdministrationCommandBody,
} from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import {
  lockAccountRows,
  loadIdentityAccount,
  assertBusinessAuthority,
} from "../auth/account-authority.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
import { ADMINISTRATION_ORDER_SELECT } from "./administration.mapper.js";
import {
  mapAdministrationCommandFacts,
  planAdministrativeCancellation,
  planAdministrativeCorrection,
} from "./administration.rules.js";
import {
  persistAdministrationCommand,
  applyAdministrativeCancellation,
  applyAdministrativeCorrection,
  lockAdministrationCommandIds,
} from "./administration-command.writer.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri);
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const graph = () => db.$queryRaw`SELECT jsonb_build_object(
 'roots',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_drafts r),
 'headers',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_orders r),
 'pieces',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_order_pieces r),
 'specifications',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_draft_pieces r),
 'customers',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM customers r),
 'sales',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM sales_commands r),
 'issues',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_issues r),
 'proposals',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM piece_contact_proposals r),
 'approval',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM approval_commands r),
 'visits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_work_visits r),
 'qualityVisits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_work_visits r),
 'cycles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_correction_cycles r),
 'administration',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM administration_commands r),
 'cancellations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,piece_id) FROM administration_cancelled_pieces r),
 'corrections',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM administration_order_corrections r)) AS graph`;
const write = async (
  actorId: string,
  body: AdministrationCommandBody,
  failLate = false,
) =>
  db.$transaction(
    async (tx) => {
      await lockAccountRows(tx, [actorId], "read");
      const actor = await loadIdentityAccount(tx, actorId);
      assertBusinessAuthority(actor);
      await lockAdministrationCommandIds(tx, [body.commandId]);
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${body.orderId}::uuid FOR UPDATE`;
      const root = await tx.salesDraft.findUniqueOrThrow({
        where: { id: body.orderId },
        select: ADMINISTRATION_ORDER_SELECT,
      });
      await tx.$queryRaw`SELECT id FROM sales_order_pieces WHERE order_id=${body.orderId}::uuid ORDER BY id FOR UPDATE`;
      const occurredAt = new Date(),
        before = mapAdministrationCommandFacts(root);
      if (body.operation === "ADMIN_CANCEL") {
        const plan = planAdministrativeCancellation({
          root,
          body,
          actor,
          occurredAt,
        });
        await persistAdministrationCommand(tx, {
          plan,
          actor,
          occurredAt,
          payloadHash: "a".repeat(64),
        });
        await applyAdministrativeCancellation(tx, { root, plan });
        if (failLate)
          await tx.administrationCancelledPiece.create({
            data: {
              commandId: body.commandId,
              orderId: root.id,
              pieceId: body.pieceIds[0] ?? "",
              beforeFacts: plan.before.pieces[0] ?? {},
              afterFacts: plan.after.pieces[0] ?? {},
            },
          });
        return plan;
      }
      const plan = planAdministrativeCorrection({
        root,
        body,
        actor,
        occurredAt,
        effective: before.correction,
      });
      await persistAdministrationCommand(tx, {
        plan,
        actor,
        occurredAt,
        payloadHash: "b".repeat(64),
      });
      await applyAdministrativeCorrection(tx, { root, plan });
      return plan;
    },
    { timeout: 10000 },
  );
const cancelBody = (
  orderId: string,
  expectedVersion: number,
  pieceIds: string[],
) =>
  administrationCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "ADMIN_CANCEL",
    orderId,
    expectedVersion,
    scope: "QUANTITY",
    pieceIds,
  });

const salesContactFixture = async (history: "FIRST" | "RETURNED") => {
  const f = await createApprovalOrderFixture(
    db,
    "SHOP",
    ["زبيري - z", "نعام - O"],
    "SALES",
  );
  const approval = new ApprovalService(
    db,
    new ApprovalCommandExecutor(db),
    "UTC",
  );
  const version = async () =>
    (await db.salesDraft.findUniqueOrThrow({ where: { id: f.order.id } }))
      .version;
  await approval.approveInitial(f.approvalActorId, f.order.id, {
    commandId: randomUUID(),
    expectedVersion: await version(),
  });
  const pieceId = f.order.pieces[0]?.id;
  if (!pieceId) throw new Error("Selected held piece required");
  const report = await approval.reportIssue(
    f.approvalActorId,
    f.order.id,
    pieceId,
    {
      commandId: randomUUID(),
      expectedVersion: await version(),
      reason: "Manufacturing issue",
      notes: "Original reporter note",
    },
  );
  const issueId = report.outcome.issueId;
  if (!issueId) throw new Error("Retained issue required");
  await approval.resolveIssue(f.approvalActorId, f.order.id, pieceId, issueId, {
    commandId: randomUUID(),
    expectedVersion: await version(),
    decision: "SEND_TO_SALES",
    target: "PRODUCTION",
    notes: "Contact customer",
  });
  let proposalId: string | null = null;
  if (history === "RETURNED") {
    const model = await db.catalogEntry.findFirstOrThrow({
      where: {
        kind: "model",
        displayValue: { not: f.order.pieces[0]?.model ?? "" },
      },
      orderBy: { id: "asc" },
    });
    const submitted = await approval.submitContact(
      f.actorId,
      f.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: await version(),
        kind: "AMEND",
        contactNotes: "Customer requested another model",
        changes: { model: model.id },
      },
    );
    proposalId = submitted.outcome.proposalId;
    if (!proposalId) throw new Error("Retained amendment required");
    await approval.reviewContact(
      f.approvalActorId,
      f.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: await version(),
        proposalId,
        decision: "RETURN_TO_SALES",
        reason: "Reconfirm requested model",
      },
    );
  }
  const issue = await db.manufacturingIssue.findUniqueOrThrow({
    where: { id: issueId },
  });
  expect(issue).toMatchObject({
    state: "SALES_CONTACT",
    latestProposalId: proposalId,
    resumeTarget: "PRODUCTION",
    resolvedAt: null,
    resolutionCommandId: null,
    resolutionAdministrationCommandId: null,
  });
  return { ...f, pieceId, issue, version };
};

it.each(["FIRST", "RETURNED"] as const)(
  "cancels an exact SALES_CONTACT piece with %s history, preserving provenance, companion and original-result replay",
  async (history) => {
    const f = await salesContactFixture(history);
    const root = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: ADMINISTRATION_ORDER_SELECT,
    });
    const proposals = await db.pieceContactProposal.findMany();
    const approvalCommands = await db.approvalCommand.findMany({
      orderBy: { commandId: "asc" },
    });
    const pieces = await db.salesOrderPiece.findMany({
      where: { orderId: root.id },
      orderBy: { id: "asc" },
    });
    const specifications = await db.salesDraftPiece.findMany({
      where: { draftId: root.id },
      orderBy: { id: "asc" },
    });
    const visits = await db.manufacturingWorkVisit.findMany({
      orderBy: { id: "asc" },
    });
    const receipts = await db.warehouseReceiptPiece.findMany();
    const executor = new AdministrationCommandExecutor(db, () => new Date());
    const body = cancelBody(root.id, root.version, [f.pieceId]);
    const accepted = await executor.execute({
      actorId: f.approvalActorId,
      body,
    });
    expect(accepted.replayed).toBe(false);
    expect(accepted.after.version).toBe(root.version + 1);
    expect(accepted.result.pieceIds).toEqual([f.pieceId]);
    const after = await db.salesDraft.findUniqueOrThrow({
      where: { id: root.id },
      select: ADMINISTRATION_ORDER_SELECT,
    });
    expect(mapAdministrationCommandFacts(after)).toEqual(accepted.after);
    const companion = pieces.find((piece) => piece.id !== f.pieceId);
    if (!companion) throw new Error("Untouched companion required");
    expect(
      await db.salesOrderPiece.findUniqueOrThrow({
        where: { id: companion.id },
      }),
    ).toEqual(companion);
    expect(accepted.after.money).toEqual({
      total: companion.unitPrice.toFixed(2),
      paidAmount: "100.50",
      remainingDue: companion.unitPrice.minus("100.50").toFixed(2),
      surplus: "0.00",
    });
    expect(accepted.after.counts).toMatchObject({ active: 1, cancelled: 1 });
    expect(
      await db.administrationCancelledPiece.findFirstOrThrow({
        where: { commandId: body.commandId },
      }),
    ).toMatchObject({
      orderId: root.id,
      pieceId: f.pieceId,
      beforeFacts: accepted.before.pieces.find(
        (piece) => piece.id === f.pieceId,
      ),
      afterFacts: accepted.after.pieces.find((piece) => piece.id === f.pieceId),
    });
    expect(
      await db.salesOrderPiece.findUniqueOrThrow({ where: { id: f.pieceId } }),
    ).toMatchObject({
      stage: "CANCELLED",
      workState: "BLOCKED",
      issueId: null,
      cancelledAt: new Date(accepted.receipt.occurredAt),
    });
    expect(
      await db.manufacturingIssue.findUniqueOrThrow({
        where: { id: f.issue.id },
      }),
    ).toEqual({
      ...f.issue,
      state: "RESOLVED",
      resolvedAt: new Date(accepted.receipt.occurredAt),
      updatedAt: new Date(accepted.receipt.occurredAt),
      resolutionCommandId: null,
      resolutionAdministrationCommandId: body.commandId,
    });
    expect(await db.pieceContactProposal.findMany()).toEqual(proposals);
    expect(
      await db.approvalCommand.findMany({ orderBy: { commandId: "asc" } }),
    ).toEqual(approvalCommands);
    expect(
      await db.salesDraftPiece.findMany({
        where: { draftId: root.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(specifications);
    expect(
      await db.manufacturingWorkVisit.findMany({ orderBy: { id: "asc" } }),
    ).toEqual(visits);
    expect(await db.warehouseReceiptPiece.findMany()).toEqual(receipts);
    const activity = await f.sales.activity(
      f.actorId,
      { page: 1, limit: 100 },
      root.id,
    );
    const entry = activity.events.find(
      (item) =>
        item.kind === "administration" && item.event.id === body.commandId,
    );
    if (entry?.kind !== "administration")
      throw new Error("Owner cancellation history required");
    const event = entry.event;
    expect(event).toMatchObject({ operation: "ADMIN_CANCEL" });
    for (const field of [
      "reason",
      "before",
      "after",
      "customerPhone",
      "paidAmount",
    ])
      expect(JSON.stringify(event)).not.toContain(`"${field}"`);
    const admin = new AdministrationService(db, executor, {
      businessTimeZone: "UTC",
      now: () => new Date(),
    });
    const fullHistory = await admin.activity(f.approvalActorId, {
      page: 1,
      limit: 100,
      search: undefined,
    });
    expect(
      fullHistory.events.find(
        (item) =>
          item.kind === "administration" && item.event.id === body.commandId,
      ),
    ).toBeDefined();
    const committed = await graph();
    expect(
      await executor.execute({ actorId: f.approvalActorId, body }),
    ).toEqual({ ...accepted, replayed: true });
    expect(await executor.observe(f.approvalActorId, body.commandId)).toEqual({
      ...accepted,
      replayed: true,
    });
    await expect(
      executor.execute({
        actorId: f.approvalActorId,
        body: { ...body, reason: "Changed intent" },
      }),
    ).rejects.toMatchObject({ code: "ADMINISTRATION_COMMAND_CONFLICT" });
    expect(await graph()).toEqual(committed);
    expect(await db.administrationCommand.count()).toBe(1);
    expect(await db.administrationCancelledPiece.count()).toBe(1);
  },
);

it.each(["FIRST", "RETURNED"] as const)(
  "rolls back the complete SALES_CONTACT %s graph after a real late child failure",
  async (history) => {
    const f = await salesContactFixture(history);
    const before = await graph();
    await expect(
      write(
        f.approvalActorId,
        cancelBody(f.order.id, await f.version(), [f.pieceId]),
        true,
      ),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await graph()).toEqual(before);
  },
);

it("writer cancels live quality members atomically with actual admin provenance and preserves companion work", async () => {
  const f = await createQualityFixture(db),
    pieceIds = f.order.pieces.map((piece) => piece.id);
  await new QualityCommandExecutor(db).execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [{ orderId: f.order.id, expectedVersion: f.version, pieceIds }],
    },
  });
  const original = await db.qualityWorkVisit.findMany({
      where: { orderId: f.order.id },
      orderBy: { pieceId: "asc" },
    }),
    root = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: ADMINISTRATION_ORDER_SELECT,
    });
  const selected = pieceIds[0];
  if (!selected) throw new Error("Selected member required");
  const plan = await write(
    f.approvalActorId,
    cancelBody(root.id, root.version, [selected]),
  );
  expect(
    mapAdministrationCommandFacts(
      await db.salesDraft.findUniqueOrThrow({
        where: { id: root.id },
        select: ADMINISTRATION_ORDER_SELECT,
      }),
    ),
  ).toEqual(plan.after);
  const visits = await db.qualityWorkVisit.findMany({
    where: { orderId: root.id },
    orderBy: { pieceId: "asc" },
  });
  for (const visit of visits) {
    const prior = original.find((row) => row.id === visit.id);
    expect(prior).toBeDefined();
    if (visit.pieceId === selected) {
      expect(visit).toMatchObject({
        endReason: "CANCELLED",
        endAdministrationCommandId: plan.body.commandId,
        startedCommandId: prior?.startedCommandId,
        startedAt: prior?.startedAt,
      });
    } else expect(visit).toEqual(prior);
  }
  expect(await db.administrationCommand.count()).toBe(1);
  expect(await db.administrationCancelledPiece.count()).toBe(1);
});
it("writer appends effective correction without changing original contact, customer, submitted revision or physical lifecycle", async () => {
  const f = await createQualityFixture(db),
    root = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: ADMINISTRATION_ORDER_SELECT,
    });
  const header = await db.salesOrder.findUniqueOrThrow({
      where: { id: root.id },
    }),
    customer = await db.customer.findUniqueOrThrow({
      where: { id: root.customerId ?? "" },
    }),
    sales = await db.salesCommand.findMany({
      where: { draftId: root.id },
      orderBy: { commandId: "asc" },
    }),
    physical = await db.salesOrderPiece.findMany({
      where: { orderId: root.id },
      orderBy: { id: "asc" },
    });
  const plan = await write(
    f.approvalActorId,
    administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: root.id,
      expectedVersion: root.version,
      patch: {
        generalNotes: "Corrected notes",
        customerName: "Corrected order name",
        customerAddress: null,
      },
      reason: "Fix copied contact",
    }),
  );
  expect(
    mapAdministrationCommandFacts(
      await db.salesDraft.findUniqueOrThrow({
        where: { id: root.id },
        select: ADMINISTRATION_ORDER_SELECT,
      }),
    ),
  ).toEqual(plan.after);
  expect(
    await db.salesOrder.findUniqueOrThrow({ where: { id: root.id } }),
  ).toEqual(header);
  expect(
    await db.customer.findUniqueOrThrow({
      where: { id: root.customerId ?? "" },
    }),
  ).toEqual(customer);
  expect(
    await db.salesCommand.findMany({
      where: { draftId: root.id },
      orderBy: { commandId: "asc" },
    }),
  ).toEqual(sales);
  expect(
    await db.salesOrderPiece.findMany({
      where: { orderId: root.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(physical);
  expect(
    await db.administrationOrderCorrection.findUniqueOrThrow({
      where: { commandId: plan.body.commandId },
      select: { changedFields: true },
    }),
  ).toEqual({
    changedFields: ["customerAddress", "customerName", "generalNotes"],
  });
});
it("corrects several physical pieces atomically and projects their revised paper to the factory", async () => {
  const fixture = await createQualityFixture(db);
  const [first, second] = fixture.order.pieces;
  if (!first?.decoration || !second)
    throw new Error("Two physical pieces required");
  const decoration = await db.catalogEntry.findFirstOrThrow({
    where: { kind: "decoration", displayValue: { not: first.decoration } },
  });
  const executor = new AdministrationCommandExecutor(db, () => new Date());
  const body = administrationCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "ADMIN_CORRECT",
    orderId: fixture.order.id,
    expectedVersion: fixture.version,
    reason: "Match confirmed paper specifications",
    patch: {
      paper: {
        deliveryDate: "2026-12-15",
        responsibleSignature: "Corrected signature",
        pieces: [
          {
            pieceId: first.id,
            changes: {
              decoration: decoration.id,
              face: "Corrected face",
              paperCodes: ["H"],
            },
          },
          {
            pieceId: second.id,
            changes: {
              sideNotes: "Corrected measurements note",
              paperCodes: ["X"],
            },
          },
        ],
      },
    },
  });
  if (body.operation !== "ADMIN_CORRECT" || !body.patch.paper)
    throw new Error("Correction body required");
  const invalid = {
    ...body,
    patch: {
      paper: {
        ...body.patch.paper,
        pieces: [
          ...(body.patch.paper.pieces ?? []),
          { pieceId: randomUUID(), changes: { face: "Other order" } },
        ],
      },
    },
  };
  await expect(
    executor.execute({ actorId: fixture.approvalActorId, body: invalid }),
  ).rejects.toMatchObject({ code: "ADMINISTRATION_SELECTION_CONFLICT" });
  expect(await db.administrationCommand.count()).toBe(0);
  await expect(
    executor.execute({ actorId: fixture.cuttingA, body }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const saved = await executor.execute({
    actorId: fixture.approvalActorId,
    body,
  });
  expect(saved.after.pieces).toEqual(saved.before.pieces);
  expect(saved.after.money).toEqual(saved.before.money);
  expect(saved.receipt.afterVersion).toBe(fixture.version + 1);
  expect(
    saved.before.correction.paper?.pieces.find(
      (piece) => piece.pieceId === first.id,
    )?.specifications.decoration,
  ).toBe(first.decoration);
  const factory = await new ApprovalService(
    db,
    new ApprovalCommandExecutor(db),
    "UTC",
  ).factoryPaper(fixture.qualityA, fixture.order.id);
  expect(factory.order.deliveryDate).toBe("2026-12-15");
  const official = await new ApprovalService(
    db,
    new ApprovalCommandExecutor(db),
    "UTC",
  ).officialPaper(fixture.approvalActorId, fixture.order.id);
  expect(official.order.responsibleSignature).toBe("Corrected signature");
  expect(factory.order.pieces).toEqual([
    expect.objectContaining({
      id: first.id,
      decoration: decoration.displayValue,
      face: "Corrected face",
      paperCodes: ["H"],
    }),
    expect.objectContaining({
      id: second.id,
      sideNotes: "Corrected measurements note",
      paperCodes: ["X"],
    }),
  ]);
  await expect(
    executor.execute({ actorId: fixture.approvalActorId, body }),
  ).resolves.toMatchObject({ replayed: true, after: saved.after });
});
it("late duplicate cancellation-child failure rolls back parent, physical, lifecycle and root writes", async () => {
  const f = await createQualityFixture(db),
    root = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: ADMINISTRATION_ORDER_SELECT,
    }),
    before = await graph();
  await expect(
    write(
      f.approvalActorId,
      cancelBody(
        root.id,
        root.version,
        f.order.pieces.map((piece) => piece.id),
      ),
      true,
    ),
  ).rejects.toMatchObject({ code: "P2002" });
  expect(await graph()).toEqual(before);
});

it("executor retains original-ID replay and observation after later versions, binds intent and checks current authority", async () => {
  const f = await createQualityFixture(db),
    executor = new AdministrationCommandExecutor(db, () => new Date()),
    root = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: ADMINISTRATION_ORDER_SELECT,
    });
  const body = administrationCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "ADMIN_CORRECT",
    orderId: root.id,
    expectedVersion: root.version,
    patch: { customerName: "Current name" },
    reason: "Fix current name",
  });
  const accepted = await executor.execute({ actorId: f.approvalActorId, body });
  const later = administrationCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "ADMIN_CORRECT",
    orderId: root.id,
    expectedVersion: root.version + 1,
    patch: { generalNotes: "Later note" },
    reason: "Fix note",
  });
  await executor.execute({ actorId: f.approvalActorId, body: later });
  expect(await executor.execute({ actorId: f.approvalActorId, body })).toEqual({
    ...accepted,
    replayed: true,
  });
  expect(await executor.observe(f.approvalActorId, body.commandId)).toEqual({
    ...accepted,
    replayed: true,
  });
  await expect(
    executor.execute({
      actorId: f.approvalActorId,
      body: { ...body, reason: "Different intent" },
    }),
  ).rejects.toMatchObject({ code: "ADMINISTRATION_COMMAND_CONFLICT" });
  await expect(
    executor.observe(f.qualityA, body.commandId),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const otherId = randomUUID();
  await db.user.create({
    data: {
      id: otherId,
      email: otherId + "@example.test",
      fullName: "Other admin",
      passwordHash: "synthetic-only",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  await expect(executor.observe(otherId, body.commandId)).rejects.toMatchObject(
    { code: "ADMINISTRATION_COMMAND_NOT_FOUND" },
  );
  await expect(
    executor.execute({ actorId: otherId, body }),
  ).rejects.toMatchObject({ code: "ADMINISTRATION_COMMAND_CONFLICT" });
  await expect(
    executor.observe(f.approvalActorId, randomUUID()),
  ).rejects.toMatchObject({ code: "ADMINISTRATION_COMMAND_NOT_FOUND" });
  await db.user.update({
    where: { id: f.approvalActorId },
    data: { emailVerifiedAt: null, status: "PENDING_VERIFICATION" },
  });
  await expect(
    executor.observe(f.approvalActorId, body.commandId),
  ).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });
  expect(await db.administrationCommand.count()).toBe(2);
});

it.each(["CUTTING", "PRODUCTION"] as const)(
  "admin cancellation of live %s work remains readable with the actual terminal actor through service and protected HTTP",
  async (department) => {
    const f = await createManufacturingFixture(db),
      manufacturing = new ManufacturingCommandExecutor(db),
      pieceIds = f.order.pieces.map((piece) => piece.id);
    if (department === "PRODUCTION") {
      for (const operation of [
        "RECEIVE_AND_START",
        "COMPLETE_TRANSFER",
      ] as const) {
        const current = await db.salesDraft.findUniqueOrThrow({
          where: { id: f.order.id },
          select: { version: true },
        });
        await manufacturing.execute({
          actorId: f.cuttingA,
          department: "CUTTING",
          body: {
            commandId: randomUUID(),
            operation,
            orders: [
              {
                orderId: f.order.id,
                expectedVersion: current.version,
                pieceIds,
              },
            ],
          },
        });
      }
    }
    const worker = department === "CUTTING" ? f.cuttingA : f.productionA;
    let current = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    });
    await manufacturing.execute({
      actorId: worker,
      department,
      body: {
        commandId: randomUUID(),
        operation: "RECEIVE_AND_START",
        orders: [
          { orderId: f.order.id, expectedVersion: current.version, pieceIds },
        ],
      },
    });
    const original = await new ManufacturingService(db, manufacturing).getOrder(
      worker,
      department,
      f.order.id,
    );
    current = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    });
    const accepted = await new AdministrationCommandExecutor(
      db,
      () => new Date(),
    ).execute({
      actorId: f.approvalActorId,
      body: cancelBody(f.order.id, current.version, pieceIds),
    });
    const detail = await new ManufacturingService(db, manufacturing).getOrder(
      worker,
      department,
      f.order.id,
    );
    for (const work of detail.work) {
      const prior = original.work.find(
        (row) => row.pieceId === work.pieceId,
      )?.visit;
      expect(work.visit).toMatchObject({
        startedAt: prior?.startedAt,
        startedBy: prior?.startedBy,
        origin: prior?.origin,
        endReason: "CANCELLED",
        endedAt: accepted.receipt.occurredAt,
        endedBy: accepted.receipt.actor,
      });
    }
    const app = createApp({
      database: db,
      logger: pino({ enabled: false }),
      emailDelivery: {
        provider: "console",
        send: () => Promise.resolve({ providerMessageId: "unused" }),
      },
    });
    const response = await request(app)
      .get(
        `/api/v1/manufacturing/${department.toLowerCase()}/orders/${f.order.id}`,
      )
      .set(businessTestHeaders(worker));
    expect(response.status).toBe(200);
    const data = manufacturingOrderDataSchema.parse(
      successEnvelopeSchema.parse(response.body).data,
    );
    expect(data).toEqual(detail);
    const serialized = JSON.stringify(data);
    for (const field of [
      "paidAmount",
      "remainingDue",
      "customerPhone",
      "customerAddress",
      "customerEmail",
    ])
      expect(serialized).not.toContain(`"${field}"`);
  },
);

it("serializes two competing exact cancellations to one retained effect and one stale-version denial", async () => {
  const f = await createQualityFixture(db),
    root = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    }),
    body = cancelBody(f.order.id, root.version, [f.order.pieces[0]?.id ?? ""]);
  let release = () => {};
  let acquired = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${f.order.id}::uuid FOR UPDATE`;
      acquired();
      await released;
    },
    { timeout: 10000 },
  );
  await locked;
  const executor = new AdministrationCommandExecutor(db, () => new Date());
  const pending = Promise.allSettled([
    executor.execute({ actorId: f.approvalActorId, body }),
    executor.execute({
      actorId: f.approvalActorId,
      body: { ...body, commandId: randomUUID() },
    }),
  ]);
  try {
    const deadline = Date.now() + 3000;
    for (;;) {
      const [row] = await db.$queryRaw<
        { waiting: number }[]
      >`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%sales_drafts%'`;
      if (row && row.waiting >= 2) break;
      if (Date.now() >= deadline)
        throw new Error("Both competing root locks must be observed");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await blocker;
  }
  const results = await pending;
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  expect(await db.administrationCommand.count()).toBe(1);
  expect(await db.administrationCancelledPiece.count()).toBe(1);
  expect(
    (
      await db.salesDraft.findUniqueOrThrow({
        where: { id: f.order.id },
        select: { version: true },
      })
    ).version,
  ).toBe(root.version + 1);
});

const contendRoot = async (
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
  const wait = async (minimum: number) => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((row?.count ?? 0) >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Both real contenders must reach their locked root");
  };
  try {
    await inside;
    pending.push(Promise.allSettled([first()]));
    await wait(1);
    pending.push(Promise.allSettled([second()]));
    await wait(2);
    release();
    await gate;
    return (await Promise.all(pending)).flat();
  } finally {
    release();
    await Promise.allSettled([gate, ...pending]);
    await blocker.$disconnect();
  }
};
const assertOneCurrentWinner = (results: PromiseSettledResult<unknown>[]) => {
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "ORDER_VERSION_CONFLICT" },
  });
};
it.each(["QUALITY", "PAID"] as const)(
  "serializes cancellation against an actual %s command without partial effects",
  async (competitor) => {
    const f = await createQualityFixture(db),
      root = await db.salesDraft.findUniqueOrThrow({
        where: { id: f.order.id },
        select: { version: true },
      }),
      pieces = f.order.pieces.map((piece) => piece.id),
      executor = new AdministrationCommandExecutor(db, () => new Date());
    const results = await contendRoot(
      f.order.id,
      () =>
        executor.execute({
          actorId: f.approvalActorId,
          body: cancelBody(f.order.id, root.version, pieces),
        }),
      () =>
        competitor === "QUALITY"
          ? new QualityCommandExecutor(db).execute({
              actorId: f.qualityA,
              body: {
                commandId: randomUUID(),
                operation: "RECEIVE_AND_START",
                orders: [
                  {
                    orderId: f.order.id,
                    expectedVersion: root.version,
                    pieceIds: pieces,
                  },
                ],
              },
            })
          : f.sales.setPaid(f.approvalActorId, f.order.id, {
              commandId: randomUUID(),
              expectedVersion: root.version,
              paidAmount: "200.00",
            }),
    );
    assertOneCurrentWinner(results);
    expect(await db.administrationCommand.count()).toBe(1);
    expect(
      (
        await db.salesOrder.findUniqueOrThrow({
          where: { id: f.order.id },
          select: { status: true, paidAmount: true },
        })
      ).status,
    ).toBe("CANCELLED");
    expect(
      await db.qualityWorkVisit.count({
        where: { orderId: f.order.id, endedAt: null },
      }),
    ).toBe(0);
    expect(await db.administrationCancelledPiece.count()).toBe(pieces.length);
  },
);
it("serializes exact cancellation before dispatch and preserves all original warehouse receipts", async () => {
  const f = await createQualityFixture(db),
    quality = new QualityCommandExecutor(db),
    warehouse = new WarehouseCommandExecutor(db),
    pieces = f.order.pieces.map((piece) => piece.id),
    version = async () =>
      (
        await db.salesDraft.findUniqueOrThrow({
          where: { id: f.order.id },
          select: { version: true },
        })
      ).version;
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(),
          pieceIds: pieces,
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
          orderId: f.order.id,
          expectedVersion: await version(),
          decisions: pieces.map((pieceId) => ({ pieceId, decision: "ACCEPT" })),
        },
      ],
    }),
  });
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(),
          pieceIds: pieces,
        },
      ],
    }),
  });
  const expectedVersion = await version(),
    receipts = await db.warehouseReceiptPiece.findMany({
      orderBy: { pieceId: "asc" },
    }),
    executor = new AdministrationCommandExecutor(db, () => new Date());
  const results = await contendRoot(
    f.order.id,
    () =>
      executor.execute({
        actorId: f.approvalActorId,
        body: cancelBody(f.order.id, expectedVersion, pieces),
      }),
    () =>
      warehouse.execute({
        actorId: f.approvalActorId,
        body: warehouseCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "DISPATCH",
          orders: [{ orderId: f.order.id, expectedVersion, pieceIds: pieces }],
        }),
      }),
  );
  assertOneCurrentWinner(results);
  expect(await db.warehouseDeliveryAttempt.count()).toBe(0);
  expect(
    await db.warehouseReceiptPiece.findMany({ orderBy: { pieceId: "asc" } }),
  ).toEqual(receipts);
});
it("serializes returned-order correction before resubmission and carries the real return proof", async () => {
  const f = await createApprovalOrderFixture(db);
  const approval = new ApprovalService(
    db,
    new ApprovalCommandExecutor(db),
    "UTC",
  );
  await approval.returnInitial(f.approvalActorId, f.order.id, {
    commandId: randomUUID(),
    expectedVersion: f.order.version,
    reason: "Review sizes",
    notes: null,
  });
  const expectedVersion = f.order.version + 1,
    body = administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion,
      patch: { generalNotes: "Current corrected note" },
      reason: "Fix header",
    });
  const corrections = {
    deliveryDate: f.order.deliveryDate,
    generalNotes: f.order.generalNotes,
    responsibleSignature: f.order.responsibleSignature,
    repairNote: f.order.repairNote,
    adjustmentRequested: f.order.adjustmentRequested,
    adjustmentReason: f.order.adjustmentReason,
    adjustmentActionTaken: f.order.adjustmentActionTaken,
    pieces: f.order.pieces.map((piece) => ({
      id: piece.id,
      model: piece.model,
      size: piece.size,
      leatherBase: piece.leatherBase,
      decorationColor: piece.decorationColor,
      faceRight: piece.faceRight,
      faceLeft: piece.faceLeft,
      mixing: piece.mixing,
      face: piece.face,
      sole: piece.sole,
      soleAddition: piece.soleAddition,
      soleColor: piece.soleColor,
      additions: piece.additions,
      aField: piece.aField,
      fField: piece.fField,
      sideNotes: piece.sideNotes,
    })),
  };
  const results = await contendRoot(
    f.order.id,
    () =>
      new AdministrationCommandExecutor(db, () => new Date()).execute({
        actorId: f.approvalActorId,
        body,
      }),
    () =>
      f.sales.resubmit(
        f.actorId,
        f.order.id,
        resubmitOrderBodySchema.parse({
          commandId: randomUUID(),
          expectedVersion,
          corrections,
        }),
      ),
  );
  assertOneCurrentWinner(results);
  const root = await db.salesDraft.findUniqueOrThrow({
    where: { id: f.order.id },
    select: ADMINISTRATION_ORDER_SELECT,
  });
  expect(mapAdministrationCommandFacts(root)).toMatchObject({
    version: expectedVersion + 1,
    status: "RETURNED",
    returnProof: { version: expectedVersion + 1 },
    correction: { generalNotes: "Current corrected note" },
  });
});
it("denies an exhausted real migrated root without overflowing or writing a retained command", async () => {
  const f = await createP05LegacyUpgradeFixture(
    "PRE_P04_APPROVED",
    2_147_483_647,
  );
  try {
    const before = await f.database.salesDraft.findUniqueOrThrow({
      where: { id: f.orderId },
      select: ADMINISTRATION_ORDER_SELECT,
    });
    const executor = new AdministrationCommandExecutor(
      f.database,
      () => new Date(),
    );
    await expect(
      executor.execute({
        actorId: f.approvalActorId,
        body: administrationCommandBodySchema.parse({
          commandId: randomUUID(),
          operation: "ADMIN_CORRECT",
          orderId: f.orderId,
          expectedVersion: 2_147_483_646,
          patch: { generalNotes: "Must not save" },
          reason: "Version test",
        }),
      }),
    ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
    expect(
      await f.database.salesDraft.findUniqueOrThrow({
        where: { id: f.orderId },
        select: ADMINISTRATION_ORDER_SELECT,
      }),
    ).toEqual(before);
    expect(await f.database.administrationCommand.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});

it.each(["ADMIN_CANCEL", "ADMIN_CORRECT"] as const)(
  "simultaneous %s same-ID requests return one original receipt with one replay and one effect",
  async (operation) => {
    const f = await createQualityFixture(db),
      current = await db.salesDraft.findUniqueOrThrow({
        where: { id: f.order.id },
        select: { version: true },
      });
    const body = administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation,
      orderId: f.order.id,
      expectedVersion: current.version,
      ...(operation === "ADMIN_CANCEL"
        ? { scope: "ORDER", pieceIds: f.order.pieces.map((piece) => piece.id) }
        : {
            patch: { generalNotes: "Single accepted note" },
            reason: "Fix note",
          }),
    });
    const executor = new AdministrationCommandExecutor(db, () => new Date()),
      results = await contendRoot(
        f.order.id,
        () => executor.execute({ actorId: f.approvalActorId, body }),
        () => executor.execute({ actorId: f.approvalActorId, body }),
      );
    const accepted = results.map((result) => {
      if (result.status !== "fulfilled") throw result.reason;
      return administrationCommandDataSchema.parse(result.value);
    });
    expect(accepted.map((result) => result.replayed)).toEqual([false, true]);
    expect(accepted[1]).toEqual({ ...accepted[0], replayed: true });
    expect(await db.administrationCommand.count()).toBe(1);
    expect(
      (
        await db.salesDraft.findUniqueOrThrow({
          where: { id: f.order.id },
          select: { version: true },
        })
      ).version,
    ).toBe(current.version + 1);
  },
);
it("a concurrent committed authority restriction is reloaded before any order effect", async () => {
  const f = await createQualityFixture(db),
    current = await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    }),
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
      await lockAccountRows(tx, [f.approvalActorId], "write");
      await tx.user.update({
        where: { id: f.approvalActorId },
        data: { status: "PENDING_VERIFICATION", emailVerifiedAt: null },
      });
      entered();
      await hold;
    },
    { timeout: 10000 },
  );
  const pending: Promise<PromiseSettledResult<unknown>[]>[] = [];
  try {
    await inside;
    pending.push(
      Promise.allSettled([
        new AdministrationCommandExecutor(db, () => new Date()).execute({
          actorId: f.approvalActorId,
          body: cancelBody(
            f.order.id,
            current.version,
            f.order.pieces.map((piece) => piece.id),
          ),
        }),
      ]),
    );
    const deadline = Date.now() + 3000;
    for (;;) {
      const [row] = await db.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((row?.count ?? 0) >= 1) break;
      if (Date.now() >= deadline)
        throw new Error("The current actor row lock must block the command");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    release();
    await gate;
    expect((await pending[0])?.[0]).toMatchObject({
      status: "rejected",
      reason: { code: "ACCOUNT_RESTRICTED" },
    });
    expect(await graph()).toEqual(before);
  } finally {
    release();
    await Promise.allSettled([gate, ...pending]);
    await blocker.$disconnect();
  }
});
