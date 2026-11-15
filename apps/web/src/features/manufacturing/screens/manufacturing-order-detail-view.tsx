"use client";
import { salesUuidSchema, type QualityActivityItem } from "@template/contracts";
import {
  useQualityOperationalScope,
  qualityScopeKey,
} from "@/shared/query/operational-scope";
import {
  useQualityOrder,
  useQualityOrderHistory,
} from "../hooks/quality.hooks";
import { QualityCommandRecovery } from "../components/quality-command-recovery";
import { toQualityTracking } from "../model/quality-view.model";
import { toQualityEventSummary } from "../model/quality-event.model";
import { qualityFailureMessage } from "../model/quality-form.model";

import type { ManufacturingDepartment } from "@template/contracts";
import { WarehouseOrderDetailView } from "@/features/warehouse/components/warehouse-order-detail";
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
import { useSearchParams } from "next/navigation";
import { typeLabels, type Role } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { OrderDetailTabs } from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";

export function ManufacturingOrderDetailView(
  props: Readonly<{
    orderId: string;
    deptRole?: Exclude<Role, "admin" | "sales" | "approval">;
  }>,
) {
  const role = props.deptRole ?? "cutting";
  if (role === "warehouse")
    return <WarehouseOrderDetailView orderId={props.orderId} />;
  if (role === "quality")
    return <QualityOrderDetailScope orderId={props.orderId} />;
  return (
    <PersistedManufacturingOrderDetailView
      orderId={props.orderId}
      department={role === "cutting" ? "CUTTING" : "PRODUCTION"}
      key={`${role}/${props.orderId}`}
    />
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

function QualityOrderDetailScope({ orderId }: { orderId: string }) {
  const scope = useQualityOperationalScope();
  return scope ? (
    <QualityOrderDetailView
      key={`${qualityScopeKey(scope).join("/")}/${orderId}`}
      orderId={orderId}
    />
  ) : null;
}
export function QualityHistoryEventContent({
  item,
}: {
  item: QualityActivityItem;
}) {
  if (item.kind === "manufacturing")
    return <>{toManufacturingEventSummary(item.event)}</>;
  if (item.kind === "issue")
    return (
      <>
        {item.event.operation === "REPORT_ISSUE"
          ? "تسجيل مشكلة"
          : item.event.result === "RELEASED"
            ? "إعادة معتمدة للقسم"
            : item.event.result === "CANCELLED"
              ? "إلغاء القطعة"
              : "مراجعة المشكلة"}{" "}
        · {item.event.reason ?? item.event.notes ?? "—"}
        {item.event.correctionResolution && (
          <p>
            إلغاء دورة التصحيح {item.event.correctionResolution.cycle} ·{" "}
            {item.event.correctionResolution.correctionId}
          </p>
        )}
        <p>القطعة: {item.event.pieceId}</p>
      </>
    );
  return (
    <>
      {toQualityEventSummary(item.event)}
      {item.event.inspection?.packing && (
        <p>
          قطع مجموعة التغليف:{" "}
          {item.event.inspection.packing.acceptedPieceIds.join("، ")}
        </p>
      )}
    </>
  );
}
function QualityOrderDetailView({ orderId }: { orderId: string }) {
  const query = useQualityOrder(orderId),
    params = useSearchParams(),
    tab = params.get("tab"),
    [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
      tab === "form" || tab === "history" ? tab : "tracking",
    ),
    [page, setPage] = useState(1);
  const requestedPiece = params.get("pieceId"),
    piece = salesUuidSchema.safeParse(requestedPiece),
    invalidPiece = requestedPiece !== null && !piece.success,
    history = useQualityOrderHistory(
      activeTab === "history" && !invalidPiece ? orderId : null,
      { page, limit: 25, ...(piece.success ? { pieceId: piece.data } : {}) },
    );
  const [filter, setFilter] = useState(requestedPiece);
  if (filter !== requestedPiece) {
    setFilter(requestedPiece);
    setPage(1);
  }
  if (history.data && page > Math.max(1, history.data.pagination.totalPages))
    setPage(Math.max(1, history.data.pagination.totalPages));
  if (query.isPending)
    return (
      <>
        <QualityCommandRecovery />
        <p role="status">جارٍ تحميل أمر التفصيل…</p>
      </>
    );
  if (!query.data)
    return (
      <>
        <QualityCommandRecovery />
        <div role="alert">
          {qualityFailureMessage(
            query.error,
            "تحميل أمر التفصيل",
            undefined,
            "read",
          )}
          <button
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </>
    );
  const { order } = query.data.paper;
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الجودة والتغليف / تفاصيل أمر التفصيل"
        title={`أمر تفصيل ${typeLabels[order.type]} — ${order.customerName}`}
        subtitle={`${order.businessNumber} · موعد التسليم: ${order.deliveryDate ?? "غير محدد"}`}
        actions={
          <Link className="btn-pill btn-secondary" href="/quality/dashboard">
            العودة للقسم
          </Link>
        }
      />
      <QualityCommandRecovery />
      {query.isFetching && <p role="status">جارٍ تحديث أمر التفصيل…</p>}
      {query.isError && (
        <div role="alert">
          {qualityFailureMessage(
            query.error,
            "تحديث أمر التفصيل",
            undefined,
            "read",
          )}
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
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
        <>
          <OrderFullTrackingView projection={toQualityTracking(query.data)} />
          <section className="space-y-3">
            {query.data.packingGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <strong>مجموعة التغليف</strong>
                <p>
                  الكراتين: {group.cartonCount ?? "—"} · الأرقام:{" "}
                  {group.cartonNumbers ?? "—"}
                </p>
                <p>{group.inspectorNote}</p>
                <p>
                  {group.inspector.fullName} · {group.packedAt}
                </p>
                <p>القطع المقبولة: {group.acceptedPieceIds.join("، ")}</p>
              </div>
            ))}
          </section>
        </>
      )}
      {activeTab === "form" && <FactoryOrderPaper data={query.data.paper} />}
      {activeTab === "history" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {invalidPiece && (
            <p role="alert">مرجع القطعة غير متاح؛ راجع الرابط.</p>
          )}
          {!invalidPiece && history.isPending && (
            <p role="status">جارٍ تحميل السجل…</p>
          )}
          {history.isError && (
            <div role="alert">
              {qualityFailureMessage(
                history.error,
                "تحميل السجل",
                undefined,
                "read",
              )}
              <button
                onClick={() => {
                  void history.refetch();
                }}
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          {history.isFetching && history.data && (
            <p role="status">جارٍ تحديث السجل…</p>
          )}
          {history.data && !invalidPiece && (
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
                  render: (row) => <QualityHistoryEventContent item={row} />,
                },
                {
                  header: "المهمة",
                  render: (row) =>
                    row.kind === "issue" ? (
                      <Link
                        href={`/quality/tasks/${orderId}?pieceId=${row.event.pieceId}`}
                      >
                        عرض مهمة القطعة
                      </Link>
                    ) : (
                      <Link href={`/quality/tasks/${orderId}`}>
                        اختيار قطعة
                      </Link>
                    ),
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
