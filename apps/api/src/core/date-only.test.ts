import { describe, expect, it } from "vitest";

import {
  isDateOnlyString,
  parseDateOnly,
  serializeDateOnly,
  serializeNullableDateOnly,
} from "./date-only.js";

describe("date-only values", () => {
  it.each([
    "0001-01-01",
    "0099-12-31",
    "0100-01-01",
    "2024-02-29",
    "9999-12-31",
  ])("round trips %s without the Date.UTC low-year coercion", (value) => {
    expect(serializeDateOnly(parseDateOnly(value))).toBe(value);
  });
  it.each(["0000-01-01", "2026-02-30", "10000-01-01"])(
    "rejects out-of-range calendar value %s",
    (value) => {
      expect(isDateOnlyString(value)).toBe(false);
      expect(() => parseDateOnly(value)).toThrow();
    },
  );
  it("validates real YYYY-MM-DD calendar dates", () => {
    expect(isDateOnlyString("2024-02-29")).toBe(true);
    expect(isDateOnlyString("2026-02-29")).toBe(false);
    expect(isDateOnlyString("2026-2-09")).toBe(false);
  });
  it("round-trips in UTC without timezone shifts", () => {
    const date = parseDateOnly("2026-08-18");
    expect(serializeDateOnly(date)).toBe("2026-08-18");
    expect(serializeNullableDateOnly(date)).toBe("2026-08-18");
    expect(serializeNullableDateOnly(null)).toBeNull();
  });
  it("rejects impossible dates and invalid Date values", () => {
    expect(() => parseDateOnly("2026-02-30")).toThrow();
    expect(() => serializeDateOnly(new Date(Number.NaN))).toThrow();
  });
});
