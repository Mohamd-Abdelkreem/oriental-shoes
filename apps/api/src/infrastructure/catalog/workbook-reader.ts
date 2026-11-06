import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { catalogFieldSchema, type CatalogField } from "@template/contracts";
import ExcelJS, { type CellValue, type Worksheet } from "exceljs";
import {
  REVIEWED_CATALOG_MANIFEST,
  type ReviewedCatalogRange,
} from "../../modules/catalogs/reviewed-catalog.manifest.js";

export const MAX_CATALOG_WORKBOOK_BYTES = 16 * 1024 * 1024;
export type ReviewedCatalogEntry = Readonly<{
  kind: CatalogField;
  sourceCell: string;
  displayValue: string;
  familyCell: string | null;
  familyLabel: string | null;
  position: number;
}>;
export type ReviewedCatalogRate = Readonly<{
  sourceCell: string;
  priceSourceCell: string;
  label: string;
  unitPrice: string;
}>;
export type CatalogDiagnostic = Readonly<{ cell: string; code: string }>;
export type ReviewedCatalogPreview = Readonly<{
  sourceSha256: string;
  mappingVersion: 1;
  entries: readonly ReviewedCatalogEntry[];
  rates: readonly ReviewedCatalogRate[];
  counts: Readonly<Record<CatalogField, number>>;
  diagnostics: readonly CatalogDiagnostic[];
  totalIssueCount: number;
  valid: boolean;
}>;
export interface CatalogWorkbookReader {
  read(verifiedBytes: Buffer): Promise<ReviewedCatalogPreview>;
}

class PreviewDiagnostics {
  readonly diagnostics: CatalogDiagnostic[] = [];
  totalIssueCount = 0;
  errorCount = 0;
  warn(cell: string, code: string): void {
    this.totalIssueCount += 1;
    if (this.diagnostics.length < 100) this.diagnostics.push({ cell, code });
  }
  reject(cell: string, code: string): void {
    this.errorCount += 1;
    this.warn(cell, code);
  }
}
const sourceScalar = (
  source: CellValue,
  cell: string,
  issues: PreviewDiagnostics,
): unknown => {
  if (source === null || source === undefined) {
    issues.reject(cell, "CELL_VALUE_MISSING");
    return undefined;
  }
  if (
    typeof source === "object" &&
    ("formula" in source || "sharedFormula" in source)
  ) {
    if (source.result === undefined)
      issues.reject(cell, "FORMULA_CACHE_MISSING");
    return source.result;
  }
  return source;
};
const richLabel = (input: unknown): string | null => {
  if (
    input === null ||
    typeof input !== "object" ||
    !("richText" in input) ||
    !Array.isArray(input.richText)
  )
    return null;
  const runs: readonly unknown[] = input.richText;
  const fragments: string[] = [];
  for (const run of runs) {
    if (
      run === null ||
      typeof run !== "object" ||
      !("text" in run) ||
      typeof run.text !== "string"
    )
      return null;
    fragments.push(run.text);
  }
  return fragments.join("");
};
const sourceLabel = (
  source: CellValue,
  cell: string,
  issues: PreviewDiagnostics,
): string | null => {
  const scalar = sourceScalar(source, cell, issues);
  if (scalar === undefined) return null;
  const label = typeof scalar === "string" ? scalar : richLabel(scalar);
  if (
    label === null ||
    label.length > 200 ||
    label.trim().length === 0 ||
    label.includes("\u0000")
  ) {
    issues.reject(cell, "LABEL_TYPE_OR_VALUE_INVALID");
    return null;
  }
  return label;
};
const sourceNumber = (
  source: CellValue,
  cell: string,
  expected: number,
  issues: PreviewDiagnostics,
): string | null => {
  const scalar = sourceScalar(source, cell, issues);
  if (scalar === undefined) return null;
  if (
    typeof scalar !== "number" ||
    !Number.isFinite(scalar) ||
    scalar !== expected
  ) {
    issues.reject(cell, "NUMERIC_SET_MISMATCH");
    return null;
  }
  return String(expected);
};
const fixedLabels: Readonly<Record<string, string>> =
  REVIEWED_CATALOG_MANIFEST.fixedLabels;
