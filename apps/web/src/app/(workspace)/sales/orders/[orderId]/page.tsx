import { SalesOrderDetailView } from "@/features/sales/screens/sales-order-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <SalesOrderDetailView orderId={orderId} />;
}
