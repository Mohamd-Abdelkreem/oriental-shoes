import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";
import { isSalesCommandIdConflict } from "../sales-commands/sales-command.errors.js";

export class ManufacturingSelectionConflictError extends AppError {
  constructor() {
    super(
      "The selected work changed or is no longer eligible. Refresh and review the selection.",
      HTTP_STATUS.CONFLICT,
      "MANUFACTURING_SELECTION_CONFLICT",
    );
    this.name = "ManufacturingSelectionConflictError";
  }
}
export class ManufacturingWorkUnchangedError extends AppError {
  constructor() {
    super(
      "The current worker already recorded this work. Refresh before another action.",
      HTTP_STATUS.CONFLICT,
      "MANUFACTURING_WORK_UNCHANGED",
    );
    this.name = "ManufacturingWorkUnchangedError";
  }
}
export class ManufacturingCommandConflictError extends AppError {
  constructor() {
    super(
      "This command identifier is bound to a different action.",
      HTTP_STATUS.CONFLICT,
      "MANUFACTURING_COMMAND_CONFLICT",
    );
    this.name = "ManufacturingCommandConflictError";
  }
}
export class ManufacturingCommandNotFoundError extends AppError {
  constructor() {
    super(
      "The selected manufacturing command result was not found.",
      HTTP_STATUS.NOT_FOUND,
      "MANUFACTURING_COMMAND_NOT_FOUND",
    );
    this.name = "ManufacturingCommandNotFoundError";
  }
}
export class ManufacturingTransactionConflictError extends AppError {
  constructor() {
    super(
      "The operation could not complete. Observe its result before retrying.",
      HTTP_STATUS.CONFLICT,
      "MANUFACTURING_TRANSACTION_CONFLICT",
    );
    this.name = "ManufacturingTransactionConflictError";
  }
}

const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  candidate !== null &&
  typeof candidate === "object" &&
  !Array.isArray(candidate);
export const isManufacturingCommandIdConflict = (error: unknown): boolean => {
  if (!isRecord(error) || error["code"] !== "P2002") return false;
  const meta = error["meta"];
  if (!isRecord(meta) || meta["modelName"] !== "ManufacturingCommand")
    return false;
  return isSalesCommandIdConflict(error);
};
