import { Suspense } from "react";
import { AdminApprovalsView } from "@/features/administration/screens/admin-approvals-view";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل السجل…</p>}>
      <AdminApprovalsView />
    </Suspense>
  );
}
