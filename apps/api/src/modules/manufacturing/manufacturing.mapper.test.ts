import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { mapManufacturingPieceContext } from "./manufacturing.mapper.js";
import type { ManufacturingPieceContextRecord } from "./manufacturing.types.js";

const startedAt = new Date("2026-11-15T09:00:00Z"),
  endedAt = new Date("2026-11-15T10:00:00Z");
const admin: AuthorityAccount = {
  id: randomUUID(),
  email: "admin@example.test",
  fullName: "Administrator",
  phone: null,
  role: "ADMIN",
  status: "ACTIVE",
  department: null,
  accessVersion: 0,
  emailVerifiedAt: startedAt,
  staffApprovedAt: null,
  staffApprovedById: null,
  createdAt: startedAt,
  updatedAt: startedAt,
};
const starter = {
  actorId: randomUUID(),
  actorFullName: "Original cutter",
  actorRole: "USER",
  actorDepartment: "CUTTING",
} as const;
const terminal = {
  actorId: admin.id,
  actorFullName: admin.fullName,
  actorRole: admin.role,
  actorDepartment: admin.department,
};
const cancelled = (): ManufacturingPieceContextRecord => {
  const orderId = randomUUID(),
    pieceId = randomUUID();
  return {
    orderStatus: "APPROVED",
    lastAction: null,
    issue: null,
    piece: {
      id: pieceId,
      orderId,
      stage: "CANCELLED",
      workState: "BLOCKED",
      issueId: null,
      receivedAt: null,
      cancelledAt: endedAt,
      cancellationReason: "Administrative cancellation",
      currentWorkVisitId: null,
    },
    visit: {
      id: randomUUID(),
      orderId,
      pieceId,
      department: "CUTTING",
      sequence: 1,
      originKind: "INITIAL_APPROVAL",
      sourceDepartment: "APPROVAL",
      sourceApprovalCommandId: randomUUID(),
      sourceTransferEventId: null,
      sourceIssueId: null,
      sourceReferenceId: null,
      sourceCorrectionCycle: null,
      sourceOrderVersion: null,
      instructions: null,
      enteredAt: new Date("2026-11-15T08:00:00Z"),
      receivedAt: startedAt,
      receivedCommandId: randomUUID(),
      startedAt,
      startedCommandId: randomUUID(),
      endedAt,
      endReason: "CANCELLED",
      endManufacturingCommandId: null,
      endApprovalCommandId: null,
      endAdministrationCommandId: randomUUID(),
      destination: null,
      legacyUnknownStart: false,
      receivedCommand: starter,
      startedCommand: starter,
      endManufacturingCommand: null,
      endApprovalCommand: null,
      endAdministrationCommand: terminal,
    },
  };
};
it("maps the actual administration terminal actor while preserving original work and no restored actions", () => {
  const record = cancelled();
  const result = mapManufacturingPieceContext(record, admin, "CUTTING");
  expect(result.visit).toMatchObject({
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    endReason: "CANCELLED",
    startedBy: {
      id: starter.actorId,
      fullName: "Original cutter",
      role: "USER",
      department: "CUTTING",
    },
    endedBy: {
      id: admin.id,
      fullName: "Administrator",
      role: "ADMIN",
      department: null,
    },
    origin: {
      kind: "INITIAL_APPROVAL",
      eventId: record.visit?.sourceApprovalCommandId,
    },
  });
  expect(result.allowedActions).toEqual({
    canReceiveAndStart: false,
    canContinue: false,
    canCompleteTransfer: false,
    canReportIssue: false,
  });
});
it.each(["approval", "manufacturing"] as const)(
  "preserves the old %s terminal actor source",
  (kind) => {
    const record = cancelled();
    if (!record.visit) throw new Error("Expected typed retained visit");
    const visit = {
      ...record.visit,
      endAdministrationCommandId: null,
      endAdministrationCommand: null,
    };
    if (kind === "approval") {
      visit.endApprovalCommandId = randomUUID();
      visit.endApprovalCommand = terminal;
    } else {
      visit.endManufacturingCommandId = randomUUID();
      visit.endManufacturingCommand = terminal;
      visit.endReason = "TRANSFERRED";
      visit.destination = "PRODUCTION";
    }
    expect(
      mapManufacturingPieceContext({ ...record, visit }, admin, "CUTTING").visit
        ?.endedBy?.id,
    ).toBe(admin.id);
  },
);
it.each(["missing", "multiple"] as const)(
  "rejects %s terminal provenance without guessing the starter",
  (kind) => {
    const record = cancelled();
    if (!record.visit) throw new Error("Expected typed retained visit");
    const visit = { ...record.visit };
    if (kind === "missing") {
      visit.endAdministrationCommandId = null;
      visit.endAdministrationCommand = null;
    } else {
      visit.endApprovalCommandId = randomUUID();
      visit.endApprovalCommand = terminal;
    }
    expect(() =>
      mapManufacturingPieceContext({ ...record, visit }, admin, "CUTTING"),
    ).toThrow("invalid terminal provenance");
  },
);
