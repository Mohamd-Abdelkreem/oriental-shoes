"use client";

import Link from "next/link";
import { Edit, FilePlus2 } from "lucide-react";
import {
  totalQuantity,
  typeLabels,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function SalesDraftsView() {
  const store = useMvpStore();
  const drafts = store.orders.filter((o) => o.status === "مسودة");

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / المسودات"
        title="أوامر التفصيل المسودة"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {drafts.length} مسودة
          </span>
        }
        subtitle="طلبات قيد الإعداد والتعديل، لم ترسل للاعتماد بعد ولا تظهر في خطوط إنتاج المصنع"
        actions={
          <Link href="/sales/orders/new" className="btn-pill btn-teal">
            <FilePlus2 size={16} />
            <span>إنشاء مسودة جديدة</span>
          </Link>
        }
      />

      <OrientalTable
        data={drafts}
        keyExtractor={(o) => o.id}
        columns={[
          {
            header: "رقم المسودة",
            render: (o) => (
              <strong className="font-mono font-bold text-teal-700" dir="ltr">
                {o.id}
              </strong>
            ),
          },
          { header: "العميل", accessor: "customer" },
          { header: "نوع الطلب", render: (o) => typeLabels[o.type] },
          {
            header: "الكمية المبدئية",
            render: (o) => `${String(totalQuantity(o))} قطع`,
          },
          { header: "تاريخ الإنشاء", accessor: "created" },
          { header: "موعد التسليم المقترح", accessor: "delivery" },
          {
            header: "الإجراء",
            className: "text-left",
            render: (o) => (
              <div className="flex justify-end gap-2">
                <Link
                  href={`/sales/orders/new?edit=${o.id}`}
                  className="btn-pill btn-teal px-3 py-1 text-xs"
                >
                  <Edit size={12} />
                  <span>متابعة التحرير</span>
                </Link>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
