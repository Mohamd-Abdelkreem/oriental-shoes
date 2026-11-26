"use client";
import { toLegacyOrderReference } from "@/features/orders/model/order-display-reference";
import { useToast } from "@/components/toast";
import {
  manufacturingActionSuccessMessage,
  qualityActionSuccessMessage,
} from "../model/manufacturing-action-success";
import {
  qualityCommandBodySchema,
  type QualityCommandOperation,
} from "@template/contracts";
import {
  useQualityOperationalScope,
  assertCurrentQualityOperationalScope,
  isCurrentQualityOperationalScope,
  qualityScopeKey,
} from "@/shared/query/operational-scope";
import { useQualityOrder, fetchQualityOrder } from "../hooks/quality.hooks";
import { useQualityCommand } from "../hooks/quality-commands.hooks";
import { QualityCommandRecovery } from "../components/quality-command-recovery";
import { qualityCommandSessionSchema } from "../model/quality-command-state";
import {
  validateQualityTaskSelection,
  captureQualitySelection,
  captureQualityInspection,
} from "../model/quality-selection.model";
import {
  resolveQualityTargets,
  freezeQualityRows,
  toQualityRail,
  type QualityWorkRow,
  type QualityReadAvailability,
} from "../model/quality-view.model";
import {
  qualityFailureMessage,
  type QualityInspectionFormValues,
} from "../model/quality-form.model";
import { QualityInspectionDialog } from "@/features/prototype/components/quality-inspection-dialog";
import { QualityInspectPieceModal } from "./quality-inspect-piece-modal";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ManufacturingDepartment,
  ManufacturingCommandOperation,
} from "@template/contracts";
import { RecordCompletionDialog } from "@/features/prototype/components/record-completion-dialog";
import { ReceiveAndStartDialog } from "@/features/prototype/components/receive-and-start-dialog";
import {
  assertCurrentManufacturingOperationalScope,
  useManufacturingOperationalScope,
} from "@/shared/query/operational-scope";
import {
  useManufacturingOrder,
  fetchManufacturingOrder,
} from "../hooks/manufacturing.hooks";
import { useManufacturingCommand } from "../hooks/manufacturing-commands.hooks";
import { ManufacturingCommandRecovery } from "../components/manufacturing-command-recovery";
import {
  validateManufacturingTaskSelection,
  captureManufacturingSelection,
} from "../model/manufacturing-selection.model";
import {
  resolveManufacturingTargets,
  freezeManufacturingRows,
  toManufacturingRail,
  type ManufacturingWorkRow,
} from "../model/manufacturing-view.model";
import { manufacturingFailureMessage } from "../model/manufacturing-form.model";
import { PieceReportProblemModal } from "./piece-report-problem-modal";

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

