"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Send, UserPlus, X } from "lucide-react";
import {
  useMvpStore,
  type MvpCustomer,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { emptyLine } from "./empty-line";

function formDataText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
export function SalesCreateOrderView({ orderId }: { orderId?: string }) {
  const store = useMvpStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = orderId || searchParams.get("edit");
  const existing = store.orders.find((o) => o.id === editId);
  const preCustomerPhone = searchParams.get("customer");

  const [customerPhone, setCustomerPhone] = useState(
    existing?.phone || preCustomerPhone || "",
  );
  const [lines, setLines] = useState<ProductLine[]>(
    existing?.items && existing.items.length > 0
      ? existing.items.map((it, idx) => ({
          ...it,
          quantity: 1,
          pieceNumber: it.pieceNumber || formatPieceSequence(idx),
        }))
      : [emptyLine("line-1", 0)],
  );
  const [orderType, setOrderType] = useState<"SHOP" | "EXTERNAL" | "REPAIR">(
    existing?.type || "SHOP",
  );
  const [deliveryDate, setDeliveryDate] = useState(
    existing?.delivery || "٢٨ سبتمبر ٢٠٢٦",
  );
  const [generalNotes] = useState(existing?.generalNotes || "");
  const [repairNote, setRepairNote] = useState(existing?.repairNote || "");

  const [inlineCustomerOpen, setInlineCustomerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleDuplicatePiece = (lineId: string) => {
    const targetIndex = lines.findIndex((l) => l.id === lineId);
    if (targetIndex === -1) return;
    const target = lines[targetIndex];
    if (!target) return;
    const cloned: ProductLine = {
      ...target,
      id: crypto.randomUUID(),
      quantity: 1,
      pieceNumber: formatPieceSequence(lines.length),
    };
    const next = [...lines];
    next.splice(targetIndex + 1, 0, cloned);
    const resequenced = next.map((p, idx) => ({
      ...p,
      pieceNumber: formatPieceSequence(idx),
      quantity: 1,
    }));
    setLines(resequenced);
    setToastMessage("تم إنشاء نسخة جديدة من القطعة");
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleDeletePiece = (lineId: string) => {
    if (lines.length <= 1) return;
    const filtered = lines.filter((l) => l.id !== lineId);
    const resequenced = filtered.map((p, idx) => ({
      ...p,
      pieceNumber: formatPieceSequence(idx),
      quantity: 1,
    }));
    setLines(resequenced);
  };

  const handleAddPiece = () => {
    setLines((cur) => [...cur, emptyLine(crypto.randomUUID(), cur.length)]);
  };
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");

  const selectedCustomer = store.customers.find(
    (c) =>
      c.phone === customerPhone.replace(/\s/g, "") ||
      (customerPhone.trim() && c.name.includes(customerPhone.trim())),
  );

  const invalidCells = new Set<string>();
  if (error) {
    lines.forEach((l) => {
      if (!l.model) invalidCells.add(`${l.id}:model`);
      if (!l.quantity || l.quantity < 1) invalidCells.add(`${l.id}:quantity`);
      if (!l.size) invalidCells.add(`${l.id}:size`);
      if (!l.leatherBase) invalidCells.add(`${l.id}:leatherBase`);
      if (!l.face) invalidCells.add(`${l.id}:face`);
    });
  }

  const handleSubmit = (nextStatus: "مسودة" | "بانتظار الاعتماد") => {
    setError("");

    if (!selectedCustomer) {
      setError("يرجى البحث واختيار عميل مسجل، أو إنشاء عميل جديد أولاً");
      return;
    }

    if (
      lines.some(
        (l) =>
          !l.model ||
          !l.size ||
          !l.leatherBase ||
          !l.face ||
          !l.quantity ||
          l.quantity < 1,
      )
    ) {
      setError(
        "يرجى استكمال الحقول الأساسية لكل سطر: الموديل، الكمية، المقاس، أساس الجلد، والوجه",
      );
      return;
    }

    const nextId =
      existing?.id ||
      `${orderType}-2026-${String(store.orders.length + 1).padStart(4, "0")}`;

    const newOrder: MvpOrder = {
      id: nextId,
      type: orderType,
      customer: selectedCustomer.name,
      phone: selectedCustomer.phone,
      address: selectedCustomer.address,
      salesperson: "ريم خالد",
      created: existing?.created || "١٢ سبتمبر ٢٠٢٦",
      createdIso: existing?.createdIso || "2026-09-12",
      delivery: deliveryDate,
      deliveryIso: existing?.deliveryIso || "2026-09-28",
      status: nextStatus,
      cancelled: existing?.cancelled || 0,
      warehouse: existing?.warehouse || 0,
      items: lines,
      segments: existing?.segments || [],
      generalNotes,
      repairNote: orderType === "REPAIR" ? repairNote : undefined,
      responsibleSignature: "ريم خالد",
    };

    store.saveOrder(
      newOrder,
      existing
        ? nextStatus === "مسودة"
          ? "تحديث المسودة"
          : "إعادة إرسال للاعتماد بعد التصحيح"
        : nextStatus === "مسودة"
          ? "حفظ كمسودة"
          : "إرسال أمر التفصيل للاعتماد",
      nextStatus === "بانتظار الاعتماد"
        ? "تم التحقق وإرسال أمر التفصيل للاعتماد"
        : undefined,
    );

    if (nextStatus === "مسودة") {
      setSavedNotice("تم حفظ المسودة بنجاح. يمكنك العودة إليها في أي وقت.");
    } else {
      setSavedNotice("تم إرسال أمر التفصيل بنجاح لمسؤول الاعتماد.");
      setTimeout(() => {
        router.push("/sales/orders");
      }, 700);
    }
  };

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات / إنشاء وتعديل الطلبات"
        title={
          existing
            ? `تعديل أمر التفصيل (${existing.id})`
            : "إنشاء أمر تفصيل جديد"
        }
        subtitle="الكتابة المباشرة في نموذج أمر التفصيل الرسمي ومطابقة العميل والمواصفات"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                handleSubmit("مسودة");
              }}
            >
              حفظ كمسودة
            </button>
            <button
              type="button"
              className="btn-pill btn-teal"
              onClick={() => {
                handleSubmit("بانتظار الاعتماد");
              }}
            >
              <Send size={15} />
              <span>إرسال للاعتماد</span>
            </button>
            <Link href="/sales/orders" className="btn-pill btn-outline">
              إلغاء
            </Link>
          </div>
        }
      />

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <CheckCircle2 size={16} />
          <span>{savedNotice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: CUSTOMER SELECTION & INLINE CREATION */}
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
              setInlineCustomerOpen(true);
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
                setCustomerPhone(e.target.value);
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

      {/* STEP 2: ORDER METADATA */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b pb-3">
          <h2 className="text-sm font-bold text-slate-800">
            ٢. بيانات رأس أمر التفصيل
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              نوع أمر التفصيل:
            </span>
            <select
              value={orderType}
              onChange={(e) => {
                setOrderType(e.target.value as "SHOP" | "EXTERNAL" | "REPAIR");
              }}
              className="oriental-input w-full"
            >
              <option value="SHOP">طلب معرض (SHOP)</option>
              <option value="EXTERNAL">طلب مبيعات خارجية (EXTERNAL)</option>
              <option value="REPAIR">طلب إصلاح (REPAIR)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              تاريخ التسليم المتوقع:
            </span>
            <input
              type="text"
              value={deliveryDate}
              onChange={(e) => {
                setDeliveryDate(e.target.value);
              }}
              className="oriental-input w-full"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              مندوب المبيعات المسؤول:
            </span>
            <input
              type="text"
              value="ريم خالد"
              disabled
              className="oriental-input w-full bg-slate-50 text-slate-500"
            />
          </label>
        </div>

        {orderType === "REPAIR" && (
          <label className="block pt-2">
            <span className="mb-1 block text-xs font-semibold text-rose-700">
              تعليمات الإصلاح الخاصة بالطلب (يتجاوز القص ويتوجه للإنتاج مباشرة)
              *:
            </span>
            <textarea
              rows={2}
              value={repairNote}
              onChange={(e) => {
                setRepairNote(e.target.value);
              }}
              placeholder="مثال: فك النعل القديم وشد الجلد وإعادة تركيب أرضية ربل جديدة..."
              className="oriental-textarea w-full border-rose-300 text-xs"
            />
          </label>
        )}
      </div>

      {/* STEP 3: EXACT PAPER MANUFACTURING FORM */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              ٣. جدول المنتجات ومواصفات أمر التفصيل الورقي
            </h2>
            <p className="text-xs text-slate-500">
              أدخل البيانات مباشرة داخل خلايا الجدول مطابقةً للنموذج المرجعي
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-pill btn-outline text-xs text-teal-700"
              onClick={handleAddPiece}
            >
              + إضافة قطعة جديدة
            </button>
            <button
              type="button"
              className="btn-pill btn-outline text-xs text-rose-600"
              disabled={lines.length <= 1}
              onClick={() => {
                const lastLine = lines.at(-1);
                if (lastLine) handleDeletePiece(lastLine.id);
              }}
            >
              حذف آخر قطعة
            </button>
          </div>
        </div>

        {toastMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs font-bold text-emerald-900">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        <OrderPaperForm
          order={
            existing || {
              id: "SHOP-2026-NEW",
              type: orderType,
              customer: selectedCustomer?.name || "—",
              phone: selectedCustomer?.phone || "—",
              address: selectedCustomer?.address || "",
              salesperson: "ريم خالد",
              created: "١٢ سبتمبر ٢٠٢٦",
              delivery: deliveryDate,
              status: "مسودة",
              cancelled: 0,
              warehouse: 0,
              items: lines,
              segments: [],
              generalNotes,
              repairNote,
            }
          }
          mode={existing ? "edit" : "create"}
          lines={lines}
          onLinesChange={setLines}
          invalidCells={invalidCells}
          onDuplicatePiece={handleDuplicatePiece}
          onDeletePiece={handleDeletePiece}
          onAddPiece={handleAddPiece}
        />
      </div>

      {/* STICKY BOTTOM ACTIONS */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-lg backdrop-blur-md">
        <span className="text-xs text-slate-600">
          إجمالي الكمية المدخلة:{" "}
          <strong>
            {lines.reduce((s, l) => s + (l.quantity || 0), 0)} قطعة
          </strong>
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              handleSubmit("مسودة");
            }}
          >
            حفظ كمسودة
          </button>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              handleSubmit("بانتظار الاعتماد");
            }}
          >
            <Send size={15} />
            <span>إرسال للاعتماد</span>
          </button>
        </div>
      </div>

      {/* INLINE CUSTOMER MODAL */}
      {inlineCustomerOpen && (
        <div
          className="oriental-modal-backdrop"
          onClick={() => {
            setInlineCustomerOpen(false);
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
                  setInlineCustomerOpen(false);
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

                store.addCustomer(newCustomer);
                setCustomerPhone(phone);
                setInlineCustomerOpen(false);
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
                    setInlineCustomerOpen(false);
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
