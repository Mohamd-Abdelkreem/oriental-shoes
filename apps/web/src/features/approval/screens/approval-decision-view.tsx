"use client";
import {
  toWarehouseOperationLabel,
  toWarehouseEventSummary,
} from "@/features/warehouse/model/warehouse-event.model";
import {
  toQualityOperationLabel,
  toQualityEventSummary,
} from "@/features/manufacturing/model/quality-event.model";
import {
  toManufacturingOperationLabel,
  toManufacturingEventSummary,
} from "@/features/manufacturing/model/manufacturing-event.model";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Printer,
  RotateCcw,
} from "lucide-react";
import { salesUuidSchema, type ApprovalOrderData } from "@template/contracts";
import {
  ApprovalLocalCommandError,
  ApprovalSynchronizationError,
} from "../model/approval-command-state";
import { apiFailureMessage, getApiError } from "@/services/api/api-client";
import {
  useP04OperationalScope,
  isCurrentP04OperationalScope,
} from "@/shared/query/operational-scope";
import { orderTypeLabels } from "@/features/orders/order-types";
import {
  toSubmittedPaper,
  toAuthoritativePaperState,
  toSalesOrderStatusLabel,
  toSalesActivityRow,
} from "@/features/sales/model/order-view.model";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import {
  OrderDetailTabs,
  type OrderDetailTab,
} from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";
import {
  approvalOrderOptions,
  useApprovalOrder,
  useApprovalOrderHistory,
  useApprovalEvent,
} from "../hooks/approval.hooks";
import { useApprovalCommand } from "../hooks/approval-commands.hooks";
import { ApprovalCommandRecovery } from "../components/approval-command-recovery";
import { toApprovalTracking } from "../model/approval-view.model";
import { ApprovalProblemResolutionModal } from "./approval-problem-resolution-modal";
import { ApprovalReturnModal } from "./approval-return-modal";

