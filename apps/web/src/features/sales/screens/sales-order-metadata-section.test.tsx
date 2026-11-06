import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SalesOrderMetadataSection } from "./sales-order-metadata-section";

it("uses the supplied actual owner and an optional calendar date without fixed actor/year facts", () => {
  const changed = vi.fn();
  render(
    <SalesOrderMetadataSection
      orderType="SHOP"
      salespersonName="Actual draft owner"
      onOrderTypeChange={() => {}}
      deliveryDate=""
      onDeliveryDateChange={changed}
      repairNote=""
      onRepairNoteChange={() => {}}
    />,
  );
  expect(screen.getByLabelText("مندوب المبيعات المسؤول:")).toHaveValue(
    "Actual draft owner",
  );
  expect(screen.getByLabelText("مندوب المبيعات المسؤول:")).toBeDisabled();
  const date = screen.getByLabelText("تاريخ التسليم المتوقع:");
  expect(date).toHaveAttribute("type", "date");
  expect(date).toHaveValue("");
  fireEvent.change(date, { target: { value: "2026-11-20" } });
  expect(changed).toHaveBeenCalledWith("2026-11-20");
  expect(screen.queryByDisplayValue("ريم خالد")).not.toBeInTheDocument();
});
it("does not promise a repair routing bypass or accept an unsupported type", () => {
  const changed = vi.fn();
  render(
    <SalesOrderMetadataSection
      orderType="REPAIR"
      salespersonName="Owner"
      onOrderTypeChange={changed}
      deliveryDate=""
      onDeliveryDateChange={() => {}}
      repairNote=""
      onRepairNoteChange={() => {}}
      errors={{ repairNote: "راجع التعليمات" }}
    />,
  );
  expect(screen.queryByText(/يتجاوز القص/u)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/تعليمات الإصلاح/u)).toHaveAccessibleDescription(
    "راجع التعليمات",
  );
  fireEvent.change(screen.getByLabelText("نوع أمر التفصيل:"), {
    target: { value: "UNKNOWN" },
  });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("نوع أمر التفصيل:"), {
    target: { value: "GIFT" },
  });
  expect(changed).toHaveBeenCalledWith("GIFT");
});
