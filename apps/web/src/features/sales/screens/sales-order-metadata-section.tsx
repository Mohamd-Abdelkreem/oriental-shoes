"use client";

import { salesOrderTypeSchema } from "@template/contracts";
import { orderTypeOptions } from "@/features/orders/order-types";
import type { MvpOrder } from "@/features/prototype/state/mvp-store";

type MetadataErrors = Readonly<
  Partial<Record<"type" | "deliveryDate" | "repairNote", string>>
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
}: {
  orderType: MvpOrder["type"];
  salespersonName: string;
  errors?: MetadataErrors | undefined;
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

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
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
            className="oriental-select w-full"
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
            className="oriental-input h-10! min-h-10! w-full rounded-[10px]! px-3! py-0! text-[12.5px]! font-semibold!"
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
            className="oriental-input h-10! min-h-10! w-full cursor-not-allowed rounded-[10px]! bg-slate-50! px-3! py-0! text-[12.5px]! font-semibold! text-slate-600!"
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
    </div>
  );
}
