import { renderWithToast as render } from "@/test/render-with-toast";
import { StrictMode } from "react";
import { AxiosError, AxiosHeaders } from "axios";
import { readManufacturingOperationalScope } from "@/shared/query/operational-scope";
import { manufacturingKeys } from "../hooks/manufacturing.hooks";
import type * as ManufacturingTransport from "../api/manufacturing.api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  manufacturingActivityDataSchema,
  manufacturingOrderHeaderSchema,
  type ManufacturingDepartment,
  type ManufacturingCommandBody,
  manufacturingCommandBodySchema,
  type ManufacturingOrdersQuery,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { p03Ids } from "@/test/p03-fixtures";
import {
  manufacturingDetailFixture,
  factorySessionFixture,
  factoryActivityFixture,
  factoryWorkFixture,
} from "../model/manufacturing.fixture";
import { ManufacturingCommandRecovery } from "../components/manufacturing-command-recovery";
import {
  CuttingWorkspace,
  PersistedFactoryWorkspace,
} from "./cutting-workspace";

const transport = vi.hoisted(() => ({
  orders: vi.fn(),
  pieces: vi.fn(),
  order: vi.fn(),
  dashboard: vi.fn(),
  activity: vi.fn(),
  observeWork: vi.fn(),
  observeReport: vi.fn(),
  command: vi.fn(),
  reportIssue: vi.fn(),
}));
const accountTransport = vi.hoisted(() => ({ getMe: vi.fn() }));
vi.mock("@/features/users/api/users.api", () => ({
  usersApi: accountTransport,
}));
const route = vi.hoisted(() => ({ path: "/cutting/incoming" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),

  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../api/manufacturing.api", async (original) => ({
  ...(await original<typeof ManufacturingTransport>()),
  manufacturingApi: transport,
}));
const client = createQueryClient();
const detail = () => manufacturingDetailFixture();
const summary = () => {
  const { order } = detail().paper;
  return {
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
};
const page = (query: ManufacturingOrdersQuery) => ({
  department: "CUTTING",
  view: query.view,
  items: [summary()],
  counts: { orders: 17, pieces: 43 },
  pagination: {
    page: query.page,
    limit: 10,
    total: 17,
    totalPages: 2,
    hasNextPage: query.page < 2,
    hasPreviousPage: query.page > 1,
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  route.path = "/cutting/incoming";
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, factorySessionFixture("CUTTING"));
  transport.orders.mockImplementation(
    (_department: string, query: ManufacturingOrdersQuery) =>
      Promise.resolve(page(query)),
  );
  transport.order.mockResolvedValue(detail());
  transport.pieces.mockResolvedValue({
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
  });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <CuttingWorkspace />
    </QueryClientProvider>,
  );
it("uses authoritative filtered totals, lazy reactive expansion and exact selection without local authority", async () => {
  mount();
  await screen.findByRole("button", { name: /SHOP-2026-0001/u });
  expect(screen.getByText("عرض 43 من أصل 43 قطعة")).toBeInTheDocument();
  expect(screen.getByText("(إجمالي 17 عنصر)")).toBeInTheDocument();
  expect(transport.pieces).not.toHaveBeenCalled();
  expect(transport.order).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /SHOP-2026-0001/u }));
  const select = await screen.findByRole("checkbox", {
    name: "تحديد قطع SHOP-2026-0001",
  });
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.click(select);
  expect(await screen.findByText("المحدد: 1 قطعة")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "حسب القطعة" }));
  await waitFor(() =>
    expect(screen.queryByText("المحدد: 1 قطعة")).not.toBeInTheDocument(),
  );
  expect(localStorage.length).toBe(0);
});
it("rejects invalid search without a request and resets valid server pagination on filter changes", async () => {
  mount();
  await screen.findByRole("button", { name: /SHOP-2026-0001/u });
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await waitFor(() => {
    expect(transport.orders).toHaveBeenLastCalledWith(
      "CUTTING",
      expect.objectContaining({ page: 2 }),
      expect.any(AbortSignal),
    );
  });
  const input = screen.getByRole("textbox");
  const calls = transport.orders.mock.calls.length;
  fireEvent.change(input, { target: { value: "a".repeat(151) } });
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(transport.orders).toHaveBeenCalledTimes(calls);
  fireEvent.change(input, { target: { value: "  safe  " } });
  await waitFor(() => {
    expect(transport.orders).toHaveBeenLastCalledWith(
      "CUTTING",
      expect.objectContaining({ search: "safe", page: 1 }),
      expect.any(AbortSignal),
    );
  });
  expect(input).toHaveValue("  safe  ");
});

