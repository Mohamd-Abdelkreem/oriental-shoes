import {
  warehouseOrderHistoryDataSchema as administrativeHistorySchema,
  warehouseActivityDataSchema as standaloneActivitySchema,
} from "./warehouse.schema.ts";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  factoryOrderPieceSchema,
  type FactoryOrderPiece,
} from "../sales-orders/sales-orders.schema.ts";
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

it("accepts minimal administrative order history without widening the standalone feed", () => {
  const event = {
    id: randomUUID(),
    orderId: randomUUID(),
    orderVersion: 8,
    businessNumber: "SHOP-2026-0001",
    operation: "ADMIN_CANCEL",
    actor: {
      id: randomUUID(),
      fullName: "Admin",
      role: "ADMIN",
      department: null,
    },
    occurredAt: "2026-11-15T12:00:00.000Z",
    pieceIds: [randomUUID()],
    beforeStatus: "APPROVED",
    afterStatus: "CANCELLED",
  };
  const page = {
    department: "WAREHOUSE",
    orderId: event.orderId,
    events: [{ kind: "administration", event }],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  expect(administrativeHistorySchema.parse(page)).toEqual(page);
  const { orderId: _orderId, ...feed } = page;
  expect(standaloneActivitySchema.safeParse(feed).success).toBe(false);
  for (const invalid of [
    { ...page, orderId: randomUUID() },
    { ...page, events: [...page.events, ...page.events] },
    {
      ...page,
      events: [
        {
          kind: "administration",
          event: { ...event, department: "WAREHOUSE" },
        },
      ],
    },
    {
      ...page,
      events: [
        { kind: "administration", event: { ...event, reason: "private" } },
      ],
    },
    { ...page, pagination: { ...page.pagination, limit: 101 } },
  ])
    expect(administrativeHistorySchema.safeParse(invalid).success).toBe(false);
});

const failedCancellationDetail = (full = false, retried = false) => {
  const warehouseActor = { ...actor, department: "WAREHOUSE" as const };
  const base = detail(),
    original = base.paper.order.pieces[0];
  if (!original) throw new Error("Expected original paper piece");
  const receivedAt = "2026-11-15T08:00:00.000Z",
    failedAt = "2026-11-15T10:00:00.000Z",
    cancelledAt = "2026-11-15T11:00:00.000Z",
    otherId = randomUUID(),
    attemptId = randomUUID();
  const pieces = [
    {
      ...original,
      stage: "CANCELLED",
      workState: "BLOCKED",
      receivedAt,
      cancelledAt,
      cancellationReason: "Administrative cancellation",
    },
    {
      ...original,
      id: otherId,
      position: 2,
      stage: full ? "CANCELLED" : "WAREHOUSE",
      workState: full ? "BLOCKED" : "COMPLETED",
      receivedAt,
      cancelledAt: full ? cancelledAt : null,
      cancellationReason: full ? "Administrative cancellation" : null,
    },
  ];
  const counts = {
      original: 2,
      cancelled: full ? 2 : 1,
      active: full ? 0 : 1,
      received: full ? 0 : 1,
      completionPercent: full ? 0 : 100,
    },
    status = full
      ? "CANCELLED"
      : retried
        ? "READY_FOR_DELIVERY"
        : "DELIVERY_FAILED";
  const attempt = {
    id: attemptId,
    orderId: base.summary.id,
    number: 1,
    pieceIds: [original.id, otherId].sort(),
    status: "FAILED",
    dispatchedBy: warehouseActor,
    dispatchedAt: receivedAt,
    deliveryNote: null,
    outcome: {
      id: randomUUID(),
      kind: "FAILED",
      recordedBy: warehouseActor,
      recordedAt: failedAt,
      returnedToWarehouse: true,
      reason: "Whole attempt returned",
      notes: null,
    },
    retry: retried
      ? {
          id: randomUUID(),
          actor: warehouseActor,
          occurredAt: failedAt,
          retryDate: null,
          notes: null,
        }
      : null,
  };
  return {
    ...base,
    summary: {
      ...base.summary,
      status,
      counts,
      currentAttemptId: attemptId,
      matchingPieceIds: full ? [] : [otherId],
      matchingPieceCount: full ? 0 : 1,
      allowedActions: {
        canDispatch: !full && retried,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: !full && !retried,
      },
    },
    paper: {
      ...base.paper,
      order: { ...base.paper.order, status, counts, pieces },
    },
    work: pieces.map((piece) => ({
      ...base.work[0],
      pieceId: piece.id,
      acceptedHandoff: null,
      receivedAt,
      legacyReceipt: true,
      receiptGroupId: null,
      allowedActions: { canReceive: false },
    })),
    currentAttempt: attempt,
  };
};
it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  "retains complete failed membership after full cancellation %s and retry %s",
  (full, retried) => {
    const candidate = failedCancellationDetail(full, retried);
    expect(warehouseOrderDataSchema.parse(candidate)).toEqual(candidate);
  },
);
it("rejects foreign/omitted-active/unreceived/earlier-cancelled members and dispatched or delivered substitutions", () => {
  const base = failedCancellationDetail(),
    first = base.paper.order.pieces[0];
  if (!first) throw new Error("Expected cancelled member");
  const changePiece = (patch: Partial<FactoryOrderPiece>) => ({
    ...base,
    paper: {
      ...base.paper,
      order: {
        ...base.paper.order,
        pieces: base.paper.order.pieces.map((piece) =>
          piece.id === first.id ? { ...piece, ...patch } : piece,
        ),
      },
    },
  });
  const candidates = [
    {
      ...base,
      currentAttempt: {
        ...base.currentAttempt,
        pieceIds: [first.id, randomUUID()],
      },
    },
    {
      ...base,
      currentAttempt: { ...base.currentAttempt, pieceIds: [first.id] },
    },
    changePiece({ receivedAt: null }),
    changePiece({ cancelledAt: "2026-11-15T09:00:00.000Z" }),
    {
      ...base,
      summary: {
        ...base.summary,
        status: "OUT_FOR_DELIVERY",
        allowedActions: {
          canDispatch: false,
          canConfirmDelivery: true,
          canFailDelivery: true,
          canRetryDelivery: false,
        },
      },
      paper: {
        ...base.paper,
        order: { ...base.paper.order, status: "OUT_FOR_DELIVERY" },
      },
      currentAttempt: {
        ...base.currentAttempt,
        status: "DISPATCHED",
        outcome: null,
      },
    },
    {
      ...base,
      summary: {
        ...base.summary,
        status: "DELIVERED",
        allowedActions: {
          canDispatch: false,
          canConfirmDelivery: false,
          canFailDelivery: false,
          canRetryDelivery: false,
        },
      },
      paper: {
        ...base.paper,
        order: { ...base.paper.order, status: "DELIVERED" },
      },
      currentAttempt: {
        ...base.currentAttempt,
        status: "DELIVERED",
        outcome: {
          id: randomUUID(),
          kind: "DELIVERED",
          recordedBy: base.currentAttempt.dispatchedBy,
          recordedAt: "2026-11-15T10:00:00Z",
          recipient: null,
          deliveredAt: null,
          notes: null,
        },
      },
    },
  ];
  for (const candidate of candidates)
    expect(warehouseOrderDataSchema.safeParse(candidate).success).toBe(false);
});
