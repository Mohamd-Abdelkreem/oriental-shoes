import { administrationActivityQuerySchema } from "@template/contracts";
import { factoryActivityFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  p08AdminSession,
  p08CorrectionEventFixture,
} from "@/test/p08-fixtures";
import { p03Ids, p03Envelope, p03Pagination } from "@/test/p03-fixtures";
import { AdminActivityView } from "./admin-activity-view";

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
    <AdminActivityView />
  </QueryClientProvider>
);
it("shows the server action-search page without filtering or reversing it and preserves literal wildcard text", async () => {
  boundary.url = "search=ADMIN_CORRECT&page=2&limit=1";
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope({
        events: [
          { kind: "administration", event: p08CorrectionEventFixture() },
        ],
        pagination: {
          ...p03Pagination,
          page: 2,
          limit: 1,
          total: 2,
          totalPages: 2,
          hasPreviousPage: true,
        },
        context: {
          query: administrationActivityQuerySchema.parse(options?.params),
        },
      }),
    ),
  );
  render(view());
  expect(
    await screen.findByText("Confirmed contact correction"),
  ).toBeInTheDocument();
  expect(screen.getByText("Actual administrator")).toBeInTheDocument();
  expect(
    screen.getByText("Frozen address ← Corrected order-only address"),
  ).toBeInTheDocument();
  expect(boundary.get.mock.calls[0]?.[1]?.params).toMatchObject({
    search: "ADMIN_CORRECT",
    page: 2,
    limit: 1,
  });
  fireEvent.click(screen.getByRole("button", { name: "الصفحة السابقة" }));
  expect(boundary.push.mock.calls.at(-1)?.[0]).toContain("page=1");
  fireEvent.change(
    screen.getByPlaceholderText(
      "ابحث بالإجراء، رقم الطلب، الموظف، أو الملاحظة...",
    ),
    { target: { value: "_%literal" } },
  );
  await waitFor(() => {
    expect(boundary.get.mock.calls.at(-1)?.[1]?.params).toMatchObject({
      search: "_%literal",
      page: 1,
    });
  });
});
it("keeps equal UUIDs from different event sources as two immutable rows", async () => {
  const event = p08CorrectionEventFixture();
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope({
        events: [
          { kind: "administration", event },
          {
            kind: "manufacturing",
            event: { ...factoryActivityFixture(), id: event.id },
          },
        ],
        pagination: { ...p03Pagination, total: 2, totalPages: 1 },
        context: {
          query: administrationActivityQuerySchema.parse(options?.params),
        },
      }),
    ),
  );
  render(view());
  expect(
    await screen.findByText("Confirmed contact correction"),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("row")).toHaveLength(3);
});
it("keeps action search on an empty response and on read failure", async () => {
  boundary.url = "search=NO_MATCH";
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope({
        events: [],
        pagination: p03Pagination,
        context: {
          query: administrationActivityQuerySchema.parse(options?.params),
        },
      }),
    ),
  );
  const rendered = render(view());
  expect(await screen.findByText("لا توجد سجلات")).toBeInTheDocument();
  expect(
    screen.getByPlaceholderText(
      "ابحث بالإجراء، رقم الطلب، الموظف، أو الملاحظة...",
    ),
  ).toHaveValue("NO_MATCH");
  rendered.unmount();
  client.clear();
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  boundary.get.mockRejectedValue(new Error("Read failed"));
  render(view());
  await waitFor(() => {
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
  expect(
    screen.getByPlaceholderText(
      "ابحث بالإجراء، رقم الطلب، الموظف، أو الملاحظة...",
    ),
  ).toHaveValue("NO_MATCH");
});

it.each([
  { query: "unexpected=value&search=retained", field: "unexpected" },
  { query: "page=0&search=retained", field: "الصفحة" },
  { query: "search=one&search=two", field: "البحث" },
  { query: `search=${"x".repeat(151)}`, field: "البحث" },
  { query: "tab=INVALID&search=retained", field: "tab" },
])(
  "retains invalid $field input and recovers through explicit canonical reset",
  async (invalid) => {
    boundary.url = invalid.query;
    boundary.get.mockImplementation((_path, options) =>
      Promise.resolve(
        p03Envelope({
          events: [],
          pagination: p03Pagination,
          context: {
            query: administrationActivityQuerySchema.parse(options?.params),
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
      "/admin/activity",
    );
    expect(boundary.replace.mock.calls.at(-1)?.[0]).not.toContain("unexpected");
    expect(await screen.findByText("لا توجد سجلات")).toBeInTheDocument();
    expect(boundary.get).toHaveBeenCalledTimes(1);
  },
);
