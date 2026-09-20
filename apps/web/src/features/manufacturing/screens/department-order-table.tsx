"use client";

import { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CheckSquare,
  Clock,
  Eye,
  Scissors,
  Send,
  X,
} from "lucide-react";
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

export function DepartmentOrderTable({
  orders,
  deptRole,
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
  const [activeTab, setActiveTab] = useState<
    "ready" | "in_progress" | "completed" | "problems"
  >(() => {
    if (pathname.includes("/in-progress")) return "in_progress";
    if (pathname.includes("/returned") || pathname.includes("/problems"))
      return "problems";
    if (
      pathname.includes("/completed") ||
      pathname.includes("/sent") ||
      pathname.includes("/inspected") ||
      pathname.includes("/delivered")
    )
      return "completed";
    return "ready";
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedPieceKeys, setSelectedPieceKeys] = useState<string[]>([]);

  const [allPiecesModalOrder, setAllPiecesModalOrder] =
    useState<MvpOrder | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

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
  const notArrivedYetCount = Math.max(
    0,
    totalPiecesCount -
      arrivedAtDeptCount -
      completedPieces.length -
      problemPieces.length,
  );
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
    const selectedRows = activeTabRows.filter((r) =>
      selectedPieceKeys.includes(r.id),
    );
    // Group by orderId
    const byOrder: Record<string, string[]> = {};
    selectedRows.forEach((r) => {
      (byOrder[r.order.id] ??= []).push(r.piece.id);
    });

    Object.entries(byOrder).forEach(([orderId, pieceIds]) => {
      store.startPieceWork(orderId, pieceIds, currentWorker, deptRoleName);
    });

    showToast(
      `تم بدء العمل بنجاح على ${String(selectedPieceKeys.length)} قطع بواسطة ${currentWorker}`,
    );
    setSelectedPieceKeys([]);
  };

  // Batch action: Complete & Transfer selected
  const handleBatchCompleteTransfer = () => {
    if (selectedPieceKeys.length === 0) return;
    const selectedRows = activeTabRows.filter((r) =>
      selectedPieceKeys.includes(r.id),
    );
    const byOrder: Record<string, string[]> = {};
    selectedRows.forEach((r) => {
      (byOrder[r.order.id] ??= []).push(r.piece.id);
    });

    Object.entries(byOrder).forEach(([orderId, pieceIds]) => {
      const firstPiece = selectedRows.find(
        (r) => r.order.id === orderId,
      )?.piece;
      const target = firstPiece
        ? getNextDeptForPiece(deptRole, firstPiece)
        : { nextStage: "الإنتاج والإصلاح", label: "القسم التالي" };
      store.completeAndTransferPieces(
        orderId,
        pieceIds,
        target.nextStage,
        `إنجاز من ${deptRoleName}`,
      );
    });

    showToast(
      `تم إنجاز ${String(selectedPieceKeys.length)} قطع وتحويلها إلى المرحلة التالية بنجاح`,
    );
    setSelectedPieceKeys([]);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="animate-in fade-in flex items-center justify-between rounded-xl bg-emerald-700 px-4 py-3 text-xs text-white shadow-md transition">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => {
              setToastMessage(null);
            }}
            className="text-emerald-200 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. Context Summary At Top */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col items-start justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Boxes size={16} className="text-teal-700" />
              <span>الموقف التشغيلي لقطع الأوامر في {deptRoleName}</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              تتبع تفصيلي لكل قطعة حذاء مستقلة — وحدة العمل الأساسية هي قطعة
              واحدة (الكمية: ١)
            </p>
          </div>
          {firstOrder && (
            <button
              type="button"
              onClick={() => {
                setAllPiecesModalOrder(firstOrder);
              }}
              className="btn-pill btn-secondary inline-flex items-center gap-1.5 text-xs"
            >
              <Eye size={13} />
              <span>عرض جميع قطع أمر {firstOrder.id}</span>
            </button>
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

      {/* 2. Four Working Status Tabs Inside Department */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab("ready");
            setSelectedPieceKeys([]);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "ready"
              ? "bg-teal-700 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Clock size={14} />
          <span>جاهزة للعمل</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "ready" ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"}`}
          >
            {readyPieces.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("in_progress");
            setSelectedPieceKeys([]);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "in_progress"
              ? "bg-teal-700 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Scissors size={14} />
          <span>جاري العمل</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "in_progress" ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"}`}
          >
            {inProgressPieces.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("completed");
            setSelectedPieceKeys([]);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "completed"
              ? "bg-teal-700 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <CheckCircle2 size={14} />
          <span>المنجز والمحوّل</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "completed" ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"}`}
          >
            {completedPieces.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("problems");
            setSelectedPieceKeys([]);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "problems"
              ? "bg-rose-700 text-white shadow-sm"
              : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
          }`}
        >
          <AlertTriangle size={14} />
          <span>المشكلات والمحالات</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "problems" ? "bg-rose-900 text-rose-100" : "bg-rose-100 text-rose-800"}`}
          >
            {problemPieces.length}
          </span>
        </button>
      </div>

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
            {activeTab === "ready" && (
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
            {activeTab === "in_progress" && (
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
        allPiecesModalOrder={allPiecesModalOrder}
        onSelectOrder={setAllPiecesModalOrder}
        activeTab={activeTab}
        selectedPieceKeys={selectedPieceKeys}
        onToggleSelect={handleToggleSelect}
        deptRole={deptRole}
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
        showToast={showToast}
      />
    </div>
  );
}
