"use client";

import type { Department, SafeUser } from "@template/contracts";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { useSession } from "@/features/auth/hooks/auth.hooks";
import { defaultWorkspacePath } from "@/features/auth/utils/safe-return-path";
import type { Role } from "@/features/prototype/fixtures/prototype-data";
import { roleLabels } from "@/features/prototype/state/mvp-selectors";

/**
 * The shared workspace label of every employee department. Administration is not
 * a department, so it never appears in this map.
 */
const departmentRoles: Readonly<Record<Department, Role>> = {
  SALES: "sales",
  APPROVAL: "approval",
  CUTTING: "cutting",
  PRODUCTION: "production",
  QUALITY: "quality",
  WAREHOUSE: "warehouse",
};

/**
 * The label of the account that the server reported. A prototype role, a
 * fixture or a guessed identity never supplies this label.
 */
const identityLabel = (user: SafeUser): string | null => {
  if (user.role === "ADMIN") return roleLabels.admin;
  const department = user.department;
  if (department === null) return null;
  return roleLabels[departmentRoles[department]];
};

export function UnauthorizedView() {
  const router = useRouter();
  const session = useSession();
  const user = session.data?.user ?? null;
  const label = user === null ? null : identityLabel(user);
  const returnTo = user === null ? "/auth/login" : defaultWorkspacePath(user);

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
          {label === null ? null : (
            <>
              أنت مسجل حالياً بدور: <strong>{label}</strong>.{" "}
            </>
          )}
          هذه الصفحة مخصصة لقسم آخر ولا يمكن الوصول إليها بصلاحياتك الحالية
          حفاظاً على خصوصية مسار العمل.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              router.push(returnTo as Route);
            }}
            className="btn-pill btn-teal w-full px-5 py-2.5 text-xs font-bold sm:w-auto"
          >
            {user === null
              ? "تسجيل الدخول للوصول إلى مساحة عملك"
              : "العودة لمساحة عملي المعتمدة"}
          </button>
        </div>
      </div>
    </div>
  );
}
