import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  salesOrderSchema,
  salesOrderCommandDataSchema,
  setOrderPaidBodySchema,
  authUserDataSchema,
  draftSchema,
  draftCaptureSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { orderFixture, p03Ids } from "@/test/p03-fixtures";
import { readOperationalScope } from "@/shared/query/operational-scope";
import { orderKeys } from "../hooks/orders.hooks";
import { SalesOrderDetailView } from "./sales-order-detail-view";

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get, patch: mocks.patch },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  other = "99999999-9999-4999-8999-999999999999",
  id = "22222222-2222-4222-8222-222222222222",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
const response = (data: unknown) => ({
  data: {
    success: true,
    statusCode: 200,
    message: "OK",
    requestId: "safe-request",
    timestamp: instant,
    path: "/api/v1/sales-drafts",
    data,
  },
});
const failure = (
  status = 503,
  code = status === 404 ? "DRAFT_NOT_FOUND" : "HTTP_ERROR",
) =>
  new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "Could not complete",
      requestId: "safe-request",
      timestamp: instant,
      path: "/api/v1/sales-drafts",
    },
  });
const pagination = (page = 1, limit = 25, total = 26) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPreviousPage: page > 1,
});
const change = (page = 1) => ({
  commandId:
    page === 1
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444",
  operation: page === 1 ? "CREATE_DRAFT" : "SAVE_DRAFT",
  draftId: id,
  actor: {
    id: actor,
    fullName: page === 1 ? "Actual first actor" : "Actual second actor",
    role: "USER",
    department: "SALES",
  },
  occurredAt: instant,
  beforeVersion: page === 1 ? null : 1,
  afterVersion: page,
  changedFields: ["generalNotes"],
  addedPieceIds: [],
  removedPieceIds: [],
});
const fullDraft = () => {
  const capture = draftCaptureSchema.parse({
    type: "SHOP",
    generalNotes: "Actual saved notes",
    paidAmount: "12.30",
    pieces: [
      { id: "55555555-5555-4555-8555-555555555555", model: "Captured model" },
    ],
  });
  const { customerId, ...headers } = capture;
  return draftSchema.parse({
    ...headers,
    id,
    version: 1,
    status: "DRAFT",
    owner: { id: actor, fullName: "Actual owner" },
    customer: customerId === null ? null : null,
    pieces: capture.pieces.map((piece, index) => ({
      ...piece,
      position: index + 1,
      quantity: 1,
    })),
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
  });
};
const session = (subject = actor, admin = false) => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, subject);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: {
        id: subject,
        fullName: admin ? "Admin viewer" : "Sales viewer",
        email: "sales@example.test",
        phone: null,
        role: admin ? "ADMIN" : "USER",
        status: "ACTIVE",
        department: admin ? null : "SALES",
        staffApprovedAt: admin ? null : instant,
        emailVerifiedAt: instant,
        accessVersion: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    }),
  );
};
let fail = false;
beforeEach(() => {
  vi.resetAllMocks();
  fail = false;
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  session();
  mocks.get.mockImplementation(
    (url: string, config?: { params?: { page?: number; limit?: number } }) => {
      if (fail) throw failure();
      const page = config?.params?.page ?? 1,
        limit = config?.params?.limit ?? 25;
      if (url === `/sales-order-editor/${id}`)
        return response({ kind: "draft", draft: fullDraft() });
      if (url.endsWith("/changes"))
        return response({
          changes: [change(page)],
          pagination: pagination(page, limit),
        });
      throw new Error(`Unexpected read ${url}`);
    },
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <SalesOrderDetailView orderId={id} />
    </QueryClientProvider>,
  );
it.each([false, true])(
  "retains actual draft tabs/owner/paper for admin=%j without inventing manufacturing or print",
  async (admin) => {
    if (admin) session(other, true);
    mount();
    await screen.findByText(/مندوب المبيعات: Actual owner/u);
    expect(
      screen.getByRole("button", { name: "معاينة الطباعة" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "معاينة الطباعة" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/لا يوجد مسار تصنيع/u)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /ورقة المسودة غير المقدمة/u }),
    );
    await screen.findByText("Actual saved notes");
    expect(screen.getByText("Captured model")).toBeInTheDocument();
    expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
    expect(screen.queryByText("ريم خالد")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /سجل تغييرات المسودة/u }),
    );
    await screen.findByText("Actual first actor");
    expect(screen.getByText("الملاحظات العامة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
    await screen.findByText("Actual second actor");
    expect(screen.queryByText("Actual first actor")).not.toBeInTheDocument();
  },
);
it("missing or denied draft does not mount paper/history or fall back to local records", async () => {
  session(other);
  mocks.get.mockRejectedValue(failure(404));
  mount();
  await screen.findByText(/الطلب غير موجود أو تعذّر تحميله/u);
  expect(
    screen.queryByRole("button", { name: /ورقة المسودة/u }),
  ).not.toBeInTheDocument();
  expect(
    mocks.get.mock.calls.every(
      (call) => call[0] === `/sales-order-editor/${id}`,
    ),
  ).toBe(true);
});
it("suppresses a deferred old-epoch detail after account replacement", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized");
  };
  mocks.get.mockImplementationOnce(
    () =>
      new Promise<ReturnType<typeof response>>((resolve) => {
        release = () => {
          resolve(response({ kind: "draft", draft: fullDraft() }));
        };
      }),
  );
  mount();
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  mocks.get.mockRejectedValue(failure(404));
  act(() => {
    session(other);
    release();
  });
  await screen.findByText(/الطلب غير موجود أو تعذّر تحميله/u);
  expect(screen.queryByText(/Actual owner/u)).not.toBeInTheDocument();
});

