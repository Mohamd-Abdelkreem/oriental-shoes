import { act, waitFor, fireEvent, screen } from "@testing-library/react";
import { renderWithToast as render } from "@/test/render-with-toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
} from "../model/manufacturing.fixture";
import { ManufacturingOrderDetailView } from "./manufacturing-order-detail-view";

import {
  qualityOrderDataSchema,
  authUserDataSchema,
  qualityActivityEventSchema,
  qualityIssueActivityEventSchema,
  qualityOrderHistoryQuerySchema,
} from "@template/contracts";
import { apiClient } from "@/services/api/api-client";
import { p03Session, p03Instant, p03Envelope } from "@/test/p03-fixtures";

const transport = vi.hoisted(() => ({
  order: vi.fn(),
  orderHistory: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/warehouse/orders",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("Unexpected legacy lookup");
  },
}));
vi.mock("../api/manufacturing.api", () => ({ manufacturingApi: transport }));
const client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, factorySessionFixture("CUTTING"));
  transport.order.mockResolvedValue(manufacturingDetailFixture());
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("retains safe specifications and inline actual history without warehouse actions or finance", async () => {
  transport.orderHistory.mockResolvedValue({
    department: "CUTTING",
    orderId: p03Ids.order,
    events: [{ kind: "manufacturing", event: factoryActivityFixture() }],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView orderId={p03Ids.order} deptRole="cutting" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Factory customer/u);
  expect(
    screen.queryByRole("link", { name: /طباعة/u }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إرسال مع مندوب التوصيل" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Frozen address")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "المواصفات المعتمدة للمصنع" }),
  );
  expect(await screen.findByText("SM")).toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: "السعر" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
  expect(await screen.findByText("Factory worker")).toBeInTheDocument();
  expect(screen.getByText(/إتمام وتحويل العمل/u)).toHaveTextContent(
    "الإنتاج والإصلاح",
  );
  expect(transport.orderHistory).toHaveBeenCalledWith(
    "CUTTING",
    p03Ids.order,
    { page: 1, limit: 25 },
    expect.any(AbortSignal),
  );
});
it("keeps a missing persisted order as an error instead of using a local record", async () => {
  transport.order.mockRejectedValue(new Error("unavailable"));
  render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView orderId={p03Ids.order} deptRole="cutting" />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذر تحميل أمر التفصيل",
  );
  expect(screen.queryByText("SM")).not.toBeInTheDocument();
  expect(localStorage.length).toBe(0);
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

it("retains immutable Quality cycles across history pages after every piece has departed without private paper or receipt claims", async () => {
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "QUALITY" },
    }),
  );
  const data = qualityDetail();
  data.paper.order.pieces = data.paper.order.pieces.map((piece) => ({
    ...piece,
    stage: "WAREHOUSE",
    workState: "INCOMING",
  }));
  data.work = data.work.map((work) => ({
    ...work,
    visit: null,
    allowedActions: {
      canReceiveAndStart: false,
      canContinue: false,
      canInspect: false,
      canReportIssue: false,
    },
  }));
  const actor = {
    id: p03Ids.actor,
    fullName: "Original inspector",
    role: "USER",
    department: "QUALITY",
  };
  const opened = qualityActivityEventSchema.parse({
    id: id(70),
    commandId: id(71),
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: data.paper.order.businessNumber,
    department: "QUALITY",
    actor,
    occurredAt: p03Instant,
    report: null,
    operation: "INSPECT",
    pieces: [
      {
        pieceId: id(1),
        visitId: id(11),
        decision: "REJECT",
        stage: "CUTTING",
        workState: "INCOMING",
        correctionId: id(73),
        issueId: null,
      },
    ],
    correctionLinks: [
      { pieceId: id(1), correctionId: id(72), cycle: 1, action: "REJECTED" },
      { pieceId: id(1), correctionId: id(73), cycle: 2, action: "OPENED" },
    ],
    inspection: {
      decisions: [
        {
          pieceId: id(1),
          decision: "REJECT",
          target: "CUTTING",
          reason: "Original defect",
          instructions: "Original correction instructions",
        },
      ],
      inspectorNote: "Original note only",
      packing: null,
    },
  });
  const cancelled = qualityIssueActivityEventSchema.parse({
    id: id(74),
    commandId: id(74),
    orderId: p03Ids.order,
    orderVersion: 4,
    businessNumber: data.paper.order.businessNumber,
    pieceId: id(1),
    issueId: id(75),
    sourceDepartment: "CUTTING",
    operation: "RESOLVE_ISSUE",
    result: "CANCELLED",
    target: null,
    actor: {
      ...actor,
      department: "APPROVAL",
      fullName: "Actual approval reviewer",
    },
    occurredAt: p03Instant,
    reason: "Actual cancellation reason",
    notes: null,
    correctionResolution: {
      correctionId: id(73),
      cycle: 2,
      outcome: "CANCELLED",
    },
  });
  const get = vi.spyOn(apiClient, "get").mockImplementation((path, options) => {
    if (!path.endsWith("/history")) return Promise.resolve(p03Envelope(data));
    const page =
      qualityOrderHistoryQuerySchema.parse(options?.params).page === 2 ? 2 : 1;
    return Promise.resolve(
      p03Envelope({
        department: "QUALITY",
        orderId: p03Ids.order,
        events:
          page === 1
            ? [
                { kind: "quality", event: opened },
                ...Array.from({ length: 24 }, (_, i) => ({
                  kind: "quality",
                  event: {
                    ...opened,
                    id: id(1000 + i),
                    commandId: id(2000 + i),
                    operation: "CONTINUE",
                    orderVersion: 4 + i,
                    pieces: opened.pieces.map((piece) => ({
                      ...piece,
                      decision: null,
                      stage: "QUALITY",
                      workState: "IN_PROGRESS",
                      correctionId: null,
                    })),
                    inspection: null,
                    correctionLinks: [],
                  },
                })),
              ]
            : [{ kind: "issue", event: cancelled }],
        pagination: {
          page,
          limit: 25,
          total: 26,
          totalPages: 2,
          hasNextPage: page === 1,
          hasPreviousPage: page === 2,
        },
      }),
    );
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView orderId={p03Ids.order} deptRole="quality" />
    </QueryClientProvider>,
  );
  try {
    await screen.findByText(/Factory customer/);
    expect(screen.queryByText("Frozen address")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /طباعة/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/ }));
    await screen.findByText(/Original correction instructions/);
    expect(
      screen.getByText(/فشل إعادة الفحص للدورة السابقة 1/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByText(/Actual cancellation reason/);
    expect(screen.getByText(/إلغاء دورة التصحيح 2/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Original correction instructions/),
    ).not.toBeInTheDocument();
  } finally {
    view.unmount();
    get.mockRestore();
  }
});

