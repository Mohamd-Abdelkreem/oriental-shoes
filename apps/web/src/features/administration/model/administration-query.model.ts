import type { Route } from "next";
import type { z } from "zod";
import {
  salesUuidSchema,
  salesOrderStatusSchema,
  administrationOrdersQuerySchema,
  administrationApprovalsQuerySchema,
  administrationCorrectionsQuerySchema,
  administrationDeliveryExceptionsQuerySchema,
  administrationActivityQuerySchema,
  administrationReportQuerySchema,
  administrationReportPrintQuerySchema,
  administrationFilterOptionsQuerySchema,
  administrationFilterOptionsDataSchema,
  type AdministrationOrdersQuery,
  type AdministrationApprovalsQuery,
  type AdministrationCorrectionsQuery,
  type AdministrationDeliveryExceptionsQuery,
  type AdministrationActivityQuery,
  type AdministrationReportQuery,
  type AdministrationReportPrintQuery,
  type AdministrationFilterOptionsData,
} from "@template/contracts";
import { toSalesOrderStatusLabel } from "@/features/sales/model/order-view.model";

export type AdministrationRouteQueryMap = {
  orders: AdministrationOrdersQuery;
  approvals: AdministrationApprovalsQuery;
  corrections: AdministrationCorrectionsQuery;
  "delivery-exceptions": AdministrationDeliveryExceptionsQuery;
  activity: AdministrationActivityQuery;
  reports: AdministrationReportQuery;
  "report-print": AdministrationReportPrintQuery;
};
export type AdministrationRoute = keyof AdministrationRouteQueryMap;
type FilteredRoute = "orders" | "reports" | "report-print";
type Invalid<R extends AdministrationRoute = AdministrationRoute> = {
  kind: "invalid";
  route: R;
  fieldErrors: Readonly<Record<string, readonly string[]>>;
};
type Valid<R extends AdministrationRoute, Q> = {
  kind: "valid";
  route: R;
  query: Q;
  canonicalSearch: string;
};
type Lookup<R extends FilteredRoute, Q> = {
  kind: "resolve-salesperson";
  route: R;
  legacyName: string;
  queryWithoutOwner: Q;
};
export type AdministrationRouteState = {
  [R in AdministrationRoute]:
    | Valid<R, AdministrationRouteQueryMap[R]>
    | Invalid<R>
    | (R extends FilteredRoute
        ? Lookup<R, AdministrationRouteQueryMap[R]>
        : never);
}[AdministrationRoute];
const paths = {
  orders: "/admin/orders",
  approvals: "/admin/approvals",
  corrections: "/admin/corrections",
  "delivery-exceptions": "/admin/delivery-exceptions",
  activity: "/admin/activity",
  reports: "/admin/reports",
  "report-print": "/reports/print",
} as const;
const filterKeys = [
  "search",
  "status",
  "type",
  "department",
  "exception",
  "salespersonId",
  "period",
  "from",
  "to",
];
const aliases = {
  flag: "exception",
  dateFrom: "from",
  dateTo: "to",
  salesperson: "salespersonId",
} as const;
const statuses = new Map<string, string>(
  salesOrderStatusSchema.options.map((status) => [
    toSalesOrderStatusLabel(status),
    status,
  ]),
);
statuses.set("مسودة", "DRAFT");
statuses.set("معتمد", "APPROVED");
statuses.set("تم الاستلام", "DELIVERED");
statuses.set("ملغي بالكامل", "CANCELLED");
const periods: Readonly<Record<string, string>> = {
  اليوم: "TODAY",
  الشهر: "MONTH",
  السنة: "YEAR",
  "كل الفترات": "ALL",
  الكل: "ALL",
  "كافة الفترات": "ALL",
};
const departments: Readonly<Record<string, string>> = {
  القص: "CUTTING",
  "الإنتاج والإصلاح": "PRODUCTION",
  "الجودة والتغليف": "QUALITY",
  المستودع: "WAREHOUSE",
};
const flags: Readonly<Record<string, string>> = {
  متأخرة: "OVERDUE",
  "ملغاة جزئياً": "PARTIALLY_CANCELLED",
  "جاهزة للتسليم": "READY",
  مستلمة: "DELIVERED",
};
const tabs: Readonly<Record<string, string>> = {
  pending: "PENDING",
  returned: "RETURNED",
  approved: "APPROVED",
  all: "ALL",
  active: "ACTIVE",
  resolved: "RESOLVED",
  failed: "FAILED",
  overdue: "OVERDUE",
  dispatched: "DISPATCHED",
};
const fieldLabels: Readonly<Record<string, string>> = {
  search: "البحث",
  status: "حالة الطلب",
  type: "نوع الطلب",
  department: "القسم",
  exception: "الحالة الخاصة",
  salespersonId: "مسؤول المبيعات",
  period: "الفترة",
  from: "تاريخ البداية",
  to: "تاريخ النهاية",
  page: "رقم الصفحة",
  limit: "عدد الصفوف",
  tab: "التبويب",
  orderId: "رقم الطلب",
};
const invalid = <R extends AdministrationRoute>(
  route: R,
  key: string,
  message: string,
): Invalid<R> => ({
  kind: "invalid",
  route,
  fieldErrors: { [key]: [message] },
});
const serialize = (query: object): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (typeof value === "string" || typeof value === "number")
      params.set(key, String(value));
  return params.toString();
};
const normalizeValue = (key: string, value: string): string | undefined => {
  if (
    value === "الكل" &&
    ["type", "status", "department", "exception", "salespersonId"].includes(key)
  )
    return undefined;
  switch (key) {
    case "status":
      return statuses.get(value) ?? value;
    case "period":
      return periods[value] ?? value;
    case "department":
      return departments[value] ?? value;
    case "exception":
      return flags[value] ?? value;
    case "tab":
      return tabs[value] ?? value;
    case "salespersonId":
    case "orderId": {
      const id = salesUuidSchema.safeParse(value);
      return id.success ? id.data : value;
    }
    default:
      return value;
  }
};
type Normalized = {
  kind: "normalized";
  values: Record<string, unknown>;
  legacyName: string | null;
};
const normalize = (
  route: AdministrationRoute,
  params: Pick<URLSearchParams, "getAll" | "has" | "entries">,
): Normalized | Invalid => {
  const filtered =
    route === "orders" || route === "reports" || route === "report-print";
  const keys = new Set(
    filtered
      ? [
          ...filterKeys,
          ...(route === "report-print" ? [] : ["page", "limit"]),
          ...Object.keys(aliases),
        ]
      : route === "activity"
        ? ["search", "orderId", "page", "limit"]
        : ["search", "tab", "page", "limit"],
  );
  const merged = new Map<string, string | undefined>();
  let legacyName: string | null = null;
  const merge = (key: string, value: string | undefined): boolean => {
    if (merged.has(key) && merged.get(key) !== value) return false;
    merged.set(key, value);
    return true;
  };
  for (const [key] of params.entries()) {
    if (!keys.has(key))
      return invalid(
        route,
        key,
        `معامل التصفية ${key.slice(0, 80)} غير مدعوم. احذفه أو أعد ضبط عوامل التصفية.`,
      );
    const entries = params.getAll(key);
    if (entries.length !== 1)
      return invalid(
        route,
        key,
        `تكررت قيمة ${fieldLabels[key] ?? key}. اختر قيمة واحدة ثم أعد المحاولة.`,
      );
    const raw = entries[0];
    if (raw === undefined)
      return invalid(
        route,
        key,
        "قيمة التصفية مطلوبة. اختر قيمة ثم أعد المحاولة.",
      );
    if (key === "salesperson" && raw !== "الكل") {
      const id = salesUuidSchema.safeParse(raw);
      if (!id.success) {
        const name = administrationFilterOptionsQuerySchema.safeParse({
          salespersonName: raw,
        });
        if (!name.success)
          return invalid(
            route,
            "salespersonId",
            "اسم مسؤول المبيعات غير صالح. اختر حساباً من القائمة.",
          );
        legacyName = name.data.salespersonName ?? null;
        continue;
      }
    }
    const target =
      key === "flag"
        ? "exception"
        : key === "dateFrom"
          ? "from"
          : key === "dateTo"
            ? "to"
            : key === "salesperson"
              ? "salespersonId"
              : key;
    if (target === "status" && raw === "ملغي جزئياً") {
      if (
        !merge("exception", "PARTIALLY_CANCELLED") ||
        !merge("status", undefined)
      )
        return invalid(
          route,
          "exception",
          "قيم الحالة الخاصة متعارضة. اختر حالة واحدة ثم أعد المحاولة.",
        );
      continue;
    }
    if (!merge(target, normalizeValue(target, raw)))
      return invalid(
        route,
        target,
        "قيم التصفية متعارضة. اختر قيمة واحدة متطابقة.",
      );
  }
  return {
    kind: "normalized",
    values: Object.fromEntries(
      [...merged].filter((entry) => entry[1] !== undefined),
    ),
    legacyName,
  };
};
const validate = <R extends AdministrationRoute, Q extends object>(
  route: R,
  schema: z.ZodType<Q>,
  values: unknown,
): Valid<R, Q> | Invalid<R> => {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "filters"),
        label = fieldLabels[field] ?? "عوامل التصفية";
      fieldErrors[field] = [
        `${label} غير صالح. صحح القيمة أو أعد ضبط عوامل التصفية ثم أعد المحاولة.`,
      ];
    }
    return { kind: "invalid", route, fieldErrors };
  }
  return {
    kind: "valid",
    route,
    query: parsed.data,
    canonicalSearch: serialize(parsed.data),
  };
};
const filteredState = <R extends FilteredRoute, Q extends object>(
  route: R,
  schema: z.ZodType<Q>,
  normalized: Normalized,
): Valid<R, Q> | Invalid<R> | Lookup<R, Q> => {
  const state = validate(route, schema, normalized.values);
  return state.kind === "valid" && normalized.legacyName !== null
    ? {
        kind: "resolve-salesperson",
        route,
        legacyName: normalized.legacyName,
        queryWithoutOwner: state.query,
      }
    : state;
};
export const parseAdministrationRoute = (
  route: AdministrationRoute,
  params: Pick<URLSearchParams, "getAll" | "has" | "entries">,
): AdministrationRouteState => {
  const normalized = normalize(route, params);
  if (normalized.kind === "invalid") return normalized;
  switch (route) {
    case "orders":
      return filteredState(route, administrationOrdersQuerySchema, normalized);
    case "reports":
      return filteredState(route, administrationReportQuerySchema, normalized);
    case "report-print":
      return filteredState(
        route,
        administrationReportPrintQuerySchema,
        normalized,
      );
    case "approvals":
      return validate(
        route,
        administrationApprovalsQuerySchema,
        normalized.values,
      );
    case "corrections":
      return validate(
        route,
        administrationCorrectionsQuerySchema,
        normalized.values,
      );
    case "delivery-exceptions":
      return validate(
        route,
        administrationDeliveryExceptionsQuerySchema,
        normalized.values,
      );
    case "activity":
      return validate(
        route,
        administrationActivityQuerySchema,
        normalized.values,
      );
  }
};
export const administrationRouteSearch = (
  state: Extract<AdministrationRouteState, { kind: "valid" }>,
): string => state.canonicalSearch;
type RouteInputMap = {
  orders: z.input<typeof administrationOrdersQuerySchema>;
  approvals: z.input<typeof administrationApprovalsQuerySchema>;
  corrections: z.input<typeof administrationCorrectionsQuerySchema>;
  "delivery-exceptions": z.input<
    typeof administrationDeliveryExceptionsQuerySchema
  >;
  activity: z.input<typeof administrationActivityQuerySchema>;
  reports: z.input<typeof administrationReportQuerySchema>;
  "report-print": z.input<typeof administrationReportPrintQuerySchema>;
};
type HrefArguments = {
  [R in AdministrationRoute]: [route: R, query: RouteInputMap[R]];
}[AdministrationRoute];
export const administrationRouteHref = (...args: HrefArguments): Route => {
  const [route, query] = args;
  const schemas = {
    orders: administrationOrdersQuerySchema,
    approvals: administrationApprovalsQuerySchema,
    corrections: administrationCorrectionsQuerySchema,
    "delivery-exceptions": administrationDeliveryExceptionsQuerySchema,
    activity: administrationActivityQuerySchema,
    reports: administrationReportQuerySchema,
    "report-print": administrationReportPrintQuerySchema,
  };
  const parsed = schemas[route].parse(query);
  // Next's Route type cannot infer this validated, fixed-path plus encoded-query map.
  return `${paths[route]}?${serialize(parsed)}` as Route;
};
export const administrationOrderHref = (orderId: string): Route =>
  // The fixed path and shared UUID parser admit only this detail route.
  `/admin/orders/${salesUuidSchema.parse(orderId)}` as Route;
