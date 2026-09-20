"use client";

import type { MvpOrder } from "@/features/prototype/state/mvp-store";

export function SalesOrderMetadataSection({
  orderType,
  onOrderTypeChange,
  deliveryDate,
  onDeliveryDateChange,
  repairNote,
  onRepairNoteChange,
}: {
  orderType: MvpOrder["type"];
  onOrderTypeChange: (type: MvpOrder["type"]) => void;
  deliveryDate: string;
  onDeliveryDateChange: (date: string) => void;
  repairNote: string;
  onRepairNoteChange: (note: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b pb-3">
        <h2 className="text-sm font-bold text-slate-800">
          ٢. بيانات رأس أمر التفصيل
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            نوع أمر التفصيل:
          </span>
          <select
            value={orderType}
            onChange={(e) => {
              onOrderTypeChange(e.target.value as MvpOrder["type"]);
            }}
            className="oriental-input w-full"
          >
            <option value="SHOP">طلب معرض (SHOP)</option>
            <option value="EXTERNAL">طلب مبيعات خارجية (EXTERNAL)</option>
            <option value="REPAIR">طلب إصلاح (REPAIR)</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            تاريخ التسليم المتوقع:
          </span>
          <input
            type="text"
            value={deliveryDate}
            onChange={(e) => {
              onDeliveryDateChange(e.target.value);
            }}
            className="oriental-input w-full"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            مندوب المبيعات المسؤول:
          </span>
          <input
            type="text"
            value="ريم خالد"
            disabled
            className="oriental-input w-full bg-slate-50 text-slate-500"
          />
        </label>
      </div>

      {orderType === "REPAIR" && (
        <label className="block pt-2">
          <span className="mb-1 block text-xs font-semibold text-rose-700">
            تعليمات الإصلاح الخاصة بالطلب (يتجاوز القص ويتوجه للإنتاج مباشرة) *:
          </span>
          <textarea
            rows={2}
            value={repairNote}
            onChange={(e) => {
              onRepairNoteChange(e.target.value);
            }}
            placeholder="مثال: فك النعل القديم وشد الجلد وإعادة تركيب أرضية ربل جديدة..."
            className="oriental-textarea w-full border-rose-300 text-xs"
          />
        </label>
      )}
    </div>
  );
}
