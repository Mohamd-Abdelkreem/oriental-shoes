import { AppError } from "../../core/errors/app.error.js";

export class AdministrationCommandNotFoundError extends AppError {
  constructor() {
    super(
      "The selected administration command result was not found.",
      404,
      "ADMINISTRATION_COMMAND_NOT_FOUND",
    );
    this.name = "AdministrationCommandNotFoundError";
  }
}

export class AdministrationSelectionConflictError extends AppError {
  constructor() {
    super(
      "The reviewed selection changed. Reload and review the exact pieces.",
      409,
      "ADMINISTRATION_SELECTION_CONFLICT",
    );
    this.name = "AdministrationSelectionConflictError";
  }
}

export class AdministrationCommandConflictError extends AppError {
  constructor() {
    super(
      "This command identifier is bound to a different action.",
      409,
      "ADMINISTRATION_COMMAND_CONFLICT",
    );
    this.name = "AdministrationCommandConflictError";
  }
}

export class AdministrationCorrectionUnchangedError extends AppError {
  constructor() {
    super(
      "The permitted correction fields are already current.",
      409,
      "ADMINISTRATION_CORRECTION_UNCHANGED",
    );
    this.name = "AdministrationCorrectionUnchangedError";
  }
}

export class AdministrationTransactionConflictError extends AppError {
  constructor() {
    super(
      "The operation could not complete. Observe its result before retrying.",
      409,
      "ADMINISTRATION_TRANSACTION_CONFLICT",
    );
    this.name = "AdministrationTransactionConflictError";
  }
}

export class ReportScopeTooLargeError extends AppError {
  constructor() {
    super(
      "The complete report exceeds its technical limit. Narrow the filters and retry.",
      422,
      "REPORT_SCOPE_TOO_LARGE",
    );
    this.name = "ReportScopeTooLargeError";
  }
}
