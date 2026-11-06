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
import { authUserDataSchema, draftSummarySchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesDraftsView } from "./sales-drafts-view";

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
      <SalesDraftsView />
    </QueryClientProvider>,
  );
it("renders all25 server rows, optional blanks and stable edit references, then requests page2", async () => {
  mount();
  await screen.findByText(id);
  expect(screen.getAllByRole("link", { name: "متابعة التحرير" })).toHaveLength(
    25,
  );
  expect(screen.getAllByRole("row")).toHaveLength(26);
  expect(screen.getByText("90 مسودة")).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: "متابعة التحرير" })[0],
  ).toHaveAttribute("href", `/sales/orders/new?edit=${id}`);
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  await screen.findByText(summary(26).id);
  expect(mocks.get).toHaveBeenCalledWith(
    "/sales-drafts",
    expect.objectContaining({ params: { page: 2, limit: 25 } }),
  );
});
it("keeps errors distinct from empty and retries reads", async () => {
  fail = true;
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByText("لا توجد مسودات")).not.toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  await screen.findByText(id);
});
it("does not publish an old-owner late page into the next account", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized");
  };
  mocks.get.mockImplementationOnce(
    () =>
      new Promise<ReturnType<typeof response>>((resolve) => {
        release = () => {
          resolve(
            response({
              drafts: [summary()],
              totalDrafts: 1,
              totalPieces: 3,
              pagination: pagination(1, 25, 1),
            }),
          );
        };
      }),
  );
  mount();
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  mocks.get.mockResolvedValue(
    response({
      drafts: [],
      totalDrafts: 0,
      totalPieces: 0,
      pagination: pagination(1, 25, 0),
    }),
  );
  act(() => {
    session(other);
    release();
  });
  await screen.findByText("لا توجد مسودات");
  expect(screen.queryByText(id)).not.toBeInTheDocument();
});
