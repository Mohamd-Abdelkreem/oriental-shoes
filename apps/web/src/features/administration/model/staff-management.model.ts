import { z } from "zod";

import {
  departmentSchema,
  type Department,
  type SafeUser,
  type StaffApprovalBody,
  type StaffCommandBody,
  type StaffDepartmentBody,
  type StaffOperation,
} from "@template/contracts";

/**
 * The typed command variables of the staff management boundary.
 *
 * The union reuses the shared wire bodies and adds only the two discriminants
 * the hooks dispatch on: the named operation and the canonical target. It is a
 * pure declaration: it owns no transport, cache, clock or actor state, and it
 * never imports the hooks that consume it.
 */
export type StaffCommandVariables =
  | Readonly<{
      operation: "APPROVE";
      userId: string;
      body: StaffApprovalBody;
    }>
  | Readonly<{
      operation: "CHANGE_DEPARTMENT";
      userId: string;
      body: StaffDepartmentBody;
    }>
  | Readonly<{
      operation: "REJECT";
      userId: string;
      body: StaffCommandBody;
    }>
  | Readonly<{
      operation: "SUSPEND";
      userId: string;
      body: StaffCommandBody;
    }>
  | Readonly<{
      operation: "REACTIVATE";
      userId: string;
      body: StaffCommandBody;
    }>;

const REQUIRED_DEPARTMENT_MESSAGE = "a department must be selected";

/**
 * The one form-only department draft of the staff dialog.
 *
 * The shared department enum owns the accepted values. The draft adds only
 * the required-selection rule: an absent, null, blank, repeated or
 * administration value is a field error on `department`. The schema never
 * defaults a selection, so no department is silently assigned to an employee.
 */
export const staffDepartmentFormSchema = z.object({
  department: z
    .string({ error: REQUIRED_DEPARTMENT_MESSAGE })
    .trim()
    .min(1, { error: REQUIRED_DEPARTMENT_MESSAGE })
    .pipe(departmentSchema),
});

/**
 * The explicit intent of one staff command.
 *
 * The intent is derived from the shared operation set, so it can never name an
 * operation the server does not accept. The two assignment operations carry
 * the one required department; the three state-only operations must not carry a
 * department at all.
 */
export type StaffCommandIntent = {
  [Operation in StaffOperation]: Operation extends
    "APPROVE" | "CHANGE_DEPARTMENT"
    ? Readonly<{ operation: Operation; department: Department }>
    : Readonly<{ operation: Operation }>;
}[StaffOperation];

/**
 * The visible staff commands of one observed account.
 *
 * The result is a presentation hint only: the server stays the authority of
 * every command, and a stale, unchanged or replayed outcome remains a backend
 * decision. Administrators and unverified accounts expose no employee command.
 */
export const availableStaffOperations = (
  staff: SafeUser,
): readonly StaffOperation[] => {
  if (staff.role === "ADMIN") return [];
  if (staff.emailVerifiedAt === null) return [];

  switch (staff.status) {
    case "PENDING_APPROVAL":
      return ["APPROVE", "REJECT"];
    case "REJECTED":
      // A rejected account is reconsidered through approval.
      return ["APPROVE"];
    case "ACTIVE":
      // Only an approved account owns an assignment to change or suspend.
      return staff.staffApprovedAt === null
        ? []
        : ["CHANGE_DEPARTMENT", "SUSPEND"];
    case "SUSPENDED":
      // A legacy suspension without approval is prepared through approval.
      // Preparing it is not reactivation.
      return staff.staffApprovedAt === null
        ? ["APPROVE"]
        : ["CHANGE_DEPARTMENT", "REACTIVATE"];
    case "PENDING_VERIFICATION":
      return [];
  }
};

/**
 * The shaped command of one confirmed intent.
 *
 * The body carries only the planned fields: the caller-provided command
 * identity, the observed access version of the target snapshot and the
 * required department of an assignment operation. It never carries the actor,
 * a timestamp, a role, a status or any other field the shared command bodies
 * reject. The command identity is allocated by the caller, so a repeated or
 * uncertain submission keeps its own identifier.
 */
export const createStaffCommand = (
  intent: StaffCommandIntent,
  staff: SafeUser,
  commandId: string,
): StaffCommandVariables => {
  const userId = staff.id;
  const expectedAccessVersion = staff.accessVersion;

  switch (intent.operation) {
    case "APPROVE":
      return {
        operation: "APPROVE",
        userId,
        body: {
          commandId,
          expectedAccessVersion,
          department: intent.department,
        },
      };
    case "CHANGE_DEPARTMENT":
      return {
        operation: "CHANGE_DEPARTMENT",
        userId,
        body: {
          commandId,
          expectedAccessVersion,
          department: intent.department,
        },
      };
    case "REJECT":
      return {
        operation: "REJECT",
        userId,
        body: { commandId, expectedAccessVersion },
      };
    case "SUSPEND":
      return {
        operation: "SUSPEND",
        userId,
        body: { commandId, expectedAccessVersion },
      };
    case "REACTIVATE":
      return {
        operation: "REACTIVATE",
        userId,
        body: { commandId, expectedAccessVersion },
      };
  }
};
