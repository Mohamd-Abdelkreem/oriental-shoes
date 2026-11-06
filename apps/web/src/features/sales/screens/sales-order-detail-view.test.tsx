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
  draftSchema,
  draftCaptureSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesOrderDetailView } from "./sales-order-detail-view";

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
const change = (page = 1) => ({
  commandId:
    page === 1
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444",
  operation: page === 1 ? "CREATE_DRAFT" : "SAVE_DRAFT",
  draftId: id,
  actor: {
    id: actor,
    fullName: page === 1 ? "Actual first actor" : "Actual second actor",
    role: "USER",
    department: "SALES",
  },
  occurredAt: instant,
  beforeVersion: page === 1 ? null : 1,
  afterVersion: page,
  changedFields: ["generalNotes"],
  addedPieceIds: [],
  removedPieceIds: [],
});
const fullDraft = () => {
  const capture = draftCaptureSchema.parse({
    type: "SHOP",
    generalNotes: "Actual saved notes",
    paidAmount: "12.30",
    pieces: [
      { id: "55555555-5555-4555-8555-555555555555", model: "Captured model" },
    ],
  });
  const { customerId, ...headers } = capture;
  return draftSchema.parse({
    ...headers,
    id,
    version: 1,
    status: "DRAFT",
    owner: { id: actor, fullName: "Actual owner" },
    customer: customerId === null ? null : null,
    pieces: capture.pieces.map((piece, index) => ({
      ...piece,
      position: index + 1,
      quantity: 1,
    })),
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
  });
};
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
        staffApprovedAt: admin ? null : instant,
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
      if (url === `/sales-drafts/${id}`)
        return response({ draft: fullDraft() });
      if (url.endsWith("/changes"))
        return response({
          changes: [change(page)],
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
      <SalesOrderDetailView orderId={id} />
    </QueryClientProvider>,
  );
it.each([false, true])(
  "retains actual draft tabs/owner/paper for admin=%j without inventing manufacturing or print",
  async (admin) => {
    if (admin) session(other, true);
    mount();
    await screen.findByText(/مندوب المبيعات: Actual owner/u);
    expect(
      screen.getByRole("button", { name: "معاينة الطباعة" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "معاينة الطباعة" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/لا يوجد مسار تصنيع/u)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /ورقة المسودة غير المقدمة/u }),
    );
    await screen.findByText("Actual saved notes");
    expect(screen.getByText("Captured model")).toBeInTheDocument();
    expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
    expect(screen.queryByText("ريم خالد")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /سجل تغييرات المسودة/u }),
    );
    await screen.findByText("Actual first actor");
    expect(screen.getByText("الملاحظات العامة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
    await screen.findByText("Actual second actor");
    expect(screen.queryByText("Actual first actor")).not.toBeInTheDocument();
  },
);
it("missing or denied draft does not mount paper/history or fall back to local records", async () => {
  session(other);
  mocks.get.mockRejectedValue(failure(404));
  mount();
  await screen.findByText(/المسودة غير موجودة أو غير متاحة/u);
  expect(
    screen.queryByRole("button", { name: /ورقة المسودة/u }),
  ).not.toBeInTheDocument();
  expect(
    mocks.get.mock.calls.every((call) => call[0] === `/sales-drafts/${id}`),
  ).toBe(true);
});
it("suppresses a deferred old-epoch detail after account replacement", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized");
  };
  mocks.get.mockImplementationOnce(
    () =>
      new Promise<ReturnType<typeof response>>((resolve) => {
        release = () => {
          resolve(response({ draft: fullDraft() }));
        };
      }),
  );
  mount();
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  mocks.get.mockRejectedValue(failure(404));
  act(() => {
    session(other);
    release();
  });
  await screen.findByText(/المسودة غير موجودة أو غير متاحة/u);
  expect(screen.queryByText(/Actual owner/u)).not.toBeInTheDocument();
});
