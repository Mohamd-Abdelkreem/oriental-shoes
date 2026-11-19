import {
  administrationDashboardQuerySchema,
  administrationDashboardDataSchema,
  administrationFilterOptionsQuerySchema,
  administrationFilterOptionsDataSchema,
  administrationOrdersQuerySchema,
  administrationOrdersDataSchema,
  administrationOrderParamsSchema,
  administrationOrderDataSchema,
  administrationOrderHistoryQuerySchema,
  administrationActivityDataSchema,
  administrationApprovalsQuerySchema,
  administrationApprovalsDataSchema,
  administrationCorrectionsQuerySchema,
  administrationCorrectionsDataSchema,
  administrationDeliveryExceptionsQuerySchema,
  administrationDeliveryExceptionsDataSchema,
  administrationActivityQuerySchema,
  administrationReportQuerySchema,
  administrationReportDataSchema,
  administrationReportPrintQuerySchema,
  administrationReportPrintDataSchema,
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  administrationCommandParamsSchema,
} from "@template/contracts";
import {
  warehouseOrderParamsSchema,
  warehouseCommandParamsSchema,
  warehouseOrdersQuerySchema,
  warehousePiecesQuerySchema,
  warehouseActivityQuerySchema,
  warehouseOrderHistoryQuerySchema,
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  warehouseDashboardDataSchema,
  warehouseDashboardQuerySchema,
  warehouseOrdersDataSchema,
  warehousePiecesDataSchema,
  warehouseOrderDataSchema,
  warehouseActivityDataSchema,
  warehouseOrderHistoryDataSchema,
} from "@template/contracts";
import {
  qualityOrderParamsSchema,
  qualityCommandParamsSchema,
  qualityOrdersQuerySchema,
  qualityPiecesQuerySchema,
  qualityActivityQuerySchema,
  qualityOrderHistoryQuerySchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  qualityDashboardDataSchema,
  qualityOrdersDataSchema,
  qualityPiecesDataSchema,
  qualityOrderDataSchema,
  qualityActivityDataSchema,
  qualityOrderHistoryDataSchema,
} from "@template/contracts";
import {
  salesEmptyQuerySchema,
  manufacturingDepartmentParamsSchema,
  manufacturingOrderParamsSchema,
  manufacturingCommandParamsSchema,
  manufacturingOrdersQuerySchema,
  manufacturingPiecesQuerySchema,
  manufacturingActivityQuerySchema,
  manufacturingOrderHistoryQuerySchema,
  manufacturingCommandBodySchema,
  manufacturingCommandDataSchema,
  manufacturingDashboardDataSchema,
  manufacturingOrdersDataSchema,
  manufacturingPiecesDataSchema,
  manufacturingOrderDataSchema,
  manufacturingActivityDataSchema,
  manufacturingOrderHistoryDataSchema,
} from "@template/contracts";
import {
  approvalCommandDataSchema,
  approvalDashboardDataSchema,
  approvalEventDataSchema,
  approvalEventParamsSchema,
  approvalHistoryDataSchema,
  approvalHistoryQuerySchema,
  approvalIssueParamsSchema,
  approvalIssuesDataSchema,
  approvalIssuesQuerySchema,
  approvalOrderDataSchema,
  approvalOrderHistoryDataSchema,
  approvalOrderHistoryQuerySchema,
  approvalOrdersDataSchema,
  approvalOrdersQuerySchema,
  approvalPieceParamsSchema,
  approveInitialBodySchema,
  factoryOrderPaperDataSchema,
  officialOrderPaperDataSchema,
  reportIssueBodySchema,
  resolveIssueBodySchema,
  returnInitialBodySchema,
  reviewContactBodySchema,
  salesContactDataSchema,
  salesContactQuerySchema,
  submitContactBodySchema,
} from "@template/contracts";
import { z } from "zod";
import { createDocument } from "zod-openapi";

import {
  catalogDataSchema,
  catalogQuoteBodySchema,
  catalogQuoteDataSchema,
  submitOrderBodySchema,
  resubmitOrderBodySchema,
  setOrderPaidBodySchema,
  salesOrderCommandDataSchema,
  salesOrderListQuerySchema,
  salesOrderListDataSchema,
  salesDashboardDataSchema,
  salesOrderActivityQuerySchema,
  salesOrderActivityDataSchema,
  salesOrderDataSchema,
  salesOrderTrackingDataSchema,
  salesOrderRevisionDataSchema,
  salesOrderEditorDataSchema,
  salesOrderParamsSchema,
  salesOrderRevisionParamsSchema,
  customerOrdersQuerySchema,
  customerOrdersDataSchema,
  customerOrderMeasurementsQuerySchema,
  customerOrderMeasurementsDataSchema,
  createCustomerBodySchema,
  updateCustomerBodySchema,
  customerParamsSchema,
  customerPhoneParamsSchema,
  customerListQuerySchema,
  customerMeasurementsQuerySchema,
  customerListDataSchema,
  customerDataSchema,
  customerMeasurementsDataSchema,
  customerDraftsDataSchema,
  customerDraftsQuerySchema,
  customerCommandDataSchema,
  createDraftBodySchema,
  saveDraftBodySchema,
  draftParamsSchema,
  draftListQuerySchema,
  draftChangesQuerySchema,
  draftDataSchema,
  draftListDataSchema,
  draftChangesDataSchema,
  draftCommandDataSchema,
  salesCommandParamsSchema,
  salesCommandDataSchema,
  accountResponseSchemas,
  authEmptyDataSchema,
  authNeutralDataSchema,
  errorEnvelopeSchema,
  resetTokenValidationDataSchema,
  staffCommandDataSchema,
  staffDecisionsDataSchema,
  staffListDataSchema,
  staffUserDataSchema,
  successEnvelopeSchema,
} from "@template/contracts";

import { appConfig } from "../../core/config/app.config.js";
import {
  changePasswordBodyDtoSchema,
  emailRequestBodyDtoSchema,
  loginBodyDtoSchema,
  registerBodyDtoSchema,
  resetPasswordBodyDtoSchema,
} from "../../modules/auth/dto/index.js";
import { staffApprovalBodyDtoSchema } from "../../modules/staff/dto/staff-approval.dto.js";
import { staffCommandBodyDtoSchema } from "../../modules/staff/dto/staff-command.dto.js";
import { staffCreateBodyDtoSchema } from "../../modules/staff/dto/staff-create.dto.js";
import { staffDepartmentBodyDtoSchema } from "../../modules/staff/dto/staff-department.dto.js";
import { staffHistoryQueryDtoSchema } from "../../modules/staff/dto/staff-history.dto.js";
import { staffListQueryDtoSchema } from "../../modules/staff/dto/staff-list.dto.js";
import { staffUserParamsDtoSchema } from "../../modules/staff/dto/staff-user-params.dto.js";
import { updateProfileBodyDtoSchema } from "../../modules/users/dto/update-profile.dto.js";

