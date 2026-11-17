import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { administrationCorrectionsQuerySchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { p08AdminSession } from "@/test/p08-fixtures";
import { p03Ids, p03Envelope, p03Pagination } from "@/test/p03-fixtures";
import { AdminCorrectionsView } from "./admin-corrections-view";

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
    <AdminCorrectionsView />
  </QueryClientProvider>
);
const cycle = (state: "OPEN" | "REJECTED" | "CANCELLED", index: number) => ({
  id: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  orderId: p03Ids.order,
  businessNumber: "SHOP-2026-0001",
  customerName: "Actual customer",
  pieceId: p03Ids.piece,
  position: 1,
  model: "Same retained model",
  target: "CUTTING",
  cycle: index,
  state,
  reason: "Actual defect",
  instructions: "Actual instruction",
  rejectedAt: "2026-11-15T09:00:00.000Z",
  resolvedAt: state === "OPEN" ? null : "2026-11-16T09:00:00.000Z",
});
it("renders retained rejected/cancelled cycles as closed rather than successful quality acceptance", async () => {
  boundary.url = "tab=RESOLVED";
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(
      p03Envelope({
        items: [cycle("REJECTED", 1), cycle("CANCELLED", 2)],
        pagination: { ...p03Pagination, total: 2, totalPages: 1 },
        counts: { active: 3, activePieces: 1, resolved: 2, all: 5 },
        context: {
          query: administrationCorrectionsQuerySchema.parse(options?.params),
        },
      }),
    ),
  );
  render(view());
  expect(await screen.findByText("مرفوضة")).toBeInTheDocument();
  expect(screen.getByText("ملغاة")).toBeInTheDocument();
  expect(screen.queryByText("تمت المعالجة والاعتماد")).not.toBeInTheDocument();
  expect(screen.getAllByText("2026-11-15T09:00:00.000Z")).toHaveLength(2);
  expect(
    screen.getAllByText("Actual defect — Actual instruction"),
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "قيد المعالجة بالمصنع (3)" }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "قيد المعالجة بالمصنع (3)" }),
  );
  await waitFor(() => {
    expect(boundary.get.mock.calls.at(-1)?.[1]?.params).toMatchObject({
      tab: "ACTIVE",
      page: 1,
    });
  });
});
it("shows read failure without fabricating segment cycles or historical dates", async () => {
  boundary.get.mockRejectedValue(new Error("Boundary failure"));
  render(view());
  await waitFor(() => {
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
  expect(screen.queryByText("2026-09-08")).not.toBeInTheDocument();
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
          counts: { active: 0, resolved: 0, all: 0, activePieces: 0 },
          pagination: p03Pagination,
          context: {
            query: administrationCorrectionsQuerySchema.parse(options?.params),
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
      "/admin/corrections",
    );
    expect(boundary.replace.mock.calls.at(-1)?.[0]).not.toContain("unexpected");
    expect(await screen.findByText("لا توجد سجلات")).toBeInTheDocument();
    expect(boundary.get).toHaveBeenCalledTimes(1);
  },
);
