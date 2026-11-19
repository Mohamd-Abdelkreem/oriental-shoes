import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function ActivityGuidance({
  children,
  filter,
}: {
  children: ReactNode;
  filter?: ReactNode;
}) {
  return (
    <aside className="rounded-xl border border-teal-100 bg-white p-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_17rem] items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700"
            aria-hidden="true"
          >
            <Info size={19} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">
              متابعة نتيجة إجراء سابق
            </h2>
            <div className="mt-1 space-y-1 text-xs leading-relaxed text-slate-600">
              {children}
            </div>
          </div>
        </div>
        {filter}
      </div>
    </aside>
  );
}
