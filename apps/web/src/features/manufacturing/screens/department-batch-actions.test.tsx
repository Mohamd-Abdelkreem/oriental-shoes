import assert from "node:assert/strict";
import type { ReactNode } from "react";
import {
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import type { DepartmentPieceTableProps } from "./department-piece-table-types";
import { DepartmentOrderTable } from "./department-order-table";

const scenario = vi.hoisted(
  (): {
    path: string;
    role: DepartmentPieceTableProps["deptRole"];
    stage: DepartmentPieceTableProps["stageName"];
    tab: DepartmentPieceTableProps["activeTab"];
    orderIds: string[];
  } => ({
    path: "/warehouse/ready",
    role: "warehouse",
    stage: "المستودع",
    tab: "in_progress",
    orderIds: [],
  }),
);

vi.mock("next/navigation", () => ({ usePathname: () => scenario.path }));

function BatchScreen() {
  const store = useMvpStore();
  return (
    <DepartmentOrderTable
      orders={store.orders.filter((order) =>
        scenario.orderIds.includes(order.id),
      )}
      deptRole={scenario.role}
      stageName={scenario.stage}
      forcedTab={scenario.tab}
      hideTabs
    />
  );
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>
    <ToastProvider>
      <BatchScreen />
      {children}
    </ToastProvider>
  </MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
  Object.assign(scenario, {
    path: "/warehouse/ready",
    role: "warehouse",
    stage: "المستودع",
    tab: "in_progress",
    orderIds: ["SHOP-2026-0024", "EXTERNAL-2026-0025"],
  });
});
afterEach(() => {
  localStorage.clear();
});

function selectAllOrders() {
  for (const button of screen.getAllByTitle("تحديد كل قطع هذا الأمر"))
    fireEvent.click(button);
}

it.each([
  { input: "quick", expected: "الهاتف مغلق طوال اليوم" },
  { input: "blank", expected: "تعذر تسليم الطلب للعميل مع المندوب" },
])(
  "preserves the $input delivery-failure reason",
  async ({ input, expected }) => {
    Object.assign(scenario, {
      path: "/warehouse/out-for-delivery",
      orderIds: ["EXTERNAL-2026-0026", "SHOP-2026-0027"],
    });
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    selectAllOrders();
    fireEvent.click(
      screen.getByRole("button", { name: "حدثت مشكلة في التسليم (3)" }),
    );
    if (input === "quick") fireEvent.click(screen.getByText(expected));
    else
      fireEvent.change(
        screen.getByPlaceholderText(/^اكتب هنا تفاصيل سبب عدم التسليم/u),
        { target: { value: "   " } },
      );
    fireEvent.click(
      screen.getByText("تأكيد تسجيل المشكلة ونقل الطلب لتعذر التسليم"),
    );
    for (const orderId of scenario.orderIds) {
      expect(
        result.current.orders.find((order) => order.id === orderId)
          ?.deliveryNote,
      ).toBe(expected);
    }
  },
);

