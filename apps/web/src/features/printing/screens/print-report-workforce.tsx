import {
  roleLabels,
  type MvpEmployee,
  type MvpOrder,
  type Role,
} from "@/features/prototype/state/mvp-store";
import type { ReportSummary } from "./report-summary";

type EmployeeRoleDefinition = {
  title: string;
  workload: (
    employee: MvpEmployee,
    orders: MvpOrder[],
    summary: ReportSummary,
  ) => string;
};

const employeeRoleDefinitions: Record<Role, EmployeeRoleDefinition> = {
  admin: {
    title: "مدير عام النظام والرقابة",
    workload: () => "الإشراف المركزي والاعتمادات الإدارية",
  },
  sales: {
    title: "مسؤول مبيعات واستقبال طلبات",
    workload: (employee, orders) =>
      `متابعة ${String(orders.filter((order) => order.salesperson === employee.name).length)} أمر تفصيل مع العملاء`,
  },
  approval: {
    title: "مسؤول اعتماد المواصفات والأسعار",
    workload: () => "مراجعة واعتماد الطلبات قبل الإنتاج",
  },
  cutting: {
    title: "فني ومسؤول ورشة القص والتفصيل",
    workload: (_employee, _orders, summary) =>
      `تشغيل وتفصيل الجلود بالمقصدار (${String(summary.cuttingPieces)} قطعة)`,
  },
  production: {
    title: "مشرف خطوط التجميع والشد",
    workload: (_employee, _orders, summary) =>
      `إدارة خطوط التركيب (${String(summary.productionPieces)} قطعة)`,
  },
  quality: {
    title: "مشرفة ضبط الجودة والتغليف",
    workload: (_employee, _orders, summary) =>
      `فحص المعايير وإجازة التغليف (${String(summary.qualityPieces)} قطعة)`,
  },
  warehouse: {
    title: "أمينة المستودع والشحن اللوجستي",
    workload: (_employee, _orders, summary) =>
      `إدارة المستودع والتسليم (${String(summary.warehousePieces)} قطعة جاهزة)`,
  },
};

export function ReportWorkforce({
  employees,
  orders,
  summary,
}: {
  employees: MvpEmployee[];
  orders: MvpOrder[];
  summary: ReportSummary;
}) {
  const activeEmployeeCount = employees.filter(
    (employee) => employee.status === "فعال",
  ).length;
  return (
    <section className="print-avoid-break mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ٣. كشف طاقم العمل وتوزيع القوى العاملة بالمنشأة ({activeEmployeeCount}{" "}
          موظف فعال)
        </h3>
        <span className="text-[11px] text-slate-500">
          سجل رسمي بمسؤولي الأقسام والمهام التشغيلية
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-right font-bold text-slate-900">
              <th className="px-3 py-2.5">الموظف والمسمى الوظيفي</th>
              <th className="px-3 py-2.5">القسم / الورشة</th>
              <th className="px-3 py-2.5 text-center">هاتف التواصل</th>
              <th className="px-3 py-2.5">نطاق المسؤولية التشغيلية</th>
              <th className="px-3 py-2.5 text-center">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white leading-relaxed">
            {employees.map((employee, employeeIndex) => (
              <ReportEmployeeRow
                key={employee.email || employeeIndex}
                employee={employee}
                orders={orders}
                summary={summary}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportEmployeeRow({
  employee,
  orders,
  summary,
}: {
  employee: MvpEmployee;
  orders: MvpOrder[];
  summary: ReportSummary;
}) {
  const roleLabel = roleLabels[employee.role ?? employee.requested];
  const definition = employee.role
    ? employeeRoleDefinitions[employee.role]
    : undefined;
  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-3 py-2.5">
        <strong className="block text-slate-900">{employee.name}</strong>
        <span className="text-[11px] text-slate-500">
          {definition?.title ?? "موظف تشغيلي"}
        </span>
      </td>
      <td className="px-3 py-2.5 font-semibold text-slate-800">{roleLabel}</td>
      <td
        className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-700"
        dir="ltr"
      >
        {employee.phone || "—"}
      </td>
      <td className="px-3 py-2.5 text-slate-600">
        {definition?.workload(employee, orders, summary) ?? "متابعة وإشراف عام"}
      </td>
      <td className="px-3 py-2.5 text-center font-semibold">
        {employee.status === "فعال" ? (
          <span className="text-slate-800">فعال</span>
        ) : (
          <span className="text-slate-500">{employee.status}</span>
        )}
      </td>
    </tr>
  );
}
