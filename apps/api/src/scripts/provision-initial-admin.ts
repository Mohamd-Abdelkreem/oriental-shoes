import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@template/database";

import {
  InitialAdministratorError,
  InitialAdministratorService,
  type InitialAdministratorPreview,
  type InitialAdministratorResult,
} from "../modules/auth/initial-administrator.service.js";
import {
  InitialAdministratorArgumentsError,
  assertInitialAdministratorProductionAcknowledgement,
  parseInitialAdministratorArguments,
  type InitialAdministratorCliOptions,
} from "./initial-administrator.arguments.js";

/**
 * The standalone restricted initial-administrator procedure.
 *
 * The process parses and validates its arguments before it resolves a database
 * connection, and it prints only safe outcomes: an outcome classification, the
 * selected account id, the operator reference and the server time. It never
 * prints the database URL, a credential, a raw database error, a stack trace or
 * an argument value.
 */

export const INITIAL_ADMINISTRATOR_EXIT_OK = 0;
export const INITIAL_ADMINISTRATOR_EXIT_UNEXPECTED = 1;
export const INITIAL_ADMINISTRATOR_EXIT_ARGUMENT = 2;
export const INITIAL_ADMINISTRATOR_EXIT_INELIGIBLE = 3;

export const PROVISIONING_FAILED_OUTPUT = "PROVISIONING_FAILED";

/**
 * Masks an address for terminal confirmation. The operator confirms against the
 * address they supplied, never against a stored one.
 */
const maskEmail = (email: string): string => {
  const atIndex = email.lastIndexOf("@");

  if (atIndex <= 0) {
    return "***";
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf(".");
  const domainHead = dotIndex === -1 ? domain : domain.slice(0, dotIndex);
  const domainTail = dotIndex === -1 ? "" : domain.slice(dotIndex);

  return `${local.slice(0, 1)}***@${domainHead.slice(0, 1)}***${domainTail}`;
};

export const formatInitialAdministratorPreview = (
  preview: InitialAdministratorPreview,
): string => {
  const lines = [
    "outcome=PREVIEW",
    `eligible=${String(preview.eligible)}`,
    `reason=${preview.reason}`,
  ];

  if (preview.user === null) {
    lines.push("selected_id=none");
    return lines.join("\n");
  }

  lines.push(`selected_id=${preview.user.id}`);
  lines.push(`email_masked=${maskEmail(preview.user.email)}`);
  lines.push(`role=${preview.user.role}`);
  lines.push(`status=${preview.user.status}`);
  lines.push(`access_version=${String(preview.user.accessVersion)}`);

  return lines.join("\n");
};

export const formatInitialAdministratorResult = (
  result: InitialAdministratorResult,
): string =>
  [
    "outcome=PROVISIONED",
    `selected_id=${result.user.id}`,
    `operator_reference=${result.operatorReference}`,
    `occurred_at=${result.occurredAt}`,
  ].join("\n");

/**
 * Classifies a failed procedure. A known ineligible or stale outcome is safe to
 * report; every other failure is reported as PROVISIONING_FAILED alone.
 */
export const classifyInitialAdministratorFailure = (
  error: unknown,
): Readonly<{ exitCode: number; output: string }> => {
  if (error instanceof InitialAdministratorError) {
    return {
      exitCode: INITIAL_ADMINISTRATOR_EXIT_INELIGIBLE,
      output: ["outcome=REJECTED", `reason=${error.reason}`].join("\n"),
    };
  }

  return {
    exitCode: INITIAL_ADMINISTRATOR_EXIT_UNEXPECTED,
    output: PROVISIONING_FAILED_OUTPUT,
  };
};

/**
 * Runs the procedure once. The connection is resolved only after the argument
 * and environment gates passed, and it is always closed again.
 */
export const runInitialAdministratorProvisioning =
  async (): Promise<number> => {
    try {
      let options: InitialAdministratorCliOptions;

      try {
        options = parseInitialAdministratorArguments(process.argv.slice(2));
        assertInitialAdministratorProductionAcknowledgement(
          options,
          process.env["NODE_ENV"] === "production",
        );
      } catch (error) {
        if (error instanceof InitialAdministratorArgumentsError) {
          process.stderr.write(`ARGUMENT_ERROR: ${error.message}\n`);
          return INITIAL_ADMINISTRATOR_EXIT_ARGUMENT;
        }

        throw error;
      }

      const databaseUrl = process.env["DATABASE_URL"];

      if (databaseUrl === undefined || databaseUrl.length === 0) {
        process.stderr.write(`${PROVISIONING_FAILED_OUTPUT}\n`);
        return INITIAL_ADMINISTRATOR_EXIT_UNEXPECTED;
      }

      const database = createDatabaseClient(databaseUrl);

      try {
        const service = new InitialAdministratorService(database);

        if (!options.apply) {
          const preview = await service.preview(options.input);
          process.stdout.write(
            `${formatInitialAdministratorPreview(preview)}\n`,
          );
          return INITIAL_ADMINISTRATOR_EXIT_OK;
        }

        const result = await service.apply(options.input);
        process.stdout.write(`${formatInitialAdministratorResult(result)}\n`);
        return INITIAL_ADMINISTRATOR_EXIT_OK;
      } catch (error) {
        const classified = classifyInitialAdministratorFailure(error);

        if (classified.exitCode === INITIAL_ADMINISTRATOR_EXIT_INELIGIBLE) {
          process.stdout.write(`${classified.output}\n`);
        } else {
          process.stderr.write(`${classified.output}\n`);
        }

        return classified.exitCode;
      } finally {
        await database.$disconnect().catch(() => undefined);
      }
    } catch {
      process.stderr.write(`${PROVISIONING_FAILED_OUTPUT}\n`);
      return INITIAL_ADMINISTRATOR_EXIT_UNEXPECTED;
    }
  };

const isDirectExecution = (): boolean => {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  return resolve(entry) === fileURLToPath(import.meta.url);
};

if (isDirectExecution()) {
  process.exitCode = await runInitialAdministratorProvisioning();
}
