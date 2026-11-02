import type { ProductLine } from "@/features/prototype/state/mvp-types";

const printedTextFields = [
  "model",
  "leatherBase",
  "face",
  "faceRight",
  "faceLeft",
  "mixing",
  "decoration",
  "decorationColor",
  "sole",
  "soleColor",
  "additions",
  "size",
  "sideNotes",
] as const;
const amountFields = ["unitPrice", "rowTotal"] as const;

function hasPieceData(line: ProductLine): boolean {
  return (
    printedTextFields.some((field) => (line[field] ?? "").trim() !== "") ||
    amountFields.some((field) => {
      const amount = line[field]?.trim();
      return Boolean(amount && amount !== "0");
    })
  );
}

export function getPrintablePaperLines(lines: ProductLine[]): ProductLine[] {
  const activeLines = lines.filter((line) => !line.isDeleted);
  const populatedLines = activeLines.filter(hasPieceData);
  return populatedLines.length > 0 ? populatedLines : activeLines;
}
