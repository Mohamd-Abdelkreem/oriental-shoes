import { renderWithToast as render } from "@/test/render-with-toast";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  authUserDataSchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
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
import { QualityCommandRecovery } from "./quality-command-recovery";

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

const seed = (phase: "pending" | "unknown" | "confirmed" | "synchronized") => {
  const scope = readQualityOperationalScope(client);
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
  client.setQueryData([...qualityScopeKey(scope), "command-session"], entry);
};
it("retains pending context on remount and hides it on account loss", async () => {
  seed("pending");
  const view = render(<QualityCommandRecovery />, { wrapper });
  expect(screen.getByText(/إغلاق النافذة لا يلغي/)).toBeInTheDocument();
  view.unmount();
  render(<QualityCommandRecovery />, { wrapper });
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
  transport.get.mockRejectedValue(failure(404, "QUALITY_COMMAND_NOT_FOUND"));
  transport.post.mockResolvedValue(p03Envelope(saved()));
  render(<QualityCommandRecovery />, { wrapper });
  fireEvent.click(screen.getByRole("button", { name: "التحقق من النتيجة" }));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "إعادة نفس الإجراء" }),
    ).toBeEnabled();
  });
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "إعادة نفس الإجراء" }));
  expect(await screen.findByText(/تم استلام وبدء فحص/u)).toBeInTheDocument();
  expect(
    screen.queryByLabelText("متابعة نتيجة الإجراء"),
  ).not.toBeInTheDocument();
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(
    "/quality/commands",
    body(),
  );
  await waitFor(() => {
    expect(
      screen.queryByLabelText("متابعة نتيجة الإجراء"),
    ).not.toBeInTheDocument();
  });
});
it("synchronizes a saved outcome without posting again and clears the confirmation automatically", async () => {
  seed("confirmed");
  render(<QualityCommandRecovery />, { wrapper });
  expect(screen.getByRole("alert")).toHaveTextContent("تم حفظ الإجراء");
  fireEvent.click(
    screen.getByRole("button", { name: "تحديث البيانات المحفوظة" }),
  );
  expect(await screen.findByText(/تم استلام وبدء فحص/u)).toBeInTheDocument();
  expect(
    screen.queryByLabelText("متابعة نتيجة الإجراء"),
  ).not.toBeInTheDocument();
  expect(transport.post).not.toHaveBeenCalled();
});
