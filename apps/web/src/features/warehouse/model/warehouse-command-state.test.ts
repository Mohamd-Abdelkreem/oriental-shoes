import { expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
} from "@template/contracts";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import { ApiContractError } from "@/services/api/api-client";
import {
  warehouseCommandSessionSchema,
  WarehouseLocalCommandError,
  WarehouseSynchronizationError,
  isUnknownWarehouseWrite,
} from "./warehouse-command-state";

it("keeps saved-but-unsynchronized intent while rejecting a foreign actor or corrupted original result", () => {
  const body = warehouseCommandBodySchema.parse({
    commandId: p03Ids.command,
    operation: "RECEIVE",
    orders: [
      { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
    ],
  });
  const result = warehouseCommandDataSchema.parse({
    kind: "warehouse-command",
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation: "RECEIVE",
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
          orderId: p03Ids.order,
          beforeVersion: 2,
          afterVersion: 3,
          pieceIds: [p03Ids.piece],
          status: "APPROVED",
          receiptGroupId: p03Ids.source,
          attemptId: null,
          retryId: null,
        },
      ],
    },
  });
  const originScope = {
    actorId: p03Ids.actor,
    accessVersion: 1,
    epoch: 0,
    department: "WAREHOUSE",
  };
  expect(
    warehouseCommandSessionSchema.parse({
      phase: "confirmed",
      originScope,
      body,
      result,
      syncError: null,
    }),
  ).toMatchObject({ phase: "confirmed", result });
  for (const invalid of [
    {
      phase: "confirmed",
      originScope: { ...originScope, actorId: p03Ids.order },
      body,
      result,
    },
    {
      phase: "confirmed",
      originScope,
      body: { ...body, commandId: p03Ids.order },
      result,
    },
    {
      phase: "synchronized",
      originScope,
      body: {
        ...body,
        orders: body.orders.map((group) => ({ ...group, expectedVersion: 3 })),
      },
      result,
    },
  ])
    expect(warehouseCommandSessionSchema.safeParse(invalid).success).toBe(
      false,
    );
  expect(
    isUnknownWarehouseWrite(new WarehouseSynchronizationError(result, null)),
  ).toBe(false);
});
it.each([
  [413, "PAYLOAD_TOO_LARGE", false],
  [409, "ORDER_VERSION_CONFLICT", false],
  [409, "WAREHOUSE_SELECTION_CONFLICT", false],
  [409, "WAREHOUSE_COMMAND_CONFLICT", false],
  [409, "WAREHOUSE_TRANSACTION_CONFLICT", true],
  [500, "INTERNAL_SERVER_ERROR", true],
] as const)(
  "classifies HTTP %s/%s without inventing rollback",
  (status, code, unknown) => {
    const failure = new AxiosError("Synthetic failure");
    failure.response = {
      status,
      statusText: "Failure",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: status,
        code,
        message: "Safe message",
        requestId: "owned",
        timestamp: p03Instant,
        path: "/warehouse/commands",
      },
    };
    expect(isUnknownWarehouseWrite(failure)).toBe(unknown);
  },
);
it("keeps malformed success and network failure uncertain while excluding local admission failures", () => {
  expect(isUnknownWarehouseWrite(new ApiContractError())).toBe(true);
  expect(isUnknownWarehouseWrite(new Error("Synthetic connection loss"))).toBe(
    true,
  );
  expect(isUnknownWarehouseWrite(new WarehouseLocalCommandError("BUSY"))).toBe(
    false,
  );
});
