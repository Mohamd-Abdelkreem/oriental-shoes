"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AuthCard } from "./auth-card";

export function AccountSuspendedView() {
  return (
    <AuthCard
      title="الحساب موقوف مؤقتاً"
      subtitle="تم إيقاف صلاحيات الوصول لهذا الحساب من قبل مدير النظام"
      footer={
        <Link
          href="/auth/login"
          className="font-bold text-teal-700 hover:underline"
        >
          العودة لتسجيل الدخول
        </Link>
      }
    >
      <div className="space-y-4 py-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert size={32} />
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          يرجى مراجعة الإدارة العامة لرفع الإيقاف واستعادة صلاحيات الدخول.
        </p>
      </div>
    </AuthCard>
  );
}
