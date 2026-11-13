import { useForm, type UseFormSetError } from "react-hook-form";
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ApiContractError } from "@/services/api/api-client";
import { AxiosError, AxiosHeaders } from "axios";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import {
  qualityInspectionFormSchema,
  qualityIssueFormSchema,
  toQualityIssueBody,
  qualityFailureMessage,
  applyQualityFormErrors,
  applyQualityIssueFormErrors,
  type QualityInspectionFormValues,
  type QualityIssueFormValues,
} from "./quality-form.model";

it.each([undefined, null, "", "   ", "  مرجع X/1  ", "x".repeat(4000)])(
  "preserves optional report text or normalizes absence %j",
  (notes) => {
    const body = toQualityIssueBody(
      { reason: "Actual problem", notes },
      {
        commandId: p03Ids.command,
        orders: [
          {
            orderId: p03Ids.order,
            expectedVersion: 2,
            pieceIds: [p03Ids.piece],
          },
        ],
      },
    );
    expect(body.operation).toBe("REPORT_ISSUES");
    if (body.operation !== "REPORT_ISSUES") throw new Error("Report required");
    expect(body.notes).toBe(
      notes === undefined || notes === null || notes.trim() === ""
        ? null
        : notes,
    );
  },
);
it("requires explicit per-piece outcomes and required rejection data without adding quantity authority", () => {
  const base = {
    orders: [
      {
        orderId: p03Ids.order,
        expectedVersion: 2,
        pieces: [
          { pieceId: p03Ids.piece, included: true, decision: "UNDECIDED" },
        ],
      },
    ],
  };
  expect(qualityInspectionFormSchema.safeParse(base).success).toBe(false);
  expect(
    qualityInspectionFormSchema.safeParse({
      orders: [
        {
          ...base.orders[0],
          pieces: [
            {
              pieceId: p03Ids.piece,
              included: true,
              decision: "REJECT",
              target: "CUTTING",
              reason: "",
              instructions: "",
            },
          ],
        },
      ],
    }).success,
  ).toBe(false);
  const valid = {
    orders: [
      {
        ...base.orders[0],
        cartonNumbers: "  X  ",
        inspectorNote: "Note",
        pieces: [{ pieceId: p03Ids.piece, included: true, decision: "ACCEPT" }],
      },
    ],
  };
  expect(
    qualityInspectionFormSchema.parse(valid).orders[0]?.cartonNumbers,
  ).toBe("  X  ");
  expect(
    qualityInspectionFormSchema.safeParse({ ...valid, acceptedQty: 1 }).success,
  ).toBe(false);
  expect(
    qualityIssueFormSchema.safeParse({ reason: "x".repeat(4001) }).success,
  ).toBe(false);
  expect(
    qualityIssueFormSchema.safeParse({ reason: "", notes: null }).success,
  ).toBe(false);
});
it("maps errors by submitted piece identity even after form ordering changes and ignores injected paths", () => {
  const values: QualityInspectionFormValues = {
    orders: [
      {
        orderId: p03Ids.order,
        expectedVersion: 2,
        pieces: [
          { pieceId: p03Ids.actor, included: false, decision: "UNDECIDED" },
          {
            pieceId: p03Ids.piece,
            included: true,
            decision: "REJECT",
            target: "CUTTING",
            reason: "Reason",
            instructions: "Instructions",
          },
        ],
      },
    ],
  };
  const body = {
    commandId: p03Ids.command,
    operation: "INSPECT" as const,
    orders: [
      {
        orderId: p03Ids.order,
        expectedVersion: 2,
        decisions: [
          {
            pieceId: p03Ids.piece,
            decision: "REJECT" as const,
            target: "CUTTING" as const,
            reason: "Reason",
            instructions: "Instructions",
          },
        ],
        inspectorNote: null,
        packing: null,
      },
    ],
  };
  const error = new AxiosError("Raw English must not leak");
  error.response = {
    status: 400,
    statusText: "Failure",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Raw English must not leak",
      requestId: "owned",
      timestamp: p03Instant,
      path: "/quality/commands",
      errors: [
        { field: "body.orders.0.decisions.0.reason", message: "raw field" },
        { field: "body.orders.2.decisions.0.reason", message: "wrong order" },
        { field: "body.orders.0.decisions.0.actorId", message: "forged" },
      ],
    },
  };
  const inspectionForm = renderHook(() =>
    useForm<QualityInspectionFormValues>({ defaultValues: values }),
  );
  const setError = vi.fn<UseFormSetError<QualityInspectionFormValues>>();
  const message = applyQualityFormErrors(
    error,
    { getValues: inspectionForm.result.current.getValues, setError },
    body,
  );
  expect(setError).toHaveBeenCalledTimes(1);
  expect(setError.mock.calls[0]?.[0]).toBe("orders.0.pieces.1.reason");
  expect(setError.mock.calls[0]?.[1].message).toContain("السبب");
  expect(message).not.toContain("Raw English");
  const issueSetError = vi.fn();
  const issueForm = renderHook(() =>
    useForm<QualityIssueFormValues>({ defaultValues: { reason: "Reason" } }),
  );
  applyQualityIssueFormErrors(error, {
    getValues: issueForm.result.current.getValues,
    setError: issueSetError,
  });
  expect(issueSetError).not.toHaveBeenCalled();
  expect(qualityFailureMessage(error, "تسجيل الفحص")).not.toContain(
    "Raw English",
  );
});

