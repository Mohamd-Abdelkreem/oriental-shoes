"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw, Sparkles } from "lucide-react";
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
  StartWorkDialog,
} from "@/features/prototype/components/action-dialogs";
import { FactoryTaskDetailView } from "./factory-task-detail-view";
import { DepartmentOrderTable } from "./department-order-table";

export function SpecialOpsWorkspace() {
  const pathname = usePathname();
  const store = useMvpStore();

  const [activeModal, setActiveModal] = useState<{
    type: "RECEIPT" | "START" | "COMPLETE" | "RECEIVE_AND_START";
    order: MvpOrder;
    segment?: QuantitySegment | undefined;
  } | null>(null);

  const specialOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "العمليات الخاصة") > 0 ||
      (o.stage === "العمليات الخاصة" &&
        o.status !== "مسودة" &&
        o.status !== "ملغي"),
  );

  const incomingOrders = specialOrders.filter(
    (o) =>
      o.status === "بانتظار البدء في العمليات الخاصة" ||
      o.status === "محول للعمليات الخاصة" ||
      o.segments.some(
        (s) => s.stage === "العمليات الخاصة" && s.state === "بانتظار الاستلام",
      ),
  );
  const inProgressOrders = specialOrders.filter(
    (o) =>
      o.status === "قيد العمليات الخاصة" ||
      o.segments.some(
        (s) =>
          s.stage === "العمليات الخاصة" &&
          (s.state === "قيد التنفيذ" || s.state === "بانتظار بدء العمل"),
      ),
  );
  const returnedOrders = store.orders.filter(
    (o) =>
      o.status === "معاد للعمليات الخاصة للتصحيح" ||
      o.segments.some(
        (s) => s.stage === "العمليات الخاصة" && s.state === "معادة من الجودة",
      ),
  );
  const completedOrders = store.orders.filter(
    (o) =>
      stageQuantity(o, "الجودة والتغليف") > 0 ||
      stageQuantity(o, "المستودع") > 0,
  );

  const kpis: KpiCardItem[] = [
    {
      title: "وارد يتطلب تشطيب خاص",
      value: incomingOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(incomingOrders.reduce((s, o) => s + stageQuantity(o, "العمليات الخاصة"), 0))} تتطلب تطريز/نقش`,
      icon: Clock,
      tone: incomingOrders.length > 0 ? "amber" : "neutral",
      href: "/special-operations/incoming",
    },
    {
      title: "قيد التشغيل الخاص الآن",
      value: inProgressOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(inProgressOrders.reduce((s, o) => s + stageQuantity(o, "العمليات الخاصة"), 0))} تحت ماكينات الليزر`,
      icon: Sparkles,
      tone: "teal",
      href: "/special-operations/in-progress",
    },
    {
      title: "معاد للتصحيح من الجودة",
      value: returnedOrders.length,
      unit: "أمر تفصيل",
      subtitle: "قطع تتطلب إعادة ضبط الملمس أو النقش",
      icon: RotateCcw,
      tone: returnedOrders.length > 0 ? "rose" : "neutral",
      href: "/special-operations/returned",
    },
    {
      title: "أنجزت وحولت للجودة",
      value: completedOrders.length,
      unit: "أمر تفصيل",
      subtitle: "انتهت عملياتها الخاصة بنجاح",
      icon: CheckCircle2,
      tone: "emerald",
      href: "/special-operations/completed",
    },
  ];

  // Route: /special-operations/tasks/:taskId
  if (pathname.includes("/special-operations/tasks/")) {
    const taskId = decodeURIComponent(pathname.split("/").at(-1) || "");

    return (
      <>
        <FactoryTaskDetailView
          orderId={taskId}
          role="special"
          currentStage="العمليات الخاصة"
          onConfirmReceipt={(o, s) => {
            setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
          }}
          onStartWork={(o, s) => {
            setActiveModal({ type: "START", order: o, segment: s });
          }}
          onRecordCompletion={(o, s) => {
            setActiveModal({ type: "COMPLETE", order: o, segment: s });
          }}
        />

        {/* Modals */}
        {activeModal && activeModal.type === "RECEIVE_AND_START" && (
          <ReceiveAndStartDialog
            open={true}
            onClose={() => {
              setActiveModal(null);
            }}
            orderId={activeModal.order.id}
            department="العمليات الخاصة"
            actionTitle="استلام وبدء العملية الخاصة"
            quantity={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "العمليات الخاصة")
            }
            defaultWorker="فهد ياسين"
            onConfirm={(worker) => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "العمليات الخاصة",
                )?.id ||
                "";
              store.receiveAndStart(
                activeModal.order.id,
                segId,
                worker,
                "العمليات الخاصة",
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
              stageQuantity(activeModal.order, "العمليات الخاصة")
            }
            sourceDept="الإنتاج والإصلاح"
            currentDept="العمليات الخاصة"
            onConfirm={() => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "العمليات الخاصة",
                )?.id ||
                "";
              store.confirmReceipt(
                activeModal.order.id,
                segId,
                "فهد ياسين",
                "العمليات الخاصة",
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
            stageName="قسم العمليات الخاصة"
            quantity={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "العمليات الخاصة")
            }
            onConfirm={() => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "العمليات الخاصة",
                )?.id ||
                "";
              store.startWork(
                activeModal.order.id,
                segId,
                "فهد ياسين",
                "العمليات الخاصة",
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
            stageName="قسم العمليات الخاصة"
            availableQty={
              activeModal.segment?.quantity ||
              stageQuantity(activeModal.order, "العمليات الخاصة")
            }
            onConfirm={(qty: number) => {
              const segId =
                activeModal.segment?.id ||
                activeModal.order.segments.find(
                  (s) => s.stage === "العمليات الخاصة",
                )?.id ||
                "";
              store.recordDepartmentCompletion(
                activeModal.order.id,
                segId,
                qty,
                "فهد ياسين",
                "العمليات الخاصة",
              );
              store.transferCompleted(
                activeModal.order.id,
                segId,
                qty,
                "الجودة والتغليف",
                "فهد ياسين",
                "العمليات الخاصة",
              );
            }}
          />
        )}
      </>
    );
  }

  // Route: /special-operations/activity
  if (pathname.endsWith("/special-operations/activity")) {
    const events = store.events.filter(
      (e) => e.role === "العمليات الخاصة" || e.stage === "العمليات الخاصة",
    );
    return (
      <div className="space-y-6">
        <OrientalPageHeader
          eyebrow="قسم العمليات الخاصة / سجل العمليات"
          title="سجل نشاط العمليات الخاصة"
          subtitle="توثيق عمليات النقش بالليزر، التطريز الفاخر، والصب الخاص"
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
                    href={`/special-operations/tasks/${e.orderId}`}
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
  let activeTabTitle = "لوحة تحكم العمليات الخاصة";
  let activeTabSubtitle =
    "تنفيذ تعليمات التفصيل الحصرية: حفر الاسم بالليزر، التطريز اليدوي، والتلوين الخاص";
  let activeTableOrders = specialOrders;
  let actionLabel: string | undefined = undefined;
  let onTableAction: ((o: MvpOrder, s?: QuantitySegment) => void) | undefined =
    undefined;

  if (
    pathname.endsWith("/special-operations/incoming") ||
    pathname.endsWith("/special-operations/waiting")
  ) {
    activeTabTitle = "وارد للعمليات الخاصة";
    activeTabSubtitle =
      "أوامر واردة من ورشة الإنتاج لتنفيذ تطعيمات ونقش ليزر خاص";
    activeTableOrders = incomingOrders;
    actionLabel = "استلام وبدء العملية الخاصة";
    onTableAction = (o, s) => {
      setActiveModal({ type: "RECEIVE_AND_START", order: o, segment: s });
    };
  } else if (pathname.endsWith("/special-operations/in-progress")) {
    activeTabTitle = "أوامر قيد التشغيل الخاص";
    activeTabSubtitle =
      "الأوامر المستلمة الجاري تنفيذ حفر الليزر أو التطريز عليها";
    activeTableOrders = inProgressOrders;
    actionLabel = "تسجيل إنجاز وتحويل للجودة";
    onTableAction = (o, s) => {
      setActiveModal({ type: "COMPLETE", order: o, segment: s });
    };
  } else if (pathname.endsWith("/special-operations/returned")) {
    activeTabTitle = "أوامر معادة للتصحيح";
    activeTabSubtitle = "قطع معادة من الجودة لتصحيح عيوب النقش أو التطريز";
    activeTableOrders = returnedOrders;
    actionLabel = "معالجة وتحويل للجودة";
    onTableAction = (o, s) => {
      setActiveModal({ type: "COMPLETE", order: o, segment: s });
    };
  } else if (
    pathname.endsWith("/special-operations/completed") ||
    pathname.endsWith("/special-operations/sent")
  ) {
    activeTabTitle = "المنجز والمحوّل إلى الجودة";
    activeTabSubtitle =
      "القطع التي تم إنجاز أعمالها الخاصة وتحويلها بنجاح لمحطة فحص الجودة";
    activeTableOrders = completedOrders;
  }

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم العمليات الخاصة"
        title={activeTabTitle}
        subtitle={activeTabSubtitle}
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      <DepartmentOrderTable
        orders={activeTableOrders}
        deptRole="special"
        stageName="العمليات الخاصة"
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
          department="العمليات الخاصة"
          actionTitle="استلام وبدء العملية الخاصة"
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "العمليات الخاصة")
          }
          defaultWorker="فهد ياسين"
          onConfirm={(worker) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "العمليات الخاصة",
              )?.id ||
              "";
            store.receiveAndStart(
              activeModal.order.id,
              segId,
              worker,
              "العمليات الخاصة",
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
            stageQuantity(activeModal.order, "العمليات الخاصة")
          }
          sourceDept="الإنتاج والإصلاح"
          currentDept="العمليات الخاصة"
          onConfirm={() => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "العمليات الخاصة",
              )?.id ||
              "";
            store.confirmReceipt(
              activeModal.order.id,
              segId,
              "فهد ياسين",
              "العمليات الخاصة",
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
          stageName="قسم العمليات الخاصة"
          availableQty={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "العمليات الخاصة")
          }
          onConfirm={(qty: number) => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find(
                (s) => s.stage === "العمليات الخاصة",
              )?.id ||
              "";
            store.recordDepartmentCompletion(
              activeModal.order.id,
              segId,
              qty,
              "فهد ياسين",
              "العمليات الخاصة",
            );
            store.transferCompleted(
              activeModal.order.id,
              segId,
              qty,
              "الجودة والتغليف",
              "فهد ياسين",
              "العمليات الخاصة",
            );
          }}
        />
      )}
    </div>
  );
}
