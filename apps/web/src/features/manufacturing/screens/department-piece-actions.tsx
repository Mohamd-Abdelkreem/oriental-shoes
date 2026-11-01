"use client";

import { useToast } from "@/components/toast";
import { roleUsers } from "@/features/prototype/fixtures/prototype-data";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { getDeptArabicName } from "./get-dept-arabic-name";
import { getDeptLocation } from "./get-dept-location";
import { getNextDept } from "./get-next-dept";
import type { PieceTableRow } from "./piece-table-row";
import type {
  DepartmentPieceContext,
  PieceModalTarget,
} from "./department-piece-table-types";

type Props = {
  row: PieceTableRow;
  context: DepartmentPieceContext;
  appearance: "table" | "card";
  onInspectPiece: (target: PieceModalTarget) => void;
  onReportProblem: (target: PieceModalTarget) => void;
};

export function DepartmentPieceActions({
  row,
  context,
  appearance,
  onInspectPiece,
  onReportProblem,
}: Props) {
  const { deptRole, activeTab, stageName, onAction, actionButtonLabel } =
    context;
  const store = useMvpStore();
  const { toast } = useToast();
  const targetLocation = getDeptLocation(deptRole);
  const deptRoleName = getDeptArabicName(deptRole);
  const currentWorker = roleUsers[deptRole].name || "فني القسم";
  const target = getNextDept(deptRole);
  const primaryButtonClassName =
    appearance === "card"
      ? "btn-pill btn-teal px-3 py-1 text-xs font-bold"
      : "btn-pill btn-teal px-2.5 py-1 text-xs font-bold";
  return (
    <div
      className={
        appearance === "card"
          ? "mr-auto flex items-center gap-1.5 sm:mr-0"
          : "flex items-center gap-1.5"
      }
    >
      {actionButtonLabel && onAction && (
        <button
          type="button"
          onClick={() => {
            const segment = row.order.segments.findLast(
              (candidateSegment) =>
                candidateSegment.itemId === row.piece.id &&
                candidateSegment.stage === stageName,
            );
            onAction(row.order, segment);
          }}
          className={primaryButtonClassName}
        >
          {actionButtonLabel}
        </button>
      )}

      {!onAction &&
        deptRole !== "quality" &&
        deptRole !== "warehouse" &&
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
              toast.info(`تم بدء العمل على القطعة`);
            }}
            className={primaryButtonClassName}
          >
            بدء العمل
          </button>
        )}

      {!onAction &&
        deptRole !== "warehouse" &&
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
              toast.success(`تم إنجاز القطعة وتحويلها إلى ${target.label}`);
            }}
            className={primaryButtonClassName}
          >
            إنهاء وتحويل
          </button>
        )}

      {!onAction &&
        deptRole === "quality" &&
        row.piece.currentLocation === "في الجودة" && (
          <button
            type="button"
            onClick={() => {
              onInspectPiece({
                order: row.order,
                piece: row.piece,
              });
            }}
            className={
              appearance === "card"
                ? "btn-pill bg-teal-800 px-3 py-1 text-xs font-bold text-white hover:bg-teal-900"
                : "btn-pill bg-teal-800 px-2.5 py-1 text-xs text-white hover:bg-teal-900"
            }
          >
            فحص الجودة
          </button>
        )}

      {!onAction &&
        deptRole === "warehouse" &&
        activeTab === "ready" &&
        row.piece.currentLocation === "في المستودع" &&
        row.piece.deptStatus !== "مكتملة" && (
          <button
            type="button"
            onClick={() => {
              store.receiveWarehousePiece(row.order.id, row.piece.id);
              toast.success(`تم تأكيد استلام القطعة بالمستودع`);
            }}
            className={
              appearance === "card"
                ? "btn-pill bg-emerald-700 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-800"
                : "btn-pill bg-emerald-700 px-2.5 py-1 text-xs text-white hover:bg-emerald-800"
            }
          >
            استلام بالمستودع
          </button>
        )}

      {deptRole !== "warehouse" &&
        row.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة" &&
        row.piece.currentLocation !== "في المستودع" &&
        row.piece.currentLocation !== "تم التسليم" && (
          <button
            type="button"
            onClick={() => {
              onReportProblem({
                order: row.order,
                piece: row.piece,
              });
            }}
            className={
              appearance === "card"
                ? "px-2 py-1 text-xs text-rose-600 hover:text-rose-800"
                : "px-1.5 py-1 text-xs text-rose-600 hover:text-rose-800"
            }
          >
            {appearance === "card" ? "تسجيل مشكلة" : "مشكلة"}
          </button>
        )}
    </div>
  );
}
