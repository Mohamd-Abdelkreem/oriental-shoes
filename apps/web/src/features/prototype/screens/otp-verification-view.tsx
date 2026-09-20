"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "./auth-card";

export function OtpVerificationView() {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (otp === "246810" || otp === "123456") {
      router.push("/auth/reset-password");
    } else {
      setError("رمز التحقق غير صحيح. الرمز التجريبي هو 246810");
    }
  }

  return (
    <AuthCard
      title="التحقق من رمز التأكيد"
      subtitle="أدخل رمز الـ 6 أرقام المرسل إلى هاتفك (الرمز التجريبي: 246810)"
      footer={
        <Link
          href="/auth/login"
          className="font-bold text-teal-700 hover:underline"
        >
          إلغاء والعودة للدخول
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-center text-xs font-bold text-slate-700">
            رمز التحقق (OTP)
          </label>
          <input
            type="text"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value);
            }}
            placeholder="246810"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center font-mono text-xl tracking-widest focus:border-teal-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="btn-pill btn-teal w-full py-2.5 text-sm font-bold shadow-sm"
        >
          تأكيد الرمز والمتابعة
        </button>
      </form>
    </AuthCard>
  );
}
