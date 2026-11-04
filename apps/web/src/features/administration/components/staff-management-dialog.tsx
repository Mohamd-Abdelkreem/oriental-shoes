"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AuthUserData,
  Department,
  SafeUser,
  StaffAccessSnapshot,
  StaffCommandData,
  StaffDecision,
  StaffOperation,
  StaffUserData,
} from "@template/contracts";
import type { z } from "zod";

import {
  staffKeys,
  StaffSynchronizationError,
  useStaff,
  useStaffCommand,
  useStaffDecisions,
  type StaffCommandVariables,
  type StaffMutationContext,
} from "@/features/administration/hooks/staff.hooks";
import {
  availableStaffOperations,
  createStaffCommand,
  staffDepartmentFormSchema,
  type StaffCommandIntent,
} from "@/features/administration/model/staff-management.model";
import { hasBusinessAccess } from "@/features/auth/model/account-access";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  OrientalStatusPill,
  OrientalTable,
  statusTone,
} from "@/features/prototype/components/data-table";
import {
  AuthIdentityChangedError,
  AuthReauthenticationRequiredError,
  getApiError,
  getAuthSessionEpoch,
  getAuthSessionRestorePolicy,
} from "@/services/api/api-client";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";

/**
 * The dialog of the staff management surface. It owns the RHF draft, the
 * selected operation, the reviewed snapshot, the frozen command and the
 * command feedback. The hooks own the transport and the cache.
 */
