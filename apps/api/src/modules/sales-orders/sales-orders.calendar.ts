import { parseOrderBusinessTimeZone } from "../../core/config/order.config.js";
import { OrderCalendarUnavailableError } from "./sales-orders.errors.js";

export const getOrderBusinessYear = (
  instant: Date,
  timeZone: string | null,
): number => {
  const validZone = parseOrderBusinessTimeZone(timeZone ?? undefined);
  if (validZone === null || !Number.isFinite(instant.getTime()))
    throw new OrderCalendarUnavailableError();
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: validZone,
    year: "numeric",
    era: "short",
  }).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    parts.find((part) => part.type === "era")?.value !== "AD"
  )
    throw new OrderCalendarUnavailableError();
  return year;
};
