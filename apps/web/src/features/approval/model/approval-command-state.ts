import { z } from "zod";
import {
  accessVersionSchema,
  approvalCommandDataSchema,
  approveInitialBodySchema,
  returnInitialBodySchema,
  resolveIssueBodySchema,
  submitContactBodySchema,
  reviewContactBodySchema,
  salesUuidSchema,
  type ApprovalCommandData,
} from "@template/contracts";
import {
  ApiContractError,
  getApiError,
  type ApiError,
} from "@/services/api/api-client";
import type { P04OperationalScope } from "@/shared/query/operational-scope";

const order = { orderId: salesUuidSchema };
const child = { ...order, pieceId: salesUuidSchema, issueId: salesUuidSchema };
export const approvalCommandIntentSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("APPROVE_INITIAL"),
      ...order,
      body: approveInitialBodySchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("RETURN_INITIAL"),
      ...order,
      body: returnInitialBodySchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("RESOLVE_ISSUE"),
      ...child,
      body: resolveIssueBodySchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("SUBMIT_CONTACT"),
      ...child,
      body: submitContactBodySchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("REVIEW_CONTACT"),
      ...child,
      body: reviewContactBodySchema,
    })
    .strict(),
]);
export type ApprovalCommandIntent = Readonly<
  z.infer<typeof approvalCommandIntentSchema>
>;
export type ApprovalCommandCapability = "APPROVAL" | "SALES_CONTACT";
export type ApprovalCommandScope = P04OperationalScope &
  Readonly<{ capability: ApprovalCommandCapability }>;
export type ApprovalCommandVariables = Readonly<{
  scope: ApprovalCommandScope;
  command: ApprovalCommandIntent;
}>;
export const approvalCommandCapability = (
  operation: string,
): ApprovalCommandCapability | null =>
  operation === "SUBMIT_CONTACT"
    ? "SALES_CONTACT"
    : [
          "APPROVE_INITIAL",
          "RETURN_INITIAL",
          "RESOLVE_ISSUE",
          "REVIEW_CONTACT",
        ].includes(operation)
      ? "APPROVAL"
      : null;
type Frozen = Readonly<{
  originScope: ApprovalCommandScope;
  command: ApprovalCommandIntent;
}>;
export type ApprovalCommandState =
  | Readonly<{ phase: "idle" }>
  | (Frozen & Readonly<{ phase: "pending" }>)
  | (Frozen & Readonly<{ phase: "unknown"; failure: ApiError }>)
  | (Frozen &
      Readonly<{
        phase: "confirmed";
        result: ApprovalCommandData;
        syncError?: ApiError | null | undefined;
      }>)
  | (Frozen & Readonly<{ phase: "synchronized"; result: ApprovalCommandData }>);
export class ApprovalLocalCommandError extends Error {
  constructor(readonly code: "BUSY" | "MISMATCH" | "INVARIANT") {
    super(
      code === "BUSY"
        ? "Resolve this order's existing operation first."
        : "The operation context is inconsistent. Refresh and review it.",
    );
    this.name = "ApprovalLocalCommandError";
  }
}
export class ApprovalSynchronizationError extends Error {
  constructor(
    readonly result: ApprovalCommandData,
    readonly syncError: ApiError | null,
  ) {
    super(
      "The operation was saved, but the current view could not be refreshed.",
    );
    this.name = "ApprovalSynchronizationError";
  }
}
export const isUnknownApprovalWrite = (error: unknown): boolean => {
  if (
    error instanceof ApprovalLocalCommandError ||
    error instanceof ApprovalSynchronizationError
  )
    return false;
  if (error instanceof ApiContractError) return true;
  const { statusCode, code } = getApiError(error);
  if (statusCode === 503 && code === "ORDER_CATALOG_UNAVAILABLE") return false;
  return (
    statusCode === 0 ||
    (statusCode >= 500 && statusCode <= 504) ||
    code === "APPROVAL_TRANSACTION_CONFLICT"
  );
};

const frozenContextSchema = z.object({
  originScope: z
    .object({
      capability: z.enum(["APPROVAL", "SALES_CONTACT"]),
      actorId: salesUuidSchema,
      accessVersion: accessVersionSchema,
      epoch: z.number().int().nonnegative(),
    })
    .strict(),
  command: approvalCommandIntentSchema,
});
const safeFailureSchema = z.object({
  message: z.string(),
  statusCode: z.number(),
  code: z.string(),
  requestId: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())),
});
export const approvalCommandSessionSchema = z.discriminatedUnion("phase", [
  frozenContextSchema.extend({ phase: z.literal("pending") }),
  frozenContextSchema.extend({
    phase: z.literal("unknown"),
    failure: safeFailureSchema,
  }),
  frozenContextSchema.extend({
    phase: z.literal("confirmed"),
    result: approvalCommandDataSchema,
    syncError: safeFailureSchema.nullable().optional(),
  }),
  frozenContextSchema.extend({
    phase: z.literal("synchronized"),
    result: approvalCommandDataSchema,
  }),
]);
