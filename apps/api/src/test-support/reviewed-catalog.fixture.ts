import type {
  ReviewedCatalogPreview,
  ReviewedCatalogEntry,
} from "../infrastructure/catalog/workbook-reader.js";
import {
  REVIEWED_CATALOG_MANIFEST as manifest,
  type ReviewedCatalogRange,
} from "../modules/catalogs/reviewed-catalog.manifest.js";

// Synthetic reviewed-shape decoder output for owned databases only. Not workbook admission.
export const syntheticCatalogPreview = (): ReviewedCatalogPreview => {
  const labels: Readonly<Record<string, string>> = manifest.fixedLabels;
  const rates = new Map(
    manifest.rates.map((rate) => [rate.sourceCell as string, rate]),
  );
  const entries: ReviewedCatalogEntry[] = [];
  for (const range of manifest.ranges as readonly ReviewedCatalogRange[])
    for (let row = range.from; row <= range.to; row++) {
      const cell = `${range.column}${String(row)}`;
      entries.push({
        kind: range.kind,
        sourceCell: cell,
        displayValue:
          rates.get(cell)?.label ??
          labels[cell] ??
          (range.numbers === undefined
            ? `synthetic ${cell}`
            : String(
                range.numbers.start + (row - range.from) * range.numbers.step,
              )),
        familyCell: range.family?.cell ?? null,
        familyLabel: range.family?.label ?? null,
        position: row - range.from + 1,
      });
    }
  return {
    sourceSha256: manifest.sha256,
    mappingVersion: 1,
    entries,
    rates: manifest.rates.map((rate) => ({ ...rate })),
    counts: { ...manifest.counts },
    diagnostics: [],
    totalIssueCount: 0,
    valid: true,
  };
};
