import argon2 from "argon2";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@template/contracts";

import {
  UserRole,
  UserStatus,
  type Prisma,
} from "./generated/prisma/client.js";

export type SeedGroupName = "ADMIN" | "USER";
export type SeedDecision =
  | Readonly<{ kind: "disabled"; group: SeedGroupName }>
  | Readonly<{
      kind: "enabled";
      group: SeedGroupName;
      email: string;
      fullName: string;
      passwordHash: string;
      role: UserRole;
    }>;

export class SeedConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedConfigurationError";
  }
}

type SeedEnvironment = Readonly<Record<string, string | undefined>>;

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

export const parseSeedGroup = async (
  group: SeedGroupName,
  environment: SeedEnvironment,
  nodeEnv: string,
): Promise<SeedDecision> => {
  const keys = [
    `SEED_${group}_EMAIL`,
    `SEED_${group}_NAME`,
    `SEED_${group}_PASSWORD`,
  ] as const;
  const values = keys.map((key) => environment[key]);
  const present = values.filter((value) => value !== undefined).length;
  if (present === 0) return { kind: "disabled", group };
  if (present !== values.length) {
    throw new SeedConfigurationError(
      `${keys.join(", ")} must be configured together.`,
    );
  }
  if (nodeEnv === "production") {
    throw new SeedConfigurationError(
      `Refusing to seed ${group.toLowerCase()} credentials in production.`,
    );
  }

  const email = (values[0] ?? "").trim().toLowerCase();
  const fullName = (values[1] ?? "").trim();
  const password = values[2] ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)) {
    throw new SeedConfigurationError(`SEED_${group}_EMAIL is invalid.`);
  }
  if (fullName.length === 0) {
    throw new SeedConfigurationError(`SEED_${group}_NAME is required.`);
  }
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new SeedConfigurationError(
      `SEED_${group}_PASSWORD must contain between ${String(PASSWORD_MIN_LENGTH)} and ${String(PASSWORD_MAX_LENGTH)} characters.`,
    );
  }

  return {
    kind: "enabled",
    group,
    email,
    fullName,
    passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
    role: group === "ADMIN" ? UserRole.ADMIN : UserRole.USER,
  };
};

export const buildSeedCreate = (
  decision: Extract<SeedDecision, { kind: "enabled" }>,
  now: Date,
): Prisma.UserCreateArgs => {
  const account = {
    email: decision.email,
    fullName: decision.fullName,
    passwordHash: decision.passwordHash,
    role: decision.role,
    status:
      decision.role === UserRole.ADMIN
        ? UserStatus.ACTIVE
        : UserStatus.PENDING_APPROVAL,
    emailVerifiedAt: now,
    department: null,
    staffApprovedAt: null,
    staffApprovedById: null,
    accessVersion: 0,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
  } satisfies Prisma.UserUncheckedCreateInput;
  return { data: account };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Recognizes only the source-verified email uniqueness failure of the
 * PostgreSQL adapter. Every other unique violation keeps propagating.
 */
export const isEmailUniqueConstraintViolation = (error: unknown): boolean => {
  if (!isRecord(error)) return false;
  if (error["code"] !== "P2002") return false;

  const meta = error["meta"];
  if (!isRecord(meta)) return false;
  const driverAdapterError = meta["driverAdapterError"];
  if (!isRecord(driverAdapterError)) return false;
  const cause = driverAdapterError["cause"];
  if (!isRecord(cause)) return false;
  if (cause["kind"] !== "UniqueConstraintViolation") return false;

  const constraint = cause["constraint"];
  if (!isRecord(constraint)) return false;

  const fields = constraint["fields"];
  if (Array.isArray(fields)) {
    const names = fields.filter(
      (field): field is string => typeof field === "string",
    );
    return (
      names.length === fields.length &&
      names.length === 1 &&
      names[0] === "email"
    );
  }

  return constraint["name"] === "users_email_key";
};
