"use client";

import React from "react";
import Link from "next/link";
import {
  Boxes,
  CheckCircle2,
  RotateCcw,
  Scissors,
  Sparkles,
  ShieldCheck,
  PackageCheck,
  AlertTriangle,
  FileText,
  Layers,
  Trash2,
} from "lucide-react";
import {
  type MvpOrder,
  type Stage,
  typeLabels,
  totalQuantity,
  requiredQuantity,
  stageQuantity,
  formatOrderPieceProgress,
  formatProductCount,
} from "@/features/prototype/state/mvp-store";
import { OrderTrackingSegments } from "./order-tracking-segments";
import { OrderTrackingTimeline } from "./order-tracking-timeline";
import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";

export type OrderFullTrackingViewProps = {
  order: MvpOrder;
  mode?: "admin" | "sales" | undefined;
  onCancelClick?: () => void;
  onReopenClick?: () => void;
};

// 7 Manufacturing & Delivery Stages
const TRACKING_STAGES: {
  name: Stage | "ملغي";
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { name: "القص", label: "قسم القص", icon: Scissors },
  { name: "الإنتاج والإصلاح", label: "قسم الإنتاج والإصلاح", icon: Layers },
  { name: "العمليات الخاصة", label: "قسم العمليات الخاصة", icon: Sparkles },
  { name: "الجودة والتغليف", label: "قسم الجودة والتغليف", icon: ShieldCheck },
  { name: "المستودع", label: "قسم المستودع", icon: PackageCheck },
  { name: "تم الاستلام", label: "تم التسليم للعميل", icon: CheckCircle2 },
  { name: "ملغي", label: "ملغي إدارياً", icon: AlertTriangle },
];

