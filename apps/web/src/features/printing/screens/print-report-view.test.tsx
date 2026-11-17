import { AxiosError, AxiosHeaders } from "axios";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { administrationReportPrintDataSchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { p08AdminSession, p08ReportPrintFixture } from "@/test/p08-fixtures";
import { p03Ids, p03Instant, p03Envelope } from "@/test/p03-fixtures";
import { PrintReportView } from "./print-report-view";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string, options?: unknown) => Promise<unknown>>(),
  url: "",
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(transport.url),
}));
let client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  transport.url = "";
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
const completeSnapshot = () => {
  const snapshot = p08ReportPrintFixture();
  const row = (index: number) => ({
    kind: "draft" as const,
    orderId: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    businessNumber: null,
    displayReference: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    type: "SHOP" as const,
    status: "DRAFT" as const,
    createdAt: p03Instant,
    deliveryDate: null,
    customer: {
      name: "Actual customer",
      phone: "+966501234567",
      address: "Actual address",
    },
    salesperson: { id: p03Ids.actor, fullName: "Actual owner" },
    counts: {
      original: 0,
      cancelled: 0,
      active: 0,
      received: 0,
      completionPercent: 0,
    },
    currentDepartments: [],
    isOverdue: false,
    hasQualityCorrectionHistory: false,
    isCurrentlyReturned: false,
  });
  snapshot.orders.items = Array.from({ length: 34 }, (_, index) =>
    row(index + 1),
  );
  const warehouse =
    administrationReportPrintDataSchema.shape.orders.shape.items.element.parse({
      ...row(35),
      kind: "submitted",
      businessNumber: "SHOP-2026-0001",
      displayReference: "SHOP-2026-0001",
      status: "APPROVED",
      deliveryDate: "2026-11-01",
      isOverdue: true,
      hasQualityCorrectionHistory: true,
      customer: {
        name: "Actual order contact",
        phone: "+966501234567",
        address: "Effective corrected delivery address",
      },
      counts: {
        original: 1,
        cancelled: 0,
        active: 1,
        received: 0,
        completionPercent: 0,
      },
      currentDepartments: ["WAREHOUSE"],
    });
  const courier =
    administrationReportPrintDataSchema.shape.orders.shape.items.element.parse({
      ...row(36),
      kind: "submitted",
      businessNumber: "SHOP-2026-0002",
      displayReference: "SHOP-2026-0002",
      status: "OUT_FOR_DELIVERY",
      counts: {
        original: 2,
        cancelled: 0,
        active: 2,
        received: 2,
        completionPercent: 100,
      },
    });
  snapshot.orders.items.push(warehouse, courier);
  snapshot.orders.total = 36;
  snapshot.meta.cohort.orderCount = 36;
  snapshot.kpis = {
    ...snapshot.kpis,
    orders: 36,
    originalPieces: 3,
    activePieces: 3,
    receivedPieces: 2,
    completionPercent: 67,
    overdueOrders: 1,
  };
  snapshot.departments = [
    { department: "WAREHOUSE", pieces: 1 },
    { department: "WITH_COURIER", pieces: 2 },
  ];
  snapshot.workforce = {
    scope: { kind: "CURRENT_DIRECTORY", department: null },
    activeStaff: 1,
    totalStaff: 2,
    items: [
      {
        id: p03Ids.actor,
        fullName: "Actual directory administrator",
        phone: "+966501234567",
        role: "ADMIN",
        department: null,
        status: "ACTIVE",
      },
      {
        id: p03Ids.customer,
        fullName: "Actual suspended warehouse employee",
        phone: null,
        role: "USER",
        department: "WAREHOUSE",
        status: "SUSPENDED",
      },
    ],
  };
  snapshot.exceptions = {
    ...snapshot.exceptions,
    categoryCases: 2,
    distinctOrders: 1,
    overdueOrders: 1,
    correctionHistoryOrders: 1,
  };
  snapshot.exceptionRows = (
    ["OVERDUE", "QUALITY_CORRECTION_HISTORY"] as const
  ).map((category) => ({
    orderId: warehouse.orderId,
    businessNumber: warehouse.businessNumber,
    customerName: warehouse.customer.name,
    category,
    currentDepartments: warehouse.currentDepartments,
    deliveryDate: warehouse.deliveryDate,
  }));
  return administrationReportPrintDataSchema.parse(snapshot);
};
it("renders every complete mixed-scope row, actual directory/address/shipping and all six honest sections", async () => {
  transport.get.mockResolvedValue(p03Envelope(completeSnapshot()));
  render(
    <QueryClientProvider client={client}>
      <PrintReportView />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText("Effective corrected delivery address", {
      exact: false,
    }),
  ).toBeInTheDocument();
  const headers = screen.getAllByRole("heading", { level: 3 });
  expect(headers).toHaveLength(5);
  expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent(
    "اعتمادات وتواقيع يدوية",
  );
  expect(
    screen.getAllByRole("table")[2]?.querySelectorAll("tbody tr"),
  ).toHaveLength(36);
  expect(
    screen.getByText("Actual suspended warehouse employee"),
  ).toBeInTheDocument();
  expect(screen.getByText("موقوف")).toBeInTheDocument();
  expect(
    screen.getByText(
      "موقع حالي يشمل الوارد غير المستلم؛ الاستلام والجاهزية منفصلان",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/2 حالة تصنيفية — 1 طلب متأثر/)).toBeInTheDocument();
  expect(screen.getByText("سجل تصحيح جودة سابق أو قائم")).toBeInTheDocument();
  expect(screen.queryByText("محمد العتيبي")).not.toBeInTheDocument();
  expect(screen.queryByText("صفحة ١ من ١")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "طباعة التقرير (Ctrl + P)" }),
  ).toBeEnabled();
});
it("retains all six sections even when the complete cohort is empty", async () => {
  transport.get.mockResolvedValue(p03Envelope(p08ReportPrintFixture()));
  render(
    <QueryClientProvider client={client}>
      <PrintReportView />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText("لا توجد حالات استثناء في نطاق التقرير."),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
  expect(
    screen.getByText("لا يوجد موظفون في نطاق الدليل الحالي."),
  ).toBeInTheDocument();
});
it("shows scope-too-large recovery with no partial printable DOM and keeps the filter URL", async () => {
  transport.url = "type=SHOP";
  const config = { headers: new AxiosHeaders() };
  transport.get.mockRejectedValue(
    new AxiosError("Boundary", undefined, config, undefined, {
      status: 422,
      statusText: "Unprocessable",
      headers: {},
      config,
      data: {
        success: false,
        statusCode: 422,
        message: "Narrow report filters",
        code: "REPORT_SCOPE_TOO_LARGE",
        errors: [],
        requestId: "report-size",
        timestamp: p03Instant,
        path: "/api/v1/administration/reports/print",
      },
    }),
  );
  const rendered = render(
    <QueryClientProvider client={client}>
      <PrintReportView />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("ضيّق الفلاتر");
  expect(rendered.container.querySelector(".a4-sheet")).toBeNull();
  expect(transport.url).toBe("type=SHOP");
});
