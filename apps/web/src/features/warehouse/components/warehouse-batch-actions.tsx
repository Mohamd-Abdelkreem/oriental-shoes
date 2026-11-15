"use client";
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
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3"
      aria-label="إجراءات القطع المحددة"
    >
      <span>المحدد: {selectedTargets.length} قطعة</span>
      {selection.phase === "loading" && (
        <span role="status">جارٍ تحميل بيانات جميع القطع المختارة…</span>
      )}
      {selection.failure && <span role="alert">{selection.failure}</span>}
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
          مراجعة تسليم الطلبات الكاملة للعميل
        </button>
      )}
      {view === "OUT_FOR_DELIVERY" && (
        <button
          type="button"
          className="btn-pill btn-outline"
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
          مراجعة عودة الطلبات الكاملة وتعذر التسليم
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
      {view === "INCOMPLETE" && (
        <span>التوصيل مقفل حتى استلام جميع القطع النشطة فعلياً.</span>
      )}
      <button
        type="button"
        className="btn-pill btn-outline"
        onClick={onClearSelection}
      >
        إلغاء التحديد
      </button>
    </div>
  );
}
