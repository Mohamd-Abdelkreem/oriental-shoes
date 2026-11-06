"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Edit, Printer } from "lucide-react";
import {
  salesUuidSchema,
  setOrderPaidBodySchema,
  type SalesCommandData,
  type SalesOrderDto,
} from "@template/contracts";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalTable,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";
import {
  OrderPaperForm,
  type OrderPaperDataState,
} from "@/features/orders/components/order-paper-form";
import {
  OrderDetailTabs,
  type OrderDetailTab,
} from "@/features/orders/components/order-detail-tabs";
import { orderTypeLabels } from "@/features/orders/order-types";
import { useDraftChanges } from "../hooks/drafts.hooks";
import {
  makeDraftDefaults,
  draftChangeFieldLabels,
  toDraftPaper,
  draftEditRoute,
} from "../model/draft-form.model";

import {
  orderDetailOptions,
  useOrderEditor,
  useSalesOrder,
  useSalesOrderTracking,
  useSalesOrderActivity,
  useSalesOrderRevision,
} from "../hooks/orders.hooks";
import {
  toSubmittedPaper,
  toAuthoritativePaperState,
  toAuthoritativeTracking,
  toSalesOrderStatusLabel,
} from "../model/order-view.model";
import { useQueryClient } from "@tanstack/react-query";
import {
  isCurrentOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import {
  useSalesCommand,
  useSalesCommandReceipt,
  synchronizeSalesCommand,
} from "../hooks/sales-commands.hooks";
import {
  SalesSynchronizationError,
  isUnknownSalesWrite,
  type SalesCommandIntent,
} from "../model/sales-command-state";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";

const dataState: OrderPaperDataState = {
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
export function SalesOrderDetailView({ orderId }: { orderId: string }) {
  const scope = useOperationalScope();
  const editor = useOrderEditor(orderId);
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  if (!salesUuidSchema.safeParse(orderId).success)
    return <p role="alert">مرجع الطلب غير صالح.</p>;
  if (editor.data === undefined)
    return editor.isError ? (
      <div role="alert">
        الطلب غير موجود أو تعذّر تحميله.{" "}
        <button
          type="button"
          onClick={() => {
            void editor.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    ) : (
      <p role="status">جارٍ تحميل الطلب...</p>
    );
  const key = `${scope.actorId}:${String(scope.accessVersion)}:${String(scope.epoch)}:${orderId}`;
  return editor.data.kind === "draft" ? (
    <DraftDetail key={key} orderId={orderId} />
  ) : (
    <SubmittedDetail key={key} initial={editor.data.order} />
  );
}
function DraftDetail({ orderId }: { orderId: string }) {
  const scope = useOperationalScope(),
    query = useOrderEditor(orderId);
  const [activeTab, setActiveTab] = useState<OrderDetailTab>("tracking"),
    [page, setPage] = useState(1);
  const changes = useDraftChanges(query.data === undefined ? null : orderId, {
    page,
    limit: 25,
  });
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  if (!salesUuidSchema.safeParse(orderId).success)
    return <p role="alert">مرجع المسودة غير صالح.</p>;
  if (query.isError && query.data === undefined)
    return (
      <div role="alert">
        {getApiError(query.error).statusCode === 404
          ? "المسودة غير موجودة أو غير متاحة."
          : "تعذّر تحميل المسودة."}{" "}
        {getApiError(query.error).requestId}
        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={() => {
            void query.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  const draft = query.data?.kind === "draft" ? query.data.draft : undefined;
  if (draft === undefined) return <p role="status">جارٍ تحميل المسودة...</p>;
  const paper = toDraftPaper(makeDraftDefaults(draft), {
    ownerName: draft.owner.fullName,
    createdAt: draft.createdAt,
    draftId: draft.id,
    customer: draft.customer,
  });
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`المبيعات / تتبع الطلب / ${draft.id}`}
        title={`${orderTypeLabels[draft.type]} — ${draft.customer?.name ?? "دون عميل"}`}
        badge={<OrientalStatusPill tone="neutral">مسودة</OrientalStatusPill>}
        subtitle={`مندوب المبيعات: ${draft.owner.fullName} · تاريخ التسليم: ${draft.deliveryDate ?? "—"}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={draftEditRoute(draft.id)} className="btn-pill btn-teal">
              <Edit size={15} />
              تعديل الطلب
            </Link>
            <button
              type="button"
              disabled
              className="btn-pill btn-secondary"
              title="الطباعة الرسمية غير متاحة للمسودة"
            >
              <Printer size={15} />
              معاينة الطباعة
            </button>
            <Link href="/sales/orders" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              العودة للقائمة
            </Link>
          </div>
        }
      />
      <p className="text-xs text-slate-500">
        مرجع تقني لمسودة غير مقدمة؛ الطباعة الرسمية غير متاحة.
      </p>
      {query.isFetching && <p role="status">جارٍ تحديث المسودة...</p>}
      {query.isError && (
        <div role="alert">
          تعذّر تحديث المسودة. {getApiError(query.error).requestId}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            تحديث المسودة
          </button>
        </div>
      )}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={draft.pieces.length}
        eventsCount={changes.data?.pagination.total ?? 0}
        formLabel="ورقة المسودة غير المقدمة"
        historyLabel="سجل تغييرات المسودة"
      />
      <div className="pt-1">
        {activeTab === "tracking" && (
          <div className="space-y-3.5 rounded-xl border border-slate-200 bg-white p-5">
            <p>مسودة غير مقدمة؛ لا يوجد مسار تصنيع أو حركات مخزون.</p>
            <p>
              {draft.pieces.length} قطع محفوظة · المالك: {draft.owner.fullName}
            </p>
            <time dateTime={draft.createdAt}>{draft.createdAt}</time>
          </div>
        )}
        {activeTab === "form" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <OrderPaperForm
              order={paper}
              mode="readOnly"
              dataState={dataState}
            />
          </div>
        )}
        {activeTab === "history" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-slate-500">
              سجل المسودة فقط؛ حركات مراحل الطلب اللاحقة غير متاحة.
            </p>
            {changes.isFetching && (
              <p role="status">جارٍ تحميل سجل التغييرات...</p>
            )}
            {changes.isError && (
              <div role="alert">
                تعذّر تحميل سجل التغييرات.{" "}
                {getApiError(changes.error).requestId}
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={() => {
                    void changes.refetch();
                  }}
                >
                  إعادة تحميل السجل
                </button>
              </div>
            )}
            {changes.data !== undefined && (
              <OrientalTable
                data={changes.data.changes}
                keyExtractor={(change) => change.commandId}
                emptyTitle="لا توجد تغييرات مسجلة"
                pagination={{
                  page,
                  totalPages: Math.max(1, changes.data.pagination.totalPages),
                  total: changes.data.pagination.total,
                  onPageChange: setPage,
                }}
                columns={[
                  {
                    header: "الحدث",
                    render: (change) =>
                      change.operation === "CREATE_DRAFT"
                        ? "إنشاء مسودة"
                        : "حفظ تعديل المسودة",
                  },
                  {
                    header: "الموظف",
                    render: (change) => change.actor.fullName,
                  },
                  {
                    header: "التغييرات",
                    render: (change) =>
                      change.changedFields
                        .map((field) => draftChangeFieldLabels[field])
                        .join("، ") || "—",
                  },
                  { header: "النسخة", render: (change) => change.afterVersion },
                  {
                    header: "التوقيت",
                    render: (change) => (
                      <time dateTime={change.occurredAt}>
                        {change.occurredAt}
                      </time>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SubmittedDetail({ initial }: { initial: SalesOrderDto }) {
  const query = useSalesOrder(initial.id);
  const cachedOrder = query.data?.order;
  const order =
    cachedOrder !== undefined &&
    cachedOrder.id === initial.id &&
    cachedOrder.version >= initial.version
      ? cachedOrder
      : initial;
  const refetchDetail = query.refetch,
    detailVersion = cachedOrder?.version;
  useEffect(() => {
    if (detailVersion !== undefined && detailVersion < initial.version)
      void refetchDetail();
  }, [detailVersion, initial.version, refetchDetail]);
  const [activeTab, setActiveTab] = useState<OrderDetailTab>("tracking");
  const [page, setPage] = useState(1);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const tracking = useSalesOrderTracking(
    activeTab === "tracking" ? order.id : null,
  );
  const activity = useSalesOrderActivity(
    activeTab === "history" ? order.id : null,
    { page, limit: 25 },
  );
  const revision = useSalesOrderRevision(
    order.id,
    activeTab === "history" ? expandedEventId : null,
  );
  const trackingData = tracking.data,
    refetchTracking = tracking.refetch,
    refetchOrder = query.refetch;
  useEffect(() => {
    if (
      activeTab !== "tracking" ||
      trackingData === undefined ||
      trackingData.orderVersion === order.version
    )
      return;
    if (trackingData.orderVersion < order.version) {
      void refetchTracking();
    } else {
      void refetchOrder();
    }
  }, [activeTab, order.version, trackingData, refetchTracking, refetchOrder]);
  const lastPage = Math.max(1, activity.data?.pagination.totalPages ?? page);
  if (page > lastPage) {
    setPage(lastPage);
    setExpandedEventId(null);
  }
  const projection =
    tracking.data !== undefined && tracking.data.orderVersion === order.version
      ? toAuthoritativeTracking(order, tracking.data)
      : null;
  const paper = toSubmittedPaper(order);
  const paid = usePaidEditor(order);
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`المبيعات / تتبع الطلب / ${order.businessNumber}`}
        title={`${orderTypeLabels[order.type]} — ${order.customerSnapshot.name}`}
        badge={
          <OrientalStatusPill>
            {toSalesOrderStatusLabel(order.status)}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.owner.fullName} · تاريخ التسليم: ${order.deliveryDate ?? "—"}`}
        actions={
          <div className="flex items-center gap-2">
            {order.allowedActions.canResubmit && (
              <Link
                href={draftEditRoute(order.id)}
                className="btn-pill btn-teal"
              >
                تصحيح وإعادة الإرسال
              </Link>
            )}
            <button type="button" disabled className="btn-pill btn-outline">
              <Printer size={15} />
              الطباعة الرسمية غير متاحة
            </button>
            <Link href="/sales/orders" className="btn-pill btn-outline">
              <ArrowRight size={15} />
              العودة
            </Link>
          </div>
        }
      />
      {query.isError && (
        <div role="alert">
          تعذّر تحديث الطلب؛ البيانات المعروضة محفوظة.{" "}
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة تحميل الطلب
          </button>
        </div>
      )}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setExpandedEventId(null);
        }}
        activePiecesCount={order.counts.active}
        eventsCount={activity.data?.pagination.total ?? 0}
      />
      {activeTab === "form" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {order.allowedActions.canSetPaid && paid.editor === undefined && (
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={paid.start}
            >
              تعديل المبلغ المدفوع
            </button>
          )}
          {paid.notice !== null && <p role="status">{paid.notice}</p>}
          {paid.reviewRequired && (
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                void paid.review();
              }}
            >
              مراجعة المدفوع الحالي
            </button>
          )}
          {paid.recovery !== null && (
            <div role="status">
              <p>{paid.recovery}</p>
              <button
                type="button"
                onClick={() => {
                  void paid.observe();
                }}
              >
                التحقق وتحديث المدفوع
              </button>
              {paid.canRetry && (
                <button
                  type="button"
                  onClick={() => {
                    void paid.retry();
                  }}
                >
                  إعادة محاولة المدفوع نفسه
                </button>
              )}
            </div>
          )}
          <OrderPaperForm
            paidEdit={paid.editor}
            order={paper}
            displayReference={order.businessNumber}
            mode="readOnly"
            dataState={toAuthoritativePaperState(order, null)}
          />
        </div>
      )}
      {activeTab === "tracking" && (
        <div>
          {projection !== null ? (
            <OrderFullTrackingView projection={projection} />
          ) : tracking.isFetching || query.isFetching ? (
            <p role="status">
              جارٍ مطابقة بيانات التتبع مع نسخة الطلب الحالية...
            </p>
          ) : (
            <div role="status">
              بيانات التتبع لا تطابق نسخة الطلب الحالية.{" "}
              <button
                type="button"
                onClick={() => {
                  void Promise.all([query.refetch(), tracking.refetch()]);
                }}
              >
                تحديث بيانات التتبع والطلب
              </button>
            </div>
          )}
          {tracking.isError && (
            <div role="alert">
              تعذّر تحميل التتبع.{" "}
              <button
                type="button"
                onClick={() => {
                  void tracking.refetch();
                }}
              >
                إعادة تحميل التتبع
              </button>
            </div>
          )}
        </div>
      )}
      {activeTab === "history" && (
        <div className="space-y-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {activity.isPending && <p role="status">جارٍ تحميل سجل الحركات...</p>}
          {activity.isError && (
            <div role="alert">
              تعذّر تحميل السجل.{" "}
              <button
                type="button"
                onClick={() => {
                  void activity.refetch();
                }}
              >
                إعادة تحميل السجل
              </button>
            </div>
          )}
          {activity.data !== undefined && (
            <OrientalTable
              data={activity.data.events}
              keyExtractor={(item) =>
                item.kind === "order" ? item.event.id : item.change.commandId
              }
              pagination={{
                page,
                totalPages: Math.max(1, activity.data.pagination.totalPages),
                total: activity.data.pagination.total,
                onPageChange: (next) => {
                  setPage(next);
                  setExpandedEventId(null);
                },
              }}
              columns={[
                {
                  header: "الحدث",
                  render: (item) =>
                    item.kind === "draft"
                      ? item.change.operation === "CREATE_DRAFT"
                        ? "إنشاء مسودة"
                        : "حفظ تعديل المسودة"
                      : {
                          SUBMIT_NEW_ORDER: "إرسال طلب جديد",
                          SUBMIT_DRAFT: "إرسال المسودة للاعتماد",
                          RESUBMIT_ORDER: "إعادة الإرسال للاعتماد",
                          SET_ORDER_PAID: "تعديل المبلغ المدفوع",
                        }[item.event.operation],
                },
                {
                  header: "الموظف",
                  render: (item) =>
                    item.kind === "order"
                      ? item.event.actor.fullName
                      : item.change.actor.fullName,
                },
                {
                  header: "التوقيت",
                  render: (item) =>
                    item.kind === "order"
                      ? item.event.occurredAt
                      : item.change.occurredAt,
                },
                {
                  header: "التفاصيل",
                  render: (item) =>
                    item.kind === "order" ? (
                      <button
                        type="button"
                        aria-expanded={expandedEventId === item.event.id}
                        onClick={() => {
                          setExpandedEventId(
                            expandedEventId === item.event.id
                              ? null
                              : item.event.id,
                          );
                        }}
                      >
                        عرض القيم السابقة واللاحقة
                      </button>
                    ) : (
                      "—"
                    ),
                },
              ]}
            />
          )}
          {expandedEventId !== null && (
            <section aria-label="القيم السابقة واللاحقة" className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setExpandedEventId(null);
                }}
              >
                إغلاق التفاصيل
              </button>
              {revision.isPending && (
                <p role="status">جارٍ تحميل النسخة التاريخية...</p>
              )}
              {revision.isError && (
                <div role="alert">
                  تعذّر تحميل النسخة التاريخية.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      void revision.refetch();
                    }}
                  >
                    إعادة تحميل النسخة
                  </button>
                </div>
              )}
              {revision.data !== undefined && (
                <>
                  <h3>قبل التغيير</h3>
                  {revision.data.before === null ? (
                    <p>طلب جديد؛ لا توجد نسخة سابقة.</p>
                  ) : revision.data.before.kind === "order" ? (
                    <HistoricalPaper order={revision.data.before.order} />
                  ) : (
                    <OrderPaperForm
                      mode="readOnly"
                      dataState={dataState}
                      order={toDraftPaper(
                        makeDraftDefaults(revision.data.before.draft),
                        {
                          ownerName: revision.data.before.draft.owner.fullName,
                          createdAt: revision.data.before.draft.createdAt,
                          draftId: revision.data.before.draft.id,
                          customer: revision.data.before.draft.customer,
                        },
                      )}
                    />
                  )}
                  <h3>بعد التغيير</h3>
                  <HistoricalPaper order={revision.data.after} />
                </>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
function HistoricalPaper({ order }: { order: SalesOrderDto }) {
  return (
    <OrderPaperForm
      order={toSubmittedPaper(order)}
      displayReference={order.businessNumber}
      mode="readOnly"
      dataState={toAuthoritativePaperState(order, null)}
    />
  );
}

type PaidCommand = Extract<SalesCommandIntent, { operation: "SET_ORDER_PAID" }>;
function usePaidEditor(order: SalesOrderDto) {
  const scope = useOperationalScope(),
    client = useQueryClient(),
    command = useSalesCommand();
  const [draft, setDraft] = useState<{ value: string; version: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [phase, setPhase] = useState<
      "editing" | "pending" | "unknown" | "confirmed"
    >("editing");
  const frozen = useRef<{
    variables: { scope: OperationalScope; command: PaidCommand };
    confirmed: SalesCommandData | null;
    running: boolean;
    unknown: boolean;
  } | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);
  const receipt = useSalesCommandReceipt(commandId);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current &&
    scope !== null &&
    isCurrentOperationalScope(client, scope);
  const complete = () => {
    if (!current()) return;
    frozen.current = null;
    setCommandId(null);
    setDraft(null);
    setPhase("editing");
    setError(null);
    setNotice("تم تحديث المبلغ المدفوع من البيانات المحفوظة.");
  };
  const perform = async () => {
    const intent = frozen.current;
    if (intent === null || intent.running || !current()) return;
    intent.running = true;
    setPhase("pending");
    setError(null);
    try {
      const result = await command.mutateAsync(intent.variables);
      intent.confirmed = result;
      complete();
    } catch (failure: unknown) {
      if (!current()) return;
      if (failure instanceof SalesSynchronizationError) {
        intent.confirmed = failure.result;
        setPhase("confirmed");
        setError("تم الحفظ؛ تعذّر تحديث العرض.");
      } else if (
        intent.unknown ||
        isUnknownSalesWrite(failure) ||
        getApiError(failure).code === "SALES_COMMAND_CONFLICT"
      ) {
        intent.unknown = true;
        setPhase("unknown");
        setError("نتيجة العملية غير مؤكدة؛ احتفظ بالعملية نفسها.");
      } else {
        frozen.current = null;
        setCommandId(null);
        setPhase("editing");
        if (getApiError(failure).code === "ORDER_PAID_UNCHANGED") {
          setDraft(null);
          setError(null);
          setNotice("المبلغ مطابق للقيمة الحالية؛ لم يحدث تغيير.");
        } else {
          setReviewRequired(
            ["ORDER_VERSION_CONFLICT", "ORDER_STATE_CONFLICT"].includes(
              getApiError(failure).code,
            ),
          );
          setError("تعذّر تعديل المدفوع؛ راجع القيمة ونسخة الطلب الحالية.");
        }
      }
    } finally {
      intent.running = false;
    }
  };
  const save = () => {
    if (
      !current() ||
      scope === null ||
      draft === null ||
      frozen.current !== null ||
      !order.allowedActions.canSetPaid ||
      reviewRequired
    )
      return;
    const parsed = setOrderPaidBodySchema.safeParse({
      commandId: crypto.randomUUID(),
      expectedVersion: draft.version,
      paidAmount: draft.value,
    });
    if (draft.version !== order.version) {
      setError("تغير الطلب؛ ألغِ التعديل وراجع القيمة الحالية قبل حفظ جديد.");
      return;
    }
    if (!parsed.success) {
      setError("أدخل مبلغاً صريحاً صحيحاً بمنزلتين عشريتين كحد أقصى.");
      return;
    }
    const body = Object.freeze(parsed.data);
    frozen.current = {
      variables: Object.freeze({
        scope: Object.freeze({ ...scope }),
        command: Object.freeze({
          operation: "SET_ORDER_PAID",
          orderId: order.id,
          body,
        }),
      }),
      confirmed: null,
      running: false,
      unknown: false,
    };
    setCommandId(body.commandId);
    void perform();
  };
  const observe = async () => {
    const intent = frozen.current;
    if (intent === null || intent.running || scope === null || !current())
      return;
    intent.running = true;
    try {
      if (intent.confirmed === null) {
        const found = await receipt.refetch({ throwOnError: true });
        if (
          found.data === undefined ||
          found.data.kind !== "order" ||
          found.data.receipt.commandId !==
            intent.variables.command.body.commandId ||
          found.data.receipt.operation !== "SET_ORDER_PAID" ||
          found.data.receipt.resourceId !== order.id ||
          found.data.receipt.actor.id !== scope.actorId ||
          found.data.receipt.beforeVersion !==
            intent.variables.command.body.expectedVersion ||
          found.data.receipt.afterVersion !==
            intent.variables.command.body.expectedVersion + 1
        )
          throw new Error("Unconfirmed paid result");
        intent.confirmed = found.data;
      }
      await synchronizeSalesCommand(client, scope, intent.confirmed);
      complete();
    } catch {
      if (current())
        setError(
          intent.confirmed === null
            ? "لم تتأكد نتيجة العملية؛ غياب الإيصال لا يعني فشلها."
            : "تم الحفظ؛ تعذّر تحديث العرض.",
        );
    } finally {
      intent.running = false;
    }
  };
  const review = async () => {
    if (scope === null || !current()) return;
    try {
      await client.fetchQuery({
        ...orderDetailOptions(client, scope, order.id),
        staleTime: 0,
      });
      if (current())
        setError(
          "راجع القيمة الحالية؛ ألغِ التعديل لبدء إدخال جديد على النسخة المحدثة.",
        );
    } catch {
      if (current())
        setError(
          "تعذّر تحديث القيمة الحالية؛ احتفظ بالإدخال وحاول المراجعة مجدداً.",
        );
    }
  };
  return {
    reviewRequired,
    review,
    start: () => {
      if (
        current() &&
        frozen.current === null &&
        order.allowedActions.canSetPaid
      ) {
        setDraft({ value: order.money.paidAmount, version: order.version });
        setReviewRequired(false);
        setError(null);
        setNotice(null);
      }
    },
    notice,
    recovery: phase === "unknown" || phase === "confirmed" ? error : null,
    canRetry: phase === "unknown",
    observe,
    retry: perform,
    editor:
      draft === null
        ? undefined
        : {
            value: draft.value,
            pending: phase !== "editing",
            error,
            onChange: (value: string) => {
              if (current() && frozen.current === null) {
                setDraft({ ...draft, value });
                setError(null);
              }
            },
            onSave: save,
            onCancel: () => {
              if (current() && frozen.current === null) {
                setDraft(null);
                setError(null);
                setReviewRequired(false);
              }
            },
          },
  };
}
