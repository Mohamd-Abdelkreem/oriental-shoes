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
  customerSchema,
  updateCustomerBodySchema,
  customerCommandDataSchema,
  type CustomerDto,
  type CustomerCommandData,
  type UpdateCustomerBody,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { readOperationalScope } from "@/shared/query/operational-scope";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesCustomerEditView } from "./sales-customer-edit-view";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get, post: mocks.post, patch: mocks.patch },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
const record = (
  version = 1,
  overrides: Partial<CustomerDto> = {},
): CustomerDto =>
  customerSchema.parse({
    id,
    name: "Saved customer",
    phone: "+966500000001",
    email: null,
    address: null,
    notes: "saved note",
    version,
    createdAt: instant,
    updatedAt: instant,
    ...overrides,
  });
let current: CustomerDto | undefined;
let directory: CustomerDto[] = [];
let retainedReceipt: CustomerCommandData | null = null;
let missingReceipt = false;
let failDetail = false;
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
const failure = (status: number, code = "HTTP_ERROR") =>
  new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "The operation could not complete.",
      requestId: "safe-request",
      timestamp: instant,
      path: "/api/v1/customers",
    },
  });
const detail = (customer: CustomerDto) => ({
  customer,
  draftCount: 0,
  latestDraftAt: null,
  latestMeasurement: null,
  submittedHistory: {
    availability: "not_available",
    reason: "P03_NOT_IMPLEMENTED",
  },
});
const result = (
  body: UpdateCustomerBody,
  customer: CustomerDto,
): CustomerCommandData =>
  customerCommandDataSchema.parse({
    kind: "customer",
    savedCustomer: customer,
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation: "UPDATE_CUSTOMER",
      resourceId: customer.id,
      actor: {
        id: actor,
        fullName: "Sales",
        role: "USER",
        department: "SALES",
      },
      beforeVersion: body.expectedVersion,
      afterVersion: customer.version,
      occurredAt: instant,
    },
  });
const replyToRead = (
  url: string,
  config?: { params?: { search?: string } },
) => {
  if (url === "/customers") {
    const search = config?.params?.search?.toLowerCase() ?? "";
    const rows = directory
      .filter((customer) =>
        `${customer.name} ${customer.phone} ${customer.email ?? ""}`
          .toLowerCase()
          .includes(search),
      )
      .map((customer) => ({
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
        },
        draftCount: 0,
        lastDraftAt: null,
      }));
    return response({
      customers: rows,
      totalCustomers: directory.length,
      pagination: {
        page: 1,
        limit: 25,
        total: rows.length,
        totalPages: rows.length === 0 ? 0 : 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }
  if (url.startsWith("/customers/by-phone/")) {
    const phone = decodeURIComponent(url.slice("/customers/by-phone/".length)),
      found = directory.find((customer) => customer.phone === phone);
    if (found === undefined) throw failure(404, "CUSTOMER_NOT_FOUND");
    return response(detail(found));
  }
  if (url === `/customers/${id}`) {
    if (failDetail) throw failure(503);
    if (current === undefined) throw failure(404, "CUSTOMER_NOT_FOUND");
    return response(detail(current));
  }
  if (url.startsWith("/sales-commands/")) {
    if (missingReceipt || retainedReceipt === null)
      throw failure(404, "SALES_COMMAND_NOT_FOUND");
    return response({ ...retainedReceipt, replayed: true });
  }
  throw new Error(`Unexpected read ${url}`);
};
const acceptUpdate = (raw: unknown) => {
  const body = updateCustomerBodySchema.parse(raw);
  if (current === undefined) throw new Error("Expected current customer");
  current = customerSchema.parse({
    ...current,
    ...body.patch,
    version: body.expectedVersion + 1,
  });
  directory = directory.map((customer) =>
    customer.id === id ? (current ?? customer) : customer,
  );
  retainedReceipt = result(body, current);
  return response(retainedReceipt);
};
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <SalesCustomerEditView customerId="0500000001" />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  current = record();
  directory = [current];
  retainedReceipt = null;
  missingReceipt = false;
  failDetail = false;
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, actor);
  client.setDefaultOptions({
    queries: { retry: false, staleTime: 30000 },
    mutations: { retry: false },
  });
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: {
        id: actor,
        fullName: "Sales",
        email: "sales@example.test",
        phone: null,
        role: "USER",
        status: "ACTIVE",
        department: "SALES",
        staffApprovedAt: instant,
        emailVerifiedAt: instant,
        accessVersion: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    }),
  );
  mocks.get.mockImplementation(replyToRead);
  mocks.post.mockRejectedValue(new Error("Unexpected customer create"));
  mocks.patch.mockImplementation((_url: string, raw: unknown) =>
    acceptUpdate(raw),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});