it("shows the success toast when starting the last order on a page removes that page", async () => {
  let started = false;
  const refreshedDetail = manufacturingDetailFixture(3, "CUTTING", true);
  let finishDetail: (detail: typeof refreshedDetail) => void = () => {
    throw new Error("Missing detail request");
  };
  const detailRefresh = new Promise<typeof refreshedDetail>((resolve) => {
    finishDetail = resolve;
  });
  const remainingOrder = {
    ...summary(),
    id: p03Ids.customer,
    businessNumber: "SHOP-2026-0002",
  };
  transport.orders.mockImplementation(
    (_department: string, query: ManufacturingOrdersQuery) => {
      const originalPage = page(query);
      const total = started ? 10 : 11;
      const totalPages = started ? 1 : 2;
      return Promise.resolve({
        ...originalPage,
        items: query.page === 1 ? [remainingOrder] : started ? [] : [summary()],
        counts: { orders: total, pieces: total },
        pagination: {
          ...originalPage.pagination,
          total,
          totalPages,
          hasNextPage: query.page < totalPages,
        },
      });
    },
  );
  transport.command.mockImplementation(
    (_department: string, body: ManufacturingCommandBody) => {
      started = true;
      transport.order.mockReturnValue(detailRefresh);
      return Promise.resolve(
        factoryWorkFixture("CUTTING", "RECEIVE_AND_START", 2, body.commandId),
      );
    },
  );

  mount();
  await screen.findByRole("button", { name: /SHOP-2026-0002/u });
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /SHOP-2026-0001/u }),
  );
  const receive = await screen.findByRole("button", {
    name: "استلام وبدء العمل",
  });
  await waitFor(() => expect(receive).toBeEnabled());
  fireEvent.click(receive);
  fireEvent.click(
    await screen.findByRole("button", { name: "تأكيد استلام وبدء العمل" }),
  );

  try {
    await screen.findByText(
      "تم حفظ الإجراء. جارٍ تحديث البيانات؛ انتظر دون إعادة الإرسال.",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /SHOP-2026-0001/u }),
      ).not.toBeInTheDocument(),
    );
  } finally {
    act(() => {
      finishDetail(refreshedDetail);
    });
  }

  expect(
    await screen.findByText("تم استلام وبدء العمل على القطعة المحددة"),
  ).toBeVisible();
  expect(
    await screen.findByRole("button", { name: /SHOP-2026-0002/u }),
  ).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "الصفحة السابقة" }),
  ).not.toBeInTheDocument();
});

it("keeps a failed expanded detail retry reachable without fabricating a partial group", async () => {
  transport.order.mockRejectedValueOnce(new Error("failed detail"));
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /SHOP-2026-0001/u }),
  );
  await screen.findByRole("button", { name: "إعادة المحاولة" });
  expect(
    screen.queryByRole("checkbox", { name: "تحديد قطع SHOP-2026-0001" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  await screen.findByRole("checkbox", { name: "تحديد قطع SHOP-2026-0001" });
});
it("does not turn a late expansion into a restored selection after a filter change", async () => {
  let resolve!: (result: ReturnType<typeof detail>) => void;
  transport.order.mockReturnValue(
    new Promise<ReturnType<typeof detail>>((yes) => {
      resolve = yes;
    }),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /SHOP-2026-0001/u }),
  );
  await waitFor(() => {
    expect(transport.order).toHaveBeenCalledTimes(1);
  });
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "changed" },
  });
  act(() => {
    resolve(detail());
  });
  expect(
    screen.queryByRole("checkbox", { name: "تحديد قطع SHOP-2026-0001" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("المحدد: 1 قطعة")).not.toBeInTheDocument();
});