it.each([
  { amount: "450.50", due: "199.50", surplus: "0.00" },
  { amount: "700.00", due: "0.00", surplus: "50.00" },
  { amount: "250.00", due: "400.00", surplus: "0.00" },
])(
  "replaces cumulative paid with $amount while every specification stays locked",
  async ({ amount, due, surplus }) => {
    let order = salesOrderSchema.parse({
      ...orderFixture(),
      status: "APPROVED",
      money: {
        total: "650.00",
        paidAmount: "300.00",
        remainingDue: "350.00",
        surplus: "0.00",
      },
      allowedActions: { canResubmit: false, canSetPaid: true },
      pieces: orderFixture().pieces.map((piece) => ({
        ...piece,
        unitPrice: "650.00",
      })),
    });
    mocks.get.mockImplementation((url: string) => {
      if (url === `/sales-order-editor/${id}`)
        return response({ kind: "submitted", order });
      if (url === `/sales-orders/${id}`) return response({ order });
      if (url === `/sales-orders/${id}/tracking`)
        return response({
          orderId: id,
          orderVersion: order.version,
          counts: order.counts,
          pieces: order.pieces.map((piece) => ({
            pieceId: piece.id,
            stage: piece.stage,
            workState: piece.workState,
            receivedAt: piece.receivedAt,
            cancelledAt: piece.cancelledAt,
            cancellationReason: piece.cancellationReason,
          })),
        });
      throw new Error(`Unexpected read ${url}`);
    });
    mocks.patch.mockImplementation((_url: string, raw: unknown) => {
      const body = setOrderPaidBodySchema.parse(raw);
      order = salesOrderSchema.parse({
        ...order,
        version: 2,
        money: {
          total: "650.00",
          paidAmount: body.paidAmount,
          remainingDue: due,
          surplus,
        },
      });
      return response(
        salesOrderCommandDataSchema.parse({
          kind: "order",
          savedOrder: order,
          replayed: false,
          receipt: {
            commandId: body.commandId,
            operation: "SET_ORDER_PAID",
            resourceId: id,
            actor: {
              id: actor,
              fullName: "Actual actor",
              role: "USER",
              department: "SALES",
            },
            beforeVersion: 1,
            afterVersion: 2,
            occurredAt: instant,
          },
        }),
      );
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /الورقة الرسمية/u }),
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "تعديل المبلغ المدفوع" }),
    );
    const input = screen.getByRole("textbox", { name: "تعديل المبلغ المدفوع" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المدفوع" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: amount } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المدفوع" }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ المدفوع" }));
    await waitFor(() =>
      expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent(
        amount,
      ),
    );
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("الباقي المعتمد")).toHaveTextContent(due);
    if (surplus !== "0.00")
      expect(screen.getByLabelText("رصيد العميل الزائد")).toHaveTextContent(
        surplus,
      );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "تعديل المبلغ المدفوع" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "إلغاء تعديل المدفوع" }),
    );
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  },
);

