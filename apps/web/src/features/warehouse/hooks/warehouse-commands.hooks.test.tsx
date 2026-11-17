import {
  p08AdminSession,
  p08DetailFixture,
  p08ReportPrintFixture,
} from "@/test/p08-fixtures";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { administrationKeys } from "@/features/administration/hooks/administration.hooks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  authUserDataSchema,
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  warehouseOrderDataSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { manufacturingKeys } from "@/features/manufacturing/hooks/manufacturing.hooks";
import { qualityKeys } from "@/features/manufacturing/hooks/quality.hooks";
import { orderKeys } from "@/features/sales/hooks/orders.hooks";
import { approvalKeys } from "@/features/approval/hooks/approval.hooks";
import { orderPaperKeys } from "@/features/printing/hooks/order-paper.hooks";
import {
  readWarehouseOperationalScope,
  warehouseScopeKey,
} from "@/shared/query/operational-scope";
import {
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  WarehouseLocalCommandError,
  WarehouseSynchronizationError,
} from "../model/warehouse-command-state";
import { warehouseKeys } from "./warehouse.hooks";
import { useWarehouseCommand } from "./warehouse-commands.hooks";

const transport = vi.hoisted(() => ({
  get: vi.fn<
    (
      path: string,
      options?: { signal?: AbortSignal; params?: unknown },
    ) => Promise<unknown>
  >(),
  post: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </StrictMode>
);
const body = () =>
  warehouseCommandBodySchema.parse({
    commandId: p03Ids.command,
    operation: "RECEIVE",
    orders: [
      { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
    ],
  });
const saved = () =>
  warehouseCommandDataSchema.parse({
    kind: "warehouse-command",
    replayed: false,
    receipt: {
      commandId: p03Ids.command,
      operation: "RECEIVE",
      actor: {
        id: p03Ids.actor,
        fullName: "Warehouse colleague",
        role: "USER",
        department: "WAREHOUSE",
      },
      occurredAt: p03Instant,
    },
    outcome: {
      orders: [
        {
          eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          orderId: p03Ids.order,
          beforeVersion: 2,
          afterVersion: 3,
          status: "READY_FOR_DELIVERY",
          pieceIds: [p03Ids.piece],
          receiptGroupId: p03Ids.source,
          attemptId: null,
          retryId: null,
        },
      ],
    },
  });
const detail = (version: number) => {
  const original = manufacturingDetailFixture(version).paper.order,
    counts = {
      ...original.counts,
      received: original.counts.active,
      completionPercent: 100,
    },
    order = {
      ...original,
      status: "READY_FOR_DELIVERY",
      counts,
      pieces: original.pieces.map((piece) => ({
        ...piece,
        stage: "WAREHOUSE",
        workState: "COMPLETED",
        receivedAt: p03Instant,
      })),
    };
  return warehouseOrderDataSchema.parse({
    summary: {
      id: order.id,
      version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts,
      matchingPieceIds: order.pieces.map((piece) => piece.id),
      matchingPieceCount: order.pieces.length,
      lastActionAt: null,
      allowedActions: {
        canDispatch: true,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: false,
      },
      currentAttemptId: null,
      retryDate: null,
    },
    paper: { order, issues: [] },
    deliveryContact: {
      name: order.customerName,
      phone: "+966500000001",
      address: null,
    },
    work: order.pieces.map((piece) => ({
      pieceId: piece.id,
      acceptedHandoff: null,
      receiptGroupId: null,
      receivedAt: p03Instant,
      legacyReceipt: true,
      allowedActions: { canReceive: false },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  });
};
const failure = (status: number, code: string) => {
  const error = new AxiosError("Owned safe HTTP failure");
  error.response = {
    status,
    statusText: "Failure",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "Owned safe failure",
      requestId: "owned",
      timestamp: p03Instant,
      path: "/warehouse/commands",
    },
  };
  return error;
};
beforeEach(() => {
  client = createQueryClient();
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "WAREHOUSE" },
    }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it.each([false, true])(
  "invalidates only currently permitted upstream read scopes for ADMIN=%s",
  async (admin) => {
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      authUserDataSchema.parse({
        user: {
          ...p03Session().user,
          role: admin ? "ADMIN" : "USER",
          department: admin ? null : "WAREHOUSE",
          staffApprovedAt: admin ? null : p03Session().user.staffApprovedAt,
        },
      }),
    );
    const scope = readWarehouseOperationalScope(client);
    if (!scope) throw new Error("Scope required");
    const keys = [
      manufacturingKeys.order(
        { ...scope, department: "CUTTING" },
        p03Ids.order,
      ),
      qualityKeys.order({ ...scope, department: "QUALITY" }, p03Ids.order),
      orderKeys.tracking(scope, p03Ids.order),
      approvalKeys.order({ ...scope, capability: "APPROVAL" }, p03Ids.order),
      orderPaperKeys.order(
        { ...scope, capability: "OFFICIAL_PAPER" },
        p03Ids.order,
      ),
    ];
    for (const key of keys)
      client.setQueryData(key, { retained: "read value" });
    transport.post.mockResolvedValue(p03Envelope(saved()));
    const view = renderHook(() => useWarehouseCommand(), { wrapper });
    try {
      await act(async () => {
        await view.result.current.submit(body());
      });
      await waitFor(() => {
        expect(view.result.current.state.phase).toBe("synchronized");
      });
      for (const key of keys)
        expect(client.getQueryState(key)?.isInvalidated).toBe(admin);
      expect(transport.get).not.toHaveBeenCalled();
      expect(transport.post).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
    }
  },
);
it("admits only one pending original intent from simultaneous controllers", async () => {
  let release: (response: ReturnType<typeof p03Envelope>) => void = () => {};
  const gate = new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
    release = resolve;
  });
  transport.post.mockImplementation(() => gate);
  const a = renderHook(() => useWarehouseCommand(), { wrapper }),
    b = renderHook(() => useWarehouseCommand(), { wrapper });
  let pending: Promise<unknown> = Promise.resolve();
  try {
    act(() => {
      pending = a.result.current.submit(body());
    });
    await expect(
      b.result.current.submit({ ...body(), commandId: p03Ids.source }),
    ).rejects.toBeInstanceOf(WarehouseLocalCommandError);
    await waitFor(() => {
      expect(transport.post).toHaveBeenCalledTimes(1);
    });
    expect(transport.post.mock.calls[0]?.[1]).toEqual(body());
    await act(async () => {
      release(p03Envelope(saved()));
      await pending;
    });
    await waitFor(() => {
      expect(b.result.current.state.phase).toBe("synchronized");
    });
  } finally {
    release(p03Envelope(saved()));
    await Promise.allSettled([pending]);
    a.unmount();
    b.unmount();
  }
});
it("checks the original scope again after asynchronous mutation admission before any transport call", async () => {
  const cache = client.getMutationCache(),
    previous = cache.config.onMutate;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  cache.config.onMutate = () => gate;
  const view = renderHook(() => useWarehouseCommand(), { wrapper });
  let pending: Promise<unknown> = Promise.resolve();
  try {
    act(() => {
      pending = view.result.current.submit(body()).then(
        () => "sent",
        () => "rejected",
      );
    });
    await waitFor(() => {
      expect(view.result.current.state.phase).toBe("pending");
    });
    act(() => {
      const epoch = beginAuthSessionEpoch("credential-login");
      acceptCredentialLogin("replacement synthetic", epoch, p03Ids.source);
      client.setQueryData(
        AUTH_SESSION_QUERY_KEY,
        authUserDataSchema.parse({
          user: {
            ...p03Session().user,
            id: p03Ids.source,
            department: "WAREHOUSE",
          },
        }),
      );
      view.rerender();
    });
    await act(async () => {
      release();
      await pending;
    });
    expect(await pending).toBe("rejected");
    expect(transport.post).not.toHaveBeenCalled();
    expect(view.result.current.state.phase).toBe("idle");
  } finally {
    release();
    await Promise.allSettled([pending]);
    if (previous === undefined) delete cache.config.onMutate;
    else cache.config.onMutate = previous;
    view.unmount();
  }
});
it("observes a committed original result once across competing recovery controllers without another POST", async () => {
  transport.post.mockRejectedValue(new Error("Synthetic response loss"));
  const a = renderHook(() => useWarehouseCommand(), { wrapper }),
    b = renderHook(() => useWarehouseCommand(), { wrapper });
  let release: (response: ReturnType<typeof p03Envelope>) => void = () => {};
  let pending: Promise<unknown> = Promise.resolve();
  const gate = new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
    release = resolve;
  });
  try {
    await act(async () => {
      await expect(a.result.current.submit(body())).rejects.toThrow();
    });
    await waitFor(() => {
      expect(b.result.current.state.phase).toBe("unknown");
    });
    transport.get.mockImplementation(() => gate);
    act(() => {
      pending = a.result.current.observe();
    });
    await waitFor(() => {
      expect(transport.get).toHaveBeenCalledTimes(1);
    });
    await expect(b.result.current.observe()).rejects.toBeInstanceOf(
      WarehouseLocalCommandError,
    );
    await act(async () => {
      release(p03Envelope(saved()));
      await pending;
    });
    await waitFor(() => {
      expect(b.result.current.state.phase).toBe("synchronized");
    });
    expect(transport.post).toHaveBeenCalledTimes(1);
    expect(transport.get).toHaveBeenCalledTimes(1);
  } finally {
    release(p03Envelope(saved()));
    await Promise.allSettled([pending]);
    a.unmount();
    b.unmount();
  }
});
it("shares one slot between initiators, protects receipts and notifies both mounted observers on acknowledgement", async () => {
  transport.post.mockResolvedValue(p03Envelope(saved()));
  const a = renderHook(() => useWarehouseCommand(), { wrapper }),
    b = renderHook(() => useWarehouseCommand(), { wrapper });
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  const receiptKey = [
    ...warehouseScopeKey(scope),
    "command-receipt",
    "retained",
  ];
  client.setQueryData(receiptKey, "Original private receipt");
  await act(async () => {
    await a.result.current.submit(body());
  });
  await waitFor(() => {
    expect(b.result.current.state.phase).toBe("synchronized");
  });
  await expect(
    b.result.current.submit({ ...body(), commandId: p03Ids.actor }),
  ).rejects.toBeInstanceOf(WarehouseLocalCommandError);
  expect(transport.post).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(receiptKey)).toBe("Original private receipt");
  expect(client.getQueryState(receiptKey)?.isInvalidated).toBe(false);
  act(() => {
    b.result.current.acknowledge();
  });
  await waitFor(() => {
    expect(a.result.current.state.phase).toBe("idle");
    expect(b.result.current.state.phase).toBe("idle");
  });
  a.unmount();
  b.unmount();
});
it("keeps an unknown frozen intent after observation 404 and retries only the original immutable body", async () => {
  transport.post.mockRejectedValueOnce(new Error("Owned network failure"));
  const view = renderHook(() => useWarehouseCommand(), { wrapper }),
    input = body();
  await act(async () => {
    await expect(view.result.current.submit(input)).rejects.toThrow(
      "Owned network failure",
    );
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("unknown");
  });
  const first = input.orders[0];
  if (!first) throw new Error("Original group required");
  first.expectedVersion = 99;
  transport.get.mockRejectedValue(failure(404, "WAREHOUSE_COMMAND_NOT_FOUND"));
  await act(async () => {
    await expect(view.result.current.observe()).rejects.toThrow();
  });
  expect(view.result.current.state.phase).toBe("unknown");
  transport.post.mockRejectedValueOnce(failure(413, "PAYLOAD_TOO_LARGE"));
  await act(async () => {
    await expect(view.result.current.retrySame()).rejects.toThrow();
  });
  expect(view.result.current.state.phase).toBe("unknown");
  transport.post.mockResolvedValue(p03Envelope(saved()));
  await act(async () => {
    await view.result.current.retrySame();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("synchronized");
  });
  expect(
    warehouseCommandBodySchema.parse(transport.post.mock.calls[1]?.[1]),
  ).toEqual(body());
  expect(
    warehouseCommandBodySchema.parse(transport.post.mock.calls[2]?.[1]),
  ).toEqual(body());
  expect(transport.post).toHaveBeenCalledTimes(3);
  view.unmount();
});
it.each([
  [413, "PAYLOAD_TOO_LARGE"],
  [409, "ORDER_VERSION_CONFLICT"],
] as const)(
  "returns a known %s rejection to idle without inventing unknown work",
  async (status, code) => {
    transport.post.mockRejectedValue(failure(status, code));
    const view = renderHook(() => useWarehouseCommand(), { wrapper });
    await act(async () => {
      await expect(view.result.current.submit(body())).rejects.toThrow();
    });
    await waitFor(() => {
      expect(view.result.current.state.phase).toBe("idle");
    });
    expect(transport.post).toHaveBeenCalledTimes(1);
    view.unmount();
  },
);
it("retains saved confirmation when an inactive detail cannot reach the version floor and refreshes without another POST", async () => {
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  client.setQueryData(warehouseKeys.order(scope, p03Ids.order), detail(2));
  transport.post.mockResolvedValue(p03Envelope(saved()));
  transport.get.mockResolvedValue(p03Envelope(detail(2)));
  const view = renderHook(() => useWarehouseCommand(), { wrapper });
  await act(async () => {
    await expect(view.result.current.submit(body())).rejects.toBeInstanceOf(
      WarehouseSynchronizationError,
    );
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("confirmed");
  });
  transport.get.mockResolvedValue(p03Envelope(detail(4)));
  await act(async () => {
    await view.result.current.synchronize();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("synchronized");
  });
  expect(client.getQueryData(warehouseKeys.order(scope, p03Ids.order))).toEqual(
    detail(4),
  );
  expect(transport.post).toHaveBeenCalledTimes(1);
  view.unmount();
});
it("finishes an in-flight save for the destination after navigation without allowing the unmounted initiator to acknowledge it", async () => {
  let release: (value: ReturnType<typeof p03Envelope>) => void = () => {
    throw new Error("Owned gate unavailable");
  };
  transport.post.mockImplementation(
    () =>
      new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
        release = resolve;
      }),
  );
  const origin = renderHook(() => useWarehouseCommand(), { wrapper }),
    stale = origin.result.current;
  let completion: Promise<unknown> = Promise.resolve();
  act(() => {
    completion = stale.submit(body());
  });
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  origin.unmount();
  const destination = renderHook(() => useWarehouseCommand(), { wrapper });
  expect(destination.result.current.state.phase).toBe("pending");
  await act(async () => {
    release(p03Envelope(saved()));
    await completion;
  });
  await waitFor(() => {
    expect(destination.result.current.state.phase).toBe("synchronized");
  });
  expect(() => {
    stale.acknowledge();
  }).toThrow(WarehouseLocalCommandError);
  expect(destination.result.current.state.phase).toBe("synchronized");
  act(() => {
    destination.result.current.acknowledge();
  });
  await waitFor(() => {
    expect(destination.result.current.state.phase).toBe("idle");
  });
  destination.unmount();
});

