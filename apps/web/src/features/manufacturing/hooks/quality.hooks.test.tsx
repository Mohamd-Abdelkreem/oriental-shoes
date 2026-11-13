import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  qualityOrderDataSchema,
  qualityOrderHeaderSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  ApiContractError,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { readQualityOperationalScope } from "@/shared/query/operational-scope";
import { p03Ids, p03Session, p03Envelope } from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import {
  qualityKeys,
  qualityOrderOptions,
  fetchQualityOrder,
  useQualityOrders,
  useQualityPieces,
  useQualityGroupDetails,
} from "./quality.hooks";

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
const client = createQueryClient(),
  wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
const detail = (version = 2) => {
  const source = manufacturingDetailFixture(version),
    paper = {
      ...source.paper,
      order: {
        ...source.paper.order,
        pieces: source.paper.order.pieces.map((piece) => ({
          ...piece,
          stage: "QUALITY",
        })),
      },
    };
  return qualityOrderDataSchema.parse({
    department: "QUALITY",
    paper,
    packingGroups: [],
    work: paper.order.pieces.map((piece) => ({
      pieceId: piece.id,
      visit: null,
      lastAction: null,
      currentCorrection: null,
      latestInspection: null,
      allowedActions: {
        canReceiveAndStart: true,
        canContinue: false,
        canInspect: false,
        canReportIssue: true,
      },
    })),
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "QUALITY" },
    }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("reads only the active list through the real adapter with normalized scope keys and cancellation", async () => {
  const response = {
    department: "QUALITY",
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
  transport.get.mockResolvedValue(p03Envelope(response));
  const view = renderHook(
    () => ({
      orders: useQualityOrders({ view: "INCOMING", limit: 10 }),
      pieces: useQualityPieces(null),
    }),
    { wrapper },
  );
  await waitFor(() => {
    expect(view.result.current.orders.data).toEqual(response);
  });
  expect(view.result.current.pieces.data).toBeUndefined();
  expect(transport.get).toHaveBeenCalledTimes(1);
  expect(transport.get.mock.calls[0]?.[0]).toBe("/quality/orders");
  expect(transport.get.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  view.unmount();
});
it("returns the newer published cache detail instead of a delayed older transport result", async () => {
  const scope = readQualityOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  const options = qualityOrderOptions(client, scope, p03Ids.order);
  client.setQueryData(options.queryKey, detail(5));
  transport.get.mockResolvedValue(p03Envelope(detail(2)));
  expect(
    (await fetchQualityOrder(client, scope, p03Ids.order)).paper.order.version,
  ).toBe(5);
  expect(client.getQueryData(options.queryKey)).toEqual(detail(5));
  transport.get.mockClear();
  await expect(
    client.fetchQuery({
      ...qualityOrderOptions(client, scope, "invalid"),
      retry: false,
    }),
  ).rejects.toThrow(ApiContractError);
  expect(transport.get).not.toHaveBeenCalled();
});
it("hydrates only demanded matching groups and removes actionable rows on a version mismatch", async () => {
  const data = detail(),
    { order } = data.paper,
    header = qualityOrderHeaderSchema.parse({
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts: order.counts,
    }),
    summary = {
      ...header,
      matchingPieceIds: [p03Ids.piece],
      matchingPieceCount: 1,
      lastWorkAt: null,
    };
  transport.get.mockResolvedValue(p03Envelope(data));
  const view = renderHook(
    ({ ids }: { ids: string[] }) => useQualityGroupDetails([summary], ids),
    { wrapper, initialProps: { ids: new Array<string>() } },
  );
  expect(transport.get).not.toHaveBeenCalled();
  act(() => {
    view.rerender({ ids: [order.id] });
  });
  await waitFor(() => {
    expect(view.result.current.get(order.id)?.phase).toBe("ready");
  });
  const scope = readQualityOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  act(() => {
    client.setQueryData(qualityKeys.order(scope, order.id), detail(3));
  });
  await waitFor(() => {
    expect(view.result.current.get(order.id)).toMatchObject({
      phase: "error",
      group: null,
    });
  });
  view.unmount();
});
it("refuses old-account publication after the same actor advances to another credential epoch", async () => {
  const scope = readQualityOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  let release: (response: ReturnType<typeof p03Envelope>) => void = () => {
    throw new Error("Owned gate unavailable");
  };
  transport.get.mockImplementation(
    () =>
      new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
        release = resolve;
      }),
  );
  const pending = fetchQualityOrder(client, scope, p03Ids.order).then(
    (value) => ({ kind: "saved", value }),
    (error: unknown) => ({ kind: "failure", error }),
  );
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("new-synthetic", epoch, p03Ids.actor);
  release(p03Envelope(detail()));
  expect(await pending).toMatchObject({ kind: "failure" });
  expect(
    client.getQueryData(qualityKeys.order(scope, p03Ids.order)),
  ).toBeUndefined();
});
