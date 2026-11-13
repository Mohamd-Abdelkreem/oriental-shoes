import { isQualityTransactionConflict } from "./quality.errors.js";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { qualityCommandBodySchema } from "@template/contracts";
import type { QualityPieceContextRecord } from "./quality.types.js";
import {
  canonicalQualityOrders,
  qualityActionHints,
  qualityQueueMembership,
} from "./quality.rules.js";
import {
  mapQualityArrival,
  mapQualityCommandResult,
  mapQualityVisit,
  QUALITY_ARRIVAL_SELECT,
} from "./quality.mapper.js";
import {
  isQualityCommandIdConflict,
  QualitySelectionConflictError,
} from "./quality.errors.js";

const actor = {
  id: randomUUID(),
  role: "USER" as const,
  department: "QUALITY" as const,
};
const incoming = (): QualityPieceContextRecord => ({
  piece: {
    id: randomUUID(),
    orderId: randomUUID(),
    stage: "QUALITY",
    workState: "INCOMING",
    issueId: null,
    receivedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    currentWorkVisitId: null,
  },
  orderStatus: "APPROVED",
  visit: null,
  lastAction: null,
  correction: null,
  issue: null,
  productionArrival: null,
});
const working = () => {
  const record = incoming(),
    commandId = randomUUID(),
    occurredAt = new Date("2026-11-12T09:00:00Z");
  const command = {
    commandId,
    operation: "RECEIVE_AND_START" as const,
    actorId: actor.id,
    actorFullName: "Retained inspector",
    actorRole: actor.role,
    actorDepartment: actor.department,
    occurredAt,
  };
  return {
    ...record,
    piece: { ...record.piece, workState: "IN_PROGRESS" as const },
    lastAction: { ...command, eventId: randomUUID() },
    visit: {
      id: randomUUID(),
      orderId: record.piece.orderId,
      pieceId: record.piece.id,
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
      startedCommand: command,
      endQualityEvent: null,
      endApprovalCommand: null,
    },
  };
};
describe("quality selection and current-work rules", () => {
  it("normalizes optional text and sorts exact decisions without mutating or losing packing", () => {
    const a = randomUUID(),
      b = randomUUID();
    const body = qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: randomUUID(),
          expectedVersion: 4,
          decisions: [
            {
              pieceId: b,
              decision: "REJECT",
              target: "CUTTING",
              reason: "Wrong cut",
              instructions: "Re-cut",
            },
            { pieceId: a, decision: "ACCEPT" },
          ],
          inspectorNote: "  ",
          packing: { cartonCount: " 2 cartons " },
        },
      ],
    });
    const before = structuredClone(body),
      groups = canonicalQualityOrders(body);
    expect(groups[0]?.pieceIds).toEqual([a, b].sort());
    expect(groups[0]?.decisions?.find((d) => d.pieceId === b)).toMatchObject({
      target: "CUTTING",
      reason: "Wrong cut",
      instructions: "Re-cut",
    });
    expect(groups[0]?.inspectorNote).toBeNull();
    expect(groups[0]?.packing?.cartonCount).toBe(" 2 cartons ");
    expect(body).toEqual(before);
  });
  it("does not silently deduplicate even an internal malformed selection", () => {
    const id = randomUUID();
    expect(
      canonicalQualityOrders({
        commandId: randomUUID(),
        operation: "CONTINUE",
        orders: [
          { orderId: randomUUID(), expectedVersion: 2, pieceIds: [id, id] },
        ],
      })[0]?.pieceIds,
    ).toEqual([id, id]);
  });
  it("allows incoming start and issue reporting only", () => {
    expect(qualityActionHints(incoming(), actor)).toEqual({
      canReceiveAndStart: true,
      canContinue: false,
      canInspect: false,
      canReportIssue: true,
    });
  });
  it("allows a colleague to continue and inspect without assignment", () => {
    const record = working();
    expect(qualityActionHints(record, actor).canContinue).toBe(false);
    expect(qualityActionHints(record, { ...actor, id: randomUUID() })).toEqual({
      canReceiveAndStart: false,
      canContinue: true,
      canInspect: true,
      canReportIssue: true,
    });
  });
  it.each([
    "issue",
    "received",
    "cancelled",
    "manufacturing pointer",
    "foreign department",
    "unapproved",
  ])("withholds hints for %s", (kind) => {
    const record = incoming();
    if (kind === "issue") record.piece.issueId = randomUUID();
    if (kind === "received") record.piece.receivedAt = new Date();
    if (kind === "cancelled") record.piece.cancelledAt = new Date();
    if (kind === "manufacturing pointer")
      record.piece.currentWorkVisitId = randomUUID();
    const result = qualityActionHints(
      kind === "unapproved"
        ? { ...record, orderStatus: "AWAITING_APPROVAL" }
        : record,
      kind === "foreign department"
        ? { ...actor, department: "CUTTING" }
        : actor,
    );
    expect(Object.values(result).some(Boolean)).toBe(false);
  });
  it("keeps honest legacy unknown start and current-work identity separate from inspection history", () => {
    const record = working(),
      visit = {
        ...record.visit,
        startedAt: null,
        receivedAt: null,
        startedCommandId: null,
        startedCommand: null,
        legacyUnknownStart: true,
      };
    expect(mapQualityVisit(visit)).toMatchObject({
      startedAt: null,
      startedBy: null,
      legacyUnknownStart: true,
    });
    expect(qualityActionHints({ ...record, visit }, actor).canInspect).toBe(
      true,
    );
    expect(qualityQueueMembership({ ...record, visit }, null)).toEqual({
      incoming: false,
      inspection: true,
      accepted: false,
      corrections: false,
    });
  });
});
it("counts correction overlap independently from incoming or inspection", () => {
  const record = working(),
    command = record.visit.startedCommand;
  const correction = {
    id: randomUUID(),
    orderId: record.piece.orderId,
    pieceId: record.piece.id,
    cycle: 1,
    rejectionEventId: randomUUID(),
    target: "CUTTING" as const,
    reason: "Cut",
    instructions: "Re-cut",
    state: "OPEN" as const,
    resolvedAt: null,
    resolutionQualityEventId: null,
    resolutionApprovalCommandId: null,
    rejectionEvent: {
      id: randomUUID(),
      commandId: command.commandId,
      commandOrder: { command },
    },
  };
  expect(qualityQueueMembership({ ...record, correction }, null)).toEqual({
    incoming: false,
    inspection: true,
    accepted: false,
    corrections: true,
  });
  const incomingRecord = incoming();
  expect(
    qualityQueueMembership(
      {
        ...incomingRecord,
        correction: {
          ...correction,
          pieceId: incomingRecord.piece.id,
          orderId: incomingRecord.piece.orderId,
        },
      },
      null,
    ),
  ).toEqual({
    incoming: true,
    inspection: false,
    accepted: false,
    corrections: true,
  });
});

