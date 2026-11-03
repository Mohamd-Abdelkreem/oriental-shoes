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
