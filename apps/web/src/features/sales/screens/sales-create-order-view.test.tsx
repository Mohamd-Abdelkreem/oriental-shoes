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
  createDraftBodySchema,
  saveDraftBodySchema,
  draftSchema,
  draftCommandDataSchema,
  type DraftDto,
  type DraftCommandData,
  type DraftCapture,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { draftKeys } from "../hooks/drafts.hooks";
import { readOperationalScope } from "@/shared/query/operational-scope";
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
  new AxiosError<unknown>("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
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
    customer: null,
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
const readDraft = (url: string) => {
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
  if (url.startsWith("/customers/by-phone/"))
    throw failure(404, "CUSTOMER_NOT_FOUND");
  throw new Error(`Unexpected read ${url}`);
};
beforeEach(() => {
  vi.resetAllMocks();
  current = undefined;
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
  mocks.get.mockImplementation(readDraft);
  mocks.post.mockImplementation((_url: string, body: unknown) => accept(body));
  mocks.put.mockImplementation((_url: string, body: unknown) =>
    accept(body, true),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("saves a blank optional draft once from either Save, locks pending, keeps navigation locked, then edits the same saved identity", async () => {
  let release: () => void = () => {
    throw new Error("Response not initialized");
  };
  mocks.post.mockImplementationOnce((_url: string, body: unknown) => {
    const reply = accept(body);
    return new Promise<ReturnType<typeof response>>((resolve) => {
      release = () => {
        resolve(reply);
      };
    });
  });
  const rendered = mount();
  expect(screen.getByDisplayValue("Actual Sales")).toBeDisabled();
  expect(screen.getByRole("button", { name: "إرسال للاعتماد" })).toBeDisabled();
  const saves = screen.getAllByRole("button", { name: "حفظ كمسودة" });
  fireEvent.click(required(saves[0]));
  fireEvent.click(required(saves[1]));
  await waitFor(() => {
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  const sent = createDraftBodySchema.parse(mocks.post.mock.calls[0]?.[1]);
  expect(sent.draft).toMatchObject({
    type: "SHOP",
    customerId: null,
    deliveryDate: null,
    paidAmount: null,
    generalNotes: null,
  });
  expect(sent.draft.pieces).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "+ إضافة قطعة جديدة" }),
  ).toBeDisabled();
  act(() => {
    release();
  });
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledWith(`/sales/orders/new?edit=${id}`);
  });
  // The old new-draft editor must not accept input that navigation would discard.
  expect(
    screen.getByRole("button", { name: "+ إضافة قطعة جديدة" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("textbox", { name: "الملاحظات العامة" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "+ إضافة قطعة جديدة" }));
  expect(
    screen.queryByRole("button", { name: "تكرار" }),
  ).not.toBeInTheDocument();
  rendered.rerender(
    <QueryClientProvider client={client}>
      <SalesCreateOrderView entry={{ kind: "edit", draftId: id }} />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "+ إضافة قطعة جديدة" }),
    ).toBeEnabled(),
  );
  expect(screen.getAllByRole("button", { name: "تكرار" })).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("الملاحظات العامة"), {
    target: { value: "After synchronized reset" },
  });
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[1]),
  );
  await waitFor(() => {
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
  expect(saveDraftBodySchema.parse(mocks.put.mock.calls[0]?.[1])).toMatchObject(
    { expectedVersion: 1, draft: { generalNotes: "After synchronized reset" } },
  );
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await screen.findByText(/تم حفظ المسودة/u);
});
it.each<DraftEditorEntry>([
  { kind: "invalid", reason: "INVALID_DRAFT_REFERENCE" },
  { kind: "edit", draftId: id },
])(
  "never turns invalid or missing edit into a new writable draft: %j",
  async (entry) => {
    mount(entry);
    await waitFor(() => {
      expect(screen.queryByText(/جارٍ تحميل/u)).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "حفظ كمسودة" }),
    ).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  },
);
it("keeps optional missing customer prefill unselected and permits explicit blank save", async () => {
  mount({
    kind: "new",
    customerPrefill: { kind: "phone", phone: "+966500000001" },
  });
  await screen.findByText(/تعذّر تحديد العميل المطلوب/u);
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await waitFor(() => {
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(current?.customer).toBeNull();
  });
  expect(
    createDraftBodySchema.parse(mocks.post.mock.calls[0]?.[1]).draft.customerId,
  ).toBeNull();
});
it("cancels an unsent actual inline dialog with paper intact and restores its trigger focus", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("الملاحظات العامة"), {
    target: { value: "Keep this paper" },
  });
  const trigger = screen.getByRole("button", { name: /إنشاء عميل/u });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/اسم العميل/u), {
    target: { value: "Unsent" },
  });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Keep this paper",
  );
  await waitFor(() => {
    expect(trigger).toHaveFocus();
  });
  expect(mocks.post).not.toHaveBeenCalled();
});
it("retains rejected draft input and requires explicit review after a version conflict", async () => {
  const seed = createDraftBodySchema.parse({
    commandId: crypto.randomUUID(),
    draft: { type: "SHOP", pieces: [{ id: crypto.randomUUID() }] },
  });
  accept(seed);
  mocks.put.mockRejectedValueOnce(failure(409, "DRAFT_VERSION_CONFLICT"));
  mount({ kind: "edit", draftId: id });
  fireEvent.change(await screen.findByLabelText("الملاحظات العامة"), {
    target: { value: "Losing edit stays" },
  });
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await screen.findByRole("button", { name: "إعادة التحميل والمراجعة" });
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Losing edit stays",
  );
  expect(
    screen.getAllByRole("button", { name: "حفظ كمسودة" })[0],
  ).toBeDisabled();
  expect(mocks.post).not.toHaveBeenCalled();
});

