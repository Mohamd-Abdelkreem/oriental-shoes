import { expect, it } from "vitest";
import { parseOrderBusinessTimeZone } from "../../core/config/order.config.js";
import { getOrderBusinessYear } from "./sales-orders.calendar.js";

it.each([undefined, "", " ", "Invalid/BusinessZone"])(
  "keeps absent/invalid configured calendar %j unavailable",
  (timeZone) => {
    expect(parseOrderBusinessTimeZone(timeZone)).toBeNull();
    expect(() =>
      getOrderBusinessYear(new Date("2026-11-06T00:00:00Z"), timeZone ?? null),
    ).toThrow(expect.objectContaining({ code: "ORDER_CALENDAR_UNAVAILABLE" }));
  },
);
it("derives Gregorian years from the explicitly supplied zone at the year boundary", () => {
  const instant = new Date("2026-12-31T23:30:00Z");
  expect(getOrderBusinessYear(instant, "UTC")).toBe(2026);
  expect(getOrderBusinessYear(instant, "Asia/Riyadh")).toBe(2027);
  expect(parseOrderBusinessTimeZone(" UTC ")).toBe("UTC");
});
it("rejects invalid instants and years outside the accepted Gregorian range", () => {
  for (const instant of [
    new Date("invalid"),
    new Date("0000-01-01T00:00:00Z"),
    new Date("+010000-01-01T00:00:00Z"),
  ])
    expect(() => getOrderBusinessYear(instant, "UTC")).toThrow(
      expect.objectContaining({ code: "ORDER_CALENDAR_UNAVAILABLE" }),
    );
});
