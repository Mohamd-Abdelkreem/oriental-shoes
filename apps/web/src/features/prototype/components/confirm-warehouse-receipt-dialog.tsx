"use client";
import { toLegacyOrderReference } from "@/features/orders/model/order-display-reference";

import { useState } from "react";
import { WarehouseConfirmationDialog } from "@/features/warehouse/components/warehouse-confirmation-dialog";
import type {
  WarehouseDialogProps,
  WarehouseReceiptSelection,
} from "@/features/warehouse/model/warehouse-view.model";
import { BaseDialog } from "./base-dialog";

function LegacyConfirmWarehouseReceiptDialog({
  open,
  onClose,
  orderId,
  quantity,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  quantity: number;
  onConfirm: (cartonCount: string, location: string, note?: string) => void;
}) {
  const [cartons, setCartons] = useState("١");
  const [location, setLocation] = useState("A-04");
  const [note, setNote] = useState("");

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="تأكيد استلام كراتين بالمستودع"
      subtitle={`أمر التفصيل ${toLegacyOrderReference(orderId) ?? ""} · الكمية الواردة: ${String(quantity)} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              onConfirm(cartons, location, note);
              onClose();
            }}
          >
            تأكيد الاستلام وحفظ الكراتين
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={onClose}
          >
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            عدد الكراتين المستلمة:
          </span>
          <input
            type="text"
            value={cartons}
            onChange={(e) => {
              setCartons(e.target.value);
            }}
            className="oriental-input w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            موقع التخزين بالرفوف:
          </span>
          <input
            type="text"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
            }}
            className="oriental-input w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            ملاحظات التخزين:
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            className="oriental-input w-full"
          />
        </label>
      </div>
    </BaseDialog>
  );
}

export function ConfirmWarehouseReceiptDialog(
  props:
    | (Parameters<typeof LegacyConfirmWarehouseReceiptDialog>[0] & {
        source?: never;
      })
    | (Omit<WarehouseDialogProps, "review"> & {
        review: WarehouseReceiptSelection;
      }),
) {
  if (props.source === "warehouse")
    return <WarehouseConfirmationDialog {...props} />;
  return <LegacyConfirmWarehouseReceiptDialog {...props} />;
}
