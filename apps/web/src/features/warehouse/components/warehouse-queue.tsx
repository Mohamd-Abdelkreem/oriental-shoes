"use client";
import { useActionSuccess } from "@/components/toast/use-action-success";
import { warehouseActionSuccess } from "../model/warehouse-action-success";
import { QueueDisplayMode } from "@/features/manufacturing/components/department-queue-presentation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  hashKey,
  notifyManager,
  useQueryClient,
  type QueryKey,
  type QueryClient,
} from "@tanstack/react-query";
import {
  warehouseOrdersQuerySchema,
  warehousePiecesQuerySchema,
  warehouseOrdersDataSchema,
  warehousePiecesDataSchema,
  salesOrderTypeSchema,
  type WarehouseView,
  type SalesOrderType,
  type WarehouseOrderSummary,
  type WarehouseCommandOperation,
} from "@template/contracts";
import {
  type WarehouseOperationalScope,
  useWarehouseOperationalScope,
  isCurrentWarehouseOperationalScope,
} from "@/shared/query/operational-scope";
import { ApiContractError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { DepartmentOrderTable } from "@/features/manufacturing/screens/department-order-table";
import { DeliveryFailedDialog } from "@/features/prototype/components/delivery-failed-dialog";
import { RetryDeliveryDialog } from "@/features/prototype/components/retry-delivery-dialog";
import { ConfirmDeliveryDialog } from "@/features/prototype/components/confirm-delivery-dialog";
import { DispatchDeliveryDialog } from "@/features/prototype/components/dispatch-delivery-dialog";
import { ConfirmWarehouseReceiptDialog } from "@/features/prototype/components/confirm-warehouse-receipt-dialog";
import {
  warehouseKeys,
  useWarehouseOrders,
  useWarehousePieces,
  useWarehouseGroupDetails,
  fetchWarehouseOrder,
} from "../hooks/warehouse.hooks";
import { useWarehouseCommand } from "../hooks/warehouse-commands.hooks";
import { useWarehouseConfirmation } from "../hooks/warehouse-confirmation.hooks";
import {
  toWarehouseRows,
  toWarehouseGroup,
  type WarehousePieceTarget,
  type WarehouseRowCallbacks,
  type WarehouseSelectionPresentation,
  type WarehouseDialogProps,
} from "../model/warehouse-view.model";
import { warehouseFailureMessage } from "../model/warehouse-form.model";

import { orderTypeOptions } from "@/features/orders/order-types";
import {
  FilterSelect,
  OrientalFilterBar,
} from "@/features/prototype/components/filter-bar";
import { DataTablePagination } from "@/features/prototype/components/data-table-pagination";

type Controls = Readonly<{
  search: string;
  type: SalesOrderType | "ALL";
  mode: "grouped" | "flat";
  page: number;
}>;
const titles: Record<WarehouseView, string> = {
  INCOMING: "وارد بانتظار الاستلام",
  INCOMPLETE: "أوامر غير مكتملة بالمستودع",
  READY: "جاهز للتسليم (كامل القطع)",
  OUT_FOR_DELIVERY: "خرج للتوصيل",
  DELIVERY_FAILED: "تعذر التسليم",
  DELIVERED: "تم التسليم",
};
export function WarehouseQueue({ view }: { view: WarehouseView }) {
  const [controls, setControls] = useState<Controls>({
    search: "",
    type: "ALL",
    mode: "grouped",
    page: 1,
  });
  const [remembered, setRemembered] = useState<NavigationKey | null>(null);
  const change = (next: Partial<Controls>) => {
    if (next.page === undefined) setRemembered(null);
    setControls((current) => ({ ...current, ...next, page: next.page ?? 1 }));
  };
  const client = useQueryClient(),
    scope = useWarehouseOperationalScope(),
    commandActive = useWarehouseCommand().state.phase !== "idle";
  const searchError =
    controls.search.trim().length > 150 || controls.search.includes("\u0000")
      ? "أدخل بحثاً صالحاً بحد أقصى ١٥٠ حرفاً."
      : null;
  const filter = {
    view,
    search: controls.search,
    ...(controls.type === "ALL" ? {} : { type: controls.type }),
    page: controls.page,
  };
  const ordersQuery =
    controls.mode === "grouped" && !searchError
      ? warehouseOrdersQuerySchema.parse({ ...filter, limit: 10 })
      : null;
  const piecesQuery =
    controls.mode === "flat" && !searchError
      ? warehousePiecesQuerySchema.parse({ ...filter, limit: 25 })
      : null;
  const grouped = useWarehouseOrders(ordersQuery),
    flat = useWarehousePieces(piecesQuery);
  const active = controls.mode === "grouped" ? grouped : flat;
  const currentKey =
    scope && isCurrentWarehouseOperationalScope(client, scope)
      ? ordersQuery
        ? {
            kind: "grouped" as const,
            key: warehouseKeys.orders(scope, ordersQuery),
          }
        : piecesQuery
          ? {
              kind: "flat" as const,
              key: warehouseKeys.pieces(scope, piecesQuery),
            }
          : null
      : null;
  const current =
    active.data && currentKey
      ? readNavigation(client, scope, currentKey, { ordersQuery, piecesQuery })
      : null;
  const rememberedHash = remembered ? hashKey(remembered.key) : null;
  const subscribe = useCallback(
    (changed: () => void) => {
      if (rememberedHash === null) return () => {};
      const notify = notifyManager.batchCalls(changed);
      return client
        .getQueryCache()
        .subscribe((event: { type: string; query: { queryKey: QueryKey } }) => {
          if (
            (event.type === "added" ||
              event.type === "removed" ||
              event.type === "updated") &&
            hashKey(event.query.queryKey) === rememberedHash
          )
            notify();
        });
    },
    [client, rememberedHash],
  );
  const rememberedSnapshot = useSyncExternalStore(
    subscribe,
    () => {
      const navigation = readNavigation(client, scope, remembered, {
        ordersQuery,
        piecesQuery,
      });
      return remembered && navigation
        ? hashKey([remembered.kind, remembered.key, navigation])
        : "unavailable";
    },
    () => "unavailable",
  );
  const previous =
    current ??
    (rememberedSnapshot === "unavailable"
      ? null
      : readNavigation(client, scope, remembered, {
          ordersQuery,
          piecesQuery,
        }));
  const confirmed = active.isSuccess && !active.isFetching;
  const totalPages = confirmed ? current?.totalPages : undefined;
  // A confirmed write can empty the last page while its dialog is still finishing.
  if (
    !commandActive &&
    totalPages !== undefined &&
    controls.page > Math.max(1, totalPages)
  )
    setControls({ ...controls, page: Math.max(1, totalPages) });
  const pageChange = (page: number) => {
    const currentNavigation = readNavigation(client, scope, currentKey, {
      ordersQuery,
      piecesQuery,
    });
    const navigation =
      currentNavigation ??
      readNavigation(client, scope, remembered, { ordersQuery, piecesQuery });
    if (!navigation) {
      setRemembered(null);
      return;
    }
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > Math.max(1, navigation.totalPages)
    )
      return;
    if (currentNavigation) setRemembered(currentKey);
    change({ page });
  };
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم المستودع والتسليم"
        title={titles[view]}
        subtitle="الكمية بوحدة القطع الفعلية؛ التوصيل للطلب الكامل فقط"
      />
      <OrientalFilterBar
        searchValue={controls.search}
        searchError={searchError}
        onSearchChange={(search) => {
          change({ search });
        }}
        onReset={() => {
          change({ search: "", type: "ALL" });
        }}
        searchPlaceholder="البحث برقم أمر التفصيل، العميل، الموديل، الموظف المسؤول..."
      >
        <FilterSelect
          ariaLabel="نوع أمر التفصيل"
          value={controls.type}
          options={[
            { value: "ALL", label: "جميع الأنواع" },
            ...orderTypeOptions,
          ]}
          onChange={(value) => {
            if (value === "ALL") change({ type: value });
            else {
              const parsed = salesOrderTypeSchema.safeParse(value);
              if (parsed.success) change({ type: parsed.data });
            }
          }}
        />
        <QueueDisplayMode
          mode={controls.mode}
          onChange={(mode) => {
            change({ mode });
          }}
        />
      </OrientalFilterBar>
      <WarehouseQueueContent
        key={`${view}/${controls.search}/${controls.type}/${controls.mode}/${String(controls.page)}`}
        view={view}
        controls={controls}
        searchError={searchError}
        commandActive={commandActive}
        grouped={grouped}
        flat={flat}
      />
      {previous && previous.totalPages > 1 && (!current || !confirmed) && (
        <p role="status" className="text-xs text-slate-500">
          إجمالي الصفحات والعناصر حسب آخر تحميل مؤكد؛ جارٍ انتظار بيانات الصفحة
          المطلوبة أو إعادة محاولتها.
        </p>
      )}
      <DataTablePagination
        currentPage={controls.page}
        totalPages={previous?.totalPages ?? 0}
        totalCount={previous?.total ?? 0}
        onPageChange={pageChange}
        onPreviousPage={() => {
          pageChange(controls.page - 1);
        }}
        onNextPage={() => {
          pageChange(controls.page + 1);
        }}
      />
    </div>
  );
}
type NavigationKey = Readonly<{ kind: Controls["mode"]; key: QueryKey }>;
function readNavigation(
  client: QueryClient,
  scope: WarehouseOperationalScope | null,
  remembered: NavigationKey | null,
  queries: {
    ordersQuery: ReturnType<typeof warehouseOrdersQuerySchema.parse> | null;
    piecesQuery: ReturnType<typeof warehousePiecesQuerySchema.parse> | null;
  },
) {
  if (
    !scope ||
    !remembered ||
    !isCurrentWarehouseOperationalScope(client, scope)
  )
    return null;
  const cached = client.getQueryData(remembered.key);
  if (remembered.kind === "grouped" && queries.ordersQuery) {
    const parsed = warehouseOrdersDataSchema.safeParse(cached);
    if (
      !parsed.success ||
      parsed.data.view !== queries.ordersQuery.view ||
      parsed.data.pagination.limit !== queries.ordersQuery.limit
    )
      return null;
    const key = warehouseKeys.orders(scope, {
      ...queries.ordersQuery,
      page: parsed.data.pagination.page,
    });
    return hashKey(key) === hashKey(remembered.key)
      ? parsed.data.pagination
      : null;
  }
  if (remembered.kind === "flat" && queries.piecesQuery) {
    const parsed = warehousePiecesDataSchema.safeParse(cached);
    if (
      !parsed.success ||
      parsed.data.view !== queries.piecesQuery.view ||
      parsed.data.orderId !== (queries.piecesQuery.orderId ?? null) ||
      parsed.data.pagination.limit !== queries.piecesQuery.limit
    )
      return null;
    const key = warehouseKeys.pieces(scope, {
      ...queries.piecesQuery,
      page: parsed.data.pagination.page,
    });
    return hashKey(key) === hashKey(remembered.key)
      ? parsed.data.pagination
      : null;
  }
  return null;
}
function WarehouseQueueContent({
  view,
  controls,
  searchError,
  commandActive,
  grouped,
  flat,
}: {
  view: WarehouseView;
  controls: Controls;
  searchError: string | null;
  commandActive: boolean;
  grouped: ReturnType<typeof useWarehouseOrders>;
  flat: ReturnType<typeof useWarehousePieces>;
}) {
  const client = useQueryClient(),
    scope = useWarehouseOperationalScope(),
    trigger = useRef<HTMLElement | null>(null),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const valid = () =>
    mounted.current &&
    scope !== null &&
    isCurrentWarehouseOperationalScope(client, scope);
  const active = controls.mode === "grouped" ? grouped : flat,
    data = active.data;
  const summaries = grouped.data?.orders ?? [],
    rows = flat.data ? toWarehouseRows(flat.data) : [];
  const [selectionState, setSelectionState] = useState<
      Readonly<{
        targets: readonly WarehousePieceTarget[];
        failure: string | null;
      }>
    >({ targets: [], failure: null }),
    [expanded, setExpanded] = useState<readonly string[]>([]),
    [failure, setFailure] = useState<string | null>(null);
  const selected = selectionState.targets;
  const demanded =
    controls.mode === "grouped"
      ? [
          ...new Set([
            ...expanded,
            ...selected.map((target) => target.orderId),
          ]),
        ].filter((id) => summaries.some((summary) => summary.id === id))
      : [];
  const details = useWarehouseGroupDetails(summaries, demanded);
  const states = [...details.values()],
    availability =
      active.isError ||
      states.some((state) => state.phase === "error" || !!state.failure)
        ? "error"
        : !data ||
            active.isFetching ||
            states.some(
              (state) =>
                state.phase === "loading" || state.phase === "refreshing",
            )
          ? "refreshing"
          : "ready";
  const finishAction = useActionSuccess();
  const controller = useWarehouseConfirmation(availability, (result) => {
      finishAction(warehouseActionSuccess(result));
    }),
    busy =
      controller.preparing ||
      commandActive ||
      availability !== "ready" ||
      !!searchError;
  const displayed =
    controls.mode === "flat"
      ? rows
      : states.flatMap((state) => state.group?.rows ?? []);
  const selection: WarehouseSelectionPresentation =
    selected.length === 0
      ? { phase: "empty", rows: [], failure: null }
      : availability === "error"
        ? {
            phase: "error",
            rows: [],
            failure: "تعذر تحديث القطع المختارة؛ أعد تحميل البيانات.",
          }
        : availability === "refreshing"
          ? { phase: "loading", rows: [], failure: null }
          : selected.every((target) =>
                displayed.some(
                  (row) =>
                    row.target.orderId === target.orderId &&
                    row.target.pieceId === target.pieceId &&
                    row.target.expectedVersion === target.expectedVersion,
                ),
              )
            ? {
                phase: "ready",
                rows: displayed.filter((row) =>
                  selected.some(
                    (target) =>
                      target.orderId === row.order.id &&
                      target.pieceId === row.piece.id,
                  ),
                ),
                failure: null,
              }
            : {
                phase: "stale",
                rows: [],
                failure:
                  "تغير نطاق القطع؛ امسح التحديد وراجع البيانات الحالية.",
              };
  const toggleMultiple = (
    targets: readonly WarehousePieceTarget[],
    select: boolean,
  ) => {
    if (!valid() || busy) return;
    if (
      targets.some(
        (target) =>
          !displayed.some(
            (row) =>
              row.target.orderId === target.orderId &&
              row.target.pieceId === target.pieceId &&
              row.target.expectedVersion === target.expectedVersion,
          ),
      )
    ) {
      setFailure("التحديد خارج النطاق الحالي؛ أعد المراجعة.");
      return;
    }
    setSelectionState((current) => {
      const remaining = current.targets.filter(
          (target) =>
            !targets.some(
              (member) =>
                member.orderId === target.orderId &&
                member.pieceId === target.pieceId,
            ),
        ),
        next = select ? [...remaining, ...targets] : remaining;
      return next.length <= 200
        ? { targets: next, failure: null }
        : {
            ...current,
            failure:
              "الحد الأقصى ٢٠٠ قطعة في الإجراء الكامل؛ قلل التحديد ثم راجع الطلبات.",
          };
    });
  };
  const prepare = (
    operation: WarehouseCommandOperation,
    targets: readonly WarehousePieceTarget[],
  ) => {
    if (
      busy ||
      !valid() ||
      targets.some((target) =>
        controls.mode === "grouped"
          ? !summaries.some(
              (summary) =>
                summary.id === target.orderId &&
                summary.version === target.expectedVersion &&
                summary.matchingPieceIds.includes(target.pieceId),
            )
          : !rows.some(
              (row) =>
                row.target.orderId === target.orderId &&
                row.target.pieceId === target.pieceId &&
                row.target.expectedVersion === target.expectedVersion,
            ),
      )
    )
      return;
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    void controller.open(operation, targets);
  };
  const callbacks: WarehouseRowCallbacks = {
    onReceive: (targets) => {
      prepare("RECEIVE", targets);
    },
    onDispatch: (targets) => {
      prepare("DISPATCH", targets);
    },
    onConfirmDelivery: (targets) => {
      prepare("CONFIRM_DELIVERY", targets);
    },
    onFailDelivery: (targets) => {
      prepare("FAIL_DELIVERY", targets);
    },
    onRetryDelivery: (targets) => {
      prepare("RETRY_DELIVERY", targets);
    },
  };
  const retry = async () => {
    if (!scope || !valid()) return;
    await active.refetch({ throwOnError: true });
    const ids = [
      ...new Set([
        ...demanded,
        ...(controller.review?.orders.map((order) => order.orderId) ?? []),
      ]),
    ].sort();
    for (const id of ids) {
      if (!valid()) throw new ApiContractError();
      await fetchWarehouseOrder(client, scope, id);
    }
  };
  const result = !data
    ? active.isError
      ? {
          queryStatus: "error" as const,
          rows: [] as const,
          groups: [] as const,
          counts: null,
          failure: warehouseFailureMessage(active.error, "read"),
        }
      : {
          queryStatus: "loading" as const,
          rows: [] as const,
          groups: [] as const,
          counts: null,
          failure: null,
        }
    : {
        queryStatus: active.isFetching
          ? ("refreshing" as const)
          : ("ready" as const),
        rows,
        groups: summaries,
        counts: data.counts,
        failure: active.isError
          ? warehouseFailureMessage(active.error, "read")
          : null,
      };
  const dialog: Omit<WarehouseDialogProps, "review" | "returnFocusRef"> = {
    source: "warehouse",
    open: true,
    pending: controller.preparing || commandActive,
    readAvailability: availability,
    readFailure:
      availability === "error"
        ? "تعذر تحميل بيانات قائمة المستودع أو القطع المطلوبة."
        : null,
    failure: controller.failure,
    reviewRequired: controller.reviewRequired,
    onReadRetry: retry,
    onReview: controller.reviewCurrent,
    onConfirm: controller.confirm,
    onClose: controller.close,
  };
  return (
    <div className="space-y-4">
      {(failure || selectionState.failure || controller.failure) && (
        <p role="alert">
          {failure ?? selectionState.failure ?? controller.failure}
        </p>
      )}
      {controller.preparing && <p role="status">جارٍ مراجعة النطاق المحدد…</p>}
      <DepartmentOrderTable
        {...result}
        source="warehouse"
        view={view}
        mode={controls.mode}
        filtersActive={controls.search.trim() !== "" || controls.type !== "ALL"}
        busy={busy}
        onRetry={() => {
          void retry().catch((error: unknown) => {
            if (valid()) setFailure(warehouseFailureMessage(error, "read"));
          });
        }}
        selectedTargets={selected}
        onToggleSelect={(target) => {
          toggleMultiple(
            [target],
            !selected.some(
              (member) =>
                member.orderId === target.orderId &&
                member.pieceId === target.pieceId,
            ),
          );
        }}
        onToggleSelectMultiple={toggleMultiple}
        onClearSelection={() => {
          setSelectionState({ targets: [], failure: null });
          controller.close();
        }}
        expandedOrderIds={expanded}
        groupDetails={details}
        onToggleExpand={(summary) => {
          setExpanded((current) =>
            current.includes(summary.id)
              ? current.filter((id) => id !== summary.id)
              : new Set([...demanded, summary.id]).size <= 10
                ? [...current, summary.id]
                : current,
          );
        }}
        onSetGroupExpansion={(expand) => {
          setExpanded(expand ? summaries.map(({ id }) => id) : []);
        }}
        selection={selection}
        onLoadGroup={async (summary: WarehouseOrderSummary) => {
          if (!scope || !valid()) throw new ApiContractError();
          const detail = await fetchWarehouseOrder(client, scope, summary.id);
          if (!valid()) throw new ApiContractError();
          return toWarehouseGroup(summary, detail);
        }}
        callbacks={callbacks}
      />
      {controller.review &&
        (controller.review.operation === "RECEIVE" ? (
          <ConfirmWarehouseReceiptDialog
            {...dialog}
            review={controller.review}
            returnFocusRef={trigger}
          />
        ) : controller.review.operation === "DISPATCH" ? (
          <DispatchDeliveryDialog
            {...dialog}
            review={{ ...controller.review, operation: "DISPATCH" as const }}
            returnFocusRef={trigger}
          />
        ) : controller.review.operation === "CONFIRM_DELIVERY" ? (
          <ConfirmDeliveryDialog
            {...dialog}
            review={{
              ...controller.review,
              operation: "CONFIRM_DELIVERY" as const,
            }}
            returnFocusRef={trigger}
          />
        ) : controller.review.operation === "FAIL_DELIVERY" ? (
          <DeliveryFailedDialog
            {...dialog}
            review={{
              ...controller.review,
              operation: "FAIL_DELIVERY" as const,
            }}
            returnFocusRef={trigger}
          />
        ) : (
          <RetryDeliveryDialog
            {...dialog}
            review={{
              ...controller.review,
              operation: "RETRY_DELIVERY" as const,
            }}
            returnFocusRef={trigger}
          />
        ))}
    </div>
  );
}
