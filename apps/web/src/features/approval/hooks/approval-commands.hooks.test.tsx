import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  approvalCommandDataSchema,
  approvalOrderDataSchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  ApiContractError,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import {
  p04ScopeKey,
  readP04OperationalScope,
} from "@/shared/query/operational-scope";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Session,
} from "@/test/p03-fixtures";
import {
  ApprovalLocalCommandError,
  ApprovalSynchronizationError,
  type ApprovalCommandIntent,
} from "../model/approval-command-state";
import {
  useApprovalCommand,
  useApprovalCommandReceipt,
  synchronizeApprovalCommand,
} from "./approval-commands.hooks";

import { apiClient } from "@/services/api/api-client";
import { p03Envelope } from "@/test/p03-fixtures";
import {
  readQualityOperationalScope,
  qualityScopeKey,
} from "@/shared/query/operational-scope";
import {
  useQualityDashboard,
  qualityKeys,
} from "@/features/manufacturing/hooks/quality.hooks";

const transport = vi.hoisted(() => ({
  approve: vi.fn(),
  submit: vi.fn(),
  receipt: vi.fn(),
  approvalOrder: vi.fn(),
  contactOrder: vi.fn(),
}));
vi.mock("../api/approval.api", () => ({
  approvalApi: { approve: transport.approve, order: transport.approvalOrder },
}));
vi.mock("../api/approval-commands.api", () => ({
  approvalCommandsApi: { get: transport.receipt },
}));
vi.mock("@/features/sales/api/sales-contact.api", () => ({
  salesContactApi: { submit: transport.submit, order: transport.contactOrder },
}));
const client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const command = (): ApprovalCommandIntent => ({
  operation: "APPROVE_INITIAL",
  orderId: p03Ids.order,
  body: { commandId: p03Ids.command, expectedVersion: 1 },
});
const contact = (): ApprovalCommandIntent => ({
  operation: "SUBMIT_CONTACT",
  orderId: p03Ids.order,
  pieceId: p03Ids.piece,
  issueId: p03Ids.source,
  body: {
    commandId: p03Ids.command,
    expectedVersion: 1,
    kind: "AMEND",
    changes: {},
    contactNotes: "Customer confirmed the retained specifications",
  },
});
const result = (input = command()) =>
  approvalCommandDataSchema.parse({
    kind: "approval-command",
    replayed: false,
    receipt: {
      commandId: input.body.commandId,
      operation: input.operation,
      orderId: input.orderId,
      actor: {
        id: p03Ids.actor,
        role: "ADMIN",
        department: null,
        fullName: "Administrator",
      },
      beforeVersion: 1,
      afterVersion: 2,
      occurredAt: p03Instant,
    },
    outcome: {
      orderId: input.orderId,
      orderVersion: 2,
      orderStatus: "APPROVED",
      pieceId: input.operation === "SUBMIT_CONTACT" ? p03Ids.piece : null,
      pieceStage: input.operation === "SUBMIT_CONTACT" ? "CUTTING" : null,
      pieceWorkState: input.operation === "SUBMIT_CONTACT" ? "BLOCKED" : null,
      issueId: input.operation === "SUBMIT_CONTACT" ? p03Ids.source : null,
      issueState: input.operation === "SUBMIT_CONTACT" ? "REAPPROVAL" : null,
      proposalId: input.operation === "SUBMIT_CONTACT" ? p03Ids.customer : null,
    },
  });
const detail = (version = 2) =>
  approvalOrderDataSchema.parse({
    order: orderFixture(version),
    workflow: {
      initialApproval: null,
      currentReturn: null,
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: { allowed: false, reason: "NOT_APPROVED" },
      issues: [],
    },
  });
const mount = () =>
  renderHook(
    () => ({
      approval: useApprovalCommand(p03Ids.order, "APPROVAL"),
      contact: useApprovalCommand(p03Ids.order, "SALES_CONTACT"),
    }),
    { wrapper },
  );
