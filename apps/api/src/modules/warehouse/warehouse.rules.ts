import type {
  WarehouseCommandBody,
  WarehouseCommandOperation,
} from "@template/contracts";
import { WarehouseSelectionConflictError } from "./warehouse.errors.js";
import type {
  CanonicalWarehouseOrder,
  LockedWarehouseOrder,
  WarehouseOrderContextRecord,
  WarehousePhysicalPieceRecord,
} from "./warehouse.types.js";

const canonicalGroups = <
  O extends WarehouseCommandOperation,
  G extends { orderId: string; pieceIds: string[] },
>(
  operation: O,
  groups: readonly G[],
): (G & { operation: O })[] =>
  groups
    .map((group) => ({
      ...group,
      operation,
      pieceIds: [...group.pieceIds].sort(),
    }))
    .sort((a, b) => a.orderId.localeCompare(b.orderId));

export const canonicalWarehouseOrders = (
  body: WarehouseCommandBody,
): CanonicalWarehouseOrder[] => {
  switch (body.operation) {
    case "RECEIVE":
      return canonicalGroups(body.operation, body.orders);
    case "DISPATCH":
      return canonicalGroups(body.operation, body.orders);
    case "CONFIRM_DELIVERY":
      return canonicalGroups(body.operation, body.orders);
    case "FAIL_DELIVERY":
      return canonicalGroups(body.operation, body.orders);
    case "RETRY_DELIVERY":
      return canonicalGroups(body.operation, body.orders);
  }
};

type EligibilityContext = Pick<
  LockedWarehouseOrder,
  "root" | "physical" | "acceptedByPiece" | "receiptByPiece" | "latestAttempt"
>;
const unblocked = (piece: WarehousePhysicalPieceRecord) =>
  piece.issueId === null &&
  piece.cancelledAt === null &&
  piece.cancellationReason === null &&
  piece.currentWorkVisitId === null;
const incoming = (
  context: EligibilityContext,
  piece: WarehousePhysicalPieceRecord,
) => {
  const source = context.acceptedByPiece.get(piece.id);
  return (
    context.root.status === "SUBMITTED" &&
    context.root.order?.status === "APPROVED" &&
    context.root.order.approvedAt !== null &&
    piece.orderId === context.root.id &&
    piece.stage === "WAREHOUSE" &&
    piece.workState === "INCOMING" &&
    piece.receivedAt === null &&
    unblocked(piece) &&
    !context.receiptByPiece.has(piece.id) &&
    source !== undefined &&
    source.orderId === piece.orderId &&
    source.pieceId === piece.id &&
    source.decision === "ACCEPT" &&
    source.beforeStage === "QUALITY" &&
    source.afterStage === "WAREHOUSE" &&
    source.commandOrder.command.operation === "INSPECT"
  );
};
const received = (
  context: EligibilityContext,
  piece: WarehousePhysicalPieceRecord,
) => {
  const receipt = context.receiptByPiece.get(piece.id);
  return (
    piece.orderId === context.root.id &&
    piece.stage === "WAREHOUSE" &&
    piece.workState === "COMPLETED" &&
    unblocked(piece) &&
    piece.receivedAt !== null &&
    receipt !== undefined &&
    receipt.orderId === piece.orderId &&
    receipt.receivedAt.getTime() === piece.receivedAt.getTime()
  );
};
const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  new Set(a).size === a.length &&
  new Set(b).size === b.length &&
  a.every((id) => b.includes(id));