it("copies all sixteen captures with a new physical identity, removes by identity, and reopens the confirmed sequence", async () => {
  const p1 = "33333333-3333-4333-8333-333333333333",
    p2 = "44444444-4444-4444-8444-444444444444";
  const fields = {
    model: "P1",
    size: "42",
    leatherBase: "L1",
    decoration: "D1",
    decorationColor: "DC1",
    faceRight: "M1",
    faceLeft: "M2",
    mixing: "M3",
    face: "Face",
    sole: "Sole",
    soleAddition: "Middle addition",
    soleColor: "SC",
    additions: "Final addition",
    aField: "A1",
    fField: "F1",
    sideNotes: "Side note",
  };
  accept({
    commandId: crypto.randomUUID(),
    draft: {
      type: "SHOP",
      pieces: [
        { id: p1, ...fields },
        { id: p2, model: "P2", face: "Other face" },
      ],
    },
  });
  const rendered = mount({ kind: "edit", draftId: id });
  fireEvent.change(await screen.findByLabelText("م١ — P1"), {
    target: { value: "Edited M1" },
  });
  fireEvent.change(screen.getByLabelText("الوجه — P2"), {
    target: { value: "Edited P2" },
  });
  fireEvent.click(
    required(screen.getAllByTitle("تكرار هذه القطعة وإضافتها كقطعة جديدة")[0]),
  );
  expect(screen.getAllByRole("button", { name: "تكرار" })).toHaveLength(3);
  fireEvent.click(
    required(screen.getAllByTitle("حذف هذه القطعة من المسودة")[2]),
  );
  expect(screen.getAllByRole("button", { name: "تكرار" })).toHaveLength(2);
  expect(screen.getByText(/غير محفوظ/u)).toBeInTheDocument();
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await screen.findByText(/تم حفظ المسودة بنجاح/u);
  const saved = saveDraftBodySchema.parse(mocks.put.mock.calls[0]?.[1]).draft;
  expect(saved.pieces[0]).toEqual({
    id: p1,
    ...fields,
    faceRight: "Edited M1",
  });
  expect(saved.pieces[1]).toEqual({
    ...saved.pieces[0],
    id: saved.pieces[1]?.id,
  });
  expect(saved.pieces[1]?.id).not.toBe(p1);
  expect(saved.pieces[1]?.id).not.toBe(p2);
  expect(saved.pieces.some((piece) => piece.id === p2)).toBe(false);
  rendered.unmount();
  mount({ kind: "edit", draftId: id });
  expect(await screen.findAllByLabelText("م١ — P1")).toHaveLength(2);
  expect(screen.queryByLabelText("الوجه — P2")).not.toBeInTheDocument();
  fireEvent.click(
    required(screen.getAllByTitle("حذف هذه القطعة من المسودة")[1]),
  );
  expect(
    screen.queryByTitle("حذف هذه القطعة من المسودة"),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "حذف آخر قطعة" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "+ إضافة قطعة جديدة" }));
  expect(screen.getAllByRole("button", { name: "تكرار" })).toHaveLength(2);
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await waitFor(() => {
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });
  const added = saveDraftBodySchema.parse(mocks.put.mock.calls[1]?.[1]).draft
    .pieces;
  expect(added[0]?.id).toBe(p1);
  expect(added[1]).toMatchObject({
    model: null,
    size: null,
    soleAddition: null,
    additions: null,
  });
  expect(added[1]?.id).not.toBe(saved.pieces[1]?.id);
  await screen.findByText(/تم حفظ المسودة بنجاح/u);
});

