import type { NextFunction, Request, Response } from "express";

import type { Department } from "@template/database";
import { UserRole } from "@template/database";

import { ForbiddenException } from "../core/errors/forbidden.error.js";
import { UnauthorizedException } from "../core/errors/unauthorized.error.js";
import { DepartmentAccessDeniedError } from "../modules/auth/auth.errors.js";

export const authorizeRoles = (...roles: readonly UserRole[]) => {
  const allowed = new Set(roles);
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (request.user === undefined) {
      throw new UnauthorizedException("Authentication is required.");
    }
    if (!allowed.has(request.user.role)) {
      throw new ForbiddenException(
        "This action is not allowed for the current user.",
      );
    }
    next();
  };
};

/**
 * Requires a prior business authentication. An administrator is exempt from
 * employee department matching; an employee must match one allowed department.
 */
export const authorizeDepartments = (...departments: readonly Department[]) => {
  const allowed = new Set(departments);
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (request.user === undefined) {
      throw new UnauthorizedException("Authentication is required.");
    }
    if (request.user.role === UserRole.ADMIN) {
      next();
      return;
    }
    if (
      request.user.department === null ||
      !allowed.has(request.user.department)
    ) {
      throw new DepartmentAccessDeniedError();
    }
    next();
  };
};
