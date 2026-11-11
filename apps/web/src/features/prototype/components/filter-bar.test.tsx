import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FilterBar, FilterSelect } from "./filter-bar";

it("associates the optional search error with the actual controlled input", () => {
  const change = vi.fn(),
    view = render(<FilterBar searchValue="accepted" onSearchChange={change} />),
    input = screen.getByRole("textbox");
  expect(input).toHaveValue("accepted");
  expect(input).not.toHaveAttribute("aria-describedby");
  fireEvent.change(input, { target: { value: "next" } });
  expect(change).toHaveBeenCalledWith("next");
  view.rerender(
    <FilterBar
      searchValue="accepted"
      onSearchChange={change}
      searchError="تعذر البحث: صحح نص البحث وأعد المحاولة."
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("صحح نص البحث");
  expect(input).toHaveAttribute(
    "aria-describedby",
    screen.getByRole("alert").id,
  );
  expect(input).toHaveAttribute("aria-invalid", "true");
});

it("names the reached type filter without adding visible copy or changing default callers", () => {
  const change = vi.fn();
  render(
    <FilterSelect
      ariaLabel="نوع أمر التفصيل"
      value="ALL"
      onChange={change}
      options={[
        { value: "ALL", label: "جميع الأنواع" },
        { value: "REPAIR", label: "طلب إصلاح" },
      ]}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "نوع أمر التفصيل" }), {
    target: { value: "REPAIR" },
  });
  expect(change).toHaveBeenCalledWith("REPAIR");
});