it("loads retained before/after values only after history expansion and keeps the current version separate", async () => {
  const before = orderFixture(1),
    after = salesOrderSchema.parse({
      ...orderFixture(2),
      generalNotes: "Current revision note",
    });
  const event = {
    id: p03Ids.command,
    orderId: id,
    orderVersion: 2,
    businessNumber: after.businessNumber,
    operation: "RESUBMIT_ORDER",
    pieceIds: after.pieces.map((piece) => piece.id),
    actor: {
      id: actor,
      fullName: "Actual revision actor",
      role: "USER",
      department: "SALES",
    },
    occurredAt: instant,
    notes: null,
    changedFields: ["generalNotes"],
    paidChange: null,
  };
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order: after });
    if (url === `/sales-orders/${id}`) return response({ order: after });
    if (url.endsWith("/tracking"))
      return response({
        orderId: id,
        orderVersion: 2,
        counts: after.counts,
        pieces: after.pieces.map((piece) => ({
          pieceId: piece.id,
          stage: piece.stage,
          workState: piece.workState,
          receivedAt: piece.receivedAt,
          cancelledAt: piece.cancelledAt,
          cancellationReason: piece.cancellationReason,
        })),
      });
    if (url === `/sales-orders/${id}/activity`)
      return response({
        events: [{ kind: "order", event }],
        pagination: pagination(1, 25, 1),
      });
    if (url === `/sales-orders/${id}/activity/${p03Ids.command}`)
      return response({
        event,
        before: { kind: "order", order: before },
        after,
      });
    throw new Error(`Unexpected read ${url}`);
  });
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /سجل الحركات والتوقيتات/u }),
  );
  const expand = await screen.findByRole("button", {
    name: "عرض القيم السابقة واللاحقة",
  });
  expect(
    mocks.get.mock.calls.some(
      (call) => call[0] === `/sales-orders/${id}/activity/${p03Ids.command}`,
    ),
  ).toBe(false);
  fireEvent.click(expand);
  await screen.findByText("قبل التغيير");
  await screen.findByText("بعد التغيير");
  expect(screen.getByText("Current revision note")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إغلاق التفاصيل" }));
  expect(screen.queryByText("قبل التغيير")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /الورقة الرسمية/u }));
  expect(screen.getByText("Current revision note")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "الطباعة الرسمية غير متاحة" }),
  ).toBeDisabled();
});

