import { PrintOrderView } from "@/features/printing/screens/print-views";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PrintOrderView orderId={orderId} />;
}
