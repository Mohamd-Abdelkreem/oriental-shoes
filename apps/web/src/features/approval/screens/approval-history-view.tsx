"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
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
                className="font-mono font-bold text-teal-700 hover:text-teal-900 hover:underline"
                dir="ltr"
                title="عرض تفاصيل وتتبع أمر التفصيل"
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
          {
            header: "الإجراء",
            className: "text-left",
            render: (e) => (
              <Link
                href={`/approval/orders/${e.orderId}`}
                className="btn-pill btn-outline inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-700"
                title="عرض تفاصيل وتتبع أمر التفصيل في قسم الاعتماد"
              >
                <FileText size={12} />
                <span>أمر التفصيل</span>
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
