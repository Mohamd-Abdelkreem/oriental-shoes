import { z } from "zod";
import {
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  salesUuidSchema,
  type WarehouseCommandData,
} from "@template/contracts";
import {
  ApiContractError,
  getApiError,
  type ApiError,
} from "@/services/api/api-client";
import { bindWarehouseCommandResult } from "./warehouse-command-binding.model";

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
      department: z.literal("WAREHOUSE"),
    })
    .strict(),
  body: warehouseCommandBodySchema,
});
export const warehouseCommandSessionSchema = z
  .discriminatedUnion("phase", [
    z.object({ phase: z.literal("idle") }).strict(),
    context.extend({ phase: z.literal("pending") }).strict(),
    context
      .extend({ phase: z.literal("unknown"), failure: failureSchema })
      .strict(),
    context
      .extend({
        phase: z.literal("confirmed"),
        result: warehouseCommandDataSchema,
        syncError: failureSchema.nullable().optional(),
      })
      .strict(),
    context
      .extend({
        phase: z.literal("synchronized"),
        result: warehouseCommandDataSchema,
      })
      .strict(),
  ])
  .refine((entry) => {
    if (!("result" in entry)) return true;
    try {
      bindWarehouseCommandResult(
        entry.result,
        entry.body,
        entry.originScope.actorId,
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof ApiContractError) return false;
      throw error;
    }
  }, "Warehouse command scope, intent and result must agree");
export type WarehouseCommandState = Readonly<
  z.infer<typeof warehouseCommandSessionSchema>
>;
export class WarehouseLocalCommandError extends Error {
  constructor(readonly code: "BUSY" | "MISMATCH" | "INVARIANT") {
    super("راجع نتيجة إجراء المستودع الحالي وحدّث البيانات قبل إجراء جديد.");
    this.name = "WarehouseLocalCommandError";
  }
}
export class WarehouseSynchronizationError extends Error {
  constructor(
    readonly result: WarehouseCommandData,
    readonly syncError: ApiError | null,
  ) {
    super(
      "تم حفظ إجراء المستودع، لكن تعذر تحديث العرض. حدّث البيانات دون إعادة إرسال الإجراء.",
    );
    this.name = "WarehouseSynchronizationError";
  }
}
export const isUnknownWarehouseWrite = (error: unknown): boolean => {
  if (
    error instanceof WarehouseLocalCommandError ||
    error instanceof WarehouseSynchronizationError ||
    error instanceof z.ZodError
  )
    return false;
  if (error instanceof ApiContractError) return true;
  const { statusCode, code } = getApiError(error);
  return (
    statusCode === 0 ||
    statusCode >= 500 ||
    code === "WAREHOUSE_TRANSACTION_CONFLICT"
  );
};
