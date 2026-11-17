import type { AdministrationReportPrintData } from "@template/contracts";
import { toAdministrationDepartmentRows } from "@/features/administration/model/administration-report.model";

const departmentsLabels = {
  SALES: "المبيعات",
  APPROVAL: "الاعتماد",
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  WAREHOUSE: "المستودع",
};
const statusLabels = {
  PENDING_VERIFICATION: "بانتظار التحقق",
  PENDING_APPROVAL: "بانتظار الموافقة",
  REJECTED: "مرفوض",
  ACTIVE: "فعال",
  SUSPENDED: "موقوف",
};
export function ReportWorkforce({
  workforce,
  departments,
}: {
  workforce: AdministrationReportPrintData["workforce"];
  departments: AdministrationReportPrintData["departments"];
}) {
  const context = toAdministrationDepartmentRows(departments);
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ٣. دليل الموظفين الحالي ({workforce.activeStaff} موظف فعال من{" "}
          {workforce.totalStaff})
        </h3>
        <span className="text-[11px] text-slate-500">
          {workforce.scope.department === null
            ? "جميع الأقسام"
            : departmentsLabels[workforce.scope.department]}{" "}
          — مستقل عن فلاتر الطلبات الأخرى
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full table-fixed border-collapse text-xs wrap-anywhere">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-right font-bold text-slate-900">
              <th className="px-3 py-2.5">الموظف والدور الحالي</th>
              <th className="px-3 py-2.5">القسم / الورشة</th>
              <th className="px-3 py-2.5 text-center">هاتف التواصل</th>
              <th className="px-3 py-2.5">
                سياق القسم المشترك، وليس إنتاجية الموظف
              </th>
              <th className="px-3 py-2.5 text-center">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white leading-relaxed">
            {workforce.items.map((employee) => (
              <tr key={employee.id} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5">
                  <strong className="block text-slate-900">
                    {employee.fullName}
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    {employee.role === "ADMIN" ? "الإدارة العامة" : "موظف"}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">
                  {employee.department === null
                    ? "غير معيّن لقسم"
                    : departmentsLabels[employee.department]}
                </td>
                <td
                  className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-700"
                  dir="ltr"
                >
                  {employee.phone ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {context.find(
                    (department) => department.key === employee.department,
                  )?.pieces ?? "—"}{" "}
                  قطعة في سياق القسم من نطاق الطلبات؛ لا تمثل عملاً شخصياً
                </td>
                <td className="px-3 py-2.5 text-center font-semibold">
                  {statusLabels[employee.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {workforce.items.length === 0 && (
          <p className="p-3 text-xs">لا يوجد موظفون في نطاق الدليل الحالي.</p>
        )}
      </div>
    </section>
  );
}
