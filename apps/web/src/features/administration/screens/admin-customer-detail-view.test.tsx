import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  updateCustomerBodySchema,
  customerCommandDataSchema,
  customerSchema,
  customerDraftCardSchema,
  type CustomerDto,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesCustomerEditView } from "@/features/sales/screens/sales-customer-edit-view";
import { AdminCustomerDetailView } from "./admin-customer-detail-view";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get, patch: mocks.patch },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  other = "99999999-9999-4999-8999-999999999999",
  id = "22222222-2222-4222-8222-222222222222",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
let subject = actor,
  admin = true,
  failCards = false,
  count = 2;
let current: CustomerDto;
const response = (data: unknown) => ({
  data: {
    success: true,
    statusCode: 200,
    message: "OK",
    requestId: "safe-request",
    timestamp: instant,
    path: "/api/v1/customers",
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
      code: status === 404 ? "CUSTOMER_NOT_FOUND" : "HTTP_ERROR",
      message: "Could not complete",
      requestId: "safe-request",
      timestamp: instant,
      path: "/api/v1/customers",
    },
  });
const pagination = (page = 1, limit = 25, total = count) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPreviousPage: page > 1,
});
const card = (index = 1, owner = subject) =>
  customerDraftCardSchema.parse({
    id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
    version: 1,
    status: "DRAFT",
    owner: { id: owner, fullName: owner === actor ? "Sales A" : "Sales B" },
    type: "SHOP",
    customer: {
      id,
      name: current.name,
      phone: current.phone,
      email: null,
      address: null,
    },
    deliveryDate: null,
    generalNotes: `Saved note ${String(index)}`,
    pieceCount: 2,
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
    pieces: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        position: 1,
        quantity: 1,
        model: `${owner === actor ? "A" : "B"} model ${String(index)}`,
        size: "42",
        leatherBase: "Actual leather",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        position: 2,
        quantity: 1,
        model: null,
        size: null,
        leatherBase: null,
      },
    ],
  });
const detail = () => ({
  customer: current,
  draftCount: count,
  latestDraftAt: instant,
  latestMeasurement: {
    draftId: card().id,
    pieceId: "44444444-4444-4444-8444-444444444444",
    owner: { id: subject, fullName: "Actual owner" },
    type: "SHOP",
    model: "Measured model",
    size: "42",
    aField: "A1",
    fField: "F1",
    draftUpdatedAt: instant,
    source: "DRAFT",
  },
  submittedHistory: {
    availability: "not_available",
    reason: "P03_NOT_IMPLEMENTED",
  },
});
const session = (who = actor, isAdmin = true) => {
  subject = who;
  admin = isAdmin;
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, who);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: {
        id: who,
        fullName: isAdmin ? "Admin" : "Sales",
        email: "staff@example.test",
        phone: null,
        role: isAdmin ? "ADMIN" : "USER",
        status: "ACTIVE",
        department: isAdmin ? null : "SALES",
        staffApprovedAt: isAdmin ? null : instant,
        emailVerifiedAt: instant,
        accessVersion: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    }),
  );
};
const read = (
  url: string,
  config?: { params?: { page?: number; limit?: number } },
) => {
  if (url === "/customers")
    return response({
      customers: [
        {
          customer: {
            id: current.id,
            name: current.name,
            phone: current.phone,
            email: current.email,
            address: current.address,
          },
          draftCount: count,
          lastDraftAt: instant,
        },
      ],
      totalCustomers: 1,
      pagination: pagination(1, 25, 1),
    });
  if (url.startsWith("/customers/by-phone/") || url === `/customers/${id}`)
    return response(detail());
  const page = config?.params?.page ?? 1,
    limit = config?.params?.limit ?? 25;
  if (url === `/customers/${id}/drafts`) {
    if (failCards) throw failure();
    return response({
      drafts: Array.from(
        { length: Math.max(0, Math.min(limit, count - (page - 1) * limit)) },
        (_, index) =>
          card(
            (page - 1) * limit + index + 1,
            admin && index % 2 === 1 ? other : subject,
          ),
      ),
      pagination: pagination(page, limit),
    });
  }
  if (url === `/customers/${id}/measurements`)
    return response({
      measurements: [detail().latestMeasurement],
      pagination: pagination(page, limit, 1),
    });
  throw new Error(`Unexpected read ${url}`);
};
beforeEach(() => {
  vi.resetAllMocks();
  failCards = false;
  count = 2;
  current = customerSchema.parse({
    id,
    name: "Shared C",
    phone: "+966500000001",
    email: "shared@example.test",
    address: "Saved address",
    notes: "Contact preferences",
    version: 1,
    createdAt: instant,
    updatedAt: instant,
  });
  client.setDefaultOptions({
    queries: { retry: false, staleTime: 30000 },
    mutations: { retry: false },
  });
  session();
  mocks.get.mockImplementation(read);
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = (phone = "+966500000001") =>
  render(
    <QueryClientProvider client={client}>
      <AdminCustomerDetailView customerId={phone} />
    </QueryClientProvider>,
  );
it("renders broader ADMIN cards as retained table rows with scoped server count and real sales links", async () => {
  mount();
  await screen.findByText("Shared C");
  await screen.findByRole("table");
  expect(screen.getAllByRole("link", { name: "عرض" })).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "عرض" })[0]).toHaveAttribute(
    "href",
    `/sales/orders/${card().id}`,
  );
  expect(screen.getAllByText("غير متاح قبل الإرسال")).toHaveLength(2);
  expect(screen.getByText("Contact preferences")).toBeInTheDocument();
  expect(
    screen.getByText("الطلبات المكتملة (غير متاحة بعد)"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /\/admin\/orders/u }),
  ).not.toBeInTheDocument();
});
it("uses the complete server page then follows controlled pagination", async () => {
  count = 26;
  mount();
  await screen.findByText(card(25).id);
  expect(screen.getAllByRole("link", { name: "عرض" })).toHaveLength(25);
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await screen.findByText(card(26).id);
  expect(screen.getAllByRole("link", { name: "عرض" })).toHaveLength(1);
});
it("does not substitute a fixture on missing or denied customer", async () => {
  mocks.get.mockRejectedValue(failure(404));
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText("Shared C")).not.toBeInTheDocument();
});
it("keeps errors separate from an empty related-record list", async () => {
  failCards = true;
  mount();
  await screen.findByText(/تعذّر تحميل المسودات/u);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  failCards = false;
  count = 0;
  fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل المسودات" }));
  await screen.findByText("لا توجد مسودات مرتبطة متاحة لهذا الحساب");
});

