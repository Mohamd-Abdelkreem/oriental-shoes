import { QueueSelectionBar } from "../components/department-queue-presentation";
import type {
  QualityDepartmentBatchActionsProps,
  PersistedDepartmentBatchActionsProps,
} from "./department-piece-table-types";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  PackageCheck,
  Scissors,
  Send,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DepartmentPieceTableProps } from "./department-piece-table-types";
import type { DepartmentTab } from "./department-order-tabs";
import type { useDepartmentBatchActions } from "./use-department-batch-actions";

type BatchActions = ReturnType<typeof useDepartmentBatchActions>;
type DepartmentRole = DepartmentPieceTableProps["deptRole"];
type BatchButton = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  className: string;
};

const batchButtonClassName =
  "btn-pill inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold shadow-sm";

function BatchActionButton({
  button,
  selectedCount,
}: {
  button: BatchButton;
  selectedCount: number;
}) {
  const Icon = button.icon;
  return (
    <button
      type="button"
      onClick={button.onClick}
      className={`${batchButtonClassName} ${button.className}`}
    >
      <Icon size={14} />
      <span>
        {button.label} ({selectedCount})
      </span>
    </button>
  );
}

const manufacturingButtons = {
  cutting: {
    startLabel: "بدء قص القطع المحددة",
    startIcon: Scissors,
    transferLabel: "إنهاء القص والتحويل للإنتاج",
    transferIcon: Send,
  },
  production: {
    startLabel: "بدء تركيب وتجميع القطع المحددة",
    startIcon: Wrench,
    transferLabel: "إنهاء التركيب والتحويل للجودة",
    transferIcon: Send,
  },
  quality: {
    startLabel: "بدء الفحص",
    startIcon: PackageCheck,
    transferLabel: "قبول وإرسال للمستودع",
    transferIcon: PackageCheck,
  },
};

function ManufacturingBatchButtons({
  deptRole,
  activeTab,
  selectedCount,
  actions,
}: {
  deptRole: Exclude<DepartmentRole, "warehouse">;
  activeTab: DepartmentTab;
  selectedCount: number;
  actions: BatchActions;
}) {
  const labels = manufacturingButtons[deptRole];
  const startLabel =
    deptRole === "quality" && activeTab === "problems"
      ? "بدء إعادة الفحص"
      : labels.startLabel;
  return (
    <>
      {(activeTab === "ready" || activeTab === "problems") && (
        <BatchActionButton
          selectedCount={selectedCount}
          button={{
            label: startLabel,
            icon: labels.startIcon,
            onClick: actions.handleBatchStartWork,
            className: "btn-teal",
          }}
        />
      )}
      {activeTab === "in_progress" && (
        <BatchActionButton
          selectedCount={selectedCount}
          button={{
            label: labels.transferLabel,
            icon: labels.transferIcon,
            onClick: actions.handleBatchCompleteTransfer,
            className: "btn-teal",
          }}
        />
      )}
    </>
  );
}

function WarehouseBatchButtons({
  pathname,
  selectedCount,
  actions,
}: {
  pathname: string;
  selectedCount: number;
  actions: BatchActions;
}) {
  const isOutForDelivery = pathname.includes("/out-for-delivery");
  const isReady =
    pathname.includes("/warehouse/ready") ||
    pathname.includes("/warehouse/in-progress");
  const isIncomplete = pathname.includes("/warehouse/incomplete");
  const isFailed = pathname.includes("/delivery-failed");
  const isIncoming =
    pathname.includes("/warehouse/incoming") ||
    (!isOutForDelivery && !isReady && !isIncomplete && !isFailed);
  const buttons: (BatchButton & { visible: boolean })[] = [
    {
      visible: isOutForDelivery,
      label: "تأكيد تسليم الطلب للعميل",
      icon: CheckCircle2,
      onClick: actions.handleBatchConfirmDelivered,
      className: "btn-teal",
    },
    {
      visible: isOutForDelivery,
      label: "حدثت مشكلة في التسليم",
      icon: AlertTriangle,
      onClick: actions.openDeliveryFailedDialog,
      className: "bg-rose-600 hover:bg-rose-700 text-white",
    },
    {
      visible: isReady,
      label: "إرسال مع المندوب",
      icon: Truck,
      onClick: actions.handleBatchDispatch,
      className: "btn-teal",
    },
    {
      visible: isIncoming,
      label: "استلام وتخزين بالمستودع",
      icon: PackageCheck,
      onClick: actions.handleBatchWarehouseReceipt,
      className: "bg-emerald-700 hover:bg-emerald-800 text-white",
    },
    {
      visible: isFailed,
      label: "إعادة إرسال مع المندوب",
      icon: Truck,
      onClick: actions.handleBatchDispatch,
      className: "btn-teal",
    },
  ];
  return (
    <>
      {buttons
        .filter((button) => button.visible)
        .map((button) => (
          <BatchActionButton
            key={button.label}
            button={button}
            selectedCount={selectedCount}
          />
        ))}
      {isIncomplete && (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
          التسليم مقفل: الطلب غير مكتمل، بانتظار تصنيع باقي القطع بالمصنع
        </span>
      )}
    </>
  );
}

