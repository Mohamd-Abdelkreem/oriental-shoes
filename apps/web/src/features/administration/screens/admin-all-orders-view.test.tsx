import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  administrationOrdersQuerySchema,
  salesOrderStatusSchema,
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
  p03Envelope,
  p03Pagination,
  draftFixture,
} from "@/test/p03-fixtures";
import { AdminAllOrdersView } from "./admin-all-orders-view";

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
const page = (raw: unknown, total = 0) => {
  const query = administrationOrdersQuerySchema.parse(raw);
  return {
    items: Array.from(
      {
        length: Math.min(
          query.limit,
          Math.max(0, total - (query.page - 1) * query.limit),
        ),
      },
      (_, index) => ({
        kind: "draft",
        draft: draftSummarySchema.strip().parse({
          ...draftFixture(),
          id:
            index === 0
              ? p03Ids.order
              : `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          pieceCount: 1,
        }),
      }),
    ),
    pagination: {
      ...p03Pagination,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      hasPreviousPage: query.page > 1,
      hasNextPage: query.page < Math.ceil(total / query.limit),
    },
    totalOrders: 41,
    totalPieces: 90,
    statusCounts: Object.fromEntries(
      ["DRAFT", ...salesOrderStatusSchema.options].map((status) => [status, 0]),
    ),
    context: { query },
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
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(p03Envelope(page(options?.params))),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const view = () => (
  <QueryClientProvider client={client}>
    <AdminAllOrdersView />
  </QueryClientProvider>
);
it("rejects unsupported filters without GET or broadening", () => {
  boundary.url = "status=INVALID";
  render(view());
  expect(screen.getByRole("alert")).toHaveTextContent("حالة الطلب");
  expect(boundary.get).not.toHaveBeenCalled();
});
it("keeps immediate search input mounted and issues exact filters, with Back/Forward URL restoration", async () => {
  const rendered = render(view()),
    input = screen.getByPlaceholderText(
      "ابحث برقم الطلب، العميل، الهاتف، أو الموديل...",
    );
  await waitFor(() => {
    expect(boundary.get).toHaveBeenCalledTimes(1);
  });
  input.focus();
  fireEvent.change(input, { target: { value: "needle" } });
  expect(
    screen.getByPlaceholderText(
      "ابحث برقم الطلب، العميل، الهاتف، أو الموديل...",
    ),
  ).toBe(input);
  expect(input).toHaveFocus();
  await waitFor(() => {
    expect(boundary.get.mock.calls.at(-1)?.[1]?.params).toMatchObject({
      search: "needle",
      page: 1,
    });
  });
  expect(boundary.replace.mock.calls.at(-1)?.[0]).toContain("search=needle");
  boundary.url = "search=prior&page=1&limit=25";
  rendered.rerender(view());
  expect(input).toHaveValue("prior");
});
it("renders a real empty page and never invents draft warehouse facts or print authority", async () => {
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(p03Envelope(page(options?.params, 1))),
  );
  render(view());
  expect(
    await screen.findByText(`مسودة — ${p03Ids.order}`),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/بند مسودة — لا توجد كميات تشغيلية/),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "تفاصيل" })).toHaveAttribute(
    "href",
    `/admin/orders/${p03Ids.order}`,
  );
  expect(screen.queryByTitle("طباعة أمر التفصيل")).not.toBeInTheDocument();
});
it("keeps an error distinct from a successful empty response", async () => {
  boundary.get.mockRejectedValue(new Error("Read failed"));
  render(view());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذر تحميل الطلبات",
  );
  expect(screen.queryByText("لا توجد بيانات")).not.toBeInTheDocument();
});

it("renders the complete server page without local slicing and navigates only through bound totals", async () => {
  boundary.get.mockImplementation((_path, options) =>
    Promise.resolve(p03Envelope(page(options?.params, 26))),
  );
  render(view());
  await waitFor(() => {
    expect(screen.getAllByRole("link", { name: "تفاصيل" })).toHaveLength(25);
  });
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  expect(boundary.push.mock.calls.at(-1)?.[0]).toContain("page=2");
});

it.each(["MISSING", "AMBIGUOUS"] as const)(
  "recovers legacy owner %s by explicit actual identity while retaining other filters",
  async (match) => {
    boundary.url = "salesperson=Same+name&type=REPAIR&search=retained";
    boundary.get.mockImplementation((path, options) =>
      Promise.resolve(
        p03Envelope(
          path.endsWith("filter-options")
            ? {
                context: {
                  query:
                    typeof options?.params === "object" &&
                    options.params !== null &&
                    "salespersonName" in options.params
                      ? { salespersonName: "Same name" }
                      : {},
                },
                salespeople: [
                  {
                    id: p03Ids.actor,
                    fullName: "Same name",
                    phone: "+966501234567",
                  },
                  {
                    id: p03Ids.customer,
                    fullName: "Same name",
                    phone: "+966501234568",
                  },
                ],
                legacySalesperson:
                  typeof options?.params === "object" &&
                  options.params !== null &&
                  "salespersonName" in options.params
                    ? { input: "Same name", match, salespersonId: null }
                    : null,
              }
            : page(options?.params),
        ),
      ),
    );
    render(view());
    await screen.findByRole("combobox", { name: "مسؤول المبيعات" });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        match === "MISSING" ? "لم يُعثر" : "غير محدد بشكل فريد",
      );
    });
    expect(
      boundary.get.mock.calls.some(
        ([path]) => path === "/administration/orders",
      ),
    ).toBe(false);
    fireEvent.change(screen.getByRole("combobox", { name: "مسؤول المبيعات" }), {
      target: { value: p03Ids.customer },
    });
    await waitFor(() => {
      expect(
        boundary.get.mock.calls.find(
          ([path]) => path === "/administration/orders",
        )?.[1]?.params,
      ).toMatchObject({
        salespersonId: p03Ids.customer,
        type: "REPAIR",
        search: "retained",
      });
    });
    const href: unknown = boundary.replace.mock.calls.at(-1)?.[0];
    expect(href).toContain(`salespersonId=${p03Ids.customer}`);
    expect(href).not.toContain("salesperson=");
  },
);
it("keeps failed legacy lookup blocked until explicit retry returns a unique exact account", async () => {
  boundary.url = "salesperson=Known+name&type=SHOP";
  boundary.get.mockRejectedValueOnce(new Error("Lookup unavailable"));
  boundary.get.mockImplementation((path, options) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("filter-options")
          ? {
              context: { query: { salespersonName: "Known name" } },
              salespeople: [
                { id: p03Ids.actor, fullName: "Known name", phone: null },
              ],
              legacySalesperson: {
                input: "Known name",
                match: "UNIQUE",
                salespersonId: p03Ids.actor,
              },
            }
          : page(options?.params),
      ),
    ),
  );
  render(view());
  expect(
    await screen.findByRole("button", { name: "إعادة تحميل مسؤولي المبيعات" }),
  ).toBeInTheDocument();
  expect(
    boundary.get.mock.calls.some(([path]) => path === "/administration/orders"),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة تحميل مسؤولي المبيعات" }),
  );
  await waitFor(() => {
    expect(
      boundary.get.mock.calls.find(
        ([path]) => path === "/administration/orders",
      )?.[1]?.params,
    ).toMatchObject({ salespersonId: p03Ids.actor, type: "SHOP" });
  });
});
