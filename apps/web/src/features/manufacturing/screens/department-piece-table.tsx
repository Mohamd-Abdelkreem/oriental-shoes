"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CheckSquare, Square, Inbox, LayoutGrid, List } from "lucide-react";
import {
  useMvpStore,
  formatPieceSequence,
} from "@/features/prototype/state/mvp-store";
import { roleUsers } from "@/features/prototype/fixtures/prototype-data";

import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
  type Column,
} from "@/features/prototype/components/data-table";
import { getDeptArabicName } from "./get-dept-arabic-name";
import type { PieceTableRow } from "./piece-table-row";
import { getNextDept } from "./get-next-dept";
import { getDeptSpecsSummary } from "./get-dept-specs-summary";
import { PieceLocationBadge } from "./piece-location-badge";
import { PieceReportProblemModal } from "./piece-report-problem-modal";
import { QualityInspectPieceModal } from "./quality-inspect-piece-modal";
import { useToast } from "@/components/toast";
import { DepartmentPieceActions } from "./department-piece-actions";
import { DepartmentOrderCard } from "./department-order-card";
import type {
  DepartmentPieceContext,
  DepartmentPieceTableProps,
  PieceModalTarget,
  OrderPieceGroup,
} from "./department-piece-table-types";

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
}: DepartmentPieceTableProps) {
  const store = useMvpStore();
  const { toast } = useToast();
  const deptRoleName = getDeptArabicName(deptRole);
  const currentWorker = roleUsers[deptRole].name || "فني القسم";

  const [problemModalData, setProblemModalData] =
    useState<PieceModalTarget | null>(null);

  const [qualityInspectData, setQualityInspectData] =
    useState<PieceModalTarget | null>(null);

  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");

  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );

  const groupedOrders = useMemo(() => {
    const groups: OrderPieceGroup[] = [];
    const groupsByOrderId = new Map<string, OrderPieceGroup>();

    for (const row of rows) {
      let group = groupsByOrderId.get(row.order.id);
      if (!group) {
        group = {
          order: row.order,
          rows: [],
        };
        groupsByOrderId.set(row.order.id, group);
        groups.push(group);
      }
      group.rows.push(row);
    }

    return groups;
  }, [rows]);

  const allExpanded =
    groupedOrders.length > 0 &&
    groupedOrders.every((group) => expandedOrderIds.has(group.order.id));

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedOrderIds(new Set());
    } else {
      setExpandedOrderIds(
        new Set(groupedOrders.map((group) => group.order.id)),
      );
    }
  };

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

  const handleToggleOrderSelection = (orderRows: PieceTableRow[]) => {
    const rowIds = orderRows.map((row) => row.id);
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

  const handleOrderStartWork = (
    group: OrderPieceGroup,
    readyRows: PieceTableRow[],
  ) => {
    if (readyRows.length === 0) return;
    const pieceIds = readyRows.map((row) => row.piece.id);
    store.startPieceWork(group.order.id, pieceIds, currentWorker, deptRoleName);
    const startAction =
      deptRole === "cutting"
        ? "قص"
        : deptRole === "production"
          ? "تركيب وتجميع"
          : deptRole === "quality"
            ? "فحص"
            : "العمل على";
    toast.info(
      `تم بدء ${startAction} أمر ${group.order.id} (${String(pieceIds.length)} قطع)`,
    );
  };

  const handleOrderCompleteTransfer = (
    group: OrderPieceGroup,
    inProgressRows: PieceTableRow[],
  ) => {
    if (inProgressRows.length === 0) return;

    inProgressRows.forEach((row) => {
      const target = getNextDept(deptRole);
      store.completeAndTransferPieces(
        group.order.id,
        [row.piece.id],
        target.nextStage,
        `إنجاز من ${deptRoleName}`,
      );
    });

    const completionMessage =
      deptRole === "cutting"
        ? `تم إنهاء قص أمر ${group.order.id} (${String(inProgressRows.length)} قطع) وتحويله للإنتاج بنجاح`
        : deptRole === "production"
          ? `تم إنهاء تركيب أمر ${group.order.id} (${String(inProgressRows.length)} قطع) وتحويله للجودة بنجاح`
          : deptRole === "quality"
            ? `تم قبول أمر ${group.order.id} (${String(inProgressRows.length)} قطع) وإرساله للمستودع بنجاح`
            : `تم إنجاز وتحويل أمر ${group.order.id} (${String(inProgressRows.length)} قطع) بنجاح`;

    toast.success(completionMessage);
  };

  const handleWarehouseOrderReceive = (
    group: OrderPieceGroup,
    pendingWarehouse: PieceTableRow[],
  ) => {
    if (pendingWarehouse.length === 0) return;

    pendingWarehouse.forEach((row) => {
      store.receiveWarehousePiece(group.order.id, row.piece.id);
    });
    toast.success(
      `تم تأكيد استلام أمر ${group.order.id} (${String(pendingWarehouse.length)} قطع) بالمستودع`,
    );
  };

  const pieceContext: DepartmentPieceContext = {
    deptRole,
    activeTab,
    stageName,
    actionButtonLabel,
    onAction,
  };
  const columns: Column<PieceTableRow>[] = [
    {
      header: "تحديد",
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(row.id);
          }}
          className="p-1 text-slate-400 hover:text-slate-800"
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
      header: "رقم القطعة",
      render: (row) => (
        <div className="font-mono text-xs font-bold text-slate-800">
          {row.piece.pieceNumber || formatPieceSequence(row.pieceIndex)}
        </div>
      ),
    },
    {
      header: "أمر التفصيل والعميل",
      render: (row) => (
        <div className="text-xs">
          <Link
            href={`/${deptRole}/orders/${row.order.id}`}
            className="font-mono font-bold text-teal-800 hover:underline"
          >
            {row.order.id}
          </Link>
          <span className="mr-2 font-medium text-slate-800">
            {row.order.customer || row.order.customerName}
          </span>
        </div>
      ),
    },
    {
      header: "الموديل والمقاس",
      render: (row) => (
        <div className="text-xs">
          <span className="font-bold text-slate-900">{row.piece.model}</span>
          <span className="mr-1.5 font-semibold text-slate-500">
            مقاس {row.piece.size}
          </span>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {getDeptSpecsSummary(deptRole, row.piece)}
          </p>
        </div>
      ),
    },
    {
      header: "المكان الحالي",
      render: (row) => (
        <PieceLocationBadge location={row.piece.currentLocation} />
      ),
    },
    {
      header: "الحالة بالقسم",
      render: (row) => (
        <OrientalStatusPill
          tone={statusTone(row.piece.deptStatus || "جاهزة للعمل")}
        >
          {row.piece.deptStatus || "جاهزة للعمل"}
        </OrientalStatusPill>
      ),
    },
    {
      header: "الإجراءات",
      render: (row) => (
        <DepartmentPieceActions
          row={row}
          context={pieceContext}
          appearance="table"
          onInspectPiece={setQualityInspectData}
          onReportProblem={setProblemModalData}
        />
      ),
    },
  ];

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-2xs">
        <Inbox size={36} className="mb-2.5 text-slate-300" />
        <h3 className="text-sm font-bold text-slate-700">
          {emptyTitle || "لا توجد أوامر في هذا القسم حالياً"}
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">
          {emptySubtitle || "تظهر الأوامر والقطع تلقائياً فور تحويلها إلى هنا"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <span>
          {groupedOrders.length} {groupedOrders.length === 1 ? "أمر" : "أوامر"}{" "}
          تفصيل ·{" "}
          <strong className="font-bold text-slate-700">{rows.length}</strong>{" "}
          قطعة حذاء
        </span>

        <div className="flex items-center gap-3">
          {viewMode === "grouped" && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-semibold text-teal-800 transition-colors hover:text-teal-950"
            >
              {allExpanded ? "طي تفاصيل الكل" : "توسيع تفاصيل الكل"}
            </button>
          )}

          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setViewMode("grouped");
              }}
              className={`rounded p-1 transition-colors ${
                viewMode === "grouped"
                  ? "bg-white text-teal-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-700"
              }`}
              title="عرض مجمّع بالأوامر"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("flat");
              }}
              className={`rounded p-1 transition-colors ${
                viewMode === "flat"
                  ? "bg-white text-teal-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-700"
              }`}
              title="عرض جدول القطع"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "grouped" ? (
        <div className="space-y-2.5">
          {groupedOrders.map((group) => (
            <DepartmentOrderCard
              key={group.order.id}
              group={group}
              context={pieceContext}
              expandedOrderIds={expandedOrderIds}
              selectedPieceKeys={selectedPieceKeys}
              toggleOrder={toggleOrder}
              onToggleOrderSelection={handleToggleOrderSelection}
              onToggleSelect={onToggleSelect}
              onStartWork={handleOrderStartWork}
              onCompleteTransfer={handleOrderCompleteTransfer}
              onWarehouseReceipt={handleWarehouseOrderReceive}
              onInspectPiece={setQualityInspectData}
              onReportProblem={setProblemModalData}
            />
          ))}
        </div>
      ) : (
        /* Flat Table View */
        <OrientalTable<PieceTableRow>
          data={rows}
          keyExtractor={(row) => row.id}
          pageSize={10}
          emptyTitle={emptyTitle || "لا توجد قطع في هذا القسم"}
          emptySubtitle=""
          columns={columns}
        />
      )}

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
