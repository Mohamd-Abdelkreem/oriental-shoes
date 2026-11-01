"use client";

import Link from "next/link";
import {
  CheckSquare,
  Square,
  MinusSquare,
  ChevronDown,
  Eye,
} from "lucide-react";
import {
  typeLabels,
  formatPieceSequence,
} from "@/features/prototype/state/mvp-store";
import {
  OrientalStatusPill,
  statusTone,
} from "@/features/prototype/components/data-table";
import { getDeptLocation } from "./get-dept-location";
import { getDeptSpecsSummary } from "./get-dept-specs-summary";
import { DepartmentPieceActions } from "./department-piece-actions";
import type { PieceTableRow } from "./piece-table-row";
import type {
  DepartmentPieceContext,
  OrderPieceGroup,
  PieceModalTarget,
} from "./department-piece-table-types";

type PieceCardProps = {
  row: PieceTableRow;
  context: DepartmentPieceContext;
  selectedPieceKeys: string[];
  onToggleSelect: (key: string) => void;
  onInspectPiece: (target: PieceModalTarget) => void;
  onReportProblem: (target: PieceModalTarget) => void;
};

function DepartmentPieceCard({
  row,
  context,
  selectedPieceKeys,
  onToggleSelect,
  onInspectPiece,
  onReportProblem,
}: PieceCardProps) {
  const { deptRole } = context;
  const isPieceSelected = selectedPieceKeys.includes(row.id);
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        isPieceSelected
          ? "border-teal-300 bg-teal-50/40"
          : "border-slate-200/70 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onToggleSelect(row.id);
          }}
          className="p-0.5 text-slate-400 hover:text-slate-700"
        >
          {isPieceSelected ? (
            <CheckSquare size={16} className="text-teal-700" />
          ) : (
            <Square size={16} />
          )}
        </button>

        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">
          {row.piece.pieceNumber || formatPieceSequence(row.pieceIndex)}
        </span>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              {row.piece.model}
            </span>
            <span className="text-xs font-semibold text-slate-600">
              مقاس {row.piece.size}
            </span>
            <OrientalStatusPill
              tone={statusTone(row.piece.deptStatus || "جاهزة للعمل")}
            >
              {row.piece.deptStatus || "جاهزة للعمل"}
            </OrientalStatusPill>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {getDeptSpecsSummary(deptRole, row.piece)}
          </p>
        </div>
      </div>

      {/* Preserve the grouped layout's existing controls while sharing the renderer. */}
      <DepartmentPieceActions
        row={row}
        context={{ ...context, actionButtonLabel: undefined }}
        appearance="card"
        onInspectPiece={onInspectPiece}
        onReportProblem={onReportProblem}
      />
    </div>
  );
}

type Props = Omit<PieceCardProps, "row"> & {
  group: OrderPieceGroup;
  expandedOrderIds: Set<string>;
  toggleOrder: (orderId: string) => void;
  onToggleOrderSelection: (rows: PieceTableRow[]) => void;
  onStartWork: (group: OrderPieceGroup, rows: PieceTableRow[]) => void;
  onCompleteTransfer: (group: OrderPieceGroup, rows: PieceTableRow[]) => void;
  onWarehouseReceipt: (group: OrderPieceGroup, rows: PieceTableRow[]) => void;
};

const orderActionLabels = {
  cutting: { start: "بدء قص الأمر", complete: "إنهاء القص والتحويل للإنتاج" },
  production: {
    start: "بدء تركيب الأمر",
    complete: "إنهاء التركيب والتحويل للجودة",
  },
  quality: { start: "بدء فحص وتغليف الأمر", complete: "قبول وإرسال للمستودع" },
  warehouse: { start: "بدء تشغيل الأمر", complete: "إنهاء وتحويل الأمر" },
};

