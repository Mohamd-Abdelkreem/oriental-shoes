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
  expect(view.container.querySelector(".paper-approval-annotation")).toBeNull();
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

it.each([1, 8, 9, 17])(
  "chunks %i canonical active pieces after filtering retained cancellation and empty display padding",
  async (count) => {
    const { orderFixture, p03Instant, p03Ids } =
        await import("@/test/p03-fixtures"),
      { salesOrderSchema } = await import("@template/contracts"),
      { toSubmittedPaper, toAuthoritativePaperState } =
        await import("@/features/sales/model/order-view.model");
    const original = orderFixture(3),
      first = original.pieces[0];
    if (!first) throw new Error("Missing piece");
    const amount = `${String(1800 * count)}.00`;
    const order = salesOrderSchema.parse({
      ...original,
      status: "APPROVED",
      approval: { ...original.approval, approvedAt: p03Instant },
      responsibleSignature: "Original captured signature",
      counts: {
        original: count + 1,
        cancelled: 1,
        active: count,
        received: 0,
        completionPercent: 0,
      },
      money: {
        total: amount,
        paidAmount: "0.00",
        remainingDue: amount,
        surplus: "0.00",
      },
      pieces: [
        {
          ...first,
          id: p03Ids.source,
          position: 1,
          model: "Retained cancelled source",
          unitPrice: "1500.00",
          stage: "CANCELLED",
          workState: "BLOCKED",
          cancelledAt: p03Instant,
          cancellationReason: "Approved cancellation",
        },
        ...Array.from({ length: count }, (_, index) => ({
          ...first,
          id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, "0")}`,
          position: index + 2,
          model: `Active source ${String(index + 1)}`,
          sole: "أرضية مصدرية",
          soleAddition: "وسط مستقل",
        })),
      ],
    });
    const paper = toSubmittedPaper(order);
    const actorName = "<script>unsafe()</script>".padEnd(150, "ن");
    const approvalAnnotation = {
      initialActorName: actorName,
      initialApprovedAt: p03Instant,
      orderVersion: order.version,
      approvedAmendmentCount: count,
    };
    const view = render(
      <OrderPaperForm
        approvalAnnotation={approvalAnnotation}
        order={{
          ...paper,
          items: [...paper.items, blankLine("display-padding")],
        }}
        displayReference={order.businessNumber}
        dataState={toAuthoritativePaperState(order, null)}
        mode="print"
      />,
    );
    const pages = view.container.querySelectorAll(".order-paper");
    expect(pages).toHaveLength(Math.ceil(count / 8));
    pages.forEach((page, index) => {
      const remaining = Math.min(8, count - index * 8);
      expect(page.querySelectorAll(".paper-main-table tbody tr")).toHaveLength(
        remaining,
      );
      expect(page.querySelectorAll(".paper-side-table tbody tr")).toHaveLength(
        remaining,
      );
    });
    expect(view.container).not.toHaveTextContent("Retained cancelled source");
    expect(view.container.querySelectorAll(".paper-blank-row")).toHaveLength(0);
    expect(view.container).toHaveTextContent("أرضية مصدرية");
    expect(view.container).toHaveTextContent("وسط مستقل");
    expect(
      view.container.querySelectorAll(".paper-approval-annotation"),
    ).toHaveLength(pages.length);
    for (const page of pages) {
      const annotation = page.querySelector(".paper-approval-annotation");
      expect(annotation).toHaveTextContent(actorName);
      expect(annotation).toHaveTextContent(p03Instant);
      expect(annotation?.previousElementSibling?.tagName).toBe("I");
      expect(page.querySelector(".paper-signature i")).toHaveTextContent(
        "Original captured signature",
      );
    }
    expect(view.container.querySelector("script")).toBeNull();
    expect(order.pieces).toHaveLength(count + 1);
  },
);
it("renders a truthful empty canonical all-cancelled frame without an invented priced piece", async () => {
  const { orderFixture, p03Instant } = await import("@/test/p03-fixtures"),
    { salesOrderSchema } = await import("@template/contracts"),
    { toSubmittedPaper, toAuthoritativePaperState } =
      await import("@/features/sales/model/order-view.model");
  const original = orderFixture(4),
    order = salesOrderSchema.parse({
      ...original,
      status: "CANCELLED",
      approval: { ...original.approval, approvedAt: p03Instant },
      counts: {
        ...original.counts,
        active: 0,
        cancelled: 1,
        completionPercent: 0,
      },
      money: {
        total: "0.00",
        paidAmount: "2000.00",
        remainingDue: "0.00",
        surplus: "2000.00",
      },
      pieces: original.pieces.map((piece) => ({
        ...piece,
        model: "Retained cancelled model",
        stage: "CANCELLED",
        workState: "BLOCKED",
        cancelledAt: p03Instant,
        cancellationReason: "Approved cancellation",
      })),
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
    view.container.querySelectorAll(".paper-approval-annotation"),
  ).toHaveLength(1);
  expect(
    view.container.querySelectorAll(".paper-main-table tbody tr"),
  ).toHaveLength(0);
  expect(
    view.container.querySelectorAll(".paper-side-table tbody tr"),
  ).toHaveLength(0);
  expect(view.container).not.toHaveTextContent("Retained cancelled model");
  expect(view.getByLabelText("الإجمالي المعتمد")).toHaveTextContent("0.00");
  expect(view.getByLabelText("المدفوع المعتمد")).toHaveTextContent("2000.00");
  expect(view.getByLabelText("رصيد العميل الزائد")).toHaveTextContent(
    "2000.00",
  );
});
