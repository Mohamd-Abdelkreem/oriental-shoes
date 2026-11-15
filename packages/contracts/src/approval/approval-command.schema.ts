import { z } from "zod";
import { departmentSchema, userRoleSchema } from "../account/account.schema.ts";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  salesOrderStatusSchema,
  orderPieceStageSchema,
  orderWorkStateSchema,
} from "../sales-orders/sales-order-values.schema.ts";

export const approvalCommandOperationSchema = z.enum([
  "APPROVE_INITIAL",
  "RETURN_INITIAL",
  "REPORT_ISSUE",
  "RESOLVE_ISSUE",
  "SUBMIT_CONTACT",
  "REVIEW_CONTACT",
]);
export const approvalIssueStateSchema = z.enum([
  "APPROVAL_REVIEW",
  "SALES_CONTACT",
  "REAPPROVAL",
  "RESOLVED",
]);
export const approvalTargetSchema = z.enum(["CUTTING", "PRODUCTION"]);
export const approvalActorSchema = z
  .object({
    id: salesUuidSchema,
    fullName: nonEmptyBoundedString(150),
    role: userRoleSchema,
    department: departmentSchema.nullable(),
  })
  .strict();

export const isApprovalOperationActor = (
  operation: z.infer<typeof approvalCommandOperationSchema>,
  actor: z.infer<typeof approvalActorSchema>,
): boolean => {
  return (
    actor.role === "ADMIN" ||
    (operation === "SUBMIT_CONTACT"
      ? actor.department === "SALES"
      : operation === "REPORT_ISSUE"
        ? actor.department === "CUTTING" ||
          actor.department === "PRODUCTION" ||
          actor.department === "QUALITY"
        : actor.department === "APPROVAL")
  );
};

export const approvalCommandReceiptSchema = z
  .object({
    commandId: salesUuidSchema,
    operation: approvalCommandOperationSchema,
    orderId: salesUuidSchema,
    actor: approvalActorSchema,
    beforeVersion: salesVersionSchema,
    afterVersion: salesVersionSchema,
    occurredAt: salesInstantSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.afterVersion !== receipt.beforeVersion + 1)
      context.addIssue({
        code: "custom",
        path: ["afterVersion"],
        message: "Command versions must advance exactly once",
      });
    const allowed = isApprovalOperationActor(receipt.operation, receipt.actor);
    if (!allowed)
      context.addIssue({
        code: "custom",
        path: ["actor", "department"],
        message: "Actor department must match the operation",
      });
  });
export const approvalCommandOutcomeSchema = z
  .object({
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    orderStatus: salesOrderStatusSchema,
    pieceId: salesUuidSchema.nullable(),
    pieceStage: orderPieceStageSchema.nullable(),
    pieceWorkState: orderWorkStateSchema.nullable(),
    issueId: salesUuidSchema.nullable(),
    issueState: approvalIssueStateSchema.nullable(),
    proposalId: salesUuidSchema.nullable(),
  })
  .strict()
  .refine(
    (outcome) =>
      outcome.pieceId === null
        ? outcome.pieceStage === null &&
          outcome.pieceWorkState === null &&
          outcome.issueId === null &&
          outcome.issueState === null &&
          outcome.proposalId === null
        : outcome.pieceStage !== null &&
          outcome.pieceWorkState !== null &&
          outcome.issueId !== null &&
          outcome.issueState !== null,
    "Outcome target fields must agree",
  );
const isHeldOutcome = (outcome: z.infer<typeof approvalCommandOutcomeSchema>) =>
  outcome.orderStatus === "APPROVED" &&
  (outcome.pieceStage === "CUTTING" ||
    outcome.pieceStage === "PRODUCTION" ||
    outcome.pieceStage === "QUALITY") &&
  outcome.pieceWorkState === "BLOCKED";
const isResolvedOutcome = (
  outcome: z.infer<typeof approvalCommandOutcomeSchema>,
) =>
  outcome.issueState === "RESOLVED" &&
  ((outcome.pieceStage === "CANCELLED" &&
    outcome.pieceWorkState === "BLOCKED" &&
    (outcome.orderStatus === "APPROVED" ||
      outcome.orderStatus === "READY_FOR_DELIVERY" ||
      outcome.orderStatus === "CANCELLED")) ||
    ((outcome.pieceStage === "CUTTING" ||
      outcome.pieceStage === "PRODUCTION") &&
      outcome.pieceWorkState === "INCOMING" &&
      outcome.orderStatus === "APPROVED"));
export const approvalCommandDataSchema = z
  .object({
    kind: z.literal("approval-command"),
    receipt: approvalCommandReceiptSchema,
    replayed: z.boolean(),
    outcome: approvalCommandOutcomeSchema,
  })
  .strict()
  .refine(({ receipt, outcome }) => {
    if (
      receipt.orderId !== outcome.orderId ||
      receipt.afterVersion !== outcome.orderVersion
    )
      return false;
    switch (receipt.operation) {
      case "APPROVE_INITIAL":
        return outcome.pieceId === null && outcome.orderStatus === "APPROVED";
      case "RETURN_INITIAL":
        return outcome.pieceId === null && outcome.orderStatus === "RETURNED";
      case "REPORT_ISSUE":
        return (
          outcome.pieceId !== null &&
          outcome.proposalId === null &&
          outcome.issueState === "APPROVAL_REVIEW" &&
          isHeldOutcome(outcome)
        );
      case "RESOLVE_ISSUE":
        return (
          outcome.pieceId !== null &&
          outcome.proposalId === null &&
          ((outcome.issueState === "SALES_CONTACT" && isHeldOutcome(outcome)) ||
            isResolvedOutcome(outcome))
        );
      case "SUBMIT_CONTACT":
        return (
          outcome.pieceId !== null &&
          outcome.proposalId !== null &&
          outcome.issueState === "REAPPROVAL" &&
          isHeldOutcome(outcome)
        );
      case "REVIEW_CONTACT":
        return (
          outcome.pieceId !== null &&
          outcome.proposalId !== null &&
          ((outcome.issueState === "SALES_CONTACT" && isHeldOutcome(outcome)) ||
            isResolvedOutcome(outcome))
        );
    }
  }, "Command outcome must match its receipt and operation");
export type ApprovalCommandOperation = z.infer<
  typeof approvalCommandOperationSchema
>;
export type ApprovalActor = z.infer<typeof approvalActorSchema>;
export type ApprovalIssueState = z.infer<typeof approvalIssueStateSchema>;
export type ApprovalTarget = z.infer<typeof approvalTargetSchema>;
export type ApprovalCommandReceipt = z.infer<
  typeof approvalCommandReceiptSchema
>;
export type ApprovalCommandOutcome = z.infer<
  typeof approvalCommandOutcomeSchema
>;
export type ApprovalCommandData = z.infer<typeof approvalCommandDataSchema>;
