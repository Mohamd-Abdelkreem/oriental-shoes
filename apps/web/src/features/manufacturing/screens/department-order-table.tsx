"use client";

import { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { CheckSquare, Scissors, Send } from "lucide-react";
import {
  useMvpStore,
  type MvpOrder,
  type QuantitySegment,
  type Role,
  type Stage,
} from "@/features/prototype/state/mvp-store";
import { roleUsers } from "@/features/prototype/fixtures/prototype-data";
import {
  FilterSelect,
  OrientalFilterBar,
} from "@/features/prototype/components/filter-bar";

import { getDeptLocation } from "./get-dept-location";
import { getDeptArabicName } from "./get-dept-arabic-name";
import type { PieceTableRow } from "./piece-table-row";
import { getNextDeptForPiece } from "./get-next-dept-for-piece";
import { DepartmentPieceTable } from "./department-piece-table";
import { DepartmentOrderSummary } from "./department-order-summary";
import {
  DepartmentOrderTabs,
  type DepartmentTab,
} from "./department-order-tabs";
import { useToast } from "@/components/toast";

export function DepartmentOrderTable({
  orders,
  deptRole,
  stageName,
  actionButtonLabel,
  onAction,
  emptyTitle,
  emptySubtitle,
}: {
  orders: MvpOrder[];
  deptRole: Exclude<Role, "admin" | "sales" | "approval">;
  stageName: Stage;
  actionButtonLabel?: string | undefined;
  onAction?: ((order: MvpOrder, segment?: QuantitySegment) => void) | undefined;
  emptyTitle?: string | undefined;
  emptySubtitle?: string | undefined;
}) {
  const pathname = usePathname();
  const store = useMvpStore();
  const firstOrder = orders[0];
  const targetLocation = getDeptLocation(deptRole);
  const deptRoleName = getDeptArabicName(deptRole);
  const currentWorker = roleUsers[deptRole].name || "فني القسم";

  // Active Tab: 4 working statuses inside departments
  const [activeTab, setActiveTab] = useState<DepartmentTab>(() => {
    if (pathname.includes("/in-progress")) return "in_progress";
    if (
      pathname.includes("/returned") ||
      pathname.includes("/problems") ||
      pathname.includes("/delivery-failed")
    )
      return "problems";
    if (
      pathname.includes("/completed") ||
      pathname.includes("/sent") ||
      pathname.includes("/inspected") ||
      pathname.includes("/delivered") ||
      pathname.includes("/warehouse/ready") ||
      pathname.includes("/warehouse/incomplete") ||
      pathname.includes("/out-for-delivery")
    )
      return "completed";
    return "ready";
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedPieceKeys, setSelectedPieceKeys] = useState<string[]>([]);

  const { toast } = useToast();

  // Extract all pieces belonging to the provided orders
  const allDeptPieces = useMemo(() => {
    const list: PieceTableRow[] = [];
    for (const order of orders) {
      const activePieces = order.items.filter((p) => !p.isDeleted);
      activePieces.forEach((piece, idx) => {
        list.push({
          id: `${order.id}-${piece.id}`,
          order,
          piece,
          pieceIndex: idx,
          totalPiecesInOrder: activePieces.length,
          currentLocation: piece.currentLocation || "في القص",
          deptStatus: piece.deptStatus || "جاهزة للعمل",
          lastUpdate: piece.problem?.reportedAt || order.created || "اليوم",
        });
      });
    }
    return list;
  }, [orders]);

  // Separate pieces into 4 tab buckets:
  // 1. Ready to work in this department
  const readyPieces = useMemo(() => {
    return allDeptPieces.filter((row) => {
      if (row.currentLocation !== targetLocation) return false;
      const st = row.piece.deptStatus;
      return !st || st === "جاهزة للعمل" || st === "جاهزة للفحص";
    });
  }, [allDeptPieces, targetLocation]);

  // 2. In progress in this department
  const inProgressPieces = useMemo(() => {
    return allDeptPieces.filter((row) => {
      if (row.currentLocation !== targetLocation) return false;
      const st = row.piece.deptStatus;
      return st === "جاري العمل" || st === "جاري الفحص";
    });
  }, [allDeptPieces, targetLocation]);

  // 3. Completed & transferred to subsequent stages
  const completedPieces = useMemo(() => {
    return allDeptPieces.filter((row) => {
      if (
        row.piece.deptStatus === "مكتملة" ||
        row.piece.deptStatus === "مجازة ومغلفة"
      )
        return true;
      if (deptRole === "cutting") {
        return [
          "في الإنتاج",
          "في العمليات الخاصة",
          "في الجودة",
          "في المستودع",
          "تم التسليم",
        ].includes(row.currentLocation);
      }
      if (deptRole === "production") {
        return ["في الجودة", "في المستودع", "تم التسليم"].includes(
          row.currentLocation,
        );
      }
      if (deptRole === "special") {
        return ["في الجودة", "في المستودع", "تم التسليم"].includes(
          row.currentLocation,
        );
      }
      if (deptRole === "quality") {
        return ["في المستودع", "تم التسليم"].includes(row.currentLocation);
      }
      return ["تم الاستلام", "تم التسليم"].includes(row.currentLocation);
    });
  }, [allDeptPieces, deptRole]);

  // 4. Problems & Rejections
  const problemPieces = useMemo(() => {
    return allDeptPieces.filter((row) => {
      if (row.currentLocation === "لدى الاعتماد بسبب مشكلة") return true;
      if (
        row.piece.deptStatus === "بها مشكلة" ||
        row.piece.deptStatus === "مرتجعة للتصحيح"
      )
        return true;
      if (
        row.piece.problem &&
        row.piece.problem.reportedByDept.includes(deptRoleName)
      )
        return true;
      if (
        row.piece.rejection &&
        row.piece.rejection.responsibleDept.includes(deptRoleName)
      )
        return true;
      return false;
    });
  }, [allDeptPieces, deptRoleName]);

  // Context summary calculations
  const totalPiecesCount = allDeptPieces.length;
  const arrivedAtDeptCount = readyPieces.length + inProgressPieces.length;
  const accountedPieceIds = new Set(
    [
      ...readyPieces,
      ...inProgressPieces,
      ...completedPieces,
      ...problemPieces,
    ].map((row) => row.id),
  );
  const notArrivedYetCount = allDeptPieces.filter(
    (row) => !accountedPieceIds.has(row.id),
  ).length;
  const problemCount = problemPieces.length;

  // Active Tab rows
  const activeTabRows = useMemo(() => {
    let source = readyPieces;
    if (activeTab === "in_progress") source = inProgressPieces;
    else if (activeTab === "completed") source = completedPieces;
    else if (activeTab === "problems") source = problemPieces;

    return source.filter((r) => {
      if (typeFilter !== "ALL" && r.order.type !== typeFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        r.order.id.toLowerCase().includes(q) ||
        (r.order.customer || r.order.customerName || "")
          .toLowerCase()
          .includes(q) ||
        r.piece.model.toLowerCase().includes(q) ||
        (r.piece.pieceNumber || "").toLowerCase().includes(q) ||
        (r.piece.responsibleWorker || "").toLowerCase().includes(q)
      );
    });
  }, [
    activeTab,
    readyPieces,
    inProgressPieces,
    completedPieces,
    problemPieces,
    typeFilter,
    search,
  ]);

  // Selection helpers
  const handleToggleSelect = (key: string) => {
    setSelectedPieceKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  // Batch action: Start Work on selected
  const handleBatchStartWork = () => {
    if (selectedPieceKeys.length === 0) return;
    const selectedRows = activeTabRows.filter(
      (r) =>
        selectedPieceKeys.includes(r.id) &&
        r.piece.currentLocation === targetLocation &&
        r.piece.deptStatus !== "جاري العمل" &&
        r.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة",
    );
    if (selectedRows.length === 0) {
      toast.error("القطع المحددة غير متواجدة بالقسم لبدء العمل عليها");
      return;
    }
    // Group by orderId
    const byOrder: Record<string, string[]> = {};
    selectedRows.forEach((r) => {
      (byOrder[r.order.id] ??= []).push(r.piece.id);
    });

    Object.entries(byOrder).forEach(([orderId, pieceIds]) => {
      store.startPieceWork(orderId, pieceIds, currentWorker, deptRoleName);
    });

    toast.info(
      `تم بدء العمل بنجاح على ${String(selectedRows.length)} قطع بواسطة ${currentWorker}`,
    );
    setSelectedPieceKeys([]);
  };

  // Batch action: Complete & Transfer selected
  const handleBatchCompleteTransfer = () => {
    if (selectedPieceKeys.length === 0) return;

    const selectedRows = activeTabRows.filter(
      (row) =>
        selectedPieceKeys.includes(row.id) &&
        row.piece.currentLocation === targetLocation &&
        row.piece.deptStatus === "جاري العمل",
    );
    if (selectedRows.length === 0) {
      toast.error("القطع المحددة غير جاهزة للتحويل من هذا القسم");
      return;
    }

    const transferGroups = new Map<
      string,
      { orderId: string; pieceIds: string[]; nextStage: string }
    >();
    selectedRows.forEach((row) => {
      const { nextStage } = getNextDeptForPiece(deptRole, row.piece);
      const groupKey = row.order.id + ":" + nextStage;
      const group = transferGroups.get(groupKey);
      if (group) {
        group.pieceIds.push(row.piece.id);
      } else {
        transferGroups.set(groupKey, {
          orderId: row.order.id,
          pieceIds: [row.piece.id],
          nextStage,
        });
      }
    });

    transferGroups.forEach(({ orderId, pieceIds, nextStage }) => {
      store.completeAndTransferPieces(
        orderId,
        pieceIds,
        nextStage,
        "إنجاز من " + deptRoleName,
      );
    });

    toast.success(
      "تم إنجاز " +
        String(selectedRows.length) +
        " قطع وتحويلها إلى المرحلة التالية بنجاح",
    );
    setSelectedPieceKeys([]);
  };

  return (
    <div className="space-y-4">
      <DepartmentOrderSummary
        firstOrder={firstOrder}
        deptRole={deptRole}
        deptRoleName={deptRoleName}
        totalPiecesCount={totalPiecesCount}
        arrivedAtDeptCount={arrivedAtDeptCount}
        notArrivedYetCount={notArrivedYetCount}
        problemCount={problemCount}
      />

      <DepartmentOrderTabs
        activeTab={activeTab}
        readyCount={readyPieces.length}
        inProgressCount={inProgressPieces.length}
        completedCount={completedPieces.length}
        problemCount={problemCount}
        onSelect={(tab) => {
          setActiveTab(tab);
          setSelectedPieceKeys([]);
        }}
      />

      {/* 3. Filter Bar */}
      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="البحث برقم أمر التفصيل، العميل، الموديل، الموظف المسؤول..."
        totalCount={
          activeTab === "ready"
            ? readyPieces.length
            : activeTab === "in_progress"
              ? inProgressPieces.length
              : activeTab === "completed"
                ? completedPieces.length
                : problemPieces.length
        }
        filteredCount={activeTabRows.length}
        countLabel="قطعة حذاء"
      >
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "ALL", label: "جميع أنواع الأوامر" },
            { value: "SHOP", label: "تفصيل محل" },
            { value: "EXTERNAL", label: "تفصيل خارجي" },
            { value: "REPAIR", label: "أمر إصلاح" },
          ]}
        />
      </OrientalFilterBar>

      {/* 4. Batch Selection Actions Bar */}
      {selectedPieceKeys.length > 0 && (
        <div className="animate-in fade-in flex flex-col items-start justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
            <CheckSquare size={16} className="text-teal-700" />
            <span>تم تحديد {selectedPieceKeys.length} قطع حذاء</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(activeTab === "ready" || activeTab === "problems") && (
              <button
                type="button"
                onClick={handleBatchStartWork}
                className="btn-pill btn-teal inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shadow-sm"
              >
                <Scissors size={14} />
                <span>
                  بدء العمل على القطع المحددة ({selectedPieceKeys.length})
                </span>
              </button>
            )}
            {(activeTab === "in_progress" || activeTab === "problems") && (
              <button
                type="button"
                onClick={handleBatchCompleteTransfer}
                className="btn-pill btn-teal inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shadow-sm"
              >
                <Send size={14} />
                <span>
                  إنهاء المحدد وإرساله للمرحلة التالية (
                  {selectedPieceKeys.length})
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedPieceKeys([]);
              }}
              className="btn-pill btn-secondary px-2.5 py-1 text-xs"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      <DepartmentPieceTable
        rows={activeTabRows}
        activeTab={activeTab}
        selectedPieceKeys={selectedPieceKeys}
        onToggleSelect={handleToggleSelect}
        deptRole={deptRole}
        stageName={stageName}
        actionButtonLabel={actionButtonLabel}
        onAction={onAction}
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
      />
    </div>
  );
}