const origin = () => {
  const current = readP04OperationalScope(client, "SALES_CONTACT");
  if (!current) throw new Error("Missing test scope");
  return current;
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: {
      ...p03Session().user,
      role: "ADMIN",
      department: null,
      staffApprovedAt: null,
    },
  });
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  transport.approvalOrder.mockResolvedValue(detail(3));
  transport.contactOrder.mockResolvedValue(detail(4));
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("reserves one shared slot before await, rejects wrong capability and synchronizes a higher current wrapper", async () => {
  const view = mount();
  let finish: (value: ReturnType<typeof result>) => void = () => {
    throw new Error("Missing dispatch");
  };
  transport.approve.mockReturnValue(
    new Promise((done) => {
      finish = done;
    }),
  );
  await expect(
    view.result.current.contact.submit(command()),
  ).rejects.toMatchObject({ code: "MISMATCH" });
  let first: Promise<unknown>;
  await act(async () => {
    first = view.result.current.approval.submit(command());
    await expect(
      view.result.current.contact.submit(contact()),
    ).rejects.toMatchObject({ code: "BUSY" });
  });
  expect(transport.approve).toHaveBeenCalledTimes(1);
  expect(transport.submit).not.toHaveBeenCalled();
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("pending");
  });
  await act(async () => {
    finish(result());
    await first;
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("synchronized");
  });
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("synchronized");
  });
  expect(transport.approvalOrder).toHaveBeenCalled();
  await expect(
    view.result.current.contact.submit(contact()),
  ).rejects.toBeInstanceOf(ApprovalLocalCommandError);
  act(() => {
    view.result.current.contact.acknowledge();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
    expect(view.result.current.contact.state.phase).toBe("idle");
  });
});
it("recovers a lost contact response after dialog unmount from approval view using the original receipt and wrapper", async () => {
  const initial = mount(),
    input = contact(),
    saved = result(input),
    captured = origin();
  transport.submit.mockRejectedValue(new Error("Response lost after commit"));
  await act(async () => {
    await expect(
      initial.result.current.contact.submit(input),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(initial.result.current.approval.state).toMatchObject({
      phase: "unknown",
      originScope: { capability: "SALES_CONTACT" },
      command: input,
    });
  });
  initial.unmount();
  const recovery = renderHook(
    () => useApprovalCommand(p03Ids.order, "APPROVAL"),
    { wrapper },
  );
  transport.receipt.mockResolvedValue(saved);
  await act(async () => {
    await recovery.result.current.observe();
  });
  await waitFor(() => {
    expect(recovery.result.current.state).toMatchObject({
      phase: "synchronized",
      originScope: { capability: "SALES_CONTACT" },
      command: input,
    });
  });
  expect(transport.receipt).toHaveBeenCalledWith(
    input.body.commandId,
    expect.any(AbortSignal),
  );
  expect(
    client.getQueryData([
      ...p04ScopeKey(captured),
      "command-receipt",
      input.body.commandId,
    ]),
  ).toEqual(saved);
  expect(transport.contactOrder).toHaveBeenCalled();
  expect(transport.approvalOrder).not.toHaveBeenCalled();
  expect(transport.submit).toHaveBeenCalledTimes(1);
});
it("keeps missing observation inconclusive and retries the identical frozen intent once across two views", async () => {
  const view = mount(),
    input = contact();
  transport.submit.mockRejectedValue(new Error("Lost"));
  await act(async () => {
    await expect(view.result.current.contact.submit(input)).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("unknown");
  });
  transport.receipt.mockRejectedValue(new Error("Not found"));
  await act(async () => {
    await expect(view.result.current.approval.observe()).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("unknown");
  });
  transport.submit.mockResolvedValue({ ...result(input), replayed: true });
  await act(async () => {
    const first = view.result.current.approval.retrySame();
    await expect(
      view.result.current.contact.retrySame(),
    ).rejects.toBeInstanceOf(ApprovalLocalCommandError);
    await first;
  });
  expect(transport.submit.mock.calls).toEqual([
    [input.orderId, p03Ids.piece, p03Ids.source, input.body],
    [input.orderId, p03Ids.piece, p03Ids.source, input.body],
  ]);
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("synchronized");
  });
});
it("retains confirmed metadata on failed refresh and offers synchronization without another write", async () => {
  const view = mount();
  transport.approve.mockResolvedValue(result());
  transport.approvalOrder.mockRejectedValue(new Error("Refresh unavailable"));
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toBeInstanceOf(ApprovalSynchronizationError);
  });
  await waitFor(() => {
    expect(view.result.current.contact.state).toMatchObject({
      phase: "confirmed",
      result: result(),
    });
  });
  await expect(view.result.current.contact.retrySame()).rejects.toBeInstanceOf(
    ApprovalLocalCommandError,
  );
  transport.approvalOrder.mockResolvedValue(detail(4));
  await act(async () => {
    await view.result.current.contact.synchronize();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("synchronized");
  });
  expect(transport.approve).toHaveBeenCalledTimes(1);
});
it("preserves a replacement inserted during acknowledgement reset and notifies both views on definitive failure", async () => {
  const view = mount();
  transport.approve.mockRejectedValue(
    new ApprovalLocalCommandError("MISMATCH"),
  );
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
    expect(view.result.current.contact.state.phase).toBe("idle");
  });
  transport.approve.mockResolvedValue(result());
  await act(async () => {
    await view.result.current.approval.submit(command());
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("synchronized");
  });
  const entry = view.result.current.approval.state;
  if (entry.phase !== "synchronized")
    throw new Error("Missing synchronized session");
  const key = [
    ...p04ScopeKey(entry.originScope),
    "command-session",
    p03Ids.order,
  ];
  const replacement = {
    ...entry,
    phase: "unknown",
    command: {
      ...command(),
      body: { commandId: p03Ids.customer, expectedVersion: 1 },
    },
    failure: {
      message: "Other operation",
      code: "NETWORK_ERROR",
      statusCode: 0,
      requestId: "",
      fieldErrors: {},
    },
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (
      event.type === "updated" &&
      event.query.queryHash === JSON.stringify(key) &&
      event.query.state.data === undefined
    )
      client.setQueryData(key, replacement);
  });
  act(() => {
    view.result.current.contact.acknowledge();
  });
  unsubscribe();
  expect(client.getQueryData(key)).toEqual(replacement);
  await waitFor(() => {
    expect(view.result.current.approval.state).toMatchObject({
      phase: "unknown",
      command: { body: { commandId: p03Ids.customer } },
    });
  });
  expect(transport.approve).toHaveBeenCalledTimes(2);
});
it("suppresses late old-account completions and hides recovery on origin access loss", async () => {
  const view = mount();
  let finish: (value: ReturnType<typeof result>) => void = () => {
    throw new Error("Missing dispatch");
  };
  transport.approve.mockReturnValue(
    new Promise((done) => {
      finish = done;
    }),
  );
  let pending: Promise<unknown>;
  act(() => {
    pending = view.result.current.approval
      .submit(command())
      .catch((error: unknown) => error);
  });
  await act(async () => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("new", epoch, p03Ids.customer);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session(p03Ids.customer));
    finish(result());
    await pending;
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
  });
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("idle");
  });
  expect(transport.approvalOrder).not.toHaveBeenCalled();
});
it("rejects stale or mismatched receipt observation without publishing confirmed state", async () => {
  const view = mount();
  transport.approve.mockRejectedValue(new ApiContractError());
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("unknown");
  });
  transport.receipt.mockResolvedValue({
    ...result(),
    receipt: {
      ...result().receipt,
      actor: { ...result().receipt.actor, id: p03Ids.customer },
    },
  });
  await act(async () => {
    await expect(view.result.current.approval.observe()).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("unknown");
  });
  expect(transport.approvalOrder).not.toHaveBeenCalled();
});
it("fails closed on two occupied capability entries and malformed recovery without transport", () => {
  const current = origin(),
    input = command();
  client.setQueryData(
    [
      ...p04ScopeKey({ ...current, capability: "APPROVAL" }),
      "command-session",
      p03Ids.order,
    ],
    {
      phase: "pending",
      originScope: { ...current, capability: "APPROVAL" },
      command: input,
    },
  );
  client.setQueryData(
    [...p04ScopeKey(current), "command-session", p03Ids.order],
    { phase: "pending", originScope: current, command: contact() },
  );
  expect(() => mount()).toThrow(ApprovalLocalCommandError);
  expect(transport.submit).not.toHaveBeenCalled();
  expect(transport.approve).not.toHaveBeenCalled();
});
it("blocks manual receipt transport when the original scope is obsolete or ID is absent", async () => {
  const current = { ...origin(), capability: "SALES_CONTACT" as const };
  const view = renderHook(() => useApprovalCommandReceipt(null, current), {
    wrapper,
  });
  await expect(
    view.result.current.refetch({ throwOnError: true }),
  ).rejects.toBeInstanceOf(ApprovalLocalCommandError);
  expect(transport.receipt).not.toHaveBeenCalled();
});
it("keeps an already uncertain intent after a later definitive conflict", async () => {
  const view = mount();
  transport.approve.mockRejectedValue(new Error("Lost response"));
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("unknown");
  });
  transport.approve.mockRejectedValue(
    new ApprovalLocalCommandError("MISMATCH"),
  );
  await act(async () => {
    await expect(view.result.current.contact.retrySame()).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state).toMatchObject({
      phase: "unknown",
      command: command(),
    });
  });
  await expect(
    view.result.current.approval.submit(command()),
  ).rejects.toMatchObject({ code: "BUSY" });
  expect(transport.approve).toHaveBeenCalledTimes(2);
});
it("invalidates existing paper before a failed fresh wrapper without clearing unrelated caches", async () => {
  const view = mount(),
    current = origin();
  const paper = [
    ...p04ScopeKey({ ...current, capability: "OFFICIAL_PAPER" }),
    "official-paper",
    p03Ids.order,
  ];
  client.setQueryData(paper, { privatePaper: true });
  client.setQueryData(["unrelated"], { retained: true });
  transport.approve.mockResolvedValue(result());
  transport.approvalOrder.mockResolvedValue(detail(1));
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toBeInstanceOf(ApprovalSynchronizationError);
  });
  expect(client.getQueryState(paper)?.isInvalidated).toBe(true);
  expect(client.getQueryData(["unrelated"])).toEqual({ retained: true });
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("confirmed");
  });
  expect(transport.approve).toHaveBeenCalledTimes(1);
});
it("hides a retained approval session when the same actor loses approval capability", async () => {
  const view = mount();
  transport.approve.mockRejectedValue(new Error("Lost"));
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.contact.state.phase).toBe("unknown");
  });
  act(() => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
    expect(view.result.current.contact.state.phase).toBe("idle");
  });
  expect(transport.receipt).not.toHaveBeenCalled();
});
it("suppresses a late receipt after accessVersion changes without a replacement write", async () => {
  const view = mount();
  transport.approve.mockRejectedValue(new Error("Lost"));
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("unknown");
  });
  let finish: (value: ReturnType<typeof result>) => void = () => {
    throw new Error("Missing observation");
  };
  transport.receipt.mockReturnValue(
    new Promise((done) => {
      finish = done;
    }),
  );
  let observing: Promise<unknown>;
  act(() => {
    observing = view.result.current.approval
      .observe()
      .catch((error: unknown) => error);
  });
  await waitFor(() => {
    expect(transport.receipt).toHaveBeenCalledTimes(1);
  });
  await act(async () => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: {
        ...p03Session().user,
        role: "ADMIN",
        department: null,
        staffApprovedAt: null,
        accessVersion: 2,
      },
    });
    finish(result());
    await observing;
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
  });
  expect(transport.approvalOrder).not.toHaveBeenCalled();
  expect(transport.approve).toHaveBeenCalledTimes(1);
});

