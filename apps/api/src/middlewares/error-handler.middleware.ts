import type { ErrorRequestHandler } from "express";

import type { ErrorEnvelope } from "@template/contracts";

import { appConfig } from "../core/config/app.config.js";
import { HTTP_STATUS } from "../core/constants/http-status.constants.js";
import { AppError } from "../core/errors/app.error.js";
import { InternalServerError } from "../core/errors/internal-server.error.js";
import { mapPrismaError } from "../infrastructure/database/prisma-error.mapper.js";

const createErrorResponse = (
  error: AppError,
  path: string,
  requestId: string,
  omitStack = false,
): ErrorEnvelope => ({
  success: false,
  statusCode: error.statusCode,
  code: error.code,
  message: error.message,
  errors: error.errors?.length === 0 ? undefined : error.errors,
  ...(appConfig.isDevelopment && !omitStack ? { stack: error.stack } : {}),
  requestId,
  timestamp: error.timestamp,
  path,
});

export const errorHandlerMiddleware: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  let appError: AppError;
  const parserError = safeParserError(error);

  if (parserError !== null) {
    appError = parserError;
  } else if (error instanceof AppError) {
    appError = error;
  } else {
    appError = mapPrismaError(error);
    if (appError instanceof InternalServerError) {
      const fallback = new InternalServerError();
      if (error instanceof Error && error.stack !== undefined) {
        fallback.stack = error.stack;
      }
      appError = fallback;
    }
  }

  const logContext = {
    code: appError.code,
    requestId: request.requestId,
    statusCode: appError.statusCode,
    ...(appError.isOperational ? {} : { err: error }),
  };

  if (appError.isOperational) {
    request.log.warn(logContext, appError.message);
  } else {
    request.log.error(logContext, appError.message);
  }

  return response
    .status(appError.statusCode)
    .json(
      createErrorResponse(
        appError,
        request.path,
        request.requestId,
        parserError !== null,
      ),
    );
};

const safeParserError = (error: unknown): AppError | null => {
  if (!(error instanceof Error) || !("type" in error) || !("status" in error))
    return null;
  if (
    error.type === "entity.parse.failed" &&
    error.status === HTTP_STATUS.BAD_REQUEST
  ) {
    return new AppError(
      "The request contains invalid JSON.",
      HTTP_STATUS.BAD_REQUEST,
      "INVALID_JSON",
    );
  }
  if (
    error.type === "entity.too.large" &&
    error.status === HTTP_STATUS.PAYLOAD_TOO_LARGE
  ) {
    return new AppError(
      "The request body is too large.",
      HTTP_STATUS.PAYLOAD_TOO_LARGE,
      "PAYLOAD_TOO_LARGE",
    );
  }
  return null;
};

export const errorHandler = errorHandlerMiddleware;
