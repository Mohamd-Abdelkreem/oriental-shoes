import type { Route } from "next";
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Factory,
  FileEdit,
  FilePlus2,
  Gauge,
  History,
  Inbox,
  PackageCheck,
  RotateCcw,
  Scissors,
  ShieldAlert,
  Truck,
  UserPlus,
  UserRound,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceRole =
  | "admin"
  | "sales"
  | "approval"
  | "cutting"
  | "production"
  | "quality"
  | "warehouse";

export type WorkspaceBadgeKey =
  | "activeOrders"
  | "pendingApproval"
  | "activeCorrections"
  | "deliveryExceptions"
  | "pendingUsers"
  | "salesDrafts"
  | "salesReturned"
  | "cuttingIncoming"
  | "cuttingWip"
  | "cuttingReturned"
  | "productionIncoming"
  | "productionWip"
  | "productionReturned"
  | "qualityIncoming"
  | "warehouseIncoming"
  | "warehouseIncomplete"
  | "warehouseReady"
  | "warehouseDispatched"
  | "warehouseFailed";
export type NavItem = Readonly<{
  label: string;
  href: Route;
  icon: LucideIcon;
  badgeKey?: WorkspaceBadgeKey | undefined;
}>;
export const workspaceRoles: readonly WorkspaceRole[] = [
  "admin",
  "sales",
  "approval",
  "cutting",
  "production",
  "quality",
  "warehouse",
];
export const roleNames: Record<WorkspaceRole, string> = {
  admin: "الإدارة العامة",
  sales: "المبيعات والمعارض",
  approval: "اعتماد الطلبات",
  cutting: "قسم القص",
  production: "الإنتاج والإصلاح",
  quality: "الجودة والتغليف",
  warehouse: "المستودع والتسليم",
};

export const workspaceRoleDetails: Readonly<
  Record<WorkspaceRole, { description: string; avatarBg: string }>
