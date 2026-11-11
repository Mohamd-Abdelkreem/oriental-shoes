import { expect, it } from "vitest";
import { ApiContractError } from "@/services/api/api-client";
import {
  manufacturingCommandIntentSchema,
  manufacturingCommandSessionSchema,
  isUnknownManufacturingWrite,
  ManufacturingLocalCommandError,
} from "./manufacturing-command-state";
import { p03Ids } from "@/test/p03-fixtures";

it("accepts strict work/report contexts and rejects mismatched departments and private fields", () => {
  const intent = manufacturingCommandIntentSchema.parse({
    kind: "report",
    department: "CUTTING",
    orderId: p03Ids.order,
    pieceId: p03Ids.piece,
    body: { commandId: p03Ids.command, expectedVersion: 2, reason: "عيب" },
  });
  const entry = {
    phase: "pending",
    originScope: {
      actorId: p03Ids.actor,
      accessVersion: 1,
      epoch: 1,
      department: "CUTTING",
    },
    intent,
  };
  expect(manufacturingCommandSessionSchema.parse(entry)).toEqual(entry);
  expect(
    manufacturingCommandSessionSchema.safeParse({
      ...entry,
      originScope: { ...entry.originScope, department: "PRODUCTION" },
    }).success,
  ).toBe(false);
  expect(
    manufacturingCommandSessionSchema.safeParse({
      ...entry,
      privateNote: "secret",
    }).success,
  ).toBe(false);
});
it("distinguishes uncertain transport/contract failures from local rejection", () => {
  expect(isUnknownManufacturingWrite(new ApiContractError())).toBe(true);
  expect(isUnknownManufacturingWrite(new Error("lost"))).toBe(true);
  expect(
    isUnknownManufacturingWrite(new ManufacturingLocalCommandError("BUSY")),
  ).toBe(false);
});
