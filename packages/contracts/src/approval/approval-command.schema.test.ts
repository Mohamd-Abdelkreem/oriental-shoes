import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { salesCommandActorSchema } from "../sales-commands/command-receipt.schema.ts";
import {
  approvalCommandDataSchema,
  approvalCommandReceiptSchema,
} from "./approval-command.schema.ts";

const receipt = (
  operation = "APPROVE_INITIAL",
  department: string | null = "APPROVAL",
  role = "USER",
) => ({
  commandId: randomUUID(),
  operation,
  orderId: randomUUID(),
  actor: { id: randomUUID(), fullName: "Actual actor", role, department },
  beforeVersion: 4,
  afterVersion: 5,
  occurredAt: "2026-11-07T01:00:00Z",
});
describe("P04 bounded receipt protocol", () => {
  it.each(["RESOLVE_ISSUE", "REVIEW_CONTACT"])(
    "permits readiness only for the resolved CANCEL branch of %s",
    (operation) => {
      const proof = receipt(operation);
      const outcome = {
        orderId: proof.orderId,
        orderVersion: proof.afterVersion,
        orderStatus: "READY_FOR_DELIVERY",
        pieceId: randomUUID(),
        pieceStage: "CANCELLED",
        pieceWorkState: "BLOCKED",
        issueId: randomUUID(),
        issueState: "RESOLVED",
        proposalId: operation === "REVIEW_CONTACT" ? randomUUID() : null,
      };
      const data = {
        kind: "approval-command",
        receipt: proof,
        replayed: false,
        outcome,
      };
      expect(approvalCommandDataSchema.safeParse(data).success).toBe(true);
      for (const change of [
        { pieceStage: "CUTTING", pieceWorkState: "INCOMING" },
        { issueState: "SALES_CONTACT" },
        { pieceWorkState: "COMPLETED" },
      ])
        expect(
          approvalCommandDataSchema.safeParse({
            ...data,
            outcome: { ...outcome, ...change },
          }).success,
        ).toBe(false);
    },
  );
  it.each([
    ["APPROVE_INITIAL", "APPROVAL"],
    ["RETURN_INITIAL", "APPROVAL"],
    ["RESOLVE_ISSUE", "APPROVAL"],
    ["REVIEW_CONTACT", "APPROVAL"],
    ["SUBMIT_CONTACT", "SALES"],
    ["REPORT_ISSUE", "CUTTING"],
    ["REPORT_ISSUE", "PRODUCTION"],
    ["REPORT_ISSUE", "QUALITY"],
  ])(
    "binds %s to its actual employee department %s",
    (operation, department) => {
      const valid = receipt(operation, department);
      expect(approvalCommandReceiptSchema.parse(valid)).toEqual(valid);
      expect(
        approvalCommandReceiptSchema.safeParse({
          ...valid,
          actor: { ...valid.actor, department: "WAREHOUSE" },
        }).success,
      ).toBe(false);
      expect(
        approvalCommandReceiptSchema.safeParse(
          receipt(operation, null, "ADMIN"),
        ).success,
      ).toBe(true);
    },
  );
  it("preserves SALES-only old actors and rejects private or fabricated receipt metadata", () => {
    const valid = receipt();
    expect(salesCommandActorSchema.safeParse(valid.actor).success).toBe(false);
    for (const invalid of [
      { ...valid, beforeVersion: null },
      { ...valid, afterVersion: 6 },
      { ...valid, afterVersion: 2147483648 },
      { ...valid, actor: { ...valid.actor, email: "private@example.test" } },
      { ...valid, paidAmount: "1.00" },
    ])
      expect(approvalCommandReceiptSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
  it("correlates order/version and rejects a piece outcome for an initial command", () => {
    const proof = receipt();
    const outcome = {
      orderId: proof.orderId,
      orderVersion: 5,
      orderStatus: "APPROVED",
      pieceId: null,
      pieceStage: null,
      pieceWorkState: null,
      issueId: null,
      issueState: null,
      proposalId: null,
    };
    const valid = {
      kind: "approval-command",
      receipt: proof,
      replayed: false,
      outcome,
    };
    expect(approvalCommandDataSchema.parse(valid)).toEqual(valid);
    for (const patch of [
      { orderId: randomUUID() },
      { orderVersion: 6 },
      { orderStatus: "RETURNED" },
      { pieceId: randomUUID() },
      { proposalId: randomUUID() },
      { money: { total: "0.00" } },
    ])
      expect(
        approvalCommandDataSchema.safeParse({
          ...valid,
          outcome: { ...outcome, ...patch },
        }).success,
      ).toBe(false);
  });
  it.each([
    ["REPORT_ISSUE", "QUALITY", "APPROVAL_REVIEW", null],
    ["RESOLVE_ISSUE", "APPROVAL", "SALES_CONTACT", null],
    ["SUBMIT_CONTACT", "SALES", "REAPPROVAL", randomUUID()],
    ["REVIEW_CONTACT", "APPROVAL", "RESOLVED", randomUUID()],
  ])(
    "retains generated/result target identities for %s",
    (operation, department, issueState, proposalId) => {
      const proof = receipt(operation, department);
      const outcome = {
        orderId: proof.orderId,
        orderVersion: 5,
        orderStatus: "APPROVED",
        pieceId: randomUUID(),
        pieceStage: issueState === "RESOLVED" ? "PRODUCTION" : "QUALITY",
        pieceWorkState: issueState === "RESOLVED" ? "INCOMING" : "BLOCKED",
        issueId: randomUUID(),
        issueState,
        proposalId,
      };
      const valid = {
        kind: "approval-command",
        receipt: proof,
        replayed: true,
        outcome,
      };
      expect(approvalCommandDataSchema.parse(valid)).toEqual(valid);
      expect(
        approvalCommandDataSchema.safeParse({
          ...valid,
          outcome: { ...outcome, pieceStage: "WAREHOUSE" },
        }).success,
      ).toBe(false);

      expect(
        approvalCommandDataSchema.safeParse({
          ...valid,
          outcome: { ...outcome, issueId: null },
        }).success,
      ).toBe(false);
      expect(
        approvalCommandDataSchema.safeParse({
          ...valid,
          outcome: {
            ...outcome,
            proposalId: proposalId === null ? randomUUID() : null,
          },
        }).success,
      ).toBe(false);
    },
  );
});
