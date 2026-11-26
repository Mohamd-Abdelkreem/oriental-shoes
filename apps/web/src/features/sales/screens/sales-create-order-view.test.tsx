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
  salesOrderSchema,
  salesOrderCommandDataSchema,
  submitOrderBodySchema,
  resubmitOrderBodySchema,
  customerSchema,
  catalogQuoteBodySchema,
  catalogQuoteDataSchema,
  type CatalogQuoteBody,
  authUserDataSchema,
  createDraftBodySchema,
  saveDraftBodySchema,
  draftSchema,
  draftCommandDataSchema,
  type DraftDto,
  type DraftCommandData,
  type DraftCapture,
  type CatalogData,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { catalogFixture, orderFixture, p03Ids } from "@/test/p03-fixtures";
import { orderKeys } from "../hooks/orders.hooks";
import { readOperationalScope } from "@/shared/query/operational-scope";
import { createQueryClient } from "@/shared/query/query-client";
import { ToastProvider } from "@/components/toast";
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
let quoteFingerprint = "a".repeat(64);
let currentCatalog: CatalogData = {
  availability: "unavailable",
  reason: "CATALOG_NOT_LOADED",
};
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
const quoted = (raw: unknown) => {
  const body = catalogQuoteBodySchema.parse(raw);
  const prices: Readonly<Record<string, string>> = {
    "زبيري - z": "1800.00",
    "نعام - O": "1500.00",
    "سادة - S": "650.00",
  };
  const items = body.pieces.map((piece) => {
    const entry =
      currentCatalog.availability === "available"
        ? currentCatalog.entries.find(
            (entry) =>
              entry.kind === "decoration" &&
              entry.displayValue === piece.decoration &&
              (piece.catalogSelections?.decoration == null ||
                entry.id === piece.catalogSelections.decoration),
          )
        : undefined;
    const price =
      piece.decoration === null ? undefined : prices[piece.decoration];
    return entry === undefined || price === undefined
      ? {
          pieceId: piece.id,
          availability: "unavailable" as const,
          reason:
            piece.decoration === null
              ? ("DECORATION_REQUIRED" as const)
              : ("DECORATION_UNKNOWN" as const),
        }
      : {
          pieceId: piece.id,
          availability: "available" as const,
          decorationEntryId: entry.id,
          decoration: entry.displayValue,
          unitPrice: price,
        };
  });
  const priced = items.filter((item) => item.availability === "available");
  let sum = 0n;
  for (const item of priced) sum += BigInt(item.unitPrice.replace(".", ""));
  return response(
    catalogQuoteDataSchema.parse(
      priced.length === items.length &&
        currentCatalog.availability === "available"
        ? {
            availability: "available",
            requestId: body.requestId,
            sourceId: currentCatalog.sourceId,
            fingerprint: quoteFingerprint,
            items: priced,
            total: `${String(sum / 100n)}.${String(sum % 100n).padStart(2, "0")}`,
          }
        : {
            availability: "unavailable",
            requestId: body.requestId,
            sourceId:
              currentCatalog.availability === "available"
                ? currentCatalog.sourceId
                : null,
            fingerprint: null,
            total: null,
            items,
          },
    ),
  );
};
const mount = (
  entry: DraftEditorEntry = { kind: "new", customerPrefill: { kind: "none" } },
) =>
  render(
    <QueryClientProvider client={client}>
      <SalesCreateOrderView entry={entry} />
    </QueryClientProvider>,
    { wrapper: ToastProvider },
  );
const readDraft = (url: string) => {
  if (url === "/catalogs") return response(currentCatalog);
  if (url === `/sales-order-editor/${id}`) {
    if (current === undefined) throw failure(404, "ORDER_NOT_FOUND");
    return response({ kind: "draft", draft: current });
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
  if (url.startsWith("/customers/by-phone/"))
    throw failure(404, "CUSTOMER_NOT_FOUND");
  throw new Error(`Unexpected read ${url}`);
};
beforeEach(() => {
  vi.resetAllMocks();
  current = undefined;
  quoteFingerprint = "a".repeat(64);
  currentCatalog = {
    availability: "unavailable",
    reason: "CATALOG_NOT_LOADED",
  };
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
  mocks.post.mockImplementation((url: string, body: unknown) =>
    url === "/catalogs/quotes" ? quoted(body) : accept(body),
  );
  mocks.put.mockImplementation((_url: string, body: unknown) =>
    accept(body, true),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("keeps an untouched paper quiet and explains missing customer on each submit attempt without writing", async () => {
  currentCatalog = catalogFixture();
  mount();
  await waitFor(() => {
    expect(mocks.post).toHaveBeenCalledWith(
      "/catalogs/quotes",
      expect.anything(),
      expect.anything(),
    );
  });
  await waitFor(() => {
    expect(client.isFetching()).toBe(0);
  });
  expect(
    screen.queryByText(/السعر غير متاح لبعض القطع/u),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "إرسال للاعتماد" });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  const notices = screen.getByLabelText("قائمة الإشعارات");
  expect(await within(notices).findByRole("alert")).toHaveTextContent(
    "اختر عميلاً أو أنشئ عميلاً جديداً قبل الإرسال.",
  );
  fireEvent.click(submit);
  await waitFor(() => {
    expect(within(notices).getAllByRole("alert")).toHaveLength(2);
  });
  expect(
    mocks.post.mock.calls.every(([url]) => url === "/catalogs/quotes"),
  ).toBe(true);
  expect(mocks.put).not.toHaveBeenCalled();
});
it.each(["loading", "unavailable"] as const)(
  "does not announce unavailable catalogs/pricing on an untouched editor while catalog is %s",
  async (state) => {
    let release: (() => void) | undefined;
    mocks.get.mockImplementation((url: string) => {
      if (url === "/catalogs" && state === "loading")
        return new Promise((resolve) => {
          release = () => {
            resolve(response(currentCatalog));
          };
        });
      return readDraft(url);
    });
    mount();
    await waitFor(() => {
      expect(mocks.get.mock.calls.some(([url]) => url === "/catalogs")).toBe(
        true,
      );
    });
    expect(
      screen.queryByText(/القوائم لم تُفعّل بعد/u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/السعر غير متاح لبعض القطع/u),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => {
      release?.();
    });
    await waitFor(() => {
      expect(client.isFetching()).toBe(0);
    });
  },
);

it("keeps a failed customer search distinct from an empty directory while showing toast recovery", async () => {
  mocks.get.mockImplementation((url: string) => {
    if (url === "/customers") throw failure(503, "HTTP_ERROR");
    return readDraft(url);
  });
  mount();
  fireEvent.change(screen.getByLabelText("رقم الهاتف أو اسم العميل:"), {
    target: { value: "Customer search" },
  });
  const notice = await screen.findByRole("alert");
  expect(notice).toHaveTextContent("تعذّر تحميل بيانات العملاء");
  expect(notice).toHaveTextContent("safe-request");
  expect(screen.queryByText(/لا توجد نتائج مطابقة/u)).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "إعادة محاولة تحميل العملاء" }),
  ).toBeEnabled();
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
  expect(screen.getByRole("button", { name: "إرسال للاعتماد" })).toBeEnabled();
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
  expect(await screen.findAllByText(/تم حفظ المسودة/u)).toHaveLength(2);
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
it("restores the inline dialog trigger after a previous submission error without losing the paper", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "إرسال للاعتماد" }));
  await screen.findByRole("alert");
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
  current = draftSchema.parse({
    ...current,
    version: 2,
    generalNotes: "Winner without a customer",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة التحميل والمراجعة" }),
  );
  await waitFor(() => {
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Winner without a customer",
    );
  });
  expect(
    screen.getAllByRole("button", { name: "حفظ كمسودة" })[0],
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "إعادة التحميل والمراجعة" }),
  ).not.toBeInTheDocument();
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
      queryKey: orderKeys.editor(scope, id),
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

