import { randomUUID } from "node:crypto";
import { catalogFieldSchema } from "@template/contracts";
import type { DatabaseClient, Prisma } from "@template/database";
import { serializeDecimalToString } from "../../core/serialization/decimal.js";
import type {
  ReviewedCatalogEntry,
  ReviewedCatalogPreview,
} from "../../infrastructure/catalog/workbook-reader.js";
import {
  formatMoneyCents,
  parseMoneyCents,
} from "../sales-orders/sales-orders.rules.js";
import {
  REVIEWED_CATALOG_MANIFEST,
  type ReviewedCatalogRange,
} from "./reviewed-catalog.manifest.js";

export class CatalogLoadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CatalogLoadError";
  }
}
export type CatalogLoadResult = Readonly<{
  sourceId: string;
  sourceSha256: string;
  reused: boolean;
  entryCount: number;
  activated: boolean;
}>;
function invalidPreview(): never {
  throw new CatalogLoadError("CATALOG_PREVIEW_INVALID");
}
const entryKey = (entry: Pick<ReviewedCatalogEntry, "kind" | "sourceCell">) =>
  `${entry.kind}:${entry.sourceCell}`;
const fixedLabels: Readonly<Record<string, string>> =
  REVIEWED_CATALOG_MANIFEST.fixedLabels;

