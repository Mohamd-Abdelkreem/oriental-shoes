import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckSquare,
  ChevronDown,
  Eye,
  LayoutGrid,
  List,
  MinusSquare,
  Square,
} from "lucide-react";
import type { FactoryOrderPiece, SalesOrderType } from "@template/contracts";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { OrientalStatusPill } from "@/features/prototype/components/data-table";
import { orderTypeLabels } from "@/features/orders/order-types";
import type { ManufacturingWorkRow } from "../model/manufacturing-view.model";
import type { QualityWorkRow } from "../model/quality-view.model";
import { PieceLocationBadge } from "../screens/piece-location-badge";

export function QueueDisplayMode({
  mode,
  onChange,
}: {
  mode: "grouped" | "flat";
  onChange: (mode: "grouped" | "flat") => void;
}) {
  return (
    <div className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {(
        [
          { value: "grouped", label: "حسب الطلب", icon: LayoutGrid },
          { value: "flat", label: "حسب القطعة", icon: List },
        ] as const
      ).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={mode === value}
          title={label}
          className="rounded p-1.5 text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-teal-700 aria-pressed:bg-white aria-pressed:text-teal-900 aria-pressed:shadow-2xs"
          onClick={() => {
            onChange(value);
          }}
        >
          <Icon size={14} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function QueueSelectionBar({
  count,
  loading,
  failure,
  notice,
  children,
}: {
  count: number;
  loading: boolean;
  failure: string | null;
  notice?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3"
      aria-label="إجراءات القطع المحددة"
    >
      <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
        <CheckSquare size={16} aria-hidden className="text-teal-700" />
        <span>المحدد: {count} قطعة</span>
      </div>
      {loading && (
        <span role="status">جارٍ تحميل بيانات جميع القطع المختارة…</span>
      )}
      {failure && <span role="alert">{failure}</span>}
      {notice && <span>{notice}</span>}
      <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

export function QueueGroupControls({
  groups,
  expandedOrderIds,
  onSetExpanded,
}: {
  groups: readonly { id: string; matchingPieceCount: number }[];
  expandedOrderIds: readonly string[];
  onSetExpanded: (expanded: boolean) => void;
}) {
  if (groups.length === 0) return null;
  const allExpanded = groups.every(({ id }) => expandedOrderIds.includes(id));
  const pieces = groups.reduce(
    (count, group) => count + group.matchingPieceCount,
    0,
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
      <span>
        {groups.length} أمر تفصيل ·{" "}
        <strong className="font-bold text-slate-700">{pieces}</strong> قطعة في
        الصفحة
      </span>
      <button
        type="button"
        className="font-semibold text-teal-800 transition-colors hover:text-teal-950"
        onClick={() => {
          onSetExpanded(!allExpanded);
        }}
      >
        {allExpanded ? "طي تفاصيل الكل" : "توسيع تفاصيل الكل"}
      </button>
    </div>
  );
}

export function QueueSelection({
  label,
  checked,
  mixed = false,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const Mark = checked ? CheckSquare : mixed ? MinusSquare : Square;
  return (
    <label className="relative inline-flex size-6 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-teal-700 has-disabled:opacity-50">
      <input
        type="checkbox"
        aria-label={label}
        title={label}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        checked={checked}
        disabled={disabled}
        ref={(input) => {
          if (input) input.indeterminate = mixed;
        }}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <Mark
        aria-hidden
        size={16}
        className={checked || mixed ? "text-teal-700" : undefined}
      />
    </label>
  );
}

type OrderHeading = {
  businessNumber: string;
  customerName: string;
  type: SalesOrderType;
  deliveryDate: string | null;
  matchingPieceCount: number;
};
type PieceHeading = Pick<
  FactoryOrderPiece,
  "id" | "model" | "size" | "position"
>;
type PieceSelection = {
  orderId: string;
  pieceId: string;
  expectedVersion: number;
};

export function byQueuePiecePosition(
  first: { piece: PieceHeading },
  second: { piece: PieceHeading },
) {
  return first.piece.position - second.piece.position;
}

export function isQueuePieceSelected(
  selection: readonly PieceSelection[],
  target: PieceSelection,
) {
  return selection.some(
    (piece) =>
      piece.orderId === target.orderId &&
      piece.pieceId === target.pieceId &&
      piece.expectedVersion === target.expectedVersion,
  );
}

export function QueueOrderCard<T extends string>({
  order,
  pieces,
  orderHref,
  expanded,
  onExpand,
  selection,
  indicators,
  children,
}: {
  order: OrderHeading;
  pieces: readonly PieceHeading[];
  orderHref: Route<T>;
  expanded: boolean;
  onExpand: () => void;
  selection: ReactNode;
  indicators?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white transition-all ${
        expanded
          ? "border-teal-300 shadow-xs"
          : "border-slate-200/80 shadow-2xs hover:border-slate-300"
      }`}
    >
      <div
        className={`relative flex items-start gap-3 p-3.5 transition-colors sm:p-4 ${
          expanded ? "bg-teal-50/30" : "hover:bg-slate-50/70"
        }`}
      >
        <button
          type="button"
          aria-label={`${order.businessNumber} · ${order.customerName} · ${String(order.matchingPieceCount)} قطعة`}
          aria-expanded={expanded}
          onClick={onExpand}
          className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"
        />
        {selection}
        <ChevronDown
          aria-hidden
          size={15}
          className={`pointer-events-none mt-1.5 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180 text-teal-800" : ""}`}
        />
        <div className="pointer-events-none min-w-0 flex-1">
          <div className="pointer-events-none flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
            <Link
              href={orderHref}
              dir="ltr"
              className="pointer-events-auto relative font-mono font-bold text-teal-800 hover:underline"
            >
              {order.businessNumber}
            </Link>
            <span className="text-slate-300">·</span>
            <span className="font-bold break-words text-slate-800">
              {order.customerName}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {orderTypeLabels[order.type]}
            </span>
            {indicators}
          </div>
          <div className="pointer-events-none mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              {order.matchingPieceCount} قطعة
            </span>
            {pieces.length > 0 && (
              <span className="line-clamp-2 break-words">
                {pieces.map((piece) => (
                  <span key={piece.id} className="ms-1 inline-block">
                    <bdi className="font-medium text-slate-700">
                      {piece.model ?? "—"}
                    </bdi>{" "}
                    (مقاس {piece.size ?? "—"})
                  </span>
                ))}
              </span>
            )}
            <span className="text-slate-300">·</span>
            <span>
              التسليم: <bdi>{order.deliveryDate ?? "—"}</bdi>
            </span>
          </div>
        </div>
        <Link
          href={orderHref}
          aria-label="عرض أمر التفصيل"
          title="عرض تفاصيل الطلب"
          className="relative shrink-0 p-1.5 text-slate-400 hover:text-slate-700"
        >
          <Eye size={15} aria-hidden />
        </Link>
      </div>
      {expanded && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-3 sm:p-4">
          {children}
        </div>
      )}
    </article>
  );
}

type QueuePieceRole = "cutting" | "production" | "quality" | "warehouse";
type PieceState = {
  label: string;
  tone: NonNullable<Parameters<typeof OrientalStatusPill>[0]["tone"]>;
};
const locations = {
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  CUTTING: "في القص",
  PRODUCTION: "في الإنتاج",
  QUALITY: "في الجودة",
  WAREHOUSE: "في المستودع",
  CANCELLED: "ملغاة",
} satisfies Record<FactoryOrderPiece["stage"], string>;
const runningState = {
  cutting: "قيد القص",
  production: "قيد التصنيع",
  quality: "قيد الفحص",
  warehouse: "قيد التنفيذ",
} satisfies Record<QueuePieceRole, string>;
const roleStage = {
  cutting: "CUTTING",
  production: "PRODUCTION",
  quality: "QUALITY",
  warehouse: "WAREHOUSE",
} as const;
const defaultState = {
  INCOMING: { label: "بانتظار الاستلام", tone: "amber" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "blue" },
  COMPLETED: { label: "مكتملة في المرحلة", tone: "emerald" },
  BLOCKED: { label: "موقوفة", tone: "rose" },
} satisfies Record<FactoryOrderPiece["workState"], PieceState>;

export function manufacturingPieceQueueState(
  row: ManufacturingWorkRow,
): PieceState | undefined {
  if (row.piece.stage === "CANCELLED" || row.piece.workState === "BLOCKED")
    return undefined;
  if (row.work.visit?.endReason === "TRANSFERRED")
    return { label: "منجزة ومحوّلة", tone: "emerald" };
  if (row.work.isReturned && row.piece.workState === "INCOMING")
    return { label: "معادة للتصحيح", tone: "rose" };
  return undefined;
}

export function qualityPieceQueueState(
  row: QualityWorkRow,
): PieceState | undefined {
  if (row.piece.stage === "CANCELLED" || row.piece.workState === "BLOCKED")
    return undefined;
  switch (row.work.currentCorrection?.phase) {
    case "WAITING_CORRECTION":
      return { label: "بانتظار التصحيح", tone: "rose" };
    case "AWAITING_REINSPECTION":
      return { label: "بانتظار إعادة الفحص", tone: "amber" };
    case "INSPECTING":
      return { label: "قيد إعادة الفحص", tone: "blue" };
  }
  if (row.work.latestInspection?.decision === "ACCEPT")
    return { label: "مقبولة ومحوّلة", tone: "emerald" };
  return undefined;
}

function pieceSpecifications(piece: FactoryOrderPiece, role: QueuePieceRole) {
  if (role === "cutting")
    return `الأساس: ${piece.leatherBase ?? "—"} · التطعيم: ${piece.decoration ?? "—"} (${piece.decorationColor ?? "—"})`;
  if (role === "production")
    return `الوجه: ${piece.face ?? "—"} · النعل: ${piece.sole ?? "—"} (${piece.soleColor ?? "—"})`;
  return null;
}

export function QueuePieceIdentity<T extends string>({
  piece,
  href,
}: {
  piece: PieceHeading;
  href: Route<T>;
}) {
  return (
    <>
      <Link
        href={href}
        aria-label="عرض مهمة القطعة"
        title="عرض مهمة القطعة"
        className="shrink-0 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold whitespace-nowrap text-slate-600 hover:text-teal-800 hover:underline"
      >
        {formatPieceSequence(piece.position - 1)}
      </Link>
      <bdi className="text-xs font-bold break-words text-slate-800">
        {piece.model ?? "—"}
      </bdi>
      <span className="text-xs font-semibold whitespace-nowrap text-slate-600">
        مقاس <bdi>{piece.size ?? "—"}</bdi>
      </span>
    </>
  );
}

export function QueuePieceStatus({
  piece,
  role,
  workSummary,
  state,
  location,
}: {
  piece: FactoryOrderPiece;
  role: QueuePieceRole;
  workSummary: string;
  state?: PieceState | undefined;
  location?: string;
}) {
  const currentState =
    state ??
    (piece.stage === "CANCELLED"
      ? { label: "ملغاة", tone: "neutral" }
      : piece.workState === "IN_PROGRESS" && piece.stage === roleStage[role]
        ? { label: runningState[role], tone: "blue" }
        : defaultState[piece.workState]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PieceLocationBadge
          location={
            location ??
            (piece.workState === "BLOCKED"
              ? "لدى الاعتماد بسبب مشكلة"
              : locations[piece.stage])
          }
        />
        <OrientalStatusPill tone={currentState.tone}>
          {currentState.label}
        </OrientalStatusPill>
      </div>
      <p className="basis-full text-[11px] text-slate-500">{workSummary}</p>
    </>
  );
}

export function QueuePieceCard<T extends string>({
  piece,
  href,
  role,
  workSummary,
  state,
  location,
  checked,
  disabled,
  orderNumber,
  onSelect,
  children,
}: {
  piece: FactoryOrderPiece;
  href: Route<T>;
  role: QueuePieceRole;
  workSummary: string;
  state?: PieceState | undefined;
  location?: string;
  checked: boolean;
  disabled: boolean;
  orderNumber: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  const specifications = pieceSpecifications(piece, role);
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        checked
          ? "border-teal-300 bg-teal-50/40"
          : "border-slate-200/70 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
        <QueueSelection
          label={`تحديد القطعة ${String(piece.position)} من ${orderNumber}`}
          checked={checked}
          disabled={disabled}
          onChange={onSelect}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <QueuePieceIdentity piece={piece} href={href} />
            <QueuePieceStatus
              piece={piece}
              role={role}
              workSummary={workSummary}
              {...(state && { state })}
              {...(location && { location })}
            />
          </div>
          {specifications && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              {specifications}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