const operationLabels = {
  APPROVE_INITIAL: "اعتماد أولي",
  RETURN_INITIAL: "إعادة للمبيعات",
  RESOLVE_ISSUE: "قرار مشكلة تصنيع",
  REVIEW_CONTACT: "مراجعة تواصل العميل",
  REPORT_ISSUE: "إحالة مشكلة",
  SUBMIT_CONTACT: "تواصل العميل",
  SUBMIT_NEW_ORDER: "تقديم طلب",
  SUBMIT_DRAFT: "تقديم مسودة",
  RESUBMIT_ORDER: "إعادة تقديم طلب",
  SET_ORDER_PAID: "تحديث المدفوع",
};
export function ApprovalDecisionView({ orderId }: { orderId: string }) {
  const scope = useP04OperationalScope("APPROVAL"),
    query = useApprovalOrder(orderId);
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  if (!salesUuidSchema.safeParse(orderId).success)
    return <p role="alert">مرجع الطلب غير صالح.</p>;
  if (!query.data)
    return (
      <div role={query.isError ? "alert" : "status"}>
        {query.isError
          ? apiFailureMessage(query.error)
          : "جارٍ تحميل أمر التفصيل…"}
        {query.isError && (
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        )}
      </div>
    );
  return (
    <>
      <ApprovalCommandRecovery orderId={orderId} capability="APPROVAL" />
      <DecisionDetail
        key={`${scope.actorId}/${String(scope.accessVersion)}/${String(scope.epoch)}/${orderId}`}
        data={query.data}
        unavailable={query.isError || query.isFetching}
        refresh={() => {
          void query.refetch();
        }}
      />
    </>
  );
}
function DecisionDetail({
  data,
  unavailable,
  refresh,
}: {
  data: ApprovalOrderData;
  unavailable: boolean;
  refresh: () => void;
}) {
  const { order, workflow } = data,
    router = useRouter(),
    params = useSearchParams();
  const client = useQueryClient(),
    scope = useP04OperationalScope("APPROVAL"),
    command = useApprovalCommand(order.id, "APPROVAL");
  const paramTab = params.get("tab");
  const [activeTab, setActiveTab] = useState<OrderDetailTab>(
    paramTab === "tracking" || paramTab === "form" || paramTab === "history"
      ? paramTab
      : workflow.initialApproval !== null
        ? "tracking"
        : "form",
  );
  const [issueSelection, setIssueSelection] = useState<{
    pieceId: string;
    issueId: string;
    mode: "issue" | "reapproval";
  } | null>(null);
  const [returnModal, setReturnModal] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1),
    [eventId, setEventId] = useState<string | null>(null);
  const history = useApprovalOrderHistory(order.id, { page, limit: 25 }),
    event = useApprovalEvent(order.id, eventId);
  const destination = Math.max(1, history.data?.pagination.totalPages ?? page);
  if (page > destination) setPage(destination);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [reviewRequired, setReviewRequired] = useState(false);
  const busy = command.state.phase !== "idle" || reviewRequired,
    status = toSalesOrderStatusLabel(order.status);
  const canApprove =
    !unavailable && !busy && workflow.allowedActions.canApproveInitial;
  const canReturn =
    !unavailable && !busy && workflow.allowedActions.canReturnInitial;
  const canPrint = !unavailable && workflow.printEligibility.allowed;
  const approve = async () => {
    if (!canApprove || scope === null) return;
    setError(null);
    try {
      await command.submit({
        operation: "APPROVE_INITIAL",
        orderId: order.id,
        body: {
          commandId: crypto.randomUUID(),
          expectedVersion: order.version,
        },
      });
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      command.acknowledge();
      router.push("/approval/pending");
    } catch (failure: unknown) {
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      if (failure instanceof ApprovalSynchronizationError) return;
      if (failure instanceof ApprovalLocalCommandError) {
        if (failure.code === "INVARIANT") setError(failure.message);
        return;
      }
      const safe = getApiError(failure);
      if (safe.statusCode === 409) setReviewRequired(true);
      setError(
        `${safe.message}${safe.requestId ? ` (${safe.requestId})` : ""}`,
      );
    }
  };
  const review = async () => {
    if (scope === null) return;
    try {
      await client.fetchQuery({
        ...approvalOrderOptions(client, scope, order.id),
        staleTime: 0,
      });
      if (mounted.current && isCurrentP04OperationalScope(client, scope)) {
        setReviewRequired(false);
        setError(null);
      }
    } catch (failure: unknown) {
      if (mounted.current && isCurrentP04OperationalScope(client, scope))
        setError(getApiError(failure).message);
    }
  };
  const problems = workflow.issues.filter(
    (issue) => issue.state !== "RESOLVED",
  );
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`اعتماد الطلبات / تفاصيل أمر التفصيل / ${order.businessNumber}`}
        title={`أمر تفصيل ${orderTypeLabels[order.type]} — ${order.customerSnapshot.name}`}
        badge={
          <OrientalStatusPill tone={statusTone(status)}>
            {status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.owner.fullName} · موعد التسليم: ${order.deliveryDate ?? "—"} · هاتف العميل: ${order.customerSnapshot.phone}`}
        actions={
          <div className="flex items-center gap-2">
            {workflow.allowedActions.canReturnInitial && (
              <button
                type="button"
                disabled={!canReturn}
                className="btn-pill btn-rose"
                onClick={() => {
                  setReturnModal(true);
                }}
              >
                <RotateCcw size={15} />
                <span>إعادة إلى المبيعات للتعديل</span>
              </button>
            )}
            {workflow.allowedActions.canApproveInitial && (
              <button
                type="button"
                disabled={!canApprove}
                className="btn-pill btn-teal"
                onClick={() => {
                  void approve();
                }}
              >
                <CheckCircle2 size={15} />
                <span>اعتماد أمر التفصيل وتوجيهه للمصنع</span>
              </button>
            )}
            {workflow.initialApproval !== null && (
              <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                تم اعتماد هذا الطلب ودخل خطوط التصنيع
              </span>
            )}
            {canPrint && (
              <Link
                href={`/print/order/${order.id}`}
                className="btn-pill btn-secondary"
                target="_blank"
              >
                <Printer size={15} />
                <span>معاينة الطباعة</span>
              </Link>
            )}
            <Link href="/approval/pending" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              <span>العودة لقائمة الاعتماد</span>
            </Link>
          </div>
        }
      />
      {unavailable && (
        <div role="alert">
          تعذّر إتاحة قرار على بيانات غير محدثة.{" "}
          <button type="button" onClick={refresh}>
            تحديث البيانات
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {reviewRequired && (
        <button
          type="button"
          onClick={() => {
            void review();
          }}
        >
          مراجعة البيانات الحالية
        </button>
      )}
      {workflow.currentReturn && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs">
          <strong>{workflow.currentReturn.reason}</strong>
          {workflow.currentReturn.notes !== null && (
            <p>{workflow.currentReturn.notes}</p>
          )}
        </div>
      )}
      {problems.length > 0 && (
        <div className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/80 pb-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-rose-600" size={18} />
              <strong className="text-sm font-bold text-rose-900">
                مشكلات تصنيع محالة في هذا الطلب ({problems.length} قطع)
              </strong>
            </div>
            <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-900">
              بقية قطع الطلب مستمرة في التصنيع
            </span>
          </div>
          <div className="space-y-2">
            {problems.map((issue) => {
              const piece = order.pieces.find(
                (candidate) => candidate.id === issue.pieceId,
              );
              return (
                <div
                  key={issue.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white p-3 text-xs shadow-xs"
                >
                  <span className="font-bold text-slate-900">
                    القطعة {piece?.position} ({piece?.model} · مقاس{" "}
                    {piece?.size}) — {issue.reason}
                  </span>
                  <span>
                    {issue.state === "SALES_CONTACT"
                      ? "بانتظار تواصل المبيعات"
                      : issue.state === "REAPPROVAL"
                        ? "بانتظار إعادة الاعتماد"
                        : "بانتظار قرار الاعتماد"}
                  </span>
                  {(issue.allowedActions.canResolve ||
                    issue.allowedActions.canReviewContact) && (
                    <button
                      type="button"
                      disabled={unavailable || busy}
                      className="btn-pill btn-teal px-4 py-1.5 text-xs font-bold"
                      onClick={() => {
                        setIssueSelection({
                          pieceId: issue.pieceId,
                          issueId: issue.id,
                          mode: issue.allowedActions.canReviewContact
                            ? "reapproval"
                            : "issue",
                        });
                      }}
                    >
                      {issue.allowedActions.canReviewContact
                        ? "مراجعة تعديل العميل"
                        : "اتخاذ قرار معالجة المشكلة (أ، ب، ج)"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={order.counts.active}
        eventsCount={history.data?.pagination.total ?? 0}
      />
      <div className="pt-1">
        {activeTab === "tracking" && (
          <OrderFullTrackingView projection={toApprovalTracking(data)} />
        )}
        {activeTab === "form" && (
          <div className="space-y-5">
            {workflow.allowedActions.canApproveInitial && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                <strong>توجيه تدقيق الاعتماد:</strong>
                <p>
                  عند اعتماد أمر التفصيل ينتقل إلى قسم القص ليبدأ خط التصنيع.
                  يقفل خيار التعديل لدى المبيعات فور الاعتماد.
                </p>
              </div>
            )}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-sm font-bold text-slate-800">
                  بيانات النموذج الورقي المقدمة للاعتماد
                </h2>
                {canPrint && (
                  <Link
                    href={`/print/order/${order.id}`}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:underline"
                    target="_blank"
                  >
                    <Printer size={13} />
                    <span>معاينة الطباعة</span>
                  </Link>
                )}
              </div>
              <OrderPaperForm
                displayReference={order.businessNumber}
                order={toSubmittedPaper(order)}
                dataState={toAuthoritativePaperState(order, null)}
                mode="approval"
              />
            </div>
            {(workflow.allowedActions.canApproveInitial ||
              workflow.allowedActions.canReturnInitial) && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <strong className="block text-sm font-bold text-slate-900">
                    قرار الاعتماد النهائي لهذا الطلب:
                  </strong>
                  <span className="text-xs text-slate-500">
                    اختر أحد القرارين أدناه لتوثيق الإجراء في سجل النظام
                  </span>
                </div>
                <div className="flex gap-3">
                  {workflow.allowedActions.canReturnInitial && (
                    <button
                      type="button"
                      disabled={!canReturn}
                      className="btn-pill btn-rose"
                      onClick={() => {
                        setReturnModal(true);
                      }}
                    >
                      <RotateCcw size={15} />
                      <span>إعادة للمبيعات مع سبب</span>
                    </button>
                  )}
                  {workflow.allowedActions.canApproveInitial && (
                    <button
                      type="button"
                      disabled={!canApprove}
                      className="btn-pill btn-teal px-5"
                      onClick={() => {
                        void approve();
                      }}
                    >
                      <CheckCircle2 size={16} />
                      <span>اعتماد أمر التفصيل</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === "history" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {history.isPending && <p role="status">جارٍ تحميل السجل…</p>}
            {history.isError && (
              <div role="alert">
                تعذّر تحميل سجل الطلب. {apiFailureMessage(history.error)}{" "}
                <button
                  type="button"
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
                keyExtractor={(row) =>
                  row.kind === "draft"
                    ? `draft:${row.change.commandId}`
                    : `${row.kind}:${row.event.id}`
                }
                emptyTitle="لا توجد حركات مسجلة"
                emptySubtitle="لم تسجل أي أحداث تشغيلية لهذا الطلب بعد."
                pagination={{
                  page,
                  totalPages: history.data.pagination.totalPages,
                  total: history.data.pagination.total,
                  onPageChange: setPage,
                }}
                columns={[
                  {
                    header: "الحدث",
                    render: (row) =>
                      row.kind === "administration"
                        ? toSalesActivityRow(row).label
                        : row.kind === "draft"
                          ? "تعديل مسودة"
                          : row.kind === "quality"
                            ? toQualityOperationLabel(row.event.operation)
                            : row.kind === "warehouse"
                              ? toWarehouseOperationLabel(row.event.operation)
                              : row.kind === "manufacturing"
                                ? toManufacturingOperationLabel(
                                    row.event.operation,
                                  )
                                : operationLabels[row.event.operation],
                  },
                  {
                    header: "المنفذ",
                    render: (row) =>
                      row.kind === "draft"
                        ? row.change.actor.fullName
                        : row.event.actor.fullName,
                  },
                  {
                    header: "التفاصيل والملاحظات",
                    render: (row) =>
                      row.kind === "administration" ? (
                        toSalesActivityRow(row).fields
                      ) : row.kind === "approval" ? (
                        <>
                          <span>{row.event.notes ?? "—"}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEventId(row.event.id);
                            }}
                          >
                            عرض تفاصيل القرار
                          </button>
                        </>
                      ) : row.kind === "warehouse" ? (
                        toWarehouseEventSummary(row.event)
                      ) : row.kind === "quality" ? (
                        toQualityEventSummary(row.event)
                      ) : row.kind === "manufacturing" ? (
                        toManufacturingEventSummary(row.event)
                      ) : (
                        "سجل تقديم وتعديل المبيعات"
                      ),
                  },
                  {
                    header: "التوقيت",
                    render: (row) =>
                      row.kind === "draft"
                        ? row.change.occurredAt
                        : row.event.occurredAt,
                    className: "text-slate-400 font-mono text-xs",
                  },
                ]}
              />
            )}
            {eventId !== null && (
              <div className="mt-4 rounded-xl border border-slate-200 p-4 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEventId(null);
                  }}
                >
                  إغلاق التفاصيل
                </button>
                {event.isPending && (
                  <p role="status">جارٍ تحميل تفاصيل القرار…</p>
                )}
                {event.isError && (
                  <div role="alert">
                    تعذّر تحميل تفاصيل القرار. {apiFailureMessage(event.error)}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        void event.refetch();
                      }}
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                )}
                {event.data && (
                  <>
                    <p>
                      {operationLabels[event.data.event.operation]} ·{" "}
                      {event.data.event.actor.fullName} ·{" "}
                      {event.data.event.occurredAt}
                    </p>
                    <p>{event.data.event.notes}</p>
                    <p>
                      الحالة:{" "}
                      {toSalesOrderStatusLabel(event.data.before.orderStatus)} ←{" "}
                      {toSalesOrderStatusLabel(event.data.after.orderStatus)}
                    </p>
                    {event.data.after.proposal && (
                      <p>
                        ملاحظات التواصل:{" "}
                        {event.data.after.proposal.contactNotes}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {returnModal && (
        <ApprovalReturnModal
          orderId={order.id}
          onClose={() => {
            setReturnModal(false);
          }}
          onReturned={() => {
            setReturnModal(false);
            router.push("/approval/pending");
          }}
        />
      )}
      {issueSelection && (
        <ApprovalProblemResolutionModal
          orderId={order.id}
          pieceId={issueSelection.pieceId}
          issueId={issueSelection.issueId}
          mode={issueSelection.mode}
          onClose={() => {
            setIssueSelection(null);
          }}
        />
      )}
    </div>
  );
}
