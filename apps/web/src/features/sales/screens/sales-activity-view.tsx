"use client";

import Link from "next/link";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function SalesActivityView() {
  const store = useMvpStore();
  const salesEvents = store.events.filter(
    (e) => e.role === "المبيعات" || e.actor === "ريم خالد",
  );

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / سجل النشاط"
        title="سجل حركات ونشاط المبيعات"
        subtitle="توثيق جميع أوامر التفصيل المنشأة والمسودات المحفوظة وتعديلات الإرسال للاعتماد"
      />

      <OrientalTable
        data={salesEvents.slice().reverse()}
        keyExtractor={(e) => e.id}
        columns={[
          {
            header: "الحدث",
            render: (e) => (
              <strong className="text-slate-800">{e.event}</strong>
            ),
          },
          {
            header: "رقم الطلب",
            render: (e) => (
              <Link
                href={`/sales/orders/${e.orderId}`}
                className="font-mono font-bold text-teal-700"
                dir="ltr"
              >
                {e.orderId}
              </Link>
            ),
          },
          { header: "الموظف", render: (e) => `${e.actor} (${e.role})` },
          {
            header: "الكمية",
            render: (e) => (e.quantity ? `${String(e.quantity)} قطع` : "—"),
          },
          { header: "الملاحظات", render: (e) => e.note || "—" },
          {
            header: "التوقيت",
            accessor: "time",
            className: "text-slate-400 font-mono text-xs",
          },
        ]}
      />
    </div>
  );
}
