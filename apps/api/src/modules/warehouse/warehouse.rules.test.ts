import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { warehouseCommandBodySchema } from "@template/contracts";
import {
  assertWarehouseSelection,
  canonicalWarehouseOrders,
  warehouseActionHints,
  warehousePieceActionHints,
} from "./warehouse.rules.js";
import type {
  LockedWarehouseOrder,
  WarehouseOrderContextRecord,
} from "./warehouse.types.js";

const fixture = (): LockedWarehouseOrder => {
  const orderId = randomUUID(),
    pieceId = randomUUID(),
    sourceId = randomUUID();
  return {
    root: {
      id: orderId,
      status: "SUBMITTED",
      version: 7,
      order: { id: orderId, status: "APPROVED", approvedAt: new Date() },
    },
    reviewed: {
      operation: "RECEIVE",
      orderId,
      expectedVersion: 7,
      pieceIds: [pieceId],
      receipt: { cartonCount: null, storageLocation: null, notes: null },
    },
    physical: [
      {
        id: pieceId,
        orderId,
        stage: "WAREHOUSE",
        workState: "INCOMING",
        receivedAt: null,
        issueId: null,
        cancelledAt: null,
        cancellationReason: null,
        currentWorkVisitId: null,
      },
    ],
    counts: { original: 2, cancelled: 0, active: 2, received: 0 },
    hasActiveBlocker: true,
    acceptedByPiece: new Map([
      [
        pieceId,
        {
          id: sourceId,
          orderId,
          pieceId,
          commandId: randomUUID(),
          decision: "ACCEPT",
          beforeStage: "QUALITY",
          afterStage: "WAREHOUSE",
          commandOrder: {
            eventId: randomUUID(),
            afterVersion: 7,
            command: {
              operation: "INSPECT",
              occurredAt: new Date(),
              actorId: randomUUID(),
              actorFullName: "Quality",
              actorRole: "USER",
              actorDepartment: "QUALITY",
            },
          },
        },
      ],
    ]),
    receiptByPiece: new Map(),
    latestAttempt: null,
  };
};
const readContext = (
  locked: LockedWarehouseOrder,
): WarehouseOrderContextRecord => ({
  root: {
    ...locked.root,
    createdAt: new Date(),
    updatedAt: new Date(),
    type: "SHOP",
    deliveryDate: null,
    generalNotes: null,
    repairNote: null,
    adjustmentRequested: null,
    adjustmentReason: null,
    adjustmentActionTaken: null,
    pieces: [],
    order:
      locked.root.order === null
        ? null
        : {
            ...locked.root.order,
            businessNumber: "SHOP-2026-0001",
            customerName: "Submitted name",
            customerPhone: "123",
            customerAddress: "Submitted address",
            administrationCorrections: [],
          },
  },
  physical: locked.physical,
  acceptedByPiece: locked.acceptedByPiece,
  receiptByPiece: locked.receiptByPiece,
  latestAttempt: locked.latestAttempt,
  receiptGroups: [],
  qualityPackingGroups: [],
  issueInstructions: [],
  openCorrectionPieceIds: new Set(),
  lastActionAt: null,
});
const ready = (): LockedWarehouseOrder => {
  const incoming = fixture(),
    timestamp = new Date();
  return {
    ...incoming,
    root: {
      ...incoming.root,
      order: {
        id: incoming.root.id,
        status: "READY_FOR_DELIVERY",
        approvedAt: timestamp,
      },
    },
    reviewed: {
      operation: "DISPATCH",
      orderId: incoming.root.id,
      expectedVersion: 7,
      pieceIds: [...incoming.reviewed.pieceIds],
      deliveryNote: null,
    },
    counts: { original: 2, cancelled: 1, active: 1, received: 1 },
    hasActiveBlocker: false,
    physical: incoming.physical.map((piece) => ({
      ...piece,
      workState: "COMPLETED",
      receivedAt: timestamp,
    })),
    receiptByPiece: new Map(
      incoming.physical.map((piece) => [
        piece.id,
        {
          pieceId: piece.id,
          orderId: piece.orderId,
          origin: "LEGACY_BASELINE",
          groupId: null,
          qualityEventId: null,
          receivedAt: timestamp,
        },
      ]),
    ),
  };
};
it("canonicalizes scope without losing normalized captures or silently deduplicating", () => {
  const groups = [fixture().reviewed, fixture().reviewed];
  const body = warehouseCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "RECEIVE",
    orders: groups
      .map(({ operation: _operation, ...group }) => ({
        ...group,
        pieceIds: [...group.pieceIds, randomUUID()],
        receipt: {
          cartonCount: " 2 ",
          storageLocation: " B-12 ",
          notes: "   ",
        },
      }))
      .reverse(),
  });
  const canonical = canonicalWarehouseOrders(body);
  expect(canonical.map((group) => group.orderId)).toEqual(
    body.orders.map((group) => group.orderId).sort(),
  );
  for (const group of canonical) {
    expect(group.pieceIds).toEqual([...group.pieceIds].sort());
    expect(group).toMatchObject({
      operation: "RECEIVE",
      receipt: { cartonCount: " 2 ", storageLocation: " B-12 ", notes: null },
    });
  }
  const original = fixture();
  if (original.reviewed.operation !== "RECEIVE")
    throw new Error("Receipt fixture expected");
  const malformed = {
    ...original.reviewed,
    pieceIds: [...original.reviewed.pieceIds, ...original.reviewed.pieceIds],
  };
  expect(
    canonicalWarehouseOrders({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [malformed],
    })[0]?.pieceIds,
  ).toHaveLength(2);
});
it("permits an eligible partial arrival while another active piece remains held", () => {
  const context = fixture();
  expect(() => {
    assertWarehouseSelection({ operation: "RECEIVE", orders: [context] });
  }).not.toThrow();
  expect(
    warehousePieceActionHints(
      readContext(context),
      context.reviewed.pieceIds[0] ?? "",
    ),
  ).toEqual({ canReceive: true });
  expect(warehouseActionHints(readContext(context)).canDispatch).toBe(false);
  expect(
    warehousePieceActionHints(
      {
        ...readContext(context),
        openCorrectionPieceIds: new Set(context.reviewed.pieceIds),
      },
      context.reviewed.pieceIds[0] ?? "",
    ),
  ).toEqual({ canReceive: false });
});
it("rejects missing source, duplicate scope and any ineligible member with the selection conflict code", () => {
  const context = fixture();
  const cases: LockedWarehouseOrder[] = [
    { ...context, acceptedByPiece: new Map() },
    {
      ...context,
      reviewed: {
        ...context.reviewed,
        pieceIds: [...context.reviewed.pieceIds, ...context.reviewed.pieceIds],
      },
    },
    {
      ...context,
      physical: context.physical.map((piece) => ({
        ...piece,
        issueId: randomUUID(),
      })),
    },
    {
      ...context,
      physical: context.physical.map((piece) => ({
        ...piece,
        currentWorkVisitId: randomUUID(),
      })),
    },
    { ...context, root: { ...context.root, status: "DRAFT" } },
  ];
  for (const invalid of cases) {
    try {
      assertWarehouseSelection({ operation: "RECEIVE", orders: [invalid] });
      throw new Error("Expected conflict");
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 409,
        code: "WAREHOUSE_SELECTION_CONFLICT",
      });
    }
  }
});
it("requires a positive whole active scope and matching immutable receipts to dispatch", () => {
  const context = ready();
  expect(() => {
    assertWarehouseSelection({ operation: "DISPATCH", orders: [context] });
  }).not.toThrow();
  expect(warehouseActionHints(readContext(context))).toEqual({
    canDispatch: true,
    canConfirmDelivery: false,
    canFailDelivery: false,
    canRetryDelivery: false,
  });
  for (const invalid of [
    { ...context, counts: { ...context.counts, active: 2 } },
    { ...context, counts: { ...context.counts, active: 0, received: 0 } },
    { ...context, hasActiveBlocker: true },
    { ...context, receiptByPiece: new Map() },
  ])
    expect(() => {
      assertWarehouseSelection({ operation: "DISPATCH", orders: [invalid] });
    }).toThrow();
});

