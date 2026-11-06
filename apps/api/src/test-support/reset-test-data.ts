import type { DatabaseClient } from "@template/database";

/**
 * Test-only cleanup for the owned identity fixture graph.
 *
 * The helper refuses to run outside a test environment, outside an explicitly
 * marked owned database, or against a database that is not the one the marker
 * names. It truncates one fixed list of tables and never derives SQL
 * identifiers from the environment, so a newly introduced external foreign key
 * stops the cleanup instead of silently widening its reach.
 */

export const OWNED_TEST_DATABASE_MARKER_VARIABLE = "P01_TEST_DATABASE_URL";

export type OwnedTestDataResetReason =
  "environment" | "marker-missing" | "marker-mismatch" | "database-mismatch";

export class OwnedTestDataResetError extends Error {
  public readonly reason: OwnedTestDataResetReason;

  constructor(reason: OwnedTestDataResetReason, message: string) {
    super(message);
    this.name = "OwnedTestDataResetError";
    this.reason = reason;
  }
}

const databaseNameFromUri = (uri: string): string | null => {
  try {
    const { pathname } = new URL(uri);
    const name = pathname.replace(/^\//u, "");
    return name.length === 0 ? null : name;
  } catch {
    return null;
  }
};

const requireOwnedEnvironment = (): { marker: string } => {
  if (process.env["NODE_ENV"] !== "test") {
    throw new OwnedTestDataResetError(
      "environment",
      "Owned test data cleanup requires NODE_ENV=test.",
    );
  }

  const marker = process.env[OWNED_TEST_DATABASE_MARKER_VARIABLE];
  if (marker === undefined || marker.length === 0) {
    throw new OwnedTestDataResetError(
      "marker-missing",
      `Owned test data cleanup requires ${OWNED_TEST_DATABASE_MARKER_VARIABLE}.`,
    );
  }

  const configured = process.env["DATABASE_URL"];
  if (configured === undefined || configured !== marker) {
    throw new OwnedTestDataResetError(
      "marker-mismatch",
      `Owned test data cleanup requires ${OWNED_TEST_DATABASE_MARKER_VARIABLE} to match the active database URL.`,
    );
  }

  return { marker };
};

export const resetOwnedIdentityTestData = async (
  database: DatabaseClient,
): Promise<void> => {
  const { marker } = requireOwnedEnvironment();

  const expectedDatabaseName = databaseNameFromUri(marker);
  if (expectedDatabaseName === null) {
    throw new OwnedTestDataResetError(
      "marker-mismatch",
      "Owned test data cleanup requires a marker that names a database.",
    );
  }

  const [current] = await database.$queryRaw<
    Array<{
      current_database: string;
    }>
  >`SELECT current_database() AS current_database`;

  if (current?.current_database !== expectedDatabaseName) {
    throw new OwnedTestDataResetError(
      "database-mismatch",
      "Owned test data cleanup refused: the selected database is not the owned database.",
    );
  }

  await database.$executeRaw`TRUNCATE TABLE "sales_commands", "sales_draft_pieces", "sales_drafts", "customers", "staff_decisions", "initial_administrator_provisioning", "refresh_tokens", "users"`;
};
