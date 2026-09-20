"use client";

import { X } from "lucide-react";
import type { MvpCustomer } from "@/features/prototype/state/mvp-store";

function formDataText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function InlineCustomerModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (customer: MvpCustomer) => void;
}) {
  return (
    <div
      className="oriental-modal-backdrop"
      onClick={() => {
        onClose();
      }}
    >
      <div
        className="oriental-modal-container max-w-md"
        onClick={(e) => {
          e.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <h2 className="oriental-modal-title">
            إنشاء عميل جديد داخل أمر التفصيل
          </h2>
          <button
            type="button"
            className="oriental-modal-close"
            onClick={() => {
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const name = formDataText(form, "name");
            const phone = formDataText(form, "phone");
            const address = formDataText(form, "address");
            const email = formDataText(form, "email");

            if (!name || !phone) {
              alert("الاسم ورقم الهاتف مطلوبان");
              return;
            }

            const newCustomer: MvpCustomer = {
              name,
              phone,
              address,
              email,
              notes: "تم الإنشاء داخل أمر التفصيل",
            };

            onCreate(newCustomer);
          }}
          className="space-y-4 p-5 text-sm"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              اسم العميل *:
            </span>
            <input
              name="name"
              required
              className="oriental-input w-full"
              placeholder="الاسم الكامل"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              رقم الهاتف *:
            </span>
            <input
              name="phone"
              required
              className="oriental-input w-full"
              placeholder="05xxxxxxxx"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              العنوان:
            </span>
            <input
              name="address"
              className="oriental-input w-full"
              placeholder="المدينة، الحي"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              البريد الإلكتروني (اختياري):
            </span>
            <input
              name="email"
              type="email"
              className="oriental-input w-full"
              placeholder="example@domain.com"
            />
          </label>

          <div className="flex justify-end gap-2 border-t pt-3">
            <button type="submit" className="btn-pill btn-teal">
              حفظ وربط بالطلب
            </button>
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                onClose();
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
