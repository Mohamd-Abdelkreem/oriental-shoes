import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { salesOrderSummarySchema } from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readP04OperationalScope } from "@/shared/query/operational-scope";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Session,
  p03Pagination,
} from "@/test/p03-fixtures";
import { approvalKeys } from "../hooks/approval.hooks";
import { ApprovalHistoryView } from "./approval-history-view";

const transport = vi.hoisted(() => ({
  dashboard: vi.fn(),
  orders: vi.fn(),
  issues: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../api/approval.api", () => ({ approvalApi: transport }));
const client = createQueryClient();
const summary = () =>
  salesOrderSummarySchema.parse({
    ...Object.fromEntries(
      Object.entries(orderFixture()).filter(([key]) =>
        [
          "id",
          "version",
          "owner",
          "type",
          "status",
          "businessNumber",
          "businessYear",
          "sequence",
          "customerId",
          "customerSnapshot",
          "createdAt",
          "updatedAt",
          "submittedAt",
          "deliveryDate",
          "money",
          "counts",
          "allowedActions",
        ].includes(key),
      ),
    ),
    returnInfo: null,
  });
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: { ...p03Session().user, department: "APPROVAL" },
  });
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  transport.orders.mockResolvedValue({
    items: [summary()],
    pagination: { ...p03Pagination, total: 1, totalPages: 1 },
  });
  transport.issues.mockResolvedValue({ items: [], pagination: p03Pagination });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ApprovalHistoryView />
    </QueryClientProvider>,
  );
it("renders the scoped actor's real decisions and keeps failures distinct from empty history", async () => {
  transport.history.mockResolvedValue({
    events: [
      {
        id: p03Ids.source,
        orderId: p03Ids.order,
        orderVersion: 2,
        businessNumber: summary().businessNumber,
        operation: "RETURN_INITIAL",
        actor: {
          id: p03Ids.actor,
          role: "USER",
          department: "APPROVAL",
          fullName: "Current reviewer",
        },
        occurredAt: p03Instant,
        pieceId: null,
        issueId: null,
        proposalId: null,
        decision: null,
        notes: "Please clarify the captured specification",
        changedFields: ["status"],
      },
    ],
    pagination: { ...p03Pagination, total: 1, totalPages: 1 },
  });
  mount();
  expect(await screen.findByText("Current reviewer")).toBeInTheDocument();
  expect(
    screen.getByText("Please clarify the captured specification"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "أمر التفصيل" })).toHaveAttribute(
    "href",
    `/approval/orders/${p03Ids.order}`,
  );
  transport.history.mockRejectedValue(new Error("Failed refresh"));
  const scope = readP04OperationalScope(client, "APPROVAL");
  if (!scope) throw new Error("Missing scope");
  await act(async () => {
    await client.refetchQueries({
      queryKey: [...approvalKeys.history(scope, { page: 1, limit: 25 })],
    });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذّر تحميل سجل القرارات",
  );
  expect(screen.getByText("Current reviewer")).toBeInTheDocument();
});
it("shows genuine empty own history only after a successful read", async () => {
  transport.history.mockResolvedValue({
    events: [],
    pagination: p03Pagination,
  });
  mount();
  expect(await screen.findByText("لا توجد قرارات محفوظة")).toBeInTheDocument();
});
it("fetches the corrected server page after a queue shrinks instead of reusing an old destination", async () => {
  transport.history
    .mockResolvedValueOnce({
      events: [],
      pagination: {
        ...p03Pagination,
        total: 30,
        totalPages: 2,
        hasNextPage: true,
      },
    })
    .mockResolvedValueOnce({
      events: [],
      pagination: { ...p03Pagination, page: 2, hasPreviousPage: true },
    })
    .mockResolvedValue({ events: [], pagination: p03Pagination });
  mount();
  const next = await screen.findByRole("button", { name: "الصفحة التالية" });
  await waitFor(() => expect(next).toBeEnabled());
  fireEvent.click(next);
  await waitFor(() => {
    expect(transport.history).toHaveBeenCalledTimes(3);
  });
  expect(
    transport.history.mock.calls.map((call: readonly unknown[]) => call[0]),
  ).toEqual([
    { page: 1, limit: 25 },
    { page: 2, limit: 25 },
    { page: 1, limit: 25 },
  ]);
});
