import { warehouseActivityEventSchema } from "@template/contracts";
import { factoryActivityFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  salesOrderSchema,
  salesOrderEditorDataSchema,
  approvalOrderDataSchema,
  approvalEventDataSchema,
  type SalesOrderDto,
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
  parseApiResponse,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  orderFixture,
  catalogFixture,
  p03Ids,
  p03Instant,
} from "@/test/p03-fixtures";
import {
  readOperationalScope,
  readP04OperationalScope,
} from "@/shared/query/operational-scope";
import { salesContactKeys } from "../hooks/sales-contact.hooks";
import { orderKeys } from "../hooks/orders.hooks";
import { SalesOrderDetailView } from "./sales-order-detail-view";

import { qualityActivityEventSchema } from "@template/contracts";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  contactGet: vi.fn(),
  post: vi.fn(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: {
    get: (path: string, config?: unknown): unknown => {
      const reply: unknown = path.startsWith("/sales-contact/orders/")
        ? mocks.contactGet(path, config)
        : mocks.get(path, config);
      return reply;
    },
    patch: mocks.patch,
    post: mocks.post,
  },
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
  // Existing P03 cases serve a canonical contact projection from the same synthetic server record.
  mocks.contactGet.mockImplementation(async () => {
    const reply: unknown = await mocks.get(`/sales-order-editor/${id}`);
    if (typeof reply !== "object" || reply === null || !("data" in reply))
      throw new Error("Missing editor response");
    const editor = parseApiResponse(
      reply.data,
      salesOrderEditorDataSchema,
    ).data;
    if (editor.kind !== "submitted")
      throw new Error("Contact requires a submitted record");
    const order = editor.order;
    return response(
      approvalOrderDataSchema.parse({
        order,
        workflow: {
          initialApproval: null,
          currentReturn:
            order.status === "RETURNED"
              ? {
                  decisionId: order.approval.returnDecisionId,
                  reason: order.approval.returnReason,
                  notes: null,
                  returnedAt: order.approval.returnedAt,
                }
              : null,
          allowedActions: { canApproveInitial: false, canReturnInitial: false },
          printEligibility: {
            allowed: false,
            reason: order.status === "RETURNED" ? "RETURNED" : "NOT_APPROVED",
          },
          issues: [],
        },
      }),
    );
  });
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

const approvedOrder = (version = 3) =>
  salesOrderSchema.parse({
    ...orderFixture(version),
    status: "APPROVED",
    approval: { ...orderFixture(version).approval, approvedAt: instant },
    allowedActions: { canResubmit: false, canSetPaid: true },
    pieces: orderFixture(version).pieces.map((piece) => ({
      ...piece,
      stage: "CUTTING",
      workState: "INCOMING",
    })),
  });
const contactWrapper = (
  order: SalesOrderDto,
  {
    notes = null,
    issueState,
  }: {
    notes?: string | null;
    issueState?: "SALES_CONTACT" | "REAPPROVAL";
  } = {},
) => {
  const piece = order.pieces[0];
  if (!piece?.model || !piece.size || !piece.leatherBase)
    throw new Error("Missing captured specifications");
  const reviewer = {
    id: other,
    fullName: "Actual approver",
    role: "USER",
    department: "APPROVAL",
  };
  const values = {
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    sole: piece.sole,
    catalogSelections: {
      model: null,
      size: null,
      leatherBase: null,
      sole: null,
    },
  };
  const reason =
    order.status === "RETURNED"
      ? "RETURNED"
      : order.approval.approvedAt === null
        ? "NOT_APPROVED"
        : issueState === "REAPPROVAL"
          ? "PENDING_REAPPROVAL"
          : null;
  return approvalOrderDataSchema.parse({
    order,
    workflow: {
      initialApproval:
        order.approval.approvedAt === null
          ? null
          : {
              decisionId: p03Ids.source,
              orderVersion: 1,
              actor: reviewer,
              approvedAt: order.approval.approvedAt,
            },
      currentReturn:
        order.status === "RETURNED"
          ? {
              decisionId: order.approval.returnDecisionId,
              reason: order.approval.returnReason,
              notes,
              returnedAt: order.approval.returnedAt,
            }
          : null,
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: { allowed: reason === null, reason },
      issues:
        issueState === undefined
          ? []
          : [
              {
                id: p03Ids.source,
                orderId: order.id,
                pieceId: piece.id,
                state: issueState,
                reportedAt: instant,
                reason: "Selected piece factory report",
                notes: null,
                resumeTarget: "PRODUCTION",
                instructions: {
                  commandId: p03Ids.command,
                  actor: reviewer,
                  occurredAt: instant,
                  text: "Confirm this exact piece with its owner",
                },
                allowedActions: {
                  canResolve: false,
                  canSubmitContact: issueState === "SALES_CONTACT",
                  canReviewContact: false,
                },
                source: {
                  department: "CUTTING",
                  stage: "CUTTING",
                  workState: "IN_PROGRESS",
                },
                reporter: {
                  id: other,
                  fullName: "Actual reporter",
                  role: "USER",
                  department: "CUTTING",
                },
                currentProposal:
                  issueState === "REAPPROVAL"
                    ? {
                        id: p03Ids.customer,
                        kind: "AMEND",
                        contactNotes: "Customer proposed size 40.5",
                        before: values,
                        proposed: { ...values, size: "40.5" },
                        submittedBy: {
                          id: actor,
                          fullName: "Actual owner",
                          role: "USER",
                          department: "SALES",
                        },
                        submittedAt: instant,
                      }
                    : null,
              },
            ],
    },
  });
};
const serveSubmitted = (current: () => SalesOrderDto) => {
  mocks.get.mockImplementation((url: string) => {
    const order = current();
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order });
    if (url === `/sales-orders/${id}`) return response({ order });
    if (url === `/sales-orders/${id}/tracking`)
      return response({
        orderId: order.id,
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
    if (url === "/catalogs") return response(catalogFixture());
    if (url.endsWith("/activity"))
      return response({ events: [], pagination: pagination(1, 25, 0) });
    throw new Error(`Unexpected read ${url}`);
  });
};
it.each([null, "Separate actual reviewer notes"])(
  "loads current return context for a returned order without an issue, notes=%j",
  async (notes) => {
    const order = salesOrderSchema.parse({
      ...orderFixture(3),
      status: "RETURNED",
      approval: {
        ...orderFixture(3).approval,
        returnDecisionId: p03Ids.source,
        returnRevision: 3,
        returnReason: "Clarify the original specification",
        returnedAt: instant,
      },
      allowedActions: { canResubmit: true, canSetPaid: false },
    });
    serveSubmitted(() => order);
    mocks.contactGet.mockResolvedValue(
      response(contactWrapper(order, { notes })),
    );
    mount();
    expect(
      await screen.findByText("Clarify the original specification"),
    ).toBeInTheDocument();
    if (notes === null)
      expect(
        screen.queryByText("Separate actual reviewer notes"),
      ).not.toBeInTheDocument();
    else expect(screen.getByText(notes)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "التواصل مع العميل" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "تصحيح وإعادة الإرسال" }),
    ).toHaveAttribute("href", `/sales/orders/new?edit=${id}`);
    expect(mocks.contactGet).toHaveBeenCalledWith(
      `/sales-contact/orders/${id}`,
      expect.anything(),
    );
  },
);
it.each(["lower", "higher"])(
  "withholds actions until the %s wrapper/detail side has reconciled to the same version",
  async (direction) => {
    let order = approvedOrder(3);
    serveSubmitted(() => order);
    let release: (reply: ReturnType<typeof response>) => void = () => {
      throw new Error("Missing pending read");
    };
    const pending = new Promise<ReturnType<typeof response>>((resolve) => {
      release = resolve;
    });
    if (direction === "lower")
      mocks.contactGet
        .mockResolvedValueOnce(response(contactWrapper(approvedOrder(2))))
        .mockReturnValue(pending);
    else {
      mocks.contactGet.mockResolvedValue(
        response(contactWrapper(approvedOrder(4))),
      );
      let detailReads = 0;
      const baseGet = mocks.get.getMockImplementation();
      if (!baseGet) throw new Error("Missing server");
      mocks.get.mockImplementation((url: string) => {
        if (url === `/sales-orders/${id}` && ++detailReads > 1) return pending;
        const reply: unknown = baseGet(url);
        return reply;
      });
    }
    mount();
    expect(
      await screen.findByText(
        "جارٍ مطابقة سياق التواصل مع نسخة الطلب الحالية.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "معاينة الطباعة" }),
    ).not.toBeInTheDocument();
    act(() => {
      if (direction === "lower") release(response(contactWrapper(order)));
      else {
        order = approvedOrder(4);
        release(response({ order }));
      }
    });
    expect(
      await screen.findByRole("link", { name: "معاينة الطباعة" }),
    ).toHaveAttribute("href", `/print/order/${id}`);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  },
);
it("keeps a dirty paid editor while a failed wrapper refresh suppresses print and contact authority", async () => {
  const order = approvedOrder();
  serveSubmitted(() => order);
  mocks.contactGet.mockResolvedValue(response(contactWrapper(order)));
  mount();
  await screen.findByRole("link", { name: "معاينة الطباعة" });
  fireEvent.click(
    screen.getByRole("button", { name: "الورقة الرسمية لأمر التفصيل" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "تعديل المبلغ المدفوع" }));
  const paid = screen.getByRole("textbox", { name: "تعديل المبلغ المدفوع" });
  fireEvent.change(paid, { target: { value: "125.50" } });
  const scope = readP04OperationalScope(client, "SALES_CONTACT");
  if (!scope) throw new Error("Missing contact scope");
  mocks.contactGet.mockRejectedValue(new Error("Wrapper refresh failed"));
  await act(async () => {
    await client.refetchQueries({
      queryKey: salesContactKeys.order(scope, id),
    });
  });
  expect(
    await screen.findByText(/تعذّر تحديث سياق التواصل والطباعة/),
  ).toBeInTheDocument();
  expect(paid).toHaveValue("125.50");
  expect(
    screen.queryByRole("link", { name: "معاينة الطباعة" }),
  ).not.toBeInTheDocument();
  expect(mocks.patch).not.toHaveBeenCalled();
});
it("opens the owner's exact referred piece and keeps its recovery when the modal closes", async () => {
  const order = salesOrderSchema.parse({
    ...approvedOrder(),
    pieces: approvedOrder().pieces.map((piece) => ({
      ...piece,
      workState: "BLOCKED",
    })),
  });
  serveSubmitted(() => order);
  mocks.contactGet.mockResolvedValue(
    response(contactWrapper(order, { issueState: "SALES_CONTACT" })),
  );
  mocks.post.mockRejectedValue(new Error("Lost contact submission"));
  mount();
  const open = await screen.findByRole("button", { name: "التواصل مع العميل" });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  fireEvent.change(
    await screen.findByLabelText("ملاحظات تواصل المبيعات مع العميل *:"),
    { target: { value: "Customer confirmed these retained specifications" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "إرسال المقترح للاعتماد" }),
  );
  expect(
    await screen.findByText(
      "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
  expect(
    screen.getByRole("button", { name: "إعادة نفس العملية" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "معاينة الطباعة" }),
  ).not.toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledWith(
    `/sales-contact/orders/${id}/pieces/${p03Ids.piece}/issues/${p03Ids.source}/proposals`,
    expect.objectContaining({ expectedVersion: 3, kind: "AMEND", changes: {} }),
  );
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("keeps a submitted proposal visibly held with no response or official-print action", async () => {
  const order = salesOrderSchema.parse({
    ...approvedOrder(),
    pieces: approvedOrder().pieces.map((piece) => ({
      ...piece,
      workState: "BLOCKED",
    })),
  });
  serveSubmitted(() => order);
  mocks.contactGet.mockResolvedValue(
    response(contactWrapper(order, { issueState: "REAPPROVAL" })),
  );
  mount();
  expect(await screen.findByText("بانتظار إعادة الاعتماد")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "التواصل مع العميل" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "معاينة الطباعة" }),
  ).not.toBeInTheDocument();
});
it("drops a late old-account wrapper without restoring its return notes or actions", async () => {
  const order = approvedOrder();
  serveSubmitted(() => order);
  let release: (reply: ReturnType<typeof response>) => void = () => {
    throw new Error("Missing pending wrapper");
  };
  mocks.contactGet.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  mount();
  await screen.findByText(/مندوب المبيعات:/);
  await waitFor(() => {
    expect(mocks.contactGet).toHaveBeenCalledTimes(1);
  });
  act(() => {
    mocks.get.mockRejectedValue(failure(404));
    session(other);
    release(response(contactWrapper(order)));
  });
  await waitFor(() =>
    expect(screen.queryByText(/مندوب المبيعات:/)).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("link", { name: "معاينة الطباعة" }),
  ).not.toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
});

const retainedApprovalEvent = () => {
  const order = orderFixture(2),
    piece = order.pieces[0];
  if (!piece?.model || !piece.size || !piece.leatherBase)
    throw new Error("Missing retained piece");
  const proposal = {
    id: p03Ids.customer,
    kind: "AMEND",
    contactNotes: "Customer proposed historical size 40.5",
    before: {
      model: piece.model,
      size: "40",
      leatherBase: piece.leatherBase,
      sole: piece.sole,
      catalogSelections: {
        model: null,
        size: null,
        leatherBase: null,
        sole: null,
      },
    },
    proposed: {
      model: piece.model,
      size: "40.5",
      leatherBase: piece.leatherBase,
      sole: piece.sole,
      catalogSelections: {
        model: null,
        size: p03Ids.customer,
        leatherBase: null,
        sole: null,
      },
    },
    submittedBy: {
      id: actor,
      fullName: "Actual sales owner",
      role: "USER",
      department: "SALES",
    },
    submittedAt: instant,
  };
  const facts = {
    orderStatus: "APPROVED",
    approvedAt: instant,
    currentReturn: null,
    money: order.money,
    counts: order.counts,
    pieces: [
      {
        id: piece.id,
        stage: "CUTTING",
        workState: "BLOCKED",
        issueId: p03Ids.source,
        receivedAt: null,
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    issue: {
      id: p03Ids.source,
      state: "REAPPROVAL",
      sourceDepartment: "CUTTING",
      sourceStage: "CUTTING",
      sourceWorkState: "IN_PROGRESS",
      resumeTarget: "PRODUCTION",
      currentProposalId: proposal.id,
    },
    proposal,
  };
  return approvalEventDataSchema.parse({
    event: {
      id: p03Ids.command,
      orderId: id,
      orderVersion: 2,
      businessNumber: order.businessNumber,
      operation: "REVIEW_CONTACT",
      actor: {
        id: other,
        fullName: "Actual historical reviewer",
        role: "USER",
        department: "APPROVAL",
      },
      occurredAt: instant,
      pieceId: piece.id,
      issueId: p03Ids.source,
      proposalId: proposal.id,
      decision: "RETURN_TO_SALES",
      notes: "Confirm the exact size again",
      changedFields: ["issue"],
    },
    before: facts,
    after: { ...facts, issue: { ...facts.issue, state: "SALES_CONTACT" } },
  });
};
const installMixedHistory = (eventReply: () => unknown, total = 2) => {
  const order = salesOrderSchema.parse({
    ...approvedOrder(5),
    money: {
      ...approvedOrder(5).money,
      paidAmount: "300.00",
      remainingDue: "1500.00",
    },
  });
  serveSubmitted(() => order);
  mocks.contactGet.mockResolvedValue(response(contactWrapper(order)));
  const retained = retainedApprovalEvent();
  const legacyEvent = {
    id: p03Ids.command,
    orderId: id,
    orderVersion: 1,
    businessNumber: order.businessNumber,
    operation: "SUBMIT_NEW_ORDER",
    pieceIds: [p03Ids.piece],
    actor: {
      id: actor,
      fullName: "Actual original submitter",
      role: "USER",
      department: "SALES",
    },
    occurredAt: instant,
    notes: null,
    changedFields: ["status"],
    paidChange: null,
  };
  const baseGet = mocks.get.getMockImplementation();
  if (!baseGet) throw new Error("Missing synthetic server");
  mocks.get.mockImplementation(
    (url: string, config?: { params?: { page?: number } }): unknown => {
      if (url === `/sales-orders/${id}/activity`) {
        const page = config?.params?.page ?? 1;
        return response({
          events:
            page === 1
              ? [
                  { kind: "order", event: legacyEvent },
                  { kind: "approval", event: retained.event },
                ]
              : [],
          pagination: pagination(page, 25, total),
        });
      }
      if (url === `/approvals/orders/${id}/events/${p03Ids.command}`)
        return eventReply();
      if (url === `/sales-orders/${id}/activity/${p03Ids.command}`)
        return response({
          event: legacyEvent,
          before: null,
          after: orderFixture(1),
        });
      const reply: unknown = baseGet(url);
      return reply;
    },
  );
};
const openApprovalHistory = async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /سجل الحركات والتوقيتات/ }),
  );
  await screen.findByText("مراجعة تواصل العميل");
  const buttons = screen.getAllByRole("button", {
      name: "عرض القيم السابقة واللاحقة",
    }),
    approval = buttons[1];
  if (!approval) throw new Error("Missing P04 summary");
  fireEvent.click(approval);
};
it("uses the owner-capability P04 endpoint for retained proposal/reason facts while P03 keeps its full revision protocol", async () => {
  installMixedHistory(() => response(retainedApprovalEvent()));
  await openApprovalHistory();
  const facts = await screen.findByRole("region", {
    name: "تفاصيل قرار الاعتماد",
  });
  expect(
    await within(facts).findByText("Confirm the exact size again"),
  ).toBeInTheDocument();
  expect(within(facts).getAllByText("40.5")).toHaveLength(2);
  expect(
    within(facts).getByRole("heading", { name: "قبل القرار" }),
  ).toBeInTheDocument();
  expect(
    within(facts).getByRole("heading", { name: "بعد القرار" }),
  ).toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledWith(
    `/approvals/orders/${id}/events/${p03Ids.command}`,
    expect.anything(),
  );
  expect(
    mocks.get.mock.calls.some(
      (call: readonly unknown[]) =>
        call[0] === `/sales-orders/${id}/activity/${p03Ids.command}`,
    ),
  ).toBe(false);
  const legacy = screen.getAllByRole("button", {
    name: "عرض القيم السابقة واللاحقة",
  })[0];
  if (!legacy) throw new Error("Missing P03 event");
  fireEvent.click(legacy);
  expect(
    await screen.findByText("طلب جديد؛ لا توجد نسخة سابقة."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "تفاصيل قرار الاعتماد" }),
  ).not.toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledWith(
    `/sales-orders/${id}/activity/${p03Ids.command}`,
    expect.anything(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "الورقة الرسمية لأمر التفصيل" }),
  );
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("300.00");
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.patch).not.toHaveBeenCalled();
});
it.each(["wrong-order", "wrong-version", "denied"])(
  "withholds %s P04 facts and retries against the frozen selected summary",
  async (mode) => {
    let rejected = true;
    installMixedHistory(() => {
      if (!rejected) return response(retainedApprovalEvent());
      if (mode === "denied") throw failure(403);
      const detail = retainedApprovalEvent();
      return response({
        ...detail,
        event: {
          ...detail.event,
          ...(mode === "wrong-order"
            ? { orderId: other }
            : { orderVersion: 3 }),
        },
      });
    });
    await openApprovalHistory();
    expect(
      await screen.findByText("تعذّر تحميل تفاصيل القرار المطابقة."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Confirm the exact size again"),
    ).not.toBeInTheDocument();
    rejected = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل القرار" }));
    expect(
      await screen.findByText("Confirm the exact size again"),
    ).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  },
);
it("does not reopen an old P04 expansion when its delayed event arrives after a page change", async () => {
  let release: (reply: ReturnType<typeof response>) => void = () => {
    throw new Error("Missing delayed event");
  };
  const pending = new Promise<ReturnType<typeof response>>((resolve) => {
    release = resolve;
  });
  installMixedHistory(() => pending, 26);
  await openApprovalHistory();
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledWith(
      `/approvals/orders/${id}/events/${p03Ids.command}`,
      expect.anything(),
    );
  });
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledWith(
      `/sales-orders/${id}/activity`,
      expect.objectContaining({ params: { page: 2, limit: 25 } }),
    );
  });
  await act(async () => {
    release(response(retainedApprovalEvent()));
    await pending;
  });
  expect(
    screen.queryByRole("region", { name: "تفاصيل قرار الاعتماد" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Confirm the exact size again"),
  ).not.toBeInTheDocument();
});