export function StaffManagementDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const detail = useStaff(userId);
  const pendingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const detailReady = detail.data !== undefined;

  const handlePendingChange = useCallback((value: boolean): void => {
    pendingRef.current = value;
  }, []);

  const requestClose = useCallback((): void => {
    // A dispatched command owns the dialog until its outcome is known.
    if (pendingRef.current) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement ? active : null;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const department = container.querySelector<HTMLElement>(
      "[data-staff-department]",
    );
    if (department !== null) {
      department.focus();
      return;
    }
    const action = container.querySelector<HTMLElement>(
      "[data-staff-command-action]",
    );
    if (action !== null) {
      action.focus();
      return;
    }
    container.focus();
  }, [detailReady]);

  useEffect(
    () => () => {
      restoreStaffFocus(triggerRef.current, userId);
    },
    [userId],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (container === null) return;
      const focusable = readFocusableElements(container);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [requestClose]);

  return (
    <div className="oriental-modal-backdrop" onClick={requestClose}>
      <div
        ref={containerRef}
        className="oriental-modal-container max-w-md"
        onClick={(event) => {
          event.stopPropagation();
        }}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="oriental-modal-header">
          <h2 className="oriental-modal-title" id={titleId}>
            {detailReady
              ? staffDialogTitle(detail.data.staff)
              : "إدارة حساب الموظف"}
          </h2>
        </div>

        {detailReady && detail.isError ? (
          <div className="px-5 pt-4 text-sm" role="alert">
            <p className="text-rose-700">تعذّر تحميل بيانات الموظف.</p>
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                void detail.refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        ) : null}
        {detailReady ? (
          <StaffManagementDialogContent
            key={userId}
            userId={userId}
            staff={detail.data.staff}
            detailUnavailable={detail.isError || detail.isFetching}
            onClose={onClose}
            onRequestClose={requestClose}
            onPendingChange={handlePendingChange}
          />
        ) : detail.isPending ? (
          <div className="space-y-4 p-5 text-sm" role="status">
            <p className="text-slate-600">جارٍ تحميل بيانات الموظف...</p>
          </div>
        ) : (
          <div className="space-y-4 p-5 text-sm" role="alert">
            <p className="text-rose-700">تعذّر تحميل بيانات الموظف.</p>
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                void detail.refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type StaffManagementDialogContentProps = {
  userId: string;
  staff: SafeUser;
  detailUnavailable: boolean;
  onClose: () => void;
  onRequestClose: () => void;
  onPendingChange: (pending: boolean) => void;
};

function StaffManagementDialogContent({
  userId,
  staff,
  detailUnavailable,
  onClose,
  onRequestClose,
  onPendingChange,
}: StaffManagementDialogContentProps) {
  const queryClient = useQueryClient();
  const command = useStaffCommand();
  const [historyPage, setHistoryPage] = useState(1);
  const history = useStaffDecisions(userId, {
    page: historyPage,
    limit: STAFF_HISTORY_PAGE_SIZE,
  });

  // The reviewed snapshot is the revision the administrator actually reviewed.
  // It only ever advances, so an older result can never move it backwards.
  const [reviewedStaff, setReviewedStaff] = useState<SafeUser>(staff);
  const [notice, setNotice] = useState<StaffDialogNotice | null>(null);
  const [receipt, setReceipt] = useState<StaffCommandData | null>(null);
  const [frozenIntent, setFrozenIntent] =
    useState<StaffCommandVariables | null>(null);
  const [pending, setPending] = useState(false);
  const [requiresReview, setRequiresReview] = useState(false);
  const [identityBlocked, setIdentityBlocked] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [readFailure, setReadFailure] = useState(false);
  const reviewInFlight = useRef(false);

  const pendingRef = useRef(false);
  const submissionRef = useRef(0);
  const mountedRef = useRef(true);
  const departmentFieldId = useId();

  const form = useZodForm<StaffFormInput, StaffFormOutput>(
    staffDepartmentFormSchema,
    { defaultValues: { department: staff.department ?? "" } },
  );
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    setError,
    setFocus,
  } = form;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currentStaff = staff;
  const operations = availableStaffOperations(currentStaff);
  const needsDepartment = operations.some(
    (operation) => operation === "APPROVE" || operation === "CHANGE_DEPARTMENT",
  );
  const newerDetail = currentStaff.accessVersion > reviewedStaff.accessVersion;
  const reviewRequired = requiresReview || newerDetail;

  const historyData = history.data;
  const historyDecisions = historyData?.decisions ?? [];
  const historyTotalPages = historyData?.pagination.totalPages ?? 0;
  const historyTotal = historyData?.pagination.total ?? 0;

  const readCurrentScope = (): StaffMutationContext => {
    const account = queryClient.getQueryData<AuthUserData | null>(
      AUTH_SESSION_QUERY_KEY,
    );
    return { actorId: account?.user.id ?? "", epoch: getAuthSessionEpoch() };
  };

  /**
   * The completion, error and notice gates. A result of an older submission,
   * an unmounted dialog, another actor or another epoch never closes or
   * announces anything in the current view. An unreadable session is not by
   * itself a changed identity: the epoch still owns that decision.
   */
  const isCurrentSubmission = (
    submission: number,
    scope: StaffMutationContext,
  ): boolean => {
    if (!mountedRef.current) return false;
    if (submissionRef.current !== submission) return false;
    if (getAuthSessionEpoch() !== scope.epoch) return false;
    const current = readCurrentScope();
    if (current.actorId === "") return true;
    return current.actorId === scope.actorId;
  };

  const canUseStaffScope = (scope: StaffMutationContext): boolean => {
    const session = queryClient.getQueryState<AuthUserData | null>(
      AUTH_SESSION_QUERY_KEY,
    );
    const user = session?.data?.user;
    return (
      scope.epoch === getAuthSessionEpoch() &&
      getAuthSessionRestorePolicy() === "restore" &&
      session?.status === "success" &&
      session.fetchStatus === "idle" &&
      user !== undefined &&
      user.id === scope.actorId &&
      user.role === "ADMIN" &&
      hasBusinessAccess(user)
    );
  };

  const refreshReads = async (
    submission: number,
    scope: StaffMutationContext,
  ): Promise<SafeUser | null> => {
    if (!canUseStaffScope(scope)) return null;
    const detailKey = staffKeys.detail(scope.actorId, userId);
    const before = queryClient.getQueryState(detailKey);
    if (before === undefined) return null;
    try {
      await queryClient.refetchQueries(
        { queryKey: staffKeys.all(scope.actorId), type: "active" },
        { throwOnError: true },
      );
    } catch {
      return null;
    }
    if (!isCurrentSubmission(submission, scope) || !canUseStaffScope(scope))
      return null;
    const after = queryClient.getQueryState<StaffUserData>(detailKey);
    if (
      after?.status !== "success" ||
      after.fetchStatus !== "idle" ||
      after.dataUpdateCount <= before.dataUpdateCount ||
      after.data?.staff.id !== userId
    )
      return null;
    return after.data.staff;
  };

  const finishCommand = (): void => {
    if (!mountedRef.current) return;
    pendingRef.current = false;
    setPending(false);
    onPendingChange(false);
  };

  const runCommand = async (
    scope: StaffMutationContext,
    build: () => StaffCommandVariables,
    retry = false,
  ): Promise<void> => {
    if (
      !mountedRef.current ||
      pendingRef.current ||
      reviewInFlight.current ||
      identityBlocked ||
      !canUseStaffScope(scope)
    )
      return;
    if (!retry) {
      const detail = queryClient.getQueryState<StaffUserData>(
        staffKeys.detail(scope.actorId, userId),
      );
      if (
        reviewRequired ||
        detailUnavailable ||
        detail?.status !== "success" ||
        detail.fetchStatus !== "idle" ||
        detail.data?.staff.id !== userId ||
        detail.data.staff.accessVersion !== reviewedStaff.accessVersion
      )
        return;
    }
    pendingRef.current = true;
    setPending(true);
    onPendingChange(true);
    const submission = submissionRef.current + 1;
    submissionRef.current = submission;
    let variables: StaffCommandVariables;
    try {
      variables = build();
    } catch (error: unknown) {
      finishCommand();
      setNotice({
        kind: "error",
        text: getApiError(error).message,
      });
      return;
    }
    setFrozenIntent(variables);
    setNotice(null);
    setReadFailure(false);

    try {
      const result = await command.mutateAsync(variables);
      if (!isCurrentSubmission(submission, scope)) return;
      setReceipt(result);
      const committed = queryClient.getQueryData<StaffUserData>(
        staffKeys.detail(scope.actorId, userId),
      );
      const committedVersion = committed?.staff.accessVersion;
      if (
        committedVersion !== undefined &&
        committedVersion > result.staff.accessVersion
      ) {
        // A newer committed state wins. The dialog, the draft and the reviewed
        // revision stay, and the older assignment is never announced.
        setNotice({ kind: "newer", text: NEWER_STATE_NOTICE });
        setRequiresReview(true);
        return;
      }
      onClose();
    } catch (error: unknown) {
      if (!isCurrentSubmission(submission, scope)) return;
      if (error instanceof StaffSynchronizationError) {
        // The confirmed persistence is kept. Only the refresh is incomplete.
        setReceipt(error.result);
        const syncError = error.syncError;
        setNotice({
          kind: "saved-incomplete",
          text:
            syncError === null
              ? SAVED_INCOMPLETE_NOTICE
              : `${SAVED_INCOMPLETE_NOTICE} ${syncError.message}`,
          requestId: syncError?.requestId,
        });
        setRequiresReview(true);
        return;
      }
      if (
        error instanceof AuthIdentityChangedError ||
        error instanceof AuthReauthenticationRequiredError
      ) {
        setIdentityBlocked(true);
        setNotice({ kind: "error", text: IDENTITY_NOTICE });
        setRequiresReview(true);
        return;
      }
      const apiError = getApiError(error);
      if (
        apiError.code === "AUTH_IDENTITY_CHANGED" ||
        apiError.code === "AUTH_REAUTHENTICATION_REQUIRED"
      ) {
        setIdentityBlocked(true);
        setNotice({ kind: "error", text: IDENTITY_NOTICE });
        setRequiresReview(true);
        return;
      }
      if (apiError.code === "CONTRACT_ERROR") {
        // A malformed response is not an actual server status. No success and
        // no failure of the command is claimed.
        setNotice({ kind: "error", text: MALFORMED_RESPONSE_NOTICE });
        setRequiresReview(true);
        return;
      }
      if (apiError.statusCode === 0 || apiError.statusCode >= 500) {
        // The outcome of the dispatched command is unknown. The frozen command
        // is kept and no success or failure is claimed.
        setNotice({ kind: "uncertain", text: UNCERTAIN_OUTCOME_NOTICE });
        setRequiresReview(true);
        return;
      }
      if (STAFF_CONFLICT_CODES.has(apiError.code)) {
        setNotice({ kind: "conflict", text: CONFLICT_NOTICE });
        setRequiresReview(true);
        const refreshed = await refreshReads(submission, scope);
        if (isCurrentSubmission(submission, scope) && refreshed === null)
          setReadFailure(true);
        return;
      }
      if (apiError.statusCode === 400) {
        setNotice({
          kind: "error",
          text: applyApiFormError(error, { getValues, setError }),
          requestId: apiError.requestId,
        });
        return;
      }
      if (apiError.statusCode === 404) {
        setNotice({
          kind: "error",
          text: MISSING_TARGET_NOTICE,
          requestId: apiError.requestId,
        });
        setRequiresReview(true);
        return;
      }
      if (apiError.statusCode === 403) {
        setNotice({
          kind: "error",
          text: apiError.message,
          requestId: apiError.requestId,
        });
        setRequiresReview(true);
        const refreshed = await refreshReads(submission, scope);
        if (isCurrentSubmission(submission, scope) && refreshed === null)
          setReadFailure(true);
        return;
      }
      setNotice({
        kind: "error",
        text: apiError.message,
        requestId: apiError.requestId,
      });
    } finally {
      finishCommand();
    }
  };

  const submitOperation = (operation: StaffOperation): void => {
    const scope = readCurrentScope();
    if (operation === "APPROVE" || operation === "CHANGE_DEPARTMENT") {
      void handleSubmit(
        (parsed) => {
          void runCommand(scope, () =>
            createStaffCommand(
              buildAssignmentIntent(operation, parsed.department),
              reviewedStaff,
              allocateCommandId(),
            ),
          );
        },
        (invalid) => {
          focusFirstInvalidField(invalid, setFocus);
        },
      )();
      return;
    }
    void runCommand(scope, () =>
      createStaffCommand(
        buildStateIntent(operation),
        reviewedStaff,
        allocateCommandId(),
      ),
    );
  };

  const retryFrozenCommand = (): void => {
    const frozen = frozenIntent;
    if (frozen === null || notice?.kind !== "uncertain") return;
    void runCommand(readCurrentScope(), () => frozen, true);
  };

  const handleReview = async (confirm: boolean): Promise<void> => {
    if (pendingRef.current || reviewInFlight.current || identityBlocked) return;
    const submission = submissionRef.current;
    const scope = readCurrentScope();
    reviewInFlight.current = true;
    setReviewing(true);
    try {
      const latest = await refreshReads(submission, scope);
      if (!isCurrentSubmission(submission, scope)) return;
      if (
        latest === null ||
        latest.accessVersion < reviewedStaff.accessVersion
      ) {
        setReadFailure(true);
        return;
      }
      setReadFailure(false);
      if (!confirm) return;
      setReviewedStaff(latest);
      setRequiresReview(false);
      setFrozenIntent(null);
      setNotice({ kind: "info", text: REVIEW_COMPLETE_NOTICE });
    } finally {
      reviewInFlight.current = false;
      if (mountedRef.current) setReviewing(false);
    }
  };

  return (
    <form
      className="space-y-4 p-5 text-sm"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // An implicit submission runs the primary command. A pending command
        // blocks it, so a repeated Enter never dispatches a second command.
        if (
          pending ||
          reviewing ||
          reviewRequired ||
          identityBlocked ||
          detailUnavailable
        )
          return;
        const primary = operations[0];
        if (primary === undefined) return;
        submitOperation(primary);
      }}
    >
      <div>
        <span className="mb-1 block text-xs text-slate-500">اسم الموظف:</span>
        <strong className="text-slate-800">{currentStaff.fullName}</strong>
      </div>

      <div>
        <span className="mb-1 block text-xs text-slate-500">
          البريد الإلكتروني:
        </span>
        <span className="text-slate-700">{currentStaff.email}</span>
      </div>

      {needsDepartment && (
        <div className="block">
          <label
            className="mb-1 block text-xs font-semibold text-slate-700"
            htmlFor={departmentFieldId}
          >
            القسم المعتمد لهذا الموظف:
          </label>
          <select
            id={departmentFieldId}
            data-staff-department=""
            className="oriental-input w-full"
            aria-invalid={errors.department === undefined ? undefined : true}
            {...register("department")}
          >
            <option value="">— اختر القسم —</option>
            {DEPARTMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.department !== undefined && (
            <p className="form-error" role="alert">
              {errors.department.message}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-slate-500">
          {"الحالة الحالية: "}
          <OrientalStatusPill
            tone={statusTone(STAFF_STATUS_LABELS[currentStaff.status])}
          >
            {STAFF_STATUS_LABELS[currentStaff.status]}
          </OrientalStatusPill>
        </p>
        {notice !== null && (
          <p
            className={`rounded-xl border p-3 text-xs ${NOTICE_TONES[notice.kind]}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.text}
            {notice.requestId !== undefined && notice.requestId !== "" && (
              <span className="mt-1 block font-mono text-[11px] opacity-70">
                {`رمز المتابعة: ${notice.requestId}`}
              </span>
            )}
          </p>
        )}
        {readFailure && (
          <p className="text-xs text-rose-700" role="alert">
            تعذّرت مراجعة الحالة الحالية. أعد المحاولة.
          </p>
        )}
        {newerDetail && (
          <p
            className={`rounded-xl border p-3 text-xs ${NOTICE_TONES.newer}`}
            role="status"
          >
            {NEWER_STATE_NOTICE}
          </p>
        )}
        {receipt !== null && receipt.decision !== null && (
          <StaffDecisionSummary decision={receipt.decision} />
        )}
        {reviewRequired && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-pill btn-outline"
              disabled={pending || reviewing || identityBlocked}
              onClick={() => {
                void handleReview(false);
              }}
            >
              تحديث البيانات
            </button>
            <button
              type="button"
              className="btn-pill btn-outline"
              disabled={pending || reviewing || identityBlocked}
              onClick={() => {
                void handleReview(true);
              }}
            >
              مراجعة الحالة الحالية
            </button>
            {notice?.kind === "uncertain" && (
              <button
                type="button"
                className="btn-pill btn-teal"
                disabled={pending || reviewing || identityBlocked}
                data-staff-retry-command=""
                onClick={retryFrozenCommand}
              >
                إعادة إرسال الأمر نفسه
              </button>
            )}
          </div>
        )}
      </div>

      <section aria-label="سجل قرارات الموظف" className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700">سجل القرارات</h3>
        {history.isError && (
          <div className="text-xs text-rose-700" role="alert">
            <p>تعذّر تحميل سجل القرارات.</p>
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                void history.refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {history.isPending ? (
          <p className="text-xs text-slate-500" role="status">
            جارٍ تحميل سجل القرارات...
          </p>
        ) : historyData === undefined ? null : (
          <OrientalTable
            data={historyDecisions}
            keyExtractor={(decision) => decision.id}
            emptyTitle="لا توجد قرارات محفوظة"
            emptySubtitle="لا يوجد حتى الآن أي قرار موثق لهذا الموظف."
            columns={[
              {
                header: "القرار",
                render: (decision) => (
                  <span className="text-xs font-semibold text-slate-700">
                    {STAFF_DECISION_ACTION_LABELS[decision.action]}
                  </span>
                ),
              },
              {
                header: "بواسطة",
                render: (decision) => (
                  <span className="text-xs text-slate-600">
                    {decision.actor.fullName}
                  </span>
                ),
              },
              {
                header: "الوقت",
                render: (decision) => (
                  <span className="text-xs text-slate-500" dir="ltr">
                    {formatStaffDateTime(decision.occurredAt)}
                  </span>
                ),
              },
              {
                header: "قبل ← بعد",
                render: (decision) => (
                  <span className="text-xs text-slate-600">
                    {`${staffSnapshotSummary(decision.before)} ← ${staffSnapshotSummary(decision.after)}`}
                  </span>
                ),
              },
            ]}
            pagination={{
              page: historyPage,
              totalPages: historyTotalPages,
              total: historyTotal,
              onPageChange: (page) => {
                setHistoryPage(page);
              },
            }}
          />
        )}
      </section>

      {pending && (
        <p className="text-xs text-amber-700" role="status">
          لا يمكن إغلاق النافذة أثناء تنفيذ الأمر. انتظر اكتمال العملية.
        </p>
      )}

      <div className="flex justify-end gap-2 border-t pt-3">
        {operations.map((operation) => (
          <button
            key={operation}
            type="button"
            data-staff-command-action=""
            className={`btn-pill text-xs ${operationButtonClass(operation)}`}
            disabled={
              pending ||
              reviewing ||
              reviewRequired ||
              identityBlocked ||
              detailUnavailable
            }
            onClick={() => {
              submitOperation(operation);
            }}
          >
            {operationLabel(operation, currentStaff)}
          </button>
        ))}

        <button
          type="button"
          className="btn-pill btn-outline"
          disabled={pending}
          onClick={onRequestClose}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

type StaffDialogNoticeKind =
  "info" | "error" | "newer" | "saved-incomplete" | "uncertain" | "conflict";

type StaffDialogNotice = Readonly<{
  kind: StaffDialogNoticeKind;
  text: string;
  requestId?: string | undefined;
}>;

type StaffFormInput = z.input<typeof staffDepartmentFormSchema>;
type StaffFormOutput = z.output<typeof staffDepartmentFormSchema>;

const STAFF_HISTORY_PAGE_SIZE = 25;

const STAFF_CONFLICT_CODES: ReadonlySet<string> = new Set([
  "STAFF_ACCESS_CONFLICT",
  "STAFF_COMMAND_CONFLICT",
  "STAFF_TRANSITION_CONFLICT",
]);

const DEPARTMENT_OPTIONS: readonly Readonly<{
  value: Department;
  label: string;
}>[] = [
  { value: "SALES", label: "المبيعات" },
  { value: "APPROVAL", label: "الاعتماد" },
  { value: "CUTTING", label: "القص" },
  { value: "PRODUCTION", label: "الإنتاج والإصلاح" },
  { value: "QUALITY", label: "الجودة والتغليف" },
  { value: "WAREHOUSE", label: "المستودع والتسليم" },
];

const DEPARTMENT_LABELS: Record<Department, string> = {
  APPROVAL: "الاعتماد",
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  SALES: "المبيعات",
  WAREHOUSE: "المستودع والتسليم",
};

const STAFF_STATUS_LABELS: Record<SafeUser["status"], string> = {
  ACTIVE: "فعال",
  PENDING_APPROVAL: "بانتظار الموافقة",
  PENDING_VERIFICATION: "بانتظار توثيق البريد",
  REJECTED: "مرفوض",
  SUSPENDED: "موقوف",
};

const STAFF_DECISION_ACTION_LABELS: Record<StaffDecision["action"], string> = {
  APPROVE: "اعتماد",
  CHANGE_DEPARTMENT: "تغيير القسم",
  PREPARE_APPROVAL: "تجهيز اعتماد",
  REACTIVATE: "إعادة تفعيل",
  RECONSIDER: "إعادة نظر",
  REJECT: "رفض",
  SUSPEND: "إيقاف",
};

const NOTICE_TONES: Record<StaffDialogNoticeKind, string> = {
  conflict: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
  newer: "border-amber-200 bg-amber-50 text-amber-800",
  "saved-incomplete": "border-amber-200 bg-amber-50 text-amber-800",
  uncertain: "border-amber-200 bg-amber-50 text-amber-800",
};

const SAVED_INCOMPLETE_NOTICE =
  "تم حفظ القرار بنجاح، لكن تعذّر تحديث البيانات المعروضة. يمكنك تحديث البيانات فقط دون إعادة إرسال الأمر.";
const NEWER_STATE_NOTICE =
  "تم تحميل بيانات أحدث لهذا الموظف. تم الاحتفاظ بتعديلاتك؛ راجع الحالة الحالية قبل إرسال أمر جديد.";
const UNCERTAIN_OUTCOME_NOTICE =
  "تعذّر تأكيد نتيجة الأمر. لم يتم تكرار الأمر؛ تحقق من النتيجة الحالية أو أعد إرسال الأمر نفسه.";
const CONFLICT_NOTICE =
  "تعارضت الحالة الحالية مع الأمر. تم الاحتفاظ بتعديلاتك؛ راجع الحالة الحالية ثم أرسل أمراً جديداً.";
const IDENTITY_NOTICE =
  "انتهت صلاحية الهوية أو تغيّرت. يرجى تسجيل الدخول مرة أخرى قبل تنفيذ أي أمر.";
const MISSING_TARGET_NOTICE =
  "الموظف المحدد غير موجود. تم تحديث قائمة الموظفين.";
const MALFORMED_RESPONSE_NOTICE =
  "تعذّر قراءة رد الخادم. لم يتم تأكيد نتيجة الأمر؛ راجع الحالة الحالية.";
const REVIEW_COMPLETE_NOTICE =
  "تمت مراجعة الحالة الحالية. يمكنك الآن إرسال أمر جديد على المراجعة الحالية.";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const STAFF_DATE_FORMATTER = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatStaffDateTime = (value: string): string =>
  STAFF_DATE_FORMATTER.format(new Date(value));

const staffSnapshotSummary = (snapshot: StaffAccessSnapshot): string =>
  `${STAFF_STATUS_LABELS[snapshot.status]} · ${
    snapshot.department === null ? "—" : DEPARTMENT_LABELS[snapshot.department]
  } · v${String(snapshot.accessVersion)}`;

const staffDialogTitle = (staff: SafeUser): string =>
  staff.status === "PENDING_APPROVAL"
    ? "اعتماد الموظف وتعيين صلاحية القسم"
    : `إدارة حساب: ${staff.fullName}`;

const operationLabel = (operation: StaffOperation, staff: SafeUser): string => {
  switch (operation) {
    case "APPROVE":
      if (staff.status === "REJECTED") return "إعادة النظر واعتماد الموظف";
      if (staff.status === "SUSPENDED") return "تجهيز اعتماد الموظف";
      return "اعتماد وتعيين القسم";
    case "REJECT":
      return "رفض";
    case "CHANGE_DEPARTMENT":
      return "تغيير القسم المعتمد";
    case "SUSPEND":
      return "إيقاف الحساب مؤقتاً";
    case "REACTIVATE":
      return "إعادة تفعيل الحساب";
  }
};

const operationButtonClass = (operation: StaffOperation): string => {
  switch (operation) {
    case "APPROVE":
    case "CHANGE_DEPARTMENT":
    case "REACTIVATE":
      return "btn-teal";
    case "REJECT":
    case "SUSPEND":
      return "btn-outline text-rose-600";
  }
};

const buildAssignmentIntent = (
  operation: "APPROVE" | "CHANGE_DEPARTMENT",
  department: Department,
): StaffCommandIntent =>
  operation === "APPROVE"
    ? { operation: "APPROVE", department }
    : { operation: "CHANGE_DEPARTMENT", department };

const buildStateIntent = (
  operation: "REJECT" | "SUSPEND" | "REACTIVATE",
): StaffCommandIntent => ({ operation });

/**
 * The one command identity of a confirmed submission. It is allocated once,
 * in lowercase, and it is never derived from the draft or the target.
 */
const allocateCommandId = (): string => crypto.randomUUID().toLowerCase();

const focusFirstInvalidField = (
  errors: Record<string, unknown>,
  setFocus: (name: "department") => void,
): void => {
  const first = Object.keys(errors).find(
    (key): key is "department" => key === "department",
  );
  if (first === undefined) return;
  setFocus(first);
};

const readFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hidden && element.getAttribute("aria-hidden") !== "true",
  );

/**
 * The focus restoration of a closed management dialog. The connected trigger
 * keeps the focus; a removed row hands it to the next valid row, and the
 * directory region is the last resort.
 */
const restoreStaffFocus = (
  trigger: HTMLElement | null,
  userId: string,
): void => {
  if (trigger !== null && document.contains(trigger)) {
    trigger.focus();
    return;
  }
  const actions = Array.from(
    document.querySelectorAll<HTMLElement>("[data-staff-row-action]"),
  );
  const index = actions.findIndex(
    (action) => action.getAttribute("data-staff-row-action") === userId,
  );
  const next = index >= 0 ? actions[index + 1] : actions[0];
  if (next !== undefined) {
    next.focus();
    return;
  }
  const directory = document.querySelector<HTMLElement>(
    "[data-staff-directory-heading]",
  );
  directory?.focus();
};

function StaffDecisionSummary({ decision }: { decision: StaffDecision }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
      <p className="font-semibold text-slate-700">
        {`آخر قرار: ${STAFF_DECISION_ACTION_LABELS[decision.action]}`}
      </p>
      <p className="text-slate-600">{`بواسطة: ${decision.actor.fullName}`}</p>
      <p className="text-slate-500" dir="ltr">
        {formatStaffDateTime(decision.occurredAt)}
      </p>
      <p className="text-slate-600">
        {`قبل: ${staffSnapshotSummary(decision.before)}`}
      </p>
      <p className="text-slate-600">
        {`بعد: ${staffSnapshotSummary(decision.after)}`}
      </p>
    </div>
  );
}
