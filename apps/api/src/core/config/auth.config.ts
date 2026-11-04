import { readJwtSecrets } from "./auth-secrets.js";
import { getEnvVarAsInteger, getEnvVariable } from "./env.js";

const nodeEnv = getEnvVariable("NODE_ENV", "development");
const isProduction = nodeEnv === "production";

const { accessSecret, refreshSecret, verificationSecret, resetSecret } =
  readJwtSecrets(process.env, isProduction);
export const authConfig = Object.freeze({
  nodeEnv,
  isProduction,
  issuer: getEnvVariable("AUTH_JWT_ISSUER", "full-stack-boilerplate"),
  audience: getEnvVariable("AUTH_JWT_AUDIENCE", "full-stack-boilerplate-web"),
  clockToleranceSeconds: getEnvVarAsInteger(
    "AUTH_JWT_CLOCK_TOLERANCE_SECONDS",
    5,
    0,
    60,
  ),
  accessTokenTtlSeconds: getEnvVarAsInteger(
    "AUTH_ACCESS_TOKEN_TTL_SECONDS",
    15 * 60,
    60,
    86_400,
  ),
  refreshFamilyTtlSeconds: getEnvVarAsInteger(
    "AUTH_REFRESH_FAMILY_TTL_SECONDS",
    24 * 60 * 60,
    3_600,
    60 * 60 * 24 * 90,
  ),
  refreshRememberedTtlSeconds: getEnvVarAsInteger(
    "AUTH_REFRESH_REMEMBERED_TTL_SECONDS",
    30 * 24 * 60 * 60,
    3_600,
    60 * 60 * 24 * 180,
  ),
  verifyTokenTtlSeconds: getEnvVarAsInteger(
    "AUTH_VERIFY_TOKEN_TTL_SECONDS",
    24 * 60 * 60,
    60,
    60 * 60 * 24 * 7,
  ),
  resetTokenTtlSeconds: getEnvVarAsInteger(
    "AUTH_RESET_TOKEN_TTL_SECONDS",
    30 * 60,
    60,
    3_600,
  ),
  verifyResendCooldownSeconds: getEnvVarAsInteger(
    "AUTH_VERIFY_RESEND_COOLDOWN_SECONDS",
    60,
    1,
    3_600,
  ),
  argon2: Object.freeze({
    memoryKib: getEnvVarAsInteger(
      "AUTH_ARGON2_MEMORY_KIB",
      19_456,
      1_944,
      1_048_576,
    ),
    timeCost: getEnvVarAsInteger("AUTH_ARGON2_TIME_COST", 2, 1, 10),
    parallelism: getEnvVarAsInteger("AUTH_ARGON2_PARALLELISM", 1, 1, 16),
  }),
});

export const jwtConfig = Object.freeze({
  accessSecret,
  refreshSecret,
  verificationSecret,
  resetSecret,
});