it("joins a current detail refresh when a newer contact wrapper arrives instead of cancelling its coordinator", async () => {
  let order = approvedOrder(3);
  serveSubmitted(() => order);
  mocks.contactGet.mockImplementation(() => response(contactWrapper(order)));
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "معاينة الطباعة" }),
    ).toBeInTheDocument(),
  );
  await waitFor(() => {
    expect(client.isFetching()).toBe(0);
  });
  const salesScope = readOperationalScope(client),
    contactScope = readP04OperationalScope(client, "SALES_CONTACT");
  if (!salesScope || !contactScope) throw new Error("Missing owned scopes");
  const previousGet = mocks.get.getMockImplementation();
  if (!previousGet) throw new Error("Missing transport");
  let detailReads = 0,
    abortedReads = 0;
  const release: Array<() => void> = [];
  mocks.get.mockImplementation(
    (url: string, config?: { signal?: AbortSignal }) => {
      if (url !== `/sales-orders/${id}`) {
        const reply: unknown = previousGet(url, config);
        return reply;
      }
      detailReads++;
      return new Promise((resolve, reject) => {
        const aborted = () => {
          abortedReads++;
          reject(new Error("Coordinator request was cancelled"));
        };
        config?.signal?.addEventListener("abort", aborted, { once: true });
        release.push(() => {
          config?.signal?.removeEventListener("abort", aborted);
          resolve(response({ order }));
        });
      });
    },
  );
  let refresh!: Promise<string>;
  act(() => {
    refresh = client
      .refetchQueries(
        { queryKey: orderKeys.detail(salesScope, id), exact: true },
        { throwOnError: true },
      )
      .then(
        () => "refreshed",
        () => "cancelled",
      );
  });
  await waitFor(() => {
    expect(detailReads).toBe(1);
  });
  order = approvedOrder(4);
  act(() => {
    client.setQueryData(
      salesContactKeys.order(contactScope, id),
      contactWrapper(order),
    );
  });
  try {
    await waitFor(() =>
      expect(screen.getByText(/جارٍ مطابقة سياق التواصل/u)).toBeInTheDocument(),
    );
    expect(abortedReads).toBe(0);
    expect(detailReads).toBe(1);
  } finally {
    await act(async () => {
      for (const finish of release) finish();
      await refresh;
    });
  }
  expect(await refresh).toBe("refreshed");
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "معاينة الطباعة" }),
    ).toBeInTheDocument(),
  );
});

