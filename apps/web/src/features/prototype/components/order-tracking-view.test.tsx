import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { salesOrderSchema } from "@template/contracts";
import { orderFixture } from "@/test/p03-fixtures";
import { toAuthoritativeTracking } from "@/features/sales/model/order-view.model";
import { OrderFullTrackingView } from "./order-tracking-view";

it("renders exact physical receipt readiness with truthful 199/200 progress below 100 percent", () => {
  const base = orderFixture();
  const originalPiece = base.pieces[0];
  if (originalPiece === undefined) throw new Error("Missing fixture piece");
  const order = {
    ...base,
    counts: {
      original: 200,
      cancelled: 0,
      active: 200,
      received: 199,
      completionPercent: 100,
    },
    money: {
      total: "360000.00",
      paidAmount: "0.00",
      remainingDue: "360000.00",
      surplus: "0.00",
    },
    pieces: Array.from({ length: 200 }, (_, index) => ({
      ...originalPiece,
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
      position: index + 1,
      stage: index === 199 ? ("QUALITY" as const) : ("WAREHOUSE" as const),
      workState: "COMPLETED" as const,
      receivedAt: index === 199 ? null : base.createdAt,
    })),
  };
  const tracking = {
    orderId: order.id,
    orderVersion: order.version,
    counts: {
      original: 200,
      cancelled: 0,
      active: 200,
      received: 199,
      completionPercent: 100,
    },
    pieces: order.pieces.map((piece) => ({
      pieceId: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    })),
  };
  const projection = toAuthoritativeTracking(order, tracking);
  const view = render(<OrderFullTrackingView projection={projection} />);
  expect(screen.getByText("99%")).toBeInTheDocument();
  expect(screen.queryByText("جاهز ومكتمل بالمستودع")).not.toBeInTheDocument();
  expect(screen.getByText("الجودة والتغليف")).toBeInTheDocument();
  expect(screen.queryByText(/مسؤول العمل/u)).not.toBeInTheDocument();
  view.rerender(
    <OrderFullTrackingView
      projection={{
        ...projection,
        version: 2,
        counts: { ...tracking.counts, received: 200 },
        pieces: projection.pieces.map((piece) => ({
          ...piece,
          stage: "WAREHOUSE",
          receivedAt: order.createdAt,
        })),
        ready: true,
        orderStatus: "READY_FOR_DELIVERY",
      }}
    />,
  );
  expect(screen.getByText("جاهز ومكتمل بالمستودع")).toBeInTheDocument();
  view.rerender(
    <OrderFullTrackingView
      projection={{
        ...projection,
        counts: {
          original: 200,
          cancelled: 200,
          active: 0,
          received: 0,
          completionPercent: 0,
        },
        version: 3,
        pieces: projection.pieces.map((piece) => ({
          ...piece,
          stage: "CANCELLED",
          receivedAt: null,
          cancelledAt: order.createdAt,
          cancellationReason: "Synthetic cancellation",
        })),
        ready: false,
      }}
    />,
  );
  expect(screen.queryByText("جاهز ومكتمل بالمستودع")).not.toBeInTheDocument();
  expect(() =>
    toAuthoritativeTracking(order, { ...tracking, orderVersion: 2 }),
  ).toThrow("revision");
});

it.each([
  ["AWAITING_APPROVAL", "بانتظار الاعتماد"],
  ["RETURNED", "معادة للمبيعات"],
] as const)(
  "shows the submitted piece specifications and approval state for %s",
  (status, stageLabel) => {
    const base = orderFixture();
    const original = base.pieces[0];
    if (!original) throw new Error("Missing fixture piece");
    const piece = {
      ...original,
      leatherBase: "جلد بني سادة",
      decoration: "تطعيم برونزي",
      face: "وجه بخياطة مزدوجة",
      sole: null,
      sideNotes: "بطانة بلون الجلد",
    };
    const order = salesOrderSchema.parse({
      ...base,
      status,
      pieces: [piece],
      approval:
        status === "RETURNED"
          ? {
              ...base.approval,
              returnDecisionId: "e8e21883-05e9-4453-9055-e33124ac82e4",
              returnedAt: base.updatedAt,
              returnReason: "تأكيد المقاس",
              returnRevision: base.version,
            }
          : base.approval,
    });
    const projection = toAuthoritativeTracking(order, {
      orderId: order.id,
      orderVersion: order.version,
      counts: order.counts,
      pieces: [
        {
          pieceId: piece.id,
          stage: piece.stage,
          workState: piece.workState,
          receivedAt: piece.receivedAt,
          cancelledAt: piece.cancelledAt,
          cancellationReason: piece.cancellationReason,
        },
      ],
    });

    render(<OrderFullTrackingView projection={projection} />);

    const card = within(screen.getByRole("listitem"));
    expect(card.getByRole("heading", { name: "القطعة 01" })).toBeVisible();
    for (const text of [
      "SM",
      "40",
      "جلد بني سادة",
      "تطعيم برونزي",
      "وجه بخياطة مزدوجة",
      "بطانة بلون الجلد",
      stageLabel,
    ]) {
      expect(card.getByText(text)).toBeVisible();
    }
    expect(card.queryByText("الأرضية")).not.toBeInTheDocument();
    expect(card.queryByText("بانتظار الاستلام")).not.toBeInTheDocument();
    expect(card.queryByText("وقت استلام المستودع")).not.toBeInTheDocument();
  },
);

it.each([
  ["READY_FOR_DELIVERY", "جاهزة للتوصيل", true],
  ["OUT_FOR_DELIVERY", "مع المندوب", false],
  ["DELIVERED", "لدى العميل", false],
  ["DELIVERY_FAILED", "عادت بالكامل — بانتظار إعادة التجهيز", false],
] as const)(
  "projects %s custody without changing historical receipt",
  (status, custody, ready) => {
    const base = orderFixture(),
      first = base.pieces[0];
    if (!first) throw new Error("Piece required");
    const order = {
      ...base,
      status,
      counts: { ...base.counts, received: 1, completionPercent: 100 },
      pieces: [
        {
          ...first,
          stage: "WAREHOUSE" as const,
          workState: "COMPLETED" as const,
          receivedAt: base.createdAt,
        },
      ],
    };
    const tracking = {
      orderId: order.id,
      orderVersion: order.version,
      counts: order.counts,
      pieces: order.pieces.map((piece) => ({
        pieceId: piece.id,
        stage: piece.stage,
        workState: piece.workState,
        receivedAt: piece.receivedAt,
        cancelledAt: piece.cancelledAt,
        cancellationReason: piece.cancellationReason,
      })),
    };
    const projection = toAuthoritativeTracking(order, tracking);
    expect(projection.ready).toBe(ready);
    expect(projection.pieces[0]?.receivedAt).toBe(base.createdAt);
    render(<OrderFullTrackingView projection={projection} />);
    const card = within(screen.getByRole("listitem"));
    expect(card.getByText(custody)).toBeInTheDocument();
    expect(card.getByText("وقت استلام المستودع")).toBeVisible();
    expect(card.getByRole("time")).toHaveAttribute("datetime", base.createdAt);
    expect(card.getByRole("time")).not.toHaveTextContent(base.createdAt);
    expect(screen.getByText("100%")).toBeInTheDocument();
    if (!ready)
      expect(
        screen.queryByText("جاهز ومكتمل بالمستودع"),
      ).not.toBeInTheDocument();
  },
);
