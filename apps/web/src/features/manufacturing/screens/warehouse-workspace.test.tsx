import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  authUserDataSchema,
  warehouseOrderDataSchema,
  warehouseOrdersDataSchema,
  warehouseOrdersQuerySchema,
  warehouseActivityEventSchema,
  type WarehouseCommandOperation,
  type WarehouseView,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { warehouseKeys } from "@/features/warehouse/hooks/warehouse.hooks";
import { readWarehouseOperationalScope } from "@/shared/query/operational-scope";
import { createQueryClient } from "@/shared/query/query-client";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import {
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import { WarehouseWorkspace } from "./warehouse-workspace";

const navigation = vi.hoisted(() => ({ path: "/warehouse/incoming" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
const transport = vi.hoisted(() => ({
  get: vi.fn<
    (
      path: string,
      options?: { params?: Record<string, unknown> },
    ) => Promise<unknown>
  >(),
  post: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </StrictMode>
);
const actor = {
  id: p03Ids.actor,
  fullName: "Warehouse colleague",
  role: "USER",
  department: "WAREHOUSE",
};
const detailFixture = (operation: WarehouseCommandOperation) => {
  const original = manufacturingDetailFixture().paper.order,
    received = operation !== "RECEIVE",
    outbound =
      operation === "CONFIRM_DELIVERY" || operation === "FAIL_DELIVERY",
    failed = operation === "RETRY_DELIVERY";
  const counts = {
    ...original.counts,
    received: received ? original.counts.active : 0,
    completionPercent: received ? 100 : 0,
  };
  const order = {
    ...original,
    status: outbound
      ? "OUT_FOR_DELIVERY"
      : failed
        ? "DELIVERY_FAILED"
        : received
          ? "READY_FOR_DELIVERY"
          : "APPROVED",
    counts,
    pieces: original.pieces.map((piece) => ({
      ...piece,
      stage: "WAREHOUSE",
      workState: received ? "COMPLETED" : "INCOMING",
      receivedAt: received ? p03Instant : null,
    })),
  };
  const attempt =
    outbound || failed
      ? {
          id: p03Ids.source,
          orderId: order.id,
          number: 1,
          pieceIds: order.pieces.map((piece) => piece.id),
          status: failed ? "FAILED" : "DISPATCHED",
          dispatchedBy: actor,
          dispatchedAt: p03Instant,
          deliveryNote: null,
          outcome: failed
            ? {
                id: p03Ids.command,
                kind: "FAILED",
                recordedBy: actor,
                recordedAt: p03Instant,
                notes: null,
                reason: "Customer unavailable",
                returnedToWarehouse: true,
              }
            : null,
          retry: null,
        }
      : null;
  const detail = warehouseOrderDataSchema.parse({
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
        canDispatch: operation === "DISPATCH",
        canConfirmDelivery: outbound,
        canFailDelivery: outbound,
        canRetryDelivery: failed,
      },
      currentAttemptId: attempt?.id ?? null,
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
      acceptedHandoff: received
        ? null
        : {
            eventId: p03Ids.command,
            commandId: p03Ids.command,
            acceptedAt: p03Instant,
            actor: { ...actor, department: "QUALITY" },
            packingGroupId: null,
          },
      receiptGroupId: null,
      receivedAt: piece.receivedAt,
      legacyReceipt: received,
      allowedActions: { canReceive: !received },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: attempt,
  });
  return detail;
};

const rejection = (status: number, code: string) => {
  const error = new AxiosError("Owned failure");
  error.response = {
    status,
    statusText: "Failure",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "PRIVATE FAILURE MUST NOT RENDER",
      requestId: "owned",
      timestamp: p03Instant,
      path: "/warehouse/commands",
    },
  };
  return error;
};

const pagination = (total: number, page = 1, limit = 10) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPreviousPage: page > 1,
});
const pageFor = (view: WarehouseView, empty = false) => {
  const operation =
    view === "READY"
      ? "DISPATCH"
      : view === "OUT_FOR_DELIVERY"
        ? "CONFIRM_DELIVERY"
        : view === "DELIVERY_FAILED"
          ? "RETRY_DELIVERY"
          : "RECEIVE";
  const detail = detailFixture(operation),
    summary =
      view === "DELIVERED"
        ? {
            ...detailFixture("DISPATCH").summary,
            status: "DELIVERED",
            allowedActions: {
              canDispatch: false,
              canConfirmDelivery: false,
              canFailDelivery: false,
              canRetryDelivery: false,
            },
            currentAttemptId: p03Ids.source,
          }
        : detail.summary;
  return {
    department: "WAREHOUSE",
    view,
    orders: empty ? [] : [summary],
    counts: { orders: empty ? 0 : 1, pieces: empty ? 0 : 1 },
    pagination: pagination(empty ? 0 : 1),
  };
};
const groupedPage = (total: number, page = 1) => {
  const base = pageFor("INCOMING");
  const summary = detailFixture("RECEIVE").summary;
  return warehouseOrdersDataSchema.parse({
    ...base,
    orders: Array.from(
      { length: Math.min(10, Math.max(0, total - (page - 1) * 10)) },
      (_, index) => ({
        ...summary,
        id: `20000000-0000-4000-8000-${String((page - 1) * 10 + index + 1).padStart(12, "0")}`,
      }),
    ),
    counts: { orders: total, pieces: total },
    pagination: pagination(total, page),
  });
};
beforeEach(() => {
  client = createQueryClient();
  vi.resetAllMocks();
  navigation.path = "/warehouse/incoming";
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
it.each([
  ["incoming", "INCOMING"],
  ["incomplete", "INCOMPLETE"],
  ["ready", "READY"],
  ["in-progress", "READY"],
  ["out-for-delivery", "OUT_FOR_DELIVERY"],
  ["delivery-failed", "DELIVERY_FAILED"],
  ["delivered", "DELIVERED"],
] as const)(
  "maps %s to canonical %s without a local provider",
  async (path, view) => {
    navigation.path = `/warehouse/${path}`;
    transport.get.mockResolvedValue(p03Envelope(pageFor(view)));
    render(<WarehouseWorkspace />, { wrapper });
    await screen.findByRole("link", { name: "عرض أمر التفصيل" });
    expect(transport.get).toHaveBeenCalledWith(
      "/warehouse/orders",
      expect.objectContaining({ params: { view, page: 1, limit: 10 } }),
    );
    expect(screen.getByText(/النطاق المطابق:/)).toHaveTextContent(
      "1 أمر تفصيل · 1 قطعة",
    );
    expect(transport.post).not.toHaveBeenCalled();
  },
);
it("distinguishes a failed authoritative queue from a real empty response", async () => {
  transport.get.mockRejectedValue(rejection(422, "READ_FAILED"));
  const view = render(<WarehouseWorkspace />, { wrapper });
  await screen.findByRole("alert");
  expect(
    screen.queryByText("لا توجد أوامر مطابقة في هذا القسم."),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("PRIVATE FAILURE MUST NOT RENDER"),
  ).not.toBeInTheDocument();
  transport.get.mockResolvedValue(p03Envelope(pageFor("INCOMING", true)));
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  expect(
    await screen.findByRole("heading", {
      name: "لا توجد أوامر مطابقة في هذا القسم.",
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "تظهر أوامر التفصيل وقطعها هنا عند وصولها إلى هذه المرحلة.",
    ),
  ).toBeVisible();
  view.unmount();
  expect(transport.post).not.toHaveBeenCalled();
});
it("uses separate authoritative incoming/incomplete counts with explicit overlap", async () => {
  navigation.path = "/warehouse/dashboard";
  transport.get.mockResolvedValue(
    p03Envelope({
      counts: {
        incoming: { orders: 2, pieces: 3 },
        incomplete: { orders: 2, pieces: 8 },
        ready: { orders: 1, pieces: 4 },
        outForDelivery: { orders: 0, pieces: 0 },
        deliveryFailed: { orders: 0, pieces: 0 },
        delivered: { orders: 0, pieces: 0 },
      },
    }),
  );
  render(<WarehouseWorkspace />, { wrapper });
  await screen.findByText(/الوارد وغير المكتمل نطاقان متداخلان/);
  expect(transport.get).toHaveBeenCalledWith(
    "/warehouse/dashboard",
    expect.objectContaining({ params: {} }),
  );
  expect(screen.getByText("2 أمر تفصيل · 8 قطعة")).toBeInTheDocument();
});
it("keeps the original focused search input and caret through sequential typing and an interior edit (T053)", async () => {
  transport.get.mockResolvedValue(p03Envelope(pageFor("INCOMING")));
  render(<WarehouseWorkspace />, { wrapper });
  await screen.findByRole("link", { name: "عرض أمر التفصيل" });
  const input = screen.getByRole<HTMLInputElement>("textbox", {
    name: /البحث برقم أمر التفصيل/,
  });
  input.focus();
  for (const character of "SHOP-2026") {
    const value = input.value + character;
    fireEvent.change(input, {
      target: {
        value,
        selectionStart: value.length,
        selectionEnd: value.length,
      },
    });
    expect(input.isConnected).toBe(true);
    expect(input).toHaveFocus();
    expect(
      screen.getByRole("textbox", { name: /البحث برقم أمر التفصيل/ }),
    ).toBe(input);
    expect(input.selectionStart).toBe(value.length);
  }
  input.setSelectionRange(6, 7);
  fireEvent.change(input, {
    target: { value: "SHOP-2926", selectionStart: 7, selectionEnd: 7 },
  });
  expect(input).toHaveFocus();
  expect(input).toHaveValue("SHOP-2926");
  expect(input.selectionStart).toBe(7);
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledWith(
      "/warehouse/orders",
      expect.objectContaining({
        params: { view: "INCOMING", search: "SHOP-2926", page: 1, limit: 10 },
      }),
    );
  });
});
it("keeps the surviving page button focused through pending and failed reads without exposing previous rows", async () => {
  let rejectPage: (reason: unknown) => void = () => {};
  const pending = new Promise<never>((_, reject) => {
    rejectPage = reject;
  });
  transport.get.mockImplementation((_path, options) =>
    options?.params?.["page"] === 2
      ? pending
      : Promise.resolve(p03Envelope(groupedPage(30))),
  );
  const view = render(<WarehouseWorkspace />, { wrapper });
  try {
    const page = await screen.findByRole("button", { name: "2" });
    page.focus();
    fireEvent.click(page);
    expect(page).toHaveFocus();
    expect(screen.getByRole("button", { name: "2" })).toBe(page);
    expect(screen.getByText(/حسب آخر تحميل مؤكد/)).toBeInTheDocument();
    expect(screen.getByText("جارٍ تحميل القطع…")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "عرض أمر التفصيل" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/النطاق المطابق:/)).not.toBeInTheDocument();
    rejectPage(rejection(422, "READ_FAILED"));
    await screen.findByRole("alert");
    expect(page).toHaveFocus();
    expect(page).toBeEnabled();
    expect(screen.getByText(/حسب آخر تحميل مؤكد/)).toBeInTheDocument();
    expect(
      screen.queryByText("لا توجد أوامر مطابقة في هذا القسم."),
    ).not.toBeInTheDocument();
    transport.get.mockImplementation((_path, options) =>
      Promise.resolve(
        p03Envelope(groupedPage(11, Number(options?.params?.["page"] ?? 1))),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByRole("link", { name: "عرض أمر التفصيل" });
    expect(screen.queryByText(/حسب آخر تحميل مؤكد/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toBe(page);
    transport.get.mockImplementation((_path, options) =>
      Promise.resolve(
        p03Envelope(groupedPage(1, Number(options?.params?.["page"] ?? 1))),
      ),
    );
    await act(async () => {
      await client.invalidateQueries({
        predicate: (query) => query.queryKey.includes("orders"),
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "الصفحة التالية" }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(transport.get).toHaveBeenLastCalledWith(
        "/warehouse/orders",
        expect.objectContaining({
          params: { view: "INCOMING", page: 1, limit: 10 },
        }),
      );
    });
  } finally {
    rejectPage(rejection(422, "READ_FAILED"));
    view.unmount();
  }
});
it("drops navigation metadata on filter, mode, invalid search and actor changes", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let gated = false;
  transport.get.mockImplementation((path, options) => {
    if (!gated) return Promise.resolve(p03Envelope(groupedPage(30)));
    return gate.then(() =>
      p03Envelope(
        path === "/warehouse/pieces"
          ? {
              department: "WAREHOUSE",
              view: "INCOMING",
              orderId: null,
              pieces: [],
              receiptGroups: [],
              qualityPackingGroups: [],
              counts: { orders: 0, pieces: 0 },
              pagination: pagination(
                0,
                Number(options?.params?.["page"] ?? 1),
                25,
              ),
            }
          : groupedPage(0, Number(options?.params?.["page"] ?? 1)),
      ),
    );
  });
  const view = render(<WarehouseWorkspace />, { wrapper });
  try {
    await screen.findByRole("button", { name: "2" });
    gated = true;
    const input = screen.getByRole("textbox", {
      name: /البحث برقم أمر التفصيل/,
    });
    input.focus();
    fireEvent.change(input, { target: { value: "another filter" } });
    expect(input).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "الصفحة التالية" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط" }));
    await screen.findByRole("button", { name: "2" });
    const type = screen.getByRole("combobox", { name: "نوع أمر التفصيل" });
    type.focus();
    fireEvent.keyDown(type, { key: "ArrowDown" });
    fireEvent.change(type, { target: { value: "SHOP" } });
    expect(type).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "نوع أمر التفصيل" })).toBe(
      type,
    );
    expect(
      screen.queryByRole("button", { name: "الصفحة التالية" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط" }));
    await screen.findByRole("button", { name: "2" });
    const flat = screen.getByRole("button", {
      name: "حسب القطعة",
    });
    flat.focus();
    fireEvent.keyDown(flat, { key: "Enter" });
    fireEvent.click(flat);
    expect(flat).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "الصفحة التالية" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حسب الطلب" }));
    await screen.findByRole("button", { name: "2" });
    fireEvent.change(input, { target: { value: "x".repeat(151) } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.queryByRole("button", { name: "الصفحة التالية" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط" }));
    await screen.findByRole("button", { name: "2" });
    act(() => {
      client.setQueryData(AUTH_SESSION_QUERY_KEY, null);
    });
    await screen.findByText(/جارٍ التحقق من صلاحية الوصول/);
    expect(
      screen.queryByRole("button", { name: "الصفحة التالية" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/جارٍ التحقق من صلاحية الوصول/),
    ).toBeInTheDocument();
  } finally {
    release();
    view.unmount();
    await act(async () => {
      await gate;
    });
  }
});
const incomingPageKey = (page: number) => {
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Expected an authenticated warehouse scope");
  return warehouseKeys.orders(
    scope,
    warehouseOrdersQuerySchema.parse({ view: "INCOMING", page, limit: 10 }),
  );
};
it.each([
  "removed-pending",
  "removed-failed",
  "malformed",
  "wrong-view",
  "removed-queued",
  "malformed-queued",
  "wrong-view-queued",
])(
  "withdraws %s remembered navigation without a parent rerender",
  async (replacement) => {
    let release: () => void = () => {};
    let fail: (reason: unknown) => void = () => {};
    const gate = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    transport.get.mockImplementation((_path, options) =>
      options?.params?.["page"] === 2
        ? gate.then(() => p03Envelope(groupedPage(0, 2)))
        : Promise.resolve(p03Envelope(groupedPage(30))),
    );
    const view = render(<WarehouseWorkspace />, { wrapper });
    try {
      fireEvent.click(await screen.findByRole("button", { name: "2" }));
      if (replacement === "removed-failed") {
        fail(rejection(422, "VALIDATION_ERROR"));
        await screen.findByRole("alert");
      }
      const page3 = screen.getByRole("button", { name: "3" });
      act(() => {
        const key = incomingPageKey(1);
        if (replacement.startsWith("removed"))
          client.removeQueries({ queryKey: key, exact: true });
        else {
          const query = client
            .getQueryCache()
            .find({ queryKey: key, exact: true });
          if (!query) throw new Error("Expected remembered query");
          query.setState({
            data: replacement.startsWith("malformed")
              ? { pagination: null }
              : { ...groupedPage(30), view: "READY" },
          });
        }
        if (replacement.endsWith("queued")) fireEvent.click(page3);
      });
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "الصفحة التالية" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.queryByText(/حسب آخر تحميل مؤكد/)).not.toBeInTheDocument();
      expect(
        transport.get.mock.calls.some(
          ([, options]) => options?.params?.["page"] === 3,
        ),
      ).toBe(false);
      expect(screen.queryByText(/إجمالي 30 عنصر/)).not.toBeInTheDocument();
      expect(transport.post).not.toHaveBeenCalled();
      if (replacement === "removed-failed")
        expect(screen.getByRole("alert")).toBeInTheDocument();
      else expect(screen.getByText("جارٍ تحميل القطع…")).toBeInTheDocument();
    } finally {
      release();
      view.unmount();
      await act(async () => {
        await Promise.allSettled([gate]);
      });
    }
  },
);
it("keeps smaller current totals authoritative when old metadata changes or disappears", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  transport.get.mockImplementation((_path, options) =>
    options?.params?.["page"] === 2
      ? gate.then(() => p03Envelope(groupedPage(11, 2)))
      : Promise.resolve(p03Envelope(groupedPage(30))),
  );
  const view = render(<WarehouseWorkspace />, { wrapper });
  try {
    fireEvent.click(await screen.findByRole("button", { name: "2" }));
    release();
    await screen.findByText(/إجمالي 11 عنصر/);
    act(() => {
      const query = client
        .getQueryCache()
        .find({ queryKey: incomingPageKey(1), exact: true });
      if (!query) throw new Error("Expected remembered query");
      query.setState({ data: groupedPage(1) });
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: incomingPageKey(2),
        exact: true,
      });
    });
    expect(screen.getByText(/إجمالي 11 عنصر/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    act(() => {
      client.removeQueries({ queryKey: incomingPageKey(1), exact: true });
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: incomingPageKey(2),
        exact: true,
      });
    });
    expect(screen.getByText(/إجمالي 11 عنصر/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  } finally {
    release();
    view.unmount();
    await act(async () => {
      await gate;
    });
  }
});
it("does not reopen a late preparation after a stable filter changes", async () => {
  const detail = detailFixture("RECEIVE");
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let prepare = false;
  transport.get.mockImplementation((path) =>
    path === `/warehouse/orders/${p03Ids.order}`
      ? (prepare ? gate : Promise.resolve()).then(() => p03Envelope(detail))
      : Promise.resolve(p03Envelope(pageFor("INCOMING"))),
  );
  const view = render(<WarehouseWorkspace />, { wrapper });
  try {
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(detail.summary.businessNumber),
      }),
    );
    const receive = await screen.findByRole("button", {
      name: "تأكيد الاستلام الفعلي",
    });
    await waitFor(() => {
      expect(receive).toBeEnabled();
    });
    prepare = true;
    fireEvent.click(receive);
    await screen.findByText("جارٍ مراجعة النطاق المحدد…");
    fireEvent.change(
      screen.getByRole("textbox", { name: /البحث برقم أمر التفصيل/ }),
      { target: { value: "new filter" } },
    );
    release();
    await act(async () => {
      await gate;
    });
    await screen.findByRole("link", { name: "عرض أمر التفصيل" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "تأكيد الاستلام الفعلي" }),
    ).not.toBeInTheDocument();
    expect(transport.post).not.toHaveBeenCalled();
  } finally {
    release();
    view.unmount();
  }
});
it("resets an unsent review and selection when filters change without sending", async () => {
  const detail = detailFixture("RECEIVE");
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path === `/warehouse/orders/${p03Ids.order}`
          ? detail
          : pageFor("INCOMING"),
      ),
    ),
  );
  render(<WarehouseWorkspace />, { wrapper });
  await screen.findByRole("link", { name: "عرض أمر التفصيل" });
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(detail.summary.businessNumber),
    }),
  );
  const receive = await screen.findByRole("button", {
    name: "تأكيد الاستلام الفعلي",
  });
  await waitFor(() => {
    expect(receive).toBeEnabled();
  });
  fireEvent.click(receive);
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByLabelText("ملاحظات"), {
    target: { value: "Unsent draft" },
  });
  fireEvent.change(screen.getByPlaceholderText(/البحث برقم أمر التفصيل/), {
    target: { value: "new filter" },
  });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(transport.post).not.toHaveBeenCalled();
});
it("renders actual saved actor/time and offers only the origin actor a GET observation", async () => {
  navigation.path = "/warehouse/activity";
  const event = warehouseActivityEventSchema.parse({
    id: p03Ids.source,
    commandId: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    operation: "RECEIVE",
    actor,
    occurredAt: p03Instant,
    pieceIds: [p03Ids.piece],
    beforeStatus: "APPROVED",
    afterStatus: "READY_FOR_DELIVERY",
    receiptGroup: {
      id: p03Ids.source,
      orderId: p03Ids.order,
      pieceIds: [p03Ids.piece],
      actor,
      receivedAt: p03Instant,
      cartonCount: "2",
      storageLocation: "Shelf B-12",
      notes: null,
    },
    attempt: null,
    retry: null,
  });
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path === "/warehouse/activity"
          ? {
              department: "WAREHOUSE",
              events: [{ kind: "warehouse", event }],
              pagination: pagination(1, 1, 25),
            }
          : {
              kind: "warehouse-command",
              replayed: false,
              receipt: {
                commandId: p03Ids.command,
                operation: "RECEIVE",
                actor,
                occurredAt: p03Instant,
              },
              outcome: {
                orders: [
                  {
                    eventId: event.id,
                    orderId: p03Ids.order,
                    beforeVersion: 2,
                    afterVersion: 3,
                    status: "READY_FOR_DELIVERY",
                    pieceIds: [p03Ids.piece],
                    receiptGroupId: p03Ids.source,
                    attemptId: null,
                    retryId: null,
                  },
                ],
              },
            },
      ),
    ),
  );
  render(<WarehouseWorkspace />, { wrapper });
  const observe = await screen.findByRole("button", {
    name: "التحقق من النتيجة الأصلية",
  });
  expect(screen.getByText("Warehouse colleague")).toBeInTheDocument();
  fireEvent.click(observe);
  await screen.findByText(/تم التحقق من حفظ الإجراء/);
  expect(transport.post).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "إعادة نفس الإجراء" }),
  ).not.toBeInTheDocument();
  act(() => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, null);
  });
  await waitFor(() => {
    expect(
      screen.queryByText(/تم التحقق من حفظ الإجراء/),
    ).not.toBeInTheDocument();
  });
});
