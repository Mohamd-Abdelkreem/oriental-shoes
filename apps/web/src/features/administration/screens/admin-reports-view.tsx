"use client";

import { useState, useMemo } from "react";
import { Printer } from "lucide-react";
import {
  requiredQuantity,
  typeLabels,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import {
  filteredOrders,
  isOrderOverdue,
  reportPeriodRange,
} from "@/features/prototype/state/workflow";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { FilterSelect } from "@/features/prototype/components/filter-bar";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminReportsView() {
  const store = useMvpStore();
  const [period, setPeriod] = useState("الشهر");
  const [type, setType] = useState("الكل");
  const [status, setStatus] = useState("الكل");
  const [department, setDepartment] = useState("الكل");
  const [salesperson, setSalesperson] = useState("الكل");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const range = reportPeriodRange(period);
  const effectiveFrom = dateFrom || range.from;
  const effectiveTo = dateTo || range.to;

  const filtered = useMemo(() => {
    return filteredOrders(store.orders, {
      period,
      type,
      status,
      department,
      salesperson,
      from: effectiveFrom,
      to: effectiveTo,
    });
  }, [
    store.orders,
    period,
    type,
    status,
    department,
    salesperson,
    effectiveFrom,
    effectiveTo,
  ]);

  const totalOrders = filtered.length;
  const totalItems = filtered.reduce((sum, o) => sum + o.items.length, 0);
  const activeQty = filtered.reduce((sum, o) => sum + requiredQuantity(o), 0);
  const completedQty = filtered.reduce((sum, o) => sum + o.warehouse, 0);
  const cancelledQty = filtered.reduce((sum, o) => sum + o.cancelled, 0);
  const readyOrders = filtered.filter(
    (o) => o.status === "جاهز للتسليم",
  ).length;
  const deliveredOrders = filtered.filter(
    (o) => o.status === "تم الاستلام",
  ).length;
  const delayedOrders = filtered.filter((o) => isOrderOverdue(o)).length;

  const handlePrint = () => {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (type && type !== "الكل") params.set("type", type);
    if (status && status !== "الكل") params.set("status", status);
    if (department && department !== "الكل")
      params.set("department", department);
    if (salesperson && salesperson !== "الكل")
      params.set("salesperson", salesperson);
    if (effectiveFrom) params.set("from", effectiveFrom);
    if (effectiveTo) params.set("to", effectiveTo);
    window.open(`/reports/print?${params.toString()}`, "_blank");
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
          onChange={(val) => {
            setPeriod(val);
            setDateFrom("");
            setDateTo("");
          }}
          options={["اليوم", "الشهر", "السنة", "كل الفترات"]}
        />
        <FilterSelect
          label="نوع الطلب:"
          value={type}
          onChange={setType}
          options={[
            { label: "كل الأنواع", value: "الكل" },
            { label: "معرض", value: "SHOP" },
            { label: "خارجي", value: "EXTERNAL" },
            { label: "إصلاح", value: "REPAIR" },
          ]}
        />
        <FilterSelect
          label="حالة الطلب:"
          value={status}
          onChange={setStatus}
          options={[
            "الكل",
            "قيد التصنيع",
            "جاهز للتسليم",
            "خرج مع المندوب",
            "تم الاستلام",
            "تعذر التسليم",
            "ملغي",
          ]}
        />
        <FilterSelect
          label="المرحلة / القسم:"
          value={department}
          onChange={setDepartment}
          options={[
            "الكل",
            "القص",
            "الإنتاج والإصلاح",
            "العمليات الخاصة",
            "الجودة والتغليف",
            "المستودع",
          ]}
        />
        <FilterSelect
          label="مسؤول المبيعات:"
          value={salesperson}
          onChange={setSalesperson}
          options={["الكل", "ريم خالد", "ليان سعد"]}
        />
        <div className="mr-auto flex items-center gap-1.5">
          <span className="font-medium text-slate-500">من:</span>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
            }}
            className="oriental-input px-2 py-1 text-xs"
          />
          <span className="font-medium text-slate-500">إلى:</span>
          <input
            type="date"
            value={effectiveTo}
            onChange={(e) => {
              setDateTo(e.target.value);
            }}
            className="oriental-input px-2 py-1 text-xs"
          />
        </div>
      </div>

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
            {totalItems} بند تفصيل
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
            نسبة الإنجاز:{" "}
            {activeQty > 0 ? Math.round((completedQty / activeQty) * 100) : 0}٪
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
        <OrientalTable
          data={filtered}
          keyExtractor={(o) => o.id}
          columns={[
            { header: "رقم الطلب", accessor: "id" },
            { header: "العميل", accessor: "customer" },
            { header: "النوع", render: (o) => typeLabels[o.type] },
            {
              header: "المطلوب",
              render: (o) => `${String(requiredQuantity(o))} قطع`,
            },
            {
              header: "المستلم بالمستودع",
              render: (o) => `${String(o.warehouse)} قطع`,
            },
            { header: "تاريخ التسليم", accessor: "delivery" },
            {
              header: "الحالة",
              render: (o) => (
                <OrientalStatusPill tone={statusTone(o.status)}>
                  {o.status}
                </OrientalStatusPill>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
