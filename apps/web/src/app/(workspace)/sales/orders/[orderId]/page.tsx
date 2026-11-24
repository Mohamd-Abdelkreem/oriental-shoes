import { SalesOrderDetailView } from "@/features/sales/screens/sales-order-detail-view";
import { SalesProblemContactView } from "@/features/sales/screens/sales-problem-contact-view";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ contact?: string | string[] }>;
}) {
  const [{ orderId }, { contact }] = await Promise.all([params, searchParams]);
  if (typeof contact === "string")
    return <SalesProblemContactView orderId={orderId} issueId={contact} />;
  return <SalesOrderDetailView orderId={orderId} />;
}
