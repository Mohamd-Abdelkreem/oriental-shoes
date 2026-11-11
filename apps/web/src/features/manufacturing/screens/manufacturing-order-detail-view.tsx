"use client";
import type { ManufacturingDepartment } from "@template/contracts";
import { FactoryOrderPaper } from "@/features/orders/components/factory-order-paper";
import {
  useManufacturingOrder,
  useManufacturingOrderHistory,
} from "../hooks/manufacturing.hooks";
import { ManufacturingCommandRecovery } from "../components/manufacturing-command-recovery";
import { toManufacturingTracking } from "../model/manufacturing-view.model";
import { toManufacturingEventSummary } from "../model/manufacturing-event.model";
import { manufacturingFailureMessage } from "../model/manufacturing-form.model";

import { useState } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Boxes, Printer } from "lucide-react";
import {
  typeLabels,
  useMvpStore,
  type Role,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { OrderDetailTabs } from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";
import {
  WarehouseOrderBadge,
  WarehouseOrderOperations,
} from "./warehouse-order-operations";
import { getDeptArabicName } from "./get-dept-arabic-name";
import { getDeptLocation } from "./get-dept-location";

function LegacyManufacturingOrderDetailView({
  orderId,
  deptRole = "cutting",
}: {
  orderId: string;
  deptRole?: Exclude<Role, "admin" | "sales" | "approval">;
}) {
  const store = useMvpStore();
  const searchParams = useSearchParams();
  const paramTab = searchParams.get("tab");

  const order = store.orders.find((o) => o.id === orderId) ?? notFound();

  const deptRoleName = getDeptArabicName(deptRole);
  const targetLocation = getDeptLocation(deptRole);
  const basePath = deptRole;

  const [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
    paramTab === "tracking" || paramTab === "form" || paramTab === "history"
      ? paramTab
      : "tracking",
  );

  const activePieces = order.items.filter((p) => !p.isDeleted);
  const activePiecesCount = activePieces.length;
  const eventsCount = store.events.filter((e) => e.orderId === order.id).length;
  const deptPieces = activePieces.filter(
    (p) => p.currentLocation === targetLocation,
  );
  const problemPieces = activePieces.filter(
    (p) => p.problem || p.currentLocation === "لدى الاعتماد بسبب مشكلة",
  );

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`${deptRoleName} / تفاصيل أمر التفصيل / ${order.id}`}
        title={`أمر تفصيل ${typeLabels[order.type]} — ${order.customer}`}
        badge={
          <OrientalStatusPill tone={statusTone(order.status)}>
            {order.status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.salesperson} · موعد التسليم: ${order.delivery} · هاتف العميل: ${order.phone}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/print/order/${order.id}`}
              className="btn-pill btn-secondary"
              target="_blank"
            >
              <Printer size={15} />
              <span>معاينة الطباعة</span>
            </Link>
            <Link
              href={`/${basePath}/dashboard`}
              className="btn-pill btn-secondary"
            >
              <ArrowRight size={15} />
              <span>العودة لـ {deptRoleName}</span>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/80 bg-teal-50/50 px-4 py-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-white shadow-2xs">
            <Boxes size={15} />
          </span>
          <div>
            <strong className="font-bold text-teal-950">
              الموقف في {deptRoleName}: {deptPieces.length} من أصل{" "}
              {activePiecesCount} قطع متواجدة بالقسم الآن
            </strong>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {deptRole === "warehouse" && (
            <WarehouseOrderBadge order={order} activePieces={activePieces} />
          )}
          <span className="rounded-full bg-teal-100 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-900">
            {order.id}
          </span>
          <span className="rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
            {typeLabels[order.type]}
          </span>
        </div>
      </div>

      {deptRole === "warehouse" && (
        <WarehouseOrderOperations
          order={order}
          activePieces={activePieces}
          deptPieces={deptPieces}
        />
      )}

      {problemPieces.length > 0 && (
        <div className="space-y-2 rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-bold text-rose-900">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            <span>
              تنبيه: توجد عوائق أو مشكلات مسجلة على هذا الطلب (
              {String(problemPieces.length)} قطع):
            </span>
          </div>
          <div className="space-y-1.5 pt-1">
            {problemPieces.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white p-2.5"
              >
                <div>
                  <span className="font-bold text-slate-900">
                    {p.pieceNumber || "القطعة"} ({p.model} · مقاس {p.size})
                  </span>
                  <span className="mr-2 text-rose-700">
                    — المشكلة: <b>{p.problem?.reason}</b>
                    {p.problem?.notes ? ` (${p.problem.notes})` : ""}
                  </span>
                </div>
                <span className="rounded bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                  الموقع: {p.currentLocation}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={activePiecesCount}
        eventsCount={eventsCount}
      />

      <div className="pt-1">
        {activeTab === "tracking" && <OrderFullTrackingView order={order} />}

        {activeTab === "form" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <OrderPaperForm order={order} mode="readOnly" />
          </div>
        )}

        {activeTab === "history" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <OrientalTable
              data={store.events
                .filter((e) => e.orderId === order.id)
                .slice()
                .reverse()}
              keyExtractor={(e) => e.id}
              emptyTitle="لا توجد حركات مسجلة"
              emptySubtitle="لم تسجل أي أحداث تشغيلية لهذا الطلب بعد."
              columns={[
                {
                  header: "الحدث",
                  render: (e) => (
                    <strong className="text-slate-800">{e.event}</strong>
                  ),
                },
                {
                  header: "المنفذ",
                  render: (e) => `${e.actor} (${e.role})`,
                },
                {
                  header: "الوجهة",
                  render: (e) => e.destination || "—",
                },
                {
                  header: "التفاصيل والملاحظات",
                  render: (e) => e.note || "—",
                },
                {
                  header: "التوقيت",
                  accessor: "time",
                  className: "text-slate-400 font-mono text-xs",
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ManufacturingOrderDetailView(
  props: Parameters<typeof LegacyManufacturingOrderDetailView>[0],
) {
  const role = props.deptRole ?? "cutting";
  return role === "cutting" || role === "production" ? (
    <PersistedManufacturingOrderDetailView
      orderId={props.orderId}
      department={role === "cutting" ? "CUTTING" : "PRODUCTION"}
      key={`${role}/${props.orderId}`}
    />
  ) : (
    <LegacyManufacturingOrderDetailView {...props} />
  );
}
function PersistedManufacturingOrderDetailView({
  orderId,
  department,
}: {
  orderId: string;
  department: ManufacturingDepartment;
}) {
  const query = useManufacturingOrder(department, orderId),
    searchParams = useSearchParams();
  const tab = searchParams.get("tab"),
    [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
      tab === "form" || tab === "history" ? tab : "tracking",
    ),
    [page, setPage] = useState(1);
  const history = useManufacturingOrderHistory(
    department,
    activeTab === "history" ? orderId : null,
    { page, limit: 25 },
  );
  if (query.isPending) return <p role="status">جارٍ تحميل أمر التفصيل…</p>;
  if (!query.data)
    return (
      <div role="alert">
        {manufacturingFailureMessage(query.error, "تحميل أمر التفصيل")}
        <button
          onClick={() => {
            void query.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  const { order } = query.data.paper;
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`${department === "CUTTING" ? "القص" : "الإنتاج والإصلاح"} / تفاصيل أمر التفصيل`}
        title={`أمر تفصيل ${typeLabels[order.type]} — ${order.customerName}`}
        subtitle={`${order.businessNumber} · موعد التسليم: ${order.deliveryDate ?? "غير محدد"}`}
        actions={
          <Link
            className="btn-pill btn-secondary"
            href={
              department === "CUTTING"
                ? "/cutting/dashboard"
                : "/production/dashboard"
            }
          >
            العودة للقسم
          </Link>
        }
      />
      <ManufacturingCommandRecovery department={department} />
      {query.isError && (
        <p role="alert">
          {manufacturingFailureMessage(query.error, "تحديث أمر التفصيل")}
        </p>
      )}
      {query.data.paper.issues.map((issue) => (
        <div
          role="status"
          key={issue.issueId}
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs"
        >
          <strong>
            {issue.state === "RESOLVED"
              ? "مشكلة سابقة حُسمت — راجع تعليمات العودة المعتمدة"
              : "القطعة موقوفة للمراجعة — لا تعمل عليها قبل قرار معتمد"}
          </strong>
          <p>{issue.reason}</p>
          {issue.approvedInstructions && (
            <p>التعليمات المعتمدة: {issue.approvedInstructions}</p>
          )}
        </div>
      ))}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={order.counts.active}
        eventsCount={history.data?.pagination.total ?? 0}
        formLabel="المواصفات المعتمدة للمصنع"
      />
      {activeTab === "tracking" && (
        <OrderFullTrackingView
          projection={toManufacturingTracking(query.data)}
        />
      )}
      {activeTab === "form" && <FactoryOrderPaper data={query.data.paper} />}
      {activeTab === "history" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {history.isPending && <p role="status">جارٍ تحميل السجل…</p>}
          {history.isError && (
            <div role="alert">
              {manufacturingFailureMessage(history.error, "تحميل السجل")}
              <button
                onClick={() => {
                  void history.refetch();
                }}
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          {history.data && (
            <OrientalTable
              data={history.data.events}
              keyExtractor={(row) => `${row.kind}:${row.event.id}`}
              pagination={{
                page,
                totalPages: history.data.pagination.totalPages,
                total: history.data.pagination.total,
                onPageChange: setPage,
              }}
              columns={[
                { header: "الوقت", render: (row) => row.event.occurredAt },
                { header: "المنفذ", render: (row) => row.event.actor.fullName },
                {
                  header: "الحدث والبيان",
                  render: (row) =>
                    row.kind === "manufacturing"
                      ? toManufacturingEventSummary(row.event)
                      : `${row.event.operation === "REPORT_ISSUE" ? "تسجيل مشكلة" : row.event.result === "RELEASED" ? "إعادة معتمدة للقسم" : row.event.result === "CANCELLED" ? "إلغاء القطعة" : "مراجعة المشكلة"} · ${row.event.reason ?? row.event.notes ?? "—"}`,
                },
              ]}
              emptyTitle="لا توجد حركات مسجلة"
              emptySubtitle="لم تسجل حركات لهذا الطلب في القسم."
            />
          )}
        </section>
      )}
    </div>
  );
}
