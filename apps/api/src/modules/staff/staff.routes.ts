import { Router, type RequestHandler } from "express";

import { UserRole } from "@template/database";
import { staffEmptyQuerySchema } from "@template/contracts";

import {
  authorizeRoles,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import { staffApprovalBodyDtoSchema } from "./dto/staff-approval.dto.js";
import { staffCommandBodyDtoSchema } from "./dto/staff-command.dto.js";
import { staffDepartmentBodyDtoSchema } from "./dto/staff-department.dto.js";
import { staffHistoryQueryDtoSchema } from "./dto/staff-history.dto.js";
import { staffListQueryDtoSchema } from "./dto/staff-list.dto.js";
import { staffUserParamsDtoSchema } from "./dto/staff-user-params.dto.js";
import type { StaffController } from "./staff.controller.js";

export const staffRoutes = (
  controller: StaffController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();
  const adminOnly = authorizeRoles(UserRole.ADMIN);

  router.get(
    "/",
    businessAuthenticationMiddleware,
    adminOnly,
    validationMiddleware({ query: staffListQueryDtoSchema }),
    controller.list,
  );
  router.get(
    "/:userId",
    businessAuthenticationMiddleware,
    adminOnly,
    validationMiddleware({
      params: staffUserParamsDtoSchema,
      query: staffEmptyQuerySchema,
    }),
    controller.get,
  );
  router.get(
    "/:userId/decisions",
    businessAuthenticationMiddleware,
    adminOnly,
    validationMiddleware({
      params: staffUserParamsDtoSchema,
      query: staffHistoryQueryDtoSchema,
    }),
    controller.decisions,
  );
  router.post(
    "/:userId/approve",
    businessAuthenticationMiddleware,
    adminOnly,
    csrfMiddleware,
    validationMiddleware({
      params: staffUserParamsDtoSchema,
      body: staffApprovalBodyDtoSchema,
      query: staffEmptyQuerySchema,
    }),
    controller.approve,
  );
  router.post(
    "/:userId/reject",
    businessAuthenticationMiddleware,
    adminOnly,
    csrfMiddleware,
    validationMiddleware({
      params: staffUserParamsDtoSchema,
      body: staffCommandBodyDtoSchema,
      query: staffEmptyQuerySchema,
    }),
    controller.reject,
  );
  router.patch(
    "/:userId/department",
    businessAuthenticationMiddleware,
    adminOnly,
    csrfMiddleware,
    validationMiddleware({
      params: staffUserParamsDtoSchema,
      body: staffDepartmentBodyDtoSchema,
      query: staffEmptyQuerySchema,
    }),
    controller.changeDepartment,
  );
  router.post(
    "/:userId/suspend",
    businessAuthenticationMiddleware,
    adminOnly,
    csrfMiddleware,
    validationMiddleware({
      params: staffUserParamsDtoSchema,
      body: staffCommandBodyDtoSchema,
      query: staffEmptyQuerySchema,
    }),
    controller.suspend,
  );
  router.post(
    "/:userId/reactivate",
    businessAuthenticationMiddleware,
    adminOnly,
    csrfMiddleware,
    validationMiddleware({
      params: staffUserParamsDtoSchema,
      body: staffCommandBodyDtoSchema,
      query: staffEmptyQuerySchema,
    }),
    controller.reactivate,
  );

  return router;
};
