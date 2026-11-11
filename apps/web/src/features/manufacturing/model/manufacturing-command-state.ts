import { z } from "zod";
import {
  manufacturingDepartmentSchema,
  manufacturingCommandBodySchema,
  manufacturingCommandDataSchema,
  reportIssueBodySchema,
  approvalCommandDataSchema,
  salesUuidSchema,
} from "@template/contracts";
import {
  ApiContractError,
  getApiError,
  type ApiError,
} from "@/services/api/api-client";

export const manufacturingCommandIntentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("work"),
      department: manufacturingDepartmentSchema,
      body: manufacturingCommandBodySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("report"),
      department: manufacturingDepartmentSchema,
      orderId: salesUuidSchema,
      pieceId: salesUuidSchema,
      body: reportIssueBodySchema,
    })
    .strict(),
]);
export type ManufacturingCommandIntent = Readonly<
  z.infer<typeof manufacturingCommandIntentSchema>
>;
const resultSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("work"), data: manufacturingCommandDataSchema })
    .strict(),
  z
    .object({ kind: z.literal("report"), data: approvalCommandDataSchema })
    .strict(),
]);
export type ManufacturingCommandResult = Readonly<z.infer<typeof resultSchema>>;
const context = z.object({
  originScope: z
    .object({
      actorId: salesUuidSchema,
      accessVersion: z.number().int().positive(),
      epoch: z.number().int().nonnegative(),
      department: manufacturingDepartmentSchema,
    })
    .strict(),
  intent: manufacturingCommandIntentSchema,
});
const failure = z
  .object({
    message: z.string(),
    statusCode: z.number(),
    code: z.string(),
    requestId: z.string(),
    fieldErrors: z
      .record(z.string(), z.array(z.string()).readonly())
      .readonly(),
  })
  .strict();
export const manufacturingCommandSessionSchema = z
  .discriminatedUnion("phase", [
    z.object({ phase: z.literal("idle") }).strict(),
    context.extend({ phase: z.literal("pending") }).strict(),
    context.extend({ phase: z.literal("unknown"), failure }).strict(),
    context
      .extend({
        phase: z.literal("confirmed"),
        result: resultSchema,
        syncError: failure.nullable().optional(),
      })
      .strict(),
    context
      .extend({ phase: z.literal("synchronized"), result: resultSchema })
      .strict(),
  ])
  .refine(
    (entry) =>
      entry.phase === "idle" ||
      (entry.originScope.department === entry.intent.department &&
        (!("result" in entry) ||
          (entry.result.kind === entry.intent.kind &&
            (entry.result.kind === "work"
              ? entry.result.data.receipt.department ===
                entry.originScope.department
              : entry.result.data.receipt.operation === "REPORT_ISSUE")))),
    "Command context and result must agree",
  );
export type ManufacturingCommandState = Readonly<
  z.infer<typeof manufacturingCommandSessionSchema>
>;
export class ManufacturingLocalCommandError extends Error {
  constructor(readonly code: "BUSY" | "MISMATCH" | "INVARIANT") {
    super("راجع نتيجة الإجراء الحالي وحدّث البيانات قبل إجراء جديد.");
    this.name = "ManufacturingLocalCommandError";
  }
}
export class ManufacturingSynchronizationError extends Error {
  constructor(
    readonly result: ManufacturingCommandResult,
    readonly syncError: ApiError | null,
  ) {
    super(
      "تم حفظ الإجراء، لكن تعذر تحديث العرض. أعد تحديث البيانات دون إعادة إرسال الإجراء.",
    );
    this.name = "ManufacturingSynchronizationError";
  }
}
export const isUnknownManufacturingWrite = (error: unknown): boolean => {
  if (
    error instanceof ManufacturingLocalCommandError ||
    error instanceof ManufacturingSynchronizationError ||
    error instanceof z.ZodError
  )
    return false;
  if (error instanceof ApiContractError) return true;
  const { statusCode, code } = getApiError(error);
  return (
    statusCode === 0 ||
    statusCode >= 500 ||
    code === "MANUFACTURING_TRANSACTION_CONFLICT" ||
    code === "APPROVAL_TRANSACTION_CONFLICT"
  );
};
