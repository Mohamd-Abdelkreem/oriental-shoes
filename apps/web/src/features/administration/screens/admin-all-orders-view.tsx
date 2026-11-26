"use client";

import { administrationFailureMessage } from "../model/administration-form.model";
import { orderTypeOptions } from "@/features/orders/order-types";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  administrationOrdersQuerySchema,
  salesOrderStatusSchema,
} from "@template/contracts";
import { useAdministrationOperationalScope } from "@/shared/query/operational-scope";
import {
  useAdministrationOrders,
  useAdministrationFilterOptions,
  administrationKeys,
} from "../hooks/administration.hooks";
import { useAdministrationPageBounds } from "../hooks/administration-page-bounds.hooks";
import {
  parseAdministrationRoute,
  resolveAdministrationSalespersonRoute,
  administrationRouteHref,
  administrationOrderHref,
} from "../model/administration-query.model";
import { toAdministrationOrderRow } from "../model/administration-view.model";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";
import Link from "next/link";
import { BarChart3, Eye, Printer } from "lucide-react";
import { orderTypeLabels as typeLabels } from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  FilterSelect,
  OrientalFilterBar,
} from "@/features/prototype/components/filter-bar";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminAllOrdersView() {
  const url = useSearchParams().toString(),
    currentScope = useAdministrationOperationalScope();
  const [input, setInput] = useState({ seen: url, raw: url, pending: url });
  let raw = input.raw;
  if (url !== input.seen) {
    raw = url === input.pending ? input.raw : url;
    setInput({ seen: url, raw, pending: url });
  }
  const params = new URLSearchParams(raw),
    parsed = parseAdministrationRoute("orders", params);
  const ownerIntent = params.has("salesperson") || params.has("salespersonId");
  const options = useAdministrationFilterOptions(
    parsed.route === "orders" && parsed.kind === "resolve-salesperson"
      ? { salespersonName: parsed.legacyName }
      : ownerIntent
        ? {}
        : null,
  );
  const resolved =
    parsed.route === "orders" &&
    parsed.kind === "resolve-salesperson" &&
    options.isSuccess &&
    !options.isError &&
    !options.isFetching &&
    options.data !== undefined
      ? resolveAdministrationSalespersonRoute(parsed, options.data)
      : parsed;
  const query =
    resolved.route === "orders" && resolved.kind === "valid"
      ? resolved.query
      : null;
  const orders = useAdministrationOrders(query),
    data = orders.data;
  const scope = currentScope ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    capability: "ADMINISTRATION" as const,
  };
  const safeQuery = query ?? administrationOrdersQuerySchema.parse({});
  const bounds = useAdministrationPageBounds({
    resource: "orders",
    query: safeQuery,
    currentKey: administrationKeys.orders(scope, safeQuery),
    scope,
    current: {
      data: query === null ? undefined : data,
      status: orders.status,
      fetchStatus: orders.fetchStatus,
    },
    onNavigate: (page) => {
      if (query === null) return;
      const href = administrationRouteHref("orders", { ...query, page });
      if (data !== undefined && query.page > data.pagination.totalPages)
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
      resolved.route === "orders" &&
      resolved.kind === "valid" &&
      resolved.query.salespersonId !== undefined
    ) {
      next.delete("salesperson");
      next.set("salespersonId", resolved.query.salespersonId);
    }
    if (field === "exception") next.delete("flag");
    if (field === "salespersonId") next.delete("salesperson");
    if (value === "الكل" || value === "") next.delete(field);
    else next.set(field, value);
    const state = parseAdministrationRoute("orders", next);
    const pending =
      state.route === "orders" && state.kind === "valid"
        ? state.canonicalSearch
        : url;
    setInput({ seen: url, raw: next.toString(), pending });
    if (state.route === "orders" && state.kind === "valid")
      window.history.replaceState(
        null,
        "",
        administrationRouteHref("orders", state.query),
      );
  };
  const search = params.get("search") ?? "",
    statusFilter = query?.status ?? params.get("status") ?? "الكل",
    typeFilter = params.get("type") ?? "الكل",
    deptFilter = query?.department ?? params.get("department") ?? "الكل",
    flagFilter =
      query?.exception ??
      params.get("exception") ??
      params.get("flag") ??
      "الكل";
  const resetFilters = () => {
    setInput({ seen: url, raw: "", pending: "period=ALL&page=1&limit=25" });
    window.history.replaceState(null, "", "/admin/orders");
  };
  const filtered =
    query === null ? [] : (data?.items ?? []).map(toAdministrationOrderRow);
  const allStatuses = (
    ["DRAFT", ...salesOrderStatusSchema.options] as const
  ).map((status) => ({
    value: status,
    label: status === "DRAFT" ? "مسودة" : toSalesOrderStatusLabel(status),
  }));

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / سجل الطلبات"
        title="جميع أوامر التصنيع"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {data?.pagination.total ?? "—"} طلب
          </span>
        }
        subtitle="قاعدة بيانات موحدة لجميع طلبات المعارض، المبيعات الخارجية، والإصلاح عبر المصنع"
        actions={
          <Link href="/admin/reports" className="btn-pill btn-outline">
            <BarChart3 size={15} />
            <span>طباعة تقرير بالنتائج</span>
          </Link>
        }
      />

      {/* Filter Bar */}
      <OrientalFilterBar
        searchValue={search}
        onSearchChange={(value) => {
          change("search", value);
        }}
        searchPlaceholder="ابحث برقم الطلب، العميل، الهاتف، أو الموديل..."
        onReset={resetFilters}
        totalCount={data?.totalOrders}
        filteredCount={data?.pagination.total}
        countLabel="طلب"
      >
        <FilterSelect
          value={typeFilter}
          onChange={(value) => {
            change("type", value);
          }}
          options={[
            { label: "كل الأنواع", value: "الكل" },
            ...orderTypeOptions,
          ]}
        />

        <FilterSelect
          value={statusFilter}
          onChange={(value) => {
            change("status", value);
          }}
          options={[{ label: "الكل", value: "الكل" }, ...allStatuses]}
        />

        <FilterSelect
          value={deptFilter}
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
          value={flagFilter}
          onChange={(value) => {
            change("exception", value);
          }}
          options={[
            { label: "كل الحالات الخاصة", value: "الكل" },
            { label: "متأخرة عن الموعد", value: "OVERDUE" },
            { label: "ملغاة جزئياً", value: "PARTIALLY_CANCELLED" },
            { label: "جاهزة للتسليم", value: "READY" },
            { label: "مكتملة ومستلمة", value: "DELIVERED" },
          ]}
        />
        {ownerIntent && (
          <FilterSelect
            ariaLabel="مسؤول المبيعات"
            value={
              query?.salespersonId ??
              params.get("salespersonId") ??
              "unresolved"
            }
            onChange={(value) => {
              change("salespersonId", value);
            }}
            options={[
              { label: "اختر حساب مسؤول المبيعات", value: "unresolved" },
              { label: "كل مسؤولي المبيعات", value: "الكل" },
              ...(query?.salespersonId !== undefined &&
              !options.data?.salespeople.some(
                (owner) => owner.id === query.salespersonId,
              )
                ? [
                    {
                      label: "مسؤول المبيعات المحدد",
                      value: query.salespersonId,
                    },
                  ]
                : []),
              ...(options.data?.salespeople ?? []).map((owner) => ({
                label: owner.phone
                  ? `${owner.fullName} — ${owner.phone}`
                  : owner.fullName,
                value: owner.id,
              })),
            ]}
          />
        )}
      </OrientalFilterBar>

      {query === null && (
        <div role="alert">
          {resolved.kind === "invalid"
            ? Object.values(resolved.fieldErrors).flat().join(" ")
            : "اختر حساب مسؤول المبيعات بعد اكتمال التحقق من الاسم."}
          {options.isFetching && " جارٍ التحقق من اسم البائع…"}
          <button type="button" onClick={resetFilters}>
            إعادة الفلاتر الافتراضية
          </button>
        </div>
      )}
      {options.isError && ownerIntent && (
        <div role="alert">
          تعذر تحميل حسابات مسؤولي المبيعات.{" "}
          {administrationFailureMessage(options.error, "review")}{" "}
          <button
            type="button"
            onClick={() => {
              void options.refetch();
            }}
          >
            إعادة تحميل مسؤولي المبيعات
          </button>
        </div>
      )}
      {orders.isFetching && query !== null && (
        <p role="status">جارٍ تحميل الطلبات…</p>
      )}
      {orders.isError && query !== null && (
        <div role="alert">
          تعذر تحميل الطلبات.{" "}
          {administrationFailureMessage(orders.error, "review")}
          <button
            onClick={() => {
              void orders.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {/* Orders Table */}
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
          emptySubtitle="لا توجد طلبات مطابقة للفلاتر الحالية."
          keyExtractor={(o) => o.id}
          isSearchEmpty={search !== "" || statusFilter !== "الكل"}
          columns={[
            {
              header: "رقم الطلب",
              render: (order) => (
                <div>
                  <strong
                    className="block font-mono font-bold text-teal-700"
                    dir="ltr"
                  >
                    {order.reference}
                  </strong>
                  <span className="text-[11px] text-slate-400">
                    {typeLabels[order.type]}
                  </span>
                </div>
              ),
            },
            {
              header: "العميل",
              render: (order) => (
                <div>
                  <strong className="block text-slate-800">
                    {order.customerName ?? "—"}
                  </strong>
                  <span className="text-xs text-slate-400" dir="ltr">
                    {order.phone ?? "—"}
                  </span>
                </div>
              ),
            },
            {
              header: "الكميات (أصلية / ملغاة / مطلوبة)",
              render: (order) => {
                if (order.counts === null)
                  return (
                    <span>
                      {order.capturedPieceCount} بند مسودة — لا توجد كميات
                      تشغيلية
                    </span>
                  );
                const orig = order.counts.original,
                  canc = order.counts.cancelled,
                  req = order.counts.active;
                return (
                  <div className="text-xs font-semibold">
                    <span>{orig} أصلية</span>
                    {canc > 0 && (
                      <span className="text-rose-600"> · {canc} ملغاة</span>
                    )}
                    <strong className="mt-0.5 block text-teal-700">
                      {req} مطلوبة
                    </strong>
                  </div>
                );
              },
            },
            {
              header: "حالة إنجاز القطع",
              render: (order) => {
                if (order.counts === null) return <span>—</span>;
                const req = order.counts.active;
                return (
                  <div className="space-y-1 text-xs">
                    <strong className="block text-slate-800">
                      {order.counts.received} من {req} بالمستودع
                    </strong>
                    <span className="block rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                      {order.counts.completionPercent}٪
                    </span>
                  </div>
                );
              },
            },
            {
              header: "مكان القطعة الآن",
              render: (order) => {
                return (
                  <div className="flex max-w-[200px] flex-wrap gap-1">
                    {order.currentDepartments.map((location) => (
                      <span
                        key={location}
                        className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800"
                      >
                        {
                          {
                            CUTTING: "القص",
                            PRODUCTION: "الإنتاج والإصلاح",
                            QUALITY: "الجودة والتغليف",
                            WAREHOUSE: "المستودع",
                          }[location]
                        }
                      </span>
                    ))}
                  </div>
                );
              },
            },
            {
              header: "تاريخ التسليم",
              render: (order) => {
                const overdue = order.isOverdue;
                return (
                  <div className="text-xs">
                    <span>{order.deliveryDate ?? "—"}</span>
                    {overdue && (
                      <span className="mt-0.5 block w-max rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                        متأخر
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              header: "الحالة",
              render: (order) => (
                <OrientalStatusPill tone={statusTone(order.statusLabel)}>
                  {order.statusLabel}
                </OrientalStatusPill>
              ),
            },
            {
              header: "الإجراءات",
              className: "text-left",
              render: (order) => (
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    href={administrationOrderHref(order.id)}
                    className="btn-pill btn-outline px-2.5 py-1 text-xs"
                  >
                    <Eye size={13} />
                    <span>تفاصيل</span>
                  </Link>
                  {order.canPrint && (
                    <Link
                      href={`/print/order/${order.id}`}
                      className="btn-pill btn-ghost p-1.5 text-xs text-slate-500"
                      title="طباعة أمر التفصيل"
                    >
                      <Printer size={14} />
                    </Link>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
