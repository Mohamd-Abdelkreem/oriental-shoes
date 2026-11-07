import { expect, it } from "vitest";
import { approvalOrderDataSchema } from "@template/contracts";
import { orderFixture, p03Ids, p03Instant } from "@/test/p03-fixtures";
import { toApprovalTracking } from "./approval-view.model";

it("derives tracking only from the same authorized wrapper revision and physical facts", () => {
  const order = orderFixture(9);
  const data = approvalOrderDataSchema.parse({
    order: {
      ...order,
      status: "CANCELLED",
      counts: {
        ...order.counts,
        original: 1,
        active: 0,
        cancelled: 1,
        received: 0,
      },
      money: { ...order.money, total: "0.00", remainingDue: "0.00" },
      pieces: order.pieces.map((piece) => ({
        ...piece,
        stage: "CANCELLED",
        workState: "BLOCKED",
        cancelledAt: p03Instant,
        cancellationReason: "Customer cancellation",
      })),
    },
    workflow: {
      initialApproval: null,
      currentReturn: null,
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: { allowed: false, reason: "NOT_APPROVED" },
      issues: [],
    },
  });
  expect(toApprovalTracking(data)).toMatchObject({
    orderId: p03Ids.order,
    version: 9,
    ready: false,
    counts: data.order.counts,
    pieces: [
      {
        pieceId: p03Ids.piece,
        stage: "CANCELLED",
        workState: "BLOCKED",
        cancelledAt: p03Instant,
        cancellationReason: "Customer cancellation",
        model: order.pieces[0]?.model,
      },
    ],
  });
});
