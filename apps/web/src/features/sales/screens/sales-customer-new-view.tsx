"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Info, UserPlus } from "lucide-react";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";

export function SalesCustomerNewView() {
  const store = useMvpStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const duplicateByPhone = useMemo(() => {
    const p = phone.trim();
    if (!p) return null;
    return store.customers.find((c) => c.phone.trim() === p) || null;
  }, [phone, store.customers]);

  const duplicateByEmail = useMemo(() => {
    const e = email.trim().toLowerCase();
    if (!e) return null;
    return (
      store.customers.find(
        (c) => c.email && c.email.trim().toLowerCase() === e,
      ) || null
    );
  }, [email, store.customers]);

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
        `رقم الهاتف مسجل مسبقاً للعميل (${duplicateByPhone.name}). لا يمكن تكرار رقم الجوال.`,
      );
      return;
    }

    store.addCustomer({
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
        eyebrow="المبيعات / دليل العملاء / عميل جديد"
        title="إضافة عميل جديد"
        subtitle="تسجيل بيانات العميل مع فحص التكرار التلقائي لرقم الهاتف والبريد الإلكتروني"
        actions={
          <Link href="/sales/customers" className="btn-pill btn-outline">
            <ArrowRight size={15} />
            <span>العودة لقائمة العملاء</span>
          </Link>
        }
      />

      {errorMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle size={18} className="shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-bold text-slate-900">
            البيانات الأساسية للعميل
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            يُستخدم رقم الجوال كمعرف رئيسي للعميل وربطه بجميع أوامر التفصيل
          </p>
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
              placeholder="مثال: عبد الله بن حمد"
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
              placeholder="05XXXXXXXX"
              dir="ltr"
              className={`w-full rounded-lg border px-3.5 py-2.5 font-mono text-sm focus:outline-none ${
                duplicateByPhone
                  ? "border-rose-400 bg-rose-50/40 text-rose-900"
                  : "border-slate-200 focus:border-teal-500"
              }`}
            />
            {duplicateByPhone && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0 text-rose-600" />
                  <span>
                    الرقم مسجل بالفعل للعميل:{" "}
                    <strong>{duplicateByPhone.name}</strong>
                  </span>
                </div>
                <Link
                  href={`/sales/customers/${encodeURIComponent(duplicateByPhone.phone)}`}
                  className="btn-pill btn-outline shrink-0 border-rose-300 bg-white text-xs text-rose-800 hover:bg-rose-100"
                >
                  فتح ملف العميل
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              البريد الإلكتروني (اختياري)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="customer@example.com"
              dir="ltr"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
            {duplicateByEmail && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                <Info size={13} />
                <span>
                  تنبيه: هذا البريد مسجل أيضاً للعميل ({duplicateByEmail.name}).
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
              placeholder="مثال: الرياض — حي العليا"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-bold text-slate-700">
              ملاحظات إضافية عن تفضيلات العميل
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              placeholder="أي تفاصيل خاصة بمقاسات أو نوعية الجلود أو شروط التسليم..."
              className="w-full resize-none rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Link href="/sales/customers" className="btn-pill btn-outline">
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={!!duplicateByPhone}
            className={`btn-pill btn-teal ${duplicateByPhone ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <UserPlus size={15} />
            <span>حفظ بيانات العميل</span>
          </button>
        </div>
      </form>
    </div>
  );
}
