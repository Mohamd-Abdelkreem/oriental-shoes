"use client";

import { apiFailureMessage } from "@/services/api/api-client";
import { orderTypeOptions } from "@/features/orders/order-types";
import { useState, useMemo, useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { hashKey, useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  administrationReportQuerySchema,
  administrationReportPrintQuerySchema,
  administrationReportDataSchema,
  salesOrderStatusSchema,
} from "@template/contracts";
import {
  useAdministrationOperationalScope,
  assertCurrentAdministrationOperationalScope,
  type AdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import {
  useAdministrationReport,
  useAdministrationFilterOptions,
  administrationKeys,
} from "../hooks/administration.hooks";
import { useAdministrationPageBounds } from "../hooks/administration-page-bounds.hooks";
import {
  parseAdministrationRoute,
  resolveAdministrationSalespersonRoute,
  administrationRouteHref,
  administrationReportPrintHref,
} from "../model/administration-query.model";
import {
  toAdministrationReportFilters,
  toAdministrationReportRow,
  toAdministrationDepartmentRows,
} from "../model/administration-report.model";
import { administrationFailureMessage } from "../model/administration-form.model";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";
import { Printer } from "lucide-react";
import { orderTypeLabels as typeLabels } from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { FilterSelect } from "@/features/prototype/components/filter-bar";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

const noServerReport = () => undefined;

export function AdminReportsView() {
  const client = useQueryClient(),
    url = useSearchParams().toString(),
    currentScope = useAdministrationOperationalScope();
  const scope = useMemo<AdministrationOperationalScope>(
    () => ({
      actorId: currentScope?.actorId ?? "",
      accessVersion: currentScope?.accessVersion ?? 0,
      epoch: currentScope?.epoch ?? -1,
      capability: "ADMINISTRATION",
    }),
    [currentScope?.actorId, currentScope?.accessVersion, currentScope?.epoch],
  );
  const [input, setInput] = useState({ seen: url, raw: url, pending: url }),
    [printFailure, setPrintFailure] = useState<string | null>(null);
  let raw = input.raw;
  if (url !== input.seen) {
    raw = url === input.pending ? input.raw : url;
    setInput({ seen: url, raw, pending: url });
  }
  const params = new URLSearchParams(raw),
    parsed = parseAdministrationRoute("reports", params);
  const options = useAdministrationFilterOptions(
    parsed.route === "reports" && parsed.kind === "resolve-salesperson"
      ? { salespersonName: parsed.legacyName }
      : {},
  );
  const resolved =
    parsed.route === "reports" &&
    parsed.kind === "resolve-salesperson" &&
    options.isSuccess &&
    !options.isError &&
    !options.isFetching &&
    options.data !== undefined
      ? resolveAdministrationSalespersonRoute(parsed, options.data)
      : parsed;
  const query =
    resolved.route === "reports" && resolved.kind === "valid"
      ? resolved.query
      : null;
  const response = useAdministrationReport(query),
    data = response.data;
  const safeQuery = query ?? administrationReportQuerySchema.parse({}),
    capturedQuery = JSON.stringify(safeQuery);
  const currentKey = useMemo(
    () =>
      administrationKeys.report(
        scope,
        administrationReportQuerySchema.parse(JSON.parse(capturedQuery)),
      ),
    [capturedQuery, scope],
  );
  const subscribe = useCallback(
    (notify: () => void) =>
      client
        .getQueryCache()
        .subscribe((event: { query: { queryKey: QueryKey } }) => {
          if (hashKey(event.query.queryKey) === hashKey(currentKey)) notify();
        }),
    [client, currentKey],
  );
  const snapshot = useCallback(
    () => client.getQueryState(currentKey),
    [client, currentKey],
  );
  const cache = useSyncExternalStore(subscribe, snapshot, noServerReport);
  const bounds = useAdministrationPageBounds({
    resource: "report",
    query: safeQuery,
    currentKey,
    scope,
    current: {
      data: query === null ? undefined : data,
      status: response.status,
      fetchStatus: response.fetchStatus,
    },
    onNavigate: (page) => {
      if (query === null) return;
      const href = administrationRouteHref("reports", { ...query, page });
      if (data !== undefined && query.page > data.orders.pagination.totalPages)
        window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
    },
  });
  const change = (field: string, value: string) => {
    const next = new URLSearchParams(raw);
    next.delete("page");
    if (
      field !== "salespersonId" &&
      parsed.kind === "resolve-salesperson" &&
      resolved.route === "reports" &&
      resolved.kind === "valid" &&
      resolved.query.salespersonId !== undefined
    ) {
      next.delete("salesperson");
      next.set("salespersonId", resolved.query.salespersonId);
    }
    if (field === "salespersonId") next.delete("salesperson");
    if (field === "from") next.delete("dateFrom");
    if (field === "to") next.delete("dateTo");
    if (field === "period") {
      for (const name of ["from", "to", "dateFrom", "dateTo"])
        next.delete(name);
    }
    if (value === "الكل" || value === "") next.delete(field);
    else next.set(field, value);
    const state = parseAdministrationRoute("reports", next);
    setInput({
      seen: url,
      raw: next.toString(),
      pending:
        state.route === "reports" && state.kind === "valid"
          ? state.canonicalSearch
          : url,
    });
    setPrintFailure(null);
    if (state.route === "reports" && state.kind === "valid")
      window.history.replaceState(
        null,
        "",
        administrationRouteHref("reports", state.query),
      );
  };
  const period = query?.period ?? params.get("period") ?? "MONTH",
    type = query?.type ?? params.get("type") ?? "الكل",
    status = query?.status ?? params.get("status") ?? "الكل",
    department = query?.department ?? params.get("department") ?? "الكل",
    salesperson =
      query?.salespersonId ??
      params.get("salespersonId") ??
      (params.has("salesperson") ? "unresolved" : "الكل"),
    effectiveFrom = params.get("from") ?? params.get("dateFrom") ?? "",
    effectiveTo = params.get("to") ?? params.get("dateTo") ?? "";
  const filtered =
    query === null
      ? []
      : (data?.orders.items ?? []).map(toAdministrationReportRow);
  const facts = query === null ? undefined : data?.kpis;
  const totalOrders = facts?.orders ?? "—",
    totalItems = facts?.originalPieces ?? "—",
    activeQty = facts?.activePieces ?? "—",
    completedQty = facts?.receivedPieces ?? "—",
    cancelledQty = facts?.cancelledPieces ?? "—",
    readyOrders = facts?.readyOrders ?? "—",
    deliveredOrders = facts?.deliveredOrders ?? "—",
    delayedOrders = facts?.overdueOrders ?? "—";
  const presentation =
    data === undefined || query === null
      ? null
      : toAdministrationReportFilters(query, data.meta);
  const eligible =
    query !== null &&
    data !== undefined &&
    response.isSuccess &&
    !response.isFetching &&
    cache?.status === "success" &&
    cache.fetchStatus === "idle" &&
    !cache.isInvalidated;
  const handlePrint = () => {
    try {
      if (query === null || !eligible) return;
      assertCurrentAdministrationOperationalScope(client, scope);
      const current = client.getQueryState(currentKey);
      if (
        current?.status !== "success" ||
        current.fetchStatus !== "idle" ||
        current.isInvalidated
      )
        return;
      const fresh = administrationReportDataSchema.parse(current.data);
      toAdministrationReportFilters(query, fresh.meta);
      const { page: _page, limit: _limit, ...filters } = query;
      const printQuery = administrationReportPrintQuerySchema.parse({
        ...filters,
        from: fresh.meta.effectiveFrom ?? undefined,
        to: fresh.meta.effectiveTo ?? undefined,
      });
      setPrintFailure(null);
      window.open(
        administrationReportPrintHref(printQuery),
        "_blank",
        "noopener,noreferrer",
      );
    } catch (error: unknown) {
      setPrintFailure(administrationFailureMessage(error, "report"));
    }
  };

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / التقارير التشغيلية"
        title="تقرير الأداء والكميات التشغيلية"
        subtitle="إحصائيات دقيقة لكميات التصنيع والمستودع ونسب الإنجاز (خالٍ تماماً من أي بيانات مالية أو محاسبية)"
        actions={
          <button
            type="button"
            className="btn-pill btn-teal"
            disabled={!eligible}
            onClick={handlePrint}
          >
            <Printer size={15} />
            <span>طباعة التقرير التشغيلي (A4)</span>
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
        <FilterSelect
          label="الفترة:"
          value={period}
          onChange={(value) => {
            change("period", value);
          }}
          options={[
            { label: "اليوم", value: "TODAY" },
            { label: "الشهر", value: "MONTH" },
            { label: "السنة", value: "YEAR" },
            { label: "كل الفترات", value: "ALL" },
          ]}
        />
        <FilterSelect
          label="نوع الطلب:"
          value={type}
          onChange={(value) => {
            change("type", value);
          }}
          options={[
            { label: "كل الأنواع", value: "الكل" },
            ...orderTypeOptions,
          ]}
        />
        <FilterSelect
          label="حالة الطلب:"
          value={status}
          onChange={(value) => {
            change("status", value);
          }}
          options={[
            { label: "الكل", value: "الكل" },
            ...(["DRAFT", ...salesOrderStatusSchema.options] as const).map(
              (value) => ({ value, label: toSalesOrderStatusLabel(value) }),
            ),
          ]}
        />
        <FilterSelect
          label="المرحلة / القسم:"
          value={department}
          onChange={(value) => {
            change("department", value);
          }}
          options={[
            { label: "الكل", value: "الكل" },
            { label: "القص", value: "CUTTING" },
            { label: "الإنتاج والإصلاح", value: "PRODUCTION" },
            { label: "الجودة والتغليف", value: "QUALITY" },
            { label: "المستودع", value: "WAREHOUSE" },
          ]}
        />
        <FilterSelect
          label="مسؤول المبيعات:"
          value={salesperson}
          onChange={(value) => {
            change("salespersonId", value);
          }}
          options={[
            { label: "الكل", value: "الكل" },
            ...(salesperson === "unresolved"
              ? [{ label: "اختر حساباً لحسم اسم البائع", value: "unresolved" }]
              : []),
            ...(options.data?.salespeople ?? []).map((owner) => ({
              label: `${owner.fullName} — ${owner.phone ?? owner.id}`,
              value: owner.id,
            })),
          ]}
        />
        <div className="mr-auto flex items-center gap-1.5">
          <span className="font-medium text-slate-500">من:</span>
          <input
            aria-label="من تاريخ"
            type="date"
            value={effectiveFrom}
            onChange={(e) => {
              change("from", e.target.value);
            }}
            className="oriental-input px-2 py-1 text-xs"
          />
          <span className="font-medium text-slate-500">إلى:</span>
          <input
            aria-label="إلى تاريخ"
            type="date"
            value={effectiveTo}
            onChange={(e) => {
              change("to", e.target.value);
            }}
            className="oriental-input px-2 py-1 text-xs"
          />
        </div>
      </div>

      {resolved.kind === "invalid" && (
        <div role="alert">
          {Object.values(resolved.fieldErrors).flat().join(" ")}
          <button
            type="button"
            onClick={() => {
              setInput({ seen: url, raw: "", pending: "" });
              setPrintFailure(null);
              window.history.replaceState(
                null,
                "",
                administrationRouteHref(
                  "reports",
                  administrationReportQuerySchema.parse({}),
                ),
              );
            }}
          >
            إعادة الفلاتر الافتراضية
          </button>
        </div>
      )}
      {parsed.kind === "resolve-salesperson" && options.isFetching && (
        <p role="status">جارٍ مطابقة حساب مسؤول المبيعات…</p>
      )}
      {options.isError && (
        <div role="alert">
          تعذر تحميل قائمة مسؤولي المبيعات. {apiFailureMessage(options.error)}{" "}
          <button
            onClick={() => {
              void options.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {response.isFetching && query !== null && (
        <p role="status">جارٍ تحميل التقرير…</p>
      )}
      {response.isError && query !== null && (
        <div role="alert">
          {administrationFailureMessage(response.error, "report")}{" "}
          <button
            onClick={() => {
              void response.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {printFailure && <p role="alert">{printFailure}</p>}
      {presentation !== null && data !== undefined && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
          <p>
            نطاق الطلبات: {presentation.cohortLabel} — من{" "}
            {presentation.effectiveFrom ?? "دون حد"} إلى{" "}
            {presentation.effectiveTo ?? "دون حد"} —{" "}
            {presentation.businessTimeZone}
          </p>
          <p>
            أعده: {data.meta.generatedBy.fullName} — {presentation.generatedAt}
          </p>
          <p>
            {presentation.workforceScopeLabel} — {data.workforce.activeStaff}{" "}
            فعال من {data.workforce.totalStaff}
          </p>
          <p>
            {toAdministrationDepartmentRows(data.departments)
              .map((row) => `${row.label}: ${String(row.pieces)} قطعة`)
              .join(" · ")}
          </p>
          <p>
            الاستثناءات: {data.exceptions.categoryCases} حالة تصنيفية —{" "}
            {data.exceptions.distinctOrders} طلب متأثر دون تكرار؛ سجل الجودة:{" "}
            {data.exceptions.correctionHistoryOrders}، المعاد حالياً:{" "}
            {data.exceptions.returnedOrders}
          </p>
        </section>
      )}
      {/* Report Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-xs text-slate-400">
            إجمالي الأوامر
          </span>
          <strong className="text-2xl font-bold text-slate-800">
            {totalOrders}
          </strong>
          <small className="mt-1 block text-[11px] text-slate-500">
            {totalItems} قطعة أصلية مقدمة — المسودات دون كميات تشغيلية
          </small>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-xs text-slate-400">
            الكمية المطلوبة النشطة
          </span>
          <strong className="text-2xl font-bold text-teal-700">
            {activeQty} قطعة
          </strong>
          <small className="mt-1 block text-[11px] text-rose-500">
            {cancelledQty} قطعة ملغاة
          </small>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-xs text-slate-400">
            المستلم بالمستودع
          </span>
          <strong className="text-2xl font-bold text-emerald-700">
            {completedQty} قطعة
          </strong>
          <small className="mt-1 block text-[11px] text-slate-500">
            نسبة الإنجاز: {facts?.completionPercent ?? "—"}٪
          </small>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-xs text-slate-400">
            جاهزة / مسلمة / متأخرة
          </span>
          <strong className="text-lg font-bold text-slate-800">
            {readyOrders} جاهز · {deliveredOrders} استلم
          </strong>
          <small className="mt-1 block text-[11px] font-bold text-rose-600">
            {delayedOrders} طلب متأخر
          </small>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-800">
            تفاصيل الأوامر المشمولة في هذا التقرير:
          </h3>
        </div>
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
            keyExtractor={(o) => o.row.orderId}
            columns={[
              { header: "رقم الطلب", accessor: "reference" },
              { header: "العميل", render: (o) => o.row.customer.name ?? "—" },
              { header: "النوع", render: (o) => typeLabels[o.row.type] },
              {
                header: "المطلوب",
                render: (o) =>
                  o.row.kind === "draft"
                    ? "غير متاح لمسودة"
                    : `${String(o.row.counts.active)} قطع`,
              },
              {
                header: "المستلم بالمستودع",
                render: (o) => o.completionLabel,
              },
              {
                header: "تاريخ التسليم",
                render: (o) => o.row.deliveryDate ?? "—",
              },
              {
                header: "الحالة",
                render: (o) => (
                  <OrientalStatusPill tone={statusTone(o.statusLabel)}>
                    {o.statusLabel}
                  </OrientalStatusPill>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
