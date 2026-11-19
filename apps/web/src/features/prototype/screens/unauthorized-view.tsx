"use client";

import type { Department, SafeUser } from "@template/contracts";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { OrientalStatusPage } from "@/components/brand/oriental-status-page";
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
    <OrientalStatusPage
      title="ليس لديك صلاحية للوصول إلى هذه الصفحة"
      description={
        <>
          {label === null ? null : (
            <>
              أنت مسجّل حاليًا بدور <strong>{label}</strong>.{" "}
            </>
          )}
          ارجع إلى مساحة عملك للوصول إلى الصفحات المتاحة لحسابك.
        </>
      }
    >
      <button
        type="button"
        onClick={() => {
          router.push(returnTo as Route);
        }}
      >
        {user === null
          ? "تسجيل الدخول للوصول إلى مساحة عملك"
          : "العودة لمساحة عملي المعتمدة"}
      </button>
    </OrientalStatusPage>
  );
}
