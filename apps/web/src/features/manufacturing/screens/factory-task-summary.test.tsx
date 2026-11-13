import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { resolveManufacturingTargets } from "../model/manufacturing-view.model";
import { p03Ids } from "@/test/p03-fixtures";
import { FactoryTaskSummary } from "./factory-task-summary";

import { qualityOrderDataSchema } from "@template/contracts";
import { resolveQualityTargets } from "../model/quality-view.model";

it("distinguishes the original start from later actual workers and honest unknown time", () => {
  const detail = manufacturingDetailFixture(2, "CUTTING", true),
    work = detail.work[0];
  if (!work) throw new Error("Missing work");
  work.lastAction = {
    eventId: p03Ids.source,
    commandId: p03Ids.command,
    operation: "CONTINUE",
    actor: {
      id: p03Ids.customer,
      fullName: "Colleague B",
      role: "USER",
      department: "CUTTING",
    },
    occurredAt: "2026-11-11T10:00:00.000Z",
  };
  const targets = [
    { orderId: p03Ids.order, expectedVersion: 2, pieceId: p03Ids.piece },
  ];
  const view = render(
    <FactoryTaskSummary
      source="persisted"
      data={detail}
      rows={resolveManufacturingTargets(detail, targets)}
    />,
  );
  expect(screen.getByText(/بدأ العمل: Original worker/u)).toBeInTheDocument();
  expect(screen.getByText(/آخر منفذ فعلي: Colleague B/u)).toBeInTheDocument();
  const legacy = manufacturingDetailFixture();
  view.rerender(
    <FactoryTaskSummary
      source="persisted"
      data={legacy}
      rows={resolveManufacturingTargets(legacy, targets)}
    />,
  );
  expect(screen.getByText(/وقت البدء غير مسجل/u)).toBeInTheDocument();
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
  render(<FactoryTaskSummary source="quality" data={data} rows={rows} />);
  expect(screen.getAllByText(/وقت البدء غير مسجل/)).toHaveLength(5);
  expect(screen.getByText(/المستلم فعلياً: 0/)).toBeInTheDocument();
});