it("keeps a confirmed receipt when an overlapping same-command retry fails late", async () => {
  const view = mount();
  transport.approve.mockRejectedValueOnce(new Error("Lost response"));
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("unknown");
  });
  const recovery = view.result.current.approval;
  let resolveReceipt!: (value: ReturnType<typeof result>) => void;
  let rejectRetry!: (reason: Error) => void;
  transport.receipt.mockReturnValue(
    new Promise((done) => {
      resolveReceipt = done;
    }),
  );
  transport.approve.mockReturnValue(
    new Promise((_done, reject) => {
      rejectRetry = reject;
    }),
  );
  let observation!: Promise<void>, retry!: Promise<void>;
  act(() => {
    observation = recovery.observe();
    retry = recovery.retrySame();
  });
  await waitFor(() => {
    expect(transport.approve).toHaveBeenCalledTimes(2);
  });
  await act(async () => {
    resolveReceipt(result());
    await observation;
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("synchronized");
  });
  await act(async () => {
    rejectRetry(new Error("Retry response lost"));
    await retry;
  });
  expect(view.result.current.approval.state).toMatchObject({
    phase: "synchronized",
    result: result(),
  });
  expect(transport.approve).toHaveBeenCalledTimes(2);
});
it("binds stale acknowledgement, retry and synchronization controls to their original command", async () => {
  const view = mount();
  transport.approve.mockRejectedValueOnce(new Error("Lost response"));
  await act(async () => {
    await expect(
      view.result.current.approval.submit(command()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("unknown");
  });
  const stale = view.result.current.approval;
  transport.receipt.mockResolvedValue(result());
  await act(async () => {
    await stale.observe();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("synchronized");
  });
  const staleAck = view.result.current.approval.acknowledge;
  act(() => {
    view.result.current.contact.acknowledge();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
  });
  const replacement = {
    ...command(),
    body: { ...command().body, commandId: p03Ids.customer },
  } as ApprovalCommandIntent;
  transport.approve.mockResolvedValue(result(replacement));
  await act(async () => {
    await view.result.current.approval.submit(replacement);
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("synchronized");
  });
  expect(staleAck).toThrow(ApprovalLocalCommandError);
  await expect(stale.retrySame()).rejects.toMatchObject({ code: "MISMATCH" });
  await expect(stale.synchronize()).rejects.toMatchObject({ code: "MISMATCH" });
  expect(view.result.current.approval.state).toMatchObject({
    phase: "synchronized",
    command: replacement,
  });
  expect(transport.approve).toHaveBeenCalledTimes(2);
  act(() => {
    view.result.current.approval.acknowledge();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
  });
});
it("allows the submitting control to acknowledge its own command after synchronization", async () => {
  const view = mount(),
    control = view.result.current.approval;
  transport.approve.mockResolvedValue(result());
  await act(async () => {
    await control.submit(command());
    control.acknowledge();
  });
  await waitFor(() => {
    expect(view.result.current.approval.state.phase).toBe("idle");
  });
  await expect(control.submit(command())).rejects.toMatchObject({
    code: "MISMATCH",
  });
  expect(transport.approve).toHaveBeenCalledTimes(1);
});

it("does not downgrade a synchronized command when an overlapping synchronization fails late", async () => {
  const view = mount();
  transport.approve.mockResolvedValue(result());
  let rejectFirst!: (reason: Error) => void;
  const invalidation = vi
    .spyOn(client, "invalidateQueries")
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
  try {
    let submission!: Promise<ReturnType<typeof result>>;
    act(() => {
      submission = view.result.current.approval.submit(command());
    });
    await waitFor(() => {
      expect(view.result.current.approval.state.phase).toBe("confirmed");
    });
    await act(async () => {
      await view.result.current.approval.synchronize();
    });
    await waitFor(() => {
      expect(view.result.current.approval.state.phase).toBe("synchronized");
    });
    await act(async () => {
      rejectFirst(new Error("Old refresh failed"));
      await submission;
    });
    expect(view.result.current.approval.state).toMatchObject({
      phase: "synchronized",
      result: result(),
    });
    expect(transport.approve).toHaveBeenCalledTimes(1);
  } finally {
    invalidation.mockRestore();
  }
});
it("refreshes permitted ADMIN Quality reads after a P04 result without touching its intent or receipt", async () => {
  const quality = readQualityOperationalScope(client),
    scope = readP04OperationalScope(client, "APPROVAL");
  if (!quality || !scope) throw new Error("Admin scopes required");
  const dashboard = (pieces: number) => ({
    department: "QUALITY",
    counts: {
      incoming: { orders: 1, pieces },
      inspection: { orders: 0, pieces: 0 },
      accepted: { orders: 0, pieces: 0 },
      corrections: { orders: 0, pieces: 0 },
    },
    recentOrders: [],
  });
  client.setQueryData(qualityKeys.dashboard(quality), dashboard(1));
  const slot = [...qualityScopeKey(quality), "command-session"],
    receipt = [...qualityScopeKey(quality), "command-receipt", p03Ids.command];
  client.setQueryData(slot, "private slot sentinel");
  client.setQueryData(receipt, "private receipt sentinel");
  const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue(p03Envelope(dashboard(7))),
    view = renderHook(() => useQualityDashboard(), { wrapper });
  try {
    await act(async () => {
      await synchronizeApprovalCommand(
        client,
        { ...scope, capability: "APPROVAL" },
        result(),
      );
    });
    await waitFor(() => {
      expect(view.result.current.data?.counts.incoming.pieces).toBe(7);
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(slot)).toBe("private slot sentinel");
    expect(client.getQueryState(slot)?.isInvalidated).toBe(false);
    expect(client.getQueryData(receipt)).toBe("private receipt sentinel");
    expect(client.getQueryState(receipt)?.isInvalidated).toBe(false);
  } finally {
    view.unmount();
    get.mockRestore();
  }
});
