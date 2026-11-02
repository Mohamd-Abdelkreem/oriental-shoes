import assert from "node:assert/strict";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PaperCellSelect } from "./paper-cell-select";

const options = [
  "شرقي ملكي كلاسيك",
  "شرقي وطني فاخر",
  "كاجوال مطرز خفيف",
  "رسمي مناسبات",
  "أسود ملكي",
  "إيطالي",
  "روضة",
  "شرقى",
];

function EditableSelect({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <PaperCellSelect
      value={value}
      onChange={setValue}
      options={options}
      placeholder="اختر الموديل..."
      ariaLabel="الموديل"
      columnLabel="الموديل"
    />
  );
}
function openMenu() {
  fireEvent.click(screen.getByRole("combobox", { name: "الموديل" }));
  return screen.getByPlaceholderText("ابحث في الموديل...");
}

it.each([
  { query: "أَسْوَد مَلَكي", selected: "أسود ملكي" },
  { query: "ايطالي", selected: "إيطالي" },
  { query: "روضه", selected: "روضة" },
  { query: "شرقي", selected: "شرقى" },
])(
  "finds and selects $selected using normalized Arabic search",
  ({ query, selected }) => {
    render(<EditableSelect />);
    expect(screen.getByRole("combobox")).toHaveTextContent("اختر الموديل...");
    const search = openMenu();
    fireEvent.change(search, { target: { value: query } });
    expect(
      screen.queryByRole("option", { name: "رسمي مناسبات" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/استخدام القيمة المكتوبة/u),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: selected }));
    expect(screen.getByRole("combobox")).toHaveTextContent(selected);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  },
);

it.each([
  { key: "ArrowDown", selected: "شرقي وطني فاخر" },
  { key: "ArrowUp", selected: "شرقى" },
])(
  "selects the highlighted option with $key and Enter",
  async ({ key, selected }) => {
    render(<EditableSelect />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "Enter" });
    const search = screen.getByPlaceholderText("ابحث في الموديل...");
    await waitFor(() => {
      expect(search).toHaveFocus();
    });
    fireEvent.keyDown(search, { key });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(trigger).toHaveTextContent(selected);
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  },
);

it.each(["click", "keyboard"])(
  "commits a trimmed custom value by %s when no option matches",
  (method) => {
    render(<EditableSelect />);
    const search = openMenu();
    fireEvent.change(search, { target: { value: "  موديل حصري جديد  " } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    if (method === "click")
      fireEvent.click(
        screen.getByRole("button", { name: /استخدام القيمة المكتوبة/u }),
      );
    else fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByRole("combobox")).toHaveTextContent("موديل حصري جديد");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  },
);

it.each(["trigger", "menu"])(
  "clears the selected value from the %s control",
  (location) => {
    render(<EditableSelect initialValue="أسود ملكي" />);
    if (location === "menu") {
      openMenu();
      fireEvent.click(
        screen.getByRole("button", { name: "مسح الاختيار الحالي (أسود ملكي)" }),
      );
    } else {
      fireEvent.click(screen.getByRole("button", { name: "مسح القيمة" }));
    }
    expect(screen.getByRole("combobox")).toHaveTextContent("اختر الموديل...");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  },
);

it("dismisses with Escape or an outside pointer and starts a fresh search on reopening", () => {
  render(<EditableSelect initialValue="رسمي مناسبات" />);
  let search = openMenu();
  fireEvent.change(search, { target: { value: "كاجوال" } });
  fireEvent.keyDown(search, { key: "Escape" });
  expect(screen.getByRole("combobox")).toHaveFocus();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  search = openMenu();
  expect(search).toHaveValue("");
  expect(screen.getAllByRole("option")).toHaveLength(options.length);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox")).toHaveTextContent("رسمي مناسبات");
});

it("repositions the portal inside the viewport after scrolling and resizing", () => {
  render(<EditableSelect />);
  const trigger = screen.getByRole("combobox");
  const bounds = vi.spyOn(trigger, "getBoundingClientRect");
  bounds.mockReturnValue(new DOMRect(40, 50, 180, 54));
  openMenu();
  const menu = document.querySelector<HTMLElement>(".paper-cell-menu");
  assert.ok(menu);
  expect(menu).toHaveStyle({ left: "40px", top: "108px" });
  bounds.mockReturnValue(
    new DOMRect(window.innerWidth - 100, window.innerHeight - 60, 180, 54),
  );
  fireEvent.scroll(window);
  expect(Number.parseFloat(menu.style.top)).toBeLessThan(
    window.innerHeight - 60,
  );
  fireEvent.resize(window);
  expect(
    Number.parseFloat(menu.style.left) + Number.parseFloat(menu.style.width),
  ).toBeLessThanOrEqual(window.innerWidth);
});
