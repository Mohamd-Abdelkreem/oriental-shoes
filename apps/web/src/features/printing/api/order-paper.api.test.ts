import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Envelope,
} from "@/test/p03-fixtures";
import { orderPaperApi } from "./order-paper.api";

const transport = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => {
  vi.resetAllMocks();
});
const paper = () => {
  const order = orderFixture(2);
  return {
    order: {
      ...order,
      status: "APPROVED",
      approval: { ...order.approval, approvedAt: p03Instant },
      pieces: order.pieces.map((piece) => ({ ...piece, stage: "CUTTING" })),
    },
    approval: {
      initial: {
        decisionId: p03Ids.command,
        orderVersion: 2,
        actor: {
          id: p03Ids.actor,
          fullName: "Actual approval actor",
          role: "USER",
          department: "APPROVAL",
        },
        approvedAt: p03Instant,
      },
      pieces: [],
    },
    printVersion: 2,
  };
};
it("fetches only the official endpoint with actual approval metadata and the supplied signal", async () => {
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(paper()));
  expect(await orderPaperApi.get(p03Ids.order, signal)).toEqual(paper());
  expect(transport.get).toHaveBeenCalledWith(`/order-paper/${p03Ids.order}`, {
    signal,
  });
});
it.each(["order", "version", "stamp"] as const)(
  "rejects a wrong %s instead of substituting sales/local paper",
  async (kind) => {
    const valid = paper(),
      malformed =
        kind === "order"
          ? { ...valid, order: { ...valid.order, id: p03Ids.customer } }
          : kind === "version"
            ? { ...valid, printVersion: 3 }
            : { ...valid, approval: { ...valid.approval, initial: null } };
    transport.get.mockResolvedValue(p03Envelope(malformed));
    await expect(orderPaperApi.get(p03Ids.order)).rejects.toThrow(
      ApiContractError,
    );
  },
);
it.each([
  "ORDER_PRINT_NOT_APPROVED",
  "ORDER_PRINT_RETURNED",
  "ORDER_PRINT_REAPPROVAL_PENDING",
])("propagates %s without returning a retained document", async (code) => {
  const failure = Object.assign(new Error("Official print denied"), { code });
  transport.get.mockRejectedValue(failure);
  await expect(orderPaperApi.get(p03Ids.order)).rejects.toBe(failure);
});