it("does not write a no-op and sends only explicit optional clears at the stable UUID", async () => {
  mount();
  const notes = await screen.findByLabelText(/ملاحظات إضافية/u);
  fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
  expect(await screen.findByText("لا توجد تغييرات للحفظ.")).toBeInTheDocument();
  expect(mocks.patch).not.toHaveBeenCalled();
  fireEvent.change(notes, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
  await waitFor(() => {
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
  expect(mocks.patch).toHaveBeenCalledWith(
    `/customers/${id}`,
    expect.objectContaining({ expectedVersion: 1, patch: { notes: null } }),
  );
});
it("preserves dirty input on a background revision, requires conflict review, and keeps controls registered after reset", async () => {
  mount();
  const name = await screen.findByLabelText(/اسم العميل/u);
  fireEvent.change(name, { target: { value: "Unsaved local name" } });
  current = record(2, { name: "Newer server name" });
  directory = [current];
  const scope = readOperationalScope(client);
  if (scope === null) throw new Error("Expected scope");
  await act(async () => {
    await client.invalidateQueries({
      queryKey: customerKeys.detail(scope, id),
    });
  });
  expect(name).toHaveValue("Unsaved local name");
  expect(await screen.findByText(/توجد بيانات أحدث/u)).toBeInTheDocument();
  mocks.patch.mockRejectedValueOnce(failure(409, "CUSTOMER_VERSION_CONFLICT"));
  fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
  expect(await screen.findByText(/تغيرت بيانات العميل؛/u)).toBeInTheDocument();
  expect(name).toHaveValue("Unsaved local name");
  expect(screen.getByRole("button", { name: "حفظ التعديلات" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة التحميل والمراجعة" }),
  );
  await waitFor(() => expect(name).toHaveValue("Newer server name"));
  fireEvent.change(screen.getByLabelText(/رقم الهاتف/u), {
    target: { value: "0500000009" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
  await waitFor(() => {
    expect(mocks.push).toHaveBeenCalledWith("/sales/customers/%2B966500000009");
  });
  expect(mocks.patch).toHaveBeenLastCalledWith(
    `/customers/${id}`,
    expect.objectContaining({
      expectedVersion: 2,
      patch: { phone: "+966500000009" },
    }),
  );
  fireEvent.change(screen.getByLabelText(/ملاحظات إضافية/u), {
    target: { value: "After reset" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
  await waitFor(() => {
    expect(mocks.patch).toHaveBeenCalledTimes(3);
  });
  expect(mocks.patch).toHaveBeenLastCalledWith(
    `/customers/${id}`,
    expect.objectContaining({
      expectedVersion: 3,
      patch: { notes: "After reset" },
    }),
  );
});
it("shows missing/error instead of mounting a blank editor", async () => {
  directory = [];
  current = undefined;
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذّر تحميل العميل",
  );
  expect(screen.queryByLabelText(/اسم العميل/u)).not.toBeInTheDocument();
  expect(mocks.patch).not.toHaveBeenCalled();
});

it("keeps dirty registered fields mounted through failed background reads and read-only retry", async () => {
  mount();
  const name = await screen.findByLabelText(/اسم العميل/u);
  fireEvent.change(name, { target: { value: "Dirty customer must survive" } });
  const scope = readOperationalScope(client);
  if (scope === null) throw new Error("Missing scope");
  failDetail = true;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: customerKeys.detail(scope, id),
      exact: true,
    });
  });
  await screen.findByRole("alert");
  expect(screen.getByLabelText(/اسم العميل/u)).toHaveValue(
    "Dirty customer must survive",
  );
  expect(mocks.patch).not.toHaveBeenCalled();
  failDetail = false;
  fireEvent.click(screen.getByRole("button", { name: "إعادة تحديث العميل" }));
  await waitFor(() => {
    expect(client.isFetching()).toBe(0);
  });
  expect(screen.getByLabelText(/اسم العميل/u)).toHaveValue(
    "Dirty customer must survive",
  );
});

it("loads the stable edit target from a URI-encoded canonical phone route", async () => {
  render(
    <QueryClientProvider client={client}>
      <SalesCustomerEditView customerId="%2B966500000001" />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText(/اسم العميل/u)).toHaveValue(
    "Saved customer",
  );
});
