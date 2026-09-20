"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, ArrowRight, Printer, ShieldAlert } from "lucide-react";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";

export function PrintOrderView() {
  const pathname = usePathname();
  const store = useMvpStore();

  const segments = pathname.split("/").filter(Boolean);
  let orderId = "";
  if (segments[0] === "orders" && segments[2] === "print") {
    orderId = decodeURIComponent(segments[1] || "");
  } else if (segments[0] === "print" && segments[1] === "order") {
    orderId = decodeURIComponent(segments[2] || "");
  } else {
    orderId = decodeURIComponent(
      segments.find(
        (s) =>
          s.startsWith("SHOP-") ||
          s.startsWith("EXTERNAL-") ||
          s.startsWith("REPAIR-"),
      ) ||
        segments[1] ||
        "",
    );
  }

  const order = store.orders.find((o) => o.id === orderId);

  // Role Guard: Factory workers must not access full paper form print
  const isFactoryWorker = [
    "cutting",
    "production",
    "special",
    "quality",
    "warehouse",
  ].includes(store.sessionRole || "");

  if (!order) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-100 p-4"
        dir="rtl"
      >
        <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle size={36} className="mx-auto text-rose-500" />
          <h2 className="text-lg font-bold text-slate-900">
            أمر التفصيل غير موجود
          </h2>
          <p className="text-xs text-slate-500">
            لم يتم العثور على أمر تفصيل بالمعرف المطلوب: {orderId}
          </p>
          <button
            type="button"
            onClick={() => {
              window.history.back();
            }}
            className="btn-pill btn-teal inline-flex px-4 py-2 text-xs"
          >
            العودة للصفحة السابقة
          </button>
        </div>
      </div>
    );
  }

  // Guard: Restrict printing from factory floor workers
  if (isFactoryWorker) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-100 p-4"
        dir="rtl"
      >
        <div className="w-full max-w-lg space-y-4 rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert size={44} className="mx-auto text-rose-600" />
          <h2 className="text-lg font-bold text-slate-900">
            طباعة الاستمارة غير مصرحة لعمال الورش
          </h2>
          <p className="text-xs leading-relaxed text-slate-600">
            وفق ضوابط الخصوصية والرقابة في نظام Oriental Shoes، تحتوي استمارة
            أمر التفصيل الرسمية على الأسعار والمبالغ الإجمالية وأرصدة العملاء،
            وتقتصر صلاحية طباعتها على مسؤولي المبيعات والاعتماد والإدارة العامة.
          </p>
          <button
            type="button"
            onClick={() => {
              window.history.back();
            }}
            className="btn-pill btn-outline inline-flex items-center gap-1.5 px-4 py-2 text-xs"
          >
            <ArrowRight size={14} />
            <span>العودة لمحطة العمل</span>
          </button>
        </div>
      </div>
    );
  }

  // Guard: Block printing drafts and returned orders
  if (order.status === "مسودة" || order.status === "معاد للتعديل") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-100 p-4"
        dir="rtl"
      >
        <div className="w-full max-w-lg space-y-4 rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle size={44} className="mx-auto text-amber-600" />
          <h2 className="text-lg font-bold text-slate-900">
            لا يمكن طباعة أمر التفصيل في حالة ({order.status})
          </h2>
          <p className="text-xs leading-relaxed text-slate-600">
            أوامر التفصيل غير المعتمدة لا تمثل وثيقة تشغيل رسمية للمصنع. يجب
            إرسال الطلب للاعتماد واعتماده رسمياً قبل توليد نسخة الطباعة الورقية.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Link
              href={`/sales/orders/${order.id}`}
              className="btn-pill btn-teal px-4 py-2 text-xs"
            >
              فتح الطلب للمراجعة والإرسال
            </Link>
            <button
              type="button"
              onClick={() => {
                window.history.back();
              }}
              className="btn-pill btn-outline px-3 py-2 text-xs"
            >
              رجوع
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0"
      dir="rtl"
    >
      {/* Top Action Bar (Hidden when printing) */}
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <div>
          <h1 className="text-sm font-bold text-slate-900">
            معاينة طباعة أمر التفصيل: {order.id}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            نسخة ورقية رسمية مطابقة لاستمارة المصنع المعتمدة (الحالة:{" "}
            {order.status})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            className="btn-pill btn-teal inline-flex items-center gap-1.5 px-4 py-2 text-xs"
          >
            <Printer size={15} />
            <span>طباعة المستند الآن (Ctrl + P)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.back();
            }}
            className="btn-pill btn-secondary px-3 py-2 text-xs"
          >
            رجوع
          </button>
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow-md print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        {/* Printable Header */}
        <div className="mb-4 flex items-start justify-between border-b-2 border-slate-900 pb-4 print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-slate-900">
                مصنع الحذاء الشرقي
              </span>
              <span className="rounded border border-slate-700 px-2 py-0.5 text-xs font-bold">
                أمر تشغيل وتفصيل معتمد
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              المملكة العربية السعودية · قسم التصنيع اليدوي والتفصيل الحصري
            </p>
          </div>

          <div className="text-left font-mono" dir="ltr">
            <div className="text-base font-black text-slate-900">
              {order.id}
            </div>
            <div className="text-xs text-slate-600">
              Issued: {order.created || order.createdAt}
            </div>
            <div className="text-xs text-slate-600">
              Delivery: {order.delivery || order.deliveryDate}
            </div>
          </div>
        </div>

        {/* Paper Form Rendered in Print Mode */}
        <OrderPaperForm order={order} mode="print" showZoomControls={false} />

        {/* Verification Footer */}
        <div className="mt-8 flex items-center justify-between border-t border-dashed border-slate-400 pt-4 text-[11px] text-slate-500">
          <div>
            <span>
              مسؤول المبيعات:{" "}
              {order.salesperson || order.salesRep || "ريم خالد"}
            </span>
            <span className="mx-2">·</span>
            <span>الاعتماد: معتمد رسمياً للدخول بالمصنع</span>
          </div>

          <div className="flex items-center gap-2 text-slate-700">
            <span>رقم أمر التفصيل المرجعي:</span>
            <span className="font-mono font-bold text-slate-900">
              {order.id}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
