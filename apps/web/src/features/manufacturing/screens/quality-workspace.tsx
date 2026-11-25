"use client";
import { useToast } from "@/components/toast";
import { qualityActionSuccessMessage } from "../model/manufacturing-action-success";
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  type RefObject,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, PackageCheck } from "lucide-react";
import {
  qualityOrdersQuerySchema,
  qualityCommandBodySchema,
  type QualityCommandOperation,
  type QualityView,
  type SalesOrderType,
  type QualityOrderSummary,
  type QualityActivityEvent,
} from "@template/contracts";
import {
  useQualityOperationalScope,
  isCurrentQualityOperationalScope,
  assertCurrentQualityOperationalScope,
  qualityScopeKey,
} from "@/shared/query/operational-scope";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { ActivityGuidance } from "../components/activity-guidance";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { ReceiveAndStartDialog } from "@/features/prototype/components/receive-and-start-dialog";
import { QualityInspectionDialog } from "@/features/prototype/components/quality-inspection-dialog";
import {
  qualityKeys,
  useQualityActivity,
  useQualityDashboard,
  useQualityOrders,
  useQualityPieces,
  useQualityGroupDetails,
  fetchQualityOrder,
} from "../hooks/quality.hooks";
import {
  useQualityCommandReceipt,
  useQualityCommand,
} from "../hooks/quality-commands.hooks";
import { QualityCommandRecovery } from "../components/quality-command-recovery";
import { qualityCommandSessionSchema } from "../model/quality-command-state";
import {
  qualityFailureMessage,
  type QualityInspectionFormValues,
} from "../model/quality-form.model";
import {
  toQualityRows,
  toQualityGroup,
  resolveQualityTargets,
  freezeQualityRows,
  type QualityPieceTarget,
  type QualityWorkRow,
  type QualityReadAvailability,
  type QualitySelectionPresentation,
} from "../model/quality-view.model";
import {
  captureQualitySelection,
  captureQualityInspection,
} from "../model/quality-selection.model";
import { QualityHistoryEventContent } from "./manufacturing-order-detail-view";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { DepartmentOrderTable } from "./department-order-table";
import type {
  QualityTableResult,
  QualityRowCallbacks,
} from "./department-piece-table-types";
import { DepartmentDashboardOverview } from "./department-dashboard-overview";
import { FactoryTaskDetailView } from "./factory-task-detail-view";
import { QualityInspectPieceModal } from "./quality-inspect-piece-modal";
import { PieceReportProblemModal } from "./piece-report-problem-modal";

