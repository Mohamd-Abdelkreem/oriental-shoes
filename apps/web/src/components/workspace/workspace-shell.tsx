"use client";
import { toOrderDisplayReference } from "@/features/orders/model/order-display-reference";

import {
  administrationDashboardDataSchema,
  salesDashboardDataSchema,
  approvalDashboardDataSchema,
  manufacturingDashboardDataSchema,
  qualityDashboardDataSchema,
  warehouseDashboardDataSchema,
  type Department,
  type SafeUser,
} from "@template/contracts";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SessionLoader } from "@/components/auth/session-loader";
import { useLogout, useSession } from "@/features/auth/hooks/auth.hooks";
import {
  canEnterWorkspace,
  hasBusinessAccess,
  workspaceDepartment,
} from "@/features/auth/model/account-access";
import { replaceWithLogin } from "@/features/auth/utils/session-navigation";
import {
  AppShell,
  type ShellProps,
} from "@/features/prototype/components/app-shell";
import { roleNames, type WorkspaceRole as Role } from "./workspace-navigation";
import {
  useAdministrationDashboard,
  useAdministrationOrder,
} from "@/features/administration/hooks/administration.hooks";
import { AdministrationCommandRecovery } from "@/features/administration/components/administration-command-recovery";
import {
  useApprovalDashboard,
  useApprovalOrder,
} from "@/features/approval/hooks/approval.hooks";
import {
  useManufacturingDashboard,
  useManufacturingOrder,
} from "@/features/manufacturing/hooks/manufacturing.hooks";
import {
  useWarehouseDashboard,
  useWarehouseOrder,
} from "@/features/warehouse/hooks/warehouse.hooks";
import {
  useQualityDashboard,
  useQualityOrder,
} from "@/features/manufacturing/hooks/quality.hooks";
import {
  useOrderEditor,
  useSalesDashboard,
} from "@/features/sales/hooks/orders.hooks";
import { useCustomerByPhone } from "@/features/customers/hooks/customers.hooks";
import { parseCustomerRoutePhone } from "@/features/customers/model/customer-form.model";
import { getApiError } from "@/services/api/api-client";

/**
 * The workspace section of every employee department. Administration is not a
 * department, so it never appears in this map.
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
 * The section the account itself owns. An employee is always presented with its
 * own approved department, so a pathname can never change that identity.
 */
const ownDepartmentRole = (user: SafeUser): Role => {
  const department = user.department;
  return department === null ? "admin" : departmentRoles[department];
};

/**
 * The section the shell presents for the current account. Administration
 * follows the route it selected inside the already-authorized workspace, and an
 * employee follows its own department. A route the account may not enter never
 * changes the presented identity.
 */
const resolveShellRole = (user: SafeUser, pathname: string): Role => {
  if (!canEnterWorkspace(user, pathname)) return ownDepartmentRole(user);
  if (user.role !== "ADMIN") return ownDepartmentRole(user);
  const department = workspaceDepartment(pathname);
  return department === null ? "admin" : departmentRoles[department];
};

