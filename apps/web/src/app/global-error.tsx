"use client";

import { OrientalStatusPage } from "@/components/brand/oriental-status-page";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0 }}>
        <OrientalStatusPage
          title="تعذّر تحميل الصفحة"
          description="حدث خطأ أثناء تحميل الصفحة. حاول فتحها مرة أخرى."
        >
          <button type="button" onClick={reset}>
            إعادة المحاولة
          </button>
        </OrientalStatusPage>
      </body>
    </html>
  );
}
