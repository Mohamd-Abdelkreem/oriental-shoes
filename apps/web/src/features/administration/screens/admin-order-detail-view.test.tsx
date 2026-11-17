import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { administrationOrderHistoryQuerySchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  p08AdminSession,
  p08DetailFixture,
  p08DraftDetailFixture,
  p08CorrectionEventFixture,
} from "@/test/p08-fixtures";
import {
  p03Ids,
  p03Envelope,
  p03Pagination,
  p03Session,
} from "@/test/p03-fixtures";
import { AdminOrderDetailView } from "./admin-order-detail-view";

const transport = vi.hoisted(() => ({
  get: vi.fn<
    (path: string, options?: { params?: unknown }) => Promise<unknown>
  >(),
  post: vi.fn(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const view = (id = p03Ids.order) => (
  <QueryClientProvider client={client}>
    <AdminOrderDetailView orderId={id} />
  </QueryClientProvider>
);
it("uses actual historyCount and last correction without reading inactive history", async () => {
  const detail = p08DetailFixture(2),
    event = p08CorrectionEventFixture();
  detail.historyCount = 1;
  detail.order.customerSnapshot.address =
    event.after.correction.customerAddress;
  detail.correction.effective = event.after.correction;
  detail.correction.lastCorrection = {
    id: event.id,
    reason: event.reason,
    actor: event.actor,
    occurredAt: event.occurredAt,
    changedFields: ["customerAddress"],
  };
  transport.get.mockImplementation((path, options) =>
    Promise.resolve(
      p03Envelope(
        path.endsWith("history")
          ? {
              events: [{ kind: "administration", event }],
              pagination: { ...p03Pagination, total: 1, totalPages: 1 },
              context: {
                orderId: p03Ids.order,
                query: administrationOrderHistoryQuerySchema.parse(
                  options?.params,
                ),
              },
            }
          : detail,
      ),
    ),
  );
  render(view());
  expect(
    await screen.findByText("تم تصحيح بيانات هذا الطلب إدارياً:"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /سجل الرقابة والحركات\s*1/ }),
  ).toBeInTheDocument();
  expect(
    transport.get.mock.calls.filter(([path]) => path.endsWith("history")),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /سجل الرقابة والحركات/ }));
  expect(
    await screen.findByText("Frozen address ← Corrected order-only address"),
  ).toBeInTheDocument();
  expect(
    transport.get.mock.calls.filter(([path]) => path.endsWith("history")),
  ).toHaveLength(1);
  expect(screen.queryByText("إعادة فتح أمر التفصيل")).not.toBeInTheDocument();
});
it("keeps a draft read-only without operational totals, cancellation, correction or official print", async () => {
  transport.get.mockResolvedValue(p03Envelope(p08DraftDetailFixture()));
  render(view());
  expect(
    await screen.findByText(/مسودة لم تدخل التشغيل بعد/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إلغاء كمية إدارياً" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "تصحيح بيانات أمر التفصيل" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /طباعة أمر التفصيل الرسمي/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "نموذج أمر التفصيل الورقي الكامل" }),
  );
  expect(screen.getAllByText(/مسودة —/).length).toBeGreaterThan(0);
  expect(transport.post).not.toHaveBeenCalled();
});
it.each(["invalid-id", "employee"])(
  "denies detail admission for %s without operational GET",
  (kind) => {
    if (kind === "employee")
      client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
    render(view(kind === "employee" ? p03Ids.order : kind));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(transport.get).not.toHaveBeenCalled();
  },
);
it("prepares the existing correction dialog from a fresh read and unsent cancel makes no write", async () => {
  transport.get.mockResolvedValue(p03Envelope(p08DetailFixture()));
  render(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "تصحيح بيانات أمر التفصيل" }),
  );
  expect(
    await screen.findByRole("dialog", {
      name: "تصحيح بيانات أمر التفصيل (صلاحية الإدارة)",
    }),
  ).toBeInTheDocument();
  expect(transport.get).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(transport.post).not.toHaveBeenCalled();
});
