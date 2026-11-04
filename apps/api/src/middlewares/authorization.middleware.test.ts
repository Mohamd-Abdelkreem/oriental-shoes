import { Department, UserRole } from "@template/database";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenException } from "../core/errors/forbidden.error.js";
import { UnauthorizedException } from "../core/errors/unauthorized.error.js";
import { DepartmentAccessDeniedError } from "../modules/auth/auth.errors.js";
import {
  authorizeDepartments,
  authorizeRoles,
} from "./authorization.middleware.js";

const response = {} as never;

describe("authorizeRoles", () => {
  it("rejects a missing authenticated user", () => {
    const middleware = authorizeRoles(UserRole.ADMIN);
    expect(() => {
      middleware({} as never, response, vi.fn());
    }).toThrow(UnauthorizedException);
  });

  it("rejects a user outside the allowlist", () => {
    const middleware = authorizeRoles(UserRole.ADMIN);
    expect(() => {
      middleware({ user: { role: UserRole.USER } } as never, response, vi.fn());
    }).toThrow(ForbiddenException);
  });

  it("continues for an allowed generic role", () => {
    const next = vi.fn();
    authorizeRoles(UserRole.ADMIN)(
      { user: { role: UserRole.ADMIN } } as never,
      response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("authorizeDepartments", () => {
  it("rejects a missing authenticated user", () => {
    const middleware = authorizeDepartments(Department.SALES);
    expect(() => {
      middleware({} as never, response, vi.fn());
    }).toThrow(UnauthorizedException);
  });

  it("allows an employee in one allowed department", () => {
    const next = vi.fn();
    authorizeDepartments(Department.SALES, Department.CUTTING)(
      {
        user: { role: UserRole.USER, department: Department.SALES },
      } as never,
      response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("denies an employee outside the allowed departments", () => {
    expect(() => {
      authorizeDepartments(Department.CUTTING)(
        {
          user: { role: UserRole.USER, department: Department.SALES },
        } as never,
        response,
        vi.fn(),
      );
    }).toThrow(DepartmentAccessDeniedError);
  });

  it("denies an employee without a department", () => {
    expect(() => {
      authorizeDepartments(Department.SALES)(
        { user: { role: UserRole.USER, department: null } } as never,
        response,
        vi.fn(),
      );
    }).toThrow(DepartmentAccessDeniedError);
  });

  it("exempts an administrator from employee department matching", () => {
    const next = vi.fn();
    authorizeDepartments(Department.CUTTING)(
      { user: { role: UserRole.ADMIN, department: null } } as never,
      response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
