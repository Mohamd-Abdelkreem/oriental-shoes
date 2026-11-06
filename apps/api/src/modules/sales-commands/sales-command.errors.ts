import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";

export class SalesCommandNotFoundError extends AppError {
  constructor() {
    super(
      "The selected command result was not found.",
      HTTP_STATUS.NOT_FOUND,
      "SALES_COMMAND_NOT_FOUND",
    );
    this.name = "SalesCommandNotFoundError";
  }
}
export class SalesCommandConflictError extends AppError {
  constructor() {
    super(
      "This command identifier is bound to a different action.",
      HTTP_STATUS.CONFLICT,
      "SALES_COMMAND_CONFLICT",
    );
    this.name = "SalesCommandConflictError";
  }
}
export class SalesTransactionConflictError extends AppError {
  constructor() {
    super(
      "The operation could not complete. Check its result before retrying.",
      HTTP_STATUS.CONFLICT,
      "SALES_TRANSACTION_CONFLICT",
    );
    this.name = "SalesTransactionConflictError";
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const isSalesCommandIdConflict = (error: unknown): boolean => {
  if (!isRecord(error) || error["code"] !== "P2002") return false;
  const meta = error["meta"];
  if (!isRecord(meta)) return false;
  const adapter = meta["driverAdapterError"];
  if (!isRecord(adapter)) return false;
  const cause = adapter["cause"];
  if (!isRecord(cause) || cause["kind"] !== "UniqueConstraintViolation")
    return false;
  const constraint = cause["constraint"];
  if (!isRecord(constraint)) return false;
  const fields = constraint["fields"];
  return (
    Array.isArray(fields) && fields.length === 1 && fields[0] === "command_id"
  );
};
export const isSalesTransactionConflict = (error: unknown): boolean =>
  isRecord(error) && error["code"] === "P2034";
export const isSalesLockTimeout = (error: unknown): boolean => {
  if (!isRecord(error) || error["code"] !== "P2010") return false;
  const meta = error["meta"];
  if (!isRecord(meta)) return false;
  const adapter = meta["driverAdapterError"];
  if (!isRecord(adapter)) return false;
  const cause = adapter["cause"];
  if (!isRecord(cause) || cause["kind"] !== "postgres") return false;
  return cause["code"] === "55P03" || cause["originalCode"] === "55P03";
};
