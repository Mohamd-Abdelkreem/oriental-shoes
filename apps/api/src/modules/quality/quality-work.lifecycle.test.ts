import { randomUUID } from "node:crypto";
import { createDatabaseClient, Prisma } from "@template/database";
import { afterEach, expect, it, vi } from "vitest";
import {
  startQualityVisit,
  endQualityVisitForIssue,
  cancelQualityCorrection,
} from "./quality-work.lifecycle.js";

const db = createDatabaseClient(
  "postgresql://synthetic:unused@127.0.0.1:1/never_connected",
);
afterEach(async () => {
  vi.restoreAllMocks();
  await db.$disconnect();
});
const orderId = randomUUID(),
  pieceId = randomUUID(),
  commandId = randomUUID(),
  occurredAt = new Date("2026-11-12T09:00:00Z");
const physical = () => ({
  id: pieceId,
  orderId,
  decorationEntryId: randomUUID(),
  priceSourceId: randomUUID(),
  decorationLabel: "Synthetic",
  unitPrice: new Prisma.Decimal(1),
  priceSourceCell: "A1",
  stage: "QUALITY" as const,
  workState: "INCOMING" as const,
  issueId: null,
  receivedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  currentWorkVisitId: null,
});
const visit = () => ({
  id: randomUUID(),
  orderId,
  pieceId,
  sequence: 1,
  originKind: "LEGACY_BASELINE" as const,
  sourceProductionEventId: null,
  sourceCorrectionId: null,
  enteredAt: null,
  receivedAt: occurredAt,
  startedAt: occurredAt,
  startedCommandId: commandId,
  endedAt: null,
  endReason: null,
  endQualityEventId: null,
  endApprovalCommandId: null,
  legacyUnknownStart: false,
});
const issue = (sourceWorkState: "INCOMING" | "IN_PROGRESS") => ({
  id: randomUUID(),
  orderId,
  pieceId,
  cycle: 1,
  state: "APPROVAL_REVIEW" as const,
  sourceDepartment: "QUALITY" as const,
  sourceStage: "QUALITY" as const,
  sourceWorkState,
  reporterId: randomUUID(),
  reporterFullName: "Inspector",
  reporterRole: "ADMIN" as const,
  reporterDepartment: null,
  reason: "Problem",
  notes: null,
  reportedAt: occurredAt,
  updatedAt: occurredAt,
  reportedCommandId: commandId,
  resumeTarget: null,
  latestProposalId: null,
  resolvedAt: null,
  resolutionCommandId: null,
});
it.each([false, true])(
  "starts real work with truthful arrival presence %s and a real current start",
  async (witnessed) => {
    // Prisma is the external boundary here; durable graph proof belongs to migrated producer integrations.
    vi.spyOn(db.salesOrderPiece, "findFirst").mockResolvedValue(physical());
    vi.spyOn(db.qualityWorkVisit, "findFirst").mockResolvedValue(null);
    vi.spyOn(db.qualityWorkVisit, "aggregate").mockResolvedValue({
      _count: { _all: 1 },
      _avg: { sequence: 1 },
      _sum: { sequence: 1 },
      _min: visit(),
      _max: visit(),
    });
    const retained = visit();
    const create = vi
      .spyOn(db.qualityWorkVisit, "create")
      .mockResolvedValue(retained);
    const arrival = witnessed
      ? {
          eventId: randomUUID(),
          commandId: randomUUID(),
          orderId,
          pieceId,
          occurredAt: new Date("2026-11-12T08:00:00Z"),
        }
      : null;
    expect(
      await startQualityVisit(db, {
        orderId,
        pieceId,
        commandId,
        occurredAt,
        productionArrival: arrival,
        correctionId: null,
      }),
    ).toEqual({ visitId: retained.id });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      sequence: 2,
      originKind: witnessed ? "PRODUCTION_ARRIVAL" : "LEGACY_BASELINE",
      sourceProductionEventId: arrival?.eventId ?? null,
      enteredAt: arrival?.occurredAt ?? null,
      startedAt: occurredAt,
      receivedAt: occurredAt,
      startedCommandId: commandId,
      legacyUnknownStart: false,
    });
  },
);
it.each(["INCOMING", "IN_PROGRESS"] as const)(
  "interrupts %s quality with its actual report witness",
  async (state) => {
    const report = issue(state),
      open = state === "IN_PROGRESS" ? visit() : null;
    vi.spyOn(db.salesOrderPiece, "findFirst").mockResolvedValue({
      ...physical(),
      workState: "BLOCKED",
      issueId: report.id,
    });
    vi.spyOn(db.manufacturingIssue, "findFirst").mockResolvedValue(report);
    vi.spyOn(db.qualityWorkVisit, "findFirst").mockResolvedValue(open);
    const update = vi
      .spyOn(db.qualityWorkVisit, "updateMany")
      .mockResolvedValue({ count: 1 });
    expect(
      await endQualityVisitForIssue(db, {
        orderId,
        pieceId,
        approvalCommandId: commandId,
        occurredAt,
      }),
    ).toEqual({ visitId: open?.id ?? null });
    if (open)
      expect(update.mock.calls[0]?.[0].data).toMatchObject({
        endedAt: occurredAt,
        endReason: "ISSUE_REPORTED",
        endApprovalCommandId: commandId,
      });
    else expect(update.mock.calls[0]).toBeUndefined();
  },
);
it("refuses a missing inspection visit rather than treating it as incoming", async () => {
  const report = issue("IN_PROGRESS");
  vi.spyOn(db.salesOrderPiece, "findFirst").mockResolvedValue({
    ...physical(),
    workState: "BLOCKED",
    issueId: report.id,
  });
  vi.spyOn(db.manufacturingIssue, "findFirst").mockResolvedValue(report);
  vi.spyOn(db.qualityWorkVisit, "findFirst").mockResolvedValue(null);
  await expect(
    endQualityVisitForIssue(db, {
      orderId,
      pieceId,
      approvalCommandId: commandId,
      occurredAt,
    }),
  ).rejects.toThrow("no matching open visit");
});
it("leaves ordinary P04 cancellation without a correction cycle as a no-op", async () => {
  vi.spyOn(db.salesOrderPiece, "findFirst").mockResolvedValue({
    ...physical(),
    stage: "CANCELLED",
    workState: "BLOCKED",
    cancelledAt: occurredAt,
    cancellationReason: "Requested",
  });
  vi.spyOn(db.qualityWorkVisit, "findFirst").mockResolvedValue(null);
  vi.spyOn(db.qualityCorrectionCycle, "findFirst").mockResolvedValue(null);
  await expect(
    cancelQualityCorrection(db, {
      orderId,
      pieceId,
      approvalCommandId: commandId,
      occurredAt,
    }),
  ).resolves.toBeUndefined();
});
