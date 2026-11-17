import { warehouseActivityEventSchema } from "@template/contracts";
import { factoryActivityFixture } from "@/features/manufacturing/model/manufacturing.fixture";
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
import { authUserDataSchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { readOperationalScope } from "@/shared/query/operational-scope";
import { orderKeys } from "../hooks/orders.hooks";
import { SalesActivityView } from "./sales-activity-view";

import { qualityActivityEventSchema } from "@template/contracts";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get },
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
const failure = (status = 503) =>
  new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code: status === 404 ? "DRAFT_NOT_FOUND" : "HTTP_ERROR",
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
        staffApprovedAt: instant,
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
      if (url === "/sales-orders/activity")
        return response({
          events: [{ kind: "draft", change: change(page) }],
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
      <SalesActivityView />
    </QueryClientProvider>,
  );
it("renders only returned scoped actors/time/changes with page-only query and stable draft links", async () => {
  mount();
  await screen.findByText("Actual first actor");
  expect(screen.getByText("الملاحظات العامة")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: id })).toHaveAttribute(
    "href",
    `/sales/orders/${id}`,
  );
  expect(mocks.get).toHaveBeenCalledWith(
    "/sales-orders/activity",
    expect.objectContaining({ params: { page: 1, limit: 25 } }),
  );
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await screen.findByText("Actual second actor");
  expect(screen.queryByText("Actual first actor")).not.toBeInTheDocument();
  expect(screen.queryByText("ريم خالد")).not.toBeInTheDocument();
});
it("reports activity errors separately and retries without creating events", async () => {
  fail = true;
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByText("لا يوجد نشاط مسجل")).not.toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  await screen.findByText("Actual first actor");
});
it("hides an old-owner late activity page", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized");
  };
  mocks.get.mockImplementationOnce(
    () =>
      new Promise<ReturnType<typeof response>>((resolve) => {
        release = () => {
          resolve(
            response({
              events: [{ kind: "draft", change: change() }],
              pagination: pagination(),
            }),
          );
        };
      }),
  );
  mount();
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  mocks.get.mockResolvedValue(
    response({ events: [], pagination: pagination(1, 25, 0) }),
  );
  act(() => {
    session(other);
    release();
  });
  await screen.findByText("لا يوجد نشاط مسجل");
  expect(screen.queryByText("Actual first actor")).not.toBeInTheDocument();
});

it("shows submitted activity with actual actor, business reference and safe field labels", async () => {
  mocks.get.mockResolvedValue(
    response({
      events: [
        {
          kind: "order",
          event: {
            id: other,
            orderId: id,
            orderVersion: 2,
            businessNumber: "SHOP-2026-0001",
            operation: "SET_ORDER_PAID",
            pieceIds: [],
            actor: {
              id: actor,
              fullName: "Actual financial editor",
              role: "USER",
              department: "SALES",
            },
            occurredAt: instant,
            notes: null,
            changedFields: ["paidAmount"],
            paidChange: { before: "300.00", after: "450.50" },
          },
        },
      ],
      pagination: pagination(1, 25, 1),
    }),
  );
  mount();
  await screen.findByText("تعديل المبلغ المدفوع");
  expect(screen.getByText("Actual financial editor")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "SHOP-2026-0001" })).toHaveAttribute(
    "href",
    `/sales/orders/${id}`,
  );
  expect(screen.getByText("المبلغ المدفوع")).toBeInTheDocument();
  expect(screen.queryByText("paidAmount")).not.toBeInTheDocument();
});

it("renders mixed draft/P03/P04 histories with colliding IDs, actual decisions and retained refresh errors", async () => {
  const sharedId = "66666666-6666-4666-8666-666666666666";
  const events = [
    { kind: "draft", change: { ...change(), commandId: sharedId } },
    {
      kind: "order",
      event: {
        id: sharedId,
        orderId: id,
        orderVersion: 2,
        businessNumber: "SHOP-2026-0001",
        operation: "SET_ORDER_PAID",
        pieceIds: [],
        actor: {
          id: actor,
          fullName: "Actual financial editor",
          role: "USER",
          department: "SALES",
        },
        occurredAt: instant,
        notes: null,
        changedFields: ["paidAmount"],
        paidChange: { before: "300.00", after: "450.50" },
      },
    },
    {
      kind: "approval",
      event: {
        id: sharedId,
        orderId: id,
        orderVersion: 3,
        businessNumber: "SHOP-2026-0001",
        operation: "REVIEW_CONTACT",
        actor: {
          id: other,
          fullName: "Actual approval reviewer",
          role: "USER",
          department: "APPROVAL",
        },
        occurredAt: instant,
        pieceId: "33333333-3333-4333-8333-333333333333",
        issueId: "55555555-5555-4555-8555-555555555555",
        proposalId: "44444444-4444-4444-8444-444444444444",
        decision: "RETURN_TO_SALES",
        notes: "Confirm the requested size",
        changedFields: ["proposal", "issue"],
      },
    },
  ];
  mocks.get.mockImplementation(() => {
    if (fail) throw failure();
    return response({ events, pagination: pagination(1, 25, 3) });
  });
  mount();
  await screen.findByText("Actual approval reviewer");
  expect(screen.getByText("إنشاء مسودة")).toBeInTheDocument();
  expect(screen.getByText("تعديل المبلغ المدفوع")).toBeInTheDocument();
  expect(screen.getByText("مراجعة تواصل العميل")).toBeInTheDocument();
  expect(screen.getByText("إرجاع للمبيعات")).toBeInTheDocument();
  expect(screen.getByText("المقترح، المشكلة")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "SHOP-2026-0001" })).toHaveLength(
    2,
  );
  const scope = readOperationalScope(client);
  if (!scope) throw new Error("Missing scope");
  fail = true;
  await act(async () => {
    await client.refetchQueries({ queryKey: orderKeys.activity(scope, 1, 25) });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("safe-request");
  expect(screen.getByText("Actual approval reviewer")).toBeInTheDocument();
  expect(screen.queryByText("لا يوجد نشاط مسجل")).not.toBeInTheDocument();
});

