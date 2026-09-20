"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { roleLabels, useMvpStore } from "@/features/prototype/state/mvp-store";

export function UnauthorizedView() {
  const store = useMvpStore();
  const router = useRouter();

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert size={36} />
        </div>

        <h1 className="text-xl font-extrabold text-slate-900">
          عذراً، ليس لديك صلاحية للوصول إلى هذه الصفحة
        </h1>

        <p className="text-xs leading-relaxed text-slate-600">
          أنت مسجل حالياً بدور:{" "}
          <strong>
            {store.sessionRole
              ? roleLabels[store.sessionRole]
              : "زائر غير مسجل"}
          </strong>
          . هذه الصفحة مخصصة لقسم آخر ولا يمكن الوصول إليها بصلاحياتك الحالية
          حفاظاً على خصوصية مسار العمل.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              const role = store.sessionRole;
              if (!role) {
                router.push("/prototype-preview");
                return;
              }
              const base = role === "special" ? "special-operations" : role;
              router.push(("/" + base + "/dashboard") as Route);
            }}
            className="btn-pill btn-teal w-full px-5 py-2.5 text-xs font-bold sm:w-auto"
          >
            العودة لمساحة عملي المعتمدة
          </button>

          <Link
            href="/prototype-preview"
            className="btn-pill btn-secondary w-full px-5 py-2.5 text-xs font-bold sm:w-auto"
          >
            الانتقال لمركز الاختبار وتبديل الدور
          </Link>
        </div>
      </div>
    </div>
  );
}
