import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ManufacturingCommandBody } from "@template/contracts";
import type { AuthorityAccount } from "../auth/account-authority.js";
import type { ManufacturingPieceContextRecord } from "./manufacturing.types.js";
import {
  canonicalManufacturingOrders,
  isCurrentManufacturingWork,
  isReturnedManufacturingWork,
  manufacturingActionHints,
  nextManufacturingStage,
  toManufacturingDepartment,
} from "./manufacturing.rules.js";
import { isManufacturingCommandIdConflict } from "./manufacturing.errors.js";

const worker = (department: "CUTTING" | "PRODUCTION") => ({
  id: randomUUID(),
  role: "USER" as const,
  department,
});
const incoming = (): ManufacturingPieceContextRecord => {
  const pieceId = randomUUID(),
    orderId = randomUUID(),
    visitId = randomUUID();
  return {
    orderStatus: "APPROVED",
    piece: {
      id: pieceId,
      orderId,
      stage: "CUTTING",
      workState: "INCOMING",
      issueId: null,
      receivedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      currentWorkVisitId: visitId,
    },
    visit: {
      id: visitId,
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
      enteredAt: new Date("2026-11-11T08:00:00Z"),
      receivedAt: null,
      receivedCommandId: null,
      startedAt: null,
      startedCommandId: null,
      endedAt: null,
      endReason: null,
      endManufacturingCommandId: null,
      endApprovalCommandId: null,
      endAdministrationCommandId: null,
      destination: null,
      legacyUnknownStart: false,
      receivedCommand: null,
      startedCommand: null,
      endManufacturingCommand: null,
      endApprovalCommand: null,
      endAdministrationCommand: null,
    },
    lastAction: null,
    issue: null,
  };
};
const working = (
  actor: Pick<AuthorityAccount, "id" | "role" | "department">,
): ManufacturingPieceContextRecord => {
  const record = incoming();
  const visit = record.visit;
  if (!visit) throw new Error("Expected fixture visit");
  const commandId = randomUUID(),
    occurredAt = new Date("2026-11-11T09:00:00Z");
  const snapshot = {
    actorId: actor.id,
    actorFullName: "Original worker",
    actorRole: actor.role,
    actorDepartment: actor.department,
  };
  return {
    ...record,
    piece: { ...record.piece, workState: "IN_PROGRESS" },
    visit: {
      ...visit,
      receivedAt: occurredAt,
      startedAt: occurredAt,
      receivedCommandId: commandId,
      startedCommandId: commandId,
      receivedCommand: snapshot,
      startedCommand: snapshot,
    },
    lastAction: {
      ...snapshot,
      commandId,
      eventId: randomUUID(),
      operation: "RECEIVE_AND_START",
      occurredAt,
    },
  };
};

describe("normal manufacturing route and immutable selections", () => {
  it("maps supported workspace paths and routes each department only to its normal successor", () => {
    expect(toManufacturingDepartment("cutting")).toBe("CUTTING");
    expect(toManufacturingDepartment("production")).toBe("PRODUCTION");
    expect(nextManufacturingStage("CUTTING")).toBe("PRODUCTION");
    expect(nextManufacturingStage("PRODUCTION")).toBe("QUALITY");
  });
  it("canonicalizes sets without mutating captures or silently removing duplicate pieces", () => {
    const orders: ManufacturingCommandBody["orders"] = [
      {
        orderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        expectedVersion: 2,
        pieceIds: [
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ],
      },
      {
        orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedVersion: 3,
        pieceIds: [randomUUID()],
      },
    ];
    const original = structuredClone(orders),
      sorted = canonicalManufacturingOrders(orders);
    expect(sorted.map((order) => order.orderId)).toEqual([
      orders[1]?.orderId,
      orders[0]?.orderId,
    ]);
    expect(sorted[1]?.pieceIds).toEqual(
      [...(original[0]?.pieceIds ?? [])].sort(),
    );
    expect(orders).toEqual(original);
    const pieceId = randomUUID();
    const duplicate = [
      {
        orderId: randomUUID(),
        expectedVersion: 1,
        pieceIds: [pieceId, pieceId],
      },
    ];
    expect(canonicalManufacturingOrders(duplicate)[0]?.pieceIds).toEqual([
      pieceId,
      pieceId,
    ]);
  });
});

