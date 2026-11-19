"use client";

import { apiFailureMessage } from "@/services/api/api-client";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-empty-state";
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  RotateCcw,
} from "lucide-react";
import { orderTypeLabels } from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { OrientalTable } from "@/features/prototype/components/data-table";
import {
  useApprovalDashboard,
  useApprovalIssues,
} from "../hooks/approval.hooks";

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
export function ApprovalDashboardView() {
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
  const dashboard = useApprovalDashboard(),
    issues = useApprovalIssues({ page: 1, limit: 5 });
  const counts = dashboard.data?.counts;
  const kpis: KpiCardItem[] = [
    {
      title: "بانتظار المراجعة والاعتماد",
      value: counts?.initialOrders ?? "—",
      unit: "أمر تفصيل",
      subtitle: "طلبات بانتظار الاعتماد المبدئي",
      icon: Clock,
      tone: "amber",
      href: "/approval/pending",
    },
    {
      title: "مشكلات تصنيع محالة",
      value: counts?.unresolvedIssues ?? "—",
      unit: "قطعة",
      subtitle: "جميع القطع التي لم يُحسم قرارها",
      icon: AlertTriangle,
      tone: "rose",
      href: "/approval/pending?tab=problems",
    },
    {
      title: "اعتمدت ودخلت المصنع اليوم",
      value: counts?.approvedToday ?? "—",
      unit: "أمر تفصيل",
      subtitle: "بدأت مسار القص داخل المصنع",
      icon: CheckCircle2,
      tone: "emerald",
      href: "/approval/history",
    },
    {
      title: "معادة للمبيعات للتصحيح",
      value: counts?.returnedOrders ?? "—",
      unit: "أمر تفصيل",
      subtitle: "مع سبب إلزامي وملاحظات فنية",
      icon: RotateCcw,
      tone: "rose",
      href: "/approval/history",
    },
  ];
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="اعتماد أوامر التفصيل / لوحة التحكم"
        title="لوحة تدقيق واعتماد الطلبات"
        subtitle="مراجعة مواصفات أمر التفصيل الرسمية، اعتماد الدخول للمصنع أو الإعادة للمبيعات مع سبب توثيقي"
        actions={
          <Link href="/approval/pending" className="btn-pill btn-teal">
            <ClipboardCheck size={16} />
            <span>
              فتح قائمة انتظار الاعتماد ({counts?.initialOrders ?? "—"})
            </span>
          </Link>
        }
      />
      <OrientalKpiGrid cards={kpis} columns={4} />
      {dashboard.isPending && <p role="status">جارٍ تحميل لوحة الاعتماد…</p>}
      {dashboard.isFetching && !dashboard.isPending && (
        <p role="status">جارٍ تحديث لوحة الاعتماد…</p>
      )}
      {dashboard.isError && (
        <div role="alert">
          تعذّر تحميل لوحة الاعتماد. {apiFailureMessage(dashboard.error)}{" "}
          <button
            type="button"
            onClick={() => {
              void dashboard.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      <div className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-rose-200/80 pb-2.5">
          <strong className="text-sm font-bold text-rose-900">
            مشكلات تصنيع محالة للاعتماد
          </strong>
          <Link
            href="/approval/pending?tab=problems"
            className="text-xs text-teal-600 hover:underline"
          >
            عرض القائمة الكاملة
          </Link>
        </div>
        <p className="text-xs text-rose-800">
          تبقى بقية قطع الطلب في مسارها الطبيعي داخل خطوط الإنتاج دون توقف.
        </p>
        {issues.isPending && <p role="status">جارٍ تحميل المشكلات…</p>}
        {issues.isError && (
          <div role="alert">
            تعذّر تحميل المشكلات. {apiFailureMessage(issues.error)}{" "}
            <button
              type="button"
              onClick={() => {
                void issues.refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {issues.data && (
          <div className="space-y-2">
            {issues.data.items.length === 0 && (
              <WorkspaceEmptyState title="لا توجد مشكلات تصنيع محالة." />
            )}
            {issues.data.items.map(({ order, piece, issue }) => (
              <div
                key={issue.id}
                className="space-y-2 rounded-lg border border-rose-200 bg-white p-3.5 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/approval/orders/${order.id}`}
                    className="font-mono text-xs font-bold text-teal-700 hover:underline"
                  >
                    {order.businessNumber}
                  </Link>
                  <span className="text-xs font-bold text-slate-800">
                    القطعة {piece.position} ({piece.model}) ·{" "}
                    {order.customerSnapshot.name}
                  </span>
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
                <p className="rounded border border-rose-100 bg-rose-50/70 p-2.5 text-xs">
                  {issue.reason}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-sm font-bold text-slate-800">
            أوامر التفصيل المعلقة بانتظار قرارك
          </h2>
          <Link
            href="/approval/pending"
            className="text-xs text-teal-600 hover:underline"
          >
            عرض القائمة الكاملة
          </Link>
        </div>
        {dashboard.data && (
          <OrientalTable
            data={dashboard.data.recentOrders}
            keyExtractor={(order) => order.id}
            emptyTitle="لا توجد طلبات معلقة للاعتماد"
            emptySubtitle="طابور الاعتماد فارغ حالياً."
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
              {
                header: "نوع الطلب",
                render: (order) => orderTypeLabels[order.type],
              },
              {
                header: "مندوب المبيعات",
                render: (order) => order.owner.fullName,
              },
              {
                header: "الكمية",
                render: (order) => `${String(order.counts.original)} قطع`,
              },
              { header: "موعد التسليم", accessor: "deliveryDate" },
              {
                header: "المراجعة والقرار",
                className: "text-left",
                render: (order) => (
                  <Link
                    href={`/approval/orders/${order.id}`}
                    className="btn-pill btn-teal px-3 py-1 text-xs"
                  >
                    <Eye size={13} />
                    <span>مراجعة وتتبع الطلب</span>
                  </Link>
                ),
              },
            ]}
          />
        )}
      </div>
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