> = {
  admin: { description: "مساحة الإدارة والمتابعة", avatarBg: "#f59e0b" },
  sales: { description: "مساحة المبيعات والمعارض", avatarBg: "#0ea5e9" },
  approval: {
    description: "مساحة مراجعة واعتماد الطلبات",
    avatarBg: "#8b5cf6",
  },
  cutting: { description: "مساحة قسم القص", avatarBg: "#10b981" },
  production: { description: "مساحة الإنتاج والإصلاح", avatarBg: "#f97316" },
  quality: { description: "مساحة الجودة والتغليف", avatarBg: "#06b6d4" },
  warehouse: { description: "مساحة المستودع والتسليم", avatarBg: "#6366f1" },
};
export const roleNav: Record<WorkspaceRole, NavItem[]> = {
  admin: [
    { label: "لوحة الإدارة", href: "/admin/dashboard", icon: Gauge },
    {
      label: "جميع الطلبات",
      href: "/admin/orders",
      icon: Boxes,
      badgeKey: "activeOrders",
    },
    { label: "العملاء", href: "/admin/customers", icon: UserRound },
    {
      label: "متابعة الاعتمادات",
      href: "/admin/approvals",
      icon: ClipboardCheck,
      badgeKey: "pendingApproval",
    },
    {
      label: "دورات التصحيح",
      href: "/admin/corrections",
      icon: RotateCcw,
      badgeKey: "activeCorrections",
    },
    {
      label: "تعثرات التسليم",
      href: "/admin/delivery-exceptions",
      icon: ShieldAlert,
      badgeKey: "deliveryExceptions",
    },
    { label: "إدارة المستخدمين", href: "/admin/users", icon: UsersRound },
    {
      label: "طلبات تسجيل الموظفين",
      href: "/admin/users/pending",
      icon: UserPlus,
      badgeKey: "pendingUsers",
    },
    { label: "سجل النشاط العام", href: "/admin/activity", icon: History },
    { label: "التقارير التشغيلية", href: "/admin/reports", icon: BarChart3 },
  ],
  sales: [
    { label: "لوحة المبيعات", href: "/sales/dashboard", icon: Gauge },
    { label: "جميع طلبات المبيعات", href: "/sales/orders", icon: Boxes },
    { label: "إنشاء أمر تفصيل", href: "/sales/orders/new", icon: FilePlus2 },
    {
      label: "المسودات",
      href: "/sales/orders/drafts",
      icon: FileEdit,
      badgeKey: "salesDrafts",
    },
    {
      label: "طلبات معادة للتعديل",
      href: "/sales/orders/returned",
      icon: RotateCcw,
      badgeKey: "salesReturned",
    },
    { label: "إدارة العملاء", href: "/sales/customers", icon: UserRound },
    { label: "سجل نشاط المبيعات", href: "/sales/activity", icon: History },
  ],
  approval: [
    { label: "لوحة الاعتماد", href: "/approval/dashboard", icon: Gauge },
    {
      label: "بانتظار الاعتماد",
      href: "/approval/pending",
      icon: ClipboardCheck,
      badgeKey: "pendingApproval",
    },
    { label: "سجل القرارات", href: "/approval/history", icon: History },
  ],
  cutting: [
    { label: "لوحة القص", href: "/cutting/dashboard", icon: Gauge },
    {
      label: "وارد للقص",
      href: "/cutting/incoming",
      icon: Inbox,
      badgeKey: "cuttingIncoming",
    },
    {
      label: "قيد القص",
      href: "/cutting/in-progress",
      icon: Scissors,
      badgeKey: "cuttingWip",
    },
    {
      label: "معادة من الجودة",
      href: "/cutting/returned",
      icon: RotateCcw,
      badgeKey: "cuttingReturned",
    },
    {
      label: "المنجز والمحوّل إلى الإنتاج",
      href: "/cutting/completed",
      icon: CheckCircle2,
    },
    { label: "سجل نشاط القص", href: "/cutting/activity", icon: History },
  ],
  production: [
    {
      label: "لوحة الإنتاج والإصلاح",
      href: "/production/dashboard",
      icon: Gauge,
    },
    {
      label: "وارد للإنتاج",
      href: "/production/incoming",
      icon: Inbox,
      badgeKey: "productionIncoming",
    },
    {
      label: "قيد التصنيع",
      href: "/production/in-progress",
      icon: Factory,
      badgeKey: "productionWip",
    },
    {
      label: "معادة من الجودة",
      href: "/production/returned",
      icon: RotateCcw,
      badgeKey: "productionReturned",
    },
    {
      label: "المنجز والمحوّل",
      href: "/production/completed",
      icon: CheckCircle2,
    },
    { label: "سجل نشاط الإنتاج", href: "/production/activity", icon: History },
  ],
  quality: [
    { label: "لوحة الجودة والتغليف", href: "/quality/dashboard", icon: Gauge },
    {
      label: "وارد للجودة",
      href: "/quality/incoming",
      icon: Inbox,
      badgeKey: "qualityIncoming",
    },
    {
      label: "قيد الفحص والتغليف",
      href: "/quality/inspection",
      icon: PackageCheck,
    },
    {
      label: "المجاز والمغلف والمحوّل للمستودع",
      href: "/quality/accepted",
      icon: CheckCircle2,
    },
    { label: "سجل فحص الجودة", href: "/quality/activity", icon: History },
  ],
  warehouse: [
    {
      label: "لوحة المستودع والتسليم",
      href: "/warehouse/dashboard",
      icon: Gauge,
    },
    {
      label: "شحنات واردة للمستودع",
      href: "/warehouse/incoming",
      icon: Inbox,
      badgeKey: "warehouseIncoming",
    },
    {
      label: "طلبات غير مكتملة بالمصنع",
      href: "/warehouse/incomplete",
      icon: Clock3,
      badgeKey: "warehouseIncomplete",
    },
    {
      label: "جاهزة للتسليم (١٠٠٪)",
      href: "/warehouse/ready",
      icon: CheckCircle2,
      badgeKey: "warehouseReady",
    },
    {
      label: "خرجت مع المندوب",
      href: "/warehouse/out-for-delivery",
      icon: Truck,
      badgeKey: "warehouseDispatched",
    },
    {
      label: "تعذر التسليم",
      href: "/warehouse/delivery-failed",
      icon: XCircle,
      badgeKey: "warehouseFailed",
    },
    {
      label: "تم الاستلام (مكتملة)",
      href: "/warehouse/delivered",
      icon: PackageCheck,
    },
    { label: "سجل حركات المستودع", href: "/warehouse/activity", icon: History },
  ],
};
