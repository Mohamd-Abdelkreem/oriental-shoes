"use client";

import { administrationFailureMessage } from "../model/administration-form.model";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { administrationActivityQuerySchema } from "@template/contracts";
import { useAdministrationOperationalScope } from "@/shared/query/operational-scope";
import {
  useAdministrationActivity,
  administrationKeys,
} from "../hooks/administration.hooks";
import { useAdministrationPageBounds } from "../hooks/administration-page-bounds.hooks";
import {
  parseAdministrationRoute,
  administrationRouteHref,
  administrationOrderHref,
} from "../model/administration-query.model";
import Link from "next/link";
import { toAdministrationActivityRow } from "../model/administration-event.model";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function AdminActivityView() {
  const url = useSearchParams().toString(),
    currentScope = useAdministrationOperationalScope();
  const [input, setInput] = useState({ seen: url, raw: url, pending: url });
  let raw = input.raw;
  if (url !== input.seen) {
    raw = url === input.pending ? input.raw : url;
    setInput({ seen: url, raw, pending: url });
  }
  const params = new URLSearchParams(raw),
    parsed = parseAdministrationRoute("activity", params);
  const query =
    parsed.route === "activity" && parsed.kind === "valid"
      ? parsed.query
      : null;
  const response = useAdministrationActivity(query),
    data = response.data;
  const safeQuery = query ?? administrationActivityQuerySchema.parse({});
  const scope = currentScope ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    capability: "ADMINISTRATION" as const,
  };
  const bounds = useAdministrationPageBounds({
    resource: "activity",
    query: safeQuery,
    currentKey: administrationKeys.activity(scope, safeQuery),
    scope,
    current: {
      data: query === null ? undefined : data,
      status: response.status,
      fetchStatus: response.fetchStatus,
    },
    onNavigate: (page) => {
      if (query === null) return;
      const href = administrationRouteHref("activity", { ...query, page });
      if (data !== undefined && query.page > data.pagination.totalPages)
        window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
    },
  });
  const change = (field: "search", value: string) => {
    const next = new URLSearchParams(raw);
    next.delete("page");
    if (value === "") next.delete(field);
    else next.set(field, value);
    const state = parseAdministrationRoute("activity", next);
    setInput({
      seen: url,
      raw: next.toString(),
      pending:
        state.route === "activity" && state.kind === "valid"
          ? state.canonicalSearch
          : url,
    });
    if (state.route === "activity" && state.kind === "valid")
      window.history.replaceState(
        null,
        "",
        administrationRouteHref("activity", state.query),
      );
  };
  const resetFilters = () => {
    setInput({ seen: url, raw: "", pending: "" });
    window.history.replaceState(
      null,
      "",
      administrationRouteHref(
        "activity",
        administrationActivityQuerySchema.parse({}),
      ),
    );
  };
  const search = params.get("search") ?? "";
  const filtered =
    query === null ? [] : (data?.events ?? []).map(toAdministrationActivityRow);

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / سجل الرقابة"
        title="سجل النشاط والحركات العام"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {data?.pagination.total ?? "—"} حركة
          </span>
        }
        subtitle="سجل رقابي غير قابل للتعديل يوثق كل إجراء، ومن نفذه، وتاريخه، وأثره على الكميات"
      />

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={(value) => {
          change("search", value);
        }}
        searchPlaceholder="ابحث بالإجراء، رقم الطلب، الموظف، أو الملاحظة..."
        totalCount={data?.pagination.total}
        filteredCount={data?.pagination.total}
        countLabel="حدث"
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
          keyExtractor={(e) => e.id}
          columns={[
            {
              header: "الحدث والإجراء",
              render: (e) => (
                <strong className="text-slate-800">{e.actionLabel}</strong>
              ),
            },
            {
              header: "رقم الطلب",
              render: (e) => (
                <Link
                  href={administrationOrderHref(e.orderId)}
                  className="font-mono font-bold text-teal-700"
                  dir="ltr"
                >
                  {e.reference}
                </Link>
              ),
            },
            {
              header: "الموظف المنفذ",
              render: (e) => (
                <div className="text-xs">
                  <strong>{e.actorName}</strong>
                  <span className="block text-slate-400">
                    {e.actorDepartmentLabel}
                  </span>
                </div>
              ),
            },
            {
              header: "الكمية",
              render: (e) => (
                <span className="text-xs font-bold">
                  {e.quantity ? `${String(e.quantity)} قطع` : "—"}
                </span>
              ),
            },
            {
              header: "مسار الحركة (من ← إلى)",
              render: (e) => (
                <span className="text-xs text-slate-600">
                  {e.sourceLabel ? `${e.sourceLabel} ← ` : ""}
                  {e.destinationLabel || "—"}
                </span>
              ),
            },
            {
              header: "الملاحظات والسبب",
              render: (e) => (
                <div className="text-xs text-slate-500">
                  <span>{e.note ?? "—"}</span>
                  {e.correctionFields.length > 0 && (
                    <dl>
                      {e.correctionFields.map((field) => (
                        <div key={field.label}>
                          <dt>{field.label}</dt>
                          <dd>
                            {field.before ?? "—"} ← {field.after ?? "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ),
            },
            {
              header: "التوقيت",
              accessor: "occurredAt",
              className: "text-slate-400 text-xs font-mono",
            },
          ]}
        />
      )}
    </div>
  );
}
