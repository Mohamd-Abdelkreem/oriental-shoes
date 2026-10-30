import assert from "node:assert/strict";
import type { ReactNode } from "react";
import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import { CuttingWorkspace } from "./cutting-workspace";
import { ProductionWorkspace } from "./production-workspace";

const route = vi.hoisted(() => ({
  role: "production",
  orderId: "EXTERNAL-2026-0004",
  segmentId: "s-04b",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => `/${route.role}/tasks/${route.orderId}`,
  useSearchParams: () => new URLSearchParams({ segmentId: route.segmentId }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>
    {route.role === "production" ? (
      <ProductionWorkspace />
    ) : (
      <CuttingWorkspace />
    )}
    {children}
  </MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

it.each([
  {
    role: "production",
    orderId: "EXTERNAL-2026-0004",
    segmentId: "s-04b",
    itemId: "i-04-2",
    destination: "في الجودة",
  },
  {
    role: "cutting",
    orderId: "SHOP-2026-0012",
    segmentId: "s-12a",
    itemId: "i-12-1",
    destination: "في الإنتاج",
  },
])(
  "completes and transfers a $role task through its confirmation dialog",
  async (scenario) => {
    Object.assign(route, scenario);
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "إنهاء العمل وتسجيل الإنجاز" }),
    );
    fireEvent.click(screen.getByText(/^تسجيل إنجاز \d+ قطعة$/u));

    const order = result.current.orders.find(
      (candidate) => candidate.id === scenario.orderId,
    );
    assert.ok(order);
    expect(
      order.items.find((piece) => piece.id === scenario.itemId)
        ?.currentLocation,
    ).toBe(scenario.destination);
    expect(
      screen.queryByText(/^تسجيل إنجاز \d+ قطعة$/u),
    ).not.toBeInTheDocument();
  },
);
