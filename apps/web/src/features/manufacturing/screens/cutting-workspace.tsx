"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw, Scissors } from "lucide-react";
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
  ReceiveAndStartDialog,
  RecordCompletionDialog,
} from "@/features/prototype/components/action-dialogs";
import { FactoryTaskDetailView } from "./factory-task-detail-view";
import { DepartmentOrderTable } from "./department-order-table";

export function CuttingWorkspace() {
  const pathname = usePathname();
  const store = useMvpStore();

  // Active modal state
  const [activeModal, setActiveModal] = useState<{
    type: "RECEIVE_AND_START" | "COMPLETE";
    order: MvpOrder;
    segment?: QuantitySegment | undefined;
  } | null>(null);

  // Filter orders related to cutting
  const cuttingOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "القص") > 0 ||
      (o.stage === "القص" && o.status !== "مسودة" && o.status !== "ملغي"),
  );

  const incomingOrders = cuttingOrders.filter(
    (o) =>
      o.status === "بانتظار البدء في القص" ||
      o.status === "معتمد للدخول للمصنع" ||
      o.segments.some(
        (s) =>
          s.stage === "القص" &&
          (s.state === "بانتظار الاستلام" || s.state === "بانتظار بدء العمل"),
      ),
  );
  const inProgressOrders = cuttingOrders.filter(
    (o) =>
      o.status === "قيد القص" ||
      o.segments.some((s) => s.stage === "القص" && s.state === "قيد التنفيذ"),
  );
  const returnedOrders = store.orders.filter(
    (o) =>
      o.status === "معاد للقص للتصحيح" ||
      o.segments.some(
        (s) => s.stage === "القص" && s.state === "معادة من الجودة",
      ),
  );
  const completedOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "الإنتاج والإصلاح") > 0 ||
      stageQuantity(o, "الجودة والتغليف") > 0 ||
      stageQuantity(o, "المستودع") > 0,
  );

  const kpis: KpiCardItem[] = [
    {
      title: "وارد للقص بانتظار الاستلام والبدء",
      value: incomingOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(incomingOrders.reduce((s, o) => s + stageQuantity(o, "القص"), 0))} معتمدة وجاهزة للبدء`,
      icon: Clock,
      tone: incomingOrders.length > 0 ? "amber" : "neutral",
      href: "/cutting/incoming",
    },
    {
      title: "قيد القص والتفصيل الآن",
      value: inProgressOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(inProgressOrders.reduce((s, o) => s + stageQuantity(o, "القص"), 0))} تحت التشغيل بالمقصدار`,
      icon: Scissors,
      tone: "teal",
      href: "/cutting/in-progress",
    },
    {
      title: "معاد للتصحيح من الجودة",
      value: returnedOrders.length,
      unit: "أمر تفصيل",
      subtitle: "يتطلب إعادة قص قطع معيبة فوراً",
      icon: RotateCcw,
      tone: returnedOrders.length > 0 ? "rose" : "neutral",
      href: "/cutting/returned",
    },
    {
      title: "المنجز والمحوّل إلى الإنتاج",
      value: completedOrders.length,
      unit: "أمر تفصيل",
      subtitle: "انتقل لقسم الإنتاج والإصلاح بنجاح",
      icon: CheckCircle2,
      tone: "emerald",
      href: "/cutting/completed",
    },
  ];

  // Route: /cutting/tasks/:taskId
  if (pathname.includes("/cutting/tasks/")) {
    const taskId = decodeURIComponent(pathname.split("/").at(-1) || "");

    return (
      <>
        <FactoryTaskDetailView
          orderId={taskId}
          role="cutting"
          currentStage="القص"
          onConfirmReceipt={(o, s) => {
            setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
          }}
          onRecordCompletion={(o, s) => {
            setActiveModal({ type: "COMPLETE", order: o, segment: s });
          }}
        />

        {/* Modal integrations */}
        {activeModal && activeModal.type === "RECEIVE_AND_START" && (
          <ReceiveAndStartDialog
            open={true}
            onClose={() => {
              setActiveModal(null);
            }}
            orderId={activeModal.order.id}
            quantity={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "القص")
            }
            deptName="قسم القص والتفصيل"
            actionLabel="استلام وبدء القص"
            assignedWorker="سالم الحربي"
            onConfirm={() => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find((s) => s.stage === "القص")
                  ?.id ||
                "";
              store.receiveAndStart(
                activeModal.order.id,
                segId,
                "سالم الحربي",
                "قسم القص",
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
            stageName="قسم القص"
            availableQty={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "القص")
            }
            onConfirm={(qty: number) => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find((s) => s.stage === "القص")
                  ?.id ||
                "";
              store.recordDepartmentCompletion(
                activeModal.order.id,
                segId,
                qty,
                "سالم الحربي",
                "قسم القص",
              );
              store.transferCompleted(
                activeModal.order.id,
                segId,
                qty,
                "الإنتاج والإصلاح",
                "سالم الحربي",
                "قسم القص",
              );
            }}
          />
        )}
      </>
    );
  }

  // Route: /cutting/activity
  if (pathname.endsWith("/cutting/activity")) {
    const events = store.events.filter(
      (e) => e.role === "القص والتفصيل" || e.stage === "القص والتفصيل",
    );
    return (
      <div className="space-y-6">
        <OrientalPageHeader
          eyebrow="قسم القص والتفصيل / سجل العمليات"
          title="سجل نشاط قسم القص والتفصيل"
          subtitle="توثيق استلام الأوامر، عمليات القص، والتحويل إلى قسم الإنتاج"
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
                    href={`/cutting/tasks/${e.orderId}`}
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

  // Common subpages view logic
  let activeTabTitle = "لوحة تحكم قسم القص والتفصيل";
  let activeTabSubtitle =
    "متابعة أوامر التفصيل الواردة من الاعتماد، استلام الجلود، وبدء تفصيل الأوجه والبطانات";
  let activeTableOrders = cuttingOrders;
  let actionLabel: string | undefined = undefined;
  let onTableAction: ((o: MvpOrder, s?: QuantitySegment) => void) | undefined =
    undefined;

  if (
    pathname.endsWith("/cutting/incoming") ||
    pathname.endsWith("/cutting/waiting")
  ) {
    activeTabTitle = "وارد للقص";
    activeTabSubtitle =
      "أوامر تفصيل معتمدة بانتظار استلام أمر التشغيل والبدء المباشر في تفصيل الأوجه والبطانات";
    activeTableOrders = incomingOrders;
    actionLabel = "استلام وبدء القص";
    onTableAction = (o, s) => {
      setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
    };
  } else if (pathname.endsWith("/cutting/in-progress")) {
    activeTabTitle = "أوامر قيد القص والتفصيل";
    activeTabSubtitle =
      "الأوامر المستلمة الجاري تفصيلها حالياً وتجهيزها للتحويل إلى قسم الإنتاج";
    activeTableOrders = inProgressOrders;
    actionLabel = "تسجيل إنجاز وتحويل";
    onTableAction = (o, s) => {
      setActiveModal({ type: "COMPLETE", order: o, segment: s });
    };
  } else if (pathname.endsWith("/cutting/returned")) {
    activeTabTitle = "أوامر معادة للتصحيح";
    activeTabSubtitle =
      "قطع معادة من فحص الجودة لوجود عيوب قص أو جلود، تتطلب إعادة تصنيع فورية";
    activeTableOrders = returnedOrders;
    actionLabel = "إعادة القص والتحويل";
    onTableAction = (o, s) => {
      setActiveModal({ type: "COMPLETE", order: o, segment: s });
    };
  } else if (
    pathname.endsWith("/cutting/completed") ||
    pathname.endsWith("/cutting/sent")
  ) {
    activeTabTitle = "المنجز والمحوّل إلى الإنتاج";
    activeTabSubtitle =
      "الأوامر التي تم إنجاز قصها وتحويلها بالكامل إلى قسم الإنتاج والتجميع";
    activeTableOrders = completedOrders;
  }

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم القص والتفصيل"
        title={activeTabTitle}
        subtitle={activeTabSubtitle}
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      <DepartmentOrderTable
        orders={activeTableOrders}
        deptRole="cutting"
        stageName="القص"
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
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "القص")
          }
          deptName="قسم القص والتفصيل"
          actionLabel="استلام وبدء القص"
          assignedWorker="سالم الحربي"
          onConfirm={() => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find((s) => s.stage === "القص")?.id ||
              "";
            store.receiveAndStart(
              activeModal.order.id,
              segId,
              "سالم الحربي",
              "قسم القص",
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
          stageName="قسم القص"
          availableQty={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "القص")
          }
          onConfirm={(qty: number) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find((s) => s.stage === "القص")?.id ||
              "";
            store.recordDepartmentCompletion(
              activeModal.order.id,
              segId,
              qty,
              "سالم الحربي",
              "قسم القص",
            );
            store.transferCompleted(
              activeModal.order.id,
              segId,
              qty,
              "الإنتاج والإصلاح",
              "سالم الحربي",
              "قسم القص",
            );
          }}
        />
      )}
    </div>
  );
}
