import { expect, it } from "vitest";
import { administrationReportPrintQuerySchema } from "@template/contracts";
import { p08ReportPrintFixture } from "@/test/p08-fixtures";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import {
  toAdministrationReportFilters,
  toAdministrationReportRow,
  toAdministrationDepartmentRows,
} from "./administration-report.model";

const row = () => ({
  kind: "draft" as const,
  orderId: p03Ids.order,
  businessNumber: null,
  displayReference: p03Ids.order,
  type: "SHOP" as const,
  status: "DRAFT" as const,
  createdAt: p03Instant,
  deliveryDate: null,
  customer: { name: null, phone: null, address: null },
  salesperson: { id: p03Ids.actor, fullName: "Actual owner" },
  counts: {
    original: 0,
    cancelled: 0,
    active: 0,
    received: 0,
    completionPercent: 0,
  },
  currentDepartments: [],
  isOverdue: false,
  hasQualityCorrectionHistory: false,
  isCurrentlyReturned: false,
});
it("preserves a draft reference and missing contact without factory, receipt or completion claims", () => {
  expect(toAdministrationReportRow(row())).toMatchObject({
    reference: `مسودة — ${p03Ids.order}`,
    locationLabel: "لم تدخل التشغيل",
    completionLabel: "الإنجاز والاستلام غير متاحين لمسودة",
  });
});
it("formats actual capped completion and warehouse location without declaring readiness", () => {
  const presented = toAdministrationReportRow({
    ...row(),
    kind: "submitted",
    status: "APPROVED",
    businessNumber: "SHOP-2026-0001",
    displayReference: "SHOP-2026-0001",
    currentDepartments: ["WAREHOUSE"],
    counts: {
      original: 200,
      cancelled: 0,
      active: 200,
      received: 199,
      completionPercent: 99,
    },
  });
  expect(presented.completionLabel).toContain("199 من 200");
  expect(presented.completionLabel).toContain("99٪");
  expect(presented.locationLabel).toBe("المستودع");
  const zero = toAdministrationReportRow({
    ...presented.row,
    status: "CANCELLED",
    counts: {
      original: 200,
      cancelled: 200,
      active: 0,
      received: 0,
      completionPercent: 0,
    },
    currentDepartments: [],
  });
  expect(zero.completionLabel).toContain("غير قابل للتسليم");
  expect(zero.completionLabel).not.toContain("100");
});
it("retains actual calendar/cohort and independent directory labels while rejecting mismatched filter scope", () => {
  const report = p08ReportPrintFixture(),
    query = administrationReportPrintQuerySchema.parse({});
  expect(toAdministrationReportFilters(query, report.meta)).toMatchObject({
    periodLabel: "كافة الفترات",
    businessTimeZone: "Asia/Riyadh",
    effectiveFrom: null,
    cohortLabel: "مسودات وطلبات مقدمة",
  });
  expect(
    toAdministrationReportFilters(query, report.meta).workforceScopeLabel,
  ).toContain("مستقل عن فلاتر الطلبات");
  expect(() =>
    toAdministrationReportFilters(
      administrationReportPrintQuerySchema.parse({ type: "SHOP" }),
      report.meta,
    ),
  ).toThrow();
});
it("keeps four department rows and shipping context with blank responsibility and honest incoming warehouse copy", () => {
  const rows = toAdministrationDepartmentRows([
    { department: "WAREHOUSE", pieces: 2 },
    { department: "WITH_COURIER", pieces: 3 },
  ]);
  expect(rows).toHaveLength(5);
  expect(rows.every((entry) => entry.responsibilityLabel === null)).toBe(true);
  expect(rows.find((entry) => entry.key === "WAREHOUSE")).toMatchObject({
    pieces: 2,
    statusLabel:
      "موقع حالي يشمل الوارد غير المستلم؛ الاستلام والجاهزية منفصلان",
  });
  expect(
    rows.find((entry) => entry.key === "WITH_COURIER")?.statusLabel,
  ).toContain("ليس قسماً إنتاجياً");
  expect(() =>
    toAdministrationDepartmentRows([
      { department: "WAREHOUSE", pieces: 2 },
      { department: "WAREHOUSE", pieces: 2 },
    ]),
  ).toThrow();
});
