"use client";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  salesUuidSchema,
  toOrderActivityActionLabel,
  type AdministrationOperationalActivityEvent,
  type WarehouseHistoryItem,
  type WarehouseCommandOperation,
} from "@template/contracts";
import {
  useWarehouseOperationalScope,
  warehouseScopeKey,
} from "@/shared/query/operational-scope";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import {
  OrderDetailTabs,
  type OrderDetailTab,
} from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";
import {
  FactoryWorkInstructions,
  FactoryOrderPaper,
} from "@/features/orders/components/factory-order-paper";
import { WarehouseOrderOperations } from "@/features/manufacturing/screens/warehouse-order-operations";
import {
  ConfirmWarehouseReceiptDialog,
  DispatchDeliveryDialog,
  ConfirmDeliveryDialog,
  RecordDeliveryFailedDialog,
  RetryDeliveryDialog,
} from "@/features/prototype/components/action-dialogs";
import { toQualityEventSummary } from "@/features/manufacturing/model/quality-event.model";
import { toManufacturingEventSummary } from "@/features/manufacturing/model/manufacturing-event.model";
import {
  useWarehouseOrder,
  useWarehouseOrderHistory,
  fetchWarehouseOrder,
} from "../hooks/warehouse.hooks";
import { useWarehouseCommand } from "../hooks/warehouse-commands.hooks";
import { useWarehouseConfirmation } from "../hooks/warehouse-confirmation.hooks";
import {
  toWarehouseTracking,
  type WarehousePieceTarget,
  type WarehouseRowCallbacks,
  type WarehouseDialogProps,
} from "../model/warehouse-view.model";
import { warehouseFailureMessage } from "../model/warehouse-form.model";
import { toWarehouseEventSummary } from "../model/warehouse-event.model";
import { WarehouseCommandRecovery } from "./warehouse-command-recovery";

export function WarehouseOrderDetailView({ orderId }: { orderId: string }) {
  const scope = useWarehouseOperationalScope(),
    params = useSearchParams();
  const context = scope
    ? `${warehouseScopeKey(scope).join("/")}/${orderId}/${params.toString()}`
    : orderId;
  return (
    <div className="space-y-4" dir="rtl">
      <WarehouseCommandRecovery />
      {scope ? (
        <WarehouseDetailContent key={context} orderId={orderId} />
      ) : (
        <p role="status">جارٍ التحقق من صلاحية الوصول إلى المستودع.</p>
      )}
    </div>
  );
}
const administrationStatusLabels = {
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  RETURNED: "معاد للتعديل",
  APPROVED: "قيد التصنيع",
  READY_FOR_DELIVERY: "جاهز للتسليم",
  OUT_FOR_DELIVERY: "خرج مع المندوب",
  DELIVERY_FAILED: "تعذر التسليم",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
} as const;
const administrationCancellationSummary = (
  event: AdministrationOperationalActivityEvent,
): string =>
  `${toOrderActivityActionLabel({ kind: "administration", operation: event.operation })} — ${String(event.pieceIds.length)} قطعة — القطع الأصلية: ${event.pieceIds.join("، ")} — ${administrationStatusLabels[event.beforeStatus]} ← ${administrationStatusLabels[event.afterStatus]} — إصدار الطلب: ${String(event.orderVersion)} — ${event.actor.fullName} — ${event.occurredAt}`;

