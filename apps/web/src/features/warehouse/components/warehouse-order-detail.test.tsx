import { renderWithToast as render } from "@/test/render-with-toast";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  authUserDataSchema,
  warehouseOrderDataSchema,
  warehouseActivityEventSchema,
  qualityActivityEventSchema,
  qualityIssueActivityEventSchema,
  warehouseCommandBodySchema,
  type WarehouseCommandOperation,
} from "@template/contracts";
import { redirect } from "next/navigation";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  readWarehouseOperationalScope,
  warehouseScopeKey,
} from "@/shared/query/operational-scope";
import { factoryActivityFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { ManufacturingOrderDetailView } from "@/features/manufacturing/screens/manufacturing-order-detail-view";
import {
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import TaskAlias from "@/app/(workspace)/warehouse/tasks/[orderId]/page";
import DetailPage from "@/app/(workspace)/warehouse/orders/[orderId]/page";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
  useRouter: () => ({ push: vi.fn() }),

  useSearchParams: () => new URLSearchParams(navigation.search),
  redirect: vi.fn((path: string) => {
    throw new Error(`Redirect: ${path}`);
  }),
  notFound: () => {
    throw new Error("Unexpected local fallback");
  },
}));
const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string, options?: unknown) => Promise<unknown>>(),
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

