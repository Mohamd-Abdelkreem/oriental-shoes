import { expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { administrationOrderDataSchema } from "@template/contracts";
import { p08DetailFixture } from "@/test/p08-fixtures";
import { p03Ids } from "@/test/p03-fixtures";
import {
  administrationCancelFormSchema,
  administrationCorrectionFormSchema,
  captureAdministrationCancellation,
  reviewAdministrationCancellation,
  toAdministrationCancelCommand,
  previewAdministrationCancellation,
  makeAdministrationCorrectionDefaults,
  toAdministrationCorrectionCommand,
  applyAdministrationFormError,
  administrationFailureMessage,
  type AdministrationCancelForm,
} from "./administration-form.model";

const otherId = "90000000-0000-4000-8000-000000000001";
const twoPieces = () => {
  const detail = p08DetailFixture();
  const first = detail.order.pieces[0];
  if (!first) throw new Error("Expected retained piece");
  detail.order.pieces = [
    { ...first, unitPrice: "650.00" },
    { ...first, id: otherId, position: 1, unitPrice: "650.00" },
  ];
  detail.order.counts = { ...detail.order.counts, original: 2, active: 2 };
  detail.order.money = {
    total: "1300.00",
    paidAmount: "1000.00",
    remainingDue: "300.00",
    surplus: "0.00",
  };
  detail.tracking.counts = detail.order.counts;
  detail.tracking.pieces = detail.order.pieces.map((piece) => ({
    pieceId: piece.id,
    stage: piece.stage,
    workState: piece.workState,
    receivedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  }));
  detail.cancellationCandidates = detail.order.pieces.map((piece) => ({
    pieceId: piece.id,
    position: piece.position,
    model: piece.model,
    stage: piece.stage,
    workState: piece.workState,
    receivedAt: null,
    eligible: true,
    denialReason: null,
  }));
  return administrationOrderDataSchema.options[1].parse(detail);
};
const form = (
  selectedPieceIds: readonly string[] = [otherId],
): AdministrationCancelForm => ({
  scope: "QUANTITY",
  itemPieceId: otherId,
  selectedPieceIds,
  reason: "",
});
it("resolves equal model labels by exact physical IDs and preserves paid in exact reconciliation", () => {
  const detail = twoPieces(),
    review = captureAdministrationCancellation(detail, form());
  expect(review.pieceIds).toEqual([otherId]);
  expect(
    toAdministrationCancelCommand(review, "  ", p03Ids.command),
  ).toMatchObject({ scope: "QUANTITY", pieceIds: [otherId], reason: null });
  expect(previewAdministrationCancellation(detail, review.pieceIds)).toEqual({
    total: "650.00",
    paidAmount: "1000.00",
    remainingDue: "0.00",
    surplus: "350.00",
  });
  const whole = captureAdministrationCancellation(detail, {
    ...form(),
    scope: "ORDER",
  });
  expect(whole.pieceIds).toHaveLength(2);
  expect(
    previewAdministrationCancellation(detail, whole.pieceIds),
  ).toMatchObject({ total: "0.00", surplus: "1000.00" });
  expect(
    captureAdministrationCancellation(detail, { ...form(), scope: "ITEM" })
      .pieceIds,
  ).toEqual([otherId]);
});
it.each([{ ids: [] }, { ids: [otherId, otherId] }, { ids: [p03Ids.command] }])(
  "rejects empty, duplicate or foreign selection atomically: %j",
  ({ ids }) => {
    expect(() =>
      captureAdministrationCancellation(twoPieces(), form(ids)),
    ).toThrow();
  },
);
it("requires explicit review without replacing selected IDs when membership or eligibility changes", () => {
  const detail = twoPieces(),
    review = captureAdministrationCancellation(detail, form());
  const newer = structuredClone(detail);
  newer.order.version = 2;
  newer.tracking.orderVersion = 2;
  expect(reviewAdministrationCancellation(review, newer)).toMatchObject({
    expectedVersion: 2,
    pieceIds: [otherId],
  });
  const candidate = newer.cancellationCandidates[1];
  if (!candidate) throw new Error("Expected second piece");
  candidate.eligible = false;
  candidate.denialReason = "INVALID_STATE";
  expect(() => reviewAdministrationCancellation(review, newer)).toThrow();
  expect(() =>
    captureAdministrationCancellation(newer, { ...form(), scope: "ORDER" }),
  ).toThrow();
  expect(() =>
    toAdministrationCancelCommand(
      { ...review, expectedVersion: 9 },
      "",
      p03Ids.command,
    ),
  ).toThrow();
});
it.each(["0.1", "NaN", "1000000000000000000.00"])(
  "rejects malformed or overflowing frozen money: %s",
  (unitPrice) => {
    const detail = twoPieces();
    const piece = detail.order.pieces[0];
    if (!piece) throw new Error("Expected retained piece");
    piece.unitPrice = unitPrice;
    expect(() =>
      previewAdministrationCancellation(detail, [otherId]),
    ).toThrow();
  },
);
it("keeps cents exact at the permitted large unit boundary", () => {
  const detail = twoPieces();
  detail.order.pieces.forEach((piece) => {
    piece.unitPrice = "999999999.99";
  });
  detail.order.money = {
    total: "1999999999.98",
    paidAmount: "1000.00",
    remainingDue: "1999998999.98",
    surplus: "0.00",
  };
  expect(previewAdministrationCancellation(detail, [otherId])).toMatchObject({
    total: "999999999.99",
    remainingDue: "999998999.99",
  });
});
it("normalizes changed correction fields, clears optional values and omits unchanged required values", () => {
  const detail = p08DetailFixture(),
    baseline = detail.correction.effective;
  const values = {
    ...makeAdministrationCorrectionDefaults(baseline),
    customerAddress: "  ",
    reason: " confirmed ",
  };
  const review = {
    operation: "ADMIN_CORRECT" as const,
    orderId: detail.order.id,
    expectedVersion: detail.order.version,
    baseline,
  };
  expect(
    toAdministrationCorrectionCommand(review, values, p03Ids.command),
  ).toMatchObject({ patch: { customerAddress: null }, reason: "confirmed" });
  expect(() =>
    toAdministrationCorrectionCommand(
      review,
      {
        ...makeAdministrationCorrectionDefaults(baseline),
        reason: "unchanged",
      },
      p03Ids.command,
    ),
  ).toThrow("لم تتغير");
  for (const invalid of [
    { customerName: " " },
    { customerPhone: "bad" },
    { reason: "x".repeat(4001) },
    { paidAmount: "1.00" },
  ]) {
    expect(() =>
      toAdministrationCorrectionCommand(
        review,
        { ...values, ...invalid },
        p03Ids.command,
      ),
    ).toThrow();
  }
  expect(administrationCorrectionFormSchema.parse(values).customerAddress).toBe(
    "  ",
  );
  expect(
    administrationCancelFormSchema.safeParse({
      ...form(),
      selectedPieceIds: Array(201).fill(otherId),
    }).success,
  ).toBe(false);
});
it("maps only editable form errors and never exposes server diagnostics", () => {
  const editor = renderHook(() =>
    useForm<AdministrationCancelForm>({ defaultValues: form() }),
  );
  const failure = administrationCancelFormSchema.safeParse(
    form([otherId, otherId]),
  );
  if (failure.success) throw new Error("Expected duplicated selection failure");
  act(() => {
    applyAdministrationFormError(failure.error, editor.result.current);
  });
  expect(
    editor.result.current.getFieldState("selectedPieceIds").error?.message,
  ).toContain("قطعاً");
  expect(
    administrationFailureMessage(
      new Error("private server diagnostic"),
      "review",
    ),
  ).not.toContain("private");
});

it.each([
  { field: "customerName", input: " ", message: "أدخل اسم العميل" },
  { field: "customerName", input: "x".repeat(151), message: "اسم العميل أطول" },
  {
    field: "generalNotes",
    input: "x".repeat(4001),
    message: "الملاحظات العامة أطول",
  },
  {
    field: "customerAddress",
    input: "x".repeat(2001),
    message: "عنوان التسليم أطول",
  },
  {
    field: "customerAddress",
    input: "bad\u0000address",
    message: "عنوان التسليم يحتوي على أحرف غير مدعومة",
  },
  { field: "reason", input: " ", message: "أدخل سبب التصحيح" },
])(
  "identifies the field and recovery for $field",
  ({ field, input, message }) => {
    const values = {
      ...makeAdministrationCorrectionDefaults(
        p08DetailFixture().correction.effective,
      ),
      reason: "Confirmed",
      [field]: input,
    };
    const parsed = administrationCorrectionFormSchema.safeParse(values);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(
        parsed.error.issues.find((issue) => issue.path[0] === field)?.message,
      ).toContain(message);
  },
);

it.each([
  { reason: "r".repeat(4001), message: "٤٠٠٠" },
  { reason: "invalid\u0000reason", message: "أحرف غير مدعومة" },
])(
  "rejects invalid cancellation reason with actionable field feedback: $message",
  ({ reason, message }) => {
    const parsed = administrationCancelFormSchema.safeParse({
      ...form(),
      reason,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Invalid reason unexpectedly accepted");
    const issue = parsed.error.issues.find(
      (entry) => entry.path[0] === "reason",
    );
    expect(issue?.message).toContain(message);
  },
);
