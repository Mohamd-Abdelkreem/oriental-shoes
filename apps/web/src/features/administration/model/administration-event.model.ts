import {
  toOrderActivityActionLabel,
  type AdministrationActivityData,
  type AdministrationCommandBody,
  type Department,
} from "@template/contracts";
import {
  toSalesActivityRow,
  toSalesOrderStatusLabel,
} from "@/features/sales/model/order-view.model";

export type AdministrationActivityRow = Readonly<{
  id: string;
  orderId: string;
  reference: string;
  actionLabel: string;
  actorName: string;
  actorDepartmentLabel: string;
  occurredAt: string;
  quantity: number | null;
  sourceLabel: string | null;
  destinationLabel: string | null;
  note: string | null;
  correctionFields: readonly Readonly<{
    label: string;
    before: string | null;
    after: string | null;
  }>[];
}>;
const departmentLabels: Record<Department, string> = {
  SALES: "المبيعات والمعارض",
  APPROVAL: "الاعتماد",
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  WAREHOUSE: "المستودع",
};
const fieldLabels = {
  customerAddress: "عنوان التسليم",
  customerEmail: "البريد الإلكتروني",
  customerName: "اسم العميل",
  customerPhone: "رقم الجوال",
  generalNotes: "الملاحظات العامة",
  cancellation: "الكمية الملغاة",
  total: "الإجمالي",
  status: "حالة الطلب",
} as const;
export const toAdministrationOperationLabel = (
  operation: AdministrationCommandBody["operation"],
): string => toOrderActivityActionLabel({ kind: "administration", operation });
export const toAdministrationActivityRow = (
  item: AdministrationActivityData["events"][number],
): AdministrationActivityRow => {
  if (item.kind === "administration") {
    const event = item.event;
    return {
      id: `administration:${event.id}`,
      orderId: event.orderId,
      reference: event.businessNumber,
      actionLabel: toAdministrationOperationLabel(event.operation),
      actorName: event.actor.fullName,
      actorDepartmentLabel:
        event.actor.department === null
          ? "الإدارة العامة"
          : departmentLabels[event.actor.department],
      occurredAt: event.occurredAt,
      quantity:
        event.operation === "ADMIN_CANCEL" ? event.pieceIds.length : null,
      sourceLabel: null,
      destinationLabel: null,
      note: event.reason,
      correctionFields: event.changedFields.map((field) => {
        switch (field) {
          case "cancellation":
            return {
              label: fieldLabels[field],
              before: String(event.before.counts.cancelled),
              after: String(event.after.counts.cancelled),
            };
          case "total":
            return {
              label: fieldLabels[field],
              before: event.before.money.total,
              after: event.after.money.total,
            };
          case "status":
            return {
              label: fieldLabels[field],
              before: toSalesOrderStatusLabel(event.before.status),
              after: toSalesOrderStatusLabel(event.after.status),
            };
          default:
            return {
              label: fieldLabels[field],
              before: event.before.correction[field],
              after: event.after.correction[field],
            };
        }
      }),
    };
  }
  const summary = toSalesActivityRow(item);
  return {
    id: summary.id,
    orderId: summary.resourceId,
    reference: summary.reference,
    actionLabel: summary.label,
    actorName: summary.actor.fullName,
    actorDepartmentLabel:
      summary.actor.department === null
        ? summary.actor.role === "ADMIN"
          ? "الإدارة العامة"
          : "غير محدد"
        : departmentLabels[summary.actor.department],
    occurredAt: summary.occurredAt,
    quantity:
      item.kind === "draft"
        ? null
        : item.kind === "approval"
          ? item.event.pieceId === null
            ? null
            : 1
          : item.kind === "order" || item.kind === "warehouse"
            ? item.event.pieceIds.length
            : item.event.pieces.length,
    sourceLabel:
      item.kind === "manufacturing"
        ? departmentLabels[item.event.department]
        : null,
    destinationLabel:
      item.kind === "manufacturing" && item.event.destination !== null
        ? departmentLabels[item.event.destination]
        : null,
    note: summary.fields === "" ? null : summary.fields,
    correctionFields: [],
  };
};
