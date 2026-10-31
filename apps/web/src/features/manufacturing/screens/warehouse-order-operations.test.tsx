import assert from "node:assert/strict";
import type { ReactNode } from "react";
import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Role } from "@/features/prototype/fixtures/prototype-data";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import { ManufacturingOrderDetailView } from "./manufacturing-order-detail-view";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("Order was not found");
  },
}));

function mountOrder(
  orderId: string,
  deptRole: Exclude<Role, "admin" | "sales" | "approval"> = "warehouse",
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MvpStoreProvider>
      <ManufacturingOrderDetailView orderId={orderId} deptRole={deptRole} />
      {children}
    </MvpStoreProvider>
  );
  return renderHook(useMvpStore, { wrapper });
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

it("keeps dispatch and delivery confirmation connected to the prototype order history", async () => {
  const { result } = mountOrder("EXTERNAL-2026-0002");
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const previousEvents = result.current.events;
  fireEvent.click(
    screen.getByRole("button", { name: "إرسال مع مندوب التوصيل" }),
  );
  fireEvent.change(
    screen.getByPlaceholderText(
      "مثال: تم إرسال الشحنة مع سيارة التوزيع الأولى...",
    ),
    { target: { value: "Courier reference" } },
  );
  fireEvent.click(screen.getByText("تأكيد الخروج للتسليم"));
  let order = result.current.orders.find(
    (candidate) => candidate.id === "EXTERNAL-2026-0002",
  );
  assert.ok(order);
  expect(order.status).toBe("خرج مع المندوب");
  expect(order.deliveryAttempts?.at(-1)?.note).toContain("Courier reference");
  expect(
    order.segments.every((segment) => segment.stage === "مع المندوب"),
  ).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "تأكيد التسليم للعميل" }));
  fireEvent.click(screen.getByText("تأكيد التسليم بنجاح وإغلاق الطلب"));
  order = result.current.orders.find(
    (candidate) => candidate.id === "EXTERNAL-2026-0002",
  );
  assert.ok(order);
  expect(order.status).toBe("تم الاستلام");
  expect(order.deliveryAttempts?.map((attempt) => attempt.status)).toEqual([
    "مع المندوب",
    "تم الاستلام",
  ]);
  expect(
    order.segments.every((segment) => segment.stage === "تم الاستلام"),
  ).toBe(true);
  expect(result.current.events.slice(2)).toEqual(previousEvents);
});

it("keeps dispatch unavailable when part of the order is still in production", async () => {
  mountOrder("EXTERNAL-2026-0005");
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  expect(
    screen.getByText("التسليم مقفل (الكمية غير مكتملة بالمستودع)"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إرسال مع مندوب التوصيل" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "تأكيد استلام وتسجيل الكراتين" }),
  ).toBeInTheDocument();
});

it("does not expose warehouse operations in another department's detail view", async () => {
  mountOrder("EXTERNAL-2026-0002", "cutting");
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  expect(
    screen.getByRole("link", { name: "العودة لـ قسم القص والتفصيل" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إرسال مع مندوب التوصيل" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("إجمالي الكراتين المسجلة:"),
  ).not.toBeInTheDocument();
});
