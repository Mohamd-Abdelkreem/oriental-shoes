import { expect, it } from "vitest";
import { draftCaptureSchema } from "@template/contracts";
import { catalogFixture, p03Ids } from "@/test/p03-fixtures";
import {
  toPaperCatalogOptions,
  makeCatalogQuoteInput,
  catalogQuoteKey,
  applyCatalogSelection,
} from "./catalog-paper.model";

it("preserves exact labels, source identities and independent families, including duplicate labels", () => {
  const catalog = catalogFixture();
  if (catalog.availability !== "available") throw new Error("Expected catalog");
  const first = catalog.entries.find((entry) => entry.kind === "decoration");
  if (!first) throw new Error("Missing decoration");
  catalog.entries = catalog.entries.map((entry) =>
    entry.kind === "decoration"
      ? { ...entry, displayValue: "001 - Z " }
      : entry,
  );
  const options = toPaperCatalogOptions(catalog);
  expect(options.decoration).toHaveLength(14);
  expect(options.decoration[0]?.label).toBe("001 - Z ");
  expect(new Set(options.decoration.map((option) => option.value)).size).toBe(
    14,
  );
  expect(options.decorationColor[0]?.groupLabel).toBe("نعام - O");
  expect(
    Object.values(
      toPaperCatalogOptions({
        availability: "unavailable",
        reason: "CATALOG_NOT_LOADED",
      }),
    ).every((values) => values.length === 0),
  ).toBe(true);
});
it("keys sorted stable decoration intent only and preserves absent versus null refs", () => {
  const capture = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [
      { id: p03Ids.piece, decoration: "زبيري - z" },
      {
        id: p03Ids.command,
        decoration: "نعام - O",
        catalogSelections: { model: p03Ids.actor, decoration: null },
      },
    ],
  });
  const input = makeCatalogQuoteInput(capture, p03Ids.source),
    key = catalogQuoteKey(input);
  expect(input.pieces.map((piece) => piece.id)).toEqual([
    p03Ids.piece,
    p03Ids.command,
  ]);
  expect(input.pieces[1]?.catalogSelections).toEqual({ decoration: null });
  expect(input.pieces[0]).not.toHaveProperty("catalogSelections");
  expect(
    catalogQuoteKey(
      makeCatalogQuoteInput(
        {
          ...capture,
          pieces: capture.pieces
            .toReversed()
            .map((piece) => ({ ...piece, size: "41", model: "changed" })),
        },
        p03Ids.source,
      ),
    ),
  ).toBe(key);
  for (const changed of [
    { ...input, sourceId: p03Ids.actor },
    { ...input, pieces: input.pieces.slice(1) },
    {
      ...input,
      pieces: input.pieces.map((piece) => ({
        ...piece,
        catalogSelections: { decoration: null },
      })),
    },
  ])
    expect(catalogQuoteKey(changed)).not.toBe(key);
});
it("applies selection/custom/clear atomically without touching unrelated captures or references", () => {
  const piece = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [
      {
        id: p03Ids.piece,
        model: "SM",
        catalogSelections: { model: p03Ids.actor },
      },
    ],
  }).pieces[0];
  if (!piece) throw new Error("Missing piece");
  const selected = applyCatalogSelection(piece, "decoration", {
    displayValue: "001 - Z ",
    entryId: p03Ids.command,
  });
  expect(selected).toMatchObject({
    model: "SM",
    decoration: "001 - Z ",
    catalogSelections: { model: p03Ids.actor, decoration: p03Ids.command },
  });
  expect(
    applyCatalogSelection(selected, "decoration", {
      displayValue: "custom ",
      entryId: null,
    }),
  ).toMatchObject({
    decoration: "custom ",
    catalogSelections: { decoration: null },
  });
  expect(
    applyCatalogSelection(selected, "decoration", {
      displayValue: "",
      entryId: null,
    }),
  ).toMatchObject({
    decoration: null,
    catalogSelections: { decoration: null },
  });
});
