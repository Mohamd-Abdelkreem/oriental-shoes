import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { salesOrderSummarySchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  orderFixture,
  p03Envelope,
  p03Ids,
  p03Instant,
  p03Pagination,
  p03Session,
} from "@/test/p03-fixtures";
import { SalesReturnedView } from "./sales-returned-view";

const transport = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
const client = createQueryClient();
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
  vi.resetAllMocks();
});
it("reads a bounded returned queue and shows canonical reason/time without fabricated reviewer metadata", async () => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  const order = salesOrderSummarySchema.strip().parse({
    ...orderFixture(3),
    status: "RETURNED",
    returnInfo: { reason: "Correct the face", returnedAt: p03Instant },
    allowedActions: { canResubmit: true, canSetPaid: false },
  });
  transport.get.mockResolvedValue(
    p03Envelope({
      items: [{ kind: "submitted", order }],
      pagination: p03Pagination,
      totalOrders: 1,
      totalPieces: 1,
      statusCounts: {
        DRAFT: 0,
        AWAITING_APPROVAL: 0,
        RETURNED: 1,
        APPROVED: 0,
        READY_FOR_DELIVERY: 0,
        OUT_FOR_DELIVERY: 0,
        DELIVERY_FAILED: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      },
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <SalesReturnedView />
    </QueryClientProvider>,
  );
  await screen.findByText("Correct the face");
  expect(screen.getByText(p03Instant)).toBeInTheDocument();
  expect(screen.getByText(order.businessNumber)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "تصحيح وإعادة الإرسال" }),
  ).toHaveAttribute("href", `/sales/orders/new?edit=${order.id}`);
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledWith(
      "/sales-orders",
      expect.objectContaining({
        params: { page: 1, limit: 25, status: "RETURNED" },
      }),
    );
  });
  expect(screen.queryByText(/المراجع:/u)).not.toBeInTheDocument();
});
