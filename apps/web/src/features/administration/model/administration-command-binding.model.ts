import {
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  type AdministrationCommandBody,
  type AdministrationCommandData,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const validCancellationStatus = (saved: AdministrationCommandData): boolean => {
  const before = saved.before,
    after = saved.after;
  if (before.status === "OUT_FOR_DELIVERY" || before.status === "DELIVERED")
    return false;
  if (after.counts.active === 0) return after.status === "CANCELLED";
  if (
    before.status === "AWAITING_APPROVAL" ||
    before.status === "RETURNED" ||
    before.status === "DELIVERY_FAILED"
  )
    return after.status === before.status;
  if (after.status === "APPROVED") return true;
  return (
    after.status === "READY_FOR_DELIVERY" &&
    after.pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .every(
        (piece) =>
          piece.stage === "WAREHOUSE" &&
          piece.workState === "COMPLETED" &&
          piece.receivedAt !== null &&
          piece.issueId === null,
      )
  );
};
export const bindAdministrationCommandResult = (
  inputResult: AdministrationCommandData,
  inputBody: AdministrationCommandBody,
  actorId?: string,
): AdministrationCommandData => {
  const body = administrationCommandBodySchema.parse(inputBody),
    parsed = administrationCommandDataSchema.safeParse(inputResult);
  if (!parsed.success) throw new ApiContractError();
  const saved = parsed.data;
  if (
    saved.receipt.commandId !== body.commandId ||
    saved.receipt.operation !== body.operation ||
    saved.receipt.orderId !== body.orderId ||
    saved.result.orderId !== body.orderId ||
    saved.receipt.beforeVersion !== body.expectedVersion ||
    saved.receipt.afterVersion !== body.expectedVersion + 1 ||
    (actorId !== undefined && saved.receipt.actor.id !== actorId)
  )
    throw new ApiContractError();
  if (body.operation === "ADMIN_CANCEL") {
    const active = saved.before.pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .map((piece) => piece.id)
      .toSorted();
    if (
      !same(saved.result.pieceIds, body.pieceIds) ||
      (body.scope === "ORDER" && !same(active, body.pieceIds)) ||
      !validCancellationStatus(saved) ||
      (body.reason !== null &&
        saved.after.pieces.some(
          (piece) =>
            body.pieceIds.includes(piece.id) &&
            piece.cancellationReason !== body.reason,
        ))
    )
      throw new ApiContractError();
  } else if (
    !same(saved.after.correction, { ...saved.before.correction, ...body.patch })
  )
    throw new ApiContractError();
  return saved;
};
