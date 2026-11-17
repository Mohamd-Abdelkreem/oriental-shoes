import { expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { ApiContractError } from "@/services/api/api-client";
import { p08CorrectionCommandFixture } from "@/test/p08-fixtures";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import {
  administrationCommandSessionSchema,
  AdministrationLocalCommandError,
  AdministrationSynchronizationError,
  isUnknownAdministrationWrite,
} from "./administration-command-state";

const originScope = {
  actorId: p03Ids.actor,
  accessVersion: 1,
  epoch: 0,
  capability: "ADMINISTRATION",
};
it("retains only an exact origin/intent/result and deeply freezes its parsed copy", () => {
  const { body, result } = p08CorrectionCommandFixture(),
    input = { phase: "confirmed", originScope, body, result, syncError: null };
  const state = administrationCommandSessionSchema.parse(input);
  expect(state.phase).toBe("confirmed");
  if (state.phase !== "confirmed")
    throw new Error("Expected confirmed session");
  expect(Object.isFrozen(state)).toBe(true);
  expect(Object.isFrozen(state.body)).toBe(true);
  expect(Object.isFrozen(state.result.after.pieces)).toBe(true);
  body.patch.customerAddress = "Later editable input";
  expect(state.body).not.toEqual(body);
  expect(() => {
    state.result.after.pieces.pop();
  }).toThrow();
  for (const change of [
    { originScope: { ...originScope, actorId: p03Ids.customer } },
    { body: { ...input.body, commandId: p03Ids.customer } },
    { result: { ...result, receipt: { ...result.receipt, afterVersion: 99 } } },
  ])
    expect(
      administrationCommandSessionSchema.safeParse({
        ...input,
        body: p08CorrectionCommandFixture().body,
        ...change,
      }).success,
    ).toBe(false);
  expect(
    administrationCommandSessionSchema.safeParse({
      phase: "pending",
      originScope: { ...originScope, capability: "WAREHOUSE" },
      body,
    }).success,
  ).toBe(false);
});
it.each([
  [0, "NETWORK_ERROR", true],
  [409, "ADMINISTRATION_TRANSACTION_CONFLICT", true],
  [500, "INTERNAL_SERVER_ERROR", true],
  [403, "ACCOUNT_RESTRICTED", false],
  [409, "ADMINISTRATION_COMMAND_CONFLICT", false],
  [422, "VALIDATION_ERROR", false],
] as const)(
  "classifies HTTP %s/%s without assuming rollback",
  (status, code, unknown) => {
    const failure = new AxiosError(
      "Controlled error",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status,
        statusText: "Failure",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          success: false,
          statusCode: status === 0 ? 500 : status,
          code,
          message: "Safe failure",
          requestId: "owned",
          timestamp: p03Instant,
          path: "/administration/commands",
        },
      },
    );
    if (status === 0) delete failure.response;
    expect(isUnknownAdministrationWrite(failure)).toBe(unknown);
  },
);
it("keeps malformed success uncertain and confirmed sync repair distinct from another write", () => {
  const { result } = p08CorrectionCommandFixture();
  expect(isUnknownAdministrationWrite(new ApiContractError())).toBe(true);
  expect(isUnknownAdministrationWrite(new Error("Connection loss"))).toBe(true);
  expect(
    isUnknownAdministrationWrite(new AdministrationLocalCommandError("BUSY")),
  ).toBe(false);
  const failure = new AdministrationSynchronizationError(result, null);
  expect(failure.result).toEqual(result);
  expect(isUnknownAdministrationWrite(failure)).toBe(false);
});
