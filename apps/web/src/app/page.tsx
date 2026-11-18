import type { Metadata } from "next";

import { FactoryLandingPage } from "@/features/landing/components/factory-landing-page";

export const metadata: Metadata = {
  title: { absolute: "مصنع الحذاء الشرقي | Oriental Shoes" },
  description:
    "تعرّف على نظام مصنع الحذاء الشرقي لإدارة طلبات تصنيع الأحذية، من أمر التفصيل إلى التسليم، وادخل إلى مساحة عملك.",
};

export default function HomePage() {
  return <FactoryLandingPage />;
}