it("binds delivery outcomes and retry to the unresolved latest whole-order attempt", () => {
  const base = ready(),
    attemptId = randomUUID(),
    outcomeId = randomUUID();
  const stamp = {
    actorId: randomUUID(),
    actorFullName: "Warehouse",
    actorRole: "USER" as const,
    actorDepartment: "WAREHOUSE" as const,
    occurredAt: new Date(),
  };
  const attempt = {
    id: attemptId,
    orderId: base.root.id,
    number: 1,
    commandId: randomUUID(),
    deliveryNote: null,
    predecessorRetryId: null,
    commandOrder: { command: stamp },
    members: base.reviewed.pieceIds.map((pieceId) => ({
      pieceId,
      receipt: {
        piece: {
          stage: "WAREHOUSE" as const,
          cancelledAt: null,
          administrationCancellation: null,
        },
      },
    })),
    outcome: null,
    retry: null,
  };
  const dispatched: LockedWarehouseOrder = {
    ...base,
    root: {
      ...base.root,
      order: {
        id: base.root.id,
        status: "OUT_FOR_DELIVERY",
        approvedAt: new Date(),
      },
    },
    latestAttempt: attempt,
    reviewed: {
      operation: "CONFIRM_DELIVERY",
      orderId: base.root.id,
      expectedVersion: 7,
      pieceIds: [...base.reviewed.pieceIds],
      attemptId,
      recipient: null,
      deliveredAt: null,
      notes: null,
    },
  };
  expect(() => {
    assertWarehouseSelection({
      operation: "CONFIRM_DELIVERY",
      orders: [dispatched],
    });
  }).not.toThrow();
  expect(warehouseActionHints(readContext(dispatched))).toMatchObject({
    canConfirmDelivery: true,
    canFailDelivery: true,
    canDispatch: false,
    canRetryDelivery: false,
  });
  expect(() => {
    assertWarehouseSelection({
      operation: "CONFIRM_DELIVERY",
      orders: [
        { ...dispatched, latestAttempt: { ...attempt, id: randomUUID() } },
      ],
    });
  }).toThrow();
  expect(() => {
    assertWarehouseSelection({
      operation: "CONFIRM_DELIVERY",
      orders: [{ ...dispatched, latestAttempt: { ...attempt, members: [] } }],
    });
  }).toThrow();
  const failed: LockedWarehouseOrder = {
    ...dispatched,
    root: {
      ...base.root,
      order: {
        id: base.root.id,
        status: "DELIVERY_FAILED",
        approvedAt: new Date(),
      },
    },
    latestAttempt: {
      ...attempt,
      outcome: {
        id: outcomeId,
        attemptId,
        orderId: base.root.id,
        commandId: randomUUID(),
        kind: "FAILED",
        recipient: null,
        deliveredAt: null,
        reason: "Entire order returned",
        notes: null,
        returnedToWarehouse: true,
        commandOrder: { command: stamp, afterVersion: 6 },
      },
    },
    reviewed: {
      operation: "RETRY_DELIVERY",
      orderId: base.root.id,
      expectedVersion: 7,
      pieceIds: [...base.reviewed.pieceIds],
      attemptId,
      retryDate: null,
      notes: null,
    },
  };
  expect(() => {
    assertWarehouseSelection({ operation: "RETRY_DELIVERY", orders: [failed] });
  }).not.toThrow();
  expect(warehouseActionHints(readContext(failed))).toMatchObject({
    canDispatch: false,
    canConfirmDelivery: false,
    canRetryDelivery: true,
  });
  expect(() => {
    assertWarehouseSelection({
      operation: "DISPATCH",
      orders: [{ ...failed, reviewed: base.reviewed }],
    });
  }).toThrow();
  if (failed.latestAttempt === null) throw new Error("Failed attempt expected");
  const retried = {
    ...failed,
    root: base.root,
    reviewed: base.reviewed,
    latestAttempt: {
      ...failed.latestAttempt,
      retry: {
        id: randomUUID(),
        attemptId,
        orderId: base.root.id,
        outcomeId,
        commandId: randomUUID(),
        retryDate: null,
        notes: null,
        commandOrder: { command: stamp },
      },
    },
  };
  expect(() => {
    assertWarehouseSelection({ operation: "DISPATCH", orders: [retried] });
  }).not.toThrow();
  expect(warehouseActionHints(readContext(retried)).canDispatch).toBe(true);
  expect(() => {
    assertWarehouseSelection({
      operation: "RETRY_DELIVERY",
      orders: [{ ...retried, reviewed: failed.reviewed }],
    });
  }).toThrow();
});

