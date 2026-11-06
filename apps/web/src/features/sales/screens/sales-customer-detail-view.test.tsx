import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
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
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { readOperationalScope } from "@/shared/query/operational-scope";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesCustomerDetailView } from "./sales-customer-detail-view";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  other = "99999999-9999-4999-8999-999999999999",
  id = "22222222-2222-4222-8222-222222222222",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
let subject = actor,
  admin = false,
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
const session = (who = actor, isAdmin = false) => {
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
      <SalesCustomerDetailView customerId={phone} />
    </QueryClientProvider>,
  );
it.each([actor, other])(
  "preserves real contact, draft notes and all piece cards for the supplied actor %s projection",
  async (owner) => {
    session(owner);
    mount();
    await screen.findByText("Shared C");
    await screen.findByText("Saved note 1");
    expect(
      screen.getByText(
        `${owner === actor ? "A" : "B"} model 1 · Actual leather`,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("غير متاح قبل الإرسال")).toHaveLength(4);
    expect(screen.getByText("Contact preferences")).toBeInTheDocument();
    expect(screen.getByText("A: A1 · F: F1")).toBeInTheDocument();
    expect(screen.queryByText(/أحدث مقاس معتمد/u)).not.toBeInTheDocument();
    expect(
      screen.queryByText(owner === actor ? "B model 1" : "A model 1"),
    ).not.toBeInTheDocument();
    expect(
      mocks.get.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && call[0].startsWith("/sales-drafts/"),
      ),
    ).toEqual([]);
  },
);
it("renders25 draft cards without slicing and moves only the card page", async () => {
  count = 26;
  mount();
  await screen.findByText("Saved note 25");
  expect(screen.getAllByRole("link", { name: "تتبع الطلب" })).toHaveLength(25);
  fireEvent.click(
    within(screen.getByLabelText("صفحات المسودات")).getByRole("button", {
      name: "الصفحة التالية",
    }),
  );
  await screen.findByText("Saved note 26");
  expect(screen.queryByText("Saved note 1")).not.toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledWith(
    `/customers/${id}/drafts`,
    expect.objectContaining({ params: { page: 2, limit: 25 } }),
  );
  const scope = readOperationalScope(client);
  if (scope === null) throw new Error("Missing scope");
  count = 1;
  await act(async () => {
    await client.invalidateQueries({ queryKey: customerKeys.root(scope) });
  });
  await screen.findByText("Saved note 1");
  await waitFor(() => {
    expect(screen.getAllByRole("link", { name: "تتبع الطلب" })).toHaveLength(1);
  });
});
it("keeps a fixed customer UUID after phone reassignment and uses the current phone for actions", async () => {
  mount();
  await screen.findByText("Saved note 1");
  const scope = readOperationalScope(client);
  if (scope === null) throw new Error("Missing scope");
  current = customerSchema.parse({
    ...current,
    phone: "+966500000002",
    name: "Current C",
    version: 2,
  });
  await act(async () => {
    await client.invalidateQueries({ queryKey: customerKeys.root(scope) });
  });
  await screen.findByText("Current C");
  expect(
    screen.getByRole("link", { name: "تعديل بيانات العميل" }),
  ).toHaveAttribute("href", "/sales/customers/%2B966500000002/edit");
  expect(
    mocks.get.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].startsWith("/customers/by-phone/"),
    ),
  ).toHaveLength(1);
});
it("shows missing/invalid route without a first-customer fallback", async () => {
  mocks.get.mockRejectedValue(failure(404));
  const view = mount();
  await screen.findByRole("alert");
  expect(screen.queryByText("Shared C")).not.toBeInTheDocument();
  view.unmount();
  mocks.get.mockClear();
  mount("invalid");
  expect(screen.getByText("رقم العميل غير صالح.")).toBeInTheDocument();
  expect(mocks.get).not.toHaveBeenCalled();
});
it("distinguishes a failed cards section from scoped empty success and retries", async () => {
  failCards = true;
  mount();
  await screen.findByText(/تعذّر تحميل المسودات/u);
  expect(
    screen.queryByText("لا توجد مسودات مرتبطة متاحة لهذا الحساب."),
  ).not.toBeInTheDocument();
  failCards = false;
  count = 0;
  fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل المسودات" }));
  await screen.findByText("لا توجد مسودات مرتبطة متاحة لهذا الحساب.");
});
it("does not render a late old-owner card reply after account replacement", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized response");
  };
  let deferred = false;
  mocks.get.mockImplementation(
    (url: string, config?: { params?: { page?: number; limit?: number } }) => {
      if (url.endsWith("/drafts") && !deferred) {
        deferred = true;
        const reply = response({
          drafts: [card()],
          pagination: pagination(1, 25, 1),
        });
        return new Promise<ReturnType<typeof response>>((resolve) => {
          release = () => {
            resolve(reply);
          };
        });
      }
      return read(url, config);
    },
  );
  mount();
  await waitFor(() => {
    expect(deferred).toBe(true);
  });
  act(() => {
    session(other);
    release();
  });
  await screen.findByText("B model 1 · Actual leather");
  expect(
    screen.queryByText("A model 1 · Actual leather"),
  ).not.toBeInTheDocument();
});

