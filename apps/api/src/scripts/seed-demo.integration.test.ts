import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeAll, expect, it } from "vitest";

import { generateHash } from "../infrastructure/security/password-hasher.js";
import { CatalogLoaderService } from "../modules/catalogs/catalog-loader.service.js";
import { resetOwnedIdentityTestData } from "../test-support/reset-test-data.js";
import { syntheticCatalogPreview } from "../test-support/reviewed-catalog.fixture.js";

const databaseUrl = process.env["P01_TEST_DATABASE_URL"];
if (!databaseUrl || databaseUrl !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");

const database = createDatabaseClient(databaseUrl);
const execFileAsync = promisify(execFile);

beforeAll(() => resetOwnedIdentityTestData(database));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(database);
  } finally {
    await database.$disconnect();
  }
});

const runSeed = (environment: NodeJS.ProcessEnv) =>
  execFileAsync(
    process.execPath,
    ["--conditions=development", "--import", "tsx", "src/scripts/seed-demo.ts"],
    {
      env: { ...process.env, NODE_ENV: "development", ...environment },
      timeout: 90_000,
    },
  );

it("refuses nonlocal PostgreSQL before connecting or creating accounts", async () => {
  await expect(
    runSeed({ DATABASE_URL: "postgresql://database.invalid/demo" }),
  ).rejects.toThrow("requires a loopback PostgreSQL");
});

it("creates role-owned orders and histories across all workspaces through the demo seed command", async () => {
  const email = "seed-test-admin@example.invalid";
  const password = `Local!${randomBytes(16).toString("hex")}`;
  const existingAdmin = await database.user.create({
    data: {
      email,
      fullName: "Test administrator",
      passwordHash: await generateHash(password),
      status: "ACTIVE",
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  await new CatalogLoaderService(database).apply(
    syntheticCatalogPreview(),
    new URL(databaseUrl).pathname.slice(1),
  );
  let output = "";
  try {
    const command = runSeed({
      DATABASE_URL: databaseUrl,
      DEMO_ADMIN_EMAIL: email,
      DEMO_ADMIN_PASSWORD: password,
      ORDER_BUSINESS_TIME_ZONE: "UTC",
    });
    try {
      output = (await command).stdout;
    } catch (error) {
      if (
        error instanceof Error &&
        "stdout" in error &&
        typeof error.stdout === "string"
      )
        output = error.stdout;
      throw error;
    }
    const batch = /Staff sign-in details: \.env\.demo-([a-f0-9]{10})/u.exec(
      output,
    )?.[1];
    expect(batch).toBeDefined();
    const credentialsFile = new URL(
      `../../../../.env.demo-${batch ?? ""}`,
      import.meta.url,
    );
    expect((await stat(credentialsFile)).mode & 0o777).toBe(0o600);
    const orders = await database.salesOrder.findMany({
      select: {
        status: true,
        draft: { select: { type: true } },
        pieces: { select: { stage: true, receivedAt: true } },
        submittedBy: { select: { department: true } },
      },
    });
    expect(orders).toHaveLength(47);
    expect(
      orders.every(({ submittedBy }) => submittedBy.department === "SALES"),
    ).toBe(true);
    expect(new Set(orders.map(({ draft }) => draft.type)).size).toBe(7);
    expect(orders.map(({ status }) => status)).toEqual(
      expect.arrayContaining([
        "AWAITING_APPROVAL",
        "RETURNED",
        "APPROVED",
        "READY_FOR_DELIVERY",
        "OUT_FOR_DELIVERY",
        "DELIVERY_FAILED",
        "DELIVERED",
        "CANCELLED",
      ]),
    );
    expect(
      orders.some(
        ({ pieces }) =>
          new Set(pieces.map(({ stage }) => stage)).size === 4 &&
          pieces.some(({ receivedAt }) => receivedAt !== null),
      ),
    ).toBe(true);
    expect(
      await database.salesDraft.count({ where: { status: "DRAFT" } }),
    ).toBe(7);
    expect(await database.qualityCorrectionCycle.count()).toBeGreaterThan(0);
    expect(await database.warehouseDeliveryRetry.count()).toBeGreaterThan(0);
    const manufacturing = await database.manufacturingCommand.findMany({
      select: { actorDepartment: true, department: true },
    });
    expect(manufacturing.map(({ actorDepartment }) => actorDepartment)).toEqual(
      expect.arrayContaining(["CUTTING", "PRODUCTION"]),
    );
    expect(
      manufacturing.every(
        ({ actorDepartment, department }) => actorDepartment === department,
      ),
    ).toBe(true);
    expect(
      await database.user.findUnique({ where: { id: existingAdmin.id } }),
    ).toEqual(existingAdmin);
  } finally {
    const credentials =
      /Staff sign-in details: (\.env\.demo-[a-f0-9]{10})/u.exec(output)?.[1];
    if (credentials)
      await rm(new URL(`../../../../${credentials}`, import.meta.url), {
        force: true,
      });
  }
});
