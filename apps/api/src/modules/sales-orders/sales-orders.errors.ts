import { AppError } from "../../core/errors/app.error.js";
import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";

export class OrderNotFoundError extends AppError {
  constructor() {
    super(
      "The selected order was not found.",
      HTTP_STATUS.NOT_FOUND,
      "ORDER_NOT_FOUND",
    );
    this.name = "OrderNotFoundError";
  }
}

export class OrderRevisionNotFoundError extends AppError {
  constructor() {
    super(
      "The selected order revision was not found.",
      HTTP_STATUS.NOT_FOUND,
      "ORDER_REVISION_NOT_FOUND",
    );
    this.name = "OrderRevisionNotFoundError";
  }
}

export class OrderVersionConflictError extends AppError {
  constructor() {
    super(
      "The order changed. Reload and review your input.",
      HTTP_STATUS.CONFLICT,
      "ORDER_VERSION_CONFLICT",
    );
    this.name = "OrderVersionConflictError";
  }
}

export class OrderStateConflictError extends AppError {
  constructor() {
    super(
      "The order is not eligible for this action.",
      HTTP_STATUS.CONFLICT,
      "ORDER_STATE_CONFLICT",
    );
    this.name = "OrderStateConflictError";
  }
}

export class OrderCustomerChangedError extends AppError {
  constructor() {
    super(
      "The customer changed. Review the current contact before submitting.",
      HTTP_STATUS.CONFLICT,
      "ORDER_CUSTOMER_CHANGED",
    );
    this.name = "OrderCustomerChangedError";
  }
}

export class OrderQuoteChangedError extends AppError {
  constructor() {
    super(
      "The quoted terms changed. Review a fresh quote before submitting.",
      HTTP_STATUS.CONFLICT,
      "ORDER_QUOTE_CHANGED",
    );
    this.name = "OrderQuoteChangedError";
  }
}

export class OrderCorrectionConflictError extends AppError {
  constructor() {
    super(
      "The correction changes fixed order terms or membership.",
      HTTP_STATUS.CONFLICT,
      "ORDER_CORRECTION_CONFLICT",
    );
    this.name = "OrderCorrectionConflictError";
  }
}

export class OrderPaidUnchangedError extends AppError {
  constructor() {
    super(
      "The cumulative paid amount is already current.",
      HTTP_STATUS.CONFLICT,
      "ORDER_PAID_UNCHANGED",
    );
    this.name = "OrderPaidUnchangedError";
  }
}

export class OrderCatalogUnavailableError extends AppError {
  constructor() {
    super(
      "A reviewed catalog and valid prices are required for submission.",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "ORDER_CATALOG_UNAVAILABLE",
    );
    this.name = "OrderCatalogUnavailableError";
  }
}

export class OrderNumberUnavailableError extends AppError {
  constructor() {
    super(
      "Order numbering is unavailable.",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "ORDER_NUMBER_UNAVAILABLE",
    );
    this.name = "OrderNumberUnavailableError";
  }
}

export class OrderCalendarUnavailableError extends AppError {
  constructor() {
    super(
      "The order business calendar is unavailable.",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "ORDER_CALENDAR_UNAVAILABLE",
    );
    this.name = "OrderCalendarUnavailableError";
  }
}
