import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "./manufacturing.fixture";
import { resolveManufacturingTargets } from "./manufacturing-view.model";
import {
  captureManufacturingSelection,
  validateManufacturingTaskSelection,
} from "./manufacturing-selection.model";
import { p03Ids } from "@/test/p03-fixtures";

it("captures exact eligible IDs and versions without quantity fallback or duplicate filtering", () => {
  const detail = manufacturingDetailFixture();
  const targets = validateManufacturingTaskSelection(detail, {
    pieceId: p03Ids.piece,
  });
  const rows = resolveManufacturingTargets(detail, targets);
  expect(
    captureManufacturingSelection("RECEIVE_AND_START", "CUTTING", rows),
  ).toEqual([
    { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
  ]);
  expect(() =>
    captureManufacturingSelection("RECEIVE_AND_START", "CUTTING", [
      ...rows,
      ...rows,
    ]),
  ).toThrow();
  expect(() =>
    captureManufacturingSelection("COMPLETE_TRANSFER", "CUTTING", rows),
  ).toThrow();
  expect(() =>
    captureManufacturingSelection("RECEIVE_AND_START", "PRODUCTION", rows),
  ).toThrow();
  expect(() =>
    captureManufacturingSelection("RECEIVE_AND_START", "CUTTING", []),
  ).toThrow();
});
it("keeps an unselected task as overview and binds legacy aliases only to actual piece/visit", () => {
  const detail = manufacturingDetailFixture();
  expect(validateManufacturingTaskSelection(detail, {})).toEqual([]);
  expect(
    validateManufacturingTaskSelection(detail, { itemId: p03Ids.piece }),
  ).toEqual(
    validateManufacturingTaskSelection(detail, {
      segmentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }),
  );
  for (const params of [
    { pieceId: p03Ids.actor },
    { segmentId: p03Ids.actor },
    { pieceId: p03Ids.piece, itemId: p03Ids.actor },
    { pieceId: p03Ids.piece, segmentId: p03Ids.actor },
  ])
    expect(() => validateManufacturingTaskSelection(detail, params)).toThrow();
});

it("rejects an aggregate selection above 200 without truncating valid piece identities", () => {
  const detail = manufacturingDetailFixture(),
    [row] = resolveManufacturingTargets(detail, [
      { orderId: p03Ids.order, expectedVersion: 2, pieceId: p03Ids.piece },
    ]);
  if (!row) throw new Error("Missing row");
  const rows = Array.from({ length: 201 }, (_, index) => {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    return {
      ...row,
      key: `${row.order.id}/${id}`,
      target: { ...row.target, pieceId: id },
      piece: { ...row.piece, id },
    };
  });
  expect(
    captureManufacturingSelection(
      "RECEIVE_AND_START",
      "CUTTING",
      rows.slice(0, 200),
    )[0]?.pieceIds,
  ).toHaveLength(200);
  expect(() =>
    captureManufacturingSelection("RECEIVE_AND_START", "CUTTING", rows),
  ).toThrow();
});
