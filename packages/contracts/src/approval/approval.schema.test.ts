import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  salesOrderSchema,
  salesOrderActivityDataSchema,
  salesOrderRevisionDataSchema,
  submissionCaptureSchema,
} from "../sales-orders/sales-orders.schema.ts";
import {
  approveInitialBodySchema,
  returnInitialBodySchema,
  reportIssueBodySchema,
  resolveIssueBodySchema,
  submitContactBodySchema,
  reviewContactBodySchema,
  approvalOrdersQuerySchema,
  approvalIssuesQuerySchema,
  salesContactQuerySchema,
  approvalHistoryQuerySchema,
  approvalOrderHistoryQuerySchema,
  pieceContactProposalSchema,
  approvalOrderDataSchema,
  approvalWorkflowSchema,
  approvalDashboardDataSchema,
  approvalEventDataSchema,
  approvalEventFactsSchema,
  officialOrderPaperDataSchema,
  factoryOrderPaperDataSchema,
  manufacturingIssueSchema,
} from "./approval.schema.ts";

const instant = "2026-11-07T01:00:00Z";
const actor = {
  id: randomUUID(),
  fullName: "Approver",
  role: "USER",
  department: "APPROVAL",
};
const base = () => ({ commandId: randomUUID(), expectedVersion: 2 });
const values = () => ({
  model: "SM",
  size: "40",
  leatherBase: "001 - جلد ",
  sole: null,
  catalogSelections: { model: null, size: null, leatherBase: null, sole: null },
});
const proposal = () => ({
  id: randomUUID(),
  kind: "AMEND",
  contactNotes: "Confirmed size",
  before: values(),
  proposed: { ...values(), size: "40.5" },
  submittedBy: { ...actor, department: "SALES" },
  submittedAt: instant,
});
const order = () => {
  const capture = submissionCaptureSchema.parse({
    type: "SHOP",
    customerId: randomUUID(),
    pieces: [
      {
        id: randomUUID(),
        model: "SM",
        size: "40",
        leatherBase: "001 - جلد ",
        decoration: "زبيري - z",
        face: "Face",
      },
    ],
  });
  const { paidAmount: _paid, ...captured } = capture;
  return salesOrderSchema.parse({
    ...captured,
    id: randomUUID(),
    version: 3,
    owner: { id: randomUUID(), fullName: "Sales owner" },
    status: "APPROVED",
    businessNumber: "SHOP-2026-0001",
    businessYear: 2026,
    sequence: "1",
    customerSnapshot: {
      name: "Customer",
      phone: "+966500000001",
      email: null,
      address: null,
    },
    createdAt: instant,
    updatedAt: instant,
    submittedAt: instant,
    money: {
      total: "1800.00",
      paidAmount: "0.00",
      remainingDue: "1800.00",
      surplus: "0.00",
    },
    counts: {
      original: 1,
      active: 1,
      cancelled: 0,
      received: 0,
      completionPercent: 0,
    },
    approval: {
      approvedAt: instant,
      returnDecisionId: null,
      returnedAt: null,
      returnReason: null,
      returnRevision: 0,
    },
    allowedActions: { canResubmit: false, canSetPaid: true },
    pieces: capture.pieces.map((piece) => ({
      ...piece,
      position: 1,
      quantity: 1,
      decorationEntryId: randomUUID(),
      catalogSourceId: randomUUID(),
      unitPrice: "1800.00",
      stage: "CUTTING",
      workState: "INCOMING",
      receivedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    })),
  });
};
const stamp = () => ({
  decisionId: randomUUID(),
  orderVersion: 2,
  actor,
  approvedAt: instant,
});
const workflow = () => ({
  initialApproval: stamp(),
  currentReturn: null,
  allowedActions: { canApproveInitial: false, canReturnInitial: false },
  printEligibility: { allowed: true, reason: null },
  issues: [],
});
const issue = (orderId: string, pieceId: string) => ({
  id: randomUUID(),
  orderId,
  pieceId,
  state: "REAPPROVAL",
  source: { department: "CUTTING", stage: "CUTTING", workState: "IN_PROGRESS" },
  reporter: { ...actor, department: "CUTTING" },
  reportedAt: instant,
  reason: "Material issue",
  notes: null,
  resumeTarget: "PRODUCTION",
  currentProposal: proposal(),
  instructions: {
    commandId: randomUUID(),
    actor,
    occurredAt: instant,
    text: "Contact owner",
  },
  allowedActions: {
    canResolve: false,
    canSubmitContact: false,
    canReviewContact: true,
  },
});

