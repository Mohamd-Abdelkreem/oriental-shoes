import type { Route } from "next";
import type { UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import {
  draftCaptureSchema,
  draftPieceCaptureSchema,
  draftReplacementSchema,
  salesUuidSchema,
  customerPhoneSchema,
  type DraftCapture,
  type DraftDto,
  type DraftChange,
  type CustomerSummary,
} from "@template/contracts";
import type {
  MvpOrder,
  ProductLine,
} from "@/features/prototype/state/mvp-types";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { getApiError } from "@/services/api/api-client";
import type { OperationalScope } from "@/shared/query/operational-scope";

export type DraftFormValues = z.input<typeof draftReplacementSchema>;
export type DraftPaperContext = Readonly<{
  ownerName: string;
  createdAt: string | null;
  draftId: string | null;
  customer: CustomerSummary | null;
}>;
export type DraftFormErrorTarget = Pick<
  UseFormReturn<DraftFormValues, DraftFormValues, DraftCapture>,
  "getValues" | "setError"
>;
export type DraftSubmitSnapshot = Readonly<{
  capture: DraftCapture;
  formToken: object;
  scope: OperationalScope;
}>;
export type CustomerPrefill =
  { kind: "none" } | { kind: "phone"; phone: string } | { kind: "invalid" };
export type DraftEditorEntry =
  | { kind: "new"; customerPrefill: CustomerPrefill }
  | { kind: "edit"; draftId: string }
  | { kind: "invalid"; reason: "INVALID_DRAFT_REFERENCE" };
export type DraftListEntry =
  | { kind: "drafts"; status: "ALL" | "DRAFT" }
  | { kind: "unavailable"; status: string }
  | { kind: "invalid"; reason: "INVALID_STATUS_QUERY" };
export const DRAFT_PIECE_CAPTURE_FIELDS = [
  "model",
  "size",
  "leatherBase",
  "decoration",
  "decorationColor",
  "faceRight",
  "faceLeft",
  "mixing",
  "face",
  "sole",
  "soleAddition",
  "soleColor",
  "additions",
  "aField",
  "fField",
  "sideNotes",
] as const;
export type DraftPieceCaptureField =
  (typeof DRAFT_PIECE_CAPTURE_FIELDS)[number];
export const isDraftPieceCaptureField = (
  value: string,
): value is DraftPieceCaptureField =>
  DRAFT_PIECE_CAPTURE_FIELDS.some((field) => field === value);
const headers = [
  "type",
  "customerId",
  "deliveryDate",
  "generalNotes",
  "responsibleSignature",
  "paidAmount",
  "repairNote",
  "adjustmentRequested",
  "adjustmentReason",
  "adjustmentActionTaken",
] as const;
export const makeBlankDraftPiece = (): DraftFormValues["pieces"][number] =>
  draftPieceCaptureSchema.parse({ id: crypto.randomUUID() });
export const makeDraftDefaults = (draft?: DraftDto): DraftFormValues => {
  if (draft === undefined)
    return draftCaptureSchema.parse({
      type: "SHOP",
      pieces: [makeBlankDraftPiece()],
    });
  return {
    type: draft.type,
    customerId: draft.customer?.id ?? null,
    deliveryDate: draft.deliveryDate,
    generalNotes: draft.generalNotes,
    responsibleSignature: draft.responsibleSignature,
    paidAmount: draft.paidAmount,
    repairNote: draft.repairNote,
    adjustmentRequested: draft.adjustmentRequested,
    adjustmentReason: draft.adjustmentReason,
    adjustmentActionTaken: draft.adjustmentActionTaken,
    pieces: draft.pieces.map((piece) =>
      draftPieceCaptureSchema.parse({
        id: piece.id,
        ...Object.fromEntries(
          DRAFT_PIECE_CAPTURE_FIELDS.map((field) => [field, piece[field]]),
        ),
      }),
    ),
  };
};
export const toDraftCapture = (values: DraftFormValues): DraftCapture =>
  draftReplacementSchema.parse(values);
export const toDraftPaperLines = (values: DraftFormValues): ProductLine[] =>
  values.pieces.map((piece, index) => ({
    id: piece.id,
    pieceNumber: formatPieceSequence(index),
    quantity: 1,
    model: piece.model ?? "",
    size: piece.size ?? "",
    leatherBase: piece.leatherBase ?? "",
    decoration: piece.decoration ?? "",
    decorationColor: piece.decorationColor ?? "",
    faceRight: piece.faceRight ?? "",
    faceLeft: piece.faceLeft ?? "",
    mixing: piece.mixing ?? "",
    face: piece.face ?? "",
    sole: piece.sole ?? "",
    soleAddition: piece.soleAddition ?? "",
    soleColor: piece.soleColor ?? "",
    additions: piece.additions ?? "",
    aField: piece.aField ?? "",
    fField: piece.fField ?? "",
    sideNotes: piece.sideNotes ?? "",
  }));
export const fromDraftPaperLines = (
  lines: readonly ProductLine[],
): DraftFormValues["pieces"] =>
  lines.map((piece) => ({
    id: piece.id,
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    decoration: piece.decoration,
    decorationColor: piece.decorationColor,
    faceRight: piece.faceRight ?? null,
    faceLeft: piece.faceLeft ?? null,
    mixing: piece.mixing ?? null,
    face: piece.face,
    sole: piece.sole,
    soleAddition: piece.soleAddition ?? null,
    soleColor: piece.soleColor,
    additions: piece.additions,
    aField: piece.aField ?? null,
    fField: piece.fField ?? null,
    sideNotes: piece.sideNotes ?? null,
  }));
export const toDraftPaper = (
  values: DraftFormValues,
  context: DraftPaperContext,
): MvpOrder => ({
  id: context.draftId ?? "مسودة غير محفوظة",
  type: values.type,
  customer: context.customer?.name ?? "",
  phone: context.customer?.phone ?? "",
  address: context.customer?.address ?? "",
  salesperson: context.ownerName,
  created: context.createdAt ?? "",
  delivery: values.deliveryDate ?? "",
  status: "مسودة",
  // Required legacy paper fields are not displayed or persisted as workflow facts.
  cancelled: 0,
  warehouse: 0,
  segments: [],
  items: toDraftPaperLines(values),
  generalNotes: values.generalNotes ?? "",
  responsibleSignature: values.responsibleSignature ?? "",
  paid: values.paidAmount ?? "",
  repairNote: values.repairNote ?? "",
  adjustmentRequested: values.adjustmentRequested ?? "",
  adjustmentReason: values.adjustmentReason ?? "",
  adjustmentActionTaken: values.adjustmentActionTaken ?? "",
});
export const draftEditRoute = (draftId: string): Route =>
  `/sales/orders/new?edit=${salesUuidSchema.parse(draftId)}` as Route;
export const parseDraftEntry = (
  params: Readonly<{ edit?: string | string[]; customer?: string | string[] }>,
  pathDraftId?: string,
): DraftEditorEntry => {
  if (pathDraftId !== undefined || params.edit !== undefined) {
    const selected = salesUuidSchema.safeParse(pathDraftId ?? params.edit);
    return selected.success
      ? { kind: "edit", draftId: selected.data }
      : { kind: "invalid", reason: "INVALID_DRAFT_REFERENCE" };
  }
  if (
    params.customer === undefined ||
    (typeof params.customer === "string" && params.customer.trim() === "")
  )
    return { kind: "new", customerPrefill: { kind: "none" } };
  const prefill = customerPhoneSchema.safeParse(params.customer);
  return {
    kind: "new",
    customerPrefill: prefill.success
      ? { kind: "phone", phone: prefill.data }
      : { kind: "invalid" },
  };
};
export const parseDraftListEntry = (
  status: string | string[] | undefined,
): DraftListEntry => {
  if (status === undefined || status === "الكل")
    return { kind: "drafts", status: "ALL" };
  if (status === "مسودة") return { kind: "drafts", status: "DRAFT" };
  if (
    typeof status === "string" &&
    [
      "بانتظار الاعتماد",
      "معاد للتعديل",
      "قيد التصنيع",
      "في المستودع",
      "تم التسليم",
      "ملغي",
    ].includes(status)
  )
    return { kind: "unavailable", status };
  return { kind: "invalid", reason: "INVALID_STATUS_QUERY" };
};
export const applyDraftCommandError = (
  error: unknown,
  form: DraftFormErrorTarget,
  snapshot: DraftSubmitSnapshot,
): string => {
  const failure = getApiError(error);
  let first = true;
  for (const [path, messages] of Object.entries(failure.fieldErrors)) {
    const message = messages[0];
    if (message === undefined) continue;
    const header = headers.find((field) => path === `body.draft.${field}`);
    if (header !== undefined) {
      form.setError(
        header,
        { type: "server", message },
        { shouldFocus: first },
      );
      first = false;
      continue;
    }
    const match = /^body\.draft\.pieces\.([0-9]+)\.([A-Za-z]+)$/u.exec(path);
    const submittedIndex = Number(match?.[1]),
      field = match?.[2];
    if (
      !Number.isSafeInteger(submittedIndex) ||
      field === undefined ||
      !isDraftPieceCaptureField(field)
    )
      continue;
    const submitted = snapshot.capture.pieces[submittedIndex];
    if (submitted === undefined) continue;
    const index = form
      .getValues()
      .pieces.findIndex((piece) => piece.id === submitted.id);
    if (index < 0) continue;
    // findIndex produced the validated integer position of the submitted UUID.
    const position = String(index) as `${number}`;
    const target: `pieces.${number}.${DraftPieceCaptureField}` = `pieces.${position}.${field}`;
    form.setError(target, { type: "server", message }, { shouldFocus: first });
    first = false;
  }
  const message =
    failure.code === "DRAFT_VERSION_CONFLICT"
      ? "تغيرت المسودة؛ احتفظ بإدخالك وأعد التحميل للمراجعة."
      : failure.code === "DRAFT_PIECE_CONFLICT" ||
          failure.code === "DRAFT_STATE_CONFLICT"
        ? "تغيرت المسودة أو إحدى قطعها؛ راجع البيانات الحالية قبل الحفظ."
        : "تعذّر حفظ المسودة. احتفظ بإدخالك وراجع البيانات أو حاول مجدداً.";
  return failure.requestId ? `${message} (${failure.requestId})` : message;
};

export const draftChangeFieldLabels = {
  type: "نوع الطلب",
  customerId: "العميل",
  deliveryDate: "تاريخ التسليم",
  generalNotes: "الملاحظات العامة",
  responsibleSignature: "توقيع المسؤول",
  repairNote: "ملاحظات الإصلاح",
  adjustmentRequested: "التعديل المطلوب",
  adjustmentReason: "سبب التعديل",
  adjustmentActionTaken: "الإجراء المتخذ",
  paidAmount: "المبلغ المدفوع",
  pieces: "القطع",
} satisfies Record<DraftChange["changedFields"][number], string>;
