import { expect, it } from "vitest";
import { makePiece } from "@/features/prototype/state/fixture-builders";
import { calculateOrderTotals } from "./order-totals";

it("recalculates the saved balance after a priced piece is removed", () => {
  const firstPiece = makePiece("first", 0, "Classic", { unitPrice: "120" });
  const secondPiece = makePiece("second", 1, "Royal", { unitPrice: "80" });

  expect(calculateOrderTotals([firstPiece, secondPiece], "50")).toEqual({
    total: "200",
    paid: "50",
    balance: "150",
  });
  expect(calculateOrderTotals([firstPiece], "50")).toEqual({
    total: "120",
    paid: "50",
    balance: "70",
  });
});