function LegacyFactoryTaskDetailView({
  orderId,
  role,
  currentStage,
  onConfirmReceipt,
  onRecordCompletion,
  onRemedy,
}: {
  orderId: string;
  role: Exclude<Role, "admin" | "sales" | "approval" | "warehouse">;
  currentStage: Stage;
  onConfirmReceipt?: (order: MvpOrder, segment: QuantitySegment) => void;
  onStartWork?: (order: MvpOrder, segment: QuantitySegment) => void;
  onRecordCompletion?: (order: MvpOrder, segment: QuantitySegment) => void;
  onRemedy?: (order: MvpOrder, segment: QuantitySegment) => void;
}) {
  const store = useMvpStore();
  const searchParams = useSearchParams();
  const targetSegmentId = searchParams.get("segmentId");
  const targetItemId = searchParams.get("itemId");

  const order = store.orders.find((o) => o.id === orderId);
  const basePath = role;
  const currentActor = roleUsers[role].name || "سالم الحربي";

  if (!order) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <AlertCircle size={40} className="mx-auto mb-2 text-rose-500" />
        <h2 className="text-lg font-bold text-slate-800">
          أمر التفصيل غير موجود
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          لم يتم العثور على أمر التفصيل المطلوب.
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
        title={`مهمة تصنيع: أمر تفصيل ${toLegacyOrderReference(order.id) ?? ""}`}
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
                دفعات أمر التفصيل {toLegacyOrderReference(order.id)} — حدد
                الدفعة المستهدفة للتشغيل:
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
            <span>
              الأجزاء الأخرى من نفس أمر التفصيل{" "}
              {toLegacyOrderReference(order.id)}
            </span>
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

export function FactoryTaskDetailView(
  props:
    | Parameters<typeof LegacyFactoryTaskDetailView>[0]
    | {
        source: "persisted";
        orderId: string;
        department: ManufacturingDepartment;
      }
    | { source: "quality"; orderId: string },
) {
  if ("source" in props && props.source === "quality")
    return <QualityFactoryTaskRoute orderId={props.orderId} />;
  return "source" in props ? (
    <PersistedFactoryTaskDetailView
      orderId={props.orderId}
      department={props.department}
      key={`${props.department}/${props.orderId}`}
    />
  ) : (
    <LegacyFactoryTaskDetailView {...props} />
  );
}
function PersistedFactoryTaskDetailView({
  orderId,
  department,
}: {
  orderId: string;
  department: ManufacturingDepartment;
}) {
  const query = useManufacturingOrder(department, orderId),
    params = useSearchParams(),
    client = useQueryClient(),
    scope = useManufacturingOperationalScope(department),
    command = useManufacturingCommand(department);
  const { toast } = useToast();
  const [confirmation, setConfirmation] = useState<{
      operation: ManufacturingCommandOperation;
      rows: readonly ManufacturingWorkRow[];
      failure: string | null;
      reviewRequired: boolean;
    } | null>(null),
    [report, setReport] = useState(false),
    [failure, setFailure] = useState<string | null>(null),
    [preparing, setPreparing] = useState(false),
    preparation = useRef<object | null>(null),
    dialogTrigger = useRef<HTMLElement | null>(null);
  const identity = `${scope?.actorId ?? ""}/${String(scope?.accessVersion ?? 0)}/${String(scope?.epoch ?? -1)}/${department}/${orderId}/${params.toString()}`,
    current = useRef(identity);
  current.current = identity;
  const [contextIdentity, setContextIdentity] = useState(identity);
  const visibleConfirmation = useRef(confirmation);
  visibleConfirmation.current = confirmation;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      preparation.current = null;
      visibleConfirmation.current = null;
    };
  }, []);
  if (contextIdentity !== identity) {
    setContextIdentity(identity);
    setConfirmation(null);
    setReport(false);
    setFailure(null);
    preparation.current = null;
    setPreparing(false);
  }
  const valid = () =>
    mounted.current && scope !== null && current.current === identity;
  let rows: readonly ManufacturingWorkRow[] = [],
    selectionFailure: string | null = null;
  if (query.data)
    try {
      const targets = validateManufacturingTaskSelection(query.data, {
        ...(params.get("pieceId")
          ? { pieceId: params.get("pieceId") ?? "" }
          : {}),
        ...(params.get("itemId") ? { itemId: params.get("itemId") ?? "" } : {}),
        ...(params.get("segmentId")
          ? { segmentId: params.get("segmentId") ?? "" }
          : {}),
      });
      rows = targets.length
        ? resolveManufacturingTargets(query.data, targets)
        : [];
    } catch (error: unknown) {
      selectionFailure = manufacturingFailureMessage(
        error,
        "اختيار قطعة المهمة",
      );
    }
  const busy =
    preparing ||
    query.isFetching ||
    query.isError ||
    command.state.phase !== "idle";
  const prepare = (operation: ManufacturingCommandOperation) => {
    if (
      !scope ||
      busy ||
      preparation.current ||
      command.state.phase !== "idle" ||
      !rows.length
    )
      return;
    const captured = Object.freeze(
        rows.map((row) => Object.freeze({ ...row.target })),
      ),
      token = {};
    preparation.current = token;
    dialogTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPreparing(true);
    void fetchManufacturingOrder(client, scope, orderId)
      .then((detail) => {
        const resolved = resolveManufacturingTargets(detail, captured);
        captureManufacturingSelection(operation, department, resolved);
        assertCurrentManufacturingOperationalScope(client, scope);
        if (valid() && preparation.current === token)
          setConfirmation({
            operation,
            rows: freezeManufacturingRows(resolved),
            failure: null,
            reviewRequired: false,
          });
      })
      .catch((error: unknown) => {
        if (valid())
          setFailure(manufacturingFailureMessage(error, "مراجعة قطعة المهمة"));
      })
      .finally(() => {
        if (preparation.current === token) {
          preparation.current = null;
          setPreparing(false);
        }
      });
  };
  const confirm = async () => {
    const captured = confirmation;
    if (!captured || !valid()) return;
    try {
      const result = await command.submit({
        kind: "work",
        department,
        body: {
          commandId: crypto.randomUUID(),
          operation: captured.operation,
          orders: captureManufacturingSelection(
            captured.operation,
            department,
            captured.rows,
          ),
        },
      });
      if (valid() && visibleConfirmation.current === captured) {
        const shouldNotify = command.acknowledge();
        setConfirmation((previous) =>
          previous === captured ? null : previous,
        );
        if (shouldNotify && result.kind === "work")
          toast.success(manufacturingActionSuccessMessage(result.data));
      }
    } catch (error: unknown) {
      if (valid())
        setConfirmation((previous) =>
          previous === captured
            ? {
                ...previous,
                failure: manufacturingFailureMessage(error, "حفظ العمل"),
                reviewRequired: true,
              }
            : previous,
        );
    }
  };
  if (query.isPending) return <p role="status">جارٍ تحميل المهمة…</p>;
  if (!query.data)
    return (
      <div role="alert">
        {manufacturingFailureMessage(query.error, "تحميل المهمة")}
        <button
          onClick={() => {
            void query.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  const role = department === "CUTTING" ? "cutting" : "production";
  const ConfirmationDialog =
    confirmation?.operation === "COMPLETE_TRANSFER"
      ? RecordCompletionDialog
      : ReceiveAndStartDialog;
  return (
    <div className="space-y-3.5">
      <OrientalPageHeader
        title={`مهمة ${query.data.paper.order.businessNumber}`}
        subtitle={`${query.data.paper.order.customerName} · ${department === "CUTTING" ? "القص" : "الإنتاج والإصلاح"}`}
        actions={
          <Link
            className="btn-pill btn-secondary px-3.5! py-1.5! text-xs!"
            href={`/${role}/orders/${orderId}`}
          >
            عرض أمر التفصيل
          </Link>
        }
      />
      <ManufacturingCommandRecovery department={department} />
      {selectionFailure && <p role="alert">{selectionFailure}</p>}
      {failure && <p role="alert">{failure}</p>}
      <ManufacturingRail projection={toManufacturingRail(query.data)} />
      {!rows.length && !selectionFailure && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-bold text-slate-900">
            اختر قطعة لعرض المهمة
          </h2>
          {query.data.paper.order.pieces.map((piece) => (
            <Link
              className="block p-2 text-xs font-semibold text-teal-700 hover:underline"
              key={piece.id}
              href={`/${role}/tasks/${orderId}?pieceId=${piece.id}`}
            >
              القطعة {piece.position} · {piece.model ?? "—"}
            </Link>
          ))}
        </section>
      )}
      <FactoryTaskSummary source="persisted" data={query.data} rows={rows} />
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {rows.every((row) => row.work.allowedActions.canReceiveAndStart) && (
            <button
              disabled={busy}
              className="btn-pill btn-teal px-6! py-1.5! text-sm! font-bold!"
              onClick={() => {
                prepare("RECEIVE_AND_START");
              }}
            >
              استلام وبدء العمل
            </button>
          )}
          {rows.every((row) => row.work.allowedActions.canContinue) && (
            <button
              disabled={busy}
              className="btn-pill btn-outline px-6! py-1.5! text-sm! font-bold!"
              onClick={() => {
                prepare("CONTINUE");
              }}
            >
              متابعة العمل
            </button>
          )}
          {rows.every((row) => row.work.allowedActions.canCompleteTransfer) && (
            <button
              disabled={busy}
              className="btn-pill btn-teal px-6! py-1.5! text-sm! font-bold!"
              onClick={() => {
                prepare("COMPLETE_TRANSFER");
              }}
            >
              إتمام وتحويل
            </button>
          )}
          {rows.length === 1 && rows[0]?.work.allowedActions.canReportIssue && (
            <button
              disabled={busy}
              className="btn-pill btn-outline border-rose-200! px-5! py-1.5! text-sm! font-bold! text-rose-700! hover:bg-rose-50!"
              onClick={() => {
                dialogTrigger.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                setReport(true);
              }}
            >
              تسجيل مشكلة
            </button>
          )}
        </div>
      )}
      <FactoryTaskSpecifications
        source="persisted"
        data={query.data}
        rows={rows}
      />
      {confirmation && (
        <ConfirmationDialog
          returnFocusRef={dialogTrigger}
          source="persisted"
          open
          department={department}
          operation={confirmation.operation}
          rows={confirmation.rows}
          pending={command.state.phase !== "idle"}
          failure={confirmation.failure}
          reviewRequired={confirmation.reviewRequired}
          onClose={() => {
            setConfirmation(null);
          }}
          onReview={async () => {
            try {
              await query.refetch({ throwOnError: true });
              if (valid()) {
                setConfirmation(null);
                setFailure(
                  "تم تحديث المهمة. راجع نفس القطعة ثم افتح تأكيداً جديداً.",
                );
              }
            } catch (error: unknown) {
              if (valid())
                setFailure(manufacturingFailureMessage(error, "تحديث المهمة"));
            }
          }}
          onConfirm={confirm}
        />
      )}
      {report && rows[0] && (
        <PieceReportProblemModal
          returnFocusRef={dialogTrigger}
          source="persisted"
          department={department}
          data={query.data}
          target={rows[0].target}
          onClose={() => {
            setReport(false);
          }}
        />
      )}
    </div>
  );
}

