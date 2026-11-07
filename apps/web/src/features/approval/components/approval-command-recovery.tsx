"use client";

import { useState } from "react";
import { getApiError } from "@/services/api/api-client";
import { useApprovalCommand } from "../hooks/approval-commands.hooks";
import type { ApprovalCommandCapability } from "../model/approval-command-state";

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
  if (state.phase === "idle") return null;
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
      {state.phase === "synchronized" && (
        <>
          <p>تم الحفظ وتحديث البيانات.</p>
          <button type="button" onClick={command.acknowledge}>
            تم
          </button>
        </>
      )}
    </div>
  );
}
