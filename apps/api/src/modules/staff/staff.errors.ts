import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";

/**
 * The staff error code table from the identity/access contract. Every class owns
 * a fixed safe message, a stable status and the contract code. None of them
 * retains a cause, a request payload or a database value.
 */

export class StaffNotFoundError extends AppError {
  constructor() {
    super(
      "The selected staff account was not found.",
      HTTP_STATUS.NOT_FOUND,
      "STAFF_NOT_FOUND",
    );
    this.name = "StaffNotFoundError";
  }
}

export class StaffAdminTargetForbiddenError extends AppError {
  constructor() {
    super(
      "Administrator accounts cannot be managed as ordinary staff.",
      HTTP_STATUS.FORBIDDEN,
      "STAFF_ADMIN_TARGET_FORBIDDEN",
    );
    this.name = "StaffAdminTargetForbiddenError";
  }
}

export class StaffAccessConflictError extends AppError {
  constructor() {
    super(
      "The staff account changed since it was reviewed. Reload it and try again.",
      HTTP_STATUS.CONFLICT,
      "STAFF_ACCESS_CONFLICT",
    );
    this.name = "StaffAccessConflictError";
  }
}

export class StaffCommandConflictError extends AppError {
  constructor() {
    super(
      "This command identifier is already bound to a different staff action.",
      HTTP_STATUS.CONFLICT,
      "STAFF_COMMAND_CONFLICT",
    );
    this.name = "StaffCommandConflictError";
  }
}

export class StaffTransitionConflictError extends AppError {
  constructor() {
    super(
      "The staff account cannot make that change in its current state.",
      HTTP_STATUS.CONFLICT,
      "STAFF_TRANSITION_CONFLICT",
    );
    this.name = "StaffTransitionConflictError";
  }
}

const COMMAND_ID_CONSTRAINT_FIELDS = ["command_id"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.every((item: unknown): boolean => typeof item === "string");

/**
 * Reads the inspected adapter-pg unique-constraint fields of a Prisma P2002
 * failure. Only the nested driver-adapter shape is inspected; the top-level
 * `meta.target` is not a guaranteed source of the constraint identity.
 */
const readUniqueConstraintFields = (error: unknown): unknown => {
  if (!isRecord(error) || error["code"] !== "P2002") {
    return undefined;
  }
  const meta = error["meta"];
  if (!isRecord(meta)) {
    return undefined;
  }
  const driverError = meta["driverAdapterError"];
  if (!isRecord(driverError)) {
    return undefined;
  }
  const cause = driverError["cause"];
  if (!isRecord(cause) || cause["kind"] !== "UniqueConstraintViolation") {
    return undefined;
  }
  const constraint = cause["constraint"];
  if (!isRecord(constraint)) {
    return undefined;
  }
  return constraint["fields"];
};

/**
 * Recognizes only the global effective-command uniqueness race on the retained
 * staff decision receipt. An unrelated unique violation - a duplicate account
 * email, for example - is never classified as a command replay.
 */
export const isStaffCommandIdConflict = (error: unknown): boolean => {
  const fields = readUniqueConstraintFields(error);
  if (!isStringArray(fields)) {
    return false;
  }
  return (
    fields.length === COMMAND_ID_CONSTRAINT_FIELDS.length &&
    fields.every(
      (field, index) => field === COMMAND_ID_CONSTRAINT_FIELDS[index],
    )
  );
};
