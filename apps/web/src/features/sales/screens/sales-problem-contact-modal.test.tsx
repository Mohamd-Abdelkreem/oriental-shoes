import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  approvalCommandDataSchema,
  authUserDataSchema,
  submitContactBodySchema,
  type SubmitContactBody,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { ApprovalCommandRecovery } from "@/features/approval/components/approval-command-recovery";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import {
  readP04OperationalScope,
  readOperationalScope,
} from "@/shared/query/operational-scope";
import {
  orderFixture,
  catalogFixture,
  p03Ids,
  p03Instant,
  p03Session,
} from "@/test/p03-fixtures";
import { salesContactKeys } from "../hooks/sales-contact.hooks";
import { catalogKeys } from "../hooks/catalogs.hooks";
import { SalesProblemContactModal } from "./sales-problem-contact-modal";

const transport = vi.hoisted(() => ({
  order: vi.fn(),
  submit: vi.fn(),
  catalog: vi.fn(),
  quote: vi.fn(),
}));
vi.mock("../api/sales-contact.api", () => ({
  salesContactApi: { order: transport.order, submit: transport.submit },
}));
vi.mock("../api/catalogs.api", () => ({
  catalogsApi: { get: transport.catalog, quote: transport.quote },
}));
const client = createQueryClient(),
  close = vi.fn();
const catalog = catalogFixture();
if (catalog.availability !== "available")
  throw new Error("Missing fixture catalog");
