import { captureWarehouseWholeOrders } from "./warehouse-selection.model";
import { expect, it } from "vitest";
import {
  warehouseOrderDataSchema,
  warehousePiecesDataSchema,
} from "@template/contracts";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  resolveWarehouseTargets,
  toWarehouseRows,
  toWarehouseTracking,
  toWarehouseGroup,
} from "./warehouse-view.model";

it("binds safe physical rows to exact detail/version and keeps zero-active retained history non-actionable", () => {
  const original = manufacturingDetailFixture().paper.order,
    first = original.pieces[0];
  if (!first) throw new Error("Fixture piece required");
  const order = {
    ...original,
    status: "CANCELLED",
    counts: {
      original: 1,
      cancelled: 1,
      active: 0,
      received: 0,
      completionPercent: 0,
    },
    pieces: [
      {
        ...first,
        stage: "CANCELLED",
        workState: "BLOCKED",
        cancelledAt: "2026-11-13T00:00:00.000Z",
        cancellationReason: "Retained cancellation",
        receivedAt: "2026-11-12T00:00:00.000Z",
      },
    ],
  };
  const detail = warehouseOrderDataSchema.parse({
    summary: {
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts: order.counts,
      matchingPieceIds: [],
      matchingPieceCount: 0,
      lastActionAt: null,
      allowedActions: {
        canDispatch: false,
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
    work: [
      {
        pieceId: first.id,
        acceptedHandoff: null,
        receiptGroupId: null,
        receivedAt: "2026-11-12T00:00:00.000Z",
        legacyReceipt: true,
        allowedActions: { canReceive: false },
      },
    ],
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  });
  const readyCounts = {
    original: 1,
    cancelled: 0,
    active: 1,
    received: 1,
    completionPercent: 100,
  };
  const readyDetail = warehouseOrderDataSchema.parse({
    ...detail,
    summary: {
      ...detail.summary,
      status: "READY_FOR_DELIVERY",
      counts: readyCounts,
      matchingPieceIds: [first.id],
      matchingPieceCount: 1,
      allowedActions: { ...detail.summary.allowedActions, canDispatch: true },
    },
    paper: {
      ...detail.paper,
      order: {
        ...detail.paper.order,
        status: "READY_FOR_DELIVERY",
        counts: readyCounts,
        pieces: [
          {
            ...detail.paper.order.pieces[0],
            stage: "WAREHOUSE",
            cancelledAt: null,
            cancellationReason: null,
          },
        ],
      },
    },
  });
  expect(toWarehouseTracking(readyDetail).ready).toBe(true);
  expect(
    toWarehouseTracking({
      ...readyDetail,
      summary: {
        ...readyDetail.summary,
        allowedActions: {
          ...readyDetail.summary.allowedActions,
          canDispatch: false,
        },
      },
    }).ready,
  ).toBe(false);
  const target = {
    orderId: order.id,
    expectedVersion: order.version,
    pieceId: first.id,
  };
  expect(resolveWarehouseTargets(detail, [target])[0]?.piece.id).toBe(first.id);
  for (const targets of [
    [],
    [target, target],
    [{ ...target, expectedVersion: 100 }],
    [{ ...target, orderId: first.id }],
  ])
    expect(() => resolveWarehouseTargets(detail, targets)).toThrow();
  expect(() =>
    captureWarehouseWholeOrders("DISPATCH", [detail], [target]),
  ).toThrow();
  expect(toWarehouseTracking(detail)).toMatchObject({
    orderStatus: "CANCELLED",
    ready: false,
    counts: { active: 0 },
  });
  expect(toWarehouseGroup(detail.summary, detail).rows).toEqual([]);
  expect(() =>
    toWarehouseGroup({ ...detail.summary, version: 99 }, detail),
  ).toThrow();
  const page = warehousePiecesDataSchema.parse({
    department: "WAREHOUSE",
    view: "INCOMING",
    orderId: null,
    pieces: [],
    counts: { orders: 0, pieces: 0 },
    pagination: {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    receiptGroups: [],
    qualityPackingGroups: [],
  });
  expect(toWarehouseRows(page)).toEqual([]);
});