// Retained failed scope is immutable. Only its later exact cancellation sources reduce current retry membership.
const remainingAttemptIds = (context: EligibilityContext): string[] | null => {
  const attempt = context.latestAttempt;
  if (attempt === null) return [];
  const remaining: string[] = [];
  for (const member of attempt.members) {
    const physical = member.receipt.piece;
    if (physical.stage !== "CANCELLED") {
      remaining.push(member.pieceId);
      continue;
    }
    const cancelled = physical.administrationCancellation,
      failed = attempt.outcome;
    if (
      failed?.kind !== "FAILED" ||
      !failed.returnedToWarehouse ||
      cancelled === null ||
      cancelled.orderId !== context.root.id ||
      cancelled.pieceId !== member.pieceId ||
      cancelled.command.operation !== "ADMIN_CANCEL" ||
      cancelled.command.orderId !== context.root.id ||
      cancelled.command.afterVersion <= failed.commandOrder.afterVersion ||
      cancelled.command.afterVersion > context.root.version ||
      cancelled.command.occurredAt.getTime() <
        failed.commandOrder.command.occurredAt.getTime() ||
      physical.cancelledAt?.getTime() !== cancelled.command.occurredAt.getTime()
    )
      return null;
  }
  return remaining;
};
const deliveryActions = (
  context: EligibilityContext,
  fullyReceived: boolean,
) => {
  const attempt = context.latestAttempt;
  const remaining = remainingAttemptIds(context);
  const activeIds = context.physical
    .filter((piece) => piece.stage !== "CANCELLED")
    .map((piece) => piece.id);
  const eligible =
    (attempt === null ||
      (remaining !== null && sameIds(activeIds, remaining))) &&
    context.root.status === "SUBMITTED" &&
    context.root.order?.approvedAt !== null &&
    fullyReceived;
  const dispatched =
    eligible &&
    context.root.order?.status === "OUT_FOR_DELIVERY" &&
    attempt !== null &&
    attempt.outcome === null &&
    attempt.retry === null;
  return {
    canDispatch:
      eligible &&
      context.root.order?.status === "READY_FOR_DELIVERY" &&
      (attempt === null ||
        (attempt.outcome?.kind === "FAILED" &&
          attempt.outcome.returnedToWarehouse &&
          attempt.retry !== null)),
    canConfirmDelivery: dispatched,
    canFailDelivery: dispatched,
    canRetryDelivery:
      eligible &&
      context.root.order?.status === "DELIVERY_FAILED" &&
      attempt?.outcome?.kind === "FAILED" &&
      attempt.outcome.returnedToWarehouse &&
      attempt.retry === null,
  };
};
export const warehouseActionHints = (context: WarehouseOrderContextRecord) => {
  const active = context.physical.filter(
    (piece) => piece.stage !== "CANCELLED",
  );
  return deliveryActions(
    context,
    active.length > 0 &&
      active.every(
        (piece) =>
          received(context, piece) &&
          !context.openCorrectionPieceIds.has(piece.id),
      ),
  );
};
export const warehousePieceActionHints = (
  context: WarehouseOrderContextRecord,
  pieceId: string,
) => {
  const piece = context.physical.find((item) => item.id === pieceId);
  return {
    canReceive:
      piece !== undefined &&
      !context.openCorrectionPieceIds.has(pieceId) &&
      incoming(context, piece),
  };
};

export const assertWarehouseSelection = ({
  operation,
  orders,
}: {
  operation: WarehouseCommandOperation;
  orders: readonly LockedWarehouseOrder[];
}): void => {
  if (
    orders.length === 0 ||
    orders.length > 200 ||
    new Set(orders.map((order) => order.root.id)).size !== orders.length ||
    orders.reduce((total, order) => total + order.reviewed.pieceIds.length, 0) >
      200
  )
    throw new WarehouseSelectionConflictError();
  const allIds = orders.flatMap((order) => order.reviewed.pieceIds);
  if (new Set(allIds).size !== allIds.length)
    throw new WarehouseSelectionConflictError();
  for (const context of orders) {
    const { reviewed, physical, counts, latestAttempt } = context;
    let valid =
      reviewed.operation === operation &&
      reviewed.orderId === context.root.id &&
      physical.length > 0 &&
      sameIds(
        reviewed.pieceIds,
        physical.map((piece) => piece.id),
      );
    if (operation === "RECEIVE") {
      valid &&= physical.every((piece) => incoming(context, piece));
    } else {
      const full =
        counts.active > 0 &&
        counts.active === reviewed.pieceIds.length &&
        counts.received === counts.active &&
        !context.hasActiveBlocker &&
        physical.every((piece) => received(context, piece));
      const actions = deliveryActions(context, full);
      switch (reviewed.operation) {
        case "RECEIVE":
          valid = false;
          break;
        case "DISPATCH":
          valid &&= actions.canDispatch;
          valid &&=
            latestAttempt === null || latestAttempt.number < 2_147_483_647;
          break;
        case "CONFIRM_DELIVERY":
          valid &&= actions.canConfirmDelivery;
          break;
        case "FAIL_DELIVERY":
          valid &&= actions.canFailDelivery;
          break;
        case "RETRY_DELIVERY":
          valid &&= actions.canRetryDelivery;
          break;
      }
      if (reviewed.operation !== "RECEIVE" && reviewed.operation !== "DISPATCH")
        valid &&=
          latestAttempt !== null &&
          reviewed.attemptId === latestAttempt.id &&
          sameIds(
            reviewed.pieceIds,
            reviewed.operation === "RETRY_DELIVERY"
              ? (remainingAttemptIds(context) ?? [])
              : latestAttempt.members.map((member) => member.pieceId),
          );
    }
    if (!valid) throw new WarehouseSelectionConflictError();
  }
};