function QualityFactoryTaskRoute({ orderId }: { orderId: string }) {
  const scope = useQualityOperationalScope(),
    params = useSearchParams();
  return (
    <QualityFactoryTaskDetailView
      key={`${scope ? qualityScopeKey(scope).join("/") : "inactive"}/${orderId}/${params.toString()}`}
      orderId={orderId}
    />
  );
}
function QualityFactoryTaskDetailView({ orderId }: { orderId: string }) {
  const query = useQualityOrder(orderId),
    params = useSearchParams(),
    client = useQueryClient(),
    scope = useQualityOperationalScope(),
    command = useQualityCommand();
  const { toast } = useToast();
  const [confirmation, setConfirmation] = useState<{
      operation: QualityCommandOperation;
      rows: readonly QualityWorkRow[];
      failure: string | null;
      reviewRequired: boolean;
    } | null>(null),
    [failure, setFailure] = useState<string | null>(null),
    [preparing, setPreparing] = useState(false),
    preparation = useRef<object | null>(null),
    retryingRead = useRef(false),
    dialogTrigger = useRef<HTMLElement | null>(null),
    mounted = useRef(false);
  const visible = useRef(confirmation);
  useLayoutEffect(() => {
    visible.current = confirmation;
  }, [confirmation]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      preparation.current = null;
      visible.current = null;
    };
  }, []);
  const valid = () =>
    mounted.current &&
    scope !== null &&
    isCurrentQualityOperationalScope(client, scope);
  const idle = () =>
    scope !== null &&
    qualityCommandSessionSchema.parse(
      client.getQueryData([...qualityScopeKey(scope), "command-session"]) ?? {
        phase: "idle",
      },
    ).phase === "idle";
  let rows: readonly QualityWorkRow[] = [],
    selectionFailure: string | null = null;
  if (query.data)
    try {
      const targets = validateQualityTaskSelection(query.data, {
        ...(params.has("pieceId")
          ? { pieceId: params.get("pieceId") ?? "" }
          : {}),
        ...(params.has("itemId") ? { itemId: params.get("itemId") ?? "" } : {}),
        ...(params.has("segmentId")
          ? { segmentId: params.get("segmentId") ?? "" }
          : {}),
      });
      rows = targets.length ? resolveQualityTargets(query.data, targets) : [];
    } catch (error: unknown) {
      selectionFailure = qualityFailureMessage(
        error,
        "اختيار قطعة المهمة",
        undefined,
        "read",
      );
    }
  const eligible = (
    operation: QualityCommandOperation,
    captured: readonly QualityWorkRow[],
  ) => {
    if (operation === "INSPECT") {
      if (
        !captured.length ||
        !captured.every((row) => row.work.allowedActions.canInspect)
      )
        throw new Error("راجع أهلية جميع القطع للفحص.");
    } else captureQualitySelection(operation, captured);
  };
  const readAvailability: QualityReadAvailability =
    query.isPending || query.isFetching
      ? "refreshing"
      : query.isError
        ? "error"
        : "ready";
  const readFailure = query.isError
    ? qualityFailureMessage(query.error, "تحديث المهمة", undefined, "read")
    : null;
  const retryRead = async () => {
    if (!valid() || query.isFetching || retryingRead.current) return;
    retryingRead.current = true;
    try {
      await query.refetch({ throwOnError: false, cancelRefetch: false });
    } catch (error: unknown) {
      if (valid())
        setFailure(
          qualityFailureMessage(error, "تحديث المهمة", undefined, "read"),
        );
    } finally {
      retryingRead.current = false;
    }
  };
  const busy =
    preparing ||
    query.isFetching ||
    query.isError ||
    command.state.phase !== "idle";
  const prepare = async (operation: QualityCommandOperation) => {
    if (!scope || busy || preparation.current || !rows.length || !idle())
      return;
    const targets = rows.map((row) => Object.freeze({ ...row.target })),
      token = {};
    preparation.current = token;
    dialogTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPreparing(true);
    try {
      const detail = await fetchQualityOrder(client, scope, orderId),
        resolved = resolveQualityTargets(detail, targets);
      eligible(operation, resolved);
      assertCurrentQualityOperationalScope(client, scope);
      if (valid() && preparation.current === token && idle())
        setConfirmation({
          operation,
          rows: freezeQualityRows(resolved),
          failure: null,
          reviewRequired: false,
        });
    } catch (error: unknown) {
      if (valid())
        setFailure(
          qualityFailureMessage(error, "مراجعة قطعة المهمة", undefined, "read"),
        );
    } finally {
      if (valid() && preparation.current === token) {
        preparation.current = null;
        setPreparing(false);
      }
    }
  };
  const confirm = async (values?: QualityInspectionFormValues) => {
    const captured = confirmation;
    if (
      !captured ||
      !scope ||
      !valid() ||
      !idle() ||
      captured.reviewRequired ||
      readAvailability !== "ready"
    )
      return;
    try {
      if (captured.operation === "INSPECT" && values === undefined)
        throw new Error("Explicit inspection choices required");
      const body = qualityCommandBodySchema.parse(
        captured.operation === "INSPECT"
          ? {
              commandId: crypto.randomUUID(),
              operation: "INSPECT",
              orders: captureQualityInspection(
                captured.rows,
                values ?? { orders: [] },
              ),
            }
          : {
              commandId: crypto.randomUUID(),
              operation: captured.operation,
              orders: captureQualitySelection(
                captured.operation,
                captured.rows,
              ),
            },
      );
      const result = await command.submit(body);
      assertCurrentQualityOperationalScope(client, scope);
      if (valid() && visible.current === captured) {
        const shouldNotify = command.acknowledge();
        setConfirmation(null);
        if (shouldNotify) toast.success(qualityActionSuccessMessage(result));
      }
    } catch (error: unknown) {
      if (valid() && visible.current === captured)
        setConfirmation({
          ...captured,
          failure: qualityFailureMessage(error, "حفظ الفحص"),
          reviewRequired: true,
        });
      throw error;
    }
  };
  const review = async () => {
    const captured = confirmation;
    if (!captured || !scope || !valid() || !idle() || preparation.current)
      return;
    const token = {};
    preparation.current = token;
    try {
      const data = await fetchQualityOrder(client, scope, orderId),
        fresh = resolveQualityTargets(
          data,
          captured.rows.map((row) => ({
            ...row.target,
            expectedVersion: data.paper.order.version,
          })),
        );
      eligible(captured.operation, fresh);
      assertCurrentQualityOperationalScope(client, scope);
      if (
        valid() &&
        preparation.current === token &&
        visible.current === captured &&
        idle()
      )
        setConfirmation({
          ...captured,
          rows: freezeQualityRows(fresh),
          failure: null,
          reviewRequired: false,
        });
    } catch (error: unknown) {
      if (valid() && visible.current === captured)
        setConfirmation({
          ...captured,
          failure: qualityFailureMessage(
            error,
            "مراجعة جميع القطع",
            undefined,
            "read",
          ),
          reviewRequired: true,
        });
      throw error;
    } finally {
      if (preparation.current === token) preparation.current = null;
    }
  };
  if (!scope) return <QualityCommandRecovery />;
  if (query.isPending)
    return (
      <>
        <QualityCommandRecovery />
        <p role="status">جارٍ تحميل المهمة…</p>
      </>
    );
  if (!query.data)
    return (
      <>
        <QualityCommandRecovery />
        <div role="alert">
          {qualityFailureMessage(
            query.error,
            "تحميل المهمة",
            undefined,
            "read",
          )}
          <button
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </>
    );
  return (
    <div className="space-y-3.5">
      <OrientalPageHeader
        title={`مهمة ${query.data.paper.order.businessNumber}`}
        subtitle={`${query.data.paper.order.customerName} · الجودة والتغليف`}
        actions={
          <Link
            className="btn-pill btn-secondary px-3.5! py-1.5! text-xs!"
            href={`/quality/orders/${orderId}`}
          >
            عرض أمر التفصيل
          </Link>
        }
      />
      <QualityCommandRecovery />
      {query.isFetching && <p role="status">جارٍ تحديث المهمة…</p>}
      {query.isError && (
        <div role="alert">
          {qualityFailureMessage(
            query.error,
            "تحديث المهمة",
            undefined,
            "read",
          )}
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {selectionFailure && <p role="alert">{selectionFailure}</p>}
      {failure && <p role="alert">{failure}</p>}
      <ManufacturingRail projection={toQualityRail(query.data)} />
      {!rows.length && !selectionFailure && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-bold text-slate-900">
            اختر قطعة لعرض المهمة
          </h2>
          {query.data.paper.order.pieces.map((piece) => (
            <Link
              className="block p-2 text-xs font-semibold text-teal-700 hover:underline"
              key={piece.id}
              href={`/quality/tasks/${orderId}?pieceId=${piece.id}`}
            >
              القطعة {piece.position} · {piece.model ?? "—"}
            </Link>
          ))}
        </section>
      )}
      <FactoryTaskSummary source="quality" data={query.data} rows={rows} />
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {rows.every((row) => row.work.allowedActions.canReceiveAndStart) && (
            <button
              className="btn-pill btn-teal px-6! py-1.5! text-sm! font-bold!"
              disabled={busy}
              onClick={() => {
                void prepare("RECEIVE_AND_START");
              }}
            >
              استلام وبدء الفحص
            </button>
          )}
          {rows.every((row) => row.work.allowedActions.canContinue) && (
            <button
              className="btn-pill btn-outline px-6! py-1.5! text-sm! font-bold!"
              disabled={busy}
              onClick={() => {
                void prepare("CONTINUE");
              }}
            >
              متابعة الفحص
            </button>
          )}
          {rows.every((row) => row.work.allowedActions.canInspect) && (
            <button
              className="btn-pill btn-teal px-6! py-1.5! text-sm! font-bold!"
              disabled={busy}
              onClick={() => {
                void prepare("INSPECT");
              }}
            >
              تسجيل نتيجة الفحص
            </button>
          )}
          {rows.every((row) => row.work.allowedActions.canReportIssue) && (
            <button
              className="btn-pill btn-outline border-rose-200! px-5! py-1.5! text-sm! font-bold! text-rose-700! hover:bg-rose-50!"
              disabled={busy}
              onClick={() => {
                void prepare("REPORT_ISSUES");
              }}
            >
              تسجيل مشكلة
            </button>
          )}
        </div>
      )}
      <FactoryTaskSpecifications
        source="quality"
        data={query.data}
        rows={rows}
      />
      {confirmation && (
        <QualityTaskConfirmation
          confirmation={confirmation}
          pending={command.state.phase !== "idle"}
          readAvailability={readAvailability}
          readFailure={readFailure}
          onReadRetry={retryRead}
          returnFocusRef={dialogTrigger}
          onClose={() => {
            visible.current = null;
            setConfirmation(null);
          }}
          onReview={review}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
function QualityTaskConfirmation({
  confirmation,
  pending,
  readAvailability,
  readFailure,
  onReadRetry,
  returnFocusRef,
  onClose,
  onReview,
  onConfirm,
}: {
  confirmation: {
    operation: QualityCommandOperation;
    rows: readonly QualityWorkRow[];
    failure: string | null;
    reviewRequired: boolean;
  };
  pending: boolean;
  readAvailability: QualityReadAvailability;
  readFailure: string | null;
  onReadRetry: () => Promise<void>;
  returnFocusRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onReview: () => Promise<void>;
  onConfirm: (values?: QualityInspectionFormValues) => Promise<void>;
}) {
  const dialog = {
    source: "quality" as const,
    rows: confirmation.rows,
    open: true,
    onClose,
    pending,
    readAvailability,
    readFailure,
    onReadRetry,
    failure: confirmation.failure,
    reviewRequired: confirmation.reviewRequired,
    onReview,
  };
  if (confirmation.operation === "REPORT_ISSUES")
    return (
      <PieceReportProblemModal
        source="quality"
        rows={confirmation.rows}
        readAvailability={readAvailability}
        readFailure={readFailure}
        onReadRetry={onReadRetry}
        onClose={onClose}
        returnFocusRef={returnFocusRef}
      />
    );
  if (confirmation.operation === "INSPECT")
    return confirmation.rows.length === 1 && confirmation.rows[0] ? (
      <QualityInspectPieceModal
        {...dialog}
        row={confirmation.rows[0]}
        onConfirm={onConfirm}
        returnFocusRef={returnFocusRef}
      />
    ) : (
      <QualityInspectionDialog
        {...dialog}
        onConfirm={onConfirm}
        returnFocusRef={returnFocusRef}
      />
    );
  return (
    <ReceiveAndStartDialog
      {...dialog}
      operation={confirmation.operation}
      onConfirm={() => onConfirm()}
      returnFocusRef={returnFocusRef}
    />
  );
}
