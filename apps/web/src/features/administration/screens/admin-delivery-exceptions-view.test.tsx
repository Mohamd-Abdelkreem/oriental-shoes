import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  administrationDeliveryExceptionsQuerySchema,
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
import { AdminDeliveryExceptionsView } from "./admin-delivery-exceptions-view";

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
    <AdminDeliveryExceptionsView />
  </QueryClientProvider>
);
const summary = () =>
  administrationOrderSummarySchema.parse({
    ...salesOrderSummarySchema
      .strip()
      .parse({ ...orderFixture(), returnInfo: null }),
    currentDepartments: ["WAREHOUSE"],
    isOverdue: false,
    hasQualityCorrectionHistory: false,
    hasOpenQualityCorrection: false,
    adminActions: { canCancel: false, canCorrect: true, canPrint: false },
  });
it("uses distinct union counts and preserves owning warehouse links without invented delivery fields", async () => {
  boundary.url = "tab=ALL";
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope({
        items: [summary()],
        pagination: { ...p03Pagination, total: 1, totalPages: 1 },
        counts: { failed: 1, overdue: 1, dispatched: 1, all: 1 },
        context: {
          query: administrationDeliveryExceptionsQuerySchema.parse(
            options?.params,
          ),
        },
      }),
    ),
  );
  render(view());
  expect(
    await screen.findByRole("button", { name: "كل الاستثناءات (1)" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "إجراء المستودع" })).toHaveAttribute(
    "href",
    `/warehouse/orders/${p03Ids.order}`,
  );
  expect(
    screen.getByText("السبب والملاحظات متاحة في تفاصيل المستودع."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "خرجت مع المندوب (1)" }));
  await waitFor(() => {
    expect(boundary.get.mock.calls.at(-1)?.[1]?.params).toMatchObject({
      tab: "DISPATCHED",
      page: 1,
    });
  });
});
it("rejects invalid filters without widening the exception cohort", () => {
  boundary.url = "tab=UNKNOWN";
  render(view());
  expect(screen.getByRole("alert")).toBeInTheDocument();
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
          counts: { failed: 0, overdue: 0, dispatched: 0, all: 0 },
          pagination: p03Pagination,
          context: {
            query: administrationDeliveryExceptionsQuerySchema.parse(
              options?.params,
            ),
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
      "/admin/delivery-exceptions",
    );
    expect(boundary.replace.mock.calls.at(-1)?.[0]).not.toContain("unexpected");
    expect(await screen.findByText("لا توجد سجلات")).toBeInTheDocument();
    expect(boundary.get).toHaveBeenCalledTimes(1);
  },
);
