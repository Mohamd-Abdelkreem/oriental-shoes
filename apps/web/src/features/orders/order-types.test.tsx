import assert from "node:assert/strict";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { initialSnapshot } from "@/features/prototype/state/mvp-selectors";
import { snapshotSchema } from "@/features/prototype/state/mvp-snapshot-schema";
import { OrderPaperForm } from "./components/order-paper-form";
import { SalesOrderMetadataSection } from "@/features/sales/screens/sales-order-metadata-section";
import type { OrderType } from "./order-types";

it.each<{ type: OrderType; title: string; label: string }>([
  { type: "SHOP", title: "أمر تفصيل / ط خ", label: "طلب تفصيل معرض" },
  { type: "EXTERNAL", title: "طلب تفصيل خارجي", label: "طلب مبيعات خارجية" },
  { type: "REPAIR", title: "أمر إصلاح", label: "طلب إصلاح" },
  { type: "GIFT", title: "أمر هدية", label: "أمر هدية" },
  { type: "READY", title: "أمر تفصيل جاهز", label: "أمر تفصيل جاهز" },
  {
    type: "ACCESSORY",
    title: "أمر تفصيل إكسسوارات",
    label: "أمر تفصيل إكسسوارات",
  },
  { type: "ADJUSTMENT", title: "أمر تعديل", label: "أمر تعديل" },
])(
  "restores a saved $type order and renders its paper title and type option",
  ({ type, title, label }) => {
    const snapshot = initialSnapshot();
    const original = snapshot.orders[0];
    assert.ok(original);
    snapshot.orders[0] = {
      ...original,
      type,
      adjustmentRequested: "تعديل أول",
      adjustmentReason: "سبب التعديل",
      adjustmentActionTaken: "الإجراء المتخذ",
    };
    const restored = snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    const order = restored.orders[0];
    assert.ok(order);

    render(
      <>
        <SalesOrderMetadataSection
          salespersonName={order.salesperson}
          orderType={order.type}
          onOrderTypeChange={() => {}}
          deliveryDate={order.delivery}
          onDeliveryDateChange={() => {}}
          repairNote=""
          onRepairNoteChange={() => {}}
          adjustmentFields={order}
        />
        <OrderPaperForm order={order} mode="readOnly" />
      </>,
    );
    expect(
      screen.getByText(title, { selector: ".paper-title b" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: `${label} (${type})` }),
    ).toBeInTheDocument();
    expect(restored.orders[0]).toEqual(snapshot.orders[0]);
  },
);
