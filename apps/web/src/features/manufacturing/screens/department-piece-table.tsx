"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Eye,
  Square,
  MinusSquare,
  ChevronDown,
  ChevronUp,
  Scissors,
  Send,
  Layers,
  Package,
  Calendar,
  User,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import {
  useMvpStore,
  typeLabels,
  formatPieceSequence,
  type MvpOrder,
  type ProductLine,
  type Role,
  type QuantitySegment,
  type Stage,
} from "@/features/prototype/state/mvp-store";
import { roleUsers } from "@/features/prototype/fixtures/prototype-data";

import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
  type Column,
} from "@/features/prototype/components/data-table";
import { getDeptLocation } from "./get-dept-location";
import { getDeptArabicName } from "./get-dept-arabic-name";
import type { PieceTableRow } from "./piece-table-row";
import { getNextDept } from "./get-next-dept";
import { getDeptSpecsSummary } from "./get-dept-specs-summary";
import { PieceLocationBadge } from "./piece-location-badge";
import { PieceReportProblemModal } from "./piece-report-problem-modal";
import { QualityInspectPieceModal } from "./quality-inspect-piece-modal";
import { useToast } from "@/components/toast";

export function DepartmentPieceTable({
  rows,
  activeTab,
  selectedPieceKeys,
  onToggleSelect,
  onToggleSelectMultiple,
  deptRole,
  stageName,
  actionButtonLabel,
  onAction,
  emptyTitle,
  emptySubtitle,
}: {
  rows: PieceTableRow[];
  activeTab: "ready" | "in_progress" | "completed" | "problems";
  selectedPieceKeys: string[];
  onToggleSelect: (key: string) => void;
  onToggleSelectMultiple?:
    ((keys: string[], select: boolean) => void) | undefined;
  deptRole: Exclude<Role, "admin" | "sales" | "approval">;
  stageName: Stage;
  actionButtonLabel?: string | undefined;
  onAction?: ((order: MvpOrder, segment?: QuantitySegment) => void) | undefined;
  emptyTitle?: string | undefined;
  emptySubtitle?: string | undefined;
}) {
  const store = useMvpStore();
  const { toast } = useToast();
  const targetLocation = getDeptLocation(deptRole);
  const deptRoleName = getDeptArabicName(deptRole);
  const currentWorker = roleUsers[deptRole].name || "فني القسم";

  const [problemModalData, setProblemModalData] = useState<{
    order: MvpOrder;
    piece: ProductLine;
  } | null>(null);

  const [qualityInspectData, setQualityInspectData] = useState<{
    order: MvpOrder;
    piece: ProductLine;
  } | null>(null);

  // View mode: Grouped by Orders (default as requested) or Flat Pieces Table
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");

  // Track expanded order IDs
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Group pieces by their order
  const groupedOrders = useMemo(() => {
    const groups: {
      order: MvpOrder;
      rows: PieceTableRow[];
      totalPiecesInOrder: number;
    }[] = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const row of rows) {
      let group = map.get(row.order.id);
      if (!group) {
        group = {
          order: row.order,
          rows: [],
          totalPiecesInOrder: row.totalPiecesInOrder,
        };
        map.set(row.order.id, group);
        groups.push(group);
      }
      group.rows.push(row);
    }

    return groups;
  }, [rows]);

  const toggleOrder = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedOrderIds(new Set(groupedOrders.map((g) => g.order.id)));
  };

  const handleCollapseAll = () => {
    setExpandedOrderIds(new Set());
  };

  // Toggle selection for all pieces of a specific order
  const handleToggleOrderSelection = (
    orderId: string,
    orderRows: PieceTableRow[],
  ) => {
    const rowIds = orderRows.map((r) => r.id);
    const isAllSelected =
      rowIds.length > 0 && rowIds.every((id) => selectedPieceKeys.includes(id));
    const willSelect = !isAllSelected;

    if (onToggleSelectMultiple) {
      onToggleSelectMultiple(rowIds, willSelect);
    } else {
      rowIds.forEach((id) => {
        const isSelected = selectedPieceKeys.includes(id);
        if (willSelect && !isSelected) onToggleSelect(id);
        else if (!willSelect && isSelected) onToggleSelect(id);
      });
    }
  };

  // Quick Action: Start work on all ready pieces in an order
  const handleOrderStartWork = (group: {
    order: MvpOrder;
    rows: PieceTableRow[];
  }) => {
    const readyRows = group.rows.filter(
      (r) =>
        r.piece.currentLocation === targetLocation &&
        r.piece.deptStatus !== "جاري العمل" &&
        r.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة",
    );
    if (readyRows.length === 0) return;
    const pieceIds = readyRows.map((r) => r.piece.id);
    store.startPieceWork(group.order.id, pieceIds, currentWorker, deptRoleName);
    toast.info(
      `تم بدء العمل على جميع قطع أمر ${group.order.id} (${String(pieceIds.length)} قطع) بواسطة ${currentWorker}`,
    );
  };

  // Quick Action: Complete and transfer all in-progress pieces in an order
  const handleOrderCompleteTransfer = (group: {
    order: MvpOrder;
    rows: PieceTableRow[];
  }) => {
    const inProgressRows = group.rows.filter(
      (r) =>
        r.piece.currentLocation === targetLocation &&
        r.piece.deptStatus === "جاري العمل",
    );
    if (inProgressRows.length === 0) return;

    inProgressRows.forEach((r) => {
      const target = getNextDept(deptRole);
      store.completeAndTransferPieces(
        group.order.id,
        [r.piece.id],
        target.nextStage,
        `إنجاز من ${deptRoleName}`,
      );
    });
    toast.success(
      `تم إنجاز وتحويل جميع قطع أمر ${group.order.id} (${String(inProgressRows.length)} قطع) بنجاح`,
    );
  };

  // Shared piece table columns definition
  const columns: Column<PieceTableRow>[] = useMemo(
    () => [
      {
        header: "تحديد",
        render: (row) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(row.id);
            }}
            className="p-1 text-slate-500 hover:text-slate-800"
          >
            {selectedPieceKeys.includes(row.id) ? (
              <CheckSquare size={16} className="text-teal-700" />
            ) : (
              <Square size={16} />
            )}
          </button>
        ),
      },
      {
        header: "رقم القطعة والتسلسل",
        render: (row) => (
          <div className="space-y-1">
            <span className="inline-block rounded border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-950">
              {row.piece.pieceNumber || formatPieceSequence(row.pieceIndex)}
            </span>
            <span className="block text-[10px] text-slate-400">
              القطعة {row.pieceIndex + 1} من {row.totalPiecesInOrder}
            </span>
          </div>
        ),
      },
      {
        header: "أمر التفصيل والعميل",
        render: (row) => (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/${deptRole}/orders/${row.order.id}`}
                className="font-mono font-bold text-teal-800 hover:underline"
                title="عرض تفاصيل وتتبع أمر التفصيل"
              >
                {row.order.id}
              </Link>
              <span className="py-0.2 rounded bg-slate-100 px-1.5 text-[10px] text-slate-700">
                {typeLabels[row.order.type]}
              </span>
            </div>
            <strong className="block text-slate-800">
              {row.order.customer || row.order.customerName}
            </strong>
            <span className="block text-[10px] text-slate-500">
              التسليم: {row.order.deliveryDate || row.order.delivery}
            </span>
          </div>
        ),
      },
      {
        header: "الموديل والمواصفات الفنية",
        render: (row) => (
          <div className="max-w-[220px] space-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <strong className="font-mono font-bold text-slate-900">
                {row.piece.model}
              </strong>
              <span className="py-0.2 rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-800">
                مقاس {row.piece.size}
              </span>
            </div>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-600">
              {getDeptSpecsSummary(deptRole, row.piece)}
            </p>
          </div>
        ),
      },
      {
        header: "مكان القطعة الآن",
        render: (row) => (
          <div className="space-y-1">
            <PieceLocationBadge location={row.piece.currentLocation} />
          </div>
        ),
      },
      {
        header: "حالة التشغيل بالقسم",
        render: (row) => (
          <div className="space-y-1">
            <OrientalStatusPill
              tone={statusTone(row.piece.deptStatus || "جاهزة للعمل")}
            >
              {row.piece.deptStatus || "جاهزة للعمل"}
            </OrientalStatusPill>
            {row.piece.problem && (
              <span className="block rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                مشكلة: {row.piece.problem.reason}
              </span>
            )}
          </div>
        ),
      },
      {
        header: "الموظف المسؤول",
        render: (row) => (
          <div className="text-xs">
            {row.piece.responsibleWorker ? (
              <span className="font-medium text-indigo-700">
                {row.piece.responsibleWorker}
              </span>
            ) : (
              <span className="text-slate-400">غير معين</span>
            )}
          </div>
        ),
      },
      {
        header: "الإجراءات المتاحة",
        render: (row) => {
          const target = getNextDept(deptRole);
          return (
            <div className="flex flex-col gap-1.5">
              {actionButtonLabel && onAction && (
                <button
                  type="button"
                  onClick={() => {
                    const segment = row.order.segments.findLast(
                      (item) =>
                        item.itemId === row.piece.id &&
                        item.stage === stageName,
                    );
                    onAction(row.order, segment);
                  }}
                  className="btn-pill btn-teal justify-center px-2.5 py-1 text-xs font-bold whitespace-nowrap"
                >
                  {actionButtonLabel}
                </button>
              )}
              {/* Ready or Returned/Problem Action: Start work */}
              {!onAction &&
                (activeTab === "ready" ||
                  activeTab === "problems" ||
                  row.piece.deptStatus === "مرتجعة للتصحيح") &&
                row.piece.currentLocation === targetLocation &&
                row.piece.deptStatus !== "جاري العمل" &&
                row.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة" && (
                  <button
                    type="button"
                    onClick={() => {
                      store.startPieceWork(
                        row.order.id,
                        [row.piece.id],
                        currentWorker,
                        deptRoleName,
                      );
                      toast.info(
                        `تم بدء العمل على ${row.piece.pieceNumber || "القطعة"} بواسطة ${currentWorker}`,
                      );
                    }}
                    className="btn-pill btn-teal justify-center px-2.5 py-1 text-xs font-bold whitespace-nowrap"
                  >
                    بدء العمل
                  </button>
                )}

              {/* In Progress Action: Complete & Transfer */}
              {!onAction &&
                (activeTab === "in_progress" ||
                  (activeTab === "problems" &&
                    row.piece.deptStatus === "جاري العمل")) &&
                row.piece.currentLocation === targetLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      store.completeAndTransferPieces(
                        row.order.id,
                        [row.piece.id],
                        target.nextStage,
                        `إنجاز من ${deptRoleName}`,
                      );
                      toast.success(
                        `تم إنجاز ${row.piece.pieceNumber || "القطعة"} وتحويلها إلى ${target.label}`,
                      );
                    }}
                    className="btn-pill btn-teal justify-center px-2.5 py-1 text-xs font-bold whitespace-nowrap"
                  >
                    إنهاء وتحويل
                  </button>
                )}

              {/* Quality Inspection Action */}
              {!onAction &&
                deptRole === "quality" &&
                row.piece.currentLocation === "في الجودة" && (
                  <button
                    type="button"
                    onClick={() => {
                      setQualityInspectData({
                        order: row.order,
                        piece: row.piece,
                      });
                    }}
                    className="btn-pill justify-center bg-teal-800 px-2.5 py-1 text-xs whitespace-nowrap text-white hover:bg-teal-900"
                  >
                    فحص الجودة
                  </button>
                )}

              {/* Warehouse Receive Action */}
              {!onAction &&
                deptRole === "warehouse" &&
                row.piece.currentLocation === "في المستودع" &&
                row.piece.deptStatus !== "مكتملة" && (
                  <button
                    type="button"
                    onClick={() => {
                      store.receiveWarehousePiece(row.order.id, row.piece.id);
                      toast.success(
                        `تم تأكيد استلام ${row.piece.pieceNumber || "القطعة"} بالمستودع`,
                      );
                    }}
                    className="btn-pill justify-center bg-emerald-700 px-2.5 py-1 text-xs whitespace-nowrap text-white hover:bg-emerald-800"
                  >
                    تأكيد الاستلام بالمستودع
                  </button>
                )}

              {/* Report Problem button */}
              {row.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة" &&
                row.piece.currentLocation !== "في المستودع" &&
                row.piece.currentLocation !== "تم التسليم" && (
                  <button
                    type="button"
                    onClick={() => {
                      setProblemModalData({
                        order: row.order,
                        piece: row.piece,
                      });
                    }}
                    className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-center text-[11px] whitespace-nowrap text-rose-700 hover:bg-rose-100 hover:text-rose-900"
                  >
                    تسجيل مشكلة
                  </button>
                )}

              {/* View All Pieces button */}
              <Link
                href={`/${deptRole}/orders/${row.order.id}`}
                className="btn-pill btn-secondary inline-flex items-center justify-center gap-1 px-2 py-1 text-xs whitespace-nowrap"
                title="عرض جميع قطع هذا الأمر وتفاصيل الطلب بالكامل"
              >
                <Eye size={12} />
                <span>عرض جميع قطع الأمر</span>
              </Link>
            </div>
          );
        },
      },
    ],
    [
      onToggleSelect,
      selectedPieceKeys,
      deptRole,
      actionButtonLabel,
      onAction,
      activeTab,
      targetLocation,
      store,
      currentWorker,
      deptRoleName,
      toast,
      stageName,
    ],
  );

  // Empty state handling
  if (rows.length === 0) {
    return (
      <div className="oriental-table-card flex flex-col items-center justify-center p-12 text-center">
        <Inbox size={40} className="mb-3 text-slate-300" />
        <h3 className="text-sm font-bold text-slate-800">
          {emptyTitle ||
            `لا توجد أوامر في تبويب ${activeTab === "ready" ? "جاهزة للعمل" : activeTab === "in_progress" ? "جاري العمل" : activeTab === "completed" ? "المنجز والمحوّل" : "المشكلات"}`}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {emptySubtitle ||
            "تظهر أوامر وقطع الأحذية المعتمدة والمحولة إلى هذا القسم تلقائياً"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 1. Top Control Bar */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Layers size={16} className="text-teal-700" />
          <span>
            عرض{" "}
            <strong className="text-teal-900">{groupedOrders.length}</strong>{" "}
            أمر تفصيل (تضم{" "}
            <strong className="text-teal-900">{rows.length}</strong> قطعة حذاء)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "grouped" && (
            <>
              <button
                type="button"
                onClick={handleExpandAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-100 hover:text-slate-900"
                title="توسيع وفتح جميع الأوامر"
              >
                <ChevronDown size={14} />
                <span>توسيع الكل</span>
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-100 hover:text-slate-900"
                title="طي وإغلاق جميع الأوامر"
              >
                <ChevronUp size={14} />
                <span>طي الكل</span>
              </button>
            </>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => {
                setViewMode("grouped");
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                viewMode === "grouped"
                  ? "bg-teal-700 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              مجمّع بالأوامر
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("flat");
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                viewMode === "flat"
                  ? "bg-teal-700 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              جدول القطع
            </button>
          </div>
        </div>
      </div>

      {/* 2. Grouped Orders View */}
      {viewMode === "grouped" ? (
        <div className="space-y-3">
          {groupedOrders.map((group) => {
            const isExpanded = expandedOrderIds.has(group.order.id);
            const rowIds = group.rows.map((r) => r.id);
            const isAllSelected =
              rowIds.length > 0 &&
              rowIds.every((id) => selectedPieceKeys.includes(id));
            const isSomeSelected =
              !isAllSelected &&
              rowIds.some((id) => selectedPieceKeys.includes(id));

            // Has problem?
            const hasProblem = group.rows.some(
              (r) =>
                r.piece.deptStatus === "بها مشكلة" || Boolean(r.piece.problem),
            );

            // Quick actions eligibility
            const readyPiecesInOrder = group.rows.filter(
              (r) =>
                r.piece.currentLocation === targetLocation &&
                r.piece.deptStatus !== "جاري العمل" &&
                r.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة",
            );
            const canBatchStart =
              !onAction &&
              (activeTab === "ready" || activeTab === "problems") &&
              readyPiecesInOrder.length > 0;

            const inProgressPiecesInOrder = group.rows.filter(
              (r) =>
                r.piece.currentLocation === targetLocation &&
                r.piece.deptStatus === "جاري العمل",
            );
            const canBatchComplete =
              !onAction &&
              (activeTab === "in_progress" || activeTab === "problems") &&
              inProgressPiecesInOrder.length > 0;

            return (
              <div
                key={group.order.id}
                className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs transition-all duration-200 hover:border-teal-300 hover:shadow-sm"
              >
                {/* Order Row Header: Aligned, fixed-height, strict horizontal spacing */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    toggleOrder(group.order.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleOrder(group.order.id);
                    }
                  }}
                  className={`flex min-h-[62px] cursor-pointer items-center justify-between gap-4 px-4 py-3 transition-colors select-none ${
                    isExpanded
                      ? "border-b border-teal-200/80 bg-teal-50/70"
                      : "bg-white hover:bg-slate-50/90"
                  }`}
                >
                  {/* Right Side: Checkbox, Arrow, Order ID, Customer, Delivery, Models, Count */}
                  <div className="flex shrink-0 items-center gap-3.5">
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleOrderSelection(group.order.id, group.rows);
                      }}
                      className="p-1 text-slate-500 transition-colors hover:text-teal-800 focus:outline-none"
                      title={
                        isAllSelected
                          ? "إلغاء تحديد كل قطع هذا الأمر"
                          : "تحديد كل قطع هذا الأمر"
                      }
                    >
                      {isAllSelected ? (
                        <CheckSquare size={18} className="text-teal-700" />
                      ) : isSomeSelected ? (
                        <MinusSquare size={18} className="text-teal-600" />
                      ) : (
                        <Square
                          size={18}
                          className="text-slate-400 hover:text-slate-600"
                        />
                      )}
                    </button>

                    {/* Expand/Collapse Chevron Indicator */}
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-transform duration-200 ${
                        isExpanded
                          ? "rotate-180 bg-teal-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <ChevronDown size={16} />
                    </div>

                    {/* Order Code & Type Badge */}
                    <div className="flex min-w-[170px] items-center gap-2">
                      <Link
                        href={`/${deptRole}/orders/${group.order.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="font-mono text-sm font-bold text-teal-800 hover:underline"
                        title="عرض صفحة وتفاصيل أمر التفصيل"
                      >
                        {group.order.id}
                      </Link>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-slate-700">
                        {typeLabels[group.order.type]}
                      </span>
                    </div>

                    <span className="h-4 w-px shrink-0 bg-slate-200" />

                    {/* Customer */}
                    <div className="flex max-w-[160px] min-w-[130px] items-center gap-1.5 text-xs">
                      <User size={14} className="shrink-0 text-slate-400" />
                      <strong
                        className="truncate text-slate-800"
                        title={group.order.customer || group.order.customerName}
                      >
                        {group.order.customer || group.order.customerName}
                      </strong>
                    </div>

                    <span className="h-4 w-px shrink-0 bg-slate-200" />

                    {/* Delivery Date */}
                    <div className="flex min-w-[140px] items-center gap-1.5 text-xs whitespace-nowrap text-slate-600">
                      <Calendar size={13} className="shrink-0 text-slate-400" />
                      <span>
                        التسليم:{" "}
                        {group.order.deliveryDate || group.order.delivery}
                      </span>
                    </div>

                    {/* Pieces Count Badge */}
                    <div className="min-w-[130px] whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-900">
                        <Package size={13} className="shrink-0 text-teal-700" />
                        <span>{group.rows.length} قطعة في القسم</span>
                        {group.totalPiecesInOrder > group.rows.length && (
                          <span className="text-[10px] font-normal text-teal-600">
                            (من {group.totalPiecesInOrder})
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Problem Alert Badge if any */}
                    {hasProblem && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-rose-700">
                        <AlertTriangle size={12} />
                        <span>مشكلة</span>
                      </span>
                    )}
                  </div>

                  {/* Left Side: Button (بدء العمل على جميع قطع الأمر) + View Order + Expand Toggle */}
                  <div className="mr-auto flex shrink-0 items-center gap-2.5">
                    {/* Action Button: Exact label requested by the user */}
                    {canBatchStart && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOrderStartWork(group);
                        }}
                        className="btn-pill btn-teal inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shadow-xs hover:shadow"
                      >
                        <Scissors size={14} />
                        <span>بدء العمل على جميع قطع الأمر</span>
                      </button>
                    )}

                    {canBatchComplete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOrderCompleteTransfer(group);
                        }}
                        className="btn-pill btn-teal inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shadow-xs hover:shadow"
                      >
                        <Send size={14} />
                        <span>إنهاء وتحويل جميع قطع الأمر</span>
                      </button>
                    )}

                    {/* View full order detail link */}
                    <Link
                      href={`/${deptRole}/orders/${group.order.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="btn-pill btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap"
                      title="عرض تفاصيل وتتبع أمر التفصيل بالكامل"
                    >
                      <Eye size={13} />
                      <span>تتبع الأمر</span>
                    </Link>
                  </div>
                </div>

                {/* Inner Pieces Table when Expanded */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/50 p-3 sm:p-4">
                    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
                      <OrientalTable<PieceTableRow>
                        data={group.rows}
                        keyExtractor={(row) => row.id}
                        pageSize={100}
                        emptyTitle="لا توجد قطع في هذا الأمر"
                        emptySubtitle=""
                        columns={columns}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* 3. Flat Pieces Table View */
        <OrientalTable<PieceTableRow>
          data={rows}
          keyExtractor={(row) => row.id}
          pageSize={10}
          emptyTitle={
            emptyTitle ||
            `لا توجد قطع في تبويب ${activeTab === "ready" ? "جاهزة للعمل" : activeTab === "in_progress" ? "جاري العمل" : activeTab === "completed" ? "المنجز والمحوّل" : "المشكلات"}`
          }
          emptySubtitle={
            emptySubtitle ||
            "تظهر قطع الأحذية المعتمدة والمحولة إلى هذا القسم تلقائياً"
          }
          columns={columns}
        />
      )}

      {/* Modals */}
      {problemModalData && (
        <PieceReportProblemModal
          order={problemModalData.order}
          piece={problemModalData.piece}
          deptName={deptRoleName}
          workerName={currentWorker}
          onClose={() => {
            setProblemModalData(null);
          }}
        />
      )}

      {qualityInspectData && (
        <QualityInspectPieceModal
          order={qualityInspectData.order}
          piece={qualityInspectData.piece}
          onClose={() => {
            setQualityInspectData(null);
          }}
        />
      )}
    </div>
  );
}
