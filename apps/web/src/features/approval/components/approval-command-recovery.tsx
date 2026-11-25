"use client";

import { useCommandSuccessToast } from "@/components/toast/use-command-success-toast";
import { useState } from "react";
import { getApiError } from "@/services/api/api-client";
import { useApprovalCommand } from "../hooks/approval-commands.hooks";
import type {
  ApprovalCommandCapability,
  ApprovalCommandState,
} from "../model/approval-command-state";

function approvalSuccessMessage({
  command,
  result: { outcome },
}: Extract<ApprovalCommandState, { phase: "synchronized" }>): string {
  switch (command.operation) {
    case "APPROVE_INITIAL":
      return "تم اعتماد أمر التفصيل وتوجيهه للمصنع";
    case "RETURN_INITIAL":
      return "تم إرجاع أمر التفصيل للمبيعات للتعديل";
    case "SUBMIT_CONTACT":
      return command.body.kind === "CANCEL_REQUEST"
        ? "تم إرسال طلب إلغاء القطعة للاعتماد"
        : "تم إرسال مقترح تعديل القطعة للاعتماد";
    case "RESOLVE_ISSUE":
    case "REVIEW_CONTACT":
      if (outcome.issueState === "SALES_CONTACT") {
        return "تم إرسال المشكلة للمبيعات لمتابعتها مع العميل";
      }
      return outcome.pieceStage === "CANCELLED"
        ? "تم إلغاء القطعة وحفظ القرار"
        : "تم اعتماد إعادة القطعة للعمل";
  }
}

export function ApprovalCommandRecovery({
  orderId,
  capability,
}: {
  orderId: string;
  capability: ApprovalCommandCapability;
}) {
  const command = useApprovalCommand(orderId, capability);
  const { state } = command;
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  useCommandSuccessToast(
    state.phase !== "synchronized" ? null : approvalSuccessMessage(state),
    command.acknowledge,
  );
  if (state.phase === "idle" || state.phase === "synchronized") return null;
  const key = `${state.originScope.actorId}/${String(state.originScope.accessVersion)}/${String(state.originScope.epoch)}/${state.command.body.commandId}`;
  const run = (action: () => Promise<void>) => {
    void action().catch((error: unknown) => {
      const safe = getApiError(error);
      setFailure({
        key,
        message: `${safe.message}${safe.requestId ? ` (${safe.requestId})` : ""}`,
      });
    });
  };
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
      role="status"
    >
      {failure?.key === key && <p role="alert">{failure.message}</p>}
      {state.phase === "pending" && <p>جارٍ حفظ العملية…</p>}
      {state.phase === "unknown" && (
        <>
          <p>نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.</p>
          <p>
            {state.failure.message}
            {state.failure.requestId ? ` (${state.failure.requestId})` : ""}
          </p>
          <button
            type="button"
            onClick={() => {
              run(command.observe);
            }}
          >
            التحقق من النتيجة
          </button>
          <button
            type="button"
            onClick={() => {
              run(command.retrySame);
            }}
          >
            إعادة نفس العملية
          </button>
        </>
      )}
      {state.phase === "confirmed" && (
        <>
          <p>تم الحفظ؛ تعذر تحديث العرض الحالي.</p>
          {state.syncError && (
            <p>
              {state.syncError.message}
              {state.syncError.requestId
                ? ` (${state.syncError.requestId})`
                : ""}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              run(command.synchronize);
            }}
          >
            تحديث العرض
          </button>
        </>
      )}
    </div>
  );
}
