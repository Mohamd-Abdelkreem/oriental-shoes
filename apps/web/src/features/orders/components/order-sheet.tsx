"use client";

import { paperCellText } from "@/features/orders/paper/paper-cell-text";

import {
  OrderPaperForm,
  type OrderPaperMode,
} from "@/features/orders/components/order-paper-form";
import { Ltr } from "@/features/prototype/components/shared-ui";
import {
  useMvpStore,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";
import { notFound, usePathname } from "next/navigation";

type OrderSheetProps = { mode?: OrderPaperMode; orderId?: string };

export function OrderSheet({
  orderId = "SHOP-2026-0001",
  mode = "readOnly",
}: OrderSheetProps) {
  const store = useMvpStore();
  const pathname = usePathname();
  const order =
    store.orders.find((candidate) => candidate.id === orderId) ??
    store.orders[0] ??
    notFound();
  const department = [
    "cutting",
    "production",
    "special-operations",
    "quality",
    "warehouse",
  ].find((candidate) => pathname.startsWith(`/${candidate}/`));
  if (department)
    return <DepartmentOrderSheet department={department} orderId={order.id} />;
  return <OrderPaperForm order={order} mode={mode} />;
}

function DepartmentOrderSheet({
  department,
  orderId,
}: {
  department: string;
  orderId: string;
}) {
  const store = useMvpStore();
  const order =
    store.orders.find((candidate) => candidate.id === orderId) ??
    store.orders[0] ??
    notFound();
  const labels: { key: keyof ProductLine; label: string }[] =
    department === "cutting"
      ? [
          { key: "model", label: "الموديل" },
          { key: "size", label: "المقاس" },
          { key: "leatherBase", label: "أساس الجلد" },
          { key: "decoration", label: "التطعيم" },
          { key: "decorationColor", label: "لون التطعيم" },
          { key: "sole", label: "الأرضية" },
        ]
      : department === "production"
        ? [
            { key: "model", label: "الموديل" },
            { key: "size", label: "المقاس" },
            { key: "faceRight", label: "م١" },
            { key: "faceLeft", label: "م٢" },
            { key: "mixing", label: "م٣" },
            { key: "face", label: "الوجه" },
            { key: "additions", label: "الإضافات" },
          ]
        : [
            { key: "model", label: "الموديل" },
            { key: "size", label: "المقاس" },
            { key: "face", label: "مواصفات المنتج" },
            { key: "sideNotes", label: "تعليمات القسم" },
          ];
  return (
    <section className="department-sheet">
      <div>
        <p className="eyebrow">عرض معزول حسب القسم</p>
        <h3>المعلومات اللازمة لتنفيذ المهمة فقط</h3>
        <p>
          <Ltr>{order.id}</Ltr> ·{" "}
          {order.type === "REPAIR" ? "طلب إصلاح" : "طلب تصنيع"} · التسليم{" "}
          {order.delivery}
        </p>
      </div>
      <div className="sheet-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>كمية الطلب</th>
              {labels.map(({ key, label }) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.items.map((line) => (
              <tr key={line.id}>
                <td>
                  <Ltr>{line.id}</Ltr>
                </td>
                <td>{line.quantity}</td>
                {labels.map(({ key }) => (
                  <td key={key}>{paperCellText(line[key]) || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
