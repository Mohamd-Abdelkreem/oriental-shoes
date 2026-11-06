import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_DRAFT_CAPTURE_BYTES,
  salesOrderTypeSchema,
} from "./sales-draft-values.schema.ts";
import {
  createDraftBodySchema,
  customerDraftsQuerySchema,
  customerDraftCardSchema,
  draftCaptureSchema,
  draftReplacementSchema,
  draftSchema,
  saveDraftBodySchema,
} from "./sales-drafts.schema.ts";

const blank = () => ({ type: "SHOP", pieces: [{ id: randomUUID() }] });
describe("incomplete draft captures", () => {
  it.each(salesOrderTypeSchema.options)(
    "accepts a blank row without customer or date for %s",
    (type) => {
      const draft = draftCaptureSchema.parse({ ...blank(), type });
      expect(draft).toMatchObject({
        type,
        customerId: null,
        deliveryDate: null,
        paidAmount: null,
        pieces: [{ model: null, size: null }],
      });
      expect(draftReplacementSchema.parse(draft)).toEqual(draft);
    },
  );
  it("round trips independent significant fields and hidden type notes", () => {
    const draft = draftCaptureSchema.parse({
      ...blank(),
      repairNote: "retained",
      adjustmentRequested: "also retained",
      pieces: [
        {
          id: randomUUID(),
          soleAddition: "روضة - H ",
          additions: "ملاحظة",
          faceRight: " م١ ",
          faceLeft: "م٢",
          mixing: "م٣",
          face: "وجه",
          aField: "A",
          fField: "F",
        },
      ],
    });
    expect(draft.pieces[0]).toMatchObject({
      soleAddition: "روضة - H ",
      additions: "ملاحظة",
      faceRight: " م١ ",
      mixing: "م٣",
    });
    expect(
      draftReplacementSchema.parse({ ...draft, type: "ADJUSTMENT" }),
    ).toMatchObject({
      repairNote: "retained",
      adjustmentRequested: "also retained",
    });
  });
  it.each([
    "0001-01-01",
    "0099-12-31",
    "0100-01-01",
    "2024-02-29",
    "9999-12-31",
  ])("accepts real calendar date %s", (deliveryDate) => {
    expect(
      draftCaptureSchema.parse({ ...blank(), deliveryDate }).deliveryDate,
    ).toBe(deliveryDate);
  });
  it.each([
    "0000-01-01",
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "20/11/2026",
  ])("rejects invalid calendar date %s", (deliveryDate) => {
    expect(
      draftCaptureSchema.safeParse({ ...blank(), deliveryDate }).success,
    ).toBe(false);
  });
  it.each([
    ["100", "100.00"],
    ["001.5", "1.50"],
    ["0", "0.00"],
    ["999999999.99", "999999999.99"],
    ["", null],
  ])("normalizes provisional paid entry %s", (paidAmount, expected) => {
    expect(
      draftCaptureSchema.parse({ ...blank(), paidAmount }).paidAmount,
    ).toBe(expected);
  });
  it.each(["-1", "1e2", "1.001", "1000000000", "1,000", "+1", "NaN", 100])(
    "rejects invalid paid entry %j",
    (paidAmount) => {
      expect(
        draftCaptureSchema.safeParse({ ...blank(), paidAmount }).success,
      ).toBe(false);
    },
  );
  it("requires every nullable key in full replacement, unlike creation", () => {
    const draft = draftCaptureSchema.parse(blank());
    const missing: Record<string, unknown> = { ...draft };
    delete missing["generalNotes"];
    expect(draftReplacementSchema.safeParse(missing).success).toBe(false);
    expect(
      saveDraftBodySchema.safeParse({
        commandId: randomUUID(),
        expectedVersion: 1,
        draft: blank(),
      }).success,
    ).toBe(false);
    expect(
      createDraftBodySchema.safeParse({
        commandId: randomUUID(),
        draft: blank(),
      }).success,
    ).toBe(true);
  });
  it("requires one through 200 distinct physical row identities", () => {
    const id = randomUUID();
    expect(
      draftCaptureSchema.safeParse({ type: "SHOP", pieces: [] }).success,
    ).toBe(false);
    expect(
      draftCaptureSchema.safeParse({ type: "SHOP", pieces: [{ id }, { id }] })
        .success,
    ).toBe(false);
    const pieces = Array.from({ length: 201 }, () => ({ id: randomUUID() }));
    expect(
      draftCaptureSchema.safeParse({
        type: "SHOP",
        pieces: pieces.slice(0, 200),
      }).success,
    ).toBe(true);
    expect(draftCaptureSchema.safeParse({ type: "SHOP", pieces }).success).toBe(
      false,
    );
  });
  it("enforces the exact normalized UTF-8 aggregate limit", () => {
    const draft = draftCaptureSchema.parse({
      type: "SHOP",
      pieces: Array.from({ length: 200 }, () => ({ id: randomUUID() })),
    });
    let remaining =
      MAX_DRAFT_CAPTURE_BYTES -
      new TextEncoder().encode(JSON.stringify(draft)).length;
    for (const piece of draft.pieces) {
      if (remaining <= 0) break;
      const length = Math.min(4000, remaining + 2);
      piece.sideNotes = "a".repeat(length);
      remaining -= length - 2;
    }
    expect(remaining).toBe(0);
    expect(draftCaptureSchema.safeParse(draft).success).toBe(true);
    const first = draft.pieces[0];
    expect(first?.sideNotes).toBeTruthy();
    if (!first?.sideNotes) throw new Error("Missing boundary input");
    first.sideNotes = `ع${first.sideNotes.slice(1)}`;
    expect(new TextEncoder().encode(JSON.stringify(draft)).length).toBe(
      MAX_DRAFT_CAPTURE_BYTES + 1,
    );
    expect(draftCaptureSchema.safeParse(draft).success).toBe(false);
  });
  it.each([
    { ownerId: randomUUID() },
    { status: "DRAFT" },
    { price: "1" },
    { businessNumber: "1" },
  ])("rejects client authority %j", (extra) => {
    expect(draftCaptureSchema.safeParse({ ...blank(), ...extra }).success).toBe(
      false,
    );
  });
  it("rejects unsupported row authority and invalid captures", () => {
    for (const extra of [
      { quantity: 1 },
      { position: 1 },
      { unitPrice: "0" },
      { model: "x".repeat(201) },
      { sideNotes: "a\u0000b" },
    ]) {
      expect(
        draftCaptureSchema.safeParse({
          type: "SHOP",
          pieces: [{ id: randomUUID(), ...extra }],
        }).success,
      ).toBe(false);
    }
  });
  it("keeps unavailable finance explicit in read DTOs", () => {
    expect(
      draftSchema.safeParse({
        ...draftCaptureSchema.parse(blank()),
        total: "0",
      }).success,
    ).toBe(false);
  });
});

it("bounds captured customer cards independently of generic summary pages and rejects injected authority", () => {
  expect(customerDraftsQuerySchema.parse({})).toEqual({ page: 1, limit: 25 });
  for (const input of [
    { limit: 26 },
    { ownerId: randomUUID() },
    { customerId: randomUUID() },
    { page: ["1", "2"] },
  ])
    expect(customerDraftsQuerySchema.safeParse(input).success).toBe(false);
  const instant = "2026-11-05T00:00:00.000Z",
    piece = {
      id: randomUUID(),
      position: 1,
      quantity: 1,
      model: null,
      size: null,
      leatherBase: null,
    };
  const card = {
    id: randomUUID(),
    version: 1,
    status: "DRAFT",
    owner: { id: randomUUID(), fullName: "Owner" },
    type: "SHOP",
    customer: null,
    deliveryDate: null,
    pieceCount: 1,
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
    generalNotes: "Real notes",
    pieces: [piece],
  };
  expect(customerDraftCardSchema.parse(card).pieces).toEqual([piece]);
  expect(
    customerDraftCardSchema.safeParse({
      ...card,
      pieces: [{ ...piece, currentLocation: "warehouse" }],
    }).success,
  ).toBe(false);
});
