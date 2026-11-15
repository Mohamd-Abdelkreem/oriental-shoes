import {
  warehouseCommandBodySchema,
  warehouseOrderDataSchema,
  type WarehouseOrderData,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";
import {
  freezeWarehouseReview,
  resolveWarehouseTargets,
  type WarehouseWorkRow,
  type WarehousePieceTarget,
  type WarehouseReceiptSelection,
  type WarehouseWholeOrderOperation,
  type WarehouseWholeOrderReview,
  type WarehouseReview,
} from "./warehouse-view.model";

const validationCommandId = "00000000-0000-4000-8000-000000000000";
export const captureWarehouseReceipt = (
  rows: readonly WarehouseWorkRow[],
): WarehouseReceiptSelection => {
  const groups = new Map<
    string,
    { orderId: string; expectedVersion: number; pieceIds: string[] }
  >();
  for (const row of rows) {
    if (
      row.target.orderId !== row.order.id ||
      row.target.expectedVersion !== row.order.version ||
      row.target.pieceId !== row.piece.id ||
      row.work.pieceId !== row.piece.id ||
      !row.work.allowedActions.canReceive ||
      row.order.status !== "APPROVED" ||
      row.piece.stage !== "WAREHOUSE" ||
      row.piece.workState !== "INCOMING" ||
      row.piece.receivedAt !== null ||
      row.piece.cancelledAt !== null ||
      row.piece.cancellationReason !== null ||
      row.work.acceptedHandoff === null ||
      row.work.receivedAt !== null ||
      row.work.receiptGroupId !== null ||
      row.work.legacyReceipt
    )
      throw new ApiContractError();
    const group = groups.get(row.order.id);
    if (group) {
      if (group.expectedVersion !== row.target.expectedVersion)
        throw new ApiContractError();
      group.pieceIds.push(row.piece.id);
    } else
      groups.set(row.order.id, {
        orderId: row.order.id,
        expectedVersion: row.order.version,
        pieceIds: [row.piece.id],
      });
  }
  const orders = [...groups.values()]
    .sort((a, b) => a.orderId.localeCompare(b.orderId))
    .map((group) => ({ ...group, pieceIds: group.pieceIds.toSorted() }));
  warehouseCommandBodySchema.parse({
    commandId: validationCommandId,
    operation: "RECEIVE",
    orders,
  });
  return freezeWarehouseReview({ operation: "RECEIVE", orders, rows });
};
const assertWholeOrder = (
  operation: WarehouseWholeOrderOperation,
  detail: WarehouseOrderData,
): void => {
  const actions = detail.summary.allowedActions;
  const permitted =
    operation === "DISPATCH"
      ? actions.canDispatch
      : operation === "CONFIRM_DELIVERY"
        ? actions.canConfirmDelivery
        : operation === "FAIL_DELIVERY"
          ? actions.canFailDelivery
          : actions.canRetryDelivery;
  const active = detail.paper.order.pieces.filter(
    (piece) => piece.stage !== "CANCELLED",
  );
  if (
    !permitted ||
    active.length === 0 ||
    active.some(
      (piece) =>
        piece.receivedAt === null ||
        piece.workState !== "COMPLETED" ||
        piece.stage !== "WAREHOUSE",
    )
  )
    throw new ApiContractError();
  if (operation !== "DISPATCH") {
    const attempt = detail.currentAttempt;
    if (
      attempt === null ||
      attempt.id !== detail.summary.currentAttemptId ||
      attempt.pieceIds.length !== active.length ||
      !active.every((piece) => attempt.pieceIds.includes(piece.id))
    )
      throw new ApiContractError();
  }
};
export const captureWarehouseWholeOrders = (
  operation: WarehouseWholeOrderOperation,
  input: readonly WarehouseOrderData[],
  selected: readonly WarehousePieceTarget[],
): WarehouseWholeOrderReview => {
  const details = input.map((detail) => warehouseOrderDataSchema.parse(detail)),
    orderIds = new Set(selected.map((target) => target.orderId));
  if (
    selected.length === 0 ||
    selected.length > 200 ||
    new Set(selected.map((target) => target.pieceId)).size !==
      selected.length ||
    details.length !== orderIds.size ||
    new Set(details.map((detail) => detail.summary.id)).size !== details.length
  )
    throw new ApiContractError();
  const orders = details
    .map((detail) => {
      const targets = selected.filter(
        (target) => target.orderId === detail.summary.id,
      );
      const rows = resolveWarehouseTargets(detail, targets);
      if (rows.some((row) => row.piece.stage === "CANCELLED"))
        throw new ApiContractError();
      assertWholeOrder(operation, detail);
      return {
        orderId: detail.summary.id,
        expectedVersion: detail.summary.version,
        pieceIds: detail.paper.order.pieces
          .filter((piece) => piece.stage !== "CANCELLED")
          .map((piece) => piece.id)
          .toSorted(),
        attemptId: detail.summary.currentAttemptId,
        detail,
      };
    })
    .sort((a, b) => a.orderId.localeCompare(b.orderId));
  if (
    orders.reduce((total, order) => total + order.pieceIds.length, 0) > 200 ||
    new Set(orders.flatMap((order) => order.pieceIds)).size !==
      orders.reduce((total, order) => total + order.pieceIds.length, 0)
  )
    throw new ApiContractError();
  return freezeWarehouseReview({
    operation,
    orders,
    selectedTargets: selected,
  });
};
export const reviewWarehouseSelection = (
  previous: WarehouseReview,
  details: readonly WarehouseOrderData[],
): WarehouseReview => {
  if (
    details.length !== previous.orders.length ||
    new Set(details.map((detail) => detail.summary.id)).size !==
      details.length ||
    !previous.orders.every((order) =>
      details.some((detail) => detail.summary.id === order.orderId),
    )
  )
    throw new ApiContractError();
  if (previous.operation !== "RECEIVE") {
    // The original affected roots stay fixed. Explicit review recomputes their
    // complete active membership, even when an initiating row was cancelled.
    const activeTargets = details.flatMap((detail) =>
      detail.paper.order.pieces
        .filter((piece) => piece.stage !== "CANCELLED")
        .map((piece) => ({
          orderId: detail.summary.id,
          expectedVersion: detail.summary.version,
          pieceId: piece.id,
        })),
    );
    return captureWarehouseWholeOrders(
      previous.operation,
      details,
      activeTargets,
    );
  }
  const targets = previous.rows.map((row) => row.target);
  const refreshed = targets.map((target) => {
    const detail = details.find(
      (detail) => detail.summary.id === target.orderId,
    );
    if (detail === undefined) throw new ApiContractError();
    return { ...target, expectedVersion: detail.summary.version };
  });
  return captureWarehouseReceipt(
    details.flatMap((detail) =>
      resolveWarehouseTargets(
        detail,
        refreshed.filter((target) => target.orderId === detail.summary.id),
      ),
    ),
  );
};
