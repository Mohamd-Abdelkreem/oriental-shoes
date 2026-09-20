"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, Clock, PackageCheck, Truck } from "lucide-react";
import {
  stageQuantity,
  useMvpStore,
  type MvpEvent,
  type MvpOrder,
  type QuantitySegment,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { OrientalTable } from "@/features/prototype/components/data-table";
import {
  ConfirmDeliveryDialog,
  ConfirmWarehouseReceiptDialog,
  DispatchDeliveryDialog,
  RetryDeliveryDialog,
} from "@/features/prototype/components/action-dialogs";
import { DepartmentOrderTable } from "./department-order-table";
import {
  WarehouseOrderDetailView,
  type WarehouseActiveModal,
} from "./warehouse-order-detail-view";

export function WarehouseWorkspace() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const store = useMvpStore();

  const [activeModal, setActiveModal] = useState<WarehouseActiveModal>(null);

  const warehouseOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "المستودع") > 0 ||
      (o.stage === "المستودع" && o.status !== "مسودة" && o.status !== "ملغي"),
  );

  const incomingOrders = store.orders.filter(
    (o) =>
      o.status === "محول للمستودع" ||
      o.status === "بانتظار استلام المستودع" ||
      o.segments.some(
        (s) => s.stage === "المستودع" && s.state === "بانتظار الاستلام",
      ),
  );

  const isOrderFullyInWarehouse = (o: MvpOrder) => {
    const active = o.items.filter((p) => !p.isDeleted);
    if (active.length === 0) return false;
    return active.every(
      (p) =>
        p.currentLocation === "في المستودع" ||
        p.currentLocation === "تم التسليم" ||
        p.currentLocation === "مع المندوب",
    );
  };

  // Ready = all pieces complete in warehouse AND not yet dispatched
  const readyOrders = warehouseOrders.filter(
    (o) =>
      isOrderFullyInWarehouse(o) &&
      ["بالمستودع جاهز للتسليم", "مكتمل في المستودع", "جاهز للتسليم"].includes(
        o.status,
      ),
  );

  // Incomplete = partial quantities arrived in warehouse
  const incompleteOrders = warehouseOrders.filter(
    (o) =>
      !isOrderFullyInWarehouse(o) &&
      stageQuantity(o, "المستودع") > 0 &&
      !["مسودة", "ملغي"].includes(o.status),
  );

  // Out for delivery
  const outForDeliveryOrders = store.orders.filter(
    (o) => o.status === "خرج مع المندوب",
  );

  // Delivery failed
  const failedDeliveryOrders = store.orders.filter(
    (o) => o.status === "فشل التسليم معلق" || o.status === "تعذر التسليم",
  );

  // Successfully delivered
  const deliveredOrders = store.orders.filter(
    (o) => o.status === "مكتمل ومسلم" || o.status === "تم الاستلام",
  );

  const kpis: KpiCardItem[] = [
    {
      title: "وارد بانتظار الاستلام",
      value: incomingOrders.length,
      unit: "أمر تفصيل",
      subtitle: "دفعات مغلفة من الجودة تتطلب الفرز والتسجيل",
      icon: Clock,
      tone: incomingOrders.length > 0 ? "amber" : "neutral",
      href: "/warehouse/incoming",
    },
    {
      title: "جاهز للتسليم (كامل القطع)",
      value: readyOrders.length,
      unit: "أمر تفصيل",
      subtitle: "اكتملت جميع قطع الأمر بالمستودع ويمكن إرساله",
      icon: PackageCheck,
      tone: readyOrders.length > 0 ? "emerald" : "neutral",
      href: "/warehouse/ready",
    },
    {
      title: "أوامر غير مكتملة بالمستودع",
      value: incompleteOrders.length,
      unit: "أمر تفصيل",
      subtitle: "وصلت دفعات جزئية والتسليم مقفل حتى اكتمال كافة القطع",
      icon: Clock,
      tone: incompleteOrders.length > 0 ? "amber" : "neutral",
      href: "/warehouse/incomplete",
    },
    {
      title: "خرج مع مندوب التوصيل",
      value: outForDeliveryOrders.length,
      unit: "أمر تفصيل",
      subtitle: "جاري توصيلها لعنوان العميل حالياً",
      icon: Truck,
      tone: "teal",
      href: "/warehouse/out-for-delivery",
    },
    {
      title: "فشل التسليم (معلق لإعادة المحاولة)",
      value: failedDeliveryOrders.length,
      unit: "أمر تفصيل",
      subtitle: "تعذر التسليم لعدم الرد أو طلب تأجيل",
      icon: AlertTriangle,
      tone: failedDeliveryOrders.length > 0 ? "rose" : "neutral",
      href: "/warehouse/delivery-failed",
    },
  ];

  if (
    pathname.includes("/warehouse/orders/") ||
    pathname.includes("/warehouse/tasks/")
  ) {
    const orderId = decodeURIComponent(pathname.split("/").at(-1) || "");
    const order = store.orders.find((o) => o.id === orderId);
    return (
      <WarehouseOrderDetailView
        order={order}
        targetSegmentId={searchParams.get("segmentId")}
        isLocked={order ? !isOrderFullyInWarehouse(order) : false}
        activeModal={activeModal}
        setActiveModal={setActiveModal}
      />
    );
  }

  // Route: /warehouse/activity
  if (pathname.endsWith("/warehouse/activity")) {
    const events = store.events.filter(
      (e) => e.role === "المستودع والتسليم" || e.stage === "المستودع",
    );
    return (
      <div className="space-y-6">
        <OrientalPageHeader
          eyebrow="قسم المستودع والتسليم / سجل العمليات"
          title="سجل حركات المستودع والشحن"
          subtitle="توثيق استلام الكراتين، خروج المناديب، ومحاولات التسليم الناجحة والمعلقة"
        />
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <OrientalTable<MvpEvent>
            data={events.slice().reverse()}
            keyExtractor={(e) => e.id}
            columns={[
              {
                header: "الوقت والتاريخ",
                render: (e) => (
                  <span className="text-xs text-slate-500">{e.timestamp}</span>
                ),
              },
              {
                header: "المسؤول",
                render: (e) => (
                  <span className="font-semibold text-slate-800">
                    {e.actor}
                  </span>
                ),
              },
              {
                header: "رقم الأمر",
                render: (e) => (
                  <Link
                    href={`/warehouse/orders/${e.orderId}`}
                    className="font-bold text-teal-700 hover:underline"
                  >
                    {e.orderId}
                  </Link>
                ),
              },
              {
                header: "الحدث والبيان",
                render: (e) => (
                  <span className="text-sm text-slate-700">{e.event}</span>
                ),
              },
            ]}
          />
        </div>
      </div>
    );
  }

  // Subpage titles & configs
  let activeTabTitle = "لوحة تحكم المستودع والتسليم النهائي";
  let activeTabSubtitle =
    "حصر الكراتين المغلفة، فرز الأوامر المكتملة كاملة القطع، وتنسيق إرسال المناديب للعملاء";
  let activeTableOrders = warehouseOrders;
  let actionLabel: string | undefined = undefined;
  let onTableAction: ((o: MvpOrder, s?: QuantitySegment) => void) | undefined =
    undefined;

  if (pathname.endsWith("/warehouse/incoming")) {
    activeTabTitle = "أوامر واردة بانتظار استلام المستودع";
    activeTabSubtitle =
      "دفعات مغلفة من محطة الجودة بانتظار تأكيد استلامها وفرزها على الرفوف وتجهيز الكراتين";
    activeTableOrders = incomingOrders;
    actionLabel = "تأكيد الاستلام";
    onTableAction = (o, s) => {
      setActiveModal({ type: "RECEIPT", order: o, segment: s });
    };
  } else if (pathname.endsWith("/warehouse/ready")) {
    activeTabTitle = "أوامر جاهزة للتسليم (كامل القطع)";
    activeTabSubtitle =
      "أوامر استوفت جميع قطعها في المستودع ويمكن إسنادها لمندوب التوصيل فوراً";
    activeTableOrders = readyOrders;
    actionLabel = "إرسال مع مندوب";
    onTableAction = (o, s) => {
      setActiveModal({ type: "DISPATCH", order: o, segment: s });
    };
  } else if (pathname.endsWith("/warehouse/incomplete")) {
    activeTabTitle = "أوامر غير مكتملة بالمستودع (تسليم مقفل)";
    activeTabSubtitle =
      "أوامر استلم المستودع أجزاء منها بينما لا تزال بقية الكميات تحت التصنيع أو الفحص بالمصنع";
    activeTableOrders = incompleteOrders;
  } else if (pathname.endsWith("/warehouse/out-for-delivery")) {
    activeTabTitle = "شحنات خرجت مع المناديب";
    activeTabSubtitle =
      "أوامر في طريقها للعملاء حالياً مع مناديب الشحن والتوصيل";
    activeTableOrders = outForDeliveryOrders;
    actionLabel = "تأكيد التسليم للعميل";
    onTableAction = (o) => {
      setActiveModal({ type: "CONFIRM_DELIVERED", order: o });
    };
  } else if (pathname.endsWith("/warehouse/delivery-failed")) {
    activeTabTitle = "حالات تعذر وفشل التسليم (معلقة لإعادة المحاولة)";
    activeTabSubtitle =
      "شحنات تعذر تسليمها لعدم تواجد العميل أو تأجيل الموعد، تتطلب إعادة جدولة";
    activeTableOrders = failedDeliveryOrders;
    actionLabel = "إعادة الجدولة";
    onTableAction = (o, s) => {
      setActiveModal({ type: "RETRY", order: o, segment: s });
    };
  } else if (pathname.endsWith("/warehouse/delivered")) {
    activeTabTitle = "أرشيف الأوامر المسلمة بنجاح";
    activeTabSubtitle =
      "أوامر التفصيل التي تم تسليمها للعميل واكتمال دورتها التصنيعية بالكامل";
    activeTableOrders = deliveredOrders;
  }

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم المستودع والتسليم"
        title={activeTabTitle}
        subtitle={activeTabSubtitle}
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      <DepartmentOrderTable
        orders={activeTableOrders}
        deptRole="warehouse"
        stageName="المستودع"
        actionButtonLabel={actionLabel}
        onAction={onTableAction}
      />

      {/* Action Dialogs */}
      {activeModal && activeModal.type === "CONFIRM_DELIVERED" && (
        <ConfirmDeliveryDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          customerName={
            activeModal.order.customerName ||
            activeModal.order.customer ||
            "العميل"
          }
          onConfirm={() => {
            store.confirmDelivered(activeModal.order.id, "سارة محمد");
          }}
        />
      )}

      {activeModal && activeModal.type === "RECEIPT" && (
        <ConfirmWarehouseReceiptDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "المستودع")
          }
          onConfirm={() => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find((s) => s.stage === "المستودع")
                ?.id ||
              activeModal.order.segments[0]?.id ||
              "";
            store.confirmWarehouseReceipt(
              activeModal.order.id,
              segId,
              "سارة محمد",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "DISPATCH" && (
        <DispatchDeliveryDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          customerName={activeModal.order.customerName || ""}
          address={activeModal.order.customerPhone || ""}
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "المستودع")
          }
          onConfirm={(repName) => {
            store.dispatchDelivery(activeModal.order.id, "سارة محمد", repName);
          }}
        />
      )}

      {activeModal && activeModal.type === "RETRY" && (
        <RetryDeliveryDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          onConfirm={(newDate, notes) => {
            store.retryDelivery(
              activeModal.order.id,
              "سارة محمد",
              newDate,
              notes,
            );
          }}
        />
      )}
    </div>
  );
}
