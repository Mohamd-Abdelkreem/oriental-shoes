import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const navigation = vi.hoisted(() => ({
  path: "/admin/dashboard",
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useRouter: () => navigation,
}));
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
const view = (navCounts?: {
  activeOrders?: number;
  pendingApproval?: number;
}) => (
  <AppShell
    role="admin"
    accountName="Actual current account"
    canAccessAllSections
    onSignOut={() => undefined}
    signingOut={false}
    signOutError={null}
    navCounts={navCounts}
  >
    <p>Actual workspace content</p>
  </AppShell>
);
it("renders actual account and explicit valid zero badges without reading old operational storage", () => {
  localStorage.setItem(
    "oriental-shoes-mvp-v11-per-piece",
    JSON.stringify({
      currentUser: "Fixture person",
      orders: [{ id: "LOCAL_ONLY" }],
    }),
  );
  const read = vi.spyOn(Storage.prototype, "getItem");
  render(view({ activeOrders: 0, pendingApproval: 3 }));
  expect(
    within(screen.getByRole("link", { name: /جميع الطلبات/ })).getByText("0"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("link", { name: /متابعة الاعتمادات/ })).getByText(
      "3",
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("link", { name: /دورات التصحيح/ })).queryByText(
      /^[0-9]+$/,
    ),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText("Actual current account").length).toBeGreaterThan(
    0,
  );
  expect(screen.queryByText("Fixture person")).not.toBeInTheDocument();
  expect(read).not.toHaveBeenCalledWith("oriental-shoes-mvp-v11-per-piece");
});
it("preserves sidebar keyboard preference, header focus, mobile menu and bounded department navigation", () => {
  const rendered = render(view()),
    picker = screen.getByRole("combobox", { name: "الانتقال إلى قسم" });
  picker.focus();
  fireEvent.keyDown(window, { ctrlKey: true, key: "b" });
  expect(rendered.container.firstElementChild).toHaveClass(
    "sidebar-is-collapsed",
  );
  expect(picker).toHaveFocus();
  expect(localStorage.getItem("factory_sidebar_collapsed")).toBe("true");
  fireEvent.keyDown(window, { ctrlKey: true, key: "b" });
  expect(rendered.container.firstElementChild).not.toHaveClass(
    "sidebar-is-collapsed",
  );
  fireEvent.click(screen.getByRole("button", { name: "فتح القائمة الجانبية" }));
  expect(rendered.container.querySelector("aside")).toHaveClass("mobile-open");
  fireEvent.click(screen.getByRole("button", { name: "إغلاق القائمة" }));
  expect(rendered.container.querySelector("aside")).not.toHaveClass(
    "mobile-open",
  );
  fireEvent.change(picker, { target: { value: "production" } });
  expect(navigation.push).toHaveBeenCalledWith("/production/dashboard");
  fireEvent.change(picker, { target: { value: "outside" } });
  expect(navigation.push).toHaveBeenCalledTimes(1);
});
