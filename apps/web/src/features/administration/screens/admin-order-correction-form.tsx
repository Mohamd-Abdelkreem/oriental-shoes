"use client";

import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  contactCatalogFields,
  contactTextFields,
  piecePaperCodesSchema,
  type AdministrationOrderData,
  type AdministrationPaperCorrection,
  type CatalogField,
  type ContactChanges,
} from "@template/contracts";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import type { CatalogSelectionChange } from "@/features/orders/components/order-paper-form-props";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { useCatalog } from "@/features/sales/hooks/catalogs.hooks";
import {
  toAuthoritativePaperState,
  toSubmittedPaper,
} from "@/features/sales/model/order-view.model";
import type { useAdministrationDialogs } from "../hooks/administration-dialogs.hooks";

const contactFields = [
  { name: "customerName", label: "اسم العميل", type: "text", maxLength: 150 },
  { name: "customerPhone", label: "رقم الهاتف", type: "tel", maxLength: 20 },
  {
    name: "customerEmail",
    label: "البريد الإلكتروني",
    type: "email",
    maxLength: 320,
  },
  {
    name: "customerAddress",
    label: "عنوان التسليم",
    type: "text",
    maxLength: 2000,
  },
] as const;

type PaperHeaders = Omit<AdministrationPaperCorrection, "pieces">;
type PieceEdit = {
  changes: ContactChanges;
  labels: Partial<Record<CatalogField, string>>;
};
type PaperEdits = {
  headers: PaperHeaders;
  pieces: Record<string, PieceEdit | undefined>;
};
const optionalText = (text: string) => (text.trim() === "" ? null : text);

function revisedLine(line: ProductLine, edit: PieceEdit | undefined) {
  if (!edit) return line;
  const text = Object.fromEntries(
    contactTextFields.flatMap((field) =>
      edit.changes[field] === undefined
        ? []
        : [[field, edit.changes[field] ?? ""]],
    ),
  );
  return {
    ...line,
    ...text,
    ...Object.fromEntries(
      contactCatalogFields.flatMap((field) =>
        edit.changes[field] === undefined ? [] : [[field, edit.labels[field]]],
      ),
    ),
    paperCodes: edit.changes.paperCodes ?? line.paperCodes,
  };
}

function toPaperPatch({
  headers,
  pieces,
}: PaperEdits): AdministrationPaperCorrection | undefined {
  const changedPieces = Object.entries(pieces).flatMap(([pieceId, edit]) =>
    !edit || Object.values(edit.changes).every((field) => field === undefined)
      ? []
      : [{ pieceId, changes: edit.changes }],
  );
  const changedHeaders = Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(changedHeaders).length === 0 && changedPieces.length === 0)
    return undefined;
  return {
    ...changedHeaders,
    ...(changedPieces.length && { pieces: changedPieces }),
  };
}

function removeUnchangedPieceFields(
  original: Extract<
    AdministrationOrderData,
    { kind: "submitted" }
  >["order"]["pieces"][number],
  edit: PieceEdit,
) {
  for (const field of contactCatalogFields) {
    if (edit.changes[field] === (original.catalogSelections?.[field] ?? null))
      edit.changes[field] = undefined;
  }
  for (const field of contactTextFields)
    if (edit.changes[field] === original[field])
      edit.changes[field] = undefined;
  if (
    edit.changes.paperCodes?.join(",") === (original.paperCodes ?? []).join(",")
  )
    delete edit.changes.paperCodes;
}

