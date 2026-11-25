import {
  warehouseDeliveredAtSchema,
  warehouseRetryDateSchema,
} from "@template/contracts";
import { z } from "zod";

const localDeliveryMinuteSchema = z.iso
  .datetime({ local: true, precision: -1 })
  .refine((value) => !value.endsWith("Z"))
  .transform((value, context) => {
    const instant = new Date(value);
    const [year, month, day, hour, minute] = value.split(/[-T:]/u).map(Number);
    if (
      instant.getFullYear() !== year ||
      instant.getMonth() + 1 !== month ||
      instant.getDate() !== day ||
      instant.getHours() !== hour ||
      instant.getMinutes() !== minute
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid local date and time",
      });
      return z.NEVER;
    }
    return instant.toISOString();
  });

export const toWarehouseDeliveredAt = (input: string): string | null => {
  const value = input.trim();
  return value === ""
    ? null
    : warehouseDeliveredAtSchema.parse(localDeliveryMinuteSchema.parse(value));
};

export const toWarehouseRetryDate = (input: string): string | null =>
  warehouseRetryDateSchema.parse(input);