it("separates read failure from uncertain POST wording and bounds safe request references", () => {
  const error = new Error("Raw internal network failure"),
    read = qualityFailureMessage(error, "تحميل القائمة", undefined, "read"),
    write = qualityFailureMessage(error, "حفظ الفحص");
  expect(read).toContain("للقراءة");
  expect(read).not.toContain("نتيجة الإجراء غير مؤكدة");
  expect(write).toContain("نتيجة الإجراء غير مؤكدة");
  expect(read).not.toContain("Raw internal");
  const bounded = qualityFailureMessage(
    new ApiContractError("r".repeat(120)),
    "تحميل",
    undefined,
    "read",
  );
  expect(bounded).toContain("r".repeat(100));
  expect(bounded).not.toContain("r".repeat(101));
});

it.each([
  ["reason", "", "سبب المشكلة", "مطلوب"],
  ["reason", "   ", "سبب المشكلة", "مطلوب"],
  ["reason", "x".repeat(4001), "سبب المشكلة", "٤٠٠٠"],
  ["notes", "x".repeat(4001), "ملاحظات إضافية", "٤٠٠٠"],
  ["reason", "x\u0000", "سبب المشكلة", "أحرف"],
] as const)(
  "localizes invalid report %s without changing the draft",
  (field, draft, label, cause) => {
    const parsed = qualityIssueFormSchema.safeParse({
      reason: "Actual problem",
      [field]: draft,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Invalid draft expected");
    const message = parsed.error.issues.find(
      (issue) => issue.path[0] === field,
    )?.message;
    expect(message).toContain(label);
    expect(message).toContain(cause);
    expect(message).toContain("أعد التأكيد");
  },
);

it.each([
  "reason",
  "instructions",
  "cartonCount",
  "cartonNumbers",
  "inspectorNote",
] as const)(
  "preserves active 4000-character %s and localizes 4001",
  (field) => {
    const piece = {
      pieceId: p03Ids.piece,
      included: true,
      decision: "REJECT",
      target: "CUTTING",
      reason: "Defect",
      instructions: "Repair",
    };
    const order = {
      orderId: p03Ids.order,
      expectedVersion: 2,
      pieces: [
        piece,
        { ...piece, pieceId: p03Ids.customer, decision: "ACCEPT" },
      ],
    };
    for (const length of [4000, 4001]) {
      const draft = "x".repeat(length);
      const parsed = qualityInspectionFormSchema.safeParse({
        orders: [
          field === "reason" || field === "instructions"
            ? {
                ...order,
                pieces: [{ ...piece, [field]: draft }, order.pieces[1]],
              }
            : { ...order, [field]: draft },
        ],
      });
      expect(parsed.success).toBe(length === 4000);
      if (!parsed.success)
        expect(parsed.error.issues[0]?.message).toMatch(/٤٠٠٠.*أعد التأكيد/u);
    }
  },
);
