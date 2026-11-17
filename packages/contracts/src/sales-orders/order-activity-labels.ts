import { z } from "zod";

import { administrationOperationSchema } from "../administration/administration-command.schema.ts";
import { approvalCommandOperationSchema } from "../approval/approval-command.schema.ts";
import { manufacturingCommandOperationSchema } from "../manufacturing/manufacturing-command.schema.ts";
import { qualityCommandOperationSchema } from "../quality/quality-command.schema.ts";
import { salesCommandOperationSchema } from "../sales-commands/command-receipt.schema.ts";
import { warehouseCommandOperationSchema } from "../warehouse/warehouse-command.schema.ts";

export const orderActivityActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("draft"),
      operation: salesCommandOperationSchema.extract([
        "CREATE_DRAFT",
        "SAVE_DRAFT",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("order"),
      operation: salesCommandOperationSchema.extract([
        "SUBMIT_NEW_ORDER",
        "SUBMIT_DRAFT",
        "RESUBMIT_ORDER",
        "SET_ORDER_PAID",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("approval"),
      operation: approvalCommandOperationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("manufacturing"),
      operation: manufacturingCommandOperationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("quality"),
      operation: qualityCommandOperationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("warehouse"),
      operation: warehouseCommandOperationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("administration"),
      operation: administrationOperationSchema,
    })
    .strict(),
]);
export type OrderActivityAction = z.infer<typeof orderActivityActionSchema>;
type ActionLabels = {
  readonly [Kind in OrderActivityAction["kind"]]: Readonly<
    Record<Extract<OrderActivityAction, { kind: Kind }>["operation"], string>
  >;
};
export const orderActivityActionLabels = {
  draft: { CREATE_DRAFT: "إنشاء مسودة", SAVE_DRAFT: "حفظ تعديل المسودة" },
  order: {
    SUBMIT_NEW_ORDER: "إرسال طلب جديد",
    SUBMIT_DRAFT: "إرسال المسودة للاعتماد",
    RESUBMIT_ORDER: "إعادة الإرسال للاعتماد",
    SET_ORDER_PAID: "تعديل المبلغ المدفوع",
  },
  approval: {
    APPROVE_INITIAL: "اعتماد أولي",
    RETURN_INITIAL: "إعادة للمبيعات",
    REPORT_ISSUE: "إحالة مشكلة تصنيع",
    RESOLVE_ISSUE: "قرار مشكلة تصنيع",
    SUBMIT_CONTACT: "تواصل العميل",
    REVIEW_CONTACT: "مراجعة تواصل العميل",
  },
  manufacturing: {
    RECEIVE_AND_START: "استلام وبدء العمل",
    CONTINUE: "متابعة العمل",
    COMPLETE_TRANSFER: "إتمام وتحويل العمل",
  },
  quality: {
    RECEIVE_AND_START: "استلام وبدء الفحص",
    CONTINUE: "متابعة الفحص",
    INSPECT: "تسجيل نتيجة الفحص والتغليف",
    REPORT_ISSUES: "إبلاغ الاعتماد بمشكلة",
  },
  warehouse: {
    RECEIVE: "تأكيد الاستلام الفعلي",
    DISPATCH: "خروج الطلب الكامل للتوصيل",
    CONFIRM_DELIVERY: "تأكيد تسليم الطلب الكامل",
    FAIL_DELIVERY: "تسجيل فشل التوصيل والعودة الكاملة",
    RETRY_DELIVERY: "إعادة تجهيز الطلب للتوصيل",
  },
  administration: {
    ADMIN_CANCEL: "إلغاء إداري",
    ADMIN_CORRECT: "تصحيح بيانات أمر التفصيل إدارياً",
  },
} as const satisfies ActionLabels;
export const toOrderActivityActionLabel = (
  action: OrderActivityAction,
): string => {
  switch (action.kind) {
    case "draft":
      return orderActivityActionLabels.draft[action.operation];
    case "order":
      return orderActivityActionLabels.order[action.operation];
    case "approval":
      return orderActivityActionLabels.approval[action.operation];
    case "manufacturing":
      return orderActivityActionLabels.manufacturing[action.operation];
    case "quality":
      return orderActivityActionLabels.quality[action.operation];
    case "warehouse":
      return orderActivityActionLabels.warehouse[action.operation];
    case "administration":
      return orderActivityActionLabels.administration[action.operation];
  }
};
const actions: readonly OrderActivityAction[] = Object.entries(
  orderActivityActionLabels,
)
  .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  .flatMap(([kind, labels]) =>
    Object.keys(labels)
      .sort()
      .map((operation) => orderActivityActionSchema.parse({ kind, operation })),
  );
export const findOrderActivityActions = (
  search: string,
): readonly OrderActivityAction[] => {
  const literal = search.trim().toLowerCase();
  return literal === ""
    ? []
    : actions.filter((action) =>
        toOrderActivityActionLabel(action).toLowerCase().includes(literal),
      );
};