it.each([true, false])(
  "discovers own committed results after reload without reconstructing a POST, event present=%s",
  async (hasEvent) => {
    route.path = "/cutting/activity";
    const event = factoryActivityFixture();
    transport.activity.mockResolvedValue({
      department: "CUTTING",
      events: hasEvent ? [{ kind: "manufacturing", event }] : [],
      pagination: {
        page: 1,
        limit: 25,
        total: hasEvent ? 1 : 0,
        totalPages: hasEvent ? 1 : 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    transport.observeWork.mockResolvedValue(
      factoryWorkFixture("CUTTING", "COMPLETE_TRANSFER"),
    );
    mount();
    await screen.findByRole("checkbox", { name: "عملياتي فقط" });
    fireEvent.click(screen.getByRole("checkbox", { name: "عملياتي فقط" }));
    await waitFor(() => {
      expect(transport.activity).toHaveBeenLastCalledWith(
        "CUTTING",
        { page: 1, limit: 25, actor: "me" },
        expect.any(AbortSignal),
      );
    });
    if (hasEvent) {
      fireEvent.click(
        await screen.findByRole("button", { name: "التحقق من نتيجة الإجراء" }),
      );
      expect(
        await screen.findByText(/تم التحقق من الإجراء/u),
      ).toBeInTheDocument();
      expect(transport.observeWork).toHaveBeenCalledWith(event.commandId);
    } else {
      expect(
        await screen.findByText("لا توجد حركات مسجلة"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/غياب النتيجة لا يثبت فشله/u),
      ).toBeInTheDocument();
    }
    expect(transport.command).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  },
);
it("uses dashboard flags and canonical queue counts without per-order detail fanout", async () => {
  route.path = "/cutting/dashboard";
  const zero = { orders: 0, pieces: 0 };
  transport.dashboard.mockResolvedValue({
    department: "CUTTING",
    counts: {
      incoming: { orders: 17, pieces: 43 },
      inProgress: zero,
      returned: zero,
      completed: zero,
      repairs: zero,
    },
    recentOrders: [{ ...summary(), hasInProgress: true }],
  });
  mount();
  expect(await screen.findByText("17 أمر · 43 قطعة")).toBeInTheDocument();
  const activeOrders = screen.getByRole("region", {
    name: /ملخص الأوامر النشطة/u,
  });
  expect(activeOrders).toHaveTextContent("1 قطعة بالقسم");
  expect(activeOrders).toHaveTextContent("قيد التشغيل");
  expect(transport.orders).not.toHaveBeenCalled();
  expect(transport.order).not.toHaveBeenCalled();
});

it("keeps all selected groups blocked when one captured version becomes stale, without sending a valid subset", async () => {
  const first = detail(),
    second = structuredClone(first);
  second.paper.order.id = p03Ids.customer;
  second.paper.order.businessNumber = "SHOP-2026-0002";
  const piece = second.paper.order.pieces[0],
    work = second.work[0];
  if (!piece || !work || !work.visit)
    throw new Error("Missing second piece context");
  piece.id = p03Ids.source;
  work.pieceId = piece.id;
  work.visit.pieceId = piece.id;
  work.visit.id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const secondSummary = {
    ...summary(),
    id: p03Ids.customer,
    businessNumber: second.paper.order.businessNumber,
    matchingPieceIds: [p03Ids.source],
  };
  transport.orders.mockImplementation(
    (_department: string, query: ManufacturingOrdersQuery) =>
      Promise.resolve({ ...page(query), items: [summary(), secondSummary] }),
  );
  transport.order.mockImplementation((_department: string, id: string) =>
    Promise.resolve(id === p03Ids.order ? first : second),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /SHOP-2026-0001/u }),
  );
  fireEvent.click(screen.getByRole("button", { name: /SHOP-2026-0002/u }));
  const a = await screen.findByRole("checkbox", {
      name: "تحديد قطع SHOP-2026-0001",
    }),
    b = await screen.findByRole("checkbox", {
      name: "تحديد قطع SHOP-2026-0002",
    });
  await waitFor(() => expect(a).toBeEnabled());
  await waitFor(() => expect(b).toBeEnabled());
  fireEvent.click(a);
  fireEvent.click(b);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "استلام وبدء المحدد" }),
    ).toBeEnabled(),
  );
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Missing scope");
  act(() => {
    client.setQueryData(manufacturingKeys.order(scope, p03Ids.customer), {
      ...second,
      paper: { ...second.paper, order: { ...second.paper.order, version: 3 } },
    });
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "استلام وبدء المحدد" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByText("المحدد: 2 قطعة")).toBeInTheDocument();
  expect(transport.command).not.toHaveBeenCalled();
});

