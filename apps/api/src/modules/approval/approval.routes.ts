import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { ApprovalController } from "./approval.controller.js";
import {
  approvalOrdersQueryDtoSchema,
  approvalIssuesQueryDtoSchema,
  approvalHistoryQueryDtoSchema,
  approvalOrderHistoryQueryDtoSchema,
  salesContactQueryDtoSchema,
  salesOrderParamsDtoSchema,
  approvalPieceParamsDtoSchema,
  approvalIssueParamsDtoSchema,
  approvalEventParamsDtoSchema,
  salesCommandParamsDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/approval-read.dto.js";
import {
  approveInitialBodyDtoSchema,
  returnInitialBodyDtoSchema,
} from "./dto/initial-decision.dto.js";
import { reportIssueBodyDtoSchema } from "./dto/report-issue.dto.js";
import { resolveIssueBodyDtoSchema } from "./dto/resolve-issue.dto.js";
import { submitContactBodyDtoSchema } from "./dto/submit-contact.dto.js";
import { reviewContactBodyDtoSchema } from "./dto/review-contact.dto.js";

export const approvalRoutes = (
  controller: ApprovalController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/dashboard",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    validationMiddleware({ query: salesEmptyQueryDtoSchema }),
    controller.dashboard,
  );
  router.get(
    "/orders",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    validationMiddleware({ query: approvalOrdersQueryDtoSchema }),
    controller.listPending,
  );
  router.get(
    "/issues",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    validationMiddleware({ query: approvalIssuesQueryDtoSchema }),
    controller.listIssues,
  );
  router.get(
    "/history",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    validationMiddleware({ query: approvalHistoryQueryDtoSchema }),
    controller.history,
  );
  router.get(
    "/orders/:orderId",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: salesOrderParamsDtoSchema,
    }),
    controller.getOrder,
  );
  router.post(
    "/orders/:orderId/approve",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: salesOrderParamsDtoSchema,
      body: approveInitialBodyDtoSchema,
    }),
    controller.approveInitial,
  );
  router.post(
    "/orders/:orderId/return",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: salesOrderParamsDtoSchema,
      body: returnInitialBodyDtoSchema,
    }),
    controller.returnInitial,
  );
  router.get(
    "/orders/:orderId/history",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL, Department.SALES),
    validationMiddleware({
      query: approvalOrderHistoryQueryDtoSchema,
      params: salesOrderParamsDtoSchema,
    }),
    controller.orderHistory,
  );
  router.get(
    "/orders/:orderId/events/:eventId",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL, Department.SALES),
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: approvalEventParamsDtoSchema,
    }),
    controller.event,
  );
  router.post(
    "/orders/:orderId/pieces/:pieceId/issues/:issueId/resolve",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: approvalIssueParamsDtoSchema,
      body: resolveIssueBodyDtoSchema,
    }),
    controller.resolveIssue,
  );
  router.post(
    "/orders/:orderId/pieces/:pieceId/issues/:issueId/review",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: approvalIssueParamsDtoSchema,
      body: reviewContactBodyDtoSchema,
    }),
    controller.reviewContact,
  );
  return router;
};
export const salesContactRoutes = (
  controller: ApprovalController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.SALES),
    validationMiddleware({ query: salesContactQueryDtoSchema }),
    controller.salesContacts,
  );
  router.get(
    "/orders/:orderId",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.SALES),
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: salesOrderParamsDtoSchema,
    }),
    controller.getSalesContactOrder,
  );
  router.post(
    "/orders/:orderId/pieces/:pieceId/issues/:issueId/proposals",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.SALES),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: approvalIssueParamsDtoSchema,
      body: submitContactBodyDtoSchema,
    }),
    controller.submitContact,
  );
  return router;
};
export const orderPaperRoutes = (
  controller: ApprovalController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:orderId",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.APPROVAL, Department.SALES),
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: salesOrderParamsDtoSchema,
    }),
    controller.officialPaper,
  );
  return router;
};
export const manufacturingOrderRoutes = (
  controller: ApprovalController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:orderId",
    businessAuthenticationMiddleware,
    authorizeDepartments(
      Department.CUTTING,
      Department.PRODUCTION,
      Department.QUALITY,
    ),
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: salesOrderParamsDtoSchema,
    }),
    controller.factoryPaper,
  );
  router.post(
    "/:orderId/pieces/:pieceId/issues",
    businessAuthenticationMiddleware,
    authorizeDepartments(
      Department.CUTTING,
      Department.PRODUCTION,
      Department.QUALITY,
    ),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: approvalPieceParamsDtoSchema,
      body: reportIssueBodyDtoSchema,
    }),
    controller.reportIssue,
  );
  return router;
};
export const approvalCommandRoutes = (
  controller: ApprovalController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:commandId",
    businessAuthenticationMiddleware,
    authorizeDepartments(
      Department.APPROVAL,
      Department.SALES,
      Department.CUTTING,
      Department.PRODUCTION,
      Department.QUALITY,
    ),
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      params: salesCommandParamsDtoSchema,
    }),
    controller.observe,
  );
  return router;
};