const sizeEntry = catalog.entries.find(
  (entry) => entry.kind === "size" && entry.displayValue === "40.5",
);
if (!sizeEntry) throw new Error("Missing source size 40.5");
const sizeId = sizeEntry.id;
const actor = () => {
  const { user } = authUserDataSchema.parse(
    client.getQueryData(AUTH_SESSION_QUERY_KEY),
  );
  return {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    department: user.department,
  };
};
const detail = ({
  version = 2,
  body,
  otherOwner = false,
  retainedFloor = false,
  resumeTarget = "PRODUCTION",
}: {
  version?: number;
  body?: SubmitContactBody;
  otherOwner?: boolean;
  retainedFloor?: boolean;
  resumeTarget?: "CUTTING" | "PRODUCTION";
} = {}) => {
  const original = orderFixture(version),
    piece = original.pieces[0];
  if (!piece?.model || !piece.size || !piece.leatherBase)
    throw new Error("Missing retained values");
  const current = {
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    sole: retainedFloor ? "Retained inactive floor" : piece.sole,
    catalogSelections: {
      model: null,
      size: null,
      leatherBase: null,
      sole: null,
    },
  };
  const proposed = structuredClone(current);
  if (body?.kind === "AMEND")
    for (const field of ["model", "size", "leatherBase", "sole"] as const) {
      const id = body.changes[field];
      if (id === undefined) continue;
      if (id === null && field === "sole") {
        proposed.sole = null;
        continue;
      }
      const entry = catalog.entries.find(
        (candidate) => candidate.id === id && candidate.kind === field,
      );
      if (!entry) throw new Error("Missing selected source entry");
      proposed[field] = entry.displayValue;
    }
  const reviewer = {
    id: p03Ids.source,
    fullName: "Actual approver",
    role: "USER",
    department: "APPROVAL",
  };
  return approvalOrderDataSchema.parse({
    order: {
      ...original,
      owner: {
        ...original.owner,
        id: otherOwner ? p03Ids.customer : p03Ids.actor,
      },
      status: "APPROVED",
      approval: { ...original.approval, approvedAt: p03Instant },
      pieces: original.pieces.map((currentPiece) => ({
        ...currentPiece,
        sole: current.sole,
        stage: "CUTTING",
        workState: "BLOCKED",
      })),
    },
    workflow: {
      initialApproval: {
        decisionId: p03Ids.command,
        orderVersion: 1,
        actor: reviewer,
        approvedAt: p03Instant,
      },
      currentReturn: null,
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: {
        allowed: body === undefined,
        reason: body === undefined ? null : "PENDING_REAPPROVAL",
      },
      issues: [
        {
          id: p03Ids.source,
          orderId: p03Ids.order,
          pieceId: p03Ids.piece,
          state: body === undefined ? "SALES_CONTACT" : "REAPPROVAL",
          reportedAt: p03Instant,
          reason: "Original factory problem",
          notes: "Original report notes",
          resumeTarget,
          instructions: {
            commandId: p03Ids.command,
            actor: reviewer,
            occurredAt: p03Instant,
            text: "Confirm the four retained specifications",
          },
          allowedActions: {
            canResolve: false,
            canSubmitContact: body === undefined,
            canReviewContact: false,
          },
          source: {
            department: "CUTTING",
            stage: "CUTTING",
            workState: "IN_PROGRESS",
          },
          reporter: {
            id: p03Ids.customer,
            fullName: "Actual factory reporter",
            role: "USER",
            department: "CUTTING",
          },
          currentProposal:
            body === undefined
              ? null
              : {
                  id: p03Ids.customer,
                  kind: body.kind,
                  contactNotes: body.contactNotes,
                  before: current,
                  proposed: body.kind === "AMEND" ? proposed : null,
                  submittedBy: actor(),
                  submittedAt: p03Instant,
                },
        },
      ],
    },
  });
};
const saved = (body: SubmitContactBody) =>
  approvalCommandDataSchema.parse({
    kind: "approval-command",
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation: "SUBMIT_CONTACT",
      orderId: p03Ids.order,
      actor: actor(),
      beforeVersion: body.expectedVersion,
      afterVersion: body.expectedVersion + 1,
      occurredAt: p03Instant,
    },
    outcome: {
      orderId: p03Ids.order,
      orderVersion: body.expectedVersion + 1,
      orderStatus: "APPROVED",
      pieceId: p03Ids.piece,
      pieceStage: "CUTTING",
      pieceWorkState: "BLOCKED",
      issueId: p03Ids.source,
      issueState: "REAPPROVAL",
      proposalId: p03Ids.customer,
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  transport.order.mockResolvedValue(detail());
  transport.catalog.mockResolvedValue(catalog);
  transport.submit.mockImplementation(
    (
      _order: string,
      _piece: string,
      _issue: string,
      body: SubmitContactBody,
    ) => {
      transport.order.mockResolvedValue(
        detail({ version: body.expectedVersion + 1, body }),
      );
      return Promise.resolve(saved(body));
    },
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <SalesProblemContactModal
        orderId={p03Ids.order}
        pieceId={p03Ids.piece}
        issueId={p03Ids.source}
        onClose={close}
      />
      <ApprovalCommandRecovery
        orderId={p03Ids.order}
        capability="SALES_CONTACT"
      />
    </QueryClientProvider>,
  );
it.each([
  ["SALES", "PRODUCTION", "الإنتاج"],
  ["ADMIN", "CUTTING", "القص"],
] as const)(
  "lets the actual %s owner review the retained %s target and submit one size proposal without changing frozen terms or releasing work",
  async (role, resumeTarget, targetLabel) => {
    if (role === "ADMIN")
      client.setQueryData(AUTH_SESSION_QUERY_KEY, {
        user: {
          ...p03Session().user,
          role: "ADMIN",
          department: null,
          staffApprovedAt: null,
        },
      });
    transport.order.mockResolvedValue(detail({ resumeTarget }));
    transport.submit.mockImplementation(
      (
        _order: string,
        _piece: string,
        _issue: string,
        body: SubmitContactBody,
      ) => {
        transport.order.mockResolvedValue(
          detail({ version: body.expectedVersion + 1, body, resumeTarget }),
        );
        return Promise.resolve(saved(body));
      },
    );
    mount();
    const size = await screen.findByLabelText("المقاس:");
    await waitFor(() => expect(size).toBeEnabled());
    expect(
      screen.getByText("الوجهة المحفوظة:").parentElement,
    ).toHaveTextContent(`الوجهة المحفوظة: ${targetLabel}`);
    expect(screen.getAllByRole("combobox")).toHaveLength(4);
    expect(
      within(size).getByRole("option", { name: "القيمة المحفوظة: 40" }),
    ).toBeInTheDocument();
    fireEvent.change(size, { target: { value: sizeId } });
    fireEvent.change(
      screen.getByLabelText("ملاحظات تواصل المبيعات مع العميل *:"),
      { target: { value: "Customer selected size 40.5" } },
    );
    const submit = screen.getByRole("button", {
      name: "إرسال المقترح للاعتماد",
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    const rawBody: unknown = transport.submit.mock.calls[0]?.[3];
    const body = submitContactBodySchema.parse(rawBody);
    expect(transport.submit).toHaveBeenCalledWith(
      p03Ids.order,
      p03Ids.piece,
      p03Ids.source,
      {
        commandId: body.commandId,
        expectedVersion: 2,
        kind: "AMEND",
        contactNotes: "Customer selected size 40.5",
        changes: { size: sizeId },
      },
    );
    expect(transport.submit).toHaveBeenCalledTimes(1);
    expect(transport.quote).not.toHaveBeenCalled();
    const scope = readP04OperationalScope(client, "SALES_CONTACT");
    if (!scope) throw new Error("Missing scope");
    const published = approvalOrderDataSchema.parse(
      client.getQueryData(salesContactKeys.order(scope, p03Ids.order)),
    );
    expect(published.order.pieces[0]).toMatchObject({
      size: "40",
      stage: "CUTTING",
      workState: "BLOCKED",
      unitPrice: "1800.00",
    });
    expect(published.workflow.issues[0]?.currentProposal?.proposed?.size).toBe(
      "40.5",
    );
    expect(published.workflow.printEligibility).toEqual({
      allowed: false,
      reason: "PENDING_REAPPROVAL",
    });
    expect(published.workflow.issues[0]?.resumeTarget).toBe(resumeTarget);
  },
);
it.each([false, true])(
  "allows notes-only or explicit floor-clear intent with unavailable catalog, clear=%s",
  async (clearFloor) => {
    transport.order.mockResolvedValue(detail({ retainedFloor: true }));
    transport.submit.mockImplementation(
      (
        _order: string,
        _piece: string,
        _issue: string,
        body: SubmitContactBody,
      ) => {
        transport.order.mockResolvedValue(
          detail({
            version: body.expectedVersion + 1,
            body,
            retainedFloor: true,
          }),
        );
        return Promise.resolve(saved(body));
      },
    );
    transport.catalog.mockRejectedValue(new Error("Catalog unavailable"));
    mount();
    const notes = await screen.findByLabelText(
      "ملاحظات تواصل المبيعات مع العميل *:",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("المقاس:")).toBeDisabled(),
    );
    expect(
      screen.getByText("المحفوظ: Retained inactive floor"),
    ).toBeInTheDocument();
    if (clearFloor)
      fireEvent.click(screen.getByRole("button", { name: "مسح الأرضية" }));
    fireEvent.change(notes, {
      target: {
        value: "Customer confirmed without selecting a new catalog item",
      },
    });
    const submit = screen.getByRole("button", {
      name: "إرسال المقترح للاعتماد",
    });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(
      await screen.findByText("تم الحفظ؛ تعذر تحديث العرض الحالي."),
    ).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(transport.submit).toHaveBeenCalledWith(
      p03Ids.order,
      p03Ids.piece,
      p03Ids.source,
      expect.objectContaining({
        kind: "AMEND",
        changes: clearFloor ? { sole: null } : {},
      }),
    );
  },
);
it("requires explicit request confirmation and sends no amendment fields with cancellation", async () => {
  mount();
  const notes = await screen.findByLabelText(
    "ملاحظات تواصل المبيعات مع العميل *:",
  );
  expect(screen.getByText("الوجهة المحفوظة:").parentElement).toHaveTextContent(
    "الوجهة المحفوظة: الإنتاج",
  );
  expect(screen.getAllByRole("combobox")).toHaveLength(4);
  fireEvent.change(notes, {
    target: { value: "Customer asks approval to cancel this piece" },
  });
  fireEvent.click(screen.getByRole("button", { name: "طلب إلغاء القطعة" }));
  const confirmation = await screen.findByRole("alertdialog", {
    name: "طلب إلغاء القطعة",
  });
  expect(transport.submit).not.toHaveBeenCalled();
  fireEvent.click(within(confirmation).getByRole("button", { name: "تراجع" }));
  expect(transport.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "طلب إلغاء القطعة" }));
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "تأكيد طلب الإلغاء",
    }),
  );
  await waitFor(() => {
    expect(close).toHaveBeenCalledTimes(1);
  });
  const rawBody: unknown = transport.submit.mock.calls[0]?.[3];
  const body = submitContactBodySchema.parse(rawBody);
  expect(transport.submit).toHaveBeenCalledWith(
    p03Ids.order,
    p03Ids.piece,
    p03Ids.source,
    {
      commandId: body.commandId,
      expectedVersion: 2,
      kind: "CANCEL_REQUEST",
      contactNotes: "Customer asks approval to cancel this piece",
    },
  );
  expect(body).not.toHaveProperty("changes");
});
it("keeps broader ADMIN inspection read-only for another immutable owner even with a response hint", async () => {
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: {
      ...p03Session().user,
      role: "ADMIN",
      department: null,
      staffApprovedAt: null,
    },
  });
  transport.order.mockResolvedValue(detail({ otherOwner: true }));
  mount();
  expect(
    await screen.findByText(
      "هذه القطعة غير متاحة لاستجابة هذا الحساب؛ يلزم مالك الطلب وحالة تواصل حالية.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByLabelText("ملاحظات تواصل المبيعات مع العميل *:"),
  ).not.toBeInTheDocument();
  expect(transport.catalog).not.toHaveBeenCalled();
  expect(transport.submit).not.toHaveBeenCalled();
});
it("retains dirty selections through catalog failure/retry and disables a newer authored order version", async () => {
  mount();
  const size = await screen.findByLabelText("المقاس:");
  await waitFor(() => expect(size).toBeEnabled());
  fireEvent.change(size, { target: { value: sizeId } });
  const notes = screen.getByLabelText("ملاحظات تواصل المبيعات مع العميل *:");
  fireEvent.change(notes, { target: { value: "Retained contact draft" } });
  const sales = readOperationalScope(client),
    scope = readP04OperationalScope(client, "SALES_CONTACT");
  if (!sales || !scope) throw new Error("Missing scope");
  transport.catalog.mockRejectedValue(new Error("Refresh failed"));
  await act(async () => {
    await client.refetchQueries({ queryKey: catalogKeys.active(sales) });
  });
  expect(size).toHaveValue(sizeId);
  expect(notes).toHaveValue("Retained contact draft");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "إرسال المقترح للاعتماد" }),
    ).toBeDisabled(),
  );
  transport.catalog.mockResolvedValue(catalog);
  fireEvent.click(screen.getByRole("button", { name: "تحديث الكتالوج" }));
  await waitFor(() => expect(size).toBeEnabled());
  act(() => {
    client.setQueryData(
      salesContactKeys.order(scope, p03Ids.order),
      detail({ version: 3, resumeTarget: "CUTTING" }),
    );
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "إرسال المقترح للاعتماد" }),
    ).toBeDisabled(),
  );
  expect(notes).toHaveValue("Retained contact draft");
  expect(screen.getByText("الوجهة المحفوظة:").parentElement).toHaveTextContent(
    "الوجهة المحفوظة: الإنتاج",
  );
  expect(transport.submit).not.toHaveBeenCalled();
});
it("maps only known nested change errors and preserves request identity and entered notes", async () => {
  transport.submit.mockRejectedValue(
    new AxiosError("Invalid", undefined, undefined, undefined, {
      status: 400,
      statusText: "Invalid",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Review the selected size",
        requestId: "contact-request",
        errors: [
          {
            field: "body.changes.size",
            message: "Select a matching entry from the active catalog.",
          },
          { field: "body.changes.decoration", message: "Unsupported" },
        ],
      },
    }),
  );
  mount();
  const size = await screen.findByLabelText("المقاس:");
  await waitFor(() => expect(size).toBeEnabled());
  fireEvent.change(size, { target: { value: sizeId } });
  const notes = screen.getByLabelText("ملاحظات تواصل المبيعات مع العميل *:");
  fireEvent.change(notes, { target: { value: "Keep these customer notes" } });
  fireEvent.click(
    screen.getByRole("button", { name: "إرسال المقترح للاعتماد" }),
  );
  expect(
    await screen.findByText("اختر قيمة مطابقة من القائمة المعتمدة."),
  ).toBeInTheDocument();
  expect(screen.getByText(/contact-request/)).toBeInTheDocument();
  expect(notes).toHaveValue("Keep these customer notes");
  expect(close).not.toHaveBeenCalled();
});
it("retains the exact unknown contact command after closing the modal", async () => {
  transport.submit.mockRejectedValue(new Error("Lost response"));
  const view = mount();
  fireEvent.change(
    await screen.findByLabelText("ملاحظات تواصل المبيعات مع العميل *:"),
    { target: { value: "Frozen customer confirmation" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "إرسال المقترح للاعتماد" }),
  );
  expect(
    await screen.findByText(
      "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
    ),
  ).toBeInTheDocument();
  view.rerender(
    <QueryClientProvider client={client}>
      <ApprovalCommandRecovery
        orderId={p03Ids.order}
        capability="SALES_CONTACT"
      />
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: "إعادة نفس العملية" }),
  ).toBeInTheDocument();
  expect(transport.submit).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});
