import { SalesCreateOrderView } from "@/features/sales/screens/sales-create-order-view";
import { parseDraftEntry } from "@/features/sales/model/draft-form.model";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string | string[];
    customer?: string | string[];
  }>;
}) {
  return <SalesCreateOrderView entry={parseDraftEntry(await searchParams)} />;
}
