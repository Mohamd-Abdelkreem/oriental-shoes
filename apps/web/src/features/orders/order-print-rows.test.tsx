import assert from "node:assert/strict";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { initialSnapshot } from "@/features/prototype/state/mvp-selectors";
import { OrderPaperForm } from "./components/order-paper-form";
import { blankLine } from "./components/blank-line";

const baseOrder = initialSnapshot().orders[0];
assert.ok(baseOrder);
const firstItem = baseOrder.items[0];
assert.ok(firstItem);

it.each([1, 2, 8, 9, 17])(
  "prints %i pieces across pages with aligned product and sole rows",
  (pieceCount) => {
    const items = Array.from({ length: pieceCount }, (_, index) => ({
      ...firstItem,
      id: `piece-${String(index)}`,
      model: `موديل ${String(index + 1)}`,
    }));
    const view = render(
      <OrderPaperForm order={{ ...baseOrder, items }} mode="print" />,
    );
    const pages = view.container.querySelectorAll(".order-paper");
    expect(pages).toHaveLength(Math.ceil(pieceCount / 8));
    pages.forEach((page, index) => {
      const expectedRows = Math.min(8, pieceCount - index * 8);
      expect(page.querySelectorAll(".paper-main-table tbody tr")).toHaveLength(
        expectedRows,
      );
      expect(page.querySelectorAll(".paper-side-table tbody tr")).toHaveLength(
        expectedRows,
      );
    });
    expect(view.container.querySelectorAll(".paper-blank-row")).toHaveLength(0);
  },
);

it("omits blank and deleted pieces while retaining populated pieces in order", () => {
  const items = [
    { ...firstItem, id: "first", model: "موديل أول" },
    blankLine("blank", 2),
    { ...firstItem, id: "deleted", model: "موديل محذوف", isDeleted: true },
    { ...firstItem, id: "last", model: "موديل أخير" },
  ];
  const view = render(
    <OrderPaperForm order={{ ...baseOrder, items }} mode="print" />,
  );
  const rows = view.container.querySelectorAll(".paper-main-table tbody tr");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("موديل أول");
  expect(rows[1]).toHaveTextContent("موديل أخير");
  expect(
    view.container.querySelectorAll(".paper-side-table tbody tr"),
  ).toHaveLength(2);
  expect(view.container).not.toHaveTextContent("موديل محذوف");
});

it("keeps the empty-form fallback when every active piece is blank", () => {
  const view = render(
    <OrderPaperForm
      order={{
        ...baseOrder,
        items: [blankLine("blank-1"), blankLine("blank-2")],
      }}
      mode="print"
    />,
  );
  expect(
    view.container.querySelectorAll(".paper-main-table tbody tr"),
  ).toHaveLength(2);
  expect(
    view.container.querySelectorAll(".paper-side-table tbody tr"),
  ).toHaveLength(2);
});

it("does not restore deleted pieces when no active pieces remain", () => {
  const view = render(
    <OrderPaperForm
      order={{ ...baseOrder, items: [{ ...firstItem, isDeleted: true }] }}
      mode="print"
    />,
  );
  expect(
    view.container.querySelectorAll(".paper-main-table tbody tr"),
  ).toHaveLength(0);
  expect(
    view.container.querySelectorAll(".paper-side-table tbody tr"),
  ).toHaveLength(0);
});

it("preserves unconverted callers' factual fallback presentation when draft state is omitted", () => {
  const view = render(
    <OrderPaperForm
      order={{
        ...baseOrder,
        responsibleSignature: "",
        generalNotes: "",
        hijriDate: undefined,
      }}
      mode="print"
    />,
  );
  expect(view.container.querySelector(".paper-signature")).toHaveTextContent(
    "ريم خالد",
  );
  expect(
    view.container.querySelector(".paper-general-notes"),
  ).toHaveTextContent("مطابقة العينة المعتمدة");
  expect(view.container.querySelector(".paper-dates")).toHaveTextContent(
    "٢٩ / ٠٣ / ١٤٤٨ هـ",
  );
});

it.each([1, 8, 9, 17])(
  "keeps authoritative %i-row paper chunks and exact finance without enabling official printing",
  async (count) => {
    const { orderFixture } = await import("@/test/p03-fixtures"),
      { toSubmittedPaper, toAuthoritativePaperState } =
        await import("@/features/sales/model/order-view.model");
    const original = orderFixture(),
      first = original.pieces[0];
    if (!first) throw new Error("Missing piece");
    const order = {
      ...original,
      counts: {
        original: count,
        cancelled: 0,
        active: count,
        received: 0,
        completionPercent: 0,
      },
      money: {
        total: `${String(1800 * count)}.00`,
        paidAmount: "0.00",
        remainingDue: `${String(1800 * count)}.00`,
        surplus: "0.00",
      },
      pieces: Array.from({ length: count }, (_, index) => ({
        ...first,
        id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, "0")}`,
        position: index + 1,
      })),
    };
    const view = render(
      <OrderPaperForm
        order={toSubmittedPaper(order)}
        dataState={toAuthoritativePaperState(order, null)}
        mode="print"
        displayReference={order.businessNumber}
      />,
    );
    expect(view.container.querySelectorAll(".order-paper")).toHaveLength(
      Math.ceil(count / 8),
    );
    expect(
      view.container.querySelectorAll(".paper-main-table tbody tr"),
    ).toHaveLength(count);
    expect(view.container).toHaveTextContent("SHOP-2026-0001");
    for (const total of view.getAllByLabelText("الإجمالي المعتمد"))
      expect(total).toHaveTextContent(`${String(1800 * count)}.00`);
  },
);
