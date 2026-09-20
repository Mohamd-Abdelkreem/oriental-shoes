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
  Sparkles,
  Truck,
  UserPlus,
  UserRound,
  UsersRound,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type Role =
  | "admin"
  | "sales"
  | "approval"
  | "cutting"
  | "production"
  | "special"
  | "quality"
  | "warehouse";

export type NavItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
  badgeKey?: string | undefined;
};

export const roleNames: Record<Role, string> = {
  admin: "الإدارة العامة",
  sales: "المبيعات والمعارض",
  approval: "اعتماد الطلبات",
  cutting: "قسم القص",
  production: "الإنتاج والإصلاح",
  special: "العمليات الخاصة",
  quality: "الجودة والتغليف",
  warehouse: "المستودع والتسليم",
};

export const roleUsers: Record<
  Role,
  { name: string; title: string; avatarBg: string }
> = {
  admin: {
    name: "محمد العتيبي",
    title: "مدير المصنع والنظام",
    avatarBg: "#f59e0b",
  },
  sales: { name: "ريم خالد", title: "مسؤولة مبيعات أولى", avatarBg: "#0ea5e9" },
  approval: {
    name: "خالد منصور",
    title: "مدير تدقيق واعتماد الطلبات",
    avatarBg: "#8b5cf6",
  },
  cutting: { name: "سالم الحربي", title: "رئيس قسم القص", avatarBg: "#10b981" },
  production: {
    name: "أحمد عادل",
    title: "مشرف خط الإنتاج والإصلاح",
    avatarBg: "#f97316",
  },
  special: {
    name: "فهد ياسين",
    title: "فني التطريز والعمليات الخاصة",
    avatarBg: "#ec4899",
  },
  quality: {
    name: "منى سعيد",
    title: "رئيسة فحص الجودة والتغليف",
    avatarBg: "#06b6d4",
  },
  warehouse: {
    name: "سارة محمد",
    title: "أمينة المستودع والشحن",
    avatarBg: "#6366f1",
  },
};

