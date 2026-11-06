import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authUserDataSchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { AdminCustomersView } from "./admin-customers-view";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
const customer = (index: number) => ({
  customer: {
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
    name: `عميل ${String(index)}`,
    phone: `+96650${String(index).padStart(7, "0")}`,
    email: index === 0 ? "person@example.test" : null,
    address: null,
  },
  draftCount: 7,
  lastDraftAt: instant,
});
const page = (
  number: number,
  total = 26,
  rows = number === 1
    ? Array.from({ length: 25 }, (_, index) => customer(index))
    : [customer(25)],
) => ({
  data: {
    success: true,
    statusCode: 200,
    message: "OK",
    requestId: "safe-request",
    timestamp: instant,
    path: "/api/v1/customers",
    data: {
      customers: rows,
      pagination: {
        page: number,
        limit: 25,
        total,
        totalPages: Math.ceil(total / 25),
        hasNextPage: number < Math.ceil(total / 25),
        hasPreviousPage: number > 1 && total > 0,
      },
      totalCustomers: total,
    },
  },
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <AdminCustomersView />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, actor);
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: {
        id: actor,
        fullName: "Actor",
        email: "actor@example.test",
        phone: null,
        role: "ADMIN",
        status: "ACTIVE",
        department: null,
        staffApprovedAt: null,
        emailVerifiedAt: instant,
        accessVersion: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("renders the entire server page with scoped draft counts and requests the next server page", async () => {
  mocks.get
    .mockResolvedValueOnce(page(1))
    .mockResolvedValueOnce(page(2))
    .mockResolvedValueOnce(page(1, 1, [customer(0)]));
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("جارٍ تحميل");
  await screen.findByText("عميل 24");
  expect(screen.getAllByText("7 مسودات")).toHaveLength(25);
  expect(screen.getByText("عرض 26 من أصل 26 عميل")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await screen.findByText("عميل 25");
  expect(screen.queryByText("عميل 0")).not.toBeInTheDocument();
  expect(mocks.get).toHaveBeenLastCalledWith(
    "/customers",
    expect.objectContaining({ params: { page: 2, limit: 25 } }),
  );
  fireEvent.change(
    screen.getByPlaceholderText("ابحث باسم العميل أو رقم الهاتف أو البريد..."),
    { target: { value: "PERSON@example.test" } },
  );
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });
  expect(mocks.get).toHaveBeenLastCalledWith(
    "/customers",
    expect.objectContaining({
      params: { page: 1, limit: 25, search: "PERSON@example.test" },
    }),
  );
});
it("keeps read failure distinct from empty success and retries a bounded read", async () => {
  mocks.get
    .mockRejectedValueOnce(
      new AxiosError("unavailable", "ERR_BAD_RESPONSE", undefined, undefined, {
        status: 503,
        statusText: "unavailable",
        data: null,
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    )
    .mockResolvedValueOnce(page(1, 0, []));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذّر تحميل العملاء",
  );
  expect(screen.queryByText("لا يوجد عملاء")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  expect(await screen.findByText("لا يوجد عملاء")).toBeInTheDocument();
});
it("resets email search to page one and recovers an out-of-range server page once", async () => {
  mocks.get
    .mockResolvedValueOnce(page(1))
    .mockResolvedValueOnce(page(2, 1, []))
    .mockResolvedValueOnce(page(1, 1, [customer(0)]))
    .mockResolvedValueOnce(page(1, 0, []));
  mount();
  await screen.findByText("عميل 24");
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });
  await screen.findByText("عميل 0");
  fireEvent.change(
    screen.getByPlaceholderText("ابحث باسم العميل أو رقم الهاتف أو البريد..."),
    { target: { value: "PERSON@example.test" } },
  );
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(4);
  });
  expect(mocks.get).toHaveBeenLastCalledWith(
    "/customers",
    expect.objectContaining({
      params: { page: 1, limit: 25, search: "PERSON@example.test" },
    }),
  );
});
