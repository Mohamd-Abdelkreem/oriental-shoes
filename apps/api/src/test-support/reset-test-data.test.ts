import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@template/database";

import {
  OWNED_TEST_DATABASE_MARKER_VARIABLE,
  OwnedTestDataResetError,
  resetOwnedIdentityTestData,
} from "./reset-test-data.ts";

const OWNED_URI =
  "postgresql://template_test:test-only-password@127.0.0.1:54321/template_api_integration?schema=public";

const TRUNCATE_STATEMENT =
  'TRUNCATE TABLE "staff_decisions", "initial_administrator_provisioning", "refresh_tokens", "users"';

type RecordedStatement = { kind: "query" | "execute"; sql: string };

const createFakeDatabase = (
  currentDatabase: string,
): { database: DatabaseClient; statements: RecordedStatement[] } => {
  const statements: RecordedStatement[] = [];
  const database = {
    $queryRaw: (
      strings: TemplateStringsArray,
    ): Promise<Array<{ current_database: string }>> => {
      statements.push({ kind: "query", sql: strings.join("?") });
      return Promise.resolve([{ current_database: currentDatabase }]);
    },
    $executeRaw: (strings: TemplateStringsArray): Promise<number> => {
      statements.push({ kind: "execute", sql: strings.join("?") });
      return Promise.resolve(0);
    },
  };
  return { database: database as unknown as DatabaseClient, statements };
};

const originalEnvironment = {
  nodeEnv: process.env["NODE_ENV"],
  databaseUrl: process.env["DATABASE_URL"],
  marker: process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE],
};

const restoreEnvironment = (): void => {
  if (originalEnvironment.nodeEnv === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
  } else {
    process.env["NODE_ENV"] = originalEnvironment.nodeEnv;
  }
  if (originalEnvironment.databaseUrl === undefined) {
    Reflect.deleteProperty(process.env, "DATABASE_URL");
  } else {
    process.env["DATABASE_URL"] = originalEnvironment.databaseUrl;
  }
  if (originalEnvironment.marker === undefined) {
    Reflect.deleteProperty(process.env, "P01_TEST_DATABASE_URL");
  } else {
    process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE] =
      originalEnvironment.marker;
  }
};

afterEach(() => {
  restoreEnvironment();
});

describe("owned identity test data cleanup", () => {
  it("publishes the owned database marker under the agreed variable name", () => {
    expect(OWNED_TEST_DATABASE_MARKER_VARIABLE).toBe("P01_TEST_DATABASE_URL");
  });

  it("refuses to run outside a test environment without touching the database", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["DATABASE_URL"] = OWNED_URI;
    process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE] = OWNED_URI;
    const { database, statements } = createFakeDatabase(
      "template_api_integration",
    );

    await expect(resetOwnedIdentityTestData(database)).rejects.toBeInstanceOf(
      OwnedTestDataResetError,
    );
    expect(statements).toEqual([]);
  });

  it("refuses to run without an owned database marker without touching the database", async () => {
    process.env["NODE_ENV"] = "test";
    process.env["DATABASE_URL"] = OWNED_URI;
    delete process.env["P01_TEST_DATABASE_URL"];
    const { database, statements } = createFakeDatabase(
      "template_api_integration",
    );

    await expect(resetOwnedIdentityTestData(database)).rejects.toMatchObject({
      reason: "marker-missing",
    });
    expect(statements).toEqual([]);
  });

  it("refuses an empty owned database marker without touching the database", async () => {
    process.env["NODE_ENV"] = "test";
    process.env["DATABASE_URL"] = OWNED_URI;
    process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE] = "";
    const { database, statements } = createFakeDatabase(
      "template_api_integration",
    );

    await expect(resetOwnedIdentityTestData(database)).rejects.toMatchObject({
      reason: "marker-missing",
    });
    expect(statements).toEqual([]);
  });

  it("refuses a marker that does not match the active database without touching the database", async () => {
    process.env["NODE_ENV"] = "test";
    process.env["DATABASE_URL"] =
      "postgresql://template_test:test-only-password@127.0.0.1:54321/other_database?schema=public";
    process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE] = OWNED_URI;
    const { database, statements } = createFakeDatabase(
      "template_api_integration",
    );

    await expect(resetOwnedIdentityTestData(database)).rejects.toMatchObject({
      reason: "marker-mismatch",
    });
    expect(statements).toEqual([]);
  });

  it("refuses a selected database that is not the owned database and never truncates", async () => {
    process.env["NODE_ENV"] = "test";
    process.env["DATABASE_URL"] = OWNED_URI;
    process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE] = OWNED_URI;
    const { database, statements } = createFakeDatabase("a_different_database");

    await expect(resetOwnedIdentityTestData(database)).rejects.toMatchObject({
      reason: "database-mismatch",
    });
    expect(statements.map(({ kind }) => kind)).toEqual(["query"]);
    expect(
      statements.some(
        ({ kind, sql }) => kind === "execute" && sql === TRUNCATE_STATEMENT,
      ),
    ).toBe(false);
  });

  it("clears the explicit owned graph once every guard passes", async () => {
    process.env["NODE_ENV"] = "test";
    process.env["DATABASE_URL"] = OWNED_URI;
    process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE] = OWNED_URI;
    const { database, statements } = createFakeDatabase(
      "template_api_integration",
    );

    await resetOwnedIdentityTestData(database);

    expect(statements.map(({ kind }) => kind)).toEqual(["query", "execute"]);
    expect(statements[1]?.sql).toBe(TRUNCATE_STATEMENT);
    expect(statements[1]?.sql).not.toContain("CASCADE");
  });

  it("never derives a table identifier from the environment", async () => {
    process.env["NODE_ENV"] = "test";
    process.env["DATABASE_URL"] = OWNED_URI;
    process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE] = OWNED_URI;
    const { database, statements } = createFakeDatabase(
      "template_api_integration",
    );

    await resetOwnedIdentityTestData(database);

    for (const { sql } of statements) {
      expect(sql).not.toContain("template_api_integration");
      expect(sql).not.toContain("127.0.0.1");
    }
  });
});
