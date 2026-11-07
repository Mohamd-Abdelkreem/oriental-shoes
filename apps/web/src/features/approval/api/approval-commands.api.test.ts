import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { p03Ids, p03Instant, p03Envelope } from "@/test/p03-fixtures";
import { approvalCommandsApi } from "./approval-commands.api";

const transport = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => {
  vi.resetAllMocks();
});
const result = {
  kind: "approval-command",
  replayed: true,
  receipt: {
    commandId: p03Ids.command,
    operation: "APPROVE_INITIAL",
    orderId: p03Ids.order,
    actor: {
      id: p03Ids.actor,
      fullName: "Approver",
      role: "ADMIN",
      department: null,
    },
    beforeVersion: 1,
    afterVersion: 2,
    occurredAt: p03Instant,
  },
  outcome: {
    orderId: p03Ids.order,
    orderVersion: 2,
    orderStatus: "APPROVED",
    pieceId: null,
    pieceStage: null,
    pieceWorkState: null,
    issueId: null,
    issueState: null,
    proposalId: null,
  },
};
it("observes metadata using the exact command and signal and rejects foreign or snapshot-bearing responses", async () => {
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(result));
  expect(await approvalCommandsApi.get(p03Ids.command, signal)).toEqual(result);
  expect(transport.get).toHaveBeenCalledWith(
    `/approval-commands/${p03Ids.command}`,
    { signal },
  );
  transport.get.mockResolvedValue(
    p03Envelope({
      ...result,
      receipt: { ...result.receipt, commandId: p03Ids.order },
    }),
  );
  await expect(approvalCommandsApi.get(p03Ids.command)).rejects.toThrow(
    ApiContractError,
  );
  transport.get.mockResolvedValue(
    p03Envelope({ ...result, savedOrder: { privateNote: "hidden" } }),
  );
  await expect(approvalCommandsApi.get(p03Ids.command)).rejects.toThrow(
    ApiContractError,
  );
});
