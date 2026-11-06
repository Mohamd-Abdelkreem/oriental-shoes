import { SalesAllOrdersView } from "@/features/sales/screens/sales-all-orders-view";
import { parseDraftListEntry } from "@/features/sales/model/draft-form.model";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const entry = parseDraftListEntry((await searchParams).status);
  const entryKey =
    entry.kind === "invalid" ? "invalid" : `${entry.kind}:${entry.status}`;
  return <SalesAllOrdersView key={entryKey} entry={entry} />;
}
