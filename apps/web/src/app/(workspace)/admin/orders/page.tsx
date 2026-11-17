import { Suspense } from "react";
import { AdminAllOrdersView } from "@/features/administration/screens/admin-all-orders-view";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل الطلبات…</p>}>
      <AdminAllOrdersView />
    </Suspense>
  );
}