describe("shared department work without exclusive assignment", () => {
  it("allows colleague continuation/completion/reporting while retaining the real original start", () => {
    const a = worker("CUTTING"),
      b = worker("CUTTING"),
      record = working(a);
    const before = structuredClone(record);
    expect(manufacturingActionHints(record, a, "CUTTING")).toEqual({
      canReceiveAndStart: false,
      canContinue: false,
      canCompleteTransfer: true,
      canReportIssue: true,
    });
    expect(manufacturingActionHints(record, b, "CUTTING")).toEqual({
      canReceiveAndStart: false,
      canContinue: true,
      canCompleteTransfer: true,
      canReportIssue: true,
    });
    expect(record).toEqual(before);
    const next = {
      ...record,
      lastAction:
        record.lastAction === null
          ? null
          : {
              ...record.lastAction,
              actorId: b.id,
              operation: "CONTINUE" as const,
            },
    };
    expect(manufacturingActionHints(next, a, "CUTTING").canContinue).toBe(true);
    expect(next.visit?.startedCommandId).toBe(record.visit?.startedCommandId);
    expect(
      manufacturingActionHints(record, worker("PRODUCTION"), "CUTTING")
        .canCompleteTransfer,
    ).toBe(false);
  });
  it("distinguishes incoming receipt/start from inherited work with an unknown original starter", () => {
    const actor = worker("CUTTING"),
      record = incoming();
    expect(manufacturingActionHints(record, actor, "CUTTING")).toEqual({
      canReceiveAndStart: true,
      canContinue: false,
      canCompleteTransfer: false,
      canReportIssue: true,
    });
    const visit = record.visit;
    if (!visit) throw new Error("Expected fixture visit");
    const legacy = {
      ...record,
      piece: { ...record.piece, workState: "IN_PROGRESS" as const },
      visit: {
        ...visit,
        originKind: "LEGACY_BASELINE" as const,
        sourceDepartment: null,
        sourceApprovalCommandId: null,
        enteredAt: null,
        legacyUnknownStart: true,
      },
    };
    expect(manufacturingActionHints(legacy, actor, "CUTTING")).toMatchObject({
      canContinue: true,
      canCompleteTransfer: true,
      canReceiveAndStart: false,
    });
    expect(legacy.visit.startedAt).toBeNull();
    expect(legacy.visit.startedCommand).toBeNull();
  });
  it.each([
    [
      "held",
      (record: ManufacturingPieceContextRecord) => ({
        ...record,
        piece: {
          ...record.piece,
          issueId: randomUUID(),
          workState: "BLOCKED" as const,
        },
      }),
    ],
    [
      "cancelled",
      (record: ManufacturingPieceContextRecord) => ({
        ...record,
        piece: {
          ...record.piece,
          stage: "CANCELLED" as const,
          cancelledAt: new Date(),
        },
      }),
    ],
    [
      "foreign department",
      (record: ManufacturingPieceContextRecord) => ({
        ...record,
        piece: { ...record.piece, stage: "PRODUCTION" as const },
      }),
    ],
    [
      "unapproved header",
      (record: ManufacturingPieceContextRecord) => ({
        ...record,
        orderStatus: "AWAITING_APPROVAL" as const,
      }),
    ],
    [
      "wrong pointer",
      (record: ManufacturingPieceContextRecord) => ({
        ...record,
        piece: { ...record.piece, currentWorkVisitId: randomUUID() },
      }),
    ],
    [
      "historical-only",
      (record: ManufacturingPieceContextRecord) => ({ ...record, visit: null }),
    ],
    [
      "warehouse receipt",
      (record: ManufacturingPieceContextRecord) => ({
        ...record,
        piece: { ...record.piece, receivedAt: new Date() },
      }),
    ],
  ])("denies current actions for %s", (_label, unavailable) => {
    const record = unavailable(incoming());
    expect(isCurrentManufacturingWork(record, "CUTTING")).toBe(false);
    expect(
      manufacturingActionHints(record, worker("CUTTING"), "CUTTING"),
    ).toEqual({
      canReceiveAndStart: false,
      canContinue: false,
      canCompleteTransfer: false,
      canReportIssue: false,
    });
  });
  it("shows only current source holds or released corrections as returned, excluding old history", () => {
    const record = incoming(),
      issueId = randomUUID();
    const held: ManufacturingPieceContextRecord = {
      ...record,
      piece: { ...record.piece, issueId, workState: "BLOCKED" },
      issue: {
        id: issueId,
        state: "APPROVAL_REVIEW",
        sourceDepartment: "CUTTING",
      },
    };
    expect(isReturnedManufacturingWork(held, "CUTTING")).toBe(true);
    expect(isReturnedManufacturingWork(held, "PRODUCTION")).toBe(false);
    const visit = record.visit;
    if (!visit) throw new Error("Expected fixture visit");
    const returned = {
      ...record,
      visit: {
        ...visit,
        originKind: "APPROVAL_RETURN" as const,
        sourceIssueId: issueId,
      },
    };
    expect(isReturnedManufacturingWork(returned, "CUTTING")).toBe(true);
    expect(
      isReturnedManufacturingWork(
        {
          ...returned,
          piece: {
            ...returned.piece,
            currentWorkVisitId: null,
            stage: "QUALITY",
          },
        },
        "CUTTING",
      ),
    ).toBe(false);
    expect(
      isReturnedManufacturingWork(
        { ...held, piece: { ...held.piece, stage: "CANCELLED" } },
        "CUTTING",
      ),
    ).toBe(false);
  });
});

it("recognizes only the manufacturing command primary-key race, not unrelated integrity failures", () => {
  const error = {
    code: "P2002",
    meta: {
      modelName: "ManufacturingCommand",
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["command_id"] },
        },
      },
    },
  };
  expect(isManufacturingCommandIdConflict(error)).toBe(true);
  expect(
    isManufacturingCommandIdConflict({
      ...error,
      meta: { ...error.meta, modelName: "SalesCommand" },
    }),
  ).toBe(false);
  expect(isManufacturingCommandIdConflict({ ...error, code: "P2003" })).toBe(
    false,
  );
  expect(isManufacturingCommandIdConflict(new Error("Connection lost"))).toBe(
    false,
  );
});
