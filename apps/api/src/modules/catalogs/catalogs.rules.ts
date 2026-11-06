import { createHash } from "node:crypto";
import type {
  CatalogField,
  CatalogQuoteBody,
  CatalogQuoteData,
} from "@template/contracts";
import { serializeDecimalToString } from "../../core/serialization/decimal.js";
import {
  formatMoneyCents,
  parseMoneyCents,
} from "../sales-orders/sales-orders.rules.js";
import type { ActiveCatalog, CatalogEntryRecord } from "./catalogs.queries.js";

export type SelectionResolution =
  | { status: "absent" }
  | { status: "invalid"; reason: "unknown" | "ambiguous" }
  | { status: "resolved"; entry: CatalogEntryRecord };
export const resolveCatalogSelection = (
  entries: readonly CatalogEntryRecord[],
  sourceId: string,
  selection: Readonly<{
    kind: CatalogField;
    display: string | null;
    entryId?: string | null | undefined;
  }>,
): SelectionResolution => {
  const { kind, display, entryId } = selection;
  if (display === null || display.trim().length === 0)
    return entryId == null
      ? { status: "absent" }
      : { status: "invalid", reason: "unknown" };
  const matches = entries.filter(
    (entry) =>
      entry.sourceId === sourceId &&
      entry.kind === kind &&
      entry.displayValue === display &&
      (entryId == null || entry.id === entryId),
  );
  return matches.length === 1 && matches[0] !== undefined
    ? { status: "resolved", entry: matches[0] }
    : {
        status: "invalid",
        reason: matches.length > 1 ? "ambiguous" : "unknown",
      };
};
export const calculateCatalogQuote = (
  active: ActiveCatalog | null,
  input: CatalogQuoteBody,
): CatalogQuoteData => {
  const items: CatalogQuoteData["items"] = input.pieces.map((piece) => {
    const unavailable = (
      reason: Extract<
        CatalogQuoteData["items"][number],
        { availability: "unavailable" }
      >["reason"],
    ) => ({ pieceId: piece.id, availability: "unavailable" as const, reason });
    if (active === null) return unavailable("CATALOG_UNAVAILABLE");
    const resolved = resolveCatalogSelection(active.entries, active.sourceId, {
      kind: "decoration",
      display: piece.decoration,
      entryId: piece.catalogSelections?.decoration,
    });
    if (resolved.status === "absent") return unavailable("DECORATION_REQUIRED");
    if (resolved.status === "invalid")
      return unavailable(
        resolved.reason === "ambiguous"
          ? "DECORATION_AMBIGUOUS"
          : "DECORATION_UNKNOWN",
      );
    const entry = resolved.entry;
    if (
      entry.unitPrice === null ||
      entry.priceSourceCell !== entry.sourceCell.replace(/^Z/u, "AA")
    )
      return unavailable("RATE_UNAVAILABLE");
    return {
      pieceId: piece.id,
      availability: "available" as const,
      decorationEntryId: entry.id,
      decoration: entry.displayValue,
      unitPrice: formatMoneyCents(
        parseMoneyCents(serializeDecimalToString(entry.unitPrice)),
      ),
    };
  });
  const priced = items.filter((item) => item.availability === "available");
  if (active === null || priced.length !== items.length)
    return {
      availability: "unavailable",
      requestId: input.requestId,
      sourceId: active?.sourceId ?? null,
      fingerprint: null,
      total: null,
      items,
    };
  const canonical = priced
    .map((item) => [
      item.pieceId,
      item.decorationEntryId,
      active.sourceId,
      item.unitPrice,
    ])
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
  return {
    availability: "available",
    requestId: input.requestId,
    sourceId: active.sourceId,
    items: priced,
    total: formatMoneyCents(
      priced.reduce((sum, item) => sum + parseMoneyCents(item.unitPrice), 0n),
    ),
    fingerprint: createHash("sha256")
      .update(JSON.stringify(["catalog-quote-v1", canonical]))
      .digest("hex"),
  };
};
