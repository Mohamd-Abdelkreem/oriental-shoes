"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
} from "lucide-react";
import {
  stageQuantity,
  useMvpStore,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";
import {
  ConfirmDeliveryDialog,
  ConfirmWarehouseReceiptDialog,
  DispatchDeliveryDialog,
  RecordDeliveryFailedDialog,
  RetryDeliveryDialog,
} from "@/features/prototype/components/action-dialogs";

type WarehouseModal = {
  type: "RECEIPT" | "DISPATCH" | "FAILED" | "RETRY" | "CONFIRM_DELIVERED";
} | null;

function allPiecesInWarehouse(activePieces: ProductLine[]): boolean {
  return (
    activePieces.length > 0 &&
    activePieces.every((piece) =>
      ["في المستودع", "تم التسليم", "مع المندوب", "تم الاستلام"].includes(
        piece.currentLocation ?? "",
      ),
    )
  );
}

export function WarehouseOrderBadge({
  order,
  activePieces,
}: {
  order: MvpOrder;
  activePieces: ProductLine[];
}) {
  const isFullyInWarehouse = allPiecesInWarehouse(activePieces);
  return order.status === "تم التسليم" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900">
      <CheckCircle2 size={12} />
      <span>تم التسليم للعميل</span>
    </span>
  ) : order.status === "خرج مع المندوب" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-900">
      <Truck size={12} />
      <span>خرج للتسليم</span>
    </span>
  ) : isFullyInWarehouse ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900">
      <CheckCircle2 size={12} />
      <span>جاهز للتسليم (اكتملت جميع القطع)</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
      <AlertTriangle size={12} />
      <span>التسليم مقفل (الكمية غير مكتملة بالمستودع)</span>
    </span>
  );
}

function WarehouseOrderDialogs({
  order,
  activePiecesCount,
  warehouseModal,
  setWarehouseModal,
}: {
  order: MvpOrder;
  activePiecesCount: number;
  warehouseModal: WarehouseModal;
  setWarehouseModal: (modal: WarehouseModal) => void;
}) {
  const store = useMvpStore();
  return (
    <>
      {warehouseModal && warehouseModal.type === "CONFIRM_DELIVERED" && (
        <ConfirmDeliveryDialog
          open={true}
          onClose={() => {
            setWarehouseModal(null);
          }}
          orderId={order.id}
          customerName={order.customerName || order.customer || "العميل"}
          onConfirm={() => {
            store.confirmDelivered(order.id, "سارة محمد");
            setWarehouseModal(null);
          }}
        />
      )}
      {warehouseModal && warehouseModal.type === "RECEIPT" && (
        <ConfirmWarehouseReceiptDialog
          open={true}
          onClose={() => {
            setWarehouseModal(null);
          }}
          orderId={order.id}
          quantity={stageQuantity(order, "المستودع") || activePiecesCount}
          onConfirm={() => {
            const segId =
              order.segments.find((s) => s.stage === "المستودع")?.id ||
              order.segments[0]?.id ||
              "";
            store.confirmWarehouseReceipt(order.id, segId, "سارة محمد");
            setWarehouseModal(null);
          }}
        />
      )}
      {warehouseModal && warehouseModal.type === "DISPATCH" && (
        <DispatchDeliveryDialog
          open={true}
          onClose={() => {
            setWarehouseModal(null);
          }}
          orderId={order.id}
          customerName={order.customerName || order.customer || ""}
          address={order.customerPhone || order.phone || ""}
          quantity={stageQuantity(order, "المستودع") || activePiecesCount}
          onConfirm={(repName) => {
            store.dispatchDelivery(order.id, "سارة محمد", repName);
            setWarehouseModal(null);
          }}
        />
      )}
      {warehouseModal && warehouseModal.type === "FAILED" && (
        <RecordDeliveryFailedDialog
          open={true}
          onClose={() => {
            setWarehouseModal(null);
          }}
          orderId={order.id}
          onConfirm={(reason) => {
            store.recordDeliveryFailed(order.id, reason, "سارة محمد");
            setWarehouseModal(null);
          }}
        />
      )}
      {warehouseModal && warehouseModal.type === "RETRY" && (
        <RetryDeliveryDialog
          open={true}
          onClose={() => {
            setWarehouseModal(null);
          }}
          orderId={order.id}
          onConfirm={(newDate, notes) => {
            store.retryDelivery(order.id, "سارة محمد", newDate, notes);
            setWarehouseModal(null);
          }}
        />
      )}
    </>
  );
}

export function WarehouseOrderOperations({
  order,
  activePieces,
  deptPieces,
}: {
  order: MvpOrder;
  activePieces: ProductLine[];
  deptPieces: ProductLine[];
}) {
  const [warehouseModal, setWarehouseModal] = useState<WarehouseModal>(null);
  const isFullyInWarehouse = allPiecesInWarehouse(activePieces);
  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700">
            <Package size={15} className="text-teal-700" />
            <span>
              إجمالي الكراتين المسجلة:{" "}
              <strong className="font-bold text-slate-900">
                {order.cartonCount || 0} كرتون
              </strong>
            </span>
          </div>

          {order.warehouseLocation && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-700">
                موقع الرف:{" "}
                <strong className="font-bold text-slate-900">
                  {order.warehouseLocation}
                </strong>
              </span>
            </>
          )}

          {order.deliveryNotes && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">
                ملاحظات: {order.deliveryNotes}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(order.status === "محول للمستودع" ||
            order.status === "بانتظار استلام المستودع" ||
            deptPieces.some((p) => p.deptStatus === "جاهزة للعمل")) && (
            <button
              type="button"
              onClick={() => {
                setWarehouseModal({ type: "RECEIPT" });
              }}
              className="btn-pill btn-primary text-xs"
            >
              <PackageCheck size={14} />
              <span>تأكيد استلام وتسجيل الكراتين</span>
            </button>
          )}

          {isFullyInWarehouse &&
            order.status !== "تم التسليم" &&
            order.status !== "خرج مع المندوب" && (
              <button
                type="button"
                onClick={() => {
                  setWarehouseModal({ type: "DISPATCH" });
                }}
                className="btn-pill btn-primary text-xs"
              >
                <Truck size={14} />
                <span>إرسال مع مندوب التوصيل</span>
              </button>
            )}

          {order.status === "خرج مع المندوب" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setWarehouseModal({ type: "CONFIRM_DELIVERED" });
                }}
                className="btn-pill btn-primary text-xs"
              >
                <CheckCircle2 size={14} />
                <span>تأكيد التسليم للعميل</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setWarehouseModal({ type: "FAILED" });
                }}
                className="btn-pill btn-rose text-xs"
              >
                <XCircle size={14} />
                <span>تسجيل تعذر التسليم</span>
              </button>
            </>
          )}

          {(order.status === "تعذر التسليم" ||
            order.status === "فشل التسليم معلق") && (
            <button
              type="button"
              onClick={() => {
                setWarehouseModal({ type: "RETRY" });
              }}
              className="btn-pill btn-secondary text-xs"
            >
              <RotateCcw size={14} />
              <span>جدولة إعادة محاولة التسليم</span>
            </button>
          )}
        </div>
      </div>
      <WarehouseOrderDialogs
        order={order}
        activePiecesCount={activePieces.length}
        warehouseModal={warehouseModal}
        setWarehouseModal={setWarehouseModal}
      />
    </>
  );
}