it("keeps pending row actions locked and associates a nested rejection with the submitted physical piece", async () => {
  accept({
    commandId: crypto.randomUUID(),
    draft: {
      type: "SHOP",
      pieces: [
        { id: crypto.randomUUID(), model: "First" },
        { id: crypto.randomUUID(), model: "Second" },
      ],
    },
  });
  let rejectWrite: (reason: unknown) => void = () => {
    throw new Error("Uninitialized response");
  };
  mocks.put.mockImplementationOnce(
    () =>
      new Promise<never>((_resolve, reject) => {
        rejectWrite = reject;
      }),
  );
  mount({ kind: "edit", draftId: id });
  await screen.findByLabelText("م١ — First");
  fireEvent.change(screen.getByLabelText("م١ — Second"), {
    target: { value: "Keep second value" },
  });
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await waitFor(() => {
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
  expect(
    screen.queryByTitle("تكرار هذه القطعة وإضافتها كقطعة جديدة"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "+ إضافة قطعة جديدة" }),
  ).toBeDisabled();
  const error = failure(400, "VALIDATION_ERROR");
  if (error.response === undefined) throw new Error("Missing test response");
  error.response.data = {
    success: false,
    statusCode: 400,
    code: "VALIDATION_ERROR",
    message: "Invalid capture",
    requestId: "safe-request",
    timestamp: instant,
    path: "/api/v1/sales-drafts",
    errors: [
      { field: "body.draft.pieces.1.faceRight", message: "Review second M1" },
      { field: "body.draft.pieces.0.unitPrice", message: "Unsupported" },
    ],
  };
  act(() => {
    rejectWrite(error);
  });
  const second = await screen.findByLabelText("م١ — Second");
  expect(second).toHaveValue("Keep second value");
  expect(second).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("م١ — First")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  expect(second).toHaveAccessibleDescription("يرجى مراجعة القيمة المدخلة.");
  expect(screen.queryByText("Unsupported")).not.toBeInTheDocument();
});

it("preserves dirty paper through a background detail read failure and retry", async () => {
  accept({
    commandId: crypto.randomUUID(),
    draft: { type: "SHOP", pieces: [{ id: crypto.randomUUID() }] },
  });
  mount({ kind: "edit", draftId: id });
  const notes = await screen.findByLabelText("الملاحظات العامة");
  fireEvent.change(notes, { target: { value: "Dirty paper must survive" } });
  const scope = readOperationalScope(client);
  if (scope === null) throw new Error("Missing scope");
  mocks.get.mockRejectedValueOnce(failure(503, "HTTP_ERROR"));
  await act(async () => {
    await client.invalidateQueries({
      queryKey: draftKeys.detail(scope, id),
      exact: true,
    });
  });
  await screen.findByRole("alert");
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Dirty paper must survive",
  );
  expect(mocks.put).not.toHaveBeenCalled();
  mocks.get.mockImplementation(readDraft);
  fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة التحديث" }));
  await waitFor(() => {
    expect(client.isFetching()).toBe(0);
  });
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Dirty paper must survive",
  );
});
it("retains a lost draft write through absent receipt and identical retry without creating another draft", async () => {
  let result: DraftCommandData | undefined;
  mocks.post.mockImplementationOnce((_url: string, body: unknown) => {
    const reply = accept(body);
    result = draftCommandDataSchema.parse(reply.data.data);
    throw new AxiosError("Lost reply");
  });
  mocks.post.mockImplementationOnce((_url: string, _body: unknown) => {
    if (result === undefined) throw new Error("Missing committed result");
    return response({ ...result, replayed: true });
  });
  mocks.get.mockImplementation((url: string) => {
    if (url.startsWith("/sales-commands/")) {
      throw failure(404, "SALES_COMMAND_NOT_FOUND");
    }
    return readDraft(url);
  });
  mount();
  fireEvent.change(screen.getByLabelText("الملاحظات العامة"), {
    target: { value: "Frozen lost draft" },
  });
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "التحقق من الحفظ" }),
  );
  await screen.findByText(/لم تظهر نتيجة محفوظة/u);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة محاولة الحفظ نفسه" }),
  );
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(mocks.post.mock.calls[1]?.[1]).toEqual(mocks.post.mock.calls[0]?.[1]);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(current?.version).toBe(1);
  expect(current?.generalNotes).toBe("Frozen lost draft");
});
