import {
  approvalIssuesQuerySchema,
  salesContactQuerySchema,
  approvalOrdersQuerySchema,
  approvalHistoryQuerySchema,
  submitOrderBodySchema,
} from "@template/contracts";
import { vi, afterAll, beforeEach, expect, it } from "vitest";
import { CatalogsService } from "../catalogs/catalogs.service.js";
import { StaffService } from "../staff/staff.service.js";
import { ApprovalService } from "./approval.service.js";
import { ApprovalCommandExecutor } from "./approval-command-executor.js";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@template/database";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import {
  loadIdentityAccount,
  lockAccountRows,
} from "../auth/account-authority.js";
import { lockApprovalOrder } from "./approval.queries.js";
import { assertInitialDecisionState } from "./approval.rules.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (uri === undefined || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned integration database required");
const db = createDatabaseClient(uri);
let fixture: Awaited<ReturnType<typeof createApprovalOrderFixture>>;
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
  fixture = await createApprovalOrderFixture(db);
});
afterAll(async () => {
  await resetOwnedIdentityTestData(db);
  await db.$disconnect();
});
const locked = (
  actorId: string,
  scope: "APPROVAL" | "OWNER" | "FACTORY",
  orderId = fixture.order.id,
  expectedVersion = fixture.order.version,
) =>
  db.$transaction(async (tx) => {
    await lockAccountRows(tx, [actorId], "read");
    const actor = await loadIdentityAccount(tx, actorId);
    return lockApprovalOrder(tx, { actor, scope, orderId, expectedVersion });
  });
