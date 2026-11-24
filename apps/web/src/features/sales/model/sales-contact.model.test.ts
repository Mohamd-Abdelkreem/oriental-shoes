import { expect, it } from "vitest";
import { orderFixture, p03Ids } from "@/test/p03-fixtures";
import {
  salesContactFormSchema,
  toContactChanges,
  toSubmitContactBody,
} from "./sales-contact.model";

const current = () => {
  const piece = orderFixture().pieces[0];
  if (!piece) throw new Error("Missing piece");
  return piece;
};
const values = () =>
  salesContactFormSchema.parse({
    model: null,
    size: null,
    leatherBase: null,
    sole: null,
    contactNotes: "Customer confirmed the requested size",
  });
const base = { commandId: p03Ids.command, expectedVersion: 2 };
it("sends only dirty changed UUIDs and preserves frozen terms rather than source labels or prices", () => {
  const piece = current(),
    before = structuredClone(piece);
  const body = toSubmitContactBody(
    { ...values(), size: p03Ids.customer, model: p03Ids.source },
    { size: true },
    piece,
    base,
    "AMEND",
  );
  expect(body).toEqual({
    ...base,
    kind: "AMEND",
    contactNotes: values().contactNotes,
    changes: { size: p03Ids.customer },
  });
  expect(piece).toEqual(before);
});
it("allows notes-only confirmation and explicit optional-floor clearing even without a prior catalog reference", () => {
  const piece = {
    ...current(),
    sole: "Retained floor label",
    catalogSelections: { sole: null },
  };
  expect(toContactChanges(values(), {}, piece)).toEqual({});
  expect(toContactChanges(values(), { sole: true }, piece)).toEqual({
    sole: null,
  });
  expect(toSubmitContactBody(values(), {}, piece, base, "AMEND")).toEqual({
    ...base,
    kind: "AMEND",
    contactNotes: values().contactNotes,
    changes: {},
  });
});
it.each(["model", "size", "leatherBase"] as const)(
  "rejects an explicit required %s clear",
  (field) => {
    expect(() =>
      toContactChanges(values(), { [field]: true }, current()),
    ).toThrow();
  },
);
it("submits a cancellation request without applying even a dirty invalid amendment", () => {
  expect(
    toSubmitContactBody(
      values(),
      { model: true, size: true, sole: true },
      current(),
      base,
      "CANCEL_REQUEST",
    ),
  ).toEqual({
    ...base,
    kind: "CANCEL_REQUEST",
    contactNotes: values().contactNotes,
  });
});
it("keeps the form allowlist and contact-note bounds strict", () => {
  expect(
    salesContactFormSchema.safeParse({ ...values(), pieceId: p03Ids.source })
      .success,
  ).toBe(false);
  expect(
    salesContactFormSchema.safeParse({ ...values(), contactNotes: " " })
      .success,
  ).toBe(false);
  expect(
    salesContactFormSchema.safeParse({
      ...values(),
      contactNotes: "x".repeat(4001),
    }).success,
  ).toBe(false);
});
