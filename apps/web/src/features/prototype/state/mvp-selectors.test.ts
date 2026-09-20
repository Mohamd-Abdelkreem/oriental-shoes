import { expect, it } from "vitest";
import { makePiece } from "./fixture-builders";
import { getCustomerSizeProfile } from "./mvp-selectors";
import type { MvpOrder } from "./mvp-types";

it("shows the newest order's single size even when history is out of order", () => {
  const baseOrder: MvpOrder = {
    id: "ORDER-1",
    type: "SHOP",
    customer: "Test Customer",
    phone: "0500000000",
    address: "",
    salesperson: "Sales",
    created: "1 September 2026",
    delivery: "1 October 2026",
    status: "تم الاستلام",
    cancelled: 0,
    warehouse: 0,
    items: [],
    segments: [],
  };
  const newestOrder: MvpOrder = {
    ...baseOrder,
    id: "ORDER-2",
    createdIso: "2026-09-20",
    items: [
      makePiece("new-1", 0, "Classic", { size: "٤٢" }),
      makePiece("new-2", 1, "Royal", { size: "٤٣" }),
    ],
  };
  const olderOrder: MvpOrder = {
    ...baseOrder,
    createdIso: "2026-09-01",
    items: [makePiece("old-1", 0, "Classic", { size: "٤٠" })],
  };

  const profile = getCustomerSizeProfile(baseOrder.phone, [
    newestOrder,
    olderOrder,
  ]);

  expect(profile.latestSize).toBe("٤٢");
  expect(profile.history[0]?.size).toBe("٤٢، ٤٣");
});