function LegacyDepartmentBatchActions({
  activeTab,
  deptRole,
  pathname,
  selectedCount,
  actions,
  onClearSelection,
}: {
  activeTab: DepartmentTab;
  deptRole: DepartmentRole;
  pathname: string;
  selectedCount: number;
  actions: BatchActions;
  onClearSelection: () => void;
}) {
  if (selectedCount === 0) return null;
  const isCompleted =
    activeTab === "completed" ||
    pathname.includes("/delivered") ||
    pathname.includes("/warehouse/completed");
  return (
    <div
      role="group"
      aria-label="إجراءات القطع المحددة"
      className="animate-in fade-in flex flex-col items-start justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
        <CheckSquare size={16} className="text-teal-700" />
        <span>تم تحديد {selectedCount} قطع حذاء</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isCompleted ? (
          <span className="text-xs font-medium text-slate-500">
            أرشيف مكتمل: هذه القطع تم تسليمها وإنجازها بالكامل ولا تتطلب أي
            إجراءات إضافية.
          </span>
        ) : deptRole === "warehouse" ? (
          <WarehouseBatchButtons
            pathname={pathname}
            selectedCount={selectedCount}
            actions={actions}
          />
        ) : (
          <ManufacturingBatchButtons
            deptRole={deptRole}
            activeTab={activeTab}
            selectedCount={selectedCount}
            actions={actions}
          />
        )}
        <button
          type="button"
          onClick={onClearSelection}
          className="btn-pill btn-secondary px-2.5 py-1.5 text-xs"
        >
          إلغاء التحديد
        </button>
      </div>
    </div>
  );
}

export function DepartmentBatchActions(
  props:
    | Parameters<typeof LegacyDepartmentBatchActions>[0]
    | PersistedDepartmentBatchActionsProps
    | QualityDepartmentBatchActionsProps,
) {
  if ("source" in props && props.source === "quality")
    return <QualityDepartmentBatchActions {...props} />;
  return "source" in props ? (
    <PersistedDepartmentBatchActions {...props} />
  ) : (
    <LegacyDepartmentBatchActions {...props} />
  );
}

const unavailableSelectionNotice =
  "حدّد قطعًا مؤهلة لنفس الإجراء عشان تنفّذه على المجموعة.";

