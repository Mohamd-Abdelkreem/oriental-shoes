import {
  p08AdminSession,
  p08DetailFixture,
  p08ReportPrintFixture,
} from "@/test/p08-fixtures";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { administrationKeys } from "@/features/administration/hooks/administration.hooks";
import { AxiosError, AxiosHeaders } from "axios";
import {
  manufacturingKeys,
  manufacturingOrderOptions,
  useManufacturingDashboard,
} from "./manufacturing.hooks";
import {
  factoryWorkFixture,
  manufacturingDetailFixture,
  factoryReportFixture,
} from "../model/manufacturing.fixture";
import type * as ManufacturingTransport from "../api/manufacturing.api";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  approvalCommandDataSchema,
  manufacturingCommandDataSchema,
} from "@template/contracts";
import { readManufacturingOperationalScope } from "@/shared/query/operational-scope";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  ApiContractError,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { p03Ids, p03Instant, p03Session } from "@/test/p03-fixtures";
import {
  ManufacturingLocalCommandError,
  type ManufacturingCommandIntent,
} from "../model/manufacturing-command-state";
import {
  synchronizeManufacturingCommand,
  useManufacturingCommand,
} from "./manufacturing-commands.hooks";

import { apiClient } from "@/services/api/api-client";
import { p03Envelope } from "@/test/p03-fixtures";
import {
  readQualityOperationalScope,
  qualityScopeKey,
} from "@/shared/query/operational-scope";
import { useQualityDashboard, qualityKeys } from "./quality.hooks";

const transport = vi.hoisted(() => ({
  command: vi.fn(),
  observeWork: vi.fn(),
  reportIssue: vi.fn(),
  observeReport: vi.fn(),
  dashboard: vi.fn(),
  order: vi.fn(),
}));
vi.mock("../api/manufacturing.api", async (original) => ({
  ...(await original<typeof ManufacturingTransport>()),
  manufacturingApi: transport,
}));
const session = (overrides: Record<string, unknown>) =>
  authUserDataSchema.parse({ user: { ...p03Session().user, ...overrides } });
const serverFailure = (status: number, code: string) =>
  new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "Rejected safely",
      requestId: "safe-request",
      timestamp: p03Instant,
      path: "/api/v1/manufacturing-commands",
    },
  });
