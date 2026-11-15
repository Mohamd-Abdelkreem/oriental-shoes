import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  authUserDataSchema,
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
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
import { WarehouseCommandRecovery } from "./warehouse-command-recovery";

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

const seed = (phase: "pending" | "unknown" | "confirmed" | "synchronized") => {
  const scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  const entry = {
    originScope: scope,
    body: body(),
    phase,
    ...(phase === "unknown"
      ? {
          failure: {
            message: "Safe",
            statusCode: 0,
            code: "NETWORK_ERROR",
            requestId: "owned<script>",
            fieldErrors: {},
          },
        }
      : {}),
    ...(phase === "confirmed" || phase === "synchronized"
      ? { result: saved() }
      : {}),
    ...(phase === "confirmed"
      ? {
          syncError: {
            message: "Safe",
            statusCode: 0,
            code: "NETWORK_ERROR",
            requestId: "owned",
            fieldErrors: {},
          },
        }
      : {}),
  };
  client.setQueryData([...warehouseScopeKey(scope), "command-session"], entry);
};
it("retains pending context on remount and hides it on account loss", async () => {
  seed("pending");
  const view = render(<WarehouseCommandRecovery />, { wrapper });
  expect(screen.getByText(/إغلاق النافذة لا يلغي/)).toBeInTheDocument();
  view.unmount();
  render(<WarehouseCommandRecovery />, { wrapper });
  expect(screen.getByText(/إغلاق النافذة لا يلغي/)).toBeInTheDocument();
  act(() => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, null);
  });
  await waitFor(() => {
    expect(
      screen.queryByLabelText("متابعة نتيجة الإجراء"),
    ).not.toBeInTheDocument();
  });
  expect(transport.post).not.toHaveBeenCalled();
});
it("observes 404 without discarding uncertainty then retries exactly the original body", async () => {
  seed("unknown");
  transport.get.mockRejectedValue(failure(404, "WAREHOUSE_COMMAND_NOT_FOUND"));
  transport.post.mockResolvedValue(p03Envelope(saved()));
  render(<WarehouseCommandRecovery />, { wrapper });
  fireEvent.click(screen.getByRole("button", { name: "التحقق من النتيجة" }));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "إعادة نفس الإجراء" }),
    ).toBeEnabled();
  });
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "إعادة نفس الإجراء" }));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "إغلاق التأكيد" }),
    ).toBeInTheDocument();
  });
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(
    "/warehouse/commands",
    body(),
  );
  fireEvent.click(screen.getByRole("button", { name: "إغلاق التأكيد" }));
  await waitFor(() => {
    expect(
      screen.queryByLabelText("متابعة نتيجة الإجراء"),
    ).not.toBeInTheDocument();
  });
});
it("synchronizes a saved outcome without posting again and requires explicit acknowledgement", async () => {
  seed("confirmed");
  render(<WarehouseCommandRecovery />, { wrapper });
  expect(screen.getByRole("alert")).toHaveTextContent("تم حفظ الإجراء");
  fireEvent.click(
    screen.getByRole("button", { name: "تحديث البيانات المحفوظة" }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "إغلاق التأكيد" }),
    ).toBeInTheDocument();
  });
  expect(transport.post).not.toHaveBeenCalled();
});
