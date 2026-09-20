"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { AuthCard } from "./auth-card";

export function PendingApprovalView() {
  return (
    <AuthCard
      title="طلبك قيد المراجعة والاعتماد"
      subtitle="تم استلام طلب تسجيل حسابك وهو الآن بانتظار موافقة الإدارة العامة"
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
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Clock size={32} />
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          يقوم فريق الإدارة بمطابقة البيانات الوظيفية وتحديد الصلاحيات المناسبة.
          ستصلك رسالة فور تفعيل حسابك للدخول لمساحة عملك.
        </p>
      </div>
    </AuthCard>
  );
}
