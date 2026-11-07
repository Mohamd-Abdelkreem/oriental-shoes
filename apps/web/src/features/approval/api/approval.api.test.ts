import { beforeEach, expect, it, vi } from "vitest";
import { approvalOrderDataSchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Envelope,
  p03Pagination,
} from "@/test/p03-fixtures";
import { approvalApi } from "./approval.api";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => {
  vi.resetAllMocks();
});
const wrapper = () =>
  approvalOrderDataSchema.parse({
    order: orderFixture(),
    workflow: {
      initialApproval: null,
      currentReturn: null,
      allowedActions: { canApproveInitial: true, canReturnInitial: true },
      printEligibility: { allowed: false, reason: "NOT_APPROVED" },
      issues: [],
    },
  });
const receipt = (operation = "APPROVE_INITIAL", children = false) => ({
  kind: "approval-command",
  replayed: false,
  receipt: {
    commandId: p03Ids.command,
    operation,
    orderId: p03Ids.order,
    actor: {
      id: p03Ids.actor,
      fullName: "Approver",
      role: "USER",
      department: "APPROVAL",
    },
    beforeVersion: 1,
    afterVersion: 2,
    occurredAt: p03Instant,
  },
  outcome: {
    orderId: p03Ids.order,
    orderVersion: 2,
    orderStatus: "APPROVED",
    pieceId: children ? p03Ids.piece : null,
    pieceStage: children ? "CUTTING" : null,
    pieceWorkState: children ? "BLOCKED" : null,
    issueId: children ? p03Ids.customer : null,
    issueState: children ? "SALES_CONTACT" : null,
    proposalId: operation === "REVIEW_CONTACT" ? p03Ids.source : null,
  },
});
it("normalizes all queue filters and forwards signals without changing empty success into failure", async () => {
  const signal = new AbortController().signal,
    page = { items: [], pagination: p03Pagination };
  transport.get.mockResolvedValue(p03Envelope(page));
  expect(
    (await approvalApi.orders({ search: "  SM  ", page: "2" }, signal)).items,
  ).toEqual([]);
  expect(transport.get).toHaveBeenLastCalledWith("/approvals/orders", {
    params: { search: "SM", page: 2, limit: 25 },
    signal,
  });
  await approvalApi.issues({ state: "REAPPROVAL" }, signal);
  expect(transport.get).toHaveBeenLastCalledWith("/approvals/issues", {
    params: { search: undefined, state: "REAPPROVAL", page: 1, limit: 25 },
    signal,
  });
  transport.get.mockResolvedValue(
    p03Envelope({ events: [], pagination: p03Pagination }),
  );
  await approvalApi.history({}, signal);
  expect(transport.get).toHaveBeenLastCalledWith("/approvals/history", {
    params: { page: 1, limit: 25 },
    signal,
  });
  await approvalApi.orderHistory(p03Ids.order, {}, signal);
  expect(transport.get).toHaveBeenLastCalledWith(
    `/approvals/orders/${p03Ids.order}/history`,
    { params: { page: 1, limit: 25 }, signal },
  );
  transport.get.mockResolvedValue(
    p03Envelope({
      counts: {
        initialOrders: 0,
        approvalIssues: 0,
        salesContactPieces: 0,
        reapprovalPieces: 0,
        unresolvedIssues: 0,
        approvedToday: 0,
        returnedOrders: 0,
      },
      recentOrders: [],
    }),
  );
  expect((await approvalApi.dashboard(signal)).counts.approvedToday).toBe(0);
  transport.get.mockResolvedValue(p03Envelope(wrapper()));
  expect(await approvalApi.order(p03Ids.order, signal)).toEqual(wrapper());
});
it("binds each decision response to its exact original command/version/selected children", async () => {
  const body = { commandId: p03Ids.command, expectedVersion: 1 };
  transport.post.mockResolvedValue(p03Envelope(receipt()));
  expect(
    (await approvalApi.approve(p03Ids.order, body)).receipt.operation,
  ).toBe("APPROVE_INITIAL");
  expect(transport.post).toHaveBeenLastCalledWith(
    `/approvals/orders/${p03Ids.order}/approve`,
    body,
  );
  transport.post.mockResolvedValue(
    p03Envelope({
      ...receipt("RETURN_INITIAL"),
      outcome: { ...receipt().outcome, orderStatus: "RETURNED" },
    }),
  );
  await approvalApi.return(p03Ids.order, {
    ...body,
    reason: "Required text",
    notes: null,
  });
  transport.post.mockResolvedValue(p03Envelope(receipt("RESOLVE_ISSUE", true)));
  await approvalApi.resolve(p03Ids.order, p03Ids.piece, p03Ids.customer, {
    ...body,
    decision: "SEND_TO_SALES",
    target: "PRODUCTION",
    notes: "Ask owner",
  });
  const reviewed = receipt("REVIEW_CONTACT", true);
  transport.post.mockResolvedValue(
    p03Envelope({
      ...reviewed,
      outcome: {
        ...reviewed.outcome,
        pieceStage: "PRODUCTION",
        pieceWorkState: "INCOMING",
        issueState: "RESOLVED",
      },
    }),
  );
  await approvalApi.review(p03Ids.order, p03Ids.piece, p03Ids.customer, {
    ...body,
    proposalId: p03Ids.source,
    decision: "ACCEPT",
    notes: "Accepted instructions",
  });
  expect(transport.post).toHaveBeenLastCalledWith(
    `/approvals/orders/${p03Ids.order}/pieces/${p03Ids.piece}/issues/${p03Ids.customer}/review`,
    {
      ...body,
      proposalId: p03Ids.source,
      decision: "ACCEPT",
      notes: "Accepted instructions",
    },
  );
});
it("rejects malformed/foreign wrappers and changed command bindings with safe contract errors", async () => {
  const original = wrapper();
  transport.get.mockResolvedValue(
    p03Envelope({
      ...original,
      order: { ...original.order, id: p03Ids.customer },
    }),
  );
  await expect(approvalApi.order(p03Ids.order)).rejects.toThrow(
    ApiContractError,
  );
  transport.get.mockResolvedValue(
    p03Envelope({
      ...original,
      workflow: { ...original.workflow, privateCredential: "never exposed" },
    }),
  );
  await expect(approvalApi.order(p03Ids.order)).rejects.toThrow(
    ApiContractError,
  );
  for (const receiptChange of [
    { commandId: p03Ids.actor },
    { orderId: p03Ids.customer },
    { operation: "RETURN_INITIAL" },
    { beforeVersion: 2, afterVersion: 3 },
  ]) {
    const valid = receipt();
    transport.post.mockResolvedValue(
      p03Envelope({
        ...valid,
        receipt: { ...valid.receipt, ...receiptChange },
        outcome: {
          ...valid.outcome,
          ...("afterVersion" in receiptChange ? { orderVersion: 3 } : {}),
        },
      }),
    );
    await expect(
      approvalApi.approve(p03Ids.order, {
        commandId: p03Ids.command,
        expectedVersion: 1,
      }),
    ).rejects.toThrow(ApiContractError);
  }
  for (const change of [{ pieceId: p03Ids.actor }, { issueId: p03Ids.actor }]) {
    const valid = receipt("RESOLVE_ISSUE", true);
    transport.post.mockResolvedValue(
      p03Envelope({ ...valid, outcome: { ...valid.outcome, ...change } }),
    );
    await expect(
      approvalApi.resolve(p03Ids.order, p03Ids.piece, p03Ids.customer, {
        commandId: p03Ids.command,
        expectedVersion: 1,
        decision: "SEND_TO_SALES",
        target: "CUTTING",
        notes: "Safe",
      }),
    ).rejects.toThrow(ApiContractError);
  }
});
it("uses a dedicated typed event protocol and denies a mismatched event even when its schema is valid", async () => {
  const order = orderFixture(),
    actor = {
      id: p03Ids.actor,
      fullName: "Approver",
      role: "USER",
      department: "APPROVAL",
    },
    facts = {
      orderStatus: "AWAITING_APPROVAL",
      approvedAt: null,
      currentReturn: null,
      money: order.money,
      counts: order.counts,
      pieces: [
        {
          id: p03Ids.piece,
          stage: "AWAITING_APPROVAL",
          workState: "INCOMING",
          issueId: null,
          receivedAt: null,
          cancelledAt: null,
          cancellationReason: null,
        },
      ],
      issue: null,
      proposal: null,
    };
  const event = {
    event: {
      id: p03Ids.command,
      orderId: p03Ids.order,
      orderVersion: 2,
      businessNumber: order.businessNumber,
      operation: "RETURN_INITIAL",
      actor,
      occurredAt: p03Instant,
      pieceId: null,
      issueId: null,
      proposalId: null,
      decision: null,
      notes: "Return reason",
      changedFields: ["status"],
    },
    before: facts,
    after: {
      ...facts,
      orderStatus: "RETURNED",
      currentReturn: {
        decisionId: p03Ids.command,
        reason: "Return reason",
        notes: null,
        returnedAt: p03Instant,
      },
    },
  };
  transport.get.mockResolvedValue(p03Envelope(event));
  expect(
    (await approvalApi.event(p03Ids.order, p03Ids.command)).after.currentReturn
      ?.reason,
  ).toBe("Return reason");
  transport.get.mockResolvedValue(
    p03Envelope({ ...event, event: { ...event.event, id: p03Ids.actor } }),
  );
  await expect(approvalApi.event(p03Ids.order, p03Ids.command)).rejects.toThrow(
    ApiContractError,
  );
});
