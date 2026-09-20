"use client";

import Link from "next/link";
import { XCircle } from "lucide-react";
import { AuthCard } from "./auth-card";

export function AccountRejectedView() {
  return (
    <AuthCard
      title="تم رفض طلب التسجيل"
      subtitle="نعتذر، لم تتم الموافقة على طلب الحساب من قبل الإدارة"
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
          <XCircle size={32} />
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          يرجى مراجعة إدارة الموارد البشرية أو مسؤول النظام للتأكد من مسماك
          الوظيفي وتصريح العمل في المصنع.
        </p>
      </div>
    </AuthCard>
  );
}
