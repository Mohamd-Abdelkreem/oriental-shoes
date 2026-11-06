import { SalesCreateOrderView } from "@/features/sales/screens/sales-create-order-view";
import { parseDraftEntry } from "@/features/sales/model/draft-form.model";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <SalesCreateOrderView entry={parseDraftEntry({}, orderId)} />;
}
