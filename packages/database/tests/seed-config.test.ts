import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import {
  buildSeedCreate,
  isEmailUniqueConstraintViolation,
  parseSeedGroup,
  SeedConfigurationError,
} from "../src/seed-config.js";

const complete = {
  SEED_ADMIN_EMAIL: "  Admin@Example.COM ",
  SEED_ADMIN_NAME: " Seed Administrator ",
  SEED_ADMIN_PASSWORD: "CorrectHorseBatteryStaple!42",
};

describe("optional seed groups", () => {
  it("skips when all three values are absent", async () => {
    await expect(parseSeedGroup("ADMIN", {}, "development")).resolves.toEqual({
      kind: "disabled",
      group: "ADMIN",
    });
  });

  it("fails clearly when any group is partial", async () => {
    await expect(
      parseSeedGroup(
        "USER",
        { SEED_USER_EMAIL: "user@example.com" },
        "development",
      ),
    ).rejects.toBeInstanceOf(SeedConfigurationError);
  });

  it("refuses configured credentials in production", async () => {
    await expect(
      parseSeedGroup("ADMIN", complete, "production"),
    ).rejects.toThrow(/production/iu);
  });

  it("normalizes email/name, enforces policy, and hashes with Argon2id", async () => {
    const decision = await parseSeedGroup("ADMIN", complete, "development");
    expect(decision.kind).toBe("enabled");
    if (decision.kind !== "enabled") return;
    expect(decision.email).toBe("admin@example.com");
    expect(decision.fullName).toBe("Seed Administrator");
    expect(decision.role).toBe("ADMIN");
    expect(decision.passwordHash).toMatch(/^\$argon2id\$/u);
    await expect(
      argon2.verify(decision.passwordHash, "CorrectHorseBatteryStaple!42"),
    ).resolves.toBe(true);
    expect(JSON.stringify(decision)).not.toContain(
      "CorrectHorseBatteryStaple!42",
    );
  });

  it("rejects passwords outside the configured policy", async () => {
    await expect(
      parseSeedGroup(
        "ADMIN",
        { ...complete, SEED_ADMIN_PASSWORD: "too-short" },
        "development",
      ),
    ).rejects.toThrow(/between 15 and 128/iu);
  });

  it("creates an administrator as a verified active account without employee fields", async () => {
    const decision = await parseSeedGroup("ADMIN", complete, "development");
    if (decision.kind !== "enabled") throw new Error("Expected enabled seed.");
    const now = new Date("2026-08-18T00:00:00.000Z");
    const args = buildSeedCreate(decision, now);

    expect(args.data).toMatchObject({
      email: "admin@example.com",
      fullName: "Seed Administrator",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      accessVersion: 0,
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    });
    expect(args).not.toHaveProperty("update");
    expect(args).not.toHaveProperty("where");
  });

  it("creates an employee as a verified pending-approval account without employee fields", async () => {
    const decision = await parseSeedGroup(
      "USER",
      {
        SEED_USER_EMAIL: "user@example.com",
        SEED_USER_NAME: "Seed User",
        SEED_USER_PASSWORD: "AnotherSecurePassword!42",
      },
      "development",
    );
    if (decision.kind !== "enabled") throw new Error("Expected enabled seed.");
    const now = new Date("2026-08-18T00:00:00.000Z");
    const args = buildSeedCreate(decision, now);

    expect(args.data).toMatchObject({
      email: "user@example.com",
      role: "USER",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: now,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      accessVersion: 0,
    });
    expect(JSON.stringify(args.data)).not.toContain('staffApprovedById":"');
  });

  it("supports the generic USER group without defaults", async () => {
    const decision = await parseSeedGroup(
      "USER",
      {
        SEED_USER_EMAIL: "user@example.com",
        SEED_USER_NAME: "Seed User",
        SEED_USER_PASSWORD: "AnotherSecurePassword!42",
      },
      "test",
    );
    expect(decision).toMatchObject({
      kind: "enabled",
      group: "USER",
      email: "user@example.com",
      role: "USER",
    });
  });
});

describe("email uniqueness classification", () => {
  const knownEmailConflict = {
    code: "P2002",
    meta: {
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["email"] },
        },
      },
    },
  };

  it("recognizes only the source-verified email uniqueness failure", () => {
    expect(isEmailUniqueConstraintViolation(knownEmailConflict)).toBe(true);
  });

  it("does not recognize an unrelated unique violation", () => {
    expect(
      isEmailUniqueConstraintViolation({
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              kind: "UniqueConstraintViolation",
              constraint: { fields: ["token_hash"] },
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("does not recognize another error code", () => {
    expect(
      isEmailUniqueConstraintViolation({
        ...knownEmailConflict,
        code: "P2003",
      }),
    ).toBe(false);
  });

  it("does not recognize an unrecognized error shape", () => {
    expect(isEmailUniqueConstraintViolation(new Error("boom"))).toBe(false);
    expect(isEmailUniqueConstraintViolation(undefined)).toBe(false);
    expect(isEmailUniqueConstraintViolation({ code: "P2002" })).toBe(false);
  });
});
