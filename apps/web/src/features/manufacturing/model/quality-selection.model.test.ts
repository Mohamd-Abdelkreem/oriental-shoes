import { expect, it } from "vitest";
import { qualityOrderDataSchema } from "@template/contracts";
import { p03Ids } from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "./manufacturing.fixture";
import {
  resolveQualityTargets,
  type QualityWorkRow,
} from "./quality-view.model";
import {
  captureQualitySelection,
  captureQualityInspection,
  validateQualityTaskSelection,
} from "./quality-selection.model";
import type { QualityInspectionFormValues } from "./quality-form.model";

const id = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const detail = () => {
  const source = manufacturingDetailFixture(),
    piece = source.paper.order.pieces[0];
  if (!piece) throw new Error("Owned piece required");
  const pieces = Array.from({ length: 5 }, (_, i) => ({
    ...piece,
    id: id(i + 1),
    position: i + 1,
    stage: "QUALITY",
    workState: "IN_PROGRESS",
  }));
  return qualityOrderDataSchema.parse({
    department: "QUALITY",
    packingGroups: [],
    paper: {
      ...source.paper,
      order: {
        ...source.paper.order,
        counts: {
          original: 5,
          active: 5,
          cancelled: 0,
          received: 0,
          completionPercent: 0,
        },
        pieces,
      },
    },
    work: pieces.map((piece) => ({
      pieceId: piece.id,
      visit: {
        id: id(piece.position + 10),
        pieceId: piece.id,
        sequence: 1,
        originKind: "LEGACY_BASELINE",
        sourceProductionEventId: null,
        sourceCorrectionId: null,
        enteredAt: null,
        receivedAt: null,
        startedAt: null,
        startedBy: null,
        endedAt: null,
        endReason: null,
        endedBy: null,
        legacyUnknownStart: true,
      },
      lastAction: null,
      currentCorrection: null,
      latestInspection: null,
      allowedActions: {
        canReceiveAndStart: false,
        canContinue: true,
        canInspect: true,
        canReportIssue: true,
      },
    })),
  });
};
it("captures P1/P3 acceptance, P2 rejection and P4/P5 explicitly untouched without count allocation or lost text", () => {
  const data = detail(),
    rows = resolveQualityTargets(
      data,
      data.paper.order.pieces.map((piece) => ({
        orderId: data.paper.order.id,
        expectedVersion: data.paper.order.version,
        pieceId: piece.id,
      })),
    );
  const values: QualityInspectionFormValues = {
    orders: [
      {
        orderId: data.paper.order.id,
        expectedVersion: data.paper.order.version,
        inspectorNote: "  Note  ",
        cartonCount: "  اثنان / X  ",
        pieces: rows.map((row, i) => ({
          pieceId: row.piece.id,
          included: i < 3,
          decision: i === 1 ? "REJECT" : i < 3 ? "ACCEPT" : "UNDECIDED",
          target: i === 1 ? "CUTTING" : null,
          reason: i === 1 ? "Actual defect" : "",
          instructions: i === 1 ? "Actual correction" : "",
        })),
      },
    ],
  };
  const orders = captureQualityInspection(rows, values);
  expect(orders[0]?.decisions).toEqual([
    { pieceId: id(1), decision: "ACCEPT" },
    {
      pieceId: id(2),
      decision: "REJECT",
      target: "CUTTING",
      reason: "Actual defect",
      instructions: "Actual correction",
    },
    { pieceId: id(3), decision: "ACCEPT" },
  ]);
  expect(orders[0]).toMatchObject({
    inspectorNote: "  Note  ",
    packing: { cartonCount: "  اثنان / X  ", cartonNumbers: null },
  });
  const injected = structuredClone(values),
    group = injected.orders[0];
  if (!group) throw new Error("Group required");
  group.pieces[4] = {
    pieceId: p03Ids.actor,
    included: false,
    decision: "UNDECIDED",
  };
  expect(() => captureQualityInspection(rows, injected)).toThrow();
  const stale = structuredClone(values);
  if (stale.orders[0]) stale.orders[0].expectedVersion++;
  expect(() => captureQualityInspection(rows, stale)).toThrow();
  const ineligible = rows.map((row, i) =>
    i === 1
      ? {
          ...row,
          work: {
            ...row.work,
            allowedActions: { ...row.work.allowedActions, canInspect: false },
          },
        }
      : row,
  );
  expect(() => captureQualityInspection(ineligible, values)).toThrow();
});
it("rejects an entire duplicate, stale, foreign or over-200 selection and retains exact cross-order versions", () => {
  const data = detail(),
    first = data.paper.order.pieces[0];
  if (!first) throw new Error("Piece required");
  const row = resolveQualityTargets(data, [
    {
      orderId: data.paper.order.id,
      expectedVersion: data.paper.order.version,
      pieceId: first.id,
    },
  ])[0];
  if (!row) throw new Error("Row required");
  expect(captureQualitySelection("CONTINUE", [row])).toEqual([
    {
      orderId: row.order.id,
      expectedVersion: row.order.version,
      pieceIds: [row.piece.id],
    },
  ]);
  for (const rows of [
    [row, row],
    [{ ...row, target: { ...row.target, expectedVersion: 99 } }],
    [{ ...row, target: { ...row.target, pieceId: p03Ids.actor } }],
  ])
    expect(() => captureQualitySelection("CONTINUE", rows)).toThrow();
  const many = (count: number): QualityWorkRow[] =>
    Array.from({ length: count }, (_, i) => ({
      ...row,
      key: `${row.order.id}/${id(i + 1)}`,
      target: { ...row.target, pieceId: id(i + 1) },
      piece: { ...row.piece, id: id(i + 1), position: i + 1 },
      work: {
        ...row.work,
        pieceId: id(i + 1),
        visit:
          row.work.visit === null
            ? null
            : { ...row.work.visit, id: id(i + 1000), pieceId: id(i + 1) },
      },
    }));
  expect(
    captureQualitySelection("CONTINUE", many(200))[0]?.pieceIds,
  ).toHaveLength(200);
  expect(() => captureQualitySelection("CONTINUE", many(201))).toThrow();
  const other = {
    ...row,
    order: { ...row.order, id: p03Ids.actor, version: 7 },
    target: {
      ...row.target,
      orderId: p03Ids.actor,
      expectedVersion: 7,
      pieceId: p03Ids.actor,
    },
    piece: { ...row.piece, id: p03Ids.actor },
    work: {
      ...row.work,
      pieceId: p03Ids.actor,
      visit:
        row.work.visit === null
          ? null
          : { ...row.work.visit, id: p03Ids.actor, pieceId: p03Ids.actor },
    },
  };
  expect(
    captureQualitySelection("CONTINUE", [...many(199), other]).flatMap(
      (group) => group.pieceIds,
    ),
  ).toHaveLength(200);
  expect(() =>
    captureQualitySelection("CONTINUE", [...many(200), other]),
  ).toThrow();
  expect(
    captureQualitySelection("REPORT_ISSUES", [row, other])
      .map((group) => group.expectedVersion)
      .sort(),
  ).toEqual([2, 7]);
});
it("resolves only explicit matching task piece/alias/visit references and never selects a first piece", () => {
  const data = detail(),
    piece = data.paper.order.pieces[0],
    visit = data.work[0]?.visit;
  if (!piece || !visit) throw new Error("Piece/visit required");
  expect(validateQualityTaskSelection(data, {})).toEqual([]);
  expect(
    validateQualityTaskSelection(data, {
      pieceId: piece.id,
      itemId: piece.id,
      segmentId: visit.id,
    }),
  ).toEqual([
    {
      orderId: data.paper.order.id,
      expectedVersion: data.paper.order.version,
      pieceId: piece.id,
    },
  ]);
  for (const params of [
    { segmentId: visit.id },
    { pieceId: piece.id, itemId: p03Ids.actor },
    { pieceId: piece.id, segmentId: p03Ids.actor },
    { pieceId: "bad" },
    { pieceId: p03Ids.actor },
  ])
    expect(() => validateQualityTaskSelection(data, params)).toThrow();
});

