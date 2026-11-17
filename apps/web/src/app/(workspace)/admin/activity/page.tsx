import { Suspense } from "react";
import { AdminActivityView } from "@/features/administration/screens/admin-activity-view";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل السجل…</p>}>
      <AdminActivityView />
    </Suspense>
  );
}
