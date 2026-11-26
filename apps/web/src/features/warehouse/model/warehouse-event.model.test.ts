import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  warehouseActivityEventSchema,
  type WarehouseCommandOperation,
} from "@template/contracts";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import { toOrderPieceLabels } from "@/features/orders/model/order-display-reference";
import {
  toWarehouseEventSummary,
  toWarehouseOperationLabel,
} from "./warehouse-event.model";

const actor = {
  id: p03Ids.actor,
  fullName: "Warehouse A",
  role: "USER",
  department: "WAREHOUSE",
};
const event = (operation: WarehouseCommandOperation) => {
  const failed =
    operation === "FAIL_DELIVERY" || operation === "RETRY_DELIVERY";
  const outcome =
    operation === "CONFIRM_DELIVERY"
      ? {
          id: p03Ids.source,
          kind: "DELIVERED",
          recordedBy: actor,
          recordedAt: p03Instant,
          recipient: "<script>recipient</script>",
          deliveredAt: null,
          notes: null,
        }
      : failed
        ? {
            id: p03Ids.source,
            kind: "FAILED",
            recordedBy: actor,
            recordedAt: p03Instant,
            returnedToWarehouse: true,
            reason: "Customer absent",
            notes: null,
          }
        : null;
  const retry =
    operation === "RETRY_DELIVERY"
      ? {
          id: p03Ids.source,
          actor,
          occurredAt: p03Instant,
          retryDate: null,
          notes: "Call first",
        }
      : null;
  return warehouseActivityEventSchema.parse({
    id: p03Ids.source,
    commandId: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    operation,
    actor,
    occurredAt: p03Instant,
    pieceIds: [p03Ids.piece],
    beforeStatus:
      operation === "RECEIVE"
        ? "APPROVED"
        : operation === "DISPATCH"
          ? "READY_FOR_DELIVERY"
          : operation === "RETRY_DELIVERY"
            ? "DELIVERY_FAILED"
            : "OUT_FOR_DELIVERY",
    afterStatus:
      operation === "RECEIVE" || operation === "RETRY_DELIVERY"
        ? "READY_FOR_DELIVERY"
        : operation === "DISPATCH"
          ? "OUT_FOR_DELIVERY"
          : operation === "CONFIRM_DELIVERY"
            ? "DELIVERED"
            : "DELIVERY_FAILED",
    receiptGroup:
      operation === "RECEIVE"
        ? {
            id: p03Ids.source,
            orderId: p03Ids.order,
            pieceIds: [p03Ids.piece],
            actor,
            receivedAt: p03Instant,
            cartonCount: "2",
            storageLocation: "Shelf B-12",
            notes: null,
          }
        : null,
    attempt:
      operation === "RECEIVE"
        ? null
        : {
            id: p03Ids.source,
            orderId: p03Ids.order,
            number: 1,
            pieceIds: [p03Ids.piece],
            status: outcome?.kind ?? "DISPATCHED",
            dispatchedBy: actor,
            dispatchedAt: p03Instant,
            deliveryNote: null,
            outcome,
            retry,
          },
    retry,
  });
};
it.each([
  "RECEIVE",
  "DISPATCH",
  "CONFIRM_DELIVERY",
  "FAIL_DELIVERY",
  "RETRY_DELIVERY",
] as const)(
  "retains original scope and distinct %s capture as safe text",
  (operation) => {
    const recorded = event(operation);
    const summary = toWarehouseEventSummary(
      recorded,
      toOrderPieceLabels([{ id: p03Ids.piece, position: 2 }]),
    );
    expect(summary).toContain(toWarehouseOperationLabel(operation));
    expect(summary).toContain("القطعة 02");
    expect(summary).not.toMatch(
      /[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/iu,
    );
    expect(toWarehouseEventSummary(recorded)).toContain("1 قطعة");
    expect(summary).toContain("Warehouse A");
    expect(summary).toContain(p03Instant);
    if (operation === "RECEIVE") {
      expect(summary).toContain("Shelf B-12");
      expect(summary).toContain("2");
    }
    if (operation === "FAIL_DELIVERY")
      expect(summary).toContain("Customer absent");
    if (operation === "RETRY_DELIVERY") expect(summary).toContain("Call first");
    if (operation === "CONFIRM_DELIVERY")
      expect(renderToStaticMarkup(createElement("p", null, summary))).toContain(
        "&lt;script&gt;recipient&lt;/script&gt;",
      );
    if (operation === "DISPATCH") {
      expect(summary).not.toContain("المستلم:");
      expect(summary).not.toContain("وقت التسليم الفعلي:");
    }
  },
);
