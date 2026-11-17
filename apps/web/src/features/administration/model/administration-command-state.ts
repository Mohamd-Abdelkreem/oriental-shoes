import { z } from "zod";
import {
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  errorEnvelopeSchema,
  fieldErrorSchema,
  salesUuidSchema,
  type AdministrationCommandData,
} from "@template/contracts";
import {
  ApiContractError,
  getApiError,
  type ApiError,
} from "@/services/api/api-client";
import { bindAdministrationCommandResult } from "./administration-command-binding.model";

const failureSchema = z
  .object({
    message: errorEnvelopeSchema.shape.message,
    statusCode: z.number().int().min(0).max(599),
    code: errorEnvelopeSchema.shape.code,
    requestId: z.string().max(128),
    fieldErrors: z
      .record(
        fieldErrorSchema.shape.field,
        z.array(fieldErrorSchema.shape.message).readonly(),
      )
      .readonly(),
  })
  .strict();
const context = z.object({
  originScope: z
    .object({
      actorId: salesUuidSchema,
      accessVersion: z.number().int().nonnegative(),
      epoch: z.number().int().nonnegative(),
      capability: z.literal("ADMINISTRATION"),
    })
    .strict(),
  body: administrationCommandBodySchema,
});
const freezeValues = (value: unknown): void => {
  if (value === null || typeof value !== "object") return;
  const children: unknown[] = Object.values(value);
  for (const child of children) freezeValues(child);
  Object.freeze(value);
};
export const administrationCommandSessionSchema = z
  .discriminatedUnion("phase", [
    z.object({ phase: z.literal("idle") }).strict(),
    context.extend({ phase: z.literal("pending") }).strict(),
    context
      .extend({ phase: z.literal("unknown"), failure: failureSchema })
      .strict(),
    context
      .extend({
        phase: z.literal("confirmed"),
        result: administrationCommandDataSchema,
        syncError: failureSchema.nullable().optional(),
      })
      .strict(),
    context
      .extend({
        phase: z.literal("synchronized"),
        result: administrationCommandDataSchema,
      })
      .strict(),
  ])
  .refine((entry) => {
    if (!("result" in entry)) return true;
    try {
      bindAdministrationCommandResult(
        entry.result,
        entry.body,
        entry.originScope.actorId,
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof ApiContractError) return false;
      throw error;
    }
  }, "Administration scope, intent and retained result must agree")
  .transform((entry) => {
    freezeValues(entry);
    return entry;
  });
export type AdministrationCommandState = Readonly<
  z.infer<typeof administrationCommandSessionSchema>
>;
export class AdministrationLocalCommandError extends Error {
  constructor(readonly code: "BUSY" | "MISMATCH" | "INVARIANT") {
    super("راجع نتيجة الإجراء الإداري الحالي وحدّث البيانات قبل إجراء جديد.");
    this.name = "AdministrationLocalCommandError";
  }
}
export class AdministrationSynchronizationError extends Error {
  constructor(
    readonly result: AdministrationCommandData,
    readonly syncError: ApiError | null,
  ) {
    super(
      "تم حفظ الإجراء الإداري، لكن تعذر تحديث العرض. حدّث البيانات دون إعادة إرسال الإجراء.",
    );
    this.name = "AdministrationSynchronizationError";
  }
}
export const isUnknownAdministrationWrite = (error: unknown): boolean => {
  if (
    error instanceof AdministrationLocalCommandError ||
    error instanceof AdministrationSynchronizationError ||
    error instanceof z.ZodError
  )
    return false;
  if (error instanceof ApiContractError) return true;
  const { statusCode, code } = getApiError(error);
  return (
    statusCode === 0 ||
    statusCode >= 500 ||
    code === "ADMINISTRATION_TRANSACTION_CONFLICT"
  );
};
