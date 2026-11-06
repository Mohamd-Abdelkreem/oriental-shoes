import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authUserDataSchema, draftSummarySchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesAllOrdersView } from "./sales-all-orders-view";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
const response = (data: unknown) => ({
  data: {
    success: true,
    statusCode: 200,
    message: "OK",
    requestId: "safe-request",
    timestamp: instant,
    path: "/api/v1/sales-drafts",
    data,
  },
});
const failure = (status = 503) =>
  new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code: status === 404 ? "DRAFT_NOT_FOUND" : "HTTP_ERROR",
      message: "Could not complete",
      requestId: "safe-request",
      timestamp: instant,
      path: "/api/v1/sales-drafts",
    },
  });
const pagination = (page = 1, limit = 25, total = 26) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPreviousPage: page > 1,
});
const summary = (index = 1) =>
  draftSummarySchema.parse({
    id:
      index === 1
        ? id
        : `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
    version: 1,
    status: "DRAFT",
    owner: { id: actor, fullName: "Actual owner" },
    type: "SHOP",
    customer: null,
    deliveryDate: null,
    pieceCount: 3,
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
  });
const session = (subject = actor, admin = false) => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, subject);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: {
        id: subject,
        fullName: admin ? "Admin viewer" : "Sales viewer",
        email: "sales@example.test",
        phone: null,
        role: admin ? "ADMIN" : "USER",
        status: "ACTIVE",
        department: admin ? null : "SALES",
        staffApprovedAt: instant,
        emailVerifiedAt: instant,
        accessVersion: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    }),
  );
};
let fail = false;
beforeEach(() => {
  vi.resetAllMocks();
  fail = false;
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  session();
  mocks.get.mockImplementation(
    (url: string, config?: { params?: { page?: number; limit?: number } }) => {
      if (fail) throw failure();
      const page = config?.params?.page ?? 1,
        limit = config?.params?.limit ?? 25;
      if (url === "/sales-drafts")
        return response({
          drafts:
            page === 1
              ? Array.from({ length: Math.min(limit, 25) }, (_, i) =>
                  summary(i + 1),
                )
              : [summary(26)],
          totalDrafts: 90,
          totalPieces: 320,
          pagination: pagination(page, limit),
        });

      throw new Error(`Unexpected read ${url}`);
    },
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <SalesAllOrdersView entry={{ kind: "drafts", status: "ALL" }} />
    </QueryClientProvider>,
  );
it("sends bounded search/type with page reset and displays server aggregates separately", async () => {
  mount();
  await screen.findByText(id);
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await screen.findByText(summary(26).id);
  fireEvent.change(
    screen.getByPlaceholderText("ابحث برقم الطلب، العميل، الهاتف، الموديل..."),
    { target: { value: "needle" } },
  );
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledWith(
      "/sales-drafts",
      expect.objectContaining({
        params: { page: 1, limit: 25, search: "needle" },
      }),
    );
  });
  fireEvent.change(screen.getByRole("combobox", { name: "نوع الطلب:" }), {
    target: { value: "GIFT" },
  });
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledWith(
      "/sales-drafts",
      expect.objectContaining({
        params: { page: 1, limit: 25, search: "needle", type: "GIFT" },
      }),
    );
  });
  expect(screen.getByText("عرض 26 من أصل 90 طلب")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "حالة الطلب:" }), {
    target: { value: "قيد التصنيع" },
  });
  await screen.findByText(/هذه الحالة غير متاحة/u);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it.each([undefined, ["مسودة", "مسودة"], "غير معروف", "قيد التصنيع"])(
  "parses awaited status %j without issuing a misleading later/invalid query",
  async (status) => {
    const Page = (await import("@/app/(workspace)/sales/orders/page")).default;
    render(
      <QueryClientProvider client={client}>
        {await Page({
          searchParams: Promise.resolve(status === undefined ? {} : { status }),
        })}
      </QueryClientProvider>,
    );
    if (status === undefined) {
      await screen.findByText(id);
    } else {
      await screen.findByRole("alert");
      expect(mocks.get).not.toHaveBeenCalled();
    }
  },
);

it.each([
  { from: "قيد التصنيع", to: undefined },
  { from: undefined, to: "قيد التصنيع" },
  { from: ["مسودة", "مسودة"], to: undefined },
])(
  "honors a new parsed page entry during soft navigation from $from to $to",
  async ({ from, to }) => {
    const Page = (await import("@/app/(workspace)/sales/orders/page")).default;
    const first = await Page({
      searchParams: Promise.resolve(from === undefined ? {} : { status: from }),
    });
    const view = render(
      <QueryClientProvider client={client}>{first}</QueryClientProvider>,
    );
    if (from === undefined) await screen.findByText(id);
    else {
      await screen.findByRole("alert");
      expect(mocks.get).not.toHaveBeenCalled();
    }
    const before = mocks.get.mock.calls.length;
    const next = await Page({
      searchParams: Promise.resolve(to === undefined ? {} : { status: to }),
    });
    view.rerender(
      <QueryClientProvider client={client}>{next}</QueryClientProvider>,
    );
    if (to === undefined) {
      await screen.findByText(id);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } else {
      await screen.findByText(/هذه الحالة غير متاحة/u);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(mocks.get).toHaveBeenCalledTimes(before);
    }
  },
);

it("retains local All/Draft filters and search when the normalized route entry is unchanged", async () => {
  const Page = (await import("@/app/(workspace)/sales/orders/page")).default;
  const view = render(
    <QueryClientProvider client={client}>
      {await Page({ searchParams: Promise.resolve({}) })}
    </QueryClientProvider>,
  );
  await screen.findByText(id);
  fireEvent.change(screen.getByRole("combobox", { name: "حالة الطلب:" }), {
    target: { value: "مسودة" },
  });
  const search = screen.getByPlaceholderText(
    "ابحث برقم الطلب، العميل، الهاتف، الموديل...",
  );
  fireEvent.change(search, { target: { value: "retained search" } });
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledWith(
      "/sales-drafts",
      expect.objectContaining({
        params: { page: 1, limit: 25, search: "retained search" },
      }),
    );
  });
  view.rerender(
    <QueryClientProvider client={client}>
      {await Page({ searchParams: Promise.resolve({ status: "الكل" }) })}
    </QueryClientProvider>,
  );
  expect(screen.getByRole("combobox", { name: "حالة الطلب:" })).toHaveValue(
    "مسودة",
  );
  expect(
    screen.getByPlaceholderText("ابحث برقم الطلب، العميل، الهاتف، الموديل..."),
  ).toHaveValue("retained search");
  fireEvent.change(screen.getByRole("combobox", { name: "حالة الطلب:" }), {
    target: { value: "الكل" },
  });
  expect(screen.getByRole("table")).toBeInTheDocument();
});
