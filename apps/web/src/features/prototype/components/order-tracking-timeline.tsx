"use client";

import React from "react";
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  Scissors,
  Sparkles,
  PackageCheck,
  Truck,
  FileText,
  User,
  Layers,
  Trash2,
} from "lucide-react";
import {
  type MvpOrder,
  formatProductCount,
} from "@/features/prototype/state/mvp-store";

type StageCounts = {
  القص: number;
  "الإنتاج والإصلاح": number;
  "العمليات الخاصة": number;
  "الجودة والتغليف": number;
  المستودع: number;
  "تم الاستلام": number;
  ملغي: number;
};

export function OrderTrackingTimeline({
  order,
  originalQuantity: orig,
  activeQuantity: activeReq,
  stageCounts,
}: {
  order: MvpOrder;
  originalQuantity: number;
  activeQuantity: number;
  stageCounts: StageCounts;
}) {
  // Prepare chronological mock events tailored to the order
  const chronologicalEvents = [
    {
      title: "إنشاء أمر التفصيل في المعرض",
      actor: order.salesperson || "ريم خالد",
      role: "المبيعات والمعارض",
      time: order.created,
      note: `تم فتح الطلب للعميل (${order.customerName || order.customer}) بإجمالي ${formatProductCount(orig)}`,
      icon: FileText,
      tone: "teal",
    },
    {
      title: "مراجعة واعتماد أمر التفصيل",
      actor: "خالد منصور",
      role: "قسم الاعتماد",
      time: order.created,
      note: "مطابقة المقاسات والمواصفات الفنية وتحويل الطلب لخطوط المصنع",
      icon: CheckCircle2,
      tone: "emerald",
    },
    ...(stageCounts["القص"] > 0 ||
    stageCounts["الإنتاج والإصلاح"] > 0 ||
    stageCounts["المستودع"] > 0
      ? [
          {
            title: "استلام في قسم القص وبدء التفصيل",
            actor: "سالم الحربي",
            role: "قسم القص",
            time: "اليوم التالي · ٠٩:١٥ ص",
            note: "استلام جلود التفصيل ومطابقة المقاسات المعتمدة",
            icon: Scissors,
            tone: "teal",
          },
        ]
      : []),
    ...(stageCounts["الإنتاج والإصلاح"] > 0 ||
    stageCounts["العمليات الخاصة"] > 0 ||
    stageCounts["المستودع"] > 0
      ? [
          {
            title: "تحويل كمية منجزة إلى قسم الإنتاج",
            actor: "أحمد عادل",
            role: "الإنتاج والإصلاح",
            time: "اليوم التالي · ١١:٣٠ ص",
            note: "تجميع الأوجه وتثبيت الأرضيات للدفعة المنجزة",
            icon: Layers,
            tone: "indigo",
          },
        ]
      : []),
    ...(stageCounts["العمليات الخاصة"] > 0
      ? [
          {
            title: "توجيه تفريعة إنتاجية إلى العمليات الخاصة",
            actor: "فهد ياسين",
            role: "العمليات الخاصة",
            time: "اليوم التالي · ٠٢:٠٠ م",
            note: "تنفيذ تطريز شعار خاص ونقش ليزر بالخيط المعتمد",
            icon: Sparkles,
            tone: "amber",
          },
        ]
      : []),
    ...(order.corrections && order.corrections.length > 0
      ? [
          {
            title: "فحص الجودة وتسجيل ملاحظة تصحيح",
            actor: "منى سعيد",
            role: "الجودة والتغليف",
            time: order.corrections[0]?.date || "سابقاً · ١١:٢٠ ص",
            note: `إعادة ${String(order.corrections[0]?.quantity ?? "")} قطع إلى ${order.corrections[0]?.responsible ?? ""}: ${order.corrections[0]?.reason ?? ""}`,
            icon: RotateCcw,
            tone: "rose",
          },
        ]
      : []),
    ...(order.warehouse > 0
      ? [
          {
            title: "استلام دفعات سليمة بالمستودع",
            actor: "سارة محمد",
            role: "المستودع والتسليم",
            time: "مؤخراً · ٠١:٤٥ م",
            note: `تم استلام ${formatProductCount(order.warehouse)} وتغليفها بالكراتين المخصصة`,
            icon: PackageCheck,
            tone: "emerald",
          },
        ]
      : []),
    ...(order.status === "جاهز للتسليم"
      ? [
          {
            title: "اكتمال أمر التفصيل بنسبة ١٠٠٪ في المستودع",
            actor: "سارة محمد",
            role: "المستودع والتسليم",
            time: "مؤخراً · ٠٤:٠٠ م",
            note: "اكتملت جميع القطع النشطة، الطلب مغلف وجاهز للتسليم للمندوب",
            icon: PackageCheck,
            tone: "emerald",
          },
        ]
      : []),
    ...(order.status === "خرج مع المندوب"
      ? [
          {
            title: "تسليم الشحنة لمندوب التوصيل",
            actor: "فهد الحربي",
            role: "مندوب التوصيل",
            time: "اليوم · ١١:٠٠ ص",
            note: "الشحنة في طريقها للتوصيل لعنوان العميل",
            icon: Truck,
            tone: "teal",
          },
        ]
      : []),
    ...(order.status === "تم الاستلام"
      ? [
          {
            title: "اكتمال التسليم واستلام العميل",
            actor: "فهد الحربي",
            role: "مندوب التوصيل",
            time: "اليوم · ٠٣:٣٠ م",
            note: "استلم العميل الطلب بنجاح وسدد كامل المبلغ المتبقي",
            icon: CheckCircle2,
            tone: "emerald",
          },
        ]
      : []),
    ...(order.cancelled > 0
      ? [
          {
            title: "إلغاء كمية إدارياً وتحديث المطلوب",
            actor: "محمد العتيبي",
            role: "الإدارة العامة",
            time: "سابقاً · ١٤:٢٠",
            note: `إلغاء ${formatProductCount(order.cancelled)} إدارياً وتحديث الكمية النشطة إلى ${formatProductCount(activeReq)}`,
            icon: Trash2,
            tone: "rose",
          },
        ]
      : []),
  ];

  return (
    <>
      {/* 5. Chronological Activity Timeline */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Clock size={16} className="text-teal-600" />
              <span>الخط الزمني التراكمي لحركات وأحداث أمر التفصيل:</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              سجل تسلسلي زمني دقيق لكل محطة مر بها الطلب بدءاً من المعرض وحتى
              التسليم:
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {chronologicalEvents.length} أحداث مسجلة
          </span>
        </div>

        <div className="relative space-y-6 pr-6 before:absolute before:top-2 before:right-2.5 before:bottom-2 before:w-0.5 before:bg-slate-200 before:content-['']">
          {chronologicalEvents.map((ev, index) => {
            const Icon = ev.icon;
            return (
              <div key={index} className="relative flex items-start gap-3">
                {/* Dot */}
                <div
                  className={`absolute top-0.5 -right-6 flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ring-4 ring-white ${
                    ev.tone === "emerald"
                      ? "bg-emerald-600"
                      : ev.tone === "indigo"
                        ? "bg-indigo-600"
                        : ev.tone === "amber"
                          ? "bg-amber-600"
                          : ev.tone === "rose"
                            ? "bg-rose-600"
                            : "bg-teal-600"
                  }`}
                >
                  <Icon size={12} />
                </div>

                {/* Content */}
                <div className="flex-1 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                    <strong className="text-xs font-bold text-slate-900">
                      {ev.title}
                    </strong>
                    <span className="font-mono text-[11px] text-slate-400">
                      {ev.time}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {ev.note}
                  </p>
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <User size={12} className="text-slate-400" />
                      <span>
                        المنفذ: <strong>{ev.actor}</strong>
                      </span>
                    </span>
                    <span>·</span>
                    <span className="font-medium text-teal-800">
                      ({ev.role})
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