it("retains safe Quality paper through cached refresh failure and explicit retry", async () => {
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "QUALITY" },
    }),
  );
  const detail = qualityDetail(),
    get = vi.spyOn(apiClient, "get").mockResolvedValue(p03Envelope(detail)),
    post = vi.spyOn(apiClient, "post");
  const view = render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView orderId={p03Ids.order} deptRole="quality" />
    </QueryClientProvider>,
  );
  let rejectRead: (reason: Error) => void = () => {};
  const gate = new Promise<unknown>((_resolve, reject) => {
    rejectRead = reject;
  });
  let refresh: Promise<void> | undefined;
  try {
    await screen.findByText(/Factory customer/u);
    get.mockImplementation(() => gate);
    act(() => {
      refresh = client.refetchQueries({ queryKey: ["p06"], type: "active" });
    });
    expect(await screen.findByText("جارٍ تحديث أمر التفصيل…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByText(/Factory customer/u)).toBeInTheDocument();
    await act(async () => {
      rejectRead(new Error("Transient read failure"));
      await refresh;
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تحديث أمر التفصيل",
    );
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeDefined();
    get.mockResolvedValue(p03Envelope(detail));
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Factory customer/u)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  } finally {
    rejectRead(new Error("Owned cleanup"));
    await refresh;
    view.unmount();
    get.mockRestore();
    post.mockRestore();
  }
});

it("dispatches warehouse detail to its actual safe read owner without manufacturing or local fallback", async () => {
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "WAREHOUSE" },
    }),
  );
  const get = vi
    .spyOn(apiClient, "get")
    .mockResolvedValue(
      p03Envelope({ private: "Never render a malformed response" }),
    );
  const view = render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView
        orderId={p03Ids.order}
        deptRole="warehouse"
      />
    </QueryClientProvider>,
  );
  try {
    await screen.findByRole("alert");
    expect(get).toHaveBeenCalledWith(
      `/warehouse/orders/${p03Ids.order}`,
      expect.anything(),
    );
    expect(transport.order).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Never render a malformed response"),
    ).not.toBeInTheDocument();
  } finally {
    view.unmount();
    get.mockRestore();
  }
});

it("renders minimal administrative manufacturing cancellation without task or decision actions", async () => {
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
  transport.orderHistory.mockResolvedValue({
    department: "CUTTING",
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
  });
  render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView orderId={p03Ids.order} deptRole="cutting" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Factory customer/u);
  fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
  expect(await screen.findByText(/إلغاء إداري/u)).toHaveTextContent(
    p03Ids.piece,
  );
  expect(
    screen.queryByRole("link", { name: /مهمة|اختيار قطعة/u }),
  ).not.toBeInTheDocument();
});
it("renders quality cancellation as non-actionable history with retained identity and no private enrichment", async () => {
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "QUALITY" },
    }),
  );
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
    },
    data = qualityDetail();
  const get = vi.spyOn(apiClient, "get").mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("/history")
          ? {
              department: "QUALITY",
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
          : data,
      ),
    ),
  );
  try {
    render(
      <QueryClientProvider client={client}>
        <ManufacturingOrderDetailView
          orderId={p03Ids.order}
          deptRole="quality"
        />
      </QueryClientProvider>,
    );
    await screen.findByText(/Factory customer/u);
    fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
    expect(await screen.findByText(/إلغاء إداري/u)).toHaveTextContent(
      "إصدار الطلب: 3",
    );
    expect(
      screen.queryByRole("link", { name: /مهمة|اختيار قطعة/u }),
    ).not.toBeInTheDocument();
  } finally {
    get.mockRestore();
  }
});
