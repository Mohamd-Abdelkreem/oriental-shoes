import { AxiosError, AxiosHeaders } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  administrationOrdersQuerySchema,
  administrationReportPrintQuerySchema,
  salesOrderStatusSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  ApiContractError,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import {
  p08AdminSession,
  p08DetailFixture,
  p08DraftDetailFixture,
} from "@/test/p08-fixtures";
import { p03Ids, p03Envelope } from "@/test/p03-fixtures";
import {
  administrationKeys,
  administrationOrderOptions,
  fetchAdministrationOrder,
  useAdministrationOrder,
  useAdministrationOrders,
  invalidateAdministrationReads,
  markAdministrationReadsStale,
} from "./administration.hooks";

const transport = vi.hoisted(() => ({
  get: vi.fn<
    (
      path: string,
      options?: { params?: unknown; signal?: AbortSignal },
    ) => Promise<unknown>
  >(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const scope = () => {
  const current = readAdministrationOperationalScope(client);
  if (!current) throw new Error("Expected current scope");
  return current;
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {
    throw new Error("Missing deferred resolution");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const emptyOrders = (query = administrationOrdersQuerySchema.parse({})) => ({
  items: [],
  pagination: {
    page: query.page,
    limit: query.limit,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: query.page > 1,
  },
  totalOrders: 0,
  totalPieces: 0,
  statusCounts: Object.fromEntries(
    ["DRAFT", ...salesOrderStatusSchema.options].map((status) => [status, 0]),
  ),
  context: { query },
});
it("keeps every order filter/page/scope in canonical keys without private drafts or credentials", () => {
  const current = scope(),
    base = administrationOrdersQuerySchema.parse({}),
    key = administrationKeys.orders(current, base);
  expect(key).toEqual([
    "p08",
    p03Ids.actor,
    1,
    current.epoch,
    "orders",
    "",
    null,
    null,
    null,
    null,
    null,
    "ALL",
    null,
    null,
    1,
    25,
  ]);
  for (const change of [
    { search: "literal_%" },
    { status: "DRAFT" },
    { type: "SHOP" },
    { department: "QUALITY" },
    { exception: "OVERDUE" },
    { salespersonId: p03Ids.customer },
    { period: "TODAY" },
    { from: "2026-11-01" },
    { to: "2026-11-06" },
    { page: 2 },
    { limit: 10 },
  ])
    expect(
      administrationKeys.orders(
        current,
        administrationOrdersQuerySchema.parse({ ...base, ...change }),
      ),
    ).not.toEqual(key);
  expect(
    administrationKeys.orders({ ...current, accessVersion: 2 }, base),
  ).not.toEqual(key);
  expect(
    administrationKeys.reportPrint(
      current,
      administrationReportPrintQuerySchema.parse({}),
    ),
  ).not.toContain("synthetic");
});
it("disables invalid/null input without GET and admits only the matching parsed scope", async () => {
  transport.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope(
        emptyOrders(administrationOrdersQuerySchema.parse(options?.params)),
      ),
    ),
  );
  const initialProps: { input: { search?: string } | null } = { input: null };
  const view = renderHook(
    ({ input }: { input: { search?: string } | null }) =>
      useAdministrationOrders(input),
    {
      wrapper,
      initialProps,
    },
  );
  expect(view.result.current.data).toBeUndefined();
  expect(transport.get).not.toHaveBeenCalled();
  view.rerender({ input: { search: "\u0000" } });
  expect(transport.get).not.toHaveBeenCalled();
  view.rerender({ input: { search: " Actual " } });
  await waitFor(() => {
    expect(view.result.current.data?.context.query.search).toBe("Actual");
  });
  act(() => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: {
        ...p08AdminSession().user,
        role: "USER",
        department: "SALES",
        staffApprovedAt: p08AdminSession().user.createdAt,
        accessVersion: 2,
      },
    });
    view.rerender({ input: { search: "Actual" } });
  });
  expect(view.result.current.data).toBeUndefined();
});
it("fresh detail admission returns the published newest version rather than a late raw promise", async () => {
  const pending = deferred<unknown>(),
    current = scope();
  transport.get.mockReturnValue(pending.promise);
  const options = administrationOrderOptions(client, current, p03Ids.order),
    fetch = fetchAdministrationOrder(client, current, p03Ids.order);
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
  client.setQueryData(options.queryKey, p08DetailFixture(4));
  pending.resolve(p03Envelope(p08DetailFixture(2)));
  expect(await fetch).toEqual(p08DetailFixture(4));
});
it("never regresses submitted detail to a late draft but accepts equal-version refreshed draft contacts", async () => {
  const current = scope(),
    options = administrationOrderOptions(client, current, p03Ids.order);
  client.setQueryData(options.queryKey, p08DetailFixture(2));
  transport.get.mockResolvedValue(p03Envelope(p08DraftDetailFixture(1)));
  expect(
    (await fetchAdministrationOrder(client, current, p03Ids.order)).kind,
  ).toBe("submitted");
  client.removeQueries({ queryKey: options.queryKey, exact: true });
  const draft = p08DraftDetailFixture(1);
  client.setQueryData(options.queryKey, draft);
  const refreshed = {
    ...draft,
    draft: {
      ...draft.draft,
      customer: {
        id: p03Ids.customer,
        name: "Current linked customer",
        phone: "+966501234567",
        email: null,
        address: null,
      },
    },
  };
  transport.get.mockResolvedValue(p03Envelope(refreshed));
  expect(await fetchAdministrationOrder(client, current, p03Ids.order)).toEqual(
    refreshed,
  );
});
it("hides malformed pre-existing cache and rejects wrong-root or malformed publication", async () => {
  const current = scope(),
    key = administrationKeys.order(current, p03Ids.order),
    pending = deferred<unknown>();
  client.setQueryData(key, { kind: "draft", draft: { id: p03Ids.order } });
  transport.get.mockReturnValue(pending.promise);
  const view = renderHook(() => useAdministrationOrder(p03Ids.order), {
    wrapper,
  });
  expect(view.result.current.data).toBeUndefined();
  expect(view.result.current.isError).toBe(true);
  pending.resolve(p03Envelope(p08DetailFixture()));
  await waitFor(() => {
    expect(view.result.current.error).toBeInstanceOf(ApiContractError);
  });
  const other = { ...p08DetailFixture(), context: { orderId: p03Ids.actor } };
  expect(() => client.setQueryData(key, other)).toThrow(ApiContractError);
});
it("rejects an old-account late response and never publishes its private detail", async () => {
  const current = scope(),
    pending = deferred<unknown>();
  transport.get.mockReturnValue(pending.promise);
  const request = fetchAdministrationOrder(client, current, p03Ids.order);
  const rejected = expect(request).rejects.toThrow();
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
  beginAuthSessionEpoch("confirmed-ending");
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: { ...p08AdminSession().user, id: p03Ids.customer },
  });
  pending.resolve(p03Envelope(p08DetailFixture()));
  await rejected;
  expect(
    client.getQueryData(administrationKeys.order(current, p03Ids.order)),
  ).toBeUndefined();
});
it("invalidates only requested details, never command receipts, and marks print without active refetch", async () => {
  const current = scope(),
    order = administrationKeys.order(current, p03Ids.order),
    other = administrationKeys.order(current, p03Ids.customer),
    print = administrationKeys.reportPrint(
      current,
      administrationReportPrintQuerySchema.parse({}),
    ),
    receipt = [
      ...administrationKeys.root(current),
      "command-receipt",
      p03Ids.command,
    ];
  client.setQueryData(order, p08DetailFixture());
  client.setQueryData(other, "unrelated detail");
  client.setQueryData(print, "private print snapshot");
  client.setQueryData(receipt, "retained result");
  const printFetch = vi.fn(() => Promise.resolve("must not refetch"));
  const observer = new QueryObserver(client, {
    queryKey: print,
    queryFn: printFetch,
    staleTime: Infinity,
  });
  const stop = observer.subscribe(() => {});
  try {
    await invalidateAdministrationReads(client, current, [p03Ids.order]);
    expect(client.getQueryState(order)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    expect(client.getQueryState(print)?.isInvalidated).toBe(true);
    expect(printFetch).not.toHaveBeenCalled();
    expect(client.getQueryData(receipt)).toBe("retained result");
    await markAdministrationReadsStale(client, current, null);
    expect(client.getQueryState(other)?.isInvalidated).toBe(true);
    expect(printFetch).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});
it("awaits active synchronization failure while retaining confirmed data and profile marking makes no GET", async () => {
  const current = scope(),
    key = administrationKeys.order(current, p03Ids.order);
  transport.get.mockResolvedValue(p03Envelope(p08DetailFixture()));
  const view = renderHook(() => useAdministrationOrder(p03Ids.order), {
    wrapper,
  });
  await waitFor(() => {
    expect(view.result.current.data?.kind).toBe("submitted");
  });
  transport.get.mockRejectedValue(new Error("Controlled read outage"));
  await expect(
    invalidateAdministrationReads(client, current, [p03Ids.order]),
  ).rejects.toThrow();
  expect(client.getQueryData(key)).toEqual(p08DetailFixture());
  transport.get.mockClear();
  await markAdministrationReadsStale(client, current, null);
  expect(transport.get).not.toHaveBeenCalled();
  view.unmount();
});

it("ignores a late restricted-account denial after the credential epoch ends", async () => {
  const current = scope();
  let reject: (error: unknown) => void = () => {
    throw new Error("Missing boundary rejection");
  };
  transport.get.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const request = fetchAdministrationOrder(client, current, p03Ids.order),
    rejected = expect(request).rejects.toThrow();
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
  beginAuthSessionEpoch("confirmed-ending");
  client.clear();
  reject(
    new AxiosError("Restricted", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 403,
      statusText: "Forbidden",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 403,
        code: "ACCOUNT_RESTRICTED",
        message: "Restricted",
        requestId: "safe",
        timestamp: "2026-11-06T00:00:00.000Z",
        path: "/api/v1/administration",
      },
    }),
  );
  await rejected;
  expect(transport.get).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeUndefined();
});
