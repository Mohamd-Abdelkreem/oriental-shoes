import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { FactoryTaskSpecifications } from "./factory-task-specifications";

import { qualityOrderDataSchema } from "@template/contracts";
import { resolveQualityTargets } from "../model/quality-view.model";

it("renders retained specifications without demo defaults or private order headers", () => {
  const detail = manufacturingDetailFixture();
  for (const piece of detail.paper.order.pieces) {
    piece.leatherBase = null;
    piece.decoration = null;
    piece.sole = null;
    piece.additions = null;
  }
  render(
    <FactoryTaskSpecifications source="persisted" data={detail} rows={[]} />,
  );
  expect(screen.queryByText("جلد طبيعي أسود")).not.toBeInTheDocument();
  expect(screen.queryByText("فرشة طبية")).not.toBeInTheDocument();
  expect(screen.queryByText("Frozen address")).not.toBeInTheDocument();
  expect(screen.getByText("SM")).toBeInTheDocument();
});
const id = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const qualityDetail = () => {
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

it("renders factory-safe quality data with honest unknown start and no local provider", () => {
  const data = qualityDetail(),
    rows = resolveQualityTargets(
      data,
      data.paper.order.pieces.map((piece) => ({
        orderId: data.paper.order.id,
        expectedVersion: data.paper.order.version,
        pieceId: piece.id,
      })),
    );
  render(
    <FactoryTaskSpecifications source="quality" data={data} rows={rows} />,
  );
  expect(
    screen.getByLabelText("مواصفات أمر التفصيل للمصنع"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/سعر الوحدة/)).not.toBeInTheDocument();
});
