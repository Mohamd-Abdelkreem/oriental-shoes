import { expect, it } from "vitest";
import {
  calculateOrderMoney,
  deriveOrderCounts,
  formatBusinessNumber,
  formatMoneyCents,
  MAX_ORDER_SEQUENCE,
  MAX_ORDER_TOTAL_CENTS,
  MAX_ORDER_UNIT_CENTS,
  parseMoneyCents,
} from "./sales-orders.rules.js";

it("calculates exact sums, cumulative paid and surplus without binary floating point or rounding", () => {
  expect(
    calculateOrderMoney([parseMoneyCents("0.10"), parseMoneyCents("0.20")], 0n),
  ).toEqual({
    total: "0.30",
    paidAmount: "0.00",
    remainingDue: "0.30",
    surplus: "0.00",
  });
  expect(calculateOrderMoney([65000n], 70000n)).toEqual({
    total: "650.00",
    paidAmount: "700.00",
    remainingDue: "0.00",
    surplus: "50.00",
  });
  expect(calculateOrderMoney([], 70000n)).toEqual({
    total: "0.00",
    paidAmount: "700.00",
    remainingDue: "0.00",
    surplus: "700.00",
  });
  expect(calculateOrderMoney([180000n, 150000n], 10050n).remainingDue).toBe(
    "3199.50",
  );
  expect(
    calculateOrderMoney(Array<bigint>(200).fill(MAX_ORDER_UNIT_CENTS), 0n)
      .total,
  ).toBe("199999999998.00");
});
it.each([
  "-1",
  "1.001",
  "1.000",
  "1e2",
  "NaN",
  "Infinity",
  "1000000000",
  "001.50",
])("rejects invalid exact unit amount %s", (amount) => {
  expect(() => parseMoneyCents(amount)).toThrow();
});
it("retains representation bounds while formatting exactly two decimal places", () => {
  expect(parseMoneyCents("999999999.99")).toBe(MAX_ORDER_UNIT_CENTS);
  expect(formatMoneyCents(MAX_ORDER_TOTAL_CENTS)).toBe("199999999998.00");
  expect(() => formatMoneyCents(MAX_ORDER_TOTAL_CENTS + 1n)).toThrow();
  expect(() => formatMoneyCents(-1n)).toThrow();
  expect(() => calculateOrderMoney([MAX_ORDER_UNIT_CENTS + 1n], 0n)).toThrow();
  expect(() => calculateOrderMoney([1n], MAX_ORDER_UNIT_CENTS + 1n)).toThrow();
});
it("keeps global sequence digits intact across type/year boundaries and rejects exhaustion", () => {
  expect(formatBusinessNumber("SHOP", 2026, 1n)).toBe("SHOP-2026-0001");
  expect(formatBusinessNumber("EXTERNAL", 2026, 2n)).toBe("EXTERNAL-2026-0002");
  expect(formatBusinessNumber("SHOP", 2027, 3n)).toBe("SHOP-2027-0003");
  expect(formatBusinessNumber("SHOP", 1, MAX_ORDER_SEQUENCE)).toBe(
    "SHOP-0001-9223372036854775807",
  );
  expect(() =>
    formatBusinessNumber("SHOP", 2026, MAX_ORDER_SEQUENCE + 1n),
  ).toThrow();
  expect(() => formatBusinessNumber("SHOP", 0, 1n)).toThrow();
  expect(() => formatBusinessNumber("SHOP", 2026, 0n)).toThrow();
});
it("uses physical receipt and exact active counts even when the displayed percentage rounds to 100", () => {
  const counts = deriveOrderCounts(
    Array.from({ length: 200 }, (_, index) => ({
      stage: "WAREHOUSE" as const,
      receivedAt: index < 199 ? "2026-11-06T00:00:00Z" : null,
    })),
  );
  expect(counts).toEqual({
    original: 200,
    active: 200,
    cancelled: 0,
    received: 199,
    completionPercent: 100,
  });
  expect(counts.received === counts.active).toBe(false);
  expect(
    deriveOrderCounts([
      { stage: "CANCELLED", receivedAt: "2026-11-06T00:00:00Z" },
    ]),
  ).toEqual({
    original: 1,
    active: 0,
    cancelled: 1,
    received: 0,
    completionPercent: 0,
  });
  expect(
    deriveOrderCounts([{ stage: "QUALITY", receivedAt: null }]).received,
  ).toBe(0);
});
