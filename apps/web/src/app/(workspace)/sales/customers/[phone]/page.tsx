import { SalesCustomerDetailView } from "@/features/sales/screens/sales-customer-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ phone: string }>;
}) {
  const { phone } = await params;
  return <SalesCustomerDetailView customerId={phone} />;
}
