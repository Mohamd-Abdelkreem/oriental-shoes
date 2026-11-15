import { Suspense } from "react";
import { ManufacturingOrderDetailView } from "@/features/manufacturing/screens/manufacturing-order-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل أمر التفصيل…</p>}>
      <ManufacturingOrderDetailView orderId={orderId} deptRole="warehouse" />
    </Suspense>
  );
}
