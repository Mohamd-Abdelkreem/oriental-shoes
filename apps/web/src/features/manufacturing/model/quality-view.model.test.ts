import { expect, it } from "vitest";
import {
  qualityOrderDataSchema,
  qualityPiecesDataSchema,
} from "@template/contracts";
import { manufacturingDetailFixture } from "./manufacturing.fixture";
import {
  freezeQualityRows,
  resolveQualityTargets,
  toQualityGroup,
  toQualityRail,
  toQualityRows,
  toQualityTracking,
  toQualityWorkSummary,
} from "./quality-view.model";

const detail = () => {
  const source = manufacturingDetailFixture(),
    paper = {
      ...source.paper,
      order: {
        ...source.paper.order,
        pieces: source.paper.order.pieces.map((piece) => ({
          ...piece,
          stage: "QUALITY",
        })),
      },
    };
  return qualityOrderDataSchema.parse({
    department: "QUALITY",
    paper,
    packingGroups: [],
    work: paper.order.pieces.map((piece) => ({
      pieceId: piece.id,
      visit: null,
      lastAction: null,
      currentCorrection: null,
      latestInspection: null,
      allowedActions: {
        canReceiveAndStart: true,
        canContinue: false,
        canInspect: false,
        canReportIssue: true,
      },
    })),
  });
};
it("resolves exact order/version/context identities and freezes confirmation without sharing mutable rows", () => {
  const data = detail(),
    piece = data.paper.order.pieces[0];
  if (!piece) throw new Error("Owned member required");
  const target = {
    orderId: data.paper.order.id,
    expectedVersion: data.paper.order.version,
    pieceId: piece.id,
  };
  const rows = resolveQualityTargets(data, [target]),
    captured = freezeQualityRows(rows);
  expect(captured).toEqual(rows);
  expect(captured).not.toBe(rows);
  expect(Object.isFrozen(captured[0]?.piece)).toBe(true);
  for (const targets of [
    [],
    [target, target],
    [{ ...target, pieceId: data.paper.order.id }],
    [{ ...target, expectedVersion: target.expectedVersion + 1 }],
    [{ ...target, orderId: piece.id }],
  ])
    expect(() => resolveQualityTargets(data, targets)).toThrow();
  const first = rows[0];
  if (!first) throw new Error("Resolved member required");
  expect(toQualityWorkSummary(first)).toContain("وارد الجودة");
  const header = rows[0]?.order;
  if (!header) throw new Error("Header required");
  const summary = {
    ...header,
    matchingPieceIds: [piece.id],
    matchingPieceCount: 1,
    lastWorkAt: null,
  };
  expect(toQualityGroup(summary, data).rows).toEqual(rows);
  expect(() =>
    toQualityGroup({ ...summary, version: header.version + 1 }, data),
  ).toThrow();
  const page = qualityPiecesDataSchema.parse({
    department: "QUALITY",
    view: "INCOMING",
    items: rows.map((row) => ({
      order: row.order,
      piece: row.piece,
      work: row.work,
    })),
    packingGroups: [],
    counts: { orders: 1, pieces: 1 },
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  expect(toQualityRows(page)).toEqual(rows);
});
it("does not turn accepted or zero-active work into physical receipt readiness or a historical rejection into a current return", () => {
  const data = detail();
  for (const piece of data.paper.order.pieces) piece.stage = "WAREHOUSE";
  expect(toQualityTracking(data)).toMatchObject({
    ready: false,
    counts: { received: 0 },
  });
  expect(toQualityRail(data)).toMatchObject({
    currentDepartment: "QUALITY",
    isReturned: false,
    countsByStage: { WAREHOUSE: data.paper.order.pieces.length },
  });
  data.paper.order.counts = {
    original: data.paper.order.pieces.length,
    active: 0,
    cancelled: data.paper.order.pieces.length,
    received: 0,
    completionPercent: 0,
  };
  for (const piece of data.paper.order.pieces) {
    piece.stage = "CANCELLED";
    piece.cancelledAt = "2026-11-12T00:00:00.000Z";
  }
  expect(toQualityTracking(data).ready).toBe(false);
  expect(toQualityRail(data).countsByStage.CANCELLED).toBe(0);
});
