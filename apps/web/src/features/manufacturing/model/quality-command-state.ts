import { z } from "zod";
import {
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  salesUuidSchema,
  type QualityCommandData,
} from "@template/contracts";
import {
  ApiContractError,
  getApiError,
  type ApiError,
} from "@/services/api/api-client";
import { bindQualityCommandResult } from "./quality-command-binding.model";

const failureSchema = z
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
const context = z.object({
  originScope: z
    .object({
      actorId: salesUuidSchema,
      accessVersion: z.number().int().nonnegative(),
      epoch: z.number().int().nonnegative(),
      department: z.literal("QUALITY"),
    })
    .strict(),
  body: qualityCommandBodySchema,
});
export const qualityCommandSessionSchema = z
  .discriminatedUnion("phase", [
    z.object({ phase: z.literal("idle") }).strict(),
    context.extend({ phase: z.literal("pending") }).strict(),
    context
      .extend({ phase: z.literal("unknown"), failure: failureSchema })
      .strict(),
    context
      .extend({
        phase: z.literal("confirmed"),
        result: qualityCommandDataSchema,
        syncError: failureSchema.nullable().optional(),
      })
      .strict(),
    context
      .extend({
        phase: z.literal("synchronized"),
        result: qualityCommandDataSchema,
      })
      .strict(),
  ])
  .refine((entry) => {
    if (!("result" in entry)) return true;
    try {
      bindQualityCommandResult(
        entry.result,
        entry.body,
        entry.originScope.actorId,
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof ApiContractError) return false;
      throw error;
    }
  }, "Quality command scope, intent and result must agree");
export type QualityCommandState = Readonly<
  z.infer<typeof qualityCommandSessionSchema>
>;
export class QualityLocalCommandError extends Error {
  constructor(readonly code: "BUSY" | "MISMATCH" | "INVARIANT") {
    super("راجع نتيجة إجراء الجودة الحالي وحدّث البيانات قبل إجراء جديد.");
    this.name = "QualityLocalCommandError";
  }
}
export class QualitySynchronizationError extends Error {
  constructor(
    readonly result: QualityCommandData,
    readonly syncError: ApiError | null,
  ) {
    super(
      "تم حفظ إجراء الجودة، لكن تعذر تحديث العرض. حدّث البيانات دون إعادة إرسال الإجراء.",
    );
    this.name = "QualitySynchronizationError";
  }
}
export const isUnknownQualityWrite = (error: unknown): boolean => {
  if (
    error instanceof QualityLocalCommandError ||
    error instanceof QualitySynchronizationError ||
    error instanceof z.ZodError
  )
    return false;
  if (error instanceof ApiContractError) return true;
  const { statusCode, code } = getApiError(error);
  return (
    statusCode === 0 ||
    statusCode >= 500 ||
    code === "QUALITY_TRANSACTION_CONFLICT"
  );
};
