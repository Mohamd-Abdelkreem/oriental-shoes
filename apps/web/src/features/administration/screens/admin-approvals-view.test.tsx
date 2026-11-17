import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  administrationApprovalsQuerySchema,
  administrationOrderSummarySchema,
  salesOrderSummarySchema,
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
  p03Envelope,
  p03Pagination,
  orderFixture,
} from "@/test/p03-fixtures";
import { AdminApprovalsView } from "./admin-approvals-view";

const boundary = vi.hoisted(() => ({
  get: vi.fn<
    (path: string, options?: { params?: unknown }) => Promise<unknown>
  >(),
  replace: vi.fn(),
  push: vi.fn(),
  url: "",
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: boundary,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(boundary.url),
}));
let client = createQueryClient();
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
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
});
afterEach(() => {
  vi.restoreAllMocks();
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const view = () => (
  <QueryClientProvider client={client}>
    <AdminApprovalsView />
  </QueryClientProvider>
);
const summary = () =>
  administrationOrderSummarySchema.parse({
    ...salesOrderSummarySchema
      .strip()
      .parse({ ...orderFixture(), returnInfo: null }),
    currentDepartments: [],
    isOverdue: false,
    hasQualityCorrectionHistory: false,
    hasOpenQualityCorrection: false,
    adminActions: { canCancel: true, canCorrect: true, canPrint: false },
  });
it("binds same-search counts and physical rows to the existing review and admin detail routes", async () => {
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope({
        items: [summary()],
        pagination: { ...p03Pagination, total: 1, totalPages: 1 },
        counts: { pending: 3, returned: 2, approved: 7, all: 12 },
        context: {
          query: administrationApprovalsQuerySchema.parse(options?.params),
        },
      }),
    ),
  );
  render(view());
  expect(await screen.findByText("SHOP-2026-0001")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "بانتظار الاعتماد (3)" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "تدقيق واعتماد" })).toHaveAttribute(
    "href",
    `/approval/orders/${p03Ids.order}`,
  );
  fireEvent.change(
    screen.getByPlaceholderText("ابحث برقم الطلب، العميل، مندوب المبيعات..."),
    { target: { value: "needle" } },
  );
  await waitFor(() => {
    expect(boundary.get.mock.calls.at(-1)?.[1]?.params).toMatchObject({
      search: "needle",
      tab: "PENDING",
    });
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "سجل الطلبات المعتمدة (7)" }),
  );
  await waitFor(() => {
    expect(boundary.get.mock.calls.at(-1)?.[1]?.params).toMatchObject({
      search: "needle",
      tab: "APPROVED",
      page: 1,
    });
  });
  expect(screen.queryByText("معتمدة قيد التصنيع")).not.toBeInTheDocument();
});
it("blocks unsupported oversight tabs without GET", () => {
  boundary.url = "tab=INVALID";
  render(view());
  expect(screen.getByRole("alert")).toHaveTextContent("التبويب");
  expect(boundary.get).not.toHaveBeenCalled();
});

it.each([
  { query: "unexpected=value&search=retained", field: "unexpected" },
  { query: "page=0&search=retained", field: "الصفحة" },
  { query: "search=one&search=two", field: "البحث" },
  { query: `search=${"x".repeat(151)}`, field: "البحث" },
  { query: "tab=INVALID&search=retained", field: "التبويب" },
])(
  "retains invalid $field input and recovers through explicit canonical reset",
  async (invalid) => {
    boundary.url = invalid.query;
    boundary.get.mockImplementation((_path, options) =>
      Promise.resolve(
        p03Envelope({
          items: [],
          counts: { pending: 0, returned: 0, approved: 0, all: 0 },
          pagination: p03Pagination,
          context: {
            query: administrationApprovalsQuerySchema.parse(options?.params),
          },
        }),
      ),
    );
    render(view());
    expect(screen.getByRole("alert")).toHaveTextContent(invalid.field);
    expect(screen.getByRole("textbox")).toHaveValue(
      new URLSearchParams(invalid.query).get("search"),
    );
    expect(boundary.get).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "إعادة الفلاتر الافتراضية" }),
    );
    expect(boundary.replace.mock.calls.at(-1)?.[0]).toContain(
      "/admin/approvals",
    );
    expect(boundary.replace.mock.calls.at(-1)?.[0]).not.toContain("unexpected");
    expect(await screen.findByText("لا توجد سجلات")).toBeInTheDocument();
    expect(boundary.get).toHaveBeenCalledTimes(1);
  },
);
