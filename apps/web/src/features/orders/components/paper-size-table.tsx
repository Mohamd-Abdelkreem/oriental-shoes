import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { SIZE_OPTIONS } from "../paper/paper-options";
import { paperCellText } from "../paper/paper-cell-text";
import { PaperCellSelect } from "./paper-cell-select";
import { PaperCellValue } from "./paper-cell-value";
import type { OrderPaperFormProps } from "./order-paper-form-props";

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
}: {
  line: ProductLine;
  editable: boolean;
  onChange: (key: keyof ProductLine, value: string) => void;
} & Pick<
  OrderPaperFormProps,
  "dataState" | "fieldErrorMessages" | "onFieldElement"
>) {
  return (
    <table className="paper-size-table">
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
              {!editable ? (
                <PaperCellValue value={paperCellText(line[field.key])} />
              ) : field.key === "size" ? (
                <PaperCellSelect
                  value={paperCellText(line.size)}
                  onChange={(value) => {
                    onChange("size", value);
                  }}
                  options={
                    dataState === undefined
                      ? SIZE_OPTIONS
                      : dataState.catalogOptions.size
                  }
                  placeholder="المقاس..."
                  ariaLabel="المقاس"
                  columnLabel="المقاس"
                  invalid={
                    fieldErrorMessages?.[`${line.id}:size`] !== undefined
                  }
                  errorMessage={fieldErrorMessages?.[`${line.id}:size`]}
                  errorId={`paper-error-${line.id}-size`}
                  onFieldElement={(element) => {
                    onFieldElement?.(line.id, "size", element);
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
