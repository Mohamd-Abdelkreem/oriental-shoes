import { SalesAllOrdersView } from "@/features/sales/screens/sales-all-orders-view";
import { parseSalesOrderListEntry } from "@/features/sales/model/order-form.model";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const entry = parseSalesOrderListEntry((await searchParams).status);
  const entryKey =
    entry.kind === "invalid" ? "invalid" : `${entry.kind}:${entry.status}`;
  return <SalesAllOrdersView key={entryKey} entry={entry} />;
}
