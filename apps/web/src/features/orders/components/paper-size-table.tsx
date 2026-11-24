import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { SIZE_OPTIONS } from "../paper/paper-options";
import { paperCellText } from "../paper/paper-cell-text";
import { PaperCellSelect } from "./paper-cell-select";
import { PaperCellValue } from "./paper-cell-value";
import {
  isRequiredPieceField,
  canEditPieceField,
  type OrderPaperFormProps,
} from "./order-paper-form-props";

const sizingFields = [
  { key: "size", label: "المقاس", width: "40%" },
  { key: "aField", label: "A", width: "30%" },
  { key: "fField", label: "F", width: "30%" },
] as const;

export function PaperSizeTable({
  line,
  editable,
  onChange,
  dataState,
  fieldErrorMessages,
  onFieldElement,
  onCatalogSelection,
  pieceEdit,
}: {
  line: ProductLine;
  editable: boolean;
  onChange: (key: keyof ProductLine, value: string) => void;
} & Pick<
  OrderPaperFormProps,
  | "dataState"
  | "fieldErrorMessages"
  | "onFieldElement"
  | "onCatalogSelection"
  | "pieceEdit"
>) {
  return (
    <table className="paper-size-table">
      {pieceEdit && (
        <caption className="mb-1 text-start text-xs font-semibold">
          قياسات {line.pieceNumber}
        </caption>
      )}
      <tbody>
        <tr>
          {sizingFields.map((field) => (
            <th key={field.key} style={{ width: field.width }}>
              {field.label}
            </th>
          ))}
        </tr>
        <tr>
          {sizingFields.map((field) => (
            <td key={field.key}>
              {!editable &&
              !canEditPieceField(pieceEdit, line.id, field.key) ? (
                <PaperCellValue value={paperCellText(line[field.key])} />
              ) : field.key === "size" ||
                dataState?.kind === "authoritative" ? (
                <PaperCellSelect
                  clearable={
                    pieceEdit === undefined || !isRequiredPieceField(field.key)
                  }
                  value={paperCellText(line[field.key])}
                  onChange={(value) => {
                    onChange(field.key, value);
                  }}
                  options={
                    dataState?.kind === "authoritative"
                      ? dataState.catalogOptions[field.key]
                      : dataState === undefined
                        ? SIZE_OPTIONS
                        : dataState.catalogOptions.size
                  }
                  selectedOptionId={
                    dataState?.kind === "authoritative"
                      ? (dataState.selectionsByPiece[line.id]?.[field.key] ??
                        null)
                      : undefined
                  }
                  onSelectionChange={
                    dataState?.kind === "authoritative" &&
                    onCatalogSelection !== undefined
                      ? (selection) => {
                          onCatalogSelection(line.id, field.key, selection);
                        }
                      : undefined
                  }
                  placeholder={`${field.label}...`}
                  ariaLabel={field.label}
                  columnLabel={field.label}
                  invalid={
                    fieldErrorMessages?.[`${line.id}:${field.key}`] !==
                    undefined
                  }
                  errorMessage={fieldErrorMessages?.[`${line.id}:${field.key}`]}
                  errorId={`paper-error-${line.id}-${field.key}`}
                  onFieldElement={(element) => {
                    onFieldElement?.(line.id, field.key, element);
                  }}
                />
              ) : (
                <div className="paper-cell-box">
                  <input
                    aria-label={field.label}
                    aria-invalid={
                      fieldErrorMessages?.[`${line.id}:${field.key}`] !==
                      undefined
                    }
                    aria-describedby={
                      fieldErrorMessages?.[`${line.id}:${field.key}`] ===
                      undefined
                        ? undefined
                        : `paper-error-${line.id}-${field.key}`
                    }
                    ref={(element) => {
                      onFieldElement?.(line.id, field.key, element);
                    }}
                    className="paper-cell-input"
                    value={paperCellText(line[field.key])}
                    onChange={(event) => {
                      onChange(field.key, event.target.value);
                    }}
                    placeholder={field.label}
                  />
                  {fieldErrorMessages?.[`${line.id}:${field.key}`] !==
                    undefined && (
                    <span
                      id={`paper-error-${line.id}-${field.key}`}
                      className="sr-only"
                    >
                      {fieldErrorMessages[`${line.id}:${field.key}`]}
                    </span>
                  )}
                </div>
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
