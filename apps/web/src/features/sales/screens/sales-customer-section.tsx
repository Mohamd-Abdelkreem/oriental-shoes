"use client";
import { UserPlus } from "lucide-react";
import type { CustomerSummary } from "@template/contracts";

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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            رقم الهاتف أو اسم العميل:
          </span>
          <input
            name="customerSearch"
            type="text"
            value={search}
            maxLength={150}
            onChange={(event) => {
              onSearchChange(event.target.value);
            }}
            placeholder="مثال: 0503849217 أو أحمد عبدالرحمن"
            className="oriental-input w-full"
          />
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
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
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
        <div role="alert" className="text-xs text-rose-700">
          {queryState.error}
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
        <ul
          aria-label="نتائج البحث عن العملاء"
          className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-right text-xs"
                onClick={() => {
                  onSelect(customer);
                }}
              >
                <strong>{customer.name}</strong> <bdi>{customer.phone}</bdi>{" "}
                {customer.email ?? ""}
              </button>
            </li>
          ))}
        </ul>
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
