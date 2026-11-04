import type { Request, Response } from "express";

import type { StaffApprovalBodyDto } from "./dto/staff-approval.dto.js";
import type { StaffCommandBodyDto } from "./dto/staff-command.dto.js";
import type { StaffDepartmentBodyDto } from "./dto/staff-department.dto.js";
import type { StaffHistoryQueryDto } from "./dto/staff-history.dto.js";
import type { StaffListQueryDto } from "./dto/staff-list.dto.js";
import type { StaffUserParamsDto } from "./dto/staff-user-params.dto.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { StaffService } from "./staff.service.js";

/**
 * A missing actor or validated payload is a server wiring defect, never an
 * empty actor and never a client error.
 */
const requireActorId = (request: Request): string => {
  const actorId = request.user?.id;
  if (actorId === undefined || actorId.length === 0) {
    throw new InternalServerError("The authenticated actor is unavailable.");
  }
  return actorId;
};

const requireValidated = <T>(value: T | undefined, field: string): T => {
  if (value === undefined) {
    throw new InternalServerError(`The validated ${field} is unavailable.`);
  }
  return value;
};

export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  list = async (request: Request, response: Response): Promise<Response> => {
    const query = requireValidated<StaffListQueryDto>(
      request.validated?.query as StaffListQueryDto | undefined,
      "staff list query",
    );
    const data = await this.staffService.listStaff(
      requireActorId(request),
      query,
    );
    return ResponseHelper.ok(
      response,
      data,
      "Staff directory loaded.",
      request.path,
      request.requestId,
    );
  };

  get = async (request: Request, response: Response): Promise<Response> => {
    const params = requireValidated<StaffUserParamsDto>(
      request.validated?.params as StaffUserParamsDto | undefined,
      "staff selection",
    );
    const staff = await this.staffService.getStaff(
      requireActorId(request),
      params.userId,
    );
    return ResponseHelper.ok(
      response,
      { staff },
      "Staff account loaded.",
      request.path,
      request.requestId,
    );
  };

  decisions = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const params = requireValidated<StaffUserParamsDto>(
      request.validated?.params as StaffUserParamsDto | undefined,
      "staff selection",
    );
    const query = requireValidated<StaffHistoryQueryDto>(
      request.validated?.query as StaffHistoryQueryDto | undefined,
      "staff history query",
    );
    const data = await this.staffService.listStaffDecisions(
      requireActorId(request),
      params.userId,
      query,
    );
    return ResponseHelper.ok(
      response,
      data,
      "Staff decisions loaded.",
      request.path,
      request.requestId,
    );
  };

  approve = async (request: Request, response: Response): Promise<Response> => {
    const params = requireValidated<StaffUserParamsDto>(
      request.validated?.params as StaffUserParamsDto | undefined,
      "staff selection",
    );
    const body = requireValidated<StaffApprovalBodyDto>(
      request.validated?.body as StaffApprovalBodyDto | undefined,
      "staff approval",
    );
    const data = await this.staffService.approveStaff(
      requireActorId(request),
      params.userId,
      body,
    );
    return ResponseHelper.ok(
      response,
      data,
      "Staff approval applied.",
      request.path,
      request.requestId,
    );
  };

  reject = async (request: Request, response: Response): Promise<Response> => {
    const params = requireValidated<StaffUserParamsDto>(
      request.validated?.params as StaffUserParamsDto | undefined,
      "staff selection",
    );
    const body = requireValidated<StaffCommandBodyDto>(
      request.validated?.body as StaffCommandBodyDto | undefined,
      "staff command",
    );
    const data = await this.staffService.rejectStaff(
      requireActorId(request),
      params.userId,
      body,
    );
    return ResponseHelper.ok(
      response,
      data,
      "Staff rejection applied.",
      request.path,
      request.requestId,
    );
  };

  changeDepartment = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const params = requireValidated<StaffUserParamsDto>(
      request.validated?.params as StaffUserParamsDto | undefined,
      "staff selection",
    );
    const body = requireValidated<StaffDepartmentBodyDto>(
      request.validated?.body as StaffDepartmentBodyDto | undefined,
      "staff department",
    );
    const data = await this.staffService.changeDepartment(
      requireActorId(request),
      params.userId,
      body,
    );
    return ResponseHelper.ok(
      response,
      data,
      "Staff department changed.",
      request.path,
      request.requestId,
    );
  };

  suspend = async (request: Request, response: Response): Promise<Response> => {
    const params = requireValidated<StaffUserParamsDto>(
      request.validated?.params as StaffUserParamsDto | undefined,
      "staff selection",
    );
    const body = requireValidated<StaffCommandBodyDto>(
      request.validated?.body as StaffCommandBodyDto | undefined,
      "staff command",
    );
    const data = await this.staffService.suspendStaff(
      requireActorId(request),
      params.userId,
      body,
    );
    return ResponseHelper.ok(
      response,
      data,
      "Staff suspension applied.",
      request.path,
      request.requestId,
    );
  };

  reactivate = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const params = requireValidated<StaffUserParamsDto>(
      request.validated?.params as StaffUserParamsDto | undefined,
      "staff selection",
    );
    const body = requireValidated<StaffCommandBodyDto>(
      request.validated?.body as StaffCommandBodyDto | undefined,
      "staff command",
    );
    const data = await this.staffService.reactivateStaff(
      requireActorId(request),
      params.userId,
      body,
    );
    return ResponseHelper.ok(
      response,
      data,
      "Staff reactivation applied.",
      request.path,
      request.requestId,
    );
  };
}
