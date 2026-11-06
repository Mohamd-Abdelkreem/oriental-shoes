import type { z } from "zod";
import {
  catalogFieldSchema,
  catalogQuoteBodySchema,
  type CatalogData,
  type CatalogField,
  type CatalogQuoteBody,
  type draftCaptureSchema,
  type DraftPieceCapture,
} from "@template/contracts";
import type {
  CatalogSelectionChange,
  PaperCatalogOptions,
} from "@/features/orders/components/order-paper-form";

export type OrderQuoteInput = Readonly<{
  sourceId: string;
  pieces: CatalogQuoteBody["pieces"];
}>;
const emptyCatalogOptions = (): Record<
  CatalogField,
  PaperCatalogOptions[CatalogField]
> => ({
  model: [],
  size: [],
  leatherBase: [],
  decoration: [],
  decorationColor: [],
  sole: [],
  soleAddition: [],
  soleColor: [],
  aField: [],
  fField: [],
});
export const toPaperCatalogOptions = (
  data: CatalogData,
): PaperCatalogOptions => {
  const options = emptyCatalogOptions();
  if (data.availability === "available")
    for (const kind of catalogFieldSchema.options)
      options[kind] = data.entries
        .filter((entry) => entry.kind === kind)
        .map((entry) => ({
          value: entry.id,
          label: entry.displayValue,
          groupKey: entry.family?.key ?? null,
          groupLabel: entry.family?.label ?? null,
        }));
  return options;
};
const canonicalQuotePieces = (pieces: CatalogQuoteBody["pieces"]) =>
  pieces
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map((piece) => ({
      id: piece.id,
      decoration: piece.decoration ?? null,
      ...(piece.catalogSelections === undefined
        ? {}
        : {
            catalogSelections: {
              ...(piece.catalogSelections.decoration === undefined
                ? {}
                : { decoration: piece.catalogSelections.decoration }),
            },
          }),
    }));
export const makeCatalogQuoteInput = (
  capture: z.input<typeof draftCaptureSchema>,
  sourceId: string,
): OrderQuoteInput => ({
  sourceId,
  pieces: canonicalQuotePieces(
    capture.pieces.map((piece) => ({
      id: piece.id,
      decoration: piece.decoration ?? null,
      ...(piece.catalogSelections === undefined
        ? {}
        : {
            catalogSelections: {
              ...(piece.catalogSelections.decoration === undefined
                ? {}
                : { decoration: piece.catalogSelections.decoration }),
            },
          }),
    })),
  ),
});
export const catalogQuoteKey = (input: OrderQuoteInput): string =>
  JSON.stringify([
    input.sourceId,
    canonicalQuotePieces(
      catalogQuoteBodySchema.shape.pieces.parse(input.pieces),
    ),
  ]);
export const applyCatalogSelection = (
  piece: DraftPieceCapture,
  field: CatalogField,
  selection: CatalogSelectionChange,
): DraftPieceCapture => ({
  ...piece,
  [field]:
    selection.displayValue.trim().length === 0 ? null : selection.displayValue,
  catalogSelections: { ...piece.catalogSelections, [field]: selection.entryId },
});
export const parseQuotePieces = (
  input: OrderQuoteInput,
  requestId: string,
): CatalogQuoteBody =>
  catalogQuoteBodySchema.parse({
    requestId,
    pieces: canonicalQuotePieces(input.pieces),
  });