it("does not claim a successful review or resend work when the required refresh fails", async () => {
  transport.command.mockRejectedValue(
    new AxiosError("conflict", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 409,
      statusText: "Conflict",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 409,
        code: "MANUFACTURING_SELECTION_CONFLICT",
        message: "Selection changed",
        requestId: "safe-request",
        timestamp: "2026-11-11T00:00:00.000Z",
        path: "/api/v1/manufacturing/cutting/commands",
      },
    }),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /SHOP-2026-0001/u }),
  );
  const receive = await screen.findByRole("button", {
    name: "استلام وبدء العمل",
  });
  await waitFor(() => expect(receive).toBeEnabled());
  fireEvent.click(receive);
  fireEvent.click(
    await screen.findByRole("button", { name: "تأكيد استلام وبدء العمل" }),
  );
  await screen.findByRole("button", { name: "تحديث ومراجعة القطع المحددة" });
  transport.orders.mockRejectedValue(new Error("refresh failed"));
  fireEvent.click(
    screen.getByRole("button", { name: "تحديث ومراجعة القطع المحددة" }),
  );
  expect(
    await screen.findByText(
      "تعذر تحديث جميع بيانات القطع. أعد المحاولة قبل التأكيد.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "تأكيد استلام وبدء العمل" }),
  ).toBeDisabled();
  expect(screen.queryByText(/تم تحديث البيانات/u)).not.toBeInTheDocument();
  expect(transport.command).toHaveBeenCalledTimes(1);
});

it("prepares a flat-page batch from exact page rows without waiting for grouped details (P05 browser regression)", async () => {
  const current = detail();
  const piece = current.paper.order.pieces[0];
  const work = current.work[0];
  if (!piece || !work) throw new Error("Exact flat fixture missing");
  transport.pieces.mockResolvedValue({
    department: "CUTTING",
    view: "INCOMING",
    items: [
      {
        order: manufacturingOrderHeaderSchema.strip().parse(summary()),
        piece,
        work,
      },
    ],
    counts: { orders: 1, pieces: 1 },
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  mount();
  await screen.findByRole("button", { name: /SHOP-2026-0001/u });
  fireEvent.click(screen.getByRole("button", { name: "حسب القطعة" }));
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "تحديد قطع الصفحة" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "استلام وبدء المحدد" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "استلام وبدء العمل",
  });
  expect(dialog).toHaveTextContent("القطعة 01");
  expect(dialog).not.toHaveTextContent(piece.id);
  expect(transport.command).not.toHaveBeenCalled();
});

