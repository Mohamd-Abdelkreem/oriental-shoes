import {
  requiredQuantity,
  type MvpOrder,
  type QuantitySegment,
  type Role,
  type Stage,
  type Store,
} from "@/features/prototype/state/mvp-store";

export const DEMO_DATE_ISO = "2026-09-12";

export function activeStageSummary(order: MvpOrder): string {
  if (order.status === "مسودة") return "مسودة بالمبيعات";
  if (order.status === "معاد للتعديل") return "معاد للمبيعات للتعديل";
  if (order.status === "بانتظار الاعتماد") return "بانتظار مراجعة الاعتماد";
  if (order.status === "ملغي بالكامل") return "ملغي بالكامل";
  if (order.status === "تم الاستلام") return "تم التسليم للعميل";
  if (order.status === "خرج مع المندوب" || order.status === "مع المندوب")
    return "مع مندوب التوصيل";

  const activeSegments = order.segments.filter(
    (s) => s.stage !== "ملغاة" && s.stage !== "تم الاستلام" && s.quantity > 0,
  );

  if (activeSegments.length === 0) {
    if (order.warehouse > 0) return `المستودع: ${String(order.warehouse)} قطعة`;
    return order.status;
  }

  const stageMap = new Map<string, number>();
  for (const seg of activeSegments) {
    stageMap.set(seg.stage, (stageMap.get(seg.stage) || 0) + seg.quantity);
  }

  const parts: string[] = [];
  stageMap.forEach((qty, stg) => {
    parts.push(`${stg}: ${String(qty)}`);
  });

  return parts.join(" — ");
}

const nonOverdueStatuses = new Set([
  "جاهز للتسليم",
  "مع المندوب",
  "خرج مع المندوب",
  "تعذر التسليم",
  "إعادة محاولة التسليم",
  "تم الاستلام",
  "ملغي بالكامل",
]);

export function isOrderOverdue(order: MvpOrder, currentDate = DEMO_DATE_ISO) {
  return Boolean(
    order.deliveryIso &&
    order.deliveryIso < currentDate &&
    !nonOverdueStatuses.has(order.status),
  );
}

export function taskStage(role: Role): Stage | undefined {
  const stages: Partial<Record<Role, Stage>> = {
    cutting: "القص",
    production: "الإنتاج والإصلاح",
    special: "العمليات الخاصة",
    quality: "الجودة والتغليف",
    warehouse: "المستودع",
  };
  return stages[role];
}

export function departmentSegment(
  order: MvpOrder,
  role: Role,
  segmentId?: string | null,
  itemId?: string | null,
) {
  const stage = taskStage(role);
  if (!stage) return undefined;
  const candidates = order.segments.filter(
    (segment) =>
      (segment.stage === stage ||
        (role === "warehouse" &&
          ["مع المندوب", "تم الاستلام"].includes(segment.stage))) &&
      (!segmentId || segment.id === segmentId) &&
      (!itemId || segment.itemId === itemId),
  );
  return candidates.length === 1 ? candidates[0] : candidates[0];
}

export function taskHref(
  base: string,
  orderId: string,
  segment: QuantitySegment,
  action?: string,
) {
  const query = new URLSearchParams({
    itemId: segment.itemId,
    segmentId: segment.id,
  });
  if (action) query.set("action", action);
  return `/${base}/tasks/${segment.id}?orderId=${orderId}&${query.toString()}`;
}

