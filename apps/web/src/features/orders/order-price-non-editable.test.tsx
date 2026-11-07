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

it("shows 1800 total/2000 retained paid/zero due/200 surplus after cancelling the frozen1500 piece", async () => {
  const { orderFixture, p03Ids, p03Instant } =
      await import("@/test/p03-fixtures"),
    { salesOrderSchema } = await import("@template/contracts"),
    { toSubmittedPaper, toAuthoritativePaperState } =
      await import("@/features/sales/model/order-view.model");
  const original = orderFixture(3),
    first = original.pieces[0];
  if (!first) throw new Error("Missing piece");
  const order = salesOrderSchema.parse({
    ...original,
    status: "APPROVED",
    approval: { ...original.approval, approvedAt: p03Instant },
    counts: {
      original: 2,
      cancelled: 1,
      active: 1,
      received: 0,
      completionPercent: 0,
    },
    money: {
      total: "1800.00",
      paidAmount: "2000.00",
      remainingDue: "0.00",
      surplus: "200.00",
    },
    pieces: [
      first,
      {
        ...first,
        id: p03Ids.source,
        position: 2,
        model: "Retained cancelled1500",
        unitPrice: "1500.00",
        stage: "CANCELLED",
        workState: "BLOCKED",
        cancelledAt: p03Instant,
        cancellationReason: "Approved cancellation",
      },
    ],
  });
  const view = render(
    <OrderPaperForm
      approvalAnnotation={{
        initialActorName: "Actual initial approver",
        initialApprovedAt: p03Instant,
        orderVersion: order.version,
        approvedAmendmentCount: 1,
      }}
      order={toSubmittedPaper(order)}
      dataState={toAuthoritativePaperState(order, null)}
      mode="print"
    />,
  );
  expect(
    view.container.querySelector(".paper-approval-annotation"),
  ).toHaveTextContent("Actual initial approver");
  expect(screen.getByLabelText("الإجمالي المعتمد")).toHaveTextContent(
    "1800.00",
  );
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("2000.00");
  expect(screen.getByLabelText("الباقي المعتمد")).toHaveTextContent("0.00");
  expect(screen.getByLabelText("رصيد العميل الزائد")).toHaveTextContent(
    "200.00",
  );
  expect(
    view.container.querySelectorAll(".paper-main-table tbody tr"),
  ).toHaveLength(1);
  expect(view.container).not.toHaveTextContent("Retained cancelled1500");
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(order.pieces).toHaveLength(2);
});
