import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { factoryOrderPieceSchema } from "../sales-orders/sales-orders.schema.ts";
import {
  warehouseOrdersQuerySchema,
  warehousePiecesQuerySchema,
  warehouseDashboardQuerySchema,
  warehouseOrderDataSchema,
  warehousePiecesDataSchema,
  warehouseOrdersDataSchema,
  warehouseOrderHistoryDataSchema,
} from "./warehouse.schema.ts";

const instant = "2026-11-14T00:00:00Z";
const emptyPage = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
const actor = {
  id: randomUUID(),
  fullName: "Quality A",
  role: "USER",
  department: "QUALITY",
};
const detail = () => {
  const id = randomUUID(),
    pieceId = randomUUID();
  const piece = factoryOrderPieceSchema.parse({
    id: pieceId,
    model: "SM",
    size: "40",
    leatherBase: "Leather",
    decoration: "Decoration",
    decorationColor: "",
    faceRight: "",
    faceLeft: "",
    mixing: "",
    face: "Face",
    sole: "",
    soleAddition: "",
    soleColor: "",
    additions: "",
    aField: "",
    fField: "",
    sideNotes: "",
    position: 1,
    quantity: 1,
    stage: "WAREHOUSE",
    workState: "INCOMING",
    receivedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  });
  const counts = {
    original: 1,
    active: 1,
    cancelled: 0,
    received: 0,
    completionPercent: 0,
  };
  const header = {
    id,
    version: 4,
    type: "SHOP",
    status: "APPROVED",
    businessNumber: "SHOP-2026-0001",
    customerName: "Customer",
    deliveryDate: null,
    counts,
  };
  return {
    summary: {
      ...header,
      matchingPieceIds: [pieceId],
      matchingPieceCount: 1,
      lastActionAt: instant,
      allowedActions: {
        canDispatch: false,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: false,
      },
      currentAttemptId: null,
      retryDate: null,
    },
    paper: {
      order: {
        ...header,
        generalNotes: null,
        repairNote: null,
        adjustmentRequested: null,
        adjustmentReason: null,
        adjustmentActionTaken: null,
        pieces: [piece],
      },
      issues: [],
    },
    deliveryContact: {
      name: "Customer",
      phone: "+966500000001",
      address: null,
    },
    work: [
      {
        pieceId,
        acceptedHandoff: {
          eventId: randomUUID(),
          commandId: randomUUID(),
          acceptedAt: instant,
          actor,
          packingGroupId: null,
        },
        receiptGroupId: null,
        receivedAt: null,
        legacyReceipt: false,
        allowedActions: { canReceive: true },
      },
    ],
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  };
};
it("reuses canonical query bounds and rejects unsupported filters", () => {
  expect(warehouseOrdersQuerySchema.parse({ view: "READY" })).toEqual({
    view: "READY",
    page: 1,
    limit: 25,
  });
  expect(
    warehousePiecesQuerySchema.parse({
      view: "INCOMING",
      limit: "100",
      search: "  needle  ",
    }),
  ).toMatchObject({ limit: 100, search: "needle" });
  expect(warehouseDashboardQuerySchema.parse({ search: " " })).toEqual({
    search: undefined,
  });
  for (const input of [
    { view: "READY", limit: 26 },
    { view: "READY", worker: "A" },
    { view: "IN_PROGRESS" },
    { view: "READY", search: "x".repeat(151) },
    { view: "READY", search: "x\u0000" },
  ])
    expect(warehouseOrdersQuerySchema.safeParse(input).success).toBe(false);
});
it("requires empty pages to carry explicit department/view/order scope and honest totals", () => {
  const page = {
    department: "WAREHOUSE",
    view: "INCOMING",
    orderId: null,
    pieces: [],
    counts: { orders: 0, pieces: 0 },
    pagination: emptyPage,
    receiptGroups: [],
    qualityPackingGroups: [],
  };
  expect(warehousePiecesDataSchema.parse(page)).toEqual(page);
  for (const changed of [
    { department: "QUALITY" },
    { view: "UNKNOWN" },
    { orderId: undefined },
    { counts: { orders: 1, pieces: 0 } },
    { pagination: { ...emptyPage, total: 1, totalPages: 1 } },
  ])
    expect(
      warehousePiecesDataSchema.safeParse({ ...page, ...changed }).success,
    ).toBe(false);
});
it("binds safe detail and matching rows without private projection fields", () => {
  const order = detail();
  expect(warehouseOrderDataSchema.parse(order)).toEqual(order);
  const piece = order.paper.order.pieces[0],
    work = order.work[0];
  if (!piece || !work) throw new Error("Physical context required");
  const page = {
    department: "WAREHOUSE",
    view: "INCOMING",
    orderId: order.summary.id,
    pieces: [{ order: order.summary, piece, work }],
    counts: { orders: 1, pieces: 1 },
    pagination: { ...emptyPage, total: 1, totalPages: 1 },
    receiptGroups: [],
    qualityPackingGroups: [],
  };
  expect(warehousePiecesDataSchema.parse(page)).toEqual(page);
  expect(
    warehousePiecesDataSchema.safeParse({ ...page, orderId: randomUUID() })
      .success,
  ).toBe(false);
  expect(
    warehouseOrdersDataSchema.parse({
      department: "WAREHOUSE",
      view: "INCOMING",
      orders: [order.summary],
      counts: page.counts,
      pagination: page.pagination,
    }).orders,
  ).toHaveLength(1);
  for (const changed of [
    {
      deliveryContact: {
        ...order.deliveryContact,
        email: "private@example.test",
      },
    },
    { deliveryContact: { ...order.deliveryContact, customerId: randomUUID() } },
    { deliveryContact: { ...order.deliveryContact, name: "Foreign" } },
    { summary: { ...order.summary, money: { paidAmount: "0.00" } } },
    { summary: { ...order.summary, version: 5 } },
    {
      summary: {
        ...order.summary,
        allowedActions: { ...order.summary.allowedActions, canDispatch: true },
      },
    },
    { work: [{ ...work, pieceId: randomUUID() }] },
    { work: [work, work] },
    { work: [{ ...work, receivedAt: instant }] },
    {
      qualityPackingGroups: [
        {
          id: randomUUID(),
          inspectionId: randomUUID(),
          acceptedPieceIds: [piece.id],
          cartonCount: "1",
          cartonNumbers: null,
          inspectorNote: null,
          inspector: actor,
          packedAt: instant,
        },
      ],
    },
  ])
    expect(
      warehouseOrderDataSchema.safeParse({ ...order, ...changed }).success,
    ).toBe(false);
});
it("retains full original packing membership on a one-row page and refuses foreign/missing registries", () => {
  const order = detail(),
    work = order.work[0],
    piece = order.paper.order.pieces[0];
  if (!work || !piece) throw new Error("Physical context required");
  const packingId = randomUUID();
  const packing = {
    id: packingId,
    inspectionId: randomUUID(),
    acceptedPieceIds: [piece.id, randomUUID()],
    cartonCount: "  2  ",
    cartonNumbers: "A/B",
    inspectorNote: "  Original note  ",
    inspector: actor,
    packedAt: instant,
  };
  const page = {
    department: "WAREHOUSE",
    view: "INCOMING",
    orderId: null,
    pieces: [
      {
        order: order.summary,
        piece,
        work: {
          ...work,
          acceptedHandoff: {
            ...work.acceptedHandoff,
            packingGroupId: packingId,
          },
        },
      },
    ],
    counts: { orders: 1, pieces: 1 },
    pagination: { ...emptyPage, limit: 1, total: 1, totalPages: 1 },
    receiptGroups: [],
    qualityPackingGroups: [packing],
  };
  expect(warehousePiecesDataSchema.parse(page).qualityPackingGroups).toEqual([
    packing,
  ]);
  for (const changed of [
    { ...packing, inspector: { ...actor, id: randomUUID() } },
    { ...packing, packedAt: "2026-11-14T01:00:00Z" },
  ]) {
    expect(
      warehousePiecesDataSchema.safeParse({
        ...page,
        qualityPackingGroups: [changed],
      }).success,
    ).toBe(false);
  }
  expect(
    warehouseOrderDataSchema.safeParse({
      ...order,
      work: page.pieces.map((row) => row.work),
      qualityPackingGroups: [packing],
    }).success,
  ).toBe(false);

  expect(
    warehousePiecesDataSchema.safeParse({ ...page, qualityPackingGroups: [] })
      .success,
  ).toBe(false);
  expect(
    warehousePiecesDataSchema.safeParse({
      ...page,
      qualityPackingGroups: [{ ...packing, acceptedPieceIds: [randomUUID()] }],
    }).success,
  ).toBe(false);
  expect(
    warehousePiecesDataSchema.safeParse({
      ...page,
      qualityPackingGroups: [packing, packing],
    }).success,
  ).toBe(false);
});
it("keeps absent history distinct from malformed paging or foreign identity fields", () => {
  const page = {
    department: "WAREHOUSE",
    orderId: randomUUID(),
    events: [],
    pagination: emptyPage,
  };
  expect(warehouseOrderHistoryDataSchema.parse(page)).toEqual(page);
  expect(
    warehouseOrderHistoryDataSchema.safeParse({ ...page, orderId: undefined })
      .success,
  ).toBe(false);
  expect(
    warehouseOrderHistoryDataSchema.safeParse({
      ...page,
      pagination: { ...emptyPage, total: 1, totalPages: 1 },
    }).success,
  ).toBe(false);
});
