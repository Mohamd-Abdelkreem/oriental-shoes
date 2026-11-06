import assert from "node:assert/strict";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { initialSnapshot } from "@/features/prototype/state/mvp-selectors";
import { OrderPaperForm } from "./components/order-paper-form";

const baseOrder = initialSnapshot().orders[0];
assert.ok(baseOrder);
const firstItem = baseOrder.items[0];
assert.ok(firstItem);

it.each([
  { key: "faceRight", label: "م١" },
  { key: "faceLeft", label: "م٢" },
  { key: "mixing", label: "م٣" },
  { key: "face", label: "الوجه" },
])("accepts custom text for $label", ({ key, label }) => {
  const onLinesChange = vi.fn<(lines: ProductLine[]) => void>();
  render(
    <OrderPaperForm
      order={{ ...baseOrder, items: [firstItem] }}
      mode="create"
      onLinesChange={onLinesChange}
    />,
  );

  fireEvent.change(
    screen.getByRole("textbox", {
      name: `${label} — ${firstItem.model || firstItem.pieceNumber || "سطر جديد"}`,
    }),
    { target: { value: "مواصفات مخصصة" } },
  );

  expect(onLinesChange).toHaveBeenLastCalledWith([
    { ...firstItem, [key]: "مواصفات مخصصة" },
  ]);
});

it("forwards source IDs through product/size/side cells while retaining free text and locked decoration", async () => {
  const { catalogFixture } = await import("@/test/p03-fixtures"),
    { toPaperCatalogOptions } =
      await import("@/features/sales/model/catalog-paper.model");
  const catalog = catalogFixture();
  if (catalog.availability !== "available") throw new Error("Expected catalog");
  const options = toPaperCatalogOptions(catalog),
    select = vi.fn(),
    changed = vi.fn();
  render(
    <OrderPaperForm
      order={{ ...baseOrder, items: [firstItem] }}
      mode="create"
      displayReference="SHOP-2026-0001"
      onLinesChange={changed}
      onCatalogSelection={select}
      dataState={{
        kind: "authoritative",
        catalogSourceId: catalog.sourceId,
        catalogOptions: options,
        selectionsByPiece: {},
        lockedCatalogFields: ["decoration"],
        finance: { kind: "unavailable", piecePrices: {}, total: null },
      }}
    />,
  );
  expect(screen.getByText("SHOP-2026-0001")).toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: /^التطعيم —/u }),
  ).not.toBeInTheDocument();
  for (const [name, field] of [
    ["الموديل", "model"],
    ["A", "aField"],
    ["F", "fField"],
    ["الإضافة", "soleAddition"],
  ] as const) {
    const combo = screen.getByRole("combobox", {
      name:
        field === "aField" || field === "fField"
          ? name
          : new RegExp(`^${name} —`, "u"),
    });
    fireEvent.click(combo);
    const first = screen.getAllByRole("option")[0];
    if (!first) throw new Error("Expected source option");
    fireEvent.click(first);
    expect(select).toHaveBeenLastCalledWith(firstItem.id, field, {
      displayValue: options[field][0]?.label,
      entryId: options[field][0]?.value,
    });
  }
  fireEvent.change(screen.getByRole("textbox", { name: /^م٣ —/u }), {
    target: { value: "Custom mixing" },
  });
  expect(changed).toHaveBeenCalled();
  expect(select).toHaveBeenCalledTimes(4);
});
