import assert from "node:assert/strict";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { initialSnapshot } from "@/features/prototype/state/mvp-selectors";
import { blankLine } from "./components/blank-line";
import { OrderPaperForm } from "./components/order-paper-form";

const baseOrder = initialSnapshot().orders[0];
assert.ok(baseOrder);
const firstItem = baseOrder.items[0];
assert.ok(firstItem);

it("selects a sole addition between sole model and color without changing other piece fields", () => {
  const onLinesChange = vi.fn<(lines: ProductLine[]) => void>();
  render(
    <OrderPaperForm
      order={{ ...baseOrder, items: [firstItem] }}
      mode="create"
      onLinesChange={onLinesChange}
    />,
  );

  const sideTable = within(
    screen.getByRole("table", { name: /الأرضية والإضافات/u }),
  );
  expect(
    sideTable.getByRole("columnheader", { name: "الأرضية SOLE" }),
  ).toHaveAttribute("colspan", "3");
  expect(
    sideTable
      .getAllByRole("combobox")
      .map((field) => field.getAttribute("aria-label")),
  ).toEqual([
    `النوع والموديل — ${firstItem.model}`,
    `الإضافة — ${firstItem.model}`,
    `رقم اللون — ${firstItem.model}`,
  ]);

  fireEvent.click(sideTable.getByRole("combobox", { name: /^الإضافة —/u }));
  fireEvent.click(screen.getByRole("option", { name: "فرشة طبية مريحة" }));

  expect(onLinesChange).toHaveBeenLastCalledWith([
    { ...firstItem, soleAddition: "فرشة طبية مريحة" },
  ]);
});

it("accepts free-text additions without changing the sole selection", () => {
  const onLinesChange = vi.fn<(lines: ProductLine[]) => void>();
  render(
    <OrderPaperForm
      order={{ ...baseOrder, items: [firstItem] }}
      mode="create"
      onLinesChange={onLinesChange}
    />,
  );

  fireEvent.change(screen.getByRole("textbox", { name: /^الإضافات —/u }), {
    target: { value: "ملاحظات إضافية مخصصة" },
  });

  expect(onLinesChange).toHaveBeenLastCalledWith([
    { ...firstItem, additions: "ملاحظات إضافية مخصصة" },
  ]);
});

it.each(["readOnly", "print"] as const)(
  "retains a piece populated only by its sole addition in %s mode",
  (mode) => {
    render(
      <OrderPaperForm
        order={{
          ...baseOrder,
          items: [
            {
              ...blankLine("sole-addition-only"),
              soleAddition: "إضافة أرضية للطباعة",
            },
            firstItem,
          ],
        }}
        mode={mode}
      />,
    );

    const sideTable = within(
      screen.getByRole("table", { name: /الأرضية والإضافات/u }),
    );
    expect(
      sideTable.getByRole("cell", { name: "إضافة أرضية للطباعة" }),
    ).toBeInTheDocument();
    expect(sideTable.queryByRole("combobox")).not.toBeInTheDocument();
    expect(sideTable.queryByRole("textbox")).not.toBeInTheDocument();
  },
);
