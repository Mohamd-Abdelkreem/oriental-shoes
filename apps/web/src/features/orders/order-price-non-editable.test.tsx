import assert from "node:assert/strict";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { initialSnapshot } from "@/features/prototype/state/mvp-selectors";
import { OrderPaperForm } from "./components/order-paper-form";

const baseOrder = initialSnapshot().orders[0];
assert.ok(baseOrder);
const firstItem = baseOrder.items[0];
assert.ok(firstItem);

it.each([
  { unitPrice: "350", rowTotal: "350", price: "350", total: "350" },
  { unitPrice: "350", rowTotal: "", price: "350", total: "350" },
  { unitPrice: "350", rowTotal: "0", price: "350", total: "0" },
  { unitPrice: "", rowTotal: "", price: "0", total: "0" },
])(
  "shows read-only price $price and total $total for '$unitPrice'/'$rowTotal'",
  ({ unitPrice, rowTotal, price, total }) => {
    render(
      <OrderPaperForm
        order={{ ...baseOrder, items: [{ ...firstItem, unitPrice, rowTotal }] }}
        mode="create"
      />,
    );

    expect(
      screen.getByLabelText(`سعر ${firstItem.pieceNumber || "القطعة"}`)
        .textContent,
    ).toBe(price);
    expect(
      screen.getByLabelText(`إجمالي ${firstItem.pieceNumber || "القطعة"}`)
        .textContent,
    ).toBe(total);

    const productTable = screen.getByRole("table", {
      name: /جدول منتجات أمر التفصيل/u,
    });
    expect(
      within(productTable).queryByRole("spinbutton"),
    ).not.toBeInTheDocument();
    expect(
      within(productTable).queryByRole("textbox", {
        name: /^السعر|^الإجمالي/u,
      }),
    ).not.toBeInTheDocument();
  },
);

it("retains submitted exact amounts and surplus during permitted nonprice edits", async () => {
  const { orderFixture } = await import("@/test/p03-fixtures"),
    { toSubmittedPaper, toAuthoritativePaperState } =
      await import("@/features/sales/model/order-view.model");
  const original = orderFixture(),
    order = {
      ...original,
      money: {
        total: "650.00",
        paidAmount: "700.00",
        remainingDue: "0.00",
        surplus: "50.00",
      },
      pieces: original.pieces.map((piece) => ({
        ...piece,
        unitPrice: "650.00",
      })),
    },
    changed = vi.fn();
  render(
    <OrderPaperForm
      order={toSubmittedPaper(order)}
      displayReference={order.businessNumber}
      dataState={toAuthoritativePaperState(order, null)}
      mode="create"
      onLinesChange={changed}
    />,
  );
  expect(screen.getByLabelText("الإجمالي المعتمد")).toHaveTextContent("650.00");
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("700.00");
  expect(screen.getByLabelText("الباقي المعتمد")).toHaveTextContent("0.00");
  expect(screen.getByLabelText("رصيد العميل الزائد")).toHaveTextContent(
    "50.00",
  );
  expect(screen.queryByLabelText("المبلغ المدفوع")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: /^م٣ —/u }), {
    target: { value: "permitted correction" },
  });
  expect(changed).toHaveBeenLastCalledWith([
    expect.objectContaining({
      unitPrice: "650.00",
      rowTotal: "650.00",
      mixing: "permitted correction",
    }),
  ]);
});
