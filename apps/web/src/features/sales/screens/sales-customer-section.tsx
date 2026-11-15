"use client";
import { Check, ChevronDown, Mail, Phone, UserPlus } from "lucide-react";
import type { CustomerSummary } from "@template/contracts";
import { OrderEditorErrorToast } from "./order-editor-error-toast";

export function SalesCustomerSection({
  search,
  onSearchChange,
  selectedCustomer,
  results,
  queryState,
  onSelect,
  onClear,
  onCreateCustomer,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  selectedCustomer: CustomerSummary | null;
  results: readonly CustomerSummary[];
  queryState: Readonly<{
    loading: boolean;
    fetching: boolean;
    error: string | null;
    onRetry: () => void;
  }>;
  onSelect: (customer: CustomerSummary) => void;
  onClear: () => void;
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
            ابحث برقم الهاتف أو الاسم أو البريد، ثم اختر عميلاً أو أنشئ عميلاً
            جديداً دون مغادرة الصفحة. اختيار العميل اختياري للمسودة.
          </p>
        </div>
        <button
          type="button"
          data-create-customer
          className="btn-pill btn-outline text-xs"
          onClick={onCreateCustomer}
        >
          <UserPlus size={14} />
          <span>+ إنشاء عميل داخل الطلب</span>
        </button>
      </div>
      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            رقم الهاتف أو اسم العميل:
          </span>
          <div className="relative">
            <input
              name="customerSearch"
              type="text"
              value={search}
              maxLength={150}
              onChange={(event) => {
                onSearchChange(event.target.value);
              }}
              placeholder="مثال: 0503849217 أو أحمد عبدالرحمن"
              className="oriental-input w-full pl-10"
            />
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500"
            />
          </div>
        </label>
        {selectedCustomer !== null ? (
          <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <strong className="block text-sm font-bold">
              ✓ تم اختيار: {selectedCustomer.name}
            </strong>
            <div className="flex gap-4 text-slate-600">
              <span>
                الهاتف: <bdi>{selectedCustomer.phone}</bdi>
              </span>
              <span>العنوان: {selectedCustomer.address ?? "غير محدد"}</span>
            </div>
            <button
              className="btn-pill btn-outline text-xs"
              type="button"
              onClick={onClear}
            >
              إزالة اختيار العميل
            </button>
          </div>
        ) : !queryState.loading && queryState.error === null ? (
          <div className="oriental-field-placeholder flex items-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            لم يتم اختيار عميل بعد. اكتب الهاتف للبحث أو اضغط &quot;إنشاء عميل
            داخل الطلب&quot;.
          </div>
        ) : null}
      </div>
      {queryState.loading && (
        <p role="status" className="text-xs text-slate-500">
          جارٍ تحميل العملاء...
        </p>
      )}
      {queryState.error !== null && (
        <div>
          <OrderEditorErrorToast message={queryState.error} />
          <button
            className="btn-pill btn-outline text-xs"
            type="button"
            onClick={queryState.onRetry}
          >
            إعادة محاولة تحميل العملاء
          </button>
        </div>
      )}
      {queryState.fetching && !queryState.loading && (
        <p role="status" className="text-xs text-slate-500">
          جارٍ تحديث بيانات العملاء...
        </p>
      )}
      {search.trim() !== "" && results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-teal-100 bg-teal-50 px-4 py-3 text-xs">
            <span className="font-bold text-teal-900">
              اختر العميل من نتائج البحث
            </span>
            <span className="shrink-0 text-teal-700">
              {results.length} نتيجة
            </span>
          </div>
          <ul
            aria-label="نتائج البحث عن العملاء"
            className="max-h-72 space-y-2 overflow-y-auto p-2"
          >
            {results.map((customer) => {
              const isSelected = selectedCustomer?.id === customer.id;
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    aria-current={isSelected ? true : undefined}
                    className={`group flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-right transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${isSelected ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/60"}`}
                    onClick={() => {
                      onSelect(customer);
                    }}
                  >
                    <span className="min-w-0 space-y-1.5">
                      <strong className="block text-sm font-bold break-words text-slate-900">
                        {customer.name}
                      </strong>
                      <span className="flex items-center gap-2 text-xs text-slate-600">
                        <Phone
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-slate-400"
                        />
                        <bdi dir="ltr">{customer.phone}</bdi>
                      </span>
                      <span className="flex items-start gap-2 text-xs text-slate-500">
                        <Mail
                          size={14}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-slate-400"
                        />
                        <bdi dir="ltr" className="min-w-0 break-all">
                          {customer.email ?? "البريد الإلكتروني غير مسجل"}
                        </bdi>
                      </span>
                    </span>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold ${isSelected ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600 group-hover:bg-teal-100 group-hover:text-teal-800"}`}
                    >
                      {isSelected && <Check size={14} aria-hidden="true" />}
                      {isSelected ? "تم الاختيار" : "اختيار العميل"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {search.trim() !== "" &&
        !queryState.loading &&
        queryState.error === null &&
        results.length === 0 && (
          <p className="text-xs text-slate-500">
            لا توجد نتائج مطابقة؛ يمكنك المتابعة دون عميل أو إنشاء عميل.
          </p>
        )}
    </div>
  );
}
