import { expect, it } from "vitest";
import {
  toWarehouseDeliveredAt,
  toWarehouseRetryDate,
} from "./warehouse-date.model";

it.each(["2026-11-13 14:30 +02:00", "2026-11-13T14:30:00+02:00"])(
  "normalizes explicit actual delivery instant %s without an inferred timezone",
  (text) => {
    expect(toWarehouseDeliveredAt(text)).toBe("2026-11-13T12:30:00.000Z");
  },
);
it.each([
  "2026-02-30 14:30 +02:00",
  "2026-11-13 14:30",
  "2026-11-13T14:30:00",
  "2026-11-13 25:30 +02:00",
])("rejects ambiguous or impossible actual delivery time %s", (text) => {
  expect(() => toWarehouseDeliveredAt(text)).toThrow();
});
it("keeps absent actual/retry dates unrecorded and preserves an exact valid calendar date", () => {
  expect(toWarehouseDeliveredAt(" ")).toBeNull();
  expect(toWarehouseRetryDate(" ")).toBeNull();
  expect(toWarehouseRetryDate("2026-11-15")).toBe("2026-11-15");
  expect(toWarehouseRetryDate("2024-02-29")).toBe("2024-02-29");
  expect(() => toWarehouseRetryDate("2026-02-30")).toThrow();
});
