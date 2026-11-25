"use client";
import type { QualityWorkRow } from "../model/quality-view.model";
import { toQualityWorkSummary } from "../model/quality-view.model";
import { toManufacturingWorkSummary } from "../model/manufacturing-view.model";
import type {
  QualityOrderData,
  ManufacturingOrderData,
} from "@template/contracts";
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
      }
    | {
        source: "quality";
        data: QualityOrderData;
        rows: readonly QualityWorkRow[];
      },
) {
  if ("source" in props && props.source === "quality")
    return <QualityFactoryTaskSummary {...props} />;
  return "source" in props ? (
    <PersistedFactoryTaskSummary {...props} />
  ) : (
    <LegacyFactoryTaskSummary {...props} />
  );
}
const summaryTimeFormat = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

function formatSummaryTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? value
    : summaryTimeFormat.format(new Date(parsed));
}

function SummaryShell({
  order,
  selectedCount,
  children,
}: {
  order: ManufacturingOrderData["paper"]["order"];
  selectedCount: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 sm:px-4">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <FileText
            size={14}
            aria-hidden="true"
            className="shrink-0 text-teal-700"
          />
          <span>الملخص التشغيلي للطلب والقطع المحددة</span>
        </h3>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
            {typeLabels[order.type]}
          </span>
          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
            التسليم: {order.deliveryDate ?? "غير محدد"}
          </span>
          <span className="rounded-md border border-teal-200/80 bg-teal-50/70 px-2 py-0.5 text-teal-900">
            المحددة: {selectedCount}
          </span>
          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
            الفعالة: {order.counts.active}
          </span>
          <span className="rounded-md border border-emerald-200/80 bg-emerald-50/70 px-2 py-0.5 text-emerald-900">
            المستلم فعلياً: {order.counts.received}
          </span>
        </div>
      </div>
      <div className="space-y-2 p-3 sm:px-4">{children}</div>
    </section>
  );
}

function PieceSummaryCard({
  position,
  model,
  statusText,
  sequence,
  originLabel,
  startedBy,
  startedAt,
  lastActor,
  endedBy,
  endedAt,
  children,
}: {
  position: number;
  model: string | null;
  statusText: string;
  sequence: number | undefined;
  originLabel: string;
  startedBy: string | undefined;
  startedAt: string | null | undefined;
  lastActor: string | undefined;
  endedBy: string | undefined;
  endedAt: string | null | undefined;
  children?: React.ReactNode;
}) {
  const formattedStart = startedAt
    ? formatSummaryTimestamp(startedAt)
    : "وقت البدء غير مسجل";
  const formattedEnd = endedAt ? formatSummaryTimestamp(endedAt) : null;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200/90 bg-slate-50/60 px-3.5 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-900">
            القطعة {position} · {model ?? "—"}
          </strong>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50/80 px-2.5 py-0.5 text-[11px] font-bold text-teal-900">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-teal-600"
            />
            {statusText}
          </p>
        </div>
        <p className="rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
          دورة الزيارة: {sequence ?? "غير مسجلة"} · المصدر: {originLabel}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-200/70 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-600">
        <p>
          بدأ العمل: {startedBy ?? "غير مسجل"} · {formattedStart}
        </p>
        <p>آخر منفذ فعلي: {lastActor ?? "غير مسجل"}</p>
        {(endedBy || formattedEnd) && (
          <p>
            أتم العمل: {endedBy ?? "لم يسجل إتمام"} · {formattedEnd ?? "—"}
          </p>
        )}
        {startedAt && endedAt && (
          <p>
            مدة الزيارة:{" "}
            {Math.max(
              0,
              Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 60000),
            )}{" "}
            دقيقة
          </p>
        )}
      </div>
      {children}
    </div>
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
    <SummaryShell order={order} selectedCount={rows.length}>
      {rows.map((row) => {
        const originLabel =
          row.work.visit?.origin.kind === "LEGACY_BASELINE"
            ? "مصدر سابق غير مسجل"
            : row.work.visit?.origin.sourceDepartment === "APPROVAL"
              ? "الاعتماد"
              : row.work.visit?.origin.sourceDepartment === "QUALITY"
                ? "الجودة"
                : row.work.visit?.origin.sourceDepartment === "CUTTING"
                  ? "القص"
                  : "غير مسجل";
        const instructions = row.work.visit?.origin.instructions;
        const alreadyInPaperIssues = Boolean(
          instructions &&
          data.paper.issues.some(
            (issue) =>
              issue.pieceId === row.piece.id &&
              issue.approvedInstructions === instructions,
          ),
        );
        return (
          <PieceSummaryCard
            key={row.key}
            position={row.piece.position}
            model={row.piece.model}
            statusText={toManufacturingWorkSummary(row)}
            sequence={row.work.visit?.sequence}
            originLabel={originLabel}
            startedBy={row.work.visit?.startedBy?.fullName}
            startedAt={row.work.visit?.startedAt}
            lastActor={row.work.lastAction?.actor.fullName}
            endedBy={row.work.visit?.endedBy?.fullName}
            endedAt={row.work.visit?.endedAt}
          >
            {instructions && !alreadyInPaperIssues && (
              <p className="rounded-md border border-teal-200/80 bg-teal-50/50 px-2.5 py-1 text-[11.5px] font-medium text-teal-950">
                تعليمات معتمدة: {instructions}
              </p>
            )}
          </PieceSummaryCard>
        );
      })}
    </SummaryShell>
  );
}

function QualityFactoryTaskSummary({
  data,
  rows,
}: {
  data: QualityOrderData;
  rows: readonly QualityWorkRow[];
}) {
  const order = data.paper.order;
  return (
    <SummaryShell order={order} selectedCount={rows.length}>
      {rows.map((row) => {
        const originLabel = row.work.visit?.sourceCorrectionId
          ? "تصحيح"
          : row.work.visit?.originKind === "PRODUCTION_ARRIVAL"
            ? "الإنتاج"
            : "مصدر سابق غير مسجل";
        return (
          <PieceSummaryCard
            key={row.key}
            position={row.piece.position}
            model={row.piece.model}
            statusText={toQualityWorkSummary(row)}
            sequence={row.work.visit?.sequence}
            originLabel={originLabel}
            startedBy={row.work.visit?.startedBy?.fullName}
            startedAt={row.work.visit?.startedAt}
            lastActor={row.work.lastAction?.actor.fullName}
            endedBy={row.work.visit?.endedBy?.fullName}
            endedAt={row.work.visit?.endedAt}
          >
            {row.work.currentCorrection && (
              <p className="rounded-md border border-amber-200/80 bg-amber-50/60 px-2.5 py-1 text-[11.5px] font-medium text-amber-950">
                تعليمات التصحيح: {row.work.currentCorrection.instructions}
              </p>
            )}
            {row.work.latestInspection && (
              <p className="text-[11.5px] font-medium text-slate-600">
                آخر نتيجة:{" "}
                {row.work.latestInspection.decision === "ACCEPT"
                  ? "قبول"
                  : "رفض"}{" "}
                - {row.work.latestInspection.inspector.fullName}
              </p>
            )}
          </PieceSummaryCard>
        );
      })}
    </SummaryShell>
  );
}