it("renders a manufacturing event once with its actual worker and normal destination", async () => {
  const event = factoryActivityFixture();
  mocks.get.mockResolvedValue(
    response({
      events: [{ kind: "manufacturing", event }],
      pagination: pagination(1, 25, 1),
    }),
  );
  mount();
  expect(await screen.findByText("Factory worker")).toBeInTheDocument();
  expect(screen.getAllByText("إتمام وتحويل العمل")).toHaveLength(1);
  expect(screen.getByText(/1 قطعة/u)).toHaveTextContent("الإنتاج والإصلاح");
  expect(
    screen.getByRole("link", { name: event.businessNumber }),
  ).toHaveAttribute("href", `/sales/orders/${event.orderId}`);
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
it("renders a quality event once with its actual worker and normal destination", async () => {
  const event = qualityHistoryFixture();
  mocks.get.mockResolvedValue(
    response({
      events: [{ kind: "quality", event }],
      pagination: pagination(1, 25, 1),
    }),
  );
  mount();
  expect(
    await screen.findByText("Actual quality inspector"),
  ).toBeInTheDocument();
  expect(screen.getAllByText("تسجيل نتيجة الفحص والتغليف")).toHaveLength(1);
  expect(screen.getByText(/1 قطعة/u)).toHaveTextContent(
    "Original correction instructions",
  );
  expect(
    screen.getByRole("link", { name: event.businessNumber }),
  ).toHaveAttribute("href", `/sales/orders/${event.orderId}`);
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
it("renders a warehouse event once with its actual worker and normal destination", async () => {
  const event = warehouseHistoryFixture();
  mocks.get.mockResolvedValue(
    response({
      events: [{ kind: "warehouse", event }],
      pagination: pagination(1, 25, 1),
    }),
  );
  mount();
  expect(
    await screen.findByText("Actual warehouse colleague"),
  ).toBeInTheDocument();
  expect(screen.getAllByText("تأكيد الاستلام الفعلي")).toHaveLength(1);
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByText(/1 قطعة/u)).toHaveTextContent(
    "Original complete arrival",
  );
  expect(
    screen.getByRole("link", { name: event.businessNumber }),
  ).toHaveAttribute("href", `/sales/orders/${event.orderId}`);
});

it.each(["ADMIN_CANCEL", "ADMIN_CORRECT"] as const)(
  "renders %s as a safe activity summary with the original order link",
  async (operation) => {
    const event = {
      id: "66666666-6666-4666-8666-666666666666",
      orderId: id,
      orderVersion: 3,
      businessNumber: "SHOP-2026-0001",
      operation,
      actor: {
        id: other,
        fullName: "Actual administrator",
        role: "ADMIN",
        department: null,
      },
      occurredAt: instant,
      pieceIds:
        operation === "ADMIN_CANCEL"
          ? ["33333333-3333-4333-8333-333333333333"]
          : [],
      changedFields:
        operation === "ADMIN_CANCEL" ? ["cancellation"] : ["generalNotes"],
    };
    mocks.get.mockResolvedValue(
      response({
        events: [{ kind: "administration", event }],
        pagination: pagination(1, 25, 1),
      }),
    );
    mount();
    expect(await screen.findByText("Actual administrator")).toBeInTheDocument();
    expect(screen.getByText(/إصدار الطلب: 3/u)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: event.businessNumber }),
    ).toHaveAttribute("href", `/sales/orders/${id}`);
    expect(
      screen.queryByRole("button", { name: /تفاصيل القرار|القيم السابقة/u }),
    ).not.toBeInTheDocument();
  },
);