export const roleNav: Record<Role, NavItem[]> = {
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
      label: "طلبات الإصلاح",
      href: "/production/repairs",
      icon: Wrench,
      badgeKey: "productionRepairs",
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
  special: [
    {
      label: "لوحة العمليات الخاصة",
      href: "/special-operations/dashboard",
      icon: Gauge,
    },
    {
      label: "وارد للعمليات الخاصة",
      href: "/special-operations/incoming",
      icon: Inbox,
      badgeKey: "specialIncoming",
    },
    {
      label: "قيد التنفيذ",
      href: "/special-operations/in-progress",
      icon: Sparkles,
      badgeKey: "specialWip",
    },
    {
      label: "معادة من الجودة",
      href: "/special-operations/returned",
      icon: RotateCcw,
      badgeKey: "specialReturned",
    },
    {
      label: "المنجز والمحوّل إلى الجودة",
      href: "/special-operations/completed",
      icon: CheckCircle2,
    },
    {
      label: "سجل العمليات الخاصة",
      href: "/special-operations/activity",
      icon: History,
    },
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
      label: "إعادة فحص (مصححة)",
      href: "/quality/reinspection",
      icon: RotateCcw,
      badgeKey: "qualityReinspect",
    },
    {
      label: "دورات التصحيح النشطة",
      href: "/quality/corrections",
      icon: ShieldAlert,
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

export function roleFromPath(pathname: string): Role {
  if (pathname.startsWith("/sales")) return "sales";
  if (pathname.startsWith("/approval")) return "approval";
  if (pathname.startsWith("/cutting")) return "cutting";
  if (pathname.startsWith("/production")) return "production";
  if (pathname.startsWith("/special-operations")) return "special";
  if (pathname.startsWith("/quality")) return "quality";
  if (pathname.startsWith("/warehouse")) return "warehouse";
  return "admin";
}

export function roleBase(role: Role): string {
  return role === "special" ? "special-operations" : role;
}

export type DemoScenario = {
  id: string;
  orderId: string;
  title: string;
  description: string;
  category: string;
  targetRole: Role;
  directUrl: string;
};

export const demoScenarios: DemoScenario[] = [
  {
    id: "sc-1",
    orderId: "SHOP-2026-0001",
    title: "أمر تفصيل كلاسيكي كامل من المعرض",
    description: "طلب تفصيل فاخر معتمد من الإدارة، تحت الفحص والجودة والتسليم.",
    category: "SALES",
    targetRole: "admin",
    directUrl: "/admin/orders/SHOP-2026-0001",
  },
  {
    id: "sc-2",
    orderId: "SHOP-2026-0002",
    title: "أمر تفصيل بتفريعة إنتاج منقسمة",
    description:
      "انقسمت الكمية: جزء اتجه مباشرة للجودة، وجزء اتجه للعمليات الخاصة للنقش.",
    category: "SPLIT",
    targetRole: "production",
    directUrl: "/production/tasks/SHOP-2026-0002",
  },
  {
    id: "sc-3",
    orderId: "REPAIR-2026-0001",
    title: "أمر صيانة وإصلاح عاجل (تخطي القص)",
    description:
      "أمر إصلاح تخطى قسم القص ودخل ورشة الإنتاج والتجميع مباشرة وفق المتطلبات.",
    category: "REPAIR",
    targetRole: "production",
    directUrl: "/production/repairs",
  },
  {
    id: "sc-4",
    orderId: "EXTERNAL-2026-0001",
    title: "طلب مبيعات خارجية مع ملاحظات خاصة",
    description:
      "طلب مبيعات خارجية يوضح معالجة القياسات الخاصة وتوقيع المسؤول.",
    category: "SALES",
    targetRole: "sales",
    directUrl: "/sales/orders/EXTERNAL-2026-0001",
  },
  {
    id: "sc-5",
    orderId: "SHOP-2026-0003",
    title: "أمر معاد من الاعتماد للمبيعات للتعديل",
    description:
      "أعاده مسؤول الاعتماد مع ملاحظة فنية إلزامية لتعديل لون التطعيم ومقاس القاعدة.",
    category: "APPROVAL",
    targetRole: "sales",
    directUrl: "/sales/orders/returned",
  },
  {
    id: "sc-6",
    orderId: "SHOP-2026-0004",
    title: "أمر معتمد بانتظار استلام مقصدار القسم",
    description:
      "أمر اعتمد حديثاً وهو الآن في طابور الوارد بقسم القص لتأكيد الاستلام.",
    category: "APPROVAL",
    targetRole: "cutting",
    directUrl: "/cutting/incoming",
  },
  {
    id: "sc-7",
    orderId: "SHOP-2026-0005",
    title: "أمر قيد القص والتفصيل الجلدي الفعلي",
    description: "يتم تفصيل الأوجه والبطانات الآن بالمقصدار في قسم القص.",
    category: "ADMIN",
    targetRole: "cutting",
    directUrl: "/cutting/in-progress",
  },
  {
    id: "sc-8",
    orderId: "SHOP-2026-0006",
    title: "أمر أنجز في القص ومحول لورشة الإنتاج",
    description:
      "تم إنجاز قص جميع القطع وتم تحويلها بنجاح إلى ورشة الإنتاج والتجميع.",
    category: "ADMIN",
    targetRole: "production",
    directUrl: "/production/incoming",
  },
  {
    id: "sc-9",
    orderId: "SHOP-2026-0007",
    title: "أمر قيد الشد والتركيب في ورشة الإنتاج",
    description:
      "القطع قيد التجميع وتركيب النعل والشد على القوالب في قسم الإنتاج.",
    category: "ADMIN",
    targetRole: "production",
    directUrl: "/production/in-progress",
  },
  {
    id: "sc-10",
    orderId: "SHOP-2026-0008",
    title: "أمر في العمليات الخاصة (تطريز وحفر ليزر)",
    description:
      "القطع مستلمة في قسم العمليات الخاصة لتنفيذ نقش وحفر الاسم بالليزر.",
    category: "SPLIT",
    targetRole: "special",
    directUrl: "/special-operations/in-progress",
  },
  {
    id: "sc-11",
    orderId: "SHOP-2026-0009",
    title: "أمر تحت فحص الجودة والتغليف",
    description:
      "القطع وصلت محطة فحص الجودة لمطابقة المواصفات مع استمارة P0 الأصلية.",
    category: "ADMIN",
    targetRole: "quality",
    directUrl: "/quality/inspection",
  },
  {
    id: "sc-12",
    orderId: "SHOP-2026-0010",
    title: "دورة تصحيح: إعادة عيوب من الجودة إلى القص",
    description:
      "رفض المفتش قطعاً لوجود عيوب بالجلد وأعادها للقص لإعادة تفصيلها فوراً.",
    category: "CORRECTION",
    targetRole: "cutting",
    directUrl: "/cutting/returned",
  },
  {
    id: "sc-13",
    orderId: "SHOP-2026-0011",
    title: "دورة تصحيح: إعادة عيوب من الجودة إلى الإنتاج",
    description:
      "إعادة قطع لورشة الإنتاج لوجود خلل في شد القالب أو الغراء مع عداد الدورات.",
    category: "CORRECTION",
    targetRole: "production",
    directUrl: "/production/returned",
  },
  {
    id: "sc-14",
    orderId: "SHOP-2026-0012",
    title: "دورة تصحيح: إعادة عيوب إلى العمليات الخاصة",
    description: "إعادة قطع للعمليات الخاصة لتصحيح عيوب النقش والتطريز اليدوي.",
    category: "CORRECTION",
    targetRole: "special",
    directUrl: "/special-operations/returned",
  },
  {
    id: "sc-15",
    orderId: "SHOP-2026-0013",
    title: "إعادة فحص القطع المصححة بعد عودتها للجودة",
    description:
      "قطع مصححة عادت لمحطة الجودة لإعادة تدقيقها والتأكد من زوال العيب.",
    category: "CORRECTION",
    targetRole: "quality",
    directUrl: "/quality/reinspection",
  },
  {
    id: "sc-16",
    orderId: "SHOP-2026-0014",
    title: "دفعات جزئية بالمستودع (التسليم مقفل < 100%)",
    description:
      "وصلت كراتين جزئية بينما بقية الكميات تحت التصنيع، والتسليم مقفل حتى اكتمال 100%.",
    category: "WAREHOUSE",
    targetRole: "warehouse",
    directUrl: "/warehouse/incomplete",
  },
  {
    id: "sc-17",
    orderId: "SHOP-2026-0015",
    title: "أمر مكتمل 100% بالمستودع وجاهز للشحن",
    description:
      "اكتملت جميع القطع في المستودع وزر الإرسال مع المندوب مفعل ومتاح.",
    category: "WAREHOUSE",
    targetRole: "warehouse",
    directUrl: "/warehouse/ready",
  },
  {
    id: "sc-18",
    orderId: "SHOP-2026-0016",
    title: "شحنة خرجت مع مندوب التوصيل",
    description:
      "الأمر قيد التوصيل لعنوان العميل مع توثيق اسم المندوب وعدد الكراتين.",
    category: "WAREHOUSE",
    targetRole: "warehouse",
    directUrl: "/warehouse/out-for-delivery",
  },
  {
    id: "sc-19",
    orderId: "SHOP-2026-0017",
    title: "حالة تعذر وفشل تسليم معلقة لإعادة المحاولة",
    description:
      "تعذر التسليم لعدم تواجد العميل، مع توثيق السبب وإتاحة جدولة إعادة المحاولة.",
    category: "WAREHOUSE",
    targetRole: "warehouse",
    directUrl: "/warehouse/delivery-failed",
  },
  {
    id: "sc-20",
    orderId: "SHOP-2026-0018",
    title: "إعادة جدولة تسليم مع مندوب جديد",
    description: "تمت إعادة جدولة الشحنة وتحديد موعد جديد مع المندوب.",
    category: "WAREHOUSE",
    targetRole: "warehouse",
    directUrl: "/warehouse/orders/SHOP-2026-0018",
  },
  {
    id: "sc-21",
    orderId: "SHOP-2026-0019",
    title: "أمر مكتمل ومسلم للعميل بنجاح (مغلق)",
    description:
      "تم استلام العميل للطلب بالكامل واكتمال الدورة التصنيعية بنجاح.",
    category: "WAREHOUSE",
    targetRole: "warehouse",
    directUrl: "/warehouse/delivered",
  },
  {
    id: "sc-22",
    orderId: "SHOP-2026-0020",
    title: "إلغاء إداري جزئي مع معادلة الكمية النشطة",
    description:
      "ألغت الإدارة قطعتين، وأصبحت الكمية النشطة مطابقة للكمية الموجودة بالمستودع.",
    category: "ADMIN",
    targetRole: "admin",
    directUrl: "/admin/orders/SHOP-2026-0020",
  },
  {
    id: "sc-23",
    orderId: "SHOP-2026-0021",
    title: "أمر متأخر عن موعد التسليم مع تنبيه أحمر",
    description:
      "تجاوز موعد التسليم المحدد ويظهر في قائمة التنبيهات العاجلة للإدارة والمبيعات.",
    category: "ADMIN",
    targetRole: "admin",
    directUrl: "/admin/orders/SHOP-2026-0021",
  },
  {
    id: "sc-24",
    orderId: "SHOP-2026-0022",
    title: "فحص العميل المكرر برقم الهاتف",
    description:
      "إظهار تنبيه العميل القائم ومنع إنشاء حساب مكرر برقم هاتف مسجل.",
    category: "SALES",
    targetRole: "sales",
    directUrl: "/sales/customers",
  },
  {
    id: "sc-25",
    orderId: "SHOP-2026-0023",
    title: "طلب تسجيل موظف جديد بانتظار موافقة الإدارة",
    description:
      "طلب انضمام موظف جديد لقسم القص يظهر في قائمة الاعتماد للإدارة العامة.",
    category: "ADMIN",
    targetRole: "admin",
    directUrl: "/admin/users/pending",
  },
  {
    id: "sc-26",
    orderId: "SHOP-2026-0024",
    title: "مسودة أمر تفصيل محفوظة غير معتمدة",
    description: "مسودة غير مرسلة للاعتماد يمكن لمندوب المبيعات تعديلها بحرية.",
    category: "SALES",
    targetRole: "sales",
    directUrl: "/sales/orders/drafts",
  },
  {
    id: "sc-27",
    orderId: "SHOP-2026-0025",
    title: "تقرير تشغيلي شامل مع الطباعة الرسمية",
    description:
      "شاشة استخراج وتصدير وطباعة تقارير الأقسام والكميات التشغيلية.",
    category: "ADMIN",
    targetRole: "admin",
    directUrl: "/admin/reports",
  },
];
