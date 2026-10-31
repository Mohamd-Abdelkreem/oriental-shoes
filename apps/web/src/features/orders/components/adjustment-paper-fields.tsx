import {
  adjustmentFieldDefinitions,
  type OrderAdjustmentFields,
} from "../adjustment-fields";
import { isEditable } from "./is-editable";
import type { OrderPaperMode } from "./order-paper-mode";

function AdjustmentLines({
  text,
  prefixes,
}: {
  text: string | undefined;
  prefixes: readonly string[];
}) {
  const enteredLines = (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return prefixes.map((prefix, lineIndex) => (
    <div key={lineIndex} className="paper-dotted-row">
      <span className="paper-row-num">{prefix}</span>
      <span className="paper-row-dots">{enteredLines[lineIndex] || ""}</span>
    </div>
  ));
}

export function AdjustmentPaperFields({
  fields,
  mode,
  onChange,
}: {
  fields: OrderAdjustmentFields;
  mode: OrderPaperMode;
  onChange?: ((fields: OrderAdjustmentFields) => void) | undefined;
}) {
  return (
    <section className="paper-adjustment-section">
      {adjustmentFieldDefinitions.map((field) => (
        <div key={field.key} className="paper-adjustment-block">
          <div className="paper-adjustment-title">
            <b>{field.label}</b>
          </div>
          {isEditable(mode) ? (
            <textarea
              className="paper-adjustment-textarea"
              rows={field.rows}
              value={fields[field.key] ?? ""}
              onChange={(event) => {
                onChange?.({ [field.key]: event.target.value });
              }}
              placeholder={field.paperPlaceholder}
            />
          ) : (
            <div className="paper-dotted-lines">
              <AdjustmentLines
                text={fields[field.key]}
                prefixes={field.prefixes}
              />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
