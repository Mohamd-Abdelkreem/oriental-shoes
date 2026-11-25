"use client";

import { getApiError } from "@/services/api/api-client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { localizedZodResolver } from "@/shared/forms/form";
import {
  administrationCommandBodySchema,
  administrationCorrectionValuesSchema,
  administrationOrderDataSchema,
  type AdministrationOrderData,
  type AdministrationPaperCorrection,
} from "@template/contracts";
import {
  administrationScopeKey,
  assertCurrentAdministrationOperationalScope,
  isCurrentAdministrationOperationalScope,
  useAdministrationOperationalScope,
  type AdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import {
  administrationKeys,
  fetchAdministrationOrder,
} from "./administration.hooks";
import { useAdministrationCommand } from "./administration-commands.hooks";
import {
  administrationCommandSessionSchema,
  AdministrationLocalCommandError,
} from "../model/administration-command-state";
import {
  administrationCancelFormSchema,
  administrationCorrectionFormSchema,
  captureAdministrationCancellation,
  reviewAdministrationCancellation,
  toAdministrationCancelCommand,
  toAdministrationCorrectionCommand,
  makeAdministrationCorrectionDefaults,
  applyAdministrationFormError,
  administrationFailureMessage,
  type AdministrationCancelForm,
  type AdministrationCancelReview,
  type AdministrationCorrectionForm,
  type AdministrationCorrectionReview,
} from "../model/administration-form.model";

const cancelDefaults = (): AdministrationCancelForm => ({
  scope: "QUANTITY",
  itemPieceId: null,
  selectedPieceIds: [],
  reason: "",
});
const correctionDefaults: AdministrationCorrectionForm = {
  generalNotes: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  customerAddress: "",
  reason: "",
};
const correctionFields = [
  "generalNotes",
  "customerName",
  "customerPhone",
  "customerEmail",
  "customerAddress",
] as const;
type Preparation = {
  kind: "cancel" | "correct";
  scope: AdministrationOperationalScope;
  orderId: string;
};
export const useAdministrationDialogs = (
  orderId: string,
  availability: "ready" | "refreshing" | "error",
) => {
  const client = useQueryClient(),
    scope = useAdministrationOperationalScope(),
    command = useAdministrationCommand();
  const cancelForm = useForm<AdministrationCancelForm>({
    resolver: localizedZodResolver(administrationCancelFormSchema),
    defaultValues: cancelDefaults(),
  });
  const correctionForm = useForm<AdministrationCorrectionForm>({
    resolver: localizedZodResolver(administrationCorrectionFormSchema),
    defaultValues: correctionDefaults,
  });
  const [cancelReview, setCancelReview] =
      useState<AdministrationCancelReview | null>(null),
    [correctionReview, setCorrectionReview] =
      useState<AdministrationCorrectionReview | null>(null),
    [correctionDetail, setCorrectionDetail] = useState<Extract<
      AdministrationOrderData,
      { kind: "submitted" }
    > | null>(null),
    [preparing, setPreparing] = useState(false),
    [failure, setFailure] = useState<string | null>(null),
    [explicitReviewRequired, setReviewRequired] = useState(false);
  const preparation = useRef<Preparation | null>(null),
    currentOrder = useRef(orderId),
    mounted = useRef(false),
    submitting = useRef(false);
  useEffect(() => {
    currentOrder.current = orderId;
    mounted.current = true;
    return () => {
      mounted.current = false;
      preparation.current = null;
    };
  }, [orderId, scope?.actorId, scope?.accessVersion, scope?.epoch]);
  const requireIdle = (origin: AdministrationOperationalScope) => {
    assertCurrentAdministrationOperationalScope(client, origin);
    const raw = client.getQueryData([
      ...administrationScopeKey(origin),
      "command-session",
    ]);
    if (
      (raw !== undefined &&
        administrationCommandSessionSchema.parse(raw).phase !== "idle") ||
      client.isMutating({
        mutationKey: [...administrationScopeKey(origin), "command-activity"],
        exact: true,
      }) > 0 ||
      submitting.current
    )
      throw new AdministrationLocalCommandError("BUSY");
  };
  const requirePreparation = (token: Preparation) => {
    assertCurrentAdministrationOperationalScope(client, token.scope);
    if (
      !mounted.current ||
      preparation.current !== token ||
      currentOrder.current !== token.orderId
    )
      throw new AdministrationLocalCommandError("MISMATCH");
    requireIdle(token.scope);
  };
  const fresh = async (token: Preparation) => {
    const detail = await fetchAdministrationOrder(
      client,
      token.scope,
      token.orderId,
    );
    requirePreparation(token);
    if (
      detail.kind !== "submitted" ||
      !(token.kind === "cancel"
        ? detail.adminActions.canCancel
        : detail.adminActions.canCorrect)
    )
      throw new AdministrationLocalCommandError("MISMATCH");
    return detail;
  };
  const begin = (kind: Preparation["kind"]) => {
    if (
      scope === null ||
      availability !== "ready" ||
      preparation.current !== null
    )
      throw new AdministrationLocalCommandError("BUSY");
    requireIdle(scope);
    const token = { kind, scope, orderId };
    preparation.current = token;
    setPreparing(true);
    setFailure(null);
    return token;
  };
  const finish = (token: Preparation) => {
    if (mounted.current && preparation.current === token) {
      preparation.current = null;
      setPreparing(false);
    }
  };
  const openCancellation = async (): Promise<void> => {
    let token: Preparation | null = null;
    try {
      token = begin("cancel");
      const detail = await fresh(token),
        first = detail.cancellationCandidates.find((piece) => piece.eligible);
      const values = {
        ...cancelDefaults(),
        itemPieceId: first?.pieceId ?? null,
        selectedPieceIds: first === undefined ? [] : [first.pieceId],
      };
      const review = captureAdministrationCancellation(detail, values);
      cancelForm.reset(values);
      setCorrectionReview(null);
      setCorrectionDetail(null);
      setCancelReview(review);
      setReviewRequired(false);
    } catch (error: unknown) {
      if (token !== null && mounted.current && preparation.current === token)
        setFailure(administrationFailureMessage(error, "review"));
    } finally {
      if (token !== null) finish(token);
    }
  };
  const openCorrection = async (): Promise<void> => {
    let token: Preparation | null = null;
    try {
      token = begin("correct");
      const detail = await fresh(token);
      correctionForm.reset(
        makeAdministrationCorrectionDefaults(detail.correction.effective),
      );
      setCancelReview(null);
      setCorrectionDetail(detail);
      setCorrectionReview({
        operation: "ADMIN_CORRECT",
        orderId,
        expectedVersion: detail.order.version,
        baseline: detail.correction.effective,
      });
      setReviewRequired(false);
    } catch (error: unknown) {
      if (token !== null && mounted.current && preparation.current === token)
        setFailure(administrationFailureMessage(error, "review"));
    } finally {
      if (token !== null) finish(token);
    }
  };
  const close = () => {
    preparation.current = null;
    setPreparing(false);
    setCancelReview(null);
    setCorrectionReview(null);
    setCorrectionDetail(null);
    setFailure(null);
    setReviewRequired(false);
    cancelForm.reset(cancelDefaults());
    correctionForm.reset(correctionDefaults);
  };
  const reviewCurrent = async (): Promise<void> => {
    if (scope === null || preparing) return;
    const token: Preparation = {
      kind: cancelReview === null ? "correct" : "cancel",
      scope,
      orderId,
    };
    preparation.current = token;
    setPreparing(true);
    setFailure(null);
    try {
      requireIdle(scope);
      if (cancelReview !== null) {
        const values = cancelForm.getValues(),
          retained = captureAdministrationCancellation(
            cancelReview.detail,
            values,
          );
        const detail = await fresh(token),
          reviewed = reviewAdministrationCancellation(retained, detail);
        cancelForm.reset(values);
        setCancelReview(reviewed);
      } else if (correctionReview !== null) {
        const values = correctionForm.getValues();
        const intended = correctionFields.filter((field) => {
          const normalized = administrationCorrectionValuesSchema.shape[
            field
          ].safeParse(values[field]);
          return (
            !normalized.success ||
            normalized.data !== correctionReview.baseline[field]
          );
        });
        const detail = await fresh(token);
        correctionForm.reset(
          makeAdministrationCorrectionDefaults(detail.correction.effective),
        );
        for (const field of intended)
          correctionForm.setValue(field, values[field], { shouldDirty: true });
        correctionForm.setValue("reason", values.reason, { shouldDirty: true });
        setCorrectionDetail(detail);
        setCorrectionReview({
          operation: "ADMIN_CORRECT",
          orderId,
          expectedVersion: detail.order.version,
          baseline: detail.correction.effective,
        });
      } else throw new AdministrationLocalCommandError("MISMATCH");
      setReviewRequired(false);
    } catch (error: unknown) {
      if (mounted.current && preparation.current === token) {
        setReviewRequired(true);
        setFailure(administrationFailureMessage(error, "review"));
      }
    } finally {
      finish(token);
    }
  };
  const currentDetail = () => {
    if (scope === null) throw new AdministrationLocalCommandError("MISMATCH");
    requireIdle(scope);
    const query = client.getQueryState(
      administrationKeys.order(scope, orderId),
    );
    if (
      query?.status !== "success" ||
      query.fetchStatus !== "idle" ||
      query.isInvalidated ||
      availability !== "ready"
    )
      throw new AdministrationLocalCommandError("MISMATCH");
    const detail = administrationOrderDataSchema.parse(query.data);
    if (detail.kind !== "submitted" || detail.order.id !== orderId)
      throw new AdministrationLocalCommandError("MISMATCH");
    return detail;
  };
  const settlementCurrent = () =>
    scope !== null &&
    mounted.current &&
    currentOrder.current === orderId &&
    isCurrentAdministrationOperationalScope(client, scope);
  const requiresReview = (error: unknown) =>
    (error instanceof AdministrationLocalCommandError &&
      error.code === "MISMATCH") ||
    /VERSION|SELECTION|INELIGIBLE/.test(getApiError(error).code);
  const confirmCancellation = async (
    values: AdministrationCancelForm,
  ): Promise<void> => {
    try {
      if (cancelReview === null || explicitReviewRequired)
        throw new AdministrationLocalCommandError("MISMATCH");
      const detail = currentDetail();
      if (detail.order.version !== cancelReview.expectedVersion)
        throw new AdministrationLocalCommandError("MISMATCH");
      const captured = captureAdministrationCancellation(
          cancelReview.detail,
          values,
        ),
        reviewed = reviewAdministrationCancellation(captured, detail);
      const candidate = toAdministrationCancelCommand(
        reviewed,
        values.reason,
        reviewed.orderId,
      );
      const body = administrationCommandBodySchema.parse({
        ...candidate,
        commandId: crypto.randomUUID(),
      });
      submitting.current = true;
      await command.submit(body);
      if (settlementCurrent()) close();
    } catch (error: unknown) {
      if (settlementCurrent()) {
        setFailure(applyAdministrationFormError(error, cancelForm));
        if (requiresReview(error)) setReviewRequired(true);
      }
    } finally {
      submitting.current = false;
    }
  };
  const confirmCorrection = async (
    values: AdministrationCorrectionForm,
    paper?: AdministrationPaperCorrection,
  ): Promise<void> => {
    try {
      if (correctionReview === null || explicitReviewRequired)
        throw new AdministrationLocalCommandError("MISMATCH");
      const detail = currentDetail();
      if (
        detail.order.version !== correctionReview.expectedVersion ||
        !detail.adminActions.canCorrect
      )
        throw new AdministrationLocalCommandError("MISMATCH");
      const candidate = toAdministrationCorrectionCommand(
        correctionReview,
        values,
        correctionReview.orderId,
        paper,
      );
      const body = administrationCommandBodySchema.parse({
        ...candidate,
        commandId: crypto.randomUUID(),
      });
      submitting.current = true;
      await command.submit(body);
      if (settlementCurrent()) close();
    } catch (error: unknown) {
      if (settlementCurrent()) {
        setFailure(applyAdministrationFormError(error, correctionForm));
        if (requiresReview(error)) setReviewRequired(true);
      }
    } finally {
      submitting.current = false;
    }
  };
  const cached =
    scope === null
      ? undefined
      : client.getQueryState(administrationKeys.order(scope, orderId));
  const detail = administrationOrderDataSchema.safeParse(cached?.data),
    expectedVersion =
      cancelReview?.expectedVersion ?? correctionReview?.expectedVersion;
  const changed =
    expectedVersion !== undefined &&
    (!detail.success ||
      detail.data.kind !== "submitted" ||
      detail.data.order.version !== expectedVersion ||
      cached?.isInvalidated === true);
  return {
    cancelReview,
    correctionReview,
    correctionDetail,
    cancelForm,
    correctionForm,
    preparing,
    pending: command.busy || command.state.phase !== "idle",
    failure,
    reviewRequired: explicitReviewRequired || changed,
    openCancellation,
    openCorrection,
    reviewCurrent,
    close,
    confirmCancellation,
    confirmCorrection,
  };
};
