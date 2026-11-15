import {
  warehouseDeliveredAtSchema,
  warehouseRetryDateSchema,
} from "@template/contracts";

export const toWarehouseDeliveredAt = (input: string): string | null => {
  const text = input.trim();
  const instant = text.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/u,
    "$1T$2:00$3",
  );
  return warehouseDeliveredAtSchema.parse(instant);
};
export const toWarehouseRetryDate = (input: string): string | null =>
  warehouseRetryDateSchema.parse(input);
