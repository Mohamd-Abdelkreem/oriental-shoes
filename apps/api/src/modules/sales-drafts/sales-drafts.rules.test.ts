import { expect, it } from "vitest";
import { classifyDraftPieces } from "./sales-drafts.rules.js";

const existing = [
  { id: "P1", draftId: "D", removedAt: null },
  { id: "P2", draftId: "D", removedAt: null },
];
it("preserves retained identities through copy, removal and display reorder", () => {
  expect(classifyDraftPieces(["P3", "P1"], existing, "D")).toEqual({
    kind: "valid",
    plan: { retainedIds: ["P1"], newIds: ["P3"], removedIds: ["P2"] },
  });
  expect(existing.map((piece) => piece.id)).toEqual(["P1", "P2"]);
});
it.each([
  { submitted: ["P1", "P1"], rows: existing, kind: "duplicate" },
  {
    submitted: ["P1"],
    rows: [{ id: "P1", draftId: "OTHER", removedAt: null }],
    kind: "foreign",
  },
  {
    submitted: ["P1"],
    rows: [{ id: "P1", draftId: "D", removedAt: new Date(0) }],
    kind: "removed",
  },
])("classifies denied identity input as $kind", ({ submitted, rows, kind }) => {
  expect(classifyDraftPieces(submitted, rows, "D")).toEqual({ kind });
});
it("ignores unsubmitted historical and foreign rows when forming removal evidence", () => {
  expect(
    classifyDraftPieces(
      ["P1"],
      [
        ...existing,
        { id: "OLD", draftId: "D", removedAt: new Date(0) },
        { id: "FOREIGN", draftId: "OTHER", removedAt: null },
      ],
      "D",
    ),
  ).toEqual({
    kind: "valid",
    plan: { retainedIds: ["P1"], newIds: [], removedIds: ["P2"] },
  });
});
