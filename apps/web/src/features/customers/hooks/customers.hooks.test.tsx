import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  customerDataSchema,
  customerMeasurementsDataSchema,
  type CustomerData,
  type CustomerMeasurementsData,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readOperationalScope } from "@/shared/query/operational-scope";
import {
  customerDetailOptions,
  customerKeys,
  useCustomer,
  useCustomerByPhone,
  useCustomerList,
  useCustomerDrafts,
  useCustomerMeasurements,
} from "./customers.hooks";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  byPhone: vi.fn(),
  measurements: vi.fn(),
  drafts: vi.fn(),
}));
vi.mock("../api/customers.api", () => ({ customersApi: mocks }));
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const detail = (version = 1, count = 0): CustomerData =>
  customerDataSchema.parse({
    customer: {
      id,
      name: "Saved",
      phone: "+966500000001",
      email: null,
      address: null,
      notes: null,
      version,
      createdAt: instant,
      updatedAt: instant,
    },
    draftCount: count,
    latestDraftAt: null,
    latestMeasurement: null,
    submittedHistory: {
      availability: "not_available",
      reason: "P03_NOT_IMPLEMENTED",
    },
  });
const session = (subject = actor) =>
  authUserDataSchema.parse({
    user: {
      id: subject,
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
  });
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, session());
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const scope = () => {
  const value = readOperationalScope(client);
  if (value === null) throw new Error("Expected scope");
  return value;
};
it("uses canonical query selectors, exact server pages and no cross-key placeholder", async () => {
  const pagination = {
    page: 2,
    limit: 25,
    total: 30,
    totalPages: 2,
    hasNextPage: false,
    hasPreviousPage: true,
  };
  mocks.list.mockResolvedValue({
    customers: [],
    pagination,
    totalCustomers: 30,
  });
  const view = renderHook(
    () => useCustomerList({ search: "  email  ", page: 2 }),
    { wrapper },
  );
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(view.result.current.data?.pagination.page).toBe(2);
  expect(mocks.list).toHaveBeenCalledWith(
    { search: "email", page: 2, limit: 25 },
    expect.any(AbortSignal),
  );
  expect(
    customerKeys.list(scope(), { page: 1, limit: 25, search: "email" }),
  ).not.toEqual(
    customerKeys.list(scope(), { page: 2, limit: 25, search: "email" }),
  );
  view.unmount();
});
it("resolves normalized phones and never requests an invalid selected customer", async () => {
  mocks.byPhone.mockResolvedValue(detail());
  const phone = renderHook(() => useCustomerByPhone("٠٥٠٠٠٠٠٠٠١"), { wrapper });
  await waitFor(() => {
    expect(phone.result.current.data?.customer.id).toBe(id);
  });
  expect(mocks.byPhone).toHaveBeenCalledWith(
    "+966500000001",
    expect.any(AbortSignal),
  );
  const invalid = renderHook(() => useCustomer("bad-id"), { wrapper });
  expect(invalid.result.current.fetchStatus).toBe("idle");
  expect(mocks.get).not.toHaveBeenCalled();
  phone.unmount();
  invalid.unmount();
});
it("preserves a newer detail when an older read settles and accepts equal-version projection refresh", async () => {
  const captured = scope();
  let resolve: (value: CustomerData) => void = () => {
    throw new Error("Uninitialized response");
  };
  mocks.get.mockReturnValue(
    new Promise<CustomerData>((done) => {
      resolve = done;
    }),
  );
  const pending = client.fetchQuery({
    ...customerDetailOptions(client, captured, id),
    staleTime: 0,
  });
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  client.setQueryData(customerKeys.detail(captured, id), detail(3, 1));
  resolve(detail(1, 0));
  await pending;
  expect(client.getQueryData(customerKeys.detail(captured, id))).toEqual(
    detail(3, 1),
  );
  mocks.get.mockResolvedValue(detail(3, 2));
  await client.fetchQuery({
    ...customerDetailOptions(client, captured, id),
    staleTime: 0,
  });
  expect(client.getQueryData(customerKeys.detail(captured, id))).toEqual(
    detail(3, 2),
  );
});
it.each(["same", "other"] as const)(
  "suppresses delayed replies across %s actor credential changes",
  async (kind) => {
    const captured = scope();
    let resolve: (value: CustomerData) => void = () => {
      throw new Error("Uninitialized response");
    };
    mocks.get.mockReturnValue(
      new Promise<CustomerData>((done) => {
        resolve = done;
      }),
    );
    const view = renderHook(() => useCustomer(id), { wrapper });
    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledTimes(1);
    });
    act(() => {
      const epoch = beginAuthSessionEpoch("credential-login");
      const subject =
        kind === "same" ? actor : "44444444-4444-4444-8444-444444444444";
      acceptCredentialLogin("replacement", epoch, subject);
      client.setQueryData(AUTH_SESSION_QUERY_KEY, session(subject));
      view.rerender();
    });
    const current = scope();
    client.setQueryData(customerKeys.detail(current, id), detail(4));
    resolve(detail(1));
    await waitFor(() => {
      expect(
        client.getQueryData(customerKeys.detail(captured, id)),
      ).toBeUndefined();
    });
    expect(client.getQueryData(customerKeys.detail(current, id))).toEqual(
      detail(4),
    );
    view.unmount();
  },
);
it("keeps a failed read as error and disables cached errored-session access", async () => {
  mocks.get.mockRejectedValue(new Error("missing"));
  const view = renderHook(() => useCustomer(id), { wrapper });
  await waitFor(() => {
    expect(view.result.current.isError).toBe(true);
  });
  expect(view.result.current.data).toBeUndefined();
  view.unmount();
  client
    .getQueryCache()
    .find({ queryKey: AUTH_SESSION_QUERY_KEY })
    ?.setState({ status: "error", error: new Error("session failed") });
  const blocked = renderHook(() => useCustomer(id), { wrapper });
  expect(blocked.result.current.fetchStatus).toBe("idle");
  expect(blocked.result.current.data).toBeUndefined();
  blocked.unmount();
});

