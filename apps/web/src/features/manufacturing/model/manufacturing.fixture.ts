import type {
  ManufacturingCommandOperation,
  ManufacturingDepartment,
} from "@template/contracts";
import {
  factoryOrderSchema,
  approvalCommandDataSchema,
  manufacturingActivityEventSchema,
  authUserDataSchema,
  manufacturingCommandDataSchema,
  manufacturingOrderDataSchema,
  type ManufacturingOrderData,
} from "@template/contracts";
import {
  orderFixture,
  p03Session,
  p03Ids,
  p03Instant,
} from "@/test/p03-fixtures";

export const manufacturingDetailFixture = (
  version = 2,
  department: ManufacturingDepartment = "CUTTING",
  inProgress = false,
): ManufacturingOrderData => {
  const source = orderFixture(version);
  const order = factoryOrderSchema.parse({
    id: source.id,
    version,
    type: source.type,
    status: "APPROVED",
    businessNumber: source.businessNumber,
    customerName: "Factory customer",
    createdAt: source.createdAt,
    deliveryDate: source.deliveryDate,
    generalNotes: source.generalNotes,
    repairNote: source.repairNote,
    adjustmentRequested: source.adjustmentRequested,
    adjustmentReason: source.adjustmentReason,
    adjustmentActionTaken: source.adjustmentActionTaken,
    counts: source.counts,
    pieces: source.pieces.map(
      ({
        catalogSelections: _catalog,
        unitPrice: _price,
        decorationEntryId: _decoration,
        catalogSourceId: _source,
        ...piece
      }) => ({
        ...piece,
        stage: department,
        workState: inProgress ? "IN_PROGRESS" : "INCOMING",
      }),
    ),
  });
  return manufacturingOrderDataSchema.parse({
    department,
    paper: { order, issues: [] },
    work: order.pieces.map((piece) => ({
      pieceId: piece.id,
      visit: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        pieceId: piece.id,
        department,
        sequence: 1,
        origin: {
          kind: "LEGACY_BASELINE",
          sourceDepartment: null,
          eventId: null,
          issueId: null,
          referenceId: null,
          correctionCycle: null,
          instructions: null,
        },
        enteredAt: null,
        receivedAt: inProgress ? p03Instant : null,
        startedAt: inProgress ? p03Instant : null,
        endedAt: null,
        receivedBy: inProgress
          ? {
              id: p03Ids.actor,
              fullName: "Original worker",
              role: "USER",
              department,
            }
          : null,
        startedBy: inProgress
          ? {
              id: p03Ids.actor,
              fullName: "Original worker",
              role: "USER",
              department,
            }
          : null,
        endedBy: null,
        endReason: null,
        destination: null,
        legacyUnknownStart: false,
      },
      lastAction: null,
      isReturned: false,
      allowedActions: {
        canReceiveAndStart: !inProgress,
        canContinue: false,
        canCompleteTransfer: inProgress,
        canReportIssue: true,
      },
    })),
  });
};

export const factorySessionFixture = (department: ManufacturingDepartment) =>
  authUserDataSchema.parse({ user: { ...p03Session().user, department } });
export const factoryWorkFixture = (
  department: ManufacturingDepartment,
  operation: ManufacturingCommandOperation,
  version = 2,
  commandId = p03Ids.command,
) =>
  manufacturingCommandDataSchema.parse({
    kind: "manufacturing-command",
    replayed: false,
    receipt: {
      commandId,
      operation,
      department,
      actor: {
        id: p03Ids.actor,
        fullName: "Factory worker",
        role: "USER",
        department,
      },
      occurredAt: p03Instant,
    },
    outcome: {
      orders: [
        {
          orderId: p03Ids.order,
          eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          beforeVersion: version,
          afterVersion: version + 1,
          pieces: [
            {
              pieceId: p03Ids.piece,
              visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              nextVisitId:
                operation === "COMPLETE_TRANSFER" && department === "CUTTING"
                  ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
                  : null,
              stage:
                operation === "COMPLETE_TRANSFER"
                  ? department === "CUTTING"
                    ? "PRODUCTION"
                    : "QUALITY"
                  : department,
              workState:
                operation === "COMPLETE_TRANSFER" ? "INCOMING" : "IN_PROGRESS",
            },
          ],
        },
      ],
    },
  });
export const factoryActivityFixture = () => {
  const result = factoryWorkFixture("CUTTING", "COMPLETE_TRANSFER"),
    order = result.outcome.orders[0];
  if (!order) throw new Error("Missing outcome");
  return manufacturingActivityEventSchema.parse({
    id: order.eventId,
    commandId: result.receipt.commandId,
    orderId: order.orderId,
    orderVersion: order.afterVersion,
    businessNumber: "SHOP-2026-0001",
    department: "CUTTING",
    operation: "COMPLETE_TRANSFER",
    actor: result.receipt.actor,
    occurredAt: result.receipt.occurredAt,
    pieces: order.pieces,
    destination: "PRODUCTION",
  });
};
export const factoryReportFixture = (version = 2, commandId = p03Ids.command) =>
  approvalCommandDataSchema.parse({
    kind: "approval-command",
    replayed: false,
    receipt: {
      commandId,
      operation: "REPORT_ISSUE",
      orderId: p03Ids.order,
      actor: {
        id: p03Ids.actor,
        fullName: "Factory worker",
        role: "USER",
        department: "CUTTING",
      },
      beforeVersion: version,
      afterVersion: version + 1,
      occurredAt: p03Instant,
    },
    outcome: {
      orderId: p03Ids.order,
      orderVersion: version + 1,
      orderStatus: "APPROVED",
      pieceId: p03Ids.piece,
      pieceStage: "CUTTING",
      pieceWorkState: "BLOCKED",
      issueId: p03Ids.source,
      issueState: "APPROVAL_REVIEW",
      proposalId: null,
    },
  });
