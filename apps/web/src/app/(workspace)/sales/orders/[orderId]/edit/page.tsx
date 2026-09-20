import { SalesCreateOrderView } from "@/features/sales/screens/sales-create-order-view";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <SalesCreateOrderView orderId={orderId} />;
}
