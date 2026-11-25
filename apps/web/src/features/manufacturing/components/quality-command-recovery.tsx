"use client";
import { useCommandSuccessToast } from "@/components/toast/use-command-success-toast";
import { useState, useRef, useEffect } from "react";
import { qualityActionSuccessMessage } from "../model/manufacturing-action-success";
import { useQualityCommand } from "../hooks/quality-commands.hooks";
import { toQualityOperationLabel } from "../model/quality-event.model";
import { qualityFailureMessage } from "../model/quality-form.model";

export function QualityCommandRecovery() {
  const command = useQualityCommand(),
    state = command.state;
  useCommandSuccessToast(
    state.phase !== "synchronized"
      ? null
      : qualityActionSuccessMessage(state.result),
    command.acknowledge,
  );
  if (state.phase === "idle" || state.phase === "synchronized") return null;
  const key = `${state.originScope.actorId}/${String(state.originScope.accessVersion)}/${String(state.originScope.epoch)}/${state.body.commandId}`;
  return <RecoveryActions key={key} command={command} />;
}
function RecoveryActions({
  command,
}: {
  command: ReturnType<typeof useQualityCommand>;
}) {
  const [failure, setFailure] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    state = command.state,
    busyRef = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (state.phase === "idle") return null;
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error: unknown) {
      if (mounted.current)
        setFailure(qualityFailureMessage(error, "التحقق من نتيجة الإجراء"));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
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
      role={
        state.phase === "unknown" ||
        (state.phase === "confirmed" && state.syncError)
          ? "alert"
          : "status"
      }
    >
      <p>
        {toQualityOperationLabel(state.body.operation)} —{" "}
        {state.body.orders.reduce(
          (count, order) =>
            count +
            ("pieceIds" in order
              ? order.pieceIds.length
              : order.decisions.length),
          0,
        )}{" "}
        قطعة
      </p>
      <details>
        <summary>القطع الأصلية للإجراء</summary>
        {state.body.orders.map((order) => (
          <p key={order.orderId}>
            {order.orderId}:{" "}
            {("pieceIds" in order
              ? order.pieceIds
              : order.decisions.map((piece) => piece.pieceId)
            ).join("، ")}
          </p>
        ))}
      </details>
      {"result" in state && (
        <p>المنفذ: {state.result.receipt.actor.fullName}</p>
      )}
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
      {requestId && (
        <p>
          مرجع الطلب: {requestId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 100)}
        </p>
      )}
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
