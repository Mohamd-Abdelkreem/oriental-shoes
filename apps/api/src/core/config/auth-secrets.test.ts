import { describe, expect, it } from "vitest";

import {
  AuthSecretConfigurationError,
  readJwtSecrets,
} from "./auth-secrets.js";

const SENTINEL_ACCESS = "sentinel-access-secret-value-000000000";
const SENTINEL_REFRESH = "sentinel-refresh-secret-value-000000000";
const SENTINEL_VERIFICATION = "sentinel-verification-secret-00000000";
const SENTINEL_RESET = "sentinel-reset-secret-value-00000000000";

const productionEnvironment = (
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> => ({
  AUTH_JWT_SECRET: SENTINEL_ACCESS,
  AUTH_REFRESH_JWT_SECRET: SENTINEL_REFRESH,
  AUTH_VERIFICATION_JWT_SECRET: SENTINEL_VERIFICATION,
  AUTH_RESET_JWT_SECRET: SENTINEL_RESET,
  ...overrides,
});

const expectFailure = (
  environment: Readonly<Record<string, string | undefined>>,
  isProduction: boolean,
): string => {
  try {
    readJwtSecrets(environment, isProduction);
  } catch (error) {
    expect(error).toBeInstanceOf(AuthSecretConfigurationError);
    return (error as Error).message;
  }
  throw new Error("Expected the secret reader to reject the configuration.");
};

describe("production JWT secret configuration", () => {
  it("accepts four distinct explicit secrets", () => {
    const secrets = readJwtSecrets(productionEnvironment(), true);
    expect(secrets).toEqual({
      accessSecret: SENTINEL_ACCESS,
      refreshSecret: SENTINEL_REFRESH,
      verificationSecret: SENTINEL_VERIFICATION,
      resetSecret: SENTINEL_RESET,
    });
  });

  it("requires every secret to be explicit in production", () => {
    for (const key of [
      "AUTH_JWT_SECRET",
      "AUTH_REFRESH_JWT_SECRET",
      "AUTH_VERIFICATION_JWT_SECRET",
      "AUTH_RESET_JWT_SECRET",
    ]) {
      const environment = productionEnvironment({ [key]: undefined });
      const message = expectFailure(environment, true);
      expect(message).toContain(key);
    }
  });

  it("rejects a secret shorter than the minimum length", () => {
    const message = expectFailure(
      productionEnvironment({ AUTH_REFRESH_JWT_SECRET: "a".repeat(31) }),
      true,
    );
    expect(message).toContain("AUTH_REFRESH_JWT_SECRET");
    expect(message).toContain("32");
  });

  it("rejects an empty or whitespace-only secret", () => {
    expect(
      expectFailure(productionEnvironment({ AUTH_RESET_JWT_SECRET: "" }), true),
    ).toContain("AUTH_RESET_JWT_SECRET");
    expect(
      expectFailure(
        productionEnvironment({ AUTH_RESET_JWT_SECRET: " ".repeat(40) }),
        true,
      ),
    ).toContain("AUTH_RESET_JWT_SECRET");
  });

  it("rejects secrets that repeat each other", () => {
    const message = expectFailure(
      productionEnvironment({
        AUTH_VERIFICATION_JWT_SECRET: SENTINEL_ACCESS,
      }),
      true,
    );
    expect(message).toContain("AUTH_JWT_SECRET");
    expect(message).toContain("AUTH_VERIFICATION_JWT_SECRET");
  });

  it("rejects committed example and test placeholder prefixes", () => {
    for (const placeholder of [
      "replace-with-a-real-secret-value-000000",
      "test-only-access-secret-value-000000000",
      "changeme-change-this-secret-value-00000",
      "CHANGEME-CHANGE-THIS-SECRET-VALUE-000",
    ]) {
      const message = expectFailure(
        productionEnvironment({ AUTH_JWT_SECRET: placeholder }),
        true,
      );
      expect(message).toContain("AUTH_JWT_SECRET");
      expect(message).not.toContain(placeholder);
    }
  });

  it("never includes a secret value in a failure message", () => {
    const message = expectFailure(
      productionEnvironment({ AUTH_JWT_SECRET: SENTINEL_ACCESS.slice(0, 31) }),
      true,
    );
    expect(message).not.toContain(SENTINEL_ACCESS);
    expect(message).not.toContain(SENTINEL_ACCESS.slice(0, 31));
    expect(message).not.toContain(SENTINEL_REFRESH);
    expect(message).not.toContain(SENTINEL_VERIFICATION);
    expect(message).not.toContain(SENTINEL_RESET);
  });
});

describe("non-production JWT secret configuration", () => {
  it("falls back to the access secret for absent secondary secrets", () => {
    const secrets = readJwtSecrets({ AUTH_JWT_SECRET: SENTINEL_ACCESS }, false);
    expect(secrets).toEqual({
      accessSecret: SENTINEL_ACCESS,
      refreshSecret: SENTINEL_ACCESS,
      verificationSecret: SENTINEL_ACCESS,
      resetSecret: SENTINEL_ACCESS,
    });
  });

  it("keeps a supplied secondary secret", () => {
    const secrets = readJwtSecrets(
      {
        AUTH_JWT_SECRET: SENTINEL_ACCESS,
        AUTH_REFRESH_JWT_SECRET: SENTINEL_REFRESH,
      },
      false,
    );
    expect(secrets.refreshSecret).toBe(SENTINEL_REFRESH);
    expect(secrets.verificationSecret).toBe(SENTINEL_ACCESS);
  });

  it("rejects a supplied invalid secondary secret", () => {
    const message = expectFailure(
      {
        AUTH_JWT_SECRET: SENTINEL_ACCESS,
        AUTH_RESET_JWT_SECRET: "short",
      },
      false,
    );
    expect(message).toContain("AUTH_RESET_JWT_SECRET");
  });

  it("requires the access secret in every environment", () => {
    const message = expectFailure({}, false);
    expect(message).toContain("AUTH_JWT_SECRET");
  });
});
