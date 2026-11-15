"use client";
import Link from "next/link";
import { Eye } from "lucide-react";
import { typeLabels } from "@/features/prototype/state/mvp-store";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";
import { toWarehouseWorkSummary } from "../model/warehouse-view.model";
import type { WarehouseOrderCardProps } from "../model/warehouse-view.model";
import { WarehousePieceActions } from "./warehouse-piece-actions";

export function WarehouseOrderCard(props: WarehouseOrderCardProps) {
  const { summary, detailState } = props,
    rows = detailState?.group?.rows ?? [];
  const busy =
    props.busy || detailState?.phase !== "ready" || !!detailState.failure;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button
          type="button"
          aria-expanded={props.expanded}
          onClick={props.onToggleExpand}
        >
          {summary.businessNumber} · {summary.customerName} ·{" "}
          {summary.matchingPieceCount} قطعة
        </button>
        <span>{typeLabels[summary.type]}</span>
        <span>{toSalesOrderStatusLabel(summary.status)}</span>
        <span className="text-xs">
          الاستلام الفعلي: {summary.counts.received}/{summary.counts.active} ·{" "}
          {summary.counts.completionPercent}٪
        </span>
        <Link
          className="btn-pill btn-outline"
          href={`/warehouse/orders/${summary.id}`}
        >
          <Eye size={14} />
          <span>عرض أمر التفصيل</span>
        </Link>
        <label>
          <input
            type="checkbox"
            aria-label={`تحديد قطع ${summary.businessNumber}`}
            disabled={busy || rows.length === 0}
            checked={
              rows.length > 0 &&
              rows.every((row) =>
                props.selectedTargets.some(
                  (target) =>
                    target.orderId === row.target.orderId &&
                    target.pieceId === row.target.pieceId &&
                    target.expectedVersion === row.target.expectedVersion,
                ),
              )
            }
            onChange={(event) => {
              props.onToggleSelectMultiple(
                rows.map((row) => row.target),
                event.target.checked,
              );
            }}
          />{" "}
          تحديد القطع المطابقة
        </label>
      </div>
      {props.expanded && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          {(!detailState || detailState.phase === "loading") && (
            <p role="status">جارٍ تحميل القطع…</p>
          )}
          {detailState?.phase === "refreshing" && (
            <p role="status">جارٍ تحديث القطع…</p>
          )}
          {detailState?.failure && <p role="alert">{detailState.failure}</p>}
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <label>
                <input
                  type="checkbox"
                  aria-label={`تحديد القطعة ${String(row.piece.position)} من ${summary.businessNumber}`}
                  disabled={busy}
                  checked={props.selectedTargets.some(
                    (target) =>
                      target.orderId === row.target.orderId &&
                      target.pieceId === row.target.pieceId &&
                      target.expectedVersion === row.target.expectedVersion,
                  )}
                  onChange={() => {
                    props.onToggleSelect(row.target);
                  }}
                />
                {row.piece.position} · {row.piece.model ?? "—"} ·{" "}
                {row.piece.size ?? "—"}
              </label>
              <p className="text-xs text-slate-500">
                {toWarehouseWorkSummary(row)}
              </p>
              <Link
                href={`/warehouse/tasks/${summary.id}?pieceId=${row.piece.id}`}
              >
                عرض مهمة القطعة
              </Link>
              <WarehousePieceActions
                row={row}
                busy={busy}
                callbacks={props.callbacks}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