it("selects exact source IDs, duplicates editable refs to a fresh piece, and retains both through explicit draft save", async () => {
  currentCatalog = catalogFixture();
  const rendered = mount();
  fireEvent.click(screen.getByRole("combobox", { name: /^الموديل —/u }));
  fireEvent.click(await screen.findByRole("option", { name: "SM" }));
  fireEvent.click(screen.getByRole("button", { name: "تكرار" }));
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  const sent = createDraftBodySchema.parse(
    mocks.post.mock.calls.find((call) => call[0] === "/sales-drafts")?.[1],
  );
  expect(sent.draft.pieces).toHaveLength(2);
  expect(new Set(sent.draft.pieces.map((piece) => piece.id)).size).toBe(2);
  const selected =
    currentCatalog.availability === "available"
      ? currentCatalog.entries.find(
          (entry) => entry.kind === "model" && entry.displayValue === "SM",
        )
      : undefined;
  expect(selected).toBeDefined();
  expect(
    sent.draft.pieces.map((piece) => piece.catalogSelections?.model),
  ).toEqual([selected?.id, selected?.id]);
  rendered.rerender(
    <QueryClientProvider client={client}>
      <SalesCreateOrderView entry={{ kind: "edit", draftId: id }} />
    </QueryClientProvider>,
  );
  const heading = await screen.findByRole("heading", {
    name: /^تعديل المسودة \(DRAFT-/u,
  });
  expect(heading).not.toHaveTextContent(id);
  expect(screen.getAllByRole("combobox", { name: /^الموديل —/u })).toHaveLength(
    2,
  );
});

it("revokes obsolete quotes immediately and ignores late decoration replies while preserving nonprice edits", async () => {
  currentCatalog = catalogFixture();
  const pending: {
    body: CatalogQuoteBody;
    resolve: (value: ReturnType<typeof quoted>) => void;
  }[] = [];
  mocks.post.mockImplementation((url: string, raw: unknown) => {
    if (url !== "/catalogs/quotes") return accept(raw);
    const body = catalogQuoteBodySchema.parse(raw);
    return new Promise<ReturnType<typeof quoted>>((resolve) =>
      pending.push({ body, resolve }),
    );
  });
  mount();
  const choose = async (label: string) => {
    fireEvent.click(screen.getByRole("combobox", { name: /^التطعيم —/u }));
    fireEvent.click(await screen.findByRole("option", { name: label }));
    await waitFor(() => {
      expect(
        pending.some(({ body }) => body.pieces[0]?.decoration === label),
      ).toBe(true);
    });
  };
  await choose("زبيري - z");
  await choose("نعام - O");
  await choose("سادة - S");
  expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
  const latest = required(
    pending.find(({ body }) => body.pieces[0]?.decoration === "سادة - S"),
  );
  act(() => {
    latest.resolve(quoted(latest.body));
  });
  await waitFor(() =>
    expect(
      screen.getByLabelText("الإجمالي المعروض للمراجعة"),
    ).toHaveTextContent("650.00"),
  );
  for (const request of pending.filter((request) => request !== latest)) {
    act(() => {
      request.resolve(quoted(request.body));
    });
  }
  expect(screen.getByLabelText("الإجمالي المعروض للمراجعة")).toHaveTextContent(
    "650.00",
  );
  const count = pending.length;
  fireEvent.click(screen.getByRole("combobox", { name: /^الموديل —/u }));
  fireEvent.click(await screen.findByRole("option", { name: "SM" }));
  expect(pending).toHaveLength(count);
  expect(screen.getByLabelText("الباقي غير متاح")).toHaveTextContent("—");
});

it("submits the full dirty saved paper once and navigates only after submitted readback", async () => {
  currentCatalog = catalogFixture();
  const original = orderFixture();
  const customer = customerSchema.parse({
    id: p03Ids.customer,
    version: 7,
    ...original.customerSnapshot,
    notes: null,
    createdAt: instant,
    updatedAt: instant,
  });
  accept({
    commandId: crypto.randomUUID(),
    draft: { ...makeCapture(original), customerId: customer.id },
  });
  current = draftSchema.parse({
    ...current,
    customer: { id: customer.id, ...original.customerSnapshot },
    submission: { available: true },
  });
  let submitted: ReturnType<typeof orderFixture> | undefined;
  mocks.get.mockImplementation((url: string) => {
    if (url === `/customers/${customer.id}`)
      return response({
        customer,
        draftCount: 1,
        latestDraftAt: instant,
        latestMeasurement: null,
        submittedHistory: {
          availability: "not_available",
          reason: "P03_NOT_IMPLEMENTED",
        },
      });
    if (url === `/sales-order-editor/${id}` && submitted !== undefined)
      return response({ kind: "submitted", order: submitted });
    if (url === `/sales-orders/${id}` && submitted !== undefined)
      return response({ order: submitted });
    return readDraft(url);
  });
  mocks.post.mockImplementation((url: string, raw: unknown) => {
    if (url === "/catalogs/quotes") return quoted(raw);
    const body = submitOrderBodySchema.parse(raw);
    if (body.origin !== "draft")
      throw new Error("Expected atomic saved submission");
    submitted = salesOrderSchema.parse({
      ...original,
      version: body.expectedVersion + 1,
      generalNotes: body.capture.generalNotes,
    });
    return response(
      salesOrderCommandDataSchema.parse({
        kind: "order",
        savedOrder: submitted,
        replayed: false,
        receipt: {
          commandId: body.commandId,
          operation: "SUBMIT_DRAFT",
          resourceId: id,
          actor: {
            id: actor,
            fullName: "Actual Sales",
            role: "USER",
            department: "SALES",
          },
          beforeVersion: body.expectedVersion,
          afterVersion: submitted.version,
          occurredAt: instant,
        },
      }),
    );
  });
  mount({ kind: "edit", draftId: id });
  fireEvent.change(await screen.findByLabelText("الملاحظات العامة"), {
    target: { value: "Dirty atomic capture" },
  });
  const submit = await screen.findByRole("button", { name: "إرسال للاعتماد" });
  await screen.findByLabelText("الإجمالي المعروض للمراجعة");
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledWith(`/sales/orders/${id}`);
  });
  const writes = mocks.post.mock.calls.filter(
    (call) => call[0] !== "/catalogs/quotes",
  );
  expect(writes).toHaveLength(1);
  const body = submitOrderBodySchema.parse(writes[0]?.[1]);
  expect(body.capture.generalNotes).toBe("Dirty atomic capture");
  expect(body.expectedCustomerVersion).toBe(7);
  expect(mocks.put).not.toHaveBeenCalled();
});

