import {
  openManufacturingVisit,
  interruptManufacturingVisit,
} from "../manufacturing/manufacturing-work.lifecycle.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  approvalEventFactsSchema,
  type SalesOrderDto,
  type ApprovalEventFacts,
} from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import {
  SALES_ORDER_SELECT,
  mapSalesOrder,
} from "../sales-orders/sales-orders.mapper.js";
import { StaffService } from "../staff/staff.service.js";
import {
  ApprovalCommandExecutor,
  hashApprovalCommandIntent,
} from "./approval-command-executor.js";
import type { ApprovalCommandExecution } from "./approval.types.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (uri === undefined || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned integration database required");
const db = createDatabaseClient(uri),
  executor = new ApprovalCommandExecutor(db);
let fixture: Awaited<ReturnType<typeof createApprovalOrderFixture>>;
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
  fixture = await createApprovalOrderFixture(db);
});
afterAll(async () => {
  await resetOwnedIdentityTestData(db);
  await db.$disconnect();
});
const facts = (
  order: SalesOrderDto,
  issue: ApprovalEventFacts["issue"] = null,
) =>
  approvalEventFactsSchema.parse({
    orderStatus: order.status,
    approvedAt: order.approval.approvedAt,
    currentReturn: null,
    money: order.money,
    counts: order.counts,
    pieces: order.pieces.map((piece) => ({
      id: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      issueId: issue !== null && issue.state !== "RESOLVED" ? issue.id : null,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    })),
    issue,
    proposal: null,
  });
