import { AxiosError, AxiosHeaders } from "axios";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  approvalCommandDataSchema,
  type ApproveInitialBody,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Session,
  p03Pagination,
} from "@/test/p03-fixtures";
import { ApprovalDecisionView } from "./approval-decision-view";

const transport = vi.hoisted(() => ({
  resolve: vi.fn(),
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
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ApprovalDecisionView orderId={p03Ids.order} />
    </QueryClientProvider>,
  );
it("approves once from current hints and synchronizes before navigation", async () => {
  let complete: (value: ReturnType<typeof saved>) => void = () => {
    throw new Error("Missing write");
  };
  let submitted: ApproveInitialBody | null = null;
  transport.approve.mockImplementation(
    (_id: string, body: ApproveInitialBody) => {
      submitted = body;
      return new Promise((done) => {
        complete = done;
      });
    },
  );
  mount();
  const approve = await screen.findByRole("button", {
    name: "اعتماد أمر التفصيل وتوجيهه للمصنع",
  });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(approve);
  fireEvent.click(screen.getByRole("button", { name: "اعتماد أمر التفصيل" }));
  await waitFor(() => {
    expect(transport.approve).toHaveBeenCalledTimes(1);
  });
  expect(transport.push).not.toHaveBeenCalled();
  transport.order.mockResolvedValue(detail(2, "approved"));
  act(() => {
    if (!submitted) throw new Error("Missing body");
    complete(saved("APPROVE_INITIAL", submitted));
  });
  await waitFor(() => {
    expect(transport.push).toHaveBeenCalledWith("/approval/pending");
  });
  expect(transport.approve).toHaveBeenCalledWith(
    p03Ids.order,
    expect.objectContaining({ expectedVersion: 1 }),
  );
});
it("keeps saved-result recovery visible when fresh detail fails and never navigates", async () => {
  transport.approve.mockImplementation(
    (_id: string, body: ApproveInitialBody) => {
      transport.order.mockRejectedValue(new Error("Refresh failed"));
      return Promise.resolve(saved("APPROVE_INITIAL", body));
    },
  );
  mount();
  const approve = await screen.findByRole("button", {
    name: "اعتماد أمر التفصيل وتوجيهه للمصنع",
  });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(approve);
  expect(
    await screen.findByText("تم الحفظ؛ تعذر تحديث العرض الحالي."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "تحديث العرض" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إعادة نفس العملية" }),
  ).not.toBeInTheDocument();
  expect(transport.push).not.toHaveBeenCalled();
});
it("uses canonical tracking and never treats an initially returned order as already approved", async () => {
  transport.order.mockResolvedValue(detail(3, "returned"));
  mount();
  expect(
    await screen.findByText("Clarify the requested finish"),
  ).toBeInTheDocument();
  expect(screen.getByText("Separate reviewer notes")).toBeInTheDocument();
  expect(
    screen.queryByText("تم اعتماد هذا الطلب ودخل خطوط التصنيع"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "معاينة الطباعة" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "اعتماد أمر التفصيل" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: /تتبع أمر التفصيل ومسار الكميات/ }),
  );
  expect(transport.orderHistory).toHaveBeenCalled();
  expect(screen.getByText(/للاطلاع على السجل الزمني/)).toBeInTheDocument();
});

it("requires an explicit current read after a stale initial decision conflict", async () => {
  transport.approve.mockRejectedValue(
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
        requestId: "review-required",
      },
    }),
  );
  mount();
  const approve = await screen.findByRole("button", {
    name: "اعتماد أمر التفصيل وتوجيهه للمصنع",
  });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(approve);
  expect(await screen.findByText(/review-required/)).toBeInTheDocument();
  expect(approve).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "مراجعة البيانات الحالية" }),
  );
  await waitFor(() => expect(approve).toBeEnabled());
  expect(transport.approve).toHaveBeenCalledTimes(1);
  expect(transport.order).toHaveBeenCalledTimes(2);
});

it("opens the exact issue and retains parent recovery after closing its uncertain dialog", async () => {
  const original = detail(2, "approved");
  const data = approvalOrderDataSchema.parse({
    ...original,
    order: {
      ...original.order,
      pieces: original.order.pieces.map((piece) => ({
        ...piece,
        workState: "BLOCKED",
      })),
    },
    workflow: {
      ...original.workflow,
      issues: [
        {
          id: p03Ids.source,
          orderId: p03Ids.order,
          pieceId: p03Ids.piece,
          state: "APPROVAL_REVIEW",
          reportedAt: p03Instant,
          reason: "Selected factory issue",
          notes: null,
          resumeTarget: null,
          instructions: null,
          allowedActions: {
            canResolve: true,
            canSubmitContact: false,
            canReviewContact: false,
          },
          source: {
            department: "CUTTING",
            stage: "CUTTING",
            workState: "IN_PROGRESS",
          },
          reporter: {
            id: p03Ids.customer,
            fullName: "Actual reporter",
            role: "USER",
            department: "CUTTING",
          },
          currentProposal: null,
        },
      ],
    },
  });
  transport.order.mockResolvedValue(data);
  transport.resolve.mockRejectedValue(
    new Error("Lost selected issue response"),
  );
  mount();
  const open = await screen.findByRole("button", {
    name: /اتخاذ قرار معالجة المشكلة/,
  });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  expect(
    await screen.findByRole("heading", { name: "قرار معالجة مشكلة التصنيع" }),
  ).toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText("توجيه إلى قسم:"), {
    target: { value: "PRODUCTION" },
  });
  fireEvent.change(
    screen.getByLabelText("ملاحظات وتوجيه حل المشكلة للقسم *:"),
    { target: { value: "Resume only this selected piece" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "تنفيذ قرار الاعتماد" }));
  expect(
    await screen.findByText(
      "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
  expect(
    screen.queryByRole("heading", { name: "قرار معالجة مشكلة التصنيع" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "إعادة نفس العملية" }),
  ).toBeInTheDocument();
  expect(transport.resolve).toHaveBeenCalledWith(
    p03Ids.order,
    p03Ids.piece,
    p03Ids.source,
    expect.objectContaining({
      expectedVersion: 2,
      decision: "RETURN_TO_DEPARTMENT",
      target: "PRODUCTION",
      notes: "Resume only this selected piece",
    }),
  );
  expect(transport.resolve).toHaveBeenCalledTimes(1);
});
