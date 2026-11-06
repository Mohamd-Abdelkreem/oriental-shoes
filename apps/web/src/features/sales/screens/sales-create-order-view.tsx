"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useController } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import {
  authUserDataSchema,
  customerPhoneSchema,
  draftDataSchema,
  draftReplacementSchema,
  createDraftBodySchema,
  saveDraftBodySchema,
  MAX_DRAFT_PIECES,
  type CustomerDto,
  type CustomerSummary,
  type DraftCapture,
  type DraftDto,
  type SalesCommandData,
} from "@template/contracts";
import { useSession } from "@/features/auth/hooks/auth.hooks";
import {
  useOperationalScope,
  isCurrentOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import { useZodForm } from "@/shared/forms/form";
import {
  useCustomer,
  useCustomerByPhone,
  useCustomerList,
} from "@/features/customers/hooks/customers.hooks";
import { useDraft, draftKeys, draftDetailOptions } from "../hooks/drafts.hooks";
import {
  useSalesCommand,
  useSalesCommandReceipt,
  synchronizeSalesCommand,
} from "../hooks/sales-commands.hooks";
import {
  SalesSynchronizationError,
  isUnknownSalesWrite,
  type SalesCommandIntent,
} from "../model/sales-command-state";
import {
  DRAFT_PIECE_CAPTURE_FIELDS,
  applyDraftCommandError,
  draftEditRoute,
  fromDraftPaperLines,
  makeBlankDraftPiece,
  makeDraftDefaults,
  toDraftPaper,
  toDraftPaperLines,
  type DraftEditorEntry,
  type DraftFormValues,
  type DraftSubmitSnapshot,
  type DraftPieceCaptureField,
} from "../model/draft-form.model";
import type { ProductLine } from "@/features/prototype/state/mvp-types";
import type { OrderAdjustmentFields } from "@/features/orders/adjustment-fields";
import {
  OrderPaperForm,
  type DraftPaperOptions,
  type OrderPaperDataState,
} from "@/features/orders/components/order-paper-form";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import { SalesCustomerSection } from "./sales-customer-section";
import { SalesOrderMetadataSection } from "./sales-order-metadata-section";
import { InlineCustomerModal } from "./inline-customer-modal";

const catalogOptions: DraftPaperOptions = {
  model: [],
  leatherBase: [],
  decoration: [],
  decorationColor: [],
  sole: [],
  soleAddition: [],
  soleColor: [],
  size: [],
};
const dataState: OrderPaperDataState = {
  kind: "draft",
  pricing: "unavailable",
  catalogOptions,
};
const headers = [
  "type",
  "customerId",
  "deliveryDate",
  "generalNotes",
  "responsibleSignature",
  "paidAmount",
  "repairNote",
  "adjustmentRequested",
  "adjustmentReason",
  "adjustmentActionTaken",
] as const;
type DraftIntent = Extract<
  SalesCommandIntent,
  { operation: "CREATE_DRAFT" | "SAVE_DRAFT" }
>;
type DraftBase =
  { kind: "new" } | { kind: "saved"; id: string; version: number };
type RetainedDraft = {
  variables: Readonly<{ scope: OperationalScope; command: DraftIntent }>;
  snapshot: DraftSubmitSnapshot;
  unknown: boolean;
  confirmed: SalesCommandData | null;
  running: boolean;
};
const freezeCapture = (capture: DraftCapture): void => {
  for (const piece of capture.pieces) Object.freeze(piece);
  Object.freeze(capture.pieces);
  Object.freeze(capture);
};
const assertDraftResult = (
  saved: SalesCommandData,
  intent: RetainedDraft,
): void => {
  const { command, scope } = intent.variables;
  if (
    saved.kind !== "draft" ||
    saved.receipt.operation !== command.operation ||
    saved.receipt.commandId !== command.body.commandId ||
    saved.receipt.actor.id !== scope.actorId ||
    (command.operation === "SAVE_DRAFT" &&
      saved.receipt.resourceId !== command.draftId)
  )
    throw new ApiContractError();
};

export function SalesCreateOrderView({ entry }: { entry: DraftEditorEntry }) {
  const scope = useOperationalScope(),
    session = useSession();
  const draft = useDraft(entry.kind === "edit" ? entry.draftId : null);
  const actor = authUserDataSchema.safeParse(session.data);
  if (
    scope === null ||
    !actor.success ||
    actor.data.user.id !== scope.actorId ||
    actor.data.user.accessVersion !== scope.accessVersion
  )
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  if (entry.kind === "invalid")
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 p-5"
      >
        مرجع المسودة غير صالح.{" "}
        <Link href="/sales/orders/drafts" className="btn-pill btn-outline">
          المسودات
        </Link>
      </div>
    );
  if (entry.kind === "edit" && draft.isError && draft.data === undefined)
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 p-5"
      >
        {getApiError(draft.error).statusCode === 404
          ? "المسودة غير موجودة أو غير متاحة."
          : "تعذّر تحميل المسودة."}{" "}
        {getApiError(draft.error).requestId}
        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={() => {
            void draft.refetch();
          }}
        >
          إعادة المحاولة
        </button>
        <Link href="/sales/orders/drafts">المسودات</Link>
      </div>
    );
  if (entry.kind === "edit" && draft.data === undefined)
    return <p role="status">جارٍ تحميل المسودة...</p>;
  const target =
    entry.kind === "edit"
      ? entry.draftId
      : `new:${entry.customerPrefill.kind === "phone" ? entry.customerPrefill.phone : entry.customerPrefill.kind}`;
  return (
    <DraftEditor
      key={`${scope.actorId}:${String(scope.accessVersion)}:${String(scope.epoch)}:${target}`}
      entry={entry}
      scope={scope}
      draft={entry.kind === "edit" ? draft.data?.draft : undefined}
      ownerName={
        entry.kind === "edit"
          ? (draft.data?.draft.owner.fullName ?? actor.data.user.fullName)
          : actor.data.user.fullName
      }
    />
  );
}
function DraftEditor({
  entry,
  scope,
  draft,
  ownerName,
}: {
  entry: Exclude<DraftEditorEntry, { kind: "invalid" }>;
  scope: OperationalScope;
  draft: DraftDto | undefined;
  ownerName: string;
}) {
  "use no memo";
  const router = useRouter(),
    client = useQueryClient(),
    formId = useId();
  const [initialValues] = useState(() => makeDraftDefaults(draft));
  const [formToken] = useState<object>(() => ({}));
  const [base, setBase] = useState<DraftBase>(() =>
    draft === undefined
      ? { kind: "new" }
      : { kind: "saved", id: draft.id, version: draft.version },
  );
  const form = useZodForm(draftReplacementSchema, {
    defaultValues: initialValues,
  });
  const { field: pieces } = useController({
    control: form.control,
    name: "pieces",
  });
  const values = form.watch(),
    errors = form.formState.errors,
    isDirty = form.formState.isDirty;
  const [search, setSearch] = useState(
    entry.kind === "new" && entry.customerPrefill.kind === "phone"
      ? entry.customerPrefill.phone
      : (draft?.customer?.name ?? ""),
  );
  const currentDraft = useDraft(base.kind === "saved" ? base.id : null);
  const selected = useCustomer(values.customerId),
    customers = useCustomerList({ search, page: 1, limit: 25 });
  const selectedCustomer = selected.data?.customer ?? null;
  const prefill = useCustomerByPhone(
    entry.kind === "new" && entry.customerPrefill.kind === "phone"
      ? entry.customerPrefill.phone
      : null,
  );
  const prefillDone = useRef(false),
    mounted = useRef(false),
    inlineLatch = useRef(false),
    restoreFocus = useRef(false);
  const formElement = useRef<HTMLFormElement | null>(null),
    banner = useRef<HTMLDivElement | null>(null),
    cells = useRef(new Map<string, HTMLElement>());
  const [inlineOpen, setInlineOpen] = useState(false),
    [phase, setPhase] = useState<
      "editing" | "pending" | "unknown" | "confirmed" | "retryable" | "checking"
    >("editing");
  const [error, setError] = useState<string | null>(null),
    [savedNotice, setSavedNotice] = useState<string | null>(null),
    [rowNotice, setRowNotice] = useState<string | null>(null),
    [conflict, setConflict] = useState(false);
  const retained = useRef<RetainedDraft | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const command = useSalesCommand(),
    receipt = useSalesCommandReceipt(receiptId);
  const navigatingToSavedDraft = entry.kind === "new" && base.kind === "saved";
  const locked = phase !== "editing" || inlineOpen || navigatingToSavedDraft;
  const current = () =>
    mounted.current && isCurrentOperationalScope(client, scope);
  const canEdit = () =>
    current() &&
    phase === "editing" &&
    !navigatingToSavedDraft &&
    retained.current === null &&
    !inlineLatch.current;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      prefillDone.current ||
      navigatingToSavedDraft ||
      phase !== "editing" ||
      !isCurrentOperationalScope(client, scope) ||
      prefill.data === undefined
    )
      return;
    prefillDone.current = true;
    form.setValue("customerId", prefill.data.customer.id, {
      shouldDirty: true,
    });
  }, [prefill.data, phase, navigatingToSavedDraft, client, scope, form]);
  useEffect(() => {
    if (!inlineOpen && restoreFocus.current) {
      restoreFocus.current = false;
      formElement.current
        ?.querySelector<HTMLButtonElement>("[data-create-customer]")
        ?.focus();
    }
  }, [inlineOpen]);
  const focusFirstError = useCallback(() => {
    for (const header of headers) {
      if (form.getFieldState(header).error === undefined) continue;
      const element = formElement.current?.elements.namedItem(
        header === "customerId" ? "customerSearch" : header,
      );
      if (element instanceof HTMLElement) {
        element.focus();
        return;
      }
    }
    const currentPieces = form.getValues().pieces;
    for (const [index, piece] of currentPieces.entries())
      for (const field of DRAFT_PIECE_CAPTURE_FIELDS) {
        const position = String(index) as `${number}`;
        const path: `pieces.${number}.${DraftPieceCaptureField}` = `pieces.${position}.${field}`;
        if (form.getFieldState(path).error === undefined) continue;
        const element = cells.current.get(`${piece.id}:${field}`);
        if (element !== undefined) {
          element.focus();
          return;
        }
      }
    banner.current?.focus();
  }, [form]);
  useEffect(() => {
    if (error !== null && phase === "editing" && !inlineOpen) focusFirstError();
  }, [error, phase, inlineOpen, focusFirstError]);
  const fieldMessages: Record<string, string> = {};
  if (Object.keys(errors).length > 0) {
    for (const header of headers)
      if (form.getFieldState(header).error !== undefined)
        fieldMessages[header] = "يرجى مراجعة القيمة المدخلة.";
    for (const [index, piece] of pieces.value.entries())
      for (const field of DRAFT_PIECE_CAPTURE_FIELDS) {
        const position = String(index) as `${number}`;
        const path: `pieces.${number}.${DraftPieceCaptureField}` = `pieces.${position}.${field}`;
        if (form.getFieldState(path).error !== undefined)
          fieldMessages[`${piece.id}:${field}`] = "يرجى مراجعة القيمة المدخلة.";
      }
  }
  const invalidCells = new Set(
    Object.keys(fieldMessages).filter((key) => key.includes(":")),
  );
  const edited = () => {
    setSavedNotice(null);
    setError(null);
    setRowNotice(null);
  };
  const replacePieces = (next: DraftFormValues["pieces"]) => {
    if (!canEdit()) return;
    form.clearErrors("pieces");
    pieces.onChange(next);
    edited();
  };
  const addPiece = () => {
    if (!canEdit() || pieces.value.length >= MAX_DRAFT_PIECES) return;
    replacePieces([...pieces.value, makeBlankDraftPiece()]);
    setRowNotice("أضيفت قطعة محلياً؛ تحتاج إلى حفظ المسودة.");
  };
  const duplicatePiece = (id: string) => {
    if (!canEdit() || pieces.value.length >= MAX_DRAFT_PIECES) return;
    const index = pieces.value.findIndex((piece) => piece.id === id),
      source = pieces.value[index];
    if (source === undefined) return;
    const copy = makeBlankDraftPiece();
    for (const field of DRAFT_PIECE_CAPTURE_FIELDS) copy[field] = source[field];
    replacePieces([
      ...pieces.value.slice(0, index + 1),
      copy,
      ...pieces.value.slice(index + 1),
    ]);
    setRowNotice("نُسخت مواصفات القطعة بمعرّف جديد؛ لم تُحفظ بعد.");
  };
  const deletePiece = (id: string) => {
    if (!canEdit() || pieces.value.length <= 1) return;
    replacePieces(pieces.value.filter((piece) => piece.id !== id));
    setRowNotice("أزيلت القطعة محلياً؛ تحتاج إلى حفظ المسودة.");
  };
  const changeLines = (lines: ProductLine[]) => {
    if (!canEdit()) return;
    pieces.onChange(fromDraftPaperLines(lines));
    edited();
  };
  const chooseCustomer = (customer: CustomerSummary) => {
    if (!canEdit()) return;
    prefillDone.current = true;
    form.setValue("customerId", customer.id, { shouldDirty: true });
    setSearch(customer.name);
    edited();
  };
  const changeSearch = (value: string) => {
    if (!canEdit()) return;
    prefillDone.current = true;
    setSearch(value.slice(0, 150));
    const canonical = customerPhoneSchema.safeParse(value);
    if (
      selectedCustomer === null ||
      (value !== selectedCustomer.name &&
        (!canonical.success || canonical.data !== selectedCustomer.phone))
    )
      form.setValue("customerId", null, { shouldDirty: true });
    edited();
  };
  const clearCustomer = () => {
    if (!canEdit()) return;
    prefillDone.current = true;
    form.setValue("customerId", null, { shouldDirty: true });
    setSearch("");
    edited();
  };
  const openInline = () => {
    if (!canEdit()) return;
    prefillDone.current = true;
    inlineLatch.current = true;
    setInlineOpen(true);
  };
  const closeInline = () => {
    if (!current()) return;
    inlineLatch.current = false;
    restoreFocus.current = true;
    setInlineOpen(false);
  };
  const createdCustomer = (customer: CustomerDto) => {
    if (!current() || !inlineLatch.current) return;
    prefillDone.current = true;
    form.setValue("customerId", customer.id, { shouldDirty: true });
    setSearch(customer.name);
    setSavedNotice(null);
    setError(null);
    setRowNotice(
      "تم اختيار العميل المؤكد؛ يُحفظ الربط مع الحفظ الصريح للمسودة.",
    );
    closeInline();
  };
  const changeAdjustments = (updates: OrderAdjustmentFields) => {
    if (!canEdit()) return;
    for (const field of [
      "adjustmentRequested",
      "adjustmentReason",
      "adjustmentActionTaken",
    ] as const) {
      const value = updates[field];
      if (value !== undefined)
        form.setValue(field, value, { shouldDirty: true });
    }
    edited();
  };
  const finish = (saved: SalesCommandData) => {
    const intent = retained.current;
    if (
      intent === null ||
      !current() ||
      intent.snapshot.formToken !== formToken
    )
      return;
    assertDraftResult(saved, intent);
    const latest = draftDataSchema.safeParse(
      client.getQueryData(draftKeys.detail(scope, saved.receipt.resourceId)),
    );
    if (
      !latest.success ||
      latest.data.draft.id !== saved.receipt.resourceId ||
      latest.data.draft.version < saved.receipt.afterVersion
    )
      throw new SalesSynchronizationError(saved, null);
    const wasNew = base.kind === "new";
    form.reset(makeDraftDefaults(latest.data.draft));
    setBase({
      kind: "saved",
      id: latest.data.draft.id,
      version: latest.data.draft.version,
    });
    setSearch(latest.data.draft.customer?.name ?? "");
    retained.current = null;
    setReceiptId(null);
    setPhase("editing");
    setConflict(false);
    setError(null);
    setRowNotice(null);
    setSavedNotice(
      "تم حفظ المسودة بنجاح؛ التغييرات اللاحقة تحتاج إلى حفظ جديد.",
    );
    if (wasNew && current())
      router.replace(draftEditRoute(latest.data.draft.id));
  };
  const perform = async (intent: RetainedDraft) => {
    if (intent.running || !current()) return;
    intent.running = true;
    setPhase("pending");
    setError(null);
    setSavedNotice(null);
    try {
      const saved = await command.mutateAsync(intent.variables);
      intent.confirmed = saved;
      finish(saved);
    } catch (failure: unknown) {
      if (!current()) return;
      if (failure instanceof SalesSynchronizationError) {
        intent.confirmed = failure.result;
        setPhase("confirmed");
        setError("تم الحفظ؛ تعذّر تحديث العرض.");
      } else if (
        intent.unknown ||
        isUnknownSalesWrite(failure) ||
        getApiError(failure).code === "SALES_COMMAND_CONFLICT"
      ) {
        intent.unknown = true;
        setPhase("unknown");
        setError("لم تتأكد نتيجة الحفظ بعد؛ احتفظ بالعملية نفسها وتحقق منها.");
      } else if (getApiError(failure).code === "SALES_TRANSACTION_CONFLICT") {
        setPhase("retryable");
        setError("تعذّر إتمام العملية؛ يمكنك إعادة محاولة الحفظ نفسه.");
      } else {
        retained.current = null;
        setReceiptId(null);
        setPhase("editing");
        setConflict(
          getApiError(failure).code === "DRAFT_VERSION_CONFLICT" ||
            getApiError(failure).code === "DRAFT_STATE_CONFLICT" ||
            getApiError(failure).code === "DRAFT_PIECE_CONFLICT",
        );
        setError(applyDraftCommandError(failure, form, intent.snapshot));
      }
    } finally {
      intent.running = false;
    }
  };
  const submit = (capture: DraftCapture) => {
    if (!canEdit() || conflict) return;
    prefillDone.current = true;
    const commandId = crypto.randomUUID();
    let frozen: DraftIntent;
    if (base.kind === "new") {
      const body = createDraftBodySchema.parse({ commandId, draft: capture });
      freezeCapture(body.draft);
      Object.freeze(body);
      frozen = Object.freeze({ operation: "CREATE_DRAFT", body });
    } else {
      const body = saveDraftBodySchema.parse({
        commandId,
        expectedVersion: base.version,
        draft: capture,
      });
      freezeCapture(body.draft);
      Object.freeze(body);
      frozen = Object.freeze({
        operation: "SAVE_DRAFT",
        draftId: base.id,
        body,
      });
    }
    const variables = Object.freeze({
      scope: Object.freeze({ ...scope }),
      command: frozen,
    });
    const snapshot = Object.freeze({
      capture: frozen.body.draft,
      formToken,
      scope: variables.scope,
    });
    const intent: RetainedDraft = {
      variables,
      snapshot,
      unknown: false,
      confirmed: null,
      running: false,
    };
    retained.current = intent;
    setReceiptId(commandId);
    void perform(intent);
  };
  const observe = async () => {
    const intent = retained.current;
    if (intent === null || intent.running || !current()) return;
    intent.running = true;
    setPhase("checking");
    try {
      if (intent.confirmed === null) {
        const observed = await receipt.refetch({ throwOnError: true });
        if (observed.data === undefined) throw new ApiContractError();
        assertDraftResult(observed.data, intent);
        intent.confirmed = observed.data;
      }
      await synchronizeSalesCommand(client, scope, intent.confirmed);
      finish(intent.confirmed);
    } catch (failure: unknown) {
      if (!current()) return;
      setPhase(intent.confirmed === null ? "unknown" : "confirmed");
      setError(
        intent.confirmed === null
          ? getApiError(failure).statusCode === 404
            ? "لم تظهر نتيجة محفوظة بعد؛ لم تتأكد نتيجة العملية السابقة."
            : "تعذّر التحقق من نتيجة الحفظ؛ احتفظ بالعملية نفسها."
          : "تم الحفظ؛ تعذّر تحديث العرض.",
      );
    } finally {
      intent.running = false;
    }
  };
  const reload = async () => {
    if (!canEdit() || base.kind !== "saved") return;
    setPhase("checking");
    try {
      const latest = await client.fetchQuery({
        ...draftDetailOptions(client, scope, base.id),
        staleTime: 0,
      });
      if (!current()) return;
      form.reset(makeDraftDefaults(latest.draft));
      setBase({
        kind: "saved",
        id: latest.draft.id,
        version: latest.draft.version,
      });
      setSearch(latest.draft.customer?.name ?? "");
      setConflict(false);
      setError(null);
      setSavedNotice(null);
      setRowNotice(null);
    } catch {
      if (current())
        setError("تعذّر تحميل المسودة الحالية؛ احتفظ بإدخالك وحاول مجدداً.");
    } finally {
      if (current()) setPhase("editing");
    }
  };
  const serverDraft = currentDraft.data?.draft ?? draft;
  const newer =
    serverDraft !== undefined &&
    base.kind === "saved" &&
    serverDraft.id === base.id &&
    serverDraft.version > base.version;
  const paper = toDraftPaper(values, {
    ownerName: serverDraft?.owner.fullName ?? ownerName,
    createdAt: serverDraft?.createdAt ?? null,
    draftId: base.kind === "saved" ? base.id : null,
    customer: selectedCustomer,
  });
  const customerError = selected.isError
    ? selected.error
    : customers.isError
      ? customers.error
      : null;
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات / إنشاء وتعديل الطلبات"
        title={
          base.kind === "saved"
            ? `تعديل المسودة (${base.id})`
            : "إنشاء أمر تفصيل جديد"
        }
        subtitle="مسودة غير مقدمة؛ المرجع تقني والتسعير والإرسال غير متاحين حتى تفعيل متطلباتهما"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="submit"
              form={formId}
              disabled={locked || conflict}
              className="btn-pill btn-outline"
            >
              حفظ كمسودة
            </button>
            <Link href="/sales/orders" className="btn-pill btn-outline">
              العودة
            </Link>
          </div>
        }
      />
      {phase === "editing" && currentDraft.isError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          تعذّر تحديث المسودة الحالية؛ إدخالك لم يتغير.{" "}
          {getApiError(currentDraft.error).requestId}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void currentDraft.refetch();
            }}
          >
            إعادة محاولة التحديث
          </button>
        </div>
      )}
      {savedNotice !== null && !isDirty && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800"
        >
          <CheckCircle2 size={16} />
          <span>{savedNotice}</span>
        </div>
      )}
      {rowNotice !== null && (
        <p role="status" className="text-xs text-slate-600">
          {rowNotice}
        </p>
      )}
      {isDirty && (
        <p className="text-xs text-slate-500">توجد تغييرات غير محفوظة.</p>
      )}
      {error !== null && (
        <div
          ref={banner}
          tabIndex={-1}
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800"
        >
          <AlertCircle size={16} />
          <span>{error}</span>
          {phase === "editing" && (
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={focusFirstError}
            >
              الانتقال إلى أول خطأ
            </button>
          )}
        </div>
      )}
      {(conflict || newer) && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          توجد بيانات أحدث؛ يبقى إدخالك حتى تختار المراجعة.
          <button
            type="button"
            disabled={locked}
            className="btn-pill btn-outline"
            onClick={() => {
              void reload();
            }}
          >
            إعادة التحميل والمراجعة
          </button>
        </div>
      )}
      {phase !== "editing" && (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <p>
            {phase === "pending"
              ? "جارٍ حفظ المسودة؛ المغادرة لا تؤكد التراجع عن العملية."
              : phase === "checking"
                ? "جارٍ التحقق وتحديث العرض..."
                : phase === "confirmed"
                  ? "تم الحفظ؛ تعذّر تحديث العرض."
                  : phase === "retryable"
                    ? "تعذّر إتمام العملية؛ أعد محاولة الحفظ نفسه."
                    : "نتيجة الحفظ غير مؤكدة؛ احتفظ بالعملية نفسها."}
          </p>
          {(phase === "unknown" || phase === "confirmed") && (
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                void observe();
              }}
            >
              {phase === "confirmed" ? "تحديث العرض" : "التحقق من الحفظ"}
            </button>
          )}
          {(phase === "unknown" || phase === "retryable") && (
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                const intent = retained.current;
                if (intent !== null) void perform(intent);
              }}
            >
              إعادة محاولة الحفظ نفسه
            </button>
          )}
        </div>
      )}
      {entry.kind === "new" &&
        (entry.customerPrefill.kind === "invalid" || prefill.isError) && (
          <p role="alert" className="text-xs text-amber-800">
            تعذّر تحديد العميل المطلوب؛ يمكنك اختيار عميل صراحةً أو حفظ المسودة
            دونه.
          </p>
        )}
      <form
        ref={formElement}
        id={formId}
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit, () => {
            setError("يرجى مراجعة الحقول غير الصالحة؛ لم تُرسل المسودة.");
            setSavedNotice(null);
          })(event);
        }}
        className="space-y-6"
      >
        <fieldset disabled={locked} className="min-w-0 space-y-6 border-0 p-0">
          <SalesCustomerSection
            search={search}
            onSearchChange={changeSearch}
            selectedCustomer={selectedCustomer}
            results={customers.data?.customers.map((row) => row.customer) ?? []}
            queryState={{
              loading:
                customers.isPending ||
                (values.customerId !== null && selected.isPending),
              fetching: customers.isFetching || selected.isFetching,
              error:
                customerError === null
                  ? null
                  : `تعذّر تحميل بيانات العملاء. ${getApiError(customerError).requestId}`,
              onRetry: () => {
                void customers.refetch();
                if (values.customerId !== null) void selected.refetch();
              },
            }}
            onSelect={chooseCustomer}
            onClear={clearCustomer}
            onCreateCustomer={openInline}
          />
          <SalesOrderMetadataSection
            salespersonName={serverDraft?.owner.fullName ?? ownerName}
            errors={fieldMessages}
            orderType={values.type}
            onOrderTypeChange={(type) => {
              if (canEdit()) {
                form.setValue("type", type, { shouldDirty: true });
                edited();
              }
            }}
            deliveryDate={values.deliveryDate ?? ""}
            onDeliveryDateChange={(date) => {
              if (canEdit()) {
                form.setValue("deliveryDate", date === "" ? null : date, {
                  shouldDirty: true,
                });
                edited();
              }
            }}
            repairNote={values.repairNote ?? ""}
            onRepairNoteChange={(note) => {
              if (canEdit()) {
                form.setValue("repairNote", note, { shouldDirty: true });
                edited();
              }
            }}
            adjustmentFields={{
              adjustmentRequested: values.adjustmentRequested ?? "",
              adjustmentReason: values.adjustmentReason ?? "",
              adjustmentActionTaken: values.adjustmentActionTaken ?? "",
            }}
            onAdjustmentFieldsChange={changeAdjustments}
          />
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  ٣. جدول المنتجات ومواصفات أمر التفصيل الورقي
                </h2>
                <p className="text-xs text-slate-500">
                  أدخل البيانات مباشرة داخل خلايا الجدول مطابقةً للنموذج المرجعي
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-pill btn-outline text-xs text-teal-700"
                  disabled={pieces.value.length >= MAX_DRAFT_PIECES}
                  onClick={addPiece}
                >
                  + إضافة قطعة جديدة
                </button>
                <button
                  type="button"
                  className="btn-pill btn-outline text-xs text-rose-600"
                  disabled={pieces.value.length <= 1}
                  onClick={() => {
                    const last = pieces.value.at(-1);
                    if (last !== undefined) deletePiece(last.id);
                  }}
                >
                  حذف آخر قطعة
                </button>
              </div>
            </div>
            <OrderPaperForm
              order={paper}
              mode={
                locked ? "readOnly" : base.kind === "saved" ? "edit" : "create"
              }
              lines={toDraftPaperLines(values)}
              dataState={dataState}
              onLinesChange={changeLines}
              invalidCells={invalidCells}
              fieldErrorMessages={fieldMessages}
              onFieldElement={(id, field, element) => {
                if (element === null) cells.current.delete(`${id}:${field}`);
                else cells.current.set(`${id}:${field}`, element);
              }}
              onDuplicatePiece={duplicatePiece}
              onDeletePiece={deletePiece}
              onAddPiece={addPiece}
              onTotalsChange={(totals) => {
                if (canEdit()) {
                  form.setValue("paidAmount", totals.paid, {
                    shouldDirty: true,
                  });
                  edited();
                }
              }}
              onGeneralNotesChange={(notes) => {
                if (canEdit()) {
                  form.setValue("generalNotes", notes, { shouldDirty: true });
                  edited();
                }
              }}
              onSignatureChange={(signature) => {
                if (canEdit()) {
                  form.setValue("responsibleSignature", signature, {
                    shouldDirty: true,
                  });
                  edited();
                }
              }}
              onAdjustmentFieldsChange={changeAdjustments}
            />
          </div>
          <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-lg backdrop-blur-md">
            <span className="text-xs text-slate-600">
              إجمالي الكمية المدخلة: <strong>{pieces.value.length} قطعة</strong>
            </span>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={locked || conflict}
                className="btn-pill btn-outline"
              >
                حفظ كمسودة
              </button>
              <button type="button" disabled className="btn-pill btn-teal">
                <Send size={15} />
                <span>إرسال للاعتماد</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            الإرسال والرقم المعتمد والطباعة الرسمية غير متاحة للمسودة؛ يمكنك
            الاستمرار في حفظها غير مكتملة.
          </p>
        </fieldset>
      </form>
      {inlineOpen && (
        <InlineCustomerModal
          onClose={closeInline}
          onCreated={createdCustomer}
          originScope={scope}
          originFormToken={formToken}
        />
      )}
    </div>
  );
}
