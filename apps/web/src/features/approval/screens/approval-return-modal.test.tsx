import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  approvalCommandDataSchema,
  type ReturnInitialBody,
  type ApproveInitialBody,
} from "@template/contracts";
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
  p03Instant,
  p03Session,
  p03Pagination,
} from "@/test/p03-fixtures";
import { approvalKeys } from "../hooks/approval.hooks";
import { ApprovalCommandRecovery } from "../components/approval-command-recovery";
import { ApprovalReturnModal } from "./approval-return-modal";

const transport = vi.hoisted(() => ({
  order: vi.fn(),
  approve: vi.fn(),
  return: vi.fn(),
  orderHistory: vi.fn(),
  event: vi.fn(),
  push: vi.fn(),
}));
vi.mock("../api/approval.api", () => ({ approvalApi: transport }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: transport.push }),
}));
const client = createQueryClient();
const detail = (
  version = 1,
  status: "initial" | "approved" | "returned" = "initial",
) => {
  const original = orderFixture(version),
    returned = status === "returned",
    approved = status === "approved";
  return approvalOrderDataSchema.parse({
    order: {
      ...original,
      status: returned ? "RETURNED" : approved ? "APPROVED" : original.status,
      approval: {
        ...original.approval,
        approvedAt: approved ? p03Instant : null,
        ...(returned
          ? {
              returnDecisionId: p03Ids.source,
              returnedAt: p03Instant,
              returnReason: "Clarify the requested finish",
              returnRevision: version,
            }
          : {}),
      },
      pieces: original.pieces.map((piece) => ({
        ...piece,
        stage: approved ? "CUTTING" : piece.stage,
      })),
    },
    workflow: {
      initialApproval: approved
        ? {
            decisionId: p03Ids.command,
            actor: {
              id: p03Ids.actor,
              fullName: "Actual reviewer",
              role: "USER",
              department: "APPROVAL",
            },
            approvedAt: p03Instant,
            orderVersion: version,
          }
        : null,
      currentReturn: returned
        ? {
            decisionId: p03Ids.source,
            reason: "Clarify the requested finish",
            notes: "Separate reviewer notes",
            returnedAt: p03Instant,
          }
        : null,
      allowedActions: {
        canApproveInitial: status === "initial",
        canReturnInitial: status === "initial",
      },
      printEligibility: {
        allowed: approved,
        reason: approved ? null : returned ? "RETURNED" : "NOT_APPROVED",
      },
      issues: [],
    },
  });
};
const saved = (
  operation: "APPROVE_INITIAL" | "RETURN_INITIAL",
  body: ApproveInitialBody,
) =>
  approvalCommandDataSchema.parse({
    kind: "approval-command",
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation,
      orderId: p03Ids.order,
      actor: {
        id: p03Ids.actor,
        fullName: "Actual reviewer",
        role: "USER",
        department: "APPROVAL",
      },
      beforeVersion: body.expectedVersion,
      afterVersion: body.expectedVersion + 1,
      occurredAt: p03Instant,
    },
    outcome: {
      orderId: p03Ids.order,
      orderVersion: body.expectedVersion + 1,
      orderStatus: operation === "APPROVE_INITIAL" ? "APPROVED" : "RETURNED",
      pieceId: null,
      pieceStage: null,
      pieceWorkState: null,
      issueId: null,
      issueState: null,
      proposalId: null,
    },
  });
const conflict = () =>
  new AxiosError("Stale", undefined, undefined, undefined, {
    status: 409,
    statusText: "Conflict",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: 409,
      message: "Review the current order",
      code: "APPROVAL_VERSION_CONFLICT",
      requestId: "conflict-request",
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: { ...p03Session().user, department: "APPROVAL" },
  });
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  transport.order.mockResolvedValue(detail());
  transport.orderHistory.mockResolvedValue({
    events: [],
    pagination: p03Pagination,
  });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const close = vi.fn(),
  returned = vi.fn();
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ApprovalReturnModal
        orderId={p03Ids.order}
        onClose={close}
        onReturned={returned}
      />
      <ApprovalCommandRecovery orderId={p03Ids.order} capability="APPROVAL" />
    </QueryClientProvider>,
  );
it("submits required free text and optional notes separately once, then closes only after synchronization", async () => {
  returned.mockReset();
  close.mockReset();
  transport.return.mockImplementation(
    (_id: string, body: ReturnInitialBody) => {
      transport.order.mockResolvedValue(detail(2, "returned"));
      return Promise.resolve(saved("RETURN_INITIAL", body));
    },
  );
  mount();
  const submit = await screen.findByRole("button", {
    name: "تأكيد الإعادة للمبيعات",
  });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await waitFor(() => {
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
  expect(transport.return).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("سبب الإعادة الإلزامي *"), {
    target: { value: "Clarify the requested finish" },
  });
  fireEvent.change(
    screen.getByLabelText("تفاصيل وملاحظات إضافية للمبيعات (اختياري):"),
    { target: { value: "Separate reviewer notes" } },
  );
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() => {
    expect(returned).toHaveBeenCalledTimes(1);
  });
  expect(transport.return).toHaveBeenCalledTimes(1);
  expect(transport.return).toHaveBeenCalledWith(
    p03Ids.order,
    expect.objectContaining({
      expectedVersion: 1,
      reason: "Clarify the requested finish",
      notes: "Separate reviewer notes",
    }),
  );
});
it("retains dirty input after a definitive conflict and background version change until explicit review", async () => {
  transport.return.mockRejectedValue(conflict());
  mount();
  const reason = await screen.findByLabelText("سبب الإعادة الإلزامي *");
  fireEvent.change(reason, { target: { value: "Retained technical reason" } });
  const submit = screen.getByRole("button", { name: "تأكيد الإعادة للمبيعات" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  expect(await screen.findByText(/conflict-request/)).toBeInTheDocument();
  const scope = readP04OperationalScope(client, "APPROVAL");
  if (!scope) throw new Error("Missing scope");
  act(() => {
    client.setQueryData(approvalKeys.order(scope, p03Ids.order), detail(3));
  });
  await waitFor(() => expect(submit).toBeDisabled());
  expect(reason).toHaveValue("Retained technical reason");
  fireEvent.click(
    screen.getByRole("button", { name: "مراجعة البيانات الحالية" }),
  );
  await waitFor(() => expect(submit).toBeEnabled());
  expect(transport.return).toHaveBeenCalledTimes(1);
});
it("keeps parent recovery after closing an uncertain return dialog", async () => {
  transport.return.mockRejectedValue(new Error("Lost response"));
  const view = mount();
  fireEvent.change(await screen.findByLabelText("سبب الإعادة الإلزامي *"), {
    target: { value: "Keep this frozen reason" },
  });
  const submit = screen.getByRole("button", { name: "تأكيد الإعادة للمبيعات" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  expect(
    await screen.findByText(
      "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
    ),
  ).toBeInTheDocument();
  view.rerender(
    <QueryClientProvider client={client}>
      <ApprovalCommandRecovery orderId={p03Ids.order} capability="APPROVAL" />
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: "إعادة نفس العملية" }),
  ).toBeInTheDocument();
  expect(transport.return).toHaveBeenCalledTimes(1);
});
