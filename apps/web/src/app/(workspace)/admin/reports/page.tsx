import { Suspense } from "react";
import { AdminReportsView } from "@/features/administration/screens/admin-reports-view";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل التقرير…</p>}>
      <AdminReportsView />
    </Suspense>
  );
}
