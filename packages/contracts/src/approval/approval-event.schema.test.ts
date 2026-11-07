import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { approvalActivityEventSchema } from "./approval-event.schema.ts";

const summary = () => ({
  id: randomUUID(),
  orderId: randomUUID(),
  orderVersion: 3,
  businessNumber: "REPAIR-2026-0002",
  operation: "RESOLVE_ISSUE",
  actor: {
    id: randomUUID(),
    fullName: "Approver",
    role: "USER",
    department: "APPROVAL",
  },
  occurredAt: "2026-11-07T01:00:00Z",
  pieceId: randomUUID(),
  issueId: randomUUID(),
  proposalId: null,
  decision: "SEND_TO_SALES",
  notes: "Confirm size",
  changedFields: ["issue"],
});
it("keeps safe typed issue history without permitting private snapshots or duplicate changes", () => {
  const valid = summary();
  expect(approvalActivityEventSchema.parse(valid)).toEqual(valid);
  for (const patch of [
    { changedFields: ["issue", "issue"] },
    { changedFields: ["paidAmount"] },
    { before: { money: "private" } },
    { decision: "ACCEPT" },
    { issueId: null },
    { proposalId: randomUUID() },
    { actor: { ...valid.actor, department: "SALES" } },
  ])
    expect(
      approvalActivityEventSchema.safeParse({ ...valid, ...patch }).success,
    ).toBe(false);
});
it.each([
  ["APPROVE_INITIAL", null, null, null, null, "APPROVAL"],
  ["RETURN_INITIAL", null, null, null, null, "APPROVAL"],
  ["REPORT_ISSUE", randomUUID(), randomUUID(), null, null, "PRODUCTION"],
  ["SUBMIT_CONTACT", randomUUID(), randomUUID(), randomUUID(), null, "SALES"],
  [
    "REVIEW_CONTACT",
    randomUUID(),
    randomUUID(),
    randomUUID(),
    "RETURN_TO_SALES",
    "APPROVAL",
  ],
])(
  "retains the selected versus generated targets of %s",
  (operation, pieceId, issueId, proposalId, decision, department) => {
    const valid = {
      ...summary(),
      operation,
      pieceId,
      issueId,
      proposalId,
      decision,
      actor: { ...summary().actor, department },
    };
    expect(approvalActivityEventSchema.parse(valid)).toEqual(valid);
    expect(
      approvalActivityEventSchema.safeParse({
        ...valid,
        decision: "unsupported",
      }).success,
    ).toBe(false);
  },
);