describe("P04 strict command inputs", () => {
  it("requires bounded free text and normalizes only optional notes", () => {
    for (const schema of [returnInitialBodySchema, reportIssueBodySchema]) {
      const valid = { ...base(), reason: "  Keep entered reason  " };
      for (const notes of [undefined, null, "", "   "])
        expect(schema.parse({ ...valid, notes })).toMatchObject({
          reason: valid.reason,
          notes: null,
        });
      expect(
        schema.parse({
          ...valid,
          reason: "r".repeat(4000),
          notes: "n".repeat(4000),
        }).notes,
      ).toHaveLength(4000);
      for (const reason of [
        undefined,
        null,
        "",
        " ",
        "x\u0000",
        "x".repeat(4001),
      ])
        expect(schema.safeParse({ ...valid, reason }).success).toBe(false);
      for (const notes of ["x\u0000", " ".repeat(4001)])
        expect(schema.safeParse({ ...valid, notes }).success).toBe(false);
    }
    expect(
      approveInitialBodySchema.safeParse({ ...base(), actorId: actor.id })
        .success,
    ).toBe(false);
  });
  it("accepts sparse four-field proposals and keeps requests free of specification changes", () => {
    const amend = {
      ...base(),
      kind: "AMEND",
      contactNotes: "Customer confirmed",
      changes: {},
    };
    expect(submitContactBodySchema.parse(amend)).toEqual(amend);
    const changes = {
      model: randomUUID(),
      size: randomUUID(),
      leatherBase: randomUUID(),
      sole: null,
    };
    expect(submitContactBodySchema.parse({ ...amend, changes })).toMatchObject({
      changes,
    });
    for (const changes of [
      { model: null },
      { size: "" },
      { leatherBase: null },
      { decoration: randomUUID() },
      { soleAddition: randomUUID() },
      { customerId: randomUUID() },
      { target: "CUTTING" },
      { paidAmount: "0.00" },
    ])
      expect(
        submitContactBodySchema.safeParse({ ...amend, changes }).success,
      ).toBe(false);
    const request = {
      ...base(),
      kind: "CANCEL_REQUEST",
      contactNotes: "Customer requested cancellation",
    };
    expect(submitContactBodySchema.parse(request)).toEqual(request);
    expect(
      submitContactBodySchema.safeParse({ ...request, changes: {} }).success,
    ).toBe(false);
  });
  it("separates issue decisions, exact proposal review and explicit cancellation", () => {
    for (const decision of ["RETURN_TO_DEPARTMENT", "SEND_TO_SALES"]) {
      const valid = {
        ...base(),
        decision,
        target: "PRODUCTION",
        notes: "Retain instructions",
      };
      expect(resolveIssueBodySchema.parse(valid)).toEqual(valid);
      for (const patch of [
        { target: undefined },
        { target: "QUALITY" },
        { notes: " " },
      ])
        expect(
          resolveIssueBodySchema.safeParse({ ...valid, ...patch }).success,
        ).toBe(false);
    }
    const cancel = {
      ...base(),
      decision: "CANCEL",
      reason: "Unworkable",
      confirmed: true,
    };
    expect(resolveIssueBodySchema.parse(cancel)).toEqual(cancel);
    expect(
      resolveIssueBodySchema.safeParse({ ...cancel, confirmed: false }).success,
    ).toBe(false);
    expect(
      resolveIssueBodySchema.safeParse({ ...cancel, target: "CUTTING" })
        .success,
    ).toBe(false);
    for (const branch of [
      { decision: "ACCEPT", notes: "Approved" },
      { decision: "RETURN_TO_SALES", reason: "Confirm again" },
      { decision: "CANCEL", reason: "Cancel", confirmed: true },
    ]) {
      const valid = { ...base(), proposalId: randomUUID(), ...branch };
      expect(reviewContactBodySchema.parse(valid)).toEqual(valid);
      expect(
        reviewContactBodySchema.safeParse({ ...valid, proposalId: undefined })
          .success,
      ).toBe(false);
      expect(
        reviewContactBodySchema.safeParse({ ...valid, target: "CUTTING" })
          .success,
      ).toBe(false);
    }
  });
});
it("bounds query windows and rejects actor-selected scope or invalid issue filters", () => {
  for (const schema of [
    approvalOrdersQuerySchema,
    approvalIssuesQuerySchema,
    salesContactQuerySchema,
    approvalHistoryQuerySchema,
    approvalOrderHistoryQuerySchema,
  ]) {
    expect(schema.parse({})).toMatchObject({ page: 1, limit: 25 });
    for (const query of [
      { limit: "101" },
      { ownerId: randomUUID() },
      { page: String(Number.MAX_SAFE_INTEGER), limit: 100 },
    ])
      expect(schema.safeParse(query).success).toBe(false);
  }
  expect(
    approvalIssuesQuerySchema.safeParse({ state: "RESOLVED" }).success,
  ).toBe(false);
  expect(
    salesContactQuerySchema.safeParse({ state: "APPROVAL_REVIEW" }).success,
  ).toBe(false);
});
it("retains source labels/null historical references and distinguishes AMEND from cancellation request", () => {
  const valid = proposal();
  expect(pieceContactProposalSchema.parse(valid)).toEqual(valid);
  expect(
    pieceContactProposalSchema.parse({
      ...valid,
      kind: "CANCEL_REQUEST",
      proposed: null,
    }).before.leatherBase,
  ).toBe("001 - جلد ");
  for (const patch of [
    { proposed: null },
    { kind: "CANCEL_REQUEST" },
    { submittedBy: actor },
    { before: { ...valid.before, model: " " } },
    {
      before: {
        ...valid.before,
        catalogSelections: {
          ...valid.before.catalogSelections,
          sole: randomUUID(),
        },
      },
    },
  ])
    expect(
      pieceContactProposalSchema.safeParse({ ...valid, ...patch }).success,
    ).toBe(false);
});
it("binds held review, print hold and current piece identity to one canonical wrapper", () => {
  const current = order(),
    pieceId = current.pieces[0]?.id;
  if (pieceId === undefined) throw new Error("Expected one fixture piece");
  const held = issue(current.id, pieceId),
    state = workflow();
  const valid = {
    order: current,
    workflow: {
      ...state,
      issues: [held],
      printEligibility: { allowed: false, reason: "PENDING_REAPPROVAL" },
    },
  };
  expect(approvalOrderDataSchema.parse(valid)).toEqual(valid);
  for (const patch of [
    { printEligibility: state.printEligibility },
    { issues: [{ ...held, orderId: randomUUID() }] },
    { issues: [{ ...held, pieceId: randomUUID() }] },
    { issues: [held, held] },
  ])
    expect(
      approvalOrderDataSchema.safeParse({
        ...valid,
        workflow: { ...valid.workflow, ...patch },
      }).success,
    ).toBe(false);
  const returned = {
    ...held,
    state: "SALES_CONTACT",
    allowedActions: {
      canResolve: false,
      canSubmitContact: true,
      canReviewContact: false,
    },
  };
  expect(
    approvalOrderDataSchema.parse({
      ...valid,
      workflow: { ...valid.workflow, issues: [returned] },
    }).workflow.printEligibility.allowed,
  ).toBe(false);
  expect(
    manufacturingIssueSchema.safeParse({
      ...held,
      source: { ...held.source, department: "QUALITY" },
    }).success,
  ).toBe(false);
  expect(
    manufacturingIssueSchema.safeParse({ ...held, currentProposal: null })
      .success,
  ).toBe(false);
  expect(
    approvalWorkflowSchema.safeParse({
      ...state,
      issues: Array.from({ length: 201 }, () => held),
    }).success,
  ).toBe(false);
});
it("requires dashboard totals to distinguish unresolved state counts", () => {
  const counts = {
    initialOrders: 4,
    approvalIssues: 1,
    salesContactPieces: 2,
    reapprovalPieces: 3,
    unresolvedIssues: 6,
    approvedToday: 5,
    returnedOrders: 7,
  };
  expect(
    approvalDashboardDataSchema.parse({ counts, recentOrders: [] }),
  ).toEqual({ counts, recentOrders: [] });
  expect(
    approvalDashboardDataSchema.safeParse({
      counts: { ...counts, unresolvedIssues: 5 },
      recentOrders: [],
    }).success,
  ).toBe(false);
});
it("keeps factual official stamps separate and rejects private factory extensions at nested levels", () => {
  const current = order();
  const valid = {
    order: current,
    approval: { initial: stamp(), pieces: [] },
    printVersion: 3,
  };
  expect(officialOrderPaperDataSchema.parse(valid)).toEqual(valid);
  for (const patch of [
    { printVersion: 2 },
    {
      approval: {
        initial: { ...stamp(), actor: { ...actor, department: "SALES" } },
        pieces: [],
      },
    },
    {
      order: {
        ...current,
        approval: { ...current.approval, approvedAt: null },
      },
    },
  ])
    expect(
      officialOrderPaperDataSchema.safeParse({ ...valid, ...patch }).success,
    ).toBe(false);
  const {
    money: _money,
    customerSnapshot,
    owner: _owner,
    approval: _approval,
    allowedActions: _actions,
    createdAt: _created,
    updatedAt: _updated,
    submittedAt: _submitted,
    businessYear: _year,
    sequence: _sequence,
    customerId: _customerId,
    responsibleSignature: _signature,
    ...factory
  } = current;
  const safe = {
    order: {
      ...factory,
      customerName: customerSnapshot.name,
      pieces: current.pieces.map(
        ({
          unitPrice: _unit,
          decorationEntryId: _entry,
          catalogSourceId: _source,
          catalogSelections: _selections,
          ...piece
        }) => piece,
      ),
    },
    issues: [],
  };
  expect(factoryOrderPaperDataSchema.parse(safe)).toEqual(safe);
  for (const extra of [
    { money: current.money },
    { customerPhone: customerSnapshot.phone },
  ])
    expect(
      factoryOrderPaperDataSchema.safeParse({
        ...safe,
        order: { ...safe.order, ...extra },
      }).success,
    ).toBe(false);
  const instruction = {
    pieceId: current.pieces[0]?.id,
    issueId: randomUUID(),
    state: "RESOLVED",
    reason: "Material",
    reportNotes: null,
    approvedInstructions: "Use specified method",
    target: "CUTTING",
  };
  expect(
    factoryOrderPaperDataSchema.parse({ ...safe, issues: [instruction] })
      .issues,
  ).toHaveLength(1);
  for (const issues of [
    [instruction, instruction],
    [{ ...instruction, contactNotes: "private" }],
    [{ ...instruction, pieceId: randomUUID() }],
  ])
    expect(
      factoryOrderPaperDataSchema.safeParse({ ...safe, issues }).success,
    ).toBe(false);
  expect(
    factoryOrderPaperDataSchema.safeParse({
      ...safe,
      order: {
        ...safe.order,
        pieces: safe.order.pieces.map((piece) => ({
          ...piece,
          unitPrice: "1800.00",
        })),
      },
    }).success,
  ).toBe(false);
});
it("accepts additive approval history without treating it as a P03 full revision", () => {
  const current = order();
  const event = {
    id: randomUUID(),
    orderId: current.id,
    orderVersion: 3,
    businessNumber: current.businessNumber,
    operation: "APPROVE_INITIAL",
    actor,
    occurredAt: instant,
    pieceId: null,
    issueId: null,
    proposalId: null,
    decision: null,
    notes: null,
    changedFields: ["approval", "pieceState"],
  };
  const pagination = {
    page: 1,
    limit: 25,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  expect(
    salesOrderActivityDataSchema.parse({
      events: [{ kind: "approval", event }],
      pagination,
    }).events,
  ).toHaveLength(1);
  expect(
    salesOrderRevisionDataSchema.safeParse({
      event,
      before: null,
      after: current,
    }).success,
  ).toBe(false);
  const facts = {
    orderStatus: "APPROVED",
    approvedAt: instant,
    currentReturn: null,
    money: current.money,
    counts: current.counts,
    pieces: current.pieces.map((piece) => ({
      id: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      issueId: null,
      receivedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    })),
    issue: null,
    proposal: null,
  };
  expect(
    approvalEventDataSchema.parse({
      event,
      before: { ...facts, orderStatus: "AWAITING_APPROVAL", approvedAt: null },
      after: facts,
    }).event.id,
  ).toBe(event.id);
  expect(
    approvalEventDataSchema.safeParse({
      event,
      before: facts,
      after: { ...facts, proposal: proposal() },
    }).success,
  ).toBe(false);
});

it("requires the retained target even during an initial sales referral before any proposal exists", () => {
  const current = order(),
    held = issue(current.id, current.pieces[0]?.id ?? randomUUID());
  const referral = {
    ...held,
    state: "SALES_CONTACT",
    currentProposal: null,
    allowedActions: {
      canResolve: false,
      canSubmitContact: true,
      canReviewContact: false,
    },
  };
  expect(manufacturingIssueSchema.parse(referral).resumeTarget).toBe(
    "PRODUCTION",
  );
  expect(
    manufacturingIssueSchema.safeParse({ ...referral, resumeTarget: null })
      .success,
  ).toBe(false);
});

it("keeps precise historical P04 counts without changing the retained percentage", () => {
  const counts = {
    original: 200,
    cancelled: 0,
    active: 200,
    received: 199,
    completionPercent: 100,
  };
  expect(approvalEventFactsSchema.shape.counts.parse(counts)).toEqual(counts);
  expect(
    approvalEventFactsSchema.shape.counts.parse({
      ...counts,
      completionPercent: 99,
    }),
  ).toEqual({ ...counts, completionPercent: 99 });
  expect(
    approvalEventFactsSchema.shape.counts.safeParse({
      ...counts,
      completionPercent: 98,
    }).success,
  ).toBe(false);
  expect(
    approvalEventFactsSchema.shape.counts.safeParse({ ...counts, active: 199 })
      .success,
  ).toBe(false);
});
