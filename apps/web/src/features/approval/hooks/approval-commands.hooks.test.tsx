import { p08DetailFixture, p08ReportPrintFixture } from "@/test/p08-fixtures";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { administrationKeys } from "@/features/administration/hooks/administration.hooks";
import { warehouseOrderDataSchema } from "@template/contracts";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  readWarehouseOperationalScope,
  warehouseScopeKey,
} from "@/shared/query/operational-scope";
import {
  useWarehouseDashboard,
  useWarehouseOrder,
  warehouseKeys,
} from "@/features/warehouse/hooks/warehouse.hooks";
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
  resolve: vi.fn(),
  contactOrder: vi.fn(),
}));
vi.mock("../api/approval.api", () => ({
  approvalApi: {
    approve: transport.approve,
    order: transport.approvalOrder,
    resolve: transport.resolve,
  },
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

const cancelledCompanion = "30000000-0000-4000-8000-000000000002";
const warehouseCancellationDetail = (cancelled: boolean) => {
  const base = manufacturingDetailFixture().paper.order,
    first = base.pieces[0];
  if (!first) throw new Error("Piece required");
  const counts = {
      original: 2,
      cancelled: cancelled ? 1 : 0,
      active: cancelled ? 1 : 2,
      received: 1,
      completionPercent: cancelled ? 100 : 50,
    },
    version = cancelled ? 3 : 1,
    status = cancelled ? "READY_FOR_DELIVERY" : "APPROVED";
  const pieces = [
      {
        ...first,
        stage: "WAREHOUSE",
        workState: "COMPLETED",
        receivedAt: p03Instant,
      },
      {
        ...first,
        id: cancelledCompanion,
        position: 2,
        stage: cancelled ? "CANCELLED" : "PRODUCTION",
        workState: cancelled ? "BLOCKED" : "IN_PROGRESS",
        receivedAt: null,
        cancelledAt: cancelled ? p03Instant : null,
        cancellationReason: cancelled ? "Original approved cancellation" : null,
      },
    ],
    ids = pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .map((piece) => piece.id);
  return warehouseOrderDataSchema.parse({
    summary: {
      id: base.id,
      version,
      type: base.type,
      status,
      businessNumber: base.businessNumber,
      customerName: base.customerName,
      deliveryDate: base.deliveryDate,
      counts,
      matchingPieceIds: ids,
      matchingPieceCount: ids.length,
      lastActionAt: p03Instant,
      allowedActions: {
        canDispatch: cancelled,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: false,
      },
      currentAttemptId: null,
      retryDate: null,
    },
    paper: { order: { ...base, version, status, counts, pieces }, issues: [] },
    deliveryContact: {
      name: base.customerName,
      phone: "+966500000001",
      address: null,
    },
    work: pieces.map((piece, index) => ({
      pieceId: piece.id,
      acceptedHandoff: null,
      receiptGroupId: null,
      receivedAt: piece.receivedAt,
      legacyReceipt: index === 0,
      allowedActions: { canReceive: false },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  });
};
it.each([false, true])(
  "last missing cancellation refreshes ADMIN warehouse readiness (read fails=%s)",
  async (fails) => {
    const scope = readWarehouseOperationalScope(client);
    if (!scope) throw new Error("Warehouse scope required");
    const before = warehouseCancellationDetail(false),
      after = warehouseCancellationDetail(true),
      dashboard = (ready: boolean) => ({
        counts: {
          incoming: { orders: 0, pieces: 0 },
          incomplete: { orders: ready ? 0 : 1, pieces: ready ? 0 : 2 },
          ready: { orders: ready ? 1 : 0, pieces: ready ? 1 : 0 },
          outForDelivery: { orders: 0, pieces: 0 },
          deliveryFailed: { orders: 0, pieces: 0 },
          delivered: { orders: 0, pieces: 0 },
        },
      });
    const detailKey = warehouseKeys.order(scope, p03Ids.order),
      dashboardKey = warehouseKeys.dashboard(scope, { search: undefined }),
      readyKey = warehouseKeys.orders(scope, {
        search: undefined,
        view: "READY",
        page: 1,
        limit: 10,
      }),
      slot = [...warehouseScopeKey(scope), "command-session"],
      receipt = [
        ...warehouseScopeKey(scope),
        "command-receipt",
        p03Ids.command,
      ];
    client.setQueryData(detailKey, before);
    client.setQueryData(dashboardKey, dashboard(false));
    client.setQueryData(readyKey, {
      department: "WAREHOUSE",
      view: "READY",
      orders: [],
      counts: { orders: 0, pieces: 0 },
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    client.setQueryData(slot, "Retained warehouse intent");
    client.setQueryData(receipt, "Retained warehouse receipt");
    const original = detail(3),
      first = original.order.pieces[0];
    if (!first) throw new Error("Financial source member required");
    transport.approvalOrder.mockResolvedValue(
      approvalOrderDataSchema.parse({
        ...original,
        order: {
          ...original.order,
          status: "READY_FOR_DELIVERY",
          counts: after.summary.counts,
          pieces: [
            {
              ...first,
              stage: "WAREHOUSE",
              workState: "COMPLETED",
              receivedAt: p03Instant,
            },
            {
              ...first,
              id: cancelledCompanion,
              position: 2,
              stage: "CANCELLED",
              workState: "BLOCKED",
              receivedAt: null,
              cancelledAt: p03Instant,
              cancellationReason: "Original approved cancellation",
            },
          ],
        },
      }),
    );
    const originalResult = result(),
      saved = approvalCommandDataSchema.parse({
        ...originalResult,
        receipt: { ...originalResult.receipt, operation: "RESOLVE_ISSUE" },
        outcome: {
          ...originalResult.outcome,
          orderStatus: "READY_FOR_DELIVERY",
          pieceId: cancelledCompanion,
          pieceStage: "CANCELLED",
          pieceWorkState: "BLOCKED",
          issueId: p03Ids.source,
          issueState: "RESOLVED",
        },
      });
    transport.resolve.mockResolvedValue(saved);
    let failing = fails;
    const get = vi.spyOn(apiClient, "get").mockImplementation((path) => {
      if (failing) return Promise.reject(new ApiContractError());
      return Promise.resolve(
        p03Envelope(path === "/warehouse/dashboard" ? dashboard(true) : after),
      );
    });
    const reads = renderHook(
        () => ({
          dashboard: useWarehouseDashboard({}),
          detail: useWarehouseOrder(p03Ids.order),
        }),
        { wrapper },
      ),
      view = mount();
    const intent: ApprovalCommandIntent = {
      operation: "RESOLVE_ISSUE",
      orderId: p03Ids.order,
      pieceId: cancelledCompanion,
      issueId: p03Ids.source,
      body: {
        commandId: p03Ids.command,
        expectedVersion: 1,
        decision: "CANCEL",
        reason: "Original approved cancellation",
        confirmed: true,
      },
    };
    try {
      if (fails) {
        await act(async () => {
          await expect(
            view.result.current.approval.submit(intent),
          ).rejects.toBeInstanceOf(ApprovalSynchronizationError);
        });
        await waitFor(() => {
          expect(view.result.current.approval.state.phase).toBe("confirmed");
        });
        failing = false;
        await act(async () => {
          await view.result.current.approval.synchronize();
        });
      } else
        await act(async () => {
          await view.result.current.approval.submit(intent);
        });
      await waitFor(() => {
        expect(reads.result.current.dashboard.data?.counts.ready.orders).toBe(
          1,
        );
        expect(
          reads.result.current.detail.data?.summary.allowedActions.canDispatch,
        ).toBe(true);
      });
      expect(reads.result.current.detail.data?.summary.counts).toEqual({
        original: 2,
        cancelled: 1,
        active: 1,
        received: 1,
        completionPercent: 100,
      });
      expect(client.getQueryState(readyKey)?.isInvalidated).toBe(true);
      expect(client.getQueryData(slot)).toBe("Retained warehouse intent");
      expect(client.getQueryState(receipt)?.isInvalidated).toBe(false);
      expect(transport.resolve).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      reads.unmount();
      get.mockRestore();
    }
  },
);

const roundedReceiptOrder = (version: number, completionPercent: number) => {
  const base = orderFixture(version),
    first = base.pieces[0];
  if (!first) throw new Error("Member required");
  return {
    ...base,
    status: "APPROVED" as const,
    counts: {
      original: 200,
      cancelled: 0,
      active: 200,
      received: 199,
      completionPercent,
    },
    money: {
      total: "360000.00",
      paidAmount: "450.50",
      remainingDue: "359549.50",
      surplus: "0.00",
    },
    pieces: Array.from({ length: 200 }, (_, index) => ({
      ...first,
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      position: index + 1,
      stage: index === 199 ? ("QUALITY" as const) : ("WAREHOUSE" as const),
      workState: "COMPLETED" as const,
      receivedAt: index === 199 ? null : p03Instant,
    })),
  };
};

it("synchronizes current 199/200 detail at 99 without publishing earlier approval outcome as current", async () => {
  const scope = readP04OperationalScope(client, "APPROVAL");
  if (!scope) throw new Error("Scope required");
  const current = approvalOrderDataSchema.parse({
      ...detail(3),
      order: roundedReceiptOrder(3, 99),
    }),
    saved = result();
  transport.approvalOrder.mockResolvedValue(current);
  await synchronizeApprovalCommand(
    client,
    { ...scope, capability: "APPROVAL" },
    saved,
  );
  expect(
    client.getQueryData([...p04ScopeKey(scope), "order", p03Ids.order]),
  ).toEqual(current);
  expect(saved.receipt.afterVersion).toBe(2);
  expect(current.order.counts.completionPercent).toBe(99);
  expect(transport.approve).not.toHaveBeenCalled();
});

it("marks current ADMIN P08 detail and print stale after approval synchronization", async () => {
  const admin = readAdministrationOperationalScope(client),
    scope = readP04OperationalScope(client, "APPROVAL");
  if (!admin || !scope) throw new Error("Expected permitted scopes");
  const key = administrationKeys.order(admin, p03Ids.order),
    printKey = administrationKeys.reportPrint(
      admin,
      p08ReportPrintFixture().meta.filters,
    );
  client.setQueryData(key, p08DetailFixture());
  client.setQueryData(printKey, p08ReportPrintFixture());
  await synchronizeApprovalCommand(
    client,
    { ...scope, capability: "APPROVAL" },
    result(),
  );
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(printKey)?.isInvalidated).toBe(true);
});