function PersistedDepartmentBatchActions({
  department,
  view,
  selection,
  selectedTargets,
  busy,
  callbacks,
  onClearSelection,
}: PersistedDepartmentBatchActionsProps) {
  if (!selectedTargets.length) return null;
  const rows = selection.phase === "ready" ? selection.rows : [];
  const targets = rows.map((row) => row.target);
  const complete = rows.length === selectedTargets.length;
  const returned = view === "RETURNED";
  const canStart =
    complete &&
    (view === "INCOMING" || returned) &&
    rows.every((row) => row.work.allowedActions.canReceiveAndStart);
  const canTransfer =
    complete &&
    (view === "IN_PROGRESS" || returned) &&
    rows.every((row) => row.work.allowedActions.canCompleteTransfer);
  const startSubject = returned ? "تصحيح " : "";
  const destination = department === "CUTTING" ? "الإنتاج" : "الجودة";
  return (
    <QueueSelectionBar
      count={selectedTargets.length}
      loading={selection.phase === "loading"}
      failure={selection.failure}
      {...(selection.phase === "ready" &&
        view !== "COMPLETED" &&
        !canStart &&
        !canTransfer && {
          notice: unavailableSelectionNotice,
        })}
    >
      {canStart && (
        <button
          type="button"
          className="btn-pill btn-teal px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => {
            callbacks.onReceiveAndStart(targets);
          }}
        >
          استلام وبدء {startSubject}المحدد
        </button>
      )}
      {canTransfer && (
        <button
          type="button"
          className="btn-pill btn-teal px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => {
            callbacks.onCompleteTransfer(targets);
          }}
        >
          {returned ? "إتمام التصحيح وتحويل" : "إتمام وتحويل"} المحدد إلى{" "}
          {destination}
        </button>
      )}
      <button
        type="button"
        className="btn-pill btn-secondary px-2.5 py-1.5 text-xs"
        onClick={onClearSelection}
      >
        مسح التحديد
      </button>
    </QueueSelectionBar>
  );
}

function QualityDepartmentBatchActions(
  props: QualityDepartmentBatchActionsProps,
) {
  const { selection, selectedTargets, busy, callbacks } = props;
  if (!selectedTargets.length) return null;
  const rows = selection.phase === "ready" ? selection.rows : [];
  const targets = rows.map((row) => row.target);
  const complete =
    rows.length === selectedTargets.length &&
    selectedTargets.every((target) =>
      rows.some(
        (row) =>
          row.target.orderId === target.orderId &&
          row.target.pieceId === target.pieceId &&
          row.target.expectedVersion === target.expectedVersion,
      ),
    );
  const showStart = rows.some(
    (row) => row.work.allowedActions.canReceiveAndStart,
  );
  const showInspect = rows.some((row) => row.work.allowedActions.canInspect);
  const showReport = rows.some((row) => row.work.allowedActions.canReportIssue);
  const onlyReinspectionStarts = rows.every(
    (row) => row.work.currentCorrection?.phase === "AWAITING_REINSPECTION",
  );
  const onlyReinspectionResults = rows.every(
    (row) => row.work.currentCorrection?.phase === "INSPECTING",
  );
  return (
    <QueueSelectionBar
      count={selectedTargets.length}
      loading={selection.phase === "loading"}
      failure={selection.failure}
    >
      {showStart && (
        <button
          type="button"
          className="btn-pill btn-teal px-3 py-1.5 text-xs"
          disabled={
            busy ||
            !complete ||
            !rows.every((row) => row.work.allowedActions.canReceiveAndStart)
          }
          onClick={() => {
            callbacks.onReceiveAndStart(targets);
          }}
        >
          استلام وبدء {onlyReinspectionStarts ? "إعادة فحص" : "فحص"} المحدد
        </button>
      )}
      {showInspect && (
        <button
          type="button"
          className="btn-pill btn-teal px-3 py-1.5 text-xs"
          disabled={
            busy ||
            !complete ||
            !rows.every((row) => row.work.allowedActions.canInspect)
          }
          onClick={() => {
            callbacks.onInspect(targets, "group");
          }}
        >
          تسجيل نتيجة {onlyReinspectionResults ? "إعادة فحص" : "فحص"} المحدد
        </button>
      )}
      {showReport && (
        <button
          type="button"
          className="btn-pill btn-outline px-3 py-1.5 text-xs"
          disabled={
            busy ||
            !complete ||
            !rows.every((row) => row.work.allowedActions.canReportIssue)
          }
          onClick={() => {
            callbacks.onReportIssues(targets);
          }}
        >
          تسجيل مشكلة للمحدد
        </button>
      )}
      <button
        type="button"
        className="btn-pill btn-secondary px-2.5 py-1.5 text-xs"
        onClick={props.onClearSelection}
      >
        مسح التحديد
      </button>
    </QueueSelectionBar>
  );
}