it("keeps dispatch, failure reporting and delivery history connected across a multi-order selection", async () => {
  const { result, rerender } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const originalEvents = result.current.events;
  const unrelated = result.current.orders.find(
    (order) => order.id === "SHOP-2026-0020",
  );
  selectAllOrders();
  fireEvent.click(screen.getByRole("button", { name: "إرسال مع المندوب (5)" }));
  expect(
    screen.queryByRole("button", { name: "إلغاء التحديد" }),
  ).not.toBeInTheDocument();
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.status).toBe("خرج مع المندوب");
    expect(
      order.items.every((piece) => piece.currentLocation === "مع المندوب"),
    ).toBe(true);
    expect(
      order.segments.every((segment) => segment.stage === "مع المندوب"),
    ).toBe(true);
  }

  scenario.path = "/warehouse/out-for-delivery";
  rerender();
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "حدثت مشكلة في التسليم (5)" }),
  );
  fireEvent.change(
    screen.getByPlaceholderText(/^اكتب هنا تفاصيل سبب عدم التسليم/u),
    { target: { value: "  طلب العميل التأجيل  " } },
  );
  fireEvent.click(
    screen.getByText("تأكيد تسجيل المشكلة ونقل الطلب لتعذر التسليم"),
  );
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.status).toBe("تعذر التسليم");
    expect(order.deliveryNote).toBe("طلب العميل التأجيل");
    expect(
      order.deliveryAttempts?.filter(
        (attempt) => attempt.status === "تعذر التسليم",
      ),
    ).toHaveLength(1);
    expect(
      order.items.every(
        (piece) =>
          piece.currentLocation === "في المستودع" &&
          piece.deptStatus === "بها مشكلة",
      ),
    ).toBe(true);
  }

  scenario.path = "/warehouse/delivery-failed";
  scenario.tab = "problems";
  rerender();
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة إرسال مع المندوب (5)" }),
  );
  scenario.path = "/warehouse/out-for-delivery";
  scenario.tab = "in_progress";
  rerender();
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "تأكيد تسليم الطلب للعميل (5)" }),
  );
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.status).toBe("تم الاستلام");
    expect(
      order.items.every((piece) => piece.currentLocation === "تم الاستلام"),
    ).toBe(true);
    expect(
      order.deliveryAttempts?.some(
        (attempt) => attempt.status === "تعذر التسليم",
      ),
    ).toBe(true);
  }
  expect(
    result.current.orders.find((order) => order.id === "SHOP-2026-0020"),
  ).toEqual(unrelated);
  expect(result.current.events.slice(-originalEvents.length)).toEqual(
    originalEvents,
  );
});

it("receives each selected warehouse piece and updates its pending segment", async () => {
  scenario.path = "/warehouse/incoming";
  scenario.tab = "ready";
  scenario.orderIds = ["SHOP-2026-0020", "EXTERNAL-2026-0021"];
  const { result } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "استلام وتخزين بالمستودع (5)" }),
  );
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.items.every((piece) => piece.deptStatus === "مكتملة")).toBe(
      true,
    );
    expect(order.segments.every((segment) => segment.state === "مستلم")).toBe(
      true,
    );
  }
});

it.each([
  {
    role: "cutting",
    stage: "القص",
    orderId: "SHOP-2026-0012",
    start: /^بدء قص القطع المحددة/u,
    transfer: /^إنهاء القص والتحويل للإنتاج/u,
    destination: "في الإنتاج",
  },
  {
    role: "production",
    stage: "الإنتاج والإصلاح",
    orderId: "EXTERNAL-2026-0004",
    start: /^بدء تركيب وتجميع القطع المحددة/u,
    transfer: /^إنهاء التركيب والتحويل للجودة/u,
    destination: "في الجودة",
  },
  {
    role: "quality",
    stage: "الجودة والتغليف",
    orderId: "EXTERNAL-2026-0006",
    start: /^بدء الفحص/u,
    transfer: /^قبول وإرسال للمستودع/u,
    destination: "في المستودع",
  },
] as const)(
  "starts and transfers selected pieces in $role",
  async ({ role, stage, orderId, start, transfer, destination }) => {
    Object.assign(scenario, {
      path: `/${role}/incoming`,
      role,
      stage,
      tab: "ready",
      orderIds: [orderId],
    });
    const { result, rerender } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    selectAllOrders();
    fireEvent.click(screen.getByRole("button", { name: start }));
    expect(
      screen.queryByRole("button", { name: "إلغاء التحديد" }),
    ).not.toBeInTheDocument();
    scenario.tab = "in_progress";
    rerender();
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    const activePieceIds = order.items
      .filter((piece) => piece.deptStatus === "جاري العمل")
      .map((piece) => piece.id);
    expect(activePieceIds.length).toBeGreaterThan(0);
    selectAllOrders();
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "إجراءات القطع المحددة" }),
      ).getByRole("button", { name: transfer }),
    );
    const updated = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(updated);
    expect(
      updated.items
        .filter((piece) => activePieceIds.includes(piece.id))
        .every((piece) => piece.currentLocation === destination),
    ).toBe(true);
  },
);
