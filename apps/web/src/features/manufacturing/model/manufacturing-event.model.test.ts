import { expect, it } from "vitest";
import { manufacturingActivityEventSchema } from "@template/contracts";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import { toManufacturingEventSummary } from "./manufacturing-event.model";

it("names the actual actor, physical count and normal destination", () => {
  const event = manufacturingActivityEventSchema.parse({
    id: p03Ids.source,
    commandId: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    department: "PRODUCTION",
    operation: "COMPLETE_TRANSFER",
    actor: {
      id: p03Ids.actor,
      fullName: "العامل الفعلي",
      role: "USER",
      department: "PRODUCTION",
    },
    occurredAt: p03Instant,
    pieces: [
      {
        pieceId: p03Ids.piece,
        visitId: p03Ids.customer,
        nextVisitId: null,
        stage: "QUALITY",
        workState: "INCOMING",
      },
    ],
    destination: "QUALITY",
  });
  expect(toManufacturingEventSummary(event)).toContain("العامل الفعلي");
  expect(toManufacturingEventSummary(event)).toContain("1 قطعة");
  expect(toManufacturingEventSummary(event)).toContain("الجودة والتغليف");
});
