import { expect, it } from "vitest";
import { salesOrderSummarySchema } from "@template/contracts";
import { orderFixture, catalogFixture, p03Ids } from "@/test/p03-fixtures";
import {
  toSubmittedPaper,
  toAuthoritativePaperState,
  toSalesOrderListRow,
  toSalesOrderStatusLabel,
} from "./order-view.model";

it.each(["1800.00", "1500.00", "650.00"])(
  "maps exact frozen %s and real metadata without prototype facts",
  (price) => {
    const original = orderFixture(),
      order = {
        ...original,
        money: {
          total: price,
          paidAmount: "700.00",
          remainingDue:
            price === "650.00"
              ? "0.00"
              : price === "1500.00"
                ? "800.00"
                : "1100.00",
          surplus: price === "650.00" ? "50.00" : "0.00",
        },
        pieces: original.pieces.map((piece) => ({
          ...piece,
          unitPrice: price,
        })),
      };
    const paper = toSubmittedPaper(order),
      state = toAuthoritativePaperState(order, catalogFixture());
    expect(paper).toMatchObject({
      id: p03Ids.order,
      customer: "Frozen contact",
      phone: "+966501234567",
      address: "Frozen address",
      salesperson: "Sales",
      created: order.createdAt,
      segments: [],
      total: price,
      paid: "700.00",
      balance: order.money.remainingDue,
    });
    expect(paper.items[0]).toMatchObject({
      id: p03Ids.piece,
      unitPrice: price,
      rowTotal: price,
      quantity: 1,
    });
    expect(paper).not.toHaveProperty("reviewer");
    expect(paper).not.toHaveProperty("hijriDate");
    expect(state.finance).toEqual({
      kind: "submitted",
      piecePrices: { [p03Ids.piece]: price },
      money: order.money,
    });
    const row = toSalesOrderListRow({
      kind: "submitted",
      order: salesOrderSummarySchema
        .strip()
        .parse({ ...order, returnInfo: null }),
    });
    expect(row).toMatchObject({
      reference: order.businessNumber,
      id: order.id,
      pieceCount: 1,
      money: order.money,
    });
    expect(toSalesOrderStatusLabel("APPROVED")).toBe("قيد التصنيع");
  },
);
it("keeps frozen money and captured references when current catalog is missing", () => {
  const order = orderFixture(),
    state = toAuthoritativePaperState(order, null);
  expect(state.catalogSourceId).toBeNull();
  expect(state.selectionsByPiece[p03Ids.piece]).toEqual(
    order.pieces[0]?.catalogSelections,
  );
  expect(state.finance.kind).toBe("submitted");
  expect(
    Object.values(state.catalogOptions).every(
      (entries) => entries.length === 0,
    ),
  ).toBe(true);
});
