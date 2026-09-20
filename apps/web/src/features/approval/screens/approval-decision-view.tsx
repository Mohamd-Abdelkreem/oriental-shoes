"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Printer, RotateCcw, X } from "lucide-react";
import { typeLabels, useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";

export function ApprovalDecisionView({ orderId }: { orderId: string }) {
  const store = useMvpStore();
  const router = useRouter();
  const order =
    store.orders.find((o) => o.id === orderId) || store.orders[0] || notFound();

  const [returnModal, setReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [error, setError] = useState("");

  const isAlreadyApproved =
    order.status !== "بانتظار الاعتماد" && order.status !== "مسودة";

  const handleApprove = () => {
    store.approveOrder(order.id, "خالد منصور");
    router.push("/approval/pending");
  };

  const handleReturn = () => {
    if (!returnReason.trim()) {
      setError("سبب الإعادة إلزامي لتوضيح متطلبات التعديل لمندوب المبيعات");
      return;
    }
    const fullReason = returnNotes
      ? `${returnReason.trim()} · ملاحظات إضافية: ${returnNotes.trim()}`
      : returnReason.trim();

    store.returnOrderToSales(order.id, fullReason, "خالد منصور");
    setReturnModal(false);
    router.push("/approval/pending");
  };

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`اعتماد الطلبات / مراجعة ${order.id}`}
        title={`مراجعة أمر التفصيل — ${order.customer}`}
        badge={
          <OrientalStatusPill tone={statusTone(order.status)}>
            {order.status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.salesperson} · نوع الطلب: ${typeLabels[order.type]}`}
        actions={
          <div className="flex items-center gap-2">
            {!isAlreadyApproved ? (
              <>
                <button
                  type="button"
                  className="btn-pill btn-rose"
                  onClick={() => {
                    setReturnModal(true);
                  }}
                >
                  <RotateCcw size={15} />
                  <span>إعادة إلى المبيعات للتعديل</span>
                </button>
                <button
                  type="button"
                  className="btn-pill btn-teal"
                  onClick={handleApprove}
                >
                  <CheckCircle2 size={15} />
                  <span>اعتماد أمر التفصيل وتوجيهه للمصنع</span>
                </button>
              </>
            ) : (
              <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                ✓ تم اعتماد هذا الطلب ودخل خطوط التصنيع
              </span>
            )}
            <Link href="/approval/pending" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              <span>العودة للقائمة</span>
            </Link>
          </div>
        }
      />

      {/* Guidance Notice */}
      <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <strong>توجيه تدقيق الاعتماد:</strong>
        <p>
          المراجعة تتم على نفس النموذج الورقي المرجعي بالضبط. عند الضغط على
          &quot;اعتماد أمر التفصيل&quot;،
          {order.type === "REPAIR"
            ? " ينتقل طلب الإصلاح مباشرة إلى قسم الإنتاج والإصلاح (متجاوزاً القص)."
            : " ينتقل أمر التفصيل إلى قسم القص ليبدأ خط التصنيع."}{" "}
          يقفل خيار التعديل لدى المبيعات فور الاعتماد.
        </p>
      </div>

      {/* Read-Only Paper Form Review */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-sm font-bold text-slate-800">
            بيانات النموذج الورقي المقدمة للاعتماد
          </h2>
          <Link
            href={`/print/order/${order.id}`}
            className="flex items-center gap-1 text-xs text-teal-600 hover:underline"
            target="_blank"
          >
            <Printer size={13} />
            <span>معاينة الطباعة</span>
          </Link>
        </div>

        <OrderPaperForm order={order} mode="approval" />
      </div>

      {/* Decision Bar */}
      {!isAlreadyApproved && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <strong className="block text-sm font-bold text-slate-900">
              قرار الاعتماد النهائي لهذا الطلب:
            </strong>
            <span className="text-xs text-slate-500">
              اختر أحد القرارين أدناه لتوثيق الإجراء في سجل النظام
            </span>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="btn-pill btn-rose"
              onClick={() => {
                setReturnModal(true);
              }}
            >
              <RotateCcw size={15} />
              <span>إعادة للمبيعات مع سبب</span>
            </button>
            <button
              type="button"
              className="btn-pill btn-teal px-5"
              onClick={handleApprove}
            >
              <CheckCircle2 size={16} />
              <span>اعتماد أمر التفصيل</span>
            </button>
          </div>
        </div>
      )}

      {/* Return to Sales Modal with Mandatory Reason */}
      {returnModal && (
        <div
          className="oriental-modal-backdrop"
          onClick={() => {
            setReturnModal(false);
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
                إعادة أمر التفصيل للمبيعات للتعديل
              </h2>
              <button
                type="button"
                className="oriental-modal-close"
                onClick={() => {
                  setReturnModal(false);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5 text-sm text-slate-700">
              <p className="text-xs text-slate-500">
                يجب تحديد سبب الإعادة بدقة حتى يظهر لمندوب المبيعات في قائمة
                الطلبات المعادة للتصحيح.
              </p>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-800">
                  سبب الإعادة الإلزامي{" "}
                  <strong className="text-rose-600">*</strong>:
                </span>
                <select
                  value={returnReason}
                  onChange={(e) => {
                    setReturnReason(e.target.value);
                    setError("");
                  }}
                  className="oriental-input w-full text-xs"
                >
                  <option value="">-- اختر سبب الإعادة الرئيسي --</option>
                  <option value="لون التطعيم غير محدد بدقة في بنود الجلد">
                    لون التطعيم غير محدد بدقة في بنود الجلد
                  </option>
                  <option value="المقاس أو بيانات القاعدة غير متطابقة مع الموديل">
                    المقاس أو بيانات القاعدة غير متطابقة مع الموديل
                  </option>
                  <option value="نقص في مواصفات وجه الحذاء وتركيب الخيوط">
                    نقص في مواصفات وجه الحذاء وتركيب الخيوط
                  </option>
                  <option value="رقم لون الأرضية أو الموديل غير مسجل في الكتالوج">
                    رقم لون الأرضية أو الموديل غير مسجل في الكتالوج
                  </option>
                  <option value="تعليمات طلب الإصلاح تحتاج تفصيلاً فنياً أوضح">
                    تعليمات طلب الإصلاح تحتاج تفصيلاً فنياً أوضح
                  </option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-800">
                  تفاصيل وملاحظات إضافية للمبيعات (اختياري):
                </span>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => {
                    setReturnNotes(e.target.value);
                  }}
                  placeholder="حدد الأسطر أو البنود المحددة المطلوب تصحيحها..."
                  className="oriental-textarea w-full text-xs"
                />
              </label>

              {error && (
                <p className="text-xs font-medium text-rose-600">{error}</p>
              )}

              <div className="flex justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  className="btn-pill btn-rose"
                  onClick={handleReturn}
                >
                  تأكيد الإعادة للمبيعات
                </button>
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={() => {
                    setReturnModal(false);
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
