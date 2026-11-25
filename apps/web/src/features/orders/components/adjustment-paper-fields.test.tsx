import assert from "node:assert/strict";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { initialSnapshot } from "@/features/prototype/state/mvp-selectors";
import { SalesOrderMetadataSection } from "@/features/sales/screens/sales-order-metadata-section";
import type { OrderAdjustmentFields } from "../adjustment-fields";
import { OrderPaperForm } from "./order-paper-form";

const baseOrder = initialSnapshot().orders[0];
assert.ok(baseOrder);
const order = { ...baseOrder, type: "ADJUSTMENT" as const };

function EditableAdjustmentOrder() {
  const [fields, setFields] = useState<OrderAdjustmentFields>({
    adjustmentRequested: "تعديل أول",
    adjustmentReason: "سبب أول",
    adjustmentActionTaken: "إجراء أول",
  });
  const updateFields = (updates: OrderAdjustmentFields) => {
    setFields((current) => ({ ...current, ...updates }));
  };
  return (
    <>
      <section aria-label="بيانات الطلب">
        <SalesOrderMetadataSection
          salespersonName={order.salesperson}
          orderType="ADJUSTMENT"
          onOrderTypeChange={() => {}}
          deliveryDate={order.delivery}
          onDeliveryDateChange={() => {}}
          repairNote=""
          onRepairNoteChange={() => {}}
        />
      </section>
      <section aria-label="النموذج الورقي">
        <OrderPaperForm
          order={{ ...order, ...fields }}
          mode="edit"
          onAdjustmentFieldsChange={updateFields}
        />
      </section>
    </>
  );
}

it.each([
  { label: "التعديل المطلوب :", initial: "تعديل أول" },
  { label: "سبب التعديل :", initial: "سبب أول" },
  { label: "الإجراء المتخذ :", initial: "إجراء أول" },
])(
  "edits $label directly in the paper, with a single input",
  ({ label, initial }) => {
    render(<EditableAdjustmentOrder />);
    const metadata = within(
      screen.getByRole("region", { name: "بيانات الطلب" }),
    );
    const paper = within(
      screen.getByRole("region", { name: "النموذج الورقي" }),
    );
    expect(metadata.queryByLabelText(label)).not.toBeInTheDocument();
    const paperInput = paper.getByLabelText(label);
    expect(paperInput).toHaveValue(initial);
    fireEvent.change(paperInput, { target: { value: "تعديل من الورقة" } });
    expect(paperInput).toHaveValue("تعديل من الورقة");
  },
);

it("associates an adjustment validation message with its input inside the paper", () => {
  render(
    <OrderPaperForm
      order={order}
      mode="create"
      fieldErrorMessages={{ adjustmentRequested: "اختصر التعديل المطلوب." }}
    />,
  );
  const requested = screen.getByLabelText("التعديل المطلوب :");
  expect(requested).toHaveAttribute("name", "adjustmentRequested");
  expect(requested).toHaveAttribute("aria-invalid", "true");
  expect(requested).toHaveAccessibleDescription("اختصر التعديل المطلوب.");
  expect(screen.getByLabelText("سبب التعديل :")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
});

it.each(["readOnly", "print"] as const)(
  "preserves the filled and blank adjustment lines in %s mode",
  (mode) => {
    const view = render(
      <OrderPaperForm
        order={{
          ...order,
          adjustmentRequested: "  سطر أول  \n\nسطر ثان\nسطر ثالث\nسطر زائد",
          adjustmentReason: "سبب أول",
          adjustmentActionTaken: "",
        }}
        mode={mode}
      />,
    );
    expect(screen.getByText("سطر أول")).toBeInTheDocument();
    expect(screen.getByText("سطر ثان")).toBeInTheDocument();
    expect(screen.getByText("سطر ثالث")).toBeInTheDocument();
    expect(screen.queryByText("سطر زائد")).not.toBeInTheDocument();
    expect(
      view.container.querySelectorAll(
        ".paper-adjustment-section .paper-dotted-row",
      ),
    ).toHaveLength(7);
    expect(
      view.container.querySelector(".paper-adjustment-textarea"),
    ).not.toBeInTheDocument();
  },
);
