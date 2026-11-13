import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  authUserDataSchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  qualityOrderDataSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  readQualityOperationalScope,
  qualityScopeKey,
} from "@/shared/query/operational-scope";
import {
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import {
  QualityLocalCommandError,
  QualitySynchronizationError,
} from "../model/quality-command-state";
import { qualityKeys } from "./quality.hooks";
import { useQualityCommand } from "./quality-commands.hooks";

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
const client = createQueryClient(),
  wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  );
const body = () =>
  qualityCommandBodySchema.parse({
    commandId: p03Ids.command,
    operation: "RECEIVE_AND_START",
    orders: [
      { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
    ],
  });
const saved = () =>
  qualityCommandDataSchema.parse({
    kind: "quality-command",
    replayed: false,
    receipt: {
      commandId: p03Ids.command,
      operation: "RECEIVE_AND_START",
      actor: {
        id: p03Ids.actor,
        fullName: "Actual worker",
        role: "USER",
        department: "QUALITY",
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
          packingGroupId: null,
          pieces: [
            {
              pieceId: p03Ids.piece,
              visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              decision: null,
              stage: "QUALITY",
              workState: "IN_PROGRESS",
              correctionId: null,
              issueId: null,
            },
          ],
        },
      ],
    },
  });
const detail = (version: number) => {
  const source = manufacturingDetailFixture(version),
    paper = {
      ...source.paper,
      order: {
        ...source.paper.order,
        pieces: source.paper.order.pieces.map((piece) => ({
          ...piece,
          stage: "QUALITY",
        })),
      },
    };
  return qualityOrderDataSchema.parse({
    department: "QUALITY",
    paper,
    packingGroups: [],
    work: paper.order.pieces.map((piece) => ({
      pieceId: piece.id,
      visit: null,
      lastAction: null,
      currentCorrection: null,
      latestInspection: null,
      allowedActions: {
        canReceiveAndStart: true,
        canContinue: false,
        canInspect: false,
        canReportIssue: true,
      },
    })),
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
      path: "/quality/commands",
    },
  };
  return error;
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "QUALITY" },
    }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("shares one slot between initiators, protects receipts and notifies both mounted observers on acknowledgement", async () => {
  transport.post.mockResolvedValue(p03Envelope(saved()));
  const a = renderHook(() => useQualityCommand(), { wrapper }),
    b = renderHook(() => useQualityCommand(), { wrapper });
  const scope = readQualityOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  const receiptKey = [...qualityScopeKey(scope), "command-receipt", "retained"];
  client.setQueryData(receiptKey, "Original private receipt");
  await act(async () => {
    await a.result.current.submit(body());
  });
  await waitFor(() => {
    expect(b.result.current.state.phase).toBe("synchronized");
  });
  await expect(
    b.result.current.submit({ ...body(), commandId: p03Ids.actor }),
  ).rejects.toBeInstanceOf(QualityLocalCommandError);
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
  const view = renderHook(() => useQualityCommand(), { wrapper }),
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
  transport.get.mockRejectedValue(failure(404, "QUALITY_COMMAND_NOT_FOUND"));
  await act(async () => {
    await expect(view.result.current.observe()).rejects.toThrow();
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
    qualityCommandBodySchema.parse(transport.post.mock.calls[1]?.[1]),
  ).toEqual(body());
  expect(transport.post).toHaveBeenCalledTimes(2);
  view.unmount();
});
it.each([
  [413, "PAYLOAD_TOO_LARGE"],
  [409, "ORDER_VERSION_CONFLICT"],
] as const)(
  "returns a known %s rejection to idle without inventing unknown work",
  async (status, code) => {
    transport.post.mockRejectedValue(failure(status, code));
    const view = renderHook(() => useQualityCommand(), { wrapper });
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
  const scope = readQualityOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  client.setQueryData(qualityKeys.order(scope, p03Ids.order), detail(2));
  transport.post.mockResolvedValue(p03Envelope(saved()));
  transport.get.mockResolvedValue(p03Envelope(detail(2)));
  const view = renderHook(() => useQualityCommand(), { wrapper });
  await act(async () => {
    await expect(view.result.current.submit(body())).rejects.toBeInstanceOf(
      QualitySynchronizationError,
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
  expect(client.getQueryData(qualityKeys.order(scope, p03Ids.order))).toEqual(
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
  const origin = renderHook(() => useQualityCommand(), { wrapper }),
    stale = origin.result.current;
  let completion: Promise<unknown> = Promise.resolve();
  act(() => {
    completion = stale.submit(body());
  });
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  origin.unmount();
  const destination = renderHook(() => useQualityCommand(), { wrapper });
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
  }).toThrow(QualityLocalCommandError);
  expect(destination.result.current.state.phase).toBe("synchronized");
  act(() => {
    destination.result.current.acknowledge();
  });
  await waitFor(() => {
    expect(destination.result.current.state.phase).toBe("idle");
  });
  destination.unmount();
});

it("submits one two-piece report with the exact +N result and treats malformed success as uncertain", async () => {
  const input = qualityCommandBodySchema.parse({
    commandId: p03Ids.command,
    operation: "REPORT_ISSUES",
    reason: "Common actual reason",
    orders: [
      {
        orderId: p03Ids.order,
        expectedVersion: 2,
        pieceIds: [p03Ids.piece, p03Ids.actor],
      },
    ],
  });
  const response = saved();
  response.receipt.operation = "REPORT_ISSUES";
  const group = response.outcome.orders[0];
  if (!group) throw new Error("Group required");
  group.afterVersion = 4;
  group.pieces = [p03Ids.piece, p03Ids.actor].map((pieceId, index) => ({
    pieceId,
    visitId: null,
    decision: null,
    stage: "QUALITY",
    workState: "BLOCKED",
    correctionId: null,
    issueId:
      index === 0
        ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        : "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  }));
  transport.post.mockResolvedValue(p03Envelope(response));
  const view = renderHook(() => useQualityCommand(), { wrapper });
  await act(async () => {
    await view.result.current.submit(input);
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("synchronized");
  });
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(
    "/quality/commands",
    input,
  );
  act(() => {
    view.result.current.acknowledge();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("idle");
  });
  transport.post.mockResolvedValue(
    p03Envelope({
      ...response,
      receipt: {
        ...response.receipt,
        actor: { ...response.receipt.actor, id: p03Ids.order },
      },
    }),
  );
  await act(async () => {
    await expect(view.result.current.submit(input)).rejects.toThrow();
  });
  await waitFor(() => {
    expect(view.result.current.state.phase).toBe("unknown");
  });
  view.unmount();
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
  const view = renderHook(() => useQualityCommand(), { wrapper }),
    scope = readQualityOperationalScope(client);
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
            department: "QUALITY",
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
        client.getQueryData([...qualityScopeKey(scope), "command-session"]),
      ).toBeUndefined();
    });
  } finally {
    release(p03Envelope(saved()));
    await pending;
    view.unmount();
  }
});