export function QualityWorkspace() {
  const pathname = usePathname();
  if (pathname === "/quality" || pathname === "/quality/dashboard")
    return <QualityDashboard />;
  if (pathname.includes("/quality/tasks/"))
    return (
      <FactoryTaskDetailView
        source="quality"
        orderId={pathname.split("/").at(-1) ?? ""}
      />
    );
  if (pathname.endsWith("/activity")) return <QualityActivityScope />;
  const view = pathname.endsWith("/inspection")
    ? "INSPECTION"
    : pathname.endsWith("/accepted") ||
        pathname.endsWith("/sent") ||
        pathname.endsWith("/completed")
      ? "ACCEPTED"
      : "INCOMING";
  return <QualityQueueScope pathname={pathname} view={view} />;
}
function QualityDashboard() {
  const query = useQualityDashboard();
  if (query.isPending)
    return (
      <>
        <QualityCommandRecovery />
        <p role="status">جارٍ تحميل لوحة الجودة…</p>
      </>
    );
  if (!query.data)
    return (
      <>
        <QualityCommandRecovery />
        <div role="alert">
          {qualityFailureMessage(
            query.error,
            "تحميل لوحة الجودة",
            undefined,
            "read",
          )}
          <button
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </>
    );
  const counts = query.data.counts;
  const cards: KpiCardItem[] = [
    {
      title: "وارد بانتظار الفحص",
      value: counts.incoming.orders,
      unit: "أمر تفصيل",
      subtitle: `${String(counts.incoming.pieces)} قطعة`,
      icon: Clock,
      tone: "amber",
      href: "/quality/incoming",
    },
    {
      title: "تحت الفحص والمطابقة الآن",
      value: counts.inspection.orders,
      unit: "أمر تفصيل",
      subtitle: `${String(counts.inspection.pieces)} قطعة`,
      icon: PackageCheck,
      tone: "teal",
      href: "/quality/inspection",
    },
    {
      title: "المجاز والمحوّل للمستودع",
      value: counts.accepted.orders,
      unit: "أمر تفصيل",
      subtitle: `${String(counts.accepted.pieces)} قطعة — الاستلام الفعلي مستقل`,
      icon: CheckCircle2,
      tone: "emerald",
      href: "/quality/accepted",
    },
  ];
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم الجودة والتغليف"
        title="لوحة تحكم الجودة والتغليف"
        subtitle="تحليل ومتابعة محطات الفحص والمطابقة والتغليف"
      />
      <QualityCommandRecovery />
      {query.isFetching && <p role="status">جارٍ تحديث لوحة الجودة…</p>}
      {query.isError && (
        <div role="alert">
          {qualityFailureMessage(
            query.error,
            "تحديث لوحة الجودة",
            undefined,
            "read",
          )}
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      <OrientalKpiGrid cards={cards} columns={3} />
      <DepartmentDashboardOverview source="quality" data={query.data} />
    </div>
  );
}

type QueueControls = {
  searchValue: string;
  searchError: string | null;
  type: SalesOrderType | "ALL";
  mode: "grouped" | "flat";
  page: number;
  selected: readonly QualityPieceTarget[];
  expanded: readonly string[];
};
type QualityQueueView = Exclude<QualityView, "CORRECTIONS">;
type QualityConfirmation = {
  operation: QualityCommandOperation;
  mode: "piece" | "group";
  rows: readonly QualityWorkRow[];
  failure: string | null;
  reviewRequired: boolean;
};
const initialControls = (): QueueControls => ({
  searchValue: "",
  searchError: null,
  type: "ALL",
  mode: "grouped",
  page: 1,
  selected: [],
  expanded: [],
});
function QualityQueueScope({
  pathname,
  view,
}: {
  pathname: string;
  view: QualityQueueView;
}) {
  const scope = useQualityOperationalScope();
  return scope ? (
    <QualityQueue
      key={`${qualityScopeKey(scope).join("/")}/${pathname}`}
      view={view}
    />
  ) : (
    <QualityCommandRecovery />
  );
}
function QualityQueue({ view }: { view: QualityQueueView }) {
  const { toast } = useToast();
  const client = useQueryClient(),
    scope = useQualityOperationalScope(),
    command = useQualityCommand(),
    [controls, setControls] = useState(initialControls),
    [confirmation, setConfirmation] = useState<QualityConfirmation | null>(
      null,
    ),
    [failure, setFailure] = useState<string | null>(null),
    [preparing, setPreparing] = useState(false),
    context = useRef<QueueControls | null>(controls),
    visible = useRef(confirmation),
    mounted = useRef(false),
    preparation = useRef<object | null>(null),
    retryingRead = useRef(false),
    trigger = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    context.current = controls;
    visible.current = confirmation;
  }, [controls, confirmation]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      context.current = null;
      visible.current = null;
      preparation.current = null;
    };
  }, []);
  const filters = {
      view,
      page: controls.page,
      limit: controls.mode === "grouped" ? 10 : 100,
      ...(controls.searchValue.trim() ? { search: controls.searchValue } : {}),
      ...(controls.type === "ALL" ? {} : { type: controls.type }),
    },
    orders = useQualityOrders(controls.mode === "grouped" ? filters : null),
    pieces = useQualityPieces(controls.mode === "flat" ? filters : null),
    summaries = orders.data?.items ?? [],
    rows = pieces.data ? toQualityRows(pieces.data) : [],
    requested =
      controls.mode === "grouped"
        ? [
            ...new Set([
              ...controls.expanded,
              ...controls.selected.map((target) => target.orderId),
            ]),
          ].filter((id) => summaries.some((summary) => summary.id === id))
        : [],
    details = useQualityGroupDetails(summaries, requested),
    active = controls.mode === "grouped" ? orders : pieces,
    data = active.data;
  const valid = () =>
    mounted.current &&
    scope !== null &&
    isCurrentQualityOperationalScope(client, scope) &&
    context.current === controls;
  const idle = () =>
    scope !== null &&
    qualityCommandSessionSchema.parse(
      client.getQueryData([...qualityScopeKey(scope), "command-session"]) ?? {
        phase: "idle",
      },
    ).phase === "idle";
  const readAvailability: QualityReadAvailability =
    active.isPending || active.isFetching
      ? "refreshing"
      : active.isError
        ? "error"
        : "ready";
  const readFailure = active.isError
    ? qualityFailureMessage(
        active.error,
        "تحديث قائمة الجودة",
        undefined,
        "read",
      )
    : null;
  const retryRead = async () => {
    if (!valid() || active.isFetching || retryingRead.current) return;
    retryingRead.current = true;
    try {
      await active.refetch({ throwOnError: false, cancelRefetch: false });
    } catch (error: unknown) {
      if (valid())
        setFailure(
          qualityFailureMessage(error, "تحديث قائمة الجودة", undefined, "read"),
        );
    } finally {
      retryingRead.current = false;
    }
  };
  const busy =
    preparing ||
    command.state.phase !== "idle" ||
    active.isFetching ||
    active.isError;
  const change = (patch: Partial<QueueControls>) => {
    if (!valid()) return;
    if (
      confirmation &&
      !window.confirm(
        "تغيير العرض يلغي مسودة التأكيد غير المرسلة. هل تريد المتابعة؟",
      )
    )
      return;
    context.current = null;
    visible.current = null;
    preparation.current = null;
    setPreparing(false);
    setConfirmation(null);
    setFailure(null);
    setControls({ ...controls, selected: [], expanded: [], ...patch });
  };
  const selection: QualitySelectionPresentation = (() => {
    if (!controls.selected.length)
      return { phase: "empty", rows: [], failure: null };
    if (active.isError)
      return {
        phase: "error",
        rows: [],
        failure: qualityFailureMessage(
          active.error,
          "تحميل القطع المختارة",
          undefined,
          "read",
        ),
      };
    if (!data || active.isFetching)
      return { phase: "loading", rows: [], failure: null };
    if (controls.mode === "grouped")
      for (const id of new Set(
        controls.selected.map((target) => target.orderId),
      )) {
        if (!summaries.some((summary) => summary.id === id))
          return {
            phase: "stale",
            rows: [],
            failure: "تغيرت أوامر مختارة في الصفحة؛ راجع جميع القطع.",
          };
        const detail = details.get(id);
        if (detail?.phase === "error" || detail?.failure)
          return {
            phase: "error",
            rows: [],
            failure: "تعذر تحميل جميع القطع المختارة؛ راجع التحديد كاملاً.",
          };
        if (!detail || detail.phase !== "ready")
          return { phase: "loading", rows: [], failure: null };
      }
    const candidates =
        controls.mode === "flat"
          ? rows
          : requested.flatMap((id) => details.get(id)?.group?.rows ?? []),
      selected: QualityWorkRow[] = [];
    for (const target of controls.selected) {
      const row = candidates.find(
        (row) =>
          row.target.orderId === target.orderId &&
          row.target.pieceId === target.pieceId &&
          row.target.expectedVersion === target.expectedVersion,
      );
      if (!row)
        return {
          phase: "stale",
          rows: [],
          failure: "تغيرت بيانات قطع مختارة. راجع التحديد كاملاً قبل التأكيد.",
        };
      selected.push(row);
    }
    return { phase: "ready", rows: selected, failure: null };
  })();
  const toggle = (targets: readonly QualityPieceTarget[], select: boolean) => {
    if (busy || !valid()) return;
    const next = select
      ? [
          ...controls.selected,
          ...targets.filter(
            (target) =>
              !controls.selected.some(
                (old) =>
                  old.orderId === target.orderId &&
                  old.pieceId === target.pieceId,
              ),
          ),
        ]
      : controls.selected.filter(
          (old) =>
            !targets.some(
              (target) =>
                target.orderId === old.orderId &&
                target.pieceId === old.pieceId,
            ),
        );
    if (next.length > 200) {
      setFailure("يمكن اختيار ٢٠٠ قطعة كحد أقصى. قلّل التحديد ثم أعد التأكيد.");
      return;
    }
    setControls({ ...controls, selected: next });
  };
  const eligible = (
    operation: QualityCommandOperation,
    selected: readonly QualityWorkRow[],
  ) => {
    if (operation === "INSPECT") {
      if (
        !selected.length ||
        !selected.every((row) => row.work.allowedActions.canInspect)
      )
        throw new Error("راجع أهلية جميع القطع للفحص.");
    } else captureQualitySelection(operation, selected);
  };
  const load = async (
    targets: readonly QualityPieceTarget[],
    versionPolicy: "preserve-versions" | "review-current-versions",
  ) => {
    if (!scope) throw new Error("Quality scope required");
    const resolved: QualityWorkRow[] = [],
      ids = [...new Set(targets.map((target) => target.orderId))].toSorted();
    if (
      !targets.length ||
      targets.length > 200 ||
      new Set(targets.map((target) => target.pieceId)).size !== targets.length
    )
      throw new Error("Invalid exact selection");
    for (let offset = 0; offset < ids.length; offset += 10) {
      const batch = await Promise.all(
        ids
          .slice(offset, offset + 10)
          .map((id) => fetchQualityOrder(client, scope, id)),
      );
      assertCurrentQualityOperationalScope(client, scope);
      if (!valid()) throw new Error("Obsolete preparation");
      for (const detail of batch)
        resolved.push(
          ...resolveQualityTargets(
            detail,
            targets
              .filter((target) => target.orderId === detail.paper.order.id)
              .map((target) =>
                versionPolicy === "review-current-versions"
                  ? { ...target, expectedVersion: detail.paper.order.version }
                  : target,
              ),
          ),
        );
    }
    return resolved;
  };
  const prepare = async (
    operation: QualityCommandOperation,
    targets: readonly QualityPieceTarget[],
    mode: "piece" | "group" = "group",
  ) => {
    if (!scope || busy || preparation.current || !valid() || !idle()) return;
    const captured = Object.freeze(
        targets.map((target) => Object.freeze({ ...target })),
      ),
      token = {};
    preparation.current = token;
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPreparing(true);
    setFailure(null);
    try {
      if (
        captured.some((target) =>
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
        throw new Error("Selection outside current page");
      const resolved = await load(captured, "preserve-versions");
      eligible(operation, resolved);
      if (valid() && preparation.current === token && idle())
        setConfirmation({
          operation,
          mode,
          rows: freezeQualityRows(resolved),
          failure: null,
          reviewRequired: false,
        });
    } catch (error: unknown) {
      if (valid() && preparation.current === token)
        setFailure(
          qualityFailureMessage(
            error,
            "مراجعة المجموعة المختارة",
            undefined,
            "read",
          ),
        );
    } finally {
      if (valid() && preparation.current === token) {
        preparation.current = null;
        setPreparing(false);
      }
    }
  };
  const confirm = async (values?: QualityInspectionFormValues) => {
    const captured = confirmation;
    if (
      !captured ||
      !scope ||
      !valid() ||
      !idle() ||
      captured.reviewRequired ||
      readAvailability !== "ready"
    )
      return;
    try {
      const body =
        captured.operation === "INSPECT"
          ? qualityCommandBodySchema.parse({
              commandId: crypto.randomUUID(),
              operation: "INSPECT",
              orders: captureQualityInspection(
                captured.rows,
                values ?? { orders: [] },
              ),
            })
          : qualityCommandBodySchema.parse({
              commandId: crypto.randomUUID(),
              operation: captured.operation,
              orders: captureQualitySelection(
                captured.operation,
                captured.rows,
              ),
            });
      const result = await command.submit(body);
      assertCurrentQualityOperationalScope(client, scope);
      if (valid() && visible.current === captured) {
        const shouldNotify = command.acknowledge();
        setConfirmation(null);
        setControls({ ...controls, selected: [] });
        if (shouldNotify) toast.success(qualityActionSuccessMessage(result));
      }
    } catch (error: unknown) {
      if (valid() && visible.current === captured)
        setConfirmation({
          ...captured,
          failure: qualityFailureMessage(error, "حفظ إجراء الجودة"),
          reviewRequired: true,
        });
      throw error;
    }
  };
  const review = async () => {
    const captured = confirmation;
    if (!captured || !valid() || !idle() || preparation.current) return;
    const token = {};
    preparation.current = token;
    try {
      const resolved = await load(
        captured.rows.map((row) => row.target),
        "review-current-versions",
      );
      eligible(captured.operation, resolved);
      if (
        valid() &&
        preparation.current === token &&
        visible.current === captured &&
        idle()
      )
        setConfirmation({
          ...captured,
          rows: freezeQualityRows(resolved),
          failure: null,
          reviewRequired: false,
        });
    } catch (error: unknown) {
      if (valid() && visible.current === captured)
        setConfirmation({
          ...captured,
          failure: qualityFailureMessage(
            error,
            "مراجعة جميع القطع",
            undefined,
            "read",
          ),
          reviewRequired: true,
        });
      throw error;
    } finally {
      if (preparation.current === token) preparation.current = null;
    }
  };
  const retry = () => {
    if (!scope || !valid()) return;
    void active.refetch();
    for (const id of requested)
      void client.refetchQueries({
        queryKey: qualityKeys.order(scope, id),
        exact: true,
      });
  };
  const result: QualityTableResult = !data
    ? active.isError
      ? {
          queryStatus: "error",
          rows: [],
          groups: [],
          counts: null,
          pagination: null,
          failure: qualityFailureMessage(
            active.error,
            "تحميل القائمة",
            undefined,
            "read",
          ),
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
              page <= Math.max(1, data.pagination.totalPages)
            )
              change({ page });
          },
        },
        failure: active.isError
          ? qualityFailureMessage(
              active.error,
              "تحديث القائمة",
              undefined,
              "read",
            )
          : null,
      };
  if (
    command.state.phase === "idle" &&
    data &&
    controls.page > Math.max(1, data.pagination.totalPages)
  ) {
    setConfirmation(null);
    if (controls.selected.length > 0)
      setFailure("تغير ترقيم الصفحات؛ راجع الصفحة الحالية وحدد القطع من جديد.");
    setControls({
      ...controls,
      page: Math.max(1, data.pagination.totalPages),
      selected: [],
      expanded: [],
    });
  }
  const callbacks: QualityRowCallbacks = {
    onReceiveAndStart: (targets) => {
      void prepare("RECEIVE_AND_START", targets);
    },
    onContinue: (targets) => {
      void prepare("CONTINUE", targets);
    },
    onInspect: (targets, mode) => {
      void prepare("INSPECT", targets, mode);
    },
    onReportIssues: (targets) => {
      void prepare("REPORT_ISSUES", targets);
    },
  };
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم الجودة والتغليف"
        title={
          view === "INCOMING"
            ? "وارد للجودة والتغليف"
            : view === "INSPECTION"
              ? "محطة الفحص والمطابقة"
              : "المجاز والمحوّل للمستودع"
        }
        subtitle="تحديد القطع الفعلية ومتابعة حالتها المعتمدة"
      />
      <QualityCommandRecovery />
      {failure && <p role="alert">{failure}</p>}
      <DepartmentOrderTable
        {...result}
        source="quality"
        view={view}
        searchValue={controls.searchValue}
        searchError={controls.searchError}
        onSearchChange={(value) => {
          const parsed = qualityOrdersQuerySchema.safeParse({
            ...filters,
            limit: 10,
            page: 1,
            search: value,
          });
          if (!parsed.success) {
            preparation.current = null;
            setPreparing(false);
            setControls({
              ...controls,
              searchError: "أدخل بحثاً حتى ١٥٠ حرفاً دون محارف غير صالحة.",
            });
            return;
          }
          change({ searchValue: value, searchError: null, page: 1 });
        }}
        typeFilter={controls.type}
        onTypeFilterChange={(type) => {
          change({ type, page: 1 });
        }}
        onClearFilters={() => {
          change({ ...initialControls(), mode: controls.mode });
        }}
        mode={controls.mode}
        onModeChange={(mode) => {
          if (mode !== controls.mode) change({ mode, page: 1 });
        }}
        busy={busy}
        onRetry={retry}
        selectedTargets={controls.selected}
        onToggleSelect={(target) => {
          toggle(
            [target],
            !controls.selected.some(
              (old) =>
                old.orderId === target.orderId &&
                old.pieceId === target.pieceId,
            ),
          );
        }}
        onToggleSelectMultiple={toggle}
        onClearSelection={() => {
          change({ selected: [] });
        }}
        expandedOrderIds={controls.expanded}
        groupDetails={details}
        onToggleExpand={(summary) => {
          if (
            !busy &&
            valid() &&
            summaries.some((current) => current.id === summary.id)
          )
            setControls({
              ...controls,
              expanded: controls.expanded.includes(summary.id)
                ? controls.expanded.filter((id) => id !== summary.id)
                : [...controls.expanded, summary.id],
            });
        }}
        onSetGroupExpansion={(expand) => {
          if (!valid()) return;
          setControls({
            ...controls,
            expanded: expand ? summaries.map(({ id }) => id) : [],
          });
        }}
        selection={selection}
        onLoadGroup={async (summary: QualityOrderSummary) => {
          if (!scope) throw new Error("Missing quality scope");
          const detail = await fetchQualityOrder(client, scope, summary.id);
          return toQualityGroup(summary, detail);
        }}
        callbacks={callbacks}
      />
      {confirmation && (
        <QualityQueueConfirmation
          confirmation={confirmation}
          pending={command.state.phase !== "idle"}
          readAvailability={readAvailability}
          readFailure={readFailure}
          onReadRetry={retryRead}
          returnFocusRef={trigger}
          onClose={() => {
            visible.current = null;
            setConfirmation(null);
          }}
          onReview={review}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
function QualityQueueConfirmation({
  confirmation,
  pending,
  readAvailability,
  readFailure,
  onReadRetry,
  returnFocusRef,
  onClose,
  onReview,
  onConfirm,
}: {
  confirmation: QualityConfirmation;
  pending: boolean;
  readAvailability: QualityReadAvailability;
  readFailure: string | null;
  onReadRetry: () => Promise<void>;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onReview: () => Promise<void>;
  onConfirm: (values?: QualityInspectionFormValues) => Promise<void>;
}) {
  const dialog = {
    source: "quality" as const,
    rows: confirmation.rows,
    open: true,
    onClose,
    pending,
    readAvailability,
    readFailure,
    onReadRetry,
    failure: confirmation.failure,
    reviewRequired: confirmation.reviewRequired,
    onReview,
  };
  if (confirmation.operation === "REPORT_ISSUES")
    return (
      <PieceReportProblemModal
        source="quality"
        rows={confirmation.rows}
        readAvailability={readAvailability}
        readFailure={readFailure}
        onReadRetry={onReadRetry}
        returnFocusRef={returnFocusRef}
        onClose={onClose}
      />
    );
  if (confirmation.operation === "INSPECT")
    return confirmation.mode === "piece" &&
      confirmation.rows.length === 1 &&
      confirmation.rows[0] ? (
      <QualityInspectPieceModal
        {...dialog}
        row={confirmation.rows[0]}
        onConfirm={onConfirm}
        returnFocusRef={returnFocusRef}
      />
    ) : (
      <QualityInspectionDialog
        {...dialog}
        onConfirm={onConfirm}
        returnFocusRef={returnFocusRef}
      />
    );
  return (
    <ReceiveAndStartDialog
      {...dialog}
      operation={confirmation.operation}
      onConfirm={() => onConfirm()}
      returnFocusRef={returnFocusRef}
    />
  );
}

function QualityActivityScope() {
  const scope = useQualityOperationalScope();
  return scope ? (
    <QualityActivity key={qualityScopeKey(scope).join("/")} />
  ) : (
    <QualityCommandRecovery />
  );
}
function QualityActivity() {
  const [page, setPage] = useState(1),
    query = useQualityActivity({ page, limit: 25 }),
    scope = useQualityOperationalScope();
  if (query.data && page > Math.max(1, query.data.pagination.totalPages))
    setPage(Math.max(1, query.data.pagination.totalPages));
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم الجودة والتغليف / سجل العمليات"
        title="سجل نشاط فحص الجودة والتغليف"
        subtitle="قرارات الفحص وتقارير المشكلات ودورات التصحيح المحفوظة"
      />
      <QualityCommandRecovery />
      <ActivityGuidance>
        <p>بعد إعادة التحميل، يمكنك التحقق من نتيجة إجراء نفّذته من السجل.</p>
        <p>غياب النتيجة لا يثبت فشل الإجراء. السجل مخصّص للتحقق من النتيجة.</p>
      </ActivityGuidance>
      {query.isPending && <p role="status">جارٍ تحميل السجل…</p>}
      {query.isFetching && query.data && <p role="status">جارٍ تحديث السجل…</p>}
      {query.isError && (
        <div role="alert">
          {qualityFailureMessage(
            query.error,
            "تحميل النشاط",
            undefined,
            "read",
          )}
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
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <OrientalTable
            data={query.data.events}
            keyExtractor={(row) => `${row.kind}:${row.event.id}`}
            pagination={{
              page,
              totalPages: query.data.pagination.totalPages,
              total: query.data.pagination.total,
              onPageChange: setPage,
            }}
            columns={[
              {
                header: "الوقت والتاريخ",
                render: (row) => (
                  <time
                    dateTime={row.event.occurredAt}
                    dir="ltr"
                    className="text-xs text-slate-500"
                  >
                    {row.event.occurredAt}
                  </time>
                ),
              },
              {
                header: "المسؤول",
                render: (row) => (
                  <span className="font-semibold text-slate-800">
                    {row.event.actor.fullName}
                  </span>
                ),
              },
              {
                header: "رقم الأمر",
                render: (row) => (
                  <Link
                    className="font-bold text-teal-700 hover:underline"
                    href={`/quality/orders/${row.event.orderId}`}
                  >
                    {row.event.businessNumber}
                  </Link>
                ),
              },
              {
                header: "الحدث والبيان",
                render: (row) => <QualityHistoryEventContent item={row} />,
              },
              {
                header: "المهمة",
                render: (row) =>
                  row.kind === "issue" ? (
                    <Link
                      href={`/quality/tasks/${row.event.orderId}?pieceId=${row.event.pieceId}`}
                    >
                      عرض مهمة القطعة
                    </Link>
                  ) : (
                    <Link href={`/quality/tasks/${row.event.orderId}`}>
                      اختيار قطعة
                    </Link>
                  ),
              },
              {
                header: "النتيجة الأصلية",
                render: (row) =>
                  row.kind === "quality" &&
                  row.event.actor.id === scope?.actorId ? (
                    <QualityOriginalResult
                      key={`${String(page)}/${row.event.id}`}
                      event={row.event}
                    />
                  ) : (
                    "—"
                  ),
              },
            ]}
            emptyTitle="لا توجد حركات مسجلة"
            emptySubtitle="لم تسجل حركات في هذا النطاق."
          />
        </div>
      )}
    </div>
  );
}
function QualityOriginalResult({ event }: { event: QualityActivityEvent }) {
  const scope = useQualityOperationalScope(),
    client = useQueryClient(),
    query = useQualityCommandReceipt(event.commandId, scope),
    [status, setStatus] = useState<string | null>(null),
    [failure, setFailure] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    guard = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const observe = async () => {
    if (!scope || event.actor.id !== scope.actorId || guard.current) return;
    guard.current = true;
    setBusy(true);
    setStatus(null);
    setFailure(null);
    try {
      const response = await query.refetch({ throwOnError: true });
      assertCurrentQualityOperationalScope(client, scope);
      if (!response.data) throw new Error("Original result unavailable");
      if (mounted.current)
        setStatus(
          `تم التحقق من حفظ الإجراء ${response.data.receipt.commandId} · ${response.data.receipt.actor.fullName} · ${response.data.receipt.occurredAt}. راجع الحالة الحالية للقطع قبل إجراء جديد.`,
        );
    } catch (error: unknown) {
      if (mounted.current && isCurrentQualityOperationalScope(client, scope))
        setFailure(
          qualityFailureMessage(
            error,
            "التحقق من النتيجة الأصلية",
            undefined,
            "read",
          ),
        );
    } finally {
      guard.current = false;
      if (mounted.current && isCurrentQualityOperationalScope(client, scope))
        setBusy(false);
    }
  };
  return (
    <div>
      <button
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
