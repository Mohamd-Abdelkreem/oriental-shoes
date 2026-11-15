import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  warehouseOrderDataSchema,
  warehouseOrdersQuerySchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  readWarehouseOperationalScope,
  warehouseScopeKey,
} from "@/shared/query/operational-scope";
import {
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  warehouseKeys,
  warehouseOrderOptions,
  fetchWarehouseOrder,
  useWarehouseOrders,
  useWarehousePieces,
  useWarehouseGroupDetails,
  invalidateWarehouseReads,
} from "./warehouse.hooks";

const transport = vi.hoisted(() => ({
  get: vi.fn<
    (
      path: string,
      options?: { signal?: AbortSignal; params?: unknown },
    ) => Promise<unknown>
  >(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const detail = (version = 2) => {
  const original = manufacturingDetailFixture(version).paper.order,
    counts = {
      ...original.counts,
      received: original.counts.active,
      completionPercent: 100,
    },
    order = {
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
      version,
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
const empty = {
  department: "WAREHOUSE",
  view: "READY",
  orders: [],
  counts: { orders: 0, pieces: 0 },
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};
beforeEach(() => {
  client = createQueryClient();
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "WAREHOUSE" },
    }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("reads only the active server-filtered view and keeps inactive reads and current-scope keys separate", async () => {
  transport.get.mockResolvedValue(p03Envelope(empty));
  const view = renderHook(
    () => ({
      orders: useWarehouseOrders({ view: "READY", limit: 10 }),
      pieces: useWarehousePieces(null),
    }),
    { wrapper },
  );
  try {
    await waitFor(() => {
      expect(view.result.current.orders.data).toEqual(empty);
    });
    expect(view.result.current.pieces.data).toBeUndefined();
    expect(transport.get).toHaveBeenCalledTimes(1);
    expect(transport.get.mock.calls[0]?.[1]?.signal).toBeInstanceOf(
      AbortSignal,
    );
    const scope = readWarehouseOperationalScope(client);
    if (!scope) throw new Error("Scope required");
    const query = warehouseOrdersQuerySchema.parse({
      view: "READY",
      limit: 10,
    });
    expect(warehouseKeys.orders(scope, query)).not.toEqual(
      warehouseKeys.orders(
        { ...scope, accessVersion: scope.accessVersion + 1 },
        query,
      ),
    );
    expect(warehouseKeys.orders(scope, query)).not.toEqual(
      warehouseKeys.orders(scope, { ...query, search: "model" }),
    );
  } finally {
    view.unmount();
  }
});
it("preserves a newer detail when fresh preparation receives an older response and refuses obsolete epoch publication", async () => {
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  const options = warehouseOrderOptions(client, scope, p03Ids.order);
  client.setQueryData(options.queryKey, detail(5));
  transport.get.mockResolvedValue(p03Envelope(detail(2)));
  expect(
    (await fetchWarehouseOrder(client, scope, p03Ids.order)).summary.version,
  ).toBe(5);
  let release: (response: ReturnType<typeof p03Envelope>) => void = () => {};
  const gate = new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
    release = resolve;
  });
  transport.get.mockImplementation(async () => gate);
  const original = client.fetchQuery({
    ...options,
    staleTime: 0,
    retry: false,
  });
  const settled = original.then(
    () => "published",
    () => "rejected",
  );
  try {
    await waitFor(() => {
      expect(transport.get).toHaveBeenCalledTimes(2);
    });
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("new synthetic", epoch, p03Ids.actor);
    release(p03Envelope(detail(6)));
    expect(await settled).toBe("rejected");
    expect(client.getQueryData(options.queryKey)).toEqual(detail(5));
  } finally {
    release(p03Envelope(detail(6)));
    await settled;
  }
});
it("demands only expanded matching groups and removes actionable rows on a changed revision", async () => {
  const current = detail(),
    summary = current.summary;
  transport.get.mockResolvedValue(p03Envelope(current));
  const view = renderHook(
    ({ ids }: { ids: string[] }) => useWarehouseGroupDetails([summary], ids),
    { wrapper, initialProps: { ids: new Array<string>() } },
  );
  try {
    expect(transport.get).not.toHaveBeenCalled();
    act(() => {
      view.rerender({ ids: [summary.id] });
    });
    await waitFor(() => {
      expect(view.result.current.get(summary.id)?.phase).toBe("ready");
    });
    const scope = readWarehouseOperationalScope(client);
    if (!scope) throw new Error("Scope required");
    act(() => {
      client.setQueryData(warehouseKeys.order(scope, summary.id), detail(3));
    });
    await waitFor(() => {
      expect(view.result.current.get(summary.id)).toMatchObject({
        phase: "error",
        group: null,
      });
    });
  } finally {
    view.unmount();
  }
  const summaries = Array.from({ length: 11 }, (_, index) => ({
    ...summary,
    id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  }));
  expect(() =>
    renderHook(
      () =>
        useWarehouseGroupDetails(
          summaries,
          summaries.map((group) => group.id),
        ),
      { wrapper },
    ),
  ).toThrow();
});
it("marks the actual final-page destination stale and refetches it rather than displaying an old cached page", async () => {
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  const query = warehouseOrdersQuerySchema.parse({
      view: "READY",
      limit: 10,
      page: 2,
    }),
    destination = {
      ...empty,
      orders: [detail().summary],
      counts: { orders: 11, pieces: 11 },
      pagination: {
        page: 2,
        limit: 10,
        total: 11,
        totalPages: 2,
        hasPreviousPage: true,
        hasNextPage: false,
      },
    };
  client.setQueryData(warehouseKeys.orders(scope, query), destination);
  transport.get.mockImplementation((_path, options) => {
    const params = warehouseOrdersQuerySchema.parse(options?.params);
    return Promise.resolve(
      p03Envelope(
        params.page === 4
          ? {
              ...destination,
              orders: [],
              pagination: { ...destination.pagination, page: 4 },
            }
          : { ...destination, orders: [detail(3).summary] },
      ),
    );
  });
  const view = renderHook(
    ({ page }) => useWarehouseOrders({ view: "READY", limit: 10, page }),
    { wrapper, initialProps: { page: 4 } },
  );
  try {
    await waitFor(() => {
      expect(view.result.current.data?.pagination.totalPages).toBe(2);
    });
    expect(
      client.getQueryState(warehouseKeys.orders(scope, query))?.isInvalidated,
    ).toBe(true);
    act(() => {
      view.rerender({ page: 2 });
    });
    await waitFor(() => {
      expect(view.result.current.data?.orders[0]?.version).toBe(3);
    });
  } finally {
    view.unmount();
  }
});
it("refreshes active reads and stales only affected inactive details without erasing the command slot", async () => {
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  transport.get.mockResolvedValueOnce(p03Envelope(empty));
  transport.get.mockResolvedValue(
    p03Envelope({
      ...empty,
      orders: [detail().summary],
      counts: { orders: 1, pieces: 1 },
      pagination: { ...empty.pagination, total: 1, totalPages: 1 },
    }),
  );
  const view = renderHook(
    () => useWarehouseOrders({ view: "READY", limit: 10 }),
    { wrapper },
  );
  const slot = [...warehouseScopeKey(scope), "command-session"],
    receipt = [...warehouseScopeKey(scope), "command-receipt", p03Ids.command];
  client.setQueryData(slot, { phase: "unknown", original: "preserved" });
  client.setQueryData(receipt, "saved");
  client.setQueryData(warehouseKeys.order(scope, p03Ids.order), detail());
  client.setQueryData(warehouseKeys.order(scope, p03Ids.source), "unaffected");
  try {
    await waitFor(() => {
      expect(view.result.current.data?.counts.orders).toBe(0);
    });
    await act(() => invalidateWarehouseReads(client, scope, [p03Ids.order]));
    await waitFor(() => {
      expect(view.result.current.data?.counts.orders).toBe(1);
    });
    expect(
      client.getQueryState(warehouseKeys.order(scope, p03Ids.order))
        ?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(warehouseKeys.order(scope, p03Ids.source))
        ?.isInvalidated,
    ).toBe(false);
    expect(client.getQueryData(slot)).toEqual({
      phase: "unknown",
      original: "preserved",
    });
    expect(client.getQueryData(receipt)).toBe("saved");
  } finally {
    view.unmount();
  }
});
