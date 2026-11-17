import { expect, it } from "vitest";
import { administrationActivityEventSchema } from "@template/contracts";
import {
  p08CorrectionEventFixture,
  p08CommandFactsFixture,
} from "@/test/p08-fixtures";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import { factoryActivityFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { toAdministrationActivityRow } from "./administration-event.model";

it("maps full administrative correction values and real audit without manufacturing a transfer", () => {
  const event = p08CorrectionEventFixture(),
    row = toAdministrationActivityRow({ kind: "administration", event });
  expect(row).toMatchObject({
    id: `administration:${event.id}`,
    orderId: p03Ids.order,
    actorName: "Actual administrator",
    actorDepartmentLabel: "الإدارة العامة",
    occurredAt: p03Instant,
    quantity: null,
    sourceLabel: null,
    destinationLabel: null,
    note: "Confirmed contact correction",
    correctionFields: [
      {
        label: "عنوان التسليم",
        before: "Frozen address",
        after: "Corrected order-only address",
      },
    ],
  });
});
it("maps exact cancellation selection and retained changes in contract order, distinct from another source with the same UUID", () => {
  const before = p08CommandFactsFixture(),
    after = p08CommandFactsFixture(2);
  after.status = "CANCELLED";
  after.counts = {
    original: 1,
    cancelled: 1,
    active: 0,
    received: 0,
    completionPercent: 0,
  };
  after.money = {
    total: "0.00",
    paidAmount: "0.00",
    remainingDue: "0.00",
    surplus: "0.00",
  };
  after.pieces = after.pieces.map((piece) => ({
    ...piece,
    stage: "CANCELLED",
    workState: "BLOCKED",
    cancelledAt: p03Instant,
    cancellationReason: "Confirmed exact cancellation",
  }));
  const event = administrationActivityEventSchema.parse({
    ...p08CorrectionEventFixture(),
    operation: "ADMIN_CANCEL",
    pieceIds: [p03Ids.piece],
    changedFields: ["cancellation", "status", "total"],
    reason: "Confirmed exact cancellation",
    before,
    after,
  });
  const row = toAdministrationActivityRow({ kind: "administration", event });
  expect(row).toMatchObject({
    quantity: 1,
    note: "Confirmed exact cancellation",
    sourceLabel: null,
    destinationLabel: null,
    correctionFields: [
      { label: "الكمية الملغاة", before: "0", after: "1" },
      { label: "حالة الطلب", before: "بانتظار الاعتماد", after: "ملغي" },
      { label: "الإجمالي", before: "1800.00", after: "0.00" },
    ],
  });
  const manufacturing = toAdministrationActivityRow({
    kind: "manufacturing",
    event: { ...factoryActivityFixture(), id: event.id },
  });
  expect(manufacturing.id).not.toBe(row.id);
  expect(manufacturing.sourceLabel).toBe("القص");
  expect(manufacturing.correctionFields).toEqual([]);
});
