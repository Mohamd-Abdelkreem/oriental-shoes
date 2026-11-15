import { expect, it } from "vitest";
import {
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  type WarehouseCommandOperation,
} from "@template/contracts";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import { ApiContractError } from "@/services/api/api-client";
import { bindWarehouseCommandResult } from "./warehouse-command-binding.model";

const fixture = (operation: WarehouseCommandOperation) => {
  const group = {
    orderId: p03Ids.order,
    expectedVersion: 2,
    pieceIds: [p03Ids.piece],
  };
  const body = warehouseCommandBodySchema.parse({
    commandId: p03Ids.command,
    operation,
    orders: [
      {
        ...group,
        ...(operation === "RECEIVE"
          ? { receipt: null }
          : operation === "DISPATCH"
            ? { deliveryNote: null }
            : operation === "CONFIRM_DELIVERY"
              ? {
                  attemptId: p03Ids.source,
                  recipient: null,
                  deliveredAt: null,
                  notes: null,
                }
              : operation === "FAIL_DELIVERY"
                ? {
                    attemptId: p03Ids.source,
                    returnedToWarehouse: true,
                    reason: "Customer unavailable",
                    notes: null,
                  }
                : { attemptId: p03Ids.source, retryDate: null, notes: null }),
      },
    ],
  });
  const result = warehouseCommandDataSchema.parse({
    kind: "warehouse-command",
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation,
      actor: {
        id: p03Ids.actor,
        fullName: "Warehouse colleague",
        role: "USER",
        department: "WAREHOUSE",
      },
      occurredAt: p03Instant,
    },
    outcome: {
      orders: [
        {
          eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          orderId: group.orderId,
          beforeVersion: 2,
          afterVersion: 3,
          pieceIds: group.pieceIds,
          status:
            operation === "RECEIVE" || operation === "RETRY_DELIVERY"
              ? "READY_FOR_DELIVERY"
              : operation === "DISPATCH"
                ? "OUT_FOR_DELIVERY"
                : operation === "CONFIRM_DELIVERY"
                  ? "DELIVERED"
                  : "DELIVERY_FAILED",
          receiptGroupId: operation === "RECEIVE" ? p03Ids.source : null,
          attemptId: operation === "RECEIVE" ? null : p03Ids.source,
          retryId: operation === "RETRY_DELIVERY" ? p03Ids.command : null,
        },
      ],
    },
  });
  return { body, result };
};
it.each([
  "RECEIVE",
  "DISPATCH",
  "CONFIRM_DELIVERY",
  "FAIL_DELIVERY",
  "RETRY_DELIVERY",
] as const)(
  "binds %s compact outcomes without inventing omitted capture or accepting another intent",
  (operation) => {
    const { body, result } = fixture(operation),
      group = result.outcome.orders[0];
    if (!group) throw new Error("Owned outcome required");
    expect(bindWarehouseCommandResult(result, body, p03Ids.actor)).toEqual(
      result,
    );
    const corruptions = [
      { ...result, receipt: { ...result.receipt, commandId: p03Ids.source } },
      {
        ...result,
        receipt: {
          ...result.receipt,
          actor: { ...result.receipt.actor, id: p03Ids.order },
        },
      },
      { ...result, outcome: { orders: [{ ...group, orderId: p03Ids.actor }] } },
      {
        ...result,
        outcome: { orders: [{ ...group, pieceIds: [p03Ids.source] }] },
      },
      {
        ...result,
        outcome: { orders: [{ ...group, beforeVersion: 3, afterVersion: 4 }] },
      },
      { ...result, outcome: { orders: [{ ...group, afterVersion: 2 }] } },
      { ...result, outcome: { orders: [{ ...group, afterVersion: 4 }] } },
      { ...result, outcome: { orders: [group, group] } },
    ];
    for (const invalid of corruptions)
      expect(() =>
        bindWarehouseCommandResult(invalid, body, p03Ids.actor),
      ).toThrow(ApiContractError);
    const submitted = body.orders[0];
    if (submitted !== undefined && "attemptId" in submitted)
      expect(() =>
        bindWarehouseCommandResult(
          {
            ...result,
            outcome: { orders: [{ ...group, attemptId: p03Ids.actor }] },
          },
          body,
          p03Ids.actor,
        ),
      ).toThrow(ApiContractError);
  },
);
