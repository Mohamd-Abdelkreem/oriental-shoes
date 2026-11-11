import { AxiosError, AxiosHeaders } from "axios";
import { expect, it } from "vitest";
import {
  manufacturingIssueFormSchema,
  manufacturingFailureMessage,
  toManufacturingIssueBody,
} from "./manufacturing-form.model";
import { p03Ids } from "@/test/p03-fixtures";

it.each([undefined, null, "", "   "])(
  "allows absent optional notes=%s while retaining the required reason",
  (notes) => {
    expect(
      toManufacturingIssueBody(
        {
          reason: "  عيب في الجلد  ",
          ...(notes === undefined ? {} : { notes }),
        },
        { commandId: p03Ids.command, expectedVersion: 2 },
      ),
    ).toMatchObject({ reason: "  عيب في الجلد  " });
  },
);
it("distinguishes missing reason from over-limit reason/notes without truncation", () => {
  for (const input of [
    { reason: " " },
    { reason: "a".repeat(4001) },
    { reason: "valid", notes: "a".repeat(4001) },
    { reason: "valid", actorId: p03Ids.actor },
  ])
    expect(manufacturingIssueFormSchema.safeParse(input).success).toBe(false);
  expect(
    manufacturingIssueFormSchema.safeParse({
      reason: "a".repeat(4000),
      notes: "a".repeat(4000),
    }).success,
  ).toBe(true);
  expect(
    manufacturingFailureMessage(new Error("SQL secret"), "تسجيل المشكلة"),
  ).not.toContain("SQL");
  expect(manufacturingFailureMessage(null, "تسجيل المشكلة", "notes")).toContain(
    "اختيارية",
  );
});

it.each([
  ["MANUFACTURING_WORK_UNCHANGED", "أنت آخر منفذ"],
  ["MANUFACTURING_TRANSACTION_CONFLICT", "غير مؤكدة"],
  ["MANUFACTURING_SELECTION_CONFLICT", "رُفضت المجموعة كاملة دون تغيير"],
])("keeps %s failure meaning distinct and actionable", (code, meaning) => {
  const error = new AxiosError(
    "safe error",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      status: 409,
      statusText: "Conflict",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 409,
        code,
        message: "Safe error",
        requestId: "safe-request",
        timestamp: "2026-11-11T00:00:00.000Z",
        path: "/api/v1/manufacturing/cutting/commands",
      },
    },
  );
  expect(manufacturingFailureMessage(error, "متابعة العمل")).toContain(meaning);
});