it("coordinates a real editor/detail through confirmed write, failed related refresh, newer current version and read-only recovery", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized response");
  };
  mocks.patch.mockImplementationOnce((_url: string, raw: unknown) => {
    const body = updateCustomerBodySchema.parse(raw),
      saved = customerSchema.parse({ ...current, ...body.patch, version: 2 });
    const result = customerCommandDataSchema.parse({
      kind: "customer",
      savedCustomer: saved,
      replayed: false,
      receipt: {
        commandId: body.commandId,
        operation: "UPDATE_CUSTOMER",
        resourceId: id,
        actor: {
          id: actor,
          fullName: "Admin",
          role: "ADMIN",
          department: null,
        },
        beforeVersion: 1,
        afterVersion: 2,
        occurredAt: instant,
      },
    });
    current = customerSchema.parse({
      ...saved,
      name: "Newer current C",
      version: 3,
    });
    return new Promise<ReturnType<typeof response>>((resolve) => {
      release = () => {
        resolve(response(result));
      };
    });
  });
  render(
    <QueryClientProvider client={client}>
      <SalesCustomerEditView customerId="+966500000001" />
      <AdminCustomerDetailView customerId="+966500000001" />
    </QueryClientProvider>,
  );
  const name = await screen.findByLabelText(/اسم العميل/u);
  await screen.findByRole("table");
  fireEvent.change(name, {
    target: { value: "Unsynchronized submitted name" },
  });
  failCards = true;
  fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
  await waitFor(() => {
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  });
  expect(name).toBeDisabled();
  act(() => {
    release();
  });
  const refresh = await screen.findByRole("button", { name: "تحديث العرض" });
  expect(screen.getByLabelText(/اسم العميل/u)).toHaveValue(
    "Unsynchronized submitted name",
  );
  expect(
    await screen.findByRole("heading", { name: "Newer current C" }),
  ).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "حفظ التعديلات" })).toBeDisabled();
  failCards = false;
  fireEvent.click(refresh);
  await waitFor(() => {
    expect(mocks.push).toHaveBeenCalledWith("/sales/customers/%2B966500000001");
  });
  expect(screen.getByLabelText(/اسم العميل/u)).toHaveValue("Newer current C");
  expect(mocks.patch).toHaveBeenCalledTimes(1);
});

it("resolves the encoded canonical phone segment supplied by the actual Next route", async () => {
  mount("%2B966500000001");
  await screen.findByText("Shared C");
  expect(mocks.get).toHaveBeenCalledWith(
    "/customers/by-phone/%2B966500000001",
    expect.anything(),
  );
});
