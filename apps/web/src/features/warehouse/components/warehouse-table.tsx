"use client";
import {
  QueueGroupControls,
  QueuePageSelection,
  QueuePieceIdentity,
  QueuePieceStatus,
  QueueSelection,
  isQueuePieceSelected,
} from "@/features/manufacturing/components/department-queue-presentation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-empty-state";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { toWarehouseWorkSummary } from "../model/warehouse-view.model";
import type { WarehouseDepartmentTableProps } from "../model/warehouse-view.model";
import { warehouseFailureMessage } from "../model/warehouse-form.model";
import {
  WarehouseOrderCard,
  warehousePiecePresentation,
} from "./warehouse-order-card";
import { WarehousePieceActions } from "./warehouse-piece-actions";
import { WarehouseBatchActions } from "./warehouse-batch-actions";

export function WarehouseTable(props: WarehouseDepartmentTableProps) {
  return (
    <div className="space-y-4">
      {props.counts && (
        <p className="text-xs text-slate-500">
          النطاق المطابق: {props.counts.orders} أمر تفصيل ·{" "}
          {props.counts.pieces} قطعة
        </p>
      )}
      <WarehouseBatchActions
        view={props.view}
        selectedTargets={props.selectedTargets}
        selection={props.selection}
        busy={props.busy || props.queryStatus !== "ready" || !!props.failure}
        callbacks={props.callbacks}
        onClearSelection={props.onClearSelection}
      />
      <WarehouseResults {...props} />
    </div>
  );
}
function WarehouseResults(props: WarehouseDepartmentTableProps) {
  const loading = useRef(false),
    mounted = useRef(false);
  const [selecting, setSelecting] = useState(false),
    [selectionFailure, setSelectionFailure] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy =
    props.busy || selecting || props.queryStatus !== "ready" || !!props.failure;
  if (props.queryStatus === "loading")
    return <p role="status">جارٍ تحميل القطع…</p>;
  if (props.queryStatus === "error")
    return (
      <div role="alert">
        {props.failure}
        <button onClick={props.onRetry}>إعادة المحاولة</button>
      </div>
    );
  const emptyDescription = props.filtersActive
    ? "جرّب تعديل البحث أو إعادة ضبط الفلاتر."
    : "تظهر أوامر التفصيل وقطعها هنا عند وصولها إلى هذه المرحلة.";
  return (
    <div className="space-y-3">
      {selectionFailure && <p role="alert">{selectionFailure}</p>}
      {props.failure && (
        <div role="alert">
          {props.failure}
          <button onClick={props.onRetry}>إعادة المحاولة</button>
        </div>
      )}
      {props.queryStatus === "refreshing" && (
        <p role="status">جارٍ تحديث البيانات…</p>
      )}
      {props.mode === "grouped" ? (
        <>
          <QueueGroupControls
            groups={props.groups}
            expandedOrderIds={props.expandedOrderIds}
            onSetExpanded={props.onSetGroupExpansion}
          />
          {props.groups.length === 0 && (
            <WorkspaceEmptyState
              panel
              filtered={props.filtersActive}
              title="لا توجد أوامر مطابقة في هذا القسم."
              description={emptyDescription}
            />
          )}
          {props.groups.map((summary) => {
            const detail = props.groupDetails.get(summary.id);
            return (
              <WarehouseOrderCard
                key={summary.id}
                summary={summary}
                detailState={detail}
                expanded={props.expandedOrderIds.includes(summary.id)}
                busy={
                  busy ||
                  detail?.phase === "refreshing" ||
                  Boolean(detail?.failure)
                }
                selectedTargets={props.selectedTargets}
                onToggleExpand={() => {
                  props.onToggleExpand(summary);
                }}
                onToggleSelect={props.onToggleSelect}
                onToggleSelectMultiple={(targets, select) => {
                  if (!select) {
                    props.onToggleSelectMultiple(targets, false);
                    return;
                  }
                  if (loading.current || busy) return;
                  loading.current = true;
                  setSelecting(true);
                  setSelectionFailure(null);
                  void props
                    .onLoadGroup(summary)
                    .then((group) => {
                      if (mounted.current)
                        props.onToggleSelectMultiple(
                          group.rows.map((row) => row.target),
                          true,
                        );
                    })
                    .catch((error: unknown) => {
                      if (mounted.current)
                        setSelectionFailure(
                          warehouseFailureMessage(error, "review"),
                        );
                    })
                    .finally(() => {
                      loading.current = false;
                      if (mounted.current) setSelecting(false);
                    });
                }}
                callbacks={props.callbacks}
              />
            );
          })}
        </>
      ) : (
        <div className="space-y-4">
          <QueuePageSelection
            disabled={busy || props.rows.length === 0}
            checked={
              props.rows.length > 0 &&
              props.rows.every((row) =>
                props.selectedTargets.some(
                  (target) =>
                    target.orderId === row.order.id &&
                    target.pieceId === row.piece.id,
                ),
              )
            }
            onChange={(checked) => {
              props.onToggleSelectMultiple(
                props.rows.map((row) => row.target),
                checked,
              );
            }}
          />
          <OrientalTable
            data={[...props.rows]}
            pageSize={Math.max(1, props.rows.length)}
            keyExtractor={(row) => row.key}
            emptyTitle="لا توجد قطع مطابقة"
            emptySubtitle={emptyDescription}
            isSearchEmpty={props.filtersActive}
            columns={[
              {
                header: "تحديد",
                render: (row) => (
                  <QueueSelection
                    label={`تحديد القطعة ${String(row.piece.position)} من ${row.order.businessNumber}`}
                    disabled={busy}
                    checked={isQueuePieceSelected(
                      props.selectedTargets,
                      row.target,
                    )}
                    onChange={() => {
                      props.onToggleSelect(row.target);
                    }}
                  />
                ),
              },
              {
                header: "أمر التفصيل",
                render: (row) => (
                  <Link
                    dir="ltr"
                    className="font-mono font-bold text-teal-800 hover:underline"
                    href={`/warehouse/orders/${row.order.id}`}
                  >
                    {row.order.businessNumber}
                  </Link>
                ),
              },
              { header: "العميل", render: (row) => row.order.customerName },
              {
                header: "القطعة",
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <QueuePieceIdentity
                      piece={row.piece}
                      href={`/warehouse/tasks/${row.order.id}?pieceId=${row.piece.id}`}
                    />
                  </div>
                ),
              },
              {
                header: "حالة العمل",
                render: (row) => (
                  <QueuePieceStatus
                    piece={row.piece}
                    role="warehouse"
                    workSummary={toWarehouseWorkSummary(row)}
                    {...warehousePiecePresentation(row)}
                  />
                ),
              },
              {
                header: "الإجراءات",
                render: (row) => (
                  <WarehousePieceActions
                    row={row}
                    busy={busy}
                    callbacks={props.callbacks}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
