import Link from "next/link";
import { OrientalStatusPage } from "@/components/brand/oriental-status-page";

export default function NotFound() {
  return (
    <OrientalStatusPage
      code="٤٠٤"
      title="الصفحة غير موجودة"
      description="تحقّق من عنوان الصفحة أو ارجع إلى الصفحة الرئيسية."
    >
      <Link href="/">العودة إلى الصفحة الرئيسية</Link>
    </OrientalStatusPage>
  );
}
