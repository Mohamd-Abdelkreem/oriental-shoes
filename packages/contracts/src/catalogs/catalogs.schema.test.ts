import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  catalogDataSchema,
  catalogEntrySchema,
  catalogFieldSchema,
  catalogQuoteBodySchema,
  catalogQuoteDataSchema,
  pieceCatalogSelectionsSchema,
} from "./catalogs.schema.ts";

describe("catalog boundary", () => {
  it("keeps all ten typed selectors partial and rejects noncatalog authority", () => {
    const selections = Object.fromEntries(
      catalogFieldSchema.options.map((field) => [field, randomUUID()]),
    );
    expect(pieceCatalogSelectionsSchema.parse(selections)).toEqual(selections);
    expect(pieceCatalogSelectionsSchema.parse({ decoration: null })).toEqual({
      decoration: null,
    });
    expect(pieceCatalogSelectionsSchema.parse({})).toEqual({});
    for (const invalid of [
      null,
      { face: "text" },
      { decoration: "Z3" },
      { unitPrice: "1.00" },
    ])
      expect(pieceCatalogSelectionsSchema.safeParse(invalid).success).toBe(
        false,
      );
  });

  it("preserves original source labels and requires families only for colors", () => {
    const entry = {
      id: randomUUID(),
      kind: "leatherBase",
      sourceCell: "I104",
      displayValue: "001 - جلد ",
      family: null,
      position: 102,
    };
    expect(catalogEntrySchema.parse(entry)).toEqual(entry);
    const family = { key: "L", label: "عائلة - Z " };
    expect(
      catalogEntrySchema.parse({
        ...entry,
        kind: "decorationColor",
        sourceCell: "L3",
        family,
      }).family,
    ).toEqual(family);
    for (const invalid of [
      { ...entry, family },
      { ...entry, kind: "decorationColor" },
      { ...entry, displayValue: " " },
      { ...entry, unitPrice: "1.00" },
    ])
      expect(catalogEntrySchema.safeParse(invalid).success).toBe(false);
  });

  it("requires the complete reviewed kind counts and unique source identities", () => {
    const entries = Object.entries({
      model: 7,
      size: 55,
      leatherBase: 590,
      decoration: 14,
      decorationColor: 1010,
      sole: 12,
      soleAddition: 5,
      soleColor: 40,
      aField: 81,
      fField: 60,
    }).flatMap(([kind, count]) =>
      Array.from({ length: count }, (_, index) => ({
        id: randomUUID(),
        kind,
        sourceCell: `A${String(index + 1)}`,
        displayValue: `label ${String(index)}`,
        family:
          kind === "decorationColor" ? { key: "L", label: "family" } : null,
        position: index + 1,
      })),
    );
    const catalog = {
      availability: "available",
      sourceId: randomUUID(),
      sourceSha256: "a".repeat(64),
      activatedAt: "2026-11-06T00:00:00Z",
      entries,
    };
    expect(catalogDataSchema.parse(catalog).availability).toBe("available");
    const first = entries[0];
    if (!first) throw new Error("Missing first source entry");
    for (const invalidEntries of [
      entries.slice(1),
      [{ ...first, kind: "sole" }, ...entries.slice(1)],
      [first, first, ...entries.slice(2)],
    ])
      expect(
        catalogDataSchema.safeParse({ ...catalog, entries: invalidEntries })
          .success,
      ).toBe(false);
    expect(
      catalogDataSchema.safeParse({ ...catalog, sourceSha256: "A".repeat(64) })
        .success,
    ).toBe(false);
    expect(
      catalogDataSchema.parse({
        availability: "unavailable",
        reason: "CATALOG_NOT_LOADED",
      }),
    ).toEqual({ availability: "unavailable", reason: "CATALOG_NOT_LOADED" });
  });
});

describe("quote boundary", () => {
  it("accepts empty decoration and exact source references without accepting other selectors or prices", () => {
    const piece = {
      id: randomUUID(),
      decoration: "زبيري - z ",
      catalogSelections: { decoration: randomUUID() },
    };
    const quote = { requestId: randomUUID(), pieces: [piece] };
    expect(catalogQuoteBodySchema.parse(quote)).toEqual(quote);
    expect(
      catalogQuoteBodySchema.parse({
        ...quote,
        pieces: [{ id: piece.id, decoration: " " }],
      }).pieces[0]?.decoration,
    ).toBeNull();
    for (const invalid of [
      { ...piece, unitPrice: "1800.00" },
      { ...piece, catalogSelections: { size: randomUUID() } },
      { ...piece, catalogSelections: null },
    ])
      expect(
        catalogQuoteBodySchema.safeParse({ ...quote, pieces: [invalid] })
          .success,
      ).toBe(false);
  });

  it("requires one through 200 distinct piece identities", () => {
    const pieces = Array.from({ length: 201 }, () => ({
      id: randomUUID(),
      decoration: null,
    }));
    const requestId = randomUUID();
    expect(
      catalogQuoteBodySchema.parse({ requestId, pieces: pieces.slice(0, 200) })
        .pieces,
    ).toHaveLength(200);
    for (const invalid of [[], pieces, [pieces[0], pieces[0]]])
      expect(
        catalogQuoteBodySchema.safeParse({ requestId, pieces: invalid })
          .success,
      ).toBe(false);
  });

  it("retains priced peers without representing an unknown total as zero", () => {
    const priced = {
      pieceId: randomUUID(),
      availability: "available",
      decorationEntryId: randomUUID(),
      decoration: "زبيري - z",
      unitPrice: "1800.00",
    };
    const requestId = randomUUID(),
      sourceId = randomUUID();
    const available = {
      availability: "available",
      requestId,
      sourceId,
      fingerprint: "b".repeat(64),
      items: [priced],
      total: "1800.00",
    };
    expect(catalogQuoteDataSchema.parse(available)).toEqual(available);
    const unavailable = {
      availability: "unavailable",
      requestId,
      sourceId,
      fingerprint: null,
      items: [
        priced,
        {
          pieceId: randomUUID(),
          availability: "unavailable",
          reason: "DECORATION_REQUIRED",
        },
      ],
      total: null,
    };
    expect(catalogQuoteDataSchema.parse(unavailable)).toEqual(unavailable);
    for (const invalid of [
      { ...unavailable, total: "0.00" },
      { ...unavailable, items: [priced] },
      { ...available, items: [priced, priced] },
      { ...available, items: [{ ...priced, unitPrice: "1800" }] },
      { ...available, fingerprint: "not-a-hash" },
      { ...available, total: "199999999998.01" },
      { ...available, total: "invalid" },
    ])
      expect(catalogQuoteDataSchema.safeParse(invalid).success).toBe(false);
  });
});
