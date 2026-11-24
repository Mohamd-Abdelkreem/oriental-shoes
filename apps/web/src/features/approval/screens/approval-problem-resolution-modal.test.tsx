import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  approvalCommandDataSchema,
  type ResolveIssueBody,
  type ReviewContactBody,
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
} from "@/test/p03-fixtures";
import { approvalKeys } from "../hooks/approval.hooks";
import { ApprovalCommandRecovery } from "../components/approval-command-recovery";
import { ApprovalProblemResolutionModal } from "./approval-problem-resolution-modal";

const transport = vi.hoisted(() => ({
  order: vi.fn(),
  resolve: vi.fn(),
  review: vi.fn(),
}));
vi.mock("../api/approval.api", () => ({ approvalApi: transport }));
const client = createQueryClient(),
  close = vi.fn();
const actor = {
  id: p03Ids.actor,
  fullName: "Actual reviewer",
  role: "USER",
  department: "APPROVAL",
};
const customerReply = "أكّد العميل المقاس الحالي.\nوطلب الاحتفاظ بنفس الأرضية.";
const detail = (
  state:
    | "APPROVAL_REVIEW"
    | "SALES_CONTACT"
    | "REAPPROVAL"
    | "RESOLVED" = "APPROVAL_REVIEW",
  kind: "AMEND" | "CANCEL_REQUEST" = "AMEND",
  version = 2,
) => {
  const original = orderFixture(version),
    piece = original.pieces[0];
  if (!piece) throw new Error("Missing piece");
  const values = {
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    sole: piece.sole,
    catalogSelections: {
      model: null,
      size: null,
      leatherBase: null,
      sole: null,
    },
  };
  return approvalOrderDataSchema.parse({
    order: {
      ...original,
      status: "APPROVED",
      approval: { ...original.approval, approvedAt: p03Instant },
      pieces: original.pieces.map((current) => ({
        ...current,
        stage: state === "RESOLVED" ? "PRODUCTION" : "CUTTING",
        workState: state === "RESOLVED" ? "INCOMING" : "BLOCKED",
      })),
    },
    workflow: {
      initialApproval: {
        decisionId: p03Ids.command,
        orderVersion: 1,
        actor,
        approvedAt: p03Instant,
      },
      currentReturn: null,
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: {
        allowed: state !== "REAPPROVAL",
        reason: state === "REAPPROVAL" ? "PENDING_REAPPROVAL" : null,
      },
      issues:
        state === "RESOLVED"
          ? []
          : [
              {
                id: p03Ids.source,
                orderId: p03Ids.order,
                pieceId: piece.id,
                state,
                reportedAt: p03Instant,
                reason: "Original factory problem",
                notes: "Actual report notes",
                resumeTarget: state === "APPROVAL_REVIEW" ? null : "PRODUCTION",
                instructions:
                  state === "APPROVAL_REVIEW"
                    ? null
                    : {
                        commandId: p03Ids.command,
                        actor,
                        occurredAt: p03Instant,
                        text: "Confirm the exact size with the customer",
                      },
                allowedActions: {
                  canResolve: state === "APPROVAL_REVIEW",
                  canSubmitContact: false,
                  canReviewContact: state === "REAPPROVAL",
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
                currentProposal:
                  state === "REAPPROVAL"
                    ? {
                        id: p03Ids.customer,
                        kind,
                        contactNotes: customerReply,
                        before: values,
                        proposed: kind === "AMEND" ? values : null,
                        submittedBy: {
                          id: p03Ids.actor,
                          fullName: "Actual owner",
                          role: "ADMIN",
                          department: null,
                        },
                        submittedAt: p03Instant,
                      }
                    : null,
              },
            ],
    },
  });
};
const result = (body: ResolveIssueBody | ReviewContactBody) => {
  const review = "proposalId" in body,
    held =
      body.decision === "SEND_TO_SALES" || body.decision === "RETURN_TO_SALES",
    cancelled = body.decision === "CANCEL";
  return approvalCommandDataSchema.parse({
    kind: "approval-command",
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation: review ? "REVIEW_CONTACT" : "RESOLVE_ISSUE",
      orderId: p03Ids.order,
      actor,
      beforeVersion: body.expectedVersion,
      afterVersion: body.expectedVersion + 1,
      occurredAt: p03Instant,
    },
    outcome: {
      orderId: p03Ids.order,
      orderVersion: body.expectedVersion + 1,
      orderStatus: cancelled ? "CANCELLED" : "APPROVED",
      pieceId: p03Ids.piece,
      pieceStage: cancelled ? "CANCELLED" : held ? "CUTTING" : "PRODUCTION",
      pieceWorkState: held || cancelled ? "BLOCKED" : "INCOMING",
      issueId: p03Ids.source,
      issueState: held ? "SALES_CONTACT" : "RESOLVED",
      proposalId: review ? body.proposalId : null,
    },
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: { ...p03Session().user, department: "APPROVAL" },
  });
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  transport.order.mockResolvedValue(detail());
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = (
  mode: "issue" | "reapproval" = "issue",
  issueId = p03Ids.source,
) =>
  render(
    <QueryClientProvider client={client}>
      <ApprovalProblemResolutionModal
        orderId={p03Ids.order}
        pieceId={p03Ids.piece}
        issueId={issueId}
        mode={mode}
        onClose={close}
      />
      <ApprovalCommandRecovery orderId={p03Ids.order} capability="APPROVAL" />
    </QueryClientProvider>,
    { wrapper: ToastProvider },
  );
it("requires an explicit target and meaningful instructions for B and binds the exact issue", async () => {
  transport.resolve.mockImplementation(
    (
      _order: string,
      _piece: string,
      _issue: string,
      body: ResolveIssueBody,
    ) => {
      transport.order.mockResolvedValue(detail("SALES_CONTACT", "AMEND", 3));
      return Promise.resolve(result(body));
    },
  );
  mount();
  const target = await screen.findByLabelText("توجيه إلى قسم:");
  expect(target).toHaveValue("");
  fireEvent.click(screen.getByLabelText(/الخيار \(ب\)/));
  fireEvent.change(
    screen.getByLabelText("تعليمات المبيعات للتواصل مع العميل *:"),
    { target: { value: "Confirm the exact size" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "تنفيذ قرار الاعتماد" }));
  expect(
    await screen.findByText("اختر القسم الذي سيستأنف العمل."),
  ).toBeInTheDocument();
  expect(transport.resolve).not.toHaveBeenCalled();
  fireEvent.change(target, { target: { value: "PRODUCTION" } });
  fireEvent.click(screen.getByRole("button", { name: "تنفيذ قرار الاعتماد" }));
  await waitFor(() => {
    expect(close).toHaveBeenCalledTimes(1);
  });
  expect(transport.resolve).toHaveBeenCalledWith(
    p03Ids.order,
    p03Ids.piece,
    p03Ids.source,
    expect.objectContaining({
      expectedVersion: 2,
      decision: "SEND_TO_SALES",
      target: "PRODUCTION",
      notes: "Confirm the exact size",
    }),
  );
});
it("keeps C inert until nested confirmation and closes confirmation when changing decisions", async () => {
  transport.resolve.mockRejectedValue(new Error("Lost cancellation response"));
  mount();
  fireEvent.click(await screen.findByLabelText(/الخيار \(ج\)/));
  fireEvent.change(screen.getByLabelText("سبب إلغاء القطعة *:"), {
    target: { value: "Customer requested cancellation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "مراجعة إلغاء القطعة" }));
  const confirm = await screen.findByRole("alertdialog", {
    name: "تأكيد إلغاء القطعة",
  });
  expect(transport.resolve).not.toHaveBeenCalled();
  fireEvent.click(
    within(confirm).getByRole("button", { name: "العودة دون إلغاء" }),
  );
  expect(transport.resolve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "مراجعة إلغاء القطعة" }));
  await screen.findByRole("alertdialog");
  fireEvent.click(screen.getByLabelText(/الخيار \(أ\)/));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/الخيار \(ج\)/));
  fireEvent.click(screen.getByRole("button", { name: "مراجعة إلغاء القطعة" }));
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "تأكيد إلغاء القطعة",
    }),
  );
  expect(
    await screen.findByText(
      "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
    ),
  ).toBeInTheDocument();
  expect(transport.resolve).toHaveBeenCalledTimes(1);
  expect(transport.resolve).toHaveBeenCalledWith(
    p03Ids.order,
    p03Ids.piece,
    p03Ids.source,
    expect.objectContaining({
      decision: "CANCEL",
      reason: "Customer requested cancellation",
      confirmed: true,
    }),
  );
  expect(close).not.toHaveBeenCalled();
});
it("accepts a notes-only AMEND against its exact proposal and retained read-only target", async () => {
  transport.order.mockResolvedValue(detail("REAPPROVAL"));
  transport.review.mockImplementation(
    (
      _order: string,
      _piece: string,
      _issue: string,
      body: ReviewContactBody,
    ) => {
      transport.order.mockResolvedValue(detail("RESOLVED", "AMEND", 3));
      return Promise.resolve(result(body));
    },
  );
  mount("reapproval");
  expect(
    await screen.findByText("الوجهة المحفوظة: الإنتاج"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  const customerNotes = await screen.findByRole("region", {
    name: "ملاحظات تواصل المبيعات مع العميل",
  });
  const notes = within(customerNotes);
  expect(notes.getByText(/أكّد العميل المقاس الحالي/u).textContent).toBe(
    customerReply,
  );
  expect(notes.getByText("Actual owner")).toBeInTheDocument();
  expect(customerNotes.querySelector("time")).toHaveAttribute(
    "datetime",
    p03Instant,
  );
  expect(
    screen.getByRole("table", { name: /مقارنة المواصفات/u }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("ملاحظات إعادة الاعتماد *:")).toHaveValue("");
  expect(
    screen.getByText("Confirm the exact size with the customer"),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("ملاحظات إعادة الاعتماد *:"), {
    target: { value: "Approve the customer's confirmation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تنفيذ قرار الاعتماد" }));
  await waitFor(() => {
    expect(close).toHaveBeenCalledTimes(1);
  });
  expect(transport.review).toHaveBeenCalledWith(
    p03Ids.order,
    p03Ids.piece,
    p03Ids.source,
    expect.objectContaining({
      expectedVersion: 2,
      proposalId: p03Ids.customer,
      decision: "ACCEPT",
      notes: "Approve the customer's confirmation",
    }),
  );
});
it("offers return or confirmed cancellation for a cancellation request and never ACCEPT", async () => {
  transport.order.mockResolvedValue(detail("REAPPROVAL", "CANCEL_REQUEST"));
  transport.review.mockRejectedValue(new Error("Lost"));
  mount("reapproval");
  await screen.findByText(/أكّد العميل المقاس الحالي/u);
  expect(
    screen.queryByLabelText("قبول التعديل وإعادة الاعتماد"),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("سبب القرار *:"), {
    target: { value: "Confirm the cancellation request again" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تنفيذ قرار الاعتماد" }));
  await waitFor(() => {
    expect(transport.review).toHaveBeenCalledTimes(1);
  });
  expect(transport.review).toHaveBeenCalledWith(
    p03Ids.order,
    p03Ids.piece,
    p03Ids.source,
    expect.objectContaining({
      decision: "RETURN_TO_SALES",
      proposalId: p03Ids.customer,
      reason: "Confirm the cancellation request again",
    }),
  );
  expect(close).not.toHaveBeenCalled();
});
it("retains dirty instructions while a newer wrapper disables the authored version", async () => {
  mount();
  const notes = await screen.findByLabelText(
    "ملاحظات وتوجيه حل المشكلة للقسم *:",
  );
  fireEvent.change(notes, { target: { value: "Retain these instructions" } });
  const scope = readP04OperationalScope(client, "APPROVAL");
  if (!scope) throw new Error("Missing scope");
  act(() => {
    client.setQueryData(
      approvalKeys.order(scope, p03Ids.order),
      detail("APPROVAL_REVIEW", "AMEND", 3),
    );
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "تنفيذ قرار الاعتماد" }),
    ).toBeDisabled(),
  );
  expect(notes).toHaveValue("Retain these instructions");
  expect(transport.resolve).not.toHaveBeenCalled();
});
it("denies a foreign or stale selected issue without authoring a decision", async () => {
  mount("issue", p03Ids.customer);
  expect(
    await screen.findByText(
      "المشكلة غير موجودة أو تغير سياقها؛ راجع الطلب الحالي.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "تنفيذ قرار الاعتماد" }),
  ).not.toBeInTheDocument();
  expect(transport.resolve).not.toHaveBeenCalled();
});