it("renders manufacturing work inline without expanding a financial or approval revision", async () => {
  const order = orderFixture(3),
    event = factoryActivityFixture();
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order });
    if (url === `/sales-orders/${id}`) return response({ order });
    if (url.endsWith("/tracking"))
      return response({
        orderId: id,
        orderVersion: 3,
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
    if (url.endsWith("/activity"))
      return response({
        events: [{ kind: "manufacturing", event }],
        pagination: pagination(1, 25, 1),
      });
    throw new Error(`Unexpected work-history read ${url}`);
  });
  mount();
  await screen.findByText(/Frozen contact/u);
  fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
  expect(await screen.findByText("Factory worker")).toBeInTheDocument();
  expect(screen.getByText(/1 قطعة/u)).toHaveTextContent("الإنتاج والإصلاح");
  expect(
    screen.queryByRole("button", { name: "عرض القيم السابقة واللاحقة" }),
  ).not.toBeInTheDocument();
  expect(
    mocks.get.mock.calls.some(
      ([url]) =>
        String(url).includes("/revisions/") || String(url).includes("/events/"),
    ),
  ).toBe(false);
});

const qualityHistoryFixture = () => {
  const source = factoryActivityFixture(),
    member = source.pieces[0];
  if (!member) throw new Error("Historical member required");
  const prior = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    next = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  return qualityActivityEventSchema.parse({
    id: source.id,
    commandId: source.commandId,
    orderId: source.orderId,
    orderVersion: source.orderVersion,
    businessNumber: source.businessNumber,
    department: "QUALITY",
    operation: "INSPECT",
    actor: {
      ...source.actor,
      department: "QUALITY",
      fullName: "Actual quality inspector",
    },
    occurredAt: source.occurredAt,
    report: null,
    pieces: [
      {
        pieceId: member.pieceId,
        visitId: member.visitId,
        decision: "REJECT",
        stage: "PRODUCTION",
        workState: "INCOMING",
        correctionId: next,
        issueId: null,
      },
    ],
    inspection: {
      decisions: [
        {
          pieceId: member.pieceId,
          decision: "REJECT",
          target: "PRODUCTION",
          reason: "Original defect",
          instructions: "Original correction instructions",
        },
      ],
      inspectorNote: null,
      packing: null,
    },
    correctionLinks: [
      {
        pieceId: member.pieceId,
        correctionId: prior,
        cycle: 1,
        action: "REJECTED",
      },
      {
        pieceId: member.pieceId,
        correctionId: next,
        cycle: 2,
        action: "OPENED",
      },
    ],
  });
};
it("renders quality work inline without expanding a financial or approval revision", async () => {
  const order = orderFixture(3),
    event = qualityHistoryFixture();
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order });
    if (url === `/sales-orders/${id}`) return response({ order });
    if (url.endsWith("/tracking"))
      return response({
        orderId: id,
        orderVersion: 3,
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
    if (url.endsWith("/activity"))
      return response({
        events: [{ kind: "quality", event }],
        pagination: pagination(1, 25, 1),
      });
    throw new Error(`Unexpected work-history read ${url}`);
  });
  mount();
  await screen.findByText(/Frozen contact/u);
  fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
  expect(
    await screen.findByText("Actual quality inspector"),
  ).toBeInTheDocument();
  expect(screen.getByText(/1 قطعة/u)).toHaveTextContent(
    "Original correction instructions",
  );
  expect(
    screen.queryByRole("button", { name: "عرض القيم السابقة واللاحقة" }),
  ).not.toBeInTheDocument();
  expect(
    mocks.get.mock.calls.some(
      ([url]) =>
        String(url).includes("/revisions/") || String(url).includes("/events/"),
    ),
  ).toBe(false);
});

