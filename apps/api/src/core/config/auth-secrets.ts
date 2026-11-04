/**
 * Pure reader and validator for the JWT signing secrets.
 *
 * The reader takes the environment as an argument so the rules can be exercised
 * without touching `process.env` or the filesystem. Failures name the offending
 * environment variables only; no secret value is ever included in a message.
 */

export const JWT_SECRET_KEYS = Object.freeze({
  access: "AUTH_JWT_SECRET",
  refresh: "AUTH_REFRESH_JWT_SECRET",
  verification: "AUTH_VERIFICATION_JWT_SECRET",
  reset: "AUTH_RESET_JWT_SECRET",
});

export type JwtSecretKey = keyof typeof JWT_SECRET_KEYS;

export type JwtSecrets = Readonly<{
  accessSecret: string;
  refreshSecret: string;
  verificationSecret: string;
  resetSecret: string;
}>;

export const MINIMUM_JWT_SECRET_LENGTH = 32;

const PLACEHOLDER_PREFIXES = Object.freeze([
  "replace-with-",
  "test-only-",
  "changeme",
]);

export class AuthSecretConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthSecretConfigurationError";
  }
}

const isBlank = (value: string): boolean => value.trim().length === 0;

const hasPlaceholderPrefix = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const requireSecret = (
  key: string,
  value: string | undefined,
  requirement: string,
): string => {
  if (value === undefined || value.length === 0) {
    throw new AuthSecretConfigurationError(
      `Environment variable ${key} is required ${requirement}.`.replace(
        /\s+\./u,
        ".",
      ),
    );
  }
  if (value.length < MINIMUM_JWT_SECRET_LENGTH) {
    throw new AuthSecretConfigurationError(
      `Environment variable ${key} must contain at least ${String(MINIMUM_JWT_SECRET_LENGTH)} characters.`,
    );
  }
  if (isBlank(value)) {
    throw new AuthSecretConfigurationError(
      `Environment variable ${key} must not be whitespace only.`,
    );
  }
  return value;
};

const requireDistinct = (secrets: Readonly<JwtSecrets>): void => {
  const entries: ReadonlyArray<readonly [JwtSecretKey, string]> = [
    ["access", secrets.accessSecret],
    ["refresh", secrets.refreshSecret],
    ["verification", secrets.verificationSecret],
    ["reset", secrets.resetSecret],
  ];

  for (const [index, [leftKey, leftValue]] of entries.entries()) {
    for (const [rightKey, rightValue] of entries.slice(index + 1)) {
      if (leftValue === rightValue) {
        throw new AuthSecretConfigurationError(
          `Environment variables ${JWT_SECRET_KEYS[leftKey]} and ${JWT_SECRET_KEYS[rightKey]} must not share the same value.`,
        );
      }
    }
  }
};

export const readJwtSecrets = (
  env: Readonly<Record<string, string | undefined>>,
  isProduction: boolean,
): JwtSecrets => {
  const accessSecret = requireSecret(
    JWT_SECRET_KEYS.access,
    env[JWT_SECRET_KEYS.access],
    "",
  );

  if (!isProduction) {
    return Object.freeze({
      accessSecret,
      refreshSecret: requireSecret(
        JWT_SECRET_KEYS.refresh,
        env[JWT_SECRET_KEYS.refresh] ?? accessSecret,
        "",
      ),
      verificationSecret: requireSecret(
        JWT_SECRET_KEYS.verification,
        env[JWT_SECRET_KEYS.verification] ?? accessSecret,
        "",
      ),
      resetSecret: requireSecret(
        JWT_SECRET_KEYS.reset,
        env[JWT_SECRET_KEYS.reset] ?? accessSecret,
        "",
      ),
    });
  }

  const refreshSecret = requireSecret(
    JWT_SECRET_KEYS.refresh,
    env[JWT_SECRET_KEYS.refresh],
    "in production",
  );
  const verificationSecret = requireSecret(
    JWT_SECRET_KEYS.verification,
    env[JWT_SECRET_KEYS.verification],
    "in production",
  );
  const resetSecret = requireSecret(
    JWT_SECRET_KEYS.reset,
    env[JWT_SECRET_KEYS.reset],
    "in production",
  );

  const secrets: JwtSecrets = Object.freeze({
    accessSecret,
    refreshSecret,
    verificationSecret,
    resetSecret,
  });

  for (const [key, value] of [
    ["access", accessSecret],
    ["refresh", refreshSecret],
    ["verification", verificationSecret],
    ["reset", resetSecret],
  ] as const) {
    if (hasPlaceholderPrefix(value)) {
      throw new AuthSecretConfigurationError(
        `Environment variable ${JWT_SECRET_KEYS[key]} must not use a committed example or test placeholder value.`,
      );
    }
  }

  requireDistinct(secrets);

  return secrets;
};
