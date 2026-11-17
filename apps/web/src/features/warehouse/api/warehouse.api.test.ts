import { beforeEach, expect, it, vi } from "vitest";
import {
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  warehouseOrderDataSchema,
  warehouseActivityEventSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { p03Ids, p03Instant, p03Envelope } from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { warehouseApi } from "./warehouse.api";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => vi.resetAllMocks());
const pagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
const body = warehouseCommandBodySchema.parse({
  commandId: p03Ids.command,
  operation: "RECEIVE",
  orders: [
    {
      orderId: p03Ids.order,
      expectedVersion: 2,
      pieceIds: [p03Ids.piece],
      receipt: { cartonCount: " 2 ", storageLocation: null, notes: null },
    },
  ],
});
const saved = warehouseCommandDataSchema.parse({
  kind: "warehouse-command",
  replayed: false,
  receipt: {
    commandId: body.commandId,
    operation: "RECEIVE",
    actor: {
      id: p03Ids.actor,
      fullName: "Warehouse colleague",
      role: "USER",
      department: "WAREHOUSE",
    },
    occurredAt: p03Instant,
  },
  outcome: {
    orders: [
      {
        eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orderId: p03Ids.order,
        beforeVersion: 2,
        afterVersion: 3,
        status: "APPROVED",
        pieceIds: [p03Ids.piece],
        receiptGroupId: p03Ids.source,
        attemptId: null,
        retryId: null,
      },
    ],
  },
});
const detailFixture = () => {
  const original = manufacturingDetailFixture().paper.order;
  const counts = {
    ...original.counts,
    received: original.counts.active,
    completionPercent: 100,
  };
  const order = {
    ...original,
    status: "READY_FOR_DELIVERY",
    counts,
    pieces: original.pieces.map((piece) => ({
      ...piece,
      stage: "WAREHOUSE",
      workState: "COMPLETED",
      receivedAt: p03Instant,
    })),
  };
  return warehouseOrderDataSchema.parse({
    summary: {
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts,
      matchingPieceIds: order.pieces.map((piece) => piece.id),
      matchingPieceCount: order.pieces.length,
      lastActionAt: null,
      allowedActions: {
        canDispatch: true,
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
    work: order.pieces.map((piece) => ({
      pieceId: piece.id,
      acceptedHandoff: null,
      receiptGroupId: null,
      receivedAt: p03Instant,
      legacyReceipt: true,
      allowedActions: { canReceive: false },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  });
};
const eventFixture = () =>
  warehouseActivityEventSchema.parse({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    commandId: body.commandId,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    operation: "RECEIVE",
    actor: saved.receipt.actor,
    occurredAt: p03Instant,
    pieceIds: [p03Ids.piece],
    beforeStatus: "APPROVED",
    afterStatus: "APPROVED",
    receiptGroup: {
      id: p03Ids.source,
      orderId: p03Ids.order,
      pieceIds: [p03Ids.piece],
      actor: saved.receipt.actor,
      receivedAt: p03Instant,
      cartonCount: " 2 ",
      storageLocation: null,
      notes: null,
    },
    attempt: null,
    retry: null,
  });

it("sends the complete normalized intent without aborting writes and observes only its original key", async () => {
  transport.post.mockResolvedValue(p03Envelope(saved));
  expect(await warehouseApi.command(body)).toEqual(saved);
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(
    "/warehouse/commands",
    body,
  );
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(saved));
  expect(await warehouseApi.observe(body.commandId, signal)).toEqual(saved);
  expect(transport.get).toHaveBeenLastCalledWith(
    `/warehouse-commands/${body.commandId}`,
    { signal },
  );
  transport.get.mockResolvedValue(
    p03Envelope({
      ...saved,
      receipt: { ...saved.receipt, commandId: p03Ids.source },
    }),
  );
  await expect(warehouseApi.observe(body.commandId)).rejects.toThrow(
    ApiContractError,
  );
  const group = saved.outcome.orders[0];
  if (!group) throw new Error("Outcome required");
  transport.post.mockResolvedValue(
    p03Envelope({
      ...saved,
      outcome: { orders: [{ ...group, pieceIds: [p03Ids.source] }] },
    }),
  );
  await expect(warehouseApi.command(body)).rejects.toThrow(ApiContractError);
});
it("forwards dashboard filters and validates finite scoped counts rather than inventing empty data", async () => {
  const counts = { orders: 0, pieces: 0 },
    dashboard = {
      counts: {
        incoming: counts,
        incomplete: counts,
        ready: counts,
        outForDelivery: counts,
        deliveryFailed: counts,
        delivered: counts,
      },
    },
    signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(dashboard));
  expect(
    await warehouseApi.dashboard({ search: "  model  ", type: "SHOP" }, signal),
  ).toEqual(dashboard);
  expect(transport.get).toHaveBeenLastCalledWith("/warehouse/dashboard", {
    signal,
    params: { search: "model", type: "SHOP" },
  });
  transport.get.mockResolvedValue(p03Envelope({ counts: {} }));
  await expect(warehouseApi.dashboard({})).rejects.toThrow(ApiContractError);
});
it("binds view, department, pagination and explicit order scope even for a valid empty page", async () => {
  const page = {
      department: "WAREHOUSE",
      view: "READY",
      pieces: [],
      orderId: p03Ids.order,
      counts: { orders: 0, pieces: 0 },
      pagination,
      receiptGroups: [],
      qualityPackingGroups: [],
    },
    signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(page));
  expect(
    await warehouseApi.pieces({ view: "READY", orderId: p03Ids.order }, signal),
  ).toEqual(page);
  expect(transport.get).toHaveBeenLastCalledWith("/warehouse/pieces", {
    signal,
    params: { view: "READY", orderId: p03Ids.order, page: 1, limit: 25 },
  });
  for (const invalid of [
    { ...page, view: "INCOMING" },
    { ...page, department: "QUALITY" },
    { ...page, orderId: null },
    { ...page, pagination: { ...pagination, page: 2, hasPreviousPage: true } },
  ]) {
    transport.get.mockResolvedValue(p03Envelope(invalid));
    await expect(
      warehouseApi.pieces({ view: "READY", orderId: p03Ids.order }),
    ).rejects.toThrow(ApiContractError);
  }
  const grouped = {
    department: "WAREHOUSE",
    view: "READY",
    orders: [],
    counts: page.counts,
    pagination: { ...pagination, limit: 10 },
  };
  transport.get.mockResolvedValue(p03Envelope(grouped));
  expect(await warehouseApi.orders({ view: "READY", limit: 10 })).toEqual(
    grouped,
  );
  transport.get.mockResolvedValue(
    p03Envelope({ ...grouped, view: "INCOMPLETE" }),
  );
  await expect(
    warehouseApi.orders({ view: "READY", limit: 10 }),
  ).rejects.toThrow(ApiContractError);
});
it("binds exact safe detail and rejects finance, email and foreign identity instead of returning a fallback", async () => {
  const detail = detailFixture();
  transport.get.mockResolvedValue(p03Envelope(detail));
  expect(await warehouseApi.order(p03Ids.order)).toEqual(detail);
  for (const contact of [
    { ...detail.deliveryContact, email: "private@example.test" },
    { ...detail.deliveryContact, paidAmount: "1.00" },
  ]) {
    transport.get.mockResolvedValue(
      p03Envelope({ ...detail, deliveryContact: contact }),
    );
    await expect(warehouseApi.order(p03Ids.order)).rejects.toThrow(
      ApiContractError,
    );
  }
  transport.get.mockResolvedValue(p03Envelope(detail));
  await expect(warehouseApi.order(p03Ids.source)).rejects.toThrow(
    ApiContractError,
  );
});
it("binds paged history and complete original grouped membership to the requested piece and order", async () => {
  const event = eventFixture(),
    page = {
      department: "WAREHOUSE",
      events: [{ kind: "warehouse", event }],
      pagination: { ...pagination, total: 1, totalPages: 1 },
    },
    signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(page));
  expect(await warehouseApi.activity({}, signal)).toEqual(page);
  expect(transport.get).toHaveBeenLastCalledWith("/warehouse/activity", {
    signal,
    params: { page: 1, limit: 25 },
  });
  transport.get.mockResolvedValue(
    p03Envelope({ ...page, orderId: p03Ids.order }),
  );
  expect(
    await warehouseApi.orderHistory(
      p03Ids.order,
      { pieceId: p03Ids.piece },
      signal,
    ),
  ).toMatchObject({ orderId: p03Ids.order, events: page.events });
  await expect(
    warehouseApi.orderHistory(p03Ids.order, { pieceId: p03Ids.source }),
  ).rejects.toThrow(ApiContractError);
  await expect(warehouseApi.orderHistory(p03Ids.source, {})).rejects.toThrow(
    ApiContractError,
  );
});
it("rejects invalid local identities and intent before transport and preserves actual network failure", async () => {
  await expect(warehouseApi.order("missing")).rejects.toThrow();
  await expect(warehouseApi.command({ ...body, orders: [] })).rejects.toThrow();
  expect(transport.get).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
  const failure = new Error("Synthetic unavailable boundary");
  transport.get.mockRejectedValue(failure);
  await expect(warehouseApi.activity({})).rejects.toBe(failure);
});

it("keeps grouped administrative cancellation history minimal and bound while standalone feeds remain narrow", async () => {
  const event = {
    id: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    operation: "ADMIN_CANCEL",
    actor: {
      id: p03Ids.actor,
      fullName: "Actual administrator",
      role: "ADMIN",
      department: null,
    },
    occurredAt: p03Instant,
    pieceIds: [p03Ids.piece, p03Ids.source].sort(),
    beforeStatus: "APPROVED",
    afterStatus: "APPROVED",
  };
  const page = {
    department: "WAREHOUSE",
    orderId: p03Ids.order,
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
  transport.get.mockResolvedValue(p03Envelope(page));
  expect(
    (await warehouseApi.orderHistory(p03Ids.order, { pieceId: p03Ids.piece }))
      .events,
  ).toEqual(page.events);
  for (const extra of [
    { reason: "Private" },
    { before: {} },
    { orderId: p03Ids.actor },
  ]) {
    transport.get.mockResolvedValue(
      p03Envelope({
        ...page,
        events: [{ kind: "administration", event: { ...event, ...extra } }],
      }),
    );
    await expect(
      warehouseApi.orderHistory(p03Ids.order, { pieceId: p03Ids.piece }),
    ).rejects.toThrow(ApiContractError);
  }
  transport.get.mockResolvedValue(
    p03Envelope({
      department: "WAREHOUSE",
      events: page.events,
      pagination: page.pagination,
    }),
  );
  await expect(warehouseApi.activity({})).rejects.toThrow(ApiContractError);
});

it("rejects an administrative cancellation unrelated to the filtered physical piece", async () => {
  const page = {
    department: "WAREHOUSE",
    orderId: p03Ids.order,
    events: [
      {
        kind: "administration",
        event: {
          id: p03Ids.command,
          orderId: p03Ids.order,
          orderVersion: 3,
          businessNumber: "SHOP-2026-0001",
          operation: "ADMIN_CANCEL",
          actor: {
            id: p03Ids.actor,
            fullName: "Actual administrator",
            role: "ADMIN",
            department: null,
          },
          occurredAt: p03Instant,
          pieceIds: [p03Ids.source],
          beforeStatus: "APPROVED",
          afterStatus: "APPROVED",
        },
      },
    ],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  transport.get.mockResolvedValue(p03Envelope(page));
  await expect(
    warehouseApi.orderHistory(p03Ids.order, { pieceId: p03Ids.piece }),
  ).rejects.toThrow(ApiContractError);
});