it("locks the existing aggregate with strict owner scope even for ADMIN and preserves its stable graph", async () => {
  const root = await locked(fixture.actorId, "OWNER");
  expect(root).toMatchObject({
    id: fixture.order.id,
    version: 1,
    ownerId: fixture.actorId,
  });
  expect(() => {
    assertInitialDecisionState(root, false);
  }).not.toThrow();
  const other = await db.user.create({
    data: {
      email: "root-other@example.test",
      fullName: "Other admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  await expect(locked(other.id, "OWNER")).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  expect((await locked(other.id, "APPROVAL")).id).toBe(fixture.order.id);
  await expect(
    locked(fixture.actorId, "APPROVAL", randomUUID()),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  expect(
    (await db.salesDraft.findUnique({ where: { id: fixture.order.id } }))
      ?.version,
  ).toBe(1);
});
it("rejects stale and exhausted root versions without bumping the aggregate or inventing a receipt", async () => {
  await expect(
    locked(fixture.actorId, "APPROVAL", fixture.order.id, 2),
  ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  await db.salesDraft.update({
    where: { id: fixture.order.id },
    data: { version: 2147483647 },
  });
  await expect(
    locked(fixture.actorId, "APPROVAL", fixture.order.id, 2147483647),
  ).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  expect(await db.approvalCommand.count()).toBe(0);
  expect(
    (await db.salesDraft.findUnique({ where: { id: fixture.order.id } }))
      ?.version,
  ).toBe(2147483647);
});

const approvals = (zone: string | null = "UTC") =>
  new ApprovalService(db, new ApprovalCommandExecutor(db), zone);
const anotherPending = async () => {
  const piece = fixture.order.pieces[0];
  if (piece === undefined) throw new Error("Expected the owned piece capture");
  const pieces = [
    {
      id: randomUUID(),
      model: piece.model,
      size: piece.size,
      leatherBase: piece.leatherBase,
      decoration: piece.decoration,
      face: piece.face,
    },
  ];
  const quote = await new CatalogsService(db).quote(fixture.actorId, {
    requestId: randomUUID(),
    pieces,
  });
  if (quote.availability !== "available")
    throw new Error("Expected the owned quote");
  return fixture.sales.submit(
    fixture.actorId,
    submitOrderBodySchema.parse({
      origin: "new",
      commandId: randomUUID(),
      capture: { type: "SHOP", customerId: fixture.order.customerId, pieces },
      expectedCustomerVersion: 1,
      reviewedQuote: {
        sourceId: quote.sourceId,
        fingerprint: quote.fingerprint,
      },
    }),
  );
};
it("keeps pending filters/counts/pages and own history scoped while dashboard decisions are role-wide", async () => {
  const second = (await anotherPending()).savedOrder,
    service = approvals();
  const pending = await service.listPending(
    fixture.actorId,
    approvalOrdersQuerySchema.parse({ limit: 1 }),
  );
  expect(pending.pagination).toMatchObject({ total: 2, totalPages: 2 });
  expect(pending.items).toHaveLength(1);
  expect(
    (
      await service.listPending(
        fixture.actorId,
        approvalOrdersQuerySchema.parse({ page: 5, limit: 1 }),
      )
    ).items,
  ).toEqual([]);
  expect(
    (
      await service.listPending(
        fixture.actorId,
        approvalOrdersQuerySchema.parse({ type: "REPAIR" }),
      )
    ).pagination.total,
  ).toBe(0);
  expect(
    (
      await service.listPending(
        fixture.actorId,
        approvalOrdersQuerySchema.parse({ search: "%" }),
      )
    ).pagination.total,
  ).toBe(0);
  const other = await db.user.create({
    data: {
      email: "history-other@example.test",
      fullName: "Other approver",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  await service.returnInitial(other.id, second.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Confirm requested size",
    notes: null,
  });
  const dashboard = await service.dashboard(other.id);
  expect(dashboard.counts).toMatchObject({
    initialOrders: 0,
    approvedToday: 1,
    returnedOrders: 1,
    unresolvedIssues: 0,
  });
  const own = await service.history(
    fixture.actorId,
    approvalHistoryQuerySchema.parse({}),
  );
  expect(own.events).toHaveLength(1);
  expect(own.events[0]).toMatchObject({
    operation: "APPROVE_INITIAL",
    actor: { id: fixture.actorId },
  });
  const peer = await service.history(
    other.id,
    approvalHistoryQuerySchema.parse({}),
  );
  expect(peer.events).toHaveLength(1);
  expect(peer.events[0]).toMatchObject({
    operation: "RETURN_INITIAL",
    notes: "Confirm requested size",
    actor: { id: other.id },
  });
  expect(peer.events[0]).not.toHaveProperty("after");
  expect(peer.events[0]).not.toHaveProperty("money");
  expect(
    (
      await service.listPending(
        fixture.actorId,
        approvalOrdersQuerySchema.parse({}),
      )
    ).pagination.total,
  ).toBe(0);
});
it("denies current nonapproval staff and fails only dashboard calendar readiness without blocking commands", async () => {
  const employee = await db.user.create({
    data: {
      email: "read-sales@example.test",
      fullName: "Sales employee",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(db).approveStaff(fixture.actorId, employee.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "SALES",
  });
  await expect(
    approvals().listPending(employee.id, approvalOrdersQuerySchema.parse({})),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  for (const zone of [null, "invalid/time-zone"]) {
    await expect(
      approvals(zone).dashboard(fixture.actorId),
    ).rejects.toMatchObject({ code: "ORDER_CALENDAR_UNAVAILABLE" });
    expect(
      (
        await approvals(zone).listPending(
          fixture.actorId,
          approvalOrdersQuerySchema.parse({}),
        )
      ).pagination.total,
    ).toBe(1);
  }
  expect(
    (
      await approvals(null).approveInitial(fixture.actorId, fixture.order.id, {
        commandId: randomUUID(),
        expectedVersion: 1,
      })
    ).outcome.orderStatus,
  ).toBe("APPROVED");
});
it("counts the configured 25-hour fall-back calendar day rather than a host day or fixed 24 hours", async () => {
  await resetOwnedIdentityTestData(db);
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2026-11-01T04:00:00Z"));
    fixture = await createApprovalOrderFixture(db);
    const second = (await anotherPending()).savedOrder;
    vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
    await approvals().approveInitial(fixture.actorId, fixture.order.id, {
      commandId: randomUUID(),
      expectedVersion: 1,
    });
    vi.setSystemTime(new Date("2026-11-02T04:30:00Z"));
    await approvals().approveInitial(fixture.actorId, second.id, {
      commandId: randomUUID(),
      expectedVersion: 1,
    });
    vi.setSystemTime(new Date("2026-11-02T04:45:00Z"));
    expect(
      (await approvals("America/New_York").dashboard(fixture.actorId)).counts
        .approvedToday,
    ).toBe(2);
    expect(
      (await approvals("UTC").dashboard(fixture.actorId)).counts.approvedToday,
    ).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

it("reads current issues/contact filters and repeated instructions from one authoritative workflow", async () => {
  const service = approvals(),
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected owned piece");
  const empty = await service.listIssues(
    fixture.actorId,
    approvalIssuesQuerySchema.parse({}),
  );
  expect(empty.items).toEqual([]);
  expect(empty.pagination.total).toBe(0);
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const report = await service.reportIssue(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Keep source language",
        notes: "Source notes",
      },
    ),
    issueId = report.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  const pending = await service.listIssues(
    fixture.actorId,
    approvalIssuesQuerySchema.parse({
      state: "APPROVAL_REVIEW",
      search: fixture.order.businessNumber,
      limit: 1,
    }),
  );
  expect(pending.items).toHaveLength(1);
  expect(pending.pagination.total).toBe(1);
  expect(pending.items[0]?.issue.allowedActions).toEqual({
    canResolve: true,
    canSubmitContact: false,
    canReviewContact: false,
  });
  await service.resolveIssue(
    fixture.actorId,
    fixture.order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "SEND_TO_SALES",
      target: "PRODUCTION",
      notes: "Original contact instructions",
    },
  );
  const referred = await service.getSalesContactOrder(
    fixture.actorId,
    fixture.order.id,
  );
  expect(referred.workflow.printEligibility).toEqual({
    allowed: true,
    reason: null,
  });
  expect(referred.workflow.issues[0]).toMatchObject({
    state: "SALES_CONTACT",
    instructions: { text: "Original contact instructions" },
    allowedActions: { canSubmitContact: true },
  });
  expect(
    (
      await service.salesContacts(
        fixture.actorId,
        salesContactQuerySchema.parse({}),
      )
    ).pagination.total,
  ).toBe(1);
  const submitted = await service.submitContact(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: randomUUID(),
        expectedVersion: 4,
        kind: "AMEND",
        contactNotes: "Private customer confirmation",
        changes: {},
      },
    ),
    proposalId = submitted.outcome.proposalId;
  if (proposalId === null) throw new Error("Expected proposal");
  const held = await service.getOrder(fixture.actorId, fixture.order.id);
  expect(held.order.pieces).toEqual(referred.order.pieces);
  expect(held.workflow.printEligibility.reason).toBe("PENDING_REAPPROVAL");
  expect(held.workflow.issues[0]?.currentProposal?.contactNotes).toBe(
    "Private customer confirmation",
  );
  expect(
    (
      await service.salesContacts(
        fixture.actorId,
        salesContactQuerySchema.parse({ state: "SALES_CONTACT" }),
      )
    ).items,
  ).toEqual([]);
  expect(
    (
      await service.salesContacts(
        fixture.actorId,
        salesContactQuerySchema.parse({ state: "REAPPROVAL" }),
      )
    ).pagination.total,
  ).toBe(1);
  await service.reviewContact(
    fixture.actorId,
    fixture.order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 5,
      proposalId,
      decision: "RETURN_TO_SALES",
      reason: "Latest approval instructions",
    },
  );
  const returned = await service.getOrder(fixture.actorId, fixture.order.id);
  expect(returned.workflow.issues[0]).toMatchObject({
    state: "SALES_CONTACT",
    instructions: { text: "Latest approval instructions" },
    currentProposal: { id: proposalId },
    allowedActions: { canSubmitContact: true, canReviewContact: false },
  });
  expect(returned.workflow.printEligibility.reason).toBe("PENDING_REAPPROVAL");
  expect(
    (
      await service.listIssues(
        fixture.actorId,
        approvalIssuesQuerySchema.parse({ page: 9, limit: 1 }),
      )
    ).pagination,
  ).toMatchObject({ total: 1, page: 9 });
  expect(
    (
      await service.listIssues(
        fixture.actorId,
        approvalIssuesQuerySchema.parse({ search: "no matching order" }),
      )
    ).items,
  ).toEqual([]);
});
it("keeps SALES owner scope and ADMIN other-owner submission hints distinct from broad approval reads", async () => {
  await resetOwnedIdentityTestData(db);
  fixture = await createApprovalOrderFixture(
    db,
    "SHOP",
    ["زبيري - z"],
    "SALES",
  );
  const service = approvals(),
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected owned piece");
  await service.approveInitial(fixture.approvalActorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const reported = await service.reportIssue(
      fixture.approvalActorId,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Actual owner referral",
        notes: null,
      },
    ),
    issueId = reported.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  await service.resolveIssue(
    fixture.approvalActorId,
    fixture.order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "SEND_TO_SALES",
      target: "CUTTING",
      notes: "Owner instructions",
    },
  );
  const worker = await db.user.create({
    data: {
      email: "other-sales-context@example.test",
      fullName: "Other salesperson",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(db).approveStaff(fixture.approvalActorId, worker.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "SALES",
  });
  expect(
    (await service.salesContacts(worker.id, salesContactQuerySchema.parse({})))
      .items,
  ).toEqual([]);
  await expect(
    service.getSalesContactOrder(worker.id, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  await expect(
    service.getOrder(fixture.actorId, fixture.order.id),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  const own = await service.getSalesContactOrder(
      fixture.actorId,
      fixture.order.id,
    ),
    admin = await service.getSalesContactOrder(
      fixture.approvalActorId,
      fixture.order.id,
    );
  expect(
    (await service.officialPaper(fixture.actorId, fixture.order.id)).order.id,
  ).toBe(fixture.order.id);
  await expect(
    service.officialPaper(worker.id, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  expect(own.workflow.issues[0]?.allowedActions.canSubmitContact).toBe(true);
  expect(admin.workflow.issues[0]?.allowedActions.canSubmitContact).toBe(false);
  expect(admin.order.allowedActions.canSetPaid).toBe(true);
  await new StaffService(db).changeDepartment(
    fixture.approvalActorId,
    fixture.actorId,
    {
      commandId: randomUUID(),
      expectedAccessVersion: 1,
      department: "APPROVAL",
    },
  );
  const reassigned = await service.getOrder(fixture.actorId, fixture.order.id);
  expect(reassigned.order.allowedActions).toEqual({
    canResubmit: false,
    canSetPaid: false,
  });
  expect(reassigned.workflow.issues[0]?.allowedActions.canSubmitContact).toBe(
    false,
  );
  await expect(
    service.salesContacts(fixture.actorId, salesContactQuerySchema.parse({})),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
});
it("exposes the exact optional initial return notes without manufacturing any issue", async () => {
  const service = approvals();
  await service.returnInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Separate return reason",
    notes: "Separate optional return notes",
  });
  const returned = await service.getOrder(fixture.actorId, fixture.order.id);
  expect(returned.workflow.currentReturn).toMatchObject({
    reason: "Separate return reason",
    notes: "Separate optional return notes",
  });
  expect(returned.workflow.issues).toEqual([]);
  expect(returned.workflow.printEligibility.reason).toBe("RETURNED");
  await expect(
    service.getOrder(fixture.actorId, randomUUID()),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
});

it("pages a UUID/time collision across both ledgers and preserves source-specific detail", async () => {
  const service = approvals(),
    commandId = randomUUID(),
    collisionTime = new Date(Date.parse(fixture.order.submittedAt) + 1000);
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    // Keep the collision after the real fixture submission on every run date.
    vi.setSystemTime(collisionTime);
    await service.approveInitial(fixture.actorId, fixture.order.id, {
      commandId,
      expectedVersion: 1,
    });
    await fixture.sales.setPaid(fixture.actorId, fixture.order.id, {
      commandId,
      expectedVersion: 2,
      paidAmount: "2000.00",
    });
  } finally {
    vi.useRealTimers();
  }
  const history = await service.orderHistory(
    fixture.actorId,
    fixture.order.id,
    { page: 1, limit: 100 },
  );
  expect(history.pagination.total).toBe(3);
  expect(history.events.map((row) => row.kind)).toEqual([
    "approval",
    "order",
    "order",
  ]);
  const collisionEvents = history.events.slice(0, 2);
  expect(collisionEvents).toMatchObject([
    { kind: "approval", event: { id: commandId } },
    { kind: "order", event: { id: commandId } },
  ]);
  expect(
    collisionEvents.map((row) =>
      Date.parse(
        row.kind === "draft" ? row.change.occurredAt : row.event.occurredAt,
      ),
    ),
  ).toEqual([collisionTime.getTime(), collisionTime.getTime()]);
  expect(
    (
      await service.orderHistory(fixture.actorId, fixture.order.id, {
        page: 2,
        limit: 1,
      })
    ).events,
  ).toEqual([history.events[1]]);
  expect(JSON.stringify(history)).not.toMatch(
    /"beforeFacts"|"afterFacts"|"before":\{|"after":\{|"passwordHash"/u,
  );
  const approval = await service.event(
    fixture.actorId,
    fixture.order.id,
    commandId,
  );
  expect(approval.event.operation).toBe("APPROVE_INITIAL");
  expect(approval.before.orderStatus).toBe("AWAITING_APPROVAL");
  expect(approval.after.orderStatus).toBe("APPROVED");
  const oldRevision = await fixture.sales.revision(
    fixture.actorId,
    fixture.order.id,
    commandId,
  );
  expect(oldRevision.event.operation).toBe("SET_ORDER_PAID");
  expect(oldRevision.after.money.paidAmount).toBe("2000.00");
  const submitted = history.events.find(
    (row) => row.kind === "order" && row.event.operation === "SUBMIT_NEW_ORDER",
  );
  if (submitted?.kind !== "order")
    throw new Error("Expected original order submission");
  await expect(
    service.event(fixture.actorId, fixture.order.id, submitted.event.id),
  ).rejects.toMatchObject({ code: "APPROVAL_EVENT_NOT_FOUND" });
  expect(
    (
      await service.history(fixture.actorId, { page: 1, limit: 100 })
    ).events.map((event) => event.operation),
  ).toEqual(["APPROVE_INITIAL"]);
});
it("includes all report/contact actors in authorized order history without granting their former or factory roles detail access", async () => {
  const service = approvals(),
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected owned piece");
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const worker = await db.user.create({
    data: {
      email: "history-source@example.test",
      fullName: "Original reporter",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(db).approveStaff(fixture.actorId, worker.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "CUTTING",
  });
  const reportId = randomUUID(),
    reported = await service.reportIssue(worker.id, fixture.order.id, pieceId, {
      commandId: reportId,
      expectedVersion: 2,
      reason: "Original reporter reason",
      notes: "Source note",
    }),
    issueId = reported.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  await service.resolveIssue(
    fixture.actorId,
    fixture.order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "SEND_TO_SALES",
      target: "CUTTING",
      notes: "Owner referral",
    },
  );
  await service.submitContact(
    fixture.actorId,
    fixture.order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 4,
      kind: "AMEND",
      contactNotes: "Private customer note",
      changes: {},
    },
  );
  const history = await service.orderHistory(
    fixture.actorId,
    fixture.order.id,
    { page: 1, limit: 100 },
  );
  expect(history.pagination.total).toBe(5);
  const reports = history.events.filter(
    (row) => row.kind === "approval" && row.event.operation === "REPORT_ISSUE",
  );
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    event: { actor: { id: worker.id }, notes: "Original reporter reason" },
  });
  expect(
    (
      await service.history(fixture.actorId, { page: 1, limit: 100 })
    ).events.map((event) => event.operation),
  ).toEqual(["RESOLVE_ISSUE", "APPROVE_INITIAL"]);
  await expect(
    service.event(worker.id, fixture.order.id, reportId),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await new StaffService(db).changeDepartment(fixture.actorId, worker.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "PRODUCTION",
  });
  await expect(
    service.orderHistory(worker.id, fixture.order.id, { page: 1, limit: 100 }),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await expect(
    service.event(fixture.actorId, randomUUID(), reportId),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  const contact = await service.event(
    fixture.actorId,
    fixture.order.id,
    history.events[0]?.kind === "approval"
      ? history.events[0].event.id
      : randomUUID(),
  );
  expect(contact.after.proposal?.contactNotes).toBe("Private customer note");
});

const reportAndRefer = async (
  service: ApprovalService,
  actorId: string,
  orderId: string,
  pieceId: string,
  version: number,
) => {
  const reported = await service.reportIssue(actorId, orderId, pieceId, {
      commandId: randomUUID(),
      expectedVersion: version,
      reason: "Factory report reason",
      notes: "Safe factory report note",
    }),
    issueId = reported.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  await service.resolveIssue(actorId, orderId, pieceId, issueId, {
    commandId: randomUUID(),
    expectedVersion: version + 1,
    decision: "SEND_TO_SALES",
    target: "PRODUCTION",
    notes: "Private contact instructions",
  });
  return issueId;
};
it("holds whole-order official paper across multiple submissions and recontact, then prints actual approval stamps", async () => {
  await resetOwnedIdentityTestData(db);
  fixture = await createApprovalOrderFixture(db, "SHOP", [
    "زبيري - z",
    "نعام - O",
  ]);
  const service = approvals(),
    [first, second] = fixture.order.pieces;
  if (first === undefined || second === undefined)
    throw new Error("Expected two pieces");
  await expect(
    service.officialPaper(fixture.actorId, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_PRINT_NOT_APPROVED" });
  const initialId = randomUUID();
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: initialId,
    expectedVersion: 1,
  });
  const issueA = await reportAndRefer(
      service,
      fixture.actorId,
      fixture.order.id,
      first.id,
      2,
    ),
    issueB = await reportAndRefer(
      service,
      fixture.actorId,
      fixture.order.id,
      second.id,
      4,
    );
  expect(
    (await service.officialPaper(fixture.actorId, fixture.order.id)).approval
      .initial.decisionId,
  ).toBe(initialId);
  const changed = await db.catalogEntry.findFirstOrThrow({
    where: { kind: "model", displayValue: { not: first.model ?? "" } },
  });
  const proposalA = (
    await service.submitContact(
      fixture.actorId,
      fixture.order.id,
      first.id,
      issueA,
      {
        commandId: randomUUID(),
        expectedVersion: 6,
        kind: "AMEND",
        contactNotes: "Private first customer note",
        changes: { model: changed.id },
      },
    )
  ).outcome.proposalId;
  const proposalB = (
    await service.submitContact(
      fixture.actorId,
      fixture.order.id,
      second.id,
      issueB,
      {
        commandId: randomUUID(),
        expectedVersion: 7,
        kind: "AMEND",
        contactNotes: "Private second customer note",
        changes: {},
      },
    )
  ).outcome.proposalId;
  if (proposalA === null || proposalB === null)
    throw new Error("Expected both proposals");
  await expect(
    service.officialPaper(fixture.actorId, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_PRINT_REAPPROVAL_PENDING" });
  await service.reviewContact(
    fixture.actorId,
    fixture.order.id,
    first.id,
    issueA,
    {
      commandId: randomUUID(),
      expectedVersion: 8,
      proposalId: proposalA,
      decision: "RETURN_TO_SALES",
      reason: "Private recontact instructions",
    },
  );
  await service.reviewContact(
    fixture.actorId,
    fixture.order.id,
    second.id,
    issueB,
    {
      commandId: randomUUID(),
      expectedVersion: 9,
      proposalId: proposalB,
      decision: "ACCEPT",
      notes: "Positive second-piece manufacturing instruction",
    },
  );
  await expect(
    service.officialPaper(fixture.actorId, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_PRINT_REAPPROVAL_PENDING" });
  const renewed = (
    await service.submitContact(
      fixture.actorId,
      fixture.order.id,
      first.id,
      issueA,
      {
        commandId: randomUUID(),
        expectedVersion: 10,
        kind: "AMEND",
        contactNotes: "Private renewed customer note",
        changes: { model: changed.id },
      },
    )
  ).outcome.proposalId;
  if (renewed === null) throw new Error("Expected renewed proposal");
  const acceptedId = randomUUID();
  await service.reviewContact(
    fixture.actorId,
    fixture.order.id,
    first.id,
    issueA,
    {
      commandId: acceptedId,
      expectedVersion: 11,
      proposalId: renewed,
      decision: "ACCEPT",
      notes: "Positive first-piece manufacturing instruction",
    },
  );
  const paidActor = await db.user.create({
    data: {
      email: "late-paid@example.test",
      fullName: "Late paid actor",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  await fixture.sales.setPaid(paidActor.id, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 12,
    paidAmount: "2000.00",
  });
  const paper = await service.officialPaper(fixture.actorId, fixture.order.id);
  expect(paper.printVersion).toBe(13);
  expect(paper.approval.initial).toMatchObject({
    decisionId: initialId,
    orderVersion: 2,
    actor: { id: fixture.actorId },
  });
  expect(paper.approval.pieces).toMatchObject([
    {
      pieceId: first.id,
      proposalId: renewed,
      decisionId: acceptedId,
      orderVersion: 12,
      actor: { id: fixture.actorId },
    },
  ]);
  expect(paper.order.pieces[0]?.model).toBe(changed.displayValue);
  const factory = await service.factoryPaper(fixture.actorId, fixture.order.id);
  expect(factory.order.pieces).toHaveLength(2);
  expect(factory.issues).toHaveLength(2);
  expect(
    factory.issues.map((issue) => issue.approvedInstructions).sort(),
  ).toEqual([
    "Positive first-piece manufacturing instruction",
    "Positive second-piece manufacturing instruction",
  ]);
  const text = JSON.stringify(factory);
  expect(text).not.toMatch(
    /customerPhone|customerEmail|customerAddress|paidAmount|unitPrice|money|catalogSourceId|priceSourceId|currentProposal|contactNotes|beforeFacts|afterFacts|passwordHash/u,
  );
  expect(text).not.toContain("Private");
});
it("authorizes factory whole-order context by current or held source without borrowing an older cycle instruction", async () => {
  const service = approvals(),
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected piece");
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const worker = await db.user.create({
    data: {
      email: "paper-source@example.test",
      fullName: "Factory source",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(db).approveStaff(fixture.actorId, worker.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "CUTTING",
  });
  const report = await service.reportIssue(
      worker.id,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Original cycle",
        notes: "Factory report note",
      },
    ),
    issueId = report.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  expect(
    (await service.factoryPaper(worker.id, fixture.order.id)).order.counts
      .original,
  ).toBe(1);
  await expect(
    service.officialPaper(worker.id, fixture.order.id),
  ).rejects.toMatchObject({ code: "DEPARTMENT_ACCESS_DENIED" });
  await service.resolveIssue(
    fixture.actorId,
    fixture.order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "RETURN_TO_DEPARTMENT",
      target: "CUTTING",
      notes: "Old positive instruction",
    },
  );
  expect(
    (await service.factoryPaper(worker.id, fixture.order.id)).issues[0]
      ?.approvedInstructions,
  ).toBe("Old positive instruction");
  const later = await reportAndRefer(
    service,
    fixture.actorId,
    fixture.order.id,
    pieceId,
    4,
  );
  const held = await service.factoryPaper(worker.id, fixture.order.id);
  expect(held.issues).toMatchObject([
    {
      issueId: later,
      state: "SALES_CONTACT",
      approvedInstructions: null,
      reason: "Factory report reason",
      reportNotes: "Safe factory report note",
    },
  ]);
  const proposal = (
    await service.submitContact(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      later,
      {
        commandId: randomUUID(),
        expectedVersion: 6,
        kind: "AMEND",
        contactNotes: "Private pending specification",
        changes: {},
      },
    )
  ).outcome.proposalId;
  if (proposal === null) throw new Error("Expected proposal");
  expect(
    JSON.stringify(await service.factoryPaper(worker.id, fixture.order.id)),
  ).not.toContain("Private");
  await service.reviewContact(
    fixture.actorId,
    fixture.order.id,
    pieceId,
    later,
    {
      commandId: randomUUID(),
      expectedVersion: 7,
      proposalId: proposal,
      decision: "ACCEPT",
      notes: "Latest positive instruction",
    },
  );
  await expect(
    service.factoryPaper(worker.id, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  expect(
    (
      await new ApprovalCommandExecutor(db).observe(
        worker.id,
        report.receipt.commandId,
      )
    ).outcome.issueId,
  ).toBe(issueId);
  await new StaffService(db).changeDepartment(fixture.actorId, worker.id, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "PRODUCTION",
  });
  expect(
    (await service.factoryPaper(worker.id, fixture.order.id)).issues,
  ).toMatchObject([
    { issueId: later, approvedInstructions: "Latest positive instruction" },
  ]);
});
it("denies returned and legacy-unwitnessed paper and retains truthful zero-active cancellation paper", async () => {
  const service = approvals();
  await service.returnInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Return for correction",
    notes: null,
  });
  await expect(
    service.officialPaper(fixture.actorId, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_PRINT_RETURNED" });
  await resetOwnedIdentityTestData(db);
  fixture = await createApprovalOrderFixture(db);
  // Historical pre-P04 shape only: suppress the one new-transition witness trigger in the owned fixture transaction.
  // The real upgrade preservation is independently tested by the database migration suite.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "ALTER TABLE sales_orders DISABLE TRIGGER p04_initial_approval_binding",
    );
    await tx.salesOrder.update({
      where: { id: fixture.order.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await tx.salesOrderPiece.updateMany({
      where: { orderId: fixture.order.id },
      data: { stage: "CUTTING" },
    });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe(
      "ALTER TABLE sales_orders ENABLE TRIGGER p04_initial_approval_binding",
    );
  });
  expect(
    (await service.getOrder(fixture.actorId, fixture.order.id)).workflow
      .initialApproval,
  ).toBeNull();
  await expect(
    service.officialPaper(fixture.actorId, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_PRINT_NOT_APPROVED" });
  expect(await db.approvalCommand.count()).toBe(0);
  await resetOwnedIdentityTestData(db);
  fixture = await createApprovalOrderFixture(db);
  const pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected piece");
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const report = await service.reportIssue(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Cancel last piece",
        notes: null,
      },
    ),
    issueId = report.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  await service.resolveIssue(
    fixture.actorId,
    fixture.order.id,
    pieceId,
    issueId,
    {
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "CANCEL",
      confirmed: true,
      reason: "Retained cancellation",
    },
  );
  const paper = await service.officialPaper(fixture.actorId, fixture.order.id);
  expect(paper.order.status).toBe("CANCELLED");
  expect(paper.order.counts).toMatchObject({
    active: 0,
    cancelled: 1,
    completionPercent: 0,
  });
  expect(paper.approval.pieces).toEqual([]);
  expect(paper.order.money.paidAmount).toBe("100.50");
  expect(
    (await service.factoryPaper(fixture.actorId, fixture.order.id)).order.counts
      .active,
  ).toBe(0);
});

it("uses root revision order for latest instructions when separate commands share one timestamp", async () => {
  const service = approvals(),
    pieceId = fixture.order.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected piece");
  await service.approveInitial(fixture.actorId, fixture.order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const report = await service.reportIssue(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Same-instant decisions",
        notes: null,
      },
    ),
    issueId = report.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
    await service.resolveIssue(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: "ffffffff-ffff-4fff-bfff-ffffffffffff",
        expectedVersion: 3,
        decision: "SEND_TO_SALES",
        target: "CUTTING",
        notes: "Older instructions",
      },
    );
    const proposal = (
      await service.submitContact(
        fixture.actorId,
        fixture.order.id,
        pieceId,
        issueId,
        {
          commandId: randomUUID(),
          expectedVersion: 4,
          kind: "AMEND",
          contactNotes: "Customer confirmation",
          changes: {},
        },
      )
    ).outcome.proposalId;
    if (proposal === null) throw new Error("Expected proposal");
    await service.reviewContact(
      fixture.actorId,
      fixture.order.id,
      pieceId,
      issueId,
      {
        commandId: "00000000-0000-4000-8000-000000000000",
        expectedVersion: 5,
        proposalId: proposal,
        decision: "RETURN_TO_SALES",
        reason: "Newest instructions",
      },
    );
  } finally {
    vi.useRealTimers();
  }
  expect(
    (await service.getOrder(fixture.actorId, fixture.order.id)).workflow
      .issues[0]?.instructions?.text,
  ).toBe("Newest instructions");
});

it("reads a preserved pre-P04 return proof without inventing a command or optional notes", async () => {
  const decisionId = randomUUID(),
    returnedAt = new Date("2026-01-01T00:00:00Z");
  // Historical P03 controlled proof, not a newly executed P04 return.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "ALTER TABLE sales_orders DISABLE TRIGGER p04_return_decision_binding",
    );
    await tx.salesOrder.update({
      where: { id: fixture.order.id },
      data: {
        status: "RETURNED",
        currentReturnDecisionId: decisionId,
        currentReturnOrderVersion: 1,
        currentReturnReason: "Retained P03 return reason",
        currentReturnedAt: returnedAt,
      },
    });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe(
      "ALTER TABLE sales_orders ENABLE TRIGGER p04_return_decision_binding",
    );
  });
  const service = approvals(),
    current = await service.getOrder(fixture.actorId, fixture.order.id);
  expect(current.workflow.currentReturn).toEqual({
    decisionId,
    reason: "Retained P03 return reason",
    notes: null,
    returnedAt: returnedAt.toISOString(),
  });
  expect(current.workflow.initialApproval).toBeNull();
  expect(await db.approvalCommand.count()).toBe(0);
  await expect(
    service.officialPaper(fixture.actorId, fixture.order.id),
  ).rejects.toMatchObject({ code: "ORDER_PRINT_RETURNED" });
});
