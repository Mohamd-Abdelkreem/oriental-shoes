import { Suspense } from "react";
import { PrintReportView } from "@/features/printing/screens/print-views";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل التقرير…</p>}>
      <PrintReportView />
    </Suspense>
  );
}