it("restores the queue report opener after its asynchronous preparation blurred the disabled control", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /SHOP-2026-0001/u }),
  );
  const trigger = await screen.findByRole("button", {
    name: /^تسجيل مشكلة$/u,
  });
  let finish: (value: ReturnType<typeof detail>) => void = () => {};
  const pending = new Promise<ReturnType<typeof detail>>((resolve) => {
    finish = resolve;
  });
  transport.order.mockReturnValueOnce(pending);
  trigger.focus();
  fireEvent.click(trigger);
  await waitFor(() => expect(trigger).toBeDisabled());
  trigger.blur();
  await act(async () => {
    finish(detail());
    await pending;
  });
  const dialog = await screen.findByRole("dialog", {
    name: "تسجيل مشكلة تصنيع على القطعة",
  });
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
  expect(transport.command).not.toHaveBeenCalled();
  expect(transport.reportIssue).not.toHaveBeenCalled();
});

const ownActivity = (
  department: ManufacturingDepartment,
  protocol: "work" | "report",
) => {
  const result = factoryWorkFixture(department, "COMPLETE_TRANSFER");
  const outcome = result.outcome.orders[0];
  if (!outcome) throw new Error("Work outcome missing");
  const event =
    protocol === "work"
      ? {
          kind: "manufacturing",
          event: {
            ...factoryActivityFixture(),
            department,
            actor: result.receipt.actor,
            pieces: outcome.pieces,
            destination: department === "CUTTING" ? "PRODUCTION" : "QUALITY",
          },
        }
      : {
          kind: "issue",
          event: {
            id: p03Ids.command,
            commandId: p03Ids.command,
            orderId: p03Ids.order,
            orderVersion: 3,
            businessNumber: "SHOP-2026-0001",
            pieceId: p03Ids.piece,
            issueId: p03Ids.source,
            department,
            sourceDepartment: department,
            operation: "REPORT_ISSUE",
            result: "REPORTED",
            target: null,
            actor: result.receipt.actor,
            occurredAt: result.receipt.occurredAt,
            reason: "Retained manufacturing problem",
            notes: null,
          },
        };
  return manufacturingActivityDataSchema.parse({
    department,
    events: [event],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
};
const activityDenial = (code: string) =>
  new AxiosError(
    "Business access denied",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      status: 403,
      statusText: "Forbidden",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 403,
        code,
        message: "Business access denied",
        requestId: "p05-denial",
        timestamp: "2026-11-11T00:00:00.000Z",
        path: "/api/v1/manufacturing-commands/original",
      },
    },
  );
const openOwnActivity = async (
  department: ManufacturingDepartment,
  protocol: "work" | "report",
) => {
  route.path = `/${department.toLowerCase()}/activity`;
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    factorySessionFixture(department),
  );
  transport.activity.mockResolvedValue(ownActivity(department, protocol));
  const view = render(
    <QueryClientProvider client={client}>
      <PersistedFactoryWorkspace department={department} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("checkbox", { name: "عملياتي فقط" }));
  const observe = await screen.findByRole("button", {
    name: "التحقق من نتيجة الإجراء",
  });
  return { view, observe };
};
for (const department of ["CUTTING", "PRODUCTION"] as const) {
  it.each(["work", "report"] as const)(
    `reconciles ${department} own-activity %s denial and removes withdrawn authority (P05-C01)`,
    async (protocol) => {
      const { observe } = await openOwnActivity(department, protocol);
      const account = factorySessionFixture(department);
      const reassigned = department === "PRODUCTION";
      const updated = authUserDataSchema.parse({
        user: {
          ...account.user,
          status: reassigned ? "ACTIVE" : "SUSPENDED",
          department: reassigned ? "CUTTING" : department,
          accessVersion: account.user.accessVersion + 1,
        },
      });
      accountTransport.getMe.mockResolvedValue(updated);
      const observation =
        protocol === "work" ? transport.observeWork : transport.observeReport;
      observation.mockRejectedValue(
        activityDenial(
          reassigned ? "DEPARTMENT_ACCESS_DENIED" : "ACCOUNT_RESTRICTED",
        ),
      );
      fireEvent.click(observe);
      await screen.findByText(
        "مساحة العمل غير متاحة لهذا الحساب. حدّث الحساب أو اختر القسم المسموح به.",
      );
      expect(screen.queryByText("SHOP-2026-0001")).not.toBeInTheDocument();
      expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(updated);
      expect(transport.command).not.toHaveBeenCalled();
      expect(transport.reportIssue).not.toHaveBeenCalled();
    },
  );
}
it.each(["work", "report"] as const)(
  "does not reconcile a late own-activity %s denial into a replacement identity",
  async (protocol) => {
    let rejectObservation: (error: unknown) => void = () => {};
    const pending = new Promise<never>((_resolve, reject) => {
      rejectObservation = reject;
    });
    const observation =
      protocol === "work" ? transport.observeWork : transport.observeReport;
    observation.mockReturnValue(pending);
    const { view, observe } = await openOwnActivity("CUTTING", protocol);
    fireEvent.click(observe);
    await waitFor(() => {
      expect(observation).toHaveBeenCalledTimes(1);
    });
    const replacement = authUserDataSchema.parse({
      user: {
        ...factorySessionFixture("CUTTING").user,
        id: p03Ids.customer,
        fullName: "Replacement worker",
      },
    });
    act(() => {
      const epoch = beginAuthSessionEpoch("credential-login");
      acceptCredentialLogin("replacement-synthetic", epoch, p03Ids.customer);
      client.setQueryData(AUTH_SESSION_QUERY_KEY, replacement);
    });
    await act(async () => {
      rejectObservation(activityDenial("ACCOUNT_RESTRICTED"));
      await pending.catch(() => {});
    });
    expect(accountTransport.getMe).not.toHaveBeenCalled();
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(replacement);
    expect(
      screen.queryByText(/التحقق من نتيجة الإجراء.*تعذر/u),
    ).not.toBeInTheDocument();
    expect(transport.command).not.toHaveBeenCalled();
    view.unmount();
  },
);

