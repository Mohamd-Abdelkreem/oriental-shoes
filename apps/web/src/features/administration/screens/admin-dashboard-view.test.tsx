import { AxiosError, AxiosHeaders } from "axios";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  administrationActivityQuerySchema,
  draftSummarySchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { p08AdminSession } from "@/test/p08-fixtures";
import {
  p03Ids,
  p03Instant,
  p03Envelope,
  p03Pagination,
  draftFixture,
} from "@/test/p03-fixtures";
import { AdminDashboardView } from "./admin-dashboard-view";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<unknown>>(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const dashboard = () => ({
  generatedAt: "2026-11-16T00:00:00.000Z",
  businessDate: "2026-11-16",
  counts: {
    totalOrders: 9,
    activeOrders: 7,
    pendingApproval: 2,
    activeCorrections: 5,
    openCorrectionOrders: 1,
    deliveryExceptions: 2,
    pendingUsers: 0,
    readyOrders: 1,
    overdueOrders: 2,
    failedDeliveries: 1,
    activePieces: 31,
    pendingApprovalPieces: 4,
    overduePieces: 8,
    readyPieces: 6,
  },
  departments: [{ department: "CUTTING", pieces: 11 }],
  recentOrders: [
    {
      kind: "draft",
      draft: draftSummarySchema
        .strip()
        .parse({ ...draftFixture(), pieceCount: 1 }),
    },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("dashboard")
          ? dashboard()
          : {
              events: [],
              pagination: { ...p03Pagination, limit: 5 },
              context: {
                query: administrationActivityQuerySchema.parse({ limit: 5 }),
              },
            },
      ),
    ),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("renders real all-root counts, distinct correction orders, physical units, business date and honest recent draft", async () => {
  render(
    <QueryClientProvider client={client}>
      <AdminDashboardView />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("عرض كل الطلبات (9)")).toBeInTheDocument();
  expect(screen.getByText("2026-11-16")).toBeInTheDocument();
  expect(screen.getByText(/1 طلب فيها دورة/)).toBeInTheDocument();
  expect(screen.getByText(/31 قطعة قيد المتابعة/)).toBeInTheDocument();
  expect(screen.getByText("لا توجد كميات تشغيلية لمسودة")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /DRAFT-2222222222/ }),
  ).toHaveAttribute("href", `/admin/orders/${p03Ids.order}`);
  expect(screen.getByRole("link", { name: /طلبات متأخرة/ })).toHaveAttribute(
    "href",
    expect.stringContaining("exception=OVERDUE"),
  );
});
it("shows the submitted order number and a compact activity summary", async () => {
  transport.get.mockImplementation((path) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("dashboard")
          ? dashboard()
          : {
              events: [
                {
                  kind: "order",
                  event: {
                    id: p03Ids.command,
                    orderId: p03Ids.order,
                    orderVersion: 1,
                    businessNumber: "EXTERNAL-2026-0001",
                    operation: "SUBMIT_NEW_ORDER",
                    pieceIds: [p03Ids.piece],
                    actor: {
                      id: p03Ids.actor,
                      fullName: "Actual owner",
                      role: "USER",
                      department: "SALES",
                    },
                    occurredAt: p03Instant,
                    notes: null,
                    changedFields: ["businessNumber", "customerSnapshot"],
                    paidChange: null,
                  },
                },
              ],
              pagination: { ...p03Pagination, limit: 5 },
              context: {
                query: administrationActivityQuerySchema.parse({ limit: 5 }),
              },
            },
      ),
    ),
  );
  render(
    <QueryClientProvider client={client}>
      <AdminDashboardView />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("EXTERNAL-2026-0001")).toBeVisible();
  expect(screen.queryByText(p03Ids.order)).not.toBeInTheDocument();
  expect(screen.getByText(/بواسطة: Actual owner/u)).toHaveTextContent(
    "رقم الطلب، بيانات العميل وقت الإرسال",
  );
  expect(screen.getByText(p03Instant)).toHaveAttribute("datetime", p03Instant);
});

it("reports a failed read without local demo rows or fabricated totals", async () => {
  transport.get.mockRejectedValue(new Error("Boundary down"));
  render(
    <QueryClientProvider client={client}>
      <AdminDashboardView />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
  expect(screen.queryByText("عرض كل الطلبات (9)")).not.toBeInTheDocument();
  expect(screen.queryByText(/OS-/)).not.toBeInTheDocument();
});

it("retains safe request references on read failures without exposing transport diagnostics", async () => {
  const config = { headers: new AxiosHeaders() };
  transport.get.mockRejectedValue(
    new AxiosError(
      "Private transport diagnostic",
      undefined,
      config,
      undefined,
      {
        status: 503,
        statusText: "Unavailable",
        headers: {},
        config,
        data: {
          success: false,
          statusCode: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "Private server diagnostic",
          requestId: "p08-request-42",
          errors: [],
          timestamp: "2026-11-16T00:00:00.000Z",
          path: "/api/v1/administration/dashboard",
        },
      },
    ),
  );
  render(
    <QueryClientProvider client={client}>
      <AdminDashboardView />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
  for (const alert of screen.getAllByRole("alert")) {
    expect(alert).toHaveTextContent("p08-request-42");
    expect(alert).not.toHaveTextContent("Private");
  }
});
