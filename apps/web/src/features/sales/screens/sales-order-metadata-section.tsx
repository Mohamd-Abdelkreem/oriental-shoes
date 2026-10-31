"use client";

import { orderTypeOptions } from "@/features/orders/order-types";
import {
  adjustmentFieldDefinitions,
  type OrderAdjustmentFields,
} from "@/features/orders/adjustment-fields";
import type { MvpOrder } from "@/features/prototype/state/mvp-store";

export function SalesOrderMetadataSection({
  orderType,
  onOrderTypeChange,
  deliveryDate,
  onDeliveryDateChange,
  repairNote,
  onRepairNoteChange,
  adjustmentFields = {},
  onAdjustmentFieldsChange,
}: {
  orderType: MvpOrder["type"];
  onOrderTypeChange: (type: MvpOrder["type"]) => void;
  deliveryDate: string;
  onDeliveryDateChange: (date: string) => void;
  repairNote: string;
  onRepairNoteChange: (note: string) => void;
  adjustmentFields?: OrderAdjustmentFields | undefined;
  onAdjustmentFieldsChange?:
    ((fields: OrderAdjustmentFields) => void) | undefined;
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
            className="oriental-input w-full font-medium"
          >
            {orderTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.value})
              </option>
            ))}
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

      {orderType === "READY" && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-800">
          <span className="font-bold">توجيه أمر التفصيل الجاهز:</span> مدير
          الإنتاج / يعتمد عمل الكمية الموضحة أدناه وحسب المواصفات المحددة ويضاف
          إلى الفاترينا (المعرض).
        </div>
      )}

      {orderType === "GIFT" && (
        <div className="rounded-lg border border-purple-200 bg-purple-50/70 p-3 text-xs text-purple-800">
          <span className="font-bold">توجيه أمر الهدية:</span> مسؤول المعمل /
          يلزم عمل الكمية الموضحة أعلاه وحسب المواصفات المحددة.
        </div>
      )}

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

      {orderType === "ADJUSTMENT" && (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="border-b border-amber-200/80 pb-2">
            <h3 className="text-xs font-bold text-amber-900">
              بيانات ومواصفات أمر التعديل (تظهر في النموذج الورقي لأمر التعديل)
            </h3>
            <p className="text-[11px] text-amber-700">
              قم بتعبئة التعديل المطلوب وسبب التعديل والإجراء المتخذ مطابقةً
              للنموذج المعتمد
            </p>
          </div>

          <SalesAdjustmentFields
            fields={adjustmentFields}
            onChange={onAdjustmentFieldsChange}
          />
        </div>
      )}
    </div>
  );
}

const metadataPlaceholders = {
  adjustmentRequested: adjustmentFieldDefinitions[0].paperPlaceholder,
  adjustmentReason: "* سبب التعديل من العميل أو المعرض...",
  adjustmentActionTaken: "* الإجراء المتخذ بالمعمل / الورشة...",
};

function SalesAdjustmentFields({
  fields,
  onChange,
}: {
  fields: OrderAdjustmentFields;
  onChange?: ((fields: OrderAdjustmentFields) => void) | undefined;
}) {
  const controls = adjustmentFieldDefinitions.map((field) => (
    <label key={field.key} className="block">
      <span className="mb-1 block text-xs font-bold text-slate-700">
        {field.label}
      </span>
      <textarea
        rows={field.rows}
        value={fields[field.key] ?? ""}
        onChange={(event) => {
          onChange?.({ [field.key]: event.target.value });
        }}
        placeholder={metadataPlaceholders[field.key]}
        className="oriental-textarea w-full border-amber-300 bg-white text-xs"
      />
    </label>
  ));
  return (
    <>
      {controls[0]}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {controls.slice(1)}
      </div>
    </>
  );
}
