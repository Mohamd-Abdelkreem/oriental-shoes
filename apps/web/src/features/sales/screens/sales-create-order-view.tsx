"use client";

import { formatDraftReference } from "@template/contracts";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useController } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { useToast } from "@/components/toast";
import {
  authUserDataSchema,
  customerPhoneSchema,
  catalogQuoteBodySchema,
  draftDataSchema,
  salesOrderEditorDataSchema,
  submissionCaptureSchema,
  submitOrderBodySchema,
  resubmitOrderBodySchema,
  type SalesOrderDto,
  type SalesOrderEditorData,
  draftPieceCaptureSchema,
  type CatalogField,
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
import { localValidationMessage } from "@/shared/validation/validation-copy";
import {
  customerKeys,
  useCustomer,
  useCustomerByPhone,
  useCustomerList,
} from "@/features/customers/hooks/customers.hooks";
import {
  catalogKeys,
  CatalogSourceChangedError,
  useCatalog,
  useOrderQuote,
} from "../hooks/catalogs.hooks";
import {
  applyCatalogSelection,
  catalogQuoteKey,
  makeCatalogQuoteInput,
  toPaperCatalogOptions,
} from "../model/catalog-paper.model";
import { draftKeys } from "../hooks/drafts.hooks";
import {
  useOrderEditor,
  orderKeys,
  orderEditorOptions,
} from "../hooks/orders.hooks";
import {
  applyOrderCommandError,
  orderCaptureIssueMessage,
  makeReturnedOrderDefaults,
  toReturnedOrderCorrections,
} from "../model/order-form.model";
import {
  toSubmittedPaper,
  toAuthoritativePaperState,
} from "../model/order-view.model";
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
  type CatalogSelectionChange,
  type OrderPaperDataState,
} from "@/features/orders/components/order-paper-form";
import { orderTypeLabels } from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  ApiContractError,
  apiFailureMessage,
  getApiError,
} from "@/services/api/api-client";
import { SalesCustomerSection } from "./sales-customer-section";
import { SalesOrderMetadataSection } from "./sales-order-metadata-section";
import { InlineCustomerModal } from "./inline-customer-modal";
import { OrderEditorErrorToast } from "./order-editor-error-toast";

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
type EditorIntent = Extract<
  SalesCommandIntent,
  {
    operation:
      | "CREATE_DRAFT"
      | "SAVE_DRAFT"
      | "SUBMIT_NEW_ORDER"
      | "SUBMIT_DRAFT"
      | "RESUBMIT_ORDER";
  }
>;
type OrderReviewReason = "quote" | "customer" | "resource";
const reviewReasonByErrorCode: Readonly<Record<string, OrderReviewReason>> = {
  DRAFT_VERSION_CONFLICT: "resource",
  DRAFT_STATE_CONFLICT: "resource",
  DRAFT_PIECE_CONFLICT: "resource",
  ORDER_VERSION_CONFLICT: "resource",
  ORDER_STATE_CONFLICT: "resource",
  ORDER_CORRECTION_CONFLICT: "resource",
  ORDER_QUOTE_CHANGED: "quote",
  ORDER_CUSTOMER_CHANGED: "customer",
};
type DraftBase =
  | { kind: "new" }
  | {
      kind: "saved";
      id: string;
      version: number;
      draftSequence?: string | undefined;
    };
type RetainedEditorCommand = {
  variables: Readonly<{ scope: OperationalScope; command: EditorIntent }>;
  snapshot: DraftSubmitSnapshot;
  unknown: boolean;
  confirmed: SalesCommandData | null;
  running: boolean;
};
const freezeCapture = (capture: DraftCapture): void => {
  for (const piece of capture.pieces) {
    if (piece.catalogSelections !== undefined)
      Object.freeze(piece.catalogSelections);
    Object.freeze(piece);
  }
  Object.freeze(capture.pieces);
  Object.freeze(capture);
};
const assertEditorResult = (
  saved: SalesCommandData,
  intent: RetainedEditorCommand,
): void => {
  const { command, scope } = intent.variables;
  if (
    saved.kind !==
      (command.operation === "CREATE_DRAFT" ||
      command.operation === "SAVE_DRAFT"
        ? "draft"
        : "order") ||
    saved.receipt.operation !== command.operation ||
    saved.receipt.commandId !== command.body.commandId ||
    saved.receipt.actor.id !== scope.actorId ||
    ((command.operation === "SAVE_DRAFT" ||
      command.operation === "SUBMIT_DRAFT") &&
      saved.receipt.resourceId !==
        (command.operation === "SAVE_DRAFT"
          ? command.draftId
          : command.body.draftId))
  )
    throw new ApiContractError();
  if (
    command.operation === "RESUBMIT_ORDER" &&
    saved.receipt.resourceId !== command.orderId
  )
    throw new ApiContractError();
};

