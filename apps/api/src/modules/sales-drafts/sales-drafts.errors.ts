import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";

export class DraftNotFoundError extends AppError {
  constructor() {
    super(
      "The selected draft was not found.",
      HTTP_STATUS.NOT_FOUND,
      "DRAFT_NOT_FOUND",
    );
    this.name = "DraftNotFoundError";
  }
}
export class DraftVersionConflictError extends AppError {
  constructor() {
    super(
      "The draft changed. Reload and review before saving.",
      HTTP_STATUS.CONFLICT,
      "DRAFT_VERSION_CONFLICT",
    );
    this.name = "DraftVersionConflictError";
  }
}
export class DraftStateConflictError extends AppError {
  constructor() {
    super(
      "The draft is no longer editable.",
      HTTP_STATUS.CONFLICT,
      "DRAFT_STATE_CONFLICT",
    );
    this.name = "DraftStateConflictError";
  }
}
export class DraftPieceConflictError extends AppError {
  constructor() {
    super(
      "A removed piece cannot be restored. Reload and review the draft.",
      HTTP_STATUS.CONFLICT,
      "DRAFT_PIECE_CONFLICT",
    );
    this.name = "DraftPieceConflictError";
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const isDraftPieceIdConflict = (error: unknown): boolean => {
  if (!isRecord(error) || error["code"] !== "P2002") return false;
  const meta = error["meta"];
  if (!isRecord(meta) || meta["modelName"] !== "SalesDraftPiece") return false;
  const adapter = meta["driverAdapterError"];
  if (!isRecord(adapter)) return false;
  const cause = adapter["cause"];
  if (!isRecord(cause) || cause["kind"] !== "UniqueConstraintViolation")
    return false;
  const constraint = cause["constraint"];
  if (!isRecord(constraint)) return false;
  const fields = constraint["fields"];
  return Array.isArray(fields) && fields.length === 1 && fields[0] === "id";
};
