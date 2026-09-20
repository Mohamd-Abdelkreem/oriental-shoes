"use client";

import { UserPlus } from "lucide-react";
import type { MvpCustomer } from "@/features/prototype/state/mvp-store";

export function SalesCustomerSection({
  customerPhone,
  onCustomerPhoneChange,
  selectedCustomer,
  onCreateCustomer,
}: {
  customerPhone: string;
  onCustomerPhoneChange: (phone: string) => void;
  selectedCustomer: MvpCustomer | undefined;
  onCreateCustomer: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">
            ١. ربط العميل بأمر التفصيل
          </h2>
          <p className="text-xs text-slate-500">
            ابحث برقم الهاتف أو الاسم، أو أنشئ عميلاً جديداً دون مغادرة الصفحة
          </p>
        </div>
        <button
          type="button"
          className="btn-pill btn-outline text-xs"
          onClick={() => {
            onCreateCustomer();
          }}
        >
          <UserPlus size={14} />
          <span>+ إنشاء عميل داخل الطلب</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            رقم الهاتف أو اسم العميل:
          </span>
          <input
            type="text"
            value={customerPhone}
            onChange={(e) => {
              onCustomerPhoneChange(e.target.value);
            }}
            placeholder="مثال: 0503849217 أو أحمد عبدالرحمن"
            className="oriental-input w-full"
          />
        </label>

        {selectedCustomer ? (
          <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <strong className="block text-sm font-bold">
              ✓ تم اختيار: {selectedCustomer.name}
            </strong>
            <div className="flex gap-4 text-slate-600">
              <span>
                الهاتف: <bdi>{selectedCustomer.phone}</bdi>
              </span>
              <span>العنوان: {selectedCustomer.address}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            لم يتم اختيار عميل بعد. اكتب الهاتف للبحث أو اضغط &quot;إنشاء عميل
            داخل الطلب&quot;.
          </div>
        )}
      </div>
    </div>
  );
}
