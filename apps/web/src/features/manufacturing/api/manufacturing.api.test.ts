import {
  manufacturingDetailFixture,
  factoryReportFixture,
} from "../model/manufacturing.fixture";
import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { p03Ids, p03Instant, p03Envelope } from "@/test/p03-fixtures";
import { manufacturingApi } from "./manufacturing.api";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => vi.resetAllMocks());
const command = {
  commandId: p03Ids.command,
  operation: "RECEIVE_AND_START" as const,
  orders: [
    { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
  ],
};
const saved = {
  kind: "manufacturing-command",
  replayed: false,
  receipt: {
    commandId: p03Ids.command,
    operation: command.operation,
    department: "CUTTING",
    actor: {
      id: p03Ids.actor,
      fullName: "Worker",
      role: "USER",
      department: "CUTTING",
    },
    occurredAt: p03Instant,
  },
  outcome: {
    orders: [
      {
        orderId: p03Ids.order,
        eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        beforeVersion: 2,
        afterVersion: 3,
        pieces: [
          {
            pieceId: p03Ids.piece,
            visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            nextVisitId: null,
            stage: "CUTTING",
            workState: "IN_PROGRESS",
          },
        ],
      },
    ],
  },
};
it("sends one exact batch and observes the original immutable result", async () => {
  transport.post.mockResolvedValue(p03Envelope(saved));
  expect(await manufacturingApi.command("CUTTING", command)).toEqual(saved);
  expect(transport.post).toHaveBeenCalledWith(
    "/manufacturing/cutting/commands",
    command,
  );
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(saved));
  expect(await manufacturingApi.observeWork(command.commandId, signal)).toEqual(
    saved,
  );
  expect(transport.get).toHaveBeenCalledWith(
    `/manufacturing-commands/${command.commandId}`,
    { signal },
  );
});
it.each([
  { ...saved, privateNotes: "secret" },
  {
    ...saved,
    receipt: {
      ...saved.receipt,
      department: "PRODUCTION",
      actor: { ...saved.receipt.actor, department: "PRODUCTION" },
    },
  },
  { ...saved, receipt: { ...saved.receipt, commandId: p03Ids.order } },
  {
    ...saved,
    receipt: {
      ...saved.receipt,
      actor: { ...saved.receipt.actor, role: "OWNER" },
    },
  },
  {
    ...saved,
    outcome: {
      orders: saved.outcome.orders.map((order) => ({
        ...order,
        beforeVersion: 3,
        afterVersion: 4,
      })),
    },
  },
])("rejects malformed/private/mismatched saved results", async (response) => {
  transport.post.mockResolvedValue(p03Envelope(response));
  await expect(manufacturingApi.command("CUTTING", command)).rejects.toThrow(
    ApiContractError,
  );
});
it.each([
  [
    "orders",
    (
      department: "CUTTING",
      query: { view: "INCOMING"; page: number; limit: number; search?: string },
      signal?: AbortSignal,
    ) => manufacturingApi.orders(department, query, signal),
    {
      department: "CUTTING",
      view: "INCOMING",
      items: [],
      counts: { orders: 0, pieces: 0 },
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
  ],
  [
    "pieces",
    (
      department: "CUTTING",
      query: { view: "INCOMING"; page: number; limit: number; search?: string },
      signal?: AbortSignal,
    ) => manufacturingApi.pieces(department, query, signal),
    {
      department: "CUTTING",
      view: "INCOMING",
      items: [],
      counts: { orders: 0, pieces: 0 },
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
  ],
] as const)(
  "binds %s to the exact department/view/query and abort signal",
  async (endpoint, read, response) => {
    const signal = new AbortController().signal;
    transport.get.mockResolvedValue(p03Envelope(response));
    expect(
      await read(
        "CUTTING",
        { view: "INCOMING", page: 1, limit: 10, search: "  " },
        signal,
      ),
    ).toEqual(response);
    expect(transport.get).toHaveBeenCalledWith(
      `/manufacturing/cutting/${endpoint}`,
      {
        signal,
        params: { view: "INCOMING", page: 1, limit: 10, search: undefined },
      },
    );
    transport.get.mockResolvedValue(
      p03Envelope({ ...response, department: "PRODUCTION" }),
    );
    await expect(
      read("CUTTING", { view: "INCOMING", page: 1, limit: 10 }),
    ).rejects.toThrow(ApiContractError);
  },
);

it("binds dashboard, detail and paged histories and refuses private or foreign empty results", async () => {
  const detail = manufacturingDetailFixture(),
    signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(detail));
  expect(await manufacturingApi.order("CUTTING", p03Ids.order, signal)).toEqual(
    detail,
  );
  transport.get.mockResolvedValue(
    p03Envelope({
      ...detail,
      paper: {
        ...detail.paper,
        order: { ...detail.paper.order, phone: "private" },
      },
    }),
  );
  await expect(manufacturingApi.order("CUTTING", p03Ids.order)).rejects.toThrow(
    ApiContractError,
  );
  const zero = { orders: 0, pieces: 0 };
  const dashboard = {
    department: "CUTTING",
    counts: {
      incoming: zero,
      inProgress: zero,
      returned: zero,
      completed: zero,
      repairs: zero,
    },
    recentOrders: [],
  };
  transport.get.mockResolvedValue(p03Envelope(dashboard));
  expect(await manufacturingApi.dashboard("CUTTING", signal)).toEqual(
    dashboard,
  );
  const activity = {
    department: "CUTTING",
    events: [],
    pagination: {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  transport.get.mockResolvedValue(p03Envelope(activity));
  await manufacturingApi.activity(
    "CUTTING",
    { actor: "me", page: 1, limit: 25 },
    signal,
  );
  expect(transport.get).toHaveBeenLastCalledWith(
    "/manufacturing/cutting/activity",
    { signal, params: { actor: "me", page: 1, limit: 25 } },
  );
  transport.get.mockResolvedValue(
    p03Envelope({ ...activity, orderId: p03Ids.order }),
  );
  await manufacturingApi.orderHistory(
    "CUTTING",
    p03Ids.order,
    { pieceId: p03Ids.piece, page: 1, limit: 25 },
    signal,
  );
  expect(transport.get).toHaveBeenLastCalledWith(
    `/manufacturing/cutting/orders/${p03Ids.order}/history`,
    { signal, params: { pieceId: p03Ids.piece, page: 1, limit: 25 } },
  );
  transport.get.mockResolvedValue(
    p03Envelope({ ...activity, orderId: p03Ids.actor }),
  );
  await expect(
    manufacturingApi.orderHistory("CUTTING", p03Ids.order, {
      page: 1,
      limit: 25,
    }),
  ).rejects.toThrow(ApiContractError);
});

it("reuses the exact P04 report/observation protocol and binds the piece/version", async () => {
  const body = {
      commandId: p03Ids.command,
      expectedVersion: 2,
      reason: "عيب",
      notes: null,
    },
    result = factoryReportFixture(),
    signal = new AbortController().signal;
  transport.post.mockResolvedValue(p03Envelope(result));
  expect(
    await manufacturingApi.reportIssue(p03Ids.order, p03Ids.piece, body),
  ).toEqual(result);
  expect(transport.post).toHaveBeenLastCalledWith(
    `/manufacturing-orders/${p03Ids.order}/pieces/${p03Ids.piece}/issues`,
    expect.objectContaining(body),
  );
  transport.get.mockResolvedValue(p03Envelope(result));
  await manufacturingApi.observeReport(p03Ids.command, signal);
  expect(transport.get).toHaveBeenLastCalledWith(
    `/approval-commands/${p03Ids.command}`,
    { signal },
  );
  transport.post.mockResolvedValue(
    p03Envelope({
      ...result,
      outcome: { ...result.outcome, pieceId: p03Ids.actor },
    }),
  );
  await expect(
    manufacturingApi.reportIssue(p03Ids.order, p03Ids.piece, body),
  ).rejects.toThrow(ApiContractError);
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
    department: "CUTTING",
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
    (
      await manufacturingApi.orderHistory("CUTTING", p03Ids.order, {
        page: 1,
        limit: 25,
      })
    ).events,
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
      manufacturingApi.orderHistory("CUTTING", p03Ids.order, {
        page: 1,
        limit: 25,
      }),
    ).rejects.toThrow(ApiContractError);
  }
  transport.get.mockResolvedValue(
    p03Envelope({
      department: "CUTTING",
      events: page.events,
      pagination: page.pagination,
    }),
  );
  await expect(
    manufacturingApi.activity("CUTTING", { actor: "me", page: 1, limit: 25 }),
  ).rejects.toThrow(ApiContractError);
});
