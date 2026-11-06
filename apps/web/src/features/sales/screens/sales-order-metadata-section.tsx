"use client";

import { salesOrderTypeSchema } from "@template/contracts";
import { orderTypeOptions } from "@/features/orders/order-types";
import {
  adjustmentFieldDefinitions,
  type OrderAdjustmentFields,
} from "@/features/orders/adjustment-fields";
import type { MvpOrder } from "@/features/prototype/state/mvp-store";

type MetadataErrors = Readonly<
  Partial<
    Record<
      "type" | "deliveryDate" | "repairNote" | keyof OrderAdjustmentFields,
      string
    >
  >
>;

export function SalesOrderMetadataSection({
  orderType,
  salespersonName,
  errors,
  onOrderTypeChange,
  deliveryDate,
  onDeliveryDateChange,
  repairNote,
  onRepairNoteChange,
  adjustmentFields = {},
  onAdjustmentFieldsChange,
}: {
  orderType: MvpOrder["type"];
  salespersonName: string;
  errors?: MetadataErrors | undefined;
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
            name="type"
            aria-invalid={errors?.type !== undefined}
            aria-describedby={
              errors?.type === undefined ? undefined : "metadata-type-error"
            }
            value={orderType}
            onChange={(e) => {
              const parsed = salesOrderTypeSchema.safeParse(e.target.value);
              if (parsed.success) onOrderTypeChange(parsed.data);
            }}
            className="oriental-input w-full font-medium"
          >
            {orderTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.value})
              </option>
            ))}
          </select>
          {errors?.type !== undefined && (
            <span id="metadata-type-error" className="text-xs text-rose-700">
              {errors.type}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            تاريخ التسليم المتوقع:
          </span>
          <input
            type="date"
            name="deliveryDate"
            min="0001-01-01"
            max="9999-12-31"
            aria-invalid={errors?.deliveryDate !== undefined}
            aria-describedby={
              errors?.deliveryDate === undefined
                ? undefined
                : "metadata-deliveryDate-error"
            }
            value={deliveryDate}
            onChange={(e) => {
              onDeliveryDateChange(e.target.value);
            }}
            className="oriental-input w-full"
          />
          {errors?.deliveryDate !== undefined && (
            <span
              id="metadata-deliveryDate-error"
              className="text-xs text-rose-700"
            >
              {errors.deliveryDate}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            مندوب المبيعات المسؤول:
          </span>
          <input
            type="text"
            value={salespersonName}
            readOnly
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
            تعليمات الإصلاح الخاصة بالطلب (اختياري):
          </span>
          <textarea
            rows={2}
            name="repairNote"
            aria-invalid={errors?.repairNote !== undefined}
            aria-describedby={
              errors?.repairNote === undefined
                ? undefined
                : "metadata-repairNote-error"
            }
            value={repairNote}
            onChange={(e) => {
              onRepairNoteChange(e.target.value);
            }}
            placeholder="مثال: فك النعل القديم وشد الجلد وإعادة تركيب أرضية ربل جديدة..."
            className="oriental-textarea w-full border-rose-300 text-xs"
          />
          {errors?.repairNote !== undefined && (
            <span
              id="metadata-repairNote-error"
              className="text-xs text-rose-700"
            >
              {errors.repairNote}
            </span>
          )}
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
            errors={errors}
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
  errors,
}: {
  fields: OrderAdjustmentFields;
  errors?: MetadataErrors | undefined;
  onChange?: ((fields: OrderAdjustmentFields) => void) | undefined;
}) {
  const controls = adjustmentFieldDefinitions.map((field) => (
    <label key={field.key} className="block">
      <span className="mb-1 block text-xs font-bold text-slate-700">
        {field.label}
      </span>
      <textarea
        rows={field.rows}
        name={field.key}
        aria-invalid={errors?.[field.key] !== undefined}
        aria-describedby={
          errors?.[field.key] === undefined
            ? undefined
            : `metadata-${field.key}-error`
        }
        value={fields[field.key] ?? ""}
        onChange={(event) => {
          onChange?.({ [field.key]: event.target.value });
        }}
        placeholder={metadataPlaceholders[field.key]}
        className="oriental-textarea w-full border-amber-300 bg-white text-xs"
      />
      {errors?.[field.key] !== undefined && (
        <span
          id={`metadata-${field.key}-error`}
          className="text-xs text-rose-700"
        >
          {errors[field.key]}
        </span>
      )}
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
