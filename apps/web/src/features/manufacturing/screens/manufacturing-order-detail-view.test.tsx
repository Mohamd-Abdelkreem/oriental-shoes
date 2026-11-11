import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { p03Ids } from "@/test/p03-fixtures";
import {
  manufacturingDetailFixture,
  factorySessionFixture,
  factoryActivityFixture,
} from "../model/manufacturing.fixture";
import { ManufacturingOrderDetailView } from "./manufacturing-order-detail-view";

const transport = vi.hoisted(() => ({ order: vi.fn(), orderHistory: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("Unexpected legacy lookup");
  },
}));
vi.mock("../api/manufacturing.api", () => ({ manufacturingApi: transport }));
const client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, factorySessionFixture("CUTTING"));
  transport.order.mockResolvedValue(manufacturingDetailFixture());
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("retains safe specifications and inline actual history without warehouse actions or finance", async () => {
  transport.orderHistory.mockResolvedValue({
    department: "CUTTING",
    orderId: p03Ids.order,
    events: [{ kind: "manufacturing", event: factoryActivityFixture() }],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView orderId={p03Ids.order} deptRole="cutting" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Factory customer/u);
  expect(
    screen.queryByRole("link", { name: /طباعة/u }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إرسال مع مندوب التوصيل" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Frozen address")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "المواصفات المعتمدة للمصنع" }),
  );
  expect(await screen.findByText("SM")).toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: "السعر" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /سجل الحركات/u }));
  expect(await screen.findByText("Factory worker")).toBeInTheDocument();
  expect(screen.getByText(/إتمام وتحويل العمل/u)).toHaveTextContent(
    "الإنتاج والإصلاح",
  );
  expect(transport.orderHistory).toHaveBeenCalledWith(
    "CUTTING",
    p03Ids.order,
    { page: 1, limit: 25 },
    expect.any(AbortSignal),
  );
});
it("keeps a missing persisted order as an error instead of using a local record", async () => {
  transport.order.mockRejectedValue(new Error("unavailable"));
  render(
    <QueryClientProvider client={client}>
      <ManufacturingOrderDetailView orderId={p03Ids.order} deptRole="cutting" />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذر تحميل أمر التفصيل",
  );
  expect(screen.queryByText("SM")).not.toBeInTheDocument();
  expect(localStorage.length).toBe(0);
});