const warehouseHistoryFixture = () => {
  const source = factoryActivityFixture(),
    actor = {
      ...source.actor,
      fullName: "Actual warehouse colleague",
      department: "WAREHOUSE",
    },
    pieceIds = source.pieces.map((piece) => piece.pieceId);
  return warehouseActivityEventSchema.parse({
    id: source.id,
    commandId: source.commandId,
    orderId: source.orderId,
    orderVersion: source.orderVersion,
    businessNumber: source.businessNumber,
    operation: "RECEIVE",
    actor,
    occurredAt: source.occurredAt,
    pieceIds,
    beforeStatus: "APPROVED",
    afterStatus: "READY_FOR_DELIVERY",
    receiptGroup: {
      id: source.id,
      orderId: source.orderId,
      pieceIds,
      actor,
      receivedAt: source.occurredAt,
      cartonCount: "2",
      storageLocation: "Shelf B-12",
      notes: "Original complete arrival <script>text</script>",
    },
    attempt: null,
    retry: null,
  });
};
it("renders warehouse work inline without expanding a financial or approval revision", async () => {
  const order = orderFixture(3),
    event = warehouseHistoryFixture();
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order });
    if (url === `/sales-orders/${id}`) return response({ order });
    if (url.endsWith("/tracking"))
      return response({
        orderId: id,
        orderVersion: 3,
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
    if (url.endsWith("/activity"))
      return response({
        events: [{ kind: "warehouse", event }],
        pagination: pagination(1, 25, 1),
      });
    throw new Error(`Unexpected work-history read ${url}`);
  });
  mount();
  await screen.findByText(/Frozen contact/u);
  fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
  expect(
    await screen.findByText("Actual warehouse colleague"),
  ).toBeInTheDocument();
  expect(screen.getByText(/1 قطعة/u)).toHaveTextContent(
    "Original complete arrival",
  );
  expect(
    screen.queryByRole("button", { name: "عرض القيم السابقة واللاحقة" }),
  ).not.toBeInTheDocument();
  expect(
    mocks.get.mock.calls.some(
      ([url]) =>
        String(url).includes("/revisions/") || String(url).includes("/events/"),
    ),
  ).toBe(false);
});

