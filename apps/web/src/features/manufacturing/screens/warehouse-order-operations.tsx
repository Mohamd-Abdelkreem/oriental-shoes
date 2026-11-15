"use client";
import { useEffect, useRef, useState } from "react";
import { warehouseFailureMessage } from "@/features/warehouse/model/warehouse-form.model";
import {
  PackageCheck,
  Truck,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import type {
  WarehouseOrderData,
  WarehouseOrderSummary,
} from "@template/contracts";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";
import type {
  WarehouseReadAvailability,
  WarehouseRowCallbacks,
} from "@/features/warehouse/model/warehouse-view.model";

export function WarehouseOrderBadge({
  summary,
}: {
  summary: WarehouseOrderSummary;
}) {
  return (
    <span className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800">
      {toSalesOrderStatusLabel(summary.status)} · استلام فعلي{" "}
      {summary.counts.received}/{summary.counts.active}
    </span>
  );
}
export function WarehouseOrderOperations({
  data,
  readAvailability,
  readFailure,
  onReadRetry,
  callbacks,
  busy,
}: Readonly<{
  data: WarehouseOrderData;
  readAvailability: WarehouseReadAvailability;
  readFailure: string | null;
  onReadRetry(): Promise<void>;
  callbacks: WarehouseRowCallbacks;
  busy: boolean;
}>) {
  const [retrying, setRetrying] = useState(false),
    [retryFailure, setRetryFailure] = useState<string | null>(null),
    guard = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const retry = async () => {
    if (guard.current) return;
    guard.current = true;
    setRetrying(true);
    setRetryFailure(null);
    try {
      await onReadRetry();
    } catch (error: unknown) {
      if (mounted.current)
        setRetryFailure(warehouseFailureMessage(error, "read"));
    } finally {
      guard.current = false;
      if (mounted.current) setRetrying(false);
    }
  };
  const targets = data.paper.order.pieces
    .filter((piece) => piece.stage !== "CANCELLED")
    .map((piece) => ({
      orderId: data.summary.id,
      expectedVersion: data.summary.version,
      pieceId: piece.id,
    }));
  const incoming = targets.filter((target) =>
    data.work.some(
      (work) =>
        work.pieceId === target.pieceId && work.allowedActions.canReceive,
    ),
  );
  const disabled = busy || readAvailability !== "ready",
    actions = data.summary.allowedActions;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-700">
          <WarehouseOrderBadge summary={data.summary} />
          <p className="mt-2">
            الكراتين ومواقع التخزين محفوظة لكل مجموعة استلام مستقلة؛ لا تجمع
            القيم النصية.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {incoming.length > 0 && (
            <button
              type="button"
              className="btn-pill btn-primary text-xs"
              disabled={disabled}
              onClick={() => {
                callbacks.onReceive(incoming);
              }}
            >
              <PackageCheck size={14} />
              تأكيد استلام وتسجيل الكراتين ({incoming.length} قطعة واردة)
            </button>
          )}
          {actions.canDispatch && (
            <button
              type="button"
              className="btn-pill btn-primary text-xs"
              disabled={disabled}
              onClick={() => {
                callbacks.onDispatch(targets);
              }}
            >
              <Truck size={14} />
              إرسال الطلب الكامل مع مندوب التوصيل
            </button>
          )}
          {actions.canConfirmDelivery && (
            <button
              type="button"
              className="btn-pill btn-primary text-xs"
              disabled={disabled}
              onClick={() => {
                callbacks.onConfirmDelivery(targets);
              }}
            >
              <CheckCircle2 size={14} />
              تأكيد التسليم الكامل للعميل
            </button>
          )}
          {actions.canFailDelivery && (
            <button
              type="button"
              className="btn-pill btn-rose text-xs"
              disabled={disabled}
              onClick={() => {
                callbacks.onFailDelivery(targets);
              }}
            >
              <XCircle size={14} />
              تسجيل تعذر التسليم والعودة الكاملة
            </button>
          )}
          {actions.canRetryDelivery && (
            <button
              type="button"
              className="btn-pill btn-secondary text-xs"
              disabled={disabled}
              onClick={() => {
                callbacks.onRetryDelivery(targets);
              }}
            >
              <RotateCcw size={14} />
              إعادة الطلب الكامل للجاهز للتوصيل
            </button>
          )}
        </div>
      </div>
      {readAvailability === "refreshing" && (
        <p role="status">جارٍ تحديث الطلب؛ التأكيد متوقف.</p>
      )}
      {retryFailure && <p role="alert">{retryFailure}</p>}
      {readFailure && (
        <div role="alert">
          {readFailure}
          <button
            type="button"
            disabled={retrying}
            onClick={() => {
              void retry();
            }}
          >
            إعادة تحميل الطلب
          </button>
        </div>
      )}
      <section className="space-y-2" aria-label="مجموعات الاستلام الفعلي">
        {data.receiptGroups.map((group) => (
          <div
            key={group.id}
            className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
          >
            <p>
              مجموعة الاستلام: {group.id} · القطع: {group.pieceIds.join("، ")}
            </p>
            <p>
              الكراتين: {group.cartonCount ?? "غير مسجل"} · موقع التخزين:{" "}
              {group.storageLocation ?? "غير مسجل"}
            </p>
            {group.notes !== null && <p>ملاحظات الاستلام: {group.notes}</p>}
            <p>
              المنفذ: {group.actor.fullName} · استلام فعلي: {group.receivedAt}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
