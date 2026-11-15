import { act, renderHook } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { useZodForm } from "@/shared/forms/form";
import { draftReplacementSchema } from "@template/contracts";
import { describe, expect, it } from "vitest";
import {
  setOrderPaidBodySchema,
  submissionCaptureSchema,
} from "@template/contracts";
import { orderFixture, p03Ids } from "@/test/p03-fixtures";
import { makeDraftDefaults } from "./draft-form.model";
import {
  applyOrderCommandError,
  orderCaptureIssueMessage,
  makeOrderPaidDefaults,
  makeReturnedOrderDefaults,
  parseOrderEditorEntry,
  parseSalesOrderListEntry,
  toReturnedOrderCorrections,
} from "./order-form.model";
import { toSalesOrderStatusLabel } from "./order-view.model";

describe("order editor contracts", () => {
  it.each([
    [{ deliveryDate: "2026-02-30" }, "اختر تاريخ تسليم صحيحاً من التقويم"],
    [
      { paidAmount: "1.001" },
      "أدخل المبلغ المدفوع كرقم غير سالب، بحد أقصى منزلتين عشريتين",
    ],
    [
      { generalNotes: "a".repeat(4001) },
      "الملاحظات العامة أطول من المسموح؛ اختصره إلى 4000 حرفاً أو أقل",
    ],
    [
      { generalNotes: "note\u0000" },
      "الملاحظات العامة يحتوي على أحرف غير مدعومة؛ احذفها",
    ],
  ])(
    "explains malformed order capture with a field-specific correction: %j",
    (changes, message) => {
      const capture = {
        ...makeReturnedOrderDefaults(orderFixture()),
        ...changes,
      };
      const parsed = submissionCaptureSchema.safeParse(capture);
      if (parsed.success) throw new Error("Expected invalid capture");
      expect(orderCaptureIssueMessage(parsed.error.issues, capture)).toContain(
        message,
      );
    },
  );
  it("preserves UUID entry and rejects ambiguous parameters", () => {
    expect(parseOrderEditorEntry({ edit: p03Ids.order })).toEqual({
      kind: "edit",
      draftId: p03Ids.order,
    });
    expect(parseOrderEditorEntry({ edit: [p03Ids.order] }).kind).toBe(
      "invalid",
    );
    expect(parseOrderEditorEntry({}, p03Ids.order).kind).toBe("edit");
    expect(parseOrderEditorEntry({ customer: "bad" })).toEqual({
      kind: "new",
      customerPrefill: { kind: "invalid" },
    });
  });
  it("maps canonical statuses and established aliases without inferring warehouse state", () => {
    for (const status of [
      "DRAFT",
      "AWAITING_APPROVAL",
      "RETURNED",
      "APPROVED",
      "READY_FOR_DELIVERY",
      "OUT_FOR_DELIVERY",
      "DELIVERY_FAILED",
      "DELIVERED",
      "CANCELLED",
    ] as const) {
      expect(parseSalesOrderListEntry(status)).toEqual({
        kind: "orders",
        status,
      });
      expect(parseSalesOrderListEntry(toSalesOrderStatusLabel(status))).toEqual(
        { kind: "orders", status },
      );
    }
    expect(parseSalesOrderListEntry("تم الاستلام")).toEqual({
      kind: "orders",
      status: "DELIVERED",
    });
    expect(parseSalesOrderListEntry("مع المندوب")).toEqual({
      kind: "orders",
      status: "OUT_FOR_DELIVERY",
    });
    expect(parseSalesOrderListEntry("ملغي بالكامل")).toEqual({
      kind: "orders",
      status: "CANCELLED",
    });
    expect(parseSalesOrderListEntry(undefined)).toEqual({
      kind: "orders",
      status: "ALL",
    });
    expect(parseSalesOrderListEntry("في المستودع").kind).toBe("unavailable");
    expect(parseSalesOrderListEntry(["RETURNED"]).kind).toBe("invalid");
    expect(parseSalesOrderListEntry("invented").kind).toBe("invalid");
  });
  it("projects only permitted correction fields and preserves original physical membership", () => {
    const original = orderFixture();
    const values = makeReturnedOrderDefaults(original);
    values.generalNotes = "Reviewed correction";
    const correction = toReturnedOrderCorrections(values, original);
    expect(correction.generalNotes).toBe("Reviewed correction");
    expect(correction).not.toHaveProperty("paidAmount");
    expect(correction).not.toHaveProperty("customerId");
    expect(correction.pieces[0]).not.toHaveProperty("decoration");
    expect(correction.pieces[0]).not.toHaveProperty("unitPrice");
    expect(correction.pieces[0]?.id).toBe(original.pieces[0]?.id);
    values.pieces = [];
    expect(() => toReturnedOrderCorrections(values, original)).toThrow(
      "membership",
    );
  });
  it("keeps draft permissiveness separate from final requiredness and explicit exact paid", () => {
    expect(submissionCaptureSchema.safeParse(makeDraftDefaults()).success).toBe(
      false,
    );
    expect(
      submissionCaptureSchema.safeParse({
        ...makeReturnedOrderDefaults(orderFixture()),
        deliveryDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(makeOrderPaidDefaults(orderFixture())).toEqual({
      paidAmount: "0.00",
    });
    for (const paidAmount of ["", null, undefined, "1.001"])
      expect(
        setOrderPaidBodySchema.safeParse({
          commandId: p03Ids.command,
          expectedVersion: 1,
          paidAmount,
        }).success,
      ).toBe(false);
    expect(
      setOrderPaidBodySchema.parse({
        commandId: p03Ids.command,
        expectedVersion: 1,
        paidAmount: "450.5",
      }).paidAmount,
    ).toBe("450.50");
  });
});

it("maps nested selector errors by frozen identity after reorder, ignoring removed pieces and unknown keys", () => {
  const defaults = makeReturnedOrderDefaults(orderFixture());
  const first = defaults.pieces[0];
  if (first === undefined) throw new Error("Missing fixture piece");
  const second = { ...first, id: p03Ids.command };
  defaults.pieces = [first, second];
  const capture = draftReplacementSchema.parse(defaults);
  const form = renderHook(() =>
    useZodForm(draftReplacementSchema, { defaultValues: defaults }),
  );
  const error = new AxiosError(
    "invalid",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 400,
      statusText: "bad",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid",
        requestId: "safe",
        timestamp: "2026-11-06T00:00:00.000Z",
        path: "/api/v1/sales-orders",
        errors: [
          {
            field: "body.capture.pieces.0.catalogSelections.sole",
            message: "Review sole",
          },
          {
            field: "body.corrections.pieces.1.catalogSelections.decoration",
            message: "Forbidden",
          },
          {
            field: "body.capture.pieces.1.catalogSelections.private",
            message: "Unknown",
          },
        ],
      },
    },
  );
  const snapshot = {
    capture,
    formToken: {},
    scope: { actorId: p03Ids.actor, accessVersion: 1, epoch: 1 },
  };
  act(() => {
    form.result.current.setValue("pieces", [second, first]);
    applyOrderCommandError(error, form.result.current, snapshot);
  });
  expect(
    form.result.current.getFieldState("pieces.1.sole").error?.message,
  ).toBe("Review sole");
  expect(
    form.result.current.getFieldState("pieces.0.decoration").error,
  ).toBeUndefined();
  act(() => {
    form.result.current.clearErrors();
    form.result.current.setValue("pieces", [second]);
    applyOrderCommandError(error, form.result.current, snapshot);
  });
  expect(
    form.result.current.getFieldState("pieces.0.sole").error,
  ).toBeUndefined();
  form.unmount();
});
