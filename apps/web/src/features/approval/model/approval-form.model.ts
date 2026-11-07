import {
  returnInitialBodySchema,
  resolveIssueBodySchema,
  reviewContactBodySchema,
  approvalTargetSchema,
  type ResolveIssueBody,
  type ReviewContactBody,
  type ReturnInitialBody,
} from "@template/contracts";
import { z } from "zod";

export type ApprovalFormBase = Readonly<{
  commandId: string;
  expectedVersion: number;
}>;
export const returnInitialFormSchema = returnInitialBodySchema.omit({
  commandId: true,
  expectedVersion: true,
});
export type ReturnInitialFormValues = z.infer<typeof returnInitialFormSchema>;
export const toReturnInitialBody = (
  values: ReturnInitialFormValues,
  base: ApprovalFormBase,
): ReturnInitialBody =>
  returnInitialBodySchema.parse({
    ...base,
    reason: values.reason,
    notes: values.notes,
  });

const requiredDecisionText = returnInitialBodySchema.shape.reason;
const validateText = (
  text: string,
  field: "notes" | "reason",
  context: z.RefinementCtx,
) => {
  const parsed = requiredDecisionText.safeParse(text);
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      context.addIssue({
        code: "custom",
        path: [field],
        message: issue.message,
      });
};
export const issueDecisionFormSchema = z
  .object({
    decision: z.enum(["RETURN_TO_DEPARTMENT", "SEND_TO_SALES", "CANCEL"]),
    target: approvalTargetSchema.nullable(),
    notes: z.string(),
    reason: z.string(),
    confirmed: z.boolean(),
  })
  .strict()
  .superRefine((values, context) => {
    validateText(
      values.decision === "CANCEL" ? values.reason : values.notes,
      values.decision === "CANCEL" ? "reason" : "notes",
      context,
    );
    if (values.decision !== "CANCEL" && values.target === null)
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "Choose the resumption department.",
      });
    if (values.decision === "CANCEL" && !values.confirmed)
      context.addIssue({
        code: "custom",
        path: ["confirmed"],
        message: "Confirm the retained cancellation.",
      });
  });
export type IssueDecisionFormValues = z.infer<typeof issueDecisionFormSchema>;
export const toResolveIssueBody = (
  values: IssueDecisionFormValues,
  base: ApprovalFormBase,
): ResolveIssueBody =>
  resolveIssueBodySchema.parse(
    values.decision === "CANCEL"
      ? {
          ...base,
          decision: values.decision,
          reason: values.reason,
          confirmed: values.confirmed,
        }
      : {
          ...base,
          decision: values.decision,
          target: values.target,
          notes: values.notes,
        },
  );
export const contactReviewFormSchema = z
  .object({
    decision: z.enum(["ACCEPT", "RETURN_TO_SALES", "CANCEL"]),
    notes: z.string(),
    reason: z.string(),
    confirmed: z.boolean(),
  })
  .strict()
  .superRefine((values, context) => {
    validateText(
      values.decision === "ACCEPT" ? values.notes : values.reason,
      values.decision === "ACCEPT" ? "notes" : "reason",
      context,
    );
    if (values.decision === "CANCEL" && !values.confirmed)
      context.addIssue({
        code: "custom",
        path: ["confirmed"],
        message: "Confirm the retained cancellation.",
      });
  });
export type ContactReviewFormValues = z.infer<typeof contactReviewFormSchema>;
export const toReviewContactBody = (
  values: ContactReviewFormValues,
  base: ApprovalFormBase,
  proposalId: string,
): ReviewContactBody =>
  reviewContactBodySchema.parse(
    values.decision === "ACCEPT"
      ? { ...base, proposalId, decision: values.decision, notes: values.notes }
      : values.decision === "CANCEL"
        ? {
            ...base,
            proposalId,
            decision: values.decision,
            reason: values.reason,
            confirmed: values.confirmed,
          }
        : {
            ...base,
            proposalId,
            decision: values.decision,
            reason: values.reason,
          },
  );
