import { AxiosError, AxiosHeaders } from "axios";
import { expect, it } from "vitest";
import { ApiContractError } from "@/services/api/api-client";
import {
  ApprovalLocalCommandError,
  isUnknownApprovalWrite,
  approvalCommandCapability,
} from "./approval-command-state";

it.each([
  "APPROVE_INITIAL",
  "RETURN_INITIAL",
  "RESOLVE_ISSUE",
  "REVIEW_CONTACT",
])("maps %s only to approval", (operation) => {
  expect(approvalCommandCapability(operation)).toBe("APPROVAL");
});
it("excludes reporting from frontend commands and maps owner contact explicitly", () => {
  expect(approvalCommandCapability("SUBMIT_CONTACT")).toBe("SALES_CONTACT");
  expect(approvalCommandCapability("REPORT_ISSUE")).toBeNull();
});
it.each([
  [400, "VALIDATION_ERROR", false],
  [403, "DEPARTMENT_ACCESS_DENIED", false],
  [409, "APPROVAL_COMMAND_CONFLICT", false],
  [409, "APPROVAL_TRANSACTION_CONFLICT", true],
  [503, "ORDER_CATALOG_UNAVAILABLE", false],
  [500, "INTERNAL_ERROR", true],
  [504, "GATEWAY_TIMEOUT", true],
])("classifies HTTP %s %s uncertainty", (status, code, expected) => {
  const error = new AxiosError("Failure", undefined, undefined, undefined, {
    status,
    statusText: "Failure",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      message: "Safe failure",
      statusCode: status,
      code,
      requestId: "test",
      errors: [],
    },
  });
  expect(isUnknownApprovalWrite(error)).toBe(expected);
});
it("distinguishes local preflight failures from malformed successes and network uncertainty", () => {
  expect(isUnknownApprovalWrite(new ApprovalLocalCommandError("BUSY"))).toBe(
    false,
  );
  expect(isUnknownApprovalWrite(new ApiContractError())).toBe(true);
  expect(isUnknownApprovalWrite(new Error("No response"))).toBe(true);
});