const tokenParameter = z
  .string()
  .min(1)
  .meta({
    param: {
      name: "token",
      in: "query",
    },
  });

const jsonBody = (schema: z.ZodType) => ({
  required: true,
  content: { "application/json": { schema } },
});

const successEnvelope = (data: z.ZodType): z.ZodType =>
  successEnvelopeSchema.safeExtend({ data });

const successResponse = (description: string, data: z.ZodType) => ({
  description,
  content: { "application/json": { schema: successEnvelope(data) } },
});

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorEnvelopeSchema } },
});

const commonErrors = {
  "400": errorResponse("Invalid request"),
  "401": errorResponse("Authentication failed"),
  "403": errorResponse("Request forbidden"),
  "429": errorResponse("Rate limit exceeded"),
  "500": errorResponse("Unexpected server error"),
};

const healthSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["ok", "error", "not_checked"]),
    uptime: z.string(),
    timestamp: z.iso.datetime({ offset: true }),
  })
  .strict();

const salesErrors = {
  ...commonErrors,
  "404": errorResponse(
    "The selected resource is absent or not visible to the current actor",
  ),
  "409": errorResponse(
    "Phone, expected version, piece identity or command binding conflict; observe an unknown command outcome before retrying",
  ),
  "413": errorResponse(
    "PAYLOAD_TOO_LARGE: Request exceeds the configured body limit",
  ),
};
const salesRead = (
  summary: string,
  data: z.ZodType,
  query?: z.ZodType<unknown, Record<string, unknown>>,
  path?: z.ZodType<unknown, Record<string, unknown>>,
) => ({
  summary,
  description:
    "Current eligible SALES employees and ADMIN only. Customers are shared; draft-derived data is scoped to the current owner, with ADMIN visibility across owners. Pagination is deterministic and never clamped.",
  security: [{ BearerAuth: [] }],
  requestParams: {
    ...(query === undefined ? {} : { query }),
    ...(path === undefined ? {} : { path }),
  },
  responses: {
    ...salesErrors,
    "200": successResponse("Current authorized projection", data),
  },
});
const salesWrite = (
  summary: string,
  body: z.ZodType,
  data: z.ZodType,
  status: "200" | "201",
  path?: z.ZodType<unknown, Record<string, unknown>>,
) => ({
  summary,
  description:
    "Eligible SALES or ADMIN with CSRF cookie/header. commandId binds the normalized intent and actor. Resource and immutable receipt commit atomically; identical replay returns the original saved image. Draft saves retain incomplete captures; current pricing/submission readiness reflects the active catalog and configured business calendar. PUT replaces every capture field; PATCH preserves omitted customer fields.",
  security: [{ BearerAuth: [], CsrfHeader: [] }],
  ...(path === undefined ? {} : { requestParams: { path } }),
  requestBody: jsonBody(body),
  responses: {
    ...salesErrors,
    [status]: successResponse(
      "Committed resource and immutable receipt, including replay",
      data,
    ),
  },
});

const orderRead = (
  summary: string,
  data: z.ZodType,
  query?: z.ZodType<unknown, Record<string, unknown>>,
  path?: z.ZodType<unknown, Record<string, unknown>>,
) => ({
  ...salesRead(summary, data, query, path),
  description:
    "Current eligible SALES/ADMIN only. Related rows, counts and historical projections share current resource ownership; ADMIN has broader reads. Private responses use no-store.",
});
const orderWrite = (input: {
  summary: string;
  body: z.ZodType;
  status: "200" | "201";
  path?: z.ZodType<unknown, Record<string, unknown>>;
}) => ({
  ...salesWrite(
    input.summary,
    input.body,
    salesOrderCommandDataSchema,
    input.status,
    input.path,
  ),
  description:
    "Current SALES/ADMIN and CSRF required. commandId binds accepted intent; matching replay returns the original immutable saved order. Submission/resubmission requires the owner. Paid changes require owner/ADMIN and persisted approval. No payment or P04 decision is performed.",
  responses: {
    ...salesErrors,
    "503": errorResponse(
      "ORDER_CATALOG_UNAVAILABLE, ORDER_CALENDAR_UNAVAILABLE or ORDER_NUMBER_UNAVAILABLE; no business write",
    ),
    [input.status]: successResponse(
      "Committed order and immutable receipt, including replay",
      salesOrderCommandDataSchema,
    ),
  },
});