const client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const intent = (): ManufacturingCommandIntent => ({
  kind: "work",
  department: "CUTTING",
  body: {
    commandId: p03Ids.command,
    operation: "RECEIVE_AND_START",
    orders: [
      { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
      {
        orderId: p03Ids.customer,
        expectedVersion: 5,
        pieceIds: [p03Ids.source],
      },
    ],
  },
});
const saved = () =>
  manufacturingCommandDataSchema.parse({
    kind: "manufacturing-command",
    replayed: false,
    receipt: {
      commandId: p03Ids.command,
      operation: "RECEIVE_AND_START",
      department: "CUTTING",
      actor: {
        id: p03Ids.actor,
        fullName: "Actual admin",
        role: "ADMIN",
        department: null,
      },
      occurredAt: p03Instant,
    },
    outcome: {
      orders: [
        {
          orderId: p03Ids.order,
          eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          beforeVersion: 2,
          afterVersion: 3,
          pieces: [
            {
              pieceId: p03Ids.piece,
              visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              nextVisitId: null,
              stage: "CUTTING",
              workState: "IN_PROGRESS",
            },
          ],
        },
        {
          orderId: p03Ids.customer,
          eventId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          beforeVersion: 5,
          afterVersion: 6,
          pieces: [
            {
              pieceId: p03Ids.source,
              visitId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              nextVisitId: null,
              stage: "CUTTING",
              workState: "IN_PROGRESS",
            },
          ],
        },
      ],
    },
  });
const deferred = <T,>() => {
  let resolve!: (result: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    session({ role: "ADMIN", department: null, staffApprovedAt: null }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("reserves one slot synchronously across controls, protocols and ADMIN departments", async () => {
  const pending = deferred<ReturnType<typeof saved>>();
  transport.command.mockReturnValue(pending.promise);
  const a = renderHook(() => useManufacturingCommand("CUTTING"), { wrapper }),
    b = renderHook(() => useManufacturingCommand("PRODUCTION"), { wrapper });
  let first!: Promise<unknown>;
  act(() => {
    first = a.result.current.submit(intent());
  });
  await expect(
    b.result.current.submit({ ...intent(), department: "PRODUCTION" }),
  ).rejects.toThrow(ManufacturingLocalCommandError);
  await waitFor(() => {
    expect(b.result.current.state.phase).toBe("pending");
  });
  expect(transport.command).toHaveBeenCalledTimes(1);
  expect(transport.command).toHaveBeenCalledWith("CUTTING", intent().body);
  await act(async () => {
    pending.resolve(saved());
    await first;
  });
  await waitFor(() => {
    expect(a.result.current.state.phase).toBe("synchronized");
  });
  act(() => {
    a.result.current.acknowledge();
  });
  await waitFor(() => {
    expect(b.result.current.state.phase).toBe("idle");
  });
  a.unmount();
  b.unmount();
});
it.each(["network", "contract", "other-actor"] as const)(
  "retains immutable unknown intent after %s and observes original result",
  async (mode) => {
    if (mode === "other-actor")
      transport.command.mockResolvedValue({
        ...saved(),
        receipt: {
          ...saved().receipt,
          actor: { ...saved().receipt.actor, id: p03Ids.customer },
        },
      });
    else
      transport.command.mockRejectedValue(
        mode === "contract"
          ? new ApiContractError()
          : new Error("lost response"),
      );
    transport.observeWork.mockResolvedValue(saved());
    const view = renderHook(() => useManufacturingCommand("CUTTING"), {
      wrapper,
    });
    await act(async () => {
      await expect(view.result.current.submit(intent())).rejects.toThrow();
    });
    await waitFor(() => {
      expect(view.result.current.state).toMatchObject({
        phase: "unknown",
        intent: intent(),
      });
    });
    await act(async () => {
      await view.result.current.observe();
    });
    expect(transport.observeWork).toHaveBeenCalledWith(
      p03Ids.command,
      expect.any(AbortSignal),
    );
    await waitFor(() => {
      expect(view.result.current.state.phase).toBe("synchronized");
    });
    view.unmount();
  },
);
it("keeps a 404 observation inconclusive and replays only the frozen original request", async () => {
  transport.command.mockRejectedValueOnce(new Error("lost"));
  transport.observeWork.mockRejectedValue(
    serverFailure(404, "MANUFACTURING_COMMAND_NOT_FOUND"),
  );
  const view = renderHook(() => useManufacturingCommand("CUTTING"), {
    wrapper,
  });
  const original = intent();
  await act(async () => {
    await expect(view.result.current.submit(original)).rejects.toThrow();
  });
  await act(async () => {
    await expect(view.result.current.observe()).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("unknown");
  });
  transport.command.mockResolvedValue(saved());
  await act(async () => {
    await view.result.current.retrySame();
  });
  expect(transport.command.mock.calls[1]).toEqual(["CUTTING", original.body]);
  view.unmount();
});
it("does not publish an old authority result or restore a payload in a fresh QueryClient", async () => {
  const pending = deferred<ReturnType<typeof saved>>();
  transport.command.mockReturnValue(pending.promise);
  const view = renderHook(() => useManufacturingCommand("CUTTING"), {
    wrapper,
  });
  let operation!: Promise<unknown>;
  act(() => {
    operation = view.result.current.submit(intent());
  });
  act(() => {
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      session({
        role: "ADMIN",
        department: null,
        staffApprovedAt: null,
        accessVersion: 2,
      }),
    );
    view.rerender();
  });
  await act(async () => {
    pending.resolve(saved());
    await expect(operation).rejects.toThrow();
  });
  expect(view.result.current.state.phase).toBe("idle");
  view.unmount();
  client.clear();
  const reloaded = renderHook(() => useManufacturingCommand("CUTTING"), {
    wrapper,
  });
  expect(reloaded.result.current.state.phase).toBe("idle");
  expect(transport.command).toHaveBeenCalledTimes(1);
  reloaded.unmount();
});

it("keeps a committed result confirmed when an active read fails and synchronizes without resending", async () => {
  const zero = { orders: 0, pieces: 0 },
    dashboard = {
      department: "CUTTING",
      counts: {
        incoming: zero,
        inProgress: zero,
        returned: zero,
        completed: zero,
        repairs: zero,
      },
      recentOrders: [],
    };
  transport.dashboard.mockResolvedValue(dashboard);
  transport.command.mockResolvedValue(saved());
  const view = renderHook(
    () => ({
      command: useManufacturingCommand("CUTTING"),
      dashboard: useManufacturingDashboard("CUTTING"),
    }),
    { wrapper },
  );
  await waitFor(() => {
    expect(view.result.current.dashboard.data).toEqual(dashboard);
  });
  transport.dashboard.mockRejectedValue(new Error("read failed"));
  await act(async () => {
    await expect(
      view.result.current.command.submit(intent()),
    ).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.command.state.phase).toBe("confirmed");
  });
  expect(transport.command).toHaveBeenCalledTimes(1);
  transport.dashboard.mockResolvedValue(dashboard);
  await act(async () => {
    await view.result.current.command.synchronize();
  });
  await waitFor(() => {
    expect(view.result.current.command.state.phase).toBe("synchronized");
  });
  expect(transport.command).toHaveBeenCalledTimes(1);
  view.unmount();
});
it("observes an unknown P04 report with the original protocol rather than dispatching a replacement", async () => {
  transport.reportIssue.mockRejectedValue(new Error("lost report response"));
  transport.observeReport.mockResolvedValue(factoryReportFixture());
  const view = renderHook(() => useManufacturingCommand("CUTTING"), {
    wrapper,
  });
  const report = {
    kind: "report" as const,
    department: "CUTTING" as const,
    orderId: p03Ids.order,
    pieceId: p03Ids.piece,
    body: {
      commandId: p03Ids.command,
      expectedVersion: 2,
      reason: "عيب",
      notes: null,
    },
  };
  await act(async () => {
    await expect(view.result.current.submit(report)).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("unknown");
  });
  await act(async () => {
    await view.result.current.observe();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("synchronized");
  });
  expect(transport.observeReport).toHaveBeenCalledWith(
    p03Ids.command,
    expect.any(AbortSignal),
  );
  expect(transport.observeWork).not.toHaveBeenCalled();
  expect(transport.reportIssue).toHaveBeenCalledTimes(1);
  view.unmount();
});
it("does not let a stale acknowledgment erase a newer operation", async () => {
  transport.command.mockResolvedValue(saved());
  const view = renderHook(() => useManufacturingCommand("CUTTING"), {
    wrapper,
  });
  await act(async () => {
    await view.result.current.submit(intent());
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("synchronized");
  });
  const acknowledge = view.result.current.acknowledge;
  act(() => {
    acknowledge();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("idle");
  });
  const pending = deferred<ReturnType<typeof saved>>();
  transport.command.mockReturnValue(pending.promise);
  const next = intent();
  next.body.commandId = p03Ids.actor;
  let operation!: Promise<unknown>;
  act(() => {
    operation = view.result.current.submit(next);
  });
  expect(() => {
    acknowledge();
  }).toThrow(ManufacturingLocalCommandError);
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("pending");
  });
  await act(async () => {
    pending.resolve({
      ...saved(),
      receipt: { ...saved().receipt, commandId: p03Ids.actor },
    });
    await operation;
  });
  view.unmount();
});

