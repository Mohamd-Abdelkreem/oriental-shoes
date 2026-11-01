const reportSignatories = [
  { role: "مدير الإنتاج والتصنيع", name: "أحمد عادل" },
  { role: "مشرفة ضبط الجودة", name: "منى سعيد" },
  { role: "أمينة المستودع والشحن", name: "سارة محمد" },
];

export function ReportEndorsements() {
  return (
    <section className="print-avoid-break mt-8 border-t-2 border-slate-900 pt-5">
      <div className="mb-4 text-center">
        <h4 className="text-xs font-black tracking-wide text-slate-900">
          اعتمادات وتواقيع المسؤولين التنفيذيين بالمصنع
        </h4>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {reportSignatories.map((signatory) => (
          <div
            key={signatory.name}
            className="rounded-lg border border-slate-300 p-3.5 text-center"
          >
            <span className="block text-[11px] font-bold text-slate-900">
              {signatory.role}
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              {signatory.name}
            </span>
            <div className="mt-7 border-b border-dashed border-slate-300 pb-1">
              <span className="text-[10px] text-slate-400">التوقيع:</span>
            </div>
            <span className="mt-1 block text-[10px] text-slate-400">
              التاريخ: .... / .... / ٢٠٢٦م
            </span>
          </div>
        ))}
        <div className="rounded-lg border-2 border-slate-800 bg-slate-50/50 p-3.5 text-center">
          <span className="block text-[11px] font-black text-slate-950">
            اعتماد الإدارة العامة
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold text-slate-700">
            محمد العتيبي
          </span>
          <div className="mt-4 flex h-8 items-center justify-center border border-dashed border-slate-300 bg-white">
            <span className="text-[10px] font-bold text-slate-600">
              ( موضع الختم الرسمي للمصنع )
            </span>
          </div>
          <span className="mt-1 block text-[10px] font-bold text-slate-800">
            معتمد ونافذ تشغيلياً
          </span>
        </div>
      </div>
    </section>
  );
}
