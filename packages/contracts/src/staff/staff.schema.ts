import { z } from "zod";

import {
  accessVersionSchema,
  departmentSchema,
  safeUserSchema,
  userStatusSchema,
} from "../account/account.schema.ts";
import {
  nonEmptyBoundedString,
  paginationMetaSchema,
} from "../http/http.schema.ts";

const canonicalUuidSchema = z.uuid().transform((value) => value.toLowerCase());

const paginationScalarSchema = z.union([z.string().max(32), z.number().int()]);

const staffSearchSchema = z
  .string()
  .max(150)
  .refine((value) => !value.includes("\u0000"), {
    message: "must not contain null characters",
  });

export const staffUserParamsSchema = z
  .object({ userId: canonicalUuidSchema })
  .strict();

export const staffListQuerySchema = z
  .object({
    scope: z.enum(["all", "pending"]).default("all"),
    search: staffSearchSchema.optional(),
    page: paginationScalarSchema.optional(),
    limit: paginationScalarSchema.optional(),
  })
  .strict()
  .transform((query) => {
    const search = query.search?.trim();
    return {
      scope: query.scope,
      ...(search !== undefined && search.length > 0 ? { search } : {}),
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    };
  });

export const staffHistoryQuerySchema = z
  .object({
    page: paginationScalarSchema.optional(),
    limit: paginationScalarSchema.optional(),
  })
  .strict()
  .transform((query) => ({
    ...(query.page !== undefined ? { page: query.page } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  }));

export const staffEmptyQuerySchema = z.object({}).strict();

export const staffCommandBodySchema = z
  .object({
    commandId: canonicalUuidSchema,
    expectedAccessVersion: accessVersionSchema,
  })
  .strict();

export const staffApprovalBodySchema = z
  .object({
    commandId: canonicalUuidSchema,
    expectedAccessVersion: accessVersionSchema,
    department: departmentSchema,
  })
  .strict();

export const staffDepartmentBodySchema = z
  .object({
    commandId: canonicalUuidSchema,
    expectedAccessVersion: accessVersionSchema,
    department: departmentSchema,
  })
  .strict();

export const staffOperationSchema = z.enum([
  "APPROVE",
  "REJECT",
  "CHANGE_DEPARTMENT",
  "SUSPEND",
  "REACTIVATE",
]);

export const staffDecisionActionSchema = z.enum([
  "APPROVE",
  "RECONSIDER",
  "PREPARE_APPROVAL",
  "REJECT",
  "CHANGE_DEPARTMENT",
  "SUSPEND",
  "REACTIVATE",
]);

export const staffAccessSnapshotSchema = z
  .object({
    status: userStatusSchema,
    department: departmentSchema.nullable(),
    staffApprovedAt: z.iso.datetime({ offset: true }).nullable(),
    accessVersion: accessVersionSchema,
  })
  .strict();

export const staffDecisionActorSchema = z
  .object({
    id: z.uuid(),
    fullName: nonEmptyBoundedString(150),
    role: z.literal("ADMIN"),
    department: z.literal(null),
  })
  .strict();

export const staffDecisionSchema = z
  .object({
    id: z.uuid(),
    commandId: z.uuid(),
    action: staffDecisionActionSchema,
    actor: staffDecisionActorSchema,
    targetUserId: z.uuid(),
    occurredAt: z.iso.datetime({ offset: true }),
    before: staffAccessSnapshotSchema,
    after: staffAccessSnapshotSchema,
  })
  .strict();

export const staffListDataSchema = z
  .object({
    staff: z.array(safeUserSchema).max(100),
    pagination: paginationMetaSchema,
    pendingCount: z.number().int().min(0),
  })
  .strict();

export const staffUserDataSchema = z.object({ staff: safeUserSchema }).strict();

export const staffDecisionsDataSchema = z
  .object({
    decisions: z.array(staffDecisionSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();

export const staffCommandDataSchema = z
  .object({
    staff: safeUserSchema,
    decision: staffDecisionSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict()
  .refine((data) => !data.replayed || data.decision !== null, {
    message: "a replayed result must reference the original decision",
    path: ["decision"],
  })
  .refine(
    (data) =>
      data.decision === null ||
      (data.decision.after.accessVersion === data.staff.accessVersion &&
        data.decision.after.status === data.staff.status &&
        data.decision.after.department === data.staff.department &&
        data.decision.after.staffApprovedAt === data.staff.staffApprovedAt),
    {
      message: "an applied decision must match the returned target authority",
      path: ["decision"],
    },
  );

export type StaffUserParams = z.infer<typeof staffUserParamsSchema>;
export type StaffListQueryInput = z.input<typeof staffListQuerySchema>;
export type StaffListQuery = z.output<typeof staffListQuerySchema>;
export type StaffHistoryQueryInput = z.input<typeof staffHistoryQuerySchema>;
export type StaffHistoryQuery = z.output<typeof staffHistoryQuerySchema>;
export type StaffEmptyQuery = z.infer<typeof staffEmptyQuerySchema>;
export type StaffCommandBody = z.infer<typeof staffCommandBodySchema>;
export type StaffApprovalBody = z.infer<typeof staffApprovalBodySchema>;
export type StaffDepartmentBody = z.infer<typeof staffDepartmentBodySchema>;
export type StaffOperation = z.infer<typeof staffOperationSchema>;
export type StaffDecisionAction = z.infer<typeof staffDecisionActionSchema>;
export type StaffAccessSnapshot = z.infer<typeof staffAccessSnapshotSchema>;
export type StaffDecisionActor = z.infer<typeof staffDecisionActorSchema>;
export type StaffDecision = z.infer<typeof staffDecisionSchema>;
export type StaffListData = z.infer<typeof staffListDataSchema>;
export type StaffUserData = z.infer<typeof staffUserDataSchema>;
export type StaffDecisionsData = z.infer<typeof staffDecisionsDataSchema>;
export type StaffCommandData = z.infer<typeof staffCommandDataSchema>;
