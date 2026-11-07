import { z } from "zod";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import { salesBusinessNumberSchema } from "../sales-orders/sales-order-values.schema.ts";
import {
  approvalActorSchema,
  approvalCommandOperationSchema,
  isApprovalOperationActor,
} from "./approval-command.schema.ts";

const decisionSchema = z.enum([
  "RETURN_TO_DEPARTMENT",
  "SEND_TO_SALES",
  "CANCEL",
  "ACCEPT",
  "RETURN_TO_SALES",
]);
const changedFieldSchema = z.enum([
  "approval",
  "status",
  "pieceState",
  "issue",
  "proposal",
  "model",
  "size",
  "leatherBase",
  "sole",
  "cancellation",
  "total",
]);
export const approvalActivityEventSchema = z
  .object({
    id: salesUuidSchema,
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    businessNumber: salesBusinessNumberSchema,
    operation: approvalCommandOperationSchema,
    actor: approvalActorSchema,
    occurredAt: salesInstantSchema,
    pieceId: salesUuidSchema.nullable(),
    issueId: salesUuidSchema.nullable(),
    proposalId: salesUuidSchema.nullable(),
    decision: decisionSchema.nullable(),
    notes: nonEmptyBoundedString(4000).nullable(),
    changedFields: z
      .array(changedFieldSchema)
      .max(changedFieldSchema.options.length),
  })
  .strict()
  .superRefine((event, context) => {
    if (!isApprovalOperationActor(event.operation, event.actor))
      context.addIssue({
        code: "custom",
        path: ["actor"],
        message: "Actor must match the operation",
      });
    if (new Set(event.changedFields).size !== event.changedFields.length)
      context.addIssue({
        code: "custom",
        path: ["changedFields"],
        message: "Changed fields must be unique",
      });
    const initial =
      event.operation === "APPROVE_INITIAL" ||
      event.operation === "RETURN_INITIAL";
    const contact =
      event.operation === "SUBMIT_CONTACT" ||
      event.operation === "REVIEW_CONTACT";
    if (
      initial
        ? event.pieceId !== null ||
          event.issueId !== null ||
          event.proposalId !== null
        : event.pieceId === null ||
          event.issueId === null ||
          (contact ? event.proposalId === null : event.proposalId !== null)
    )
      context.addIssue({
        code: "custom",
        path: ["pieceId"],
        message: "Event targets must match the operation",
      });
    const decisionAllowed =
      event.operation === "RESOLVE_ISSUE"
        ? event.decision === "RETURN_TO_DEPARTMENT" ||
          event.decision === "SEND_TO_SALES" ||
          event.decision === "CANCEL"
        : event.operation === "REVIEW_CONTACT"
          ? event.decision === "ACCEPT" ||
            event.decision === "RETURN_TO_SALES" ||
            event.decision === "CANCEL"
          : event.decision === null;
    if (!decisionAllowed)
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "Decision must match the operation",
      });
  });
export type ApprovalActivityEvent = z.infer<typeof approvalActivityEventSchema>;
export type ApprovalDecision = z.infer<typeof decisionSchema>;
export type ApprovalChangedField = z.infer<typeof changedFieldSchema>;
