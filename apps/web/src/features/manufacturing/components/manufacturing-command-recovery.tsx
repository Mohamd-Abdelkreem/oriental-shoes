"use client";
import { useState } from "react";
import type { ManufacturingDepartment } from "@template/contracts";
import { useManufacturingCommand } from "../hooks/manufacturing-commands.hooks";
import { manufacturingFailureMessage } from "../model/manufacturing-form.model";

export function ManufacturingCommandRecovery({
  department,
}: {
  department: ManufacturingDepartment;
}) {
  const command = useManufacturingCommand(department),
    state = command.state;
  if (state.phase === "idle") return null;
  const key = `${state.originScope.actorId}/${String(state.originScope.accessVersion)}/${String(state.originScope.epoch)}/${state.intent.body.commandId}`;
  return <RecoveryActions key={key} command={command} />;
}
function RecoveryActions({
  command,
}: {
  command: ReturnType<typeof useManufacturingCommand>;
}) {
  const [failure, setFailure] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    state = command.state;
  if (state.phase === "idle") return null;
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error: unknown) {
      setFailure(manufacturingFailureMessage(error, "التحقق من نتيجة الإجراء"));
    } finally {
      setBusy(false);
    }
  };
  const requestId =
    state.phase === "unknown"
      ? state.failure.requestId
      : state.phase === "confirmed"
        ? state.syncError?.requestId
        : null;
  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
      aria-label="متابعة نتيجة الإجراء"
      role={state.phase === "unknown" ? "alert" : "status"}
    >
      <p>
        القسم الأصلي:{" "}
        {state.originScope.department === "CUTTING"
          ? "القص"
          : "الإنتاج والإصلاح"}
      </p>
      {state.phase === "pending" && (
        <p>جارٍ إرسال الإجراء. إغلاق النافذة لا يلغي العملية. انتظر النتيجة.</p>
      )}
      {state.phase === "unknown" && (
        <>
          <p>
            نتيجة الإجراء غير مؤكدة. تحقّق من النتيجة قبل إجراء جديد؛ إعادة
            المحاولة ترسل نفس القطع والإصدار والمعرّف.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              void run(command.observe);
            }}
          >
            التحقق من النتيجة
          </button>
          <button
            disabled={busy}
            onClick={() => {
              void run(command.retrySame);
            }}
          >
            إعادة نفس الإجراء
          </button>
        </>
      )}
      {state.phase === "confirmed" && !state.syncError && (
        <p>تم حفظ الإجراء. جارٍ تحديث البيانات؛ انتظر دون إعادة الإرسال.</p>
      )}
      {state.phase === "confirmed" && state.syncError && (
        <>
          <p>
            تم حفظ الإجراء، لكن تعذر تحديث العرض. حدّث البيانات دون إعادة
            الإرسال.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              void run(command.synchronize);
            }}
          >
            تحديث البيانات المحفوظة
          </button>
        </>
      )}
      {state.phase === "synchronized" && (
        <>
          <p>تم حفظ الإجراء وتحديث البيانات.</p>
          <button
            onClick={() => {
              command.acknowledge();
            }}
          >
            إغلاق التأكيد
          </button>
        </>
      )}
      {requestId && (
        <p>
          مرجع الطلب: {requestId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 100)}
        </p>
      )}
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
