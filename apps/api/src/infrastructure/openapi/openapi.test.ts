import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi.js";

const expectedPaths = [
  "/manufacturing/{department}/dashboard",
  "/manufacturing/{department}/orders",
  "/manufacturing/{department}/pieces",
  "/manufacturing/{department}/orders/{orderId}",
  "/manufacturing/{department}/activity",
  "/manufacturing/{department}/orders/{orderId}/history",
  "/manufacturing/{department}/commands",
  "/manufacturing-commands/{commandId}",

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
  "/customers",
  "/customers/by-phone/{phone}",
  "/customers/{customerId}",
  "/customers/{customerId}/measurements",
  "/customers/{customerId}/drafts",
  "/sales-drafts",
  "/sales-drafts/changes",
  "/sales-drafts/{draftId}",
  "/sales-drafts/{draftId}/changes",
  "/sales-commands/{commandId}",
  "/catalogs",
  "/catalogs/quotes",
  "/approvals/dashboard",
  "/approvals/orders",
  "/approvals/issues",
  "/approvals/history",
  "/approvals/orders/{orderId}",
  "/approvals/orders/{orderId}/approve",
  "/approvals/orders/{orderId}/return",
  "/approvals/orders/{orderId}/history",
  "/approvals/orders/{orderId}/events/{eventId}",
  "/approvals/orders/{orderId}/pieces/{pieceId}/issues/{issueId}/resolve",
  "/approvals/orders/{orderId}/pieces/{pieceId}/issues/{issueId}/review",
  "/sales-contact",
  "/sales-contact/orders/{orderId}",
  "/sales-contact/orders/{orderId}/pieces/{pieceId}/issues/{issueId}/proposals",
  "/order-paper/{orderId}",
  "/manufacturing-orders/{orderId}",
  "/manufacturing-orders/{orderId}/pieces/{pieceId}/issues",
  "/approval-commands/{commandId}",
  "/sales-orders",
  "/sales-orders/dashboard",
  "/sales-orders/activity",
  "/sales-orders/{orderId}",
  "/sales-orders/{orderId}/tracking",
  "/sales-orders/{orderId}/activity",
  "/sales-orders/{orderId}/activity/{eventId}",
  "/sales-orders/{orderId}/resubmit",
  "/sales-orders/{orderId}/paid",
  "/sales-order-editor/{orderId}",
  "/customers/{customerId}/orders",
  "/customers/{customerId}/order-measurements",
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

it("documents the exact P02 operation ledger, security and conflict boundaries", () => {
  const paths = buildOpenApiDocument().paths ?? {};
  const ledger = {
    "/customers": ["get", "post"],
    "/customers/by-phone/{phone}": ["get"],
    "/customers/{customerId}": ["get", "patch"],
    "/customers/{customerId}/measurements": ["get"],
    "/sales-drafts": ["get", "post"],
    "/sales-drafts/changes": ["get"],
    "/sales-drafts/{draftId}": ["get", "put"],
    "/sales-drafts/{draftId}/changes": ["get"],
    "/sales-commands/{commandId}": ["get"],
  } as const;
  for (const [path, methods] of Object.entries(ledger)) {
    expect(Object.keys(paths[path] ?? {})).toEqual(methods);
    for (const method of methods) {
      const operation = paths[path]?.[method];
      expect(operation?.security).toEqual(
        method === "get"
          ? [{ BearerAuth: [] }]
          : [{ BearerAuth: [], CsrfHeader: [] }],
      );
      for (const status of ["400", "401", "403", "404", "409", "413", "500"])
        expect(operation?.responses).toHaveProperty(status);
      expect(operation?.responses).toHaveProperty(
        method === "post" ? "201" : "200",
      );
    }
  }
  expect(paths).not.toHaveProperty("/sales-drafts/{draftId}/submit");
  expect(paths["/sales-commands/{commandId}"]?.get?.description).toContain(
    "Same actor only",
  );
});

it("documents every P03 method, exact response and write security", () => {
  const paths = buildOpenApiDocument().paths ?? {};
  for (const [path, method, status] of [
    ["/catalogs", "get", "200"],
    ["/catalogs/quotes", "post", "200"],
    ["/sales-orders", "post", "201"],
    ["/sales-orders/{orderId}/resubmit", "post", "200"],
    ["/sales-orders/{orderId}/paid", "patch", "200"],
  ] as const) {
    const operation = paths[path]?.[method];
    expect(operation?.responses?.[status]).toBeDefined();
    expect(operation?.security).toEqual(
      method === "get"
        ? [{ BearerAuth: [] }]
        : [{ BearerAuth: [], CsrfHeader: [] }],
    );
  }
  expect(paths["/sales-orders"]?.post?.responses?.["503"]).toBeDefined();
});

it("documents the exact manufacturing route methods and shared authority/bounds", () => {
  const document = buildOpenApiDocument(),
    paths = document.paths ?? {};
  expect(
    Object.keys(paths["/manufacturing/{department}/dashboard"] ?? {}),
  ).toEqual(["get"]);
  expect(paths["/manufacturing/{department}/dashboard"]?.get?.security).toEqual(
    [{ BearerAuth: [] }],
  );
  expect(
    Object.keys(paths["/manufacturing/{department}/orders"] ?? {}),
  ).toEqual(["get"]);
  expect(paths["/manufacturing/{department}/orders"]?.get?.security).toEqual([
    { BearerAuth: [] },
  ]);
  expect(
    Object.keys(paths["/manufacturing/{department}/pieces"] ?? {}),
  ).toEqual(["get"]);
  expect(paths["/manufacturing/{department}/pieces"]?.get?.security).toEqual([
    { BearerAuth: [] },
  ]);
  expect(
    Object.keys(paths["/manufacturing/{department}/orders/{orderId}"] ?? {}),
  ).toEqual(["get"]);
  expect(
    paths["/manufacturing/{department}/orders/{orderId}"]?.get?.security,
  ).toEqual([{ BearerAuth: [] }]);
  expect(
    Object.keys(paths["/manufacturing/{department}/activity"] ?? {}),
  ).toEqual(["get"]);
  expect(paths["/manufacturing/{department}/activity"]?.get?.security).toEqual([
    { BearerAuth: [] },
  ]);
  expect(
    Object.keys(
      paths["/manufacturing/{department}/orders/{orderId}/history"] ?? {},
    ),
  ).toEqual(["get"]);
  expect(
    paths["/manufacturing/{department}/orders/{orderId}/history"]?.get
      ?.security,
  ).toEqual([{ BearerAuth: [] }]);
  expect(
    Object.keys(paths["/manufacturing/{department}/commands"] ?? {}),
  ).toEqual(["post"]);
  expect(paths["/manufacturing/{department}/commands"]?.post?.security).toEqual(
    [{ BearerAuth: [], CsrfHeader: [] }],
  );
  expect(
    Object.keys(paths["/manufacturing-commands/{commandId}"] ?? {}),
  ).toEqual(["get"]);
  expect(paths["/manufacturing-commands/{commandId}"]?.get?.security).toEqual([
    { BearerAuth: [] },
  ]);
  const text = JSON.stringify(paths["/manufacturing/{department}/commands"]);
  expect(text).toContain("RECEIVE_AND_START");
  expect(text).toContain("expectedVersion");
  expect(text).toContain("pieceIds");
  const query = JSON.stringify(paths["/manufacturing/{department}/orders"]);
  expect(query).toContain('"maxItems":25');
  expect(query).toContain("grouped limit 1-25");
  const flat = JSON.stringify(paths["/manufacturing/{department}/pieces"]);
  expect(flat).toContain('"maxItems":100');
  expect(flat).toContain("flat/history limit 1-100");
});