it.each(["CUTTING", "PRODUCTION"] as const)(
  "keeps %s recovery after the sending queue unmounts with its confirmation open (P05-C02)",
  async (department) => {
    route.path = `/${department.toLowerCase()}/incoming`;
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      factorySessionFixture(department),
    );
    transport.orders.mockImplementation(
      (_department: string, query: ManufacturingOrdersQuery) =>
        Promise.resolve({ ...page(query), department }),
    );
    transport.order.mockResolvedValue(
      manufacturingDetailFixture(2, department),
    );
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.command.mockImplementation(
      (requested: ManufacturingDepartment, body: ManufacturingCommandBody) =>
        pending.then(() =>
          factoryWorkFixture(requested, body.operation, 2, body.commandId),
        ),
    );
    const view = render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <PersistedFactoryWorkspace department={department} />
        </QueryClientProvider>
      </StrictMode>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /SHOP-2026-0001/u }),
    );
    const receive = await screen.findByRole("button", {
      name: "استلام وبدء العمل",
    });
    await waitFor(() => {
      expect(receive).toBeEnabled();
    });
    fireEvent.click(receive);
    fireEvent.click(
      await screen.findByRole("button", { name: "تأكيد استلام وبدء العمل" }),
    );
    await waitFor(() => {
      expect(transport.command).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const sent = manufacturingCommandBodySchema.parse(
      transport.command.mock.calls[0]?.[1],
    );
    view.unmount();
    const recovery = render(
      <QueryClientProvider client={client}>
        <ManufacturingCommandRecovery department={department} />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("متابعة نتيجة الإجراء")).toHaveTextContent(
      "جارٍ إرسال الإجراء",
    );
    transport.order.mockResolvedValue(
      manufacturingDetailFixture(3, department, true),
    );
    await act(async () => {
      release();
      await pending;
    });
    expect(
      await screen.findByText(/تم استلام وبدء العمل/u),
    ).toBeInTheDocument();
    expect(transport.command).toHaveBeenCalledTimes(1);
    expect(sent.orders).toEqual([
      { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
    ]);
    await waitFor(() => {
      expect(
        screen.queryByLabelText("متابعة نتيجة الإجراء"),
      ).not.toBeInTheDocument();
    });
    recovery.unmount();
  },
);