function historySummary(item: WarehouseHistoryItem): string {
  switch (item.kind) {
    case "administration":
      return administrationCancellationSummary(item.event);
    case "warehouse":
      return toWarehouseEventSummary(item.event);
    case "manufacturing":
      return toManufacturingEventSummary(item.event);
    case "quality":
      return toQualityEventSummary(item.event);
    case "issue":
      return `${item.event.operation === "REPORT_ISSUE" ? "تسجيل مشكلة" : item.event.result === "CANCELLED" ? "إلغاء القطعة" : item.event.result === "RELEASED" ? "إعادة معتمدة للقسم" : "مراجعة المشكلة"} — ${item.event.pieceId} — ${item.event.reason ?? "قرار معتمد بشأن القطعة"} — ${item.event.notes ?? ""}${item.event.correctionResolution ? ` — إلغاء دورة التصحيح ${String(item.event.correctionResolution.cycle)}: ${item.event.correctionResolution.correctionId}` : ""}`;
  }
}
function WarehouseDetailContent({ orderId }: { orderId: string }) {
  const params = useSearchParams(),
    scope = useWarehouseOperationalScope(),
    client = useQueryClient(),
    validOrder = salesUuidSchema.safeParse(orderId).success;
  const query = useWarehouseOrder(validOrder ? orderId : null),
    command = useWarehouseCommand(),
    trigger = useRef<HTMLElement | null>(null);
  const initial = params.get("tab"),
    [tab, setTab] = useState<OrderDetailTab>(
      initial === "history" || initial === "form" ? initial : "tracking",
    ),
    [page, setPage] = useState(1);
  const requested = params.get("pieceId"),
    piece = salesUuidSchema.safeParse(requested),
    invalidPiece =
      requested !== null &&
      (!piece.success ||
        params.getAll("pieceId").length !== 1 ||
        (!!query.data &&
          !query.data.paper.order.pieces.some(
            (member) => member.id === requested,
          )));
  const history = useWarehouseOrderHistory(
    tab === "history" && !!query.data && !invalidPiece ? orderId : null,
    { page, limit: 25, ...(piece.success ? { pieceId: piece.data } : {}) },
  );
  if (history.data && page > Math.max(1, history.data.pagination.totalPages))
    setPage(Math.max(1, history.data.pagination.totalPages));
  const availability = query.isError
      ? "error"
      : query.isFetching || !query.data
        ? "refreshing"
        : "ready",
    controller = useWarehouseConfirmation(availability),
    busy =
      controller.preparing ||
      command.state.phase !== "idle" ||
      availability !== "ready";
  const retry = async () => {
    if (!scope) return;
    await query.refetch({ throwOnError: true });
    for (const id of [
      ...new Set(controller.review?.orders.map((order) => order.orderId) ?? []),
    ].sort())
      await fetchWarehouseOrder(client, scope, id);
  };
  const prepare = (
    operation: WarehouseCommandOperation,
    targets: readonly WarehousePieceTarget[],
  ) => {
    if (busy) return;
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    void controller.open(operation, targets);
  };
  const callbacks: WarehouseRowCallbacks = {
    onReceive: (targets) => {
      prepare("RECEIVE", targets);
    },
    onDispatch: (targets) => {
      prepare("DISPATCH", targets);
    },
    onConfirmDelivery: (targets) => {
      prepare("CONFIRM_DELIVERY", targets);
    },
    onFailDelivery: (targets) => {
      prepare("FAIL_DELIVERY", targets);
    },
    onRetryDelivery: (targets) => {
      prepare("RETRY_DELIVERY", targets);
    },
  };
  if (!validOrder || invalidPiece)
    return (
      <p role="alert">الطلب أو القطعة المطلوبة غير متاحة في هذا النطاق.</p>
    );
  if (query.isPending) return <p role="status">جارٍ تحميل أمر التفصيل…</p>;
  if (!query.data)
    return (
      <div role="alert">
        {warehouseFailureMessage(query.error, "read")}
        <button
          type="button"
          onClick={() => {
            void query.refetch();
          }}
        >
          إعادة تحميل الطلب
        </button>
      </div>
    );
  const data = query.data,
    dialog: Omit<WarehouseDialogProps, "review" | "returnFocusRef"> = {
      source: "warehouse",
      open: true,
      pending: controller.preparing || command.state.phase !== "idle",
      readAvailability: availability,
      readFailure: query.isError
        ? warehouseFailureMessage(query.error, "read")
        : null,
      failure: controller.failure,
      reviewRequired: controller.reviewRequired,
      onReadRetry: retry,
      onReview: controller.reviewCurrent,
      onConfirm: controller.confirm,
      onClose: controller.close,
    };
  return (
    <div className="space-y-4">
      <OrientalPageHeader
        title={`أمر التفصيل ${data.summary.businessNumber}`}
        subtitle={data.summary.customerName}
        eyebrow="المستودع / تفاصيل أمر التفصيل"
        actions={
          <Link className="btn-pill btn-secondary" href="/warehouse/dashboard">
            العودة للمستودع
          </Link>
        }
      />
      <section
        className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-xs"
        aria-label="بيانات التسليم المسجلة"
      >
        <p>اسم العميل المسجل: {data.deliveryContact.name}</p>
        <p>الهاتف: {data.deliveryContact.phone}</p>
        <p>العنوان: {data.deliveryContact.address ?? "غير مسجل"}</p>
      </section>
      <WarehouseOrderOperations
        data={data}
        readAvailability={availability}
        readFailure={
          query.isError ? warehouseFailureMessage(query.error, "read") : null
        }
        onReadRetry={retry}
        callbacks={callbacks}
        busy={busy}
      />
      {controller.failure && <p role="alert">{controller.failure}</p>}
      {controller.preparing && <p role="status">جارٍ مراجعة نطاق الإجراء…</p>}
      <OrderDetailTabs
        activeTab={tab}
        onTabChange={setTab}
        activePiecesCount={data.summary.counts.active}
        eventsCount={history.data?.pagination.total ?? 0}
        formLabel="المواصفات المعتمدة للمصنع"
      />
      {tab === "tracking" && (
        <>
          <OrderFullTrackingView projection={toWarehouseTracking(data)} />
          <section className="space-y-3" aria-label="تغليف الجودة المسجل">
            {data.qualityPackingGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
              >
                <p>
                  تغليف الجودة: {group.id} · القطع:{" "}
                  {group.acceptedPieceIds.join("، ")}
                </p>
                <p>
                  الكراتين: {group.cartonCount ?? "غير مسجل"} · مراجع الكراتين:{" "}
                  {group.cartonNumbers ?? "غير مسجل"}
                </p>
                {group.inspectorNote !== null && <p>{group.inspectorNote}</p>}
                <p>
                  المفتش: {group.inspector.fullName} · {group.packedAt}
                </p>
              </div>
            ))}
          </section>
          {data.work.some((work) => work.legacyReceipt) && (
            <p className="text-xs text-slate-500">
              استلام سابق محفوظ للقطع{" "}
              {data.work
                .filter((work) => work.legacyReceipt)
                .map((work) => work.pieceId)
                .join("، ")}
              ؛ تفاصيل مجموعة الاستلام السابقة غير مسجلة.
            </p>
          )}
          {data.currentAttempt && (
            <section
              className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs"
              aria-label="محاولة التوصيل الحالية"
            >
              <h2>محاولة التوصيل {data.currentAttempt.number}</h2>
              <p>
                {data.currentAttempt.id} · القطع:{" "}
                {data.currentAttempt.pieceIds.join("، ")}
              </p>
              <p>
                الخروج: {data.currentAttempt.dispatchedBy.fullName} ·{" "}
                {data.currentAttempt.dispatchedAt}
              </p>
              {data.currentAttempt.deliveryNote !== null && (
                <p>ملاحظة التوصيل: {data.currentAttempt.deliveryNote}</p>
              )}
              {data.currentAttempt.outcome && (
                <>
                  <p>
                    تسجيل النتيجة:{" "}
                    {data.currentAttempt.outcome.recordedBy.fullName} ·{" "}
                    {data.currentAttempt.outcome.recordedAt}
                  </p>
                  {data.currentAttempt.outcome.kind === "DELIVERED" ? (
                    <>
                      <p>
                        المستلم:{" "}
                        {data.currentAttempt.outcome.recipient ?? "غير مسجل"}
                      </p>
                      <p>
                        وقت التسليم الفعلي:{" "}
                        {data.currentAttempt.outcome.deliveredAt ?? "غير مسجل"}
                      </p>
                    </>
                  ) : (
                    <p>
                      عودة الطلب بالكامل؛ السبب:{" "}
                      {data.currentAttempt.outcome.reason}
                    </p>
                  )}
                  {data.currentAttempt.outcome.notes !== null && (
                    <p>{data.currentAttempt.outcome.notes}</p>
                  )}
                </>
              )}
              {data.currentAttempt.retry && (
                <p>
                  إعادة التجهيز: {data.currentAttempt.retry.actor.fullName} ·{" "}
                  {data.currentAttempt.retry.occurredAt} · موعد المحاولة:{" "}
                  {data.currentAttempt.retry.retryDate ?? "غير مسجل"} ·{" "}
                  {data.currentAttempt.retry.notes}
                </p>
              )}
            </section>
          )}
        </>
      )}
      {tab === "form" && (
        <>
          <FactoryWorkInstructions data={data.paper} />
          <FactoryOrderPaper data={data.paper} />
        </>
      )}
      {tab === "history" && (
        <section className="space-y-3">
          {requested !== null && (
            <p className="text-xs">
              سجل القطعة {requested}؛ تبقى عضوية الحركات المجمعة الأصلية كاملة.
            </p>
          )}
          {history.isPending && <p role="status">جارٍ تحميل سجل الطلب…</p>}
          {history.isFetching && history.data && (
            <p role="status">جارٍ تحديث سجل الطلب…</p>
          )}
          {history.isError && (
            <div role="alert">
              {warehouseFailureMessage(history.error, "read")}
              <button
                type="button"
                onClick={() => {
                  void history.refetch();
                }}
              >
                إعادة تحميل السجل
              </button>
            </div>
          )}
          {history.data && (
            <OrientalTable
              data={history.data.events}
              keyExtractor={(item) => `${item.kind}:${item.event.id}`}
              emptyTitle="لا توجد حركات محفوظة"
              emptySubtitle="لم تسجل حركات في هذا النطاق."
              pagination={{
                page: history.data.pagination.page,
                totalPages: history.data.pagination.totalPages,
                total: history.data.pagination.total,
                onPageChange: setPage,
              }}
              columns={[
                { header: "الحركة", render: historySummary },
                {
                  header: "المنفذ",
                  render: (item) => item.event.actor.fullName,
                },
                {
                  header: "وقت التسجيل",
                  render: (item) => (
                    <time dateTime={item.event.occurredAt}>
                      {item.event.occurredAt}
                    </time>
                  ),
                },
              ]}
            />
          )}
        </section>
      )}
      {controller.review &&
        (controller.review.operation === "RECEIVE" ? (
          <ConfirmWarehouseReceiptDialog
            {...dialog}
            review={controller.review}
            returnFocusRef={trigger}
          />
        ) : controller.review.operation === "DISPATCH" ? (
          <DispatchDeliveryDialog
            {...dialog}
            review={{ ...controller.review, operation: "DISPATCH" as const }}
            returnFocusRef={trigger}
          />
        ) : controller.review.operation === "CONFIRM_DELIVERY" ? (
          <ConfirmDeliveryDialog
            {...dialog}
            review={{
              ...controller.review,
              operation: "CONFIRM_DELIVERY" as const,
            }}
            returnFocusRef={trigger}
          />
        ) : controller.review.operation === "FAIL_DELIVERY" ? (
          <RecordDeliveryFailedDialog
            {...dialog}
            review={{
              ...controller.review,
              operation: "FAIL_DELIVERY" as const,
            }}
            returnFocusRef={trigger}
          />
        ) : (
          <RetryDeliveryDialog
            {...dialog}
            review={{
              ...controller.review,
              operation: "RETRY_DELIVERY" as const,
            }}
            returnFocusRef={trigger}
          />
        ))}
    </div>
  );
}
