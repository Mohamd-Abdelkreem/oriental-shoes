import { SalesCustomerEditView } from "@/features/sales/screens/sales-customer-edit-view";

export default async function Page({
  params,
}: {
  params: Promise<{ phone: string }>;
}) {
  const { phone } = await params;
  return <SalesCustomerEditView customerId={phone} />;
}