const approvalOperation = (input: {
  summary: string;
  authority: string;
  data: z.ZodType;
  query?: z.ZodType<unknown, Record<string, unknown>>;
  path?: z.ZodType<unknown, Record<string, unknown>>;
  body?: z.ZodType;
}) => ({
  summary: input.summary,
  description:
    input.authority +
    ". Current authority/resource checks apply within the transaction. All results use HTTP 200, including immutable metadata-only replay. Protected reads are private, no-store. Unknown command outcomes must be observed before an explicit reviewed retry.",
  security: [
    input.body === undefined
      ? { BearerAuth: [] }
      : { BearerAuth: [], CsrfHeader: [] },
  ],
  requestParams: {
    ...(input.query === undefined ? {} : { query: input.query }),
    ...(input.path === undefined ? {} : { path: input.path }),
  },
  ...(input.body === undefined ? {} : { requestBody: jsonBody(input.body) }),
  responses: {
    ...salesErrors,
    "409": errorResponse(
      "Stale root/issue/proposal, changed command intent, exhausted transaction retry, or official print not approved/returned/pending reapproval",
    ),
    "503": errorResponse(
      "Configured dashboard calendar or newly changed selection catalog unavailable",
    ),
    "200": successResponse(
      "Current authorized projection or committed command metadata",
      input.data,
    ),
  },
});
const manufacturingOperation = (input: {
  summary: string;
  data: z.ZodType;
  path: z.ZodType<unknown, Record<string, unknown>>;
  query?: z.ZodType<unknown, Record<string, unknown>>;
  body?: z.ZodType;
}) => ({
  summary: input.summary,
  description:
    "Current selected CUTTING/PRODUCTION department or ADMIN. Safe historical relation grants reads only. Private no-store results, deterministic pagination (grouped limit 1-25; flat/history limit 1-100; page >=1), no financial/private contact fields. A command commits the entire exact selection or rejects it. Original actor/source department may observe or replay its retained result after movement; unexpected errors may have an uncertain outcome.",
  security: [
    input.body === undefined
      ? { BearerAuth: [] }
      : { BearerAuth: [], CsrfHeader: [] },
  ],
  requestParams: {
    path: input.path,
    ...(input.query === undefined ? {} : { query: input.query }),
  },
  ...(input.body === undefined ? {} : { requestBody: jsonBody(input.body) }),
  responses: {
    ...salesErrors,
    "409": errorResponse(
      "ORDER_VERSION_CONFLICT, ORDER_STATE_CONFLICT, MANUFACTURING_SELECTION_CONFLICT, MANUFACTURING_WORK_UNCHANGED, MANUFACTURING_COMMAND_CONFLICT or MANUFACTURING_TRANSACTION_CONFLICT: refresh/review or observe the original key before retrying an uncertain result",
    ),
    "200": successResponse(
      "Safe authorized projection or committed immutable whole-selection result",
      input.data,
    ),
  },
});
const qualityOperation = (input: {
  summary: string;
  data: z.ZodType;
  path?: z.ZodType<unknown, Record<string, unknown>>;
  query: z.ZodType<unknown, Record<string, unknown>>;
  body?: z.ZodType;
}) => ({
  summary: input.summary,
  description:
    "Current QUALITY or ADMIN authority is rechecked inside bounded transactions. Private no-store projections exclude financial/contact/proposal data. Queues may overlap; acceptance/packing does not record physical receipt. Exact selected commands are atomic, at most 200 pieces; REPORT_ISSUES retains contiguous P04 +1 children with parent +N. Matching replay/own observation returns the original result after later movement. Keep the original command key after uncertain errors; observation 404 does not prove terminal absence. Existing configured body limit applies; 413 is a known rejection requiring explicit smaller selection and reconfirmation, never automatic splitting.",
  security: [
    input.body === undefined
      ? { BearerAuth: [] }
      : { BearerAuth: [], CsrfHeader: [] },
  ],
  requestParams: {
    ...(input.path === undefined ? {} : { path: input.path }),
    query: input.query,
  },
  ...(input.body === undefined ? {} : { requestBody: jsonBody(input.body) }),
  responses: {
    ...salesErrors,
    "404": errorResponse(
      "ORDER_NOT_FOUND or actor-private QUALITY_COMMAND_NOT_FOUND",
    ),
    "409": errorResponse(
      "ORDER_VERSION_CONFLICT, ORDER_STATE_CONFLICT, QUALITY_SELECTION_CONFLICT, QUALITY_WORK_UNCHANGED, QUALITY_COMMAND_CONFLICT or QUALITY_TRANSACTION_CONFLICT; refresh/review or observe the original intent",
    ),
    "200": successResponse(
      "Safe authorized projection or original committed atomic result",
      input.data,
    ),
  },
});
const warehouseOperation = (input: {
  summary: string;
  data: z.ZodType;
  path?: z.ZodType<unknown, Record<string, unknown>>;
  query: z.ZodType<unknown, Record<string, unknown>>;
  body?: z.ZodType;
}) => ({
  summary: input.summary,
  description:
    "Current WAREHOUSE or ADMIN authority is rechecked under account locks. Exact participating orders only; private no-store projections expose submitted name, phone and address, excluding email, finance and unrelated customer history. Receipt is an explicit physical acknowledgement, separate from Quality acceptance/packing. Whole-order delivery requires every reviewed active piece. All five commands are atomic, at most 200 pieces and 200 orders, advancing each root once. Grouped pages allow limit 1-25; flat/history limit 1-100. Matching replay/own observation returns the original result after later movement. Keep the original command key after uncertain errors; observation 404 does not prove terminal absence. The configured body limit applies; 413 is a known rejection requiring an explicitly smaller reviewed selection and reconfirmation, never automatic splitting.",
  security: [
    input.body === undefined
      ? { BearerAuth: [] }
      : { BearerAuth: [], CsrfHeader: [] },
  ],
  requestParams: {
    ...(input.path === undefined ? {} : { path: input.path }),
    query: input.query,
  },
  ...(input.body === undefined ? {} : { requestBody: jsonBody(input.body) }),
  responses: {
    ...salesErrors,
    "404": errorResponse(
      "ORDER_NOT_FOUND or actor-private WAREHOUSE_COMMAND_NOT_FOUND",
    ),
    "409": errorResponse(
      "ORDER_VERSION_CONFLICT, ORDER_STATE_CONFLICT, WAREHOUSE_SELECTION_CONFLICT, WAREHOUSE_COMMAND_CONFLICT or WAREHOUSE_TRANSACTION_CONFLICT; refresh/review or observe the original intent",
    ),
    "200": successResponse(
      "Safe authorized projection or original committed atomic result",
      input.data,
    ),
  },
});
const administrationOperation = (input: {
  summary: string;
  data: z.ZodType;
  query: z.ZodType<unknown, Record<string, unknown>>;
  path?: z.ZodType<unknown, Record<string, unknown>>;
  body?: z.ZodType;
}) => ({
  summary: input.summary,
  description:
    "Serialized command input is limited to 65536 UTF-8 bytes before normalization (400); the global parser limit returns 413. Current eligible ADMIN authority is reloaded under account locks. Read projections use one RepeatableRead observation and an explicit business calendar when needed. Cancellation uses reviewed exact physical identities and preserves original terms, paid, receipts and lifecycle history. Correction permits only order notes/contact/address with a reason and preserves terminal state. Matching replay/own observation returns the original committed receipt after later versions; observation 404 does not prove a failed write. Keep the original command ID after an uncertain outcome. Reports share one filtered order cohort, with a separately labelled current staff directory; complete print refuses excess rows/bytes instead of truncating. Responses are private, no-store.",
  security: [
    input.body === undefined
      ? { BearerAuth: [] }
      : { BearerAuth: [], CsrfHeader: [] },
  ],
  requestParams: {
    ...(input.path === undefined ? {} : { path: input.path }),
    query: input.query,
  },
  ...(input.body === undefined ? {} : { requestBody: jsonBody(input.body) }),
  responses: {
    ...salesErrors,
    "404": errorResponse(
      "ORDER_NOT_FOUND or actor-private ADMINISTRATION_COMMAND_NOT_FOUND",
    ),
    "409": errorResponse(
      "ORDER_VERSION_CONFLICT, ORDER_STATE_CONFLICT, ADMINISTRATION_SELECTION_CONFLICT, ADMINISTRATION_COMMAND_CONFLICT, ADMINISTRATION_CORRECTION_UNCHANGED or ADMINISTRATION_TRANSACTION_CONFLICT; refresh/review or observe the original intent",
    ),
    "422": errorResponse(
      "REPORT_SCOPE_TOO_LARGE: narrow filters; no partial report or owner options",
    ),
    "503": errorResponse(
      "ORDER_CALENDAR_UNAVAILABLE: configured business calendar required for calendar facts",
    ),
    "200": successResponse(
      "Current authorized projection or original committed administration receipt",
      input.data,
    ),
  },
});
const staffPathParams = {
  path: staffUserParamsDtoSchema,
};

