import Link from "next/link";
import { Boxes, Eye } from "lucide-react";
import type { MvpOrder, Role } from "@/features/prototype/state/mvp-store";

type Props = {
  firstOrder: MvpOrder | undefined;
  deptRole: Exclude<Role, "admin" | "sales" | "approval">;
  deptRoleName: string;
  totalPiecesCount: number;
  arrivedAtDeptCount: number;
  notArrivedYetCount: number;
  problemCount: number;
};

export function DepartmentOrderSummary({
  firstOrder,
  deptRole,
  deptRoleName,
  totalPiecesCount,
  arrivedAtDeptCount,
  notArrivedYetCount,
  problemCount,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col items-start justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Boxes size={16} className="text-teal-700" />
            <span>الموقف التشغيلي لقطع الأوامر في {deptRoleName}</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            تتبع تفصيلي لكل قطعة حذاء مستقلة — وحدة العمل الأساسية هي قطعة واحدة
            (الكمية: ١)
          </p>
        </div>
        {firstOrder && (
          <Link
            href={`/${deptRole === "special" ? "special-operations" : deptRole}/orders/${firstOrder.id}`}
            className="btn-pill btn-secondary inline-flex items-center gap-1.5 text-xs"
            title="عرض جميع قطع هذا الأمر وتفاصيل الطلب بالكامل"
          >
            <Eye size={13} />
            <span>عرض جميع قطع أمر {firstOrder.id}</span>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="block text-[11px] text-slate-500">
            إجمالي قطع الأوامر:
          </span>
          <strong className="text-base font-bold text-slate-900">
            {totalPiecesCount} قطع
          </strong>
        </div>
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
          <span className="block text-[11px] font-medium text-teal-800">
            وصلت للقسم حالياً:
          </span>
          <strong className="text-base font-bold text-teal-950">
            {arrivedAtDeptCount} من {totalPiecesCount} قطع
          </strong>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <span className="block text-[11px] font-medium text-amber-800">
            لم تصل بعد (بمراحل سابقة):
          </span>
          <strong className="text-base font-bold text-amber-950">
            {notArrivedYetCount} قطع
          </strong>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <span className="block text-[11px] font-medium text-rose-800">
            بها مشكلة (لدى الاعتماد):
          </span>
          <strong
            className={
              problemCount > 0
                ? "text-base font-bold text-rose-700"
                : "text-base font-bold text-slate-400"
            }
          >
            {problemCount} قطع
          </strong>
        </div>
      </div>
    </div>
  );
}
