import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Envelope,
  p03Pagination,
} from "@/test/p03-fixtures";
import { salesContactApi } from "./sales-contact.api";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => {
  vi.resetAllMocks();
});
const wrapper = {
  order: orderFixture(),
  workflow: {
    initialApproval: null,
    currentReturn: null,
    allowedActions: { canApproveInitial: false, canReturnInitial: false },
    printEligibility: { allowed: false, reason: "NOT_APPROVED" },
    issues: [],
  },
};
const result = {
  kind: "approval-command",
  replayed: false,
  receipt: {
    commandId: p03Ids.command,
    operation: "SUBMIT_CONTACT",
    orderId: p03Ids.order,
    actor: {
      id: p03Ids.actor,
      fullName: "Actual owner",
      role: "USER",
      department: "SALES",
    },
    beforeVersion: 4,
    afterVersion: 5,
    occurredAt: p03Instant,
  },
  outcome: {
    orderId: p03Ids.order,
    orderVersion: 5,
    orderStatus: "APPROVED",
    pieceId: p03Ids.piece,
    pieceStage: "CUTTING",
    pieceWorkState: "BLOCKED",
    issueId: p03Ids.customer,
    issueState: "REAPPROVAL",
    proposalId: p03Ids.source,
  },
};
it("reads exact contact context and sends only the parsed proposal/request to its selected issue", async () => {
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(
    p03Envelope({ items: [], pagination: p03Pagination }),
  );
  expect(
    (
      await salesContactApi.list(
        { search: "  SM ", state: "REAPPROVAL" },
        signal,
      )
    ).items,
  ).toEqual([]);
  expect(transport.get).toHaveBeenLastCalledWith("/sales-contact", {
    params: { page: 1, limit: 25, search: "SM", state: "REAPPROVAL" },
    signal,
  });
  transport.get.mockResolvedValue(p03Envelope(wrapper));
  expect((await salesContactApi.order(p03Ids.order, signal)).order.id).toBe(
    p03Ids.order,
  );
  transport.post.mockResolvedValue(p03Envelope(result));
  for (const kind of ["AMEND", "CANCEL_REQUEST"] as const) {
    const body =
      kind === "AMEND"
        ? {
            kind,
            commandId: p03Ids.command,
            expectedVersion: 4,
            contactNotes: "Customer confirmation",
            changes: { sole: null },
          }
        : {
            kind,
            commandId: p03Ids.command,
            expectedVersion: 4,
            contactNotes: "Customer requests cancellation",
          };
    expect(
      await salesContactApi.submit(
        p03Ids.order,
        p03Ids.piece,
        p03Ids.customer,
        body,
      ),
    ).toEqual(result);
    expect(transport.post).toHaveBeenLastCalledWith(
      `/sales-contact/orders/${p03Ids.order}/pieces/${p03Ids.piece}/issues/${p03Ids.customer}/proposals`,
      body,
    );
  }
});
it("rejects foreign, malformed and misbound responses without private snapshot fallback", async () => {
  transport.get.mockResolvedValue(
    p03Envelope({ ...wrapper, order: { ...wrapper.order, id: p03Ids.actor } }),
  );
  await expect(salesContactApi.order(p03Ids.order)).rejects.toThrow(
    ApiContractError,
  );
  for (const change of [
    { pieceId: p03Ids.actor },
    { issueId: p03Ids.actor },
    { proposalId: null },
  ]) {
    transport.post.mockResolvedValue(
      p03Envelope({ ...result, outcome: { ...result.outcome, ...change } }),
    );
    await expect(
      salesContactApi.submit(p03Ids.order, p03Ids.piece, p03Ids.customer, {
        kind: "AMEND",
        commandId: p03Ids.command,
        expectedVersion: 4,
        contactNotes: "Confirmation",
        changes: {},
      }),
    ).rejects.toThrow(ApiContractError);
  }
  const failure = new Error("Catalog unavailable");
  transport.post.mockRejectedValue(failure);
  await expect(
    salesContactApi.submit(p03Ids.order, p03Ids.piece, p03Ids.customer, {
      kind: "CANCEL_REQUEST",
      commandId: p03Ids.command,
      expectedVersion: 4,
      contactNotes: "Request",
    }),
  ).rejects.toBe(failure);
});
