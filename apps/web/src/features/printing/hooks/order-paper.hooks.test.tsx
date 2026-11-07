import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { officialOrderPaperDataSchema } from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readP04OperationalScope } from "@/shared/query/operational-scope";
import {
  orderFixture,
  p03Ids,
  p03Session,
  p03Instant,
} from "@/test/p03-fixtures";
import {
  orderPaperKeys,
  officialOrderPaperOptions,
  useOfficialOrderPaper,
} from "./order-paper.hooks";

const transport = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/order-paper.api", () => ({ orderPaperApi: transport }));
const client = createQueryClient(),
  wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
const paper = () => {
  const order = orderFixture(2);
  return officialOrderPaperDataSchema.parse({
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
          fullName: "Actual approval",
          role: "USER",
          department: "APPROVAL",
        },
        approvedAt: p03Instant,
      },
      pieces: [],
    },
    printVersion: 2,
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  client.setDefaultOptions({ queries: { retry: false } });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it.each(["SALES", "APPROVAL", "CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE"])(
  "gates financial paper for %s with no previous-resource placeholder",
  async (department) => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { ...p03Session().user, department },
    });
    transport.get.mockResolvedValue(paper());
    const view = renderHook(() => useOfficialOrderPaper(p03Ids.order), {
      wrapper,
    });
    if (department === "SALES" || department === "APPROVAL") {
      await waitFor(() => {
        expect(view.result.current.isSuccess).toBe(true);
      });
      expect(view.result.current.data?.printVersion).toBe(2);
    } else {
      expect(view.result.current.fetchStatus).toBe("idle");
      expect(view.result.current.data).toBeUndefined();
      expect(transport.get).not.toHaveBeenCalled();
    }
  },
);
it("uses fresh collectible official-only keys and cannot publish a late private paper to a new epoch", async () => {
  const scope = readP04OperationalScope(client, "OFFICIAL_PAPER");
  if (scope === null) throw new Error("Expected paper scope");
  const options = officialOrderPaperOptions(client, scope, p03Ids.order);
  expect(options.staleTime).toBe(0);
  expect(options.gcTime).toBe(0);
  expect(options).not.toHaveProperty("placeholderData");
  let resolve: (value: ReturnType<typeof paper>) => void = () => {
    throw new Error("Missing paper response");
  };
  transport.get.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = client.fetchQuery(options).catch((error: unknown) => error);
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("new", epoch, p03Ids.customer);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session(p03Ids.customer));
  resolve(paper());
  await pending;
  expect(
    client.getQueryData(orderPaperKeys.order(scope, p03Ids.order)),
  ).toBeUndefined();
});
