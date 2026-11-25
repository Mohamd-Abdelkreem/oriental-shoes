import type { ProductLine } from "@/features/prototype/state/mvp-types";
import {
  canEditPieceField,
  type OrderPaperFormProps,
} from "./order-paper-form-props";
import { PaperSizeTable } from "./paper-size-table";

export function PaperPieceMeasurements({
  line,
  editable,
  pieceEdit,
  onChange,
  dataState,
  onCatalogSelection,
  fieldErrorMessages,
  onFieldElement,
}: {
  line: ProductLine;
  editable: boolean;
  onChange: (key: keyof ProductLine, value: string) => void;
} & Pick<
  OrderPaperFormProps,
  | "pieceEdit"
  | "dataState"
  | "onCatalogSelection"
  | "fieldErrorMessages"
  | "onFieldElement"
>) {
  return (
    <>
      <PaperSizeTable
        line={line}
        editable={editable}
        pieceEdit={pieceEdit}
        onChange={onChange}
        dataState={dataState}
        onCatalogSelection={onCatalogSelection}
        fieldErrorMessages={fieldErrorMessages}
        onFieldElement={onFieldElement}
      />

      <label className="paper-notes">
        <b>ملاحظات</b>
        {editable || canEditPieceField(pieceEdit, line.id, "sideNotes") ? (
          <>
            <textarea
              aria-label="الملاحظات الجانبية"
              aria-invalid={
                fieldErrorMessages?.[`${line.id}:sideNotes`] !== undefined
              }
              aria-describedby={
                fieldErrorMessages?.[`${line.id}:sideNotes`] === undefined
                  ? undefined
                  : `paper-error-${line.id}-sideNotes`
              }
              ref={(element) => {
                onFieldElement?.(line.id, "sideNotes", element);
              }}
              className="print:hidden"
              value={line.sideNotes ?? ""}
              onChange={(event) => {
                onChange("sideNotes", event.target.value);
              }}
            />
            {fieldErrorMessages?.[`${line.id}:sideNotes`] !== undefined && (
              <span id={`paper-error-${line.id}-sideNotes`} className="sr-only">
                {fieldErrorMessages[`${line.id}:sideNotes`]}
              </span>
            )}
            <span className="hidden whitespace-pre-wrap print:block">
              {line.sideNotes || " "}
            </span>
          </>
        ) : (
          <span>{line.sideNotes || " "}</span>
        )}
      </label>
    </>
  );
}
