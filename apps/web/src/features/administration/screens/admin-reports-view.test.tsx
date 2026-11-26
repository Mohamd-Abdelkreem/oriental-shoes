import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  administrationReportQuerySchema,
  administrationOrderFiltersSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { p08AdminSession, p08ReportPrintFixture } from "@/test/p08-fixtures";
import {
  p03Ids,
  p03Instant,
  p03Pagination,
  p03Envelope,
} from "@/test/p03-fixtures";
import { AdminReportsView } from "./admin-reports-view";

const boundary = vi.hoisted(() => ({
  get: vi.fn<
    (path: string, options?: { params?: unknown }) => Promise<unknown>
  >(),
  replace: vi.fn(),
  push: vi.fn(),
  url: "",
  match: "UNIQUE",
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: boundary,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(boundary.url),
}));
let client = createQueryClient();
const report = (raw: unknown) => {
  const query = administrationReportQuerySchema.parse(raw),
    { page: _page, limit: _limit, ...filters } = query;
  const { exceptionRows: _exceptionRows, ...base } = p08ReportPrintFixture();
  return {
    ...base,
    meta: {
      ...base.meta,
      filters: administrationOrderFiltersSchema.parse(filters),
      effectiveFrom:
        query.from ?? (query.period === "MONTH" ? "2026-11-01" : null),
      effectiveTo: query.to ?? (query.period === "MONTH" ? "2026-11-30" : null),
      cohort: { kind: "MIXED", orderCount: 81 },
    },
    kpis: {
      ...base.kpis,
      orders: 81,
      originalPieces: 200,
      activePieces: 200,
      receivedPieces: 199,
      completionPercent: 99,
    },
    departments: [{ department: "WAREHOUSE", pieces: 200 }],
    workforce: {
      scope: {
        kind: "CURRENT_DIRECTORY",
        department: query.department ?? null,
      },
      activeStaff: 1,
      totalStaff: query.department === undefined ? 2 : 1,
      items:
        query.department === undefined
          ? [
              {
                id: p03Ids.actor,
                fullName: "Actual administrator",
                phone: null,
                role: "ADMIN",
                department: null,
                status: "ACTIVE",
              },
              {
                id: p03Ids.customer,
                fullName: "Current worker",
                phone: null,
                role: "USER",
                department: "CUTTING",
                status: "SUSPENDED",
              },
            ]
          : [
              {
                id: p03Ids.customer,
                fullName: "Current worker",
                phone: null,
                role: "USER",
                department: query.department,
                status: "ACTIVE",
              },
            ],
    },
    orders: {
      items: Array.from({ length: 25 }, (_, index) => ({
        kind: "draft",
        orderId: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        businessNumber: null,
        displayReference: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        type: "SHOP",
        status: "DRAFT",
        createdAt: p03Instant,
        deliveryDate: null,
        customer: { name: null, phone: null, address: null },
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
      })),
      pagination: {
        ...p03Pagination,
        page: query.page,
        limit: query.limit,
        total: 81,
        totalPages: Math.ceil(81 / query.limit),
        hasNextPage: query.page < Math.ceil(81 / query.limit),
        hasPreviousPage: query.page > 1,
      },
    },
  };
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window.history, "replaceState").mockImplementation(
    (_state, _title, href) => {
      boundary.replace(href, { scroll: false });
    },
  );
  vi.spyOn(window.history, "pushState").mockImplementation(
    (_state, _title, href) => {
      boundary.push(href, { scroll: false });
    },
  );
  boundary.url = "";
  boundary.match = "UNIQUE";
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  boundary.get.mockImplementation((path, options) => {
    if (path.endsWith("filter-options")) {
      const input = options?.params;
      const name =
        typeof input === "object" &&
        input !== null &&
        "salespersonName" in input
          ? input.salespersonName
          : undefined;
      return Promise.resolve(
        p03Envelope({
          context: {
            query: name === undefined ? {} : { salespersonName: name },
          },
          salespeople: [
            { id: p03Ids.actor, fullName: "Same name", phone: "+966501234567" },
            {
              id: p03Ids.customer,
              fullName: "Same name",
              phone: "+966501234568",
            },
          ],
          legacySalesperson:
            name === undefined
              ? null
              : {
                  input: name,
                  match: boundary.match,
                  salespersonId:
                    boundary.match === "UNIQUE" ? p03Ids.actor : null,
                },
        }),
      );
    }
    return Promise.resolve(p03Envelope(report(options?.params)));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  client.clear();
  vi.restoreAllMocks();
  beginAuthSessionEpoch("confirmed-ending");
});
const view = () => (
  <QueryClientProvider client={client}>
    <AdminReportsView />
  </QueryClientProvider>
);
it("shows monthly totals and all server-page rows without the report metadata card", async () => {
  render(view());
  expect(await screen.findByText("81")).toBeInTheDocument();
  expect(screen.getAllByRole("row")).toHaveLength(26);
  expect(screen.getByText(/نسبة الإنجاز: 99٪/)).toBeInTheDocument();
  expect(screen.queryByText(/^نطاق الطلبات:/)).not.toBeInTheDocument();
  expect(
    boundary.get.mock.calls.find(([path]) => path.endsWith("reports"))?.[1]
      ?.params,
  ).toMatchObject({ period: "MONTH", page: 1 });
});
it("opens complete print with identical actual bounds/owner and no screen pagination", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(view());
  await screen.findByText("81");
  fireEvent.change(screen.getByRole("combobox", { name: "مسؤول المبيعات:" }), {
    target: { value: p03Ids.customer },
  });
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "طباعة التقرير التشغيلي (A4)" }),
    ).toBeEnabled();
  });
  fireEvent.click(
    screen.getByRole("button", { name: "طباعة التقرير التشغيلي (A4)" }),
  );
  const target = open.mock.calls[0]?.[0];
  if (typeof target !== "string")
    throw new Error("Expected canonical print URL");
  const url = new URL(target, "http://localhost");
  expect(url.pathname).toBe("/reports/print");
  expect(url.searchParams.get("salespersonId")).toBe(p03Ids.customer);
  expect(url.searchParams.get("period")).toBe("MONTH");
  expect(url.searchParams.get("from")).toBe("2026-11-01");
  expect(url.searchParams.get("to")).toBe("2026-11-30");
  expect(url.searchParams.has("page")).toBe(false);
  expect(url.searchParams.has("limit")).toBe(false);
});
it.each(["MISSING", "AMBIGUOUS"] as const)(
  "blocks unresolved legacy owner %s until explicit account choice",
  async (match) => {
    boundary.match = match;
    boundary.url = "salesperson=Same+name";
    render(view());
    await screen.findByRole("alert");
    expect(
      boundary.get.mock.calls.some(([path]) => path.endsWith("reports")),
    ).toBe(false);
    fireEvent.change(
      screen.getByRole("combobox", { name: "مسؤول المبيعات:" }),
      { target: { value: p03Ids.customer } },
    );
    await waitFor(() => {
      expect(
        boundary.get.mock.calls.find(([path]) => path.endsWith("reports"))?.[1]
          ?.params,
      ).toMatchObject({ salespersonId: p03Ids.customer });
    });
  },
);
it("resolves only UNIQUE legacy identity and preserves explicit ALL and same-day date range", async () => {
  boundary.url =
    "salesperson=Same+name&period=ALL&from=2026-11-06&to=2026-11-06";
  render(view());
  await screen.findByText("81");
  expect(
    boundary.get.mock.calls.find(([path]) => path.endsWith("reports"))?.[1]
      ?.params,
  ).toMatchObject({
    period: "ALL",
    from: "2026-11-06",
    to: "2026-11-06",
    salespersonId: p03Ids.actor,
  });
});
it("rejects reversed ranges without report GET or dropping either input", async () => {
  boundary.url = "from=2026-11-09&to=2026-11-06";
  render(view());
  await waitFor(() => {
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
  expect(
    boundary.get.mock.calls.some(([path]) => path.endsWith("reports")),
  ).toBe(false);
  expect(screen.getByLabelText("من تاريخ")).toHaveValue("2026-11-09");
  expect(screen.getByLabelText("إلى تاريخ")).toHaveValue("2026-11-06");
});

it("combines the selected order type and department in the report filters", async () => {
  render(view());
  await screen.findByText("81");
  fireEvent.change(screen.getByRole("combobox", { name: "نوع الطلب:" }), {
    target: { value: "REPAIR" },
  });
  await waitFor(() => {
    expect(
      boundary.get.mock.calls
        .filter(([path]) => path.endsWith("reports"))
        .at(-1)?.[1]?.params,
    ).toMatchObject({ type: "REPAIR" });
  });
  fireEvent.change(screen.getByRole("combobox", { name: "المرحلة / القسم:" }), {
    target: { value: "CUTTING" },
  });
  await waitFor(() => {
    expect(
      boundary.get.mock.calls
        .filter(([path]) => path.endsWith("reports"))
        .at(-1)?.[1]?.params,
    ).toMatchObject({ type: "REPAIR", department: "CUTTING" });
  });
});
it("shows a valid empty report distinctly from an unavailable report", async () => {
  const original = boundary.get.getMockImplementation();
  boundary.get.mockImplementation((path, options) => {
    if (path.endsWith("filter-options") && original)
      return original(path, options);
    const current = report(options?.params),
      empty = p08ReportPrintFixture();
    return Promise.resolve(
      p03Envelope({
        ...current,
        meta: { ...current.meta, cohort: { kind: "MIXED", orderCount: 0 } },
        kpis: empty.kpis,
        departments: [],
        orders: { items: [], pagination: p03Pagination },
      }),
    );
  });
  render(view());
  expect(await screen.findByText("لا توجد سجلات")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "طباعة التقرير التشغيلي (A4)" }),
  ).toBeEnabled();
});
