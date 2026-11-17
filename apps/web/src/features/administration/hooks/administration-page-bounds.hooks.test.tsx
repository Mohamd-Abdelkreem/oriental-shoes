import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  administrationOrdersQuerySchema,
  draftSummarySchema,
  salesOrderStatusSchema,
  administrationOrderHistoryQuerySchema,
  administrationActivityQuerySchema,
  type AdministrationOrdersQuery,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  readAdministrationOperationalScope,
  type AdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import { DataTablePagination } from "@/features/prototype/components/data-table-pagination";
import { p08AdminSession } from "@/test/p08-fixtures";
import { draftFixture, p03Ids, p03Envelope } from "@/test/p03-fixtures";
import {
  administrationKeys,
  useAdministrationOrders,
} from "./administration.hooks";
import { useAdministrationPageBounds } from "./administration-page-bounds.hooks";

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
let client = createQueryClient(),
  scope: AdministrationOperationalScope;
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
  const current = readAdministrationOperationalScope(client);
  if (!current) throw new Error("Expected ADMIN scope");
  scope = current;
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const ordersPage = (total: number, query: AdministrationOrdersQuery) => {
  const count = Math.min(
    query.limit,
    Math.max(0, total - (query.page - 1) * query.limit),
  );
  return {
    items: Array.from({ length: count }, (_, index) => ({
      kind: "draft",
      draft: draftSummarySchema.strip().parse({
        ...draftFixture(),
        id: `00000000-0000-4000-8000-${String(index + (query.page - 1) * query.limit + 1).padStart(12, "0")}`,
        pieceCount: 1,
      }),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      hasNextPage: query.page < Math.ceil(total / query.limit),
      hasPreviousPage: query.page > 1,
    },
    totalOrders: total,
    totalPieces: total,
    statusCounts: Object.fromEntries(
      ["DRAFT", ...salesOrderStatusSchema.options].map((status) => [
        status,
        status === "DRAFT" ? total : 0,
      ]),
    ),
    context: { query },
  };
};
const pageKey = (page: number, search = "") =>
  administrationKeys.orders(
    scope,
    administrationOrdersQuerySchema.parse({ page, search }),
  );
function Harness({
  search = "",
  initialPage = 1,
  onNavigate,
}: {
  search?: string;
  initialPage?: number;
  onNavigate?: (page: number) => void;
}) {
  const [page, setPage] = useState(initialPage),
    query = administrationOrdersQuerySchema.parse({ page, search }),
    orders = useAdministrationOrders(query);
  const bounds = useAdministrationPageBounds({
    resource: "orders",
    query,
    currentKey: administrationKeys.orders(scope, query),
    current: {
      data: orders.data,
      status: orders.status,
      fetchStatus: orders.fetchStatus,
    },
    scope,
    onNavigate: (next) => {
      onNavigate?.(next);
      setPage(next);
    },
  });
  return (
    <>
      <p role={orders.isError ? "alert" : "status"}>
        {orders.isError ? "Read failed" : bounds.pending ? "Loading" : "Ready"}
      </p>
      <output>
        {bounds.total === null
          ? "No metadata"
          : `Total ${String(bounds.total)}`}
      </output>
      {bounds.totalPages !== null && bounds.total !== null && (
        <DataTablePagination
          currentPage={bounds.page}
          totalPages={bounds.totalPages}
          totalCount={bounds.total}
          onPreviousPage={() => {
            bounds.navigate(bounds.page - 1);
          }}
          onNextPage={() => {
            bounds.navigate(bounds.page + 1);
          }}
          onPageChange={bounds.navigate}
        />
      )}
    </>
  );
}
const gate = () => {
  let resolve: (value: unknown) => void = () => {
      throw new Error("Missing resolution");
    },
    reject: (error: unknown) => void = () => {
      throw new Error("Missing rejection");
    };
  const promise = new Promise<unknown>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
it.each([
  { tamper: "removed", failed: false },
  { tamper: "malformed", failed: false },
  { tamper: "wrong-context", failed: false },
  { tamper: "removed", failed: true },
  { tamper: "malformed", failed: true },
  { tamper: "wrong-context", failed: true },
])(
  "withdraws $tamper remembered bounds during failed=$failed and blocks a click queued before notification",
  async ({ tamper, failed }) => {
    const pending = gate();
    transport.get.mockImplementation((_path, options) => {
      const query = administrationOrdersQuerySchema.parse(options?.params);
      return query.page === 2
        ? pending.promise
        : Promise.resolve(p03Envelope(ordersPage(75, query)));
    });
    const view = render(<Harness />, { wrapper });
    try {
      fireEvent.click(await screen.findByRole("button", { name: "2" }));
      if (failed) {
        pending.reject(new Error("Controlled read failure"));
        await screen.findByRole("alert");
      }
      const third = screen.getByRole("button", { name: "3" });
      act(() => {
        const key = pageKey(1);
        if (tamper === "removed")
          client.removeQueries({ queryKey: key, exact: true });
        else {
          const cached = client
            .getQueryCache()
            .find({ queryKey: key, exact: true });
          if (!cached) throw new Error("Expected retained metadata");
          cached.setState({
            data:
              tamper === "malformed"
                ? { pagination: null }
                : ordersPage(
                    75,
                    administrationOrdersQuerySchema.parse({ type: "REPAIR" }),
                  ),
          });
        }
        fireEvent.click(third);
      });
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "الصفحة التالية" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByText("No metadata")).toBeInTheDocument();
      expect(
        transport.get.mock.calls.some(
          ([, options]) =>
            administrationOrdersQuerySchema.parse(options?.params).page === 3,
        ),
      ).toBe(false);
    } finally {
      pending.resolve(
        p03Envelope(
          ordersPage(0, administrationOrdersQuerySchema.parse({ page: 2 })),
        ),
      );
      view.unmount();
      await act(async () => {
        await Promise.allSettled([pending.promise]);
      });
    }
  },
);
it("prefers smaller current totals even when old metadata changes or disappears", async () => {
  transport.get.mockImplementation((_path, options) => {
    const query = administrationOrdersQuerySchema.parse(options?.params);
    return Promise.resolve(
      p03Envelope(ordersPage(query.page === 1 ? 75 : 26, query)),
    );
  });
  render(<Harness />, { wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "2" }));
  await screen.findByText("Total 26");
  act(() => {
    const cached = client
      .getQueryCache()
      .find({ queryKey: pageKey(1), exact: true });
    if (!cached) throw new Error("Expected previous page");
    cached.setState({
      data: ordersPage(5000, administrationOrdersQuerySchema.parse({})),
    });
  });
  expect(screen.queryByRole("button", { name: "3" })).not.toBeInTheDocument();
  act(() => {
    client.removeQueries({ queryKey: pageKey(1), exact: true });
  });
  expect(screen.getByText("Total 26")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
it("invalidates a cached destination before recovering an authoritative out-of-range page", async () => {
  client.setQueryData(
    pageKey(2),
    ordersPage(75, administrationOrdersQuerySchema.parse({ page: 2 })),
  );
  transport.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope(
        ordersPage(26, administrationOrdersQuerySchema.parse(options?.params)),
      ),
    ),
  );
  const invalidated = vi.fn((page: number) => {
    expect(client.getQueryState(pageKey(page))?.isInvalidated).toBe(true);
  });
  render(<Harness initialPage={3} onNavigate={invalidated} />, { wrapper });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    ),
  );
  expect(invalidated).toHaveBeenCalledWith(2);
  expect(
    transport.get.mock.calls.some(
      ([, options]) =>
        administrationOrdersQuerySchema.parse(options?.params).page === 2,
    ),
  ).toBe(true);
  await waitFor(() => {
    expect(client.getQueryState(pageKey(2))?.isInvalidated).toBe(false);
  });
});
it("drops remembered metadata on filter/scope changes and never borrows another history root or page", async () => {
  transport.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope(
        ordersPage(75, administrationOrdersQuerySchema.parse(options?.params)),
      ),
    ),
  );
  const view = render(<Harness />, { wrapper });
  await screen.findByRole("button", { name: "3" });
  const pending = gate();
  transport.get.mockReturnValue(pending.promise);
  view.rerender(<Harness search="new cohort" />);
  await waitFor(() =>
    expect(screen.getByText("No metadata")).toBeInTheDocument(),
  );
  act(() => {
    beginAuthSessionEpoch("confirmed-ending");
    view.rerender(<Harness search="new cohort" />);
  });
  expect(screen.getByText("No metadata")).toBeInTheDocument();
  pending.resolve(
    p03Envelope(
      ordersPage(
        0,
        administrationOrdersQuerySchema.parse({ search: "new cohort" }),
      ),
    ),
  );
  view.unmount();
});
it("binds history root and both key and pagination context before exposing empty bounds", () => {
  const query = administrationOrderHistoryQuerySchema.parse({}),
    key = administrationKeys.orderHistory(scope, p03Ids.order, query),
    data = {
      events: [],
      pagination: {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      context: { orderId: p03Ids.order, query },
    };
  client.setQueryData(key, data);
  const view = renderHook(
    ({ orderId }) =>
      useAdministrationPageBounds({
        resource: "order-history",
        query: { orderId, query },
        currentKey: key,
        current: { data, status: "success", fetchStatus: "idle" },
        scope,
        onNavigate: () => {},
      }),
    { wrapper, initialProps: { orderId: p03Ids.order } },
  );
  expect(view.result.current.total).toBe(0);
  view.rerender({ orderId: p03Ids.customer });
  expect(view.result.current.total).toBeNull();
  view.unmount();
  const activityQuery = administrationActivityQuerySchema.parse({}),
    activityKey = administrationKeys.activity(scope, activityQuery),
    bad = {
      events: [],
      pagination: { ...data.pagination, page: 2, hasPreviousPage: true },
      context: { query: activityQuery },
    };
  const activity = renderHook(
    () =>
      useAdministrationPageBounds({
        resource: "activity",
        query: activityQuery,
        currentKey: activityKey,
        current: { data: bad, status: "success", fetchStatus: "idle" },
        scope,
        onNavigate: () => {},
      }),
    { wrapper },
  );
  expect(activity.result.current.total).toBeNull();
  activity.unmount();
});
