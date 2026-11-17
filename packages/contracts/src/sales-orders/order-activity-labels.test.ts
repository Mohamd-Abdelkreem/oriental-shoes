import { describe, expect, it } from "vitest";
import {
  findOrderActivityActions,
  orderActivityActionLabels,
  orderActivityActionSchema,
  toOrderActivityActionLabel,
} from "../index.ts";

it("keeps the finite kind-qualified operation population exhaustive and searchable", () => {
  const pairs = Object.entries(orderActivityActionLabels).flatMap(
    ([kind, labels]) =>
      Object.entries(labels).map(([operation, label]) => ({
        action: orderActivityActionSchema.parse({ kind, operation }),
        label,
      })),
  );
  expect(pairs).toHaveLength(26);
  for (const { action, label } of pairs) {
    expect(toOrderActivityActionLabel(action)).toBe(label);
    expect(
      findOrderActivityActions(`  ${label.toUpperCase()}  `),
    ).toContainEqual(action);
  }
  const startPairs = findOrderActivityActions("استلام وبدء");
  expect(startPairs).toEqual([
    { kind: "manufacturing", operation: "RECEIVE_AND_START" },
    { kind: "quality", operation: "RECEIVE_AND_START" },
  ]);
});
it.each(["", " ", "%", "_", "NO_MATCH", "ADMIN_CANCEL"])(
  "does not invent action matches for literal %j",
  (search) => {
    expect(findOrderActivityActions(search)).toEqual([]);
  },
);
it("binds operations to their own kind and preserves information-correction meaning", () => {
  expect(
    toOrderActivityActionLabel({
      kind: "administration",
      operation: "ADMIN_CORRECT",
    }),
  ).toBe("تصحيح بيانات أمر التفصيل إدارياً");
  expect(
    toOrderActivityActionLabel({
      kind: "administration",
      operation: "ADMIN_CANCEL",
    }),
  ).toBe("إلغاء إداري");
  for (const invalid of [
    { kind: "quality", operation: "COMPLETE_TRANSFER" },
    { kind: "warehouse", operation: "ADMIN_CANCEL" },
    { kind: "order", operation: "SAVE_DRAFT" },
    { kind: "draft", operation: "CREATE_DRAFT", actor: "admin" },
  ])
    expect(orderActivityActionSchema.safeParse(invalid).success).toBe(false);
});
describe("retained nonadministration product labels", () => {
  it.each([
    [{ kind: "draft", operation: "CREATE_DRAFT" }, "إنشاء مسودة"],
    [{ kind: "draft", operation: "SAVE_DRAFT" }, "حفظ تعديل المسودة"],
    [{ kind: "order", operation: "SUBMIT_NEW_ORDER" }, "إرسال طلب جديد"],
    [{ kind: "order", operation: "SUBMIT_DRAFT" }, "إرسال المسودة للاعتماد"],
    [{ kind: "order", operation: "RESUBMIT_ORDER" }, "إعادة الإرسال للاعتماد"],
    [{ kind: "order", operation: "SET_ORDER_PAID" }, "تعديل المبلغ المدفوع"],
    [{ kind: "approval", operation: "APPROVE_INITIAL" }, "اعتماد أولي"],
    [{ kind: "approval", operation: "RETURN_INITIAL" }, "إعادة للمبيعات"],
    [{ kind: "approval", operation: "REPORT_ISSUE" }, "إحالة مشكلة تصنيع"],
    [{ kind: "approval", operation: "RESOLVE_ISSUE" }, "قرار مشكلة تصنيع"],
    [{ kind: "approval", operation: "SUBMIT_CONTACT" }, "تواصل العميل"],
    [{ kind: "approval", operation: "REVIEW_CONTACT" }, "مراجعة تواصل العميل"],
    [
      { kind: "manufacturing", operation: "RECEIVE_AND_START" },
      "استلام وبدء العمل",
    ],
    [{ kind: "manufacturing", operation: "CONTINUE" }, "متابعة العمل"],
    [
      { kind: "manufacturing", operation: "COMPLETE_TRANSFER" },
      "إتمام وتحويل العمل",
    ],
    [{ kind: "quality", operation: "RECEIVE_AND_START" }, "استلام وبدء الفحص"],
    [{ kind: "quality", operation: "CONTINUE" }, "متابعة الفحص"],
    [{ kind: "quality", operation: "INSPECT" }, "تسجيل نتيجة الفحص والتغليف"],
    [{ kind: "quality", operation: "REPORT_ISSUES" }, "إبلاغ الاعتماد بمشكلة"],
    [{ kind: "warehouse", operation: "RECEIVE" }, "تأكيد الاستلام الفعلي"],
    [{ kind: "warehouse", operation: "DISPATCH" }, "خروج الطلب الكامل للتوصيل"],
    [
      { kind: "warehouse", operation: "CONFIRM_DELIVERY" },
      "تأكيد تسليم الطلب الكامل",
    ],
    [
      { kind: "warehouse", operation: "FAIL_DELIVERY" },
      "تسجيل فشل التوصيل والعودة الكاملة",
    ],
    [
      { kind: "warehouse", operation: "RETRY_DELIVERY" },
      "إعادة تجهيز الطلب للتوصيل",
    ],
  ])("preserves %j", (action, label) => {
    expect(
      toOrderActivityActionLabel(orderActivityActionSchema.parse(action)),
    ).toBe(label);
  });
});