export function DepartmentOrderCard({
  group,
  context,
  expandedOrderIds,
  selectedPieceKeys,
  toggleOrder,
  onToggleOrderSelection,
  onToggleSelect,
  onStartWork,
  onCompleteTransfer,
  onWarehouseReceipt,
  onInspectPiece,
  onReportProblem,
}: Props) {
  const { deptRole, onAction, activeTab } = context;
  const targetLocation = getDeptLocation(deptRole);
  const isExpanded = expandedOrderIds.has(group.order.id);
  const rowIds = group.rows.map((row) => row.id);
  const isAllSelected =
    rowIds.length > 0 && rowIds.every((id) => selectedPieceKeys.includes(id));
  const isSomeSelected =
    !isAllSelected && rowIds.some((id) => selectedPieceKeys.includes(id));

  const hasProblem = group.rows.some(
    (row) => row.piece.deptStatus === "بها مشكلة" || Boolean(row.piece.problem),
  );

  const readyPiecesInOrder = group.rows.filter(
    (row) =>
      row.piece.currentLocation === targetLocation &&
      row.piece.deptStatus !== "جاري العمل" &&
      row.piece.deptStatus !== "جاري الفحص" &&
      row.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة",
  );
  const canBatchStart =
    !onAction &&
    (activeTab === "ready" || activeTab === "problems") &&
    readyPiecesInOrder.length > 0;

  const inProgressPiecesInOrder = group.rows.filter(
    (row) =>
      row.piece.currentLocation === targetLocation &&
      (row.piece.deptStatus === "جاري العمل" ||
        row.piece.deptStatus === "جاري الفحص"),
  );
  const canBatchComplete =
    !onAction &&
    activeTab === "in_progress" &&
    inProgressPiecesInOrder.length > 0;

  const pendingWarehouseInOrder = group.rows.filter(
    (row) =>
      deptRole === "warehouse" &&
      row.piece.currentLocation === "في المستودع" &&
      row.piece.deptStatus !== "مكتملة",
  );
  const canWarehouseBatchReceive =
    !onAction && deptRole === "warehouse" && pendingWarehouseInOrder.length > 0;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white transition-all ${
        isExpanded
          ? "border-teal-300 shadow-xs"
          : "border-slate-200/80 shadow-2xs hover:border-slate-300"
      }`}
    >
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
        className={`cursor-pointer p-3.5 transition-colors select-none sm:p-4 ${
          isExpanded ? "bg-teal-50/30" : "hover:bg-slate-50/70"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleOrderSelection(group.rows);
              }}
              className="mt-0.5 p-0.5 text-slate-400 hover:text-slate-700 focus:outline-none"
              title="تحديد كل قطع هذا الأمر"
            >
              {isAllSelected ? (
                <CheckSquare size={17} className="text-teal-700" />
              ) : isSomeSelected ? (
                <MinusSquare size={17} className="text-teal-600" />
              ) : (
                <Square size={17} />
              )}
            </button>

            <div
              className={`mt-1 flex h-4 w-4 items-center justify-center text-slate-400 transition-transform duration-200 ${
                isExpanded ? "rotate-180 text-teal-800" : ""
              }`}
            >
              <ChevronDown size={15} />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <Link
                  href={`/${deptRole}/orders/${group.order.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="font-mono font-bold text-teal-800 hover:underline"
                >
                  {group.order.id}
                </Link>
                <span className="text-slate-300">·</span>
                <span className="font-bold text-slate-800">
                  {group.order.customer || group.order.customerName}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {typeLabels[group.order.type]}
                </span>
                {hasProblem && (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    مشكلة
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {group.rows.length}{" "}
                  {group.rows.length === 1 ? "حذاء" : "أحذية"}:
                </span>
                <span>
                  {group.rows.map((row, rowIndex) => (
                    <span key={row.id}>
                      {rowIndex > 0 && " · "}
                      <span className="font-medium text-slate-700">
                        {row.piece.model}
                      </span>{" "}
                      <span className="text-slate-500">
                        (مقاس {row.piece.size})
                      </span>
                    </span>
                  ))}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">
                  التسليم: {group.order.deliveryDate || group.order.delivery}
                </span>
              </div>
            </div>
          </div>

          <div className="mr-auto flex items-center gap-2 sm:mr-0">
            {canBatchStart && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartWork(group, readyPiecesInOrder);
                }}
                className="btn-pill btn-teal px-3 py-1.5 text-xs font-bold whitespace-nowrap shadow-2xs"
              >
                {orderActionLabels[deptRole].start} ({readyPiecesInOrder.length}
                )
              </button>
            )}

            {canBatchComplete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCompleteTransfer(group, inProgressPiecesInOrder);
                }}
                className="btn-pill btn-teal px-3 py-1.5 text-xs font-bold whitespace-nowrap shadow-2xs"
              >
                {orderActionLabels[deptRole].complete} (
                {inProgressPiecesInOrder.length})
              </button>
            )}

            {canWarehouseBatchReceive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onWarehouseReceipt(group, pendingWarehouseInOrder);
                }}
                className="btn-pill bg-emerald-700 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white shadow-2xs hover:bg-emerald-800"
              >
                استلام بالمستودع ({pendingWarehouseInOrder.length})
              </button>
            )}

            <Link
              href={`/${deptRole}/orders/${group.order.id}`}
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700"
              title="عرض تفاصيل الطلب"
            >
              <Eye size={15} />
            </Link>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-3 sm:p-4">
          {group.rows.map((row) => (
            <DepartmentPieceCard
              key={row.id}
              row={row}
              context={context}
              selectedPieceKeys={selectedPieceKeys}
              onToggleSelect={onToggleSelect}
              onInspectPiece={onInspectPiece}
              onReportProblem={onReportProblem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