it.each(["unchanged", "lost-response", "refresh-failure"] as const)(
  "keeps paid recovery truthful for %s without an extra write",
  async (outcome) => {
    let order = salesOrderSchema.parse({
      ...orderFixture(),
      status: "APPROVED",
      allowedActions: { canResubmit: false, canSetPaid: true },
    });
    let saved: ReturnType<typeof salesOrderCommandDataSchema.parse> | undefined;
    let failRead = false;
    mocks.get.mockImplementation((url: string) => {
      if (url.startsWith("/sales-commands/") && saved !== undefined)
        return response(saved);
      if (url === `/sales-order-editor/${id}`) {
        if (failRead) throw failure();
        return response({ kind: "submitted", order });
      }
      if (url === `/sales-orders/${id}`) {
        if (failRead) throw failure();
        return response({ order });
      }
      if (url.endsWith("/tracking"))
        return response({
          orderId: id,
          orderVersion: order.version,
          counts: order.counts,
          pieces: order.pieces.map((piece) => ({
            pieceId: piece.id,
            stage: piece.stage,
            workState: piece.workState,
            receivedAt: piece.receivedAt,
            cancelledAt: piece.cancelledAt,
            cancellationReason: piece.cancellationReason,
          })),
        });
      throw new Error(`Unexpected read ${url}`);
    });
    mocks.patch.mockImplementation((_url: string, raw: unknown) => {
      const body = setOrderPaidBodySchema.parse(raw);
      if (outcome === "unchanged") throw failure(409, "ORDER_PAID_UNCHANGED");
      order = salesOrderSchema.parse({
        ...order,
        version: 2,
        money: {
          total: "1800.00",
          paidAmount: body.paidAmount,
          remainingDue: "1700.00",
          surplus: "0.00",
        },
      });
      saved = salesOrderCommandDataSchema.parse({
        kind: "order",
        savedOrder: order,
        replayed: false,
        receipt: {
          commandId: body.commandId,
          operation: "SET_ORDER_PAID",
          resourceId: id,
          actor: {
            id: actor,
            fullName: "Actual actor",
            role: "USER",
            department: "SALES",
          },
          beforeVersion: 1,
          afterVersion: 2,
          occurredAt: instant,
        },
      });
      if (outcome === "lost-response")
        throw new AxiosError("Lost response", "ERR_NETWORK");
      failRead = true;
      return response(saved);
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /الورقة الرسمية/u }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "تعديل المبلغ المدفوع" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "تعديل المبلغ المدفوع" }),
      { target: { value: outcome === "unchanged" ? "0.00" : "100.00" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "حفظ المدفوع" }));
    if (outcome === "unchanged") {
      await screen.findByText("المبلغ مطابق للقيمة الحالية؛ لم يحدث تغيير.");
      expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent(
        "0.00",
      );
      expect(
        mocks.get.mock.calls.some((call) =>
          String(call[0]).startsWith("/sales-commands/"),
        ),
      ).toBe(false);
    } else {
      const recover = await screen.findByRole("button", {
        name: "التحقق وتحديث المدفوع",
      });
      expect(
        screen.getByRole("textbox", { name: "تعديل المبلغ المدفوع" }),
      ).toBeDisabled();
      failRead = false;
      fireEvent.click(recover);
      await waitFor(() => {
        expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent(
          "100.00",
        );
      });
    }
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  },
);

it("preserves a dirty paid amount on newer background data and requires explicit review before a new intent", async () => {
  let order = salesOrderSchema.parse({
    ...orderFixture(),
    status: "APPROVED",
    allowedActions: { canResubmit: false, canSetPaid: true },
  });
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order });
    if (url === `/sales-orders/${id}`) return response({ order });
    if (url.endsWith("/tracking"))
      return response({
        orderId: id,
        orderVersion: order.version,
        counts: order.counts,
        pieces: order.pieces.map((piece) => ({
          pieceId: piece.id,
          stage: piece.stage,
          workState: piece.workState,
          receivedAt: piece.receivedAt,
          cancelledAt: piece.cancelledAt,
          cancellationReason: piece.cancellationReason,
        })),
      });
    throw new Error(`Unexpected read ${url}`);
  });
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /الورقة الرسمية/u }),
  );
  fireEvent.click(screen.getByRole("button", { name: "تعديل المبلغ المدفوع" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "تعديل المبلغ المدفوع" }),
    { target: { value: "125.50" } },
  );
  mocks.patch.mockImplementation(() => {
    order = salesOrderSchema.parse({
      ...order,
      version: 2,
      money: {
        total: "1800.00",
        paidAmount: "200.00",
        remainingDue: "1600.00",
        surplus: "0.00",
      },
    });
    throw failure(409, "ORDER_VERSION_CONFLICT");
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ المدفوع" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "مراجعة المدفوع الحالي" }),
  );
  await screen.findByText(/ألغِ التعديل لبدء إدخال جديد/u);
  expect(
    screen.getByRole("textbox", { name: "تعديل المبلغ المدفوع" }),
  ).toHaveValue("125.50");
  fireEvent.click(screen.getByRole("button", { name: "حفظ المدفوع" }));
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "إلغاء تعديل المدفوع" }));
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("200.00");
  fireEvent.click(screen.getByRole("button", { name: "تعديل المبلغ المدفوع" }));
  expect(
    screen.getByRole("textbox", { name: "تعديل المبلغ المدفوع" }),
  ).toHaveValue("200.00");
});

