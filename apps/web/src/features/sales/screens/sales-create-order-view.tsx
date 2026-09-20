"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import {
  useMvpStore,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { calculateOrderTotals } from "@/features/orders/paper/order-totals";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { useToast } from "@/components/toast";
import { emptyLine } from "./empty-line";
import { SalesCustomerSection } from "./sales-customer-section";
import { SalesOrderMetadataSection } from "./sales-order-metadata-section";
import { InlineCustomerModal } from "./inline-customer-modal";

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
  const [generalNotes, setGeneralNotes] = useState(
    existing?.generalNotes || "",
  );
  const [responsibleSignature, setResponsibleSignature] = useState(
    existing?.responsibleSignature || "ريم خالد",
  );
  const [repairNote, setRepairNote] = useState(existing?.repairNote || "");
  const [paidAmount, setPaidAmount] = useState(existing?.paid || "");
  const currentTotals = calculateOrderTotals(lines, paidAmount);

  const { toast } = useToast();
  const [inlineCustomerOpen, setInlineCustomerOpen] = useState(false);

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
    toast.info(`تم تكرار ${target.pieceNumber || "القطعة"} بنجاح`, {
      description:
        "تم إنشاء نسخة من مواصفات القطعة وإضافتها كسطر جديد في الجدول",
    });
  };

  const handleDeletePiece = (lineId: string) => {
    if (lines.length <= 1) return;
    const target = lines.find((l) => l.id === lineId);
    const filtered = lines.filter((l) => l.id !== lineId);
    const resequenced = filtered.map((p, idx) => ({
      ...p,
      pieceNumber: formatPieceSequence(idx),
      quantity: 1,
    }));
    setLines(resequenced);
    toast.delete("تم حذف القطعة", {
      description: `تمت إزالة ${target?.pieceNumber || "القطعة"} من أمر التفصيل بنجاح`,
    });
  };

  const handleAddPiece = () => {
    setLines((cur) => [...cur, emptyLine(crypto.randomUUID(), cur.length)]);
    toast.success("تمت إضافة قطعة جديدة", {
      description: `تم إدراج سطر فارغ جديد برقم القطعة ${formatPieceSequence(lines.length)}`,
    });
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

    const moneyFields = [...lines.map((line) => line.unitPrice), paidAmount];
    if (
      moneyFields.some(
        (amount) =>
          amount && (!Number.isFinite(Number(amount)) || Number(amount) < 0),
      )
    ) {
      setError("السعر والمبلغ المدفوع يجب أن يكونا رقمين غير سالبين");
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
      responsibleSignature,
      ...currentTotals,
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
      toast.success("تم حفظ المسودة بنجاح", {
        description: "تم حفظ بيانات أمر التفصيل ويمكنك العودة لتعديله لاحقاً",
      });
    } else {
      setSavedNotice("تم إرسال أمر التفصيل بنجاح لمسؤول الاعتماد.");
      toast.success("تم إرسال أمر التفصيل للاعتماد", {
        description:
          "تم تحويل أمر التفصيل بنجاح إلى قسم الاعتماد للمراجعة والموافقة",
      });
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

      <SalesCustomerSection
        customerPhone={customerPhone}
        onCustomerPhoneChange={setCustomerPhone}
        selectedCustomer={selectedCustomer}
        onCreateCustomer={() => {
          setInlineCustomerOpen(true);
        }}
      />

      <SalesOrderMetadataSection
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        deliveryDate={deliveryDate}
        onDeliveryDateChange={setDeliveryDate}
        repairNote={repairNote}
        onRepairNoteChange={setRepairNote}
      />

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

        <OrderPaperForm
          order={
            existing
              ? {
                  ...existing,
                  generalNotes,
                  responsibleSignature,
                  ...currentTotals,
                }
              : {
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
                  responsibleSignature,
                  ...currentTotals,
                }
          }
          mode={existing ? "edit" : "create"}
          lines={lines}
          onLinesChange={setLines}
          invalidCells={invalidCells}
          onDuplicatePiece={handleDuplicatePiece}
          onDeletePiece={handleDeletePiece}
          onAddPiece={handleAddPiece}
          onTotalsChange={(totals) => {
            setPaidAmount(totals.paid);
          }}
          onGeneralNotesChange={setGeneralNotes}
          onSignatureChange={setResponsibleSignature}
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

      {inlineCustomerOpen && (
        <InlineCustomerModal
          onClose={() => {
            setInlineCustomerOpen(false);
          }}
          onCreate={(customer) => {
            store.addCustomer(customer);
            setCustomerPhone(customer.phone);
            setInlineCustomerOpen(false);
          }}
        />
      )}
    </div>
  );
}