it("releases a definitive whole-batch rejection without changing its caller selection or retrying", async () => {
  transport.command.mockRejectedValue(
    serverFailure(409, "MANUFACTURING_SELECTION_CONFLICT"),
  );
  const view = renderHook(() => useManufacturingCommand("CUTTING"), {
      wrapper,
    }),
    original = intent(),
    before = structuredClone(original);
  await act(async () => {
    await expect(view.result.current.submit(original)).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("idle");
  });
  expect(original).toEqual(before);
  expect(transport.command).toHaveBeenCalledTimes(1);
  view.unmount();
});

it("keeps a valid-shaped ADMIN report from another source department unknown", async () => {
  const wrong = factoryReportFixture();
  wrong.receipt.actor = {
    id: p03Ids.actor,
    fullName: "Actual admin",
    role: "ADMIN",
    department: null,
  };
  wrong.outcome.pieceStage = "PRODUCTION";
  transport.reportIssue.mockResolvedValue(
    approvalCommandDataSchema.parse(wrong),
  );
  const view = renderHook(() => useManufacturingCommand("CUTTING"), {
    wrapper,
  });
  const report: ManufacturingCommandIntent = {
    kind: "report",
    department: "CUTTING",
    orderId: p03Ids.order,
    pieceId: p03Ids.piece,
    body: {
      commandId: p03Ids.command,
      expectedVersion: 2,
      reason: "عيب",
      notes: null,
    },
  };
  await act(async () => {
    await expect(view.result.current.submit(report)).rejects.toThrow(
      ApiContractError,
    );
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("unknown");
  });
  expect(view.result.current.state).toMatchObject({ intent: report });
  view.unmount();
});

