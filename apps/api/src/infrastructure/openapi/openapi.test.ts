import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi.js";

const expectedPaths = [
  "/auth/register",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/logout-all",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/validate-reset-token",
  "/auth/change-password",
  "/users/me",
  "/staff",
  "/staff/{userId}",
  "/staff/{userId}/decisions",
  "/staff/{userId}/approve",
  "/staff/{userId}/reject",
  "/staff/{userId}/department",
  "/staff/{userId}/suspend",
  "/staff/{userId}/reactivate",
  "/health/live",
  "/health/ready",
  "/openapi.json",
] as const;

describe("OpenAPI document", () => {
  it("documents every public route and authentication scheme", () => {
    const document = buildOpenApiDocument();
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(
      [...expectedPaths].sort(),
    );
    expect(document.components?.securitySchemes).toMatchObject({
      BearerAuth: { type: "http", scheme: "bearer" },
      RefreshCookie: { type: "apiKey", in: "cookie" },
      CsrfHeader: { type: "apiKey", in: "header" },
    });
  });

  it("documents the staff route ledger with its exact methods", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths ?? {};

    expect(Object.keys(paths["/staff"] ?? {})).toEqual(["get"]);
    expect(Object.keys(paths["/staff/{userId}"] ?? {})).toEqual(["get"]);
    expect(Object.keys(paths["/staff/{userId}/decisions"] ?? {})).toEqual([
      "get",
    ]);
    expect(Object.keys(paths["/staff/{userId}/approve"] ?? {})).toEqual([
      "post",
    ]);
    expect(Object.keys(paths["/staff/{userId}/reject"] ?? {})).toEqual([
      "post",
    ]);
    expect(Object.keys(paths["/staff/{userId}/department"] ?? {})).toEqual([
      "patch",
    ]);
    expect(Object.keys(paths["/staff/{userId}/suspend"] ?? {})).toEqual([
      "post",
    ]);
    expect(Object.keys(paths["/staff/{userId}/reactivate"] ?? {})).toEqual([
      "post",
    ]);
  });

  it("requires the bearer credential and the CSRF header on staff writes", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths ?? {};

    expect(paths["/staff"]?.["get"]?.security).toEqual([{ BearerAuth: [] }]);
    expect(paths["/staff/{userId}/approve"]?.["post"]?.security).toEqual([
      { BearerAuth: [], CsrfHeader: [] },
    ]);
    expect(paths["/staff/{userId}/department"]?.["patch"]?.security).toEqual([
      { BearerAuth: [], CsrfHeader: [] },
    ]);
  });

  it("documents the staff selection path parameter", () => {
    const document = buildOpenApiDocument();
    const parameters =
      document.paths?.["/staff/{userId}"]?.["get"]?.parameters ?? [];
    expect(parameters).toEqual([
      expect.objectContaining({ name: "userId", in: "path", required: true }),
    ]);
  });

  it("documents the staff list query parameters", () => {
    const document = buildOpenApiDocument();
    const parameters = document.paths?.["/staff"]?.["get"]?.parameters ?? [];
    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "scope", in: "query" }),
        expect.objectContaining({ name: "search", in: "query" }),
        expect.objectContaining({ name: "page", in: "query" }),
        expect.objectContaining({ name: "limit", in: "query" }),
      ]),
    );
  });

  it("describes a restricted identity as data rather than as a missing account", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths ?? {};

    expect(paths["/users/me"]?.["get"]?.description).toMatch(/restricted/iu);
    expect(paths["/auth/login"]?.["post"]?.description).toMatch(
      /never by itself grants business eligibility/iu,
    );
    expect(paths["/auth/logout"]?.["post"]?.description).toMatch(
      /not erased immediately/iu,
    );
  });

  it("describes registration as an awaited configured delivery", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths ?? {};
    expect(paths["/auth/register"]?.["post"]?.description).toMatch(
      /awaits the configured verification delivery/iu,
    );
    const unavailable: unknown =
      paths["/auth/register"]?.["post"]?.responses?.["503"];
    expect(unavailable).toHaveProperty(
      "description",
      "SERVICE_UNAVAILABLE: Verification delivery failed",
    );
  });

  it("reuses the shared neutral, empty and reset-validation data schemas", () => {
    const document = buildOpenApiDocument();
    const schemas = document.components?.schemas ?? {};

    expect(schemas["AuthNeutralData"]).toBeDefined();
    expect(schemas["AuthEmptyData"]).toBeDefined();
    expect(schemas["ResetTokenValidationData"]).toBeDefined();
    expect(schemas["StaffListData"]).toBeDefined();
    expect(schemas["StaffCommandData"]).toBeDefined();
  });
});
