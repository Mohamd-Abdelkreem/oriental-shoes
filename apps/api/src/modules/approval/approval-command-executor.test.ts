import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  submitContactBodySchema,
  reviewContactBodySchema,
  reportIssueBodySchema,
} from "@template/contracts";
import { hashApprovalCommandIntent } from "./approval-command-executor.js";

it("canonicalizes sparse contact fields without hashing command IDs or losing explicit floor clearing", () => {
  const model = randomUUID(),
    size = randomUUID(),
    orderId = randomUUID(),
    pieceId = randomUUID(),
    issueId = randomUUID();
  const payload = submitContactBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 3,
    kind: "AMEND",
    contactNotes: "Confirmed",
    changes: { size, model },
  });
  const binding = {
    operation: "SUBMIT_CONTACT" as const,
    orderId,
    pieceId,
    issueId,
    expectedVersion: 3,
  };
  const hash = hashApprovalCommandIntent({ ...binding, payload });
  expect(hash).toMatch(/^[0-9a-f]{64}$/u);
  expect(
    hashApprovalCommandIntent({
      ...binding,
      payload: submitContactBodySchema.parse({
        ...payload,
        commandId: randomUUID(),
        changes: { model, size },
      }),
    }),
  ).toBe(hash);
  expect(
    hashApprovalCommandIntent({
      ...binding,
      payload: submitContactBodySchema.parse({
        ...payload,
        changes: { model, size, sole: null },
      }),
    }),
  ).not.toBe(hash);
  for (const patch of [
    { orderId: randomUUID() },
    { pieceId: randomUUID() },
    { issueId: randomUUID() },
    { expectedVersion: 4 },
  ])
    expect(
      hashApprovalCommandIntent({ ...binding, ...patch, payload }),
    ).not.toBe(hash);
});
it("hashes exact selected proposal and review branch without confusing generated report identity", () => {
  const orderId = randomUUID(),
    pieceId = randomUUID(),
    issueId = randomUUID(),
    proposalId = randomUUID();
  const payload = reviewContactBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 5,
    proposalId,
    decision: "ACCEPT",
    notes: "Approved",
  });
  const review = {
    operation: "REVIEW_CONTACT" as const,
    orderId,
    pieceId,
    issueId,
    proposalId,
    expectedVersion: 5,
    payload,
  };
  expect(hashApprovalCommandIntent(review)).not.toBe(
    hashApprovalCommandIntent({ ...review, proposalId: randomUUID() }),
  );
  const report = {
    operation: "REPORT_ISSUE" as const,
    orderId,
    pieceId,
    expectedVersion: 2,
    payload: reportIssueBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 2,
      reason: "Material",
      notes: " ",
    }),
  };
  expect(hashApprovalCommandIntent(report)).toBe(
    hashApprovalCommandIntent({
      ...report,
      payload: reportIssueBodySchema.parse({
        ...report.payload,
        commandId: randomUUID(),
        notes: null,
      }),
    }),
  );
});
