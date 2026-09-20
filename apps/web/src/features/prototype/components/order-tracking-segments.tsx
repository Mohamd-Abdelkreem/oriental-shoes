"use client";

import React from "react";
import { Boxes } from "lucide-react";
import {
  type MvpOrder,
  type QuantitySegment,
  formatProductCount,
  formatSegmentCount,
} from "@/features/prototype/state/mvp-store";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function OrderTrackingSegments({ order }: { order: MvpOrder }) {
  return (
    <>
      {/* 4. Quantity Segments Detailed Table */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Boxes size={16} className="text-teal-600" />
              <span>جدول أجزاء الكمية المتحركة في المصنع:</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              تفاصيل كل جزء كمية مستقل يتبع لأمر التفصيل هذا، موقعه ومسؤوله
              ومسار حركته:
            </p>
          </div>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
            {formatSegmentCount(order.segments.length)}
          </span>
        </div>

        <OrientalTable<QuantitySegment>
          data={order.segments}
          keyExtractor={(s) => s.id}
          emptyTitle="لا توجد أجزاء كمية مسجلة"
          emptySubtitle="الأمر قيد الإنشاء أو لم يتم اعتماده بعد"
          columns={[
            {
              header: "معرّف الجزء وتسلسله",
              render: (seg, idx) => (
                <div>
                  <strong className="block font-mono text-xs text-slate-900">
                    جزء #{idx + 1}
                  </strong>
                  <span className="font-mono text-[10px] text-slate-400">
                    {seg.id}
                  </span>
                </div>
              ),
            },
            {
              header: "الموديل والبند",
              render: (seg) => {
                const itm =
                  order.items.find((i) => i.id === seg.itemId) ||
                  order.items[0];
                return (
                  <div>
                    <strong className="block font-mono text-xs text-slate-800">
                      {itm?.model || "—"}
                    </strong>
                    <span className="text-[11px] text-teal-800">
                      مقاس: {itm?.size || "—"}
                    </span>
                  </div>
                );
              },
            },
            {
              header: "المواصفات الفنية",
              render: (seg) => {
                const itm =
                  order.items.find((i) => i.id === seg.itemId) ||
                  order.items[0];
                return (
                  <div className="max-w-xs space-y-0.5 text-[11px] text-slate-600">
                    <span className="block">
                      الجلد: {itm?.leatherBase || "طبيعي"}
                    </span>
                    {itm?.decoration && (
                      <span className="block text-slate-500">
                        التطعيم: {itm.decoration}
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              header: "كمية الجزء",
              render: (seg) => (
                <span className="inline-block rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 font-mono text-xs font-bold text-teal-800">
                  {formatProductCount(seg.quantity)}
                </span>
              ),
            },
            {
              header: "القسم والموقع الحالي",
              render: (seg) => (
                <strong className="block text-xs text-slate-900">
                  {seg.stage}
                </strong>
              ),
            },
            {
              header: "الحالة التشغيلية",
              render: (seg) => (
                <OrientalStatusPill tone={statusTone(seg.state)}>
                  {seg.state}
                </OrientalStatusPill>
              ),
            },
            {
              header: "الموظف المعين",
              render: (seg) => (
                <span
                  className={`text-xs ${seg.worker ? "font-medium text-indigo-700" : "text-slate-400"}`}
                >
                  {seg.worker || "غير معين"}
                </span>
              ),
            },
            {
              header: "المسار (من / إلى)",
              render: (seg) => (
                <div className="text-[11px] text-slate-600">
                  <span className="block">
                    السابق: <strong>{seg.source || "الاعتماد"}</strong>
                  </span>
                  <span className="block text-teal-800">
                    التالي:{" "}
                    <strong>
                      {seg.stage === "القص"
                        ? "الإنتاج والإصلاح"
                        : seg.stage === "الإنتاج والإصلاح"
                          ? "العمليات الخاصة أو الجودة"
                          : seg.stage === "العمليات الخاصة"
                            ? "الجودة والتغليف"
                            : seg.stage === "الجودة والتغليف"
                              ? "المستودع"
                              : "التسليم"}
                    </strong>
                  </span>
                </div>
              ),
            },
            {
              header: "آخر تحديث وملاحظات",
              render: (seg) => (
                <div className="text-xs text-slate-500">
                  <span className="block font-mono text-[10px]">
                    {seg.startedAt || order.created}
                  </span>
                  <span className="line-clamp-1 block text-[11px] text-slate-600">
                    {seg.note || "وفق المواصفات المعتمدة"}
                  </span>
                  {seg.cycle && (
                    <span className="block text-[10px] font-bold text-rose-600">
                      دورة تصحيح #{seg.cycle}
                    </span>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
