import { randomUUID } from "node:crypto";
import {
  customerCaptureSchema,
  customerPatchSchema,
  draftCaptureSchema,
  submitOrderBodySchema,
} from "@template/contracts";
import { expect, it } from "vitest";
import { hashSalesCommandIntent } from "./sales-command-executor.js";
import {
  isSalesCommandIdConflict,
  isSalesLockTimeout,
} from "./sales-command.errors.js";

it("preserves the four legacy hash vectors recorded from the accepted original executor", () => {
  const targetId = "11111111-1111-4111-8111-111111111111";
  const draft = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        soleAddition: "H ",
        additions: "note",
      },
    ],
  });
  expect(
    hashSalesCommandIntent({
      operation: "CREATE_CUSTOMER",
      targetId: null,
      expectedVersion: null,
      payload: customerCaptureSchema.parse({
        name: "Customer",
        phone: "0500000001",
      }),
    }),
  ).toBe("3dab6576541c1881cb16c942cb8b5f5aa925c98af30dee438ac1f1375569c27d");
  expect(
    hashSalesCommandIntent({
      operation: "UPDATE_CUSTOMER",
      targetId,
      expectedVersion: 1,
      payload: customerPatchSchema.parse({ name: "Changed", notes: null }),
    }),
  ).toBe("9ea876337df9c42b55b35f8585a7a43cd06781c6835502c0118019115bbcc026");
  expect(
    hashSalesCommandIntent({
      operation: "CREATE_DRAFT",
      targetId: null,
      expectedVersion: null,
      payload: draft,
    }),
  ).toBe("2d7a6e61411ca5b244c0a1d06d1514aa1770213174ca01042c61a23329fd2760");
  expect(
    hashSalesCommandIntent({
      operation: "SAVE_DRAFT",
      targetId,
      expectedVersion: 1,
      payload: draft,
    }),
  ).toBe("191e7c97bcf41d9919d93b4bfbb7a1e0fea9f81f98ad796d5270286c19ab612d");
});

it("binds supplied source references in fixed field order without changing omitted legacy intent", () => {
  const pieceId = randomUUID(),
    decoration = randomUUID(),
    size = randomUUID();
  const intent = {
    operation: "CREATE_DRAFT",
    targetId: null,
    expectedVersion: null,
  } as const;
  const capture = (catalogSelections?: { decoration: string; size: string }) =>
    draftCaptureSchema.parse({
      type: "SHOP",
      pieces: [{ id: pieceId, catalogSelections }],
    });
  const referenced = hashSalesCommandIntent({
    ...intent,
    payload: capture({ decoration, size }),
  });
  expect(referenced).toBe(
    hashSalesCommandIntent({
      ...intent,
      payload: capture({ size, decoration }),
    }),
  );
  expect(referenced).not.toBe(
    hashSalesCommandIntent({ ...intent, payload: capture() }),
  );
  expect(referenced).not.toBe(
    hashSalesCommandIntent({
      ...intent,
      payload: capture({ size, decoration: randomUUID() }),
    }),
  );
});

it("binds reviewed customer and quote terms to the new submission intent", () => {
  const body = submitOrderBodySchema.parse({
    origin: "new",
    commandId: randomUUID(),
    expectedCustomerVersion: 1,
    reviewedQuote: { sourceId: randomUUID(), fingerprint: "a".repeat(64) },
    capture: {
      type: "SHOP",
      customerId: randomUUID(),
      pieces: [
        {
          id: randomUUID(),
          model: "SM",
          size: "40",
          leatherBase: "Base",
          decoration: "Decoration",
          face: "Face",
        },
      ],
    },
  });
  const intent = {
    operation: "SUBMIT_NEW_ORDER",
    targetId: null,
    expectedVersion: null,
  } as const;
  const submitted = hashSalesCommandIntent({ ...intent, payload: body });
  expect(submitted).not.toBe(
    hashSalesCommandIntent({
      ...intent,
      payload: { ...body, expectedCustomerVersion: 2 },
    }),
  );
  expect(submitted).not.toBe(
    hashSalesCommandIntent({
      ...intent,
      payload: {
        ...body,
        reviewedQuote: { ...body.reviewedQuote, fingerprint: "b".repeat(64) },
      },
    }),
  );
  expect(submitted).not.toBe(
    hashSalesCommandIntent({
      ...intent,
      payload: {
        ...body,
        reviewedQuote: { ...body.reviewedQuote, sourceId: randomUUID() },
      },
    }),
  );
});

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