export function AdminOrderCorrectionForm({
  detail,
  dialogs,
}: {
  detail: Extract<AdministrationOrderData, { kind: "submitted" }>;
  dialogs: ReturnType<typeof useAdministrationDialogs>;
}) {
  const { order } = detail,
    catalog = useCatalog(),
    form = dialogs.correctionForm;
  const basePaper = useMemo(() => toSubmittedPaper(order), [order]);
  const paperForm = useForm<PaperEdits>({
    defaultValues: { headers: {}, pieces: {} },
  });
  const headers = useWatch({ control: paperForm.control, name: "headers" });
  const edits = useWatch({ control: paperForm.control, name: "pieces" });
  const [measurementPieceId, selectMeasurementPiece] = useState(
    order.pieces[0]?.id ?? "",
  );
  const catalogSnapshot = catalog.isSuccess ? catalog.data : null;
  const paperState = useMemo(
    () => toAuthoritativePaperState(order, catalogSnapshot),
    [order, catalogSnapshot],
  );
  const lines = basePaper.items.map((line) =>
    revisedLine(line, edits[line.id]),
  );
  const measurementPiece = lines.find(({ id }) => id === measurementPieceId);
  const disabled = dialogs.pending || dialogs.preparing;
  const errors = form.formState.errors;
  const changeHeader = (field: keyof PaperHeaders, text: string) => {
    const next = optionalText(text);
    paperForm.setValue("headers", {
      ...paperForm.getValues("headers"),
      [field]: next === order[field] ? undefined : next,
    });
  };
  const changePiece = (
    id: string,
    patch: ContactChanges,
    labels: PieceEdit["labels"] = {},
  ) => {
    if (disabled) return;
    const original = order.pieces.find((piece) => piece.id === id);
    if (!original) return;
    const drafts = paperForm.getValues("pieces"),
      edited = drafts[id];
    const next = {
      changes: { ...edited?.changes, ...patch },
      labels: { ...edited?.labels, ...labels },
    };
    removeUnchangedPieceFields(original, next);
    paperForm.setValue("pieces", {
      ...drafts,
      [id]: next,
    });
  };
  const updateLines = (next: ProductLine[]) => {
    const edited = next.find((line, index) => line !== lines[index]);
    const previous = lines.find(({ id }) => id === edited?.id);
    if (!edited || !previous) return;
    const changes = Object.fromEntries(
      contactTextFields.flatMap((field) =>
        edited[field] === previous[field]
          ? []
          : [[field, optionalText(edited[field] ?? "")]],
      ),
    );
    changePiece(edited.id, changes);
  };
  const chooseCatalogValue = (
    id: string,
    field: CatalogField,
    choice: CatalogSelectionChange,
  ) => {
    changePiece(
      id,
      { [field]: choice.entryId },
      { [field]: choice.displayValue },
    );
  };

  const notes = useWatch({ control: form.control, name: "generalNotes" });
  const customer = useWatch({ control: form.control, name: "customerName" });
  const phone = useWatch({ control: form.control, name: "customerPhone" });
  const deliveryDate =
    headers.deliveryDate === undefined
      ? order.deliveryDate
      : headers.deliveryDate;
  const repairNote =
    headers.repairNote === undefined ? order.repairNote : headers.repairNote;
  return (
    <form
      aria-label="تصحيح أمر التفصيل"
      className="min-w-0 space-y-4"
      noValidate
      onSubmit={(event) => {
        const date = event.currentTarget.elements.namedItem("deliveryDate");
        if (date instanceof HTMLInputElement && !date.validity.valid) {
          event.preventDefault();
          paperForm.setError("headers.deliveryDate", {
            message: "اختر تاريخ تسليم صحيحًا من التقويم أو اترك الخانة فارغة.",
          });
          date.focus();
          return;
        }
        void form.handleSubmit((values) =>
          dialogs.confirmCorrection(
            values,
            toPaperPatch(paperForm.getValues()),
          ),
        )(event);
      }}
    >
      <fieldset disabled={disabled} className="min-w-0 space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900">
            تصحيح أمر التفصيل
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            عدّل مواصفات أي قطعة مباشرة في الجدول. اختَر القطعة من أسفل الجدول
            لتعديل المقاسات والأكواد.
          </p>
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-3">
            {contactFields.map(({ name, label, type, maxLength }) => (
              <label
                key={name}
                className="min-w-0 space-y-1 text-xs font-semibold text-slate-700"
              >
                {label}
                <input
                  type={type}
                  maxLength={maxLength}
                  dir={type === "tel" || type === "email" ? "ltr" : undefined}
                  className="oriental-input w-full"
                  aria-invalid={errors[name] !== undefined}
                  {...form.register(name)}
                />
                {errors[name]?.message && (
                  <span role="alert" className="block text-rose-700">
                    {errors[name].message}
                  </span>
                )}
              </label>
            ))}
            <label className="space-y-1 text-xs font-semibold text-slate-700">
              تاريخ التسليم المتوقع
              <input
                className="oriental-input w-full"
                type="date"
                name="deliveryDate"
                min="0001-01-01"
                max="9999-12-31"
                value={deliveryDate ?? ""}
                aria-invalid={
                  paperForm.formState.errors.headers?.deliveryDate !== undefined
                }
                onChange={(event) => {
                  paperForm.clearErrors("headers.deliveryDate");
                  changeHeader("deliveryDate", event.target.value);
                }}
              />
              {paperForm.formState.errors.headers?.deliveryDate?.message && (
                <span role="alert" className="block text-rose-700">
                  {paperForm.formState.errors.headers.deliveryDate.message}
                </span>
              )}
            </label>
            {order.type === "REPAIR" && (
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                ملاحظات الإصلاح
                <textarea
                  rows={2}
                  maxLength={4000}
                  className="oriental-textarea w-full"
                  value={repairNote ?? ""}
                  onChange={(event) => {
                    changeHeader("repairNote", event.target.value);
                  }}
                />
              </label>
            )}
          </div>
        </section>

        {catalog.isPending && (
          <p role="status" className="text-xs text-slate-600">
            جارٍ تحميل قوائم المواصفات…
          </p>
        )}
        {!catalog.isPending && paperState.catalogSourceId === null && (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          >
            قوائم المواصفات غير متاحة حاليًا. أعد تحميلها لاختيار موديل أو مقاس
            أو خامة.{" "}
            <button
              className="underline underline-offset-2"
              type="button"
              onClick={() => {
                void catalog.refetch();
              }}
            >
              إعادة تحميل القوائم
            </button>
          </p>
        )}
        <OrderPaperForm
          order={{
            ...basePaper,
            customer,
            phone,
            generalNotes: notes,
            delivery: deliveryDate ?? "",
            responsibleSignature:
              headers.responsibleSignature === undefined
                ? basePaper.responsibleSignature
                : (headers.responsibleSignature ?? ""),
            adjustmentRequested:
              headers.adjustmentRequested === undefined
                ? basePaper.adjustmentRequested
                : (headers.adjustmentRequested ?? ""),
            adjustmentReason:
              headers.adjustmentReason === undefined
                ? basePaper.adjustmentReason
                : (headers.adjustmentReason ?? ""),
            adjustmentActionTaken:
              headers.adjustmentActionTaken === undefined
                ? basePaper.adjustmentActionTaken
                : (headers.adjustmentActionTaken ?? ""),
          }}
          displayReference={order.businessNumber}
          mode="admin"
          lines={lines}
          onLinesChange={updateLines}
          onCatalogSelection={chooseCatalogValue}
          onGeneralNotesChange={(text) => {
            form.setValue("generalNotes", text, { shouldDirty: true });
          }}
          fieldErrorMessages={
            errors.generalNotes?.message
              ? { generalNotes: errors.generalNotes.message }
              : undefined
          }
          onSignatureChange={(text) => {
            changeHeader("responsibleSignature", text);
          }}
          onAdjustmentFieldsChange={(adjustment) => {
            for (const field of [
              "adjustmentRequested",
              "adjustmentReason",
              "adjustmentActionTaken",
            ] as const)
              if (
                optionalText(adjustment[field] ?? "") !==
                (headers[field] === undefined ? order[field] : headers[field])
              )
                changeHeader(field, adjustment[field] ?? "");
          }}
          measurementPiece={{
            id: measurementPieceId,
            onChange: selectMeasurementPiece,
          }}
          selectedBoxes={measurementPiece?.paperCodes ?? []}
          onSelectedBoxesChange={(codes) => {
            if (measurementPiece)
              changePiece(measurementPiece.id, {
                paperCodes: piecePaperCodesSchema.parse(codes),
              });
          }}
          dataState={{
            ...paperState,
            lockedCatalogFields: [],
            selectionsByPiece: Object.fromEntries(
              order.pieces.map((piece) => {
                const changes = edits[piece.id]?.changes;
                const refs = contactCatalogFields.flatMap((field) =>
                  changes?.[field] === undefined
                    ? []
                    : [[field, changes[field]]],
                );
                return [
                  piece.id,
                  { ...piece.catalogSelections, ...Object.fromEntries(refs) },
                ];
              }),
            ),
          }}
        />
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            سبب التصحيح (إلزامي)
            <textarea
              rows={3}
              maxLength={4000}
              className="oriental-textarea w-full"
              aria-invalid={errors.reason !== undefined}
              {...form.register("reason")}
            />
            {errors.reason?.message && (
              <span role="alert" className="text-rose-700">
                {errors.reason.message}
              </span>
            )}
          </label>
          {dialogs.reviewRequired && (
            <div
              className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"
              role="alert"
            >
              تغيرت بيانات الطلب. راجع النسخة الحالية قبل الحفظ.
              <button
                type="button"
                className="btn-pill btn-outline"
                onClick={() => {
                  void dialogs.reviewCurrent();
                }}
              >
                مراجعة البيانات الحالية
              </button>
            </div>
          )}
          {dialogs.failure && (
            <p className="mt-3 text-sm text-rose-700" role="alert">
              {dialogs.failure}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="submit"
              className="btn-pill btn-teal"
              disabled={dialogs.reviewRequired}
            >
              حفظ التصحيح
            </button>
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={dialogs.close}
            >
              إلغاء
            </button>
          </div>
        </section>
      </fieldset>
    </form>
  );
}
