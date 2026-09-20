"use client";

import Link from "next/link";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function ApprovalHistoryView() {
  const store = useMvpStore();
  const approvalEvents = store.events.filter((e) => e.role === "الاعتماد");

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الاعتماد / سجل القرارات"
        title="سجل قرارات الاعتماد والإعادة"
        subtitle="توثيق زمني لكل طلب اعتمد ودخل المصنع، أو أعيد للمبيعات مع توثيق الأسباب"
      />

      <OrientalTable
        data={approvalEvents.slice().reverse()}
        keyExtractor={(e) => e.id}
        columns={[
          {
            header: "القرار المتخذ",
            render: (e) => (
              <strong className="text-slate-800">{e.event}</strong>
            ),
          },
          {
            header: "رقم الطلب",
            render: (e) => (
              <Link
                href={`/approval/orders/${e.orderId}`}
                className="font-mono font-bold text-teal-700"
                dir="ltr"
              >
                {e.orderId}
              </Link>
            ),
          },
          { header: "مسؤول الاعتماد", render: (e) => e.actor },
          {
            header: "الوجهة التشغيلية",
            render: (e) => e.destination || "المبيعات",
          },
          { header: "السبب / الملاحظة", render: (e) => e.note || "—" },
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
