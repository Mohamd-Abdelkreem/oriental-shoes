"use client";
import { toManufacturingWorkSummary } from "../model/manufacturing-view.model";
import type { ManufacturingOrderData } from "@template/contracts";
import type { ManufacturingWorkRow } from "../model/manufacturing-view.model";

import { FileText } from "lucide-react";
import {
  requiredQuantity,
  roleLabels,
  typeLabels,
  formatProductCount,
  type MvpOrder,
  type QuantitySegment,
  type Role,
} from "@/features/prototype/state/mvp-store";

import { getDeptSpecsSummary } from "./get-dept-specs-summary";

function LegacyFactoryTaskSummary({
  order,
  role,
  selectedItem,
  selectedSegment,
  otherSegmentCount,
  expectedNextDept,
}: {
  order: MvpOrder;
  role: Exclude<Role, "admin" | "sales" | "approval" | "warehouse">;
  selectedItem: MvpOrder["items"][number] | undefined;
  selectedSegment: QuantitySegment | undefined;
  otherSegmentCount: number;
  expectedNextDept: string;
}) {
  return (
    <>
      {/* 3. Consistent 16-Point Summary Grid Section (Task 2 Requirement) */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <FileText size={16} className="text-teal-600" />
            <span>الملخص التشغيلي للطلب والجزء المحدد (16 مؤشر تشغيلي)</span>
          </h3>
          <span className="text-xs font-medium text-slate-500">
            رقم أمر التفصيل الأم:{" "}
            <strong className="font-mono text-teal-800">{order.id}</strong>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              1. رقم أمر التفصيل:
            </span>
            <strong className="font-mono text-sm text-slate-900">
              {order.id}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              2. اسم العميل:
            </span>
            <strong className="text-sm text-slate-900">
              {order.customerName || order.customer}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              3. نوع الأمر:
            </span>
            <strong className="text-slate-900">{typeLabels[order.type]}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              4. الموديل والبند:
            </span>
            <strong className="font-mono text-sm text-teal-900">
              {selectedItem?.model} (مقاس {selectedItem?.size})
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              5. مواصفات القسم:
            </span>
            <strong className="line-clamp-1 text-slate-900">
              {selectedItem ? getDeptSpecsSummary(role, selectedItem) : "—"}
            </strong>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50/80 p-3">
            <span className="block text-[11px] font-bold text-teal-800">
              6. كمية هذا الجزء المحدد:
            </span>
            <strong className="text-base text-teal-950">
              {formatProductCount(selectedSegment?.quantity || 0)}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              7. إجمالي كمية البند:
            </span>
            <strong className="text-slate-900">
              {formatProductCount(selectedItem?.quantity || 0)}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              8. إجمالي أمر التفصيل النشط:
            </span>
            <strong className="text-slate-900">
              {formatProductCount(requiredQuantity(order))}
            </strong>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
            <span className="block text-[11px] text-emerald-800">
              9. الكمية المكتملة بالمستودع:
            </span>
            <strong className="text-emerald-950">
              {formatProductCount(order.warehouse)}
            </strong>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <span className="block text-[11px] text-amber-800">
              10. الكمية المتبقية للتصنيع:
            </span>
            <strong className="text-amber-950">
              {formatProductCount(
                Math.max(0, requiredQuantity(order) - order.warehouse),
              )}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              11. حالة الجزء الحالية:
            </span>
            <strong className="text-slate-900">
              {selectedSegment?.state || "—"}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              12. القسم الحالي:
            </span>
            <strong className="text-teal-800">
              {selectedSegment?.stage || roleLabels[role]}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              13. القسم السابق (المصدر):
            </span>
            <strong className="text-slate-800">
              {selectedSegment?.source || "الاعتماد"}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              14. القسم المتوقع التالي:
            </span>
            <strong className="text-slate-800">{expectedNextDept}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              15. الموظف المعين:
            </span>
            <strong
              className={
                selectedSegment?.worker
                  ? "font-medium text-indigo-700"
                  : "text-slate-400"
              }
            >
              {selectedSegment?.worker || "غير معين حالياً"}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              16. آخر حركة والأجزاء الأخرى:
            </span>
            <strong className="block font-mono text-[11px] text-slate-900">
              {selectedSegment?.startedAt || order.created}
            </strong>
            <span className="mt-0.5 block text-[10px] text-teal-700">
              {otherSegmentCount === 0
                ? "لا توجد أجزاء أخرى"
                : `${String(otherSegmentCount)} أجزاء أخرى لنفس الأمر`}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export function FactoryTaskSummary(
  props:
    | Parameters<typeof LegacyFactoryTaskSummary>[0]
    | {
        source: "persisted";
        data: ManufacturingOrderData;
        rows: readonly ManufacturingWorkRow[];
      },
) {
  return "source" in props ? (
    <PersistedFactoryTaskSummary {...props} />
  ) : (
    <LegacyFactoryTaskSummary {...props} />
  );
}
function PersistedFactoryTaskSummary({
  data,
  rows,
}: {
  data: ManufacturingOrderData;
  rows: readonly ManufacturingWorkRow[];
}) {
  const order = data.paper.order;
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="border-b border-slate-100 pb-3 text-sm font-bold">
        الملخص التشغيلي للطلب والقطع المحددة
      </h3>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
        <p>أمر التفصيل: {order.businessNumber}</p>
        <p>العميل: {order.customerName}</p>
        <p>نوع الأمر: {typeLabels[order.type]}</p>
        <p>موعد التسليم: {order.deliveryDate ?? "غير محدد"}</p>
        <p>القطع المحددة: {rows.length}</p>
        <p>القطع الفعالة: {order.counts.active}</p>
        <p>المستلم فعلياً: {order.counts.received}</p>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
        >
          <strong>
            القطعة {row.piece.position} · {row.piece.model ?? "—"}
          </strong>
          <p>{toManufacturingWorkSummary(row)}</p>
          <p>
            دورة الزيارة: {row.work.visit?.sequence ?? "غير مسجلة"} · المصدر:{" "}
            {row.work.visit?.origin.kind === "LEGACY_BASELINE"
              ? "مصدر سابق غير مسجل"
              : row.work.visit?.origin.sourceDepartment === "APPROVAL"
                ? "الاعتماد"
                : row.work.visit?.origin.sourceDepartment === "QUALITY"
                  ? "الجودة"
                  : row.work.visit?.origin.sourceDepartment === "CUTTING"
                    ? "القص"
                    : "غير مسجل"}
          </p>
          <p>
            بدأ العمل: {row.work.visit?.startedBy?.fullName ?? "غير مسجل"} ·{" "}
            {row.work.visit?.startedAt ?? "وقت البدء غير مسجل"}
          </p>
          <p>
            آخر منفذ فعلي: {row.work.lastAction?.actor.fullName ?? "غير مسجل"}
          </p>
          <p>
            أتم العمل: {row.work.visit?.endedBy?.fullName ?? "لم يسجل إتمام"} ·{" "}
            {row.work.visit?.endedAt ?? "—"}
          </p>
          {row.work.visit?.startedAt && row.work.visit.endedAt && (
            <p>
              مدة الزيارة:{" "}
              {Math.max(
                0,
                Math.floor(
                  (Date.parse(row.work.visit.endedAt) -
                    Date.parse(row.work.visit.startedAt)) /
                    60000,
                ),
              )}{" "}
              دقيقة
            </p>
          )}
          {row.work.visit?.origin.instructions && (
            <p>تعليمات معتمدة: {row.work.visit.origin.instructions}</p>
          )}
        </div>
      ))}
    </div>
  );
}
