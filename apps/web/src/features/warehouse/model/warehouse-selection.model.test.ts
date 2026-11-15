import { expect, it } from "vitest";
import { warehouseOrderDataSchema } from "@template/contracts";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  captureWarehouseReceipt,
  captureWarehouseWholeOrders,
  reviewWarehouseSelection,
} from "./warehouse-selection.model";
import {
  resolveWarehouseTargets,
  toWarehouseGroup,
} from "./warehouse-view.model";

const detailFixture = (received = false, count = 2, offset = 0) => {
  const original = manufacturingDetailFixture().paper.order,
    first = original.pieces[0];
  if (!first) throw new Error("Fixture piece required");
  const orderId =
    offset === 0 ? original.id : "20000000-0000-4000-8000-000000000002";
  const pieces = Array.from({ length: count }, (_, index) => ({
    ...first,
    id: `30000000-0000-4000-8000-${String(offset + index + 1).padStart(12, "0")}`,
    position: index + 1,
    stage: "WAREHOUSE",
    workState: received ? "COMPLETED" : "INCOMING",
    receivedAt: received ? "2026-11-13T00:00:00.000Z" : null,
  }));
  const counts = {
    original: count,
    cancelled: 0,
    active: count,
    received: received ? count : 0,
    completionPercent: received ? 100 : 0,
  };
  const order = {
    ...original,
    id: orderId,
    status: received ? "READY_FOR_DELIVERY" : "APPROVED",
    counts,
    pieces,
  };
  return warehouseOrderDataSchema.parse({
    summary: {
      id: orderId,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts,
      matchingPieceIds: pieces.map((piece) => piece.id),
      matchingPieceCount: count,
      lastActionAt: null,
      allowedActions: {
        canDispatch: received,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: false,
      },
      currentAttemptId: null,
      retryDate: null,
    },
    paper: { order, issues: [] },
    deliveryContact: {
      name: order.customerName,
      phone: "+966500000001",
      address: null,
    },
    work: pieces.map((piece) => ({
      pieceId: piece.id,
      acceptedHandoff: received
        ? null
        : {
            eventId: "40000000-0000-4000-8000-000000000001",
            commandId: "50000000-0000-4000-8000-000000000001",
            acceptedAt: "2026-11-13T00:00:00.000Z",
            actor: {
              id: "60000000-0000-4000-8000-000000000001",
              fullName: "Inspector",
              role: "USER",
              department: "QUALITY",
            },
            packingGroupId: null,
          },
      receiptGroupId: null,
      receivedAt: piece.receivedAt,
      legacyReceipt: received,
      allowedActions: { canReceive: !received },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  });
};
const target = (detail: ReturnType<typeof detailFixture>, index = 0) => {
  const piece = detail.paper.order.pieces[index];
  if (!piece) throw new Error("Fixture member required");
  return {
    orderId: detail.summary.id,
    expectedVersion: detail.summary.version,
    pieceId: piece.id,
  };
};
it("captures only the exact physical arrival and freezes nested evidence independently of live reads", () => {
  const detail = detailFixture(),
    selected = target(detail),
    rows = resolveWarehouseTargets(detail, [selected]);
  const review = captureWarehouseReceipt(rows);
  expect(review.orders).toEqual([
    {
      orderId: selected.orderId,
      expectedVersion: selected.expectedVersion,
      pieceIds: [selected.pieceId],
    },
  ]);
  expect(review.rows).toHaveLength(1);
  expect(Object.isFrozen(review.rows[0]?.work.acceptedHandoff)).toBe(true);
  expect(Object.isFrozen(detail.paper.order)).toBe(false);
  expect(() => captureWarehouseReceipt([...rows, ...rows])).toThrow();
  const first = rows[0];
  if (!first) throw new Error("Resolved row required");
  expect(() =>
    captureWarehouseReceipt([
      { ...first, target: { ...selected, expectedVersion: 999 } },
    ]),
  ).toThrow();
  expect(() =>
    captureWarehouseReceipt([
      {
        ...first,
        work: { ...first.work, allowedActions: { canReceive: false } },
      },
    ]),
  ).toThrow();
});
it("expands distinct selected rows once to the whole active order while preserving matching-filter membership", () => {
  const detail = detailFixture(true),
    selected = [target(detail), target(detail, 1)];
  const group = toWarehouseGroup(
    {
      ...detail.summary,
      matchingPieceIds: [target(detail).pieceId],
      matchingPieceCount: 1,
    },
    detail,
  );
  expect(group.rows).toHaveLength(1);
  const review = captureWarehouseWholeOrders(
    "DISPATCH",
    [detail],
    [target(detail)],
  );
  expect(review.orders[0]?.pieceIds).toEqual(
    selected.map((member) => member.pieceId),
  );
  expect(
    captureWarehouseWholeOrders("DISPATCH", [detail], selected).orders,
  ).toHaveLength(1);
  expect(Object.isFrozen(review.orders[0]?.detail.paper.order.pieces)).toBe(
    true,
  );
  for (const invalid of [
    [],
    [target(detail), target(detail)],
    [{ ...target(detail), expectedVersion: 999 }],
    [{ ...target(detail), orderId: "70000000-0000-4000-8000-000000000001" }],
  ])
    expect(() =>
      captureWarehouseWholeOrders("DISPATCH", [detail], invalid),
    ).toThrow();
  expect(() =>
    captureWarehouseWholeOrders("CONFIRM_DELIVERY", [detail], [target(detail)]),
  ).toThrow();
});
it("rejects an expanded atomic action above 200 pieces rather than splitting or dropping an order", () => {
  const first = detailFixture(true, 101),
    second = detailFixture(true, 100, 200);
  expect(() =>
    captureWarehouseWholeOrders(
      "DISPATCH",
      [first, second],
      [target(first), target(second)],
    ),
  ).toThrow();
});
it("re-reviews the original affected identities explicitly at the new version without changing arrival membership", () => {
  const detail = detailFixture(),
    previous = captureWarehouseReceipt(
      resolveWarehouseTargets(detail, [target(detail)]),
    );
  const newer = warehouseOrderDataSchema.parse({
    ...detail,
    summary: { ...detail.summary, version: 3 },
    paper: { ...detail.paper, order: { ...detail.paper.order, version: 3 } },
  });
  expect(reviewWarehouseSelection(previous, [newer]).orders).toEqual([
    {
      orderId: detail.summary.id,
      expectedVersion: 3,
      pieceIds: [target(detail).pieceId],
    },
  ]);
  expect(previous.orders[0]?.expectedVersion).toBe(2);
  expect(() => reviewWarehouseSelection(previous, [])).toThrow();
});