it("reduces failed retry membership only with exact later cancellation provenance and keeps current hints consistent", () => {
  const base = ready(),
    attemptId = randomUUID(),
    cancelledId = randomUUID(),
    outcomeId = randomUUID(),
    at = new Date(),
    cancelledAt = new Date(at.getTime() + 1);
  const stamp = {
    actorId: randomUUID(),
    actorFullName: "Warehouse",
    actorRole: "USER" as const,
    actorDepartment: "WAREHOUSE" as const,
    occurredAt: at,
  };
  const cancelled = {
    pieceId: cancelledId,
    receipt: {
      piece: {
        stage: "CANCELLED" as const,
        cancelledAt,
        administrationCancellation: {
          commandId: randomUUID(),
          orderId: base.root.id,
          pieceId: cancelledId,
          command: {
            operation: "ADMIN_CANCEL" as const,
            orderId: base.root.id,
            afterVersion: 7,
            occurredAt: cancelledAt,
          },
        },
      },
    },
  };
  const latestAttempt: NonNullable<LockedWarehouseOrder["latestAttempt"]> = {
    id: attemptId,
    orderId: base.root.id,
    number: 1,
    commandId: randomUUID(),
    deliveryNote: null,
    predecessorRetryId: null,
    commandOrder: { command: stamp },
    members: [
      ...base.reviewed.pieceIds.map((pieceId) => ({
        pieceId,
        receipt: {
          piece: {
            stage: "WAREHOUSE" as const,
            cancelledAt: null,
            administrationCancellation: null,
          },
        },
      })),
      cancelled,
    ],
    outcome: {
      id: outcomeId,
      attemptId,
      orderId: base.root.id,
      commandId: randomUUID(),
      kind: "FAILED",
      recipient: null,
      deliveredAt: null,
      reason: "Whole attempt returned",
      notes: null,
      returnedToWarehouse: true,
      commandOrder: { command: stamp, afterVersion: 6 },
    },
    retry: null,
  };
  const failed: LockedWarehouseOrder = {
    ...base,
    root: {
      ...base.root,
      order: { id: base.root.id, status: "DELIVERY_FAILED", approvedAt: at },
    },
    counts: { ...base.counts, original: 2, cancelled: 1 },
    latestAttempt,
    reviewed: {
      operation: "RETRY_DELIVERY",
      orderId: base.root.id,
      expectedVersion: 7,
      pieceIds: [...base.reviewed.pieceIds],
      attemptId,
      retryDate: null,
      notes: null,
    },
  };
  expect(() => {
    assertWarehouseSelection({ operation: "RETRY_DELIVERY", orders: [failed] });
  }).not.toThrow();
  expect(warehouseActionHints(readContext(failed)).canRetryDelivery).toBe(true);
  for (const member of [
    {
      ...cancelled,
      receipt: {
        piece: { ...cancelled.receipt.piece, administrationCancellation: null },
      },
    },
    {
      ...cancelled,
      receipt: {
        piece: {
          ...cancelled.receipt.piece,
          administrationCancellation: {
            ...cancelled.receipt.piece.administrationCancellation,
            command: {
              ...cancelled.receipt.piece.administrationCancellation.command,
              afterVersion: 6,
            },
          },
        },
      },
    },
    {
      ...cancelled,
      receipt: {
        piece: {
          ...cancelled.receipt.piece,
          administrationCancellation: {
            ...cancelled.receipt.piece.administrationCancellation,
            orderId: randomUUID(),
          },
        },
      },
    },
    {
      ...cancelled,
      receipt: {
        piece: { ...cancelled.receipt.piece, stage: "WAREHOUSE" as const },
      },
    },
  ]) {
    const invalid = {
      ...failed,
      latestAttempt: {
        ...latestAttempt,
        members: [
          ...latestAttempt.members.filter((m) => m.pieceId !== cancelledId),
          member,
        ],
      },
    };
    expect(() => {
      assertWarehouseSelection({
        operation: "RETRY_DELIVERY",
        orders: [invalid],
      });
    }).toThrow(
      expect.objectContaining({ code: "WAREHOUSE_SELECTION_CONFLICT" }),
    );
    expect(warehouseActionHints(readContext(invalid)).canRetryDelivery).toBe(
      false,
    );
  }
  expect(latestAttempt.members.map((m) => m.pieceId)).toContain(cancelledId);
});
