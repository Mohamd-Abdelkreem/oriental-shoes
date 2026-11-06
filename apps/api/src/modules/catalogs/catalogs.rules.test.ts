import { randomUUID } from "node:crypto";
import { Prisma } from "@template/database";
import { expect, it } from "vitest";
import { syntheticCatalogPreview } from "../../test-support/reviewed-catalog.fixture.js";
import type { ActiveCatalog } from "./catalogs.queries.js";
import {
  calculateCatalogQuote,
  resolveCatalogSelection,
} from "./catalogs.rules.js";

const active = (): ActiveCatalog => {
  const preview = syntheticCatalogPreview(),
    sourceId = randomUUID();
  return {
    sourceId,
    sourceSha256: preview.sourceSha256,
    activatedAt: new Date(),
    entries: preview.entries.map((entry) => {
      const rate = preview.rates.find((r) => r.sourceCell === entry.sourceCell);
      return {
        ...entry,
        id: randomUUID(),
        sourceId,
        unitPrice:
          rate === undefined ? null : new Prisma.Decimal(rate.unitPrice),
        priceSourceCell: rate?.priceSourceCell ?? null,
      };
    }),
  };
};
it("resolves only exact kind/source/display identities and preserves duplicate choices", () => {
  const catalog = active(),
    entry = catalog.entries[0];
  if (!entry) throw new Error("Missing fixture");
  expect(
    resolveCatalogSelection(catalog.entries, catalog.sourceId, {
      kind: entry.kind,
      display: entry.displayValue,
      entryId: entry.id,
    }),
  ).toEqual({ status: "resolved", entry });
  for (const [source, kind, label] of [
    [randomUUID(), entry.kind, entry.displayValue],
    [catalog.sourceId, "size", entry.displayValue],
    [catalog.sourceId, entry.kind, entry.displayValue + " "],
  ] as const)
    expect(
      resolveCatalogSelection(catalog.entries, source, {
        kind,
        display: label,
        entryId: entry.id,
      }),
    ).toEqual({ status: "invalid", reason: "unknown" });
  expect(
    resolveCatalogSelection(
      [entry, { ...entry, id: randomUUID() }],
      catalog.sourceId,
      { kind: entry.kind, display: entry.displayValue },
    ),
  ).toEqual({ status: "invalid", reason: "ambiguous" });
  expect(
    resolveCatalogSelection(catalog.entries, catalog.sourceId, {
      kind: "sole",
      display: null,
    }),
  ).toEqual({ status: "absent" });
});
it("binds sorted identities and exact prices while retaining request order and partial priced peers", () => {
  const catalog = active(),
    first = { id: randomUUID(), decoration: "زبيري - z" },
    second = { id: randomUUID(), decoration: "نعام - O" };
  const input = { requestId: randomUUID(), pieces: [first, second] };
  const quote = calculateCatalogQuote(catalog, input);
  expect(quote).toMatchObject({
    availability: "available",
    total: "3300.00",
    requestId: input.requestId,
  });
  expect(
    calculateCatalogQuote(catalog, {
      ...input,
      requestId: randomUUID(),
      pieces: [second, first],
    }).fingerprint,
  ).toBe(quote.fingerprint);
  expect(quote.items.map((e) => e.pieceId)).toEqual([first.id, second.id]);
  expect(
    calculateCatalogQuote(catalog, {
      ...input,
      pieces: [first, { ...second, decoration: "unknown" }],
    }),
  ).toMatchObject({
    availability: "unavailable",
    fingerprint: null,
    total: null,
    items: [
      { availability: "available", unitPrice: "1800.00" },
      { availability: "unavailable", reason: "DECORATION_UNKNOWN" },
    ],
  });
  expect(calculateCatalogQuote(null, input)).toMatchObject({
    availability: "unavailable",
    sourceId: null,
  });
  const decoration = catalog.entries.find((e) => e.kind === "decoration");
  if (!decoration) throw new Error("Missing fixture");
  for (const [replacement, reason] of [
    [{ ...decoration, unitPrice: null }, "RATE_UNAVAILABLE"],
    [{ ...decoration, priceSourceCell: "AA999" }, "RATE_UNAVAILABLE"],
  ] as const)
    expect(
      calculateCatalogQuote(
        {
          ...catalog,
          entries: catalog.entries.map((e) =>
            e.id === decoration.id ? replacement : e,
          ),
        },
        { ...input, pieces: [first] },
      ).items[0],
    ).toMatchObject({ reason });
  expect(
    calculateCatalogQuote(
      {
        ...catalog,
        entries: [...catalog.entries, { ...decoration, id: randomUUID() }],
      },
      { ...input, pieces: [first] },
    ).items[0],
  ).toMatchObject({ reason: "DECORATION_AMBIGUOUS" });
  expect(
    calculateCatalogQuote(catalog, {
      ...input,
      pieces: [{ ...first, decoration: null }],
    }).items[0],
  ).toMatchObject({ reason: "DECORATION_REQUIRED" });
});
