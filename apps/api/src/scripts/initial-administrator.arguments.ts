import { z } from "zod";

import type { InitialAdministratorInput } from "../modules/auth/initial-administrator.service.js";

/**
 * The pure command-line owner of the restricted initial-administrator procedure.
 * Parsing never connects a database and never prints an argument value.
 */

export type InitialAdministratorCliOptions = Readonly<{
  input: InitialAdministratorInput;
  apply: boolean;
  allowProduction: boolean;
}>;

/**
 * A rejected command line. The message names fixed flag names only; it never
 * echoes the rejected value.
 */
export class InitialAdministratorArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitialAdministratorArgumentsError";
  }
}

const USER_ID_FLAG = "--user-id";
const EXPECTED_EMAIL_FLAG = "--expected-email";
const EXPECTED_ACCESS_VERSION_FLAG = "--expected-access-version";
const OPERATOR_REFERENCE_FLAG = "--operator-reference";
const APPLY_FLAG = "--apply";
const ALLOW_PRODUCTION_FLAG = "--allow-production";

const VALUE_FLAGS: ReadonlySet<string> = new Set([
  USER_ID_FLAG,
  EXPECTED_EMAIL_FLAG,
  EXPECTED_ACCESS_VERSION_FLAG,
  OPERATOR_REFERENCE_FLAG,
]);

const MAXIMUM_ACCESS_VERSION = 2_147_483_647;
const MAXIMUM_OPERATOR_REFERENCE_LENGTH = 128;

/**
 * Rejects the control characters a terminal reference must never carry.
 */
const containsControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }

  return false;
};

const userIdSchema = z.uuid();
const expectedEmailSchema = z.email().max(320);
const expectedAccessVersionSchema = z.string().regex(/^\d{1,10}$/u);
const operatorReferenceSchema = z
  .string()
  .min(1)
  .max(MAXIMUM_OPERATOR_REFERENCE_LENGTH)
  .refine((value) => !containsControlCharacter(value));

/**
 * Reads the value that follows a value flag. A following token that itself
 * looks like a flag is never consumed as a value.
 */
const readValueArgument = (
  args: readonly string[],
  index: number,
): string | undefined => {
  const next = args[index + 1];

  if (next === undefined || next.startsWith("--")) {
    return undefined;
  }

  return next;
};

const requireFlagValue = (
  values: ReadonlyMap<string, string>,
  flag: string,
): string => {
  const value = values.get(flag);

  if (value === undefined) {
    throw new InitialAdministratorArgumentsError(`${flag} is required.`);
  }

  return value;
};

/**
 * Parses and validates the standalone procedure arguments.
 *
 * The default is a preview. Unknown, duplicated, missing and invalid arguments
 * are refused before any connection is opened.
 */
export const parseInitialAdministratorArguments = (
  args: readonly string[],
): InitialAdministratorCliOptions => {
  const values = new Map<string, string>();
  let apply = false;
  let allowProduction = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      continue;
    }

    const separatorIndex = token.indexOf("=");
    const flag = separatorIndex === -1 ? token : token.slice(0, separatorIndex);
    const inlineValue =
      separatorIndex === -1 ? undefined : token.slice(separatorIndex + 1);

    if (flag === APPLY_FLAG || flag === ALLOW_PRODUCTION_FLAG) {
      if (inlineValue !== undefined) {
        throw new InitialAdministratorArgumentsError(
          `${flag} does not take a value.`,
        );
      }

      if (flag === APPLY_FLAG) {
        if (apply) {
          throw new InitialAdministratorArgumentsError(
            `${APPLY_FLAG} was provided more than once.`,
          );
        }
        apply = true;
      } else {
        if (allowProduction) {
          throw new InitialAdministratorArgumentsError(
            `${ALLOW_PRODUCTION_FLAG} was provided more than once.`,
          );
        }
        allowProduction = true;
      }

      continue;
    }

    if (!VALUE_FLAGS.has(flag)) {
      throw new InitialAdministratorArgumentsError("Unknown argument.");
    }

    if (values.has(flag)) {
      throw new InitialAdministratorArgumentsError(
        `${flag} was provided more than once.`,
      );
    }

    const value = inlineValue ?? readValueArgument(args, index);

    if (value === undefined) {
      throw new InitialAdministratorArgumentsError(`${flag} requires a value.`);
    }

    values.set(flag, value);

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  const parsedUserId = userIdSchema.safeParse(
    requireFlagValue(values, USER_ID_FLAG).trim(),
  );

  if (!parsedUserId.success) {
    throw new InitialAdministratorArgumentsError(
      `${USER_ID_FLAG} must be a UUID.`,
    );
  }

  const parsedEmail = expectedEmailSchema.safeParse(
    requireFlagValue(values, EXPECTED_EMAIL_FLAG).trim(),
  );

  if (!parsedEmail.success) {
    throw new InitialAdministratorArgumentsError(
      `${EXPECTED_EMAIL_FLAG} must be an email address.`,
    );
  }

  const rawAccessVersion = requireFlagValue(
    values,
    EXPECTED_ACCESS_VERSION_FLAG,
  ).trim();
  const parsedAccessVersion =
    expectedAccessVersionSchema.safeParse(rawAccessVersion);

  if (!parsedAccessVersion.success) {
    throw new InitialAdministratorArgumentsError(
      `${EXPECTED_ACCESS_VERSION_FLAG} must be a nonnegative integer.`,
    );
  }

  const expectedAccessVersion = Number(rawAccessVersion);

  if (expectedAccessVersion > MAXIMUM_ACCESS_VERSION) {
    throw new InitialAdministratorArgumentsError(
      `${EXPECTED_ACCESS_VERSION_FLAG} must not exceed ${String(MAXIMUM_ACCESS_VERSION)}.`,
    );
  }

  const operatorReference = requireFlagValue(
    values,
    OPERATOR_REFERENCE_FLAG,
  ).trim();
  const parsedOperatorReference =
    operatorReferenceSchema.safeParse(operatorReference);

  if (!parsedOperatorReference.success) {
    throw new InitialAdministratorArgumentsError(
      `${OPERATOR_REFERENCE_FLAG} must be a nonblank reference of at most ${String(MAXIMUM_OPERATOR_REFERENCE_LENGTH)} characters without control characters.`,
    );
  }

  return {
    input: {
      userId: parsedUserId.data.toLowerCase(),
      expectedEmail: parsedEmail.data.toLowerCase(),
      expectedAccessVersion,
      operatorReference: parsedOperatorReference.data,
    },
    apply,
    allowProduction,
  };
};

/**
 * The production acknowledgment is a process safeguard. It never replaces the
 * separate environment authorization of a real production action.
 */
export const assertInitialAdministratorProductionAcknowledgement = (
  options: InitialAdministratorCliOptions,
  isProduction: boolean,
): void => {
  if (isProduction && options.apply && !options.allowProduction) {
    throw new InitialAdministratorArgumentsError(
      `${ALLOW_PRODUCTION_FLAG} is required to apply in production.`,
    );
  }
};
