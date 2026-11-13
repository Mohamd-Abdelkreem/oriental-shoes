import { expect, it } from "vitest";
import { qualityActivityEventSchema } from "@template/contracts";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import {
  toQualityEventSummary,
  toQualityOperationLabel,
} from "./quality-event.model";

const base = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  commandId: p03Ids.command,
  orderId: p03Ids.order,
  orderVersion: 3,
  businessNumber: "SHOP-2026-0001",
  department: "QUALITY",
  actor: {
    id: p03Ids.actor,
    fullName: "Actual historical inspector",
    role: "USER",
    department: "QUALITY",
  },
  occurredAt: p03Instant,
  report: null,
};
it("renders immutable failed-prior/opened-next cycle facts with original rejection instructions and actor", () => {
  const event = qualityActivityEventSchema.parse({
    ...base,
    operation: "INSPECT",
    pieces: [
      {
        pieceId: p03Ids.piece,
        visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        decision: "REJECT",
        stage: "PRODUCTION",
        workState: "INCOMING",
        correctionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        issueId: null,
      },
    ],
    correctionLinks: [
      {
        pieceId: p03Ids.piece,
        correctionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        cycle: 1,
        action: "REJECTED",
      },
      {
        pieceId: p03Ids.piece,
        correctionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        cycle: 2,
        action: "OPENED",
      },
    ],
    inspection: {
      decisions: [
        {
          pieceId: p03Ids.piece,
          decision: "REJECT",
          target: "PRODUCTION",
          reason: "Original defect",
          instructions: "Original instructions",
        },
      ],
      inspectorNote: null,
      packing: null,
    },
  });
  const before = structuredClone(event),
    summary = toQualityEventSummary(event);
  expect(summary).toContain("للدورة السابقة 1");
  expect(summary).toContain("دورة تصحيح محفوظة 2");
  expect(summary).toContain("Original instructions");
  expect(summary).toContain("Actual historical inspector");
  expect(event).toEqual(before);
});
it.each(["RECEIVE_AND_START", "CONTINUE", "INSPECT", "REPORT_ISSUES"] as const)(
  "provides an action label for %s without private data or receipt claims",
  (operation) => {
    expect(toQualityOperationLabel(operation)).not.toBe(operation);
    expect(toQualityOperationLabel(operation)).not.toContain("سعر");
  },
);
it("describes ordinary acceptance as handoff rather than completed physical receipt", () => {
  const event = qualityActivityEventSchema.parse({
    ...base,
    operation: "INSPECT",
    pieces: [
      {
        pieceId: p03Ids.piece,
        visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        decision: "ACCEPT",
        stage: "WAREHOUSE",
        workState: "INCOMING",
        correctionId: null,
        issueId: null,
      },
    ],
    correctionLinks: [],
    inspection: {
      decisions: [{ pieceId: p03Ids.piece, decision: "ACCEPT" }],
      inspectorNote: null,
      packing: null,
    },
  });
  expect(toQualityEventSummary(event)).toContain("دون تسجيل الاستلام الفعلي");
  expect(toQualityEventSummary(event)).not.toContain("الكراتين:");
});
