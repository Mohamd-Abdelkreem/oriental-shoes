import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { ApprovalDecisionStamp } from "@template/contracts";
import {
  getApprovalIssueActions,
  getApprovalPrintEligibility,
  assertInitialDecisionState,
} from "./approval.rules.js";

const ownerId = randomUUID(),
  issueId = randomUUID();
const actor = {
  id: ownerId,
  role: "USER" as const,
  department: "SALES" as const,
};
it("separates same-owner contact authority from approval and ADMIN's broader reads", () => {
  const issue = {
    id: issueId,
    pieceId: randomUUID(),
    state: "SALES_CONTACT" as const,
    latestProposalId: null,
  };
  expect(getApprovalIssueActions(actor, ownerId, issue, issueId)).toEqual({
    canResolve: false,
    canSubmitContact: true,
    canReviewContact: false,
  });
  expect(
    getApprovalIssueActions(
      { ...actor, department: "APPROVAL" },
      ownerId,
      issue,
      issueId,
    ).canSubmitContact,
  ).toBe(false);
  expect(
    getApprovalIssueActions(
      { ...actor, id: randomUUID(), role: "ADMIN", department: null },
      ownerId,
      issue,
      issueId,
    ).canSubmitContact,
  ).toBe(false);
  expect(
    getApprovalIssueActions(
      { ...actor, role: "ADMIN", department: null },
      ownerId,
      issue,
      issueId,
    ).canSubmitContact,
  ).toBe(true);
  expect(
    getApprovalIssueActions(actor, ownerId, issue, randomUUID())
      .canSubmitContact,
  ).toBe(false);
  const approver = { ...actor, department: "APPROVAL" as const };
  expect(
    getApprovalIssueActions(
      approver,
      ownerId,
      { ...issue, state: "APPROVAL_REVIEW" },
      issueId,
    ).canResolve,
  ).toBe(true);
  expect(
    getApprovalIssueActions(
      approver,
      ownerId,
      { ...issue, state: "REAPPROVAL", latestProposalId: randomUUID() },
      issueId,
    ).canReviewContact,
  ).toBe(true);
  expect(
    getApprovalIssueActions(
      approver,
      ownerId,
      { ...issue, state: "REAPPROVAL" },
      issueId,
    ).canReviewContact,
  ).toBe(false);
});
it("holds the whole order through renewed contact and partial resolution without treating initial referral as a submitted proposal", () => {
  const at = "2026-11-07T01:00:00.000Z",
    root = { order: { status: "APPROVED" as const, approvedAt: new Date(at) } };
  const stamp: ApprovalDecisionStamp = {
    decisionId: randomUUID(),
    orderVersion: 2,
    actor: { ...actor, fullName: "Approver", department: "APPROVAL" },
    approvedAt: at,
  };
  expect(getApprovalPrintEligibility(root, null, [])).toEqual({
    allowed: false,
    reason: "NOT_APPROVED",
  });
  expect(
    getApprovalPrintEligibility(root, stamp, [
      { state: "SALES_CONTACT", latestProposalId: null },
    ]),
  ).toEqual({ allowed: true, reason: null });
  for (const state of ["SALES_CONTACT", "REAPPROVAL"] as const) {
    expect(
      getApprovalPrintEligibility(root, stamp, [
        { state: "RESOLVED", latestProposalId: randomUUID() },
        { state, latestProposalId: randomUUID() },
      ]),
    ).toEqual({ allowed: false, reason: "PENDING_REAPPROVAL" });
  }
  expect(
    getApprovalPrintEligibility(root, stamp, [
      { state: "RESOLVED", latestProposalId: randomUUID() },
    ]),
  ).toEqual({ allowed: true, reason: null });
  expect(
    getApprovalPrintEligibility(
      { order: { status: "RETURNED", approvedAt: null } },
      null,
      [],
    ),
  ).toEqual({ allowed: false, reason: "RETURNED" });
  expect(
    getApprovalPrintEligibility(
      {
        ...root,
        order: { ...root.order, approvedAt: new Date("2026-11-06T01:00:00Z") },
      },
      stamp,
      [],
    ).allowed,
  ).toBe(false);
});
it("distinguishes obsolete initial intent from an inconsistent pending piece graph", () => {
  const piece = {
    stage: "AWAITING_APPROVAL" as const,
    workState: "INCOMING" as const,
    issueId: null,
    receivedAt: null,
    cancelledAt: null,
  };
  const root = {
    order: { status: "AWAITING_APPROVAL" as const, approvedAt: null },
    pieces: [{ orderPiece: piece }],
  };
  expect(() => {
    assertInitialDecisionState(root, false);
  }).not.toThrow();
  expect(() => {
    assertInitialDecisionState(root, true);
  }).toThrow(expect.objectContaining({ code: "ORDER_STATE_CONFLICT" }));
  expect(() => {
    assertInitialDecisionState(
      { ...root, pieces: [{ orderPiece: { ...piece, stage: "PRODUCTION" } }] },
      false,
    );
  }).toThrow(expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }));
  expect(() => {
    assertInitialDecisionState(
      { ...root, pieces: [{ orderPiece: null }] },
      false,
    );
  }).toThrow(expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }));
});

