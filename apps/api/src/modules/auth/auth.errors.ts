import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";

export class AccountRestrictedError extends AppError {
  constructor() {
    super(
      "This account does not have current business access.",
      HTTP_STATUS.FORBIDDEN,
      "ACCOUNT_RESTRICTED",
    );
    this.name = "AccountRestrictedError";
  }
}

export class DepartmentAccessDeniedError extends AppError {
  constructor() {
    super(
      "This action is not available for your department.",
      HTTP_STATUS.FORBIDDEN,
      "DEPARTMENT_ACCESS_DENIED",
    );
    this.name = "DepartmentAccessDeniedError";
  }
}
