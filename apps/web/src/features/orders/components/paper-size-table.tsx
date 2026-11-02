import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { SIZE_OPTIONS } from "../paper/paper-options";
import { paperCellText } from "../paper/paper-cell-text";
import { PaperCellSelect } from "./paper-cell-select";
import { PaperCellValue } from "./paper-cell-value";

const sizingFields = [
  { key: "size", label: "المقاس", width: "40%" },
  { key: "aField", label: "A", width: "30%" },
  { key: "fField", label: "F", width: "30%" },
] as const;

export function PaperSizeTable({
  line,
  editable,
  onChange,
}: {
  line: ProductLine;
  editable: boolean;
  onChange: (key: keyof ProductLine, value: string) => void;
}) {
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
                  options={SIZE_OPTIONS}
                  placeholder="المقاس..."
                  ariaLabel="المقاس"
                  columnLabel="المقاس"
                />
              ) : (
                <div className="paper-cell-box">
                  <input
                    aria-label={field.label}
                    className="paper-cell-input"
                    value={paperCellText(line[field.key])}
                    onChange={(event) => {
                      onChange(field.key, event.target.value);
                    }}
                    placeholder={field.label}
                  />
                </div>
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
