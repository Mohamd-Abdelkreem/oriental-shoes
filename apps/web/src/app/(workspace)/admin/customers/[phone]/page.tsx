import { AdminCustomerDetailView } from "@/features/administration/screens/admin-customer-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ phone: string }>;
}) {
  const { phone } = await params;
  return <AdminCustomerDetailView customerId={phone} />;
}
