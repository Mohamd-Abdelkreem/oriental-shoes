"use client";
import { QueueSelectionBar } from "@/features/manufacturing/components/department-queue-presentation";
import type { WarehouseBatchActionsProps } from "../model/warehouse-view.model";

export function WarehouseBatchActions({
  view,
  selectedTargets,
  selection,
  busy,
  callbacks,
  onClearSelection,
}: WarehouseBatchActionsProps) {
  if (!selectedTargets.length) return null;
  const rows = selection.phase === "ready" ? selection.rows : [];
  const complete =
    rows.length === selectedTargets.length &&
    selectedTargets.every((target) =>
      rows.some(
        (row) =>
          row.target.orderId === target.orderId &&
          row.target.pieceId === target.pieceId &&
          row.target.expectedVersion === target.expectedVersion,
      ),
    );
  return (
    <QueueSelectionBar
      count={selectedTargets.length}
      loading={selection.phase === "loading"}
      failure={selection.failure}
      {...(view === "INCOMPLETE" && {
        notice: "التوصيل مقفل حتى استلام جميع القطع النشطة فعلياً.",
      })}
    >
      {view === "INCOMING" && (
        <button
          type="button"
          className="btn-pill btn-teal"
          disabled={
            busy ||
            !complete ||
            !rows.every((row) => row.work.allowedActions.canReceive)
          }
          onClick={() => {
            callbacks.onReceive(rows.map((row) => row.target));
          }}
        >
          استلام القطع المحددة فعلياً
        </button>
      )}
      {view === "READY" && (
        <button
          type="button"
          className="btn-pill btn-teal"
          disabled={
            busy ||
            !complete ||
            rows.length === 0 ||
            !rows.every((row) => row.order.allowedActions.canDispatch)
          }
          onClick={() => {
            callbacks.onDispatch(rows.map((row) => row.target));
          }}
        >
          مراجعة خروج الطلبات الكاملة للتوصيل
        </button>
      )}
      {view === "OUT_FOR_DELIVERY" && (
        <button
          type="button"
          className="btn-pill btn-teal"
          disabled={
            busy ||
            !complete ||
            rows.length === 0 ||
            !rows.every((row) => row.order.allowedActions.canConfirmDelivery)
          }
          onClick={() => {
            callbacks.onConfirmDelivery(rows.map((row) => row.target));
          }}
        >
          تأكيد تسليم الطلبات للعميل
        </button>
      )}
      {view === "OUT_FOR_DELIVERY" && (
        <button
          type="button"
          className="btn-pill btn-rose"
          disabled={
            busy ||
            !complete ||
            rows.length === 0 ||
            !rows.every((row) => row.order.allowedActions.canFailDelivery)
          }
          onClick={() => {
            callbacks.onFailDelivery(rows.map((row) => row.target));
          }}
        >
          تسجيل تعذّر التسليم وعودة الطلبات
        </button>
      )}
      {view === "DELIVERY_FAILED" && (
        <button
          type="button"
          className="btn-pill btn-amber"
          disabled={
            busy ||
            !complete ||
            rows.length === 0 ||
            !rows.every((row) => row.order.allowedActions.canRetryDelivery)
          }
          onClick={() => {
            callbacks.onRetryDelivery(rows.map((row) => row.target));
          }}
        >
          مراجعة إعادة الطلبات الكاملة للجاهز
        </button>
      )}
      <button
        type="button"
        className="btn-pill btn-secondary px-2.5 py-1.5 text-xs"
        onClick={onClearSelection}
      >
        مسح التحديد
      </button>
    </QueueSelectionBar>
  );
}
