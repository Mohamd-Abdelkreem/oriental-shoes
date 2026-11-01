"use client";

import { orderTypeOptions } from "@/features/orders/order-types";
import { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import type {
  MvpOrder,
  QuantitySegment,
  Role,
  Stage,
} from "@/features/prototype/state/mvp-store";
import {
  FilterSelect,
  OrientalFilterBar,
} from "@/features/prototype/components/filter-bar";

import { getDeptLocation } from "./get-dept-location";
import { getDeptArabicName } from "./get-dept-arabic-name";
import type { PieceTableRow } from "./piece-table-row";
import { DepartmentPieceTable } from "./department-piece-table";
import { DeliveryFailedDialog } from "@/features/prototype/components/delivery-failed-dialog";
import {
  DepartmentOrderTabs,
  type DepartmentTab,
} from "./department-order-tabs";
import { DepartmentBatchActions } from "./department-batch-actions";
import { useDepartmentBatchActions } from "./use-department-batch-actions";

export function DepartmentOrderTable({
  orders,
  deptRole,
  stageName,
  actionButtonLabel,
  onAction,
  emptyTitle,
  emptySubtitle,
  forcedTab,
  hideTabs = false,
}: {
  orders: MvpOrder[];
  deptRole: Exclude<Role, "admin" | "sales" | "approval">;
  stageName: Stage;
  actionButtonLabel?: string | undefined;
  onAction?: ((order: MvpOrder, segment?: QuantitySegment) => void) | undefined;
  emptyTitle?: string | undefined;
  emptySubtitle?: string | undefined;
  forcedTab?: DepartmentTab | undefined;
  hideTabs?: boolean | undefined;
}) {
  const pathname = usePathname();
  const targetLocation = getDeptLocation(deptRole);
  const deptRoleName = getDeptArabicName(deptRole);

  const defaultTab: DepartmentTab = useMemo(() => {
    if (forcedTab) return forcedTab;
    if (pathname.includes("/in-progress") || pathname.includes("/inspection"))
      return "in_progress";
    if (
      pathname.includes("/returned") ||
      pathname.includes("/problems") ||
      pathname.includes("/reinspection") ||
      pathname.includes("/corrections") ||
      pathname.includes("/delivery-failed")
    )
      return "problems";
    if (
      pathname.includes("/completed") ||
      pathname.includes("/sent") ||
      pathname.includes("/inspected") ||
      pathname.includes("/accepted") ||
      pathname.includes("/delivered") ||
      pathname.includes("/warehouse/ready") ||
      pathname.includes("/warehouse/incomplete") ||
      pathname.includes("/out-for-delivery")
    )
      return "completed";
    return "ready";
  }, [forcedTab, pathname]);

  const [tabState, setTabState] = useState({
    defaultTab,
    selectedTab: defaultTab,
  });
  const activeTab =
    tabState.defaultTab === defaultTab ? tabState.selectedTab : defaultTab;
  if (tabState.defaultTab !== defaultTab) {
    setTabState({ defaultTab, selectedTab: defaultTab });
  }

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedPieceKeys, setSelectedPieceKeys] = useState<string[]>([]);

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

  const readyPieces = useMemo(() => {
    return allDeptPieces.filter((row) => {
      if (row.currentLocation !== targetLocation) return false;
      const st = row.piece.deptStatus;
      return !st || st === "جاهزة للعمل" || st === "جاهزة للفحص";
    });
  }, [allDeptPieces, targetLocation]);

  const inProgressPieces = useMemo(() => {
    return allDeptPieces.filter((row) => {
      if (row.currentLocation !== targetLocation) return false;
      const st = row.piece.deptStatus;
      return st === "جاري العمل" || st === "جاري الفحص";
    });
  }, [allDeptPieces, targetLocation]);

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
      if (deptRole === "quality") {
        return ["في المستودع", "تم التسليم"].includes(row.currentLocation);
      }
      return ["تم الاستلام", "تم التسليم"].includes(row.currentLocation);
    });
  }, [allDeptPieces, deptRole]);

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

  const problemCount = problemPieces.length;

  const activeTabRows = useMemo(() => {
    let source = readyPieces;
    if (deptRole === "warehouse") {
      source = allDeptPieces;
    } else if (activeTab === "in_progress") {
      source = inProgressPieces;
    } else if (activeTab === "completed") {
      source = completedPieces;
    } else if (activeTab === "problems") {
      source = problemPieces;
    }

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
    deptRole,
    allDeptPieces,
    readyPieces,
    inProgressPieces,
    completedPieces,
    problemPieces,
    typeFilter,
    search,
  ]);

  const batchActions = useDepartmentBatchActions({
    rows: activeTabRows,
    selectedPieceKeys,
    deptRole,
    onClearSelection: () => {
      setSelectedPieceKeys([]);
    },
  });

  const handleToggleSelect = (key: string) => {
    setSelectedPieceKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleToggleSelectMultiple = (keys: string[], select: boolean) => {
    setSelectedPieceKeys((prev) => {
      if (select) {
        return Array.from(new Set([...prev, ...keys]));
      } else {
        return prev.filter((k) => !keys.includes(k));
      }
    });
  };

  return (
    <div className="space-y-4">
      {!hideTabs && (
        <DepartmentOrderTabs
          activeTab={activeTab}
          readyCount={readyPieces.length}
          inProgressCount={inProgressPieces.length}
          completedCount={completedPieces.length}
          problemCount={problemCount}
          onSelect={(tab) => {
            setTabState({ defaultTab, selectedTab: tab });
            setSelectedPieceKeys([]);
          }}
        />
      )}

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
            ...orderTypeOptions,
          ]}
        />
      </OrientalFilterBar>

      <DepartmentBatchActions
        activeTab={activeTab}
        deptRole={deptRole}
        pathname={pathname}
        selectedCount={selectedPieceKeys.length}
        actions={batchActions}
        onClearSelection={() => {
          setSelectedPieceKeys([]);
        }}
      />

      <DepartmentPieceTable
        rows={activeTabRows}
        activeTab={activeTab}
        selectedPieceKeys={selectedPieceKeys}
        onToggleSelect={handleToggleSelect}
        onToggleSelectMultiple={handleToggleSelectMultiple}
        deptRole={deptRole}
        stageName={stageName}
        actionButtonLabel={actionButtonLabel}
        onAction={onAction}
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
      />

      {batchActions.deliveryFailedModalOpen && (
        <DeliveryFailedDialog
          open={true}
          onClose={batchActions.closeDeliveryFailedDialog}
          orderId={batchActions.selectedOrderIds.join(" ، ")}
          onConfirm={batchActions.handleBatchDeliveryFailed}
        />
      )}
    </div>
  );
}
