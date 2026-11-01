"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Clock, PackageCheck, RotateCcw } from "lucide-react";
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
  QualityInspectionDialog,
  ReceiveAndStartDialog,
} from "@/features/prototype/components/action-dialogs";
import { FactoryTaskDetailView } from "./factory-task-detail-view";
import { DepartmentOrderTable } from "./department-order-table";
import { DepartmentDashboardOverview } from "./department-dashboard-overview";
import { dashboardPieceCounts } from "./department-dashboard-counts";
import type { DepartmentTab } from "./department-order-tabs";

export function QualityWorkspace() {
  const pathname = usePathname();
  const store = useMvpStore();

  const [activeModal, setActiveModal] = useState<{
    type: "RECEIPT" | "INSPECT" | "COMPLETE" | "RECEIVE_AND_START";
    order: MvpOrder;
    segment?: QuantitySegment | undefined;
  } | null>(null);

  const qualityOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "الجودة والتغليف") > 0 ||
      (o.stage === "الجودة والتغليف" &&
        o.status !== "مسودة" &&
        o.status !== "ملغي"),
  );

  const incomingOrders = qualityOrders.filter(
    (o) =>
      o.status === "بانتظار البدء في الفحص" ||
      o.status === "محول للجودة" ||
      o.segments.some(
        (s) =>
          s.stage === "الجودة والتغليف" &&
          (s.state === "بانتظار الاستلام" || s.state === "بانتظار الفحص"),
      ),
  );
  const inProgressOrders = qualityOrders.filter(
    (o) =>
      o.status === "قيد الفحص والتغليف" ||
      o.segments.some(
        (s) =>
          s.stage === "الجودة والتغليف" &&
          (s.state === "قيد التنفيذ" || s.state === "بانتظار بدء العمل"),
      ),
  );
  const correctionsCycleOrders = store.orders.filter(
    (o) =>
      [
        "معاد للقص للتصحيح",
        "معاد للإنتاج للتصحيح",
        "معاد للعمليات الخاصة للتصحيح",
      ].includes(o.status) ||
      o.segments.some((s) => s.state === "معادة من الجودة"),
  );
  const passedOrders = store.orders.filter(
    (o) => stageQuantity(o, "المستودع") > 0,
  );

  const kpis: KpiCardItem[] = [
    {
      title: "وارد بانتظار الفحص",
      value: incomingOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(incomingOrders.reduce((s, o) => s + stageQuantity(o, "الجودة والتغليف"), 0))} وصلت محطة الفحص`,
      icon: Clock,
      tone: incomingOrders.length > 0 ? "amber" : "neutral",
      href: "/quality/incoming",
    },
    {
      title: "تحت الفحص والمطابقة الآن",
      value: inProgressOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(inProgressOrders.reduce((s, o) => s + stageQuantity(o, "الجودة والتغليف"), 0))} تحت التدقيق والقياس`,
      icon: PackageCheck,
      tone: "teal",
      href: "/quality/inspection",
    },
    {
      title: "دورات التصحيح الجارية بالورش",
      value: correctionsCycleOrders.length,
      unit: "أمر تفصيل",
      subtitle: "قطع معادة للأقسام لإصلاح عيوب محددة",
      icon: RotateCcw,
      tone: correctionsCycleOrders.length > 0 ? "rose" : "neutral",
      href: "/quality/corrections",
    },
    {
      title: "اجتاز الفحص وتم تغليفه",
      value: passedOrders.length,
      unit: "أمر تفصيل",
      subtitle: "تم تغليفها وإرسالها للمستودع النهائي",
      icon: CheckCircle2,
      tone: "emerald",
      href: "/quality/accepted",
    },
  ];

  // Route: /quality/tasks/:taskId
  if (pathname.includes("/quality/tasks/")) {
    const taskId = decodeURIComponent(pathname.split("/").at(-1) || "");

    return (
      <>
        <FactoryTaskDetailView
          orderId={taskId}
          role="quality"
          currentStage="الجودة والتغليف"
          onConfirmReceipt={(o, s) => {
            setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
          }}
          onStartWork={(o, s) => {
            setActiveModal({ type: "INSPECT", order: o, segment: s });
          }}
        />

        {/* Quality Action Dialogs */}
        {activeModal && activeModal.type === "RECEIVE_AND_START" && (
          <ReceiveAndStartDialog
            open={true}
            onClose={() => {
              setActiveModal(null);
            }}
            orderId={activeModal.order.id}
            department="الجودة والتغليف"
            actionTitle="استلام وبدء الفحص"
            quantity={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "الجودة والتغليف")
            }
            defaultWorker="منى سعيد"
            onConfirm={(worker) => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "الجودة والتغليف",
                )?.id ||
                "";
              store.receiveAndStart(
                activeModal.order.id,
                segId,
                worker,
                "الجودة والتغليف",
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
              stageQuantity(activeModal.order, "الجودة والتغليف")
            }
            sourceDept="قسم الإنتاج والإصلاح"
            currentDept="الجودة والتغليف"
            onConfirm={() => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "الجودة والتغليف",
                )?.id ||
                "";
              store.confirmReceipt(
                activeModal.order.id,
                segId,
                "منى سعيد",
                "الجودة والتغليف",
              );
            }}
          />
        )}

        {activeModal && activeModal.type === "INSPECT" && (
          <QualityInspectionDialog
            open={true}
            onClose={() => {
              setActiveModal(null);
            }}
            orderId={activeModal.order.id}
            availableQty={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "الجودة والتغليف")
            }
            onConfirm={(data) => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "الجودة والتغليف",
                )?.id ||
                "";
              store.submitQualityInspection(
                activeModal.order.id,
                segId,
                data,
                "منى سعيد",
              );
            }}
          />
        )}
      </>
    );
  }

  // Route: /quality/activity
  if (pathname.endsWith("/quality/activity")) {
    const events = store.events.filter(
      (e) => e.role === "الجودة والتغليف" || e.stage === "الجودة والتغليف",
    );
    return (
      <div className="space-y-6">
        <OrientalPageHeader
          eyebrow="قسم الجودة والتغليف / سجل العمليات"
          title="سجل نشاط فحص الجودة والتغليف"
          subtitle="توثيق قرارات قبول الدفعات، تقارير العيوب، وتوجيه الإعادات للتصحيح"
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
                    href={`/quality/tasks/${e.orderId}`}
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

  const isIncoming =
    pathname.endsWith("/quality/incoming") ||
    pathname.endsWith("/quality/waiting");
  const isInProgress = pathname.endsWith("/quality/inspection");
  const isCorrections =
    pathname.endsWith("/quality/corrections") ||
    pathname.endsWith("/quality/reinspection");
  const isCompleted =
    pathname.endsWith("/quality/accepted") ||
    pathname.endsWith("/quality/sent") ||
    pathname.endsWith("/quality/completed");
  const isDashboard =
    !isIncoming && !isInProgress && !isCorrections && !isCompleted;

  if (isDashboard) {
    const pieceCounts = dashboardPieceCounts(qualityOrders, "quality");
    return (
      <div className="space-y-6">
        <OrientalPageHeader
          eyebrow="قسم الجودة والتغليف"
          title="لوحة تحكم الجودة والتغليف"
          subtitle="تحليل ومتابعة سريعة لمحطات الفحص المخبري، الاعتماد، والتغليف الفاخر"
        />

        <OrientalKpiGrid cards={kpis} columns={4} />

        <DepartmentDashboardOverview
          deptRole="quality"
          orders={qualityOrders}
          incomingOrdersCount={incomingOrders.length}
          incomingPiecesCount={pieceCounts.incoming}
          inProgressOrdersCount={inProgressOrders.length}
          inProgressPiecesCount={pieceCounts.inProgress}
          returnedOrdersCount={correctionsCycleOrders.length}
          returnedPiecesCount={pieceCounts.returned}
          completedOrdersCount={passedOrders.length}
          completedPiecesCount={pieceCounts.completed}
        />
      </div>
    );
  }

  // Dedicated subpages view logic
  let activeTabTitle = "وارد للجودة والتغليف";
  let activeTabSubtitle =
    "أوامر منجزة من قسم الإنتاج والإصلاح بانتظار استلام وبدء الفحص والمطابقة";
  let forcedTab: DepartmentTab = "ready";
  let actionLabel: string | undefined = "بدء الفحص";
  let onTableAction:
    ((o: MvpOrder, s?: QuantitySegment) => void) | undefined = (o, s) => {
    setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
  };

  if (isInProgress) {
    activeTabTitle = "محطة الفحص والمطابقة";
    activeTabSubtitle =
      "الأوامر والقطع المستلمة الجاري فحصها حالياً وتسجيل نتيجة القبول أو العيب";
    forcedTab = "in_progress";
    actionLabel = "تسجيل نتيجة الفحص";
    onTableAction = (o, s) => {
      setActiveModal({ type: "INSPECT", order: o, segment: s });
    };
  } else if (isCorrections) {
    activeTabTitle = "متابعة دورات التصحيح وإعادة الفحص";
    activeTabSubtitle =
      "قطع مرفوضة معادة للتصحيح بالورش أو عادت للفحص للتأكد من زوال العيب";
    forcedTab = "problems";
    actionLabel = "إعادة الفحص";
    onTableAction = (o, s) => {
      setActiveModal({ type: "INSPECT", order: o, segment: s });
    };
  } else if (isCompleted) {
    activeTabTitle = "المجاز والمغلف والمحوّل للمستودع";
    activeTabSubtitle =
      "القطع التي اجتازت معايير الجودة وتم وضعها في الكراتين وإرسالها للمستودع";
    forcedTab = "completed";
    actionLabel = undefined;
    onTableAction = undefined;
  }

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم الجودة والتغليف"
        title={activeTabTitle}
        subtitle={activeTabSubtitle}
      />

      <DepartmentOrderTable
        orders={qualityOrders}
        deptRole="quality"
        stageName="الجودة والتغليف"
        forcedTab={forcedTab}
        hideTabs={true}
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
          department="الجودة والتغليف"
          actionTitle="استلام وبدء الفحص"
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "الجودة والتغليف")
          }
          defaultWorker="منى سعيد"
          onConfirm={(worker) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الجودة والتغليف",
              )?.id ||
              "";
            store.receiveAndStart(
              activeModal.order.id,
              segId,
              worker,
              "الجودة والتغليف",
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
            stageQuantity(activeModal.order, "الجودة والتغليف")
          }
          sourceDept="قسم الإنتاج والإصلاح"
          currentDept="الجودة والتغليف"
          onConfirm={() => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الجودة والتغليف",
              )?.id ||
              "";
            store.confirmReceipt(
              activeModal.order.id,
              segId,
              "منى سعيد",
              "الجودة والتغليف",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "INSPECT" && (
        <QualityInspectionDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          availableQty={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "الجودة والتغليف")
          }
          onConfirm={(data) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "الجودة والتغليف",
              )?.id ||
              "";
            store.submitQualityInspection(
              activeModal.order.id,
              segId,
              data,
              "منى سعيد",
            );
          }}
        />
      )}
    </div>
  );
}