export function OrderFullTrackingView({
  order,
  mode = "admin",
  onCancelClick,
  onReopenClick,
}: OrderFullTrackingViewProps) {
  const orig = totalQuantity(order);
  const canc = order.cancelled;
  const activeReq = requiredQuantity(order);
  const completedInWh = order.warehouse;
  const remainingToComplete = Math.max(0, activeReq - completedInWh);
  const isAllInWh = activeReq > 0 && completedInWh >= activeReq;

  // Derive stage breakdown counts
  const stageCounts = {
    القص: stageQuantity(order, "القص"),
    "الإنتاج والإصلاح": stageQuantity(order, "الإنتاج والإصلاح"),
    "العمليات الخاصة": stageQuantity(order, "العمليات الخاصة"),
    "الجودة والتغليف": stageQuantity(order, "الجودة والتغليف"),
    المستودع: stageQuantity(order, "المستودع"),
    "تم الاستلام":
      order.status === "تم الاستلام"
        ? activeReq
        : stageQuantity(order, "تم الاستلام"),
    ملغي: canc,
  };

  const activeAndCompletedTotal =
    stageCounts["القص"] +
    stageCounts["الإنتاج والإصلاح"] +
    stageCounts["العمليات الخاصة"] +
    stageCounts["الجودة والتغليف"] +
    stageCounts["المستودع"] +
    stageCounts["تم الاستلام"];

  return (
    <div className="space-y-6">
      {/* 1. Parent Order Full Summary Header Card */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-teal-50 px-2.5 py-0.5 font-mono text-sm font-bold text-teal-800">
                {order.id}
              </span>
              <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                {typeLabels[order.type]}
              </span>
              <OrientalStatusPill tone={statusTone(order.status)}>
                {order.status}
              </OrientalStatusPill>
            </div>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">
              تتبع المسار التشغيلي الكامل:{" "}
              {order.customerName || order.customer}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              هذه الشاشة تجيب بدقة على تساؤل:{" "}
              <strong className="text-teal-900">
                أين توجد كل قطعة من هذا الطلب الآن، ومن المسؤول عنها وحالتها
                الراهنة؟
              </strong>
            </p>
          </div>

          {/* Admin vs Sales Action Buttons */}
          <div className="flex items-center gap-2">
            {mode === "admin" && (
              <>
                {onCancelClick &&
                  order.status !== "تم الاستلام" &&
                  order.status !== "ملغي بالكامل" && (
                    <button
                      type="button"
                      onClick={onCancelClick}
                      className="btn-pill btn-rose inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <Trash2 size={13} />
                      <span>إلغاء كمية إدارياً</span>
                    </button>
                  )}
                {onReopenClick &&
                  (order.status === "تم الاستلام" ||
                    order.status === "ملغي بالكامل") && (
                    <button
                      type="button"
                      onClick={onReopenClick}
                      className="btn-pill btn-teal inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <RotateCcw size={13} />
                      <span>إعادة فتح أمر التفصيل</span>
                    </button>
                  )}
              </>
            )}
            <Link
              href={`/orders/${order.id}/print`}
              target="_blank"
              className="btn-pill btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <FileText size={13} />
              <span>معاينة الورقة الرسمية</span>
            </Link>
          </div>
        </div>

        {/* 13 Summary Data Points Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              رقم أمر التفصيل:
            </span>
            <strong className="font-mono text-sm text-slate-900">
              {order.id}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">العميل:</span>
            <strong className="text-sm text-slate-900">
              {order.customerName || order.customer}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              تاريخ الإنشاء:
            </span>
            <strong className="font-mono text-slate-900">
              {order.created}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              موعد التسليم المطلوب:
            </span>
            <strong className="font-mono text-slate-900">
              {order.deliveryDate || order.delivery}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              الكمية الأصلية:
            </span>
            <strong className="text-sm text-slate-900">
              {formatProductCount(orig)}
            </strong>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3">
            <span className="block text-[11px] font-bold text-teal-800">
              الكمية النشطة (بعد الإلغاء):
            </span>
            <strong className="text-sm font-bold text-teal-950">
              {formatProductCount(activeReq)}
            </strong>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
            <span className="block text-[11px] text-emerald-800">
              الكمية المكتملة (بالمستودع):
            </span>
            <strong className="text-sm font-bold text-emerald-950">
              {formatProductCount(completedInWh)}
            </strong>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <span className="block text-[11px] text-amber-800">
              الكمية المتبقية للتصنيع:
            </span>
            <strong className="text-sm font-bold text-amber-950">
              {formatProductCount(remainingToComplete)}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              الكمية الملغاة إدارياً:
            </span>
            <strong
              className={
                canc > 0 ? "text-sm font-bold text-rose-700" : "text-slate-500"
              }
            >
              {formatProductCount(canc)}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              حالة إنجاز القطع:
            </span>
            <strong className="text-sm font-bold text-teal-800">
              {formatOrderPieceProgress(order)}
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              الحالة العامة للأمر:
            </span>
            <strong className="text-slate-900">{order.status}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] text-slate-500">
              آخر تحديث للمسار:
            </span>
            <strong className="font-mono text-[11px] text-slate-900">
              {order.created}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. Visual Order Piece Progress Component */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-teal-50 p-1.5 text-teal-700">
              <Boxes size={16} />
            </span>
            <h3 className="text-sm font-bold text-slate-800">
              موقف تصنيع قطع أمر التفصيل ({formatOrderPieceProgress(order)})
            </h3>
          </div>
          <span className="text-xs font-bold text-teal-800">
            {formatProductCount(completedInWh)} مكتملة من أصل{" "}
            {formatProductCount(activeReq)} نشطة
          </span>
        </div>

        {/* Multi-segment Progress Bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          <div
            className="bg-teal-600 transition-all duration-500"
            style={{
              width: `${String(activeReq > 0 ? (completedInWh / activeReq) * 100 : 0)}%`,
            }}
            title={`مكتمل: ${String(completedInWh)} منتج`}
          />
          {canc > 0 && orig > 0 && (
            <div
              className="bg-rose-300 transition-all duration-500"
              style={{ width: `${String(Math.round((canc / orig) * 100))}%` }}
              title={`ملغي: ${String(canc)} منتج`}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between pt-1 text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-600" />
              <span>
                مكتمل في المستودع:{" "}
                <strong>{formatProductCount(completedInWh)}</strong>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span>
                قيد التصنيع في الأقسام:{" "}
                <strong>{formatProductCount(remainingToComplete)}</strong>
              </span>
            </span>
            {canc > 0 && (
              <span className="flex items-center gap-1.5 text-rose-700">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span>
                  ملغي إدارياً: <strong>{formatProductCount(canc)}</strong>
                </span>
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">
            إجمالي أمر التفصيل الأصلي: {formatProductCount(orig)}
          </span>
        </div>
      </div>

      {/* 3. Visual 7-Stage Quantity Distribution Table */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Layers size={16} className="text-teal-600" />
              <span>جدول التوزيع الكمي عبر مراحل المصنع السبع:</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              توزيع وتتبع كل قطعة من أصل {formatProductCount(activeReq)} عبر
              خطوط المصنع والمستودع والتسليم:
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            ٧ مراحل تشغيلية
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <th className="p-3 font-bold">المرحلة / القسم</th>
                <th className="p-3 text-center font-bold">الكمية الموجودة</th>
                <th className="p-3 font-bold">الحالة التشغيلية والملاحظات</th>
                <th className="p-3 font-bold">حصة القطع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {TRACKING_STAGES.map((stg) => {
                const qty =
                  stageCounts[stg.name as keyof typeof stageCounts] || 0;
                const Icon = stg.icon;
                const isCurrentActive = qty > 0;

                return (
                  <tr
                    key={stg.name}
                    className={
                      isCurrentActive
                        ? "bg-teal-50/40 font-medium"
                        : "text-slate-500"
                    }
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg p-1.5 ${isCurrentActive ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-400"}`}
                        >
                          <Icon size={15} />
                        </span>
                        <div>
                          <strong
                            className={
                              isCurrentActive
                                ? "text-slate-900"
                                : "text-slate-600"
                            }
                          >
                            {stg.label}
                          </strong>
                          {stg.name === "ملغي" && (
                            <span className="block text-[10px] text-rose-600">
                              إلغاء إداري معتمد
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block rounded-full px-3 py-1 font-mono text-xs font-bold ${
                          isCurrentActive
                            ? stg.name === "ملغي"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-teal-700 text-white shadow-sm"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {formatProductCount(qty)}
                      </span>
                    </td>
                    <td className="p-3">
                      {qty > 0 ? (
                        <span className="text-slate-700">
                          {stg.name === "المستودع"
                            ? isAllInWh
                              ? "مكتمل كامل القطع ومجهز بكراتين التسليم"
                              : "وصلت دفعات جزئية بانتظار اكتمال باقي الأقسام"
                            : stg.name === "ملغي"
                              ? "مخصومة من المطلوب النشط رسمياً"
                              : stg.name === "تم الاستلام"
                                ? "تم تسليم الطلب للعميل بالكامل"
                                : "قيد التشغيل والمتابعة الفنية داخل القسم"}
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          لا توجد كميات حالياً
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono">
                      {isCurrentActive && stg.name !== "ملغي"
                        ? `${String(qty)} من ${String(activeReq)} قطع`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
              <tr>
                <td className="p-3">مجموع القطع النشطة والمكتملة:</td>
                <td className="p-3 text-center font-mono text-sm text-teal-800">
                  {formatProductCount(activeAndCompletedTotal)}
                </td>
                <td
                  colSpan={2}
                  className="p-3 text-xs font-normal text-slate-500"
                >
                  مطابق تماماً للمطلوب النشط ({formatProductCount(activeReq)}) +
                  الملغي إدارياً ({formatProductCount(canc)}) = الإجمالي الأصلي
                  ({formatProductCount(orig)})
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <OrderTrackingSegments order={order} />
      <OrderTrackingTimeline
        order={order}
        originalQuantity={orig}
        activeQuantity={activeReq}
        stageCounts={stageCounts}
      />
    </div>
  );
}
