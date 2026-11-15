import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";
import {
  isSalesCommandIdConflict,
  isSalesTransactionConflict,
} from "../sales-commands/sales-command.errors.js";

export class WarehouseSelectionConflictError extends AppError {
  constructor() {
    super(
      "The selected warehouse work changed or is no longer eligible. Refresh and review the entire selection.",
      HTTP_STATUS.CONFLICT,
      "WAREHOUSE_SELECTION_CONFLICT",
    );
    this.name = "WarehouseSelectionConflictError";
  }
}

export class WarehouseCommandConflictError extends AppError {
  constructor() {
    super(
      "This warehouse command identifier is bound to a different action.",
      HTTP_STATUS.CONFLICT,
      "WAREHOUSE_COMMAND_CONFLICT",
    );
    this.name = "WarehouseCommandConflictError";
  }
}
export class WarehouseCommandNotFoundError extends AppError {
  constructor() {
    super(
      "The selected warehouse command result was not found.",
      HTTP_STATUS.NOT_FOUND,
      "WAREHOUSE_COMMAND_NOT_FOUND",
    );
    this.name = "WarehouseCommandNotFoundError";
  }
}
export class WarehouseTransactionConflictError extends AppError {
  constructor() {
    super(
      "The warehouse operation could not complete. Observe its original result before retrying.",
      HTTP_STATUS.CONFLICT,
      "WAREHOUSE_TRANSACTION_CONFLICT",
    );
    this.name = "WarehouseTransactionConflictError";
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const isWarehouseCommandIdConflict = (error: unknown): boolean =>
  isRecord(error) &&
  isRecord(error["meta"]) &&
  error["meta"]["modelName"] === "WarehouseCommand" &&
  isSalesCommandIdConflict(error);
export const isWarehouseTransactionConflict = (error: unknown): boolean => {
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
