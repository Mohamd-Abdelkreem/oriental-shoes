import assert from "node:assert/strict";
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
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
