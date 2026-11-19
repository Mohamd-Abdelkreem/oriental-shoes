"use client";

import { administrationFailureMessage } from "../model/administration-form.model";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { administrationDeliveryExceptionsQuerySchema } from "@template/contracts";
import { useAdministrationOperationalScope } from "@/shared/query/operational-scope";
import {
  useAdministrationDeliveryExceptions,
  administrationKeys,
} from "../hooks/administration.hooks";
import { useAdministrationPageBounds } from "../hooks/administration-page-bounds.hooks";
import {
  parseAdministrationRoute,
  administrationRouteHref,
  administrationOrderHref,
} from "../model/administration-query.model";
import Link from "next/link";
import { AlertTriangle, Clock, Truck } from "lucide-react";
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

export function AdminDeliveryExceptionsView() {
  const url = useSearchParams().toString(),
    currentScope = useAdministrationOperationalScope();
  const [input, setInput] = useState({ seen: url, raw: url, pending: url });
  let raw = input.raw;
  if (url !== input.seen) {
    raw = url === input.pending ? input.raw : url;
    setInput({ seen: url, raw, pending: url });
  }
  const params = new URLSearchParams(raw),
    parsed = parseAdministrationRoute("delivery-exceptions", params);
  const query =
    parsed.route === "delivery-exceptions" && parsed.kind === "valid"
      ? parsed.query
      : null;
  const response = useAdministrationDeliveryExceptions(query),
    data = response.data,
    counts = data?.counts;
  const safeQuery =
    query ?? administrationDeliveryExceptionsQuerySchema.parse({});
  const scope = currentScope ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    capability: "ADMINISTRATION" as const,
  };
  const bounds = useAdministrationPageBounds({
    resource: "delivery-exceptions",
    query: safeQuery,
    currentKey: administrationKeys.deliveryExceptions(scope, safeQuery),
    scope,
    current: {
      data: query === null ? undefined : data,
      status: response.status,
      fetchStatus: response.fetchStatus,
    },
    onNavigate: (page) => {
      if (query === null) return;
      const href = administrationRouteHref("delivery-exceptions", {
        ...query,
        page,
      });
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
    const state = parseAdministrationRoute("delivery-exceptions", next);
    setInput({
      seen: url,
      raw: next.toString(),
      pending:
        state.route === "delivery-exceptions" && state.kind === "valid"
          ? state.canonicalSearch
          : url,
    });
    if (state.route === "delivery-exceptions" && state.kind === "valid")
      window.history.replaceState(
        null,
        "",
        administrationRouteHref("delivery-exceptions", state.query),
      );
  };
  const resetFilters = () => {
    setInput({ seen: url, raw: "", pending: "" });
    window.history.replaceState(
      null,
      "",
      administrationRouteHref(
        "delivery-exceptions",
        administrationDeliveryExceptionsQuerySchema.parse({}),
      ),
    );
  };
  const search = params.get("search") ?? "",
    tab = query?.tab ?? "";
  const filtered = query === null ? [] : (data?.items ?? []);
  const kpis: KpiCardItem[] = [
    {
      title: "تعذر التسليم",
      value: counts?.failed ?? "—",
      subtitle: "شحنات لم يستلمها العميل وتتطلب إعادة المحاولة",
      icon: AlertTriangle,
      tone: (counts?.failed ?? 0) > 0 ? "rose" : "neutral",
    },
    {
      title: "متأخرة عن الموعد",
      value: counts?.overdue ?? "—",
      subtitle: "طلبات تجاوزت تاريخ التسليم التعاقدي",
      icon: Clock,
      tone: (counts?.overdue ?? 0) > 0 ? "amber" : "neutral",
    },
    {
      title: "خرجت مع المندوب",
      value: counts?.dispatched ?? "—",
      subtitle: "شحنات في طريقها للعميل بانتظار تأكيد التسليم",
      icon: Truck,
      tone: "teal",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / إدارة التسليم والشحن"
        title="استثناءات ومشاكل التسليم (Delivery Exceptions)"
        subtitle="متابعة الشحنات المتعثرة، محاولات التوصيل الفاشلة، والتأخيرات المسجلة في المستودع"
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            change("tab", "FAILED");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "FAILED"
              ? "bg-rose-100 text-rose-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          تعذر التسليم ({counts?.failed ?? "—"})
        </button>
        <button
          type="button"
          onClick={() => {
            change("tab", "OVERDUE");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "OVERDUE"
              ? "bg-amber-100 text-amber-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          متأخرة عن الموعد ({counts?.overdue ?? "—"})
        </button>
        <button
          type="button"
          onClick={() => {
            change("tab", "DISPATCHED");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "DISPATCHED"
              ? "bg-teal-100 text-teal-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          خرجت مع المندوب ({counts?.dispatched ?? "—"})
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
          كل الاستثناءات ({counts?.all ?? "—"})
        </button>
      </div>

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={(value) => {
          change("search", value);
        }}
        searchPlaceholder="ابحث برقم الطلب، العميل، الهاتف، أو الملاحظة..."
        totalCount={counts?.all}
        filteredCount={data?.pagination.total}
        countLabel="شحنة متعثرة"
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
              header: "العميل ورقم الهاتف",
              render: (o) => (
                <div>
                  <strong className="block text-slate-800">
                    {o.customerSnapshot.name}
                  </strong>
                  <span className="font-mono text-xs text-slate-400" dir="ltr">
                    {o.customerSnapshot.phone}
                  </span>
                </div>
              ),
            },
            {
              header: "موعد التسليم المتفق عليه",
              render: (o) => {
                const overdue = o.isOverdue;
                return (
                  <div className="text-xs">
                    <span>{o.deliveryDate ?? "—"}</span>
                    {overdue && (
                      <span className="mt-0.5 block w-max rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                        تجاوز الموعد
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              header: "حالة المستودع والكراتين",
              render: (o) => (
                <div className="text-xs">
                  <span>المستودع: {o.counts.received} قطع</span>
                  <span className="block text-slate-400">
                    الكراتين: تتوفر في تفاصيل المستودع
                  </span>
                </div>
              ),
            },
            {
              header: "سبب التعثر وملاحظات المستودع",
              render: () => (
                <div className="max-w-xs text-xs">
                  <span className="text-slate-500">
                    السبب والملاحظات متاحة في تفاصيل المستودع.
                  </span>
                </div>
              ),
            },
            {
              header: "الحالة العامة",
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
                  <Link
                    href={`/warehouse/orders/${o.id}`}
                    className="btn-pill btn-teal px-2.5 py-1 text-xs"
                  >
                    إجراء المستودع
                  </Link>
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
