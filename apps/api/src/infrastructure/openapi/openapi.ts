import { z } from "zod";
import { createDocument } from "zod-openapi";

import {
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
  createDocument({
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
            "200": successResponse("Request processed", authNeutralDataSchema),
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
            "200": successResponse("Request processed", authNeutralDataSchema),
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
      },
      "/staff/{userId}": {
        get: {
          summary: "Read one staff account",
          requestParams: staffPathParams,
          security: staffReadSecurity,
          responses: {
            "200": successResponse("Staff account loaded", staffUserDataSchema),
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
      "/health/live": {
        get: {
          summary: "Liveness check",
          responses: { "200": successResponse("Service alive", healthSchema) },
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
  });
