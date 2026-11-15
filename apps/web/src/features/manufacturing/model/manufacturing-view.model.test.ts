import { manufacturingDetailFixture } from "./manufacturing.fixture";
import { expect, it } from "vitest";
import { manufacturingOrderHeaderSchema } from "@template/contracts";
import { p03Ids } from "@/test/p03-fixtures";
import {
  resolveManufacturingTargets,
  freezeManufacturingRows,
  toFactoryPaperLines,
  toManufacturingGroup,
  toManufacturingTracking,
  toManufacturingRail,
  toManufacturingWorkSummary,
} from "./manufacturing-view.model";

it("resolves exact physical identities and rejects the entire mismatched set", () => {
  const detail = manufacturingDetailFixture(),
    target = {
      orderId: p03Ids.order,
      expectedVersion: 2,
      pieceId: p03Ids.piece,
    };
  expect(resolveManufacturingTargets(detail, [target])[0]?.target).toEqual(
    target,
  );
  for (const targets of [
    [target, target],
    [{ ...target, expectedVersion: 1 }],
    [{ ...target, pieceId: p03Ids.actor }],
    [{ ...target, orderId: p03Ids.actor }],
  ])
    expect(() => resolveManufacturingTargets(detail, targets)).toThrow();
  const summary = {
    ...manufacturingOrderHeaderSchema.parse({
      id: detail.paper.order.id,
      version: 2,
      type: detail.paper.order.type,
      status: detail.paper.order.status,
      businessNumber: detail.paper.order.businessNumber,
      customerName: detail.paper.order.customerName,
      deliveryDate: null,
      counts: detail.paper.order.counts,
    }),
    matchingPieceIds: [target.pieceId],
    matchingPieceCount: 1,
    lastWorkAt: null,
  };
  expect(toManufacturingGroup(summary, detail).rows).toHaveLength(1);
  expect(() =>
    toManufacturingGroup({ ...summary, version: 1 }, detail),
  ).toThrow();
});
it("retains approved specifications without private money, receipt or completion inventions", () => {
  const detail = manufacturingDetailFixture();
  expect(toFactoryPaperLines(detail.paper)[0]).toMatchObject({
    id: p03Ids.piece,
    quantity: 1,
    model: "SM",
  });
  expect(toFactoryPaperLines(detail.paper)[0]).not.toHaveProperty("unitPrice");
  expect(toManufacturingTracking(detail)).toMatchObject({
    orderStatus: "APPROVED",
    ready: false,
    counts: { received: 0 },
  });
  expect(toManufacturingRail(detail).countsByStage.CUTTING).toBe(1);
});

it("distinguishes a held piece from released returned work without granting another stage actions", () => {
  const detail = manufacturingDetailFixture(),
    [row] = resolveManufacturingTargets(detail, [
      { orderId: p03Ids.order, expectedVersion: 2, pieceId: p03Ids.piece },
    ]);
  if (!row) throw new Error("Missing row");
  expect(
    toManufacturingWorkSummary({
      ...row,
      piece: { ...row.piece, workState: "BLOCKED" },
    }),
  ).toContain("موقوفة لدى الاعتماد");
  expect(
    toManufacturingWorkSummary({
      ...row,
      work: { ...row.work, isReturned: true },
    }),
  ).toContain("معادة للقسم بتعليمات معتمدة");
});

it("freezes the exact confirmation snapshot without freezing or mutating live query rows", () => {
  const source = manufacturingDetailFixture(),
    rows = resolveManufacturingTargets(source, [
      { orderId: p03Ids.order, expectedVersion: 2, pieceId: p03Ids.piece },
    ]),
    snapshot = freezeManufacturingRows(rows);
  expect(snapshot).toEqual(rows);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot[0]?.target)).toBe(true);
  expect(Object.isFrozen(snapshot[0]?.work.visit)).toBe(true);
  expect(Object.isFrozen(rows)).toBe(false);
  expect(Object.isFrozen(source.paper.order)).toBe(false);
});

it("requires current READY_FOR_DELIVERY rather than receipt equality alone", () => {
  const base = manufacturingDetailFixture();
  for (const status of [
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "DELIVERY_FAILED",
  ] as const) {
    const order = {
      ...base.paper.order,
      status,
      counts: {
        ...base.paper.order.counts,
        received: base.paper.order.counts.active,
        completionPercent: 100,
      },
    };
    expect(
      toManufacturingTracking({ ...base, paper: { ...base.paper, order } })
        .ready,
    ).toBe(status === "READY_FOR_DELIVERY");
  }
});
