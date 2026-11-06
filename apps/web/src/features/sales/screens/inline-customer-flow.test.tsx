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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  createCustomerBodySchema,
  customerSchema,
  customerCommandDataSchema,
  type CustomerDto,
  type CustomerCommandData,
  createDraftBodySchema,
  saveDraftBodySchema,
  draftSchema,
  draftCommandDataSchema,
  type DraftDto,
  type DraftCapture,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { SalesCreateOrderView } from "./sales-create-order-view";
import type { DraftEditorEntry } from "../model/draft-form.model";

const required = <T,>(element: T | null | undefined): T => {
  if (element === null || element === undefined)
    throw new Error("Expected rendered control");
  return element;
};
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: mocks.get, post: mocks.post, put: mocks.put },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
let current: DraftDto | undefined;
let customer: CustomerDto | undefined;
let receipt: CustomerCommandData | undefined;
let receiptMissing = false;
let failCustomer = false;
const response = (data: unknown) => ({
  data: {
    success: true,
    statusCode: 200,
    message: "OK",
    requestId: "safe-request",
    timestamp: instant,
    path: "/api/v1/sales-drafts",
    data,
  },
});
const failure = (status: number, code: string) =>
  new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "Could not complete",
      requestId: "safe-request",
      timestamp: instant,
      path: "/api/v1/sales-drafts",
    },
  });