const makeCapture = (order: ReturnType<typeof orderFixture>) => ({
  type: order.type,
  customerId: order.customerId,
  deliveryDate: order.deliveryDate,
  generalNotes: order.generalNotes,
  responsibleSignature: order.responsibleSignature,
  paidAmount: order.money.paidAmount,
  repairNote: order.repairNote,
  adjustmentRequested: order.adjustmentRequested,
  adjustmentReason: order.adjustmentReason,
  adjustmentActionTaken: order.adjustmentActionTaken,
  pieces: order.pieces.map(
    ({
      id,
      model,
      size,
      leatherBase,
      decoration,
      face,
      catalogSelections,
    }) => ({
      id,
      model,
      size,
      leatherBase,
      decoration,
      face,
      catalogSelections,
    }),
  ),
});

it.each([
  ["model", "الموديل"],
  ["size", "المقاس"],
  ["leatherBase", "أساس الجلد"],
  ["decoration", "التطعيم"],
  ["face", "الوجه"],
] as const)(
  "explains missing %s in a toast for its piece only after submit and retains input",
  async (field, label) => {
    currentCatalog = catalogFixture();
    const original = orderFixture();
    const capture = makeCapture(original);
    const piece = required(capture.pieces[0]);
    const incomplete = {
      ...capture,
      generalNotes: "Keep these specifications",
      pieces: [{ ...piece, [field]: null }],
    };
    accept({ commandId: crypto.randomUUID(), draft: incomplete });
    current = draftSchema.parse({
      ...current,
      customer: { id: original.customerId, ...original.customerSnapshot },
      submission: { available: true },
    });
    const customer = customerSchema.parse({
      id: original.customerId,
      version: 1,
      ...original.customerSnapshot,
      notes: null,
      createdAt: instant,
      updatedAt: instant,
    });
    mocks.get.mockImplementation((url: string) =>
      url === `/customers/${customer.id}`
        ? response({
            customer,
            draftCount: 1,
            latestDraftAt: instant,
            latestMeasurement: null,
            submittedHistory: {
              availability: "not_available",
              reason: "P03_NOT_IMPLEMENTED",
            },
          })
        : readDraft(url),
    );
    mount({ kind: "edit", draftId: id });
    await screen.findByLabelText("الملاحظات العامة");
    await waitFor(() => {
      expect(client.isFetching()).toBe(0);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إرسال للاعتماد" }));
    const notice = await within(
      screen.getByLabelText("قائمة الإشعارات"),
    ).findByRole("alert");
    expect(notice).toHaveTextContent(`القطعة 1: أدخل ${label}`);
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Keep these specifications",
    );
    expect(
      mocks.post.mock.calls.every(([url]) => url === "/catalogs/quotes"),
    ).toBe(true);
    expect(mocks.put).not.toHaveBeenCalled();
  },
);

it("keeps returned fixed terms locked and resubmits only permitted local corrections", async () => {
  const original = orderFixture(3);
  const returned = salesOrderSchema.parse({
    ...original,
    status: "RETURNED",
    allowedActions: { canResubmit: true, canSetPaid: false },
    approval: {
      ...original.approval,
      returnDecisionId: p03Ids.command,
      returnedAt: instant,
      returnReason: "Correct the face",
      returnRevision: 3,
    },
  });
  let latest = returned;
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`)
      return response({ kind: "submitted", order: latest });
    if (url === `/sales-orders/${id}`) return response({ order: latest });
    return readDraft(url);
  });
  mocks.post.mockImplementation((url: string, raw: unknown) => {
    if (url !== `/sales-orders/${id}/resubmit`)
      throw new Error(`Unexpected write ${url}`);
    const body = resubmitOrderBodySchema.parse(raw);
    latest = salesOrderSchema.parse({
      ...original,
      version: 4,
      deliveryDate: body.corrections.deliveryDate,
      generalNotes: body.corrections.generalNotes,
    });
    return response(
      salesOrderCommandDataSchema.parse({
        kind: "order",
        savedOrder: latest,
        replayed: false,
        receipt: {
          commandId: body.commandId,
          operation: "RESUBMIT_ORDER",
          resourceId: id,
          actor: {
            id: actor,
            fullName: "Actual Sales",
            role: "USER",
            department: "SALES",
          },
          beforeVersion: 3,
          afterVersion: 4,
          occurredAt: instant,
        },
      }),
    );
  });
  mount({ kind: "edit", draftId: id });
  const summary = within(
    await screen.findByRole("region", { name: "بيانات الطلب المعاد" }),
  );
  expect(summary.getByRole("heading", { name: "سبب الإرجاع" })).toBeVisible();
  expect(summary.getByText("Correct the face")).toBeVisible();
  expect(summary.getByText(returned.customerSnapshot.name)).toBeVisible();
  fireEvent.change(summary.getByLabelText("تاريخ التسليم المتوقع"), {
    target: { value: "2026-12-03" },
  });
  fireEvent.change(await screen.findByLabelText("الملاحظات العامة"), {
    target: { value: "Local corrected note" },
  });
  expect(
    screen.queryByRole("button", { name: "حفظ كمسودة" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "تكرار" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: /^التطعيم —/u }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("المبلغ المدفوع")).not.toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  );
  expect(
    await screen.findByText("هذا الطلب مقدم؛ راجع بياناته الحالية."),
  ).toBeVisible();
  expect(screen.getByText("Local corrected note")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  ).not.toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
  const body = resubmitOrderBodySchema.parse(mocks.post.mock.calls[0]?.[1]);
  expect(body.expectedVersion).toBe(3);
  expect(body.corrections.deliveryDate).toBe("2026-12-03");
  expect(body.corrections.generalNotes).toBe("Local corrected note");
  expect(body.corrections.pieces.map((piece) => piece.id)).toEqual(
    returned.pieces.map((piece) => piece.id),
  );
  expect(body.corrections).not.toHaveProperty("paidAmount");
});

it.each(["success", "calendar", "unknown", "synchronization"] as const)(
  "submits a new complete paper without a hidden draft and handles %s at the actual editor boundary",
  async (outcome) => {
    currentCatalog = catalogFixture();
    const original = orderFixture();
    const customer = customerSchema.parse({
      id: p03Ids.customer,
      version: 7,
      ...original.customerSnapshot,
      notes: null,
      createdAt: instant,
      updatedAt: instant,
    });
    const customerData = {
      customer,
      draftCount: 0,
      latestDraftAt: null,
      latestMeasurement: null,
      submittedHistory: {
        availability: "not_available",
        reason: "P03_NOT_IMPLEMENTED",
      },
    };
    let saved: ReturnType<typeof salesOrderCommandDataSchema.parse> | undefined;
    let readsFail = outcome === "synchronization";
    mocks.get.mockImplementation((url: string) => {
      if (
        url.startsWith("/customers/by-phone/") ||
        url === `/customers/${customer.id}`
      )
        return response(customerData);
      if (url === `/sales-order-editor/${id}` && saved !== undefined) {
        if (readsFail) throw failure(503, "HTTP_ERROR");
        return response({ kind: "submitted", order: saved.savedOrder });
      }
      if (url === `/sales-orders/${id}` && saved !== undefined)
        return response({ order: saved.savedOrder });
      if (url.startsWith("/sales-commands/") && saved !== undefined)
        return response(saved);
      return readDraft(url);
    });
    mocks.post.mockImplementation((url: string, raw: unknown) => {
      if (url === "/catalogs/quotes") return quoted(raw);
      if (url !== "/sales-orders") throw new Error(`Unexpected write ${url}`);
      const body = submitOrderBodySchema.parse(raw);
      if (body.origin !== "new")
        throw new Error("Expected direct new submission");
      if (outcome === "calendar")
        throw failure(503, "ORDER_CALENDAR_UNAVAILABLE");
      saved = salesOrderCommandDataSchema.parse({
        kind: "order",
        savedOrder: {
          ...original,
          pieces: original.pieces.map((piece, index) => ({
            ...piece,
            id: body.capture.pieces[index]?.id,
          })),
        },
        replayed: false,
        receipt: {
          commandId: body.commandId,
          operation: "SUBMIT_NEW_ORDER",
          resourceId: id,
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
      if (outcome === "unknown")
        throw new AxiosError("Lost response", "ERR_NETWORK");
      return response(saved);
    });
    mount({
      kind: "new",
      customerPrefill: { kind: "phone", phone: customer.phone },
    });
    for (const [field, label] of [
      ["الموديل", "SM"],
      ["المقاس", "40"],
      ["الأساس", "leatherBase 0"],
      ["التطعيم", "زبيري - z"],
    ] as const) {
      fireEvent.click(
        await screen.findByRole("combobox", {
          name: field === "المقاس" ? "المقاس" : new RegExp(`^${field} —`, "u"),
        }),
      );
      fireEvent.click(await screen.findByRole("option", { name: label }));
    }
    fireEvent.change(screen.getByLabelText(/^الوجه —/u), {
      target: { value: "Required face" },
    });
    const submit = screen.getByRole("button", { name: "إرسال للاعتماد" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    if (outcome === "calendar") {
      await screen.findByText(/الإرسال غير متاح حتى تهيئة تقويم العمل/u);
      expect(screen.getByLabelText(/^الوجه —/u)).toHaveValue("Required face");
      expect(
        screen.getAllByRole("button", { name: "حفظ كمسودة" })[0],
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "التحقق من الحفظ" }),
      ).not.toBeInTheDocument();
    } else {
      if (outcome === "unknown")
        fireEvent.click(
          await screen.findByRole("button", { name: "التحقق من الحفظ" }),
        );
      if (outcome === "synchronization") {
        const retry = await screen.findByRole("button", {
          name: "تحديث العرض",
        });
        readsFail = false;
        fireEvent.click(retry);
      }
      await waitFor(() => {
        expect(mocks.replace).toHaveBeenCalledWith(`/sales/orders/${id}`);
      });
    }
    const writes = mocks.post.mock.calls.filter(
      (call) => call[0] !== "/catalogs/quotes",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]).toBe("/sales-orders");
    expect(mocks.put).not.toHaveBeenCalled();
  },
);

it("keeps a priced peer visible while a cleared duplicate revokes the aggregate, then prices only the remaining stable piece", async () => {
  currentCatalog = catalogFixture();
  mount();
  fireEvent.click(screen.getByRole("combobox", { name: /^التطعيم —/u }));
  fireEvent.click(await screen.findByRole("option", { name: "زبيري - z" }));
  await waitFor(() => {
    expect(
      screen.getByLabelText("الإجمالي المعروض للمراجعة"),
    ).toHaveTextContent("1800.00");
  });
  fireEvent.click(screen.getByRole("button", { name: "تكرار" }));
  await waitFor(() => {
    expect(
      screen.getByLabelText("الإجمالي المعروض للمراجعة"),
    ).toHaveTextContent("3600.00");
  });
  fireEvent.click(
    required(screen.getAllByRole("combobox", { name: /^التطعيم —/u })[1]),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /مسح الاختيار الحالي/u }),
  );
  await waitFor(() => {
    expect(client.isFetching()).toBe(0);
  });
  expect(
    screen.queryByText(/السعر غير متاح لبعض القطع/u),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
  expect(screen.getByLabelText("سعر القطعة 01")).toHaveTextContent("1800.00");
  expect(screen.getByLabelText("سعر القطعة 02")).toHaveTextContent("—");
  fireEvent.click(
    required(screen.getAllByTitle("حذف هذه القطعة من المسودة")[1]),
  );
  await waitFor(() => {
    expect(
      screen.getByLabelText("الإجمالي المعروض للمراجعة"),
    ).toHaveTextContent("1800.00");
  });
});

const completeNewPaper = async () => {
  for (const [field, label] of [
    ["الموديل", "SM"],
    ["المقاس", "40"],
    ["الأساس", "leatherBase 0"],
    ["التطعيم", "زبيري - z"],
  ] as const) {
    fireEvent.click(
      await screen.findByRole("combobox", {
        name: field === "المقاس" ? "المقاس" : new RegExp(`^${field} —`, "u"),
      }),
    );
    fireEvent.click(await screen.findByRole("option", { name: label }));
  }
  fireEvent.change(screen.getByLabelText(/^الوجه —/u), {
    target: { value: "Required face" },
  });
};
const prepareSubmissionConflict = async (
  origin: "new" | "draft",
  code: string,
) => {
  currentCatalog = catalogFixture();
  const original = orderFixture();
  const state = {
    customer: customerSchema.parse({
      id: p03Ids.customer,
      version: 7,
      ...original.customerSnapshot,
      notes: null,
      createdAt: instant,
      updatedAt: instant,
    }),
    failReview: false,
    writes: [] as ReturnType<typeof submitOrderBodySchema.parse>[],
  };
  if (origin === "draft") {
    accept({ commandId: crypto.randomUUID(), draft: makeCapture(original) });
    current = draftSchema.parse({
      ...current,
      customer: { id: state.customer.id, ...original.customerSnapshot },
      submission: { available: true },
    });
  }
  mocks.get.mockImplementation((url: string) => {
    if (
      url.startsWith("/customers/by-phone/") ||
      url === `/customers/${state.customer.id}`
    ) {
      if (state.failReview && code === "ORDER_CUSTOMER_CHANGED")
        throw failure(503, "HTTP_ERROR");
      return response({
        customer: state.customer,
        draftCount: origin === "draft" ? 1 : 0,
        latestDraftAt: null,
        latestMeasurement: null,
        submittedHistory: {
          availability: "not_available",
          reason: "P03_NOT_IMPLEMENTED",
        },
      });
    }
    if (
      state.failReview &&
      code === "ORDER_QUOTE_CHANGED" &&
      url === "/catalogs"
    )
      throw failure(503, "HTTP_ERROR");
    return readDraft(url);
  });
  mocks.post.mockImplementation((url: string, raw: unknown) => {
    if (url === "/catalogs/quotes") return quoted(raw);
    if (url !== "/sales-orders") throw new Error(`Unexpected write ${url}`);
    state.writes.push(submitOrderBodySchema.parse(raw));
    throw failure(
      state.writes.length === 1 ? 409 : 400,
      state.writes.length === 1 ? code : "VALIDATION_ERROR",
    );
  });
  mount(
    origin === "draft"
      ? { kind: "edit", draftId: id }
      : {
          kind: "new",
          customerPrefill: { kind: "phone", phone: state.customer.phone },
        },
  );
  if (origin === "new") await completeNewPaper();
  fireEvent.change(await screen.findByLabelText("الملاحظات العامة"), {
    target: { value: "Dirty paper survives review" },
  });
  const submit = screen.getByRole("button", { name: "إرسال للاعتماد" });
  await waitFor(() => {
    expect(submit).toBeEnabled();
  });
  await waitFor(() => {
    expect(client.isFetching()).toBe(0);
  });
  fireEvent.click(submit);
  return { state, submit };
};
it.each([
  ["new", "ORDER_QUOTE_CHANGED"],
  ["draft", "ORDER_QUOTE_CHANGED"],
  ["new", "ORDER_CUSTOMER_CHANGED"],
  ["draft", "ORDER_CUSTOMER_CHANGED"],
] as const)(
  "retains %s paper after %s and permits a fresh intent only after successful explicit review",
  async (origin, code) => {
    const { state, submit } = await prepareSubmissionConflict(origin, code);
    const review = await screen.findByRole("button", {
      name: "إعادة التحميل والمراجعة",
    });
    expect(submit).toBeDisabled();
    if (code === "ORDER_QUOTE_CHANGED")
      expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Dirty paper survives review",
    );
    expect(
      screen.getAllByRole("button", { name: "حفظ كمسودة" })[0],
    ).toBeEnabled();
    fireEvent.click(submit);
    expect(state.writes).toHaveLength(1);
    const first = required(state.writes[0]);
    state.failReview = true;
    fireEvent.click(review);
    await screen.findByText(/احتفظ بإدخالك وحاول مجدداً/u);
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Dirty paper survives review",
    );
    state.failReview = false;
    if (code === "ORDER_QUOTE_CHANGED") {
      const replacement = catalogFixture();
      if (replacement.availability !== "available")
        throw new Error("Expected replacement catalog");
      currentCatalog = {
        ...replacement,
        sourceId: "55555555-5555-4555-8555-666666666666",
      };
      quoteFingerprint = "b".repeat(64);
    } else
      state.customer = {
        ...state.customer,
        version: 8,
        address: "Current reviewed address",
      };
    fireEvent.click(review);
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    expect(state.writes).toHaveLength(1);
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Dirty paper survives review",
    );
    if (code === "ORDER_CUSTOMER_CHANGED")
      expect(screen.getByText(/Current reviewed address/u)).toBeInTheDocument();
    fireEvent.click(submit);
    await waitFor(() => {
      expect(state.writes).toHaveLength(2);
    });
    const retry = required(state.writes[1]);
    expect(retry.commandId).not.toBe(first.commandId);
    expect(retry.capture).toEqual(first.capture);
    expect(retry.expectedCustomerVersion).toBe(
      code === "ORDER_CUSTOMER_CHANGED" ? 8 : 7,
    );
    expect(retry.reviewedQuote).toEqual(
      code === "ORDER_QUOTE_CHANGED"
        ? {
            sourceId: "55555555-5555-4555-8555-666666666666",
            fingerprint: "b".repeat(64),
          }
        : first.reviewedQuote,
    );
  },
);

it("reviews a stale saved submission through the combined editor without reopening a promoted order", async () => {
  const { state, submit } = await prepareSubmissionConflict(
    "draft",
    "ORDER_VERSION_CONFLICT",
  );
  const review = await screen.findByRole("button", {
    name: "إعادة التحميل والمراجعة",
  });
  expect(submit).toBeDisabled();
  expect(
    screen.getAllByRole("button", { name: "حفظ كمسودة" })[0],
  ).toBeDisabled();
  const previousRead = required(mocks.get.getMockImplementation());
  mocks.get.mockImplementation((url: string): unknown => {
    if (url === `/sales-order-editor/${id}`) throw failure(503, "HTTP_ERROR");
    return previousRead(url);
  });
  fireEvent.click(review);
  await screen.findByText(/احتفظ بإدخالك وحاول مجدداً/u);
  expect(submit).toBeDisabled();
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Dirty paper survives review",
  );
  mocks.get.mockImplementation((url: string): unknown =>
    url === `/sales-order-editor/${id}`
      ? response({ kind: "submitted", order: orderFixture(2) })
      : previousRead(url),
  );
  fireEvent.click(review);
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledWith(`/sales/orders/${id}`);
  });
  expect(submit).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  expect(screen.getByText("Dirty paper survives review")).toBeInTheDocument();
  expect(screen.queryByLabelText("الملاحظات العامة")).not.toBeInTheDocument();
});
it.each(["ORDER_STATE_CONFLICT", "ORDER_CORRECTION_CONFLICT"] as const)(
  "keeps a returned correction gated after %s and reviews its locked current state",
  async (code) => {
    const original = orderFixture(3);
    let latest = salesOrderSchema.parse({
      ...original,
      status: "RETURNED",
      allowedActions: { canResubmit: true, canSetPaid: false },
      approval: {
        ...original.approval,
        returnDecisionId: p03Ids.command,
        returnedAt: instant,
        returnReason: "Review correction",
        returnRevision: 3,
      },
    });
    mocks.get.mockImplementation((url: string) =>
      url === `/sales-order-editor/${id}`
        ? response({ kind: "submitted", order: latest })
        : readDraft(url),
    );
    mocks.post.mockRejectedValue(failure(409, code));
    mount({ kind: "edit", draftId: id });
    fireEvent.change(await screen.findByLabelText("الملاحظات العامة"), {
      target: { value: "Retained correction" },
    });
    const submit = screen.getByRole("button", {
      name: "إعادة الإرسال للاعتماد",
    });
    fireEvent.click(submit);
    const review = await screen.findByRole("button", {
      name: "إعادة التحميل والمراجعة",
    });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Retained correction",
    );
    latest = orderFixture(4);
    fireEvent.click(review);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(`/sales/orders/${id}`);
    });
    expect(submit).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "حفظ كمسودة" }),
    ).not.toBeInTheDocument();
  },
);
it("does not publish an old account's delayed customer review into its replacement editor", async () => {
  const { state } = await prepareSubmissionConflict(
    "new",
    "ORDER_CUSTOMER_CHANGED",
  );
  const review = await screen.findByRole("button", {
    name: "إعادة التحميل والمراجعة",
  });
  const previousRead = required(mocks.get.getMockImplementation());
  let release!: (value: ReturnType<typeof response>) => void;
  const oldReview = new Promise<ReturnType<typeof response>>((resolve) => {
    release = resolve;
  });
  mocks.get.mockReturnValueOnce(oldReview);
  fireEvent.click(review);
  await waitFor(() => {
    expect(review).toBeDisabled();
  });
  const session = authUserDataSchema.parse(
    client.getQueryData(AUTH_SESSION_QUERY_KEY),
  );
  const other = "88888888-8888-4888-8888-888888888888";
  mocks.get.mockImplementation(previousRead);
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("other-synthetic", epoch, other);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { ...session.user, id: other, fullName: "Other sales" },
    });
  });
  await waitFor(() => {
    expect(screen.getByDisplayValue("Other sales")).toBeInTheDocument();
  });
  await act(async () => {
    release(
      response({
        customer: {
          ...state.customer,
          version: 8,
          address: "Private old review",
        },
        draftCount: 0,
        latestDraftAt: null,
        latestMeasurement: null,
        submittedHistory: {
          availability: "not_available",
          reason: "P03_NOT_IMPLEMENTED",
        },
      }),
    );
    await oldReview;
  });
  await waitFor(() => {
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue("");
  });
  expect(screen.queryByText(/Private old review/u)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إعادة التحميل والمراجعة" }),
  ).not.toBeInTheDocument();
  expect(state.writes).toHaveLength(1);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("retains the quote conflict when the reviewed quote read fails, then retries reads without another write", async () => {
  const { state, submit } = await prepareSubmissionConflict(
    "new",
    "ORDER_QUOTE_CHANGED",
  );
  const review = await screen.findByRole("button", {
    name: "إعادة التحميل والمراجعة",
  });
  const previousWrite = required(mocks.post.getMockImplementation());
  mocks.post.mockImplementation((url: string, raw: unknown): unknown => {
    if (url === "/catalogs/quotes") throw failure(503, "HTTP_ERROR");
    return previousWrite(url, raw);
  });
  fireEvent.click(review);
  await screen.findByText(/احتفظ بإدخالك وحاول مجدداً/u);
  expect(submit).toBeDisabled();
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Dirty paper survives review",
  );
  expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
  mocks.post.mockImplementation(previousWrite);
  quoteFingerprint = "b".repeat(64);
  fireEvent.click(review);
  await waitFor(() => {
    expect(submit).toBeEnabled();
  });
  expect(state.writes).toHaveLength(1);
  expect(screen.getByLabelText("الإجمالي المعروض للمراجعة")).toHaveTextContent(
    "1800.00",
  );
});

it("keeps rejected terms gated when a permissible draft save itself fails validation", async () => {
  const { state, submit } = await prepareSubmissionConflict(
    "draft",
    "ORDER_QUOTE_CHANGED",
  );
  await screen.findByRole("button", { name: "إعادة التحميل والمراجعة" });
  mocks.put.mockRejectedValueOnce(failure(400, "VALIDATION_ERROR"));
  fireEvent.click(
    required(screen.getAllByRole("button", { name: "حفظ كمسودة" })[0]),
  );
  await waitFor(() => {
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  await waitFor(() => {
    expect(
      screen.getAllByRole("button", { name: "حفظ كمسودة" })[0],
    ).toBeEnabled();
  });
  expect(submit).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "إعادة التحميل والمراجعة" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Dirty paper survives review",
  );
  expect(state.writes).toHaveLength(1);
});

it.each(["catalog", "quote", "source"] as const)(
  "keeps local source mismatch gated across failed %s review and accepts only a later explicit current intent",
  async (reviewFailure) => {
    currentCatalog = catalogFixture();
    const original = orderFixture();
    accept({ commandId: crypto.randomUUID(), draft: makeCapture(original) });
    current = draftSchema.parse({
      ...current,
      customer: { id: p03Ids.customer, ...original.customerSnapshot },
      submission: { available: true },
    });
    const readLocal = (url: string) =>
      url === `/customers/${p03Ids.customer}`
        ? response({
            customer: customerSchema.parse({
              id: p03Ids.customer,
              version: 7,
              ...original.customerSnapshot,
              notes: null,
              createdAt: instant,
              updatedAt: instant,
            }),
            draftCount: 1,
            latestDraftAt: null,
            latestMeasurement: null,
            submittedHistory: {
              availability: "not_available",
              reason: "P03_NOT_IMPLEMENTED",
            },
          })
        : readDraft(url);
    let quoteReads = 0;
    let failReview = false;
    let source = "55555555-5555-4555-8555-666666666666";
    const writes: ReturnType<typeof submitOrderBodySchema.parse>[] = [];
    mocks.get.mockImplementation((url: string) => {
      if (url === "/catalogs" && failReview && reviewFailure === "catalog")
        throw failure(503, "HTTP_ERROR");
      return readLocal(url);
    });
    mocks.post.mockImplementation((url: string, raw: unknown) => {
      if (url !== "/catalogs/quotes") {
        writes.push(submitOrderBodySchema.parse(raw));
        throw failure(400, "VALIDATION_ERROR");
      }
      if (failReview && reviewFailure === "quote")
        throw failure(503, "HTTP_ERROR");
      if (failReview && reviewFailure === "source")
        source = "55555555-5555-4555-8555-777777777777";
      quoteReads++;
      const catalog = catalogFixture();
      if (catalog.availability !== "available")
        throw new Error("Expected catalog");
      currentCatalog = {
        ...catalog,
        sourceId: source,
      };
      quoteFingerprint = "b".repeat(64);
      return quoted(raw);
    });
    mount({ kind: "edit", draftId: id });
    await waitFor(() => {
      expect(quoteReads).toBeGreaterThanOrEqual(2);
    });
    const review = await screen.findByRole("button", {
      name: "إعادة التحميل والمراجعة",
    });
    const submit = screen.getByRole("button", { name: "إرسال للاعتماد" });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
    fireEvent.change(screen.getByLabelText("الملاحظات العامة"), {
      target: { value: "Retained local source review" },
    });
    fireEvent.click(submit);
    expect(
      mocks.post.mock.calls.filter((call) => call[0] !== "/catalogs/quotes"),
    ).toHaveLength(0);
    failReview = true;
    fireEvent.click(review);
    await screen.findByText(/احتفظ بإدخالك وحاول مجدداً/u);
    await waitFor(() => {
      expect(review).toBeEnabled();
    });
    expect(submit).toBeDisabled();
    expect(writes).toHaveLength(0);
    failReview = false;
    fireEvent.click(review);
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Retained local source review",
    );
    expect(
      screen.getByLabelText("الإجمالي المعروض للمراجعة"),
    ).toHaveTextContent("1800.00");
    fireEvent.click(submit);
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(writes[0]?.reviewedQuote).toEqual({
      sourceId: source,
      fingerprint: "b".repeat(64),
    });
    expect(writes[0]?.capture.generalNotes).toBe(
      "Retained local source review",
    );
  },
);

it("ignores an obsolete account's delayed local source mismatch in the replacement form", async () => {
  currentCatalog = catalogFixture();
  let release!: (reply: ReturnType<typeof quoted>) => void;
  let oldBody: unknown;
  const pending = new Promise<ReturnType<typeof quoted>>((resolve) => {
    release = resolve;
  });
  mocks.post.mockImplementationOnce((_url: string, raw: unknown) => {
    oldBody = raw;
    return pending;
  });
  mount();
  await waitFor(() => {
    expect(oldBody).toBeDefined();
  });
  const originalSession = authUserDataSchema.parse(
    client.getQueryData(AUTH_SESSION_QUERY_KEY),
  );
  const other = "88888888-8888-4888-8888-888888888888";
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("other-synthetic", epoch, other);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { ...originalSession.user, id: other, fullName: "Other sales" },
    });
  });
  await screen.findByDisplayValue("Other sales");
  const reply = quoted(oldBody);
  await act(async () => {
    release(
      response({
        ...catalogQuoteDataSchema.parse(reply.data.data),
        sourceId: "55555555-5555-4555-8555-666666666666",
      }),
    );
    await pending;
  });
  expect(
    screen.queryByRole("button", { name: "إعادة التحميل والمراجعة" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue("");
  expect(
    mocks.post.mock.calls.filter((call) => call[0] !== "/catalogs/quotes"),
  ).toHaveLength(0);
});

const seedStaleLockedEditor = () => {
  const scope = required(readOperationalScope(client)),
    locked = orderFixture();
  client.setQueryData(
    orderKeys.editor(scope, id),
    { kind: "submitted", order: locked },
    { updatedAt: Date.now() - 60_000 },
  );
  return { scope, locked };
};
const returnedEditorOrder = (version: number) => {
  const original = orderFixture(version);
  return salesOrderSchema.parse({
    ...original,
    status: "RETURNED",
    allowedActions: { canResubmit: true, canSetPaid: false },
    approval: {
      ...original.approval,
      returnDecisionId: p03Ids.command,
      returnedAt: instant,
      returnReason: "Current return proof",
      returnRevision: version,
    },
  });
};

it("admits the current returned correction after a stale locked locator without navigation or implicit writes", async () => {
  const { locked } = seedStaleLockedEditor();
  let latest = locked,
    release!: (reply: ReturnType<typeof response>) => void;
  const pending = new Promise<ReturnType<typeof response>>((resolve) => {
    release = resolve;
  });
  mocks.get.mockImplementation((url: string) =>
    url === `/sales-order-editor/${id}` ? pending : readDraft(url),
  );
  mount({ kind: "edit", draftId: id });
  await screen.findByText("هذا الطلب مقدم؛ راجع بياناته الحالية.");
  expect(
    screen.queryByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  ).not.toBeInTheDocument();
  latest = returnedEditorOrder(2);
  await act(async () => {
    release(response({ kind: "submitted", order: latest }));
    await pending;
  });
  await screen.findByText("Current return proof");
  expect(
    screen.getByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("combobox", { name: /^التطعيم —/u }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "تكرار" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "حفظ كمسودة" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("الإجمالي المعتمد")).toHaveTextContent(
    "1800.00",
  );
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("الملاحظات العامة"), {
    target: { value: "Explicit current correction" },
  });
  mocks.post.mockRejectedValue(failure(400, "VALIDATION_ERROR"));
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  );
  await waitFor(() => {
    expect(mocks.post).toHaveBeenCalledOnce();
  });
  expect(mocks.post.mock.calls[0]?.[0]).toBe(`/sales-orders/${id}/resubmit`);
  const body = resubmitOrderBodySchema.parse(mocks.post.mock.calls[0]?.[1]);
  expect(body.expectedVersion).toBe(2);
  expect(body.corrections.generalNotes).toBe("Explicit current correction");
  expect(body.corrections.pieces.map((piece) => piece.id)).toEqual(
    latest.pieces.map((piece) => piece.id),
  );
});

it.each(["locked", "failed"] as const)(
  "keeps current read-only facts safe when a stale locked locator receives a %s read",
  async (outcome) => {
    const { scope } = seedStaleLockedEditor();
    let release!: (reply: ReturnType<typeof response>) => void,
      reject!: (error: unknown) => void;
    const pending = new Promise<ReturnType<typeof response>>(
      (resolve, fail) => {
        release = resolve;
        reject = fail;
      },
    );
    mocks.get.mockImplementation((url: string) =>
      url === `/sales-order-editor/${id}` ? pending : readDraft(url),
    );
    mount({ kind: "edit", draftId: id });
    await screen.findByText("هذا الطلب مقدم؛ راجع بياناته الحالية.");
    const latest = salesOrderSchema.parse({
      ...orderFixture(3),
      generalNotes: "Latest locked facts",
      money: {
        total: "1800.00",
        paidAmount: "300.00",
        remainingDue: "1500.00",
        surplus: "0.00",
      },
    });
    act(() => {
      if (outcome === "failed") reject(failure(503, "HTTP_ERROR"));
      else release(response({ kind: "submitted", order: latest }));
    });
    await waitFor(() => {
      expect(
        client.getQueryState(orderKeys.editor(scope, id))?.fetchStatus,
      ).toBe("idle");
    });
    if (outcome === "locked") {
      await screen.findByText("Latest locked facts");
      expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent(
        "300.00",
      );
    } else
      expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent(
        "0.00",
      );
    expect(
      screen.queryByRole("button", { name: "إعادة الإرسال للاعتماد" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("الملاحظات العامة")).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  },
);

it("retains an admitted dirty returned session when a newer locked locator arrives until explicit review", async () => {
  const scope = required(readOperationalScope(client));
  let latest = returnedEditorOrder(2);
  mocks.get.mockImplementation((url: string) =>
    url === `/sales-order-editor/${id}`
      ? response({ kind: "submitted", order: latest })
      : readDraft(url),
  );
  mount({ kind: "edit", draftId: id });
  fireEvent.change(await screen.findByLabelText("الملاحظات العامة"), {
    target: { value: "Retained admitted input" },
  });
  latest = salesOrderSchema.parse({
    ...orderFixture(3),
    generalNotes: "Other current revision",
  });
  await act(async () => {
    await client.invalidateQueries({
      queryKey: orderKeys.editor(scope, id),
      exact: true,
    });
  });
  const review = await screen.findByRole("button", {
    name: "إعادة التحميل والمراجعة",
  });
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
    "Retained admitted input",
  );
  expect(screen.getByText("Current return proof")).toBeInTheDocument();
  expect(screen.queryByText("Other current revision")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  );
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(review);
  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledWith(`/sales/orders/${id}`);
  });
  expect(screen.getByText("Retained admitted input")).toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});

it("shows retained locked read failures and retries reads until a current return can be admitted", async () => {
  const { scope } = seedStaleLockedEditor();
  let fails = true;
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`) {
      if (fails) throw failure(503, "HTTP_ERROR");
      return response({ kind: "submitted", order: returnedEditorOrder(2) });
    }
    return readDraft(url);
  });
  mount({ kind: "edit", draftId: id });
  const retry = await screen.findByRole("button", {
    name: "إعادة محاولة التحديث",
  });
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("safe-request");
  expect(screen.getByLabelText("المدفوع المعتمد")).toHaveTextContent("0.00");
  expect(
    screen.queryByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  ).not.toBeInTheDocument();
  fireEvent.click(retry);
  await waitFor(() => {
    expect(client.getQueryState(orderKeys.editor(scope, id))?.fetchStatus).toBe(
      "idle",
    );
  });
  await screen.findByRole("button", { name: "إعادة محاولة التحديث" });
  expect(
    within(screen.getByLabelText("قائمة الإشعارات")).getAllByRole("alert"),
  ).toHaveLength(2);
  fails = false;
  fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة التحديث" }));
  await screen.findByText("Current return proof");
  expect(
    screen.queryByRole("button", { name: "إعادة محاولة التحديث" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "إعادة الإرسال للاعتماد" }),
  ).toBeEnabled();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it.each(["draft", "returned"] as const)(
  "retries a failed %s read once without resetting dirty input or silently accepting a newer revision",
  async (mode) => {
    const scope = required(readOperationalScope(client));
    if (mode === "draft")
      accept({
        commandId: crypto.randomUUID(),
        draft: makeCapture(orderFixture()),
      });
    let latest =
      mode === "returned"
        ? { kind: "submitted" as const, order: returnedEditorOrder(2) }
        : { kind: "draft" as const, draft: required(current) };
    let fails = false;
    mocks.get.mockImplementation((url: string) => {
      if (url === `/sales-order-editor/${id}`) {
        if (fails) throw failure(503, "HTTP_ERROR");
        return response(latest);
      }
      return readDraft(url);
    });
    mount({ kind: "edit", draftId: id });
    fireEvent.change(await screen.findByLabelText("الملاحظات العامة"), {
      target: { value: "Dirty read retry input" },
    });
    fireEvent.change(screen.getByLabelText(/^الوجه —/u), {
      target: { value: "Dirty retained face" },
    });
    fails = true;
    await act(async () => {
      await client.invalidateQueries({
        queryKey: orderKeys.editor(scope, id),
        exact: true,
      });
    });
    const retry = await screen.findByRole("button", {
      name: "إعادة محاولة التحديث",
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      mode === "returned" ? "تعذّر تحديث الطلب" : "تعذّر تحديث المسودة",
    );
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Dirty read retry input",
    );
    fireEvent.click(retry);
    await waitFor(() => {
      expect(
        client.getQueryState(orderKeys.editor(scope, id))?.fetchStatus,
      ).toBe("idle");
    });
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    fails = false;
    latest =
      mode === "returned"
        ? { kind: "submitted", order: returnedEditorOrder(3) }
        : {
            kind: "draft",
            draft: draftSchema.parse({
              ...required(current),
              version: 2,
              generalNotes: "New saved draft",
            }),
          };
    fireEvent.click(
      screen.getByRole("button", { name: "إعادة محاولة التحديث" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "إعادة محاولة التحديث" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue(
      "Dirty read retry input",
    );
    expect(screen.getByLabelText(/^الوجه —/u)).toHaveValue(
      "Dirty retained face",
    );
    await screen.findByRole("button", { name: "إعادة التحميل والمراجعة" });
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(
      mocks.get.mock.calls.filter((call) =>
        String(call[0]).startsWith("/sales-commands/"),
      ),
    ).toHaveLength(0);
    expect(mocks.replace).not.toHaveBeenCalled();
  },
);

it("does not publish a delayed old-account read retry or return admission into the replacement editor", async () => {
  const { scope } = seedStaleLockedEditor();
  let pendingRead: Promise<ReturnType<typeof response>> | null = null;
  let release!: (reply: ReturnType<typeof response>) => void;
  mocks.get.mockImplementation((url: string) => {
    if (url === `/sales-order-editor/${id}`) {
      if (pendingRead !== null) return pendingRead;
      throw failure(503, "HTTP_ERROR");
    }
    return readDraft(url);
  });
  const view = mount({ kind: "edit", draftId: id });
  const retry = await screen.findByRole("button", {
    name: "إعادة محاولة التحديث",
  });
  pendingRead = new Promise((resolve) => {
    release = resolve;
  });
  fireEvent.click(retry);
  await waitFor(() => {
    expect(client.getQueryState(orderKeys.editor(scope, id))?.fetchStatus).toBe(
      "fetching",
    );
  });
  const pendingRetry = screen.queryByRole("button", {
    name: "إعادة محاولة التحديث",
  });
  if (pendingRetry !== null) expect(pendingRetry).toBeDisabled();
  const originalSession = authUserDataSchema.parse(
    client.getQueryData(AUTH_SESSION_QUERY_KEY),
  );
  const other = "88888888-8888-4888-8888-888888888888";
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("other-synthetic", epoch, other);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { ...originalSession.user, id: other, fullName: "Other sales" },
    });
    view.rerender(
      <QueryClientProvider client={client}>
        <SalesCreateOrderView
          entry={{ kind: "new", customerPrefill: { kind: "none" } }}
        />
      </QueryClientProvider>,
    );
  });
  await screen.findByDisplayValue("Other sales");
  await act(async () => {
    release(response({ kind: "submitted", order: returnedEditorOrder(2) }));
    await pendingRead;
  });
  expect(screen.queryByText("Current return proof")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إعادة محاولة التحديث" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("الملاحظات العامة")).toHaveValue("");
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});
