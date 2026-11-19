"use client";

import React from "react";
import { OrientalLogo } from "@/components/brand/oriental-logo";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode | undefined;
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center" dir="rtl">
      {/* Brand Header */}
      <div className="mb-6 space-y-2 text-center">
        <OrientalLogo className="mx-auto h-14 w-auto" />
        <h1 className="auth-status-title text-2xl font-black text-slate-900">
          مصنع الحذاء الشرقي
        </h1>
        <p className="text-xs font-medium text-slate-500">
          بوابة الدخول الموحدة للعاملين وإدارة العمليات التصنيعية
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 bg-slate-50 p-6 text-center">
          <h2 className="auth-status-title text-lg font-bold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>

        <div className="space-y-4 p-6">{children}</div>

        {footer && (
          <div className="border-t border-slate-100 bg-slate-50 p-4 text-center text-xs text-slate-500">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
