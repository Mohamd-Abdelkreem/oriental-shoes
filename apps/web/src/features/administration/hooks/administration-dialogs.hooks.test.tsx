import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import {
  p08AdminSession,
  p08CorrectionCommandFixture,
  p08DetailFixture,
} from "@/test/p08-fixtures";
import { p03Ids, p03Envelope } from "@/test/p03-fixtures";
import { administrationKeys } from "./administration.hooks";
import { useAdministrationDialogs } from "./administration-dialogs.hooks";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string, options?: unknown) => Promise<unknown>>(),
  post: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const scope = () => {
  const current = readAdministrationOperationalScope(client);
  if (!current) throw new Error("Expected admin scope");
  return current;
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  transport.post.mockResolvedValue(
    p03Envelope(p08CorrectionCommandFixture().result),
  );
  transport.get.mockImplementation((path) => {
    if (path.includes("administration-commands"))
      return Promise.resolve(p03Envelope(p08CorrectionCommandFixture().result));
    return Promise.resolve(p03Envelope(p08DetailFixture(2)));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  renderHook(() => useAdministrationDialogs(p03Ids.order, "ready"), {
    wrapper,
  });
const seedDetail = (version = 1) =>
  client.setQueryData(
    administrationKeys.order(scope(), p03Ids.order),
    p08DetailFixture(version),
  );
it("rejects a stale confirmation before UUID allocation or POST, then reviews while retaining intended dirty fields", async () => {
  seedDetail();
  transport.get.mockResolvedValue(p03Envelope(p08DetailFixture()));
  const hook = mount(),
    uuid = vi.spyOn(crypto, "randomUUID");
  await act(async () => {
    await hook.result.current.openCorrection();
  });
  act(() => {
    hook.result.current.correctionForm.setValue(
      "customerAddress",
      "Intended address",
      { shouldDirty: true },
    );
    hook.result.current.correctionForm.setValue("reason", "Actual reason");
  });
  seedDetail(2);
  await act(async () => {
    await hook.result.current.confirmCorrection(
      hook.result.current.correctionForm.getValues(),
    );
  });
  expect(uuid).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
  expect(hook.result.current.reviewRequired).toBe(true);
  const current = p08DetailFixture(2);
  current.correction.effective.customerName = "Current name";
  transport.get.mockResolvedValue(p03Envelope(current));
  await act(async () => {
    await hook.result.current.reviewCurrent();
  });
  expect(hook.result.current.correctionReview?.expectedVersion).toBe(2);
  expect(hook.result.current.correctionForm.getValues()).toMatchObject({
    customerName: "Current name",
    customerAddress: "Intended address",
    reason: "Actual reason",
  });
  expect(
    hook.result.current.correctionForm.getFieldState("customerAddress").isDirty,
  ).toBe(true);
  expect(transport.post).not.toHaveBeenCalled();
  uuid.mockRestore();
});
it("allocates no intent for a no-op and sends one exact correction despite repeated Save", async () => {
  seedDetail();
  transport.get.mockResolvedValue(p03Envelope(p08DetailFixture()));
  const hook = mount(),
    uuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("66666666-6666-4666-8666-666666666666");
  await act(async () => {
    await hook.result.current.openCorrection();
  });
  act(() => {
    hook.result.current.correctionForm.setValue(
      "reason",
      "Confirmed contact correction",
    );
  });
  await act(async () => {
    await hook.result.current.confirmCorrection(
      hook.result.current.correctionForm.getValues(),
    );
  });
  expect(uuid).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
  const reply = deferred<unknown>();
  transport.post.mockReturnValueOnce(reply.promise);
  act(() => {
    hook.result.current.correctionForm.setValue(
      "customerAddress",
      "Corrected order-only address",
    );
  });
  let pending: Promise<void>;
  act(() => {
    pending = hook.result.current.confirmCorrection(
      hook.result.current.correctionForm.getValues(),
    );
  });
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  await act(async () => {
    await hook.result.current.confirmCorrection(
      hook.result.current.correctionForm.getValues(),
    );
  });
  expect(uuid).toHaveBeenCalledTimes(1);
  expect(transport.post).toHaveBeenCalledTimes(1);
  transport.get.mockResolvedValue(p03Envelope(p08DetailFixture(2)));
  reply.resolve(p03Envelope(p08CorrectionCommandFixture().result));
  await act(async () => {
    await pending;
  });
  expect(hook.result.current.correctionReview).toBeNull();
  uuid.mockRestore();
});
it("closing during preparation prevents a late read from opening either dialog and makes no write", async () => {
  seedDetail();
  const response = deferred<unknown>();
  transport.get.mockReturnValueOnce(response.promise);
  const hook = mount();
  let pending: Promise<void>;
  act(() => {
    pending = hook.result.current.openCancellation();
  });
  await waitFor(() => {
    expect(hook.result.current.preparing).toBe(true);
  });
  act(() => {
    hook.result.current.close();
  });
  response.resolve(p03Envelope(p08DetailFixture()));
  await act(async () => {
    await pending;
  });
  expect(hook.result.current.cancelReview).toBeNull();
  expect(hook.result.current.correctionReview).toBeNull();
  expect(transport.post).not.toHaveBeenCalled();
});
it("preserves exact cancellation selection and reason when review encounters an ineligible member", async () => {
  seedDetail();
  transport.get.mockResolvedValue(p03Envelope(p08DetailFixture()));
  const hook = mount();
  await act(async () => {
    await hook.result.current.openCancellation();
  });
  act(() => {
    hook.result.current.cancelForm.setValue("reason", "Retained reason");
  });
  const current = p08DetailFixture(2);
  current.cancellationCandidates.forEach((piece) => {
    piece.eligible = false;
    piece.denialReason = "INVALID_STATE";
  });
  transport.get.mockResolvedValue(p03Envelope(current));
  await act(async () => {
    await hook.result.current.reviewCurrent();
  });
  expect(hook.result.current.reviewRequired).toBe(true);
  expect(hook.result.current.cancelForm.getValues()).toMatchObject({
    selectedPieceIds: [p03Ids.piece],
    reason: "Retained reason",
  });
  expect(transport.post).not.toHaveBeenCalled();
});

it.each(["DELIVERED", "CANCELLED"] as const)(
  "allows correction on %s without changing its lifecycle",
  async (status) => {
    const detail = p08DetailFixture();
    detail.order.status = status;
    detail.adminActions.canCancel = false;
    detail.order.approval.approvedAt = "2026-11-15T09:00:00.000Z";
    detail.order.pieces.forEach((piece) => {
      piece.stage = status === "CANCELLED" ? "CANCELLED" : "WAREHOUSE";
      piece.workState = status === "CANCELLED" ? "BLOCKED" : "COMPLETED";
      piece.receivedAt =
        status === "DELIVERED" ? "2026-11-15T09:00:00.000Z" : null;
      piece.cancelledAt =
        status === "CANCELLED" ? "2026-11-15T09:00:00.000Z" : null;
      piece.cancellationReason =
        status === "CANCELLED" ? "Actual cancellation" : null;
    });
    detail.order.counts = {
      original: 1,
      cancelled: status === "CANCELLED" ? 1 : 0,
      active: status === "CANCELLED" ? 0 : 1,
      received: status === "DELIVERED" ? 1 : 0,
      completionPercent: status === "DELIVERED" ? 100 : 0,
    };
    if (status === "CANCELLED")
      detail.order.money = {
        total: "0.00",
        paidAmount: "0.00",
        remainingDue: "0.00",
        surplus: "0.00",
      };
    detail.tracking.counts = detail.order.counts;
    detail.tracking.pieces = detail.order.pieces.map((piece) => ({
      pieceId: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    }));
    detail.cancellationCandidates = detail.order.pieces.map((piece) => ({
      pieceId: piece.id,
      position: piece.position,
      model: piece.model,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      eligible: false,
      denialReason: status,
    }));
    client.setQueryData(
      administrationKeys.order(scope(), p03Ids.order),
      detail,
    );
    transport.get.mockResolvedValue(p03Envelope(detail));
    const hook = mount();
    await act(async () => {
      await hook.result.current.openCorrection();
    });
    expect(hook.result.current.correctionReview?.orderId).toBe(p03Ids.order);
    expect(
      client.getQueryData(administrationKeys.order(scope(), p03Ids.order)),
    ).toMatchObject({ order: { status } });
    expect(transport.post).not.toHaveBeenCalled();
  },
);
