import { SalesCreateOrderView } from "@/features/sales/screens/sales-create-order-view";
import { parseOrderEditorEntry } from "@/features/sales/model/order-form.model";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <SalesCreateOrderView entry={parseOrderEditorEntry({}, orderId)} />;
}
