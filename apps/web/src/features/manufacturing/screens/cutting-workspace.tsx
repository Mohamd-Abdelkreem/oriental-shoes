"use client";
import {
  Clock,
  Scissors,
  Factory,
  RotateCcw,
  CheckCircle2,
  Wrench,
} from "lucide-react";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import type { ManufacturingDashboardData } from "@template/contracts";

import type { ManufacturingOrderData } from "@template/contracts";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  manufacturingOrdersQuerySchema,
  manufacturingPiecesQuerySchema,
  salesOrderTypeSchema,
  type ManufacturingDepartment,
  type ManufacturingCommandOperation,
  type ManufacturingView,
  type ManufacturingOrderSummary,
} from "@template/contracts";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { ReceiveAndStartDialog } from "@/features/prototype/components/receive-and-start-dialog";
import { RecordCompletionDialog } from "@/features/prototype/components/record-completion-dialog";
import {
  assertCurrentManufacturingOperationalScope,
  isCurrentManufacturingOperationalScope,
  useManufacturingOperationalScope,
} from "@/shared/query/operational-scope";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import {
  manufacturingKeys,
  fetchManufacturingOrder,
  useManufacturingDashboard,
  useManufacturingOrders,
  useManufacturingPieces,
  useManufacturingGroupDetails,
  useManufacturingActivity,
  manufacturingOrderOptions,
} from "../hooks/manufacturing.hooks";
import { useManufacturingCommand } from "../hooks/manufacturing-commands.hooks";
import { ManufacturingCommandRecovery } from "../components/manufacturing-command-recovery";
import { ActivityGuidance } from "../components/activity-guidance";
import { manufacturingFailureMessage } from "../model/manufacturing-form.model";
import { captureManufacturingSelection } from "../model/manufacturing-selection.model";
import {
  toManufacturingRows,
  toManufacturingGroup,
  resolveManufacturingTargets,
  freezeManufacturingRows,
  type ManufacturingPieceTarget,
  type ManufacturingWorkRow,
  type ManufacturingSelectionPresentation,
} from "../model/manufacturing-view.model";
import { toManufacturingEventSummary } from "../model/manufacturing-event.model";
import { DepartmentOrderTable } from "./department-order-table";
import { DepartmentDashboardOverview } from "./department-dashboard-overview";
import { FactoryTaskDetailView } from "./factory-task-detail-view";
import { PieceReportProblemModal } from "./piece-report-problem-modal";
import type {
  ManufacturingTableMode,
  ManufacturingTypeFilter,
  ManufacturingTableResult,
} from "./department-piece-table-types";

