"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { WarehouseActivityEvent } from "@template/contracts";
import {
  assertCurrentWarehouseOperationalScope,
  isCurrentWarehouseOperationalScope,
  useWarehouseOperationalScope,
} from "@/shared/query/operational-scope";
import { ApiContractError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { useWarehouseActivity } from "../hooks/warehouse.hooks";
import { useWarehouseCommandReceipt } from "../hooks/warehouse-commands.hooks";
import { warehouseFailureMessage } from "../model/warehouse-form.model";
import {
  toWarehouseEventSummary,
  toWarehouseOperationLabel,
} from "../model/warehouse-event.model";

export function WarehouseActivity() {
  const [page, setPage] = useState(1),
    query = useWarehouseActivity({ page, limit: 25 }),
    scope = useWarehouseOperationalScope();
  if (query.data && page > Math.max(1, query.data.pagination.totalPages))
    setPage(Math.max(1, query.data.pagination.totalPages));
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم المستودع والتسليم / سجل العمليات"
        title="سجل حركات المستودع والشحن"
        subtitle="حركات محفوظة بالمنفذ الفعلي ونطاقها الأصلي"
      />
      {query.isPending && <p role="status">جارٍ تحميل السجل…</p>}
      {query.isFetching && query.data && <p role="status">جارٍ تحديث السجل…</p>}
      {query.isError && (
        <div role="alert">
          {warehouseFailureMessage(query.error, "read")}
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {query.data && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <OrientalTable
            data={query.data.events}
            keyExtractor={(item) => item.event.id}
            emptyTitle="لا توجد حركات محفوظة"
            emptySubtitle="لم تسجل حركات في هذا النطاق."
            pagination={{
              page: query.data.pagination.page,
              totalPages: query.data.pagination.totalPages,
              total: query.data.pagination.total,
              onPageChange: setPage,
            }}
            columns={[
              {
                header: "أمر التفصيل",
                render: (item) => (
                  <Link
                    className="font-bold text-teal-700 hover:underline"
                    href={`/warehouse/orders/${item.event.orderId}`}
                  >
                    {item.event.businessNumber}
                  </Link>
                ),
              },
              {
                header: "الإجراء",
                render: (item) =>
                  toWarehouseOperationLabel(item.event.operation),
              },
              {
                header: "التفاصيل",
                render: (item) => toWarehouseEventSummary(item.event),
              },
              {
                header: "المنفذ",
                render: (item) => (
                  <span className="font-semibold text-slate-800">
                    {item.event.actor.fullName}
                  </span>
                ),
              },
              {
                header: "وقت التسجيل",
                render: (item) => (
                  <time
                    dateTime={item.event.occurredAt}
                    dir="ltr"
                    className="text-xs text-slate-500"
                  >
                    {item.event.occurredAt}
                  </time>
                ),
              },
              {
                header: "النتيجة الأصلية",
                render: (item) =>
                  scope?.actorId === item.event.actor.id ? (
                    <WarehouseOriginalResult
                      key={`${item.event.id}/${String(scope.accessVersion)}/${String(scope.epoch)}`}
                      event={item.event}
                    />
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
function WarehouseOriginalResult({ event }: { event: WarehouseActivityEvent }) {
  const client = useQueryClient(),
    scope = useWarehouseOperationalScope(),
    query = useWarehouseCommandReceipt(event.commandId, scope),
    guard = useRef(false),
    mounted = useRef(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState<string | null>(null),
    [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const observe = async () => {
    if (!scope || scope.actorId !== event.actor.id || guard.current) return;
    guard.current = true;
    setBusy(true);
    setStatus(null);
    setFailure(null);
    try {
      const response = await query.refetch({
        throwOnError: true,
        cancelRefetch: false,
      });
      assertCurrentWarehouseOperationalScope(client, scope);
      if (
        !response.data ||
        response.data.receipt.operation !== event.operation ||
        !response.data.outcome.orders.some(
          (order) =>
            order.orderId === event.orderId && order.eventId === event.id,
        )
      )
        throw new ApiContractError();
      if (mounted.current)
        setStatus(
          `تم التحقق من حفظ الإجراء ${response.data.receipt.commandId} · ${response.data.receipt.actor.fullName} · ${response.data.receipt.occurredAt}. راجع الحالة الحالية قبل إجراء جديد.`,
        );
    } catch (error: unknown) {
      if (mounted.current && isCurrentWarehouseOperationalScope(client, scope))
        setFailure(warehouseFailureMessage(error, "read"));
    } finally {
      guard.current = false;
      if (mounted.current && isCurrentWarehouseOperationalScope(client, scope))
        setBusy(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void observe();
        }}
      >
        التحقق من النتيجة الأصلية
      </button>
      {status && <p role="status">{status}</p>}
      {failure && <p role="alert">{failure}</p>}
    </div>
  );
}
