import { renderWithToast as render } from "@/test/render-with-toast";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { p03Ids } from "@/test/p03-fixtures";
import { factorySessionFixture } from "../model/manufacturing.fixture";
import { ProductionWorkspace } from "./production-workspace";

const transport = vi.hoisted(() => ({ orders: vi.fn(), pieces: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/production/incoming",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../api/manufacturing.api", () => ({ manufacturingApi: transport }));
const client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    factorySessionFixture("PRODUCTION"),
  );
  const pagination = {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  transport.orders.mockResolvedValue({
    department: "PRODUCTION",
    view: "INCOMING",
    items: [],
    counts: { orders: 0, pieces: 0 },
    pagination,
  });
  transport.pieces.mockResolvedValue({
    department: "PRODUCTION",
    view: "INCOMING",
    items: [],
    counts: { orders: 0, pieces: 0 },
    pagination,
  });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("includes all order types by default and lets users filter for repairs in the incoming queue", async () => {
  render(
    <QueryClientProvider client={client}>
      <ProductionWorkspace />
    </QueryClientProvider>,
  );
  await screen.findByText("لا توجد أوامر مطابقة في هذا القسم.");
  expect(transport.orders).toHaveBeenCalledWith(
    "PRODUCTION",
    {
      view: "INCOMING",
      page: 1,
      limit: 10,
    },
    expect.any(AbortSignal),
  );
  expect(transport.pieces).not.toHaveBeenCalled();
  const typeFilter = screen.getByRole("combobox", { name: "نوع أمر التفصيل" });
  expect(typeFilter).toHaveValue("ALL");
  fireEvent.change(typeFilter, { target: { value: "REPAIR" } });
  fireEvent.click(screen.getByRole("button", { name: "حسب القطعة" }));
  await waitFor(() => {
    expect(transport.pieces).toHaveBeenCalledWith(
      "PRODUCTION",
      expect.objectContaining({ view: "INCOMING", type: "REPAIR" }),
      expect.any(AbortSignal),
    );
  });
  fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط" }));
  expect(typeFilter).toHaveValue("ALL");
  await waitFor(() => {
    expect(transport.pieces).toHaveBeenLastCalledWith(
      "PRODUCTION",
      { view: "INCOMING", page: 1, limit: 10 },
      expect.any(AbortSignal),
    );
  });
  expect(localStorage.length).toBe(0);
});
