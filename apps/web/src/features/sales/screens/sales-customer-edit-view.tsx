"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";

export function SalesCustomerEditView({ customerId }: { customerId: string }) {
  const store = useMvpStore();
  const router = useRouter();
  const customer = store.customers.find((c) => c.phone === customerId);

  const [name, setName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [email, setEmail] = useState(customer?.email || "");
  const [address, setAddress] = useState(customer?.address || "");
  const [notes, setNotes] = useState(customer?.notes || "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const duplicateByPhone = useMemo(() => {
    const p = phone.trim();
    if (!p || !customer || p === customer.phone) return null;
    return store.customers.find((c) => c.phone.trim() === p) || null;
  }, [phone, customer, store.customers]);

  const duplicateByEmail = useMemo(() => {
    const e = email.trim().toLowerCase();
    if (
      !e ||
      !customer ||
      (customer.email && e === customer.email.trim().toLowerCase())
    )
      return null;
    return (
      store.customers.find(
        (c) => c.email && c.email.trim().toLowerCase() === e,
      ) || null
    );
  }, [email, customer, store.customers]);

  if (!customer) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-8 text-center">
        <AlertCircle size={40} className="mx-auto text-rose-500" />
        <h3 className="text-lg font-bold text-slate-800">العميل غير موجود</h3>
        <p className="text-sm text-slate-500">
          لم يتم العثور على سجل العميل برقم الهاتف المطلوب: {customerId}
        </p>
        <Link href="/sales/customers" className="btn-pill btn-teal inline-flex">
          العودة لدليل العملاء
        </Link>
      </div>
    );
  }

  const phoneChanged = phone.trim() !== customer.phone;
  const linkedOrdersCount = store.orders.filter(
    (o) => o.phone === customer.phone,
  ).length;

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName || !cleanPhone) {
      setErrorMessage("يرجى إدخال اسم العميل ورقم الهاتف على الأقل.");
      return;
    }

    if (duplicateByPhone) {
      setErrorMessage(
        `رقم الهاتف مسجل مسبقاً لعميل آخر (${duplicateByPhone.name}). لا يمكن استخدام نفس الرقم.`,
      );
      return;
    }

    store.patchCustomer(customer.phone, {
      name: cleanName,
      phone: cleanPhone,
      email: email.trim(),
      address: address.trim(),
      notes: notes.trim(),
    });

    router.push(`/sales/customers/${encodeURIComponent(cleanPhone)}`);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات / دليل العملاء / تعديل بيانات العميل"
        title={`تعديل: ${customer.name}`}
        subtitle={`تحديث بيانات العميل وربطه التلقائي بأوامر التفصيل (${String(linkedOrdersCount)} أوامر مسجلة)`}
        actions={
          <Link
            href={`/sales/customers/${encodeURIComponent(customer.phone)}`}
            className="btn-pill btn-secondary"
          >
            <ArrowRight size={15} />
            <span>العودة لملف العميل</span>
          </Link>
        }
      />

      {errorMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle size={18} className="shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {phoneChanged && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <strong className="block font-bold">تنبيه ترحيل رقم الهاتف:</strong>
            <p className="mt-0.5 text-xs text-amber-800">
              تغيير رقم الهاتف سيقوم تلقائياً بتحديث رقم العميل في جميع أوامر
              التفصيل السابقة المربوطة بهذا الحساب ({linkedOrdersCount} أوامر)
              لضمان استمرارية السجل وتتبع الطلبات.
            </p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              بيانات العميل الحالية
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              تعديل تفاصيل الاتصال والعنوان
            </p>
          </div>
          <span
            className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700"
            dir="ltr"
          >
            ID: {customer.phone}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              اسم العميل <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              رقم الهاتف / الجوال <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
              dir="ltr"
              className={`w-full rounded-lg border px-3.5 py-2.5 font-mono text-sm focus:outline-none ${
                duplicateByPhone
                  ? "border-rose-400 bg-rose-50/40 text-rose-900"
                  : "border-slate-200 focus:border-teal-500"
              }`}
            />
            {duplicateByPhone && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                <AlertCircle size={13} />
                <span>
                  الرقم مسجل مسبقاً لعميل آخر ({duplicateByPhone.name})!
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              dir="ltr"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
            {duplicateByEmail && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                <Info size={13} />
                <span>
                  تنبيه: هذا البريد مسجل لعميل آخر ({duplicateByEmail.name}).
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              العنوان / المدينة
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-bold text-slate-700">
              ملاحظات إضافية
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              className="w-full resize-none rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Link
            href={`/sales/customers/${encodeURIComponent(customer.phone)}`}
            className="btn-pill btn-outline"
          >
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={!!duplicateByPhone}
            className={`btn-pill btn-teal ${duplicateByPhone ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <CheckCircle2 size={15} />
            <span>حفظ التعديلات</span>
          </button>
        </div>
      </form>
    </div>
  );
}
