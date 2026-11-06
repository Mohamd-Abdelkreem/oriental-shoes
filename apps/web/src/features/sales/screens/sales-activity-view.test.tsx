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
import { authUserDataSchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesActivityView } from "./sales-activity-view";

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
      <SalesActivityView />
    </QueryClientProvider>,
  );
it("renders only returned scoped actors/time/changes with page-only query and stable draft links", async () => {
  mount();
  await screen.findByText("Actual first actor");
  expect(screen.getByText("الملاحظات العامة")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: id })).toHaveAttribute(
    "href",
    `/sales/orders/${id}`,
  );
  expect(mocks.get).toHaveBeenCalledWith(
    "/sales-drafts/changes",
    expect.objectContaining({ params: { page: 1, limit: 25 } }),
  );
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await screen.findByText("Actual second actor");
  expect(screen.queryByText("Actual first actor")).not.toBeInTheDocument();
  expect(screen.queryByText("ريم خالد")).not.toBeInTheDocument();
});
it("reports activity errors separately and retries without creating events", async () => {
  fail = true;
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByText("لا يوجد نشاط مسجل")).not.toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  await screen.findByText("Actual first actor");
});
it("hides an old-owner late activity page", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized");
  };
  mocks.get.mockImplementationOnce(
    () =>
      new Promise<ReturnType<typeof response>>((resolve) => {
        release = () => {
          resolve(response({ changes: [change()], pagination: pagination() }));
        };
      }),
  );
  mount();
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  mocks.get.mockResolvedValue(
    response({ changes: [], pagination: pagination(1, 25, 0) }),
  );
  act(() => {
    session(other);
    release();
  });
  await screen.findByText("لا يوجد نشاط مسجل");
  expect(screen.queryByText("Actual first actor")).not.toBeInTheDocument();
});
