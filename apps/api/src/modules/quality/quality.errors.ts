import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";
import {
  isSalesCommandIdConflict,
  isSalesTransactionConflict,
} from "../sales-commands/sales-command.errors.js";

export class QualitySelectionConflictError extends AppError {
  constructor() {
    super(
      "The selected quality work changed or is no longer eligible. Refresh and review the entire selection.",
      HTTP_STATUS.CONFLICT,
      "QUALITY_SELECTION_CONFLICT",
    );
    this.name = "QualitySelectionConflictError";
  }
}
export class QualityWorkUnchangedError extends AppError {
  constructor() {
    super(
      "The current worker already recorded this quality work. Review before another action.",
      HTTP_STATUS.CONFLICT,
      "QUALITY_WORK_UNCHANGED",
    );
    this.name = "QualityWorkUnchangedError";
  }
}
export class QualityCommandConflictError extends AppError {
  constructor() {
    super(
      "This quality command identifier is bound to a different action.",
      HTTP_STATUS.CONFLICT,
      "QUALITY_COMMAND_CONFLICT",
    );
    this.name = "QualityCommandConflictError";
  }
}
export class QualityCommandNotFoundError extends AppError {
  constructor() {
    super(
      "The selected quality command result was not found.",
      HTTP_STATUS.NOT_FOUND,
      "QUALITY_COMMAND_NOT_FOUND",
    );
    this.name = "QualityCommandNotFoundError";
  }
}
export class QualityTransactionConflictError extends AppError {
  constructor() {
    super(
      "The quality operation could not complete. Observe its original result before retrying.",
      HTTP_STATUS.CONFLICT,
      "QUALITY_TRANSACTION_CONFLICT",
    );
    this.name = "QualityTransactionConflictError";
  }
}
const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  candidate !== null &&
  typeof candidate === "object" &&
  !Array.isArray(candidate);
export const isQualityCommandIdConflict = (error: unknown): boolean => {
  if (!isRecord(error) || error["code"] !== "P2002") return false;
  const meta = error["meta"];
  return (
    isRecord(meta) &&
    meta["modelName"] === "QualityCommand" &&
    isSalesCommandIdConflict(error)
  );
};

export const isQualityTransactionConflict = (error: unknown): boolean => {
  if (isSalesTransactionConflict(error)) return true;
  if (!isRecord(error) || error["code"] !== "P2010") return false;
  const meta = error["meta"];
  if (!isRecord(meta)) return false;
  const adapter = meta["driverAdapterError"];
  if (!isRecord(adapter)) return false;
  const cause = adapter["cause"];
  if (!isRecord(cause)) return false;
  return (
    (cause["kind"] === "TransactionWriteConflict" &&
      cause["originalCode"] === "40001") ||
    (cause["kind"] === "postgres" &&
      cause["code"] === "40P01" &&
      cause["originalCode"] === "40P01")
  );
};