const readEntry = (
  sheet: Worksheet,
  range: ReviewedCatalogRange,
  row: number,
  issues: PreviewDiagnostics,
): ReviewedCatalogEntry | null => {
  const sourceCell = `${range.column}${String(row)}`;
  const cell = sheet.getCell(sourceCell);
  const label =
    range.numbers === undefined
      ? sourceLabel(cell.value, sourceCell, issues)
      : sourceNumber(
          cell.value,
          sourceCell,
          range.numbers.start + (row - range.from) * range.numbers.step,
          issues,
        );
  if (label === null) return null;
  const expected = fixedLabels[sourceCell];
  if (expected !== undefined && label !== expected)
    issues.reject(sourceCell, "FIXED_LABEL_MISMATCH");
  return {
    kind: range.kind,
    sourceCell,
    displayValue: label,
    familyCell: range.family?.cell ?? null,
    familyLabel: range.family?.label ?? null,
    position: row - range.from + 1,
  };
};
const readEntries = (
  sheet: Worksheet,
  issues: PreviewDiagnostics,
): ReviewedCatalogEntry[] => {
  const ranges: readonly ReviewedCatalogRange[] =
    REVIEWED_CATALOG_MANIFEST.ranges;
  const entries: ReviewedCatalogEntry[] = [];
  for (const range of ranges) {
    if (
      range.family !== undefined &&
      sourceLabel(
        sheet.getCell(range.family.cell).value,
        range.family.cell,
        issues,
      ) !== range.family.label
    )
      issues.reject(range.family.cell, "FAMILY_LABEL_MISMATCH");
    for (let row = range.from; row <= range.to; row += 1) {
      const entry = readEntry(sheet, range, row, issues);
      if (entry !== null) entries.push(entry);
    }
  }
  return entries;
};
const readRates = (
  sheet: Worksheet,
  entries: readonly ReviewedCatalogEntry[],
  issues: PreviewDiagnostics,
): ReviewedCatalogRate[] => {
  const rates: ReviewedCatalogRate[] = [];
  for (const expected of REVIEWED_CATALOG_MANIFEST.rates) {
    const label = entries.find(
      (entry) =>
        entry.kind === "decoration" && entry.sourceCell === expected.sourceCell,
    )?.displayValue;
    const price = sourceNumber(
      sheet.getCell(expected.priceSourceCell).value,
      expected.priceSourceCell,
      Number(expected.unitPrice),
      issues,
    );
    if (label !== expected.label)
      issues.reject(expected.sourceCell, "DECORATION_LABEL_MISMATCH");
    if (label === expected.label && price !== null)
      rates.push({
        sourceCell: expected.sourceCell,
        priceSourceCell: expected.priceSourceCell,
        label,
        unitPrice: expected.unitPrice,
      });
  }
  return rates;
};
const preview = (
  sourceSha256: string,
  entries: readonly ReviewedCatalogEntry[],
  rates: readonly ReviewedCatalogRate[],
  issues: PreviewDiagnostics,
): ReviewedCatalogPreview => {
  const counts: Record<CatalogField, number> = {
    model: 0,
    size: 0,
    leatherBase: 0,
    decoration: 0,
    decorationColor: 0,
    sole: 0,
    soleAddition: 0,
    soleColor: 0,
    aField: 0,
    fField: 0,
  };
  const labels = new Set<string>();
  for (const entry of entries) {
    counts[entry.kind] += 1;
    const labelKey = `${entry.kind}:${entry.displayValue}`;
    if (labels.has(labelKey))
      issues.warn(entry.sourceCell, "DUPLICATE_LABEL_RETAINED");
    labels.add(labelKey);
  }
  for (const kind of catalogFieldSchema.options)
    if (counts[kind] !== REVIEWED_CATALOG_MANIFEST.counts[kind])
      issues.reject(kind, "COUNT_MISMATCH");
  if (rates.length !== 14) issues.reject("Z3:AA16", "RATE_COUNT_MISMATCH");
  return {
    sourceSha256,
    mappingVersion: 1,
    entries,
    rates,
    counts,
    diagnostics: issues.diagnostics,
    totalIssueCount: issues.totalIssueCount,
    valid: issues.errorCount === 0,
  };
};

export class ExcelCatalogWorkbookReader implements CatalogWorkbookReader {
  async read(verifiedBytes: Buffer): Promise<ReviewedCatalogPreview> {
    const issues = new PreviewDiagnostics();
    if (verifiedBytes.byteLength > MAX_CATALOG_WORKBOOK_BYTES) {
      issues.reject("workbook", "WORKBOOK_TOO_LARGE");
      return preview("", [], [], issues);
    }
    const sha256 = createHash("sha256").update(verifiedBytes).digest("hex");
    if (sha256 !== REVIEWED_CATALOG_MANIFEST.sha256)
      issues.reject("workbook", "SOURCE_HASH_MISMATCH");
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.read(Readable.from([verifiedBytes]));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      issues.reject("workbook", "WORKBOOK_PARSE_FAILED");
      return preview(sha256, [], [], issues);
    }
    const sheet = workbook.getWorksheet(REVIEWED_CATALOG_MANIFEST.worksheet);
    if (sheet === undefined) {
      issues.reject("workbook", "WORKSHEET_MISSING");
      return preview(sha256, [], [], issues);
    }
    const entries = readEntries(sheet, issues),
      rates = readRates(sheet, entries, issues);
    for (const asymmetry of REVIEWED_CATALOG_MANIFEST.asymmetries)
      issues.warn(asymmetry.cell, asymmetry.code);
    return preview(sha256, entries, rates, issues);
  }
}
