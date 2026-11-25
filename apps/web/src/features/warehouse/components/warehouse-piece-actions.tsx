"use client";
import type {
  WarehouseWorkRow,
  WarehouseRowCallbacks,
} from "../model/warehouse-view.model";

export function WarehousePieceActions({
  row,
  busy,
  callbacks,
}: Readonly<{
  row: WarehouseWorkRow;
  busy: boolean;
  callbacks: WarehouseRowCallbacks;
}>) {
  return (
    <div className="flex flex-wrap gap-2">
      {row.work.allowedActions.canReceive && (
        <button
          type="button"
          className="btn-pill btn-teal"
          disabled={busy}
          onClick={() => {
            callbacks.onReceive([row.target]);
          }}
        >
          تأكيد الاستلام الفعلي
        </button>
      )}
      {row.order.allowedActions.canDispatch && (
        <button
          type="button"
          className="btn-pill btn-teal"
          disabled={busy}
          onClick={() => {
            callbacks.onDispatch([row.target]);
          }}
        >
          مراجعة خروج الطلب الكامل للتوصيل
        </button>
      )}
      {row.order.allowedActions.canConfirmDelivery && (
        <button
          type="button"
          className="btn-pill btn-teal"
          disabled={busy}
          onClick={() => {
            callbacks.onConfirmDelivery([row.target]);
          }}
        >
          تأكيد تسليم الطلب للعميل
        </button>
      )}
      {row.order.allowedActions.canFailDelivery && (
        <button
          type="button"
          className="btn-pill btn-rose"
          disabled={busy}
          onClick={() => {
            callbacks.onFailDelivery([row.target]);
          }}
        >
          تسجيل تعذّر التسليم وعودة الطلب
        </button>
      )}
      {row.order.allowedActions.canRetryDelivery && (
        <button
          type="button"
          className="btn-pill btn-amber"
          disabled={busy}
          onClick={() => {
            callbacks.onRetryDelivery([row.target]);
          }}
        >
          مراجعة إعادة الطلب الكامل للجاهز
        </button>
      )}
    </div>
  );
}
