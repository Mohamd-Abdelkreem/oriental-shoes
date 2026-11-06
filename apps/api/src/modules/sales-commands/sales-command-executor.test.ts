import { randomUUID } from "node:crypto";
import {
  customerCaptureSchema,
  customerPatchSchema,
  draftCaptureSchema,
} from "@template/contracts";
import { expect, it } from "vitest";
import { hashSalesCommandIntent } from "./sales-command-executor.js";
import {
  isSalesCommandIdConflict,
  isSalesLockTimeout,
} from "./sales-command.errors.js";

it("hashes canonical customer intent independent of raw formatting and patch key order", () => {
  const capture = customerCaptureSchema.parse({
    name: " Customer ",
    phone: "٠٥٠٠٠٠٠٠٠١",
    email: " A@EXAMPLE.TEST ",
  });
  const equivalent = customerCaptureSchema.parse({
    phone: "+966500000001",
    email: "a@example.test",
    name: "Customer",
  });
  const create = {
    operation: "CREATE_CUSTOMER",
    targetId: null,
    expectedVersion: null,
  } as const;
  expect(hashSalesCommandIntent({ ...create, payload: capture })).toBe(
    hashSalesCommandIntent({ ...create, payload: equivalent }),
  );
  const update = {
    operation: "UPDATE_CUSTOMER",
    targetId: randomUUID(),
    expectedVersion: 1,
  } as const;
  expect(
    hashSalesCommandIntent({
      ...update,
      payload: customerPatchSchema.parse({ name: "A", notes: null }),
    }),
  ).toBe(
    hashSalesCommandIntent({
      ...update,
      payload: customerPatchSchema.parse({ notes: null, name: "A" }),
    }),
  );
  expect(
    hashSalesCommandIntent({ ...update, payload: { name: "A" } }),
  ).not.toBe(
    hashSalesCommandIntent({ ...update, payload: { name: "A", notes: null } }),
  );
});
it("binds piece identity, order and significant text to the draft intent", () => {
  const payload = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [
      { id: randomUUID(), soleAddition: "روضة - H " },
      { id: randomUUID() },
    ],
  });
  const input = {
    operation: "CREATE_DRAFT",
    targetId: null,
    expectedVersion: null,
  } as const;
  const original = hashSalesCommandIntent({ ...input, payload });
  expect(
    hashSalesCommandIntent({
      ...input,
      payload: { ...payload, pieces: [...payload.pieces].reverse() },
    }),
  ).not.toBe(original);
  expect(
    hashSalesCommandIntent({
      ...input,
      payload: {
        ...payload,
        pieces: payload.pieces.map((piece) => ({ ...piece, id: randomUUID() })),
      },
    }),
  ).not.toBe(original);
  expect(
    hashSalesCommandIntent({
      ...input,
      payload: {
        ...payload,
        pieces: payload.pieces.map((piece) => ({
          ...piece,
          soleAddition: piece.soleAddition?.trim() ?? null,
        })),
      },
    }),
  ).not.toBe(original);
});
it("recognizes only the nested command constraint and exact raw PostgreSQL timeout classification", () => {
  const unique = (fields: string[]) => ({
    code: "P2002",
    meta: {
      driverAdapterError: {
        cause: { kind: "UniqueConstraintViolation", constraint: { fields } },
      },
    },
  });
  expect(isSalesCommandIdConflict(unique(["command_id"]))).toBe(true);
  expect(isSalesCommandIdConflict(unique(["phone"]))).toBe(false);
  expect(
    isSalesCommandIdConflict({
      code: "P2002",
      meta: { target: ["command_id"] },
    }),
  ).toBe(false);
  expect(
    isSalesLockTimeout({
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { kind: "postgres", originalCode: "55P03" },
        },
      },
    }),
  ).toBe(true);
  expect(isSalesLockTimeout({ code: "55P03", message: "55P03" })).toBe(false);
});
