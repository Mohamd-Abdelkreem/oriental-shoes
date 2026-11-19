"use client";

import { administrationFailureMessage } from "../model/administration-form.model";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { administrationCorrectionsQuerySchema } from "@template/contracts";
import { useAdministrationOperationalScope } from "@/shared/query/operational-scope";
import {
  useAdministrationCorrections,
  administrationKeys,
} from "../hooks/administration.hooks";
import { useAdministrationPageBounds } from "../hooks/administration-page-bounds.hooks";
import {
  parseAdministrationRoute,
  administrationRouteHref,
  administrationOrderHref,
} from "../model/administration-query.model";
import Link from "next/link";
import { Boxes, CheckCircle2, RotateCcw } from "lucide-react";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import {
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminCorrectionsView() {
  const url = useSearchParams().toString(),
    currentScope = useAdministrationOperationalScope();
  const [input, setInput] = useState({ seen: url, raw: url, pending: url });
  let raw = input.raw;
  if (url !== input.seen) {
    raw = url === input.pending ? input.raw : url;
    setInput({ seen: url, raw, pending: url });
  }
  const params = new URLSearchParams(raw),
    parsed = parseAdministrationRoute("corrections", params);
  const query =
    parsed.route === "corrections" && parsed.kind === "valid"
      ? parsed.query
      : null;
  const response = useAdministrationCorrections(query),
    data = response.data,
    counts = data?.counts;
  const safeQuery = query ?? administrationCorrectionsQuerySchema.parse({});
  const scope = currentScope ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    capability: "ADMINISTRATION" as const,
  };
  const bounds = useAdministrationPageBounds({
    resource: "corrections",
    query: safeQuery,
    currentKey: administrationKeys.corrections(scope, safeQuery),
    scope,
    current: {
      data: query === null ? undefined : data,
      status: response.status,
      fetchStatus: response.fetchStatus,
    },
    onNavigate: (page) => {
      if (query === null) return;
      const href = administrationRouteHref("corrections", { ...query, page });
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
    const state = parseAdministrationRoute("corrections", next);
    setInput({
      seen: url,
      raw: next.toString(),
      pending:
        state.route === "corrections" && state.kind === "valid"
          ? state.canonicalSearch
          : url,
    });
    if (state.route === "corrections" && state.kind === "valid")
      window.history.replaceState(
        null,
        "",
        administrationRouteHref("corrections", state.query),
      );
  };
  const resetFilters = () => {
    setInput({ seen: url, raw: "", pending: "" });
    window.history.replaceState(
      null,
      "",
      administrationRouteHref(
        "corrections",
        administrationCorrectionsQuerySchema.parse({}),
      ),
    );
  };
  const search = params.get("search") ?? "",
    tab = query?.tab ?? "";
  const filtered = query === null ? [] : (data?.items ?? []);
  const kpis: KpiCardItem[] = [
    {
      title: "دورات تصحيح نشطة",
      value: counts?.active ?? "—",
      subtitle: "حصص معادة تتطلب المعالجة وإعادة الفحص",
      icon: RotateCcw,
      tone: (counts?.active ?? 0) > 0 ? "rose" : "neutral",
    },
    {
      title: "إجمالي القطع قيد التصحيح",
      value: counts === undefined ? "—" : `${String(counts.activePieces)} قطعة`,
      subtitle: "تتحرك داخل خطوط المصنع لتعديل العيوب",
      icon: Boxes,
      tone: "amber",
    },
    {
      title: "دورات مغلقة",
      value: counts?.resolved ?? "—",
      subtitle: "دورات انتهت بالقبول أو الرفض أو الإلغاء",
      icon: CheckCircle2,
      tone: "teal",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / رقابة الجودة"
        title="سجل دورات التصحيح وإعادة العمل (Quality Corrections)"
        subtitle="حصر وتتبع جميع الحصص التي أعادتها إدارة الجودة للمصنع، وعدد دورات التصحيح، ومسار المعالجة"
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            change("tab", "ACTIVE");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "ACTIVE"
              ? "bg-rose-100 text-rose-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          قيد المعالجة بالمصنع ({counts?.active ?? "—"})
        </button>
        <button
          type="button"
          onClick={() => {
            change("tab", "RESOLVED");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "RESOLVED"
              ? "bg-teal-100 text-teal-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          دورات مغلقة ({counts?.resolved ?? "—"})
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
          الكل ({counts?.all ?? "—"})
        </button>
      </div>

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={(value) => {
          change("search", value);
        }}
        searchPlaceholder="ابحث برقم الطلب، العميل، القسم، أو سبب العيب..."
        totalCount={counts?.all}
        filteredCount={data?.pagination.total}
        countLabel="حالة تصحيح"
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
      {query !== null && data !== undefined && (
        <OrientalTable
          data={filtered}
          pagination={{
            page: bounds.page,
            totalPages: bounds.totalPages ?? 0,
            total: bounds.total ?? 0,
            onPageChange: bounds.navigate,
          }}
          emptyTitle="لا توجد سجلات"
          emptySubtitle="لا توجد سجلات مطابقة للبحث الحالي."
          keyExtractor={(c) => c.id}
          columns={[
            {
              header: "رقم الطلب والعميل",
              render: (c) => (
                <div>
                  <Link
                    href={administrationOrderHref(c.orderId)}
                    className="block font-mono font-bold text-teal-700 hover:underline"
                    dir="ltr"
                  >
                    {c.businessNumber}
                  </Link>
                  <span className="text-xs font-semibold text-slate-700">
                    {c.customerName}
                  </span>
                </div>
              ),
            },
            {
              header: "القسم المرجع إليه",
              render: (c) => (
                <strong className="text-xs text-slate-800">
                  {c.target === "CUTTING" ? "القص" : "الإنتاج والإصلاح"}
                </strong>
              ),
            },
            {
              header: "الكمية المعادة",
              render: (c) => (
                <span className="text-xs font-bold text-rose-700">
                  قطعة واحدة — بند {c.position} — {c.model ?? "—"}
                </span>
              ),
            },
            {
              header: "رقم دورة التصحيح",
              render: (c) => (
                <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  دورة #{c.cycle}
                </span>
              ),
            },
            {
              header: "سبب العيب وتوجيه الجودة",
              render: (c) => (
                <span className="block max-w-sm text-xs text-slate-600">
                  {c.reason} — {c.instructions}
                </span>
              ),
            },
            {
              header: "التاريخ",
              render: (c) => (
                <div>
                  <time dateTime={c.rejectedAt}>{c.rejectedAt}</time>
                  {c.resolvedAt !== null && (
                    <span className="block">
                      أغلقت: <time dateTime={c.resolvedAt}>{c.resolvedAt}</time>
                    </span>
                  )}
                </div>
              ),
              className: "text-xs text-slate-400 font-mono",
            },
            {
              header: "حالة المعالجة",
              render: (c) => (
                <OrientalStatusPill
                  tone={
                    c.state === "ACCEPTED"
                      ? "emerald"
                      : c.state === "OPEN"
                        ? "rose"
                        : "neutral"
                  }
                >
                  {
                    {
                      OPEN: "قيد المعالجة بالمصنع",
                      ACCEPTED: "تمت المعالجة والاعتماد",
                      REJECTED: "مرفوضة",
                      CANCELLED: "ملغاة",
                    }[c.state]
                  }
                </OrientalStatusPill>
              ),
            },
            {
              header: "الإجراء",
              className: "text-left",
              render: (c) => (
                <Link
                  href={administrationOrderHref(c.orderId)}
                  className="btn-pill btn-outline px-2.5 py-1 text-xs"
                >
                  تتبع الطلب
                </Link>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