const accept = (raw: unknown, update = false) => {
  const body = update
    ? saveDraftBodySchema.parse(raw)
    : createDraftBodySchema.parse(raw);
  const capture: DraftCapture = body.draft;
  const headers = {
    type: capture.type,
    deliveryDate: capture.deliveryDate,
    generalNotes: capture.generalNotes,
    responsibleSignature: capture.responsibleSignature,
    repairNote: capture.repairNote,
    adjustmentRequested: capture.adjustmentRequested,
    adjustmentReason: capture.adjustmentReason,
    adjustmentActionTaken: capture.adjustmentActionTaken,
    paidAmount: capture.paidAmount,
  };
  current = draftSchema.parse({
    ...headers,
    id,
    version: (current?.version ?? 0) + 1,
    status: "DRAFT",
    owner: { id: actor, fullName: "Actual Sales" },
    customer:
      capture.customerId === customer?.id
        ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
          }
        : null,
    pieces: capture.pieces.map((piece, index) => ({
      ...piece,
      position: index + 1,
      quantity: 1,
    })),
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
  });
  return response(
    draftCommandDataSchema.parse({
      kind: "draft",
      savedDraft: current,
      replayed: false,
      receipt: {
        commandId: body.commandId,
        operation: update ? "SAVE_DRAFT" : "CREATE_DRAFT",
        resourceId: id,
        actor: {
          id: actor,
          fullName: "Actual Sales",
          role: "USER",
          department: "SALES",
        },
        beforeVersion: update ? current.version - 1 : null,
        afterVersion: current.version,
        occurredAt: instant,
      },
    }),
  );
};
const mount = (
  entry: DraftEditorEntry = { kind: "new", customerPrefill: { kind: "none" } },
) =>
  render(
    <QueryClientProvider client={client}>
      <SalesCreateOrderView entry={entry} />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  current = undefined;
  customer = undefined;
  receipt = undefined;
  receiptMissing = false;
  failCustomer = false;
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, actor);
  client.setDefaultOptions({
    queries: { retry: false, staleTime: 30000 },
    mutations: { retry: false },
  });
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: {
        id: actor,
        fullName: "Actual Sales",
        email: "sales@example.test",
        phone: null,
        role: "USER",
        status: "ACTIVE",
        department: "SALES",
        staffApprovedAt: instant,
        emailVerifiedAt: instant,
        accessVersion: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    }),
  );
  mocks.get.mockImplementation((url: string) => {
    if (customer !== undefined && url === `/customers/${customer.id}`) {
      if (failCustomer) throw failure(503, "HTTP_ERROR");
      return response(customerDetail());
    }
    if (url.startsWith("/sales-commands/")) {
      if (receiptMissing || receipt === undefined)
        throw failure(404, "SALES_COMMAND_NOT_FOUND");
      return response({ ...receipt, replayed: true });
    }
    if (url === "/customers")
      return response({
        customers: [],
        totalCustomers: 0,
        pagination: {
          page: 1,
          limit: 25,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    if (url === `/sales-drafts/${id}`) {
      if (current === undefined) throw failure(404, "SALES_DRAFT_NOT_FOUND");
      return response({ draft: current });
    }
    if (url.startsWith("/customers/by-phone/")) {
      if (customer === undefined) throw failure(404, "CUSTOMER_NOT_FOUND");
      return response(customerDetail());
    }
    throw new Error(`Unexpected read ${url}`);
  });
  mocks.post.mockImplementation((url: string, body: unknown) =>
    url === "/customers" ? acceptCustomer(body) : accept(body),
  );
  mocks.put.mockImplementation((_url: string, body: unknown) =>
    accept(body, true),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const customerDetail = () => ({
  customer,
  draftCount: 0,
  latestDraftAt: null,
  latestMeasurement: null,
  submittedHistory: {
    availability: "not_available",
    reason: "P03_NOT_IMPLEMENTED",
  },
});
const acceptCustomer = (raw: unknown) => {
  const body = createCustomerBodySchema.parse(raw);
  customer = customerSchema.parse({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Actual normalized C",
    phone: "+966500000001",
    email: null,
    address: null,
    notes: null,
    version: 1,
    createdAt: instant,
    updatedAt: instant,
  });
  receipt = customerCommandDataSchema.parse({
    kind: "customer",
    savedCustomer: customer,
    replayed: false,
    receipt: {
      commandId: body.commandId,
      operation: "CREATE_CUSTOMER",
      resourceId: customer.id,
      actor: {
        id: actor,
        fullName: "Actual Sales",
        role: "USER",
        department: "SALES",
      },
      beforeVersion: null,
      afterVersion: 1,
      occurredAt: instant,
    },
  });
  return response(receipt);
};
const open = () => {
  fireEvent.click(screen.getByRole("button", { name: /إنشاء عميل/u }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByLabelText(/اسم العميل/u), {
    target: { value: "Raw typed name" },
  });
  fireEvent.change(dialog.getByLabelText(/رقم الهاتف/u), {
    target: { value: "٠٥٠٠٠٠٠٠٠١" },
  });
  return dialog;
};
const writeCustomer = () =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "حفظ وربط بالطلب",
    }),
  );
it("selects synchronized C in the unchanged actual paper and only explicit Save writes the draft", async () => {
  const rendered = mount();
  fireEvent.change(screen.getByLabelText("الملاحظات العامة"), {
    target: { value: "Original paper" },
  });
  fireEvent.change(screen.getByLabelText("توقيع المسؤول"), {
    target: { value: "Original signature" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /^م١ —/u }), {
    target: { value: "Original row capture" },
  });
  open();
  writeCustomer();
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Original paper",
  );
  expect(screen.getByLabelText("توقيع المسؤول")).toHaveValue(
    "Original signature",
  );
  expect(screen.getByRole("textbox", { name: /^م١ —/u })).toHaveValue(
    "Original row capture",
  );
  expect(screen.getByText("Actual normalized C")).toBeInTheDocument();
  expect(mocks.post.mock.calls.map((call: unknown[]) => call[0])).toEqual([
    "/customers",
  ]);
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  expect(
    createDraftBodySchema.parse(
      mocks.post.mock.calls.find((call) => call[0] === "/sales-drafts")?.[1],
    ).draft,
  ).toMatchObject({
    customerId: customer?.id,
    generalNotes: "Original paper",
    responsibleSignature: "Original signature",
  });
  expect(
    createDraftBodySchema.parse(
      mocks.post.mock.calls.find((call) => call[0] === "/sales-drafts")?.[1],
    ).draft.pieces[0]?.faceRight,
  ).toBe("Original row capture");
  expect(screen.getByRole("button", { name: /إنشاء عميل/u })).toBeDisabled();
  rendered.rerender(
    <QueryClientProvider client={client}>
      <SalesCreateOrderView entry={{ kind: "edit", draftId: id }} />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /إنشاء عميل/u })).toBeEnabled();
  });
});
it("cancels without writes and requires an explicit existing duplicate choice", async () => {
  mount();
  open();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "إلغاء" }),
  );
  expect(mocks.post).not.toHaveBeenCalled();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /إنشاء عميل/u })).toHaveFocus();
  });
  acceptCustomer({
    commandId: crypto.randomUUID(),
    customer: { name: "Existing", phone: "0500000001" },
  });
  open();
  const choose = await screen.findByRole("button", {
    name: "اختيار هذا العميل",
  });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(choose);
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(screen.getByText("Actual normalized C")).toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
});
it("preserves dialog/paper on duplicate rejection without silently replacing a selection", async () => {
  acceptCustomer({
    commandId: crypto.randomUUID(),
    customer: { name: "Previously selected", phone: "0500000001" },
  });
  mount({
    kind: "new",
    customerPrefill: { kind: "phone", phone: "+966500000001" },
  });
  await screen.findByText("Actual normalized C");
  fireEvent.change(screen.getByLabelText("الملاحظات العامة"), {
    target: { value: "Keep paper" },
  });
  open();
  mocks.post.mockRejectedValueOnce(failure(409, "CUSTOMER_PHONE_CONFLICT"));
  writeCustomer();
  await screen.findByText(/رقم الهاتف مسجل بالفعل؛/u);
  expect(
    within(screen.getByRole("dialog")).getByLabelText(/اسم العميل/u),
  ).toHaveValue("Raw typed name");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(mocks.put).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "إلغاء" }),
  );
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue("Keep paper");
  expect(screen.getByText("Actual normalized C")).toBeInTheDocument();
});
it("locks pending creation, retains a lost reply through receipt404, and observes the original result without another create", async () => {
  receiptMissing = true;
  let release: () => void = () => {
    throw new Error("Uninitialized response");
  };
  mocks.post.mockImplementationOnce((_url: string, raw: unknown) => {
    acceptCustomer(raw);
    return new Promise<never>((_resolve, reject) => {
      release = () => {
        reject(new AxiosError("Lost reply"));
      };
    });
  });
  mount();
  open();
  writeCustomer();
  await waitFor(() => {
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  expect(
    within(screen.getByRole("dialog")).getByLabelText(/اسم العميل/u),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "+ إضافة قطعة جديدة" }),
  ).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  act(() => {
    release();
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "التحقق من الحفظ" }),
  );
  await screen.findByText(/لم تظهر نتيجة محفوظة بعد/u);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  receiptMissing = false;
  fireEvent.click(screen.getByRole("button", { name: "التحقق من الحفظ" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(screen.getByText("Actual normalized C")).toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("retains confirmed creation across readback failure and refreshes with zero extra writes", async () => {
  failCustomer = true;
  mount();
  open();
  writeCustomer();
  const refresh = await screen.findByRole("button", { name: "تحديث العرض" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledTimes(1);
  failCustomer = false;
  fireEvent.click(refresh);
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(screen.getByText("Actual normalized C")).toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("does not select or navigate in a replacement paper after a late successful reply", async () => {
  let release: () => void = () => {
    throw new Error("Uninitialized response");
  };
  mocks.post.mockImplementationOnce((_url: string, raw: unknown) => {
    const reply = acceptCustomer(raw);
    return new Promise<ReturnType<typeof response>>((resolve) => {
      release = () => {
        resolve(reply);
      };
    });
  });
  const first = mount();
  open();
  writeCustomer();
  await waitFor(() => {
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  first.unmount();
  mount();
  act(() => {
    release();
  });
  await waitFor(() => {
    expect(client.isMutating()).toBe(0);
  });
  expect(screen.queryByText("Actual normalized C")).not.toBeInTheDocument();
  expect(screen.queryByText(/تم حفظ العميل/u)).not.toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  expect(
    createDraftBodySchema.parse(
      mocks.post.mock.calls.find((call) => call[0] === "/sales-drafts")?.[1],
    ).draft.customerId,
  ).toBeNull();
});
