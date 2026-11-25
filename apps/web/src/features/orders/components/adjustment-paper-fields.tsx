import { useId } from "react";
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
  errors,
  onChange,
}: {
  fields: OrderAdjustmentFields;
  mode: OrderPaperMode;
  errors?:
    Readonly<Partial<Record<keyof OrderAdjustmentFields, string>>> | undefined;
  onChange?: ((fields: OrderAdjustmentFields) => void) | undefined;
}) {
  const sectionId = useId();
  const editable = isEditable(mode);
  return (
    <section className="paper-adjustment-section">
      {adjustmentFieldDefinitions.map((field) => {
        const inputId = `${sectionId}-${field.key}`;
        const error = errors?.[field.key];
        const errorId = `${inputId}-error`;
        return (
          <div key={field.key} className="paper-adjustment-block">
            <div className="paper-adjustment-title">
              {editable ? (
                <label htmlFor={inputId}>{field.label}</label>
              ) : (
                <b>{field.label}</b>
              )}
            </div>
            {editable ? (
              <>
                <textarea
                  id={inputId}
                  name={field.key}
                  aria-invalid={error !== undefined}
                  aria-describedby={error === undefined ? undefined : errorId}
                  className="paper-adjustment-textarea aria-invalid:border-rose-600!"
                  rows={field.rows}
                  value={fields[field.key] ?? ""}
                  onChange={(event) => {
                    onChange?.({ [field.key]: event.target.value });
                  }}
                  placeholder={field.paperPlaceholder}
                />
                {error !== undefined && (
                  <p id={errorId} className="text-xs text-rose-700">
                    {error}
                  </p>
                )}
              </>
            ) : (
              <div className="paper-dotted-lines">
                <AdjustmentLines
                  text={fields[field.key]}
                  prefixes={field.prefixes}
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
