import { expect, it } from "vitest";
import { p03Ids } from "@/test/p03-fixtures";
import {
  issueDecisionFormSchema,
  contactReviewFormSchema,
  toResolveIssueBody,
  toReviewContactBody,
  returnInitialFormSchema,
  toReturnInitialBody,
} from "./approval-form.model";

it("keeps free-text reason and optional notes separate with immutable command metadata", () => {
  const values = returnInitialFormSchema.parse({
    reason: "Clarify this customer's requested finish",
    notes: "Keep the retained model",
  });
  expect(
    toReturnInitialBody(values, {
      commandId: p03Ids.command,
      expectedVersion: 7,
    }),
  ).toEqual({
    commandId: p03Ids.command,
    expectedVersion: 7,
    reason: values.reason,
    notes: "Keep the retained model",
  });
  expect(
    returnInitialFormSchema.parse({
      reason: "Clarify the request",
      notes: "  ",
    }).notes,
  ).toBeNull();
});
it.each(["", "   ", "x".repeat(4001)])(
  "rejects an invalid mandatory free-text reason",
  (reason) => {
    expect(
      returnInitialFormSchema.safeParse({ reason, notes: "" }).success,
    ).toBe(false);
  },
);
it("enforces the shared text bounds independently on both fields", () => {
  expect(
    returnInitialFormSchema.safeParse({
      reason: "x".repeat(4000),
      notes: "x".repeat(4000),
    }).success,
  ).toBe(true);
  expect(
    returnInitialFormSchema.safeParse({
      reason: "Valid reason",
      notes: "x".repeat(4001),
    }).success,
  ).toBe(false);
});

it("validates only the active issue branch and omits retained inactive fields from the wire body", () => {
  const base = { commandId: p03Ids.command, expectedVersion: 4 };
  const values = {
    decision: "SEND_TO_SALES" as const,
    target: "PRODUCTION" as const,
    notes: "Confirm the material with the customer",
    reason: "",
    confirmed: false,
  };
  expect(
    issueDecisionFormSchema.safeParse({ ...values, target: null }).success,
  ).toBe(false);
  expect(
    toResolveIssueBody(issueDecisionFormSchema.parse(values), base),
  ).toEqual({
    ...base,
    decision: "SEND_TO_SALES",
    target: "PRODUCTION",
    notes: values.notes,
  });
  const cancellation = {
    ...values,
    decision: "CANCEL" as const,
    reason: "Customer requested cancellation",
    confirmed: true,
  };
  expect(
    toResolveIssueBody(issueDecisionFormSchema.parse(cancellation), base),
  ).toEqual({
    ...base,
    decision: "CANCEL",
    reason: cancellation.reason,
    confirmed: true,
  });
  expect(
    issueDecisionFormSchema.safeParse({ ...cancellation, confirmed: false })
      .success,
  ).toBe(false);
});
it("binds review to the current proposal and selects only active notes or reason", () => {
  const base = { commandId: p03Ids.command, expectedVersion: 8 };
  const values = {
    decision: "ACCEPT" as const,
    notes: "Customer confirmed the specification",
    reason: "retained inactive text",
    confirmed: false,
  };
  expect(
    toReviewContactBody(
      contactReviewFormSchema.parse(values),
      base,
      p03Ids.source,
    ),
  ).toEqual({
    ...base,
    proposalId: p03Ids.source,
    decision: "ACCEPT",
    notes: values.notes,
  });
  expect(
    toReviewContactBody(
      contactReviewFormSchema.parse({
        ...values,
        decision: "RETURN_TO_SALES",
        reason: "Confirm the size again",
      }),
      base,
      p03Ids.source,
    ),
  ).toEqual({
    ...base,
    proposalId: p03Ids.source,
    decision: "RETURN_TO_SALES",
    reason: "Confirm the size again",
  });
  expect(
    contactReviewFormSchema.safeParse({
      ...values,
      notes: " ",
      reason: "Not used",
    }).success,
  ).toBe(false);
});