it.each(["ADMIN_CANCEL", "ADMIN_CORRECT"] as const)(
  "renders %s owner summary without requesting any domain revision",
  async (operation) => {
    const order = orderFixture(3),
      event = {
        id: p03Ids.command,
        orderId: p03Ids.order,
        orderVersion: 3,
        businessNumber: "SHOP-2026-0001",
        operation,
        actor: {
          id: p03Ids.actor,
          fullName: "Actual administrator",
          role: "ADMIN",
          department: null,
        },
        occurredAt: p03Instant,
        pieceIds: operation === "ADMIN_CANCEL" ? [p03Ids.piece] : [],
        changedFields:
          operation === "ADMIN_CANCEL"
            ? ["cancellation", "total"]
            : ["customerAddress", "generalNotes"],
      };
    mocks.get.mockImplementation((url: string) => {
      if (url === `/sales-order-editor/${id}`)
        return response({ kind: "submitted", order });
      if (url === `/sales-orders/${id}`) return response({ order });
      if (url.endsWith("/tracking"))
        return response({
          orderId: id,
          orderVersion: 3,
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
      if (url.endsWith("/activity"))
        return response({
          events: [{ kind: "administration", event }],
          pagination: pagination(1, 25, 1),
        });
      throw new Error("Unexpected receipt enrichment");
    });
    mount();
    await screen.findByText(/Frozen contact/u);
    fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
    expect(await screen.findByText("Actual administrator")).toBeInTheDocument();
    expect(screen.getByText(/إصدار الطلب: 3/u)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "عرض القيم السابقة واللاحقة" }),
    ).not.toBeInTheDocument();
  },
);
