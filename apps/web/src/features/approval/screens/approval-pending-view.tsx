"use client";

import { apiFailureMessage } from "@/services/api/api-client";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-empty-state";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { salesOrderTypeSchema } from "@template/contracts";
import {
  orderTypeOptions,
  orderTypeLabels,
} from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  FilterSelect,
  OrientalFilterBar,
} from "@/features/prototype/components/filter-bar";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { useApprovalIssues, useApprovalOrders } from "../hooks/approval.hooks";

import { useP04OperationalScope } from "@/shared/query/operational-scope";
import { useApprovalCommand } from "../hooks/approval-commands.hooks";
import { ApprovalCommandRecovery } from "../components/approval-command-recovery";
import { ApprovalProblemResolutionModal } from "./approval-problem-resolution-modal";

type IssueSelection = {
  orderId: string;
  pieceId: string;
  issueId: string;
  mode: "issue" | "reapproval";
  scopeKey: string;
};
export function ApprovalPendingView() {
  const scope = useP04OperationalScope("APPROVAL"),
    scopeKey = JSON.stringify(scope);
  const [selection, setSelection] = useState<IssueSelection | null>(null);
  const [noticeOrders, setNoticeOrders] = useState<
    readonly { scopeKey: string; id: string }[]
  >([]);
  const openDecision = (target: Omit<IssueSelection, "scopeKey">) => {
    if (scope === null) return;
    setSelection({ ...target, scopeKey });
    setNoticeOrders((previous) =>
      previous.some(
        (item) => item.id === target.orderId && item.scopeKey === scopeKey,
      )
        ? previous
        : [...previous, { id: target.orderId, scopeKey }],
    );
  };
  const params = useSearchParams();
  const [activeTab, setActiveTab] = useState<"orders" | "problems">(
    params.get("tab") === "problems" ? "problems" : "orders",
  );
  const [search, setSearch] = useState(""),
    [typeFilter, setTypeFilter] = useState("الكل");
  const [page, setPage] = useState(1);
  const parsedType = salesOrderTypeSchema.safeParse(typeFilter);
  const filters = {
    search,
    ...(parsedType.success ? { type: parsedType.data } : {}),
    page,
    limit: 25,
  };
  const orders = useApprovalOrders(filters),
    issues = useApprovalIssues(filters);
  const query = activeTab === "orders" ? orders : issues;
  const destination = Math.max(1, query.data?.pagination.totalPages ?? page);
  if (page > destination) setPage(destination);
  const changeTab = (tab: "orders" | "problems") => {
    setActiveTab(tab);
    setPage(1);
  };
  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الاعتماد / طابور الانتظار"
        title="طلبات ومشكلات بانتظار قرار الاعتماد"
        badge={
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            {orders.data?.pagination.total ?? "—"} أوامر معلقة ·{" "}
            {issues.data?.pagination.total ?? "—"} مشكلات محالة
          </span>
        }
        subtitle="تدقيق أوامر التفصيل الجديدة، واتخاذ قرارات معالجة مشكلات التصنيع المحالة للقطع الفردية"
      />
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            changeTab("orders");
          }}
          className={`btn-pill text-xs font-bold ${activeTab === "orders" ? "btn-teal" : "btn-outline"}`}
        >
          أوامر بانتظار الاعتماد المبدئي ({orders.data?.pagination.total ?? "—"}
          )
        </button>
        <button
          type="button"
          onClick={() => {
            changeTab("problems");
          }}
          className={`btn-pill flex items-center gap-1.5 text-xs font-bold ${activeTab === "problems" ? "btn-rose" : "btn-outline text-rose-700"}`}
        >
          <AlertTriangle size={13} />
          مشكلات تصنيع محالة تتطلب قرارًا (
          {issues.data?.pagination.total ?? "—"})
        </button>
      </div>
      <OrientalFilterBar
        searchValue={search}
        onSearchChange={(next) => {
          setSearch(next);
          setPage(1);
        }}
        searchPlaceholder="ابحث برقم الطلب، العميل، أو الهاتف..."
        totalCount={query.data?.pagination.total ?? 0}
        filteredCount={query.data?.pagination.total ?? 0}
        countLabel={activeTab === "orders" ? "طلب" : "قطعة"}
      >
        <FilterSelect
          value={typeFilter}
          onChange={(next) => {
            setTypeFilter(next);
            setPage(1);
          }}
          options={[
            { label: "كل الأنواع", value: "الكل" },
            ...orderTypeOptions,
          ]}
        />
      </OrientalFilterBar>
      {query.isPending && <p role="status">جارٍ تحميل طابور الاعتماد…</p>}
      {query.isFetching && !query.isPending && (
        <p role="status">جارٍ تحديث طابور الاعتماد…</p>
      )}
      {query.isError && (
        <div role="alert">
          تعذّر تحميل طابور الاعتماد. {apiFailureMessage(query.error)}{" "}
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {activeTab === "orders" && orders.data && (
        <OrientalTable
          data={orders.data.items}
          keyExtractor={(order) => order.id}
          emptyTitle="لا توجد طلبات معلقة"
          emptySubtitle="طابور الاعتماد فارغ حالياً."
          pagination={{
            page,
            totalPages: orders.data.pagination.totalPages,
            total: orders.data.pagination.total,
            onPageChange: setPage,
          }}
          columns={[
            {
              header: "رقم الطلب",
              render: (order) => (
                <Link
                  href={`/approval/orders/${order.id}`}
                  className="font-mono font-bold text-teal-700 hover:underline"
                  dir="ltr"
                >
                  {order.businessNumber}
                </Link>
              ),
            },
            {
              header: "العميل",
              render: (order) => order.customerSnapshot.name,
            },
            { header: "النوع", render: (order) => orderTypeLabels[order.type] },
            {
              header: "مندوب المبيعات",
              render: (order) => order.owner.fullName,
            },
            { header: "تاريخ التقديم", accessor: "submittedAt" },
            { header: "موعد التسليم المتوقع", accessor: "deliveryDate" },
            {
              header: "الكمية",
              render: (order) => `${String(order.counts.original)} قطع`,
            },
            {
              header: "الإجراء",
              className: "text-left",
              render: (order) => (
                <Link
                  href={`/approval/orders/${order.id}`}
                  className="btn-pill btn-teal px-3 py-1 text-xs"
                >
                  <ClipboardCheck size={14} />
                  <span>فتح للمراجعة والقرار</span>
                </Link>
              ),
            },
          ]}
        />
      )}
      {activeTab === "problems" && issues.data && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {issues.data.items.length === 0 ? (
            <WorkspaceEmptyState title="لا توجد مشكلات تصنيع محالة بانتظار الاعتماد حالياً." />
          ) : (
            <div className="space-y-3">
              {issues.data.items.map(({ order, piece, issue }) => (
                <div
                  key={issue.id}
                  className="space-y-2.5 rounded-xl border border-rose-200 bg-rose-50/30 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/approval/orders/${order.id}`}
                        className="font-mono text-xs font-bold text-teal-800 hover:text-teal-950 hover:underline"
                        dir="ltr"
                      >
                        {order.businessNumber}
                      </Link>
                      <span className="text-xs font-bold text-slate-800">
                        · القطعة {piece.position} ({piece.model}) · العميل:{" "}
                        {order.customerSnapshot.name}
                      </span>
                    </div>
                    {issue.allowedActions.canResolve ||
                    issue.allowedActions.canReviewContact ? (
                      <IssueReviewButton
                        orderId={order.id}
                        enabled={!issues.isError && !issues.isFetching}
                        reapproval={issue.allowedActions.canReviewContact}
                        onClick={() => {
                          openDecision({
                            orderId: order.id,
                            pieceId: piece.id,
                            issueId: issue.id,
                            mode: issue.allowedActions.canReviewContact
                              ? "reapproval"
                              : "issue",
                          });
                        }}
                      />
                    ) : (
                      <Link
                        href={`/approval/orders/${order.id}`}
                        className="btn-pill btn-secondary px-3 py-1.5 text-xs"
                      >
                        متابعة تواصل المبيعات
                      </Link>
                    )}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 font-bold text-rose-900">
                      <AlertTriangle size={13} className="text-rose-600" />
                      <span>المشكلة المسجلة: {issue.reason}</span>
                    </div>
                    <p className="text-slate-700">{issue.notes}</p>
                  </div>
                  <div className="rounded border border-slate-100 bg-white p-2 text-[11px] text-slate-500">
                    {issue.state === "SALES_CONTACT"
                      ? "بانتظار تواصل المبيعات"
                      : issue.state === "REAPPROVAL"
                        ? "بانتظار إعادة الاعتماد"
                        : "بانتظار قرار الاعتماد"}
                    {issue.instructions && <p>{issue.instructions.text}</p>}
                    <span>بقية القطع مستمرة في العمل دون توقف.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-xs">
            <button
              type="button"
              className="btn-pill btn-outline"
              disabled={!issues.data.pagination.hasPreviousPage}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              السابق
            </button>
            <span>
              {page} / {Math.max(1, issues.data.pagination.totalPages)} ·{" "}
              {issues.data.pagination.total} قطعة
            </span>
            <button
              type="button"
              className="btn-pill btn-outline"
              disabled={!issues.data.pagination.hasNextPage}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              التالي
            </button>
          </div>
        </div>
      )}
      {noticeOrders
        .filter((item) => item.scopeKey === scopeKey)
        .map((item) => (
          <ApprovalCommandRecovery
            key={item.id}
            orderId={item.id}
            capability="APPROVAL"
          />
        ))}
      {selection?.scopeKey === scopeKey && (
        <ApprovalProblemResolutionModal
          orderId={selection.orderId}
          pieceId={selection.pieceId}
          issueId={selection.issueId}
          mode={selection.mode}
          onClose={() => {
            setSelection(null);
          }}
        />
      )}
    </div>
  );
}

function IssueReviewButton({
  orderId,
  enabled,
  reapproval,
  onClick,
}: {
  orderId: string;
  enabled: boolean;
  reapproval: boolean;
  onClick: () => void;
}) {
  const command = useApprovalCommand(orderId, "APPROVAL");
  return (
    <button
      type="button"
      disabled={!enabled || command.state.phase !== "idle"}
      className="btn-pill btn-teal px-3.5 py-1.5 text-xs font-bold"
      onClick={onClick}
    >
      {reapproval ? "مراجعة تعديل العميل" : "اتخاذ قرار الاعتماد (أ، ب، ج)"}
    </button>
  );
}
