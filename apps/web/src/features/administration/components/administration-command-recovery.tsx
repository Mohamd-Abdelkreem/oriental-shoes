"use client";
import { useQueryClient } from "@tanstack/react-query";
import { administrationOrderDataSchema } from "@template/contracts";
import { administrationKeys } from "../hooks/administration.hooks";
import {
  describeOrderPieces,
  toOrderPieceLabels,
} from "@/features/orders/model/order-display-reference";

import { useCommandSuccessToast } from "@/components/toast/use-command-success-toast";
import { useEffect, useRef, useState } from "react";
import { useAdministrationCommand } from "../hooks/administration-commands.hooks";
import { administrationFailureMessage } from "../model/administration-form.model";

export function AdministrationCommandRecovery() {
  const command = useAdministrationCommand(),
    state = command.state;
  useCommandSuccessToast(
    state.phase !== "synchronized"
      ? null
      : state.body.operation === "ADMIN_CANCEL"
        ? "تم الإلغاء الإداري وحفظ القرار"
        : "تم حفظ تصحيح بيانات الطلب",
    command.acknowledge,
  );
  if (state.phase === "idle" || state.phase === "synchronized") return null;
  return (
    <RecoveryActions
      key={`${state.originScope.actorId}/${String(state.originScope.accessVersion)}/${String(state.originScope.epoch)}/${state.body.commandId}`}
      command={command}
    />
  );
}
function RecoveryActions({
  command,
}: {
  command: ReturnType<typeof useAdministrationCommand>;
}) {
  const [failure, setFailure] = useState<string | null>(null),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const client = useQueryClient();
  const state = command.state;
  if (state.phase === "idle") return null;
  const cached = administrationOrderDataSchema.safeParse(
    client.getQueryData(
      administrationKeys.order(state.originScope, state.body.orderId),
    ),
  );
  const order =
    cached.success && cached.data.kind === "submitted"
      ? cached.data.order
      : undefined;
  const labels = order ? toOrderPieceLabels(order.pieces) : undefined;
  const run = async (action: () => Promise<void>) => {
    setFailure(null);
    try {
      await action();
    } catch (error: unknown) {
      if (mounted.current)
        setFailure(administrationFailureMessage(error, state.body.operation));
    }
  };
  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
      aria-label="متابعة نتيجة الإجراء الإداري"
      role={
        state.phase === "unknown" ||
        (state.phase === "confirmed" && state.syncError)
          ? "alert"
          : "status"
      }
    >
      <p>
        {state.body.operation === "ADMIN_CANCEL"
          ? "إلغاء إداري"
          : "تصحيح بيانات الطلب"}{" "}
        {order && (
          <>
            — <bdi>{order.businessNumber}</bdi>
          </>
        )}
      </p>
      <details>
        <summary>الإجراء الأصلي</summary>
        {state.body.operation === "ADMIN_CANCEL" ? (
          <p>{describeOrderPieces(state.body.pieceIds, labels)}</p>
        ) : (
          <p>{"تصحيح الحقول المسموح بها فقط"}</p>
        )}
      </details>
      {"result" in state && (
        <p>
          المنفذ: {state.result.receipt.actor.fullName} —{" "}
          <time dateTime={state.result.receipt.occurredAt}>
            {state.result.receipt.occurredAt}
          </time>
        </p>
      )}
      {state.phase === "pending" && (
        <p>جارٍ إرسال الإجراء. إغلاق النافذة لا يلغي العملية؛ انتظر النتيجة.</p>
      )}
      {state.phase === "unknown" && (
        <>
          <p>
            النتيجة غير مؤكدة. التحقق من عدم وجود نتيجة لا يثبت فشل الحفظ. إعادة
            المحاولة تتحقق مجدداً وتستخدم نفس الإجراء والمعرّف.
          </p>
          <button
            disabled={command.busy}
            onClick={() => {
              void run(command.observe);
            }}
          >
            التحقق من النتيجة الأصلية
          </button>
          <button
            disabled={command.busy}
            onClick={() => {
              void run(command.retrySame);
            }}
          >
            إعادة نفس الإجراء
          </button>
        </>
      )}
      {state.phase === "confirmed" && (
        <>
          <p>
            تم حفظ الإجراء؛{" "}
            {state.syncError
              ? "تعذر تحديث العرض. حدّث البيانات دون إعادة الإرسال."
              : "جارٍ تحديث البيانات؛ انتظر دون إعادة الإرسال."}
          </p>
          {state.syncError && (
            <button
              disabled={command.busy}
              onClick={() => {
                void run(command.synchronize);
              }}
            >
              تحديث البيانات المحفوظة
            </button>
          )}
        </>
      )}
      {command.busy && <p aria-live="polite">جارٍ متابعة الإجراء الأصلي…</p>}
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
