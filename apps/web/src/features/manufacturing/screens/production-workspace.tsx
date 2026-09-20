"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Clock, Factory, RotateCcw } from "lucide-react";
import {
  stageQuantity,
  useMvpStore,
  formatProductCount,
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
  ConfirmReceiptDialog,
  ReceiveAndStartDialog,
  RecordCompletionDialog,
  RouteProductionSplitDialog,
  StartWorkDialog,
} from "@/features/prototype/components/action-dialogs";
import { FactoryTaskDetailView } from "./factory-task-detail-view";
import { DepartmentOrderTable } from "./department-order-table";

export function ProductionWorkspace() {
  const pathname = usePathname();
  const store = useMvpStore();

  const [activeModal, setActiveModal] = useState<{
    type:
      "RECEIVE_AND_START" | "COMPLETE" | "ROUTE_SPLIT" | "START" | "RECEIPT";
    order: MvpOrder;
    segment?: QuantitySegment | undefined;
  } | null>(null);

  const prodOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "الإنتاج والإصلاح") > 0 ||
      (o.stage === "الإنتاج والإصلاح" &&
        o.status !== "مسودة" &&
        o.status !== "ملغي"),
  );

  const incomingOrders = prodOrders.filter(
    (o) =>
      o.status === "بانتظار البدء في الإنتاج" ||
      o.status === "محول للإنتاج" ||
      o.segments.some(
        (s) =>
          s.stage === "الإنتاج والإصلاح" &&
          (s.state === "بانتظار الاستلام" || s.state === "بانتظار بدء العمل"),
      ),
  );
  const inProgressOrders = prodOrders.filter(
    (o) =>
      o.status === "قيد الإنتاج" ||
      o.segments.some(
        (s) => s.stage === "الإنتاج والإصلاح" && s.state === "قيد التنفيذ",
      ),
  );
  const repairOrders = store.orders.filter(
    (o) => o.type === "REPAIR" && o.status !== "تم الاستلام",
  );
  const returnedOrders = store.orders.filter(
    (o) =>
      o.status === "معاد للإنتاج للتصحيح" ||
      o.segments.some(
        (s) => s.stage === "الإنتاج والإصلاح" && s.state === "معادة من الجودة",
      ),
  );
  const completedOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "الجودة والتغليف") > 0 ||
      stageQuantity(o, "العمليات الخاصة") > 0 ||
      stageQuantity(o, "المستودع") > 0,
  );

  const kpis: KpiCardItem[] = [
    {
      title: "وارد للإنتاج بانتظار الاستلام والبدء",
      value: incomingOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(incomingOrders.reduce((s, o) => s + stageQuantity(o, "الإنتاج والإصلاح"), 0))} جاهزة للتجميع`,
      icon: Clock,
      tone: incomingOrders.length > 0 ? "amber" : "neutral",
      href: "/production/incoming",
    },
    {
      title: "قيد التجميع والشد الآن",
      value: inProgressOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(inProgressOrders.reduce((s, o) => s + stageQuantity(o, "الإنتاج والإصلاح"), 0))} على خطوط التركيب`,
      icon: Factory,
      tone: "teal",
      href: "/production/in-progress",
    },
    {
      title: "أوامر الإصلاح العاجلة",
      value: repairOrders.length,
      unit: "أمر تفصيل",
      subtitle: "تتخطى القص وتدخل الإنتاج فوراً",
      icon: AlertTriangle,
      tone: repairOrders.length > 0 ? "amber" : "neutral",
      href: "/production/repairs",
    },
    {
      title: "معاد للتصحيح من الجودة",
      value: returnedOrders.length,
      unit: "أمر تفصيل",
      subtitle: "يتطلب تعديل أو فك وتركيب في الورشة",
      icon: RotateCcw,
      tone: returnedOrders.length > 0 ? "rose" : "neutral",
      href: "/production/returned",
    },
  ];

  // Route: /production/tasks/:taskId
  if (pathname.includes("/production/tasks/")) {
    const taskId = decodeURIComponent(pathname.split("/").at(-1) || "");

    return (
      <>
        <FactoryTaskDetailView
          orderId={taskId}
          role="production"
          currentStage="الإنتاج والإصلاح"
          onConfirmReceipt={(o, s) => {
            setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
          }}
          onRouteSplit={(o, s) => {
            setActiveModal({ type: "ROUTE_SPLIT", order: o, segment: s });
          }}
          onRecordCompletion={(o, s) => {
            setActiveModal({ type: "COMPLETE", order: o, segment: s });
          }}
        />

        {/* Action Dialogs */}
        {activeModal && activeModal.type === "RECEIVE_AND_START" && (
          <ReceiveAndStartDialog
            open={true}
            onClose={() => {
              setActiveModal(null);
            }}
            orderId={activeModal.order.id}
            quantity={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "الإنتاج والإصلاح")
            }
            deptName="قسم الإنتاج والإصلاح"
            actionLabel="استلام وبدء التصنيع"
            assignedWorker="أحمد عادل"
            onConfirm={() => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "الإنتاج والإصلاح",
                )?.id ||
                "";
              store.receiveAndStart(
                activeModal.order.id,
                segId,
                "أحمد عادل",
                "الإنتاج والإصلاح",
              );
            }}
          />
        )}

        {activeModal && activeModal.type === "ROUTE_SPLIT" && (
          <RouteProductionSplitDialog
            open={true}
            onClose={() => {
              setActiveModal(null);
            }}
            orderId={activeModal.order.id}
            completedQty={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "الإنتاج والإصلاح")
            }
            onConfirm={(directQty, specialQty, specialInstruction) => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "الإنتاج والإصلاح",
                )?.id ||
                "";
              store.routeProductionSplit(
                activeModal.order.id,
                segId,
                directQty,
                specialQty,
                specialInstruction,
                "أحمد عادل",
              );
            }}
          />
        )}

        {activeModal && activeModal.type === "COMPLETE" && (
          <RecordCompletionDialog
            open={true}
            onClose={() => {
              setActiveModal(null);
            }}
            orderId={activeModal.order.id}
            stageName="قسم الإنتاج والإصلاح"
            availableQty={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "الإنتاج والإصلاح")
            }
            onConfirm={(qty: number) => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "الإنتاج والإصلاح",
                )?.id ||
                "";
              store.recordDepartmentCompletion(
                activeModal.order.id,
                segId,
                qty,
                "أحمد عادل",
                "الإنتاج والإصلاح",
              );
              store.transferCompleted(
                activeModal.order.id,
                segId,
                qty,
                "الجودة والتغليف",
                "أحمد عادل",
                "الإنتاج والإصلاح",
              );
            }}
          />
        )}
      </>
    );
  }

  // Route: /production/activity
  if (pathname.endsWith("/production/activity")) {
    const events = store.events.filter(
      (e) => e.role === "الإنتاج والتجميع" || e.stage === "الإنتاج والتجميع",
    );
    return (
      <div className="space-y-6">
        <OrientalPageHeader
          eyebrow="قسم الإنتاج والتجميع / سجل العمليات"
          title="سجل نشاط الإنتاج والإصلاح"
          subtitle="توثيق أعمال التركيب، توجيه التفريعات، وتصحيح العيوب"
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
                    href={`/production/tasks/${e.orderId}`}
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

  // Subpage titles & configurations
  let activeTabTitle = "لوحة تحكم الإنتاج والتجميع والإصلاح";
  let activeTabSubtitle =
    "متابعة خطوط التركيب، الشد، تركيب النعل، والتوجيه الذكي للتفريعات نحو العمليات الخاصة أو الجودة";
  let activeTableOrders = prodOrders;
  let actionLabel: string | undefined = undefined;
  let onTableAction: ((o: MvpOrder, s?: QuantitySegment) => void) | undefined =
    undefined;

  if (
    pathname.endsWith("/production/incoming") ||
    pathname.endsWith("/production/waiting")
  ) {
    activeTabTitle = "وارد للإنتاج";
    activeTabSubtitle =
      "شحنات مقصوصة وأوامر إصلاح واردة بانتظار استلاستلام الورشة والبدء المباشر في التجميع والشد";
    activeTableOrders = incomingOrders;
    actionLabel = "استلام وبدء التصنيع";
    onTableAction = (o, s) => {
      setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
    };
  } else if (pathname.endsWith("/production/in-progress")) {
    activeTabTitle = "أوامر قيد الإنتاج والتجميع";
    activeTabSubtitle = "الأوامر الجاري تشغيلها على طاولات الشد والتركيب";
    activeTableOrders = inProgressOrders;
    actionLabel = "توجيه / تحويل";
    onTableAction = (o, s) => {
      setActiveModal({ type: "ROUTE_SPLIT", order: o, segment: s });
    };
  } else if (pathname.endsWith("/production/repairs")) {
    activeTabTitle = "أوامر الإصلاح العاجلة (مسار مباشر)";
    activeTabSubtitle =
      "أوامر الصيانة والإصلاح الواردة من المبيعات التي تتخطى القص وتدخل ورشة الإنتاج فوراً";
    activeTableOrders = repairOrders;
    actionLabel = "بدء الإصلاح";
    onTableAction = (o, s) => {
      setActiveModal({ type: "START", order: o, segment: s });
    };
  } else if (pathname.endsWith("/production/returned")) {
    activeTabTitle = "أوامر معادة للتصحيح من الجودة";
    activeTabSubtitle =
      "قطع تبيّن وجود عيوب تجميع أو غراء بها وتتطلب معالجة فورية قبل إعادة الفحص";
    activeTableOrders = returnedOrders;
    actionLabel = "معالجة وتحويل للجودة";
    onTableAction = (o, s) => {
      setActiveModal({ type: "COMPLETE", order: o, segment: s });
    };
  } else if (
    pathname.endsWith("/production/completed") ||
    pathname.endsWith("/production/sent")
  ) {
    activeTabTitle = "أرشيف الأوامر المنجزة بالإنتاج";
    activeTabSubtitle =
      "الأوامر التي تم تحويلها للجودة والتغليف أو العمليات الخاصة";
    activeTableOrders = completedOrders;
  }

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم الإنتاج والإصلاح"
        title={activeTabTitle}
        subtitle={activeTabSubtitle}
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      <DepartmentOrderTable
        orders={activeTableOrders}
        deptRole="production"
        stageName="الإنتاج والإصلاح"
        actionButtonLabel={actionLabel}
        onAction={onTableAction}
      />

      {/* Action Dialogs */}
      {activeModal && activeModal.type === "RECEIVE_AND_START" && (
        <ReceiveAndStartDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          department="الإنتاج والإصلاح"
          actionTitle="استلام وبدء التصنيع"
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "الإنتاج والإصلاح")
          }
          defaultWorker="أحمد عادل"
          onConfirm={(worker) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الإنتاج والإصلاح",
              )?.id ||
              "";
            store.receiveAndStart(
              activeModal.order.id,
              segId,
              worker,
              "الإنتاج والإصلاح",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "RECEIPT" && (
        <ConfirmReceiptDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "الإنتاج والإصلاح")
          }
          sourceDept={
            activeModal.order.type === "REPAIR"
              ? "المبيعات (تخطي القص)"
              : "قسم القص"
          }
          currentDept="الإنتاج والإصلاح"
          onConfirm={() => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الإنتاج والإصلاح",
              )?.id ||
              "";
            store.confirmReceipt(
              activeModal.order.id,
              segId,
              "أحمد عادل",
              "الإنتاج والإصلاح",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "ROUTE_SPLIT" && (
        <RouteProductionSplitDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          completedQty={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "الإنتاج والإصلاح")
          }
          onConfirm={(directQty, specialQty, specialInstruction) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الإنتاج والإصلاح",
              )?.id ||
              "";
            store.routeProductionSplit(
              activeModal.order.id,
              segId,
              directQty,
              specialQty,
              specialInstruction,
              "أحمد عادل",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "START" && (
        <StartWorkDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          stageName="قسم الإنتاج والإصلاح"
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "الإنتاج والإصلاح")
          }
          onConfirm={() => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الإنتاج والإصلاح",
              )?.id ||
              "";
            store.startWork(
              activeModal.order.id,
              segId,
              "أحمد عادل",
              "الإنتاج والإصلاح",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "COMPLETE" && (
        <RecordCompletionDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          stageName="قسم الإنتاج والإصلاح"
          availableQty={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "الإنتاج والإصلاح")
          }
          onConfirm={(qty: number) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الإنتاج والإصلاح",
              )?.id ||
              "";
            store.recordDepartmentCompletion(
              activeModal.order.id,
              segId,
              qty,
              "أحمد عادل",
              "الإنتاج والإصلاح",
            );
            store.transferCompleted(
              activeModal.order.id,
              segId,
              qty,
              "الجودة والتغليف",
              "أحمد عادل",
              "الإنتاج والإصلاح",
            );
          }}
        />
      )}
    </div>
  );
}
