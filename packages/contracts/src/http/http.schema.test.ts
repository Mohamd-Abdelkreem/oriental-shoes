import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  errorEnvelopeSchema,
  paginationQueryFields,
  isSafePaginationWindow,
  paginationMetaSchema,
  successEnvelopeSchema,
} from "./http.schema.ts";

const base = {
  requestId: "request-1",
  timestamp: "2026-08-18T00:00:00.000Z",
  path: "/api/v1/test",
};

const querySchema = z
  .object(paginationQueryFields)
  .strict()
  .refine(isSafePaginationWindow);
it.each([
  [{}, { page: 1, limit: 25 }],
  [
    { page: " ", limit: "" },
    { page: 1, limit: 25 },
  ],
  [
    { page: "2", limit: 100 },
    { page: 2, limit: 100 },
  ],
])("normalizes bounded pagination %j", (input, expected) => {
  expect(querySchema.parse(input)).toEqual(expected);
});
it.each([
  0,
  -1,
  "1e2",
  "-1",
  null,
  [],
  {},
  "9".repeat(33),
  Number.MAX_SAFE_INTEGER + 1,
])("rejects invalid page scalar %j", (page) => {
  expect(querySchema.safeParse({ page }).success).toBe(false);
});
it("rejects excessive limits and unsafe offsets rather than clamping", () => {
  expect(querySchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(
    querySchema.safeParse({ page: Number.MAX_SAFE_INTEGER, limit: 25 }).success,
  ).toBe(false);
});

describe("HTTP envelope contracts", () => {
  it("keeps success and error payloads discriminated", () => {
    expect(
      successEnvelopeSchema.parse({
        ...base,
        success: true,
        statusCode: 200,
        message: "Okay.",
        data: { value: true },
      }).success,
    ).toBe(true);
    expect(
      errorEnvelopeSchema.parse({
        ...base,
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid input.",
        errors: [{ field: "email", message: "Invalid email." }],
      }).success,
    ).toBe(false);
  });

  it("requires success data and rejects legacy error data", () => {
    expect(
      successEnvelopeSchema.safeParse({
        ...base,
        success: true,
        statusCode: 204,
        message: "Done.",
      }).success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        ...base,
        success: false,
        statusCode: 400,
        code: "BAD_REQUEST",
        message: "Invalid input.",
        data: null,
      }).success,
    ).toBe(false);
  });

  it("validates promoted pagination metadata", () => {
    const valid = {
      page: 2,
      limit: 25,
      total: 63,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    };
    expect(paginationMetaSchema.safeParse(valid).success).toBe(true);
    expect(
      paginationMetaSchema.safeParse({ ...valid, totalPages: 4 }).success,
    ).toBe(false);
    expect(
      successEnvelopeSchema.safeParse({
        ...base,
        success: true,
        statusCode: 200,
        message: "Okay.",
        data: [],
        paginationMeta: valid,
      }).success,
    ).toBe(true);
  });
});
