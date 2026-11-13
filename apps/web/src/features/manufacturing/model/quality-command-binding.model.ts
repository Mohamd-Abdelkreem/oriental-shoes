import {
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  type QualityCommandBody,
  type QualityCommandData,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";

export const bindQualityCommandResult = (
  data: QualityCommandData,
  body: QualityCommandBody,
  actorId?: string,
): QualityCommandData => {
  const input = qualityCommandBodySchema.parse(body),
    parsed = qualityCommandDataSchema.safeParse(data);
  if (!parsed.success) throw new ApiContractError();
  const saved = parsed.data;
  if (
    saved.receipt.commandId !== input.commandId ||
    saved.receipt.operation !== input.operation ||
    (actorId !== undefined && saved.receipt.actor.id !== actorId) ||
    saved.outcome.orders.length !== input.orders.length
  )
    throw new ApiContractError();
  for (const group of input.orders) {
    const actual = saved.outcome.orders.find(
      (order) => order.orderId === group.orderId,
    );
    const ids =
      "decisions" in group
        ? group.decisions.map((decision) => decision.pieceId)
        : group.pieceIds;
    if (
      actual === undefined ||
      actual.beforeVersion !== group.expectedVersion ||
      actual.afterVersion !==
        group.expectedVersion +
          (input.operation === "REPORT_ISSUES" ? ids.length : 1) ||
      actual.pieces.length !== ids.length ||
      actual.pieces.some((piece) => !ids.includes(piece.pieceId))
    )
      throw new ApiContractError();
    if ("decisions" in group) {
      if ((actual.packingGroupId !== null) !== (group.packing !== null))
        throw new ApiContractError();
      for (const decision of group.decisions) {
        const piece = actual.pieces.find(
          (member) => member.pieceId === decision.pieceId,
        );
        if (
          piece === undefined ||
          piece.decision !== decision.decision ||
          piece.stage !==
            (decision.decision === "ACCEPT" ? "WAREHOUSE" : decision.target)
        )
          throw new ApiContractError();
      }
    }
  }
  return saved;
};
