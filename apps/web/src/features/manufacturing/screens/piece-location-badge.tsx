"use client";

import { AlertTriangle } from "lucide-react";

export function PieceLocationBadge({
  location,
}: {
  location?: string | undefined;
}) {
  const loc = location || "في القص";
  let toneClass = "bg-slate-100 text-slate-700 border-slate-200";
  if (loc === "في القص") toneClass = "bg-blue-50 text-blue-800 border-blue-200";
  else if (loc === "في الإنتاج")
    toneClass = "bg-indigo-50 text-indigo-800 border-indigo-200";
  else if (loc === "في العمليات الخاصة")
    toneClass = "bg-purple-50 text-purple-800 border-purple-200";
  else if (loc === "في الجودة")
    toneClass = "bg-teal-50 text-teal-800 border-teal-200";
  else if (loc === "في المستودع")
    toneClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
  else if (loc === "لدى الاعتماد بسبب مشكلة")
    toneClass = "bg-rose-50 text-rose-800 border-rose-300 font-bold";
  else if (loc === "مع المندوب")
    toneClass = "bg-amber-50 text-amber-800 border-amber-200";
  else if (loc === "تم الاستلام" || loc === "تم التسليم")
    toneClass = "bg-emerald-100 text-emerald-900 border-emerald-300";
  else if (loc === "ملغاة")
    toneClass = "bg-slate-200 text-slate-500 border-slate-300 line-through";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}
    >
      {loc === "لدى الاعتماد بسبب مشكلة" && (
        <AlertTriangle size={12} className="animate-pulse text-rose-600" />
      )}
      {loc}
    </span>
  );
}
