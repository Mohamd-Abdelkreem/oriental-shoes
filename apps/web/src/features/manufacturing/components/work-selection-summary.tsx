import type { ReactNode } from "react";
import type { FactoryOrderPiece } from "@template/contracts";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";

type SummaryPiece = Pick<
  FactoryOrderPiece,
  "id" | "position" | "model" | "size"
>;
type SummaryRow = {
  order: { id: string; businessNumber: string };
  piece: SummaryPiece;
};

export function WorkSelectionOrder({
  orderNumber,
  count,
  version,
  children,
}: {
  orderNumber: string;
  count: number;
  version?: number;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-600">
          أمر التفصيل
          <bdi className="font-mono font-bold text-slate-900">
            {orderNumber}
          </bdi>
        </h3>
        <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
          {count} قطعة{version !== undefined && <> · الإصدار {version}</>}
        </span>
      </header>
      {children}
    </section>
  );
}

export function WorkSelectionPieces<Row extends { piece: SummaryPiece }>({
  rows,
  details,
}: {
  rows: readonly Row[];
  details?: ((row: Row) => ReactNode) | undefined;
}) {
  const sorted = [...rows].sort((a, b) => a.piece.position - b.piece.position);
  return (
    <ul className="divide-y divide-slate-100">
      {sorted.map((row) => {
        const { piece } = row;
        return (
          <li key={piece.id} className="space-y-1.5 px-3 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="rounded bg-teal-50 px-2 py-0.5 font-bold whitespace-nowrap text-teal-800">
                {formatPieceSequence(piece.position - 1)}
              </span>
              <span className="text-slate-600">
                الموديل{" "}
                <bdi className="font-semibold text-slate-900">
                  {piece.model ?? "—"}
                </bdi>
              </span>
              <span className="text-slate-600">
                المقاس{" "}
                <bdi className="font-semibold text-slate-900">
                  {piece.size ?? "—"}
                </bdi>
              </span>
            </div>
            {details?.(row)}
          </li>
        );
      })}
    </ul>
  );
}

export function WorkSelectionSummary<Row extends SummaryRow>({
  rows,
  details,
}: {
  rows: readonly Row[];
  details?: ((row: Row) => ReactNode) | undefined;
}) {
  const orders = new Map<string, { number: string; rows: Row[] }>();
  for (const row of rows) {
    const order = orders.get(row.order.id);
    if (order) order.rows.push(row);
    else
      orders.set(row.order.id, {
        number: row.order.businessNumber,
        rows: [row],
      });
  }
  return (
    <div className="space-y-3">
      {[...orders].map(([id, group]) => (
        <WorkSelectionOrder
          key={id}
          orderNumber={group.number}
          count={group.rows.length}
        >
          <WorkSelectionPieces rows={group.rows} details={details} />
        </WorkSelectionOrder>
      ))}
    </div>
  );
}
