import { expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  qualityCommandBodySchema,
  qualityCommandDataSchema,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import {
  qualityCommandSessionSchema,
  QualityLocalCommandError,
  QualitySynchronizationError,
  isUnknownQualityWrite,
} from "./quality-command-state";

const body = qualityCommandBodySchema.parse({
  commandId: p03Ids.command,
  operation: "RECEIVE_AND_START",
  orders: [
    { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
  ],
});
const result = qualityCommandDataSchema.parse({
  kind: "quality-command",
  replayed: false,
  receipt: {
    commandId: p03Ids.command,
    operation: "RECEIVE_AND_START",
    actor: {
      id: p03Ids.actor,
      fullName: "Actual inspector",
      role: "USER",
      department: "QUALITY",
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
        packingGroupId: null,
        pieces: [
          {
            pieceId: p03Ids.piece,
            visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            decision: null,
            stage: "QUALITY",
            workState: "IN_PROGRESS",
            correctionId: null,
            issueId: null,
          },
        ],
      },
    ],
  },
});
const originScope = {
  actorId: p03Ids.actor,
  accessVersion: 0,
  epoch: 0,
  department: "QUALITY",
};
it("keeps confirmed results after refresh failure and rejects a different actor, intent or root version", () => {
  expect(
    qualityCommandSessionSchema.parse({
      phase: "confirmed",
      originScope,
      body,
      result,
      syncError: null,
    }),
  ).toMatchObject({ phase: "confirmed", result });
  expect(
    qualityCommandSessionSchema.safeParse({
      phase: "confirmed",
      originScope: { ...originScope, actorId: p03Ids.order },
      body,
      result,
    }).success,
  ).toBe(false);
  expect(
    qualityCommandSessionSchema.safeParse({
      phase: "confirmed",
      originScope,
      body: { ...body, commandId: p03Ids.order },
      result,
    }).success,
  ).toBe(false);
  const changed = structuredClone(result);
  const group = changed.outcome.orders[0];
  if (!group) throw new Error("Group required");
  group.beforeVersion = 3;
  group.afterVersion = 4;
  expect(
    qualityCommandSessionSchema.safeParse({
      phase: "synchronized",
      originScope,
      body,
      result: changed,
    }).success,
  ).toBe(false);
  const saved = new QualitySynchronizationError(result, null);
  expect(saved.result).toEqual(result);
  expect(isUnknownQualityWrite(saved)).toBe(false);
});
it.each([
  [413, "PAYLOAD_TOO_LARGE", false],
  [409, "ORDER_VERSION_CONFLICT", false],
  [409, "QUALITY_SELECTION_CONFLICT", false],
  [409, "QUALITY_COMMAND_CONFLICT", false],
  [409, "QUALITY_TRANSACTION_CONFLICT", true],
  [500, "INTERNAL_SERVER_ERROR", true],
] as const)(
  "classifies HTTP %s %s without inventing rollback",
  (status, code, expected) => {
    const error = new AxiosError("Safe failure");
    error.response = {
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
        path: "/quality/commands",
      },
    };
    expect(isUnknownQualityWrite(error)).toBe(expected);
  },
);
it("retains transport and malformed-success uncertainty while excluding local busy/invariant failures", () => {
  expect(isUnknownQualityWrite(new Error("Owned network failure"))).toBe(true);
  expect(isUnknownQualityWrite(new ApiContractError())).toBe(true);
  expect(isUnknownQualityWrite(new QualityLocalCommandError("BUSY"))).toBe(
    false,
  );
  expect(isUnknownQualityWrite(new QualityLocalCommandError("INVARIANT"))).toBe(
    false,
  );
});
