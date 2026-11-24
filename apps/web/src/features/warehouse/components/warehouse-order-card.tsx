"use client";

import {
  OrientalStatusPill,
  statusTone,
} from "@/features/prototype/components/data-table";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";
import {
  byQueuePiecePosition,
  isQueuePieceSelected,
  QueueOrderCard,
  QueuePieceCard,
  QueueSelection,
} from "@/features/manufacturing/components/department-queue-presentation";
import {
  toWarehouseWorkSummary,
  type WarehouseOrderCardProps,
  type WarehouseWorkRow,
} from "../model/warehouse-view.model";
import { WarehousePieceActions } from "./warehouse-piece-actions";

export function warehousePiecePresentation(row: WarehouseWorkRow) {
  if (row.piece.stage === "CANCELLED" || row.piece.receivedAt === null)
    return {};
  switch (row.order.status) {
    case "OUT_FOR_DELIVERY":
      return {
        location: "مع المندوب",
        state: { label: "خرج للتوصيل", tone: "blue" },
      } as const;
    case "DELIVERED":
      return {
        location: "تم التسليم",
        state: { label: "تم التسليم", tone: "emerald" },
      } as const;
    case "DELIVERY_FAILED":
      return { state: { label: "تعذر التسليم", tone: "rose" } } as const;
    default:
      return { state: { label: "تم الاستلام", tone: "emerald" } } as const;
  }
}

export function WarehouseOrderCard(props: WarehouseOrderCardProps) {
  const { summary, detailState } = props;
  const rows = detailState?.group?.rows ?? [];
  const displayRows = rows.toSorted(byQueuePiecePosition);
  const busy =
    props.busy || detailState?.phase !== "ready" || !!detailState.failure;
  const selected = rows.filter((row) =>
    isQueuePieceSelected(props.selectedTargets, row.target),
  );
  const status = toSalesOrderStatusLabel(summary.status);
  return (
    <QueueOrderCard
      order={summary}
      pieces={displayRows.map((row) => row.piece)}
      orderHref={`/warehouse/orders/${summary.id}`}
      expanded={props.expanded}
      onExpand={props.onToggleExpand}
      selection={
        <QueueSelection
          label={`تحديد قطع ${summary.businessNumber}`}
          disabled={busy || rows.length === 0}
          checked={rows.length > 0 && selected.length === rows.length}
          mixed={selected.length > 0 && selected.length < rows.length}
          onChange={(checked) => {
            props.onToggleSelectMultiple(
              rows.map((row) => row.target),
              checked,
            );
          }}
        />
      }
      indicators={
        <>
          <OrientalStatusPill tone={statusTone(status)}>
            {status}
          </OrientalStatusPill>
          <span className="text-[11px] text-slate-500">
            الاستلام الفعلي: {summary.counts.received}/{summary.counts.active} ·{" "}
            {summary.counts.completionPercent}٪
          </span>
        </>
      }
    >
      {(!detailState || detailState.phase === "loading") && (
        <p role="status" className="text-xs text-slate-500">
          جارٍ تحميل القطع…
        </p>
      )}
      {detailState?.phase === "refreshing" && (
        <p role="status" className="text-xs text-slate-500">
          جارٍ تحديث القطع…
        </p>
      )}
      {detailState?.failure && (
        <p role="alert" className="text-xs text-rose-800">
          {detailState.failure}
        </p>
      )}
      {displayRows.map((row) => {
        const checked = isQueuePieceSelected(props.selectedTargets, row.target);
        return (
          <QueuePieceCard
            key={row.key}
            piece={row.piece}
            href={`/warehouse/tasks/${summary.id}?pieceId=${row.piece.id}`}
            role="warehouse"
            workSummary={toWarehouseWorkSummary(row)}
            {...warehousePiecePresentation(row)}
            checked={checked}
            orderNumber={summary.businessNumber}
            disabled={busy}
            onSelect={() => {
              props.onToggleSelect(row.target);
            }}
          >
            <WarehousePieceActions
              row={row}
              busy={busy}
              callbacks={props.callbacks}
            />
          </QueuePieceCard>
        );
      })}
    </QueueOrderCard>
  );
}