export const assertReviewedCatalogPreview = (
  preview: ReviewedCatalogPreview,
): void => {
  if (
    !preview.valid ||
    preview.sourceSha256 !== REVIEWED_CATALOG_MANIFEST.sha256 ||
    preview.entries.length !== 1874 ||
    preview.rates.length !== 14
  )
    invalidPreview();
  if (
    preview.diagnostics.length > 100 ||
    !Number.isSafeInteger(preview.totalIssueCount) ||
    preview.totalIssueCount < preview.diagnostics.length ||
    preview.diagnostics.some(
      (diagnostic) =>
        ![
          "DUPLICATE_LABEL_RETAINED",
          "NO_COLOR_FAMILY",
          "NO_DECORATION_RATE",
        ].includes(diagnostic.code),
    )
  )
    invalidPreview();
  const entries = new Map(
    preview.entries.map((entry) => [entryKey(entry), entry]),
  );
  if (entries.size !== 1874) invalidPreview();
  for (const kind of catalogFieldSchema.options)
    if (
      preview.counts[kind] !== REVIEWED_CATALOG_MANIFEST.counts[kind] ||
      preview.entries.filter((entry) => entry.kind === kind).length !==
        preview.counts[kind]
    )
      invalidPreview();
  const ranges: readonly ReviewedCatalogRange[] =
    REVIEWED_CATALOG_MANIFEST.ranges;
  for (const range of ranges)
    for (let row = range.from; row <= range.to; row += 1) {
      const sourceCell = `${range.column}${String(row)}`,
        entry = entries.get(`${range.kind}:${sourceCell}`);
      if (
        entry === undefined ||
        entry.displayValue.length > 200 ||
        entry.displayValue.trim().length === 0 ||
        entry.displayValue.includes("\u0000") ||
        entry.position !== row - range.from + 1 ||
        entry.familyCell !== (range.family?.cell ?? null) ||
        entry.familyLabel !== (range.family?.label ?? null)
      )
        invalidPreview();
      const expected =
        range.numbers === undefined
          ? fixedLabels[sourceCell]
          : String(
              range.numbers.start + (row - range.from) * range.numbers.step,
            );
      if (expected !== undefined && entry.displayValue !== expected)
        invalidPreview();
    }
  const rates = new Map(preview.rates.map((rate) => [rate.sourceCell, rate]));
  if (rates.size !== 14) invalidPreview();
  for (const expected of REVIEWED_CATALOG_MANIFEST.rates) {
    const rate = rates.get(expected.sourceCell),
      entry = entries.get(`decoration:${expected.sourceCell}`);
    if (
      rate?.priceSourceCell !== expected.priceSourceCell ||
      rate.label !== expected.label ||
      rate.unitPrice !== expected.unitPrice ||
      entry?.displayValue !== expected.label
    )
      invalidPreview();
  }
};
const storedEntries = (
  sourceId: string,
  preview: ReviewedCatalogPreview,
): Prisma.CatalogEntryCreateManyInput[] => {
  const rates = new Map(preview.rates.map((rate) => [rate.sourceCell, rate]));
  return preview.entries.map((entry) => ({
    id: randomUUID(),
    sourceId,
    kind: entry.kind,
    sourceCell: entry.sourceCell,
    displayValue: entry.displayValue,
    lookupValue: entry.displayValue.trim().toLowerCase(),
    familyCell: entry.familyCell,
    familyLabel: entry.familyLabel,
    position: entry.position,
    unitPrice: rates.get(entry.sourceCell)?.unitPrice ?? null,
    priceSourceCell: rates.get(entry.sourceCell)?.priceSourceCell ?? null,
  }));
};
const assertRetainedEntries = async (
  tx: Prisma.TransactionClient,
  sourceId: string,
  preview: ReviewedCatalogPreview,
): Promise<void> => {
  const rows = await tx.catalogEntry.findMany({
    where: { sourceId },
    take: 1875,
    select: {
      kind: true,
      sourceCell: true,
      displayValue: true,
      lookupValue: true,
      familyCell: true,
      familyLabel: true,
      position: true,
      unitPrice: true,
      priceSourceCell: true,
    },
  });
  if (rows.length !== 1874)
    throw new CatalogLoadError("CATALOG_RETAINED_SOURCE_MISMATCH");
  const expectedEntries = new Map(
      preview.entries.map((entry) => [entryKey(entry), entry]),
    ),
    rates = new Map(preview.rates.map((rate) => [rate.sourceCell, rate]));
  for (const row of rows) {
    const expected = expectedEntries.get(entryKey(row)),
      rate = rates.get(row.sourceCell);
    const price =
      row.unitPrice === null
        ? null
        : formatMoneyCents(
            parseMoneyCents(serializeDecimalToString(row.unitPrice)),
          );
    if (
      expected === undefined ||
      row.displayValue !== expected.displayValue ||
      row.lookupValue !== expected.displayValue.trim().toLowerCase() ||
      row.familyCell !== expected.familyCell ||
      row.familyLabel !== expected.familyLabel ||
      row.position !== expected.position ||
      price !== (rate?.unitPrice ?? null) ||
      row.priceSourceCell !== (rate?.priceSourceCell ?? null)
    )
      throw new CatalogLoadError("CATALOG_RETAINED_SOURCE_MISMATCH");
  }
};
export class CatalogLoaderService {
  constructor(private readonly database: DatabaseClient) {}
  async apply(
    preview: ReviewedCatalogPreview,
    expectedDatabaseName: string,
  ): Promise<CatalogLoadResult> {
    assertReviewedCatalogPreview(preview);
    const [database] = await this.database.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`;
    if (
      expectedDatabaseName.length === 0 ||
      database?.name !== expectedDatabaseName
    )
      throw new CatalogLoadError("CATALOG_TARGET_MISMATCH");
    return this.database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('lock_timeout', '5000ms', true)`;
        const [active] = await tx.$queryRaw<
          Array<{ source_id: string | null }>
        >`SELECT source_id FROM catalog_activation WHERE id='active' FOR UPDATE`;
        if (active === undefined)
          throw new CatalogLoadError("CATALOG_ACTIVATION_UNAVAILABLE");
        const existing = await tx.catalogSource.findUnique({
          where: { sha256: preview.sourceSha256 },
          select: {
            id: true,
            mappingVersion: true,
            worksheet: true,
            sourceExtent: true,
            entryCount: true,
          },
        });
        let sourceId: string;
        if (existing !== null) {
          if (
            existing.mappingVersion !== 1 ||
            existing.worksheet !== REVIEWED_CATALOG_MANIFEST.worksheet ||
            existing.sourceExtent !== REVIEWED_CATALOG_MANIFEST.sourceExtent ||
            existing.entryCount !== 1874
          )
            throw new CatalogLoadError("CATALOG_RETAINED_SOURCE_MISMATCH");
          await assertRetainedEntries(tx, existing.id, preview);
          sourceId = existing.id;
        } else {
          sourceId = randomUUID();
          await tx.catalogSource.create({
            data: {
              id: sourceId,
              sha256: preview.sourceSha256,
              worksheet: REVIEWED_CATALOG_MANIFEST.worksheet,
              sourceExtent: REVIEWED_CATALOG_MANIFEST.sourceExtent,
              mappingVersion: 1,
              loadedAt: new Date(),
              loadedByReference: "catalog:load",
              entryCount: 1874,
              manifest: {
                counts: { ...REVIEWED_CATALOG_MANIFEST.counts },
                rates: REVIEWED_CATALOG_MANIFEST.rates.map((rate) => ({
                  ...rate,
                })),
                asymmetries: REVIEWED_CATALOG_MANIFEST.asymmetries.map(
                  (warning) => ({ ...warning }),
                ),
              },
            },
          });
          const entries = storedEntries(sourceId, preview);
          for (let offset = 0; offset < entries.length; offset += 500) {
            const batch = entries.slice(offset, offset + 500),
              inserted = await tx.catalogEntry.createMany({ data: batch });
            if (inserted.count !== batch.length)
              throw new CatalogLoadError("CATALOG_INSERT_INCOMPLETE");
          }
          await assertRetainedEntries(tx, sourceId, preview);
        }
        if (active.source_id !== sourceId)
          await tx.catalogActivation.update({
            where: { id: "active" },
            data: { sourceId, activatedAt: new Date() },
          });
        return {
          sourceId,
          sourceSha256: preview.sourceSha256,
          reused: existing !== null,
          entryCount: 1874,
          activated: true,
        };
      },
      { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 },
    );
  }
}
