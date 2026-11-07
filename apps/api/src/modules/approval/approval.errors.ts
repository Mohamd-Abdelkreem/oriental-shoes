import { AppError } from "../../core/errors/app.error.js";
import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";

export class ApprovalCommandConflictError extends AppError {
  constructor() {
    super(
      "This command identifier is bound to a different action.",
      HTTP_STATUS.CONFLICT,
      "APPROVAL_COMMAND_CONFLICT",
    );
    this.name = "ApprovalCommandConflictError";
  }
}
export class ApprovalCommandNotFoundError extends AppError {
  constructor() {
    super(
      "The selected approval command result was not found.",
      HTTP_STATUS.NOT_FOUND,
      "APPROVAL_COMMAND_NOT_FOUND",
    );
    this.name = "ApprovalCommandNotFoundError";
  }
}
export class ApprovalTransactionConflictError extends AppError {
  constructor() {
    super(
      "The operation could not complete. Observe its result before retrying.",
      HTTP_STATUS.CONFLICT,
      "APPROVAL_TRANSACTION_CONFLICT",
    );
    this.name = "ApprovalTransactionConflictError";
  }
}

export class ApprovalIssueConflictError extends AppError {
  constructor() {
    super(
      "The selected issue or piece state has changed.",
      HTTP_STATUS.CONFLICT,
      "APPROVAL_ISSUE_CONFLICT",
    );
    this.name = "ApprovalIssueConflictError";
  }
}

export class ApprovalIssueNotFoundError extends AppError {
  constructor() {
    super(
      "The selected manufacturing issue was not found.",
      HTTP_STATUS.NOT_FOUND,
      "APPROVAL_ISSUE_NOT_FOUND",
    );
    this.name = "ApprovalIssueNotFoundError";
  }
}

export class ApprovalProposalConflictError extends AppError {
  constructor() {
    super(
      "The selected proposal is no longer current or cannot receive this decision.",
      HTTP_STATUS.CONFLICT,
      "APPROVAL_PROPOSAL_CONFLICT",
    );
    this.name = "ApprovalProposalConflictError";
  }
}

export class ApprovalEventNotFoundError extends AppError {
  constructor() {
    super(
      "The selected approval event was not found.",
      HTTP_STATUS.NOT_FOUND,
      "APPROVAL_EVENT_NOT_FOUND",
    );
    this.name = "ApprovalEventNotFoundError";
  }
}

export class OrderPrintNotApprovedError extends AppError {
  constructor() {
    super(
      "The order has no qualifying official approval.",
      HTTP_STATUS.CONFLICT,
      "ORDER_PRINT_NOT_APPROVED",
    );
    this.name = "OrderPrintNotApprovedError";
  }
}
export class OrderPrintReturnedError extends AppError {
  constructor() {
    super(
      "The current order revision has been returned.",
      HTTP_STATUS.CONFLICT,
      "ORDER_PRINT_RETURNED",
    );
    this.name = "OrderPrintReturnedError";
  }
}
export class OrderPrintReapprovalPendingError extends AppError {
  constructor() {
    super(
      "Official printing is held pending piece reapproval.",
      HTTP_STATUS.CONFLICT,
      "ORDER_PRINT_REAPPROVAL_PENDING",
    );
    this.name = "OrderPrintReapprovalPendingError";
  }
}