it("maps retained proposal labels and missing old bindings without inventing catalog defaults or applying cancellation values", async () => {
  const { mapContactProposal } = await import("./approval.mapper.js");
  const proposal = {
    id: randomUUID(),
    orderId: randomUUID(),
    pieceId: randomUUID(),
    issueId: randomUUID(),
    sequence: 1,
    kind: "AMEND" as const,
    submittedCommandId: randomUUID(),
    submittedById: ownerId,
    submittedByFullName: "Owner admin",
    contactNotes: "Customer confirmed",
    submittedAt: new Date("2026-11-07T01:00:00Z"),
    beforeModel: "SM",
    beforeSize: "40",
    beforeLeatherBase: "001 - جلد ",
    beforeSole: null,
    beforeModelId: null,
    beforeSizeId: null,
    beforeLeatherBaseId: null,
    beforeSoleId: null,
    proposedModel: "SM",
    proposedSize: "40.5",
    proposedLeatherBase: "001 - جلد ",
    proposedSole: null,
    proposedModelId: null,
    proposedSizeId: null,
    proposedLeatherBaseId: null,
    proposedSoleId: null,
    submittedCommand: { actorRole: "ADMIN" as const, actorDepartment: null },
  };
  expect(mapContactProposal(proposal)).toMatchObject({
    before: { leatherBase: "001 - جلد ", catalogSelections: { model: null } },
    proposed: { size: "40.5" },
    submittedBy: { id: ownerId, role: "ADMIN" },
  });
  expect(
    mapContactProposal({
      ...proposal,
      kind: "CANCEL_REQUEST",
      proposedModel: null,
      proposedSize: null,
      proposedLeatherBase: null,
    }).proposed,
  ).toBeNull();
  expect(() =>
    mapContactProposal({ ...proposal, proposedModel: null }),
  ).toThrow(expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }));
});

it("validates retained cancelled rows while requiring a positive active awaiting set", () => {
  const active = {
    stage: "AWAITING_APPROVAL" as const,
    workState: "INCOMING" as const,
    issueId: null,
    receivedAt: null,
    cancelledAt: null,
  };
  const cancelled = {
    ...active,
    stage: "CANCELLED" as const,
    workState: "BLOCKED" as const,
    cancelledAt: new Date(),
  };
  const root = {
    order: { status: "AWAITING_APPROVAL" as const, approvedAt: null },
    pieces: [{ orderPiece: cancelled }, { orderPiece: active }],
  };
  expect(() => {
    assertInitialDecisionState(root, false);
  }).not.toThrow();
  expect(() => {
    assertInitialDecisionState(
      { ...root, pieces: [{ orderPiece: cancelled }] },
      false,
    );
  }).toThrow(expect.objectContaining({ code: "ORDER_STATE_CONFLICT" }));
  expect(() => {
    assertInitialDecisionState(
      {
        ...root,
        pieces: [
          { orderPiece: { ...cancelled, workState: "INCOMING" } },
          { orderPiece: active },
        ],
      },
      false,
    );
  }).toThrow(expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }));
});