it("keeps a malformed nominal success uncertain rather than publishing another actor's outcome", async () => {
  const result = saved();
  transport.post.mockResolvedValue(
    p03Envelope({
      ...result,
      receipt: {
        ...result.receipt,
        actor: { ...result.receipt.actor, id: p03Ids.order },
      },
    }),
  );
  const view = renderHook(() => useWarehouseCommand(), { wrapper });
  try {
    await act(async () => {
      await expect(view.result.current.submit(body())).rejects.toThrow();
    });
    await waitFor(() => {
      expect(view.result.current.state.phase).toBe("unknown");
    });
    expect(transport.post).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
  }
});
it("does not publish a late result into a replacement account scope", async () => {
  let release: (value: ReturnType<typeof p03Envelope>) => void = () =>
    undefined;
  transport.post.mockImplementation(
    () =>
      new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
        release = resolve;
      }),
  );
  const view = renderHook(() => useWarehouseCommand(), { wrapper }),
    scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  let pending: Promise<unknown> = Promise.resolve();
  act(() => {
    pending = view.result.current.submit(body()).then(
      (result) => ({ kind: "success", result }),
      (error: unknown) => ({ kind: "failure", error }),
    );
  });
  try {
    await waitFor(() => {
      expect(transport.post).toHaveBeenCalledTimes(1);
    });
    act(() => {
      client.setQueryData(
        AUTH_SESSION_QUERY_KEY,
        authUserDataSchema.parse({
          user: {
            ...p03Session().user,
            department: "WAREHOUSE",
            accessVersion: 2,
          },
        }),
      );
      view.rerender();
    });
    await act(async () => {
      release(p03Envelope(saved()));
      await pending;
    });
    expect(await pending).toMatchObject({ kind: "failure" });
    await waitFor(() => {
      expect(view.result.current.state.phase).toBe("idle");
      expect(
        client.getQueryData([...warehouseScopeKey(scope), "command-session"]),
      ).toBeUndefined();
    });
  } finally {
    release(p03Envelope(saved()));
    await pending;
    view.unmount();
  }
});

it("reconciles current ADMIN P08 detail/report print after a confirmed warehouse command", async () => {
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  const admin = readAdministrationOperationalScope(client);
  if (!admin) throw new Error("Expected administration scope");
  const key = administrationKeys.order(admin, p03Ids.order),
    printKey = administrationKeys.reportPrint(
      admin,
      p08ReportPrintFixture().meta.filters,
    );
  client.setQueryData(key, p08DetailFixture());
  client.setQueryData(printKey, p08ReportPrintFixture());
  const response = saved();
  response.receipt.actor.role = "ADMIN";
  response.receipt.actor.department = null;
  transport.post.mockResolvedValue(p03Envelope(response));
  const hook = renderHook(useWarehouseCommand, { wrapper });
  await act(async () => {
    await hook.result.current.submit(body());
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(printKey)?.isInvalidated).toBe(true);
  expect(transport.post).toHaveBeenCalledTimes(1);
  expect(
    transport.get.mock.calls.some(([path]) =>
      path.includes("/administration/"),
    ),
  ).toBe(false);
});
