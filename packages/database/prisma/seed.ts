import { createDatabaseClient } from "../src/client.js";
import {
  buildSeedCreate,
  isEmailUniqueConstraintViolation,
  parseSeedGroup,
  type SeedDecision,
} from "../src/seed-config.js";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const allowlistedErrorCodes = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1010",
  "P1011",
  "P1017",
  "P2002",
  "P2003",
  "P2034",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * A fixed classification plus an allowlisted code. No raw provider error,
 * stack, argument value, password hash or connection URI is ever logged.
 */
const describeFailure = (error: unknown): string => {
  if (error instanceof Error && error.name === "SeedConfigurationError") {
    return "SEED_CONFIGURATION";
  }
  if (isRecord(error)) {
    const code = error["code"];
    if (typeof code === "string" && allowlistedErrorCodes.has(code)) {
      return `DATABASE_ERROR ${code}`;
    }
  }
  return "UNEXPECTED_ERROR";
};

const seedEnabledGroups = async (): Promise<void> => {
  const nodeEnv = process.env["NODE_ENV"] ?? "development";
  const decisions = await Promise.all([
    parseSeedGroup("ADMIN", process.env, nodeEnv),
    parseSeedGroup("USER", process.env, nodeEnv),
  ]);
  const enabled = decisions.filter(
    (decision): decision is Extract<SeedDecision, { kind: "enabled" }> =>
      decision.kind === "enabled",
  );

  if (enabled.length === 0) {
    console.info("Seed skipped: no optional users were configured.");
    return;
  }

  const database = createDatabaseClient(databaseUrl);
  try {
    const now = new Date();
    for (const decision of enabled) {
      const existing = await database.user.findUnique({
        where: { email: decision.email },
        select: { id: true },
      });
      if (existing !== null) {
        console.info(
          `Seed skipped: optional ${decision.group.toLowerCase()} account already exists.`,
        );
        continue;
      }

      try {
        await database.user.create(buildSeedCreate(decision, now));
        console.info(
          `Seeded optional ${decision.group.toLowerCase()} account.`,
        );
      } catch (error) {
        if (!isEmailUniqueConstraintViolation(error)) throw error;
        const raced = await database.user.findUnique({
          where: { email: decision.email },
          select: { id: true },
        });
        if (raced === null) throw error;
        console.info(
          `Seed skipped: optional ${decision.group.toLowerCase()} account already exists.`,
        );
      }
    }
  } finally {
    await database.$disconnect();
  }
};

try {
  await seedEnabledGroups();
} catch (error) {
  console.error(`Seed failed: ${describeFailure(error)}`);
  process.exitCode = 1;
}
