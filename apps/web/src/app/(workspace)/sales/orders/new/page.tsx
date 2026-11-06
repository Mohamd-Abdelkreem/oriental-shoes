import { SalesCreateOrderView } from "@/features/sales/screens/sales-create-order-view";
import { parseOrderEditorEntry } from "@/features/sales/model/order-form.model";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string | string[];
    customer?: string | string[];
  }>;
}) {
  return (
    <SalesCreateOrderView entry={parseOrderEditorEntry(await searchParams)} />
  );
}
