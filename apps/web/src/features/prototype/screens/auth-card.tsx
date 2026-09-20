"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4"
      dir="rtl"
    >
      {/* Brand Header */}
      <div className="mb-6 space-y-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-2xl font-extrabold text-white shadow-md">
          OS
        </div>
        <h1 className="text-2xl font-black text-slate-900">
          مصنع الحذاء الشرقي
        </h1>
        <p className="text-xs font-medium text-slate-500">
          بوابة الدخول الموحدة للعاملين وإدارة العمليات التصنيعية
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 bg-slate-50 p-6 text-center">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>

        <div className="space-y-4 p-6">{children}</div>

        {footer && (
          <div className="border-t border-slate-100 bg-slate-50 p-4 text-center text-xs text-slate-500">
            {footer}
          </div>
        )}
      </div>

      {/* Direct QA Hub Link */}
      <div className="mt-6 text-center">
        <Link
          href="/prototype-preview"
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
        >
          <span>الانتقال إلى مركز الاختبار السريع وتبديل الأدوار</span>
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
