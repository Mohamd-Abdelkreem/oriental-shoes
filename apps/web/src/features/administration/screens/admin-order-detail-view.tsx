"use client";

import { formatDraftReference } from "@template/contracts";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Printer, RotateCcw, Trash2 } from "lucide-react";
import {
  administrationOrderHistoryQuerySchema,
  salesUuidSchema,
} from "@template/contracts";
import {
  useAdministrationOperationalScope,
  type AdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import { orderTypeLabels } from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import {
  AdminCancelDialog,
  AdminReopenDialog,
} from "@/features/prototype/components/action-dialogs";
import {
  OrderPaperForm,
  type OrderPaperDataState,
} from "@/features/orders/components/order-paper-form";
import { OrderDetailTabs } from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";
import {
  toAuthoritativePaperState,
  toSalesOrderStatusLabel,
} from "@/features/sales/model/order-view.model";
import {
  administrationKeys,
  useAdministrationOrder,
  useAdministrationOrderHistory,
} from "../hooks/administration.hooks";
import { useAdministrationPageBounds } from "../hooks/administration-page-bounds.hooks";
import { useAdministrationDialogs } from "../hooks/administration-dialogs.hooks";
import {
  toAdministrationDraftPaper,
  toAdministrationPaper,
  toAdministrationTracking,
} from "../model/administration-view.model";
import { toAdministrationActivityRow } from "../model/administration-event.model";
import { administrationFailureMessage } from "../model/administration-form.model";

const draftPaperState: OrderPaperDataState = {
  kind: "draft",
  pricing: "unavailable",
  catalogOptions: {
    model: [],
    leatherBase: [],
    decoration: [],
    decorationColor: [],
    sole: [],
    soleAddition: [],
    soleColor: [],
    size: [],
  },
};
export function AdminOrderDetailView({ orderId }: { orderId: string }) {
  const scope = useAdministrationOperationalScope(),
    parsed = salesUuidSchema.safeParse(orderId);
  if (scope === null)
    return (
      <p role="alert">هذا السجل متاح للإدارة العامة بالحساب الحالي فقط.</p>
    );
  if (!parsed.success)
    return (
      <p role="alert">معرّف الطلب غير صالح؛ عد إلى سجل الطلبات واختر الطلب.</p>
    );
  return (
    <OrderDetail
      key={`${scope.actorId}/${String(scope.accessVersion)}/${String(scope.epoch)}/${parsed.data}`}
      orderId={parsed.data}
      scope={scope}
    />
  );
}
function OrderDetail({
  orderId,
  scope,
}: {
  orderId: string;
  scope: AdministrationOperationalScope;
}) {
  const response = useAdministrationOrder(orderId),
    detail = response.data;
  const [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
      "tracking",
    ),
    [historyPage, setHistoryPage] = useState(1);
  const availability = response.isError
    ? "error"
    : response.isFetching || !response.isSuccess
      ? "refreshing"
      : "ready";
  const dialogs = useAdministrationDialogs(orderId, availability);
  const historyQuery = administrationOrderHistoryQuerySchema.parse({
    page: historyPage,
  });
  const history = useAdministrationOrderHistory(
    activeTab === "history" && detail !== undefined ? orderId : null,
    historyQuery,
  );
  const bounds = useAdministrationPageBounds({
    resource: "order-history",
    query: { orderId, query: historyQuery },
    scope,
    currentKey: administrationKeys.orderHistory(scope, orderId, historyQuery),
    current: {
      data: history.data,
      status: history.status,
      fetchStatus: history.fetchStatus,
    },
    onNavigate: setHistoryPage,
  });
  if (detail === undefined)
    return (
      <div className="space-y-6">
        {response.isError ? (
          <div role="alert">
            {administrationFailureMessage(response.error, "review")}{" "}
            <button
              onClick={() => {
                void response.refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <p role="status">جارٍ تحميل الطلب…</p>
        )}
        <Link href="/admin/orders">العودة للطلبات</Link>
      </div>
    );
  const submitted = detail.kind === "submitted" ? detail : null;
  const reference =
    detail.kind === "draft"
      ? formatDraftReference(detail.draft.id, detail.draft.draftSequence)
      : detail.order.businessNumber;
  const order = detail.kind === "draft" ? detail.draft : detail.order;
  const customer =
    detail.kind === "draft"
      ? (detail.draft.customer?.name ?? "لم يحدد العميل")
      : detail.order.customerSnapshot.name;
  const status =
    detail.kind === "draft"
      ? "مسودة"
      : toSalesOrderStatusLabel(detail.order.status);
  const lastCorrection = submitted?.correction.lastCorrection;
  const disabled =
    availability !== "ready" || dialogs.pending || dialogs.preparing;
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`الإدارة العامة / تفاصيل الطلب / ${reference}`}
        title={`${orderTypeLabels[order.type]} — ${customer}`}
        badge={
          <OrientalStatusPill tone={statusTone(status)}>
            {status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.owner.fullName} · تاريخ التسليم: ${order.deliveryDate ?? "—"}`}
        actions={
          <div className="flex items-center gap-2">
            {submitted?.adminActions.canPrint && availability === "ready" && (
              <Link
                href={`/orders/${orderId}/print`}
                className="btn-pill btn-secondary"
                target="_blank"
              >
                <Printer size={15} />
                <span>طباعة أمر التفصيل الرسمي</span>
              </Link>
            )}
            {submitted?.adminActions.canCancel && (
              <button
                type="button"
                disabled={disabled}
                className="btn-pill btn-rose"
                onClick={() => {
                  void dialogs.openCancellation();
                }}
              >
                <Trash2 size={15} />
                <span>إلغاء كمية إدارياً</span>
              </button>
            )}
            {submitted?.adminActions.canCorrect && (
              <button
                type="button"
                disabled={disabled}
                className="btn-pill btn-teal"
                onClick={() => {
                  void dialogs.openCorrection();
                }}
              >
                <RotateCcw size={15} />
                <span>تصحيح بيانات أمر التفصيل</span>
              </button>
            )}
            <Link href="/admin/orders" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              <span>العودة للطلبات</span>
            </Link>
          </div>
        }
      />
      {response.isFetching && <p role="status">جارٍ تحديث الطلب…</p>}
      {response.isError && (
        <div role="alert">
          {administrationFailureMessage(response.error, "review")}{" "}
          <button
            onClick={() => {
              void response.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {dialogs.preparing && (
        <p role="status">جارٍ تحضير المراجعة من البيانات الحالية…</p>
      )}
      {dialogs.failure &&
        dialogs.cancelReview === null &&
        dialogs.correctionReview === null && (
          <p role="alert">{dialogs.failure}</p>
        )}
      {lastCorrection !== undefined && lastCorrection !== null && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <RotateCcw size={18} className="mt-0.5 shrink-0 text-teal-600" />
          <div>
            <strong className="block font-bold">
              تم تصحيح بيانات هذا الطلب إدارياً:
            </strong>
            <p className="mt-0.5 text-xs text-teal-800">
              بواسطة {lastCorrection.actor.fullName} بتاريخ{" "}
              {lastCorrection.occurredAt} · السبب: {lastCorrection.reason}
            </p>
          </div>
        </div>
      )}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={submitted?.order.counts.active ?? 0}
        eventsCount={detail.historyCount}
        formLabel="نموذج أمر التفصيل الورقي الكامل"
        historyLabel="سجل الرقابة والحركات"
      />
      <div className="pt-1">
        {activeTab === "tracking" &&
          (submitted === null ? (
            <p>
              مسودة لم تدخل التشغيل بعد؛ عدد البنود المحفوظة:{" "}
              {order.pieces.length}. بيانات الإنجاز والاستلام غير متاحة.
            </p>
          ) : (
            <OrderFullTrackingView
              projection={toAdministrationTracking(submitted)}
            />
          ))}
        {activeTab === "form" && (
          <div className="space-y-4">
            {detail.kind === "draft" ? (
              <OrderPaperForm
                order={toAdministrationDraftPaper(detail.draft)}
                mode="readOnly"
                dataState={draftPaperState}
                displayReference={reference}
              />
            ) : (
              <OrderPaperForm
                order={toAdministrationPaper(detail)}
                mode="readOnly"
                dataState={toAuthoritativePaperState(detail.order, null)}
                displayReference={reference}
              />
            )}
          </div>
        )}
        {activeTab === "history" && (
          <div className="space-y-4">
            {history.isFetching && <p role="status">جارٍ تحميل سجل الطلب…</p>}
            {history.isError && (
              <div role="alert">
                {administrationFailureMessage(history.error, "review")}{" "}
                <button
                  onClick={() => {
                    void history.refetch();
                  }}
                >
                  إعادة المحاولة
                </button>
              </div>
            )}
            <OrientalTable
              data={(history.data?.events ?? []).map(
                toAdministrationActivityRow,
              )}
              keyExtractor={(event) => event.id}
              pagination={{
                page: bounds.page,
                totalPages: bounds.totalPages ?? 0,
                total: bounds.total ?? 0,
                onPageChange: bounds.navigate,
              }}
              emptyTitle={
                history.data === undefined
                  ? history.isError
                    ? "تعذر تحميل السجل"
                    : "جارٍ تحميل السجل…"
                  : "لا توجد سجلات"
              }
              columns={[
                {
                  header: "الحدث والإجراء",
                  render: (event) => (
                    <strong className="text-slate-800">
                      {event.actionLabel}
                    </strong>
                  ),
                },
                {
                  header: "المنفذ",
                  render: (event) => (
                    <span className="text-xs">
                      {event.actorName} ({event.actorDepartmentLabel})
                    </span>
                  ),
                },
                {
                  header: "الكمية المعنية",
                  render: (event) =>
                    event.quantity === null
                      ? "—"
                      : `${String(event.quantity)} قطعة`,
                },
                {
                  header: "من / إلى",
                  render: (event) =>
                    `${event.sourceLabel ?? "—"} ← ${event.destinationLabel ?? "—"}`,
                },
                {
                  header: "الملاحظات",
                  render: (event) => (
                    <div className="text-xs text-slate-500">
                      <span>{event.note ?? "—"}</span>
                      <dl>
                        {event.correctionFields.map((field) => (
                          <div key={field.label}>
                            <dt>{field.label}</dt>
                            <dd>
                              {field.before ?? "—"} ← {field.after ?? "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ),
                },
                {
                  header: "التوقيت",
                  accessor: "occurredAt",
                  className: "text-slate-400 text-xs",
                },
              ]}
            />
          </div>
        )}
      </div>
      {submitted !== null && (
        <>
          <AdminCancelDialog
            open={dialogs.cancelReview !== null}
            onClose={dialogs.close}
            review={dialogs.cancelReview}
            form={dialogs.cancelForm}
            preparing={dialogs.preparing}
            pending={dialogs.pending}
            reviewRequired={dialogs.reviewRequired}
            failure={dialogs.failure}
            onReviewCurrent={dialogs.reviewCurrent}
            onConfirm={dialogs.confirmCancellation}
          />
          <AdminReopenDialog
            open={dialogs.correctionReview !== null}
            onClose={dialogs.close}
            review={dialogs.correctionReview}
            form={dialogs.correctionForm}
            preparing={dialogs.preparing}
            pending={dialogs.pending}
            reviewRequired={dialogs.reviewRequired}
            failure={dialogs.failure}
            onReviewCurrent={dialogs.reviewCurrent}
            onConfirm={dialogs.confirmCorrection}
            context={{
              businessNumber: submitted.order.businessNumber,
              statusLabel: status,
              createdAt: submitted.order.createdAt,
              activePieces: submitted.order.counts.active,
              receivedPieces: submitted.order.counts.received,
            }}
          />
        </>
      )}
    </div>
  );
}