export function SalesCreateOrderView({ entry }: { entry: DraftEditorEntry }) {
  const scope = useOperationalScope(),
    session = useSession();
  const draft = useOrderEditor(entry.kind === "edit" ? entry.draftId : null);
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
      <div>
        <OrderEditorErrorToast message="رابط المسودة غير صالح؛ افتحها من قائمة المسودات." />
        <Link href="/sales/orders/drafts" className="btn-pill btn-outline">
          المسودات
        </Link>
      </div>
    );
  if (entry.kind === "edit" && draft.isError && draft.data === undefined)
    return (
      <div>
        <OrderEditorErrorToast
          error={draft.error}
          message={
            getApiError(draft.error).statusCode === 404
              ? "المسودة غير موجودة أو غير متاحة؛ ارجع إلى قائمة المسودات."
              : "تعذّر تحميل المسودة؛ أعد المحاولة."
          }
        />
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
    <ResolvedEditor
      key={`${scope.actorId}:${String(scope.accessVersion)}:${String(scope.epoch)}:${target}`}
      entry={entry}
      scope={scope}
      resource={draft.data}
      resourceRead={draft}
      actorName={actor.data.user.fullName}
    />
  );
}
function ResolvedEditor({
  entry,
  scope,
  resource,
  resourceRead,
  actorName,
}: {
  entry: Exclude<DraftEditorEntry, { kind: "invalid" }>;
  scope: OperationalScope;
  resource: SalesOrderEditorData | undefined;
  resourceRead: Pick<
    ReturnType<typeof useOrderEditor>,
    "error" | "isError" | "isFetching" | "refetch"
  >;
  actorName: string;
}) {
  const [editableSession, setEditableSession] = useState<{
    resource: SalesOrderEditorData | undefined;
  } | null>(null);
  if (editableSession === null) {
    if (
      resource?.kind === "submitted" &&
      (resource.order.status !== "RETURNED" ||
        !resource.order.allowedActions.canResubmit ||
        resource.order.owner.id !== scope.actorId)
    )
      return (
        <div className="space-y-4">
          {resourceRead.isError && (
            <div>
              <OrderEditorErrorToast
                error={resourceRead.error}
                message="تعذّر تحديث الطلب الحالي؛ البيانات المعروضة محفوظة. أعد محاولة التحديث."
              />
              <button
                type="button"
                className="btn-pill btn-outline"
                disabled={resourceRead.isFetching}
                onClick={() => {
                  void resourceRead.refetch();
                }}
              >
                إعادة محاولة التحديث
              </button>
            </div>
          )}
          <p>هذا الطلب مقدم؛ راجع بياناته الحالية.</p>
          <Link
            href={`/sales/orders/${resource.order.id}`}
            className="btn-pill btn-outline"
          >
            عرض الطلب
          </Link>
          <OrderPaperForm
            order={toSubmittedPaper(resource.order)}
            displayReference={resource.order.businessNumber}
            mode="readOnly"
            dataState={toAuthoritativePaperState(resource.order, null)}
          />
        </div>
      );
    setEditableSession({ resource });
    return null;
  }
  const initial = editableSession.resource;
  return (
    <DraftEditor
      entry={entry}
      scope={scope}
      returnedOrder={initial?.kind === "submitted" ? initial.order : undefined}
      draft={initial?.kind === "draft" ? initial.draft : undefined}
      ownerName={
        initial?.kind === "draft" ? initial.draft.owner.fullName : actorName
      }
    />
  );
}

