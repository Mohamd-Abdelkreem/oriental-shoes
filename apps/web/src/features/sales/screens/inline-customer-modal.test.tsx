import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  customerSchema,
  createCustomerBodySchema,
  customerCommandDataSchema,
  type CustomerDto,
  type CustomerCommandData,
  type CreateCustomerBody,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { InlineCustomerModal } from "./inline-customer-modal";
import { readOperationalScope } from "@/shared/query/operational-scope";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  created: vi.fn(),
  close: vi.fn(),
}));

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
  body: CreateCustomerBody,
  customer: CustomerDto,
): CustomerCommandData =>
  customerCommandDataSchema.parse({
    kind: "customer",
    savedCustomer: customer,
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation: "CREATE_CUSTOMER",
      resourceId: customer.id,
      actor: {
        id: actor,
        fullName: "Sales",
        role: "USER",
        department: "SALES",
      },
      beforeVersion: null,
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
const acceptCreate = (raw: unknown) => {
  const body = createCustomerBodySchema.parse(raw);
  current = record(1, { ...body.customer, notes: body.customer.notes });
  directory = [...directory.filter((customer) => customer.id !== id), current];
  retainedReceipt = result(body, current);
  return response(retainedReceipt);
};
const formToken = {};
const requiredScope = () => {
  const scope = readOperationalScope(client);
  if (scope === null) throw new Error("Missing test session");
  return scope;
};
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <InlineCustomerModal
        originScope={requiredScope()}
        originFormToken={formToken}
        onCreated={mocks.created}
        onClose={mocks.close}
      />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  current = undefined;
  directory = [];
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
  mocks.post.mockImplementation((_url: string, raw: unknown) =>
    acceptCreate(raw),
  );
  mocks.patch.mockRejectedValue(new Error("Unexpected customer update"));
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});

const fill = () => {
  fireEvent.change(screen.getByLabelText(/اسم العميل/u), {
    target: { value: "  Typed customer  " },
  });
  fireEvent.change(screen.getByLabelText(/رقم الهاتف/u), {
    target: { value: "٠٥٠٠٠٠٠٠٠١" },
  });
};
it("returns the synchronized current customer, rather than submitted text", async () => {
  mount();
  fill();
  mocks.post.mockImplementationOnce((_url: string, raw: unknown) => {
    const reply = acceptCreate(raw);
    current = record(2, { name: "Current server name" });
    return reply;
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ وربط بالطلب" }));
  await waitFor(() => {
    expect(mocks.created).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        name: "Current server name",
        version: 2,
        phone: "+966500000001",
      }),
    );
  });
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("closes an unsent capture with Escape and performs no write", () => {
  mount();
  fill();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(mocks.close).toHaveBeenCalledTimes(1);
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.created).not.toHaveBeenCalled();
});
it("requires explicit duplicate selection and refreshes the actual selected stable customer", async () => {
  directory = [record(1, { name: "Existing saved customer" })];
  current = directory[0];
  mount();
  fill();
  const choose = await screen.findByRole("button", {
    name: "اختيار هذا العميل",
  });
  expect(mocks.created).not.toHaveBeenCalled();
  fireEvent.click(choose);
  await waitFor(() => {
    expect(mocks.created).toHaveBeenCalledWith(current);
  });
  expect(mocks.post).not.toHaveBeenCalled();
});

it("retains the frozen command on a first binding conflict instead of silently allocating another identity", async () => {
  mocks.post.mockRejectedValueOnce(failure(409, "SALES_COMMAND_CONFLICT"));
  mount();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "حفظ وربط بالطلب" }));
  await screen.findByRole("button", { name: "التحقق من الحفظ" });
  expect(screen.getByLabelText(/اسم العميل/u)).toBeDisabled();
  expect(mocks.created).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة محاولة الحفظ نفسه" }),
  );
  await waitFor(() => {
    expect(mocks.created).toHaveBeenCalledTimes(1);
  });
  expect(mocks.post.mock.calls[1]?.[1]).toEqual(mocks.post.mock.calls[0]?.[1]);
  expect(mocks.post).toHaveBeenCalledTimes(2);
});
