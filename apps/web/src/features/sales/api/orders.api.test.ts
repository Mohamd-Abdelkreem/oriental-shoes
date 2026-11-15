import { beforeEach, expect, it, vi } from "vitest";
import {
  salesOrderSummarySchema,
  submissionCaptureSchema,
  returnedOrderCorrectionsSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Envelope,
  p03Pagination,
} from "@/test/p03-fixtures";
import { ordersApi } from "./orders.api";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: mocks,
}));
beforeEach(() => {
  vi.resetAllMocks();
});
const order = orderFixture(),
  summary = salesOrderSummarySchema
    .strip()
    .parse({ ...order, returnInfo: null });
const event = {
  id: p03Ids.command,
  orderId: order.id,
  orderVersion: 1,
  businessNumber: order.businessNumber,
  operation: "SUBMIT_NEW_ORDER",
  pieceIds: [p03Ids.piece],
  actor: {
    id: p03Ids.actor,
    fullName: "Sales",
    role: "USER",
    department: "SALES",
  },
  occurredAt: p03Instant,
  notes: null,
  changedFields: [
    "status",
    "businessNumber",
    "customerSnapshot",
    "prices",
    "pieces",
    "paidAmount",
  ],
  paidChange: null,
};
const command = (operation: string, version = 1) => ({
  kind: "order",
  receipt: {
    commandId: p03Ids.command,
    operation,
    resourceId: order.id,
    actor: event.actor,
    beforeVersion: version === 1 ? null : version - 1,
    afterVersion: version,
    occurredAt: p03Instant,
  },
  replayed: false,
  savedOrder: orderFixture(version),
});
it("implements every exact read method with signals and strict projected responses", async () => {
  const signal = new AbortController().signal,
    activity = {
      events: [{ kind: "order", event }],
      pagination: { ...p03Pagination, total: 1, totalPages: 1 },
    },
    query = { page: 1, limit: 25 },
    list = {
      items: [{ kind: "submitted", order: summary }],
      pagination: { ...p03Pagination, total: 1, totalPages: 1 },
      totalOrders: 1,
      totalPieces: 1,
      statusCounts: {
        DRAFT: 0,
        AWAITING_APPROVAL: 1,
        RETURNED: 0,
        APPROVED: 0,
        READY_FOR_DELIVERY: 0,
        OUT_FOR_DELIVERY: 0,
        DELIVERY_FAILED: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      },
    };
  mocks.get
    .mockResolvedValueOnce(p03Envelope(list))
    .mockResolvedValueOnce(
      p03Envelope({
        counts: {
          totalOrders: 1,
          totalPieces: 1,
          drafts: 0,
          draftPieces: 0,
          awaitingApproval: 1,
          returned: 0,
          approved: 0,
        },
        recentOrders: list.items,
      }),
    )
    .mockResolvedValueOnce(p03Envelope({ order }))
    .mockResolvedValueOnce(p03Envelope({ kind: "submitted", order }))
    .mockResolvedValueOnce(
      p03Envelope({
        orderId: order.id,
        orderVersion: 1,
        counts: order.counts,
        pieces: [
          {
            pieceId: p03Ids.piece,
            stage: "AWAITING_APPROVAL",
            workState: "INCOMING",
            receivedAt: null,
            cancelledAt: null,
            cancellationReason: null,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(p03Envelope(activity))
    .mockResolvedValueOnce(p03Envelope(activity))
    .mockResolvedValueOnce(p03Envelope({ event, before: null, after: order }));
  expect((await ordersApi.list(query, signal)).totalOrders).toBe(1);
  await ordersApi.dashboard(signal);
  await ordersApi.get(order.id, signal);
  await ordersApi.editor(order.id, signal);
  await ordersApi.tracking(order.id, signal);
  await ordersApi.activity(query, signal);
  await ordersApi.orderActivity(order.id, query, signal);
  expect(
    (await ordersApi.revision(order.id, p03Ids.command, signal)).after,
  ).toEqual(order);
  expect(mocks.get.mock.calls).toEqual([
    ["/sales-orders", { params: query, signal }],
    ["/sales-orders/dashboard", { signal }],
    [`/sales-orders/${order.id}`, { signal }],
    [`/sales-order-editor/${order.id}`, { signal }],
    [`/sales-orders/${order.id}/tracking`, { signal }],
    ["/sales-orders/activity", { params: query, signal }],
    [`/sales-orders/${order.id}/activity`, { params: query, signal }],
    [`/sales-orders/${order.id}/activity/${p03Ids.command}`, { signal }],
  ]);
});
it("sends exact new/saved/resubmit/paid commands without implicit draft writes or client authority", async () => {
  const capture = submissionCaptureSchema.parse({
      type: "SHOP",
      customerId: p03Ids.customer,
      pieces: [
        {
          id: p03Ids.piece,
          model: "SM",
          size: "40",
          leatherBase: "base",
          decoration: "زبيري - z",
          face: "standard",
        },
      ],
    }),
    input = {
      origin: "new" as const,
      commandId: p03Ids.command,
      capture,
      expectedCustomerVersion: 1,
      reviewedQuote: { sourceId: p03Ids.source, fingerprint: "a".repeat(64) },
    };
  mocks.post
    .mockResolvedValueOnce(p03Envelope(command("SUBMIT_NEW_ORDER"), 201))
    .mockResolvedValueOnce(p03Envelope(command("SUBMIT_DRAFT", 2), 201))
    .mockResolvedValueOnce(p03Envelope(command("RESUBMIT_ORDER", 2)));
  expect((await ordersApi.submit(input)).savedOrder.version).toBe(1);
  const saved = {
    ...input,
    origin: "draft" as const,
    draftId: order.id,
    expectedVersion: 1,
  };
  await ordersApi.submit(saved);
  const correction = returnedOrderCorrectionsSchema.parse({
    deliveryDate: null,
    generalNotes: null,
    responsibleSignature: null,
    repairNote: null,
    adjustmentRequested: null,
    adjustmentReason: null,
    adjustmentActionTaken: null,
    pieces: [
      {
        id: p03Ids.piece,
        model: "SM",
        size: "40",
        leatherBase: "base",
        decorationColor: null,
        faceRight: null,
        faceLeft: null,
        mixing: null,
        face: "standard",
        sole: null,
        soleAddition: null,
        soleColor: null,
        additions: null,
        aField: null,
        fField: null,
        sideNotes: null,
      },
    ],
  });
  await ordersApi.resubmit(order.id, {
    commandId: p03Ids.command,
    expectedVersion: 1,
    corrections: correction,
  });
  mocks.patch.mockResolvedValue(p03Envelope(command("SET_ORDER_PAID", 2)));
  await ordersApi.setPaid(order.id, {
    commandId: p03Ids.command,
    expectedVersion: 1,
    paidAmount: "450.50",
  });
  expect(mocks.post.mock.calls.slice(0, 2)).toEqual([
    ["/sales-orders", input],
    ["/sales-orders", saved],
  ]);
  expect(mocks.post.mock.calls[2]?.[0]).toBe(
    `/sales-orders/${order.id}/resubmit`,
  );
  expect(mocks.patch).toHaveBeenCalledWith(`/sales-orders/${order.id}/paid`, {
    commandId: p03Ids.command,
    expectedVersion: 1,
    paidAmount: "450.50",
  });
  const forged = { ...input, actorId: p03Ids.actor };
  await expect(ordersApi.submit(forged)).rejects.toThrow();
  expect(mocks.post).toHaveBeenCalledTimes(3);
});
it.each([
  { order: { ...order, private: "secret" } },
  { order: { ...order, money: { ...order.money, total: 1800 } } },
  { kind: "draft", order },
  undefined,
])(
  "rejects malformed/private successful detail instead of fallback",
  async (payload) => {
    mocks.get.mockResolvedValue(p03Envelope(payload));
    await expect(ordersApi.get(order.id)).rejects.toBeInstanceOf(
      ApiContractError,
    );
  },
);
it("keeps failed reads rejected and never probes another resource kind", async () => {
  const failure = new Error("404");
  mocks.get.mockRejectedValue(failure);
  await expect(ordersApi.editor(order.id)).rejects.toBe(failure);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

const roundedReceiptOrder = (version: number, completionPercent: number) => {
  const base = orderFixture(version),
    first = base.pieces[0];
  if (!first) throw new Error("Member required");
  return {
    ...base,
    status: "APPROVED" as const,
    counts: {
      original: 200,
      cancelled: 0,
      active: 200,
      received: 199,
      completionPercent,
    },
    money: {
      total: "360000.00",
      paidAmount: "450.50",
      remainingDue: "359549.50",
      surplus: "0.00",
    },
    pieces: Array.from({ length: 200 }, (_, index) => ({
      ...first,
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      position: index + 1,
      stage: index === 199 ? ("QUALITY" as const) : ("WAREHOUSE" as const),
      workState: "COMPLETED" as const,
      receivedAt: index === 199 ? null : p03Instant,
    })),
  };
};

it("retains earlier rounded revision facts while current reads require truthful completion", async () => {
  const historical = roundedReceiptOrder(2, 100),
    before = roundedReceiptOrder(1, 100),
    current = roundedReceiptOrder(3, 99),
    revision = {
      event: {
        ...event,
        orderVersion: 2,
        operation: "SET_ORDER_PAID",
        pieceIds: historical.pieces.map((piece) => piece.id),
        changedFields: ["paidAmount"],
        paidChange: { before: "0.00", after: "450.50" },
      },
      before: { kind: "order", order: before },
      after: historical,
    };
  mocks.get.mockResolvedValueOnce(p03Envelope(revision));
  expect(
    (await ordersApi.revision(p03Ids.order, p03Ids.command)).after.counts
      .completionPercent,
  ).toBe(100);
  mocks.get.mockResolvedValueOnce(p03Envelope({ order: historical }));
  await expect(ordersApi.get(p03Ids.order)).rejects.toBeInstanceOf(
    ApiContractError,
  );
  mocks.get.mockResolvedValueOnce(p03Envelope({ order: current }));
  expect(
    (await ordersApi.get(p03Ids.order)).order.counts.completionPercent,
  ).toBe(99);
  expect(revision.after.counts.completionPercent).toBe(100);
});