it("pages provisional piece measurements independently from the retained draft cards", async () => {
  mocks.get.mockImplementation(
    (url: string, config?: { params?: { page?: number; limit?: number } }) => {
      if (url === `/customers/${id}/measurements`) {
        const page = config?.params?.page ?? 1,
          limit = config?.params?.limit ?? 25;
        return response({
          measurements: Array.from(
            { length: page === 1 ? 25 : 1 },
            (_, index) => ({
              ...detail().latestMeasurement,
              pieceId: `66666666-6666-4666-8666-${String((page - 1) * 25 + index + 1).padStart(12, "0")}`,
              size: `Captured size ${String((page - 1) * 25 + index + 1)}`,
            }),
          ),
          pagination: pagination(page, limit, 26),
        });
      }
      return read(url, config);
    },
  );
  mount();
  await screen.findByText("Captured size 25");
  expect(screen.getAllByRole("link", { name: "تتبع الطلب" })).toHaveLength(2);
  fireEvent.click(
    within(screen.getByLabelText("صفحات القياسات")).getByRole("button", {
      name: "الصفحة التالية",
    }),
  );
  await screen.findByText("Captured size 26");
  expect(screen.queryByText("Captured size 1")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "تتبع الطلب" })).toHaveLength(2);
});

it("resolves the encoded canonical phone segment supplied by the actual Next route", async () => {
  mount("%2B966500000001");
  await screen.findByText("Shared C");
  expect(mocks.get).toHaveBeenCalledWith(
    "/customers/by-phone/%2B966500000001",
    expect.anything(),
  );
});

it.each([25, 0])(
  "recovers measurement page 2 after its total shrinks to %i, refetching a fresh cached destination",
  async (total) => {
    count = 26;
    let rows = Array.from({ length: 26 }, (_, index) => ({
      ...detail().latestMeasurement,
      pieceId: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
      size: `Captured size ${String(index + 1)}`,
    }));
    const path = `/customers/${id}/measurements`;
    mocks.get.mockImplementation(
      (
        url: string,
        config?: { params?: { page?: number; limit?: number } },
      ) => {
        if (url !== path) return read(url, config);
        const page = config?.params?.page ?? 1,
          limit = config?.params?.limit ?? 25;
        return response({
          measurements: rows.slice((page - 1) * limit, page * limit),
          pagination: pagination(page, limit, rows.length),
        });
      },
    );
    mount();
    await screen.findByText("Captured size 25");
    fireEvent.click(
      within(screen.getByLabelText("صفحات المسودات")).getByRole("button", {
        name: "الصفحة التالية",
      }),
    );
    await screen.findByText("Saved note 26");
    fireEvent.click(
      within(screen.getByLabelText("صفحات القياسات")).getByRole("button", {
        name: "الصفحة التالية",
      }),
    );
    await screen.findByText("Captured size 26");
    const scope = readOperationalScope(client);
    if (scope === null) throw new Error("Missing scope");
    const destination = customerKeys.measurements(scope, id, 1, 25);
    expect(client.getQueryState(destination)?.isInvalidated).toBe(false);
    rows = total === 25 ? rows.slice(1) : [];
    await act(async () => {
      await client.refetchQueries({
        queryKey: customerKeys.measurements(scope, id, 2, 25),
        exact: true,
      });
    });
    if (total === 25) {
      await screen.findByText("Captured size 2");
      expect(screen.getByText("Captured size 26")).toBeInTheDocument();
      expect(screen.queryByText("Captured size 1")).not.toBeInTheDocument();
    } else {
      await screen.findByText(
        "لا توجد طلبات سابقة مسجلة لهذا العميل لاستخراج سجل المقاسات.",
      );
      expect(screen.queryByText("Captured size 26")).not.toBeInTheDocument();
    }
    await waitFor(() => {
      expect(client.isFetching()).toBe(0);
    });
    const requests = mocks.get.mock.calls.filter(
      (call: unknown[]) => call[0] === path,
    );
    expect(requests).toHaveLength(4);
    expect(requests.at(-1)).toEqual([
      path,
      expect.objectContaining({ params: { page: 1, limit: 25 } }),
    ]);
    expect(client.getQueryData(destination)).toMatchObject({
      pagination: { page: 1, total },
    });
    expect(screen.getByText("Saved note 26")).toBeInTheDocument();
    expect(screen.queryByText("Saved note 1")).not.toBeInTheDocument();
  },
);

it("keeps a measurement read failure distinct from an empty history and retries safely", async () => {
  let failed = true;
  mocks.get.mockImplementation(
    (url: string, config?: { params?: { page?: number; limit?: number } }) => {
      if (url === `/customers/${id}/measurements` && failed) throw failure();
      return read(url, config);
    },
  );
  mount();
  await screen.findByText(/تعذّر تحميل القياسات/u);
  expect(
    screen.queryByText(
      "لا توجد طلبات سابقة مسجلة لهذا العميل لاستخراج سجل المقاسات.",
    ),
  ).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل القياسات" }));
  await screen.findByText("A: A1 · F: F1");
  expect(screen.queryByText(/تعذّر تحميل القياسات/u)).not.toBeInTheDocument();
});
