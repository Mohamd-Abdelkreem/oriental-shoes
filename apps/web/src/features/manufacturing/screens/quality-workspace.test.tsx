import { renderWithToast as render } from "@/test/render-with-toast";
import { act, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authUserDataSchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  p03Ids,
  p03Session,
  p03Envelope,
  p03Instant,
} from "@/test/p03-fixtures";
import { QualityWorkspace } from "./quality-workspace";

import { fireEvent } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import {
  qualityOrderDataSchema,
  qualityOrderSummarySchema,
  qualityCommandBodySchema,
  qualityPiecesQuerySchema,
  qualityOrdersQuerySchema,
  qualityActivityEventSchema,
  type QualityOrderData,
} from "@template/contracts";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { resolveQualityTargets } from "../model/quality-view.model";

const transport = vi.hoisted(() => ({
  get: vi.fn<
    (
      path: string,
      options?: { signal?: AbortSignal; params?: unknown },
    ) => Promise<unknown>
  >(),
  post: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));
const route = vi.hoisted(() => ({ path: "/quality/dashboard", params: "" }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),

  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(route.params),
}));
const client = createQueryClient();
const dashboard = () => ({
  department: "QUALITY",
  counts: {
    incoming: { orders: 2, pieces: 37 },
    inspection: { orders: 1, pieces: 4 },
    accepted: { orders: 3, pieces: 9 },
    corrections: { orders: 1, pieces: 1 },
  },
  recentOrders: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  route.path = "/quality/dashboard";
  route.params = "";
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
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <QualityWorkspace />
    </QueryClientProvider>,
  );
it("renders saved Quality counts without a local provider and distinguishes loading from real empty data", async () => {
  let release: (value: unknown) => void = () => undefined;
  const gate = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  transport.get.mockImplementation(() => gate);
  const view = mount();
  try {
    expect(screen.getByRole("status")).toHaveTextContent(
      "جارٍ تحميل لوحة الجودة",
    );
    await act(async () => {
      release(p03Envelope(dashboard()));
      await gate;
    });
    await screen.findByText("37 قطعة");
    expect(screen.getAllByText(/37.*قطعة/).length).toBeGreaterThan(0);
    expect(transport.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("منى سعيد")).not.toBeInTheDocument();
  } finally {
    release(p03Envelope(dashboard()));
    await gate;
    view.unmount();
  }
});
it("shows a failed dashboard explicitly and never replaces it with local successful counts", async () => {
  transport.get.mockRejectedValue(new Error("Owned unavailable service"));
  const view = mount();
  try {
    await waitFor(
      () => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
    expect(screen.queryByText("37 قطعة")).not.toBeInTheDocument();
    expect(transport.post).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});
const id = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const qualityDetail = () => {
  const source = manufacturingDetailFixture(),
    piece = source.paper.order.pieces[0];
  if (!piece) throw new Error("Owned piece required");
  const pieces = Array.from({ length: 5 }, (_, i) => ({
    ...piece,
    id: id(i + 1),
    position: i + 1,
    stage: "QUALITY",
    workState: "IN_PROGRESS",
  }));
  return qualityOrderDataSchema.parse({
    department: "QUALITY",
    packingGroups: [],
    paper: {
      ...source.paper,
      order: {
        ...source.paper.order,
        counts: {
          original: 5,
          active: 5,
          cancelled: 0,
          received: 0,
          completionPercent: 0,
        },
        pieces,
      },
    },
    work: pieces.map((piece) => ({
      pieceId: piece.id,
      visit: {
        id: id(piece.position + 10),
        pieceId: piece.id,
        sequence: 1,
        originKind: "LEGACY_BASELINE",
        sourceProductionEventId: null,
        sourceCorrectionId: null,
        enteredAt: null,
        receivedAt: null,
        startedAt: null,
        startedBy: null,
        endedAt: null,
        endReason: null,
        endedBy: null,
        legacyUnknownStart: true,
      },
      lastAction: null,
      currentCorrection: null,
      latestInspection: null,
      allowedActions: {
        canReceiveAndStart: false,
        canContinue: true,
        canInspect: true,
        canReportIssue: true,
      },
    })),
  });
};

const summary = (data: QualityOrderData) => {
  const order = data.paper.order,
    rows = resolveQualityTargets(
      data,
      order.pieces.map((piece) => ({
        orderId: order.id,
        expectedVersion: order.version,
        pieceId: piece.id,
      })),
    );
  return qualityOrderSummarySchema.parse({
    ...rows[0]?.order,
    matchingPieceIds: order.pieces.map((piece) => piece.id),
    matchingPieceCount: order.pieces.length,
    lastWorkAt: null,
  });
};
const orderPage = (items: ReturnType<typeof summary>[]) => ({
  department: "QUALITY",
  view: "INSPECTION",
  items,
  counts: {
    orders: items.length,
    pieces: items.reduce((n, item) => n + item.matchingPieceCount, 0),
  },
  pagination: {
    page: 1,
    limit: 10,
    total: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});
it("sends exactly P1/P3 acceptance and P2 rejection while P4/P5 stay untouched, retaining its draft after a known conflict", async () => {
  route.path = "/quality/inspection";
  const data = qualityDetail(),
    group = summary(data);
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(path.endsWith("/orders") ? orderPage([group]) : data),
    ),
  );
  const error = new AxiosError("Safe owned version conflict");
  error.response = {
    status: 409,
    statusText: "Conflict",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: 409,
      code: "ORDER_VERSION_CONFLICT",
      message: "Safe",
      requestId: "owned",
      timestamp: "2026-11-11T10:00:00.000Z",
      path: "/quality/commands",
    },
  };
  transport.post.mockRejectedValue(error);
  const view = mount();
  try {
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(group.businessNumber),
      }),
    );
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: `تحديد قطع ${group.businessNumber}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "تسجيل نتيجة فحص المحدد" }),
    );
    await screen.findByRole("dialog");
    const choices = screen.getAllByLabelText("نتيجة القطعة");
    for (const [i, choice] of choices.entries())
      fireEvent.change(choice, {
        target: { value: i === 1 ? "REJECT" : "ACCEPT" },
      });
    for (const input of screen.getAllByLabelText("فحص هذه القطعة").slice(3))
      fireEvent.click(input);
    fireEvent.change(screen.getByLabelText("القسم المسؤول"), {
      target: { value: "CUTTING" },
    });
    fireEvent.change(screen.getByLabelText("سبب الرفض"), {
      target: { value: "Actual defect" },
    });
    fireEvent.change(screen.getByLabelText("تعليمات التصحيح"), {
      target: { value: "Actual repair" },
    });
    fireEvent.change(screen.getByLabelText("عدد الكراتين (اختياري)"), {
      target: { value: "  Two/X  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
    await waitFor(() => {
      expect(transport.post).toHaveBeenCalledTimes(1);
    });
    const body = qualityCommandBodySchema.parse(
      transport.post.mock.calls[0]?.[1],
    );
    expect(body).toMatchObject({
      operation: "INSPECT",
      orders: [
        {
          orderId: data.paper.order.id,
          expectedVersion: 2,
          packing: { cartonCount: "  Two/X  ", cartonNumbers: null },
          decisions: [
            { pieceId: id(1), decision: "ACCEPT" },
            {
              pieceId: id(2),
              decision: "REJECT",
              target: "CUTTING",
              reason: "Actual defect",
              instructions: "Actual repair",
            },
            { pieceId: id(3), decision: "ACCEPT" },
          ],
        },
      ],
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }),
      ).toBeDisabled();
    });
    expect(screen.getByLabelText("سبب الرفض")).toHaveValue("Actual defect");
  } finally {
    view.unmount();
  }
});
it("rejects the whole cross-order preparation when one freshly loaded root version changes", async () => {
  route.path = "/quality/inspection";
  const first = qualityDetail(),
    second = qualityDetail();
  second.paper.order.id = p03Ids.customer;
  second.paper.order.businessNumber = "SHOP-2026-0999";
  second.paper.order.pieces = second.paper.order.pieces.map((piece, i) => ({
    ...piece,
    id: id(101 + i),
  }));
  second.work = second.work.map((work, i) => ({
    ...work,
    pieceId: id(101 + i),
    visit: work.visit
      ? { ...work.visit, id: id(111 + i), pieceId: id(101 + i) }
      : null,
  }));
  const groups = [summary(first), summary(second)],
    reads = new Map<string, number>();
  transport.get.mockImplementation((path) => {
    if (path.endsWith("/orders"))
      return Promise.resolve(p03Envelope(orderPage(groups)));
    const current = path.endsWith(p03Ids.customer) ? second : first,
      count = (reads.get(current.paper.order.id) ?? 0) + 1;
    reads.set(current.paper.order.id, count);
    return Promise.resolve(
      p03Envelope(
        current === second && count > 1
          ? {
              ...second,
              paper: {
                ...second.paper,
                order: { ...second.paper.order, version: 3 },
              },
            }
          : current,
      ),
    );
  });
  const view = mount();
  try {
    for (const group of groups) {
      fireEvent.click(
        await screen.findByRole("button", {
          name: new RegExp(group.businessNumber),
        }),
      );
      fireEvent.click(
        await screen.findByRole("checkbox", {
          name: `تحديد قطع ${group.businessNumber}`,
        }),
      );
    }
    fireEvent.click(
      screen.getByRole("button", { name: "تسجيل نتيجة فحص المحدد" }),
    );
    await waitFor(() => {
      expect(reads.get(p03Ids.customer) ?? 0).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transport.post).not.toHaveBeenCalled();
    expect(screen.getByText(/المحدد: 10/)).toBeInTheDocument();
  } finally {
    view.unmount();
  }
});

it("uses a 100-piece flat-page query, selects only its exact members, and clears unsent selection on filters", async () => {
  route.path = "/quality/inspection";
  const data = qualityDetail(),
    group = summary(data),
    rows = resolveQualityTargets(
      data,
      data.paper.order.pieces.map((piece) => ({
        orderId: data.paper.order.id,
        expectedVersion: data.paper.order.version,
        pieceId: piece.id,
      })),
    );
  transport.get.mockImplementation((path, options) => {
    if (path.endsWith("/pieces")) {
      const query = qualityPiecesQuerySchema.parse(options?.params);
      expect(query.limit).toBe(100);
      return Promise.resolve(
        p03Envelope({
          department: "QUALITY",
          view: "INSPECTION",
          packingGroups: [],
          items: rows.map((row) => ({
            order: row.order,
            piece: row.piece,
            work: row.work,
          })),
          counts: { orders: 1, pieces: 5 },
          pagination: {
            page: 1,
            limit: 100,
            total: 5,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      );
    }
    return Promise.resolve(
      p03Envelope(path.endsWith("/orders") ? orderPage([group]) : data),
    );
  });
  const view = mount();
  try {
    await screen.findByRole("button", {
      name: new RegExp(group.businessNumber),
    });
    fireEvent.click(screen.getByRole("button", { name: "حسب القطعة" }));
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "تحديد قطع الصفحة" }),
    );
    expect(screen.getByText(/المحدد: 5/)).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "نوع أمر التفصيل" }),
      { target: { value: "SHOP" } },
    );
    expect(screen.queryByText(/المحدد: 5/)).not.toBeInTheDocument();
    expect(transport.post).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});

const activityEvent = (own = true) =>
  qualityActivityEventSchema.parse({
    id: own ? id(501) : id(502),
    commandId: own ? id(601) : id(602),
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    department: "QUALITY",
    operation: "CONTINUE",
    actor: {
      id: own ? p03Ids.actor : p03Ids.customer,
      fullName: own ? "Actual own inspector" : "Actual colleague",
      role: "USER",
      department: "QUALITY",
    },
    occurredAt: "2026-11-11T10:00:00.000Z",
    pieces: [
      {
        pieceId: id(1),
        visitId: id(11),
        decision: null,
        stage: "QUALITY",
        workState: "IN_PROGRESS",
        correctionId: null,
        issueId: null,
      },
    ],
    inspection: null,
    report: null,
    correctionLinks: [],
  });
it("renders department activity with actor-gated read-only original-result discovery and preserves 404 uncertainty without POST", async () => {
  route.path = "/quality/activity";
  transport.get.mockImplementation((path) => {
    if (path.startsWith("/quality-commands/")) {
      const error = new AxiosError("Owned missing receipt");
      error.response = {
        status: 404,
        statusText: "Not found",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          success: false,
          statusCode: 404,
          code: "QUALITY_COMMAND_NOT_FOUND",
          message: "Safe",
          requestId: "owned",
          timestamp: "2026-11-11T10:00:00.000Z",
          path,
        },
      };
      return Promise.reject(error);
    }
    return Promise.resolve(
      p03Envelope({
        department: "QUALITY",
        events: [
          { kind: "quality", event: activityEvent() },
          { kind: "quality", event: activityEvent(false) },
        ],
        pagination: {
          page: 1,
          limit: 25,
          total: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    );
  });
  const view = mount();
  try {
    await screen.findByText("Actual colleague");
    const observe = screen.getAllByRole("button", {
      name: "التحقق من النتيجة الأصلية",
    });
    expect(observe).toHaveLength(1);
    if (!observe[0]) throw new Error("Own observation control required");
    fireEvent.click(observe[0]);
    await screen.findByRole("alert");
    expect(
      transport.get.mock.calls.some(
        ([path]) => path === `/quality-commands/${id(601)}`,
      ),
    ).toBe(true);
    expect(
      transport.get.mock.calls.some(
        ([path]) => path === `/quality-commands/${id(602)}`,
      ),
    ).toBe(false);
    expect(transport.post).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /إعادة نفس/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("عملياتي فقط")).not.toBeInTheDocument();
  } finally {
    view.unmount();
  }
});
it.each([
  ["waiting", "INCOMING"],
  ["sent", "ACCEPTED"],
] as const)(
  "retains the %s alias with its exact canonical query",
  async (alias, expected) => {
    route.path = `/quality/${alias}`;
    transport.get.mockImplementation((_path, options) => {
      const query = qualityOrdersQuerySchema.parse(options?.params);
      expect(query.view).toBe(expected);
      return Promise.resolve(
        p03Envelope({
          department: "QUALITY",
          view: expected,
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
        }),
      );
    });
    const view = mount();
    try {
      await screen.findByText("لا توجد أوامر مطابقة في هذا القسم.");
      expect(transport.get).toHaveBeenCalledTimes(1);
      expect(transport.post).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  },
);

it("does not publish a late read-only observation after activity navigation", async () => {
  route.path = "/quality/activity";
  let release: (value: unknown) => void = () => undefined;
  const gate = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  transport.get.mockImplementation((path) =>
    path.startsWith("/quality-commands/")
      ? gate
      : Promise.resolve(
          p03Envelope(
            path.endsWith("/dashboard")
              ? dashboard()
              : {
                  department: "QUALITY",
                  events: [{ kind: "quality", event: activityEvent() }],
                  pagination: {
                    page: 1,
                    limit: 25,
                    total: 1,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPreviousPage: false,
                  },
                },
          ),
        ),
  );
  const view = mount();
  try {
    fireEvent.click(
      await screen.findByRole("button", { name: "التحقق من النتيجة الأصلية" }),
    );
    await waitFor(() => {
      expect(
        transport.get.mock.calls.some(([path]) =>
          path.startsWith("/quality-commands/"),
        ),
      ).toBe(true);
    });
    route.path = "/quality/dashboard";
    view.rerender(
      <QueryClientProvider client={client}>
        <QualityWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText("37 قطعة");
    await act(async () => {
      release(
        p03Envelope({
          kind: "quality-command",
          replayed: false,
          receipt: {
            commandId: id(601),
            operation: "CONTINUE",
            actor: activityEvent().actor,
            occurredAt: "2026-11-11T10:00:00.000Z",
          },
          outcome: {
            orders: [
              {
                orderId: p03Ids.order,
                eventId: id(501),
                beforeVersion: 2,
                afterVersion: 3,
                packingGroupId: null,
                pieces: activityEvent().pieces,
              },
            ],
          },
        }),
      );
      await gate;
    });
    expect(
      screen.queryByText(/تم التحقق من حفظ الإجراء/),
    ).not.toBeInTheDocument();
    expect(transport.post).not.toHaveBeenCalled();
  } finally {
    release(p03Envelope({}));
    await gate;
    view.unmount();
  }
});

it("retains dashboard counts during failed refresh and recovers only through read retry", async () => {
  transport.get.mockResolvedValue(p03Envelope(dashboard()));
  const view = mount();
  let rejectRead: (reason: Error) => void = () => {};
  const gate = new Promise<unknown>((_resolve, reject) => {
    rejectRead = reject;
  });
  let refresh: Promise<void> | undefined;
  try {
    await screen.findByText("37 قطعة");
    transport.get.mockImplementation(() => gate);
    act(() => {
      refresh = client.refetchQueries({ queryKey: ["p06"], type: "active" });
    });
    expect(await screen.findByText("جارٍ تحديث لوحة الجودة…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByText("37 قطعة")).toBeInTheDocument();
    await act(async () => {
      rejectRead(new Error("Transient read failure"));
      await refresh;
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تحديث لوحة الجودة",
    );
    expect(screen.getByText("37 قطعة")).toBeInTheDocument();
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeDefined();
    transport.get.mockResolvedValue(p03Envelope(dashboard()));
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(transport.post).not.toHaveBeenCalled();
  } finally {
    rejectRead(new Error("Owned cleanup"));
    await refresh;
    view.unmount();
  }
});

it("removes cached Quality counts after recognized department denial refreshes the actual session", async () => {
  transport.get.mockResolvedValue(p03Envelope(dashboard()));
  const view = mount();
  try {
    await screen.findByText("37 قطعة");
    const denial = new AxiosError("Owned department denial");
    denial.response = {
      status: 403,
      statusText: "Forbidden",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 403,
        code: "DEPARTMENT_ACCESS_DENIED",
        message: "Safe",
        requestId: "owned-denial",
        timestamp: p03Instant,
        path: "/quality/dashboard",
      },
    };
    transport.get.mockImplementation((path) =>
      path === "/users/me"
        ? Promise.resolve(
            p03Envelope(
              authUserDataSchema.parse({
                user: { ...p03Session().user, department: "PRODUCTION" },
              }),
            ),
          )
        : Promise.reject(denial),
    );
    await act(async () => {
      await client.refetchQueries({ queryKey: ["p06"], type: "active" });
    });
    await waitFor(() =>
      expect(screen.queryByText("37 قطعة")).not.toBeInTheDocument(),
    );
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toMatchObject({
      user: { department: "PRODUCTION" },
    });
    expect(transport.post).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});

it("keeps an open queue inspection draft but blocks every submit until the main read recovers", async () => {
  route.path = "/quality/inspection";
  const detail = qualityDetail(),
    group = summary(detail);
  const read = (path: string) =>
    Promise.resolve(
      p03Envelope(path.endsWith("/orders") ? orderPage([group]) : detail),
    );
  transport.get.mockImplementation(read);
  transport.post.mockRejectedValue(new Error("Owned write response lost"));
  const view = mount();
  let rejectRead: (error: Error) => void = () => {};
  const gate = new Promise<unknown>((_resolve, reject) => {
    rejectRead = reject;
  });
  let refresh: Promise<void> | undefined;
  let restoreUuid: (() => void) | undefined;
  try {
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(group.businessNumber),
      }),
    );
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: `تحديد قطع ${group.businessNumber}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "تسجيل نتيجة فحص المحدد" }),
    );
    const dialog = await screen.findByRole("dialog");
    for (const choice of within(dialog).getAllByLabelText("نتيجة القطعة"))
      fireEvent.change(choice, { target: { value: "ACCEPT" } });
    const note = within(dialog).getByLabelText("ملاحظات فاحص الجودة (اختياري)");
    fireEvent.change(note, { target: { value: "Retained inspection note" } });
    const submit = within(dialog).getByRole("button", {
      name: "تأكيد نتيجة الفحص",
    });
    const form = note.closest("form");
    if (!form) throw new Error("Inspection form required");
    const uuid = vi.spyOn(crypto, "randomUUID");
    restoreUuid = () => {
      uuid.mockRestore();
    };
    transport.get.mockImplementation((path) =>
      path.endsWith("/orders") ? gate : read(path),
    );
    act(() => {
      refresh = client.refetchQueries({ queryKey: ["p06"], type: "active" });
    });
    await waitFor(() => expect(submit).toBeDisabled());
    expect(note).toBeEnabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent("تحديث");
    await act(() => {
      fireEvent.submit(form);
      return Promise.resolve();
    });
    expect(transport.post).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    await act(async () => {
      rejectRead(new Error("Owned read failure"));
      await refresh;
    });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "تحديث قائمة الجودة",
    );
    expect(submit).toBeDisabled();
    await act(() => {
      fireEvent.submit(form);
      return Promise.resolve();
    });
    expect(transport.post).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(note).toHaveValue("Retained inspection note");
    transport.get.mockImplementation(read);
    const retry = within(dialog).getByRole("button", {
      name: "إعادة المحاولة",
    });
    retry.focus();
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    await waitFor(() => expect(submit).toBeEnabled());
    expect(note).toHaveValue("Retained inspection note");
    expect(dialog).toHaveFocus();
    expect(transport.post).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() => {
      expect(transport.post).toHaveBeenCalledTimes(1);
    });
    expect(
      qualityCommandBodySchema.parse(transport.post.mock.calls[0]?.[1]),
    ).toMatchObject({
      operation: "INSPECT",
      orders: [
        {
          orderId: detail.paper.order.id,
          expectedVersion: detail.paper.order.version,
          inspectorNote: "Retained inspection note",
          packing: null,
          decisions: detail.paper.order.pieces.map((piece) => ({
            pieceId: piece.id,
            decision: "ACCEPT",
          })),
        },
      ],
    });
    expect(uuid).toHaveBeenCalledTimes(1);
  } finally {
    rejectRead(new Error("Owned cleanup"));
    await refresh;
    view.unmount();
    restoreUuid?.();
  }
});