const staffReadSecurity = [{ BearerAuth: [] }];
const staffWriteSecurity = [{ BearerAuth: [], CsrfHeader: [] }];

const staffConflictErrors = {
  "403": errorResponse(
    "The caller lacks current business eligibility, or the selected target is an administrator",
  ),
  "404": errorResponse("The selected staff account does not exist"),
  "409": errorResponse(
    "The expected access version is stale, the stored command conflicts, or the current state cannot make the requested transition",
  ),
};

export const buildOpenApiDocument = () =>
  createDocument(
    {
      openapi: "3.1.0",
      info: {
        title: `${appConfig.name} OpenAPI`,
        version: "1.0.0",
        description:
          "REST API with access tokens, rotating refresh cookies, CSRF protection, current-user profile management and audited staff management. Account states distinguish a verified identity from current business eligibility: an unverified, pending, rejected or suspended identity may hold a private session and read its own current status, but it has no business access.",
      },
      servers: [{ url: appConfig.apiPrefix, description: "Configured API" }],
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          RefreshCookie: {
            type: "apiKey",
            in: "cookie",
            name: "refreshToken",
          },
          CsrfHeader: {
            type: "apiKey",
            in: "header",
            name: "x-csrf-token",
          },
        },
        schemas: {
          SafeUser: accountResponseSchemas.safeUser,
          AuthUserData: accountResponseSchemas.authUserData,
          AuthSessionData: accountResponseSchemas.authSessionData,
          AuthNeutralData: authNeutralDataSchema,
          AuthEmptyData: authEmptyDataSchema,
          ResetTokenValidationData: resetTokenValidationDataSchema,
          StaffListData: staffListDataSchema,
          StaffUserData: staffUserDataSchema,
          StaffDecisionsData: staffDecisionsDataSchema,
          StaffCommandData: staffCommandDataSchema,
          ErrorEnvelope: errorEnvelopeSchema,
        },
      },
      paths: {
        "/auth/register": {
          post: {
            summary: "Register with email and password",
            description:
              "Creates an unverified account and awaits the configured verification delivery. The account is not an employee until an administrator approves it.",
            requestBody: jsonBody(registerBodyDtoSchema),
            responses: {
              "201": successResponse(
                "Account created and the configured verification delivery was awaited",
                accountResponseSchemas.authUserData,
              ),
              "409": errorResponse("Email already registered"),
              "503": errorResponse(
                "SERVICE_UNAVAILABLE: Verification delivery failed",
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/verify-email": {
          post: {
            summary: "Verify an email address",
            description:
              "Consumes the one-time credential once. An employee becomes verified and awaiting approval; an existing administrator keeps its role and becomes verified and active with no employee fields.",
            parameters: [tokenParameter],
            responses: {
              "200": successResponse(
                "Email verified",
                accountResponseSchemas.authUserData,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/resend-verification": {
          post: {
            summary: "Request another verification link",
            description:
              "Always returns a neutral response to prevent account enumeration. A detached delivery is not a guaranteed receipt.",
            requestBody: jsonBody(emailRequestBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Request processed",
                authNeutralDataSchema,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/login": {
          post: {
            summary: "Create an authenticated session",
            description:
              "Correct credentials create an identity session for any extant account, including a restricted one. A successful sign-in never by itself grants business eligibility.",
            requestBody: jsonBody(loginBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Signed in; refresh and CSRF cookies set",
                accountResponseSchemas.authSessionData,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/refresh": {
          post: {
            summary: "Rotate the refresh token and issue a new access token",
            description:
              "Rotation stays one-time and keeps the original absolute expiry. A restricted identity may refresh into its own current status.",
            security: [{ RefreshCookie: [], CsrfHeader: [] }],
            responses: {
              "200": successResponse(
                "Session refreshed",
                accountResponseSchemas.authSessionData,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/logout": {
          post: {
            summary: "Revoke the current refresh token",
            description:
              "Revokes the owned refresh token and clears the session cookies. Already issued stateless access credentials are not erased immediately.",
            security: [{ BearerAuth: [], RefreshCookie: [], CsrfHeader: [] }],
            responses: {
              "200": successResponse("Signed out", authEmptyDataSchema),
              ...commonErrors,
            },
          },
        },
        "/auth/logout-all": {
          post: {
            summary: "Revoke every refresh token for the current user",
            description:
              "Revokes this identity's refresh records only and clears the session cookies. Already issued stateless access credentials are not erased immediately.",
            security: [{ BearerAuth: [], RefreshCookie: [], CsrfHeader: [] }],
            responses: {
              "200": successResponse(
                "Signed out from all devices",
                authEmptyDataSchema,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/forgot-password": {
          post: {
            summary: "Request a password reset",
            description:
              "Always returns a neutral response to prevent account enumeration. A detached delivery is not a guaranteed receipt.",
            requestBody: jsonBody(emailRequestBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Request processed",
                authNeutralDataSchema,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/reset-password": {
          post: {
            summary: "Reset a password with a one-time token",
            description:
              "Sets the new password, consumes the one-time credential and revokes the refresh records of that identity. It never changes the account role, approval, department or authority version.",
            parameters: [tokenParameter],
            requestBody: jsonBody(resetPasswordBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Password reset and existing refresh records revoked",
                accountResponseSchemas.authUserData,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/validate-reset-token": {
          get: {
            summary: "Validate a password-reset link",
            parameters: [tokenParameter],
            responses: {
              "200": successResponse(
                "Reset link valid",
                resetTokenValidationDataSchema,
              ),
              ...commonErrors,
            },
          },
        },
        "/auth/change-password": {
          patch: {
            summary: "Change the authenticated user's password",
            description:
              "Sets the new password and revokes the refresh records of that identity. It never changes the account role, approval, department or authority version.",
            security: [{ BearerAuth: [], CsrfHeader: [] }],
            requestBody: jsonBody(changePasswordBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Password changed and existing refresh records revoked",
                accountResponseSchemas.authUserData,
              ),
              ...commonErrors,
            },
          },
        },
        "/users/me": {
          get: {
            summary: "Read the current user",
            description:
              "Returns the current safe account of any extant credential-valid identity. A restricted state is data, not an empty account.",
            security: [{ BearerAuth: [] }],
            responses: {
              "200": successResponse(
                "Current user",
                accountResponseSchemas.authUserData,
              ),
              ...commonErrors,
            },
          },
          patch: {
            summary: "Update the current user's profile",
            description:
              "Updates the name and phone of the current identity only. It never edits the role, department, approval or email.",
            security: [{ BearerAuth: [], CsrfHeader: [] }],
            requestBody: jsonBody(updateProfileBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Profile updated",
                accountResponseSchemas.authUserData,
              ),
              ...commonErrors,
            },
          },
        },
        "/staff": {
          get: {
            summary: "List staff accounts",
            description:
              "Returns a bounded, ordered page of the current staff directory with the global verified-pending count. An administrator row is readable but never a management target.",
            security: staffReadSecurity,
            requestParams: { query: staffListQueryDtoSchema },
            responses: {
              "200": successResponse(
                "Staff directory loaded",
                staffListDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
          post: {
            summary: "Create an employee account",
            description:
              "An active verified administrator selects one employee department. The account gains that access only after the employee verifies their email and the enrollment actor is still authorized.",
            security: staffWriteSecurity,
            requestBody: jsonBody(staffCreateBodyDtoSchema),
            responses: {
              "201": successResponse(
                "Staff account created; email verification required",
                staffUserDataSchema,
              ),
              ...commonErrors,
              "409": errorResponse("An account already uses this email"),
              "503": errorResponse(
                "Verification delivery is temporarily unavailable",
              ),
            },
          },
        },
        "/staff/{userId}": {
          get: {
            summary: "Read one staff account",
            requestParams: staffPathParams,
            security: staffReadSecurity,
            responses: {
              "200": successResponse(
                "Staff account loaded",
                staffUserDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
        },
        "/staff/{userId}/decisions": {
          get: {
            summary: "Read the retained staff decisions of one account",
            description:
              "Returns the retained decision history of the selected account in a bounded, ordered page. No decisions is an empty successful result.",
            requestParams: {
              path: staffUserParamsDtoSchema,
              query: staffHistoryQueryDtoSchema,
            },
            security: staffReadSecurity,
            responses: {
              "200": successResponse(
                "Staff decisions loaded",
                staffDecisionsDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
        },
        "/staff/{userId}/approve": {
          post: {
            summary: "Approve a pending staff account",
            description:
              "Approves a verified pending account, reconsiders a verified rejected account, or prepares an old unapproved suspension. The requested department becomes the employee's one department.",
            requestParams: staffPathParams,
            security: staffWriteSecurity,
            requestBody: jsonBody(staffApprovalBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Staff approval applied",
                staffCommandDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
        },
        "/staff/{userId}/reject": {
          post: {
            summary: "Reject a pending staff account",
            description:
              "Rejects a verified pending account. An already rejected account at the current version is unchanged.",
            requestParams: staffPathParams,
            security: staffWriteSecurity,
            requestBody: jsonBody(staffCommandBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Staff rejection applied",
                staffCommandDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
        },
        "/staff/{userId}/department": {
          patch: {
            summary: "Change an approved staff account's department",
            description:
              "Changes the one department of an approved account and keeps its approval evidence and current state.",
            requestParams: staffPathParams,
            security: staffWriteSecurity,
            requestBody: jsonBody(staffDepartmentBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Staff department changed",
                staffCommandDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
        },
        "/staff/{userId}/suspend": {
          post: {
            summary: "Suspend an approved staff account",
            description:
              "Suspends an approved active account and keeps its approval evidence and department.",
            requestParams: staffPathParams,
            security: staffWriteSecurity,
            requestBody: jsonBody(staffCommandBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Staff suspension applied",
                staffCommandDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
        },
        "/staff/{userId}/reactivate": {
          post: {
            summary: "Reactivate a suspended staff account",
            description:
              "Reactivates a verified approved suspended account with its one department. An old unapproved suspension stays restricted.",
            requestParams: staffPathParams,
            security: staffWriteSecurity,
            requestBody: jsonBody(staffCommandBodyDtoSchema),
            responses: {
              "200": successResponse(
                "Staff reactivation applied",
                staffCommandDataSchema,
              ),
              ...commonErrors,
              ...staffConflictErrors,
            },
          },
        },
        "/customers": {
          get: salesRead(
            "List shared customers with scoped draft totals",
            customerListDataSchema,
            customerListQuerySchema,
          ),
          post: salesWrite(
            "Create a shared customer",
            createCustomerBodySchema,
            customerCommandDataSchema,
            "201",
          ),
        },
        "/customers/by-phone/{phone}": {
          get: salesRead(
            "Resolve canonical Saudi phone to stable customer identity",
            customerDataSchema,
            undefined,
            customerPhoneParamsSchema,
          ),
        },
        "/customers/{customerId}": {
          get: salesRead(
            "Read shared customer with scoped related data",
            customerDataSchema,
            undefined,
            customerParamsSchema,
          ),
          patch: salesWrite(
            "Patch a shared customer using its expected version",
            updateCustomerBodySchema,
            customerCommandDataSchema,
            "200",
            customerParamsSchema,
          ),
        },
        "/customers/{customerId}/measurements": {
          get: salesRead(
            "Read authorized draft measurements",
            customerMeasurementsDataSchema,
            customerMeasurementsQuerySchema,
            customerParamsSchema,
          ),
        },
        "/customers/{customerId}/drafts": {
          get: salesRead(
            "Read authorized customer draft cards with captured pieces",
            customerDraftsDataSchema,
            customerDraftsQuerySchema,
            customerParamsSchema,
          ),
        },
        "/sales-drafts": {
          get: salesRead(
            "List authorized persistent incomplete drafts",
            draftListDataSchema,
            draftListQuerySchema,
          ),
          post: salesWrite(
            "Create an incomplete draft",
            createDraftBodySchema,
            draftCommandDataSchema,
            "201",
          ),
        },
        "/sales-drafts/changes": {
          get: salesRead(
            "Read safe authorized draft activity",
            draftChangesDataSchema,
            draftChangesQuerySchema,
          ),
        },
        "/sales-drafts/{draftId}": {
          get: salesRead(
            "Reopen an authorized draft",
            draftDataSchema,
            undefined,
            draftParamsSchema,
          ),
          put: salesWrite(
            "Replace an incomplete draft using its expected version",
            saveDraftBodySchema,
            draftCommandDataSchema,
            "200",
            draftParamsSchema,
          ),
        },
        "/sales-drafts/{draftId}/changes": {
          get: salesRead(
            "Read safe activity for one authorized draft",
            draftChangesDataSchema,
            draftChangesQuerySchema,
            draftParamsSchema,
          ),
        },
        "/sales-commands/{commandId}": {
          get: {
            ...salesRead(
              "Observe the original saved command result",
              salesCommandDataSchema,
              undefined,
              salesCommandParamsSchema,
            ),
            description:
              "Same actor only, including ADMIN, and current resource visibility required. Returns the immutable original saved image with replayed=true; missing and another actor's command both return 404.",
          },
        },
        "/catalogs": {
          get: orderRead(
            "Read reviewed catalog readiness and exact source entries",
            catalogDataSchema,
          ),
        },
        "/catalogs/quotes": {
          post: {
            ...orderRead(
              "Calculate a stateless decoration-only quote",
              catalogQuoteDataSchema,
            ),
            security: [{ BearerAuth: [], CsrfHeader: [] }],
            requestBody: jsonBody(catalogQuoteBodySchema),
            description:
              "Current SALES/ADMIN and CSRF required. Returns correlated exact prices or visible unavailable reasons; creates no command, number or business write.",
          },
        },
        "/approvals/dashboard": {
          get: approvalOperation({
            summary: "Approval dashboard",
            authority:
              "APPROVAL/ADMIN; today uses the configured business calendar",
            data: approvalDashboardDataSchema,
          }),
        },
        "/approvals/orders": {
          get: approvalOperation({
            summary: "Pending initial approvals",
            authority: "APPROVAL/ADMIN",
            data: approvalOrdersDataSchema,
            query: approvalOrdersQuerySchema,
          }),
        },
        "/approvals/issues": {
          get: approvalOperation({
            summary: "Current unresolved piece issues",
            authority: "APPROVAL/ADMIN",
            data: approvalIssuesDataSchema,
            query: approvalIssuesQuerySchema,
          }),
        },
        "/approvals/history": {
          get: approvalOperation({
            summary: "Own actual approval decisions",
            authority: "APPROVAL/ADMIN; current actor decisions only",
            data: approvalHistoryDataSchema,
            query: approvalHistoryQuerySchema,
          }),
        },
        "/approvals/orders/{orderId}": {
          get: approvalOperation({
            summary: "Current approval workflow",
            authority: "APPROVAL/ADMIN",
            data: approvalOrderDataSchema,
            path: salesOrderParamsSchema,
          }),
        },
        "/approvals/orders/{orderId}/approve": {
          post: approvalOperation({
            summary: "Approve initial order",
            authority: "APPROVAL/ADMIN",
            data: approvalCommandDataSchema,
            path: salesOrderParamsSchema,
            body: approveInitialBodySchema,
          }),
        },
        "/approvals/orders/{orderId}/return": {
          post: approvalOperation({
            summary: "Return initial order",
            authority: "APPROVAL/ADMIN",
            data: approvalCommandDataSchema,
            path: salesOrderParamsSchema,
            body: returnInitialBodySchema,
          }),
        },
        "/approvals/orders/{orderId}/history": {
          get: approvalOperation({
            summary: "Merged bounded order history",
            authority: "APPROVAL/ADMIN or actual owner SALES",
            data: approvalOrderHistoryDataSchema,
            query: approvalOrderHistoryQuerySchema,
            path: salesOrderParamsSchema,
          }),
        },
        "/approvals/orders/{orderId}/events/{eventId}": {
          get: approvalOperation({
            summary: "Retained typed approval event",
            authority: "APPROVAL/ADMIN or actual owner SALES",
            data: approvalEventDataSchema,
            path: approvalEventParamsSchema,
          }),
        },
        "/approvals/orders/{orderId}/pieces/{pieceId}/issues/{issueId}/resolve":
          {
            post: approvalOperation({
              summary: "Resolve current issue A/B/C",
              authority: "APPROVAL/ADMIN",
              data: approvalCommandDataSchema,
              path: approvalIssueParamsSchema,
              body: resolveIssueBodySchema,
            }),
          },
        "/approvals/orders/{orderId}/pieces/{pieceId}/issues/{issueId}/review":
          {
            post: approvalOperation({
              summary: "Review current contact proposal",
              authority: "APPROVAL/ADMIN",
              data: approvalCommandDataSchema,
              path: approvalIssueParamsSchema,
              body: reviewContactBodySchema,
            }),
          },
        "/sales-contact": {
          get: approvalOperation({
            summary: "Scoped customer-contact queue",
            authority: "Owner SALES or ADMIN broader read",
            data: salesContactDataSchema,
            query: salesContactQuerySchema,
          }),
        },
        "/sales-contact/orders/{orderId}": {
          get: approvalOperation({
            summary: "Current contact workflow",
            authority: "Owner SALES or ADMIN broader read",
            data: approvalOrderDataSchema,
            path: salesOrderParamsSchema,
          }),
        },
        "/sales-contact/orders/{orderId}/pieces/{pieceId}/issues/{issueId}/proposals":
          {
            post: approvalOperation({
              summary: "Submit owner contact proposal",
              authority:
                "Actual immutable owner SALES/ADMIN only; ADMIN cannot act on behalf",
              data: approvalCommandDataSchema,
              path: approvalIssueParamsSchema,
              body: submitContactBodySchema,
            }),
          },
        "/order-paper/{orderId}": {
          get: approvalOperation({
            summary: "Current official order paper",
            authority:
              "APPROVAL/ADMIN or actual owner SALES; real initial witness and no pending submitted/recontact hold",
            data: officialOrderPaperDataSchema,
            path: salesOrderParamsSchema,
          }),
        },
        "/manufacturing-orders/{orderId}": {
          get: approvalOperation({
            summary: "Whole-order factory-safe paper",
            authority:
              "Current or held-source CUTTING/PRODUCTION/QUALITY relation, or ADMIN; no finance or contact correspondence",
            data: factoryOrderPaperDataSchema,
            path: salesOrderParamsSchema,
          }),
        },
        "/manufacturing-orders/{orderId}/pieces/{pieceId}/issues": {
          post: approvalOperation({
            summary: "Report current-department piece issue",
            authority:
              "Current selected-piece source CUTTING/PRODUCTION/QUALITY, or ADMIN",
            data: approvalCommandDataSchema,
            path: approvalPieceParamsSchema,
            body: reportIssueBodySchema,
          }),
        },
        "/quality/dashboard": {
          get: qualityOperation({
            summary: "Quality dashboard",
            data: qualityDashboardDataSchema,
            query: salesEmptyQuerySchema,
          }),
        },
        "/quality/orders": {
          get: qualityOperation({
            summary: "Quality grouped orders",
            data: qualityOrdersDataSchema,
            query: qualityOrdersQuerySchema,
          }),
        },
        "/quality/pieces": {
          get: qualityOperation({
            summary: "Quality physical pieces",
            data: qualityPiecesDataSchema,
            query: qualityPiecesQuerySchema,
          }),
        },
        "/quality/orders/{orderId}": {
          get: qualityOperation({
            summary: "Safe quality order and paper",
            data: qualityOrderDataSchema,
            query: salesEmptyQuerySchema,
            path: qualityOrderParamsSchema,
          }),
        },
        "/quality/activity": {
          get: qualityOperation({
            summary: "Quality department activity",
            data: qualityActivityDataSchema,
            query: qualityActivityQuerySchema,
          }),
        },
        "/quality/orders/{orderId}/history": {
          get: qualityOperation({
            summary: "Immutable quality order history",
            data: qualityOrderHistoryDataSchema,
            query: qualityOrderHistoryQuerySchema,
            path: qualityOrderParamsSchema,
          }),
        },
        "/quality/commands": {
          post: qualityOperation({
            summary: "Atomic quality command",
            data: qualityCommandDataSchema,
            query: salesEmptyQuerySchema,
            body: qualityCommandBodySchema,
          }),
        },
        "/quality-commands/{commandId}": {
          get: qualityOperation({
            summary: "Observe own original quality result",
            data: qualityCommandDataSchema,
            query: salesEmptyQuerySchema,
            path: qualityCommandParamsSchema,
          }),
        },
        "/administration/dashboard": {
          get: administrationOperation({
            summary: "Current administrative dashboard",
            query: administrationDashboardQuerySchema,
            data: administrationDashboardDataSchema,
          }),
        },
        "/administration/filter-options": {
          get: administrationOperation({
            summary: "Actual retained owner options",
            query: administrationFilterOptionsQuerySchema,
            data: administrationFilterOptionsDataSchema,
          }),
        },
        "/administration/orders": {
          get: administrationOperation({
            summary: "Mixed administrative all-orders cohort",
            query: administrationOrdersQuerySchema,
            data: administrationOrdersDataSchema,
          }),
        },
        "/administration/orders/{orderId}": {
          get: administrationOperation({
            summary: "Current administrative order detail",
            query: salesEmptyQuerySchema,
            data: administrationOrderDataSchema,
            path: administrationOrderParamsSchema,
          }),
        },
        "/administration/orders/{orderId}/history": {
          get: administrationOperation({
            summary: "Immutable full administrative order history",
            query: administrationOrderHistoryQuerySchema,
            data: administrationActivityDataSchema,
            path: administrationOrderParamsSchema,
          }),
        },
        "/administration/approvals": {
          get: administrationOperation({
            summary: "Read-only approval oversight",
            query: administrationApprovalsQuerySchema,
            data: administrationApprovalsDataSchema,
          }),
        },
        "/administration/corrections": {
          get: administrationOperation({
            summary: "Actual quality correction cycles",
            query: administrationCorrectionsQuerySchema,
            data: administrationCorrectionsDataSchema,
          }),
        },
        "/administration/delivery-exceptions": {
          get: administrationOperation({
            summary: "Distinct current delivery exceptions",
            query: administrationDeliveryExceptionsQuerySchema,
            data: administrationDeliveryExceptionsDataSchema,
          }),
        },
        "/administration/activity": {
          get: administrationOperation({
            summary: "Merged immutable administrative activity",
            query: administrationActivityQuerySchema,
            data: administrationActivityDataSchema,
          }),
        },
        "/administration/reports": {
          get: administrationOperation({
            summary: "Paged six-section report",
            query: administrationReportQuerySchema,
            data: administrationReportDataSchema,
          }),
        },
        "/administration/reports/print": {
          get: administrationOperation({
            summary: "Complete six-section print snapshot",
            query: administrationReportPrintQuerySchema,
            data: administrationReportPrintDataSchema,
          }),
        },
        "/administration/commands": {
          post: administrationOperation({
            summary:
              "Exact administrative cancellation or allowlisted correction",
            query: salesEmptyQuerySchema,
            data: administrationCommandDataSchema,
            body: administrationCommandBodySchema.out,
          }),
        },
        "/administration-commands/{commandId}": {
          get: administrationOperation({
            summary: "Observe own original administration receipt",
            query: salesEmptyQuerySchema,
            data: administrationCommandDataSchema,
            path: administrationCommandParamsSchema,
          }),
        },
        "/warehouse/dashboard": {
          get: warehouseOperation({
            summary: "Warehouse dashboard",
            data: warehouseDashboardDataSchema,
            query: warehouseDashboardQuerySchema,
          }),
        },
        "/warehouse/orders": {
          get: warehouseOperation({
            summary: "Warehouse grouped orders",
            data: warehouseOrdersDataSchema,
            query: warehouseOrdersQuerySchema,
          }),
        },
        "/warehouse/pieces": {
          get: warehouseOperation({
            summary: "Warehouse physical pieces",
            data: warehousePiecesDataSchema,
            query: warehousePiecesQuerySchema,
          }),
        },
        "/warehouse/orders/{orderId}": {
          get: warehouseOperation({
            summary: "Safe warehouse order and paper",
            data: warehouseOrderDataSchema,
            query: salesEmptyQuerySchema,
            path: warehouseOrderParamsSchema,
          }),
        },
        "/warehouse/activity": {
          get: warehouseOperation({
            summary: "Warehouse department activity",
            data: warehouseActivityDataSchema,
            query: warehouseActivityQuerySchema,
          }),
        },
        "/warehouse/orders/{orderId}/history": {
          get: warehouseOperation({
            summary: "Immutable warehouse order history",
            data: warehouseOrderHistoryDataSchema,
            query: warehouseOrderHistoryQuerySchema,
            path: warehouseOrderParamsSchema,
          }),
        },
        "/warehouse/commands": {
          post: warehouseOperation({
            summary: "Atomic warehouse command",
            data: warehouseCommandDataSchema,
            query: salesEmptyQuerySchema,
            body: warehouseCommandBodySchema,
          }),
        },
        "/warehouse-commands/{commandId}": {
          get: warehouseOperation({
            summary: "Observe own original warehouse result",
            data: warehouseCommandDataSchema,
            query: salesEmptyQuerySchema,
            path: warehouseCommandParamsSchema,
          }),
        },
        "/manufacturing/{department}/dashboard": {
          get: manufacturingOperation({
            summary: "Department work overview",
            path: manufacturingDepartmentParamsSchema,
            query: salesEmptyQuerySchema,
            data: manufacturingDashboardDataSchema,
          }),
        },
        "/manufacturing/{department}/orders": {
          get: manufacturingOperation({
            summary: "Grouped exact work queue",
            path: manufacturingDepartmentParamsSchema,
            query: manufacturingOrdersQuerySchema,
            data: manufacturingOrdersDataSchema,
          }),
        },
        "/manufacturing/{department}/pieces": {
          get: manufacturingOperation({
            summary: "Flat exact physical work queue",
            path: manufacturingDepartmentParamsSchema,
            query: manufacturingPiecesQuerySchema,
            data: manufacturingPiecesDataSchema,
          }),
        },
        "/manufacturing/{department}/orders/{orderId}": {
          get: manufacturingOperation({
            summary: "Safe current or historical order",
            path: manufacturingOrderParamsSchema,
            query: salesEmptyQuerySchema,
            data: manufacturingOrderDataSchema,
          }),
        },
        "/manufacturing/{department}/activity": {
          get: manufacturingOperation({
            summary: "Department work and safe issue history",
            path: manufacturingDepartmentParamsSchema,
            query: manufacturingActivityQuerySchema,
            data: manufacturingActivityDataSchema,
          }),
        },
        "/manufacturing/{department}/orders/{orderId}/history": {
          get: manufacturingOperation({
            summary: "Safe order work history",
            path: manufacturingOrderParamsSchema,
            query: manufacturingOrderHistoryQuerySchema,
            data: manufacturingOrderHistoryDataSchema,
          }),
        },
        "/manufacturing/{department}/commands": {
          post: manufacturingOperation({
            summary: "Atomic exact-selection work command",
            path: manufacturingDepartmentParamsSchema,
            query: salesEmptyQuerySchema,
            data: manufacturingCommandDataSchema,
            body: manufacturingCommandBodySchema,
          }),
        },
        "/manufacturing-commands/{commandId}": {
          get: manufacturingOperation({
            summary: "Observe own original work result",
            path: manufacturingCommandParamsSchema,
            query: salesEmptyQuerySchema,
            data: manufacturingCommandDataSchema,
          }),
        },
        "/approval-commands/{commandId}": {
          get: approvalOperation({
            summary: "Observe original actor command metadata",
            authority:
              "Original actor with current operation-compatible authority; REPORT permits retained source after movement but denies reassignment",
            data: approvalCommandDataSchema,
            path: salesCommandParamsSchema,
          }),
        },
        "/sales-orders": {
          get: orderRead(
            "List scoped unified drafts and submitted orders",
            salesOrderListDataSchema,
            salesOrderListQuerySchema,
          ),
          post: orderWrite({
            summary: "Submit new paper or an owned saved draft",
            body: submitOrderBodySchema,
            status: "201",
          }),
        },
        "/sales-orders/dashboard": {
          get: orderRead(
            "Read scoped counts and five recent orders",
            salesDashboardDataSchema,
          ),
        },
        "/sales-orders/activity": {
          get: orderRead(
            "Read bounded draft and order activity summaries",
            salesOrderActivityDataSchema,
            salesOrderActivityQuerySchema,
          ),
        },
        "/sales-orders/{orderId}": {
          get: orderRead(
            "Read the current scoped submitted order",
            salesOrderDataSchema,
            undefined,
            salesOrderParamsSchema,
          ),
        },
        "/sales-orders/{orderId}/tracking": {
          get: orderRead(
            "Read retained physical piece state and receipt counts",
            salesOrderTrackingDataSchema,
            undefined,
            salesOrderParamsSchema,
          ),
        },
        "/sales-orders/{orderId}/activity": {
          get: orderRead(
            "Read scoped order activity summaries",
            salesOrderActivityDataSchema,
            salesOrderActivityQuerySchema,
            salesOrderParamsSchema,
          ),
        },
        "/sales-orders/{orderId}/activity/{eventId}": {
          get: orderRead(
            "Read one authorized immutable order revision",
            salesOrderRevisionDataSchema,
            undefined,
            salesOrderRevisionParamsSchema,
          ),
        },
        "/sales-orders/{orderId}/resubmit": {
          post: orderWrite({
            summary: "Explicitly resubmit permitted returned corrections",
            body: resubmitOrderBodySchema,
            status: "200",
            path: salesOrderParamsSchema,
          }),
        },
        "/sales-orders/{orderId}/paid": {
          patch: orderWrite({
            summary: "Set authorized cumulative paid amount",
            body: setOrderPaidBodySchema,
            status: "200",
            path: salesOrderParamsSchema,
          }),
        },
        "/sales-order-editor/{orderId}": {
          get: orderRead(
            "Resolve one scoped draft or submitted editor",
            salesOrderEditorDataSchema,
            undefined,
            salesOrderParamsSchema,
          ),
        },
        "/customers/{customerId}/orders": {
          get: orderRead(
            "Read scoped submitted customer history",
            customerOrdersDataSchema,
            customerOrdersQuerySchema,
            customerParamsSchema,
          ),
        },
        "/customers/{customerId}/order-measurements": {
          get: orderRead(
            "Read scoped submitted measurements including cancellations",
            customerOrderMeasurementsDataSchema,
            customerOrderMeasurementsQuerySchema,
            customerParamsSchema,
          ),
        },
        "/health/live": {
          get: {
            summary: "Liveness check",
            responses: {
              "200": successResponse("Service alive", healthSchema),
            },
          },
        },
        "/health/ready": {
          get: {
            summary: "Readiness check",
            responses: {
              "200": successResponse("Service ready", healthSchema),
              "503": errorResponse("Database unavailable"),
            },
          },
        },
        "/openapi.json": {
          get: {
            summary: "OpenAPI 3.1 document",
            responses: { "200": { description: "OpenAPI document" } },
          },
        },
      },
    },
    {
      allowEmptySchema: { transform: true },
      override: ({ jsonSchema, zodSchema, io }) => {
        // Wire values of the shared string normalizers retain their input JSON type.
        if (io === "output" && zodSchema instanceof z.ZodPipe) {
          Object.assign(
            jsonSchema,
            z.toJSONSchema(zodSchema.in, { io: "input" }),
          );
        }
      },
    },
  );