it("omits an entirely untouched order with invalid hidden text without hiding foreign identity", () => {
  const data = detail(),
    first = data.paper.order.pieces[0];
  if (!first) throw new Error("Piece required");
  const row = resolveQualityTargets(data, [
    {
      orderId: data.paper.order.id,
      expectedVersion: data.paper.order.version,
      pieceId: first.id,
    },
  ])[0];
  if (!row) throw new Error("Row required");
  const other: QualityWorkRow = {
    ...row,
    order: { ...row.order, id: p03Ids.actor, version: 7 },
    target: {
      orderId: p03Ids.actor,
      pieceId: p03Ids.actor,
      expectedVersion: 7,
    },
    piece: { ...row.piece, id: p03Ids.actor },
    work: { ...row.work, pieceId: p03Ids.actor },
  };
  const values: QualityInspectionFormValues = {
    orders: [
      {
        orderId: row.order.id,
        expectedVersion: row.order.version,
        inspectorNote: "  Rejected note  ",
        cartonCount: "c".repeat(4001),
        pieces: [
          {
            pieceId: row.piece.id,
            included: true,
            decision: "REJECT",
            target: "CUTTING",
            reason: "Defect",
            instructions: "Repair",
          },
        ],
      },
      {
        orderId: other.order.id,
        expectedVersion: 7,
        inspectorNote: "\u0000".repeat(4001),
        cartonNumbers: "x".repeat(4001),
        pieces: [
          {
            pieceId: other.piece.id,
            included: false,
            decision: "REJECT",
            target: "old draft",
            reason: "r".repeat(4001),
            instructions: "\u0000",
          },
        ],
      },
    ],
  };
  expect(captureQualityInspection([row, other], values)).toEqual([
    {
      orderId: row.order.id,
      expectedVersion: row.order.version,
      inspectorNote: "  Rejected note  ",
      packing: null,
      decisions: [
        {
          pieceId: row.piece.id,
          decision: "REJECT",
          target: "CUTTING",
          reason: "Defect",
          instructions: "Repair",
        },
      ],
    },
  ]);
  const inactive = values.orders[1];
  if (!inactive?.pieces[0]) throw new Error("Inactive draft required");
  inactive.pieces[0].pieceId = p03Ids.customer;
  expect(() => captureQualityInspection([row, other], values)).toThrow();
});
