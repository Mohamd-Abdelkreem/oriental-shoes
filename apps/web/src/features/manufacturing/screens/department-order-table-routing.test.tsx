import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { DepartmentOrderTable } from "./department-order-table";
import type { DepartmentTab } from "./department-order-tabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/production/incoming",
}));

function DepartmentScreen({
  forcedTab,
  hideTabs,
}: {
  forcedTab: DepartmentTab;
  hideTabs?: boolean;
}) {
  const store = useMvpStore();
  return (
    <DepartmentOrderTable
      orders={store.orders.filter((order) => order.id === "EXTERNAL-2026-0004")}
      deptRole="production"
      stageName="الإنتاج والإصلاح"
      forcedTab={forcedTab}
      hideTabs={hideTabs}
    />
  );
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>
    <ToastProvider>{children}</ToastProvider>
  </MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

it("resets the active tab on route changes while preserving search and table layout", () => {
  const view = render(<DepartmentScreen forcedTab="ready" />, { wrapper });
  fireEvent.click(screen.getByTitle("عرض جدول القطع"));
  const search = screen.getByPlaceholderText(
    "البحث برقم أمر التفصيل، العميل، الموديل، الموظف المسؤول...",
  );
  fireEvent.change(search, { target: { value: "OS-188" } });
  fireEvent.click(screen.getByRole("button", { name: /^جاري العمل/u }));
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);

  view.rerender(<DepartmentScreen forcedTab="completed" />);
  expect(
    screen.getByText("لا توجد أوامر في هذا القسم حالياً"),
  ).toBeInTheDocument();
  view.rerender(<DepartmentScreen forcedTab="ready" />);
  expect(
    screen.getByPlaceholderText(
      "البحث برقم أمر التفصيل، العميل، الموديل، الموظف المسؤول...",
    ),
  ).toHaveValue("OS-188");
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
});

it("uses a dedicated page's forced tab when the tab controls are hidden", () => {
  render(<DepartmentScreen forcedTab="in_progress" hideTabs />, { wrapper });
  expect(
    screen.queryByRole("button", { name: /^جاري العمل/u }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByTitle("عرض جدول القطع"));
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
});
