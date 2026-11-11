import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const route = vi.hoisted(() => ({ path: "/production/repairs" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../api/manufacturing.api", () => ({ manufacturingApi: transport }));
const client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  route.path = "/production/repairs";
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
it("locks repairs to current production incoming, retaining the lock on reset and flat mode", async () => {
  const view = render(
    <QueryClientProvider client={client}>
      <ProductionWorkspace />
    </QueryClientProvider>,
  );
  await screen.findByText("لا توجد أوامر مطابقة في هذا القسم.");
  expect(transport.orders).toHaveBeenCalledWith(
    "PRODUCTION",
    expect.objectContaining({
      view: "INCOMING",
      type: "REPAIR",
      page: 1,
      limit: 10,
    }),
    expect.any(AbortSignal),
  );
  expect(transport.pieces).not.toHaveBeenCalled();
  expect(screen.getByRole("combobox")).toHaveValue("REPAIR");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "حسب القطعة" }));
  await waitFor(() => {
    expect(transport.pieces).toHaveBeenCalledWith(
      "PRODUCTION",
      expect.objectContaining({ view: "INCOMING", type: "REPAIR" }),
      expect.any(AbortSignal),
    );
  });
  route.path = "/production/incoming";
  view.rerender(
    <QueryClientProvider client={client}>
      <ProductionWorkspace />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("ALL"));
  expect(localStorage.length).toBe(0);
});