export function CuttingWorkspace() {
  return <PersistedFactoryWorkspace department="CUTTING" />;
}
// Both existing workspace entries share presentation and interaction; department stays an explicit immutable input.
export function PersistedFactoryWorkspace({
  department,
}: {
  department: ManufacturingDepartment;
}) {
  const pathname = usePathname(),
    scope = useManufacturingOperationalScope(department);
  const identity = `${scope?.actorId ?? ""}/${String(scope?.accessVersion ?? 0)}/${String(scope?.epoch ?? -1)}/${department}`;
  if (!scope)
    return (
      <div role="alert">
        مساحة العمل غير متاحة لهذا الحساب. حدّث الحساب أو اختر القسم المسموح به.
      </div>
    );
  const taskPrefix = `/${department === "CUTTING" ? "cutting" : "production"}/tasks/`;
  if (pathname.startsWith(taskPrefix))
    return (
      <FactoryTaskDetailView
        source="persisted"
        orderId={decodeURIComponent(pathname.slice(taskPrefix.length))}
        department={department}
        key={`${identity}/${pathname}`}
      />
    );
  if (pathname.endsWith("/activity"))
    return <FactoryActivity department={department} key={identity} />;
  if (pathname.endsWith("/dashboard"))
    return <FactoryDashboard department={department} key={identity} />;
  return (
    <FactoryQueue department={department} pathname={pathname} key={identity} />
  );
}
const factoryKpis = (
  department: ManufacturingDepartment,
  data: ManufacturingDashboardData,
): KpiCardItem[] => {
  const definitions =
    department === "CUTTING"
      ? ([
          {
            title: "وارد للقص بانتظار الاستلام والبدء",
            key: "incoming",
            href: "/cutting/incoming",
            icon: Clock,
          },
          {
            title: "قيد القص والتفصيل الآن",
            key: "inProgress",
            href: "/cutting/in-progress",
            icon: Scissors,
          },
          {
            title: "معاد أو موقوف للمراجعة",
            key: "returned",
            href: "/cutting/returned",
            icon: RotateCcw,
          },
          {
            title: "المنجز والمحوّل إلى الإنتاج",
            key: "completed",
            href: "/cutting/completed",
            icon: CheckCircle2,
          },
        ] as const)
      : ([
          {
            title: "وارد للإنتاج بانتظار الاستلام والبدء",
            key: "incoming",
            href: "/production/incoming",
            icon: Clock,
          },
          {
            title: "قيد التجميع والشد الآن",
            key: "inProgress",
            href: "/production/in-progress",
            icon: Factory,
          },
          {
            title: "أوامر الإصلاح",
            key: "repairs",
            href: "/production/repairs",
            icon: Wrench,
          },
          {
            title: "معاد أو موقوف للمراجعة",
            key: "returned",
            href: "/production/returned",
            icon: RotateCcw,
          },
        ] as const);
  return definitions.map((definition) => ({
    title: definition.title,
    value: data.counts[definition.key].orders,
    unit: "أمر تفصيل",
    subtitle: `${String(data.counts[definition.key].pieces)} قطعة في هذا العرض`,
    icon: definition.icon,
    href: definition.href,
    tone:
      definition.key === "incoming" || definition.key === "repairs"
        ? data.counts[definition.key].orders > 0
          ? "amber"
          : "neutral"
        : definition.key === "returned"
          ? data.counts.returned.orders > 0
            ? "rose"
            : "neutral"
          : definition.key === "completed"
            ? "emerald"
            : "teal",
  }));
};
function FactoryDashboard({
  department,
}: {
  department: ManufacturingDepartment;
}) {
  const query = useManufacturingDashboard(department);
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={
          department === "CUTTING"
            ? "قسم القص والتفصيل"
            : "قسم الإنتاج والإصلاح"
        }
        title={
          department === "CUTTING"
            ? "مساحة عمل القص والتفصيل"
            : "مساحة عمل الإنتاج والإصلاح"
        }
        subtitle="متابعة أوامر القسم والقطع الفعلية"
      />
      <ManufacturingCommandRecovery department={department} />
      {query.isPending && <p role="status">جارٍ تحميل لوحة القسم…</p>}
      {query.isError && (
        <div role="alert">
          {manufacturingFailureMessage(query.error, "تحميل لوحة القسم")}
          <button
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {query.data && (
        <OrientalKpiGrid items={factoryKpis(department, query.data)} />
      )}
      {query.data && (
        <DepartmentDashboardOverview
          source="persisted"
          department={department}
          data={query.data}
        />
      )}
    </div>
  );
}
function FactoryActivity({
  department,
}: {
  department: ManufacturingDepartment;
}) {
  const [page, setPage] = useState(1),
    [own, setOwn] = useState(false),
    [observed, setObserved] = useState<string | null>(null),
    [failure, setFailure] = useState<string | null>(null);
  const observation = useRef(0);
  const query = useManufacturingActivity(department, {
      page,
      limit: 25,
      ...(own ? { actor: "me" as const } : {}),
    }),
    client = useQueryClient(),
    scope = useManufacturingOperationalScope(department);
  const observe = async (kind: "work" | "report", id: string) => {
    if (!scope) return;
    const token = ++observation.current;
    try {
      assertCurrentManufacturingOperationalScope(client, scope);
      const { manufacturingApi } = await import("../api/manufacturing.api");
      assertCurrentManufacturingOperationalScope(client, scope);
      const result =
        kind === "work"
          ? await manufacturingApi.observeWork(id)
          : await manufacturingApi.observeReport(id);
      assertCurrentManufacturingOperationalScope(client, scope);
      if (result.receipt.actor.id !== scope.actorId)
        throw new Error("Wrong original actor");
      if (token !== observation.current) return;
      setObserved(
        `تم التحقق من الإجراء ${result.receipt.commandId}. راجع حالة القطع الحالية قبل تأكيد إجراء جديد.`,
      );
      setFailure(null);
    } catch (error: unknown) {
      if (
        token !== observation.current ||
        !isCurrentManufacturingOperationalScope(client, scope)
      )
        return;
      await reconcileBusinessDenial(client, error, scope);
      if (
        token === observation.current &&
        isCurrentManufacturingOperationalScope(client, scope)
      )
        setFailure(
          manufacturingFailureMessage(error, "التحقق من نتيجة الإجراء"),
        );
    }
  };
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        title="سجل نشاط القسم"
        subtitle="نتائج العمل الفعلية وتقارير المشكلات"
      />
      <ManufacturingCommandRecovery department={department} />
      <ActivityGuidance
        filter={
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 transition-colors hover:border-teal-300 has-checked:border-teal-200 has-checked:bg-teal-50">
            <input
              className="size-4 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              type="checkbox"
              checked={own}
              onChange={(event) => {
                observation.current++;
                setOwn(event.target.checked);
                setPage(1);
                setObserved(null);
              }}
            />
            عملياتي فقط
          </label>
        }
      >
        <p>
          بعد إعادة التحميل، راجع عملياتك والصفحات السابقة للتحقق من النتيجة.
        </p>
        <p>غياب النتيجة لا يثبت فشله. النظام لا يعيد إرسال الإجراء تلقائياً.</p>
      </ActivityGuidance>
      {observed && <p role="status">{observed}</p>}
      {failure && <p role="alert">{failure}</p>}
      {query.isPending && <p role="status">جارٍ تحميل السجل…</p>}
      {query.isError && (
        <div role="alert">
          {manufacturingFailureMessage(query.error, "تحميل النشاط")}
          <button
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {query.data && (
        <OrientalTable
          data={query.data.events}
          keyExtractor={(row) => `${row.kind}:${row.event.id}`}
          pagination={{
            page,
            totalPages: query.data.pagination.totalPages,
            total: query.data.pagination.total,
            onPageChange: (page) => {
              observation.current++;
              setObserved(null);
              setFailure(null);
              setPage(page);
            },
          }}
          columns={[
            { header: "الوقت", render: (row) => row.event.occurredAt },
            { header: "المسؤول", render: (row) => row.event.actor.fullName },
            {
              header: "رقم الأمر",
              render: (row) => (
                <Link
                  href={`/${department === "CUTTING" ? "cutting" : "production"}/orders/${row.event.orderId}`}
                >
                  {row.event.businessNumber}
                </Link>
              ),
            },
            {
              header: "الحدث والبيان",
              render: (row) =>
                row.kind === "manufacturing"
                  ? toManufacturingEventSummary(row.event)
                  : `${row.event.operation === "REPORT_ISSUE" ? "تسجيل مشكلة" : "مراجعة مشكلة"} · ${row.event.reason ?? row.event.notes ?? "—"}`,
            },
            {
              header: "النتيجة الأصلية",
              render: (row) =>
                own &&
                (row.kind === "manufacturing" ||
                  row.event.operation === "REPORT_ISSUE") ? (
                  <button
                    onClick={() => {
                      void observe(
                        row.kind === "manufacturing" ? "work" : "report",
                        row.event.commandId,
                      );
                    }}
                  >
                    التحقق من نتيجة الإجراء
                  </button>
                ) : (
                  "—"
                ),
            },
          ]}
          emptyTitle="لا توجد حركات مسجلة"
          emptySubtitle="غياب الحركة هنا لا يثبت فشل إجراء سابق."
        />
      )}
    </div>
  );
}
const viewForPath = (path: string): ManufacturingView =>
  path.endsWith("/in-progress")
    ? "IN_PROGRESS"
    : path.endsWith("/returned")
      ? "RETURNED"
      : path.endsWith("/completed") || path.endsWith("/sent")
        ? "COMPLETED"
        : "INCOMING";
type Controls = {
  route: string;
  searchValue: string;
  searchError: string | null;
  typeFilter: ManufacturingTypeFilter;
  mode: ManufacturingTableMode;
  page: number;
  selected: readonly ManufacturingPieceTarget[];
  expanded: readonly string[];
};
const initialControls = (route: string): Controls => ({
  route,
  searchValue: "",
  searchError: null,
  typeFilter: route.endsWith("/repairs") ? "REPAIR" : "ALL",
  mode: "grouped",
  page: 1,
  selected: [],
  expanded: [],
});
type Confirmation = {
  operation: ManufacturingCommandOperation;
  rows: readonly ManufacturingWorkRow[];
  failure: string | null;
  reviewRequired: boolean;
};
function FactoryQueue({
  department,
  pathname,
}: {
  department: ManufacturingDepartment;
  pathname: string;
}) {
  const client = useQueryClient(),
    scope = useManufacturingOperationalScope(department),
    command = useManufacturingCommand(department);
  const [controls, setControls] = useState(() => initialControls(pathname)),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [report, setReport] = useState<{
      data: ManufacturingOrderData;
      target: ManufacturingPieceTarget;
    } | null>(null),
    [failure, setFailure] = useState<string | null>(null),
    [preparing, setPreparing] = useState(false);
  const visibleConfirmation = useRef(confirmation);
  visibleConfirmation.current = confirmation;
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const preparation = useRef<object | null>(null),
    context = useRef("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      preparation.current = null;
      visibleConfirmation.current = null;
    };
  }, []);
  const controlIdentity = JSON.stringify([
    pathname,
    controls.searchValue,
    controls.typeFilter,
    controls.mode,
    controls.page,
  ]);
  context.current = controlIdentity;
  if (controls.route !== pathname) {
    const leavingRepair = controls.route.endsWith("/repairs");
    setControls({
      ...controls,
      route: pathname,
      typeFilter: pathname.endsWith("/repairs")
        ? "REPAIR"
        : leavingRepair
          ? "ALL"
          : controls.typeFilter,
      page: 1,
      selected: [],
      expanded: [],
    });
    preparation.current = null;
  }
  const view = viewForPath(pathname),
    locked = pathname.endsWith("/repairs");
  const filters = {
    view,
    page: controls.page,
    limit: 10,
    ...(controls.searchValue.trim() ? { search: controls.searchValue } : {}),
    ...(controls.typeFilter === "ALL" ? {} : { type: controls.typeFilter }),
  };
  const orders = useManufacturingOrders(
      department,
      controls.mode === "grouped" ? filters : null,
    ),
    pieces = useManufacturingPieces(
      department,
      controls.mode === "flat" ? filters : null,
    );
  const summaries = orders.data?.items ?? [],
    rows = pieces.data ? toManufacturingRows(pieces.data) : [];
  const requested =
    controls.mode === "grouped"
      ? [
          ...new Set([
            ...controls.expanded,
            ...controls.selected.map((target) => target.orderId),
          ]),
        ].filter((id) => summaries.some((summary) => summary.id === id))
      : [];
  const groupDetails = useManufacturingGroupDetails(
    department,
    summaries,
    requested,
  );
  const active = controls.mode === "grouped" ? orders : pieces,
    data = active.data;
  const busy =
    preparing ||
    command.state.phase !== "idle" ||
    active.isFetching ||
    active.isError;
  const currentContext = controls;
  const validContext = () =>
    mounted.current && scope !== null && context.current === controlIdentity;
  const update = (change: (previous: Controls) => Controls) => {
    if (!validContext() || !scope) return;
    assertCurrentManufacturingOperationalScope(client, scope);
    setControls((previous) =>
      previous === currentContext ? change(previous) : previous,
    );
  };
  const changeControls = (change: (previous: Controls) => Controls) => {
    if (!validContext()) return;
    preparation.current = null;
    setPreparing(false);
    setConfirmation(null);
    update(change);
  };
  const resetSelection = (previous: Controls) => ({
    ...previous,
    selected: [],
    expanded: [],
  });
  const retry = async (): Promise<boolean> => {
    if (!scope || !validContext()) return false;
    setFailure(null);
    try {
      assertCurrentManufacturingOperationalScope(client, scope);
      await active.refetch({ throwOnError: true });
      await Promise.all(
        requested.map((id) =>
          client.refetchQueries(
            {
              queryKey: manufacturingOrderOptions(client, scope, id).queryKey,
              exact: true,
              type: "active",
            },
            { throwOnError: true },
          ),
        ),
      );
      assertCurrentManufacturingOperationalScope(client, scope);
      return validContext();
    } catch (error: unknown) {
      if (validContext())
        setFailure(manufacturingFailureMessage(error, "تحديث القطع الحالية"));
      return false;
    }
  };
  const selection: ManufacturingSelectionPresentation = (() => {
    if (!controls.selected.length)
      return { phase: "empty", rows: [], failure: null };
    if (!data)
      return active.isError
        ? {
            phase: "error",
            rows: [],
            failure: manufacturingFailureMessage(
              active.error,
              "تحميل القطع المختارة",
            ),
          }
        : { phase: "loading", rows: [], failure: null };
    const candidates =
      controls.mode === "flat"
        ? rows
        : requested.flatMap((id) => groupDetails.get(id)?.group?.rows ?? []);
    if (controls.mode === "grouped") {
      for (const id of new Set(
        controls.selected.map((target) => target.orderId),
      )) {
        const detail = groupDetails.get(id);
        if (detail?.phase === "error" || detail?.failure)
          return {
            phase: "error",
            rows: [],
            failure:
              "تعذر تحميل كل القطع المختارة. حدّث البيانات وراجع التحديد.",
          };
        if (
          !detail ||
          detail.phase === "loading" ||
          detail.phase === "refreshing"
        )
          return { phase: "loading", rows: [], failure: null };
      }
    }
    const selected = controls.selected.map((target) =>
      candidates.find(
        (row) =>
          row.target.orderId === target.orderId &&
          row.target.pieceId === target.pieceId &&
          row.target.expectedVersion === target.expectedVersion,
      ),
    );
    return selected.some((row) => row === undefined)
      ? {
          phase: "stale",
          rows: [],
          failure:
            "تغيرت بيانات قطع مختارة. امسح التحديد وحدّث البيانات ثم راجع القطع.",
        }
      : {
          phase: "ready",
          rows: selected.filter((row) => row !== undefined),
          failure: null,
        };
  })();
  const toggleMultiple = (
    targets: readonly ManufacturingPieceTarget[],
    select: boolean,
  ) => {
    if (busy) return;
    const selected = select
      ? [
          ...controls.selected,
          ...targets.filter(
            (target) =>
              !controls.selected.some((old) => old.pieceId === target.pieceId),
          ),
        ]
      : controls.selected.filter(
          (old) => !targets.some((target) => target.pieceId === old.pieceId),
        );
    if (selected.length > 200) {
      setFailure(
        "يمكن اختيار ٢٠٠ قطعة كحد أقصى. قلّل التحديد ثم أعد المحاولة.",
      );
      return;
    }
    update((previous) => ({ ...previous, selected }));
  };
  const prepare = (
    operation: ManufacturingCommandOperation,
    targets: readonly ManufacturingPieceTarget[],
  ) => {
    if (
      !scope ||
      busy ||
      preparation.current ||
      !validContext() ||
      command.state.phase !== "idle"
    )
      return;
    assertCurrentManufacturingOperationalScope(client, scope);
    const captured = Object.freeze(
        targets.map((target) => Object.freeze({ ...target })),
      ),
      token = {};
    preparation.current = token;
    dialogTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPreparing(true);
    setFailure(null);
    const run = async () => {
      try {
        const ids = [...new Set(captured.map((target) => target.orderId))];
        if (
          ids.length > 10 ||
          !captured.length ||
          captured.length > 200 ||
          ids.some((id) =>
            controls.mode === "grouped"
              ? !summaries.some((summary) => summary.id === id)
              : !rows.some((row) => row.order.id === id),
          )
        )
          throw new Error("Invalid page selection");
        const details = await Promise.all(
          ids.map((id) => fetchManufacturingOrder(client, scope, id)),
        );
        const resolved = details.flatMap((detail) =>
          resolveManufacturingTargets(
            detail,
            captured.filter(
              (target) => target.orderId === detail.paper.order.id,
            ),
          ),
        );
        captureManufacturingSelection(operation, department, resolved);
        assertCurrentManufacturingOperationalScope(client, scope);
        if (
          validContext() &&
          preparation.current === token &&
          client.getQueryData([
            ...manufacturingKeys.root(scope),
            "command-session",
          ]) === undefined
        )
          setConfirmation({
            operation,
            rows: freezeManufacturingRows(resolved),
            failure: null,
            reviewRequired: false,
          });
      } catch (error: unknown) {
        if (validContext() && preparation.current === token)
          setFailure(
            manufacturingFailureMessage(error, "مراجعة المجموعة المختارة"),
          );
      } finally {
        if (preparation.current === token) {
          preparation.current = null;
          setPreparing(false);
        }
      }
    };
    void run();
  };
  const reportPiece = (target: ManufacturingPieceTarget) => {
    if (!scope || busy || preparation.current || command.state.phase !== "idle")
      return;
    const token = {};
    preparation.current = token;
    dialogTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPreparing(true);
    void fetchManufacturingOrder(client, scope, target.orderId)
      .then((detail) => {
        const [row] = resolveManufacturingTargets(detail, [target]);
        if (!row?.work.allowedActions.canReportIssue)
          throw new Error("Piece ineligible");
        assertCurrentManufacturingOperationalScope(client, scope);
        if (validContext() && preparation.current === token)
          setReport({ data: detail, target });
      })
      .catch((error: unknown) => {
        if (validContext())
          setFailure(manufacturingFailureMessage(error, "مراجعة القطعة"));
      })
      .finally(() => {
        if (preparation.current === token) {
          preparation.current = null;
          setPreparing(false);
        }
      });
  };
  const confirm = async () => {
    const captured = confirmation;
    if (!captured || !scope || !validContext()) return;
    try {
      const orders = captureManufacturingSelection(
        captured.operation,
        department,
        captured.rows,
      );
      await command.submit({
        kind: "work",
        department,
        body: {
          commandId: crypto.randomUUID(),
          operation: captured.operation,
          orders,
        },
      });
      if (validContext() && visibleConfirmation.current === captured) {
        command.acknowledge();
        setConfirmation((previous) =>
          previous === captured ? null : previous,
        );
        setControls((previous) =>
          previous === currentContext
            ? { ...previous, selected: [] }
            : previous,
        );
      }
    } catch (error: unknown) {
      if (validContext())
        setConfirmation((previous) =>
          previous === captured
            ? {
                ...previous,
                failure: manufacturingFailureMessage(error, "حفظ إجراء العمل"),
                reviewRequired: true,
              }
            : previous,
        );
    }
  };
  const reviewConfirmation = async () => {
    const captured = confirmation;
    if (!captured) return;
    const refreshed = await retry();
    if (!validContext() || visibleConfirmation.current !== captured) return;
    if (!refreshed) {
      setConfirmation((previous) =>
        previous === captured
          ? {
              ...previous,
              failure:
                "تعذر تحديث جميع بيانات القطع. أعد المحاولة قبل التأكيد.",
            }
          : previous,
      );
      return;
    }
    setConfirmation(null);
    setFailure(
      "تم تحديث البيانات. راجع القطع المختارة ثم افتح تأكيداً جديداً؛ لم تُستبدل الإصدارات تلقائياً.",
    );
  };
  const ConfirmationDialog =
    confirmation?.operation === "COMPLETE_TRANSFER"
      ? RecordCompletionDialog
      : ReceiveAndStartDialog;
  const result: ManufacturingTableResult = !data
    ? active.isError
      ? {
          queryStatus: "error",
          rows: [],
          groups: [],
          counts: null,
          pagination: null,
          failure: manufacturingFailureMessage(active.error, "تحميل القائمة"),
        }
      : {
          queryStatus: "loading",
          rows: [],
          groups: [],
          counts: null,
          pagination: null,
          failure: null,
        }
    : {
        queryStatus: active.isFetching ? "refreshing" : "ready",
        rows,
        groups: summaries,
        counts: data.counts,
        pagination: {
          page: controls.page,
          totalPages: data.pagination.totalPages,
          total: data.pagination.total,
          onPageChange: (page) => {
            if (
              Number.isInteger(page) &&
              page >= 1 &&
              page <= Math.max(1, data.pagination.totalPages) &&
              page !== controls.page
            )
              changeControls((previous) => ({
                ...resetSelection(previous),
                page,
              }));
          },
        },
        failure: active.isError
          ? manufacturingFailureMessage(active.error, "تحديث القائمة")
          : null,
      };
  if (data && controls.page > Math.max(1, data.pagination.totalPages))
    setControls((previous) => ({
      ...resetSelection(previous),
      page: Math.max(1, data.pagination.totalPages),
    }));
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={
          department === "CUTTING"
            ? "قسم القص والتفصيل"
            : "قسم الإنتاج والإصلاح"
        }
        title={
          locked
            ? "أوامر الإصلاح"
            : view === "INCOMING"
              ? "الوارد بانتظار الاستلام والبدء"
              : view === "IN_PROGRESS"
                ? "العمل قيد التنفيذ"
                : view === "RETURNED"
                  ? "المعاد والموقوف للمراجعة"
                  : "المنجز والمحوّل من القسم"
        }
        subtitle="تحديد القطع الفعلية ومتابعة حالتها المعتمدة"
      />
      <ManufacturingCommandRecovery department={department} />
      {failure && <p role="alert">{failure}</p>}
      <DepartmentOrderTable
        {...result}
        source="persisted"
        department={department}
        view={view}
        searchValue={controls.searchValue}
        searchError={controls.searchError}
        onSearchChange={(value) => {
          const schema =
            controls.mode === "grouped"
              ? manufacturingOrdersQuerySchema
              : manufacturingPiecesQuerySchema;
          const parsed = schema.safeParse({
            ...filters,
            search: value,
            page: 1,
          });
          if (!parsed.success) {
            update((previous) => ({
              ...previous,
              searchError:
                "تعذر البحث: أدخل نصاً حتى ١٥٠ حرفاً دون محارف غير صالحة، ثم أعد المحاولة.",
            }));
            return;
          }
          if (value !== controls.searchValue)
            changeControls((previous) => ({
              ...resetSelection(previous),
              searchValue: value,
              searchError: null,
              page: 1,
            }));
        }}
        typeFilter={controls.typeFilter}
        typeFilterLocked={locked}
        onTypeFilterChange={(value) => {
          if (
            (locked && value !== "REPAIR") ||
            (value !== "ALL" && !salesOrderTypeSchema.safeParse(value).success)
          )
            return;
          if (value !== controls.typeFilter)
            changeControls((previous) => ({
              ...resetSelection(previous),
              typeFilter: value,
              page: 1,
            }));
        }}
        onClearFilters={() => {
          changeControls((previous) => ({
            ...initialControls(pathname),
            mode: previous.mode,
          }));
        }}
        mode={controls.mode}
        onModeChange={(mode) => {
          if (mode !== controls.mode)
            changeControls((previous) => ({
              ...resetSelection(previous),
              mode,
              page: 1,
            }));
        }}
        busy={busy}
        onRetry={() => {
          void retry();
        }}
        selectedTargets={controls.selected}
        onToggleSelect={(target) => {
          toggleMultiple(
            [target],
            !controls.selected.some((old) => old.pieceId === target.pieceId),
          );
        }}
        onToggleSelectMultiple={toggleMultiple}
        onClearSelection={() => {
          changeControls((previous) => ({ ...previous, selected: [] }));
        }}
        expandedOrderIds={controls.expanded}
        groupDetails={groupDetails}
        onToggleExpand={(summary) => {
          if (summaries.some((current) => current.id === summary.id))
            update((previous) => ({
              ...previous,
              expanded: previous.expanded.includes(summary.id)
                ? previous.expanded.filter((id) => id !== summary.id)
                : [...previous.expanded, summary.id],
            }));
        }}
        selection={selection}
        onLoadGroup={async (summary: ManufacturingOrderSummary) => {
          if (!scope) throw new Error("Missing scope");
          const detail = await fetchManufacturingOrder(
            client,
            scope,
            summary.id,
          );
          return toManufacturingGroup(summary, detail);
        }}
        callbacks={{
          onReceiveAndStart: (targets) => {
            prepare("RECEIVE_AND_START", targets);
          },
          onContinue: (targets) => {
            prepare("CONTINUE", targets);
          },
          onCompleteTransfer: (targets) => {
            prepare("COMPLETE_TRANSFER", targets);
          },
          onReportIssue: reportPiece,
        }}
      />
      {confirmation && (
        <ConfirmationDialog
          returnFocusRef={dialogTrigger}
          source="persisted"
          open
          department={department}
          operation={confirmation.operation}
          rows={confirmation.rows}
          pending={command.state.phase !== "idle"}
          failure={confirmation.failure}
          reviewRequired={confirmation.reviewRequired}
          onClose={() => {
            setConfirmation(null);
          }}
          onReview={reviewConfirmation}
          onConfirm={confirm}
        />
      )}
      {report && (
        <PieceReportProblemModal
          returnFocusRef={dialogTrigger}
          source="persisted"
          department={department}
          data={report.data}
          target={report.target}
          onClose={() => {
            setReport(null);
          }}
        />
      )}
    </div>
  );
}