it("keys customer card pages by scope/UUID/page and disables missing targets", async () => {
  const pagination = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  mocks.drafts.mockImplementation(
    (_id: string, query: { page: number; limit: number }) =>
      Promise.resolve({
        drafts: [],
        pagination: {
          ...pagination,
          page: query.page,
          limit: query.limit,
          hasPreviousPage: query.page > 1,
        },
      }),
  );
  const view = renderHook(
    ({ target, page }: { target: string | null; page: number }) =>
      useCustomerDrafts(target, { page, limit: 25 }),
    { wrapper, initialProps: { target: null as string | null, page: 1 } },
  );
  expect(view.result.current.fetchStatus).toBe("idle");
  expect(mocks.drafts).not.toHaveBeenCalled();
  view.rerender({ target: id, page: 1 });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(client.getQueryData(customerKeys.drafts(scope(), id, 1, 25))).toEqual({
    drafts: [],
    pagination,
  });
  view.rerender({ target: id, page: 2 });
  await waitFor(() => {
    expect(mocks.drafts).toHaveBeenCalledWith(
      id,
      { page: 2, limit: 25 },
      expect.any(AbortSignal),
    );
  });
  view.unmount();
});
it("does not publish deferred customer cards after an epoch change", async () => {
  let release: (value: unknown) => void = () => {
    throw new Error("Uninitialized read");
  };
  mocks.drafts.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const captured = scope(),
    view = renderHook(() => useCustomerDrafts(id, { page: 1, limit: 25 }), {
      wrapper,
    });
  await waitFor(() => {
    expect(mocks.drafts).toHaveBeenCalledTimes(1);
  });
  mocks.drafts.mockResolvedValue({
    drafts: [],
    pagination: {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("new", epoch, actor);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, session());
    release({ drafts: [{ id: "obsolete" }], pagination: {} });
  });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(view.result.current.data?.drafts).toEqual([]);
  expect(
    client.getQueryData(customerKeys.drafts(captured, id, 1, 25)),
  ).toBeUndefined();
  view.unmount();
});

it("does not let a late measurement page invalidate or publish into a replacement scope", async () => {
  let release: (value: CustomerMeasurementsData) => void = () => {
    throw new Error("Uninitialized measurement response");
  };
  const pendingMeasurement = new Promise<CustomerMeasurementsData>(
    (resolve) => {
      release = resolve;
    },
  );
  mocks.measurements.mockReturnValueOnce(pendingMeasurement);
  const captured = scope();
  const initialProps: { target: string | null } = { target: id };
  const view = renderHook(
    ({ target }: { target: string | null }) =>
      useCustomerMeasurements(target, { page: 2, limit: 25 }),
    { wrapper, initialProps },
  );
  await waitFor(() => {
    expect(mocks.measurements).toHaveBeenCalledTimes(1);
  });
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("replacement", epoch, actor);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, session());
    view.rerender({ target: null });
  });
  const replacement = scope();
  const current = customerMeasurementsDataSchema.parse({
    measurements: [],
    pagination: {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  const destination = customerKeys.measurements(replacement, id, 1, 25);
  client.setQueryData(destination, current);
  await act(async () => {
    release(
      customerMeasurementsDataSchema.parse({
        measurements: [],
        pagination: {
          page: 2,
          limit: 25,
          total: 25,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      }),
    );
    await pendingMeasurement;
  });
  expect(client.getQueryData(destination)).toEqual(current);
  expect(client.getQueryState(destination)?.isInvalidated).toBe(false);
  expect(
    client.getQueryData(customerKeys.measurements(captured, id, 2, 25)),
  ).toBeUndefined();
  expect(mocks.measurements).toHaveBeenCalledTimes(1);
  view.unmount();
});