function DraftEditor({
  entry,
  scope,
  draft,
  ownerName,
  returnedOrder,
}: {
  entry: Exclude<DraftEditorEntry, { kind: "invalid" }>;
  scope: OperationalScope;
  draft: DraftDto | undefined;
  ownerName: string;
  returnedOrder: SalesOrderDto | undefined;
}) {
  "use no memo";
  const router = useRouter(),
    client = useQueryClient(),
    formId = useId();
  const { toast } = useToast();
  const [originalOrder] = useState(returnedOrder);
  const correctionMode = originalOrder !== undefined;
  const [initialValues] = useState(() =>
    originalOrder === undefined
      ? makeDraftDefaults(draft)
      : makeReturnedOrderDefaults(originalOrder),
  );
  const [formToken] = useState<object>(() => ({}));
  const [base, setBase] = useState<DraftBase>(() =>
    originalOrder !== undefined
      ? { kind: "saved", id: originalOrder.id, version: originalOrder.version }
      : draft === undefined
        ? { kind: "new" }
        : {
            kind: "saved",
            id: draft.id,
            version: draft.version,
            draftSequence: draft.draftSequence,
          },
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
  const catalog = useCatalog();
  const rawQuoteInput =
    !correctionMode && catalog.data?.availability === "available"
      ? makeCatalogQuoteInput(values, catalog.data.sourceId)
      : null;
  const quotePieces = catalogQuoteBodySchema.shape.pieces.safeParse(
    rawQuoteInput?.pieces,
  );
  const quoteInput =
    rawQuoteInput !== null && quotePieces.success
      ? { ...rawQuoteInput, pieces: quotePieces.data }
      : null;
  const quote = useOrderQuote(quoteInput);
  const { refetch: refetchQuote } = quote;

  const currentDraft = useOrderEditor(
    !correctionMode && base.kind === "saved" ? base.id : null,
  );
  const currentOrder = useOrderEditor(
    correctionMode && base.kind === "saved" ? base.id : null,
  );
  const currentResource = correctionMode ? currentOrder : currentDraft;
  const selected = useCustomer(correctionMode ? null : values.customerId),
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
    cells = useRef(new Map<string, HTMLElement>());
  const [inlineOpen, setInlineOpen] = useState(false),
    [phase, setPhase] = useState<
      "editing" | "pending" | "unknown" | "confirmed" | "retryable" | "checking"
    >("editing");
  const [errorNotice, setErrorNotice] = useState<{ message: string } | null>(
    null,
  );
  const setError = useCallback((message: string | null) => {
    setErrorNotice(message === null ? null : { message });
  }, []);
  const [savedNotice, setSavedNotice] = useState<string | null>(null),
    [rowNotice, setRowNotice] = useState<string | null>(null),
    [conflict, setConflict] = useState<OrderReviewReason | null>(null);
  const [quoteReviewSource, setQuoteReviewSource] = useState<string | null>(
    null,
  );
  const retained = useRef<RetainedEditorCommand | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const quoteIntent =
    quoteInput === null
      ? null
      : {
          sourceId: quoteInput.sourceId,
          key: catalogQuoteKey({ ...quoteInput, sourceId: "" }),
        };
  const [reviewedQuoteIntent, setReviewedQuoteIntent] = useState(quoteIntent);
  const sourceReplaced =
    reviewedQuoteIntent !== null &&
    quoteIntent !== null &&
    reviewedQuoteIntent.key === quoteIntent.key &&
    reviewedQuoteIntent.sourceId !== quoteIntent.sourceId;
  const quoteIntentKey = quoteIntent?.key ?? null;
  if (reviewedQuoteIntent?.key !== quoteIntent?.key)
    setReviewedQuoteIntent(quoteIntent);
  if (
    !correctionMode &&
    conflict === null &&
    receiptId === null &&
    (phase === "editing" || phase === "checking") &&
    isCurrentOperationalScope(client, scope) &&
    (sourceReplaced || quote.error instanceof CatalogSourceChangedError)
  ) {
    setConflict("quote");
    setError("تغير مصدر القوائم؛ راجع القوائم وعرض السعر الحالي قبل الإرسال.");
  }

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
  const completeReview = useCallback(() => {
    if (!mounted.current || !isCurrentOperationalScope(client, scope)) return;
    setConflict(null);
    setQuoteReviewSource(null);
    setError(null);
    setPhase("editing");
  }, [client, scope, setError]);
  const rejectReview = useCallback(() => {
    if (!mounted.current || !isCurrentOperationalScope(client, scope)) return;
    setQuoteReviewSource(null);
    setPhase("editing");
    setError("تعذّر تحديث بيانات المراجعة؛ احتفظ بإدخالك وحاول مجدداً.");
  }, [client, scope, setError]);
  // The quote observer must use the catalog returned by this explicit review.
  useEffect(() => {
    if (quoteReviewSource === null) return;
    if (quoteInput?.sourceId !== quoteReviewSource) {
      rejectReview();
      return;
    }
    let active = true;
    void refetchQuote({ throwOnError: true, cancelRefetch: false }).then(
      ({ data }) => {
        if (!active || !isCurrentOperationalScope(client, scope)) return;
        if (
          data?.availability === "available" &&
          data.sourceId === quoteReviewSource
        ) {
          setReviewedQuoteIntent(
            quoteIntentKey === null
              ? null
              : { key: quoteIntentKey, sourceId: quoteReviewSource },
          );
          completeReview();
        } else rejectReview();
      },
      () => {
        if (active) rejectReview();
      },
    );
    return () => {
      active = false;
    };
  }, [
    client,
    scope,
    quoteReviewSource,
    quoteIntentKey,
    quoteInput?.sourceId,
    refetchQuote,
    completeReview,
    rejectReview,
  ]);
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
    formElement.current?.focus();
  }, [form]);
  useEffect(() => {
    if (errorNotice === null) return;
    toast.error(errorNotice.message);
  }, [errorNotice, toast]);
  useEffect(() => {
    if (errorNotice === null) return;
    if (phase === "editing" && !inlineOpen) focusFirstError();
  }, [errorNotice, phase, inlineOpen, focusFirstError]);
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
    if (correctionMode || !canEdit() || pieces.value.length >= MAX_DRAFT_PIECES)
      return;
    replacePieces([...pieces.value, makeBlankDraftPiece()]);
    setRowNotice("أضيفت قطعة محلياً؛ تحتاج إلى حفظ المسودة.");
  };
  const duplicatePiece = (id: string) => {
    if (correctionMode || !canEdit() || pieces.value.length >= MAX_DRAFT_PIECES)
      return;
    const index = pieces.value.findIndex((piece) => piece.id === id),
      source = pieces.value[index];
    if (source === undefined) return;
    const copy = makeBlankDraftPiece();
    for (const field of DRAFT_PIECE_CAPTURE_FIELDS) copy[field] = source[field];
    if (source.catalogSelections !== undefined)
      copy.catalogSelections = { ...source.catalogSelections };
    replacePieces([
      ...pieces.value.slice(0, index + 1),
      copy,
      ...pieces.value.slice(index + 1),
    ]);
    setRowNotice("نُسخت مواصفات القطعة بمعرّف جديد؛ لم تُحفظ بعد.");
  };
  const deletePiece = (id: string) => {
    if (correctionMode || !canEdit() || pieces.value.length <= 1) return;
    replacePieces(pieces.value.filter((piece) => piece.id !== id));
    setRowNotice("أزيلت القطعة محلياً؛ تحتاج إلى حفظ المسودة.");
  };
  const changeLines = (lines: ProductLine[]) => {
    if (!canEdit()) return;
    pieces.onChange(fromDraftPaperLines(lines, pieces.value));
    edited();
  };
  const changeCatalogSelection = (
    pieceId: string,
    field: CatalogField,
    selection: CatalogSelectionChange,
  ) => {
    if (!canEdit() || (correctionMode && field === "decoration")) return;
    const next = pieces.value.map((piece) =>
      piece.id === pieceId
        ? applyCatalogSelection(
            draftPieceCaptureSchema.parse(piece),
            field,
            selection,
          )
        : piece,
    );
    replacePieces(next);
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
    setError(null);
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
    assertEditorResult(saved, intent);
    const editor = salesOrderEditorDataSchema.safeParse(
      client.getQueryData(orderKeys.editor(scope, saved.receipt.resourceId)),
    );
    if (
      editor.success &&
      editor.data.kind === "submitted" &&
      editor.data.order.version >= saved.receipt.afterVersion
    ) {
      retained.current = null;
      setReceiptId(null);
      setPhase("confirmed");
      if (saved.kind === "order")
        toast.success(
          saved.receipt.operation === "RESUBMIT_ORDER"
            ? "تم إرسال أمر التفصيل للاعتماد مرة أخرى"
            : "تم إرسال أمر التفصيل للاعتماد",
        );
      router.replace(`/sales/orders/${editor.data.order.id}`);
      return;
    }
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
      draftSequence: latest.data.draft.draftSequence,
    });
    setSearch(latest.data.draft.customer?.name ?? "");
    retained.current = null;
    setReceiptId(null);
    setPhase("editing");
    setConflict((reason) => (reason === "resource" ? null : reason));
    setError(null);
    setRowNotice(null);
    setSavedNotice(
      "تم حفظ المسودة بنجاح؛ التغييرات اللاحقة تحتاج إلى حفظ جديد.",
    );
    if (wasNew && current())
      router.replace(draftEditRoute(latest.data.draft.id));
  };
  const perform = async (intent: RetainedEditorCommand) => {
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
        const reason =
          reviewReasonByErrorCode[getApiError(failure).code] ?? null;
        setConflict((previous) => reason ?? previous);
        if (reason === "quote")
          await Promise.all([
            client.invalidateQueries({
              queryKey: catalogKeys.active(scope),
              exact: true,
              refetchType: "none",
            }),
            client.invalidateQueries({
              queryKey: [...customerKeys.root(scope), "orders", "quote"],
              refetchType: "none",
            }),
          ]);
        setError(
          intent.variables.command.operation === "CREATE_DRAFT" ||
            intent.variables.command.operation === "SAVE_DRAFT"
            ? applyDraftCommandError(failure, form, intent.snapshot)
            : applyOrderCommandError(failure, form, intent.snapshot),
        );
      }
    } finally {
      intent.running = false;
    }
  };
  const submit = (capture: DraftCapture) => {
    if (correctionMode || !canEdit() || conflict === "resource") return;
    prefillDone.current = true;
    const commandId = crypto.randomUUID();
    let frozen: EditorIntent;
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
    const intent: RetainedEditorCommand = {
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
  const submitOrder = () => {
    if (!canEdit() || conflict) return;
    if (originalOrder !== undefined) {
      if (
        currentOrder.data?.kind === "submitted" &&
        (currentOrder.data.order.version !== originalOrder.version ||
          !currentOrder.data.order.allowedActions.canResubmit)
      ) {
        setConflict("resource");
        setError("تغير الطلب؛ راجع نسخته الحالية قبل إعادة الإرسال.");
        return;
      }
      const parsedCorrection = draftReplacementSchema.safeParse(
        form.getValues(),
      );
      if (!parsedCorrection.success) {
        setError(
          orderCaptureIssueMessage(
            parsedCorrection.error.issues,
            form.getValues(),
          ),
        );
        return;
      }
      const capture = parsedCorrection.data;
      const body = resubmitOrderBodySchema.parse({
        commandId: crypto.randomUUID(),
        expectedVersion:
          base.kind === "saved" ? base.version : originalOrder.version,
        corrections: toReturnedOrderCorrections(capture, originalOrder),
      });
      freezeCapture(capture);
      for (const piece of body.corrections.pieces) {
        if (piece.catalogSelections !== undefined)
          Object.freeze(piece.catalogSelections);
        Object.freeze(piece);
      }
      Object.freeze(body.corrections.pieces);
      Object.freeze(body.corrections);
      Object.freeze(body);
      const variables = Object.freeze({
        scope: Object.freeze({ ...scope }),
        command: Object.freeze({
          operation: "RESUBMIT_ORDER" as const,
          orderId: originalOrder.id,
          body,
        }),
      });
      const intent: RetainedEditorCommand = {
        variables,
        snapshot: Object.freeze({ capture, formToken, scope: variables.scope }),
        unknown: false,
        confirmed: null,
        running: false,
      };
      retained.current = intent;
      setReceiptId(body.commandId);
      void perform(intent);
      return;
    }
    const parsed = submissionCaptureSchema.safeParse(form.getValues());
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const header = headers.find((field) => field === issue.path[0]);
        if (header !== undefined)
          form.setError(header, {
            type: "required",
            message: localValidationMessage(issue.message, header),
          });
        if (issue.path[0] === "pieces" && typeof issue.path[1] === "number") {
          const field = DRAFT_PIECE_CAPTURE_FIELDS.find(
            (candidate) => candidate === issue.path[2],
          );
          if (field !== undefined) {
            const position = String(issue.path[1]) as `${number}`;
            form.setError(`pieces.${position}.${field}`, {
              type: "required",
              message: localValidationMessage(issue.message, field),
            });
          }
        }
      }
      setError(orderCaptureIssueMessage(parsed.error.issues, form.getValues()));
      return;
    }
    if (catalog.isFetching || selected.isFetching || quote.isFetching) {
      setError("جارٍ تحديث بيانات العميل والسعر؛ انتظر لحظة ثم أعد الإرسال.");
      return;
    }
    if (catalog.isError || catalog.data?.availability !== "available") {
      setError(
        "تعذّر تحميل قوائم المواصفات؛ أعد تحميل القوائم أو احفظ الطلب كمسودة.",
      );
      return;
    }
    if (serverDraft !== undefined && !serverDraft.submission.available) {
      setError(
        serverDraft.submission.reason === "ORDER_CALENDAR_UNAVAILABLE"
          ? "الإرسال غير متاح حتى تهيئة توقيت العمل؛ تواصل مع المسؤول أو احفظ المسودة."
          : "متطلبات الإرسال غير متاحة؛ أعد تحميل بيانات الإرسال أو احفظ المسودة.",
      );
      return;
    }
    if (quote.isError || quote.data?.availability !== "available") {
      setError(
        "تعذّر تأكيد السعر؛ راجع التطعيم لكل قطعة وأعد تحميل السعر قبل الإرسال.",
      );
      return;
    }
    if (
      selectedCustomer === null ||
      selectedCustomer.id !== parsed.data.customerId
    ) {
      setError("تعذّر تأكيد بيانات العميل؛ أعد تحميل بياناته قبل الإرسال.");
      return;
    }
    const body = submitOrderBodySchema.parse({
      origin: base.kind === "new" ? "new" : "draft",
      ...(base.kind === "saved"
        ? { draftId: base.id, expectedVersion: base.version }
        : {}),
      commandId: crypto.randomUUID(),
      capture: parsed.data,
      expectedCustomerVersion: selectedCustomer.version,
      reviewedQuote: {
        sourceId: quote.data.sourceId,
        fingerprint: quote.data.fingerprint,
      },
    });
    freezeCapture(body.capture);
    Object.freeze(body.reviewedQuote);
    Object.freeze(body);
    const frozen: EditorIntent =
      body.origin === "new"
        ? Object.freeze({ operation: "SUBMIT_NEW_ORDER", body })
        : Object.freeze({ operation: "SUBMIT_DRAFT", body });
    const variables = Object.freeze({
      scope: Object.freeze({ ...scope }),
      command: frozen,
    });
    const intent: RetainedEditorCommand = {
      variables,
      snapshot: Object.freeze({
        capture: body.capture,
        formToken,
        scope: variables.scope,
      }),
      unknown: false,
      confirmed: null,
      running: false,
    };
    retained.current = intent;
    setReceiptId(body.commandId);
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
        assertEditorResult(observed.data, intent);
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
  const reviewTerms = async () => {
    if (conflict === "customer") {
      const reviewed = await selected.refetch({ throwOnError: true });
      if (reviewed.data?.customer.id !== form.getValues().customerId)
        throw new ApiContractError();
      completeReview();
      return;
    }
    const reviewed = await catalog.refetch({ throwOnError: true });
    if (reviewed.data?.availability !== "available")
      throw new ApiContractError();
    if (current()) setQuoteReviewSource(reviewed.data.sourceId);
  };
  const reload = async () => {
    if (!canEdit()) return;
    setPhase("checking");
    try {
      if (
        conflict === "quote" ||
        conflict === "customer" ||
        base.kind === "new"
      ) {
        await reviewTerms();
        return;
      }
      const latest = await client.fetchQuery({
        ...orderEditorOptions(client, scope, base.id),
        staleTime: 0,
      });
      if (!current()) return;
      if (latest.kind === "submitted") {
        router.replace(`/sales/orders/${latest.order.id}`);
        return;
      }
      await Promise.all([
        catalog.refetch({ throwOnError: true }),
        ...(form.getValues().customerId === null
          ? []
          : [selected.refetch({ throwOnError: true })]),
      ]);
      if (!current()) return;
      form.reset(makeDraftDefaults(latest.draft));
      setBase({
        kind: "saved",
        id: latest.draft.id,
        version: latest.draft.version,
        draftSequence: latest.draft.draftSequence,
      });
      setSearch(latest.draft.customer?.name ?? "");
      setSavedNotice(null);
      setRowNotice(null);
      completeReview();
    } catch {
      rejectReview();
    }
  };
  const serverDraft =
    (currentDraft.data?.kind === "draft"
      ? currentDraft.data.draft
      : undefined) ?? draft;
  const newerOrder =
    currentOrder.data?.kind === "submitted" &&
    originalOrder !== undefined &&
    currentOrder.data.order.version > originalOrder.version;
  const newer =
    newerOrder ||
    (serverDraft !== undefined &&
      base.kind === "saved" &&
      serverDraft.id === base.id &&
      serverDraft.version > base.version);
  const draftPaper = toDraftPaper(values, {
    ownerName: serverDraft?.owner.fullName ?? ownerName,
    createdAt: serverDraft?.createdAt ?? null,
    draftId: base.kind === "saved" ? base.id : null,
    customer: selectedCustomer,
  });
  const paper =
    originalOrder === undefined
      ? draftPaper
      : {
          ...toSubmittedPaper(originalOrder),
          ...{
            items: draftPaper.items,
            generalNotes: values.generalNotes ?? "",
            responsibleSignature: values.responsibleSignature ?? "",
            repairNote: values.repairNote ?? "",
            adjustmentRequested: values.adjustmentRequested ?? "",
            adjustmentReason: values.adjustmentReason ?? "",
            adjustmentActionTaken: values.adjustmentActionTaken ?? "",
            delivery: values.deliveryDate ?? "",
          },
        };
  const reviewedQuote = conflict === "quote" ? undefined : quote.data;
  const dataState: OrderPaperDataState =
    originalOrder !== undefined
      ? {
          ...toAuthoritativePaperState(originalOrder, catalog.data ?? null),
          selectionsByPiece: Object.fromEntries(
            values.pieces.map((piece) => [piece.id, piece.catalogSelections]),
          ),
        }
      : {
          kind: "authoritative",
          catalogSourceId:
            catalog.data?.availability === "available"
              ? catalog.data.sourceId
              : null,
          catalogOptions: toPaperCatalogOptions(
            catalog.data ?? {
              availability: "unavailable",
              reason: "CATALOG_NOT_LOADED",
            },
          ),
          selectionsByPiece: Object.fromEntries(
            values.pieces.map((piece) => [piece.id, piece.catalogSelections]),
          ),
          lockedCatalogFields: [],
          finance:
            reviewedQuote?.availability === "available"
              ? {
                  kind: "quote",
                  piecePrices: Object.fromEntries(
                    reviewedQuote.items.map((item) => [
                      item.pieceId,
                      item.unitPrice,
                    ]),
                  ),
                  total: reviewedQuote.total,
                }
              : {
                  kind: "unavailable",
                  piecePrices: Object.fromEntries(
                    (reviewedQuote?.items ?? []).map((item) => [
                      item.pieceId,
                      item.availability === "available" ? item.unitPrice : null,
                    ]),
                  ),
                  total: null,
                },
        };
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
          originalOrder !== undefined
            ? `تصحيح الطلب ${originalOrder.businessNumber}`
            : base.kind === "saved"
              ? `تعديل المسودة (${base.id})`
              : "إنشاء أمر تفصيل جديد"
        }
        subtitle="راجع المواصفات وبيانات العميل والسعر قبل الإرسال للاعتماد"
        actions={
          <div className="flex items-center gap-2">
            {!correctionMode && (
              <button
                type="submit"
                form={formId}
                disabled={locked || conflict === "resource"}
                className="btn-pill btn-outline"
              >
                حفظ كمسودة
              </button>
            )}
            <Link href="/sales/orders" className="btn-pill btn-outline">
              العودة
            </Link>
          </div>
        }
      />
      {phase === "editing" && currentResource.isError && (
        <div className="flex gap-2">
          <OrderEditorErrorToast
            error={currentResource.error}
            message={`تعذّر تحديث ${correctionMode ? "الطلب" : "المسودة"}؛ إدخالك محفوظ. حاول التحديث مجدداً.`}
          />
          <button
            type="button"
            className="btn-pill btn-outline"
            disabled={currentResource.isFetching}
            onClick={() => {
              void currentResource.refetch();
            }}
          >
            إعادة محاولة التحديث
          </button>
        </div>
      )}
      {quote.isFetching && (
        <p role="status" className="text-xs text-slate-500">
          جارٍ تحديث عرض السعر الحالي...
        </p>
      )}
      {(quote.isError ||
        (errorNotice !== null &&
          quote.data?.availability === "unavailable")) && (
        <div className="flex gap-2">
          {quote.isError && (
            <OrderEditorErrorToast
              error={quote.error}
              message="تعذّر تحميل السعر؛ أعد تحميله قبل الإرسال. إدخالك محفوظ."
            />
          )}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void quote.refetch();
            }}
          >
            إعادة تحميل السعر
          </button>
        </div>
      )}
      {(catalog.isError ||
        (errorNotice !== null &&
          catalog.data?.availability === "unavailable")) && (
        <div className="flex gap-2">
          {catalog.isError && (
            <OrderEditorErrorToast
              error={catalog.error}
              message="تعذّر تحميل قوائم المواصفات؛ أعد تحميلها أو احفظ المسودة."
            />
          )}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void catalog.refetch();
            }}
          >
            إعادة تحميل القوائم
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
              ? "جارٍ تنفيذ العملية؛ المغادرة لا تؤكد التراجع عنها."
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
          <OrderEditorErrorToast
            error={prefill.error}
            message="تعذّر تحديد العميل المطلوب؛ اختر عميلاً من البحث أو أنشئ عميلاً جديداً."
          />
        )}
      <form
        ref={formElement}
        tabIndex={-1}
        id={formId}
        noValidate
        onSubmit={(event) => {
          if (correctionMode) {
            event.preventDefault();
            submitOrder();
            return;
          }
          void form.handleSubmit(submit, () => {
            const parsed = draftReplacementSchema.safeParse(form.getValues());
            if (!parsed.success)
              setError(
                orderCaptureIssueMessage(parsed.error.issues, form.getValues()),
              );
            setSavedNotice(null);
          })(event);
        }}
        className="space-y-6"
      >
        <fieldset disabled={locked} className="min-w-0 space-y-6 border-0 p-0">
          {originalOrder !== undefined ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <strong>{originalOrder.customerSnapshot.name}</strong>
              <p>
                {originalOrder.customerSnapshot.phone} ·{" "}
                {originalOrder.customerSnapshot.address}
              </p>
              <p>{originalOrder.approval.returnReason}</p>
            </div>
          ) : (
            <SalesCustomerSection
              search={search}
              onSearchChange={changeSearch}
              selectedCustomer={selectedCustomer}
              results={
                customers.data?.customers.map((row) => row.customer) ?? []
              }
              queryState={{
                loading:
                  customers.isPending ||
                  (values.customerId !== null && selected.isPending),
                fetching: customers.isFetching || selected.isFetching,
                error:
                  customerError === null
                    ? null
                    : `تعذّر تحميل بيانات العملاء؛ أعد المحاولة لاختيار العميل. ${apiFailureMessage(customerError)}`,
                onRetry: () => {
                  void customers.refetch();
                  if (values.customerId !== null) void selected.refetch();
                },
              }}
              onSelect={chooseCustomer}
              onClear={clearCustomer}
              onCreateCustomer={openInline}
            />
          )}
          {originalOrder !== undefined ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p>
                نوع الطلب: {orderTypeLabels[originalOrder.type]} ·{" "}
                {originalOrder.businessNumber}
              </p>
              <label>
                تاريخ التسليم المتوقع
                <input
                  type="date"
                  name="deliveryDate"
                  className="oriental-input"
                  value={values.deliveryDate ?? ""}
                  onChange={(event) => {
                    if (canEdit()) {
                      form.setValue(
                        "deliveryDate",
                        event.target.value || null,
                        { shouldDirty: true },
                      );
                      edited();
                    }
                  }}
                />
              </label>
              {originalOrder.type === "REPAIR" && (
                <label>
                  تعليمات الإصلاح
                  <textarea
                    name="repairNote"
                    className="oriental-textarea"
                    value={values.repairNote ?? ""}
                    onChange={(event) => {
                      if (canEdit()) {
                        form.setValue("repairNote", event.target.value, {
                          shouldDirty: true,
                        });
                        edited();
                      }
                    }}
                  />
                </label>
              )}
            </div>
          ) : (
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
          )}
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
              {!correctionMode && (
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
              )}
            </div>
            <OrderPaperForm
              showCatalogUnavailableNotice={false}
              order={paper}
              displayReference={
                originalOrder?.businessNumber ??
                (base.kind === "saved"
                  ? formatDraftReference(base.id, base.draftSequence)
                  : undefined)
              }
              mode={
                locked ? "readOnly" : base.kind === "saved" ? "edit" : "create"
              }
              lines={toDraftPaperLines(values)}
              dataState={dataState}
              onLinesChange={changeLines}
              onCatalogSelection={changeCatalogSelection}
              invalidCells={invalidCells}
              fieldErrorMessages={fieldMessages}
              onFieldElement={(id, field, element) => {
                if (element === null) cells.current.delete(`${id}:${field}`);
                else cells.current.set(`${id}:${field}`, element);
              }}
              onDuplicatePiece={correctionMode ? undefined : duplicatePiece}
              onDeletePiece={correctionMode ? undefined : deletePiece}
              {...(correctionMode ? {} : { onAddPiece: addPiece })}
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
              {!correctionMode &&
                errorNotice !== null &&
                serverDraft !== undefined &&
                !serverDraft.submission.available && (
                  <button
                    type="button"
                    className="btn-pill btn-outline"
                    disabled={locked || currentResource.isFetching}
                    onClick={() => {
                      void currentResource.refetch();
                    }}
                  >
                    تحديث بيانات الإرسال
                  </button>
                )}
              {!correctionMode && (
                <button
                  type="submit"
                  disabled={locked || conflict === "resource"}
                  className="btn-pill btn-outline"
                >
                  حفظ كمسودة
                </button>
              )}
              <button
                type="button"
                disabled={locked || conflict !== null}
                onClick={submitOrder}
                className="btn-pill btn-teal"
              >
                <Send size={15} />
                <span>
                  {correctionMode ? "إعادة الإرسال للاعتماد" : "إرسال للاعتماد"}
                </span>
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {correctionMode
              ? "تظل التعديلات محلية حتى إعادة الإرسال؛ الإلغاء لا يغير الطلب المحفوظ."
              : "يمكن حفظ المسودة غير مكتملة. يصدر الرقم المعتمد بعد نجاح الإرسال؛ الطباعة الرسمية غير متاحة هنا."}
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
