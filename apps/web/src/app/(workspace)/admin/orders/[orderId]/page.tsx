import { AdminOrderDetailView } from "@/features/administration/screens/admin-order-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <AdminOrderDetailView orderId={orderId} />;
}
