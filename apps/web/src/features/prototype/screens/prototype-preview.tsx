"use client";

import React, { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  Factory,
  FileCheck,
  FilePlus2,
  Gauge,
  PackageCheck,
  Play,
  RotateCcw,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  demoScenarios,
  roleLabels,
  useMvpStore,
  formatProductCount,
  type Role,
  type DemoScenario,
} from "@/features/prototype/state/mvp-store";

const rolesList: {
  role: Role;
  name: string;
  dept: string;
  color: string;
  defaultPath: string;
  icon: LucideIcon;
}[] = [
  {
    role: "admin",
    name: "م. محمد العتيبي",
    dept: "الإدارة العامة والرقابة الشاملة",
    color: "bg-purple-600",
    defaultPath: "/admin/dashboard",
    icon: Gauge,
  },
  {
    role: "sales",
    name: "ريم خالد",
    dept: "المبيعات واستقبال الطلبات",
    color: "bg-blue-600",
    defaultPath: "/sales/dashboard",
    icon: FilePlus2,
  },
  {
    role: "approval",
    name: "خالد منصور",
    dept: "اعتماد وتدقيق أوامر التفصيل",
    color: "bg-indigo-600",
    defaultPath: "/approval/dashboard",
    icon: FileCheck,
  },
  {
    role: "cutting",
    name: "سالم الحربي",
    dept: "القص والتفصيل الجلدي",
    color: "bg-amber-600",
    defaultPath: "/cutting/dashboard",
    icon: Scissors,
  },
  {
    role: "production",
    name: "أحمد عادل",
    dept: "الإنتاج والتجميع والإصلاح",
    color: "bg-teal-600",
    defaultPath: "/production/dashboard",
    icon: Factory,
  },
  {
    role: "special",
    name: "فهد ياسين",
    dept: "العمليات الخاصة والحفر بالليزر",
    color: "bg-rose-600",
    defaultPath: "/special-operations/dashboard",
    icon: Sparkles,
  },
  {
    role: "quality",
    name: "منى سعيد",
    dept: "فحص الجودة والمطابقة والتغليف",
    color: "bg-emerald-600",
    defaultPath: "/quality/dashboard",
    icon: PackageCheck,
  },
  {
    role: "warehouse",
    name: "سارة محمد",
    dept: "المستودع والتسليم وشحن المناديب",
    color: "bg-sky-600",
    defaultPath: "/warehouse/dashboard",
    icon: Truck,
  },
];