it("does not combine tracking from an older version with current piece labels and allows read-only mismatch recovery", async () => {
  const order = salesOrderSchema.parse({
    ...orderFixture(2),
    pieces: orderFixture(2).pieces.map((piece) => ({
      ...piece,
      model: "Current-version model",
    })),
  });
  let version = 1;
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order });
    if (url === `/sales-orders/${id}`) return response({ order });
    if (url.endsWith("/tracking"))
      return response({
        orderId: id,
        orderVersion: version,
        counts: order.counts,
        pieces: order.pieces.map((piece) => ({
          pieceId: piece.id,
          stage: piece.stage,
          workState: piece.workState,
          receivedAt: piece.receivedAt,
          cancelledAt: piece.cancelledAt,
          cancellationReason: piece.cancellationReason,
        })),
      });
    throw new Error(`Unexpected read ${url}`);
  });
  mount();
  const retry = await screen.findByRole("button", {
    name: "تحديث بيانات التتبع والطلب",
  });
  expect(screen.queryByText("Current-version model")).not.toBeInTheDocument();
  version = 2;
  fireEvent.click(retry);
  await screen.findByText("Current-version model");
  expect(
    screen.queryByRole("button", { name: "تحديث بيانات التتبع والطلب" }),
  ).not.toBeInTheDocument();
  expect(mocks.patch).not.toHaveBeenCalled();
});

it("honors a newer reviewed editor over fresh older detail and tracking caches without a business write", async () => {
  const scope = readOperationalScope(client);
  if (scope === null) throw new Error("Expected scope");
  const older = salesOrderSchema.parse({
    ...orderFixture(2),
    status: "APPROVED",
    approval: { ...orderFixture(2).approval, approvedAt: instant },
    allowedActions: { canResubmit: false, canSetPaid: true },
  });
  const reviewed = salesOrderSchema.parse({
    ...orderFixture(3),
    generalNotes: "Newest reviewed notes",
    money: {
      total: "1800.00",
      paidAmount: "300.00",
      remainingDue: "1500.00",
      surplus: "0.00",
    },
  });
  const trackingFor = (order: typeof reviewed) => ({
    orderId: id,
    orderVersion: order.version,
    counts: order.counts,
    pieces: order.pieces.map((piece) => ({
      pieceId: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    })),
  });
  client.setQueryData(orderKeys.detail(scope, id), { order: older });
  client.setQueryData(orderKeys.tracking(scope, id), trackingFor(older));
  client.setQueryData(orderKeys.editor(scope, id), {
    kind: "submitted",
    order: reviewed,
  });
  let readsFail = true;
  let detail = older;
  let releaseDetail!: (reply: ReturnType<typeof response>) => void;
  let pendingDetail: Promise<ReturnType<typeof response>> | null = new Promise(
    (resolve) => {
      releaseDetail = resolve;
    },
  );
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order: reviewed });
    if (readsFail) throw failure();
    if (url === `/sales-orders/${id}`)
      return pendingDetail ?? response({ order: detail });
    if (url.endsWith("/tracking")) return response(trackingFor(reviewed));
    throw new Error(`Unexpected read ${url}`);
  });
  mount();
  const retry = await screen.findByRole("button", {
    name: "تحديث بيانات التتبع والطلب",
  });
  expect(screen.queryByText("SM")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "الورقة الرسمية لأمر التفصيل" }),
  );
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("300.00");
  expect(screen.getByText("Newest reviewed notes")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "تعديل المبلغ المدفوع" }),
  ).not.toBeInTheDocument();
  readsFail = false;
  fireEvent.click(
    screen.getByRole("button", { name: /تتبع أمر التفصيل ومسار الكميات/u }),
  );
  fireEvent.click(retry);
  await screen.findByText("SM");
  await act(async () => {
    releaseDetail(response({ order: older }));
    await pendingDetail;
  });
  fireEvent.click(
    screen.getByRole("button", { name: "الورقة الرسمية لأمر التفصيل" }),
  );
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("300.00");
  expect(screen.getByText("Newest reviewed notes")).toBeInTheDocument();
  pendingDetail = null;
  detail = salesOrderSchema.parse({
    ...reviewed,
    version: 4,
    generalNotes: "Version four",
    money: { ...reviewed.money, paidAmount: "400.00", remainingDue: "1400.00" },
  });
  await act(async () => {
    await client.refetchQueries({
      queryKey: orderKeys.detail(scope, id),
      exact: true,
    });
  });
  await screen.findByText("Version four");
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("400.00");
  expect(mocks.patch).not.toHaveBeenCalled();
});
