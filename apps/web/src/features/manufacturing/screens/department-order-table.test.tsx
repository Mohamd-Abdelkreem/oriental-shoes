import assert from "node:assert/strict";
import { useState, type ReactNode } from "react";
import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/toast";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import { DepartmentOrderTable } from "./department-order-table";
import type { DepartmentPieceTableProps } from "./department-piece-table-types";

const scenario = vi.hoisted(
  (): {
    role: DepartmentPieceTableProps["deptRole"];
    stage: DepartmentPieceTableProps["stageName"];
    orderId: string;
    customAction: boolean;
  } => ({
    role: "production",
    stage: "الإنتاج والإصلاح",
    orderId: "EXTERNAL-2026-0004",
    customAction: false,
  }),
);

vi.mock("next/navigation", () => ({
  usePathname: () => `/${scenario.role}/incoming`,
}));

function DepartmentScreen() {
  const store = useMvpStore();
  const [customAction, setCustomAction] = useState("");
  return (
    <>
      <DepartmentOrderTable
        orders={store.orders.filter((order) => order.id === scenario.orderId)}
        deptRole={scenario.role}
        stageName={scenario.stage}
        actionButtonLabel={scenario.customAction ? "الإجراء المخصص" : undefined}
        onAction={
          scenario.customAction
            ? (order, segment) => {
                setCustomAction(`${order.id} / ${segment?.id ?? ""}`);
              }
            : undefined
        }
      />
      <output aria-label="نتيجة الإجراء المخصص">{customAction}</output>
    </>
  );
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>
    <ToastProvider>
      <DepartmentScreen />
      {children}
    </ToastProvider>
  </MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
  Object.assign(scenario, {
    role: "production",
    stage: "الإنتاج والإصلاح",
    orderId: "EXTERNAL-2026-0004",
    customAction: false,
  });
});
afterEach(() => {
  localStorage.clear();
});

it.each(["grouped", "flat"])(
  "keeps per-piece start and transfer behavior in the %s layout",
  async (layout) => {
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    if (layout === "flat") fireEvent.click(screen.getByTitle("عرض جدول القطع"));
    else
      fireEvent.click(
        screen.getByRole("button", { name: "توسيع تفاصيل الكل" }),
      );

    const startButton = screen.getAllByRole("button", { name: "بدء العمل" })[0];
    assert.ok(startButton);
    fireEvent.click(startButton);
    let order = result.current.orders.find(
      (candidate) => candidate.id === scenario.orderId,
    );
    assert.ok(order);
    expect(order.items[0]?.deptStatus).toBe("جاري العمل");
    expect(order.items[0]?.responsibleWorker).toBe("أحمد عادل");

    fireEvent.click(screen.getByRole("button", { name: /^جاري العمل/u }));
    const transferButton = screen.getAllByRole("button", {
      name: "إنهاء وتحويل",
    })[0];
    assert.ok(transferButton);
    fireEvent.click(transferButton);
    order = result.current.orders.find(
      (candidate) => candidate.id === scenario.orderId,
    );
    assert.ok(order);
    expect(order.items[0]?.currentLocation).toBe("في الجودة");
    expect(order.items[1]?.currentLocation).toBe("في الإنتاج");
  },
);

it("keeps the existing custom action exclusive to the flat table", async () => {
  scenario.customAction = true;
  renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  fireEvent.click(screen.getByRole("button", { name: "توسيع تفاصيل الكل" }));
  expect(
    screen.queryByRole("button", { name: "الإجراء المخصص" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "بدء العمل" }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByTitle("عرض جدول القطع"));
  const customButton = screen.getAllByRole("button", {
    name: "الإجراء المخصص",
  })[0];
  assert.ok(customButton);
  fireEvent.click(customButton);
  expect(screen.getByLabelText("نتيجة الإجراء المخصص")).toHaveTextContent(
    "EXTERNAL-2026-0004 / s-04a",
  );
});

it("opens inspection from a quality card without showing start-work controls", async () => {
  Object.assign(scenario, {
    role: "quality",
    stage: "الجودة والتغليف",
    orderId: "EXTERNAL-2026-0006",
  });
  renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  fireEvent.click(screen.getByRole("button", { name: "توسيع تفاصيل الكل" }));
  expect(
    screen.queryByRole("button", { name: "بدء العمل" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "فحص الجودة" }));
  expect(
    screen.getByRole("heading", { name: "فحص جودة وتغليف القطعة" }),
  ).toBeInTheDocument();
});

it("receives the warehouse group without modifying pieces still in production", async () => {
  Object.assign(scenario, {
    role: "warehouse",
    stage: "المستودع",
    orderId: "EXTERNAL-2026-0005",
  });
  const { result } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const original = result.current.orders.find(
    (candidate) => candidate.id === scenario.orderId,
  );
  assert.ok(original);
  fireEvent.click(screen.getByRole("button", { name: "استلام بالمستودع (3)" }));
  const updated = result.current.orders.find(
    (candidate) => candidate.id === scenario.orderId,
  );
  assert.ok(updated);
  expect(updated.items.slice(0, 3).map((piece) => piece.deptStatus)).toEqual([
    "مكتملة",
    "مكتملة",
    "مكتملة",
  ]);
  expect(updated.items.slice(3)).toEqual(original.items.slice(3));
});
