"use client";

import { administrationFailureMessage } from "../model/administration-form.model";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { administrationApprovalsQuerySchema } from "@template/contracts";
import { useAdministrationOperationalScope } from "@/shared/query/operational-scope";
import {
  useAdministrationApprovals,
  administrationKeys,
} from "../hooks/administration.hooks";
import { useAdministrationPageBounds } from "../hooks/administration-page-bounds.hooks";
import {
  parseAdministrationRoute,
  administrationRouteHref,
  administrationOrderHref,
} from "../model/administration-query.model";
import Link from "next/link";
import { CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { orderTypeLabels as typeLabels } from "@/features/orders/order-types";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminApprovalsView() {
  const url = useSearchParams().toString(),
    currentScope = useAdministrationOperationalScope();
  const [input, setInput] = useState({ seen: url, raw: url, pending: url });
  let raw = input.raw;
  if (url !== input.seen) {
    raw = url === input.pending ? input.raw : url;
    setInput({ seen: url, raw, pending: url });
  }
  const params = new URLSearchParams(raw),
    parsed = parseAdministrationRoute("approvals", params);
  const query =
    parsed.route === "approvals" && parsed.kind === "valid"
      ? parsed.query
      : null;
  const response = useAdministrationApprovals(query),
    data = response.data,
    counts = data?.counts;
  const safeQuery = query ?? administrationApprovalsQuerySchema.parse({});
  const scope = currentScope ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    capability: "ADMINISTRATION" as const,
  };
  const bounds = useAdministrationPageBounds({
    resource: "approvals",
    query: safeQuery,
    currentKey: administrationKeys.approvals(scope, safeQuery),
    scope,
    current: {
      data: query === null ? undefined : data,
      status: response.status,
      fetchStatus: response.fetchStatus,
    },
    onNavigate: (page) => {
      if (query === null) return;
      const href = administrationRouteHref("approvals", { ...query, page });
      if (data !== undefined && query.page > data.pagination.totalPages)
        window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
    },
  });
  const change = (field: "search" | "tab", value: string) => {
    const next = new URLSearchParams(raw);
    next.delete("page");
    if (value === "") next.delete(field);
    else next.set(field, value);
    const state = parseAdministrationRoute("approvals", next);
    setInput({
      seen: url,
      raw: next.toString(),
      pending:
        state.route === "approvals" && state.kind === "valid"
          ? state.canonicalSearch
          : url,
    });
    if (state.route === "approvals" && state.kind === "valid")
      window.history.replaceState(
        null,
        "",
        administrationRouteHref("approvals", state.query),
      );
  };
  const resetFilters = () => {
    setInput({ seen: url, raw: "", pending: "" });
    window.history.replaceState(
      null,
      "",
      administrationRouteHref(
        "approvals",
        administrationApprovalsQuerySchema.parse({}),
      ),
    );
  };
  const search = params.get("search") ?? "",
    tab = query?.tab ?? "";
  const filtered = query === null ? [] : (data?.items ?? []);
  const kpis: KpiCardItem[] = [
    {
      title: "بانتظار الاعتماد",
      value: counts?.pending ?? "—",
      subtitle: "أوامر تفصيل جديدة تتطلب المراجعة الفنية",
      icon: Clock,
      tone: (counts?.pending ?? 0) > 0 ? "amber" : "neutral",
    },
    {
      title: "معادة للتعديل",
      value: counts?.returned ?? "—",
      subtitle: "أوامر أُعيدت لمندوب المبيعات لتصحيح النواقص",
      icon: RotateCcw,
      tone: (counts?.returned ?? 0) > 0 ? "rose" : "neutral",
    },
    {
      title: "سجل الطلبات المعتمدة",
      value: counts?.approved ?? "—",
      subtitle: "طلبات لها اعتماد مسجل، بما فيها المسلمة والملغاة",
      icon: CheckCircle2,
      tone: "teal",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / طلبات الاعتماد والتصحيح"
        title="إدارة طلبات الاعتماد والمراجعة"
        subtitle="متابعة مسار التدقيق لأوامر التفصيل الجديدة والمعادة لمندوبي المبيعات وتدقيق الصلاحيات"
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            change("tab", "PENDING");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "PENDING"
              ? "bg-amber-100 text-amber-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          بانتظار الاعتماد ({counts?.pending ?? "—"})
        </button>
        <button
          type="button"
          onClick={() => {
            change("tab", "RETURNED");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "RETURNED"
              ? "bg-rose-100 text-rose-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          معادة للتعديل ({counts?.returned ?? "—"})
        </button>
        <button
          type="button"
          onClick={() => {
            change("tab", "APPROVED");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "APPROVED"
              ? "bg-teal-100 text-teal-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          سجل الطلبات المعتمدة ({counts?.approved ?? "—"})
        </button>
        <button
          type="button"
          onClick={() => {
            change("tab", "ALL");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "ALL"
              ? "bg-slate-200 text-slate-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          كل الحالات ({counts?.all ?? "—"})
        </button>
      </div>

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={(value) => {
          change("search", value);
        }}
        searchPlaceholder="ابحث برقم الطلب، العميل، مندوب المبيعات..."
        totalCount={counts?.all}
        filteredCount={data?.pagination.total}
        countLabel="طلب"
      />

      {query === null && (
        <div role="alert">
          {parsed.kind === "invalid"
            ? Object.values(parsed.fieldErrors).flat().join(" ")
            : "راجع البحث والفلاتر قبل تحميل السجل."}{" "}
          <button type="button" onClick={resetFilters}>
            إعادة الفلاتر الافتراضية
          </button>
        </div>
      )}
      {response.isFetching && query !== null && (
        <p role="status">جارٍ تحميل السجل…</p>
      )}
      {response.isError && query !== null && (
        <div role="alert">
          تعذر تحميل السجل.{" "}
          {administrationFailureMessage(response.error, "review")}
          <button
            onClick={() => {
              void response.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {query !== null && (
        <OrientalTable
          data={filtered}
          pagination={{
            page: bounds.page,
            totalPages: bounds.totalPages ?? 0,
            total: bounds.total ?? 0,
            onPageChange: bounds.navigate,
          }}
          emptyTitle={
            data === undefined
              ? response.isError
                ? "تعذر تحميل السجل"
                : "جارٍ تحميل السجل…"
              : "لا توجد سجلات"
          }
          emptySubtitle={
            data === undefined
              ? "احتفظ بالبحث ثم أعد المحاولة."
              : "لا توجد سجلات مطابقة للبحث الحالي."
          }
          keyExtractor={(o) => o.id}
          columns={[
            {
              header: "رقم الطلب",
              render: (o) => (
                <div>
                  <Link
                    href={administrationOrderHref(o.id)}
                    className="font-mono font-bold text-teal-700 hover:underline"
                    dir="ltr"
                  >
                    {o.businessNumber}
                  </Link>
                  <span className="block text-[11px] text-slate-400">
                    {typeLabels[o.type]}
                  </span>
                </div>
              ),
            },
            {
              header: "العميل",
              render: (o) => (
                <div>
                  <strong className="block text-slate-800">
                    {o.customerSnapshot.name}
                  </strong>
                  <span className="text-xs text-slate-400" dir="ltr">
                    {o.customerSnapshot.phone}
                  </span>
                </div>
              ),
            },
            { header: "مندوب المبيعات", render: (o) => o.owner.fullName },
            {
              header: "الكمية المطلوبة",
              render: (o) => `${String(o.counts.active)} قطع`,
            },
            { header: "موعد التسليم", render: (o) => o.deliveryDate ?? "—" },
            {
              header: "ملاحظات الاعتماد / الإعادة",
              render: (o) => (
                <span className="block max-w-xs truncate text-xs text-slate-600">
                  {o.returnInfo?.reason ?? "—"}
                </span>
              ),
            },
            {
              header: "الحالة",
              render: (o) => (
                <OrientalStatusPill
                  tone={statusTone(toSalesOrderStatusLabel(o.status))}
                >
                  {toSalesOrderStatusLabel(o.status)}
                </OrientalStatusPill>
              ),
            },
            {
              header: "الإجراءات",
              className: "text-left",
              render: (o) => (
                <div className="flex items-center justify-end gap-1.5">
                  {o.status === "AWAITING_APPROVAL" && (
                    <Link
                      href={`/approval/orders/${o.id}`}
                      className="btn-pill btn-teal px-2.5 py-1 text-xs"
                    >
                      تدقيق واعتماد
                    </Link>
                  )}
                  <Link
                    href={administrationOrderHref(o.id)}
                    className="btn-pill btn-outline px-2.5 py-1 text-xs"
                  >
                    تفاصيل
                  </Link>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
