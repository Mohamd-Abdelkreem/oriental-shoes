import { z } from "zod";

import { nonEmptyBoundedString } from "../http/http.schema.ts";

export const userRoleSchema = z.enum(["USER", "ADMIN"]);

export const departmentSchema = z.enum([
  "SALES",
  "APPROVAL",
  "CUTTING",
  "PRODUCTION",
  "QUALITY",
  "WAREHOUSE",
]);

export const accessVersionSchema = z.number().int().min(0).max(2_147_483_647);

export const userStatusSchema = z.enum([
  "PENDING_VERIFICATION",
  "PENDING_APPROVAL",
  "REJECTED",
  "ACTIVE",
  "SUSPENDED",
]);

const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const safeUserSchema = z
  .object({
    id: z.uuid(),
    fullName: nonEmptyBoundedString(150),
    email: z.email().max(320),
    phone: z.string().min(1).max(30).nullable(),
    role: userRoleSchema,
    status: userStatusSchema,
    department: departmentSchema.nullable(),
    staffApprovedAt: isoDateTimeSchema.nullable(),
    accessVersion: accessVersionSchema,
    emailVerifiedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((user, context) => {
    const reject = (message: string, path: (string | number)[]) => {
      context.addIssue({ code: "custom", message, path });
    };

    const verified = user.emailVerifiedAt !== null;

    if (user.status === "PENDING_VERIFICATION") {
      if (verified) {
        reject("pending verification accounts cannot be verified", [
          "emailVerifiedAt",
        ]);
      }
      if (user.department !== null) {
        reject("pending verification accounts cannot have a department", [
          "department",
        ]);
      }
      if (user.staffApprovedAt !== null) {
        reject("pending verification accounts cannot have staff approval", [
          "staffApprovedAt",
        ]);
      }
    } else if (!verified) {
      reject("verified account states require a verification timestamp", [
        "emailVerifiedAt",
      ]);
    }

    if (user.role === "ADMIN") {
      if (user.status === "PENDING_APPROVAL" || user.status === "REJECTED") {
        reject("administrators cannot use employee review states", ["status"]);
      }
      if (user.department !== null) {
        reject("administrators cannot have a department", ["department"]);
      }
      if (user.staffApprovedAt !== null) {
        reject("administrators cannot have staff approval", [
          "staffApprovedAt",
        ]);
      }
      return;
    }

    if (user.status === "PENDING_APPROVAL" || user.status === "REJECTED") {
      if (user.department !== null) {
        reject("unapproved employees cannot have a department", ["department"]);
      }
      if (user.staffApprovedAt !== null) {
        reject("unapproved employees cannot have staff approval", [
          "staffApprovedAt",
        ]);
      }
      return;
    }

    if (user.status === "ACTIVE") {
      if (user.department === null) {
        reject("active employees require exactly one department", [
          "department",
        ]);
      }
      if (user.staffApprovedAt === null) {
        reject("active employees require staff approval evidence", [
          "staffApprovedAt",
        ]);
      }
      return;
    }

    if (user.status === "SUSPENDED") {
      const hasDepartment = user.department !== null;
      const hasApproval = user.staffApprovedAt !== null;
      if (hasDepartment !== hasApproval) {
        reject(
          "suspended employees must carry both or neither department and staff approval",
          [hasDepartment ? "staffApprovedAt" : "department"],
        );
      }
    }
  });

export const authUserDataSchema = z.object({ user: safeUserSchema }).strict();

export const authSessionDataSchema = z
  .object({
    user: safeUserSchema,
    tokens: z.object({ accessToken: z.string().min(1) }).strict(),
  })
  .strict();

export const authNeutralDataSchema = z
  .object({ message: nonEmptyBoundedString(500) })
  .strict();

export const authEmptyDataSchema = z.object({}).strict();

export const resetTokenValidationDataSchema = z
  .object({ valid: z.literal(true) })
  .strict();

export const accountResponseSchemas = Object.freeze({
  safeUser: safeUserSchema,
  authUserData: authUserDataSchema,
  authSessionData: authSessionDataSchema,
});

export const ACCOUNT_RESPONSE_FIELD_ALLOWLIST = [
  "id",
  "fullName",
  "email",
  "phone",
  "role",
  "status",
  "department",
  "staffApprovedAt",
  "accessVersion",
  "emailVerifiedAt",
  "createdAt",
  "updatedAt",
] as const;

export type UserRole = z.infer<typeof userRoleSchema>;
export type Department = z.infer<typeof departmentSchema>;
export type AccessVersion = z.infer<typeof accessVersionSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type SafeUser = z.infer<typeof safeUserSchema>;
export type AuthUserData = z.infer<typeof authUserDataSchema>;
export type AuthSessionData = z.infer<typeof authSessionDataSchema>;
export type AuthNeutralData = z.infer<typeof authNeutralDataSchema>;
export type AuthEmptyData = z.infer<typeof authEmptyDataSchema>;
export type ResetTokenValidationData = z.infer<
  typeof resetTokenValidationDataSchema
>;
