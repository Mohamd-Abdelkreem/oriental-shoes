import type { Route } from "next";
import {
  CheckCircle2,
  Clock,
  Factory,
  Package,
  PackageCheck,
  RotateCcw,
  Scissors,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/features/prototype/fixtures/prototype-data";

export type DepartmentRole = Exclude<Role, "admin" | "sales" | "approval">;
export type DashboardSectionId =
  "incoming" | "inProgress" | "returned" | "completed";
type DashboardSection = {
  title: string;
  subtitle: string;
  href: Route;
  icon: LucideIcon;
};

export const dashboardSections = {
  cutting: {
    incoming: {
      title: "وارد للقص والتفصيل",
      subtitle:
        "أوامر معتمدة بانتظار استلام الجلود وبدء تفصيل الأوجه والبطانات",
      href: "/cutting/incoming",
      icon: Clock,
    },
    inProgress: {
      title: "قيد القص والتفصيل",
      subtitle: "أوامر قيد التشغيل الفعلي حالياً على طاولات ومقصدار القسم",
      href: "/cutting/in-progress",
      icon: Scissors,
    },
    returned: {
      title: "معاد للتصحيح من الجودة",
      subtitle: "قطع معادة تتطلب إعادة قص وتصحيح عيوب فوراً",
      href: "/cutting/returned",
      icon: RotateCcw,
    },
    completed: {
      title: "المنجز والمحوّل إلى الإنتاج",
      subtitle: "أوامر تم إنجاز قصها بالكامل وتحويلها لخط الإنتاج والتجميع",
      href: "/cutting/completed",
      icon: CheckCircle2,
    },
  },
  production: {
    incoming: {
      title: "وارد للإنتاج والتركيب",
      subtitle: "شحنات مقصوصة وأوامر إصلاح واردة بانتظار استلام الورشة والبدء",
      href: "/production/incoming",
      icon: Clock,
    },
    inProgress: {
      title: "قيد الإنتاج والتجميع",
      subtitle: "أوامر قيد التجميع والشد والخياطة على خطوط الورشة",
      href: "/production/in-progress",
      icon: Factory,
    },
    returned: {
      title: "معاد للتصحيح من الجودة",
      subtitle: "قطع تبيّن وجود عيوب تركيب أو غراء بها وتتطلب معالجة فورية",
      href: "/production/returned",
      icon: RotateCcw,
    },
    completed: {
      title: "المنجز والمحوّل إلى الجودة",
      subtitle: "أوامر تم إنجاز تركيبها بالكامل وتحويلها للجودة والتغليف",
      href: "/production/completed",
      icon: CheckCircle2,
    },
  },
  quality: {
    incoming: {
      title: "وارد للجودة والتغليف",
      subtitle: "أوامر منجزة من الإنتاج بانتظار استلام وبدء الفحص والمطابقة",
      href: "/quality/incoming",
      icon: Clock,
    },
    inProgress: {
      title: "محطة الفحص والتغليف",
      subtitle: "قطع قيد الفحص المخبري والظاهري والتغليف الرسمي الفاخر",
      href: "/quality/inspection",
      icon: ShieldCheck,
    },
    returned: {
      title: "متابعة دورات التصحيح",
      subtitle: "قطع مرفوضة معادة إلى القص أو الإنتاج تحت المتابعة",
      href: "/quality/corrections",
      icon: RotateCcw,
    },
    completed: {
      title: "المجاز والمحوّل للمستودع",
      subtitle: "القطع المجازة والمغلفة التي تم تحويلها بنجاح للمستودع",
      href: "/quality/accepted",
      icon: CheckCircle2,
    },
  },
  warehouse: {
    incoming: {
      title: "وارد للمستودع والتسليم",
      subtitle: "طلبيات مجازة ومغلفة واردة بانتظار تأكيد استلامها وتخزينها",
      href: "/warehouse/incoming",
      icon: Clock,
    },
    inProgress: {
      title: "قيد التجهيز والتسليم",
      subtitle: "أوامر مكتملة ومخزنة جاهزة لتسليم العميل أو خروج المندوب",
      href: "/warehouse/ready",
      icon: Package,
    },
    returned: {
      title: "تعثر التسليم والمشكلات",
      subtitle: "طلبيات واجهت تعثر في التوصيل أو تتطلب إعادة محاولة",
      href: "/warehouse/delivery-failed",
      icon: RotateCcw,
    },
    completed: {
      title: "أرشيف المسلّم بالكامل",
      subtitle: "الأوامر التي تم تسليمها للعميل واكتملت دورتها بالكامل",
      href: "/warehouse/delivered",
      icon: PackageCheck,
    },
  },
} satisfies Record<
  DepartmentRole,
  Record<DashboardSectionId, DashboardSection>
>;
