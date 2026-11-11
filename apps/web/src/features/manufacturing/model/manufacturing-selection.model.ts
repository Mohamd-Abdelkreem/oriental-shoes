import {
  manufacturingCommandBodySchema,
  salesUuidSchema,
  type ManufacturingCommandOperation,
  type ManufacturingDepartment,
  type ManufacturingCommandBody,
  type ManufacturingOrderData,
} from "@template/contracts";
import type {
  ManufacturingWorkRow,
  ManufacturingPieceTarget,
} from "./manufacturing-view.model";

export const captureManufacturingSelection = (
  operation: ManufacturingCommandOperation,
  department: ManufacturingDepartment,
  rows: readonly ManufacturingWorkRow[],
): ManufacturingCommandBody["orders"] => {
  const groups = new Map<string, ManufacturingCommandBody["orders"][number]>();
  for (const row of rows) {
    const allowed =
      operation === "RECEIVE_AND_START"
        ? row.work.allowedActions.canReceiveAndStart
        : operation === "CONTINUE"
          ? row.work.allowedActions.canContinue
          : row.work.allowedActions.canCompleteTransfer;
    if (
      !allowed ||
      row.work.visit?.department !== department ||
      row.piece.id !== row.target.pieceId ||
      row.order.id !== row.target.orderId ||
      row.order.version !== row.target.expectedVersion
    )
      throw new Error("Review the complete selection");
    const group = groups.get(row.target.orderId);
    if (group && group.expectedVersion !== row.target.expectedVersion)
      throw new Error("Conflicting versions");
    if (group) group.pieceIds.push(row.target.pieceId);
    else
      groups.set(row.target.orderId, {
        orderId: row.target.orderId,
        expectedVersion: row.target.expectedVersion,
        pieceIds: [row.target.pieceId],
      });
  }
  const orders = [...groups.values()]
    .sort((a, b) => a.orderId.localeCompare(b.orderId))
    .map((group) => ({ ...group, pieceIds: group.pieceIds.toSorted() }));
  return manufacturingCommandBodySchema.parse({
    commandId: "00000000-0000-4000-8000-000000000000",
    operation,
    orders,
  }).orders;
};
export const validateManufacturingTaskSelection = (
  data: ManufacturingOrderData,
  params: { pieceId?: string; itemId?: string; segmentId?: string },
): readonly ManufacturingPieceTarget[] => {
  if (!params.pieceId && !params.itemId && !params.segmentId) return [];
  const pieceId = params.pieceId === undefined ? params.itemId : params.pieceId;
  if (
    params.pieceId &&
    params.itemId &&
    salesUuidSchema.parse(params.pieceId) !==
      salesUuidSchema.parse(params.itemId)
  )
    throw new Error("Conflicting piece identities");
  const context = params.segmentId
    ? data.work.find(
        (work) => work.visit?.id === salesUuidSchema.parse(params.segmentId),
      )
    : undefined;
  const id = pieceId ? salesUuidSchema.parse(pieceId) : context?.pieceId;
  if (
    !id ||
    !data.paper.order.pieces.some((piece) => piece.id === id) ||
    (params.segmentId && context?.pieceId !== id)
  )
    throw new Error("Exact task piece is unavailable");
  return [
    {
      orderId: data.paper.order.id,
      expectedVersion: data.paper.order.version,
      pieceId: id,
    },
  ];
};
