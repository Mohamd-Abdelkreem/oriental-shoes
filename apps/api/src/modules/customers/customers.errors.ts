import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";

export class CustomerNotFoundError extends AppError {
  constructor() {
    super(
      "The selected customer was not found.",
      HTTP_STATUS.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
    );
    this.name = "CustomerNotFoundError";
  }
}
export class CustomerPhoneConflictError extends AppError {
  constructor() {
    super(
      "This phone belongs to an existing customer.",
      HTTP_STATUS.CONFLICT,
      "CUSTOMER_PHONE_CONFLICT",
    );
    this.name = "CustomerPhoneConflictError";
  }
}
export class CustomerVersionConflictError extends AppError {
  constructor() {
    super(
      "The customer changed. Reload and review before saving.",
      HTTP_STATUS.CONFLICT,
      "CUSTOMER_VERSION_CONFLICT",
    );
    this.name = "CustomerVersionConflictError";
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const isCustomerPhoneConflict = (error: unknown): boolean => {
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
  return Array.isArray(fields) && fields.length === 1 && fields[0] === "phone";
};
