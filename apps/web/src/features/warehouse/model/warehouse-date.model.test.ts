import { expect, it } from "vitest";
import {
  toWarehouseDeliveredAt,
  toWarehouseRetryDate,
} from "./warehouse-date.model";

it("normalizes the chosen device-local delivery time to an instant", () => {
  expect(toWarehouseDeliveredAt("2026-11-13T14:30")).toBe(
    new Date(2026, 10, 13, 14, 30).toISOString(),
  );
});
it.each([
  "2026-02-30T14:30",
  "2026-11-13T25:30",
  "2026-11-13",
  "2026-11-13T14:30Z",
  "2026-11-13T14:30+02:00",
])("rejects invalid local delivery time %s", (text) => {
  expect(() => toWarehouseDeliveredAt(text)).toThrow();
});
it("keeps absent actual/retry dates unrecorded and preserves an exact valid calendar date", () => {
  expect(toWarehouseDeliveredAt(" ")).toBeNull();
  expect(toWarehouseRetryDate(" ")).toBeNull();
  expect(toWarehouseRetryDate("2026-11-15")).toBe("2026-11-15");
  expect(toWarehouseRetryDate("2024-02-29")).toBe("2024-02-29");
  expect(() => toWarehouseRetryDate("2026-02-30")).toThrow();
});
