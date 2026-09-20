"use client";

import { FileText } from "lucide-react";
import {
  roleLabels,
  type MvpOrder,
  type QuantitySegment,
  type Role,
} from "@/features/prototype/state/mvp-store";

export function FactoryTaskSpecifications({
  order,
  role,
  selectedItem,
  selectedSegment,
  inDept,
}: {
  order: MvpOrder;
  role: Exclude<Role, "admin" | "sales" | "approval" | "warehouse">;
  selectedItem: MvpOrder["items"][number] | undefined;
  selectedSegment: QuantitySegment | undefined;
  inDept: number;
}) {
  return (
    <>
      {/* 3. Department-Specific Information (Requirement 4 - No Full Sales Form) */}
      {selectedItem && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <FileText size={16} className="text-teal-600" />
              <span>
                بيانات ومواصفات التشغيل الخاصة بقسم {roleLabels[role]}
              </span>
            </h3>
            <span className="text-xs font-medium text-slate-500">
              البيانات المالية محجوبة عن ورش المصنع
            </span>
          </div>

          {/* Department Specs Rendering */}
          {role === "cutting" && (
            <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  مواصفات الجلد والتفصيل:
                </strong>
                <div className="flex justify-between">
                  <span className="text-slate-500">الأساس:</span>
                  <strong className="text-slate-900">
                    {selectedItem.leatherBase || "جلد طبيعي أسود"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">التطعيم:</span>
                  <strong className="text-slate-900">
                    {selectedItem.decoration || "سادة"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">لون التطعيم:</span>
                  <strong className="text-slate-900">
                    {selectedItem.decorationColor || "مطابق للأساس"}
                  </strong>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  الأرضية والمقاسات:
                </strong>
                <div className="flex justify-between">
                  <span className="text-slate-500">الموديل:</span>
                  <strong className="font-mono text-slate-900">
                    {selectedItem.model}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المقاس:</span>
                  <strong className="font-bold text-teal-800">
                    {selectedItem.size}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الأرضية والنعل:</span>
                  <strong className="text-slate-900">
                    {selectedItem.sole}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">لون الأرضية:</span>
                  <strong className="text-slate-900">
                    {selectedItem.soleColor || "—"}
                  </strong>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  تعليمات وتوجيهات القص:
                </strong>
                <p className="leading-relaxed text-slate-700">
                  {selectedItem.sideNotes ||
                    order.generalNotes ||
                    "قص دقيق ومطابقة العينة المعتمدة، مع تفريغ دقيق للحواف ومراعاة نسيج الجلد الطبيعي."}
                </p>
                <div className="border-t pt-2 text-[11px] text-teal-800">
                  الكمية المقررة بالمقصدار:{" "}
                  <strong>{selectedSegment?.quantity || inDept} قطعة</strong>
                </div>
              </div>
            </div>
          )}

          {role === "production" && (
            <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  تركيب الوجه والتجميع (Face Assembly):
                </strong>
                <div className="flex justify-between">
                  <span className="text-slate-500">م١ (الوجه الأيمن):</span>
                  <strong className="text-slate-900">
                    {selectedItem.faceRight || "جلد طبيعي"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">م٢ (الوجه الأيسر):</span>
                  <strong className="text-slate-900">
                    {selectedItem.faceLeft || "شمواه أسود"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">م٣ (تركيب الخيط):</span>
                  <strong className="text-slate-900">
                    {selectedItem.mixing || "خيط تطريز دقيق"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الوجه العام:</span>
                  <strong className="text-slate-900">
                    {selectedItem.face || "وجه سادة كلاسيكي"}
                  </strong>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  تثبيت الأرضية والإضافات:
                </strong>
                <div className="flex justify-between">
                  <span className="text-slate-500">الموديل:</span>
                  <strong className="font-mono text-slate-900">
                    {selectedItem.model}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المقاس:</span>
                  <strong className="font-bold text-teal-800">
                    {selectedItem.size}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الأرضية والنعل:</span>
                  <strong className="text-slate-900">
                    {selectedItem.sole} ({selectedItem.soleColor || ""})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الإضافات:</span>
                  <strong className="text-slate-900">
                    {selectedItem.additions || "فرشة طبية"}
                  </strong>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  ملاحظات الإنتاج والإصلاح:
                </strong>
                <p className="leading-relaxed text-slate-700">
                  {order.repairNote ||
                    selectedItem.sideNotes ||
                    order.generalNotes ||
                    "تثبيت حراري وكبس وضغط القاعدة ٤ ساعات مع مراعاة اتزان الكعب."}
                </p>
                <div className="border-t pt-2 text-[11px] text-teal-800">
                  الكمية الجاري تشغيلها:{" "}
                  <strong>{selectedSegment?.quantity || inDept} قطعة</strong>
                </div>
              </div>
            </div>
          )}

          {role === "special" && (
            <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  العملية الخاصة المطلوبة (بيان حر):
                </strong>
                <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed font-semibold text-slate-800">
                  {selectedSegment?.note ||
                    order.generalNotes ||
                    "تطريز شعار خاص أو نقش ليزر وفق نموذج العميل"}
                </p>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">الموديل والمقاس:</span>
                  <strong className="text-slate-900">
                    {selectedItem.model} · مقاس {selectedItem.size}
                  </strong>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <strong className="block border-b pb-1 font-bold text-slate-800">
                  تعليمات وضوابط التشغيل الفني:
                </strong>
                <p className="leading-relaxed text-slate-600">
                  مراعاة دقة خط التطريز وعدم شد الجلد لضمان عدم حدوث انكماش أو
                  انحراف جانبي، واختبار العينة على الجلد قبل البدء بالدفعة
                  كاملة.
                </p>
                <div className="border-t pt-2 text-[11px] text-teal-800">
                  الكمية المخصصة للعمليات الخاصة:{" "}
                  <strong>{selectedSegment?.quantity || inDept} قطعة</strong>
                </div>
              </div>
            </div>
          )}

          {role === "quality" && (
            <div className="space-y-3 text-xs">
              <strong className="block font-bold text-slate-800">
                جدول المواصفات الفنية المعتمدة للمطابقة والفحص:
              </strong>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full divide-y divide-slate-200 text-right">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2">الموديل</th>
                      <th className="p-2">المقاس</th>
                      <th className="p-2">الجلد الأساسي</th>
                      <th className="p-2">التطعيم ولونه</th>
                      <th className="p-2">تركيب الوجه (م١-م٣)</th>
                      <th className="p-2">الأرضية</th>
                      <th className="p-2">الإضافات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {order.items.map((it) => (
                      <tr key={it.id}>
                        <td className="p-2 font-mono font-bold text-slate-800">
                          {it.model}
                        </td>
                        <td className="p-2 font-bold text-teal-800">
                          {it.size}
                        </td>
                        <td className="p-2">{it.leatherBase}</td>
                        <td className="p-2">
                          {it.decoration} ({it.decorationColor || "مطابق"})
                        </td>
                        <td className="p-2">
                          {it.faceRight} / {it.faceLeft} / {it.mixing}
                        </td>
                        <td className="p-2">
                          {it.sole} ({it.soleColor || "—"})
                        </td>
                        <td className="p-2">{it.additions || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