describe("safe quality mapping and errors", () => {
  it("takes arrival time through the real command-order relation", () => {
    const date = new Date(),
      id = randomUUID(),
      record = {
        id,
        commandId: randomUUID(),
        orderId: randomUUID(),
        pieceId: randomUUID(),
        commandOrder: { command: { occurredAt: date } },
      };
    expect(
      QUALITY_ARRIVAL_SELECT.commandOrder.select.command.select.occurredAt,
    ).toBe(true);
    expect(mapQualityArrival(record)).toEqual({
      eventId: id,
      commandId: record.commandId,
      orderId: record.orderId,
      pieceId: record.pieceId,
      occurredAt: date,
    });
  });
  it("rejects malformed retained results rather than leaking them", () => {
    expect(() =>
      mapQualityCommandResult(
        {
          commandId: randomUUID(),
          operation: "CONTINUE",
          actorId: actor.id,
          actorFullName: "Inspector",
          actorRole: actor.role,
          actorDepartment: actor.department,
          occurredAt: new Date(),
          payloadHash: "private",
          outcome: { privateFacts: true },
        },
        false,
      ),
    ).toThrow("invalid safe result");
  });
  it("recognizes only the named quality command identity uniqueness boundary", () => {
    const cause = {
      kind: "UniqueConstraintViolation",
      constraint: { fields: ["command_id"] },
    };
    expect(
      isQualityCommandIdConflict({
        code: "P2002",
        meta: { modelName: "QualityCommand", driverAdapterError: { cause } },
      }),
    ).toBe(true);
    expect(
      isQualityCommandIdConflict({
        code: "P2002",
        meta: { modelName: "ApprovalCommand", driverAdapterError: { cause } },
      }),
    ).toBe(false);
    expect(isQualityCommandIdConflict({ code: "P2004" })).toBe(false);
    expect(new QualitySelectionConflictError()).toMatchObject({
      code: "QUALITY_SELECTION_CONFLICT",
    });
  });
});

it.each([
  [{ code: "P2034" }, true],
  [
    {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
        },
      },
    },
    true,
  ],
  [
    {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { kind: "postgres", code: "40P01", originalCode: "40P01" },
        },
      },
    },
    true,
  ],
  [
    {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { kind: "postgres", code: "23514", originalCode: "23514" },
        },
      },
    },
    false,
  ],
  [
    {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { kind: "postgres", code: "40P01", originalCode: "23514" },
        },
      },
    },
    false,
  ],
  [
    {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { kind: "TransactionWriteConflict", originalCode: "55P03" },
        },
      },
    },
    false,
  ],
  [{ code: "P2028", message: "40001" }, false],
  [
    {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
        },
      },
    },
    false,
  ],
  [{ code: "P2010" }, false],
  [null, false],
])(
  "classifies only proved quality transaction-conflict metadata %j",
  (error, expected) => {
    expect(isQualityTransactionConflict(error)).toBe(expected);
  },
);
