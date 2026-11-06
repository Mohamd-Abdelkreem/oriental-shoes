import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { customersApi } from "./customers.api";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: mocks,
}));
const id = "11111111-1111-4111-8111-111111111111";
const instant = "2026-11-05T00:00:00.000Z";
const envelope = (data: unknown) => ({
  data: {
    success: true,
    statusCode: 200,
    message: "OK",
    data,
    requestId: "test-request",
    timestamp: instant,
    path: "/api/v1/test",
  },
});
const pagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
beforeEach(() => {
  vi.resetAllMocks();
});
const customer = {
  id,
  name: "Saved",
  phone: "+966500000001",
  email: null,
  address: null,
  notes: null,
  version: 1,
  createdAt: instant,
  updatedAt: instant,
};
const detail = {
  customer,
  draftCount: 0,
  latestDraftAt: null,
  latestMeasurement: null,
  submittedHistory: {
    availability: "not_available",
    reason: "P03_NOT_IMPLEMENTED",
  },
};
it("parses actual directory/detail/measurement envelopes and forwards selectors and cancellation", async () => {
  const signal = new AbortController().signal;
  mocks.get
    .mockResolvedValueOnce(
      envelope({ customers: [], pagination, totalCustomers: 0 }),
    )
    .mockResolvedValueOnce(envelope(detail))
    .mockResolvedValueOnce(envelope(detail))
    .mockResolvedValueOnce(envelope({ measurements: [], pagination }));
  expect(
    (await customersApi.list({ search: "email", page: 1 }, signal))
      .totalCustomers,
  ).toBe(0);
  expect((await customersApi.byPhone("٠٥٠٠٠٠٠٠٠١", signal)).customer.id).toBe(
    id,
  );
  await customersApi.get(id, signal);
  await customersApi.measurements(id, { page: 1 }, signal);
  expect(mocks.get.mock.calls).toEqual([
    ["/customers", { params: { search: "email", page: 1 }, signal }],
    ["/customers/by-phone/%2B966500000001", { signal }],
    [`/customers/${id}`, { signal }],
    [`/customers/${id}/measurements`, { params: { page: 1 }, signal }],
  ]);
});
it("keeps command receipts distinct and sends explicit create/patch bodies without signal", async () => {
  const result = {
    kind: "customer",
    savedCustomer: customer,
    replayed: false,
    receipt: {
      commandId: id,
      operation: "CREATE_CUSTOMER",
      resourceId: id,
      actor: { id, fullName: "Sales", role: "USER", department: "SALES" },
      beforeVersion: null,
      afterVersion: 1,
      occurredAt: instant,
    },
  };
  mocks.post.mockResolvedValueOnce(envelope(result));
  const body = {
    commandId: id,
    customer: {
      name: "Saved",
      phone: "+966500000001",
      email: null,
      address: null,
      notes: null,
    },
  };
  expect(await customersApi.create(body)).toEqual(result);
  expect(mocks.post).toHaveBeenCalledWith("/customers", body);
  const patch = { commandId: id, expectedVersion: 1, patch: { notes: null } };
  mocks.patch.mockResolvedValueOnce(
    envelope({
      ...result,
      receipt: {
        ...result.receipt,
        operation: "UPDATE_CUSTOMER",
        beforeVersion: 1,
        afterVersion: 2,
      },
      savedCustomer: { ...customer, version: 2 },
    }),
  );
  expect((await customersApi.update(id, patch)).savedCustomer.version).toBe(2);
  expect(mocks.patch).toHaveBeenCalledWith(`/customers/${id}`, patch);
});
it.each([
  undefined,
  { ...detail, ownerId: id },
  { ...detail, customer: { ...customer, version: "1" } },
  { draft: customer },
])("rejects malformed/private/wrong-kind successful data", async (data) => {
  mocks.get.mockResolvedValue(envelope(data));
  await expect(customersApi.get(id)).rejects.toBeInstanceOf(ApiContractError);
});
it.each([403, 404, 409])(
  "propagates rejected transport status %i",
  async (status) => {
    const failure = new Error(String(status));
    mocks.get.mockRejectedValue(failure);
    await expect(customersApi.byPhone(customer.phone)).rejects.toBe(failure);
  },
);

it("parses the bounded customer-card read and rejects a malformed success rather than inventing an empty page", async () => {
  const signal = new AbortController().signal;
  const page = { drafts: [], pagination };
  mocks.get.mockResolvedValueOnce(envelope(page));
  expect(await customersApi.drafts(id, { page: 1, limit: 25 }, signal)).toEqual(
    page,
  );
  expect(mocks.get).toHaveBeenCalledWith(`/customers/${id}/drafts`, {
    params: { page: 1, limit: 25 },
    signal,
  });
  mocks.get.mockResolvedValueOnce(envelope({ drafts: [{ id }], pagination }));
  await expect(
    customersApi.drafts(id, { page: 1, limit: 25 }),
  ).rejects.toBeInstanceOf(ApiContractError);
});