export const administrationReportPrintHref = (
  query: AdministrationReportPrintQuery,
): Route => administrationRouteHref("report-print", query);
export const resolveAdministrationSalespersonRoute = (
  state: Extract<AdministrationRouteState, { kind: "resolve-salesperson" }>,
  options: AdministrationFilterOptionsData,
): Exclude<AdministrationRouteState, { kind: "resolve-salesperson" }> => {
  const parsed = administrationFilterOptionsDataSchema.safeParse(options),
    resolution = parsed.success ? parsed.data.legacySalesperson : null;
  if (
    !parsed.success ||
    parsed.data.context.query.salespersonName !== state.legacyName ||
    resolution?.input !== state.legacyName
  )
    return invalid(
      state.route,
      "salespersonId",
      "تعذر مطابقة مسؤول المبيعات. أعد تحميل القائمة واختر حساباً محدداً.",
    );
  if (resolution.match !== "UNIQUE" || resolution.salespersonId === null)
    return invalid(
      state.route,
      "salespersonId",
      resolution.match === "AMBIGUOUS"
        ? "اسم مسؤول المبيعات غير محدد بشكل فريد. اختر حساباً من القائمة."
        : "لم يُعثر على مسؤول المبيعات. اختر حساباً من القائمة.",
    );
  const expected = state.queryWithoutOwner.salespersonId;
  if (expected !== undefined && expected !== resolution.salespersonId)
    return invalid(
      state.route,
      "salespersonId",
      "اسم مسؤول المبيعات ورقم حسابه متعارضان. اختر حساباً واحداً من القائمة.",
    );
  const query = {
    ...state.queryWithoutOwner,
    salespersonId: resolution.salespersonId,
  };
  switch (state.route) {
    case "orders":
      return validate(state.route, administrationOrdersQuerySchema, query);
    case "reports":
      return validate(state.route, administrationReportQuerySchema, query);
    case "report-print":
      return validate(state.route, administrationReportPrintQuerySchema, query);
  }
};
