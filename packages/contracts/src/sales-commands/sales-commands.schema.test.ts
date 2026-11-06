import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { customerCommandDataSchema } from "../customers/customers.schema.ts";
import { draftCaptureSchema } from "../sales-drafts/sales-drafts.schema.ts";
import { salesCommandDataSchema } from "./sales-commands.schema.ts";

const id = randomUUID(),
  commandId = randomUUID(),
  actorId = randomUUID();
const instant = "2026-11-05T12:00:00.000Z";
const actor = {
  id: actorId,
  fullName: "Sales A",
  role: "USER",
  department: "SALES",
};
const customer = {
  id,
  name: "C",
  phone: "+966500000001",
  email: null,
  address: null,
  notes: null,
  version: 1,
  createdAt: instant,
  updatedAt: instant,
};
const receipt = {
  commandId,
  operation: "CREATE_CUSTOMER",
  resourceId: id,
  actor,
  beforeVersion: null,
  afterVersion: 1,
  occurredAt: instant,
};
const customerResult = {
  kind: "customer",
  receipt,
  replayed: false,
  savedCustomer: customer,
};
it("parses retained customer and draft results without treating the snapshot as current", () => {
  expect(salesCommandDataSchema.parse(customerResult)).toEqual(customerResult);
  const { customerId, ...capture } = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [{ id: randomUUID() }],
  });
  expect(customerId).toBeNull();
  const draft = {
    ...capture,
    id,
    version: 1,
    status: "DRAFT",
    owner: { id: actorId, fullName: "Sales A" },
    customer: null,
    pieces: capture.pieces.map((piece) => ({
      ...piece,
      position: 1,
      quantity: 1,
    })),
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
  };
  expect(
    salesCommandDataSchema.parse({
      kind: "draft",
      receipt: { ...receipt, operation: "CREATE_DRAFT" },
      replayed: true,
      savedDraft: draft,
    }),
  ).toMatchObject({
    kind: "draft",
    replayed: true,
    savedDraft: { version: 1 },
  });
});
it.each([
  { ...customerResult, kind: "draft" },
  { ...customerResult, receipt: { ...receipt, operation: "CREATE_DRAFT" } },
  { ...customerResult, receipt: { ...receipt, resourceId: randomUUID() } },
  { ...customerResult, savedCustomer: { ...customer, version: 2 } },
  { ...customerResult, receipt: { ...receipt, beforeVersion: 1 } },
  {
    ...customerResult,
    receipt: { ...receipt, actor: { ...actor, department: "CUTTING" } },
  },
  {
    ...customerResult,
    savedCustomer: { ...customer, passwordHash: "private" },
  },
])("rejects inconsistent or private committed results %j", (input) => {
  expect(salesCommandDataSchema.safeParse(input).success).toBe(false);
});
it("accepts ADMIN nullable context and requires exact update revision progression", () => {
  const input = {
    ...customerResult,
    receipt: {
      ...receipt,
      operation: "UPDATE_CUSTOMER",
      beforeVersion: 1,
      afterVersion: 2,
      actor: { ...actor, role: "ADMIN", department: null },
    },
    savedCustomer: { ...customer, version: 2 },
  };
  expect(customerCommandDataSchema.safeParse(input).success).toBe(true);
  expect(
    customerCommandDataSchema.safeParse({
      ...input,
      receipt: { ...input.receipt, afterVersion: 3 },
    }).success,
  ).toBe(false);
});
