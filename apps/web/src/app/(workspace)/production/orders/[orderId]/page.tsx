import { ManufacturingOrderDetailView } from "@/features/manufacturing/screens/manufacturing-order-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <ManufacturingOrderDetailView orderId={orderId} deptRole="production" />
  );
}
