import { Suspense } from "react";
import { AdminCorrectionsView } from "@/features/administration/screens/admin-corrections-view";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل السجل…</p>}>
      <AdminCorrectionsView />
    </Suspense>
  );
}
