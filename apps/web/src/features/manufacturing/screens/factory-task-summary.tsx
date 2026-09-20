"use client";

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

export function FactoryTaskSummary({
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
              {selectedItem
                ? getDeptSpecsSummary(role, selectedItem, selectedSegment)
                : "—"}
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