beforeEach(() => {
  client = createQueryClient();
  vi.resetAllMocks();
  navigation.search = "";
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
const mount = () =>
  render(
    <ManufacturingOrderDetailView
      orderId={p03Ids.order}
      deptRole="warehouse"
    />,
    { wrapper },
  );
it.each(["USER", "ADMIN"] as const)(
  "renders only safe submitted delivery context and unchanged factory paper for %s",
  async (role) => {
    const user = {
      ...p03Session().user,
      role,
      department: role === "ADMIN" ? null : "WAREHOUSE",
      staffApprovedAt:
        role === "ADMIN" ? null : p03Session().user.staffApprovedAt,
    };
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      authUserDataSchema.parse({ user }),
    );
    const original = detailFixture("DISPATCH"),
      detail = {
        ...original,
        deliveryContact: {
          ...original.deliveryContact,
          address: "Actual submitted address",
        },
      };
    transport.get.mockResolvedValue(p03Envelope(detail));
    render(
      await DetailPage({ params: Promise.resolve({ orderId: p03Ids.order }) }),
      { wrapper },
    );
    const contacts = await screen.findByLabelText("بيانات التسليم المسجلة");
    expect(contacts).toHaveTextContent("Actual submitted address");
    expect(contacts).toHaveTextContent("+966500000001");
    expect(
      screen.getByRole("link", { name: "العودة للمستودع" }),
    ).toHaveAttribute("href", "/warehouse/dashboard");
    fireEvent.click(
      screen.getByRole("button", { name: "المواصفات المعتمدة للمصنع" }),
    );
    await screen.findByLabelText("مواصفات أمر التفصيل للمصنع");
    expect(
      screen.queryByText(/الإجمالي|المتبقي|البريد الإلكتروني|السعر/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /طباعة/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /طباعة/ }),
    ).not.toBeInTheDocument();
    expect(transport.post).not.toHaveBeenCalled();
  },
);
it("reached receipt detail forwards independent entered fields to one canonical body", async () => {
  transport.get.mockResolvedValue(p03Envelope(detailFixture("RECEIVE")));
  transport.post.mockRejectedValue(rejection(422, "VALIDATION_ERROR"));
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /تأكيد استلام وتسجيل الكراتين/ }),
  );
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByLabelText("عدد الكراتين المستلمة"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("موقع التخزين بالرفوف"), {
    target: { value: "Shelf B-12" },
  });
  fireEvent.change(screen.getByLabelText("ملاحظات"), {
    target: { value: "Protect finished surfaces" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  expect(transport.post).toHaveBeenCalledWith(
    "/warehouse/commands",
    expect.objectContaining({
      operation: "RECEIVE",
      orders: [
        {
          orderId: p03Ids.order,
          expectedVersion: 2,
          pieceIds: [p03Ids.piece],
          receipt: {
            cartonCount: "2",
            storageLocation: "Shelf B-12",
            notes: "Protect finished surfaces",
          },
        },
      ],
    }),
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("keeps receipt groups independent from retained quality packing and legacy absence", async () => {
  const base = detailFixture("DISPATCH"),
    first = base.paper.order.pieces[0];
  if (!first) throw new Error("Piece required");
  const second = {
      ...first,
      id: "30000000-0000-4000-8000-000000000002",
      position: 2,
    },
    ids = [first.id, second.id],
    counts = {
      original: 2,
      cancelled: 0,
      active: 2,
      received: 2,
      completionPercent: 100,
    };
  const groupId = "40000000-0000-4000-8000-000000000002",
    packingId = "50000000-0000-4000-8000-000000000002",
    inspector = {
      ...actor,
      fullName: "Quality colleague",
      department: "QUALITY",
    };
  const groups = [
    {
      id: p03Ids.source,
      orderId: p03Ids.order,
      pieceIds: [first.id],
      actor,
      receivedAt: p03Instant,
      cartonCount: "2",
      storageLocation: "Shelf B-12",
      notes: "First arrival",
    },
    {
      id: groupId,
      orderId: p03Ids.order,
      pieceIds: [second.id],
      actor,
      receivedAt: p03Instant,
      cartonCount: null,
      storageLocation: null,
      notes: null,
    },
  ];
  const detail = warehouseOrderDataSchema.parse({
    ...base,
    summary: {
      ...base.summary,
      counts,
      matchingPieceIds: ids,
      matchingPieceCount: 2,
    },
    paper: {
      ...base.paper,
      order: { ...base.paper.order, counts, pieces: [first, second] },
    },
    work: ids.map((pieceId, index) => ({
      pieceId,
      acceptedHandoff: {
        eventId: p03Ids.command,
        commandId: p03Ids.command,
        acceptedAt: p03Instant,
        actor: inspector,
        packingGroupId: packingId,
      },
      receiptGroupId: groups[index]?.id,
      receivedAt: p03Instant,
      legacyReceipt: false,
      allowedActions: { canReceive: false },
    })),
    receiptGroups: groups,
    qualityPackingGroups: [
      {
        id: packingId,
        inspectionId: p03Ids.command,
        acceptedPieceIds: ids,
        cartonCount: "Original quality text",
        cartonNumbers: "Q-12",
        inspectorNote: null,
        inspector,
        packedAt: p03Instant,
      },
    ],
  });
  transport.get.mockResolvedValue(p03Envelope(detail));
  mount();
  const receipts = await screen.findByLabelText("مجموعات الاستلام الفعلي");
  expect(receipts).toHaveTextContent("Shelf B-12");
  expect(receipts).toHaveTextContent("غير مسجل");
  expect(receipts.children).toHaveLength(2);
  const packing = screen.getByLabelText("تغليف الجودة المسجل");
  expect(packing).toHaveTextContent("Original quality text");
  expect(packing).toHaveTextContent("Quality colleague");
  expect(
    within(receipts).queryByText("Original quality text"),
  ).not.toBeInTheDocument();
});
it("binds piece-filtered history while retaining complete original grouped membership", async () => {
  navigation.search = `tab=history&pieceId=${p03Ids.piece}`;
  const other = "30000000-0000-4000-8000-000000000002",
    ids = [p03Ids.piece, other];
  const event = warehouseActivityEventSchema.parse({
    id: p03Ids.source,
    commandId: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    operation: "RECEIVE",
    actor,
    occurredAt: p03Instant,
    pieceIds: ids,
    beforeStatus: "APPROVED",
    afterStatus: "READY_FOR_DELIVERY",
    receiptGroup: {
      id: p03Ids.source,
      orderId: p03Ids.order,
      pieceIds: ids,
      actor,
      receivedAt: p03Instant,
      cartonCount: null,
      storageLocation: null,
      notes: "Original complete arrival",
    },
    attempt: null,
    retry: null,
  });
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("/history")
          ? {
              department: "WAREHOUSE",
              orderId: p03Ids.order,
              events: [{ kind: "warehouse", event }],
              pagination: {
                page: 1,
                limit: 25,
                total: 1,
                totalPages: 1,
                hasNextPage: false,
                hasPreviousPage: false,
              },
            }
          : detailFixture("DISPATCH"),
      ),
    ),
  );
  mount();
  await screen.findByText(/Original complete arrival/);
  const table = screen.getByRole("table");
  expect(table).toHaveTextContent("2 قطعة");
  expect(table).not.toHaveTextContent(other);
  expect(transport.get).toHaveBeenCalledWith(
    `/warehouse/orders/${p03Ids.order}/history`,
    expect.objectContaining({
      params: { page: 1, limit: 25, pieceId: p03Ids.piece },
    }),
  );
});
it("retains unknown recovery during a missing detail instead of falling back to local data", async () => {
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  client.setQueryData([...warehouseScopeKey(scope), "command-session"], {
    phase: "unknown",
    originScope: scope,
    body: warehouseCommandBodySchema.parse({
      commandId: p03Ids.command,
      operation: "RECEIVE",
      orders: [
        { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
      ],
    }),
    failure: {
      message: "Safe",
      statusCode: 0,
      code: "NETWORK_ERROR",
      requestId: "owned",
      fieldErrors: {},
    },
  });
  transport.get.mockRejectedValue(rejection(404, "WAREHOUSE_ORDER_NOT_FOUND"));
  mount();
  await screen.findByText(/نتيجة الإجراء غير مؤكدة/);
  await screen.findByRole("button", { name: "إعادة تحميل الطلب" });
  expect(
    screen.queryByLabelText("بيانات التسليم المسجلة"),
  ).not.toBeInTheDocument();
  expect(transport.post).not.toHaveBeenCalled();
});
it("rejects an invalid or unrelated requested piece without actionable fallback", async () => {
  navigation.search = "pieceId=invalid";
  transport.get.mockResolvedValue(p03Envelope(detailFixture("DISPATCH")));
  mount();
  await screen.findByText("الطلب أو القطعة المطلوبة غير متاحة في هذا النطاق.");
  expect(
    screen.queryByRole("button", { name: /إرسال الطلب/ }),
  ).not.toBeInTheDocument();
  expect(transport.get).not.toHaveBeenCalledWith(
    expect.stringContaining("/history"),
    expect.anything(),
  );
});
it("preserves original order and piece context through the existing task alias", async () => {
  // The real server alias throws redirect; it never reads local operational state.
  await expect(
    TaskAlias({
      params: Promise.resolve({ orderId: p03Ids.order }),
      searchParams: Promise.resolve({ pieceId: p03Ids.piece, tab: "history" }),
    }),
  ).rejects.toThrow("Redirect:");
  expect(redirect).toHaveBeenCalledWith(
    `/warehouse/orders/${p03Ids.order}?pieceId=${p03Ids.piece}&tab=history`,
  );
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

it("renders every safe upstream history kind inline without enrichment", async () => {
  navigation.search = "tab=history";
  const manufacturing = factoryActivityFixture(),
    quality = qualityHistoryFixture(),
    issue = qualityIssueActivityEventSchema.parse({
      id: p03Ids.command,
      commandId: p03Ids.command,
      orderId: p03Ids.order,
      orderVersion: 3,
      businessNumber: manufacturing.businessNumber,
      pieceId: p03Ids.piece,
      issueId: p03Ids.source,
      sourceDepartment: "QUALITY",
      operation: "REPORT_ISSUE",
      result: "REPORTED",
      target: null,
      actor: quality.actor,
      occurredAt: p03Instant,
      reason: "Reported issue",
      notes: null,
      correctionResolution: null,
    });
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("/history")
          ? {
              department: "WAREHOUSE",
              orderId: p03Ids.order,
              events: [
                { kind: "manufacturing", event: manufacturing },
                { kind: "quality", event: quality },
                { kind: "issue", event: issue },
              ],
              pagination: {
                page: 1,
                limit: 25,
                total: 3,
                totalPages: 1,
                hasNextPage: false,
                hasPreviousPage: false,
              },
            }
          : detailFixture("DISPATCH"),
      ),
    ),
  );
  mount();
  await screen.findByText(/Original correction instructions/);
  expect(screen.getByText(/Reported issue/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent(
    manufacturing.actor.fullName,
  );
  expect(
    screen.queryByRole("button", { name: /تفاصيل القرار|القيم السابقة/ }),
  ).not.toBeInTheDocument();
});

it("renders retained administrative cancellation without receipt or decision enrichment", async () => {
  navigation.search = "tab=history";
  const event = {
    id: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    operation: "ADMIN_CANCEL",
    actor: {
      id: p03Ids.actor,
      fullName: "Actual administrator",
      role: "ADMIN",
      department: null,
    },
    occurredAt: p03Instant,
    pieceIds: [p03Ids.piece],
    beforeStatus: "APPROVED",
    afterStatus: "APPROVED",
  };
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("/history")
          ? {
              department: "WAREHOUSE",
              orderId: p03Ids.order,
              events: [{ kind: "administration", event }],
              pagination: {
                page: 1,
                limit: 25,
                total: 1,
                totalPages: 1,
                hasNextPage: false,
                hasPreviousPage: false,
              },
            }
          : detailFixture("DISPATCH"),
      ),
    ),
  );
  mount();
  const cancellation = await screen.findByText(/إلغاء إداري/u);
  expect(cancellation).toHaveTextContent("القطعة 01");
  expect(cancellation).not.toHaveTextContent(p03Ids.piece);
  expect(screen.getByText(/إلغاء إداري/u)).toHaveTextContent("إصدار الطلب: 3");
  expect(
    screen.queryByRole("button", { name: /تفاصيل القرار|القيم السابقة/u }),
  ).not.toBeInTheDocument();
});
