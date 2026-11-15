import {
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  type WarehouseCommandBody,
  type WarehouseCommandData,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";

export const bindWarehouseCommandResult = (
  inputResult: WarehouseCommandData,
  inputBody: WarehouseCommandBody,
  actorId?: string,
): WarehouseCommandData => {
  const body = warehouseCommandBodySchema.parse(inputBody),
    parsed = warehouseCommandDataSchema.safeParse(inputResult);
  if (!parsed.success) throw new ApiContractError();
  const saved = parsed.data;
  if (
    saved.receipt.commandId !== body.commandId ||
    saved.receipt.operation !== body.operation ||
    (actorId !== undefined && saved.receipt.actor.id !== actorId) ||
    saved.outcome.orders.length !== body.orders.length
  )
    throw new ApiContractError();
  for (const group of body.orders) {
    const actual = saved.outcome.orders.find(
      (order) => order.orderId === group.orderId,
    );
    if (
      actual === undefined ||
      actual.beforeVersion !== group.expectedVersion ||
      actual.afterVersion !== group.expectedVersion + 1 ||
      actual.pieceIds.length !== group.pieceIds.length ||
      !actual.pieceIds.every((pieceId) => group.pieceIds.includes(pieceId)) ||
      ("attemptId" in group && actual.attemptId !== group.attemptId)
    )
      throw new ApiContractError();
  }
  return saved;
};