export function computeNavBadges(store: Store): Record<string, number> {
  const activeOrders = store.orders.filter(
    (o) => !["تم الاستلام", "ملغي بالكامل"].includes(o.status),
  ).length;

  const pendingApproval = store.orders.filter(
    (o) => o.status === "بانتظار الاعتماد",
  ).length;

  const activeCorrections = store.orders.reduce(
    (sum, o) =>
      sum +
      (o.corrections ? o.corrections.filter((c) => !c.resolved).length : 0),
    0,
  );

  const deliveryExceptions = store.orders.filter(
    (o) => o.status === "تعذر التسليم",
  ).length;

  const pendingUsers = store.employees.filter(
    (e) => e.status === "بانتظار الموافقة",
  ).length;

  const salesDrafts = store.orders.filter((o) => o.status === "مسودة").length;
  const salesReturned = store.orders.filter(
    (o) => o.status === "معاد للتعديل",
  ).length;

  const segmentsIn = (stage: Stage, state?: string) =>
    store.orders.reduce(
      (sum, o) =>
        sum +
        o.segments.filter(
          (s) => s.stage === stage && (!state || s.state === state),
        ).length,
      0,
    );

  const cuttingIncoming = segmentsIn("القص", "بانتظار الاستلام");
  const cuttingWip = segmentsIn("القص", "قيد التنفيذ");
  const cuttingReturned = segmentsIn("القص", "معادة من الجودة");

  const productionIncoming = segmentsIn("الإنتاج والإصلاح", "بانتظار الاستلام");
  const productionWip = segmentsIn("الإنتاج والإصلاح", "قيد التنفيذ");
  const productionRepairs = store.orders.filter(
    (o) =>
      o.type === "REPAIR" &&
      !["تم الاستلام", "ملغي بالكامل"].includes(o.status),
  ).length;
  const productionReturned = segmentsIn("الإنتاج والإصلاح", "معادة من الجودة");

  const specialIncoming = segmentsIn("العمليات الخاصة", "بانتظار الاستلام");
  const specialWip = segmentsIn("العمليات الخاصة", "قيد التنفيذ");
  const specialReturned = segmentsIn("العمليات الخاصة", "معادة من الجودة");

  const qualityIncoming =
    segmentsIn("الجودة والتغليف", "بانتظار الاستلام") +
    segmentsIn("الجودة والتغليف", "بانتظار الفحص");
  const qualityReinspect = segmentsIn("الجودة والتغليف", "إعادة فحص");

  const warehouseIncoming = segmentsIn("المستودع", "بانتظار الاستلام");
  const warehouseIncomplete = store.orders.filter(
    (o) => o.warehouse > 0 && o.warehouse < requiredQuantity(o),
  ).length;
  const warehouseReady = store.orders.filter(
    (o) => o.status === "جاهز للتسليم",
  ).length;
  const warehouseDispatched = store.orders.filter(
    (o) => o.status === "خرج مع المندوب" || o.status === "مع المندوب",
  ).length;
  const warehouseFailed = store.orders.filter(
    (o) => o.status === "تعذر التسليم",
  ).length;

  return {
    activeOrders,
    pendingApproval,
    activeCorrections,
    deliveryExceptions,
    pendingUsers,
    salesDrafts,
    salesReturned,
    cuttingIncoming,
    cuttingWip,
    cuttingReturned,
    productionIncoming,
    productionWip,
    productionRepairs,
    productionReturned,
    specialIncoming,
    specialWip,
    specialReturned,
    qualityIncoming,
    qualityReinspect,
    warehouseIncoming,
    warehouseIncomplete,
    warehouseReady,
    warehouseDispatched,
    warehouseFailed,
  };
}

export type ReportFilters = {
  period: string;
  type: string;
  status: string;
  department: string;
  salesperson: string;
  from: string;
  to: string;
};

export const defaultReportFilters: ReportFilters = {
  period: "الشهر",
  type: "الكل",
  status: "الكل",
  department: "الكل",
  salesperson: "الكل",
  from: "",
  to: "",
};

export function filteredOrders(orders: MvpOrder[], filters: ReportFilters) {
  const periodRange = reportPeriodRange(filters.period);
  const from = filters.from || periodRange.from;
  const to = filters.to || periodRange.to;
  return orders.filter(
    (order) =>
      (filters.type === "الكل" || order.type === filters.type) &&
      (filters.status === "الكل" || order.status.includes(filters.status)) &&
      (filters.department === "الكل" ||
        order.segments.some(
          (segment) => segment.stage === filters.department,
        )) &&
      (filters.salesperson === "الكل" ||
        order.salesperson === filters.salesperson) &&
      (!from || Boolean(order.createdIso && order.createdIso >= from)) &&
      (!to || Boolean(order.createdIso && order.createdIso <= to)),
  );
}

export function reportPeriodRange(period: string, currentDate = DEMO_DATE_ISO) {
  if (period === "اليوم") return { from: currentDate, to: currentDate };
  if (period === "الشهر")
    return { from: `${currentDate.slice(0, 7)}-01`, to: currentDate };
  if (period === "السنة")
    return { from: `${currentDate.slice(0, 4)}-01-01`, to: currentDate };
  return { from: "", to: "" };
}

export function reportSearch(filters: ReportFilters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, filter]) => {
    if (filter && filter !== "الكل") query.set(key, filter);
  });
  return query.toString();
}