function useCustomerBreadcrumbLabel(pathname: string) {
  const segment = /^\/(?:admin|sales)\/customers\/([^/]+)(?:\/edit)?\/?$/u.exec(
    pathname,
  )?.[1];
  const query = useCustomerByPhone(
    segment ? parseCustomerRoutePhone(segment) : null,
  );
  return query.isSuccess ? query.data.customer.name : undefined;
}
function useFactoryOrderId() {
  return (
    /^\/(?:cutting|production|quality|warehouse)\/(?:orders|tasks)\/([^/]+)\/?$/u.exec(
      usePathname(),
    )?.[1] ?? null
  );
}
function AdminWorkspaceShell(props: ShellProps) {
  const pathname = usePathname();
  const orderId = /^\/admin\/orders\/([^/]+)\/?$/u.exec(pathname)?.[1] ?? null;
  const order = useAdministrationOrder(orderId);
  const customerName = useCustomerBreadcrumbLabel(pathname);
  const recordLabel =
    order.isSuccess && order.data
      ? toOrderDisplayReference(order.data)
      : customerName;
  const orderBreadcrumbs = useApprovalOrderBreadcrumbs("admin");
  const response = useAdministrationDashboard(),
    parsed = administrationDashboardDataSchema.safeParse(response.data);
  return (
    <AppShell
      {...props}
      recordLabel={recordLabel}
      breadcrumbs={props.breadcrumbs ?? orderBreadcrumbs}
      navCounts={
        !response.isError && parsed.success
          ? {
              activeOrders: parsed.data.counts.activeOrders,
              pendingApproval: parsed.data.counts.pendingApproval,
              activeCorrections: parsed.data.counts.activeCorrections,
              deliveryExceptions: parsed.data.counts.deliveryExceptions,
              pendingUsers: parsed.data.counts.pendingUsers,
            }
          : undefined
      }
    />
  );
}
function SalesWorkspaceShell(props: ShellProps) {
  const pathname = usePathname();
  const orderId =
    /^\/sales\/orders\/([^/]+)(?:\/edit)?\/?$/u.exec(pathname)?.[1] ?? null;
  const order = useOrderEditor(orderId);
  const customerName = useCustomerBreadcrumbLabel(pathname);
  const recordLabel = order.isSuccess
    ? toOrderDisplayReference(order.data)
    : customerName;
  const response = useSalesDashboard(),
    parsed = salesDashboardDataSchema.safeParse(response.data);
  return (
    <AppShell
      {...props}
      recordLabel={recordLabel}
      navCounts={
        !response.isError && parsed.success
          ? {
              salesDrafts: parsed.data.counts.drafts,
              salesReturned: parsed.data.counts.returned,
            }
          : undefined
      }
    />
  );
}
function useApprovalOrderBreadcrumbs(workspace: "admin" | "approval") {
  const pathname = usePathname();
  const admin = workspace === "admin";
  const pattern = admin
    ? /^\/admin\/approvals\/([^/]+)\/?$/u
    : /^\/approval\/(?:orders|review)\/([^/]+)\/?$/u;
  const orderId = pattern.exec(pathname)?.[1] ?? null;
  const order = useApprovalOrder(orderId);
  const orderNumber = order.isSuccess ? order.data.order.businessNumber : null;
  return orderId === null
    ? undefined
    : [
        { label: roleNames[workspace], href: `/${workspace}/dashboard` },
        {
          label: admin ? "متابعة الاعتمادات" : "بانتظار الاعتماد",
          href: admin ? "/admin/approvals" : "/approval/pending",
        },
        {
          label: orderNumber ? (
            <>
              مراجعة أمر التفصيل (<bdi dir="ltr">{orderNumber}</bdi>)
            </>
          ) : (
            "مراجعة أمر التفصيل"
          ),
        },
      ];
}
function ApprovalWorkspaceShell(props: ShellProps) {
  const orderBreadcrumbs = useApprovalOrderBreadcrumbs("approval");
  const response = useApprovalDashboard(),
    parsed = approvalDashboardDataSchema.safeParse(response.data);
  return (
    <AppShell
      {...props}
      breadcrumbs={props.breadcrumbs ?? orderBreadcrumbs}
      navCounts={
        !response.isError && parsed.success
          ? { pendingApproval: parsed.data.counts.initialOrders }
          : undefined
      }
    />
  );
}
function CuttingWorkspaceShell(props: ShellProps) {
  const order = useManufacturingOrder("CUTTING", useFactoryOrderId());
  const response = useManufacturingDashboard("CUTTING"),
    parsed = manufacturingDashboardDataSchema.safeParse(response.data);
  return (
    <AppShell
      {...props}
      recordLabel={
        order.isSuccess ? order.data.paper.order.businessNumber : undefined
      }
      navCounts={
        !response.isError &&
        parsed.success &&
        parsed.data.department === "CUTTING"
          ? {
              cuttingIncoming: parsed.data.counts.incoming.pieces,
              cuttingWip: parsed.data.counts.inProgress.pieces,
              cuttingReturned: parsed.data.counts.returned.pieces,
            }
          : undefined
      }
    />
  );
}
function ProductionWorkspaceShell(props: ShellProps) {
  const order = useManufacturingOrder("PRODUCTION", useFactoryOrderId());
  const response = useManufacturingDashboard("PRODUCTION"),
    parsed = manufacturingDashboardDataSchema.safeParse(response.data);
  return (
    <AppShell
      {...props}
      recordLabel={
        order.isSuccess ? order.data.paper.order.businessNumber : undefined
      }
      navCounts={
        !response.isError &&
        parsed.success &&
        parsed.data.department === "PRODUCTION"
          ? {
              productionIncoming: parsed.data.counts.incoming.pieces,
              productionWip: parsed.data.counts.inProgress.pieces,
              productionReturned: parsed.data.counts.returned.pieces,
            }
          : undefined
      }
    />
  );
}
function QualityWorkspaceShell(props: ShellProps) {
  const order = useQualityOrder(useFactoryOrderId());
  const response = useQualityDashboard(),
    parsed = qualityDashboardDataSchema.safeParse(response.data);
  return (
    <AppShell
      {...props}
      recordLabel={
        order.isSuccess ? order.data?.paper.order.businessNumber : undefined
      }
      navCounts={
        !response.isError && parsed.success
          ? { qualityIncoming: parsed.data.counts.incoming.pieces }
          : undefined
      }
    />
  );
}
function WarehouseWorkspaceShell(props: ShellProps) {
  const order = useWarehouseOrder(useFactoryOrderId());
  const response = useWarehouseDashboard({}),
    parsed = warehouseDashboardDataSchema.safeParse(response.data);
  return (
    <AppShell
      {...props}
      recordLabel={
        order.isSuccess ? order.data?.paper.order.businessNumber : undefined
      }
      navCounts={
        !response.isError && parsed.success
          ? {
              warehouseIncoming: parsed.data.counts.incoming.pieces,
              warehouseIncomplete: parsed.data.counts.incomplete.orders,
              warehouseReady: parsed.data.counts.ready.orders,
              warehouseDispatched: parsed.data.counts.outForDelivery.orders,
              warehouseFailed: parsed.data.counts.deliveryFailed.orders,
            }
          : undefined
      }
    />
  );
}
const shells = {
  admin: AdminWorkspaceShell,
  sales: SalesWorkspaceShell,
  approval: ApprovalWorkspaceShell,
  cutting: CuttingWorkspaceShell,
  production: ProductionWorkspaceShell,
  quality: QualityWorkspaceShell,
  warehouse: WarehouseWorkspaceShell,
};
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const logout = useLogout();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const user = session.data?.user ?? null;

  if (user === null || !hasBusinessAccess(user)) return <SessionLoader />;

  const signOut = (): void => {
    setLogoutError(null);

    logout.mutate(undefined, {
      onSuccess: replaceWithLogin,
      onError: (error: unknown) => {
        const apiError = getApiError(error);
        setLogoutError(
          `تعذر تأكيد تسجيل الخروج من الخادم. قد تظل جلستك فعالة؛ أعد المحاولة قبل ترك الجهاز.${apiError.requestId ? ` (مرجع الطلب: ${apiError.requestId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 128)})` : ""}`,
        );
      },
    });
  };

  const role = resolveShellRole(user, pathname);
  const Shell = shells[role];
  return (
    <Shell
      key={`${user.id}/${String(user.accessVersion)}/${role}`}
      role={role}
      accountName={user.fullName}
      canAccessAllSections={user.role === "ADMIN"}
      onSignOut={signOut}
      signingOut={logout.isPending}
      signOutError={logoutError}
    >
      {user.role === "ADMIN" && <AdministrationCommandRecovery />}
      {children}
    </Shell>
  );
}
