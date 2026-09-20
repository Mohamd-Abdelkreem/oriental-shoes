"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Eye,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import {
  requiredQuantity,
  roleLabels,
  useMvpStore,
  formatProductCount,
  type MvpOrder,
  type QuantitySegment,
  type Role,
  type Stage,
} from "@/features/prototype/state/mvp-store";
import { isOrderOverdue } from "@/features/prototype/state/workflow";
import { roleUsers } from "@/features/prototype/fixtures/prototype-data";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";
import { ManufacturingRail } from "@/features/prototype/components/manufacturing-rail";
import { FactoryTaskSummary } from "./factory-task-summary";
import { FactoryTaskSpecifications } from "./factory-task-specifications";

export function FactoryTaskDetailView({
  orderId,
  role,
  currentStage,
  onConfirmReceipt,
  onRecordCompletion,
  onRouteSplit,
  onRemedy,
}: {
  orderId: string;
  role: Exclude<Role, "admin" | "sales" | "approval" | "warehouse">;
  currentStage: Stage;
  onConfirmReceipt?: (order: MvpOrder, segment: QuantitySegment) => void;
  onStartWork?: (order: MvpOrder, segment: QuantitySegment) => void;
  onRecordCompletion?: (order: MvpOrder, segment: QuantitySegment) => void;
  onRouteSplit?: (order: MvpOrder, segment: QuantitySegment) => void;
  onRemedy?: (order: MvpOrder, segment: QuantitySegment) => void;
}) {
  const store = useMvpStore();
  const searchParams = useSearchParams();
  const targetSegmentId = searchParams.get("segmentId");
  const targetItemId = searchParams.get("itemId");

  const order = store.orders.find((o) => o.id === orderId);
  const basePath = role === "special" ? "special-operations" : role;
  const currentActor = roleUsers[role].name || "سالم الحربي";

  if (!order) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <AlertCircle size={40} className="mx-auto mb-2 text-rose-500" />
        <h2 className="text-lg font-bold text-slate-800">
          أمر التفصيل غير موجود
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          لم يتم العثور على أمر تفصيل بالرقم {orderId}
        </p>
        <Link
          href={`/${basePath}/dashboard`}
          className="btn-pill btn-secondary mt-4 inline-flex items-center gap-1.5"
        >
          <ArrowRight size={14} />
          <span>العودة للوحة القسم</span>
        </Link>
      </div>
    );
  }

  // Dept segments
  const deptSegments = order.segments.filter((s) => s.stage === currentStage);
  const selectedSegment =
    deptSegments.find((s) => s.id === targetSegmentId) ||
    deptSegments[0] ||
    order.segments.find((s) => s.id === targetSegmentId) ||
    order.segments[0];

  const selectedItem =
    order.items.find((i) => i.id === selectedSegment?.itemId) ||
    order.items.find((i) => i.id === targetItemId) ||
    order.items[0];

  const inDept = deptSegments.reduce((sum, s) => sum + s.quantity, 0);
  const overdue = isOrderOverdue(order);

  const activeSegments = order.segments.filter((s) => s.state !== "ملغاة");
  const selectedSegmentIndex =
    activeSegments.findIndex((s) => s.id === selectedSegment?.id) >= 0
      ? activeSegments.findIndex((s) => s.id === selectedSegment?.id) + 1
      : 1;
  const otherSegments = order.segments.filter(
    (s) => s.id !== selectedSegment?.id,
  );

  // Expected next department based on current role and segment
  const expectedNextDept =
    role === "cutting"
      ? "قسم الإنتاج والإصلاح"
      : role === "production"
        ? "قسم العمليات الخاصة أو الجودة"
        : role === "special"
          ? "قسم الجودة والتغليف"
          : "المستودع والتسليم";

  // Worker assignment status
  const isAssignedToOther = Boolean(
    selectedSegment?.worker && selectedSegment.worker !== currentActor,
  );

  return (
    <div className="space-y-6">
      {/* 1. Universal Top Identification Banner (Task 2 Requirement) */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-teal-700/40 bg-gradient-to-l from-teal-900 via-teal-800 to-slate-900 p-4 text-white shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-teal-400/30 bg-teal-500/20 p-2.5 text-teal-300">
            <Boxes size={22} />
          </span>
          <div>
            <span className="block text-xs font-medium text-teal-200">
              وحدة التتبع التشغيلية الحالية:
            </span>
            <h2 className="text-base font-bold tracking-wide text-white sm:text-lg">
              أنت تعرض الآن: {selectedSegment?.quantity || 1} من أصل{" "}
              {requiredQuantity(order)} منتجات — قسم {roleLabels[role]}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-bold text-white">
            الجزء {selectedSegmentIndex} من {activeSegments.length} أجزاء
          </span>
          <span className="rounded-full bg-teal-400 px-2.5 py-1 text-xs font-bold text-slate-950">
            {selectedSegment?.state || order.status}
          </span>
        </div>
      </div>

      {/* 2. Shared Header for Factory Departments */}
      <OrientalPageHeader
        eyebrow={`قسم ${roleLabels[role]} / تفاصيل المهمة التشغيلية`}
        title={`مهمة تصنيع: أمر تفصيل ${order.id}`}
        subtitle={`العميل: ${order.customerName || order.customer} · الموديل: ${selectedItem?.model || "OS-188"} · المقاس: ${selectedItem?.size || "٤٢"} · الكمية المخصصة: ${String(selectedSegment?.quantity || inDept)} قطعة · موعد التسليم: ${order.deliveryDate || order.delivery}`}
        badge={
          <div className="flex items-center gap-2">
            {overdue && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                متأخر عن موعد التسليم
              </span>
            )}
            <OrientalStatusPill
              tone={statusTone(selectedSegment?.state || order.status)}
            >
              {selectedSegment?.state || order.status}
            </OrientalStatusPill>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/${basePath}/dashboard`}
              className="btn-pill btn-secondary"
            >
              <ArrowRight size={15} />
              <span>رجوع للقائمة</span>
            </Link>
          </div>
        }
      />

      <FactoryTaskSummary
        order={order}
        role={role}
        selectedItem={selectedItem}
        selectedSegment={selectedSegment}
        otherSegmentCount={otherSegments.length}
        expectedNextDept={expectedNextDept}
      />

      {/* Segment Switcher if multiple segments exist in this order */}
      {order.segments.length > 1 && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Boxes size={14} className="text-teal-600" />
              <span>
                دفعات أمر التفصيل ({order.id}) — حدد الدفعة المستهدفة للتشغيل:
              </span>
            </span>
            <span className="text-[11px] text-slate-500">
              إجمالي القطع النشطة: {requiredQuantity(order)} قطعة
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.segments.map((seg, idx) => {
              const isCurrentDept = seg.stage === currentStage;
              const isSelected = seg.id === selectedSegment?.id;
              return (
                <Link
                  key={seg.id}
                  href={`/${basePath}/tasks/${order.id}?segmentId=${seg.id}&itemId=${seg.itemId}`}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    isSelected
                      ? "border-teal-800 bg-teal-700 text-white shadow-sm"
                      : isCurrentDept
                        ? "border-teal-300 bg-white text-teal-900 hover:bg-teal-50"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>
                    دفعة #{idx + 1}: {seg.quantity} قطعة
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      isSelected
                        ? "bg-teal-800 text-teal-100"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {seg.stage} · {seg.state}
                  </span>
                  {seg.worker && (
                    <span className="text-[10px] font-normal opacity-90">
                      ({seg.worker})
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Contextual Primary Action Banner based strictly on selectedSegment.state */}
      {selectedSegment && (
        <div className="space-y-4 rounded-xl border-2 border-teal-500/30 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-center">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
                  الدفعة المستهدفة: {selectedSegment.quantity} قطع في{" "}
                  {selectedSegment.stage}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  الحالة: {selectedSegment.state}
                </span>
                {selectedSegment.worker && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                    المسؤول: {selectedSegment.worker}
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-slate-900">
                الإجراء التشغيلي المتاح للدفعة الحالية
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {selectedSegment.note || "لا توجد ملاحظات استثنائية"}
              </p>
            </div>

            {/* Segment Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Combined Receipt & Start Work Action */}
              {(selectedSegment.state === "بانتظار الاستلام" ||
                selectedSegment.state === "بانتظار بدء العمل") &&
                onConfirmReceipt && (
                  <button
                    type="button"
                    onClick={() => {
                      onConfirmReceipt(order, selectedSegment);
                    }}
                    className="btn-pill btn-teal inline-flex items-center gap-1.5 px-4 py-2 text-xs"
                  >
                    <CheckCircle2 size={16} />
                    <span>
                      {role === "cutting"
                        ? "استلام وبدء القص"
                        : role === "production"
                          ? "استلام وبدء التصنيع"
                          : role === "special"
                            ? "استلام وبدء العملية الخاصة"
                            : "استلام وبدء الفحص"}{" "}
                      ({selectedSegment.quantity} قطع)
                    </span>
                  </button>
                )}

              {/* In-progress actions */}
              {selectedSegment.state === "قيد التنفيذ" && (
                <>
                  {isAssignedToOther ? (
                    <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                      قيد التنفيذ بواسطة: {selectedSegment.worker} (للمشاهدة
                      فقط)
                    </span>
                  ) : (
                    <>
                      {onRecordCompletion && (
                        <button
                          type="button"
                          onClick={() => {
                            onRecordCompletion(order, selectedSegment);
                          }}
                          className="btn-pill btn-teal inline-flex items-center gap-1.5 px-4 py-2 text-xs"
                        >
                          <Send size={16} />
                          <span>إنهاء العمل وتسجيل الإنجاز</span>
                        </button>
                      )}
                      {onRouteSplit && role === "production" && (
                        <button
                          type="button"
                          onClick={() => {
                            onRouteSplit(order, selectedSegment);
                          }}
                          className="btn-pill btn-amber inline-flex items-center gap-1.5 px-4 py-2 text-xs"
                        >
                          <Sparkles size={16} />
                          <span>توجيه تفريعة الإنتاج (عمليات خاصة / جودة)</span>
                        </button>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Quality Correction Remedy Action */}
              {selectedSegment.state === "معادة من الجودة" && (
                <button
                  type="button"
                  onClick={() => {
                    if (onRemedy) onRemedy(order, selectedSegment);
                    else onRecordCompletion?.(order, selectedSegment);
                  }}
                  className="btn-pill btn-rose inline-flex items-center gap-1.5 px-4 py-2 text-xs"
                >
                  <RotateCcw size={16} />
                  <span>إكمال التصحيح وإعادة الإرسال للجودة</span>
                </button>
              )}

              {/* Completed action */}
              {selectedSegment.state === "مكتمل في المرحلة" &&
                onRecordCompletion && (
                  <button
                    type="button"
                    onClick={() => {
                      onRecordCompletion(order, selectedSegment);
                    }}
                    className="btn-pill btn-teal inline-flex items-center gap-1.5 px-4 py-2 text-xs"
                  >
                    <Send size={16} />
                    <span>إرسال للمرحلة التالية</span>
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      <FactoryTaskSpecifications
        order={order}
        role={role}
        selectedItem={selectedItem}
        selectedSegment={selectedSegment}
        inDept={inDept}
      />

      {/* 4. Other Segments of the Same Order (Task 2 Explicit Requirement: الأجزاء الأخرى من نفس أمر التفصيل) */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-2 border-b pb-3 sm:flex-row sm:items-center">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Boxes size={16} className="text-teal-600" />
            <span>الأجزاء الأخرى من نفس أمر التفصيل ({order.id})</span>
          </h4>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
            إجمالي أمر التفصيل: {formatProductCount(requiredQuantity(order))} (
            {order.segments.length} أجزاء كمية)
          </span>
        </div>

        {otherSegments.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
            لا توجد أجزاء أخرى، هذا الجزء يمثل كامل كمية أمر التفصيل (
            {formatProductCount(selectedSegment?.quantity || 1)})
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              جميع الأجزاء التالية تنتمي لنفس أمر التفصيل وتتحرك بالتوازي عبر
              أقسام المصنع:
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {otherSegments.map((seg) => {
                const itm =
                  order.items.find((i) => i.id === seg.itemId) ||
                  order.items[0];
                return (
                  <div
                    key={seg.id}
                    className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition hover:border-teal-300 hover:bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs font-bold text-slate-900">
                          {seg.stage}
                        </strong>
                        {seg.stage === currentStage && (
                          <span className="py-0.2 rounded bg-teal-100 px-1.5 text-[10px] font-bold text-teal-800">
                            بنفس قسمك
                          </span>
                        )}
                      </div>
                      <span className="rounded border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-xs font-bold text-teal-800">
                        {formatProductCount(seg.quantity)}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          الحالة التشغيلية:
                        </span>
                        <OrientalStatusPill tone={statusTone(seg.state)}>
                          {seg.state}
                        </OrientalStatusPill>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">الموديل والمقاس:</span>
                        <strong className="font-mono text-slate-800">
                          {itm?.model} (مقاس {itm?.size})
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">الموظف المعين:</span>
                        <span
                          className={
                            seg.worker
                              ? "font-medium text-indigo-700"
                              : "text-slate-400"
                          }
                        >
                          {seg.worker || "غير معين"}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end border-t border-slate-200 pt-2">
                      <Link
                        href={`/${basePath}/tasks/${order.id}?segmentId=${seg.id}&itemId=${seg.itemId}`}
                        className="btn-pill btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
                        title="الانتقال لعرض وتشغيل هذا الجزء"
                      >
                        <Eye size={12} />
                        <span>عرض هذا الجزء</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Progress Rail */}
      <ManufacturingRail order={order} />
    </div>
  );
}
