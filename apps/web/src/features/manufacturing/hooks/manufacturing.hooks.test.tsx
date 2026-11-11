import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  manufacturingOrderHeaderSchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readManufacturingOperationalScope } from "@/shared/query/operational-scope";
import { p03Ids, p03Session } from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import {
  manufacturingKeys,
  fetchManufacturingOrder,
  manufacturingOrderOptions,
  useManufacturingOrders,
  useManufacturingPieces,
  useManufacturingGroupDetails,
} from "./manufacturing.hooks";

const transport = vi.hoisted(() => ({
  orders: vi.fn(),
  pieces: vi.fn(),
  order: vi.fn(),
}));
vi.mock("../api/manufacturing.api", () => ({ manufacturingApi: transport }));
const client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "CUTTING" },
    }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("fetches only the active list, passing cancellation and preserving canonical counts", async () => {
  const response = {
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
  };
  transport.orders.mockResolvedValue(response);
  const view = renderHook(
    () => ({
      orders: useManufacturingOrders("CUTTING", {
        view: "INCOMING",
        limit: 10,
      }),
      pieces: useManufacturingPieces("CUTTING", null),
    }),
    { wrapper },
  );
  await waitFor(() => {
    expect(view.result.current.orders.data).toEqual(response);
  });
  expect(view.result.current.pieces.data).toBeUndefined();
  expect(transport.pieces).not.toHaveBeenCalled();
  expect(transport.orders).toHaveBeenCalledWith(
    "CUTTING",
    expect.objectContaining({ page: 1, limit: 10 }),
    expect.any(AbortSignal),
  );
  view.unmount();
});
it("publishes expanded detail reactively using canonical order keys and rejects stale summaries", async () => {
  const detail = manufacturingDetailFixture(),
    { order } = detail.paper;
  const summary = {
    ...manufacturingOrderHeaderSchema.parse({
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts: order.counts,
    }),
    matchingPieceIds: [p03Ids.piece],
    matchingPieceCount: 1,
    lastWorkAt: null,
  };
  let resolve!: (result: typeof detail) => void;
  transport.order.mockReturnValue(
    new Promise<typeof detail>((yes) => {
      resolve = yes;
    }),
  );
  const view = renderHook(
    ({ ids }: { ids: string[] }) =>
      useManufacturingGroupDetails("CUTTING", [summary], ids),
    { wrapper, initialProps: { ids: [] as string[] } },
  );
  expect(transport.order).not.toHaveBeenCalled();
  act(() => {
    view.rerender({ ids: [order.id] });
  });
  await waitFor(() => {
    expect(transport.order).toHaveBeenCalledTimes(1);
  });
  act(() => {
    resolve(detail);
  });
  await waitFor(() => {
    expect(view.result.current.get(order.id)?.phase).toBe("ready");
  });
  expect(
    view.result.current.get(order.id)?.group?.rows[0]?.target.pieceId,
  ).toBe(p03Ids.piece);
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Missing scope");
  act(() => {
    client.setQueryData(
      manufacturingKeys.order(scope, order.id),
      manufacturingDetailFixture(3),
    );
  });
  await waitFor(() => {
    expect(view.result.current.get(order.id)?.phase).toBe("error");
  });
  view.unmount();
});
it("does not replace a newer detail with an older response", async () => {
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Missing scope");
  const options = manufacturingOrderOptions(client, scope, p03Ids.order);
  client.setQueryData(options.queryKey, manufacturingDetailFixture(4));
  transport.order.mockResolvedValue(manufacturingDetailFixture(2));
  const received = await fetchManufacturingOrder(client, scope, p03Ids.order);
  expect(received.paper.order.version).toBe(4);
  expect(client.getQueryData(options.queryKey)).toMatchObject({
    paper: { order: { version: 4 } },
  });
});

it("canonicalizes a valid UUID before cache construction and rejects invalid identities before transport", async () => {
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Missing scope");
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    detail = manufacturingDetailFixture();
  detail.paper.order.id = id;
  transport.order.mockResolvedValue(detail);
  const options = manufacturingOrderOptions(client, scope, id.toUpperCase());
  expect(options.queryKey).toEqual(manufacturingKeys.order(scope, id));
  await client.fetchQuery(options);
  expect(transport.order).toHaveBeenCalledWith(
    "CUTTING",
    id,
    expect.any(AbortSignal),
  );
  transport.order.mockClear();
  await expect(
    client.fetchQuery({
      ...manufacturingOrderOptions(client, scope, "invalid-order"),
      retry: false,
    }),
  ).rejects.toThrow();
  expect(transport.order).not.toHaveBeenCalled();
});
