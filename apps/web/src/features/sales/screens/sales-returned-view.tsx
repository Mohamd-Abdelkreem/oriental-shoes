"use client";

import Link from "next/link";
import { Edit } from "lucide-react";
import {
  totalQuantity,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function SalesReturnedView() {
  const store = useMvpStore();
  const returned = store.orders.filter((o) => o.status === "معاد للتعديل");

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / المعادة للتعديل"
        title="طلبات معادة للتصحيح من مسؤول الاعتماد"
        badge={
          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
            {returned.length} طلب بحاجة لتصحيح
          </span>
        }
        subtitle="قام مسؤول الاعتماد بإعادة هذه الطلبات مع بيان الحقول والمواصفات التي تحتاج استكمالاً"
      />

      <OrientalTable
        data={returned}
        keyExtractor={(o) => o.id}
        columns={[
          {
            header: "رقم الطلب",
            render: (o) => (
              <strong className="font-mono font-bold text-teal-700" dir="ltr">
                {o.id}
              </strong>
            ),
          },
          { header: "العميل", accessor: "customer" },
          {
            header: "سبب الإرجاع وملاحظة المراجع",
            render: (o) => (
              <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                <strong>
                  {o.returnReason || "يرجى مراجعة المواصفات بدقة"}
                </strong>
                {o.reviewer && (
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    المراجع: {o.reviewer} · {o.returnedAt || "اليوم"}
                  </span>
                )}
              </div>
            ),
          },
          {
            header: "الكمية",
            render: (o) => `${String(totalQuantity(o))} قطع`,
          },
          { header: "تاريخ التسليم", accessor: "delivery" },
          {
            header: "التصحيح",
            className: "text-left",
            render: (o) => (
              <Link
                href={`/sales/orders/new?edit=${o.id}`}
                className="btn-pill btn-rose px-3 py-1 text-xs"
              >
                <Edit size={12} />
                <span>تصحيح وإعادة الإرسال</span>
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
