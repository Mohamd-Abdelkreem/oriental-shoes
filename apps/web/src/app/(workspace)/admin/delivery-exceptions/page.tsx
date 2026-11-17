import { Suspense } from "react";
import { AdminDeliveryExceptionsView } from "@/features/administration/screens/admin-delivery-exceptions-view";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل السجل…</p>}>
      <AdminDeliveryExceptionsView />
    </Suspense>
  );
}