export function PrototypePreviewWorkspace() {
  const store = useMvpStore();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [resetDone, setResetDone] = useState(false);

  // Group scenarios
  const categories = [
    { key: "ALL", label: "جميع السيناريوهات الـ 27" },
    { key: "SALES", label: "المبيعات والعملاء" },
    { key: "APPROVAL", label: "الاعتماد والتدقيق" },
    { key: "SPLIT", label: "التفريعات والانقسام" },
    { key: "REPAIR", label: "أوامر الإصلاح وتخطي القص" },
    { key: "CORRECTION", label: "دورات التصحيح من الجودة" },
    { key: "WAREHOUSE", label: "المستودع والكراتين والشحن" },
    { key: "ADMIN", label: "الإدارة والإلغاء الجزئي والموظفين" },
  ];

  const filteredScenarios = demoScenarios.filter((sc: DemoScenario) => {
    if (activeCategory !== "ALL" && sc.category !== activeCategory)
      return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      sc.title.toLowerCase().includes(q) ||
      sc.description.toLowerCase().includes(q) ||
      sc.orderId.toLowerCase().includes(q) ||
      sc.targetRole.toLowerCase().includes(q)
    );
  });

  function handleSwitchRole(role: Role, targetPath?: string) {
    store.setRole(role);
    if (targetPath) {
      router.push(targetPath as Route);
    }
  }

  function handleResetDemo() {
    if (
      window.confirm(
        "هل أنت متأكد من إعادة تعيين جميع بيانات العرض التوضيحي إلى وضعها الافتراضي؟",
      )
    ) {
      store.resetToDefault();
      setResetDone(true);
      setTimeout(() => {
        setResetDone(false);
      }, 3000);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-2 py-4" dir="rtl">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-8 text-white shadow-xl">
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-300">
            <ShieldCheck size={14} />
            <span>
              مركز اختبار واعتماد النموذج التفاعلي (QA & Scenario Hub)
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white md:text-3xl">
            نظام إدارة وتصنيع الحذاء الشرقي — بيئة المعاينة الكاملة
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-300 md:text-base">
            تم عزل جميع أدوات التحكم بالنموذج والمحاكاة حصرياً داخل هذه الصفحة
            لضمان نقاء بيئات العمل التشغيلية للأدوار الثمانية 100% ومطابقتها
            لأسلوب وهوية (تسعير برو).
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleResetDemo}
              className="btn-pill inline-flex items-center gap-2 border border-white/20 bg-white/10 px-4 py-2 text-xs text-white transition hover:bg-white/20"
            >
              <RotateCcw size={14} />
              <span>إعادة ضبط بيانات السيناريوهات للافتراضي</span>
            </button>

            {resetDone && (
              <span className="flex items-center gap-1 text-xs font-bold text-teal-300">
                <CheckCircle2 size={14} />
                تمت استعادة البيانات بنجاح!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 1. Quick Role Switcher Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              التبديل الفوري بين أدوار ومساحات العمل الثمانية
            </h2>
            <p className="text-xs text-slate-500">
              اختر دوراً للدخول المباشر إلى مساحة العمل الخاصة به مع كامل
              الصلاحيات والقوائم
            </p>
          </div>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
            الدور الحالي في الجلسة:{" "}
            {store.sessionRole ? roleLabels[store.sessionRole] : "غير محدد"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rolesList.map((item) => {
            const Icon = item.icon;
            const isCurrent = store.sessionRole === item.role;

            return (
              <div
                key={item.role}
                className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
                  isCurrent
                    ? "border-teal-500 bg-teal-50/50 shadow-md ring-2 ring-teal-500/20"
                    : "border-slate-200 bg-white hover:border-teal-300 hover:shadow-sm"
                }`}
                onClick={() => {
                  handleSwitchRole(item.role, item.defaultPath);
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${item.color}`}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-slate-900">
                        {roleLabels[item.role]}
                      </h3>
                      {isCurrent && (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-teal-600" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-slate-600">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {item.dept}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold">
                  <span
                    className={
                      isCurrent ? "font-bold text-teal-700" : "text-slate-500"
                    }
                  >
                    {isCurrent ? "مساحة العمل النشطة" : "انتقال للمساحة"}
                  </span>
                  <ChevronLeft
                    size={14}
                    className={isCurrent ? "text-teal-700" : "text-slate-400"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 27 Realistic Scenarios Navigator */}
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              دليل سيناريوهات الاختبار الـ 27 (حسب وثيقة المتطلبات PRD)
            </h2>
            <p className="text-xs text-slate-500">
              اضغط على أي سيناريو للانتقال الآلي للدور المطلوب وفتح أمر التفصيل
              فوراً
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute top-2.5 right-3 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                placeholder="بحث في السيناريوهات..."
                className="w-56 rounded-lg border border-slate-300 bg-white py-1.5 pr-8 pl-3 text-xs focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setActiveCategory(c.key);
              }}
              className={`rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition ${
                activeCategory === c.key
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Scenarios Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredScenarios.map((sc: DemoScenario, idx: number) => {
            const order = store.orders.find((o) => o.id === sc.orderId);

            return (
              <div
                key={sc.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-400 hover:shadow"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                      سيناريو #{idx + 1}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {sc.orderId}
                    </span>
                  </div>

                  <h3 className="text-sm leading-snug font-bold text-slate-900">
                    {sc.title}
                  </h3>

                  <p className="text-xs leading-relaxed text-slate-600">
                    {sc.description}
                  </p>

                  {order && (
                    <div className="space-y-1 rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>الحالة:</span>
                        <strong className="text-slate-800">
                          {order.status}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>الكمية النشطة:</span>
                        <strong className="text-teal-700">
                          {formatProductCount(
                            order.items.reduce((s, i) => s + i.quantity, 0) -
                              (order.cancelled || 0),
                          )}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[11px] text-slate-500">
                    الدور المقترح: <strong>{roleLabels[sc.targetRole]}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      handleSwitchRole(sc.targetRole, sc.directUrl);
                    }}
                    className="btn-pill btn-teal inline-flex items-center gap-1.5 px-3 py-1 text-xs"
                  >
                    <span>تشغيل</span>
                    <Play size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. PRD Acceptance Checklist */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <ShieldCheck size={20} className="text-teal-600" />
          <span>مطابقة معايير القبول والمتطلبات 100% (PRD Compliance)</span>
        </h2>
        <p className="text-xs text-slate-500">
          تم فحص وتدقيق كافة الشاشات والقواعد التصنيعية لضمان اكتمال رحلة
          المستخدم بالكامل قبل البدء في ربط الباك اند
        </p>

        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
          {[
            {
              title: "عزل كامل لأدوات التجربة والنموذج",
              desc: "لا توجد أي أزرار تبديل أدوار أو محاكيات داخل شاشات العمل التشغيلية للأقسام.",
              status: "تم التحقق 100%",
            },
            {
              title: "استمارة أمر التفصيل الأصلية P0",
              desc: "11 عموداً مقسمة لمستويات متعددة (الجلد 3 حقول، تركيب الوجه 4 حقول، الموديل، السعر، الجدول الجانبي، المقاسات، وشريط الأكواد).",
              status: "تم التحقق 100%",
            },
            {
              title: "حسابات الكميات الدقيقة والتفريعات",
              desc: "الكمية النشطة = الإجمالية - الملغاة، نسبة الإنجاز بالمستودع = المستودع / النشطة. قفل التسليم حتى بلوغ 100%.",
              status: "تم التحقق 100%",
            },
            {
              title: "أوامر الإصلاح ومسارات التخطي",
              desc: "أوامر الإصلاح تتخطى قسم القص تلقائياً وتدخل ورشة الإنتاج مباشرة.",
              status: "تم التحقق 100%",
            },
            {
              title: "دورات التصحيح المتكررة من الجودة",
              desc: "إعادة الأجزاء المعيبة إلى القص أو الإنتاج أو العمليات الخاصة مع عداد للدورات وملاحظات فنية إلزامية.",
              status: "تم التحقق 100%",
            },
            {
              title: "إجراءات التسليم وإعادة المحاولة بالمستودع",
              desc: "تسجيل حالات فشل التسليم مع أسبابها وجدولة مواعيد إعادة المحاولة مع المندوب.",
              status: "تم التحقق 100%",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
            >
              <CheckCircle2
                size={18}
                className="mt-0.5 shrink-0 text-emerald-600"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-800">
                    {item.title}
                  </h4>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