it("synchronizes an inactive detail cached by flat-row preparation without resending committed work", async () => {
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Current scope missing");
  transport.order
    .mockResolvedValueOnce(manufacturingDetailFixture(2))
    .mockResolvedValueOnce(manufacturingDetailFixture(3));
  await client.fetchQuery(
    manufacturingOrderOptions(client, scope, p03Ids.order),
  );
  expect(
    client
      .getQueryCache()
      .find({ queryKey: manufacturingKeys.order(scope, p03Ids.order) })
      ?.getObserversCount(),
  ).toBe(0);
  await synchronizeManufacturingCommand(client, scope, {
    kind: "work",
    data: factoryWorkFixture("CUTTING", "RECEIVE_AND_START"),
  });
  expect(
    client.getQueryData(manufacturingKeys.order(scope, p03Ids.order)),
  ).toEqual(manufacturingDetailFixture(3));
  expect(transport.command).not.toHaveBeenCalled();
});
const qualityDashboard = (pieces: number) => ({
  department: "QUALITY",
  counts: {
    incoming: { orders: pieces ? 1 : 0, pieces },
    inspection: { orders: 0, pieces: 0 },
    accepted: { orders: 0, pieces: 0 },
    corrections: { orders: 0, pieces: 0 },
  },
  recentOrders: [],
});
it("refreshes an ADMIN Quality read after a real P05 result while retaining private command resources", async () => {
  const quality = readQualityOperationalScope(client),
    scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!quality || !scope) throw new Error("Admin scopes required");
  client.setQueryData(qualityKeys.dashboard(quality), qualityDashboard(1));
  const slot = [...qualityScopeKey(quality), "command-session"],
    receipt = [...qualityScopeKey(quality), "command-receipt", p03Ids.command];
  client.setQueryData(slot, "private slot sentinel");
  client.setQueryData(receipt, "private receipt sentinel");
  const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue(p03Envelope(qualityDashboard(7))),
    view = renderHook(() => useQualityDashboard(), { wrapper });
  try {
    await act(async () => {
      await synchronizeManufacturingCommand(client, scope, {
        kind: "work",
        data: saved(),
      });
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
it("excludes denied Quality scopes from P05 synchronization", async () => {
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    session({
      role: "USER",
      department: "CUTTING",
      staffApprovedAt: p03Instant,
    }),
  );
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Cutting scope required");
  const key = [
    "p06",
    scope.actorId,
    scope.accessVersion,
    scope.epoch,
    "dashboard",
  ];
  client.setQueryData(key, "unpermitted cache sentinel");
  const get = vi.spyOn(apiClient, "get");
  const data = saved();
  data.receipt.actor = {
    id: p03Ids.actor,
    fullName: "Actual cutting worker",
    role: "USER",
    department: "CUTTING",
  };
  try {
    await synchronizeManufacturingCommand(client, scope, {
      kind: "work",
      data,
    });
    expect(get).not.toHaveBeenCalled();
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {
    get.mockRestore();
  }
});
it("does not complete an old P05 synchronization when authority changes during a Quality refresh", async () => {
  const quality = readQualityOperationalScope(client),
    scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!quality || !scope) throw new Error("Admin scopes required");
  client.setQueryData(qualityKeys.dashboard(quality), qualityDashboard(1));
  const gate = deferred<unknown>(),
    get = vi
      .spyOn(apiClient, "get")
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue(p03Envelope(qualityDashboard(9))),
    view = renderHook(() => useQualityDashboard(), { wrapper });
  const pending = synchronizeManufacturingCommand(client, scope, {
    kind: "work",
    data: saved(),
  }).then(
    () => "success",
    () => "obsolete",
  );
  try {
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });
    act(() => {
      client.setQueryData(
        AUTH_SESSION_QUERY_KEY,
        session({
          role: "ADMIN",
          department: null,
          staffApprovedAt: null,
          accessVersion: 2,
        }),
      );
    });
    gate.resolve(p03Envelope(qualityDashboard(99)));
    expect(await pending).toBe("obsolete");
    await waitFor(() => {
      expect(view.result.current.data?.counts.incoming.pieces).toBe(9);
    });
    expect(client.getQueryData(qualityKeys.dashboard(quality))).toBeUndefined();
  } finally {
    gate.resolve(p03Envelope(qualityDashboard(99)));
    await pending;
    view.unmount();
    get.mockRestore();
  }
});

it("marks current ADMIN P08 detail and complete print stale after manufacturing synchronization", async () => {
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  const admin = readAdministrationOperationalScope(client),
    scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!admin || !scope) throw new Error("Expected current permitted scopes");
  const key = administrationKeys.order(admin, p03Ids.order),
    printKey = administrationKeys.reportPrint(
      admin,
      p08ReportPrintFixture().meta.filters,
    );
  client.setQueryData(key, p08DetailFixture());
  client.setQueryData(printKey, p08ReportPrintFixture());
  await synchronizeManufacturingCommand(client, scope, {
    kind: "work",
    data: factoryWorkFixture("CUTTING", "RECEIVE_AND_START"),
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(printKey)?.isInvalidated).toBe(true);
  expect(transport.command).not.toHaveBeenCalled();
});