const approveInput = (): ApprovalCommandExecution => {
  const commandId = randomUUID(),
    orderId = fixture.order.id,
    expectedVersion = fixture.order.version;
  return {
    operation: "APPROVE_INITIAL",
    actorId: fixture.actorId,
    commandId,
    orderId,
    expectedVersion,
    payloadHash: hashApprovalCommandIntent({
      operation: "APPROVE_INITIAL",
      orderId,
      expectedVersion,
      payload: { commandId, expectedVersion },
    }),
    work: async (tx, actor, occurredAt) => {
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${orderId}::uuid FOR UPDATE`;
      const root = await tx.salesDraft.findUniqueOrThrow({
        where: { id: orderId },
        select: SALES_ORDER_SELECT,
      });
      if (root.version !== expectedVersion)
        throw new Error("Stale controlled executor fixture");
      const before = facts(mapSalesOrder(root, actor));
      await tx.salesDraft.update({
        where: { id: orderId },
        data: { version: { increment: 1 }, updatedAt: occurredAt },
      });
      await tx.salesOrder.update({
        where: { id: orderId },
        data: { status: "APPROVED", approvedAt: occurredAt },
      });
      await tx.salesOrderPiece.updateMany({
        where: { orderId },
        data: { stage: "CUTTING", workState: "INCOMING" },
      });
      const released = await tx.salesOrderPiece.findMany({
        where: { orderId },
        select: { id: true },
      });
      for (const piece of released)
        await openManufacturingVisit(tx, {
          orderId,
          pieceId: piece.id,
          target: "CUTTING",
          origin: { kind: "INITIAL_APPROVAL", approvalCommandId: commandId },
          occurredAt,
        });
      const after = facts(
        mapSalesOrder(
          await tx.salesDraft.findUniqueOrThrow({
            where: { id: orderId },
            select: SALES_ORDER_SELECT,
          }),
          actor,
        ),
      );
      return {
        pieceId: null,
        issueId: null,
        proposalId: null,
        decision: null,
        decisionNotes: null,
        beforeFacts: before,
        afterFacts: after,
        outcome: {
          orderId,
          orderVersion: expectedVersion + 1,
          orderStatus: "APPROVED",
          pieceId: null,
          pieceStage: null,
          pieceWorkState: null,
          issueId: null,
          issueState: null,
          proposalId: null,
        },
      };
    },
  };
};
const graph = async () => ({
  root: await db.salesDraft.findUnique({ where: { id: fixture.order.id } }),
  order: await db.salesOrder.findUnique({ where: { id: fixture.order.id } }),
  pieces: await db.salesOrderPiece.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { id: "asc" },
  }),
  commands: await db.approvalCommand.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { commandId: "asc" },
  }),
});
it("retains one atomic result, observes only the original actor and refuses changed replay intent", async () => {
  const input = approveInput(),
    result = await executor.execute(input),
    beforeReplay = await graph();
  expect(result).toMatchObject({
    replayed: false,
    receipt: {
      actor: { id: fixture.actorId },
      beforeVersion: 1,
      afterVersion: 2,
    },
    outcome: { orderStatus: "APPROVED" },
  });
  expect(await executor.execute(input)).toEqual({ ...result, replayed: true });
  expect(await graph()).toEqual(beforeReplay);
  expect(await executor.observe(fixture.actorId, input.commandId)).toEqual({
    ...result,
    replayed: true,
  });
  for (const patch of [
    { payloadHash: "f".repeat(64) },
    { expectedVersion: 2 },
    { orderId: randomUUID() },
  ])
    await expect(
      executor.execute({ ...input, ...patch }),
    ).rejects.toMatchObject({ code: "APPROVAL_COMMAND_CONFLICT" });
  const other = await db.user.create({
    data: {
      email: "other-admin@example.test",
      fullName: "Other admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  await expect(
    executor.observe(other.id, input.commandId),
  ).rejects.toMatchObject({ code: "APPROVAL_COMMAND_NOT_FOUND" });
  expect(await graph()).toEqual(beforeReplay);
});
it("rolls back all real dependent writes when work fails before receipt insertion", async () => {
  const input = approveInput(),
    before = await graph();
  await expect(
    executor.execute({
      ...input,
      work: async (tx, actor, at) => {
        await input.work(tx, actor, at);
        throw new Error("controlled dependent failure");
      },
    }),
  ).rejects.toThrow("controlled dependent failure");
  expect(await graph()).toEqual(before);
  await expect(
    executor.observe(fixture.actorId, input.commandId),
  ).rejects.toMatchObject({ code: "APPROVAL_COMMAND_NOT_FOUND" });
});
it("checks current department again for a retained receipt after actual staff reassignment", async () => {
  const employee = await db.user.create({
    data: {
      email: "approver@example.test",
      fullName: "Actual approver",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  const staff = new StaffService(db);
  await staff.approveStaff(fixture.actorId, employee.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "APPROVAL",
  });
  const input = { ...approveInput(), actorId: employee.id };
  await executor.execute(input);
  await staff.changeDepartment(fixture.actorId, employee.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "SALES",
  });
  const before = await graph();
  await expect(executor.execute(input)).rejects.toMatchObject({
    code: "DEPARTMENT_ACCESS_DENIED",
  });
  await expect(
    executor.observe(employee.id, input.commandId),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  expect(await graph()).toEqual(before);
});
it("serializes simultaneous same-ID attempts on independent transactions before returning the one receipt", async () => {
  const competing = createDatabaseClient(uri),
    secondExecutor = new ApprovalCommandExecutor(competing),
    input = approveInput();
  let release: () => void = () => {
    throw new Error("Barrier not initialized");
  };
  let entered: () => void = () => {
    throw new Error("Barrier not initialized");
  };
  const hold = new Promise<void>((resolve) => {
      release = resolve;
    }),
    inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const first = executor.execute({
    ...input,
    work: async (tx, actor, at) => {
      entered();
      await hold;
      return input.work(tx, actor, at);
    },
  });
  let second:
    | Promise<Awaited<ReturnType<ApprovalCommandExecutor["execute"]>>>
    | undefined;
  try {
    await inside;
    second = secondExecutor.execute(input);
    const deadline = Date.now() + 5000;
    let observedWaiter = false;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<
        Array<{ waiting: boolean }>
      >`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted) AS waiting`;
      if (rows[0]?.waiting === true) {
        observedWaiter = true;
        break;
      }
    }
    expect(observedWaiter).toBe(true);
    release();
    const accepted = await Promise.all([first, second]);
    expect(accepted.map((result) => result.replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(accepted[0].receipt).toEqual(accepted[1].receipt);
    expect((await graph()).commands).toHaveLength(1);
    expect((await graph()).root?.version).toBe(2);
  } finally {
    release();
    await Promise.allSettled(second === undefined ? [first] : [first, second]);
    await competing.$disconnect();
  }
});

it("recovers a generated report issue ID and requires its retained source department after reassignment", async () => {
  await executor.execute(approveInput());
  const reporter = await db.user.create({
    data: {
      email: "reporter@example.test",
      fullName: "Cutting reporter",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  const staff = new StaffService(db);
  await staff.approveStaff(fixture.actorId, reporter.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "CUTTING",
  });
  const commandId = randomUUID(),
    orderId = fixture.order.id,
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined)
    throw new Error("Expected the owned physical piece");
  const input: ApprovalCommandExecution = {
    operation: "REPORT_ISSUE",
    actorId: reporter.id,
    orderId,
    pieceId,
    commandId,
    expectedVersion: 2,
    payloadHash: hashApprovalCommandIntent({
      operation: "REPORT_ISSUE",
      orderId,
      pieceId,
      expectedVersion: 2,
      payload: {
        commandId,
        expectedVersion: 2,
        reason: "Material issue",
        notes: null,
      },
    }),
    work: async (tx, actor, occurredAt) => {
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${orderId}::uuid FOR UPDATE`;
      const before = facts(
        mapSalesOrder(
          await tx.salesDraft.findUniqueOrThrow({
            where: { id: orderId },
            select: SALES_ORDER_SELECT,
          }),
          actor,
        ),
      );
      const issueId = randomUUID();
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
          reason: "Material issue",
          reportedAt: occurredAt,
          updatedAt: occurredAt,
          reportedCommandId: commandId,
        },
      });
      await tx.salesOrderPiece.update({
        where: { id: pieceId },
        data: { workState: "BLOCKED", issueId },
      });
      await interruptManufacturingVisit(tx, {
        orderId,
        pieceId,
        approvalCommandId: commandId,
        occurredAt,
      });
      await tx.salesDraft.update({
        where: { id: orderId },
        data: { version: 3, updatedAt: occurredAt },
      });
      const issue: ApprovalEventFacts["issue"] = {
        id: issueId,
        state: "APPROVAL_REVIEW",
        sourceDepartment: "CUTTING",
        sourceStage: "CUTTING",
        sourceWorkState: "INCOMING",
        resumeTarget: null,
        currentProposalId: null,
      };
      const after = facts(
        mapSalesOrder(
          await tx.salesDraft.findUniqueOrThrow({
            where: { id: orderId },
            select: SALES_ORDER_SELECT,
          }),
          actor,
        ),
        issue,
      );
      return {
        pieceId,
        issueId,
        proposalId: null,
        decision: null,
        decisionNotes: null,
        beforeFacts: before,
        afterFacts: after,
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
      };
    },
  };
  const result = await executor.execute(input),
    beforeReplay = await graph();
  expect(result.outcome.issueId).toBeTypeOf("string");
  expect(await executor.execute(input)).toEqual({ ...result, replayed: true });
  expect(await executor.observe(reporter.id, commandId)).toEqual({
    ...result,
    replayed: true,
  });
  expect(await graph()).toEqual(beforeReplay);
  expect(await db.manufacturingIssue.count({ where: { orderId } })).toBe(1);
  await staff.changeDepartment(fixture.actorId, reporter.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "QUALITY",
  });
  await expect(executor.observe(reporter.id, commandId)).rejects.toMatchObject({
    code: "DEPARTMENT_ACCESS_DENIED",
  });
  await expect(executor.execute(input)).rejects.toMatchObject({
    code: "DEPARTMENT_ACCESS_DENIED",
  });
  expect(await graph()).toEqual(beforeReplay);
});

it("bounds recognized transaction-conflict retry and leaves both failed transactions without effects", async () => {
  const input = approveInput(),
    before = await graph();
  let attempts = 0;
  // Inject only the identified adapter failure after real transactional work.
  await expect(
    executor.execute({
      ...input,
      work: async (tx, actor, at) => {
        attempts++;
        await input.work(tx, actor, at);
        throw Object.assign(new Error("Controlled transaction conflict"), {
          code: "P2034",
        });
      },
    }),
  ).rejects.toMatchObject({ code: "APPROVAL_TRANSACTION_CONFLICT" });
  expect(attempts).toBe(2);
  expect(await graph()).toEqual(before);
  await expect(
    executor.observe(fixture.actorId, input.commandId),
  ).rejects.toMatchObject({ code: "APPROVAL_COMMAND_NOT_FOUND" });
});
