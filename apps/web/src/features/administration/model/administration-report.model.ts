import { z } from "zod";
import {
  administrationOrderFiltersSchema,
  administrationReportDataSchema,
  administrationReportPrintDataSchema,
  type AdministrationReportQuery,
  type AdministrationReportPrintQuery,
  type AdministrationReportData,
  type AdministrationReportPrintData,
} from "@template/contracts";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";

export type ReportFilterPresentation = Readonly<{
  periodLabel: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  businessTimeZone: string;
  generatedAt: string;
  cohortLabel: string;
  workforceScopeLabel: string;
}>;
export type ReportOrderPresentation = Readonly<{
  row: AdministrationReportPrintData["orders"]["items"][number];
  reference: string;
  statusLabel: string;
  locationLabel: string;
  completionLabel: string;
}>;
export type ReportDepartmentPresentation = Readonly<{
  key: "CUTTING" | "PRODUCTION" | "QUALITY" | "WAREHOUSE" | "WITH_COURIER";
  label: string;
  pieces: number;
  responsibilityLabel: string | null;
  statusLabel: string;
}>;
const departmentLabels = {
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  WAREHOUSE: "المستودع",
  WITH_COURIER: "الشحن والتوزيع الميداني",
} as const;
export const toAdministrationReportFilters = (
  query: AdministrationReportQuery | AdministrationReportPrintQuery,
  input:
    AdministrationReportData["meta"] | AdministrationReportPrintData["meta"],
): ReportFilterPresentation => {
  const meta = administrationReportDataSchema.shape.meta.parse(input);
  const {
    page: _page,
    limit: _limit,
    ...filters
  } = "page" in query ? query : { ...query, page: undefined, limit: undefined };
  const normalized = administrationOrderFiltersSchema.parse(filters);
  if (JSON.stringify(normalized) !== JSON.stringify(meta.filters))
    throw new z.ZodError([
      {
        code: "custom",
        path: ["filters"],
        message: "Report scope does not match its query",
      },
    ]);
  return {
    periodLabel: {
      TODAY: "اليوم",
      MONTH: "الشهر",
      YEAR: "السنة",
      ALL: "كافة الفترات",
    }[normalized.period],
    effectiveFrom: meta.effectiveFrom,
    effectiveTo: meta.effectiveTo,
    businessTimeZone: meta.businessTimeZone,
    generatedAt: meta.generatedAt,
    cohortLabel: {
      MIXED: "مسودات وطلبات مقدمة",
      SUBMITTED: "طلبات مقدمة",
      DRAFT: "مسودات فقط",
    }[meta.cohort.kind],
    workforceScopeLabel:
      normalized.department === undefined
        ? "دليل الموظفين الحالي — جميع الأقسام، مستقل عن فلاتر الطلبات"
        : `دليل الموظفين الحالي — ${departmentLabels[normalized.department]}، مستقل عن فلاتر الطلبات الأخرى`,
  };
};
export const toAdministrationReportRow = (
  input: AdministrationReportPrintData["orders"]["items"][number],
): ReportOrderPresentation => {
  const row =
    administrationReportPrintDataSchema.shape.orders.shape.items.element.parse(
      input,
    );
  const locationLabel =
    row.kind === "draft"
      ? "لم تدخل التشغيل"
      : row.status === "OUT_FOR_DELIVERY"
        ? "مع المندوب"
        : row.status === "DELIVERED"
          ? "تم التسليم"
          : row.counts.active === 0
            ? "لا توجد قطع نشطة"
            : row.status === "AWAITING_APPROVAL" || row.status === "RETURNED"
              ? "بانتظار الاعتماد أو تصحيح المبيعات"
              : row.currentDepartments
                  .map((department) => departmentLabels[department])
                  .join("، ") || "لا يوجد موقع قسم حالي";
  return {
    row,
    reference:
      row.kind === "draft"
        ? `مسودة — ${row.displayReference}`
        : row.displayReference,
    statusLabel: toSalesOrderStatusLabel(row.status),
    locationLabel,
    completionLabel:
      row.kind === "draft"
        ? "الإنجاز والاستلام غير متاحين لمسودة"
        : row.counts.active === 0
          ? "لا توجد قطع نشطة — غير قابل للتسليم"
          : `${String(row.counts.received)} من ${String(row.counts.active)} استلاماً — ${String(row.counts.completionPercent)}٪`,
  };
};
export const toAdministrationDepartmentRows = (
  input: AdministrationReportPrintData["departments"],
): readonly ReportDepartmentPresentation[] => {
  const departments =
    administrationReportPrintDataSchema.shape.departments.parse(input);
  if (
    new Set(departments.map((entry) => entry.department)).size !==
    departments.length
  )
    throw new z.ZodError([
      {
        code: "custom",
        path: ["departments"],
        message: "Department buckets must be distinct",
      },
    ]);
  return (
    ["CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE", "WITH_COURIER"] as const
  ).map((key) => ({
    key,
    label: departmentLabels[key],
    pieces: departments.find((entry) => entry.department === key)?.pieces ?? 0,
    responsibilityLabel: null,
    statusLabel:
      key === "WAREHOUSE"
        ? "موقع حالي يشمل الوارد غير المستلم؛ الاستلام والجاهزية منفصلان"
        : key === "WITH_COURIER"
          ? "سياق شحن، وليس قسماً إنتاجياً أو تأكيد تسليم"
          : "القطع النشطة الموجودة حالياً في القسم، وليست إنتاجية فردية",
  }));
};
